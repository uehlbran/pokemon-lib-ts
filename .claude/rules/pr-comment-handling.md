# PR Comment Handling

## Merge Gate

Every review thread must be replied to AND resolved before merge.

## Workflow (Batched)

### Step 1: Fetch all unresolved threads

Use `first: 100`. If a PR has 100+ threads, paginate with `after` cursor.

```bash
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved comments(first: 1) { nodes { body } } }
      }
    }
  }
}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | {id, preview: .comments.nodes[0].body[:80]}]'
```

### Step 2: Process each unresolved thread

For each thread: validate against current code (grep/read), then reply.

- If already fixed: reply citing the fix commit.
- If real and in scope: fix in a new commit, reply citing commit.
- If real but out of scope: file a GitHub issue, reply with issue link.

### Step 3: Batch-resolve all threads

After ALL replies are done, resolve every unresolved thread:

```bash
gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "THREAD_ID"}) { thread { isResolved } } }'
```

### Step 4: Confirm (one query)

```bash
gh api graphql -f query='...' --jq '[... | select(.isResolved == false)] | length'
```

Must return `0`.

## Fixing Review Findings

When review comments identify bugs on an **open** PR:
- Push fix commits to the SAME PR branch
- Do NOT create follow-up fix PRs for an open PR

Follow-up fix PRs are only for bugs found AFTER the original PR is already merged.

## Bug Validation Protocol

Before acting on any reviewer-reported bug, grep/read the current code first.
CodeRabbit/Qodo analyze the first commit -- later commits may already fix the issue.

## Issue Dedup

Only run `gh issue list` searches when actually FILING a new issue, not for every
review comment.

## Never

- Leave any thread unresolved
- Merge while any thread shows `isResolved: false`
- Assume a reviewer-reported bug is real without checking current code
- Create a follow-up fix PR when the original PR is still open
- File a GitHub issue for a bug already fixed in the current code
