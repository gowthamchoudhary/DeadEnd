"""GitHub Copilot CLI (`copilot`) adapter for DeadEnd.

Docs (fetched 2026-10-11, not guessed):
  - programmatic reference (-p, --output-format json, tools):
      https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
  - autopilot / turn-like limits:
      https://docs.github.com/en/copilot/concepts/agents/copilot-cli/autopilot
  - custom instructions (AGENTS.md, CLAUDE.md, .github/copilot-instructions.md):
      https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions
  - MCP servers (.mcp.json / .github/mcp.json):
      https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
  - hooks (.github/hooks/*.json; prompt hooks do NOT fire in -p mode):
      https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks
  - Entire integration: https://docs.entire.io/agents/copilot-cli

Verified facts used here:
  - Headless: `copilot -p "<prompt>"` runs non-interactive and exits.
    Documented autonomous example:
    `copilot --autopilot --yolo --max-autopilot-continues 10 -p "..."`.
    Autopilot defaults to five auto-continuations; --max-autopilot-continues
    is the documented turn-like cap. Tools: --allow-tool/--deny-tool/
    --allow-all-tools; model: --model=<slug>; output: --output-format=json
    (JSONL, one JSON object per line) — the fetched reference does not
    document the JSONL event schema or usage fields, so token reporting
    is treated as UNVERIFIED, not asserted.
  - Instructions: project AGENTS.md and CLAUDE.md are both loaded
    (no documented cross-file precedence).
  - Project MCP: .mcp.json ({"mcpServers": {...}} JSON).
  - Hooks: .github/hooks/*.json; NOTE: prompt hooks (preToolUse/
    postToolUse on prompt turns) do not fire in -p mode.
  - Entire `entire enable --agent copilot-cli` writes .github/hooks/entire.json.
"""
import json
from .base import (AgentAdapter, Capabilities, Limits, RunResult,
                   context_block, strip_block, upsert_block, which)


class CopilotCLIAdapter(AgentAdapter):
    AGENT = "copilot-cli"
    CAPS = Capabilities(
        headless=True,
        mcp=True,
        hooks=True,          # but prompt hooks do NOT fire in -p mode
        tokens_reported="not_reported",  # JSONL schema not documented
        turn_limit_flag="--max-autopilot-continues",
        instruction_file="AGENTS.md",
    )

    def detect(self) -> bool:
        return which("copilot") is not None

    def auth_status(self) -> str:
        # `copilot login` manages GitHub auth (gh host flow); DeadEnd
        # never reads the token store. Binary presence is the check.
        return "ok" if self.detect() else "unknown"

    def inject_context(self, workdir: str, context_pack: dict) -> None:
        upsert_block(f"{workdir}/AGENTS.md", context_block(context_pack))

    def cleanup(self, workdir: str) -> None:
        strip_block(f"{workdir}/AGENTS.md")

    def build_command(self, task: str, workdir: str, context_pack: dict,
                      limits: Limits) -> list[str]:
        prompt = _render_prompt(task, context_pack)
        cmd = ["copilot", "--autopilot", "--allow-all-tools",
               "--no-ask-user",
               "--max-autopilot-continues", str(limits.max_turns),
               "--output-format", "json",
               "-p", prompt]
        return cmd

    def parse_result(self, stdout: str, stderr: str,
                     returncode: int) -> RunResult:
        """--output-format json is documented as JSONL; its event schema
        is NOT documented, so parse defensively across common shapes and
        never invent token numbers."""
        res = RunResult(status="success" if returncode == 0 else "failure")
        parts: list[str] = []
        model = None
        usage = {}
        raw_events = []
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
            raw_events.append(ev)
            if model is None and isinstance(ev.get("model"), str):
                model = ev["model"]
            u = ev.get("usage") if isinstance(ev.get("usage"), dict) else {}
            if "total_tokens" in u or "input_tokens" in u or \
               "prompt_tokens" in u or "completion_tokens" in u:
                usage = u
            for key in ("text", "response", "message", "content"):
                v = ev.get(key)
                if isinstance(v, str) and v.strip():
                    parts.append(v)
            if str(ev.get("type", "")).endswith("error") or \
                    ev.get("is_error") is True:
                res.raw["error"] = str(ev.get("error") or ev)[:300]
        res.model = model
        res.tokens_in = (usage.get("input_tokens") or
                         usage.get("prompt_tokens")) if usage else None
        res.tokens_out = (usage.get("output_tokens") or
                          usage.get("completion_tokens")) if usage else None
        res.text = "".join(parts)[-4000:]
        res.raw["jsonl_event_count"] = len(raw_events)
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
