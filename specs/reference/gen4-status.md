
# Gen4 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~100% complete (all planned waves and all known bugs resolved)
**Architecture:** Extends `BaseRuleset`

---

## DONE (all waves merged to main)

### Waves 0-1 (PRs #176-186)
- Core damage calc, stat calc, type chart
- Basic abilities: Swift Swim, Chlorophyll, Hustle, Guts, Marvel Scale, Shed Skin, Poison Heal, Rain Dish, Ice Body, Dry Skin, Rough Skin, Iron Barbs, Intimidate, Download, Trace, Flash Fire, Steadfast
- Two-turn moves infrastructure, Gravity engine hooks
- Mold Breaker, Magic Guard, Simple, Unaware, Heatproof, Solar Power, Flower Gift
- Scrappy, Normalize, Slow Start, Stench, Storm Drain, Leaf Guard, Klutz, Suction Cups
- Future Sight, Destiny Bond, Taunt, Disable, Counter, Mirror Coat
- Anticipation (real scan), Forewarn (real identification — with 0 BP move fix from #465)
- Choice items, Thunder/Blizzard accuracy overrides, SolarBeam power reduction
- Zoom Lens, BrightPowder/Lax Incense, Metronome item
- EoT effects, `applyPrimaryStatus()` helper

### Wave 3 (PR #187)
- Scope Lens / Razor Claw / Super Luck crit tests
- Iron Ball: halve Speed + grounding (removes Flying/Levitate Ground immunity)
- Stall, Lagging Tail / Full Incense: always move last
- Custap Berry: move first at ≤25% HP

### Wave 4 (PR #188)
- Leaf Guard, Klutz, Suction Cups, Stench, Storm Drain, Anticipation fix, Forewarn fix

### Wave 5A (PR #197)
- Yawn (drowsy volatile → sleep next turn)
- Encore (4-8 turns, locks last move)
- Heal Block (5-turn, gates all healing)
- Embargo (5-turn, gates item usage)
- Worry Seed (changes target ability to Insomnia)
- Gastro Acid (suppresses target's ability)
- Engine: yawn/heal-block/embargo EoT countdowns

### Wave 5B (PR #210)
- Sucker Punch (fail if target not using damaging move)
- Feint (removes Protect/Detect, only hits if protecting)
- Focus Punch (fail if took damage this turn)
- Trick / Switcheroo (swap held items)
- Doom Desire (2-turn delayed Steel attack, 120 power)

### Wave 6A (PR #232)
- Magnet Rise (Ground immunity 5 turns)
- Acupressure (+2 random stat)
- Power Swap / Guard Swap / Heart Swap (stat stage swapping)
- Curse (Ghost-type: user loses 1/2 HP, target gets Curse volatile)
- Sticky Barb (1/8 HP EoT + transfers on contact — contact transfer added PR #522)
- Berry Juice (20 HP at ≤50% HP)
- Grip Claw (binding lasts 7 turns)
- Gluttony (berry activation at 50% HP)
- Unburden (2x Speed after item consumed)
- "unburden" added to VolatileStatus in core

### Wave 6B (PR #237)
- Natural Gift (type + power from berry, 62-entry table)
- Fling (power from item lookup table)
- Pluck / Bug Bite (steal + activate target's berry)
- 16 type-resist berries (Occa, Passho, Wacan, Rindo, Yache, Chople, Kebia, Shuca, Coba, Payapa, Tanga, Charti, Kasib, Haban, Colbur, Babiri)
- 5 stat pinch berries (Liechi +Atk, Ganlon +Def, Salac +Spe, Petaya +SpAtk, Apicot +SpDef)
- Jaboca Berry (retaliates physical attacker 1/8 HP)
- Rowap Berry (retaliates special attacker 1/8 HP)

### Wave 7 (PR #246)
- Gravity move-select block (Fly, Bounce, Hi Jump Kick, Jump Kick, Splash, Magnet Rise blocked when Gravity active)
- In-flight move grounding when Gravity activates mid-flight
- Multitype (Arceus changes type based on held Plate on switch-in; 16 plates)
- Encore enforcement in getAvailableMoves (locked to last move, ends if PP = 0)

### Post-Wave Bugfix PRs (all merged)
- **#286**: Perish Song duration, Disable duration, Trick Room toggle, Tangled Feet, EoT order, Intimidate, Flash Fire, Forewarn, Orb items
- **#293**: type-boost item placement (base power not attack stat), Destiny Bond clearing, Fling/Natural Gift damage, Sticky Barb, Fire Fang Wonder Guard
- **#308**: Pressure (getPPCost), Gastro Acid (suppression + restoration on switch-out), Pain Split (heals defender), Sucker Punch (status move check), Knock Off (suppress only, not permanent remove), Trick (itemKnockedOff check)
- **#462**: Replace Gen 5+ mechanics with correct Gen 4: Stench no flinch, Storm Drain no immunity in singles, Thick Fat halves base power, Heatproof post-type-effectiveness, Metronome +0.1x/1.5x cap; processSleepTurn returns true on wake (Gen 4 can act on wake turn)
- **#465**: 32 audit bugs — ruleset, damagecalc, abilities, items, moves
- **#478/#479/#480**: Test coverage gaps filled
- **#493**: Heatproof test expected values corrected
- **#509**: Truant EoT toggle, Orb damage breakdown, Pain Split event stream
- **#522**: Sticky Barb contact transfer triggers Unburden volatile
- **#523**: Re-export AbilityContext/ItemContext types from gen4 package

### Original Audit Bug Status (24 issues filed 2026-03-21)
All 24 issues are now **CLOSED** (#254–#278 + #261, #264, #276).

---

## OPEN BUGS

None. All bugs closed as of 2026-03-22.

## CLOSED BUGS (filed 2026-03-22, all resolved)

| Issue | Severity | Fixed In | Summary |
|-------|----------|----------|---------|
| #549 | HIGH | (merged) | Magic Guard does not prevent Life Orb recoil chip-damage |
| #540 | HIGH | PR #607 | Wish has no mechanism to schedule heal — `wishSet` field added to engine |
| #551 | HIGH | PR #604 | on-damage-taken item context uses post-damage currentHp — Focus Sash activation fixed |
| #554 | LOW | (merged) | Gen4Ruleset class comment claims rollSleepTurns is 1-5 turns but implementation returns 1-4 |

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| #183-186 | feat/gen4-* | Waves 2-2.5: contact immunities, weather accuracy, stat abilities, status helper |
| #187 | feat/gen4-wave3-crit-speed | Wave 3: crit items, Iron Ball, Stall, priority items |
| #188 | feat/gen4-status-abilities-wave4 | Wave 4: status/utility abilities |
| #197 | feat/gen4-move-effects-wave5a | Wave 5A: volatile/status moves |
| #210 | feat/gen4-wave5b-combat-moves | Wave 5B: combat moves |
| #232 | feat/gen4-moves-items-wave6a | Wave 6A: utility moves + items + Gluttony/Unburden |
| #237 | feat/gen4-moves-items-wave6b | Wave 6B: berry moves + all berries |
| #246 | feat/gen4-fixups-wave7 | Wave 7: Gravity block, Multitype, Encore enforcement |
| #286 | fix/gen4 | Simple bug fixes (Perish Song, Disable, Trick Room, Tangled Feet, EoT order, Intimidate, Flash Fire, Forewarn, Orb items) |
| #293 | fix/gen4 | Type-boost item placement, Destiny Bond, Fling/Natural Gift, Sticky Barb, Fire Fang |
| #308 | fix/gen4 | Engine-dependent bugs — Pressure, Gastro Acid, Pain Split, Sucker Punch, Knock Off, Trick |
| #462 | fix/gen4 | Replace Gen 5+ mechanics with correct Gen 4 behavior; processSleepTurn wake fix |
| #465 | fix/gen4 | 32 audit bugs — ruleset, damagecalc, abilities, items, moves |
| #478 | test/gen4 | Fix circular assertions, add coverage for testing-gap issues |
| #479 | test/gen4 | Fill coverage gaps — damage calc, stat calc, weather, speed |
| #480 | test/gen4 | Berry no-activation, Pluck branches, item count, Iron Ball grounding coverage |
| #493 | fix/gen4 | Correct Heatproof test expected values |
| #509 | fix/gen3,gen4 | Truant EoT toggle, Orb damage breakdown, Pain Split event stream |
| #522 | fix/gen4 | Sticky Barb contact transfer triggers Unburden volatile |
| #523 | fix/gen4 | Re-export AbilityContext/ItemContext types; resolve #61, #121, #454, #488 |
