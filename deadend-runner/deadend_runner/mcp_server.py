"""DeadEnd stdio MCP server (`deadend-mcp`) — runs on the USER'S machine.

Lets any agent (run by hand, not via the runner) read DeadEnd context
and report runs. Tools (JSON-RPC 2.0 over stdio, no headers, no
sessions — plain newline-free framed responses):
  deadend_retrieve(error_text, env_fingerprint, task)
      -> {results:[{entry_id, dead_ends, constraints, fix, confidence}]}
  deadend_record_attempt(run_id, phase, payload)
  deadend_record_fix(run_id, fix, verified)
  deadend_report_reuse(entry_id, run_id, outcome)
  deadend_promote_preview(entry_id, team_id)
      -> {contribution_id, diff}

Auth: only the USER'S DeadEnd token (DEADEND_TOKEN) is attached to
backend calls. Agent credentials the host process may hold are never
read, logged, or forwarded — the server strips everything except the
explicit tool arguments before talking to the backend.

Implements the MCP stdio transport as documented for agents:
  - Claude Code:      `.mcp.json` mcpServers entry (command/args)
                      https://code.claude.com/docs/en/mcp
  - Codex:            `.codex/config.toml` [mcp_servers.<name>]
                      https://developers.openai.com/codex/config
  - OpenCode:         `opencode.json` mcp key, {"type":"local",
                      "command":[...]} https://opencode.ai/docs/mcp-servers/
  - Pi:               `.pi/mcp.json` mcpServers
                      https://pi.dev/docs/latest/mcp
  - Antigravity:      `.agents/mcp_config.json` mcpServers
                      https://antigravity.google/docs/mcp/
  - Copilot CLI:      `.mcp.json` mcpServers
                      https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers

MCP framing: newline-delimited JSON-RPC over stdio (the `json` content
type with line-separated messages is what every listed client accepts
for a stdio server binary).
"""
import json
import sys

from .client import Backend

SERVER_INFO = {"name": "deadend-mcp", "version": "0.2.0"}

TOOLS = [
    {"name": "deadend_retrieve",
     "description": ("Retrieve verified dead ends, constraints and known "
                     "fixes for an error/task from DeadEnd (team + global)."),
     "inputSchema": {"type": "object", "properties": {
         "error_text": {"type": "string"},
         "env_fingerprint": {"type": "object"},
         "task": {"type": "string"}},
         "required": ["error_text"]}},
    {"name": "deadend_record_attempt",
     "description": "Append a run event (an attempt/test/verify step).",
     "inputSchema": {"type": "object", "properties": {
         "run_id": {"type": "string"},
         "phase": {"type": "string",
                   "enum": ["plan", "retrieve", "attempt", "test",
                            "verify", "record", "retry"]},
         "payload": {"type": "object"}},
         "required": ["run_id", "phase"]}},
    {"name": "deadend_record_fix",
     "description": ("Record a fix for a run as a record-phase run event; "
                     "verified fixes can later be promoted with "
                     "deadend_promote_preview."),
     "inputSchema": {"type": "object", "properties": {
         "run_id": {"type": "string"},
         "task": {"type": "string"},
         "fix": {"type": "object"},
         "verified": {"type": "boolean"}},
         "required": ["run_id", "fix"]}},
    {"name": "deadend_report_reuse",
     "description": "Report whether a retrieved fix was reused (real outcome).",
     "inputSchema": {"type": "object", "properties": {
         "entry_id": {"type": "string"},
         "run_id": {"type": "string"},
         "outcome": {"type": "string", "enum": ["success", "failure"]}},
         "required": ["entry_id", "outcome"]}},
    {"name": "deadend_promote_preview",
     "description": ("Stage a verified private entry for global "
                     "promotion; returns the proposed diff for approval."),
     "inputSchema": {"type": "object", "properties": {
         "entry_id": {"type": "string"},
         "team_id": {"type": "string"}},
         "required": ["entry_id", "team_id"]}},
]


def _tool_call(name: str, args: dict, be: Backend) -> dict:
    if name == "deadend_retrieve":
        return be.retrieve(args.get("error_text", ""),
                           args.get("env_fingerprint", {}),
                           args.get("task", ""))
    if name == "deadend_record_attempt":
        return be.run_event(args["run_id"], args.get("phase", "attempt"),
                            args.get("payload", {}))
    if name == "deadend_record_fix":
        # ingest expects a trace/checkpoint body (curator runs server-side
        # with redaction + quarantine). Record the fix into the run event
        # log; promotion of entries goes through /promote (approval flow).
        return be.run_event(args["run_id"], "record",
                            {"fix": args.get("fix", {}),
                             "verified": bool(args.get("verified", False)),
                             "task": args.get("task", "")})
    if name == "deadend_report_reuse":
        return be.reuse(args["entry_id"], args.get("run_id", ""),
                        args.get("outcome", "success"))
    if name == "deadend_promote_preview":
        return be.promote_preview(args["entry_id"], args["team_id"])
    raise ValueError(f"unknown tool: {name}")


def _handle(req: dict, be: Backend) -> dict:
    method = req.get("method", "")
    rid = req.get("id")
    if method == "initialize":
        result = {"protocolVersion": req.get("params", {}).get(
                      "protocolVersion", "2024-11-05"),
                  "capabilities": {"tools": {}},
                  "serverInfo": SERVER_INFO}
    elif method == "notifications/initialized":
        return {}
    elif method == "tools/list":
        result = {"tools": TOOLS}
    elif method == "tools/call":
        params = req.get("params", {})
        try:
            payload = _tool_call(params.get("name", ""),
                                 params.get("arguments", {}) or {}, be)
        except (KeyError, ValueError) as ex:
            return {"jsonrpc": "2.0", "id": req.get("id"),
                    "error": {"code": -32602,
                              "message": str(ex)}}
        result = {"content": [{"type": "text", "text": json.dumps(payload)}],
                  "isError": False}
    elif method == "ping":
        result = {}
    else:
        return {"jsonrpc": "2.0", "id": rid,
                "error": {"code": -32601,
                          "message": f"method not found: {method}"}}
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def serve(stdin=sys.stdin, stdout=sys.stdout, backend=None) -> None:
    be = backend if backend is not None else Backend.from_env()
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except ValueError:
            _emit(stdout, {"jsonrpc": "2.0", "id": None,
                           "error": {"code": -32700, "message": "parse error"}})
            continue
        resp = _handle(req, be)
        if resp:  # notifications produce no response
            _emit(stdout, resp)


def _emit(stdout, obj: dict) -> None:
    stdout.write(json.dumps(obj) + "\n")
    stdout.flush()


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
