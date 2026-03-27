const ACK_PATTERN = /(?:^|\n)\s*Ack comment (\d+):/gi;
const ACK_LINE_PATTERN = /(?:^|\n)\s*Ack comment (\d+):([^\n]*)/gi;
const BYPASS_REASON_PATTERN = /\bbypass\b.*\b(?:rate[- ]limited|stuck|broken)\b/i;
const CODE_RABBIT_LOGINS = new Set(["coderabbitai[bot]", "coderabbitai"]);

function isAckComment(body) {
  return typeof body === "string" && body.match(ACK_PATTERN) !== null;
}

function collectAcknowledgements(issueComments, prAuthorLogin) {
  const acknowledgements = new Map();

  for (const comment of issueComments) {
    if (comment.authorLogin !== prAuthorLogin) {
      continue;
    }

    if (typeof comment.body !== "string") {
      continue;
    }

    const matches = [...comment.body.matchAll(ACK_LINE_PATTERN)];
    if (matches.length === 0) {
      continue;
    }

    for (const match of matches) {
      const commentId = Number(match[1]);
      const isBypass = BYPASS_REASON_PATTERN.test(match[2] ?? "");
      const existing = acknowledgements.get(commentId) ?? [];
      existing.push({
        id: comment.id,
        createdAt: comment.createdAt,
        isBypass,
      });
      acknowledgements.set(commentId, existing);
    }
  }

  return acknowledgements;
}

function isAfterComment(entry, commentId, createdAt) {
  const entryTime = Date.parse(entry.createdAt);
  const commentTime = Date.parse(createdAt);
  const entryTimestamp = Number.isNaN(entryTime) ? entry.createdAt : String(entryTime);
  const commentTimestamp = Number.isNaN(commentTime) ? createdAt : String(commentTime);

  if (entryTimestamp > commentTimestamp) {
    return true;
  }

  if (entryTimestamp < commentTimestamp) {
    return false;
  }

  return typeof entry.id === "number" && entry.id > commentId;
}

function hasAcknowledgementAfter(acknowledgements, commentId, createdAt) {
  const entries = acknowledgements.get(commentId) ?? [];
  return entries.some((entry) => isAfterComment(entry, commentId, createdAt));
}

function hasBypassAfter(acknowledgements, commentId, createdAt) {
  const entries = acknowledgements.get(commentId) ?? [];
  return entries.some((entry) => entry.isBypass && isAfterComment(entry, commentId, createdAt));
}

function isCodeRabbitInProgress(comment) {
  return (
    CODE_RABBIT_LOGINS.has(comment.authorLogin) &&
    typeof comment.body === "string" &&
    /review in progress/i.test(comment.body)
  );
}

export function validatePullRequestFeedback({ reviewThreads, issueComments, prAuthorLogin }) {
  const unresolvedThreadsWithoutReply = reviewThreads.filter(
    (thread) => thread.isResolved === false && thread.totalCount <= 1,
  );

  const acknowledgements = collectAcknowledgements(issueComments, prAuthorLogin);
  const unacknowledgedIssueComments = [];
  const blockingCodeRabbitComments = [];

  for (const comment of issueComments) {
    if (comment.authorLogin === prAuthorLogin) {
      continue;
    }

    if (isAckComment(comment.body)) {
      continue;
    }

    if (!hasAcknowledgementAfter(acknowledgements, comment.id, comment.createdAt)) {
      unacknowledgedIssueComments.push(comment);
    }

    if (
      isCodeRabbitInProgress(comment) &&
      !hasBypassAfter(acknowledgements, comment.id, comment.createdAt)
    ) {
      blockingCodeRabbitComments.push(comment);
    }
  }

  return {
    isValid:
      unresolvedThreadsWithoutReply.length === 0 &&
      unacknowledgedIssueComments.length === 0 &&
      blockingCodeRabbitComments.length === 0,
    unresolvedThreadsWithoutReply,
    unacknowledgedIssueComments,
    blockingCodeRabbitComments,
  };
}
