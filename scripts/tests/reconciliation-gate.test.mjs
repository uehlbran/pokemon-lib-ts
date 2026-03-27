import assert from "node:assert/strict";
import test from "node:test";
import {
  createReconciliationLedger,
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
