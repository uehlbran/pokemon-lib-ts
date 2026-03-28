# Issue Linking

Before using `Closes: N/A`, search with at least 2 keyword sets:
```bash
gh issue list --state open --search "KEYWORD1" --limit 10
gh issue list --state open --search "KEYWORD2" --limit 10
```

Only use `Closes: N/A` if no matching issue is found.

When linking, use one keyword per issue per line (see `issue-closing-syntax.md`):
```
Closes #50
Closes #80
```

This applies to both `gh pr create` and manual PR edits.
