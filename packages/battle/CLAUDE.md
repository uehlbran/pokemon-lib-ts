# @pokemon-lib-ts/battle

## Purpose

Pluggable battle engine: BattleEngine, GenerationRuleset interface, BaseRuleset abstract class, event stream, AI controllers. The engine is generation-agnostic — all gen-specific behavior is delegated to the ruleset.

**Depends on `@pokemon-lib-ts/core` only.** No gen packages, no external deps.

## Cardinal Rule

**The engine delegates ALL generation-specific behavior to the GenerationRuleset.** The engine never contains damage formulas, type charts, accuracy checks, or any mechanic that varies between generations. If you're tempted to add a gen-specific `if` statement to the engine, it belongs in the ruleset interface instead.

## Source Layout

```text
src/
  engine/    # BattleEngine — turn loop, action resolution, win condition checks
  ruleset/   # GenerationRuleset interface, BaseRuleset abstract class
  state/     # BattleState, BattlePokemon, BattleField, side/slot structures
  events/    # BattleEvent discriminated union, event builders
  ai/        # AI controllers (random, greedy, minimax)
  context/   # Turn context, execution context
  utils/     # Battle-specific helpers
  index.ts   # Public API barrel export
```

## Key Interfaces

- **GenerationRuleset** (~20 methods): damage calc, stat calc, type chart, turn order, accuracy, move effects, ability triggers, weather, terrain, etc. Each gen implements this.
- **BattleState**: Full battle snapshot — both sides, field conditions, turn count, PRNG state. Immutable between turns.
- **BattleAction**: Discriminated union — `'move' | 'switch' | 'item' | 'run'`
- **BattleEvent**: Discriminated union — `'damage' | 'heal' | 'status' | 'faint' | 'switch'` etc. The event stream is the engine's only output.

## Turn Flow

```text
TURN_START → action selection → priority sort
  → TURN_RESOLVE (for each action):
    → accuracy check → move execution → damage/effects → ability triggers
  → TURN_END → weather/status ticks → FAINT_CHECK → next turn or game over
```

## Event-Driven Architecture

The engine emits `BattleEvent[]` per turn. No UI coupling. Consumers (Phaser, CLI, Discord bot) render events however they want. The engine never logs, prints, or calls external code — it only returns events.

## Testing Strategy

- **Engine unit tests**: Use mock rulesets (stubs that return predictable values). Test turn flow, action resolution, win conditions.
- **Integration tests**: Use real gen rulesets (e.g., Gen1Ruleset) to verify end-to-end battle scenarios.
- **Determinism**: Same seed + same actions = same events. Always.
- **Replay validation**: Compare engine output against Showdown battle logs.
- All tests use AAA pattern with Given/When/Then naming.

## Gen Ruleset Patterns

- **Gen 1-2**: Implement `GenerationRuleset` directly (too mechanically different from modern gens)
- **Gen 3-9**: Extend `BaseRuleset` abstract class (shares ~70% of logic)
