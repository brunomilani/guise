---
description: Set up guise for this repository — detect the repo and provider, read any project policy, and choose the account this repo should use. GitHub lists the available 'gh' accounts; Bitbucket and GitLab ask for username/email and auto-detect the SSH key from ~/.ssh/config. Use on first setup or when no account is configured yet.
---

# guise: init

Run it directly — no terminal hand-off needed when there's no TTY:

```bash
"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh init
```

**Bitbucket / GitLab (in-session, autonomous):** with no TTY `init` infers
everything — username from the remote owner, email from the repo's git config,
and the SSH key auto-detected from `~/.ssh/config` for the remote host — then
applies the key (`core.sshCommand`) and identity. No prompts. Run it yourself,
then `/guise:status`. To override a value:
`guise set --user <u> --email <e> --ssh-key <path>`.

**GitHub:** `init` auto-resolves when unambiguous. If multiple accounts apply and
there's no TTY, it asks for `--user <name>` — run `guise set --user <name>`
instead, or tell the user to run `guise init` in their terminal to pick.

The choice is saved locally only (`~/.config/guise/config.json`) and is never
committed.
