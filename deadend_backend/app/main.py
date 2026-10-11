"""DeadEnd backend — FastAPI app assembly."""
from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .scan_limits import check_body
from .routers import (auth, contributions, entries, ingest, invites, misc,
                      overview, promotion, projects, reuse, retrieval, runs,
                      stats, teams)

S = get_settings()

app = FastAPI(title="DeadEnd", version="0.1.0",
              description="Failure-memory platform for coding agents.",
              docs_url="/docs", openapi_url="/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[S.web_origin],   # locked to the web app origin (Session/cors credentials)
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def limits(request: Request, call_next):
    try:
        await check_body(request)
    except HTTPException as ex:
        return JSONResponse({"detail": ex.detail}, status_code=ex.status_code)
    return await call_next(request)


@app.get("/healthz")
def healthz():
    return {"ok": True, "env": S.env}


from .routers.verify import router as verify_router  # noqa: E402

for r in (auth.router, teams.router, retrieval.router, ingest.router,
          entries.router, runs.router, reuse.router, verify_router,
          promotion.router, misc.router, stats.router,
          invites.router, projects.router, contributions.router,
          overview.router):
    app.include_router(r)
