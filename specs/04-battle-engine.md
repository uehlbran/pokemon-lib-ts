# Pokemon Fan Game — Battle Engine

> Battle state machine, Gen 9 damage formula, turn order resolution, AI controller, and architecture notes.
> This system has ZERO Phaser dependencies — pure TypeScript, fully unit testable.

---

## 7. Battle Engine

### 7.1 Architecture

The battle engine is a **pure TypeScript state machine** with NO Phaser dependencies. It:
1. Receives actions as input (move choice, switch, item use, run)
2. Resolves the turn deterministically
3. Emits events describing what happened
4. Updates the battle state

The `BattleScene` (Phaser) subscribes to these events and animates them. This separation means:
- Battle logic is unit-testable without a browser
- The same engine runs server-side for multiplayer
- Events form a complete replay log

### 7.2 Battle State Machine

```
BATTLE_START → TURN_START → ACTION_SELECT → TURN_RESOLVE → TURN_END → FAINT_CHECK
                   ↑                                                        │
                   └────────────── (battle continues) ─────────────────────┘
                                                                            │
                                                                     BATTLE_END
```

**Phases in detail:**

| Phase | Description | Events Emitted |
|-------|-------------|----------------|
| `BATTLE_START` | Send out lead Pokemon. Trigger entry abilities (Intimidate, Weather setters, Terrain setters). Apply entry hazards if switching in after a faint. | `battle:start`, `battle:switch`, `battle:stat-change`, `battle:weather`, etc. |
| `TURN_START` | Increment turn counter. Check for weather/terrain turn countdown (do NOT apply damage here). | `battle:turn-start` |
| `ACTION_SELECT` | Wait for both sides to choose: Fight, Bag, Pokemon (switch), Run. AI chooses simultaneously. | (No events — waiting for input) |
| `TURN_RESOLVE` | Sort actions by priority bracket → speed → random tiebreak. Execute in order. For each action: pre-move checks (flinch, sleep, confusion, paralysis) → execute move → post-move effects (recoil, Life Orb, contact ability triggers). | `battle:move-used`, `battle:damage`, `battle:status`, `battle:stat-change`, `battle:message` |
| `TURN_END` | In order: weather damage (sand/hail), status damage (burn/poison), Leech Seed, Leftovers/Black Sludge, Aqua Ring, Ingrain, terrain heal (Grassy Terrain), Wish, Future Sight/Doom Desire, perish count, weather/terrain/screen turn countdown. | `battle:damage`, `battle:message` |
| `FAINT_CHECK` | Check if any Pokemon fainted. If so, prompt for switch-in. Apply entry hazards + abilities on switch-in. If all Pokemon on one side fainted → `BATTLE_END`. | `battle:faint`, `battle:switch` |
| `BATTLE_END` | Calculate EXP gains, EV gains. Check for level ups. Check for evolution triggers. | `battle:end`, `player:level-up`, `player:evolution` |

### 7.3 Gen 9 Damage Formula

```typescript
function calculateDamage(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  battleState: BattleState,
  rng: SeededRandom
): DamageResult {
  // Step 1: Base damage
  const level = attacker.pokemon.level;
  const power = getEffectivePower(move, attacker, defender, battleState);
  const [A, D] = getAttackDefense(move, attacker, defender, battleState);

  let baseDamage = Math.floor(
    Math.floor(
      Math.floor((2 * level) / 5 + 2) * power * A / D
    ) / 50 + 2
  );

  // Step 2: Apply modifiers (each followed by Math.floor for integer truncation)
  // Order matters! This is the Gen 9 order per Bulbapedia.

  // Targets modifier (0.75 in doubles if hitting multiple targets, 1.0 in singles)
  baseDamage = applyModifier(baseDamage, 1.0); // Always 1.0 in singles

  // Parental Bond second hit (0.25)
  // Not applicable in v1

  // Weather
  const weatherMod = getWeatherModifier(move.type, battleState.weather.type);
  baseDamage = applyModifier(baseDamage, weatherMod);

  // Critical hit (1.5)
  const isCrit = rollCritical(attacker, move, rng);
  if (isCrit) baseDamage = applyModifier(baseDamage, 1.5);

  // Random factor (0.85 to 1.00, inclusive, in integer steps of 0.01)
  const randomFactor = rng.int(85, 100) / 100;
  baseDamage = applyModifier(baseDamage, randomFactor);

  // STAB (1.5, or 2.0 with Adaptability)
  const stabMod = getStabModifier(move.type, attacker);
  baseDamage = applyModifier(baseDamage, stabMod);

  // Type effectiveness
  const effectiveness = getTypeEffectiveness(move.type, defender.types, battleState);
  baseDamage = applyModifier(baseDamage, effectiveness);

  // Burn (0.5 on physical moves, unless Guts or Facade)
  if (attacker.pokemon.status === 'burn' && move.category === 'physical') {
    if (attacker.ability !== 'guts' && move.id !== 'facade') {
      baseDamage = applyModifier(baseDamage, 0.5);
    }
  }

  // Minimum 1 damage if move hits
  baseDamage = Math.max(1, baseDamage);

  return {
    damage: baseDamage,
    effectiveness,
    isCrit,
    randomFactor,
  };
}

function applyModifier(value: number, modifier: number): number {
  return Math.floor(value * modifier);
}
```

### 7.4 Turn Order Resolution

```typescript
function resolveTurnOrder(
  actions: [BattleAction, BattleAction], // [player, opponent]
  battleState: BattleState,
  rng: SeededRandom
): BattleAction[] {
  // 1. Switches ALWAYS go first (in speed order among switches)
  // 2. Items go next (in speed order among items)
  // 3. Moves sorted by:
  //    a. Priority bracket (higher priority goes first)
  //    b. Within same priority: speed (higher speed goes first)
  //    c. Trick Room reverses speed comparison
  //    d. Speed tie: random 50/50

  // Pursuit special case: if foe is switching out and this side uses Pursuit,
  // Pursuit goes before the switch (at doubled power)
}
```

### 7.5 AI Controller

For v1, simple but functional:

```typescript
class AIController {
  // Wild Pokemon: pick a random move from available moves
  chooseWildAction(pokemon: ActivePokemon, battleState: BattleState): BattleAction;

  // Trainer AI tiers:
  // Tier 1 (basic): Random moves
  // Tier 2 (smart): Prefer super-effective moves, avoid ineffective
  // Tier 3 (competitive): Consider stat boosts, status, switching, prediction
  chooseTrainerAction(
    trainer: Trainer,
    pokemon: ActivePokemon,
    battleState: BattleState,
    tier: 1 | 2 | 3
  ): BattleAction;
}
```

---

