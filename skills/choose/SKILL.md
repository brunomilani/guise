---
description: Change which GitHub account this repository uses. Lists the available GitHub CLI accounts and saves the new choice locally. Use when the user wants to switch the repo to a different GitHub account.
---

# guise: choose

Interactive — instruct the user to run it in their own terminal:

```bash
guise choose
```

Or through the plugin:

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh choose
```

The new choice is saved locally only and never committed.
