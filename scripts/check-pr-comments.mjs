#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const args = { mode: "report" };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function ghJson(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
}

function getRepoNameWithOwner(explicitRepo) {
  if (explicitRepo) return explicitRepo;
  const repo = ghJson(["repo", "view", "--json", "nameWithOwner"]);
  return repo.nameWithOwner;
}

function fetchPrAuthor(repoNameWithOwner, prNumber) {
  const pr = ghJson([
    "pr",
    "view",
    String(prNumber),
    "--repo",
    repoNameWithOwner,
    "--json",
    "author",
  ]);
  return pr.author.login;
}

function fetchAllReviewThreads(owner, repo, prNumber) {
  const threads = [];
  let hasNextPage = true;
  let after = null;

  while (hasNextPage) {
    const variables = ["-F", `owner=${owner}`, "-F", `repo=${repo}`, "-F", `prNumber=${prNumber}`];
    if (after) variables.push("-F", `after=${after}`);

    const result = ghJson([
      "api",
      "graphql",
      ...variables,
      "-f",
      `query=query($owner: String!, $repo: String!, $prNumber: Int!, $after: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $prNumber) {
            reviewThreads(first: 100, after: $after) {
              nodes {
                id
                isResolved
                isOutdated
                comments(first: 20) {
                  nodes {
                    url
                    path
                    author { login }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }`,
    ]);

    const page = result.data.repository.pullRequest.reviewThreads;
    threads.push(...page.nodes);
    hasNextPage = page.pageInfo.hasNextPage;
    after = page.pageInfo.endCursor;
  }

  return threads;
}

function fetchIssueComments(repoNameWithOwner, prNumber) {
  return ghJson(["api", `repos/${repoNameWithOwner}/issues/${prNumber}/comments`, "--paginate"]);
}

function isActionableIssueComment(comment, prAuthor) {
  if (comment.user?.login === prAuthor) return false;
  if (comment.user?.login === "github-actions[bot]") return false;

  const body = comment.body ?? "";
  if (
    body.includes("Review failed") ||
    body.includes("walkthrough_start") ||
    body.includes("Failed to generate code suggestions for PR")
  ) {
    return false;
  }

  return (
    /Action required/i.test(body) ||
    /Potential issue/i.test(body) ||
    /Refactor suggestion/i.test(body) ||
    /Nitpick/i.test(body) ||
    /<code>🐞 Bugs \(/.test(body)
  );
}

function hasLinkedAuthorAcknowledgement(comment, allComments, prAuthor) {
  return allComments.some(
    (candidate) =>
      candidate.user?.login === prAuthor &&
      new Date(candidate.created_at).getTime() > new Date(comment.created_at).getTime() &&
      candidate.body?.includes(comment.html_url),
  );
}

function main() {
  const args = parseArgs(process.argv);
  const prNumber = Number(args.pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    console.error(
      "Usage: node scripts/check-pr-comments.mjs --pr <number> [--repo owner/name] [--mode report|gate]",
    );
    process.exit(1);
  }

  const repoNameWithOwner = getRepoNameWithOwner(args.repo);
  const [owner, repo] = repoNameWithOwner.split("/");
  const prAuthor = fetchPrAuthor(repoNameWithOwner, prNumber);
  const reviewThreads = fetchAllReviewThreads(owner, repo, prNumber);
  const issueComments = fetchIssueComments(repoNameWithOwner, prNumber);

  const unresolvedThreads = reviewThreads
    .filter((thread) => thread.isResolved === false)
    .map((thread) => ({
      id: thread.id,
      url: thread.comments.nodes[0]?.url ?? "",
      author: thread.comments.nodes[0]?.author?.login ?? "reviewer",
      path: thread.comments.nodes[0]?.path ?? "unknown file",
      outdated: thread.isOutdated,
    }));

  const unacknowledgedTopLevelComments = issueComments
    .filter((comment) => isActionableIssueComment(comment, prAuthor))
    .filter((comment) => !hasLinkedAuthorAcknowledgement(comment, issueComments, prAuthor))
    .map((comment) => ({
      id: comment.id,
      url: comment.html_url,
      author: comment.user?.login ?? "reviewer",
    }));

  const report = {
    pr: prNumber,
    repo: repoNameWithOwner,
    author: prAuthor,
    unresolvedThreads,
    unacknowledgedTopLevelComments,
  };

  if (args.mode === "gate") {
    if (unresolvedThreads.length > 0) {
      console.error(
        `BLOCKED: ${unresolvedThreads.length} unresolved review thread(s) remain on PR #${prNumber}.`,
      );
      for (const thread of unresolvedThreads) {
        console.error(`  ${thread.author} on ${thread.path} — ${thread.url}`);
      }
      console.error("");
      console.error("Resolve every review thread before merging. Reply-only is not enough.");
      process.exit(2);
    }

    if (unacknowledgedTopLevelComments.length > 0) {
      console.error(
        `BLOCKED: ${unacknowledgedTopLevelComments.length} actionable top-level PR comment(s) still lack a later author acknowledgment on PR #${prNumber}.`,
      );
      for (const comment of unacknowledgedTopLevelComments) {
        console.error(`  ${comment.author} — ${comment.url}`);
      }
      console.error("");
      console.error(
        "Reply in the PR conversation with the fix or linked follow-up issue before merging.",
      );
      process.exit(3);
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
