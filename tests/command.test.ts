import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommand, isIdentitySensitive } from "../src/command.js";

test("detects gh commands", () => {
  assert.equal(classifyCommand("gh pr create").touchesGh, true);
  assert.equal(classifyCommand("echo hi && gh issue list").touchesGh, true);
  assert.equal(classifyCommand("github-cli").touchesGh, false); // not the gh binary
});

test("detects git push", () => {
  assert.equal(classifyCommand("git push origin main").touchesPush, true);
  assert.equal(classifyCommand("git -c x=y push").touchesPush, true);
  assert.equal(classifyCommand("git status").touchesPush, false);
});

test("detects git commit", () => {
  assert.equal(classifyCommand("git commit -m x").touchesCommit, true);
  assert.equal(classifyCommand('git -C . commit --amend').touchesCommit, true);
  assert.equal(classifyCommand("git log").touchesCommit, false);
});

test("isIdentitySensitive aggregates", () => {
  assert.equal(isIdentitySensitive(classifyCommand("ls -la")), false);
  assert.equal(isIdentitySensitive(classifyCommand("git push")), true);
  assert.equal(isIdentitySensitive(classifyCommand("gh repo view")), true);
});
