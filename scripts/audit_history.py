"""git history audit — prints only paths/commits, never contents."""
import subprocess, re, sys

log = subprocess.run(["git", "log", "--all", "--oneline", "--name-only"],
                     capture_output=True, text=True).stdout
pat = re.compile(r"\??[\w./-]*(\.env|token|secret|apikey|api_key)[\w.-]*", re.I)
hits = sorted(set(m.group(0) for m in (pat.search(l) for l in log.splitlines()) if m))
print("history secret-path hits:", hits if hits else "none")
sys.exit(0)
