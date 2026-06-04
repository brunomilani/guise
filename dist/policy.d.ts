import type { Policy } from "./types.js";
/** Default location of the committable, credential-free policy file. */
export declare function policyPath(repoRoot: string): string;
/** Load the project policy if present. Returns null when absent or invalid. */
export declare function loadPolicy(repoRoot: string): Policy | null;
