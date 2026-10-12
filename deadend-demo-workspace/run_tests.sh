#!/usr/bin/env bash
set -euo pipefail
# Demo test runner for ticketdesk-api.
# This is the command the DeadEnd runner can invoke to verify a fix.
python3 -m pytest tests/ -q
