---
description: Apply the saved account's git user.name and user.email to this repository's local git config (git config --local). Prompts before overwriting. Use when the local git email is wrong for the chosen account.
---

# guise: git-sync

Interactive — it asks for confirmation before changing local git identity:

```bash
guise git-sync
```

Or through the plugin:

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh git-sync
```

Only `--local` config is touched. Global git config is never modified.
