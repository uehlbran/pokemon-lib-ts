import type {
  ActivePokemon,
  BattleState,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonSpeciesData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  getGen12StatStageRatio,
  getStabModifier,
  getTypeEffectiveness,
} from "@pokemon-lib-ts/core";

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
export function isGen1PhysicalType(moveType: PokemonType): boolean {
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
  _species: PokemonSpeciesData,
): number {
  const physical = isGen1PhysicalType(moveType);
  const statKey = physical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;

  if (isCrit) {
    // Source: pret/pokered engine/battle/core.asm:4060-4071 GetDamageVarsForPlayerAttack
    // On critical hits, loads from wPartyMon1Attack (unmodified party data), not wBattleMonAttack
    // (which has burn halving applied). Therefore burn does NOT affect crits in Gen 1.
    // Critical hits use the unmodified stat (ignore stat stages AND burn).
    const baseStat = stats ? stats[statKey] : 100;
    return baseStat;
  }

  const baseStat = stats ? stats[statKey] : 100;
  const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
  // Source: pret/pokered data/battle/stat_modifiers.asm — integer table (num/den), not float approximation
  // e.g. stage -1: 66/100 (integer) vs 2/3 (float). floor(150*66/100)=99 vs floor(150*0.6667)=100.
  const ratio = getGen12StatStageRatio(stage);
  let effective = Math.floor((baseStat * ratio.num) / ratio.den);

  // Burn halves physical attack
  if (physical && attacker.pokemon.status === "burn") {
    effective = Math.floor(effective / 2);
  }

  return Math.max(1, effective);
}

/**
 * Find the BattleSide that contains the given ActivePokemon.
 * Returns the side or undefined if not found (gracefully handles missing/empty state).
 */
function findSideForPokemon(
  state: BattleState,
  pokemon: ActivePokemon,
): BattleState["sides"][number] | undefined {
  if (!state?.sides) return undefined;
  return state.sides.find((side) => side.active.includes(pokemon));
}

/**
 * Get the effective defense stat for a move in Gen 1.
 * Physical types use Defense; special types use SpDefense (which equals Special).
 *
 * Source: gen1-ground-truth.md §7 — Reflect / Light Screen
 * Reflect doubles Defense for physical moves; Light Screen doubles SpDefense for special moves.
 * Both are ignored on critical hits.
 */
function getDefenseStat(
  defender: ActivePokemon,
  moveType: PokemonType,
  isCrit: boolean,
  state: BattleState,
): number {
  const physical = isGen1PhysicalType(moveType);
  const statKey = physical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;

  if (isCrit) {
    // Source: gen1-ground-truth.md §3 — Crit ignores ALL stat stages, Reflect, Light Screen
    return Math.max(1, stats ? stats[statKey] : 100);
  }

  const baseStat = stats ? stats[statKey] : 100;
  const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;
  // Source: pret/pokered data/battle/stat_modifiers.asm — integer table (num/den), not float approximation
  const defRatio = getGen12StatStageRatio(stage);
  let effective = Math.max(1, Math.floor((baseStat * defRatio.num) / defRatio.den));

  // Source: gen1-ground-truth.md §7 — Reflect / Light Screen doubles the relevant defense stat
  const defenderSide = findSideForPokemon(state, defender);
  if (defenderSide) {
    const screenType = physical ? "reflect" : "light-screen";
    const hasScreen = defenderSide.screens.some((s) => s.type === screenType);
    if (hasScreen) {
      effective *= 2;
    }
  }

  return Math.max(1, effective);
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
  const { attacker, defender, move, rng, isCrit, state } = context;

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

  let attack = getAttackStat(attacker, move.type, isCrit, attackerSpecies);
  let defense = getDefenseStat(defender, move.type, isCrit, state);

  // Gen 1 stat overflow bug: when either attack or defense >= 256,
  // both are divided by 4 and taken mod 256 (Showdown scripts.ts:848-860)
  if (attack >= 256 || defense >= 256) {
    attack = Math.max(1, Math.floor(attack / 4) % 256);
    defense = Math.floor(defense / 4) % 256;
    if (defense === 0) defense = 1;
  }

  // Explosion / Self-Destruct: halve the target's Defense in the damage calc
  // (Showdown scripts.ts:863, applies after overflow check)
  if (isGen1PhysicalType(move.type) && (move.id === "explosion" || move.id === "self-destruct")) {
    defense = Math.max(1, Math.floor(defense / 2));
  }

  // Step 1: Base damage calculation with nested floors
  // floor(floor(floor((2*Level/5 + 2) * Power * A) / D) / 50) + 2
  // In Gen 1, critical hits double the attacker's level in the formula (not a 2x multiplier)
  const effectiveLevel = isCrit ? level * 2 : level;
  const levelFactor = Math.floor((2 * effectiveLevel) / 5) + 2;
  let baseDamage = Math.floor(Math.floor(levelFactor * power * attack) / defense);
  // Damage is capped at 997 before adding the +2 constant (Showdown scripts.ts)
  baseDamage = Math.min(997, Math.floor(baseDamage / 50)) + 2;

  // Step 2: STAB
  const stabMod = getStabModifier(move.type, attacker.types);
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // Step 3: Type effectiveness — applied sequentially per defender type with floor between each
  // Source: gen1-ground-truth.md §3 — Type effectiveness applied sequentially for dual types.
  // Each type multiplier is applied one at a time with Math.floor() between each.
  // e.g. 2x vs Water AND 2x vs Rock = floor(damage * 2) then floor(result * 2), not floor(damage * 4).
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

  // Apply effectiveness per type sequentially with floor after each type.
  // Source: gen1-ground-truth.md §3 — Type effectiveness: Applied sequentially for dual types.
  // Standard chart values: 2x or 0.5x per individual type interaction.
  // Gen 1 integer math: 2x = floor(damage * 20 / 10), 0.5x = floor(damage * 5 / 10).
  // Each factor is floored individually before applying the next.
  for (const defType of defender.types) {
    const factor = typeChart[move.type]?.[defType] ?? 1;
    if (factor === 0) {
      baseDamage = 0;
    } else if (factor === 0.5) {
      baseDamage = Math.floor((baseDamage * 5) / 10);
    } else if (factor === 2) {
      baseDamage = Math.floor((baseDamage * 20) / 10);
    } else if (factor !== 1) {
      // Non-standard chart value (e.g. 4x in a custom test chart): apply with floor
      baseDamage = Math.floor(baseDamage * factor);
    }
    // factor === 1: no-op
  }

  // Source: pret/pokered engine/battle/core.asm lines ~5171-5176 — non-immune moves deal minimum 1 damage
  // After type effectiveness, if damage rounded to 0 but the move is not immune, set to 1.
  if (baseDamage === 0) {
    baseDamage = 1;
  }

  // Step 4: Random factor (217-255) / 255
  // In Gen 1, the random factor ranges from 217 to 255 (inclusive), then divided by 255
  // Integer math: avoid float intermediate that could cause rounding differences
  const randomRoll = rng.int(217, 255);
  const randomFactor = randomRoll / 255; // keep for DamageBreakdown.randomMultiplier only
  const finalDamage = Math.max(1, Math.floor((baseDamage * randomRoll) / 255));

  const breakdown: DamageBreakdown = {
    baseDamage:
      Math.min(997, Math.floor(Math.floor(levelFactor * power * attack) / defense / 50)) + 2,
    weatherMultiplier: 1,
    critMultiplier: 1, // Crit handled via level doubling in levelFactor, not a separate multiplier
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier:
      isGen1PhysicalType(move.type) && attacker.pokemon.status === "burn" && !isCrit ? 0.5 : 1,
    abilityMultiplier: 1,
    itemMultiplier: 1,
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
