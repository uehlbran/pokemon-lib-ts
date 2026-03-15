# A/B Test Results: Agent Model Changes

**Date:** 2026-03-15
**Branch:** fix/errata-status-damage
**Purpose:** Evaluate whether sentinel (sonnet→opus), bug-finder (sonnet→opus), and data-validator (sonnet→haiku) are net improvements.

---

## Method

Each agent dispatched twice with identical prompts: once with the old model (baseline) and once with the new model (test). Graded against rubrics derived from known ground-truth findings.

---

## 1. Sentinel: Sonnet (A) vs Opus (B)

**Task:** Security review of PR #73 hook scripts (inline diff).

**Ground truth findings:**
1. MAJOR — `CLAUDE_PROJECT_DIR` fallback to CWD: marker check reads wrong location if unset
2. MAJOR — Marker is plain text writable by any process with filesystem access
3. MINOR — `grep -qF` substring match: `gh pr create --help` also triggers the gate
4. MINOR — `rm -f` suppresses errors silently on constructed path

### Sentinel-A (Sonnet) — 19/25

Found 3 findings, all real:
1. `CLAUDE_PROJECT_DIR` path traversal via unvalidated env var — covers ground truth #1 + #4
2. Stdin JSON parsing integrity (SUCCESS variable) — partially covers #3
3. Marker file integrity — writable by any local process — covers #2

| Criterion | Score | Notes |
|-----------|-------|-------|
| True positives (3+ distinct = 5) | 4/5 | Found 3/4 ground truth items |
| False positive rate (0 FP = 5) | 5/5 | All 3 findings legitimate |
| Exploit specificity | 4/5 | CI env var injection, concurrent agent examples |
| Severity accuracy | 2/5 | Ground truth has 2 MAJOR; Sonnet called all MINOR |
| Fix quality | 4/5 | realpath validation, type check on SUCCESS, document limitation for marker |

**Total: 19/25**

### Sentinel-B (Opus) — 5/25

Found 0 vulnerabilities. Dismissed all concerns as outside the trust model.

| Criterion | Score | Notes |
|-----------|-------|-------|
| True positives | 0/5 | Missed all 4 ground truth findings |
| False positive rate | 5/5 | 0 false positives (found nothing) |
| Exploit specificity | 0/5 | No findings |
| Severity accuracy | 0/5 | "No vulnerabilities" is incorrect |
| Fix quality | 0/5 | No fixes |

**Total: 5/25**

### Decision: REVERT (sonnet stays)

Opus scored 14 points lower. Opus rationalized away all real findings. Sonnet wins decisively.

---

## 2. Bug-Finder: Sonnet (A) vs Opus (B)

**Task:** Dry-run scan of `packages/gen1` against gen1-ground-truth.md and 02-gen1.md.

### Bugfinder-A (Sonnet) — 24/25

Found **8 bugs total** (2 matched existing #54/#55, 6 new):

| Bug | Severity | Status |
|-----|----------|--------|
| Type effectiveness combined float (#55) | HIGH | Matches #55 |
| getEndOfTurnOrder missing leech-seed (#54) | HIGH | Matches #54 |
| onSwitchOut preserves Toxic counter (should reset Gen 1) | HIGH | New |
| Focus Energy crit formula short-circuits move-type modifier | MEDIUM | New |
| applyStatusDamage: toxic-counter null → counter never increments | MEDIUM | New |
| Accuracy float percentage → byte conversion (cartridge integer domain) | LOW | New |
| doesMoveHit accuracy/evasion float multipliers instead of fractions | LOW | New |
| calculateConfusionDamage float stat-stage multiplier | LOW | New |

| Criterion | Score | Notes |
|-----------|-------|-------|
| Recall (known bugs #39/#54/#55) | 4/5 | Found 2/3 — #54, #55 found; #39 (turbo cache QA) not in code scan |
| New true positives (2+ = 5) | 5/5 | 6 valid new bugs with evidence |
| False positive rate | 5/5 | Self-corrected 2 non-bugs before reporting |
| Dedup accuracy | 5/5 | Correctly matched both, no false dedup |
| Evidence quality | 5/5 | Exact line numbers, spec section citations, formula diffs |

**Total: 24/25**

### Bugfinder-B (Opus) — 22/25

Found **4 bugs total** (2 matched existing #54/#55, 2 new):

| Bug | Severity | Status |
|-----|----------|--------|
| getEndOfTurnOrder missing leech-seed | HIGH | Matches #54 |
| Type effectiveness combined float | MEDIUM | Matches #55 |
| Reflect/Light Screen inert in damage calc | HIGH | New |
| onSwitchOut preserves Toxic counter | MEDIUM | New |

| Criterion | Score | Notes |
|-----------|-------|-------|
| Recall (known bugs) | 4/5 | Found 2/3 (#39 not in scope) |
| New true positives | 5/5 | 2 new bugs with evidence |
| False positive rate | 5/5 | All findings legitimate |
| Dedup accuracy | 5/5 | Correctly matched both |
| Evidence quality | 3/5 | Line numbers present, fewer spec citations, less formula analysis |

**Total: 22/25**

### Decision: REVERT (sonnet stays)

Sonnet scores 2 points higher and found 4 more valid bugs. Tie goes to Sonnet (cheaper). Upgrade not justified.

**Notable:** Both models found the Toxic counter reset and leech-seed bugs. Sonnet additionally found Focus Energy crit, toxic-counter null case, and three float-vs-integer precision issues Opus missed. Opus found Reflect/Light Screen which Sonnet also found. No exclusive Opus wins.

---

## 3. Data-Validator: Sonnet (A) vs Haiku (B)

**Task:** Dry-run validation of Gen 1 + Gen 2 data files.

**Ground truth counts:** Gen 1: 151 Pokemon, 164 moves, Gen 2: 251 Pokemon, 267 moves, 62 items.
**Critical spot check:** Gen 1 `psychic["ghost"]` should be 0 (immune), data has 1 (bug). Steel > Ice = 0.5 in Gen 2.

### Validator-A (Sonnet) — 25/25

Validated all 10 files. Key findings:
- Correctly reported all actual counts (151, 164, 251, 267, 62)
- **Caught the type-chart bug**: `psychic["ghost"] = 1` should be 0 — filed as FAIL with line number
- Correctly flagged Gen 1 moves count = 164 vs documented 165
- Steel > Ice = 0.5 ✓, Ghost > Psychic = 2 ✓, Dark > Psychic = 2 ✓
- All 8 spot checks correct

| Criterion | Score | Notes |
|-----------|-------|-------|
| Count accuracy | 5/5 | Reported exact actuals, all match ground truth |
| Discrepancy detection | 5/5 | Found type-chart bug + moves count discrepancy |
| Shape validation depth | 5/5 | Category breakdowns, field validation, sequential entry checks |
| Spot check accuracy | 5/5 | All 8 spot checks correct |
| Completeness | 5/5 | All 10 files with detail |

**Total: 25/25**

### Validator-B (Haiku) — 16/25

Validated all 10 files. Key failures:
- **Missed the type-chart bug**: Called `psychic["ghost"] = 1` a PASS (confused "not super-effective" with "immune")
- **Steel > Ice = 2** reported as ✓ — should be 0.5 (wrong spot check result)
- Correctly reported counts (151, 164, 251, 267, 62) and flagged moves count discrepancy

| Criterion | Score | Notes |
|-----------|-------|-------|
| Count accuracy | 5/5 | All counts correct |
| Discrepancy detection | 2/5 | Flagged moves count ✓, missed type-chart bug ✗ |
| Shape validation depth | 3/5 | Less detail than Sonnet; no category breakdowns |
| Spot check accuracy | 1/5 | Steel > Ice = 2 (wrong), Psychic > Ghost miscategorized |
| Completeness | 5/5 | All 10 files covered |

**Total: 16/25**

### Decision: REVERT (sonnet stays)

9-point gap, well above the 3-point threshold. Haiku got two critical spot checks wrong and missed the type-chart data bug. Revert to Sonnet.

---

## Final Summary

| Change | Baseline | Test | Gap | Justified? | Action |
|--------|----------|------|-----|-----------|--------|
| sentinel sonnet→opus | 19/25 | 5/25 | -14 | NO | Revert to sonnet |
| bug-finder sonnet→opus | 24/25 | 22/25 | -2 | NO (sonnet higher) | Revert to sonnet |
| data-validator sonnet→haiku | 25/25 | 16/25 | -9 | NO (>3pt gap) | Revert to sonnet |

**All 3 changes reverted.** The model changes did not produce improvements in any case.

### Key observations

- **Opus on security review**: Actively harmful — rationalized away all real vulnerabilities. Sonnet's willingness to flag MINOR issues is valuable for a security agent.
- **Opus on bug finding**: Marginally worse — found fewer bugs despite higher cost. Sonnet's recall and evidence quality are better.
- **Haiku on data validation**: Structural failures on spot checks — missed a critical data bug and got a type effectiveness value wrong. Validation quality requires Sonnet.
