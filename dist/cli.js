#!/usr/bin/env node
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { getRepoChoice, setRepoChoice, removeRepoChoice, resolveHostAliases, getProfile, listProfiles, setProfile, removeProfile, } from "./config.js";
import { getRepoInfo, installPrePushHook, isGitRepo, setLocalIdentity, setLocalSshKey, sshCommandFor, uninstallPrePushHook, } from "./git.js";
import { isGhInstalled, listGhAccounts, getActiveGhAccount, ghSwitch, findGhAccount, } from "./gh.js";
import { detectSshKeyForHost, expandTilde } from "./ssh.js";
import { loadPolicy } from "./policy.js";
import { validate } from "./validate.js";
import { autoResolveAccount, hasAccountCli, isSupported, providerLabel, usesSshModel, } from "./resolve.js";
import { classifyCommand, isIdentitySensitive } from "./command.js";
const VERSION = "0.6.0";
/** Parse `--flag value` and `--bool` from argv after the subcommand. */
function parseFlags(argv) {
    const flags = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (!a.startsWith("--"))
            continue;
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
            flags[key] = next;
            i++;
        }
        else {
            flags[key] = true;
        }
    }
    return flags;
}
// --- tiny ANSI helpers (no deps) ----------------------------------------
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c("1", s);
const dim = (s) => c("2", s);
const green = (s) => c("32", s);
const red = (s) => c("31", s);
const yellow = (s) => c("33", s);
function out(s = "") {
    process.stdout.write(s + "\n");
}
// ISO timestamp without using Date in the testable modules.
function nowIso() {
    return new Date().toISOString();
}
async function prompt(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await new Promise((resolve) => rl.question(question, resolve));
    }
    finally {
        rl.close();
    }
}
async function confirm(question, def = false) {
    const hint = def ? "[Y/n]" : "[y/N]";
    const ans = (await prompt(`${question} ${hint} `)).trim().toLowerCase();
    if (!ans)
        return def;
    return ans === "y" || ans === "yes";
}
/** Resolve repo + accounts + policy once. Exits the process on hard errors. */
function loadContext() {
    const cwd = process.cwd();
    if (!isGitRepo(cwd)) {
        out(red("Not inside a git repository."));
        process.exit(1);
    }
    // We need the repo root first to read its policy (for host aliases).
    const bootstrap = getRepoInfo(cwd);
    const policy = loadPolicy(bootstrap.path);
    const aliases = resolveHostAliases(policy?.hostAliases);
    const repo = getRepoInfo(cwd, aliases);
    // Only GitHub has CLI account introspection here. For other providers we
    // leave accounts empty so we never offer a github account on, say, bitbucket.
    const provider = repo.remote?.provider ?? "github";
    const ghOk = isGhInstalled();
    const accounts = provider === "github" && ghOk ? listGhAccounts() : [];
    return { repo, accounts, ghOk };
}
/** Provider of the current repo (defaults to github when there's no remote). */
function repoProvider(repo) {
    return repo.remote?.provider ?? "github";
}
/**
 * Print the inactive notice and return true when the repo is NOT GitHub.
 * guise automates GitHub only; on other remotes every command is a no-op.
 */
function inactiveIfUnsupported(repo, quiet = false) {
    const p = repoProvider(repo);
    if (isSupported(p))
        return false;
    if (!quiet) {
        out(dim(`guise: inactive — supports GitHub, Bitbucket and GitLab (this remote is ${providerLabel(p)}).`));
    }
    return true;
}
// --- commands -----------------------------------------------------------
async function cmdInit() {
    const flags = parseFlags(process.argv.slice(3));
    const { repo, accounts, ghOk } = loadContext();
    if (inactiveIfUnsupported(repo))
        return 0;
    // Bitbucket/GitLab have no account CLI; take the SSH-key + identity path.
    if (usesSshModel(repoProvider(repo)))
        return initSshProvider(repo);
    if (!ghOk) {
        out(red("GitHub CLI (gh) is not installed. Install it: https://cli.github.com"));
        return 1;
    }
    if (!repo.remote) {
        out(yellow("Warning: origin is not a recognizable git remote. Continuing anyway."));
    }
    out(bold("guise init"));
    if (repo.remote) {
        out(`This repository points to:\n  github.com/${repo.remote.owner}/${repo.remote.repo}\n`);
    }
    const existing = getRepoChoice(repo.path);
    if (existing && !flags.force && !flags.user) {
        out(`Already configured: ${green(existing.githubUser)} on ${existing.host}`);
        if (!process.stdin.isTTY)
            return 0; // non-interactive: keep current
        if (!(await confirm("Re-choose the account?", false)))
            return 0;
    }
    // --profile or --user bypass everything (fully non-interactive).
    if (typeof flags.profile === "string") {
        const user = typeof flags.user === "string" ? flags.user : getProfile(flags.profile)?.githubUser;
        if (!user) {
            out(red(`Unknown profile "${flags.profile}". List them: guise profile list`));
            return 1;
        }
        return saveChoice(repo, user, flags) ? 0 : 1;
    }
    if (typeof flags.user === "string") {
        return saveChoice(repo, flags.user, flags) ? 0 : 1;
    }
    // Auto-resolution — the magic path that avoids a prompt when unambiguous.
    const auto = autoResolveAccount(repo.remote, accounts);
    if (auto.account) {
        const autoAccept = flags.auto === true || flags.yes === true || !process.stdin.isTTY;
        out(`Auto-detected account: ${green(auto.account.user)} ${dim(`(${auto.reason})`)}`);
        if (autoAccept || (await confirm("Use this account for the repository?", true))) {
            return saveChoice(repo, auto.account.user, flags) ? 0 : 1;
        }
    }
    else if (auto.candidates.length === 0) {
        out(red(`No authenticated accounts found on ${repo.remote?.host ?? "github.com"}.`));
        out(`  Run: gh auth login`);
        return 1;
    }
    // Ambiguous → interactive selection (or fail in non-interactive mode).
    if (!process.stdin.isTTY) {
        out(red("Multiple accounts apply. Re-run with --user <name> (non-interactive)."));
        auto.candidates.forEach((a) => out(`  - ${a.user}`));
        return 1;
    }
    const choice = await chooseAccount(repo, accounts);
    return choice ? 0 : 1;
}
/**
 * SSH-model init (Bitbucket / GitLab). There is no `gh`-style CLI to enumerate
 * accounts, so the account is the SSH key + git identity we record. We
 * auto-detect the key pinned for the remote host in ~/.ssh/config and confirm.
 */
async function initSshProvider(repo) {
    const flags = parseFlags(process.argv.slice(3));
    const label = providerLabel(repoProvider(repo));
    out(bold("guise init") + dim(` (${label} — SSH model)`));
    if (repo.remote) {
        out(`This repository points to:\n  ${repo.remote.host}/${repo.remote.owner}/${repo.remote.repo}\n`);
    }
    else {
        out(yellow("Warning: origin is not a recognizable git remote. Continuing anyway."));
    }
    const existing = getRepoChoice(repo.path);
    if (existing && !flags.force && !flags.user && !flags.profile) {
        out(`Already configured: ${green(existing.githubUser)} on ${existing.host}`);
        if (!process.stdin.isTTY)
            return 0;
        if (!(await confirm("Re-choose the account?", false)))
            return 0;
    }
    // Non-interactive paths: --profile / --user bypass the prompts.
    if (typeof flags.profile === "string" || typeof flags.user === "string") {
        const user = typeof flags.user === "string" ? flags.user : getProfile(flags.profile)?.githubUser;
        if (!user) {
            out(red(`Unknown profile "${flags.profile}". List them: guise profile list`));
            return 1;
        }
        if (!saveChoice(repo, user, flags))
            return 1;
        return applySshAfterInit(repo, flags);
    }
    // Non-interactive (e.g. driven by Claude in-session): infer everything from
    // the remote + git config + ~/.ssh/config and apply, no prompts, no terminal.
    if (!process.stdin.isTTY) {
        const owner = repo.remote?.owner;
        if (!owner) {
            out(red("No remote owner to infer a username from. Re-run with --user <name>."));
            return 1;
        }
        const inferred = { user: owner, yes: true };
        if (repo.gitUserEmail)
            inferred.email = repo.gitUserEmail;
        // saveChoice auto-detects the SSH key for the host when none is passed.
        if (!saveChoice(repo, owner, inferred))
            return 1;
        return applySshAfterInit(repo, inferred);
    }
    const ownerDefault = repo.remote?.owner ?? "";
    const userAns = (await prompt(`${label} username${ownerDefault ? ` [${ownerDefault}]` : ""}: `)).trim();
    const user = userAns || ownerDefault;
    if (!user) {
        out(red("A username is required."));
        return 1;
    }
    const emailDefault = repo.gitUserEmail ?? "";
    const emailAns = (await prompt(`Git email${emailDefault ? ` [${emailDefault}]` : ""}: `)).trim();
    const email = emailAns || emailDefault;
    const detected = repo.remote ? detectSshKeyForHost(repo.remote.rawHost) : null;
    if (detected)
        out(dim(`Detected SSH key for ${repo.remote?.rawHost}: ${detected}`));
    const keyAns = (await prompt(`SSH key${detected ? ` [${detected}]` : " (path, optional)"}: `)).trim();
    const sshKey = keyAns || detected;
    const persistFlags = { user };
    if (email)
        persistFlags.email = email;
    if (sshKey)
        persistFlags["ssh-key"] = sshKey;
    if (!saveChoice(repo, user, persistFlags))
        return 1;
    return applySshAfterInit(repo, persistFlags);
}
/** Offer to apply the SSH key + git identity right after a Bitbucket init. */
async function applySshAfterInit(repo, flags) {
    const choice = getRepoChoice(repo.path);
    if (!choice)
        return 0;
    const apply = flags.yes === true ||
        (process.stdin.isTTY && (await confirm("Apply SSH key + git identity to this repo now?", true)));
    if (!apply) {
        out(dim("Activate later with: guise use  (then  guise git-sync)"));
        return 0;
    }
    if (choice.sshKey)
        setLocalSshKey(repo.path, choice.sshKey);
    setLocalIdentity(repo.path, choice.gitUserName, choice.gitUserEmail);
    out(green("Applied SSH key + git identity for this repo."));
    return 0;
}
/**
 * Persist a choice by username (used by init --user and `set`). A profile, if
 * given, supplies defaults; explicit flags override it. The profile only fills
 * the choice — there is no separate read-time resolution.
 */
function saveChoice(repo, user, flags) {
    const profileName = typeof flags.profile === "string" ? flags.profile : null;
    const profile = profileName ? getProfile(profileName) : undefined;
    if (profileName && !profile) {
        out(red(`Unknown profile "${profileName}". List them: guise profile list`));
        return false;
    }
    const provider = profile?.provider ?? repo.remote?.provider ?? "github";
    const host = profile?.host ?? repo.remote?.host ?? "github.com";
    // For Bitbucket the SSH key IS the credential. When the caller gives none,
    // auto-detect the key pinned for this host in ~/.ssh/config.
    const sshKey = typeof flags["ssh-key"] === "string"
        ? flags["ssh-key"]
        : profile?.sshKey ??
            (usesSshModel(provider) && repo.remote
                ? detectSshKeyForHost(repo.remote.rawHost)
                : null);
    const choice = setRepoChoice(repo.path, {
        host,
        owner: repo.remote?.owner ?? "",
        repo: repo.remote?.repo ?? "",
        githubUser: user,
        provider,
        gitUserName: typeof flags.name === "string" ? flags.name : profile?.gitUserName ?? repo.gitUserName,
        gitUserEmail: typeof flags.email === "string"
            ? flags.email
            : profile?.gitUserEmail ?? repo.gitUserEmail,
        sshKey,
    }, nowIso());
    out(`Configured account: ${green(choice.githubUser)} on ${choice.host}` +
        (profileName ? dim(` (profile ${profileName})`) : ""));
    out(dim("Saved locally only (never committed)."));
    return true;
}
/** Non-interactive: guise set --user X | --profile NAME [--email] [--ssh-key]. */
function cmdSet() {
    const flags = parseFlags(process.argv.slice(3));
    const { repo } = loadContext();
    if (inactiveIfUnsupported(repo))
        return 0;
    // With a profile and no --user, take the username from the profile.
    let user = typeof flags.user === "string" ? flags.user : "";
    if (!user && typeof flags.profile === "string") {
        user = getProfile(flags.profile)?.githubUser ?? "";
    }
    if (!user) {
        out(red("Usage: guise set --user <name> | --profile <name> [--email <e>] [--ssh-key <p>]"));
        return 1;
    }
    return saveChoice(repo, user, flags) ? 0 : 1;
}
/** Manage named identity templates: profile set|list|rm. */
function cmdProfile() {
    const sub = process.argv[3];
    const rest = process.argv.slice(4);
    const flags = parseFlags(rest);
    const name = rest.find((a) => !a.startsWith("--"));
    switch (sub) {
        case "list": {
            const profiles = listProfiles();
            const names = Object.keys(profiles);
            if (!names.length) {
                out(dim("No profiles. Create one: guise profile set work --user X --email you@co.com"));
                return 0;
            }
            out(bold("Profiles:"));
            for (const n of names) {
                const p = profiles[n];
                out(`  ${green(n)}: ${p.githubUser}${p.gitUserEmail ? " · " + p.gitUserEmail : ""}` +
                    `${p.sshKey ? dim(" · ssh:" + p.sshKey) : ""}`);
            }
            return 0;
        }
        case "set": {
            if (!name || typeof flags.user !== "string") {
                out(red("Usage: guise profile set <name> --user <u> [--email <e>] [--name <n>] [--ssh-key <p>] [--host <h>]"));
                return 1;
            }
            setProfile(name, {
                githubUser: flags.user,
                host: typeof flags.host === "string" ? flags.host : undefined,
                gitUserName: typeof flags.name === "string" ? flags.name : undefined,
                gitUserEmail: typeof flags.email === "string" ? flags.email : undefined,
                sshKey: typeof flags["ssh-key"] === "string" ? flags["ssh-key"] : undefined,
            });
            out(green(`Saved profile "${name}".`));
            out(dim(`Apply it to a repo: guise set --profile ${name}`));
            return 0;
        }
        case "rm":
        case "remove": {
            if (!name) {
                out(red("Usage: guise profile rm <name>"));
                return 1;
            }
            out(removeProfile(name) ? green(`Removed profile "${name}".`) : dim(`No profile "${name}".`));
            return 0;
        }
        default:
            out(red("Usage: guise profile <set|list|rm> ..."));
            return 1;
    }
}
/** Shared selection flow used by init and choose. */
async function chooseAccount(repo, accounts) {
    const host = repo.remote?.host ?? "github.com";
    const provider = repo.remote?.provider ?? "github";
    const pool = accounts.filter((a) => a.host === host);
    if (pool.length === 0) {
        if (provider === "github") {
            out(red(`No GitHub accounts found via gh on ${host}.`));
            out(`  Run: gh auth login --hostname ${host}`);
        }
        else {
            out(yellow(`guise can't list ${providerLabel(provider)} accounts automatically.`));
            out(`  Set it manually: guise set --user <name> [--email <e>] [--ssh-key <p>]`);
        }
        return null;
    }
    out(`Available ${providerLabel(provider)} accounts on ${host}:`);
    pool.forEach((a, i) => {
        const tag = a.active ? dim(" (active)") : "";
        out(`  ${i + 1}. ${a.user}${tag}`);
    });
    out("");
    let selected;
    if (pool.length === 1) {
        if (!(await confirm(`Use "${pool[0].user}" for this repository?`, true)))
            return null;
        selected = pool[0];
    }
    else {
        const raw = (await prompt("Which account for this repository? > ")).trim();
        const idx = Number.parseInt(raw, 10) - 1;
        if (Number.isNaN(idx) || idx < 0 || idx >= pool.length) {
            out(red("Invalid selection."));
            return null;
        }
        selected = pool[idx];
    }
    const choice = setRepoChoice(repo.path, {
        host: selected.host,
        owner: repo.remote?.owner ?? "",
        repo: repo.remote?.repo ?? "",
        githubUser: selected.user,
        provider: repo.remote?.provider ?? "github",
        // Preserve current git identity; never invent an email.
        gitUserName: repo.gitUserName,
        gitUserEmail: repo.gitUserEmail,
        sshKey: null,
    }, nowIso());
    out(`\nChosen account: ${green(choice.githubUser)}`);
    out(dim("Saved locally only (never committed)."));
    return selected;
}
async function cmdChoose() {
    const { repo, accounts, ghOk } = loadContext();
    if (inactiveIfUnsupported(repo))
        return 0;
    if (usesSshModel(repoProvider(repo)))
        return initSshProvider(repo);
    if (!ghOk) {
        out(red("gh is not installed."));
        return 1;
    }
    return (await chooseAccount(repo, accounts)) ? 0 : 1;
}
async function cmdUse() {
    const { repo, accounts, ghOk } = loadContext();
    const choice = getRepoChoice(repo.path);
    if (inactiveIfUnsupported(repo))
        return 0;
    if (!choice) {
        out(red("No account configured. Run: guise init"));
        return 1;
    }
    if (usesSshModel(repoProvider(repo)))
        return useSshProvider(repo, choice);
    if (!ghOk) {
        out(red("gh is not installed."));
        return 1;
    }
    const target = findGhAccount(accounts, choice.host, choice.githubUser);
    if (!target) {
        out(red(`The GitHub account configured for this repo is "${choice.githubUser}", ` +
            `but it is not authenticated in this environment.\n`));
        out(`Execute:\n  gh auth login --hostname ${choice.host}`);
        return 1;
    }
    const active = getActiveGhAccount(accounts, choice.host);
    if (active && active.user === choice.githubUser) {
        out(green(`Already active: ${choice.githubUser} on ${choice.host}`));
        return 0;
    }
    if (ghSwitch(choice.host, choice.githubUser)) {
        out(green(`Switched gh to ${choice.githubUser} on ${choice.host}.`));
        return 0;
    }
    out(red(`Failed to switch to ${choice.githubUser}. Run: gh auth switch --hostname ${choice.host} --user ${choice.githubUser}`));
    return 1;
}
/**
 * SSH-model "activation" (Bitbucket / GitLab): there is no CLI account to
 * switch. The account that pushes is decided by the SSH key, so we pin it via
 * repo-local core.sshCommand.
 */
function useSshProvider(repo, choice) {
    if (choice.sshKey) {
        if (!existsSync(expandTilde(choice.sshKey))) {
            out(red(`Configured SSH key "${choice.sshKey}" was not found on disk.`));
            out(dim("Fix the path with: guise set --ssh-key ~/.ssh/yourkey"));
            return 1;
        }
        setLocalSshKey(repo.path, choice.sshKey);
        out(green(`Activated SSH key for ${choice.githubUser}: ${choice.sshKey}`));
        out(dim("Pushes from this repo now use that key. Sync git identity with: guise git-sync"));
        return 0;
    }
    out(dim(`No repo-specific SSH key configured; pushes use your global SSH config for ${choice.host}.`));
    out(dim("Pin one with: guise set --ssh-key ~/.ssh/yourkey"));
    return 0;
}
async function cmdGitSync() {
    const { repo } = loadContext();
    if (inactiveIfUnsupported(repo))
        return 0;
    const choice = getRepoChoice(repo.path);
    if (!choice) {
        out(red("No account configured. Run: guise init"));
        return 1;
    }
    if (!choice.gitUserName && !choice.gitUserEmail && !choice.sshKey) {
        out(yellow("The saved choice has no git name/email/ssh-key to apply."));
        out(dim("Set them with: guise set --user X --email you@company.com --ssh-key ~/.ssh/key"));
        return 1;
    }
    out("Git local for this repo is currently:");
    out(`  user.name  = ${repo.gitUserName ?? dim("(unset)")}`);
    out(`  user.email = ${repo.gitUserEmail ?? dim("(unset)")}\n`);
    out("The chosen account suggests:");
    out(`  user.name  = ${choice.gitUserName ?? dim("(unchanged)")}`);
    out(`  user.email = ${choice.gitUserEmail ?? dim("(unchanged)")}`);
    if (choice.sshKey)
        out(`  ssh key    = ${choice.sshKey}`);
    out("");
    const flags = parseFlags(process.argv.slice(3));
    const auto = flags.yes === true || !process.stdin.isTTY;
    if (!auto && !(await confirm("Update git local identity for this repository?", false))) {
        out(dim("No changes made."));
        return 0;
    }
    setLocalIdentity(repo.path, choice.gitUserName, choice.gitUserEmail);
    if (choice.sshKey)
        setLocalSshKey(repo.path, choice.sshKey);
    out(green("Updated git local identity" + (choice.sshKey ? " and SSH key." : ".")));
    return 0;
}
function cmdValidate() {
    const { repo, accounts } = loadContext();
    const choice = getRepoChoice(repo.path);
    const policy = loadPolicy(repo.path);
    const sshKeyExists = choice?.sshKey ? existsSync(expandTilde(choice.sshKey)) : null;
    const result = validate({ repo, choice, accounts, policy, sshKeyExists });
    for (const item of result.items) {
        if (item.ok) {
            out(green("✓ ") + item.message);
        }
        else if (item.level === "error") {
            out(red("✗ ") + item.message);
        }
        else if (item.level === "warning") {
            out(yellow("! ") + item.message);
        }
        else {
            out(dim("· " + item.message));
        }
    }
    out("");
    out(result.ok ? green("Validation passed.") : red("Validation failed."));
    return result.ok ? 0 : 1;
}
function cmdStatus() {
    const { repo, accounts } = loadContext();
    const choice = getRepoChoice(repo.path);
    const policy = loadPolicy(repo.path);
    const active = getActiveGhAccount(accounts, choice?.host);
    const sshKeyExists = choice?.sshKey ? existsSync(expandTilde(choice.sshKey)) : null;
    const result = validate({ repo, choice, accounts, policy, sshKeyExists });
    out(bold("guise — Git Account Resolver\n"));
    out(bold("Repository:"));
    out(`  Path:   ${repo.path}`);
    out(`  Remote: ${repo.remoteUrl ?? dim("(none)")}`);
    if (repo.remote) {
        out(`  Owner:    ${repo.remote.owner}`);
        out(`  Repo:     ${repo.remote.repo}`);
        out(`  Host:     ${repo.remote.host}${repo.remote.host !== repo.remote.rawHost ? dim(` (alias ${repo.remote.rawHost})`) : ""}`);
        out(`  Provider: ${providerLabel(repo.remote.provider)}`);
    }
    out(`  Branch: ${repo.branch ?? dim("(none)")}\n`);
    if (inactiveIfUnsupported(repo))
        return 0;
    out(bold("Configured account:"));
    if (choice) {
        out(`  Account: ${choice.githubUser}`);
        out(`  Host:    ${choice.host}\n`);
    }
    else {
        out(`  ${yellow("none — run guise init")}\n`);
    }
    if (hasAccountCli(repoProvider(repo))) {
        out(bold("Current gh account:"));
        if (active) {
            const match = choice && active.user === choice.githubUser;
            out(`  Active user: ${active.user}`);
            out(`  Status:      ${match ? green("match") : red("mismatch")}\n`);
        }
        else {
            out(`  ${dim("no active account on this host")}\n`);
        }
    }
    else {
        out(bold(`SSH key (${providerLabel(repoProvider(repo))}):`));
        if (choice?.sshKey) {
            const applied = repo.gitSshCommand === sshCommandFor(choice.sshKey);
            out(`  Configured: ${choice.sshKey}${sshKeyExists === false ? red(" (missing)") : ""}`);
            out(`  Applied:    ${applied ? green("yes") : yellow("no — run guise use")}\n`);
        }
        else {
            out(`  ${dim("none — pushes use your global SSH config")}\n`);
        }
    }
    out(bold("Git local:"));
    out(`  user.name:  ${repo.gitUserName ?? dim("(unset)")}`);
    out(`  user.email: ${repo.gitUserEmail ?? dim("(unset)")}`);
    const emailStatus = !choice?.gitUserEmail
        ? dim("n/a")
        : repo.gitUserEmail === choice.gitUserEmail
            ? green("ok")
            : yellow("mismatch");
    out(`  Status:     ${emailStatus}\n`);
    if (policy) {
        out(bold("Policy:"));
        if (policy.expectedOwner)
            out(`  expectedOwner: ${policy.expectedOwner}`);
        if (policy.requireGitEmailDomain)
            out(`  requireGitEmailDomain: ${policy.requireGitEmailDomain}`);
        if (policy.allowedUsers)
            out(`  allowedUsers: ${policy.allowedUsers.join(", ")}`);
        const policyOk = result.items.filter((i) => i.id.startsWith("policy")).every((i) => i.ok);
        out(`  Status: ${policyOk ? green("passed") : red("failed")}\n`);
    }
    if (!result.ok) {
        out(bold("Recommended fix:"));
        out("  guise use");
        out("  guise git-sync");
    }
    return result.ok ? 0 : 1;
}
/**
 * Install a native git pre-push hook so the repo's account is enforced in every
 * terminal — not just inside a Claude session. The PreToolUse hook only sees
 * commands Claude runs; a developer pushing from their own shell needs this.
 */
function cmdInstallHook() {
    const { repo } = loadContext();
    const cliPath = fileURLToPath(import.meta.url);
    const res = installPrePushHook(repo.path, process.execPath, cliPath);
    if (res.status === "foreign") {
        out(yellow(`A non-guise pre-push hook already exists:\n  ${res.path}`));
        out(dim("Leaving it untouched. Merge the guise check in manually, or remove that file first."));
        return 1;
    }
    out(green(res.status === "updated" ? "Updated guise pre-push hook." : "Installed guise pre-push hook."));
    out(`  ${res.path}`);
    out(dim("Every push from any terminal now runs: guise use && guise validate (aborts on mismatch)."));
    return 0;
}
/** Remove the git pre-push hook (only when guise owns it). */
function cmdUninstallHook() {
    const { repo } = loadContext();
    const res = uninstallPrePushHook(repo.path);
    if (res === "removed")
        out(green("Removed guise pre-push hook."));
    else if (res === "absent")
        out(dim("No guise pre-push hook to remove."));
    else
        out(yellow("The existing pre-push hook is not guise-managed; left untouched."));
    return res === "foreign" ? 1 : 0;
}
function cmdReset() {
    const { repo } = loadContext();
    const removed = removeRepoChoice(repo.path);
    out(removed ? green("Removed local account choice for this repo.") : dim("No local choice to remove."));
    return 0;
}
/**
 * Statusline output: a single short line for Claude Code's statusLine.
 * Reads cwd from $CLAUDE_STATUS_CWD or stdin JSON, then prints
 *   [github account: <user> · <email>]
 * Always exits 0 and prints nothing on error (statuslines must be quiet).
 */
async function cmdStatusline() {
    try {
        let cwd = process.env.CLAUDE_STATUS_CWD || process.cwd();
        if (!process.stdin.isTTY) {
            const raw = await readStdin(200);
            if (raw) {
                try {
                    const j = JSON.parse(raw);
                    cwd = j.cwd || j.workspace?.current_dir || j.workspace?.project_dir || cwd;
                }
                catch {
                    /* ignore non-JSON stdin */
                }
            }
        }
        if (!isGitRepo(cwd))
            return 0;
        const repo = getRepoInfo(cwd);
        if (!repo)
            return 0;
        const provider = repoProvider(repo);
        if (!isSupported(provider))
            return 0; // GitLab/unknown; show nothing
        const choice = getRepoChoice(repo.path);
        const label = choice
            ? `${choice.githubUser}${repo.gitUserEmail ? " · " + repo.gitUserEmail : ""}`
            : repo.gitUserEmail || "unconfigured";
        process.stdout.write(`[${provider} account: ${label}]`);
    }
    catch {
        /* statusline stays silent on error */
    }
    return 0;
}
function readStdin(timeoutMs) {
    return new Promise((resolve) => {
        let data = "";
        const timer = setTimeout(() => resolve(data), timeoutMs);
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => {
            clearTimeout(timer);
            resolve(data);
        });
        process.stdin.on("error", () => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}
/**
 * Hook entrypoint used by PreToolUse on Bash. Reads the hook JSON on stdin,
 * and if the command targets `gh`/`git push`, ensures the configured account
 * is active. Prints guidance to stderr and exits 2 to block when it cannot.
 */
async function cmdHookPreBash() {
    const raw = await readStdin(500);
    let command = "";
    try {
        const j = JSON.parse(raw);
        command = j.tool_input?.command ?? "";
    }
    catch {
        return 0; // can't parse → don't block
    }
    const cwd = process.cwd();
    if (!isGitRepo(cwd))
        return 0;
    const intent = classifyCommand(command);
    if (!isIdentitySensitive(intent))
        return 0;
    const bootstrap = getRepoInfo(cwd);
    if (!isSupported(repoProvider(bootstrap)))
        return 0; // GitHub-only; no-op elsewhere
    const choice = getRepoChoice(bootstrap.path);
    if (!choice)
        return 0; // nothing configured → stay out of the way
    const policy = loadPolicy(bootstrap.path);
    // --- commit email enforcement -----------------------------------------
    if (intent.touchesCommit) {
        const email = bootstrap.gitUserEmail ?? "";
        const expectDomain = policy?.requireGitEmailDomain;
        const domain = email.includes("@") ? email.split("@").pop() : "";
        if (expectDomain && domain !== expectDomain) {
            process.stderr.write(`guise: refusing commit — git email "${email || "(unset)"}" is not @${expectDomain}. ` +
                `Run: guise git-sync\n`);
            return 2;
        }
        if (choice.gitUserEmail && email && email !== choice.gitUserEmail) {
            process.stderr.write(`guise: git email "${email}" differs from the chosen account's "${choice.gitUserEmail}". ` +
                `Run: guise git-sync\n`);
            return 2;
        }
    }
    // --- Bitbucket: ensure the repo-local SSH key is pinned before push ----
    if (usesSshModel(repoProvider(bootstrap))) {
        if (!intent.touchesPush)
            return 0;
        if (policy?.enforceBeforePush === false)
            return 0;
        if (!choice.sshKey)
            return 0; // relying on the user's global SSH config
        if (!existsSync(expandTilde(choice.sshKey))) {
            process.stderr.write(`guise: configured SSH key "${choice.sshKey}" is missing. Run: guise set --ssh-key <path>\n`);
            return 2;
        }
        if (bootstrap.gitSshCommand !== sshCommandFor(choice.sshKey)) {
            setLocalSshKey(bootstrap.path, choice.sshKey);
            process.stderr.write(`guise: pinned SSH key ${choice.sshKey} before push.\n`);
        }
        return 0;
    }
    // --- account activation before gh / push ------------------------------
    const wantsRemoteAuth = intent.touchesGh || intent.touchesPush;
    if (!wantsRemoteAuth)
        return 0;
    if (intent.touchesGh && policy?.enforceBeforeGhCommands === false)
        return 0;
    if (intent.touchesPush && policy?.enforceBeforePush === false)
        return 0;
    if (!isGhInstalled())
        return 0;
    const accounts = listGhAccounts();
    const active = getActiveGhAccount(accounts, choice.host);
    if (active && active.user === choice.githubUser)
        return 0; // already correct
    const target = findGhAccount(accounts, choice.host, choice.githubUser);
    if (!target) {
        process.stderr.write(`guise: account "${choice.githubUser}" for this repo is not authenticated. ` +
            `Run: gh auth login --hostname ${choice.host}\n`);
        return 2; // block
    }
    if (ghSwitch(choice.host, choice.githubUser)) {
        process.stderr.write(`guise: switched gh to ${choice.githubUser} before command.\n`);
        return 0;
    }
    process.stderr.write(`guise: could not switch to ${choice.githubUser}; aborting.\n`);
    return 2;
}
/** SessionStart hook: print a one-line status note (non-blocking). */
// SessionStart hook. Always greets in a git repo so guise announces itself in
// any repo — even a brand-new one with no remote yet — and never stays silent
// the way it used to when nothing was configured.
function cmdHookSession() {
    const cwd = process.cwd();
    if (!isGitRepo(cwd))
        return 0;
    const repo = getRepoInfo(cwd);
    if (!repo)
        return 0;
    const provider = repoProvider(repo);
    // Where this repo is, for the banner: owner/repo when a remote exists,
    // otherwise the working-tree folder name.
    const where = repo.remote
        ? `${repo.remote.owner}/${repo.remote.repo}`
        : basename(repo.path);
    // Unmanaged remote (unknown host). Greet once so guise is visibly active,
    // but make clear it won't manage this repo.
    if (!isSupported(provider)) {
        process.stdout.write(`guise: active — ${where} is on ${providerLabel(provider)}, which guise doesn't manage (GitHub, Bitbucket, GitLab only).\n`);
        return 0;
    }
    const choice = getRepoChoice(repo.path);
    // Not configured yet — the onboarding banner, including brand-new repos
    // that have no remote at all.
    if (!choice) {
        const note = repo.remote
            ? `no ${providerLabel(provider)} account chosen for ${where}`
            : `new repo "${where}" — no remote yet`;
        process.stdout.write(`guise: active — ${note}. Run /guise:init to set the account.\n`);
        return 0;
    }
    // SSH-model providers (Bitbucket / GitLab over SSH).
    if (usesSshModel(provider)) {
        if (choice.sshKey && repo.gitSshCommand !== sshCommandFor(choice.sshKey)) {
            process.stdout.write(`guise: ${where} expects SSH key ${choice.sshKey} (${choice.githubUser}). Run /guise:use to pin it.\n`);
        }
        else {
            process.stdout.write(`guise: active — ${choice.githubUser} pinned for ${where}.\n`);
        }
        return 0;
    }
    // gh-model providers (GitHub).
    if (!isGhInstalled()) {
        process.stdout.write(`guise: active — ${choice.githubUser} chosen for ${where} (gh CLI not found).\n`);
        return 0;
    }
    const accounts = listGhAccounts();
    const active = getActiveGhAccount(accounts, choice.host);
    if (!active || active.user !== choice.githubUser) {
        process.stdout.write(`guise: ${where} expects "${choice.githubUser}". Run /guise:use to activate it.\n`);
    }
    else {
        process.stdout.write(`guise: active — ${choice.githubUser} ✓ for ${where}.\n`);
    }
    return 0;
}
function help() {
    out(`guise ${VERSION} — pick the right GitHub, Bitbucket or GitLab account per repository

Usage: guise <command>

Commands:
  init        Auto-detect + save the account (prompts only when ambiguous)
              flags: --user <name> --email <e> --ssh-key <path> --auto --yes --force
  set         Non-interactive: guise set (--user <n> | --profile <n>) [--email <e>] [--ssh-key <p>]
  profile     Named identity templates: profile set <n> --user <u> [...] | profile list | profile rm <n>
  status      Show repo, configured account, active account, git id, checks
  choose      Change the chosen account for this repo
  use         Activate the configured account (GitHub: gh auth switch · Bitbucket/GitLab: pin SSH key)
  validate    Run all checks; non-zero exit on error
  git-sync    Apply git user.name/email + SSH key from the saved choice (--yes to skip prompt)
  install-hook    Install a git pre-push hook that enforces the account in every terminal
  uninstall-hook  Remove the guise pre-push hook
  reset       Remove the local choice for this repo
  statusline  Print '[github account: ...]' for Claude Code statusLine
  --version   Print version

Internal (used by Claude Code hooks):
  hook-pre-bash   Ensure the right account before gh / git push
  hook-session    One-line account note at session start`);
}
async function main() {
    const cmd = process.argv[2];
    let code = 0;
    switch (cmd) {
        case "init":
            code = await cmdInit();
            break;
        case "set":
            code = cmdSet();
            break;
        case "profile":
            code = cmdProfile();
            break;
        case "status":
            code = cmdStatus();
            break;
        case "choose":
            code = await cmdChoose();
            break;
        case "use":
            code = await cmdUse();
            break;
        case "validate":
            code = cmdValidate();
            break;
        case "git-sync":
            code = await cmdGitSync();
            break;
        case "reset":
            code = cmdReset();
            break;
        case "install-hook":
            code = cmdInstallHook();
            break;
        case "uninstall-hook":
            code = cmdUninstallHook();
            break;
        case "statusline":
            code = await cmdStatusline();
            break;
        case "hook-pre-bash":
            code = await cmdHookPreBash();
            break;
        case "hook-session":
            code = cmdHookSession();
            break;
        case "--version":
        case "-v":
            out(VERSION);
            break;
        case "help":
        case "--help":
        case "-h":
        case undefined:
            help();
            break;
        default:
            out(red(`Unknown command: ${cmd}`));
            help();
            code = 1;
    }
    process.exit(code);
}
main();
