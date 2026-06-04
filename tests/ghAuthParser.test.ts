import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGhAuthStatus, getActiveGhAccount, findGhAccount } from "../src/gh.js";
import { validate } from "../src/validate.js";
import type { GhAccount, RepoInfo, RepoChoice, Policy } from "../src/types.js";

const SAMPLE = `github.com
  ✓ Logged in to github.com account john-work (keyring)
  - Active account: true
  - Git operations protocol: ssh
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo'
  ✓ Logged in to github.com account john-personal (keyring)
  - Active account: false
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'repo'`;

test("parses two accounts on one host", () => {
  const accts = parseGhAuthStatus(SAMPLE);
  assert.equal(accts.length, 2);
  assert.deepEqual(accts.map((a) => a.user), ["john-work", "john-personal"]);
  assert.equal(accts[0].host, "github.com");
  assert.equal(accts[0].active, true);
  assert.equal(accts[1].active, false);
  assert.equal(accts[0].protocol, "ssh");
  assert.deepEqual(accts[0].scopes, ["gist", "read:org", "repo"]);
});

test("getActiveGhAccount finds the active one", () => {
  const accts = parseGhAuthStatus(SAMPLE);
  assert.equal(getActiveGhAccount(accts)?.user, "john-work");
});

test("parses newer 'as USER' phrasing", () => {
  const text = `github.com
  ✓ Logged in to github.com as octocat (oauth_token)
  - Active account: true`;
  const accts = parseGhAuthStatus(text);
  assert.equal(accts.length, 1);
  assert.equal(accts[0].user, "octocat");
  assert.equal(accts[0].host, "github.com");
});

test("returns empty array for empty input", () => {
  assert.deepEqual(parseGhAuthStatus(""), []);
});

function repo(overrides: Partial<RepoInfo> = {}): RepoInfo {
  return {
    path: "/abs/repo",
    remoteUrl: "git@github.com:acme/web-app.git",
    remote: { rawHost: "github.com", host: "github.com", owner: "acme", repo: "web-app", provider: "github" },
    branch: "main",
    gitUserName: "John",
    gitUserEmail: "john@domain.com",
    ...overrides,
  };
}

function choice(overrides: Partial<RepoChoice> = {}): RepoChoice {
  return {
    host: "github.com",
    owner: "acme",
    repo: "web-app",
    githubUser: "john-work",
    gitUserName: "John",
    gitUserEmail: "john@domain.com",
    createdAt: "2026-06-04T00:00:00.000Z",
    updatedAt: "2026-06-04T00:00:00.000Z",
    ...overrides,
  };
}

const accounts = parseGhAuthStatus(SAMPLE);

test("validate passes when everything matches", () => {
  const r = validate({ repo: repo(), choice: choice(), accounts, policy: null });
  assert.equal(r.ok, true);
});

test("validate errors when no local choice exists", () => {
  const r = validate({ repo: repo(), choice: undefined, accounts, policy: null });
  assert.equal(r.ok, false);
  assert.ok(r.items.some((i) => i.id === "choice"));
});

test("validate errors when active gh account differs", () => {
  const r = validate({
    repo: repo(),
    choice: choice({ githubUser: "john-personal" }),
    accounts,
    policy: null,
  });
  // active is john-work but configured is john-personal
  assert.equal(r.ok, false);
  assert.ok(r.items.some((i) => i.id === "gh-active" && !i.ok));
});

test("validate warns on git email mismatch", () => {
  const r = validate({
    repo: repo({ gitUserEmail: "john@personal.com" }),
    choice: choice(),
    accounts,
    policy: null,
  });
  assert.ok(r.items.some((i) => i.id === "git-email" && !i.ok));
});

test("policy allowedUsers blocks disallowed account", () => {
  const policy: Policy = { allowedUsers: ["dev1", "dev2"] };
  const r = validate({ repo: repo(), choice: choice(), accounts, policy });
  assert.equal(r.ok, false);
  assert.ok(r.items.some((i) => i.id === "policy-allowed" && !i.ok));
});

test("policy expectedOwner mismatch fails", () => {
  const policy: Policy = { expectedOwner: "other-org" };
  const r = validate({ repo: repo(), choice: choice(), accounts, policy });
  assert.ok(r.items.some((i) => i.id === "policy-owner" && !i.ok));
});

test("policy requireGitEmailDomain mismatch fails", () => {
  const policy: Policy = { requireGitEmailDomain: "domain.com" };
  const r = validate({
    repo: repo({ gitUserEmail: "john@personal.com" }),
    choice: choice({ gitUserEmail: "john@personal.com" }),
    accounts,
    policy,
  });
  assert.ok(r.items.some((i) => i.id === "policy-email" && !i.ok));
});

test("bitbucket repo does not fail on gh account checks", () => {
  const bbRemote = repo({
    remoteUrl: "git@bitbucket.org:acme-org/site.git",
    remote: { rawHost: "bitbucket.org", host: "bitbucket.org", owner: "acme-org", repo: "site", provider: "bitbucket" },
    gitUserEmail: "jane@domain.com",
  });
  const bbChoice = choice({
    host: "bitbucket.org",
    owner: "acme-org",
    provider: "bitbucket",
    githubUser: "jane-work",
    gitUserEmail: "jane@domain.com",
  });
  const r = validate({ repo: bbRemote, choice: bbChoice, accounts: [], policy: null });
  assert.equal(r.ok, true);
  // Bitbucket is now actively managed via the SSH model, not "inactive".
  assert.ok(r.items.some((i) => i.id === "ssh-key"));
  assert.ok(!r.items.some((i) => i.id === "gh-auth"));
});

test("bitbucket flags a missing configured SSH key", () => {
  const bbRemote = repo({
    remoteUrl: "git@bitbucket.org:acme-org/site.git",
    remote: { rawHost: "bitbucket.org", host: "bitbucket.org", owner: "acme-org", repo: "site", provider: "bitbucket" },
  });
  const bbChoice = choice({
    host: "bitbucket.org",
    owner: "acme-org",
    provider: "bitbucket",
    githubUser: "jane-work",
    sshKey: "~/.ssh/missing_key",
  });
  const r = validate({ repo: bbRemote, choice: bbChoice, accounts: [], policy: null, sshKeyExists: false });
  assert.equal(r.ok, false);
  assert.ok(r.items.some((i) => i.id === "ssh-key" && !i.ok));
});

test("gitlab uses the SSH model too (not gh checks, not inactive)", () => {
  const glRemote = repo({
    remoteUrl: "git@gitlab.com:acme/site.git",
    remote: { rawHost: "gitlab.com", host: "gitlab.com", owner: "acme", repo: "site", provider: "gitlab" },
  });
  const glChoice = choice({
    host: "gitlab.com",
    owner: "acme",
    provider: "gitlab",
    githubUser: "jane",
    sshKey: "~/.ssh/id_gitlab",
  });
  const r = validate({ repo: glRemote, choice: glChoice, accounts: [], policy: null, sshKeyExists: true });
  assert.equal(r.ok, true);
  assert.ok(r.items.some((i) => i.id === "ssh-key" && i.ok));
  assert.ok(!r.items.some((i) => i.id === "gh-auth" || i.id === "inactive"));
});

test("findGhAccount locates a specific account", () => {
  assert.equal(findGhAccount(accounts, "github.com", "john-personal")?.user, "john-personal");
  assert.equal(findGhAccount(accounts, "github.com", "ghost"), undefined);
});
