# @pokemon-lib-ts/core

## Purpose

Foundation package: TypeScript interfaces, stat calculations, type effectiveness, EXP curves, DataManager, and SeededRandom (Mulberry32). Every other package depends on this one.

**Zero runtime dependencies.** This is a hard rule. If you need an external library, it doesn't belong in core.

## Source Layout

```
src/
  entities/    # Pokemon, Move, Ability, Item, Nature interfaces
  logic/       # Stat calc, type effectiveness, EXP curves, catch rate
  data/        # DataManager for loading/querying per-gen JSON
  prng/        # SeededRandom (Mulberry32) — deterministic PRNG
  constants/   # Type lists, stat names, status conditions
  index.ts     # Public API barrel export
```

## Entity Conventions

- **Readonly interfaces** for data (Pokemon, Move, etc.). Mutable versions only where needed (runtime stat blocks).
- **Lowercase string literals** for all entity types: `'fire'`, `'physical'`, `'paralysis'` — never UPPERCASE enums.
- **Discriminated unions** over class hierarchies for MoveEffect, categories, etc.
- Interfaces must be **generation-agnostic**. Gen-specific behavior belongs in the gen package's ruleset, not here.
- Narrow exception: `PokemonInstance` may carry optional generation-specific fields only when they are durable per-Pokemon attributes or persistent battle-state restoration data that must survive switch-out / switch-in reconstruction. If you add one, document why it cannot live on `ActivePokemon` or in the ruleset alone.

## Stat Formulas (Quick Reference)

**HP** (Gen 3+): `floor((2 * Base + IV + floor(EV/4)) * Level / 100) + Level + 10`
**Other** (Gen 3+): `floor((floor((2 * Base + IV + floor(EV/4)) * Level / 100) + 5) * NatureModifier)`

Gen 1-2 use different formulas (DVs, Stat EXP). See `specs/core/02-shared-logic.md`.

Shedinja always has HP = 1 regardless of formula.

## Type Effectiveness

Multipliers are always one of: `{0, 0.25, 0.5, 1, 2, 4}`

- `0` = immune (Normal → Ghost)
- `0.25` = double resist (dual-type)
- `0.5` = resist
- `1` = neutral
- `2` = super effective
- `4` = double super effective (dual-type)

Dual-type effectiveness = product of effectiveness against each type.

## Testing

- Test stat formulas against known Bulbapedia/Showdown values (e.g., "level 50 Charizard with 31 HP IVs and 252 HP EVs = X HP")
- Property-based tests: stats always positive, type effectiveness always in {0, 0.25, 0.5, 1, 2, 4}
- Determinism tests for PRNG: same seed = same sequence
- All tests use AAA pattern (Arrange/Act/Assert) with Given/When/Then naming
