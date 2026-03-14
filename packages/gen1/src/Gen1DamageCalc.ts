import type { DamageBreakdown, DamageContext, DamageResult } from "@pokemon-lib/battle";
import type { ActivePokemon } from "@pokemon-lib/battle";
import type {
  MoveData,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib/core";
import { getStabModifier, getStatStageMultiplier, getTypeEffectiveness } from "@pokemon-lib/core";

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
export function isPhysicalInGen1(moveType: PokemonType): boolean {
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
  species: PokemonSpeciesData,
): number {
  const physical = isPhysicalInGen1(moveType);
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
  const physical = isPhysicalInGen1(moveType);
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

  const attack = getAttackStat(attacker, move.type, isCrit, attackerSpecies);
  const defense = getDefenseStat(defender, move.type, isCrit);

  // Step 1: Base damage calculation with nested floors
  // floor(floor(floor((2*Level/5 + 2) * Power * A) / D) / 50) + 2
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor(levelFactor * power * attack) / defense);
  baseDamage = Math.floor(baseDamage / 50) + 2;

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

  // Step 4: Random factor (217-255) / 255
  // In Gen 1, the random factor ranges from 217 to 255 (inclusive), then divided by 255
  const randomRoll = rng.int(217, 255);
  const randomFactor = randomRoll / 255;
  let finalDamage = Math.floor(baseDamage * randomFactor);

  // Minimum 1 damage (if the move hits and isn't immune)
  finalDamage = Math.max(1, finalDamage);

  const breakdown: DamageBreakdown = {
    baseDamage: Math.floor(Math.floor(levelFactor * power * attack) / defense / 50) + 2,
    weatherMod: 1,
    critMod: isCrit ? 1 : 1,
    randomMod: randomFactor,
    stabMod,
    typeMod: effectiveness,
    burnMod: isPhysicalInGen1(move.type) && attacker.pokemon.status === "burn" ? 0.5 : 1,
    abilityMod: 1,
    itemMod: 1,
    otherMod: 1,
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
