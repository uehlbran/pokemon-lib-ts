export function validateReviewMarker({ markerText, currentBranch, currentCommit, isAncestor }) {
  if (!markerText) {
    return {
      isValid: false,
      error: "Run /review before opening a PR. falcon/kestrel/sentinel must pass first.",
    };
  }

  const [reviewedBranch = "", reviewedCommit = ""] = markerText
    .split(/\r?\n/)
    .map((line) => line.trim());

  if (reviewedBranch !== currentBranch) {
    return {
      isValid: false,
      error: `Review marker is for branch '${reviewedBranch}', but current branch is '${currentBranch}'. Run /review again.`,
    };
  }

  // Allow post-review commits (e.g. biome formatting, typo fixes) as long as
  // the reviewed commit is still an ancestor of HEAD.  Falls back to exact
  // match when the caller doesn't provide an ancestry check.
  if (reviewedCommit === currentCommit) {
    return { isValid: true, error: null };
  }

  if (typeof isAncestor === "boolean") {
    if (isAncestor) {
      return { isValid: true, error: null };
    }
    return {
      isValid: false,
      error: `Review marker commit '${reviewedCommit}' is not an ancestor of HEAD '${currentCommit}'. This means the branch was rebased or reset after review. Run /review again.`,
    };
  }

  // Legacy path: no ancestry info provided — require exact match
  return {
    isValid: false,
    error: `Review marker is for commit '${reviewedCommit}', but HEAD is '${currentCommit}'. Run /review again.`,
  };
}
