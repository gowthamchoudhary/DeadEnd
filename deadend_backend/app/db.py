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
    # pgvector prep: entries.embedding vector column + index (idempotent)
    from sqlalchemy import text
    with get_engine().begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text("""
            ALTER TABLE entries ADD COLUMN IF NOT EXISTS embedding vector(768);
            CREATE INDEX IF NOT EXISTS ix_entries_embedding
              ON entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        """))
