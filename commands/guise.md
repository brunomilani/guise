---
description: Pick and enforce the correct GitHub/Bitbucket/GitLab account for this repository. Dispatches to the guise CLI (status, use, validate, choose, init, set, git-sync, install-hook, uninstall-hook, reset).
argument-hint: "[status|use|validate|choose|init|set|git-sync|install-hook|uninstall-hook|reset] [flags]"
---

# /guise

Run the guise CLI for the current repository and present the result to the user.

The user invoked `/guise $ARGUMENTS`.

1. Determine the subcommand from the arguments. If no argument was given,
   default to `status`.
2. Run it via the bundled launcher (works whether or not `guise` is on PATH):

   ```bash
   "${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh $ARGUMENTS
   ```

   If `$ARGUMENTS` is empty, run `"${CLAUDE_PLUGIN_ROOT}"/scripts/run.sh status`.
3. Show the CLI output to the user, then summarize any mismatch and the exact
   fix command it recommends.

Guardrails (these match the repo policy):

- If `validate` exits non-zero, **stop** and explain the issue. Do not proceed
  with any GitHub operation (PR/issue/merge/push) until it passes.
- For `use` on GitHub, if it reports the account is not authenticated, relay the
  exact `gh auth login` command — do not run `gh auth login` yourself.
- Never run `gh auth logout`, never delete credentials, never change the `origin`
  remote, and never push without explicit user confirmation.
- If the local git `user.email` does not match the chosen account, suggest
  `/guise git-sync` (it prompts before changing anything).
