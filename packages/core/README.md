# @pokemon-lib-ts/core

Core Pokemon data types, entities, and shared game logic. Zero runtime dependencies.

## Features

- TypeScript interfaces for all Pokemon concepts (species, moves, abilities, items, natures)
- Stat calculation (Gen 3+ formulas)
- Type effectiveness lookups (18x18 chart)
- Experience curve formulas (all 6 groups)
- Stat stage multipliers
- Critical hit rate tables
- Catch rate formulas
- Seeded PRNG (Mulberry32) for deterministic simulations
- DataManager for loading and caching JSON data

## Installation

```bash
npm install @pokemon-lib-ts/core
```

## Usage

```typescript
import {
  CORE_MECHANIC_MULTIPLIERS,
  CORE_TYPE_IDS,
  calculateHp,
  calculateStat,
  getTypeEffectiveness,
  SeededRandom,
  DataManager,
} from "@pokemon-lib-ts/core";

// Stat calculation
const hp = calculateHp(78, 31, 0, 50); // base, iv, ev, level

// Type effectiveness
import { GEN6_TYPE_CHART } from "@pokemon-lib-ts/core";
const multiplier = getTypeEffectiveness(CORE_TYPE_IDS.fire, [CORE_TYPE_IDS.grass], GEN6_TYPE_CHART); // 2

// Shared mechanic constants used by rulesets/tests
console.log(CORE_MECHANIC_MULTIPLIERS.stab); // 1.5

// Deterministic RNG
const rng = new SeededRandom(42);
rng.int(1, 100); // Same result every time with seed 42
```

## License

MIT
