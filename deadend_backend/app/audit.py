from sqlalchemy.orm import Session
from .models import AuditLog


def audit(db: Session, actor: str | None, action: str,
          target: str | None = None, **detail):
    db.add(AuditLog(actor=actor, action=action, target=target, detail=detail))
