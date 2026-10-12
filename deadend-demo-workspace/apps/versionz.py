from __future__ import annotations

import re

import pydantic


def pydantic_version_tag() -> str:
    """Return the pydantic version in a stable `major.minor` form.

    This exists so the demo can talk about "version-dependent behavior" in a
    way that looks real without pulling in a huge dependency graph.
    """
    full = getattr(pydantic, "__version__", "0.0.0")
    m = re.match(r"^(\\d+\\.\\d+)", full)
    return m.group(1) if m else full
