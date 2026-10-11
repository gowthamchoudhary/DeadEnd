"""Claude Code adapter for DeadEnd.

Docs (fetched 2026-10-11, not guessed):
  - headless/CLI:            https://code.claude.com/docs/en/headless
  - hooks:                   https://code.claude.com/docs/en/hooks
  - MCP config:              https://code.claude.com/docs/en/mcp
  - memory/instruction file: https://code.claude.com/docs/en/memory
  - Entire integration:      https://docs.entire.io/agents/claude-code

Verified facts used here:
  - `claude -p "<prompt>"` runs one headless session and exits; the
    recommended automation invocation is
    `claude -p "query" --output-format stream-json --verbose`.
    The Agent SDK defaults to 10 tool-use turns; use `--max-turns`
    for extended agentic tasks. JSON mode exposes structured result
    events (init includes model + permission mode; result events
    include usage and permission_denials).
  - Project memory file: CLAUDE.md at the project root.
  - Project MCP servers: .mcp.json (project root).
  - Hooks: .claude/settings.json (SessionStart, UserPromptSubmit,...).
  - Entire `entire enable --agent claude-code` writes .claude/settings.json
    capturing session boundaries, prompts, turns, transcript, tokens.
"""
import json
from .base import (AgentAdapter, Capabilities, Limits, RunResult,
                   context_block, strip_block, upsert_block, which)


class ClaudeCodeAdapter(AgentAdapter):
    AGENT = "claude-code"
    CAPS = Capabilities(
        headless=True,
        mcp=True,
        hooks=True,
        tokens_reported="json_events",
        turn_limit_flag="--max-turns",
        instruction_file="CLAUDE.md",
    )

    def detect(self) -> bool:
        return which("claude") is not None

    def auth_status(self) -> str:
        # Never inspects credentials; reports only what `claude` itself
        # reports. No documented `claude auth status` flag to parse, so
        # presence of the binary = "unknown" until a run is attempted.
        return "ok" if self.detect() else "unknown"

    def inject_context(self, workdir: str, context_pack: dict) -> None:
        upsert_block(f"{workdir}/CLAUDE.md", context_block(context_pack))

    def cleanup(self, workdir: str) -> None:
        strip_block(f"{workdir}/CLAUDE.md")

    def build_command(self, task: str, workdir: str, context_pack: dict,
                      limits: Limits) -> list[str]:
        prompt = _render_prompt(task, context_pack)
        cmd = ["claude", "-p", prompt,
               "--output-format", "json",
               "--max-turns", str(limits.max_turns)]
        if task.strip().endswith(".md"):
            pass  # prompt passed inline, not as an angle-bracket file arg
        return cmd

    def parse_result(self, stdout: str, stderr: str,
                     returncode: int) -> RunResult:
        """Claude Code `-p --output-format json` emits either one JSON
        object or JSONL lines. Extract model + usage from result events."""
        res = RunResult(status="success" if returncode == 0 else "failure",
                        text="")  # filled below
        obj = None
        for line in (stdout or "").splitlines():
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                cand = json.loads(line)
            except ValueError:
                continue
            # If a big dict, use directly; if a list of events, scan
            if isinstance(cand, dict):
                obj = cand if obj is None else obj  # keep first dict
                if cand.get("type") == "result" or "usage" in cand:
                    obj = cand
            elif isinstance(cand, list):
                for ev in cand:
                    if isinstance(ev, dict) and ev.get("type") == "result":
                        obj = ev
        if obj:
            usage = obj.get("usage") or {}
            if isinstance(usage, dict):
                res.tokens_in = usage.get("input_tokens") or usage.get("prompt_tokens") or _sum(usage.get("input_tokens") if isinstance(usage.get("input_tokens"), list) else None)
                res.tokens_out = usage.get("output_tokens") or usage.get("completion_tokens")
            res.model = obj.get("model") if isinstance(obj.get("model"), str) else None
            res.text = str(obj.get("result") or obj.get("text") or "")[:4000]
            res.raw = {"session_id": obj.get("session_id"),
                       "num_turns": obj.get("num_turns"),
                       "_is_error": obj.get("is_error")}
            if obj.get("is_error"):
                res.status = "failure"
            rc_txt = {"success": "success", "error_denied": "failure",
                      "error_max_turns": "failure",
                      "error_during_execution": "error"}.get(
                          str(obj.get("subtype")), None)
            if rc_txt:
                res.status = rc_txt
        else:
            res.text = (stdout or stderr or "")[-4000:]
        if returncode not in (0, None):
            if res.status == "success":
                res.status = "failure" if res.text else "error"
        return res


def _sum(v) -> int | None:
    if isinstance(v, list):
        try:
            return sum(x for x in v if isinstance(x, int))
        except Exception:
            return None
    return None


def _render_prompt(task: str, context_pack: dict) -> str:
    """Context pack is duplicated in the prompt (headless allows it) and
    injected into CLAUDE.md by inject_context() before the run."""
    dead_ends = context_pack.get("dead_ends") or []
    constraints = context_pack.get("constraints") or []
    fixes = context_pack.get("fixes") or []
    lines = [
        task,
        "",
        "DeadEnd context (data, already sanitized):",
        f"dead_ends: {json.dumps(dead_ends) if dead_ends else 'none'}",
        f"constraints: {json.dumps(constraints) if constraints else 'none'}",
        f"known_fixes: {json.dumps(fixes) if fixes else 'none'}",
        "",
        "Work only inside the current directory. Do not repeat the",
        "listed dead ends. Finish only when the tests pass.",
    ]
    return "\n".join(lines)
