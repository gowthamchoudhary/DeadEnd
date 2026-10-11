"""SQLAlchemy models — DeadEnd public product schema."""
import datetime as dt
import uuid

from sqlalchemy import (Boolean, DateTime, Float, ForeignKey,
                        Index, Integer, String, Text, UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector


class Base(DeclarativeBase):
    pass


def uid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    github_id: Mapped[str] = mapped_column(String(32), unique=True)
    login: Mapped[str] = mapped_column(String(128), unique=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    members: Mapped[list["TeamMember"]] = relationship(back_populates="user")
    tokens: Mapped[list["ApiToken"]] = relationship(back_populates="user")


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    plan: Mapped[str] = mapped_column(String(16), default="free")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_user"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(16), default="member")  # owner|admin|member
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="members")
    team: Mapped[Team] = relationship()


class ApiToken(Base):
    __tablename__ = "api_tokens"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(128), default="")
    scopes: Mapped[dict] = mapped_column(JSONB, default=dict)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="tokens")


class DeviceCode(Base):
    """Extension device-code flow: extension requests, user approves on web."""
    __tablename__ = "device_codes"
    device_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|approved|denied|expired
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    api_token_id: Mapped[str | None] = mapped_column(ForeignKey("api_tokens.id"), nullable=True)
    requested_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Entry(Base):
    """failures + fixes + attempts in one document row (mirrors deadend/v1)."""
    __tablename__ = "entries"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=uid)
    scope: Mapped[str] = mapped_column(String(8), index=True)          # private|global
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True, index=True)
    signature_hash: Mapped[str] = mapped_column(String(64), index=True)
    signature_normalized: Mapped[str] = mapped_column(Text, default="")
    redacted_error_text: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    env_fingerprint: Mapped[dict] = mapped_column(JSONB, default=dict)
    attempts_graph: Mapped[list] = mapped_column(JSONB, default=list)  # [{id,parent_attempt_id,...}]
    fix: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    constraints: Mapped[list] = mapped_column(JSONB, default=list)
    seeded: Mapped[bool] = mapped_column(Boolean, default=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    # provenance
    neatlogs_trace_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    entire_checkpoint_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    alpha: Mapped[float] = mapped_column(Float, default=1.0)
    beta: Mapped[float] = mapped_column(Float, default=1.0)
    embedding: Mapped[list | None] = mapped_column(Vector(768), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_reuse_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)

    __table_args__ = (
        Index("ix_entries_scope_team", "scope", "team_id"),
        Index("ix_entries_sig", "signature_hash"),
    )


class ReuseEvent(Base):
    __tablename__ = "reuse_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    entry_id: Mapped[str] = mapped_column(ForeignKey("entries.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    outcome: Mapped[str] = mapped_column(String(16))                    # success|failure
    kind: Mapped[str] = mapped_column(String(8), default="real")        # real|test
    env_match_weight: Mapped[float] = mapped_column(Float, default=1.0)
    env_fingerprint: Mapped[dict] = mapped_column(JSONB, default=dict)
    recorded_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Run(Base):
    """A solver run (from deadend-runner or the extension)."""
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    task: Mapped[str] = mapped_column(Text)
    repo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent: Mapped[str] = mapped_column(String(32), default="claude-code")
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|success|failure
    context_pack: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # agent telemetry (populated by deadend-runner /runs/{id}/summary)
    agent_version: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)  # seconds, runner-measured
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True, index=True)


class RunEvent(Base):
    __tablename__ = "run_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    phase: Mapped[str] = mapped_column(String(32))                      # plan|retrieve|attempt|test|verify|record|retry
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Invite(Base):
    """Pending team invitation awaiting the invitee's accept/decline."""
    __tablename__ = "invites"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    inviter_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    invitee_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="member")
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|accepted|declined
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Project(Base):
    """A repo a team works on; entries and runs attach to it (created on
    first use by repo name)."""
    __tablename__ = "projects"
    __table_args__ = (UniqueConstraint("team_id", "name", name="uq_project_team_name"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    repo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TeamSettings(Base):
    """Per-team settings; currently just the sharing default."""
    __tablename__ = "team_settings"
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), primary_key=True)
    default_share: Mapped[str] = mapped_column(String(24), default="off")  # off|team|global-after-approval
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                    onupdate=func.now())


class Quarantine(Base):
    __tablename__ = "quarantine"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    reasons: Mapped[list] = mapped_column(JSONB, default=list)
    source: Mapped[str] = mapped_column(String(32), default="ingest")   # ingest|contribution
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Contribution(Base):
    """Opt-in global submissions pending user approval."""
    __tablename__ = "contributions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    entry_id: Mapped[str] = mapped_column(ForeignKey("entries.id"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="drafting")  # drafting|awaiting_approval|approved|rejected|published
    diff: Mapped[dict | None] = mapped_column(JSONB, nullable=True)      # proposed generalized recipe diff
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    actor: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(Text, nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
