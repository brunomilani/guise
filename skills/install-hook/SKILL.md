---
description: Install a native git pre-push hook that enforces this repo's account in every terminal — not just inside a Claude session. The hook runs 'guise use' and 'guise validate' before each push and aborts on mismatch. Use when the user wants pushes to always go through the correct account even from a plain shell, or after another terminal ran 'gh auth switch'.
---

# guise: install-hook

The Claude Code PreToolUse hook only sees commands run inside a Claude session.
A developer pushing from their own terminal — after a `gh auth switch` somewhere
else — bypasses guise entirely. This installs a native git `pre-push` hook so the
repo's account is forced before **every** push, from any terminal.

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh install-hook
```

- The hook runs `guise use` (GitHub: `gh auth switch` · Bitbucket/GitLab: pin the
  SSH key) then `guise validate`, and aborts the push if the account can't be made
  correct.
- It never clobbers an existing non-guise `pre-push` hook — it reports and stops.
- Remove it with `"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh uninstall-hook`.
