import type {
  AccuracyContext,
  ActivePokemon,
  BattleState,
  CritContext,
  DamageContext,
  DamageResult,
  MoveEffectContext,
  MoveEffectResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { DataManager, getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { GEN5_CRIT_MULTIPLIER, GEN5_CRIT_RATE_DENOMINATORS } from "./Gen5CritCalc";
import { calculateGen5Damage } from "./Gen5DamageCalc";
import { GEN5_TYPE_CHART, GEN5_TYPES } from "./Gen5TypeChart";

/**
 * Gen 5 (Black/White/Black2/White2) ruleset.
 *
 * Extends BaseRuleset (Gen 6+/7+ defaults) and overrides the methods that differ
 * in Gen 5.
 *
 * Key Gen 5 differences from Gen 4:
 *   - Multi-hit distribution: 35/35/15/15% for 2/3/4/5 (replaces Gen 1-4 weighted table)
 *   - Bind damage: 1/8 max HP per turn (Gen 2-4 was 1/16)
 *   - Sleep turns: 1-3 (Gen 4 was 1-5)
 *   - Can act on wake turn (Gen 4 wasted wake turn)
 *   - Permanent weather from abilities (Gen 6 changed to 5 turns)
 *   - Type Gems consume on use for 1.5x boost
 *   - EXP formula uses level scaling
 *
 * Key Gen 5 differences from Gen 6+:
 *   - Steel resists Dark and Ghost (removed in Gen 6)
 *   - No Fairy type
 *   - Crit multiplier is 2.0x (Gen 6+ uses 1.5x)
 *   - Crit rate table: [16, 8, 4, 3, 2] (Gen 6+ uses [24, 8, 2, 1])
 *   - Burn damage: 1/8 max HP (Gen 7+ uses 1/16)
 *   - Paralysis speed penalty: 0.25x (Gen 7+ uses 0.5x)
 *   - No Fairy type, no terrain, no battle gimmicks
 *
 * Overrides implemented here:
 *   - getCritRateTable -- [16, 8, 4, 3, 2] denominators (Gen 3-5 table)
 *   - getCritMultiplier -- 2.0x (Gen 3-5 classic)
 *   - rollCritical -- Battle Armor / Shell Armor immunity check
 *   - applyStatusDamage -- burn = 1/8 max HP (Gen 3-6)
 *   - getEffectiveSpeed -- paralysis penalty 0.25x (Gen 3-6)
 *   - canHitSemiInvulnerable -- Gen 5 semi-invulnerable bypass (Gen 4 + Hurricane, Smack Down)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/
 */
export class Gen5Ruleset extends BaseRuleset {
  readonly generation = 5 as const;
  readonly name = "Gen 5 (Black/White/Black2/White2)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? new DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN5_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN5_TYPES;
  }

  // --- Damage Calculation ---

  /**
   * Gen 5 damage formula.
   * Stub -- will be fully implemented in Wave 1.
   *
   * Source: references/pokemon-showdown/sim/battle-actions.ts lines 1718-1838
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen5Damage(
      context,
      this.getTypeChart() as Record<string, Record<string, number>>,
    );
  }

  // --- Move Effects ---

  /**
   * Gen 5 move effect execution.
   * Delegates to Gen5MoveEffects. Stub for Wave 0 -- returns base result.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    // Stub -- delegates to BaseRuleset default for now
    return super.executeMoveEffect(context);
  }

  // --- Semi-Invulnerable Hit Check ---

  /**
   * Gen 5 semi-invulnerable move bypass check.
   *
   * Same as Gen 4 with the addition of Hurricane and Smack Down.
   *
   * - "flying" (Fly/Bounce): Thunder, Gust, Twister, Sky Uppercut, Hurricane, Smack Down can hit
   * - "underground" (Dig): Earthquake, Magnitude, Fissure can hit
   * - "underwater" (Dive): Surf, Whirlpool can hit
   * - "shadow-force-charging" (Shadow Force): nothing bypasses
   * - "charging" (SolarBeam, etc.): not semi-invulnerable; all moves hit
   *
   * Source: references/pokemon-showdown/data/mods/gen5/scripts.ts
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
    switch (volatile) {
      case "flying":
        // Source: Showdown Gen 5 -- Hurricane and Smack Down added in Gen 5
        return ["gust", "twister", "thunder", "sky-uppercut", "hurricane", "smack-down"].includes(
          moveId,
        );
      case "underground":
        return ["earthquake", "magnitude", "fissure"].includes(moveId);
      case "underwater":
        return ["surf", "whirlpool"].includes(moveId);
      case "shadow-force-charging":
        return false; // Nothing bypasses Shadow Force
      case "charging":
        return true; // Generic charging moves are NOT semi-invulnerable
      default:
        return false;
    }
  }

  // --- Critical Hit System ---

  /**
   * Gen 3-5 crit rate table (denominators [16, 8, 4, 3, 2]).
   *
   * Source: references/pokemon-showdown/sim/battle-actions.ts line 1625
   */
  getCritRateTable(): readonly number[] {
    return GEN5_CRIT_RATE_DENOMINATORS;
  }

  /**
   * Gen 3-5 critical hit multiplier: 2.0x.
   * (Gen 6+ uses 1.5x via BaseRuleset default.)
   *
   * Source: references/pokemon-showdown/sim/battle-actions.ts line 1751
   */
  getCritMultiplier(): number {
    return GEN5_CRIT_MULTIPLIER;
  }

  /**
   * Gen 5 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * If the defender has Battle Armor or Shell Armor, critical hits are
   * completely prevented -- return false immediately without rolling.
   * Otherwise, defer to BaseRuleset.rollCritical for normal crit logic.
   *
   * Source: references/pokemon-showdown/sim/battle-actions.ts -- crit immunity check
   */
  rollCritical(context: CritContext): boolean {
    const defenderAbility = context.defender?.ability;
    if (defenderAbility === "battle-armor" || defenderAbility === "shell-armor") {
      return false;
    }
    return super.rollCritical(context);
  }

  // --- Status System ---

  /**
   * Gen 5 burn damage is 1/8 max HP (same as Gen 3-6).
   * BaseRuleset defaults to Gen 7+ (1/16 max HP), so we must override.
   *
   * Source: references/pokemon-showdown/sim/battle-actions.ts -- Gen < 7 burn damage
   */
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    if (status === "burn") {
      // Gen 3-6: 1/8 max HP
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
      return Math.max(1, Math.floor(maxHp / 8));
    }
    // Poison, Badly Poisoned: same as BaseRuleset default
    return super.applyStatusDamage(pokemon, status, state);
  }

  // --- Weather ---

  /**
   * Gen 5 weather effects.
   * Stub for Wave 0 -- will be implemented in Wave 2.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
   */
  applyWeatherEffects(_state: BattleState): WeatherEffectResult[] {
    return [];
  }

  // --- Speed ---

  /**
   * Gen 5 effective speed calculation.
   *
   * Gen 3-6 paralysis penalty: speed is quartered (0.25x).
   * Gen 7+ changed this to 0.5x, which is the BaseRuleset default.
   *
   * Source: references/pokemon-showdown/sim/pokemon.ts -- Gen < 7 paralysis speed
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;
    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));
    // Gen 3-6: paralysis quarters speed (0.25x)
    // Source: references/pokemon-showdown/sim/pokemon.ts -- Gen < 7 paralysis speed penalty
    if (active.pokemon.status === "paralysis") {
      effective = Math.floor(effective * 0.25);
    }
    return Math.max(1, effective);
  }
}
