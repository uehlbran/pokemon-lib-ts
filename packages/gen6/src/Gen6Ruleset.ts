import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type { DataManager, PokemonType, PrimaryStatus, TypeChart } from "@pokemon-lib-ts/core";
import { getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { createGen6DataManager } from "./data/index.js";
import { GEN6_TYPE_CHART, GEN6_TYPES } from "./Gen6TypeChart.js";

/**
 * Gen 6 (X/Y/Omega Ruby/Alpha Sapphire) ruleset.
 *
 * Extends BaseRuleset and overrides the methods that differ in Gen 6.
 *
 * Key Gen 6 differences from Gen 5:
 *   - Fairy type added (18th type)
 *   - Steel loses Ghost and Dark resistances
 *   - Crit multiplier: 1.5x (was 2.0x in Gen 3-5) -- inherited from BaseRuleset
 *   - Crit rate table: [24, 8, 2, 1] (Gen 6+ table) -- inherited from BaseRuleset
 *   - Weather: 5 turns (ability), 8 turns (rock item) -- was permanent in Gen 5
 *   - Burn damage: 1/8 max HP (same as Gen 5, overrides BaseRuleset 1/16 default)
 *   - Paralysis speed penalty: 0.25x (Gen 7+ uses 0.5x)
 *   - Confusion self-hit: 50% (Gen 7+ uses 33%) -- inherited from BaseRuleset
 *   - Sticky Web (new entry hazard)
 *   - Powder immunity for Grass types
 *   - Mega Evolution (one per team per battle)
 *
 * Key Gen 6 inherits from BaseRuleset (Gen 6+ defaults):
 *   - getCritRateTable: [24, 8, 2, 1]
 *   - getCritMultiplier: 1.5x
 *   - rollConfusionSelfHit: 50%
 *   - getConfusionSelfHitChance: 0.5
 *   - rollSleepTurns: 1-3
 *   - rollMultiHitCount: 35/35/15/15% for 2/3/4/5
 *   - rollProtectSuccess: 3^N denominator
 *
 * Overrides:
 *   - getTypeChart: 18-type chart with Fairy
 *   - getAvailableTypes: 18 types including Fairy
 *   - calculateDamage: Gen 6 damage formula (stub, will be fully implemented in Wave 3)
 *   - applyStatusDamage: burn = 1/8 max HP (Gen 3-6 override of BaseRuleset 1/16)
 *   - getEffectiveSpeed: paralysis 0.25x (Gen 3-6 override of BaseRuleset 0.5x)
 *   - recalculatesFutureAttackDamage: true (Gen 5+ behavior)
 *   - getAvailableHazards: adds sticky-web
 *   - getEndOfTurnOrder: Gen 6 end-of-turn ordering
 *
 * Source: references/pokemon-showdown/data/ (Gen 6 base chart)
 * Source: specs/battle/07-gen6.md
 */
export class Gen6Ruleset extends BaseRuleset {
  readonly generation = 6 as const;
  readonly name = "Gen 6 (X/Y/Omega Ruby/Alpha Sapphire)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? createGen6DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN6_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN6_TYPES;
  }

  // --- Damage Calculation ---

  /**
   * Gen 6 damage formula (stub implementation for Wave 0).
   *
   * Uses the standard Gen 3+ damage formula with type effectiveness and STAB.
   * Full Gen 6-specific modifiers (abilities, items, terrain, etc.) will be
   * implemented in Wave 3.
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 6 damage formula
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(context: DamageContext): DamageResult {
    const { attacker, defender, move, rng, isCrit } = context;

    // Status moves deal 0 damage
    if (move.category === "status") {
      return { damage: 0, effectiveness: 1, isCrit: false, randomFactor: 1 };
    }

    const level = attacker.pokemon.level;
    const isPhysical = move.category === "physical";

    // Stat lookups
    const atkStat = isPhysical
      ? (attacker.pokemon.calculatedStats?.attack ?? 100)
      : (attacker.pokemon.calculatedStats?.spAttack ?? 100);
    const defStat = isPhysical
      ? (defender.pokemon.calculatedStats?.defense ?? 100)
      : (defender.pokemon.calculatedStats?.spDefense ?? 100);

    // Apply stat stages (crit ignores unfavorable stages)
    // Source: Showdown sim/battle-actions.ts -- crit ignores negative atk stages and positive def stages
    const atkStage = isPhysical ? attacker.statStages.attack : attacker.statStages.spAttack;
    const defStage = isPhysical ? defender.statStages.defense : defender.statStages.spDefense;

    const effectiveAtkStage = isCrit ? Math.max(0, atkStage) : atkStage;
    const effectiveDefStage = isCrit ? Math.min(0, defStage) : defStage;

    const effectiveAtk = Math.max(
      1,
      Math.floor(atkStat * getStatStageMultiplier(effectiveAtkStage)),
    );
    const effectiveDef = Math.max(
      1,
      Math.floor(defStat * getStatStageMultiplier(effectiveDefStage)),
    );

    const power = move.power ?? 0;
    if (power === 0) {
      return { damage: 0, effectiveness: 1, isCrit: false, randomFactor: 1 };
    }

    // Base damage formula: floor((2*Level/5 + 2) * Power * Atk/Def / 50) + 2
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
    const levelFactor = Math.floor((2 * level) / 5) + 2;
    let baseDamage =
      Math.floor(Math.floor((levelFactor * power * effectiveAtk) / effectiveDef) / 50) + 2;

    // Critical hit: 1.5x in Gen 6+
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier is 1.5x
    const critMultiplier = isCrit ? this.getCritMultiplier() : 1;
    if (isCrit) {
      baseDamage = Math.floor(baseDamage * critMultiplier);
    }

    // Random factor: 85-100% (0.85 to 1.0)
    // Source: Showdown sim/battle-actions.ts -- random roll 85-100
    const randomRoll = rng.int(85, 100);
    const randomFactor = randomRoll / 100;
    baseDamage = Math.floor((baseDamage * randomRoll) / 100);

    // STAB: 1.5x if the move type matches one of the attacker's types
    // Source: Showdown sim/battle-actions.ts -- STAB calculation
    const moveType = move.type as PokemonType;
    const attackerTypes = attacker.types ?? [];
    if (attackerTypes.includes(moveType)) {
      baseDamage = Math.floor(baseDamage * 1.5);
    }

    // Type effectiveness
    // Source: Type chart data from references/pokemon-showdown/data/typechart.ts
    const typeChart = this.getTypeChart() as Record<string, Record<string, number>>;
    let effectiveness = 1;
    const defenderTypes = defender.types ?? [];
    for (const defType of defenderTypes) {
      const multiplier = typeChart[moveType]?.[defType] ?? 1;
      effectiveness *= multiplier;
    }
    baseDamage = Math.floor(baseDamage * effectiveness);

    // Burn halves physical damage (unless attacker has Guts)
    // Source: Showdown sim/battle-actions.ts -- burn physical attack penalty
    if (isPhysical && attacker.pokemon.status === "burn" && attacker.ability !== "guts") {
      baseDamage = Math.floor(baseDamage / 2);
    }

    const finalDamage = Math.max(effectiveness > 0 ? 1 : 0, baseDamage);

    return {
      damage: finalDamage,
      effectiveness,
      isCrit,
      randomFactor,
      effectiveType: moveType,
      effectiveCategory: move.category as "physical" | "special",
    };
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

  // --- Status System ---

  /**
   * Gen 6 burn damage is 1/8 max HP (same as Gen 3-5).
   * BaseRuleset defaults to Gen 7+ (1/16 max HP), so we must override.
   *
   * Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
   */
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    // Magic Guard: prevents all indirect damage including status chip damage
    // Source: Bulbapedia -- Magic Guard prevents damage from weather, poison, burn, etc.
    if (pokemon.ability === "magic-guard") return 0;

    if (status === "burn") {
      // Gen 3-6: 1/8 max HP
      // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
      // Heatproof: halves burn damage (1/8 -> 1/16)
      // Source: Bulbapedia -- Heatproof halves damage from Fire-type moves and burn
      if (pokemon.ability === "heatproof") {
        return Math.max(1, Math.floor(maxHp / 16));
      }
      return Math.max(1, Math.floor(maxHp / 8));
    }
    // Poison, Badly Poisoned: same as BaseRuleset default
    return super.applyStatusDamage(pokemon, status, state);
  }

  // --- Speed ---

  /**
   * Gen 6 effective speed calculation.
   * Paralysis quarters speed (0.25x) in Gen 3-6; BaseRuleset defaults to Gen 7+ (0.5x).
   *
   * Source: Showdown sim/pokemon.ts -- Gen 6 speed modifiers
   * Source: Bulbapedia -- Paralysis speed penalty
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(active.statStages.speed));

    // Gen 3-6: paralysis quarters speed (x0.25)
    // Source: Bulbapedia -- Paralysis: speed reduced to 25% in Gen 3-6
    if (active.pokemon.status === "paralysis") {
      effective = Math.floor(effective * 0.25);
    }

    return Math.max(1, effective);
  }

  // --- Entry Hazards ---

  /**
   * Gen 6 available hazards include Sticky Web (new in Gen 6).
   *
   * Source: Bulbapedia -- Sticky Web introduced in Gen 6
   * Source: Showdown data/moves.ts -- stickyweb
   */
  override getAvailableHazards(): readonly import("@pokemon-lib-ts/core").EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes", "sticky-web"];
  }

  // --- End of Turn ---

  /**
   * Gen 6 end-of-turn effect ordering.
   *
   * Source: specs/battle/07-gen6.md
   * Source: Showdown data/conditions.ts -- residual order
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return [
      "weather-damage",
      "future-attack",
      "wish",
      "weather-healing",
      "shed-skin",
      "leech-seed",
      "leftovers",
      "black-sludge",
      "aqua-ring",
      "ingrain",
      "poison-heal",
      "status-damage",
      "nightmare",
      "curse",
      "bad-dreams",
      "bind",
      "yawn-countdown",
      "encore-countdown",
      "taunt-countdown",
      "disable-countdown",
      "heal-block-countdown",
      "embargo-countdown",
      "magnet-rise-countdown",
      "perish-song",
      "screen-countdown",
      "safeguard-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
      "terrain-countdown",
      "weather-countdown",
      "toxic-orb-activation",
      "flame-orb-activation",
      "speed-boost",
      "moody",
      "healing-items",
    ];
  }

  /**
   * Gen 6 (like Gen 3+) has no per-attack residuals; all residuals are in Phase 2.
   *
   * Source: Showdown Gen 6 -- no per-attack residuals
   */
  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }

  // --- Catch Rate ---

  /**
   * Gen 6 uses 2.5x status catch modifier for sleep/freeze (same as Gen 5).
   *
   * Source: Bulbapedia -- Catch rate: Gen 5+ uses 2.5x for sleep/freeze
   */
  protected override getStatusCatchModifiers(): Record<PrimaryStatus, number> {
    return {
      sleep: 2.5,
      freeze: 2.5,
      paralysis: 1.5,
      burn: 1.5,
      poison: 1.5,
      "badly-poisoned": 1.5,
    };
  }
}
