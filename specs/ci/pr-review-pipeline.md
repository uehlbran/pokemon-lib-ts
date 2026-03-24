# PR Review Pipeline Spec

## Overview

This repo is local-first. Authoritative verification starts with the full local gate
`npm run verify:local`, with `npm run test:medium` available for replay/simulation confidence
checks and `npm run test:slow` reserved for manual heavy smoke coverage. `npm run test:fast` is
the default fast test loop, and `npm run test` runs all test tiers. Then `/review` and
`git pushreview` happen when a PR is pushed. Hosted GitHub Actions and Qodo are advisory only
and are not relied on as the verification gate.

## Required Local Flow

1. Start in a fresh task-owned worktree from `origin/main`.
2. Run `npm run verify:local`.
3. Run `npm run test:medium` when replay/simulation confidence checks are relevant.
4. Run `npm run test:slow` manually when broad smoke coverage is warranted.
5. Run `/review` to trigger the local Falcon, Kestrel, and Sentinel review.
6. Push with `git pushreview` so Claude posts review comments if a PR exists.

## Reviewers

| Reviewer | Type | Role |
|---|---|---|
| CodeRabbit | GitHub App | Advisory inline comments and summaries |
| Claude Code (local) | Custom subagent + git hook | Required local review and PR comments via `git pushreview` |
| Qodo PR-Agent | Legacy hosted GitHub Action | Advisory only; not relied on for verification |
| Brandon | Human | Final approval |

## Notes

- Keep `/review` and `git pushreview` in the workflow.
- Do not treat hosted Qodo or other GitHub Action output as the source of truth.
