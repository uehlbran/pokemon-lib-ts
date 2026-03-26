# @pokemon-lib-ts/gen7

Gen 7 (Sun/Moon/Ultra Sun/Ultra Moon) battle mechanics and complete Pokemon data.

## Features

- **Gen7Ruleset** — extends `BaseRuleset` with Gen 7-specific overrides
- **807 Pokemon** with accurate Gen 7 base stats (includes Alolan Forms)
- **690 moves** including Gen 7 additions and Z-Moves
- **Z-Moves** — one-time-use powered-up moves; each type has a base Z-Move; signature Z-Moves for specific Pokemon
- **Alolan Forms** — regional variants of Gen 1 Pokemon with different types and abilities (Alolan Raichu, Ninetales, Marowak, etc.)
- **Tapu terrain abilities** — Grassy/Misty/Electric/Psychic Terrain set on entry
- **Ultra Burst** — Necrozma's transformation (Ultra Necrozma)
- **Disguise** ability (Mimikyu) — blocks one hit, then chip damage on break
- **Beast Boost** / **Moxie** — stat raise after KO mechanics implemented
- **New moves** — Spectral Thief, Shore Up, Moongeist Beam, Sunsteel Strike, etc.

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
  GEN7_MOVE_IDS,
  GEN7_WEATHER_DAMAGE_MULTIPLIERS,
  Gen7Ruleset,
  createGen7DataManager,
} from "@pokemon-lib-ts/gen7";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 7 data
const dm = createGen7DataManager();
const mimikyu = dm.getSpecies(778);
console.log(mimikyu.baseStats);
// { hp: 55, attack: 90, defense: 80, spAttack: 50, spDefense: 105, speed: 96 }

const playRough = dm.getMove(GEN7_MOVE_IDS.playRough);
console.log(playRough.power, playRough.type); // 90, 'fairy'
console.log(GEN7_WEATHER_DAMAGE_MULTIPLIERS.rainWaterBoost); // 1.5

// Create a Gen 7 battle
const ruleset = new Gen7Ruleset();
const engine = new BattleEngine(
  { generation: 7, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Test/Reference Exports

- `GEN7_*_IDS` exports are generated from the committed Gen 7 `data/*.json` bundle and are the preferred source for canonical move/item/ability/species ids in tests.
- `GEN7_WEATHER_DAMAGE_MULTIPLIERS` exposes Gen 7-owned weather damage multipliers so tests do not duplicate mechanic literals.

## Gen 7 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Z-Moves | One per battle per Pokemon; uses Z-Crystal held item |
| Terrain | Grassy/Misty/Electric/Psychic; set by Tapu abilities or moves |
| Alolan Forms | Different type/ability/stats from Kanto originals |
| Disguise | Mimikyu blocks first hit; takes 1/8 max HP chip damage on break |
| Beast Boost | Raises the highest stat after each KO (Ultra Beasts) |
| Ultra Burst | Necrozma fuses with Solgaleo/Lunala in battle |
| Rayquaza Mega | Can Mega Evolve without holding Mega Stone (needs Dragon Ascent) |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
