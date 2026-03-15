import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonSpeciesData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
} from "@pokemon-lib-ts/core";

/**
 * Physical types in Gen 1.
 * In Gen 1, the category (physical/special) is determined by the move's TYPE,
 * not by a per-move flag.
 */
const GEN1_PHYSICAL_TYPES: readonly PokemonType[] = [
  "normal",
  "fighting",
  "flying",
  "ground",
  "rock",
  "bug",
  "ghost",
  "poison",
];

/**
 * Determine whether a move type is physical or special in Gen 1.
 */
export function isGen1PhysicalType(moveType: PokemonType): boolean {
  return (GEN1_PHYSICAL_TYPES as readonly string[]).includes(moveType);
}

/**
 * Get the effective attack stat for a move in Gen 1.
 * Physical types use Attack; special types use SpAttack (which equals Special).
 */
function getAttackStat(
  attacker: ActivePokemon,
  moveType: PokemonType,
  isCrit: boolean,
  _species: PokemonSpeciesData,
): number {
  const physical = isGen1PhysicalType(moveType);
  const statKey = physical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;

  if (isCrit) {
    // Critical hits use the unmodified stat (ignore stat stages)
    // but still factor in burn for physical
    let baseStat = stats ? stats[statKey] : 100;
    // Burn halves physical attack, even on crits in Gen 1
    if (physical && attacker.pokemon.status === "burn") {
      baseStat = Math.floor(baseStat / 2);
    }
    return baseStat;
  }

  const baseStat = stats ? stats[statKey] : 100;
  const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
  let effective = Math.floor(baseStat * getStatStageMultiplier(stage));

  // Burn halves physical attack
  if (physical && attacker.pokemon.status === "burn") {
    effective = Math.floor(effective / 2);
  }

  return Math.max(1, effective);
}

/**
 * Get the effective defense stat for a move in Gen 1.
 * Physical types use Defense; special types use SpDefense (which equals Special).
 */
function getDefenseStat(defender: ActivePokemon, moveType: PokemonType, isCrit: boolean): number {
  const physical = isGen1PhysicalType(moveType);
  const statKey = physical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;

  if (isCrit) {
    // Critical hits ignore the defender's stat stages
    return Math.max(1, stats ? stats[statKey] : 100);
  }

  const baseStat = stats ? stats[statKey] : 100;
  const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;
  return Math.max(1, Math.floor(baseStat * getStatStageMultiplier(stage)));
}

/**
 * Calculate damage for a move in Gen 1.
 *
 * Formula:
 *   damage = floor(floor(floor((2*Level/5 + 2) * Power * A) / D) / 50) + 2
 *   then apply STAB (1.5x), type effectiveness, random factor (217-255)/255
 *
 * Key Gen 1 differences from later gens:
 * - Physical/Special is determined by TYPE, not per-move
 * - Critical hits use base stats (ignore stat stages)
 * - No abilities, no items, no weather
 * - Burn halves Attack for physical moves
 */
export function calculateGen1Damage(
  context: DamageContext,
  typeChart: TypeChart,
  attackerSpecies: PokemonSpeciesData,
): DamageResult {
  const { attacker, defender, move, rng, isCrit } = context;

  // Status moves do no damage
  if (move.category === "status" || move.power === null || move.power === 0) {
    return {
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      randomFactor: 1,
    };
  }

  const level = attacker.pokemon.level;
  const power = move.power;

  let attack = getAttackStat(attacker, move.type, isCrit, attackerSpecies);
  let defense = getDefenseStat(defender, move.type, isCrit);

  // Gen 1 stat overflow bug: when either attack or defense >= 256,
  // both are divided by 4 and taken mod 256 (Showdown scripts.ts:848-860)
  if (attack >= 256 || defense >= 256) {
    attack = Math.max(1, Math.floor(attack / 4) % 256);
    defense = Math.floor(defense / 4) % 256;
    if (defense === 0) defense = 1;
  }

  // Explosion / Self-Destruct: halve the target's Defense in the damage calc
  // (Showdown scripts.ts:863, applies after overflow check)
  if (isGen1PhysicalType(move.type) && (move.id === "explosion" || move.id === "self-destruct")) {
    defense = Math.max(1, Math.floor(defense / 2));
  }

  // Step 1: Base damage calculation with nested floors
  // floor(floor(floor((2*Level/5 + 2) * Power * A) / D) / 50) + 2
  // In Gen 1, critical hits double the attacker's level in the formula (not a 2x multiplier)
  const effectiveLevel = isCrit ? level * 2 : level;
  const levelFactor = Math.floor((2 * effectiveLevel) / 5) + 2;
  let baseDamage = Math.floor(Math.floor(levelFactor * power * attack) / defense);
  // Damage is capped at 997 before adding the +2 constant (Showdown scripts.ts)
  baseDamage = Math.min(997, Math.floor(baseDamage / 50)) + 2;

  // Step 2: STAB
  const stabMod = getStabModifier(move.type, attacker.types);
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // Step 3: Type effectiveness
  const effectiveness = getTypeEffectiveness(move.type, defender.types, typeChart);

  // If immune, return 0 damage
  if (effectiveness === 0) {
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor: 1,
    };
  }

  baseDamage = Math.floor(baseDamage * effectiveness);

  // Zero-damage check: if damage dropped to 0 after type effectiveness (e.g. 4x-resisted
  // weak move), the move is treated as a miss (deals 0 damage), not forced to 1.
  if (baseDamage === 0) {
    return {
      damage: 0,
      effectiveness,
      isCrit,
      randomFactor: 1,
    };
  }

  // Step 4: Random factor (217-255) / 255
  // In Gen 1, the random factor ranges from 217 to 255 (inclusive), then divided by 255
  // Integer math: avoid float intermediate that could cause rounding differences
  const randomRoll = rng.int(217, 255);
  const randomFactor = randomRoll / 255; // keep for DamageBreakdown.randomMultiplier only
  const finalDamage = Math.floor((baseDamage * randomRoll) / 255);

  const breakdown: DamageBreakdown = {
    baseDamage:
      Math.min(997, Math.floor(Math.floor(levelFactor * power * attack) / defense / 50)) + 2,
    weatherMultiplier: 1,
    critMultiplier: 1, // Crit handled via level doubling in levelFactor, not a separate multiplier
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier: isGen1PhysicalType(move.type) && attacker.pokemon.status === "burn" ? 0.5 : 1,
    abilityMultiplier: 1,
    itemMultiplier: 1,
    otherMultiplier: 1,
    finalDamage,
  };

  return {
    damage: finalDamage,
    effectiveness,
    isCrit,
    randomFactor,
    breakdown,
  };
}
