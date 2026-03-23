# @pokemon-lib-ts/gen3

Gen 3 (Ruby/Sapphire/Emerald) battle mechanics and complete Pokemon data.

## Features

- **Gen3Ruleset** — extends `BaseRuleset` with Gen 3-specific overrides
- **386 Pokemon** with accurate Gen 3 base stats
- **370 moves** including Gen 3 additions (Earthquake, Flamethrower, etc.)
- **Abilities system** — first generation with abilities (Intimidate, Levitate, Swift Swim, etc.)
- **Natures** — 25 natures with stat modifiers (+10% / -10%)
- **Modern IV/EV system** — IVs 0-31, EVs 0-255 (252 cap per stat), replaces DVs/Stat EXP
- **Physical/Special split by type** (not yet per-move — that comes in Gen 4)
- **Weather** — extended weather system with ability interactions (Swift Swim, Sand Stream, etc.)
- **Held items** — full Gen 3 item list including competitive items (Choice Band, Lum Berry, etc.)

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
import { Gen3Ruleset, createGen3DataManager } from "@pokemon-lib-ts/gen3";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 3 data
const dm = createGen3DataManager();
const blaziken = dm.getSpecies(257);
console.log(blaziken.baseStats);
// { hp: 80, attack: 120, defense: 70, spAttack: 110, spDefense: 70, speed: 80 }

const flamethrower = dm.getMove("flamethrower");
console.log(flamethrower.power, flamethrower.type); // 95, 'fire'

// Create a Gen 3 battle
const ruleset = new Gen3Ruleset();
const engine = new BattleEngine(
  { generation: 3, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Gen 3 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Physical/Special | Still determined by **type** (per-move split is Gen 4+) |
| Abilities | First gen with abilities; ~100 abilities implemented |
| Natures | 25 natures, +10%/-10% to two stats |
| IVs/EVs | Modern system: IVs 0-31, EVs 0-252 per stat |
| Critical hits | Fixed 1/16 base rate (no longer Speed-based) |
| Weather | Abilities interact with weather (Swift Swim doubles Speed in rain) |
| Double battles | Introduced in Gen 3 (engine currently implements singles) |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
