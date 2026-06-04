/**
 * Shared types for guise.
 * No secrets are ever stored in any of these structures.
 */

/** Git hosting provider. */
export type Provider = "github" | "gitlab" | "bitbucket" | "unknown";

/** Parsed components of a git remote URL. */
export interface RemoteInfo {
  /** Real or alias host as written in the remote (e.g. "github.com", "github-work"). */
  rawHost: string;
  /** Host after alias resolution (e.g. "github.com"). */
  host: string;
  owner: string;
  repo: string;
  /** Detected provider from the host. */
  provider: Provider;
}

/** Information about the repository the CLI is currently running in. */
export interface RepoInfo {
  /** Absolute path to the repo root. */
  path: string;
  remoteUrl: string | null;
  remote: RemoteInfo | null;
  branch: string | null;
  gitUserName: string | null;
  gitUserEmail: string | null;
  /** Repo-local `core.sshCommand`, if pinned (used by the Bitbucket SSH model). */
  gitSshCommand: string | null;
}

/** A single account known to a provider CLI (gh, glab, ...). */
export interface GhAccount {
  host: string;
  user: string;
  active: boolean;
  protocol: string | null;
  /** True only when the CLI reports the token is valid; never the token itself. */
  tokenValid: boolean | null;
  scopes: string[] | null;
  /** Provider this account belongs to. Defaults to "github". */
  provider?: Provider;
}

/** Outcome of automatic account resolution for a repo. */
export interface AutoResolution {
  /** The single account we are confident about, or null if ambiguous/none. */
  account: GhAccount | null;
  /** Why it was (or was not) chosen — surfaced to the user. */
  reason: string;
  /** When ambiguous, the accounts the user must choose between. */
  candidates: GhAccount[];
}

/** The locally-saved (never committed) account choice for one repo. */
export interface RepoChoice {
  host: string;
  owner: string;
  repo: string;
  /** Account username on the host (GitHub login, or Bitbucket username). */
  githubUser: string;
  gitUserName: string | null;
  gitUserEmail: string | null;
  /** Provider for this repo. Defaults to "github" for older configs. */
  provider?: Provider;
  /** Optional path to an SSH private key applied via local core.sshCommand. */
  sshKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A named, reusable identity template. Applying a profile just fills a repo's
 * RepoChoice — it is a convenience, NOT a separate resolution layer.
 */
export interface ProfileDef {
  githubUser: string;
  host?: string;
  provider?: Provider;
  gitUserName?: string | null;
  gitUserEmail?: string | null;
  sshKey?: string | null;
}

/** Root shape of the local config file. */
export interface LocalConfig {
  /** Optional map of SSH host aliases to their real GitHub host. */
  hostAliases?: Record<string, string>;
  /** Optional named identity templates. */
  profiles?: Record<string, ProfileDef>;
  repos: Record<string, RepoChoice>;
}

/** Committable, credential-free project policy. */
export interface Policy {
  githubHost?: string;
  expectedOwner?: string;
  allowedUsers?: string[];
  requireGitEmailDomain?: string;
  enforceBeforeGhCommands?: boolean;
  enforceBeforePush?: boolean;
  hostAliases?: Record<string, string>;
}

/** Result of a single validation rule. */
export interface ValidationItem {
  id: string;
  ok: boolean;
  level: "error" | "warning" | "info";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  items: ValidationItem[];
}
