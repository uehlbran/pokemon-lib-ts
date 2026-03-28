# @pokemon-lib-ts/gen1

Gen 1 ruleset + complete data. Implements `GenerationRuleset` directly (not BaseRuleset). **Depends on core + battle.**

## Gen 1 Constraints

- 151 Pokemon, 165 moves, 15 types (no Dark, Steel, Fairy)
- No abilities, no held items, no natures
- Unified Special stat (no SpAtk/SpDef split)
- Physical/Special by type, not per-move

## Gen 1 Quirks (Each Needs a Test)

- **1/256 miss bug**: 100% accurate moves have 1/256 miss chance
- **Focus Energy bug**: Divides crit rate by 4 instead of multiplying
- **Hyper Beam recharge skip**: KO skips recharge turn
- **Permanent freeze**: Only opponent Fire moves thaw
- **Sleep counter reset**: Using a waking move resets the counter
- **Crit uses base Speed**: Crit rate based on base Speed, not modified

## Source Layout

```
src/
  Gen1Ruleset.ts     # Main ruleset (implements GenerationRuleset)
  Gen1StatCalc.ts    # DVs, Stat EXP, no natures
  Gen1DamageCalc.ts  # Gen 1 damage formula
  Gen1TypeChart.ts   # 15-type chart
  Gen1CritCalc.ts    # Base Speed crit calculation
  data/              # Data loading utilities
  index.ts           # Public API
```
