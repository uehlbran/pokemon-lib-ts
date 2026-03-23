# @pokemon-lib-ts/gen9

Gen 9 (Scarlet/Violet) battle mechanics and complete Pokemon data.

## Features

- **Gen9Ruleset** — extends `BaseRuleset` with Gen 9-specific overrides
- **733 Pokemon** (Paldea Dex — reflects Scarlet/Violet base game availability)
- **685 moves** including Gen 9 additions
- **Terastallization** — changes a Pokemon's type to its Tera Type; boosts STAB moves; one per battle
- **Snow** weather — replaces Hail; raises Ice-type Defense (instead of Hail chip damage)
- **Shed Tail** — creates a substitute, then switches out (Cyclizar)
- **Focus Sash** / **Sturdy** — survive a OHKO from full HP; correctly handles multi-hit edge cases
- **New abilities** — Protosynthesis, Quark Drive, Hadron Engine, Good as Gold, Vessel of Ruin, etc.
- **Paradox Pokemon** — Past/Future forms (Great Tusk, Iron Treads, etc.)

## Installation

```bash
npm install @pokemon-lib-ts/gen9 @pokemon-lib-ts/battle @pokemon-lib-ts/core
```

## Usage

```typescript
import { Gen9Ruleset, createGen9DataManager } from "@pokemon-lib-ts/gen9";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 9 data
const dm = createGen9DataManager();
const koraidon = dm.getSpecies(1007);
console.log(koraidon.baseStats);
// { hp: 100, attack: 135, defense: 115, spAttack: 85, spDefense: 100, speed: 135 }

const collisionCourse = dm.getMove("collisioncourse");
console.log(collisionCourse.power, collisionCourse.type); // 100, 'fighting'

// Create a Gen 9 battle
const ruleset = new Gen9Ruleset();
const engine = new BattleEngine(
  { generation: 9, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Gen 9 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Terastallization | Changes type to Tera Type; STAB on Tera Type moves; one use per battle |
| Snow | Replaces Hail; Ice-types gain +50% Defense (Hail chip removed) |
| Shed Tail | Creates a substitute, then switches out the user |
| Protosynthesis | Boosts highest stat in sun or while holding Booster Energy |
| Quark Drive | Boosts highest stat in electric terrain or while holding Booster Energy |
| Good as Gold | Immune to status moves targeting the Pokemon directly |
| Focus Sash | Survive any hit from full HP with 1 HP remaining |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
