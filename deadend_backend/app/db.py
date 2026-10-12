from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .config import get_settings

S = get_settings()

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = S.database_url
        # normalize legacy schemes; sqlalchemy with psycopg v3 needs the
        # postgresql+psycopg:// scheme (plain postgresql:// defaults to
        # the psycopg2 dialect, which isn't installed -> ModuleNotFoundError)
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        _engine = create_engine(url, pool_pre_ping=True, future=True)
    return _engine


SessionLocal = None


def sessionmaker_tls():
    global SessionLocal
    if SessionLocal is None:
        SessionLocal = sessionmaker(bind=get_engine(), autocommit=False,
                                    autoflush=False, future=True)
    return SessionLocal


def get_db():
    db = sessionmaker_tls()()
    try:
        yield db
    finally:
        db.close()


def create_all():
    from .models import Base
    Base.metadata.create_all(get_engine())
    from sqlalchemy import text
    import logging
    log = logging.getLogger("deadend.db")
    with get_engine().begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        # _ensure_column: add columns to existing tables without clobbering
        # data (create_all only creates missing tables, not missing columns).
        def ensure_column(table: str, ddl: str):
            col = ddl.split()[0]
            try:
                exists = conn.execute(text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = :c"),
                    {"t": table, "c": col}).scalar()
                if not exists:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {ddl}"))
                    log.info("added %s.%s", table, col)
            except Exception:
                log.warning("column ensure failed for %s.%s", table, col,
                            exc_info=True)

        # runs: agent telemetry columns (added post-launch; all nullable)
        for ddl in ("agent_version TEXT", "model TEXT",
                    "tokens_in INTEGER", "tokens_out INTEGER",
                    "duration DOUBLE PRECISION",
                    "project_id VARCHAR(32)"):
            ensure_column("runs", ddl)
        # entries: project link (nullable)
        ensure_column("entries", "project_id VARCHAR(32)")
        # device codes: durable encrypted device token (decrypted once by
        # /auth/device/resume, then cleared). Nullable until set on approval.
        ensure_column("device_codes", "device_token_cipher TEXT")
        # sign-in fix (ac105b4): the device-start route now records the
        # first attempt, last delivery and delivery count on the device
        # code row, so those columns must exist on existing tables too.
        ensure_column("device_codes", "first_attempt_at TIMESTAMPTZ")
        ensure_column("device_codes", "last_delivery_at TIMESTAMPTZ")
        ensure_column("device_codes", "deliveries INTEGER")

        # Legacy databases may have `embedding` as TEXT (pre-pgvector model).
        # Table is empty/col nullable at this stage: safe to drop and recreate
        # as vector(768). Failures here are non-fatal — app still starts.
        for table in ("entries", "failures", "attempts", "fixes"):
            try:
                exists = conn.execute(text(
                    "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = 'embedding')"),
                    {"t": table}).scalar()
                if not exists:
                    continue
                ctype = conn.execute(text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = 'embedding'"),
                    {"t": table}).scalar()
                if ctype and "char" in ctype:  # text / varchar
                    conn.execute(text(
                        f"ALTER TABLE {table} ALTER COLUMN embedding TYPE vector(768) USING NULL"))
                    log.info("converted %s.embedding from %s to vector(768)", table, ctype)
            except Exception:
                log.warning("embedding column repair for %s skipped", table, exc_info=True)

        # ivfflat index (idempotent); non-fatal so startup never blocks on it
        try:
            index_exists = conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM pg_indexes "
                "WHERE indexname = 'ix_entries_embedding')")).scalar()
            if not index_exists:
                conn.execute(text(
                    "CREATE INDEX ix_entries_embedding ON entries "
                    "USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"))
            log.info("embedding index ready")
        except Exception:
            log.warning("ivfflat index creation skipped", exc_info=True)
    return None
