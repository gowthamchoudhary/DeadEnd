"""DeadEnd Step 2b: a real failure trace for the curator to curate.

Generates a genuine failing span in neatlogs (a real bug in this workspace,
reproduced on purpose): calling the documented whole-word search flag "-w"
against a query with a literal backslash escapes creates a real ripgrep
misuse error. We record the failure attempt and successful retry as spans
in one DEADEND-CURATOR-WORKFLOW root trace.
"""
import os, subprocess, sys
import neatlogs

neatlogs.init(api_key=os.environ["NEATLOGS_API_KEY"], workflow_name="deadend-curator")

@neatlogs.span(kind="WORKFLOW", name="deadend-curator")
def run():
    result = {}
    with neatlogs.trace("attempt-1-word-flag", kind="TOOL"):
        try:
            # real command that errors: -w against a query ending in backslash
            r = subprocess.run(["rg", "-w", "deadend\\", "/etc/hostname"],
                               capture_output=True, text=True, timeout=10)
            if r.returncode != 0:
                raise RuntimeError(f"rg failed rc={r.returncode}: {r.stderr.strip()[:200]}")
        except Exception as e:  # noqa: BLE001
            result["attempt1_rc"] = -1
            result["attempt1_stderr"] = str(e)
            with neatlogs.trace("attempt-1-error-record", kind="TOOL"):
                _ = str(e)
    with neatlogs.trace("attempt-2-fixed-string", kind="TOOL"):
        r = subprocess.run(["rg", "-F", "deadend", "/etc/hostname"],
                           capture_output=True, text=True, timeout=10)
        result["attempt2_rc"] = r.returncode
    return result

out = run()
neatlogs.flush(); neatlogs.shutdown()
print(out)
if out.get("attempt2_rc") != 0:
    sys.exit(1)
