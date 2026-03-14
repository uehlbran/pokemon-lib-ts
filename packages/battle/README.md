# @pokemon-lib/battle

Pluggable Pokemon battle engine. Bring your own generation ruleset.

## Features

- **GenerationRuleset interface** — ~20 methods defining gen-specific behavior (damage calc, type chart, crit formula, turn order, etc.)
- **BaseRuleset** — abstract class with Gen 3+ defaults
- **BattleEngine** — state machine: start, action select, turn resolve, end of turn, faint check, battle end
- **Event-driven** — emits 35+ event types for UI rendering, logging, replay
- **Deterministic** — same seed + same inputs = same outputs
- **AI controllers** — RandomAI included, interface for custom AI

## Installation

```bash
npm install @pokemon-lib/battle @pokemon-lib/core
```

## Usage

```typescript
import { BattleEngine } from "@pokemon-lib/battle";
import { Gen1Ruleset, createGen1DataManager } from "@pokemon-lib/gen1";

const dm = createGen1DataManager();
const ruleset = new Gen1Ruleset();

const engine = new BattleEngine(
  { generation: 1, format: "singles", teams: [team1, team2], seed: 42 },
  ruleset,
  dm
);

engine.on((event) => {
  switch (event.type) {
    case "damage":
      console.log(`${event.pokemon} took ${event.amount} damage!`);
      break;
    case "faint":
      console.log(`${event.pokemon} fainted!`);
      break;
  }
});

engine.start();
engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
```

## License

MIT
