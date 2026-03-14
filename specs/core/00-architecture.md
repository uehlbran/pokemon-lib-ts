# Core Pokémon Library — Architecture

> Package overview, monorepo structure, public API surface, versioning strategy, and design principles.
> This library has ZERO game engine dependencies — pure TypeScript, usable anywhere.

---

## 1. Vision

`@pokemon-lib/core` is a standalone TypeScript library that models the Pokémon data domain. It provides:

- **Entity definitions** — TypeScript interfaces and types for every Pokémon concept (species, instances, moves, abilities, items, natures)
- **Shared logic** — Stat calculation, type effectiveness, experience curves, nature modifiers, catch rate formulas, damage range utilities
- **Data infrastructure** — DataManager for loading/caching JSON data, typed accessors, validation
- **Seeded PRNG** — Deterministic randomness for reproducible simulations
- **Zero dependencies** — No runtime npm dependencies. No game engine. No DOM. Runs in Node.js, Deno, Bun, browsers, workers — anywhere TypeScript runs.

The core library is the foundation that both `@pokemon-lib/battle` and any game (Phaser, terminal, Discord bot, whatever) build on.

---

## 2. Monorepo Structure

The libraries live in a single monorepo managed by **Turborepo** with npm workspaces. Each generation is its own publishable package — consumers install only the generations they need.

### Why Per-Gen Packages?

- **Install only what you use.** A game using Gen 1 and Gen 9 installs those two + the engine. No dead code from Gen 2-8.
- **Independent versioning.** A Gen 1 bug fix doesn't bump Gen 9's version. Consumers' lockfiles stay stable.
- **Each gen bundles its own data.** A Gen 1 Charizard and a Gen 9 Charizard are different objects with different base stats, learnsets, types, and abilities. No merging, no overlays — each gen has complete, self-contained data.
- **Open source friendly.** Contributors work on one gen without touching others.

### Why Fully Separate Data Per Gen?

Between Gen 1 and Gen 9, almost everything about a Pokémon can change: base stats (Pikachu got a Speed buff in Gen 6), types (Clefairy was Normal in Gen 1-5, Fairy in Gen 6+), abilities (didn't exist before Gen 3), learnsets (entirely different per gen), catch rates, egg groups, and more. An "overlay" or "diff" approach would require complex merging logic that's a breeding ground for subtle bugs (imagine a Gen 1 Clefairy that accidentally kept Fairy typing because the overlay missed one field). Fully separate data means each gen is independently testable, importers are simpler, and there's zero ambiguity about what a "Gen 1 Charizard" looks like. The duplication cost is trivial — JSON files totaling ~50-100MB across all 9 gens, loaded once.

```
pokemon-lib/
├── package.json                 # Root — workspaces config, shared dev deps
├── turbo.json                   # Turborepo pipeline config
├── tsconfig.base.json           # Shared TypeScript config
├── biome.json                   # Shared Biome config (formatting + linting)
├── .github/
│   └── workflows/
│       └── ci.yml               # Build + test on PR
│
├── packages/
│   ├── core/                    # @pokemon-lib/core — types, shared logic
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── CLAUDE.md
│   │   ├── src/
│   │   │   ├── index.ts         # Public API barrel export
│   │   │   ├── entities/        # Interfaces and types
│   │   │   ├── logic/           # Stat calc, type chart, EXP curves
│   │   │   ├── data/            # DataManager, loaders, validators
│   │   │   ├── prng/            # Seeded random number generator
│   │   │   └── constants/       # Enums, magic numbers, lookup tables
│   │   └── tests/
│   │
│   ├── battle/                  # @pokemon-lib/battle — engine only, no gen logic
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── CLAUDE.md
│   │   ├── src/
│   │   │   ├── index.ts         # Public API barrel export
│   │   │   ├── engine/          # Core battle state machine
│   │   │   ├── ruleset/         # GenerationRuleset interface + BaseRuleset
│   │   │   ├── ai/              # AI controllers (shared across gens)
│   │   │   ├── events/          # Battle event definitions
│   │   │   └── utils/           # Battle-specific utilities
│   │   └── tests/
│   │       └── engine/          # Engine-level tests (gen-agnostic)
│   │
│   ├── gen1/                    # @pokemon-lib/gen1 — Gen 1 ruleset + data
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts         # Exports Gen1Ruleset + data loader
│   │   │   ├── Gen1Ruleset.ts   # Implements GenerationRuleset
│   │   │   ├── Gen1DamageCalc.ts
│   │   │   ├── Gen1TypeChart.ts
│   │   │   └── Gen1StatCalc.ts
│   │   ├── data/                # COMPLETE Gen 1 data (not overlays)
│   │   │   ├── pokemon.json     # 151 species — Gen 1 base stats, types, learnsets
│   │   │   ├── moves.json       # All Gen 1 moves with Gen 1 categories
│   │   │   ├── items.json       # Gen 1 items only
│   │   │   ├── type-chart.json  # 15-type chart (no Dark/Steel/Fairy)
│   │   │   └── natures.json     # Empty — natures don't exist in Gen 1
│   │   └── tests/
│   │
│   ├── gen2/                    # @pokemon-lib/gen2 — Gen 2 ruleset + data
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── Gen2Ruleset.ts
│   │   └── data/                # COMPLETE Gen 2 data
│   │       ├── pokemon.json     # 251 species — Gen 2 stats, Special split
│   │       ├── moves.json       # Gen 2 moves (type-based categories)
│   │       ├── items.json       # Held items, berries (Gen 2 versions)
│   │       └── type-chart.json  # 17-type chart (Dark + Steel, no Fairy)
│   │
│   ├── gen3/                    # @pokemon-lib/gen3
│   │   └── ...                  # 386 species, abilities introduced, natures
│   ├── gen4/                    # @pokemon-lib/gen4
│   │   └── ...                  # 493 species, physical/special split per move
│   ├── gen5/                    # @pokemon-lib/gen5
│   │   └── ...                  # 649 species, hidden abilities, scaled EXP
│   ├── gen6/                    # @pokemon-lib/gen6
│   │   └── ...                  # 721 species, Fairy type, Mega Evolution
│   ├── gen7/                    # @pokemon-lib/gen7
│   │   └── ...                  # 809 species, Z-Moves, Alolan forms
│   ├── gen8/                    # @pokemon-lib/gen8
│   │   └── ...                  # 905 species, Dynamax, Galarian forms
│   └── gen9/                    # @pokemon-lib/gen9
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── Gen9Ruleset.ts
│       │   └── Terastallization.ts
│       └── data/                # COMPLETE Gen 9 data
│           ├── pokemon.json     # 1025 species — Gen 9 stats, abilities, learnsets
│           ├── moves.json       # All Gen 9 moves with per-move categories
│           ├── abilities.json   # All abilities including Gen 9 additions
│           ├── items.json       # All items including Tera Shards
│           ├── type-chart.json  # 18-type chart (with Fairy, Steel changes)
│           └── natures.json     # 25 natures
│
├── tools/
│   ├── data-importer/           # Scripts to import from PokeAPI
│   │   ├── import-gen.ts        # Per-gen importer (takes gen number as arg)
│   │   └── validate-gen.ts      # Validates a gen's data against its type chart
│   └── repos/                   # Cloned external repos (gitignored)
│
└── examples/                    # Usage examples
    ├── simple-battle/           # Minimal battle simulation
    ├── gen-switcher/            # Demo: switch between gen battle systems
    ├── damage-calc/             # Standalone damage calculator
    └── pokedex-cli/             # CLI Pokédex using core
```

---

## 3. Package Configuration

### Root `package.json`

```json
{
  "name": "pokemon-lib",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "lint": "npx @biomejs/biome check --write .",
    "lint:check": "npx @biomejs/biome check .",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "@biomejs/biome": "^1.9.0",
    "@types/node": "^20.0.0"
  }
}
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "typecheck": {},
    "lint": {},
    "clean": {
      "cache": false
    }
  }
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

### Core `packages/core/package.json`

```json
{
  "name": "@pokemon-lib/core",
  "version": "0.1.0",
  "description": "Core Pokémon data types, entities, and shared game logic",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./entities": {
      "types": "./dist/entities/index.d.ts",
      "import": "./dist/entities/index.js"
    },
    "./logic": {
      "types": "./dist/logic/index.d.ts",
      "import": "./dist/logic/index.js"
    },
    "./data": {
      "types": "./dist/data/index.d.ts",
      "import": "./dist/data/index.js"
    },
    "./prng": {
      "types": "./dist/prng/index.d.ts",
      "import": "./dist/prng/index.js"
    }
  },
  "files": ["dist", "data"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "keywords": ["pokemon", "typescript", "game-data", "pokedex"],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  }
}
```

### Core `packages/core/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Battle Engine `packages/battle/package.json`

The battle package is the **engine only** — no gen-specific logic, no data. It exports the `BattleEngine` class, the `GenerationRuleset` interface, `BaseRuleset`, AI controllers, and event types.

```json
{
  "name": "@pokemon-lib/battle",
  "version": "0.1.0",
  "description": "Pokémon battle engine — bring your own generation ruleset",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./ai": {
      "types": "./dist/ai/index.d.ts",
      "import": "./dist/ai/index.js"
    },
    "./events": {
      "types": "./dist/events/index.d.ts",
      "import": "./dist/events/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@pokemon-lib/core": "workspace:*"
  },
  "keywords": ["pokemon", "battle", "simulator", "typescript"],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  }
}
```

### Gen Package `packages/gen1/package.json` (pattern for all gen packages)

Each gen package exports its `GenerationRuleset` implementation AND its complete data. The data files are bundled in the published package.

```json
{
  "name": "@pokemon-lib/gen1",
  "version": "0.1.0",
  "description": "Gen 1 (Red/Blue/Yellow) battle mechanics and Pokémon data",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./data": {
      "types": "./dist/data/index.d.ts",
      "import": "./dist/data/index.js"
    }
  },
  "files": ["dist", "data"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@pokemon-lib/core": "workspace:*",
    "@pokemon-lib/battle": "workspace:*"
  },
  "keywords": ["pokemon", "gen1", "red-blue-yellow", "battle"],
  "license": "MIT",
  "engines": {
    "node": ">=20"
  }
}
```

---

## 4. Versioning Strategy

**Semantic Versioning** (SemVer) — `MAJOR.MINOR.PATCH`

### Version Meaning

| Segment | When to bump | Example |
|---------|-------------|---------|
| MAJOR | Breaking changes to public API (removing/renaming exports, changing interface shapes that consumers depend on) | `0.x.x` → `1.0.0` (first stable release) |
| MINOR | New features, new generation support, new entity types — all backward-compatible | `1.0.0` → `1.1.0` (add Gen 2 support) |
| PATCH | Bug fixes, formula corrections, typo fixes, internal refactors with no API change | `1.0.0` → `1.0.1` (fix damage calc rounding) |

### Pre-1.0 Rules

While in `0.x.x` (pre-stable), MINOR bumps may include breaking changes. This is standard SemVer behavior — the API is still being shaped. Document all breaking changes in `CHANGELOG.md`.

### Versioning Between Packages

- All 11 packages (`core`, `battle`, `gen1` through `gen9`) version **independently**
- `battle` depends on `core`. Each `genN` depends on both `core` and `battle`.
- In the monorepo, workspace dependencies use `workspace:*`. Published versions pin to a compatible range (`^0.1.0`).
- A breaking change in `core` or `battle` requires a MAJOR bump in all downstream gen packages.
- A gen-specific bug fix (e.g., fixing Gen 1's crit formula) only bumps that gen package's version. No other packages are affected.

### Release Checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md` with all changes since last release
3. Run full test suite (`npm run test` from root)
4. Build (`npm run build`)
5. Tag in git (`git tag @pokemon-lib/core@0.1.0`)
6. Publish to npm (`npm publish --access public` from each package dir)

---

## 5. Design Principles

### 5.1 Pure Functions Over Classes

Prefer pure functions that take data and return data. Classes are fine for stateful things (DataManager, SeededRandom, BattleEngine) but most logic should be plain functions:

```typescript
// GOOD — pure function, easy to test, easy to tree-shake
function calculateHp(base: number, iv: number, ev: number, level: number): number { ... }

// AVOID — unnecessary class wrapper
class StatCalculator {
  calculateHp(base: number, iv: number, ev: number, level: number): number { ... }
}
```

### 5.2 Immutable by Default

Entity interfaces use `readonly` for properties that shouldn't change after creation. Mutable state (like `currentHp`) is explicitly not readonly.

```typescript
interface PokemonSpeciesData {
  readonly id: number;
  readonly name: string;
  readonly baseStats: Readonly<StatBlock>;
  // ...
}

interface PokemonInstance {
  readonly uid: string;
  readonly speciesId: number;
  currentHp: number;          // Mutable — changes in battle
  experience: number;         // Mutable — changes on level up
  // ...
}
```

### 5.3 No Runtime Dependencies

The core library ships with **zero** npm runtime dependencies. Everything is implemented from scratch or uses built-in Node/browser APIs. This keeps the bundle tiny and avoids supply chain risk.

Dev dependencies (TypeScript, Vitest, etc.) are fine.

### 5.4 JSON-Serializable State

All entity instances must be JSON-serializable (no functions, no circular references, no class instances with methods). This enables:
- Save/load via `JSON.stringify` / `JSON.parse`
- Network transmission for multiplayer
- State snapshots for replay/undo
- Worker thread communication via `structuredClone`

### 5.5 Generation-Agnostic Core, Generation-Specific Data

The core library defines the **interfaces** (e.g., `PokemonSpeciesData`, `MoveData`) using the modern (Gen 3+) superset model — it has fields for abilities, natures, SpAtk/SpDef split, etc. Each gen package populates these interfaces with generation-appropriate values: Gen 1 data fills `abilities.normal` with an empty array, Gen 3+ fills it with actual abilities. The interfaces are permissive enough to represent any generation's data without needing gen-specific interface variants.

The core library also provides **shared logic** (stat calc, type chart lookup, EXP curves) using modern formulas. Gen packages can use these directly if the gen's formula matches (Gen 3+), or provide their own implementations (Gen 1's different stat calc, Gen 1's Speed-based crit formula).

---

## 6. Public API Surface

### `@pokemon-lib/core` — Main Export

```typescript
// Re-exports everything. Consumers can import from here for convenience.
export * from './entities';
export * from './logic';
export * from './data';
export * from './prng';
export * from './constants';
```

### `@pokemon-lib/core/entities` — Types & Interfaces

```typescript
// All entity interfaces — no logic, just shapes
export type {
  PokemonSpeciesData,
  PokemonInstance,
  MoveData,
  MoveSlot,
  MoveFlags,
  MoveEffect,
  AbilityData,
  AbilityTrigger,
  ItemData,
  ItemEffect,
  HoldEffect,
  NatureData,
  StatBlock,
  EvolutionData,
  TrainerData,
};

// All enum/union types
export type {
  PokemonType,
  MoveCategory,
  MoveTarget,
  PrimaryStatus,
  VolatileStatus,
  WeatherType,
  TerrainType,
  EntryHazardType,
  ScreenType,
  NatureId,
  ExperienceGroup,
  ItemCategory,
  BagPocket,
  Gender,
};
```

### `@pokemon-lib/core/logic` — Shared Calculations

```typescript
// Stat calculation
export function calculateHp(base: number, iv: number, ev: number, level: number): number;
export function calculateStat(base: number, iv: number, ev: number, level: number, natureMod: number): number;
export function calculateAllStats(pokemon: PokemonInstance, species: PokemonSpeciesData, nature: NatureData): StatBlock;
export function getNatureModifier(nature: NatureData, stat: keyof StatBlock): number;

// Type effectiveness
export function getTypeEffectiveness(attackType: PokemonType, defenderTypes: PokemonType[]): number;
export function getTypeEffectivenessMatrix(): TypeChart;

// Experience
export function getExpForLevel(group: ExperienceGroup, level: number): number;
export function getExpYield(defeatedSpecies: PokemonSpeciesData, defeatedLevel: number, isTrainer: boolean, participantLevel: number): number;

// Pokemon factory
export function createPokemonInstance(speciesId: number, level: number, options?: Partial<PokemonCreationOptions>): PokemonInstance;

// Catch rate
export function calculateCatchRate(pokemon: PokemonInstance, ball: string, status: PrimaryStatus | null): number;

// Stat stages
export function getStatStageMultiplier(stage: number): number;
export function getAccuracyEvasionMultiplier(stage: number): number;
```

### `@pokemon-lib/core/data` — Data Management

```typescript
export class DataManager {
  async loadFromJSON(paths: DataPaths): Promise<void>;
  async loadFromObjects(data: RawDataObjects): Promise<void>;

  getSpecies(id: number): PokemonSpeciesData;
  getSpeciesByName(name: string): PokemonSpeciesData;
  getMove(id: string): MoveData;
  getAbility(id: string): AbilityData;
  getItem(id: string): ItemData;
  getNature(id: NatureId): NatureData;
  getTypeChart(): TypeChart;
  getExperienceGroup(group: ExperienceGroup): ExperienceCurve;

  getAllSpecies(): PokemonSpeciesData[];
  getAllMoves(): MoveData[];
  getAllAbilities(): AbilityData[];
}

export interface DataPaths {
  pokemon: string;
  moves: string;
  abilities: string;
  items: string;
  natures: string;
  typeChart: string;
  experienceGroups: string;
}
```

### `@pokemon-lib/core/prng` — Seeded Randomness

```typescript
export class SeededRandom {
  constructor(seed: number);
  next(): number;                    // [0, 1)
  int(min: number, max: number): number;  // [min, max] inclusive
  chance(probability: number): boolean;
  pick<T>(array: readonly T[]): T;
  shuffle<T>(array: T[]): T[];
  getState(): number;
  setState(state: number): void;
}
```

---

## 7. Dependency Graph

```
┌───────────────────────────────────────────────────────┐
│  Your Game / App                                       │
│  (Phaser, Discord Bot, CLI, Web App, etc.)            │
│                                                        │
│  npm install @pokemon-lib/battle @pokemon-lib/gen1     │
│             @pokemon-lib/gen9                          │
└──────┬─────────────────────┬──────────────────────────┘
       │                     │
       │ depends on          │ depends on
       ▼                     ▼
┌──────────────┐   ┌────────────────────────────────────┐
│  @pokemon-   │   │  @pokemon-lib/gen1                  │
│  lib/battle  │   │  @pokemon-lib/gen9                  │
│              │   │  (or any combination of gen1-gen9)  │
│  - Engine    │   │                                     │
│  - Ruleset   │   │  Each gen package contains:         │
│    interface │   │  - GenerationRuleset implementation │
│  - BaseRule  │   │  - COMPLETE Pokémon data for gen    │
│  - AI        │   │  - Gen-specific type chart          │
│  - Events    │   │  - Gen-specific mechanics           │
└──────┬───────┘   └────────┬───────────────────────────┘
       │                    │
       │ depends on         │ depends on
       ▼                    ▼
┌─────────────────────────────┐
│  @pokemon-lib/core           │
│                              │
│  - Entity types/interfaces   │
│  - Shared logic (stat calc,  │
│    type chart lookup, EXP)   │
│  - DataManager               │
│  - SeededRandom              │
└─────────────────────────────┘
              │ depends on
              ▼
          (nothing)
```

**Key points:**
- A Pokédex app only needs `@pokemon-lib/core` + a gen data package. No battle engine required.
- A game that supports "Gen 1 mode" and "Gen 9 mode" installs `@pokemon-lib/gen1` + `@pokemon-lib/gen9`.
- The battle engine is gen-agnostic — it doesn't know or care which gen it's running. The gen package tells it how to behave.

### Usage Example: Switching Battle Systems in a Game

```typescript
import { BattleEngine } from '@pokemon-lib/battle';
import { Gen1 } from '@pokemon-lib/gen1';
import { Gen9 } from '@pokemon-lib/gen9';

// Player picks "Classic Mode" in settings
function createBattle(genChoice: 'classic' | 'modern', config: BattleConfig) {
  const gen = genChoice === 'classic' ? Gen1 : Gen9;

  // The gen package provides BOTH the ruleset AND the data.
  // Gen1's DataManager has Gen 1 Charizard (no abilities, 15-type chart, etc.)
  // Gen9's DataManager has Gen 9 Charizard (with abilities, 18-type chart, Tera, etc.)
  const dataManager = gen.createDataManager();
  await dataManager.load();

  return new BattleEngine(gen.ruleset, dataManager, {
    format: 'singles',
    teams: config.teams,
    seed: config.seed,
  });
}
```

---

## 8. Data Loading Strategy

### Per-Gen Data — Fully Separate, No Overlays

Each gen package contains a **complete** set of Pokémon data for that generation. There is no shared "base" data that gets patched — each gen's data stands alone.

**Why no overlays/diffs?** Between Gen 1 and Gen 9, almost everything about a Pokémon can change: base stats (Pikachu's Speed was buffed in Gen 6), types (Clefairy was Normal in Gen 1-5, became Fairy in Gen 6), abilities (didn't exist before Gen 3), learnsets (entirely different per gen), catch rates, and egg groups. An overlay system would require complex merging logic that's prone to subtle bugs. Fully separate data means:

- Each gen is independently testable and validatable
- Data importers target a specific game version — no need to compute diffs
- Zero ambiguity about what a "Gen 1 Charizard" looks like
- Each gen package can be published, downloaded, and used in isolation

### What Each Gen Package's `data/` Contains

| File | Contents | Notes |
|------|----------|-------|
| `pokemon.json` | All species available in this gen | Gen 1: 151, Gen 9: 1025. Full species data per the gen's mechanics. |
| `moves.json` | All moves that exist in this gen | Categories are gen-appropriate (type-based for Gen 1-3, per-move for Gen 4+) |
| `abilities.json` | All abilities (Gen 3+ only) | Gen 1-2 don't have this file. |
| `items.json` | Items available in this gen | Gen 1 has no held items. Gen 2+ has berries. Gen 6+ has Mega Stones. |
| `type-chart.json` | Type effectiveness matrix | Gen 1: 15 types. Gen 2-5: 17. Gen 6+: 18. |
| `natures.json` | Nature data (Gen 3+ only) | Gen 1-2 don't have natures. |
| `experience-groups.json` | EXP curves (same across gens) | All 6 groups. |

### How Consumers Load Data

```typescript
// Option A: Use a gen package's built-in data (most common)
import { Gen1 } from '@pokemon-lib/gen1';

const data = Gen1.createDataManager();
await data.load();  // Loads Gen 1 data from the package's data/ directory
const charizard = data.getSpecies(6);  // Gen 1 Charizard — no abilities, Normal/Flying→Fire/Flying types

// Option B: Use core's DataManager with custom data (fan game, custom dex)
import { DataManager } from '@pokemon-lib/core';

const dm = new DataManager();
await dm.loadFromObjects({
  pokemon: myCustomPokemonData,  // Your own species definitions
  moves: myCustomMoveData,
  typeChart: myCustomTypeChart,
  // ...
});
```

### Data Import Pipeline

The `tools/data-importer/` scripts generate each gen's data from PokeAPI:

```bash
# Import Gen 1 data (151 species, Gen 1 moves, Gen 1 type chart)
npx tsx tools/data-importer/import-gen.ts --gen 1

# Import Gen 9 data (1025 species, all Gen 9 moves, 18-type chart)
npx tsx tools/data-importer/import-gen.ts --gen 9

# Validate a gen's data (checks cross-references, type chart completeness, etc.)
npx tsx tools/data-importer/validate-gen.ts --gen 1
```

Each import run reads from PokeAPI's `api-data` repo (pre-joined JSON) and filters/transforms to the target generation's version of the data. The version group IDs in PokeAPI map to specific games, so the importer can extract "what did this Pokémon look like in Red/Blue" vs "what does it look like in Scarlet/Violet".

---

## 9. Testing Strategy

Both packages use **Vitest** for testing. Tests are organized to mirror the source structure.

### Core Tests

```
packages/core/tests/
├── entities/
│   └── pokemon-instance.test.ts   # Instance creation, validation
├── logic/
│   ├── stat-calc.test.ts          # Stat formulas against known values
│   ├── type-chart.test.ts         # Type effectiveness lookups
│   ├── experience.test.ts         # EXP curve formulas
│   └── catch-rate.test.ts         # Catch rate calculations
├── data/
│   └── data-manager.test.ts       # Loading, caching, typed access
└── prng/
    └── seeded-random.test.ts      # Determinism, distribution, serialization
```

### Test Philosophy

- **Test against known values**: Pokémon formulas are well-documented on Bulbapedia. Tests should verify against specific known-correct values (e.g., "a level 50 Charizard with 31 HP IVs and 252 HP EVs should have X HP").
- **Snapshot tests for data**: Verify that imported data matches expected shapes and counts.
- **Property-based tests for formulas**: Stats should always be positive. Type effectiveness should always be 0, 0.25, 0.5, 1, 2, or 4. Experience should be monotonically increasing.
- **Determinism tests for PRNG**: Same seed must always produce same sequence.

---
