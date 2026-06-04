---
description: Remove the locally-saved GitHub account choice for this repository. Does not log out of gh, delete credentials, or change git config. Use when the user wants to clear or redo the repo's account mapping.
---

# guise: reset

Remove the local choice for the current repo:

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh reset
```

This only deletes the local mapping. It never runs `gh auth logout` and never
removes any credentials.
