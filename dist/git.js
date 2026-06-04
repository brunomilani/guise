import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
/** Map a (resolved) host to a provider. */
export function detectProvider(host) {
    const h = host.toLowerCase();
    if (h.includes("github"))
        return "github";
    if (h.includes("gitlab"))
        return "gitlab";
    if (h.includes("bitbucket"))
        return "bitbucket";
    return "unknown";
}
/**
 * Parse a GitHub remote URL into { host, owner, repo }.
 *
 * Supports:
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo.git
 *   git@github-work:owner/repo.git        (SSH host alias)
 *   ssh://git@github.com/owner/repo.git
 *   git://github.com/owner/repo.git
 *
 * `hostAliases` maps an SSH alias (e.g. "github-work") to a real host.
 * Returns null when the URL is not a recognizable git remote.
 */
export function parseRemote(url, hostAliases = {}) {
    if (!url)
        return null;
    const trimmed = url.trim();
    let rawHost = null;
    let path = null;
    // scp-like syntax: [user@]host:owner/repo(.git)
    // Must not contain "://". The part before the first ":" is [user@]host.
    const scpMatch = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(trimmed);
    if (scpMatch && !trimmed.includes("://")) {
        rawHost = scpMatch[1];
        path = scpMatch[2];
    }
    else {
        // URL syntax: scheme://[user@]host[:port]/owner/repo(.git)
        const urlMatch = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(trimmed);
        if (urlMatch) {
            rawHost = urlMatch[1];
            path = urlMatch[2];
        }
    }
    if (!rawHost || !path)
        return null;
    // Normalize the path: strip leading slash, trailing ".git" and trailing slash.
    let cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
    cleanPath = cleanPath.replace(/\.git$/i, "");
    const segments = cleanPath.split("/").filter(Boolean);
    if (segments.length < 2)
        return null;
    // owner is the first segment; repo is the last (handles owner/sub/repo edge cases).
    const owner = segments[0];
    const repo = segments[segments.length - 1];
    if (!owner || !repo)
        return null;
    const host = hostAliases[rawHost] ?? rawHost;
    return { rawHost, host, owner, repo, provider: detectProvider(host) };
}
/** The `core.sshCommand` value guise pins for a given key. */
export function sshCommandFor(keyPath) {
    // IdentitiesOnly prevents the agent from offering other keys.
    return `ssh -i ${keyPath} -o IdentitiesOnly=yes`;
}
/** Set or clear the repo-local SSH command for a specific key. */
export function setLocalSshKey(root, keyPath) {
    if (keyPath) {
        execFileSync("git", ["config", "--local", "core.sshCommand", sshCommandFor(keyPath)], {
            cwd: root,
        });
    }
    else {
        // Best-effort unset; ignore "not found" exit code.
        try {
            execFileSync("git", ["config", "--local", "--unset", "core.sshCommand"], { cwd: root });
        }
        catch {
            /* nothing to unset */
        }
    }
}
/** Run a git command inside `cwd`, returning trimmed stdout or null on failure. */
function git(args, cwd) {
    try {
        const out = execFileSync("git", args, {
            cwd,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const trimmed = out.trim();
        return trimmed.length ? trimmed : null;
    }
    catch {
        return null;
    }
}
/** True when `cwd` is inside a git work tree. */
export function isGitRepo(cwd) {
    return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}
/** Gather repository facts. Returns null when not in a git repo. */
export function getRepoInfo(cwd, hostAliases = {}) {
    const root = git(["rev-parse", "--show-toplevel"], cwd);
    if (!root)
        return null;
    const remoteUrl = git(["remote", "get-url", "origin"], root);
    const remote = remoteUrl ? parseRemote(remoteUrl, hostAliases) : null;
    return {
        path: root,
        remoteUrl,
        remote,
        branch: git(["branch", "--show-current"], root),
        gitUserName: git(["config", "--local", "user.name"], root),
        gitUserEmail: git(["config", "--local", "user.email"], root),
        gitSshCommand: git(["config", "--local", "core.sshCommand"], root),
    };
}
/** Set repo-local git identity. Never touches global config. */
export function setLocalIdentity(root, name, email) {
    if (name)
        execFileSync("git", ["config", "--local", "user.name", name], { cwd: root });
    if (email)
        execFileSync("git", ["config", "--local", "user.email", email], { cwd: root });
}
// --- git pre-push hook (terminal-agnostic enforcement) -------------------
//
// The Claude Code PreToolUse hook only covers commands run inside a Claude
// session. A developer pushing from their own shell — after a `gh auth switch`
// in another terminal — bypasses guise entirely. A native git `pre-push` hook
// closes that gap: git runs it in EVERY terminal, right before the transfer,
// so we can re-activate the repo's account (gh switch / SSH pin) and abort the
// push when the environment can't be made correct.
/** Marker that identifies a pre-push hook we wrote (vs. a user's own). */
const HOOK_MARKER = "# guise-managed pre-push hook";
/**
 * Build the pre-push hook body. A global `guise` on PATH wins; otherwise we
 * fall back to the absolute CLI path captured at install time, so the hook
 * works in a plain developer shell even when guise isn't installed globally.
 * With neither available it stays silent and succeeds — never blocks a push by
 * accident.
 */
function prePushHook(nodeExec, cliPath) {
    return `#!/usr/bin/env bash
${HOOK_MARKER} — installed by: guise install-hook · remove with: guise uninstall-hook
# Forces this repo's configured account before every push, from any terminal.
set -euo pipefail
if command -v guise >/dev/null 2>&1; then
  GUISE=(guise)
elif [ -x "${nodeExec}" ] && [ -f "${cliPath}" ]; then
  GUISE=("${nodeExec}" "${cliPath}")
else
  exit 0
fi
if ! "\${GUISE[@]}" use 1>&2; then
  echo "guise: could not activate this repo's account — push aborted." >&2
  exit 1
fi
if ! "\${GUISE[@]}" validate 1>&2; then
  echo "guise: validation failed — push aborted. Fix: guise use && guise git-sync" >&2
  exit 1
fi
exit 0
`;
}
/** Resolve the directory git uses for this repo's hooks (honors core.hooksPath). */
export function hooksDir(root) {
    const p = git(["rev-parse", "--git-path", "hooks"], root);
    if (!p)
        return join(root, ".git", "hooks");
    return isAbsolute(p) ? p : join(root, p);
}
/**
 * Write the pre-push hook. Returns "foreign" without touching anything when a
 * non-guise hook already exists, so we never clobber a developer's own hook.
 */
export function installPrePushHook(root, nodeExec, cliPath) {
    const dir = hooksDir(root);
    const path = join(dir, "pre-push");
    const body = prePushHook(nodeExec, cliPath);
    if (existsSync(path)) {
        const current = readFileSync(path, "utf8");
        if (!current.includes(HOOK_MARKER))
            return { status: "foreign", path };
        writeFileSync(path, body);
        chmodSync(path, 0o755);
        return { status: "updated", path };
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, body);
    chmodSync(path, 0o755);
    return { status: "installed", path };
}
/** Remove the pre-push hook only when we own it. */
export function uninstallPrePushHook(root) {
    const path = join(hooksDir(root), "pre-push");
    if (!existsSync(path))
        return "absent";
    if (!readFileSync(path, "utf8").includes(HOOK_MARKER))
        return "foreign";
    unlinkSync(path);
    return "removed";
}
