import type {
  BattleStat,
  DataManager,
  ItemData,
  MoveData,
  PokemonSpeciesData,
  PrimaryStatus,
  SemiInvulnerableVolatile,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_MOVE_TARGET_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  getExpForLevel,
  getStatStageMultiplier,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import {
  BATTLE_ABILITY_EFFECT_TYPES,
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
  BATTLE_ITEM_EFFECT_VALUES,
} from "../constants/effect-protocol";
import { BATTLE_SOURCE_IDS } from "../constants/reference-ids";
import type {
  AvailableMove,
  BattleConfig,
  BattleValidationIssue,
  BattleValidationResult,
  DamageResult,
  MoveEffectResult,
} from "../context/types";
import type { BattleAction, ItemAction, MoveAction, RunAction } from "../events/BattleAction";
import { isMoveLikeAction } from "../events/BattleAction";
import type { BattleEvent, BattleEventEmitter, BattleEventListener } from "../events/BattleEvent";
import { generations } from "../ruleset/GenerationRegistry";
import type {
  BattleGimmickType,
  ExpRecipient,
  ExpRecipientSelectionContext,
  GenerationRuleset,
} from "../ruleset/GenerationRuleset";
import { markGoFirstItemActivated } from "../ruleset/GoFirstItemActivation";
import type { ActivePokemon, BattleSide, VolatileStatusState } from "../state/BattleSide";
import type { BattlePhase, BattleState } from "../state/BattleState";
import {
  clonePokemonInstance,
  createDefaultStatStages,
  createOnFieldPokemon,
  createPokemonSnapshot,
  getPokemonName,
} from "../utils";
import { processEndOfTurnPipeline } from "./BattleEndOfTurnPipeline";

/**
 * Moves that can be used while the user is asleep.
 * Source: Showdown data/moves.ts — sleepUsable flag on sleep-talk and snore
 * Source: Bulbapedia — "Sleep Talk can only be used while asleep"
 * Source: Bulbapedia — "Snore can only be used while asleep"
 */
const SLEEP_USABLE_MOVES: ReadonlySet<string> = new Set([
  CORE_MOVE_IDS.sleepTalk,
  CORE_MOVE_IDS.snore,
]);

/**
 * Struggle move data used when a Pokemon has no usable moves.
 * Extracted as a module constant to avoid reconstructing the object every turn.
 * Source: pokered — Struggle is a Normal/Physical move with 50 power, 100% accuracy,
 * and contact flag. Generation field is set to 1 (earliest gen) since the engine
 * passes this to the ruleset which handles gen-specific Struggle behavior.
 */
const STRUGGLE_MOVE_DATA: MoveData = {
  id: CORE_MOVE_IDS.struggle,
  displayName: "Struggle",
  type: CORE_TYPE_IDS.normal,
  category: CORE_MOVE_CATEGORIES.physical,
  power: 50,
  accuracy: 100,
  pp: 1,
  priority: 0,
  target: CORE_MOVE_TARGET_IDS.adjacentFoe,
  flags: {
    contact: true,
    sound: false,
    bullet: false,
    pulse: false,
    punch: false,
    bite: false,
    wind: false,
    slicing: false,
    powder: false,
    protect: false,
    mirror: false,
    snatch: false,
    gravity: false,
    defrost: false,
    recharge: false,
    charge: false,
    bypassSubstitute: false,
  },
  effect: null,
  description: "Struggle",
  generation: 1,
};

const BATTLE_GIMMICK_TYPES: readonly BattleGimmickType[] = ["mega", "zmove", "dynamax", "tera"];

type SerializedBattleGimmickState = Partial<Record<BattleGimmickType, unknown>>;
interface BatonPassState {
  readonly statStages: Record<BattleStat, number>;
  readonly substituteHp: number;
  readonly volatileStatuses: Map<VolatileStatus, VolatileStatusState>;
}

interface PendingSelfSwitchState {
  readonly batonPass: boolean;
}

interface PreDamageResolutionParams {
  readonly attacker: ActivePokemon;
  readonly defender: ActivePokemon;
  readonly attackerSide: 0 | 1;
  readonly defenderSide: 0 | 1;
  readonly move: MoveData;
  readonly damageResult: DamageResult;
  readonly damageRngState: number;
  readonly isCrit: boolean;
  readonly hitThroughProtect?: boolean;
  readonly defenderSelectedMove?: { id: string; category: MoveData["category"] } | null;
}
/**
 * The core battle engine. Manages the battle state machine, delegates
 * generation-specific behavior to the provided ruleset, and emits
 * a stream of BattleEvents for UI/logging consumers.
 */
export class BattleEngine implements BattleEventEmitter {
  private static readonly STABLE_CHECKPOINT_PHASES: ReadonlySet<BattlePhase> = new Set([
    "battle-start",
    "action-select",
    "switch-prompt",
    "battle-end",
  ]);

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
  private pendingSelfSwitches: Map<0 | 1, PendingSelfSwitchState> = new Map();
  // Tracks which pokemon have already been processed as fainted during the current turn,
  // preventing duplicate faint events and double faintCount increments when
  // checkMidTurnFaints() is called multiple times per turn. Cleared at turn start.
  private faintedPokemonThisTurn: Set<string> = new Set();
  // Tracks which sides had their active Pokemon phased out (Roar/Whirlwind) during
  // the current turn resolution. The replacement Pokemon should not execute the
  // phased-out Pokemon's queued action.
  private phasedSides: Set<0 | 1> = new Set();
  // Stores the actions submitted for the current turn (after priority sort).
  // Used to populate defenderSelectedMove in MoveEffectContext for Sucker Punch.
  private currentTurnActions: BattleAction[] = [];
  // Maps fainted pokemon UID → Set of participant UIDs who were active against it.
  // Used to award EXP after a faint. Both sides are tracked symmetrically but only
  // the winning side's participants receive EXP.
  // Source: Game mechanic — EXP is split among all pokemon that participated in a battle.
  private readonly participantTracker: Map<string, Set<string>> = new Map();

  private static assertRulesetGenerationMatches(
    source: "BattleEngine" | "BattleEngine.deserialize",
    battleGeneration: number,
    ruleset: GenerationRuleset,
  ): void {
    if (ruleset.generation !== battleGeneration) {
      throw new Error(
        `${source}: ruleset generation ${ruleset.generation} does not match battle generation ${battleGeneration}`,
      );
    }
  }

  private static assertSinglesOnlyFormat(
    source: "BattleEngine" | "BattleEngine.deserialize",
    format: BattleState["format"],
  ): void {
    if (format !== "singles") {
      throw new Error(`${source}: battle format "${format}" is not supported`);
    }
  }

  private static createBattleValidationIssue(
    entity: BattleValidationIssue["entity"],
    id: string,
    field: string,
    message: string,
  ): BattleValidationIssue {
    return { entity, id, field, message };
  }

  private static shouldSkipRulesetValidationMessage(message: string): boolean {
    return (
      (message.startsWith('Move "') && message.includes('" is not available in Gen ')) ||
      (message.startsWith('Item "') && message.includes('" is not available in Gen ')) ||
      (message.startsWith('Ability "') && message.includes('" is not available in Gen ')) ||
      message === "Pokemon ability is required" ||
      message === "Pokemon move slot is empty"
    );
  }

  private static formatBattleValidationErrors(errors: readonly BattleValidationIssue[]): string {
    return errors.map((issue) => `${issue.field}: ${issue.message}`).join("; ");
  }

  static validateConfig(
    config: BattleConfig,
    ruleset: GenerationRuleset,
    dataManager: DataManager,
  ): BattleValidationResult {
    const errors: BattleValidationIssue[] = [];

    if (config.format !== "singles") {
      return {
        valid: false,
        errors: [
          BattleEngine.createBattleValidationIssue(
            "battle",
            "unsupported-format",
            "format",
            `Battle format "${config.format}" is not supported`,
          ),
        ],
      };
    }

    if (config.teams.length !== 2) {
      return {
        valid: false,
        errors: [
          BattleEngine.createBattleValidationIssue(
            "team",
            "teams-length",
            "teams",
            `Singles battles require exactly 2 sides, received ${config.teams.length}`,
          ),
        ],
      };
    }

    for (const [sideIndex, team] of config.teams.entries()) {
      const teamField = `teams[${sideIndex}]`;
      if (team.length < 1) {
        errors.push(
          BattleEngine.createBattleValidationIssue(
            "team",
            `side-${sideIndex}`,
            teamField,
            `Side ${sideIndex} must have at least 1 Pokemon for singles battles`,
          ),
        );
        continue;
      }

      for (const [teamIndex, pokemon] of team.entries()) {
        const pokemonField = `${teamField}[${teamIndex}]`;

        let species: PokemonSpeciesData | null = null;
        try {
          species = dataManager.getSpecies(pokemon.speciesId);
        } catch {
          errors.push(
            BattleEngine.createBattleValidationIssue(
              "species",
              String(pokemon.speciesId),
              `${pokemonField}.speciesId`,
              `Species "${pokemon.speciesId}" is not available in the loaded data`,
            ),
          );
          continue;
        }

        for (const [moveIndex, moveSlot] of pokemon.moves.entries()) {
          const moveField = `${pokemonField}.moves[${moveIndex}].moveId`;
          if (!moveSlot.moveId) {
            errors.push(
              BattleEngine.createBattleValidationIssue(
                "move",
                `${pokemon.uid}:move-${moveIndex}`,
                moveField,
                `Move slot ${moveIndex + 1} is empty`,
              ),
            );
            continue;
          }

          try {
            dataManager.getMove(moveSlot.moveId);
          } catch {
            errors.push(
              BattleEngine.createBattleValidationIssue(
                "move",
                moveSlot.moveId,
                moveField,
                `Move "${moveSlot.moveId}" is not available in Gen ${config.generation}`,
              ),
            );
          }
        }

        if (pokemon.heldItem) {
          try {
            dataManager.getItem(pokemon.heldItem);
          } catch {
            errors.push(
              BattleEngine.createBattleValidationIssue(
                "item",
                pokemon.heldItem,
                `${pokemonField}.heldItem`,
                `Item "${pokemon.heldItem}" is not available in Gen ${config.generation}`,
              ),
            );
          }
        }

        if (ruleset.hasAbilities()) {
          if (!pokemon.ability) {
            errors.push(
              BattleEngine.createBattleValidationIssue(
                "ability",
                pokemon.uid,
                `${pokemonField}.ability`,
                "Pokemon ability is required",
              ),
            );
          } else {
            try {
              dataManager.getAbility(pokemon.ability);
            } catch {
              errors.push(
                BattleEngine.createBattleValidationIssue(
                  "ability",
                  pokemon.ability,
                  `${pokemonField}.ability`,
                  `Ability "${pokemon.ability}" is not available in Gen ${config.generation}`,
                ),
              );
            }
          }
        }

        const validation = ruleset.validatePokemon(pokemon, species);
        for (const message of validation.errors) {
          if (BattleEngine.shouldSkipRulesetValidationMessage(message)) {
            continue;
          }

          errors.push(
            BattleEngine.createBattleValidationIssue("pokemon", pokemon.uid, pokemonField, message),
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private resetBattleGimmicks(): void {
    for (const gimmickType of BATTLE_GIMMICK_TYPES) {
      this.ruleset.getBattleGimmick(gimmickType)?.reset?.();
    }
  }

  private serializeBattleGimmickState(): SerializedBattleGimmickState {
    const serializedState: SerializedBattleGimmickState = {};

    for (const gimmickType of BATTLE_GIMMICK_TYPES) {
      const gimmickState = this.ruleset.getBattleGimmick(gimmickType)?.serializeState?.();
      if (gimmickState !== undefined) {
        serializedState[gimmickType] = gimmickState;
      }
    }

    return serializedState;
  }

  private restoreBattleGimmickState(serializedState?: SerializedBattleGimmickState): void {
    this.resetBattleGimmicks();

    for (const gimmickType of BATTLE_GIMMICK_TYPES) {
      const gimmickState = serializedState?.[gimmickType];
      if (gimmickState !== undefined) {
        this.ruleset.getBattleGimmick(gimmickType)?.restoreState?.(gimmickState);
      }
    }
  }

  private static inferSwitchPromptSides(state: BattleState): Set<0 | 1> {
    const inferredSides = new Set<0 | 1>();

    for (const side of [0, 1] as const) {
      const active = state.sides[side]?.active[0];
      if (active && active.pokemon.currentHp <= 0) {
        inferredSides.add(side);
      }
    }

    return inferredSides;
  }

  private orderSwitchInAbilityEntries(
    entries: readonly [
      { side: 0 | 1; pokemon: ActivePokemon },
      { side: 0 | 1; pokemon: ActivePokemon },
    ],
  ): [{ side: 0 | 1; pokemon: ActivePokemon }, { side: 0 | 1; pokemon: ActivePokemon }] {
    const [firstEntry, secondEntry] = entries;

    const firstSpeed = firstEntry.pokemon.pokemon.calculatedStats?.speed ?? 0;
    const secondSpeed = secondEntry.pokemon.pokemon.calculatedStats?.speed ?? 0;

    if (firstSpeed === secondSpeed) {
      // Source: Battle tie-breaks use the battle RNG when both sides are otherwise tied.
      // Singles only reaches this helper with the two active switch-in ability holders.
      return this.state.rng.chance(0.5) ? [firstEntry, secondEntry] : [secondEntry, firstEntry];
    }

    return firstSpeed > secondSpeed ? [firstEntry, secondEntry] : [secondEntry, firstEntry];
  }

  private getCustomDamageMoveData(
    source: string,
    fallbackType?: MoveData["type"] | null,
  ): MoveData {
    try {
      return this.dataManager.getMove(source);
    } catch {
      return {
        ...STRUGGLE_MOVE_DATA,
        id: source,
        displayName: source,
        type: fallbackType ?? STRUGGLE_MOVE_DATA.type,
        flags: {
          ...STRUGGLE_MOVE_DATA.flags,
          contact: false,
        },
      };
    }
  }

  private normalizeCustomDamageAmount(damage: number): number {
    if (!Number.isFinite(damage)) {
      return 0;
    }
    return Math.max(0, Math.trunc(damage));
  }

  private applyCustomDamage(
    target: ActivePokemon,
    sourcePokemon: ActivePokemon,
    targetSide: 0 | 1,
    amount: number,
    source: string,
    type?: MoveData["type"] | null,
  ): void {
    const moveData = this.getCustomDamageMoveData(source, type);
    if (target.pokemon.currentHp <= 0) {
      return;
    }

    let damage = this.normalizeCustomDamageAmount(amount);

    if (damage > 0 && target.substituteHp > 0 && !moveData.flags.bypassSubstitute) {
      target.substituteHp = Math.max(0, target.substituteHp - damage);
      this.emit({
        type: "message",
        text: "The substitute took damage!",
      });
      if (target.substituteHp === 0) {
        target.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
        this.emit({
          type: "volatile-end",
          side: targetSide,
          pokemon: getPokemonName(target),
          volatile: CORE_VOLATILE_IDS.substitute,
        });
      }
      return;
    }

    if (this.ruleset.capLethalDamage) {
      const survivalResult = this.ruleset.capLethalDamage(
        damage,
        target,
        sourcePokemon,
        moveData,
        this.state,
      );
      damage = this.normalizeCustomDamageAmount(survivalResult.damage);
      for (const message of survivalResult.messages) {
        this.emit({ type: "message", text: message });
      }
      if (survivalResult.consumedItem) {
        target.pokemon.heldItem = null;
        this.emit({
          type: "item-consumed",
          side: targetSide,
          pokemon: getPokemonName(target),
          item: survivalResult.consumedItem,
        });
      }
    }

    const maxHp = target.pokemon.calculatedStats?.hp ?? target.pokemon.currentHp;
    target.pokemon.currentHp = Math.max(0, target.pokemon.currentHp - damage);
    target.lastDamageTaken = damage;
    target.lastDamageType = type ?? moveData.type;
    target.lastDamageCategory = moveData.category;
    this.emit({
      type: "damage",
      side: targetSide,
      pokemon: getPokemonName(target),
      amount: damage,
      currentHp: target.pokemon.currentHp,
      maxHp,
      source,
    });

    if (damage <= 0) {
      return;
    }

    this.ruleset.onDamageReceived(target, damage, moveData, this.state);

    if (this.ruleset.hasHeldItems()) {
      const damageTakenItemResult = this.ruleset.applyHeldItem(
        CORE_ITEM_TRIGGER_IDS.onDamageTaken,
        {
          pokemon: target,
          state: this.state,
          rng: this.state.rng,
          damage,
          move: moveData,
          opponent: sourcePokemon,
        },
      );
      if (damageTakenItemResult.activated) {
        this.processItemResult(damageTakenItemResult, target, sourcePokemon, targetSide);
      }
    }

    if (this.ruleset.hasHeldItems() && moveData.flags.contact && target.pokemon.currentHp > 0) {
      const contactItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onContact, {
        pokemon: target,
        opponent: sourcePokemon,
        state: this.state,
        rng: this.state.rng,
        damage,
        move: moveData,
      });
      if (contactItemResult.activated) {
        this.processItemResult(contactItemResult, target, sourcePokemon, targetSide);
      }
    }

    if (this.ruleset.hasAbilities() && target.pokemon.currentHp > 0) {
      const damageTakenAbilityResult = this.ruleset.applyAbility(
        CORE_ABILITY_TRIGGER_IDS.onDamageTaken,
        {
          pokemon: target,
          opponent: sourcePokemon,
          state: this.state,
          rng: this.state.rng,
          trigger: CORE_ABILITY_TRIGGER_IDS.onDamageTaken,
          move: moveData,
          damage,
        },
      );
      if (damageTakenAbilityResult.activated) {
        this.processAbilityResult(damageTakenAbilityResult, target, sourcePokemon, targetSide);
      }
    }

    if (this.ruleset.hasAbilities() && moveData.flags.contact && target.pokemon.currentHp > 0) {
      const contactAbilityResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onContact, {
        pokemon: target,
        opponent: sourcePokemon,
        state: this.state,
        rng: this.state.rng,
        trigger: CORE_ABILITY_TRIGGER_IDS.onContact,
        move: moveData,
        damage,
      });
      if (contactAbilityResult.activated) {
        this.processAbilityResult(contactAbilityResult, target, sourcePokemon, targetSide);
      }
    }
  }

  private static sanitizePendingSwitches(
    state: BattleState,
    rawPendingSwitches: unknown,
  ): Map<0 | 1, number> {
    if (!(rawPendingSwitches instanceof Map)) {
      return new Map();
    }

    const sanitizedPendingSwitches = new Map<0 | 1, number>();

    for (const [rawSide, rawTeamSlot] of rawPendingSwitches) {
      if ((rawSide !== 0 && rawSide !== 1) || !Number.isInteger(rawTeamSlot)) {
        continue;
      }

      const sideState = state.sides[rawSide];
      if (!sideState) {
        continue;
      }

      if (rawTeamSlot < 0 || rawTeamSlot >= sideState.team.length) {
        continue;
      }

      sanitizedPendingSwitches.set(rawSide, rawTeamSlot);
    }

    return sanitizedPendingSwitches;
  }

  private static sanitizeSidesNeedingSwitch(rawSidesNeedingSwitch: unknown): Set<0 | 1> {
    if (!(rawSidesNeedingSwitch instanceof Set)) {
      return new Set();
    }

    const sanitizedSidesNeedingSwitch = new Set<0 | 1>();

    for (const rawSide of rawSidesNeedingSwitch) {
      if (rawSide === 0 || rawSide === 1) {
        sanitizedSidesNeedingSwitch.add(rawSide);
      }
    }

    return sanitizedSidesNeedingSwitch;
  }

  private static restoreSwitchPromptState(
    state: BattleState,
    rawPendingSwitches: unknown,
    rawSidesNeedingSwitch: unknown,
    rawPendingSelfSwitches: unknown,
  ): {
    pendingSwitches: Map<0 | 1, number>;
    sidesNeedingSwitch: Set<0 | 1>;
    pendingSelfSwitches: Map<0 | 1, PendingSelfSwitchState>;
  } {
    if (state.phase !== "switch-prompt") {
      return {
        pendingSwitches: new Map(),
        sidesNeedingSwitch: new Set(),
        pendingSelfSwitches: new Map(),
      };
    }

    const pendingSwitches = BattleEngine.sanitizePendingSwitches(state, rawPendingSwitches);
    const sidesNeedingSwitch = BattleEngine.sanitizeSidesNeedingSwitch(rawSidesNeedingSwitch);
    const pendingSelfSwitches = BattleEngine.sanitizePendingSelfSwitches(rawPendingSelfSwitches);

    for (const side of BattleEngine.inferSwitchPromptSides(state)) {
      sidesNeedingSwitch.add(side);
    }

    for (const side of pendingSwitches.keys()) {
      sidesNeedingSwitch.add(side);
    }

    return { pendingSwitches, sidesNeedingSwitch, pendingSelfSwitches };
  }

  private static sanitizePendingSelfSwitches(
    rawPendingSelfSwitches: unknown,
  ): Map<0 | 1, PendingSelfSwitchState> {
    if (!(rawPendingSelfSwitches instanceof Map)) {
      return new Map();
    }

    const sanitizedPendingSelfSwitches = new Map<0 | 1, PendingSelfSwitchState>();

    for (const [rawSide, rawState] of rawPendingSelfSwitches) {
      if (rawSide !== 0 && rawSide !== 1) {
        continue;
      }

      const batonPass =
        rawState &&
        typeof rawState === "object" &&
        (("batonPass" in rawState && rawState.batonPass === true) ||
          ("batonPassState" in rawState && rawState.batonPassState !== null));

      sanitizedPendingSelfSwitches.set(rawSide, { batonPass });
    }

    return sanitizedPendingSelfSwitches;
  }

  constructor(config: BattleConfig, ruleset: GenerationRuleset, dataManager: DataManager) {
    BattleEngine.assertRulesetGenerationMatches("BattleEngine", config.generation, ruleset);
    BattleEngine.assertSinglesOnlyFormat("BattleEngine", config.format);
    const battleValidation = BattleEngine.validateConfig(config, ruleset, dataManager);
    if (!battleValidation.valid) {
      throw new Error(
        `BattleEngine: battle validation failed: ${BattleEngine.formatBattleValidationErrors(battleValidation.errors)}`,
      );
    }
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
      isWildBattle: config.isWildBattle ?? false,
      fleeAttempts: 0,
      ended: false,
      winner: null,
    };
    // Calculate initial stats for all pokemon after preflight validation has confirmed
    // the input teams can be safely cloned and initialized.
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
        // Reset per-battle counters at battle initialization (NOT on switch-in).
        // timesAttacked tracks hits received for Rage Fist — persists through switches
        // within a battle but must reset when PokemonInstance objects are reused.
        // Source: Showdown sim/pokemon.ts — timesAttacked is per-battle state, initialized to 0
        pokemon.timesAttacked = 0;
        // Use null-prototype object to avoid __proto__ key collisions with move IDs.
        pokemon.rageFistLastHitTurns = Object.create(null) as Record<string, number>;
      }
    }

    // Reset per-battle gimmick state so that a shared ruleset instance can be
    // safely reused across multiple battles without cross-battle state leakage.
    // Source: Showdown resets side.megaUsed / side.zMoveUsed at battle start.
    this.resetBattleGimmicks();
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
   * @returns A snapshot copy of the event log. Mutating the returned array does not
   * affect the engine's internal history.
   */
  getEventLog(): readonly BattleEvent[] {
    return [...this.eventLog];
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

    // Reset per-battle gimmick state so cached ruleset instances (e.g., via
    // GenerationRegistry) start each battle fresh. Gen 7 uses internal Set<0|1>
    // tracking for Z-Move and Mega Evolution — without this, usedBySide persists
    // across battles and incorrectly blocks gimmick use.
    // Source: Qodo review — gimmick state leaks across battles (PR #699)
    this.resetBattleGimmicks();

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
        const order = this.orderSwitchInAbilityEntries([
          { side: 0, pokemon: active0 },
          { side: 1, pokemon: active1 },
        ]);

        for (const entry of order) {
          const opponent = this.getOpponentActive(entry.side);
          if (opponent) {
            const result = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onSwitchIn, {
              pokemon: entry.pokemon,
              opponent,
              state: this.state,
              rng: this.state.rng,
              trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
            });
            this.processAbilityResult(result, entry.pokemon, opponent, entry.side);
          }
        }
      }
    }

    // Record initial participation — the lead pokemon on each side are facing each other
    // at battle start so they are considered participants immediately.
    this.recordParticipation();

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

    if (side !== action.side) {
      throw new Error(`Submitted side ${side} does not match action.side ${action.side}`);
    }

    if (
      action.type === "move" &&
      (action.targetSide !== undefined || action.targetSlot !== undefined)
    ) {
      throw new Error(
        "BattleEngine: move targetSide/targetSlot are not supported in singles battles",
      );
    }

    if (action.type === "move" && !Number.isInteger(action.moveIndex)) {
      throw new Error("MoveAction requires an integer moveIndex");
    }

    if (action.type === "move") {
      const activePokemon = this.getActiveMutable(side);

      if (!activePokemon) {
        throw new Error(`Side ${side} has no active Pokemon to execute MoveAction`);
      }

      if (action.moveIndex < 0 || action.moveIndex >= activePokemon.pokemon.moves.length) {
        throw new Error(`MoveAction moveIndex ${action.moveIndex} is out of range`);
      }
    }

    if (action.type === "switch") {
      const activePokemon = this.getActive(side);
      if (!activePokemon) {
        throw new Error(`Side ${side} has no active Pokemon to execute SwitchAction`);
      }

      // Voluntary switch requests must stay aligned with getAvailableSwitches().
      if (!this.getAvailableSwitches(side).includes(action.switchTo)) {
        throw new Error(`Invalid switch slot ${action.switchTo}`);
      }
    }

    if (action.type === "run" && (side !== 0 || action.side !== 0)) {
      throw new Error("RunAction is only valid for side 0");
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

    const sideState = this.state.sides[side];
    const candidate = sideState.team[teamSlot];
    if (!candidate) {
      throw new Error(`Invalid switch slot ${teamSlot}`);
    }

    const active = sideState.active[0];
    if (active?.teamSlot === teamSlot) {
      throw new Error(`Team slot ${teamSlot} is already active`);
    }

    if (candidate.currentHp <= 0) {
      throw new Error(`Team slot ${teamSlot} has fainted`);
    }

    this.pendingSwitches.set(side, teamSlot);

    // Process when all pending switches are submitted
    if (this.pendingSwitches.size === this.sidesNeedingSwitch.size) {
      for (const [switchSide, slot] of this.pendingSwitches) {
        this.resolvePendingSwitchPromptReplacement(switchSide, slot);
      }

      if (this.ruleset.hasAbilities()) {
        const entries: Array<{ side: 0 | 1; pokemon: ActivePokemon }> = [];
        for (const [switchSide] of this.pendingSwitches) {
          const active = this.state.sides[switchSide].active[0];
          if (active && active.pokemon.currentHp > 0) {
            entries.push({ side: switchSide, pokemon: active });
          }
        }
        const orderedEntries =
          entries.length === 2
            ? this.orderSwitchInAbilityEntries(
                entries as [
                  { side: 0 | 1; pokemon: ActivePokemon },
                  { side: 0 | 1; pokemon: ActivePokemon },
                ],
              )
            : entries;
        for (const entry of orderedEntries) {
          const opponent = this.getOpponentActive(entry.side);
          if (opponent) {
            const abilityResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onSwitchIn, {
              pokemon: entry.pokemon,
              opponent,
              state: this.state,
              rng: this.state.rng,
              trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
            });
            this.processAbilityResult(abilityResult, entry.pokemon, opponent, entry.side);
          }
        }
      }

      this.pendingSwitches.clear();
      this.sidesNeedingSwitch.clear();
      this.pendingSelfSwitches.clear();

      // Record the newly sent-out pokemon as participants against the current opponent
      this.recordParticipation();

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

    const actionBlockingVolatile = this.getSourceLinkedActionBlocker(active);
    if (actionBlockingVolatile) {
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
        return [
          {
            index,
            moveId: slot.moveId,
            displayName: moveData.displayName,
            type: moveData.type,
            category: moveData.category,
            pp: slot.currentPP,
            maxPp: slot.maxPP,
            disabled: true,
            disabledReason: "Can't move",
          },
        ];
      });
    }

    // If the Pokemon has a forced move (two-turn move second turn), only that move is available
    // Source: Showdown — during the execution turn of a two-turn move, only that move can be selected
    if (active.forcedMove) {
      const forcedSlot = active.pokemon.moves[active.forcedMove.moveIndex];
      if (forcedSlot) {
        return active.pokemon.moves.flatMap((slot, index) => {
          const isForcedMove = index === active.forcedMove?.moveIndex;
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
          return [
            {
              index,
              moveId: slot.moveId,
              displayName: moveData.displayName,
              type: moveData.type,
              category: moveData.category,
              pp: slot.currentPP,
              maxPp: slot.maxPP,
              disabled: !isForcedMove,
              disabledReason: isForcedMove ? undefined : "Locked into move",
            },
          ];
        });
      }
    }

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
        active.volatileStatuses.has(CORE_VOLATILE_IDS.disable) &&
        active.volatileStatuses.get(CORE_VOLATILE_IDS.disable)?.data?.moveId === slot.moveId
      ) {
        disabled = true;
        disabledReason = "Move is disabled";
      } else if (
        active.volatileStatuses.has(CORE_VOLATILE_IDS.taunt) &&
        moveData?.category === CORE_MOVE_CATEGORIES.status
      ) {
        // Taunt prevents status moves
        // Source: Bulbapedia — "Taunt prevents the target from using status moves"
        disabled = true;
        disabledReason = "Blocked by Taunt";
      } else if (
        this.ruleset.hasHeldItems() &&
        active.pokemon.heldItem === CORE_ITEM_IDS.assaultVest &&
        moveData?.category === CORE_MOVE_CATEGORIES.status &&
        active.ability !== CORE_ABILITY_IDS.klutz &&
        !active.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)
      ) {
        // Assault Vest prevents the holder from using status moves
        // Source: Showdown data/items.ts — Assault Vest: "The holder is unable to use status moves"
        // Source: Bulbapedia "Assault Vest" — "The holder cannot use status moves"
        // Klutz and Embargo suppress held-item effects including Assault Vest's restriction
        // Source: Showdown data/abilities.ts — Klutz: "This Pokemon's held item has no effect"
        // Source: Showdown data/moves.ts — Embargo: "Prevents the target from using held items"
        disabled = true;
        disabledReason = "Blocked by Assault Vest";
      } else if (active.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked)) {
        // Choice lock restricts to the locked move only
        // Source: Bulbapedia — Choice Band/Specs/Scarf lock the user into the first move used
        const choiceData = active.volatileStatuses.get(CORE_VOLATILE_IDS.choiceLocked)?.data;
        const lockedMoveId = choiceData?.moveId as string | undefined;
        if (lockedMoveId && slot.moveId !== lockedMoveId) {
          disabled = true;
          disabledReason = "Locked by Choice item";
        }
      } else if (this.state.gravity.active && moveData?.flags.gravity) {
        // Gravity blocks gravity-flagged moves (Fly, Bounce, Hi Jump Kick, etc.)
        // Source: Showdown Gen 4 mod — Gravity disables gravity-flagged moves
        // Source: Bulbapedia — "Gravity prevents the use of moves that involve the user going airborne"
        disabled = true;
        disabledReason = "Blocked by Gravity";
      } else if (active.volatileStatuses.has(CORE_VOLATILE_IDS.encore)) {
        // Encore forces the Pokemon to use its encored move.
        // Gen 2 stores moveIndex; Gen 4 stores moveId — support both.
        // Source: pret/pokecrystal engine/battle/core.asm HandleEncore
        // Source: Showdown Gen 4 mod — Encore restricts to the encored move only
        const encoreData = active.volatileStatuses.get(CORE_VOLATILE_IDS.encore)?.data;
        const encoreMoveId = encoreData?.moveId as string | undefined;
        const encoreMoveIndex = encoreData?.moveIndex as number | undefined;
        const lockedById = encoreMoveId !== undefined && slot.moveId !== encoreMoveId;
        const lockedByIndex = encoreMoveIndex !== undefined && index !== encoreMoveIndex;
        if (lockedById || lockedByIndex) {
          disabled = true;
          disabledReason = "Locked by Encore";
        }
      }

      return [
        {
          index,
          moveId: slot.moveId,
          displayName: moveData?.displayName ?? slot.moveId,
          type: moveData?.type ?? CORE_TYPE_IDS.normal,
          category: moveData?.category ?? CORE_MOVE_CATEGORIES.physical,
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
    if (active && active.pokemon.currentHp > 0 && !this.ruleset.canSwitch(active, this.state)) {
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

  /**
   * Get the live battle state object.
   *
   * The engine mutates this state in place during battle resolution. Consumers that
   * need an immutable snapshot should clone or serialize the returned value.
   */
  getState(): Readonly<BattleState> {
    return this.state;
  }

  /** Get the active pokemon for a side */
  getActive(side: 0 | 1): ActivePokemon | null {
    const active = this.getActiveMutable(side);
    return active ? structuredClone(active) : null;
  }

  /** Get the team for a side */
  getTeam(side: 0 | 1): readonly import("@pokemon-lib-ts/core").PokemonInstance[] {
    return structuredClone(this.state.sides[side].team);
  }

  private getActiveMutable(side: 0 | 1): ActivePokemon | null {
    return this.state.sides[side].active[0] ?? null;
  }

  /**
   * Returns the first source-linked volatile that should prevent the Pokemon
   * from acting. If the source is no longer active, the stale volatile is
   * cleared immediately and `null` is returned.
   */
  private getSourceLinkedActionBlocker(
    actor: ActivePokemon,
  ): { volatile: VolatileStatus; state: VolatileStatusState } | null {
    for (const [volatile, volatileState] of actor.volatileStatuses.entries()) {
      if (!volatileState.blocksAction) continue;

      const sourcePokemonUid = volatileState.sourcePokemonUid;
      if (sourcePokemonUid && !this.isPokemonActive(sourcePokemonUid)) {
        const side = this.getSideIndex(actor);
        actor.volatileStatuses.delete(volatile);
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile,
        });
        continue;
      }

      return { volatile, state: volatileState };
    }

    return null;
  }

  /**
   * Removes any source-linked volatiles created by the given source Pokemon.
   * Used when the source leaves the field so linked targets are released.
   */
  private clearSourceLinkedVolatiles(sourcePokemonUid: string): void {
    for (const side of this.state.sides) {
      for (const active of side.active) {
        if (!active) continue;

        for (const [volatile, volatileState] of [...active.volatileStatuses.entries()]) {
          if (volatileState.sourcePokemonUid !== sourcePokemonUid) continue;

          active.volatileStatuses.delete(volatile);
          this.emit({
            type: "volatile-end",
            side: side.index,
            pokemon: getPokemonName(active),
            volatile,
          });
        }
      }
    }
  }

  /** Returns `true` if the given Pokemon UID is still active on the field. */
  private isPokemonActive(pokemonUid: string): boolean {
    return this.state.sides.some((side) =>
      side.active.some((active) => active?.pokemon.uid === pokemonUid),
    );
  }

  // --- Serialization ---

  /** Serialize battle state for save/load or network transmission */
  serialize(): string {
    this.assertSerializablePhase();

    // participantTracker is an engine-private field (not in BattleState), so we must
    // include it separately. Convert Map<string, Set<string>> → plain object for JSON.
    // Source: bug fix — tracker was silently dropped on serialize/deserialize round-trips,
    // causing benched participants to lose EXP eligibility after a mid-battle load.
    const participantTrackerObj = Object.fromEntries(
      [...this.participantTracker.entries()].map(([k, v]) => [k, [...v]]),
    );

    return JSON.stringify(
      {
        state: this.state,
        participantTracker: participantTrackerObj,
        pendingActions: this.pendingActions,
        // Source: bug fix — getEventLog() promises the ordered log of all events
        // emitted since start(), so save/load must preserve the emitted history.
        eventLog: this.eventLog,
        pendingSwitches: this.pendingSwitches,
        sidesNeedingSwitch: this.sidesNeedingSwitch,
        pendingSelfSwitches: this.pendingSelfSwitches,
        gimmickState: this.serializeBattleGimmickState(),
      },
      (_key, value) => {
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
      },
    );
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
    }) as {
      state: BattleState;
      participantTracker?: Record<string, string[]>;
      pendingActions?: Map<0 | 1, BattleAction>;
      eventLog?: BattleEvent[];
      pendingSwitches?: unknown;
      sidesNeedingSwitch?: unknown;
      pendingSelfSwitches?: unknown;
      gimmickState?: SerializedBattleGimmickState;
    };

    BattleEngine.assertRulesetGenerationMatches(
      "BattleEngine.deserialize",
      parsed.state.generation,
      ruleset,
    );
    BattleEngine.assertDeserializablePhase(parsed.state.phase);
    BattleEngine.assertSinglesOnlyFormat("BattleEngine.deserialize", parsed.state.format);
    BattleEngine.relinkRestoredActivePokemon(parsed.state);

    const restoredSwitchPromptState = BattleEngine.restoreSwitchPromptState(
      parsed.state,
      parsed.pendingSwitches,
      parsed.sidesNeedingSwitch,
      parsed.pendingSelfSwitches,
    );

    // Create the engine instance without running the constructor.
    // This avoids: (1) stat recalculation, (2) HP reset to max,
    // (3) requiring DataManager to have species data loaded.
    const engine = Object.create(BattleEngine.prototype) as BattleEngine;

    // Reconstruct the participantTracker from the serialized plain object.
    // Source: bug fix — tracker was not serialized, causing benched participants to be
    // forgotten on load and receiving no EXP when the foe later faints.
    const restoredTracker = new Map<string, Set<string>>();
    for (const [uid, participants] of Object.entries(parsed.participantTracker ?? {})) {
      restoredTracker.set(uid, new Set(participants));
    }

    // Initialize all instance fields. Uses Object.defineProperties to set
    // private/readonly fields without requiring type casts to `any`.
    Object.defineProperties(engine, {
      state: { value: parsed.state, writable: false, enumerable: true, configurable: false },
      ruleset: { value: ruleset, writable: false, enumerable: false, configurable: false },
      dataManager: { value: dataManager, writable: false, enumerable: false, configurable: false },
      listeners: { value: new Set(), writable: true, enumerable: false, configurable: false },
      eventLog: {
        value: parsed.eventLog ?? [],
        writable: true,
        enumerable: false,
        configurable: false,
      },
      pendingActions: {
        value: parsed.pendingActions ?? new Map(),
        writable: true,
        enumerable: false,
        configurable: false,
      },
      pendingSwitches: {
        value: restoredSwitchPromptState.pendingSwitches,
        writable: true,
        enumerable: false,
        configurable: false,
      },
      sidesNeedingSwitch: {
        value: restoredSwitchPromptState.sidesNeedingSwitch,
        writable: true,
        enumerable: false,
        configurable: false,
      },
      pendingSelfSwitches: {
        value: restoredSwitchPromptState.pendingSelfSwitches,
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
      phasedSides: {
        value: new Set(),
        writable: true,
        enumerable: false,
        configurable: false,
      },
      participantTracker: {
        value: restoredTracker,
        writable: false,
        enumerable: false,
        configurable: false,
      },
      currentTurnActions: {
        value: [],
        writable: true,
        enumerable: false,
        configurable: false,
      },
    });

    engine.restoreBattleGimmickState(parsed.gimmickState);

    return engine;
  }

  private static assertDeserializablePhase(phase: BattlePhase): void {
    if (BattleEngine.STABLE_CHECKPOINT_PHASES.has(phase)) {
      return;
    }

    throw new Error(
      `BattleEngine.deserialize cannot restore phase ${phase}; save only from stable checkpoint phases`,
    );
  }

  private static relinkRestoredActivePokemon(state: BattleState): void {
    const expectedActiveSlotsPerSide = state.phase === "battle-start" ? 0 : 1;

    for (const side of state.sides) {
      if (!Array.isArray(side.active)) {
        throw new Error(
          `BattleEngine.deserialize: side ${side.index} has invalid active slots payload`,
        );
      }

      if (side.active.length !== expectedActiveSlotsPerSide) {
        throw new Error(
          `BattleEngine.deserialize: phase ${state.phase} requires ${expectedActiveSlotsPerSide} active slot(s) on side ${side.index}, got ${side.active.length}`,
        );
      }

      for (const active of side.active) {
        if (!active || typeof active !== "object") {
          throw new Error(
            `BattleEngine.deserialize: side ${side.index} has invalid active slot payload`,
          );
        }

        if (!Number.isInteger(active.teamSlot) || active.teamSlot < 0) {
          throw new Error(
            `BattleEngine.deserialize: active Pokemon has invalid teamSlot ${active.teamSlot} on side ${side.index}`,
          );
        }

        const teamPokemon = side.team[active.teamSlot];
        if (!teamPokemon) {
          throw new Error(
            `BattleEngine.deserialize: active Pokemon teamSlot ${active.teamSlot} is missing on side ${side.index}`,
          );
        }

        if (
          !active.pokemon ||
          typeof active.pokemon !== "object" ||
          typeof active.pokemon.uid !== "string"
        ) {
          throw new Error(
            `BattleEngine.deserialize: active Pokemon has invalid pokemon payload on side ${side.index}`,
          );
        }

        if (typeof teamPokemon.uid !== "string") {
          throw new Error(
            `BattleEngine.deserialize: team slot ${active.teamSlot} has invalid pokemon payload on side ${side.index}`,
          );
        }

        if (active.pokemon.uid !== teamPokemon.uid) {
          throw new Error(
            `BattleEngine.deserialize: active Pokemon uid "${active.pokemon.uid}" does not match team slot ${active.teamSlot} uid "${teamPokemon.uid}" on side ${side.index}`,
          );
        }

        active.pokemon = teamPokemon;
      }
    }
  }

  private assertSerializablePhase(): void {
    if (BattleEngine.STABLE_CHECKPOINT_PHASES.has(this.state.phase)) {
      return;
    }

    throw new Error(
      `BattleEngine.serialize cannot save during phase ${this.state.phase}; ` +
        `save only from stable checkpoint phases`,
    );
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
      team: team.map((pokemon) => clonePokemonInstance(pokemon)),
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

  private sendOut(
    side: BattleSide,
    teamSlot: number,
    skipAbility = false,
    batonPassState: BatonPassState | null = null,
  ): void {
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

    const active = createOnFieldPokemon(pokemon, teamSlot, types);
    this.applyBatonPassState(active, batonPassState);
    side.active[0] = active;

    this.emit({
      type: "switch-in",
      side: side.index,
      pokemon: createPokemonSnapshot(active),
      slot: 0,
    });

    // Apply entry hazards
    if (this.ruleset.getAvailableHazards().length > 0 && side.hazards.length > 0) {
      const hazardResult = this.ruleset.applyEntryHazards(active, side, this.state);
      if (hazardResult.damage > 0) {
        active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - hazardResult.damage);
        this.emit({
          type: "damage",
          side: side.index,
          pokemon: getPokemonName(active),
          amount: hazardResult.damage,
          currentHp: active.pokemon.currentHp,
          maxHp: active.pokemon.calculatedStats?.hp ?? 1,
          source: BATTLE_SOURCE_IDS.entryHazard,
        });
      }
      if (hazardResult.statusInflicted && !active.pokemon.status) {
        this.applyPrimaryStatus(active, hazardResult.statusInflicted, side.index);
      }
      // Source: Showdown data/moves.ts — stickyweb: this.boost({spe: -1}, pokemon)
      // Apply stat changes from hazards (e.g. Sticky Web −1 Speed)
      if (hazardResult.statChanges && hazardResult.statChanges.length > 0) {
        for (const change of hazardResult.statChanges) {
          const currentStage = active.statStages[change.stat] ?? 0;
          // Source: All generations — stat stages clamped to [-6, +6] (Bulbapedia: "Stat stages")
          const newStage = Math.max(-6, Math.min(6, currentStage + change.stages));
          active.statStages[change.stat] = newStage;
          this.emit({
            type: "stat-change",
            side: side.index,
            pokemon: getPokemonName(active),
            stat: change.stat,
            stages: change.stages,
            currentStage: newStage,
          });
        }
      }
      // Source: Bulbapedia — Poison-type absorbs Toxic Spikes on switch-in
      if (hazardResult.hazardsToRemove && hazardResult.hazardsToRemove.length > 0) {
        for (const hazardType of hazardResult.hazardsToRemove) {
          side.hazards = side.hazards.filter((h) => h.type !== hazardType);
          this.emit({
            type: "hazard-clear",
            side: side.index,
            hazard: hazardType,
          });
        }
      }
      for (const msg of hazardResult.messages) {
        this.emit({ type: "message", text: msg });
      }
    }

    // Delegate gen-specific switch-in hooks (e.g., Gen 5 sleep counter reset).
    // Called after hazards but before abilities, so the Pokemon's state is up-to-date.
    this.ruleset.onSwitchIn(active, this.state);

    // Apply on-switch-in abilities for the newly sent-out Pokemon
    // Source: pret/pokeemerald src/battle_util.c AbilityBattleEffects — switch-in abilities
    // must have their results processed
    // skipAbility is true during initial battle setup (start()) where abilities are
    // processed separately in speed order after both sides have sent out their leads.
    if (!skipAbility && this.ruleset.hasAbilities() && active.pokemon.currentHp > 0) {
      const opponent = this.getOpponentActive(side.index);
      if (opponent) {
        const abilityResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onSwitchIn, {
          pokemon: active,
          opponent,
          state: this.state,
          rng: this.state.rng,
          trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
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
    const submittedActions = actions.map((action) => ({ ...action })) as BattleAction[];
    this.pendingActions.clear();

    // Enforce recharge volatile: override submitted action for recharging Pokemon
    for (let side = 0 as 0 | 1; side <= 1; side = (side + 1) as 0 | 1) {
      const active = this.getActiveMutable(side);
      if (
        active &&
        active.pokemon.currentHp > 0 &&
        active.volatileStatuses.has(CORE_VOLATILE_IDS.recharge)
      ) {
        active.volatileStatuses.delete(CORE_VOLATILE_IDS.recharge);
        actions[side] = { type: "recharge", side };
      }
    }

    // Enforce forced move (two-turn moves): override submitted action
    // Source: Showdown — two-turn moves force the second-turn action
    for (let side = 0 as 0 | 1; side <= 1; side = (side + 1) as 0 | 1) {
      const active = this.getActiveMutable(side);
      if (active && active.pokemon.currentHp > 0 && active.forcedMove) {
        actions[side] = { type: "move", side, moveIndex: active.forcedMove.moveIndex };
        active.forcedMove = null;
      }
    }

    // Reset per-turn faint deduplication set so a new faint on a new turn is
    // correctly recorded (fixes #78 — duplicate faint events across checkMidTurnFaints calls).
    this.faintedPokemonThisTurn.clear();
    // Reset per-turn phazing tracking.
    this.phasedSides.clear();

    // Record which pokemon are facing each other at the start of this turn
    // before any switches happen. This captures lead-vs-lead participation.
    this.recordParticipation();

    // Record the event log position before any events are emitted this turn
    // so that turn history captures only current-turn events (fixes #84).
    const turnStartIndex = this.eventLog.length;

    // --- turn-start ---
    this.transitionTo("turn-start");
    this.state.turnNumber++;
    this.emit({ type: "turn-start", turnNumber: this.state.turnNumber });

    // --- turn-resolve ---
    this.transitionTo("turn-resolve");

    this.prepareGoFirstItemActivations(actions);

    // Sort actions by priority / speed / random
    const orderedActions = this.ruleset.resolveTurnOrder(actions, this.state, this.state.rng);
    // Store for use by executeMove (defenderSelectedMove for Sucker Punch)
    this.currentTurnActions = orderedActions;

    // --- PURSUIT PRE-CHECK (Gen 2-7) ---
    // If a Pokemon uses Pursuit and the opponent is switching, Pursuit fires first
    // with doubled base power, before the switch resolves.
    if (this.ruleset.shouldExecutePursuitPreSwitch()) {
      for (let i = 0; i < orderedActions.length; i++) {
        const action = orderedActions[i];
        if (!action || action.type !== "move") continue;
        const actor = this.getActiveMutable(action.side);
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
          this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);
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
      const actor = this.getActiveMutable(action.side);
      if (!actor || actor.pokemon.currentHp <= 0) continue;

      // Skip if this side's Pokemon was phased out (Roar/Whirlwind) earlier this turn.
      // The replacement should not execute the phased-out Pokemon's queued action.
      if (isMoveLikeAction(action) && this.phasedSides.has(action.side)) {
        continue;
      }

      switch (action.type) {
        case "move":
          this.executeMove(action, actor);
          break;
        case "switch":
          this.executeSwitch(action);
          break;
        case "item":
          this.executeItem(action);
          break;
        case "run":
          this.executeRun(action);
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
        this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);
        return;
      }

      // Phase 1 residuals: per-attack effects for the acting Pokemon
      // (Gen 2: poison/burn, leech seed, nightmare, curse per pokecrystal ResidualDamage)
      if (action.type === "move" || action.type === "struggle") {
        this.processPostAttackResiduals(action.side);
        if (this.state.ended) {
          this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);
          return;
        }
      }
    }

    // --- turn-end ---
    this.transitionTo("turn-end");
    this.processEndOfTurn();

    if (this.state.ended) {
      this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);
      return;
    }

    // --- faint-check ---
    this.transitionTo("faint-check");
    if (this.checkBattleEnd()) {
      this.transitionTo("battle-end");
      this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);
      return;
    }

    // If any pokemon need replacement, prompt for switch
    if (this.needsSwitchPrompt()) {
      this.transitionTo("switch-prompt");
      this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);
      return;
    }

    // Record turn history — slice from turnStartIndex to capture only events
    // emitted during this turn (fixes #84 — slice(-50) captured cross-turn events).
    this.recordTurnHistory(this.state.turnNumber, submittedActions, turnStartIndex);

    // Reset per-turn tracking for next turn
    for (const side of this.state.sides) {
      for (const active of side.active) {
        if (active) {
          active.movedThisTurn = false;
          // Reset per-turn damage tracking so Counter/Mirror Coat only reflect
          // damage taken during the current turn.
          active.lastDamageTaken = 0;
          active.lastDamageType = null;
          active.lastDamageCategory = null;
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
    let effectiveMoveData =
      powerMultiplier !== 1 && moveData.power !== null
        ? { ...moveData, power: moveData.power * powerMultiplier }
        : moveData;

    // Handle battle gimmick activation (Mega Evolution, Z-Move, Dynamax, Tera).
    // Gimmick fires before immobilization checks — even a paralyzed Pokemon mega evolves.
    // Source: Showdown sim/battle-actions.ts — gimmick activates at start of runMove
    // The type is passed so multi-gimmick gens (Gen 7: Mega + Z-Move) can distinguish
    // which gimmick was requested. See issue #586.
    //
    // activatedGimmick tracks whether activation actually succeeded (canUse passed and
    // activate ran). modifyMove is only called on the activated gimmick — if canUse()
    // returned false the gimmick did not activate and the move must not be transformed.
    let activatedGimmick: import("../context").BattleGimmick | null = null;
    if (action.mega || action.zMove || action.dynamax || action.terastallize) {
      const gimmickType = action.mega
        ? "mega"
        : action.zMove
          ? "zmove"
          : action.dynamax
            ? "dynamax"
            : "tera";
      const gimmick = this.ruleset.getBattleGimmick(gimmickType);
      const side = this.state.sides[action.side];
      if (gimmick && side && gimmick.canUse(actor, side, this.state)) {
        const gimmickEvents = gimmick.activate(actor, side, this.state);
        for (const event of gimmickEvents) {
          this.emit(event);
        }
        activatedGimmick = gimmick;
        // After mega evolution, trigger on-switch-in ability effects for the new mega ability.
        // Abilities like Drought, Intimidate, and Trace are entry-style abilities that should
        // fire whenever the Pokemon's ability changes to one that has a switch-in trigger.
        // Source: Showdown sim/battle-actions.ts — runMegaEvo calls pokemon.setAbility() which
        //   triggers ability on-start effects (equivalent to on-switch-in in our model).
        // Source: Bulbapedia "Mega Evolution" — "If the Mega Evolved Pokémon's Ability has
        //   an on-entry effect, it activates after Mega Evolution."
        if (this.ruleset.hasAbilities() && actor.pokemon.currentHp > 0 && actor.isMega) {
          const opponent = this.getOpponentActive(action.side);
          if (opponent) {
            const megaAbilityResult = this.ruleset.applyAbility(
              CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
              {
                pokemon: actor,
                opponent,
                state: this.state,
                rng: this.state.rng,
                trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
              },
            );
            this.processAbilityResult(megaAbilityResult, actor, opponent, action.side);
          }
        }
      }
    }

    // Allow the activated gimmick to transform the move (e.g., Z-Move power/type override,
    // Max Move conversion). This runs after gimmick.activate() so the gimmick state is set,
    // and before damage calc so the modified power/type is used in the damage formula.
    // modifyMove is only called when activation actually succeeded (activatedGimmick is set).
    // Source: Showdown sim/battle-actions.ts — Z-Move base power override happens in useMove
    if (activatedGimmick?.modifyMove) {
      effectiveMoveData = activatedGimmick.modifyMove(effectiveMoveData, actor);
    }

    // Pre-move checks: can the pokemon actually move?
    if (!this.canExecuteMove(actor, moveData)) return;

    // Deduct PP — cost may be 2 if defender has Pressure (getPPCost handles this)
    // PP deduction happens here, before accuracy check — PP is consumed on attempt, not on hit
    // Source: pret/pokeemerald — PP deducted when move is selected, before accuracy check
    // Pressure only applies to moves that target the opponent — self-targeting moves
    // (Swords Dance, Recover, etc.) and user-side moves (Reflect, etc.) are unaffected.
    // "foe-field" (Spikes, Stealth Rock) and "entire-field" (Gravity, Trick Room) also excluded.
    // Source: Showdown sim/battle.ts — Pressure check skips self-target/user-field/user-and-allies
    // Source: Bulbapedia — "Pressure causes any Pokémon targeting the ability-bearer [...] to use
    //   2 PP for their move instead of 1." Self-targeting moves don't target the ability-bearer.
    const defenderForPP =
      moveData.target === CORE_MOVE_TARGET_IDS.self ||
      moveData.target === CORE_MOVE_TARGET_IDS.userField ||
      moveData.target === CORE_MOVE_TARGET_IDS.userAndAllies ||
      moveData.target === CORE_MOVE_TARGET_IDS.foeField ||
      moveData.target === CORE_MOVE_TARGET_IDS.entireField
        ? null
        : this.getOpponentActive(action.side);
    const ppCost = this.ruleset.getPPCost(actor, defenderForPP, this.state);
    moveSlot.currentPP = Math.max(0, moveSlot.currentPP - ppCost);

    this.emit({
      type: "move-start",
      side: action.side,
      pokemon: getPokemonName(actor),
      move: moveData.id,
    });

    // Choice lock: applied BEFORE the accuracy check so that miss/protect/etc.
    // early returns still lock the user into the selected move.
    // Source: Showdown sim/battle-actions.ts — choicelock is set in onModifyMove
    //   which fires before the accuracy roll.
    // Fix for #538: previously applied only at the end of executeMove, after the
    //   accuracy check — misses bypassed the lock entirely.
    // Dynamax suppresses Choice lock — Dynamaxed Pokemon can use any Max Move
    // freely without being locked. The lock is deferred until Dynamax ends.
    // Source: Showdown data/conditions.ts -- dynamax: prevents choice lock during dynamax
    // Source: Bulbapedia "Dynamax" -- "Choice items do not lock the user into a single move"
    if (
      this.ruleset.hasHeldItems() &&
      !actor.isDynamaxed &&
      !actor.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked) &&
      actor.pokemon.heldItem &&
      (actor.pokemon.heldItem === CORE_ITEM_IDS.choiceBand ||
        actor.pokemon.heldItem === CORE_ITEM_IDS.choiceSpecs ||
        actor.pokemon.heldItem === CORE_ITEM_IDS.choiceScarf)
    ) {
      actor.volatileStatuses.set(CORE_VOLATILE_IDS.choiceLocked, {
        turnsLeft: -1,
        data: { moveId: moveData.id },
      });
    }

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

    // Remove semi-invulnerable volatile from attacker on the second (execution) turn
    // of a two-turn move. The volatile was applied during the charge turn; it must be
    // removed before damage calculation so the attacker is targetable again.
    // Source: Showdown — semi-invulnerable status cleared at move execution start
    const semiInvulnerableVolatiles: readonly SemiInvulnerableVolatile[] = [
      CORE_VOLATILE_IDS.flying,
      CORE_VOLATILE_IDS.underground,
      CORE_VOLATILE_IDS.underwater,
      CORE_VOLATILE_IDS.shadowForceCharging,
    ];
    const actorWasCharging =
      semiInvulnerableVolatiles.some((vol) => actor.volatileStatuses.has(vol)) ||
      actor.volatileStatuses.has(CORE_VOLATILE_IDS.charging);

    for (const vol of semiInvulnerableVolatiles) {
      if (actor.volatileStatuses.has(vol)) {
        actor.volatileStatuses.delete(vol);
        break; // A Pokemon can only have one semi-invulnerable volatile at a time
      }
    }
    // Also remove the non-semi-invulnerable charge volatile (SolarBeam, Skull Bash, etc.)
    if (actor.volatileStatuses.has(CORE_VOLATILE_IDS.charging)) {
      actor.volatileStatuses.delete(CORE_VOLATILE_IDS.charging);
    }

    // Find the target
    const defenderSide = action.side === 0 ? 1 : 0;
    const defender = this.getActiveMutable(defenderSide as 0 | 1);
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

    // Semi-invulnerable check: if the defender is in a semi-invulnerable state
    // (Fly, Dig, Dive, Shadow Force), most moves auto-miss unless the ruleset
    // says otherwise (e.g., Thunder can hit flying targets, Earthquake hits underground).
    // Source: Showdown sim/battle-actions.ts — semi-invulnerable immunity checks
    for (const vol of semiInvulnerableVolatiles) {
      if (defender.volatileStatuses.has(vol)) {
        if (!this.ruleset.canHitSemiInvulnerable(moveData.id, vol)) {
          this.emit({
            type: "move-miss",
            side: action.side,
            pokemon: getPokemonName(actor),
            move: moveData.id,
          });
          // Delegate miss-related effects to the ruleset (explosion self-faint, etc.)
          this.ruleset.onMoveMiss(actor, moveData, this.state);
          actor.lastMoveUsed = moveData.id;
          actor.movedThisTurn = true;
          return;
        }
        break; // Only one semi-invulnerable volatile at a time
      }
    }

    // Held item: before-move trigger (e.g., Metronome consecutive-use tracking)
    // Called before accuracy check so item-dependent state is available for damage calc.
    if (this.ruleset.hasHeldItems()) {
      const beforeMoveResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.beforeMove, {
        pokemon: actor,
        state: this.state,
        rng: this.state.rng,
        move: moveData,
      });
      if (beforeMoveResult.activated) {
        this.processItemResult(beforeMoveResult, actor, action.side);
      }
    }

    // Ability: on-before-move trigger (e.g., Truant — skip every other turn)
    // Source: Showdown sim/battle-actions.ts — beforeMove ability hook
    if (this.ruleset.hasAbilities()) {
      const beforeMoveAbilityResult = this.ruleset.applyAbility(
        CORE_ABILITY_TRIGGER_IDS.onBeforeMove,
        {
          pokemon: actor,
          opponent: defender,
          state: this.state,
          rng: this.state.rng,
          trigger: CORE_ABILITY_TRIGGER_IDS.onBeforeMove,
          move: effectiveMoveData,
        },
      );
      if (beforeMoveAbilityResult.activated) {
        this.processAbilityResult(beforeMoveAbilityResult, actor, defender, action.side);
        if (beforeMoveAbilityResult.movePrevented) {
          actor.lastMoveUsed = moveData.id;
          actor.movedThisTurn = true;
          return;
        }
      }
    }

    const defenderSelectedMove = this.getDefenderSelectedMove(defenderSide as 0 | 1);

    // Charge-turn handlers must run before accuracy and damage. On the setup turn
    // they can request a forced follow-up move, and on Power Herb turns they can
    // consume the item and skip the setup turn entirely.
    let handledChargeMove = false;
    let chargeMoveEffectResult: MoveEffectResult | null = null;
    if (effectiveMoveData.flags.charge && !actorWasCharging) {
      handledChargeMove = true;
      chargeMoveEffectResult = this.ruleset.executeMoveEffect({
        attacker: actor,
        defender,
        move: effectiveMoveData,
        damage: 0,
        state: this.state,
        rng: this.state.rng,
        defenderSelectedMove,
      });

      if (chargeMoveEffectResult.forcedMoveSet) {
        this.processEffectResult(
          chargeMoveEffectResult,
          actor,
          defender,
          action.side,
          defenderSide as 0 | 1,
        );
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }

      if (chargeMoveEffectResult.attackerItemConsumed) {
        this.processEffectResult(
          chargeMoveEffectResult,
          actor,
          defender,
          action.side,
          defenderSide as 0 | 1,
        );
        if (this.state.ended) {
          actor.lastMoveUsed = moveData.id;
          actor.movedThisTurn = true;
          return;
        }
        chargeMoveEffectResult = null;
      }
    } else if (effectiveMoveData.flags.charge) {
      // The attacker was already in its charge volatile, so this is the
      // follow-up attack turn. Skip the post-damage move-effect hook to avoid
      // re-triggering the charge setup after the volatile is cleared above.
      handledChargeMove = true;
    }

    // Accuracy check — use effectiveMoveData so gimmick-modified accuracy/flags are applied.
    // moveData.id is kept for event emission (original move slot identity).
    if (
      !this.ruleset.doesMoveHit({
        attacker: actor,
        defender,
        move: effectiveMoveData,
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

      // Delegate miss-related effects to the ruleset (explosion self-faint, Gen 1 rage-miss-lock)
      this.ruleset.onMoveMiss(actor, moveData, this.state);

      actor.lastMoveUsed = moveData.id;
      actor.movedThisTurn = true;
      return;
    }

    // Protect check: detect which protect-type volatile is active, then delegate to ruleset.
    // The ruleset decides whether the move bypasses — Gen 8 returns false for "max-guard"
    // (Max Guard blocks all moves including other Max Moves) and actor.isDynamaxed for "protect".
    // Gen 7 returns zMovePower > 0 for "protect". Other gens return false.
    // Source: Showdown sim/battle-actions.ts -- Z-Moves/Max Moves bypass Protect at 0.25x
    // Source: Showdown sim/battle-actions.ts -- Max Guard blocks all moves including Max Moves
    let hitThroughProtect = false;
    const activeProtectVolatile: "protect" | "max-guard" | null = defender.volatileStatuses.has(
      "max-guard",
    )
      ? "max-guard"
      : defender.volatileStatuses.has(CORE_VOLATILE_IDS.protect)
        ? CORE_VOLATILE_IDS.protect
        : null;
    if (activeProtectVolatile !== null && effectiveMoveData.flags.protect) {
      if (this.ruleset.canBypassProtect(effectiveMoveData, actor, activeProtectVolatile)) {
        hitThroughProtect = true;
        this.emit({
          type: "message",
          text: `${getPokemonName(defender)} protected itself!`,
        });
        this.emit({
          type: "message",
          text: `${getPokemonName(defender)} couldn't fully protect itself!`,
        });
      } else {
        this.emit({
          type: "message",
          text: `${getPokemonName(defender)} protected itself!`,
        });
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    }

    // Quick Guard check (Gen 5+): blocks moves with natural priority > 0 (except Feint)
    // Source: Showdown Gen 5 quickguard condition — blocks if dex.moves.get(id).priority > 0 && not feint
    if (defender.volatileStatuses.has("quick-guard") && moveData.flags.protect) {
      const naturalPriority: number = moveData.priority ?? 0;
      if (moveData.id !== "feint" && naturalPriority > 0) {
        this.emit({
          type: "message",
          text: `Quick Guard protected ${getPokemonName(defender)}!`,
        });
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    }

    // Wide Guard check (Gen 5+): blocks spread moves (all-adjacent, all-adjacent-foes).
    // Source: Showdown wideguard condition — blocks if move.target is allAdjacent or allAdjacentFoes
    if (defender.volatileStatuses.has("wide-guard") && moveData.flags.protect) {
      const moveTarget = moveData.target ?? "";
      if (moveTarget === "all-adjacent" || moveTarget === "all-adjacent-foes") {
        this.emit({
          type: "message",
          text: `Wide Guard protected ${getPokemonName(defender)}!`,
        });
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    }

    const preExecutionMoveFailure = this.ruleset.getPreExecutionMoveFailure?.(
      actor,
      defender,
      effectiveMoveData,
      this.state,
    );
    if (preExecutionMoveFailure) {
      for (const message of preExecutionMoveFailure.messages ?? []) {
        this.emit({ type: "message", text: message });
      }
      this.emit({
        type: "move-fail",
        side: action.side,
        pokemon: getPokemonName(actor),
        move: effectiveMoveData.id,
        reason: preExecutionMoveFailure.reason,
      });
      actor.lastMoveUsed = moveData.id;
      actor.movedThisTurn = true;
      return;
    }

    // Magic Bounce / shouldReflectMove check (Gen 5+)
    // If the defender's ability reflects the move, skip normal execution and
    // re-execute the move with attacker/defender swapped.
    // Source: Showdown data/abilities.ts -- magicbounce.onTryHit
    if (this.ruleset.shouldReflectMove) {
      const reflectResult = this.ruleset.shouldReflectMove(
        effectiveMoveData,
        actor,
        defender,
        this.state,
      );
      if (reflectResult) {
        for (const msg of reflectResult.messages) {
          this.emit({ type: "message", text: msg });
        }
        // Execute the reflected move: defender uses the move against the original attacker
        this.executeMoveById(
          effectiveMoveData.id,
          defender,
          defenderSide as 0 | 1,
          actor,
          action.side,
        );
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    }

    // Damage calculation (for damaging moves)
    let damage = 0;
    let brokeSubstitute = false;
    if (effectiveMoveData.category !== "status" && effectiveMoveData.power !== null) {
      const isCrit = this.ruleset.rollCritical({
        attacker: actor,
        move: effectiveMoveData,
        state: this.state,
        rng: this.state.rng,
        defender,
      });

      const damageRngState = this.state.rng.getState();
      let result = this.ruleset.calculateDamage({
        attacker: actor,
        defender,
        move: effectiveMoveData,
        state: this.state,
        rng: this.state.rng,
        isCrit,
        hitThroughProtect,
      });

      // Passive immunity ability (Water Absorb, Volt Absorb, Motor Drive, Flash Fire, Dry Skin, Levitate)
      // Source: Showdown sim/battle-actions.ts — ability immunities checked after damage calc returns 0
      if (this.ruleset.hasAbilities() && result.damage === 0 && result.effectiveness === 0) {
        const immunityResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.passiveImmunity, {
          pokemon: defender,
          opponent: actor,
          state: this.state,
          rng: this.state.rng,
          trigger: CORE_ABILITY_TRIGGER_IDS.passiveImmunity,
          move: effectiveMoveData,
        });
        if (immunityResult.activated) {
          this.processAbilityResult(immunityResult, defender, actor, defenderSide as 0 | 1);
          actor.lastMoveUsed = moveData.id;
          actor.movedThisTurn = true;
          return; // Move fully absorbed — skip damage, effects, items
        }
      }

      const preDamageResolution = this.resolvePreDamageMoveEffect({
        attacker: actor,
        defender,
        attackerSide: action.side,
        defenderSide: defenderSide as 0 | 1,
        move: effectiveMoveData,
        damageResult: result,
        damageRngState,
        isCrit,
        hitThroughProtect,
        defenderSelectedMove,
      });

      result = preDamageResolution.result;
      if (preDamageResolution.ended) {
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }

      damage = result.damage;

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
          brokeSubstitute = true;
          defender.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
          this.emit({
            type: "volatile-end",
            side: defenderSide as 0 | 1,
            pokemon: getPokemonName(defender),
            volatile: CORE_VOLATILE_IDS.substitute,
          });
        }
      } else {
        // Pre-damage interception: allows abilities (Disguise) and items (Focus Sash,
        // Sturdy) to modify damage before HP subtraction. Called for ALL damage (not
        // just lethal) so Disguise can absorb non-lethal hits.
        // Source: Showdown sim/battle-actions.ts — onDamage handlers run before HP reduction
        // Source: Showdown data/abilities.ts -- disguise: onDamage priority 1 (all hits)
        if (this.ruleset.capLethalDamage) {
          const survivalResult = this.ruleset.capLethalDamage(
            damage,
            defender,
            actor,
            effectiveMoveData,
            this.state,
          );
          damage = survivalResult.damage;
          for (const msg of survivalResult.messages) {
            this.emit({ type: "message", text: msg });
          }
          // If the survival was triggered by a consumable item (e.g., Focus Sash),
          // consume the item and emit an item-consumed event.
          // Source: Showdown data/items.ts — Focus Sash is consumed after activation
          if (survivalResult.consumedItem) {
            defender.pokemon.heldItem = null;
            this.emit({
              type: "item-consumed",
              side: defenderSide as 0 | 1,
              pokemon: getPokemonName(defender),
              item: survivalResult.consumedItem,
            });
          }
        }
        defender.pokemon.currentHp = Math.max(0, defender.pokemon.currentHp - damage);
        defender.lastDamageTaken = damage;
        defender.lastDamageType = result.effectiveType ?? effectiveMoveData.type;
        defender.lastDamageCategory = result.effectiveCategory ?? effectiveMoveData.category;
        this.emit({
          type: "damage",
          side: defenderSide as 0 | 1,
          pokemon: getPokemonName(defender),
          amount: damage,
          currentHp: defender.pokemon.currentHp,
          maxHp: defender.pokemon.calculatedStats?.hp ?? 1,
          source: effectiveMoveData.id,
        });
        // Reactive damage hook (Gen 1 Rage boost, Bide accumulation)
        // Source: pret/pokered RageEffect, BideEffect
        if (damage > 0) {
          this.ruleset.onDamageReceived(defender, damage, effectiveMoveData, this.state);
        }
      }

      // Held item: on-damage-taken trigger for defender
      // Source: Showdown sim/battle-actions.ts — onDamagingHit item hooks (Absorb Bulb, Cell Battery, etc.)
      if (this.ruleset.hasHeldItems() && damage > 0) {
        const defItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onDamageTaken, {
          pokemon: defender,
          state: this.state,
          rng: this.state.rng,
          damage,
          move: effectiveMoveData,
          opponent: actor, // attacker is the opponent from the defender's perspective
        });
        if (defItemResult.activated) {
          this.processItemResult(defItemResult, defender, actor, defenderSide as 0 | 1);
        }
      }

      // Held item: on-contact trigger for defender (Rocky Helmet, etc.)
      // Source: Showdown sim/battle-actions.ts — onDamagingHit contact item hooks
      if (
        this.ruleset.hasHeldItems() &&
        damage > 0 &&
        effectiveMoveData.flags.contact &&
        !hitSubstitute
      ) {
        if (defender.pokemon.currentHp > 0) {
          const contactItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onContact, {
            pokemon: defender,
            opponent: actor,
            state: this.state,
            rng: this.state.rng,
            damage,
            move: effectiveMoveData,
          });
          if (contactItemResult.activated) {
            this.processItemResult(contactItemResult, defender, actor, defenderSide as 0 | 1);
          }
        }
      }

      // Ability: on-damage-taken trigger (e.g., Color Change — type changes to match move type)
      // Source: Showdown sim/battle-actions.ts — onDamagingHit ability hook (fires after damage dealt)
      if (this.ruleset.hasAbilities() && damage > 0 && defender.pokemon.currentHp > 0) {
        const damageTakenAbilityResult = this.ruleset.applyAbility(
          CORE_ABILITY_TRIGGER_IDS.onDamageTaken,
          {
            pokemon: defender,
            opponent: actor,
            state: this.state,
            rng: this.state.rng,
            trigger: CORE_ABILITY_TRIGGER_IDS.onDamageTaken,
            move: effectiveMoveData,
            damage,
          },
        );
        if (damageTakenAbilityResult.activated) {
          this.processAbilityResult(
            damageTakenAbilityResult,
            defender,
            actor,
            defenderSide as 0 | 1,
          );
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
          const contactResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onContact, {
            pokemon: defender,
            opponent: actor,
            state: this.state,
            rng: this.state.rng,
            trigger: CORE_ABILITY_TRIGGER_IDS.onContact,
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
    const effectResult = handledChargeMove
      ? chargeMoveEffectResult
      : this.ruleset.executeMoveEffect({
          attacker: actor,
          defender,
          move: effectiveMoveData,
          damage,
          state: this.state,
          rng: this.state.rng,
          brokeSubstitute,
          defenderSelectedMove,
        });

    if (effectResult !== null) {
      this.processEffectResult(effectResult, actor, defender, action.side, defenderSide as 0 | 1);
      if (this.state.ended) {
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    }

    const resolvedEffectResult: MoveEffectResult = effectResult ?? {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };

    // Multi-hit move loop: repeat damage for additional hits beyond the first.
    // Source: pokered multi-hit moves — the engine repeats the damage step for each
    // additional hit. Only the first hit can be a critical hit (Gen 1 rule).
    // Source: pokered — all hits after the first use the same damage as the first hit.
    // The random factor and stat stage application are locked to the first calculation.
    // Ends early if the target faints or the substitute breaks.
    if (resolvedEffectResult.multiHitCount && resolvedEffectResult.multiHitCount > 0) {
      // Capture first hit damage; subsequent hits reuse this value (Gen 1 multi-hit rule)
      const firstHitDamage = damage;
      let totalHits = 1; // already dealt the first hit
      for (let i = 0; i < resolvedEffectResult.multiHitCount; i++) {
        // Stop if defender fainted
        if (defender.pokemon.currentHp <= 0 && defender.substituteHp <= 0) break;
        // Stop if substitute was broken (Gen 1: multi-hit ends when sub breaks)
        if (brokeSubstitute) break;

        // Per-hit accuracy check (Population Bomb: multiaccuracy: true).
        // When checkPerHitAccuracy is set, re-roll accuracy before each additional hit.
        // If the hit misses, the multi-hit loop stops immediately.
        // Source: Showdown data/moves.ts -- populationbomb: multiaccuracy: true
        if (resolvedEffectResult.checkPerHitAccuracy) {
          if (
            !this.ruleset.doesMoveHit({
              attacker: actor,
              defender,
              move: effectiveMoveData,
              state: this.state,
              rng: this.state.rng,
            })
          ) {
            this.emit({
              type: "move-miss",
              side: action.side,
              pokemon: getPokemonName(actor),
              move: effectiveMoveData.id,
            });
            break;
          }
        }

        // Process per-attack residuals (Gen 1: poison/burn/leech after each hit)
        // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed
        const postAttackResiduals = this.ruleset.getPostAttackResidualOrder();
        if (postAttackResiduals.length > 0) {
          this.processPostAttackResiduals(defenderSide as 0 | 1);
          if (defender.pokemon.currentHp <= 0 || actor.pokemon.currentHp <= 0) break;
          this.processPostAttackResiduals(action.side);
          if (defender.pokemon.currentHp <= 0 || actor.pokemon.currentHp <= 0) break;
        }

        // Use per-hit damage if provided (Triple Kick, Beat Up); otherwise reuse first hit.
        // Prefer perHitDamageFn (lazy, RNG consumed per-hit) over perHitDamage (eager).
        // Source: pret/pokecrystal TripleKickEffect/BeatUpEffect — damage computed in hit loop
        // Source: Bulbapedia — Triple Kick power escalates 10/20/30 per hit
        let hitDamage = resolvedEffectResult.perHitDamageFn
          ? resolvedEffectResult.perHitDamageFn(i)
          : resolvedEffectResult.perHitDamage && i < resolvedEffectResult.perHitDamage.length
            ? (resolvedEffectResult.perHitDamage[i] ?? firstHitDamage)
            : firstHitDamage;
        if (hitDamage <= 0) break;

        // Apply damage to substitute or Pokemon
        if (defender.substituteHp > 0 && !effectiveMoveData.flags.bypassSubstitute) {
          defender.substituteHp = Math.max(0, defender.substituteHp - hitDamage);
          this.emit({ type: "message", text: "The substitute took damage!" });
          if (defender.substituteHp === 0) {
            brokeSubstitute = true;
            defender.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
            this.emit({
              type: "volatile-end",
              side: defenderSide as 0 | 1,
              pokemon: getPokemonName(defender),
              volatile: CORE_VOLATILE_IDS.substitute,
            });
          }
        } else {
          // Pre-damage interception for multi-hit hits 2+. Called for ALL damage
          // (not just lethal) so Disguise can absorb non-lethal hits on later strikes.
          // Source: Showdown sim/battle-actions.ts — onDamage handlers run before
          //   each hit's HP subtraction, not just the first.
          // Fix for #539: previously only hit 1 called capLethalDamage.
          if (this.ruleset.capLethalDamage) {
            const survivalResult = this.ruleset.capLethalDamage(
              hitDamage,
              defender,
              actor,
              effectiveMoveData,
              this.state,
            );
            hitDamage = survivalResult.damage;
            for (const msg of survivalResult.messages) {
              this.emit({ type: "message", text: msg });
            }
            if (survivalResult.consumedItem) {
              defender.pokemon.heldItem = null;
              this.emit({
                type: "item-consumed",
                side: defenderSide as 0 | 1,
                pokemon: getPokemonName(defender),
                item: survivalResult.consumedItem,
              });
            }
          }
          defender.pokemon.currentHp = Math.max(0, defender.pokemon.currentHp - hitDamage);
          defender.lastDamageTaken = hitDamage;
          this.emit({
            type: "damage",
            side: defenderSide as 0 | 1,
            pokemon: getPokemonName(defender),
            amount: hitDamage,
            currentHp: defender.pokemon.currentHp,
            maxHp: defender.pokemon.calculatedStats?.hp ?? 1,
            source: effectiveMoveData.id,
          });
          if (hitDamage > 0) {
            this.ruleset.onDamageReceived(defender, hitDamage, effectiveMoveData, this.state);
          }
        }
        totalHits++;
      }
      this.emit({
        type: "message",
        text: `Hit ${totalHits} time${totalHits === 1 ? "" : "s"}!`,
      });

      // Process defender-side residuals after the final multi-hit strike.
      // Between hits, residuals run inside the loop (line ~1292). After the loop
      // exits, the Phase 1 post-attack call (line ~857) only processes the attacker's
      // side. Without this, poison/burn/leech-seed on the defender are skipped
      // after the final hit.
      // Source: pokered -- each hit triggers residuals for the hit target
      const finalPostAttackResiduals = this.ruleset.getPostAttackResidualOrder();
      if (finalPostAttackResiduals.length > 0) {
        this.processPostAttackResiduals(defenderSide as 0 | 1);
      }
    }

    // Recursive move execution (Mirror Move, Metronome)
    // Source: pret/pokered MirrorMoveEffect, MetronomeEffect
    if (resolvedEffectResult.recursiveMove) {
      this.executeMoveById(
        resolvedEffectResult.recursiveMove,
        actor,
        action.side,
        defender,
        defenderSide as 0 | 1,
      );
      if (this.state.ended) {
        actor.lastMoveUsed = moveData.id;
        actor.movedThisTurn = true;
        return;
      }
    }

    // Increment consecutiveProtects if protect was successfully used
    if (effectiveMoveData.effect?.type === "protect") {
      actor.consecutiveProtects++;
    }

    // Recharge: if the move requires recharge and noRecharge was not set, mark the attacker
    if (effectiveMoveData.flags.recharge && !resolvedEffectResult.noRecharge) {
      actor.volatileStatuses.set(CORE_VOLATILE_IDS.recharge, { turnsLeft: 1 });
    }

    // Held item: on-hit trigger for attacker
    // Pass `damage` so item handlers (Life Orb recoil, Shell Bell heal) can gate on actual damage dealt.
    // Source: ItemContext.damage?: number in packages/battle/src/context/types.ts
    if (this.ruleset.hasHeldItems() && damage > 0) {
      const atkItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onHit, {
        pokemon: actor,
        state: this.state,
        rng: this.state.rng,
        move: effectiveMoveData,
        opponent: defender, // defender is the opponent from the attacker's perspective
        damage, // damage dealt this hit — required by Life Orb / Shell Bell handlers
      });
      if (atkItemResult.activated) {
        this.processItemResult(atkItemResult, actor, defender, action.side);
      }
    }

    actor.lastMoveUsed = moveData.id;
    actor.movedThisTurn = true;

    // KO-based ability triggers: Moxie, Beast Boost, Battle Bond.
    // Fires AFTER the full move resolves (damage + effects) if the defender fainted.
    // Source: Showdown sim/battle-actions.ts — onSourceAfterFaint
    // Source: Showdown data/abilities.ts -- moxie.onSourceAfterFaint, beastboost.onSourceAfterFaint
    if (this.ruleset.hasAbilities() && defender.pokemon.currentHp <= 0) {
      const afterMoveResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onAfterMoveUsed, {
        pokemon: actor,
        opponent: defender,
        state: this.state,
        rng: this.state.rng,
        trigger: CORE_ABILITY_TRIGGER_IDS.onAfterMoveUsed,
        move: effectiveMoveData,
      });
      if (afterMoveResult.activated) {
        this.processAbilityResult(afterMoveResult, actor, defender, action.side);
      }
    }
  }

  private shouldRunPreDamageMoveEffect(result: DamageResult): boolean {
    return result.damage > 0 && result.effectiveness !== 0;
  }

  private createReplayRng(state: number): SeededRandom {
    const replayRng = new SeededRandom(0);
    replayRng.setState(state);
    return replayRng;
  }

  private resolvePreDamageMoveEffect(params: PreDamageResolutionParams): {
    readonly result: DamageResult;
    readonly ended: boolean;
  } {
    if (!this.shouldRunPreDamageMoveEffect(params.damageResult)) {
      return { result: params.damageResult, ended: false };
    }

    const preDamageEffectResult =
      this.ruleset.executePreDamageMoveEffect?.({
        attacker: params.attacker,
        defender: params.defender,
        move: params.move,
        damage: params.damageResult.damage,
        state: this.state,
        rng: this.state.rng,
        defenderSelectedMove: params.defenderSelectedMove,
      }) ?? null;

    if (preDamageEffectResult === null) {
      return { result: params.damageResult, ended: false };
    }

    this.processEffectResult(
      preDamageEffectResult,
      params.attacker,
      params.defender,
      params.attackerSide,
      params.defenderSide,
    );
    if (this.state.ended) {
      return { result: params.damageResult, ended: true };
    }

    const replayRng = this.createReplayRng(params.damageRngState);
    return {
      result: this.ruleset.calculateDamage({
        attacker: params.attacker,
        defender: params.defender,
        move: params.move,
        state: this.state,
        rng: replayRng,
        isCrit: params.isCrit,
        hitThroughProtect: params.hitThroughProtect,
      }),
      ended: false,
    };
  }

  /**
   * Execute a move identified by its move ID rather than a move slot index.
   * Used for recursive moves (Mirror Move, Metronome) that call a move not in
   * the actor's moveset. No PP is deducted; no Choice lock is applied.
   * Source: pret/pokered MirrorMoveEffect, MetronomeEffect
   */
  private executeMoveById(
    moveId: string,
    actor: ActivePokemon,
    actorSide: 0 | 1,
    defender: ActivePokemon,
    defenderSide: 0 | 1,
  ): void {
    let moveData: MoveData;
    try {
      moveData = this.dataManager.getMove(moveId);
    } catch {
      this.emit({
        type: "engine-warning",
        message: `Recursive move "${moveId}" data missing.`,
      });
      return;
    }

    this.emit({
      type: "move-start",
      side: actorSide,
      pokemon: getPokemonName(actor),
      move: moveId,
    });

    // Accuracy check
    if (moveData.accuracy !== null) {
      const hits = this.ruleset.doesMoveHit({
        attacker: actor,
        defender,
        move: moveData,
        state: this.state,
        rng: this.state.rng,
      });
      if (!hits) {
        this.emit({
          type: "move-miss",
          side: actorSide,
          pokemon: getPokemonName(actor),
          move: moveId,
        });
        // Delegate miss-related effects to the ruleset (explosion self-faint, etc.)
        this.ruleset.onMoveMiss(actor, moveData, this.state);
        return;
      }
    }

    // Damage calculation (for damaging moves)
    let damage = 0;
    let brokeSubstitute = false;
    const defenderSelectedMove = this.getDefenderSelectedMove(defenderSide);
    if (moveData.category !== "status" && moveData.power !== null) {
      const isCrit = this.ruleset.rollCritical({
        attacker: actor,
        move: moveData,
        state: this.state,
        rng: this.state.rng,
        defender,
      });
      const damageRngState = this.state.rng.getState();
      let result = this.ruleset.calculateDamage({
        attacker: actor,
        defender,
        move: moveData,
        state: this.state,
        rng: this.state.rng,
        isCrit,
      });
      damage = result.damage;

      // Passive immunity ability (Water Absorb, Volt Absorb, Motor Drive, Flash Fire, Dry Skin, Levitate)
      // Source: Showdown sim/battle-actions.ts — ability immunities checked after damage calc returns 0
      if (this.ruleset.hasAbilities() && result.damage === 0 && result.effectiveness === 0) {
        const immunityResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.passiveImmunity, {
          pokemon: defender,
          opponent: actor,
          state: this.state,
          rng: this.state.rng,
          trigger: CORE_ABILITY_TRIGGER_IDS.passiveImmunity,
          move: moveData,
        });
        if (immunityResult.activated) {
          this.processAbilityResult(immunityResult, defender, actor, defenderSide);
          actor.lastMoveUsed = moveId;
          actor.movedThisTurn = true;
          return; // Move fully absorbed — skip damage, effects, items
        }
      }

      const preDamageResolution = this.resolvePreDamageMoveEffect({
        attacker: actor,
        defender,
        attackerSide: actorSide,
        defenderSide,
        move: moveData,
        damageResult: result,
        damageRngState,
        isCrit,
        defenderSelectedMove,
      });

      result = preDamageResolution.result;
      if (preDamageResolution.ended) {
        actor.lastMoveUsed = moveId;
        actor.movedThisTurn = true;
        return;
      }

      damage = result.damage;

      if (result.effectiveness !== 1) {
        this.emit({ type: "effectiveness", multiplier: result.effectiveness });
      }
      if (result.isCrit) {
        this.emit({ type: "critical-hit" });
      }

      // Apply damage to substitute or pokemon
      let hitSubstitute = false;
      if (defender.substituteHp > 0 && !moveData.flags.bypassSubstitute) {
        hitSubstitute = true;
        defender.substituteHp = Math.max(0, defender.substituteHp - damage);
        this.emit({ type: "message", text: "The substitute took damage!" });
        if (defender.substituteHp === 0) {
          brokeSubstitute = true;
          defender.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
          this.emit({
            type: "volatile-end",
            side: defenderSide,
            pokemon: getPokemonName(defender),
            volatile: CORE_VOLATILE_IDS.substitute,
          });
        }
      } else {
        // Pre-damage interception: allows abilities (Disguise, Sturdy) and items
        // (Focus Sash) to modify damage before HP subtraction. Called for ALL damage.
        // Source: Showdown sim/battle-actions.ts — onDamage handlers run before HP reduction
        // Fix for #531: executeMoveById previously bypassed this check.
        if (this.ruleset.capLethalDamage) {
          const survivalResult = this.ruleset.capLethalDamage(
            damage,
            defender,
            actor,
            moveData,
            this.state,
          );
          damage = survivalResult.damage;
          for (const msg of survivalResult.messages) {
            this.emit({ type: "message", text: msg });
          }
          if (survivalResult.consumedItem) {
            defender.pokemon.heldItem = null;
            this.emit({
              type: "item-consumed",
              side: defenderSide,
              pokemon: getPokemonName(defender),
              item: survivalResult.consumedItem,
            });
          }
        }
        defender.pokemon.currentHp = Math.max(0, defender.pokemon.currentHp - damage);
        defender.lastDamageTaken = damage;
        defender.lastDamageType = moveData.type;
        defender.lastDamageCategory = moveData.category;
        this.emit({
          type: "damage",
          side: defenderSide,
          pokemon: getPokemonName(defender),
          amount: damage,
          currentHp: defender.pokemon.currentHp,
          maxHp: defender.pokemon.calculatedStats?.hp ?? 1,
          source: moveId,
        });
        if (damage > 0) {
          this.ruleset.onDamageReceived(defender, damage, moveData, this.state);
        }

        // Held item: on-damage-taken trigger for defender
        // Source: Showdown sim/battle-actions.ts — onDamagingHit item hooks (Absorb Bulb, Cell Battery, etc.)
        if (this.ruleset.hasHeldItems() && damage > 0) {
          const defItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onDamageTaken, {
            pokemon: defender,
            state: this.state,
            rng: this.state.rng,
            damage,
            move: moveData,
            opponent: actor, // attacker is the opponent from the defender's perspective
          });
          if (defItemResult.activated) {
            this.processItemResult(defItemResult, defender, actor, defenderSide);
          }
        }

        // Held item: on-contact trigger for defender (Rocky Helmet, etc.)
        // Source: Showdown sim/battle-actions.ts — onDamagingHit contact item hooks
        if (this.ruleset.hasHeldItems() && damage > 0 && moveData.flags.contact && !hitSubstitute) {
          if (defender.pokemon.currentHp > 0) {
            const contactItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onContact, {
              pokemon: defender,
              opponent: actor,
              state: this.state,
              rng: this.state.rng,
              damage,
              move: moveData,
            });
            if (contactItemResult.activated) {
              this.processItemResult(contactItemResult, defender, actor, defenderSide);
            }
          }
        }

        // Ability: on-damage-taken trigger (e.g., Color Change — type changes to match move type)
        // Source: Showdown sim/battle-actions.ts — onDamagingHit ability hook (fires after damage dealt)
        if (this.ruleset.hasAbilities() && damage > 0 && defender.pokemon.currentHp > 0) {
          const damageTakenAbilityResult = this.ruleset.applyAbility(
            CORE_ABILITY_TRIGGER_IDS.onDamageTaken,
            {
              pokemon: defender,
              opponent: actor,
              state: this.state,
              rng: this.state.rng,
              trigger: CORE_ABILITY_TRIGGER_IDS.onDamageTaken,
              move: moveData,
              damage,
            },
          );
          if (damageTakenAbilityResult.activated) {
            this.processAbilityResult(damageTakenAbilityResult, defender, actor, defenderSide);
          }
        }

        // Contact ability trigger (Static, Flame Body, Poison Point, Rough Skin, etc.)
        // Source: Showdown sim/battle-actions.ts — contact abilities checked after damage
        if (this.ruleset.hasAbilities() && damage > 0 && moveData.flags.contact && !hitSubstitute) {
          if (defender.pokemon.currentHp > 0) {
            const contactResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onContact, {
              pokemon: defender,
              opponent: actor,
              state: this.state,
              rng: this.state.rng,
              trigger: CORE_ABILITY_TRIGGER_IDS.onContact,
              move: moveData,
              damage,
            });
            if (contactResult.activated) {
              this.processAbilityResult(contactResult, defender, actor, defenderSide);
            }
          }
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
      brokeSubstitute,
      defenderSelectedMove,
    });

    this.processEffectResult(effectResult, actor, defender, actorSide, defenderSide);
    if (this.state.ended) {
      return;
    }

    // Chain nested recursiveMove (e.g., Metronome -> Mirror Move)
    // Source: pret/pokered — MetronomeEffect can call MirrorMoveEffect which then copies the foe's last move
    // Depth guard: only recurse once to prevent infinite chains (Metronome -> Metronome is excluded from the pool but defensive check)
    if (effectResult.recursiveMove) {
      this.executeMoveById(effectResult.recursiveMove, actor, actorSide, defender, defenderSide);
    }

    // Held item: on-hit trigger for attacker
    // Recursive move execution should preserve the same attacker item hook parity as executeMove().
    if (this.ruleset.hasHeldItems() && damage > 0) {
      const atkItemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.onHit, {
        pokemon: actor,
        opponent: defender,
        state: this.state,
        rng: this.state.rng,
        damage,
        move: moveData,
      });
      if (atkItemResult.activated) {
        this.processItemResult(atkItemResult, actor, defender, actorSide);
      }
    }

    actor.lastMoveUsed = moveId;

    // Recharge: if the recursively-called move requires recharge and noRecharge was not set
    if (moveData.flags.recharge && !effectResult.noRecharge) {
      actor.volatileStatuses.set(CORE_VOLATILE_IDS.recharge, { turnsLeft: 1 });
    }
  }

  private executeSwitch(action: import("../events").SwitchAction): void {
    const side = this.state.sides[action.side];
    const outgoing = side.active[0];

    if (outgoing) {
      // Let the ruleset handle any gen-specific switch-out cleanup first
      this.ruleset.onSwitchOut(outgoing, this.state);
      this.clearSourceLinkedVolatiles(outgoing.pokemon.uid);

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

    // Record participation for the newly sent-out pokemon against the current opponent
    this.recordParticipation();
  }
  private getRandomForcedSwitchSlot(side: BattleSide): number | null {
    const activeTeamSlot = side.active[0]?.teamSlot ?? -1;
    const validTargets = side.team
      .map((pokemon, teamSlot) => ({ pokemon, teamSlot }))
      .filter(({ pokemon, teamSlot }) => pokemon.currentHp > 0 && teamSlot !== activeTeamSlot);

    if (validTargets.length === 0) {
      return null;
    }

    const randomIndex = this.state.rng.int(0, validTargets.length - 1);
    return validTargets[randomIndex]?.teamSlot ?? null;
  }

  private performImmediateForcedSwitch(
    sideIndex: 0 | 1,
    options?: {
      readonly markSideAsPhased?: boolean;
      readonly message?: string;
    },
  ): boolean {
    const side = this.state.sides[sideIndex];
    const targetTeamSlot = this.getRandomForcedSwitchSlot(side);
    if (targetTeamSlot === null) {
      return false;
    }

    const outgoing = side.active[0];
    if (outgoing) {
      this.ruleset.onSwitchOut(outgoing, this.state);
      this.clearSourceLinkedVolatiles(outgoing.pokemon.uid);
      this.emit({
        type: "switch-out",
        side: sideIndex,
        pokemon: createPokemonSnapshot(outgoing),
      });
      outgoing.statStages = createDefaultStatStages();
      outgoing.consecutiveProtects = 0;
      outgoing.turnsOnField = 0;
      outgoing.movedThisTurn = false;
      outgoing.lastMoveUsed = null;
      outgoing.lastDamageTaken = 0;
      outgoing.lastDamageType = null;
      outgoing.lastDamageCategory = null;
    }

    this.sendOut(side, targetTeamSlot);
    this.recordParticipation();

    if (options?.markSideAsPhased ?? true) {
      this.phasedSides.add(sideIndex);
    }

    if (options?.message) {
      this.emit({ type: "message", text: options.message });
    }

    return true;
  }

  private captureBatonPassState(attacker: ActivePokemon): BatonPassState {
    return {
      statStages: structuredClone(attacker.statStages),
      substituteHp: attacker.substituteHp,
      volatileStatuses: structuredClone(attacker.volatileStatuses),
    };
  }

  private applyBatonPassState(active: ActivePokemon, batonPassState: BatonPassState | null): void {
    if (!batonPassState) {
      return;
    }

    active.statStages = structuredClone(batonPassState.statStages);
    active.substituteHp = batonPassState.substituteHp;
    active.volatileStatuses = structuredClone(batonPassState.volatileStatuses);
  }

  private resolvePendingSwitchPromptReplacement(side: 0 | 1, slot: number): void {
    const sideState = this.state.sides[side];
    const pendingSelfSwitch = this.pendingSelfSwitches.get(side);
    const outgoing = sideState.active[0];
    const isLiveVoluntarySelfSwitch =
      pendingSelfSwitch && outgoing && outgoing.pokemon.currentHp > 0;
    let batonPassState: BatonPassState | null = null;

    if (isLiveVoluntarySelfSwitch) {
      this.ruleset.onSwitchOut(outgoing, this.state);
      this.emit({
        type: "switch-out",
        side,
        pokemon: createPokemonSnapshot(outgoing),
      });
      batonPassState = pendingSelfSwitch.batonPass ? this.captureBatonPassState(outgoing) : null;
      outgoing.statStages = createDefaultStatStages();
      outgoing.consecutiveProtects = 0;
      outgoing.turnsOnField = 0;
      outgoing.movedThisTurn = false;
      outgoing.lastMoveUsed = null;
      outgoing.lastDamageTaken = 0;
      outgoing.lastDamageType = null;
      outgoing.lastDamageCategory = null;
    }

    this.sendOut(sideState, slot, true, batonPassState);
  }

  /**
   * Execute a bag item action (Potion, Antidote, X Attack, Revive, etc.).
   *
   * The engine delegates item effect calculation to the ruleset via `applyBagItem()`,
   * then applies the result to the battle state and emits appropriate events.
   *
   * Items always target a Pokemon on the user's own side. The `target` field on
   * ItemAction indicates the team slot index (defaults to 0 = active Pokemon).
   */
  private executeItem(action: ItemAction): void {
    if (!this.ruleset.canUseBagItems()) {
      this.emit({ type: "message", text: "Items cannot be used here!" });
      return;
    }

    // Check if this is a Poke Ball (catch-type item) — fork to catch attempt logic
    let itemData: ItemData | null = null;
    try {
      itemData = this.dataManager.getItem(action.itemId);
    } catch {
      this.emit({
        type: "engine-warning",
        message: `Item "${action.itemId}" not found in data manager; falling back to bag-item handling.`,
      });
    }
    if (itemData?.useEffect?.type === "catch") {
      this.executeCatchAttempt(action, itemData);
      return;
    }

    const side = this.state.sides[action.side];
    // Determine target pokemon — default to active slot 0
    const targetSlot = action.target ?? 0;

    // Resolve the target ActivePokemon. For active Pokemon, use the active slot directly.
    // For bench Pokemon (e.g., Revive on a fainted team member), create a temporary wrapper.
    const target = this.resolveItemTarget(side, targetSlot);
    if (!target) {
      this.emit({ type: "message", text: "Invalid target for item." });
      return;
    }

    this.emit({
      type: "message",
      text: `Side ${action.side} used ${action.itemId}!`,
    });

    const result = this.ruleset.applyBagItem(action.itemId, target, this.state);

    // If the item had no effect, emit messages and return
    if (!result.activated) {
      for (const msg of result.messages) {
        this.emit({ type: "message", text: msg });
      }
      return;
    }

    // Apply heal
    if (result.healAmount !== undefined && result.healAmount > 0) {
      const maxHp = target.pokemon.calculatedStats?.hp ?? target.pokemon.currentHp;
      if (result.revived) {
        // Revive: set HP directly (pokemon was at 0)
        target.pokemon.currentHp = result.healAmount;
      } else {
        target.pokemon.currentHp = Math.min(maxHp, target.pokemon.currentHp + result.healAmount);
      }
      this.emit({
        type: "heal",
        side: action.side,
        pokemon: getPokemonName(target),
        amount: result.healAmount,
        currentHp: target.pokemon.currentHp,
        maxHp,
        source: action.itemId,
      });
    }

    // Apply status cure
    if (result.statusCured) {
      target.pokemon.status = null;
      this.emit({
        type: "status-cure",
        side: action.side,
        pokemon: getPokemonName(target),
        status: result.statusCured,
      });
    }

    // Apply stat change
    if (result.statChange) {
      const { stat, stages } = result.statChange;
      const current = target.statStages[stat] ?? 0;
      // Source: All generations — stat stages are universally clamped to [-6, +6] range
      // (Bulbapedia: "Stat stages" — the range [-6, +6] is consistent across all mainline games)
      const newStage = Math.max(-6, Math.min(6, current + stages));
      target.statStages[stat] = newStage;
      this.emit({
        type: "stat-change",
        side: action.side,
        pokemon: getPokemonName(target),
        stat,
        stages,
        currentStage: newStage,
      });
    }

    // Emit result messages
    for (const msg of result.messages) {
      this.emit({ type: "message", text: msg });
    }
  }

  /**
   * Resolve the target ActivePokemon for an item action.
   * Returns the active slot if targeting the current active Pokemon,
   * or creates a temporary ActivePokemon wrapper for bench targets (e.g., Revive).
   */
  private resolveItemTarget(side: BattleSide, targetSlot: number): ActivePokemon | null {
    // Check if targeting the active Pokemon
    const active = side.active[0];
    if (active && active.teamSlot === targetSlot) {
      return active;
    }

    // Otherwise, target a bench Pokemon (e.g., Revive on a fainted team member)
    const benchPokemon = side.team[targetSlot];
    if (!benchPokemon) {
      return null;
    }

    // Create a minimal ActivePokemon wrapper so the ruleset can inspect it
    return {
      pokemon: benchPokemon,
      teamSlot: targetSlot,
      statStages: createDefaultStatStages(),
      volatileStatuses: new Map(),
      types: [],
      ability: benchPokemon.ability,
      suppressedAbility: null,
      itemKnockedOff: false,
      lastMoveUsed: null,
      lastDamageTaken: 0,
      lastDamageType: null,
      lastDamageCategory: null,
      turnsOnField: 0,
      movedThisTurn: false,
      consecutiveProtects: 0,
      substituteHp: 0,
      transformed: false,
      transformedSpecies: null,
      isMega: false,
      isDynamaxed: false,
      dynamaxTurnsLeft: 0,
      teraType: null,
      isTerastallized: false,
      stellarBoostedTypes: [],
      forcedMove: null,
    };
  }

  /**
   * Execute a catch attempt (Poke Ball thrown at a wild Pokemon).
   * Only valid in wild battles, only side 0 can throw.
   *
   * Source: Bulbapedia -- Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
   * Source: pret/pokeemerald src/battle_script_commands.c Cmd_handleballthrow
   */
  private executeCatchAttempt(action: ItemAction, itemData: ItemData): void {
    // Only valid in wild battles
    if (!this.state.isWildBattle) {
      this.emit({ type: "message", text: "You can't throw a Poke Ball at a trainer's Pokemon!" });
      return;
    }

    // Only side 0 (player) can throw balls
    if (action.side !== 0) {
      return;
    }

    const wildActive = this.state.sides[1].active[0];
    if (!wildActive) return;

    // Extract ball modifier from item data
    // Guard: catchRateModifier may be absent on a ball item with a missing field — default to 1
    const useEffect = itemData.useEffect;
    const ballModifier = useEffect?.type === "catch" ? (useEffect.catchRateModifier ?? 1) : 1;

    // Get wild Pokemon's species catch rate.
    // Abort the catch attempt with an engine message if species data is unavailable —
    // silently substituting a default (45) would distort capture odds for the player.
    let baseCatchRate: number;
    try {
      const species = this.dataManager.getSpecies(wildActive.pokemon.speciesId);
      baseCatchRate = species.catchRate;
    } catch {
      this.emit({
        type: "message",
        text: "The Poke Ball missed! (species data unavailable)",
      });
      return;
    }

    // maxHp must come from calculatedStats, not currentHp — using currentHp when the Pokemon
    // has taken damage would make it appear at full health (HP ratio = 1.0), incorrectly
    // lowering the catch rate bonus for damaged Pokemon.
    // Abort if calculatedStats is absent (e.g., after deserialize without species data).
    const maxHp = wildActive.pokemon.calculatedStats?.hp;
    if (maxHp === undefined) {
      this.emit({
        type: "message",
        text: "The Poke Ball missed! (stat data unavailable)",
      });
      return;
    }

    // Delegate to ruleset for the actual roll
    const result = this.ruleset.rollCatchAttempt(
      baseCatchRate,
      maxHp,
      wildActive.pokemon.currentHp,
      wildActive.pokemon.status,
      ballModifier,
      this.state.rng,
    );

    // Emit catch attempt event
    this.emit({
      type: "catch-attempt",
      ball: action.itemId,
      pokemon: getPokemonName(wildActive),
      shakes: result.shakes,
      caught: result.caught,
    });

    if (result.caught) {
      this.emit({ type: "message", text: `${getPokemonName(wildActive)} was caught!` });
      // Synchronize state before emitting battle-end so getWinner() and getPhase() are
      // consistent for synchronous listeners — mirrors the checkBattleEnd() pattern.
      this.state.ended = true;
      this.state.winner = 0;
      this.transitionTo("battle-end");
      // Side 0 (player) wins by catching
      this.emit({ type: "battle-end", winner: 0 });
    } else {
      const shakeMessages = [
        "Oh no! The Pokemon broke free!",
        "Aww! It appeared to be caught!",
        "Aargh! Almost had it!",
        "Gah! It was so close, too!",
      ];
      this.emit({
        type: "message",
        text: shakeMessages[result.shakes] ?? "The Pokemon broke free!",
      });
    }
  }

  private executeStruggle(action: import("../events").StruggleAction, actor: ActivePokemon): void {
    const defenderSide = action.side === 0 ? 1 : 0;
    const defender = this.getActiveMutable(defenderSide as 0 | 1);

    this.emit({
      type: "move-start",
      side: action.side,
      pokemon: getPokemonName(actor),
      move: CORE_MOVE_IDS.struggle,
    });

    if (!defender) return;

    // Source: pokered — Struggle goes through the normal accuracy check (including 1/256 miss bug).
    // Gen 1 Struggle has 100% accuracy but is still subject to accuracy/evasion modifiers.
    if (
      !this.ruleset.doesMoveHit({
        attacker: actor,
        defender,
        move: STRUGGLE_MOVE_DATA,
        state: this.state,
        rng: this.state.rng,
      })
    ) {
      this.emit({
        type: "move-miss",
        side: action.side,
        pokemon: getPokemonName(actor),
        move: CORE_MOVE_IDS.struggle,
      });
      actor.lastMoveUsed = CORE_MOVE_IDS.struggle;
      actor.movedThisTurn = true;
      return;
    }

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
      source: BATTLE_SOURCE_IDS.struggle,
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
      source: BATTLE_SOURCE_IDS.struggleRecoil,
    });

    actor.lastMoveUsed = CORE_MOVE_IDS.struggle;
    actor.movedThisTurn = true;
  }

  /**
   * Execute a flee attempt (RunAction). Only valid in wild battles for side 0.
   *
   * Source: Bulbapedia -- Escape (Generation III+ formula, delegated to ruleset)
   */
  private executeRun(action: RunAction): void {
    // Only valid in wild battles
    if (!this.state.isWildBattle) {
      this.emit({ type: "message", text: "Can't run from a trainer battle!" });
      return;
    }

    // Only side 0 (player) can flee
    if (action.side !== 0) {
      return;
    }

    // Increment flee attempts
    this.state.fleeAttempts++;
    const attempts = this.state.fleeAttempts;

    const playerActive = this.state.sides[0].active[0];
    const wildActive = this.state.sides[1].active[0];
    if (!playerActive || !wildActive) return;

    // Compute effective speeds (base stat * stat stage multiplier)
    const playerBaseSpeed = playerActive.pokemon.calculatedStats?.speed ?? 1;
    const playerSpeed = Math.max(
      1,
      Math.floor(playerBaseSpeed * getStatStageMultiplier(playerActive.statStages.speed)),
    );

    const wildBaseSpeed = wildActive.pokemon.calculatedStats?.speed ?? 1;
    const wildSpeed = Math.max(
      1,
      Math.floor(wildBaseSpeed * getStatStageMultiplier(wildActive.statStages.speed)),
    );

    const success = this.ruleset.rollFleeSuccess(playerSpeed, wildSpeed, attempts, this.state.rng);

    this.emit({ type: "flee-attempt", side: 0, success });

    if (success) {
      this.emit({ type: "message", text: "Got away safely!" });
      this.state.ended = true;
      // winner is null = no winner (fled)
      this.emit({ type: "battle-end", winner: null });
    } else {
      this.emit({ type: "message", text: "Can't escape!" });
    }
  }

  private canExecuteMove(actor: ActivePokemon, move: MoveData): boolean {
    const side = this.getSideIndex(actor);

    // Flinch check
    if (actor.volatileStatuses.has(CORE_VOLATILE_IDS.flinch)) {
      actor.volatileStatuses.delete(CORE_VOLATILE_IDS.flinch);
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
          const flinchResult = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onFlinch, {
            pokemon: actor,
            opponent,
            state: this.state,
            rng: this.state.rng,
            trigger: CORE_ABILITY_TRIGGER_IDS.onFlinch,
          });
          if (flinchResult.activated) {
            this.processAbilityResult(flinchResult, actor, opponent, side);
          }
        }
      }

      return false;
    }

    // Sleep check
    // Source: Showdown sim/battle-actions.ts — sleepUsable moves (Sleep Talk, Snore)
    // bypass the sleep immobilization check but still decrement the sleep counter.
    if (actor.pokemon.status === CORE_STATUS_IDS.sleep) {
      const canAct = this.ruleset.processSleepTurn(actor, this.state);
      if (actor.pokemon.status === null) {
        // Pokemon woke up (status cleared by processSleepTurn)
        this.emit({
          type: "status-cure",
          side,
          pokemon: getPokemonName(actor),
          status: CORE_STATUS_IDS.sleep,
        });
      } else {
        // Still sleeping
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is fast asleep!`,
        });
      }
      if (!canAct) {
        // Sleep Talk and Snore are usable while asleep — they bypass immobilization.
        // Source: Showdown data/moves.ts — sleepUsable flag on sleep-talk and snore
        // Source: Bulbapedia — "Sleep Talk can only be used while asleep"
        // Source: Bulbapedia — "Snore can only be used while asleep"
        if (!SLEEP_USABLE_MOVES.has(move.id)) {
          return false;
        }
      }
    }

    // Freeze check
    if (actor.pokemon.status === CORE_STATUS_IDS.freeze) {
      if (move.flags.defrost) {
        // Defrost moves (Scald, Flame Wheel, etc.) always thaw the user
        actor.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side,
          pokemon: getPokemonName(actor),
          status: CORE_STATUS_IDS.freeze,
        });
      } else if (this.ruleset.checkFreezeThaw(actor, this.state.rng)) {
        actor.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side,
          pokemon: getPokemonName(actor),
          status: CORE_STATUS_IDS.freeze,
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
    if (actor.pokemon.status === CORE_STATUS_IDS.paralysis) {
      if (this.ruleset.checkFullParalysis(actor, this.state.rng)) {
        this.emit({
          type: "message",
          text: `${getPokemonName(actor)} is fully paralyzed!`,
        });
        return false;
      }
    }

    // Confusion check — turn countdown delegated to ruleset (Gen 7+ changed range from 1-4 to 2-5)
    if (actor.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)) {
      const confState = actor.volatileStatuses.get(CORE_VOLATILE_IDS.confusion);
      if (!confState || confState.turnsLeft <= 0) {
        // Confusion already expired (e.g., turnsLeft was set to 0 before this check)
        actor.volatileStatuses.delete(CORE_VOLATILE_IDS.confusion);
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile: CORE_VOLATILE_IDS.confusion,
        });
      } else {
        const stillConfused = this.ruleset.processConfusionTurn(actor, this.state);
        if (!stillConfused) {
          // Confusion ended after decrement
          actor.volatileStatuses.delete(CORE_VOLATILE_IDS.confusion);
          this.emit({
            type: "volatile-end",
            side,
            pokemon: getPokemonName(actor),
            volatile: CORE_VOLATILE_IDS.confusion,
          });
        } else {
          this.emit({
            type: "message",
            text: `${getPokemonName(actor)} is confused!`,
          });
          if (this.state.rng.chance(this.ruleset.getConfusionSelfHitChance())) {
            // Self-hit confusion damage — chance and formula delegated to ruleset
            const selfDamage = this.ruleset.calculateConfusionDamage(
              actor,
              this.state,
              this.state.rng,
            );
            this.emit({
              type: "message",
              text: "It hurt itself in its confusion!",
            });

            // Source: pokered — Gen 1 cartridge bug: confusion self-hit damages
            // the opponent's Substitute if one is active.
            const opponentSide = side === 0 ? 1 : 0;
            const opponent = this.getActiveMutable(opponentSide as 0 | 1);
            if (
              this.ruleset.confusionSelfHitTargetsOpponentSub() &&
              opponent &&
              opponent.substituteHp > 0
            ) {
              opponent.substituteHp = Math.max(0, opponent.substituteHp - selfDamage);
              this.emit({
                type: "message",
                text: "The substitute took damage!",
              });
              if (opponent.substituteHp === 0) {
                opponent.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
                this.emit({
                  type: "volatile-end",
                  side: opponentSide as 0 | 1,
                  pokemon: getPokemonName(opponent),
                  volatile: CORE_VOLATILE_IDS.substitute,
                });
              }
            } else {
              const maxHp = actor.pokemon.calculatedStats?.hp ?? actor.pokemon.currentHp;
              actor.pokemon.currentHp = Math.max(0, actor.pokemon.currentHp - selfDamage);
              this.emit({
                type: "damage",
                side,
                pokemon: getPokemonName(actor),
                amount: selfDamage,
                currentHp: actor.pokemon.currentHp,
                maxHp,
                source: BATTLE_SOURCE_IDS.confusion,
              });
            }
            return false;
          }
        }
      }
    }

    // Bound check — turn countdown delegated to ruleset (trap mechanics vary by gen)
    if (actor.volatileStatuses.has(CORE_VOLATILE_IDS.bound)) {
      const boundState = actor.volatileStatuses.get(CORE_VOLATILE_IDS.bound);
      if (!boundState || boundState.turnsLeft <= 0) {
        // Bound already expired
        actor.volatileStatuses.delete(CORE_VOLATILE_IDS.bound);
        this.emit({
          type: "volatile-end",
          side,
          pokemon: getPokemonName(actor),
          volatile: CORE_VOLATILE_IDS.bound,
        });
      } else {
        const stillBound = this.ruleset.processBoundTurn(actor, this.state);
        if (!stillBound) {
          // Binding ended after decrement
          actor.volatileStatuses.delete(CORE_VOLATILE_IDS.bound);
          this.emit({
            type: "volatile-end",
            side,
            pokemon: getPokemonName(actor),
            volatile: CORE_VOLATILE_IDS.bound,
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

    // Source-linked target-volatiles (e.g., Sky Drop-style immobilization) can
    // block the Pokemon from acting while the source remains active.
    const sourceLinkedBlocker = this.getSourceLinkedActionBlocker(actor);
    if (sourceLinkedBlocker) {
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} can't move!`,
      });
      return false;
    }

    // Gravity check — prevents moves with the gravity flag (Fly, Bounce, etc.)
    // Source: Showdown Gen 4 mod — Gravity disables gravity-flagged moves
    if (this.state.gravity.active && move.flags.gravity) {
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} can't use ${move.displayName} because of gravity!`,
      });
      return false;
    }

    // Taunt check — prevents status moves (runtime enforcement, mirrors getAvailableMoves check)
    // Source: Bulbapedia — "Taunt prevents the target from using status moves"
    if (
      actor.volatileStatuses.has(CORE_VOLATILE_IDS.taunt) &&
      move.category === CORE_MOVE_CATEGORIES.status
    ) {
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} can't use ${move.id} after the taunt!`,
      });
      return false;
    }

    // Assault Vest check — prevents status moves (runtime enforcement, mirrors getAvailableMoves)
    // Source: Showdown data/items.ts — Assault Vest: "The holder is unable to use status moves"
    // Source: Bulbapedia "Assault Vest" — "The holder cannot use status moves"
    // Klutz and Embargo suppress held-item effects including Assault Vest's restriction
    // Source: Showdown data/abilities.ts — Klutz: "This Pokemon's held item has no effect"
    // Source: Showdown data/moves.ts — Embargo: "Prevents the target from using held items"
    if (
      this.ruleset.hasHeldItems() &&
      actor.pokemon.heldItem === CORE_ITEM_IDS.assaultVest &&
      move.category === CORE_MOVE_CATEGORIES.status &&
      actor.ability !== CORE_ABILITY_IDS.klutz &&
      !actor.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)
    ) {
      this.emit({
        type: "message",
        text: `${getPokemonName(actor)} can't use ${move.displayName} because of its Assault Vest!`,
      });
      return false;
    }

    // Choice lock check — prevents using a different move than the locked one
    // Source: Bulbapedia — "Choice Band/Specs/Scarf lock the user into the first move selected"
    if (actor.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked)) {
      const choiceData = actor.volatileStatuses.get(CORE_VOLATILE_IDS.choiceLocked)?.data;
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

  /**
   * Centralized helper: apply a primary status condition, emit the event, and
   * initialize companion volatile statuses (toxic-counter, sleep-counter,
   * just-frozen) that the turn loop and end-of-turn handlers depend on.
   *
   * All code paths that inflict a primary status MUST call this method instead
   * of setting `pokemon.status` directly — otherwise companion volatiles will
   * be missing and mechanics like escalating Toxic damage or the
   * processEndOfTurnDefrost "just-frozen" guard will break.
   */
  private applyPrimaryStatus(
    target: ActivePokemon,
    status: PrimaryStatus,
    side: 0 | 1,
    sleepTurnsOverride?: number,
  ): void {
    // Terrain-based status immunity check (Gen 6+)
    // Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
    if (this.ruleset.checkTerrainStatusImmunity) {
      const terrainResult = this.ruleset.checkTerrainStatusImmunity(status, target, this.state);
      if (terrainResult.immune) {
        if (terrainResult.message) {
          this.emit({ type: "message", text: terrainResult.message });
        }
        return;
      }
    }

    target.pokemon.status = status;

    // Initialize companion volatiles that downstream mechanics depend on.
    // Must run BEFORE emitting status-inflict so synchronous listeners see fully-initialized state.
    if (status === CORE_STATUS_IDS.badlyPoisoned) {
      // Source: Showdown sim/battle-actions.ts — toxic counter starts at 1, increments each EoT
      target.volatileStatuses.set(CORE_VOLATILE_IDS.toxicCounter, {
        turnsLeft: -1,
        data: { counter: 1 },
      });
    } else if (status === CORE_STATUS_IDS.sleep) {
      // Source: Showdown sim/battle-actions.ts — sleep turns rolled on infliction, tracked by sleep-counter
      // startTime is stored so Gen 5's onSwitchIn can reset turnsLeft to the original value.
      // Source: Showdown data/mods/gen5/conditions.ts — slp.onSwitchIn: effectState.time = effectState.startTime
      const turns = sleepTurnsOverride ?? this.ruleset.rollSleepTurns(this.state.rng);
      target.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, {
        turnsLeft: turns,
        data: { startTime: turns },
      });
    } else if (status === CORE_STATUS_IDS.freeze) {
      // Source: pret/pokecrystal engine/battle/core.asm:1538-1540 — wPlayerJustGotFrozen
      // Prevents EoT processEndOfTurnDefrost from thawing on the same turn.
      target.volatileStatuses.set(CORE_VOLATILE_IDS.justFrozen, { turnsLeft: 1 });
    }

    this.emit({
      type: "status-inflict",
      side,
      pokemon: getPokemonName(target),
      status,
    });

    // Ability: on-status-inflicted trigger (e.g., Synchronize — mirrors status to opponent)
    // Source: pret/pokeemerald — ABILITY_SYNCHRONIZE fires when status is inflicted
    if (this.ruleset.hasAbilities()) {
      const opponentSideIdx = (side === 0 ? 1 : 0) as 0 | 1;
      const opponent = this.getActiveMutable(opponentSideIdx);
      if (opponent && opponent.pokemon.currentHp > 0) {
        const statusInflictedResult = this.ruleset.applyAbility(
          CORE_ABILITY_TRIGGER_IDS.onStatusInflicted,
          {
            pokemon: target,
            opponent,
            state: this.state,
            rng: this.state.rng,
            trigger: CORE_ABILITY_TRIGGER_IDS.onStatusInflicted,
          },
        );
        if (statusInflictedResult.activated) {
          this.processAbilityResult(statusInflictedResult, target, opponent, side);
        }
      }
    }
  }

  private processEffectResult(
    result: MoveEffectResult,
    attacker: ActivePokemon,
    defender: ActivePokemon,
    attackerSide: 0 | 1,
    defenderSide: 0 | 1,
  ): void {
    if (result.escapeBattle && attackerSide === 0 && this.state.isWildBattle) {
      // Source: pret/pokered src/engine/battle/effect_commands.asm — successful wild Teleport
      // uses the standard flee-attempt + "Got away safely!" flow, and BattleEndEvent
      // is documented as the final event before the engine enters battle-end phase.
      this.emit({ type: "flee-attempt", side: 0, success: true });
      this.emit({ type: "message", text: "Got away safely!" });
      this.state.ended = true;
      this.state.winner = null;
      this.transitionTo("battle-end");
      this.emit({ type: "battle-end", winner: null });
      return;
    }

    // Status infliction
    if (result.statusInflicted && !defender.pokemon.status) {
      this.applyPrimaryStatus(defender, result.statusInflicted, defenderSide);
    }

    // Volatile status infliction — use volatileData for turnsLeft if provided.
    // Terrain immunity check (e.g., Misty Terrain blocks confusion on grounded Pokemon).
    // Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile
    if (result.volatileInflicted && !defender.volatileStatuses.has(result.volatileInflicted)) {
      if (!this.ruleset.shouldBlockVolatile?.(result.volatileInflicted, defender, this.state)) {
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
    }

    // Source-linked target volatile infliction — used by effects that immobilize
    // the defender while the source Pokemon remains on the field.
    if (
      result.targetVolatileInflicted &&
      !defender.volatileStatuses.has(result.targetVolatileInflicted.volatile)
    ) {
      const linkedVolatile = result.targetVolatileInflicted;
      if (!this.ruleset.shouldBlockVolatile?.(linkedVolatile.volatile, defender, this.state)) {
        defender.volatileStatuses.set(linkedVolatile.volatile, {
          turnsLeft: linkedVolatile.turnsLeft ?? -1,
          data: linkedVolatile.data,
          sourcePokemonUid: linkedVolatile.sourcePokemonUid ?? attacker.pokemon.uid,
          blocksAction: linkedVolatile.blocksAction ?? false,
        });
        this.emit({
          type: "volatile-start",
          side: defenderSide,
          pokemon: getPokemonName(defender),
          volatile: linkedVolatile.volatile,
        });
      }
    }

    // Stat changes
    for (const change of result.statChanges) {
      const target = change.target === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
      const targetSide =
        change.target === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
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
        source: BATTLE_SOURCE_IDS.recoil,
      });
    }

    // Healing (attacker)
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
          source: BATTLE_SOURCE_IDS.moveEffect,
        });
      }
    }

    // Healing (defender) — e.g., Heal Pulse heals the target, not the user
    // Source: Showdown data/moves.ts -- healPulse: { target: 'normal', heal: [1, 2] }
    if (result.defenderHealAmount && result.defenderHealAmount > 0) {
      const defMaxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
      const defOldHp = defender.pokemon.currentHp;
      defender.pokemon.currentHp = Math.min(defMaxHp, defOldHp + result.defenderHealAmount);
      const defHealed = defender.pokemon.currentHp - defOldHp;
      if (defHealed > 0) {
        this.emit({
          type: "heal",
          side: defenderSide,
          pokemon: getPokemonName(defender),
          amount: defHealed,
          currentHp: defender.pokemon.currentHp,
          maxHp: defMaxHp,
          source: BATTLE_SOURCE_IDS.moveEffect,
        });
      }
    }

    // Attacker item consumption (Power Herb, Natural Gift, Fling, etc.)
    // The move effect sets attackerItemConsumed: true; the engine handles the actual
    // removal so it can emit the item-consumed event with the correct item name.
    // Source: Showdown data/moves.ts -- naturalGift, fling, powerherb consume user's item
    if (result.attackerItemConsumed) {
      const consumedItemId = attacker.pokemon.heldItem;
      if (consumedItemId) {
        attacker.pokemon.heldItem = null;
        this.emit({
          type: "item-consumed",
          side: attackerSide,
          pokemon: getPokemonName(attacker),
          item: consumedItemId,
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
      // Fire on-weather-change triggers (e.g., Forecast changes Castform's type)
      // Source: pret/pokeemerald — ABILITY_FORECAST re-evaluated after weather changes
      this.fireWeatherChangeAbilities();
    }

    // Terrain from move effects (Gen 6+)
    // Source: Showdown sim/battle-actions.ts — terrain moves set terrain for 5 turns
    if (result.terrainSet !== undefined && this.ruleset.hasTerrain()) {
      if (result.terrainSet !== null) {
        this.state.terrain = {
          type: result.terrainSet.terrain,
          turnsLeft: result.terrainSet.turns,
          source: result.terrainSet.source,
        };
        this.emit({
          type: "terrain-set",
          terrain: result.terrainSet.terrain,
          source: result.terrainSet.source,
        });
      } else {
        // null = clear terrain
        const previousTerrain = this.state.terrain?.type;
        if (previousTerrain) {
          this.state.terrain = null;
          this.emit({ type: "terrain-end", terrain: previousTerrain });
        }
      }
    }

    // Hazard from move effects
    if (result.hazardSet) {
      const targetSide = this.state.sides[result.hazardSet.targetSide];
      const hazardType = result.hazardSet.hazard;
      const maxLayers = this.ruleset.getMaxHazardLayers(hazardType);
      const existing = targetSide.hazards.find((h) => h.type === hazardType);
      if (!existing) {
        targetSide.hazards.push({ type: hazardType, layers: 1 });
        this.emit({
          type: "hazard-set",
          side: result.hazardSet.targetSide,
          hazard: hazardType,
          layers: 1,
        });
      } else if (existing.layers < maxLayers) {
        // Bug #537 fix: increment layers for stackable hazards
        existing.layers += 1;
        this.emit({
          type: "hazard-set",
          side: result.hazardSet.targetSide,
          hazard: hazardType,
          layers: existing.layers,
        });
      }
      // If already at max layers, do nothing (matches cartridge behavior — move fails silently)
    }

    // Clear volatiles from move effects (e.g., Rapid Spin)
    if (result.volatilesToClear) {
      for (const clear of result.volatilesToClear) {
        const target = clear.target === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
        const targetSide =
          clear.target === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
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
        result.clearSideHazards === BATTLE_EFFECT_TARGETS.attacker
          ? this.state.sides[attackerSide]
          : this.state.sides[defenderSide];
      const clearSideIndex =
        result.clearSideHazards === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
      if (clearSide.hazards.length > 0) {
        const clearedHazards = [...clearSide.hazards];
        clearSide.hazards = [];
        for (const clearedHazard of clearedHazards) {
          this.emit({
            type: "hazard-clear",
            side: clearSideIndex,
            hazard: clearedHazard.type,
          });
        }
        this.emit({
          type: "message",
          text: "The hazards were cleared!",
        });
      }
    }

    // Item transfer (e.g., Thief)
    if (result.itemTransfer) {
      const from =
        result.itemTransfer.from === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
      const to = result.itemTransfer.to === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
      if (from.pokemon.heldItem && !to.pokemon.heldItem) {
        to.pokemon.heldItem = from.pokemon.heldItem;
        from.pokemon.heldItem = null;
      }
    }

    // Screen set (Reflect / Light Screen)
    if (result.screenSet) {
      const screenSide =
        result.screenSet.side === BATTLE_EFFECT_TARGETS.attacker
          ? this.state.sides[attackerSide]
          : this.state.sides[defenderSide];
      const screenSideIndex =
        result.screenSet.side === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
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
      this.syncLuckyChant(screenSide);
    }

    // Screen clear (Haze or switch-out removes screens from a side)
    // Source: pret/pokeemerald EFFECT_BRICK_BREAK -- Brick Break only removes Reflect/Light Screen
    // When screenTypesToRemove is set, filter instead of clearing all screens.
    // This prevents Brick Break from incorrectly removing Safeguard.
    if (result.screensCleared) {
      if (
        result.screensCleared === BATTLE_EFFECT_TARGETS.attacker ||
        result.screensCleared === BATTLE_EFFECT_TARGETS.both
      ) {
        this.clearScreens(attackerSide, result.screenTypesToRemove);
      }
      if (
        result.screensCleared === BATTLE_EFFECT_TARGETS.defender ||
        result.screensCleared === BATTLE_EFFECT_TARGETS.both
      ) {
        this.clearScreens(defenderSide, result.screenTypesToRemove);
      }
    }

    // Tailwind set (Gen 4+)
    if (result.tailwindSet) {
      const tailwindSide =
        result.tailwindSet.side === BATTLE_EFFECT_TARGETS.attacker
          ? this.state.sides[attackerSide]
          : this.state.sides[defenderSide];
      const tailwindSideIndex =
        result.tailwindSet.side === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
      tailwindSide.tailwind = { active: true, turnsLeft: result.tailwindSet.turnsLeft };
      this.emit({
        type: "message",
        text: `Side ${tailwindSideIndex}'s tailwind began!`,
      });
    }

    // Trick Room set (Gen 4+)
    // When turnsLeft > 0, activate Trick Room. When turnsLeft <= 0, deactivate it (toggle off).
    // Messaging is handled by the gen ruleset via result.messages — no hardcoded message here
    // to avoid duplicates.
    if (result.trickRoomSet) {
      const trActive = result.trickRoomSet.turnsLeft > 0;
      this.state.trickRoom = { active: trActive, turnsLeft: result.trickRoomSet.turnsLeft };
    }

    // Magic Room set (Gen 5+)
    // When turnsLeft > 0, activate Magic Room. When turnsLeft <= 0, deactivate it (toggle off).
    // Messaging is handled by the gen ruleset via result.messages.
    // Source: Showdown magicroom condition — duration: 5, onFieldRestart toggles off
    if (result.magicRoomSet) {
      const mrActive = result.magicRoomSet.turnsLeft > 0;
      this.state.magicRoom = { active: mrActive, turnsLeft: result.magicRoomSet.turnsLeft };
    }

    // Wonder Room set (Gen 5+)
    // When turnsLeft > 0, activate Wonder Room. When turnsLeft <= 0, deactivate it (toggle off).
    // Messaging is handled by the gen ruleset via result.messages.
    // Source: Showdown wonderroom condition — duration: 5, onFieldRestart toggles off
    if (result.wonderRoomSet) {
      const wrActive = result.wonderRoomSet.turnsLeft > 0;
      this.state.wonderRoom = { active: wrActive, turnsLeft: result.wonderRoomSet.turnsLeft };
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
          this.emit({
            type: "engine-warning",
            message:
              `Future attack move "${result.futureAttack.moveId}" data missing while scheduling. ` +
              "Storing 0 damage fallback.",
          });
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

    // Wish scheduling — schedule heal for end of next turn on the attacker's side
    // Source: Showdown data/moves.ts -- wish: { condition: { duration: 2, onResidual: heals floor(hp/2) } }
    // Source: Bulbapedia -- "At the end of the next turn, the Pokemon in the slot
    //   will be restored by half the maximum HP of the Pokemon that used Wish"
    if (result.wishSet) {
      const wisherSide = this.state.sides[attackerSide];
      wisherSide.wish = {
        active: true,
        turnsLeft: result.wishSet.turnsLeft, // Caller (gen ruleset) sets the countdown duration
        healAmount: result.wishSet.healAmount,
      };
    }

    // Forced move set (two-turn moves: Fly, Dig, Dive, SolarBeam, etc.)
    // Source: Showdown — two-turn moves set forcedMove on charge turn; volatile applied immediately
    if (result.forcedMoveSet) {
      attacker.forcedMove = {
        moveIndex: result.forcedMoveSet.moveIndex,
        moveId: result.forcedMoveSet.moveId,
      };
      // Only manage the volatile here if selfVolatileInflicted isn't targeting the same volatile.
      // When they match (e.g., Bide, Thrash, Rage), selfVolatileInflicted handles the volatile
      // with correct turnsLeft and data — forcedMoveSet must not overwrite it.
      if (result.selfVolatileInflicted !== result.forcedMoveSet.volatileStatus) {
        attacker.volatileStatuses.set(result.forcedMoveSet.volatileStatus, {
          turnsLeft: 1,
        });
        this.emit({
          type: "volatile-start",
          side: attackerSide,
          pokemon: getPokemonName(attacker),
          volatile: result.forcedMoveSet.volatileStatus,
        });
      }
    }

    // Gravity set (Gen 4+)
    // Source: Showdown Gen 4 mod — Gravity lasts 5 turns, grounds all Pokemon
    if (result.gravitySet) {
      this.state.gravity = { active: true, turnsLeft: 5 };
      this.emit({ type: "message", text: "Gravity intensified!" });

      // Gravity grounds all in-flight Pokemon — cancel Fly/Bounce mid-air
      // Both Fly and Bounce use the "flying" volatile status.
      // Source: Showdown Gen 4 mod — "Gravity cancels the charge turn of Fly, Bounce, etc."
      // Source: Bulbapedia — "If Gravity is activated while a Pokemon is in the
      //   semi-invulnerable turn of Fly or Bounce, that Pokemon is brought back down."
      for (const side of this.state.sides) {
        const sideActive = side.active[0];
        if (!sideActive) continue;
        if (sideActive.volatileStatuses.has(CORE_VOLATILE_IDS.flying)) {
          sideActive.volatileStatuses.delete(CORE_VOLATILE_IDS.flying);
          sideActive.forcedMove = null;
          this.emit({
            type: "volatile-end",
            side: side.index,
            pokemon: getPokemonName(sideActive),
            volatile: CORE_VOLATILE_IDS.flying,
          });
          this.emit({
            type: "message",
            text: `${getPokemonName(sideActive)} was brought back down by gravity!`,
          });
        }
      }
    }

    // Self-faint (Explosion / Self-Destruct)
    if (result.selfFaint) {
      attacker.pokemon.currentHp = 0;
      // faint event and faintCount increment handled by checkMidTurnFaints()
    }

    // Custom damage (OHKO, fixed damage, Counter)
    if (result.customDamage) {
      const customTarget =
        result.customDamage.target === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
      const customSource =
        result.customDamage.target === BATTLE_EFFECT_TARGETS.attacker ? defender : attacker;
      const customTargetSide =
        result.customDamage.target === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
      this.applyCustomDamage(
        customTarget,
        customSource,
        customTargetSide,
        result.customDamage.amount,
        result.customDamage.source,
        result.customDamage.type,
      );
    }

    const resetStatStages = (pokemon: ActivePokemon, side: 0 | 1) => {
      // Emit the reset as per-stat deltas so event consumers can observe exactly what changed.
      for (const [stat, currentStage] of Object.entries(pokemon.statStages) as [
        keyof ActivePokemon["statStages"],
        number,
      ][]) {
        if (currentStage === 0) {
          continue;
        }
        pokemon.statStages[stat] = 0;
        this.emit({
          type: "stat-change",
          side,
          pokemon: getPokemonName(pokemon),
          stat,
          stages: -currentStage,
          currentStage: 0,
        });
      }
    };

    // Status cure: cures status AND resets stat stages for target(s)
    // statusCuredOnly: cures status WITHOUT resetting stages (e.g. Rest)
    // statStagesReset: resets stages WITHOUT curing status (e.g. Haze attacker side)
    if (result.statusCured) {
      const targets: Array<{ pokemon: ActivePokemon; side: 0 | 1 }> = [];
      if (
        result.statusCured.target === BATTLE_EFFECT_TARGETS.attacker ||
        result.statusCured.target === BATTLE_EFFECT_TARGETS.both
      ) {
        targets.push({ pokemon: attacker, side: attackerSide });
      }
      if (
        result.statusCured.target === BATTLE_EFFECT_TARGETS.defender ||
        result.statusCured.target === BATTLE_EFFECT_TARGETS.both
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
        // Reset all stat stages for this target (coupled with status cure)
        resetStatStages(t, tSide);
      }
    }

    // statStagesReset — reset stat stages without curing status (e.g. Haze attacker side)
    if (result.statStagesReset) {
      const resetTargets: Array<{ pokemon: ActivePokemon; side: 0 | 1 }> = [];
      if (
        result.statStagesReset.target === BATTLE_EFFECT_TARGETS.attacker ||
        result.statStagesReset.target === BATTLE_EFFECT_TARGETS.both
      ) {
        resetTargets.push({ pokemon: attacker, side: attackerSide });
      }
      if (
        result.statStagesReset.target === BATTLE_EFFECT_TARGETS.defender ||
        result.statStagesReset.target === BATTLE_EFFECT_TARGETS.both
      ) {
        resetTargets.push({ pokemon: defender, side: defenderSide });
      }
      for (const { pokemon: t, side } of resetTargets) {
        resetStatStages(t, side);
      }
    }

    // statusCuredOnly — cure status without resetting stat stages (for Rest, unlike Haze)
    if (result.statusCuredOnly) {
      const targets: Array<{ pokemon: ActivePokemon; side: 0 | 1 }> = [];
      if (
        result.statusCuredOnly.target === BATTLE_EFFECT_TARGETS.attacker ||
        result.statusCuredOnly.target === BATTLE_EFFECT_TARGETS.both
      ) {
        targets.push({ pokemon: attacker, side: attackerSide });
      }
      if (
        result.statusCuredOnly.target === BATTLE_EFFECT_TARGETS.defender ||
        result.statusCuredOnly.target === BATTLE_EFFECT_TARGETS.both
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

    // teamStatusCure — cure status for ALL Pokemon on the specified side's team (including bench)
    // Used by Aromatherapy and Heal Bell which cure the entire party.
    // Source: Bulbapedia -- "Aromatherapy cures the status conditions of all Pokemon on the user's team"
    // Source: Showdown data/moves.ts -- aromatherapy: { target: 'allyTeam' }
    if (result.teamStatusCure) {
      const cureSideIndex =
        result.teamStatusCure.side === BATTLE_EFFECT_TARGETS.attacker ? attackerSide : defenderSide;
      const cureSide = this.state.sides[cureSideIndex];

      // Cure the entire team (bench Pokemon stored in side.team)
      for (const teamMember of cureSide.team) {
        if (teamMember.status) {
          const curedStatus = teamMember.status;
          teamMember.status = null;
          this.emit({
            type: "status-cure",
            side: cureSideIndex,
            pokemon: teamMember.nickname ?? String(teamMember.speciesId),
            status: curedStatus,
          });
        }
      }

      // Also cure the active Pokemon (may not be in team array directly)
      const activePokemon = cureSide.active[0];
      if (activePokemon?.pokemon.status) {
        const curedStatus = activePokemon.pokemon.status;
        activePokemon.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side: cureSideIndex,
          pokemon: getPokemonName(activePokemon),
          status: curedStatus,
        });
      }
    }

    // selfStatusInflicted — apply a status condition to the ATTACKER
    if (result.selfStatusInflicted && !attacker.pokemon.status) {
      // Use selfVolatileData.turnsLeft if provided (e.g., Rest's fixed 2-turn sleep)
      const sleepOverride =
        result.selfStatusInflicted === CORE_STATUS_IDS.sleep
          ? result.selfVolatileData?.turnsLeft
          : undefined;
      this.applyPrimaryStatus(attacker, result.selfStatusInflicted, attackerSide, sleepOverride);
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
      const typeTarget =
        result.typeChange.target === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
      typeTarget.types = [...result.typeChange.types];
      this.emit({
        type: "message",
        text: `${getPokemonName(typeTarget)}'s type changed!`,
      });
    }

    // abilityChange — change the active ability of the attacker or defender
    // Used by Entrainment (replaces target's ability with user's ability)
    // Source: Showdown data/moves.ts -- entrainment: target.setAbility(source.ability)
    if (result.abilityChange) {
      const abilityTarget =
        result.abilityChange.target === BATTLE_EFFECT_TARGETS.attacker ? attacker : defender;
      const _abilityTargetSide =
        result.abilityChange.target === BATTLE_EFFECT_TARGETS.attacker
          ? attackerSide
          : defenderSide;
      const oldAbility = abilityTarget.ability;
      abilityTarget.ability = result.abilityChange.ability;
      this.emit({
        type: "message",
        text: `${getPokemonName(abilityTarget)}'s ability changed from ${oldAbility} to ${result.abilityChange.ability}!`,
      });
    }

    // moveSlotChange — temporarily replace a move slot (Mimic)
    // Source: pret/pokered MimicEffect
    if (result.moveSlotChange) {
      const { slot, newMoveId, newPP } = result.moveSlotChange;
      const moveSlots = attacker.pokemon.moves;
      if (slot >= 0 && slot < moveSlots.length) {
        moveSlots[slot] = { moveId: newMoveId, currentPP: newPP, maxPP: newPP, ppUps: 0 };
        // Volatile storage and event emission handled by selfVolatileInflicted in the result
        this.emit({
          type: "message",
          text: `${getPokemonName(attacker)} learned ${newMoveId}!`,
        });
      }
    }

    // Voluntary self-switch: Baton Pass, U-turn-style moves, and Shed Tail all
    // queue a replacement on the attacker's side rather than silently falling
    // through as normal moves.
    if (result.shedTail || (result.switchOut && !result.forcedSwitch)) {
      const attackerSideState = this.state.sides[attackerSide];
      const hasAlive = attackerSideState.team.some(
        (p, idx) => p.currentHp > 0 && idx !== (attackerSideState.active[0]?.teamSlot ?? -1),
      );
      if (hasAlive) {
        this.sidesNeedingSwitch.add(attackerSide);
        this.pendingSelfSwitches.set(attackerSide, {
          batonPass: result.batonPass ?? false,
        });
      }
    }

    // Forced switch (phazing: Whirlwind, Roar) — the DEFENDER is forced out.
    // switchOut=true + forcedSwitch=true means the defender must switch to a random
    // valid party member. If no valid targets exist, the move effectively fails.
    // Source: Bulbapedia — "Whirlwind forces the target to switch out"
    if (result.switchOut && result.forcedSwitch) {
      this.performImmediateForcedSwitch(defenderSide, {
        markSideAsPhased: true,
        message: `${getPokemonName(defender)} was blown away!`,
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
    processEndOfTurnPipeline({
      state: this.state,
      ruleset: this.ruleset,
      dataManager: this.dataManager,
      emit: (event) => this.emit(event),
      processWeatherDamage: () => this.processWeatherDamage(),
      processWeatherCountdown: () => this.processWeatherCountdown(),
      processTerrainCountdown: () => this.processTerrainCountdown(),
      processStatusDamage: () => this.processStatusDamage(),
      processScreenCountdown: () => this.processScreenCountdown(),
      processTailwindCountdown: () => this.processTailwindCountdown(),
      processTrickRoomCountdown: () => this.processTrickRoomCountdown(),
      processHeldItemEndOfTurn: () => this.processHeldItemEndOfTurn(),
      processLeechSeed: () => this.processLeechSeed(),
      processPerishSong: () => this.processPerishSong(),
      processCurse: () => this.processCurse(),
      processNightmare: () => this.processNightmare(),
      processBindDamage: () => this.processBindDamage(),
      processSaltCureEoT: () => this.processSaltCureEoT(),
      processDefrost: () => this.processDefrost(),
      processSafeguardCountdown: () => this.processSafeguardCountdown(),
      processMysteryBerry: () => this.processMysteryBerry(),
      processStatBoostingItems: () => this.processStatBoostingItems(),
      processHealingItems: () => this.processHealingItems(),
      processEncoreCountdown: () => this.processEncoreCountdown(),
      getOpponentActive: (side) => this.getOpponentActive(side),
      processAbilityResult: (result, pokemon, opponent, sideParam) =>
        this.processAbilityResult(result, pokemon, opponent, sideParam),
      processItemResult: (result, pokemon, sideParam) =>
        this.processItemResult(result, pokemon, sideParam),
      checkMidTurnFaints: (moveSource) => this.checkMidTurnFaints(moveSource),
      applyPrimaryStatus: (target, status, side, sleepTurnsOverride) =>
        this.applyPrimaryStatus(target, status, side, sleepTurnsOverride),
    });
  }

  private processWeatherDamage(): void {
    if (!this.state.weather || !this.ruleset.hasWeather()) return;

    const results = this.ruleset.applyWeatherEffects(this.state);
    for (const result of results) {
      if (result.damage > 0) {
        const active = this.getActiveMutable(result.side);
        if (active) {
          active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - result.damage);
          this.emit({
            type: "damage",
            side: result.side,
            pokemon: result.pokemon,
            amount: result.damage,
            currentHp: active.pokemon.currentHp,
            maxHp: active.pokemon.calculatedStats?.hp ?? 1,
            source: `${BATTLE_SOURCE_IDS.weatherPrefix}${this.state.weather.type}`,
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
    if (
      status === CORE_STATUS_IDS.burn ||
      status === CORE_STATUS_IDS.poison ||
      status === CORE_STATUS_IDS.badlyPoisoned
    ) {
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
        // Safeguard has its own countdown handler in Gen 4-8 so it can keep the
        // legacy wear-off message without being decremented twice per turn.
        if ((screen.type as string) === "safeguard") {
          return true;
        }
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
      this.syncLuckyChant(side);
    }
  }

  private clearScreens(sideIndex: 0 | 1, screenTypesToRemove?: readonly string[]): void {
    const side = this.state.sides[sideIndex];
    const removedScreens = screenTypesToRemove
      ? side.screens.filter((screen) => screenTypesToRemove.includes(screen.type))
      : [...side.screens];

    if (removedScreens.length === 0) {
      return;
    }

    side.screens = screenTypesToRemove
      ? side.screens.filter((screen) => !screenTypesToRemove.includes(screen.type))
      : [];

    for (const removedScreen of removedScreens) {
      this.emit({
        type: "screen-end",
        side: sideIndex,
        screen: removedScreen.type,
      });
    }

    this.syncLuckyChant(side);
  }

  private syncLuckyChant(side: BattleSide): void {
    const luckyChantScreen = side.screens.find(
      (screen) => (screen.type as string) === "lucky-chant",
    );
    side.luckyChant = {
      active: luckyChantScreen !== undefined,
      turnsLeft: luckyChantScreen?.turnsLeft ?? 0,
    };
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
        this.clearSourceLinkedVolatiles(active.pokemon.uid);

        // Award EXP to the winning side's participants for this faint
        this.awardExpForFaint(side.index as 0 | 1, active.pokemon.uid);

        // Destiny Bond: if the fainted Pokemon has destiny-bond volatile and was
        // KO'd by an opponent's move, the opponent also faints.
        // Source: Bulbapedia — "If the user faints after using this move, the
        // Pokemon that knocked it out also faints."
        if (
          active.volatileStatuses.has(CORE_VOLATILE_IDS.destinyBond) &&
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

  private prepareGoFirstItemActivations(actions: BattleAction[]): void {
    if (!this.ruleset.hasHeldItems()) return;

    for (const action of actions) {
      if (action.type !== "move") continue;

      const active = this.getActiveMutable(action.side);
      if (!active || active.pokemon.currentHp <= 0 || !active.pokemon.heldItem) continue;

      const moveSlot = active.pokemon.moves[action.moveIndex];
      if (!moveSlot) continue;

      let moveData: MoveData;
      try {
        moveData = this.dataManager.getMove(moveSlot.moveId);
      } catch {
        this.emit({
          type: "engine-warning",
          message: `Go-first item check skipped because move data for slot ${action.moveIndex} was not found.`,
        });
        continue;
      }

      const opponent = this.getOpponentActive(action.side) ?? undefined;
      const itemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.beforeTurnOrder, {
        pokemon: active,
        opponent,
        state: this.state,
        rng: this.state.rng,
        move: moveData,
      });

      if (!itemResult.activated) continue;

      markGoFirstItemActivated(action);
      if (opponent) {
        this.processItemResult(itemResult, active, opponent, action.side);
      } else {
        this.processItemResult(itemResult, active, action.side);
      }
    }
  }

  /**
   * Records the current active pokemon on each side as participants against each other.
   * Called at battle start, at the start of each turn, and after each switch-in.
   *
   * Stores: faintedUid → Set<participantUid> (symmetric — both sides tracked, but
   * only the winning side's participants receive EXP in awardExpForFaint).
   *
   * Source: Game mechanic — all Pokemon that were active against a foe share EXP on faint.
   */
  private recordParticipation(): void {
    const side0Active = this.state.sides[0].active[0]?.pokemon.uid;
    const side1Active = this.state.sides[1].active[0]?.pokemon.uid;
    if (!side0Active || !side1Active) return;

    // Record that side0's active pokemon faced side1's active pokemon
    if (!this.participantTracker.has(side0Active)) {
      this.participantTracker.set(side0Active, new Set());
    }
    this.participantTracker.get(side0Active)?.add(side1Active);

    // Record that side1's active pokemon faced side0's active pokemon
    if (!this.participantTracker.has(side1Active)) {
      this.participantTracker.set(side1Active, new Set());
    }
    this.participantTracker.get(side1Active)?.add(side0Active);
  }

  private getExpRecipients(
    winnerTeam: BattleState["sides"][number]["team"],
    livingParticipantUids: ReadonlySet<string>,
  ): readonly ExpRecipient[] {
    const recipientContext: ExpRecipientSelectionContext = {
      winnerTeam,
      livingParticipantUids,
    };

    return this.ruleset.getExpRecipients(recipientContext);
  }

  /**
   * Awards EXP to all living participants on the winning side after a pokemon faints.
   * Emits ExpGainEvent and, if enough EXP to level up, LevelUpEvent (possibly multiple).
   * Stats are recalculated on level-up and currentHp is increased by the HP stat delta.
   *
   * Source: Game mechanic — EXP is awarded to participating Pokemon after a foe faints.
   * Source: Showdown sim/battle-actions.ts — EXP gain and level-up logic
   */
  private awardExpForFaint(faintedSide: 0 | 1, faintedUid: string): void {
    const winnerSide = (faintedSide === 0 ? 1 : 0) as 0 | 1;

    // Look up the fainted pokemon instance from the fainted side's team
    const faintedPokemon = this.state.sides[faintedSide].team.find((p) => p.uid === faintedUid);
    if (!faintedPokemon) return;

    const faintedSpecies = this.dataManager.getSpecies(faintedPokemon.speciesId);
    if (!faintedSpecies) return;

    // Copy and immediately clear the tracker entry so that if this pokemon is somehow
    // revived and faints again (e.g., via a revive item), the second payout uses only
    // post-revival participants and does not inflate participantCount with first-life data.
    // Source: CodeRabbit review on PR #280 — defensive cleanup after payout.
    const participants = new Set(this.participantTracker.get(faintedUid) ?? []);
    this.participantTracker.delete(faintedUid);
    if (participants.size === 0) return;

    // Count only living participants on the winner's side (dead pokemon don't get EXP)
    const winnerTeam = this.state.sides[winnerSide].team;
    // All pokemon on the winner's side that participated (alive or fainted)
    // Source: Game mechanic — EXP is divided by all participants, but only living ones receive it
    const winnerParticipants = [...participants].filter((uid) =>
      winnerTeam.some((t) => t.uid === uid),
    );
    if (winnerParticipants.length === 0) return;

    // Only living participants receive EXP and count toward the divisor.
    // Source: Bulbapedia — "Experience Points are divided equally among all Pokémon
    // who participated in the battle and have not fainted."
    const livingParticipants = winnerParticipants.filter((uid) => {
      const p = winnerTeam.find((t) => t.uid === uid);
      return p !== undefined && p.currentHp > 0;
    });
    const participantCount = livingParticipants.length;
    if (participantCount === 0) return;

    const expRecipients = this.getExpRecipients(winnerTeam, new Set(livingParticipants));

    for (const { pokemon: participant, hasExpShare } of expRecipients) {
      if (participant.level >= 100) continue; // max level — no EXP

      const participantSpecies = this.dataManager.getSpecies(participant.speciesId);
      if (!participantSpecies) continue;

      const context = {
        defeatedSpecies: faintedSpecies,
        defeatedLevel: faintedPokemon.level,
        participantLevel: participant.level,
        isTrainerBattle: !this.state.isWildBattle,
        participantCount, // living participants only — Source: Bulbapedia EXP mechanics
        hasLuckyEgg: participant.heldItem === CORE_ITEM_IDS.luckyEgg,
        hasExpShare,
        affectionBonus: false,
        // Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9988
        // Passed from PokemonInstance so consumers can set traded status on their Pokemon.
        isTradedPokemon: participant.isTradedPokemon ?? false,
        isInternationalTrade: participant.isInternationalTrade ?? false,
      };

      const expGained = this.ruleset.calculateExpGain(context);
      if (expGained <= 0) continue;

      participant.experience += expGained;

      this.emit({
        type: "exp-gain",
        side: winnerSide,
        pokemon: participant.uid,
        amount: expGained,
      });

      // Level-up loop: a single EXP gain may trigger multiple consecutive level-ups
      while (participant.level < 100) {
        const expForNextLevel = getExpForLevel(participantSpecies.expGroup, participant.level + 1);
        if (participant.experience < expForNextLevel) break;

        const oldHpStat = participant.calculatedStats?.hp ?? participant.currentHp;
        participant.level += 1;

        // Recalculate all stats at the new level
        const newStats = this.ruleset.calculateStats(participant, participantSpecies);
        participant.calculatedStats = newStats;

        // Increase currentHp by the HP stat increase (so the bar doesn't appear to shrink)
        // Source: Game mechanic — HP increase on level-up
        const hpIncrease = newStats.hp - oldHpStat;
        participant.currentHp = Math.min(participant.currentHp + hpIncrease, newStats.hp);

        this.emit({
          type: "level-up",
          side: winnerSide,
          pokemon: participant.uid,
          newLevel: participant.level,
        });
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
    // Do NOT clear sidesNeedingSwitch here — self-switch moves (Shed Tail, Baton Pass, U-turn)
    // add their side during processEffectResult and that entry must be preserved through
    // the EoT phase. Only add additional sides for Pokemon that fainted during this turn.
    // Source: Showdown sim/battle.ts -- selfSwitch and fainted switches both go to switch-prompt
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

  /**
   * Look up the defender's selected move from the current turn's actions.
   * Used to populate `defenderSelectedMove` in MoveEffectContext for Sucker Punch.
   * Returns `null` if the defender isn't using a move action this turn.
   *
   * Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch checks target's selected move
   */
  private getDefenderSelectedMove(
    defenderSide: 0 | 1,
  ): { id: string; category: import("@pokemon-lib-ts/core").MoveCategory } | null {
    const defenderAction = this.currentTurnActions.find((a) => a.side === defenderSide);
    if (!defenderAction) return null;
    // Struggle is a damaging (physical) action — Sucker Punch should succeed against it.
    // Source: Showdown sim — Sucker Punch succeeds when target is using Struggle
    if (defenderAction.type === "struggle") {
      return { id: CORE_MOVE_IDS.struggle, category: CORE_MOVE_CATEGORIES.physical };
    }
    if (defenderAction.type !== "move") return null;
    const defenderActive = this.getActiveMutable(defenderSide);
    if (!defenderActive) return null;
    const moveSlot = defenderActive.pokemon.moves[defenderAction.moveIndex];
    if (!moveSlot) return null;
    try {
      const moveData = this.dataManager.getMove(moveSlot.moveId);
      return { id: moveData.id, category: moveData.category };
    } catch {
      this.emit({
        type: "engine-warning",
        message:
          `Move "${moveSlot.moveId}" not found while resolving defenderSelectedMove ` +
          `for Sucker Punch. Treating this as missing move data, not a switch action.`,
      });
      return null;
    }
  }

  private processHeldItemEndOfTurn(): void {
    if (!this.ruleset.hasHeldItems()) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      const itemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.endOfTurn, {
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
    opponentOrSide: ActivePokemon | (0 | 1),
    sideParam?: 0 | 1,
  ): void {
    // Support two call signatures:
    //   processItemResult(result, pokemon, side)             — no opponent needed
    //   processItemResult(result, pokemon, opponent, side)   — opponent available for targeted effects
    let side: 0 | 1;
    let opponent: ActivePokemon | null;
    if (typeof opponentOrSide === "number") {
      side = opponentOrSide as 0 | 1;
      opponent = null;
    } else {
      side = sideParam as 0 | 1;
      opponent = opponentOrSide;
    }

    const heldItemId = pokemon.pokemon.heldItem;

    for (const effect of result.effects) {
      switch (effect.type) {
        case BATTLE_ITEM_EFFECT_TYPES.heal: {
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
              source: BATTLE_SOURCE_IDS.heldItem,
            });
          }
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.statusCure: {
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
        case BATTLE_ITEM_EFFECT_TYPES.consume: {
          // Track consumed berry for Harvest ability (Gen 5+).
          // Source: Showdown data/abilities.ts -- harvest onResidual reads pokemon.lastItem
          // Berry IDs always end with "-berry" per Showdown convention.
          const consumedItemId = effect.value as string;
          if (consumedItemId?.endsWith("-berry")) {
            pokemon.volatileStatuses.set("harvest-berry", {
              turnsLeft: -1,
              data: { berryId: consumedItemId },
            });
          }
          pokemon.pokemon.heldItem = null;
          this.emit({
            type: "item-consumed",
            side,
            pokemon: getPokemonName(pokemon),
            item: consumedItemId,
          });
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.survive: {
          pokemon.pokemon.currentHp = Math.max(1, effect.value as number);
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.flinch: {
          const flinchTarget = opponent ?? this.getOpponentActive(side);
          if (flinchTarget) {
            flinchTarget.volatileStatuses.set(CORE_VOLATILE_IDS.flinch, { turnsLeft: 1 });
          }
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.volatileCure: {
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
        case BATTLE_ITEM_EFFECT_TYPES.statusInflict: {
          const statusToInflict = effect.value as PrimaryStatus;
          if (!pokemon.pokemon.status) {
            this.applyPrimaryStatus(pokemon, statusToInflict, side);
          }
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.inflictStatus: {
          // Typed variant: status field is a PrimaryStatus (Toxic Orb, Flame Orb)
          // Source: Showdown data/items.ts -- Toxic Orb / Flame Orb onResidual
          if (!pokemon.pokemon.status) {
            this.applyPrimaryStatus(pokemon, effect.status, side);
          }
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.chipDamage: {
          // Typed variant: chip damage with explicit target (Life Orb, Black Sludge, Sticky Barb, Rocky Helmet, Jaboca/Rowap Berry)
          // Source: Showdown data/items.ts -- various item onResidual / onDamagingHit
          const chipAmount = effect.value;
          const damagedPokemon =
            effect.target === BATTLE_EFFECT_TARGETS.opponent && opponent ? opponent : pokemon;
          const damagedSide: 0 | 1 =
            effect.target === BATTLE_EFFECT_TARGETS.opponent && opponent
              ? ((1 - side) as 0 | 1)
              : side;
          const maxHpChip =
            damagedPokemon.pokemon.calculatedStats?.hp ?? damagedPokemon.pokemon.currentHp;
          damagedPokemon.pokemon.currentHp = Math.max(
            0,
            damagedPokemon.pokemon.currentHp - chipAmount,
          );
          this.emit({
            type: "damage",
            side: damagedSide,
            pokemon: getPokemonName(damagedPokemon),
            amount: chipAmount,
            currentHp: damagedPokemon.pokemon.currentHp,
            maxHp: maxHpChip,
            source: BATTLE_SOURCE_IDS.heldItem,
          });
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.statBoost: {
          // Stage boost to the specified stat for the holder.
          // Uses effect.stages if present (e.g., Weakness Policy = +2), defaulting to +1.
          // Source: Showdown -- stat pinch berries (+1), Weakness Policy (+2) onEat/onDamagingHit
          const stat = effect.value as BattleStat;
          const boostStages = effect.stages ?? 1;
          const statStages = pokemon.statStages as Record<string, number>;
          if (stat in statStages) {
            const currentStage = statStages[stat] ?? 0;
            const newStage = Math.max(-6, Math.min(6, currentStage + boostStages));
            statStages[stat] = newStage;
            this.emit({
              type: "stat-change",
              side,
              pokemon: getPokemonName(pokemon),
              stat,
              stages: boostStages,
              currentStage: newStage,
            });
          }
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.selfDamage: {
          const amount = effect.value as number;
          // Respect effect.target: 'opponent' means damage the attacker (e.g., Rocky Helmet, Jaboca Berry)
          // Source: Showdown sim/battle-actions.ts — onDamagingHit item hooks damage the source
          const damagedPokemon =
            effect.target === BATTLE_EFFECT_TARGETS.opponent && opponent ? opponent : pokemon;
          const damagedSide: 0 | 1 =
            effect.target === BATTLE_EFFECT_TARGETS.opponent && opponent
              ? ((1 - side) as 0 | 1)
              : side;
          const maxHp =
            damagedPokemon.pokemon.calculatedStats?.hp ?? damagedPokemon.pokemon.currentHp;
          damagedPokemon.pokemon.currentHp = Math.max(0, damagedPokemon.pokemon.currentHp - amount);
          this.emit({
            type: "damage",
            side: damagedSide,
            pokemon: getPokemonName(damagedPokemon),
            amount,
            currentHp: damagedPokemon.pokemon.currentHp,
            maxHp,
            source: BATTLE_SOURCE_IDS.heldItem,
          });
          break;
        }
        case BATTLE_ITEM_EFFECT_TYPES.none:
          if (effect.value === BATTLE_ITEM_EFFECT_VALUES.forceSwitch) {
            const switchSide =
              effect.target === BATTLE_EFFECT_TARGETS.opponent && opponent
                ? ((1 - side) as 0 | 1)
                : side;
            this.performImmediateForcedSwitch(switchSide, { markSideAsPhased: true });
          }
          break;
        case BATTLE_ITEM_EFFECT_TYPES.speedBoost:
          // These effect types carry no immediate engine action here.
          // 'none' is used for force-switch and other engine-deferred behaviors.
          // 'speed-boost' is applied inline in item handlers.
          break;
      }
    }

    if (
      result.activated &&
      heldItemId &&
      !result.effects.some((effect) => effect.type === BATTLE_ITEM_EFFECT_TYPES.consume)
    ) {
      // Non-consuming activations surface as item-activate; consumed items already emit item-consumed.
      this.emit({
        type: "item-activate",
        side,
        pokemon: getPokemonName(pokemon),
        item: heldItemId,
      });
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
      ability: pokemon.ability ?? CORE_ABILITY_IDS.none,
    });

    // Process each effect
    for (const effect of result.effects) {
      switch (effect.effectType) {
        case BATTLE_ABILITY_EFFECT_TYPES.statChange: {
          // Apply stat change to the appropriate target
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
          const stat = effect.stat ?? CORE_STAT_IDS.attack;
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
        case BATTLE_ABILITY_EFFECT_TYPES.weatherSet: {
          // Set weather on the field
          if (effect.weather) {
            this.state.weather = {
              type: effect.weather,
              turnsLeft: effect.weatherTurns ?? -1,
              source: pokemon.ability ?? BATTLE_SOURCE_IDS.ability,
            };
            this.emit({
              type: "weather-set",
              weather: effect.weather,
              source: pokemon.ability ?? BATTLE_SOURCE_IDS.ability,
            });
            // Fire on-weather-change triggers (e.g., Forecast changes Castform's type)
            // Source: pret/pokeemerald — ABILITY_FORECAST re-evaluated after weather changes
            this.fireWeatherChangeAbilities();
          }
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.heal: {
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
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
              source: BATTLE_SOURCE_IDS.ability,
            });
          }
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.chipDamage: {
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
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
            source: BATTLE_SOURCE_IDS.ability,
          });
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.statusCure: {
          if (effect.target === BATTLE_EFFECT_TARGETS.ally) {
            // Ally-targeting status cure (e.g., Healer ability in doubles/triples).
            // Find an ally on the same side that has a status condition.
            // Source: Showdown data/abilities.ts -- healer: pokemon.adjacentAllies()
            const side = this.state.sides[pokemonSide];
            const ally = side.active.find(
              (a) => a && a !== pokemon && a.pokemon.currentHp > 0 && a.pokemon.status !== null,
            );
            if (ally) {
              const status = ally.pokemon.status;
              if (status) {
                ally.pokemon.status = null;
                this.emit({
                  type: "status-cure",
                  side: pokemonSide,
                  pokemon: getPokemonName(ally),
                  status,
                });
              }
            }
          } else {
            const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
            const targetSide =
              effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
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
          }
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.statusInflict: {
          // Source: Showdown — Static, Flame Body, Poison Point inflict status on contact
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
          if (!target.pokemon.status) {
            this.applyPrimaryStatus(target, effect.status, targetSide);
          }
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.volatileInflict: {
          // Source: Showdown — abilities that inflict volatile statuses (e.g., Cute Charm, Slow Start)
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
          if (!target.volatileStatuses.has(effect.volatile)) {
            // Terrain immunity check (e.g., Misty Terrain blocks confusion on grounded Pokemon).
            // Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile
            if (!this.ruleset.shouldBlockVolatile?.(effect.volatile, target, this.state)) {
              // Use turnsLeft from effect data if provided (e.g., Slow Start sets turnsLeft: 5),
              // otherwise default to -1 (permanent until explicitly removed).
              // Strip turnsLeft from the data payload to avoid storing it in two places —
              // the top-level counter is the single source of truth for the EoT decrement.
              const { turnsLeft: explicitTurnsLeft, ...volatileData } = effect.data ?? {};
              const turnsLeft = typeof explicitTurnsLeft === "number" ? explicitTurnsLeft : -1;
              target.volatileStatuses.set(effect.volatile, {
                turnsLeft,
                ...(Object.keys(volatileData).length > 0 ? { data: volatileData } : {}),
              });
              this.emit({
                type: "volatile-start",
                side: targetSide,
                pokemon: getPokemonName(target),
                volatile: effect.volatile,
              });
            }
          }
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.abilityChange: {
          // Ability swap effects (Trace, Skill Swap, etc.)
          // Source: Bulbapedia — various ability-swapping mechanics
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          target.ability = effect.newAbility;
          this.emit({
            type: "message",
            text: `${getPokemonName(target)}'s ability changed to ${effect.newAbility}!`,
          });
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.typeChange: {
          // Active type change (Multitype, Forecast, Color Change, etc.)
          // Source: Showdown — Multitype changes Arceus's type on switch-in based on Plate
          // Source: Bulbapedia — Multitype: "Changes Arceus's type and form to match its held Plate"
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
          target.types = [...effect.types];
          this.emit({
            type: "message",
            text: `${getPokemonName(target)}'s type changed!`,
          });
          // Suppress unused variable warning — targetSide is available for future event emission
          void targetSide;
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.volatileRemove: {
          // Remove a volatile status (e.g., Zen Mode reversion)
          // Source: Showdown — abilities that remove volatile statuses when conditions change
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          const targetSide =
            effect.target === BATTLE_EFFECT_TARGETS.self ? pokemonSide : opponentSide;
          if (target.volatileStatuses.has(effect.volatile)) {
            target.volatileStatuses.delete(effect.volatile);
            this.emit({
              type: "volatile-end",
              side: targetSide,
              pokemon: getPokemonName(target),
              volatile: effect.volatile,
            });
          }
          break;
        }
        case BATTLE_ABILITY_EFFECT_TYPES.itemRestore: {
          // Restore a previously consumed item (e.g., Harvest restoring a Berry)
          // Source: Showdown data/abilities.ts — harvest onResidual: restores lastItem
          const target = effect.target === BATTLE_EFFECT_TARGETS.self ? pokemon : opponent;
          if (!target.pokemon.heldItem) {
            target.pokemon.heldItem = effect.item;
            this.emit({
              type: "message",
              text: `${getPokemonName(target)} restored its ${effect.item}!`,
            });
          }
          break;
        }
        default:
          // damage-reduction is intentionally NOT processed here. It is a passive check
          // handled inline by the ruleset's calculateDamage() and ability trigger systems,
          // not a post-hoc engine effect. This is by design per the cardinal rule: the
          // engine delegates ALL gen-specific behavior to rulesets.
          break;
      }
    }

    // Emit messages
    for (const msg of result.messages) {
      this.emit({ type: "message", text: msg });
    }
  }

  /**
   * Fire "on-weather-change" ability triggers for all active Pokemon on both sides.
   * Called after any weather change (move-set weather, ability-set weather).
   *
   * Source: pret/pokeemerald src/battle_util.c — ABILITY_FORECAST checked after weather changes
   */
  private fireWeatherChangeAbilities(): void {
    if (!this.ruleset.hasAbilities()) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      const opponent = this.getOpponentActive(side.index);
      const result = this.ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onWeatherChange, {
        pokemon: active,
        opponent: opponent ?? undefined,
        state: this.state,
        rng: this.state.rng,
        trigger: CORE_ABILITY_TRIGGER_IDS.onWeatherChange,
      });
      if (result.activated) {
        this.processAbilityResult(result, active, opponent ?? active, side.index);
      }
    }
  }

  private processLeechSeedForSide(sideIndex: 0 | 1): void {
    const side = this.state.sides[sideIndex];
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) return;
    if (!active.volatileStatuses.has(CORE_VOLATILE_IDS.leechSeed)) return;

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
      source: BATTLE_SOURCE_IDS.leechSeed,
    });

    const opponentSide = sideIndex === 0 ? 1 : 0;
    const opponent = this.getActiveMutable(opponentSide);
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
          source: BATTLE_SOURCE_IDS.leechSeed,
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
      if (!active.volatileStatuses.has(CORE_VOLATILE_IDS.perishSong)) continue;

      // Source: GenerationRuleset.processPerishSong contract — the ruleset owns
      // Perish Song countdown semantics, so the engine delegates the mutation and
      // uses the returned state to drive messaging / faint handling.
      const perishResult = this.ruleset.processPerishSong(active);

      this.emit({
        type: "message",
        text: `${getPokemonName(active)}'s perish count fell to ${perishResult.newCount}!`,
      });

      if (perishResult.fainted) {
        active.pokemon.currentHp = 0;
        // Don't emit faint here — checkMidTurnFaints() handles it
      }
    }
  }

  private processCurseForSide(sideIndex: 0 | 1): void {
    const side = this.state.sides[sideIndex];
    const active = side.active[0];
    if (!active || active.pokemon.currentHp <= 0) return;
    if (!active.volatileStatuses.has(CORE_VOLATILE_IDS.curse)) return;

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
      source: BATTLE_SOURCE_IDS.curse,
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
    if (!active.volatileStatuses.has(CORE_VOLATILE_IDS.nightmare)) return;
    if (active.pokemon.status !== CORE_STATUS_IDS.sleep) return;

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
      source: BATTLE_SOURCE_IDS.nightmare,
    });
  }

  private processNightmare(): void {
    for (let i = 0; i < this.state.sides.length; i++) {
      this.processNightmareForSide(i as 0 | 1);
    }
  }

  private processSaltCureEoT(): void {
    // Salt Cure residual damage: 1/8 max HP per turn (1/4 for Water/Steel types).
    // Delegated to the gen ruleset's processSaltCureDamage() (optional — Gen 9 only).
    // Source: Showdown data/moves.ts -- Salt Cure onResidualOrder: 13
    if (!this.ruleset.processSaltCureDamage) return;
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      const damage = this.ruleset.processSaltCureDamage(active);
      if (damage <= 0) continue;
      const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
      // Source: Showdown sim/battle.ts -- residual damage subtracts HP before emitting event
      active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);
      this.emit({
        type: "damage",
        side: side.index,
        pokemon: getPokemonName(active),
        amount: damage,
        currentHp: active.pokemon.currentHp,
        maxHp,
        source: BATTLE_SOURCE_IDS.saltCure,
      });
    }
  }

  private processBindDamage(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has(CORE_VOLATILE_IDS.bound)) continue;

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
        source: BATTLE_SOURCE_IDS.bind,
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
      if (active.pokemon.status !== CORE_STATUS_IDS.freeze) continue;

      // Delegate to the ruleset — Gen 2 uses 25/256 EoT thaw with just-frozen guard;
      // Gen 1 always returns false; Gen 3+ always returns false (thaw is handled pre-move).
      if (this.ruleset.processEndOfTurnDefrost(active, this.state.rng)) {
        active.pokemon.status = null;
        this.emit({
          type: "status-cure",
          side: side.index,
          pokemon: getPokemonName(active),
          status: CORE_STATUS_IDS.freeze,
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
          type: "screen-end",
          side: side.index,
          screen: "safeguard",
        });
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
      if (active.pokemon.heldItem !== CORE_ITEM_IDS.mysteryBerry) continue;

      // Find the first move with 0 PP
      const moveSlot = active.pokemon.moves.find((m) => m.currentPP === 0 && m.moveId);
      if (!moveSlot) continue;

      // Restore 5 PP (or 1 for Sketch per decomp, but Sketch is edge-case)
      const restoreAmount = moveSlot.moveId === "sketch" ? 1 : 5;
      moveSlot.currentPP = Math.min(moveSlot.maxPP, moveSlot.currentPP + restoreAmount);
      active.pokemon.heldItem = null;
      this.emit({
        type: "item-consumed",
        side: side.index,
        pokemon: getPokemonName(active),
        item: CORE_ITEM_IDS.mysteryBerry,
      });
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
      const itemResult = this.ruleset.applyHeldItem(CORE_ITEM_TRIGGER_IDS.statBoostBetweenTurns, {
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
  private resolveEncoredMoveSlot(active: ActivePokemon, encoreData: unknown) {
    const moveIndex =
      typeof encoreData === "object" &&
      encoreData !== null &&
      "moveIndex" in encoreData &&
      typeof encoreData.moveIndex === "number"
        ? encoreData.moveIndex
        : undefined;
    if (moveIndex !== undefined) {
      return active.pokemon.moves[moveIndex];
    }

    const moveId =
      typeof encoreData === "object" &&
      encoreData !== null &&
      "moveId" in encoreData &&
      typeof encoreData.moveId === "string"
        ? encoreData.moveId
        : undefined;
    if (moveId === undefined) {
      return undefined;
    }

    return active.pokemon.moves.find((moveSlot) => moveSlot.moveId === moveId);
  }

  private processEncoreCountdown(): void {
    for (const side of this.state.sides) {
      const active = side.active[0];
      if (!active || active.pokemon.currentHp <= 0) continue;
      if (!active.volatileStatuses.has(CORE_VOLATILE_IDS.encore)) continue;

      const encoreState = active.volatileStatuses.get(CORE_VOLATILE_IDS.encore);
      if (!encoreState) continue;
      encoreState.turnsLeft--;

      // Check if encore should end: counter reached 0 or encored move has 0 PP
      let shouldEnd = encoreState.turnsLeft <= 0;
      if (!shouldEnd) {
        const moveSlot = this.resolveEncoredMoveSlot(active, encoreState.data);
        if (moveSlot && moveSlot.currentPP <= 0) {
          shouldEnd = true;
        }
      }

      if (shouldEnd) {
        active.volatileStatuses.delete(CORE_VOLATILE_IDS.encore);
        this.emit({
          type: "volatile-end",
          side: side.index,
          pokemon: getPokemonName(active),
          volatile: CORE_VOLATILE_IDS.encore,
        });
      }
    }
  }
}
