import assert from "node:assert/strict";
import test from "node:test";
import { validateWorktreeContext } from "../lib/worktree-gate.mjs";

test("rejects the primary checkout for task work", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo",
    primaryWorktree: "/repo",
    declaredBranch: "feat/task",
    currentBranch: "feat/task",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /primary checkout is not for task work/i);
});

test("rejects missing session branch marker", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo/.worktrees/feat-task",
    primaryWorktree: "/repo",
    declaredBranch: "",
    currentBranch: "feat/task",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /No session branch declared/i);
});

test("rejects branch mismatch", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo/.worktrees/feat-task",
    primaryWorktree: "/repo",
    declaredBranch: "feat/task",
    currentBranch: "bugfix/task",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Branch mismatch/i);
});

test("accepts a dedicated worktree with matching branch marker", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo/.worktrees/feat-task",
    primaryWorktree: "/repo",
    declaredBranch: "feat/task",
    currentBranch: "feat/task",
  });

  assert.equal(result.isValid, true);
  assert.equal(result.error, null);
});
