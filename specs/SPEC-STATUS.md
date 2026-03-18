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
| `core/00-architecture.md` | **VERIFIED** | v2.2, code audit 2026-03-17. Re-verified against latest clone (da07d04). Versions synced: core 0.8.0, battle 0.10.0, gen1 0.6.0. Gen3 (0.1.0) added. Composite key removed from core tsconfig example (absent in actual file). ./data subexport added to gen package example. Dependency specifiers `workspace:*` → `*`. |
| `core/01-entities.md` | **VERIFIED** | v1.3, code audit 2026-03-17. Re-verified against latest clone. Added missing VolatileStatus values (`trapped`, `mist`). Added MoveData.critRatio field. Prior corrections confirmed: `SwitchOutEffect.who` → `.target`, `PokemonCreationOptions.teraType`/`dynamaxLevel` optional. 6 spot-checked interfaces all match code. |
| `core/02-shared-logic.md` | **VERIFIED** | v1.4, deep accuracy audit 2026-03-18. Added STAT_STAGE_NUMERATORS/DENOMINATORS integer lookup tables and `applyStatStageInteger()` for gen packages to avoid float drift. Accuracy stage table replaced: now uses pokeemerald `sAccuracyStageRatios` values (33/100, 36/100, ... 300/100), not the simplified `(3+stage)/3` formula. Gen 1 (2-based table) and Gen 2 (pokecrystal table) accuracy differences documented. Prior v1.3: 6 method renames. |
| `core/03-data-pipeline.md` | IMPLEMENTED | Spec describes a different architecture than what was built. The actual implementation uses `@pkmn/dex` + HTTP PokeAPI, not a local PokeAPI clone. Spec has been rewritten to match reality. |
| `battle/00-architecture.md` | **VERIFIED** | v2.1, code audit 2026-03-17. 6 corrections: `TrainerRef` → `TrainerDataRef`, `getValidTypes` → `getAvailableTypes`, EngineWarningEvent added, HazardSetEvent `layers?` field documented, Interface Segregation Pattern noted (15 sub-interfaces compose into GenerationRuleset). All 43+ ruleset methods now documented (16+ undocumented issue resolved). |
| `battle/01-core-engine.md` | **VERIFIED** | v3.2, deep accuracy audit 2026-03-18 (fix/deep-accuracy-audit). 3 engine bugs fixed: (1) switch-in ability results were discarded (Intimidate/Drizzle/etc. had no effect); (2) confusion turn countdown hardcoded — now delegates to `ruleset.getConfusionDuration()`; (3) bound/trap turn countdown hardcoded — now delegates to `ruleset.getTrapDuration()`. Prior v3.1 (2026-03-17): Struggle damage delegated, leech-seed/curse/nightmare delegation fixed. |
| `battle/02-gen1.md` | **VERIFIED** | v2.2, formula-corrected 2026-03-18 (fix/deep-accuracy-audit). 2 new corrections: (1) burn halving on critical hits — crits use raw stats, burn ignored (pokered `engine/battle/core.asm`); (2) accuracy calc corrected to two sequential floor operations on 0-255 scale (pokered `CalcHitChance`). Prior v2.0 (PR #30): 28 spec fixes, 52 new tests. 2 remaining issues: Focus Energy algorithm and type effectiveness application method. |
| `battle/03-gen2.md` | **VERIFIED** | v2.2, formula-corrected 2026-03-18 (fix/deep-accuracy-audit). 10 corrections: damage modifier order (Crit→Item→STAB→Type→Weather); high-crit stage +2 not +1, Razor Wind added; sleep duration 2-7 not 1-7; Toxic reverts to poison on switch-out; Protect uses ÷2 not ÷3; Struggle recoil = 1/4 damage dealt; freeze thaw is between-turns (Phase 2); end-of-turn Phase 2 completed (6 missing effects added). Prior v2.1 (PR #29): 32 spec fixes, 70 new tests. |
| `battle/04-gen3.md` | **VERIFIED** | v2.2, formula-corrected 2026-03-18 (fix/deep-accuracy-audit). 5 corrections: damage modifier order (Weather→Crit→Random→STAB→Type→Burn, pokeemerald `CalcDamage`); Quick Claw rate = `Random()%10<2` = 20%; Struggle recoil = 1/4 damage dealt; secondary effect chance uses 0-99 scale (not 0-255); accuracy stage table replaced with pokeemerald `sAccuracyStageRatios` lookup. Prior v2.1 (2026-03-16): priority table, multi-hit distribution. 6 OPEN items remain (end-of-turn order, EXP formula, high-crit list, doubles faint timing, Encore duration). |
| `battle/05-gen4.md` | **VERIFIED** | v1.2, decomp audit 2026-03-16. 6 Fairy refs removed from type chart. Steel SE column corrected. Priority table fixed: Counter/Mirror Coat -6→-5, Avalanche/Revenge -5→-4, Whirlpool removed (priority 0). Iron Fist punch list replaced with decomp-verified 15 moves. Protect cap corrected to 12.5% (not 1/256). Knock Off boost corrected "Gen 5+" → "Gen 6+" (boost introduced in Gen 6, not Gen 5). Stats, crits, multi-hit, hazards, weather all verified correct. Remaining open: damage modifier order, end-of-turn order, Tailwind duration, Encore duration. |
| `battle/06-gen5.md` | **VERIFIED** | v2.3, Showdown audit 2026-03-16. Move-summoned weather duration corrected to 5 turns (8 with rocks), was incorrectly listed as 8 turns base. Multi-hit distribution corrected to 35/35/15/15 (Gen 5 changed from Gen 4's 37.5/37.5/12.5/12.5). Counter/Mirror Coat priority fixed -6→-5. Protect consecutive rate no longer caps at 12.5% like Gen 4 — continues decaying to 1/256. All Fairy references removed, enum violations fixed. Paralysis ×0.25 (corrected from ×0.5 — the change to ×0.5 is Gen 7, not Gen 5; verified via gen6 mod inheritance), sleep 1–3 turns, Explosion nerf, ExtremeSpeed +2, crit 2.0x, weather damage 1/16, indefinite ability weather. 41 new abilities documented. Burn 1/8, confusion 50% verified via Showdown mod inheritance chain (gen5→gen6→base). |
| `battle/07-gen6.md` | **VERIFIED** | v2.1, Showdown audit 2026-03-16. 16 errors fixed + terrain code snippet fix: Fairy type chart completely rewritten (resistances/weaknesses were inverted). Mega Evolution persistence corrected (permanent, not switch-reversible). Gale Wings HP check removed (Gen 7 nerf, not Gen 6). Parental Bond 25%→50% (25% is Gen 7). Mega Charizard X ability "Dragon Claw"→"Tough Claws". Competitive/Defiant attribution. Sticky Web type Grass→Bug. Electric Terrain 1.3x→1.5x (code snippet also fixed, was still showing 1.3). Grounding logic rewritten. Open: priority table, Protect stall counter (×3), paralysis speed (0.25x), Mega speed mechanics. |
| `battle/08-gen7.md` | **VERIFIED** | v2.0, Showdown audit 2026-03-16. 18+ errors fixed: Z-Move power table replaced (11 ranges, max 200). Status Z-Move table rewritten (was fabricated). Z-Move+Mega coexistence corrected (CAN use both). Terrain boost 1.3x→1.5x. Gale Wings nerf documented (full HP required in Gen 7). Parental Bond nerf documented (50%→25%). Z-Move+Protect interaction added (25% through Protect). Mega Evolution persistence fixed (permanent). Open items: end-of-turn order, priority table, Alolan form data, species-specific Z-Move powers. |
| `battle/09-gen8.md` | **VERIFIED** | v2.1, second Showdown audit 2026-03-17. v2.1 fixes: "fluid-sorption" residual cleaned from code list, "mewtwo"/"eternatus" removed from gigantamaxSpecies (Mewtwo has no G-Max; Eternatus can't Dynamax), Defog corrected (added Aurora Veil/Safeguard/Mist/G-Max Steelsurge + user-side hazard removal), Heavy-Duty Boots adds G-Max Steelsurge, nonsensical terrain line replaced, Steel Beam recoil clarified (mindBlownRecoil — applies even on miss). v2.0 fixed 20+ errors. Open items: full G-Max table, complete removed moves list, Dynamax+Transform/Encore, end-of-turn order. |
| `battle/10-gen9.md` | **VERIFIED** | v2.1, Showdown audit 2026-03-17. 25+ errors fixed + second-pass corrections. Complete spec rewrite. Tera STAB scenario matrix corrected (Air Slash/Bounce get 1.5× not 1.0× — Showdown checks base types via getTypes(false,true)). Adaptability corrected (1.5→2.0, 2.0→2.25, NOT 1.5→3.0/2.0→4.0). Stellar Tera Type added (was completely missing — one-time 2× per type, Tera Blast 100BP with -1 Atk/-1 SpA). Make It Rain corrected (Steel/120BP/lowers SpA, was falsely listed as Water/75BP/drain). Orichalcum Pulse/Hadron Engine fixed (set weather/terrain + stat boost 33.3%, do NOT change move types). "Mycelium Network" fabrication removed (real ability: Mycelium Might). Embody Aspect corrected (Ogerpon, not Koraidon/Miraidon). Protosynthesis/Quark Drive Speed boost corrected (50% not 30%). Good as Gold corrected (blocks all Status moves, not just stat-lowering). Shed Tail corrected (user loses 50% HP). Tidy Up corrected (both sides' hazards, removes substitutes, does NOT remove screens). Salt Cure corrected (applied by Salt Cure move, not Toxic Spikes; Rock type, 40 BP). Burn damage corrected (1/16 per turn, was falsely listed as "no damage"). Entry hazards corrected (switch-in, not end-of-turn). All terrain effects corrected (Electric/Misty/Psychic had fabricated effects). "Atmospheric Override" fabrication removed. Damage modifier order corrected to Showdown's actual sequence. Type chart corrected (6 missing resistances). All enum violations fixed to lowercase string literals. Second pass: Adaptability edge case added (doesn't boost original-type STAB when Tera'd to different type — hasType() returns Tera type only; excluded from Stellar Tera entirely). Grassy Terrain heal added to end-of-turn order (order 5, sub 2). Facade burn exception documented. All damage modifier order, type chart, move stats, ability stats re-verified against exact Showdown code with line numbers. Open items: full end-of-turn order, complete removed moves list, Stellar defensive interactions, priority table. |

---

## Formula Corrections by Branch

### fix/deep-accuracy-audit (2026-03-18)

A systematic cross-reference of all Gen 1-3 implementations against pret decomp sources and the battle engine against its own abstraction contract. 20 bugs found and fixed.

**Affected specs** (all marked formula-corrected in the table above):
- `core/02-shared-logic.md` v1.4 — stat stage integer lookup tables; accuracy stage table from pokeemerald
- `battle/01-core-engine.md` v3.2 — 3 engine abstraction bugs (switch-in abilities, confusion/trap durations)
- `battle/02-gen1.md` v2.2 — burn/crit interaction, accuracy two-sequential-floor
- `battle/03-gen2.md` v2.2 — 10 corrections (modifier order, high-crit stage, sleep duration, Toxic revert, Protect, Struggle, freeze timing, end-of-turn)
- `battle/04-gen3.md` v2.2 — 5 corrections (modifier order, Quick Claw, Struggle, secondary effect scale, accuracy table)

**Full documentation**: See `specs/ERRATA.md` §36 (Error Category 36, subsections A–E).

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
