import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType } from "@pokemon-lib-ts/core";

/**
 * Gen 6 damage-modifying ability handlers.
 *
 * Carries forward all Gen 5 damage abilities and adds Gen 6 newcomers:
 *   - Tough Claws: 1.3x for contact moves
 *   - Strong Jaw: 1.5x for bite moves
 *   - Mega Launcher: 1.5x for pulse/aura moves
 *   - Fur Coat: 2x effective Defense against physical moves
 *   - Pixilate: Normal moves become Fairy, 1.3x boost
 *   - Aerilate: Normal moves become Flying, 1.3x boost
 *   - Refrigerate: Normal moves become Ice, 1.3x boost
 *   - Parental Bond: moves hit twice (second hit at 50% power)
 *
 * Gen 6 changes from Gen 5:
 *   - Sniper: crit is now 1.5x (Gen 6+), Sniper stacks to 1.5x * 1.5x = 2.25x effective
 *     (vs Gen 5: 2x crit * 1.5x Sniper = 3x). The handler returns activated:true and
 *     the damage calc applies the appropriate multiplier.
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Recoil detection helper (for Reckless) -- carried from Gen 5
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
// Sheer Force secondary effect detection -- carried from Gen 5
// ---------------------------------------------------------------------------

/**
 * Moves whose Sheer Force-eligible secondaries cannot be represented in our
 * MoveEffect union because Showdown stores them as custom `onHit` functions.
 *
 * Source: Showdown data/moves.ts -- triattack: secondary.onHit randomly picks
 *   from burn/paralysis/freeze with 20% chance
 */
const SHEER_FORCE_MOVE_WHITELIST: ReadonlySet<string> = new Set(["tri-attack"]);

/**
 * Check if a move is on the Sheer Force whitelist.
 *
 * Source: Showdown data/moves.ts -- triattack secondary.onHit
 */
export function isSheerForceWhitelistedMove(moveId: string): boolean {
  return SHEER_FORCE_MOVE_WHITELIST.has(moveId);
}

/**
 * Check if a move has secondary effects that Sheer Force would suppress.
 *
 * Source: Showdown data/abilities.ts -- sheerforce
 */
export function hasSheerForceEligibleEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;

  switch (effect.type) {
    case "status-chance":
      return true;
    case "stat-change":
      if (effect.target === "foe" && effect.chance > 0) return true;
      if (effect.target === "self" && effect.fromSecondary === true) return true;
      return false;
    case "volatile-status":
      return effect.chance > 0;
    case "multi":
      return effect.effects.some((e) => hasSheerForceEligibleEffect(e));
    default:
      return false;
  }
}

/**
 * Combined check: is a move eligible for Sheer Force?
 *
 * Source: Showdown data/abilities.ts -- sheerforce
 */
export function isSheerForceEligibleMove(effect: MoveEffect | null, moveId: string): boolean {
  return hasSheerForceEligibleEffect(effect) || isSheerForceWhitelistedMove(moveId);
}

// ---------------------------------------------------------------------------
// Pinch ability type mapping -- carried from Gen 5
// ---------------------------------------------------------------------------

/**
 * Pinch abilities: 1.5x attack stat when HP <= floor(maxHP/3) and move type matches.
 *
 * Source: Showdown data/abilities.ts -- Blaze/Overgrow/Torrent/Swarm onModifyAtk/onModifySpA
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  blaze: "fire",
  overgrow: "grass",
  torrent: "water",
  swarm: "bug",
};

// ---------------------------------------------------------------------------
// Gen 6 bite-move list (for Strong Jaw)
// ---------------------------------------------------------------------------

/**
 * Moves boosted by Strong Jaw (1.5x power).
 * Source: Bulbapedia "Strong Jaw" -- "boosts the power of biting moves by 50%"
 * Source: Showdown data/abilities.ts -- strongjaw: move.flags['bite']
 *
 * Note: We check the bite flag on MoveData.flags rather than a hardcoded list.
 * This is more future-proof and matches how Showdown handles it.
 */

// ---------------------------------------------------------------------------
// Gen 6 pulse-move list (for Mega Launcher)
// ---------------------------------------------------------------------------

/**
 * Moves boosted by Mega Launcher (1.5x power).
 * Source: Bulbapedia "Mega Launcher" -- "boosts the power of pulse and aura moves by 50%"
 * Source: Showdown data/abilities.ts -- megalauncher: move.flags['pulse']
 *
 * Note: We check the pulse flag on MoveData.flags.
 */

// ---------------------------------------------------------------------------
// Shared sentinel
// ---------------------------------------------------------------------------

const NO_ACTIVATION: AbilityResult = {
  activated: false,
  effects: [],
  messages: [],
};

// ---------------------------------------------------------------------------
// Public API: damage-calc abilities
// ---------------------------------------------------------------------------

/**
 * Handle damage-calc ability modifiers for Gen 6.
 *
 * Covers all Gen 5 damage-calc abilities plus new Gen 6 additions:
 *   - Tough Claws, Strong Jaw, Mega Launcher (attacker power boosts)
 *   - Fur Coat (defender physical defense doubling)
 *   - Pixilate, Aerilate, Refrigerate (Normal-type override + 1.3x)
 *   - Parental Bond (second hit at 50% power)
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */
export function handleGen6DamageCalcAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    // ---- Gen 5 carry-forward: Attacker-side abilities ----

    case "sheer-force": {
      // Sheer Force: 1.3x (5325/4096) damage for moves with secondary effects.
      // Source: Showdown data/abilities.ts -- sheerforce onBasePower
      if (!ctx.move) return NO_ACTIVATION;
      if (!isSheerForceEligibleMove(ctx.move.effect, ctx.move.id)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "analytic": {
      // Analytic: 1.3x (5325/4096) damage if the user moves last.
      // Source: Showdown data/abilities.ts -- analytic onBasePower
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
      // Source: Showdown data/abilities.ts -- sandforce onBasePower
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
      // Source: Showdown data/abilities.ts -- technician onBasePower (priority 30)
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
      // Source: Showdown data/abilities.ts -- ironfist: move.flags['punch']
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.punch) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "reckless": {
      // Reckless: 1.2x (4915/4096) power for recoil AND crash-damage moves.
      // Source: Showdown data/abilities.ts -- reckless: move.recoil || move.hasCrashDamage
      if (!ctx.move) return NO_ACTIVATION;
      if (!hasRecoilEffect(ctx.move.effect) && !ctx.move.hasCrashDamage) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "adaptability": {
      // Adaptability: STAB becomes 2x instead of 1.5x.
      // Source: Showdown data/abilities.ts -- adaptability onModifySTAB
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.pokemon.types.includes(ctx.move.type)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "hustle": {
      // Hustle: 1.5x Attack stat for physical moves, 0.8x accuracy.
      // Source: Showdown data/abilities.ts -- hustle onModifyAtk
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
      // Source: Showdown data/abilities.ts -- hugepower / purepower onModifyAtk
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
      // Source: Showdown data/abilities.ts -- guts onModifyAtk
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
      // Pinch abilities: 1.5x when HP <= floor(maxHP/3) and move type matches.
      // Source: Showdown data/abilities.ts -- blaze/overgrow/torrent/swarm
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
      // Sniper: In Gen 6, crits are 1.5x. Sniper adds another 1.5x on top = 2.25x effective.
      // (In Gen 5, crits were 2x, Sniper made them 3x.)
      // The damage calc applies the numeric value; this signals activation.
      // Source: Showdown data/abilities.ts -- sniper onModifyDamage: if crit, chainModify(1.5)
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    case "tinted-lens": {
      // Tinted Lens: "Not very effective" moves deal 2x damage.
      // Source: Showdown data/abilities.ts -- tintedlens onModifyDamage
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [],
      };
    }

    // ---- Gen 6 NEW: Attacker-side abilities ----

    case "tough-claws": {
      // Tough Claws: 1.3x (5325/4096) power for contact moves.
      // Source: Bulbapedia "Tough Claws" Gen 6 -- boosts contact moves by 30%
      // Source: Showdown data/abilities.ts -- toughclaws: move.flags['contact'], chainModify([5325, 4096])
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.contact) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Tough Claws boosted the attack!`],
      };
    }

    case "strong-jaw": {
      // Strong Jaw: 1.5x (6144/4096) power for bite moves.
      // Source: Bulbapedia "Strong Jaw" Gen 6 -- boosts bite moves by 50%
      // Source: Showdown data/abilities.ts -- strongjaw: move.flags['bite'], chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.bite) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Strong Jaw boosted the attack!`],
      };
    }

    case "mega-launcher": {
      // Mega Launcher: 1.5x (6144/4096) power for pulse/aura moves.
      // Source: Bulbapedia "Mega Launcher" Gen 6 -- boosts pulse/aura moves by 50%
      // Source: Showdown data/abilities.ts -- megalauncher: move.flags['pulse'], chainModify(1.5)
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.pulse) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Mega Launcher boosted the attack!`],
      };
    }

    case "pixilate": {
      // Pixilate: Normal moves become Fairy, 1.3x (5325/4096) boost.
      // Source: Bulbapedia "Pixilate" Gen 6 -- Normal to Fairy, 1.3x
      // Source: Showdown data/abilities.ts -- pixilate: onModifyType + onBasePower
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: "type-change",
            target: "self",
            types: ["fairy"],
          },
        ],
        messages: [`${name}'s Pixilate transformed the move into Fairy type!`],
      };
    }

    case "aerilate": {
      // Aerilate: Normal moves become Flying, 1.3x (5325/4096) boost.
      // Source: Bulbapedia "Aerilate" Gen 6 -- Normal to Flying, 1.3x
      // Source: Showdown data/abilities.ts -- aerilate: onModifyType + onBasePower
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: "type-change",
            target: "self",
            types: ["flying"],
          },
        ],
        messages: [`${name}'s Aerilate transformed the move into Flying type!`],
      };
    }

    case "refrigerate": {
      // Refrigerate: Normal moves become Ice, 1.3x (5325/4096) boost.
      // Source: Bulbapedia "Refrigerate" Gen 6 -- Normal to Ice, 1.3x
      // Source: Showdown data/abilities.ts -- refrigerate: onModifyType + onBasePower
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== "normal") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: "type-change",
            target: "self",
            types: ["ice"],
          },
        ],
        messages: [`${name}'s Refrigerate transformed the move into Ice type!`],
      };
    }

    case "parental-bond": {
      // Parental Bond: moves hit twice, second hit at 50% power in Gen 6.
      // Does NOT apply to multi-hit moves, spread moves in doubles, or fixed-damage moves.
      // Source: Bulbapedia "Parental Bond" Gen 6 -- second hit is 50% power
      // Source: Showdown data/abilities.ts -- parentalbond: onModifyMove adds multihit
      //   Second hit: Gen 6 = 0.5x, Gen 7+ = 0.25x
      if (!ctx.move) return NO_ACTIVATION;
      // Skip moves that already hit multiple times (multi-hit effect)
      if (ctx.move.effect?.type === "multi-hit") return NO_ACTIVATION;
      // Skip status moves and moves with no base power
      if (!ctx.move.power || ctx.move.power <= 0) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "none", target: "self" }],
        messages: [`${name}'s Parental Bond lets it attack twice!`],
      };
    }

    // ---- Defender-side abilities ----

    case "multiscale": {
      // Multiscale: 0.5x damage taken when at full HP.
      // Source: Showdown data/abilities.ts -- multiscale onSourceModifyDamage
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
      // Source: Showdown data/abilities.ts -- solidrock / filter onSourceModifyDamage
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "thick-fat": {
      // Thick Fat: 0.5x damage from Fire and Ice type moves.
      // Source: Showdown data/abilities.ts -- thickfat onSourceModifyAtk/onSourceModifySpA
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
      // Source: Showdown data/abilities.ts -- marvelscale onModifyDef
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [],
      };
    }

    case "fur-coat": {
      // Fur Coat: doubles effective Defense against physical moves.
      // Source: Bulbapedia "Fur Coat" Gen 6 -- doubles Defense against physical
      // Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== "physical") return NO_ACTIVATION;
      return {
        activated: true,
        effects: [{ effectType: "damage-reduction", target: "self" }],
        messages: [`${name}'s Fur Coat halved the damage!`],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle damage-immunity and damage-capping ability checks for Gen 6.
 *
 * Sturdy: blocks OHKO moves AND survives any hit from full HP at 1 HP.
 *
 * Source: Showdown data/abilities.ts -- sturdy
 */
export function handleGen6DamageImmunityAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case "sturdy": {
      // Sturdy: Block OHKO moves entirely
      // Source: Showdown data/abilities.ts -- sturdy onTryHit
      if (ctx.move?.effect?.type === "ohko") {
        return {
          activated: true,
          effects: [{ effectType: "damage-reduction", target: "self" }],
          messages: [`${name} held on thanks to Sturdy!`],
          movePrevented: true,
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
 *
 * Source: Showdown data/abilities.ts -- sheerforce onBasePower: chainModify([5325, 4096])
 */
export function getSheerForceMultiplier(
  abilityId: string,
  effect: MoveEffect | null,
  moveId?: string,
): number {
  if (abilityId !== "sheer-force") return 1;
  if (!isSheerForceEligibleMove(effect, moveId ?? "")) return 1;
  return 5325 / 4096;
}

/**
 * Check whether Sheer Force suppresses Life Orb recoil for this move.
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
 */
export function sheerForceSuppressesLifeOrb(
  abilityId: string,
  effect: MoveEffect | null,
  moveId?: string,
): boolean {
  if (abilityId !== "sheer-force") return false;
  return isSheerForceEligibleMove(effect, moveId ?? "");
}

/**
 * Calculate the Multiscale damage multiplier.
 * Returns 0.5 if the defender has Multiscale and is at full HP.
 *
 * Source: Showdown data/abilities.ts -- multiscale onSourceModifyDamage
 */
export function getMultiscaleMultiplier(
  abilityId: string,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== "multiscale") return 1;
  if (currentHp < maxHp) return 1;
  return 0.5;
}

/**
 * Calculate the Sturdy damage cap.
 * If Sturdy holder is at full HP and damage would KO, returns maxHp - 1.
 *
 * Source: Showdown data/abilities.ts -- sturdy onDamage (priority -30)
 */
export function getSturdyDamageCap(
  abilityId: string,
  damage: number,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== "sturdy") return damage;
  if (currentHp !== maxHp) return damage;
  if (damage < currentHp) return damage;
  return maxHp - 1;
}

/**
 * Check if Sturdy blocks an OHKO move entirely.
 *
 * Source: Showdown data/abilities.ts -- sturdy onTryHit
 */
export function sturdyBlocksOHKO(abilityId: string, effect: MoveEffect | null): boolean {
  if (abilityId !== "sturdy") return false;
  if (!effect) return false;
  return effect.type === "ohko";
}

/**
 * Get the Tough Claws multiplier.
 * Returns 5325/4096 (~1.3x) for contact moves.
 *
 * Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, 4096])
 */
export function getToughClawsMultiplier(abilityId: string, isContact: boolean): number {
  if (abilityId !== "tough-claws") return 1;
  if (!isContact) return 1;
  return 5325 / 4096;
}

/**
 * Get the Strong Jaw multiplier.
 * Returns 1.5x for bite moves.
 *
 * Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
 */
export function getStrongJawMultiplier(abilityId: string, isBite: boolean): number {
  if (abilityId !== "strong-jaw") return 1;
  if (!isBite) return 1;
  return 1.5;
}

/**
 * Get the Mega Launcher multiplier.
 * Returns 1.5x for pulse/aura moves.
 *
 * Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
 */
export function getMegaLauncherMultiplier(abilityId: string, isPulse: boolean): number {
  if (abilityId !== "mega-launcher") return 1;
  if (!isPulse) return 1;
  return 1.5;
}

/**
 * Get the -ate ability type override and power multiplier.
 * Pixilate/Aerilate/Refrigerate: change Normal -> X type with 1.3x boost.
 *
 * Source: Showdown data/abilities.ts -- pixilate/aerilate/refrigerate
 *   onModifyType: changes type, onBasePower: chainModify([5325, 4096])
 *
 * @returns { type, multiplier } if the ability activates, or null otherwise
 */
export function getAteAbilityOverride(
  abilityId: string,
  moveType: PokemonType,
): { type: PokemonType; multiplier: number } | null {
  if (moveType !== "normal") return null;

  switch (abilityId) {
    case "pixilate":
      return { type: "fairy", multiplier: 5325 / 4096 };
    case "aerilate":
      return { type: "flying", multiplier: 5325 / 4096 };
    case "refrigerate":
      return { type: "ice", multiplier: 5325 / 4096 };
    default:
      return null;
  }
}

/**
 * Check if Parental Bond activates for a move.
 * Returns true if the move can be doubled (not multi-hit, not status, has power).
 *
 * Source: Showdown data/abilities.ts -- parentalbond onModifyMove
 * Source: Bulbapedia "Parental Bond" -- second hit is 50% in Gen 6, 25% in Gen 7+
 */
export function isParentalBondEligible(
  abilityId: string,
  movePower: number | null,
  moveEffectType: string | null,
): boolean {
  if (abilityId !== "parental-bond") return false;
  if (!movePower || movePower <= 0) return false;
  if (moveEffectType === "multi-hit") return false;
  return true;
}

/**
 * Gen 6 Parental Bond second-hit multiplier: 0.5 (50% of first hit).
 *
 * Source: Bulbapedia "Parental Bond" -- 50% in Gen 6, nerfed to 25% in Gen 7
 * Source: Showdown data/abilities.ts -- Gen 6: secondHit 0.5
 */
export const PARENTAL_BOND_SECOND_HIT_MULTIPLIER = 0.5;

/**
 * Get the Fur Coat defense multiplier.
 * Returns 2.0 against physical moves.
 *
 * Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
 * Source: Bulbapedia "Fur Coat" -- doubles Defense for physical attacks
 */
export function getFurCoatMultiplier(abilityId: string, isPhysical: boolean): number {
  if (abilityId !== "fur-coat") return 1;
  if (!isPhysical) return 1;
  return 2;
}
