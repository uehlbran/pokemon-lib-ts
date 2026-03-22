# Gen7 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~2% complete (scaffold only — Wave 0 in progress)
**Architecture:** Extends `BaseRuleset`
**Branch:** `feat/gen7-wave0-scaffold`
**Spec:** `specs/battle/08-gen7.md` (verified v2.0 against Showdown)
**Primary source:** Pokemon Showdown (no complete Gen 7 disassembly)

---

## Wave Status

| Wave | Name | Status |
|------|------|--------|
| 0 | Package Scaffold + Data | 🔄 In Progress |
| 1+ | Core Mechanics | ⬜ Not Started |

---

## EXISTS (scaffold)

- `packages/gen7/package.json` — version 0.1.0, dependencies correct
- `packages/gen7/tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` — build config present
- `packages/gen7/src/Gen7TypeChart.ts` — 18-type chart with Fairy (same as Gen 6)
- `packages/gen7/data/items.json` — items data present
- `packages/gen7/data/moves.json` — moves data present
- `packages/gen7/data/type-chart.json` — type chart data present

## MISSING (to implement)

- `packages/gen7/src/Gen7Ruleset.ts` — main ruleset (extends BaseRuleset)
- `packages/gen7/src/index.ts` — package exports
- `packages/gen7/data/abilities.json` — ability data
- `packages/gen7/data/natures.json` — natures data
- `packages/gen7/data/pokemon.json` — species data
- `packages/gen7/tests/` — all tests (directory exists but empty)

---

## Key Gen 7 Mechanics (from spec `specs/battle/08-gen7.md`)

- **Z-Moves** (gimmick): one-use per battle, converts held Z-Crystal + move into Z-Move (fixed power or Z-Effect)
- **Alolan Forms**: type/stat/ability changes for regional variants
- **Tapus terrain abilities**: Tapu Koko/Lele/Bulu/Fini set Electric/Psychic/Grassy/Misty terrain on entry
- **Guardian Deities** + new Pokémon (802 species total)
- **Ultra Burst** (Necrozma): gimmick distinct from Mega Evolution
- **Mechanics changes from Gen 6**: Z-Moves replace Mega Evo as main gimmick; terrain abilities added on switch-in; Surging Strikes, etc.
- **Ability changes**: Triage (+3 priority to healing moves), Dazzling/Queenly Majesty (block priority), Fluffy (halves contact damage, doubles Fire)
- **Move changes**: Knock Off no longer has 1.5x damage boost (reverted to Gen 6), new moves: Spectral Thief, Photon Geyser, Sunsteel Strike, Moongeist Beam, etc.

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| (pending) | feat/gen7-wave0-scaffold | Wave 0: scaffold + type chart + partial data |
