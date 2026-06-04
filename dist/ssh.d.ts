/** Expand a leading `~` (or `~/`) to the user's home directory. */
export declare function expandTilde(p: string): string;
/**
 * Minimal `~/.ssh/config` parser: return the IdentityFile configured for an
 * exact host. We only need exact-host matches (e.g. "bitbucket.org" or an
 * SSH alias like "bitbucket-work"), so wildcard patterns ("Host *") are
 * intentionally ignored — they never carry a per-account key worth pinning.
 *
 * Pure over the config text so it is unit-testable without touching disk.
 * Returns null when no matching block declares an IdentityFile.
 */
export declare function identityFileForHost(config: string, host: string): string | null;
/** Default ssh config path; overridable for tests. */
export declare function sshConfigPath(): string;
/**
 * Read `~/.ssh/config` and return the IdentityFile pinned for `host`,
 * tilde-expanded. Returns null when the file is absent or has no match.
 */
export declare function detectSshKeyForHost(host: string, configPath?: string): string | null;
