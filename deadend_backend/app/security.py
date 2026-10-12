"""Auth/session primitives: signed httpOnly cookie sessions, hashed
per-user API tokens, token-bucket rate limiting, team membership checks."""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
import threading
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, TimestampSigner
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import ApiToken, TeamMember, User

S = get_settings()
_SIGNER: TimestampSigner | None = None


def _signer() -> TimestampSigner | None:
    global _SIGNER
    if _SIGNER is None and S.auth_secret:
        _SIGNER = TimestampSigner(S.auth_secret)
    return _SIGNER


# --------------------------------------------------------------- session cookie
COOKIE_NAME = "deadend_session"


def issue_session(resp: Response, user_id: str) -> None:
    s = _signer()
    if not s:
        raise HTTPException(500, "auth_secret not configured")
    val = s.sign(user_id.encode()).decode()
    resp.set_cookie(COOKIE_NAME, val, max_age=S.session_ttl_seconds, httponly=True,
                    samesite="lax", secure=S.env != "dev", path="/")


def read_session_user(request: Request, db: Session) -> User | None:
    raw = request.cookies.get(COOKIE_NAME)
    if not raw:
        return None
    s = _signer()
    try:
        user_id = s.unsign(raw, max_age=S.session_ttl_seconds).decode()
    except (BadSignature, SignatureExpired):
        return None
    return db.get(User, user_id)


# ------------------------------------------------------------------- api tokens
def new_api_token() -> tuple[str, str]:
    """Returns (plaintext, sha256). Plaintext shown once, never stored."""
    tok = "dde_" + secrets.token_urlsafe(32)
    return tok, hashlib.sha256(tok.encode()).hexdigest()


def user_from_api_token(request: Request, db: Session) -> User | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    sha = hashlib.sha256(auth[7:].encode()).hexdigest()
    t = db.execute(select(ApiToken).where(ApiToken.token_sha256 == sha,
                                          ApiToken.revoked_at.is_(None))).scalar_one_or_none()
    if not t:
        return None
    t.last_used_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    return db.get(User, t.user_id)


# ------------------------------------------------------------------ rate limits
class RateLimiter:
    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] < now - 60:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            return True


RATE = RateLimiter()


async def check_rate(request: Request, per_user: int | None = None):
    ip = (request.headers.get("x-forwarded-for", "").split(",")[0] or
          (request.client.host if request.client else "anon"))
    if not RATE.hit(f"ip:{ip}", S.rate_limit_ip_per_min):
        raise HTTPException(429, "rate limit (ip)")
    if per_user and not RATE.hit(f"u:{per_user}", S.rate_limit_per_min):
        raise HTTPException(429, "rate limit (user)")


# -------------------------------------------------------------- current actor
def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    u = read_session_user(request, db) or user_from_api_token(request, db)
    if not u:
        raise HTTPException(401, "not authenticated")
    return u


def require_admin_settings():
    if not S.auth_secret:
        raise HTTPException(500, "auth_secret not configured")


# ------------------------------------------------------------- team membership
def member_role(db: Session, team_id: str, user_id: str) -> str | None:
    m = db.execute(select(TeamMember).where(TeamMember.team_id == team_id,
                                            TeamMember.user_id == user_id)).scalar_one_or_none()
    return m.role if m else None


def require_role(db: Session, team_id: str, user_id: str, need: tuple[str, ...] = ("owner", "admin", "member")) -> str:
    role = member_role(db, team_id, user_id)
    if not role or role not in need:
        raise HTTPException(403, "not a member of this team")
    return role
