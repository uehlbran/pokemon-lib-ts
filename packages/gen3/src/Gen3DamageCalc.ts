import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
  getWeatherDamageModifier,
} from "@pokemon-lib-ts/core";

/**
 * Physical types in Gen 3.
 * In Gen 3 (like Gen 1-2), the category (physical/special) is determined by the move's TYPE,
 * not by a per-move flag. The physical/special split based on individual moves was introduced in Gen 4.
 *
 * Physical: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel
 * Special:  Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark
 *
 * Source: pret/pokeemerald src/data/battle/type_effectiveness.h — TYPE_IS_PHYSICAL macro
 */
const GEN3_PHYSICAL_TYPES: ReadonlySet<string> = new Set([
  "normal",
  "fighting",
  "flying",
  "poison",
  "ground",
  "rock",
  "bug",
  "ghost",
  "steel",
]);

/**
 * Determine whether a move type is physical or special in Gen 3.
 * Same categorization as Gen 1-2 (with Steel added in Gen 2).
 *
 * Source: pret/pokeemerald — TYPE_IS_PHYSICAL check
 */
export function isGen3PhysicalType(type: PokemonType): boolean {
  return GEN3_PHYSICAL_TYPES.has(type);
}

/**
 * Get the effective attack stat for a move in Gen 3.
 * Physical types use Attack; special types use SpAttack.
 *
 * On a critical hit:
 *   - Ignore NEGATIVE attacker attack stages (treat as stage 0)
 *   - Keep POSITIVE attacker attack stages
 *
 * Source: pret/pokeemerald src/battle_util.c CalculateBaseDamage
 */
function getAttackStat(attacker: ActivePokemon, moveType: PokemonType, isCrit: boolean): number {
  const physical = isGen3PhysicalType(moveType);
  const statKey = physical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;
  const baseStat = stats ? stats[statKey] : 100;

  // Get the appropriate stage
  const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;

  // On crit: ignore negative attack stages (use 0 instead)
  // Source: pret/pokeemerald — crit ignores negative atk stages only
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  let effective = Math.floor(baseStat * getStatStageMultiplier(effectiveStage));

  // Burn halves physical attack
  // Source: pret/pokeemerald src/battle_util.c — burn reduces physical attack by half
  if (physical && attacker.pokemon.status === "burn") {
    effective = Math.floor(effective / 2);
  }

  return Math.max(1, effective);
}

/**
 * Get the effective defense stat for a move in Gen 3.
 * Physical types use Defense; special types use SpDefense.
 *
 * On a critical hit:
 *   - Ignore POSITIVE defender defense stages (treat as stage 0)
 *   - Keep NEGATIVE defender defense stages
 *
 * Source: pret/pokeemerald src/battle_util.c CalculateBaseDamage
 */
function getDefenseStat(defender: ActivePokemon, moveType: PokemonType, isCrit: boolean): number {
  const physical = isGen3PhysicalType(moveType);
  const statKey = physical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;
  const baseStat = stats ? stats[statKey] : 100;

  // Get the appropriate stage
  const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;

  // On crit: ignore positive defense stages (use 0 instead)
  // Source: pret/pokeemerald — crit ignores positive def stages only
  const effectiveStage = isCrit && stage > 0 ? 0 : stage;

  const effective = Math.floor(baseStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

/**
 * Calculate damage for a move in Gen 3.
 *
 * Formula per pret/pokeemerald src/battle_script_commands.c:
 *
 *   Step 1: BaseDamage = floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2
 *
 *   Step 2: Modifier chain (applied in this order per pokeemerald):
 *     1. Targets — 0.5x if spread move hitting multiple targets (doubles)
 *     2. Weather — rain: Water 1.5x / Fire 0.5x; sun: Fire 1.5x / Water 0.5x
 *     3. Critical hit — 2.0x
 *     4. Random factor — integer from 85–100 inclusive, / 100
 *     5. STAB — 1.5x if move type matches attacker's type
 *     6. Type effectiveness — product of matchups for each defender type
 *     7. Burn penalty — already folded into attack stat above (not applied here)
 *
 * Note: Burn is applied to the attack stat (Step 1), not as a separate modifier.
 * This matches pokeemerald where burn halves attack before the damage formula runs.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c Cmd_calculateDamage + Cmd_adjustnormaldamage
 */
export function calculateGen3Damage(context: DamageContext, typeChart: TypeChart): DamageResult {
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
  const physical = isGen3PhysicalType(move.type);

  // Get effective stats (with crit stage ignoring and burn applied)
  const attack = getAttackStat(attacker, move.type, isCrit);
  const defense = getDefenseStat(defender, move.type, isCrit);

  // Step 1: Base damage
  // Source: pret/pokeemerald — floor(floor(floor(2*Level/5+2) * Power * Atk/Def) / 50) + 2
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50) + 2;

  // Record the base damage before modifiers for breakdown
  const rawBaseDamage = baseDamage;

  // Step 2: Modifier chain

  // 2.1: Targets — skip for now (doubles not yet supported in Phase 2)
  // TODO: Phase 6+ — if context.targetCount > 1, apply 0.5x

  // 2.2: Weather modifier
  // Source: pret/pokeemerald — rain/sun modify fire/water damage
  const weather = context.state.weather?.type ?? null;
  const weatherMod = getWeatherDamageModifier(move.type, weather);
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // 2.3: Critical hit — 2.0x in Gen 3
  // Source: pret/pokeemerald — crit doubles damage
  if (isCrit) {
    baseDamage = baseDamage * 2;
  }

  // 2.4: Random factor — integer from 85 to 100 inclusive, divided by 100
  // Source: pret/pokeemerald — RandomPercentage range 85-100
  const randomRoll = rng.int(85, 100);
  const randomFactor = randomRoll / 100;
  baseDamage = Math.floor(baseDamage * randomFactor);

  // 2.5: STAB (Same Type Attack Bonus)
  // Source: pret/pokeemerald — 1.5x if move type matches attacker type
  const stabMod = getStabModifier(move.type, attacker.types);
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // 2.6: Type effectiveness
  // Source: pret/pokeemerald — product of matchups for each defender type
  const effectiveness = getTypeEffectiveness(move.type, defender.types, typeChart);

  if (effectiveness === 0) {
    // Type immunity — return 0 damage
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor,
      breakdown: {
        baseDamage: rawBaseDamage,
        weatherMultiplier: weatherMod,
        critMultiplier: isCrit ? 2 : 1,
        randomMultiplier: randomFactor,
        stabMultiplier: stabMod,
        typeMultiplier: 0,
        burnMultiplier: physical && attacker.pokemon.status === "burn" ? 0.5 : 1,
        abilityMultiplier: 1,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // Apply type effectiveness as a multiplier
  // For non-integer multipliers (0.25, 0.5, 2, 4), apply with floor
  baseDamage = Math.floor(baseDamage * effectiveness);

  // Minimum 1 damage (unless type immune, which returns 0 above)
  const finalDamage = Math.max(1, baseDamage);

  const breakdown: DamageBreakdown = {
    baseDamage: rawBaseDamage,
    weatherMultiplier: weatherMod,
    critMultiplier: isCrit ? 2 : 1,
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier: physical && attacker.pokemon.status === "burn" ? 0.5 : 1,
    abilityMultiplier: 1, // Phase 6+
    itemMultiplier: 1, // Phase 7+
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
