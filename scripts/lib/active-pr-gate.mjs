export const ALLOWED_ACTIVE_PR_ACTIONS = new Set(["start-task", "pr-create"]);

export function validateActivePrState({ marker, action, currentBranch, pullRequest }) {
  if (!marker) {
    return {
      isValid: true,
      shouldClearMarker: false,
      error: null,
    };
  }

  if (pullRequest?.state && pullRequest.state !== "OPEN") {
    return {
      isValid: true,
      shouldClearMarker: true,
      error: null,
    };
  }

  if (action === "start-task") {
    return {
      isValid: false,
      shouldClearMarker: false,
      error:
        `Another PR is still active (#${marker.prNumber} on '${marker.branch}'). ` +
        "Finish or close it before starting a new task branch.",
    };
  }

  if (action === "pr-create") {
    if (marker.branch === currentBranch) {
      return {
        isValid: false,
        shouldClearMarker: false,
        error: `Branch '${currentBranch}' already has an active PR (#${marker.prNumber}).`,
      };
    }

    return {
      isValid: false,
      shouldClearMarker: false,
      error:
        `Another branch already owns the active PR slot (#${marker.prNumber} on '${marker.branch}'). ` +
        "Merge or close it before opening a new PR.",
    };
  }

  return {
    isValid: false,
    shouldClearMarker: false,
    error: `Invalid active PR action '${action}'. Expected one of: ${[...ALLOWED_ACTIVE_PR_ACTIONS].join(", ")}.`,
  };
}
