import type {
  AbilityContext,
  AbilityResult,
  ActivePokemon,
  BattleAction,
  BattleGimmick,
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
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { createGen6DataManager } from "./data/index.js";
import { applyGen6Ability } from "./Gen6Abilities.js";
import { calculateGen6Damage } from "./Gen6DamageCalc.js";
import { applyGen6EntryHazards, isGen6Grounded } from "./Gen6EntryHazards.js";
import { applyGen6HeldItem } from "./Gen6Items.js";
import { Gen6MegaEvolution } from "./Gen6MegaEvolution.js";
import { executeGen6MoveEffect, isGen6GrassPowderBlocked } from "./Gen6MoveEffects.js";
import { applyGen6TerrainEffects, canInflictStatusWithTerrain } from "./Gen6Terrain.js";
import { GEN6_TYPE_CHART, GEN6_TYPES } from "./Gen6TypeChart.js";
import { applyGen6WeatherEffects } from "./Gen6Weather.js";

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
 *   - Terrain system added (Gen 6+)
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
 *   - getEffectiveSpeed: paralysis 0.25x + weather abilities + items (Gen 6 override)
 *   - resolveTurnOrder: weather context + Tailwind/Trick Room (Gen 6 override)
 *   - rollCritical: Battle Armor / Shell Armor immunity
 *   - capLethalDamage: Sturdy (survive at 1 HP from full)
 *   - canHitSemiInvulnerable: Gen 6 semi-invulnerable bypass (adds Thousand Arrows)
 *   - hasTerrain: true (Gen 6+ has terrain system)
 *   - calculateExpGain: Gen 5/6 sqrt-based EXP formula
 *   - recalculatesFutureAttackDamage: true (Gen 5+ behavior)
 *   - getAvailableHazards: adds sticky-web
 *   - getEndOfTurnOrder: Gen 6 end-of-turn ordering (adds grassy-terrain-heal)
 *
 * Source: references/pokemon-showdown/data/ (Gen 6 base chart)
 * Source: specs/battle/07-gen6.md
 */
export class Gen6Ruleset extends BaseRuleset {
  readonly generation = 6 as const;
  readonly name = "Gen 6 (X/Y/Omega Ruby/Alpha Sapphire)";

  /**
   * Temporary weather state set during resolveTurnOrder so that getEffectiveSpeed
   * can read it. The protected getEffectiveSpeed signature only takes ActivePokemon
   * (inherited from BaseRuleset), but Chlorophyll/Swift Swim/Sand Rush need weather context.
   * Set to null outside of turn order resolution.
   *
   * Source: Pattern from Gen5Ruleset._currentWeather
   */
  private _currentWeather: string | null = null;

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

  // --- Terrain ---

  /**
   * Gen 6+ has terrain (Electric, Grassy, Misty, Psychic).
   *
   * Source: Bulbapedia -- Terrain introduced in Gen 6
   * Source: Showdown sim/field.ts -- terrain effects
   */
  hasTerrain(): boolean {
    return true;
  }

  /**
   * Gen 6 terrain effects: Grassy Terrain heals grounded Pokemon 1/16 max HP at EoT.
   *
   * Electric Terrain and Misty Terrain have no EoT healing effect; their effects
   * are handled via damage modifiers (in Gen6DamageCalc) and status immunity
   * (via checkTerrainStatusImmunity).
   *
   * Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT for grounded Pokemon
   * Source: Showdown data/conditions.ts -- grassyterrain.onResidual
   */
  override applyTerrainEffects(state: BattleState): TerrainEffectResult[] {
    return applyGen6TerrainEffects(state);
  }

  /**
   * Check if a primary status condition can be inflicted on a target,
   * considering active terrain effects.
   *
   * - Electric Terrain: grounded Pokemon cannot fall asleep
   * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
   *
   * Source: Bulbapedia "Electric Terrain" Gen 6 -- "Grounded Pokemon cannot fall asleep."
   * Source: Bulbapedia "Misty Terrain" Gen 6 -- "Grounded Pokemon are protected from
   *   status conditions."
   * Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
   */
  checkTerrainStatusImmunity(
    status: PrimaryStatus,
    target: ActivePokemon,
    state: BattleState,
  ): { immune: boolean; message?: string } {
    if (!canInflictStatusWithTerrain(status, target, state)) {
      const terrainName =
        state.terrain?.type === "electric"
          ? "Electric Terrain"
          : state.terrain?.type === "misty"
            ? "Misty Terrain"
            : "the terrain";
      const pokemonName = target.pokemon.nickname ?? String(target.pokemon.speciesId);
      return {
        immune: true,
        message: `${pokemonName} is protected by ${terrainName}!`,
      };
    }
    return { immune: false };
  }

  // --- Move Effects ---

  /**
   * Gen 6 move effect dispatch.
   *
   * 1. Powder immunity: Grass-type Pokemon are immune to all powder/spore moves
   *    (moves with `flags.powder === true`). This was introduced in Gen 6.
   * 2. Gen 6-specific move effects (protect variants, two-turn moves, drain moves).
   * 3. Falls through to BaseRuleset for moves with no Gen 6-specific handling.
   *
   * Source: Showdown data/moves.ts -- powder moves have onTryHit checking target.hasType('Grass')
   * Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
   *   powder and spore moves."
   * Source: specs/battle/07-gen6.md Section 12
   */
  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    // Gen 6+: Grass types are immune to powder/spore moves
    // Source: Showdown data/moves.ts -- every powder move checks target.hasType('Grass')
    if (isGen6GrassPowderBlocked(context.move, context.defender.types)) {
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

    // Gen 6-specific move effects (protect variants, two-turn, drain)
    const result = executeGen6MoveEffect(
      context,
      context.state.rng,
      this.rollProtectSuccess.bind(this),
    );
    if (result !== null) return result;

    // Fall through to BaseRuleset for unhandled moves
    return super.executeMoveEffect(context);
  }

  // --- Ability System ---

  /**
   * Gen 6 ability dispatch.
   *
   * Routes ability triggers to Gen 6 ability sub-modules via the master dispatcher.
   * Handles all Gen 5 carry-forward abilities plus Gen 6 newcomers:
   *   - Tough Claws, Strong Jaw, Mega Launcher (damage-calc)
   *   - Fur Coat (defender damage-calc)
   *   - Pixilate, Aerilate, Refrigerate (Normal-type override)
   *   - Parental Bond (double hit)
   *   - Gale Wings (Flying priority, no HP check)
   *   - Protean (type change before move)
   *   - Competitive (+2 SpAtk on stat drop)
   *
   * Source: Showdown data/abilities.ts
   * Source: Showdown data/mods/gen6/abilities.ts
   */
  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    return applyGen6Ability(trigger, context);
  }

  // --- Damage Calculation ---

  /**
   * Gen 6 damage formula.
   *
   * Full implementation with all Gen 6-specific modifiers:
   * - Crit multiplier 1.5x (was 2.0x in Gen 5)
   * - Gem boost 1.3x (was 1.5x in Gen 5)
   * - Knock Off 1.5x base power boost when target has removable item
   * - Facade bypasses burn penalty
   * - Assault Vest, Fur Coat, Pixie Plate
   * - Fairy type effectiveness (via type chart)
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 6 damage formula
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen6Damage(
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
   * Cap lethal damage for Sturdy and Focus Sash.
   *
   * Priority: Sturdy (priority -30) fires first, then Focus Sash (priority -100).
   * If Sturdy caps the damage, Focus Sash won't fire (damage < currentHp after cap).
   *
   * Focus Sash is suppressed by Klutz (ability) and Embargo (volatile).
   * Source: Showdown data/abilities.ts -- klutz: item has no effect
   * Source: Showdown data/moves.ts -- embargo: target's item is unusable
   *
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   * Source: Showdown data/items.ts -- Focus Sash: onDamage at full HP
   * Source: Bulbapedia -- Sturdy (Ability), Focus Sash
   */
  capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    state: BattleState,
  ): { damage: number; survived: boolean; messages: string[]; consumedItem?: string } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    const currentHp = defender.pokemon.currentHp;
    const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);

    // 1. Sturdy (ability) -- priority -30, fires first
    if (defender.ability === "sturdy" && currentHp === maxHp && damage >= currentHp) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on thanks to Sturdy!`],
      };
    }

    // 2. Focus Sash (item) -- survive at 1 HP if at full HP, consumed
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

  // --- Semi-Invulnerable Hit Check ---

  /**
   * Gen 6 semi-invulnerable move bypass check.
   *
   * Same as Gen 5 with the addition of Thousand Arrows (can hit Flying types).
   *
   * - "flying" (Fly/Bounce): Thunder, Gust, Twister, Sky Uppercut, Hurricane, Smack Down,
   *   Thousand Arrows can hit
   * - "underground" (Dig): Earthquake, Magnitude, Fissure can hit
   * - "underwater" (Dive): Surf, Whirlpool can hit
   * - "shadow-force-charging" (Shadow Force/Phantom Force): nothing bypasses
   * - "charging" (SolarBeam, etc.): not semi-invulnerable; all moves hit
   *
   * Source: Showdown data/moves.ts -- thousandarrows: hits targets in the Flying semi-invulnerable state
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
    switch (volatile) {
      case "flying":
        // Source: Showdown Gen 6 -- Thousand Arrows added in Gen 6
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
   * Gen 6 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * If the defender has Battle Armor or Shell Armor, critical hits are
   * completely prevented -- return false immediately without rolling.
   * Otherwise, defer to BaseRuleset.rollCritical for normal crit logic.
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
   *
   * Includes:
   * - Stat stages (with Simple doubling)
   * - Choice Scarf (1.5x, suppressed by Klutz)
   * - Weather abilities: Chlorophyll (sun 2x), Swift Swim (rain 2x), Sand Rush (sand 2x)
   * - Slow Start (halve for first 5 turns)
   * - Unburden (2x when item consumed)
   * - Quick Feet (1.5x with status, overrides paralysis penalty)
   * - Paralysis: 0.25x (Gen 3-6)
   * - Iron Ball (0.5x, suppressed by Klutz)
   *
   * Source: Showdown sim/pokemon.ts -- Gen 6 speed modifiers
   * Source: Bulbapedia -- individual ability/item pages
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Simple: doubles all stat stage effects
    // Source: Bulbapedia -- Simple doubles stat stage effects
    const speedStage =
      active.ability === "simple"
        ? Math.max(-6, Math.min(6, active.statStages.speed * 2))
        : active.statStages.speed;

    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(speedStage));

    // Embargo: prevents held item effects (Gen 5+)
    // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
    const isEmbargoed = active.volatileStatuses.has("embargo");

    // Choice Scarf: 1.5x Speed (suppressed by Klutz or Embargo)
    // Source: Bulbapedia -- Choice Scarf boosts Speed 1.5x
    if (active.pokemon.heldItem === "choice-scarf" && active.ability !== "klutz" && !isEmbargoed) {
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

    // Slow Start: halve Speed for the first 5 turns after entering battle.
    // Source: Bulbapedia -- Slow Start halves Speed for 5 turns
    if (active.ability === "slow-start" && active.volatileStatuses.has("slow-start")) {
      effective = Math.floor(effective / 2);
    }

    // Unburden: 2x Speed when held item is consumed/lost AND currently has no item.
    // Source: Bulbapedia -- Unburden doubles Speed when held item is lost
    if (
      active.ability === "unburden" &&
      active.volatileStatuses.has("unburden") &&
      !active.pokemon.heldItem
    ) {
      effective = effective * 2;
    }

    // Quick Feet: 1.5x Speed when statused, overrides paralysis penalty
    // Source: Bulbapedia -- Quick Feet boosts Speed 1.5x when statused
    if (active.ability === "quick-feet" && active.pokemon.status !== null) {
      effective = Math.floor(effective * 1.5);
    } else if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (x0.25)
      // Source: Bulbapedia -- Paralysis: speed reduced to 25% in Gen 3-6
      effective = Math.floor(effective * 0.25);
    }

    // Iron Ball: halve Speed (suppressed by Klutz or Embargo)
    // Source: Bulbapedia -- Iron Ball halves Speed
    if (active.pokemon.heldItem === "iron-ball" && active.ability !== "klutz" && !isEmbargoed) {
      effective = Math.floor(effective * 0.5);
    }

    return Math.max(1, effective);
  }

  // --- Turn Order ---

  /**
   * Gen 6 turn order resolution with weather context, Tailwind speed doubling,
   * and Trick Room reversal.
   *
   * Sets _currentWeather before sorting so getEffectiveSpeed can read it for
   * Chlorophyll/Swift Swim/Sand Rush. Clears it after sorting.
   *
   * Source: Showdown sim/battle.ts -- turn order resolution
   * Source: Bulbapedia -- Tailwind: doubles Speed of user's side
   */
  override resolveTurnOrder(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): BattleAction[] {
    // Set weather context for getEffectiveSpeed to read
    this._currentWeather = state.weather?.type ?? null;

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

        // Ability-based priority boosts (Prankster, Gale Wings)
        // Source: Showdown data/abilities.ts -- Prankster onModifyPriority: +1 for status moves
        // Source: Showdown data/mods/gen6/abilities.ts -- Gale Wings: +1 for Flying moves (no HP check)
        if (activeA.ability && moveDataA) {
          const resultA = this.applyAbility("on-priority-check", {
            pokemon: activeA,
            state,
            rng: state.rng,
            trigger: "on-priority-check",
            move: moveDataA,
          });
          if (resultA.activated) {
            priorityA += 1;
          }
        }
        if (activeB.ability && moveDataB) {
          const resultB = this.applyAbility("on-priority-check", {
            pokemon: activeB,
            state,
            rng: state.rng,
            trigger: "on-priority-check",
            move: moveDataB,
          });
          if (resultB.activated) {
            priorityB += 1;
          }
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

    // Clear weather context
    this._currentWeather = null;
    return tagged.map((t) => t.action);
  }

  // --- Weather ---

  /**
   * Gen 6 end-of-turn weather chip damage.
   *
   * Chip damage mechanics are identical to Gen 5 (1/16 max HP for sand/hail).
   * The Gen 6 weather nerf only changed DURATION (5 turns instead of permanent),
   * not the chip damage formula.
   *
   * Source: Showdown data/conditions.ts -- weather end-of-turn damage (same Gen 5-6)
   * Source: Bulbapedia -- Weather conditions page
   */
  override applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen6WeatherEffects(state);
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

  /**
   * Gen 6 entry hazards: Stealth Rock, Spikes, Toxic Spikes, and Sticky Web.
   *
   * Delegates to applyGen6EntryHazards which handles all four hazard types
   * including the new Sticky Web (-1 Speed to grounded switch-ins).
   *
   * Source: Showdown data/moves.ts -- individual hazard condition.onSwitchIn handlers
   * Source: Bulbapedia -- Sticky Web introduced in Gen 6
   */
  override applyEntryHazards(
    pokemon: ActivePokemon,
    side: BattleSide,
    state?: BattleState,
  ): EntryHazardResult {
    // BattleState is optional in the interface but required for grounding checks
    if (!state) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }
    return applyGen6EntryHazards(pokemon, side, state, this.getTypeChart());
  }

  // --- End of Turn ---

  /**
   * Gen 6 end-of-turn effect ordering.
   * Adds grassy-terrain-heal (new in Gen 6) after poison-heal.
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

  /**
   * Gen 6 (like Gen 3+) has no per-attack residuals; all residuals are in Phase 2.
   *
   * Source: Showdown Gen 6 -- no per-attack residuals
   */
  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }

  // --- Experience ---

  /**
   * Gen 5/6 EXP formula with level-dependent scaling.
   *
   * Formula:
   *   a = 2 * defeatedLevel + 10
   *   b = defeatedLevel + participantLevel + 10
   *   exp = floor( floor(sqrt(a) * a^2) * baseExp / floor(sqrt(b) * b^2) ) + 1
   *   Apply trainer battle bonus (1.5x), Lucky Egg (1.5x), split among participants.
   *
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_V_and_VI
   * Source: Showdown sim/battle-actions.ts -- Gen 5/6 EXP formula
   */
  calculateExpGain(context: ExpContext): number {
    const a = 2 * context.defeatedLevel + 10;
    const b = context.defeatedLevel + context.participantLevel + 10;
    const sqrtA = Math.sqrt(a);
    const sqrtB = Math.sqrt(b);

    let exp =
      Math.floor(
        (Math.floor(sqrtA * a * a) * context.defeatedSpecies.baseExp) / Math.floor(sqrtB * b * b),
      ) + 1;

    if (context.isTrainerBattle) {
      exp = Math.floor(exp * 1.5);
    }

    if (context.hasLuckyEgg) {
      exp = Math.floor(exp * 1.5);
    }

    if (context.participantCount > 1) {
      exp = Math.floor(exp / context.participantCount);
    }

    // Source: Showdown sim/battle-actions.ts — traded EXP bonus applied after all other multipliers.
    // Same language → 1.5×, international → 1.7×.
    // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula (Gen 6 section)
    if (context.isTradedPokemon) {
      const tradedMultiplier = context.isInternationalTrade ? 1.7 : 1.5;
      exp = Math.floor(exp * tradedMultiplier);
    }

    return Math.max(1, exp);
  }

  // --- Held Items ---

  /**
   * Gen 6 held item application.
   *
   * Delegates to applyGen6HeldItem which handles all Gen 5 items carried forward
   * plus new Gen 6 items: Assault Vest, Safety Goggles, Weakness Policy,
   * Kee/Maranga/Roseli berries, Luminous Moss, Snowball, etc.
   *
   * Source: Showdown data/items.ts -- Gen 6 item handlers
   */
  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen6HeldItem(trigger, context);
  }

  // --- Battle Gimmick (Mega Evolution) ---

  /**
   * Returns the Gen 6 Mega Evolution gimmick handler.
   *
   * Mega Evolution is Gen 6's once-per-battle gimmick: one Pokemon per trainer
   * per battle can Mega Evolve, gaining new base stats, type(s), and ability.
   *
   * Source: Bulbapedia "Mega Evolution" — introduced in Gen 6 (X and Y)
   * Source: Showdown sim/battle.ts — getBattleGimmick returning Gen6MegaEvolution
   */
  override getBattleGimmick(): BattleGimmick | null {
    return new Gen6MegaEvolution();
  }

  // --- Terrain Volatile Blocking ---

  /**
   * Misty Terrain prevents confusion for grounded Pokemon (Gen 6+).
   *
   * Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus:
   *   if (status.id === 'confusion') { return null; }
   * Source: Bulbapedia "Misty Terrain" -- "prevents confusion"
   */
  shouldBlockVolatile(
    volatile: VolatileStatus,
    target: ActivePokemon,
    state: BattleState,
  ): boolean {
    if (volatile === "confusion") {
      if (!state.terrain || state.terrain.type !== "misty") return false;
      const gravityActive = state.gravity?.active ?? false;
      return isGen6Grounded(target, gravityActive);
    }
    return false;
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
