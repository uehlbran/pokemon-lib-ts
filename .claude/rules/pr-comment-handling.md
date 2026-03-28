# PR Comment Handling

## Merge Gate

Every review thread must be **replied to AND resolved** before merge. Replying alone is
not sufficient — the thread must be marked resolved on GitHub.

After creating a PR, monitor review comments until merge or close.

## How to Resolve a Thread (REQUIRED AFTER EVERY REPLY)

Replying does NOT resolve the thread. After every reply, call the GraphQL mutation:

```bash
# 1. Get thread node IDs and resolved status
gh api graphql -f query='
{
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 50) {
        nodes { id isResolved comments(first: 1) { nodes { body } } }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | {id, isResolved, preview: .comments.nodes[0].body[:60]}'

# 2. Resolve each unresolved thread
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "PRRT_..."}) {
    thread { isResolved }
  }
}'

# 3. Confirm all resolved (must return empty)
gh api graphql -f query='...' --jq '... | select(.isResolved == false) | .id'
```

**Do this immediately after replying — do not batch replies and resolve later.**

## Bug Validation Protocol (REQUIRED)

Before acting on any reviewer-reported bug, **always grep/read the current code first**.
CodeRabbit/Qodo analyze the first commit — later commits may already fix the issue.

- If already fixed: reply citing the fix commit, resolve thread.
- If real and in scope: fix in a new commit, reply citing commit, resolve thread.
- If real but out of scope: file a GitHub issue, reply with issue number, resolve thread.

## Never

- Leave any thread unresolved
- Reply without immediately resolving the thread
- Merge while any thread shows `isResolved: false`
- Assume a reviewer-reported bug is real without checking current code
- Ignore a real bug because it's out of scope — fix it or file an issue
- File a GitHub issue for a bug already fixed in the current code
