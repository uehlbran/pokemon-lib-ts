# Oracle Dependency Versions

Pinned exactly on 2026-03-26 for deterministic compliance runs.

| Package | Version | Evidence |
| --- | --- | --- |
| `@pkmn/sim` | `0.10.7` | `npm view @pkmn/sim version` |
| `@pkmn/data` | `0.10.7` | `npm view @pkmn/data version` |
| `@pkmn/dex` | `0.10.7` | `npm view @pkmn/dex version` |
| `@smogon/calc` | `0.11.0` | `npm view @smogon/calc version` |
| `zod` | `4.3.6` | `npm view zod version` |

## Notes

- `@pkmn/data` / `@pkmn/dex` remain aligned with the versions already used by `tools/data-importer`.
- The fast path implemented in this wave starts with:
  - gen discovery
  - data/type-chart parity
  - stat parity scaffolding
  - result schema + runner wiring
- Full replay / trace / battle oracle suites remain future work.
