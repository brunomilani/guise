import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/** Default location of the committable, credential-free policy file. */
export function policyPath(repoRoot) {
    return join(repoRoot, ".claude", "github-account-policy.json");
}
/** Load the project policy if present. Returns null when absent or invalid. */
export function loadPolicy(repoRoot) {
    const path = policyPath(repoRoot);
    if (!existsSync(path))
        return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return null;
    }
}
