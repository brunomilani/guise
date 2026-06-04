import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
/**
 * Local config lives OUTSIDE any repo, under the user's config dir:
 *   $XDG_CONFIG_HOME/guise/config.json
 *   ~/.config/guise/config.json   (fallback)
 *
 * This was chosen over `.claude/settings.local.json` and `.git/...` because it
 * is guaranteed to never be committed (it is not inside the repo at all) and a
 * single file serves every repo on the machine. No tokens are ever written.
 */
export function configPath() {
    const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(base, "guise", "config.json");
}
/** Pre-rename location; read once so existing choices survive the rebrand. */
function legacyConfigPath() {
    const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(base, "claude-octo-switch", "config.json");
}
export function loadConfig() {
    const path = configPath();
    const readFrom = existsSync(path)
        ? path
        : existsSync(legacyConfigPath())
            ? legacyConfigPath()
            : null;
    if (!readFrom)
        return { repos: {} };
    try {
        const parsed = JSON.parse(readFileSync(readFrom, "utf8"));
        if (!parsed.repos)
            parsed.repos = {};
        return parsed;
    }
    catch {
        // Corrupt config should not crash the CLI; start fresh in memory.
        return { repos: {} };
    }
}
export function saveConfig(config) {
    const path = configPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
export function getRepoChoice(repoPath) {
    return loadConfig().repos[repoPath];
}
export function setRepoChoice(repoPath, choice, now) {
    const config = loadConfig();
    const existing = config.repos[repoPath];
    const record = {
        ...choice,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    };
    config.repos[repoPath] = record;
    saveConfig(config);
    return record;
}
export function removeRepoChoice(repoPath) {
    const config = loadConfig();
    if (!config.repos[repoPath])
        return false;
    delete config.repos[repoPath];
    saveConfig(config);
    return true;
}
// --- profiles (named identity templates) --------------------------------
export function getProfile(name) {
    return loadConfig().profiles?.[name];
}
export function listProfiles() {
    return loadConfig().profiles ?? {};
}
export function setProfile(name, def) {
    const config = loadConfig();
    config.profiles = { ...(config.profiles ?? {}), [name]: def };
    saveConfig(config);
}
export function removeProfile(name) {
    const config = loadConfig();
    if (!config.profiles?.[name])
        return false;
    delete config.profiles[name];
    saveConfig(config);
    return true;
}
/** Merge host aliases from policy and local config (policy wins on conflict). */
export function resolveHostAliases(policyAliases) {
    const local = loadConfig().hostAliases ?? {};
    return { ...local, ...(policyAliases ?? {}) };
}
/** Delete the entire local config file (used by tests / `reset --all`). */
export function purgeConfig() {
    const path = configPath();
    if (existsSync(path))
        rmSync(path);
}
