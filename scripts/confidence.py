"""DeadEnd confidence scoring — exact spec from the product brief.

Prior:             Beta(1,1)
Verified fix:      starts at alpha=2 (otherwise alpha=1)
Reuse events:      each event is a real replay of this fix/attempt; a
                   successful reuse with environment match adds env-match
                   weight to alpha; a failed reuse adds weight to beta.
                   Weight = environment similarity of that event (1.0 when
                   the fingerprint matches).
Score (read time): alpha/(alpha+beta) * env_match * recency_decay
Observation count: number of real reuse events, always shown next to the
                   score. No fabrication: fewer observations = lower base.
Recency decay:     exp(-hours_since_last_reuse / half_life_hours),
                   half_life default 336 (2 weeks), on last reuse timestamp;
                   never-seen fix decays from its provenance timestamp.
"""
import datetime, math

HALF_LIFE_HOURS = 336.0

def env_match(observed: dict, current: dict) -> float:
    """Environment fingerprint similarity in [0,1].
    language equal -> 0.5; each shared framework tag adds up to 0.3; OS
    equal adds 0.2 (capped at 1.0)."""
    if not observed or not current:
        return 0.5  # no fingerprint info at all — neutral, honest default
    m = 0.0
    if (observed.get("language") or "").split(" ")[0] == (current.get("language") or "").split(" ")[0]:
        m += 0.5
    of = set(observed.get("frameworks") or [])
    cf = set(current.get("frameworks") or [])
    m += 0.3 * min(1.0, len(of & cf) / max(1, len(cf)))
    if observed.get("os") == current.get("os"):
        m += 0.2
    return min(1.0, m)

def _decay(last_ts: str, now=None) -> float:
    if not last_ts:
        return 0.0
    now = now or datetime.datetime.now(datetime.timezone.utc)
    try:
        t = datetime.datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if t.tzinfo is None:
        t = t.replace(tzinfo=datetime.timezone.utc)
    hours = (now - t).total_seconds() / 3600
    return math.exp(-max(0.0, hours) / HALF_LIFE_HOURS)

def confidence(fix: dict, reuse_events: list, cur_env: dict, now=None) -> dict:
    """fix: the fix object of a deadend entry; reuse_events: real events
    for this failure; cur_env: current environment fingerprint.
    Events with kind == "test" are validation/testing entries and are
    excluded from scoring (marked on the Entire-native branch)."""
    verified = bool(fix.get("verified"))
    alpha, beta = (2.0, 1.0) if verified else (1.0, 1.0)
    envs = [ev for ev in reuse_events if ev.get("kind") != "test"]
    for ev in envs:
        w = env_match(ev.get("env_match") or ev.get("environment") or cur_env, cur_env)
        ok = ev.get("outcome") == "success"
        if ok:
            alpha += w
        else:
            beta += w
    base = alpha / (alpha + beta)
    last_ts = None
    if envs:
        last_ts = max((ev.get("recorded_at") or "") for ev in envs) or None
        decay = _decay(last_ts, now)
    else:
        decay = _decay((fix.get("provenance") or {}).get("curated_at")
                       if isinstance(fix.get("provenance"), dict) else None, now)
    e_m = env_match((fix.get("environment") or (envs and envs[-1].get("environment"))), cur_env) \
        if envs else env_match(fix.get("environment"), cur_env)
    score = base * e_m * decay
    return {"score": round(score, 4), "alpha": alpha, "beta": beta,
            "observations": len(envs), "env_match": round(e_m, 3),
            "recency_decay": round(decay, 3), "verified": verified,
            "last_reuse": last_ts}
