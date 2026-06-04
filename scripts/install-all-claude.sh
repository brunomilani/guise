#!/usr/bin/env bash
# Install (or update) the guise plugin into EVERY Claude Code config dir
# on this machine — for users who run multiple Claude accounts via separate
# CLAUDE_CONFIG_DIR values (e.g. ~/.claude-personal, ~/.claude-work).
#
#   ./scripts/install-all-claude.sh
#
# It discovers candidate config dirs, then for each runs:
#   CLAUDE_CONFIG_DIR=<dir> claude plugin marketplace add brunomilani/guise
#   CLAUDE_CONFIG_DIR=<dir> claude plugin install guise@guise
set -euo pipefail

command -v claude >/dev/null 2>&1 || { echo "claude CLI not found on PATH" >&2; exit 1; }

# Candidate dirs: the standard one plus any ~/.claude-* sibling.
declare -a DIRS=()
[ -d "$HOME/.claude" ] && DIRS+=("$HOME/.claude")
for d in "$HOME"/.claude-*; do
  [ -d "$d" ] && DIRS+=("$d")
done
# Honor an explicitly set CLAUDE_CONFIG_DIR too.
[ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ -d "$CLAUDE_CONFIG_DIR" ] && DIRS+=("$CLAUDE_CONFIG_DIR")

# De-duplicate.
mapfile -t DIRS < <(printf '%s\n' "${DIRS[@]}" | sort -u)

if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "No Claude config dirs found." >&2
  exit 1
fi

for dir in "${DIRS[@]}"; do
  echo "==> $dir"
  CLAUDE_CONFIG_DIR="$dir" claude plugin marketplace add brunomilani/guise 2>&1 | tail -1 || true
  CLAUDE_CONFIG_DIR="$dir" claude plugin install guise@guise 2>&1 | tail -1 || true
done

echo ""
echo "Done. Restart any open Claude sessions (or run /reload-plugins) to pick it up."
