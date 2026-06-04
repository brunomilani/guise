import type {
  GhAccount,
  Policy,
  RepoChoice,
  RepoInfo,
  ValidationItem,
  ValidationResult,
} from "./types.js";
import { getActiveGhAccount } from "./gh.js";
import { providerLabel, usesSshModel } from "./resolve.js";

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
export function validate(input: ValidateInput): ValidationResult {
  const { repo, choice, accounts, policy, sshKeyExists } = input;
  const items: ValidationItem[] = [];

  const push = (
    id: string,
    ok: boolean,
    level: ValidationItem["level"],
    message: string,
  ) => items.push({ id, ok, level, message });

  // --- Remote sanity ----------------------------------------------------
  if (!repo.remote) {
    push(
      "remote",
      false,
      "warning",
      "origin is missing or is not a recognizable GitHub remote.",
    );
  }

  // --- A choice must exist ---------------------------------------------
  if (!choice) {
    push(
      "choice",
      false,
      "error",
      "No GitHub account configured for this repo. Run: guise init",
    );
    return finalize(items);
  }

  // gh-based account checks only apply to GitHub. Other providers have no
  // first-class multi-account CLI here, so we record the choice and rely on
  // git-identity + policy checks instead of failing.
  const provider = choice.provider ?? repo.remote?.provider ?? "github";
  if (provider === "github") {
    const active = getActiveGhAccount(accounts, choice.host);
    const configured = accounts.find(
      (a) => a.host === choice.host && a.user === choice.githubUser,
    );

    if (!configured) {
      push(
        "gh-auth",
        false,
        "error",
        `Configured account "${choice.githubUser}" is not authenticated on ${choice.host}.\n` +
          `  Run: gh auth login --hostname ${choice.host}`,
      );
    } else if (configured.tokenValid === false) {
      push(
        "gh-token",
        false,
        "error",
        `Token for "${choice.githubUser}" is invalid. Run: gh auth login --hostname ${choice.host}`,
      );
    }

    if (active && active.user !== choice.githubUser) {
      push(
        "gh-active",
        false,
        "error",
        `Active gh account is "${active.user}" but this repo expects "${choice.githubUser}". ` +
          `Run: guise use`,
      );
    } else if (active && active.user === choice.githubUser) {
      push("gh-active", true, "info", `Active gh account matches: ${active.user}`);
    }
  } else if (usesSshModel(provider)) {
    // No account CLI (Bitbucket/GitLab). Authentication is the repo-local SSH
    // key (or the user's global SSH config); validate the key + identity/policy.
    if (choice.sshKey) {
      if (sshKeyExists === false) {
        push(
          "ssh-key",
          false,
          "error",
          `Configured SSH key "${choice.sshKey}" was not found on disk.`,
        );
      } else {
        push("ssh-key", true, "info", `SSH key configured: ${choice.sshKey}`);
      }
    } else {
      push(
        "ssh-key",
        true,
        "info",
        `No repo-specific SSH key; pushes use your global SSH config for ${choice.host}.`,
      );
    }
  } else {
    push(
      "inactive",
      true,
      "info",
      `guise is inactive here — it does not automate ${providerLabel(provider)} remotes.`,
    );
  }

  // --- Owner matches the remote ----------------------------------------
  if (repo.remote && repo.remote.owner !== choice.owner) {
    push(
      "owner",
      false,
      "warning",
      `Remote owner "${repo.remote.owner}" differs from configured owner "${choice.owner}".`,
    );
  }

  // --- Git local email -------------------------------------------------
  if (choice.gitUserEmail && repo.gitUserEmail !== choice.gitUserEmail) {
    push(
      "git-email",
      false,
      "warning",
      `Git local user.email is "${repo.gitUserEmail ?? "(unset)"}" but the chosen account suggests ` +
        `"${choice.gitUserEmail}". Run: guise git-sync`,
    );
  }

  // --- Policy ----------------------------------------------------------
  if (policy) applyPolicy(policy, repo, choice, push);

  return finalize(items);
}

function applyPolicy(
  policy: Policy,
  repo: RepoInfo,
  choice: RepoChoice,
  push: (id: string, ok: boolean, level: ValidationItem["level"], message: string) => void,
): void {
  if (policy.githubHost && choice.host !== policy.githubHost) {
    push(
      "policy-host",
      false,
      "error",
      `Policy requires host "${policy.githubHost}" but configured host is "${choice.host}".`,
    );
  }

  if (policy.expectedOwner && repo.remote && repo.remote.owner !== policy.expectedOwner) {
    push(
      "policy-owner",
      false,
      "error",
      `Policy expects owner "${policy.expectedOwner}" but remote owner is "${repo.remote.owner}".`,
    );
  }

  if (policy.allowedUsers && policy.allowedUsers.length > 0) {
    if (!policy.allowedUsers.includes(choice.githubUser)) {
      push(
        "policy-allowed",
        false,
        "error",
        `Account "${choice.githubUser}" is not in policy allowedUsers: ` +
          policy.allowedUsers.join(", "),
      );
    }
  }

  if (policy.requireGitEmailDomain) {
    const email = repo.gitUserEmail ?? "";
    const domain = email.includes("@") ? email.split("@").pop() : "";
    if (domain !== policy.requireGitEmailDomain) {
      push(
        "policy-email",
        false,
        "error",
        `Policy requires git email domain "@${policy.requireGitEmailDomain}" but local email is ` +
          `"${email || "(unset)"}". Run: guise git-sync`,
      );
    }
  }
}

function finalize(items: ValidationItem[]): ValidationResult {
  const ok = items.every((i) => i.ok || i.level !== "error");
  return { ok, items };
}
