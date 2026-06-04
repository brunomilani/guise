import type { AutoResolution, GhAccount, Provider, RemoteInfo } from "./types.js";
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
export declare function autoResolveAccount(remote: RemoteInfo | null, accounts: GhAccount[]): AutoResolution;
/** Human label for a provider. */
export declare function providerLabel(p: Provider): string;
/**
 * Providers guise actively manages. GitHub via the `gh` CLI; Bitbucket and
 * GitLab via the SSH-key + git-identity model (no account CLI is used).
 * Unknown / self-hosted hosts are detected for labeling but left untouched.
 * Single source of truth for "is guise active here".
 */
export declare function isSupported(p: Provider): boolean;
/**
 * True only for providers with a multi-account CLI guise can introspect and
 * switch (currently just GitHub via `gh`).
 */
export declare function hasAccountCli(p: Provider): boolean;
/**
 * True for providers guise drives with the SSH-key + git-identity model: no
 * account CLI exists, so "activation" is pinning a repo-local SSH key. Covers
 * Bitbucket and GitLab.
 */
export declare function usesSshModel(p: Provider): boolean;
