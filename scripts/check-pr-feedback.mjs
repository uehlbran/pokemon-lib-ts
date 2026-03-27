#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { validatePullRequestFeedback } from "./lib/pr-feedback-gate.mjs";

function getOptionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  return args[index + 1] ?? null;
}

function runGh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr || `gh ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function fetchReviewThreads({ owner, repo, prNumber }) {
  const threads = [];
  let hasNextPage = true;
  let afterCursor = null;

  while (hasNextPage) {
    const afterClause = afterCursor ? `, after: "${afterCursor}"` : "";
    const response = JSON.parse(
      runGh([
        "api",
        "graphql",
        "-f",
        `query={
          repository(owner: "${owner}", name: "${repo}") {
            pullRequest(number: ${prNumber}) {
              author { login }
              reviewThreads(first: 100${afterClause}) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  isResolved
                  comments(first: 2) {
                    totalCount
                    nodes {
                      path
                      author { login }
                    }
                  }
                }
              }
            }
          }
        }`,
      ]),
    );

    const pullRequest = response.data.repository.pullRequest;
    const reviewThreads = pullRequest.reviewThreads;
    threads.push(...reviewThreads.nodes);
    hasNextPage = reviewThreads.pageInfo.hasNextPage;
    afterCursor = reviewThreads.pageInfo.endCursor;
  }

  return threads;
}

const providedPrNumber = getOptionValue(process.argv.slice(2), "--pr");
const inferredPrNumber = providedPrNumber
  ? null
  : JSON.parse(runGh(["pr", "view", "--json", "number"])).number;
const prNumber = providedPrNumber ?? String(inferredPrNumber ?? "");

if (!prNumber) {
  console.error("Could not determine PR number for feedback validation.");
  process.exit(1);
}

const repository = JSON.parse(runGh(["repo", "view", "--json", "nameWithOwner"])).nameWithOwner;
const [owner, repo] = repository.split("/");

const pullRequestData = JSON.parse(
  runGh([
    "api",
    "graphql",
    "-f",
    `query={
      repository(owner: "${owner}", name: "${repo}") {
        pullRequest(number: ${prNumber}) {
          author { login }
        }
      }
    }`,
  ]),
);

const issueComments = JSON.parse(
  runGh(["api", "--paginate", `repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`]),
).map((comment) => ({
  id: comment.id,
  authorLogin: comment.user?.login ?? "",
  body: comment.body ?? "",
  createdAt: comment.created_at ?? "",
  url: comment.html_url ?? "",
}));

const reviewThreads =
  fetchReviewThreads({ owner, repo, prNumber }).map((thread) => ({
    isResolved: thread.isResolved,
    totalCount: thread.comments.totalCount,
    path: thread.comments.nodes[0]?.path ?? "unknown file",
    authorLogin: thread.comments.nodes[0]?.author?.login ?? "reviewer",
  })) ?? [];

const result = validatePullRequestFeedback({
  reviewThreads,
  issueComments,
  prAuthorLogin: pullRequestData.data.repository.pullRequest.author?.login ?? "",
});

if (!result.isValid) {
  if (result.unresolvedThreadsWithoutReply.length > 0) {
    console.error("Unresolved review threads without replies:");
    for (const thread of result.unresolvedThreadsWithoutReply) {
      console.error(`- ${thread.authorLogin} on ${thread.path}`);
    }
  }

  if (result.unacknowledgedIssueComments.length > 0) {
    console.error("Top-level PR comments without acknowledgement:");
    for (const comment of result.unacknowledgedIssueComments) {
      console.error(`- ${comment.authorLogin} comment ${comment.id}`);
    }
  }

  if (result.blockingCodeRabbitComments.length > 0) {
    console.error("CodeRabbit is still marked as in progress:");
    for (const comment of result.blockingCodeRabbitComments) {
      console.error(`- comment ${comment.id}`);
    }
    console.error(
      "Use an explicit acknowledgement such as 'Ack comment <id>: bypass because CodeRabbit is stuck/rate-limited.' only when the bypass is justified.",
    );
  }

  process.exit(1);
}
