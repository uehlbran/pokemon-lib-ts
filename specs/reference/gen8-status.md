# Gen 8 (Sword/Shield) Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** 100% complete (Waves 0–9 merged; Wave 10 docs)
**Architecture:** Extends `BaseRuleset`
**Spec:** `specs/battle/09-gen8.md`
**Ground truth:** `specs/reference/gen8-ground-truth.md`
**Primary source:** Pokemon Showdown (no complete Gen 8 disassembly)

---

## Wave Status

| Wave | Name | Status |
|------|------|--------|
| Pre-impl | Spec research + ground truth doc | ✅ Done (PR #695) |
| 0 | Package Scaffold + Data | ✅ Done (PR #689) |
| 1 | Core Mechanic Overrides | ✅ Done (PR #697) |
| 2 | Damage Calculation | ✅ Done (PR #700) |
| 3 | Terrain System | ✅ Done (PR #702) |
| 4 | Weather + Entry Hazards | ✅ Done (PR #710) |
| 5A | Abilities (Damage + Stat) | ✅ Done (PR #707) |
| 5B | Abilities (Switch + New) | ✅ Done (PR #708) |
| 6 | Held Items | ✅ Done (PR #711) |
| 7 | Move Effects | ✅ Done (PR #709) |
| 8 | Dynamax / Gigantamax | ✅ Done (PR #712) |
| 9 | Integration Tests + Coverage Polish | ✅ Done (PR #717) |
| 10 | Documentation + Release Prep | ✅ Done (this PR) |

---

## DONE

### Package Structure
- `packages/gen8/src/Gen8Ruleset.ts` — main ruleset (extends BaseRuleset)
- `packages/gen8/src/Gen8TypeChart.ts` — 18-type chart with Fairy
- `packages/gen8/src/Gen8DamageCalc.ts` — 4096-based modifier system (terrain 1.3x, Behemoth/Body Press)
- `packages/gen8/src/Gen8CritCalc.ts` — Gen 8 crit system (same as Gen 6-7)
- `packages/gen8/src/Gen8Weather.ts` — weather chip effects (Sandstorm, Hail, Sun, Rain, Primal)
- `packages/gen8/src/Gen8Terrain.ts` — Electric/Grassy/Psychic/Misty terrain (1.3x boost, Surge abilities)
- `packages/gen8/src/Gen8EntryHazards.ts` — Stealth Rock, Spikes, Toxic Spikes, Sticky Web, G-Max Steelsurge
- `packages/gen8/src/Gen8Items.ts` — full held item system (Heavy-Duty Boots, Room Service, Eject Pack, Blunder Policy, Throat Spray, Utility Umbrella)
- `packages/gen8/src/Gen8MoveEffects.ts` — Obstruct, Rapid Spin +Speed, Defog enhanced, Body Press, Steel Beam, No Retreat, Tar Shot, Jaw Lock, Clangorous Soul, Fishious Rend/Bolt Beak, Behemoth Blade/Bash, Dynamax Cannon
- `packages/gen8/src/Gen8AbilitiesDamage.ts` — Gorilla Tactics, Transistor, Dragon's Maw, Punk Rock, Ice Scales, Libero/Protean
- `packages/gen8/src/Gen8AbilitiesStat.ts` — Intrepid Sword, Dauntless Shield, Cotton Down, Steam Engine, Quick Draw
- `packages/gen8/src/Gen8AbilitiesSwitch.ts` — Screen Cleaner, Mirror Armor, Neutralizing Gas, Pastel Veil, Wandering Spirit, Perish Body, Gulp Missile, Ice Face, Hunger Switch
- `packages/gen8/src/Gen8Abilities.ts` — master dispatcher
- `packages/gen8/src/Gen8Dynamax.ts` — Dynamax gimmick (3-turn, HP scaling, flinch/OHKO/forced-switch immunity)
- `packages/gen8/src/Gen8MaxMoves.ts` — Max Move power tables, 18 secondary effects, Max Guard
- `packages/gen8/src/Gen8GMaxMoves.ts` — 32 G-Max species-specific moves (G-Max Wildfire, Volt Crash, Steelsurge, One Blow, Rapid Flow, etc.)
- `packages/gen8/src/index.ts` — package exports
- `packages/gen8/data/abilities.json`, `items.json`, `moves.json`, `natures.json`, `pokemon.json`, `type-chart.json` — all data files (664 species, "Dexit" regional dex)

### Key Gen 8 Mechanic Overrides (Wave 1 — PR #697)
- `shouldExecutePursuitPreSwitch()` → `false` (Pursuit removed)
- `getBattleGimmick("mega")` → `null`, `getBattleGimmick("zmove")` → `null` (removed)
- `isMoveAvailable()` excludes Pursuit, Hidden Power, Return, Frustration
- `calculateExpGain()` — EXP Share always-on, 50% to inactive party
- Confusion: 33%, Burn: 1/16, Paralysis: ×0.5 (same as Gen 7)

### Damage Calculation (Wave 2 — PR #700)
- 4096-based modifier chain (same foundation as Gen 7)
- **Terrain boost: 1.3x** (5325/4096 — nerfed from Gen 7's 1.5x)
- **Behemoth Blade/Bash/Dynamax Cannon**: 2× vs Dynamaxed targets
- **Body Press**: uses user's Defense stat for damage calculation

### Terrain System (Wave 3 — PR #702)
- Electric/Grassy/Psychic/Misty Terrain (same 4 as Gen 7)
- 1.3x boost (handled in damage calc)
- Duration: 5 turns (8 with Terrain Extender)
- Surge abilities: Electric Surge, Grassy Surge, Psychic Surge, Misty Surge

### Weather + Entry Hazards (Wave 4 — PR #710)
- Sandstorm, Hail, Sun, Rain weather chip
- **G-Max Steelsurge**: Steel-type entry hazard (type-effective damage like Stealth Rock)
- **Heavy-Duty Boots**: blocks ALL entry hazard damage

### Held Items (Wave 6 — PR #711)
- All Gen 7 carryforward items
- New: Heavy-Duty Boots, Room Service, Eject Pack, Blunder Policy, Throat Spray, Utility Umbrella
- No Z-Crystals, no Mega Stones (removed in Gen 8)
- Choice item lock suppressed during Dynamax

### Move Effects (Wave 7 — PR #709)
- **Rapid Spin**: 50 BP (was 20) + **+1 Speed on hit**
- **Defog**: removes Aurora Veil, Safeguard, Mist, G-Max Steelsurge, user-side hazards, terrain
- **Obstruct**: new protect variant; lowers attacker's Defense by 2 on contact
- **Steel Beam**: 140 BP, user loses 50% max HP as recoil (mindBlownRecoil — occurs even on miss)
- **No Retreat**: +1 all stats, cannot switch
- **Tar Shot**: target becomes weak to Fire + doubles Fire damage
- **Jaw Lock**: traps both user and target
- **Fishious Rend / Bolt Beak**: 85 BP, 2× if user moves first

### Dynamax / Gigantamax (Wave 8 — PR #712)
- Once per team per battle; cannot be Zacian/Zamazenta/Eternatus
- HP: `Math.floor(normalHP × (1.5 + dynamaxLevel × 0.05))`, proportional current HP scale
- Dynamax immunities: flinch, OHKO moves, forced switch
- Weight-based moves fail vs Dynamaxed targets
- All moves transform to Max Moves (damage) or Max Guard (status)
- Max Move power dual table (Fighting/Poison lower; all others higher), 18 secondary effects
- Max Guard: +4 priority, blocks everything including other Max Moves
- **32 G-Max moves** sourced from Showdown `data/moves.ts` (`isMax` / `gmaxPower`)
- G-Max form reverts on Dynamax end

---

## MISSING / DEFERRED

| Item | Reason |
|------|--------|
| Doubles mechanics | Doubles initiative — engine doesn't support doubles |
| Eternamax Eternatus | Mythical event Pokémon; Eternamax form only usable by NPCs in-game |
| Isle of Armor / Crown Tundra DLC items | Post-launch content; defer until data pipeline supports DLC |
| Max Raid Battle mechanics | Cooperative multiplayer mechanic; engine supports singles only |

---

## Test Coverage

27 test files, **1,193 tests** (as of bughunt PR — `fix/gen5-8-bughunt`).
**Branch coverage: 82.27%** (threshold: 80%).
Statement: 87.05% | Functions: 87.87% | Lines: 87.05%

Test files: `abilities-damage.test.ts`, `abilities-dispatcher.test.ts`, `abilities-routing.test.ts`, `abilities-stat.test.ts`, `abilities-switch.test.ts`, `coverage-gaps.test.ts`, `coverage-gaps-2.test.ts`, `coverage-gaps-3.test.ts`, `coverage-gaps-4.test.ts`, `coverage-gaps-5.test.ts`, `crit-calc.test.ts`, `damage-calc.test.ts`, `data-loading.test.ts`, `dynamax.test.ts`, `entry-hazards.test.ts`, `exp-formula.test.ts`, `gmax-moves.test.ts`, `integration.test.ts`, `items.test.ts`, `max-moves.test.ts`, `move-effects.test.ts`, `ruleset.test.ts`, `smoke.test.ts`, `status.test.ts`, `terrain.test.ts`, `type-chart.test.ts`, `weather.test.ts`

---

## OPEN BUGS

| Issue | Description |
|-------|-------------|
| #687 | Gen 7/8 Disguise: `capLethalDamage` only fires on lethal hits — non-lethal attacks bypass Disguise. Needs engine-level `interceptDamage` hook. |
| #725 | Focus Sash/Band not wired to `capLethalDamage` hook in Gen 7/8 (item trigger only fires post-damage) |

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| #695 | feat/gen8-pre-impl-spec | Pre-impl: spec research, open item resolution, gen8-ground-truth.md |
| #689 | feat/gen8-wave0-scaffold | Wave 0: package scaffold + data generation (664 species) |
| #697 | feat/gen8-wave1-core-overrides | Wave 1: core mechanic overrides (Pursuit removal, EXP Share, confusion) |
| #700 | feat/gen8-wave2-damage-calc | Wave 2: 4096-based damage calc (terrain 1.3x, Behemoth 2×, Body Press) |
| #702 | feat/gen8-wave3-terrain | Wave 3: terrain system (1.3x boost, Surge abilities, Terrain Extender) |
| #710 | feat/gen8-wave4-weather-hazards | Wave 4: weather + entry hazards (G-Max Steelsurge, Heavy-Duty Boots) |
| #707 | feat/gen8-wave5a-abilities | Wave 5A: damage+stat abilities (Gorilla Tactics, Transistor, Intrepid Sword) |
| #708 | feat/gen8-wave5b-abilities | Wave 5B: switch+new abilities (Screen Cleaner, Neutralizing Gas, Ice Face) |
| #711 | feat/gen8-wave6-items | Wave 6: held items (new Gen 8 items, Choice+Dynamax interaction) |
| #709 | feat/gen8-wave7-move-effects | Wave 7: move effects (Rapid Spin buff, Defog, Obstruct, Steel Beam, etc.) |
| #712 | feat/gen8-wave8-dynamax | Wave 8: Dynamax/Gigantamax gimmick (HP scaling, Max Moves, 32 G-Max moves) |
| #717 | feat/gen8-wave9-integration | Wave 9: integration tests + coverage polish (1,142 tests, 82.27% branch) |
| TBD | fix/gen5-8-bughunt | Deep bughunt: applyAbility routing (C1), getEndOfTurnOrder (C2), capLethalDamage (C3), canBypassProtect delegation, Dynamax revert fixes, closes #732 #733 #734 #735 #736 #739 #740 #741 #742 #746 #747 |
