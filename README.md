# Pokemon Library Monorepo

[![CI](https://github.com/uehlbran/pokemon-lib-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/uehlbran/pokemon-lib-ts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/uehlbran/pokemon-lib-ts)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org/)
[![CodeRabbit](https://img.shields.io/coderabbit/prs/github/uehlbran/pokemon-lib-ts?label=CodeRabbit&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+)](https://coderabbit.ai)
[![Qodo Merge](https://img.shields.io/badge/AI%20Review-Qodo%20Merge-5B4FC4?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6Ii8+PC9zdmc+)](https://www.qodo.ai/products/qodo-merge/)

Modular TypeScript libraries for building Pokemon battle simulators, fan games, and tools. Each generation ships as its own package with generation-accurate mechanics and complete standalone data — install only the generations you need. The battle engine is event-driven with no UI coupling, and the seeded PRNG makes battles fully deterministic and reproducible. Whether you're building a Phaser game, a Discord bot, a damage calculator, or an ML training environment, this is the foundation.

## Features

- **Modular by generation** — install `@pokemon-lib-ts/gen1`, `gen2`, or both; no unused data bundled
- **Event-driven battles** — 38 typed event types, zero UI coupling; render events however you want
- **Deterministic** — seeded PRNG (Mulberry32); same seed = same battle, every time
- **Generation-accurate** — each gen implements its unique quirks faithfully (Gen 1 Focus Energy bug, Gen 2 freeze thaw, etc.)
- **Zero-dependency core** — pure TypeScript; `@pokemon-lib-ts/core` has no runtime dependencies
- **Complete standalone data** — each gen bundles all Pokemon, moves, type charts, items
- **Dual ESM + CJS** — works in Node, bundlers, and everywhere TypeScript runs
- **Extensible** — implement `GenerationRuleset` (~20 methods) to plug in a custom battle system

## Packages

> These packages are not yet published to npm. To use them, clone the repo and build locally.

| Package | Version | Description |
|---------|---------|-------------|
| [`@pokemon-lib-ts/core`](./packages/core) | 0.4.0 | Entity types, stat calc, type effectiveness, EXP curves, DataManager, SeededRandom |
| [`@pokemon-lib-ts/battle`](./packages/battle) | 0.4.0 | Pluggable battle engine, GenerationRuleset interface, event stream, AI controllers |
| [`@pokemon-lib-ts/gen1`](./packages/gen1) | 0.2.4 | Gen 1 (Red/Blue/Yellow) — 151 Pokemon, 164 moves, 15-type chart, Gen 1 quirks |
| [`@pokemon-lib-ts/gen2`](./packages/gen2) | 0.1.2 | Gen 2 (Gold/Silver/Crystal) — 251 Pokemon, 17-type chart, held items, weather |

## Architecture

```
core  <-  battle  <-  gen1  <-  your app
                  <-  gen2  <-  your app
```

- **Core** has zero runtime dependencies. Pure TypeScript interfaces, formulas, and utilities.
- **Battle** provides the engine skeleton — a state machine that delegates all gen-specific behavior to a `GenerationRuleset` interface (~20 methods: damage calc, type chart, accuracy, move effects, turn order, etc.). The engine never contains generation-specific logic.
- **Gen packages** implement `GenerationRuleset` and bundle complete, standalone data. Gen 1 and 2 implement the interface directly; Gen 3+ extend `BaseRuleset` with overrides.
- **Tools** (`tools/data-importer`, `tools/replay-parser`) handle the build-time data pipeline and Showdown replay validation.

The engine emits a `BattleEvent[]` stream — 38 typed events covering every battle action. Consumers subscribe and render however they want.

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

**Gen 2 battle:**

```typescript
import { BattleEngine } from "@pokemon-lib-ts/battle";
import { Gen2Ruleset, createGen2DataManager } from "@pokemon-lib-ts/gen2";

const dataManager = createGen2DataManager();
const ruleset = new Gen2Ruleset();

const engine = new BattleEngine(
  { generation: 2, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dataManager
);

engine.on((event) => console.log(event));
engine.start();
```

**Data only (no battle engine):**

```typescript
import { createGen2DataManager } from "@pokemon-lib-ts/gen2";

const dm = createGen2DataManager();
const typhlosion = dm.getSpecies(157);
console.log(typhlosion.baseStats);
// { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 }

const surf = dm.getMove("surf");
console.log(surf.power, surf.type); // 95, 'water'
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
npm run build          # Build all packages (Turborepo)
npm run test           # Test all packages
npm run typecheck      # Type check all packages
npm run lint           # Lint + format (Biome)
```

### Running Tests

```bash
# All tests
npx vitest run

# Single package
cd packages/core && npx vitest run

# With coverage
cd packages/core && npx vitest run --coverage
```

## Project Status

- **Phase 1** (complete): Core + Battle + Gen 1
- **Phase 2** (complete): Gen 2 — held items, weather, Dark/Steel types, Special split
- **Phase 3** (planned): Gen 9 — proves architecture scales to modern mechanics
- **Phase 4+** (planned): Remaining generations, community-driven

800+ tests across all packages, validated against Showdown and Bulbapedia reference values.

## Documentation

- [`specs/`](./specs/) — architecture specs and per-generation mechanic details
- [`docs/TESTING.md`](./docs/TESTING.md) — testing methodology and philosophy
- [`CREDITS.md`](./CREDITS.md) — data sources and acknowledgments
- Package READMEs — per-package API details and quirk tables

## Contributing

Contributions welcome. Work on feature branches off `main`. Biome handles linting and formatting (`npx @biomejs/biome check --write .`). Tests use Vitest with 80% coverage thresholds. PRs are reviewed by CodeRabbit, Qodo PR-Agent, and a human approver.

## Tech Stack

- **TypeScript** 5.4+ with strict mode
- **Turborepo** + npm workspaces
- **tsup** for ESM + CJS dual output
- **Vitest** with v8 coverage (80% thresholds)
- **Biome** for linting and formatting

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
