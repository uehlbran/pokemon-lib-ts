# @pokemon-lib-ts/core

Foundation package: TypeScript interfaces, stat calculations, type effectiveness, EXP curves, DataManager, SeededRandom. **Zero runtime dependencies** (hard rule).

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

- **Readonly interfaces** for data. Mutable versions only where needed (runtime stat blocks).
- **Lowercase string literals**: `'fire'`, `'physical'`, `'paralysis'` — never UPPERCASE enums.
- **Discriminated unions** over class hierarchies (MoveEffect, categories, etc.).
- Interfaces must be **generation-agnostic**. Gen-specific behavior belongs in the gen ruleset.
- Exception: `PokemonInstance` may carry optional per-gen metadata (`dynamaxLevel`, `teraType`, Mega form data, once-per-battle flags that survive switching).
- Prefer **validated creation helpers** for bounded inputs (IVs, EVs, DVs, Stat Exp). Route normal creation through validated surfaces with named min/max/cap constants.
- Reuse shared `ValidationFailure`/`ValidationResult` naming; do not type-prefix validator outputs.
