import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib-ts/core";
import { calculateStatExpContribution } from "@pokemon-lib-ts/core";

/**
 * Calculate a Gen 2 HP stat.
 *
 * HP = floor(((Base + DV) * 2 + floor(ceil(sqrt(StatExp)) / 4)) * Level / 100) + Level + 10
 *
 * @param base - Base HP stat
 * @param dv - DV value (0-15), stored in `ivs.hp` for compatibility
 * @param statExp - Stat Experience (0-65535), stored in `evs.hp` for compatibility
 * @param level - Pokemon level (1-100)
 */
function calculateGen2Hp(base: number, dv: number, statExp: number, level: number): number {
  const expBonus = calculateStatExpContribution(statExp);
  return Math.floor((((base + dv) * 2 + expBonus) * level) / 100) + level + 10;
}

/**
 * Calculate a Gen 2 non-HP stat.
 *
 * Stat = floor(((Base + DV) * 2 + floor(ceil(sqrt(StatExp)) / 4)) * Level / 100) + 5
 *
 * Gen 2 has no natures, so there's no nature modifier.
 *
 * @param base - Base stat value
 * @param dv - DV value (0-15), stored in `ivs` for compatibility
 * @param statExp - Stat Experience (0-65535), stored in `evs` for compatibility
 * @param level - Pokemon level (1-100)
 */
function calculateGen2Stat(base: number, dv: number, statExp: number, level: number): number {
  const expBonus = calculateStatExpContribution(statExp);
  return Math.floor((((base + dv) * 2 + expBonus) * level) / 100) + 5;
}

/**
 * Calculate all six stats for a Gen 2 Pokemon.
 *
 * Gen 2 uses DV/StatExp formulas — NOT the Gen 3+ IV/EV formulas in core.
 * DVs are 0-15 (stored in `ivs` field for PokemonInstance compatibility).
 * StatExp is 0-65535 (stored in `evs` field for compatibility).
 * No nature modifier (Gen 2 has no natures).
 *
 * Key difference from Gen 1: spAttack and spDefense now use DIFFERENT base stats.
 * In Gen 1, they used the same base stat ("Special"). Gen 2 split them.
 */
export function calculateGen2Stats(
  pokemon: PokemonInstance,
  species: PokemonSpeciesData,
): StatBlock {
  return {
    hp: calculateGen2Hp(species.baseStats.hp, pokemon.ivs.hp, pokemon.evs.hp, pokemon.level),
    attack: calculateGen2Stat(
      species.baseStats.attack,
      pokemon.ivs.attack,
      pokemon.evs.attack,
      pokemon.level,
    ),
    defense: calculateGen2Stat(
      species.baseStats.defense,
      pokemon.ivs.defense,
      pokemon.evs.defense,
      pokemon.level,
    ),
    spAttack: calculateGen2Stat(
      species.baseStats.spAttack,
      pokemon.ivs.spAttack,
      pokemon.evs.spAttack,
      pokemon.level,
    ),
    spDefense: calculateGen2Stat(
      species.baseStats.spDefense,
      pokemon.ivs.spDefense,
      pokemon.evs.spDefense,
      pokemon.level,
    ),
    speed: calculateGen2Stat(
      species.baseStats.speed,
      pokemon.ivs.speed,
      pokemon.evs.speed,
      pokemon.level,
    ),
  };
}
