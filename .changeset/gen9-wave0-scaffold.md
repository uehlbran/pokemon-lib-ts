---
"@pokemon-lib-ts/gen9": minor
"@pokemon-lib-ts/battle": patch
---

feat: Gen 9 package scaffold with data files and battle package Stellar Tera tracking

- New package `@pokemon-lib-ts/gen9` with Gen9Ruleset skeleton extending BaseRuleset
- Generated data: 733 Pokemon, 685 moves, 310 abilities, 249 items, 25 natures, 18-type chart
- Added `stellarBoostedTypes: PokemonType[]` to `ActivePokemon` interface for Stellar Tera Type tracking
- 57 tests covering smoke, data loading, and type chart validation
