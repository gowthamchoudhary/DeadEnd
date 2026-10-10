# gitignore audit helper — safe to push
"""Prints a SAFE audit only: which candidates are gitignored and whether
any secret-looking file is tracked. Never prints file contents or values."""
import subprocess, sys

candidates = [".env", ".env.local", ".entire/settings.local.json", "tokens.json"]
print("== gitignore check ==")
for c in candidates:
    r = subprocess.run(["git", "check-ignore", "-v", c], capture_output=True, text=True)
    if r.returncode == 0:
        print(f"IGNORED  {c}  (rule: {r.stdout.strip().split(chr(9))[-1]})")
    else:
        print(f"NOT-IGNORED  {c}  <-- must be fixed before any push")

print("== tracked files matching secret patterns ==")
r = subprocess.run(["git", "ls-files"], capture_output=True, text=True)
tracked = r.stdout.split()
hits = [t for t in tracked if any(p in t.lower() for p in ("env", "token", "key", "secret"))]
print(hits if hits else "none")
sys.exit(0)
