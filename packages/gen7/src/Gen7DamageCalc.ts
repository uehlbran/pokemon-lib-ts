/**
 * Gen 7 (Sun/Moon/Ultra Sun/Ultra Moon) damage calculation.
 *
 * The Gen 7 damage formula is fundamentally the same as Gen 6, using the 4096-based
 * modifier system (pokeRound). Key differences from Gen 6:
 *
 *   - -ate abilities (Pixilate, Aerilate, Refrigerate, Galvanize): 1.2x (was 1.3x in Gen 6)
 *   - Galvanize (new): Normal -> Electric + 1.2x
 *   - Normalize (Gen 7): 1.2x boost on top of Normal conversion (new in Gen 7)
 *   - Soul Dew: boosts Dragon/Psychic moves by 1.2x (was stat boost in Gen 3-6)
 *   - Parental Bond second hit: 0.25x (was 0.5x in Gen 6) -- handled by engine, not here
 *   - Z-Move through Protect: 0.25x modifier when hitThroughProtect flag set on DamageContext
 *   - Psychic Terrain: 1.5x Psychic moves for grounded attacker (new terrain)
 *   - Normal Gem is the only gem available in Gen 7 (others removed)
 *   - Facade bypasses burn penalty (same as Gen 6)
 *
 * Formula order follows Showdown's modifyDamage() (battle-actions.ts):
 *   1. Base formula: floor(floor((2*L/5+2) * Power * Atk / Def) / 50) + 2
 *   2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
 *   3. Weather modifier: pokeRound(baseDamage, 6144 or 2048) = 1.5x or 0.5x
 *   4. Critical hit: pokeRound(baseDamage, 6144) = 1.5x
 *   5. Random factor: floor(baseDamage * randomRoll / 100) where roll is [85..100]
 *   6. STAB: pokeRound(baseDamage, 6144) = 1.5x, or 8192 for Adaptability = 2.0x
 *   7. Type effectiveness: integer multiply/divide
 *   8. Burn: pokeRound(baseDamage, 2048) = 0.5x (physical only, Facade exempt)
 *   9. Final modifier (Life Orb etc.): pokeRound(baseDamage, modifier)
 *  10. Minimum 1 damage (unless type immune)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 7 damage formula
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */

import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import { consumeHeldItem, getEffectiveStatStage } from "@pokemon-lib-ts/battle";
import type {
  MoveEffect,
  PokemonType,
  TypeChartLookup,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  BASE_ABILITY_TYPE_IMMUNITIES,
  BASE_PINCH_ABILITY_TYPES,
  BASE_PLATE_ITEMS,
  BASE_TYPE_BOOST_ITEMS,
  BASE_TYPE_RESIST_BERRIES,
  CORE_ABILITY_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TARGETS,
  CORE_MOVE_IDS,
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
  pokeRound,
  TYPE_EFFECTIVENESS_MULTIPLIERS,
} from "@pokemon-lib-ts/core";
import { GEN7_ABILITY_IDS, GEN7_ITEM_IDS, GEN7_MOVE_IDS } from "./data/reference-ids.js";
import { isWeatherSuppressedGen7 } from "./Gen7Weather.js";

// Re-exported for backwards compatibility; canonical implementation lives in core.
export { pokeRound };

const LATIAS_SPECIES_ID = 380;
const LATIOS_SPECIES_ID = 381;
const CLAMPERL_SPECIES_ID = 366;
const PIKACHU_SPECIES_ID = 25;
const CUBONE_SPECIES_ID = 104;
const MAROWAK_SPECIES_ID = 105;
const DIALGA_SPECIES_ID = 483;
const PALKIA_SPECIES_ID = 484;
const GIRATINA_SPECIES_ID = 487;

function getPowerTrickAdjustedBaseStat(
  pokemon: ActivePokemon,
  statKey: "attack" | "defense" | "spAttack" | "spDefense",
): number {
  const stats = pokemon.pokemon.calculatedStats;
  if (!stats) {
    return 100;
  }

  if (!pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.powerTrick)) {
    return stats[statKey];
  }

  if (statKey === CORE_STAT_IDS.attack) {
    return stats.defense;
  }
  if (statKey === CORE_STAT_IDS.defense) {
    return stats.attack;
  }
  return stats[statKey];
}

// ---- Type-Resist Berries ----

/**
 * Type-resist berries: halve super-effective damage of the matching type, then consumed.
 * Same set as Gen 6 (includes Roseli Berry for Fairy).
 * Chilan Berry activates on any Normal-type hit (no super-effective requirement).
 *
 * Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
 * Source: Bulbapedia -- type-resist berries
 */
export const TYPE_RESIST_BERRIES: Readonly<Record<string, PokemonType>> = {
  ...BASE_TYPE_RESIST_BERRIES,
  [CORE_ITEM_IDS.roseliBerry]: CORE_TYPE_IDS.fairy,
};

// ---- Type-Boosting Items ----

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same as Gen 6.
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 */
const TYPE_BOOST_ITEMS = BASE_TYPE_BOOST_ITEMS;

/**
 * Plate items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same set as Gen 6 (includes Pixie Plate).
 *
 * Source: Showdown data/items.ts -- Flame Plate etc. use onBasePower with
 *   chainModify([4915, 4096])
 */
const PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  ...BASE_PLATE_ITEMS,
  [CORE_ITEM_IDS.pixiePlate]: CORE_TYPE_IDS.fairy,
};

// ---- Gem Items (Gen 7) ----

/**
 * Gen 7 gem items: only Normal Gem remains available in Gen 7.
 * Other gems were removed from standard gameplay after Gen 5.
 * Boost is 1.3x (5325/4096), same as Gen 6.
 *
 * Source: Showdown data/items.ts -- normalGem: onBasePower chainModify([5325, 4096])
 * Source: Bulbapedia "Gem" -- "From Generation VII onwards, only Normal Gem is available."
 */
const GEM_ITEMS: Readonly<Record<string, string>> = {
  [CORE_ITEM_IDS.normalGem]: CORE_TYPE_IDS.normal,
};

/**
 * Gen 7 gem boost multiplier in 4096-based math.
 * 1.3x = Math.round(1.3 * 4096) = 5325
 *
 * Source: Showdown data/items.ts -- gem onBasePower: chainModify([5325, 4096]) in Gen 6+
 */
export const GEN7_GEM_MODIFIER = 5325; // 1.3x in 4096-based math

// ---- Pinch Ability Types ----

/**
 * Pinch abilities: boost move power by 1.5x when the user's HP is at or
 * below floor(maxHP/3) and the move type matches the ability's type.
 *
 * Source: Showdown sim/battle.ts -- pinch ability check
 * Source: Bulbapedia -- Overgrow / Blaze / Torrent / Swarm
 */
const PINCH_ABILITY_TYPES = BASE_PINCH_ABILITY_TYPES;

// ---- Ability Immunity Map ----

/**
 * Defender abilities that grant full type immunity to incoming moves.
 * Checked before the damage formula runs; returns 0 damage with effectiveness 0.
 *
 * Source: Showdown sim/battle.ts -- immunity abilities
 * Source: Bulbapedia -- Motor Drive, Dry Skin, etc.
 */
const ABILITY_TYPE_IMMUNITIES = BASE_ABILITY_TYPE_IMMUNITIES;

// Signature moves that ignore target ability effects in Gen 7.
// Source: Showdown data/moves.ts -- photongeyser / moongeistbeam / sunsteelstrike: ignoreAbility
// Reused by the existing defensive-ability bypass path (same behavior model as
// Mold Breaker/Teravolt/Turboblaze in this module).
export const ABILITY_IGNORING_MOVES: ReadonlySet<string> = new Set([
  GEN7_MOVE_IDS.photonGeyser,
  GEN7_MOVE_IDS.moongeistBeam,
  GEN7_MOVE_IDS.sunsteelStrike,
]);

function getPhotonGeyserCategory(attacker: ActivePokemon): "physical" | "special" {
  const attack = getPowerTrickAdjustedBaseStat(attacker, CORE_STAT_IDS.attack);
  const spAttack = getPowerTrickAdjustedBaseStat(attacker, CORE_STAT_IDS.spAttack);
  const attackStage = Math.max(-6, Math.min(6, attacker.statStages.attack ?? 0));
  const spAttackStage = Math.max(-6, Math.min(6, attacker.statStages.spAttack ?? 0));
  const attackForCategory = Math.floor(attack * getStatStageMultiplier(attackStage));
  const spAttackForCategory = Math.floor(spAttack * getStatStageMultiplier(spAttackStage));

  // Source: Showdown data/moves.ts -- photongeyser onModifyMove compares
  // getStat('atk', false, true) > getStat('spa', false, true), which includes
  // raw stage-adjusted attacking stats while excluding ModifyBoost / ModifyAtk /
  // ModifySpA effects such as Simple, burn, Choice items, or Slow Start.
  return attackForCategory > spAttackForCategory ? "physical" : "special";
}

// ---- Recoil Detection Helper ----

/**
 * Check if a move effect includes recoil (for Reckless boost).
 *
 * Source: Showdown data/abilities.ts -- Reckless checks for recoil flag
 */
function hasRecoilEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;
  if (effect.type === "recoil") return true;
  if (effect.type === "multi") {
    return effect.effects.some((e) => e.type === "recoil");
  }
  return false;
}

function attackerAbilityIsMoldBreaker(ability: string | null | undefined): boolean {
  return (
    ability === CORE_ABILITY_IDS.moldBreaker ||
    ability === CORE_ABILITY_IDS.teravolt ||
    ability === CORE_ABILITY_IDS.turboblaze
  );
}

// ---- Sheer Force Eligible Check ----

/**
 * Check if a move has a secondary effect that Sheer Force can boost.
 *
 * Source: Showdown data/abilities.ts -- sheerforce: onModifyMove deletes secondaries
 */
function hasSheerForceEligibleEffect(effect: MoveEffect | null): boolean {
  if (!effect) return false;

  switch (effect.type) {
    case "status-chance":
      return true;

    case "stat-change":
      if (effect.target === CORE_MOVE_EFFECT_TARGETS.foe && effect.chance > 0) return true;
      if (effect.target === CORE_MOVE_EFFECT_TARGETS.self && effect.fromSecondary === true)
        return true;
      return false;

    case "volatile-status":
      return effect.chance > 0;

    case "multi":
      return effect.effects.some((e) => hasSheerForceEligibleEffect(e));

    default:
      return false;
  }
}

/**
 * Moves with secondary effects stored as custom onHit functions in Showdown.
 *
 * Source: Showdown data/moves.ts -- moves with secondaries as onHit
 */
const SHEER_FORCE_WHITELIST: ReadonlySet<string> = new Set([
  GEN7_MOVE_IDS.triAttack,
  GEN7_MOVE_IDS.secretPower,
  GEN7_MOVE_IDS.relicSong,
]);

function isSheerForceEligibleMove(effect: MoveEffect | null, moveId: string): boolean {
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_WHITELIST.has(moveId);
}

// ---- Grounding Check ----

/**
 * Check if a Pokemon is grounded (affected by terrain and ground-based effects).
 * Same logic as Gen 6 grounding check.
 *
 * Source: Showdown sim/pokemon.ts -- isGrounded()
 * Source: Bulbapedia -- grounding mechanics
 */
export function isGen7Grounded(pokemon: ActivePokemon, gravityActive: boolean): boolean {
  if (gravityActive) return true;
  if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.ingrain)) return true;

  const itemsSuppressed =
    pokemon.ability === CORE_ABILITY_IDS.klutz ||
    pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.embargo);
  if (pokemon.pokemon.heldItem === CORE_ITEM_IDS.ironBall && !itemsSuppressed) return true;
  if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.smackDown as VolatileStatus)) return true;

  if (pokemon.types.includes(CORE_TYPE_IDS.flying)) return false;
  if (pokemon.ability === CORE_ABILITY_IDS.levitate) return false;
  if (
    pokemon.pokemon.heldItem === CORE_ITEM_IDS.airBalloon &&
    !itemsSuppressed &&
    pokemon.pokemon.currentHp > 0
  ) {
    return false;
  }
  if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.magnetRise)) return false;
  if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.telekinesis as VolatileStatus)) return false;

  return true;
}

// ---- Terrain Damage Modifier ----

/**
 * Get terrain-based damage modifier for the power step.
 *
 * Gen 7 terrain boost is 1.5x (same as Gen 6).
 * Gen 7 adds Psychic Terrain: 1.5x Psychic moves for grounded attacker.
 *
 * Source: Bulbapedia -- terrain damage modifiers (Gen 7)
 * Source: Showdown data/conditions.ts -- terrain onBasePower handlers
 */
interface TerrainDamageModifier {
  readonly powerModifier: number | null;
  readonly grassyGroundHalved: boolean;
}

const GRASSY_HALVED_MOVES: ReadonlySet<string> = new Set([
  GEN7_MOVE_IDS.earthquake,
  GEN7_MOVE_IDS.bulldoze,
  GEN7_MOVE_IDS.magnitude,
]);

function getTerrainDamageModifier(
  terrainType: string,
  moveType: string,
  moveId: string,
  attackerGrounded: boolean,
  defenderGrounded: boolean,
): TerrainDamageModifier {
  let powerModifier: number | null = null;
  let grassyGroundHalved = false;

  // Electric Terrain: 1.5x for Electric moves when attacker is grounded
  // Source: Showdown data/conditions.ts -- electricterrain.onBasePower
  if (
    terrainType === CORE_TERRAIN_IDS.electric &&
    moveType === CORE_TYPE_IDS.electric &&
    attackerGrounded
  ) {
    powerModifier = 6144;
  }

  // Grassy Terrain: 1.5x for Grass moves when attacker is grounded
  // Source: Showdown data/conditions.ts -- grassyterrain.onBasePower
  if (
    terrainType === CORE_TERRAIN_IDS.grassy &&
    moveType === CORE_TYPE_IDS.grass &&
    attackerGrounded
  ) {
    powerModifier = 6144;
  }

  // Misty Terrain: 0.5x for Dragon moves when defender is grounded
  // Source: Showdown data/conditions.ts -- mistyterrain.onBasePower
  if (
    terrainType === CORE_TERRAIN_IDS.misty &&
    moveType === CORE_TYPE_IDS.dragon &&
    defenderGrounded
  ) {
    powerModifier = 2048;
  }

  // Psychic Terrain (new in Gen 7): 1.5x for Psychic moves when attacker is grounded
  // Source: Bulbapedia "Psychic Terrain" Gen 7 -- "increases the power of Psychic-type
  //   moves used by grounded Pokemon by 50%"
  // Source: Showdown data/conditions.ts -- psychicterrain.onBasePower
  if (
    terrainType === CORE_TERRAIN_IDS.psychic &&
    moveType === CORE_TYPE_IDS.psychic &&
    attackerGrounded
  ) {
    powerModifier = 6144;
  }

  // Grassy Terrain: halve damage from Earthquake/Bulldoze/Magnitude vs grounded
  // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage
  if (
    terrainType === CORE_TERRAIN_IDS.grassy &&
    defenderGrounded &&
    GRASSY_HALVED_MOVES.has(moveId)
  ) {
    grassyGroundHalved = true;
  }

  return { powerModifier, grassyGroundHalved };
}

// ---- Attack Stat Calculation ----

/**
 * Get the effective attack stat for a move in Gen 7.
 *
 * Same as Gen 6 except:
 *   - Soul Dew no longer boosts stats (now boosts move power, handled separately)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 7 attack stat
 */
function getAttackStat(
  attacker: ActivePokemon,
  _moveType: PokemonType,
  isPhysical: boolean,
  isCrit: boolean,
  defender?: ActivePokemon,
  bypassesDefensiveAbilities = false,
): number {
  const statKey = isPhysical ? CORE_STAT_IDS.attack : CORE_STAT_IDS.spAttack;
  let rawStat = getPowerTrickAdjustedBaseStat(attacker, statKey);

  const ability = attacker.ability;
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;
  const attackerHasKlutz = ability === CORE_ABILITY_IDS.klutz;

  // Huge Power / Pure Power: doubles physical attack
  // Source: Showdown -- Huge Power / Pure Power
  if (
    isPhysical &&
    (ability === CORE_ABILITY_IDS.hugePower || ability === CORE_ABILITY_IDS.purePower)
  ) {
    rawStat = rawStat * 2;
  }

  // Choice Band (physical) / Choice Specs (special): 1.5x raw stat
  // Source: Showdown data/items.ts -- Choice Band / Choice Specs
  if (!attackerHasKlutz && isPhysical && attackerItem === CORE_ITEM_IDS.choiceBand) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }
  if (!attackerHasKlutz && !isPhysical && attackerItem === CORE_ITEM_IDS.choiceSpecs) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Soul Dew: Gen 7 changed behavior -- no longer boosts stats.
  // In Gen 7+, Soul Dew boosts Dragon and Psychic moves by 1.2x (handled in power mods).
  // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower, not onModifyAtk/SpA
  // (Intentionally omitting the Gen 6 stat boost here)

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Showdown data/items.ts -- Deep Sea Tooth
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === CORE_ITEM_IDS.deepSeaTooth &&
    attackerSpecies === CLAMPERL_SPECIES_ID
  ) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x Atk AND SpAtk for Pikachu (25)
  // Source: Showdown data/items.ts -- Light Ball Gen 4+ behavior
  if (
    !attackerHasKlutz &&
    attackerItem === CORE_ITEM_IDS.lightBall &&
    attackerSpecies === PIKACHU_SPECIES_ID
  ) {
    rawStat = rawStat * 2;
  }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105)
  // Source: Showdown data/items.ts -- Thick Club
  // The shipped species model uses National Dex ids and does not yet expose
  // regional-form species entries through `speciesId`; tracked separately.
  if (
    !attackerHasKlutz &&
    isPhysical &&
    attackerItem === CORE_ITEM_IDS.thickClub &&
    (attackerSpecies === CUBONE_SPECIES_ID || attackerSpecies === MAROWAK_SPECIES_ID)
  ) {
    rawStat = rawStat * 2;
  }

  // Hustle: 1.5x physical attack
  // Source: Showdown -- Hustle
  if (isPhysical && ability === CORE_ABILITY_IDS.hustle) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Guts: 1.5x physical attack when statused
  // Source: Showdown -- Guts
  if (isPhysical && ability === GEN7_ABILITY_IDS.guts && attacker.pokemon.status !== null) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Slow Start: halve Attack for the first 5 turns
  // Source: Showdown data/abilities.ts -- Slow Start
  if (
    isPhysical &&
    ability === CORE_ABILITY_IDS.slowStart &&
    attacker.volatileStatuses.has(CORE_VOLATILE_IDS.slowStart)
  ) {
    rawStat = Math.floor(rawStat / 2);
  }

  // Defeatist: halve Attack and SpAttack when HP <= 50%
  // Source: Bulbapedia -- Defeatist
  // Source: Showdown data/abilities.ts -- Defeatist
  if (ability === CORE_ABILITY_IDS.defeatist) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    if (attacker.pokemon.currentHp <= Math.floor(maxHp / 2)) {
      rawStat = Math.floor(rawStat / 2);
    }
  }

  // Apply stat stages (with Simple/Unaware adjustments)
  const statKey2 = isPhysical ? CORE_STAT_IDS.attack : CORE_STAT_IDS.spAttack;
  const stage = getEffectiveStatStage(
    attacker,
    statKey2,
    defender,
    "offense",
    bypassesDefensiveAbilities,
  );

  // On crit: ignore negative attack stages (use 0 instead), keep positive
  // Source: Showdown -- crit ignores negative attack stages
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  const effective = Math.floor(rawStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ---- Defense Stat Calculation ----

/**
 * Get the effective defense stat for a move in Gen 7.
 *
 * Same as Gen 6 except:
 *   - Soul Dew no longer boosts SpDef (now boosts move power)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 7 defense stat
 */
function getDefenseStat(
  defender: ActivePokemon,
  isPhysical: boolean,
  isCrit: boolean,
  weather: string | null,
  attacker?: ActivePokemon,
  bypassesDefensiveAbility?: boolean,
  ignoreDefenseStages?: boolean,
): number {
  const statKey = isPhysical ? CORE_STAT_IDS.defense : CORE_STAT_IDS.spDefense;
  let baseStat = getPowerTrickAdjustedBaseStat(defender, statKey);

  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;
  const defenderHasKlutz = defender.ability === CORE_ABILITY_IDS.klutz;

  // Soul Dew: Gen 7 -- no longer boosts SpDef (changed from Gen 6)
  // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower, not onModifySpD
  // (Intentionally omitting the Gen 6 stat boost here)

  // Deep Sea Scale: 2x SpDef for Clamperl (366)
  // Source: Showdown data/items.ts -- Deep Sea Scale
  if (
    !defenderHasKlutz &&
    !isPhysical &&
    defenderItem === "deep-sea-scale" &&
    defenderSpecies === CLAMPERL_SPECIES_ID
  ) {
    baseStat = baseStat * 2;
  }

  // Eviolite: 1.5x Def and SpDef for not-fully-evolved Pokemon
  // Source: Showdown data/items.ts -- Eviolite onModifyDef / onModifySpD
  if (!defenderHasKlutz && defenderItem === "eviolite") {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Assault Vest: 1.5x SpDef
  // Source: Showdown data/items.ts -- Assault Vest onModifySpD
  if (!defenderHasKlutz && !isPhysical && defenderItem === CORE_ITEM_IDS.assaultVest) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Marvel Scale: 1.5x physical Defense when statused
  // Source: Showdown data/abilities.ts -- Marvel Scale
  const bypassesDefenderAbility =
    bypassesDefensiveAbility === true || attackerAbilityIsMoldBreaker(attacker?.ability);
  if (
    isPhysical &&
    !bypassesDefenderAbility &&
    defender.ability === CORE_ABILITY_IDS.marvelScale &&
    defender.pokemon.status !== null
  ) {
    baseStat = Math.floor(baseStat * 1.5);
  }

  // Fur Coat: 2x physical Defense
  // Source: Showdown data/abilities.ts -- Fur Coat onModifyDef
  if (isPhysical && !bypassesDefenderAbility && defender.ability === GEN7_ABILITY_IDS.furCoat) {
    baseStat = baseStat * 2;
  }

  // Sandstorm Rock SpDef boost: 1.5x SpDef for Rock-types in sandstorm
  // Source: Bulbapedia -- Sandstorm: "Rock-type Pokemon have their Special Defense
  //   raised by 50% during a sandstorm. (Generation IV+)"
  if (
    !isPhysical &&
    weather === CORE_WEATHER_IDS.sand &&
    defender.types.includes(CORE_TYPE_IDS.rock)
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Flower Gift: 1.5x SpDef in Harsh Sunlight
  // Source: Showdown data/abilities.ts -- Flower Gift
  if (
    !isPhysical &&
    !bypassesDefenderAbility &&
    weather === CORE_WEATHER_IDS.sun &&
    defender.ability === GEN7_ABILITY_IDS.flowerGift
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Stat stages
  const defStatKey = isPhysical ? CORE_STAT_IDS.defense : CORE_STAT_IDS.spDefense;
  const stage = getEffectiveStatStage(
    defender,
    defStatKey,
    attacker,
    "defense",
    bypassesDefenderAbility,
  );

  // Chip Away / Sacred Sword / Darkest Lariat: ignore target's defense stat stages
  // Source: Showdown data/moves.ts -- chipaway/sacredsword/darkestlariat: { ignoreDefensive: true }
  // On crit: ignore positive defense stages (use 0 instead), keep negative
  // Source: Showdown -- crit ignores positive def stages
  let effectiveStage: number;
  if (ignoreDefenseStages) {
    effectiveStage = 0;
  } else if (isCrit && stage > 0) {
    effectiveStage = 0;
  } else {
    effectiveStage = stage;
  }

  const effective = Math.floor(baseStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ---- Knock Off Removable Item Check ----

/**
 * Check if an item is removable by Knock Off.
 * Same logic as Gen 6.
 *
 * Source: Showdown sim/battle-actions.ts -- Knock Off boost check
 * Source: Bulbapedia "Knock Off" Gen 6+ -- 1.5x damage if target has removable item
 */
function isRemovableItem(item: string, _defenderSpeciesId: number): boolean {
  if (!item) return false;

  const MEGA_STONE_SUFFIX_ITEMS: ReadonlySet<string> = new Set(["blue-orb", "red-orb"]);
  if (MEGA_STONE_SUFFIX_ITEMS.has(item)) return false;

  // Eviolite ends with "ite" but is NOT a Mega Stone -- it is a standard removable item.
  // Source: Showdown data/items.ts -- Eviolite has no megaStone/megaEvolves property
  if (item === "eviolite") return true;

  // Z-Crystals are not removable (new in Gen 7)
  // Source: Showdown data/items.ts -- Z-Crystals have zMoveType property
  // Source: Bulbapedia "Z-Crystal" -- cannot be removed by Knock Off
  if (item.endsWith("-z") || item.includes("ium-z")) return false;

  // Check for mega stone naming pattern
  // Source: Showdown data/items.ts -- mega stones identified by megaStone/megaEvolves property
  if (item.endsWith("ite") || item.endsWith("ite-x") || item.endsWith("ite-y")) return false;

  return true;
}

// ---- -ate Abilities (Gen 7) ----

/**
 * -ate abilities: change Normal-type moves to the ability's type + 1.2x power in Gen 7.
 * (Was 1.3x in Gen 6.)
 *
 * Gen 7 adds Galvanize (Normal -> Electric).
 *
 * Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate/galvanize:
 *   onModifyType: if move.type === 'Normal', change to ability type
 *   Gen 7: onBasePower chainModify([4915, 4096]) = 1.2x
 * Source: Bulbapedia -- "-ate abilities nerfed from 1.3x to 1.2x in Gen 7"
 */
const ATE_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  [GEN7_ABILITY_IDS.aerilate]: CORE_TYPE_IDS.flying,
  [GEN7_ABILITY_IDS.pixilate]: CORE_TYPE_IDS.fairy,
  [GEN7_ABILITY_IDS.refrigerate]: CORE_TYPE_IDS.ice,
  [GEN7_ABILITY_IDS.galvanize]: CORE_TYPE_IDS.electric,
};

/**
 * -ate ability power boost in Gen 7: 1.2x (4915/4096).
 * Changed from 1.3x (5325/4096) in Gen 6.
 *
 * Source: Showdown data/abilities.ts -- Gen 7 -ate abilities: chainModify([4915, 4096])
 */
const GEN7_ATE_MODIFIER = 4915; // 1.2x in 4096-based math

// ---- Main Damage Formula ----

/**
 * Calculate damage for a move in Gen 7.
 *
 * See module-level JSDoc for the full modifier order and Gen 7 differences.
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 7 damage formula
 * Source: Bulbapedia "Damage" -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */
export function calculateGen7Damage(
  context: DamageContext,
  typeChart: TypeChartLookup,
): DamageResult {
  const { attacker, defender, move, rng, isCrit } = context;
  const isSpitUp = move.id === GEN7_MOVE_IDS.spitUp;
  const effectiveCategory =
    move.id === GEN7_MOVE_IDS.photonGeyser ? getPhotonGeyserCategory(attacker) : move.category;

  // 1. Status moves / power=0 -> no damage
  // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
  if (
    effectiveCategory === CORE_MOVE_CATEGORIES.status ||
    (!isSpitUp && move.power === null) ||
    (!isSpitUp && move.power === 0)
  ) {
    return {
      damage: 0,
      effectiveness: 1,
      isCrit: false,
      randomFactor: 1,
      effectiveCategory,
    };
  }

  const level = attacker.pokemon.level;
  let power = move.power ?? 0;
  const defenderAbility = defender.ability;
  const attackerAbility = attacker.ability;
  if (isSpitUp) {
    const stockpileLayers = Number(
      attacker.volatileStatuses.get(CORE_VOLATILE_IDS.stockpile)?.data?.layers ?? 0,
    );
    power = stockpileLayers > 0 ? stockpileLayers * 100 : 0;
  }
  // Cloud Nine / Air Lock suppress weather for damage calculation purposes.
  // Source: Showdown sim/battle.ts — suppressingWeather() gates all weather-based damage modifiers
  const rawWeather = context.state.weather?.type ?? null;
  const weather = isWeatherSuppressedGen7(attacker, defender) ? null : rawWeather;

  // -ate abilities + Normalize + Galvanize: type-changing abilities
  // Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate/galvanize: onModifyTypePriority -1
  // Source: Showdown data/abilities.ts -- normalize: onModifyTypePriority -2
  let effectiveMoveType: PokemonType = move.type;
  let ateBoostApplied = false;

  // -ate abilities: change Normal-type moves to the ability's type + 1.2x power (Gen 7)
  const ateType = ATE_ABILITY_TYPES[attackerAbility];
  if (move.type === CORE_TYPE_IDS.normal && ateType) {
    effectiveMoveType = ateType;
    ateBoostApplied = true;
  }

  // Normalize: all moves become Normal type + 1.2x boost in Gen 7
  // Source: Showdown data/abilities.ts -- Normalize Gen 7+: includes 1.2x power boost
  // Source: Bulbapedia -- "From Generation VII onwards, Normalize also multiplies the
  //   power of the affected moves by 1.2."
  if (attackerAbility === GEN7_ABILITY_IDS.normalize) {
    effectiveMoveType = CORE_TYPE_IDS.normal;
    // Normalize always applies the 1.2x boost, including moves already Normal type.
    // Source: Showdown data/abilities.ts -- normalize: onBasePower fires whenever
    //   move.typeChangerBoosted === this.effect, set unconditionally in onModifyType.
    ateBoostApplied = true;
  }

  // Klutz check
  const attackerHasKlutz = attackerAbility === CORE_ABILITY_IDS.klutz;
  const attackerItem = attacker.pokemon.heldItem;

  // ---- Pre-damage base power modifications ----

  // SolarBeam half power in rain/sand/hail (NOT sun)
  // Source: Showdown -- SolarBeam power halved in non-sun weather
  if (
    move.id === CORE_MOVE_IDS.solarBeam &&
    weather !== null &&
    weather !== CORE_WEATHER_IDS.sun &&
    weather !== CORE_WEATHER_IDS.harshSun
  ) {
    power = Math.floor(power / 2);
  }

  // Facade: doubles base power (70 → 140) when the user has a major status condition
  // (burn, paralysis, poison, or badly-poisoned). Sleep does NOT trigger the doubling.
  // Source: pret/pokeemerald data/battle_scripts_1.s BattleScript_EffectFacade —
  //   jumpifstatus BS_ATTACKER, STATUS1_POISON|STATUS1_BURN|STATUS1_PARALYSIS|STATUS1_TOXIC_POISON,
  //   BattleScript_FacadeDoubleDmg; then setbyte sDMG_MULTIPLIER, 2
  // Source: Showdown data/moves.ts facade.onBasePower —
  //   if (pokemon.status && pokemon.status !== 'slp') { return this.chainModify(2); }
  if (
    move.id === GEN7_MOVE_IDS.facade &&
    attacker.pokemon.status !== null &&
    attacker.pokemon.status !== CORE_STATUS_IDS.sleep
  ) {
    power = power * 2;
  }

  // Gem boost: only Normal Gem available in Gen 7, 1.3x via pokeRound
  // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096])
  const attackerHasEmbargo = attacker.volatileStatuses.has(CORE_VOLATILE_IDS.embargo);
  let gemConsumed = false;
  if (!attackerHasKlutz && !attackerHasEmbargo && attackerItem) {
    const gemType = GEM_ITEMS[attackerItem];
    if (gemType && gemType === effectiveMoveType) {
      power = pokeRound(power, GEN7_GEM_MODIFIER);
      gemConsumed = true;
    }
  }

  // Type-boost items (Charcoal, etc.) and Plates: 4915/4096 base power
  // Source: Showdown data/items.ts -- onBasePower with chainModify([4915, 4096])
  if (!attackerHasKlutz && !gemConsumed && attackerItem) {
    const typeBoostItemType = TYPE_BOOST_ITEMS[attackerItem];
    const plateItemType = PLATE_ITEMS[attackerItem];
    if (typeBoostItemType === effectiveMoveType) {
      power = pokeRound(power, 4915);
    }
    if (plateItemType === effectiveMoveType) {
      power = pokeRound(power, 4915);
    }
  }

  // Soul Dew (Gen 7): 1.2x (4915/4096) for Dragon and Psychic moves used by
  // Latias (380) / Latios (381)
  // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower: chainModify([4915, 4096])
  //   for type === 'Psychic' || type === 'Dragon'
  // Source: Bulbapedia "Soul Dew" -- "From Generation VII onwards, increases the power of
  //   Psychic- and Dragon-type moves used by Latios and Latias by 20%"
  if (
    !attackerHasKlutz &&
    attackerItem === CORE_ITEM_IDS.soulDew &&
    (attacker.pokemon.speciesId === LATIAS_SPECIES_ID ||
      attacker.pokemon.speciesId === LATIOS_SPECIES_ID) &&
    (effectiveMoveType === CORE_TYPE_IDS.psychic || effectiveMoveType === CORE_TYPE_IDS.dragon)
  ) {
    power = pokeRound(power, 4915);
  }

  // Knock Off (Gen 6+): 1.5x base power when target holds a removable item
  // Source: Showdown data/moves.ts -- knockoff onBasePower
  if (move.id === GEN7_MOVE_IDS.knockOff && defender.pokemon.heldItem) {
    if (isRemovableItem(defender.pokemon.heldItem, defender.pokemon.speciesId)) {
      power = pokeRound(power, 6144); // 1.5x
    }
  }

  // Pinch abilities: 1.5x power when HP <= floor(maxHP/3)
  // Source: Showdown -- pinch ability check
  const pinchType = PINCH_ABILITY_TYPES[attackerAbility];
  if (pinchType && effectiveMoveType === pinchType) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    const threshold = Math.floor(maxHp / 3);
    if (attacker.pokemon.currentHp <= threshold) {
      power = Math.floor(power * 1.5);
    }
  }

  // Flash Fire volatile: 1.5x power for Fire moves
  // Source: Showdown data/abilities.ts -- Flash Fire
  if (
    effectiveMoveType === CORE_TYPE_IDS.fire &&
    attacker.volatileStatuses.has(CORE_VOLATILE_IDS.flashFire)
  ) {
    power = Math.floor(power * 1.5);
  }

  // Dry Skin fire weakness: 1.25x base power for Fire moves against Dry Skin
  // Source: Showdown data/abilities.ts -- Dry Skin (priority 17)
  const bypassesDefensiveAbilities =
    attackerAbility === CORE_ABILITY_IDS.moldBreaker ||
    attackerAbility === CORE_ABILITY_IDS.teravolt ||
    attackerAbility === CORE_ABILITY_IDS.turboblaze ||
    ABILITY_IGNORING_MOVES.has(move.id);
  if (
    !bypassesDefensiveAbilities &&
    defenderAbility === CORE_ABILITY_IDS.drySkin &&
    effectiveMoveType === CORE_TYPE_IDS.fire
  ) {
    power = Math.floor(power * 1.25);
  }

  // Technician: 1.5x power for moves with base power <= 60
  // Source: Showdown data/abilities.ts -- Technician (priority 30)
  if (attackerAbility === GEN7_ABILITY_IDS.technician && power <= 60) {
    power = Math.floor(power * 1.5);
  }

  // Iron Fist: 1.2x power for punching moves
  // Source: Showdown data/abilities.ts -- Iron Fist
  if (attackerAbility === GEN7_ABILITY_IDS.ironFist && move.flags.punch) {
    power = Math.floor(power * 1.2);
  }

  // Tough Claws: ~1.3x (5325/4096) power for contact moves
  // Source: Showdown data/abilities.ts -- toughclaws: onBasePowerPriority 21
  if (attackerAbility === GEN7_ABILITY_IDS.toughClaws && move.flags.contact) {
    power = pokeRound(power, 5325);
  }

  // Strong Jaw: 1.5x (6144/4096) power for bite moves
  // Source: Showdown data/abilities.ts -- strongjaw: onBasePowerPriority 19
  if (attackerAbility === GEN7_ABILITY_IDS.strongJaw && move.flags.bite) {
    power = pokeRound(power, 6144);
  }

  // Mega Launcher: 1.5x (6144/4096) power for pulse moves
  // Source: Showdown data/abilities.ts -- megalauncher: onBasePowerPriority 19
  if (attackerAbility === GEN7_ABILITY_IDS.megaLauncher && move.flags.pulse) {
    power = pokeRound(power, 6144);
  }

  // -ate / Normalize / Galvanize power boost: 1.2x (4915/4096) in Gen 7
  // Source: Showdown data/abilities.ts -- Gen 7 -ate abilities: chainModify([4915, 4096])
  if (ateBoostApplied) {
    power = pokeRound(power, GEN7_ATE_MODIFIER);
  }

  // Reckless: 1.2x power for moves with recoil
  // Source: Showdown data/abilities.ts -- Reckless
  // Reckless: 1.2x power for moves with recoil or crash damage
  // Source: Showdown data/abilities.ts -- Reckless: onBasePower
  //   if (move.recoil || move.hasCrashDamage) return this.chainModify(1.2)
  // Crash damage moves (Jump Kick, High Jump Kick) also get the boost.
  if (
    attackerAbility === GEN7_ABILITY_IDS.reckless &&
    (hasRecoilEffect(move.effect) || move.hasCrashDamage)
  ) {
    power = Math.floor(power * 1.2);
  }

  // Sheer Force: 1.3x (5325/4096) power for moves with secondary effects
  // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
  if (
    attackerAbility === GEN7_ABILITY_IDS.sheerForce &&
    isSheerForceEligibleMove(move.effect, move.id)
  ) {
    power = pokeRound(power, 5325);
  }

  // Venoshock: doubles power when target is poisoned or badly poisoned
  // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2)
  if (
    move.id === GEN7_MOVE_IDS.venoshock &&
    (defender.pokemon.status === CORE_STATUS_IDS.poison ||
      defender.pokemon.status === CORE_STATUS_IDS.badlyPoisoned)
  ) {
    power = power * 2;
  }

  // Hex: doubles power when target has any primary status condition
  // Source: Showdown data/moves.ts -- hex: onBasePower chainModify(2)
  if (move.id === CORE_MOVE_IDS.hex && defender.pokemon.status !== null) {
    power = power * 2;
  }

  // Acrobatics: doubles power when holder has no item
  // Source: Showdown data/moves.ts -- Acrobatics basePowerCallback
  if (move.id === CORE_MOVE_IDS.acrobatics && !attackerItem) {
    power = power * 2;
  }

  // Round: doubles power when an ally used Round earlier this turn
  // Source: Showdown data/moves.ts -- round.basePowerCallback
  if (move.id === CORE_MOVE_IDS.round) {
    const attackerSideIndex = context.state.sides.findIndex((s) =>
      s.active.some((a) => a === attacker),
    );
    if (attackerSideIndex !== -1) {
      const side = context.state.sides[attackerSideIndex];
      if (side) {
        for (const active of side.active) {
          if (
            active &&
            active !== attacker &&
            active.lastMoveUsed === CORE_MOVE_IDS.round &&
            active.movedThisTurn
          ) {
            power = power * 2;
            break;
          }
        }
      }
    }
  }

  // Rivalry: gender-dependent power modifier
  // Source: Showdown data/abilities.ts -- Rivalry
  if (attackerAbility === GEN7_ABILITY_IDS.rivalry) {
    const attackerGender = attacker.pokemon.gender;
    const defenderGender = defender.pokemon.gender;
    if (
      attackerGender &&
      defenderGender &&
      attackerGender !== CORE_GENDERS.genderless &&
      defenderGender !== CORE_GENDERS.genderless
    ) {
      if (attackerGender === defenderGender) {
        power = Math.floor(power * 1.25);
      } else {
        power = Math.floor(power * 0.75);
      }
    }
  }

  // Adamant Orb / Lustrous Orb / Griseous Orb
  // Source: Showdown data/items.ts
  if (!attackerHasKlutz && attackerItem) {
    if (
      attackerItem === CORE_ITEM_IDS.adamantOrb &&
      attacker.pokemon.speciesId === DIALGA_SPECIES_ID &&
      (effectiveMoveType === CORE_TYPE_IDS.dragon || effectiveMoveType === CORE_TYPE_IDS.steel)
    ) {
      power = pokeRound(power, 4915);
    }
    if (
      attackerItem === CORE_ITEM_IDS.lustrousOrb &&
      attacker.pokemon.speciesId === PALKIA_SPECIES_ID &&
      (effectiveMoveType === CORE_TYPE_IDS.water || effectiveMoveType === CORE_TYPE_IDS.dragon)
    ) {
      power = pokeRound(power, 4915);
    }
    if (
      attackerItem === CORE_ITEM_IDS.griseousOrb &&
      attacker.pokemon.speciesId === GIRATINA_SPECIES_ID &&
      (effectiveMoveType === CORE_TYPE_IDS.ghost || effectiveMoveType === CORE_TYPE_IDS.dragon)
    ) {
      power = pokeRound(power, 4915);
    }
  }

  // Terrain power modifiers (Gen 7)
  // Source: Showdown data/conditions.ts -- terrain onBasePower handlers
  if (context.state?.terrain) {
    const terrainGravity = context.state.gravity?.active ?? false;
    const attackerGrounded = isGen7Grounded(attacker, terrainGravity);
    const defenderGrounded = isGen7Grounded(defender, terrainGravity);

    const terrainMod = getTerrainDamageModifier(
      context.state.terrain.type,
      effectiveMoveType,
      move.id,
      attackerGrounded,
      defenderGrounded,
    );

    if (terrainMod.powerModifier !== null) {
      power = pokeRound(power, terrainMod.powerModifier);
    }

    // Grassy Terrain halves Earthquake/Bulldoze/Magnitude damage vs grounded target
    // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage
    if (terrainMod.grassyGroundHalved) {
      power = Math.floor(power / 2);
    }
  }

  // ---- Ability type immunities ----

  const gravityActive = context.state.gravity?.active ?? false;
  const ironBallGrounded =
    defender.pokemon.heldItem === CORE_ITEM_IDS.ironBall &&
    effectiveMoveType === CORE_TYPE_IDS.ground;

  if (!bypassesDefensiveAbilities) {
    const immuneType = ABILITY_TYPE_IMMUNITIES[defenderAbility];
    if (immuneType && effectiveMoveType === immuneType) {
      const isLevitateGrounded =
        defenderAbility === CORE_ABILITY_IDS.levitate &&
        effectiveMoveType === CORE_TYPE_IDS.ground &&
        (gravityActive || ironBallGrounded);
      if (!isLevitateGrounded) {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
    }
  }

  // Magnet Rise: Ground immunity (not ability-based, Mold Breaker does NOT bypass)
  // Source: Showdown -- Magnet Rise
  if (
    effectiveMoveType === CORE_TYPE_IDS.ground &&
    defender.volatileStatuses.has(CORE_VOLATILE_IDS.magnetRise) &&
    !gravityActive &&
    !ironBallGrounded
  ) {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // ---- Physical/Special determination ----

  const isPhysical = effectiveCategory === CORE_MOVE_CATEGORIES.physical;

  // Get effective stats
  let attack = getAttackStat(
    attacker,
    effectiveMoveType,
    isPhysical,
    isCrit,
    defender,
    bypassesDefensiveAbilities,
  );
  // Chip Away / Sacred Sword / Darkest Lariat: ignore target's defense stat stages
  // Source: Showdown data/moves.ts -- chipaway/sacredsword/darkestlariat: { ignoreDefensive: true }
  const IGNORE_DEFENSE_STAGE_MOVES: ReadonlySet<string> = new Set([
    "chip-away",
    "sacred-sword",
    "darkest-lariat",
  ]);
  const ignoreDefStages = IGNORE_DEFENSE_STAGE_MOVES.has(move.id);
  const defense = getDefenseStat(
    defender,
    isPhysical,
    isCrit,
    weather,
    attacker,
    bypassesDefensiveAbilities,
    ignoreDefStages,
  );

  let abilityMultiplier = 1;

  // Thick Fat: halves the attacker's effective stat for fire/ice moves
  // Source: Showdown -- Thick Fat
  if (
    !bypassesDefensiveAbilities &&
    defenderAbility === GEN7_ABILITY_IDS.thickFat &&
    (effectiveMoveType === CORE_TYPE_IDS.fire || effectiveMoveType === CORE_TYPE_IDS.ice)
  ) {
    attack = Math.floor(attack / 2);
    abilityMultiplier = 0.5;
  }

  // Heatproof: halves fire damage
  // Source: Showdown data/abilities.ts -- Heatproof
  if (
    !bypassesDefensiveAbilities &&
    defenderAbility === GEN7_ABILITY_IDS.heatproof &&
    effectiveMoveType === CORE_TYPE_IDS.fire
  ) {
    power = Math.floor(power / 2);
    abilityMultiplier *= 0.5;
  }

  // ---- Base formula ----

  // Source: Showdown sim/battle-actions.ts
  // baseDamage = tr(tr(tr(tr(2 * level / 5 + 2) * basePower * attack) / defense) / 50)
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50);

  // +2 is added in modifyDamage, before spread/weather/crit
  // Source: Showdown sim/battle-actions.ts
  baseDamage += 2;

  // ---- Modifier chain (modifyDamage order) ----

  // 2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
  // Source: Showdown sim/battle-actions.ts
  const isSpread =
    context.state.format !== "singles" &&
    (move.target === "all-adjacent-foes" ||
      move.target === "all-adjacent" ||
      move.target === "all-foes");
  if (isSpread) {
    baseDamage = pokeRound(baseDamage, 3072);
  }

  // 3. Weather modifier
  // Source: Showdown sim/battle-actions.ts
  let weatherMod = 1;
  if (weather === CORE_WEATHER_IDS.rain || weather === CORE_WEATHER_IDS.heavyRain) {
    if (effectiveMoveType === CORE_TYPE_IDS.water) {
      baseDamage = pokeRound(baseDamage, 6144); // 1.5x
      weatherMod = 1.5;
    } else if (effectiveMoveType === CORE_TYPE_IDS.fire) {
      if (weather === CORE_WEATHER_IDS.heavyRain) {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  } else if (weather === CORE_WEATHER_IDS.sun || weather === CORE_WEATHER_IDS.harshSun) {
    if (effectiveMoveType === CORE_TYPE_IDS.fire) {
      baseDamage = pokeRound(baseDamage, 6144); // 1.5x
      weatherMod = 1.5;
    } else if (effectiveMoveType === CORE_TYPE_IDS.water) {
      if (weather === CORE_WEATHER_IDS.harshSun) {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  }

  const rawBaseDamage = baseDamage;

  // 4. Critical hit: 1.5x via pokeRound in Gen 6+
  // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit: pokeRound(baseDamage, 6144)
  let critMultiplier = 1;
  if (isCrit) {
    critMultiplier = 1.5;
    baseDamage = pokeRound(baseDamage, 6144); // 1.5x crit

    // Sniper: additional 1.5x on top of 1.5x crit = 2.25x total
    // Source: Showdown data/abilities.ts -- Sniper onModifyDamage
    if (attackerAbility === GEN7_ABILITY_IDS.sniper) {
      baseDamage = pokeRound(baseDamage, 6144);
      critMultiplier = 2.25;
    }
  }

  // 5. Random factor: floor(baseDamage * randomRoll / 100) where roll is [85..100]
  // Source: Showdown sim/battle.ts randomizer()
  const randomRoll = rng.int(85, 100);
  const randomFactor = randomRoll / 100;
  baseDamage = Math.floor((baseDamage * randomRoll) / 100);

  // 6. STAB via pokeRound
  // Source: Showdown sim/battle-actions.ts
  const stabMod = getStabModifier(
    effectiveMoveType,
    attacker.types,
    attackerAbility === GEN7_ABILITY_IDS.adaptability,
  );
  if (stabMod > 1) {
    // 1.5x STAB = 6144/4096; 2.0x Adaptability = 8192/4096
    const stabModifier4096 = Math.round(stabMod * 4096);
    baseDamage = pokeRound(baseDamage, stabModifier4096);
  }

  // 7. Type effectiveness
  // Source: Showdown sim/battle-actions.ts
  // Gravity / Iron Ball: Ground moves ignore Flying-type immunity
  let effectiveDefenderTypes: readonly PokemonType[] = defender.types;
  if (
    (gravityActive || ironBallGrounded) &&
    effectiveMoveType === CORE_TYPE_IDS.ground &&
    defender.types.includes(CORE_TYPE_IDS.flying)
  ) {
    const nonFlyingTypes = defender.types.filter((t) => t !== CORE_TYPE_IDS.flying);
    effectiveDefenderTypes = nonFlyingTypes.length > 0 ? nonFlyingTypes : [CORE_TYPE_IDS.normal];
  }
  let effectiveness = getTypeEffectiveness(effectiveMoveType, effectiveDefenderTypes, typeChart);

  // Scrappy: Normal and Fighting hit Ghost
  // Source: Showdown data/abilities.ts -- Scrappy
  if (
    attackerAbility === GEN7_ABILITY_IDS.scrappy &&
    effectiveness === TYPE_EFFECTIVENESS_MULTIPLIERS.immune &&
    (effectiveMoveType === CORE_TYPE_IDS.normal || effectiveMoveType === CORE_TYPE_IDS.fighting) &&
    defender.types.includes(CORE_TYPE_IDS.ghost)
  ) {
    const nonGhostTypes = effectiveDefenderTypes.filter((t) => t !== CORE_TYPE_IDS.ghost);
    effectiveness =
      nonGhostTypes.length > 0
        ? getTypeEffectiveness(effectiveMoveType, nonGhostTypes, typeChart)
        : 1;
  }

  // If effectiveness === 0: type immunity -- return 0 damage
  if (effectiveness === TYPE_EFFECTIVENESS_MULTIPLIERS.immune) {
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor,
      breakdown: {
        baseDamage: rawBaseDamage,
        weatherMultiplier: weatherMod,
        critMultiplier: isCrit ? critMultiplier : 1,
        randomMultiplier: randomFactor,
        stabMultiplier: stabMod,
        typeMultiplier: 0,
        burnMultiplier: 1,
        abilityMultiplier,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
      effectiveCategory,
    };
  }

  // Wonder Guard: only super-effective moves hit
  // Source: Showdown data/abilities.ts -- Wonder Guard
  if (
    !bypassesDefensiveAbilities &&
    defenderAbility === CORE_ABILITY_IDS.wonderGuard &&
    effectiveness < TYPE_EFFECTIVENESS_MULTIPLIERS.superEffective
  ) {
    return {
      damage: 0,
      effectiveness,
      isCrit,
      randomFactor,
      breakdown: {
        baseDamage: rawBaseDamage,
        weatherMultiplier: weatherMod,
        critMultiplier: isCrit ? critMultiplier : 1,
        randomMultiplier: randomFactor,
        stabMultiplier: stabMod,
        typeMultiplier: effectiveness,
        burnMultiplier: 1,
        abilityMultiplier: 0,
        itemMultiplier: 1,
        otherMultiplier: 1,
        finalDamage: 0,
      },
      effectiveCategory,
    };
  }

  // Apply type effectiveness as integer multiplication
  // Source: Showdown sim/battle-actions.ts
  if (effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral) {
    let typeMod = effectiveness;
    while (typeMod >= 2) {
      baseDamage = baseDamage * 2;
      typeMod /= 2;
    }
  } else if (
    effectiveness < TYPE_EFFECTIVENESS_MULTIPLIERS.neutral &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.immune
  ) {
    let typeMod = effectiveness;
    while (typeMod <= 0.5) {
      baseDamage = Math.floor(baseDamage / 2);
      typeMod *= 2;
    }
  }

  // 8. Burn: pokeRound(baseDamage, 2048) = 0.5x for physical moves
  // Source: Showdown sim/battle-actions.ts
  // Gen 6+: Facade bypasses burn penalty
  // Source: Showdown sim/battle-actions.ts -- `this.battle.gen < 6 || move.id !== 'facade'`
  const hasBurn = isPhysical && attacker.pokemon.status === CORE_STATUS_IDS.burn;
  const gutsActive = attackerAbility === GEN7_ABILITY_IDS.guts && attacker.pokemon.status !== null;
  const facadeBypass = move.id === GEN7_MOVE_IDS.facade; // Gen 6+: Facade bypasses burn
  const burnApplied = hasBurn && !gutsActive && !facadeBypass;
  const burnMultiplier = burnApplied ? 0.5 : 1;
  if (burnApplied) {
    baseDamage = pokeRound(baseDamage, 2048);
  }

  // Tinted Lens: double damage if not very effective
  // Source: Showdown data/abilities.ts -- Tinted Lens
  if (
    attackerAbility === GEN7_ABILITY_IDS.tintedLens &&
    effectiveness < TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = baseDamage * 2;
    abilityMultiplier *= 2;
  }

  // Filter / Solid Rock: 0.75x damage if super effective.
  // Both have flags: { breakable: 1 } in Showdown -- bypassed by Mold Breaker.
  // Source: Showdown data/abilities.ts -- Filter/Solid Rock: flags: { breakable: 1 }
  if (
    !bypassesDefensiveAbilities &&
    (defenderAbility === GEN7_ABILITY_IDS.filter ||
      defenderAbility === GEN7_ABILITY_IDS.solidRock) &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = pokeRound(baseDamage, 3072); // 0.75x
    abilityMultiplier *= 0.75;
  }

  // Prism Armor (new in Gen 7): 0.75x damage if super effective.
  // Unlike Filter/Solid Rock, Prism Armor is NOT bypassed by Mold Breaker.
  // Source: Showdown data/abilities.ts -- prismarmo: onSourceModifyDamage (no breakable flag)
  // Source: Bulbapedia "Prism Armor" -- "reduces damage from super-effective moves by 25%"
  if (
    defenderAbility === GEN7_ABILITY_IDS.prismArmor &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = pokeRound(baseDamage, 3072); // 0.75x
    abilityMultiplier *= 0.75;
  }

  // Neuroforce (Ultra Necrozma ability): 1.25x damage on super-effective hits.
  // Source: Showdown data/abilities.ts -- neuroforce: onSourceModifyDamage chainModify([5120, 4096])
  // Source: Bulbapedia "Neuroforce" -- "increases damage dealt by super-effective moves by 25%"
  if (
    attackerAbility === GEN7_ABILITY_IDS.neuroforce &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = pokeRound(baseDamage, 5120); // 1.25x (5120/4096)
    abilityMultiplier *= 1.25;
  }

  // Screens: Reflect (physical), Light Screen (special), Aurora Veil (both): 0.5x in singles
  // Aurora Veil is a new Gen 7 screen that halves both physical and special damage.
  // Screens do NOT apply on crits.
  // Brick Break and Psychic Fangs bypass/break screens.
  // Source: Showdown sim/battle-actions.ts -- screens in modifyDamage
  // Source: Bulbapedia "Aurora Veil" -- halves damage from physical and special moves
  let screenMultiplier = 1;
  const screenBypassMoves: ReadonlySet<string> = new Set([
    GEN7_MOVE_IDS.brickBreak,
    GEN7_MOVE_IDS.psychicFangs,
  ]);
  if (!isCrit && !screenBypassMoves.has(move.id)) {
    const sides = context.state?.sides;
    if (sides) {
      const defenderSideIndex = sides[0]?.active?.includes(defender) ? 0 : 1;
      const defenderSide = sides[defenderSideIndex];
      if (defenderSide?.screens) {
        const hasReflect =
          isPhysical &&
          defenderSide.screens.some((s: { type: string }) => s.type === CORE_SCREEN_IDS.reflect);
        const hasLightScreen =
          !isPhysical &&
          defenderSide.screens.some(
            (s: { type: string }) => s.type === CORE_SCREEN_IDS.lightScreen,
          );
        const hasAuroraVeil = defenderSide.screens.some(
          (s: { type: string }) => s.type === CORE_SCREEN_IDS.auroraVeil,
        );
        if (hasReflect || hasLightScreen || hasAuroraVeil) {
          baseDamage = Math.floor(baseDamage / 2);
          screenMultiplier = 0.5;
        }
      }
    }
  }

  // Minimum 1 damage after burn, abilities, and screens
  if (!baseDamage) baseDamage = 1;

  // 9. Final modifier (Life Orb, Expert Belt, etc.)
  // Source: Showdown sim/battle-actions.ts
  let itemMultiplier = 1;

  // Life Orb: pokeRound(baseDamage, 5324) ~= 1.3x
  // Source: Showdown data/items.ts -- Life Orb onModifyDamage
  if (!attackerHasKlutz && attackerItem === GEN7_ITEM_IDS.lifeOrb) {
    baseDamage = pokeRound(baseDamage, 5324);
    itemMultiplier = 5324 / 4096;
  }

  // Expert Belt: 1.2x for super-effective moves
  // Source: Showdown data/items.ts -- Expert Belt
  if (
    !attackerHasKlutz &&
    attackerItem === GEN7_ITEM_IDS.expertBelt &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = pokeRound(baseDamage, 4915); // ~1.2x
    itemMultiplier = 4915 / 4096;
  }

  // Muscle Band: 1.1x for physical moves
  // Source: Showdown data/items.ts -- Muscle Band
  if (!attackerHasKlutz && attackerItem === GEN7_ITEM_IDS.muscleBand && isPhysical) {
    baseDamage = pokeRound(baseDamage, 4505); // ~1.1x
    itemMultiplier = 4505 / 4096;
  }

  // Wise Glasses: 1.1x for special moves
  // Source: Showdown data/items.ts -- Wise Glasses
  if (!attackerHasKlutz && attackerItem === GEN7_ITEM_IDS.wiseGlasses && !isPhysical) {
    baseDamage = pokeRound(baseDamage, 4505); // ~1.1x
    itemMultiplier = 4505 / 4096;
  }

  // Metronome item: consecutive use boost
  // Source: Showdown data/items.ts -- Metronome onModifyDamage
  if (!attackerHasKlutz && attackerItem === GEN7_ITEM_IDS.metronome) {
    const metronomeState = attacker.volatileStatuses.get(CORE_VOLATILE_IDS.metronomeCount);
    if (metronomeState?.data?.count) {
      const boostSteps = Math.min((metronomeState.data.count as number) - 1, 5);
      if (boostSteps > 0) {
        const multiplier4096 = Math.round((1 + boostSteps * 0.2) * 4096);
        baseDamage = pokeRound(baseDamage, multiplier4096);
        itemMultiplier = 1 + boostSteps * 0.2;
      }
    }
  }

  // Type-resist berries: halve SE damage of the matching type (consumed).
  // Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
  let typeResistBerryConsumed: string | null = null;
  const defenderItemForBerry = defender.pokemon.heldItem;
  const defenderHasKlutzForBerry = defender.ability === CORE_ABILITY_IDS.klutz;
  const defenderHasEmbargoForBerry = defender.volatileStatuses.has(CORE_VOLATILE_IDS.embargo);
  const magicRoomActive = context.state?.magicRoom?.active ?? false;
  if (
    defenderItemForBerry &&
    !defenderHasKlutzForBerry &&
    !defenderHasEmbargoForBerry &&
    !magicRoomActive
  ) {
    const resistType = TYPE_RESIST_BERRIES[defenderItemForBerry];
    if (resistType && resistType === effectiveMoveType) {
      // Chilan Berry activates on any Normal-type hit; others require SE
      // Source: Showdown data/items.ts -- Chilan Berry: onSourceModifyDamage (no SE check)
      if (
        resistType === CORE_TYPE_IDS.normal ||
        effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
      ) {
        baseDamage = pokeRound(baseDamage, 2048); // 0.5x via pokeRound
        typeResistBerryConsumed = defenderItemForBerry;
      }
    }
  }

  // Z-Move through Protect: 0.25x modifier
  // Source: Showdown sim/battle-actions.ts -- Z-Moves bypass Protect at 0.25x damage
  // Source: Bulbapedia "Z-Move" -- "deals a quarter of its damage" through Protect
  if (context.hitThroughProtect) {
    baseDamage = pokeRound(baseDamage, 1024); // 0.25x via pokeRound (1024/4096)
  }

  // 10. Minimum 1 damage (unless type immune)
  // Source: Showdown sim/battle-actions.ts -- minimum 1 damage
  const finalDamage = Math.max(1, baseDamage);

  // Consume type-resist berry if activated
  // Source: Showdown data/items.ts -- type-resist berries: consumed after activation
  if (typeResistBerryConsumed) {
    consumeHeldItem(defender, typeResistBerryConsumed);
    if (
      defender.ability === CORE_ABILITY_IDS.unburden &&
      !defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
    ) {
      defender.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
    }
  }

  // Track type-resist berry in itemMultiplier for breakdown
  if (typeResistBerryConsumed) {
    itemMultiplier = itemMultiplier === 1 ? 0.5 : itemMultiplier * 0.5;
  }

  // Consume gem if activated; trigger Unburden
  // Source: Showdown data/abilities.ts -- Unburden: onAfterUseItem speed doubling
  if (gemConsumed) {
    consumeHeldItem(attacker, attackerItem);
    if (
      attacker.ability === CORE_ABILITY_IDS.unburden &&
      !attacker.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
    ) {
      attacker.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
    }
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.gemUsed as VolatileStatus, { turnsLeft: 1 });
  }

  const breakdown: DamageBreakdown = {
    baseDamage: rawBaseDamage,
    weatherMultiplier: weatherMod,
    critMultiplier: isCrit ? critMultiplier : 1,
    randomMultiplier: randomFactor,
    stabMultiplier: stabMod,
    typeMultiplier: effectiveness,
    burnMultiplier,
    abilityMultiplier,
    itemMultiplier,
    otherMultiplier: screenMultiplier,
    finalDamage,
  };

  return {
    damage: finalDamage,
    effectiveness,
    isCrit,
    randomFactor,
    breakdown,
    effectiveCategory,
  };
}
