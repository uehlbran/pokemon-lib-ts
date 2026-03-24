import assert from "node:assert/strict";
import test from "node:test";
import { validateWorktreeContext } from "../lib/worktree-gate.mjs";

test("given the primary checkout, when validating task worktree context, then it rejects task work there", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo",
    primaryWorktree: "/repo",
    declaredBranch: "feat/task",
    currentBranch: "feat/task",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /primary checkout is not for task work/i);
});

test("given a worktree without a session branch marker, when validating task worktree context, then it rejects the worktree", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo/.worktrees/feat-task",
    primaryWorktree: "/repo",
    declaredBranch: "",
    currentBranch: "feat/task",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /No session branch declared/i);
});

test("given a branch mismatch, when validating task worktree context, then it rejects the worktree", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo/.worktrees/feat-task",
    primaryWorktree: "/repo",
    declaredBranch: "feat/task",
    currentBranch: "bugfix/task",
  });

  assert.equal(result.isValid, false);
  assert.match(result.error ?? "", /Branch mismatch/i);
});

test("given a dedicated worktree with a matching branch marker, when validating task worktree context, then it accepts the worktree", () => {
  const result = validateWorktreeContext({
    projectDir: "/repo/.worktrees/feat-task",
    primaryWorktree: "/repo",
    declaredBranch: "feat/task",
    currentBranch: "feat/task",
  });

  assert.equal(result.isValid, true);
  assert.equal(result.error, null);
});
