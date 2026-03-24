# Pokemon Library Monorepo

[![License: MIT](https://img.shields.io/github/license/uehlbran/pokemon-lib-ts)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org/)
[![CodeRabbit](https://img.shields.io/coderabbit/prs/github/uehlbran/pokemon-lib-ts?label=CodeRabbit&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+)](https://coderabbit.ai)

Modular TypeScript libraries for building Pokemon battle simulators, fan games, and tools. Each generation ships as its own package with generation-accurate mechanics and complete standalone data — install only the generations you need. The battle engine is event-driven with no UI coupling, and the seeded PRNG makes battles fully deterministic and reproducible. Whether you're building a Phaser game, a Discord bot, a damage calculator, or an ML training environment, this is the foundation.

## Features

- **Modular by generation** — install `@pokemon-lib-ts/gen1` through `@pokemon-lib-ts/gen9`; no unused data bundled
- **Event-driven battles** — 38 typed event types, zero UI coupling; render events however you want
- **Deterministic** — seeded PRNG (Mulberry32); same seed = same battle, every time
- **Generation-accurate** — each gen implements its unique quirks faithfully (Gen 1 Focus Energy bug, Gen 2 freeze thaw, Gen 3 abilities, etc.)
- **Zero-dependency core** — pure TypeScript; `@pokemon-lib-ts/core` has no runtime dependencies
- **Complete standalone data** — each gen bundles all Pokemon, moves, type charts, items, abilities
- **Dual ESM + CJS** — works in Node, bundlers, and everywhere TypeScript runs
- **Extensible** — implement `GenerationRuleset` (~43 methods) to plug in a custom battle system

## Packages

> These packages are not yet published to npm. To use them, clone the repo and build locally.

| Package | Version | Description |
|---------|---------|-------------|
| [`@pokemon-lib-ts/core`](./packages/core) | 0.8.0 | Entity types, stat calc, type effectiveness, EXP curves, DataManager, SeededRandom |
| [`@pokemon-lib-ts/battle`](./packages/battle) | 0.10.0 | Pluggable battle engine, GenerationRuleset interface, event stream, AI controllers |
| [`@pokemon-lib-ts/gen1`](./packages/gen1) | 0.6.0 | Gen 1 (Red/Blue/Yellow) — 151 Pokemon, 165 moves, 15-type chart, Gen 1 quirks |
| [`@pokemon-lib-ts/gen2`](./packages/gen2) | 0.4.0 | Gen 2 (Gold/Silver/Crystal) — 251 Pokemon, 17-type chart, held items, weather |
| [`@pokemon-lib-ts/gen3`](./packages/gen3) | 0.1.0 | Gen 3 (Ruby/Sapphire/Emerald) — 386 Pokemon, abilities system, natures, weather |
| [`@pokemon-lib-ts/gen4`](./packages/gen4) | 0.1.0 | Gen 4 (Diamond/Pearl/Platinum) — 493 Pokemon, physical/special split, Stealth Rock |
| [`@pokemon-lib-ts/gen5`](./packages/gen5) | 0.1.0 | Gen 5 (Black/White/BW2) — 649 Pokemon, weather abilities, Illusion, Moody |
| [`@pokemon-lib-ts/gen6`](./packages/gen6) | 0.1.0 | Gen 6 (X/Y/ORAS) — 721 Pokemon, Mega Evolution, Fairy type, Sticky Web |
| [`@pokemon-lib-ts/gen7`](./packages/gen7) | 0.1.0 | Gen 7 (Sun/Moon/USUM) — 807 Pokemon, Z-Moves, Alolan Forms, terrain abilities |
| [`@pokemon-lib-ts/gen8`](./packages/gen8) | 0.0.1 | Gen 8 (Sword/Shield) — 664 Pokemon (Galar Dex), Dynamax/Gigantamax |
| [`@pokemon-lib-ts/gen9`](./packages/gen9) | 0.0.1 | Gen 9 (Scarlet/Violet) — 733 Pokemon (Paldea Dex), Terastallization, Snow |

## Architecture

```text
core  <-  battle  <-  gen1  <-  your app
                  <-  gen2  <-  your app
                  ...
                  <-  gen9  <-  your app
```

- **Core** has zero runtime dependencies. Pure TypeScript interfaces, formulas, and utilities.
- **Battle** provides the engine skeleton — a state machine that delegates all gen-specific behavior to a `GenerationRuleset` interface (~43 methods: damage calc, type chart, accuracy, move effects, turn order, etc.). The engine never contains generation-specific logic.
- **Gen packages** implement `GenerationRuleset` and bundle complete, standalone data. Gen 1 and 2 implement the interface directly; Gen 3–9 extend `BaseRuleset` with overrides.
- **Tools** (`tools/data-importer`, `tools/replay-parser`) handle the build-time data pipeline and Showdown replay validation.

The engine emits individual `BattleEvent` values to listeners — 38 typed event types covering every battle action. The full event log is available as `BattleEvent[]` via `engine.getEventLog()`. Consumers subscribe and render however they want.

## Quick Start

**Gen 1 battle:**

```typescript
import { BattleEngine } from "@pokemon-lib-ts/battle";
import { Gen1Ruleset, createGen1DataManager } from "@pokemon-lib-ts/gen1";

const dataManager = createGen1DataManager();
const ruleset = new Gen1Ruleset();

const engine = new BattleEngine(
  { generation: 1, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dataManager
);

engine.on((event) => console.log(event));
engine.start();
```

**Gen 9 battle (Terastallization):**

```typescript
import { BattleEngine } from "@pokemon-lib-ts/battle";
import { Gen9Ruleset, createGen9DataManager } from "@pokemon-lib-ts/gen9";

const dataManager = createGen9DataManager();
const ruleset = new Gen9Ruleset();

const engine = new BattleEngine(
  { generation: 9, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dataManager
);

engine.on((event) => console.log(event));
engine.start();
```

**Data only (no battle engine):**

```typescript
import { createGen4DataManager } from "@pokemon-lib-ts/gen4";

const dm = createGen4DataManager();
const garchomp = dm.getSpecies(445);
console.log(garchomp.baseStats);
// { hp: 108, attack: 130, defense: 95, spAttack: 80, spDefense: 85, speed: 102 }

const earthquake = dm.getMove("earthquake");
console.log(earthquake.power, earthquake.type); // 100, 'ground'
```

## Use Cases

- **Fan games** — drop a battle engine into Phaser or any TypeScript game framework
- **Discord bots** — run server-side battles with no rendering overhead
- **Damage calculators** — use the stat and damage calc utilities directly without the full engine
- **AI / ML research** — deterministic battles with seeded PRNG make ideal training environments
- **Competitive analysis** — accurate mechanics per generation for strategy tools
- **Pokedex apps** — use gen packages as a typed data source without the battle engine

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Setup

```bash
git clone https://github.com/uehlbran/pokemon-lib-ts.git
cd pokemon-lib-ts
npm install
```

### Commands

```bash
npm run verify:local  # Authoritative local verification
npm run build          # Build all packages (Turborepo)
npm run test           # Unit + integration tests
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests only
npm run test:smoke     # Smoke tests only
npm run test:e2e       # E2E tests only
npm run test:stress    # Stress / soak tests only
npm run test:all       # Unit + integration + smoke + e2e + stress
npm run typecheck      # Type check all packages
npm run lint           # Lint + format (Biome)
```

### Running Tests

```bash
# Default PR/local suite
npm run test

# By test kind
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:e2e
npm run test:stress
npm run test:all

# Single package
cd packages/core && npx vitest run

# With coverage
cd packages/core && npx vitest run --coverage

# Manual stress / soak verification
npm run test:stress
```

### Verification Model

- `npm run test` — the default suite used by local verification and PR CI. It runs unit plus
  integration tests, but excludes smoke, e2e, and stress coverage.
- `npm run test:unit` — runs non-integration, non-smoke, non-e2e, non-stress test files.
- `npm run test:integration` — runs `integration.test.*` files only.
- `npm run test:smoke` — runs `smoke.test.*` files only.
- `npm run test:e2e` — runs `e2e.test.*` files only and passes when none exist yet.
- `npm run test:stress` — explicit soak/stability/random-loop coverage. Run it for broad,
  confidence-sensitive, or battle-stability work.
- `npm run test:all` — runs the full taxonomy: unit, integration, smoke, e2e, then stress.
- `npm run verify:local` — broader handoff gate, not just tests. It runs workflow/lint/build/
  typecheck/package-boundary checks plus plain `test`. Use this before commits and PR updates.
- `replay:*` commands remain targeted tooling. Run them explicitly when replay validation or
  simulation confidence checks are relevant.
- `npm run test:slow` remains as a backwards-compatible alias to `npm run test:smoke`.

## Project Status

All nine generations are complete. 10,332+ tests across all packages, validated against Showdown and Bulbapedia reference values.

| Package | Tests | Key Notes |
|---------|-------|-----------|
| core | 342 | All entity interfaces, stat calc, type effectiveness, PRNG |
| battle | 596 | Singles engine complete; doubles deferred |
| gen1 | 800 | All move handlers done; Gen 1 quirks (Focus Energy bug, 1/256 miss, etc.) |
| gen2 | 757 | Gen 2 mechanics complete (held items, weather, Special split) |
| gen3 | 847 | Abilities system, natures, weather; extends BaseRuleset |
| gen4 | 1,225 | Physical/Special split by move, Stealth Rock, Mold Breaker |
| gen5 | 1,225 | Weather abilities, Illusion, Moody, pokeRound fixes |
| gen6 | 1,135 | Mega Evolution, Fairy type, Sticky Web, Stance Change |
| gen7 | 1,144 | Z-Moves, Alolan Forms, Tapu terrain abilities, Ultra Burst |
| gen8 | 1,208 | Dynamax/Gigantamax, Galarian Forms, Choice lock interaction |
| gen9 | 1,053 | Terastallization, Snow, Focus Sash, Sturdy, Shed Tail |

- **Phase 1** (complete): Core + Battle + Gen 1
- **Phase 2** (complete): Gen 2 — held items, weather, Dark/Steel types, Special split
- **Phase 3** (complete): Gen 3–6 — abilities, natures, Mega Evolution, Fairy type
- **Phase 4** (complete): Gen 7 — Z-Moves, Alolan Forms, terrain abilities
- **Phase 5** (complete): Gen 8–9 — Dynamax, Terastallization, modern mechanics

## Documentation

- [`specs/`](./specs/) — architecture specs and per-generation mechanic details
- [`docs/TESTING.md`](./docs/TESTING.md) — testing methodology and philosophy
- [`CREDITS.md`](./CREDITS.md) — data sources and acknowledgments
- Package READMEs — per-package API details and quirk tables

## Contributing

Contributions welcome. Start each task in a fresh task-owned worktree from `origin/main`
with `/start-task <branch-name>`; the root checkout is not for task work. Run
`npm run verify:local` as the authoritative local handoff gate, use targeted package tests or
the test-kind scripts while iterating, and reserve `npm run test:stress` for heavy manual soak
verification. Then run
`/review` before opening or updating a PR, and `git pushreview` after pushing. PRs get advisory
CodeRabbit comments and may still get Qodo comments, but local verification is the source of
truth.

## Tech Stack

- **TypeScript** 5.4+ with strict mode
- **Turborepo** + npm workspaces
- **tsup** for ESM + CJS dual output
- **Vitest** with v8 coverage (80% thresholds)
- **Biome** for linting and formatting

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
