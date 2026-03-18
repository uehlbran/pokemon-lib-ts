import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonSpeciesData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { getStabModifier, getStatStageMultiplier } from "@pokemon-lib-ts/core";

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
export function isGen2PhysicalType(moveType: PokemonType): boolean {
  return (GEN2_PHYSICAL_TYPES as readonly string[]).includes(moveType);
}

/**
 * Get the effective attack stat for a move in Gen 2.
 * Physical types use Attack; special types use SpAttack.
 * Unlike Gen 1, SpAttack and SpDefense are now separate stats.
 *
 * @param ignoreBoosts - When true (crit + atkStage <= defStage), ignore ALL stat stages.
 * @param ignoreBurn - When true (crit + atkStage <= defStage), skip the burn attack halving.
 */
function getAttackStat(
  attacker: ActivePokemon,
  moveType: PokemonType,
  ignoreBoosts = false,
  ignoreBurn = false,
): number {
  const physical = isGen2PhysicalType(moveType);
  const statKey = physical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;
  const baseStat = stats ? stats[statKey] : 100;

  let effective: number;

  if (ignoreBoosts) {
    // Crit with atkStage <= defStage: ignore ALL stat stages
    effective = baseStat;
  } else {
    const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
    effective = Math.floor(baseStat * getStatStageMultiplier(stage));
  }

  // Burn halves physical attack (unless ignored on crit)
  if (physical && attacker.pokemon.status === "burn" && !ignoreBurn) {
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

  return Math.max(1, Math.min(999, effective));
}

/**
 * Get the effective defense stat for a move in Gen 2.
 * Physical types use Defense; special types use SpDefense.
 *
 * @param ignoreBoosts - When true (crit + atkStage <= defStage), ignore ALL stat stages.
 */
function getDefenseStat(
  defender: ActivePokemon,
  moveType: PokemonType,
  ignoreBoosts = false,
): number {
  const physical = isGen2PhysicalType(moveType);
  const statKey = physical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;
  const baseStat = stats ? stats[statKey] : 100;

  let effective: number;

  if (ignoreBoosts) {
    // Crit with atkStage <= defStage: ignore ALL stat stages
    effective = baseStat;
  } else {
    const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;
    effective = Math.floor(baseStat * getStatStageMultiplier(stage));
  }

  // Metal Powder doubles Ditto's (132) Defense only (not SpDefense)
  // Source: pret/pokecrystal src/engine/battle/Items.asm — GetItemStatBoost applies to physical Defense only
  // Note: transform detection not yet implemented; applied unconditionally when holding Metal Powder
  if (
    physical &&
    defender.pokemon.heldItem === "metal-powder" &&
    defender.pokemon.speciesId === 132
  ) {
    effective = effective * 2;
  }

  return Math.max(1, Math.min(999, effective));
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
 * Formula per pret/pokecrystal BattleCommand_DamageCalc (effect_commands.asm:2900-3129):
 *   1. baseDamage = floor(floor(floor((2*L/5)+2) * P * A) / D) / 50)  — no +2 yet
 *   2. Item modifier (type-boost items at 1.1x) — line 2983 (BEFORE crit)
 *   3. Crit: * 2 — line 3023 (AFTER items)
 *   4. Clamp: max(1, min(997, baseDamage))
 *   5. + 2
 *   6. Weather: water+rain/fire+sun → floor(* 1.5); opposite → floor(/ 2) — BattleCommand_Stab:1270
 *   7. STAB: += floor(damage / 2) — AFTER weather per BattleCommand_Stab:1251+
 *   8. Type effectiveness (sequential, floor each type separately)
 *   9. Random: floor(damage * rng.int(217,255) / 255)
 *   10. Minimum 1
 *
 * Source: pret/pokecrystal engine/battle/effect_commands.asm:2900-3129 BattleCommand_DamageCalc
 *
 * Key differences from Gen 1:
 * - SpAttack and SpDefense are separate stats
 * - Weather modifiers (Rain/Sun)
 * - Held item modifiers (type-boosting items at 1.1x)
 * - Critical hits: compare atkStage vs defStage to decide whether to ignore all boosts
 * - Steel and Dark types added
 */
export function calculateGen2Damage(
  context: DamageContext,
  typeChart: TypeChart,
  _attackerSpecies: PokemonSpeciesData,
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

  // Determine crit boost interaction (Showdown scripts.ts:589-600)
  const physical = isGen2PhysicalType(move.type);
  const atkStage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
  const defStage = physical ? defender.statStages.defense : defender.statStages.spDefense;
  // When atkStage <= defStage on a crit: ignore ALL boosts on both sides AND ignore burn
  const ignoreBoosts = isCrit && atkStage <= defStage;
  const ignoreBurn = ignoreBoosts;

  let attack = getAttackStat(attacker, move.type, ignoreBoosts, ignoreBurn);
  let effectiveDefense = getDefenseStat(defender, move.type, ignoreBoosts);

  // Explosion and Self-Destruct halve the defender's defense stat before damage calc
  if (move.id === "explosion" || move.id === "self-destruct") {
    effectiveDefense = Math.max(1, Math.floor(effectiveDefense / 2));
  }

  // Gen 2 stat overflow: if either stat >= 256, both wrap around
  if (attack >= 256 || effectiveDefense >= 256) {
    attack = Math.max(1, Math.floor(attack / 4) % 256);
    effectiveDefense = Math.max(1, Math.floor(effectiveDefense / 4) % 256);
  }

  // Step 1: Base damage (no +2 yet)
  // floor(floor((floor(2*Level/5)+2) * Power * A) / D) / 50)
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor(levelFactor * power * attack) / effectiveDefense);
  baseDamage = Math.floor(baseDamage / 50);

  // Step 2: Item modifier (type-boosting items at 1.1x) — BEFORE crit
  // Source: pret/pokecrystal engine/battle/effect_commands.asm:2983 — items applied before crit
  const itemMod = getItemModifier(attacker, move.type);
  if (itemMod !== 1) {
    baseDamage = Math.floor(baseDamage * itemMod);
  }

  // Step 3: Critical hit doubles damage in Gen 2 — AFTER items
  // Source: pret/pokecrystal engine/battle/effect_commands.asm:3023 — crit applied after items
  if (isCrit) {
    baseDamage = Math.floor(baseDamage * 2);
  }

  // Step 4: Clamp to [1, 997]
  baseDamage = Math.max(1, Math.min(997, baseDamage));

  // Step 5: Add the +2 constant
  baseDamage += 2;

  // Step 6: Weather modifier — BEFORE STAB
  // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab:1270 — weather before STAB
  const weather = state.weather?.type ?? null;
  const weatherMod = weather ? getWeatherDamageModifier(move.type, weather) : 1;
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // Step 7: STAB — AFTER weather
  // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab:1251+
  const stabMod = getStabModifier(move.type, attacker.types);
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // Step 8: Type effectiveness — applied sequentially with floor per type
  // Source: pret/pokecrystal engine/battle/effect_commands.asm — sequential application
  const defenderTypes = defender.types;
  let effectiveness = 1;

  // Check immunity first (a 0x interaction means 0 total damage)
  let isImmune = false;
  for (const defType of defenderTypes) {
    const factor = typeChart[move.type]?.[defType] ?? 1;
    if (factor === 0) {
      isImmune = true;
      break;
    }
    effectiveness *= factor;
  }

  if (isImmune) {
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor: 1,
    };
  }

  // Apply each defender type's multiplier sequentially with floor after each step
  for (const defType of defenderTypes) {
    const factor = typeChart[move.type]?.[defType] ?? 1;
    if (factor === 2) {
      // SE: floor(damage * 20 / 10) = floor(damage * 2)
      baseDamage = Math.floor((baseDamage * 20) / 10);
    } else if (factor === 0.5) {
      // NVE: floor(damage * 5 / 10)
      baseDamage = Math.floor((baseDamage * 5) / 10);
    }
    // factor === 1: no change
  }

  // Step 9: Random factor (217-255) / 255
  const randomRoll = rng.int(217, 255);
  const randomFactor = randomRoll / 255;
  let finalDamage = Math.floor(baseDamage * randomFactor);

  // Minimum 1 damage
  finalDamage = Math.max(1, finalDamage);

  const breakdown: DamageBreakdown = {
    baseDamage: Math.floor(Math.floor(levelFactor * power * attack) / effectiveDefense / 50) + 2,
    weatherMultiplier: weatherMod,
    critMultiplier: isCrit ? 2 : 1,
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier: physical && attacker.pokemon.status === "burn" && !ignoreBurn ? 0.5 : 1,
    abilityMultiplier: 1, // No abilities in Gen 2
    itemMultiplier: itemMod,
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
