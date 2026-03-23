# @pokemon-lib-ts/gen6

Gen 6 (X/Y/Omega Ruby/Alpha Sapphire) battle mechanics and complete Pokemon data.

## Features

- **Gen6Ruleset** — extends `BaseRuleset` with Gen 6-specific overrides
- **721 Pokemon** with accurate Gen 6 base stats (includes Fairy-type reclassifications)
- **634 moves** including Gen 6 additions (Moonblast, Play Rough, Sticky Web, etc.)
- **Fairy type** — 18th type; immune to Dragon, resists Fighting/Dark/Bug; weak to Poison/Steel
- **Mega Evolution** — temporary in-battle transformation; boosts stats and sometimes changes ability/type
- **Sticky Web** entry hazard — lowers Speed of grounded Pokemon that switch in
- **Stance Change** ability (Aegislash) — switches between Blade and Shield forme
- **Weather nerf** — permanent weather abilities reduced back to 5-turn limit (like Gen 3)
- **Knock Off buff** — now 65 base power; 97.5 BP when knocking off a held item

## Installation

```bash
npm install @pokemon-lib-ts/gen6 @pokemon-lib-ts/battle @pokemon-lib-ts/core
```

## Usage

```typescript
import { Gen6Ruleset, createGen6DataManager } from "@pokemon-lib-ts/gen6";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 6 data
const dm = createGen6DataManager();
const sylveon = dm.getSpecies(700);
console.log(sylveon.baseStats);
// { hp: 95, attack: 65, defense: 65, spAttack: 110, spDefense: 130, speed: 60 }

const moonblast = dm.getMove("moonblast");
console.log(moonblast.power, moonblast.type); // 95, 'fairy'

// Create a Gen 6 battle
const ruleset = new Gen6Ruleset();
const engine = new BattleEngine(
  { generation: 6, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Gen 6 Key Mechanics

| Mechanic | Behavior |
|----------|----------|
| Fairy type | 18th type; Dragon immunity, weak to Poison/Steel |
| Mega Evolution | 1 per battle; triggers on move selection; changes stats/ability |
| Sticky Web | Entry hazard; -1 Speed to grounded switch-ins |
| Stance Change | Aegislash: Blade Forme when attacking, Shield Forme after King's Shield |
| Weather | Permanent weather abilities reverted to 5-turn limit |
| Knock Off | 65 BP; +50% damage when removing a held item |
| Critical hits | 1/16 base rate; Lucky Punch/Razor Claw remain |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
