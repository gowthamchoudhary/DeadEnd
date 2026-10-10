"""DeadEnd curator agent — Step 2.

Reads a neatlogs trace (MCP: search_traces -> get_trace_context) plus an
optional Entire checkpoint transcript (entire checkpoint explain --transcript),
extracts the failure record, runs a secret scan and a prompt-injection scan
FIRST, then either:
  - writes a redacted entry (DATA-MODEL schema) to the private Entire repo, or
  - quarantines it (never written to failures/) with the scan reasons.

Real data only: if the trace has no failure to curate, the curator reports
that instead of inventing one.

Usage:
  python3 curator.py --trace-id f562... [--checkpoint-id 01ABC] \
      [--repo /home/daytona/repos/deadend-private]
"""
import argparse, datetime, hashlib, json, os, re, subprocess, sys, urllib.request

MCP_URL = "https://ingest.neatlogs.com/mcp"
KEY = os.environ.get("NEATLOGS_API_KEY")
if not KEY:
    sys.exit("NEATLOGS_API_KEY not set")

# ---------------------------------------------------------------- MCP client
_session = {"id": None}

def m(post_body):
    req = urllib.request.Request(MCP_URL, method="POST", data=json.dumps(post_body).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream",
                 **({"mcp-session-id": _session["id"]} if _session["id"] else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        sid = r.headers.get("mcp-session-id")
        if sid and not _session["id"]:
            _session["id"] = sid
        raw = r.read().decode()
    if post_body.get("method") == "notifications/initialized":
        return {}
    for line in raw.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    return json.loads(raw) if raw.strip() else {}

def mcp_init():
    m({"jsonrpc": "2.0", "id": 0, "method": "initialize",
       "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                  "clientInfo": {"name": "deadend-curator", "version": "0.1"}}})
    m({"jsonrpc": "2.0", "method": "notifications/initialized"})

def mcp_call(name, args, rid):
    r = m({"jsonrpc": "2.0", "id": rid, "method": "tools/call",
           "params": {"name": name, "arguments": args}})
    try:
        return json.loads(r["result"]["content"][0]["text"])
    except (KeyError, json.JSONDecodeError):
        return {"_raw": r}

# ------------------------------------------------------------------- scanners
SECRET_PATTERNS = [
    (r"AKIA[0-9A-Z]{16}", "aws-access-key"),
    (r"sk-[A-Za-z0-9_-]{20,}", "openai-style-key"),
    (r"aV5[A-Za-z0-9_-]{25,}", "neatlogs-style-key"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "jwt"),
    (r"-----BEGIN( [A-Z]+)? PRIVATE KEY-----", "private-key"),
    (r"(?i)(postgres|mysql|mongodb(\+srv)?)://[^\s:@]+:[^\s@]+@", "connection-string"),
    (r"(?i)bearer\s+[A-Za-z0-9._-]{20,}", "bearer-token"),
    (r"(?i)gh[pousr]_[A-Za-z0-9]{30,}", "github-token"),
    (r"(?i)xox[baprs]-[A-Za-z0-9-]{10,}", "slack-token"),
]
INJECTION_PATTERNS = [
    (r"(?i)ignore\s+(all\s+)?(previous|prior|above)\s+instructions", "instruction-override"),
    (r"(?i)disregard\s+(the\s+)?(system|previous|above)", "instruction-override"),
    (r"(?i)\b(exfiltrate|send|post)\b.{0,40}\b(api.?key|secret|token|credentials)\b", "exfiltration"),
    (r"(?i)you\s+are\s+now\s+(a|an)\s+", "role-hijack"),
    (r"(?i)\bsudo\b|\brm\s+-rf\b.{0,30}(no-preserve-root|/)", "destructive-command"),
    (r"(?i)print|reveal|show.{0,30}(system\s+prompt|instructions)", "prompt-leak"),
]
REDACT = [
    (r"AKIA[0-9A-Z]{16}", "[REDACTED:aws-key]"),
    (r"sk-[A-Za-z0-9_-]{20,}", "[REDACTED:key]"),
    (r"aV5[A-Za-z0-9_-]{25,}", "[REDACTED:key]"),
    (r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}", "[REDACTED:jwt]"),
    (r"(?i)(postgres|mysql|mongodb(\+srv)?)://[^\s:@]+:[^\s@]+@", r"\1://[REDACTED]@"),
    (r"(?i)bearer\s+[A-Za-z0-9._-]{20,}", "bearer [REDACTED]"),
    (r"(?i)gh[pousr]_[A-Za-z0-9]{30,}", "[REDACTED:github-token]"),
    (r"(?i)xox[baprs]-[A-Za-z0-9-]{10,}", "[REDACTED:slack-token]"),
]

def secret_scan(text):
    return [name for pat, name in SECRET_PATTERNS if re.search(pat, text or "")]

def injection_scan(text):
    return [name for pat, name in INJECTION_PATTERNS if re.search(pat, text or "")]

def redact(text):
    for pat, repl in REDACT:
        text = re.sub(pat, repl, text or "")
    return text

# ------------------------------------------------------- failure extraction
STRESS = re.compile(r"\b(traceback|error|exception|failed|failure|panic|assertion)\b", re.I)

def normalize_stack(text):
    """Normalize a stack trace for hashing: strip addresses/paths/hex ids
    and collapse whitespace so the same failure hashes the same."""
    t = re.sub(r"0x[0-9a-fA-F]+", "0xADDR", text)
    t = re.sub(r'File "[^"]+", line \d+', "File <path>, line N", t)
    t = re.sub(r"/[\w./-]+/([\w.-]+\.[a-z]+)", "<mod>\\1", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t

def extract_failures(trace):
    """Pull failureish spans out of a trace record. Real data only."""
    spans = trace.get("spans") or trace.get("matched_spans") or []
    found = []
    for s in spans or []:
        status = (s.get("status") or "").lower()
        text = json.dumps(s)
        if status in ("error", "failed") or s.get("error") or STRESS.search(text):
            found.append(s)
    return found

def env_fingerprint():
    import platform
    try:
        import neatlogs
        nl_version = neatlogs.__version__
    except Exception:
        nl_version = None
    import openai
    return {"language": f"python {platform.python_version().rsplit('.', 0)[0]}",
            "frameworks": ["opentelemetry-sdk", f"neatlogs {nl_version}", f"openai {openai.__version__}"],
            "os": platform.system()}

# ------------------------------------------------------------------ curation
def curate(trace, checkpoint_text, repo_path, trace_meta):
    checkpoint_id = trace_meta.get("checkpoint_id")
    findings = extract_failures(trace)
    if checkpoint_text and not findings:
        # checkpoint-only input: use transcript text as the sole finding
        findings = [{"name": "entire-checkpoint", "status": "error",
                     "error": checkpoint_text[:500]}]
    if not findings:
        return {"action": "skip", "reason": "no failure found in trace or checkpoint (real-data-only rule)"}
    source_text = json.dumps(findings) + "\n" + (checkpoint_text or "")
    scan_hits = {"secrets": secret_scan(source_text), "injection": [
        n for n in injection_scan(source_text)]}
    suspicious = scan_hits["secrets"] or scan_hits["injection"]
    now = datetime.datetime.now(datetime.timezone.utc)
    sig_src = normalize_stack(json.dumps(findings)[:1500])
    signature_hash = hashlib.sha256(sig_src.encode()).hexdigest()[:16]
    failure_id = f"failure-{signature_hash}"
    entry = {
        "schema": "deadend/v1", "failure": {
            "id": failure_id, "signature_hash": signature_hash,
            "signature_normalized": sig_src[:400],
            "redacted_error_text": redact(json.dumps(findings)[:800]),
            "environment": env_fingerprint(),
        },
        "fix": {"failure_id": failure_id, "recipe": None, "redacted_diff": None,
                "verified": False, "provenance": None},
        "attempts": [{
            "failure_id": failure_id,
            "approach": f.get("name") or "agent-run",
            "outcome": "error",
            "why_it_failed": redact(str(err)[:300]) if err else "span errored in trace",
            "checkpoint_ref": trace_meta.get("checkpoint_id"),
            "trace_id": trace_meta.get("trace_id")}
            for f, err in [(s, s.get("error") or (s.get("output_value") if "rg" in str(s.get("output_value", "")) else None)) for s in findings]],
        "provenance": {"curated_at": now.isoformat(), "curator": "curator.py v0.3",
                       "trace_id": trace_meta.get("trace_id"),
                       "checkpoint_id": trace_meta.get("checkpoint_id"),
                       "workflow_name": trace_meta.get("workflow_name"),
                       "inputs_used": (["neatlogs-trace"] if trace.get("spans") else []) +
                                      (["entire-checkpoint"] if (trace_meta.get("checkpoint_text") or "").strip() else [])},
        "source": "trace+checkpoint" if trace_meta.get("checkpoint_text") else "trace",
    }
    if suspicious:
        entry["quarantine"] = {"reasons": scan_hits}
        path = os.path.join(repo_path, "quarantine", f"{failure_id}.json")
        entry["note"] = "QUARANTINED: not a valid context entry; review manually"
    else:
        path = os.path.join(repo_path, "failures", f"{failure_id}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(entry, f, indent=2)
    action = "quarantined" if suspicious else "written"
    return {"action": action, "path": path, "failure_id": failure_id, "scans": scan_hits}

# --------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trace-id", required=True)
    ap.add_argument("--checkpoint-id")
    ap.add_argument("--repo", default="/home/daytona/repos/deadend-private")
    a = ap.parse_args()

    mcp_init()
    ctx = mcp_call("get_trace_context", {"trace_id": a.trace_id}, 10)
    # Real payload shape (verified live): top-level trace_id, name, workflow,
    # status, spans[] — no nested "trace" key.
    if isinstance(ctx, dict) and (ctx.get("spans") is not None or ctx.get("trace_id")):
        trace = ctx
    elif isinstance(ctx, dict) and "_raw" in ctx:
        sys.exit(f"get_trace_context failed: {json.dumps(ctx)[:300]}")
    else:
        sys.exit(f"trace {a.trace_id} not retrievable via MCP")
    if not isinstance(trace, (dict, list)):
        try:
            trace = json.loads(trace)
        except json.JSONDecodeError:
            trace = {"spans": [], "summary_text": trace}

    checkpoint_text = ""
    if a.checkpoint_id:
        r = subprocess.run(["entire", "checkpoint", "explain", a.checkpoint_id, "--transcript"],
                           capture_output=True, text=True,
                           env={**os.environ, "PATH": f"{os.path.expanduser('~/.local/bin')}:{os.environ['PATH']}"})
        checkpoint_text = r.stdout[:4000]

    res = curate(trace if isinstance(trace, dict) else {}, checkpoint_text, a.repo,
                 {"trace_id": a.trace_id, "checkpoint_id": a.checkpoint_id,
                  "checkpoint_text": checkpoint_text,
                  "workflow_name": (trace if isinstance(trace, dict) else {}).get("workflow") or (trace if isinstance(trace, dict) else {}).get("root_span_name")})
    print(json.dumps(res, indent=2))
    if res["action"] in ("written", "quarantined"):
        d = os.path.dirname(res["path"])
        subprocess.run(["git", "add", "."], cwd=d, check=True)
        subprocess.run(["git", "commit", "-q", "-m",
                        f"DeadEnd curator: {res['action']} {res['failure_id']}"], cwd=d, check=True)
        p = subprocess.run(["git", "push", "origin", "main"], cwd=d,
                           capture_output=True, text=True)
        print("push:", "ok" if p.returncode == 0 else p.stderr.strip()[-200:])

if __name__ == "__main__":
    main()
