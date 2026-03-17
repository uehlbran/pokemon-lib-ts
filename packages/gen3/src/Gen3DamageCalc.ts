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
import { TYPE_BOOST_ITEMS } from "./Gen3Items";

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
 * Ability modifiers applied to the attack stat:
 *   - Huge Power / Pure Power: Atk x2 (physical only)
 *   - Hustle: Atk x1.5 (physical only)
 *   - Guts: Atk x1.5 when statused (physical only), cancels burn penalty
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

  const ability = attacker.ability;

  // Huge Power / Pure Power: doubles physical attack
  // Source: pret/pokeemerald ABILITY_HUGE_POWER / ABILITY_PURE_POWER — doubles physical attack
  if (physical && (ability === "huge-power" || ability === "pure-power")) {
    effective = effective * 2;
  }

  // Hustle: 1.5x physical attack (accuracy penalty handled by engine)
  // Source: pret/pokeemerald ABILITY_HUSTLE — boosts physical attack by 50%
  if (physical && ability === "hustle") {
    effective = Math.floor(effective * 1.5);
  }

  // Guts: 1.5x physical attack when statused, AND cancels burn penalty
  // Source: pret/pokeemerald ABILITY_GUTS — boosts attack by 50% when statused, negates burn penalty
  if (physical && ability === "guts" && attacker.pokemon.status !== null) {
    effective = Math.floor(effective * 1.5);
    // Guts cancels the burn attack penalty — skip the burn halving below
  } else if (physical && attacker.pokemon.status === "burn") {
    // Burn halves physical attack (only when Guts is NOT active)
    // Source: pret/pokeemerald src/battle_util.c — burn reduces physical attack by half
    effective = Math.floor(effective / 2);
  }

  // Choice Band: 1.5x physical attack
  // Source: pret/pokeemerald HOLD_EFFECT_CHOICE_BAND — multiplies Attack by 1.5
  // Only affects physical moves (Choice Band only boosts Attack, not SpAtk)
  if (physical && attacker.pokemon.heldItem === "choice-band") {
    effective = Math.floor(effective * 1.5);
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
  const defenderAbility = defender.ability;

  // --- Defender ability type immunities ---
  // These abilities grant full immunity to specific move types.
  // They are checked BEFORE the damage formula runs, and return 0 damage with effectiveness 0.
  // Source: pret/pokeemerald — these abilities nullify damage and set type effectiveness to 0

  // Levitate: immune to ground-type moves
  // Source: pret/pokeemerald ABILITY_LEVITATE
  if (defenderAbility === "levitate" && move.type === "ground") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Volt Absorb: immune to electric-type moves
  // Source: pret/pokeemerald ABILITY_VOLT_ABSORB
  if (defenderAbility === "volt-absorb" && move.type === "electric") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Water Absorb: immune to water-type moves
  // Source: pret/pokeemerald ABILITY_WATER_ABSORB
  if (defenderAbility === "water-absorb" && move.type === "water") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Flash Fire: immune to fire-type moves (boost tracking skipped for now)
  // Source: pret/pokeemerald ABILITY_FLASH_FIRE
  // NOTE: The boost to fire moves after absorbing one is a volatile state change, skip for now
  if (defenderAbility === "flash-fire" && move.type === "fire") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Get effective stats (with crit stage ignoring, burn, and ability modifiers applied)
  let attack = getAttackStat(attacker, move.type, isCrit);
  const defense = getDefenseStat(defender, move.type, isCrit);

  // Track ability multiplier for breakdown (set before the formula so it's captured correctly)
  let abilityMultiplier = 1;

  // Thick Fat: halves the attacker's effective SpAtk/Atk stat BEFORE the damage formula runs.
  // Source: pret/pokeemerald CalculateBaseDamage — modifies spAttack/attack before (2*L/5+2)*P*A/D
  // Note: halving the stat (with floor truncation inside the formula) differs from halving final
  // damage by 0–1 points at certain breakpoints; the pre-formula behavior matches pokeemerald.
  if (defenderAbility === "thick-fat" && (move.type === "fire" || move.type === "ice")) {
    attack = Math.floor(attack * 0.5);
    abilityMultiplier = 0.5;
  }

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

  // 2.5b: Type-boosting held items — 1.1x (10%) if item matches move type
  // Source: pret/pokeemerald HOLD_EFFECT_*_POWER — 10% boost for matching type
  // Applied after STAB, before type effectiveness (same position as Gen 2)
  let itemMultiplier = 1;
  const attackerItem = attacker.pokemon.heldItem;
  if (attackerItem && TYPE_BOOST_ITEMS[attackerItem] === move.type) {
    baseDamage = Math.floor(baseDamage * 1.1);
    itemMultiplier = 1.1;
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
        itemMultiplier,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // 2.6a: Wonder Guard — only super-effective moves hit
  // Source: pret/pokeemerald ABILITY_WONDER_GUARD — only 2x and 4x moves land
  // Blocks immune (0x), not-very-effective (0.5x/0.25x), and neutral (1x) moves.
  if (defenderAbility === "wonder-guard" && effectiveness < 2) {
    return {
      damage: 0,
      effectiveness,
      isCrit,
      randomFactor,
      breakdown: {
        baseDamage: rawBaseDamage,
        weatherMultiplier: weatherMod,
        critMultiplier: isCrit ? 2 : 1,
        randomMultiplier: randomFactor,
        stabMultiplier: stabMod,
        typeMultiplier: effectiveness,
        burnMultiplier: physical && attacker.pokemon.status === "burn" ? 0.5 : 1,
        abilityMultiplier: 0,
        itemMultiplier,
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

  // Calculate burn multiplier for breakdown
  // Guts negates burn penalty, so when Guts is active with burn, burnMultiplier = 1
  const attackerAbility = attacker.ability;
  const hasBurn = physical && attacker.pokemon.status === "burn";
  const gutsActive = attackerAbility === "guts" && attacker.pokemon.status !== null;
  const burnMultiplier = hasBurn && !gutsActive ? 0.5 : 1;

  const breakdown: DamageBreakdown = {
    baseDamage: rawBaseDamage,
    weatherMultiplier: weatherMod,
    critMultiplier: isCrit ? 2 : 1,
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier,
    abilityMultiplier,
    itemMultiplier,
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
