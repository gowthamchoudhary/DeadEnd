"""Service-account publishing of approved contributions to the
deadend-global Entire repo (via git push on entire:// remote)."""
import json
import os
import subprocess


def push_entry_json(entry, contribution) -> dict:
    """Write entries/<entry_id>.json to a worktree of the global repo and push."""
    worktree = "/tmp/deadend-global-push"
    remote = get_settings().entire_global_remote
    if not remote:
        raise RuntimeError("DEADEND_ENTIRE_GLOBAL_REMOTE not configured")
    env = dict(os.environ, ENTIRE_TOKEN_STORE="file")
    if not os.path.isdir(worktree):
        subprocess.run(["git", "clone", remote, worktree], env=env, check=True,
                       capture_output=True, text=True)
    subprocess.run(["git", "-C", worktree, "pull", "--rebase", "origin", "main"],
                   env=env, capture_output=True, text=True, check=False)
    os.makedirs(f"{worktree}/entries", exist_ok=True)
    doc = {
        "schema": "deadend/v1", "scope": "global",
        "published_via_contribution": contribution.id,
        "failure": {"id": entry.id, "signature_hash": entry.signature_hash,
                    "signature_normalized": entry.signature_normalized,
                    "redacted_error_text": entry.redacted_error_text,
                    "environment": entry.env_fingerprint},
        "attempts": entry.attempts_graph,
        "fix": contribution.diff,
        "verified": bool(entry.verified),
        "seeded": False,
        "provenance": {"trace_id": entry.neatlogs_trace_id,
                       "checkpoint_id": entry.entire_checkpoint_id},
    }
    path = f"{worktree}/entries/{entry.id}.json"
    with open(path, "w") as f:
        json.dump(doc, f, indent=2)
    for cmd in (["git", "-C", worktree, "add", "."],
                ["git", "-C", worktree, "commit", "-m",
                 f"DeadEnd global: publish {entry.id} (contribution {contribution.id})"],
                ["git", "-C", worktree, "push", "origin", "main"]):
        r = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if r.returncode != 0 and "nothing to commit" not in (r.stdout or ""):
            raise RuntimeError(f"{cmd}: {(r.stderr or r.stdout)[-300:]}")
    return {"pushed": entry.id}


def get_settings():
    from .config import get_settings as gs
    return gs()
