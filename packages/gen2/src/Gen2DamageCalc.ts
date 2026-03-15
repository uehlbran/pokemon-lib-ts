import type { DamageBreakdown, DamageContext, DamageResult } from "@pokemon-lib-ts/battle";
import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonSpeciesData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
} from "@pokemon-lib-ts/core";

import { getWeatherDamageModifier } from "./Gen2Weather";

/**
 * Physical types in Gen 2.
 * In Gen 2 (like Gen 1), the category (physical/special) is determined by the move's TYPE,
 * not by a per-move flag. Steel is physical, Dark is special.
 */
const GEN2_PHYSICAL_TYPES: readonly PokemonType[] = [
  "normal",
  "fighting",
  "flying",
  "ground",
  "rock",
  "bug",
  "ghost",
  "poison",
  "steel",
];

/**
 * Determine whether a move type is physical or special in Gen 2.
 * Same as Gen 1 but Steel (new in Gen 2) is physical.
 * Dark (new in Gen 2) is special (not in this list).
 */
export function isPhysicalInGen2(moveType: PokemonType): boolean {
  return (GEN2_PHYSICAL_TYPES as readonly string[]).includes(moveType);
}

/**
 * Get the effective attack stat for a move in Gen 2.
 * Physical types use Attack; special types use SpAttack.
 * Unlike Gen 1, SpAttack and SpDefense are now separate stats.
 */
function getAttackStat(attacker: ActivePokemon, moveType: PokemonType, isCrit: boolean): number {
  const physical = isPhysicalInGen2(moveType);
  const statKey = physical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;

  if (isCrit) {
    // Critical hits ignore negative stat stages for attacker
    const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
    let baseStat = stats ? stats[statKey] : 100;
    if (stage > 0) {
      baseStat = Math.floor(baseStat * getStatStageMultiplier(stage));
    }
    // Burn halves physical attack
    if (physical && attacker.pokemon.status === "burn") {
      baseStat = Math.floor(baseStat / 2);
    }
    // Thick Club doubles attack for Cubone (104) / Marowak (105)
    if (
      physical &&
      attacker.pokemon.heldItem === "thick-club" &&
      (attacker.pokemon.speciesId === 104 || attacker.pokemon.speciesId === 105)
    ) {
      baseStat = baseStat * 2;
    }
    // Light Ball doubles Pikachu's (25) SpAtk
    if (
      !physical &&
      attacker.pokemon.heldItem === "light-ball" &&
      attacker.pokemon.speciesId === 25
    ) {
      baseStat = baseStat * 2;
    }
    return Math.max(1, baseStat);
  }

  const baseStat = stats ? stats[statKey] : 100;
  const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
  let effective = Math.floor(baseStat * getStatStageMultiplier(stage));

  // Burn halves physical attack
  if (physical && attacker.pokemon.status === "burn") {
    effective = Math.floor(effective / 2);
  }

  // Thick Club doubles attack for Cubone (104) / Marowak (105)
  if (
    physical &&
    attacker.pokemon.heldItem === "thick-club" &&
    (attacker.pokemon.speciesId === 104 || attacker.pokemon.speciesId === 105)
  ) {
    effective = effective * 2;
  }

  // Light Ball doubles Pikachu's (25) SpAtk
  if (
    !physical &&
    attacker.pokemon.heldItem === "light-ball" &&
    attacker.pokemon.speciesId === 25
  ) {
    effective = effective * 2;
  }

  return Math.max(1, effective);
}

/**
 * Get the effective defense stat for a move in Gen 2.
 * Physical types use Defense; special types use SpDefense.
 */
function getDefenseStat(defender: ActivePokemon, moveType: PokemonType, isCrit: boolean): number {
  const physical = isPhysicalInGen2(moveType);
  const statKey = physical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;

  if (isCrit) {
    // Critical hits ignore positive stat stages for defender
    const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;
    let baseStat = stats ? stats[statKey] : 100;
    if (stage < 0) {
      baseStat = Math.floor(baseStat * getStatStageMultiplier(stage));
    }
    // Metal Powder doubles Ditto's (132) defense
    // Note: transform detection not yet implemented; applied unconditionally when holding Metal Powder
    if (
      physical &&
      defender.pokemon.heldItem === "metal-powder" &&
      defender.pokemon.speciesId === 132
    ) {
      baseStat = baseStat * 2;
    }
    return Math.max(1, baseStat);
  }

  const baseStat = stats ? stats[statKey] : 100;
  const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;
  let effective = Math.floor(baseStat * getStatStageMultiplier(stage));

  // Metal Powder doubles Ditto's (132) defense
  // Note: transform detection not yet implemented; applied unconditionally when holding Metal Powder
  if (
    physical &&
    defender.pokemon.heldItem === "metal-powder" &&
    defender.pokemon.speciesId === 132
  ) {
    effective = effective * 2;
  }

  return Math.max(1, effective);
}

/**
 * Type-boosting held items in Gen 2.
 * Each provides a 10% damage boost (1.1x) when the holder uses a move of that type.
 */
const TYPE_BOOSTING_ITEMS: Record<string, PokemonType> = {
  charcoal: "fire",
  "mystic-water": "water",
  magnet: "electric",
  "miracle-seed": "grass",
  "never-melt-ice": "ice",
  "black-belt": "fighting",
  "poison-barb": "poison",
  "soft-sand": "ground",
  "sharp-beak": "flying",
  "twisted-spoon": "psychic",
  "silver-powder": "bug",
  "hard-stone": "rock",
  "spell-tag": "ghost",
  "dragon-fang": "dragon",
  "black-glasses": "dark",
  "metal-coat": "steel",
  "silk-scarf": "normal",
  "pink-bow": "normal",
  "polkadot-bow": "normal",
};

/**
 * Get the held item damage modifier.
 * Type-boosting items give a 1.1x boost in Gen 2.
 */
function getItemModifier(attacker: ActivePokemon, moveType: PokemonType): number {
  const item = attacker.pokemon.heldItem;
  if (!item) return 1;

  const boostedType = TYPE_BOOSTING_ITEMS[item];
  if (boostedType === moveType) return 1.1;

  return 1;
}

/**
 * Calculate damage for a move in Gen 2.
 *
 * Formula is similar to Gen 1 but with key differences:
 * - SpAttack and SpDefense are separate stats
 * - Weather modifiers (Rain/Sun)
 * - Held item modifiers (type-boosting items at 1.1x)
 * - Critical hits ignore negative attacker stages and positive defender stages
 *   (not just all stages like Gen 1)
 * - Steel and Dark types added
 */
export function calculateGen2Damage(
  context: DamageContext,
  typeChart: TypeChart,
  attackerSpecies: PokemonSpeciesData,
): DamageResult {
  const { attacker, defender, move, state, rng, isCrit } = context;

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

  const attack = getAttackStat(attacker, move.type, isCrit);
  const defense = getDefenseStat(defender, move.type, isCrit);

  // Explosion and Self-Destruct halve the defender's defense stat before damage calc
  let effectiveDefense = defense;
  if (move.id === "explosion" || move.id === "self-destruct") {
    effectiveDefense = Math.max(1, Math.floor(defense / 2));
  }

  // Step 1: Base damage
  // floor(floor(floor((2*Level/5 + 2) * Power * A) / D) / 50) + 2
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor(levelFactor * power * attack) / effectiveDefense);
  baseDamage = Math.floor(baseDamage / 50) + 2;

  // Step 2: Critical hit doubles damage in Gen 2
  if (isCrit) {
    baseDamage = Math.floor(baseDamage * 2);
  }

  // Step 3: Weather modifier
  const weather = state.weather?.type ?? null;
  const weatherMod = weather ? getWeatherDamageModifier(move.type, weather) : 1;
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // Step 4: STAB
  const stabMod = getStabModifier(move.type, attacker.types);
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // Step 5: Type effectiveness
  const effectiveness = getTypeEffectiveness(move.type, defender.types, typeChart);
  if (effectiveness === 0) {
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor: 1,
    };
  }
  baseDamage = Math.floor(baseDamage * effectiveness);

  // Step 6: Item modifier (type-boosting items at 1.1x)
  const itemMod = getItemModifier(attacker, move.type);
  if (itemMod !== 1) {
    baseDamage = Math.floor(baseDamage * itemMod);
  }

  // Step 7: Random factor (217-255) / 255
  const randomRoll = rng.int(217, 255);
  const randomFactor = randomRoll / 255;
  let finalDamage = Math.floor(baseDamage * randomFactor);

  // Minimum 1 damage
  finalDamage = Math.max(1, finalDamage);

  const physical = isPhysicalInGen2(move.type);
  const breakdown: DamageBreakdown = {
    baseDamage: Math.floor(Math.floor(levelFactor * power * attack) / defense / 50) + 2,
    weatherMod,
    critMod: isCrit ? 2 : 1,
    randomMod: randomFactor,
    stabMod,
    typeMod: effectiveness,
    burnMod: physical && attacker.pokemon.status === "burn" ? 0.5 : 1,
    abilityMod: 1, // No abilities in Gen 2
    itemMod,
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
