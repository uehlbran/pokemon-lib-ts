import type {
  AbilityTrigger,
  EntryHazardType,
  Generation,
  MoveData,
  NatureData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  StatBlock,
  TwoTurnMoveVolatile,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_SPECIES_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  calculateAllStats,
  calculateModifiedCatchRate,
  calculateShakeChecks,
  DataManager,
  GEN_NUMBERS,
  getStatStageMultiplier,
  validateEvs,
  validateFriendship,
  validateIvs,
} from "@pokemon-lib-ts/core";
import { BATTLE_EFFECT_TARGETS } from "../constants/effect-protocol";
import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  BagItemResult,
  BattleGimmick,
  CatchResult,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  ValidationResult,
  WeatherEffectResult,
} from "../context";
import { type BattleAction, isMoveLikeAction } from "../events/BattleAction";
import type { ActivePokemon, BattleSide } from "../state/BattleSide";
import type { BattleState } from "../state/BattleState";
import type {
  BattleGimmickType,
  ExpRecipient,
  ExpRecipientSelectionContext,
  GenerationRuleset,
  PreExecutionMoveFailure,
} from "./GenerationRuleset";
import { hasGoFirstItemActivated } from "./GoFirstItemActivation";

/**
 * Abstract base class implementing GenerationRuleset with Gen 6+/7+ defaults.
 * Gen 6-9 typically extend this directly; Gen 3-5 need to override some methods.
 * Gen 1-2 implement the interface directly (too mechanically different).
 */
const NATURES_BY_ID: ReadonlyMap<NatureData["id"], NatureData> = new Map(
  ALL_NATURES.map((nature) => [nature.id, nature] as const),
);

function createBaseMoveEffectResult(): MoveEffectResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}

function getActivePokemonSideIndex(state: BattleState, activePokemon: ActivePokemon): 0 | 1 | null {
  const sideIndex = state.sides.findIndex((side) =>
    side.active.some((candidate) => candidate?.pokemon === activePokemon.pokemon),
  );

  return sideIndex === 0 || sideIndex === 1 ? sideIndex : null;
}

function getStockpileState(activePokemon: ActivePokemon): {
  layers: number;
  defenseBoostsApplied: number;
  spDefenseBoostsApplied: number;
} | null {
  const stockpileState = activePokemon.volatileStatuses.get(CORE_VOLATILE_IDS.stockpile);
  if (!stockpileState) {
    return null;
  }

  const layers = Number(stockpileState.data?.layers ?? 1);
  const defenseBoostsApplied = Number(stockpileState.data?.defenseBoostsApplied ?? 0);
  const spDefenseBoostsApplied = Number(stockpileState.data?.spDefenseBoostsApplied ?? 0);
  return {
    layers,
    defenseBoostsApplied,
    spDefenseBoostsApplied,
  };
}

function getStockpileBoostDelta(currentStage: number): number {
  return currentStage < 6 ? 1 : 0;
}

export abstract class BaseRuleset implements GenerationRuleset {
  abstract readonly generation: Generation;
  abstract readonly name: string;

  protected readonly dataManager: DataManager;

  constructor(dataManager?: DataManager) {
    this.dataManager = dataManager ?? new DataManager();
  }

  abstract getTypeChart(): TypeChart;
  abstract getAvailableTypes(): readonly PokemonType[];

  /** Hardy nature (— no stat changes). Used as fallback for unknown nature ids. */
  private static readonly HARDY_NATURE: NatureData = {
    id: CORE_NATURE_IDS.hardy,
    displayName: "Hardy",
    increased: null,
    decreased: null,
    likedFlavor: null,
    dislikedFlavor: null,
  };

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    // Delegate to core calculateAllStats — single source of truth for Gen 3+ stat formula.
    // Source: pret/pokeemerald src/pokemon.c:2814 CALC_STAT macro + :2851 HP branch
    const nature = NATURES_BY_ID.get(pokemon.nature) ?? BaseRuleset.HARDY_NATURE;
    return calculateAllStats(pokemon, species, nature);
  }

  abstract calculateDamage(context: DamageContext): DamageResult;

  /**
   * Whether future attacks (Future Sight, Doom Desire) recalculate damage at hit time.
   * Default: false (Gen 2-4 behavior -- damage stored at use time).
   * Gen 5+ override to return true.
   *
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   */
  recalculatesFutureAttackDamage(): boolean {
    return false;
  }

  /**
   * Default: no moves bypass Protect via this mechanic.
   * Gen 7 overrides for Z-Moves; Gen 8 overrides for Max Moves.
   *
   * Source: Showdown sim/battle-actions.ts -- Z-Moves/Max Moves bypass Protect at 0.25x
   */
  canBypassProtect(
    _move: MoveData,
    _actor: ActivePokemon,
    _activeVolatile: "protect" | "max-guard",
  ): boolean {
    return false;
  }

  // Gen 6+ default; Gen 3-5 use a 2-stage table with 1/16 and 1/8 rates
  getCritRateTable(): readonly number[] {
    // Gen 6+: 1/24, 1/8, 1/2, 1/1
    return [24, 8, 2, 1];
  }

  // Gen 6+ default (1.5x); Gen 3-5 must override (2.0x)
  getCritMultiplier(): number {
    // Gen 6+: 1.5x
    return 1.5;
  }

  rollCritical(context: CritContext): boolean {
    const { attacker, move, rng } = context;
    const table = this.getCritRateTable();
    let stage = 0;

    // Focus Energy: +2 stages
    // Source: Showdown sim/battle-actions.ts getMoveHit crit stage calc
    if (attacker.volatileStatuses.has(CORE_VOLATILE_IDS.focusEnergy)) stage += 2;

    // High crit-ratio move: from move data (e.g., Slash, Crabhammer = critRatio 1)
    // Source: Showdown sim/battle-actions.ts — move.critRatio adds to crit stage
    if (move.critRatio && move.critRatio > 0) stage += move.critRatio;

    // Held item bonuses
    // Source: Showdown sim/battle-actions.ts — item crit stage modifiers
    const item = attacker.pokemon.heldItem;
    if (item === CORE_ITEM_IDS.scopeLens || item === CORE_ITEM_IDS.razorClaw) stage += 1;
    if (
      (item === CORE_ITEM_IDS.leek || item === CORE_ITEM_IDS.stick) &&
      (attacker.pokemon.speciesId === CORE_SPECIES_IDS.farfetchd ||
        attacker.pokemon.speciesId === CORE_SPECIES_IDS.sirfetchd)
    ) {
      stage += 2;
    }
    if (
      item === CORE_ITEM_IDS.luckyPunch &&
      attacker.pokemon.speciesId === CORE_SPECIES_IDS.chansey
    ) {
      stage += 2;
    }

    // Ability: Super Luck (+1 stage)
    // Source: Showdown sim/battle-actions.ts — Super Luck ability crit bonus
    if (attacker.ability === CORE_ABILITY_IDS.superLuck) stage += 1;

    stage = Math.min(stage, table.length - 1);
    const rate = table[stage];
    if (rate === undefined) return false;
    return rate <= 1 || rng.int(1, rate) === 1;
  }

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    // Pre-assign one tiebreak key per action BEFORE sorting to ensure deterministic
    // PRNG consumption. V8's sort algorithm calls comparators a non-deterministic number
    // of times, so consuming rng inside the comparator breaks replay determinism.
    // Fix: consume exactly N rng.next() calls upfront, then use keys in comparator.
    // Source: GitHub issue #120

    // Allow subclasses (Gen 3+) to pre-roll "go first" items (Quick Claw, etc.) before
    // tiebreak keys are assigned, preserving PRNG consumption order.
    const quickClawActivated = this.getQuickClawActivated(actions, state, rng);

    const tagged = actions.map((action, idx) => ({ action, idx, tiebreak: rng.next() }));

    tagged.sort((a, b) => {
      const actionA = a.action;
      const actionB = b.action;

      // Switches always go first
      if (actionA.type === "switch" && actionB.type !== "switch") return -1;
      if (actionB.type === "switch" && actionA.type !== "switch") return 1;

      // Item usage goes before move-like combat actions
      if (actionA.type === "item" && isMoveLikeAction(actionB)) return -1;
      if (actionB.type === "item" && isMoveLikeAction(actionA)) return 1;

      // Run goes before move-like combat actions
      if (actionA.type === "run" && isMoveLikeAction(actionB)) return -1;
      if (actionB.type === "run" && isMoveLikeAction(actionA)) return 1;

      // For move-like combat actions, compare priority then speed.
      // Recharge occupies the user's normal combat slot even though it does not execute move data.
      if (isMoveLikeAction(actionA) && isMoveLikeAction(actionB)) {
        const sideA = state.sides[actionA.side];
        const sideB = state.sides[actionB.side];
        const activeA = sideA?.active[0];
        const activeB = sideB?.active[0];
        if (!activeA || !activeB) return 0;

        let priorityA = 0;
        let priorityB = 0;
        let moveDataA: MoveData | undefined;
        let moveDataB: MoveData | undefined;

        if (actionA.type === "move") {
          const moveSlotA = activeA.pokemon.moves[actionA.moveIndex];
          if (!moveSlotA) return 0;
          try {
            moveDataA = this.dataManager.getMove(moveSlotA.moveId);
            priorityA = moveDataA.priority;
          } catch {
            /* default 0 */
          }
        }

        if (actionB.type === "move") {
          const moveSlotB = activeB.pokemon.moves[actionB.moveIndex];
          if (!moveSlotB) return 0;
          try {
            moveDataB = this.dataManager.getMove(moveSlotB.moveId);
            priorityB = moveDataB.priority;
          } catch {
            /* default 0 */
          }
        }

        // Ability-based priority boosts (Prankster, Gale Wings, Triage, etc.)
        // Source: Showdown sim/battle.ts -- getActionSpeed computes effective priority
        //   including ability boosts via onModifyPriority
        if (this.hasAbilities()) {
          if (activeA.ability && moveDataA) {
            priorityA += this.getAbilityPriorityBoost(activeA, moveDataA, state);
          }
          if (activeB.ability && moveDataB) {
            priorityB += this.getAbilityPriorityBoost(activeB, moveDataB, state);
          }
        }

        if (priorityA !== priorityB) return priorityB - priorityA; // higher priority first

        // Quick Claw / go-first item: activated holders go first within same priority bracket
        const qcA = actionA.type === "move" && quickClawActivated.has(a.idx);
        const qcB = actionB.type === "move" && quickClawActivated.has(b.idx);
        if (qcA && !qcB) return -1;
        if (qcB && !qcA) return 1;

        // Speed tiebreak
        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);
        if (state.trickRoom.active) {
          if (speedA !== speedB) return speedA - speedB;
        } else {
          if (speedA !== speedB) return speedB - speedA;
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      // Deterministic tiebreak (non-move vs non-move of same type)
      return a.tiebreak < b.tiebreak ? -1 : 1;
    });

    return tagged.map((t) => t.action);
  }

  /**
   * Hook for subclasses to pre-roll "go first" item effects (Quick Claw, etc.)
   * before tiebreak keys are assigned in resolveTurnOrder.
   *
   * Called with the PRNG object so subclasses consume their RNG calls BEFORE
   * the tiebreak rng.next() calls, preserving PRNG consumption order.
   *
   * Returns a Set of action indices that have a "go first" item activated.
   * Default: honor move actions that the engine marked during the pre-turn held-item pass.
   * Generations with custom pre-roll mechanics can still override this hook.
   *
   * Source: pret/pokeemerald HOLD_EFFECT_QUICK_CLAW — Gen 3 Quick Claw pre-roll
   */
  protected getQuickClawActivated(
    actions: BattleAction[],
    _state: BattleState,
    _rng: SeededRandom,
  ): Set<number> {
    return new Set(
      actions.flatMap((action, index) => (hasGoFirstItemActivated(action) ? [index] : [])),
    );
  }

  /**
   * Calculate the ability-based priority boost for a Pokemon's move.
   *
   * Calls `applyAbility("on-priority-check", ...)` and returns the `priorityBoost`
   * from the result. Subclasses can override for gen-specific behavior.
   *
   * Default behavior: returns `result.priorityBoost` if the ability activated, else 0.
   *
   * Source: Showdown sim/battle.ts -- getActionSpeed calls onModifyPriority
   */
  protected getAbilityPriorityBoost(
    active: ActivePokemon,
    moveData: MoveData,
    state: BattleState,
  ): number {
    const result = this.applyAbility(CORE_ABILITY_TRIGGER_IDS.onPriorityCheck, {
      pokemon: active,
      state,
      rng: state.rng,
      trigger: CORE_ABILITY_TRIGGER_IDS.onPriorityCheck,
      move: moveData,
    });
    if (!result.activated) return 0;
    return result.priorityBoost ?? 0;
  }

  doesMoveHit(context: AccuracyContext): boolean {
    // Never-miss moves (accuracy === null)
    if (context.move.accuracy === null) return true;

    const accuracy = context.move.accuracy;
    const accStage = context.attacker.statStages.accuracy;
    const evaStage = context.defender.statStages.evasion;
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    let multiplier: number;
    if (netStage >= 0) {
      multiplier = (3 + netStage) / 3;
    } else {
      multiplier = 3 / (3 - netStage);
    }

    const finalAccuracy = Math.floor(accuracy * multiplier);
    return context.rng.int(1, 100) <= finalAccuracy;
  }

  executePreDamageMoveEffect(_context: MoveEffectContext): MoveEffectResult | null {
    return null;
  }

  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const attackerName = context.attacker?.pokemon.nickname ?? "The Pokemon";
    const defenderName = context.defender?.pokemon.nickname ?? "The target";

    switch (context.move?.id) {
      case CORE_MOVE_IDS.aquaRing:
        if (context.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.aquaRing)) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }
        return {
          ...createBaseMoveEffectResult(),
          selfVolatileInflicted: CORE_VOLATILE_IDS.aquaRing,
          messages: [`${attackerName} surrounded itself with a veil of water!`],
        };
      case CORE_MOVE_IDS.ingrain:
        if (context.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.ingrain)) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }
        return {
          ...createBaseMoveEffectResult(),
          selfVolatileInflicted: CORE_VOLATILE_IDS.ingrain,
          messages: [`${attackerName} planted its roots!`],
        };
      case CORE_MOVE_IDS.embargo:
        if (context.defender.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }
        return {
          ...createBaseMoveEffectResult(),
          volatileInflicted: CORE_VOLATILE_IDS.embargo,
          volatileData: { turnsLeft: 5 },
          messages: [`${defenderName} can't use items!`],
        };
      case CORE_MOVE_IDS.healBlock:
        if (context.defender.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }
        return {
          ...createBaseMoveEffectResult(),
          volatileInflicted: CORE_VOLATILE_IDS.healBlock,
          volatileData: { turnsLeft: 5 },
          messages: [`${defenderName} was prevented from healing!`],
        };
      case CORE_MOVE_IDS.stockpile: {
        const existingStockpile = getStockpileState(context.attacker);
        if (existingStockpile && existingStockpile.layers >= 3) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }

        const defenseBoostDelta = getStockpileBoostDelta(context.attacker.statStages.defense);
        const spDefenseBoostDelta = getStockpileBoostDelta(context.attacker.statStages.spDefense);
        const nextLayers = (existingStockpile?.layers ?? 0) + 1;
        const nextState = {
          layers: nextLayers,
          defenseBoostsApplied: (existingStockpile?.defenseBoostsApplied ?? 0) + defenseBoostDelta,
          spDefenseBoostsApplied:
            (existingStockpile?.spDefenseBoostsApplied ?? 0) + spDefenseBoostDelta,
        };

        if (existingStockpile) {
          context.attacker.volatileStatuses.set(CORE_VOLATILE_IDS.stockpile, {
            turnsLeft: -1,
            data: nextState,
          });
          return {
            ...createBaseMoveEffectResult(),
            statChanges: [
              ...(defenseBoostDelta > 0
                ? [
                    {
                      target: BATTLE_EFFECT_TARGETS.attacker,
                      stat: CORE_STAT_IDS.defense,
                      stages: 1,
                    },
                  ]
                : []),
              ...(spDefenseBoostDelta > 0
                ? [
                    {
                      target: BATTLE_EFFECT_TARGETS.attacker,
                      stat: CORE_STAT_IDS.spDefense,
                      stages: 1,
                    },
                  ]
                : []),
            ],
            messages: [`${attackerName} stockpiled ${nextLayers}!`],
          };
        }

        return {
          ...createBaseMoveEffectResult(),
          selfVolatileInflicted: CORE_VOLATILE_IDS.stockpile,
          selfVolatileData: { turnsLeft: -1, data: nextState },
          statChanges: [
            ...(defenseBoostDelta > 0
              ? [{ target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.defense, stages: 1 }]
              : []),
            ...(spDefenseBoostDelta > 0
              ? [
                  {
                    target: BATTLE_EFFECT_TARGETS.attacker,
                    stat: CORE_STAT_IDS.spDefense,
                    stages: 1,
                  },
                ]
              : []),
          ],
          messages: [`${attackerName} stockpiled 1!`],
        };
      }
      case CORE_MOVE_IDS.spitUp: {
        const stockpileState = getStockpileState(context.attacker);
        if (!stockpileState) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }

        return {
          ...createBaseMoveEffectResult(),
          volatilesToClear: [
            {
              target: BATTLE_EFFECT_TARGETS.attacker,
              volatile: CORE_VOLATILE_IDS.stockpile,
            },
          ],
          statChanges: [
            ...(stockpileState.defenseBoostsApplied > 0
              ? [
                  {
                    target: BATTLE_EFFECT_TARGETS.attacker,
                    stat: CORE_STAT_IDS.defense,
                    stages: -stockpileState.defenseBoostsApplied,
                  },
                ]
              : []),
            ...(stockpileState.spDefenseBoostsApplied > 0
              ? [
                  {
                    target: BATTLE_EFFECT_TARGETS.attacker,
                    stat: CORE_STAT_IDS.spDefense,
                    stages: -stockpileState.spDefenseBoostsApplied,
                  },
                ]
              : []),
          ],
          messages: [`${attackerName} unleashed its stockpiled power!`],
        };
      }
      case CORE_MOVE_IDS.swallow: {
        const stockpileState = getStockpileState(context.attacker);
        if (!stockpileState) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }

        const maxHp =
          context.attacker.pokemon.calculatedStats?.hp ?? context.attacker.pokemon.currentHp;
        // Source: Showdown data/moves.ts — Swallow heals 1/4, 1/2, or full HP
        // for Stockpile layers 1, 2, and 3 respectively.
        const healFractions = [0.25, 0.5, 1];
        const healFraction = healFractions[stockpileState.layers - 1] ?? 1;

        return {
          ...createBaseMoveEffectResult(),
          volatilesToClear: [
            {
              target: BATTLE_EFFECT_TARGETS.attacker,
              volatile: CORE_VOLATILE_IDS.stockpile,
            },
          ],
          healAmount: Math.floor(maxHp * healFraction),
          statChanges: [
            ...(stockpileState.defenseBoostsApplied > 0
              ? [
                  {
                    target: BATTLE_EFFECT_TARGETS.attacker,
                    stat: CORE_STAT_IDS.defense,
                    stages: -stockpileState.defenseBoostsApplied,
                  },
                ]
              : []),
            ...(stockpileState.spDefenseBoostsApplied > 0
              ? [
                  {
                    target: BATTLE_EFFECT_TARGETS.attacker,
                    stat: CORE_STAT_IDS.spDefense,
                    stages: -stockpileState.spDefenseBoostsApplied,
                  },
                ]
              : []),
          ],
          messages: [`${attackerName} swallowed its stockpile!`],
        };
      }
      case CORE_MOVE_IDS.batonPass:
        return {
          ...createBaseMoveEffectResult(),
          switchOut: true,
          batonPass: true,
          messages: [`${attackerName} baton passed!`],
        };
      case CORE_MOVE_IDS.powerTrick:
        if (context.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.powerTrick)) {
          context.attacker.volatileStatuses.delete(CORE_VOLATILE_IDS.powerTrick);
          return {
            ...createBaseMoveEffectResult(),
            messages: [`${attackerName} switched its power back!`],
          };
        }
        return {
          ...createBaseMoveEffectResult(),
          selfVolatileInflicted: CORE_VOLATILE_IDS.powerTrick,
          messages: [`${attackerName} switched its Attack and Defense!`],
        };
      case CORE_MOVE_IDS.recycle:
        if (context.attacker.pokemon.heldItem || !context.attacker.pokemon.lastItem) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }
        context.attacker.pokemon.heldItem = context.attacker.pokemon.lastItem;
        context.attacker.pokemon.lastItem = null;
        return {
          ...createBaseMoveEffectResult(),
          messages: [`${attackerName} recycled its ${context.attacker.pokemon.heldItem}!`],
        };
      case CORE_MOVE_IDS.belch:
        if (!context.attacker.pokemon.ateBerry) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }
        return createBaseMoveEffectResult();
      case CORE_MOVE_IDS.futureSight:
      case CORE_MOVE_IDS.doomDesire: {
        const attackerSideIndex = getActivePokemonSideIndex(context.state, context.attacker);
        if (attackerSideIndex === null) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }

        const targetSideIndex = attackerSideIndex === 0 ? 1 : 0;
        if (context.state.sides[targetSideIndex].futureAttack) {
          return { ...createBaseMoveEffectResult(), messages: ["But it failed!"] };
        }

        const message =
          context.move.id === CORE_MOVE_IDS.futureSight
            ? `${attackerName} foresaw an attack!`
            : `${attackerName} chose Doom Desire as its destiny!`;

        return {
          ...createBaseMoveEffectResult(),
          futureAttack: {
            moveId: context.move.id,
            turnsLeft: 3,
            sourceSide: attackerSideIndex,
          },
          messages: [message],
        };
      }
      default:
        return createBaseMoveEffectResult();
    }
  }

  getPreExecutionMoveFailure(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    move: MoveData,
    state: BattleState,
  ): PreExecutionMoveFailure | null {
    switch (move.id) {
      case CORE_MOVE_IDS.belch:
        if (!attacker.pokemon.ateBerry) {
          return { reason: "Requires a Berry to be eaten", messages: ["But it failed!"] };
        }
        break;
      case CORE_MOVE_IDS.recycle:
        if (attacker.pokemon.heldItem) {
          return { reason: "Already holding an item", messages: ["But it failed!"] };
        }
        if (!attacker.pokemon.lastItem) {
          return { reason: "No recyclable item", messages: ["But it failed!"] };
        }
        break;
      case CORE_MOVE_IDS.spitUp:
      case CORE_MOVE_IDS.swallow:
        if (!attacker.volatileStatuses.has(CORE_VOLATILE_IDS.stockpile)) {
          return { reason: "No stockpiled energy", messages: ["But it failed!"] };
        }
        break;
      default:
        break;
    }

    const naturalPriority = move.priority ?? 0;
    if (naturalPriority > 0 && this.shouldBlockPriorityMove(attacker, move, defender, state)) {
      return { reason: "blocked by terrain" };
    }

    return null;
  }

  /**
   * Terrain-priority interaction hook (Psychic Terrain).
   *
   * Gen 3-6: no priority-move blocking from terrain.
   * Gen 7+: override in gen rulesets to block when terrain is active.
   */
  shouldBlockPriorityMove(
    _actor: ActivePokemon,
    _move: MoveData,
    _defender: ActivePokemon,
    _state: BattleState,
  ): boolean {
    return false;
  }

  /**
   * Default: no moves can hit a semi-invulnerable target.
   * The caller may still pass the generic `"charging"` marker for two-turn moves
   * that are targetable; Gen 3+ rulesets override this hook and return true there.
   * Gen 3+ rulesets override to allow specific moves (e.g., Thunder hits flying).
   * Source: Showdown sim/battle-actions.ts — semi-invulnerable immunity checks
   */
  canHitSemiInvulnerable(_moveId: string, _volatile: TwoTurnMoveVolatile): boolean {
    return false;
  }

  /**
   * PP cost is 2 when the defender has Pressure, 1 otherwise.
   * Pressure was introduced in Gen 3 and applies to all Gen 3+ rulesets.
   * Source: pret/pokeemerald — ABILITY_PRESSURE deducts 2 PP per move use
   * Source: Showdown sim/battle.ts — ABILITY_PRESSURE check in deductPP
   */
  getPPCost(_actor: ActivePokemon, defender: ActivePokemon | null, _state: BattleState): number {
    return defender?.ability === CORE_ABILITY_IDS.pressure ? 2 : 1;
  }

  /**
   * Handle effects when a move misses.
   * Explosion/Self-Destruct: user faints even on miss (all gens).
   *
   * Source: pret/pokered engine/battle/core.asm — actor faints regardless of hit/miss
   * Source: pret/pokeemerald — Self-Destruct/Explosion: user always faints even on miss
   */
  onMoveMiss(actor: ActivePokemon, move: MoveData, _state: BattleState): void {
    if (
      move.effect?.type === "custom" &&
      (move.effect.handler === "explosion" || move.effect.handler === "self-destruct")
    ) {
      actor.pokemon.currentHp = 0;
    }
  }

  onDamageReceived(
    _defender: ActivePokemon,
    _damage: number,
    _move: MoveData,
    _state: BattleState,
  ): void {
    // No-op — Gen 3+ rulesets override if they need reactive damage triggers.
    // Source: pret/pokered — Rage and Bide are Gen 1 only in base form
  }

  /**
   * Default: no move reflection. Gen 5+ overrides to check for Magic Bounce.
   *
   * Source: Showdown data/abilities.ts -- magicbounce only exists from Gen 5
   */
  shouldReflectMove(
    _move: MoveData,
    _attacker: ActivePokemon,
    _defender: ActivePokemon,
    _state: BattleState,
  ): { reflected: true; messages: string[] } | null {
    return null;
  }

  // Burn: Gen 7+ default (1/16 max HP); Gen 3-6 must override (1/8 max HP)
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, _state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    switch (status) {
      case CORE_STATUS_IDS.burn:
        // Gen 7+: 1/16 max HP
        return Math.max(1, Math.floor(maxHp / 16));
      case CORE_STATUS_IDS.poison:
        return Math.max(1, Math.floor(maxHp / 8));
      case CORE_STATUS_IDS.badlyPoisoned: {
        // Escalating: 1/16, 2/16, 3/16... per turn, tracked via toxic-counter volatile
        const toxicState = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.toxicCounter);
        const counter = (toxicState?.data?.counter as number) ?? 1;
        const damage = Math.max(1, Math.floor((maxHp * counter) / 16));
        if (toxicState) {
          if (!toxicState.data) {
            toxicState.data = { counter: counter + 1 };
          } else {
            (toxicState.data as Record<string, unknown>).counter = counter + 1;
          }
        }
        return damage;
      }
      default:
        return 0;
    }
  }

  // Gen 3+ default (20% thaw pre-move); Gen 2 overrides to always return false
  checkFreezeThaw(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 3+: 20% chance to thaw each turn (checked pre-move, not EoT)
    return rng.chance(0.2);
  }

  // Gen 3+ never thaw via EoT (handled pre-move by checkFreezeThaw); Gen 2 overrides this
  processEndOfTurnDefrost(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    return false;
  }

  // Gen 5+ default (1-3 turns); Gen 3-4 must override (2-5 turns)
  rollSleepTurns(rng: SeededRandom): number {
    // Gen 5+: 1-3 turns
    return rng.int(1, 3);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 3+: exact 25% chance to be fully paralyzed
    return rng.chance(0.25);
  }

  // Gen 3-6 default (50% self-hit); Gen 7+ must override (33%)
  rollConfusionSelfHit(rng: SeededRandom): boolean {
    // Gen 1-6: 50% chance to hit itself in confusion
    return rng.chance(0.5);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Look up the sleep counter in volatile statuses
    const sleepState = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter);
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // No counter found or already at 0 — wake up
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.sleepCounter);
      return true; // Can act this turn (Gen 2+ behavior)
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      // Just reached 0 — wake up, can act this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete(CORE_VOLATILE_IDS.sleepCounter);
      return true;
    }
    return false; // Still sleeping
  }

  hasAbilities(): boolean {
    return true;
  }

  applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return { activated: false, effects: [], messages: [] };
  }

  hasHeldItems(): boolean {
    return true;
  }

  applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return { activated: false, effects: [], messages: [] };
  }

  canUseBagItems(): boolean {
    return true;
  }

  /**
   * Apply a bag item (Potion, Antidote, X Attack, Revive, etc.) to a target Pokemon.
   *
   * Bag items are generation-invariant in their effects — a Super Potion always heals 50 HP,
   * an X Attack always boosts Attack by +2. Poke Ball mechanics are deferred to per-gen rulesets.
   *
   * Source: Bulbapedia "Potion" / "X Attack" etc. — item effects are consistent across all gens.
   */
  applyBagItem(itemId: string, target: ActivePokemon, _state: BattleState): BagItemResult {
    const pokemon = target.pokemon;
    const messages: string[] = [];
    const name = pokemon.nickname ?? `species#${pokemon.speciesId}`;

    // Normalize item ID: strip hyphens and lowercase for matching
    // This handles alternate IDs like "full-restore" → "fullrestore", "parlyz-heal" → "parlyzheal"
    const normalizedId = itemId.replace(/-/g, "").toLowerCase();

    // ─── Healing items ────────────────────────────────────────────────────────
    const healAmounts: Record<string, number | "full"> = {
      potion: 20,
      superpotion: 50,
      hyperpotion: 120,
      maxpotion: "full",
      fullrestore: "full",
    };

    const healVal = healAmounts[normalizedId];
    if (healVal !== undefined) {
      const maxHp = pokemon.calculatedStats?.hp ?? pokemon.currentHp;
      const currentHp = pokemon.currentHp;

      // Cannot use healing items on fainted Pokemon (use Revive instead)
      if (currentHp <= 0) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      const healAmount =
        healVal === "full" ? maxHp - currentHp : Math.min(healVal as number, maxHp - currentHp);

      if (healAmount <= 0) {
        messages.push(`${name}'s HP is already full!`);
        return { activated: false, messages };
      }

      messages.push(`${name} recovered ${healAmount} HP!`);

      // Full Restore also cures status
      if (normalizedId === "fullrestore" && pokemon.status) {
        const curedStatus = pokemon.status;
        messages.push(`${name}'s ${curedStatus} was cured!`);
        return { activated: true, healAmount, statusCured: curedStatus, messages };
      }

      return { activated: true, healAmount, messages };
    }

    // ─── Status cure items ────────────────────────────────────────────────────
    const statusCures: Record<string, PrimaryStatus | "any"> = {
      antidote: CORE_STATUS_IDS.poison,
      burnheal: CORE_STATUS_IDS.burn,
      iceheal: CORE_STATUS_IDS.freeze,
      awakening: CORE_STATUS_IDS.sleep,
      paralyzeheal: CORE_STATUS_IDS.paralysis,
      parlyzheal: CORE_STATUS_IDS.paralysis,
      fullheal: "any",
    };

    const cureTarget = statusCures[normalizedId];
    if (cureTarget !== undefined) {
      if (!pokemon.status) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      // Check if the item cures this specific status
      const cures =
        cureTarget === "any" ||
        pokemon.status === cureTarget ||
        // Antidote cures both poison and badly-poisoned
        (cureTarget === CORE_STATUS_IDS.poison && pokemon.status === CORE_STATUS_IDS.badlyPoisoned);

      if (!cures) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      messages.push(`${name}'s ${pokemon.status} was cured!`);
      return { activated: true, statusCured: pokemon.status, messages };
    }

    // ─── Revive items ─────────────────────────────────────────────────────────
    if (normalizedId === "revive" || normalizedId === "maxrevive") {
      if (pokemon.currentHp > 0) {
        messages.push("It won't have any effect.");
        return { activated: false, messages };
      }

      const maxHp = pokemon.calculatedStats?.hp ?? 1;
      const reviveHp = normalizedId === "maxrevive" ? maxHp : Math.floor(maxHp / 2);
      messages.push(`${name} was revived!`);
      return { activated: true, revived: true, healAmount: reviveHp, messages };
    }

    // ─── Stat boost items (X items: +2 stages, capped at +6) ─────────────────
    // Source: Bulbapedia "X Attack" etc. — Gen 7+ X items raise stat by 2 stages
    const statBoosts: Record<string, import("@pokemon-lib-ts/core").BattleStat> = {
      xattack: CORE_STAT_IDS.attack,
      xdefense: CORE_STAT_IDS.defense,
      xdefend: CORE_STAT_IDS.defense,
      xspatk: CORE_STAT_IDS.spAttack,
      xspecial: CORE_STAT_IDS.spAttack,
      xspdef: CORE_STAT_IDS.spDefense,
      xspeed: CORE_STAT_IDS.speed,
      xaccuracy: CORE_STAT_IDS.accuracy,
    };

    const boostStat = statBoosts[normalizedId];
    if (boostStat !== undefined) {
      const currentStage = target.statStages[boostStat] ?? 0;

      if (currentStage >= 6) {
        messages.push(`${name}'s ${boostStat} won't go higher!`);
        return { activated: false, messages };
      }

      messages.push(`${name}'s ${boostStat} rose sharply!`);
      return { activated: true, statChange: { stat: boostStat, stages: 2 }, messages };
    }

    // ─── Unknown item ─────────────────────────────────────────────────────────
    messages.push("It had no effect.");
    return { activated: false, messages };
  }

  hasWeather(): boolean {
    return true;
  }

  applyWeatherEffects(_state: BattleState): WeatherEffectResult[] {
    return [];
  }

  hasTerrain(): boolean {
    return false;
  }

  applyTerrainEffects(_state: BattleState): TerrainEffectResult[] {
    return [];
  }

  // Gen 4-5 defaults (spikes, stealth-rock, toxic-spikes); Gen 3 must override (spikes only); Gen 6+ must override (add sticky-web)
  getAvailableHazards(): readonly EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes"];
  }

  applyEntryHazards(
    _pokemon: ActivePokemon,
    _side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
    return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
  }

  getMaxHazardLayers(hazardType: EntryHazardType): number {
    // Source: Showdown data/moves.ts — spikes max 3 layers, toxic-spikes max 2, others max 1
    if (hazardType === "spikes") return 3;
    if (hazardType === "toxic-spikes") return 2;
    return 1;
  }

  calculateExpGain(context: ExpContext): number {
    // Simplified Gen 5+ scaled formula (default fallback for gens not overriding this method)
    const baseExp = context.defeatedSpecies.baseExp;
    const a = context.isTrainerBattle ? 1.5 : 1;
    const b = baseExp;
    const l = context.defeatedLevel;
    const s = context.participantCount;
    const p = context.hasLuckyEgg ? 1.5 : 1;

    let exp = Math.floor(((a * b * l) / (5 * s)) * p);

    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9984
    //   traded EXP bonus: same language → 1.5×, international → 1.7×
    if (context.isTradedPokemon) {
      const tradedMultiplier = context.isInternationalTrade ? 1.7 : 1.5;
      exp = Math.floor(exp * tradedMultiplier);
    }

    return exp;
  }

  getExpRecipients(context: ExpRecipientSelectionContext): readonly ExpRecipient[] {
    const usesHeldExpShare =
      this.generation >= GEN_NUMBERS.gen2 && this.generation <= GEN_NUMBERS.gen5;
    const hasAlwaysOnExpShare = this.generation >= GEN_NUMBERS.gen6;
    const recipients: ExpRecipient[] = [];

    for (const pokemon of context.winnerTeam) {
      if (pokemon.currentHp <= 0) continue;

      const isParticipant = context.livingParticipantUids.has(pokemon.uid);
      if (isParticipant) {
        recipients.push({ pokemon, hasExpShare: false });
        continue;
      }

      if (hasAlwaysOnExpShare) {
        recipients.push({ pokemon, hasExpShare: true });
        continue;
      }

      if (usesHeldExpShare && pokemon.heldItem === CORE_ITEM_IDS.expShare) {
        recipients.push({ pokemon, hasExpShare: true });
      }
    }

    return recipients;
  }

  getBattleGimmick(_type: BattleGimmickType): BattleGimmick | null {
    return null;
  }

  private static appendValidationMessages(
    errors: string[],
    validation: { readonly failures: readonly { readonly message: string }[] },
  ): void {
    for (const failure of validation.failures) {
      errors.push(failure.message);
    }
  }

  private validateKnownSpecies(
    pokemon: PokemonInstance,
    species: PokemonSpeciesData,
    errors: string[],
  ): void {
    try {
      this.dataManager.getSpecies(species.id);
    } catch {
      errors.push(
        `Species #${species.id} (${species.displayName}) is not available in Gen ${this.generation}`,
      );
      return;
    }

    if (typeof pokemon.speciesId === "number" && pokemon.speciesId !== species.id) {
      errors.push(
        `Pokemon species id ${pokemon.speciesId} does not match provided species ${species.displayName} (#${species.id})`,
      );
    }
  }

  private validateKnownMove(moveId: string, errors: string[]): void {
    try {
      this.dataManager.getMove(moveId);
    } catch {
      errors.push(`Move "${moveId}" is not available in Gen ${this.generation}`);
    }
  }

  private validateKnownItem(itemId: string, errors: string[]): void {
    try {
      this.dataManager.getItem(itemId);
    } catch {
      errors.push(`Item "${itemId}" is not available in Gen ${this.generation}`);
    }
  }

  private validateKnownAbility(abilityId: string, errors: string[]): void {
    try {
      this.dataManager.getAbility(abilityId);
    } catch {
      errors.push(`Ability "${abilityId}" is not available in Gen ${this.generation}`);
    }
  }

  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult {
    const errors: string[] = [];

    if (pokemon.level < 1 || pokemon.level > 100) {
      errors.push(`Level must be between 1 and 100, got ${pokemon.level}`);
    }

    if (pokemon.moves.length < 1 || pokemon.moves.length > 4) {
      errors.push(`Pokemon must have 1-4 moves, has ${pokemon.moves.length}`);
    }

    this.validateKnownSpecies(pokemon, species, errors);

    for (const moveSlot of pokemon.moves) {
      if (!moveSlot.moveId) {
        errors.push("Pokemon move slot is empty");
        continue;
      }
      this.validateKnownMove(moveSlot.moveId, errors);
    }

    if (pokemon.heldItem) {
      this.validateKnownItem(pokemon.heldItem, errors);
    }

    if (!pokemon.ability) {
      errors.push("Pokemon ability is required");
    } else {
      this.validateKnownAbility(pokemon.ability, errors);
      const legalAbilities = new Set(species.abilities.normal);
      if (species.abilities.hidden) {
        legalAbilities.add(species.abilities.hidden);
      }
      if (!legalAbilities.has(pokemon.ability)) {
        errors.push(`Ability "${pokemon.ability}" is not legal for ${species.displayName}`);
      }

      if (
        pokemon.abilitySlot === CORE_ABILITY_SLOTS.normal2 &&
        species.abilities.normal.length < 2
      ) {
        errors.push(
          `Ability slot "${pokemon.abilitySlot}" is not supported for ${species.displayName}`,
        );
      } else if (pokemon.abilitySlot === CORE_ABILITY_SLOTS.hidden && !species.abilities.hidden) {
        errors.push(
          `Ability slot "${pokemon.abilitySlot}" is not supported for ${species.displayName}`,
        );
      } else {
        const expectedAbility =
          pokemon.abilitySlot === CORE_ABILITY_SLOTS.normal2
            ? species.abilities.normal[1]
            : pokemon.abilitySlot === CORE_ABILITY_SLOTS.hidden
              ? species.abilities.hidden
              : species.abilities.normal[0];
        if (expectedAbility && pokemon.ability !== expectedAbility) {
          errors.push(
            `Ability "${pokemon.ability}" does not match slot "${pokemon.abilitySlot}" for ${species.displayName}`,
          );
        }
      }
    }

    try {
      this.dataManager.getNature(pokemon.nature);
    } catch {
      errors.push(`Nature "${pokemon.nature}" is not available in Gen ${this.generation}`);
    }

    BaseRuleset.appendValidationMessages(errors, validateIvs(pokemon.ivs));
    BaseRuleset.appendValidationMessages(errors, validateEvs(pokemon.evs));
    BaseRuleset.appendValidationMessages(errors, validateFriendship(pokemon.friendship));

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getConfusionSelfHitChance(): number {
    // Gen 1-6: 50% chance; Gen 7+ overrides to 33%
    return 0.5;
  }

  calculateConfusionDamage(pokemon: ActivePokemon, _state: BattleState, rng: SeededRandom): number {
    // Gen 3+: confusion self-hit uses 40 base power with the user's own Attack and Defense.
    // Applies 85-100% random variance like normal damage, but no STAB, no critical hit,
    // no type effectiveness.
    // Burn halves physical attack even on confusion self-hits (confusion is always physical-category).
    // No Gen 1 stat overflow check — that bug is Gen 1 specific.
    // Source: Showdown sim/battle-actions.ts confusion self-damage logic
    const level = pokemon.pokemon.level;
    const calcStats = pokemon.pokemon.calculatedStats;
    const baseAtk = calcStats?.attack ?? 50;
    const baseDef = calcStats?.defense ?? 50;

    let atk = Math.max(1, Math.floor(baseAtk * getStatStageMultiplier(pokemon.statStages.attack)));
    const def = Math.max(
      1,
      Math.floor(baseDef * getStatStageMultiplier(pokemon.statStages.defense)),
    );

    if (pokemon.pokemon.status === CORE_STATUS_IDS.burn) {
      atk = Math.floor(atk / 2);
    }

    const levelFactor = Math.floor((2 * level) / 5) + 2;
    const baseDamage = Math.floor(Math.floor(levelFactor * 40 * atk) / def / 50) + 2;

    // Source: Showdown sim/battle-actions.ts — confusion self-hit applies 85-100% random factor
    // damage = tr(damage * (85 + rng.next(16)) / 100)
    const randomFactor = 85 + rng.int(0, 15);
    const damage = Math.floor((baseDamage * randomFactor) / 100);

    return Math.max(1, damage);
  }

  confusionSelfHitTargetsOpponentSub(): boolean {
    // Gen 3+: confusion self-hit always damages the confused Pokemon itself.
    return false;
  }

  // Source: default for Gen 3-6; Gen 7+ overrides to 2-5 turn range
  processConfusionTurn(active: ActivePokemon, _state: BattleState): boolean {
    const conf = active.volatileStatuses.get(CORE_VOLATILE_IDS.confusion);
    if (!conf) return false;
    conf.turnsLeft--;
    return conf.turnsLeft > 0;
  }

  // Source: default for Gen 3+
  processBoundTurn(active: ActivePokemon, _state: BattleState): boolean {
    const bound = active.volatileStatuses.get(CORE_VOLATILE_IDS.bound);
    if (!bound) return false;
    bound.turnsLeft--;
    return bound.turnsLeft > 0;
  }

  onSwitchIn(_pokemon: ActivePokemon, _state: BattleState): void {
    // Default: no-op. Override in gen-specific rulesets that need switch-in hooks.
    // Gen 5 overrides this to reset the sleep counter on switch-in.
  }

  onSwitchOut(pokemon: ActivePokemon, _state: BattleState): void {
    // Default Gen 3+ behavior: clear all volatile statuses on switch-out.
    // Gen 1-2 override this to handle generation-specific persistence rules.
    if (pokemon.suppressedAbility !== null) {
      pokemon.ability = pokemon.suppressedAbility;
      pokemon.suppressedAbility = null;
    }
    pokemon.volatileStatuses.clear();
  }

  // Source: Bulbapedia -- Escape (Generation III onwards)
  // F = floor(playerSpeed * 128 / wildSpeed) + 30 * attempts
  // Flee succeeds if playerSpeed >= wildSpeed OR F >= 256 OR rng(0,255) < F
  rollFleeSuccess(
    playerSpeed: number,
    wildSpeed: number,
    attempts: number,
    rng: SeededRandom,
  ): boolean {
    if (playerSpeed >= wildSpeed) return true;
    const f = Math.floor((playerSpeed * 128) / wildSpeed) + 30 * attempts;
    if (f >= 256) return true;
    return rng.int(0, 255) < f;
  }

  /**
   * Roll a catch attempt using the Gen 3+ catch formula.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c Cmd_handleballthrow
   * Source: Bulbapedia -- Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
   *
   * Formula:
   *   a = ((3 * HP_max - 2 * HP_current) * CatchRate * BallMod) / (3 * HP_max)) * StatusMod
   *   b = 65536 / (255 / a)^0.1875
   *   Each of 4 shake checks passes if rng(0,65535) < b
   *   4 passes = caught; display shakes = min(failedCheck, 3)
   */
  /**
   * Returns the status catch rate modifier table for this generation.
   * Default is Gen 3-4 (2.0x for sleep/freeze).
   * Gen 5+ rulesets should override to use 2.5x for sleep/freeze.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — sleep/freeze: odds *= 2
   * Source: Bulbapedia — Catch rate: Gen 5+ changed sleep/freeze to 2.5x
   */
  protected getStatusCatchModifiers(): Record<PrimaryStatus, number> {
    // Gen 3-4 values inlined to avoid cross-package build-order dependency
    // Source: pret/pokeemerald src/battle_script_commands.c — sleep/freeze: odds *= 2
    return {
      [CORE_STATUS_IDS.sleep]: 2.0,
      [CORE_STATUS_IDS.freeze]: 2.0,
      [CORE_STATUS_IDS.paralysis]: 1.5,
      [CORE_STATUS_IDS.burn]: 1.5,
      [CORE_STATUS_IDS.poison]: 1.5,
      [CORE_STATUS_IDS.badlyPoisoned]: 1.5,
    };
  }

  rollCatchAttempt(
    catchRate: number,
    maxHp: number,
    currentHp: number,
    status: PrimaryStatus | null,
    ballModifier: number,
    rng: SeededRandom,
  ): CatchResult {
    const modifiers = this.getStatusCatchModifiers();
    const statusModifier = status ? (modifiers[status] ?? 1) : 1;
    const modifiedRate = calculateModifiedCatchRate(
      maxHp,
      currentHp,
      catchRate,
      ballModifier,
      statusModifier,
    );
    const shakeChecks = calculateShakeChecks(modifiedRate, rng);
    // calculateShakeChecks returns 0-4; 4 = caught
    // CatchAttemptEvent uses shakes 0-3 where 3 = caught display
    if (shakeChecks >= 4) {
      return { caught: true, shakes: 3 };
    }
    return { caught: false, shakes: shakeChecks as 0 | 1 | 2 };
  }

  // Gen 3-7 default (true); Gen 8+ must override (false)
  shouldExecutePursuitPreSwitch(): boolean {
    // Gen 3-7 default (override to false in Gen 8+)
    return true;
  }

  canSwitch(_pokemon: ActivePokemon, _state: BattleState): boolean {
    // Default Gen 3+: no switching restrictions from the ruleset.
    // Shadow Tag, Arena Trap etc. would be checked via abilities, not here.
    return true;
  }

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    // Gen 2+: 1/8 max HP
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  calculateCurseDamage(pokemon: ActivePokemon): number {
    // Gen 2+: 1/4 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateNightmareDamage(pokemon: ActivePokemon): number {
    // Gen 2+: 1/4 max HP per turn while asleep
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  // Gen 2+ default (typeless 50 BP physical, no type chart, no STAB, no variance).
  // Gen 3+ inherit this directly. Gen 1-2 override with their own implementations.
  calculateStruggleDamage(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    _state: BattleState,
  ): number {
    // Source: Showdown — Gen 3+ Struggle is typeless physical damage
    // Formula: same as confusion self-hit but with 50 BP instead of 40 BP.
    const level = attacker.pokemon.level;
    const attack = attacker.pokemon.calculatedStats?.attack ?? 100;
    const defense = defender.pokemon.calculatedStats?.defense ?? 100;
    const effectiveAttack = Math.max(
      1,
      Math.floor(attack * getStatStageMultiplier(attacker.statStages.attack)),
    );
    const effectiveDefense = Math.max(
      1,
      Math.floor(defense * getStatStageMultiplier(defender.statStages.defense)),
    );
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 50 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;
    return Math.max(1, baseDamage);
  }

  // Gen 4+ default (1/4 max HP); Gen 3 must override (1/2 damage dealt)
  calculateStruggleRecoil(attacker: ActivePokemon, _damageDealt: number): number {
    // Gen 4+ default: 1/4 of attacker's max HP
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  // Gen 5+ default (uniform 2-5); Gen 3-4 must override ([2,2,2,3,3,3,4,5] weighted)
  rollMultiHitCount(attacker: ActivePokemon, rng: SeededRandom): number {
    // Gen 5+ distribution: 35/35/15/15% for 2/3/4/5 hits
    // Skill Link ability (Gen 5+) always hits 5 times
    if (attacker.ability === CORE_ABILITY_IDS.skillLink) return 5;
    const roll = rng.int(1, 100);
    if (roll <= 35) return 2;
    if (roll <= 70) return 3;
    if (roll <= 85) return 4;
    return 5;
  }

  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    if (consecutiveProtects === 0) return true;
    const denominator = Math.min(729, 3 ** consecutiveProtects);
    return rng.chance(1 / denominator);
  }

  // Gen 5+ default (1/8 max HP); Gen 2-4 must override (1/16 max HP)
  calculateBindDamage(pokemon: ActivePokemon): number {
    // Gen 5+ default: 1/8 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  processPerishSong(pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    const perishState = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.perishSong);
    if (!perishState) return { newCount: 0, fainted: false };
    const counter = (perishState.data?.counter as number) ?? perishState.turnsLeft;
    if (counter <= 1) {
      return { newCount: 0, fainted: true };
    }
    const newCount = counter - 1;
    if (perishState.data) {
      perishState.data.counter = newCount;
    } else {
      perishState.turnsLeft = newCount;
    }
    return { newCount, fainted: false };
  }

  /**
   * Returns the effective speed of the given active pokemon, accounting for stat stages
   * and the paralysis speed penalty.
   *
   * Gen 7+ default: paralysis halves speed (×0.5). Gen 3-6 and Gen 1-2 must override (×0.25).
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;
    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));
    // Gen 7+ default: paralysis halves speed (×0.5); Gen 1-6 must override (×0.25)
    if (active.pokemon.status === CORE_STATUS_IDS.paralysis) {
      effective = Math.floor(effective * 0.5);
    }
    return Math.max(1, effective);
  }

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // Note: "defrost" is intentionally absent here. Gen 3+ handle freeze thaw pre-move
    // via checkFreezeThaw (20% per turn), NOT between turns. Only Gen 2 includes "defrost"
    // in its EoT order (see Gen2Ruleset.getEndOfTurnOrder and processEndOfTurnDefrost).
    // Source: Showdown sim/battle-actions.ts residualOrder values from
    // data/conditions.ts, data/moves.ts, data/items.ts
    // future-attack(3), wish(4), weather-damage(5), leftovers/black-sludge(5.2),
    // ingrain(7), leech-seed(8), status-damage(9-10), nightmare(11),
    // curse(12), bind/partiallytrapped(13), perish-song(24), countdowns(26)
    return [
      CORE_END_OF_TURN_EFFECT_IDS.futureAttack,
      CORE_END_OF_TURN_EFFECT_IDS.wish,
      CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
      CORE_END_OF_TURN_EFFECT_IDS.leftovers,
      CORE_END_OF_TURN_EFFECT_IDS.blackSludge,
      CORE_END_OF_TURN_EFFECT_IDS.ingrain,
      CORE_END_OF_TURN_EFFECT_IDS.leechSeed,
      CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      CORE_END_OF_TURN_EFFECT_IDS.nightmare,
      CORE_END_OF_TURN_EFFECT_IDS.curse,
      CORE_END_OF_TURN_EFFECT_IDS.bind,
      CORE_END_OF_TURN_EFFECT_IDS.perishSong,
      CORE_END_OF_TURN_EFFECT_IDS.screenCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.terrainCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.tailwindCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.trickRoomCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
    ];
  }

  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }
}
