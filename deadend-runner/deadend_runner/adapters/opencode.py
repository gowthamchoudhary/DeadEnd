"""OpenCode adapter for DeadEnd.

Docs (fetched 2026-10-11, not guessed):
  - CLI / run / --format json: https://opencode.ai/docs/cli/
  - rules (AGENTS.md):         https://opencode.ai/docs/rules/
  - MCP servers (opencode.json): https://opencode.ai/docs/mcp-servers/
  - plugins (event hooks):     https://opencode.ai/docs/plugins/
  - Entire integration:        https://docs.entire.io/agents/opencode

Verified facts used here:
  - `opencode run "<message>"` is the documented non-interactive form.
    Flags: `--model provider/model`, `--agent`, `--auto` (auto-approve
    permissions not explicitly denied), `--format json` (raw JSON events).
    NO documented turn/step-limit flag for `run`; the runner enforces
    the 10-minute wall clock instead.
  - Instruction file: AGENTS.md (project AGENTS.md wins over CLAUDE.md).
  - Project MCP: opencode.json in the project root, key `mcp`, local
    servers as {"type": "local", "command": [...]} — JSON/JSONC.
  - Hooks: plugin event system (tool.execute.before/after, session.idle)
    — not JSON hook files.
  - Entire `entire enable --agent opencode` writes .opencode/plugins/entire.ts.
"""
import json
import os
from pathlib import Path
from .base import (AgentAdapter, Capabilities, Limits, RunResult,
                   context_block, strip_block, upsert_block, which)


class OpenCodeAdapter(AgentAdapter):
    AGENT = "opencode"
    CAPS = Capabilities(
        headless=True,
        mcp=True,
        hooks=True,                      # via plugins, not hook files
        tokens_reported="json_events",   # --format json raw JSON events
        turn_limit_flag=None,            # none documented for `run`
        instruction_file="AGENTS.md",
    )

    def detect(self) -> bool:
        return self._binary() is not None

    def _binary(self) -> str | None:
        """Resolve OpenCode's Windows npm shim to its native executable.

        Python's subprocess cannot launch a .cmd shim with shell=False.
        npm's OpenCode shim points at this executable, so call it directly
        when available and keep normal PATH resolution on other platforms.
        """
        binary = which("opencode")
        if not binary:
            return None
        if os.name == "nt" and binary.lower().endswith((".cmd", ".bat")):
            shim_dir = Path(binary).parent
            native = shim_dir / "node_modules" / "opencode-ai" / "bin" / "opencode.exe"
            if native.is_file():
                return str(native)
            return None
        return binary

    def auth_status(self) -> str:
        # `opencode auth login` manages provider creds; DeadEnd never
        # reads them. Binary presence is all we verify here.
        return "ok" if self.detect() else "unknown"

    def inject_context(self, workdir: str, context_pack: dict) -> None:
        upsert_block(f"{workdir}/AGENTS.md", context_block(context_pack))

    def cleanup(self, workdir: str) -> None:
        strip_block(f"{workdir}/AGENTS.md")

    def build_command(self, task: str, workdir: str, context_pack: dict,
                      limits: Limits) -> list[str]:
        prompt = _render_prompt(task, context_pack)
        return [self._binary() or "opencode", "run", "--auto", "--format", "json", prompt]

    def parse_result(self, stdout: str, stderr: str,
                     returncode: int) -> RunResult:
        """`opencode run --format json` emits raw JSON events (docs do not
        pin the event schema; parse defensively for usage/model fields)."""
        res = RunResult(status="success" if returncode == 0 else "failure")
        tokens_in = tokens_out = None
        model = None
        parts: list[str] = []
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
            if model is None and isinstance(ev.get("model"), str):
                model = ev["model"]
            if ev.get("modelID") and model is None:
                model = str(ev["modelID"])
            usage = ev.get("usage") if isinstance(ev.get("usage"), dict) else {}
            tokens_in = usage.get("inputTokens") or usage.get("input_tokens") or tokens_in
            tokens_out = usage.get("outputTokens") or usage.get("output_tokens") or tokens_out
            for key in ("text", "part", "delta", "content"):
                v = ev.get(key)
                if isinstance(v, str) and v.strip():
                    parts.append(v)
                elif isinstance(v, dict) and isinstance(v.get("text"), str):
                    parts.append(v["text"])
        res.tokens_in = tokens_in
        res.tokens_out = tokens_out
        res.model = model
        res.text = "".join(parts)[-4000:]
        if returncode != 0 or not res.text:
            res.status = "failure" if returncode != 0 else res.status
            if not res.text:
                res.text = (stderr or stdout or "")[-4000:]
        return res

    def stream_line(self, line: str) -> list[tuple[str, str]]:
        """Turn OpenCode's JSON event stream into short, readable updates.

        The raw JSON is still retained for parse_result; this view is only
        for the live terminal and VS Code activity panel.
        """
        try:
            ev = json.loads(line)
        except (TypeError, ValueError):
            return [("log", line.strip()[:500])] if line.strip() else []
        if not isinstance(ev, dict):
            return []
        kind = str(ev.get("type") or ev.get("event") or "").lower()
        part = ev.get("part") if isinstance(ev.get("part"), dict) else {}
        state = part.get("state") if isinstance(part.get("state"), dict) else {}
        if kind in ("text", "text_delta", "message"):
            value = part.get("text") or ev.get("text") or ev.get("delta")
            if isinstance(value, str) and value.strip():
                return [("assistant", value.strip()[:1200])]
        if kind in ("tool_use", "tool", "tool_start"):
            title = state.get("title") or part.get("name") or ev.get("name") or "tool"
            return [("tool", str(title)[:300])]
        if kind in ("tool_result", "tool_finish"):
            title = state.get("title") or part.get("name") or ev.get("name") or "tool"
            return [("tool_done", str(title)[:300])]
        if kind in ("step_start", "step_finish"):
            return [("status", "Model step started" if kind == "step_start"
                     else "Model step finished")]
        if kind == "error" or ev.get("error"):
            detail = ev.get("error") or part.get("text") or "OpenCode reported an error"
            return [("error", str(detail)[:500])]
        return []


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
