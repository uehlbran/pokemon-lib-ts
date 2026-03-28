# @pokemon-lib-ts/gen2

Gen 2 ruleset + complete data. Implements `GenerationRuleset` directly (not BaseRuleset). **Depends on core + battle.**

## Gen 2 Constraints

- 251 Pokemon, 17 types (adds Dark, Steel — no Fairy)
- No abilities, no natures. DVs (0-15) and Stat EXP (0-65535).
- Held items (first gen with them), Special stat split, weather (Rain/Sun/Sandstorm)
- Physical/Special by type (same as Gen 1; Steel=physical, Dark=special)

## Gen 2 Mechanics (Key Diffs from Gen 1)

- **Crits**: Stage-based (not Speed-based). Focus Energy bug FIXED.
- **Freeze**: ~9.8% (25/256) thaw chance per turn (not permanent)
- **Sleep**: CAN attack on waking turn (unlike Gen 1)
- **Toxic**: Counter resets on switch
- **Weather**: Rain/Sun/Sandstorm affect damage, accuracy, end-of-turn
- **Held items**: Type-boost (+10%), Leftovers (1/16 HP), berries (auto-cure)
- **Spikes**: 1 layer, 1/8 HP, doesn't affect Flying
- **New types**: Dark (immune to Psychic), Steel (many resistances)
- **Ghost->Psychic = 2x** (Gen 1 bug fixed)

## Source Layout

```
src/
  Gen2Ruleset.ts     # Main ruleset (implements GenerationRuleset)
  Gen2StatCalc.ts    # DVs, Stat EXP, no natures
  Gen2DamageCalc.ts  # Weather + item modifiers
  Gen2TypeChart.ts   # 17-type chart
  Gen2CritCalc.ts    # Stage-based crit
  Gen2Weather.ts     # Weather effects
  Gen2Items.ts       # Held item effects
  Gen2Status.ts      # Status mechanics
  data/              # Data loading utilities
  index.ts           # Public API
```
