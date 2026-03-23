# @pokemon-lib-ts/gen8

Gen 8 (Sword/Shield) battle mechanics and complete Pokemon data.

## Features

- **Gen8Ruleset** — extends `BaseRuleset` with Gen 8-specific overrides
- **664 Pokemon** (Galar Dex — not all 890 total; reflects Sword/Shield availability)
- **646 moves** including Gen 8 additions
- **Dynamax** — any Pokemon can Dynamax; triples HP, replaces moves with Max Moves
- **Gigantamax** — special Dynamax form for select Pokemon; unique G-Max Move with bonus effects
- **Galarian Forms** — regional variants (Galarian Rapidash, Corsola, Darmanitan, etc.)
- **Choice lock during Dynamax** — choosing a Max Move does not lock the Choice item's move; correctly handled on exit
- **New abilities** — Libero (like Protean), Steam Engine, Mimicry, Wandering Spirit, etc.
- **New moves** — Fishious Rend, Bolt Beak, Drum Beating, Steel Roller, etc.

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
import { Gen8Ruleset, createGen8DataManager } from "@pokemon-lib-ts/gen8";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 8 data
const dm = createGen8DataManager();
const cinderace = dm.getSpecies(815);
console.log(cinderace.baseStats);
// { hp: 80, attack: 116, defense: 75, spAttack: 65, spDefense: 75, speed: 119 }

const pyroBall = dm.getMove("pyro-ball");
console.log(pyroBall.power, pyroBall.type); // 120, 'fire'

// Create a Gen 8 battle
const ruleset = new Gen8Ruleset();
const engine = new BattleEngine(
  { generation: 8, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Gen 8 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Dynamax | Any Pokemon; 3 turns; triples HP; moves become Max Moves |
| Gigantamax | Special Dynamax; replaces Max Move with unique G-Max Move |
| Max Moves | Base power by category; always hit; no secondary effects |
| Choice + Dynamax | Max Moves don't trigger Choice lock; original move locked on exit |
| Galarian Forms | Different type/ability from Kanto/Johto originals |
| Libero | Like Protean — changes type to match move used; fires once per switch |
| Disguise | Mimikyu blocks first hit; takes 1/8 max HP chip damage on break |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
