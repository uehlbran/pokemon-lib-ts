# data-importer

## Purpose

Build-time tool that transforms raw Pokemon Showdown and PokeAPI data into per-gen JSON files. Not published to npm — `private: true`.

## Run Command

```bash
npx tsx tools/data-importer/src/import-gen.ts --gen N
```

Replace `N` with the generation number (1-9).

## Data Flow

```
Input: tools/repos/ (gitignored, cloned Showdown + PokeAPI repos)
  ↓ parse & transform
Output: packages/genN/data/*.json (committed to repo, ships with npm packages)
```

## Sources

- **Showdown** (primary): `smogon/pokemon-showdown` — battle mechanics data, moves, abilities, items. Battle-tested, split by gen, MIT licensed.
- **PokeAPI** (secondary): `PokeAPI/api-data` — species metadata (Pokedex entries, catch rates, egg groups, growth rates, evolution chains).

## Output Files Per Gen

- `pokemon.json` — Species with base stats, types, abilities, learnable moves
- `moves.json` — Moves with type, power, accuracy, PP, effects
- `type-chart.json` — Type effectiveness matrix
- `abilities.json` — Ability definitions (empty for Gen 1-2)
- `items.json` — Item definitions (empty for Gen 1)
- `natures.json` — Nature stat modifiers (empty for Gen 1-2)

## Important

- Generated JSON is **committed to the repo** — consumers don't need to run the importer
- Input repos in `tools/repos/` are **gitignored** — clone them locally to run imports
- Always validate output with snapshot tests after regenerating data
