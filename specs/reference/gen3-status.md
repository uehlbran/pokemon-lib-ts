
# Gen3 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~98% complete (Flash Fire fix merged PR #591; only doubles-only issue remains)
**Architecture:** Extends `BaseRuleset`

---

## Wave 1 + Wave 2 + Wave 3 Merged

| PR | Branch | Merged |
|----|--------|--------|
| #239 | feat/gen3-move-effects-wave1a | Gen3MoveEffects.ts extraction + Rest, Curse Ghost, Taunt, Encore, Disable, Counter, Mirror Coat, Destiny Bond, Perish Song, Endure, Whirlwind/Roar, Trick, Explosion defense halving, EoT order override |
| #238 | feat/gen3-abilities-wave1b | On-contact (Static, Flame Body, Poison Point, Rough Skin, Effect Spore, Cute Charm), passive-immunity (Lightning Rod, Soundproof, Sturdy, Volt Absorb, Water Absorb), trapping (Shadow Tag, Arena Trap, Magnet Pull), Early Bird, Natural Cure, Speed Boost, Rain Dish, Shed Skin, status immunity (Limber, Water Veil, Immunity, Magma Armor, Insomnia, Vital Spirit, Oblivious, Own Tempo, Inner Focus) |
| #240 | feat/gen3-weather-moves-wave1c | Thunder/Blizzard accuracy in weather (Gen 3 correct: Blizzard does NOT auto-hit in hail), SolarBeam power halved in adverse weather, Weather Ball, Morning Sun/Synthesis/Moonlight, Swift Swim/Chlorophyll, Flash Fire, Liquid Ooze |
| #279 | feat/gen3-integration-wave2 | Integration tests (full battle, ability immunity pipeline, EoT ordering), 97.6% statement coverage |
| #290 | feat/gen3-moves-wave3 | Two-turn moves (SolarBeam charge skip in Sun, Fly, Bounce, Dig, Dive), Reflect/Light Screen (5-turn countdown + damage halving), Focus Punch (fail if took damage this turn), Marvel Scale fix |
| #302 | feat/gen3-abilities-wave3 | Trace, Truant, Color Change, Synchronize, Pressure (+getPPCost override) |
| #461 | fix/gen3-baseruleset-overrides | rollProtectSuccess override: Gen 3 uses 1/(2^N) halving formula (not inherited 1/(3^N) from BaseRuleset) |
| #458 | fix/gen3 | 17 audit bugs — formulas, abilities, moves, items |
| #490 | fix/gen3 | BaseRuleset overrides — Protect formula, Shedinja HP, OHKO accuracy, test coverage gaps |
| #489 | fix/gen3 | 5 audit bugs — screens, Forecast, uproar, onMoveMiss, multi-hit residuals |
| #502 | fix/gen3 | Correct integration test assertions for damage sides and rain OHKO |
| #509 | fix/gen3 | Truant end-of-turn toggle, Orb damage breakdown, Pain Split event stream |

---

## DONE

### Type System
- 17 types (Dark, Steel; no Fairy) — `packages/gen3/src/Gen3TypeChart.ts`
- Correct Steel resistances; 386 species / 370 moves / 76 abilities / 25 natures in data

### Stat Calculation (via BaseRuleset)
- IVs (0-31), EVs (252/510 cap), nature modifiers (+10%/-10%)

### Damage Calculation — `packages/gen3/src/Gen3DamageCalc.ts`
- Full pokeemerald formula
- Weather modifiers: Rain/Sun ×1.5/×0.5 for Water/Fire
- STAB: 1.5x; random factor: 85-100
- Burn halves physical Attack (Guts negates)
- Crit: 2.0x multiplier, ignores positive attacker/defender stages
- Inline abilities: Huge Power/Pure Power, Thick Fat, Wonder Guard, Overgrow/Blaze/Torrent/Swarm, Hustle, Marvel Scale, Guts, Levitate, Rock Head
- Explosion/Self-Destruct: halve defender's Defense before damage calc
- Weather Ball: type changes + double power in weather
- SolarBeam: half power in Rain/Sand/Hail
- Flash Fire: ×1.5 power for Fire moves when volatile active
- Reflect/Light Screen: halve non-critical physical/special damage respectively (PR #290)

### Critical Hit System
- Stage denominators: [16, 8, 4, 3, 2]; 2.0x multiplier
- Battle Armor / Shell Armor: crit immunity

### Accuracy
- pokeemerald `sAccuracyStageRatios` table
- Compound Eyes: ×1.3; Sand Veil: ×0.8 in sandstorm; Hustle: ×0.8 physical
- Thunder: 100% acc in Rain, 50% acc in Sun
- Never-miss → always hits

### Status Conditions
- Burn: 1/8 max HP; Freeze: 20% thaw; Paralysis: ×0.25 Speed; Sleep: 2-5 turns (cannot act on wake — Gen 3 correct); Poison/Toxic
- Electric-type immune to paralysis
- Status immunity abilities: Limber, Water Veil, Immunity, Magma Armor, Insomnia, Vital Spirit, Oblivious, Own Tempo, Inner Focus

### Weather
- Rain Dance, Sunny Day, Sandstorm, Hail (new Gen 3)
- Morning Sun/Synthesis/Moonlight: ½ normal, ⅔ sun, ¼ adverse

### Entry Hazards
- Spikes: 3 layers (1/8 → 1/6 → 1/4 HP); Flying + Levitate immune
- Rapid Spin: clears Spikes, Leech Seed, Bind

### Held Items
- Choice Band, Leftovers, Sitrus/Oran Berry, Lum Berry
- Status-cure berries, pinch stat-boost berries
- Shell Bell, Focus Band, King's Rock, Scope Lens, Quick Claw
- Soul Dew, Deep Sea items, Light Ball, Thick Club, Mental Herb, type-boosting items

### Move Effects
- Standard: status-chance, stat-change, recoil, drain, heal, volatile-status, weather, entry-hazard, protect
- Serene Grace doubles secondary chance
- Knock Off (no damage boost — Gen 6+)
- Custom handlers: Belly Drum, Rapid Spin, Mean Look/Spider Web/Block, Thief, Baton Pass, Explosion/Self-Destruct
- Wave 1A new: Rest, Curse (Ghost), Taunt (2-turn), Encore (2-5 turn), Disable, Counter, Mirror Coat, Destiny Bond, Perish Song, Endure, Whirlwind/Roar, Trick
- Wave 3 new: Two-turn moves (Fly/Bounce/Dig/Dive with semi-invulnerable), SolarBeam charge skip in Sun, Focus Punch (PR #290)
- Screens (Reflect/Light Screen): 5-turn countdown + damage halving integration (PR #290)
- Protect formula: 1/(2^N) halving per consecutive use (PR #461)

### Abilities
- On-switch-in: Intimidate, Drizzle, Drought, Sand Stream
- On-contact: Static (30% paralyze), Flame Body (30% burn), Poison Point (30% poison), Rough Skin (1/16 HP), Effect Spore (10% each para/poison/sleep), Cute Charm (30% infatuation)
- Passive immunity: Lightning Rod (Electric block), Soundproof (sound block), Sturdy (OHKO block), Volt Absorb (+1/4 HP from Electric), Water Absorb (+1/4 HP from Water)
- Trapping: Shadow Tag, Arena Trap, Magnet Pull
- Sleep: Early Bird (halves sleep turns), processSleepTurn returns false on wakeup (cannot act — Gen 3 correct)
- Switch-out: Natural Cure (clears status)
- On-turn-end: Speed Boost (+1 Speed/turn), Rain Dish (1/16 HP in rain), Shed Skin (33% status cure)
- Status immunity: Limber, Water Veil, Immunity, Magma Armor, Insomnia, Vital Spirit, Oblivious, Own Tempo, Inner Focus
- **Wave 3** (PR #302): Trace (copies opponent ability on switch-in), Truant (alternates act/loaf via volatile), Color Change (type changes to attacker's move type on damage), Synchronize (mirrors burn/para/poison to opponent), Pressure (getPPCost returns 2 for moves targeting holder)

### EoT Order
Weather-damage → future-attack → wish → weather-healing → leftovers → status-damage → leech-seed → curse → nightmare → bind → encore-countdown → disable-countdown → taunt-countdown → perish-song → speed-boost → shed-skin → weather-countdown

### Test Coverage
47 test files, 860 tests (as of 2026-03-22), 97.6% statement coverage, 88.65% branch coverage (coverage % from PR #279)

---

## OPEN BUGS

| Issue | Severity | Summary |
|-------|----------|---------|
| #141 | MEDIUM | Plus/Minus not implemented (doubles only — 1.5x SpAtk when partner has opposite ability) |

## CLOSED BUGS

| Issue | Severity | Fixed In | Summary |
|-------|----------|----------|---------|
| #550 | MEDIUM | PR #591 | Flash Fire boost applied to attack stat (pre-formula) instead of base damage (post-formula) |

---

## STUBBED / Deferred

| Item | Issue | Reason |
|------|-------|--------|
| Choice Band move lock | #690 | Engine move-locking system needed |
| Cloud Nine / Air Lock | #691 | Weather suppression system needed |
| Forecast (Castform) | #692 | Form change mechanism needed (engine hook exists; Forecast logic added PR #489 but form change pending) |
| Spread move penalty | (doubles initiative) | Doubles only |
