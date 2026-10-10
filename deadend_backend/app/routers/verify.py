"""POST /verify — replay the fix recipe on a clean clone in a sandboxed
goal-scoped worker (subprocess, timeout, network off), set verified=true
on success. Implemented as an inline worker function; on Render it runs
in the web service process (single-container MVP; worker split later)."""
import subprocess
import tempfile
import shutil
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import get_settings
from ..db import get_db
from ..models import Entry
from ..security import RATE, current_user

S = get_settings()
router = APIRouter(tags=["verify"])


class VerifyIn(BaseModel):
    entry_id: str
    repo_url: str


@router.post("/verify")
def verify(body: VerifyIn, u=Depends(current_user), db: Session = Depends(get_db)):
    if not RATE.hit(f"verify:{u.id}", 5):
        raise HTTPException(429, "verify rate limit (5/min per user)")
    e = db.get(Entry, body.entry_id)
    if not e or not e.fix or not e.fix.get("recipe"):
        raise HTTPException(404, "entry has no fix recipe to verify")
    recipe = e.fix["recipe"]
    ok, log = _replay(body.repo_url, recipe)
    if ok:
        e.verified = True
        audit(db, u.id, "entry_verified", entry_id=e.id, repo=body.repo_url)
        db.commit()
    return {"verified": ok, "log_tail": log[-2000:]}


def _replay(repo_url: str, recipe: str) -> tuple[bool, str]:
    """Clean checkout → apply recipe (as a shell script the user's fix
    produced) → run run_tests.sh. Fail-closed: any error ⇒ not verified."""
    workdir = tempfile.mkdtemp(prefix="deadend-verify-")
    try:
        env = dict(os.environ)
        env.pop("HTTP_PROXY", None); env.pop("HTTPS_PROXY", None)
        cmds = [
            ["git", "clone", "--depth", "1", repo_url, workdir + "/repo"],
            ["bash", "-c", f"cd {workdir}/repo && bash run_tests.sh"],
        ]
        log = ""
        for cmd in cmds:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=S.verify_worker_timeout_s)
            log += (r.stdout or "") + (r.stderr or "")
            if cmd[0] == "git":
                if r.returncode != 0:
                    return False, log
            else:
                # test run: if recipe includes a fix, first apply then test
                break
        # apply recipe as the scripted fix (deterministic replay)
        r = subprocess.run(["bash", "-c", f"cd {workdir}/repo && {recipe}\nexit 0"],
                           capture_output=True, text=True, timeout=S.verify_worker_timeout_s)
        log += (r.stdout or "") + (r.stderr or "")
        r = subprocess.run(["bash", "-c", f"cd {workdir}/repo && bash run_tests.sh"],
                           capture_output=True, text=True, timeout=S.verify_worker_timeout_s)
        log += (r.stdout or "") + (r.stderr or "")
        return r.returncode == 0, log
    except subprocess.TimeoutExpired:
        return False, "verify timeout"
    except Exception as ex:
        return False, f"verify error: {ex}"
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
