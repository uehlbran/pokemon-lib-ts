# Pokemon Library Monorepo

A TypeScript monorepo producing open-source Pokemon libraries for building games, simulators, and tools.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@pokemon-lib/core`](./packages/core) | 0.1.0 | Entity types, stat calc, type effectiveness, EXP curves, DataManager, SeededRandom |
| [`@pokemon-lib/battle`](./packages/battle) | 0.1.0 | Pluggable battle engine with GenerationRuleset interface, event system, AI controllers |
| [`@pokemon-lib/gen1`](./packages/gen1) | 0.1.0 | Gen 1 (Red/Blue/Yellow) ruleset + complete data (151 Pokemon, 164 moves, 15-type chart) |

## Architecture

```
core  <-  battle  <-  gen1  <-  your app
```

- **Core** has zero runtime dependencies. Pure TypeScript interfaces, formulas, and utilities.
- **Battle** provides the engine skeleton — a state machine that delegates gen-specific behavior to a `GenerationRuleset`.
- **Gen packages** implement `GenerationRuleset` and bundle complete, standalone data for that generation.

Consumers install only the generations they need:

```bash
npm install @pokemon-lib/battle @pokemon-lib/gen1
```

## Quick Start

```typescript
import { BattleEngine } from "@pokemon-lib/battle";
import { Gen1Ruleset, createGen1DataManager } from "@pokemon-lib/gen1";

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

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Setup

```bash
git clone https://github.com/uehlbran/pokemon-lib.git
cd pokemon-lib
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

## Tech Stack

- **TypeScript** 5.4+ with strict mode
- **Turborepo** + npm workspaces
- **tsup** for ESM + CJS dual output
- **Vitest** with v8 coverage (80% thresholds)
- **Biome** for linting and formatting

## Project Status

- **Phase 1** (current): Core + Battle + Gen 1 — shipped as v0.1.0
- **Phase 2** (planned): Gen 9 — proves architecture scales to modern mechanics
- **Phase 3+**: Remaining generations, community-driven

## License

MIT
