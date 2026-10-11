"""deadend-runner CLI — runs on the USER'S machine. Agent-agnostic.

Flow (any agent): retrieve -> attempt (headless CLI run) -> test ->
verify -> record (+ reuse on success). The user's agent credentials are
never read or sent anywhere; the CLI binaries use their own local auth.
Env needed: DEADEND_BACKEND, DEADEND_TOKEN, DEADEND_TEAM.
"""
import datetime as dt
import json
import os
import platform
import subprocess

import httpx
import typer

from .adapters import ADAPTERS, Limits, get as get_adapter
from .tracing import RunTrace

app = typer.Typer(no_args_is_help=True)
agents_app = typer.Typer(help="list / inspect supported agents", invoke_without_command=True)
app.add_typer(agents_app, name="agents")


@agents_app.callback()
def _agents_default(ctx: typer.Context):
    """`deadend-runner agents` (no subcommand) = `agents list`."""
    if ctx.invoked_subcommand is None:
        agents_list()

from . import setup as setup_mod  # noqa: E402


def _backend() -> str:
    return os.environ.get("DEADEND_BACKEND", "http://localhost:8000")


def _headers() -> dict:
    tok = os.environ.get("DEADEND_TOKEN")
    if not tok:
        typer.echo("DEADEND_TOKEN not set (get one from the web app / device flow)", err=True)
        raise typer.Exit(1)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _fingerprint() -> dict:
    return {"language": f"python {platform.python_version()}",
            "frameworks": ["pytest"], "os": platform.system()}


def _post(path: str, body: dict, base: str | None = None) -> dict:
    r = httpx.post(f"{base or _backend()}{path}", json=body, headers=_headers(), timeout=60)
    r.raise_for_status()
    return r.json() if r.text else {}


def _get(path: str) -> dict:
    r = httpx.get(f"{_backend()}{path}", headers=_headers(), timeout=60)
    r.raise_for_status()
    return r.json() if r.text else {}


def _flatten(retrieve: dict) -> dict:
    """retrieve results -> {dead_ends, constraints, fixes} for adapters."""
    dead_ends, constraints, fixes = [], [], []
    for res in retrieve.get("results", []):
        for d in res.get("dead_ends", []):
            dead_ends.append(d)
        for c in res.get("constraints", []):
            constraints.append(c)
        f = res.get("fix")
        if f:
            fixes.append(f)
    return {"dead_ends": dead_ends[:5], "constraints": constraints[:8],
            "fixes": fixes[:3]}


@app.command()
def run(
    repo: str,
    task: str,
    agent: str = typer.Option("claude-code", "--agent",
                              help="claude-code | codex | opencode | pi | antigravity | copilot-cli"),
    setup_capture: bool = typer.Option(False, "--setup",
                                       help="also run `entire enable --agent <name>` first"),
    no_deadend: bool = typer.Option(False, "--no-deadend",
                                    help="baseline run: skip retrieve + skip context injection + skip run records"),
    tests_cmd: str = typer.Option("bash run_tests.sh", "--tests-cmd",
                                  help="test command run inside the repo"),
    max_turns: int = typer.Option(25, "--max-turns"),
    wall_timeout_s: int = typer.Option(600, "--wall-timeout-s"),
    team_id: str = os.environ.get("DEADEND_TEAM", ""),
):
    repo_abs = os.path.abspath(repo)
    if not os.path.isdir(repo_abs):
        typer.echo(f"repo not found: {repo_abs}", err=True)
        raise typer.Exit(1)
    if not team_id:
        typer.echo("DEADEND_TEAM not set", err=True)
        raise typer.Exit(1)
    a = get_adapter(agent)
    if not a.detect():
        typer.echo(f"agent CLI not detected on this machine: {a.AGENT}", err=True)
        raise typer.Exit(1)
    caps = a.CAPS
    if setup_capture:
        info = setup_mod.setup_agent(a.AGENT, repo_abs)
        typer.echo(f"entire: {info.get('entire')}")

    limits = Limits(max_turns=max_turns, wall_timeout_s=wall_timeout_s,
                    workdir=repo_abs)
    time0 = dt.datetime.now(dt.timezone.utc)
    retrieve: dict = {"results": []}
    run_id: str | None = None
    with RunTrace(a.AGENT) as trace:
        # ---- retrieve (skipped for baseline runs) ------------------------
        if no_deadend:
            pack = {"dead_ends": [], "constraints": [], "fixes": []}
            typer.echo("baseline mode: DeadEnd context and records skipped")
        else:
            retrieve = _post("/retrieve", {
                "team_id": team_id, "error_text": task,
                "env_fingerprint": _fingerprint(), "task": task,
                "include_global": True, "budget_tokens": 1500})
            pack = _flatten(retrieve)
            run = _post("/runs", {"team_id": team_id, "task": task,
                                  "repo_url": repo_abs, "agent": a.AGENT})
            run_id = run.get("run_id")
            trace.run_id = run_id
            _post(f"/runs/{run_id}/events", {"phase": "retrieve",
                  "payload": {"entries": len(retrieve.get("results", []))}})

        # ---- inject context ------------------------------------------
        if run_id:
            a.inject_context(repo_abs, pack)
        try:
            # ---- attempt ---------------------------------------------
            cmd = a.build_command(task, repo_abs, pack, limits)
            typer.echo(f"→ {' '.join(cmd[:3])}… (cap {wall_timeout_s}s) in {repo_abs}")
            if run_id:
                _post(f"/runs/{run_id}/events", {"phase": "attempt",
                      "payload": {"attempt": 1, "cmd_head": cmd[:4]}})
            timed_out = False
            proc = None
            try:
                proc = subprocess.run(cmd, cwd=repo_abs, capture_output=True,
                                      text=True, timeout=wall_timeout_s)
            except subprocess.TimeoutExpired as ex:
                timed_out = True
                out = getattr(ex, "stdout", "") or ""
                err = getattr(ex, "stderr", "") or ""
                if isinstance(out, bytes):
                    out = out.decode(errors="replace")
                if isinstance(err, bytes):
                    err = err.decode(errors="replace")
                result = a.parse_result(out, err, 124)
                if timed_out:
                    result.status = "timeout"
            if not timed_out:
                result = a.parse_result(proc.stdout or "", proc.stderr or "",
                                        proc.returncode)
            duration_s = (dt.datetime.now(dt.timezone.utc) - time0).total_seconds()
            if run_id:
                _post(f"/runs/{run_id}/events",
                      {"phase": "attempt-done",
                       "payload": {"rc": 124 if timed_out else proc.returncode,
                                   "tail": result.text[-1000:]}})

            # ---- test -------------------------------------------------
            typer.echo(f"→ {tests_cmd}")
            t = subprocess.run([tests_cmd], cwd=repo_abs, shell=True,
                               capture_output=True, text=True, timeout=300)
            tests_ok = t.returncode == 0
            if run_id:
                _post(f"/runs/{run_id}/events",
                      {"phase": "test",
                       "payload": {"ok": tests_ok,
                                   "tail": (t.stdout or "")[-1000:]}})
            # ---- verify + record -------------------------------------
            status = "success" if tests_ok else "failure"
            if run_id:
                _post(f"/runs/{run_id}/finish?status={status}", {})
                _post(f"/runs/{run_id}/summary", {
                    "agent": a.AGENT,
                    "agent_version": _agent_version(a),
                    "model": result.model,
                    "tokens_in": result.tokens_in,
                    "tokens_out": result.tokens_out,
                    "duration": duration_s,
                    "context_used": bool(pack["dead_ends"] or pack["fixes"])})
            # reuse attribution: when the run succeeded and a known fix was
            # retrieved, credit the top entry (agent name rides in the run
            # record; /runs already stores agent per run).
            if not no_deadend and tests_ok and retrieve.get("results"):
                top = retrieve["results"][0]
                eid = top.get("entry_id")
                if eid:
                    try:
                        _post("/reuse", {"entry_id": eid, "run_id": run_id,
                                         "outcome": "success", "kind": "real",
                                         "env_fingerprint": _fingerprint()})
                        typer.echo(f"reuse credited: {eid}")
                    except Exception as ex:
                        typer.echo(f"reuse credit failed (non-fatal): {ex}", err=True)
            typer.echo(f"run {run_id}: {status} (agent={a.AGENT}, "
                       f"model={result.model}, "
                       f"tokens={result.tokens_in}/{result.tokens_out})")
        finally:
            if run_id:
                a.cleanup(repo_abs)
    return run_id


def _agent_version(a) -> str | None:
    binary = {"claude-code": "claude", "codex": "codex", "opencode": "opencode",
              "pi": "pi", "antigravity": "agy",
              "copilot-cli": "copilot"}.get(a.AGENT)
    flag = {"claude-code": "--version", "codex": "--version",
            "opencode": "**skip**", "pi": "--version",
            "antigravity": "--version",
            "copilot-cli": "--version"}.get(a.AGENT)
    if not binary or flag == "**skip**":
        return None
    try:
        r = subprocess.run([binary, flag], capture_output=True, text=True,
                           timeout=20)
        line = (r.stdout or r.stderr or "").strip().splitlines()
        return (line[0] if line else None) or None
    except Exception:
        return None


@agents_app.command("list")
def agents_list():
    """List supported agents with detection status + capabilities."""
    rows = []
    for name in sorted(ADAPTERS):
        inst = get_adapter(name)
        caps = inst.CAPS
        rows.append({
            "agent": name,
            "detected": inst.detect(),
            "headless": caps.headless,
            "mcp": caps.mcp,
            "hooks": caps.hooks,
            "tokens_reported": caps.tokens_reported,
            "turn_limit_flag": caps.turn_limit_flag,
            "instruction_file": caps.instruction_file,
        })
    typer.echo(json.dumps(rows, indent=2))


@app.command()
def setup_agent_cmd(
    repo: str,
    agent: str = typer.Option(..., "--agent"),
    install_plugin: bool = typer.Option(True, "--neatlogs/--no-neatlogs"),
):
    """One-time capture setup in a repo: entire enable + neatlogs plugin."""
    info = setup_mod.setup_agent(agent, os.path.abspath(repo))
    typer.echo(json.dumps(info, indent=2))
    if install_plugin:
        plug = setup_mod.install_neatlogs_plugin(agent, os.path.abspath(repo))
        typer.echo(json.dumps(plug, indent=2))


@app.command()
def mcp_config(
    agent: str = typer.Option(..., "--agent"),
    write: bool = typer.Option(False, "--write"),
    repo: str = typer.Option(".", "--repo"),
):
    """Print (or --write into the repo) the exact MCP config for that agent."""
    from .setup import mcp_config_for
    a = get_adapter(agent)
    command = ["deadend-mcp"]
    cfg = mcp_config_for(a.AGENT, command)
    if cfg["format"] == "toml":
        lines = ["# DeadEnd MCP server (agent-agnostic; stdio)"]
        for name, srv in cfg["toml"]["mcp_servers"].items():
            lines.append(f"[mcp_servers.{name}]")
            lines.append(f"command = {srv['command']!r}")
            lines.append("args = [" + ", ".join(repr(x) for x in srv["args"]) + "]")
        rendered = "\n".join(lines) + "\n"
        typer.echo(f"# write into {cfg['path']} (Codex TOML format; "
                   "https://developers.openai.com/codex/config)")
        typer.echo(rendered)
        body = rendered
    else:
        # valid JSON only — no comment lines (JSON has no comments)
        rendered = json.dumps(cfg["config"], indent=2) + "\n"
        typer.echo(f"# write into {cfg['path']} ({a.AGENT}; JSON format: "
                   f"{'https://opencode.ai/docs/mcp-servers/' if cfg['path'] == 'opencode.json' else 'https://code.claude.com/docs/en/mcp'})")
        typer.echo(rendered)
        body = rendered
    if write:
        target = os.path.join(os.path.abspath(repo), cfg["path"])
        os.makedirs(os.path.dirname(os.path.abspath(target)) or ".", exist_ok=True)
        existing = open(target).read() if os.path.exists(target) else ""
        with open(target, "w") as f:
            f.write(existing + ("\n" if existing.strip() else "") + body)
        typer.echo(f"→ appended to {target}")


@app.command()
def mcp_serve():
    """Run the DeadEnd stdio MCP server (only via agent config, not by hand)."""
    from .mcp_server import serve
    serve()


@app.command()
def reuse(entry_id: str, run_id: str, outcome: str, kind: str = "real"):
    _post("/reuse", {"entry_id": entry_id, "run_id": run_id,
                     "outcome": outcome, "kind": kind,
                     "env_fingerprint": _fingerprint()})
    typer.echo(f"reuse recorded: {entry_id} {outcome} ({kind})")


if __name__ == "__main__":
    app()
