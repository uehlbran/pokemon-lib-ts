
# Gen5 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~100% complete (all tracked mechanics + bugs done)
**Architecture:** Extends `BaseRuleset`
**Primary source:** Pokemon Showdown (Gen 5 has no complete disassembly)

---

## DONE (merged to main)

### Wave 0 Scaffold (PR #457)
- Package structure, data generation, stubs

### Wave 1 (PR #476)
- Type chart (18 types — no Fairy; Steel still resists Dark/Ghost), crit calc, damage calc

### Wave 2 (PRs #477, #492)
- Status conditions: sleep (1-3 turns, can act on wake turn), paralysis (0.25x speed), burn (1/8 HP chip)
- Weather: sandstorm/hail chip damage with type and ability immunity (Overcoat, Sand Rush, Sand Force, Ice Body, Snow Cloak, Sand Veil)
- Gen 5 EXP formula with level-dependent sqrt scaling
- Protect: 2^N doubling denominator (1/2 at N=1, 1/4 at N=2, cap at 1/256 for N≥8)
- Speed: paralysis speed modifier + all Gen 5 modifiers
- End-of-turn ordering: 25-effect ordering
- Sleep counter resets on switch-in (unique Gen 5 mechanic)
- Permanent weather from abilities (Drizzle, Drought, Sand Stream, Snow Warning)

### Wave 3 (PR #498)
- Gen5AbilitiesDamage.ts: Sheer Force, Analytic, Sand Force, Multiscale, Sturdy rework + Gen4 carry-overs (70 tests)
- Gen5AbilitiesStat.ts: Prankster, Moxie, Defiant, Competitive, Justified, Contrary, Weak Armor, Moody, Speed Boost, Simple, Unnerve, Steadfast (40 tests)
- Gen5AbilitiesSwitch.ts: Magic Bounce, Regenerator, Mummy, Cursed Body, Illusion, Imposter, Overcoat, Sand Rush, Unburden, Victory Star + Gen3-4 carry-overs (96 tests)

### Wave 4A (PR #503)
- Gen5AbilitiesRemaining.ts: Zen Mode, Harvest, Telepathy, Healer, Friend Guard, Heavy Metal, Light Metal, Frisk (Gen5), Keen Eye (Gen5), Oblivious (Gen5), Serene Grace (Gen5) — 46 tests

### Wave 4B (PR #504) + Bugfix (PR #513)
- Gen5Items.ts: Type Gems x17, Eviolite, Rocky Helmet, Air Balloon, Red Card, Eject Button, Ring Target, Absorb Bulb, Cell Battery, Binding Band + all Gen4 carry-overs — 106 tests
- Added `chip-damage` and `inflict-status` to ItemEffect discriminated union
- PR #513: Magic Guard/Heatproof for applyStatusDamage, Simple/Klutz for getEffectiveSpeed

### Wave 5A+5C (PR #517)
- Field effects: Magic Room, Wonder Room, Quick Guard, Wide Guard, priority changes
- Combat moves: Acrobatics, Final Gambit, Foul Play, Retaliate, Shell Smash, Explosion fix

### Wave 5B (PR #516)
- Behavioral overrides: Defog, Scald, Toxic, powder move Grass immunity, Growth in Sun (+2/+2)

### Consolidation (PR #534)
- Gen5Abilities.ts master dispatcher routing to Gen5AbilitiesDamage/Stat/Switch/Remaining
- Gen5MoveEffects.ts master dispatcher: Field → Behavior → Combat → Status sub-modules
- Fixed Qodo issues: Healer target, Harvest TODO, Zen Mode TODO, Telepathy side check

### Wave 6A (PR #533)
- Gen5MoveEffectsStatus.ts: Heal Pulse, Aromatherapy/Heal Bell (full team cure), Soak, Incinerate, Bestow, Entrainment (abilityChange), Round (power doubling in damage calc)
- Added to MoveEffectResult: `defenderHealAmount`, `teamStatusCure`, `abilityChange`
- Engine extended for all three new result fields

### Wave 7 (PR #535)
- Gen5EntryHazards.ts: Spikes (1/8, 1/6, 1/4 HP per 1-3 layers), Stealth Rock (type-scaled), Toxic Spikes (1L=poison, 2L=badly-poisoned, Poison type absorbs)
- Rapid Spin: clears user-side hazards, Leech Seed, binding (only when damage > 0)
- isGen5Grounded: handles Flying, Levitate, Ingrain override, Air Balloon (suppressed by Klutz/Embargo), Iron Ball (suppressed by Klutz/Embargo), Gravity, Smack Down volatile

### Wave 8 (PR #558)
- Venoshock: 2× base power when target is poisoned/badly-poisoned
- Hex: 2× base power when target has any primary status condition
- Chip Away / Sacred Sword: ignore defense stat stages in damage calc
- Clear Smog: reset all target stat stages to 0
- Synchronoise: fail if user and target share no types
- Nature Power: becomes Tri Attack in Gen 5 standard battles
- **Tailwind: 4-turn duration** (was 3 in Gen 4) — fully implemented
- Storm Throw / Frost Breath: always-crit (via willCrit in move data)
- Multi-hit distribution: 35/35/15/15 (in BaseRuleset, correct for Gen 5)
- Protect consecutive formula: correct (1/2^N, caps at 1/256)

### Wave 9 (PR #548)
- Pledge moves (Fire/Grass/Water Pledge): 50 BP solo, returns null in singles (pure damage). Doubles combos TODO (needs engine support).
- Sky Drop: stub (needs engine-level two-turn volatile support)

### Post-wave Fixes (all merged)
- PR #556: Integration tests for Gen 5 mechanics + spec self-audit (20 tests)
- PR #563: Gen5 abilities/items correctness audit regression tests
- PR #570: Sleep counter startTime stored by BattleEngine (closes #552)
- PR #571: Magic Bounce shouldReflectMove implementation (closes #543)
- PR #572: Unburden on steal, Harvest berry restore, Zen Mode reversion (closes #541 #545 #546)
- PR #575: pokeRound formula fix — +2047 not +2048 (closes #536)
- PR #576: Encore=3 turns, Taunt=3 turns, Disable=4 turns (Gen5 fixed durations)
- PR #577: Sheer Force 1.3x power boost in damage calc (closes #567)

### Verified Mechanics (spec audit)
- Life Orb + Sheer Force: recoil suppressed ✅ (Gen5Items.ts calls sheerForceSuppressesLifeOrb)
- Magic Room/Wonder Room: 5-turn duration ✅ (Gen5MoveEffectsField.ts)
- Freeze thaw: 20% per turn pre-move ✅ (BaseRuleset.checkFreezeThaw)
- Sleep: 1-3 turns ✅ (BaseRuleset.rollSleepTurns)

### Post-wave Bug Fixes — Round 2 (all merged 2026-03-22)
- PR #589: Thief/Covet/Pickpocket item theft + substitute guard + gem-volatile check (closes #578)
- PR #595: Simple Beam, Worry Seed, Gastro Acid, Role Play, Skill Swap (closes #579)
- PR #596: Harvest berry tracking via `harvest-berry` volatile in engine + core + Gen5AbilitiesRemaining (closes #580)
- PR #592: Healer `target: "ally"` in AbilityEffect + engine handler (closes #583)
- PR #590: Sheer Force whitelist for Tri Attack and moves with complex secondaries (closes #584)

Additional fixes merged to main alongside:
- PR #588: Hazard layer increment fix (Spikes cap 3, Toxic Spikes cap 2)
- PR #591: Gen3 Flash Fire — apply boost post-formula, not to attack stat
- PR #57x: Gen2 integer-only random factor in damage calc (#542)

---

## KNOWN REMAINING GAPS (deferred — engine-level changes needed)

| Item | Status | Notes |
|------|--------|-------|
| Sky Drop | DEFERRED | Needs engine-level two-turn volatile target tracking |
| Pledge moves (doubles combos) | DEFERRED | Needs engine-level multi-target combining |
| Wish delayed heal | FIXED | Engine `wishSet` field added — PR #607 |

---

## ADDITIONAL FIXES (post wave-plan, merged 2026-03-22)

- PR #607: Wish delayed heal via `wishSet` field in engine (closes #540)
- PR #632: Type resist berries — moved to damage calc, added Magic Room suppression (Gen5+Gen6)
- PR #752: Deep bughunt — Protect formula (`rng.chance(1/2**32)` for denom ≥ 256), Sheer Force whitelist (`secret-power`, `relic-song`), canBypassProtect required method (closes #732)

## OPEN BUGS

None. All tracked bugs closed as of 2026-03-22.

---

## CLOSED BUGS

| Issue | Fixed In | Summary |
|-------|----------|---------|
| #536 | PR #575 | pokeRound off-by-one — +2047 not +2048 |
| #541 | PR #572 | Unburden doesn't activate when item stolen |
| #543 | PR #571 | Magic Bounce completely unimplemented |
| #545 | PR #572 | Harvest never restores berries |
| #546 | PR #572 | Zen Mode reversion not implemented |
| #552 | PR #570 | Sleep counter startTime never stored by BattleEngine |
| #567 | PR #577 | Sheer Force power boost stub never replaced |
| N/A | PR #576 | Encore/Taunt/Disable fixed durations missing |
| #578 | PR #589 | Thief/Covet/Pickpocket don't steal items (+ substitute guard + gem-volatile) |
| #579 | PR #595 | Simple Beam/Worry Seed/Gastro Acid/Role Play/Skill Swap not implemented |
| #580 | PR #596 | Harvest berry-tracking volatile never written on berry consumption |
| #583 | PR #592 | Healer cannot cure allies (AbilityEffect missing target:"ally") |
| #584 | PR #590 | Tri Attack not boosted by Sheer Force (complex secondary / effect=null) |
| #732 | PR #752 | Protect sequential-use probability formula wrong for denom ≥ 256; Sheer Force whitelist missing secret-power/relic-song; canBypassProtect not a required method |
| #643 | #785 | Type-boost items/Plates use Math.floor instead of pokeRound |
| #653 | #785 | Iron Fist, Dry Skin, Rivalry, Technician use Math.floor instead of pokeRound |
| #641 | #785 | Reckless does not apply to moves with crash damage (hasCrashDamage) |
| #640 | #785 | Solar Power and Flower Gift not applied as stat modifiers in sun/harsh-sun |
| #650 | #785 | Magic Guard early-return skips Poison-type Toxic Spikes absorption |
| #649 | #785 | UNSUPPRESSABLE_ABILITIES includes abilities that are suppressable in Gen 5 |
| #657 | #785 | Effect Spore sleep threshold uses roll < 10 (10%) instead of roll < 11 (11%) |
| #661 | #785 | Synchronize triggers when status came from Toxic Spikes (should be skipped) |
| #646 | #785 | Gen5Ruleset JSDoc comment says Protect uses 1/(3^N) — correct formula is 1/(2^N) |
| #658 | #785 | Solid Rock/Filter return activated:true even when move is not super effective |
| #656 | #785 | Tinted Lens returns activated:true even when move is not "not very effective" |
| #651 | #785 | Sniper returns activated:true even when move is not a critical hit |
| #655 | #785 | Dead Focus Sash code in handleOnDamageTaken (moved to capLethalDamage in earlier PR) |
| #647 | #785 | Berry double-subtract: residual HP recalculated instead of using post-damage currentHp |

---

## PR History

| PR | Branch | What |
|----|--------|------|
| #457 | feat/gen5-scaffold | Wave 0: scaffold |
| #476 | feat/gen5-core-mechanics | Wave 1: type chart, crit, damage |
| #477 | feat/gen5-status-weather | Wave 2 (original): status, weather, EXP, Protect, speed |
| #492 | feat/gen5-status-weather | docs: Protect cap deviation |
| #498 | feat/gen5-abilities-3b | Wave 3: all abilities |
| #503 | feat/gen5-abilities-4a | Wave 4A: remaining abilities |
| #504 | feat/gen5-items-4b | Wave 4B: items |
| #513 | fix/gen5-speed-status | Bugfix: Magic Guard/Heatproof, Simple/Klutz speed |
| #516 | feat/gen5-moves-5b | Wave 5B: behavioral overrides |
| #517 | feat/gen5-moves-5a | Wave 5A+5C: field effects + combat moves |
| #520 | fix/gen5-test-provenance | docs: test provenance Wave 1-4A |
| #532 | fix/gen5-test-provenance-wave4b-5 | docs: test provenance Wave 4B+5A-5C |
| #533 | feat/gen5-moves-6a | Wave 6A: status/utility moves + engine extensions |
| #534 | feat/gen5-consolidation | Consolidation: master dispatchers |
| #535 | feat/gen5-hazards-wave7 | Wave 7: entry hazards + Rapid Spin |
| #548 | feat/gen5-wave9-pledges-skydrop | Wave 9: Pledge moves + Sky Drop stub |
| #556 | feat/gen5-integration-tests | Integration tests + spec self-audit |
| #558 | feat/gen5-wave8 | Wave 8: remaining mechanics + Tailwind 4 turns |
| #563 | bughunt/gen5-abilities | Gen5 abilities/items correctness audit tests |
| #570 | fix/gen5-sleep-counter-552 | Sleep counter startTime fix (#552) |
| #571 | fix/gen5-magic-bounce-543 | Magic Bounce shouldReflectMove (closes #543) |
| #572 | fix/gen5-ability-stubs-541-545-546 | Unburden/Harvest/Zen Mode (closes #541 #545 #546) |
| #575 | fix/gen5-pokeround-off-by-one-536 | pokeRound formula fix (closes #536) |
| #576 | fix/gen5-encore-taunt-disable-durations | Encore/Taunt/Disable fixed durations |
| #577 | fix/gen5-sheer-force-power-567 | Sheer Force 1.3x boost (closes #567) |
| #589 | fix/gen5-thief-covet-pickpocket-578 | Thief/Covet/Pickpocket item theft + substitute guard + gem volatile (closes #578) |
| #590 | fix/gen5-sheer-force-triattack | Sheer Force whitelist for Tri Attack (closes #584) |
| #592 | fix/gen5-healer-ally-target-583-v2 | Healer target:ally in AbilityEffect + engine (closes #583) |
| #595 | fix/gen5-ability-change-moves-579 | Simple Beam/Worry Seed/Gastro Acid/Role Play/Skill Swap (closes #579) |
| #596 | fix/gen5-harvest-berry-tracking-580 | Harvest berry volatile in engine + VolatileStatus type (closes #580) |
| #752 | fix/gen5-8-bughunt | Deep bughunt: Protect formula, Sheer Force whitelist, canBypassProtect delegation (closes #732) |
| #785 | fix/gen5-8-bughunt-status | Bughunt wave 2: pokeRound fixes, Reckless hasCrashDamage, Solar Power/Flower Gift stat modifiers, Magic Guard Toxic Spikes, UNSUPPRESSABLE trim, Effect Spore threshold, Synchronize hazard skip, activated:false guards, Focus Sash dead code, berry double-subtract (closes #643 #653 #641 #640 #650 #649 #657 #661 #646 #658 #656 #651 #655 #647) |
