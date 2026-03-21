import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib-ts/core";
import { calculateStatExpContribution } from "@pokemon-lib-ts/core";

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
  // Source: pret/pokered home/move_mon.asm lines 109-133
  // HP DV is derived from the LSBs of the other 4 DVs, not stored independently.
  // HP_DV = ((Atk & 1) << 3) | ((Def & 1) << 2) | ((Spe & 1) << 1) | (Spc & 1)
  const atkDv = Math.max(0, Math.min(15, Math.floor(pokemon.ivs.attack)));
  const defDv = Math.max(0, Math.min(15, Math.floor(pokemon.ivs.defense)));
  const speDv = Math.max(0, Math.min(15, Math.floor(pokemon.ivs.speed)));
  const spcDv = Math.max(0, Math.min(15, Math.floor(pokemon.ivs.spAttack)));
  const hpDv = ((atkDv & 1) << 3) | ((defDv & 1) << 2) | ((speDv & 1) << 1) | (spcDv & 1);

  // Gen 1 has a unified Special stat; spDefense inputs are intentionally ignored
  // and we use only spAttack to compute the single Special value
  const special = calculateGen1Stat(
    species.baseStats.spAttack,
    spcDv,
    pokemon.evs.spAttack,
    pokemon.level,
  );
  return {
    hp: calculateGen1Hp(species.baseStats.hp, hpDv, pokemon.evs.hp, pokemon.level),
    attack: calculateGen1Stat(species.baseStats.attack, atkDv, pokemon.evs.attack, pokemon.level),
    defense: calculateGen1Stat(
      species.baseStats.defense,
      defDv,
      pokemon.evs.defense,
      pokemon.level,
    ),
    spAttack: special,
    spDefense: special,
    speed: calculateGen1Stat(species.baseStats.speed, speDv, pokemon.evs.speed, pokemon.level),
  };
}
