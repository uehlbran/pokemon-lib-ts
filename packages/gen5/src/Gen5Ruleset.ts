import type {
  AbilityContext,
  AbilityResult,
  ActivePokemon,
  BattleAction,
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
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  Gen5TwoTurnMoveVolatile,
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TwoTurnMoveVolatile,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_VOLATILE_IDS,
  DataManager,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import { GEN5_ITEM_IDS } from "./data/reference-ids.js";
import { applyGen5Ability } from "./Gen5Abilities";
import { getSturdyDamageCap } from "./Gen5AbilitiesDamage";
import { GEN5_CRIT_MULTIPLIER, GEN5_CRIT_RATE_TABLE } from "./Gen5CritCalc";
import { calculateGen5Damage } from "./Gen5DamageCalc";
import { applyGen5EntryHazards } from "./Gen5EntryHazards";
import { applyGen5HeldItem } from "./Gen5Items";
import { shouldReflectMoveGen5 } from "./Gen5MagicBounce";
import { executeGen5MoveEffect } from "./Gen5MoveEffects";
import { GEN5_TYPE_CHART, GEN5_TYPES } from "./Gen5TypeChart";
import { applyGen5WeatherEffects, isWeatherSuppressedOnFieldGen5 } from "./Gen5Weather";

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
 *   - Sleep counter resets on switch-in (unique Gen 5 mechanic)
 *   - Can act on wake turn (Gen 4 wasted wake turn)
 *   - Permanent weather from abilities (Gen 6 changed to 5 turns)
 *   - Type Gems consume on use for 1.5x boost
 *   - EXP formula uses level scaling with sqrt
 *   - Protect uses doubling counter (2^N, capped at 256), not halving like Gen 4
 *
 * Key Gen 5 differences from Gen 6+:
 *   - Steel resists Dark and Ghost (removed in Gen 6)
 *   - No Fairy type
 *   - Crit multiplier is 2.0x (Gen 6+ uses 1.5x)
 *   - Crit rate table: [16, 8, 4, 3, 2] (Gen 6+ uses [24, 8, 2, 1])
 *   - Burn damage: 1/8 max HP (Gen 7+ uses 1/16)
 *   - Paralysis speed penalty: 0.25x (Gen 7+ uses 0.5x)
 *   - Confusion self-hit: 50% (Gen 7+ uses 33%)
 *   - No Fairy type, no terrain, no battle gimmicks
 *
 * Overrides implemented here:
 *   - getCritRateTable -- [16, 8, 4, 3, 2] denominators (Gen 3-5 table)
 *   - getCritMultiplier -- 2.0x (Gen 3-5 classic)
 *   - rollCritical -- Battle Armor / Shell Armor immunity check
 *   - applyStatusDamage -- burn = 1/8 max HP (Gen 3-6)
 *   - getEffectiveSpeed -- full Gen 5 speed modifiers
 *   - canHitSemiInvulnerable -- Gen 5 semi-invulnerable bypass (Gen 4 + Hurricane, Smack Down)
 *   - applyWeatherEffects -- delegates to applyGen5WeatherEffects
 *   - onSwitchIn -- sleep counter reset (Gen 5 unique)
 *   - rollProtectSuccess -- doubling counter capped at 256
 *   - calculateExpGain -- Gen 5 sqrt-based EXP formula
 *   - getEndOfTurnOrder -- Gen 5-specific end-of-turn ordering
 *   - resolveTurnOrder -- Tailwind speed doubling
 *   - applyAbility -- delegates to applyGen5Ability master dispatcher
 *
 * Source: references/pokemon-showdown/data/mods/gen5/
 */
export class Gen5Ruleset extends BaseRuleset {
  readonly generation = 5 as const;
  readonly name = "Gen 5 (Black/White/Black2/White2)";

  /**
   * Temporary weather state set during resolveTurnOrder so that getEffectiveSpeed
   * can read it. The protected getEffectiveSpeed signature only takes ActivePokemon
   * (inherited from BaseRuleset), but Chlorophyll/Swift Swim/Sand Rush need weather context.
   * Set to null outside of turn order resolution.
   */
  private _currentWeather: string | null = null;

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
   *
   * Source: references/pokemon-showdown/sim/battle-actions.ts lines 1718-1838
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen5Damage(context, this.getTypeChart());
  }

  /**
   * Gen 5+ recalculates future attack damage at hit time, not at use time.
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   * Source: Showdown sim/battle-actions.ts -- Gen 5+ recalculates future attack damage
   */
  recalculatesFutureAttackDamage(): boolean {
    return true;
  }

  /**
   * Cap lethal damage for survival abilities and items:
   *   - Sturdy (Gen 5+): survive any hit from full HP at 1 HP (ability)
   *   - Focus Sash: survive any hit from full HP at 1 HP (item, consumed)
   *   - Focus Band: 10% chance to survive any KO hit at 1 HP (item, NOT consumed)
   *
   * Priority: Sturdy fires first (priority -30), then Focus Sash/Band (priority -10).
   * If Sturdy caps the damage, Focus Sash won't fire (damage < currentHp after cap).
   *
   * Focus Sash and Focus Band are suppressed by Klutz (ability), Embargo (volatile),
   * and Magic Room (field condition).
   * Source: Showdown data/abilities.ts -- klutz: item has no effect
   * Source: Showdown data/moves.ts -- embargo: target's item is unusable
   *
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   * Source: Showdown data/items.ts -- Focus Sash: onDamage; Focus Band: onDamage
   * Source: Bulbapedia -- Focus Sash, Focus Band, Sturdy (Ability)
   */
  capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    state: BattleState,
  ): { damage: number; survived: boolean; messages: string[]; consumedItem?: string } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);

    // 1. Sturdy (ability) -- priority -30, fires first
    const capped = getSturdyDamageCap(defender.ability, damage, defender.pokemon.currentHp, maxHp);
    if (capped < damage) {
      return { damage: capped, survived: true, messages: [`${name} held on thanks to Sturdy!`] };
    }

    // 2. Focus Sash (item) -- survive at 1 HP if at full HP, consumed
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
      defender.pokemon.currentHp === maxHp &&
      damage >= defender.pokemon.currentHp
    ) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on with its Focus Sash!`],
        consumedItem: CORE_ITEM_IDS.focusSash,
      };
    }

    // 3. Focus Band (item) -- 10% chance to survive at 1 HP, NOT consumed
    // Source: Showdown data/items.ts -- Focus Band 10% activation
    // Fix: use currentHp - 1 (not maxHp - 1) to leave exactly 1 HP regardless of current HP
    if (
      heldItem === GEN5_ITEM_IDS.focusBand &&
      !itemSuppressed &&
      damage >= defender.pokemon.currentHp
    ) {
      if (state.rng.chance(0.1)) {
        return {
          damage: defender.pokemon.currentHp - 1,
          survived: true,
          messages: [`${name} hung on using its Focus Band!`],
        };
      }
    }

    return { damage, survived: false, messages: [] };
  }

  // --- Entry Hazards ---

  /**
   * Gen 5 entry hazard application.
   *
   * Delegates to applyGen5EntryHazards for Spikes, Stealth Rock, and Toxic Spikes.
   * Mechanically identical to Gen 4 (no changes between Gen 4 and Gen 5).
   *
   * Source: Showdown data/moves.ts -- spikes, stealthrock, toxicspikes conditions
   * Source: Showdown data/mods/gen5/ -- no overrides to hazard behavior (inherits base)
   */
  applyEntryHazards(
    pokemon: ActivePokemon,
    side: BattleSide,
    state?: BattleState,
  ): EntryHazardResult {
    if (!state) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }
    return applyGen5EntryHazards(pokemon, side, state, this.getTypeChart());
  }

  // --- Move Effects ---

  /**
   * Gen 5 move effect execution.
   * Delegates to the Gen5MoveEffects master dispatcher, which routes to
   * field -> behavior -> combat sub-modules.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const result = executeGen5MoveEffect(
      context,
      context.state.rng,
      this.rollProtectSuccess.bind(this),
    );
    if (result !== null) return result;

    // Delegate to BaseRuleset for any remaining moves
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
  canHitSemiInvulnerable(moveId: string, volatile: Gen5TwoTurnMoveVolatile): boolean;
  override canHitSemiInvulnerable(moveId: string, volatile: TwoTurnMoveVolatile): boolean {
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
    return GEN5_CRIT_RATE_TABLE;
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
    // Magic Guard: prevents all indirect damage including status chip damage
    // Source: Bulbapedia -- Magic Guard prevents damage from weather, poison, burn, etc.
    if (pokemon.ability === "magic-guard") return 0;

    if (status === "burn") {
      // Gen 3-6: 1/8 max HP
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

  /**
   * Gen 5 sleep counter reset on switch-in.
   *
   * Unique Gen 5 mechanic: when a sleeping Pokemon switches in, its sleep
   * counter resets to the original start time. This means switching out and
   * back in does NOT reduce sleep duration.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts --
   *   slp.onSwitchIn: "this.effectState.time = this.effectState.startTime"
   *
   * This method is called by BattleEngine.sendOut() after entry hazards are applied
   * and before switch-in abilities fire.
   */
  onSwitchIn(pokemon: ActivePokemon, _state: BattleState): void {
    if (pokemon.pokemon.status === "sleep") {
      const sleepCounter = pokemon.volatileStatuses.get("sleep-counter");
      if (sleepCounter?.data) {
        const startTime = (sleepCounter.data as Record<string, unknown>).startTime;
        if (typeof startTime === "number") {
          sleepCounter.turnsLeft = startTime;
        }
      }
    }
  }

  /**
   * Gen 5 sleep processing: the Pokemon CAN act on the turn it wakes up.
   *
   * The sleep counter is decremented each turn. When it reaches 0, the Pokemon
   * wakes up and CAN act that turn. The "lose turn on wake" mechanic is Gen 1-2 only.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts --
   *   when time <= 0, cureStatus() is called and the function returns without
   *   "return false", allowing the Pokemon to act.
   */
  override processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // No counter found or already at 0 -- wake up and CAN act
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      // Counter just reached 0 -- wake up and CAN act
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return true;
    }
    return false; // Still sleeping -- cannot act
  }

  // --- Weather ---

  /**
   * Gen 5 weather effects.
   * Delegates to applyGen5WeatherEffects for sandstorm/hail chip damage.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
   */
  applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen5WeatherEffects(state);
  }

  // --- Held Items ---

  /**
   * Gen 5 held item effects.
   * Delegates to applyGen5HeldItem for all held item triggers.
   *
   * Source: references/pokemon-showdown/data/items.ts (Gen 5 entries)
   */
  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen5HeldItem(trigger, context);
  }

  // --- Abilities ---

  /**
   * Gen 5 ability effect dispatch.
   * Delegates to the Gen5Abilities master dispatcher, which routes to
   * Damage/Stat/Switch/Remaining sub-modules based on trigger type.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
   * Source: references/pokemon-showdown/data/abilities.ts
   */
  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    return applyGen5Ability(trigger, context);
  }

  // --- Magic Bounce ---

  /**
   * Gen 5 Magic Bounce: reflect reflectable status moves back at the user.
   *
   * Source: Showdown data/abilities.ts -- magicbounce.onTryHit
   * Source: Bulbapedia -- Magic Bounce ability page
   */
  override shouldReflectMove(
    move: MoveData,
    attacker: ActivePokemon,
    defender: ActivePokemon,
    state: BattleState,
  ): { reflected: true; messages: string[] } | null {
    return shouldReflectMoveGen5(move, attacker, defender, state);
  }

  // --- Speed ---

  /**
   * Gen 5 effective speed calculation.
   *
   * Source: Showdown sim/pokemon.ts -- Gen 5 speed modifiers
   * Source: Bulbapedia -- individual ability/item pages
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Simple: doubles all stat stage effects (Gen 5)
    // Source: Bulbapedia -- Simple doubles stat stage effects
    const speedStage =
      active.ability === "simple"
        ? Math.max(-6, Math.min(6, active.statStages.speed * 2))
        : active.statStages.speed;

    // Apply stat stages
    let effective = Math.floor(baseSpeed * getStatStageMultiplier(speedStage));

    // Choice Scarf: 1.5x Speed (suppressed by Klutz)
    if (active.pokemon.heldItem === "choice-scarf" && active.ability !== "klutz") {
      effective = Math.floor(effective * 1.5);
    }

    // Chlorophyll: 2x Speed in sun
    if (active.ability === "chlorophyll" && this._currentWeather === "sun") {
      effective = effective * 2;
    }

    // Swift Swim: 2x Speed in rain
    if (active.ability === "swift-swim" && this._currentWeather === "rain") {
      effective = effective * 2;
    }

    // Sand Rush: 2x Speed in sandstorm (NEW in Gen 5)
    if (active.ability === "sand-rush" && this._currentWeather === "sand") {
      effective = effective * 2;
    }

    // Slow Start: halve Speed for the first 5 turns after entering battle.
    if (active.ability === "slow-start" && active.volatileStatuses.has("slow-start")) {
      effective = Math.floor(effective / 2);
    }

    // Unburden: 2x Speed when held item is consumed/lost AND currently has no item.
    if (
      active.ability === CORE_ABILITY_IDS.unburden &&
      active.volatileStatuses.has(CORE_VOLATILE_IDS.unburden) &&
      !active.pokemon.heldItem
    ) {
      effective = effective * 2;
    }

    // Quick Feet: 1.5x Speed when statused, overrides paralysis penalty
    if (active.ability === "quick-feet" && active.pokemon.status !== null) {
      effective = Math.floor(effective * 1.5);
    } else if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (x0.25)
      effective = Math.floor(effective * 0.25);
    }

    // Iron Ball: halve Speed (suppressed by Klutz)
    if (
      active.pokemon.heldItem === CORE_ITEM_IDS.ironBall &&
      active.ability !== CORE_ABILITY_IDS.klutz
    ) {
      effective = Math.floor(effective * 0.5);
    }

    return Math.max(1, effective);
  }

  // --- Turn Order ---

  /**
   * Gen 5 turn order resolution with Tailwind speed doubling and Trick Room reversal.
   *
   * Source: Showdown Gen 5 mod -- Tailwind doubles Speed for 4 turns
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
    this._currentWeather = rawWeather && isWeatherSuppressedOnFieldGen5(state) ? null : rawWeather;

    const tagged = actions.map((action, idx) => ({ action, idx, tiebreak: rng.next() }));
    const trickRoomActive = state.trickRoom.active;

    tagged.sort((a, b) => {
      const actionA = a.action;
      const actionB = b.action;

      if (actionA.type === "switch" && actionB.type !== "switch") return -1;
      if (actionB.type === "switch" && actionA.type !== "switch") return 1;

      if (actionA.type === "item" && actionB.type === "move") return -1;
      if (actionB.type === "item" && actionA.type === "move") return 1;

      if (actionA.type === "run" && actionB.type === "move") return -1;
      if (actionB.type === "run" && actionA.type === "move") return 1;

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

        // Ability-based priority boosts (Prankster in Gen 5)
        // Source: Showdown data/abilities.ts -- Prankster onModifyPriority: +1 for status moves
        if (activeA.ability && moveDataA) {
          const resultA = this.applyAbility("on-priority-check", {
            pokemon: activeA,
            state,
            rng: state.rng,
            trigger: "on-priority-check",
            move: moveDataA,
          });
          if (resultA.activated) {
            priorityA += resultA.priorityBoost ?? 0;
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
            priorityB += resultB.priorityBoost ?? 0;
          }
        }

        if (priorityA !== priorityB) return priorityB - priorityA;

        let speedA = this.getEffectiveSpeed(activeA);
        let speedB = this.getEffectiveSpeed(activeB);

        if (sideA?.tailwind.active) {
          speedA *= 2;
        }
        if (sideB?.tailwind.active) {
          speedB *= 2;
        }

        if (trickRoomActive) {
          if (speedA !== speedB) return speedA - speedB;
        } else {
          if (speedA !== speedB) return speedB - speedA;
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      return a.tiebreak < b.tiebreak ? -1 : 1;
    });

    this._currentWeather = null;
    return tagged.map((t) => t.action);
  }

  // --- Protect ---

  /**
   * Gen 5 Protect/Detect consecutive activation formula.
   * Uses doubling denominator: 2^N, capped at 256. When the cap is reached,
   * Showdown uses randomChance(1, 2^32) which is effectively impossible.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- stall condition
   *   onStart: counter = 2
   *   onStallMove: if counter >= 256 -> randomChance(1, 2**32); else randomChance(1, counter)
   *   onRestart: counter *= 2 (capped at counterMax=256)
   */
  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    if (consecutiveProtects === 0) return true;
    const denominator = Math.min(256, 2 ** consecutiveProtects);
    // Source: Showdown Gen 5 conditions.ts -- at counter >= 256, uses randomChance(1, 2**32)
    // which is ~1 in 4 billion, effectively impossible. We match this by using
    // 1 / 2^32 instead of 1 / 256 when the cap is reached.
    if (denominator >= 256) {
      return rng.chance(1 / 2 ** 32);
    }
    return rng.chance(1 / denominator);
  }

  // --- Experience ---

  /**
   * Gen 5 EXP formula with level-dependent scaling.
   *
   * Source: https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_V_and_VI
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
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9984 (Gen 4 establishes pattern)
    if (context.isTradedPokemon) {
      const tradedMultiplier = context.isInternationalTrade ? 1.7 : 1.5;
      exp = Math.floor(exp * tradedMultiplier);
    }

    // Source: specs/battle/06-gen5.md -- Exp. Share holder receives 50% of the awarded EXP
    if (context.hasExpShare) {
      exp = Math.floor(exp / 2);
    }

    return Math.max(1, exp);
  }

  // --- Catch Rate ---

  /**
   * Gen 5 uses 2.5x status catch modifier for sleep/freeze.
   *
   * Source: Bulbapedia -- Catch rate
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

  // --- End of Turn ---

  /**
   * Gen 5 end-of-turn effect ordering.
   *
   * Source: specs/battle/06-gen5.md section 17
   * Source: Showdown data/mods/gen5/conditions.ts -- residual order
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
      "magic-room-countdown",
      "wonder-room-countdown",
      "gravity-countdown",
      "weather-countdown",
      "toxic-orb-activation",
      "flame-orb-activation",
      "slow-start-countdown",
      "speed-boost",
      "moody",
      "healing-items",
    ];
  }

  /**
   * Gen 5 (like Gen 3+) has no per-attack residuals; all residuals are in Phase 2.
   *
   * Source: Showdown Gen 5 mod -- no per-attack residuals
   */
  getPostAttackResidualOrder(): readonly EndOfTurnEffect[] {
    return [];
  }
}
