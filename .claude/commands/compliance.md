# /compliance

Run the cartridge compliance suite and report changes.

## Steps

1. Run `npm run compliance` from the repo root
2. Read `tools/oracle-validation/results/fast-path.json` for all implemented gens
3. Compare current results against baseline (committed results files on origin/main)
   - Regression: passed count decreased OR new failures → flag as CRITICAL
   - Improvement: passed count increased without new failures → note as IMPROVEMENT
   - New disagreement: moved from FAILED to KNOWN → flag as NEW DISAGREEMENT
   - Stale disagreement: our value now matches oracle → flag for cleanup
4. Report per gen:
   "Gen 1: COMPLIANT (130/130 damage, 225/225 types, 15/15 replays, 8/8 traces)"
   "Gen 7: 2 NEW FAILURES in gimmicks suite — Z-Move power table mismatch"
5. If any regressions, list specific failing test IDs and values
6. Recommend: fix regressions before creating PR

## When to Run

- Before any PR touching `packages/`
- After fixing oracle-related issues
- Whenever you want to check overall compliance status
