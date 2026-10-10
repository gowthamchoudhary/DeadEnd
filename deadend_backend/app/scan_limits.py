from fastapi import HTTPException, Request

from .config import get_settings

S = get_settings()

ALLOWED_JSON = ("application/json",)


async def check_body(request: Request):
    clen = int(request.headers.get("content-length", "0") or 0)
    if clen > S.max_body_bytes:
        raise HTTPException(413, "body too large")
    ctype = request.headers.get("content-type", "")
    if request.method in ("POST", "PUT", "PATCH") and "json" not in ctype:
        raise HTTPException(415, "content-type must be application/json")
