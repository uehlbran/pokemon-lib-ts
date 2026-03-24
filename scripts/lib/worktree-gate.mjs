export function validateWorktreeContext({
  projectDir,
  primaryWorktree,
  declaredBranch,
  currentBranch,
}) {
  if (!projectDir) {
    return {
      isValid: false,
      error: "Could not determine the repo root for this task.",
    };
  }

  if (primaryWorktree && projectDir === primaryWorktree) {
    return {
      isValid: false,
      error:
        "The primary checkout is not for task work. Create a fresh task-owned worktree from origin/main first.",
    };
  }

  if (!declaredBranch) {
    return {
      isValid: false,
      error:
        "No session branch declared. Start the task in a fresh worktree from origin/main and write .claude/.session-branch.",
    };
  }

  if (currentBranch !== declaredBranch) {
    return {
      isValid: false,
      error: `Branch mismatch. Declared '${declaredBranch}' in .claude/.session-branch but current branch is '${currentBranch}'.`,
    };
  }

  return {
    isValid: true,
    error: null,
  };
}
