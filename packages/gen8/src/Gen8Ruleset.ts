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
  EndOfTurnEffect,
  EntryHazardResult,
  ExpContext,
  ItemContext,
  ItemResult,
  TerrainEffectResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import {
  BATTLE_ABILITY_EFFECT_TYPES,
  BATTLE_EFFECT_TARGETS,
  BaseRuleset,
} from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  DataManager,
  EntryHazardType,
  Gen8TwoTurnMoveVolatile,
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TwoTurnMoveVolatile,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { createGen8DataManager } from "./data/index.js";
import { handleGen8DamageImmunityAbility } from "./Gen8AbilitiesDamage.js";
import { handleGen8StatAbility } from "./Gen8AbilitiesStat.js";
import {
  handleGen8SwitchAbility,
  isIceFaceActive,
  shouldMirrorArmorReflect,
} from "./Gen8AbilitiesSwitch.js";
import { GEN8_CRIT_MULTIPLIER, GEN8_CRIT_RATE_TABLE } from "./Gen8CritCalc.js";
import { calculateGen8Damage } from "./Gen8DamageCalc.js";
import { Gen8Dynamax } from "./Gen8Dynamax.js";
import { applyGen8EntryHazards } from "./Gen8EntryHazards.js";
import { applyGen8HeldItem } from "./Gen8Items.js";
import {
  applyGen8TerrainEffects,
  checkGen8TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
} from "./Gen8Terrain.js";
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
   *     Intrepid Sword, Dauntless Shield, etc. (switch handler + stat handler)
   *   - on-switch-out: Regenerator, Natural Cure (switch handler)
   *   - on-contact: Static, Flame Body, Wandering Spirit, Perish Body,
   *     Gulp Missile, Mummy, etc. (switch handler)
   *   - on-status-inflicted: Synchronize (switch handler)
   *   - on-before-move: Libero, Protean (stat handler)
   *   - on-stat-change: Mirror Armor (special), Defiant, Competitive, Contrary, Simple (stat handler)
   *   - on-turn-end: Hunger Switch (switch handler), Speed Boost, Moody (stat handler)
   *   - on-priority-check: Prankster, Gale Wings, Triage, Quick Draw (stat handler)
   *   - on-after-move-used: Moxie, Beast Boost (stat handler)
   *   - on-flinch: Steadfast (stat handler)
   *   - on-item-use: Unnerve (stat handler)
   *   - passive-immunity: passive type immunities (stat handler)
   *   - on-damage-taken: Sturdy OHKO block (damage handler), Justified, Weak Armor, etc. (stat handler)
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
            effects: [
              {
                effectType: BATTLE_ABILITY_EFFECT_TYPES.statChange,
                target: BATTLE_EFFECT_TARGETS.opponent,
                stat,
                stages,
              },
            ],
            messages: [`${name}'s Mirror Armor reflected the stat drop!`],
          };
        }
      }
      return noActivation;
    }

    // Route all other triggers through the appropriate handler
    switch (trigger) {
      // Triggers handled by the switch/contact/field handler module
      case "on-switch-in":
      case "on-switch-out":
      case "on-contact":
      case "on-status-inflicted":
      case "on-before-move":
      case "on-turn-end": {
        // Try switch/field handler first (Hunger Switch, etc.), then stat handler (Speed Boost, Moody)
        const switchResult = handleGen8SwitchAbility(trigger, context);
        if (switchResult.activated) return switchResult;
        return handleGen8StatAbility(context);
      }

      // Triggers handled by the stat/priority handler module
      case "on-priority-check":
      case "on-after-move-used":
      case "on-flinch":
      case "on-item-use":
      case "passive-immunity":
        return handleGen8StatAbility(context);

      // on-stat-change for non-Mirror Armor abilities (Defiant, Competitive, Contrary, Simple)
      case "on-stat-change":
        return handleGen8StatAbility(context);

      // on-damage-taken: try damage-immunity handler first (Sturdy OHKO block), then stat handler
      case "on-damage-taken": {
        const immunityResult = handleGen8DamageImmunityAbility(context);
        if (immunityResult.activated) return immunityResult;
        return handleGen8StatAbility(context);
      }

      default:
        return noActivation;
    }
  }

  // --- End-of-Turn Order ---

  /**
   * Gen 8 end-of-turn effect ordering.
   *
   * Identical to Gen 7: 37+ effects in Showdown residual order.
   * Gen 8 does not remove any EoT effects from Gen 7.
   *
   * Source: Showdown data/conditions.ts -- residual order
   * Source: Bulbapedia -- Sword/Shield battle mechanics
   */
  override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
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
      "grassy-terrain-heal",
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
      "magic-room-countdown",
      "wonder-room-countdown",
      "gravity-countdown",
      "slow-start-countdown",
      "terrain-countdown",
      "weather-countdown",
      "toxic-orb-activation",
      "flame-orb-activation",
      "speed-boost",
      "moody",
      "healing-items",
    ];
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

    // Source: specs/battle/09-gen8.md -- Inactive party members get 50% of earned EXP when EXP Share is always on
    if (context.hasExpShare) {
      exp = Math.floor(exp / 2);
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
    return calculateGen8Damage(context, this.getTypeChart());
  }

  /**
   * Cap lethal damage for Disguise (Gen 8: 1/8 chip), Sturdy, and Focus Sash.
   *
   * Disguise (Gen 8 change): when busted, deals 1/8 max HP chip damage instead
   * of 0 chip (Gen 7). Priority 1 (before Sturdy at -30).
   *
   * Ice Face: Eiscue blocks the first physical hit before HP is reduced.
   * Sturdy: survive any hit from full HP at 1 HP (unchanged from Gen 5+). Priority -30.
   * Focus Sash: survive any hit from full HP at 1 HP (item, consumed). Priority -100.
   *
   * Focus Sash is suppressed by Klutz (ability) and Embargo (volatile).
   * Source: Showdown data/abilities.ts -- klutz: item has no effect
   * Source: Showdown data/moves.ts -- embargo: target's item is unusable
   *
   * Source: Showdown data/abilities.ts -- iceface: onDamage (pre-damage block)
   * Source: Showdown data/abilities.ts -- disguise: onDamage (priority 1, Gen 8: 1/8 chip)
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   * Source: Showdown data/items.ts -- Focus Sash: onDamage at full HP
   * Source: Bulbapedia -- Disguise (Ability), Gen 8: "deals 1/8 of max HP as damage"
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

    // 1. Ice Face: Eiscue blocks the first physical hit before HP is reduced.
    // Source: Showdown data/abilities.ts -- iceface onDamage returns 0 and marks the form broken.
    // Source: Bulbapedia "Ice Face" -- blocks the first physical move.
    if (
      move.category === "physical" &&
      isIceFaceActive(
        defender.pokemon.speciesId,
        defender.ability,
        defender.volatileStatuses.has("ice-face-broken"),
      )
    ) {
      defender.volatileStatuses.set("ice-face-broken", { turnsLeft: -1 });
      return {
        damage: 0,
        survived: true,
        messages: [`${name}'s Ice Face absorbed the damage!`],
      };
    }

    // 2. Disguise: block incoming damage, deal 1/8 max HP chip instead (Gen 8 change)
    // Disguise checks BEFORE Sturdy (higher priority in Showdown: priority 1 vs -30)
    // Gen 8: 1/8 max HP chip damage on Disguise break (changed from 0 in Gen 7)
    // Source: Showdown data/abilities.ts -- disguise onDamage, Gen 8: Math.ceil(maxhp / 8)
    if (
      defender.ability === "disguise" &&
      !defender.volatileStatuses.has("disguise-broken") &&
      move.category !== "status"
    ) {
      // Mark Disguise as broken
      defender.volatileStatuses.set("disguise-broken", { turnsLeft: -1 });
      // Guard against NaN/0 maxHp from malformed state — floor at 1 damage
      const chipDamage = maxHp > 0 ? Math.ceil(maxHp / 8) : 1;
      return {
        damage: chipDamage,
        survived: true,
        messages: [`${name}'s Disguise was busted!`],
      };
    }

    // 3. Sturdy: if at full HP and damage would KO, cap at maxHp - 1
    // Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
    if (defender.ability === "sturdy" && currentHp === maxHp && damage >= currentHp) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on thanks to Sturdy!`],
      };
    }

    // 4. Focus Sash (item) -- survive at 1 HP if at full HP, consumed
    // Source: Showdown data/items.ts -- Focus Sash onDamage
    // Source: Bulbapedia -- Focus Sash: "If holder is at full HP, survive with 1 HP"
    // Source: Showdown sim/battle.ts -- Magic Room suppresses all item effects
    const heldItem = defender.pokemon.heldItem;
    const itemSuppressed =
      defender.ability === "klutz" ||
      defender.volatileStatuses.has("embargo") ||
      (state.magicRoom?.active ?? false);
    if (
      heldItem === "focus-sash" &&
      !itemSuppressed &&
      currentHp === maxHp &&
      damage >= currentHp
    ) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on with its Focus Sash!`],
        consumedItem: "focus-sash",
      };
    }

    return { damage, survived: false, messages: [] };
  }

  /**
   * Gen 8: Max Moves (used by Dynamaxed Pokemon) bypass regular Protect at 0.25x damage.
   *
   * Note: Max Guard sets the "max-guard" volatile (distinct from "protect") so it is
   * checked separately by the engine as an always-block — this method is never consulted
   * for Max Guard. This correctly models Showdown's behavior where Max Guard blocks
   * all moves including other Max Moves.
   *
   * Source: Showdown sim/battle-actions.ts -- Max Moves bypass Protect at 0.25x
   * Source: Bulbapedia "Dynamax" -- Max Moves deal 25% damage through Protect
   */
  override canBypassProtect(
    _move: MoveData,
    actor: ActivePokemon,
    activeVolatile: "protect" | "max-guard",
  ): boolean {
    // Max Guard is always-block — no moves can bypass it, including other Max Moves.
    // Max Moves (used by Dynamaxed Pokemon) bypass regular Protect at 0.25x.
    // Source: Showdown sim/battle-actions.ts -- Max Guard blocks all moves including Max Moves
    if (activeVolatile === "max-guard") return false;
    return actor.isDynamaxed;
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
  canHitSemiInvulnerable(moveId: string, volatile: Gen8TwoTurnMoveVolatile): boolean;
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
}
