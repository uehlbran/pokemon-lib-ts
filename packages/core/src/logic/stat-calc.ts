import type { NatureData } from "../entities/nature";
import type { PokemonInstance } from "../entities/pokemon";
import type { PokemonSpeciesData } from "../entities/species";
import type { NonHpStat, StatBlock } from "../entities/stats";

/**
 * Calculate a Pokemon's maximum HP.
 *
 * Formula (Gen 3+):
 *   HP = floor(((2 * Base + IV + floor(EV / 4)) * Level) / 100) + Level + 10
 *
 * Special case: Shedinja always has 1 HP regardless of stats.
 *
 * @param base - Base HP stat (from species data)
 * @param iv - Individual Value (0-31)
 * @param ev - Effort Value (0-252)
 * @param level - Pokemon level (1-100)
 * @returns Maximum HP
 */
export function calculateHp(base: number, iv: number, ev: number, level: number): number {
  if (base === 1) return 1; // Shedinja
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}

/**
 * Calculate a non-HP stat (Attack, Defense, SpAtk, SpDef, Speed).
 *
 * Formula (Gen 3+):
 *   Stat = floor((floor(((2 * Base + IV + floor(EV / 4)) * Level) / 100) + 5) * NatureMod)
 *
 * @param base - Base stat value
 * @param iv - Individual Value (0-31)
 * @param ev - Effort Value (0-252)
 * @param level - Pokemon level (1-100)
 * @param natureMod - Nature modifier (0.9, 1.0, or 1.1)
 * @returns Calculated stat value
 */
export function calculateStat(
  base: number,
  iv: number,
  ev: number,
  level: number,
  natureMod: number,
): number {
  return Math.floor(
    (Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * natureMod,
  );
}

/**
 * Get the nature modifier for a specific stat.
 *
 * @returns 1.1 if nature boosts this stat, 0.9 if it hinders, 1.0 if neutral
 */
export function getNatureModifier(nature: NatureData, stat: NonHpStat): number {
  if (nature.increased === stat) return 1.1;
  if (nature.decreased === stat) return 0.9;
  return 1.0;
}

/**
 * Calculate all six stats for a Pokemon instance.
 * This is the main entry point for stat calculation.
 */
export function calculateAllStats(
  pokemon: PokemonInstance,
  species: PokemonSpeciesData,
  nature: NatureData,
): StatBlock {
  return {
    hp: calculateHp(species.baseStats.hp, pokemon.ivs.hp, pokemon.evs.hp, pokemon.level),
    attack: calculateStat(
      species.baseStats.attack,
      pokemon.ivs.attack,
      pokemon.evs.attack,
      pokemon.level,
      getNatureModifier(nature, "attack"),
    ),
    defense: calculateStat(
      species.baseStats.defense,
      pokemon.ivs.defense,
      pokemon.evs.defense,
      pokemon.level,
      getNatureModifier(nature, "defense"),
    ),
    spAttack: calculateStat(
      species.baseStats.spAttack,
      pokemon.ivs.spAttack,
      pokemon.evs.spAttack,
      pokemon.level,
      getNatureModifier(nature, "spAttack"),
    ),
    spDefense: calculateStat(
      species.baseStats.spDefense,
      pokemon.ivs.spDefense,
      pokemon.evs.spDefense,
      pokemon.level,
      getNatureModifier(nature, "spDefense"),
    ),
    speed: calculateStat(
      species.baseStats.speed,
      pokemon.ivs.speed,
      pokemon.evs.speed,
      pokemon.level,
      getNatureModifier(nature, "speed"),
    ),
  };
}
