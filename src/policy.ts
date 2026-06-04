import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Policy } from "./types.js";

/** Default location of the committable, credential-free policy file. */
export function policyPath(repoRoot: string): string {
  return join(repoRoot, ".claude", "github-account-policy.json");
}

/** Load the project policy if present. Returns null when absent or invalid. */
export function loadPolicy(repoRoot: string): Policy | null {
  const path = policyPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Policy;
  } catch {
    return null;
  }
}
