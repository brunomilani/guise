import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRemote } from "../src/git.js";

test("parses SSH remote", () => {
  assert.deepEqual(parseRemote("git@github.com:acme/web-app.git"), {
    rawHost: "github.com",
    host: "github.com",
    owner: "acme",
    repo: "web-app",
    provider: "github",
  });
});

test("parses HTTPS remote", () => {
  assert.deepEqual(parseRemote("https://github.com/acme/web-app.git"), {
    rawHost: "github.com",
    host: "github.com",
    owner: "acme",
    repo: "web-app",
    provider: "github",
  });
});

test("parses remote without .git suffix", () => {
  assert.deepEqual(parseRemote("https://github.com/acme/web-app"), {
    rawHost: "github.com",
    host: "github.com",
    owner: "acme",
    repo: "web-app",
    provider: "github",
  });
});

test("parses ssh:// scheme with embedded user", () => {
  assert.deepEqual(parseRemote("ssh://git@github.com/acme/web-app.git"), {
    rawHost: "github.com",
    host: "github.com",
    owner: "acme",
    repo: "web-app",
    provider: "github",
  });
});

test("resolves SSH host alias", () => {
  assert.deepEqual(
    parseRemote("git@github-work:acme/web-app.git", {
      "github-work": "github.com",
    }),
    {
      rawHost: "github-work",
      host: "github.com",
      owner: "acme",
      repo: "web-app",
      provider: "github",
    },
  );
});

test("keeps raw host when no alias mapping is provided", () => {
  const r = parseRemote("git@github-work:acme/web-app.git");
  assert.equal(r?.rawHost, "github-work");
  assert.equal(r?.host, "github-work");
});

test("handles ssh:// with custom port", () => {
  const r = parseRemote("ssh://git@github.com:22/acme/web-app.git");
  assert.equal(r?.host, "github.com");
  assert.equal(r?.owner, "acme");
  assert.equal(r?.repo, "web-app");
});

test("returns null for non-git input", () => {
  assert.equal(parseRemote(""), null);
  assert.equal(parseRemote("not a url"), null);
  assert.equal(parseRemote("https://github.com/onlyowner"), null);
});
