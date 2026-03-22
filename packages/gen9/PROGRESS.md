# Gen 9 Progress

## Wave 0 -- Package Scaffold + Data + Battle Changes

- [x] Create `packages/gen9/` directory structure
- [x] `package.json`, `tsconfig.json`, `tsup.config.ts`
- [x] Generate data files: pokemon.json (733), moves.json (685), abilities.json (310), items.json (249), natures.json (25), type-chart.json (18 types)
- [x] `Gen9TypeChart.ts` -- 18-type chart (identical to Gen 6-8)
- [x] `Gen9CritCalc.ts` -- crit rate table [24, 8, 2, 1], multiplier 1.5x
- [x] `data/index.ts` -- `createGen9DataManager()` factory
- [x] `Gen9Ruleset.ts` -- skeleton extending BaseRuleset (damage calc stub)
- [x] `index.ts` -- barrel exports
- [x] Add `stellarBoostedTypes: PokemonType[]` to `ActivePokemon` interface (battle pkg)
- [x] Initialize `stellarBoostedTypes: []` in `createActivePokemon()` (battle pkg)
- [x] Tests: smoke (12), data-loading (28), type-chart (17) = 57 total
- [x] Typecheck passes
- [x] All existing tests still pass
