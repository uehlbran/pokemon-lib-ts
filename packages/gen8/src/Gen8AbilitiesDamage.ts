import type { AbilityContext, AbilityResult } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES, BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TARGETS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN8_ABILITY_IDS, GEN8_MOVE_IDS } from "./data/reference-ids.js";

/**
 * Gen 8 damage-modifying ability handlers.
 *
 * Carries forward all Gen 7 damage abilities unchanged and adds Gen 8 abilities:
 *   - Gorilla Tactics (new): 1.5x physical attack (like Choice Band without the item slot)
 *   - Transistor (new): 1.5x Electric moves
 *   - Dragon's Maw (new): 1.5x Dragon moves
 *   - Punk Rock (new): 1.3x outgoing sound moves / 0.5x incoming sound moves
 *   - Ice Scales (new): 0.5x incoming special damage
 *   - Steelworker (carry from Gen 7): 1.5x Steel moves
 *
 * All numerical damage effects are handled directly in Gen8DamageCalc.ts.
 * These handler functions return activation signals so the engine can emit
 * appropriate messages and track ability usage.
 *
 * Source: Showdown data/abilities.ts -- Gen 8 ability handlers
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Recoil detection helper (for Reckless) -- carried from Gen 5/6/7
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
// Sheer Force secondary effect detection -- carried from Gen 5/6/7
// ---------------------------------------------------------------------------

/**
 * Moves whose Sheer Force-eligible secondaries cannot be represented in our
 * MoveEffect union because Showdown stores them as custom `onHit` functions.
 *
 * Source: Showdown data/moves.ts -- triattack: secondary.onHit randomly picks
 *   from burn/paralysis/freeze with 20% chance
 */
const SHEER_FORCE_MOVE_WHITELIST: ReadonlySet<string> = new Set([
  GEN8_MOVE_IDS.triAttack,
  "secret-power",
  "relic-song",
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
      if (effect.target === CORE_MOVE_EFFECT_TARGETS.self && effect.fromSecondary === true)
        return true;
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
// Pinch ability type mapping -- carried from Gen 5/6/7
// ---------------------------------------------------------------------------

/**
 * Pinch abilities: 1.5x attack stat when HP <= floor(maxHP/3) and move type matches.
 *
 * Source: Showdown data/abilities.ts -- Blaze/Overgrow/Torrent/Swarm onModifyAtk/onModifySpA
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  [GEN8_ABILITY_IDS.blaze]: CORE_TYPE_IDS.fire,
  [GEN8_ABILITY_IDS.overgrow]: CORE_TYPE_IDS.grass,
  [GEN8_ABILITY_IDS.torrent]: CORE_TYPE_IDS.water,
  [GEN8_ABILITY_IDS.swarm]: CORE_TYPE_IDS.bug,
};

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
 * Handle damage-calc ability modifiers for Gen 8.
 *
 * Covers all Gen 7 damage-calc abilities plus Gen 8 additions:
 *   - Gorilla Tactics (new): 1.5x physical attack
 *   - Transistor (new): 1.5x Electric moves
 *   - Dragon's Maw (new): 1.5x Dragon moves
 *   - Punk Rock (new): 1.3x outgoing sound moves
 *   - Steelworker: 1.5x Steel moves
 *
 * Source: Showdown data/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */
export function handleGen8DamageCalcAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    // ---- Attacker-side abilities (carried from Gen 7) ----

    case GEN8_ABILITY_IDS.sheerForce: {
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

    case GEN8_ABILITY_IDS.analytic: {
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

    case GEN8_ABILITY_IDS.sandForce: {
      // Sand Force: 1.3x (5325/4096) to Rock, Ground, Steel moves in sandstorm.
      // Source: Showdown data/abilities.ts -- sandforce onBasePower
      if (!ctx.move) return NO_ACTIVATION;
      const weather = ctx.state.weather?.type ?? null;
      if (weather !== CORE_WEATHER_IDS.sand) return NO_ACTIVATION;
      const sandForceTypes: readonly PokemonType[] = [
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

    case GEN8_ABILITY_IDS.technician: {
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

    case GEN8_ABILITY_IDS.ironFist: {
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

    case GEN8_ABILITY_IDS.reckless: {
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

    case GEN8_ABILITY_IDS.adaptability: {
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

    case GEN8_ABILITY_IDS.hustle: {
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

    case GEN8_ABILITY_IDS.hugePower:
    case GEN8_ABILITY_IDS.purePower: {
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

    case GEN8_ABILITY_IDS.guts: {
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

    case GEN8_ABILITY_IDS.blaze:
    case GEN8_ABILITY_IDS.overgrow:
    case GEN8_ABILITY_IDS.torrent:
    case GEN8_ABILITY_IDS.swarm: {
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

    case GEN8_ABILITY_IDS.sniper: {
      // Sniper: crits deal extra damage. The damage calc applies the numeric value.
      // Source: Showdown data/abilities.ts -- sniper onModifyDamage: if crit, chainModify(1.5)
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [],
      };
    }

    case GEN8_ABILITY_IDS.tintedLens: {
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

    case GEN8_ABILITY_IDS.toughClaws: {
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

    case GEN8_ABILITY_IDS.strongJaw: {
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

    case GEN8_ABILITY_IDS.megaLauncher: {
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

    // ---- -ate abilities (Gen 7/8: 1.2x) ----

    case GEN8_ABILITY_IDS.pixilate: {
      // Pixilate: Normal moves become Fairy, 1.2x (4915/4096) boost.
      // Source: Showdown data/abilities.ts -- pixilate: onModifyType + onBasePower
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

    case GEN8_ABILITY_IDS.aerilate: {
      // Aerilate: Normal moves become Flying, 1.2x (4915/4096) boost.
      // Source: Showdown data/abilities.ts -- aerilate: onModifyType + onBasePower
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

    case GEN8_ABILITY_IDS.refrigerate: {
      // Refrigerate: Normal moves become Ice, 1.2x (4915/4096) boost.
      // Source: Showdown data/abilities.ts -- refrigerate: onModifyType + onBasePower
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

    case GEN8_ABILITY_IDS.galvanize: {
      // Galvanize: Normal moves become Electric, 1.2x (4915/4096) boost.
      // Source: Showdown data/abilities.ts -- galvanize: onModifyType + onBasePower
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

    case GEN8_ABILITY_IDS.parentalBond: {
      // Parental Bond: moves hit twice, second hit at 25% power in Gen 7+.
      // Source: Showdown data/abilities.ts -- parentalbond: Gen 7+ secondHit 0.25
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

    // ---- NEW Gen 8 attacker-side abilities ----

    case GEN8_ABILITY_IDS.gorillaTactics: {
      // Gorilla Tactics: 1.5x Attack for physical moves (locks into first move used).
      // Source: Showdown data/abilities.ts -- gorillatactics: onModifyAtk, chainModify(1.5)
      // Source: Bulbapedia "Gorilla Tactics" -- "boosts Attack by 50% but locks the user
      //   into the first move it uses"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== CORE_MOVE_CATEGORIES.physical) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Gorilla Tactics boosted its Attack!`],
      };
    }

    case GEN8_ABILITY_IDS.transistor: {
      // Transistor: 1.5x (6144/4096) for Electric-type moves.
      // Source: Showdown data/abilities.ts -- transistor: onModifyAtk/onModifySpA, chainModify(1.5)
      // Source: Bulbapedia "Transistor" -- "powers up Electric-type moves by 50%"
      // Note: In Gen 9, nerfed to 1.3333x (5461/4096). Gen 8 is 1.5x.
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.electric) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Transistor powered up the move!`],
      };
    }

    case GEN8_ABILITY_IDS.dragonsMaw: {
      // Dragon's Maw: 1.5x (6144/4096) for Dragon-type moves.
      // Source: Showdown data/abilities.ts -- dragonsmaw: onModifyAtk/onModifySpA, chainModify(1.5)
      // Source: Bulbapedia "Dragon's Maw" -- "powers up Dragon-type moves by 50%"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.dragon) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Dragon's Maw powered up the move!`],
      };
    }

    case GEN8_ABILITY_IDS.punkRock: {
      // Punk Rock (attacker side): 1.3x (5325/4096) for sound-based moves.
      // Source: Showdown data/abilities.ts -- punkrock: onBasePower, chainModify([5325, 4096])
      // Source: Bulbapedia "Punk Rock" -- "boosts the power of sound-based moves by 30%"
      if (!ctx.move) return NO_ACTIVATION;
      if (!ctx.move.flags.sound) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Punk Rock boosted the move!`],
      };
    }

    case GEN8_ABILITY_IDS.steelworker: {
      // Steelworker: 1.5x (6144/4096) for Steel-type moves.
      // Source: Showdown data/abilities.ts -- steelworker: onModifyAtk/onModifySpA, chainModify(1.5)
      // Source: Bulbapedia "Steelworker" -- "powers up Steel-type moves by 50%"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.type !== CORE_TYPE_IDS.steel) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          { effectType: BATTLE_ABILITY_EFFECT_TYPES.none, target: BATTLE_EFFECT_TARGETS.self },
        ],
        messages: [`${name}'s Steelworker powered up the move!`],
      };
    }

    // ---- Defender-side abilities ----

    case GEN8_ABILITY_IDS.multiscale:
    case GEN8_ABILITY_IDS.shadowShield: {
      // Multiscale / Shadow Shield: 0.5x damage taken when at full HP.
      // Source: Showdown data/abilities.ts -- multiscale/shadowshield onSourceModifyDamage
      const maxHpMs = ctx.pokemon.pokemon.calculatedStats?.hp ?? ctx.pokemon.pokemon.currentHp;
      if (ctx.pokemon.pokemon.currentHp < maxHpMs) return NO_ACTIVATION;
      const abilityName =
        abilityId === GEN8_ABILITY_IDS.multiscale ? "Multiscale" : "Shadow Shield";
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

    case GEN8_ABILITY_IDS.solidRock:
    case GEN8_ABILITY_IDS.filter: {
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

    case GEN8_ABILITY_IDS.prismArmor: {
      // Prism Armor: 0.75x super-effective damage. Cannot be ignored by Mold Breaker.
      // Source: Showdown data/abilities.ts -- prismarmor: isBreakable: false
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

    case GEN8_ABILITY_IDS.thickFat: {
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

    case GEN8_ABILITY_IDS.marvelScale: {
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

    case GEN8_ABILITY_IDS.furCoat: {
      // Fur Coat: doubles effective Defense against physical moves.
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

    // ---- NEW Gen 8 defender-side abilities ----

    case GEN8_ABILITY_IDS.iceScales: {
      // Ice Scales: 0.5x (2048/4096) incoming special damage.
      // Source: Showdown data/abilities.ts -- icescales: onSourceModifyDamage, chainModify(0.5)
      // Source: Bulbapedia "Ice Scales" -- "halves the damage taken from special moves"
      if (!ctx.move) return NO_ACTIVATION;
      if (ctx.move.category !== CORE_MOVE_CATEGORIES.special) return NO_ACTIVATION;
      return {
        activated: true,
        effects: [
          {
            effectType: BATTLE_ABILITY_EFFECT_TYPES.damageReduction,
            target: BATTLE_EFFECT_TARGETS.self,
          },
        ],
        messages: [`${name}'s Ice Scales weakened the attack!`],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle damage-immunity and damage-capping ability checks for Gen 8.
 *
 * Sturdy: blocks OHKO moves AND survives any hit from full HP at 1 HP.
 *
 * Source: Showdown data/abilities.ts -- sturdy
 */
export function handleGen8DamageImmunityAbility(ctx: AbilityContext): AbilityResult {
  const abilityId = ctx.pokemon.ability;
  const name = ctx.pokemon.pokemon.nickname ?? String(ctx.pokemon.pokemon.speciesId);

  switch (abilityId) {
    case GEN8_ABILITY_IDS.sturdy: {
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
  if (abilityId !== GEN8_ABILITY_IDS.sheerForce) return 1;
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
  if (abilityId !== GEN8_ABILITY_IDS.sheerForce) return false;
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
  if (abilityId !== GEN8_ABILITY_IDS.multiscale && abilityId !== GEN8_ABILITY_IDS.shadowShield)
    return 1;
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
  if (abilityId !== GEN8_ABILITY_IDS.sturdy) return damage;
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
  if (abilityId !== GEN8_ABILITY_IDS.sturdy) return false;
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
  if (abilityId !== GEN8_ABILITY_IDS.toughClaws) return 1;
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
  if (abilityId !== GEN8_ABILITY_IDS.strongJaw) return 1;
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
  if (abilityId !== GEN8_ABILITY_IDS.megaLauncher) return 1;
  if (!isPulse) return 1;
  return 1.5;
}

/**
 * Get the -ate ability type override and power multiplier for Gen 8.
 * Pixilate/Aerilate/Refrigerate/Galvanize: change Normal -> X type with 1.2x boost.
 *
 * Gen 7/8: 1.2x (4915/4096), was 1.3x (5325/4096) in Gen 6.
 *
 * Source: Showdown data/abilities.ts -- Gen 7+: chainModify([4915, 4096])
 *
 * @returns { type, multiplier } if the ability activates, or null otherwise
 */
export function getAteAbilityOverride(
  abilityId: string,
  moveType: PokemonType,
): { type: PokemonType; multiplier: number } | null {
  if (moveType !== CORE_TYPE_IDS.normal) return null;

  switch (abilityId) {
    case GEN8_ABILITY_IDS.pixilate:
      return { type: CORE_TYPE_IDS.fairy, multiplier: 4915 / 4096 };
    case GEN8_ABILITY_IDS.aerilate:
      return { type: CORE_TYPE_IDS.flying, multiplier: 4915 / 4096 };
    case GEN8_ABILITY_IDS.refrigerate:
      return { type: CORE_TYPE_IDS.ice, multiplier: 4915 / 4096 };
    case GEN8_ABILITY_IDS.galvanize:
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
 * Source: Bulbapedia "Parental Bond" -- second hit is 25% in Gen 7+
 */
export function isParentalBondEligible(
  abilityId: string,
  movePower: number | null,
  moveEffectType: string | null,
): boolean {
  if (abilityId !== GEN8_ABILITY_IDS.parentalBond) return false;
  if (!movePower || movePower <= 0) return false;
  if (moveEffectType === "multi-hit") return false;
  return true;
}

/**
 * Gen 7+ Parental Bond second-hit multiplier: 0.25 (25% of first hit).
 *
 * Source: Showdown data/abilities.ts -- Gen 7+: parentalbond secondHit 0.25
 * Source: Bulbapedia "Parental Bond" -- "nerfed from 50% to 25% in Gen 7"
 */
export const PARENTAL_BOND_SECOND_HIT_MULTIPLIER = 0.25;

/**
 * Get the Fur Coat defense multiplier.
 * Returns 2.0 against physical moves.
 *
 * Source: Showdown data/abilities.ts -- furcoat: onModifyDef, chainModify(2)
 */
export function getFurCoatMultiplier(abilityId: string, isPhysical: boolean): number {
  if (abilityId !== GEN8_ABILITY_IDS.furCoat) return 1;
  if (!isPhysical) return 1;
  return 2;
}

// ---------------------------------------------------------------------------
// NEW Gen 8 pure utility functions
// ---------------------------------------------------------------------------

/**
 * Get the Gorilla Tactics Attack multiplier.
 * Returns 1.5x (6144/4096) for physical moves when ability is 'gorilla-tactics'.
 *
 * Source: Showdown data/abilities.ts -- gorillatactics: onModifyAtk, chainModify(1.5)
 * Source: Bulbapedia "Gorilla Tactics" -- "boosts Attack by 50%"
 */
export function getGorillaTacticsMultiplier(abilityId: string, category: string): number {
  if (abilityId !== GEN8_ABILITY_IDS.gorillaTactics) return 1;
  if (category !== CORE_MOVE_CATEGORIES.physical) return 1;
  return 6144 / 4096;
}

/**
 * Get the Transistor multiplier.
 * Returns 1.5x (6144/4096) for Electric-type moves when ability is 'transistor'.
 *
 * Note: In Gen 9, this was nerfed to ~1.3333x (5461/4096). Gen 8 uses 1.5x.
 *
 * Source: Showdown data/abilities.ts -- transistor: chainModify(1.5) in Gen 8
 * Source: Bulbapedia "Transistor" -- "powers up Electric-type moves by 50%"
 */
export function getTransistorMultiplier(abilityId: string, moveType: PokemonType): number {
  if (abilityId !== GEN8_ABILITY_IDS.transistor) return 1;
  if (moveType !== CORE_TYPE_IDS.electric) return 1;
  return 6144 / 4096;
}

/**
 * Get the Dragon's Maw multiplier.
 * Returns 1.5x (6144/4096) for Dragon-type moves when ability is Dragon's Maw.
 *
 * Source: Showdown data/abilities.ts -- dragonsmaw: chainModify(1.5)
 * Source: Bulbapedia "Dragon's Maw" -- "powers up Dragon-type moves by 50%"
 */
export function getDragonsMawMultiplier(abilityId: string, moveType: PokemonType): number {
  if (abilityId !== GEN8_ABILITY_IDS.dragonsMaw) {
    return 1;
  }
  if (moveType !== CORE_TYPE_IDS.dragon) return 1;
  return 6144 / 4096;
}

/**
 * Get the Punk Rock outgoing damage multiplier (attacker side).
 * Returns 5325/4096 (~1.3x) for sound-based moves when ability is 'punk-rock'.
 *
 * Source: Showdown data/abilities.ts -- punkrock: onBasePower, chainModify([5325, 4096])
 * Source: Bulbapedia "Punk Rock" -- "boosts the power of sound-based moves by 30%"
 */
export function getPunkRockMultiplier(abilityId: string, isSound: boolean): number {
  if (abilityId !== GEN8_ABILITY_IDS.punkRock) return 1;
  if (!isSound) return 1;
  return 5325 / 4096;
}

/**
 * Get the Punk Rock incoming damage multiplier (defender side).
 * Returns 0.5 for incoming sound-based moves when ability is 'punk-rock'.
 *
 * Source: Showdown data/abilities.ts -- punkrock: onSourceModifyDamage, chainModify(0.5)
 * Source: Bulbapedia "Punk Rock" -- "halves the damage taken from sound-based moves"
 */
export function getPunkRockIncomingMultiplier(abilityId: string, isSound: boolean): number {
  if (abilityId !== GEN8_ABILITY_IDS.punkRock) return 1;
  if (!isSound) return 1;
  return 0.5;
}

/**
 * Get the Ice Scales incoming damage multiplier.
 * Returns 0.5 (2048/4096) for incoming special attacks when ability is 'ice-scales'.
 *
 * Source: Showdown data/abilities.ts -- icescales: onSourceModifyDamage, chainModify(0.5)
 * Source: Bulbapedia "Ice Scales" -- "halves the damage taken from special moves"
 */
export function getIceScalesMultiplier(abilityId: string, category: string): number {
  if (abilityId !== GEN8_ABILITY_IDS.iceScales) return 1;
  if (category !== CORE_MOVE_CATEGORIES.special) return 1;
  return 0.5;
}

/**
 * Get the Steelworker multiplier.
 * Returns 1.5x (6144/4096) for Steel-type moves when ability is 'steelworker'.
 *
 * Source: Showdown data/abilities.ts -- steelworker: chainModify(1.5)
 * Source: Bulbapedia "Steelworker" -- "powers up Steel-type moves by 50%"
 */
export function getSteelworkerMultiplier(abilityId: string, moveType: PokemonType): number {
  if (abilityId !== GEN8_ABILITY_IDS.steelworker) return 1;
  if (moveType !== CORE_TYPE_IDS.steel) return 1;
  return 6144 / 4096;
}
