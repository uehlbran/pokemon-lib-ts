# @pokemon-lib-ts/gen5

Gen 5 (Black/White/Black 2/White 2) battle mechanics and complete Pokemon data.

## Features

- **Gen5Ruleset** — extends `BaseRuleset` with Gen 5-specific overrides
- **649 Pokemon** with accurate Gen 5 base stats
- **575 moves** including Gen 5 additions (Wild Charge, Heavy Slam, Stored Power, etc.)
- **Weather abilities** — Drizzle/Drought/Sand Stream/Snow Warning now last the whole battle (no 5-turn limit)
- **Illusion** ability — Zoroark disguises itself as the last Pokemon in the party
- **Moody** ability — randomly raises one stat by 2 stages and lowers another by 1 each turn
- **Turboblaze/Teravolt** — like Mold Breaker but for legendaries
- **New moves** — Scald (burn chance from Water), Hurricane (30% confuse), Quiver Dance, Shell Smash, etc.

## Installation

```bash
npm install @pokemon-lib-ts/gen5 @pokemon-lib-ts/battle @pokemon-lib-ts/core
```

## Usage

```typescript
import { Gen5Ruleset, createGen5DataManager } from "@pokemon-lib-ts/gen5";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 5 data
const dm = createGen5DataManager();
const hydreigon = dm.getSpecies(635);
console.log(hydreigon.baseStats);
// { hp: 92, attack: 105, defense: 90, spAttack: 125, spDefense: 90, speed: 98 }

const scald = dm.getMove("scald");
console.log(scald.power, scald.type); // 80, 'water'

// Create a Gen 5 battle
const ruleset = new Gen5Ruleset();
const engine = new BattleEngine(
  { generation: 5, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Gen 5 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Permanent weather | Drizzle/Drought/Sand Stream/Snow Warning last indefinitely |
| Illusion | Zoroark appears as last party member; breaks on taking damage |
| Moody | +2 to one random stat, -1 to another, each end of turn |
| Scald | Water-type move with 30% burn chance (notable for hitting physical attackers) |
| Shell Smash | -1 Def/SpDef, +2 Atk/SpAtk/Speed |
| Critical hits | 1/16 base rate (unchanged); new items affect rate |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
