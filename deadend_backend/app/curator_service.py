"""Curator service (backend): wraps the sponsor flow.
- reads a neatlogs trace via MCP (get_trace_context / search_traces)
- spans every step in a DEADEND-CURATOR WORKFLOW via neatlogs SDK
- extracts failure, scans, writes entries (quarantine on flags)
- folds in Entire checkpoint transcript via documented CLI (optional)
"""
import datetime as dt
import json
import os
import re
import subprocess
import urllib.request

from .config import get_settings
from .normalize import normalize_stack, signature_hash
from .scans import redact, scan_all

S = get_settings()

MCP = S.neatlogs_mcp_url
_session = {"id": None}


def mcp(body: dict) -> dict:
    req = urllib.request.Request(
        MCP, method="POST", data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {S.neatlogs_api_key}",
                 "Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream",
                 **({"mcp-session-id": _session["id"]} if _session["id"] else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        sid = r.headers.get("mcp-session-id")
        _session["id"] = _session["id"] or sid
        raw = r.read().decode()
    if body.get("method") == "notifications/initialized":
        return {}
    for line in raw.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    return json.loads(raw) if raw.strip() else {}


def mcp_init():
    mcp({"jsonrpc": "2.0", "id": 0, "method": "initialize",
         "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                    "clientInfo": {"name": "deadend-backend", "version": "0.1"}}})
    mcp({"jsonrpc": "2.0", "method": "notifications/initialized"})


def mcp_call(name: str, args: dict, rid: int = 1) -> dict:
    r = mcp({"jsonrpc": "2.0", "id": rid, "method": "tools/call",
             "params": {"name": name, "arguments": args}})
    try:
        return json.loads(r["result"]["content"][0]["text"])
    except (KeyError, TypeError, json.JSONDecodeError):
        return {"_raw": r}


def get_trace(trace_id: str) -> dict:
    mcp_init()
    ctx = mcp_call("get_trace_context", {"trace_id": trace_id}, 10)
    if isinstance(ctx, dict) and (ctx.get("spans") is not None or ctx.get("trace_id")):
        return ctx
    raise ValueError(f"trace {trace_id} not retrievable: {json.dumps(ctx)[:300]}")


STRESS = re.compile(r"\b(traceback|error|exception|failed|failure|panic|assertion)\b", re.I)


def extract_failures(trace: dict) -> list[dict]:
    spans = trace.get("spans") or []
    failures = []
    for span in spans:
        attrs = span.get("attributes") or {}
        # DeadEnd's Neatlogs run trace deliberately contains only a small,
        # privacy-limited set of scalar fields. Failed verification is
        # represented as neatlogs.ok=false; nonzero agent exits as rc != 0.
        explicit_failure = (attrs.get("neatlogs.ok") is False
                            or (isinstance(attrs.get("neatlogs.rc"), (int, float))
                                and attrs["neatlogs.rc"] != 0))
        if ((span.get("status") or "").lower() in ("error", "failed")
                or span.get("error") or explicit_failure
                or STRESS.search(json.dumps(span))):
            failures.append(span)
    return failures


def entire_checkpoint_transcript(checkpoint_id: str) -> str:
    """Documented entire CLI only: checkpoint explain --transcript."""
    if not checkpoint_id:
        return ""
    env = dict(os.environ, ENTIRE_TOKEN_STORE="file")
    r = subprocess.run(["entire", "checkpoint", "explain", checkpoint_id,
                        "--transcript"], capture_output=True, text=True, env=env,
                       timeout=60)
    return r.stdout[:4000] if r.returncode == 0 else ""


def _trace_root():
    """neatlogs WORKFLOW root around the whole curation; real LLM spans
    flow through traced_spawn calls when an LLM rewrite is later added."""
    import neatlogs
    if S.neatlogs_api_key and not neatlogs._initialized:  # idempotent init
        try:
            neatlogs.init(api_key=S.neatlogs_api_key,
                          workflow_name="deadend-backend-curator")
        except Exception:
            pass
    return neatlogs.span(kind="WORKFLOW", name="deadend-curator")


def curate(trace_id: str, checkpoint_id: str | None = None) -> dict:
    """Returns a deadend/v1 entry dict or {'quarantine': True, ...}.
    Wrapped in a real neatlogs WORKFLOW span when key available."""
    ctx = _trace_root()
    with ctx:
        trace = get_trace(trace_id)
        findings = extract_failures(trace)
        cp_text = entire_checkpoint_transcript(checkpoint_id or "")
        if not findings and cp_text:
            findings = [{"name": "entire-checkpoint", "status": "error",
                         "error": cp_text[:500]}]
        if not findings:
            return {"skip": "no failure found (real-data-only)"}
        src = json.dumps(findings) + "\n" + cp_text
    scans = scan_all(src)
    sig_src = normalize_stack(json.dumps(findings)[:1500])
    shash = signature_hash(json.dumps(findings)[:1500])
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    entry = {
        "schema": "deadend/v1",
        "failure": {"id": f"failure-{shash}", "signature_hash": shash,
                    "signature_normalized": sig_src[:400],
                    "redacted_error_text": redact(json.dumps(findings)[:800])},
        "attempts": [{"approach": f.get("name") or "agent-run",
                      "outcome": "error",
                      "why_it_failed": redact(str(s.get("error") or
                            s.get("output_value") if "rg" in str(s.get("output_value", "")) else
                            (s.get("error") or "span errored in trace")))[:300]}
                     for f, s in [(x, x) for x in findings]],
        "fix": None,
        "provenance": {"curated_at": now, "curator": "backend-curator/v1",
                       "trace_id": trace_id, "checkpoint_id": checkpoint_id,
                       "workflow": trace.get("workflow")},
    }
    if scans["secrets"] or scans["injection"]:
        return {"quarantine": True, "reasons": scans, "entry": entry}
    return {"quarantine": False, "reasons": scans, "entry": entry}
