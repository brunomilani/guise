#!/usr/bin/env bash
# Claude Code statusLine command. Receives session JSON on stdin and prints a
# single short segment like:  [github account: john-work · john@domain.com]
#
# Add to .claude/settings.json (see examples/settings.example.json):
#   "statusLine": { "type": "command", "command": "<path>/scripts/statusline.sh" }
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/run.sh" statusline
