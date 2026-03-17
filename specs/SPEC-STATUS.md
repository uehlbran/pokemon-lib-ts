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
| `battle/04-gen3.md` | **VERIFIED** | v2.1, decomp audit 2026-03-16. Priority table fixed via pokeemerald: Magic Coat/Snatch moved +3→+4, Follow Me added at +3, Avalanche removed (Gen 4 only). Multi-hit distribution verified correct (37.5/37.5/12.5/12.5) with decomp citation. Stats, types, damage, crits, abilities, status, weather, items, hazards all verified correct. 5 open items remain (damage modifier order, end-of-turn order, EXP formula, high-crit list, doubles faint timing). |
| `battle/05-gen4.md` | **VERIFIED** | v1.1, decomp audit 2026-03-16. 6 Fairy refs removed from type chart. Steel SE column corrected. Priority table fixed: Counter/Mirror Coat -6→-5, Avalanche/Revenge -5→-4, Whirlpool removed (priority 0). Iron Fist punch list replaced with decomp-verified 15 moves. Protect cap corrected to 12.5% (not 1/256). Stats, crits, multi-hit, hazards, weather all verified correct. Remaining open: damage modifier order, end-of-turn order, Tailwind duration, Encore duration. |
| `battle/06-gen5.md` | **VERIFIED** | v2.1, Showdown audit 2026-03-16. Multi-hit distribution corrected to 35/35/15/15 (Gen 5 changed from Gen 4's 37.5/37.5/12.5/12.5). Counter/Mirror Coat priority fixed -6→-5. Protect consecutive rate no longer caps at 12.5% like Gen 4 — continues decaying to 1/256. All Fairy references removed, enum violations fixed. Paralysis ×0.5, sleep 1–3 turns, Explosion nerf, ExtremeSpeed +2, crit 2.0x, weather damage 1/16, indefinite ability weather. 41 new abilities documented. Burn 1/8, confusion 50% verified via Showdown mod inheritance chain (gen5→gen6→base). |
| `battle/07-gen6.md` | UNVERIFIED | Powder move list errors (Powder Snow is not a powder move; Cotton Guard/Worry Seed are not powder moves). Smooth Rock listed under wrong weather. Self-flagged errors need cleanup. |
| `battle/08-gen7.md` | UNVERIFIED | Cleanest of the unverified specs. No critical errors found in initial review. Still needs full audit before implementation. |
| `battle/09-gen8.md` | UNVERIFIED | **CRITICAL ERRORS**: Max Move secondary effects table ~80% wrong. Dynamax HP formula uses +5 instead of +10. |
| `battle/10-gen9.md` | UNVERIFIED | Enum style issues (WeatherType, BattleGimmick use ALL_CAPS). Capitalized string literals. |

---

## Code Bugs Found During Audits

Bugs found during spec audits are tracked as GitHub issues. See the full list:

**[`gh issue list --label bug`](https://github.com/uehlbran/pokemon-lib-ts/issues?q=is%3Aissue+is%3Aopen+label%3Abug)**

Key open issues from the initial audit (filed 2026-03-15):

| Issue | Severity | Description |
|-------|----------|-------------|
| [#51](https://github.com/uehlbran/pokemon-lib-ts/issues/51) | HIGH | Leech Seed hardcoded `maxHp/8` — wrong for Gen 1, should delegate |
| [#54](https://github.com/uehlbran/pokemon-lib-ts/issues/54) | HIGH | Gen 1 `getEndOfTurnOrder()` missing `"leech-seed"` — never triggers |
| [#55](https://github.com/uehlbran/pokemon-lib-ts/issues/55) | HIGH | Gen 1 type effectiveness uses combined float multiplier instead of sequential |
| [#52](https://github.com/uehlbran/pokemon-lib-ts/issues/52) | MEDIUM | Curse damage hardcoded in engine — should delegate |
| [#53](https://github.com/uehlbran/pokemon-lib-ts/issues/53) | MEDIUM | Nightmare damage hardcoded in engine — should delegate |

---

## Oracle Hierarchy (Ground Truth Sources)

When spec values conflict between sources, resolve using this priority order:

**Gen 1**: pokered decomp (ASM) > Showdown `data/mods/gen1/` > Bulbapedia
**Gen 2**: pokecrystal decomp (ASM) > Showdown `data/mods/gen2/` > Bulbapedia
**Gen 3**: pokeemerald decomp (C) or pokefirered decomp (C) > Showdown `data/mods/gen3/` > Bulbapedia
**Gen 4**: pokeplatinum decomp (C, WIP) + pokeheartgold decomp (ASM, WIP) > Showdown `data/mods/gen4/` > Bulbapedia
**Gen 5+**: Showdown source > Bulbapedia

Decomps are authoritative because they are literal decompilations of the original game ROMs. Showdown sometimes simplifies or gets details wrong (e.g., Gen 2 freeze thaw — Showdown has no random thaw, but pokecrystal has 10% per turn).

### Available Reference Sources on Disk

All located under `reference/`:

| Source | Path | Gen | Language | Status |
|--------|------|-----|----------|--------|
| **pokered** | `reference/pokered/` | 1 | ASM | Complete |
| **pokecrystal** | `reference/pokecrystal-master/` | 2 | ASM | Complete |
| **pokeemerald** | `reference/pokeemerald-master/` | 3 | C | Complete |
| **pokefirered** | `reference/pokefirered-master/` | 3 (FRLG) | C | Complete |
| **pokeheartgold** | `reference/pokeheartgold-master/` | 4 (HGSS) | ASM | WIP |
| **pokeplatinum** | `reference/pokeplatinum-main/` | 4 (Pt) | C | WIP |
| **Pokemon Showdown** | `reference/pokemon-showdown/` | All | TypeScript | Complete |

**Key files in decomps for battle mechanics:**
- pokered: `engine/battle/core.asm`, `engine/battle/effects.asm`
- pokecrystal: `engine/battle/core.asm`, `engine/battle/effect_commands.asm`
- pokeemerald/pokefirered: `src/battle_util.c`, `src/battle_script_commands.c`, `src/battle_main.c`
- Showdown: `data/conditions.ts`, `data/mods/genN/`, `sim/battle-actions.ts`

### Known Showdown vs Decomp Discrepancies

| Mechanic | Showdown says | Decomp says | Winner |
|----------|--------------|-------------|--------|
| Gen 2 freeze thaw | No random thaw (`data/mods/gen2/conditions.ts` overrides `onBeforeMove` with no RNG check) | 25/256 (~9.77%) per turn (pokecrystal `core.asm:1543`: `cp 10 percent` where `10 percent` = 25) | **Decomp** |

---

## How To Use This Document

**Starting a new generation?** Check the relevant spec's status:
1. VERIFIED → safe to implement; still cross-check any formula you're unsure about
2. IMPLEMENTED → code is authoritative; spec may have gaps
3. UNVERIFIED → read the "Known Spec Issues" section in the spec file first; audit formulas before implementing

**Checking a specific mechanic?** Use the oracle hierarchy above to determine which source to trust. For Gen 1-3, always check the decomps first.

**Found a new spec error?** Update the spec file's "Known Spec Issues" table and note it in this index.

**Fixed a code bug?** Close the GitHub issue in the PR with `Closes #N` in the PR body.
