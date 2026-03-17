# Issue Closing Syntax

GitHub only auto-closes an issue when the closing keyword (`Closes`, `Fixes`, `Resolves`)
immediately precedes **that specific issue number**. Comma-separated or space-separated lists
after a single keyword only close the first issue — the rest are merely "referenced."

## Required Format

```
Closes #50
Closes #80
Closes #85
```

**One keyword per issue. One issue per line.**

## Wrong Formats (do not use)

```
Closes #50, #80, #85   ← GitHub closes #50 only
Closes #50 #80 #85     ← GitHub closes #50 only
Closes: #50, #80       ← GitHub closes #50 only
```

## No Related Issue

If the PR has no tracked issue, add this to the Related Issue section:

```
Closes: N/A
```

The `check-issue-link` CI workflow requires either a valid closing reference or an explicit
no-issue marker and will block merge otherwise.

## Variants

All three keywords work identically:
- `Closes #N`
- `Fixes #N`
- `Resolves #N`

Case-insensitive: `closes`, `Closes`, `CLOSES` all work.
