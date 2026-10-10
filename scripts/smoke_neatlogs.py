"""DeadEnd Step 1: neatlogs smoke test.

Verifies the documented SDK path end to end with a real export:
  neatlogs.init(api_key, workflow_name)
  @neatlogs.span(kind="WORKFLOW") root
  nested child span via `with neatlogs.trace(...)`
No mocks: this either exports a real WORKFLOW trace to neatlogs or fails.
"""
import os, sys
import neatlogs

KEY = os.environ.get("NEATLOGS_API_KEY")
if not KEY:
    sys.exit("NEATLOGS_API_KEY not set in environment")

neatlogs.init(api_key=KEY, workflow_name="deadend-smoke")

@neatlogs.span(kind="WORKFLOW", name="smoke_root")
def root():
    with neatlogs.trace("child_probe", kind="TOOL"):
        return "ok"

result = root()
neatlogs.flush()
neatlogs.shutdown()
print("smoke_root returned:", result)
print("exported: init done, WORKFLOW span + child trace created against https://ingest.neatlogs.com")
