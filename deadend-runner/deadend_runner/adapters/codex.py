"""OpenAI Codex CLI adapter for DeadEnd.

Docs (fetched 2026-10-11, not guessed):
  - non-interactive mode:  https://developers.openai.com/codex/cli/start-noninteractive
  - CLI command reference: https://developers.openai.com/codex/cli/reference
  - config / MCP (TOML):   https://developers.openai.com/codex/config
  - hooks:                 https://developers.openai.com/codex/hooks
  - AGENTS.md:             https://developers.openai.com/codex/guides/agents-md
  - Entire integration:    https://docs.entire.io/agents/codex

Verified facts used here:
  - `codex exec "<task>"` is the documented non-interactive form.
    Sandbox flag: `--sandbox workspace-write` (defaults: read-only).
    Approval flag: `--ask-for-approval never` (or `--full-auto`,
    `--dangerously-bypass-approvals-and-sandbox`, `--yolo`).
    Model: `--model`/`-m`. `codex exec --json` emits JSONL:
    thread.started, turn.started, item.* / item.completed,
    turn.completed (with usage: input_tokens, cached_input_tokens,
    output_tokens, reasoning_output_tokens), turn.failed, error.
    There is NO documented --max-turns for codex exec; the runner's
    10-minute wall clock is the turn-cap substitute.
  - Instruction file: AGENTS.md (closest to cwd wins).
  - Project MCP: .codex/config.toml `[mcp_servers.<name>]` (TOML).
  - Hooks: .codex/hooks.json (SessionStart, Stop, PreToolUse...).
  - Entire `entire enable --agent codex` writes .codex/hooks.json.
"""
import json
import re
from .base import (AgentAdapter, Capabilities, Limits, RunResult,
                   context_block, strip_block, upsert_block, which)


class CodexAdapter(AgentAdapter):
    AGENT = "codex"
    CAPS = Capabilities(
        headless=True,
        mcp=True,
        hooks=True,
        tokens_reported="json_events",
        turn_limit_flag=None,          # none documented for codex exec
        instruction_file="AGENTS.md",
    )

    def detect(self) -> bool:
        return which("codex") is not None

    def auth_status(self) -> str:
        # codex stores auth in ~/.codex/auth.json (managed by `codex login`);
        # DeadEnd never reads it. `codex login status` requires the binary;
        # we only report a static hint.
        return "ok" if self.detect() else "unknown"

    def inject_context(self, workdir: str, context_pack: dict) -> None:
        upsert_block(f"{workdir}/AGENTS.md", context_block(context_pack))

    def cleanup(self, workdir: str) -> None:
        strip_block(f"{workdir}/AGENTS.md")

    def build_command(self, task: str, workdir: str, context_pack: dict,
                      limits: Limits) -> list[str]:
        prompt = _render_prompt(task, context_pack)
        # workspace-write + full-auto-equivalent approvals: minimal
        # interactive prompts, write access confined to the workdir.
        # codex exec has no turn cap flag; enforce wall clock in runner.
        return ["codex", "exec", "--json",
                "--sandbox", "workspace-write",
                "--ask-for-approval", "never",
                prompt]

    def parse_result(self, stdout: str, stderr: str,
                     returncode: int) -> RunResult:
        """`codex exec --json` JSONL: turn.completed carries usage."""
        res = RunResult(status="success" if returncode == 0 else "failure")
        usage = {}
        agent_text = []
        saw_failed = False
        for line in (stdout or "").splitlines():
            s = line.strip()
            if not s.startswith("{"):
                continue
            try:
                ev = json.loads(s)
            except ValueError:
                continue
            etype = ev.get("type", "")
            if etype == "turn.completed" and isinstance(ev.get("usage"), dict):
                usage = ev["usage"]
            elif etype == "turn.failed":
                saw_failed = True
                msg = ev.get("error") or {}
                if isinstance(msg, dict):
                    res.raw["error"] = str(msg.get("message", ""))[:300]
            elif etype == "item.completed" and isinstance(ev.get("item"), dict):
                item = ev["item"]
                if item.get("type") == "agent_message" or "text" in item:
                    agent_text.append(str(item.get("text", "")))
            elif etype == "thread.started":
                res.raw["thread_id"] = ev.get("thread_id")
            elif etype == "error":
                res.raw["stream_error"] = str(ev.get("message", ""))[:300]
        res.tokens_in = usage.get("input_tokens")
        res.tokens_out = usage.get("output_tokens")
        res.raw["cached_input_tokens"] = usage.get("cached_input_tokens")
        res.raw["reasoning_output_tokens"] = usage.get("reasoning_output_tokens")
        res.text = "\n".join(agent_text)[-4000:]
        if saw_failed or returncode != 0 or not res.text:
            res.status = "failure" if saw_failed or returncode != 0 else res.status
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
        "Work only inside the current directory (workspace). Finish only",
        "when the tests pass.",
    ]
    return "\n".join(lines)
