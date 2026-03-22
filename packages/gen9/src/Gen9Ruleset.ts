import type {
  BattleGimmick,
  BattleGimmickType,
  CritContext,
  DamageContext,
  DamageResult,
  ExpContext,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  DataManager,
  EntryHazardType,
  PokemonType,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { createGen9DataManager } from "./data/index.js";
import { GEN9_CRIT_MULTIPLIER, GEN9_CRIT_RATE_TABLE } from "./Gen9CritCalc.js";
import { GEN9_TYPE_CHART, GEN9_TYPES } from "./Gen9TypeChart.js";

/**
 * Gen 9 (Scarlet/Violet) ruleset.
 *
 * Extends BaseRuleset and overrides the methods that differ in Gen 9.
 *
 * Key Gen 9 differences from Gen 8:
 *   - Dynamax/Gigantamax removed
 *   - Terastallization introduced (changes a Pokemon's type once per battle)
 *   - Snow replaces Hail (Defense boost for Ice-types instead of chip damage)
 *   - Pursuit, Hidden Power, Return, Frustration still removed (carried from Gen 8)
 *   - Confusion: 33% self-hit (unchanged from Gen 7-8)
 *   - Burn: 1/16 max HP (unchanged from Gen 7-8)
 *   - Paralysis speed: 0.5x (unchanged from Gen 7-8)
 *
 * Key Gen 9 inherits from BaseRuleset (Gen 7+ defaults):
 *   - getCritRateTable: [24, 8, 2, 1] (overridden for explicitness)
 *   - getCritMultiplier: 1.5x (overridden for explicitness)
 *   - getEffectiveSpeed: paralysis 0.5x (Gen 7+ default)
 *   - rollSleepTurns: 1-3
 *   - rollMultiHitCount: 35/35/15/15% for 2/3/4/5
 *   - rollProtectSuccess: 3^N denominator
 *   - applyStatusDamage: burn 1/16 (Gen 7+ default in BaseRuleset)
 *
 * Source: Showdown data/mods/gen9/ (Gen 9 data and overrides)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_IX
 */
export class Gen9Ruleset extends BaseRuleset {
  readonly generation = 9 as const;
  readonly name = "Gen 9 (Scarlet/Violet)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? createGen9DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN9_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN9_TYPES;
  }

  // --- Critical Hit System ---

  /**
   * Gen 9 crit rate table: [24, 8, 2, 1] (unchanged from Gen 6-8).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 9 crit rate table
   */
  override getCritRateTable(): readonly number[] {
    return GEN9_CRIT_RATE_TABLE;
  }

  /**
   * Gen 9 crit multiplier: 1.5x (unchanged from Gen 6-8).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 9 crit multiplier
   */
  override getCritMultiplier(): number {
    return GEN9_CRIT_MULTIPLIER;
  }

  /**
   * Gen 9 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * Battle Armor and Shell Armor prevent critical hits in all gens where they exist.
   * This is identical to the Gen 8 implementation.
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

  // --- Confusion ---

  /**
   * Gen 9 confusion self-hit chance is 33% (unchanged from Gen 7-8).
   *
   * BaseRuleset defaults to 50% (Gen 3-6). Gen 7+ must override to 33%.
   *
   * Source: Showdown data/conditions.ts -- confusion self-hit 33% from Gen 7 onwards
   * Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting itself
   *   in confusion has decreased from 50% to approximately 33%."
   */
  override rollConfusionSelfHit(rng: SeededRandom): boolean {
    return rng.chance(1 / 3);
  }

  /**
   * Returns the confusion self-hit chance for Gen 9 (33%, same as Gen 7-8).
   *
   * Source: Bulbapedia -- Gen 7+ confusion self-hit chance is ~33%
   */
  override getConfusionSelfHitChance(): number {
    return 1 / 3;
  }

  // --- Terrain ---

  /**
   * Gen 9 has terrain (Electric, Grassy, Misty, Psychic).
   *
   * Source: Showdown sim/field.ts -- terrain effects
   * Source: Bulbapedia -- Terrain mechanics present in Gen 9
   */
  hasTerrain(): boolean {
    return true;
  }

  // --- Switch System ---

  /**
   * Pursuit was removed in Gen 8 and remains absent in Gen 9.
   *
   * Source: Bulbapedia -- Pursuit removed in Gen 8, not restored in Gen 9
   */
  override shouldExecutePursuitPreSwitch(): boolean {
    return false;
  }

  // --- Entry Hazards ---

  /**
   * Gen 9 available hazards: Stealth Rock, Spikes, Toxic Spikes, Sticky Web.
   * G-Max Steelsurge is NOT available in Gen 9 (Dynamax removed).
   *
   * Source: Bulbapedia -- Entry hazards in Gen 9
   * Source: Showdown data/moves.ts -- Gen 9 hazard availability
   */
  override getAvailableHazards(): readonly EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes", "sticky-web"];
  }

  // --- Future Attack ---

  /**
   * Gen 5+ recalculates future attack damage at hit time, not at use time.
   *
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   */
  recalculatesFutureAttackDamage(): boolean {
    return true;
  }

  // --- Semi-Invulnerable ---

  /**
   * Gen 9 semi-invulnerable move bypass check (same as Gen 6-8).
   *
   * Certain moves can hit targets in semi-invulnerable states:
   * - Flying (Fly/Bounce): Gust, Twister, Thunder, Sky Uppercut, Hurricane,
   *   Smack Down, Thousand Arrows
   * - Underground (Dig): Earthquake, Magnitude, Fissure
   * - Underwater (Dive): Surf, Whirlpool
   * - Shadow Force charging: nothing bypasses it
   * - Generic charging: always hittable (not truly semi-invulnerable)
   *
   * Source: Showdown data/moves.ts -- semi-invulnerable move interactions
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
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

  // --- Battle Gimmick ---

  /**
   * Gen 9 battle gimmick: Terastallization.
   * Mega Evolution, Z-Moves, and Dynamax are all removed in Gen 9.
   *
   * Terastallization will be implemented in Wave 2.
   * Currently returns null as a placeholder.
   *
   * Source: Showdown data/mods/gen9 -- no Mega, Z-Moves, or Dynamax
   * Source: Bulbapedia -- Terastallization is the Gen 9 battle gimmick
   */
  getBattleGimmick(_type: BattleGimmickType): BattleGimmick | null {
    // Wave 2 will implement Terastallization for type === "tera"
    return null;
  }

  // --- Experience ---

  /**
   * Gen 9 EXP formula (same as Gen 7-8).
   *
   * Gen 9 uses the same simplified formula as Gen 7-8 (no sqrt-based level scaling):
   *   exp = floor((baseExp * defeatedLevel) / (5 * participantCount))
   *   Apply trainer battle bonus (1.5x), Lucky Egg (1.5x), traded (1.5x/1.7x).
   *   Each multiplier is floored separately (sequential rounding).
   *
   * Key Gen 9 difference: EXP Share is always active (same as Gen 8).
   * However, this is an engine-level concern (the engine always passes
   * hasExpShare=true for non-participating party members), not a formula change.
   *
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_IX
   * Source: Showdown sim/battle.ts -- Gen 9 EXP formula (same as Gen 7-8)
   */
  override calculateExpGain(context: ExpContext): number {
    const baseExp = context.defeatedSpecies.baseExp;
    const l = context.defeatedLevel;
    const s = context.participantCount;

    // Step 1: Base EXP = floor((baseExp * defeatedLevel) / (5 * participantCount))
    // Source: Bulbapedia Gen IX EXP formula (same as Gen VII-VIII)
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
   * Gen 9 damage formula (stub).
   *
   * Will be implemented in Wave 3 with full Gen 9 mechanics including:
   *   - Tera STAB (Stellar one-time 2x per type, normal Tera 2x for matching type)
   *   - Snow defense boost for Ice-types (replaces Hail chip damage)
   *   - Terrain boost: 1.3x (same as Gen 8)
   *   - All Gen 8 mechanics carried forward
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 9 damage formula
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(_context: DamageContext): DamageResult {
    // Stub -- Wave 3 will implement the full damage calc
    return { damage: 0, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}
