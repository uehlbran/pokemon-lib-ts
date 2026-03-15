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
  SeededRandom,
  StatBlock,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  calculateExpGainClassic,
  gen12FullParalysisCheck,
  gen14MultiHitRoll,
  gen16ConfusionSelfHitRoll,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import { createGen1DataManager } from "./data";
import { rollGen1Critical } from "./Gen1CritCalc";
import { calculateGen1Damage } from "./Gen1DamageCalc";
import { calculateGen1Stats } from "./Gen1StatCalc";
import { GEN1_TYPE_CHART, GEN1_TYPES } from "./Gen1TypeChart";

/**
 * Gen 1 critical hit rate "table".
 * Gen 1 doesn't use a stage-based crit rate table like later gens.
 * It uses a Speed-based formula instead. This table is provided
 * to satisfy the GenerationRuleset interface; it's not actually used
 * for crit calculations (rollCritical uses the Speed-based formula).
 */
const GEN1_CRIT_RATE_TABLE: readonly number[] = [1 / 16] as const;

/**
 * Gen1Ruleset — implements GenerationRuleset directly (not extending BaseRuleset).
 *
 * Gen 1 (Red/Blue/Yellow) is mechanically distinct enough from Gen 3+
 * that it warrants its own complete implementation rather than overriding a BaseRuleset.
 *
 * Key Gen 1 characteristics:
 * - No abilities, no held items, no weather, no terrain, no entry hazards
 * - Physical/Special determined by type, not by move
 * - Critical hits based on Speed stat
 * - 1/256 miss bug on 100% accuracy moves
 * - Permanent freeze (only thawed by fire moves)
 * - Focus Energy bug (divides crit rate by 4)
 */
export class Gen1Ruleset implements GenerationRuleset {
  readonly generation = 1 as const;
  readonly name = "Gen 1 (RBY)";

  private readonly dataManager = createGen1DataManager();

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN1_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN1_TYPES;
  }

  // --- Stat Calculation ---

  calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    return calculateGen1Stats(pokemon, species);
  }

  // --- Damage Calculation ---

  calculateDamage(context: DamageContext): DamageResult {
    const attackerSpecies = this.dataManager.getSpecies(context.attacker.pokemon.speciesId);
    return calculateGen1Damage(context, GEN1_TYPE_CHART, attackerSpecies);
  }

  // --- Critical Hits ---

  getCritRateTable(): readonly number[] {
    return GEN1_CRIT_RATE_TABLE;
  }

  getCritMultiplier(): number {
    // Gen 1 crits are handled by level doubling in Gen1DamageCalc.ts, not a flat multiplier
    return 1;
  }

  rollCritical(context: CritContext): boolean {
    const { attacker, move, rng } = context;

    // Status moves don't crit
    if (move.category === "status") return false;

    const attackerSpecies = this.dataManager.getSpecies(attacker.pokemon.speciesId);
    return rollGen1Critical(attacker, move, attackerSpecies, rng);
  }

  // --- Turn Order ---

  resolveTurnOrder(actions: BattleAction[], state: BattleState, rng: SeededRandom): BattleAction[] {
    return [...actions].sort((a, b) => {
      // Switches always go before moves
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
   * In Gen 1, paralysis reduces speed to 25%.
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

    // OHKO (Fissure, Guillotine, Horn Drill): only hits if user is strictly faster than target
    if (move.effect?.type === "ohko") {
      const attackerSpeed = attacker.pokemon.calculatedStats?.speed ?? 0;
      const defenderSpeed = defender.pokemon.calculatedStats?.speed ?? 0;
      if (attackerSpeed <= defenderSpeed) return false;
    }

    // Moves with null accuracy never miss (e.g., Swift)
    if (move.accuracy === null) {
      return true;
    }

    // Apply accuracy and evasion stages (Gen 1 uses the 2-based scale: +1=3/2, -6=2/8)
    const accMod = getStatStageMultiplier(attacker.statStages.accuracy);
    const evaMod = getStatStageMultiplier(defender.statStages.evasion);

    // Calculate effective accuracy
    let effectiveAccuracy = Math.floor((move.accuracy * accMod) / evaMod);

    // Clamp to 1-255 range
    effectiveAccuracy = Math.max(1, Math.min(255, effectiveAccuracy));

    // Gen 1 1/256 miss bug: even 100% accuracy moves use < comparison
    // against a 0-255 random roll, meaning 255/256 max hit chance.
    // Exception: self-targeting moves get +1 to their threshold, making
    // 100% accuracy moves always hit (256/256). (Showdown scripts.ts:408)
    let threshold = Math.min(255, Math.floor((effectiveAccuracy * 255) / 100));
    if (move.target === "self") {
      threshold = Math.min(256, threshold + 1);
    }
    const roll = rng.int(0, 255);

    return roll < threshold;
  }

  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const { move } = context;

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
      screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
      selfFaint?: boolean;
      noRecharge?: boolean;
      customDamage?: {
        target: "attacker" | "defender";
        amount: number;
        source: string;
        type?: PokemonType | null;
      } | null;
      statusCured?: { target: "attacker" | "defender" | "both" } | null;
      volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
      screensCleared?: "attacker" | "defender" | "both" | null;
    } = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };

    if (!move.effect) return result;

    this.applyMoveEffect(move.effect, move, result, context);

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
      screenSet?: { screen: string; turnsLeft: number; side: "attacker" | "defender" } | null;
      selfFaint?: boolean;
      noRecharge?: boolean;
      customDamage?: {
        target: "attacker" | "defender";
        amount: number;
        source: string;
        type?: PokemonType | null;
      } | null;
      statusCured?: { target: "attacker" | "defender" | "both" } | null;
      volatileData?: { turnsLeft: number; data?: Record<string, unknown> } | null;
      screensCleared?: "attacker" | "defender" | "both" | null;
    },
    context: MoveEffectContext,
  ): void {
    const { attacker, defender, damage, rng } = context;

    switch (effect.type) {
      case "status-chance": {
        // Roll for status infliction
        if (rng.int(1, 100) <= effect.chance) {
          // Can't inflict status if target already has one
          if (!defender.pokemon.status) {
            // Can't burn fire types, can't freeze ice types, etc.
            if (this.canInflictStatus(effect.status, defender)) {
              result.statusInflicted = effect.status;
            }
          }
        }
        break;
      }

      case "status-guaranteed": {
        if (!defender.pokemon.status) {
          if (this.canInflictStatus(effect.status, defender)) {
            result.statusInflicted = effect.status;
          }
        }
        break;
      }

      case "stat-change": {
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
        if (damage > 0) {
          result.recoilDamage = Math.max(1, Math.floor(damage * effect.amount));
        }
        break;
      }

      case "drain": {
        // Drain heals a fraction of damage dealt
        if (damage > 0) {
          result.healAmount = Math.max(1, Math.floor(damage * effect.amount));
        }
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

      case "screen": {
        // Reflect / Light Screen: set a screen on the attacker's side
        // Gen 1: screens are permanent — they last until removed by Haze or the setter switches out.
        // turnsLeft: -1 is the permanent sentinel — never expires by countdown.
        result.screenSet = {
          screen: effect.screen,
          turnsLeft: -1, // Gen 1: screens are permanent — never expire by countdown.
          // Removed by Haze or when the setter switches out.
          side: "attacker",
        };
        result.messages.push(
          `${effect.screen === "reflect" ? "Reflect" : "Light Screen"} raised ${attacker.pokemon.nickname ?? "the user"}'s defenses!`,
        );
        break;
      }

      case "fixed-damage": {
        // Dragon Rage (40 damage), Sonic Boom (20 damage), etc.
        // Override the damage dealt with a fixed amount
        result.customDamage = {
          target: "defender",
          amount: effect.damage,
          source: move.id,
          type: move.type,
        };
        break;
      }

      case "level-damage": {
        // Night Shade, Seismic Toss: damage = user's level
        result.customDamage = {
          target: "defender",
          amount: attacker.pokemon.level,
          source: move.id,
          type: move.type,
        };
        break;
      }

      case "ohko": {
        // Fissure, Guillotine, Horn Drill: instant KO if it hits
        // The move only hits if user is faster than target (handled in accuracy check)
        result.customDamage = {
          target: "defender",
          amount: defender.pokemon.currentHp, // Deal exactly current HP to KO
          source: move.id,
          type: move.type,
        };
        result.messages.push("It's a one-hit KO!");
        break;
      }

      case "volatile-status": {
        // In Gen 1: Confusion, Bind, Wrap, etc.
        if (effect.status === "confusion") {
          if (rng.int(1, 100) <= effect.chance) {
            if (!defender.volatileStatuses.has("confusion")) {
              // Confusion lasts 1-4 turns in Gen 1
              const turns = rng.int(1, 4);
              result.volatileInflicted = "confusion";
              result.volatileData = { turnsLeft: turns };
            }
          }
        } else if (effect.status === "bound") {
          // Bind, Wrap, Fire Spin, Clamp: trapping moves in Gen 1
          // Duration is weighted: 37.5% × 2 turns, 37.5% × 3 turns, 12.5% × 4, 12.5% × 5
          // (Showdown conditions.ts:225, same as multi-hit distribution)
          if (!defender.volatileStatuses.has("trapped")) {
            const turns = rng.pick([2, 2, 2, 3, 3, 3, 4, 5] as const);
            result.volatileInflicted = "trapped";
            result.volatileData = { turnsLeft: turns, data: { bindTurns: turns } };
            result.messages.push(`${defender.pokemon.nickname ?? "The target"} was trapped!`);
          }
        }
        break;
      }

      case "damage":
        // Pure damage — handled by the damage calculation itself
        break;

      case "custom": {
        // Handle specific custom moves by handler name
        if (effect.handler === "haze") {
          // Haze: clears all stat changes and status conditions for both pokemon,
          // removes all volatile statuses for both Pokemon, and removes all screens
          // from both sides (Gen 1 only).
          // Source: pret/pokered src/engine/battle/effect_commands.asm — Haze clears
          // all volatile statuses (leech-seed, focus-energy, confusion, disable, etc.)
          result.statusCured = { target: "both" };
          result.screensCleared = "both";
          // Directly clear all volatile statuses for both Pokemon
          attacker.volatileStatuses.clear();
          defender.volatileStatuses.clear();
          result.messages.push("All stat changes were eliminated!");
        } else if (effect.handler === "explosion" || effect.handler === "self-destruct") {
          // Explosion / Self-Destruct: user faints after using the move
          result.selfFaint = true;
        } else if (effect.handler === "counter") {
          // Counter in Gen 1: only reflects Normal and Fighting type moves
          const lastDamage = attacker.lastDamageTaken ?? 0;
          const lastType = attacker.lastDamageType;
          const counterableType = lastType === "normal" || lastType === "fighting";
          if (lastDamage > 0 && counterableType) {
            result.customDamage = {
              target: "defender",
              amount: lastDamage * 2,
              source: "counter",
              type: move.type,
            };
          } else {
            result.messages.push("Counter failed!");
          }
        }
        break;
      }

      case "weather":
      case "terrain":
      case "entry-hazard":
      case "remove-hazards":
      case "multi-hit":
      case "two-turn":
      case "protect":
        // These effects are N/A in Gen 1
        break;

      case "switch-out":
        // Roar and Whirlwind do nothing in Gen 1 — they have forceSwitch: false.
        // (Showdown gen1 moves.ts: both moves explicitly fail)
        result.messages.push("But it failed!");
        break;
    }
  }

  /**
   * Check if a status condition can be inflicted on a target.
   * Gen 1 immunities: Fire types can't be burned, Ice types can't be frozen, etc.
   */
  private canInflictStatus(status: PrimaryStatus, target: ActivePokemon): boolean {
    switch (status) {
      case "burn":
        return !target.types.includes("fire");
      case "freeze":
        return !target.types.includes("ice");
      case "paralysis":
        // In Gen 1, Electric types CAN be paralyzed (unlike later gens)
        return true;
      case "poison":
      case "badly-poisoned":
        return !target.types.includes("poison");
      case "sleep":
        return true;
      default:
        return true;
    }
  }

  // --- Status Conditions ---

  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, _state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;

    switch (status) {
      case "burn":
        // Burn deals 1/16 max HP per turn in Gen 1 (same as poison)
        return Math.max(1, Math.floor(maxHp / 16));

      case "poison":
        // Regular poison deals 1/16 max HP per turn in Gen 1
        return Math.max(1, Math.floor(maxHp / 16));

      case "badly-poisoned": {
        // Badly poisoned (Toxic): damage escalates each turn
        // N/16 max HP, where N starts at 1 and increments each turn
        // The toxic counter is stored under the "toxic-counter" volatile key
        const toxicState = pokemon.volatileStatuses.get("toxic-counter");
        const counter = (toxicState?.data?.counter as number) ?? 1;
        const damage = Math.max(1, Math.floor((maxHp * counter) / 16));
        // Increment counter for next turn (ruleset owns this state)
        if (toxicState?.data) {
          (toxicState.data as Record<string, unknown>).counter = counter + 1;
        }
        return damage;
      }

      case "freeze":
      case "sleep":
      case "paralysis":
        // These don't deal damage
        return 0;

      default:
        return 0;
    }
  }

  checkFreezeThaw(_pokemon: ActivePokemon, _rng: SeededRandom): boolean {
    // Gen 1: Frozen Pokemon NEVER thaw naturally.
    // They can only be thawed by being hit by a fire-type move.
    return false;
  }

  rollSleepTurns(rng: SeededRandom): number {
    // Gen 1: Sleep lasts 1-7 turns
    return rng.int(1, 7);
  }

  checkFullParalysis(_pokemon: ActivePokemon, rng: SeededRandom): boolean {
    return gen12FullParalysisCheck(rng);
  }

  rollConfusionSelfHit(rng: SeededRandom): boolean {
    return gen16ConfusionSelfHitRoll(rng);
  }

  processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 1: cannot act on the turn it wakes up
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // Wake up — but cannot act this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false; // Cannot act on wake turn in Gen 1
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      // Just reached 0 — wake up but can't act this turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false; // Cannot act on wake turn in Gen 1
    }
    return false; // Still sleeping
  }

  // --- Abilities (not in Gen 1) ---

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

  // --- Items (not in Gen 1) ---

  hasHeldItems(): boolean {
    return false;
  }

  applyHeldItem(_trigger: string, _context: ItemContext): ItemResult {
    return {
      activated: false,
      effects: [],
      messages: [],
    };
  }

  // --- Weather (not in Gen 1) ---

  hasWeather(): boolean {
    return false;
  }

  applyWeatherEffects(_state: BattleState): WeatherEffectResult[] {
    return [];
  }

  // --- Terrain (not in Gen 1) ---

  hasTerrain(): boolean {
    return false;
  }

  applyTerrainEffects(_state: BattleState): TerrainEffectResult[] {
    return [];
  }

  // --- Entry Hazards (not in Gen 1) ---

  getAvailableHazards(): readonly EntryHazardType[] {
    return [];
  }

  applyEntryHazards(_pokemon: ActivePokemon, _side: BattleSide): EntryHazardResult {
    return {
      damage: 0,
      statusInflicted: null,
      statChanges: [],
      messages: [],
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

  // --- Battle Gimmick (not in Gen 1) ---

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

    // Check that species exists in Gen 1 (Dex #1-151)
    if (species.id < 1 || species.id > 151) {
      errors.push(`Species #${species.id} (${species.displayName}) is not available in Gen 1`);
    }

    // Check move count (1-4 moves)
    if (pokemon.moves.length < 1 || pokemon.moves.length > 4) {
      errors.push(`Pokemon must have 1-4 moves, has ${pokemon.moves.length}`);
    }

    // No held items in Gen 1
    if (pokemon.heldItem) {
      errors.push("Held items are not available in Gen 1");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // --- Confusion ---

  getConfusionSelfHitChance(): number {
    // Gen 1: 50% chance to hit itself when confused
    return 0.5;
  }

  calculateConfusionDamage(
    pokemon: ActivePokemon,
    _state: BattleState,
    _rng: SeededRandom,
  ): number {
    // Gen 1: confusion self-hit uses 40 base power with the user's own Attack and Defense.
    // No random variance, no STAB, no critical hit chance, no type effectiveness.
    // Burn halves physical attack even on confusion self-hits.
    // (Showdown gen1 conditions.ts:147-149)
    const level = pokemon.pokemon.level;
    const calcStats = pokemon.pokemon.calculatedStats;
    const baseAtk = calcStats?.attack ?? 50;
    const baseDef = calcStats?.defense ?? 50;

    let atk = Math.max(1, Math.floor(baseAtk * getStatStageMultiplier(pokemon.statStages.attack)));
    let def = Math.max(1, Math.floor(baseDef * getStatStageMultiplier(pokemon.statStages.defense)));

    // Gen 1 stat overflow: same transform as calculateGen1Damage
    if (atk >= 256 || def >= 256) {
      atk = Math.max(1, Math.floor(atk / 4) % 256);
      def = Math.floor(def / 4) % 256;
      if (def === 0) def = 1;
    }

    if (pokemon.pokemon.status === "burn") {
      atk = Math.floor(atk / 2);
    }

    const levelFactor = Math.floor((2 * level) / 5) + 2;
    const damage = Math.floor(Math.floor(levelFactor * 40 * atk) / def / 50) + 2;
    return Math.max(1, damage);
  }

  // --- Switch Out ---

  onSwitchOut(pokemon: ActivePokemon, state: BattleState): void {
    // In Gen 1, Toxic counter persists through switching (unlike Gen 2+).
    // Save it before clearing, then restore it.
    const toxicCounter = pokemon.volatileStatuses.get("toxic-counter");
    pokemon.volatileStatuses.clear();
    if (toxicCounter) {
      pokemon.volatileStatuses.set("toxic-counter", toxicCounter);
    }

    // Gen 1: screens (Reflect / Light Screen) are cleared when the setter switches out.
    for (const side of state.sides) {
      if (side.active.some((active) => active === pokemon)) {
        side.screens = [];
        break;
      }
    }
  }

  // --- Switching ---

  shouldExecutePursuitPreSwitch(): boolean {
    return false;
  }

  canSwitch(pokemon: ActivePokemon, _state: BattleState): boolean {
    // Gen 1: trapping moves (Wrap, Bind, Fire Spin, Clamp) prevent switching
    return !pokemon.volatileStatuses.has("trapped");
  }

  // --- End-of-Turn Formulas ---

  calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    // Gen 1: Leech Seed drains 1/16 max HP (not 1/8 like Gen 2+)
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 16));
  }

  calculateCurseDamage(_pokemon: ActivePokemon): number {
    // Curse doesn't exist in Gen 1
    return 0;
  }

  calculateNightmareDamage(_pokemon: ActivePokemon): number {
    // Nightmare doesn't exist in Gen 1
    return 0;
  }

  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    // Gen 1: recoil = 1/2 of damage dealt
    return Math.max(1, Math.floor(damageDealt / 2));
  }

  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return gen14MultiHitRoll(rng);
  }

  rollProtectSuccess(_consecutiveProtects: number, _rng: SeededRandom): boolean {
    return true; // Gen 1 has no Protect move
  }

  calculateBindDamage(_pokemon: ActivePokemon): number {
    // Gen 1 handles bind/trapping in canExecuteMove, not end-of-turn
    return 0;
  }

  processPerishSong(_pokemon: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    // Perish Song doesn't exist in Gen 1
    return { newCount: 0, fainted: false };
  }

  // --- End-of-Turn Order ---

  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return ["status-damage"];
  }
}
