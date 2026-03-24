import {
  type AbilityContext,
  type AbilityResult,
  type AccuracyContext,
  type ActivePokemon,
  BaseRuleset,
  type BattleAction,
  type BattleSide,
  type BattleState,
  type CritContext,
  type DamageContext,
  type DamageResult,
  type EndOfTurnEffect,
  type EntryHazardResult,
  type ExpContext,
  type ItemContext,
  type ItemResult,
  type MoveEffectContext,
  type MoveEffectResult,
  type WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  EntryHazardType,
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
  DataManager,
  gen14MultiHitRoll,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import {
  applyGen3Ability,
  isGen3AbilityStatusImmune,
  isWeatherSuppressedGen3,
  WEATHER_SUPPRESSING_ABILITIES,
} from "./Gen3Abilities";
import { GEN3_CRIT_MULTIPLIER, GEN3_CRIT_RATE_DENOMINATORS } from "./Gen3CritCalc";
import { calculateGen3Damage } from "./Gen3DamageCalc";
import { applyGen3HeldItem } from "./Gen3Items";
import { executeGen3MoveEffect } from "./Gen3MoveEffects";
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
 *   - calculateStruggleRecoil — 1/4 damage dealt (Gen 3 RECOIL_25; Gen 4+ uses 1/4 max HP)
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

  /**
   * Weather context for speed-doubling abilities (Swift Swim, Chlorophyll).
   * getEffectiveSpeed() only receives ActivePokemon (no BattleState), so weather
   * must be stored as a class field during turn order resolution.
   * Set to null outside of turn order resolution.
   */
  private _currentWeather: string | null = null;

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

  // --- Stat Calculation ---

  /**
   * Gen 3 stat calculation with Shedinja HP=1 special case.
   *
   * Shedinja (SPECIES_SHEDINJA, id=292) always has exactly 1 HP regardless of
   * IVs, EVs, or level. This is a hardcoded special case in pokeemerald.
   *
   * Source: pret/pokeemerald src/pokemon.c CalculateMonStats:2845
   *   "if (species == SPECIES_SHEDINJA) { newMaxHP = 1; }"
   */
  override calculateStats(pokemon: PokemonInstance, species: PokemonSpeciesData): StatBlock {
    const stats = super.calculateStats(pokemon, species);
    // Shedinja has hardcoded HP=1 — override formula result
    // Source: pret/pokeemerald src/pokemon.c:2845 — SPECIES_SHEDINJA sets newMaxHP=1
    if (species.id === 292) {
      return { ...stats, hp: 1 };
    }
    return stats;
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

  // --- Ability System ---

  /**
   * Gen 3 ability trigger dispatch.
   *
   * Currently only "on-switch-in" is supported (the only trigger the engine calls).
   * Damage-calc abilities (Huge Power, Thick Fat, Wonder Guard, etc.) are handled
   * inline in calculateGen3Damage, not through this method.
   *
   * Source: pret/pokeemerald src/battle_util.c AbilityBattleEffects
   */
  applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    return applyGen3Ability(trigger, context);
  }

  // --- PP Cost (Pressure) ---

  /**
   * Pressure: when the target has Pressure, moves cost 2 PP instead of 1.
   *
   * Source: pret/pokeemerald src/battle_util.c — ABILITY_PRESSURE: deductsExtraMove
   * Source: Bulbapedia — "Pressure causes moves targeting the Ability-bearer to use 2 PP"
   */
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

  /**
   * Gen 3 critical hit roll.
   *
   * Fully overrides BaseRuleset.rollCritical because Gen 3 uses +1 for Focus Energy
   * (not +2 as in Gen 6+ BaseRuleset default).
   *
   * Battle Armor / Shell Armor: completely prevents critical hits.
   * Focus Energy: +1 crit stage (Gen 3-5; Gen 6+ uses +2).
   * Super Luck: +1 crit stage (Gen 3 ability).
   * Scope Lens / Razor Claw: +1 crit stage.
   * Leek/Stick (Farfetch'd) / Lucky Punch (Chansey): +2 crit stages.
   *
   * Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
   *   "if (gBattleMons[gBattlerAttacker].status2 & STATUS2_FOCUS_ENERGY) critChance += 1;"
   * Source: Bulbapedia — "In Generations III-V, Focus Energy adds 1 to the critical hit stage"
   */
  override rollCritical(context: CritContext): boolean {
    const defenderAbility = context.defender?.ability;
    if (defenderAbility === "battle-armor" || defenderAbility === "shell-armor") {
      return false;
    }

    const { attacker, move, rng } = context;
    const table = this.getCritRateTable();
    let stage = 0;

    // Focus Energy: +1 stage in Gen 3 (NOT +2 like Gen 6+)
    // Source: pret/pokeemerald src/battle_util.c — STATUS2_FOCUS_ENERGY: critChance += 1
    if (attacker.volatileStatuses.has("focus-energy")) stage += 1;

    // High crit-ratio move: from move data (e.g., Slash, Crabhammer = critRatio 1)
    // Source: pret/pokeemerald src/battle_util.c — move critRatio adds to crit stage
    if (move.critRatio && move.critRatio > 0) stage += move.critRatio;

    // Held item bonuses
    // Source: pret/pokeemerald src/battle_util.c — item crit stage modifiers
    const item = attacker.pokemon.heldItem;
    if (item === "scope-lens" || item === "razor-claw") stage += 1;
    if (
      (item === "leek" || item === "stick") &&
      (attacker.pokemon.speciesId === 83 || attacker.pokemon.speciesId === 865)
    ) {
      stage += 2;
    }
    if (item === "lucky-punch" && attacker.pokemon.speciesId === 113) stage += 2;

    // Ability: Super Luck (+1 stage)
    // Source: pret/pokeemerald src/battle_util.c — Super Luck ability crit bonus
    if (attacker.ability === "super-luck") stage += 1;

    stage = Math.min(stage, table.length - 1);
    const rate = table[stage];
    if (rate === undefined) return false;
    return rate <= 1 || rng.int(1, rate) === 1;
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
   * Gen 3 Struggle recoil: 1/4 of damage dealt.
   * Gen 4+ changed this to 1/4 of attacker's max HP (BaseRuleset default).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c:2636-2639
   * "case MOVE_EFFECT_RECOIL_25: gBattleMoveDamage = (gHpDealt) / 4;"
   */
  calculateStruggleRecoil(_attacker: ActivePokemon, damageDealt: number): number {
    return Math.max(1, Math.floor(damageDealt / 4));
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
  applyEntryHazards(
    pokemon: ActivePokemon,
    side: BattleSide,
    _state?: BattleState,
  ): EntryHazardResult {
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
    // Guard: 0-layer spikes cannot deal damage (engine should never create them, but be defensive)
    if (layers === 0) return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
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
    // Source: pret/pokeemerald src/battle_util.c GiveExpToMon — traded bonus applied after Lucky Egg
    // Gen 3+ tracks language in the Pokemon data structure; international trades give 1.7x.
    let exp = calculateExpGainClassic(
      context.defeatedSpecies.baseExp,
      context.defeatedLevel,
      context.isTrainerBattle,
      context.participantCount,
      context.hasLuckyEgg,
      context.isTradedPokemon ?? false,
      context.isInternationalTrade ?? false,
    );
    if (context.hasExpShare) {
      exp = Math.max(1, Math.floor(exp / 2));
    }
    return exp;
  }

  // --- Held Item System ---

  /**
   * Gen 3 has held items (inherited from Gen 2, modernized).
   */
  hasHeldItems(): boolean {
    return true;
  }

  /**
   * Gen 3 held item trigger dispatch.
   *
   * Delegates to applyGen3HeldItem for end-of-turn, on-damage-taken, and on-hit triggers.
   * Inline item effects (Choice Band, type boosters) are handled in Gen3DamageCalc.
   *
   * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects
   */
  applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen3HeldItem(trigger, context);
  }

  // --- Move Effects ---

  /**
   * Gen 3 move effect execution.
   *
   * Delegates to executeGen3MoveEffect in Gen3MoveEffects.ts for all move effect
   * processing including data-driven effects, ID-based interceptors, and custom handlers.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    return executeGen3MoveEffect(context);
  }

  /**
   * Gen 3 end-of-turn effect ordering.
   *
   * Source: pret/pokeemerald src/battle_main.c — end-of-turn phase ordering
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // Source: pret/pokeemerald src/battle_main.c — end-of-turn phase ordering
    // Ingrain heals after Leftovers per pokeemerald residual order
    // "uproar" added between perish-song and speed-boost per pokeemerald end-of-turn order.
    // Source: Spec 04-gen3.md line 1038 — "13. Uproar wake-up check"
    return [
      "weather-damage",
      "future-attack",
      "wish",
      "weather-healing",
      "leftovers",
      "ingrain",
      "status-damage",
      "leech-seed",
      "curse",
      "nightmare",
      "bind",
      "stat-boosting-items",
      "encore-countdown",
      "disable-countdown",
      "taunt-countdown",
      "perish-song",
      "uproar" as EndOfTurnEffect, // "uproar" added in battle source but not yet in installed package types
      "speed-boost",
      "shed-skin",
      "weather-countdown",
    ];
  }

  // --- Turn Order (Quick Claw) ---

  /**
   * Pre-rolls Quick Claw for each move action before the main sort.
   * Quick Claw gives a 20% chance to move first among same-priority actions.
   *
   * Overrides the BaseRuleset hook so PRNG calls (QC rolls) happen before tiebreak
   * keys are assigned, preserving PRNG consumption order.
   *
   * Source: pret/pokeemerald src/battle_main.c:4653
   * "if (holdEffect == HOLD_EFFECT_QUICK_CLAW && gRandomTurnNumber < (0xFFFF * holdEffectParam) / 100)"
   * holdEffectParam = 20 (from src/data/items.h:2241), giving 20.00% activation.
   */
  protected override getQuickClawActivated(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): Set<number> {
    const quickClawActivated = new Set<number>();
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action && action.type === "move") {
        const side = state.sides[action.side];
        const active = side?.active[0];
        if (active?.pokemon.heldItem === "quick-claw") {
          // 20% chance to activate
          // Source: pret/pokeemerald src/battle_main.c:4653 — (0xFFFF * 20) / 100 = 13107
          // gRandomTurnNumber < 13107 out of 65536 = 20.00%
          if (rng.chance(0.2)) {
            quickClawActivated.add(i);
          }
        }
      }
    }
    return quickClawActivated;
  }

  // --- Accuracy System ---

  /**
   * Gen 3 accuracy check using the exact pokeemerald sAccuracyStageRatios table.
   *
   * The accuracy/evasion stage ratios from pokeemerald differ from the simplified
   * 3-based formula in BaseRuleset at stages -5 (36/100 vs 37%) and -4 (43/100 vs 42%).
   *
   * Algorithm (from pokeemerald src/battle_script_commands.c:1099-1188 Cmd_accuracycheck):
   *   1. Net stage = accStage + DEFAULT_STAT_STAGE - evaStage (clamped to [-6, +6])
   *   2. calc = sAccuracyStageRatios[buff].dividend * moveAcc / sAccuracyStageRatios[buff].divisor
   *   3. Ability modifiers (Compound Eyes, Sand Veil, Hustle)
   *   4. Hold item modifiers (BrightPowder, Lax Incense)
   *   5. Hit if (Random() % 100 + 1) <= calc
   *
   * Source: pret/pokeemerald src/battle_script_commands.c:588 sAccuracyStageRatios
   */
  doesMoveHit(context: AccuracyContext): boolean {
    // Never-miss moves (accuracy === null)
    if (context.move.accuracy === null) return true;

    // --- OHKO level-based accuracy check ---
    // Source: pret/pokeemerald src/battle_script_commands.c:7525-7529 (Cmd_ohkoattempt)
    //   chance = gBattleMoves[gCurrentMove].accuracy + (attackerLevel - defenderLevel);
    //   if (Random() % 100 + 1 < chance && attackerLevel >= defenderLevel) → hits
    //   else → misses
    // OHKO moves have base accuracy 30 in the data, so effective chance = 30 + (attackerLevel - defenderLevel).
    // Auto-miss when attackerLevel < defenderLevel (regardless of chance value).
    // Hit condition: rng.int(1, 100) < chance  (strict less-than, matching pokeemerald's "< chance").
    if (context.move.effect?.type === "ohko") {
      const attackerLevel = context.attacker.pokemon.level;
      const defenderLevel = context.defender.pokemon.level;
      // Auto-miss if attacker is lower level than defender
      if (attackerLevel < defenderLevel) return false;
      // OHKO moves have base accuracy 30; effective chance = 30 + (attackerLevel - defenderLevel)
      const ohkoAccuracy = (context.move.accuracy ?? 30) + (attackerLevel - defenderLevel);
      // pokeemerald: Random() % 100 + 1 < chance  (strictly less-than)
      return context.rng.int(1, 100) < ohkoAccuracy;
    }

    // --- Weather-based accuracy overrides ---
    // Source: pret/pokeemerald src/battle_script_commands.c Cmd_accuracycheck
    // Source: Showdown data/moves.ts — Thunder/Blizzard onModifyMove
    // Cloud Nine / Air Lock suppress weather for accuracy purposes.
    // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
    const rawWeather = context.state.weather?.type ?? null;
    const weather = isWeatherSuppressedGen3(context.attacker, context.defender) ? null : rawWeather;

    // Thunder: 100% accuracy in Rain, 50% accuracy in Sun
    // Source: pret/pokeemerald — Thunder bypasses accuracy in rain
    // Source: Showdown data/moves.ts — Thunder: move.accuracy = true in raindance
    if (context.move.id === "thunder") {
      if (weather === "rain") return true;
      if (weather === "sun") {
        // Override accuracy to 50 and continue with normal check
        const accStage = context.attacker.statStages.accuracy;
        const evaStage = context.defender.statStages.evasion;
        const netStage = Math.max(-6, Math.min(6, accStage - evaStage));
        const ratio = GEN3_ACCURACY_STAGE_RATIOS[netStage + 6] as {
          dividend: number;
          divisor: number;
        };
        const calc = Math.floor((ratio.dividend * 50) / ratio.divisor);
        return context.rng.int(1, 100) <= calc;
      }
    }

    const moveAcc = context.move.accuracy;
    const accStage = context.attacker.statStages.accuracy;
    const evaStage = context.defender.statStages.evasion;

    // Net stage calculation: acc - eva, clamped to [-6, +6]
    // Source: pret/pokeemerald src/battle_script_commands.c:1136
    // "buff = acc + DEFAULT_STAT_STAGE - gBattleMons[gBattlerTarget].statStages[STAT_EVASION];"
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    // Apply accuracy stage ratio from the pokeemerald table
    // Source: pret/pokeemerald src/battle_script_commands.c:1149-1150
    // netStage is clamped to [-6, +6] so index is always 0-12 (valid)
    const ratio = GEN3_ACCURACY_STAGE_RATIOS[netStage + 6] as {
      dividend: number;
      divisor: number;
    };
    let calc = Math.floor((ratio.dividend * moveAcc) / ratio.divisor);

    // Compound Eyes: 1.3x accuracy
    // Source: pret/pokeemerald src/battle_script_commands.c:1152-1153
    if (context.attacker.ability === "compound-eyes") {
      calc = Math.floor((calc * 130) / 100);
    }

    // Sand Veil: 0.8x accuracy in sandstorm (WeatherType uses "sand" for sandstorm)
    // Source: pret/pokeemerald src/battle_script_commands.c:1154-1155
    // Uses `weather` (already suppressed by Cloud Nine / Air Lock above)
    if (context.defender.ability === "sand-veil" && weather === "sand") {
      calc = Math.floor((calc * 80) / 100);
    }

    // BrightPowder / Lax Incense: reduce accuracy by 10% (multiply by 90/100)
    // Source: pret/pokeemerald src/battle_script_commands.c:1160-1165
    // "if (IsHoldEffectActive(gBattlerTarget, HOLD_EFFECT_EVASION_UP))
    //    calc -= calc * holdEffectModifier / 100;"
    // holdEffectModifier = 10 for BrightPowder, 5 for Lax Incense (pokeemerald uses 10 for both)
    // Source: Showdown data/mods/gen3/items.ts — BrightPowder/Lax Incense both use 0.9x accuracy
    const defenderItem = context.defender.pokemon.heldItem;
    if (defenderItem === "bright-powder" || defenderItem === "lax-incense") {
      calc = Math.floor((calc * 90) / 100);
    }

    // Hustle: 0.8x accuracy for physical moves
    // Source: pret/pokeemerald src/battle_script_commands.c:1156-1157
    if (context.attacker.ability === "hustle") {
      // Check if move type is physical (Gen 3 physical/special split is by type)
      const physicalTypes = new Set([
        "normal",
        "fighting",
        "flying",
        "poison",
        "ground",
        "rock",
        "bug",
        "ghost",
        "steel",
      ]);
      if (physicalTypes.has(context.move.type)) {
        calc = Math.floor((calc * 80) / 100);
      }
    }

    // Final accuracy check: (Random() % 100 + 1) > calc means miss
    // Source: pret/pokeemerald src/battle_script_commands.c:1176
    // "if ((Random() % 100 + 1) > calc)" → miss
    // Equivalent: hit if roll <= calc, where roll is 1-100
    return context.rng.int(1, 100) <= calc;
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

    // Chlorophyll: 2x Speed in sun
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_CHLOROPHYLL
    // Source: Showdown data/abilities.ts — Chlorophyll onModifySpe
    if (active.ability === "chlorophyll" && this._currentWeather === "sun") {
      effective = effective * 2;
    }

    // Swift Swim: 2x Speed in rain
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SWIFT_SWIM
    // Source: Showdown data/abilities.ts — Swift Swim onModifySpe
    if (active.ability === "swift-swim" && this._currentWeather === "rain") {
      effective = effective * 2;
    }

    // Macho Brace: halves Speed in battle
    // Source: pret/pokeemerald src/battle_util.c — HOLD_EFFECT_MACHO_BRACE halves speed
    // Source: Bulbapedia — "Macho Brace halves the holder's Speed stat"
    if (active.pokemon.heldItem === "macho-brace") {
      effective = Math.floor(effective / 2);
    }

    if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (×0.25)
      // Source: pret/pokeemerald src/battle_util.c
      effective = Math.floor(effective * 0.25);
    }
    return Math.max(1, effective);
  }

  // --- Semi-Invulnerable Targeting ---

  /**
   * Gen 3 semi-invulnerable move targeting.
   *
   * Certain moves can hit targets during the semi-invulnerable turn of two-turn moves:
   *   - "flying" (Fly): Thunder, Twister, Gust, Sky Uppercut can hit
   *   - "underground" (Dig): Earthquake, Magnitude can hit
   *   - "underwater" (Dive): Surf, Whirlpool can hit
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — semi-invulnerable checks
   * Source: Bulbapedia — Two-turn move vulnerability table
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
    switch (volatile) {
      case "flying":
        // Thunder, Twister, Gust, Sky Uppercut can hit Fly
        // Source: pret/pokeemerald — STATUS3_ON_AIR hit checks
        return ["thunder", "twister", "gust", "sky-uppercut"].includes(moveId);
      case "underground":
        // Earthquake, Magnitude can hit Dig
        // Source: pret/pokeemerald — STATUS3_UNDERGROUND hit checks
        return ["earthquake", "magnitude"].includes(moveId);
      case "underwater":
        // Surf, Whirlpool can hit Dive
        // Source: pret/pokeemerald — STATUS3_UNDERWATER hit checks
        return ["surf", "whirlpool"].includes(moveId);
      case "charging":
        // Generic charging moves (SolarBeam, Skull Bash, Razor Wind, Sky Attack, Bounce on
        // second turn) are NOT semi-invulnerable — all moves can hit a charging Pokemon.
        // Source: pret/pokeemerald — no hit-immunity for EFFECT_SKULL_BASH/RAZOR_WIND/SKY_ATTACK
        return true;
      default:
        return false;
    }
  }

  // --- Protect Success Rate ---

  /**
   * Gen 3 Protect/Detect consecutive activation formula.
   *
   * Gen 3 uses a halving formula: each additional consecutive protect halves the chance.
   *   - consecutiveProtects=0: always succeeds (first use is guaranteed)
   *   - consecutiveProtects=1: 50% (1/2)
   *   - consecutiveProtects=2: 25% (1/4)
   *   - consecutiveProtects>=3: 12.5% (1/8) — capped at index 3
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — sProtectSuccessRate table
   * has 4 entries [65535, 32768, 16384, 8192] (out of 65535 max), then caps counter at 3.
   */
  override rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    if (consecutiveProtects === 0) return true;
    // Cap at 3 consecutive uses (index 3 = 12.5%)
    // Source: pret/pokeemerald — sProtectSuccessRate has 4 entries, counter caps at 3
    const capped = Math.min(consecutiveProtects, 3);
    const denominator = 2 ** capped; // 2, 4, 8
    return rng.chance(1 / denominator);
  }

  // --- Switch Restrictions (#229: trapping abilities) ---

  /**
   * Gen 3 switch restrictions: "trapped" volatile + trapping abilities.
   *
   * Trapping abilities in Gen 3:
   *   - Shadow Tag: traps non-Shadow-Tag opponents
   *   - Arena Trap: traps grounded (non-Flying, non-Levitate) opponents
   *     NOTE: No Gravity in Gen 3 (introduced Gen 4), so no gravity grounding check.
   *   - Magnet Pull: traps Steel-type opponents
   *
   * Source: pret/pokeemerald src/battle_util.c — trapping ability checks
   * Source: Bulbapedia — Shadow Tag, Arena Trap, Magnet Pull
   */
  override canSwitch(pokemon: ActivePokemon, state: BattleState): boolean {
    // "trapped" volatile (Mean Look, Spider Web, Block)
    if (pokemon.volatileStatuses.has("trapped")) return false;

    // Find which side the pokemon is on and get the opponent
    const pokemonSide = state.sides[0].active[0] === pokemon ? 0 : 1;
    const opponentSide = pokemonSide === 0 ? 1 : 0;
    const opponent = state.sides[opponentSide].active[0];
    if (!opponent || opponent.pokemon.currentHp <= 0) return true;

    const oppAbility = opponent.ability;

    // Shadow Tag: traps non-Shadow-Tag opponents
    // Source: pret/pokeemerald — ABILITY_SHADOW_TAG traps all non-Shadow-Tag foes
    if (oppAbility === "shadow-tag" && pokemon.ability !== "shadow-tag") return false;

    // Arena Trap: traps grounded (non-Flying, non-Levitate) opponents
    // NOTE: No Gravity in Gen 3 (Gen 4+), so no gravity grounding check.
    // Source: pret/pokeemerald — ABILITY_ARENA_TRAP traps non-Flying, non-Levitate foes
    if (oppAbility === "arena-trap") {
      const isFlying = pokemon.types.includes("flying");
      const hasLevitate = pokemon.ability === "levitate";
      if (!isFlying && !hasLevitate) return false;
    }

    // Magnet Pull: traps Steel-type opponents
    // Source: pret/pokeemerald — ABILITY_MAGNET_PULL traps Steel-type foes
    if (oppAbility === "magnet-pull" && pokemon.types.includes("steel")) return false;

    return true;
  }

  // --- Sleep Processing (#227 partial: Early Bird) ---

  /**
   * Gen 3 sleep turn processing with Early Bird support.
   *
   * Early Bird: sleep counter decrements by 2 instead of 1 each turn.
   * Gen 3 behavior: Pokemon CAN act on the turn they wake up.
   * This was a key change from Gen 1-2 (where Pokemon could NOT act on wake turn).
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — sleep counter is decremented
   *   before move execution; if counter reaches 0, Pokemon wakes and can act.
   * Source: Bulbapedia — "Starting in Generation III, a Pokemon can attack on the
   *   turn it wakes up."
   */
  override processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // No counter found or already at 0 — wake up, CAN act (Gen 3+)
      // Source: pret/pokeemerald — Pokemon acts on wake turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }

    // Early Bird: decrement by 2 instead of 1
    // Source: pret/pokeemerald — ABILITY_EARLY_BIRD: sleepTimer decremented twice
    const decrement = pokemon.ability === "early-bird" ? 2 : 1;
    sleepState.turnsLeft = Math.max(0, sleepState.turnsLeft - decrement);

    if (sleepState.turnsLeft <= 0) {
      // Counter just reached 0 — wake up, CAN act (Gen 3+)
      // Source: pret/pokeemerald src/battle_script_commands.c — wake and act same turn
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }

    return false; // Still sleeping — cannot act
  }

  // --- Switch Out (#227 partial: Natural Cure) ---

  /**
   * Gen 3 switch-out processing with Natural Cure.
   *
   * Natural Cure: cures all primary status conditions when the Pokemon switches out.
   *
   * Source: pret/pokeemerald src/battle_util.c — ABILITY_NATURAL_CURE on switch-out
   * Source: Bulbapedia — "Natural Cure heals any status condition upon switching out."
   */
  override onSwitchOut(pokemon: ActivePokemon, state: BattleState): void {
    // Natural Cure: cure status condition on switch-out
    if (pokemon.ability === "natural-cure" && pokemon.pokemon.status !== null) {
      pokemon.pokemon.status = null;
    }
    // Delegate to BaseRuleset for standard volatile clearing
    super.onSwitchOut(pokemon, state);
  }

  /**
   * Override resolveTurnOrder to set weather context for speed-doubling abilities
   * (Swift Swim, Chlorophyll). Sets _currentWeather before sort so getEffectiveSpeed
   * can access it, then clears it after.
   *
   * Source: pret/pokeemerald src/battle_main.c — speed modifiers applied during turn order
   */
  override resolveTurnOrder(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): BattleAction[] {
    // Cloud Nine / Air Lock suppress weather for speed-doubling abilities too.
    // Source: pret/pokeemerald src/battle_util.c — WEATHER_HAS_EFFECT macro
    const rawWeather = state.weather?.type ?? null;
    let weatherSuppressed = false;
    if (rawWeather) {
      for (const side of state.sides) {
        for (const active of side.active) {
          if (active && WEATHER_SUPPRESSING_ABILITIES.has(active.ability)) {
            weatherSuppressed = true;
            break;
          }
        }
        if (weatherSuppressed) break;
      }
    }
    this._currentWeather = weatherSuppressed ? null : rawWeather;
    const result = super.resolveTurnOrder(actions, state, rng);
    this._currentWeather = null;
    return result;
  }
}

// ─── Gen 3 Accuracy Stage Ratios ──────────────────────────────────────────

/**
 * Exact accuracy stage ratios from the pokeemerald disassembly.
 *
 * Indexed by stage + 6 (stage -6 = index 0, stage +6 = index 12).
 *
 * These differ from the simplified 3-based formula at stages:
 *   -5: 36/100 (decomp) vs 37.5% (3-based)
 *   -4: 43/100 (decomp) vs 42.8% (3-based)
 *   +3: 200/100 (decomp) vs 200% (3-based) — same
 *   +5: 133/50 (decomp) = 266% vs 266.6% (3-based) — rounding differs
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:588-603 sAccuracyStageRatios
 */
const GEN3_ACCURACY_STAGE_RATIOS: ReadonlyArray<{ dividend: number; divisor: number }> = [
  { dividend: 33, divisor: 100 }, // stage -6
  { dividend: 36, divisor: 100 }, // stage -5
  { dividend: 43, divisor: 100 }, // stage -4
  { dividend: 50, divisor: 100 }, // stage -3
  { dividend: 60, divisor: 100 }, // stage -2
  { dividend: 75, divisor: 100 }, // stage -1
  { dividend: 1, divisor: 1 }, //   stage  0
  { dividend: 133, divisor: 100 }, // stage +1
  { dividend: 166, divisor: 100 }, // stage +2
  { dividend: 2, divisor: 1 }, //   stage +3
  { dividend: 233, divisor: 100 }, // stage +4
  { dividend: 133, divisor: 50 }, // stage +5
  { dividend: 3, divisor: 1 }, //   stage +6
];

// ─── Gen 3 Status Immunity ─────────────────────────────────────────────────

/**
 * Gen 3 type immunities to status conditions.
 *
 * In Gen 3, there is NO type-based paralysis immunity for Electric types.
 * Electric-type paralysis immunity was introduced in Gen 6 (blanket).
 * Gen 4-5 had partial immunity (Electric-type moves only), but Gen 3 has none.
 *
 * - Fire: immune to burn
 * - Ice: immune to freeze
 * - Poison/Steel: immune to poison and badly-poisoned
 *
 * Note: Limber ability also prevents paralysis, but that's handled by the
 * ability system, not here. This function only checks type-based immunity.
 *
 * Source: pret/pokeemerald src/battle_util.c — CanBeStatusd has no Electric-type
 *   paralysis check. Confirmed by Bulbapedia: "In Generation VI onward,
 *   Electric-type Pokemon are immune to paralysis."
 */
const GEN3_STATUS_IMMUNITIES: Record<string, readonly PokemonType[]> = {
  burn: ["fire"],
  poison: ["poison", "steel"],
  "badly-poisoned": ["poison", "steel"],
  freeze: ["ice"],
  // No paralysis immunity for Electric types in Gen 3
  // Source: pret/pokeemerald src/battle_util.c — no such check exists
};

/**
 * Check whether a status condition can be inflicted on a target Pokemon in Gen 3.
 *
 * @param status - The status to attempt to inflict
 * @param target - The target Pokemon
 * @returns true if the status can be inflicted
 */
export function canInflictGen3Status(status: PrimaryStatus, target: ActivePokemon): boolean {
  // Can't have two primary statuses at once
  if (target.pokemon.status !== null) {
    return false;
  }

  // Check type immunities
  // Source: pret/pokeemerald src/battle_util.c
  const immuneTypes = GEN3_STATUS_IMMUNITIES[status];
  if (immuneTypes) {
    for (const type of target.types) {
      if (immuneTypes.includes(type)) {
        return false;
      }
    }
  }

  // Check ability immunities (Immunity, Insomnia, Vital Spirit, Limber, Water Veil, Magma Armor)
  // Source: pret/pokeemerald src/battle_util.c — ability checks in CanBeStatusd
  if (isGen3AbilityStatusImmune(target.ability, status)) {
    return false;
  }

  return true;
}
