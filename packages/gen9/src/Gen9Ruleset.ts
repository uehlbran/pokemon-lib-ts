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
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";

import { BaseRuleset } from "@pokemon-lib-ts/battle";
import type {
  AbilityTrigger,
  DataManager,
  EntryHazardType,
  MoveData,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { createGen9DataManager } from "./data/index.js";
import { handleGen9Ability } from "./Gen9Abilities.js";
import { GEN9_CRIT_MULTIPLIER, GEN9_CRIT_RATE_TABLE } from "./Gen9CritCalc.js";
import { calculateGen9Damage } from "./Gen9DamageCalc.js";
import { applyGen9EntryHazards } from "./Gen9EntryHazards.js";
import { applyGen9HeldItem } from "./Gen9Items.js";
import { calculateSaltCureDamage, executeGen9MoveEffect } from "./Gen9MoveEffects.js";
import { Gen9Terastallization } from "./Gen9Terastallization.js";
import { applyGen9TerrainEffects, checkGen9TerrainStatusImmunity } from "./Gen9Terrain.js";
import { GEN9_TYPE_CHART, GEN9_TYPES } from "./Gen9TypeChart.js";
import { applyGen9WeatherEffects } from "./Gen9Weather.js";

/**
 * Gen 9 (Scarlet/Violet) ruleset.
 *
 * Extends BaseRuleset and overrides the methods that differ in Gen 9.
 *
 * Key Gen 9 differences from Gen 8:
 *   - Dynamax/Gigantamax removed
 *   - Terastallization introduced (changes a Pokemon's type once per battle)
 *   - Snow replaces Hail (Defense boost for Ice-types instead of chip damage)
 *   - Pursuit, Hidden Power, Return, Frustration still removed (carried from Gen 8)
 *   - Confusion: 33% self-hit (unchanged from Gen 7-8)
 *   - Burn: 1/16 max HP (unchanged from Gen 7-8)
 *   - Paralysis speed: 0.5x (unchanged from Gen 7-8)
 *
 * Key Gen 9 inherits from BaseRuleset (Gen 7+ defaults):
 *   - getCritRateTable: [24, 8, 2, 1] (overridden for explicitness)
 *   - getCritMultiplier: 1.5x (overridden for explicitness)
 *   - getEffectiveSpeed: paralysis 0.5x (Gen 7+ default)
 *   - rollSleepTurns: 1-3
 *   - rollMultiHitCount: 35/35/15/15% for 2/3/4/5
 *   - rollProtectSuccess: 3^N denominator
 *   - applyStatusDamage: burn 1/16 (Gen 7+ default in BaseRuleset)
 *
 * Source: Showdown data/mods/gen9/ (Gen 9 data and overrides)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_IX
 */
export class Gen9Ruleset extends BaseRuleset {
  readonly generation = 9 as const;
  readonly name = "Gen 9 (Scarlet/Violet)";

  constructor(dataManager?: DataManager) {
    super(dataManager ?? createGen9DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN9_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN9_TYPES;
  }

  // --- Critical Hit System ---

  /**
   * Gen 9 crit rate table: [24, 8, 2, 1] (unchanged from Gen 6-8).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 9 crit rate table
   */
  override getCritRateTable(): readonly number[] {
    return GEN9_CRIT_RATE_TABLE;
  }

  /**
   * Gen 9 crit multiplier: 1.5x (unchanged from Gen 6-8).
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 9 crit multiplier
   */
  override getCritMultiplier(): number {
    return GEN9_CRIT_MULTIPLIER;
  }

  /**
   * Gen 9 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * Battle Armor and Shell Armor prevent critical hits in all gens where they exist.
   * This is identical to the Gen 8 implementation.
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
   * Gen 9 confusion self-hit chance is 33% (unchanged from Gen 7-8).
   *
   * BaseRuleset defaults to 50% (Gen 3-6). Gen 7+ must override to 33%.
   *
   * Source: Showdown data/conditions.ts -- confusion self-hit 33% from Gen 7 onwards
   * Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting itself
   *   in confusion has decreased from 50% to approximately 33%."
   */
  override rollConfusionSelfHit(rng: SeededRandom): boolean {
    return rng.chance(1 / 3);
  }

  /**
   * Returns the confusion self-hit chance for Gen 9 (33%, same as Gen 7-8).
   *
   * Source: Bulbapedia -- Gen 7+ confusion self-hit chance is ~33%
   */
  override getConfusionSelfHitChance(): number {
    return 1 / 3;
  }

  // --- Weather ---

  /**
   * Gen 9 end-of-turn weather effects.
   *
   * Key Gen 9 change: Snow replaces Hail. Snow has NO chip damage.
   * Only sandstorm deals chip damage (1/16 max HP to non-Rock/Ground/Steel).
   *
   * Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
   * Source: Showdown data/conditions.ts -- sandstorm weather chip damage
   * Source: Bulbapedia -- Weather conditions page, Snow replaces Hail in Gen 9
   */
  override applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen9WeatherEffects(state);
  }

  // --- Terrain ---

  /**
   * Gen 9 has terrain (Electric, Grassy, Misty, Psychic).
   *
   * Source: Showdown sim/field.ts -- terrain effects
   * Source: Bulbapedia -- Terrain mechanics present in Gen 9
   */
  hasTerrain(): boolean {
    return true;
  }

  /**
   * Gen 9 terrain end-of-turn effects.
   *
   * Currently handles Grassy Terrain healing (1/16 max HP for grounded Pokemon).
   *
   * Source: Bulbapedia "Grassy Terrain" -- 1/16 max HP heal at EoT for grounded Pokemon
   * Source: Showdown data/conditions.ts -- grassyterrain.onResidual
   */
  override applyTerrainEffects(state: BattleState): TerrainEffectResult[] {
    return applyGen9TerrainEffects(state);
  }

  /**
   * Check if a primary status condition can be inflicted on a target,
   * considering active terrain effects.
   *
   * - Electric Terrain: grounded Pokemon cannot fall asleep
   * - Misty Terrain: grounded Pokemon cannot gain any primary status condition
   *
   * Source: Bulbapedia "Electric Terrain" Gen 9 -- "Grounded Pokemon cannot fall asleep."
   * Source: Bulbapedia "Misty Terrain" Gen 9 -- "Grounded Pokemon are protected from
   *   status conditions."
   * Source: Showdown data/conditions.ts -- electricterrain/mistyterrain.onSetStatus
   */
  checkTerrainStatusImmunity(
    status: PrimaryStatus,
    target: ActivePokemon,
    state: BattleState,
  ): { immune: boolean; message?: string } {
    return checkGen9TerrainStatusImmunity(status, target, state);
  }

  // --- Switch System ---

  /**
   * Pursuit was removed in Gen 8 and remains absent in Gen 9.
   *
   * Source: Bulbapedia -- Pursuit removed in Gen 8, not restored in Gen 9
   */
  override shouldExecutePursuitPreSwitch(): boolean {
    return false;
  }

  // --- Entry Hazards ---

  /**
   * Gen 9 available hazards: Stealth Rock, Spikes, Toxic Spikes, Sticky Web.
   * G-Max Steelsurge is NOT available in Gen 9 (Dynamax removed).
   *
   * Source: Bulbapedia -- Entry hazards in Gen 9
   * Source: Showdown data/moves.ts -- Gen 9 hazard availability
   */
  override getAvailableHazards(): readonly EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes", "sticky-web"];
  }

  /**
   * Gen 9 entry hazards: Stealth Rock, Spikes, Toxic Spikes, Sticky Web.
   *
   * G-Max Steelsurge is NOT available (Dynamax removed in Gen 9).
   * Heavy-Duty Boots still blocks ALL hazard effects on switch-in.
   * Magic Guard blocks damage/status hazards but not Sticky Web's stat drop.
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
    return applyGen9EntryHazards(pokemon, side, state, this.getTypeChart());
  }

  // --- Future Attack ---

  /**
   * Gen 5+ recalculates future attack damage at hit time, not at use time.
   *
   * Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
   *   Future Sight or Doom Desire hits, not when it is used."
   */
  recalculatesFutureAttackDamage(): boolean {
    return true;
  }

  // --- Semi-Invulnerable ---

  /**
   * Gen 9 semi-invulnerable move bypass check (same as Gen 6-8).
   *
   * Certain moves can hit targets in semi-invulnerable states:
   * - Flying (Fly/Bounce): Gust, Twister, Thunder, Sky Uppercut, Hurricane,
   *   Smack Down, Thousand Arrows
   * - Underground (Dig): Earthquake, Magnitude, Fissure
   * - Underwater (Dive): Surf, Whirlpool
   * - Shadow Force charging: nothing bypasses it
   * - Generic charging: always hittable (not truly semi-invulnerable)
   *
   * Source: Showdown data/moves.ts -- semi-invulnerable move interactions
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
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

  // --- Battle Gimmick ---

  /**
   * Terastallization gimmick instance.
   * Allocated once and reused across battles (stateless -- tracking is on BattleSide/ActivePokemon).
   */
  private readonly _tera = new Gen9Terastallization();

  /**
   * Gen 9 battle gimmick: Terastallization only.
   * Mega Evolution, Z-Moves, and Dynamax are all removed in Gen 9.
   *
   * Source: Showdown data/mods/gen9 -- no Mega, Z-Moves, or Dynamax
   * Source: Bulbapedia -- Terastallization is the Gen 9 battle gimmick
   */
  getBattleGimmick(type: BattleGimmickType): BattleGimmick | null {
    if (type === "tera") return this._tera;
    return null;
  }

  // --- Experience ---

  /**
   * Gen 9 EXP formula (same as Gen 7-8).
   *
   * Gen 9 uses the same simplified formula as Gen 7-8 (no sqrt-based level scaling):
   *   exp = floor((baseExp * defeatedLevel) / (5 * participantCount))
   *   Apply trainer battle bonus (1.5x), Lucky Egg (1.5x), traded (1.5x/1.7x).
   *   Each multiplier is floored separately (sequential rounding).
   *
   * Key Gen 9 difference: EXP Share is always active (same as Gen 8).
   * However, this is an engine-level concern (the engine always passes
   * hasExpShare=true for non-participating party members), not a formula change.
   *
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_IX
   * Source: Showdown sim/battle.ts -- Gen 9 EXP formula (same as Gen 7-8)
   */
  override calculateExpGain(context: ExpContext): number {
    const baseExp = context.defeatedSpecies.baseExp;
    const l = context.defeatedLevel;
    const s = context.participantCount;

    // Step 1: Base EXP = floor((baseExp * defeatedLevel) / (5 * participantCount))
    // Source: Bulbapedia Gen IX EXP formula (same as Gen VII-VIII)
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

    return Math.max(1, exp);
  }

  // --- Held Items ---

  /**
   * Gen 9 held item handler.
   *
   * Delegates to applyGen9HeldItem which handles all item triggers:
   * before-move, end-of-turn, on-damage-taken, on-contact, on-hit.
   *
   * Gen 9 changes from Gen 8:
   *   - No Z-Crystals or Mega Stones (already removed in Gen 8)
   *   - No Dynamax suppression of Choice lock (Dynamax removed)
   *   - Booster Energy (new): Protosynthesis/Quark Drive trigger item
   *   - Covert Cloak (new): blocks secondary effects
   *   - Fairy Feather (new): 1.2x Fairy-type boost
   *
   * Source: Showdown data/items.ts -- Gen 9 item handlers
   */
  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen9HeldItem(trigger, context);
  }

  // --- Ability System ---

  /**
   * Gen 9 ability dispatch.
   *
   * Delegates to the Gen 9 ability handler which routes to:
   *   - Gen9AbilitiesStat: Protosynthesis, Quark Drive
   *   - Gen9AbilitiesNew: Toxic Chain, Good as Gold, Embody Aspect, Mycelium Might,
   *     Supreme Overlord, Intrepid Sword/Dauntless Shield (nerfed), Protean/Libero (nerfed)
   *   - Gen9AbilitiesSwitch: carry-forward switch/contact/passive abilities
   *
   * Source: Showdown data/abilities.ts
   */
  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    return handleGen9Ability(trigger, context);
  }

  // --- Move Effects ---

  /**
   * Gen 9 move effect dispatcher.
   *
   * Delegates to executeGen9MoveEffect for Gen 9-specific moves.
   * Falls back to BaseRuleset for standard move effects.
   *
   * Source: references/pokemon-showdown/data/moves.ts
   */
  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const result = executeGen9MoveEffect(context);
    if (result !== null) return result;

    // Delegate to BaseRuleset for any remaining moves
    return super.executeMoveEffect(context);
  }

  // --- Damage Received ---

  /**
   * Tracks the number of times a Pokemon has been hit, for Rage Fist.
   *
   * Incremented each time a Pokemon takes damage from a move.
   * The counter persists through switches (stored on PokemonInstance.timesAttacked).
   * Multi-hit moves count as one increment per move (not per hit).
   *
   * Source: Showdown data/moves.ts:15126-15128
   *   basePowerCallback(pokemon) { return Math.min(350, 50 + 50 * pokemon.timesAttacked); }
   * Source: Showdown sim/pokemon.ts -- timesAttacked incremented in hitBy() once per move
   */
  override onDamageReceived(
    defender: ActivePokemon,
    _damage: number,
    move: MoveData,
    state: BattleState,
  ): void {
    // Deduplicate multi-hit moves: only count once per turn per move.
    // Showdown increments timesAttacked once per move use (not per hit).
    // Source: Showdown sim/pokemon.ts -- timesAttacked incremented in hitBy(),
    //   which is called once per move resolution (not per multi-hit hit).
    // We track the last (turn number, move id) pair. If the current call has the
    // same pair as the last increment, it's a subsequent hit of a multi-hit move — skip.
    // If turnNumber is undefined (e.g., in tests that don't set it), always increment.
    const pokemon = defender.pokemon;
    const turnNumber: number | undefined = state.turnNumber;
    const lastTurnKey = `_rageFistLastTurn_${move.id}`;
    const lastTurn = (pokemon as unknown as Record<string, unknown>)[lastTurnKey] as
      | number
      | undefined;

    if (turnNumber !== undefined && lastTurn === turnNumber) {
      return; // already incremented this turn for this move (multi-hit dedup)
    }

    // Record this turn so subsequent hits of the same multi-hit move are skipped
    if (turnNumber !== undefined) {
      (pokemon as unknown as Record<string, unknown>)[lastTurnKey] = turnNumber;
    }

    pokemon.timesAttacked = (pokemon.timesAttacked ?? 0) + 1;
  }

  // --- End of Turn ---

  /**
   * Gen 9 end-of-turn effect order, adding Salt Cure at residualOrder 13
   * (same position as bind/partial trapping damage).
   *
   * Source: Showdown data/moves.ts:16224 -- onResidualOrder: 13
   * Source: specs/battle/10-gen9.md -- Salt Cure at order 13
   */
  override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    // Get the base order and insert salt-cure after bind (both at residualOrder 13)
    const baseOrder = super.getEndOfTurnOrder();
    const result: EndOfTurnEffect[] = [];

    for (const effect of baseOrder) {
      result.push(effect);
      // Insert salt-cure right after bind (both at residualOrder 13)
      if (effect === "bind") {
        // "salt-cure" is defined in battle's EndOfTurnEffect union (added in this wave).
        result.push("salt-cure" as EndOfTurnEffect);
      }
    }

    return result;
  }

  // --- Damage Calculation ---

  /**
   * Gen 9 damage formula.
   *
   * Delegates to the standalone calculateGen9Damage() function, passing the
   * Gen 9 type chart. The function implements the full Showdown Gen 9 damage
   * formula including:
   *   - Tera STAB via calculateTeraStab() (Stellar one-time 2x, normal Tera 2x)
   *   - Snow Ice-type Defense boost (1.5x, applied to defense stat)
   *   - Terrain boost: 1.3x (same as Gen 8)
   *   - 4096-based modifier chain with pokeRound
   *
   * Source: Showdown sim/battle-actions.ts -- Gen 9 damage formula
   * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen9Damage(
      context,
      this.getTypeChart() as Record<string, Record<string, number>>,
    );
  }

  // --- Salt Cure End-of-Turn ---

  /**
   * Process Salt Cure residual damage at end of turn.
   *
   * Deals 1/8 max HP per turn, or 1/4 max HP for Water/Steel types.
   * Called by the engine when processing the "salt-cure" end-of-turn effect.
   *
   * This is a helper method available for the engine to call. The actual
   * Salt Cure processing in the engine's processEndOfTurn should check for
   * the "salt-cure" volatile on each active Pokemon and apply damage.
   *
   * Source: Showdown data/moves.ts:16225-16227
   *   onResidual(pokemon) {
   *     this.damage(pokemon.baseMaxhp / (pokemon.hasType(['Water', 'Steel']) ? 4 : 8));
   *   }
   */
  processSaltCureDamage(active: ActivePokemon): number {
    // "salt-cure" is defined in core's VolatileStatus union (added in this wave).
    if (!active.volatileStatuses.has("salt-cure" as VolatileStatus)) return 0;
    if (active.pokemon.currentHp <= 0) return 0;

    const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
    const damage = calculateSaltCureDamage(maxHp, active.types);

    active.pokemon.currentHp = Math.max(0, active.pokemon.currentHp - damage);
    return damage;
  }
}
