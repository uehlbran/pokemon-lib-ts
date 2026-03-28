# Issue Closing Syntax

**One keyword per issue. One issue per line.**

```
Closes #50
Closes #80
Closes #85
```

Wrong (GitHub only closes the first):
```
Closes #50, #80, #85
Closes #50 #80 #85
Closes: #50, #80
```

If no related issue exists, use `Closes: N/A` — the `check-issue-link` CI workflow
requires either a valid closing reference or this marker.
