# @pokemon-lib-ts/gen2

Gen 2 (Gold/Silver/Crystal) battle mechanics and complete Pokemon data.

## Features

- **Gen2Ruleset** — implements `GenerationRuleset` directly (not extending BaseRuleset)
- **251 Pokemon** with accurate Gen 2 base stats (Special Attack / Special Defense split)
- **267 moves** with type-based physical/special categorization
- **17-type chart** — adds Dark and Steel types; fixes Ghost vs Psychic bug from Gen 1
- **Held items** — Leftovers, type-boosting items, berries (first gen with held items)
- **Weather** — Rain Dance, Sunny Day, Sandstorm (5 turns each)
- **Gen 2 mechanics**: stage-based crit system (Focus Energy bug fixed), freeze thaw chance, sleep wake-on-attack, Spikes entry hazard, Toxic counter resets on switch

## Installation

```bash
npm install @pokemon-lib-ts/gen2 @pokemon-lib-ts/battle @pokemon-lib-ts/core
```

## Usage

```typescript
import { Gen2Ruleset, createGen2DataManager } from "@pokemon-lib-ts/gen2";
import { BattleEngine } from "@pokemon-lib-ts/battle";

// Load Gen 2 data
const dm = createGen2DataManager();
const typhlosion = dm.getSpecies(157);
console.log(typhlosion.baseStats);
// { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 }

const surf = dm.getMove("surf");
console.log(surf.power, surf.type); // 95, 'water'

// Create a Gen 2 battle
const ruleset = new Gen2Ruleset();
const engine = new BattleEngine(
  { generation: 2, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => console.log(event));
engine.start();
```

## Gen 2 Mechanics

| Mechanic | Behavior |
|----------|----------|
| Physical/Special | Determined by **type**, not per-move (same as Gen 1) |
| Critical hits | **Stage-based** system; Focus Energy bug fixed |
| Ghost vs Psychic | **2x super effective** (Gen 1 bug fixed) |
| Freeze | ~9.8% (25/256) thaw chance per turn (no longer permanent) |
| Sleep | Can attack on the turn you wake up |
| Toxic | Counter **resets on switch** |
| Held items | Leftovers (1/16 HP/turn), type boost (+10%), berries |
| Entry hazards | Spikes (1 layer, 1/8 HP; bypassed by Flying-types) |
| New types | Dark (immune to Psychic), Steel (many resistances) |
| No abilities | `hasAbilities() = false` |
| No natures | No nature stat modifiers |

## License

MIT

Pokemon is a trademark of Nintendo, Game Freak, and Creatures Inc. This is a fan project for educational and non-commercial purposes.
