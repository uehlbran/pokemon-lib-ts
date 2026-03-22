import type {
  AccuracyContext,
  ActivePokemon,
  BattleAction,
  BattleState,
  CritContext,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  ExpContext,
  ItemContext,
  ItemResult,
  MoveEffectContext,
  MoveEffectResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { DataManager, getStatStageMultiplier } from "@pokemon-lib-ts/core";
import { getSturdyDamageCap } from "./Gen5AbilitiesDamage";
import { GEN5_CRIT_MULTIPLIER, GEN5_CRIT_RATE_DENOMINATORS } from "./Gen5CritCalc";
import { calculateGen5Damage } from "./Gen5DamageCalc";
import { applyGen5HeldItem } from "./Gen5Items";
import { handleGen5CombatMove } from "./Gen5MoveEffectsCombat";
import { handleGen5FieldMove } from "./Gen5MoveEffectsField";
import { GEN5_TYPE_CHART, GEN5_TYPES } from "./Gen5TypeChart";
import { applyGen5WeatherEffects } from "./Gen5Weather";

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
    return calculateGen5Damage(
      context,
      this.getTypeChart() as Record<string, Record<string, number>>,
    );
  }

  /**
   * Gen 5+ recalculates future attack damage at hit time, not at use time.
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   * Source: Showdown sim/battle-actions.ts -- Gen 5+ recalculates future attack damage
   */
  override recalculatesFutureAttackDamage(): boolean {
    return true;
  }

  /**
   * Cap lethal damage for Sturdy (Gen 5+): survive any hit from full HP at 1 HP.
   *
   * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
   *   "If this Pokemon is at full HP, it survives attacks that would KO it with 1 HP."
   * Source: Bulbapedia -- Sturdy (Ability)
   */
  override capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    _state: BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    const capped = getSturdyDamageCap(defender.ability, damage, defender.pokemon.currentHp, maxHp);
    if (capped < damage) {
      const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
      return { damage: capped, survived: true, messages: [`${name} held on thanks to Sturdy!`] };
    }
    return { damage, survived: false, messages: [] };
  }

  // --- Move Effects ---

  /**
   * Gen 5 move effect execution.
   * Delegates to Gen5MoveEffects. Stub for Wave 0 -- returns base result.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    // Try field effect moves first (Magic Room, Wonder Room, Trick Room, Quick Guard, Wide Guard)
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts
    const fieldResult = handleGen5FieldMove(
      context,
      context.state.rng,
      this.rollProtectSuccess.bind(this),
    );
    if (fieldResult !== null) return fieldResult;

    // Try combat moves (Shell Smash, Quiver Dance, Dragon Tail, etc.)
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts
    const combatResult = handleGen5CombatMove(context);
    if (combatResult !== null) return combatResult;

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
   * Gen 5 weather mechanics:
   *   - Drizzle/Drought/Sand Stream/Snow Warning: infinite duration from ability
   *     (Gen 6 changed these to 5 turns)
   *   - Weather rocks (Damp Rock, Heat Rock, etc.): extend manual weather to 8 turns
   *   - Rain: boosts Water 1.5x, weakens Fire 0.5x, Thunder/Hurricane always hit
   *   - Sun: boosts Fire 1.5x, weakens Water 0.5x, SolarBeam skips charge
   *   - Sandstorm: 1/16 HP damage (Rock/Ground/Steel immune), Rock SpDef +50%
   *   - Hail: 1/16 HP damage (Ice immune), Blizzard always hits
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
   * Gen 5 introduces: Type Gems, Rocky Helmet, Air Balloon, Red Card,
   * Eject Button, Absorb Bulb, Cell Battery, Ring Target, Binding Band,
   * Jaboca/Rowap Berry, Unburden tracking, Embargo/Klutz suppression.
   *
   * Source: references/pokemon-showdown/data/items.ts (Gen 5 entries)
   */
  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen5HeldItem(trigger, context);
  }

  // --- Speed ---

  /**
   * Gen 5 effective speed calculation.
   *
   * Applies (in order):
   *   - Simple ability: doubles stat stage effects (clamped to [-6, 6])
   *   - Stat stages
   *   - Choice Scarf: 1.5x Speed (suppressed by Klutz)
   *   - Chlorophyll: 2x Speed in sun
   *   - Swift Swim: 2x Speed in rain
   *   - Sand Rush: 2x Speed in sandstorm
   *   - Slow Start: 0.5x Speed for first 5 turns
   *   - Unburden: 2x Speed when held item consumed
   *   - Quick Feet: 1.5x Speed when statused (OVERRIDES paralysis penalty)
   *   - Paralysis: 0.25x (Gen 3-6; Gen 7+ uses 0.5x) -- skipped if Quick Feet
   *   - Iron Ball: 0.5x Speed (suppressed by Klutz)
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
    // Source: Bulbapedia -- Choice Scarf raises Speed by 50%
    // Source: Bulbapedia -- Klutz prevents holder's items from taking effect
    if (active.pokemon.heldItem === "choice-scarf" && active.ability !== "klutz") {
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

    // Sand Rush: 2x Speed in sandstorm (NEW in Gen 5)
    // Source: Bulbapedia -- Sand Rush doubles Speed in sandstorm
    if (active.ability === "sand-rush" && this._currentWeather === "sand") {
      effective = effective * 2;
    }

    // Slow Start: halve Speed for the first 5 turns after entering battle.
    // Tracked via the "slow-start" volatile status.
    // Source: Bulbapedia -- Slow Start: "Halves Attack and Speed for 5 turns upon entering battle."
    if (active.ability === "slow-start" && active.volatileStatuses.has("slow-start")) {
      effective = Math.floor(effective / 2);
    }

    // Unburden: 2x Speed when held item is consumed/lost AND currently has no item.
    // Source: Bulbapedia -- Unburden: "Doubles the Pokemon's Speed stat when its held
    //   item is used or lost."
    if (
      active.ability === "unburden" &&
      active.volatileStatuses.has("unburden") &&
      !active.pokemon.heldItem
    ) {
      effective = effective * 2;
    }

    // Quick Feet: 1.5x Speed when statused, overrides paralysis penalty
    // Source: Bulbapedia -- Quick Feet: "Boosts Speed by 50% when the Pokemon
    //   has a status condition. The Speed drop from paralysis is also ignored."
    if (active.ability === "quick-feet" && active.pokemon.status !== null) {
      effective = Math.floor(effective * 1.5);
    } else if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (x0.25)
      // Source: Showdown sim/pokemon.ts -- Gen < 7 paralysis speed penalty
      effective = Math.floor(effective * 0.25);
    }

    // Iron Ball: halve Speed (suppressed by Klutz)
    // Source: Bulbapedia -- Iron Ball: "Cuts the Speed stat of the holder to half."
    // Source: Bulbapedia -- Klutz prevents holder's items from taking effect
    if (active.pokemon.heldItem === "iron-ball" && active.ability !== "klutz") {
      effective = Math.floor(effective * 0.5);
    }

    return Math.max(1, effective);
  }

  // --- Turn Order ---

  /**
   * Gen 5 turn order resolution with Tailwind speed doubling and Trick Room reversal.
   *
   * Overrides BaseRuleset.resolveTurnOrder to incorporate Tailwind (doubles speed
   * for the active side) and set _currentWeather for speed-based abilities.
   *
   * Source: Showdown Gen 5 mod -- Tailwind doubles Speed for 4 turns (Gen 5 = 4 turns)
   * Source: Bulbapedia -- Tailwind: doubles Speed of user's side
   * Source: Showdown Gen 5 mod -- Trick Room: slower Pokemon move first
   */
  override resolveTurnOrder(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): BattleAction[] {
    // Set weather context so getEffectiveSpeed can read it for Chlorophyll/Swift Swim/Sand Rush
    this._currentWeather = state.weather?.type ?? null;

    // Assign one tiebreak key per action BEFORE sorting for deterministic PRNG consumption
    // Source: GitHub issue #120 -- V8 sort calls comparator non-deterministic number of times
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
        try {
          priorityA = this.dataManager.getMove(moveSlotA.moveId).priority;
        } catch {
          /* default 0 */
        }
        try {
          priorityB = this.dataManager.getMove(moveSlotB.moveId).priority;
        } catch {
          /* default 0 */
        }

        if (priorityA !== priorityB) return priorityB - priorityA; // higher priority first

        // Speed tiebreak with Tailwind doubling
        // Source: Bulbapedia -- Tailwind doubles Speed of user's side
        let speedA = this.getEffectiveSpeed(activeA);
        let speedB = this.getEffectiveSpeed(activeB);

        if (sideA?.tailwind.active) {
          speedA *= 2;
        }
        if (sideB?.tailwind.active) {
          speedB *= 2;
        }

        // Trick Room reverses speed order (slower goes first)
        // Source: Showdown Gen 5 mod -- Trick Room
        if (trickRoomActive) {
          if (speedA !== speedB) return speedA - speedB;
        } else {
          if (speedA !== speedB) return speedB - speedA;
        }
        return a.tiebreak < b.tiebreak ? -1 : 1;
      }

      // Deterministic tiebreak (non-move vs non-move of same type)
      return a.tiebreak < b.tiebreak ? -1 : 1;
    });

    // Clear weather context after sort
    this._currentWeather = null;

    return tagged.map((t) => t.action);
  }

  // --- Protect ---

  /**
   * Gen 5 Protect/Detect consecutive activation formula.
   *
   * Success rate uses a doubling denominator: 2^N, capped at 256.
   *   consecutiveUses=0: always succeeds (100%)
   *   consecutiveUses=1: 1/2 (denominator = 2^1 = 2) — stall counter starts at 2 on first use
   *   consecutiveUses=2: 1/4 (denominator = 2^2 = 4) — doubled by onRestart
   *   consecutiveUses=3: 1/8 (denominator = 2^3 = 8)
   *   consecutiveUses=8: 1/256 (denominator = 2^8 = 256) -- cap
   *   consecutiveUses=10: still 1/256 (capped)
   *
   * This differs from Gen 4 which uses a halving formula capped at 1/8.
   *
   * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts --
   *   stall: counter starts at 2, counterMax: 256, doubles on restart
   *   success = random(counter) === 0
   */
  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    if (consecutiveProtects === 0) return true;
    // Denominator = 2^N, capped at 256
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- stall condition
    //   onStart: counter = 2 (set after FIRST successful use)
    //   onStallMove: chance = 1/counter (checked at SECOND+ use)
    //   onRestart: counter *= 2
    //   So at N=1 (second consecutive), counter=2 → chance=1/2
    //   At N=2 (third), counter=4 → chance=1/4, etc.
    //   Cap: counterMax=256; when counter≥256 Showdown uses randomChance(1, 2^32) ≈ 0
    //   We simplify the capped case to 1/256 — effectively zero for any practical scenario.
    //   Intentional minor divergence from Showdown (1/256 vs 1/4294967296 when N≥8).
    const denominator = Math.min(256, 2 ** consecutiveProtects);
    return rng.chance(1 / denominator);
  }

  // --- Experience ---

  /**
   * Gen 5 EXP formula with level-dependent scaling.
   *
   * The Gen 5 formula uses sqrt to scale EXP based on level difference:
   *   baseEXP = floor(sqrt(a) * a^2 * b / (sqrt(c) * c^2)) + 1
   * where:
   *   a = 2 * defeatedLevel + 10
   *   c = defeatedLevel + participantLevel + 10
   *   b = defeatedSpecies.baseExp
   *
   * Then multiplied by:
   *   - 1.5x for trainer battles
   *   - 1/participantCount for split
   *   - 1.5x for Lucky Egg
   *
   * Source: https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_V_and_VI
   * Source: specs/battle/06-gen5.md section 16
   */
  calculateExpGain(context: ExpContext): number {
    const a = 2 * context.defeatedLevel + 10;
    const b = context.defeatedLevel + context.participantLevel + 10;
    const sqrtA = Math.sqrt(a);
    const sqrtB = Math.sqrt(b);

    // Core formula: floor(floor(sqrt(a) * a^2) * baseExp / floor(sqrt(b) * b^2)) + 1
    let exp =
      Math.floor(
        (Math.floor(sqrtA * a * a) * context.defeatedSpecies.baseExp) / Math.floor(sqrtB * b * b),
      ) + 1;

    // Trainer battle multiplier: 1.5x
    // Source: Bulbapedia -- Trainer battle modifier 1.5x
    if (context.isTrainerBattle) {
      exp = Math.floor(exp * 1.5);
    }

    // Lucky Egg: 1.5x
    // Source: Bulbapedia -- Lucky Egg modifier 1.5x
    if (context.hasLuckyEgg) {
      exp = Math.floor(exp * 1.5);
    }

    // Participant split
    // Source: Bulbapedia -- EXP is split among participants
    if (context.participantCount > 1) {
      exp = Math.floor(exp / context.participantCount);
    }

    return Math.max(1, exp);
  }

  // --- Catch Rate ---

  /**
   * Gen 5 uses 2.5x status catch modifier for sleep/freeze (Gen 3-4 used 2.0x).
   *
   * Source: Bulbapedia — Catch rate (https://bulbapedia.bulbagarden.net/wiki/Catch_rate)
   * Source: Pokemon Showdown sim/battle-actions.ts — Gen 5+ sleep/freeze multiplier
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
   * Gen 5 end-of-turn order follows this sequence:
   *   1. Weather damage (sandstorm/hail chip)
   *   2. Future attack (Future Sight / Doom Desire)
   *   3. Wish recovery
   *   4. Weather healing (Rain Dish, Dry Skin rain, Ice Body)
   *   5. Shed Skin (33% cure)
   *   6. Leech Seed drain
   *   7. Leftovers recovery
   *   8. Black Sludge
   *   9. Aqua Ring recovery
   *  10. Ingrain recovery
   *  11. Poison Heal
   *  12. Status damage (Poison/Toxic/Burn)
   *  13. Nightmare damage
   *  14. Curse (Ghost) damage
   *  15. Bad Dreams
   *  16. Bind/Trap damage
   *  17. Perish Song countdown
   *  18. Screen countdown (Reflect / Light Screen)
   *  19. Safeguard countdown
   *  20. Tailwind countdown
   *  21. Trick Room countdown
   *  22. Gravity countdown
   *  23. Weather countdown
   *  24. Speed Boost
   *  25. Moody
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
      "yawn-countdown", // Yawn drowsy → sleep
      "encore-countdown", // Encore timer
      "taunt-countdown", // Taunt timer (3 turns in Gen 5)
      "disable-countdown", // Disable timer
      "heal-block-countdown", // Heal Block (5 turns)
      "embargo-countdown", // Embargo (5 turns)
      "magnet-rise-countdown", // Magnet Rise (5 turns)
      "perish-song",
      "screen-countdown",
      "safeguard-countdown",
      "tailwind-countdown",
      "trick-room-countdown",
      "magic-room-countdown", // Magic Room duration (5 turns)
      "wonder-room-countdown", // Wonder Room duration (5 turns)
      "gravity-countdown",
      "weather-countdown",
      "toxic-orb-activation", // Toxic Orb — after weather countdown
      "flame-orb-activation", // Flame Orb — after weather countdown
      "slow-start-countdown", // Slow Start (5 turns)
      "speed-boost",
      "moody", // Moody (introduced Gen 5)
      "healing-items", // Berry/item consumption
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
