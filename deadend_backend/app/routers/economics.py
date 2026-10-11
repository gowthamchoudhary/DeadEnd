"""GET /economics?team_id= — DeadEnd's REAL usage as CFO.ai-plan inputs.

Measured data (always computed from real rows, null when absent):
  runs / tokens in+out per agent / avg duration / success rate <- runs
  reuse events (kind=real)                                     <- reuse_events
  context vs baseline delta for the SAME project (null when either
  side has no data for a project)                              <- runs.context_used
  cost per run = real tokens x USER-entered prices             <- team_economics.prices

Assumption fields (user-entered, stored in team_economics, served verbatim):
  model prices per 1M tokens, Render/Supabase monthly costs, pricing
  tiers, cash/burn, growth multiplier, business plan URL.

Safe migration: the team_economics table is created by the existing
create_all() on boot (new table, no existing-table alterations).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..models import Project, ReuseEvent, Run, TeamEconomics, TeamMember
from ..security import RATE, current_user

router = APIRouter(prefix="/economics", tags=["economics"])


# --------------------------------------------------------------- helpers
def _team_or_403(db: Session, team_id: str, user_id: str) -> None:
    m = db.execute(select(TeamMember).where(TeamMember.team_id == team_id,
                                            TeamMember.user_id == user_id)
                   ).scalar_one_or_none()
    if not m:
        raise HTTPException(403, "not a member")


def _rows(db: Session, team_id: str) -> list[Run]:
    return db.execute(select(Run).where(Run.team_id == team_id)
                      .order_by(Run.started_at.desc()).limit(10000)
                      ).scalars().all()


def _econ_row(db: Session, team_id: str) -> TeamEconomics:
    e = db.get(TeamEconomics, team_id)
    if not e:
        e = TeamEconomics(team_id=team_id)
        db.add(e)
        db.flush()
    return e


def _agent_stats(rows: list[Run]) -> dict:
    """Measured per-agent aggregates."""
    if not rows:
        return {"runs": 0, "tokens_in": None, "tokens_out": None,
                "avg_duration_s": None, "success_rate": None}
    known = [r for r in rows if r.tokens_in is not None or r.tokens_out is not None]
    tok_in = [r.tokens_in for r in known if r.tokens_in is not None]
    tok_out = [r.tokens_out for r in known if r.tokens_out is not None]
    durs = [r.duration for r in rows if r.duration is not None]
    ok = sum(1 for r in rows if r.status == "success")
    return {
        "runs": len(rows),
        "tokens_in": sum(tok_in) if tok_in else None,
        "tokens_out": sum(tok_out) if tok_out else None,
        "avg_duration_s": round(sum(durs) / len(durs), 1) if durs else None,
        "success_rate": round(ok / len(rows), 4),
    }


def _cost_of(agent_rows: list[Run], price: dict) -> float | None:
    """Real tokens x user price per 1M tokens. Null when the agent has no
    price entered or no rows reported tokens."""
    if not agent_rows:
        return None
    known = [r for r in agent_rows if r.tokens_in is not None or r.tokens_out is not None]
    if not known:
        return None
    pin = price.get("per_mtok_in")
    pout = price.get("per_mtok_out")
    if not pin and not pout:
        return None
    cost = 0.0
    for r in known:
        cost += (r.tokens_in or 0) / 1e6 * (pin or 0) + \
                (r.tokens_out or 0) / 1e6 * (pout or 0)
    return round(cost, 6)


def _context_delta(rows: list[Run]) -> list[dict] | None:
    """Measured difference between runs WITH retrieved context and WITHOUT
    for the same project. Null when no project has both sides."""
    by_project: dict = {}
    for r in rows:
        by_project.setdefault(r.project_id, []).append(r)
    deltas = []
    for pid, prows in by_project.items():
        w = [r for r in prows if (r.context_pack or {}).get("context_used")]
        wo = [r for r in prows if not (r.context_pack or {}).get("context_used")]
        if not w or not wo:
            continue  # null when either side has no data
        w_tok = [(r.tokens_in or 0) + (r.tokens_out or 0)
                 for r in w if r.tokens_in is not None or r.tokens_out is not None]
        wo_tok = [(r.tokens_in or 0) + (r.tokens_out or 0)
                  for r in wo if r.tokens_in is not None or r.tokens_out is not None]
        w_dur = [r.duration for r in w if r.duration is not None]
        wo_dur = [r.duration for r in wo if r.duration is not None]
        deltas.append({
            "project_id": pid,
            "with_runs": len(w), "without_runs": len(wo),
            "tokens_per_run_with": round(sum(w_tok) / len(w_tok), 1) if w_tok else None,
            "tokens_per_run_without": round(sum(wo_tok) / len(wo_tok), 1) if wo_tok else None,
            "duration_per_run_with": round(sum(w_dur) / len(w_dur), 1) if w_dur else None,
            "duration_per_run_without": round(sum(wo_dur) / len(wo_dur), 1) if wo_dur else None,
            "success_with": round(sum(1 for r in w if r.status == "success") / len(w), 4),
            "success_without": round(sum(1 for r in wo if r.status == "success") / len(wo), 4),
        })
    return deltas or None


# ----------------------------------------------------------------- routes
@router.get("")
def economics(team_id: str, u=Depends(current_user),
              db: Session = Depends(get_db)):
    _team_or_403(db, team_id, u.id)
    rows = _rows(db, team_id)
    e = _econ_row(db, team_id)
    prices = e.prices or {}

    # measured: per-agent stats + priced cost
    by_agent: dict[str, list[Run]] = {}
    for r in rows:
        by_agent.setdefault(r.agent, []).append(r)
    agents = {}
    for agent, arows in sorted(by_agent.items()):
        st = _agent_stats(arows)
        st["source"] = "measured"
        cost = _cost_of(arows, prices.get(agent) or {})
        st["cost_usd"] = cost
        st["cost_source"] = "measured" if cost is not None else None
        agents[agent] = st

    # measured: per-run averages across all agents
    known = [r for r in rows if r.tokens_in is not None or r.tokens_out is not None]
    per_run_tokens = round(sum((r.tokens_in or 0) + (r.tokens_out or 0)
                               for r in known) / len(known), 1) if known else None
    durs = [r.duration for r in rows if r.duration is not None]
    per_run_duration = round(sum(durs) / len(durs), 1) if durs else None
    successes = sum(1 for r in rows if r.status == "success")
    success_rate = round(successes / len(rows), 4) if rows else None

    # measured: reuse events (kind=real) recorded against this team's entries
    team_run_ids = {r.id for r in rows}
    real_reuses = 0
    if rows:
        team_project_ids = set(
            db.execute(select(Project.id).where(Project.team_id == team_id))
            .scalars().all())
        if team_project_ids:
            ev_rows = db.execute(select(ReuseEvent)).scalars().all()
            real_reuses = sum(
                1 for x in ev_rows
                if x.kind == "real" and x.run_id in team_run_ids)

    # measured: tokens/time saved per run with context vs baseline
    tokens_saved_per_reuse = None
    time_saved_per_reuse = None
    if rows:
        with_rows = [r for r in rows if (r.context_pack or {}).get("context_used")]
        wo_rows = [r for r in rows if not (r.context_pack or {}).get("context_used")]
        w_tok = [(r.tokens_in or 0) + (r.tokens_out or 0)
                 for r in with_rows if r.tokens_in is not None or r.tokens_out is not None]
        wo_tok = [(r.tokens_in or 0) + (r.tokens_out or 0)
                  for r in wo_rows if r.tokens_in is not None or r.tokens_out is not None]
        if w_tok and wo_tok:
            tokens_saved_per_reuse = round((sum(wo_tok) / len(wo_tok)) -
                                           (sum(w_tok) / len(w_tok)), 1)
        w_dur = [r.duration for r in with_rows if r.duration is not None]
        wo_dur = [r.duration for r in wo_rows if r.duration is not None]
        if w_dur and wo_dur:
            time_saved_per_reuse = round((sum(wo_dur) / len(wo_dur)) -
                                         (sum(w_dur) / len(w_dur)), 1)

    # cost per run: real tokens x user prices, priced runs only
    cost_per_run = None
    if known and any((p or {}).get("per_mtok_in") or (p or {}).get("per_mtok_out")
                     for p in prices.values()):
        priced = 0.0
        n = 0
        for r in known:
            p = prices.get(r.agent) or {}
            if p.get("per_mtok_in") or p.get("per_mtok_out"):
                priced += ((r.tokens_in or 0) / 1e6 * (p.get("per_mtok_in") or 0) +
                           (r.tokens_out or 0) / 1e6 * (p.get("per_mtok_out") or 0))
                n += 1
        if n:
            cost_per_run = round(priced / n, 6)

    ru = _reuses_per_run(rows, real_reuses)
    return {
        "team_id": team_id,
        "measured": {
            "runs_total": len(rows),
            "per_agent": agents,
            "tokens_per_run": per_run_tokens,
            "duration_per_run_s": per_run_duration,
            "success_rate": success_rate,
            "cost_per_run_usd": cost_per_run,
            "cost_source": "measured" if cost_per_run is not None else None,
            "reuse_events": real_reuses,
            "reuses_per_run": ru,
            "tokens_saved_per_reuse": tokens_saved_per_reuse,
            "time_saved_per_reuse_s": time_saved_per_reuse,
            "context_delta_by_project": _context_delta(rows),
        },
        "assumptions": {
            "prices_per_mtok": prices,
            "render_monthly_usd": e.render_monthly,
            "supabase_monthly_usd": e.supabase_monthly,
            "tiers": e.tiers or [],
            "cash_on_hand_usd": e.cash_on_hand,
            "burn_monthly_usd": e.burn_monthly,
            "growth_x": e.growth_x,
        },
        "business_plan": {
            "url": e.business_plan_url or None,   # null until set; landing link hidden
            "title": e.business_plan_title or None,
        },
    }


def _reuses_per_run(rows: list[Run], reuse_count: int) -> float | None:
    """Measured: real reuse events per recorded run. Null when no runs."""
    return round(reuse_count / len(rows), 4) if len(rows) else None


class PricesIn(BaseModel):
    team_id: str
    prices: dict = Field(default_factory=dict)  # {agent: {per_mtok_in, per_mtok_out}}


@router.put("/prices")
def put_prices(body: PricesIn, u=Depends(current_user),
               db: Session = Depends(get_db)):
    _team_or_403(db, body.team_id, u.id)
    if not RATE.hit(f"econ:{u.id}", 30):
        raise HTTPException(429, "rate limit")
    e = _econ_row(db, body.team_id)
    e.prices = body.prices
    audit(db, u.id, "economics_prices_updated", target=body.team_id)
    db.commit()
    return {"team_id": body.team_id, "prices": e.prices}


@router.get("/prices")
def get_prices(team_id: str, u=Depends(current_user),
               db: Session = Depends(get_db)):
    _team_or_403(db, team_id, u.id)
    e = _econ_row(db, team_id)
    return {"team_id": team_id, "prices": e.prices or {}}


class EconSettingsIn(BaseModel):
    team_id: str
    render_monthly: float | None = None
    supabase_monthly: float | None = None
    tiers: list[dict] | None = None
    cash_on_hand: float | None = None
    burn_monthly: float | None = None
    growth_x: float | None = None
    business_plan_url: str | None = Field(default=None, max_length=2000)
    business_plan_title: str | None = Field(default=None, max_length=200)


@router.put("/settings")
def put_settings(body: EconSettingsIn, u=Depends(current_user),
                 db: Session = Depends(get_db)):
    _team_or_403(db, body.team_id, u.id)
    if not RATE.hit(f"econ:{u.id}", 30):
        raise HTTPException(429, "rate limit")
    e = _econ_row(db, body.team_id)
    if body.render_monthly is not None:
        e.render_monthly = body.render_monthly
    if body.supabase_monthly is not None:
        e.supabase_monthly = body.supabase_monthly
    if body.tiers is not None:
        e.tiers = body.tiers
    if body.cash_on_hand is not None:
        e.cash_on_hand = body.cash_on_hand
    if body.burn_monthly is not None:
        e.burn_monthly = body.burn_monthly
    if body.growth_x is not None:
        e.growth_x = body.growth_x
    if body.business_plan_url is not None:
        e.business_plan_url = body.business_plan_url.strip()
    if body.business_plan_title is not None:
        e.business_plan_title = body.business_plan_title.strip()
    audit(db, u.id, "economics_settings_updated", target=body.team_id)
    db.commit()
    return {"team_id": body.team_id, "saved": True}
