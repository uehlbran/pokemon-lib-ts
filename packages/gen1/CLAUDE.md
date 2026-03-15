# @pokemon-lib/gen1

## Purpose

Gen 1 ruleset + complete Gen 1 data. Implements `GenerationRuleset` directly — does **NOT** extend `BaseRuleset` (Gen 1 mechanics are too different from Gen 3+ defaults).

**Depends on `@pokemon-lib/core` + `@pokemon-lib/battle`.**

## Gen 1 Constraints

- **151 Pokemon**, **165 moves**, **15 types** (no Dark, Steel, Fairy)
- **No abilities**, **no held items**, **no natures**
- Physical/Special split is **by type**, not per-move (all Fire moves are Special, all Normal moves are Physical)
- `items.json` and `natures.json` exist as stubs (empty arrays) for interface consistency

## Gen 1 Quirks (Each Needs a Dedicated Test)

- **1/256 miss bug**: Even 100% accurate moves have a 1/256 chance to miss
- **Focus Energy bug**: Divides crit rate by 4 instead of multiplying (does the opposite of what it should)
- **Hyper Beam recharge skip**: If Hyper Beam KOs the target, attacker skips recharge turn
- **Permanent freeze**: Frozen Pokemon never thaw naturally (only Fire moves from opponent thaw)
- **Sleep counter reset**: Using a waking move resets the sleep counter
- **Crit uses base Speed**: Critical hit rate is based on base Speed stat, not modified Speed

## Source Layout

```
src/
  Gen1Ruleset.ts     # Main ruleset (implements GenerationRuleset directly)
  Gen1StatCalc.ts    # Gen 1 stat formulas (DVs, Stat EXP, no natures)
  Gen1DamageCalc.ts  # Gen 1 damage formula
  Gen1TypeChart.ts   # 15-type chart
  Gen1CritCalc.ts    # Base Speed crit calculation
  data/              # Data loading utilities
  index.ts           # Public API
```

## Data Files

```
data/
  pokemon.json     # 151 Pokemon with base stats, types, learnable moves
  moves.json       # 165 moves with type, power, accuracy, PP, effects
  type-chart.json  # 15x15 type effectiveness matrix
  items.json       # Stub (empty array — no items in Gen 1)
  natures.json     # Stub (empty array — no natures in Gen 1)
```

## Testing

- Every quirk listed above must have a dedicated test proving the behavior
- Test damage calc against known Showdown Gen 1 values
- Test type chart completeness: 15 types, all matchups defined
- Validate data: 151 Pokemon, 165 moves, correct shapes
- All tests use AAA pattern with Given/When/Then naming

## Gen 1 Stat Formulas

**HP**: `floor(((Base + DV) * 2 + floor(ceil(sqrt(StatEXP)) / 4)) * Level / 100) + Level + 10`
**Other**: `floor(((Base + DV) * 2 + floor(ceil(sqrt(StatEXP)) / 4)) * Level / 100) + 5`

DVs (0-15), not IVs (0-31). No EV spread — uses Stat EXP (0-65535). No nature modifier.
