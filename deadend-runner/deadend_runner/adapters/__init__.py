"""Agent registry: lookup + detection across all supported adapters."""
from . import base as _base
from .antigravity import AntigravityAdapter
from .base import AgentAdapter, Capabilities, Limits, RunResult  # noqa: F401
from .claude_code import ClaudeCodeAdapter
from .codex import CodexAdapter
from .copilot_cli import CopilotCLIAdapter
from .opencode import OpenCodeAdapter
from .pi import PiAdapter

ADAPTERS: dict[str, type[AgentAdapter]] = {
    a.AGENT: a for a in (
        ClaudeCodeAdapter, CodexAdapter, OpenCodeAdapter, PiAdapter,
        AntigravityAdapter, CopilotCLIAdapter,
    )
}

ALIASES = {"antigravity-cli": "antigravity", "claude": "claude-code",
           "copilot": "copilot-cli"}


def resolve(name: str) -> type[AgentAdapter]:
    n = ALIASES.get(name, name)
    a = ADAPTERS.get(n)
    if not a:
        raise KeyError(f"unknown agent '{name}'; known: {', '.join(sorted(ADAPTERS))}")
    return a


def get(name: str) -> AgentAdapter:
    return resolve(name)()


def detected() -> list[tuple[str, "AgentAdapter"]]:
    out = []
    for name in sorted(ADAPTERS):
        inst = ADAPTERS[name]()
        if inst.detect():
            out.append((name, inst))
    return out
