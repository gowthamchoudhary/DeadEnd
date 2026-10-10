"""Confidence scoring — same spec as scripts/confidence.py.
Beta(1,1) prior; verified fix alpha=2; reuse events weighted by env-match
into alpha (success) or beta (failure); kind=test excluded; read-time
score = alpha/(alpha+beta) * env_match * recency_decay; observation count
always surfaced."""
import datetime as dt
import math

HALF_LIFE_HOURS = 336.0


def env_match(observed: dict | None, current: dict | None) -> float:
    if not observed or not current:
        return 0.5
    m = 0.0
    if (observed.get("language") or "?").split(" ")[0] == (current.get("language") or "?").split(" ")[0]:
        m += 0.5
    of = set(observed.get("frameworks") or [])
    cf = set(current.get("frameworks") or [])
    m += 0.3 * min(1.0, len(of & cf) / max(1, len(cf)))
    if observed.get("os") == current.get("os"):
        m += 0.2
    return min(1.0, m)


def _decay(last_ts: dt.datetime | None, now=None) -> float:
    if not last_ts:
        return 0.0
    now = now or dt.datetime.now(dt.timezone.utc)
    if last_ts.tzinfo is None:
        last_ts = last_ts.replace(tzinfo=dt.timezone.utc)
    hours = (now - last_ts).total_seconds() / 3600
    return math.exp(-max(0.0, hours) / HALF_LIFE_HOURS)


def score(fix: dict | None, reuse_events: list, cur_env: dict | None,
          entry_env: dict | None, last_reuse_at=None, now=None) -> dict:
    verified = bool((fix or {}).get("verified"))
    alpha, beta = (2.0, 1.0) if verified else (1.0, 1.0)
    real = [e for e in reuse_events if e.get("kind") != "test"]
    for ev in real:
        w = float(ev.get("env_match_weight", 1.0))
        if ev.get("outcome") == "success":
            alpha += w
        else:
            beta += w
    base = alpha / (alpha + beta)
    decay = _decay(last_reuse_at, now) if real else 0.0
    if not real:
        decay = _decay(_entry_created_at(fix), now)
    try:
        e_m = env_match([e for e in real][-1].get("env_fingerprint"), cur_env) if real \
            else env_match(entry_env, cur_env)
    except Exception:
        e_m = 0.5
    return {"score": round(base * e_m * decay, 4), "alpha": alpha, "beta": beta,
            "observations": len(real), "env_match": round(e_m, 3),
            "recency_decay": round(decay, 3), "verified": verified}


def _entry_created_at(fix):
    p = (fix or {}).get("provenance")
    if isinstance(p, dict):
        c = p.get("curated_at")
        if isinstance(c, str):
            try:
                return dt.datetime.fromisoformat(c.replace("Z", "+00:00"))
            except ValueError:
                pass
    return None
