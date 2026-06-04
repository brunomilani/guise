import type { Provider, RemoteInfo, RepoInfo } from "./types.js";
/** Map a (resolved) host to a provider. */
export declare function detectProvider(host: string): Provider;
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
export declare function parseRemote(url: string, hostAliases?: Record<string, string>): RemoteInfo | null;
/** The `core.sshCommand` value guise pins for a given key. */
export declare function sshCommandFor(keyPath: string): string;
/** Set or clear the repo-local SSH command for a specific key. */
export declare function setLocalSshKey(root: string, keyPath: string | null): void;
/** True when `cwd` is inside a git work tree. */
export declare function isGitRepo(cwd: string): boolean;
/** Gather repository facts. Returns null when not in a git repo. */
export declare function getRepoInfo(cwd: string, hostAliases?: Record<string, string>): RepoInfo | null;
/** Set repo-local git identity. Never touches global config. */
export declare function setLocalIdentity(root: string, name: string | null, email: string | null): void;
