import assert from "node:assert/strict";
import test from "node:test";
import {
  createReconciliationLedger,
  getSharedRepoRoot,
  isTaskBranchEntry,
  parseTaskWorktreeEntries,
  validateReconciliationLedger,
} from "../lib/reconciliation-gate.mjs";

test("requires a reconciliation ledger when task branches already exist", () => {
  const result = validateReconciliationLedger({
    ledger: null,
    currentEntries: [
      {
        branch: "fix/example",
        path: "/repo/.worktrees/fix-example",
        head: "abc",
        mergedIntoMain: false,
      },
    ],
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /Backlog reconciliation is required/i);
});

test("blocks new work when a branch is still unclassified", () => {
  const currentEntries = [
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "abc",
      mergedIntoMain: false,
    },
  ];
  const ledger = createReconciliationLedger({
    existingLedger: null,
    currentEntries,
    generatedAt: "2026-03-27T00:00:00.000Z",
  });

  const result = validateReconciliationLedger({
    ledger,
    currentEntries,
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /Unclassified task branches/i);
});

test("requires retirement for merged-equivalent branches before more work starts", () => {
  const currentEntries = [
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "abc",
      mergedIntoMain: true,
    },
  ];
  const ledger = {
    version: 1,
    generatedAt: "2026-03-27T00:00:00.000Z",
    entries: [
      {
        ...currentEntries[0],
        status: "merged-equivalent",
        retired: false,
        notes: "",
      },
    ],
  };

  const result = validateReconciliationLedger({
    ledger,
    currentEntries,
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /Retire stale task branches/i);
});

test("accepts classified still-needed branches", () => {
  const currentEntries = [
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "abc",
      mergedIntoMain: false,
    },
  ];
  const ledger = {
    version: 1,
    generatedAt: "2026-03-27T00:00:00.000Z",
    entries: [
      {
        ...currentEntries[0],
        status: "still-needed",
        retired: false,
        notes: "",
      },
    ],
  };

  const result = validateReconciliationLedger({
    ledger,
    currentEntries,
  });

  assert.equal(result.isValid, true);
});

test("requires retirement for superseded branches before more work starts", () => {
  const currentEntries = [
    {
      branch: "fix/old-approach",
      path: "/repo/.worktrees/fix-old-approach",
      head: "def",
      mergedIntoMain: false,
    },
  ];
  const ledger = {
    version: 1,
    generatedAt: "2026-03-27T00:00:00.000Z",
    entries: [
      {
        ...currentEntries[0],
        status: "superseded",
        retired: false,
        notes: "Replaced by fix/new-approach",
      },
    ],
  };

  const result = validateReconciliationLedger({
    ledger,
    currentEntries,
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /Retire stale task branches/i);
});

test("requires retirement for discarded branches before more work starts", () => {
  const currentEntries = [
    {
      branch: "feat/abandoned",
      path: "/repo/.worktrees/feat-abandoned",
      head: "ghi",
      mergedIntoMain: false,
    },
  ];
  const ledger = {
    version: 1,
    generatedAt: "2026-03-27T00:00:00.000Z",
    entries: [
      {
        ...currentEntries[0],
        status: "discard",
        retired: false,
        notes: "No longer needed",
      },
    ],
  };

  const result = validateReconciliationLedger({
    ledger,
    currentEntries,
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /Retire stale task branches/i);
});

test("resets carried-forward status when a branch head changes", () => {
  const currentEntries = [
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "def",
      mergedIntoMain: false,
    },
  ];

  const ledger = createReconciliationLedger({
    existingLedger: {
      version: 1,
      generatedAt: "2026-03-26T00:00:00.000Z",
      entries: [
        {
          branch: "fix/example",
          path: "/repo/.worktrees/fix-example",
          head: "abc",
          mergedIntoMain: true,
          status: "merged-equivalent",
          retired: true,
          notes: "old classification",
        },
      ],
    },
    currentEntries,
    generatedAt: "2026-03-27T00:00:00.000Z",
  });

  assert.equal(ledger.entries[0]?.status, "unclassified");
  assert.equal(ledger.entries[0]?.retired, false);
  assert.equal(ledger.entries[0]?.notes, "");
});

test("normalizes stale still-needed status for branches already merged into main", () => {
  const currentEntries = [
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "abc",
      mergedIntoMain: true,
    },
  ];

  const ledger = createReconciliationLedger({
    existingLedger: {
      version: 1,
      generatedAt: "2026-03-26T00:00:00.000Z",
      entries: [
        {
          branch: "fix/example",
          path: "/repo/.worktrees/fix-example",
          head: "abc",
          mergedIntoMain: true,
          status: "still-needed",
          retired: false,
          notes: "stale classification",
        },
      ],
    },
    currentEntries,
    generatedAt: "2026-03-27T00:00:00.000Z",
  });

  assert.equal(ledger.entries[0]?.status, "merged-equivalent");
  assert.equal(ledger.entries[0]?.retired, false);
});

test("rejects stale merged-equivalent entries when the current branch is no longer merged", () => {
  const currentEntries = [
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "abc",
      mergedIntoMain: false,
    },
  ];
  const ledger = {
    version: 1,
    generatedAt: "2026-03-27T00:00:00.000Z",
    entries: [
      {
        ...currentEntries[0],
        status: "merged-equivalent",
        retired: true,
        notes: "",
      },
    ],
  };

  const result = validateReconciliationLedger({
    ledger,
    currentEntries,
  });

  assert.equal(result.isValid, false);
  assert.match(result.errors[0] ?? "", /stale/i);
});

test("excludes main worktrees from task-branch reconciliation even when linked", () => {
  assert.equal(
    isTaskBranchEntry({
      path: "/repo/.worktrees/main-maintenance",
      branch: "main",
      primaryWorktree: "/repo",
      repoRoot: "/repo",
    }),
    false,
  );
});

test("derives the shared repository root from the git common dir", () => {
  assert.equal(getSharedRepoRoot("/repo/.git"), "/repo");
});

test("parses task worktrees across sibling linked worktrees using the shared repo root", () => {
  const entries = parseTaskWorktreeEntries({
    porcelain: [
      "worktree /repo",
      "HEAD aaa111",
      "branch refs/heads/docs/update-readmes-758",
      "",
      "worktree /repo/.worktrees/main-maintenance",
      "HEAD bbb222",
      "branch refs/heads/main",
      "",
      "worktree /repo/.worktrees/fix-example",
      "HEAD ccc333",
      "branch refs/heads/fix/example",
      "",
    ].join("\n"),
    repoRoot: "/repo",
    isHeadMergedIntoMain: (head) => head === "bbb222",
  });

  assert.deepEqual(entries, [
    {
      branch: "docs/update-readmes-758",
      path: "/repo",
      head: "aaa111",
      mergedIntoMain: false,
    },
    {
      branch: "fix/example",
      path: "/repo/.worktrees/fix-example",
      head: "ccc333",
      mergedIntoMain: false,
    },
  ]);
});
