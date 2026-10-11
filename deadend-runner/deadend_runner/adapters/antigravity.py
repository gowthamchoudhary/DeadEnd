"""Google Antigravity CLI (`agy`) adapter for DeadEnd.

Docs (fetched 2026-10-11, not guessed):
  - headless mode + JSON output: https://antigravity.google/docs/cli/headless/
  - rules (AGENTS.md etc.):      https://antigravity.google/docs/rules/
  - MCP (.agents/mcp_config.json): https://antigravity.google/docs/mcp/
  - hooks (.agents/hooks.json):  https://antigravity.google/docs/hooks/
  - Entire integration:          https://docs.entire.io/agents/antigravity

Verified facts used here:
  - Headless one-shot: `agy -p "<prompt>"` ("Pass a prompt with -p (or
    its aliases --print and --prompt) to run once and exit"). Requires
    prior interactive `agy` login; an unauthenticated headless run
    exits with an authentication-required error instead of hanging.
  - Machine-readable: `--output-format json` (one result envelope with
    conversation_id, status, response, error, duration_seconds,
    num_turns, usage{input_tokens, output_tokens, thinking_tokens,
    cache_read_tokens, total_tokens}) or `--output-format stream-json`
    (NDJSON: init {model, agent}, step_update, result).
  - Flags: `--model <slug>`, `--effort low|medium|high`,
    `--print-timeout <duration>` (response-wait timeout, default 5m —
    NOT a turn cap), `--dangerously-skip-permissions`, `--sandbox`.
    NO documented max-turn-count flag; runner enforces wall clock.
  - Rules: AGENTS.md / GEMINI.md / .agents/rules/*.md auto-discovered.
  - Workspace MCP: .agents/mcp_config.json (mcpServers, JSON).
  - Hooks: .agents/hooks.json (PreToolUse, PostToolUse, PreInvocation,
    PostInvocation, Stop).
  - Entire `entire enable --agent antigravity` writes .agents/hooks.json
    (agent name `antigravity`, NOT "antigravity-cli").
"""
import json
from .base import (AgentAdapter, Capabilities, Limits, RunResult,
                   context_block, strip_block, upsert_block, which)


class AntigravityAdapter(AgentAdapter):
    AGENT = "antigravity"
    CAPS = Capabilities(
        headless=True,
        mcp=True,
        hooks=True,
        tokens_reported="exact",        # json envelope carries usage
        turn_limit_flag=None,           # --print-timeout is a wait cap, not turns
        instruction_file="AGENTS.md",
    )

    def detect(self) -> bool:
        return which("agy") is not None

    def auth_status(self) -> str:
        # Auth is done inside an interactive `agy` session (per headless
        # docs); DeadEnd never touches the stored token. We cannot query
        # auth state without starting the CLI, so report a hint.
        return "ok" if self.detect() else "unknown"

    def inject_context(self, workdir: str, context_pack: dict) -> None:
        upsert_block(f"{workdir}/AGENTS.md", context_block(context_pack))

    def cleanup(self, workdir: str) -> None:
        strip_block(f"{workdir}/AGENTS.md")

    def build_command(self, task: str, workdir: str, context_pack: dict,
                      limits: Limits) -> list[str]:
        prompt = _render_prompt(task, context_pack)
        # --print-timeout bounds a single response; the runner's own
        # 10-minute subprocess timeout is the hard wall clock.
        return ["agy", "-p", prompt,
                "--output-format", "json",
                "--print-timeout", "540s"]

    def parse_result(self, stdout: str, stderr: str,
                     returncode: int) -> RunResult:
        """agy --output-format json: one result envelope."""
        res = RunResult(status="success" if returncode == 0 else "failure")
        env = None
        for line in (stdout or "").splitlines():
            s = line.strip()
            if s.startswith("{"):
                try:
                    cand = json.loads(s)
                    if isinstance(cand, dict) and "status" in cand:
                        env = cand
                except ValueError:
                    pass
        if env:
            res.status = {"success": "success", "failed": "failure",
                          "error": "error", "timeout": "timeout"}.get(
                              str(env.get("status")),
                              "success" if returncode == 0 else "failure")
            res.text = str(env.get("response") or "")[:4000]
            usage = env.get("usage") if isinstance(env.get("usage"), dict) else {}
            res.tokens_in = usage.get("input_tokens")
            res.tokens_out = usage.get("output_tokens")
            res.raw = {"conversation_id": env.get("conversation_id"),
                       "num_turns": env.get("num_turns"),
                       "duration_seconds": env.get("duration_seconds")}
            if isinstance(env.get("error"), (str, dict)) and env.get("error"):
                res.raw["error"] = str(env["error"])[:300]
        else:
            res.text = (stdout or stderr or "")[-4000:]
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
        "Stay inside the current workspace; finish only when tests pass.",
    ]
    return "\n".join(lines)
