import { execFileSync } from "node:child_process";
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
