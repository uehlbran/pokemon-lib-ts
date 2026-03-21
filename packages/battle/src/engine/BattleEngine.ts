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
import { generations } from "../ruleset";
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
  // ─── State mutation model ───────────────────────────────────────────────────
  // BattleState is the source of truth. It is mutated in-place during turn
  // resolution. Events (BattleEvent[]) are emitted as notifications for UI/replay
  // consumers — do not reconstruct state from events.
  // ────────────────────────────────────────────────────────────────────────────

  readonly state: BattleState;
  private readonly ruleset: GenerationRuleset;
  private readonly dataManager: DataManager;
  private listeners: Set<BattleEventListener> = new Set();
  private eventLog: BattleEvent[] = [];
  private pendingActions: Map<0 | 1, BattleAction> = new Map();
  private pendingSwitches: Map<0 | 1, number> = new Map();
  private sidesNeedingSwitch: Set<0 | 1> = new Set();
  // Tracks which pokemon have already been processed as fainted during the current turn,
  // preventing duplicate faint events and double faintCount increments when
  // checkMidTurnFaints() is called multiple times per turn. Cleared at turn start.
  private faintedPokemonThisTurn: Set<string> = new Set();

  constructor(config: BattleConfig, ruleset: GenerationRuleset, dataManager: DataManager) {
    this.ruleset = ruleset;
    this.dataManager = dataManager;

    this.state = {
      phase: "battle-start",
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
        const species = this.dataManager.getSpecies(pokemon.speciesId);
        if (!species) {
          throw new Error(
            `BattleEngine: species "${pokemon.speciesId}" not found in data. ` +
              `Validate your team before starting a battle.`,
          );
        }
        pokemon.calculatedStats = this.ruleset.calculateStats(pokemon, species);
        pokemon.currentHp = pokemon.calculatedStats.hp;
      }
    }
  }

  /**
   * Factory: create a BattleEngine from a registered generation number.
   *
   * Requires the gen ruleset to be registered via `generations.register(ruleset)` first.
   * Useful for consumers who prefer `BattleEngine.fromGeneration(1, config, dm)` over
   * importing `Gen1Ruleset` directly.
   *
   * @param gen - Generation number (1–9)
   * @param config - Battle configuration
   * @param dataManager - Data manager for species/move lookups
   * @throws If the generation is not registered
   */
  static fromGeneration(gen: number, config: BattleConfig, dataManager: DataManager): BattleEngine {
    const ruleset = generations.get(gen as Parameters<typeof generations.get>[0]);
    return new BattleEngine(config, ruleset, dataManager);
  }

  // --- Event Emitter ---

  /**
   * Subscribes a listener to receive every `BattleEvent` as it is emitted.
   * The listener is called synchronously within `submitAction()` / `start()`.
   *
   * @param listener - Callback that receives each event in emission order.
   */
  on(listener: BattleEventListener): void {
    this.listeners.add(listener);
  }

  /**
   * Removes a previously registered event listener.
   * If `listener` was never registered, this is a no-op.
   *
   * @param listener - The same function reference passed to `on()`.
   */
  off(listener: BattleEventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Returns the ordered log of all events emitted since `start()` was called.
   * Useful for replay, undo, and post-battle analysis.
   *
   * @returns An immutable view of the event log; safe to iterate or serialize.
   */
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

  /**
   * Starts the battle, transitioning from `battle-start` to `action-select`.
   *
   * Sends out the lead Pokémon for each side, triggers on-entry abilities
   * (in Speed order), and emits a `BattleStartEvent` followed by `SwitchInEvent`s.
   *
   * @throws If the battle is not in `battle-start` phase (i.e., already started).
   */
  start(): void {
    if (this.state.phase !== "battle-start") {
      throw new Error(`Cannot start battle in phase ${this.state.phase}`);
    }

    this.emit({
      type: "battle-start",
      format: this.state.format,
      generation: this.state.generation,
    });

    // Send out lead pokemon for each side (skipAbility=true: abilities are processed
    // separately below in speed order after both sides have their leads on the field)
    for (const side of this.state.sides) {
      this.sendOut(side, 0, true);
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
            const result = this.ruleset.applyAbility("on-switch-in", {
              pokemon: entry.pokemon,
              opponent,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-switch-in",
            });
            this.processAbilityResult(result, entry.pokemon, opponent, entry.side);
          }
        }
      }
    }

    this.transitionTo("action-select");
  }

  /**
   * Submits an action for a side during the `action-select` phase.
   *
   * When both sides have submitted their actions, turn resolution begins automatically:
   * actions are sorted by priority, then executed in order. The engine transitions through
   * `turn-resolve` → `turn-end` → `faint-check`, and then back to `action-select`
   * (or `switch-prompt` / `battle-end` as appropriate).
   *
   * @param side - Which side is submitting (0 = player, 1 = opponent).
   * @param action - The action to perform this turn (move, switch, item, run, etc.).
   * @throws If the current phase is not `action-select`.
   * @throws If the battle has already ended.
   */
  submitAction(side: 0 | 1, action: BattleAction): void {
    if (this.state.phase !== "action-select") {
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

  /**
   * Submits a forced switch choice after a Pokémon has fainted (`switch-prompt` phase).
   *
   * When all sides that need to switch have submitted their choices, the replacement
   * Pokémon are sent out and the battle transitions back to `action-select`
   * (or `battle-end` if the switch reveals no valid replacements).
   *
   * @param side - Which side is submitting the switch (0 or 1).
   * @param teamSlot - Index in the side's `team` array of the Pokémon to send in.
   *   Must be a living (HP > 0) Pokémon that is not already on the field.
   * @throws If the current phase is not `switch-prompt`.
   * @throws If the given side does not need to switch.
   */
  submitSwitch(side: 0 | 1, teamSlot: number): void {
    if (this.state.phase !== "switch-prompt") {
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
        this.transitionTo("battle-end");
        return;
      }

      this.transitionTo("action-select");
    }
  }

  /**
   * Returns the current phase of the battle state machine.
   *
   * @returns The current `BattlePhase` string literal.
   */
  getPhase(): BattlePhase {
    return this.state.phase;
  }

  /**
   * Returns the list of selectable moves for the active Pokémon on the given side.
   *
   * Each entry in the returned array includes PP, type, category, and whether the
   * move is currently disabled (0 PP, Disable, Encore, Taunt, etc.).
   * Returns an empty array if there is no active Pokémon in slot 0.
   *
   * @param side - Which side to query (0 = player, 1 = opponent).
   * @returns An array of `AvailableMove` objects, one per move slot (typically 4).
   */
  getAvailableMoves(side: 0 | 1): AvailableMove[] {
    const active = this.state.sides[side].active[0];
    if (!active) return [];

    return active.pokemon.moves.flatMap((slot, index) => {
      let moveData: MoveData | undefined;
      try {
        moveData = this.dataManager.getMove(slot.moveId);
      } catch {
        this.emit({
          type: "engine-warning",
          message: `Move "${slot.moveId}" not found in data for Pokémon "${active.pokemon.speciesId}". Slot skipped.`,
        });
        return [];
      }

      // Determine if the move is disabled and why
      let disabled = false;
      let disabledReason: string | undefined;

      if (slot.currentPP <= 0) {
        disabled = true;
        disabledReason = "No PP remaining";
      } else if (
        active.volatileStatuses.has("disable") &&
        active.volatileStatuses.get("disable")?.data?.moveId === slot.moveId
      ) {
        disabled = true;
        disabledReason = "Move is disabled";
      } else if (active.volatileStatuses.has("taunt") && moveData?.category === "status") {
        // Taunt prevents status moves
        // Source: Bulbapedia — "Taunt prevents the target from using status moves"
        disabled = true;
        disabledReason = "Blocked by Taunt";
      } else if (active.volatileStatuses.has("choice-locked")) {
        // Choice lock restricts to the locked move only
        // Source: Bulbapedia — Choice Band/Specs/Scarf lock the user into the first move used
        const choiceData = active.volatileStatuses.get("choice-locked")?.data;
        const lockedMoveId = choiceData?.moveId as string | undefined;
        if (lockedMoveId && slot.moveId !== lockedMoveId) {
          disabled = true;
          disabledReason = "Locked by Choice item";
        }
      }

      return [
        {
          index,
          moveId: slot.moveId,
          displayName: moveData?.displayName ?? slot.moveId,
          type: moveData?.type ?? ("normal" as const),
          category: moveData?.category ?? ("physical" as const),
          pp: slot.currentPP,
          maxPp: slot.maxPP,
          disabled,
          disabledReason,
        },
      ];
    });
  }

  /**
   * Returns the team indices of Pokémon that can be switched in for the given side.
   *
   * Excludes fainted Pokémon, the currently active Pokémon, and any cases where
   * the ruleset prevents switching (e.g., Mean Look, Shadow Tag, trapping moves).
   *
   * @param side - Which side to query (0 = player, 1 = opponent).
   * @returns An array of `team` indices (0-based) for valid switch targets.
   *   Returns an empty array if switching is not possible (trapping) or no valid targets exist.
   */
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

  /**
   * Returns `true` if the battle has concluded (phase is `battle-end`).
   *
   * @returns `true` after a `BattleEndEvent` has been emitted; `false` otherwise.
   */
  isEnded(): boolean {
    return this.state.ended;
  }

  /**
   * Returns the winning side after the battle has ended.
   *
   * @returns `0` if side 0 won, `1` if side 1 won, or `null` if the battle ended in a draw
   *   or has not yet ended.
   */
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

  /** Restore a battle from serialized state.
   *
   * Uses Object.create to skip the constructor entirely — avoids wasteful
   * stat recalculation, HP reset, and event emission that would be immediately
   * overwritten. The serialized state already contains all computed values.
   *
   * Fix for: https://github.com/uehlbran/pokemon-lib-ts/issues/79
   */
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

    // Create the engine instance without running the constructor.
    // This avoids: (1) stat recalculation, (2) HP reset to max,
    // (3) requiring DataManager to have species data loaded.
    const engine = Object.create(BattleEngine.prototype) as BattleEngine;

    // Initialize all instance fields. Uses Object.defineProperties to set
    // private/readonly fields without requiring type casts to `any`.
    Object.defineProperties(engine, {
      state: { value: parsed, writable: false, enumerable: true, configurable: false },
      ruleset: { value: ruleset, writable: false, enumerable: false, configurable: false },
      dataManager: { value: dataManager, writable: false, enumerable: false, configurable: false },
      listeners: { value: new Set(), writable: true, enumerable: false, configurable: false },
      eventLog: { value: [], writable: true, enumerable: false, configurable: false },
      pendingActions: { value: new Map(), writable: true, enumerable: false, configurable: false },
      pendingSwitches: { value: new Map(), writable: true, enumerable: false, configurable: false },
      sidesNeedingSwitch: {
        value: new Set(),
        writable: true,
        enumerable: false,
        configurable: false,
      },
      faintedPokemonThisTurn: {
        value: new Set(),
        writable: true,
        enumerable: false,
        configurable: false,
      },
    });

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
      trainer,
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

  private sendOut(side: BattleSide, teamSlot: number, skipAbility = false): void {
    const pokemon = side.team[teamSlot];
    if (!pokemon) return;

    const species = this.dataManager.getSpecies(pokemon.speciesId);
    if (!species) {
      throw new Error(
        `BattleEngine: species "${pokemon.speciesId}" missing during switch-in. ` +
          `This should not happen if species was validated at battle start.`,
      );
    }
    const types = [...species.types];

    const active = createActivePokemon(pokemon, teamSlot, types);
    side.active[0] = active;

    this.emit({
      type: "switch-in",
      side: side.index,
      pokemon: createPokemonSnapshot(active),
      slot: 0,
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
      // Source: Bulbapedia — Poison-type absorbs Toxic Spikes on switch-in
      if (hazardResult.hazardsToRemove && hazardResult.hazardsToRemove.length > 0) {
        for (const hazardType of hazardResult.hazardsToRemove) {
          side.hazards = side.hazards.filter((h) => h.type !== hazardType);
        }
      }
      for (const msg of hazardResult.messages) {
        this.emit({ type: "message", text: msg });
      }
    }

    // Apply on-switch-in abilities for the newly sent-out Pokemon
    // Source: pret/pokeemerald src/battle_util.c AbilityBattleEffects — switch-in abilities
    // must have their results processed
    // skipAbility is true during initial battle setup (start()) where abilities are
    // processed separately in speed order after both sides have sent out their leads.
    if (!skipAbility && this.ruleset.hasAbilities() && active.pokemon.currentHp > 0) {
      const opponent = this.getOpponentActive(side.index);
      if (opponent) {
        const abilityResult = this.ruleset.applyAbility("on-switch-in", {
          pokemon: active,
          opponent,
          state: this.state,
          rng: this.state.rng,
          trigger: "on-switch-in",
        });
        this.processAbilityResult(abilityResult, active, opponent, side.index);
      }
    }
  }

  private resolveTurn(): void {
    // ─── Turn state machine ──────────────────────────────────────────────────────
    // battle-start → action-select
    // action-select → turn-resolve     (both sides submit actions)
    // turn-resolve  → turn-end         (all actions execute)
    // turn-end      → faint-check      (end-of-turn effects)
    // faint-check   → switch-prompt    (if a Pokémon fainted and replacement needed)
    //              → action-select     (normal next turn)
    //              → battle-end        (all Pokémon on one side fainted)
    // ────────────────────────────────────────────────────────────────────────────

    const action0 = this.pendingActions.get(0);
    const action1 = this.pendingActions.get(1);
    if (!action0 || !action1) return;
    const actions = [action0, action1];
    this.pendingActions.clear();

    // Enforce recharge volatile: override submitted action for recharging Pokemon
    for (let side = 0 as 0 | 1; side <= 1; side = (side + 1) as 0 | 1) {
      const active = this.getActive(side);
      if (active && active.pokemon.currentHp > 0 && active.volatileStatuses.has("recharge")) {
        active.volatileStatuses.delete("recharge");
        actions[side] = { type: "recharge", side };
      }
    }

    // Reset per-turn faint deduplication set so a new faint on a new turn is
    // correctly recorded (fixes #78 — duplicate faint events across checkMidTurnFaints calls).
    this.faintedPokemonThisTurn.clear();

    // Record the event log position before any events are emitted this turn
    // so that turn history captures only current-turn events (fixes #84).
    const turnStartIndex = this.eventLog.length;

    // --- turn-start ---
    this.transitionTo("turn-start");
    this.state.turnNumber++;
    this.emit({ type: "turn-start", turnNumber: this.state.turnNumber });

    // --- turn-resolve ---
    this.transitionTo("turn-resolve");

    // Sort actions by priority / speed / random
    const orderedActions = this.ruleset.resolveTurnOrder(actions, this.state, this.state.rng);

    // --- PURSUIT PRE-CHECK (Gen 2-7) ---
    // If a Pokemon uses Pursuit and the opponent is switching, Pursuit fires first
    // with doubled base power, before the switch resolves.
    if (this.ruleset.shouldExecutePursuitPreSwitch()) {
      for (let i = 0; i < orderedActions.length; i++) {
        const action = orderedActions[i];
        if (!action || action.type !== "move") continue;
        const actor = this.getActive(action.side);
        if (!actor || actor.pokemon.currentHp <= 0) continue;
        const moveSlot = actor.pokemon.moves[action.moveIndex];
        if (!moveSlot) continue;
        let moveData: ReturnType<typeof this.dataManager.getMove> | null = null;
        try {
          moveData = this.dataManager.getMove(moveSlot.moveId);
        } catch {
          this.emit({
            type: "engine-warning",
            message: `Pursuit move data not found. Skipping Pursuit execution.`,
          });
        }
        if (!moveData || moveData.id !== "pursuit") continue;

        // Check if the opponent is switching this turn
        const opponentAction = orderedActions.find((a, j) => j !== i && a.side !== action.side);
        if (opponentAction?.type !== "switch") continue;

        // Execute Pursuit before the switch (doubled base power for pre-switch Pursuit)
        this.executeMove(action, actor, 2);
        this.checkMidTurnFaints({ attackerSide: action.side });
        if (this.checkBattleEnd()) {
          this.transitionTo("battle-end");
          this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);
          return;
        }

        // Remove the Pursuit action from orderedActions so it doesn't fire again
        orderedActions.splice(i, 1);
        break; // Only one Pursuit per turn
      }
    }

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

      // Check for faints after each action — pass attacker side for Destiny Bond check
      // when the action is a move or struggle (opponent KO'd by an attack)
      const moveSourceForFaint =
        action.type === "move" || action.type === "struggle"
          ? { attackerSide: action.side }
          : undefined;
      this.checkMidTurnFaints(moveSourceForFaint);
      if (this.state.ended) {
        this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);
        return;
      }

      // Phase 1 residuals: per-attack effects for the acting Pokemon
      // (Gen 2: poison/burn, leech seed, nightmare, curse per pokecrystal ResidualDamage)
      if (action.type === "move" || action.type === "struggle") {
        this.processPostAttackResiduals(action.side);
        if (this.state.ended) {
          this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);
          return;
        }
      }
    }

    // --- turn-end ---
    this.transitionTo("turn-end");
    this.processEndOfTurn();

    if (this.state.ended) {
      this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);
      return;
    }

    // --- faint-check ---
    this.transitionTo("faint-check");
    if (this.checkBattleEnd()) {
      this.transitionTo("battle-end");
      this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);
      return;
    }

    // If any pokemon need replacement, prompt for switch
    if (this.needsSwitchPrompt()) {
      this.transitionTo("switch-prompt");
      this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);
      return;
    }

    // Record turn history — slice from turnStartIndex to capture only events
    // emitted during this turn (fixes #84 — slice(-50) captured cross-turn events).
    this.recordTurnHistory(this.state.turnNumber, orderedActions, turnStartIndex);

    // Reset move tracking for next turn
    for (const side of this.state.sides) {
      for (const active of side.active) {
        if (active) {
          active.movedThisTurn = false;
        }
      }
    }

    // Next turn
    this.transitionTo("action-select");
  }

  private executeMove(action: MoveAction, actor: ActivePokemon, powerMultiplier = 1): void {
    const moveSlot = actor.pokemon.moves[action.moveIndex];
    if (!moveSlot) return;

    let moveData: MoveData;
    try {
      moveData = this.dataManager.getMove(moveSlot.moveId);
    } catch {
      // Move data missing — this should not happen for pre-validated moves.
      this.emit({
        type: "engine-warning",
        message: `Move "${moveSlot.moveId}" data missing during execution.`,
      });
      this.emit({
        type: "move-fail",
        side: action.side,
        pokemon: getPokemonName(actor),
        move: moveSlot.moveId,
        reason: "unknown move",
      });
      return;
    }

    // Apply power multiplier (e.g., Pursuit pre-switch doubles power)
    const effectiveMoveData =
      powerMultiplier !== 1 && moveData.power !== null
        ? { ...moveData, power: moveData.power * powerMultiplier }
        : moveData;

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

    // Protect consecutive use: delegate the success roll to the ruleset
    if (moveData.effect?.type === "protect") {
      if (!this.ruleset.rollProtectSuccess(actor.consecutiveProtects, this.state.rng)) {
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
    if (effectiveMoveData.category !== "status" && effectiveMoveData.power !== null) {
      const isCrit = this.ruleset.rollCritical({
        attacker: actor,
        move: effectiveMoveData,
        state: this.state,
        rng: this.state.rng,
        defender,
      });

      const result = this.ruleset.calculateDamage({
        attacker: actor,
        defender,
        move: effectiveMoveData,
        state: this.state,
        rng: this.state.rng,
        isCrit,
      });

      damage = result.damage;

      // Passive immunity ability (Water Absorb, Volt Absorb, Motor Drive, Flash Fire, Dry Skin, Levitate)
      // Source: Showdown sim/battle-actions.ts — ability immunities checked after damage calc returns 0
      if (this.ruleset.hasAbilities() && result.damage === 0 && result.effectiveness === 0) {
        const immunityResult = this.ruleset.applyAbility("passive-immunity", {
          pokemon: defender,
          opponent: actor,
          state: this.state,
          rng: this.state.rng,
          trigger: "passive-immunity",
          move: effectiveMoveData,
        });
        if (immunityResult.activated) {
          this.processAbilityResult(immunityResult, defender, actor, defenderSide as 0 | 1);
          actor.lastMoveUsed = moveData.id;
          actor.movedThisTurn = true;
          return; // Move fully absorbed — skip damage, effects, items
        }
      }

      // Effectiveness and crit events fire regardless of substitute — emit before
      // the damage is applied so the ordering matches real cartridge behaviour.
      if (result.effectiveness !== 1) {
        this.emit({ type: "effectiveness", multiplier: result.effectiveness });
      }
      if (result.isCrit) {
        this.emit({ type: "critical-hit" });
      }

      // Apply damage to substitute or pokemon
      let hitSubstitute = false;
      if (defender.substituteHp > 0 && !effectiveMoveData.flags.bypassSubstitute) {
        hitSubstitute = true;
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
        defender.lastDamageType = effectiveMoveData.type;
        defender.lastDamageCategory = effectiveMoveData.category;
        this.emit({
          type: "damage",
          side: defenderSide as 0 | 1,
          pokemon: getPokemonName(defender),
          amount: damage,
          currentHp: defender.pokemon.currentHp,
          maxHp: defender.pokemon.calculatedStats?.hp ?? 1,
          source: effectiveMoveData.id,
        });
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

      // Contact ability trigger (Static, Flame Body, Poison Point, Rough Skin, etc.)
      // Source: Showdown sim/battle-actions.ts — contact abilities checked after damage
      if (
        this.ruleset.hasAbilities() &&
        damage > 0 &&
        effectiveMoveData.flags.contact &&
        !hitSubstitute
      ) {
        if (defender.pokemon.currentHp > 0) {
          const contactResult = this.ruleset.applyAbility("on-contact", {
            pokemon: defender,
            opponent: actor,
            state: this.state,
            rng: this.state.rng,
            trigger: "on-contact",
            move: effectiveMoveData,
            damage,
          });
          if (contactResult.activated) {
            this.processAbilityResult(contactResult, defender, actor, defenderSide as 0 | 1);
          }
        }
      }
    }

    // Apply move effects
    const effectResult = this.ruleset.executeMoveEffect({
      attacker: actor,
      defender,
      move: effectiveMoveData,
      damage,
      state: this.state,
      rng: this.state.rng,
    });

    this.processEffectResult(effectResult, actor, defender, action.side, defenderSide as 0 | 1);

    // Increment consecutiveProtects if protect was successfully used
    if (effectiveMoveData.effect?.type === "protect") {
      actor.consecutiveProtects++;
    }

    // Recharge: if the move requires recharge and noRecharge was not set, mark the attacker
    if (effectiveMoveData.flags.recharge && !effectResult.noRecharge) {
      actor.volatileStatuses.set("recharge", { turnsLeft: 1 });
    }

    // Held item: on-hit trigger for attacker
    if (this.ruleset.hasHeldItems() && damage > 0) {
      const atkItemResult = this.ruleset.applyHeldItem("on-hit", {
        pokemon: actor,
        state: this.state,
        rng: this.state.rng,
        move: effectiveMoveData,
      });
      if (atkItemResult.activated) {
        this.processItemResult(atkItemResult, actor, action.side);
      }
    }

    actor.lastMoveUsed = moveData.id;
    actor.movedThisTurn = true;

    // Choice lock: if the actor holds a Choice item and isn't already locked,
    // lock them into the move they just used.
    // Source: Bulbapedia — "Choice Band boosts the holder's Attack by 50%, but
    // only allows the use of the first move selected."
    if (
      this.ruleset.hasHeldItems() &&
      !actor.volatileStatuses.has("choice-locked") &&
      actor.pokemon.heldItem &&
      (actor.pokemon.heldItem === "choice-band" ||
        actor.pokemon.heldItem === "choice-specs" ||
        actor.pokemon.heldItem === "choice-scarf")
    ) {
      actor.volatileStatuses.set("choice-locked", {
        turnsLeft: -1,
        data: { moveId: moveData.id },
      });
    }
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
      outgoing.lastDamageType = null;
      outgoing.lastDamageCategory = null;
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

    // Struggle damage: delegated to ruleset (Gen 1: Normal-type, Ghost immune; Gen 2+: typeless 50 BP)
    // Source: Showdown — Struggle delegates type/damage to the generation ruleset
    const maxHp = actor.pokemon.calculatedStats?.hp ?? actor.pokemon.currentHp;
    const damage = this.ruleset.calculateStruggleDamage(actor, defender, this.state);
    const defenderHpBefore = defender.pokemon.currentHp;

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
    // Use actual damage dealt (capped by defender's HP before damage) to avoid overkill recoil
    const actualDamage = Math.min(damage, defenderHpBefore);
    const recoil = this.ruleset.calculateStruggleRecoil(actor, actualDamage);
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

  private canExecuteMove(actor: ActivePokemon, move: MoveData): boolean {
    const side = this.getSideIndex(actor);

    // Flinch check
    if (actor.volatileStatuses.has("flinch")) {
      actor.volatileStatuses.delete("flinch");
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} flinched and couldn't move!`,
      });

      // On-flinch ability trigger (e.g., Steadfast raises Speed when flinched)
      // Source: Bulbapedia — Steadfast "raises the Speed stat of a Pokemon with
      // this Ability by one stage each time it flinches"
      if (this.ruleset.hasAbilities()) {
        const opponent = this.getOpponentActive(side);
        if (opponent) {
          const flinchResult = this.ruleset.applyAbility("on-flinch", {
            pokemon: actor,
            opponent,
            state: this.state,
            rng: this.state.rng,
            trigger: "on-flinch",
          });
          if (flinchResult.activated) {
            this.processAbilityResult(flinchResult, actor, opponent, side);
          }
        }
      }

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
      if (move.flags.defrost) {
        // Defrost moves (Scald, Flame Wheel, etc.) always thaw the user
        actor.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side,
          pokemon: getPokemonName(actor),
          status: "freeze",
        });
      } else if (this.ruleset.checkFreezeThaw(actor, this.state.rng)) {
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

    // Confusion check — turn countdown delegated to ruleset (Gen 7+ changed range from 1-4 to 2-5)
    if (actor.volatileStatuses.has("confusion")) {
      const confState = actor.volatileStatuses.get("confusion");
      if (!confState || confState.turnsLeft <= 0) {
        // Confusion already expired (e.g., turnsLeft was set to 0 before this check)
        actor.volatileStatuses.delete("confusion");
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile: "confusion",
        });
      } else {
        const stillConfused = this.ruleset.processConfusionTurn(actor, this.state);
        if (!stillConfused) {
          // Confusion ended after decrement
          actor.volatileStatuses.delete("confusion");
          this.emit({
            type: "volatile-end",
            side,
            pokemon: getPokemonName(actor),
            volatile: "confusion",
          });
        } else {
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
    }

    // Bound check — turn countdown delegated to ruleset (trap mechanics vary by gen)
    if (actor.volatileStatuses.has("bound")) {
      const boundState = actor.volatileStatuses.get("bound");
      if (!boundState || boundState.turnsLeft <= 0) {
        // Bound already expired
        actor.volatileStatuses.delete("bound");
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile: "bound",
        });
      } else {
        const stillBound = this.ruleset.processBoundTurn(actor, this.state);
        if (!stillBound) {
          // Binding ended after decrement
          actor.volatileStatuses.delete("bound");
          this.emit({
            type: "volatile-end",
            side,
            pokemon: getPokemonName(actor),
            volatile: "bound",
          });
        } else {
          this.emit({
            type: "message",
            text: `${getPokemonName(actor)} is bound and can't move!`,
          });
          return false;
        }
      }
    }

    // Taunt check — prevents status moves (runtime enforcement, mirrors getAvailableMoves check)
    // Source: Bulbapedia — "Taunt prevents the target from using status moves"
    if (actor.volatileStatuses.has("taunt") && move.category === "status") {
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} can't use ${move.id} after the taunt!`,
      });
      return false;
    }

    // Choice lock check — prevents using a different move than the locked one
    // Source: Bulbapedia — "Choice Band/Specs/Scarf lock the user into the first move selected"
    if (actor.volatileStatuses.has("choice-locked")) {
      const choiceData = actor.volatileStatuses.get("choice-locked")?.data;
      const lockedMoveId = choiceData?.moveId as string | undefined;
      if (lockedMoveId && move.id !== lockedMoveId) {
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is locked into ${lockedMoveId} by its Choice item!`,
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
      // Set just-frozen volatile so EoT processEndOfTurnDefrost skips the thaw check
      // for the same turn the Pokemon was frozen (wPlayerJustGotFrozen guard).
      // Source: pret/pokecrystal engine/battle/core.asm:1538-1540 — wPlayerJustGotFrozen
      if (result.statusInflicted === "freeze") {
        defender.volatileStatuses.set("just-frozen", { turnsLeft: 1 });
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

    // Tailwind set (Gen 4+)
    if (result.tailwindSet) {
      const tailwindSide =
        result.tailwindSet.side === "attacker"
          ? this.state.sides[attackerSide]
          : this.state.sides[defenderSide];
      const tailwindSideIndex =
        result.tailwindSet.side === "attacker" ? attackerSide : defenderSide;
      tailwindSide.tailwind = { active: true, turnsLeft: result.tailwindSet.turnsLeft };
      this.emit({
        type: "message",
        text: `Side ${tailwindSideIndex}'s tailwind began!`,
      });
    }

    // Trick Room set (Gen 4+)
    if (result.trickRoomSet) {
      this.state.trickRoom = { active: true, turnsLeft: result.trickRoomSet.turnsLeft };
      this.emit({ type: "message", text: "The dimensions were twisted!" });
    }

    // Future attack (Future Sight / Doom Desire) — schedule on the target's side
    // Source: Bulbapedia — "In Generations II-IV, damage is calculated when
    // Future Sight or Doom Desire hits."
    if (result.futureAttack) {
      const targetSideState = this.state.sides[defenderSide];
      if (!targetSideState.futureAttack) {
        // Pre-calculate damage at launch time as a fallback for when the source Pokemon
        // has fainted or switched before the attack resolves. In Gen 4, damage is ideally
        // recalculated at hit time (using current SpAtk/stats), but if the source is gone
        // the stored value is used instead.
        let launchDamage = 0;
        try {
          const futureMove = this.dataManager.getMove(result.futureAttack.moveId);
          const calcResult = this.ruleset.calculateDamage({
            attacker,
            defender,
            move: futureMove,
            state: this.state,
            rng: this.state.rng,
            isCrit: false,
          });
          launchDamage = calcResult.damage;
        } catch {
          // Move data missing — launchDamage stays 0 as final fallback
        }
        targetSideState.futureAttack = {
          moveId: result.futureAttack.moveId,
          turnsLeft: result.futureAttack.turnsLeft,
          damage: launchDamage, // fallback; engine prefers recalc at hit time when source is alive
          sourceSide: result.futureAttack.sourceSide,
        };
        this.emit({
          type: "message",
          text: `${getPokemonName(attacker)} foresaw an attack!`,
        });
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
        customTarget.lastDamageType = result.customDamage.type ?? null;
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

    // Status cure: cures status AND resets stat stages for target(s)
    // statusCuredOnly: cures status WITHOUT resetting stages (e.g. Rest)
    // statStagesReset: resets stages WITHOUT curing status (e.g. Haze attacker side)
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
        // Reset all stat stages for this target (coupled with status cure)
        t.statStages = createDefaultStatStages();
      }
    }

    // statStagesReset — reset stat stages without curing status (e.g. Haze attacker side)
    if (result.statStagesReset) {
      const resetTargets: Array<{ pokemon: ActivePokemon }> = [];
      if (
        result.statStagesReset.target === "attacker" ||
        result.statStagesReset.target === "both"
      ) {
        resetTargets.push({ pokemon: attacker });
      }
      if (
        result.statStagesReset.target === "defender" ||
        result.statStagesReset.target === "both"
      ) {
        resetTargets.push({ pokemon: defender });
      }
      for (const { pokemon: t } of resetTargets) {
        t.statStages = createDefaultStatStages();
      }
    }

    // statusCuredOnly — cure status without resetting stat stages (for Rest, unlike Haze)
    if (result.statusCuredOnly) {
      const targets: Array<{ pokemon: ActivePokemon; side: 0 | 1 }> = [];
      if (
        result.statusCuredOnly.target === "attacker" ||
        result.statusCuredOnly.target === "both"
      ) {
        targets.push({ pokemon: attacker, side: attackerSide });
      }
      if (
        result.statusCuredOnly.target === "defender" ||
        result.statusCuredOnly.target === "both"
      ) {
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
        // NOTE: stat stages are intentionally NOT reset here (unlike statusCured/Haze)
      }
    }

    // selfStatusInflicted — apply a status condition to the ATTACKER
    if (result.selfStatusInflicted && !attacker.pokemon.status) {
      attacker.pokemon.status = result.selfStatusInflicted;
      this.emit({
        type: "status-inflict",
        side: attackerSide,
        pokemon: getPokemonName(attacker),
        status: result.selfStatusInflicted,
      });
      if (result.selfStatusInflicted === "badly-poisoned") {
        attacker.volatileStatuses.set("toxic-counter", {
          turnsLeft: -1,
          data: { counter: 1 },
        });
      }
      if (result.selfStatusInflicted === "sleep") {
        // Use selfVolatileData.turnsLeft if provided (e.g., Rest's fixed 2-turn sleep)
        // otherwise roll normally
        const sleepTurns =
          result.selfVolatileData?.turnsLeft ?? this.ruleset.rollSleepTurns(this.state.rng);
        attacker.volatileStatuses.set("sleep-counter", {
          turnsLeft: sleepTurns,
          data: {},
        });
      }
    }

    // selfVolatileInflicted — add a volatile status to the ATTACKER
    if (
      result.selfVolatileInflicted &&
      !attacker.volatileStatuses.has(result.selfVolatileInflicted)
    ) {
      attacker.volatileStatuses.set(result.selfVolatileInflicted, {
        turnsLeft: result.selfVolatileData?.turnsLeft ?? -1,
        data: result.selfVolatileData?.data,
      });
      this.emit({
        type: "volatile-start",
        side: attackerSide,
        pokemon: getPokemonName(attacker),
        volatile: result.selfVolatileInflicted,
      });
    }

    // typeChange — update the types of the attacker or defender
    if (result.typeChange) {
      const typeTarget = result.typeChange.target === "attacker" ? attacker : defender;
      typeTarget.types = [...result.typeChange.types];
      this.emit({
        type: "message",
        text: `${getPokemonName(typeTarget)}'s type changed!`,
      });
    }
  }

  private processPostAttackResiduals(sideIndex: 0 | 1): void {
    // Source: pret/pokecrystal engine/battle/core.asm — ResidualDamage
    // Phase 1: runs per-Pokemon after each attack resolves
    const effects = this.ruleset.getPostAttackResidualOrder();
    for (const effect of effects) {
      switch (effect) {
        case "status-damage":
          this.processStatusDamageForSide(sideIndex);
          break;
        case "leech-seed":
          this.processLeechSeedForSide(sideIndex);
          break;
        case "nightmare":
          this.processNightmareForSide(sideIndex);
          break;
        case "curse":
          this.processCurseForSide(sideIndex);
          break;
        default:
          // Only status-damage, leech-seed, nightmare, curse are supported in Phase 1.
          // Other effects (bind, leftovers, etc.) belong in Phase 2 (getEndOfTurnOrder).
          break;
      }
      // Note: checkMidTurnFaints emits faint events but does not set state.ended.
      // The state.ended guard is consistent with the processEndOfTurn pattern.
      // Battle-end detection defers to checkBattleEnd() at the end of resolveTurn().
      this.checkMidTurnFaints();
      if (this.state.ended) return;
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
        case "bind":
          this.processBindDamage();
          break;
        case "defrost":
          this.processDefrost();
          break;
        case "safeguard-countdown":
          this.processSafeguardCountdown();
          break;
        case "mystery-berry":
          this.processMysteryBerry();
          break;
        case "stat-boosting-items":
          this.processStatBoostingItems();
          break;
        case "healing-items":
          this.processHealingItems();
          break;
        case "encore-countdown":
          this.processEncoreCountdown();
          break;
        case "weather-healing": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const opponent = this.getOpponentActive(side.index);
            const result = this.ruleset.applyAbility("on-turn-end", {
              pokemon: active,
              opponent: opponent ?? undefined,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-turn-end",
            });
            if (result.activated) {
              this.processAbilityResult(result, active, opponent ?? active, side.index);
            }
          }
          break;
        }
        case "shed-skin": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const opponent = this.getOpponentActive(side.index);
            const result = this.ruleset.applyAbility("on-turn-end", {
              pokemon: active,
              opponent: opponent ?? undefined,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-turn-end",
            });
            if (result.activated) {
              this.processAbilityResult(result, active, opponent ?? active, side.index);
            }
          }
          break;
        }
        case "poison-heal": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const opponent = this.getOpponentActive(side.index);
            const result = this.ruleset.applyAbility("on-turn-end", {
              pokemon: active,
              opponent: opponent ?? undefined,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-turn-end",
            });
            if (result.activated) {
              this.processAbilityResult(result, active, opponent ?? active, side.index);
            }
          }
          break;
        }
        case "bad-dreams": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const opponent = this.getOpponentActive(side.index);
            const result = this.ruleset.applyAbility("on-turn-end", {
              pokemon: active,
              opponent: opponent ?? undefined,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-turn-end",
            });
            if (result.activated) {
              this.processAbilityResult(result, active, opponent ?? active, side.index);
            }
          }
          break;
        }
        case "speed-boost": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const opponent = this.getOpponentActive(side.index);
            const result = this.ruleset.applyAbility("on-turn-end", {
              pokemon: active,
              opponent: opponent ?? undefined,
              state: this.state,
              rng: this.state.rng,
              trigger: "on-turn-end",
            });
            if (result.activated) {
              this.processAbilityResult(result, active, opponent ?? active, side.index);
            }
          }
          break;
        }
        case "slow-start-countdown": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            if (active.ability !== "slow-start") continue;
            // Slow Start ends after 5 turns on the field
            // Source: Pokemon Showdown Gen 4 mod — slowstart ability
            if (active.turnsOnField === 5) {
              this.emit({
                type: "message",
                text: `${active.pokemon.nickname ?? String(active.pokemon.speciesId)}'s Slow Start wore off!`,
              });
            }
          }
          break;
        }
        case "toxic-orb-activation":
        case "flame-orb-activation": {
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
          break;
        }
        case "black-sludge": {
          // Handled via applyHeldItem("end-of-turn") — same as leftovers, gen ruleset distinguishes
          if (!this.ruleset.hasHeldItems()) break;
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            if (active.pokemon.heldItem !== "black-sludge") continue;
            const itemResult = this.ruleset.applyHeldItem("end-of-turn", {
              pokemon: active,
              state: this.state,
              rng: this.state.rng,
            });
            if (itemResult.activated) {
              this.processItemResult(itemResult, active, side.index);
            }
          }
          break;
        }
        case "aqua-ring": {
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            if (!active.volatileStatuses.has("aqua-ring")) continue;
            const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
            const healAmount = Math.max(1, Math.floor(maxHp / 16));
            const oldHp = active.pokemon.currentHp;
            active.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
            const healed = active.pokemon.currentHp - oldHp;
            if (healed > 0) {
              this.emit({
                type: "heal",
                side: side.index,
                pokemon: getPokemonName(active),
                amount: healed,
                currentHp: active.pokemon.currentHp,
                maxHp,
                source: "aqua-ring",
              });
            }
          }
          break;
        }
        case "ingrain": {
          // Source: Bulbapedia — Ingrain heals 1/16 max HP per turn
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            if (!active.volatileStatuses.has("ingrain")) continue;
            const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
            const healAmount = Math.max(1, Math.floor(maxHp / 16));
            const oldHp = active.pokemon.currentHp;
            active.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
            const healed = active.pokemon.currentHp - oldHp;
            if (healed > 0) {
              this.emit({
                type: "heal",
                side: side.index,
                pokemon: getPokemonName(active),
                amount: healed,
                currentHp: active.pokemon.currentHp,
                maxHp,
                source: "ingrain",
              });
            }
          }
          break;
        }
        case "wish": {
          for (const side of this.state.sides) {
            if (!side.wish?.active) continue;
            side.wish.turnsLeft--;
            if (side.wish.turnsLeft <= 0) {
              const active = side.active[0];
              if (active && active.pokemon.currentHp > 0) {
                const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
                const healAmount = Math.min(side.wish.healAmount, maxHp - active.pokemon.currentHp);
                if (healAmount > 0) {
                  active.pokemon.currentHp += healAmount;
                  this.emit({
                    type: "heal",
                    side: side.index,
                    pokemon: getPokemonName(active),
                    amount: healAmount,
                    currentHp: active.pokemon.currentHp,
                    maxHp,
                    source: "wish",
                  });
                }
              }
              side.wish = null;
            }
          }
          break;
        }
        case "future-attack": {
          for (const side of this.state.sides) {
            if (!side.futureAttack) continue;
            side.futureAttack.turnsLeft--;
            if (side.futureAttack.turnsLeft <= 0) {
              const active = side.active[0];
              if (active && active.pokemon.currentHp > 0) {
                let futureDamage = side.futureAttack.damage;

                // Gen 4+: damage is calculated at hit time, not on use
                // Source: Bulbapedia — "In Generations II-IV, damage is calculated
                // when Future Sight or Doom Desire hits."
                if (futureDamage === 0) {
                  const sourceSideState = this.state.sides[side.futureAttack.sourceSide];
                  const sourceActive = sourceSideState.active[0];
                  if (sourceActive && sourceActive.pokemon.currentHp > 0) {
                    let moveData: MoveData | undefined;
                    try {
                      moveData = this.dataManager.getMove(side.futureAttack.moveId);
                    } catch {
                      // Move data missing — use fallback damage
                    }
                    if (moveData) {
                      const result = this.ruleset.calculateDamage({
                        attacker: sourceActive,
                        defender: active,
                        move: moveData,
                        state: this.state,
                        rng: this.state.rng,
                        isCrit: false,
                      });
                      futureDamage = result.damage;
                    }
                  }
                }

                const clampedDamage = Math.min(futureDamage, active.pokemon.currentHp);
                active.pokemon.currentHp -= clampedDamage;
                const maxHp =
                  active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp + clampedDamage;
                this.emit({
                  type: "damage",
                  side: side.index,
                  pokemon: getPokemonName(active),
                  amount: clampedDamage,
                  currentHp: active.pokemon.currentHp,
                  maxHp,
                  source: side.futureAttack.moveId,
                });
              }
              side.futureAttack = null;
            }
          }
          break;
        }
        case "taunt-countdown": {
          // Taunt volatile countdown — remove when turnsLeft reaches 0
          // Source: Bulbapedia — "Taunt lasts for 3 turns in Gen 4"
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const tauntState = active.volatileStatuses.get("taunt");
            if (!tauntState) continue;
            if (tauntState.turnsLeft > 0) {
              tauntState.turnsLeft--;
              if (tauntState.turnsLeft <= 0) {
                active.volatileStatuses.delete("taunt");
                this.emit({
                  type: "volatile-end",
                  side: side.index,
                  pokemon: getPokemonName(active),
                  volatile: "taunt",
                });
              }
            }
          }
          break;
        }
        case "disable-countdown": {
          // Disable volatile countdown — remove when turnsLeft reaches 0
          // Source: Bulbapedia — "Disable lasts for 4-7 turns in Gen 4"
          for (const side of this.state.sides) {
            const active = side.active[0];
            if (!active || active.pokemon.currentHp <= 0) continue;
            const disableState = active.volatileStatuses.get("disable");
            if (!disableState) continue;
            if (disableState.turnsLeft > 0) {
              disableState.turnsLeft--;
              if (disableState.turnsLeft <= 0) {
                active.volatileStatuses.delete("disable");
                this.emit({
                  type: "volatile-end",
                  side: side.index,
                  pokemon: getPokemonName(active),
                  volatile: "disable",
                });
              }
            }
          }
          break;
        }
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

  private processStatusDamageForSide(sideIndex: 0 | 1): void {
    const side = this.state.sides[sideIndex];
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) return;
    if (!active.pokemon.status) return;

    const status = active.pokemon.status;
    if (status === "burn" || status === "poison" || status === "badly-poisoned") {
      const damage = this.ruleset.applyStatusDamage(active, status, this.state);
      if (damage > 0) {
        active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);
        this.emit({
          type: "damage",
          side: sideIndex,
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

  private processStatusDamage(): void {
    for (let i = 0; i < this.state.sides.length; i++) {
      this.processStatusDamageForSide(i as 0 | 1);
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

  /**
   * Records the completed turn into `state.turnHistory`.
   * Called from every exit path of `resolveTurn()` so that turns ending in a KO,
   * battle end, or switch prompt are captured just like normal turns.
   */
  private recordTurnHistory(turn: number, actions: BattleAction[], turnStartIndex: number): void {
    this.state.turnHistory.push({
      turn,
      actions,
      events: [...this.eventLog.slice(turnStartIndex)],
    });
  }

  /**
   * Checks for fainted Pokemon and emits faint events.
   * @param moveSource - If provided, the side that used a move causing the faint
   *   (enables Destiny Bond check). Pass `undefined` for non-move faint sources
   *   (weather, status, recoil) where Destiny Bond should not trigger.
   */
  private checkMidTurnFaints(moveSource?: { attackerSide: 0 | 1 }): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (active && active.pokemon.currentHp <= 0) {
        // Guard against duplicate faint events when this method is called
        // multiple times per turn (e.g., after Pursuit and again after the main action).
        // The set is cleared at the start of each turn in resolveTurn() (#78).
        const key = `${side.index}-${active.pokemon.uid}`;
        if (this.faintedPokemonThisTurn.has(key)) continue;
        this.faintedPokemonThisTurn.add(key);
        this.emit({
          type: "faint",
          side: side.index,
          pokemon: getPokemonName(active),
        });
        side.faintCount++;

        // Destiny Bond: if the fainted Pokemon has destiny-bond volatile and was
        // KO'd by an opponent's move, the opponent also faints.
        // Source: Bulbapedia — "If the user faints after using this move, the
        // Pokemon that knocked it out also faints."
        if (
          active.volatileStatuses.has("destiny-bond") &&
          moveSource &&
          moveSource.attackerSide !== side.index
        ) {
          const opponent = this.state.sides[moveSource.attackerSide].active[0];
          if (opponent && opponent.pokemon.currentHp > 0) {
            opponent.pokemon.currentHp = 0;
            const opponentKey = `${moveSource.attackerSide}-${opponent.pokemon.uid}`;
            if (!this.faintedPokemonThisTurn.has(opponentKey)) {
              this.faintedPokemonThisTurn.add(opponentKey);
              this.emit({
                type: "message",
                text: `${getPokemonName(active)} took its attacker down with it!`,
              });
              this.emit({
                type: "faint",
                side: moveSource.attackerSide,
                pokemon: getPokemonName(opponent),
              });
              this.state.sides[moveSource.attackerSide].faintCount++;
            }
          }
        }
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
    throw new Error(`BattleEngine: ActivePokemon not found in any side`);
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
        case "status-inflict": {
          const statusToInflict = effect.value as import("@pokemon-lib-ts/core").PrimaryStatus;
          if (!pokemon.pokemon.status) {
            pokemon.pokemon.status = statusToInflict;
            this.emit({
              type: "status-inflict",
              side,
              pokemon: getPokemonName(pokemon),
              status: statusToInflict,
            });
          }
          break;
        }
        case "self-damage": {
          const amount = effect.value as number;
          const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
          pokemon.pokemon.currentHp = Math.max(0, pokemon.pokemon.currentHp - amount);
          this.emit({
            type: "damage",
            side,
            pokemon: getPokemonName(pokemon),
            amount,
            currentHp: pokemon.pokemon.currentHp,
            maxHp,
            source: "held-item",
          });
          break;
        }
      }
    }
    for (const msg of result.messages) {
      this.emit({ type: "message", text: msg });
    }
  }

  private processAbilityResult(
    result: import("../context").AbilityResult,
    pokemon: ActivePokemon,
    opponent: ActivePokemon,
    pokemonSide: 0 | 1,
  ): void {
    if (!result.activated) return;

    const opponentSide = pokemonSide === 0 ? 1 : 0;

    // Emit ability activation event
    this.emit({
      type: "ability-activate",
      side: pokemonSide,
      pokemon: getPokemonName(pokemon),
      ability: pokemon.ability ?? "unknown",
    });

    // Process each effect
    for (const effect of result.effects) {
      switch (effect.effectType) {
        case "stat-change": {
          // Apply stat change to the appropriate target
          const target = effect.target === "self" ? pokemon : opponent;
          const targetSide = effect.target === "self" ? pokemonSide : opponentSide;
          const stat = effect.stat ?? "attack";
          const stages = effect.stages ?? -1;
          const currentStage = target.statStages[stat];
          const newStage = Math.max(-6, Math.min(6, currentStage + stages));
          target.statStages[stat] = newStage;
          this.emit({
            type: "stat-change",
            side: targetSide,
            pokemon: getPokemonName(target),
            stat,
            stages,
            currentStage: newStage,
          });
          break;
        }
        case "weather-set": {
          // Set weather on the field
          if (effect.weather) {
            this.state.weather = {
              type: effect.weather,
              turnsLeft: effect.weatherTurns ?? -1,
              source: pokemon.ability ?? "ability",
            };
            this.emit({
              type: "weather-set",
              weather: effect.weather,
              source: pokemon.ability ?? "ability",
            });
          }
          break;
        }
        case "heal": {
          const target = effect.target === "self" ? pokemon : opponent;
          const targetSide = effect.target === "self" ? pokemonSide : opponentSide;
          const maxHp = target.pokemon.calculatedStats?.hp ?? target.pokemon.currentHp;
          const oldHp = target.pokemon.currentHp;
          const healAmount = effect.value;
          target.pokemon.currentHp = Math.min(maxHp, oldHp + healAmount);
          const healed = target.pokemon.currentHp - oldHp;
          if (healed > 0) {
            this.emit({
              type: "heal",
              side: targetSide,
              pokemon: getPokemonName(target),
              amount: healed,
              currentHp: target.pokemon.currentHp,
              maxHp,
              source: "ability",
            });
          }
          break;
        }
        case "chip-damage": {
          const target = effect.target === "self" ? pokemon : opponent;
          const targetSide = effect.target === "self" ? pokemonSide : opponentSide;
          const maxHp = target.pokemon.calculatedStats?.hp ?? target.pokemon.currentHp;
          const chipAmount = effect.value;
          target.pokemon.currentHp = Math.max(0, target.pokemon.currentHp - chipAmount);
          this.emit({
            type: "damage",
            side: targetSide,
            pokemon: getPokemonName(target),
            amount: chipAmount,
            currentHp: target.pokemon.currentHp,
            maxHp,
            source: "ability",
          });
          break;
        }
        case "status-cure": {
          const target = effect.target === "self" ? pokemon : opponent;
          const targetSide = effect.target === "self" ? pokemonSide : opponentSide;
          const status = target.pokemon.status;
          if (status) {
            target.pokemon.status = null;
            this.emit({
              type: "status-cure",
              side: targetSide,
              pokemon: getPokemonName(target),
              status,
            });
          }
          break;
        }
        case "status-inflict": {
          // Source: Showdown — Static, Flame Body, Poison Point inflict status on contact
          const target = effect.target === "self" ? pokemon : opponent;
          const targetSide = effect.target === "self" ? pokemonSide : opponentSide;
          if (!target.pokemon.status) {
            target.pokemon.status = effect.status;
            this.emit({
              type: "status-inflict",
              side: targetSide,
              pokemon: getPokemonName(target),
              status: effect.status,
            });
          }
          break;
        }
        case "volatile-inflict": {
          // Source: Showdown — abilities that inflict volatile statuses (e.g., Cute Charm)
          const target = effect.target === "self" ? pokemon : opponent;
          const targetSide = effect.target === "self" ? pokemonSide : opponentSide;
          if (!target.volatileStatuses.has(effect.volatile)) {
            target.volatileStatuses.set(effect.volatile, {
              turnsLeft: -1,
              ...(effect.data ? { data: effect.data } : {}),
            });
            this.emit({
              type: "volatile-start",
              side: targetSide,
              pokemon: getPokemonName(target),
              volatile: effect.volatile,
            });
          }
          break;
        }
        case "ability-change": {
          // Ability swap effects (Trace, Skill Swap, etc.)
          // Source: Bulbapedia — various ability-swapping mechanics
          const target = effect.target === "self" ? pokemon : opponent;
          target.ability = effect.newAbility;
          this.emit({
            type: "message",
            text: `${getPokemonName(target)}'s ability changed to ${effect.newAbility}!`,
          });
          break;
        }
        default:
          // Other effect types (damage-reduction, etc.) not yet implemented
          break;
      }
    }

    // Emit messages
    for (const msg of result.messages) {
      this.emit({ type: "message", text: msg });
    }
  }

  private processLeechSeedForSide(sideIndex: 0 | 1): void {
    const side = this.state.sides[sideIndex];
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) return;
    if (!active.volatileStatuses.has("leech-seed")) return;

    const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
    const drain = this.ruleset.calculateLeechSeedDrain(active);
    active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - drain);

    this.emit({
      type: "damage",
      side: sideIndex,
      pokemon: getPokemonName(active),
      amount: drain,
      currentHp: active.pokemon.currentHp,
      maxHp,
      source: "leech-seed",
    });

    const opponentSide = sideIndex === 0 ? 1 : 0;
    const opponent = this.getActive(opponentSide);
    if (opponent && opponent.pokemon.currentHp > 0) {
      const oppMaxHp = opponent.pokemon.calculatedStats?.hp ?? opponent.pokemon.currentHp;
      const oldHp = opponent.pokemon.currentHp;
      opponent.pokemon.currentHp = Math.min(oppMaxHp, oldHp + drain);
      const healed = opponent.pokemon.currentHp - oldHp;
      if (healed > 0) {
        this.emit({
          type: "heal",
          side: opponentSide,
          pokemon: getPokemonName(opponent),
          amount: healed,
          currentHp: opponent.pokemon.currentHp,
          maxHp: oppMaxHp,
          source: "leech-seed",
        });
      }
    }
  }

  private processLeechSeed(): void {
    for (let i = 0; i < this.state.sides.length; i++) {
      this.processLeechSeedForSide(i as 0 | 1);
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

  private processCurseForSide(sideIndex: 0 | 1): void {
    const side = this.state.sides[sideIndex];
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) return;
    if (!active.volatileStatuses.has("curse")) return;

    const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
    const damage = this.ruleset.calculateCurseDamage(active);
    active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);

    this.emit({
      type: "damage",
      side: sideIndex,
      pokemon: getPokemonName(active),
      amount: damage,
      currentHp: active.pokemon.currentHp,
      maxHp,
      source: "curse",
    });
  }

  private processCurse(): void {
    for (let i = 0; i < this.state.sides.length; i++) {
      this.processCurseForSide(i as 0 | 1);
    }
  }

  private processNightmareForSide(sideIndex: 0 | 1): void {
    const side = this.state.sides[sideIndex];
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) return;
    if (!active.volatileStatuses.has("nightmare")) return;
    if (active.pokemon.status !== "sleep") return;

    const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
    const damage = this.ruleset.calculateNightmareDamage(active);
    active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);

    this.emit({
      type: "damage",
      side: sideIndex,
      pokemon: getPokemonName(active),
      amount: damage,
      currentHp: active.pokemon.currentHp,
      maxHp,
      source: "nightmare",
    });
  }

  private processNightmare(): void {
    for (let i = 0; i < this.state.sides.length; i++) {
      this.processNightmareForSide(i as 0 | 1);
    }
  }

  private processBindDamage(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has("bound")) continue;

      // Deal end-of-turn damage — delegate to ruleset (Gen 2-4: 1/16, Gen 5+: 1/8)
      // Counter management (decrement + removal) is handled by canExecuteMove.
      const damage = this.ruleset.calculateBindDamage(active);
      if (damage <= 0) continue; // Gen 1 returns 0

      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);
      this.emit({
        type: "damage",
        side: side.index,
        pokemon: getPokemonName(active),
        amount: damage,
        currentHp: active.pokemon.currentHp,
        maxHp,
        source: "bind",
      });
    }
  }

  /**
   * Process defrost (freeze thaw) end-of-turn.
   * Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
   * In Gen 2, frozen Pokemon have a 25/256 (~9.77%) chance to thaw each turn
   * BETWEEN turns, not before they move. Pokemon frozen this turn (justGotFrozen)
   * do not get a thaw check.
   */
  private processDefrost(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (active.pokemon.status !== "freeze") continue;

      // Delegate to the ruleset — Gen 2 uses 25/256 EoT thaw with just-frozen guard;
      // Gen 1 always returns false; Gen 3+ always returns false (thaw is handled pre-move).
      if (this.ruleset.processEndOfTurnDefrost(active, this.state.rng)) {
        active.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side: side.index,
          pokemon: getPokemonName(active),
          status: "freeze",
        });
      }
    }
  }

  /**
   * Process Safeguard countdown.
   * Source: pret/pokecrystal engine/battle/core.asm:1583-1618 HandleSafeguard
   * Safeguard lasts 5 turns; decrements each end-of-turn. When counter reaches 0,
   * the Safeguard screen is removed.
   *
   * Implementation note: Safeguard is tracked as a screen of type "safeguard" if present.
   * If the battle state doesn't model safeguard as a screen, this is a no-op.
   */
  private processSafeguardCountdown(): void {
    for (const side of this.state.sides) {
      // Safeguard may be stored as a screen with type "safeguard"
      const safeguardIdx = side.screens.findIndex((s) => (s.type as string) === "safeguard");
      if (safeguardIdx === -1) continue;
      const safeguard = side.screens[safeguardIdx];
      if (!safeguard) continue;
      safeguard.turnsLeft--;
      if (safeguard.turnsLeft <= 0) {
        side.screens.splice(safeguardIdx, 1);
        this.emit({
          type: "message",
          text: `Side ${side.index}'s Safeguard wore off!`,
        });
      }
    }
  }

  /**
   * Process Mystery Berry PP restoration.
   * Source: pret/pokecrystal engine/battle/core.asm:1328-1464 HandleMysteryberry
   * If a Pokemon holds Mystery Berry (Leppa Berry ancestor) and a move has 0 PP,
   * restore 5 PP to that move and consume the item.
   */
  private processMysteryBerry(): void {
    if (!this.ruleset.hasHeldItems()) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (active.pokemon.heldItem !== "mystery-berry") continue;

      // Find the first move with 0 PP
      const moveSlot = active.pokemon.moves.find((m) => m.currentPP === 0 && m.moveId);
      if (!moveSlot) continue;

      // Restore 5 PP (or 1 for Sketch per decomp, but Sketch is edge-case)
      const restoreAmount = moveSlot.moveId === "sketch" ? 1 : 5;
      moveSlot.currentPP = Math.min(moveSlot.maxPP, moveSlot.currentPP + restoreAmount);
      active.pokemon.heldItem = null;
      this.emit({
        type: "message",
        text: `${getPokemonName(active)}'s Mystery Berry restored PP!`,
      });
    }
  }

  /**
   * Process stat-boosting held items between turns.
   * Source: pret/pokecrystal engine/battle/core.asm:4476 HandleStatBoostingHeldItems
   * Delegates to the ruleset's held item system with "stat-boost-between-turns" trigger.
   */
  private processStatBoostingItems(): void {
    if (!this.ruleset.hasHeldItems()) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      const itemResult = this.ruleset.applyHeldItem("stat-boost-between-turns", {
        pokemon: active,
        state: this.state,
        rng: this.state.rng,
      });
      if (itemResult.activated) {
        this.processItemResult(itemResult, active, side.index);
      }
    }
  }

  /**
   * Process healing held items between turns.
   * Source: pret/pokecrystal engine/battle/core.asm:4245 HandleHealingItems
   * Delegates to the ruleset's held item system with "heal-between-turns" trigger.
   */
  private processHealingItems(): void {
    if (!this.ruleset.hasHeldItems()) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      const itemResult = this.ruleset.applyHeldItem("heal-between-turns", {
        pokemon: active,
        state: this.state,
        rng: this.state.rng,
      });
      if (itemResult.activated) {
        this.processItemResult(itemResult, active, side.index);
      }
    }
  }

  /**
   * Process Encore countdown.
   * Source: pret/pokecrystal engine/battle/core.asm:702-757 HandleEncore
   * Decrements the Encore counter. If it reaches 0, or the encored move has 0 PP,
   * remove the Encore volatile status.
   */
  private processEncoreCountdown(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has("encore")) continue;

      const encoreState = active.volatileStatuses.get("encore");
      if (!encoreState) continue;
      encoreState.turnsLeft--;

      // Check if encore should end: counter reached 0 or encored move has 0 PP
      let shouldEnd = encoreState.turnsLeft <= 0;
      if (!shouldEnd && encoreState.data?.moveIndex !== undefined) {
        const moveIdx = encoreState.data.moveIndex as number;
        const moveSlot = active.pokemon.moves[moveIdx];
        if (moveSlot && moveSlot.currentPP <= 0) {
          shouldEnd = true;
        }
      }

      if (shouldEnd) {
        active.volatileStatuses.delete("encore");
        this.emit({
          type: "volatile-end",
          side: side.index,
          pokemon: getPokemonName(active),
          volatile: "encore",
        });
      }
    }
  }
}
