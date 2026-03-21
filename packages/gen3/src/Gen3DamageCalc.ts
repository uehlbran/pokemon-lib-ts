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
 * pokeemerald CalculateBaseDamage modifier order on the raw stat (BEFORE stat stages):
 *   1. Huge Power / Pure Power: Atk x2 (physical only)
 *   2. Badge boosts (in-game only, skipped)
 *   3. Type-boosting items applied to raw stat
 *   4. Choice Band applied to raw stat (physical only)
 *   5. Thick Fat, Hustle, Guts applied to raw stat
 *
 * Then stat stages are applied via APPLY_STAT_MOD, and the result feeds into
 * the base damage formula. Burn halving happens AFTER the formula (see calculateGen3Damage).
 *
 * On a critical hit:
 *   - Ignore NEGATIVE attacker attack stages (treat as stage 0)
 *   - Keep POSITIVE attacker attack stages
 *
 * Source: pret/pokeemerald src/pokemon.c:3106-3372 CalculateBaseDamage
 */
function getAttackStat(
  attacker: ActivePokemon,
  moveType: PokemonType,
  isCrit: boolean,
  typeBoostItemType: string | null,
): number {
  const physical = isGen3PhysicalType(moveType);
  const statKey = physical ? "attack" : "spAttack";
  const stats = attacker.pokemon.calculatedStats;
  let rawStat = stats ? stats[statKey] : 100;

  const ability = attacker.ability;

  // 1. Huge Power / Pure Power: doubles physical attack (applied to raw stat)
  // Source: pret/pokeemerald src/pokemon.c:3158-3159
  if (physical && (ability === "huge-power" || ability === "pure-power")) {
    rawStat = rawStat * 2;
  }

  // 2. Badge boosts (skipped — link/frontier battles only)

  // 3. Type-boosting held items: applied to raw attack/spAttack stat
  // Source: pret/pokeemerald src/pokemon.c:3170-3182 — sHoldEffectToType
  // (attack * (holdEffectParam + 100)) / 100 where holdEffectParam = 10
  if (typeBoostItemType === moveType) {
    rawStat = Math.floor((rawStat * 110) / 100);
  }

  // 4. Choice Band: 1.5x physical attack (applied to raw stat)
  // Source: pret/pokeemerald src/pokemon.c:3185-3186 — (150 * attack) / 100
  if (physical && attacker.pokemon.heldItem === "choice-band") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 4a. Species-specific held item boosts (applied to raw stat, after Choice Band)
  // Source: pret/pokeemerald src/pokemon.c CalculateBaseDamage
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;

  // Soul Dew: 1.5x SpAtk for Latias (380) / Latios (381)
  // Source: pret/pokeemerald HOLD_EFFECT_SOUL_DEW
  // Source: Bulbapedia — "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
  if (
    !physical &&
    attackerItem === "soul-dew" &&
    (attackerSpecies === 380 || attackerSpecies === 381)
  ) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: pret/pokeemerald HOLD_EFFECT_DEEP_SEA_TOOTH
  // Source: Bulbapedia — "When held by Clamperl, doubles its Special Attack."
  if (!physical && attackerItem === "deep-sea-tooth" && attackerSpecies === 366) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x SpAtk for Pikachu (25) — Gen 3 is SpAtk ONLY (Attack boost is Gen 4+)
  // Source: pret/pokeemerald HOLD_EFFECT_LIGHT_BALL
  // Source: Bulbapedia — "When held by Pikachu, doubles its Special Attack. (Generation III)"
  if (!physical && attackerItem === "light-ball" && attackerSpecies === 25) {
    rawStat = rawStat * 2;
  }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105)
  // Source: pret/pokeemerald HOLD_EFFECT_THICK_CLUB
  // Source: Bulbapedia — "When held by Cubone or Marowak, doubles the holder's Attack."
  if (
    physical &&
    attackerItem === "thick-club" &&
    (attackerSpecies === 104 || attackerSpecies === 105)
  ) {
    rawStat = rawStat * 2;
  }

  // 5. Hustle: 1.5x physical attack (accuracy penalty handled by engine)
  // Source: pret/pokeemerald src/pokemon.c:3205-3206 — (150 * attack) / 100
  if (physical && ability === "hustle") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // 6. Guts: 1.5x physical attack when statused (does NOT cancel burn penalty —
  //    burn halving is applied to damage after formula, and Guts negates that separately)
  // Source: pret/pokeemerald src/pokemon.c:3211-3212 — (150 * attack) / 100
  if (physical && ability === "guts" && attacker.pokemon.status !== null) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Now apply stat stages
  // Source: pret/pokeemerald src/pokemon.c:3232-3243 — APPLY_STAT_MOD
  const stage = physical ? attacker.statStages.attack : attacker.statStages.spAttack;

  // On crit: ignore negative attack stages (use 0 instead), keep positive
  // Source: pret/pokeemerald src/pokemon.c:3234-3240
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  const effective = Math.floor(rawStat * getStatStageMultiplier(effectiveStage));

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
  let baseStat = stats ? stats[statKey] : 100;

  // Species-specific held item boosts on defense side
  // Source: pret/pokeemerald src/pokemon.c CalculateBaseDamage
  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;

  // Soul Dew: 1.5x SpDef for Latias (380) / Latios (381)
  // Source: pret/pokeemerald HOLD_EFFECT_SOUL_DEW
  // Source: Bulbapedia — "Raises Latias's and Latios's Sp. Atk and Sp. Def by 50%."
  if (
    !physical &&
    defenderItem === "soul-dew" &&
    (defenderSpecies === 380 || defenderSpecies === 381)
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Deep Sea Scale: 2x SpDef for Clamperl (366)
  // Source: pret/pokeemerald HOLD_EFFECT_DEEP_SEA_SCALE
  // Source: Bulbapedia — "When held by Clamperl, doubles its Special Defense."
  if (!physical && defenderItem === "deep-sea-scale" && defenderSpecies === 366) {
    baseStat = baseStat * 2;
  }

  // Marvel Scale: 1.5x physical Defense when defender has a non-volatile status condition.
  // Only affects physical Defense, not SpDef.
  // Source: pret/pokeemerald src/pokemon.c ABILITY_MARVEL_SCALE
  // Source: Bulbapedia — "Marvel Scale: If the Pokemon has a status condition, its Defense
  //   stat is 1.5x."
  if (physical && defender.ability === "marvel-scale" && defender.pokemon.status !== null) {
    baseStat = Math.floor(baseStat * 1.5);
  }

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
 * Per pret/pokeemerald src/pokemon.c CalculateBaseDamage + src/battle_script_commands.c Cmd_damagecalc:
 *
 * CalculateBaseDamage (src/pokemon.c:3106-3372):
 *   1. Ability stat mods (Huge Power, Hustle, Guts) applied to raw stat
 *   2. Badge boosts (skipped — in-game only)
 *   3. Type-boosting items applied to raw stat
 *   4. Choice Band applied to raw stat
 *   5. Thick Fat halves attacker's stat
 *   6. Stat stages applied (APPLY_STAT_MOD)
 *   7. Base formula: damage = Atk * Power * (2*L/5+2) / Def / 50
 *   8. Burn halving (physical only, unless Guts): damage /= 2
 *   9. Reflect/Light Screen (non-crit only): damage /= 2
 *  10. Spread move penalty (doubles): damage /= 2
 *  11. Weather boosts (special types only in CalculateBaseDamage)
 *  12. return damage + 2
 *
 * Cmd_damagecalc (src/battle_script_commands.c:1290-1304):
 *  13. gCritMultiplier (1x or 2x)
 *
 * Cmd_adjustnormaldamage / adjustdamage:
 *  14. Random roll (85-100 / 100)
 *  15. STAB (1.5x)
 *  16. Type effectiveness
 *
 * Source: pret/pokeemerald src/pokemon.c:3106-3372 CalculateBaseDamage,
 *         src/battle_script_commands.c:1290-1304 Cmd_damagecalc
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
  let power = move.power;
  const defenderAbility = defender.ability;

  // Weather (moved before Weather Ball/SolarBeam checks)
  // Source: pret/pokeemerald src/pokemon.c:3330-3363
  const weather = context.state.weather?.type ?? null;

  // Track the effective move type — Weather Ball changes type based on weather
  let effectiveMoveType: PokemonType = move.type;

  // Weather Ball: type and power change based on active weather
  // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_WEATHER_BALL
  // Source: Showdown data/moves.ts — Weather Ball onModifyType/onModifyMove
  // Power doubles from 50 to 100, and type changes to match weather
  if (move.id === "weather-ball" && weather) {
    power = power * 2;
    const weatherTypeMap: Record<string, PokemonType> = {
      rain: "water",
      sun: "fire",
      sand: "rock",
      hail: "ice",
    };
    effectiveMoveType = weatherTypeMap[weather] ?? move.type;
  }

  // SolarBeam: half power in Rain, Sand, Hail (not Sun)
  // Source: pret/pokeemerald src/battle_script_commands.c — SolarBeam halved in non-sun weather
  // Source: Showdown data/moves.ts — SolarBeam onBasePower: 0.5x in rain/sand/hail
  if (move.id === "solar-beam") {
    if (weather === "rain" || weather === "sand" || weather === "hail") {
      power = Math.floor(power / 2);
    }
  }

  const physical = isGen3PhysicalType(effectiveMoveType);

  // --- Pinch abilities: Overgrow, Blaze, Torrent, Swarm ---
  // These multiply move power by 1.5x when the user's HP is at or below floor(maxHP/3)
  // AND the move type matches the ability's type.
  // Source: pret/pokeemerald src/battle_util.c ABILITY_OVERGROW/BLAZE/TORRENT/SWARM
  // Source: Bulbapedia — "When the Pokemon with this Ability has 1/3 or less of its HP
  //   remaining, moves of the same type get a 50% power boost."
  const PINCH_ABILITY_TYPES: Readonly<Record<string, string>> = {
    overgrow: "grass",
    blaze: "fire",
    torrent: "water",
    swarm: "bug",
  };
  const pinchType = PINCH_ABILITY_TYPES[attacker.ability];
  if (pinchType && effectiveMoveType === pinchType) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    const threshold = Math.floor(maxHp / 3);
    if (attacker.pokemon.currentHp <= threshold) {
      power = Math.floor(power * 1.5);
    }
  }

  // --- Defender ability type immunities ---
  // These abilities grant full immunity to specific move types.
  // They are checked BEFORE the damage formula runs, and return 0 damage with effectiveness 0.
  // Source: pret/pokeemerald — these abilities nullify damage and set type effectiveness to 0

  // Levitate: immune to ground-type moves
  // Source: pret/pokeemerald ABILITY_LEVITATE
  if (defenderAbility === "levitate" && effectiveMoveType === "ground") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Volt Absorb: immune to electric-type moves
  // Source: pret/pokeemerald ABILITY_VOLT_ABSORB
  if (defenderAbility === "volt-absorb" && effectiveMoveType === "electric") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Water Absorb: immune to water-type moves
  // Source: pret/pokeemerald ABILITY_WATER_ABSORB
  if (defenderAbility === "water-absorb" && effectiveMoveType === "water") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Flash Fire: immune to fire-type moves
  // Source: pret/pokeemerald ABILITY_FLASH_FIRE
  if (defenderAbility === "flash-fire" && effectiveMoveType === "fire") {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // Determine type-boost item match (used in getAttackStat for raw stat application)
  // Source: pret/pokeemerald src/pokemon.c:3170-3182 — type-boost items modify raw stat
  const attackerItem = attacker.pokemon.heldItem;
  const typeBoostItemType = attackerItem ? (TYPE_BOOST_ITEMS[attackerItem] ?? null) : null;

  // Get effective stats (with ability mods, items, and stat stages applied)
  // Burn is NOT applied here — it's applied AFTER the base formula per pokeemerald
  let attack = getAttackStat(attacker, effectiveMoveType, isCrit, typeBoostItemType);
  let defense = getDefenseStat(defender, effectiveMoveType, isCrit);

  // Explosion / Self-Destruct: halve the defender's Defense stat
  // Source: pret/pokeemerald src/pokemon.c — EFFECT_EXPLOSION halves defense
  // Source: Bulbapedia — "In Generations I-IV, Explosion and Self-Destruct halve the
  //   target's Defense stat"
  if (move.id === "explosion" || move.id === "self-destruct") {
    defense = Math.max(1, Math.floor(defense / 2));
  }

  // Track multipliers for breakdown
  let abilityMultiplier = 1;
  const itemMultiplier = typeBoostItemType === effectiveMoveType ? 1.1 : 1;

  // Thick Fat: halves the attacker's effective stat BEFORE the damage formula runs.
  // Source: pret/pokeemerald src/pokemon.c:3203-3204 — spAttack /= 2 (or attack for physical)
  if (
    defenderAbility === "thick-fat" &&
    (effectiveMoveType === "fire" || effectiveMoveType === "ice")
  ) {
    attack = Math.floor(attack / 2);
    abilityMultiplier = 0.5;
  }

  // Flash Fire: 1.5x boost to fire-type attack when attacker has the flash-fire volatile
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_FLASH_FIRE volatile boosts fire moves
  // Source: Showdown data/abilities.ts — Flash Fire condition: onModifyAtk/onModifySpA 1.5x for fire
  if (attacker.volatileStatuses.has("flash-fire") && effectiveMoveType === "fire") {
    attack = Math.floor(attack * 1.5);
    abilityMultiplier = abilityMultiplier === 1 ? 1.5 : abilityMultiplier * 1.5;
  }

  // Base formula: damage = Atk * Power * (2*L/5+2) / Def / 50
  // Source: pret/pokeemerald src/pokemon.c:3245-3260
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50);

  // Burn halving: applied AFTER the base formula, BEFORE +2
  // Source: pret/pokeemerald src/pokemon.c:3262-3264
  // "if ((attacker->status1 & STATUS1_BURN) && attacker->ability != ABILITY_GUTS) damage /= 2;"
  const attackerAbility = attacker.ability;
  const hasBurn = physical && attacker.pokemon.status === "burn";
  const gutsActive = attackerAbility === "guts" && attacker.pokemon.status !== null;
  const burnApplied = hasBurn && !gutsActive;
  if (burnApplied) {
    baseDamage = Math.floor(baseDamage / 2);
  }

  // Screens (Reflect / Light Screen) — non-crit only
  // Source: pret/pokeemerald src/pokemon.c:3266-3273 (physical) / 3317-3324 (special)
  // TODO: Phase 6+ — apply screen halving when screens are tracked on BattleSide

  // Spread move penalty — doubles only
  // Source: pret/pokeemerald src/pokemon.c:3275-3277
  // TODO: Phase 6+ — if context.targetCount > 1, apply /= 2

  // Weather boosts (special types in CalculateBaseDamage, physical weather is separate)
  // Source: pret/pokeemerald src/pokemon.c:3330-3363 — rain/sun modify fire/water damage
  // Note: In pokeemerald, weather is applied inside CalculateBaseDamage for special types only.
  // For simplicity and correctness, we apply weather to both here before +2.
  const weatherMod = getWeatherDamageModifier(effectiveMoveType, weather);
  if (weatherMod !== 1) {
    baseDamage = Math.floor(baseDamage * weatherMod);
  }

  // Add 2 (the constant at the end of CalculateBaseDamage)
  // Source: pret/pokeemerald src/pokemon.c:3371 — "return damage + 2;"
  baseDamage += 2;

  // Record the base damage before post-formula modifiers for breakdown
  const rawBaseDamage = baseDamage;

  // --- Post-formula modifiers (Cmd_damagecalc + adjustnormaldamage) ---

  // Critical hit — 2.0x in Gen 3
  // Source: pret/pokeemerald src/battle_script_commands.c:1296
  // "gBattleMoveDamage = gBattleMoveDamage * gCritMultiplier * gBattleScripting.dmgMultiplier;"
  if (isCrit) {
    baseDamage = baseDamage * 2;
  }

  // Random factor — integer from 85 to 100 inclusive, divided by 100
  // Source: pret/pokeemerald — RandomPercentage range 85-100
  const randomRoll = rng.int(85, 100);
  const randomFactor = randomRoll / 100;
  baseDamage = Math.floor(baseDamage * randomFactor);

  // STAB (Same Type Attack Bonus)
  // Source: pret/pokeemerald — 1.5x if move type matches attacker type
  const stabMod = getStabModifier(effectiveMoveType, attacker.types);
  if (stabMod > 1) {
    baseDamage = Math.floor(baseDamage * stabMod);
  }

  // Type effectiveness
  // Source: pret/pokeemerald — product of matchups for each defender type
  const effectiveness = getTypeEffectiveness(effectiveMoveType, defender.types, typeChart);

  const burnMultiplier = burnApplied ? 0.5 : 1;

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
        burnMultiplier,
        abilityMultiplier,
        itemMultiplier,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // Wonder Guard — only super-effective moves hit
  // Source: pret/pokeemerald ABILITY_WONDER_GUARD — only 2x and 4x moves land
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
        burnMultiplier,
        abilityMultiplier: 0,
        itemMultiplier,
        otherMultiplier: 1,
        finalDamage: 0,
      },
    };
  }

  // Apply type effectiveness as a multiplier
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
