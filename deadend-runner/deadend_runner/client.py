"""HTTP client for the DeadEnd backend, used by the MCP server and CLI.

Holds ONLY the user's DeadEnd token (DEADEND_TOKEN). Never reads or
forwards any agent credential (ANTHROPIC_API_KEY, OPENAI_API_KEY,
GITHUB_CLASSIC_PAT, gh auth tokens...). Token is attached as a Bearer
header to the configured DEADEND_BACKEND URL and nowhere else.
"""
import os

import httpx


class Backend:
    def __init__(self, base_url: str, token: str, team_id: str):
        self.base = base_url.rstrip("/")
        self.token = token
        self.team_id = team_id

    @classmethod
    def from_env(cls) -> "Backend":
        tok = os.environ.get("DEADEND_TOKEN")
        if not tok:
            raise SystemExit(
                "DEADEND_TOKEN not set (get a token from the DeadEnd web app)")
        return cls(os.environ.get("DEADEND_BACKEND",
                                  "https://deadend-4wyx.onrender.com"),
                   tok,
                   os.environ.get("DEADEND_TEAM", ""))

    # ------------------------------------------------------------------
    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json"}

    def _post(self, path: str, body: dict) -> dict:
        r = httpx.post(f"{self.base}{path}", json=body,
                       headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.json() if r.text else {}

    def _patch(self, path: str, body: dict) -> dict:
        r = httpx.patch(f"{self.base}{path}", json=body,
                        headers=self._headers(), timeout=60)
        r.raise_for_status()
        return r.json() if r.text else {}

    # ---------------------------------------------------------------- -- API
    def retrieve(self, error_text: str, env_fingerprint: dict,
                 task: str) -> dict:
        return self._post("/retrieve", {
            "team_id": self.team_id, "error_text": error_text,
            "env_fingerprint": env_fingerprint or {}, "task": task,
            "include_global": True, "budget_tokens": 1500})

    def create_run(self, task: str, repo_url: str | None, agent: str) -> dict:
        return self._post("/runs", {"team_id": self.team_id, "task": task,
                                    "repo_url": repo_url, "agent": agent})

    def run_event(self, run_id: str, phase: str, payload: dict) -> dict:
        return self._post(f"/runs/{run_id}/events",
                          {"phase": phase, "payload": payload})

    def finish_run(self, run_id: str, status: str) -> dict:
        return self._post(f"/runs/{run_id}/finish?status={status}", {})

    def summarize_run(self, run_id: str, agent: str, agent_version, model,
                      tokens_in, tokens_out, duration,
                      context_used: bool) -> dict:
        body = {"agent": agent,
                "agent_version": agent_version,
                "model": model,
                "tokens_in": tokens_in, "tokens_out": tokens_out,
                "duration": duration, "context_used": context_used}
        return self._patch(f"/runs/{run_id}/summary", body)

    def ingest_fix(self, run_id: str, task: str, fix: dict,
                   verified: bool) -> dict:
        # record-phase run event; promotion paths go through /promote
        return self.run_event(run_id, "record", {"fix": fix,
                                                 "verified": verified,
                                                 "task": task})

    def reuse(self, entry_id: str, run_id: str, outcome: str) -> dict:
        return self._post("/reuse", {"entry_id": entry_id, "run_id": run_id,
                                     "outcome": outcome, "kind": "real"})

    def promote_preview(self, entry_id: str, team_id: str) -> dict:
        return self._post("/promote", {"entry_id": entry_id,
                                       "team_id": team_id})
