import { test } from "node:test";
import assert from "node:assert/strict";
import { autoResolveAccount, isSupported, hasAccountCli, usesSshModel } from "../src/resolve.js";
import { detectProvider, parseRemote } from "../src/git.js";
import type { GhAccount, RemoteInfo } from "../src/types.js";

function acct(user: string, host = "github.com"): GhAccount {
  return { host, user, active: false, protocol: null, tokenValid: true, scopes: null, provider: "github" };
}
function remote(owner: string, host = "github.com"): RemoteInfo {
  return { rawHost: host, host, owner, repo: "x", provider: detectProvider(host) };
}

test("detectProvider maps known hosts", () => {
  assert.equal(detectProvider("github.com"), "github");
  assert.equal(detectProvider("gitlab.com"), "gitlab");
  assert.equal(detectProvider("bitbucket.org"), "bitbucket");
  assert.equal(detectProvider("git.internal"), "unknown");
});

test("parseRemote sets provider for gitlab and bitbucket", () => {
  assert.equal(parseRemote("git@gitlab.com:org/repo.git")?.provider, "gitlab");
  assert.equal(parseRemote("https://bitbucket.org/org/repo.git")?.provider, "bitbucket");
});

test("provider support: github + bitbucket + gitlab active, others inactive", () => {
  assert.equal(isSupported("github"), true);
  assert.equal(isSupported("bitbucket"), true);
  assert.equal(isSupported("gitlab"), true);
  assert.equal(isSupported("unknown"), false);
});

test("only github has an account CLI; bitbucket/gitlab use the SSH model", () => {
  assert.equal(hasAccountCli("github"), true);
  assert.equal(hasAccountCli("bitbucket"), false);
  assert.equal(usesSshModel("bitbucket"), true);
  assert.equal(usesSshModel("gitlab"), true);
  assert.equal(usesSshModel("github"), false);
});

test("auto-resolves by exact owner match", () => {
  const r = autoResolveAccount(remote("brunomilani"), [acct("brunomilani"), acct("other")]);
  assert.equal(r.account?.user, "brunomilani");
  assert.match(r.reason, /matches repo owner/);
});

test("owner match is case-insensitive", () => {
  const r = autoResolveAccount(remote("BrunoMilani"), [acct("brunomilani"), acct("other")]);
  assert.equal(r.account?.user, "brunomilani");
});

test("auto-resolves when only one account on host", () => {
  const r = autoResolveAccount(remote("some-org"), [acct("solo")]);
  assert.equal(r.account?.user, "solo");
  assert.match(r.reason, /only one account/);
});

test("ambiguous when several accounts and no owner match", () => {
  const r = autoResolveAccount(remote("some-org"), [acct("a"), acct("b")]);
  assert.equal(r.account, null);
  assert.equal(r.candidates.length, 2);
});

test("no accounts → null with reason", () => {
  const r = autoResolveAccount(remote("x"), []);
  assert.equal(r.account, null);
  assert.equal(r.candidates.length, 0);
});

test("filters accounts to the repo host", () => {
  const r = autoResolveAccount(remote("org", "github.com"), [
    acct("ghuser", "github.com"),
    acct("gluser", "gitlab.com"),
  ]);
  assert.equal(r.account?.user, "ghuser");
});

test("never offers a github account for a bitbucket repo", () => {
  // The bug: a github account leaked onto a bitbucket.org repo.
  const r = autoResolveAccount(remote("acme-org", "bitbucket.org"), [
    acct("brunomilani-dreamlines", "github.com"),
  ]);
  assert.equal(r.account, null);
  assert.equal(r.candidates.length, 0);
  assert.match(r.reason, /bitbucket\.org/);
});
