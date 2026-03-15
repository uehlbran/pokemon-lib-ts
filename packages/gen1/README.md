# @pokemon-lib-ts/gen1

Gen 1 (Red/Blue/Yellow) battle mechanics and complete Pokemon data.

## Features

- **Gen1Ruleset** — implements `GenerationRuleset` directly (not extending BaseRuleset)
- **151 Pokemon** with accurate Gen 1 base stats (unified Special stat)
- **164 moves** with type-based physical/special categorization
- **15-type chart** with the Ghost vs Psychic immunity bug
- **Gen 1 mechanics**: speed-based crit rate, Focus Energy bug, 1/256 miss glitch, permanent freeze, Hyper Beam no-recharge-on-KO

## Installation

```bash
npm install @pokemon-lib-ts/gen1 @pokemon-lib-ts/battle @pokemon-lib-ts/core
```

## Usage

```typescript
import { Gen1Ruleset, createGen1DataManager } from "@pokemon-lib-ts/gen1";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 1 data
const dm = createGen1DataManager();
const charizard = dm.getSpecies(6);
console.log(charizard.baseStats); // { hp: 78, attack: 84, defense: 78, spAttack: 85, spDefense: 85, speed: 100 }

// Create a Gen 1 battle
const ruleset = new Gen1Ruleset();
const engine = new BattleEngine(
  { generation: 1, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);
```

## Gen 1 Quirks Implemented

| Mechanic | Behavior |
|----------|----------|
| Physical/Special | Determined by **type**, not per-move |
| Critical hits | Based on **base Speed** stat, not stages |
| Focus Energy | **Divides** crit rate by 4 (bug) |
| Ghost vs Psychic | **Immunity** instead of super effective (bug) |
| 1/256 miss | Even 100% accuracy moves can miss |
| Freeze | **Permanent** until hit by Fire move |
| Sleep | 1-7 turns |
| No abilities | `hasAbilities() = false` |
| No held items | `hasHeldItems() = false` |
| No weather | `hasWeather() = false` |

## License

MIT
