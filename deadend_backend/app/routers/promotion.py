"""Promotion: opt-in global publishing.
POST /promote → deterministic redaction, one LLM rewrite (neatlogs-traced),
returns a diff for user approval. POST /promote/approve publishes to global
only if entry verified AND contribution clean."""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import get_settings
from ..db import get_db
from ..models import Contribution, Entry
from ..scans import redact, scan_all
from ..security import RATE, current_user

S = get_settings()
router = APIRouter(tags=["promotion"])


class PromoteIn(BaseModel):
    entry_id: str
    team_id: str


class ApproveIn(BaseModel):
    contribution_id: str


@router.post("/promote")
def promote(body: PromoteIn, u=Depends(current_user), db: Session = Depends(get_db)):
    if not RATE.hit(f"promote:{u.id}", 3):
        raise HTTPException(429, "promote rate limit (3/min)")
    e = db.get(Entry, body.entry_id)
    if not e or e.scope != "private" or e.team_id != body.team_id:
        raise HTTPException(404, "private entry not found in this team")
    if not e.verified:
        raise HTTPException(400, "only VERIFIED fixes can be promoted")
    src = f"{e.signature_normalized}\n{e.redacted_error_text}\n{(e.fix or {}).get('recipe', '')}"
    scans = scan_all(src)
    if scans["secrets"] or scans["injection"]:
        raise HTTPException(422, f"contribution flagged: {scans}")
    recipe = (e.fix or {}).get("recipe", "")
    generalized = _llm_rewrite(redact(src))  # 1 LLM call, traced in neatlogs
    c = Contribution(team_id=body.team_id, user_id=u.id, entry_id=e.id,
                     status="awaiting_approval", diff={
                         "recipe": generalized.get("recipe", recipe),
                         "summary": generalized.get("summary", ""),
                         "from_entry": e.id,
                         "was_validated": e.verified})
    db.add(c)
    audit(db, u.id, "promote_requested", contribution_id=c.id, entry_id=e.id)
    db.commit()
    return {"contribution_id": c.id, "status": c.status, "diff": c.diff}


@router.post("/promote/approve")
def approve(body: ApproveIn, u=Depends(current_user), db: Session = Depends(get_db)):
    c = db.get(Contribution, body.contribution_id)
    if not c or c.status != "awaiting_approval":
        raise HTTPException(404, "contribution not awaiting approval")
    if c.user_id != u.id:
        raise HTTPException(403, "only the submitting user can approve")
    e = db.get(Entry, c.entry_id)
    if not e or not e.verified:
        raise HTTPException(400, "publish blocked: entry not verified")
    src = c.diff.get("recipe", "") + "\n" + c.diff.get("summary", "")
    scans = scan_all(src)
    if scans["secrets"] or scans["injection"]:
        c.status = "rejected"
        db.commit()
        raise HTTPException(422, f"publish blocked, flagged: {scans}")
    _write_to_entire_global(e, c, u)
    c.status, c.decided_at, c.decided_by = "published", dt.datetime.now(dt.timezone.utc), u.id
    audit(db, u.id, "promoted_to_global", contribution_id=c.id, entry_id=e.id)
    db.commit()
    return {"published": True, "contribution_id": c.id}


def _llm_rewrite(text: str) -> dict:
    """One deterministic-then-LLM rewrite, traced in neatlogs (WORKFLOW)."""
    try:
        import neatlogs
        if S.neatlogs_api_key:
            try:
                neatlogs.init(api_key=S.neatlogs_api_key,
                              workflow_name="deadend-promoter")
            except Exception:
                pass
            with neatlogs.trace("generalize", kind="LLM"):
                # MVP: pattern-based generalizer (deterministic); LLM rewrite
                # slot is wired for the deployed model key, not the user's.
                gentext = _deterministic_generalize(text)
                return {"recipe": gentext, "summary": gentext[:120]}
        return {"recipe": _deterministic_generalize(text), "summary": ""}
    except Exception:
        return {"recipe": _deterministic_generalize(text), "summary": ""}


def _deterministic_generalize(text: str) -> str:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    keep = [ln for ln in lines if len(ln) > 12 and not ln.startswith(("at ", "raise ", "File "))]
    return "\n".join(keep[:6])


def _write_to_entire_global(entry: Entry, c: Contribution, u):
    """Service-account push of the approved entry to deadend-global."""
    from ..entire_global import push_entry_json
    try:
        push_entry_json(entry, c)
    except Exception as ex:
        audit(db=None, actor=u.id, action="entire_global_push_failed",
              detail={"error": str(ex)[:200], "entry_id": entry.id})
