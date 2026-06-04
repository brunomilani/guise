import { test } from "node:test";
import assert from "node:assert/strict";
import { identityFileForHost, expandTilde } from "../src/ssh.js";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG = `
Host github-manbtos
  HostName github.com
  IdentityFile ~/.ssh/id_rsa_manbtos

Host *
  UseKeychain yes

Host bitbucket.org
  HostName bitbucket.org
  IdentityFile ~/.ssh/id_rsa_dreamlines
  UseKeychain yes

Host bitbucket-netvacation
  HostName bitbucket.org
  IdentityFile "~/.ssh/id_netvacation"
`;

test("finds the IdentityFile for an exact host", () => {
  assert.equal(identityFileForHost(CONFIG, "bitbucket.org"), "~/.ssh/id_rsa_dreamlines");
});

test("matches an SSH host alias", () => {
  assert.equal(identityFileForHost(CONFIG, "bitbucket-netvacation"), "~/.ssh/id_netvacation");
});

test("strips surrounding quotes", () => {
  assert.equal(identityFileForHost(CONFIG, "bitbucket-netvacation"), "~/.ssh/id_netvacation");
});

test("ignores wildcard-only blocks", () => {
  // "Host *" has no IdentityFile and must never match a concrete host.
  assert.equal(identityFileForHost(CONFIG, "unknown.example.com"), null);
});

test("returns null when host absent", () => {
  assert.equal(identityFileForHost(CONFIG, "gitlab.com"), null);
});

test("expandTilde resolves home", () => {
  assert.equal(expandTilde("~/.ssh/key"), join(homedir(), ".ssh", "key"));
  assert.equal(expandTilde("/abs/path"), "/abs/path");
});
