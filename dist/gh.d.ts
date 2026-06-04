import type { GhAccount } from "./types.js";
/** True when the `gh` binary is available on PATH. */
export declare function isGhInstalled(): boolean;
/**
 * Parse the human-readable output of `gh auth status`.
 *
 * `gh` historically prints blocks like:
 *
 *   github.com
 *     ✓ Logged in to github.com account john-work (keyring)
 *     - Active account: true
 *     - Git operations protocol: ssh
 *     - Token: gho_************************************
 *     - Token scopes: 'gist', 'read:org', 'repo'
 *
 * Newer versions vary slightly ("Logged in to github.com as USER" without
 * "account"), so we accept both. We never capture or store the token value.
 */
export declare function parseGhAuthStatus(text: string): GhAccount[];
/** Read all accounts known to `gh`. Returns [] if gh missing or no accounts. */
export declare function listGhAccounts(): GhAccount[];
export declare function findGhAccount(accounts: GhAccount[], host: string, user: string): GhAccount | undefined;
export declare function getActiveGhAccount(accounts: GhAccount[], host?: string): GhAccount | undefined;
/**
 * Switch the active gh account. Never logs out, never deletes credentials.
 * Returns true on success.
 */
export declare function ghSwitch(host: string, user: string): boolean;
