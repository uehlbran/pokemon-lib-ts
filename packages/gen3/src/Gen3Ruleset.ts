import {
  type ActivePokemon,
  BaseRuleset,
  type BattleSide,
  type BattleState,
  type DamageContext,
  type DamageResult,
  type EntryHazardResult,
  type ExpContext,
  type WeatherEffectResult,
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
import { calculateGen3Damage } from "./Gen3DamageCalc";
import { GEN3_TYPE_CHART, GEN3_TYPES } from "./Gen3TypeChart";
import { applyGen3WeatherEffects } from "./Gen3Weather";

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
   * Gen 3 damage formula.
   *
   * Delegates to calculateGen3Damage which implements the full pokeemerald formula:
   *   BaseDamage = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2
   *   Modifiers: targets → weather → crit (2.0x) → random (85-100) → STAB → type → burn
   *
   * Source: pret/pokeemerald src/battle_util.c CalculateBaseDamage
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen3Damage(context, this.getTypeChart());
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

  // --- Weather System ---

  /**
   * Gen 3 weather end-of-turn chip damage.
   *
   * Sandstorm: 1/16 max HP to non-Rock/Ground/Steel types.
   * Hail (new in Gen 3): 1/16 max HP to non-Ice types.
   * Rain/Sun: no chip damage.
   *
   * NOTE: NO SpDef boost for Rock types in sandstorm — that was added in Gen 4 (D/P).
   *
   * Source: pret/pokeemerald src/battle_util.c — weather damage = maxHP / 16
   */
  applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen3WeatherEffects(state);
  }

  // --- Entry Hazard System ---

  /**
   * Gen 3 entry hazards: only Spikes available (no Stealth Rock, no Toxic Spikes).
   *
   * Damage table (per pret/pokeemerald src/battle_util.c):
   *   1 layer = 1/8 max HP
   *   2 layers = 1/6 max HP
   *   3 layers = 1/4 max HP
   *
   * Flying-types are immune. Levitate ability is immune.
   *
   * Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage routine
   */
  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult {
    // Gen 3: only spikes available — no Stealth Rock (Gen 4) or Toxic Spikes (Gen 4)
    const spikes = side.hazards.find((h) => h.type === "spikes");
    if (!spikes) return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };

    // Flying-types are immune to spikes
    // Source: pret/pokeemerald — TYPE_FLYING check in hazard application
    if (pokemon.types.includes("flying")) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Levitate ability grants immunity to ground-affecting effects including spikes
    // Source: pret/pokeemerald — Levitate ability check in hazard application
    if (pokemon.ability === "levitate") {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    // Damage fractions: 0 layers (sentinel), 1 layer = 1/8, 2 layers = 1/6, 3 layers = 1/4
    // Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage fractions table
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    const fractions = [0, 1 / 8, 1 / 6, 1 / 4]; // index = layer count
    const layers = Math.min(spikes.layers, 3);
    const fraction = fractions[layers] ?? 1 / 8; // fallback to 1/8 (1-layer default)
    const damage = Math.max(1, Math.floor(maxHp * fraction));

    const pokemonName = pokemon.pokemon.nickname ?? pokemon.pokemon.speciesId.toString();
    return {
      damage,
      statusInflicted: null,
      statChanges: [],
      messages: [`${pokemonName} was hurt by the spikes!`],
    };
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
