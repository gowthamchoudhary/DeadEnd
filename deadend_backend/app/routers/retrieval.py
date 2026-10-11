"""POST /retrieve — exact signature first, then rank by confidence with
private above global, env-filtered, budget-capped context pack with
injection patterns stripped from global content."""
import datetime as dt
import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..confidence import score
from ..config import get_settings
from ..db import get_db
from ..models import Entry, ReuseEvent, TeamMember
from ..normalize import signature_hash
from ..scans import strip_injection_from_context
from ..security import RATE, current_user

S = get_settings()
router = APIRouter(tags=["retrieval"])


class RetrieveIn(BaseModel):
    team_id: str
    error_text: str = Field(max_length=20000)
    env_fingerprint: dict = Field(default_factory=dict)
    task: str = Field(default="", max_length=2000)
    include_global: bool = True
    budget_tokens: int = Field(default=S.budget_default_tokens, le=4000)


@router.post("/retrieve")
def retrieve(body: RetrieveIn, request=None, u=Depends(current_user),
             db: Session = Depends(get_db)):
    # membership required (private scope always team-scoped)
    if not db.execute(select(TeamMember).where(TeamMember.team_id == body.team_id,
                                               TeamMember.user_id == u.id)).scalar_one_or_none():
        raise HTTPException(403, "not a member of this team")
    check_rate_per_user(u.id, 120)

    sig = signature_hash(body.error_text)
    now = dt.datetime.now(dt.timezone.utc)

    q = select(Entry).where(Entry.signature_hash == sig)
    exacts = db.execute(q).scalars().all()

    # fallback: semantic-ish ranking on shared tokens (pgvector path ready; see app/embeddings.py)
    cands = db.execute(select(Entry).order_by(Entry.last_reuse_at.desc().nullslast(),
                                              Entry.created_at.desc()).limit(200)).scalars().all()
    pool, seen = list(exacts), set()
    for e in exacts:
        seen.add(e.id)
    terms = set(_terms(body.error_text))
    for e in cands:
        if e.id in seen:
            continue
        blob = f"{e.signature_normalized} {e.redacted_error_text}".lower()
        inter = len(terms & set(_terms(blob)))
        if inter >= 2:
            pool.append(e)

    pool = [e for e in pool
            if e.scope == "private" and e.team_id == body.team_id
            or (body.include_global and e.scope == "global")]

    results = []
    for e in pool:
        env = e.env_fingerprint or {}
        cur = body.env_fingerprint
        e_m = _env_match(env, cur)
        if e_m < 0.3:
            continue
        reuses = db.execute(select(ReuseEvent).where(ReuseEvent.entry_id == e.id)).scalars().all()
        cf = score(e.fix, [dict(kind=r.kind, outcome=r.outcome,
                                env_match_weight=r.env_match_weight,
                                env_fingerprint=r.env_fingerprint) for r in reuses],
                   cur, env, getattr(e, "last_reuse_at", None), now)
        priv = 1 if e.scope == "private" else 0
        pack_bits = {
            "entry_id": e.id, "scope": e.scope, "seeded": e.seeded,
            "verified": e.verified,
            "signature": strip_injection_from_context((e.signature_normalized or "")[:200]),
            "error": strip_injection_from_context((e.redacted_error_text or "")[:400]),
            "dead_ends": [strip_injection_from_context(a.get("why_it_failed") or "")
                          for a in e.attempts_graph[:6]],
            "constraints": [strip_injection_from_context(c) for c in e.constraints[:5]],
            "fix": (strip_injection_from_context(json.dumps(e.fix)) if e.fix else None),
            "confidence": cf,
        }
        results.append((priv, cf["score"], pack_bits))
    results.sort(key=lambda t: (-t[0], -t[1]))

    pack, used = [], 0
    for _, _, bits in results:
        blk = json.dumps(bits, default=str)
        if used + len(blk) > body.budget_tokens * 4:  # ~4 chars/token budget
            break
        pack.append(blk)
        used += len(blk)
    return {"signature_hash": sig, "results": [r for _, _, r in results],
            "pack": pack, "pack_tokens_est": used // 4}


def check_rate_per_user(uid: str, limit: int):
    if not RATE.hit(f"uid:{uid}", limit):
        raise HTTPException(429, "rate limit (user)")


def _terms(t: str) -> set[str]:
    return set(w for w in t.lower().split()) & set(
        w for w in ("error", "exception", "failed", "traceback", "panic",
                    "null", "none", "undefined", "cors", "timeout", "refused"))


def _env_match(a: dict, b: dict) -> float:
    from ..confidence import env_match
    return env_match(a, b)
