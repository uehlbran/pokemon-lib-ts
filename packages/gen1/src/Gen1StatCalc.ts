import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib/core";
import { calculateHp, calculateStat } from "@pokemon-lib/core";

/**
 * Calculate all six stats for a Gen 1 Pokemon.
 *
 * Gen 1 originally had a single "Special" stat and different IV/EV ranges,
 * but our data already uses the modern 6-stat model with IVs 0-31 and EVs 0-252.
 * The key Gen 1 difference: natures don't exist, so the nature modifier is always 1.0.
 *
 * We reuse the core stat formulas with a neutral nature modifier.
 */
export function calculateGen1Stats(
  pokemon: PokemonInstance,
  species: PokemonSpeciesData,
): StatBlock {
  return {
    hp: calculateHp(species.baseStats.hp, pokemon.ivs.hp, pokemon.evs.hp, pokemon.level),
    attack: calculateStat(
      species.baseStats.attack,
      pokemon.ivs.attack,
      pokemon.evs.attack,
      pokemon.level,
      1.0, // No natures in Gen 1
    ),
    defense: calculateStat(
      species.baseStats.defense,
      pokemon.ivs.defense,
      pokemon.evs.defense,
      pokemon.level,
      1.0,
    ),
    spAttack: calculateStat(
      species.baseStats.spAttack,
      pokemon.ivs.spAttack,
      pokemon.evs.spAttack,
      pokemon.level,
      1.0,
    ),
    spDefense: calculateStat(
      species.baseStats.spDefense,
      pokemon.ivs.spDefense,
      pokemon.evs.spDefense,
      pokemon.level,
      1.0,
    ),
    speed: calculateStat(
      species.baseStats.speed,
      pokemon.ivs.speed,
      pokemon.evs.speed,
      pokemon.level,
      1.0,
    ),
  };
}
