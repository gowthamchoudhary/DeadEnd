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
