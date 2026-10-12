"""Local timing metadata; Neatlogs uploads happen with the backend key."""
import datetime as dt


class RunTrace:
    """Compatibility wrapper that never reads a user's Neatlogs credentials."""

    def __init__(self, agent: str, backend_run_id: str | None = None,
                 neatlogs_api_key: str | None = None):
        self.agent = agent
        self.run_id = backend_run_id
        self._events_list: list[dict] = []
        self._wf_error = "trace upload is handled by the DeadEnd backend"
        self.entire_checkpoint_id: str | None = None
        self.entire_reason: str | None = None

    def __enter__(self):
        self.t0 = dt.datetime.now(dt.timezone.utc)
        return self

    def neatlogs_trace_id(self) -> tuple[str | None, str | None]:
        return None, None

    def why_not(self) -> dict:
        out: dict = {}
        if self.entire_checkpoint_id is None:
            out["entire"] = self.entire_reason or (
                "no checkpoint reported; enable Entire capture and search with "
                f"`entire enable --agent {self.agent} --search-skill`")
        return out

    def span(self, phase: str, **attrs):
        self._events_list.append({"phase": phase, **attrs})
        return _Ctx()

    def __exit__(self, exc_type, exc, tb):
        return False


class _Ctx:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False
