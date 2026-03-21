import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType } from "@pokemon-lib-ts/core";

/**
 * Gen 5 damage-modifying ability handlers.
 *
 * Called from Gen5Abilities.ts dispatch based on trigger type.
 * Handles triggers: "on-damage-calc" (modifiers to damage formula),
 * "on-damage-taken" (Sturdy full-HP survival, Multiscale halving).
 *
 * Note on multiplier values: Showdown uses 4096-based integer math for ability
 * modifiers. For damage-calc abilities that return AbilityResult, the caller
 * (damage calc or engine) reads the effect metadata and applies the actual
 * numeric modifier. The AbilityResult signals "this ability activated" and
 * provides messages -- the numeric modifiers are applied inline in
 * Gen5DamageCalc.ts where they already exist (Technician, Iron Fist, etc.)
 * or will be wired in future waves.
 *
 * This file provides the dispatch functions that determine WHETHER an ability
 * activates and what metadata to return. The actual numeric application happens
 * in the damage calc pipeline.
 *
 * Activation pattern note: abilities split into two categories:
 *   - Gated activation: ability checks a specific condition here (e.g., Technician
 *     checks base power <= 60, Analytic checks whether the user moved last). If the
 *     condition is not met, returns NO_ACTIVATION.
 *   - Context-deferred activation: ability always returns activated: true because the
 *     numeric effect depends on context only the damage calculator has. Examples:
 *     Sniper (needs to know if the hit was a crit) and Tinted Lens (needs the computed
 *     type-effectiveness value). These handlers signal "this ability is present and may
 *     apply"; the damage calc applies the actual multiplier when the condition is met.
 *
 * Source: references/pokemon-showdown/data/abilities.ts
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 */

// ---------------------------------------------------------------------------
// Recoil detection helper (for Reckless)
// ---------------------------------------------------------------------------

/**
 * Check if a move has recoil (for Reckless boost).
 *
 * Source: Showdown data/abilities.ts -- Reckless checks for recoil flag
 */
function hasRecoilEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;
  if (effect.type === "recoil") return true;
  if (effect.type === "multi") {
    return effect.effects.some((e) => e.type === "recoil");
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sheer Force secondary effect detection
// ---------------------------------------------------------------------------

/**
 * Check if a move has secondary effects that Sheer Force would suppress.
 *
 * Sheer Force removes "secondary effects" -- status chances, stat-change chances,
 * flinch chances, volatile status chances. It does NOT remove primary effects like
 * recoil, drain, or fixed stat changes with 100% chance that are part of the move's
 * primary effect.
 *
 * In Showdown, Sheer Force checks `move.secondaries` -- which is populated for moves
 * with secondary (chance-based) effects. If a move has `secondaries`, Sheer Force
 * activates.
 *
 * For our data model, we check the move.effect for chance-based secondaries:
 *   - status-chance (e.g., Flamethrower 10% burn)
 *   - stat-change with chance < 100 and target "foe" (e.g., Psychic 10% SpDef drop)
 *   - volatile-status with chance < 100 (e.g., Air Slash 30% flinch)
 *   - multi effects containing any of the above
 *
 * Source: Showdown data/abilities.ts -- Sheer Force onModifyMove checks move.secondaries
 */
export function hasSheerForceEligibleEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;

  switch (effect.type) {
    case "status-chance":
      // Any chance-based status infliction counts
      return true;

    case "stat-change":
      // Stat changes targeting the foe with chance < 100 count as secondaries.
      // Self stat changes (like Close Combat lowering own stats) do NOT count.
      // 100% foe stat drops that are the move's PRIMARY effect (e.g., Charm)
      // also don't count, but those are status-category moves that don't deal damage.
      // Source: Showdown -- Sheer Force only applies to damaging moves with secondaries
      return effect.target === "foe" && effect.chance < 100;

    case "volatile-status":
      // Flinch, confusion, etc. with a chance
      return effect.chance < 100;

    case "multi":
      // Recursively check sub-effects
      return effect.effects.some((e) => hasSheerForceEligibleEffect(e));

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Pinch ability type mapping
// ---------------------------------------------------------------------------

/**
 * Pinch abilities: 1.5x attack stat when HP <= floor(maxHP/3) and move type matches.
 *
 * Source: Showdown data/abilities.ts -- Blaze/Overgrow/Torrent/Swarm onModifyAtk/onModifySpA
 * Source: Bulbapedia -- Blaze, Overgrow, Torrent, Swarm
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  blaze: "fire",
  overgrow: "grass",
  torrent: "water",
  swarm: "bug",
};

// ---------------------------------------------------------------------------
// Shared sentinel for no activation
// ---------------------------------------------------------------------------

const NO_ACTIVATION: AbilityResult = {
  activated: false,
  effects: [],
  messages: [],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle damage-calc ability modifiers for Gen 5.
 *
 * This function determines whether an attacker's or defender's ability modifies
 * the damage calculation, and returns an AbilityResult indicating activation.
 *
 * The caller (damage calc) is responsible for applying the actual numeric modifier.
 * This function returns activation status and messages only.
 *
 * Abilities handled:
 *
 * **Attacker abilities (power/stat modifiers):**
 * - Sheer Force: 1.3x damage for moves with secondary effects; suppresses those effects
 * - Analytic: 1.3x damage if user moves last
 * - Sand Force: 1.3x to Rock/Ground/Steel moves in sandstorm
 * - Technician: 1.5x for moves with base power <= 60
 * - Iron Fist: 1.2x for punching moves
 * - Reckless: 1.2x for recoil moves
 * - Adaptability: STAB is 2x instead of 1.5x (handled in damage calc STAB step)
 * - Hustle: 1.5x Attack for physical moves (handled in attack stat calc)
 * - Huge Power / Pure Power: 2x Attack (handled in attack stat calc)
 * - Guts: 1.5x Attack when statused (handled in attack stat calc)
 * - Blaze/Overgrow/Torrent/Swarm: 1.5x for matching type at <=1/3 HP
 * - Sniper: 3x crit multiplier instead of 2x (handled in crit modifier step)
 * - Tinted Lens: "Not very effective" moves deal 2x damage
 *
 * **Defender abilities (damage reduction):**
 * - Multiscale: 0.5x damage when at full HP
 * - Solid Rock: 0.75x super-effective damage
 * - Filter: 0.75x super-effective damage (identical to Solid Rock)
 * - Thick Fat: 0.5x from Fire and Ice moves
 * - Marvel Scale: 1.5x Defense when statused (handled in defense stat calc)
 *
 * Returns null-equivalent (activated: false) if this ability has no effect on damage calc.
 */
export function handleGen5DamageCalcAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    // ---- Attacker-side abilities ----

    case "sheer-force": {
      // Sheer Force: 1.3x (5325/4096) damage for moves with secondary effects.
      // Suppresses secondary effects. Also suppresses Life Orb recoil.
      // Source: Showdown data/abilities.ts -- sheerforce
      //   onModifyMove: deletes move.secondaries, sets move.hasSheerForce = true
      //   onBasePower: if move.hasSheerForce, chainModify([5325, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      if (!hasSheerForceEligibleEffect(ctx.move.effect)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "analytic": {
      // Analytic: 1.3x (5325/4096) damage if the user moves last.
      // "Last" means all other active Pokemon have already moved this turn.
      // Source: Showdown data/abilities.ts -- analytic
      //   onBasePower: checks if all other active have already moved (this.queue.willMove)
      //
      // In singles, this simplifies to: the opponent has already moved this turn.
      // ctx.opponent?.movedThisTurn tells us if the opponent already acted.
      if (!ctx.opponent) return NO_ACTIVATION;
      if (!ctx.opponent.movedThisTurn) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "sand-force": {
      // Sand Force: 1.3x (5325/4096) to Rock, Ground, Steel moves in sandstorm.
      // Also grants sandstorm immunity (handled separately).
      // Source: Showdown data/abilities.ts -- sandforce
      //   onBasePower: if sandstorm and move type is Rock/Ground/Steel, chainModify([5325, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      const weather = ctx.state.weather?.type ?? null;
      if (weather !== "sand") return NO_ACTIVATION;
      const sandForceTypes: PokemonType[] = ["rock", "ground", "steel"];
      if (!sandForceTypes.includes(ctx.move.type)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "technician": {
      // Technician: 1.5x power for moves with base power <= 60.
      // Source: Showdown data/abilities.ts -- technician (priority 30)
      //   onBasePower: if basePowerAfterMultiplier <= 60, chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.power === null || ctx.move.power > 60) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "iron-fist": {
      // Iron Fist: 1.2x (4915/4096) power for punching moves.
      // Source: Showdown data/abilities.ts -- ironfist
      //   onBasePower: if move.flags['punch'], chainModify([4915, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.punch) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "reckless": {
      // Reckless: 1.2x (4915/4096) power for recoil moves.
      // Source: Showdown data/abilities.ts -- reckless
      //   onBasePower: if move.recoil || move.hasCrashDamage, chainModify([4915, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      if (!hasRecoilEffect(ctx.move.effect)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "adaptability": {
      // Adaptability: STAB becomes 2x instead of 1.5x.
      // The actual STAB calculation is in the damage formula; this signals activation.
      // Source: Showdown data/abilities.ts -- adaptability
      //   onModifySTAB: returns 2 (instead of default 1.5)
      if (!ctx.move) return NO_ACTIVATION;
      // Only activates if the move type matches one of the user's types (STAB)
      if (!ctx.pokemon.types.includes(ctx.move.type)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "hustle": {
      // Hustle: 1.5x Attack stat for physical moves, but 0.8x accuracy.
      // The stat boost is applied in the attack stat calc; this signals activation.
      // Source: Showdown data/abilities.ts -- hustle
      //   onModifyAtk: this.modify(atk, 1.5)
      //   onSourceModifyAccuracy: if physical, chainModify([3277, 4096]) (~0.8x)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "huge-power":
    case "pure-power": {
      // Huge Power / Pure Power: 2x Attack stat.
      // Applied in the attack stat calculation.
      // Source: Showdown data/abilities.ts -- hugepower / purepower
      //   onModifyAtk: chainModify(2)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "guts": {
      // Guts: 1.5x Attack when the user has a primary status condition.
      // Also bypasses burn's attack penalty.
      // Source: Showdown data/abilities.ts -- guts
      //   onModifyAtk: if pokemon.status, chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "blaze":
    case "overgrow":
    case "torrent":
    case "swarm": {
      // Pinch abilities: 1.5x attack stat when HP <= floor(maxHP/3) and move type matches.
      // Source: Showdown data/abilities.ts -- blaze/overgrow/torrent/swarm
      //   onModifyAtk/onModifySpA: if move type matches and HP <= maxHP/3, chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      const pinchType = PINCH_ABILITY_TYPES[abilityId];
      if (!pinchType || ctx.move.type !== pinchType) return NO_ACTIVATION;

      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const threshold = Math.floor(maxHp / 3);
      if (ctx.pokemon.pokemon.currentHp > threshold) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "sniper": {
      // Sniper: 3x crit multiplier instead of 2x.
      // The actual crit multiplier is applied in the damage formula.
      // Source: Showdown data/abilities.ts -- sniper
      //   onModifyDamage: if crit, chainModify(1.5) -- applied on TOP of the 2x crit,
      //   so the effective crit multiplier is 2x * 1.5x = 3x
      // This activation check is informational; the damage calc handles the numeric value.
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "tinted-lens": {
      // Tinted Lens: "Not very effective" moves deal 2x damage (making them neutral).
      // Source: Showdown data/abilities.ts -- tintedlens
      //   onModifyDamage: if typeMod < 0 (not very effective), chainModify(2)
      // The actual doubling is applied in the damage formula after type effectiveness.
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    // ---- Defender-side abilities ----

    case "multiscale": {
      // Multiscale: 0.5x damage taken when at full HP.
      // Source: Showdown data/abilities.ts -- multiscale
      //   onSourceModifyDamage: if target.hp >= target.maxhp, chainModify(0.5)
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHp) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [`${name}'s Multiscale weakened the attack!`],
      };
    }

    case "solid-rock":
    case "filter": {
      // Solid Rock / Filter: 0.75x super-effective damage taken.
      // Source: Showdown data/abilities.ts -- solidrock / filter
      //   onSourceModifyDamage: if typeMod > 0, chainModify(0.75)
      // Activation requires the move to be super effective, which is checked by the caller.
      // We return activated: true unconditionally as a signal; the damage calc checks
      // effectiveness and applies the 0.75x only when SE.
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "thick-fat": {
      // Thick Fat: 0.5x damage from Fire and Ice type moves.
      // Applied by halving the attacker's effective attack stat.
      // Source: Showdown data/abilities.ts -- thickfat
      //   onSourceModifyAtk/onSourceModifySpA: if Fire/Ice, chainModify(0.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "fire" && ctx.move.type !== "ice") return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "marvel-scale": {
      // Marvel Scale: 1.5x Defense when the holder has a primary status condition.
      // Applied in the defense stat calculation.
      // Source: Showdown data/abilities.ts -- marvelscale
      //   onModifyDef: if pokemon.status, chainModify(1.5)
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle damage-immunity and damage-capping ability checks for Gen 5.
 *
 * This covers abilities that prevent damage entirely or cap the damage amount:
 * - Sturdy (Gen 5+): Blocks OHKO moves AND survives any hit from full HP at 1 HP
 *
 * For Sturdy, there are two distinct effects:
 * 1. OHKO move immunity: checked via move.effect.type === "ohko"
 * 2. Focus Sash effect: at full HP, any damage that would KO is reduced to leave 1 HP
 *
 * The "on-damage-taken" trigger is fired by the engine after damage is calculated
 * but before it is applied to HP. ctx.damage contains the calculated damage.
 *
 * Source: Showdown data/abilities.ts -- sturdy
 *   onTryHit: if move.ohko, return null (blocks OHKO)
 *   onDamage(priority -30): if at full HP and damage >= HP, return HP - 1
 */
export function handleGen5DamageImmunityAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case "sturdy": {
      // Sturdy has two effects in Gen 5+:

      // Effect 1: Block OHKO moves entirely
      // Source: Showdown data/abilities.ts -- sturdy onTryHit
      if (ctx.move?.effect?.type === "ohko") {
        return {
          activated: true,
          effects: [{ effectType: "damage-reduction", target: "self" }],
          messages: [`${name} held on thanks to Sturdy!`],
          movePrevented: true,
        };
      }

      // Effect 2: Survive at 1 HP from full HP (Focus Sash effect)
      // Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
      //   if (target.hp === target.maxhp && damage >= target.hp && effect.effectType === 'Move')
      //     return target.hp - 1
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      const currentHp = ctx.pokemon.pokemon.currentHp;
      const damage = ctx.damage ?? 0;

      if (currentHp >= maxHp && damage >= currentHp) {
        return {
          activated: true,
          effects: [{ effectType: "damage-reduction", target: "self" }],
          messages: [`${name} hung on thanks to Sturdy!`],
        };
      }

      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// Pure utility functions for direct use by the damage calc
// ---------------------------------------------------------------------------

/**
 * Calculate the Sheer Force damage multiplier for a move.
 * Returns 5325/4096 (~1.3x) if Sheer Force is active AND the move has secondary effects.
 * Returns 1.0 otherwise.
 *
 * This is a pure utility function for the damage calc to call directly.
 *
 * Source: Showdown data/abilities.ts -- sheerforce onBasePower
 *   chainModify([5325, 4096])
 */
export function getSheerForceMultiplier(abilityId: string, effect: MoveEffect | null): number {
  if (abilityId !== "sheer-force") return 1;
  if (!hasSheerForceEligibleEffect(effect)) return 1;
  // Source: Showdown data/abilities.ts -- Sheer Force: 5325/4096 = ~1.3x
  return 5325 / 4096;
}

/**
 * Check whether Sheer Force suppresses Life Orb recoil for this move.
 * When Sheer Force activates, Life Orb's 10% recoil is suppressed.
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce && source.hasAbility('sheerforce'),
 *   skip Life Orb recoil
 */
export function sheerForceSuppressesLifeOrb(abilityId: string, effect: MoveEffect | null): boolean {
  if (abilityId !== "sheer-force") return false;
  return hasSheerForceEligibleEffect(effect);
}

/**
 * Calculate the Analytic damage multiplier.
 * Returns 5325/4096 (~1.3x) if the user has Analytic and moves last.
 * Returns 1.0 otherwise.
 *
 * Source: Showdown data/abilities.ts -- analytic onBasePower
 *   chainModify([5325, 4096])
 */
export function getAnalyticMultiplier(abilityId: string, opponentMovedThisTurn: boolean): number {
  if (abilityId !== "analytic") return 1;
  if (!opponentMovedThisTurn) return 1;
  // Source: Showdown data/abilities.ts -- Analytic: 5325/4096 = ~1.3x
  return 5325 / 4096;
}

/**
 * Calculate the Sand Force damage multiplier.
 * Returns 5325/4096 (~1.3x) for Rock/Ground/Steel moves in sandstorm.
 * Returns 1.0 otherwise.
 *
 * Source: Showdown data/abilities.ts -- sandforce onBasePower
 *   chainModify([5325, 4096])
 */
export function getSandForceMultiplier(
  abilityId: string,
  moveType: PokemonType,
  weather: string | null,
): number {
  if (abilityId !== "sand-force") return 1;
  if (weather !== "sand") return 1;
  const boostedTypes: PokemonType[] = ["rock", "ground", "steel"];
  if (!boostedTypes.includes(moveType)) return 1;
  // Source: Showdown data/abilities.ts -- Sand Force: 5325/4096 = ~1.3x
  return 5325 / 4096;
}

/**
 * Calculate the Multiscale damage multiplier.
 * Returns 0.5 if the defender has Multiscale and is at full HP.
 * Returns 1.0 otherwise.
 *
 * Source: Showdown data/abilities.ts -- multiscale onSourceModifyDamage
 *   if target.hp >= target.maxhp, chainModify(0.5)
 */
export function getMultiscaleMultiplier(
  abilityId: string,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== "multiscale") return 1;
  if (currentHp < maxHp) return 1;
  // Source: Showdown data/abilities.ts -- Multiscale: 0.5x at full HP
  return 0.5;
}

/**
 * Calculate the Sturdy damage cap.
 * If Sturdy holder is at full HP and damage would KO, returns maxHp - 1.
 * Otherwise returns the original damage unchanged.
 *
 * Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
 *   if (target.hp === target.maxhp && damage >= target.hp) return target.hp - 1
 */
export function getSturdyDamageCap(
  abilityId: string,
  damage: number,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== "sturdy") return damage;
  if (currentHp < maxHp) return damage;
  if (damage < currentHp) return damage;
  // Source: Showdown data/abilities.ts -- Sturdy: survive at 1 HP
  return maxHp - 1;
}

/**
 * Check if Sturdy blocks an OHKO move entirely.
 *
 * Source: Showdown data/abilities.ts -- sturdy onTryHit
 *   if (move.ohko) return null (immune)
 */
export function sturdyBlocksOHKO(abilityId: string, effect: MoveEffect | null): boolean {
  if (abilityId !== "sturdy") return false;
  if (!effect) return false;
  return effect.type === "ohko";
}
