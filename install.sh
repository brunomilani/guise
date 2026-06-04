#!/usr/bin/env bash
# guise installer — macOS / Linux / WSL
#
#   curl -fsSL https://raw.githubusercontent.com/brunomilani/guise/main/install.sh | bash
#
# or, from a clone:
#   ./install.sh
#
# What it does:
#   1. Builds the TypeScript CLI.
#   2. Installs the `guise` binary globally (npm link).
#   3. Prints the one-liner to register the Claude Code plugin marketplace.
#
# It never touches your SSH config, never logs out of gh, never stores tokens.
set -euo pipefail

say() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*"; }
die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required (>=18). Install from https://nodejs.org"
command -v npm  >/dev/null 2>&1 || die "npm is required."
command -v gh   >/dev/null 2>&1 || warn "GitHub CLI (gh) not found — install it later: https://cli.github.com"

# Resolve the directory this script lives in (works for clone + curl|bash via cwd).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

say "Installing dependencies…"
npm install

say "Building CLI…"
npm run build

say "Linking 'guise' globally…"
npm link

say "Running tests…"
npm test || warn "Tests reported failures — review output above."

cat <<'EOF'

✅ guise installed.

Try it in any GitHub repo:
  cd /path/to/your/repo
  guise init
  guise status

Register the Claude Code plugin (optional, enables /guise:* commands,
hooks and the status line):

  # in Claude Code:
  /plugin marketplace add brunomilani/guise
  /plugin install guise@guise

Show the active account in your status line — add to .claude/settings.json:
  { "statusLine": { "type": "command", "command": "guise statusline" } }
EOF
