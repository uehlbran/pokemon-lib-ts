export const RECONCILIATION_STATUSES = [
  "unclassified",
  "merged-equivalent",
  "superseded",
  "still-needed",
  "discard",
];

export function isTaskBranchEntry({ path, branch, primaryWorktree, repoRoot }) {
  if (!branch || branch === "(detached)") {
    return false;
  }

  if (path === primaryWorktree) {
    return branch !== "main" && branch !== "master";
  }

  return path.startsWith(`${repoRoot}/.worktrees/`);
}

export function createReconciliationLedger({ existingLedger, currentEntries, generatedAt }) {
  const existingEntries = new Map(
    (existingLedger?.entries ?? []).map((entry) => [entry.branch, entry]),
  );

  return {
    version: 1,
    generatedAt,
    entries: currentEntries.map((entry) => {
      const existingEntry = existingEntries.get(entry.branch);
      const defaultStatus = entry.mergedIntoMain ? "merged-equivalent" : "unclassified";

      return {
        branch: entry.branch,
        path: entry.path,
        head: entry.head,
        mergedIntoMain: entry.mergedIntoMain,
        status: existingEntry?.status ?? defaultStatus,
        retired: existingEntry?.retired ?? false,
        notes: existingEntry?.notes ?? "",
      };
    }),
  };
}

export function validateReconciliationLedger({ ledger, currentEntries }) {
  if (currentEntries.length === 0) {
    return {
      isValid: true,
      missingEntries: [],
      unclassifiedEntries: [],
      pendingRetirement: [],
      invalidStatuses: [],
      errors: [],
    };
  }

  if (!ledger || !Array.isArray(ledger.entries)) {
    return {
      isValid: false,
      missingEntries: currentEntries,
      unclassifiedEntries: [],
      pendingRetirement: [],
      invalidStatuses: [],
      errors: [
        "Backlog reconciliation is required before starting another task. Run node scripts/reconcile-worktrees.mjs --write.",
      ],
    };
  }

  const ledgerEntries = new Map(ledger.entries.map((entry) => [entry.branch, entry]));
  const missingEntries = [];
  const unclassifiedEntries = [];
  const pendingRetirement = [];
  const invalidStatuses = [];

  for (const entry of currentEntries) {
    const ledgerEntry = ledgerEntries.get(entry.branch);

    if (!ledgerEntry) {
      missingEntries.push(entry);
      continue;
    }

    if (!RECONCILIATION_STATUSES.includes(ledgerEntry.status)) {
      invalidStatuses.push(ledgerEntry);
      continue;
    }

    if (ledgerEntry.status === "unclassified") {
      unclassifiedEntries.push(ledgerEntry);
      continue;
    }

    if (
      ["merged-equivalent", "superseded", "discard"].includes(ledgerEntry.status) &&
      ledgerEntry.retired !== true
    ) {
      pendingRetirement.push(ledgerEntry);
    }
  }

  const errors = [];

  if (missingEntries.length > 0) {
    errors.push(
      `Untracked task branches in reconciliation ledger: ${missingEntries.map((entry) => entry.branch).join(", ")}.`,
    );
  }

  if (unclassifiedEntries.length > 0) {
    errors.push(
      `Unclassified task branches block new work: ${unclassifiedEntries.map((entry) => entry.branch).join(", ")}.`,
    );
  }

  if (pendingRetirement.length > 0) {
    errors.push(
      `Retire stale task branches before starting more work: ${pendingRetirement.map((entry) => entry.branch).join(", ")}.`,
    );
  }

  if (invalidStatuses.length > 0) {
    errors.push(
      `Reconciliation ledger contains invalid statuses for: ${invalidStatuses.map((entry) => entry.branch).join(", ")}.`,
    );
  }

  return {
    isValid: errors.length === 0,
    missingEntries,
    unclassifiedEntries,
    pendingRetirement,
    invalidStatuses,
    errors,
  };
}
