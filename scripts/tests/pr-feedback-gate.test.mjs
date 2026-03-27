import assert from "node:assert/strict";
import test from "node:test";
import { validatePullRequestFeedback } from "../lib/pr-feedback-gate.mjs";

test("blocks unresolved review threads without replies", () => {
  const result = validatePullRequestFeedback({
    prAuthorLogin: "author",
    reviewThreads: [
      {
        isResolved: false,
        totalCount: 1,
        path: "file.ts",
        authorLogin: "reviewer",
      },
    ],
    issueComments: [],
  });

  assert.equal(result.isValid, false);
  assert.equal(result.unresolvedThreadsWithoutReply.length, 1);
});

test("blocks top-level comments without acknowledgements", () => {
  const result = validatePullRequestFeedback({
    prAuthorLogin: "author",
    reviewThreads: [],
    issueComments: [
      {
        id: 55,
        authorLogin: "qodo-bot",
        body: "Looks fine.",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
    ],
  });

  assert.equal(result.isValid, false);
  assert.equal(result.unacknowledgedIssueComments.length, 1);
});

test("accepts acknowledged top-level comments", () => {
  const result = validatePullRequestFeedback({
    prAuthorLogin: "author",
    reviewThreads: [],
    issueComments: [
      {
        id: 55,
        authorLogin: "qodo-bot",
        body: "Looks fine.",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
      {
        id: 56,
        authorLogin: "author",
        body: "Ack comment 55: reviewed and no action needed.",
        createdAt: "2026-03-27T10:05:00.000Z",
      },
    ],
  });

  assert.equal(result.isValid, true);
});

test("blocks CodeRabbit review-in-progress comments unless an explicit bypass exists", () => {
  const result = validatePullRequestFeedback({
    prAuthorLogin: "author",
    reviewThreads: [],
    issueComments: [
      {
        id: 90,
        authorLogin: "coderabbitai[bot]",
        body: "CodeRabbit review in progress.",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
      {
        id: 91,
        authorLogin: "author",
        body: "Ack comment 90: waiting.",
        createdAt: "2026-03-27T10:05:00.000Z",
      },
    ],
  });

  assert.equal(result.isValid, false);
  assert.equal(result.blockingCodeRabbitComments.length, 1);
});

test("accepts an explicit CodeRabbit bypass comment", () => {
  const result = validatePullRequestFeedback({
    prAuthorLogin: "author",
    reviewThreads: [],
    issueComments: [
      {
        id: 90,
        authorLogin: "coderabbitai[bot]",
        body: "CodeRabbit review in progress.",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
      {
        id: 91,
        authorLogin: "author",
        body: "Ack comment 90: bypass because CodeRabbit is rate-limited.",
        createdAt: "2026-03-27T10:05:00.000Z",
      },
    ],
  });

  assert.equal(result.isValid, true);
});

test("accepts acknowledgements with equal timestamps when the ack comment id is later", () => {
  const result = validatePullRequestFeedback({
    prAuthorLogin: "author",
    reviewThreads: [],
    issueComments: [
      {
        id: 55,
        authorLogin: "qodo-bot",
        body: "Looks fine.",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
      {
        id: 56,
        authorLogin: "author",
        body: "Ack comment 55: reviewed and no action needed.",
        createdAt: "2026-03-27T10:00:00.000Z",
      },
    ],
  });

  assert.equal(result.isValid, true);
});
