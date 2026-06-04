import type { GhAccount, Policy, RepoChoice, RepoInfo, ValidationResult } from "./types.js";
export interface ValidateInput {
    repo: RepoInfo;
    choice: RepoChoice | undefined;
    accounts: GhAccount[];
    policy: Policy | null;
    /**
     * Whether the configured SSH key file exists on disk. Resolved by the caller
     * (fs lives outside this pure function). null = no key configured / N/A.
     */
    sshKeyExists?: boolean | null;
}
/**
 * Run every validation rule. Pure function over already-collected facts so it
 * can be unit-tested without touching git or gh.
 */
export declare function validate(input: ValidateInput): ValidationResult;
