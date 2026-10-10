#!/usr/bin/env python3
"""Build seeded-bug target repos (bug1..bug3). Each: real git repo, real
bug, failing pytest on arrival, honest README, no fix committed."""
import os, subprocess, sys, textwrap

T = "/home/daytona/targets"

def sh(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"{cmd} in {cwd}: {r.stderr[:400]}")

def git(c, cwd):
    env = dict(os.environ)
    sh(c, cwd)
    return r

BUG1_APP = '''\
"""orders-async — order placement service (buggy)."""
import asyncio

TAX_RATE = 0.08

def compute_tax(amount):
    return round(amount * TAX_RATE, 2)

async def place_order(order):
    """Place an order. Called from the web framework's async handler.

    KNOWN: pricing logic is only sensitive to unit price and qty.
    """
    tax = compute_tax(order["qty"] * order["unit_price"])
    total = order["qty"] * order["unit_price"] + tax
    # status pipeline: the fulfillment step below mis-handles the
    # sync helper bridge and corrupts order state on real traffic
    order["total"] = total
    order["status"] = "pending"
    result = await fulfill(order)
    order["status"] = result["status"]
    return order

_store = {}
_loop_running = False

def _audit_sync(order):
    """Sync audit helper: writes to the (sync) audit log."""
    _store[order["id"]] = order["status"]
    return True

async def fulfill(order):
    # BUG (real-world class): calling run_coroutine_threadsafe-ish sync
    # bridge from inside the running loop — audits synchronously while
    # claiming to need a fresh loop. On a live loop this re-enters and
    # corrupts state; in this service it raises, killing the handler.
    loop = asyncio.new_event_loop()
    ok = loop.run_until_complete(_audit())
    order["audited"] = ok
    return {"status": "pending" if ok else "rejected"}

async def _audit():
    await asyncio.sleep(0)
    return True
'''

BUG1_TESTS = '''\
import asyncio, sys
sys.path.insert(0, ".")
from app.orders import place_order

def test_order_places_from_async_handler():
    order = {"id": "o-1", "qty": 2, "unit_price": 9.99}
    out = asyncio.run(place_order(order))
    assert out["status"] == "pending"
    assert out["total"] == 21.58
    assert out["audited"] is True
'''

BUG1_README = '''\
# orders-async

Minimal order-placement service. `place_order` is called from async web
handlers; orders must place cleanly (status pending, correct total,
audited) under a running event loop, without re-entering or corrupting
loop state.

CI runs: `bash run_tests.sh`
'''

BUG2_APP = '''\
"""ingest-api — CSV ingest service with auth (buggy)."""
import csv, io, os

try:
    from flask import Flask, request, jsonify
except ImportError:  # pure-function CI runs without the full stack
    Flask = request = jsonify = None

def _make_app():
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
    return app

if Flask is not None:
    app = _make_app()

def _csv_to_rows(stream):
    # BUG: decodes strictly utf-8; files written on Windows produce
    # BOM-prefixed bytes that should decode with utf-8-sig — real CSV
    # ingest breaks on standard editor output.
    reader = csv.DictReader(io.StringIO(stream.decode("utf-8")))
    return list(reader)

if Flask is not None:
  @app.route("/ingest", methods=["POST"])
  def ingest():
    rows = _csv_to_rows(request.files["file"].read())
    # Gate import by a shared token; absence must 401, never 500
    auth = request.headers.get("Authorization", "")
    if auth != f"Bearer {os.environ.get('INGEST_TOKEN', '')}":
        return jsonify(error="unauthorized"), 401
    counts = {}
    for r in rows:
        key = r.get("sku") or ""
        counts[key] = counts.get(key, 0) + 1
    return jsonify(imported=len(rows), counts=counts)

@app.route("/healthz")
def healthz():
    return "ok", 200
'''

BUG2_TESTS = '''\
import io, sys
sys.path.insert(0, ".")
from app.ingest import _csv_to_rows

def test_parse_handles_quoted_commas():
    data = b'sku,qty\\n"a, whole",3\\nplain,7\\n'
    rows = _csv_to_rows(data)
    assert rows[0]["sku"] == "a, whole"
    assert len(rows) == 2

def test_decode_is_bom_tolerant():
    lines = "sku,qty\\nplain,1".encode("utf-8-sig")  # real BOM-prefixed bytes
    rows = _csv_to_rows(lines)
    assert rows[0]["sku"] == "plain"
'''

BUG2_README = '''\
# ingest-api

Flask CSV-ingest service. Parses uploaded CSV into row dicts (quoted
commas, embedded newlines, BOM-tolerant), auth-gates the import route,
never 500s on malformed auth. Decode must be utf-8-sig tolerant.

CI runs: `bash run_tests.sh`
'''

BUG3_APP = '''\
"""catalog — search + display service (buggy)."""
import sqlite3, datetime

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  ts TEXT NOT NULL
);
"""

def seed(db):
    db.executescript(SCHEMA)
    db.executemany("INSERT INTO items (name, ts) VALUES (?, ?)", [
        ("alpha", "2025-08-01T12:00:00+00:00"),
        ("beta",  "2024-08-01T12:00:00+00:00"),
    ])
    db.commit()

def query(db, q):
    """Case-insensitive substring search, newest first (ts desc)."""
    # BUG 1: naive string ordering on mixed-offset ISO timestamps sorts
    # wrong when records carry different UTC offsets; real fix must
    # normalize instants before comparing.
    rows = db.execute(
        "SELECT id, name, ts FROM items WHERE name LIKE ? ORDER BY ts DESC",
        (f"%{q}%",)).fetchall()
    return rows

def headline(db, obj):
    """Render one item; must be tz-explicit, not naive."""
    # BUG 2: naive parse strips tzinfo for offset-aware strings on some
    # Python builds when the feed mixes forms; consumers need an
    # explicitly tz-aware instant, not a naive local read.
    base = datetime.datetime.fromisoformat(obj["ts"])
    return f'{obj["name"]} @ {base}'
'''

BUG3_TESTS = '''\
import datetime, sqlite3, sys
sys.path.insert(0, ".")
from app.catalog import seed, query, headline

def _db():
    db = sqlite3.connect(":memory:")
    seed(db)
    return db

def test_order_normalized_across_offsets():
    db = _db()
    rows = query(db, "a")  # alpha (2025) and beta (2024) both match 'a'
    assert rows[0][1] == "alpha" and rows[1][1] == "beta"

def test_headline_is_tz_aware():
    db = _db()
    obj = dict(db.execute("SELECT name, ts FROM items LIMIT 1").fetchone())
    h = headline(db, obj)
    dt = datetime.datetime.fromisoformat(h.split(" @ ")[1])
    assert dt.tzinfo is not None
'''

BUG3_README = '''\
# catalog

Item catalog with substring search (newest-first by event timestamp) and
item headline rendering. Timestamps arrive as ISO-8601 with varying UTC
offsets from upstream feeds; ordering and any arithmetic must be
instant-correct across offsets and DST folds.

CI runs: `bash run_tests.sh`
'''

BUGS = [
    ("bug1-nested-blockon", "app", "orders.py", BUG1_APP, BUG1_TESTS, BUG1_README),
    ("bug2-cors-middleware", "app", "ingest.py", BUG2_APP, BUG2_TESTS, BUG2_README),
    ("bug3-tz-naive-compare", "app", "catalog.py", BUG3_APP, BUG3_TESTS, BUG3_README),
]

for name, pkg, mod, app_src, tests, readme in BUGS:
    d = os.path.join(T, name)
    os.makedirs(os.path.join(d, pkg), exist_ok=True)
    os.makedirs(os.path.join(d, "tests"), exist_ok=True)
    open(os.path.join(d, pkg, "__init__.py"), "w").write("")
    open(os.path.join(d, pkg, mod), "w").write(app_src)
    open(os.path.join(d, "tests", "test_" + name + ".py"), "w").write(tests)
    open(os.path.join(d, "run_tests.sh"), "w").write(
        "#!/usr/bin/env bash\nset -euo pipefail\ncd \"$(dirname \"$0\")\"\npython3 -m pytest tests/ -q\n")
    open(os.path.join(d, "README.md"), "w").write(readme)
    # real git repo init
    sh("git init -q -b main", d)
    sh('git add -A && git commit -qm "seeded bug workspace (buggy state)"', d)
    # prove the suite fails on the buggy state
    r = subprocess.run("bash run_tests.sh", shell=True, cwd=d, capture_output=True, text=True)
    print(f"{name}: tests exit {r.returncode} (expected 1=pytest failing)")
    assert r.returncode == 1, (name, r.stdout[-400:], r.stderr[-400:])

print("3 seeded buggy repos created, all suites genuinely failing")
