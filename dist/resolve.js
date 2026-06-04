/**
 * Automatically resolve which account a repo should use — the feature that
 * removes the interactive prompt in the common case.
 *
 * Strategy (in order):
 *   1. Restrict to accounts on the repo's host.
 *   2. Exact username match to the repo owner/org (case-insensitive) → confident.
 *   3. Exactly one account on the host → confident.
 *   4. Otherwise ambiguous → return candidates for a prompt.
 *
 * Pure function so it is fully unit-tested without touching gh/git.
 */
export function autoResolveAccount(remote, accounts) {
    const host = remote?.host;
    // Strict host match — never offer a github account for a bitbucket repo, etc.
    const pool = host ? accounts.filter((a) => a.host === host) : accounts;
    if (pool.length === 0) {
        return {
            account: null,
            reason: host ? `no authenticated accounts on ${host}` : "no authenticated accounts found",
            candidates: [],
        };
    }
    if (remote) {
        const owner = remote.owner.toLowerCase();
        const exact = pool.filter((a) => a.user.toLowerCase() === owner);
        if (exact.length === 1) {
            return {
                account: exact[0],
                reason: `username "${exact[0].user}" matches repo owner "${remote.owner}"`,
                candidates: [],
            };
        }
    }
    if (pool.length === 1) {
        return {
            account: pool[0],
            reason: `only one account available${host ? ` on ${host}` : ""}`,
            candidates: [],
        };
    }
    return {
        account: null,
        reason: "multiple accounts could apply; choose one",
        candidates: pool,
    };
}
/** Human label for a provider. */
export function providerLabel(p) {
    switch (p) {
        case "github":
            return "GitHub";
        case "gitlab":
            return "GitLab";
        case "bitbucket":
            return "Bitbucket";
        default:
            return "unknown";
    }
}
/**
 * Providers guise actively manages. GitHub via the `gh` CLI; Bitbucket and
 * GitLab via the SSH-key + git-identity model (no account CLI is used).
 * Unknown / self-hosted hosts are detected for labeling but left untouched.
 * Single source of truth for "is guise active here".
 */
export function isSupported(p) {
    return hasAccountCli(p) || usesSshModel(p);
}
/**
 * True only for providers with a multi-account CLI guise can introspect and
 * switch (currently just GitHub via `gh`).
 */
export function hasAccountCli(p) {
    return p === "github";
}
/**
 * True for providers guise drives with the SSH-key + git-identity model: no
 * account CLI exists, so "activation" is pinning a repo-local SSH key. Covers
 * Bitbucket and GitLab.
 */
export function usesSshModel(p) {
    return p === "bitbucket" || p === "gitlab";
}
