# PR Review Pipeline Spec

## Overview

This repo is local-first. Authoritative verification starts with the full local gate
`npm run verify:local`. `npm run test` is the real package suite, `npm run test:slow` is
reserved for manual heavy smoke coverage, and `replay:*` commands remain targeted tools that run
only when relevant. Then `/review` runs before opening a PR. Hosted GitHub Actions and Qodo are
advisory only and are not relied on as the verification gate.

## Required Local Flow

1. Start from an up-to-date local branch based on `origin/main`.
2. Run `npm run verify:local`.
3. Execute `replay:*` commands explicitly when replay validation or simulation confidence checks are relevant.
4. Invoke `npm run test:slow` manually when broad smoke coverage is warranted.
5. Trigger `/review` to start the local Falcon, Kestrel, and Sentinel review.
6. Push and open PR with `gh pr create`.

## Reviewers

| Reviewer | Type | Role |
|---|---|---|
| CodeRabbit | GitHub App | Advisory inline comments and summaries |
| Claude Code (local) | `/review` skill (falcon + kestrel + sentinel) | Required local review gate |
| Qodo PR-Agent | Legacy hosted GitHub Action | Advisory only; not relied on for verification |
| Brandon | Human | Final approval |

## Notes

- `/review` is the mandatory local review gate. Do not skip it.
- Do not treat hosted Qodo or other GitHub Action output as the source of truth.
