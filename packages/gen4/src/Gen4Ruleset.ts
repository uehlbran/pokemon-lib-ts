import type {
  AbilityContext,
  AbilityResult,
  AccuracyContext,
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
  EntryHazardType,
  PokemonType,
  PrimaryStatus,
  SeededRandom,
  TypeChart,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  calculateExpGainClassic,
  DataManager,
  gen14MultiHitRoll,
  getStatStageMultiplier,
} from "@pokemon-lib-ts/core";
import { applyGen4Ability } from "./Gen4Abilities";
import { GEN4_CRIT_MULTIPLIER, GEN4_CRIT_RATE_DENOMINATORS } from "./Gen4CritCalc";
import { calculateGen4Damage } from "./Gen4DamageCalc";
import { applyGen4HeldItem } from "./Gen4Items";
import { executeGen4MoveEffect } from "./Gen4MoveEffects";
import { GEN4_TYPE_CHART, GEN4_TYPES } from "./Gen4TypeChart";
import { applyGen4WeatherEffects } from "./Gen4Weather";

/**
 * Gen 4 (Diamond/Pearl/Platinum/HeartGold/SoulSilver) ruleset.
 *
 * Extends BaseRuleset (Gen 6+/7+ defaults) and overrides the methods that differ
 * in Gen 4.
 *
 * Key Gen 4 differences from Gen 3:
 *   - Physical/Special split: category is per-move, not per-type
 *   - New entry hazards: Stealth Rock, Toxic Spikes (Gen 3 only had Spikes)
 *   - Weather rocks extend weather to 8 turns
 *   - Rock-type SpDef +50% in sandstorm (NEW vs Gen 3)
 *   - Struggle recoil: 1/4 max HP (Gen 3 was 1/4 damage dealt)
 *   - Sleep: 1-5 turns (Gen 3 was 2-5 turns)
 *
 * Overrides implemented here:
 *   - calculateBindDamage — 1/16 max HP (Gen 2-4; Gen 5+ uses 1/8)
 *   - rollMultiHitCount — Gen 1-4 weighted distribution via gen14MultiHitRoll
 *   - rollSleepTurns — 1-5 turns (international Gen 4; Gen 5+ uses 1-3)
 *   - calculateExpGain — classic formula (no level scaling)
 *   - getCritMultiplier — 2.0x (Gen 3-5; Gen 6+ uses 1.5x)
 *   - getCritRateTable — [16, 8, 4, 3, 2] denominators
 *   - getAvailableTypes — 17 types (no Fairy)
 *   - getEffectiveSpeed — paralysis penalty 0.25x (Gen 3-6; Gen 7+ uses 0.5x)
 *   - applyStatusDamage — burn = 1/8 max HP (Gen 3-6; Gen 7+ uses 1/16)
 *   - rollProtectSuccess — halving formula, caps at 12.5% (verified pokeplatinum decomp)
 *   - rollCritical — Battle Armor / Shell Armor immunity check
 *   - doesMoveHit — Gen 3-4 accuracy stage ratios (pokeemerald sAccuracyStageRatios)
 *   - getQuickClawActivated — 20% pre-roll (same as Gen 3)
 *   - applyEntryHazards — Spikes + Stealth Rock + Toxic Spikes (Gen 4 full set)
 *   - resolveTurnOrder — Tailwind speed doubling + Trick Room reversal (Gen 4)
 *   - processSleepTurn — cannot act on wake turn (Gen 1-4 behavior; Gen 5+ can act)
 *   - canSwitch — Shadow Tag, Arena Trap, Magnet Pull, trapped volatile
 */
export class Gen4Ruleset extends BaseRuleset {
  readonly generation = 4 as const;
  readonly name = "Gen 4 (Diamond/Pearl/Platinum)";

  /**
   * Temporary weather state set during resolveTurnOrder so that getEffectiveSpeed
   * can read it. The protected getEffectiveSpeed signature only takes ActivePokemon
   * (inherited from BaseRuleset), but Chlorophyll/Swift Swim need weather context.
   * Set to null outside of turn order resolution.
   */
  private _currentWeather: string | null = null;

  constructor(dataManager?: DataManager) {
    super(dataManager ?? new DataManager());
  }

  // --- Type System ---

  getTypeChart(): TypeChart {
    return GEN4_TYPE_CHART;
  }

  getAvailableTypes(): readonly PokemonType[] {
    return GEN4_TYPES;
  }

  // --- Damage Calculation ---

  /**
   * Gen 4 damage formula with physical/special split.
   *
   * Gen 4 is the first generation where move category is per-move, not per-type.
   * Delegates to calculateGen4Damage which implements the full formula.
   *
   * Source: Showdown sim/battle.ts — Gen 4 damage calc
   * Source: pret/pokeplatinum — damage formula (where decompiled)
   */
  calculateDamage(context: DamageContext): DamageResult {
    return calculateGen4Damage(context, this.getTypeChart());
  }

  // --- Move Effects ---

  /**
   * Gen 4 move effect execution.
   * Delegates to Gen4MoveEffects which handles all data-driven and custom effects.
   *
   * Key Gen 4 additions over Gen 3:
   *   - Shield Dust blocks secondary effects
   *   - Weather rocks extend weather to 8 turns
   *   - Light Clay extends screens to 8 turns
   *   - Defog, Roost, Stealth Rock, Toxic Spikes, Trick Room, Tailwind
   *   - No Electric-type paralysis immunity (Gen 6 addition)
   *
   * Source: Showdown sim/battle.ts Gen 4 mod
   */
  executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    return executeGen4MoveEffect(context);
  }

  // --- Semi-Invulnerable Hit Check ---

  /**
   * Gen 4 semi-invulnerable move bypass check.
   *
   * Determines if a move can hit a target that is in a semi-invulnerable state
   * (Fly, Dig, Dive, Shadow Force charge turn).
   *
   * - "flying" (Fly/Bounce): Thunder, Gust, Twister, Sky Uppercut can hit
   * - "underground" (Dig): Earthquake, Magnitude, Fissure can hit
   * - "underwater" (Dive): Surf, Whirlpool can hit
   * - "shadow-force-charging" (Shadow Force): nothing bypasses
   * - "charging" (SolarBeam, Skull Bash, etc.): not semi-invulnerable; all moves hit
   *
   * Source: Showdown Gen 4 mod — semi-invulnerable move immunity checks
   * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
   */
  override canHitSemiInvulnerable(moveId: string, volatile: VolatileStatus): boolean {
    switch (volatile) {
      case "flying":
        return ["gust", "twister", "thunder", "sky-uppercut"].includes(moveId);
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
   * Source: pret/pokeplatinum — same crit table as Gen 3 and Gen 5
   */
  getCritRateTable(): readonly number[] {
    return GEN4_CRIT_RATE_DENOMINATORS;
  }

  /**
   * Gen 3-5 critical hit multiplier: 2.0x.
   * (Gen 6+ uses 1.5x via BaseRuleset default.)
   *
   * Source: pret/pokeplatinum — crits double base damage
   */
  getCritMultiplier(): number {
    return GEN4_CRIT_MULTIPLIER;
  }

  /**
   * Gen 4 critical hit roll with Battle Armor / Shell Armor immunity.
   *
   * If the defender has Battle Armor or Shell Armor, critical hits are
   * completely prevented — return false immediately without rolling.
   * Otherwise, defer to BaseRuleset.rollCritical for normal crit logic.
   *
   * Source: pret/pokeplatinum — same Battle Armor / Shell Armor check as Gen 3
   */
  override rollCritical(context: CritContext): boolean {
    const defenderAbility = context.defender?.ability;
    if (defenderAbility === "battle-armor" || defenderAbility === "shell-armor") {
      return false;
    }
    return super.rollCritical(context);
  }

  // --- Hazard System ---

  /**
   * Gen 4 entry hazards: Spikes, Stealth Rock (NEW), and Toxic Spikes (NEW).
   * Sticky Web was introduced in Gen 6.
   *
   * Source: pret/pokeplatinum — Spikes, Stealth Rock, and Toxic Spikes all available
   */
  getAvailableHazards(): readonly EntryHazardType[] {
    return ["stealth-rock", "spikes", "toxic-spikes"];
  }

  /**
   * Gen 4 entry hazard application.
   *
   * Spikes (Gen 3+):
   *   1 layer = 1/8 max HP
   *   2 layers = 1/6 max HP
   *   3 layers = 1/4 max HP
   *   Flying-types and Levitate immune.
   *
   * Stealth Rock (NEW in Gen 4):
   *   Damage based on type effectiveness of Rock vs switch-in's types.
   *   Base: 1/8 max HP, multiplied by type effectiveness.
   *   4x weak (e.g., Fire/Flying): 1/2 max HP
   *   2x weak (e.g., Fire): 1/4 max HP
   *   Neutral: 1/8 max HP
   *   Resist (e.g., Fighting): 1/16 max HP
   *   Double resist (e.g., Fighting/Ground): 1/32 max HP
   *
   * Toxic Spikes (NEW in Gen 4):
   *   1 layer = Regular poison on switch-in
   *   2 layers = Badly poisoned (toxic) on switch-in
   *   Flying-types and Levitate immune.
   *   Poison-types absorb (remove) Toxic Spikes on switch-in.
   *   Steel-types immune to poison effect.
   *
   * Source: pret/pokeplatinum — entry hazard damage / effect tables
   * Source: Bulbapedia — Stealth Rock, Toxic Spikes
   */
  applyEntryHazards(pokemon: ActivePokemon, side: BattleSide): EntryHazardResult {
    // Magic Guard: immune to all indirect damage, including entry hazard damage
    // Note: Toxic Spikes status infliction is ALSO prevented by Magic Guard
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard prevents hazard damage
    if (pokemon.ability === "magic-guard") {
      return {
        damage: 0,
        statusInflicted: null,
        statChanges: [],
        messages: [],
      };
    }

    let totalDamage = 0;
    let statusInflicted: PrimaryStatus | null = null;
    const messages: string[] = [];
    const hazardsToRemove: EntryHazardType[] = [];
    const pokemonName = pokemon.pokemon.nickname ?? pokemon.pokemon.speciesId.toString();
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;

    const isFlying = pokemon.types.includes("flying");
    const hasLevitate = pokemon.ability === "levitate";
    // Magnet Rise: grants levitation — immune to ground-based hazards (Spikes, Toxic Spikes)
    // Source: Bulbapedia — Magnet Rise: "makes the user immune to Ground-type moves"
    // Source: Showdown Gen 4 mod — Magnet Rise grants same grounding immunity as Levitate
    const hasMagnetRise = pokemon.volatileStatuses.has("magnet-rise");
    const isGrounded = !isFlying && !hasLevitate && !hasMagnetRise;

    // --- Stealth Rock ---
    const stealthRock = side.hazards.find((h) => h.type === "stealth-rock");
    if (stealthRock && stealthRock.layers > 0) {
      // Stealth Rock damage is type-effectiveness-based: Rock vs target's types
      // Source: Bulbapedia — Stealth Rock damage = (1/8) * type effectiveness
      const typeChart = this.getTypeChart();
      let effectiveness = 1;
      for (const type of pokemon.types) {
        const rockVsType = typeChart.rock?.[type] ?? 1;
        effectiveness *= rockVsType;
      }
      const damage = Math.max(1, Math.floor((maxHp * effectiveness) / 8));
      totalDamage += damage;
      messages.push(`Pointed stones dug into ${pokemonName}!`);
    }

    // --- Spikes (grounded only) ---
    if (isGrounded) {
      const spikes = side.hazards.find((h) => h.type === "spikes");
      if (spikes && spikes.layers > 0) {
        // Damage fractions: 1 layer = 1/8, 2 layers = 1/6, 3 layers = 1/4
        // Source: pret/pokeplatinum — same as Gen 3
        const fractions = [0, 1 / 8, 1 / 6, 1 / 4];
        const layers = Math.min(spikes.layers, 3);
        const fraction = fractions[layers] ?? 1 / 8;
        const damage = Math.max(1, Math.floor(maxHp * fraction));
        totalDamage += damage;
        messages.push(`${pokemonName} was hurt by the spikes!`);
      }

      // --- Toxic Spikes (grounded only) ---
      const toxicSpikes = side.hazards.find((h) => h.type === "toxic-spikes");
      if (toxicSpikes && toxicSpikes.layers > 0) {
        // Poison-types absorb (remove) toxic spikes on switch-in
        // Source: Bulbapedia — Toxic Spikes: grounded Poison-types remove them
        if (pokemon.types.includes("poison")) {
          // Absorb: remove the toxic spikes from this side
          // Source: Bulbapedia — Toxic Spikes: grounded Poison-types remove them
          hazardsToRemove.push("toxic-spikes");
          messages.push(`${pokemonName} absorbed the poison spikes!`);
        } else if (pokemon.types.includes("steel")) {
          // Steel-types are immune to poison status
          // Source: Bulbapedia — Steel types cannot be poisoned
        } else if (!pokemon.pokemon.status) {
          // Can only inflict status if the target has no existing status
          if (toxicSpikes.layers >= 2) {
            statusInflicted = "badly-poisoned";
            messages.push(`${pokemonName} was badly poisoned by the toxic spikes!`);
          } else {
            statusInflicted = "poison";
            messages.push(`${pokemonName} was poisoned by the toxic spikes!`);
          }
        }
      }
    }

    return {
      damage: totalDamage,
      statusInflicted,
      statChanges: [],
      messages,
      hazardsToRemove: hazardsToRemove.length > 0 ? hazardsToRemove : undefined,
    };
  }

  // --- End-of-Turn System ---

  /**
   * Gen 2-4 bind/trap damage: 1/16 of max HP per turn.
   * Gen 5+ increased this to 1/8 (BaseRuleset default).
   *
   * Source: Bulbapedia — Binding move damage is 1/16 in Gen 2-4
   * Source: pret/pokeplatinum — trap damage = maxHP / 16
   */
  calculateBindDamage(pokemon: ActivePokemon): number {
    // Magic Guard: immune to all indirect damage, including binding/trap damage
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard prevents bind/wrap/clamp damage
    if (pokemon.ability === "magic-guard") {
      return 0;
    }
    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    return Math.max(1, Math.floor(maxHp / 16));
  }

  /**
   * Gen 4 Leech Seed drain with Magic Guard override.
   * Magic Guard prevents Leech Seed drain entirely.
   *
   * Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
   * Source: Showdown Gen 4 — Magic Guard prevents Leech Seed drain
   */
  override calculateLeechSeedDrain(pokemon: ActivePokemon): number {
    if (pokemon.ability === "magic-guard") {
      return 0;
    }
    return super.calculateLeechSeedDrain(pokemon);
  }

  /**
   * Gen 4 Curse (Ghost-type) damage with Magic Guard override.
   * Magic Guard prevents Curse damage entirely.
   *
   * Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
   * Source: Showdown Gen 4 — Magic Guard prevents Curse damage
   */
  override calculateCurseDamage(pokemon: ActivePokemon): number {
    if (pokemon.ability === "magic-guard") {
      return 0;
    }
    return super.calculateCurseDamage(pokemon);
  }

  /**
   * Gen 4 Nightmare damage with Magic Guard override.
   * Magic Guard prevents Nightmare damage entirely.
   *
   * Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
   * Source: Showdown Gen 4 — Magic Guard prevents Nightmare damage
   */
  override calculateNightmareDamage(pokemon: ActivePokemon): number {
    if (pokemon.ability === "magic-guard") {
      return 0;
    }
    return super.calculateNightmareDamage(pokemon);
  }

  /**
   * Gen 1-4 multi-hit distribution: weighted [2,2,2,3,3,3,4,5].
   * Hit counts: 2 (37.5%), 3 (37.5%), 4 (12.5%), 5 (12.5%).
   * Gen 5+ uses a different distribution (BaseRuleset default).
   *
   * Source: pret/pokeplatinum — multi-hit uses same 8-entry lookup table as Gen 1-3
   * Also: packages/core/src/logic/gen12-shared.ts gen14MultiHitRoll
   */
  rollMultiHitCount(attacker: ActivePokemon, rng: SeededRandom): number {
    // Source: Showdown — Skill Link (introduced Gen 4) always hits 5 times
    if (attacker.ability === "skill-link") return 5;
    return gen14MultiHitRoll(rng);
  }

  // --- Status System ---

  /**
   * Gen 4 (international) sleep duration: 1-5 turns.
   * Gen 3 was 2-5 turns. Gen 5+ is 1-3 turns (BaseRuleset default).
   *
   * Source: Bulbapedia — Sleep (status condition), international Gen 4: 1-5 turns
   * Source: specs/battle/05-gen4.md — "Duration: 1-5 turns (international Gen 4)"
   */
  rollSleepTurns(rng: SeededRandom): number {
    return rng.int(1, 5);
  }

  /**
   * Gen 4 sleep processing: the Pokemon CANNOT act on the turn it wakes up.
   *
   * In Gen 5+ (BaseRuleset default), a Pokemon can act on the turn it wakes.
   * In Gen 1-4, waking up consumes the turn — the Pokemon loses its action.
   *
   * Source: pret/pokeplatinum — sleep counter decrements at turn start; wake = can't act
   * Source: Showdown Gen 4 mod — pokemon.status === 'slp' prevents action on wake turn
   */
  override processSleepTurn(pokemon: ActivePokemon, _state: BattleState): boolean {
    const sleepState = pokemon.volatileStatuses.get("sleep-counter");
    if (!sleepState || sleepState.turnsLeft <= 0) {
      // No counter found or already at 0 — wake up, but cannot act (Gen 4)
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false;
    }
    sleepState.turnsLeft--;
    if (sleepState.turnsLeft <= 0) {
      // Counter just reached 0 — wake up, but cannot act (Gen 4)
      pokemon.pokemon.status = null;
      pokemon.volatileStatuses.delete("sleep-counter");
      return false;
    }
    return false; // Still sleeping — cannot act
  }

  /**
   * Gen 3-6 burn damage: 1/8 of max HP per turn.
   * Gen 7+ reduced burn damage to 1/16 (BaseRuleset default).
   *
   * Source: pret/pokeplatinum — burn tick = maxHP / 8
   * Source: specs/battle/05-gen4.md line 48 — "Burn damage is 1/8 max HP"
   */
  applyStatusDamage(pokemon: ActivePokemon, status: PrimaryStatus, state: BattleState): number {
    // Magic Guard: immune to all indirect damage, including status damage
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard prevents burn/poison/toxic damage
    if (pokemon.ability === "magic-guard") {
      return 0;
    }

    const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
    if (status === "burn") {
      // Heatproof: burn damage is halved (1/16 instead of 1/8)
      // Source: Bulbapedia — Heatproof: "Also halves the damage the holder takes from a burn."
      // Source: Showdown Gen 4 — Heatproof halves burn damage
      if (pokemon.ability === "heatproof") {
        return Math.max(1, Math.floor(maxHp / 16));
      }
      // Gen 3-6: burn = 1/8 max HP (not 1/16 like Gen 7+)
      // Source: pret/pokeplatinum — burn damage = maxHP / 8
      return Math.max(1, Math.floor(maxHp / 8));
    }
    // All other statuses use the BaseRuleset default logic
    return super.applyStatusDamage(pokemon, status, state);
  }

  // --- Experience ---

  /**
   * Gen 3-4 EXP formula: classic formula (no level scaling).
   * EXP = (b * L_d / 7) * (1 / s) * t
   *
   * Source: pret/pokeplatinum — same classic EXP formula as Gen 3
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

  // --- Protect ---

  /**
   * Gen 4 Protect/Detect consecutive activation formula.
   *
   * Success rate halves each consecutive use, capped at 12.5% (1/8):
   *   consecutiveUses=0: always succeeds (100%)
   *   consecutiveUses=1: 50% (0x7FFF / 0xFFFF)
   *   consecutiveUses=2: 25% (0x3FFF / 0xFFFF)
   *   consecutiveUses=3+: 12.5% (0x1FFF / 0xFFFF) — CAPS HERE
   *
   * Source: VERIFIED pret/pokeplatinum battle_script.c:5351-5356
   *   sProtectSuccessRate has exactly 4 entries (0xFFFF, 0x7FFF, 0x3FFF, 0x1FFF).
   *   Counter caps at index 3 (line 5405). Minimum is 12.5%, NOT 1/256.
   */
  rollProtectSuccess(consecutiveProtects: number, rng: SeededRandom): boolean {
    if (consecutiveProtects === 0) return true;
    // Cap at 3 consecutive uses (index 3 = 12.5%)
    // Source: pret/pokeplatinum — sProtectSuccessRate has 4 entries, counter caps at 3
    const capped = Math.min(consecutiveProtects, 3);
    const denominator = 2 ** capped; // 2, 4, 8
    return rng.chance(1 / denominator);
  }

  // --- Speed (turn order helper) ---

  /**
   * Gen 4 effective speed calculation.
   *
   * Applies:
   *   - Stat stages
   *   - Choice Scarf: 1.5x Speed (NEW in Gen 4)
   *   - Chlorophyll: 2x Speed in sun (NEW in Gen 4)
   *   - Swift Swim: 2x Speed in rain
   *   - Quick Feet: 1.5x Speed when statused (OVERRIDES paralysis penalty)
   *   - Paralysis: 0.25x (Gen 3-6; Gen 7+ uses 0.5x) — skipped if Quick Feet
   *
   * Source: pret/pokeplatinum — paralyzed speed = speed / 4
   * Source: Bulbapedia — Choice Scarf: "Raises the holder's Speed by 50%,
   *   but only allows the use of the first move selected."
   * Source: Bulbapedia — Chlorophyll: "Doubles the Pokemon's Speed in sun."
   * Source: Bulbapedia — Swift Swim: "Doubles the Pokemon's Speed in rain."
   * Source: Bulbapedia — Quick Feet: "Boosts Speed by 50% when the Pokemon
   *   has a status condition."
   */
  protected getEffectiveSpeed(active: ActivePokemon): number {
    const stats = active.pokemon.calculatedStats;
    const baseSpeed = stats ? stats.speed : 100;

    // Simple: doubles the effective speed stage (clamped to [-6, +6])
    // Source: Showdown Gen 4 — Simple doubles stat stage
    // Source: Bulbapedia — Simple: "Doubles the effects of stat stage changes"
    const rawSpeedStage = active.statStages.speed;
    const speedStage =
      active.ability === "simple" ? Math.max(-6, Math.min(6, rawSpeedStage * 2)) : rawSpeedStage;

    let effective = Math.floor(baseSpeed * getStatStageMultiplier(speedStage));

    // Klutz: held item has no effect (including Choice Scarf speed boost)
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    // Source: Showdown data/abilities.ts — Klutz gates all item battle effects
    const hasKlutz = active.ability === "klutz";

    // Choice Scarf: 1.5x Speed
    // Source: Bulbapedia — Choice Scarf raises Speed by 50%
    // Source: Showdown sim/items.ts — Choice Scarf onModifySpe
    if (!hasKlutz && active.pokemon.heldItem === "choice-scarf") {
      effective = Math.floor(effective * 1.5);
    }

    // Chlorophyll: 2x Speed in sun
    // Source: Bulbapedia — Chlorophyll doubles Speed in sun
    // Source: Showdown data/abilities.ts — Chlorophyll onModifySpe
    if (active.ability === "chlorophyll" && this._currentWeather === "sun") {
      effective = effective * 2;
    }

    // Swift Swim: 2x Speed in rain
    // Source: Bulbapedia — Swift Swim doubles Speed in rain
    // Source: Showdown data/abilities.ts — Swift Swim onModifySpe
    if (active.ability === "swift-swim" && this._currentWeather === "rain") {
      effective = effective * 2;
    }

    // Slow Start: halve Speed for the first 5 turns after entering battle.
    // Tracked via the "slow-start" volatile status.
    // Source: Bulbapedia — Slow Start: "Halves Attack and Speed for 5 turns upon entering battle."
    // Source: Showdown data/abilities.ts — Slow Start onModifySpe
    if (active.ability === "slow-start" && active.volatileStatuses.has("slow-start")) {
      effective = Math.floor(effective / 2);
    }

    // Unburden: 2x Speed when held item is consumed/lost AND currently has no item.
    // Source: Bulbapedia — Unburden: "Doubles the Pokemon's Speed stat when its held
    //   item is used or lost."
    // Source: Showdown data/abilities.ts — Unburden onModifySpe
    if (
      active.ability === "unburden" &&
      active.volatileStatuses.has("unburden") &&
      !active.pokemon.heldItem
    ) {
      effective = effective * 2;
    }

    // Quick Feet: 1.5x Speed when statused, overrides paralysis penalty
    // Source: Bulbapedia — Quick Feet: "Boosts Speed by 50% when the Pokemon
    //   has a status condition. The Speed drop from paralysis is also ignored."
    // Source: Showdown data/abilities.ts — Quick Feet onModifySpe
    if (active.ability === "quick-feet" && active.pokemon.status !== null) {
      effective = Math.floor(effective * 1.5);
    } else if (active.pokemon.status === "paralysis") {
      // Gen 3-6: paralysis quarters speed (x0.25)
      // Source: pret/pokeplatinum
      effective = Math.floor(effective * 0.25);
    }

    // Iron Ball: halve Speed (Klutz suppresses Iron Ball's speed penalty)
    // Source: Bulbapedia — Iron Ball: "Cuts the Speed stat of the holder to half."
    // Source: Showdown data/items.ts — Iron Ball onModifySpe halves speed
    if (!hasKlutz && active.pokemon.heldItem === "iron-ball") {
      effective = Math.floor(effective * 0.5);
    }

    return Math.max(1, effective);
  }

  // --- Turn Order ---

  /**
   * Gen 4 turn order resolution with Tailwind speed doubling and Trick Room reversal.
   *
   * Overrides BaseRuleset.resolveTurnOrder to incorporate Tailwind (doubles speed
   * for the active side) into the speed comparison. BaseRuleset.getEffectiveSpeed
   * only takes ActivePokemon and has no access to BattleSide.tailwind state, so
   * Tailwind must be applied here in the sort.
   *
   * Turn order rules (matching BaseRuleset exactly, plus Tailwind):
   *   1. Switches always go first (before items, moves, run)
   *   2. Items go before moves
   *   3. Run goes before moves
   *   4. Moves sorted by: priority (desc) > Quick Claw > speed > random tiebreak
   *   5. Tailwind doubles effective speed for the active side
   *   6. Trick Room reverses speed comparison (slower goes first)
   *
   * Source: Showdown Gen 4 mod -- Tailwind doubles Speed for 3 turns
   * Source: Bulbapedia -- Tailwind: doubles Speed of user's side
   * Source: Showdown Gen 4 mod -- Trick Room: slower Pokemon move first
   */
  override resolveTurnOrder(
    actions: BattleAction[],
    state: BattleState,
    rng: SeededRandom,
  ): BattleAction[] {
    // Set weather context so getEffectiveSpeed can read it for Chlorophyll/Swift Swim
    this._currentWeather = state.weather?.type ?? null;

    // Pre-roll Quick Claw before tiebreak keys (preserves PRNG consumption order)
    const quickClawActivated = this.getQuickClawActivated(actions, state, rng);

    // Pre-compute Custap Berry activations (deterministic, HP-based — no PRNG needed)
    const custapActivated = this.getCustapBerryActivated(actions, state);

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

        // Stall: always move last within priority bracket
        // Source: Bulbapedia — Stall: "The Pokemon moves after all other Pokemon"
        // Source: Showdown data/abilities.ts — Stall: onFractionalPriority -0.1
        const stallA = activeA.ability === "stall";
        const stallB = activeB.ability === "stall";
        if (stallA && !stallB) return 1; // Stall goes LAST
        if (stallB && !stallA) return -1; // Stall goes LAST

        // Lagging Tail / Full Incense: holder always moves last within priority bracket
        // Source: Bulbapedia — Lagging Tail / Full Incense: "Holder always moves last"
        // Source: Showdown data/items.ts — Lagging Tail / Full Incense: onFractionalPriority -0.1
        const laggingA =
          activeA.pokemon.heldItem === "lagging-tail" ||
          activeA.pokemon.heldItem === "full-incense";
        const laggingB =
          activeB.pokemon.heldItem === "lagging-tail" ||
          activeB.pokemon.heldItem === "full-incense";
        if (laggingA && !laggingB) return 1; // goes last
        if (laggingB && !laggingA) return -1; // goes last

        // Custap Berry: move first within priority bracket at <=25% HP
        // Source: Bulbapedia — Custap Berry: "moves first in its priority bracket"
        // Source: Showdown data/items.ts — Custap Berry: onFractionalPriority checks HP <= 0.25
        const custapA = custapActivated.has(a.idx);
        const custapB = custapActivated.has(b.idx);
        if (custapA && !custapB) return -1; // Custap goes first
        if (custapB && !custapA) return 1;

        // Quick Claw: activated holders go first within same priority bracket
        const qcA = quickClawActivated.has(a.idx);
        const qcB = quickClawActivated.has(b.idx);
        if (qcA && !qcB) return -1;
        if (qcB && !qcA) return 1;

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
        // Source: Showdown Gen 4 mod -- Trick Room
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

  // --- Quick Claw ---

  /**
   * Pre-rolls Quick Claw for each move action before the main sort.
   * Quick Claw gives a 20% chance to move first among same-priority actions.
   *
   * Overrides the BaseRuleset hook so PRNG calls (QC rolls) happen before tiebreak
   * keys are assigned, preserving PRNG consumption order.
   *
   * Source: pret/pokeplatinum — Quick Claw has same 20% activation as Gen 3
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
          // Source: pret/pokeplatinum — Quick Claw 20% activation
          if (rng.chance(0.2)) {
            quickClawActivated.add(i);
          }
        }
      }
    }
    return quickClawActivated;
  }

  // --- Custap Berry ---

  /**
   * Pre-compute Custap Berry activations for turn ordering.
   *
   * Custap Berry gives the holder priority within their bracket when HP is at
   * or below 25% of max HP. No PRNG involved — purely HP-based.
   *
   * Source: Bulbapedia — Custap Berry: "When the holder's HP drops to 1/4 or
   *   less, it will move first in its priority bracket."
   * Source: Showdown data/items.ts — Custap Berry: onFractionalPriority
   */
  private getCustapBerryActivated(actions: BattleAction[], state: BattleState): Set<number> {
    const activated = new Set<number>();
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action && action.type === "move") {
        const side = state.sides[action.side];
        const active = side?.active[0];
        if (!active) continue;
        if (active.pokemon.heldItem !== "custap-berry") continue;
        const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
        // Source: Bulbapedia — Custap Berry activates at <=25% HP
        if (active.pokemon.currentHp <= Math.floor(maxHp * 0.25)) {
          activated.add(i);
        }
      }
    }
    return activated;
  }

  // --- Accuracy System ---

  /**
   * Gen 4 accuracy check using the exact pokeemerald/pokeplatinum sAccuracyStageRatios table.
   *
   * The accuracy/evasion stage ratios are identical between Gen 3 and Gen 4.
   *
   * Algorithm (from pokeemerald, same in pokeplatinum):
   *   1. Net stage = accStage + DEFAULT_STAT_STAGE - evaStage (clamped to [-6, +6])
   *   2. calc = sAccuracyStageRatios[buff].dividend * moveAcc / sAccuracyStageRatios[buff].divisor
   *   3. Ability modifiers (Compound Eyes, Sand Veil, Hustle, Snow Cloak)
   *   4. Hold item modifiers (BrightPowder, Lax Incense, Wide Lens, Zoom Lens)
   *   5. Hit if (Random() % 100 + 1) <= calc
   *
   * Gen 4 additions vs Gen 3:
   *   - Snow Cloak: 0.8x accuracy in hail (analogous to Sand Veil in sandstorm)
   *   - Wide Lens: 1.1x accuracy (held item)
   *   - No Guard: all moves always hit (ability)
   *
   * Source: pret/pokeplatinum — same sAccuracyStageRatios table as pokeemerald
   * Source: pret/pokeemerald src/battle_script_commands.c:588 sAccuracyStageRatios
   */
  doesMoveHit(context: AccuracyContext): boolean {
    // Never-miss moves (accuracy === null)
    if (context.move.accuracy === null) return true;

    // No Guard: all moves always hit (both by and against the user)
    // Source: Bulbapedia — No Guard ability
    if (context.attacker.ability === "no-guard" || context.defender.ability === "no-guard") {
      return true;
    }

    // Weather-based accuracy overrides (checked before the normal accuracy formula)
    // Source: Showdown sim/battle-actions.ts — weather accuracy overrides
    // Source: Bulbapedia — Thunder: "100% accuracy in rain, 50% accuracy in sun"
    // Source: Bulbapedia — Blizzard: "100% accuracy in hail" (NEW in Gen 4)
    const weather = context.state.weather?.type ?? null;
    if (context.move.id === "thunder") {
      if (weather === "rain") return true; // Thunder always hits in rain
      if (weather === "sun") {
        // Thunder has 50% accuracy in sun (overrides base 70%)
        return context.rng.int(1, 100) <= 50;
      }
    }
    if (context.move.id === "blizzard" && weather === "hail") {
      // Blizzard always hits in hail (NEW in Gen 4)
      return true;
    }

    const moveAcc = context.move.accuracy;

    // Unaware accuracy/evasion interaction:
    // - If the ATTACKER has Unaware, ignore the defender's evasion stages
    // - If the DEFENDER has Unaware, ignore the attacker's accuracy stages
    // Source: Bulbapedia — Unaware: "Ignores stat stage changes of the opposing Pokemon"
    // Source: Showdown Gen 4 — Unaware in accuracy calculation
    const accStage =
      context.defender.ability === "unaware" ? 0 : context.attacker.statStages.accuracy;
    let evaStage = context.attacker.ability === "unaware" ? 0 : context.defender.statStages.evasion;

    // Tangled Feet (NEW in Gen 4): doubles evasion when confused.
    // Implemented as +2 to evasion stage (capped at +6).
    // Source: Bulbapedia — Tangled Feet: "Raises evasion by one stage (effectively
    //   doubles the evasion modifier) when the Pokemon is confused."
    // Source: Showdown data/abilities.ts — Tangled Feet onModifyAccuracy
    if (
      context.defender.ability === "tangled-feet" &&
      context.defender.volatileStatuses.has("confusion")
    ) {
      evaStage = Math.min(6, evaStage + 2);
    }

    // Net stage calculation: acc - eva, clamped to [-6, +6]
    // Source: pret/pokeplatinum — same as pokeemerald
    const netStage = Math.max(-6, Math.min(6, accStage - evaStage));

    // Apply accuracy stage ratio from the pokeemerald/pokeplatinum table
    const ratio = GEN4_ACCURACY_STAGE_RATIOS[netStage + 6] as {
      dividend: number;
      divisor: number;
    };
    let calc = Math.floor((ratio.dividend * moveAcc) / ratio.divisor);

    // Compound Eyes: 1.3x accuracy
    // Source: pret/pokeplatinum — same as pokeemerald
    if (context.attacker.ability === "compound-eyes") {
      calc = Math.floor((calc * 130) / 100);
    }

    // Sand Veil: 0.8x accuracy in sandstorm
    // Source: pret/pokeplatinum — Sand Veil evasion boost in sandstorm
    if (context.defender.ability === "sand-veil" && weather === "sand") {
      calc = Math.floor((calc * 80) / 100);
    }

    // Snow Cloak: 0.8x accuracy in hail (NEW in Gen 4, analogous to Sand Veil)
    // Source: Bulbapedia — Snow Cloak: evasion +20% in hail
    if (context.defender.ability === "snow-cloak" && weather === "hail") {
      calc = Math.floor((calc * 80) / 100);
    }

    // Hustle: 0.8x accuracy for physical moves
    // Gen 4 uses the per-move category (physical/special split), not type-based
    // Source: pret/pokeplatinum — Hustle accuracy penalty on physical moves
    if (context.attacker.ability === "hustle" && context.move.category === "physical") {
      calc = Math.floor((calc * 80) / 100);
    }

    // Wide Lens: 1.1x accuracy (NEW held item in Gen 4)
    // Source: Bulbapedia — Wide Lens: accuracy * 1.1
    // Source: Showdown sim/items.ts — Wide Lens onSourceModifyAccuracy
    if (context.attacker.pokemon.heldItem === "wide-lens") {
      calc = Math.floor((calc * 110) / 100);
    }

    // Zoom Lens: 1.2x accuracy if attacker moves after the target (NEW in Gen 4)
    // The condition is that the defender has already moved this turn.
    // Source: Bulbapedia — Zoom Lens: "Boosts the accuracy of moves by 20%
    //   if the holder moves after its target."
    // Source: Showdown sim/items.ts — Zoom Lens onSourceModifyAccuracy
    if (context.attacker.pokemon.heldItem === "zoom-lens" && context.defender.movedThisTurn) {
      calc = Math.floor((calc * 120) / 100);
    }

    // BrightPowder / Lax Incense: reduce attacker's accuracy by 10% (defender held items)
    // These are functionally identical — they both reduce the opponent's accuracy by 10%.
    // Source: Bulbapedia — BrightPowder: "Lowers the opposing Pokemon's accuracy by 10%."
    // Source: Bulbapedia — Lax Incense: "Lowers the opposing Pokemon's accuracy by 10%."
    // Source: Showdown sim/items.ts — BrightPowder/Lax Incense onModifyAccuracy
    const defenderItem = context.defender.pokemon.heldItem;
    if (defenderItem === "bright-powder" || defenderItem === "lax-incense") {
      calc = Math.floor((calc * 90) / 100);
    }

    // Gravity: multiply accuracy by 5/3 when gravity is active
    // Source: Showdown Gen 4 mod — Gravity boosts accuracy by 5/3
    // Source: Bulbapedia — Gravity: "The accuracy of all moves is boosted to 5/3 of their
    //   original accuracy during the effect."
    if (context.state.gravity?.active) {
      calc = Math.floor((calc * 5) / 3);
    }

    // Final accuracy check: (Random() % 100 + 1) > calc means miss
    // Source: pret/pokeplatinum — same check as pokeemerald
    // Equivalent: hit if roll <= calc, where roll is 1-100
    return context.rng.int(1, 100) <= calc;
  }

  // --- Switch Restrictions ---

  /**
   * Gen 4 switch restriction check.
   *
   * Trapping abilities and the "trapped" volatile status prevent switching:
   *   - Shadow Tag: traps all non-Shadow-Tag opponents
   *   - Arena Trap: traps grounded opponents (non-Flying, non-Levitate)
   *   - Magnet Pull: traps Steel-type opponents
   *   - "trapped" volatile: Mean Look, Spider Web, Block
   *
   * Ghost-types are immune to trapping moves (Mean Look etc.) starting in Gen 6,
   * but in Gen 4 they are NOT immune — the "trapped" volatile applies to all types.
   *
   * Source: Showdown Gen 4 mod — Shadow Tag, Arena Trap, Magnet Pull trapping logic
   * Source: Bulbapedia — Arena Trap does not affect Flying-types or Levitate holders
   * Source: Bulbapedia — Shadow Tag: all adjacent non-Shadow-Tag opponents are trapped
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
    // Source: Bulbapedia — Shadow Tag traps all adjacent Pokemon without Shadow Tag
    if (oppAbility === "shadow-tag" && pokemon.ability !== "shadow-tag") return false;

    // Arena Trap: traps grounded (non-Flying, non-Levitate) opponents
    // Gravity grounds all Pokemon, so Arena Trap traps everyone under gravity
    // Source: Bulbapedia — Arena Trap does not affect Flying-types or Levitate holders
    // Source: Bulbapedia — Gravity: "All Pokémon are grounded. Arena Trap can trap them."
    if (oppAbility === "arena-trap") {
      const gravityActive = state.gravity?.active ?? false;
      const isGrounded =
        gravityActive || (!pokemon.types.includes("flying") && pokemon.ability !== "levitate");
      if (isGrounded) return false;
    }

    // Magnet Pull: traps Steel-type opponents
    // Source: Bulbapedia — Magnet Pull traps all Steel-type opponents
    if (oppAbility === "magnet-pull" && pokemon.types.includes("steel")) return false;

    return true;
  }

  // --- Switch Out ---

  /**
   * Gen 4 switch-out handler: Natural Cure cures status before clearing volatiles.
   *
   * Source: Bulbapedia — Natural Cure: "All status conditions heal when the
   *   Pokemon switches out."
   * Source: Showdown data/abilities.ts — Natural Cure onSwitchOut
   */
  override onSwitchOut(pokemon: ActivePokemon, state: BattleState): void {
    // Natural Cure: cure status condition on switch-out
    if (pokemon.ability === "natural-cure" && pokemon.pokemon.status !== null) {
      pokemon.pokemon.status = null;
    }
    // Delegate to BaseRuleset for standard volatile clearing
    super.onSwitchOut(pokemon, state);
  }

  // --- Held Items ---

  /**
   * Gen 4 has held items (inherited from Gen 2, modernized in Gen 3).
   */
  hasHeldItems(): boolean {
    return true;
  }

  // --- Ability Triggers ---

  /**
   * Gen 4 ability trigger dispatch.
   *
   * Delegates to applyGen4Ability which handles:
   *   - on-switch-in: Intimidate, Drizzle, Drought, Sand Stream, Snow Warning,
   *                   Download, Anticipation, Forewarn, Frisk, Slow Start
   *   - on-turn-end: Speed Boost, Rain Dish, Ice Body, Dry Skin, Solar Power,
   *                  Hydration, Shed Skin, Bad Dreams, Poison Heal
   *
   * Source: Showdown sim/battle.ts Gen 4 mod
   */
  applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    return applyGen4Ability(trigger, context, this.dataManager);
  }

  // --- Held Item Triggers ---

  /**
   * Gen 4 held item trigger dispatch.
   *
   * Delegates to applyGen4HeldItem which handles:
   *   - end-of-turn: Leftovers, Black Sludge, Toxic Orb, Flame Orb, Sitrus Berry, berries
   *   - on-damage-taken: Focus Sash, Focus Band, Sitrus Berry, Oran Berry
   *   - on-hit: King's Rock, Razor Fang, Shell Bell, Life Orb
   *
   * Source: Showdown sim/battle.ts Gen 4 mod
   */
  applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    return applyGen4HeldItem(trigger, context);
  }

  // --- Weather Effects ---

  /**
   * Gen 4 end-of-turn weather chip damage.
   *
   * Sandstorm: 1/16 max HP to non-Rock/Ground/Steel (same chip rate as Gen 3).
   * Hail: 1/16 max HP to non-Ice (same chip rate as Gen 3).
   * Magic Guard: grants immunity to weather chip (NEW vs Gen 3).
   * Rain/Sun: no chip damage.
   *
   * Source: Showdown sim/battle.ts Gen 4 mod
   */
  applyWeatherEffects(state: BattleState): WeatherEffectResult[] {
    return applyGen4WeatherEffects(state);
  }

  // --- End-of-Turn Order ---

  /**
   * Gen 4 end-of-turn effect processing order.
   *
   * Based on Showdown Gen 4 mod and Bulbapedia (Pokemon Diamond/Pearl/Platinum).
   * Key Gen 4 ordering decisions:
   *   - weather-damage before wish/weather-healing
   *   - weather-healing (Rain Dish, Ice Body, Dry Skin) before leftovers
   *   - shed-skin before leftovers
   *   - poison-heal before status-damage (Poison Heal replaces poison tick)
   *   - bad-dreams after status-damage
   *   - toxic-orb / flame-orb after weather-countdown (late EoT)
   *   - speed-boost and healing-items at end
   *
   * Source: Showdown sim/battle.ts Gen 4 mod — end-of-turn processing order
   * Source: Bulbapedia — Diamond/Pearl/Platinum battle mechanics
   */
  getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return [
      "weather-damage", // Sandstorm/Hail chip
      "future-attack", // Future Sight / Doom Desire
      "wish", // Wish recovery
      "weather-healing", // Rain Dish, Dry Skin rain, Ice Body
      "shed-skin", // Shed Skin 33% cure
      "leftovers", // Leftovers recovery
      "black-sludge", // Black Sludge
      "aqua-ring", // Aqua Ring recovery
      "ingrain", // Ingrain recovery
      "leech-seed", // Leech Seed drain
      "poison-heal", // Poison Heal (before status damage)
      "status-damage", // Poison/Toxic/Burn
      "nightmare", // Nightmare damage
      "curse", // Ghost Curse damage
      "bad-dreams", // Bad Dreams
      "bind", // Trap damage
      "yawn-countdown", // Yawn drowsy → sleep
      "encore-countdown", // Encore timer
      "taunt-countdown", // Taunt timer (3 turns in Gen 4)
      "disable-countdown", // Disable timer (4 turns in Gen 4)
      "heal-block-countdown", // Heal Block (5 turns)
      "embargo-countdown", // Embargo (5 turns)
      "magnet-rise-countdown", // Magnet Rise (5 turns)
      "perish-song", // Perish Song countdown
      "screen-countdown", // Reflect / Light Screen
      "safeguard-countdown", // Safeguard
      "tailwind-countdown", // Tailwind
      "trick-room-countdown", // Trick Room
      "gravity-countdown", // Gravity (Gen 4+)
      "weather-countdown", // Weather timer
      "toxic-orb-activation", // Toxic Orb
      "flame-orb-activation", // Flame Orb
      "slow-start-countdown", // Slow Start
      "speed-boost", // Speed Boost
      "healing-items", // Berry/item consumption
    ] as const;
  }
}

// --- Gen 4 Accuracy Stage Ratios ---

/**
 * Exact accuracy stage ratios from the pokeemerald/pokeplatinum disassembly.
 *
 * Indexed by stage + 6 (stage -6 = index 0, stage +6 = index 12).
 * Identical between Gen 3 and Gen 4.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c:588-603 sAccuracyStageRatios
 * Source: pret/pokeplatinum — same accuracy stage table
 */
const GEN4_ACCURACY_STAGE_RATIOS: ReadonlyArray<{ dividend: number; divisor: number }> = [
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
