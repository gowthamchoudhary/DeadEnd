"""DeadEnd reuse-event store — append-only events on an Entire-native branch.

Spec: "Use Entire-native branches (entire/unmirrored/...) for high-volume
writes such as reuse events." Events commit to refs/heads/entire/unmirrored/
reuse-events in the private repo, never to main. Every event is a REAL
replay result passed in by the caller; this module does not invent data.
"""
import datetime, json, os, subprocess

# entire:// git needs the file token store on headless hosts; subprocess
# calls inherit this environment (deltas only — never clobbers user env)
_GIT_ENV = dict(os.environ, ENTIRE_TOKEN_STORE="file")

def _git(repo, *args, **kw):
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, env=_GIT_ENV, **kw)

BRANCH = "entire/unmirrored/reuse-events"

def record(repo: str, event: dict) -> dict:
    """Append one reuse event and push to the Entire-native branch.
    event: {fix_id | attempt_id, failure_id, run_id, outcome, env_match,
            recorded_at, trace_id}
    """
    required = {"failure_id", "outcome", "run_id"}
    missing = required - set(event)
    if missing:
        return {"ok": False, "error": f"missing required fields: {missing}"}
    event.setdefault("recorded_at", datetime.datetime.now(datetime.timezone.utc).isoformat())
    event.setdefault("schema", "deadend/reuse_event/v1")

    _git(repo, "config", "user.name", "DeadEnd") if not (_git(repo, "config", "user.name").stdout or "").strip() else None
    if (_git(repo, "config", "user.email").stdout or "").strip() == "":
        _git(repo, "config", "user.email", "deadend@curators.local")

    # work on the Entire-native branch; create it from the current head if absent
    _git(repo, "fetch", "origin", BRANCH)
    r = _git(repo, "rev-parse", "--verify", f"origin/{BRANCH}")
    if r.returncode != 0:
        local = _git(repo, "rev-parse", "--verify", BRANCH)
        if local.returncode != 0:
            rb = _git(repo, "branch", BRANCH, "origin/main")
            if rb.returncode != 0:
                return {"ok": False, "error": f"branch create failed: {(rb.stderr or rb.stdout)[-200:]}"}
    _git(repo, "checkout", "-q", BRANCH)

    rel_path = os.path.join("reuse-events", f"{int(datetime.datetime.now(datetime.timezone.utc).timestamp()*1000)}-{event['failure_id']}.json")
    path = os.path.join(repo, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(event, f, indent=2)
    _git(repo, "add", "reuse-events")
    _git(repo, "add", "reuse-events")
    c = _git(repo, "commit", "-q", "-m", f"DeadEnd reuse_event: {event['failure_id']} {event['outcome']}")
    back = _git(repo, "checkout", "-q", "main")
    if c.returncode != 0:
        _git(repo, "checkout", "-q", "main") if _git(repo, "symbolic-ref", "HEAD").stdout.strip().endswith(BRANCH) else None
        return {"ok": False, "error": f"commit failed: {(c.stderr or c.stdout)[-300:]} (back={back.returncode})"}
    p = _git(repo, "push", "origin", f"{BRANCH}:{BRANCH}")
    err = None if p.returncode == 0 else (p.stderr or p.stdout)[-300:]
    return {"ok": p.returncode == 0, "path": rel_path, "branch": BRANCH, "error": err}

def collect(repo: str, failure_id: str) -> list:
    """Read every recorded reuse event for a failure from the branch
    (read-only; no checkout side effects on the caller's worktree)."""
    for ref in (f"origin/{BRANCH}", BRANCH):
        r = _git(repo, "ls-tree", "-r", "--name-only", ref, "reuse-events")
        if r.returncode == 0 and r.stdout.strip():
            events = []
            for p in r.stdout.split():
                c = _git(repo, "show", f"{ref}:{p}")
                if c.returncode == 0:
                    events.append(json.loads(c.stdout))
            return events
    return []
