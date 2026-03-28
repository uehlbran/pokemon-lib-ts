# @pokemon-lib-ts/battle

Pluggable battle engine: BattleEngine, GenerationRuleset, BaseRuleset, event stream, AI controllers. **Depends on `@pokemon-lib-ts/core` only.** The engine delegates ALL gen-specific behavior to the ruleset — no damage formulas, type charts, or accuracy checks in the engine.

## Source Layout

```text
src/
  engine/    # BattleEngine — turn loop, action resolution, win conditions
  ruleset/   # GenerationRuleset interface, BaseRuleset abstract class
  state/     # BattleState, BattlePokemon, BattleField, side/slot structures
  events/    # BattleEvent discriminated union, event builders
  ai/        # AI controllers (random, greedy, minimax)
  context/   # Turn context, execution context
  utils/     # Battle-specific helpers
  index.ts   # Public API barrel export
```

## Key Interfaces

- **GenerationRuleset**: ~40 methods (damage calc, stat calc, type chart, turn order, accuracy, move effects, ability triggers, weather, terrain). Each gen implements this.
- **BattleState**: Full battle snapshot — both sides, field, turn count, PRNG state.
- **BattleAction**: Discriminated union — `'move' | 'switch' | 'item' | 'run'`.
- **BattleEvent**: Discriminated union — `'damage' | 'heal' | 'status' | 'faint' | 'switch'` etc. The event stream is the engine's only output (no UI coupling).

## Gen Ruleset Patterns

- **Gen 1-2**: Implement `GenerationRuleset` directly (too mechanically different from Gen 3+).
- **Gen 3-9**: Extend `BaseRuleset` abstract class (shares ~70% of logic).
