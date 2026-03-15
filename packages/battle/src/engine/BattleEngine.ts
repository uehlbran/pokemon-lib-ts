import type { DataManager, MoveData } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import type { AvailableMove, BattleConfig, MoveEffectResult } from "../context";
import type {
  BattleAction,
  BattleEvent,
  BattleEventEmitter,
  BattleEventListener,
  MoveAction,
} from "../events";
import type { GenerationRuleset } from "../ruleset";
import type { ActivePokemon, BattlePhase, BattleSide, BattleState } from "../state";
import {
  createActivePokemon,
  createDefaultStatStages,
  createPokemonSnapshot,
  getPokemonName,
} from "../utils";

/**
 * The core battle engine. Manages the battle state machine, delegates
 * generation-specific behavior to the provided ruleset, and emits
 * a stream of BattleEvents for UI/logging consumers.
 */
export class BattleEngine implements BattleEventEmitter {
  readonly state: BattleState;
  private readonly ruleset: GenerationRuleset;
  private readonly dataManager: DataManager;
  private listeners: Set<BattleEventListener> = new Set();
  private eventLog: BattleEvent[] = [];
  private pendingActions: Map<0 | 1, BattleAction> = new Map();
  private pendingSwitches: Map<0 | 1, number> = new Map();
  private sidesNeedingSwitch: Set<0 | 1> = new Set();

  constructor(config: BattleConfig, ruleset: GenerationRuleset, dataManager: DataManager) {
    this.ruleset = ruleset;
    this.dataManager = dataManager;

    this.state = {
      phase: "BATTLE_START",
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

    // Calculate initial stats for all pokemon
    for (const side of this.state.sides) {
      for (const pokemon of side.team) {
        try {
          const species = this.dataManager.getSpecies(pokemon.speciesId);
          pokemon.calculatedStats = this.ruleset.calculateStats(pokemon, species);
          pokemon.currentHp = pokemon.calculatedStats.hp;
        } catch {
          // If species lookup fails, use existing calculatedStats or defaults
          if (!pokemon.calculatedStats) {
            pokemon.calculatedStats = {
              hp: pokemon.currentHp,
              attack: 100,
              defense: 100,
              spAttack: 100,
              spDefense: 100,
              speed: 100,
            };
          }
        }
      }
    }
  }

  // --- Event Emitter ---

  on(listener: BattleEventListener): void {
    this.listeners.add(listener);
  }

  off(listener: BattleEventListener): void {
    this.listeners.delete(listener);
  }

  getEventLog(): readonly BattleEvent[] {
    return this.eventLog;
  }

  private emit(event: BattleEvent): void {
    this.eventLog.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // --- Battle Flow ---

  /** Start the battle (transitions from BATTLE_START -> ACTION_SELECT) */
  start(): void {
    if (this.state.phase !== "BATTLE_START") {
      throw new Error(`Cannot start battle in phase ${this.state.phase}`);
    }

    this.emit({
      type: "battle-start",
      format: this.state.format,
      generation: this.state.generation,
    });

    // Send out lead pokemon for each side
    for (const side of this.state.sides) {
      this.sendOut(side, 0);
    }

    // Apply entry abilities (faster pokemon's ability triggers first)
    if (this.ruleset.hasAbilities()) {
      const active0 = this.state.sides[0].active[0];
      const active1 = this.state.sides[1].active[0];
      if (active0 && active1) {
        const speed0 = active0.pokemon.calculatedStats?.speed ?? 0;
        const speed1 = active1.pokemon.calculatedStats?.speed ?? 0;
        const order: Array<{ side: 0 | 1; pokemon: ActivePokemon }> =
          speed0 >= speed1
            ? [
                { side: 0, pokemon: active0 },
                { side: 1, pokemon: active1 },
              ]
            : [
                { side: 1, pokemon: active1 },
                { side: 0, pokemon: active0 },
              ];

        for (const entry of order) {
          const opponent = this.getOpponentActive(entry.side);
          if (opponent) {
            this.ruleset.applyAbility("on-switch-in", {
              pokemon: entry.pokemon,
              opponent,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-switch-in",
            });
          }
        }
      }
    }

    this.transitionTo("ACTION_SELECT");
  }

  /** Submit an action for a side. When both sides have submitted, turn resolves. */
  submitAction(side: 0 | 1, action: BattleAction): void {
    if (this.state.phase !== "ACTION_SELECT") {
      throw new Error(`Cannot submit action in phase ${this.state.phase}`);
    }

    if (this.state.ended) {
      throw new Error("Battle has ended");
    }

    this.pendingActions.set(side, action);

    // When both sides have submitted, resolve the turn
    if (this.pendingActions.size === 2) {
      this.resolveTurn();
    }
  }

  /** Submit a switch choice for a fainted pokemon replacement. */
  submitSwitch(side: 0 | 1, teamSlot: number): void {
    if (this.state.phase !== "SWITCH_PROMPT") {
      throw new Error(`Cannot submit switch in phase ${this.state.phase}`);
    }

    if (!this.sidesNeedingSwitch.has(side)) {
      throw new Error(`Side ${side} does not need to switch`);
    }

    this.pendingSwitches.set(side, teamSlot);

    // Process when all pending switches are submitted
    if (this.pendingSwitches.size === this.sidesNeedingSwitch.size) {
      for (const [switchSide, slot] of this.pendingSwitches) {
        this.sendOut(this.state.sides[switchSide], slot);
      }
      this.pendingSwitches.clear();
      this.sidesNeedingSwitch.clear();

      // Check again for battle end after switches
      if (this.checkBattleEnd()) {
        this.transitionTo("BATTLE_END");
        return;
      }

      this.transitionTo("ACTION_SELECT");
    }
  }

  /** Get the current phase */
  getPhase(): BattlePhase {
    return this.state.phase;
  }

  /** Get available moves for the active pokemon on a side */
  getAvailableMoves(side: 0 | 1): AvailableMove[] {
    const active = this.state.sides[side].active[0];
    if (!active) return [];

    return active.pokemon.moves.map((slot, index) => {
      let moveData: MoveData | undefined;
      try {
        moveData = this.dataManager.getMove(slot.moveId);
      } catch {
        // Move not found in data manager
      }

      const disabled =
        slot.currentPP <= 0 ||
        (active.volatileStatuses.has("disable") &&
          active.volatileStatuses.get("disable")?.data?.moveId === slot.moveId);

      return {
        index,
        moveId: slot.moveId,
        displayName: moveData?.displayName ?? slot.moveId,
        type: moveData?.type ?? ("normal" as const),
        category: moveData?.category ?? ("physical" as const),
        pp: slot.currentPP,
        maxPp: slot.maxPP,
        disabled,
        disabledReason: disabled
          ? slot.currentPP <= 0
            ? "No PP remaining"
            : "Move is disabled"
          : undefined,
      };
    });
  }

  /** Get valid switch targets for a side */
  getAvailableSwitches(side: 0 | 1): number[] {
    const sideState = this.state.sides[side];
    const active = sideState.active[0];
    const activeSlot = active?.teamSlot ?? -1;

    // Delegate switching restriction check to the ruleset
    if (active && !this.ruleset.canSwitch(active, this.state)) {
      return [];
    }

    return sideState.team
      .map((p, index) => ({ pokemon: p, index }))
      .filter((t) => t.pokemon.currentHp > 0 && t.index !== activeSlot)
      .map((t) => t.index);
  }

  /** Check if the battle has ended */
  isEnded(): boolean {
    return this.state.ended;
  }

  /** Get the winner (null if not ended) */
  getWinner(): 0 | 1 | null {
    return this.state.winner;
  }

  // --- State Inspection ---

  /** Get a read-only view of the battle state */
  getState(): Readonly<BattleState> {
    return this.state;
  }

  /** Get the active pokemon for a side */
  getActive(side: 0 | 1): ActivePokemon | null {
    return this.state.sides[side].active[0] ?? null;
  }

  /** Get the team for a side */
  getTeam(side: 0 | 1): readonly import("@pokemon-lib-ts/core").PokemonInstance[] {
    return this.state.sides[side].team;
  }

  // --- Serialization ---

  /** Serialize battle state for save/load or network transmission */
  serialize(): string {
    return JSON.stringify(this.state, (_key, value) => {
      if (value instanceof Map) {
        return { __type: "Map", entries: [...value.entries()] };
      }
      if (value instanceof Set) {
        return { __type: "Set", values: [...value.values()] };
      }
      if (value instanceof SeededRandom) {
        return { __type: "SeededRandom", state: value.getState() };
      }
      return value;
    });
  }

  /** Restore a battle from serialized state */
  static deserialize(
    data: string,
    ruleset: GenerationRuleset,
    dataManager: DataManager,
  ): BattleEngine {
    const parsed = JSON.parse(data, (_key, value) => {
      if (value?.__type === "Map") return new Map(value.entries);
      if (value?.__type === "Set") return new Set(value.values);
      if (value?.__type === "SeededRandom") {
        const rng = new SeededRandom(0);
        rng.setState(value.state);
        return rng;
      }
      return value;
    }) as BattleState;

    // Create a minimal config to construct the engine
    const config: BattleConfig = {
      generation: parsed.generation,
      format: parsed.format,
      teams: [parsed.sides[0].team, parsed.sides[1].team],
      seed: 0, // Seed doesn't matter — we restore the RNG state
    };

    const engine = new BattleEngine(config, ruleset, dataManager);

    // Overwrite the engine state with the deserialized state
    Object.assign(engine.state, parsed);

    return engine;
  }

  // --- Private Methods ---

  private transitionTo(phase: BattlePhase): void {
    this.state.phase = phase;
  }

  private createSide(
    index: 0 | 1,
    team: import("@pokemon-lib-ts/core").PokemonInstance[],
    trainer: import("../context").TrainerDataRef | null,
  ): BattleSide {
    return {
      index,
      trainer: trainer
        ? {
            id: trainer.id,
            displayName: trainer.displayName,
            trainerClass: trainer.trainerClass,
          }
        : null,
      team: [...team],
      active: [],
      hazards: [],
      screens: [],
      tailwind: { active: false, turnsLeft: 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    };
  }

  private sendOut(side: BattleSide, teamSlot: number): void {
    const pokemon = side.team[teamSlot];
    if (!pokemon) return;

    let types: import("@pokemon-lib-ts/core").PokemonType[];
    try {
      const species = this.dataManager.getSpecies(pokemon.speciesId);
      types = [...species.types];
    } catch {
      types = ["normal"];
    }

    const active = createActivePokemon(pokemon, teamSlot, types);
    side.active[0] = active;

    this.emit({
      type: "switch-in",
      side: side.index,
      pokemon: createPokemonSnapshot(active),
      slot: teamSlot,
    });

    // Apply entry hazards
    if (this.ruleset.getAvailableHazards().length > 0 && side.hazards.length > 0) {
      const hazardResult = this.ruleset.applyEntryHazards(active, side);
      if (hazardResult.damage > 0) {
        active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - hazardResult.damage);
        this.emit({
          type: "damage",
          side: side.index,
          pokemon: getPokemonName(active),
          amount: hazardResult.damage,
          currentHp: active.pokemon.currentHp,
          maxHp: active.pokemon.calculatedStats?.hp ?? 1,
          source: "entry-hazard",
        });
      }
      if (hazardResult.statusInflicted && !active.pokemon.status) {
        active.pokemon.status = hazardResult.statusInflicted;
        this.emit({
          type: "status-inflict",
          side: side.index,
          pokemon: getPokemonName(active),
          status: hazardResult.statusInflicted,
        });
      }
      for (const msg of hazardResult.messages) {
        this.emit({ type: "message", text: msg });
      }
    }
  }

  private resolveTurn(): void {
    const action0 = this.pendingActions.get(0);
    const action1 = this.pendingActions.get(1);
    if (!action0 || !action1) return;
    const actions = [action0, action1];
    this.pendingActions.clear();

    // --- TURN_START ---
    this.transitionTo("TURN_START");
    this.state.turnNumber++;
    this.emit({ type: "turn-start", turnNumber: this.state.turnNumber });

    // --- TURN_RESOLVE ---
    this.transitionTo("TURN_RESOLVE");

    // Sort actions by priority / speed / random
    const orderedActions = this.ruleset.resolveTurnOrder(actions, this.state, this.state.rng);

    // Execute each action in order
    for (const action of orderedActions) {
      // Check if the acting pokemon fainted before it could act
      const actor = this.getActive(action.side);
      if (!actor || actor.pokemon.currentHp <= 0) continue;

      switch (action.type) {
        case "move":
          this.executeMove(action, actor);
          break;
        case "switch":
          this.executeSwitch(action);
          break;
        case "item":
          // Items not fully implemented yet
          this.emit({
            type: "message",
            text: `Side ${action.side} used an item`,
          });
          break;
        case "run":
          this.emit({
            type: "message",
            text: `Side ${action.side} tried to run!`,
          });
          break;
        case "recharge":
          this.emit({
            type: "message",
            text: `${getPokemonName(actor)} must recharge!`,
          });
          break;
        case "struggle":
          this.executeStruggle(action, actor);
          break;
      }

      // Check for faints after each action
      this.checkMidTurnFaints();
      if (this.state.ended) return;
    }

    // --- TURN_END ---
    this.transitionTo("TURN_END");
    this.processEndOfTurn();

    if (this.state.ended) return;

    // --- FAINT_CHECK ---
    this.transitionTo("FAINT_CHECK");
    if (this.checkBattleEnd()) {
      this.transitionTo("BATTLE_END");
      return;
    }

    // If any pokemon need replacement, prompt for switch
    if (this.needsSwitchPrompt()) {
      this.transitionTo("SWITCH_PROMPT");
      return;
    }

    // Record turn history
    this.state.turnHistory.push({
      turn: this.state.turnNumber,
      actions: orderedActions,
      events: [...this.eventLog.slice(-50)],
    });

    // Reset move tracking for next turn
    for (const side of this.state.sides) {
      for (const active of side.active) {
        if (active) {
          active.movedThisTurn = false;
        }
      }
    }

    // Next turn
    this.transitionTo("ACTION_SELECT");
  }

  private executeMove(action: MoveAction, actor: ActivePokemon): void {
    const moveSlot = actor.pokemon.moves[action.moveIndex];
    if (!moveSlot) return;

    let moveData: MoveData;
    try {
      moveData = this.dataManager.getMove(moveSlot.moveId);
    } catch {
      // Move not found — treat as a basic normal physical move
      this.emit({
        type: "move-fail",
        side: action.side,
        pokemon: getPokemonName(actor),
        move: moveSlot.moveId,
        reason: "unknown move",
      });
      return;
    }

    // Pre-move checks: can the pokemon actually move?
    if (!this.canExecuteMove(actor, moveData)) return;

    // Deduct PP
    moveSlot.currentPP = Math.max(0, moveSlot.currentPP - 1);

    this.emit({
      type: "move-start",
      side: action.side,
      pokemon: getPokemonName(actor),
      move: moveData.id,
    });

    // Protect consecutive use: each use after the first has 1/3^N chance of succeeding
    if (moveData.effect?.type === "protect") {
      const denominator = Math.min(729, 3 ** actor.consecutiveProtects);
      if (actor.consecutiveProtects > 0 && !this.state.rng.chance(1 / denominator)) {
        // Protect failed due to consecutive use
        actor.consecutiveProtects = 0;
        this.emit({
          type: "move-fail",
          side: action.side,
          pokemon: getPokemonName(actor),
          move: moveData.id,
          reason: "protect failed",
        });
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    } else {
      // Non-protect move: reset the consecutive counter
      actor.consecutiveProtects = 0;
    }

    // Find the target
    const defenderSide = action.side === 0 ? 1 : 0;
    const defender = this.getActive(defenderSide as 0 | 1);
    if (!defender) {
      this.emit({
        type: "move-fail",
        side: action.side,
        pokemon: getPokemonName(actor),
        move: moveData.id,
        reason: "no target",
      });
      actor.lastMoveUsed = moveData.id;
      actor.movedThisTurn = true;
      return;
    }

    // Accuracy check
    if (
      !this.ruleset.doesMoveHit({
        attacker: actor,
        defender,
        move: moveData,
        state: this.state,
        rng: this.state.rng,
      })
    ) {
      this.emit({
        type: "move-miss",
        side: action.side,
        pokemon: getPokemonName(actor),
        move: moveData.id,
      });
      actor.lastMoveUsed = moveData.id;
      actor.movedThisTurn = true;
      return;
    }

    // Protect check
    if (defender.volatileStatuses.has("protect") && moveData.flags.protect) {
      this.emit({
        type: "message",
        text: `${getPokemonName(defender)} protected itself!`,
      });
      actor.lastMoveUsed = moveData.id;
      actor.movedThisTurn = true;
      return;
    }

    // Damage calculation (for damaging moves)
    let damage = 0;
    if (moveData.category !== "status" && moveData.power !== null) {
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

      // Apply damage to substitute or pokemon
      if (defender.substituteHp > 0 && !moveData.flags.bypassSubstitute) {
        defender.substituteHp = Math.max(0, defender.substituteHp - damage);
        this.emit({
          type: "message",
          text: "The substitute took damage!",
        });
        if (defender.substituteHp === 0) {
          defender.volatileStatuses.delete("substitute");
          this.emit({
            type: "volatile-end",
            side: defenderSide as 0 | 1,
            pokemon: getPokemonName(defender),
            volatile: "substitute",
          });
        }
      } else {
        defender.pokemon.currentHp = Math.max(0, defender.pokemon.currentHp - damage);
        defender.lastDamageTaken = damage;
        this.emit({
          type: "damage",
          side: defenderSide as 0 | 1,
          pokemon: getPokemonName(defender),
          amount: damage,
          currentHp: defender.pokemon.currentHp,
          maxHp: defender.pokemon.calculatedStats?.hp ?? 1,
          source: moveData.id,
        });
      }

      if (result.effectiveness !== 1) {
        this.emit({ type: "effectiveness", multiplier: result.effectiveness });
      }
      if (result.isCrit) {
        this.emit({ type: "critical-hit" });
      }

      // Held item: on-damage-taken trigger for defender
      if (this.ruleset.hasHeldItems() && damage > 0) {
        const defItemResult = this.ruleset.applyHeldItem("on-damage-taken", {
          pokemon: defender,
          state: this.state,
          rng: this.state.rng,
          damage,
        });
        if (defItemResult.activated) {
          this.processItemResult(defItemResult, defender, defenderSide as 0 | 1);
        }
      }
    }

    // Apply move effects
    const effectResult = this.ruleset.executeMoveEffect({
      attacker: actor,
      defender,
      move: moveData,
      damage,
      state: this.state,
      rng: this.state.rng,
    });

    this.processEffectResult(effectResult, actor, defender, action.side, defenderSide as 0 | 1);

    // Increment consecutiveProtects if protect was successfully used
    if (moveData.effect?.type === "protect") {
      actor.consecutiveProtects++;
    }

    // Recharge: if the move requires recharge and noRecharge was not set, mark the attacker
    if (moveData.flags.recharge && !effectResult.noRecharge) {
      actor.volatileStatuses.set("recharge", { turnsLeft: 1 });
    }

    // Held item: on-hit trigger for attacker
    if (this.ruleset.hasHeldItems() && damage > 0) {
      const atkItemResult = this.ruleset.applyHeldItem("on-hit", {
        pokemon: actor,
        state: this.state,
        rng: this.state.rng,
        move: moveData,
      });
      if (atkItemResult.activated) {
        this.processItemResult(atkItemResult, actor, action.side);
      }
    }

    actor.lastMoveUsed = moveData.id;
    actor.movedThisTurn = true;
  }

  private executeSwitch(action: import("../events").SwitchAction): void {
    const side = this.state.sides[action.side];
    const outgoing = side.active[0];

    if (outgoing) {
      // Let the ruleset handle any gen-specific switch-out cleanup first
      this.ruleset.onSwitchOut(outgoing, this.state);

      this.emit({
        type: "switch-out",
        side: action.side,
        pokemon: createPokemonSnapshot(outgoing),
      });

      // Ruleset owns volatile cleanup (onSwitchOut already called above).
      // Reset stat stages and battle-turn bookkeeping.
      outgoing.statStages = createDefaultStatStages();
      outgoing.consecutiveProtects = 0;
      outgoing.turnsOnField = 0;
      outgoing.movedThisTurn = false;
      outgoing.lastMoveUsed = null;
      outgoing.lastDamageTaken = 0;
    }

    // Send in new pokemon
    this.sendOut(side, action.switchTo);
  }

  private executeStruggle(action: import("../events").StruggleAction, actor: ActivePokemon): void {
    const defenderSide = action.side === 0 ? 1 : 0;
    const defender = this.getActive(defenderSide as 0 | 1);

    this.emit({
      type: "move-start",
      side: action.side,
      pokemon: getPokemonName(actor),
      move: "struggle",
    });

    if (!defender) return;

    // Struggle does a fixed amount of typeless damage
    const maxHp = actor.pokemon.calculatedStats?.hp ?? actor.pokemon.currentHp;
    const damage = Math.max(1, Math.floor(maxHp / 4));

    defender.pokemon.currentHp = Math.max(0, defender.pokemon.currentHp - damage);
    this.emit({
      type: "damage",
      side: defenderSide as 0 | 1,
      pokemon: getPokemonName(defender),
      amount: damage,
      currentHp: defender.pokemon.currentHp,
      maxHp: defender.pokemon.calculatedStats?.hp ?? 1,
      source: "struggle",
    });

    // Struggle recoil: delegated to ruleset (Gen 1-2: 1/2 damage, Gen 4+: 1/4 max HP)
    const recoil = this.ruleset.calculateStruggleRecoil(actor, damage);
    actor.pokemon.currentHp = Math.max(0, actor.pokemon.currentHp - recoil);
    this.emit({
      type: "damage",
      side: action.side,
      pokemon: getPokemonName(actor),
      amount: recoil,
      currentHp: actor.pokemon.currentHp,
      maxHp: maxHp,
      source: "struggle-recoil",
    });

    actor.lastMoveUsed = "struggle";
    actor.movedThisTurn = true;
  }

  private canExecuteMove(actor: ActivePokemon, _move: MoveData): boolean {
    const side = this.getSideIndex(actor);

    // Flinch check
    if (actor.volatileStatuses.has("flinch")) {
      actor.volatileStatuses.delete("flinch");
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} flinched and couldn't move!`,
      });
      return false;
    }

    // Sleep check
    if (actor.pokemon.status === "sleep") {
      const canAct = this.ruleset.processSleepTurn(actor, this.state);
      if (actor.pokemon.status === null) {
        // Pokemon woke up (status cleared by processSleepTurn)
        this.emit({
          type: "status-cure",
          side,
          pokemon: getPokemonName(actor),
          status: "sleep",
        });
      } else {
        // Still sleeping
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is fast asleep!`,
        });
      }
      if (!canAct) return false;
    }

    // Freeze check
    if (actor.pokemon.status === "freeze") {
      if (this.ruleset.checkFreezeThaw(actor, this.state.rng)) {
        actor.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side,
          pokemon: getPokemonName(actor),
          status: "freeze",
        });
      } else {
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is frozen solid!`,
        });
        return false;
      }
    }

    // Paralysis check
    if (actor.pokemon.status === "paralysis") {
      if (this.ruleset.checkFullParalysis(actor, this.state.rng)) {
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is fully paralyzed!`,
        });
        return false;
      }
    }

    // Confusion check
    if (actor.volatileStatuses.has("confusion")) {
      const confState = actor.volatileStatuses.get("confusion");
      if (!confState || confState.turnsLeft <= 0) {
        actor.volatileStatuses.delete("confusion");
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile: "confusion",
        });
      } else {
        confState.turnsLeft--;
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is confused!`,
        });
        if (this.ruleset.rollConfusionSelfHit(this.state.rng)) {
          // Self-hit confusion damage — chance and formula delegated to ruleset
          const maxHp = actor.pokemon.calculatedStats?.hp ?? actor.pokemon.currentHp;
          const selfDamage = this.ruleset.calculateConfusionDamage(
            actor,
            this.state,
            this.state.rng,
          );
          actor.pokemon.currentHp = Math.max(0, actor.pokemon.currentHp - selfDamage);
          this.emit({
            type: "message",
            text: "It hurt itself in its confusion!",
          });
          this.emit({
            type: "damage",
            side,
            pokemon: getPokemonName(actor),
            amount: selfDamage,
            currentHp: actor.pokemon.currentHp,
            maxHp,
            source: "confusion",
          });
          return false;
        }
      }
    }

    // Bound check (Gen 1 trapping — Wrap, Bind, Fire Spin, Clamp)
    if (actor.volatileStatuses.has("bound")) {
      const boundState = actor.volatileStatuses.get("bound");
      if (!boundState || boundState.turnsLeft <= 1) {
        actor.volatileStatuses.delete("bound");
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile: "bound",
        });
      } else {
        boundState.turnsLeft--;
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is bound and can't move!`,
        });
        return false;
      }
    }

    return true;
  }

  private processEffectResult(
    result: MoveEffectResult,
    attacker: ActivePokemon,
    defender: ActivePokemon,
    attackerSide: 0 | 1,
    defenderSide: 0 | 1,
  ): void {
    // Status infliction
    if (result.statusInflicted && !defender.pokemon.status) {
      defender.pokemon.status = result.statusInflicted;
      this.emit({
        type: "status-inflict",
        side: defenderSide,
        pokemon: getPokemonName(defender),
        status: result.statusInflicted,
      });
      // Initialize toxic counter volatile so end-of-turn damage can scale correctly
      if (result.statusInflicted === "badly-poisoned") {
        defender.volatileStatuses.set("toxic-counter", {
          turnsLeft: -1,
          data: { counter: 1 },
        });
      }
      // Initialize sleep counter volatile so processSleepTurn can track remaining turns
      if (result.statusInflicted === "sleep") {
        const sleepTurns = this.ruleset.rollSleepTurns(this.state.rng);
        defender.volatileStatuses.set("sleep-counter", {
          turnsLeft: sleepTurns,
          data: {},
        });
      }
    }

    // Volatile status infliction — use volatileData for turnsLeft if provided
    if (result.volatileInflicted && !defender.volatileStatuses.has(result.volatileInflicted)) {
      defender.volatileStatuses.set(result.volatileInflicted, {
        turnsLeft: result.volatileData?.turnsLeft ?? -1,
        data: result.volatileData?.data,
      });
      this.emit({
        type: "volatile-start",
        side: defenderSide,
        pokemon: getPokemonName(defender),
        volatile: result.volatileInflicted,
      });
    }

    // Stat changes
    for (const change of result.statChanges) {
      const target = change.target === "attacker" ? attacker : defender;
      const targetSide = change.target === "attacker" ? attackerSide : defenderSide;
      const currentStage = target.statStages[change.stat];
      const newStage = Math.max(-6, Math.min(6, currentStage + change.stages));
      target.statStages[change.stat] = newStage;
      this.emit({
        type: "stat-change",
        side: targetSide,
        pokemon: getPokemonName(target),
        stat: change.stat,
        stages: change.stages,
        currentStage: newStage,
      });
    }

    // Recoil damage
    if (result.recoilDamage > 0) {
      attacker.pokemon.currentHp = Math.max(0, attacker.pokemon.currentHp - result.recoilDamage);
      this.emit({
        type: "damage",
        side: attackerSide,
        pokemon: getPokemonName(attacker),
        amount: result.recoilDamage,
        currentHp: attacker.pokemon.currentHp,
        maxHp: attacker.pokemon.calculatedStats?.hp ?? 1,
        source: "recoil",
      });
    }

    // Healing
    if (result.healAmount > 0) {
      const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
      const oldHp = attacker.pokemon.currentHp;
      attacker.pokemon.currentHp = Math.min(maxHp, oldHp + result.healAmount);
      const healed = attacker.pokemon.currentHp - oldHp;
      if (healed > 0) {
        this.emit({
          type: "heal",
          side: attackerSide,
          pokemon: getPokemonName(attacker),
          amount: healed,
          currentHp: attacker.pokemon.currentHp,
          maxHp,
          source: "move-effect",
        });
      }
    }

    // Messages
    for (const msg of result.messages) {
      this.emit({ type: "message", text: msg });
    }

    // Weather from move effects
    if (result.weatherSet && this.ruleset.hasWeather()) {
      this.state.weather = {
        type: result.weatherSet.weather,
        turnsLeft: result.weatherSet.turns,
        source: result.weatherSet.source,
      };
      this.emit({
        type: "weather-set",
        weather: result.weatherSet.weather,
        source: result.weatherSet.source,
      });
    }

    // Hazard from move effects
    if (result.hazardSet) {
      const targetSide = this.state.sides[result.hazardSet.targetSide];
      const hazardType = result.hazardSet.hazard;
      const existing = targetSide.hazards.find((h) => h.type === hazardType);
      if (!existing) {
        targetSide.hazards.push({ type: hazardType, layers: 1 });
        this.emit({
          type: "hazard-set",
          side: result.hazardSet.targetSide,
          hazard: hazardType,
          layers: 1,
        });
      }
    }

    // Clear volatiles from move effects (e.g., Rapid Spin)
    if (result.volatilesToClear) {
      for (const clear of result.volatilesToClear) {
        const target = clear.target === "attacker" ? attacker : defender;
        const targetSide = clear.target === "attacker" ? attackerSide : defenderSide;
        if (target.volatileStatuses.has(clear.volatile)) {
          target.volatileStatuses.delete(clear.volatile);
          this.emit({
            type: "volatile-end",
            side: targetSide,
            pokemon: getPokemonName(target),
            volatile: clear.volatile,
          });
        }
      }
    }

    // Clear side hazards (e.g., Rapid Spin)
    if (result.clearSideHazards) {
      const clearSide =
        result.clearSideHazards === "attacker"
          ? this.state.sides[attackerSide]
          : this.state.sides[defenderSide];
      if (clearSide.hazards.length > 0) {
        clearSide.hazards = [];
        this.emit({
          type: "message",
          text: "The hazards were cleared!",
        });
      }
    }

    // Item transfer (e.g., Thief)
    if (result.itemTransfer) {
      const from = result.itemTransfer.from === "attacker" ? attacker : defender;
      const to = result.itemTransfer.to === "attacker" ? attacker : defender;
      if (from.pokemon.heldItem && !to.pokemon.heldItem) {
        to.pokemon.heldItem = from.pokemon.heldItem;
        from.pokemon.heldItem = null;
      }
    }

    // Screen set (Reflect / Light Screen)
    if (result.screenSet) {
      const screenSide =
        result.screenSet.side === "attacker"
          ? this.state.sides[attackerSide]
          : this.state.sides[defenderSide];
      const screenSideIndex = result.screenSet.side === "attacker" ? attackerSide : defenderSide;
      const screenType = result.screenSet.screen as import("@pokemon-lib-ts/core").ScreenType;
      if (!screenSide.screens.some((s) => s.type === screenType)) {
        screenSide.screens.push({ type: screenType, turnsLeft: result.screenSet.turnsLeft });
        this.emit({
          type: "screen-set",
          side: screenSideIndex,
          screen: screenType,
          turns: result.screenSet.turnsLeft,
        });
      }
    }

    // Screen clear (Haze or switch-out removes screens from a side)
    if (result.screensCleared) {
      if (result.screensCleared === "attacker" || result.screensCleared === "both") {
        this.state.sides[attackerSide].screens = [];
      }
      if (result.screensCleared === "defender" || result.screensCleared === "both") {
        this.state.sides[defenderSide].screens = [];
      }
    }

    // Self-faint (Explosion / Self-Destruct)
    if (result.selfFaint) {
      attacker.pokemon.currentHp = 0;
      // faint event and faintCount increment handled by checkMidTurnFaints()
    }

    // Custom damage (OHKO, fixed damage, Counter)
    if (result.customDamage) {
      const customTarget = result.customDamage.target === "attacker" ? attacker : defender;
      const customTargetSide =
        result.customDamage.target === "attacker" ? attackerSide : defenderSide;
      const customMaxHp =
        customTarget.pokemon.calculatedStats?.hp ?? customTarget.pokemon.currentHp;
      customTarget.pokemon.currentHp = Math.max(
        0,
        customTarget.pokemon.currentHp - result.customDamage.amount,
      );
      if (result.customDamage.target === "defender") {
        customTarget.lastDamageTaken = result.customDamage.amount;
      }
      this.emit({
        type: "damage",
        side: customTargetSide,
        pokemon: getPokemonName(customTarget),
        amount: result.customDamage.amount,
        currentHp: customTarget.pokemon.currentHp,
        maxHp: customMaxHp,
        source: result.customDamage.source,
      });
    }

    // Status cure (Haze clears all stat stages and statuses for target(s))
    // NOTE: statusCured is currently only used by Haze, so resetting stat stages
    // here is correct. If a move ever cures status without resetting stages,
    // a separate result field (e.g. statusCuredOnly) should be added.
    if (result.statusCured) {
      const targets: Array<{ pokemon: ActivePokemon; side: 0 | 1 }> = [];
      if (result.statusCured.target === "attacker" || result.statusCured.target === "both") {
        targets.push({ pokemon: attacker, side: attackerSide });
      }
      if (result.statusCured.target === "defender" || result.statusCured.target === "both") {
        targets.push({ pokemon: defender, side: defenderSide });
      }
      for (const { pokemon: t, side: tSide } of targets) {
        if (t.pokemon.status) {
          const curedStatus = t.pokemon.status;
          t.pokemon.status = null;
          this.emit({
            type: "status-cure",
            side: tSide,
            pokemon: getPokemonName(t),
            status: curedStatus,
          });
        }
        // Reset all stat stages (Haze's primary effect)
        t.statStages = createDefaultStatStages();
      }
    }
  }

  private processEndOfTurn(): void {
    const effectOrder = this.ruleset.getEndOfTurnOrder();

    for (const effect of effectOrder) {
      switch (effect) {
        case "weather-damage":
          this.processWeatherDamage();
          break;
        case "weather-countdown":
          this.processWeatherCountdown();
          break;
        case "terrain-countdown":
          this.processTerrainCountdown();
          break;
        case "status-damage":
          this.processStatusDamage();
          break;
        case "screen-countdown":
          this.processScreenCountdown();
          break;
        case "tailwind-countdown":
          this.processTailwindCountdown();
          break;
        case "trick-room-countdown":
          this.processTrickRoomCountdown();
          break;
        case "leftovers":
          this.processHeldItemEndOfTurn();
          break;
        case "leech-seed":
          this.processLeechSeed();
          break;
        case "perish-song":
          this.processPerishSong();
          break;
        case "curse":
          this.processCurse();
          break;
        case "nightmare":
          this.processNightmare();
          break;
        default:
          // Many effects not yet implemented
          break;
      }

      this.checkMidTurnFaints();
      if (this.state.ended) return;
    }

    // Increment turnsOnField for all active pokemon
    for (const side of this.state.sides) {
      for (const active of side.active) {
        if (active) active.turnsOnField++;
      }
    }
  }

  private processWeatherDamage(): void {
    if (!this.state.weather || !this.ruleset.hasWeather()) return;

    const results = this.ruleset.applyWeatherEffects(this.state);
    for (const result of results) {
      if (result.damage > 0) {
        const active = this.getActive(result.side);
        if (active) {
          active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - result.damage);
          this.emit({
            type: "damage",
            side: result.side,
            pokemon: result.pokemon,
            amount: result.damage,
            currentHp: active.pokemon.currentHp,
            maxHp: active.pokemon.calculatedStats?.hp ?? 1,
            source: `weather-${this.state.weather.type}`,
          });
        }
      }
    }
  }

  private processWeatherCountdown(): void {
    if (!this.state.weather) return;
    if (this.state.weather.turnsLeft === -1) return; // Permanent
    this.state.weather.turnsLeft--;
    if (this.state.weather.turnsLeft <= 0) {
      const weatherType = this.state.weather.type;
      this.state.weather = null;
      this.emit({ type: "weather-end", weather: weatherType });
    }
  }

  private processTerrainCountdown(): void {
    if (!this.state.terrain) return;
    if (this.state.terrain.turnsLeft === -1) return;
    this.state.terrain.turnsLeft--;
    if (this.state.terrain.turnsLeft <= 0) {
      const terrainType = this.state.terrain.type;
      this.state.terrain = null;
      this.emit({ type: "terrain-end", terrain: terrainType });
    }
  }

  private processStatusDamage(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.pokemon.status) continue;

      const status = active.pokemon.status;
      if (status === "burn" || status === "poison" || status === "badly-poisoned") {
        const damage = this.ruleset.applyStatusDamage(active, status, this.state);
        if (damage > 0) {
          active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);
          this.emit({
            type: "damage",
            side: side.index,
            pokemon: getPokemonName(active),
            amount: damage,
            currentHp: active.pokemon.currentHp,
            maxHp: active.pokemon.calculatedStats?.hp ?? 1,
            source: status,
          });
        }
        // Toxic counter increment is handled by the ruleset's applyStatusDamage
      }
    }
  }

  private processScreenCountdown(): void {
    for (const side of this.state.sides) {
      side.screens = side.screens.filter((screen) => {
        if (screen.turnsLeft < 0) return true; // permanent sentinel — never expires
        screen.turnsLeft--;
        if (screen.turnsLeft <= 0) {
          this.emit({
            type: "screen-end",
            side: side.index,
            screen: screen.type,
          });
          return false;
        }
        return true;
      });
    }
  }

  private processTailwindCountdown(): void {
    for (const side of this.state.sides) {
      if (side.tailwind.active) {
        side.tailwind.turnsLeft--;
        if (side.tailwind.turnsLeft <= 0) {
          side.tailwind.active = false;
          this.emit({
            type: "message",
            text: `Side ${side.index}'s tailwind petered out!`,
          });
        }
      }
    }
  }

  private processTrickRoomCountdown(): void {
    if (this.state.trickRoom.active) {
      this.state.trickRoom.turnsLeft--;
      if (this.state.trickRoom.turnsLeft <= 0) {
        this.state.trickRoom.active = false;
        this.emit({ type: "message", text: "The twisted dimensions returned to normal!" });
      }
    }
  }

  private checkMidTurnFaints(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (active && active.pokemon.currentHp <= 0) {
        this.emit({
          type: "faint",
          side: side.index,
          pokemon: getPokemonName(active),
        });
        side.faintCount++;
      }
    }
  }

  private checkBattleEnd(): boolean {
    for (const side of this.state.sides) {
      const allFainted = side.team.every((p) => p.currentHp <= 0);
      if (allFainted) {
        const winner = (side.index === 0 ? 1 : 0) as 0 | 1;
        this.state.ended = true;
        this.state.winner = winner;
        this.emit({ type: "battle-end", winner });
        return true;
      }
    }
    return false;
  }

  private needsSwitchPrompt(): boolean {
    this.sidesNeedingSwitch.clear();
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (active && active.pokemon.currentHp <= 0) {
        // Check if there are available pokemon to switch to
        const hasAlive = side.team.some((p, idx) => p.currentHp > 0 && idx !== active.teamSlot);
        if (hasAlive) {
          this.sidesNeedingSwitch.add(side.index);
        }
      }
    }
    return this.sidesNeedingSwitch.size > 0;
  }

  private getOpponentActive(side: 0 | 1): ActivePokemon | null {
    const opponentSide = side === 0 ? 1 : 0;
    return this.state.sides[opponentSide].active[0] ?? null;
  }

  private getSideIndex(active: ActivePokemon): 0 | 1 {
    for (const side of this.state.sides) {
      if (side.active[0] === active) return side.index;
    }
    return 0;
  }

  private processHeldItemEndOfTurn(): void {
    if (!this.ruleset.hasHeldItems()) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      const itemResult = this.ruleset.applyHeldItem("end-of-turn", {
        pokemon: active,
        state: this.state,
        rng: this.state.rng,
      });
      if (itemResult.activated) {
        this.processItemResult(itemResult, active, side.index);
      }
    }
  }

  private processItemResult(
    result: import("../context").ItemResult,
    pokemon: ActivePokemon,
    side: 0 | 1,
  ): void {
    for (const effect of result.effects) {
      switch (effect.type) {
        case "heal": {
          const amount = effect.value as number;
          const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
          const oldHp = pokemon.pokemon.currentHp;
          pokemon.pokemon.currentHp = Math.min(maxHp, oldHp + amount);
          const healed = pokemon.pokemon.currentHp - oldHp;
          if (healed > 0) {
            this.emit({
              type: "heal",
              side,
              pokemon: getPokemonName(pokemon),
              amount: healed,
              currentHp: pokemon.pokemon.currentHp,
              maxHp,
              source: "held-item",
            });
          }
          break;
        }
        case "status-cure": {
          const status = pokemon.pokemon.status;
          if (status) {
            pokemon.pokemon.status = null;
            this.emit({
              type: "status-cure",
              side,
              pokemon: getPokemonName(pokemon),
              status,
            });
          }
          break;
        }
        case "consume": {
          pokemon.pokemon.heldItem = null;
          break;
        }
        case "survive": {
          pokemon.pokemon.currentHp = Math.max(1, effect.value as number);
          break;
        }
        case "flinch": {
          const opponent = this.getOpponentActive(side);
          if (opponent) {
            opponent.volatileStatuses.set("flinch", { turnsLeft: 1 });
          }
          break;
        }
        case "volatile-cure": {
          const volatile = effect.value as string;
          if (
            pokemon.volatileStatuses.has(volatile as import("@pokemon-lib-ts/core").VolatileStatus)
          ) {
            pokemon.volatileStatuses.delete(
              volatile as import("@pokemon-lib-ts/core").VolatileStatus,
            );
            this.emit({
              type: "volatile-end",
              side,
              pokemon: getPokemonName(pokemon),
              volatile: volatile as import("@pokemon-lib-ts/core").VolatileStatus,
            });
          }
          break;
        }
      }
    }
    for (const msg of result.messages) {
      this.emit({ type: "message", text: msg });
    }
  }

  private processLeechSeed(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has("leech-seed")) continue;

      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const drain = Math.max(1, Math.floor(maxHp / 8));
      active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - drain);

      this.emit({
        type: "damage",
        side: side.index,
        pokemon: getPokemonName(active),
        amount: drain,
        currentHp: active.pokemon.currentHp,
        maxHp,
        source: "leech-seed",
      });

      const opponentSide = side.index === 0 ? 1 : 0;
      const opponent = this.getActive(opponentSide as 0 | 1);
      if (opponent && opponent.pokemon.currentHp > 0) {
        const oppMaxHp = opponent.pokemon.calculatedStats?.hp ?? opponent.pokemon.currentHp;
        const oldHp = opponent.pokemon.currentHp;
        opponent.pokemon.currentHp = Math.min(oppMaxHp, oldHp + drain);
        const healed = opponent.pokemon.currentHp - oldHp;
        if (healed > 0) {
          this.emit({
            type: "heal",
            side: opponentSide as 0 | 1,
            pokemon: getPokemonName(opponent),
            amount: healed,
            currentHp: opponent.pokemon.currentHp,
            maxHp: oppMaxHp,
            source: "leech-seed",
          });
        }
      }
    }
  }

  private processPerishSong(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has("perish-song")) continue;

      const perishState = active.volatileStatuses.get("perish-song");
      if (!perishState) continue;
      const counter = (perishState.data?.counter as number) ?? perishState.turnsLeft;

      this.emit({
        type: "message",
        text: `${getPokemonName(active)}'s perish count fell to ${counter - 1}!`,
      });

      if (counter <= 1) {
        active.pokemon.currentHp = 0;
        // Don't emit faint here — checkMidTurnFaints() handles it
      } else {
        if (perishState.data) {
          perishState.data.counter = counter - 1;
        } else {
          perishState.turnsLeft = counter - 1;
        }
      }
    }
  }

  private processCurse(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has("curse")) continue;

      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const damage = Math.max(1, Math.floor(maxHp / 4));
      active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);

      this.emit({
        type: "damage",
        side: side.index,
        pokemon: getPokemonName(active),
        amount: damage,
        currentHp: active.pokemon.currentHp,
        maxHp,
        source: "curse",
      });
    }
  }

  private processNightmare(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has("nightmare")) continue;
      if (active.pokemon.status !== "sleep") continue;

      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      const damage = Math.max(1, Math.floor(maxHp / 4));
      active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);

      this.emit({
        type: "damage",
        side: side.index,
        pokemon: getPokemonName(active),
        amount: damage,
        currentHp: active.pokemon.currentHp,
        maxHp,
        source: "nightmare",
      });
    }
  }
}
