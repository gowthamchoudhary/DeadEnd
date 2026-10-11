"""One-time setup of DeadEnd capture in a target repo, per agent.

Docs (fetched 2026-10-11, not guessed):
  - `entire enable`:      https://docs.entire.io/cli-reference/enable
  - per-agent setup files: https://docs.entire.io/agents/setup
  - neatlogs plugins:      shipped per-agent; install with pip/npm per
    the plugin's own README (deadend does not guess install commands
    beyond the documented package names).
"""
import json
import shutil
import subprocess

# Canonical Entire agent names (https://docs.entire.io/cli-reference/enable):
ENTIRE_AGENT_NAMES = {"claude-code", "codex", "opencode", "pi",
                      "antigravity", "copilot-cli"}

# neatlogs plugin packages documented for these agents:
NEATLOGS_PLUGINS = {"claude-code": "neatlogs-claude-code",
                    "codex": "neatlogs-codex",
                    "opencode": "neatlogs-opencode"}


def run(cmd: list[str], cwd: str | None = None) -> tuple[int, str]:
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=120)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def setup_agent(agent: str, repo: str, entire_bin: str | None = None) -> dict:
    """Run `entire enable --yes --agent <name>` in the repo; report status."""
    agent = _canonical(agent)
    if entire_bin is None:
        entire_bin = shutil.which("entire") or "entire"
    out: dict = {"agent": agent, "entire": "not_installed"}
    if shutil.which(entire_bin) is None:
        return out
    rc, text = run([entire_bin, "enable", "--yes", "--agent", agent], cwd=repo)
    out["entire"] = "enabled" if rc == 0 else f"failed: {text.strip()[-200:]}"
    out["entire_files"] = _PROBE_FILES.get(agent, [])
    return out


def install_neatlogs_plugin(agent: str, repo: str) -> dict:
    """Best-effort install of the agent's neatlogs plugin per its docs."""
    agent = _canonical(agent)
    pkg = NEATLOGS_PLUGINS.get(agent)
    if not pkg:
        return {"agent": agent, "neatlogs_plugin": None,
                "note": "no documented neatlogs plugin; workflow-level tracing still applies"}
    if _looks_like_js_pkg(pkg):
        tool = "npm" if shutil.which("npm") else None
        if tool:
            rc, text = run([tool, "install", "-g", pkg])
            return {"agent": agent, "neatlogs_plugin": pkg,
                    "installed": rc == 0, "tool": tool,
                    "detail": text.strip()[-200:]}
        return {"agent": agent, "neatlogs_plugin": pkg, "installed": False,
                "note": "npm not found"}
    return {"agent": agent, "neatlogs_plugin": pkg, "installed": None,
            "note": "install manually with the plugin's own instructions"}


def _canonical(agent: str) -> str:
    return {"antigravity-cli": "antigravity", "copilot": "copilot-cli",
            "claude": "claude-code"}.get(agent, agent)


def _looks_like_js_pkg(pkg: str) -> bool:
    return pkg.startswith("neatlogs-claude") or pkg.startswith("neatlogs-codex")


_PROBE_FILES = {
    "claude-code": [".claude/settings.json"],
    "codex": [".codex/hooks.json"],
    "opencode": [".opencode/plugins/entire.ts"],
    "pi": [".pi/extensions/entire/index.ts"],
    "antigravity": [".agents/hooks.json"],
    "copilot-cli": [".github/hooks/entire.json"],
}


def mcp_config_for(agent: str, command: list[str]) -> dict:
    """Exact MCP config object for the agent, per its docs. The caller
    (mcp-config subcommand) renders this into the right project file.

    Sources:
      claude-code .mcp.json:           https://code.claude.com/docs/en/mcp
      codex .codex/config.toml (TOML): https://developers.openai.com/codex/config
      opencode opencode.json:          https://opencode.ai/docs/mcp-servers/
      pi .pi/mcp.json:                 https://pi.dev/docs/latest/mcp
      antigravity .agents/mcp_config.json: https://antigravity.google/docs/mcp/
      copilot-cli .mcp.json:           https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers
    """
    exe = command[0]
    args = command[1:]
    agent = _canonical(agent)
    if agent == "codex":
        # TOML, written into .codex/config.toml:
        # [mcp_servers.deadend]
        # command = "..."
        # args = [...]
        return {"format": "toml", "path": ".codex/config.toml",
                "toml": {"mcp_servers": {"deadend": {"command": exe,
                                                     "args": args}}}}
    if agent == "opencode":
        return {"format": "json", "path": "opencode.json",
                "config": {"$schema": "https://opencode.ai/config.json",
                           "mcp": {"deadend": {"type": "local",
                                               "command": command}}}}
    if agent == "antigravity":
        return {"format": "json", "path": ".agents/mcp_config.json",
                "config": {"mcpServers": {"deadend": {"command": exe,
                                                      "args": args,
                                                      "cwd": "."}}}}
    if agent == "pi":
        return {"format": "json", "path": ".pi/mcp.json",
                "config": {"mcpServers": {"deadend": {"command": exe,
                                                      "args": args}}}}
    # claude-code + copilot-cli share the .mcp.json mcpServers shape
    return {"format": "json", "path": ".mcp.json",
            "config": {"mcpServers": {"deadend": {"command": exe,
                                                  "args": args}}}}
