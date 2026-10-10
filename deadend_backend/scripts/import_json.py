#!/usr/bin/env python3
"""One-off import: migrate JSON entries from the deadend-private Entire
repo (failures/*.json, deadend/v1 schema) into the Postgres database.
Usage: python -m scripts.import_json --repo /home/daytona/repos/deadend-private --team <team_id> --trace-anchor none"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import create_all, sessionmaker_tls  # noqa: E402
from app.models import Entry  # noqa: E402


def load_json_from_repo(repo: str, ref: str = "origin/main"):
    paths = subprocess.run(["git", "-C", repo, "ls-tree", "-r", "--name-only", ref, "failures"],
                           capture_output=True, text=True)
    for p in paths.stdout.split():
        if not p.endswith(".json"):
            continue
        c = subprocess.run(["git", "-C", repo, "show", f"{ref}:{p}"], capture_output=True, text=True)
        if c.returncode == 0:
            yield p, json.loads(c.stdout)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--team", required=True, help="existing team_id to attach entries to")
    ap.add_argument("--ref", default="origin/main")
    args = ap.parse_args()

    create_all()
    db = sessionmaker_tls()()
    imported = skipped = 0
    for path, doc in load_json_from_repo(args.repo, args.ref):
        f = doc.get("failure") or {}
        sig = f.get("signature_hash")
        if not sig:
            skipped += 1
            continue
        if db.query(Entry).filter(Entry.signature_hash == sig,
                                  Entry.team_id == args.team).first():
            skipped += 1
            continue
        e = Entry(scope="private", team_id=args.team,
                  signature_hash=sig,
                  signature_normalized=f.get("signature_normalized", ""),
                  redacted_error_text=f.get("redacted_error_text", ""),
                  env_fingerprint=f.get("environment", {}),
                  attempts_graph=doc.get("attempts", []),
                  fix=doc.get("fix"),
                  seeded=bool(doc.get("seeded", False)),
                  verified=bool((doc.get("fix") or {}).get("verified", False)),
                  neatlogs_trace_id=(doc.get("provenance") or {}).get("trace_id"),
                  entire_checkpoint_id=(doc.get("provenance") or {}).get("checkpoint_id"),
                  meta={"schema": doc.get("schema"), "imported_from": path})
        db.add(e)
        imported += 1
    db.commit()
    print(f"imported={imported} skipped={skipped}")


if __name__ == "__main__":
    main()
