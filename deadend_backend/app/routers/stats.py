"""/stats/agents — per-agent run aggregates.

Returns, per agent: run count, success rate, average attempt steps,
avg/max tokens (in+out), avg duration — and the same numbers split for
runs WITH retrieved context vs WITHOUT (context_used flag reported by
the runner in POST /runs/{id}/summary).
"""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Run, TeamMember
from ..security import current_user

router = APIRouter(prefix="/stats", tags=["stats"])


def _agg(rows: list[Run]) -> dict:
    """Aggregate one subset of runs."""
    n = len(rows)
    if not n:
        return {"runs": 0, "success_rate": None, "avg_attempts": None,
                "avg_tokens": None, "max_tokens": None, "avg_duration_s": None}
    successes = sum(1 for r in rows if r.status == "success")
    attempts = []
    for r in rows:
        a = (r.context_pack or {}).get("attempts")
        if isinstance(a, int):
            attempts.append(a)
    tokens = [(r.tokens_in or 0) + (r.tokens_out or 0)
              for r in rows if r.tokens_in is not None or r.tokens_out is not None]
    durations = [r.duration for r in rows if r.duration is not None]
    return {
        "runs": n,
        "success_rate": round(successes / n, 4),
        "avg_attempts": round(sum(attempts) / len(attempts), 2) if attempts else None,
        "avg_tokens": round(sum(tokens) / len(tokens), 1) if tokens else None,
        "max_tokens": max(tokens) if tokens else None,
        "avg_duration_s": round(sum(durations) / len(durations), 1) if durations else None,
    }


def _context_used(r: Run) -> bool:
    return bool((r.context_pack or {}).get("context_used"))


@router.get("/agents")
def stats_agents(team_id: str, u=Depends(current_user),
                 db: Session = Depends(get_db)):
    member = db.execute(select(TeamMember).where(TeamMember.team_id == team_id,
                                                 TeamMember.user_id == u.id)
                        ).scalar_one_or_none()
    if not member:
        raise HTTPException(403, "not a member")
    rows = db.execute(select(Run).where(Run.team_id == team_id)
                      .order_by(Run.started_at.desc()).limit(10000)
                      ).scalars().all()
    by_agent: dict[str, list[Run]] = defaultdict(list)
    for r in rows:
        by_agent[r.agent].append(r)
    out = {}
    for agent, agent_rows in sorted(by_agent.items()):
        with_ctx = [r for r in agent_rows if _context_used(r)]
        without_ctx = [r for r in agent_rows if not _context_used(r)]
        out[agent] = {
            "all": _agg(agent_rows),
            "with_context": _agg(with_ctx),
            "without_context": _agg(without_ctx),
        }
    return {"team_id": team_id, "agents": out}
