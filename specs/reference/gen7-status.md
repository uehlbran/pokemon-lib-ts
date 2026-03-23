# Gen7 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~75% complete (Waves 0–7B merged; Z-Move gimmick in progress)
**Architecture:** Extends `BaseRuleset`
**Spec:** `specs/battle/08-gen7.md`
**Primary source:** Pokemon Showdown (no complete Gen 7 disassembly)

---

## Wave Status

| Wave | Name | Status |
|------|------|--------|
| 0 | Package Scaffold + Data | ✅ Done (PR #639) |
| 1 | Core Mechanic Overrides | ✅ Done (PR #666) |
| 2 | Damage Calculation | ✅ Done |
| 3 | Terrain System | ✅ Done |
| 4 | Weather Chip + Entry Hazards + Aurora Veil | ✅ Done (PR #678) |
| 5 | (not in spec — folded into other waves) | — |
| 6 | Z-Crystal ID + Held Items + Terrain Extender | ✅ Done (PR #680) |
| 7A | Damage-Modifying + Stat/Priority Abilities | ✅ Done |
| 7B | Switch/Contact Ability Handlers + New Abilities | ✅ Done (PR #685) |
| 8 | Z-Move Gimmick (full activation pipeline) | 🔄 In Progress |
| 9+ | Ultra Burst (Necrozma), remaining moves | ⬜ Not Started |

---

## DONE

### Package Structure
- `packages/gen7/src/Gen7Ruleset.ts` — main ruleset (extends BaseRuleset)
- `packages/gen7/src/Gen7TypeChart.ts` — 18-type chart with Fairy
- `packages/gen7/src/Gen7DamageCalc.ts` — 4096-based modifier system (Gen 7 damage formula)
- `packages/gen7/src/Gen7CritCalc.ts` — Gen 7 crit system
- `packages/gen7/src/Gen7Weather.ts` — weather chip effects
- `packages/gen7/src/Gen7Terrain.ts` — Electric/Grassy/Psychic/Misty terrain
- `packages/gen7/src/Gen7EntryHazards.ts` — entry hazard handling
- `packages/gen7/src/Gen7Items.ts` — held item system (Z-Crystals, Terrain Extender, etc.)
- `packages/gen7/src/Gen7MoveEffects.ts` — Gen 7 move effect handlers
- `packages/gen7/src/Gen7AbilitiesDamage.ts` — damage-modifying abilities
- `packages/gen7/src/Gen7AbilitiesStat.ts` — stat/priority abilities (Triage, Dazzling, etc.)
- `packages/gen7/src/Gen7AbilitiesSwitch.ts` — switch/contact ability handlers
- `packages/gen7/src/Gen7AbilitiesNew.ts` — new Gen 7 abilities (Fluffy, Queenly Majesty, etc.)
- `packages/gen7/src/index.ts` — package exports
- `packages/gen7/data/abilities.json`, `items.json`, `moves.json`, `natures.json`, `pokemon.json`, `type-chart.json` — all data files complete

### Core Mechanic Overrides (Wave 1 — PR #666)
- Speed tie handling
- Confusion self-hit (uses new formula)
- EXP formula overrides
- Crit rate system (Gen 6+ 1.5x crit stays; stage thresholds unchanged)

### Damage Calculation (Wave 2)
- 4096-based modifier chain (replaces Gen 6 binary chain)
- Type effectiveness, STAB, burn, weather modifiers all in 4096 system

### Terrain System (Wave 3)
- Electric Terrain (boosts Electric, blocks sleep), Psychic Terrain (boosts Psychic, blocks priority), Grassy Terrain (heals 1/16, boosts Grass), Misty Terrain (halves Dragon, blocks primary status)
- Tapu Koko/Lele/Bulu/Fini set terrain on entry
- Terrain Extender item (8 turns)
- Surge abilities: Electric Surge, Psychic Surge, Grassy Surge, Misty Surge

### Weather + Entry Hazards + Aurora Veil (Wave 4 — PR #678)
- Weather chip damage
- Stealth Rock, Spikes, Toxic Spikes, Sticky Web (entry hazard handling)
- Aurora Veil (requires hail + Light Clay integration)

### Held Items + Z-Crystals (Wave 6 — PR #680)
- Z-Crystal identification (maps crystal type → eligible move)
- Terrain Extender (8-turn terrain)
- Full held item system for Gen 7

### Abilities (Waves 7A + 7B)
- **7A** — Damage-modifying (Fluffy, Tinted Lens, Filter, etc.), stat/priority (Triage, Dazzling, Queenly Majesty)
- **7B** — Switch/contact triggers, new Gen 7 abilities

---

## IN PROGRESS

| Item | Branch | Notes |
|------|--------|-------|
| Z-Move gimmick activation | feat/gen7-wave8-zmove | `BattleGimmick.modifyMove()` pipeline wired (engine); Z-Move power/type resolution in progress |

---

## MISSING / DEFERRED

| Item | Reason |
|------|--------|
| Ultra Burst (Necrozma) | Distinct gimmick from Z-Moves; after Z-Move wave |
| Alolan Form type changes | Form-change mechanism needed in engine |
| Spectral Thief / Photon Geyser / Sunsteel Strike / Moongeist beam | Move effects not yet implemented |
| Doubles mechanics | Doubles initiative — engine doesn't support doubles |

---

## Test Coverage

18 test files, 811 tests (as of 2026-03-22).

Test files: `abilities-damage.test.ts`, `abilities-nerfs.test.ts`, `abilities-new.test.ts`, `abilities-switch-contact.test.ts`, `aurora-veil.test.ts`, `crit-calc.test.ts`, `damage-calc.test.ts`, `data-loading.test.ts`, `entry-hazards.test.ts`, `exp-formula.test.ts`, `items.test.ts`, `move-effects.test.ts`, `ruleset.test.ts`, `smoke.test.ts`, `status.test.ts`, `terrain.test.ts`, `type-chart.test.ts`, `weather.test.ts`

---

## OPEN BUGS

None. All tracked bugs closed.

---

## ADDITIONAL FIXES

- PR #752: Deep bughunt — EoT order adds `magic-room-countdown`, `wonder-room-countdown`, `gravity-countdown`, `slow-start-countdown`; Z-Move through Protect deals 0.25x via `hitThroughProtect`; Disguise `capLethalDamage` marks `disguise-broken` volatile; canBypassProtect delegation (closes #735 #736 #739 #741)
- TBD: Bughunt wave 2 — Rayquaza mega (Dragon Ascent), Disguise non-lethal via expanded capLethalDamage, Beast Boost/Moxie on-after-move-used, pinch berries EoT, Focus Sash capLethalDamage (closes #701 #687 #688 #683 #725)

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| #639 | feat/gen7-wave0-scaffold | Wave 0: package scaffold + data generation |
| #666 | feat/gen7-wave1 | Wave 1: core mechanic overrides (speed, confusion, EXP, crit) |
| (untracked) | feat/gen7-wave2 | Wave 2: 4096-based damage calculation |
| (untracked) | feat/gen7-wave3 | Wave 3: terrain system (Electric/Grassy/Psychic/Misty, Surge abilities) |
| #678 | feat/gen7-wave4 | Wave 4: weather chip, entry hazards, Aurora Veil |
| #680 | feat/gen7-wave6 | Wave 6: Z-Crystal identification, Terrain Extender, full held item system |
| (untracked) | feat/gen7-wave7a | Wave 7A: damage-modifying and stat/priority ability handlers |
| #685 | feat/gen7-wave7b | Wave 7B: switch/contact ability handlers and new Gen 7 abilities |
| #752 | fix/gen5-8-bughunt | Deep bughunt: EoT countdowns, Z-Move 0.25x through Protect, Disguise volatile, canBypassProtect (closes #735 #736 #739 #741) |
| TBD | fix/gen5-8-bughunt-status | Bughunt wave 2: Rayquaza mega, Disguise non-lethal, Beast Boost/Moxie, pinch berries EoT, Focus Sash (closes #701 #687 #688 #683 #725) |
