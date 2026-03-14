# Pokemon Fan Game — Overview & Project Setup

> This file covers the tech stack, project structure, development/debugging setup, and coding standards.
> See the other spec files for specific systems.

## Spec File Index

| File | Contents | Feed to Claude Code for... |
|------|----------|---------------------------|
| `00-overview.md` | Tech stack, project structure, dev setup, coding standards | Every session (context) |
| `01-asset-pipeline.md` | Sprites, data sources, repos, local file structure | Phase 0, Phase 2 |
| `02-data-schemas.md` | All TypeScript interfaces and enums | Phase 2, Phase 3, Phase 4 |
| `03-core-systems.md` | EventBus, DataManager, PRNG, stat calc | Phase 1, Phase 3 |
| `04-battle-engine.md` | Battle state machine, damage, turns, AI, abilities | Phase 4 |
| `05-overworld.md` | Maps, movement, NPCs, encounters, transitions | Phase 6 |
| `06-ui-systems.md` | Battle UI, menus, party, bag, save/load, audio | Phase 5, Phase 7 |
| `07-game-design.md` | Pallet Town, opening sequence, cutscenes, rival | Phase 6, Phase 7 |
| `08-testing.md` | Test strategy, example tests, helpers | Phase 1, Phase 4 |
| `09-build-phases.md` | Phase 0 bootstrap through Phase 8 | Every session (roadmap) |

---

## 1. Tech Stack & Tooling

### Core

| Component | Technology | Version |
|-----------|-----------|---------|
| Game Engine | Phaser 3 | 3.80+ |
| Language | TypeScript | 5.x (strict mode) |
| Build Tool | Vite | 5.x |
| Package Manager | npm | latest |
| Node.js | Node.js | 20 LTS+ |

### Key Dependencies

```json
{
  "dependencies": {
    "phaser": "^3.80.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.0.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0"
  }
}
```

### Why These Choices

- **Phaser 3**: Best-supported 2D web game framework. Excellent tilemap support, sprite management, scene system, input handling. Large community.
- **TypeScript strict mode**: Catches type errors at compile time. Critical for complex systems like the battle engine. The developer (Brandon) already knows TypeScript from Power BI visual development.
- **Vite**: Fast HMR for rapid iteration. Native TypeScript support. Simple config.
- **Vitest**: Same config as Vite. Fast. Native TypeScript. Used for unit testing the battle engine and data layer without Phaser dependencies.

---

## 2. Project Structure

```
pokemon-fan-game/
├── index.html                   # Phaser game mount point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts             # Test configuration
│
├── public/
│   └── assets/
│       ├── pokemon/
│       │   ├── gen5/            # Front battle sprites (from Showdown gen5/)
│       │   ├── gen5-back/       # Back battle sprites
│       │   ├── gen5-shiny/      # Shiny front sprites
│       │   └── gen5-back-shiny/ # Shiny back sprites
│       ├── trainers/            # Trainer battle sprites (from Showdown trainers/)
│       ├── itemicons/           # Item icons (from Showdown itemicons/)
│       ├── types/               # Type badge icons (from Showdown types/)
│       ├── tilesets/            # Map tilesets (from Spriters Resource, Phase 4)
│       ├── maps/                # Tiled JSON exports (Phase 4)
│       ├── characters/          # Player/NPC overworld sprites (Phase 4)
│       ├── ui/                  # Menu frames, HP bars, text boxes
│       └── audio/
│           ├── bgm/             # Background music
│           ├── sfx/             # Sound effects
│           └── cries/           # Pokemon cries
│
├── src/
│   ├── main.ts                  # Phaser game config & bootstrap
│   │
│   ├── scenes/
│   │   ├── BootScene.ts         # Preload all assets, show loading bar
│   │   ├── TitleScene.ts        # Title screen / main menu
│   │   ├── IntroScene.ts        # Oak's intro sequence (new game only)
│   │   ├── OverworldScene.ts    # Map exploration, NPC interaction
│   │   ├── BattleScene.ts       # Battle rendering (consumes BattleEngine)
│   │   ├── PartyScene.ts        # Pokemon party management (overlay)
│   │   ├── BagScene.ts          # Inventory UI (overlay)
│   │   ├── SummaryScene.ts      # Pokemon detail view (overlay)
│   │   └── DialogScene.ts       # Text box overlay (used by multiple scenes)
│   │
│   ├── battle/
│   │   ├── BattleEngine.ts      # Pure logic state machine — NO Phaser imports
│   │   ├── BattleState.ts       # Battle state interfaces and types
│   │   ├── DamageCalc.ts        # Gen 9 damage formula
│   │   ├── TypeChart.ts         # 18-type effectiveness matrix
│   │   ├── MoveExecutor.ts      # Move resolution and effect application
│   │   ├── AbilityHandler.ts    # Ability trigger system (event-driven)
│   │   ├── StatusHandler.ts     # Status conditions (primary + volatile)
│   │   ├── WeatherHandler.ts    # Weather effects
│   │   ├── TerrainHandler.ts    # Terrain effects
│   │   ├── StatStageHandler.ts  # Stat stage math (-6 to +6)
│   │   ├── SwitchHandler.ts     # Switch-in/out, entry hazards
│   │   ├── ItemHandler.ts       # In-battle item effects
│   │   ├── CatchHandler.ts      # Catch rate formula
│   │   ├── PriorityResolver.ts  # Turn order resolution
│   │   ├── AIController.ts      # NPC/wild battle AI
│   │   ├── BattleEventBus.ts    # Battle-specific event emitter
│   │   └── transforms/
│   │       ├── TransformBase.ts     # Abstract interface for transformations
│   │       ├── MegaEvolution.ts     # Stub
│   │       ├── Dynamax.ts           # Stub
│   │       ├── Gigantamax.ts        # Stub
│   │       └── Terastallize.ts      # Stub
│   │
│   ├── battle-ui/
│   │   ├── BattleSceneRenderer.ts   # Manages all battle visuals
│   │   ├── HPBarComponent.ts        # Animated HP bar
│   │   ├── BattleMenuComponent.ts   # Fight/Bag/Pokemon/Run menu
│   │   ├── MoveSelectComponent.ts   # Move selection with PP/type display
│   │   ├── BattleTextComponent.ts   # Battle message log with typewriter
│   │   └── BattleAnimations.ts      # Attack/faint/switch animations
│   │
│   ├── overworld/
│   │   ├── PlayerController.ts      # Grid-based movement + input
│   │   ├── NPCController.ts         # NPC behavior + line-of-sight
│   │   ├── MapManager.ts            # Tiled map loading + layer management
│   │   ├── CollisionManager.ts      # Tile + entity collision
│   │   ├── EncounterManager.ts      # Wild encounter zones + rates
│   │   ├── InteractionManager.ts    # Object interaction (signs, items, NPCs)
│   │   ├── TransitionManager.ts     # Map transitions + warps
│   │   └── CameraController.ts      # Camera follow + bounds clamping
│   │
│   ├── entities/
│   │   ├── Pokemon.ts               # Pokemon instance (individual mon)
│   │   ├── PokemonSpecies.ts        # Species data (base stats, learnsets)
│   │   ├── Move.ts                  # Move data + instance
│   │   ├── Item.ts                  # Item data + instance
│   │   ├── Trainer.ts               # NPC trainer (party, dialog, AI config)
│   │   └── Player.ts               # Player state (party, bag, position, flags)
│   │
│   ├── data/
│   │   ├── pokemon.json             # 151 species: base stats, types, abilities, learnsets
│   │   ├── moves.json               # All moves learnable by the 151
│   │   ├── abilities.json           # All abilities available to the 151
│   │   ├── items.json               # All items (pokeballs, potions, held, TMs, key)
│   │   ├── natures.json             # 25 natures + stat modifiers
│   │   ├── typeChart.json           # 18x18 effectiveness matrix
│   │   ├── experienceGroups.json    # EXP curve formulas
│   │   ├── encounterTables.json     # Per-route encounter definitions
│   │   ├── trainers.json            # NPC trainer definitions
│   │   ├── npcs.json                # NPC dialog, conditions, behaviors
│   │   └── cutscenes/
│   │       ├── intro.json           # Oak's intro sequence
│   │       ├── oak-route1.json      # Oak stops player at Route 1
│   │       ├── starter-select.json  # Lab starter selection flow
│   │       └── rival-battle.json    # Post-starter rival encounter
│   │
│   ├── systems/
│   │   ├── EventBus.ts              # Global typed pub/sub event system
│   │   ├── SaveManager.ts           # Save/load serialization
│   │   ├── AudioManager.ts          # BGM + SFX playback management
│   │   ├── InputManager.ts          # Keyboard/gamepad abstraction
│   │   ├── DataManager.ts           # Loads and caches all JSON data files
│   │   └── CutsceneManager.ts       # Scripted event sequences (dialog, movement, etc.)
│   │
│   ├── ui/
│   │   ├── MenuSystem.ts            # Start menu (Pokedex, Pokemon, Bag, Save, etc.)
│   │   ├── ShopUI.ts                # PokeMart interface
│   │   └── components/
│   │       ├── TextBox.ts           # Reusable dialog/text box
│   │       ├── ChoiceBox.ts         # Yes/No and multi-choice prompts
│   │       ├── ScrollableList.ts    # Scrollable item/move lists
│   │       └── TypeBadge.ts         # Type icon component
│   │
│   ├── utils/
│   │   ├── random.ts                # Seeded PRNG (Mulberry32)
│   │   ├── math.ts                  # Stat calc, EXP formulas, catch rate
│   │   ├── constants.ts             # Enums, magic numbers, config
│   │   └── helpers.ts               # General utility functions
│   │
│   └── types/
│       ├── pokemon.ts               # Pokemon interfaces & enums
│       ├── battle.ts                # Battle state types
│       ├── moves.ts                 # Move interfaces & effect types
│       ├── items.ts                 # Item interfaces & categories
│       ├── overworld.ts             # Map, NPC, event types
│       └── events.ts               # Event type definitions for EventBus
│
├── tests/
│   ├── battle/
│   │   ├── DamageCalc.test.ts       # Damage formula unit tests
│   │   ├── TypeChart.test.ts        # Type effectiveness tests
│   │   ├── BattleEngine.test.ts     # Full battle flow integration tests
│   │   ├── StatusHandler.test.ts    # Status condition tests
│   │   ├── AbilityHandler.test.ts   # Ability trigger tests
│   │   └── PriorityResolver.test.ts # Turn order tests
│   ├── entities/
│   │   ├── Pokemon.test.ts          # Stat calculation, level up tests
│   │   └── Player.test.ts           # Inventory management tests
│   ├── data/
│   │   └── DataValidation.test.ts   # Validates all JSON data integrity
│   └── utils/
│       ├── random.test.ts           # PRNG determinism tests
│       └── math.test.ts             # Formula tests
│
└── tools/
    └── data-importer/
        ├── README.md                # How to run importers
        ├── importPokemon.ts         # Fetches from PokeAPI → pokemon.json
        ├── importMoves.ts           # Fetches from PokeAPI → moves.json
        ├── importAbilities.ts       # Fetches from PokeAPI → abilities.json
        └── importItems.ts           # Fetches from PokeAPI → items.json
```

---

## 3. Development & Debugging Setup

### Critical for Claude Code

Claude Code needs to be able to:
1. **Run the dev server** and see errors in the terminal
2. **Run tests** and see pass/fail output
3. **Type-check** without running the game
4. **Lint** for common mistakes

### NPM Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:battle": "vitest run tests/battle/",
    "lint": "tsc --noEmit && echo 'Type check passed'",
    "import:pokemon": "tsx tools/data-importer/importPokemon.ts",
    "import:moves": "tsx tools/data-importer/importMoves.ts",
    "import:abilities": "tsx tools/data-importer/importAbilities.ts",
    "import:items": "tsx tools/data-importer/importItems.ts",
    "import:all": "npm run import:pokemon && npm run import:moves && npm run import:abilities && npm run import:items",
    "validate:data": "vitest run tests/data/"
  }
}
```

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@data/*": ["./src/data/*"],
      "@battle/*": ["./src/battle/*"],
      "@entities/*": ["./src/entities/*"],
      "@systems/*": ["./src/systems/*"],
      "@scenes/*": ["./src/scenes/*"],
      "@types/*": ["./src/types/*"],
      "@utils/*": ["./src/utils/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "tools/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './src/data'),
      '@battle': path.resolve(__dirname, './src/battle'),
      '@entities': path.resolve(__dirname, './src/entities'),
      '@systems': path.resolve(__dirname, './src/systems'),
      '@scenes': path.resolve(__dirname, './src/scenes'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',  // Battle engine tests don't need DOM
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/battle/**', 'src/entities/**', 'src/utils/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './src/data'),
      '@battle': path.resolve(__dirname, './src/battle'),
      '@entities': path.resolve(__dirname, './src/entities'),
      '@systems': path.resolve(__dirname, './src/systems'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
});
```

### Debugging Workflow for Claude Code

**Step 1: Type checking** — Run `npm run typecheck` after every significant code change. This catches most errors without needing to launch the game.

**Step 2: Unit tests** — Run `npm run test:battle` to verify battle logic. The battle engine has ZERO Phaser dependencies, so tests run instantly in Node.js.

**Step 3: Dev server** — Run `npm run dev` and check the browser console for runtime errors. Vite provides clear error overlay with stack traces.

**Step 4: Data validation** — Run `npm run validate:data` to ensure all JSON data files are structurally valid and cross-reference correctly (e.g., every move ID referenced in a learnset exists in moves.json).

### Debug Utilities

Create `src/utils/debug.ts`:
```typescript
// Global debug flag — set via URL param ?debug=true
export const DEBUG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('debug');

export function debugLog(system: string, ...args: unknown[]): void {
  if (DEBUG) {
    console.log(`[${system}]`, ...args);
  }
}

// Battle engine debug — dumps full state to console
export function dumpBattleState(state: BattleState): void {
  if (DEBUG) {
    console.group('Battle State');
    console.log('Turn:', state.turnNumber);
    console.log('Phase:', state.phase);
    console.log('Weather:', state.weather);
    console.log('Terrain:', state.terrain);
    console.log('Player Active:', state.sides[0].activePokemon?.pokemon.nickname);
    console.log('Opponent Active:', state.sides[1].activePokemon?.pokemon.nickname);
    console.groupEnd();
  }
}
```

---


---

## 15. Coding Standards

### For Claude Code

- **Always run `npm run typecheck` after significant changes.** This is the fastest way to catch errors.
- **Write tests for battle logic FIRST, then implement.** TDD works extremely well for the battle engine because the expected behavior is well-documented (Bulbapedia, Showdown).
- **Never import Phaser in `src/battle/` files.** The battle engine must remain pure TypeScript for testability and future server-side use.
- **Use the EventBus for all cross-system communication.** Don't have scenes directly call each other's methods.
- **Every function that uses randomness must take a `SeededRandom` instance.** Never use `Math.random()`.
- **Prefer `readonly` arrays and objects** in interfaces where mutation isn't intended.
- **Use discriminated unions** for move effects, battle actions, and events. The `type` field on each union member enables exhaustive switch statements with TypeScript's type narrowing.
- **All JSON data files are loaded once in BootScene** and accessed via DataManager. Never fetch data at runtime.
- **Path aliases** (`@battle/`, `@entities/`, etc.) must be used for imports. No relative path hell.
- **Console errors in the browser dev tools indicate bugs.** Fix them before moving on.
- **When in doubt about battle mechanics**, reference Bulbapedia's Gen 9 mechanics pages or Pokémon Showdown's open-source implementation at `github.com/smogon/pokemon-showdown`.
