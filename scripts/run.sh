#!/usr/bin/env bash
# Resolve and run the guise CLI from any context (plugin hook, statusline,
# or a developer shell). Forwards all arguments and stdin to the CLI.
#
# Resolution order:
#   1. A globally installed `guise` on PATH (npm link / npm i -g).
#   2. The compiled CLI bundled with the plugin (dist/cli.js next to this script).
#
# The script never prints anything of its own so it is safe inside a statusline.
set -euo pipefail

if command -v guise >/dev/null 2>&1; then
  exec guise "$@"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_JS="$SCRIPT_DIR/../dist/cli.js"

if [ -f "$CLI_JS" ] && command -v node >/dev/null 2>&1; then
  exec node "$CLI_JS" "$@"
fi

# Nothing available: stay silent and succeed so we never break the session.
exit 0
