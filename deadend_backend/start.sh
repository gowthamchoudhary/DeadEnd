#!/usr/bin/env bash
set -euo pipefail
cd /app
python -m app.create_all
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
