import type { LocalConfig, ProfileDef, RepoChoice } from "./types.js";
/**
 * Local config lives OUTSIDE any repo, under the user's config dir:
 *   $XDG_CONFIG_HOME/guise/config.json
 *   ~/.config/guise/config.json   (fallback)
 *
 * This was chosen over `.claude/settings.local.json` and `.git/...` because it
 * is guaranteed to never be committed (it is not inside the repo at all) and a
 * single file serves every repo on the machine. No tokens are ever written.
 */
export declare function configPath(): string;
export declare function loadConfig(): LocalConfig;
export declare function saveConfig(config: LocalConfig): void;
export declare function getRepoChoice(repoPath: string): RepoChoice | undefined;
export declare function setRepoChoice(repoPath: string, choice: Omit<RepoChoice, "createdAt" | "updatedAt">, now: string): RepoChoice;
export declare function removeRepoChoice(repoPath: string): boolean;
export declare function getProfile(name: string): ProfileDef | undefined;
export declare function listProfiles(): Record<string, ProfileDef>;
export declare function setProfile(name: string, def: ProfileDef): void;
export declare function removeProfile(name: string): boolean;
/** Merge host aliases from policy and local config (policy wins on conflict). */
export declare function resolveHostAliases(policyAliases?: Record<string, string>): Record<string, string>;
/** Delete the entire local config file (used by tests / `reset --all`). */
export declare function purgeConfig(): void;
