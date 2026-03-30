import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import { getEffectiveStatStage } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, TypeChartLookup } from "@pokemon-lib-ts/core";
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
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
  pokeRound,
  TYPE_EFFECTIVENESS_MULTIPLIERS,
} from "@pokemon-lib-ts/core";
import { GEN6_MOVE_IDS } from "./data/reference-ids.js";
import { isGen6Grounded } from "./Gen6EntryHazards.js";
import { getTerrainDamageModifier } from "./Gen6Terrain.js";
import { isWeatherSuppressedGen6 } from "./Gen6Weather.js";

const LATIAS_SPECIES_ID = 380;
const LATIOS_SPECIES_ID = 381;
const CLAMPERL_SPECIES_ID = 366;
const PIKACHU_SPECIES_ID = 25;
const CUBONE_SPECIES_ID = 104;
const MAROWAK_SPECIES_ID = 105;
const DIALGA_SPECIES_ID = 483;
const PALKIA_SPECIES_ID = 484;
const GIRATINA_SPECIES_ID = 487;

// ---- Type-Resist Berries ----

/**
 * Type-resist berries: halve super-effective damage of the matching type, then consumed.
 * Gen 6 adds Roseli Berry (Fairy) to the list from Gen 4-5.
 * Chilan Berry activates on any Normal-type hit (no super-effective requirement).
 *
 * Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
 * Source: Bulbapedia -- "Roseli Berry" halves damage from Fairy-type moves
 */
export const TYPE_RESIST_BERRIES: Readonly<Record<string, PokemonType>> = {
  ...BASE_TYPE_RESIST_BERRIES,
  // NEW in Gen 6:
  // Source: Bulbapedia "Roseli Berry" -- halves damage from Fairy-type moves
  // Source: Showdown data/items.ts -- roseliberry: type Fairy, onSourceModifyDamage
  [CORE_ITEM_IDS.roseliBerry]: CORE_TYPE_IDS.fairy,
};

// Re-exported for backwards compatibility; canonical implementation lives in core.
export { pokeRound };

// ---- Type-Boosting Items ----

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Applied via onBasePower in Showdown.
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 */
const TYPE_BOOST_ITEMS = BASE_TYPE_BOOST_ITEMS;

/**
 * Plate items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same multiplier as type-boost items.
 *
 * Gen 6 adds Pixie Plate for Fairy type.
 *
 * Source: Showdown data/items.ts -- Flame Plate etc. use onBasePower with
 *   chainModify([4915, 4096])
 */
const PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  ...BASE_PLATE_ITEMS,
  // Source: Bulbapedia "Pixie Plate" -- introduced in Gen 6 with Fairy type
  [CORE_ITEM_IDS.pixiePlate]: CORE_TYPE_IDS.fairy,
};

// ---- Gem Items (Gen 6) ----

/**
 * Type Gem items: consume on use to boost base power of matching type moves.
 * In Gen 6, only Normal Gem remains in the committed item data.
 *
 * Source: packages/gen6/data/items.json -- only `normal-gem` is present in Gen 6 data
 * Source: Bulbapedia "Gem" -- most Gems are unavailable from Gen VI onward
 */
const GEM_ITEMS: Readonly<Record<string, string>> = {
  [CORE_ITEM_IDS.normalGem]: CORE_TYPE_IDS.normal,
};

/**
 * Gen 6 gem boost multiplier in 4096-based math.
 * 1.3x = Math.round(1.3 * 4096) = 5325
 *
 * Source: Showdown data/items.ts -- gem onBasePower: chainModify([5325, 4096]) in Gen 6+
 * Source: Bulbapedia "Gem" Gen 6 -- gem boost nerfed from 1.5x to 1.3x
 */
const GEN6_GEM_MODIFIER = 5325; // 1.3x in 4096-based math

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
      // Any chance-based status infliction counts (e.g., Flamethrower 10% burn)
      return true;

    case "stat-change":
      // Foe-targeted stat changes with a chance are eligible (Acid Spray, Bulldoze, etc.)
      if (effect.target === CORE_MOVE_EFFECT_TARGETS.foe && effect.chance > 0) return true;
      // Self-targeted stat changes from secondary.self (e.g., Flame Charge Speed boost)
      if (effect.target === CORE_MOVE_EFFECT_TARGETS.self && effect.fromSecondary === true)
        return true;
      return false;

    case "volatile-status":
      // Volatile-status secondaries include flinch (Fake Out, Air Slash)
      // and confusion (Dynamic Punch, etc.)
      // Source: Showdown data/moves.ts -- fakeout, dynamicpunch use secondary field
      return effect.chance > 0;

    case "multi":
      // Recursively check sub-effects
      return effect.effects.some((e) => hasSheerForceEligibleEffect(e));

    default:
      return false;
  }
}

/**
 * Moves with secondary effects in Showdown stored as custom onHit functions.
 * These can't be detected from MoveEffect alone, so we use a whitelist.
 *
 * Source: Showdown data/moves.ts -- moves with secondaries as onHit
 */
const SHEER_FORCE_WHITELIST: ReadonlySet<string> = new Set([
  GEN6_MOVE_IDS.triAttack,
  GEN6_MOVE_IDS.secretPower,
  GEN6_MOVE_IDS.relicSong,
]);

function isSheerForceEligibleMove(effect: MoveEffect | null, moveId: string): boolean {
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_WHITELIST.has(moveId);
}

// ---- Attack Stat Calculation ----

/**
 * Get the effective attack stat for a move in Gen 6.
 *
 * Same physical/special split as Gen 4-5 (per-move, not per-type).
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 6 attack stat
 */
function getAttackStat(
  attacker: ActivePokemon,
  moveType: PokemonType,
  isPhysical: boolean,
  isCrit: boolean,
  weather: string | null,
  defender?: ActivePokemon,
): number {
  const statKey = isPhysical ? CORE_STAT_IDS.attack : CORE_STAT_IDS.spAttack;
  const stats = attacker.pokemon.calculatedStats;
  let rawStat = stats ? stats[statKey] : 100;

  const ability = attacker.ability;
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;
  const attackerHasKlutz = ability === CORE_ABILITY_IDS.klutz;

  // Huge Power / Pure Power: doubles physical attack
  // Source: Showdown -- Huge Power / Pure Power
  if (isPhysical && (ability === "huge-power" || ability === "pure-power")) {
    rawStat = rawStat * 2;
  }

  // Choice Band (physical) / Choice Specs (special): 1.5x raw stat
  // Source: Showdown data/items.ts -- Choice Band / Choice Specs
  if (!attackerHasKlutz && isPhysical && attackerItem === "choice-band") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }
  if (!attackerHasKlutz && !isPhysical && attackerItem === "choice-specs") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Soul Dew: Gen 6 behavior -- 1.5x SpAtk for Latias (380) / Latios (381)
  // Source: Showdown sim/items.ts -- Soul Dew Gen 3-6 behavior
  // Note: Gen 7+ changed Soul Dew to boost moves, not stats
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "soul-dew" &&
    (attackerSpecies === LATIAS_SPECIES_ID || attackerSpecies === LATIOS_SPECIES_ID)
  ) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Showdown sim/items.ts -- Deep Sea Tooth
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "deep-sea-tooth" &&
    attackerSpecies === CLAMPERL_SPECIES_ID
  ) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x Atk AND SpAtk for Pikachu (25)
  // Source: Showdown sim/items.ts -- Light Ball Gen 4+ behavior
  if (
    !attackerHasKlutz &&
    attackerItem === "light-ball" &&
    attackerSpecies === PIKACHU_SPECIES_ID
  ) {
    rawStat = rawStat * 2;
  }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105)
  // Source: Showdown sim/items.ts -- Thick Club
  if (
    !attackerHasKlutz &&
    isPhysical &&
    attackerItem === "thick-club" &&
    (attackerSpecies === CUBONE_SPECIES_ID || attackerSpecies === MAROWAK_SPECIES_ID)
  ) {
    rawStat = rawStat * 2;
  }

  // Hustle: 1.5x physical attack
  // Source: Showdown -- Hustle
  if (isPhysical && ability === "hustle") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Guts: 1.5x physical attack when statused
  // Source: Showdown -- Guts
  if (isPhysical && ability === "guts" && attacker.pokemon.status !== null) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Slow Start: halve Attack for the first 5 turns
  // Source: Showdown data/abilities.ts -- Slow Start
  if (
    isPhysical &&
    ability === "slow-start" &&
    attacker.volatileStatuses.has(CORE_VOLATILE_IDS.slowStart)
  ) {
    rawStat = Math.floor(rawStat / 2);
  }

  // Defeatist: halve Attack and SpAttack when HP <= 50%
  // Source: Bulbapedia -- Defeatist
  // Source: Showdown data/abilities.ts -- Defeatist
  if (ability === "defeatist") {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    if (attacker.pokemon.currentHp <= Math.floor(maxHp / 2)) {
      rawStat = Math.floor(rawStat / 2);
    }
  }

  // Flash Fire volatile: 1.5x Atk and SpAtk for Fire-type moves
  // Source: Showdown data/abilities.ts -- flashfire condition onModifyAtk/onModifySpA: chainModify(1.5)
  if (moveType === "fire" && attacker.volatileStatuses.has(CORE_VOLATILE_IDS.flashFire)) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Flower Gift: 1.5x Atk in sun/harsh-sun (attacker's own ability)
  // Source: Showdown data/abilities.ts -- flower-gift: onModifyAtk returns chainModify(1.5)
  if (isPhysical && ability === "flower-gift" && (weather === "sun" || weather === "harsh-sun")) {
    rawStat = Math.floor((rawStat * 150) / 100);
  }

  // Pinch abilities (Blaze, Overgrow, Torrent, Swarm): 1.5x Atk/SpAtk when HP <= 1/3
  // Source: Showdown data/abilities.ts -- blaze/overgrow/torrent/swarm: onModifyAtk, onModifySpA (stat modifier)
  const pinchType = PINCH_ABILITY_TYPES[ability];
  if (pinchType && moveType === pinchType) {
    const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
    const threshold = Math.floor(maxHp / 3);
    if (attacker.pokemon.currentHp <= threshold) {
      rawStat = Math.floor((rawStat * 150) / 100);
    }
  }

  // Apply stat stages (with Simple/Unaware adjustments)
  const statKey2 = isPhysical ? CORE_STAT_IDS.attack : CORE_STAT_IDS.spAttack;
  const stage = getEffectiveStatStage(attacker, statKey2, defender);

  // On crit: ignore negative attack stages (use 0 instead), keep positive
  // Source: Showdown -- crit ignores negative attack stages
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  const effective = Math.floor(rawStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ---- Defense Stat Calculation ----

/**
 * Get the effective defense stat for a move in Gen 6.
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 6 defense stat
 */
function getDefenseStat(
  defender: ActivePokemon,
  isPhysical: boolean,
  isCrit: boolean,
  weather: string | null,
  attacker?: ActivePokemon,
  ignoreDefenseStages?: boolean,
): number {
  const statKey = isPhysical ? CORE_STAT_IDS.defense : CORE_STAT_IDS.spDefense;
  const stats = defender.pokemon.calculatedStats;
  let baseStat = stats ? stats[statKey] : 100;

  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;
  const defenderHasKlutz = defender.ability === CORE_ABILITY_IDS.klutz;

  // Soul Dew: Gen 6 behavior -- 1.5x SpDef for Latias (380) / Latios (381)
  // Source: Showdown sim/items.ts -- Soul Dew Gen 3-6 behavior
  if (
    !defenderHasKlutz &&
    !isPhysical &&
    defenderItem === "soul-dew" &&
    (defenderSpecies === LATIAS_SPECIES_ID || defenderSpecies === LATIOS_SPECIES_ID)
  ) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Deep Sea Scale: 2x SpDef for Clamperl (366)
  // Source: Showdown sim/items.ts -- Deep Sea Scale
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

  // Assault Vest (NEW in Gen 6): 1.5x SpDef
  // Source: Showdown data/items.ts -- Assault Vest onModifySpD
  // Source: Bulbapedia "Assault Vest" -- introduced in Gen 6, raises SpDef by 50%
  if (!defenderHasKlutz && !isPhysical && defenderItem === CORE_ITEM_IDS.assaultVest) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Marvel Scale: 1.5x physical Defense when statused
  // Source: Showdown data/abilities.ts -- Marvel Scale
  const moldBreaker =
    attacker?.ability === "mold-breaker" ||
    attacker?.ability === "teravolt" ||
    attacker?.ability === "turboblaze";
  if (
    isPhysical &&
    !moldBreaker &&
    defender.ability === "marvel-scale" &&
    defender.pokemon.status !== null
  ) {
    baseStat = Math.floor(baseStat * 1.5);
  }

  // Fur Coat (NEW in Gen 6): 2x physical Defense
  // Source: Showdown data/abilities.ts -- Fur Coat onModifyDef
  // Source: Bulbapedia "Fur Coat" -- introduced in Gen 6, doubles Defense stat
  if (isPhysical && !moldBreaker && defender.ability === "fur-coat") {
    baseStat = baseStat * 2;
  }

  // Sandstorm Rock SpDef boost: 1.5x SpDef for Rock-types in sandstorm
  // Source: Bulbapedia -- Sandstorm: "Rock-type Pokemon have their Special Defense
  //   raised by 50% during a sandstorm. (Generation IV+)"
  if (!isPhysical && weather === "sand" && defender.types.includes("rock")) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Flower Gift: 1.5x SpDef in Harsh Sunlight
  // Source: Showdown data/abilities.ts -- Flower Gift
  if (!isPhysical && !moldBreaker && weather === "sun" && defender.ability === "flower-gift") {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Stat stages
  const defStatKey = isPhysical ? CORE_STAT_IDS.defense : CORE_STAT_IDS.spDefense;
  const stage = getEffectiveStatStage(defender, defStatKey, attacker, CORE_STAT_IDS.defense);

  // Chip Away / Sacred Sword: ignore all defense stat stages
  // Source: Showdown data/moves.ts -- chipaway/sacredsword: { ignoreDefensive: true }
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
 * In Gen 6, Knock Off gets a 1.5x damage boost if the target holds a removable item.
 * Mega Stones matching the holder's species are NOT removable.
 *
 * Source: Showdown sim/battle-actions.ts -- Knock Off boost check
 * Source: Bulbapedia "Knock Off" Gen 6 -- 1.5x damage if target has removable item
 */
function isRemovableItem(item: string, _defenderSpeciesId: number): boolean {
  if (!item) return false;

  // Mega Stones are not removable
  // Source: Showdown data/items.ts -- mega stones have megaStone property
  // We check for the "-ite" suffix pattern that all mega stones follow,
  // plus special cases like "blue-orb" and "red-orb" (primal stones)
  const MEGA_STONE_SUFFIX_ITEMS: ReadonlySet<string> = new Set([
    // Primal reversion orbs
    "blue-orb",
    "red-orb",
  ]);

  if (MEGA_STONE_SUFFIX_ITEMS.has(item)) return false;

  // Eviolite ends with "ite" but is NOT a Mega Stone -- it is a standard removable item.
  // Must be checked before the suffix heuristic to avoid false positives.
  // Source: Showdown data/items.ts -- Eviolite has no megaStone/megaEvolves property
  // Fix: GitHub #610
  if (item === "eviolite") return true;

  // Check for mega stone naming pattern: ends with "-ite" or specific known mega stones
  // Source: Showdown data/items.ts -- mega stones are identified by megaStone/megaEvolves property
  // In practice, mega stones end in "ite" (e.g., "venusaurite", "charizardite-x")
  if (item.endsWith("ite") || item.endsWith("ite-x") || item.endsWith("ite-y")) return false;

  return true;
}

// ---- Main Damage Formula ----

/**
 * Calculate damage for a move in Gen 6.
 *
 * Gen 6 (X/Y/Omega Ruby/Alpha Sapphire) uses the same 4096-based modifier system
 * as Gen 5, with several key changes:
 *
 *   - Crit multiplier: 1.5x (was 2.0x in Gen 5)
 *   - Gem boost: 1.3x via pokeRound (was 1.5x floor multiply in Gen 5)
 *   - Knock Off: 1.5x base power when target holds a removable item (NEW)
 *   - Fairy type in effectiveness (handled by type chart)
 *   - Assault Vest: 1.5x SpDef (NEW)
 *   - Fur Coat: 2x Defense (NEW)
 *   - Pixie Plate: Fairy type boost item (NEW)
 *   - Facade bypasses burn penalty (NEW in Gen 6)
 *
 * Formula order follows Showdown's modifyDamage() (battle-actions.ts):
 *   1. Base formula: floor(floor((2*L/5+2) * Power * Atk / Def) / 50) + 2
 *   2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
 *   3. Weather modifier: pokeRound(baseDamage, 6144 or 2048) = 1.5x or 0.5x
 *   4. Critical hit: pokeRound(baseDamage, 6144) = 1.5x (Gen 6+ uses pokeRound)
 *   5. Random factor: floor(baseDamage * (100 - random(0,15)) / 100) (integer math)
 *   6. STAB: pokeRound(baseDamage, 6144) = 1.5x, or 8192 for Adaptability = 2.0x
 *   7. Type effectiveness: integer multiply/divide
 *   8. Burn: pokeRound(baseDamage, 2048) = 0.5x (physical only, Facade exempt in Gen 6)
 *   9. Final modifier (Life Orb etc.): pokeRound(baseDamage, modifier)
 *  10. Minimum 1 damage (unless type immune)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 6 damage formula
 * Source: Bulbapedia "Damage" -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */
export function calculateGen6Damage(
  context: DamageContext,
  typeChart: TypeChartLookup,
): DamageResult {
  const { attacker, defender, move, rng, isCrit } = context;

  // 1. Status moves / power=0 -> no damage
  // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
  if (move.category === CORE_MOVE_CATEGORIES.status || move.power === null || move.power === 0) {
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
  const attackerAbility = attacker.ability;
  // Cloud Nine / Air Lock suppress weather for damage calculation purposes.
  // Source: Showdown sim/battle.ts — suppressingWeather() gates all weather-based damage modifiers
  const rawWeather = context.state.weather?.type ?? null;
  const weather = isWeatherSuppressedGen6(attacker, defender) ? null : rawWeather;

  // -ate abilities + Normalize: type-changing abilities
  // Order: -ate abilities (Normal -> their type), then Normalize (all -> Normal)
  // Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate: onModifyTypePriority -1
  // Source: Showdown data/abilities.ts -- normalize: onModifyTypePriority -2
  let effectiveMoveType: PokemonType = move.type;
  let ateBoostApplied = false;

  // -ate abilities: change Normal-type moves to the ability's type + 1.3x power
  // Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate:
  //   onModifyType: if move.type === 'Normal', change to ability type
  //   onBasePower: chainModify([5325, 4096]) = 1.3x
  const ATE_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
    aerilate: "flying",
    pixilate: "fairy",
    refrigerate: "ice",
  };

  const ateType = ATE_ABILITY_TYPES[attackerAbility];
  if (move.type === "normal" && ateType) {
    effectiveMoveType = ateType;
    ateBoostApplied = true;
  }

  // Normalize: all moves become Normal type (overrides -ate abilities)
  // Source: Showdown data/abilities.ts -- Normalize
  if (attackerAbility === "normalize") {
    effectiveMoveType = "normal";
    ateBoostApplied = false; // Normalize overrides -ate
  }

  // Klutz check
  const attackerHasKlutz = attackerAbility === "klutz";
  const attackerItem = attacker.pokemon.heldItem;

  // ---- Pre-damage base power modifications ----

  // SolarBeam half power in rain/sand/hail (NOT sun)
  // Source: Showdown -- SolarBeam power halved in non-sun weather
  if (
    move.id === "solar-beam" &&
    weather !== null &&
    weather !== "sun" &&
    weather !== "harsh-sun"
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
    move.id === GEN6_MOVE_IDS.facade &&
    attacker.pokemon.status !== null &&
    attacker.pokemon.status !== CORE_STATUS_IDS.sleep
  ) {
    power = power * 2;
  }

  // Gem boost: 1.3x base power in Gen 6 (consumed before damage)
  // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096]) in Gen 6+
  // Source: Bulbapedia "Gem" Gen 6 -- gem boost nerfed from 1.5x to 1.3x
  const attackerHasEmbargo = attacker.volatileStatuses.has(CORE_VOLATILE_IDS.embargo);
  let gemConsumed = false;
  if (!attackerHasKlutz && !attackerHasEmbargo && attackerItem) {
    const gemType = GEM_ITEMS[attackerItem];
    if (gemType && gemType === effectiveMoveType) {
      // Gen 6: 1.3x via pokeRound (was floor(power * 1.5) in Gen 5)
      power = pokeRound(power, GEN6_GEM_MODIFIER);
      gemConsumed = true;
    }
  }

  // Type-boost items (Charcoal, etc.) and Plates (incl. Pixie Plate): 4915/4096 base power
  // Source: Showdown data/items.ts -- onBasePower with chainModify([4915, 4096])
  // Uses pokeRound (not Math.floor) to match Showdown's chainModify behavior.
  // Fix: GitHub #611
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

  // Knock Off (Gen 6+): 1.5x base power when target holds a removable item
  // Source: Showdown data/moves.ts -- knockoff onBasePower:
  //   if (target.item && this.dex.items.get(target.item).gen !== undefined) chainModify(1.5)
  // Source: Bulbapedia "Knock Off" Gen 6 -- 1.5x damage if target has removable item
  if (move.id === "knock-off" && defender.pokemon.heldItem) {
    if (isRemovableItem(defender.pokemon.heldItem, defender.pokemon.speciesId)) {
      power = pokeRound(power, 6144); // 1.5x
    }
  }

  // Dry Skin fire weakness: ~1.25x (5120/4096) base power for Fire moves against Dry Skin
  // Source: Showdown data/abilities.ts -- Dry Skin onBasePower: chainModify([5120, 4096])
  const moldBreaker =
    attackerAbility === "mold-breaker" ||
    attackerAbility === "teravolt" ||
    attackerAbility === "turboblaze";
  if (!moldBreaker && defenderAbility === "dry-skin" && effectiveMoveType === "fire") {
    power = pokeRound(power, 5120);
  }

  // Technician: 1.5x (6144/4096) power for moves with base power <= 60
  // Source: Showdown data/abilities.ts -- Technician: chainModify([6144, 4096])
  if (attackerAbility === "technician" && power <= 60) {
    power = pokeRound(power, 6144);
  }

  // Iron Fist: ~1.2x (4915/4096) power for punching moves
  // Source: Showdown data/abilities.ts -- Iron Fist: chainModify([4915, 4096])
  if (attackerAbility === "iron-fist" && move.flags.punch) {
    power = pokeRound(power, 4915);
  }

  // Tough Claws: ~1.3x (5325/4096) power for contact moves
  // Source: Showdown data/abilities.ts -- toughclaws: onBasePowerPriority 21,
  //   this.chainModify([5325, 4096])
  if (attackerAbility === "tough-claws" && move.flags.contact) {
    power = pokeRound(power, 5325);
  }

  // Strong Jaw: 1.5x (6144/4096) power for bite moves
  // Source: Showdown data/abilities.ts -- strongjaw: onBasePowerPriority 19,
  //   this.chainModify(1.5)
  if (attackerAbility === "strong-jaw" && move.flags.bite) {
    power = pokeRound(power, 6144);
  }

  // Mega Launcher: 1.5x (6144/4096) power for pulse moves
  // Source: Showdown data/abilities.ts -- megalauncher: onBasePowerPriority 19,
  //   this.chainModify(1.5)
  if (attackerAbility === "mega-launcher" && move.flags.pulse) {
    power = pokeRound(power, 6144);
  }

  // -ate abilities power boost: 1.3x (5325/4096) when type was changed
  // Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate:
  //   onBasePowerPriority 23, chainModify([5325, 4096])
  if (ateBoostApplied) {
    power = pokeRound(power, 5325);
  }

  // Reckless: ~1.2x (4915/4096) power for moves with recoil or crash damage
  // Source: Showdown data/abilities.ts -- Reckless: "if (move.recoil || move.hasCrashDamage)"
  //   chainModify([4915, 4096])
  if (attackerAbility === "reckless" && (hasRecoilEffect(move.effect) || move.hasCrashDamage)) {
    power = pokeRound(power, 4915);
  }

  // Sheer Force: 1.3x (5325/4096) power for moves with secondary effects
  // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
  if (attackerAbility === "sheer-force" && isSheerForceEligibleMove(move.effect, move.id)) {
    power = pokeRound(power, 5325);
  }

  // Venoshock: doubles power when target is poisoned or badly poisoned
  // Source: Showdown data/moves.ts -- venoshock: onBasePower chainModify(2)
  if (
    move.id === "venoshock" &&
    (defender.pokemon.status === CORE_STATUS_IDS.poison ||
      defender.pokemon.status === CORE_STATUS_IDS.badlyPoisoned)
  ) {
    power = power * 2;
  }

  // Hex: doubles power when target has any primary status condition
  // Source: Showdown data/moves.ts -- hex: onBasePower chainModify(2)
  if (move.id === "hex" && defender.pokemon.status !== null) {
    power = power * 2;
  }

  // Acrobatics: doubles power when holder has no item
  // Source: Showdown data/moves.ts -- Acrobatics basePowerCallback
  if (move.id === "acrobatics" && !attackerItem) {
    power = power * 2;
  }

  // Round: doubles power when an ally used Round earlier this turn
  // Source: Showdown data/moves.ts -- round.basePowerCallback
  if (move.id === "round") {
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
            active.lastMoveUsed === "round" &&
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
  if (attackerAbility === "rivalry") {
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
      attackerItem === "adamant-orb" &&
      attacker.pokemon.speciesId === DIALGA_SPECIES_ID &&
      (effectiveMoveType === "dragon" || effectiveMoveType === "steel")
    ) {
      power = pokeRound(power, 4915);
    }
    if (
      attackerItem === "lustrous-orb" &&
      attacker.pokemon.speciesId === PALKIA_SPECIES_ID &&
      (effectiveMoveType === "water" || effectiveMoveType === "dragon")
    ) {
      power = pokeRound(power, 4915);
    }
    if (
      attackerItem === "griseous-orb" &&
      attacker.pokemon.speciesId === GIRATINA_SPECIES_ID &&
      (effectiveMoveType === "ghost" || effectiveMoveType === "dragon")
    ) {
      power = pokeRound(power, 4915);
    }
  }

  // Terrain power modifiers (Gen 6+)
  // Source: Bulbapedia "Electric Terrain" Gen 6 -- 1.5x Electric for grounded attacker
  // Source: Bulbapedia "Grassy Terrain" Gen 6 -- 1.5x Grass for grounded attacker
  // Source: Bulbapedia "Misty Terrain" Gen 6 -- 0.5x Dragon vs grounded defender
  // Source: Showdown data/conditions.ts -- terrain onBasePower handlers
  if (context.state?.terrain) {
    const terrainGravity = context.state.gravity?.active ?? false;
    const attackerGrounded = isGen6Grounded(attacker, terrainGravity);
    const defenderGrounded = isGen6Grounded(defender, terrainGravity);

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
    // This is a separate halving applied to base power, not stacked with the Grass boost
    if (terrainMod.grassyGroundHalved) {
      power = Math.floor(power / 2);
    }
  }

  // ---- Ability type immunities ----

  const gravityActive = context.state.gravity?.active ?? false;
  const ironBallGrounded =
    defender.pokemon.heldItem === CORE_ITEM_IDS.ironBall &&
    effectiveMoveType === CORE_TYPE_IDS.ground;

  if (!moldBreaker) {
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

  const isPhysical = move.category === CORE_MOVE_CATEGORIES.physical;

  // Get effective stats
  let attack = getAttackStat(attacker, effectiveMoveType, isPhysical, isCrit, weather, defender);
  // Chip Away / Sacred Sword: ignore target's defense stat stages
  // Source: Showdown data/moves.ts -- chipaway/sacredsword: { ignoreDefensive: true }
  const IGNORE_DEFENSE_STAGE_MOVES: ReadonlySet<string> = new Set(["chip-away", "sacred-sword"]);
  const ignoreDefStages = IGNORE_DEFENSE_STAGE_MOVES.has(move.id);
  const defense = getDefenseStat(defender, isPhysical, isCrit, weather, attacker, ignoreDefStages);

  let abilityMultiplier = 1;

  // Thick Fat: halves the attacker's effective stat for fire/ice moves
  // Source: Showdown -- Thick Fat
  if (
    !moldBreaker &&
    defenderAbility === "thick-fat" &&
    (effectiveMoveType === "fire" || effectiveMoveType === "ice")
  ) {
    attack = Math.floor(attack / 2);
    abilityMultiplier = 0.5;
  }

  // Heatproof: halves fire damage
  // Source: Showdown data/abilities.ts -- Heatproof
  if (!moldBreaker && defenderAbility === "heatproof" && effectiveMoveType === "fire") {
    power = Math.floor(power / 2);
    abilityMultiplier *= 0.5;
  }

  // ---- Base formula ----

  // Source: Showdown sim/battle-actions.ts line 1718
  // baseDamage = tr(tr(tr(tr(2 * level / 5 + 2) * basePower * attack) / defense) / 50)
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * attack) / defense) / 50);

  // +2 is added in modifyDamage, before spread/weather/crit
  // Source: Showdown sim/battle-actions.ts line 1731
  baseDamage += 2;

  // ---- Modifier chain (modifyDamage order) ----

  // 2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
  // Source: Showdown sim/battle-actions.ts line 1733-1737
  const isSpread =
    context.state.format !== "singles" &&
    (move.target === "all-adjacent-foes" ||
      move.target === "all-adjacent" ||
      move.target === "all-foes");
  if (isSpread) {
    baseDamage = pokeRound(baseDamage, 3072);
  }

  // 3. Weather modifier
  // Source: Showdown sim/battle-actions.ts line 1746
  let weatherMod = 1;
  if (weather === "rain" || weather === "heavy-rain") {
    if (effectiveMoveType === "water") {
      baseDamage = pokeRound(baseDamage, 6144); // 1.5x
      weatherMod = 1.5;
    } else if (effectiveMoveType === "fire") {
      if (weather === "heavy-rain") {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  } else if (weather === "sun" || weather === "harsh-sun") {
    if (effectiveMoveType === "fire") {
      baseDamage = pokeRound(baseDamage, 6144); // 1.5x
      weatherMod = 1.5;
    } else if (effectiveMoveType === "water") {
      if (weather === "harsh-sun") {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  }

  const rawBaseDamage = baseDamage;

  // 4. Critical hit: 1.5x via pokeRound in Gen 6+ (was integer *2 in Gen 5)
  // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit: pokeRound(baseDamage, 6144)
  // Source: Bulbapedia "Critical hit" Gen 6 -- multiplier reduced from 2x to 1.5x
  let critMultiplier = 1;
  if (isCrit) {
    // Sniper: 2.25x crit multiplier (1.5x * 1.5x = 2.25x, Showdown rounds via pokeRound)
    // Source: Showdown data/abilities.ts -- Sniper onModifyDamage: basePower * 3 (Gen5) or chainModify(1.5) on top of 1.5x crit (Gen6)
    // In Gen 6+, Sniper gives an additional 1.5x on top of the 1.5x crit = 2.25x total
    // Showdown applies sniper as a separate chainModify after crit
    critMultiplier = 1.5;
    baseDamage = pokeRound(baseDamage, 6144); // 1.5x crit

    if (attackerAbility === "sniper") {
      baseDamage = pokeRound(baseDamage, 6144); // additional 1.5x from Sniper
      critMultiplier = 2.25;
    }
  }

  // 5. Random factor: floor(baseDamage * (100 - random(0,15)) / 100)
  // Source: Showdown sim/battle.ts randomizer()
  // random(16) gives 0-15, so range is 85-100
  const randomRoll = rng.int(85, 100);
  const randomFactor = randomRoll / 100;
  baseDamage = Math.floor((baseDamage * randomRoll) / 100);

  // 6. STAB via pokeRound
  // Source: Showdown sim/battle-actions.ts line 1757-1793
  const stabMod = getStabModifier(
    effectiveMoveType,
    attacker.types,
    attackerAbility === "adaptability",
  );
  if (stabMod > 1) {
    // 1.5x STAB = 6144/4096; 2.0x Adaptability = 8192/4096
    const stabModifier4096 = Math.round(stabMod * 4096);
    baseDamage = pokeRound(baseDamage, stabModifier4096);
  }

  // 7. Type effectiveness
  // Source: Showdown sim/battle-actions.ts lines 1795-1812
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
    attackerAbility === "scrappy" &&
    effectiveness === TYPE_EFFECTIVENESS_MULTIPLIERS.immune &&
    (effectiveMoveType === "normal" || effectiveMoveType === "fighting") &&
    defender.types.includes("ghost")
  ) {
    const nonGhostTypes = effectiveDefenderTypes.filter((t) => t !== "ghost");
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
    };
  }

  // Wonder Guard: only super-effective moves hit
  // Source: Showdown data/abilities.ts -- Wonder Guard
  if (
    !moldBreaker &&
    defenderAbility === "wonder-guard" &&
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
    };
  }

  // Apply type effectiveness as integer multiplication
  // Source: Showdown sim/battle-actions.ts lines 1799-1811
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
  // Source: Showdown sim/battle-actions.ts lines 1816-1820
  // Gen 6+: Facade bypasses burn penalty
  // Source: Showdown sim/battle-actions.ts -- `this.battle.gen < 6 || move.id !== 'facade'`
  const hasBurn = isPhysical && attacker.pokemon.status === CORE_STATUS_IDS.burn;
  const gutsActive = attackerAbility === "guts" && attacker.pokemon.status !== null;
  const facadeBypass = move.id === "facade"; // Gen 6+: Facade bypasses burn
  const burnApplied = hasBurn && !gutsActive && !facadeBypass;
  const burnMultiplier = burnApplied ? 0.5 : 1;
  if (burnApplied) {
    baseDamage = pokeRound(baseDamage, 2048);
  }

  // Tinted Lens: double damage if not very effective
  // Source: Showdown data/abilities.ts -- Tinted Lens
  if (attackerAbility === "tinted-lens" && effectiveness < TYPE_EFFECTIVENESS_MULTIPLIERS.neutral) {
    baseDamage = baseDamage * 2;
    abilityMultiplier *= 2;
  }

  // Filter / Solid Rock: 0.75x damage if super effective
  // Source: Showdown data/abilities.ts -- Filter / Solid Rock
  if (
    !moldBreaker &&
    (defenderAbility === "filter" || defenderAbility === "solid-rock") &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = pokeRound(baseDamage, 3072); // 0.75x
    abilityMultiplier *= 0.75;
  }

  // Minimum 1 damage after burn and abilities
  if (!baseDamage) baseDamage = 1;

  // 9. Final modifier (Life Orb, Expert Belt, etc.)
  // Source: Showdown sim/battle-actions.ts line 1826
  let itemMultiplier = 1;

  // Life Orb: pokeRound(baseDamage, 5324) ~= 1.3x
  // Source: Showdown data/items.ts -- Life Orb onModifyDamage
  if (!attackerHasKlutz && attackerItem === "life-orb") {
    baseDamage = pokeRound(baseDamage, 5324);
    itemMultiplier = 5324 / 4096;
  }

  // Expert Belt: 1.2x for super-effective moves
  // Source: Showdown data/items.ts -- Expert Belt
  if (
    !attackerHasKlutz &&
    attackerItem === "expert-belt" &&
    effectiveness > TYPE_EFFECTIVENESS_MULTIPLIERS.neutral
  ) {
    baseDamage = pokeRound(baseDamage, 4915); // ~1.2x
    itemMultiplier = 4915 / 4096;
  }

  // Muscle Band: 1.1x for physical moves
  // Source: Showdown data/items.ts -- Muscle Band
  if (!attackerHasKlutz && attackerItem === "muscle-band" && isPhysical) {
    baseDamage = pokeRound(baseDamage, 4505); // ~1.1x
    itemMultiplier = 4505 / 4096;
  }

  // Wise Glasses: 1.1x for special moves
  // Source: Showdown data/items.ts -- Wise Glasses
  if (!attackerHasKlutz && attackerItem === "wise-glasses" && !isPhysical) {
    baseDamage = pokeRound(baseDamage, 4505); // ~1.1x
    itemMultiplier = 4505 / 4096;
  }

  // Metronome item: consecutive use boost
  // Source: Showdown data/items.ts -- Metronome onModifyDamage
  if (!attackerHasKlutz && attackerItem === "metronome") {
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
  // Chilan Berry (Normal) activates on any Normal-type hit (no SE requirement).
  // Klutz, Embargo, or Magic Room suppresses the berry.
  // Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
  // Source: Bulbapedia -- type-resist berries: "Weakens a supereffective [type]-type move"
  // Source: Showdown data/moves.ts -- Magic Room: "Items have no effect" (suppresses berries)
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
        baseDamage = pokeRound(baseDamage, 2048); // 0.5x via pokeRound in Gen 5+
        typeResistBerryConsumed = defenderItemForBerry;
      }
    }
  }

  // 10. Minimum 1 damage (unless type immune, which returns 0 above)
  // Source: Showdown sim/battle-actions.ts -- minimum 1 damage
  const finalDamage = Math.max(1, baseDamage);

  // Consume the type-resist berry if it activated.
  // Direct mutation is consistent with gem consumption and Gen 4 resist berry pattern.
  // Unburden: if defender has Unburden ability and loses its item, activate the volatile.
  // Source: Showdown data/items.ts -- type-resist berries: consumed after activation
  // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is consumed"
  if (typeResistBerryConsumed) {
    defender.pokemon.heldItem = null;
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

  // Consume gem if activated; trigger Unburden if attacker has the ability
  // Source: Showdown data/abilities.ts -- Unburden: onAfterUseItem speed doubling
  if (gemConsumed) {
    attacker.pokemon.heldItem = null;
    if (
      attacker.ability === CORE_ABILITY_IDS.unburden &&
      !attacker.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
    ) {
      attacker.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
    }
    // Mark gem-used so item-theft checks know the attacker consumed an item
    // Source: Showdown data/moves.ts -- thief/covet: source.volatiles['gem'] guard
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.gemUsed, {
      turnsLeft: 1,
    });
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
