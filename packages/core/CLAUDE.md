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
- Exception: `PokemonInstance` may carry optional per-generation team metadata or persisted cross-switch battle state when the value belongs to the individual Pokemon rather than the ruleset. Examples: `dynamaxLevel`, `teraType`, Mega form restoration data, and once-per-battle flags that must survive switching.
- Prefer validated creation surfaces for bounded domain inputs. If IVs, EVs, DVs, Stat Exp, or similar constrained values gain dedicated helpers, the public/default path should create only valid objects and should expose reusable validators plus named min/max/cap constants instead of scattering raw literals.
- Reuse shared `ValidationFailure` / `ValidationResult` naming for validator outputs instead of type-prefixed issue names when the validator context already identifies the domain.

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
- When test fixtures need IVs/EVs/DVs/Stat Exp, prefer validated helper/value-object surfaces over raw inline object literals once those helpers exist.
