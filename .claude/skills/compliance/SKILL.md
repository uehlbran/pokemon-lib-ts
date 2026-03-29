---
name: compliance
description: Run the oracle compliance validation suite against the engine. Executes the oracle fast-path (all suites: data, stats, groundTruth, damage, mechanics, terrain, gimmicks) and reports failures, known-disagreements, and stale entries. Use when verifying a gen implementation is cartridge-accurate, after merging gen data changes, or when investigating a reported oracle failure.
---

# Compliance Oracle

Run the oracle validation suite and report results.

## Step 1: Determine scope

Parse the arguments (if any):
- `gen:<N>` — filter to a specific generation (e.g. `gen:4`)
- `suite:<name>` — filter to a specific suite (e.g. `suite:groundTruth`)
- no args — run all suites (default fast-path; runner defaults to the "fast" suite alias)

## Step 2: Build the command

Base command: `npm run oracle:fast` from the repo root.

If a `--gen N` filter is requested:
```bash
npx tsx tools/oracle-validation/src/runner.ts --gen N
```

If a `--suite NAME` filter is requested:
```bash
npx tsx tools/oracle-validation/src/runner.ts --suite NAME
```

Both filters can be combined:
```bash
npx tsx tools/oracle-validation/src/runner.ts --gen 4 --suite groundTruth
```

## Step 3: Run and report

Execute the command. The runner outputs a formatted summary to stdout and writes `tools/oracle-validation/results/fast-path.json`.

Report to the user:
- Overall pass/fail status
- Any suite failures (with failure messages)
- Any stale known-disagreements (entries that no longer match any oracle check)
- Any matched known-disagreements (expected deviations confirmed)
- Skip reasons for skipped suites

## Step 4: On failures

If there are failures:
1. Show the failure messages verbatim
2. Identify which suite/gen is affected
3. Check if there is a matching entry in `tools/oracle-validation/data/known-disagreements/genN-known-disagreements.json`
4. If the failure is a known cartridge-vs-oracle deviation, suggest adding it to the known-disagreements registry
5. If the failure indicates a real engine bug, suggest filing a GitHub issue with label `bug,found-by/oracle`

## Step 5: On stale disagreements

If any stale disagreements are reported (known-disagreement entries that no longer match any oracle check):
- Read the stale entry from the registry file
- Check if the underlying mechanic was fixed (the oracle now agrees with us)
- If fixed: suggest removing the stale entry from the registry
- If still divergent: investigate why the oracle check no longer fires
