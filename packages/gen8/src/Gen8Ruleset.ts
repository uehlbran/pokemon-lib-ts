import type {
  AbilityContext,
  AbilityResult,
  ActivePokemon,
  BattleGimmick,
  BattleGimmickType,
  BattleSide,
  BattleState,
  CritContext,
  DamageContext,
  DamageResult,
  EntryHazardResult,
  ExpContext,
  ItemContext,
  ItemResult,
  TerrainEffectResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  DataManager,
  EntryHazardType,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { createGen8DataManager } from "./data/index.js";
import { handleGen8SwitchAbility, shouldMirrorArmorReflect } from "./Gen8AbilitiesSwitch.js";
import { GEN8_CRIT_MULTIPLIER, GEN8_CRIT_RATE_TABLE } from "./Gen8CritCalc.js";
import { calculateGen8Damage } from "./Gen8DamageCalc.js";
import { Gen8Dynamax } from "./Gen8Dynamax.js";
import { applyGen8EntryHazards } from "./Gen8EntryHazards.js";
import { applyGen8HeldItem } from "./Gen8Items.js";
import { applyGen8TerrainEffects, checkGen8TerrainStatusImmunity } from "./Gen8Terrain.js";
import { GEN8_TYPE_CHART, GEN8_TYPES } from "./Gen8TypeChart.js";
import { applyGen8WeatherEffects } from "./Gen8Weather.js";

/**
 * Gen 8 (Sword/Shield) ruleset.
 *
 * Extends BaseRuleset and overrides the methods that differ in Gen 8.
 *
 * Key Gen 8 differences from Gen 7:
 *   - Pursuit removed (shouldExecutePursuitPreSwitch returns false)
 *   - Hidden Power, Return, Frustration removed
 *   - Mega Evolution and Z-Moves removed
 *   - Dynamax/Gigantamax introduced (implemented in Wave 8)
 *   - EXP Share always active (cannot be toggled off)
 *   - Confusion: 33% self-hit (unchanged from Gen 7)
 *   - Burn: 1/16 max HP (unchanged from Gen 7)
 *   - Paralysis speed: 0.5x (unchanged from Gen 7)
 *
 * Key Gen 8 inherits from BaseRuleset (Gen 7+ defaults):
 *   - getCritRateTable: [24, 8, 2, 1] (overridden for explicitness)
 *   - getCritMultiplier: 1.5x (overridden for explicitness)
 *   - getEffectiveSpeed: paralysis 0.5x (Gen 7+ default)
 *   - rollSleepTurns: 1-3
 *   - rollMultiHitCount: 35/35/15/15% for 2/3/4/5
 *   - rollProtectSuccess: 3^N denominator
 *   - applyStatusDamage: burn 1/16 (Gen 7+ default in BaseRuleset)
 *
 * Source: Showdown data/mods/gen8/ (Gen 8 data and overrides)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_VIII
 */
export class Gen8Ruleset extends BaseRuleset {
  readonly generation = 8 as const;
  readonly name = "Gen 8 (Sword/Shield)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? createGen8DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN8_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN8_TYPES;
  }

  // --- Critical Hit System ---

  /**
   * Gen 8 crit rate table: [24, 8, 2, 1] (unchanged from Gen 6-7).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 8 crit rate table
   */
  override getCritRateTable(): readonly number[] {
    return GEN8_CRIT_RATE_TABLE;
  }

  /**
   * Gen 8 crit multiplier: 1.5x (unchanged from Gen 6-7).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 8 crit multiplier
   */
  override getCritMultiplier(): number {
    return GEN8_CRIT_MULTIPLIER;
  }

  /**
   * Gen 8 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * Source: Showdown sim/battle-actions.ts -- crit immunity check
   * Source: Bulbapedia -- Battle Armor / Shell Armor prevent critical hits
   */
  rollCritical(context: CritContext): boolean {
    const defenderAbility = context.defender?.ability;
    if (defenderAbility === "battle-armor" || defenderAbility === "shell-armor") {
      return false;
    }
    return super.rollCritical(context);
  }

  // --- Terrain ---

  /**
   * Gen 8 has terrain (Electric, Grassy, Misty, Psychic).
   * Terrain damage boost: 1.3x in Gen 8 (reverted from 1.5x in Gen 7 to 1.3x).
   *
   * Source: Showdown sim/field.ts -- terrain effects
   * Source: Bulbapedia -- Terrain mechanics present in Gen 8
   */
  hasTerrain(): boolean {
    return true;
  }

  /**
   * Gen 8 terrain end-of-turn effects.
   *
   * Currently handles Grassy Terrain healing (1/16 max HP for grounded Pokemon).
   *
   * Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT for grounded Pokemon
   * Source: Showdown data/conditions.ts -- grassyterrain.onResidual
   */
  override applyTerrainEffects(state: BattleState): TerrainEffectResult[] {
    return applyGen8TerrainEffects(state);
  }

  /**
   * Check if a primary status condition can be inflicted on a target,
   * considering active terrain effects.
   *
   * - Electric Terrain: grounded Pokemon cannot fall asleep
   * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
   *
   * Source: Bulbapedia "Electric Terrain" Gen 8 -- "Grounded Pokemon cannot fall asleep."
   * Source: Bulbapedia "Misty Terrain" Gen 8 -- "Grounded Pokemon are protected from
   *   status conditions."
   * Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
   */
  checkTerrainStatusImmunity(
    status: PrimaryStatus,
    target: ActivePokemon,
    state: BattleState,
  ): { immune: boolean; message?: string } {
    return checkGen8TerrainStatusImmunity(status, target, state);
  }

  // --- Confusion ---

  /**
   * Gen 8 confusion self-hit chance is 33% (unchanged from Gen 7).
   *
   * Source: Showdown sim/battle-actions.ts -- confusion self-hit 33% from Gen 7 onwards
   * Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting itself
   *   in confusion has decreased from 50% to approximately 33%."
   */
  override rollConfusionSelfHit(rng: SeededRandom): boolean {
    return rng.chance(1 / 3);
  }

  /**
   * Returns the confusion self-hit chance for Gen 8 (33%, same as Gen 7).
   *
   * Source: Bulbapedia -- Gen 7+ confusion self-hit chance is ~33%
   */
  override getConfusionSelfHitChance(): number {
    return 1 / 3;
  }

  // --- Switch System ---

  /**
   * Pursuit was removed in Gen 8 (Sword/Shield).
   * shouldExecutePursuitPreSwitch returns false.
   *
   * Source: Showdown data/mods/gen8/moves.ts -- Pursuit not in Gen 8 move list
   * Source: Bulbapedia -- Pursuit removed in Gen 8
   */
  override shouldExecutePursuitPreSwitch(): boolean {
    return false;
  }

  // --- Weather ---

  /**
   * Gen 8 end-of-turn weather effects.
   *
   * Identical to Gen 7: sandstorm/hail deal 1/16 max HP chip damage.
   * Gen 8 adds Ice Face as a hail-immune ability.
   *
   * Source: Showdown data/conditions.ts -- weather end-of-turn damage
   * Source: Bulbapedia -- Weather conditions page
   */
  override applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen8WeatherEffects(state);
  }

  // --- Entry Hazards ---

  /**
   * Gen 8 available hazards include Sticky Web and G-Max Steelsurge.
   *
   * Source: Bulbapedia -- Sticky Web introduced in Gen 6, still present in Gen 8
   * Source: Showdown data/moves.ts -- stickyweb, gmaxsteelsurge
   * Source: Bulbapedia -- G-Max Steelsurge (Copperajah G-Max move)
   */
  override getAvailableHazards(): readonly EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes", "sticky-web", "gmax-steelsurge"];
  }

  /**
   * Gen 8 entry hazards: Stealth Rock, Spikes, Toxic Spikes, Sticky Web, G-Max Steelsurge.
   *
   * New in Gen 8:
   *   - G-Max Steelsurge: Steel-type Stealth Rock (type-effective damage)
   *   - Heavy-Duty Boots: blocks ALL hazard effects on switch-in
   *
   * Magic Guard blocks damage/status hazards but not Sticky Web's stat drop.
   * Full Metal Body (Gen 7 ability) blocks Sticky Web.
   *
   * Source: Showdown data/moves.ts -- hazard condition handlers
   * Source: Showdown data/items.ts -- heavydutyboots
   * Source: Bulbapedia -- individual hazard pages
   */
  override applyEntryHazards(
    pokemon: ActivePokemon,
    side: BattleSide,
    state?: BattleState,
  ): EntryHazardResult {
    if (!state) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }
    return applyGen8EntryHazards(pokemon, side, state, this.getTypeChart());
  }

  // --- Battle Gimmick ---

  /**
   * Gen 8 battle gimmick: Dynamax/Gigantamax.
   * Mega Evolution and Z-Moves were removed in Gen 8.
   * Dynamax will be implemented in Wave 8; returns null as placeholder.
   *
   * Source: Showdown data/mods/gen8 -- no Mega Evolution or Z-Moves
   * Source: Bulbapedia -- Dynamax is the Gen 8 battle gimmick
   */
  getBattleGimmick(type: BattleGimmickType): BattleGimmick | null {
    // Mega Evolution removed in Gen 8
    // Z-Moves removed in Gen 8
    // Source: Showdown data/mods/gen8 -- no Mega Evolution or Z-Moves
    // Source: Bulbapedia -- Dynamax is the Gen 8 battle gimmick
    if (type === "dynamax") return new Gen8Dynamax();
    return null;
  }

  // --- Abilities ---

  /**
   * Gen 8 ability dispatch.
   *
   * Routes triggers to the appropriate Gen 8 ability handler module.
   * Covers all Gen 7 carryforward abilities plus new Gen 8 abilities:
   *   - on-switch-in: Intimidate, weather, Screen Cleaner, Neutralizing Gas,
   *     Intrepid Sword, Dauntless Shield, etc.
   *   - on-switch-out: Regenerator, Natural Cure
   *   - on-contact: Static, Flame Body, Wandering Spirit, Perish Body,
   *     Gulp Missile, Ice Face, Mummy, etc.
   *   - on-status-inflicted: Synchronize
   *   - on-before-move: Libero, Protean
   *   - on-stat-change: Mirror Armor
   *   - on-turn-end: Hunger Switch
   *
   * Source: Showdown data/abilities.ts -- Gen 8 ability handlers
   */
  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    const noActivation: AbilityResult = { activated: false, effects: [], messages: [] };

    // Mirror Armor: special handling for stat-change trigger
    if (trigger === "on-stat-change" && context.pokemon.ability === "mirror-armor") {
      if (context.statChange) {
        const { stat, stages, source } = context.statChange;
        // HP cannot be stage-changed; Mirror Armor only reflects non-HP stats
        if (stat !== "hp" && shouldMirrorArmorReflect("mirror-armor", stages, source)) {
          const name =
            context.pokemon.pokemon.nickname ?? String(context.pokemon.pokemon.speciesId);
          return {
            activated: true,
            effects: [{ effectType: "stat-change", target: "opponent", stat, stages }],
            messages: [`${name}'s Mirror Armor reflected the stat drop!`],
          };
        }
      }
      return noActivation;
    }

    // Route all other triggers through the switch handler
    switch (trigger) {
      case "on-switch-in":
      case "on-switch-out":
      case "on-contact":
      case "on-status-inflicted":
      case "on-before-move":
      case "on-turn-end":
        return handleGen8SwitchAbility(trigger, context);

      default:
        return noActivation;
    }
  }

  // --- Experience ---

  /**
   * Gen 8 EXP formula (same as Gen 7).
   *
   * Gen 8 uses the same simplified formula as Gen 7 (no sqrt-based level scaling):
   *   exp = floor((baseExp * defeatedLevel) / (5 * participantCount))
   *   Apply trainer battle bonus (1.5x), Lucky Egg (1.5x), traded (1.5x/1.7x).
   *   Each multiplier is floored separately (sequential rounding).
   *
   * Key Gen 8 difference: EXP Share is always active. However, this is
   * an engine-level concern (the engine always passes hasExpShare=true for
   * non-participating party members), not a formula change.
   *
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_VIII
   * Source: Showdown sim/battle.ts -- Gen 8 EXP formula (same as Gen 7)
   */
  override calculateExpGain(context: ExpContext): number {
    const baseExp = context.defeatedSpecies.baseExp;
    const l = context.defeatedLevel;
    const s = context.participantCount;

    // Step 1: Base EXP = floor((baseExp * defeatedLevel) / (5 * participantCount))
    // Source: Bulbapedia Gen VIII EXP formula (same as Gen VII)
    let exp = Math.floor((baseExp * l) / (5 * s));

    // Step 2: Trainer battle bonus (1.5x), floored separately
    // Source: Bulbapedia -- "Trainer battles give 1.5x EXP"
    if (context.isTrainerBattle) {
      exp = Math.floor(exp * 1.5);
    }

    // Step 3: Lucky Egg bonus (1.5x), floored separately
    // Source: Bulbapedia -- "Lucky Egg gives 1.5x EXP"
    if (context.hasLuckyEgg) {
      exp = Math.floor(exp * 1.5);
    }

    // Step 4: Traded Pokemon bonus, floored separately
    // Source: Bulbapedia -- same language -> 1.5x, international -> 1.7x
    if (context.isTradedPokemon) {
      const tradedMultiplier = context.isInternationalTrade ? 1.7 : 1.5;
      exp = Math.floor(exp * tradedMultiplier);
    }

    return Math.max(1, exp);
  }

  // --- Damage Calculation ---

  /**
   * Gen 8 damage formula.
   *
   * Delegates to calculateGen8Damage which implements the full Gen 8 formula
   * with all Gen 8-specific mechanics (1.3x terrain, Body Press, anti-Dynamax,
   * Gorilla Tactics, etc.).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 8 damage formula
   * Source: Showdown data/mods/gen8/scripts.ts -- Gen 8 terrain nerf
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen8Damage(
      context,
      this.getTypeChart() as Record<string, Record<string, number>>,
    );
  }

  /**
   * Gen 5+ recalculates future attack damage at hit time, not at use time.
   *
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   */
  recalculatesFutureAttackDamage(): boolean {
    return true;
  }

  /**
   * Gen 8 semi-invulnerable move bypass check (same as Gen 6-7).
   *
   * Source: Showdown data/moves.ts -- semi-invulnerable move interactions
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(
    moveId: string,
    volatile: import("@pokemon-lib-ts/core").VolatileStatus,
  ): boolean {
    switch (volatile) {
      case "flying":
        return [
          "gust",
          "twister",
          "thunder",
          "sky-uppercut",
          "hurricane",
          "smack-down",
          "thousand-arrows",
        ].includes(moveId);
      case "underground":
        return ["earthquake", "magnitude", "fissure"].includes(moveId);
      case "underwater":
        return ["surf", "whirlpool"].includes(moveId);
      case "shadow-force-charging":
        return false; // Nothing bypasses Shadow Force / Phantom Force
      case "charging":
        return true; // Generic charging moves are NOT semi-invulnerable
      default:
        return false;
    }
  }

  /**
   * Apply Gen 8 held item effects at the given trigger point.
   *
   * Delegates to applyGen8HeldItem which handles all Gen 8 items including
   * the new Gen 8 consumables (Heavy-Duty Boots, Eject Pack, Blunder Policy,
   * Throat Spray, Utility Umbrella, Room Service) and all Gen 7 items carried
   * forward, with Dynamax suppressing Choice item lock.
   *
   * Source: Showdown data/items.ts -- Gen 8 item handlers
   */
  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen8HeldItem(trigger, context);
  }
}
