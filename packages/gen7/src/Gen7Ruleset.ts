import type {
  AbilityContext,
  AbilityResult,
  ActivePokemon,
  BattleAction,
  BattleGimmick,
  BattleGimmickType,
  BattleSide,
  BattleState,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  DataManager,
  Gen7TwoTurnMoveVolatile,
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TwoTurnMoveVolatile,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_VOLATILE_IDS,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import { createGen7DataManager } from "./data/index.js";
import {
  handleGen7DamageCalcAbility,
  handleGen7DamageImmunityAbility,
} from "./Gen7AbilitiesDamage.js";
import { handleGen7NewAbility } from "./Gen7AbilitiesNew.js";
import { handleGen7StatAbility, isPranksterBlockedByDarkType } from "./Gen7AbilitiesStat.js";
import { handleGen7SwitchAbility } from "./Gen7AbilitiesSwitch.js";
import { calculateGen7Damage } from "./Gen7DamageCalc.js";
import { applyGen7EntryHazards } from "./Gen7EntryHazards.js";
import { applyGen7HeldItem } from "./Gen7Items.js";
import { Gen7MegaEvolution } from "./Gen7MegaEvolution.js";
import { executeGen7MoveEffect, isGen7GrassPowderBlocked } from "./Gen7MoveEffects.js";
import {
  applyGen7TerrainEffects,
  checkGen7TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  handleSurgeAbility,
  isSurgeAbility,
} from "./Gen7Terrain.js";
import { GEN7_TYPE_CHART, GEN7_TYPES } from "./Gen7TypeChart.js";
import { applyGen7WeatherEffects, isWeatherSuppressedOnFieldGen7 } from "./Gen7Weather.js";
import { Gen7ZMove } from "./Gen7ZMove.js";

/**
 * Gen 7 (Sun/Moon/Ultra Sun/Ultra Moon) ruleset.
 *
 * Extends BaseRuleset and overrides the methods that differ in Gen 7.
 *
 * Key Gen 7 differences from Gen 6:
 *   - Z-Moves (new battle gimmick, coexists with Mega Evolution)
 *   - Terrain system enhanced: 1.5x damage boost for grounded Pokemon (was 1.3x in Gen 6)
 *   - Surge abilities: Electric/Grassy/Psychic/Misty Surge set terrain on switch-in
 *   - Burn damage: 1/16 max HP (was 1/8 in Gen 3-6)
 *   - Paralysis speed penalty: 0.5x (was 0.25x in Gen 3-6) -- inherited from BaseRuleset
 *   - Confusion self-hit: 33% (was 50% in Gen 1-6)
 *   - Prankster status moves fail against Dark-type targets
 *   - Gale Wings only works at full HP (was unconditional in Gen 6)
 *   - Parental Bond second hit: 25% (was 50% in Gen 6)
 *   - Aurora Veil (new move, reduces damage like dual screens, hail-only)
 *   - Baneful Bunker (new protect variant, poisons on contact)
 *   - Beast Boost, Disguise, Schooling, Stamina, Battle Bond (new abilities)
 *
 * Key Gen 7 inherits from BaseRuleset (Gen 7+ defaults):
 *   - getCritRateTable: [24, 8, 2, 1]
 *   - getCritMultiplier: 1.5x
 *   - getEffectiveSpeed: paralysis 0.5x (Gen 7+ default)
 *   - rollSleepTurns: 1-3
 *   - rollMultiHitCount: 35/35/15/15% for 2/3/4/5
 *   - rollProtectSuccess: 3^N denominator
 *   - applyStatusDamage: burn 1/16 (Gen 7+ default in BaseRuleset)
 *
 * Source: references/pokemon-showdown/data/ (Gen 7 data)
 * Source: specs/battle/08-gen7.md
 */
export class Gen7Ruleset extends BaseRuleset {
  readonly generation = 7 as const;
  readonly name = "Gen 7 (Sun/Moon/Ultra Sun/Ultra Moon)";

  /**
   * Temporary weather state set during resolveTurnOrder so that getEffectiveSpeed
   * can read it. The protected getEffectiveSpeed signature only takes ActivePokemon
   * (inherited from BaseRuleset), but Chlorophyll/Swift Swim/Sand Rush need weather context.
   * Set to null outside of turn order resolution.
   *
   * Source: Pattern from Gen5Ruleset._currentWeather and Gen6Ruleset._currentWeather
   */
  private _currentWeather: string | null = null;

  /**
   * Temporary terrain state set during resolveTurnOrder so that getEffectiveSpeed
   * can read it for Surge Surfer (doubles Speed on Electric Terrain).
   * Set to null outside of turn order resolution.
   *
   * Source: Showdown data/abilities.ts -- surgesurfer: onModifySpe
   */
  private _currentTerrain: string | null = null;

  constructor(dataManager?: DataManager) {
    super(dataManager ?? createGen7DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN7_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN7_TYPES;
  }

  // --- Terrain ---

  /**
   * Gen 7 has terrain (Electric, Grassy, Misty, Psychic).
   * Enhanced from Gen 6: terrain damage boost is 1.5x (was 1.3x in Gen 6).
   *
   * Source: Bulbapedia -- Terrain damage boost increased to 1.5x in Gen 7
   * Source: Showdown sim/field.ts -- terrain effects
   */
  hasTerrain(): boolean {
    return true;
  }

  /**
   * Gen 7 terrain end-of-turn effects.
   *
   * Currently handles Grassy Terrain healing (1/16 max HP for grounded Pokemon).
   *
   * Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT for grounded Pokemon
   * Source: Showdown data/conditions.ts -- grassyterrain.onResidual
   */
  override applyTerrainEffects(state: BattleState): TerrainEffectResult[] {
    return applyGen7TerrainEffects(state);
  }

  /**
   * Check if a primary status condition can be inflicted on a target,
   * considering active terrain effects.
   *
   * - Electric Terrain: grounded Pokemon cannot fall asleep
   * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
   * - Psychic Terrain: blocks priority moves against grounded targets (handled elsewhere)
   *
   * Source: Bulbapedia "Electric Terrain" Gen 7 -- "Grounded Pokemon cannot fall asleep."
   * Source: Bulbapedia "Misty Terrain" Gen 7 -- "Grounded Pokemon are protected from
   *   status conditions."
   * Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
   */
  checkTerrainStatusImmunity(
    status: PrimaryStatus,
    target: ActivePokemon,
    state: BattleState,
  ): { immune: boolean; message?: string } {
    return checkGen7TerrainStatusImmunity(status, target, state);
  }

  // --- Move Effects ---

  /**
   * Gen 7 move effect dispatch.
   *
   * Handles:
   *   - Grass-type powder immunity (Gen 6+ carry-forward)
   *   - Aurora Veil (Hail-only dual screen)
   *   - Baneful Bunker (new Gen 7 protect variant)
   *   - Protect variants (King's Shield with -2 Atk, Spiky Shield, Mat Block, Crafty Shield)
   *   - Two-turn moves (Fly, Dig, Dive, Bounce, Solar Beam, Solar Blade, Phantom Force,
   *     Shadow Force, Sky Attack)
   *   - Drain effects (Giga Drain, Drain Kiss, Leech Life, etc.)
   *
   * Falls through to BaseRuleset for unrecognized moves.
   *
   * Source: Showdown data/moves.ts -- Gen 7 move handlers
   * Source: Showdown data/mods/gen7/moves.ts -- Gen 7 overrides
   */
  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    // Gen 6+: Grass types are immune to powder/spore moves
    // Source: Showdown data/moves.ts -- every powder move checks target.hasType('Grass')
    // Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
    //   powder and spore moves."
    if (isGen7GrassPowderBlocked(context.move, context.defender.types)) {
      const defenderName =
        context.defender.pokemon.nickname ?? String(context.defender.pokemon.speciesId);
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [`It doesn't affect ${defenderName}...`],
      };
    }

    // Try Gen 7-specific move effects first
    const gen7Result = executeGen7MoveEffect(
      context,
      context.state.rng,
      this.rollProtectSuccess.bind(this),
    );
    if (gen7Result !== null) return gen7Result;

    // Fall through to BaseRuleset for default handling
    return super.executeMoveEffect(context);
  }

  // --- Ability System ---

  /**
   * Gen 7 ability dispatch.
   *
   * Routes to sub-modules by trigger type:
   *   - on-switch-in: Surge abilities (Electric/Grassy/Psychic/Misty Surge)
   *   - on-damage-calc: damage modifiers (Tough Claws, Sheer Force, etc.)
   *   - on-damage-taken: damage immunity (Sturdy), stat triggers (Justified,
   *     Weak Armor Gen 7, Stamina, Rattled)
   *   - on-priority-check: Prankster (fails vs Dark), Gale Wings (full HP only), Triage
   *   - on-after-move-used: Moxie, Beast Boost
   *   - on-stat-change: Defiant, Competitive, Contrary, Simple
   *   - on-turn-end: Speed Boost, Moody
   *   - on-flinch: Steadfast
   *   - on-before-move: Protean
   *
   * Source: Showdown data/abilities.ts -- Gen 7 ability handlers
   */
  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    const noActivation: AbilityResult = { activated: false, effects: [], messages: [] };

    // Try new Gen 7 abilities first (Disguise, Schooling, Battle Bond, etc.)
    // These have their own trigger routing
    const newAbilityResult = handleGen7NewAbility(context);
    if (newAbilityResult.activated) return newAbilityResult;

    switch (trigger) {
      case CORE_ABILITY_TRIGGER_IDS.onSwitchIn: {
        // Surge abilities trigger on switch-in
        // Source: Showdown data/abilities.ts -- electricsurge/grassysurge/psychicsurge/mistysurge
        if (isSurgeAbility(context.pokemon.ability)) {
          return handleSurgeAbility(context);
        }
        // Switch-in abilities: Intimidate, weather, Download, Trace, Mold Breaker, etc.
        const switchResult = handleGen7SwitchAbility(trigger, context);
        if (switchResult.activated) return switchResult;
        return noActivation;
      }

      case CORE_ABILITY_TRIGGER_IDS.onSwitchOut: {
        // Switch-out abilities: Regenerator, Natural Cure
        return handleGen7SwitchAbility(trigger, context);
      }

      case CORE_ABILITY_TRIGGER_IDS.onContact: {
        // Contact abilities: Rough Skin, Flame Body, Static, Mummy, Gooey, etc.
        return handleGen7SwitchAbility(trigger, context);
      }

      case CORE_ABILITY_TRIGGER_IDS.onStatusInflicted: {
        // Status-inflicted abilities: Synchronize
        return handleGen7SwitchAbility(trigger, context);
      }

      case CORE_ABILITY_TRIGGER_IDS.onDamageCalc: {
        // Damage-calc abilities (attacker/defender modifiers)
        return handleGen7DamageCalcAbility(context);
      }

      case CORE_ABILITY_TRIGGER_IDS.onDamageTaken: {
        // Damage immunity (Sturdy OHKO block) first, then stat triggers
        const immunityResult = handleGen7DamageImmunityAbility(context);
        if (immunityResult.activated) return immunityResult;
        return handleGen7StatAbility(context);
      }

      case CORE_ABILITY_TRIGGER_IDS.onPriorityCheck:
      case CORE_ABILITY_TRIGGER_IDS.onAfterMoveUsed:
      case CORE_ABILITY_TRIGGER_IDS.onStatChange:
      case CORE_ABILITY_TRIGGER_IDS.onTurnEnd:
      case CORE_ABILITY_TRIGGER_IDS.onFlinch:
      case CORE_ABILITY_TRIGGER_IDS.onItemUse:
      case CORE_ABILITY_TRIGGER_IDS.onBeforeMove:
      case CORE_ABILITY_TRIGGER_IDS.passiveImmunity: {
        return handleGen7StatAbility(context);
      }

      default:
        return noActivation;
    }
  }

  // --- Damage Calculation ---

  /**
   * Gen 7 damage formula stub.
   * Will be fully implemented in Wave 2 (Damage Calc).
   *
   * The Gen 7 damage formula is fundamentally the same as Gen 6 with adjustments:
   *   - Terrain boost: 1.5x (was 1.3x in Gen 6)
   *   - Parental Bond second hit: 25% (was 50% in Gen 6)
   *   - Z-Move damage calculations
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 7 damage formula
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen7Damage(context, this.getTypeChart());
  }

  /**
   * Gen 7: Z-Moves bypass Protect at 0.25x damage.
   * A move is a Z-Move if its zMovePower is set and > 0.
   *
   * Source: Showdown sim/battle-actions.ts -- Z-Moves bypass Protect at 0.25x
   * Source: Bulbapedia "Z-Move" -- "deals a quarter of its damage" through Protect
   */
  override canBypassProtect(
    move: MoveData,
    _actor: ActivePokemon,
    _activeVolatile: "protect" | "max-guard",
  ): boolean {
    return move.zMovePower != null && move.zMovePower > 0;
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
   * Cap lethal damage for Disguise (Gen 7), Sturdy, and Focus Sash.
   *
   * Disguise: block first hit entirely (Gen 7: no chip damage on break). Priority 1.
   * Sturdy: survive any hit from full HP at 1 HP. Priority -30.
   * Focus Sash: survive any hit from full HP at 1 HP (item, consumed). Priority -100.
   *
   * Focus Sash is suppressed by Klutz (ability) and Embargo (volatile).
   * Source: Showdown data/abilities.ts -- klutz: item has no effect
   * Source: Showdown data/moves.ts -- embargo: target's item is unusable
   *
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   * Source: Showdown data/abilities.ts -- disguise: onDamage (priority 1)
   * Source: Showdown data/items.ts -- Focus Sash: onDamage at full HP
   * Source: Bulbapedia -- Sturdy (Ability), Disguise (Ability), Focus Sash
   */
  capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    move: MoveData,
    state: BattleState,
  ): { damage: number; survived: boolean; messages: string[]; consumedItem?: string } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    const currentHp = defender.pokemon.currentHp;
    const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);

    // 1. Disguise: block damage entirely if Disguise hasn't broken
    // Disguise checks BEFORE Sturdy (higher priority in Showdown: priority 1 vs -30)
    // Gen 7: NO chip damage on Disguise break
    // Source: Showdown data/abilities.ts -- disguise onDamage priority 1
    if (
      defender.ability === "disguise" &&
      !defender.volatileStatuses.has(CORE_VOLATILE_IDS.disguiseBroken) &&
      move.category !== "status"
    ) {
      // Mark Disguise as broken so it cannot activate again
      // Source: Showdown data/abilities.ts -- disguise: sets disguise-broken volatile on activation
      defender.volatileStatuses.set(CORE_VOLATILE_IDS.disguiseBroken, { turnsLeft: -1 });
      return {
        damage: 0,
        survived: true,
        messages: [`${name}'s Disguise was busted!`],
      };
    }

    // 2. Sturdy (ability) -- priority -30
    if (defender.ability === "sturdy" && currentHp === maxHp && damage >= currentHp) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on thanks to Sturdy!`],
      };
    }

    // 3. Focus Sash (item) -- survive at 1 HP if at full HP, consumed
    // Source: Showdown data/items.ts -- Focus Sash onDamage
    // Source: Bulbapedia -- Focus Sash: "If holder is at full HP, survive with 1 HP"
    // Source: Showdown sim/battle.ts -- Magic Room suppresses all item effects
    const heldItem = defender.pokemon.heldItem;
    const itemSuppressed =
      defender.ability === CORE_ABILITY_IDS.klutz ||
      defender.volatileStatuses.has(CORE_VOLATILE_IDS.embargo) ||
      (state.magicRoom?.active ?? false);
    if (
      heldItem === CORE_ITEM_IDS.focusSash &&
      !itemSuppressed &&
      currentHp === maxHp &&
      damage >= currentHp
    ) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on with its Focus Sash!`],
        consumedItem: CORE_ITEM_IDS.focusSash,
      };
    }

    return { damage, survived: false, messages: [] };
  }

  // --- Semi-Invulnerable Hit Check ---

  /**
   * Gen 7 semi-invulnerable move bypass check (same as Gen 6).
   *
   * Source: Showdown data/moves.ts -- semi-invulnerable move interactions
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  canHitSemiInvulnerable(moveId: string, volatile: Gen7TwoTurnMoveVolatile): boolean;
  override canHitSemiInvulnerable(moveId: string, volatile: TwoTurnMoveVolatile): boolean {
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

  // --- Critical Hit System ---

  /**
   * Gen 7 critical hit roll with Battle Armor / Shell Armor immunity.
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
   * Gen 7+ confusion self-hit chance is 33% (was 50% in Gen 1-6).
   *
   * Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting
   *   itself in confusion has decreased from 50% to approximately 33%."
   * Source: Showdown sim/battle-actions.ts -- Gen 7 confusion chance
   */
  override rollConfusionSelfHit(rng: SeededRandom): boolean {
    return rng.chance(1 / 3);
  }

  /**
   * Returns the confusion self-hit chance for Gen 7 (33%).
   *
   * Source: Bulbapedia -- Gen 7+ confusion self-hit chance is ~33%
   */
  override getConfusionSelfHitChance(): number {
    return 1 / 3;
  }

  // --- Speed ---

  /**
   * Gen 7 effective speed calculation.
   *
   * Gen 7 inherits the BaseRuleset default (paralysis 0.5x) which is correct.
   * Weather abilities and held items are added here for Gen 7.
   *
   * Source: Showdown sim/pokemon.ts -- Gen 7 speed modifiers
   * Source: Bulbapedia -- individual ability/item pages
   */
  protected override getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Simple: doubles all stat stage effects
    // Source: Bulbapedia -- Simple doubles stat stage effects
    const speedStage =
      active.ability === "simple"
        ? Math.max(-6, Math.min(6, active.statStages.speed * 2))
        : active.statStages.speed;

    let effective = Math.floor(baseSpeed * getStatStageMultiplier(speedStage));

    // Embargo: prevents held item effects
    // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
    const isEmbargoed = active.volatileStatuses.has(CORE_VOLATILE_IDS.embargo);

    // Choice Scarf: 1.5x Speed (suppressed by Klutz or Embargo)
    // Source: Bulbapedia -- Choice Scarf boosts Speed 1.5x
    if (
      active.pokemon.heldItem === CORE_ITEM_IDS.choiceScarf &&
      active.ability !== CORE_ABILITY_IDS.klutz &&
      !isEmbargoed
    ) {
      effective = Math.floor(effective * 1.5);
    }

    // Chlorophyll: 2x Speed in sun
    // Source: Bulbapedia -- Chlorophyll doubles Speed in sun
    if (active.ability === "chlorophyll" && this._currentWeather === "sun") {
      effective = effective * 2;
    }

    // Swift Swim: 2x Speed in rain
    // Source: Bulbapedia -- Swift Swim doubles Speed in rain
    if (active.ability === "swift-swim" && this._currentWeather === "rain") {
      effective = effective * 2;
    }

    // Sand Rush: 2x Speed in sandstorm
    // Source: Bulbapedia -- Sand Rush doubles Speed in sandstorm
    if (active.ability === "sand-rush" && this._currentWeather === "sand") {
      effective = effective * 2;
    }

    // Slush Rush: 2x Speed in hail (new in Gen 7)
    // Source: Bulbapedia -- Slush Rush doubles Speed in hail
    if (active.ability === "slush-rush" && this._currentWeather === "hail") {
      effective = effective * 2;
    }

    // Surge Surfer: 2x Speed on Electric Terrain (new in Gen 7)
    // Source: Bulbapedia -- Surge Surfer doubles Speed on Electric Terrain
    // Source: Showdown data/abilities.ts -- surgesurfer: onModifySpe: 2x if electricterrain
    if (active.ability === "surge-surfer" && this._currentTerrain === "electric") {
      effective = effective * 2;
    }

    // Slow Start: halve Speed for the first 5 turns after entering battle.
    // Source: Bulbapedia -- Slow Start halves Speed for 5 turns
    if (active.ability === "slow-start" && active.volatileStatuses.has("slow-start")) {
      effective = Math.floor(effective / 2);
    }

    // Unburden: 2x Speed when held item is consumed/lost AND currently has no item.
    // Source: Bulbapedia -- Unburden doubles Speed when held item is lost
    if (
      active.ability === CORE_ABILITY_IDS.unburden &&
      active.volatileStatuses.has(CORE_VOLATILE_IDS.unburden) &&
      !active.pokemon.heldItem
    ) {
      effective = effective * 2;
    }

    // Quick Feet: 1.5x Speed when statused, overrides paralysis penalty
    // Source: Bulbapedia -- Quick Feet boosts Speed 1.5x when statused
    if (active.ability === "quick-feet" && active.pokemon.status !== null) {
      effective = Math.floor(effective * 1.5);
    } else if (active.pokemon.status === "paralysis") {
      // Gen 7+: paralysis halves speed (x0.5)
      // Source: Bulbapedia -- Paralysis: speed reduced to 50% in Gen 7+
      effective = Math.floor(effective * 0.5);
    }

    // Iron Ball: halve Speed (suppressed by Klutz or Embargo)
    // Source: Bulbapedia -- Iron Ball halves Speed
    if (
      active.pokemon.heldItem === CORE_ITEM_IDS.ironBall &&
      active.ability !== CORE_ABILITY_IDS.klutz &&
      !isEmbargoed
    ) {
      effective = Math.floor(effective * 0.5);
    }

    return Math.max(1, effective);
  }

  // --- Priority Helpers ---

  /**
   * Calculate the ability-based priority bonus for a Pokemon's move.
   *
   * - Prankster: +1 for status moves
   * - Gale Wings (Gen 7): +1 for Flying moves at full HP
   * - Triage (Gen 7 NEW): +3 for healing moves
   *
   * Source: Showdown data/abilities.ts -- priority modifiers
   */
  private getAbilityPriorityBonus(
    active: ActivePokemon,
    moveData: MoveData,
    state: BattleState,
  ): number {
    const result = this.applyAbility(CORE_ABILITY_TRIGGER_IDS.onPriorityCheck, {
      pokemon: active,
      state,
      rng: state.rng,
      trigger: CORE_ABILITY_TRIGGER_IDS.onPriorityCheck,
      move: moveData,
    });

    if (!result.activated) return 0;

    // Use priorityBoost from result (Prankster: +1, Gale Wings: +1, Triage: +3)
    // Source: Showdown data/abilities.ts -- onModifyPriority handlers
    return result.priorityBoost ?? 0;
  }

  /**
   * Check if a Prankster-boosted move fails against a Dark-type target.
   *
   * Gen 7 nerf: status moves boosted by Prankster have no effect on Dark-type Pokemon.
   * Called by the engine before executing a move.
   *
   * Source: Showdown data/abilities.ts -- prankster: Dark targets block boosted status moves
   * Source: Bulbapedia "Prankster" Gen 7 -- "Status moves fail against Dark-type targets"
   */
  checkPranksterDarkImmunity(
    attacker: ActivePokemon,
    defender: ActivePokemon,
    move: MoveData,
  ): boolean {
    return isPranksterBlockedByDarkType(attacker.ability, move.category, defender.types);
  }

  // --- Turn Order ---

  /**
   * Gen 7 turn order resolution with weather context, Tailwind speed doubling,
   * and Trick Room reversal.
   *
   * Source: Showdown sim/battle.ts -- turn order resolution
   * Source: Bulbapedia -- Tailwind: doubles Speed of user's side
   */
  override resolveTurnOrder(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): BattleAction[] {
    // Cloud Nine / Air Lock suppress weather for speed-doubling abilities too.
    // Source: Showdown sim/battle.ts — suppressingWeather() gates weather-dependent speed
    const rawWeather = state.weather?.type ?? null;
    this._currentWeather = rawWeather && isWeatherSuppressedOnFieldGen7(state) ? null : rawWeather;
    this._currentTerrain = state.terrain?.type ?? null;

    // Pre-roll Quick Claw activations
    const quickClawActivated = this.getQuickClawActivated(actions, state, rng);

    const tagged = actions.map((action, idx) => ({ action, idx, tiebreak: rng.next() }));
    const trickRoomActive = state.trickRoom.active;

    tagged.sort((a, b) => {
      const actionA = a.action;
      const actionB = b.action;

      // Switches always go first
      if (actionA.type === "switch" && actionB.type !== "switch") return -1;
      if (actionB.type === "switch" && actionA.type !== "switch") return 1;

      // Item usage goes before moves
      if (actionA.type === "item" && actionB.type === "move") return -1;
      if (actionB.type === "item" && actionA.type === "move") return 1;

      // Run goes before moves
      if (actionA.type === "run" && actionB.type === "move") return -1;
      if (actionB.type === "run" && actionA.type === "move") return 1;

      // For moves, compare priority then speed
      if (actionA.type === "move" && actionB.type === "move") {
        const sideA = state.sides[actionA.side];
        const sideB = state.sides[actionB.side];
        const activeA = sideA?.active[0];
        const activeB = sideB?.active[0];
        if (!activeA || !activeB) return 0;

        const moveSlotA = activeA.pokemon.moves[actionA.moveIndex];
        const moveSlotB = activeB.pokemon.moves[actionB.moveIndex];
        if (!moveSlotA || !moveSlotB) return 0;

        let priorityA = 0;
        let priorityB = 0;
        let moveDataA: MoveData | undefined;
        let moveDataB: MoveData | undefined;
        try {
          moveDataA = this.dataManager.getMove(moveSlotA.moveId);
          priorityA = moveDataA.priority;
        } catch {
          /* default 0 */
        }
        try {
          moveDataB = this.dataManager.getMove(moveSlotB.moveId);
          priorityB = moveDataB.priority;
        } catch {
          /* default 0 */
        }

        // Ability-based priority boosts (Prankster, Gale Wings, Triage)
        // Source: Showdown data/abilities.ts -- Gen 7 ability priority
        // Triage gives +3 priority for healing moves (new in Gen 7)
        // Prankster/Gale Wings give +1 priority
        if (activeA.ability && moveDataA) {
          priorityA += this.getAbilityPriorityBonus(activeA, moveDataA, state);
        }
        if (activeB.ability && moveDataB) {
          priorityB += this.getAbilityPriorityBonus(activeB, moveDataB, state);
        }

        if (priorityA !== priorityB) return priorityB - priorityA; // higher priority first

        // Quick Claw / go-first item: activated holders go first within same priority bracket
        const qcA = quickClawActivated.has(a.idx);
        const qcB = quickClawActivated.has(b.idx);
        if (qcA && !qcB) return -1;
        if (qcB && !qcA) return 1;

        // Speed tiebreak with Tailwind
        let speedA = this.getEffectiveSpeed(activeA);
        let speedB = this.getEffectiveSpeed(activeB);

        // Tailwind: doubles the Speed of the user's side
        // Source: Bulbapedia -- Tailwind doubles Speed for 4 turns
        if (sideA?.tailwind.active) {
          speedA *= 2;
        }
        if (sideB?.tailwind.active) {
          speedB *= 2;
        }

        if (trickRoomActive) {
          if (speedA !== speedB) return speedA - speedB; // slower goes first
        } else {
          if (speedA !== speedB) return speedB - speedA; // faster goes first
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      // Deterministic tiebreak (non-move vs non-move of same type)
      return a.tiebreak < b.tiebreak ? -1 : 1;
    });

    // Clear weather and terrain context
    this._currentWeather = null;
    this._currentTerrain = null;
    return tagged.map((t) => t.action);
  }

  // --- Weather ---

  /**
   * Gen 7 end-of-turn weather chip damage.
   *
   * Same as Gen 6: sandstorm and hail deal 1/16 max HP per turn to non-immune Pokemon.
   * Gen 7 adds Slush Rush as a hail-immune ability.
   *
   * Source: Showdown data/conditions.ts -- weather end-of-turn damage
   * Source: Bulbapedia -- Weather conditions page
   */
  override applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen7WeatherEffects(state);
  }

  // --- Entry Hazards ---

  /**
   * Gen 7 available hazards include Sticky Web (same as Gen 6).
   *
   * Source: Bulbapedia -- Sticky Web introduced in Gen 6, still present in Gen 7
   * Source: Showdown data/moves.ts -- stickyweb
   */
  override getAvailableHazards(): readonly import("@pokemon-lib-ts/core").EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes", "sticky-web"];
  }

  /**
   * Gen 7 entry hazards: Stealth Rock, Spikes, Toxic Spikes, Sticky Web.
   *
   * Same mechanics as Gen 6. Magic Guard blocks damage/status hazards but not
   * Sticky Web's stat drop. Full Metal Body (Gen 7 ability) blocks Sticky Web.
   *
   * Source: Showdown data/moves.ts -- hazard condition handlers
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
    return applyGen7EntryHazards(pokemon, side, state, this.getTypeChart());
  }

  // --- End of Turn ---

  /**
   * Gen 7 end-of-turn effect ordering.
   * Identical to Gen 6 for now. Aurora Veil countdown will be added in Wave 4
   * when `"aurora-veil-countdown"` is added to the `EndOfTurnEffect` union type.
   *
   * Source: Showdown data/conditions.ts -- residual order
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return [
      CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
      CORE_END_OF_TURN_EFFECT_IDS.futureAttack,
      CORE_END_OF_TURN_EFFECT_IDS.wish,
      CORE_END_OF_TURN_EFFECT_IDS.weatherHealing,
      "shed-skin",
      CORE_END_OF_TURN_EFFECT_IDS.leechSeed,
      CORE_END_OF_TURN_EFFECT_IDS.leftovers,
      CORE_END_OF_TURN_EFFECT_IDS.blackSludge,
      CORE_END_OF_TURN_EFFECT_IDS.aquaRing,
      CORE_END_OF_TURN_EFFECT_IDS.ingrain,
      "poison-heal",
      CORE_END_OF_TURN_EFFECT_IDS.grassyTerrainHeal,
      CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      CORE_END_OF_TURN_EFFECT_IDS.nightmare,
      CORE_END_OF_TURN_EFFECT_IDS.curse,
      "bad-dreams",
      CORE_END_OF_TURN_EFFECT_IDS.bind,
      CORE_END_OF_TURN_EFFECT_IDS.yawnCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.tauntCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.disableCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.healBlockCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.embargoCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.magnetRiseCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.perishSong,
      CORE_END_OF_TURN_EFFECT_IDS.screenCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.safeguardCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.tailwindCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.trickRoomCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.magicRoomCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.wonderRoomCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.gravityCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.slowStartCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.terrainCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.toxicOrbActivation,
      CORE_END_OF_TURN_EFFECT_IDS.flameOrbActivation,
      "speed-boost",
      "moody",
      CORE_END_OF_TURN_EFFECT_IDS.healingItems,
    ];
  }

  /**
   * Gen 7 (like Gen 3+) has no per-attack residuals; all residuals are in Phase 2.
   *
   * Source: Showdown Gen 7 -- no per-attack residuals
   */
  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }

  // --- Experience ---

  /**
   * Gen 7 EXP formula.
   *
   * Gen 7 reverts to a simpler formula than Gen 5/6 (no level-scaling sqrt):
   *   exp = floor((baseExp * defeatedLevel) / (5 * participantCount))
   *   Apply trainer battle bonus (1.5x), Lucky Egg (1.5x), traded (1.5x/1.7x).
   *   Each multiplier is floored separately (sequential rounding).
   *
   * Gen 5/6 used sqrt-based level scaling that rewarded defeating higher-level foes
   * and penalized grinding on lower-level ones. Gen 7 removed this because the
   * permanent party-wide Exp. Share made level scaling redundant.
   *
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_VII
   *   "In Generation VII, the formula was simplified."
   *   Base: floor((b * L) / (5 * s)), then multiply each modifier with floor.
   */
  calculateExpGain(context: ExpContext): number {
    const baseExp = context.defeatedSpecies.baseExp;
    const l = context.defeatedLevel;
    const s = context.participantCount;

    // Step 1: Base EXP = floor((baseExp * defeatedLevel) / (5 * participantCount))
    // Source: Bulbapedia Gen VII EXP formula
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
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula
    // Same language -> 1.5x, international -> 1.7x.
    if (context.isTradedPokemon) {
      const tradedMultiplier = context.isInternationalTrade ? 1.7 : 1.5;
      exp = Math.floor(exp * tradedMultiplier);
    }

    // Source: specs/battle/07-gen6.md -- Gen 6+ EXP Share keeps inactive party members at 50% of the participant award
    if (context.hasExpShare) {
      exp = Math.floor(exp / 2);
    }

    return Math.max(1, exp);
  }

  // --- Held Items ---

  /**
   * Gen 7 held item application.
   *
   * Delegates to applyGen7HeldItem which handles all Gen 6 items carried forward
   * plus Gen 7 additions: Z-Crystal identification, Terrain Extender, Soul Dew change.
   *
   * Source: Showdown data/items.ts -- Gen 7 item handlers
   */
  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen7HeldItem(trigger, context);
  }

  // --- Battle Gimmick (Z-Moves + Mega Evolution) ---

  /**
   * Returns the requested battle gimmick handler for Gen 7.
   *
   * Gen 7 has two gimmicks: Mega Evolution (carried from Gen 6) and Z-Moves (new).
   * Only one gimmick can be used per Pokemon per battle.
   *
   * @param type - 'mega' for Mega Evolution, 'zmove' for Z-Moves.
   *   Other types return null.
   *
   * Source: Bulbapedia "Z-Move" -- introduced in Gen 7 (Sun and Moon)
   * Source: Bulbapedia "Mega Evolution" -- carried forward from Gen 6
   * Source: Showdown sim/battle.ts -- getBattleGimmick returns appropriate handler
   */
  /**
   * Z-Move gimmick instance (shared across the battle for per-side tracking).
   * Source: Showdown sim/side.ts:170 -- zMoveUsed per-side tracking
   */
  private readonly _zMove = new Gen7ZMove();

  /**
   * Mega Evolution gimmick instance (shared across the battle for per-side tracking).
   * Gen 7 uses internal tracking (not side.gimmickUsed) so Mega and Z-Move coexist.
   * Source: Showdown sim/side.ts:170 -- megaUsed per-side tracking (separate from zMoveUsed)
   */
  private readonly _mega = new Gen7MegaEvolution();

  override getBattleGimmick(type: BattleGimmickType): BattleGimmick | null {
    if (type === "zmove") return this._zMove;
    if (type === "mega") return this._mega;
    return null;
  }

  // --- Terrain Blocking (Misty Confusion, Psychic Priority) ---

  /**
   * Misty Terrain prevents confusion for grounded Pokemon (Gen 6+).
   * Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return null for confusion
   */
  shouldBlockVolatile(
    volatile: VolatileStatus,
    target: ActivePokemon,
    state: BattleState,
  ): boolean {
    if (volatile === "confusion") {
      return checkMistyTerrainConfusionImmunity(target, state);
    }
    return false;
  }

  /**
   * Psychic Terrain blocks priority moves against grounded targets (Gen 7+).
   * Source: Showdown data/conditions.ts -- psychicterrain.onTryHit: priority > 0 blocked
   */
  shouldBlockPriorityMove(
    _actor: ActivePokemon,
    move: MoveData,
    defender: ActivePokemon,
    state: BattleState,
  ): boolean {
    const terrainType = state.terrain?.type ?? null;
    const movePriority = move.priority ?? 0;
    return checkPsychicTerrainPriorityBlock(terrainType, movePriority, defender, state);
  }

  // --- Catch Rate ---

  /**
   * Gen 7 uses 2.5x status catch modifier for sleep/freeze (same as Gen 5+).
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
