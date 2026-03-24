export function validateReviewMarker({ markerText, currentBranch, currentCommit }) {
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

  if (reviewedCommit !== currentCommit) {
    return {
      isValid: false,
      error: `Review marker is for commit '${reviewedCommit}', but HEAD is '${currentCommit}'. Run /review again.`,
    };
  }

  return { isValid: true, error: null };
}
