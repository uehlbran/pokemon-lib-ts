import {
  type ActivePokemon,
  BaseRuleset,
  type BattleState,
  type DamageContext,
  type DamageResult,
  type ExpContext,
} from "@pokemon-lib-ts/battle";
import type {
  EntryHazardType,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  calculateExpGainClassic,
  DataManager,
  gen14MultiHitRoll,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import { GEN3_CRIT_MULTIPLIER, GEN3_CRIT_RATE_DENOMINATORS } from "./Gen3CritCalc";
import { GEN3_TYPE_CHART, GEN3_TYPES } from "./Gen3TypeChart";

/**
 * Gen 3 (Ruby/Sapphire/Emerald) ruleset.
 *
 * Extends BaseRuleset (Gen 6+/7+ defaults) and overrides the methods that differ
 * in Gen 3.
 *
 * Phase 1 overrides implemented here:
 *   - getAvailableHazards — Gen 3 only has Spikes (no Stealth Rock until Gen 4)
 *   - calculateBindDamage — 1/16 max HP (Gen 2-4; Gen 5+ uses 1/8)
 *   - calculateStruggleRecoil — 1/2 damage dealt (Gen 3; Gen 4+ uses 1/4 max HP)
 *   - rollMultiHitCount — Gen 1-4 weighted distribution via gen14MultiHitRoll
 *   - rollSleepTurns — 2-5 turns (Gen 3-4; Gen 5+ uses 1-3)
 *   - calculateExpGain — classic formula (no level scaling)
 *   - getCritMultiplier — 2.0x (Gen 3-5; Gen 6+ uses 1.5x)
 *   - getCritRateTable — [16, 8, 4, 3, 2] denominators
 *   - getAvailableTypes — 17 types (no Fairy)
 *   - getEffectiveSpeed — paralysis penalty 0.25x (Gen 3-6; Gen 7+ uses 0.5x)
 *   - applyStatusDamage — burn = 1/8 max HP (Gen 3-6; Gen 7+ uses 1/16)
 *
 * Phase 2: calculateDamage will be implemented.
 */
export class Gen3Ruleset extends BaseRuleset {
  readonly generation = 3 as const;
  readonly name = "Gen 3 (Ruby/Sapphire/Emerald)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? new DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN3_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN3_TYPES;
  }

  // --- Damage Calculation (Phase 2 placeholder) ---

  /**
   * Gen 3 damage formula (to be implemented in Phase 2).
   *
   * Source: pret/pokeemerald src/battle_util.c CalculateBaseDamage
   */
  calculateDamage(_context: DamageContext): DamageResult {
    throw new Error("Gen3Ruleset.calculateDamage not yet implemented — Phase 2");
  }

  // --- Critical Hit System ---

  /**
   * Gen 3-5 crit rate table (denominators [16, 8, 4, 3, 2]).
   *
   * Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
   */
  getCritRateTable(): readonly number[] {
    return GEN3_CRIT_RATE_DENOMINATORS;
  }

  /**
   * Gen 3-5 critical hit multiplier: 2.0x.
   * (Gen 6+ uses 1.5x via BaseRuleset default.)
   *
   * Source: pret/pokeemerald src/battle_util.c — crits double base damage
   */
  getCritMultiplier(): number {
    return GEN3_CRIT_MULTIPLIER;
  }

  // --- Hazard System ---

  /**
   * Gen 3 entry hazards: only Spikes available.
   * Stealth Rock was introduced in Gen 4.
   * Toxic Spikes was introduced in Gen 4.
   *
   * Source: pret/pokeemerald — only MOVE_SPIKES exists as a hazard-layer move
   */
  getAvailableHazards(): readonly EntryHazardType[] {
    return ["spikes"];
  }

  // --- End-of-Turn System ---

  /**
   * Gen 2-4 bind/trap damage: 1/16 of max HP per turn.
   * Gen 5+ increased this to 1/8 (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — WRAP/BIND/CLAMP damage = maxHP / 16
   */
  calculateBindDamage(pokemon: ActivePokemon): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 16));
  }

  /**
   * Gen 3 Struggle recoil: 1/2 of damage dealt.
   * Gen 4+ changed this to 1/4 of attacker's max HP (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — Struggle recoil = damage / 2
   */
  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    return Math.max(1, Math.floor(damageDealt / 2));
  }

  /**
   * Gen 1-4 multi-hit distribution: weighted [2,2,2,3,3,3,4,5].
   * Hit counts: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%).
   * Gen 5+ uses a different distribution (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — multi-hit uses 8-entry lookup table
   * Also: packages/core/src/logic/gen12-shared.ts gen14MultiHitRoll
   */
  rollMultiHitCount(_attacker: ActivePokemon, rng: SeededRandom): number {
    return gen14MultiHitRoll(rng);
  }

  // --- Status System ---

  /**
   * Gen 3-4 sleep duration: 2-5 turns.
   * Gen 5+ reduced this to 1-3 turns (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — sleep counter set to Random(4) + 2
   * (generates 0-3, adds 2 → range 2-5)
   */
  rollSleepTurns(rng: SeededRandom): number {
    return rng.int(2, 5);
  }

  /**
   * Gen 3-6 burn damage: 1/8 of max HP per turn.
   * Gen 7+ reduced burn damage to 1/16 (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — burn tick = maxHP / 8
   */
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    if (status === "burn") {
      // Gen 3-6: burn = 1/8 max HP (not 1/16 like Gen 7+)
      // Source: pret/pokeemerald src/battle_util.c
      return Math.max(1, Math.floor(maxHp / 8));
    }
    // All other statuses use the BaseRuleset default logic
    return super.applyStatusDamage(pokemon, status, state);
  }

  /**
   * Gen 3-6 EXP formula: classic formula (no level scaling).
   * EXP = (b * L_d / 7) * (1 / s) * t
   *
   * Source: pret/pokeemerald src/battle_util.c GiveExpToMon
   * Also: packages/core/src/logic/experience.ts calculateExpGainClassic
   */
  calculateExpGain(context: ExpContext): number {
    return calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
    );
  }

  // --- Speed (turn order helper) ---

  /**
   * Gen 3-6 paralysis speed penalty: 0.25x (speed is quartered).
   * Gen 7+ uses 0.5x (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_util.c — paralyzed speed = speed / 4
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));
    if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (×0.25)
      // Source: pret/pokeemerald src/battle_util.c
      effective = Math.floor(effective * 0.25);
    }
    return Math.max(1, effective);
  }
}
