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
 * Check whether a Pokemon is shiny in Gen 2, using the DV-based shininess formula.
 *
 * Source: pret/pokecrystal engine/gfx/color.asm — CheckShininess
 * Source: Bulbapedia — "Shiny Pokemon" § Generation II
 *
 * In Gen 2, DVs are 0-15. Shininess requires:
 *   - Defense DV = 10 (SHINY_DEF_DV)
 *   - Speed DV = 10 (SHINY_SPD_DV)
 *   - Special DV = 10 (SHINY_SPC_DV) — the unified Special DV, stored in spAttack
 *   - Attack DV must have bit 1 set (SHINY_ATK_MASK = %0010), i.e., atkDv & 2 !== 0
 *     This yields the set {2, 3, 6, 7, 10, 11, 14, 15}
 *
 * DVs are stored in the PokemonInstance `ivs` field:
 *   ivs.attack → Attack DV
 *   ivs.defense → Defense DV
 *   ivs.speed → Speed DV
 *   ivs.spAttack → Special DV (unified Gen 2 special DV for both SpAtk and SpDef)
 *
 * Note: HP DV is derived from other DVs in Gen 1/2 and is not directly relevant to shininess.
 */
export function checkIsShinyByDVs(
  atkDv: number,
  defDv: number,
  speDv: number,
  spcDv: number,
): boolean {
  // Source: pret/pokecrystal engine/gfx/color.asm:3 — SHINY_ATK_MASK EQU %0010
  // The assembly checks [hl] (byte containing high-nibble AtkDV) AND (SHINY_ATK_MASK << 4)
  // which is 0x20 — this is bit 1 of the Attack DV value (since high nibble = DV << 4, bit 5 of byte = bit 1 of DV)
  const atkHasBit1 = (atkDv & 0b0010) !== 0;
  // Source: pret/pokecrystal engine/gfx/color.asm:4-6 — SHINY_DEF_DV EQU 10, SHINY_SPD_DV EQU 10, SHINY_SPC_DV EQU 10
  return atkHasBit1 && defDv === 10 && speDv === 10 && spcDv === 10;
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
    // Gen 2 unified Special DV — same DV for both SpAtk and SpDef. Source: pret/pokecrystal
    spDefense: calculateGen2Stat(
      species.baseStats.spDefense,
      pokemon.ivs.spAttack,
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
