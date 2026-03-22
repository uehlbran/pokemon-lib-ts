import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { PokemonSpeciesData, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { getGen12StatStageRatio, getStabModifier } from "@pokemon-lib-ts/core";

import { getWeatherDamageModifier } from "./Gen2Weather";

/**
 * Gen 2 Hidden Power type/power lookup table.
 * Source: Bulbapedia — "Hidden Power (move)/Generation II"
 * Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
 *
 * Type index = (AtkDV % 2) * 8 + (DefDV % 2) * 4 + (SpeDV % 2) * 2 + (SpcDV % 2)
 * Power = floor(((bit3Atk*32 + bit3Def*16 + bit3Spe*8 + bit3Spc*4 + bit2Atk*2 + bit2Def) * 40) / 63) + 31
 *
 * In Gen 2 "Spc" DV is the unified special DV — the same value used for both SpAtk and SpDef.
 * In our data model, `ivs.spAttack` holds this value (0-15 DV range).
 */
const HP_TYPES: readonly PokemonType[] = [
  "fighting",
  "flying",
  "poison",
  "ground",
  "rock",
  "bug",
  "ghost",
  "steel",
  "fire",
  "water",
  "grass",
  "electric",
  "psychic",
  "ice",
  "dragon",
  "dark",
];

/**
 * Calculate Hidden Power's type and base power from the attacker's DVs (Gen 2).
 *
 * Source: Bulbapedia — "Hidden Power (move)/Generation II"
 * Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
 *
 * Type range: one of 16 types (Fighting through Dark — excludes Normal)
 * Power range: 31 to 70
 */
export function calculateGen2HiddenPower(attacker: ActivePokemon): {
  type: PokemonType;
  power: number;
} {
  const ivs = attacker.pokemon.ivs;
  // In Gen 2, IVs are stored as 0-15 DVs; spAttack holds the unified Special DV
  const atkDv = ivs.attack ?? 15;
  const defDv = ivs.defense ?? 15;
  const speDv = ivs.speed ?? 15;
  // In Gen 2 the special DV applies to both SpAtk and SpDef; we read spAttack as the canonical source
  const spcDv = ivs.spAttack ?? 15;

  // Type calculation: uses low bit of each DV
  const typeIndex = (atkDv % 2) * 8 + (defDv % 2) * 4 + (speDv % 2) * 2 + (spcDv % 2);
  const hpType = HP_TYPES[typeIndex] ?? "fighting";

  // Power calculation: uses bits 3 and 2 (counting from bit 0) of each DV
  // bit3X = (DV >> 3) & 1  (the 4th bit, value 8)
  // bit2X = (DV >> 2) & 1  (the 3rd bit, value 4)
  const bit3Atk = (atkDv >> 3) & 1;
  const bit3Def = (defDv >> 3) & 1;
  const bit3Spe = (speDv >> 3) & 1;
  const bit3Spc = (spcDv >> 3) & 1;
  const bit2Atk = (atkDv >> 2) & 1;
  const bit2Def = (defDv >> 2) & 1;

  const powerBits = bit3Atk * 32 + bit3Def * 16 + bit3Spe * 8 + bit3Spc * 4 + bit2Atk * 2 + bit2Def;
  // Source: Bulbapedia — "The base power can range between 31 and 70"
  // The raw formula gives 71 at max DVs (powerBits=63), so cap at 70.
  const hpPower = Math.min(70, Math.floor((powerBits * 40) / 63) + 31);

  return { type: hpType, power: hpPower };
}

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
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer table (num/den), not float
    const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
    const ratio = getGen12StatStageRatio(stage);
    effective = Math.floor((baseStat * ratio.num) / ratio.den);
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
    // Source: pret/pokecrystal data/battle/stat_multipliers.asm — integer table (num/den), not float
    const stage = physical ? defender.statStages.defense : defender.statStages.spDefense;
    const ratio = getGen12StatStageRatio(stage);
    effective = Math.floor((baseStat * ratio.num) / ratio.den);
  }

  // Metal Powder doubles Ditto's (132) Defense only (not SpDefense)
  // Source: pret/pokecrystal src/engine/battle/Items.asm — GetItemStatBoost applies to physical Defense only
  // Metal Powder only works if Ditto has NOT Transformed — the boost is for untransformed Ditto only.
  // Source: pret/pokecrystal engine/battle/core.asm — Metal Powder check skips if SUBSTATUS_TRANSFORMED
  if (
    physical &&
    defender.pokemon.heldItem === "metal-powder" &&
    defender.pokemon.speciesId === 132 &&
    !defender.transformed
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
 * Get Rollout dynamic power based on the current turn counter.
 * Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
 * Power = 30 * 2^turnCount. Defense Curl doubles the base (not implemented yet).
 * turnCount: 0-4 (turn 1 through turn 5).
 */
export function getRolloutPower(attacker: ActivePokemon): number {
  const rolloutState = attacker.volatileStatuses.get("rollout");
  const turnCount = rolloutState ? ((rolloutState.data?.count as number) ?? 0) : 0;
  // Source: pret/pokecrystal — Rollout power doubles each turn: 30, 60, 120, 240, 480
  // Defense Curl doubles the base power (not tracked yet — TODO)
  const basePower = 30;
  return basePower * 2 ** turnCount;
}

/**
 * Get Fury Cutter dynamic power based on consecutive use counter.
 * Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
 * Power = 10 * 2^min(consecutiveUses, 4) -> 10, 20, 40, 80, 160
 */
export function getFuryCutterPower(attacker: ActivePokemon): number {
  const furyCutterState = attacker.volatileStatuses.get("fury-cutter");
  const count = furyCutterState ? ((furyCutterState.data?.count as number) ?? 0) : 0;
  // Source: pret/pokecrystal — Fury Cutter power: 10 * 2^count, max 160
  return 10 * 2 ** Math.min(count, 4);
}

/**
 * Calculate damage for a move in Gen 2.
 *
 * Formula per pret/pokecrystal BattleCommand_DamageCalc (effect_commands.asm:2900-3129):
 *   1. levelFactor = floor(2*level/5) + 2 (level is NEVER doubled for crits)
 *      baseDamage = floor(floor(floor(levelFactor * P * A) / D) / 50)
 *   2. Item modifier (type-boost items at 1.1x) — line 2983
 *   3. Crit: baseDamage *= 2 (lines 3108-3129 .CriticalMultiplier: sla = *2)
 *   4. Clamp: max(1, min(997, baseDamage))
 *   5. + 2
 *   6. Weather: water+rain/fire+sun → floor(* 1.5); opposite → floor(/ 2) — BattleCommand_Stab:1251
 *   7. STAB: += floor(damage / 2) — per BattleCommand_Stab:1270-1285
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

  // Return/Frustration: base power determined by friendship
  // Source: pret/pokecrystal engine/battle/effect_commands.asm ReturnEffect/FrustrationEffect
  // Return: floor(friendship / 2.5), minimum 1
  // Frustration: floor((255 - friendship) / 2.5), minimum 1
  let dynamicPower: number | null = move.power;
  if (move.id === "return") {
    const friendship = attacker.pokemon.friendship ?? 70;
    dynamicPower = Math.max(1, Math.floor(friendship / 2.5));
  } else if (move.id === "frustration") {
    const friendship = attacker.pokemon.friendship ?? 70;
    dynamicPower = Math.max(1, Math.floor((255 - friendship) / 2.5));
  }

  // Hidden Power: calculate type and power from DVs before any early returns.
  // Source: Bulbapedia — "Hidden Power (move)/Generation II"
  // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
  let effectiveMoveType = move.type;
  if (move.id === "hidden-power") {
    const hp = calculateGen2HiddenPower(attacker);
    effectiveMoveType = hp.type;
    dynamicPower = hp.power;
  }

  // SolarBeam: halve power in rain and sandstorm
  // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
  // In rain or sandstorm, SolarBeam deals half damage (power is halved).
  if (move.id === "solar-beam") {
    const currentWeather = state.weather?.type ?? null;
    if (currentWeather === "rain" || currentWeather === "sand") {
      dynamicPower = dynamicPower !== null ? Math.max(1, Math.floor(dynamicPower / 2)) : null;
    }
  }

  // Rollout: escalating power based on consecutive turn count
  // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
  if (move.id === "rollout") {
    dynamicPower = getRolloutPower(attacker);
  }

  // Fury Cutter: escalating power based on consecutive use count
  // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
  if (move.id === "fury-cutter") {
    dynamicPower = getFuryCutterPower(attacker);
  }

  // Magnitude: random power based on magnitude level 4-10.
  // Source: pret/pokecrystal engine/battle/effect_commands.asm MagnitudeEffect
  // Magnitudes 4-10, probabilities on 0-255 scale:
  //   4: 13/256 (~5%), 5: 25/256 (~10%), 6: 51/256 (~20%),
  //   7: 77/256 (~30%), 8: 51/256 (~20%), 9: 25/256 (~10%), 10: 14/256 (~5%)
  // Moving the roll here (not in the effect handler) ensures the power is used
  // as a BASE POWER in the standard damage formula, not as a flat HP amount.
  if (move.id === "magnitude") {
    const magRoll = rng.int(0, 255);
    if (magRoll < 13) {
      dynamicPower = 10;
    } else if (magRoll < 38) {
      dynamicPower = 30;
    } else if (magRoll < 89) {
      dynamicPower = 50;
    } else if (magRoll < 166) {
      dynamicPower = 70;
    } else if (magRoll < 217) {
      dynamicPower = 90;
    } else if (magRoll < 242) {
      dynamicPower = 110;
    } else {
      dynamicPower = 150;
    }
    // Note: magnitude level for the "Magnitude N!" message is not available here.
    // The effect handler emits a generic message; per-level message tracking
    // requires engine support (or storing level in volatile state).
  }

  // Present: randomly deals 40/80/120 base power or heals the target for 1/4 max HP.
  // Source: pret/pokecrystal engine/battle/effect_commands.asm PresentEffect
  // Roll 0-255: 0-101 (40%) -> power 40; 102-177 (30%) -> power 80;
  //             178-203 (10%) -> power 120; 204-255 (20%) -> heal 1/4 HP
  // The roll is done here so 40/80/120 are used as BASE POWER in the standard formula.
  // For the heal case (20%): dynamicPower is set to -1 as a sentinel; the check below
  // returns 0 damage. The actual HP restoration requires engine support
  // (MoveEffectResult.healDefender) — tracked in issue #526.
  if (move.id === "present") {
    const presentRoll = rng.int(0, 255);
    if (presentRoll < 102) {
      dynamicPower = 40;
    } else if (presentRoll < 178) {
      dynamicPower = 80;
    } else if (presentRoll < 204) {
      dynamicPower = 120;
    } else {
      // Heal case (204-255 = 52/256 ≈ 20.3%): no damage dealt.
      // Present heal (1/4 max HP to defender) is not applied — see issue #526.
      dynamicPower = -1;
    }
  }

  // Sentinel -1 means "this move produced no damage" (e.g., Present heal case)
  if (dynamicPower === -1) {
    return {
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      randomFactor: 1,
    };
  }

  // Status moves do no damage
  if (move.category === "status" || dynamicPower === null || dynamicPower === 0) {
    return {
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      randomFactor: 1,
    };
  }

  const level = attacker.pokemon.level;
  const power = dynamicPower;

  // Determine crit boost interaction (Showdown scripts.ts:589-600)
  const physical = isGen2PhysicalType(effectiveMoveType);
  const atkStage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;
  const defStage = physical ? defender.statStages.defense : defender.statStages.spDefense;
  // When atkStage <= defStage on a crit: ignore ALL boosts on both sides AND ignore burn
  const ignoreBoosts = isCrit && atkStage <= defStage;
  const ignoreBurn = ignoreBoosts;

  let attack = getAttackStat(attacker, effectiveMoveType, ignoreBoosts, ignoreBurn);
  let effectiveDefense = getDefenseStat(defender, effectiveMoveType, ignoreBoosts);

  // Reflect/Light Screen doubles the defense stat (crits bypass screens)
  // Source: pret/pokecrystal engine/battle/effect_commands.asm:2553-2557 — sla c; rl b doubles
  // defense BEFORE the crit check. Crits re-read base stats, so they bypass screen doubling.
  // In our implementation, ignoreBoosts=true already uses base stats (bypassing screens).
  if (!isCrit) {
    const defenderSide = state.sides?.find((s) =>
      s.active.some((a) => a?.pokemon === defender.pokemon),
    );
    if (defenderSide) {
      const isPhysical = isGen2PhysicalType(effectiveMoveType);
      const hasReflect = isPhysical && defenderSide.screens.some((s) => s.type === "reflect");
      const hasLightScreen =
        !isPhysical && defenderSide.screens.some((s) => s.type === "light-screen");
      if (hasReflect || hasLightScreen) {
        effectiveDefense = effectiveDefense * 2;
      }
    }
  }

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
  // Source: pret/pokecrystal engine/battle/effect_commands.asm lines 2943-2961
  //   Level is NEVER doubled for crits in Gen 2 (that's Gen 1 behavior).
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor(levelFactor * power * attack) / effectiveDefense);
  baseDamage = Math.floor(baseDamage / 50);

  // Step 2: Item modifier (type-boosting items at 1.1x)
  // Source: pret/pokecrystal engine/battle/effect_commands.asm:2983 — items applied in modifier chain
  const itemMod = getItemModifier(attacker, effectiveMoveType);
  if (itemMod !== 1) {
    baseDamage = Math.floor(baseDamage * itemMod);
  }

  // Step 3: Critical hit 2x multiplier — applied AFTER item boost, BEFORE clamp
  // Source: pret/pokecrystal engine/battle/effect_commands.asm lines 3108-3129
  //   .CriticalMultiplier: sla [hl] (shift left = *2) if wCriticalHit is set.
  //   Gen 2 does NOT double the level (that's Gen 1). It applies a flat 2x to the damage.
  if (isCrit) {
    baseDamage = baseDamage * 2;
  }

  // Step 4: Clamp to [1, 997]
  baseDamage = Math.max(1, Math.min(997, baseDamage));

  // Step 5: Add the +2 constant
  baseDamage += 2;

  // Step 6: Weather modifier — applied BEFORE STAB
  // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
  //   Line 1251: farcall DoWeatherModifiers — weather runs FIRST
  const weather = state.weather?.type ?? null;
  const weatherMod = weather ? getWeatherDamageModifier(effectiveMoveType, weather) : 1;
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // Step 7: STAB — applied AFTER weather
  // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
  //   Lines 1270-1285: STAB addition runs AFTER weather modifiers
  const stabMod = getStabModifier(effectiveMoveType, attacker.types);
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
    const factor = typeChart[effectiveMoveType]?.[defType] ?? 1;
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
    const factor = typeChart[effectiveMoveType]?.[defType] ?? 1;
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
  // Source: pret/pokecrystal engine/battle/core.asm — integer multiply then divide by 255
  // Must use integer-only arithmetic: floor((baseDamage * roll) / 255)
  // The float path floor(baseDamage * (roll / 255)) diverges at boundary values due to IEEE 754
  const randomRoll = rng.int(217, 255);
  const randomFactor = randomRoll / 255; // kept for DamageBreakdown.randomMultiplier display only
  let finalDamage = Math.floor((baseDamage * randomRoll) / 255);

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

  // Gen 2 physical types for category determination
  // Source: pret/pokecrystal — physical/special split is by type in Gen 2
  const GEN2_PHYSICAL_SET = new Set([
    "normal",
    "fighting",
    "flying",
    "ground",
    "rock",
    "bug",
    "ghost",
    "poison",
    "steel",
  ]);

  return {
    damage: finalDamage,
    effectiveness,
    isCrit,
    randomFactor,
    breakdown,
    // Propagate effective type/category when they differ from the move's declared values
    // (Hidden Power computes type from DVs; category is derived from the computed type)
    effectiveType: effectiveMoveType !== move.type ? effectiveMoveType : undefined,
    effectiveCategory:
      move.id === "hidden-power"
        ? GEN2_PHYSICAL_SET.has(effectiveMoveType)
          ? "physical"
          : "special"
        : undefined,
  };
}
