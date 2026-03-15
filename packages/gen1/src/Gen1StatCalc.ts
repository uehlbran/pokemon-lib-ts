import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib-ts/core";

/**
 * Compute the stat experience contribution used in Gen 1 stat formulas.
 *
 * Formula: floor(ceil(sqrt(statExp)) / 4)
 *
 * Examples:
 *   statExp=0     → 0
 *   statExp=1     → floor(ceil(1) / 4)    = floor(1/4)   = 0
 *   statExp=16    → floor(ceil(4) / 4)    = floor(4/4)   = 1
 *   statExp=65535 → floor(ceil(255.998…) / 4) = floor(256/4) = 64
 */
export function calculateStatExpContribution(statExp: number): number {
  const clamped = Math.max(0, Math.min(65535, Math.floor(statExp))); // Stat EXP range: 0–65535
  return Math.floor(Math.ceil(Math.sqrt(clamped)) / 4);
}

/**
 * Gen 1 formula for non-HP stats.
 *
 * floor(((Base + DV) * 2 + statExpContrib) * Level / 100) + 5
 */
function calculateGen1Stat(base: number, dv: number, statExp: number, level: number): number {
  const clampedDv = Math.max(0, Math.min(15, Math.floor(dv))); // DVs are 4-bit values: 0–15
  const statExpContrib = calculateStatExpContribution(statExp);
  return Math.floor((((base + clampedDv) * 2 + statExpContrib) * level) / 100) + 5;
}

/**
 * Gen 1 formula for HP.
 *
 * floor(((Base + DV) * 2 + statExpContrib) * Level / 100) + Level + 10
 */
function calculateGen1Hp(base: number, dv: number, statExp: number, level: number): number {
  const clampedDv = Math.max(0, Math.min(15, Math.floor(dv))); // DVs are 4-bit values: 0–15
  const statExpContrib = calculateStatExpContribution(statExp);
  return Math.floor((((base + clampedDv) * 2 + statExpContrib) * level) / 100) + level + 10;
}

/**
 * Calculate all six stats for a Gen 1 Pokemon.
 *
 * Gen 1 mechanics:
 * - DVs (Determinant Values) range 0-15, stored in pokemon.ivs.*
 * - Stat Experience ranges 0-65535, stored in pokemon.evs.*
 * - No natures (natures were introduced in Gen 3)
 * - Special is a unified stat; spAttack and spDefense share the same base
 *   stat in Gen 1 data, so they will be equal when the species data reflects this.
 */
export function calculateGen1Stats(
  pokemon: PokemonInstance,
  species: PokemonSpeciesData,
): StatBlock {
  // Gen 1 has a unified Special stat; spDefense inputs are intentionally ignored
  // and we use only spAttack to compute the single Special value
  const special = calculateGen1Stat(
    species.baseStats.spAttack,
    pokemon.ivs.spAttack,
    pokemon.evs.spAttack,
    pokemon.level,
  );
  return {
    hp: calculateGen1Hp(species.baseStats.hp, pokemon.ivs.hp, pokemon.evs.hp, pokemon.level),
    attack: calculateGen1Stat(
      species.baseStats.attack,
      pokemon.ivs.attack,
      pokemon.evs.attack,
      pokemon.level,
    ),
    defense: calculateGen1Stat(
      species.baseStats.defense,
      pokemon.ivs.defense,
      pokemon.evs.defense,
      pokemon.level,
    ),
    spAttack: special,
    spDefense: special,
    speed: calculateGen1Stat(
      species.baseStats.speed,
      pokemon.ivs.speed,
      pokemon.evs.speed,
      pokemon.level,
    ),
  };
}
