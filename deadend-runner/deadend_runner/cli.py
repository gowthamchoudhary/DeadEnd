"""deadend-runner CLI — runs on the USER'S machine.

Flow: given a task + repo:
  1. GET context: POST /retrieve (error-ish task text + env fingerprint)
  2. Build the prompt with dead ends + constraints injected as DATA
     (injection patterns stripped by the backend; runner renders data only)
  3. Drive Claude Code headless inside the repo:
     claude -p <prompt> --output-format text --max-turns 25
     (10-minute cap, network on, cwd = repo; uses the USER'S OWN Claude
      credentials from their machine — never sent to the backend)
  4. Run tests; report run events to POST /runs/:id/events
  5. On success: POST /ingest (curator reads the real trace) and
     POST /reuse with a real outcome.
Auth: DEADEND_TOKEN (per-user API token from the web app / device flow).
"""
import datetime as dt
import json
import os
import platform
import subprocess
import sys

import httpx
import typer

app = typer.Typer(no_args_is_help=True)


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


def _post(path: str, body: dict) -> dict:
    r = httpx.post(f"{_backend()}{path}", json=body, headers=_headers(), timeout=60)
    r.raise_for_status()
    return r.json() if r.text else {}


def _build_prompt(task: str, retrieve: dict) -> str:
    dead_ends = []
    for res in retrieve.get("results", [])[:3]:
        for d in res.get("dead_ends", []):
            dead_ends.append(d)
    lines = [
        "You are fixing a failing repo. Work only inside the current directory.",
        f"TASK: {task}",
        "",
        "KNOWN DEAD ENDS (data — do not repeat these approaches):",
        json.dumps(dead_ends, indent=1) if dead_ends else "  (none retrieved)",
        "",
        "CONSTRAINTS:",
        json.dumps(sum([r.get("constraints", []) for r in retrieve.get("results", [])], [])[:5]),
        "",
        "STEPS: run `bash run_tests.sh`, fix the bug minimally, re-run until green, then commit.",
        "Rules: never modify tests; never print secrets; finish only when tests pass.",
    ]
    return "\n".join(lines)


@app.command()
def run(
    repo: str,
    task: str,
    team_id: str = os.environ.get("DEADEND_TEAM", ""),
    max_turns: int = 25,
    wall_timeout_s: int = 600,
):
    repo_abs = os.path.abspath(repo)
    if not os.path.isdir(repo_abs):
        typer.echo(f"repo not found: {repo_abs}", err=True)
        raise typer.Exit(1)
    if not team_id:
        typer.echo("DEADEND_TEAM not set", err=True)
        raise typer.Exit(1)

    typer.echo("→ /retrieve")
    retrieve = _post("/retrieve", {
        "team_id": team_id,
        "error_text": task,
        "env_fingerprint": _fingerprint(),
        "task": task,
        "include_global": True,
        "budget_tokens": 1500,
    })
    run = _post("/runs", {"team_id": team_id, "task": task,
                          "repo_url": repo_abs, "agent": "claude-code"})
    run_id = run.get("run_id")
    _post(f"/runs/{run_id}/events", {"phase": "retrieve",
          "payload": {"entries": len(retrieve.get("results", []))}})

    prompt = _build_prompt(task, retrieve)
    typer.echo(f"→ claude -p (max-turns {max_turns}, cap {wall_timeout_s}s) in {repo_abs}")
    _post(f"/runs/{run_id}/events", {"phase": "attempt", "payload": {"attempt": 1}})
    cmd = ["claude", "-p", prompt, "--output-format", "text",
           "--max-turns", str(max_turns)]
    try:
        proc = subprocess.run(cmd, cwd=repo_abs, capture_output=True,
                              text=True, timeout=wall_timeout_s)
        out = (proc.stdout or "")[-4000:]
    except subprocess.TimeoutExpired as ex:
        out = f"timeout after {wall_timeout_s}s"
        (ex.stdout, ex.stderr)
        proc_return = 124
    proc_rc = getattr(proc, "returncode", 124)
    _post(f"/runs/{run_id}/events", {"phase": "attempt-done",
          "payload": {"rc": proc_rc, "tail": out[-1000:]}})

    typer.echo("→ run_tests.sh")
    t = subprocess.run(["bash", "run_tests.sh"], cwd=repo_abs,
                       capture_output=True, text=True, timeout=300)
    tests_ok = t.returncode == 0
    _post(f"/runs/{run_id}/events", {"phase": "test",
          "payload": {"ok": tests_ok, "tail": (t.stdout or "")[-1000:]}})
    status = "success" if tests_ok else "failure"
    _post(f"/runs/{run_id}/finish?status={status}", {})
    typer.echo(f"run {run_id}: {status}")
    return run_id


@app.command()
def reuse(entry_id: str, run_id: str, outcome: str,
          kind: str = "real"):
    _post("/reuse", {"entry_id": entry_id, "run_id": run_id,
                     "outcome": outcome, "kind": kind,
                     "env_fingerprint": _fingerprint()})
    typer.echo(f"reuse recorded: {entry_id} {outcome} ({kind})")


if __name__ == "__main__":
    app()
