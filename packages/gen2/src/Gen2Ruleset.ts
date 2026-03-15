import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
  ActivePokemon,
  BattleAction,
  BattleGimmick,
  BattleSide,
  BattleState,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  GenerationRuleset,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  ValidationResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  EntryHazardType,
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
  StatBlock,
  TypeChart,
  VolatileStatus,
  WeatherType,
} from "@pokemon-lib-ts/core";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import {
  CRIT_MULTIPLIER_CLASSIC,
  calculateExpGainClassic,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";

import { rollGen2Critical } from "./Gen2CritCalc";
import { calculateGen2Damage } from "./Gen2DamageCalc";
import { applyGen2HeldItem } from "./Gen2Items";
import { calculateGen2Stats } from "./Gen2StatCalc";
import { calculateGen2StatusDamage, canInflictGen2Status } from "./Gen2Status";
import { GEN2_TYPES, GEN2_TYPE_CHART } from "./Gen2TypeChart";
import { applyGen2WeatherEffects } from "./Gen2Weather";
import { createGen2DataManager } from "./data";

/**
 * Gen 2 critical hit rate table by stage.
 *
 * | Stage | Rate     |
 * |-------|----------|
 * | 0     | 17/256   |
 * | 1     | 32/256   |
 * | 2     | 64/256   |
 * | 3     | 128/256  |
 * | 4+    | 255/256  |
 */
const GEN2_CRIT_RATE_TABLE: readonly number[] = [
  17 / 256,
  32 / 256,
  64 / 256,
  128 / 256,
  255 / 256,
];

/**
 * Gen2Ruleset — implements GenerationRuleset directly (not extending BaseRuleset).
 *
 * Gen 2 (Gold/Silver/Crystal) is mechanically distinct enough from Gen 3+
 * that it warrants its own complete implementation rather than overriding a BaseRuleset.
 *
 * Key Gen 2 characteristics:
 * - No abilities, no natures
 * - Held items (first gen with them: Leftovers, berries, type-boosting items)
 * - Weather (Rain Dance, Sunny Day, Sandstorm)
 * - Entry hazards (Spikes only, 1 layer, 1/8 HP)
 * - Physical/Special determined by type, not by move
 * - Critical hits use stage-based system (Focus Energy fixed)
 * - 20% freeze thaw chance per turn
 * - Dark and Steel types added (17 types total)
 * - SpAttack and SpDefense are now separate stats
 */
export class Gen2Ruleset implements GenerationRuleset {
  readonly generation = 2 as const;
  readonly name = "Gen 2 (GSC)";

  private readonly dataManager = createGen2DataManager();

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN2_TYPE_CHART;
  }

  getValidTypes(): readonly PokemonType[] {
    return GEN2_TYPES;
  }

  // --- Stat Calculation ---

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    return calculateGen2Stats(pokemon, species);
  }

  // --- Damage Calculation ---

  calculateDamage(context: DamageContext): DamageResult {
    const attackerSpecies = this.dataManager.getSpecies(context.attacker.pokemon.speciesId);
    return calculateGen2Damage(context, GEN2_TYPE_CHART, attackerSpecies);
  }

  // --- Critical Hits ---

  getCritRateTable(): readonly number[] {
    return GEN2_CRIT_RATE_TABLE;
  }

  getCritMultiplier(): number {
    return CRIT_MULTIPLIER_CLASSIC; // 2.0x in Gen 1-5
  }

  rollCritical(context: CritContext): boolean {
    const { attacker, move, rng } = context;

    // Status moves don't crit
    if (move.category === "status") return false;

    return rollGen2Critical(attacker, move, rng);
  }

  // --- Turn Order ---

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    // Check for Quick Claw activation on move actions
    const quickClawActivated = new Set<number>();
    for (const action of actions) {
      if (action.type === "move" || action.type === "struggle" || action.type === "recharge") {
        const active = state.sides[action.side]?.active[0];
        if (active?.pokemon.heldItem === "quick-claw") {
          // ~23% chance (60/256) to move first
          if (rng.int(1, 256) <= 60) {
            quickClawActivated.add(action.side);
          }
        }
      }
    }

    return [...actions].sort((a, b) => {
      // Switches always go before moves
      // NOTE: Pursuit special ordering is complex and is not yet implemented.
      // In a full implementation, if the opponent is switching and a move action is Pursuit,
      // Pursuit would execute before the switch with doubled base power.
      if (a.type === "switch" && b.type !== "switch") return -1;
      if (b.type === "switch" && a.type !== "switch") return 1;

      // Run actions go first
      if (a.type === "run" && b.type !== "run") return -1;
      if (b.type === "run" && a.type !== "run") return 1;

      // If both are moves, compare priority then speed
      if (a.type === "move" && b.type === "move") {
        const sideA = state.sides[a.side];
        const sideB = state.sides[b.side];
        const activeA = sideA?.active[0];
        const activeB = sideB?.active[0];

        if (!activeA || !activeB) return 0;

        // Get moves for priority comparison
        const moveSlotA = activeA.pokemon.moves[a.moveIndex];
        const moveSlotB = activeB.pokemon.moves[b.moveIndex];
        if (!moveSlotA || !moveSlotB) return 0;

        let priorityA = 0;
        let priorityB = 0;
        try {
          priorityA = this.dataManager.getMove(moveSlotA.moveId).priority;
        } catch {
          // Move not found, use 0 priority
        }
        try {
          priorityB = this.dataManager.getMove(moveSlotB.moveId).priority;
        } catch {
          // Move not found, use 0 priority
        }

        // Higher priority goes first
        if (priorityA !== priorityB) {
          return priorityB - priorityA;
        }

        // Quick Claw: if one side activated Quick Claw, that side goes first
        const aQuickClaw = quickClawActivated.has(a.side);
        const bQuickClaw = quickClawActivated.has(b.side);
        if (aQuickClaw && !bQuickClaw) return -1;
        if (bQuickClaw && !aQuickClaw) return 1;

        // Same priority: compare effective speed
        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);

        if (speedA !== speedB) {
          return speedB - speedA; // Higher speed goes first
        }

        // Speed tie: random
        return rng.chance(0.5) ? -1 : 1;
      }

      // For recharge, struggle, etc., use speed
      if (
        (a.type === "move" || a.type === "struggle" || a.type === "recharge") &&
        (b.type === "move" || b.type === "struggle" || b.type === "recharge")
      ) {
        const activeA = state.sides[a.side]?.active[0];
        const activeB = state.sides[b.side]?.active[0];
        if (!activeA || !activeB) return 0;

        const speedA = this.getEffectiveSpeed(activeA);
        const speedB = this.getEffectiveSpeed(activeB);

        if (speedA !== speedB) {
          return speedB - speedA;
        }
        return rng.chance(0.5) ? -1 : 1;
      }

      return 0;
    });
  }

  /**
   * Calculate effective speed for turn order.
   * In Gen 2, paralysis reduces speed to 25%.
   */
  private getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));

    // Paralysis reduces speed to 25%
    if (active.pokemon.status === "paralysis") {
      effective = Math.floor(effective * 0.25);
    }

    return Math.max(1, effective);
  }

  // --- Move Execution ---

  doesMoveHit(context: AccuracyContext): boolean {
    const { attacker, defender, move, rng } = context;

    // Moves with null accuracy never miss (e.g., Swift)
    if (move.accuracy === null) {
      return true;
    }

    // Apply accuracy and evasion stages
    // Gen 2 uses the standard accuracy formula (NO 1/256 miss bug)
    const accStage = attacker.statStages.accuracy;
    const evaStage = defender.statStages.evasion;
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    let multiplier: number;
    if (netStage >= 0) {
      multiplier = (3 + netStage) / 3;
    } else {
      multiplier = 3 / (3 - netStage);
    }

    const finalAccuracy = Math.floor(move.accuracy * multiplier);

    return rng.int(1, 100) <= finalAccuracy;
  }

  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const result: {
      statusInflicted: PrimaryStatus | null;
      volatileInflicted: VolatileStatus | null;
      statChanges: Array<{
        target: "attacker" | "defender";
        stat:
          | "hp"
          | "attack"
          | "defense"
          | "spAttack"
          | "spDefense"
          | "speed"
          | "accuracy"
          | "evasion";
        stages: number;
      }>;
      recoilDamage: number;
      healAmount: number;
      switchOut: boolean;
      messages: string[];
      weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
      hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      clearSideHazards?: "attacker" | "defender";
      itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
      selfFaint?: boolean;
    } = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };

    if (!context.move.effect) return result;

    this.applyMoveEffect(context.move.effect, context.move, result, context);

    return result;
  }

  private applyMoveEffect(
    effect: NonNullable<MoveData["effect"]>,
    move: MoveData,
    result: {
      statusInflicted: PrimaryStatus | null;
      volatileInflicted: VolatileStatus | null;
      statChanges: Array<{
        target: "attacker" | "defender";
        stat:
          | "hp"
          | "attack"
          | "defense"
          | "spAttack"
          | "spDefense"
          | "speed"
          | "accuracy"
          | "evasion";
        stages: number;
      }>;
      recoilDamage: number;
      healAmount: number;
      switchOut: boolean;
      messages: string[];
      weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
      hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      clearSideHazards?: "attacker" | "defender";
      itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
      selfFaint?: boolean;
    },
    context: MoveEffectContext,
  ): void {
    const { attacker, defender, damage, rng } = context;

    switch (effect.type) {
      case "status-chance": {
        // Roll for status infliction
        if (rng.int(1, 100) <= effect.chance) {
          if (!defender.pokemon.status) {
            if (canInflictGen2Status(effect.status, defender)) {
              result.statusInflicted = effect.status;
            }
          }
        }
        break;
      }

      case "status-guaranteed": {
        if (!defender.pokemon.status) {
          if (canInflictGen2Status(effect.status, defender)) {
            result.statusInflicted = effect.status;
          }
        }
        break;
      }

      case "stat-change": {
        // Check if the stat change has a chance component
        if (effect.chance < 100) {
          if (rng.int(1, 100) > effect.chance) {
            break;
          }
        }
        for (const change of effect.changes) {
          result.statChanges.push({
            target: effect.target === "self" ? "attacker" : "defender",
            stat: change.stat,
            stages: change.stages,
          });
        }
        break;
      }

      case "recoil": {
        // Recoil damage is a fraction of damage dealt
        result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
        break;
      }

      case "drain": {
        // Drain heals a fraction of damage dealt
        result.healAmount = Math.max(1, Math.floor(damage * effect.amount));
        break;
      }

      case "heal": {
        const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
        result.healAmount = Math.max(1, Math.floor(maxHp * effect.amount));
        break;
      }

      case "multi": {
        // Process each sub-effect
        for (const subEffect of effect.effects) {
          this.applyMoveEffect(subEffect, move, result, context);
        }
        break;
      }

      case "volatile-status": {
        if (effect.chance < 100 && rng.int(1, 100) > effect.chance) {
          break;
        }
        result.volatileInflicted = effect.status;
        break;
      }

      case "weather": {
        result.weatherSet = {
          weather: effect.weather,
          turns: effect.turns ?? 5,
          source: move.id,
        };
        break;
      }

      case "entry-hazard": {
        // Spikes targets the opponent's side
        // In a 1v1, attacker is on one side; target is the other
        // The targetSide is the side that gets the hazard
        const attackerSideIndex = context.state.sides.findIndex((side) =>
          side.active.some((a) => a?.pokemon === attacker.pokemon),
        );
        const targetSide = attackerSideIndex === 0 ? 1 : 0;
        result.hazardSet = {
          hazard: effect.hazard,
          targetSide: targetSide as 0 | 1,
        };
        break;
      }

      case "switch-out": {
        if (effect.who === "self") {
          // Baton Pass — switch out preserving stat changes and volatile statuses
          result.switchOut = true;
        }
        break;
      }

      case "protect": {
        // Protect/Detect — handled by engine (sets protect volatile status)
        result.volatileInflicted = "protect";
        break;
      }

      case "custom": {
        this.handleCustomEffect(move, result, context);
        break;
      }

      case "fixed-damage":
      case "level-damage":
      case "ohko":
      case "damage":
        // These are handled by the damage calculation itself
        break;

      case "remove-hazards": {
        // Rapid Spin removes hazards from user's side
        result.messages.push(`${attacker.pokemon.nickname ?? "The Pokemon"} blew away hazards!`);
        break;
      }

      case "terrain":
      case "screen":
      case "multi-hit":
      case "two-turn":
        // Handled by the engine or N/A
        break;
    }
  }

  /**
   * Handle custom move effects specific to Gen 2.
   */
  private handleCustomEffect(
    move: MoveData,
    result: {
      statusInflicted: PrimaryStatus | null;
      volatileInflicted: VolatileStatus | null;
      statChanges: Array<{
        target: "attacker" | "defender";
        stat:
          | "hp"
          | "attack"
          | "defense"
          | "spAttack"
          | "spDefense"
          | "speed"
          | "accuracy"
          | "evasion";
        stages: number;
      }>;
      recoilDamage: number;
      healAmount: number;
      switchOut: boolean;
      messages: string[];
      weatherSet?: { weather: WeatherType; turns: number; source: string } | null;
      hazardSet?: { hazard: EntryHazardType; targetSide: 0 | 1 } | null;
      volatilesToClear?: Array<{ target: "attacker" | "defender"; volatile: VolatileStatus }>;
      clearSideHazards?: "attacker" | "defender";
      itemTransfer?: { from: "attacker" | "defender"; to: "attacker" | "defender" };
      selfFaint?: boolean;
    },
    context: MoveEffectContext,
  ): void {
    const { attacker, defender } = context;
    const pokemonName = attacker.pokemon.nickname ?? "The Pokemon";

    switch (move.id) {
      case "belly-drum": {
        // Lose 50% max HP, maximize Attack to +6
        const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
        const halfHp = Math.floor(maxHp / 2);
        if (attacker.pokemon.currentHp > halfHp) {
          result.recoilDamage = halfHp;
          result.statChanges.push({
            target: "attacker",
            stat: "attack",
            stages: 6 - attacker.statStages.attack,
          });
          result.messages.push(`${pokemonName} cut its own HP and maximized Attack!`);
        } else {
          result.messages.push(`${pokemonName} is too weak to use Belly Drum!`);
        }
        break;
      }

      case "rapid-spin": {
        // Remove leech-seed and binding volatiles from user, spikes from user's side
        result.volatilesToClear = [
          { target: "attacker", volatile: "leech-seed" },
          { target: "attacker", volatile: "bound" },
        ];
        result.clearSideHazards = "attacker";
        result.messages.push(`${pokemonName} blew away leech seed and spikes!`);
        break;
      }

      case "mean-look":
      case "spider-web": {
        // Trapping effect — prevents switching
        result.volatileInflicted = "trapped";
        break;
      }

      case "thief": {
        // Steal defender's item if user has no item
        if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
          result.itemTransfer = { from: "defender", to: "attacker" };
          result.messages.push(
            `${pokemonName} stole ${defender.pokemon.nickname ?? "the foe"}'s ${defender.pokemon.heldItem}!`,
          );
        }
        break;
      }

      case "baton-pass": {
        // Switch out preserving stat changes and volatile statuses
        result.switchOut = true;
        break;
      }

      case "explosion":
      case "self-destruct": {
        result.selfFaint = true;
        result.messages.push(`${pokemonName} exploded!`);
        break;
      }

      default: {
        // Unknown custom effect
        break;
      }
    }
  }

  // --- Status Conditions ---

  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    return calculateGen2StatusDamage(pokemon, status, state);
  }

  checkFreezeThaw(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 2: 25/256 (~9.77%) chance to thaw each turn (unlike Gen 1's permanent freeze)
    return rng.chance(25 / 256);
  }

  rollSleepTurns(rng: SeededRandom): number {
    // Gen 2: Sleep lasts 1-6 turns
    return rng.int(1, 6);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    // Gen 1-2: 63/256 chance to be fully paralyzed (~24.6%)
    return rng.int(0, 255) < 63;
  }

  rollConfusionSelfHit(rng: SeededRandom): boolean {
    // Gen 1-6: 50% chance to hit itself in confusion
    return rng.chance(0.5);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 2: cannot act on the turn it wakes up
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false; // Cannot act on wake turn in Gen 2
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false; // Cannot act on wake turn in Gen 2
    }
    return false; // Still sleeping
  }

  // --- Abilities (not in Gen 2) ---

  hasAbilities(): boolean {
    return false;
  }

  applyAbility(_trigger: AbilityTrigger, _context: AbilityContext): AbilityResult {
    return {
      activated: false,
      effects: [],
      messages: [],
    };
  }

  // --- Items (YES in Gen 2) ---

  hasHeldItems(): boolean {
    return true;
  }

  applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen2HeldItem(trigger, context);
  }

  // --- Weather (YES in Gen 2) ---

  hasWeather(): boolean {
    return true;
  }

  applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen2WeatherEffects(state);
  }

  // --- Terrain (not in Gen 2) ---

  hasTerrain(): boolean {
    return false;
  }

  applyTerrainEffects(_state: BattleState): TerrainEffectResult[] {
    return [];
  }

  // --- Entry Hazards (Spikes only in Gen 2) ---

  getAvailableHazards(): readonly EntryHazardType[] {
    return ["spikes"];
  }

  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult {
    const hasSpikes = side.hazards.some((h) => h.type === "spikes");
    if (!hasSpikes) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Flying types are immune to Spikes
    if (pokemon.types.includes("flying")) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    const damage = Math.max(1, Math.floor(maxHp / 8));

    return {
      damage,
      statusInflicted: null,
      statChanges: [],
      messages: [`${pokemon.pokemon.nickname ?? "The Pokemon"} was hurt by spikes!`],
    };
  }

  // --- EXP Gain ---

  calculateExpGain(context: ExpContext): number {
    return calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
    );
  }

  // --- Battle Gimmick (not in Gen 2) ---

  getBattleGimmick(): BattleGimmick | null {
    return null;
  }

  // --- Validation ---

  validatePokemon(pokemon: PokemonInstance, species: PokemonSpeciesData): ValidationResult {
    const errors: string[] = [];

    // Check level range
    if (pokemon.level < 1 || pokemon.level > 100) {
      errors.push(`Level must be between 1 and 100, got ${pokemon.level}`);
    }

    // Check that species exists in Gen 2 (Dex #1-251)
    if (species.id < 1 || species.id > 251) {
      errors.push(`Species #${species.id} (${species.displayName}) is not available in Gen 2`);
    }

    // Check move count (1-4 moves)
    if (pokemon.moves.length < 1 || pokemon.moves.length > 4) {
      errors.push(`Pokemon must have 1-4 moves, has ${pokemon.moves.length}`);
    }

    // Held items ARE valid in Gen 2 (unlike Gen 1)

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // --- Confusion ---

  getConfusionSelfHitChance(): number {
    return 0.5; // Gen 2: 50% chance to hit self in confusion
  }

  calculateConfusionDamage(pokemon: ActivePokemon, _state: BattleState, rng: SeededRandom): number {
    const level = pokemon.pokemon.level;
    const stats = pokemon.pokemon.calculatedStats;
    const attack = stats?.attack ?? 100;
    const defense = stats?.defense ?? 100;

    // Apply stat stages
    const effectiveAttack = Math.max(
      1,
      Math.floor(attack * getStatStageMultiplier(pokemon.statStages.attack)),
    );
    const effectiveDefense = Math.max(
      1,
      Math.floor(defense * getStatStageMultiplier(pokemon.statStages.defense)),
    );

    // 40 base power typeless physical hit
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage = Math.floor(Math.floor(levelFactor * 40 * effectiveAttack) / effectiveDefense);
    baseDamage = Math.floor(baseDamage / 50) + 2;

    // Random factor (217-255)/255
    const randomRoll = rng.int(217, 255);
    const finalDamage = Math.floor((baseDamage * randomRoll) / 255);

    return Math.max(1, finalDamage);
  }

  // --- Switch Out ---

  onSwitchOut(pokemon: ActivePokemon, _state: BattleState): void {
    // Gen 2: clear non-persistent volatiles on switch
    // Note: toxic-counter resets on switch (damage restarts at 1/16 next time in),
    // but the badly-poisoned status itself persists.
    pokemon.volatileStatuses.delete("bound");
    pokemon.volatileStatuses.delete("confusion");
    pokemon.volatileStatuses.delete("flinch");
    pokemon.volatileStatuses.delete("focus-energy");
    pokemon.volatileStatuses.delete("leech-seed");
    pokemon.volatileStatuses.delete("toxic-counter");
  }

  // --- Switching ---

  canSwitch(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 2: Mean Look / Spider Web prevent switching
    return !pokemon.volatileStatuses.has("trapped");
  }

  // --- End-of-Turn Formulas ---

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    // Gen 2: 1/8 max HP
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 8));
  }

  calculateCurseDamage(pokemon: ActivePokemon): number {
    // Gen 2: 1/4 max HP per turn
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  calculateNightmareDamage(pokemon: ActivePokemon): number {
    // Gen 2: 1/4 max HP per turn while asleep
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 4));
  }

  processPerishSong(pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    const perishState = pokemon.volatileStatuses.get("perish-song");
    if (!perishState) return { newCount: 0, fainted: false };
    const counter = (perishState.data?.counter as number) ?? perishState.turnsLeft;
    if (counter <= 1) return { newCount: 0, fainted: true };
    const newCount = counter - 1;
    if (perishState.data) {
      perishState.data.counter = newCount;
    } else {
      perishState.turnsLeft = newCount;
    }
    return { newCount, fainted: false };
  }

  // --- End-of-Turn Order ---

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return [
      "future-attack",
      "weather-damage",
      "leftovers",
      "leech-seed",
      "status-damage",
      "nightmare",
      "curse",
      "perish-song",
      "weather-countdown",
      "screen-countdown",
    ] as const;
  }
}
