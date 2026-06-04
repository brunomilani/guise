# GitHub Account Rules (guise)

This repository uses the **guise** plugin to make sure commits, pushes,
and GitHub CLI operations use the correct GitHub account.

Before running any GitHub CLI command, PR creation, issue creation, review,
merge, or push-related operation, run:

```bash
guise use
guise validate
```

If `guise validate` exits non-zero, **stop** and explain the issue to the
user. Do not proceed with the GitHub operation until it passes.

## Rules

- Never change the repository remote `origin` without explicit user confirmation.
- Never commit local account mappings, tokens, credentials, or
  `.claude/settings.local.json`.
- Never run `gh auth logout` or delete credentials.
- Never push automatically — ask first.
- If the local git `user.email` does not match the chosen account, suggest
  `guise git-sync` (which asks before changing anything).

The committed policy lives in `.claude/github-account-policy.json`. The local,
per-developer choice is stored outside the repo in
`~/.config/guise/config.json` and is never committed.
