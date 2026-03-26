import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  CORE_MOVE_EFFECT_TARGETS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  type MoveEffect,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { GEN5_ABILITY_IDS, GEN5_MOVE_IDS } from "./data/reference-ids";

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
 * Activation pattern: all abilities use gated activation — they check a specific
 * condition here and return NO_ACTIVATION if the condition is not met. Examples:
 *   - Technician checks base power <= 60
 *   - Sniper checks ctx.isCrit
 *   - Tinted Lens checks ctx.typeEffectiveness < 1
 *   - Solid Rock / Filter checks ctx.typeEffectiveness > 1
 * The damage calc passes isCrit and typeEffectiveness via AbilityContext so that
 * these handlers can gate properly.
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
 * Moves whose Sheer Force-eligible secondaries cannot be represented in our
 * MoveEffect union because Showdown stores them as custom `onHit` functions.
 * These moves must be whitelisted explicitly so Sheer Force activates for them.
 *
 * Source: Showdown data/moves.ts -- triattack: secondary.onHit randomly picks
 *   from burn/paralysis/freeze with 20% chance
 * Source: Showdown data/abilities.ts -- sheerforce activates when move.secondaries
 *   exists (triattack has secondaries with chance: 20)
 */
const SHEER_FORCE_MOVE_WHITELIST: ReadonlySet<string> = new Set([
  GEN5_MOVE_IDS.triAttack, // 20% burn/paralysis/freeze; custom onHit in Showdown, effect=null in our data
]);

/**
 * Check if a move is on the Sheer Force whitelist -- i.e., it has a
 * Sheer Force-eligible secondary that our MoveEffect union cannot represent.
 *
 * Source: Showdown data/moves.ts -- triattack secondary.onHit
 */
export function isSheerForceWhitelistedMove(moveId: string): boolean {
  return SHEER_FORCE_MOVE_WHITELIST.has(moveId);
}

/**
 * Check if a move has secondary effects that Sheer Force would suppress.
 *
 * Sheer Force suppresses any effect in Showdown's `move.secondary`/`move.secondaries`
 * field, regardless of chance value. This includes guaranteed (chance=100) secondary
 * effects like Acid Spray's SpDef drop, Fake Out's flinch, and Dynamic Punch's confusion.
 *
 * Key distinction: Showdown uses two separate fields for self-effects:
 *   - `secondary: { self: { boosts } }` — part of the secondary; SUPPRESSED by Sheer Force
 *     (e.g., Flame Charge Speed boost)
 *   - `self: { boosts }` with `secondary: null` — primary self-effect; NOT suppressed
 *     (e.g., Close Combat, Draco Meteor, Superpower, Hammer Arm)
 *
 * Source: Showdown data/abilities.ts -- sheerforce:
 *   if (move.secondaries) { delete move.secondaries; delete move.self; ... }
 * Source: Showdown data/moves.ts -- secondary vs self field placement
 *
 * The `fromSecondary` field on StatChangeEffect distinguishes these: effects from
 * secondary.self.boosts have `fromSecondary: true`, while primary self-effects do not.
 *
 * NOTE: This function only inspects the MoveEffect structure. Moves whose secondaries
 * are stored as custom onHit functions in Showdown (e.g., Tri Attack) will have
 * effect=null and return false here. Use `isSheerForceEligibleMove()` to combine
 * both the effect-based check and the whitelist check.
 */
export function hasSheerForceEligibleEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;

  switch (effect.type) {
    case "status-chance":
      // Any chance-based status infliction counts (e.g., Flamethrower 10% burn)
      return true;

    case "stat-change":
      // Foe-targeted stat changes are always eligible (Acid Spray, Bulldoze, etc.)
      if (effect.target === "foe" && effect.chance > 0) return true;
      // Self-targeted stat changes are eligible ONLY when they come from secondary.self
      // (e.g., Flame Charge Speed boost). Primary self-effects (Close Combat Def/SpDef drop,
      // Draco Meteor SpAtk drop) are NOT eligible.
      // Source: Showdown data/abilities.ts -- sheerforce: delete move.secondaries; delete move.self
      //   (move.self is only deleted when move.secondaries exists -- i.e., secondary.self)
      if (effect.target === CORE_MOVE_EFFECT_TARGETS.self && effect.fromSecondary === true)
        return true;
      return false;

    case "volatile-status":
      // Volatile-status secondaries include guaranteed (chance=100) effects:
      //   - Fake Out (flinch, chance 100)
      //   - Dynamic Punch (confusion, chance 100)
      //   - Air Slash (flinch, chance 30)
      // Source: Showdown data/moves.ts — fakeout, dynamicpunch use `secondary` field
      return effect.chance > 0;

    case "multi":
      // Recursively check sub-effects
      return effect.effects.some((e) => hasSheerForceEligibleEffect(e));

    default:
      return false;
  }
}

/**
 * Combined check: is a move eligible for Sheer Force based on either its
 * MoveEffect structure OR the move-ID whitelist?
 *
 * Use this instead of `hasSheerForceEligibleEffect()` alone whenever a move ID
 * is available, to catch moves like Tri Attack whose secondaries are not
 * representable in our MoveEffect union.
 *
 * Source: Showdown data/abilities.ts -- sheerforce: onModifyMove deletes
 *   move.secondaries; onBasePower checks move.hasSheerForce
 */
export function isSheerForceEligibleMove(effect: MoveEffect | null, moveId: string): boolean {
  return hasSheerForceEligibleEffect(effect) || isSheerForceWhitelistedMove(moveId);
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
  [GEN5_ABILITY_IDS.blaze]: CORE_TYPE_IDS.fire,
  [GEN5_ABILITY_IDS.overgrow]: CORE_TYPE_IDS.grass,
  [GEN5_ABILITY_IDS.torrent]: CORE_TYPE_IDS.water,
  [GEN5_ABILITY_IDS.swarm]: CORE_TYPE_IDS.bug,
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

    case GEN5_ABILITY_IDS.sheerForce: {
      // Sheer Force: 1.3x (5325/4096) damage for moves with secondary effects.
      // Suppresses secondary effects. Also suppresses Life Orb recoil.
      // Source: Showdown data/abilities.ts -- sheerforce
      //   onModifyMove: deletes move.secondaries, sets move.hasSheerForce = true
      //   onBasePower: if move.hasSheerForce, chainModify([5325, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      if (!isSheerForceEligibleMove(ctx.move.effect, ctx.move.id)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.analytic: {
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
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.sandForce: {
      // Sand Force: 1.3x (5325/4096) to Rock, Ground, Steel moves in sandstorm.
      // Also grants sandstorm immunity (handled separately).
      // Source: Showdown data/abilities.ts -- sandforce
      //   onBasePower: if sandstorm and move type is Rock/Ground/Steel, chainModify([5325, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      const weather = ctx.state.weather?.type ?? null;
      if (weather !== CORE_WEATHER_IDS.sand) return NO_ACTIVATION;
      const sandForceTypes: PokemonType[] = [
        CORE_TYPE_IDS.rock,
        CORE_TYPE_IDS.ground,
        CORE_TYPE_IDS.steel,
      ];
      if (!sandForceTypes.includes(ctx.move.type)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.technician: {
      // Technician: 1.5x power for moves with base power <= 60.
      // Source: Showdown data/abilities.ts -- technician (priority 30)
      //   onBasePower: if basePowerAfterMultiplier <= 60, chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.power === null || ctx.move.power > 60) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.ironFist: {
      // Iron Fist: 1.2x (4915/4096) power for punching moves.
      // Source: Showdown data/abilities.ts -- ironfist
      //   onBasePower: if move.flags['punch'], chainModify([4915, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.punch) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.reckless: {
      // Reckless: 1.2x (4915/4096) power for recoil AND crash-damage moves.
      // Source: Showdown data/abilities.ts -- reckless
      //   onBasePower: if move.recoil || move.hasCrashDamage, chainModify([4915, 4096])
      // Crash damage moves (e.g., Jump Kick, High Jump Kick) deal self-damage on failure
      // and are boosted identically to recoil moves.
      if (!ctx.move) return NO_ACTIVATION;
      if (!hasRecoilEffect(ctx.move.effect) && !ctx.move.hasCrashDamage) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.adaptability: {
      // Adaptability: STAB becomes 2x instead of 1.5x.
      // The actual STAB calculation is in the damage formula; this signals activation.
      // Source: Showdown data/abilities.ts -- adaptability
      //   onModifySTAB: returns 2 (instead of default 1.5)
      if (!ctx.move) return NO_ACTIVATION;
      // Only activates if the move type matches one of the user's types (STAB)
      if (!ctx.pokemon.types.includes(ctx.move.type)) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.hustle: {
      // Hustle: 1.5x Attack stat for physical moves, but 0.8x accuracy.
      // The stat boost is applied in the attack stat calc; this signals activation.
      // Source: Showdown data/abilities.ts -- hustle
      //   onModifyAtk: this.modify(atk, 1.5)
      //   onSourceModifyAccuracy: if physical, chainModify([3277, 4096]) (~0.8x)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.hugePower:
    case GEN5_ABILITY_IDS.purePower: {
      // Huge Power / Pure Power: 2x Attack stat.
      // Applied in the attack stat calculation.
      // Source: Showdown data/abilities.ts -- hugepower / purepower
      //   onModifyAtk: chainModify(2)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.guts: {
      // Guts: 1.5x Attack when the user has a primary status condition.
      // Also bypasses burn's attack penalty.
      // Source: Showdown data/abilities.ts -- guts
      //   onModifyAtk: if pokemon.status, chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.blaze:
    case GEN5_ABILITY_IDS.overgrow:
    case GEN5_ABILITY_IDS.torrent:
    case GEN5_ABILITY_IDS.swarm: {
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
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.sniper: {
      // Sniper: 3x crit multiplier instead of 2x.
      // Source: Showdown data/abilities.ts -- sniper
      //   onModifyDamage: if crit, chainModify(1.5) -- applied on TOP of the 2x crit,
      //   so the effective crit multiplier is 2x * 1.5x = 3x
      // Only activates when the hit is actually a crit.
      if (!ctx.isCrit) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.tintedLens: {
      // Tinted Lens: "Not very effective" moves deal 2x damage (making them neutral).
      // Source: Showdown data/abilities.ts -- tintedlens
      //   onModifyDamage: if typeMod < 0 (not very effective), chainModify(2)
      // Only activates when the move is not very effective (typeEffectiveness < 1).
      if (ctx.typeEffectiveness === undefined || ctx.typeEffectiveness >= 1) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    // ---- Defender-side abilities ----

    case GEN5_ABILITY_IDS.multiscale: {
      // Multiscale: 0.5x damage taken when at full HP.
      // Source: Showdown data/abilities.ts -- multiscale
      //   onSourceModifyDamage: if target.hp >= target.maxhp, chainModify(0.5)
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHp) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s Multiscale weakened the attack!`],
      };
    }

    case GEN5_ABILITY_IDS.solidRock:
    case GEN5_ABILITY_IDS.filter: {
      // Solid Rock / Filter: 0.75x super-effective damage taken.
      // Source: Showdown data/abilities.ts -- solidrock / filter
      //   onSourceModifyDamage: if typeMod > 0, chainModify(0.75)
      // Only activates when the move is super effective (typeEffectiveness > 1).
      if (ctx.typeEffectiveness === undefined || ctx.typeEffectiveness <= 1) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.thickFat: {
      // Thick Fat: 0.5x damage from Fire and Ice type moves.
      // Applied by halving the attacker's effective attack stat.
      // Source: Showdown data/abilities.ts -- thickfat
      //   onSourceModifyAtk/onSourceModifySpA: if Fire/Ice, chainModify(0.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.fire && ctx.move.type !== CORE_TYPE_IDS.ice) {
        return NO_ACTIVATION;
      }

      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [],
      };
    }

    case GEN5_ABILITY_IDS.marvelScale: {
      // Marvel Scale: 1.5x Defense when the holder has a primary status condition.
      // Applied in the defense stat calculation.
      // Source: Showdown data/abilities.ts -- marvelscale
      //   onModifyDef: if pokemon.status, chainModify(1.5)
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;

      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
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
 * 1. OHKO move immunity: checked via move.effect.type === "ohko" — handled here
 *    (via "on-damage-calc" trigger before damage is applied)
 * 2. Survive at 1 HP from full HP: handled by Gen5Ruleset.capLethalDamage()
 *    via the engine's pre-damage hook (capLethalDamage fires before HP subtraction).
 *
 * Source: Showdown data/abilities.ts -- sturdy
 *   onTryHit: if move.ohko, return null (blocks OHKO)
 *   onDamage(priority -30): if at full HP and damage >= HP, return HP - 1
 */
export function handleGen5DamageImmunityAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case GEN5_ABILITY_IDS.sturdy: {
      // Effect 1: Block OHKO moves entirely
      // Source: Showdown data/abilities.ts -- sturdy onTryHit
      if (ctx.move?.effect?.type === "ohko") {
        return {
          activated: true,
          effects: [
            {
              effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
              target: BATTLE_EFFECT_TARGETS.self,
            },
          ],
          messages: [`${name} held on thanks to Sturdy!`],
          movePrevented: true,
        };
      }

      // Effect 2 (survive at 1 HP from full HP) is now handled by
      // Gen5Ruleset.capLethalDamage() via the engine's pre-damage hook.
      // See BattleEngine.ts — capLethalDamage fires before HP subtraction.
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
 * @param moveId - Optional move ID for whitelist check (e.g., "tri-attack" has an
 *   onHit secondary that our MoveEffect union cannot represent)
 *
 * Source: Showdown data/abilities.ts -- sheerforce onBasePower
 *   chainModify([5325, 4096])
 */
export function getSheerForceMultiplier(
  abilityId: string,
  effect: MoveEffect | null,
  moveId?: string,
): number {
  if (abilityId !== GEN5_ABILITY_IDS.sheerForce) return 1;
  if (!isSheerForceEligibleMove(effect, moveId ?? "")) return 1;
  // Source: Showdown data/abilities.ts -- Sheer Force: 5325/4096 = ~1.3x
  return 5325 / 4096;
}

/**
 * Check whether Sheer Force suppresses Life Orb recoil for this move.
 * When Sheer Force activates, Life Orb's 10% recoil is suppressed.
 *
 * @param moveId - Optional move ID for whitelist check (e.g., "tri-attack")
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce && source.hasAbility('sheerforce'),
 *   skip Life Orb recoil
 */
export function sheerForceSuppressesLifeOrb(
  abilityId: string,
  effect: MoveEffect | null,
  moveId?: string,
): boolean {
  if (abilityId !== GEN5_ABILITY_IDS.sheerForce) return false;
  return isSheerForceEligibleMove(effect, moveId ?? "");
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
  if (abilityId !== GEN5_ABILITY_IDS.analytic) return 1;
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
  if (abilityId !== GEN5_ABILITY_IDS.sandForce) return 1;
  if (weather !== CORE_WEATHER_IDS.sand) return 1;
  const boostedTypes: PokemonType[] = [
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.steel,
  ];
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
  if (abilityId !== GEN5_ABILITY_IDS.multiscale) return 1;
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
  if (abilityId !== GEN5_ABILITY_IDS.sturdy) return damage;
  // Strict equality matches Showdown: `target.hp === target.maxhp`
  // Using >= would incorrectly trigger if currentHp ever exceeded maxHp due to a bug.
  // Source: Showdown data/abilities.ts -- sturdy onDamage:
  //   if (target.hp === target.maxhp && damage >= target.hp) return target.hp - 1
  if (currentHp !== maxHp) return damage;
  if (damage < currentHp) return damage;
  return maxHp - 1;
}

/**
 * Check if Sturdy blocks an OHKO move entirely.
 *
 * Source: Showdown data/abilities.ts -- sturdy onTryHit
 *   if (move.ohko) return null (immune)
 */
export function sturdyBlocksOHKO(abilityId: string, effect: MoveEffect | null): boolean {
  if (abilityId !== GEN5_ABILITY_IDS.sturdy) return false;
  if (!effect) return false;
  return effect.type === "ohko";
}
