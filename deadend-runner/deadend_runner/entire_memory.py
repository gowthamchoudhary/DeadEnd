"""Search Entire's captured agent sessions and checkpoints for run context.

Entire remains the source of the underlying coding-session record. This
adapter uses the user's authenticated Entire CLI locally, so DeadEnd never
receives their Entire credentials or raw search transcripts.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path


def _run(args: list[str], cwd: str, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)


def _json_stdout(value: str):
    value = value.strip()
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        # Some CLI versions may print a short status line before JSON.
        start = min((p for p in (value.find("{"), value.find("[")) if p >= 0),
                    default=-1)
        if start >= 0:
            try:
                return json.loads(value[start:])
            except json.JSONDecodeError:
                pass
    return None


def _rows(value) -> list[dict]:
    if isinstance(value, list):
        return [x for x in value if isinstance(x, dict)]
    if isinstance(value, dict):
        for key in ("results", "hits", "checkpoints", "items", "data"):
            if isinstance(value.get(key), (list, dict)):
                found = _rows(value[key])
                if found:
                    return found
        if any(k in value for k in ("id", "checkpoint_id", "session_id")):
            return [value]
    return []


def _checkpoint_id(hit: dict) -> str | None:
    for key in ("checkpoint_id", "id", "checkpointId"):
        val = hit.get(key)
        if isinstance(val, str) and val:
            return val
    return None


def _strings(value, parent_key: str = "") -> list[str]:
    """Extract human text from Entire's agent-specific JSONL transcript."""
    out: list[str] = []
    if isinstance(value, str):
        if parent_key.lower() in {"text", "content", "message", "prompt", "response",
                                  "output", "input", "result", "summary"}:
            clean = value.strip()
            if clean:
                out.append(clean)
    elif isinstance(value, list):
        for item in value:
            out.extend(_strings(item, parent_key))
    elif isinstance(value, dict):
        for key, item in value.items():
            out.extend(_strings(item, str(key)))
    return out


def _transcript_text(checkpoint_id: str, cwd: str, query: str,
                     budget_chars: int) -> str:
    try:
        p = _run(["entire", "checkpoint", "explain", checkpoint_id,
                  "--transcript"], cwd, timeout=18)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if p.returncode:
        return ""
    terms = set(re.findall(r"[a-z0-9_]{3,}", query.lower()))
    segments: list[tuple[int, str]] = []
    for line in p.stdout.splitlines():
        try:
            obj = json.loads(line)
            texts = _strings(obj)
        except json.JSONDecodeError:
            texts = [line.strip()]
        for text in texts:
            if len(text) < 30:
                continue
            score = len(terms.intersection(re.findall(r"[a-z0-9_]{3,}", text.lower())))
            if score:
                segments.append((score, text))
    segments.sort(key=lambda item: item[0], reverse=True)
    selected: list[str] = []
    budget = max(0, budget_chars)
    for _, text in segments:
        snippet = text[:min(600, budget)]
        if len(snippet) > budget:
            snippet = snippet[:budget]
        if snippet and snippet not in selected:
            selected.append(snippet)
            budget -= len(snippet)
        if budget <= 0 or len(selected) >= 3:
            break
    return "\n\n".join(selected)


class EntireMemory:
    """Entire session retrieval plus checkpoint provenance for one local run."""

    def __init__(self, repo: str):
        self.repo = str(Path(repo).resolve())
        self.reason: str | None = None

    def available(self) -> bool:
        if not shutil.which("entire"):
            self.reason = "Entire CLI is not installed"
            return False
        try:
            auth = _json_stdout(_run(["entire", "auth", "status", "--json"],
                                     self.repo, timeout=10).stdout)
            if (not isinstance(auth, dict) or not auth.get("logged_in")) and not os.getenv("ENTIRE_TOKEN"):
                self.reason = "Entire login is required; run `entire login`"
                return False
            status = _run(["entire", "status", "--json"], self.repo, timeout=10)
            payload = _json_stdout(status.stdout)
            if status.returncode or not isinstance(payload, dict) or not payload.get("enabled"):
                self.reason = "Entire is not enabled for this repository"
                return False
            return True
        except (OSError, subprocess.TimeoutExpired):
            self.reason = "Entire status check failed"
            return False

    def checkpoint_ids(self) -> set[str]:
        if not shutil.which("entire"):
            return set()
        found: set[str] = set()
        for flags in (["--pending", "--json"], ["--json"]):
            try:
                p = _run(["entire", "checkpoint", "list", *flags], self.repo,
                         timeout=15)
                if not p.returncode:
                    found.update(cid for row in _rows(_json_stdout(p.stdout))
                                 if (cid := _checkpoint_id(row)))
            except (OSError, subprocess.TimeoutExpired):
                pass
        return found

    def new_checkpoint(self, before: set[str]) -> str | None:
        after = self.checkpoint_ids()
        fresh = sorted(after - before)
        return fresh[-1] if fresh else None

    def search(self, query: str, limit: int = 3,
               budget_tokens: int = 300) -> dict:
        if budget_tokens <= 0:
            return {"matches": [], "reason": "DeadEnd context budget is already full"}
        hits: list[dict] = []
        reason = None
        if self.available():
            try:
                p = _run(["entire", "search", query[:1000], "--json", "--compact",
                          "--limit", str(limit)], self.repo, timeout=35)
                if p.returncode:
                    reason = (p.stderr or p.stdout).strip()[-240:] or "Entire search failed"
                else:
                    hits.extend(_rows(_json_stdout(p.stdout)))
            except (OSError, subprocess.TimeoutExpired):
                reason = "Entire hosted search timed out or could not start"
        else:
            reason = self.reason
        # Search local checkpoints too: recent work may not have been pushed
        # to Entire yet, but its transcript is already in this repo's Git data.
        terms = set(re.findall(r"[a-z0-9_]{3,}", query.lower()))
        try:
            local = _run(["entire", "checkpoint", "list", "--json"], self.repo,
                         timeout=15)
            if local.returncode == 0:
                for row in _rows(_json_stdout(local.stdout)):
                    blob = " ".join(str(row.get(k, "")) for k in
                                    ("title", "prompt", "intent", "summary", "message", "files"))
                    score = len(terms.intersection(re.findall(r"[a-z0-9_]{3,}", blob.lower())))
                    if score >= 2:
                        row = dict(row)
                        row.setdefault("score", score)
                        hits.append(row)
        except (OSError, subprocess.TimeoutExpired):
            pass
        unique: dict[str, dict] = {}
        for hit in hits:
            cid = _checkpoint_id(hit)
            key = cid or json.dumps(hit, sort_keys=True, default=str)
            unique.setdefault(key, hit)
        hits = list(unique.values())[:min(limit, max(1, budget_tokens // 80))]
        matches = []
        remaining_chars = max(0, budget_tokens * 4)
        for hit in hits:
            cid = _checkpoint_id(hit)
            title = str(hit.get("title") or hit.get("prompt") or
                        hit.get("description") or "Entire session")[:220]
            snippet = str(hit.get("match_snippet") or hit.get("snippet") or
                          hit.get("summary") or "")[:500]
            context = _transcript_text(cid, self.repo, query, remaining_chars) if cid else ""
            if not context:
                context = (snippet or title)[:remaining_chars]
            remaining_chars = max(0, remaining_chars - len(context))
            if not context and budget_tokens:
                continue
            matches.append({
                "source": "entire",
                "entire_checkpoint_id": cid,
                "title": title,
                "snippet": snippet,
                "context": context,
                "repo": hit.get("repo"),
                "score": hit.get("score"),
                "verified": False,
            })
        return {"matches": matches, "reason": None if matches else reason}
