import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonSpeciesData, StatBlock } from "@pokemon-lib-ts/core";
import { calculateStatExpContribution, MAX_DV } from "@pokemon-lib-ts/core";

// Source: pret/pokered engine/battle/core.asm — badge stat boost table
// Boulder Badge → Attack, Thunder Badge → Defense, Soul Badge → Speed, Volcano Badge → Special
export interface Gen1BadgeBoosts {
  readonly boulder?: boolean; // × 9/8 on Attack
  readonly thunder?: boolean; // × 9/8 on Defense
  readonly soul?: boolean; // × 9/8 on Speed
  readonly volcano?: boolean; // × 9/8 on Special (both spAttack and spDefense)
}

/**
 * Apply Gen 1 badge stat boosts. Each badge multiplies the relevant stat by 9/8 (floor).
 * In Gen 1, badge boosts are a single-player mechanic — competitive/link battles never apply them.
 *
 * Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts routine
 */
export function applyGen1BadgeBoosts(stats: StatBlock, badges: Gen1BadgeBoosts): StatBlock {
  // Source: pret/pokered engine/battle/core.asm — ApplyBadgeStatBoosts caps at MAX_STAT_VALUE (999)
  let { hp, attack, defense, speed, spAttack, spDefense } = stats;
  if (badges.boulder) attack = Math.min(MAX_STAT_VALUE, Math.floor((attack * 9) / 8));
  if (badges.thunder) defense = Math.min(MAX_STAT_VALUE, Math.floor((defense * 9) / 8));
  if (badges.soul) speed = Math.min(MAX_STAT_VALUE, Math.floor((speed * 9) / 8));
  if (badges.volcano) {
    spAttack = Math.min(MAX_STAT_VALUE, Math.floor((spAttack * 9) / 8));
    spDefense = Math.min(MAX_STAT_VALUE, Math.floor((spDefense * 9) / 8)); // spDefense === spAttack in Gen 1
  }
  return { hp, attack, defense, speed, spAttack, spDefense };
}

const MAX_STAT_VALUE = 999;

/**
 * Re-applies badge boost (×9/8 per badge) to ALL badge-eligible calculatedStats.
 * Called after every in-battle stat stage change to implement the badge boost glitch.
 * The cartridge BadgeStatBoosts routine iterates ALL 4 badge/stat pairs unconditionally —
 * it does NOT check which stat changed. Every call re-boosts every badge-eligible stat.
 * Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts iterates all badge/stat pairs
 */
export function applyBadgeBoostGlitch(pokemon: ActivePokemon, badgeBoosts: Gen1BadgeBoosts): void {
  const stats = pokemon.pokemon.calculatedStats;
  if (!stats) return;
  // Cast through unknown to allow mutation — calculatedStats is a mutable snapshot
  const mutable = stats as unknown as {
    attack: number;
    defense: number;
    speed: number;
    spAttack: number;
    spDefense: number;
  };
  // BadgeStatBoosts runs all 4 pairs every invocation — not just the changed stat
  if (badgeBoosts.boulder) {
    mutable.attack = Math.min(MAX_STAT_VALUE, Math.floor((mutable.attack * 9) / 8));
  }
  if (badgeBoosts.thunder) {
    mutable.defense = Math.min(MAX_STAT_VALUE, Math.floor((mutable.defense * 9) / 8));
  }
  if (badgeBoosts.soul) {
    mutable.speed = Math.min(MAX_STAT_VALUE, Math.floor((mutable.speed * 9) / 8));
  }
  if (badgeBoosts.volcano) {
    // Gen 1 unified Special — both spAttack and spDefense get boosted together
    mutable.spAttack = Math.min(MAX_STAT_VALUE, Math.floor((mutable.spAttack * 9) / 8));
    mutable.spDefense = Math.min(MAX_STAT_VALUE, Math.floor((mutable.spDefense * 9) / 8));
  }
}

/**
 * Gen 1 formula for non-HP stats.
 *
 * floor(((Base + DV) * 2 + statExpContrib) * Level / 100) + 5
 */
function calculateGen1Stat(base: number, dv: number, statExp: number, level: number): number {
  const clampedDv = Math.max(0, Math.min(MAX_DV, Math.floor(dv))); // DVs are 4-bit values: 0–15
  const statExpContrib = calculateStatExpContribution(statExp);
  return Math.floor((((base + clampedDv) * 2 + statExpContrib) * level) / 100) + 5;
}

/**
 * Gen 1 formula for HP.
 *
 * floor(((Base + DV) * 2 + statExpContrib) * Level / 100) + Level + 10
 */
function calculateGen1Hp(base: number, dv: number, statExp: number, level: number): number {
  const clampedDv = Math.max(0, Math.min(MAX_DV, Math.floor(dv))); // DVs are 4-bit values: 0–15
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
  const atkDv = Math.max(0, Math.min(MAX_DV, Math.floor(pokemon.ivs.attack)));
  const defDv = Math.max(0, Math.min(MAX_DV, Math.floor(pokemon.ivs.defense)));
  const speDv = Math.max(0, Math.min(MAX_DV, Math.floor(pokemon.ivs.speed)));
  const spcDv = Math.max(0, Math.min(MAX_DV, Math.floor(pokemon.ivs.spAttack)));
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
