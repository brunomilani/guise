import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point config at a throwaway dir BEFORE importing config.ts (it reads env lazily,
// but we set it here and import dynamically to be safe).
let tmp: string;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), "octo-test-"));
  process.env.XDG_CONFIG_HOME = tmp;
});

after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

test("profile set / get / list / remove round-trip", async () => {
  const { setProfile, getProfile, listProfiles, removeProfile } = await import("../src/config.js");

  setProfile("work", {
    githubUser: "bruno-work",
    gitUserEmail: "john@domain.com",
    sshKey: "~/.ssh/work",
  });
  setProfile("personal", { githubUser: "brunomilani", gitUserEmail: "b@gmail.com" });

  assert.equal(getProfile("work")?.githubUser, "bruno-work");
  assert.equal(getProfile("work")?.gitUserEmail, "john@domain.com");
  assert.deepEqual(Object.keys(listProfiles()).sort(), ["personal", "work"]);

  assert.equal(removeProfile("work"), true);
  assert.equal(getProfile("work"), undefined);
  assert.equal(removeProfile("nope"), false);
});

test("setProfile preserves other profiles", async () => {
  const { setProfile, listProfiles } = await import("../src/config.js");
  setProfile("a", { githubUser: "ua" });
  setProfile("b", { githubUser: "ub" });
  const all = listProfiles();
  assert.equal(all.a.githubUser, "ua");
  assert.equal(all.b.githubUser, "ub");
});
