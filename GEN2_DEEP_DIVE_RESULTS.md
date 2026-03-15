# Gen 2 Deep-Dive Correctness Audit Results

**Branch:** `fix/gen2-correctness-audit`
**Date:** 2026-03-15
**Auditor:** Claude Code (Sonnet 4.6) via subagent-driven development

---

## Summary

| Category | Count |
|----------|-------|
| Spec issues fixed | 32 |
| Code bugs fixed | 3 |
| Data bugs fixed (bonus) | 2 |
| Tests added | 70 |
| Tests passing (before audit) | 327 |
| Tests passing (after audit) | 397 |

---

## All 32 Spec Issues — Resolution Table

| # | Severity | Description | Resolution |
|---|----------|-------------|------------|
| 1 | CRITICAL | Stat formula wrong (missing sqrt for StatExp, wrong order of operations) | Fixed in spec |
| 2 | CRITICAL | HP formula constant +5 instead of +10 | Fixed in spec |
| 3 | CRITICAL | Freeze thaw chance 20% instead of 25/256 (~9.77%) | Fixed in spec |
| 4 | CRITICAL | Poison type listed as Special (it's Physical in Gen 2) | Fixed in spec |
| 5 | CRITICAL | Leech Seed missing from end-of-turn (spec falsely said "not in Gen 2") | Fixed in spec + code EOT order |
| 6 | CRITICAL | Leftovers timing wrong — was after status damage, must be before | Fixed in spec + code EOT order |
| 7 | CRITICAL | Damage formula missing Math.floor() at intermediate steps | Fixed in spec |
| 8 | CRITICAL | Random factor uses 85..100/100 instead of 217..255/255 | Fixed in spec |
| 9 | MAJOR | Crit thresholds approximate (1/16, 1/8, 1/4, 1/2) — exact values differ | Fixed in spec |
| 10 | MAJOR | Crit stat interaction not documented (conditional stage behavior) | Fixed in spec |
| 11 | MAJOR | Sleep wake turn not documented (Pokemon CAN act on wake turn in Gen 2) | Fixed in spec |
| 12 | MAJOR | Type chart had Fairy type references (Gen 6+, doesn't exist in Gen 2) | Fixed in spec |
| 13 | MAJOR | Steel weaknesses wrong (Water/Electric listed, neither is correct) | Fixed in spec + data (2 data bugs) |
| 14 | MAJOR | Type-boosting items multiplier +20% instead of +10% (1.1x) | Fixed in spec |
| 15 | MAJOR | Wrong berry names throughout (Gen 3+ names used) | Fixed in spec |
| 16 | MAJOR | Stat boost berries listed (Pomeg/Kelpsy etc.) — Gen 3+ items | Fixed in spec |
| 17 | MAJOR | Burn applied as post-modifier instead of halving Attack before formula | Fixed in spec |
| 18 | MAJOR | Protect formula "50% on second use" instead of "1/3^n" | Fixed in spec |
| 19 | MAJOR | Trapping moves not updated for Gen 2 nerfs | Fixed in spec |
| 20 | MAJOR | Thunder/SolarBeam weather interactions missing | Fixed in spec |
| 21 | MAJOR | Reflect/Light Screen duration not documented (5 turns in Gen 2) | Fixed in spec |
| 22 | MAJOR | OHKO mechanics use Speed comparison, should use level comparison | Fixed in spec |
| 23 | MINOR | Wake-Up Slap referenced (Gen 4 move, doesn't exist in Gen 2) | Fixed in spec |
| 24 | MINOR | Assault Vest referenced (Gen 6+ item) | Fixed in spec |
| 25 | MINOR | Shiny DV algorithm vague ("use Bulbapedia") | Fixed in spec — exact DV requirements added |
| 26 | MINOR | Nightmare and Curse mechanics missing from end-of-turn | Fixed in spec |
| 27 | MINOR | Baton Pass section described Pursuit instead | Fixed in spec — full pass list added |
| 28 | MINOR | Counter behavior wrong — Gen 2 reflects any physical-type move | Fixed in spec |
| 29 | MINOR | HP DV derivation not documented | Fixed in spec |
| 30 | MINOR | Breeding DV inheritance wrong (random per stat) | Fixed in spec |
| 31 | MINOR | Pokérus described as +50% EXP instead of 2x stat experience | Fixed in spec |
| 32 | MINOR | Sandstorm in wrong EOT position (Step 1 instead of Step 9) | Fixed in spec + code EOT order |

---

## Code Bugs Fixed

### Bug 1: End-of-Turn Order Wrong
**File:** `packages/gen2/src/Gen2Ruleset.ts` (lines 894-911)
**Severity:** CONFIRMED

| Old Order (Wrong) | Correct Order |
|-------------------|---------------|
| future-attack | future-attack |
| **weather-damage** ← wrong position | **leftovers** ← now first |
| leftovers | status-damage |
| leech-seed | leech-seed |
| bind | nightmare |
| status-damage | curse |
| nightmare | bind |
| curse | **weather-damage** ← now after curse |
| perish-song | perish-song |
| weather-countdown | screen-countdown |
| screen-countdown | weather-countdown |

Three misplacements corrected:
- Leftovers must come before burn/poison damage (competitive significance at low HP)
- Status damage must come before leech seed
- Sandstorm/weather damage must come after Curse

**Commit:** `cd613bd`

---

### Bug 2: Electric Paralysis Immunity (Wrong Generation)
**File:** `packages/gen2/src/Gen2Status.ts` (lines 13-19)
**Severity:** CONFIRMED

`paralysis: ["electric"]` removed from `STATUS_IMMUNITIES`. Electric types are NOT immune to paralysis in Gen 2 — this immunity was introduced in Gen 6. The JSDoc comment incorrectly claimed it was "new in Gen 2."

**Commit:** `cd613bd`

---

### Bug 3: Sleep Duration Range Off by One
**File:** `packages/gen2/src/Gen2Ruleset.ts` (line 626)
**Severity:** CONFIRMED

`rng.int(1, 6)` → `rng.int(1, 7)`. Gen 2 sleep lasts 1-7 turns, not 1-6. Confirmed by Showdown Gen 2 implementation.

**Commit:** `cd613bd`

---

## Data Bugs Fixed (Bonus Finds)

The type chart tests caught two incorrect entries in `packages/gen2/data/type-chart.json`:

| Matchup | Old Value | Correct Value |
|---------|-----------|---------------|
| Water → Steel | 1x | 0.5x |
| Electric → Steel | 1x | 0.5x |

These match Issue #13 (Steel weaknesses) — Water and Electric do NOT hit Steel for super-effective damage. The spec was wrong, and so was the data. The test suite caught both.

**Commit:** `2ebcb47`

---

## VERIFY Items

### Struggle Recoil
**File:** `packages/gen2/src/Gen2Ruleset.ts` (line 853-855)
**Ground truth:** Marked VERIFY (unclear whether 1/2 damage dealt or 1/4 max HP)
**Resolution:** Code kept as `Math.floor(damageDealt / 2)` — this is correct for Gen 2.

Reasoning: In Gen 1, Struggle recoil = 1/2 damage dealt. Gen 2 kept this behavior. The change to 1/4 max HP happened in Gen 4, not Gen 2. Comment updated to clarify: *"Gen 2: recoil = 1/2 of damage dealt (same as Gen 1; changed to 1/4 max HP in Gen 4)"*.

---

## New Test Coverage

### Tests Added by File

| File | Tests Before | Tests Added | Tests After | Coverage |
|------|-------------|-------------|-------------|----------|
| `tests/stat-calc.test.ts` | 11 | 11 | 22 | 10 Pokemon at L100 max + Pikachu L50 zero StatExp |
| `tests/type-chart.test.ts` | 13 | 45 | 58 | Steel (17) + Dark (17) + Gen1→Gen2 changes (4) + immunities (7) |
| `tests/crit-calc.test.ts` | 14 | 6 | 20 | Statistical trials at stages 0-3, Focus Energy/high-crit stage checks |
| `tests/status.test.ts` | 28 | 8 | 36 | Freeze thaw stat, burn damage, type immunities, no-double-status |
| `tests/ruleset.test.ts` | 102 | 0 | 102 | EOT order updated to strict `toEqual`, sleep duration to 1-7 |

**Total new tests: 70**
**Total suite: 397 tests (up from 327)**

### Coverage Details

**Stat calc (11 new):**
- Tyranitar, Mewtwo, Snorlax, Blissey, Lugia, Ho-Oh, Espeon, Umbreon, Scizor, Heracross — all at L100 with max DVs/StatExp
- Pikachu at L50 with max DVs and zero StatExp (exercises the zero-StatExp code path)

**Type chart (45 new):**
- All 17 attacking types vs Steel — covers every possible matchup including Poison immunity (0x)
- All 17 attacking types vs Dark — covers Fighting weakness, Psychic immunity, Ghost/Dark resistance
- Gen 1→Gen 2 changes: Ghost/Psychic (0x bug→2x fix), Bug/Poison (2x→0.5x), Poison/Bug (2x→1x), Ice/Fire (1x→0.5x)
- All 7 Gen 2 type immunities verified

**Crit rate (6 new):**
- Stage 0 (~6.64%): 10,000 trials, expect 5.14%–8.14%
- Stage 1 high-crit move (~12.5%): 10,000 trials, expect 11%–14%
- Stage 2 Focus Energy + high-crit (~25%): 10,000 trials, expect 23.5%–26.5%
- Stage 3 max stacking (~33.2%): 10,000 trials, expect 31.2%–35.2%
- Focus Energy gives `getGen2CritStage` = 1 (not 5 — confirms Gen 1 bug fixed)
- High crit move gives `getGen2CritStage` = 1

**Status mechanics (8 new):**
- Freeze thaw: 10,000 trials at 25/256 (~9.77%), expect 7.77%–11.77%
- Burn damage: 1/8 max HP (200 HP → 25 damage)
- Burn damage minimum 1 (1 HP Pokemon)
- Electric can be burned (not immune)
- Fire immune to burn
- Ice immune to freeze
- Steel immune to poison
- Already-statused Pokemon cannot receive second status

---

## Commit History

| Commit | Message | Phase |
|--------|---------|-------|
| `c4f967d` | fix(gen2): correct 32 spec issues in 03-gen2.md | Phase 1 |
| `cd613bd` | fix(gen2): remove incorrect Electric paralysis immunity | Phase 2/3 (also contains EOT order, sleep duration, Struggle recoil comment) |
| `636217a` | test(gen2): add expanded stat calc tests for 10 Pokemon | Phase 3 |
| `a9d7937` | test(gen2): add comprehensive status mechanics tests | Phase 3 |
| `2ebcb47` | test(gen2): add full type chart verification for Steel/Dark matchups and Gen 1 changes | Phase 3 |
| `ed5cb3c` | test(gen2): add statistical crit rate tests with 10000+ trials | Phase 3 |

---

## Verification

```
Tests:     397 passed (397) — all green
Lint:      No new issues (1 pre-existing warning in packages/battle, not introduced here)
Typecheck: Passing
```

---

## Remaining Work

None identified. All 32 spec issues corrected, all confirmed code bugs fixed, VERIFY item resolved, test coverage expanded by 70 tests.

The 2 data bugs in `type-chart.json` (Water→Steel, Electric→Steel) were bonus finds from the type chart test suite and have been fixed.
