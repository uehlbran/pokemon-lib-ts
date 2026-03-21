# Issue Linking (Required Before PR Creation)

## Before Using `Closes: N/A`

Agents MUST search for related open issues before declaring no issue exists. Run at least
two searches using keywords from the PR title and branch name:

```bash
gh issue list --state open --search "KEYWORD1" --limit 10
gh issue list --state open --search "KEYWORD2" --limit 10
```

Only use `Closes: N/A` if both searches return no matching issue.

## When a Related Issue Exists

Link it with one keyword per issue, one per line:

```
Closes #50
Closes #80
```

Never `Closes #50, #80` — GitHub only auto-closes the first issue.
See `.claude/rules/issue-closing-syntax.md` for full syntax rules.

## The babysit-pr skill handles this automatically

Step 3a of `/babysit-pr` searches for related issues and adds closing keywords to the PR body.
This is another reason to always use `/babysit-pr` for PR lifecycle management.

## Why This Matters

PRs that use `Closes: N/A` when a related issue exists leave tracked bugs open after merge.
The `verify-issue-closures.yml` workflow catches this post-merge and posts an alert, but
the damage is already done — the issue stays open and may be re-implemented or cause confusion.
