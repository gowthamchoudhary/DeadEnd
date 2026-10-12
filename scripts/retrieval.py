"""DeadEnd retrieval — Step 3.

Order (spec): 1. exact signature_hash match; 2. entire search;
3. neatlogs MCP search_traces — filtered by environment fingerprint,
ranked by confidence (private above global), capped by token budget.

Real data only: reads entries from the two Entire repos and seeded files
(seeds/ are clearly labeled seeded:true and excluded unless requested).
Returns dead ends too: for each match the failed attempts with
why_it_failed, plus the fix if one exists.
"""
import hashlib, json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
from confidence import confidence, env_match

REPOS = {"private": os.environ.get("DEADEND_PRIVATE_REPO", "/home/daytona/repos/deadend-private"),
         "global": os.environ.get("DEADEND_GLOBAL_REPO", "/home/daytona/repos/deadend-global")}
SEEDS_DIR = os.path.join(os.path.dirname(__file__), "..", "seeds")

def _git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True)

def load_entries(sources=("private",), include_seeds=False):
    """Entry = one deadend/v1 JSON document (failure+attempts+fix)."""
    out = []
    for src in sources:
        repo = REPOS[src]
        r = _git(repo, "ls-tree", "-r", "--name-only", "origin/main", "failures")
        if r.returncode != 0 or not r.stdout.strip():
            r = _git(repo, "ls-tree", "-r", "--name-only", "main", "failures")
        if r.returncode == 0:
            for p in [x for x in r.stdout.split() if x.endswith(".json")]:
                for ref in ("origin/main", "main"):
                    c = _git(repo, "show", f"{ref}:{p}")
                    if c.returncode == 0:
                        d = json.loads(c.stdout)
                        d["_scope"] = src
                        d["_path"] = p
                        out.append(d)
                        break
    if include_seeds and os.path.isdir(SEEDS_DIR):
        for root, _, files in os.walk(SEEDS_DIR):
            for fn in files:
                if fn.endswith(".json"):
                    d = json.load(open(os.path.join(root, fn)))
                    if d.get("seeded") is True:  # labels never stripped
                        d["_scope"] = "global-seeded"
                        d["_path"] = os.path.relpath(os.path.join(root, fn), SEEDS_DIR)
                        out.append(d)
                    else:
                        print(f"WARN seeds/{fn} missing seeded:true label — excluded", file=sys.stderr)
    return out

def find_by_signature(signature_hash, include_seeds=False):
    hits = [e for e in load_entries(("private", "global"), include_seeds)
            if e.get("failure", {}).get("signature_hash") == signature_hash]
    return sorted(hits, key=lambda e: 0 if e["_scope"] == "private" else 1)

def search(query_env: dict, failure_text: str, cur_env: dict,
           include_seeds=False, extra_candidates=None):
    """Full retrieval for a failure. extra_candidates: results already
    retrieved upstream (e.g. from entire search) as deadend/v1 dicts."""
    norm = re.sub(r"\s+", " ", failure_text.lower())
    entries = load_entries(("private", "global"), include_seeds)
    if extra_candidates:
        seen = {e["failure"]["id"] for e in entries if e.get("failure")}
        entries += [c for c in extra_candidates if c.get("failure", {}).get("id") not in seen]
    scored = []
    for e in entries:
        f = e.get("failure", {})
        sig_norm = (f.get("signature_normalized") or "").lower()
        err = (f.get("redacted_error_text") or "").lower()
        inter = len(set(re.findall(r"\w{4,}", sig_norm + " " + err)) &
                    set(re.findall(r"\w{4,}", norm))) if sig_norm or err else 0
        exact = 1.0 if (f.get("signature_hash") and
                        f["signature_hash"] == hashlib.sha256(
                            normalize(failure_text).encode()).hexdigest()[:16]) else 0.0
        match_score = exact * 3 + min(1.0, inter / 5)
        e_m = env_match(f.get("environment"), cur_env)
        if e_m < 0.3:          # environment fingerprint filter
            continue
        reuse = _reuse(e)
        cf = confidence(e.get("fix") or {}, reuse, cur_env)
        scope_rank = 0 if e["_scope"] == "private" else (1 if e["_scope"] == "global" else 2)
        scored.append({"entry": e, "match": round(match_score, 3),
                       "confidence": cf, "env_match": e_m,
                       "private_above_global": scope_rank,
                       "dead_ends": [{"approach": a.get("approach"),
                                      "outcome": a.get("outcome"),
                                      "why_it_failed": a.get("why_it_failed")}
                                     for a in e.get("attempts", [])],
                       "fix": e.get("fix")})
    scored.sort(key=lambda x: (-x["private_above_global"] + 0, x["private_above_global"],
                               -x["confidence"]["score"], -x["match"]))
    return scored

def _reuse(e):
    from reuse_events import collect
    repo = REPOS.get(e["_scope"]) if e["_scope"] in REPOS else None
    if repo:
        return collect(repo, e["failure"]["id"])
    return []

def normalize(text):
    from curator import normalize_stack
    return normalize_stack(text or "")

def render_context(results, token_budget=1500):
    """Rank-ordered, budget-capped context pack for the solver."""
    lines, used = [], 0
    for r in results:
        block = json.dumps({"failure_id": r["entry"]["failure"]["id"],
                            "signature": r["entry"]["failure"].get("signature_normalized", "")[:200],
                            "dead_ends": r["dead_ends"],
                            "fix": {"recipe": (r.get("fix") or {}).get("recipe"),
                                    "verified": (r.get("fix") or {}).get("verified", False)},
                            "confidence": r["confidence"],
                            "scope": r["entry"]["_scope"]}, default=str)
        if used + len(block) > token_budget:
            break
        lines.append(block)
        used += len(block)
    return lines, used
