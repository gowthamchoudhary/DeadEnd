"""POST /ingest — trace id and/or checkpoint id → curator → entry/quarantine."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import get_settings
from ..curator_service import curate
from ..db import get_db
from ..models import Entry, Quarantine, TeamMember
from ..security import current_user

S = get_settings()
router = APIRouter(tags=["ingest"])


class IngestIn(BaseModel):
    team_id: str
    trace_id: str
    checkpoint_id: str | None = None
    title: str | None = Field(default=None, max_length=200)


@router.post("/ingest")
def ingest(body: IngestIn, u=Depends(current_user), db: Session = Depends(get_db)):
    if not db.execute(select(TeamMember).where(TeamMember.team_id == body.team_id,
                                               TeamMember.user_id == u.id)).scalar_one_or_none():
        raise HTTPException(403, "not a member of this team")
    result = curate(body.trace_id, body.checkpoint_id)
    if "skip" in result:
        return {"skipped": result["skip"]}
    e = result["entry"]
    if result["quarantine"]:
        q = Quarantine(team_id=body.team_id, payload=e,
                       reasons=result["reasons"]["secrets"] + result["reasons"]["injection"])
        db.add(q)
        db.commit()
        audit(db, u.id, "quarantined", team_id=body.team_id, trace_id=body.trace_id)
        db.commit()
        return {"quarantined": True, "reasons": result["reasons"], "quarantine_id": q.id}
    if db.execute(select(Entry).where(Entry.signature_hash == e["failure"]["signature_hash"],
                                      Entry.team_id == body.team_id)).scalar_one_or_none():
        return {"duplicate": True, "entry_id": None}
    row = Entry(scope="private", team_id=body.team_id,
                signature_hash=e["failure"]["signature_hash"],
                signature_normalized=e["failure"]["signature_normalized"],
                redacted_error_text=e["failure"]["redacted_error_text"],
                title=body.title,
                env_fingerprint={},
                attempts_graph=e["attempts"],
                fix=e["fix"],
                neatlogs_trace_id=body.trace_id,
                entire_checkpoint_id=body.checkpoint_id,
                created_by=u.id,
                meta={"schema": e["schema"], "provenance": e["provenance"]})
    db.add(row)
    db.commit()
    return {"entry_id": row.id, "signature_hash": row.signature_hash}
