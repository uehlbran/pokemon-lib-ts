# @pokemon-lib-ts/gen2

## Purpose

Gen 2 ruleset + complete Gen 2 data. Implements `GenerationRuleset` directly — does **NOT** extend `BaseRuleset` (Gen 2 mechanics are too different from Gen 3+ defaults).

**Depends on `@pokemon-lib-ts/core` + `@pokemon-lib-ts/battle`.**

## Gen 2 Constraints

- **251 Pokemon**, **17 types** (adds Dark, Steel — no Fairy)
- **No abilities**, **no natures**
- **Held items**: YES — first generation with held items (Leftovers, berries, type-boosting items)
- **Special stat split**: spAttack and spDefense are now different values
- Physical/Special split is **by type**, not per-move (same as Gen 1, but Steel is physical and Dark is special)
- **Weather**: Rain Dance, Sunny Day, Sandstorm (5 turns each)
- **DVs (0-15)** and **Stat Experience (0-65535)**, not modern IVs/EVs
- `natures.json` exists as a stub (empty array) for interface consistency

## Gen 2 Mechanics (Key Differences from Gen 1)

- **Critical hits**: Stage-based system (not Speed-based). Focus Energy bug is FIXED.
- **Freeze**: ~9.8% (25/256) thaw chance per turn (not permanent like Gen 1)
- **Sleep**: Can't attack on the turn you wake up
- **Toxic**: Counter resets on switch (unlike Gen 1 where it persisted)
- **Weather**: New system — Rain/Sun/Sandstorm affect damage, accuracy, and end-of-turn
- **Held items**: Type-boosting (+10%), Leftovers (1/16 HP/turn), berries (auto-cure status)
- **Entry hazards**: Spikes (1 layer, 1/8 HP, doesn't affect Flying)
- **New types**: Dark (immune to Psychic), Steel (many resistances)
- **Ghost → Psychic = 2x** (Gen 1 bug fixed)

## Source Layout

```
src/
  Gen2Ruleset.ts     # Main ruleset (implements GenerationRuleset directly)
  Gen2StatCalc.ts    # Gen 2 stat formulas (DVs, Stat EXP, no natures)
  Gen2DamageCalc.ts  # Gen 2 damage formula (includes weather + item modifiers)
  Gen2TypeChart.ts   # 17-type chart
  Gen2CritCalc.ts    # Stage-based crit calculation
  Gen2Weather.ts     # Weather effects (rain, sun, sandstorm)
  Gen2Items.ts       # Held item effects
  Gen2Status.ts      # Status condition mechanics
  data/              # Data loading utilities
  index.ts           # Public API
```

## Data Files

```
data/
  pokemon.json     # 251 Pokemon with Gen 2 base stats (split Special)
  moves.json       # Gen 2 moves with type-based categories
  type-chart.json  # 17x17 type effectiveness matrix
  items.json       # Gen 2 held items (Gen 2 berry names, not modern)
  natures.json     # Stub (empty array — no natures in Gen 2)
```

## Testing

- Test stat formulas against known Showdown Gen 2 values
- Test type chart: 17 types, Ghost→Psychic=2, Dark→Psychic=2, Steel resistances
- Test weather modifiers and duration
- Test held item effects (Leftovers 1/16, type-boost 10%, berry consumption)
- Test critical hit stage system (Focus Energy FIXED)
- Test freeze thaw (~9.8%/25/256), sleep wake mechanics, toxic counter reset on switch
- All tests use AAA pattern with Given/When/Then naming
