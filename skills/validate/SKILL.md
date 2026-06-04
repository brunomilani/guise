---
description: Validate that the active GitHub account, git identity, and project policy all match what this repository expects. Returns a non-zero exit code on failure. Use before PR/issue/merge/push, or whenever the user wants to confirm the environment is correct.
---

# guise: validate

Run all validation rules. A non-zero exit means at least one error.

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh validate
```

If validation fails, STOP and explain the issue to the user before proceeding
with any GitHub operation. Suggest `/guise:use` and `/guise:git-sync`
as fixes when relevant.
