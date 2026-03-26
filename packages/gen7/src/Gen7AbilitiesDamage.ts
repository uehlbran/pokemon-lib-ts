import {
  type AbilityContext,
  type AbilityResult,
  BATTLE_ABILITY_EFFECT_TYPES,
  BATTLE_EFFECT_TARGETS,
} from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  type MoveEffect,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { GEN7_ABILITY_IDS, GEN7_MOVE_IDS } from "./data/reference-ids.js";

/**
 * Gen 7 damage-modifying ability handlers.
 *
 * Carries forward all Gen 6 damage abilities and applies Gen 7 changes:
 *   - Pixilate/Aerilate/Refrigerate: nerfed from 1.3x to 1.2x
 *   - Galvanize (new): Normal -> Electric + 1.2x
 *   - Parental Bond second hit: 0.25x (was 0.5x in Gen 6)
 *   - Prism Armor (new): 0.75x super-effective damage (like Solid Rock/Filter,
 *     but cannot be ignored by Mold Breaker)
 *   - Shadow Shield (new): 0.5x damage at full HP (like Multiscale)
 *
 * All numerical damage effects are handled directly in Gen7DamageCalc.ts.
 * These handler functions return activation signals so the engine can emit
 * appropriate messages and track ability usage.
 *
 * Source: Showdown data/abilities.ts -- Gen 7 ability handlers
 * Source: Showdown data/mods/gen7/abilities.ts -- Gen 7 overrides
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Recoil detection helper (for Reckless) -- carried from Gen 5/6
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
// Sheer Force secondary effect detection -- carried from Gen 5/6
// ---------------------------------------------------------------------------

const MOVE_IDS = GEN7_MOVE_IDS;

/**
 * Moves whose Sheer Force-eligible secondaries cannot be represented in our
 * MoveEffect union because Showdown stores them as custom `onHit` functions.
 *
 * Source: Showdown data/moves.ts -- triattack: secondary.onHit randomly picks
 *   from burn/paralysis/freeze with 20% chance
 */
const SHEER_FORCE_MOVE_WHITELIST: ReadonlySet<string> = new Set([
  MOVE_IDS.triAttack,
  MOVE_IDS.secretPower,
  MOVE_IDS.relicSong,
]);

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
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_MOVE_WHITELIST.has(moveId);
}

// ---------------------------------------------------------------------------
// Pinch ability type mapping -- carried from Gen 5/6
// ---------------------------------------------------------------------------

/**
 * Pinch abilities: 1.5x attack stat when HP <= floor(maxHP/3) and move type matches.
 *
 * Source: Showdown data/abilities.ts -- Blaze/Overgrow/Torrent/Swarm onModifyAtk/onModifySpA
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  [CORE_ABILITY_IDS.blaze]: CORE_TYPE_IDS.fire,
  [CORE_ABILITY_IDS.overgrow]: CORE_TYPE_IDS.grass,
  [CORE_ABILITY_IDS.torrent]: CORE_TYPE_IDS.water,
  [CORE_ABILITY_IDS.swarm]: CORE_TYPE_IDS.bug,
};

// ---------------------------------------------------------------------------
// Shared sentinel
// ---------------------------------------------------------------------------

const NO_ACTIVATION: AbilityResult = {
  activated: false,
  effects: [],
  messages: [],
};

const ABILITY_IDS = GEN7_ABILITY_IDS;

// ---------------------------------------------------------------------------
// Public API: damage-calc abilities
// ---------------------------------------------------------------------------

/**
 * Handle damage-calc ability modifiers for Gen 7.
 *
 * Covers all Gen 6 damage-calc abilities plus Gen 7 changes:
 *   - Pixilate/Aerilate/Refrigerate: 1.2x (was 1.3x in Gen 6)
 *   - Galvanize (new): Normal -> Electric + 1.2x
 *   - Parental Bond second hit: 0.25x (was 0.5x in Gen 6)
 *   - Prism Armor (new): 0.75x SE damage (ignores Mold Breaker)
 *   - Shadow Shield (new): 0.5x at full HP
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen7/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */
export function handleGen7DamageCalcAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    // ---- Attacker-side abilities ----

    case ABILITY_IDS.sheerForce: {
      // Sheer Force: 1.3x (5325/4096) damage for moves with secondary effects.
      // Suppresses Life Orb recoil for affected moves.
      // Source: Showdown data/abilities.ts -- sheerforce onBasePower
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

    case ABILITY_IDS.analytic: {
      // Analytic: 1.3x (5325/4096) damage if the user moves last.
      // Source: Showdown data/abilities.ts -- analytic onBasePower
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

    case ABILITY_IDS.sandForce: {
      // Sand Force: 1.3x (5325/4096) to Rock, Ground, Steel moves in sandstorm.
      // Source: Showdown data/abilities.ts -- sandforce onBasePower
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

    case ABILITY_IDS.technician: {
      // Technician: 1.5x power for moves with base power <= 60.
      // Source: Showdown data/abilities.ts -- technician onBasePower (priority 30)
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

    case ABILITY_IDS.ironFist: {
      // Iron Fist: 1.2x (4915/4096) power for punching moves.
      // Source: Showdown data/abilities.ts -- ironfist: move.flags['punch']
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

    case ABILITY_IDS.reckless: {
      // Reckless: 1.2x (4915/4096) power for recoil AND crash-damage moves.
      // Source: Showdown data/abilities.ts -- reckless: move.recoil || move.hasCrashDamage
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

    case ABILITY_IDS.adaptability: {
      // Adaptability: STAB becomes 2x instead of 1.5x.
      // Source: Showdown data/abilities.ts -- adaptability onModifySTAB
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.pokemon.types.includes(ctx.move.type)) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case ABILITY_IDS.hustle: {
      // Hustle: 1.5x Attack stat for physical moves, 0.8x accuracy.
      // Source: Showdown data/abilities.ts -- hustle onModifyAtk
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== CORE_MOVE_CATEGORIES.physical) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case ABILITY_IDS.hugePower:
    case ABILITY_IDS.purePower: {
      // Huge Power / Pure Power: 2x Attack stat.
      // Source: Showdown data/abilities.ts -- hugepower / purepower onModifyAtk
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== CORE_MOVE_CATEGORIES.physical) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case ABILITY_IDS.guts: {
      // Guts: 1.5x Attack when the user has a primary status condition.
      // Source: Showdown data/abilities.ts -- guts onModifyAtk
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== CORE_MOVE_CATEGORIES.physical) return NO_ACTIVATION;
      if (ctx.pokemon.pokemon.status === null) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case ABILITY_IDS.blaze:
    case ABILITY_IDS.overgrow:
    case ABILITY_IDS.torrent:
    case ABILITY_IDS.swarm: {
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
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case ABILITY_IDS.sniper: {
      // Sniper: In Gen 6+, crits are 1.5x. Sniper adds another 1.5x on top = 2.25x effective.
      // The damage calc applies the numeric value; this signals activation.
      // Source: Showdown data/abilities.ts -- sniper onModifyDamage: if crit, chainModify(1.5)
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case ABILITY_IDS.tintedLens: {
      // Tinted Lens: "Not very effective" moves deal 2x damage.
      // Source: Showdown data/abilities.ts -- tintedlens onModifyDamage
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    // ---- Gen 6 carry-forward: Attacker-side ----

    case ABILITY_IDS.toughClaws: {
      // Tough Claws: 1.3x (5325/4096) power for contact moves.
      // Source: Bulbapedia "Tough Claws" -- boosts contact moves by 30%
      // Source: Showdown data/abilities.ts -- toughclaws: move.flags['contact']
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.contact) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Tough Claws boosted the attack!`],
      };
    }

    case ABILITY_IDS.strongJaw: {
      // Strong Jaw: 1.5x (6144/4096) power for bite moves.
      // Source: Bulbapedia "Strong Jaw" -- boosts bite moves by 50%
      // Source: Showdown data/abilities.ts -- strongjaw: move.flags['bite']
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.bite) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Strong Jaw boosted the attack!`],
      };
    }

    case ABILITY_IDS.megaLauncher: {
      // Mega Launcher: 1.5x (6144/4096) power for pulse/aura moves.
      // Source: Bulbapedia "Mega Launcher" -- boosts pulse/aura moves by 50%
      // Source: Showdown data/abilities.ts -- megalauncher: move.flags['pulse']
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.pulse) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Mega Launcher boosted the attack!`],
      };
    }

    // ---- -ate abilities (Gen 7: 1.2x, was 1.3x in Gen 6) ----

    case ABILITY_IDS.pixilate: {
      // Pixilate: Normal moves become Fairy, 1.2x (4915/4096) boost in Gen 7.
      // Source: Showdown data/abilities.ts -- Gen 7 pixilate: chainModify([4915, 4096])
      // Source: Bulbapedia "Pixilate" -- "nerfed from 1.3x to 1.2x in Gen 7"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.normal) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
            target: BATTLE_EFFECT_TARGETS.self,
            types: [CORE_TYPE_IDS.fairy],
          },
        ],
        messages: [`${name}'s Pixilate transformed the move into Fairy type!`],
      };
    }

    case ABILITY_IDS.aerilate: {
      // Aerilate: Normal moves become Flying, 1.2x (4915/4096) boost in Gen 7.
      // Source: Showdown data/abilities.ts -- Gen 7 aerilate: chainModify([4915, 4096])
      // Source: Bulbapedia "Aerilate" -- "nerfed from 1.3x to 1.2x in Gen 7"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.normal) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
            target: BATTLE_EFFECT_TARGETS.self,
            types: [CORE_TYPE_IDS.flying],
          },
        ],
        messages: [`${name}'s Aerilate transformed the move into Flying type!`],
      };
    }

    case ABILITY_IDS.refrigerate: {
      // Refrigerate: Normal moves become Ice, 1.2x (4915/4096) boost in Gen 7.
      // Source: Showdown data/abilities.ts -- Gen 7 refrigerate: chainModify([4915, 4096])
      // Source: Bulbapedia "Refrigerate" -- "nerfed from 1.3x to 1.2x in Gen 7"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.normal) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
            target: BATTLE_EFFECT_TARGETS.self,
            types: [CORE_TYPE_IDS.ice],
          },
        ],
        messages: [`${name}'s Refrigerate transformed the move into Ice type!`],
      };
    }

    case ABILITY_IDS.galvanize: {
      // Galvanize (new in Gen 7): Normal moves become Electric, 1.2x (4915/4096) boost.
      // Source: Showdown data/abilities.ts -- galvanize: onModifyType + onBasePower
      // Source: Bulbapedia "Galvanize" -- introduced in Gen 7
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.normal) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.typeChange,
            target: BATTLE_EFFECT_TARGETS.self,
            types: [CORE_TYPE_IDS.electric],
          },
        ],
        messages: [`${name}'s Galvanize transformed the move into Electric type!`],
      };
    }

    case ABILITY_IDS.parentalBond: {
      // Parental Bond: moves hit twice, second hit at 25% power in Gen 7.
      // (Was 50% in Gen 6.)
      // Source: Showdown data/abilities.ts -- parentalbond: Gen 7 secondHit 0.25
      // Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Gen 7"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.effect?.type === "multi-hit") return NO_ACTIVATION;
      if (!ctx.move.power || ctx.move.power <= 0) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Parental Bond lets it attack twice!`],
      };
    }

    // ---- Defender-side abilities ----

    case ABILITY_IDS.multiscale:
    case ABILITY_IDS.shadowShield: {
      // Multiscale / Shadow Shield: 0.5x damage taken when at full HP.
      // Shadow Shield is new in Gen 7 (Lunala's ability, same effect as Multiscale).
      // Source: Showdown data/abilities.ts -- multiscale/shadowshield onSourceModifyDamage
      // Source: Bulbapedia "Shadow Shield" -- same effect as Multiscale
      const maxHp = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHp) return NO_ACTIVATION;
      const abilityName = abilityId === ABILITY_IDS.multiscale ? "Multiscale" : "Shadow Shield";
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s ${abilityName} weakened the attack!`],
      };
    }

    case ABILITY_IDS.solidRock:
    case ABILITY_IDS.filter: {
      // Solid Rock / Filter: 0.75x super-effective damage taken.
      // Source: Showdown data/abilities.ts -- solidrock / filter onSourceModifyDamage
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

    case ABILITY_IDS.prismArmor: {
      // Prism Armor (new in Gen 7): 0.75x super-effective damage.
      // IMPORTANT: Unlike Solid Rock/Filter, Prism Armor CANNOT be ignored by Mold Breaker.
      // The damage calc handles the Mold Breaker bypass check.
      // Source: Showdown data/abilities.ts -- prismarmor: isBreakable: false
      // Source: Bulbapedia "Prism Armor" -- "reduces damage from super-effective moves by 25%"
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s Prism Armor weakened the attack!`],
      };
    }

    case ABILITY_IDS.thickFat: {
      // Thick Fat: 0.5x damage from Fire and Ice type moves.
      // Source: Showdown data/abilities.ts -- thickfat onSourceModifyAtk/onSourceModifySpA
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

    case ABILITY_IDS.marvelScale: {
      // Marvel Scale: 1.5x Defense when the holder has a primary status condition.
      // Source: Showdown data/abilities.ts -- marvelscale onModifyDef
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

    case ABILITY_IDS.furCoat: {
      // Fur Coat: doubles effective Defense against physical moves.
      // Source: Bulbapedia "Fur Coat" -- doubles Defense against physical
      // Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== CORE_MOVE_CATEGORIES.physical) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s Fur Coat halved the damage!`],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle damage-immunity and damage-capping ability checks for Gen 7.
 *
 * Sturdy: blocks OHKO moves AND survives any hit from full HP at 1 HP.
 *
 * Source: Showdown data/abilities.ts -- sturdy
 */
export function handleGen7DamageImmunityAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case ABILITY_IDS.sturdy: {
      // Sturdy: Block OHKO moves entirely
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
  if (abilityId !== ABILITY_IDS.sheerForce) return 1;
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
  if (abilityId !== ABILITY_IDS.sheerForce) return false;
  return isSheerForceEligibleMove(effect, moveId ?? "");
}

/**
 * Calculate the Multiscale / Shadow Shield damage multiplier.
 * Returns 0.5 if the defender has Multiscale or Shadow Shield and is at full HP.
 *
 * Source: Showdown data/abilities.ts -- multiscale/shadowshield onSourceModifyDamage
 */
export function getMultiscaleMultiplier(
  abilityId: string,
  currentHp: number,
  maxHp: number,
): number {
  if (abilityId !== ABILITY_IDS.multiscale && abilityId !== ABILITY_IDS.shadowShield) return 1;
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
  if (abilityId !== ABILITY_IDS.sturdy) return damage;
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
  if (abilityId !== ABILITY_IDS.sturdy) return false;
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
  if (abilityId !== ABILITY_IDS.toughClaws) return 1;
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
  if (abilityId !== ABILITY_IDS.strongJaw) return 1;
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
  if (abilityId !== ABILITY_IDS.megaLauncher) return 1;
  if (!isPulse) return 1;
  return 1.5;
}

/**
 * Get the -ate ability type override and power multiplier for Gen 7.
 * Pixilate/Aerilate/Refrigerate/Galvanize: change Normal -> X type with 1.2x boost.
 *
 * Gen 7: 1.2x (4915/4096), was 1.3x (5325/4096) in Gen 6.
 *
 * Source: Showdown data/abilities.ts -- Gen 7: chainModify([4915, 4096])
 * Source: Bulbapedia -- "-ate abilities nerfed from 1.3x to 1.2x in Gen 7"
 *
 * @returns { type, multiplier } if the ability activates, or null otherwise
 */
export function getAteAbilityOverride(
  abilityId: string,
  moveType: PokemonType,
): { type: PokemonType; multiplier: number } | null {
  if (moveType !== CORE_TYPE_IDS.normal) return null;

  switch (abilityId) {
    case ABILITY_IDS.pixilate:
      return { type: CORE_TYPE_IDS.fairy, multiplier: 4915 / 4096 };
    case ABILITY_IDS.aerilate:
      return { type: CORE_TYPE_IDS.flying, multiplier: 4915 / 4096 };
    case ABILITY_IDS.refrigerate:
      return { type: CORE_TYPE_IDS.ice, multiplier: 4915 / 4096 };
    case ABILITY_IDS.galvanize:
      return { type: CORE_TYPE_IDS.electric, multiplier: 4915 / 4096 };
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
  if (abilityId !== ABILITY_IDS.parentalBond) return false;
  if (!movePower || movePower <= 0) return false;
  if (moveEffectType === "multi-hit") return false;
  return true;
}

/**
 * Gen 7 Parental Bond second-hit multiplier: 0.25 (25% of first hit).
 * Nerfed from 0.5 (50%) in Gen 6.
 *
 * Source: Showdown data/abilities.ts -- Gen 7: parentalbond secondHit 0.25
 * Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Gen 7"
 */
export const PARENTAL_BOND_SECOND_HIT_MULTIPLIER = 0.25;

/**
 * Get the Fur Coat defense multiplier.
 * Returns 2.0 against physical moves.
 *
 * Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
 * Source: Bulbapedia "Fur Coat" -- doubles Defense for physical attacks
 */
export function getFurCoatMultiplier(abilityId: string, isPhysical: boolean): number {
  if (abilityId !== ABILITY_IDS.furCoat) return 1;
  if (!isPhysical) return 1;
  return 2;
}
