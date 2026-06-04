import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Expand a leading `~` (or `~/`) to the user's home directory. */
export function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Minimal `~/.ssh/config` parser: return the IdentityFile configured for an
 * exact host. We only need exact-host matches (e.g. "bitbucket.org" or an
 * SSH alias like "bitbucket-work"), so wildcard patterns ("Host *") are
 * intentionally ignored — they never carry a per-account key worth pinning.
 *
 * Pure over the config text so it is unit-testable without touching disk.
 * Returns null when no matching block declares an IdentityFile.
 */
export function identityFileForHost(config: string, host: string): string | null {
  if (!config || !host) return null;
  const target = host.toLowerCase();

  let inMatchingBlock = false;
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const hostMatch = /^Host\s+(.+)$/i.exec(line);
    if (hostMatch) {
      const patterns = hostMatch[1].split(/\s+/).map((p) => p.toLowerCase());
      // Exact match only; skip wildcard-only blocks.
      inMatchingBlock = patterns.some((p) => p === target);
      continue;
    }

    if (inMatchingBlock) {
      const idMatch = /^IdentityFile\s+(.+)$/i.exec(line);
      if (idMatch) {
        // Strip optional surrounding quotes.
        return idMatch[1].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  return null;
}

/** Default ssh config path; overridable for tests. */
export function sshConfigPath(): string {
  return join(homedir(), ".ssh", "config");
}

/**
 * Read `~/.ssh/config` and return the IdentityFile pinned for `host`,
 * tilde-expanded. Returns null when the file is absent or has no match.
 */
export function detectSshKeyForHost(host: string, configPath = sshConfigPath()): string | null {
  if (!existsSync(configPath)) return null;
  try {
    const found = identityFileForHost(readFileSync(configPath, "utf8"), host);
    return found ? found : null;
  } catch {
    return null;
  }
}
