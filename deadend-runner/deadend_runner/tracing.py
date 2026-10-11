"""neatlogs tracing for every agent run — plugin or not.

Every run gets a WORKFLOW root span with child spans:
  retrieve -> attempt -> test -> verify -> record
Span attributes: agent name, model (if the adapter parsed one), tokens
(if reported), duration, exit status. Agents that ship a neatlogs
plugin additionally capture in-agent detail; agents without one are
still fully traced at the runner level.
"""
import datetime as dt


class RunTrace:
    """Falls back to a no-op recorder when neatlogs isn't installed."""

    def __init__(self, agent: str, backend_run_id: str | None = None,
                 neatlogs_api_key: str | None = None):
        self.agent = agent
        self.run_id = backend_run_id
        self._events: list[dict] = []
        self._api_key = neatlogs_api_key
        self._wf = None

    def __enter__(self):
        self.t0 = dt.datetime.now(dt.timezone.utc)
        try:
            import neatlogs
            try:
                neatlogs.init(api_key=self._api_key) if self._api_key else \
                    neatlogs.init()
                self._wf = neatlogs.trace(
                    f"deadend-run:{self.agent}",
                    kind="WORKFLOW",
                    attributes={"agent": self.agent,
                                "run_id": self.run_id or "",
                                "started_at": self.t0.isoformat()})
                self._wf.__enter__()
            except Exception:
                self._wf = None
        except ImportError:
            self._wf = None
        return self

    def span(self, phase: str, **attrs):
        self._events.append({"phase": phase, **attrs})
        if self._wf is not None:
            try:
                s = self._wf.child_span(phase, attributes={
                    "agent": self.agent,
                    "run_id": self.run_id or "",
                    **attrs})
                s.__enter__()
                return _Ctx(s)
            except Exception:
                pass
        return _Ctx(None)

    def __exit__(self, exc_type, exc, tb):
        dur = (dt.datetime.now(dt.timezone.utc) - self.t0).total_seconds()
        if self._wf is not None:
            try:
                self._wf.set_attribute("duration_seconds", dur) \
                    if hasattr(self._wf, "set_attribute") else None
            except Exception:
                pass
            try:
                self._wf.__exit__(None, None, None)
            except Exception:
                pass
        return False


class _Ctx:
    def __init__(self, span):
        self.span = span

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.span is not None:
            try:
                self.span.__exit__(None, None, None)
            except Exception:
                pass
        return False
