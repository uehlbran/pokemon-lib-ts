import type {
  BattleGimmick,
  BattleGimmickType,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type { DataManager, EntryHazardType, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
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
