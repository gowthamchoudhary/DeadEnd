"""Auth routes: GitHub OAuth (web), device-code flow (extension),
/api-token create+revoke, /me."""
import datetime as dt
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import ApiToken, AuditLog, DeviceCode, Team, User
from ..security import (COOKIE_NAME, current_user, issue_session, new_api_token,
                        read_session_user)

S = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN = "https://github.com/login/oauth/access_token"
GITHUB_USER = "https://api.github.com/user"


def _callback_url() -> str:
    """OAuth redirect_uri: DEADEND_OAUTH_REDIRECT_URI wins, else
    BASE_URL + /auth/callback."""
    return S.oauth_redirect_uri or f"{S.base_url}/auth/callback"


def _github_redirect(request: Request, state: str | None = None) -> str:
    return (f"{GITHUB_AUTHORIZE}?client_id={S.github_client_id}"
            f"&redirect_uri={_callback_url()}&state={state or ''}&scope=read:user")


@router.get("/github")
def auth_github():
    """302 to GitHub authorize with signed state."""
    state = secrets.token_urlsafe(16)
    from ..security import _signer
    signed = _signer().sign(state.encode()).decode()
    from fastapi.responses import RedirectResponse
    return RedirectResponse(_github_redirect(request, state=signed), status_code=302)


@router.get("/callback")
def auth_callback(code: str, state: str = "", request: Request = None,
                  db: Session = Depends(get_db)):
    from ..security import _signer
    try:
        _signer().unsign(state.encode())
    except Exception:
        raise HTTPException(400, "bad oauth state")
    with httpx.Client(timeout=15) as c:
        tok = c.post(GITHUB_TOKEN, data={
            "client_id": S.github_client_id, "client_secret": S.github_client_secret,
            "code": code, "redirect_uri": _callback_url()},
            headers={"Accept": "application/json"}).json()
        access = tok.get("access_token")
        if not access:
            raise HTTPException(401, f"github oauth failed: {tok.get('error_description')}")
        gh = c.get(GITHUB_USER, headers={"Authorization": f"Bearer {access}"}).json()
    user = db.execute(select(User).where(User.github_id == str(gh["id"]))).scalar_one_or_none()
    if not user:
        user = User(github_id=str(gh["id"]), login=gh["login"], name=gh.get("name"),
                    avatar_url=gh.get("avatar_url"))
        db.add(user)
        db.flush()
    from fastapi.responses import RedirectResponse
    resp = RedirectResponse(f"{S.web_origin.rstrip('/')}/app", status_code=302)
    issue_session(resp, user.id)
    return resp


# ------------------------------------------------------------- device-code flow
@router.post("/device/start")
def device_start(team_id: str | None = None, db: Session = Depends(get_db)):
    dc = secrets.token_urlsafe(24)
    uc = "-".join(secrets.token_hex(2).upper() for _ in range(3))
    db.add(DeviceCode(device_code=dc, user_code=uc, team_id=team_id,
                      expires_at=dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)))
    db.commit()
    # approval happens on the WEB app (session-cookie auth there),
    # not on the backend directly
    return {"device_code": dc, "user_code": uc,
            "approve_url": f"{S.web_origin.rstrip('/')}/device?code={uc}",
            "interval": 3, "expires_in": 900}


@router.get("/device/poll")
def device_poll(device_code: str, db: Session = Depends(get_db)):
    d = db.get(DeviceCode, device_code)
    if not d or d.expires_at < dt.datetime.now(dt.timezone.utc):
        raise HTTPException(410, "device code expired")
    if d.status == "approved" and d.api_token_id:
        t = db.get(ApiToken, d.api_token_id)
        return {"status": "approved", "token": getattr(t, "_plain", None)}
    return {"status": d.status}


@router.get("/device/approve")
def device_approve(request: Request, user_code: str, team_id: str | None = None,
                   db: Session = Depends(get_db)):
    u = read_session_user(request, db)
    if not u:
        raise HTTPException(401, "sign in on the web app first")
    d = db.execute(select(DeviceCode).where(DeviceCode.user_code == user_code.upper())).scalar_one_or_none()
    if not d or d.expires_at < dt.datetime.now(dt.timezone.utc):
        raise HTTPException(410, "device code expired")
    if d.status == "approved":
        return {"status": "approved"}
    team_id = team_id or d.team_id
    if not team_id:
        raise HTTPException(400, "team_id required to scope the token")
    plain, sha = new_api_token()
    t = ApiToken(user_id=u.id, token_sha256=sha, label="device",
                 scopes={"teams": [team_id]})
    db.add(t)
    db.flush()
    d.status, d.api_token_id, d.approved_by = "approved", t.id, u.id
    db.add(AuditLog(actor=u.id, action="device_token_created", target=t.id,
                    detail={"team_id": team_id}))
    t._plain = plain
    db.commit()
    return {"status": "approved", "team_id": team_id}


@router.post("/device/resume")
def device_resume(device_code: str, db: Session = Depends(get_db)):
    """Poll after approval returns the plaintext token once (held in memory)."""
    d = db.get(DeviceCode, device_code)
    if not d or d.status != "approved":
        raise HTTPException(404, "not approved yet")
    t = db.get(ApiToken, d.api_token_id)
    plain = getattr(t, "_plain", None)
    if getattr(t, "_plain_sent", False) or plain is None:
        raise HTTPException(409, "token already delivered once")
    t._plain_sent = True
    return {"token": plain, "team_id": d.team_id}


@router.get("/me")
def me(u: User = Depends(current_user), db: Session = Depends(get_db)):
    from ..models import TeamMember
    teams = db.execute(select(TeamMember).where(TeamMember.user_id == u.id)).scalars().all()
    return {"id": u.id, "login": u.login, "name": u.name,
            "avatar_url": u.avatar_url,
            "teams": [{"team_id": t.team_id, "role": t.role} for t in teams]}


class TokenIn(BaseModel):
    label: str = ""


@router.post("/tokens")
def token_create(body: TokenIn, u: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    plain, sha = new_api_token()
    t = ApiToken(user_id=u.id, token_sha256=sha, label=body.label)
    db.add(t)
    db.add(AuditLog(actor=u.id, action="api_token_created", target=t.id))
    db.commit()
    t._plain = plain
    return {"token": plain, "id": t.id}


@router.delete("/tokens/{token_id}")
def token_revoke(token_id: str, u: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    t = db.get(ApiToken, token_id)
    if not t or t.user_id != u.id:
        raise HTTPException(404, "token not found")
    t.revoked_at = dt.datetime.now(dt.timezone.utc)
    db.add(AuditLog(actor=u.id, action="api_token_revoked", target=token_id))
    db.commit()
    return {"revoked": True}
