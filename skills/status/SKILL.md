---
description: Show the guise status for the current repository — configured GitHub account, active gh account, git identity, policy, and validation results. Use when the user asks which GitHub account is active or whether the repo is set up correctly.
---

# guise: status

Run the status report for the current repository and present it to the user verbatim.

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh status
```

Summarize any mismatches and the recommended fix commands at the end.
