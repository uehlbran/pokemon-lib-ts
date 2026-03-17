<!-- SPEC FRONT-MATTER -->
<!-- status: IMPLEMENTED -->
<!-- last-updated: 2026-03-15 -->

# Battle Library — Core Engine

> **Status: IMPLEMENTED** — Turn loop and mechanics implemented in `packages/battle/src/engine/BattleEngine.ts`. Known delegation bugs flagged below.

> The shared battle engine that all generations use. Covers the state machine implementation,
> turn resolution loop, switch handling, end-of-turn processing, and win condition checks.
>
> This file describes the engine's "skeleton" — the parts that DON'T change between generations.
> Generation-specific behavior is delegated to the `GenerationRuleset` interface (see 00-architecture.md).

---

## Quick Start for AI Agents

**Entry point**: `packages/battle/src/engine/BattleEngine.ts`

**Turn flow**: `TURN_START → action selection → priority sort → TURN_RESOLVE (accuracy check → move execution → damage/effects → ability triggers) → TURN_END → weather/status ticks → FAINT_CHECK → next turn or game over`

**Key delegation pattern**: The engine delegates ALL gen-specific behavior to `GenerationRuleset`. Never add gen-specific code to the engine.

**End-of-turn delegation**: `ruleset.getEndOfTurnOrder()` returns an array like `["status-damage", "leech-seed", "weather"]`. The engine iterates this array in order.

**Known delegation bugs** (flagged for separate fix):
- Leech Seed drain: hardcoded to `maxHp/8` at ~line 1588; Gen 1 should be `maxHp/16`. Should call `ruleset.calculateLeechSeedDrain()`.
- Curse damage: hardcoded to `maxHp/4` at ~line 1658; should call `ruleset.calculateCurseDamage()`.
- Nightmare damage: hardcoded to `maxHp/4` at ~line 1681; should call `ruleset.calculateNightmareDamage()`.

---

## 1. BattleEngine Implementation

### 1.1 Construction & Initialization

```typescript
export class BattleEngine implements BattleEventEmitter {
  readonly state: BattleState;
  private readonly ruleset: GenerationRuleset;
  private readonly dataManager: DataManager;
  private listeners: Set<BattleEventListener> = new Set();
  private eventLog: BattleEvent[] = [];
  private pendingActions: Map<0 | 1, BattleAction> = new Map();

  constructor(config: BattleConfig, dataManager: DataManager) {
    this.ruleset = generations.get(config.generation);
    this.dataManager = dataManager;

    this.state = {
      phase: 'BATTLE_START',
      generation: config.generation,
      format: config.format,
      turnNumber: 0,
      sides: [
        this.createSide(0, config.teams[0], config.trainers?.[0] ?? null),
        this.createSide(1, config.teams[1], config.trainers?.[1] ?? null),
      ],
      weather: null,
      terrain: null,
      trickRoom: { active: false, turnsLeft: 0 },
      magicRoom: { active: false, turnsLeft: 0 },
      wonderRoom: { active: false, turnsLeft: 0 },
      gravity: { active: false, turnsLeft: 0 },
      turnHistory: [],
      rng: new SeededRandom(config.seed),
      ended: false,
      winner: null,
    };
  }
}
```

### 1.2 Starting the Battle

```typescript
start(): void {
  this.emit({ type: 'battle-start', format: this.state.format, generation: this.state.generation });

  // Send out lead Pokémon for each side
  for (const side of this.state.sides) {
    this.sendOut(side, 0); // First Pokémon in team
  }

  // Apply entry abilities (Intimidate, weather setters, terrain setters)
  // Order: faster Pokémon's ability triggers first
  const entryOrder = this.getSpeedOrder([
    { side: 0, pokemon: this.state.sides[0].active[0]! },
    { side: 1, pokemon: this.state.sides[1].active[0]! },
  ]);

  for (const { side, pokemon } of entryOrder) {
    if (this.ruleset.hasAbilities()) {
      this.ruleset.applyAbility('on-switch-in', {
        pokemon,
        opponent: this.getOpponentActive(side),
        state: this.state,
        rng: this.state.rng,
        trigger: 'on-switch-in',
      });
    }
  }

  this.transitionTo('ACTION_SELECT');
}
```

---

## 2. Turn Resolution Loop

This is the heart of the battle engine. When both sides have submitted actions, the turn resolves.

### 2.1 Full Turn Flow

```typescript
private resolveTurn(): void {
  const actions = [
    this.pendingActions.get(0)!,
    this.pendingActions.get(1)!,
  ];
  this.pendingActions.clear();

  // --- TURN_START ---
  this.transitionTo('TURN_START');
  this.state.turnNumber++;
  this.emit({ type: 'turn-start', turnNumber: this.state.turnNumber });

  // --- TURN_RESOLVE ---
  this.transitionTo('TURN_RESOLVE');

  // Sort actions by priority → speed → random
  const orderedActions = this.ruleset.resolveTurnOrder(
    actions,
    this.state,
    this.state.rng
  );

  // Execute each action in order
  for (const action of orderedActions) {
    // Check if the acting Pokémon fainted before it could act
    const actor = this.getActive(action.side);
    if (!actor || actor.pokemon.currentHp <= 0) continue;

    switch (action.type) {
      case 'move':
        this.executeMove(action, actor);
        break;
      case 'switch':
        this.executeSwitch(action);
        break;
      case 'item':
        this.executeItem(action);
        break;
      case 'run':
        this.executeRun(action);
        break;
      case 'recharge':
        this.emit({ type: 'message', text: `${this.getName(actor)} must recharge!` });
        break;
      case 'struggle':
        this.executeStruggle(action, actor);
        break;
    }

    // Check for faints after each action
    this.checkMidTurnFaints();
  }

  // --- TURN_END ---
  this.transitionTo('TURN_END');
  this.processEndOfTurn();

  // --- FAINT_CHECK ---
  this.transitionTo('FAINT_CHECK');
  if (this.checkBattleEnd()) {
    this.transitionTo('BATTLE_END');
    return;
  }

  // If any Pokémon need replacement, prompt for switch
  if (this.needsSwitchPrompt()) {
    this.transitionTo('SWITCH_PROMPT');
    return;
  }

  // Record turn history
  this.state.turnHistory.push({
    turn: this.state.turnNumber,
    actions: orderedActions,
    events: [...this.eventLog.slice(-50)], // Last 50 events for this turn
  });

  // Next turn
  this.transitionTo('ACTION_SELECT');
}
```

### 2.2 Move Execution

```typescript
private executeMove(action: MoveAction, actor: ActivePokemon): void {
  const moveSlot = actor.pokemon.moves[action.moveIndex];
  if (!moveSlot) return;

  const moveData = this.dataManager.getMove(moveSlot.moveId);

  // --- Pre-move: Apply battle gimmick ---
  if (action.mega) this.applyMega(actor);
  if (action.dynamax) this.applyDynamax(actor);
  if (action.terastallize) this.applyTerastallize(actor);

  // --- Pre-move ability (Protean, Libero) ---
  if (this.ruleset.hasAbilities()) {
    this.ruleset.applyAbility('on-before-move', {
      pokemon: actor,
      state: this.state,
      rng: this.state.rng,
      trigger: 'on-before-move',
      move: moveData,
    });
  }

  // --- Pre-move checks: Can the Pokémon actually move? ---
  if (!this.canExecuteMove(actor, moveData)) return;

  // Deduct PP
  moveSlot.currentPP = Math.max(0, moveSlot.currentPP - 1);

  this.emit({ type: 'move-start', side: this.getSide(actor), pokemon: this.getName(actor), move: moveData.id });

  const defender = this.getTarget(action, actor, moveData);
  if (!defender) {
    this.emit({ type: 'move-fail', side: this.getSide(actor), pokemon: this.getName(actor), move: moveData.id, reason: 'no target' });
    return;
  }

  // --- Accuracy check ---
  if (!this.ruleset.doesMoveHit({
    attacker: actor,
    defender,
    move: moveData,
    state: this.state,
    rng: this.state.rng,
  })) {
    this.emit({ type: 'move-miss', side: this.getSide(actor), pokemon: this.getName(actor), move: moveData.id });
    actor.lastMoveUsed = moveData.id;
    actor.movedThisTurn = true;
    return;
  }

  // --- Protect check ---
  if (defender.volatileStatuses.has('protect') && moveData.flags.protect) {
    this.emit({ type: 'message', text: `${this.getName(defender)} protected itself!` });
    actor.lastMoveUsed = moveData.id;
    actor.movedThisTurn = true;
    return;
  }

  // --- Damage calculation (for damaging moves) ---
  let damage = 0;
  if (moveData.category !== 'status' && moveData.power !== null) {
    const isCrit = this.ruleset.rollCritical({
      attacker: actor,
      move: moveData,
      state: this.state,
      rng: this.state.rng,
    });

    const result = this.ruleset.calculateDamage({
      attacker: actor,
      defender,
      move: moveData,
      state: this.state,
      rng: this.state.rng,
      isCrit,
    });

    damage = result.damage;

    // Apply damage to Substitute or Pokémon
    if (defender.substituteHp > 0 && !moveData.flags.bypassSubstitute) {
      defender.substituteHp = Math.max(0, defender.substituteHp - damage);
      this.emit({ type: 'message', text: "The substitute took damage!" });
      if (defender.substituteHp === 0) {
        defender.volatileStatuses.delete('substitute');
        this.emit({ type: 'volatile-end', side: this.getSide(defender), pokemon: this.getName(defender), volatile: 'substitute' });
      }
    } else {
      defender.pokemon.currentHp = Math.max(0, defender.pokemon.currentHp - damage);
      this.emit({
        type: 'damage',
        side: this.getSide(defender),
        pokemon: this.getName(defender),
        amount: damage,
        currentHp: defender.pokemon.currentHp,
        maxHp: defender.pokemon.calculatedStats!.hp,
        source: moveData.id,
      });
    }

    if (result.effectiveness !== 1) {
      this.emit({ type: 'effectiveness', multiplier: result.effectiveness });
    }
    if (result.isCrit) {
      this.emit({ type: 'critical-hit' });
    }
  }

  // --- Apply move effects ---
  const effectResult = this.ruleset.executeMoveEffect({
    attacker: actor,
    defender,
    move: moveData,
    damage,
    state: this.state,
    rng: this.state.rng,
  });

  this.processEffectResult(effectResult, actor, defender);

  // --- Post-move: Contact ability triggers ---
  if (moveData.flags.contact && this.ruleset.hasAbilities()) {
    this.ruleset.applyAbility('on-after-move-hit', {
      pokemon: defender,
      opponent: actor,
      state: this.state,
      rng: this.state.rng,
      trigger: 'on-after-move-hit',
      move: moveData,
      damage,
    });
  }

  // --- Post-move: Held item triggers (Life Orb recoil, etc.) ---
  if (this.ruleset.hasHeldItems() && actor.pokemon.heldItem) {
    this.ruleset.applyHeldItem('on-after-attack', {
      pokemon: actor,
      state: this.state,
      rng: this.state.rng,
      move: moveData,
      damage,
    });
  }

  actor.lastMoveUsed = moveData.id;
  actor.movedThisTurn = true;
  actor.consecutiveProtects = (moveData.effect?.type === 'protect') ? actor.consecutiveProtects + 1 : 0;
}
```

### 2.3 Pre-Move Checks

```typescript
/**
 * Determines if a Pokémon can execute its move this turn.
 * Checks: sleep, freeze, paralysis, confusion, flinch, Taunt, Disable, etc.
 * Returns false if the Pokémon cannot move (and emits relevant events).
 */
private canExecuteMove(actor: ActivePokemon, move: MoveData): boolean {
  // Flinch check (consumed whether it prevents move or not)
  if (actor.volatileStatuses.has('flinch')) {
    actor.volatileStatuses.delete('flinch');
    this.emit({ type: 'message', text: `${this.getName(actor)} flinched and couldn't move!` });
    return false;
  }

  // Sleep check
  if (actor.pokemon.status === 'sleep') {
    const sleepState = /* get remaining turns */;
    if (sleepState > 0) {
      this.emit({ type: 'message', text: `${this.getName(actor)} is fast asleep!` });
      return false;
    }
    // Woke up
    actor.pokemon.status = null;
    this.emit({ type: 'status-cure', side: this.getSide(actor), pokemon: this.getName(actor), status: 'sleep' });
  }

  // Freeze check
  if (actor.pokemon.status === 'freeze') {
    if (move.flags.defrost) {
      // Defrost moves always thaw the user
      actor.pokemon.status = null;
      this.emit({ type: 'status-cure', side: this.getSide(actor), pokemon: this.getName(actor), status: 'freeze' });
    } else if (this.ruleset.checkFreezeThaw(actor, this.state.rng)) {
      actor.pokemon.status = null;
      this.emit({ type: 'status-cure', side: this.getSide(actor), pokemon: this.getName(actor), status: 'freeze' });
    } else {
      this.emit({ type: 'message', text: `${this.getName(actor)} is frozen solid!` });
      return false;
    }
  }

  // Paralysis check — delegated to ruleset (see implementation note below)
  if (actor.pokemon.status === 'paralysis') {
    if (this.ruleset.checkFullParalysis(actor, this.state.rng)) {
      this.emit({ type: 'message', text: `${this.getName(actor)} is fully paralyzed!` });
      return false;
    }
  }

  // Confusion check — delegated to ruleset (see implementation note below)
  if (actor.volatileStatuses.has('confusion')) {
    const confState = actor.volatileStatuses.get('confusion')!;
    if (confState.turnsLeft <= 0) {
      actor.volatileStatuses.delete('confusion');
      this.emit({ type: 'volatile-end', side: this.getSide(actor), pokemon: this.getName(actor), volatile: 'confusion' });
    } else {
      confState.turnsLeft--;
      this.emit({ type: 'message', text: `${this.getName(actor)} is confused!` });
      if (this.ruleset.rollConfusionSelfHit(this.state.rng)) {
        // Self-hit: damage formula delegated to ruleset
        const selfDamage = this.ruleset.calculateConfusionDamage(actor);
        actor.pokemon.currentHp = Math.max(0, actor.pokemon.currentHp - selfDamage);
        this.emit({ type: 'message', text: "It hurt itself in its confusion!" });
        this.emit({
          type: 'damage',
          side: this.getSide(actor),
          pokemon: this.getName(actor),
          amount: selfDamage,
          currentHp: actor.pokemon.currentHp,
          maxHp: actor.pokemon.calculatedStats!.hp,
          source: 'confusion',
        });
        return false;
      }
    }
  }

  // Taunt check
  if (actor.volatileStatuses.has('taunt') && move.category === 'status') {
    this.emit({ type: 'message', text: `${this.getName(actor)} can't use ${move.displayName} after the taunt!` });
    return false;
  }

  // Disable check
  if (actor.volatileStatuses.has('disable')) {
    const disableState = actor.volatileStatuses.get('disable')!;
    if (disableState.data?.['moveId'] === move.id) {
      this.emit({ type: 'message', text: `${move.displayName} is disabled!` });
      return false;
    }
  }

  // Gravity check (no airborne moves)
  if (this.state.gravity.active && move.flags.gravity) {
    this.emit({ type: 'message', text: `${move.displayName} can't be used because of gravity!` });
    return false;
  }

  return true;
}
```

> **Implementation note**: Paralysis, confusion, and sleep chance checks are delegated to the ruleset:
> - `ruleset.checkFullParalysis(actor, rng)` — Gen 1: 25%, Gen 2-5: 25%, Gen 6+: 25% (mechanism differs internally)
> - `ruleset.rollConfusionSelfHit(rng)` — Gen 1-6: 50%, Gen 7+: 33%
> - `ruleset.getSleepDuration(rng)` — Gen 1-2: 1-7 turns, Gen 3-4: 2-5, Gen 5+: 1-3
>
> Never hardcode these rates in the engine.

---

## 3. End-of-Turn Processing

```typescript
/**
 * Process all end-of-turn effects.
 * The ORDER of these effects varies by generation — delegated to the ruleset.
 */
private processEndOfTurn(): void {
  const effectOrder = this.ruleset.getEndOfTurnOrder();

  for (const effect of effectOrder) {
    switch (effect) {
      case 'weather-damage':
        this.processWeatherDamage();
        break;
      case 'weather-countdown':
        this.processWeatherCountdown();
        break;
      case 'terrain-countdown':
        this.processTerrainCountdown();
        break;
      case 'status-damage':
        this.processStatusDamage();
        break;
      case 'leech-seed':
        this.processLeechSeed();
        break;
      case 'curse':
        this.processCurse();
        break;
      case 'bind':
        this.processBind();
        break;
      case 'leftovers':
        this.processLeftovers();
        break;
      case 'black-sludge':
        this.processBlackSludge();
        break;
      case 'aqua-ring':
        this.processAquaRing();
        break;
      case 'ingrain':
        this.processIngrain();
        break;
      case 'grassy-terrain-heal':
        this.processGrassyTerrainHeal();
        break;
      case 'wish':
        this.processWish();
        break;
      case 'future-attack':
        this.processFutureAttack();
        break;
      case 'perish-song':
        this.processPerishSong();
        break;
      case 'screen-countdown':
        this.processScreenCountdown();
        break;
      case 'tailwind-countdown':
        this.processTailwindCountdown();
        break;
      case 'trick-room-countdown':
        this.processTrickRoomCountdown();
        break;
      case 'speed-boost':
        this.processSpeedBoost();
        break;
      case 'moody':
        this.processMoody();
        break;
      case 'bad-dreams':
        this.processBadDreams();
        break;
      case 'harvest':
        this.processHarvest();
        break;
      case 'pickup':
        this.processPickup();
        break;
      case 'poison-heal':
        this.processPoisonHeal();
        break;
    }

    // Check for faints after each effect
    this.checkMidTurnFaints();
    if (this.state.ended) return;
  }

  // Increment turnsOnField for all active Pokémon
  for (const side of this.state.sides) {
    for (const active of side.active) {
      if (active) active.turnsOnField++;
    }
  }
}
```

## End-of-Turn Processing (Delegation Pattern)

The engine calls `ruleset.getEndOfTurnOrder()` to get a generation-specific array of effect identifiers, then processes each in order.

Example arrays:
- Gen 1: `["status-damage", "leech-seed"]` (no weather)
- Gen 2: `["weather-damage", "status-damage", "leech-seed", "future-sight"]`
- Gen 3+: `["weather-damage", "status-damage", "leech-seed", "nightmare", "curse", "future-sight", "wish", "weather-end"]`

Valid effect identifiers include:
- `"weather-damage"` — Sandstorm/Hail chip damage
- `"status-damage"` — Burn/Poison/Toxic damage
- `"leech-seed"` — Leech Seed drain
- `"nightmare"` — Nightmare damage (1/4 max HP if asleep)
- `"curse"` — Curse damage (Ghost-type curse, 1/4 max HP)
- `"weather-end"` — Decrement weather counter, clear if expired
- `"future-sight"` — Execute Future Sight/Doom Desire hits
- `"wish"` — Heal from Wish
- `"perish-song"` — Decrement Perish Song counter, faint if 0

---

## 4. Switching

### 4.1 Switch Execution

```typescript
private executeSwitch(action: SwitchAction): void {
  const side = this.state.sides[action.side];
  const outgoing = side.active[0];

  if (!outgoing) return;

  // --- On-switch-out ability ---
  if (this.ruleset.hasAbilities()) {
    this.ruleset.applyAbility('on-switch-out', {
      pokemon: outgoing,
      state: this.state,
      rng: this.state.rng,
      trigger: 'on-switch-out',
    });
  }

  this.emit({
    type: 'switch-out',
    side: action.side,
    pokemon: this.createSnapshot(outgoing),
  });

  // Clear volatile statuses
  outgoing.volatileStatuses.clear();
  outgoing.statStages = this.createDefaultStatStages();
  outgoing.consecutiveProtects = 0;
  outgoing.turnsOnField = 0;
  outgoing.movedThisTurn = false;
  outgoing.lastMoveUsed = null;
  outgoing.isMega = false; // Mega is permanent per battle, but tracking resets
  if (outgoing.isDynamaxed) {
    outgoing.isDynamaxed = false;
    outgoing.dynamaxTurnsLeft = 0;
  }

  // Send in new Pokémon
  this.sendOut(side, action.switchTo);
}

private sendOut(side: BattleSide, teamSlot: number): void {
  const pokemon = side.team[teamSlot]!;
  const active: ActivePokemon = {
    pokemon,
    teamSlot,
    statStages: this.createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...this.dataManager.getSpecies(pokemon.speciesId).types],
    ability: pokemon.ability,
    lastMoveUsed: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  };

  side.active[0] = active;

  this.emit({
    type: 'switch-in',
    side: side.index,
    pokemon: this.createSnapshot(active),
    slot: teamSlot,
  });

  // Apply entry hazards
  if (this.ruleset.getAvailableHazards().length > 0) {
    this.ruleset.applyEntryHazards(active, side);
  }

  // Apply on-switch-in ability
  if (this.ruleset.hasAbilities()) {
    this.ruleset.applyAbility('on-switch-in', {
      pokemon: active,
      opponent: this.getOpponentActive(side.index),
      state: this.state,
      rng: this.state.rng,
      trigger: 'on-switch-in',
    });
  }
}
```

---

## 5. Win Condition & Battle End

```typescript
private checkBattleEnd(): boolean {
  for (const side of this.state.sides) {
    const allFainted = side.team.every(p => p.currentHp <= 0);
    if (allFainted) {
      const winner = side.index === 0 ? 1 : 0;
      this.state.ended = true;
      this.state.winner = winner as 0 | 1;

      // Calculate EXP gains for the winning side
      this.processExpGains(winner as 0 | 1);

      this.emit({ type: 'battle-end', winner: winner as 0 | 1 });
      return true;
    }
  }
  return false;
}

private processExpGains(winningSide: 0 | 1): void {
  const winner = this.state.sides[winningSide];
  const loser = this.state.sides[winningSide === 0 ? 1 : 0];
  const isTrainer = loser.trainer !== null;

  // Each fainted Pokémon on the losing side grants EXP to participants
  for (const defeated of loser.team) {
    const species = this.dataManager.getSpecies(defeated.speciesId);

    // For simplicity, all alive Pokémon on the winning side share EXP
    const participants = winner.team.filter(p => p.currentHp > 0);

    for (const participant of participants) {
      const exp = this.ruleset.calculateExpGain({
        defeatedSpecies: species,
        defeatedLevel: defeated.level,
        participantLevel: participant.level,
        isTrainerBattle: isTrainer,
        participantCount: participants.length,
        hasLuckyEgg: participant.heldItem === 'lucky-egg',
        hasExpShare: false, // Simplified
        affectionBonus: false,
      });

      this.emit({
        type: 'exp-gain',
        side: winningSide,
        pokemon: participant.nickname ?? species.displayName,
        amount: exp,
      });
    }
  }
}
```

---

## 6. Event-Driven Architecture: State vs. Events

> **State is the source of truth. Events are notifications.**
>
> `BattleState` is mutated in-place during turn resolution. Events are emitted *after* state mutations,
> as notifications for UI and replay consumers. Do not reconstruct game state from events — query
> `BattleState` directly.

## 7. Serialization

```typescript
/**
 * Serialize the battle state to a JSON string.
 * Handles Maps, Sets, and other non-JSON types.
 */
serialize(): string {
  return JSON.stringify(this.state, (key, value) => {
    if (value instanceof Map) {
      return { __type: 'Map', entries: [...value.entries()] };
    }
    if (value instanceof Set) {
      return { __type: 'Set', values: [...value.values()] };
    }
    if (value instanceof SeededRandom) {
      return { __type: 'SeededRandom', state: value.getState() };
    }
    return value;
  });
}

static deserialize(data: string, ruleset: GenerationRuleset, dataManager: DataManager): BattleEngine {
  const state = JSON.parse(data, (key, value) => {
    if (value?.__type === 'Map') return new Map(value.entries);
    if (value?.__type === 'Set') return new Set(value.values);
    if (value?.__type === 'SeededRandom') {
      const rng = new SeededRandom(0);
      rng.setState(value.state);
      return rng;
    }
    return value;
  });

  // Reconstruct engine from state
  // ...
}
```

---

## 7. Testing the Engine

### 7.1 Test Helper

```typescript
/**
 * Helper for creating test battles quickly.
 */
export function createTestBattle(options: {
  generation?: Generation;
  team1?: Partial<PokemonInstance>[];
  team2?: Partial<PokemonInstance>[];
  seed?: number;
}): BattleEngine {
  const gen = options.generation ?? 9;
  const seed = options.seed ?? 12345;

  // Create simple Pokémon for testing
  const team1 = (options.team1 ?? [createTestPokemon(6, 50)]).map(p => ({
    ...createTestPokemon(6, 50),
    ...p,
  })) as PokemonInstance[];

  const team2 = (options.team2 ?? [createTestPokemon(3, 50)]).map(p => ({
    ...createTestPokemon(3, 50),
    ...p,
  })) as PokemonInstance[];

  return new BattleEngine({
    generation: gen,
    format: 'singles',
    teams: [team1, team2],
    seed,
  }, testDataManager);
}

/**
 * Create a minimal test Pokémon with sane defaults.
 */
export function createTestPokemon(
  speciesId: number,
  level: number,
  overrides?: Partial<PokemonInstance>
): PokemonInstance {
  return {
    uid: `test-${speciesId}-${Math.random()}`,
    speciesId,
    nickname: null,
    level,
    experience: 0,
    nature: 'adamant',
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200, // Will be recalculated
    moves: [
      { moveId: 'tackle', currentPP: 35, maxPP: 35, ppUps: 0 },
    ],
    ability: 'blaze',
    abilitySlot: 'normal1',
    heldItem: null,
    status: null,
    friendship: 70,
    gender: 'male',
    isShiny: false,
    metLocation: 'test',
    metLevel: level,
    originalTrainer: 'Test',
    originalTrainerId: 0,
    pokeball: 'poke-ball',
    ...overrides,
  };
}
```

### 7.2 Example Test

```typescript
describe('BattleEngine', () => {
  it('should resolve a simple turn with damage', () => {
    const battle = createTestBattle({ generation: 9, seed: 42 });
    const events: BattleEvent[] = [];
    battle.on(e => events.push(e));

    battle.start();
    expect(battle.getPhase()).toBe('ACTION_SELECT');

    // Both sides use their first move
    battle.submitAction(0, { type: 'move', side: 0, moveIndex: 0 });
    battle.submitAction(1, { type: 'move', side: 1, moveIndex: 0 });

    // Turn should have resolved
    expect(battle.getState().turnNumber).toBe(1);
    expect(events.some(e => e.type === 'damage')).toBe(true);
  });

  it('should be deterministic with same seed', () => {
    const events1: BattleEvent[] = [];
    const events2: BattleEvent[] = [];

    const battle1 = createTestBattle({ seed: 42 });
    battle1.on(e => events1.push(e));
    battle1.start();
    battle1.submitAction(0, { type: 'move', side: 0, moveIndex: 0 });
    battle1.submitAction(1, { type: 'move', side: 1, moveIndex: 0 });

    const battle2 = createTestBattle({ seed: 42 });
    battle2.on(e => events2.push(e));
    battle2.start();
    battle2.submitAction(0, { type: 'move', side: 0, moveIndex: 0 });
    battle2.submitAction(1, { type: 'move', side: 1, moveIndex: 0 });

    // Same events in same order
    expect(events1).toEqual(events2);
  });
});
```

---

## 8. Struggle

When a Pokémon has 0 PP remaining in all move slots, it uses Struggle:
- Always hits (no accuracy check)
- Base power: 50
- Type: Normal (Gen 1-3), Typeless (Gen 4+)
- Recoil: 1/4 of damage dealt (Gen 4+), 1/2 of user's max HP (Gen 1-3)
- Cannot be blocked by Protect
- Cannot be reflected by Magic Coat
- PP loss: None (Struggle costs no PP)

> **Delegation**: `ruleset.getStruggleRecoilFraction()` returns the recoil fraction for this gen.

> **Cross-ref**: `BattleEngine.ts` `executeStruggle()` method (search for `executeStruggle`).

---

## 9. Multi-Hit Moves

Multi-hit moves (Fury Attack, Pin Missile, etc.) hit 2-5 times:
- Hit count: 2 or 3 hits each with 37.5% probability; 4 or 5 hits each with 12.5% probability
- Each hit is checked for crit independently
- Each hit deals damage and applies contact effects independently
- If the target faints mid-sequence, remaining hits are skipped

Double-hit moves (Bonemerang, Double Kick, etc.):
- Always hit exactly twice
- Each hit is checked for accuracy independently (Gen 1-4)
- Gen 5+: second hit cannot miss if first hit landed

> **Cross-ref**: `BattleEngine.ts` `executeMultiHitMove()` (search for this method)

---

## 10. Protect/Detect Success Rate

The chance that Protect/Detect succeeds decreases with consecutive uses:
- Gen 3+: success rate = 1/N where N doubles each consecutive use (100%, 50%, 25%, ..., minimum 1/65536)
- Gen 1-2: Protect does not exist; Endure does not exist

> **Delegation**: `ruleset.rollProtectSuccess(consecutiveUses, rng)` returns whether the protection attempt succeeds. Search `BattleEngine.ts` for `rollProtectSuccess` to see the call site.

---

## 11. Pursuit Pre-Switch Interaction

Pursuit is a special move that intercepts a Pokémon attempting to switch out:
- If the target selects Switch this turn, Pursuit executes first (before the switch)
- If Pursuit hits a switching Pokémon, its power is doubled
- If the target faints from Pursuit damage, the switch still occurs (the new Pokémon comes in)
- Priority: Pursuit normally has 0 priority, but the switch-intercept check overrides turn order

> **Cross-ref**: Search `BattleEngine.ts` for `"pursuit"` to find the implementation.

---

## 12. Partial Trapping (Bind, Wrap, Fire Spin, etc.)

Partial trapping moves deal damage and prevent switching for multiple turns:
- The trapped Pokémon takes end-of-turn damage at the end of each turn it is trapped
- The Pokémon cannot switch out while trapped (but can use moves normally)
- Duration: 4-5 turns randomly (Gen 1: 2-5 turns, with 3/8 chance each for 2 and 3, and 1/8 each for 4 and 5)
- Gen 5+: Binding Band item extends duration and damage
- Gen 6+: damage increases to 1/8 max HP with Binding Band

The `'bound'` volatile status is set on the target. End-of-turn processing is handled by the `"bind"` effect identifier in `getEndOfTurnOrder()`.

> **Delegation**: `ruleset.getTrappingDuration(rng)` and `ruleset.getTrappingDamage(active)` for gen-specific values.

> **Cross-ref**: Search `BattleEngine.ts` for `processBindDamage` to find the implementation.

---

## 13. End-of-Turn Status Damage Reference

| Status | Gen 1 | Gen 2-6 | Gen 7+ |
|--------|-------|---------|--------|
| Burn | 1/16 max HP | 1/8 max HP | 1/16 max HP |
| Poison | 1/16 max HP | 1/8 max HP | 1/8 max HP |
| Toxic (N=1) | 1/16 max HP | 1/16 max HP | 1/16 max HP |
| Toxic (max) | 16/16 max HP | 15/16 max HP | 15/16 max HP |
| Leech Seed | 1/16 max HP* | 1/8 max HP | 1/8 max HP |

*Gen 1 Leech Seed drains from MAX HP (not current HP). The drained HP is added to the Leech Seeder's current HP (capped at max).

**Note**: The current engine hardcodes some of these values (see Known Delegation Bugs in Quick Start). The table above is correct per spec; the bugs are in the code, not the spec.

> **Delegation**: `ruleset.getEndOfTurnOrder()` controls what effects apply and in what order. Individual damage fractions should be queried via per-effect ruleset methods (e.g., `ruleset.calculateLeechSeedDrain()`).

---

## Implementation Cross-Reference

| Concept | Source File | Approximate Location |
|---------|-------------|---------------------|
| Turn loop | `packages/battle/src/engine/BattleEngine.ts` | `executeTurn()` method |
| Turn order resolution | `packages/battle/src/engine/BattleEngine.ts` | `resolveTurnOrder()` |
| Accuracy check | `packages/battle/src/engine/BattleEngine.ts` | `doesMoveHit()` |
| Damage calculation | `packages/battle/src/engine/BattleEngine.ts` | delegates to `ruleset.calculateDamage()` |
| End-of-turn loop | `packages/battle/src/engine/BattleEngine.ts` | search `getEndOfTurnOrder` |
| Leech Seed (BUG) | `packages/battle/src/engine/BattleEngine.ts` | ~line 1588, hardcoded maxHp/8 |
| Curse (BUG) | `packages/battle/src/engine/BattleEngine.ts` | ~line 1658, hardcoded maxHp/4 |
| Nightmare (BUG) | `packages/battle/src/engine/BattleEngine.ts` | ~line 1681, hardcoded maxHp/4 |
| Struggle | `packages/battle/src/engine/BattleEngine.ts` | `executeStruggle()` |
| Pursuit intercept | `packages/battle/src/engine/BattleEngine.ts` | search `"pursuit"` |
| Protect success roll | `packages/battle/src/engine/BattleEngine.ts` | search `rollProtectSuccess` |
| Partial trapping damage | `packages/battle/src/engine/BattleEngine.ts` | `processBindDamage()` |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-03-15 | Added Quick Start with delegation bugs, added 6 missing sections (Struggle, Multi-Hit, Protect formula, Pursuit, Partial Trapping, Status Reference), documented end-of-turn delegation pattern, added Cross-Reference, fixed paralysis/confusion delegation documentation |
| 1.0 | 2024 | Initial core engine spec |
