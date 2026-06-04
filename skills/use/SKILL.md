---
description: Activate the account configured for this repository. GitHub uses 'gh auth switch'; Bitbucket and GitLab pin the repo-local SSH key (core.sshCommand). Run before any gh command, PR/issue creation, review, merge, or push. Use when the user is about to do remote git work or when the active account does not match.
---

# guise: use

Activate the configured account for this repo, then confirm the result.

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh use
```

- **GitHub:** if it reports the account is not authenticated, relay the exact
  `gh auth login` command it prints. Do not run `gh auth login` yourself
  unattended.
- **Bitbucket / GitLab:** it pins the repo's SSH key via local `core.sshCommand`.
  If it reports the key is missing, relay the `guise set --ssh-key <path>` hint.
