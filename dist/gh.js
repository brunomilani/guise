import { execFileSync } from "node:child_process";
/** True when the `gh` binary is available on PATH. */
export function isGhInstalled() {
    try {
        execFileSync("gh", ["--version"], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Parse the human-readable output of `gh auth status`.
 *
 * `gh` historically prints blocks like:
 *
 *   github.com
 *     ✓ Logged in to github.com account john-work (keyring)
 *     - Active account: true
 *     - Git operations protocol: ssh
 *     - Token: gho_************************************
 *     - Token scopes: 'gist', 'read:org', 'repo'
 *
 * Newer versions vary slightly ("Logged in to github.com as USER" without
 * "account"), so we accept both. We never capture or store the token value.
 */
export function parseGhAuthStatus(text) {
    const accounts = [];
    if (!text)
        return accounts;
    const lines = text.split(/\r?\n/);
    let currentHost = null;
    let current = null;
    const flush = () => {
        if (current)
            accounts.push(current);
        current = null;
    };
    for (const raw of lines) {
        const line = raw.replace(/\s+$/, "");
        if (!line.trim())
            continue;
        // A non-indented line that looks like a hostname starts a host block.
        if (!/^\s/.test(raw) && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(line.trim())) {
            currentHost = line.trim();
            continue;
        }
        // "Logged in to HOST account USER" or "Logged in to HOST as USER".
        const login = /Logged in to (\S+)\s+(?:account|as)\s+([^\s()]+)/i.exec(line);
        if (login) {
            flush();
            const host = login[1];
            if (/^[a-zA-Z0-9.-]+$/.test(host))
                currentHost = host;
            current = {
                host: currentHost ?? host,
                user: login[2],
                // Older gh marks the active account with "(active)" on this line.
                active: /\(active\)/i.test(line),
                protocol: null,
                tokenValid: /✓|Logged in/i.test(line) ? true : null,
                scopes: null,
                provider: "github",
            };
            continue;
        }
        if (!current)
            continue;
        const activeMatch = /Active account:\s*(true|false)/i.exec(line);
        if (activeMatch) {
            current.active = activeMatch[1].toLowerCase() === "true";
            continue;
        }
        const protoMatch = /Git operations protocol:\s*(\S+)/i.exec(line);
        if (protoMatch) {
            current.protocol = protoMatch[1];
            continue;
        }
        const scopeMatch = /Token scopes:\s*(.+)/i.exec(line);
        if (scopeMatch) {
            current.scopes = scopeMatch[1]
                .split(",")
                .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
                .filter(Boolean);
            continue;
        }
        if (/Token:.*invalid/i.test(line) || /could not authenticate/i.test(line)) {
            current.tokenValid = false;
        }
    }
    flush();
    return accounts;
}
/** Read all accounts known to `gh`. Returns [] if gh missing or no accounts. */
export function listGhAccounts() {
    try {
        // gh writes auth status to stderr historically; merge both streams.
        const out = execFileSync("gh", ["auth", "status"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return parseGhAuthStatus(out);
    }
    catch (err) {
        // Non-zero exit still carries useful text on stdout/stderr.
        const e = err;
        const text = `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
        return parseGhAuthStatus(text);
    }
}
export function findGhAccount(accounts, host, user) {
    return accounts.find((a) => a.host === host && a.user === user);
}
export function getActiveGhAccount(accounts, host) {
    return accounts.find((a) => a.active && (!host || a.host === host));
}
/**
 * Switch the active gh account. Never logs out, never deletes credentials.
 * Returns true on success.
 */
export function ghSwitch(host, user) {
    try {
        execFileSync("gh", ["auth", "switch", "--hostname", host, "--user", user], {
            stdio: "ignore",
        });
        return true;
    }
    catch {
        return false;
    }
}
