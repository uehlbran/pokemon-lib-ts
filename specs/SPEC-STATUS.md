# Spec Status Index

This file is the trust map for all spec documents. It tells you which specs are verified against ground truth, which are implemented but only partially verified, and which are unverified design documents.

**Key rule for agents**: Before implementing a generation's mechanics, check this file. If the spec is UNVERIFIED, cross-check all formulas and mechanic claims against Showdown source or Bulbapedia before coding.

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| **VERIFIED** | Audited against Showdown source code and Bulbapedia. Known errors have been fixed or flagged. Safe to implement from. |
| **IMPLEMENTED** | Code exists and works correctly. Spec may have minor gaps or documentation drift, but implementation is the source of truth. |
| **UNVERIFIED** | Original design document written before implementation. Contains known or suspected errors. Must be audited before implementing. |

---

## Spec Trust Map

| Spec File | Status | Notes |
|-----------|--------|-------|
| `core/00-architecture.md` | IMPLEMENTED | Updated to reflect tsup build, actual turbo.json, real package structure. Code is source of truth for any gaps. |
| `core/01-entities.md` | IMPLEMENTED | Minor gaps: 4 volatile statuses missing (`trapped`, `recharge`, `toxic-counter`, `sleep-counter`). Code is authoritative. |
| `core/02-shared-logic.md` | IMPLEMENTED | 3 known issues: stat verification table uses wrong nature-adjusted values, `getDefaultTypeChart()` renamed to `GEN6_TYPE_CHART`, `CRIT_RATES_GEN2_5` split into `CRIT_RATES_GEN2` + `CRIT_RATES_GEN3_5`. Code is authoritative. |
| `core/03-data-pipeline.md` | IMPLEMENTED | Spec describes a different architecture than what was built. The actual implementation uses `@pkmn/dex` + HTTP PokeAPI, not a local PokeAPI clone. Spec has been rewritten to match reality. |
| `battle/00-architecture.md` | IMPLEMENTED | 16+ methods in `GenerationRuleset` are undocumented. `BattleEngine` constructor is `(config, ruleset, dataManager)` not `(config, dataManager)`. Spec has been updated. |
| `battle/01-core-engine.md` | IMPLEMENTED | Missing 6 sections. End-of-turn delegation pattern documented. Known delegation bugs flagged for separate fix. |
| `battle/02-gen1.md` | **VERIFIED** | v2.0, audited via PR #30. 28 spec fixes, 52 new tests. 2 remaining issues: Focus Energy algorithm and type effectiveness application method. |
| `battle/03-gen2.md` | **VERIFIED** | Audited via PR #29. 32 spec fixes, 70 new tests. 3 remaining issues: sleep duration (1-7 not 1-6), Blizzard not high-crit in Gen 2, item modifiers need documentation. |
| `battle/04-gen3.md` | UNVERIFIED | **CRITICAL ERRORS**: Stat formula completely wrong (missing Base stat). 5 Fairy type references (Fairy doesn't exist until Gen 6). Sandstorm/Hail don't boost move power. See Known Spec Issues section in the file. |
| `battle/05-gen4.md` | UNVERIFIED | 2 Fairy type references in Stealth Rock damage table. Enum style violations (8+ `MoveCategory.Physical` etc.). |
| `battle/06-gen5.md` | UNVERIFIED | Fairy in PokemonType enum. Extensive enum style violations. |
| `battle/07-gen6.md` | UNVERIFIED | Powder move list errors (Powder Snow is not a powder move; Cotton Guard/Worry Seed are not powder moves). Smooth Rock listed under wrong weather. Self-flagged errors need cleanup. |
| `battle/08-gen7.md` | UNVERIFIED | Cleanest of the unverified specs. No critical errors found in initial review. Still needs full audit before implementation. |
| `battle/09-gen8.md` | UNVERIFIED | **CRITICAL ERRORS**: Max Move secondary effects table ~80% wrong. Dynamax HP formula uses +5 instead of +10. |
| `battle/10-gen9.md` | UNVERIFIED | Enum style issues (WeatherType, BattleGimmick use ALL_CAPS). Capitalized string literals. |

---

## Code Bugs Found During Audits

These bugs were found during spec audits but NOT fixed in spec cleanup work. Each requires a separate PR touching `packages/`.

| Bug | File | Line (approx) | Issue | Severity |
|-----|------|----------------|-------|---------|
| Leech Seed hardcoded | `packages/battle/src/engine/BattleEngine.ts` | ~1588 | Hardcodes `maxHp/8`; Gen 1 should be `maxHp/16`. Should delegate to `ruleset.calculateLeechSeedDrain()` | HIGH |
| Curse damage hardcoded | `packages/battle/src/engine/BattleEngine.ts` | ~1658 | Hardcodes `maxHp/4`; should delegate to `ruleset.calculateCurseDamage()` | MEDIUM |
| Nightmare damage hardcoded | `packages/battle/src/engine/BattleEngine.ts` | ~1681 | Hardcodes `maxHp/4`; should delegate to `ruleset.calculateNightmareDamage()` | MEDIUM |
| Gen 1 leech seed missing | `packages/gen1/src/Gen1Ruleset.ts` | ~872 | `getEndOfTurnOrder()` returns only `["status-damage"]`, missing `"leech-seed"` | HIGH |
| Gen 1 type effectiveness | `packages/gen1/src/Gen1DamageCalc.ts` | ~159 | Uses combined float multiplier instead of sequential per-type with floor between | HIGH |

---

## How To Use This Document

**Starting a new generation?** Check the relevant spec's status:
1. VERIFIED → safe to implement; still cross-check any formula you're unsure about
2. IMPLEMENTED → code is authoritative; spec may have gaps
3. UNVERIFIED → read the "Known Spec Issues" section in the spec file first; audit formulas before implementing

**Found a new spec error?** Update the spec file's "Known Spec Issues" table and note it in this index.

**Fixed a code bug from the table above?** Remove or mark it resolved.
