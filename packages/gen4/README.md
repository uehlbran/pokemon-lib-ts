# @pokemon-lib-ts/gen4

Gen 4 (Diamond/Pearl/Platinum/HeartGold/SoulSilver) battle mechanics and complete Pokemon data.

## Features

- **Gen4Ruleset** — extends `BaseRuleset` with Gen 4-specific overrides
- **493 Pokemon** with accurate Gen 4 base stats
- **483 moves** including Gen 4 additions (Stealth Rock, U-turn, Trick Room, etc.)
- **Physical/Special split per move** — the defining change of Gen 4; each move is now individually classified
- **Stealth Rock** entry hazard (type-based damage scaling)
- **Mold Breaker** ability bypass mechanic
- **New abilities** — Adaptability, Download, Filter, Solid Rock, Storm Drain, etc.
- **New moves** — Trick Room, Gravity, Magnet Rise, Aqua Jet, Vacuum Wave, etc.

## Installation

These packages are not yet published to npm. Clone the monorepo and build from the root:

```bash
git clone https://github.com/uehlbran/pokemon-lib-ts.git
cd pokemon-lib-ts
npm install
npm run build
```

## Usage

```typescript
import {
  GEN4_MOVE_IDS,
  GEN4_WEATHER_DAMAGE_MULTIPLIERS,
  Gen4Ruleset,
  createGen4DataManager,
} from "@pokemon-lib-ts/gen4";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 4 data
const dm = createGen4DataManager();
const garchomp = dm.getSpecies(445);
console.log(garchomp.baseStats);
// { hp: 108, attack: 130, defense: 95, spAttack: 80, spDefense: 85, speed: 102 }

const earthquake = dm.getMove(GEN4_MOVE_IDS.earthquake);
console.log(earthquake.power, earthquake.category); // 100, 'physical'

const shadowBall = dm.getMove(GEN4_MOVE_IDS.shadowBall);
console.log(shadowBall.power, shadowBall.category); // 80, 'special'
console.log(GEN4_WEATHER_DAMAGE_MULTIPLIERS.sunFireBoost); // 1.5

// Create a Gen 4 battle
const ruleset = new Gen4Ruleset();
const engine = new BattleEngine(
  { generation: 4, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Test/Reference Exports

- `GEN4_*_IDS` exports are generated from the committed Gen 4 `data/*.json` bundle and are the preferred source for canonical move/item/ability/species ids in tests.
- `GEN4_WEATHER_DAMAGE_MULTIPLIERS` exposes Gen 4-owned weather damage multipliers so tests do not duplicate mechanic literals.

## Gen 4 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Physical/Special | **Per-move** classification (not by type like Gen 1-3) |
| Stealth Rock | Entry hazard; damage scales with type effectiveness (1/8 to 1/2 HP) |
| Trick Room | Reverses turn order for 5 turns |
| Mold Breaker | Ignores target's ability during damage/accuracy calculation |
| Adaptability | STAB bonus becomes 2x instead of 1.5x |
| Critical hits | 1/16 base rate (unchanged from Gen 3) |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
