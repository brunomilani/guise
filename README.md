# guise 🐙🔀

**Pick and enforce the right GitHub, Bitbucket or GitLab account per repository.**

For teams where every developer has more than one account on the same
machine (personal + company, multiple orgs, client accounts…). `guise`
remembers which account *this repo* should use, activates it before any
`gh` / push / PR operation, and warns when your git email is wrong — all without
ever storing a token.

- **GitHub** — switches the active account via `gh auth switch`.
- **Bitbucket & GitLab** — no account CLI exists, so guise pins the right
  **SSH key** per repo (via local `core.sshCommand`) + git identity. That key
  *is* the account that pushes.

It ships as both a standalone CLI and a **Claude Code plugin** (skills, hooks,
and a status line that shows the active account).

```
[github account: john-work · john@domain.com]
```

---

## The problem it solves

You clone `acme/web-app`. Your machine has two GitHub accounts logged in
to `gh`: `john-personal` (default) and `john-work`. You open Claude Code,
ask it to create a PR — and it uses the wrong account, or your commit lands with
your personal `@gmail.com` email. `guise` fixes the account *per repo*, so
the right identity is always used and verified before GitHub work.

---

## Install

### Quick (community installer)

macOS / Linux / WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/brunomilani/guise/main/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/brunomilani/guise/main/install.ps1 | iex
```

### From source

```bash
git clone https://github.com/brunomilani/guise
cd guise
npm install
npm run build
npm test
npm link        # makes `guise` available globally
```

### As a Claude Code plugin

```text
/plugin marketplace add brunomilani/guise
/plugin install guise@guise
```

This adds the `/guise` command (plus the `/guise:*` skills), the
SessionStart / pre-Bash hooks, and
makes the bundled CLI available to those hooks. (Installing the plugin and
`npm link` are independent — do either or both.)

---

## Usage (individual)

```bash
cd /path/to/repo
guise init        # detect repo, list gh accounts, pick one (saved locally)
guise status      # full report
guise use         # activate the chosen account via `gh auth switch`
guise validate    # exit non-zero if anything is wrong
guise git-sync    # apply user.name / user.email locally (asks first)
guise reset       # forget the choice for this repo
```

### Commands

| Command            | What it does |
| ------------------ | ------------ |
| `init`             | **Auto-detects** the right account (matches repo owner → account, or picks the only one) and saves it. Prompts only when genuinely ambiguous. Flags: `--user`, `--email`, `--ssh-key`, `--auto`, `--yes`, `--force`. |
| `set`              | Non-interactive: `guise set --user X [--email E] [--ssh-key path]`. Ideal for scripts/CI and for Claude to run inside a session. |
| `status`           | Repo + remote + configured account + active `gh` account + git identity + policy + validation. |
| `choose`           | Change the chosen account for this repo. |
| `use`              | Activate the configured account. GitHub: `gh auth switch`. Bitbucket/GitLab: pin the repo-local SSH key. |
| `validate`         | Runs every check. Non-zero exit on error (CI-friendly). |
| `git-sync`         | Sets `git config --local user.name/email` from the saved choice (after confirmation). |
| `reset`            | Removes the local mapping for this repo. |
| `statusline`       | Prints `[github account: …]` for the Claude Code status line. |

Inside Claude Code, use the **`/guise`** command with any subcommand as an
argument — e.g. `/guise status`, `/guise use`, `/guise validate`,
`/guise choose` (no argument defaults to `status`). The individual skills are
also available namespaced: `/guise:init`, `/guise:status`, `/guise:use`,
`/guise:validate`, `/guise:choose`, `/guise:git-sync`, `/guise:reset`.

---

## Providers: GitHub + Bitbucket + GitLab

guise actively manages three providers, each with the mechanism that fits it:

| Provider | How "use" activates the account | Account discovery |
| -------- | ------------------------------- | ----------------- |
| **GitHub** | `gh auth switch` to the chosen account | Automatic via `gh auth status` |
| **Bitbucket** | Pins the repo-local SSH key (`core.sshCommand`) + git identity | Manual / auto-detected from `~/.ssh/config` |
| **GitLab** | Same SSH model as Bitbucket | Manual / auto-detected from `~/.ssh/config` |

Bitbucket and GitLab have no `gh`-style multi-account CLI, so the **SSH key is
the credential** — `guise use` pins it per repo, `guise init` auto-detects the
key configured for the remote host in your `~/.ssh/config`, and the pre-push
hook re-pins it before `git push`. No tokens or app passwords are ever stored.

On any other remote (self-hosted with an unrecognized host), guise is
**inactive** — `status`/`validate`/`use` are no-ops that exit 0, the hooks never
block, and the status line shows nothing. It never half-manages a provider it
can't drive reliably.

## Named profiles (0.3)

A profile is a **named identity template** — define your identity once, apply it
to any repo. It just fills the repo's choice; there is no extra resolution layer.

```bash
guise profile set work --user john-work --email john@domain.com --ssh-key ~/.ssh/work
guise profile set personal --user john-personal --email john@personal.com
guise profile list

cd ~/dev/some-company-repo
guise set --profile work        # applies account + email + ssh key at once
```

## What's new in 0.6

- **GitLab support** — `gitlab.com` (and any host detected as GitLab) is now
  driven by the same SSH model as Bitbucket. One generic SSH code path serves
  both: `usesSshModel()` in `src/resolve.ts` is the single switch.

## What's new in 0.5

- **Bitbucket support (SSH model)** — `init`/`use`/`validate`/`status`/`git-sync`,
  the hooks, and the status line now work on `bitbucket.org` remotes. Since there
  is no Bitbucket account CLI, the account is the **SSH key + git identity**:
  `use` pins the key via local `core.sshCommand`, `init` auto-detects it from
  `~/.ssh/config`, and the pre-push hook re-pins it before `git push`.
- **`~/.ssh/config` key detection** — guise reads the `IdentityFile` configured
  for the remote host (or SSH alias) to pre-fill the key on `init`.

## What's new in 0.2

- **Auto-resolution** — `guise init` no longer needs a prompt in the common
  case. It matches the repo owner to an available account (`johnsmith/x` →
  account `johnsmith`), or picks the only authenticated account. Prompts only
  on a real tie.
- **Non-interactive `set`** — `guise set --user X --email Y --ssh-key Z`.
  Scriptable; lets Claude configure a repo without a terminal.
- **Per-repo SSH key** — saved key is applied via local `core.sshCommand`
  (`ssh -i <key> -o IdentitiesOnly=yes`). Your global `~/.ssh/config` is never
  touched.
- **Commit-email enforcement** — the pre-Bash hook now blocks `git commit` when
  the local email doesn't match the chosen account or the policy's email domain.
- **Multi-provider detection** — GitHub, GitLab, Bitbucket are detected from the
  remote host. GitHub account switching is fully automated (`gh`); GitLab/Bitbucket
  are detected and validated with guidance (automated switching is on the roadmap).
- **Multi-Claude install** — `scripts/install-all-claude.sh` installs/updates the
  plugin across every `~/.claude*` config dir (for users running several Claude
  accounts).

## Usage (team)

1. **Commit a policy** so everyone's setup is checked the same way. Create
   `.claude/github-account-policy.json` (safe to commit — no credentials):

   ```json
   {
     "githubHost": "github.com",
     "expectedOwner": "acme",
     "allowedUsers": ["john-work", "dev1", "dev2"],
     "requireGitEmailDomain": "domain.com",
     "enforceBeforeGhCommands": true,
     "enforceBeforePush": true,
     "hostAliases": { "github-acme": "github.com" }
   }
   ```

2. **Commit a `CLAUDE.md`** telling Claude to validate before GitHub work — see
   [`examples/CLAUDE.md`](examples/CLAUDE.md).

3. Each developer runs `guise init` once per clone. Their choice is stored
   **outside the repo** and is never committed.

`guise validate` enforces:

- the chosen account is in `allowedUsers` (if set);
- the remote owner matches `expectedOwner` (if set);
- the local git email domain matches `requireGitEmailDomain` (if set);
- the host matches `githubHost` (if set).

Failures with `level: error` make `validate` exit non-zero and the pre-Bash hook
block `gh` / `git push`.

---

## Which files to commit / ignore

| File | Commit? | Why |
| ---- | ------- | --- |
| `.claude/github-account-policy.json` | ✅ yes | Team policy, no secrets. |
| `examples/CLAUDE.md` → your `CLAUDE.md` | ✅ yes | Tells Claude to validate. |
| `~/.config/guise/config.json` | 🚫 never | Per-developer local choice (lives outside the repo). |
| `.claude/settings.local.json` | 🚫 never | Personal settings. Already in `.gitignore`. |
| tokens / credentials | 🚫 never | `guise` never reads, prints, or stores them. |

A ready-made `.gitignore` is included.

---

## Where the local choice is stored

```
~/.config/guise/config.json   (or $XDG_CONFIG_HOME/guise/config.json)
```

```json
{
  "repos": {
    "/Users/john/dev/web-app": {
      "host": "github.com",
      "owner": "acme",
      "repo": "web-app",
      "githubUser": "john-work",
      "gitUserName": "John Smith",
      "gitUserEmail": "john@domain.com",
      "createdAt": "2026-06-04T00:00:00.000Z",
      "updatedAt": "2026-06-04T00:00:00.000Z"
    }
  }
}
```

It is stored **outside any repo** (so it physically cannot be committed) and is
written with `0600` permissions. **No tokens are ever stored.**

---

## Example with two GitHub accounts

```text
$ gh auth status
github.com
  ✓ Logged in to github.com account john-personal (keyring)   ← active
  ✓ Logged in to github.com account john-work (keyring)

$ cd ~/dev/web-app    # git@github.com:acme/web-app.git
$ guise init
This repository points to:
  github.com/acme/web-app

Available GitHub accounts on github.com:
  1. john-personal (active)
  2. john-work

Which account for this repository? > 2
Chosen account: john-work
Saved locally only (never committed).

$ guise use
Switched gh to john-work on github.com.

$ guise validate
✓ Active gh account matches: john-work
Validation passed.
```

---

## Status line

Add to `.claude/settings.json` (committable):

```json
{ "statusLine": { "type": "command", "command": "guise statusline" } }
```

If you didn't `npm link`, point it at the plugin script instead:

```json
{ "statusLine": { "type": "command", "command": "<plugin-root>/scripts/statusline.sh" } }
```

---

## Troubleshooting

- **`gh` not installed** — install from <https://cli.github.com>. `guise`
  still detects the repo and saves git identity, but cannot switch accounts.
- **No account logged in** — `gh auth login --hostname github.com`.
- **Configured account not authenticated** — `guise use` prints the exact
  `gh auth login --hostname <host>` to run. It will not log you in unattended.
- **Bitbucket / GitLab repo** — guise manages it via the SSH model: `guise init`
  auto-detects the key from `~/.ssh/config`, `guise use` pins it. If a push uses
  the wrong key, run `guise use` (or check `guise status` → "Applied: yes").
- **Remote is an unrecognized self-hosted host** — `guise` is inactive there;
  commands exit 0 and the hooks never block.
- **Wrong local git email** — `guise git-sync` sets `user.email` locally
  after confirmation. Global config is never modified.
- **WSL** — works as on Linux. Use a single `gh` install (don't mix the Windows
  and WSL `gh`); `guise` uses whichever is on your `PATH`.
- **SSH alias** (e.g. `git@github-acme:...`) — map it to the real host with
  `hostAliases` in the policy or your local config:
  `{ "hostAliases": { "github-acme": "github.com" } }`.
- **HTTPS credential manager** — `guise` only calls `gh auth switch`; it
  does not modify your OS credential manager. If pushes still use the old
  identity, ensure `gh auth setup-git` has configured git's credential helper.

---

## Security guarantees

`guise` will **never**: store or print a token, commit local config, modify
your SSH config, change the `origin` remote, run `git push` for you,
`gh auth logout`, delete credentials, or silently guess the wrong account. See
[`SECURITY`](#security-guarantees) above and the source — there is no network
code beyond invoking your local `git` and `gh`.

---

## Design notes — why this architecture

See [ARCHITECTURE](#architecture) below.

### Architecture

`guise` is a **zero-runtime-dependency TypeScript CLI** wrapped in a
**Claude Code plugin**:

- **CLI (`src/`)** does all the work via `git` and `gh` with `child_process`.
  Pure parsing/validation logic is isolated (`git.ts`, `gh.ts`, `validate.ts`)
  and unit-tested.
- **Plugin (`.claude-plugin/`, `commands/`, `skills/`, `hooks/`)** exposes the
  `/guise` command, the `/guise:*` skills, and two hooks:
  - **SessionStart** → prints a one-line account note.
  - **PreToolUse(Bash)** → before a `gh` command or `git push`, switches to the
    configured account, or blocks (exit 2) with guidance if it can't.
- **Local choice** lives in `~/.config/guise/` — chosen over
  `.claude/settings.local.json` and `.git/…` because it is *outside the repo*
  (cannot be committed) and serves every repo from one file.
- **Policy** (`.claude/github-account-policy.json`) is the committable, shared,
  credential-free contract the whole team is validated against.

Why this split: the Claude Code plugin API gives us first-class commands and
hooks, but enforcement logic (parsing remotes, reading `gh auth status`,
switching accounts) needs real code — so it lives in a small testable CLI that
the plugin, the status line, and a plain shell all share.

---

## License

MIT
