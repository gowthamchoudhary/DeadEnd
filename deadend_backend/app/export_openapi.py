import json, pathlib
from .main import app

if __name__ == "__main__":
    spec = app.openapi()
    out = pathlib.Path(__file__).resolve().parents[1] / "openapi.json"
    out.write_text(json.dumps(spec, indent=2))
    print(f"openapi.json written to {out} ({out.stat().st_size} bytes)")
