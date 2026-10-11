from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # core
    app_name: str = "DeadEnd"
    env: str = "dev"
    web_origin: str = "http://localhost:5173"
    base_url: str = "http://localhost:8000"
    # OAuth callback registered in the GitHub app. Falls back to
    # BASE_URL + /auth/callback when unset.
    oauth_redirect_uri: str = ""   # e.g. https://dead-end-tau.vercel.app/api/auth/callback

    # database (Supabase Postgres w/ pgvector)
    database_url: str = ""

    # auth
    auth_secret: str = ""            # signs session cookies + oauth state
    github_client_id: str = ""
    github_client_secret: str = ""
    session_ttl_seconds: int = 14 * 24 * 3600

    # sponsors
    neatlogs_api_key: str = ""       # backend Curator/Verifier tracing
    neatlogs_mcp_url: str = "https://ingest.neatlogs.com/mcp"
    entire_private_remote: str = ""  # entire://aws-us-east-2.entire.io/et/deadend/deadend-private
    entire_global_remote: str = ""   # .../deadend-global
    entire_worktree: str = "/var/deadend/repos"

    # limits
    max_body_bytes: int = 1_000_000
    rate_limit_per_min: int = 60
    rate_limit_ip_per_min: int = 240
    verify_worker_timeout_s: int = 600
    budget_default_tokens: int = 1500

    class Config:
        env_file = (".env", ".env.local")
        env_prefix = "DEADEND_"


@lru_cache
def get_settings() -> Settings:
    return Settings()
