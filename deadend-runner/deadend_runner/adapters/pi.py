"""Pi adapter for DeadEnd.

Docs (fetched 2026-10-11, not guessed):
  - CLI integration / print + JSON modes: https://pi.dev/docs/latest/cli-integration
  - CLI reference:                        https://pi.dev/docs/latest/cli
  - JSON event stream:                    https://pi.dev/docs/latest/json
  - MCP servers (.pi/mcp.json):           https://pi.dev/docs/latest/mcp
  - extensions (event hooks):             https://pi.dev/docs/latest/extensions
  - Entire integration:                   https://docs.entire.io/agents/pi

Verified facts used here:
  - Headless one-shot: `pi --print "<prompt>"` ("Print mode runs the
    supplied prompts, writes the final assistant text to stdout, and
    exits"); add `--no-session` for ephemeral runs.
    Structured: `pi --mode json --no-session "<prompt>" > events.jsonl`
    streams JSONL events (message_start, message_update, message_end,
    turn_end, agent_end, agent_settled). `message_update.usage` carries
    provider-reported usage (input, output, cacheRead, cacheWrite,
    totalTokens, cost); `message_end.message` metadata carries the
    producing provider + model. NO documented max-turn flag; runner
    enforces the wall clock.
  - Context files: AGENTS.md / CLAUDE.md discovery (disabled with
    --no-context-files); SYSTEM.md / APPEND_SYSTEM.md project+global.
  - Project MCP: .pi/mcp.json (mcpServers, JSON) — read only after the
    project is trusted.
  - Hooks: extension lifecycle via pi.on() events, not hook JSON files.
  - Entire `entire enable --agent pi` writes .pi/extensions/entire/index.ts.
"""
import json
import re
from .base import (AgentAdapter, Capabilities, Limits, RunResult,
                   context_block, strip_block, upsert_block, which)


class PiAdapter(AgentAdapter):
    AGENT = "pi"
    CAPS = Capabilities(
        headless=True,
        mcp=True,
        hooks=True,                      # via extensions, not hook files
        tokens_reported="json_events",
        turn_limit_flag=None,           # none documented
        instruction_file="AGENTS.md",
    )

    def detect(self) -> bool:
        return which("pi") is not None

    def auth_status(self) -> str:
        # Pi stores provider credentials in its own config; DeadEnd never
        # reads them. Missing auth surfaces at run time as a JSONL error.
        return "ok" if self.detect() else "unknown"

    def inject_context(self, workdir: str, context_pack: dict) -> None:
        upsert_block(f"{workdir}/AGENTS.md", context_block(context_pack))

    def cleanup(self, workdir: str) -> None:
        strip_block(f"{workdir}/AGENTS.md")

    def build_command(self, task: str, workdir: str, context_pack: dict,
                      limits: Limits) -> list[str]:
        prompt = _render_prompt(task, context_pack)
        return ["pi", "--mode", "json", "--no-session", prompt]

    def parse_result(self, stdout: str, stderr: str,
                     returncode: int) -> RunResult:
        """Pi --mode json JSONL: usage on message_update; final message +
        provider/model on message_end; agent_settled = done."""
        res = RunResult(status="success" if returncode == 0 else "failure")
        tokens_in = tokens_out = None
        model = None
        message_text: list[str] = []

        def _take_message(msg: dict) -> None:
            nonlocal tokens_in, tokens_out, model
            if not isinstance(msg, dict):
                return
            if model is None and isinstance(msg.get("model"), str):
                model = msg["model"]
            usage = msg.get("usage") if isinstance(msg.get("usage"), dict) else {}
            if isinstance(usage.get("input"), int):
                tokens_in = usage["input"]
            if isinstance(usage.get("output"), int):
                tokens_out = usage["output"]
            content = msg.get("content")
            if isinstance(content, str):
                message_text.append(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and isinstance(part.get("text"), str):
                        message_text.append(part["text"])

        for line in (stdout or "").splitlines():
            s = line.strip()
            if not s.startswith("{"):
                continue
            try:
                ev = json.loads(s)
            except ValueError:
                continue
            if not isinstance(ev, dict):
                continue
            etype = ev.get("type", "")
            if etype == "message_update" and isinstance(ev.get("usage"), dict):
                u = ev["usage"]
                if isinstance(u.get("input"), int):
                    tokens_in = u["input"]
                if isinstance(u.get("output"), int):
                    tokens_out = u["output"]
            elif etype == "message_end":
                _take_message(ev.get("message") or {})
            elif etype == "error":
                res.raw["stream_error"] = str(ev.get("error") or ev)[:300]
        res.tokens_in = tokens_in
        res.tokens_out = tokens_out
        res.model = model
        res.text = "".join(message_text)[-4000:]
        if returncode != 0 or not res.text:
            res.status = "failure" if returncode != 0 else res.status
            if not res.text:
                res.text = (stderr or stdout or "")[-4000:]
        return res


def _render_prompt(task: str, context_pack: dict) -> str:
    dead_ends = context_pack.get("dead_ends") or []
    constraints = context_pack.get("constraints") or []
    fixes = context_pack.get("fixes") or []
    lines = [
        task,
        "",
        "DeadEnd context (data, already sanitized):",
        ("dead_ends (do not repeat): "
         f"{json.dumps(dead_ends) if dead_ends else 'none'}"),
        f"constraints: {json.dumps(constraints) if constraints else 'none'}",
        f"known_fixes: {json.dumps(fixes) if fixes else 'none'}",
        "",
        "Stay inside the current directory; finish only when tests pass.",
    ]
    return "\n".join(lines)
