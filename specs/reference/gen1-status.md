# Gen1 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~100% complete (all known mechanics implemented)
**Architecture:** Implements `GenerationRuleset` directly (NOT BaseRuleset — too mechanically different)

---

## DONE

### Type System
- 15 types (no Dark/Steel/Fairy) — `packages/gen1/src/Gen1TypeChart.ts`
- Ghost → Psychic = 0 (Gen 1 bug replicated in type-chart.json)
- All Gen 1 immunities correct (including Poison → Bug = 2x, Bug → Poison = 2x)
- Full type chart test coverage — `packages/gen1/tests/type-chart.test.ts`

### Stat Calculation — `packages/gen1/src/Gen1StatCalc.ts`
- DV formula (0-15 range)
- Stat Experience (0-65535) via `calculateStatExpContribution`
- HP formula: `floor(((Base+DV)*2+bonus)*Level/100)+Level+10`
- Non-HP formula: `floor(((Base+DV)*2+bonus)*Level/100)+5`
- Unified Special stat (spAttack = spDefense for Gen 1)
- Known-value regression tests: Mewtwo 416 HP, Chansey 704 HP, etc.
- **Badge Boosts (opt-in)** — PR #521: `applyGen1BadgeBoosts()` function + `Gen1RulesetOptions.badgeBoosts`. Each badge multiplies relevant stat by floor(stat * 9/8). Off by default — only applies in single-player campaign. Source: pret/pokered `engine/battle/core.asm BadgeStatBoosts`.

### Damage Calculation — `packages/gen1/src/Gen1DamageCalc.ts`
- Level doubling for crits (not a 2x multiplier)
- Stat overflow bug (≥256 → divide by 4 mod 256) replicated
- 997 cap before +2
- STAB via `floor(damage/2)` addition
- Sequential type effectiveness with floor per type (not multiplicative combined)
- Random factor 217-255 integer division
- Self-Destruct/Explosion defense halving
- Burn halves physical Attack (crit ignores this)
- Critical hits ignore stat stages and screens
- Reflect/Light Screen doubles Def/SpDef (ignored by crits)
- Min 1 damage for non-immune moves

### Critical Hit System — `packages/gen1/src/Gen1CritCalc.ts`
- Speed-based crit formula (base Speed / 512)
- Focus Energy bug replicated: divides crit rate by 4 (not multiplies)
- High-crit moves: Slash, Razor Leaf, Crabhammer, Karate Chop (Speed / 64)
- Dire Hit handled via same code path as Focus Energy
- Known-value regression tests for Alakazam, Tauros, Chansey, Snorlax, Mewtwo

### Turn Order — `packages/gen1/src/Gen1Ruleset.ts`
- Switches before moves
- Priority brackets (Quick Attack +1, Counter -1)
- Speed-based ordering with paralysis speed quartering
- Deterministic RNG tiebreak for speed ties

### Accuracy — `packages/gen1/src/Gen1Ruleset.ts` `doesMoveHit()`
- 0-255 scale with two sequential floor operations (accuracy then evasion stages)
- 1/256 miss bug replicated
- Swift bypasses accuracy check (null accuracy)
- Self-targeting moves bypass 1/256 miss (+1 to threshold)
- OHKO: fails if user Speed ≤ target Speed

### Status Conditions — `Gen1Ruleset.ts`
- Burn: shared N/16 counter (shared with poison and Leech Seed per the Gen 1 toxic counter bug)
- Freeze: permanent (no natural thaw); `checkFreezeThaw()` always returns false
- Paralysis: 25% full paralysis (63/256 via `gen1to2FullParalysisCheck`); Speed quartered for turn order
- Sleep: 1-7 turns; cannot act on wake turn; counter persists on switch-out
- Poison: shared N/16 counter (shared with burn and Leech Seed)
- Toxic: escalating N/16 per turn — same shared counter; reverts to regular poison on switch-out
- Status immunities: Fire→burn, Ice→freeze, Poison→poison (Electric NOT immune to paralysis in Gen 1)
- **Toxic counter shared bug replicated** (#194): burn/poison/Leech Seed all share the N/16 counter

### Move Handlers Implemented
- `status-chance`: Body Slam, Blizzard, Fire Blast, Bite, etc.
- `status-guaranteed`: Thunder Wave, Hypnosis, etc.
- `stat-change`: Swords Dance, Amnesia, Growth, Growl, etc. (Mist blocking, unified Special, secondary chance)
- `recoil`: Take Down, Double Edge, etc.
- `drain`: Absorb, Mega Drain
- `heal`: Recover, Softboiled
- `screen`: Reflect, Light Screen (permanent — no turn countdown in Gen 1)
- `fixed-damage`: Dragon Rage (40), Sonic Boom (20)
- `level-damage`: Seismic Toss, Night Shade (damage = attacker level)
- `ohko`: Fissure, Guillotine, Horn Drill
- `volatile-status` (confusion): Confuse Ray, etc. (2-5 turns)
- `volatile-status` (bound): Wrap, Bind, Fire Spin, Clamp (weighted 2-5 turns, blocks switching)
- `volatile-status` (focus-energy): Focus Energy, Dire Hit — sets `focus-energy` volatile; crit calc reads it (divides by 4 — Gen 1 bug) (#192)
- `volatile-status` (leech-seed): Leech Seed — Grass types immune, fails if already seeded; EoT drain correct (#193)
- `switch-out`: Roar, Whirlwind — always fails in Gen 1
- `custom: splash` — "But nothing happened!"
- `custom: super-fang` — 50% current HP, min 1
- `custom: psywave` — random [1, floor(level×1.5)-1]
- `custom: teleport` — always fails in trainer battles
- `custom: haze` — resets both sides' stat stages; cures defender status; clears all screens and volatiles
- `custom: explosion/self-destruct` — user faints, defense halved in damage calc
- `custom: rest` — full heal + sleep 2 turns; cures existing status; fails at full HP with no status
- `custom: mist` — permanent volatile; blocks foe stat drops; fails if already active
- `custom: conversion` — copies defender's types to attacker (Gen 1 behavior)
- `custom: counter` — 2x last Normal/Fighting physical damage taken
- `custom: disable` — disables defender's last move used for 1-8 turns; fails if no last move or already disabled (#191)
- `custom: substitute` — costs floor(maxHp/4) HP; engine handles damage absorption; fails at <25% HP or if already has sub (#189)
- `custom: rage` — lock-in + Attack +1 on each hit via `onDamageReceived` hook (#190)
- `custom: mimic` — copies defender's last-used move into Mimic's slot (PP=5); restores on switch-out with exact original PP (#113)
- `custom: mirror-move` — sets `recursiveMove` to defender's last-used move; engine executes without PP deduction (#118)
- `custom: metronome` — random Gen 1 move via `recursiveMove`; excludes metronome/struggle (#116)
- `custom: transform` — copies defender types/stat stages/stats/moves (PP=5); restores originals on switch-out via `transform-data` volatile (#117)
- `custom: bide` — 2-turn charge accumulating damage via `onDamageReceived`; releases 2× on turn 3; fails silently if no damage (#115)
- `custom: thrash` — 3-turn forced lock; confuses user on final turn; Petal Dance uses same handler (#114)
- Hyper Beam no-recharge on KO or substitute break (#196)

### End-of-Turn
- EoT order: `["status-damage", "leech-seed", "disable-countdown"]`
- Burn, poison, toxic chip damage (with shared N/16 counter bug)
- Leech Seed drain (shared N/16 counter) — drain calc correct
- Disable countdown — removes volatile when expires
- Confusion self-hit: 40 BP typeless, uses own Atk/Def with stat stages and overflow bug

### Switch-Out Effects
- Stat stages reset (volatiles cleared)
- Confusion clears
- Toxic reverts to regular poison
- Focus Energy volatile clears
- Disable clears
- Mimic reverts to original move with exact original PP (from `mimic-slot` volatile)
- Transform reverts types/stats/moves (from `transform-data` volatile)
- Sleep counter persists (does NOT clear)
- Primary status persists
- Screens clear on switch

### Engine Infrastructure Added (battle package, PR #282)
- `onDamageReceived` hook in `GenerationRuleset.MoveSystem` (required, no-op in BaseRuleset)
- `MoveEffectResult.recursiveMove` field for recursive move execution
- `MoveEffectResult.moveSlotChange` field for move slot replacement (Mimic)
- `MoveEffectContext.brokeSubstitute` flag set by engine when substitute breaks
- `BattleEngine.executeMoveById` private method for PP-free recursive execution

### Data & Validation
- 151 species, 164 moves loaded
- Physical/special split by type (`isGen1PhysicalType`)
- `validatePokemon()`: level 1-100, species 1-151, 1-4 moves, no held items
- EXP gain via `calculateExpGainClassic()`

### Test Coverage (29 test files, 800 tests as of 2026-03-22)
`accuracy.test.ts`, `bug-sweep-fixes.test.ts`, `confusion-and-haze.test.ts`, `crit-calc.test.ts`, `damage-calc.test.ts`, `data-loading.test.ts`, `data-validation.test.ts`, `deep-dive-validation.test.ts`, `gen1-mechanics.test.ts`, `harness/smoke.test.ts`, `integration/full-battle.test.ts`, `move-category.test.ts`, `move-handlers-tier1.test.ts`, `move-handlers-tier2.test.ts`, `move-handlers-tier3.test.ts`, `move-handlers-tier4.test.ts`, `replay-validation.test.ts`, `ruleset.test.ts`, `ruleset-branches.test.ts`, `stat-calc.test.ts`, `struggle-damage.test.ts`, `turn-order-determinism.test.ts`, `type-chart.test.ts`

---

## OPEN ISSUES (minor)

| Issue | Summary |
|-------|---------|
| #530 | Badge boost *glitch* (in-battle compounding re-application, 9/8 per badge applied each turn) not implemented. The base badge boost feature is done (PR #521 — opt-in). The glitch itself is out of scope for competitive sim. |

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| #111 | feat/gen1-move-mechanics | Accuracy, turn order, status, EoT, volatiles, most move handlers |
| (various) | feat/gen1-bug-sweep | Bug fixes #54, #55, #90, #91, #93, #94, #101-103, #105 |
| (various) | feat/gen1-move-handlers | Tier 1 + Tier 2 custom move handlers (Splash, Super Fang, Psywave, Teleport, Rest, Mist, Conversion, Counter) |
| #233 | feat/gen1-move-handlers-wave3 | Focus Energy (#192), Leech Seed infliction (#193), Disable (#191), Substitute (#189), toxic counter shared bug (#194) |
| #282 | feat/gen1-engine-infra | Engine infra + Wave 4: Rage (#190), Mimic (#113), Mirror Move (#118), Metronome (#116), Transform (#117), Bide (#115), Thrash/Petal Dance (#114), Hyper Beam sub-break (#196) |
| #460 | fix/gen1,gen2 | Integer stat stage arithmetic from pret disassemblies |
| #463 | fix/gen1 | 21 audit bugs — formulas, accuracy, mechanics, engine |
| #482 | test/gen1 | Harden 4 audit test issues — seeded assertions, engine integration, Disable, Substitute |
| #485 | test/gen1 | Fix tautological tests, weak assertions, add regression tests |
| #521 | feat/gen1 | Add opt-in badge stat boosts (#195) — `Gen1BadgeBoosts` + `Gen1RulesetOptions.badgeBoosts` |
