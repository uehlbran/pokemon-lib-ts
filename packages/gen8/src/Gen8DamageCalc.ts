/**
 * Gen 8 (Sword/Shield) damage calculation.
 *
 * The Gen 8 damage formula is fundamentally the same as Gen 7, using the 4096-based
 * modifier system (pokeRound). Key differences from Gen 7:
 *
 *   - Terrain boost nerfed: 1.3x (5325/4096) instead of 1.5x (6144/4096)
 *   - Body Press: uses user's Defense stat instead of Attack
 *   - Behemoth Blade/Bash/Dynamax Cannon: 2x damage vs Dynamaxed targets
 *   - Gorilla Tactics (new ability): 1.5x physical attack
 *   - Intrepid Sword (new ability): +1 Attack on switch-in (handled by engine, not here)
 *   - Soul Dew behavior: same as Gen 7 (1.2x Dragon/Psychic for Latias/Latios)
 *   - Z-Moves removed (no Z-Crystal handling needed)
 *   - Mega Evolution removed
 *   - -ate abilities remain 1.2x (same as Gen 7)
 *   - Normal Gem still the only available gem
 *   - Parental Bond second hit: 0.25x (same as Gen 7)
 *   - Facade bypasses burn penalty (same as Gen 6-7)
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
 * Source: Showdown sim/battle-actions.ts -- Gen 8 damage formula
 * Source: Showdown data/mods/gen8/scripts.ts -- Gen 8 terrain nerf
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */

import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import { getEffectiveStatStage } from "@pokemon-lib-ts/battle";
import {
  BASE_PINCH_ABILITY_TYPES,
  BASE_PLATE_ITEMS,
  BASE_TYPE_BOOST_ITEMS,
} from "@pokemon-lib-ts/battle/data";
import type {
  MoveEffect,
  PokemonType,
  TypeChartLookup,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  getStabModifier,
  getStatStageMultiplier,
  getTypeEffectiveness,
  pokeRound,
} from "@pokemon-lib-ts/core";
import { isWeatherSuppressedGen8 } from "./Gen8Weather.js";

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

// ---- Type-Resist Berries ----

/**
 * Type-resist berries: halve super-effective damage of the matching type, then consumed.
 * Same set as Gen 6-7 (includes Roseli Berry for Fairy).
 * Chilan Berry activates on any Normal-type hit (no super-effective requirement).
 *
 * Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
 * Source: Bulbapedia -- type-resist berries
 */
export const TYPE_RESIST_BERRIES: Readonly<Record<string, PokemonType>> = {
  "occa-berry": "fire",
  "passho-berry": "water",
  "wacan-berry": "electric",
  "rindo-berry": "grass",
  "yache-berry": "ice",
  "chople-berry": "fighting",
  "kebia-berry": "poison",
  "shuca-berry": "ground",
  "coba-berry": "flying",
  "payapa-berry": "psychic",
  "tanga-berry": "bug",
  "charti-berry": "rock",
  "kasib-berry": "ghost",
  "haban-berry": "dragon",
  "colbur-berry": "dark",
  "babiri-berry": "steel",
  "chilan-berry": "normal",
  "roseli-berry": "fairy",
};

// ---- Type-Boosting Items ----

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same as Gen 6-7.
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 */
const TYPE_BOOST_ITEMS = BASE_TYPE_BOOST_ITEMS;

/**
 * Plate items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same set as Gen 6-7 (includes Pixie Plate).
 *
 * Source: Showdown data/items.ts -- Flame Plate etc. use onBasePower with
 *   chainModify([4915, 4096])
 */
const PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  ...BASE_PLATE_ITEMS,
  "pixie-plate": "fairy",
};

// ---- Gem Items (Gen 8) ----

/**
 * Gen 8 gem items: only Normal Gem remains available (same as Gen 7).
 * Other gems were removed from standard gameplay after Gen 5.
 * Boost is 1.3x (5325/4096), same as Gen 6-7.
 *
 * Source: Showdown data/items.ts -- normalGem: onBasePower chainModify([5325, 4096])
 * Source: Bulbapedia "Gem" -- "From Generation VII onwards, only Normal Gem is available."
 */
const GEM_ITEMS: Readonly<Record<string, string>> = {
  "normal-gem": "normal",
};

/**
 * Gen 8 gem boost multiplier in 4096-based math.
 * 1.3x = Math.round(1.3 * 4096) = 5325
 *
 * Source: Showdown data/items.ts -- gem onBasePower: chainModify([5325, 4096]) in Gen 6+
 */
const GEN8_GEM_MODIFIER = 5325; // 1.3x in 4096-based math

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
const ABILITY_TYPE_IMMUNITIES: Readonly<Record<string, string>> = {
  levitate: "ground",
  "volt-absorb": "electric",
  "water-absorb": "water",
  "flash-fire": "fire",
  "motor-drive": "electric",
  "dry-skin": "water",
  "storm-drain": "water",
  "lightning-rod": "electric",
  "sap-sipper": "grass",
};

// ---- Anti-Dynamax Moves ----

/**
 * Moves that deal 2x damage against Dynamaxed Pokemon.
 *
 * Source: Showdown data/conditions.ts:785-786 -- Behemoth Blade/Bash + Dynamax Cannon
 * Source: Bulbapedia -- "Behemoth Blade, Behemoth Bash, and Dynamax Cannon deal
 *   double damage to Dynamaxed Pokemon."
 */
const ANTI_DYNAMAX_MOVES: ReadonlySet<string> = new Set([
  "behemoth-blade",
  "behemoth-bash",
  "dynamax-cannon",
]);

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
      return true;

    case "stat-change":
      if (effect.target === "foe" && effect.chance > 0) return true;
      if (effect.target === "self" && effect.fromSecondary === true) return true;
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
  "tri-attack",
  "secret-power",
  "relic-song",
]);

function isSheerForceEligibleMove(effect: MoveEffect | null, moveId: string): boolean {
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_WHITELIST.has(moveId);
}

// ---- Grounding Check ----

/**
 * Check if a Pokemon is grounded (affected by terrain and ground-based effects).
 * Same logic as Gen 6-7 grounding check.
 *
 * Source: Showdown sim/pokemon.ts -- isGrounded()
 * Source: Bulbapedia -- grounding mechanics
 */
export function isGen8Grounded(pokemon: ActivePokemon, gravityActive: boolean): boolean {
  if (gravityActive) return true;
  if (pokemon.volatileStatuses.has("ingrain")) return true;

  const itemsSuppressed = pokemon.ability === "klutz" || pokemon.volatileStatuses.has("embargo");
  if (pokemon.pokemon.heldItem === "iron-ball" && !itemsSuppressed) return true;
  if (pokemon.volatileStatuses.has("smackdown" as VolatileStatus)) return true;

  if (pokemon.types.includes("flying")) return false;
  if (pokemon.ability === "levitate") return false;
  if (
    pokemon.pokemon.heldItem === "air-balloon" &&
    !itemsSuppressed &&
    pokemon.pokemon.currentHp > 0
  ) {
    return false;
  }
  if (pokemon.volatileStatuses.has("magnet-rise")) return false;
  if (pokemon.volatileStatuses.has("telekinesis" as VolatileStatus)) return false;

  return true;
}

// ---- Terrain Damage Modifier ----

/**
 * Get terrain-based damage modifier for the power step.
 *
 * Gen 8 terrain boost is 1.3x (nerfed from 1.5x in Gen 7).
 * Gen 8 retains Psychic Terrain: 1.3x Psychic moves for grounded attacker.
 *
 * Source: Showdown data/mods/gen8/scripts.ts -- terrain boost nerfed to 1.3x in Gen 8
 * Source: Bulbapedia -- terrain damage modifiers (Gen 8)
 * Source: Showdown data/conditions.ts -- terrain onBasePower handlers
 */
interface TerrainDamageModifier {
  readonly powerModifier: number | null;
  readonly grassyGroundHalved: boolean;
}

/**
 * Gen 8 terrain boost modifier: 1.3x (5325/4096).
 * Changed from 1.5x (6144/4096) in Gen 7.
 *
 * Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 5325/4096 in Gen 8
 */
const TERRAIN_BOOST_MODIFIER = 5325; // 1.3x in 4096-based math (was 6144 = 1.5x in Gen 7)

const GRASSY_HALVED_MOVES: ReadonlySet<string> = new Set(["earthquake", "bulldoze", "magnitude"]);

function getTerrainDamageModifier(
  terrainType: string,
  moveType: string,
  moveId: string,
  attackerGrounded: boolean,
  defenderGrounded: boolean,
): TerrainDamageModifier {
  let powerModifier: number | null = null;
  let grassyGroundHalved = false;

  // Electric Terrain: 1.3x for Electric moves when attacker is grounded
  // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x
  if (terrainType === "electric" && moveType === "electric" && attackerGrounded) {
    powerModifier = TERRAIN_BOOST_MODIFIER;
  }

  // Grassy Terrain: 1.3x for Grass moves when attacker is grounded
  // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x
  if (terrainType === "grassy" && moveType === "grass" && attackerGrounded) {
    powerModifier = TERRAIN_BOOST_MODIFIER;
  }

  // Misty Terrain: 0.5x for Dragon moves when defender is grounded
  // Source: Showdown data/conditions.ts -- mistyterrain.onBasePower
  if (terrainType === "misty" && moveType === "dragon" && defenderGrounded) {
    powerModifier = 2048;
  }

  // Psychic Terrain: 1.3x for Psychic moves when attacker is grounded
  // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x
  if (terrainType === "psychic" && moveType === "psychic" && attackerGrounded) {
    powerModifier = TERRAIN_BOOST_MODIFIER;
  }

  // Grassy Terrain: halve damage from Earthquake/Bulldoze/Magnitude vs grounded
  // Source: Showdown data/conditions.ts -- grassyterrain.onModifyDamage
  if (terrainType === "grassy" && defenderGrounded && GRASSY_HALVED_MOVES.has(moveId)) {
    grassyGroundHalved = true;
  }

  return { powerModifier, grassyGroundHalved };
}

// ---- Attack Stat Calculation ----

/**
 * Get the effective attack stat for a move in Gen 8.
 *
 * Same as Gen 7 except:
 *   - Body Press: uses user's Defense stat instead of Attack
 *   - Gorilla Tactics: 1.5x physical attack
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 8 attack stat
 * Source: Showdown data/moves.ts -- Body Press: overrideOffensiveStat: 'def'
 * Source: Showdown data/abilities.ts -- Gorilla Tactics: onModifyAtk 1.5x
 */
function getAttackStat(
  attacker: ActivePokemon,
  _moveType: PokemonType,
  isPhysical: boolean,
  isCrit: boolean,
  moveId: string,
  defender?: ActivePokemon,
): number {
  // Body Press: uses user's Defense instead of Attack
  // Source: Showdown data/moves.ts -- bodypress: overrideOffensiveStat: 'def'
  // Source: Bulbapedia "Body Press" -- "Body Press inflicts damage using the user's
  //   Defense stat instead of its Attack stat."
  const isBodyPress = moveId === "body-press";

  let statKey: string;
  if (isBodyPress) {
    statKey = "defense";
  } else {
    statKey = isPhysical ? "attack" : "spAttack";
  }

  const stats = attacker.pokemon.calculatedStats;
  let rawStat = stats ? stats[statKey as keyof typeof stats] : 100;

  const ability = attacker.ability;
  const attackerItem = attacker.pokemon.heldItem;
  const attackerSpecies = attacker.pokemon.speciesId;
  const attackerHasKlutz = ability === "klutz";

  // Huge Power / Pure Power: doubles physical attack
  // Source: Showdown -- Huge Power / Pure Power
  if (isPhysical && !isBodyPress && (ability === "huge-power" || ability === "pure-power")) {
    rawStat = rawStat * 2;
  }

  // Gorilla Tactics (new in Gen 8): 1.5x physical attack
  // Source: Showdown data/abilities.ts -- Gorilla Tactics: onModifyAtk multiply 1.5
  // Source: Bulbapedia "Gorilla Tactics" -- "boosts the Pokemon's Attack stat by 50%,
  //   but only allows the use of the first selected move."
  if (isPhysical && !isBodyPress && ability === "gorilla-tactics") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Choice Band (physical) / Choice Specs (special): 1.5x raw stat
  // Source: Showdown data/items.ts -- Choice Band / Choice Specs
  if (!attackerHasKlutz && !isBodyPress && isPhysical && attackerItem === "choice-band") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }
  if (!attackerHasKlutz && !isPhysical && attackerItem === "choice-specs") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Soul Dew: Gen 8 -- same as Gen 7, no longer boosts stats.
  // In Gen 7+, Soul Dew boosts Dragon and Psychic moves by 1.2x (handled in power mods).
  // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower, not onModifyAtk/SpA

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Showdown data/items.ts -- Deep Sea Tooth
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "deep-sea-tooth" &&
    attackerSpecies === CLAMPERL_SPECIES_ID
  ) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x Atk AND SpAtk for Pikachu (25)
  // Source: Showdown data/items.ts -- Light Ball Gen 4+ behavior
  if (
    !attackerHasKlutz &&
    attackerItem === "light-ball" &&
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
    !isBodyPress &&
    attackerItem === "thick-club" &&
    (attackerSpecies === CUBONE_SPECIES_ID || attackerSpecies === MAROWAK_SPECIES_ID)
  ) {
    rawStat = rawStat * 2;
  }

  // Hustle: 1.5x physical attack
  // Source: Showdown -- Hustle
  if (isPhysical && !isBodyPress && ability === "hustle") {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Guts: 1.5x physical attack when statused
  // Source: Showdown -- Guts
  if (isPhysical && !isBodyPress && ability === "guts" && attacker.pokemon.status !== null) {
    rawStat = Math.floor((150 * rawStat) / 100);
  }

  // Slow Start: halve Attack for the first 5 turns
  // Source: Showdown data/abilities.ts -- Slow Start
  if (
    isPhysical &&
    !isBodyPress &&
    ability === "slow-start" &&
    attacker.volatileStatuses.has("slow-start")
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

  // Apply stat stages (with Simple/Unaware adjustments)
  // Body Press uses defense stat stages
  const stageKey = isBodyPress ? "defense" : isPhysical ? "attack" : "spAttack";
  const stage = getEffectiveStatStage(attacker, stageKey, defender);

  // On crit: ignore negative attack stages (use 0 instead), keep positive
  // Source: Showdown -- crit ignores negative attack stages
  const effectiveStage = isCrit && stage < 0 ? 0 : stage;

  const effective = Math.floor(rawStat * getStatStageMultiplier(effectiveStage));

  return Math.max(1, effective);
}

// ---- Defense Stat Calculation ----

/**
 * Get the effective defense stat for a move in Gen 8.
 *
 * Same as Gen 7.
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 8 defense stat
 */
function getDefenseStat(
  defender: ActivePokemon,
  isPhysical: boolean,
  isCrit: boolean,
  weather: string | null,
  attacker?: ActivePokemon,
  ignoreDefenseStages?: boolean,
): number {
  const statKey = isPhysical ? "defense" : "spDefense";
  const stats = defender.pokemon.calculatedStats;
  let baseStat = stats ? stats[statKey] : 100;

  const defenderItem = defender.pokemon.heldItem;
  const defenderSpecies = defender.pokemon.speciesId;
  const defenderHasKlutz = defender.ability === "klutz";

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
  if (!defenderHasKlutz && !isPhysical && defenderItem === "assault-vest") {
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

  // Fur Coat: 2x physical Defense
  // Source: Showdown data/abilities.ts -- Fur Coat onModifyDef
  if (isPhysical && !moldBreaker && defender.ability === "fur-coat") {
    baseStat = baseStat * 2;
  }

  // Ice Face (new in Gen 8): handled by engine (transforms Eiscue form), not here
  // Source: Showdown data/abilities.ts -- Ice Face

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
  const defStatKey = isPhysical ? "defense" : "spDefense";
  const stage = getEffectiveStatStage(defender, defStatKey, attacker, "defense");

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
 * Same logic as Gen 7, but no Z-Crystals in Gen 8.
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

  // Z-Crystals not present in Gen 8 (removed)
  // Source: Showdown data/mods/gen8 -- Z-Crystals not in Gen 8

  // Check for mega stone naming pattern
  // Source: Showdown data/items.ts -- mega stones identified by megaStone/megaEvolves property
  if (item.endsWith("ite") || item.endsWith("ite-x") || item.endsWith("ite-y")) return false;

  // Rusted Sword / Rusted Shield: not removable (needed for Crowned forms)
  // Source: Showdown data/items.ts -- Rusted Sword/Shield have forcedForme property
  if (item === "rusted-sword" || item === "rusted-shield") return false;

  return true;
}

// ---- -ate Abilities (Gen 8) ----

/**
 * -ate abilities: change Normal-type moves to the ability's type + 1.2x power in Gen 8.
 * Same as Gen 7 (was 1.3x in Gen 6).
 *
 * Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate/galvanize:
 *   onModifyType: if move.type === 'Normal', change to ability type
 *   Gen 7-8: onBasePower chainModify([4915, 4096]) = 1.2x
 * Source: Bulbapedia -- "-ate abilities 1.2x in Gen 7+"
 */
const ATE_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  aerilate: "flying",
  pixilate: "fairy",
  refrigerate: "ice",
  galvanize: "electric",
};

/**
 * -ate ability power boost in Gen 8: 1.2x (4915/4096).
 * Same as Gen 7.
 *
 * Source: Showdown data/abilities.ts -- Gen 7-8 -ate abilities: chainModify([4915, 4096])
 */
const GEN8_ATE_MODIFIER = 4915; // 1.2x in 4096-based math

// ---- Main Damage Formula ----

/**
 * Calculate damage for a move in Gen 8.
 *
 * See module-level JSDoc for the full modifier order and Gen 8 differences.
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 8 damage formula
 * Source: Showdown data/mods/gen8/scripts.ts -- Gen 8 terrain nerf
 * Source: Bulbapedia "Damage" -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */
export function calculateGen8Damage(
  context: DamageContext,
  typeChart: TypeChartLookup,
): DamageResult {
  const { attacker, defender, move, rng, isCrit } = context;

  // 1. Status moves / power=0 -> no damage
  // Source: Showdown sim/battle-actions.ts -- status moves skip damage calc
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
  const attackerAbility = attacker.ability;
  // Cloud Nine / Air Lock suppress weather for damage calculation purposes.
  // Source: Showdown sim/battle.ts — suppressingWeather() gates all weather-based damage modifiers
  const rawWeather = context.state.weather?.type ?? null;
  const weather = isWeatherSuppressedGen8(attacker, defender) ? null : rawWeather;

  // -ate abilities + Normalize + Galvanize: type-changing abilities
  // Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate/galvanize: onModifyTypePriority -1
  // Source: Showdown data/abilities.ts -- normalize: onModifyTypePriority -2
  let effectiveMoveType: PokemonType = move.type;
  let ateBoostApplied = false;

  // -ate abilities: change Normal-type moves to the ability's type + 1.2x power (Gen 8)
  const ateType = ATE_ABILITY_TYPES[attackerAbility];
  if (move.type === "normal" && ateType) {
    effectiveMoveType = ateType;
    ateBoostApplied = true;
  }

  // Normalize: all moves become Normal type + 1.2x boost in Gen 7+
  // Source: Showdown data/abilities.ts -- Normalize Gen 7+: includes 1.2x power boost
  if (attackerAbility === "normalize") {
    effectiveMoveType = "normal";
    ateBoostApplied = true;
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

  // Gem boost: only Normal Gem available in Gen 8, 1.3x via pokeRound
  // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096])
  const attackerHasEmbargo = attacker.volatileStatuses.has("embargo");
  let gemConsumed = false;
  if (!attackerHasKlutz && !attackerHasEmbargo && attackerItem) {
    const gemType = GEM_ITEMS[attackerItem];
    if (gemType && gemType === effectiveMoveType) {
      power = pokeRound(power, GEN8_GEM_MODIFIER);
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

  // Soul Dew (Gen 7+): 1.2x (4915/4096) for Dragon and Psychic moves used by
  // Latias (380) / Latios (381)
  // Source: Showdown data/items.ts -- Soul Dew Gen 7+: onBasePower: chainModify([4915, 4096])
  if (
    !attackerHasKlutz &&
    attackerItem === "soul-dew" &&
    (attacker.pokemon.speciesId === LATIAS_SPECIES_ID ||
      attacker.pokemon.speciesId === LATIOS_SPECIES_ID) &&
    (effectiveMoveType === "psychic" || effectiveMoveType === "dragon")
  ) {
    power = pokeRound(power, 4915);
  }

  // Knock Off (Gen 6+): 1.5x base power when target holds a removable item
  // Source: Showdown data/moves.ts -- knockoff onBasePower
  if (move.id === "knock-off" && defender.pokemon.heldItem) {
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
  if (effectiveMoveType === "fire" && attacker.volatileStatuses.has("flash-fire")) {
    power = Math.floor(power * 1.5);
  }

  // Dry Skin fire weakness: 1.25x base power for Fire moves against Dry Skin
  // Source: Showdown data/abilities.ts -- Dry Skin (priority 17)
  const moldBreaker =
    attackerAbility === "mold-breaker" ||
    attackerAbility === "teravolt" ||
    attackerAbility === "turboblaze";
  if (!moldBreaker && defenderAbility === "dry-skin" && effectiveMoveType === "fire") {
    power = Math.floor(power * 1.25);
  }

  // Technician: 1.5x power for moves with base power <= 60
  // Source: Showdown data/abilities.ts -- Technician (priority 30)
  if (attackerAbility === "technician" && power <= 60) {
    power = Math.floor(power * 1.5);
  }

  // Iron Fist: 1.2x power for punching moves
  // Source: Showdown data/abilities.ts -- Iron Fist
  if (attackerAbility === "iron-fist" && move.flags.punch) {
    power = Math.floor(power * 1.2);
  }

  // Tough Claws: ~1.3x (5325/4096) power for contact moves
  // Source: Showdown data/abilities.ts -- toughclaws: onBasePowerPriority 21
  if (attackerAbility === "tough-claws" && move.flags.contact) {
    power = pokeRound(power, 5325);
  }

  // Strong Jaw: 1.5x (6144/4096) power for bite moves
  // Source: Showdown data/abilities.ts -- strongjaw: onBasePowerPriority 19
  if (attackerAbility === "strong-jaw" && move.flags.bite) {
    power = pokeRound(power, 6144);
  }

  // Mega Launcher: 1.5x (6144/4096) power for pulse moves
  // Source: Showdown data/abilities.ts -- megalauncher: onBasePowerPriority 19
  if (attackerAbility === "mega-launcher" && move.flags.pulse) {
    power = pokeRound(power, 6144);
  }

  // -ate / Normalize / Galvanize power boost: 1.2x (4915/4096) in Gen 8
  // Source: Showdown data/abilities.ts -- Gen 7-8 -ate abilities: chainModify([4915, 4096])
  if (ateBoostApplied) {
    power = pokeRound(power, GEN8_ATE_MODIFIER);
  }

  // Reckless: 1.2x power for moves with recoil
  // Source: Showdown data/abilities.ts -- Reckless
  if (attackerAbility === "reckless" && (hasRecoilEffect(move.effect) || move.hasCrashDamage)) {
    power = Math.floor(power * 1.2);
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
    (defender.pokemon.status === "poison" || defender.pokemon.status === "badly-poisoned")
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
      attackerGender !== "genderless" &&
      defenderGender !== "genderless"
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

  // Anti-Dynamax moves: 2x power vs Dynamaxed targets
  // Source: Showdown data/conditions.ts:785-786 -- Behemoth Blade/Bash + Dynamax Cannon
  // Source: Bulbapedia -- "Behemoth Blade, Behemoth Bash, and Dynamax Cannon deal
  //   double damage to Dynamaxed Pokemon."
  if (ANTI_DYNAMAX_MOVES.has(move.id) && defender.isDynamaxed) {
    power = power * 2;
  }

  // Terrain power modifiers (Gen 8)
  // Source: Showdown data/mods/gen8/scripts.ts -- terrain boost 1.3x
  if (context.state?.terrain) {
    const terrainGravity = context.state.gravity?.active ?? false;
    const attackerGrounded = isGen8Grounded(attacker, terrainGravity);
    const defenderGrounded = isGen8Grounded(defender, terrainGravity);

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
    defender.pokemon.heldItem === "iron-ball" && effectiveMoveType === "ground";

  if (!moldBreaker) {
    const immuneType = ABILITY_TYPE_IMMUNITIES[defenderAbility];
    if (immuneType && effectiveMoveType === immuneType) {
      const isLevitateGrounded =
        defenderAbility === "levitate" &&
        effectiveMoveType === "ground" &&
        (gravityActive || ironBallGrounded);
      if (!isLevitateGrounded) {
        return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
      }
    }
  }

  // Magnet Rise: Ground immunity (not ability-based, Mold Breaker does NOT bypass)
  // Source: Showdown -- Magnet Rise
  if (
    effectiveMoveType === "ground" &&
    defender.volatileStatuses.has("magnet-rise") &&
    !gravityActive &&
    !ironBallGrounded
  ) {
    return { damage: 0, effectiveness: 0, isCrit, randomFactor: 1 };
  }

  // ---- Physical/Special determination ----

  const isPhysical = move.category === "physical";

  // Get effective stats
  const attack = getAttackStat(attacker, effectiveMoveType, isPhysical, isCrit, move.id, defender);
  // Chip Away / Sacred Sword / Darkest Lariat: ignore target's defense stat stages
  // Source: Showdown data/moves.ts -- chipaway/sacredsword/darkestlariat: { ignoreDefensive: true }
  const IGNORE_DEFENSE_STAGE_MOVES: ReadonlySet<string> = new Set([
    "chip-away",
    "sacred-sword",
    "darkest-lariat",
  ]);
  const ignoreDefStages = IGNORE_DEFENSE_STAGE_MOVES.has(move.id);
  const defense = getDefenseStat(defender, isPhysical, isCrit, weather, attacker, ignoreDefStages);

  let abilityMultiplier = 1;

  // Thick Fat: halves the attacker's effective stat for fire/ice moves
  // Source: Showdown -- Thick Fat
  let effectiveAttack = attack;
  if (
    !moldBreaker &&
    defenderAbility === "thick-fat" &&
    (effectiveMoveType === "fire" || effectiveMoveType === "ice")
  ) {
    effectiveAttack = Math.floor(attack / 2);
    abilityMultiplier = 0.5;
  }

  // Heatproof: halves fire damage
  // Source: Showdown data/abilities.ts -- Heatproof
  if (!moldBreaker && defenderAbility === "heatproof" && effectiveMoveType === "fire") {
    power = Math.floor(power / 2);
    abilityMultiplier *= 0.5;
  }

  // ---- Base formula ----

  // Source: Showdown sim/battle-actions.ts
  // baseDamage = tr(tr(tr(tr(2 * level / 5 + 2) * basePower * attack) / defense) / 50)
  const levelFactor = Math.floor((2 * level) / 5) + 2;
  let baseDamage = Math.floor(Math.floor((levelFactor * power * effectiveAttack) / defense) / 50);

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

  // 4. Critical hit: 1.5x via pokeRound in Gen 6+
  // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit: pokeRound(baseDamage, 6144)
  let critMultiplier = 1;
  if (isCrit) {
    critMultiplier = 1.5;
    baseDamage = pokeRound(baseDamage, 6144); // 1.5x crit

    // Sniper: additional 1.5x on top of 1.5x crit = 2.25x total
    // Source: Showdown data/abilities.ts -- Sniper onModifyDamage
    if (attackerAbility === "sniper") {
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
    attackerAbility === "adaptability",
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
    effectiveMoveType === "ground" &&
    defender.types.includes("flying")
  ) {
    const nonFlyingTypes = defender.types.filter((t) => t !== "flying");
    effectiveDefenderTypes = nonFlyingTypes.length > 0 ? nonFlyingTypes : ["normal"];
  }
  let effectiveness = getTypeEffectiveness(effectiveMoveType, effectiveDefenderTypes, typeChart);

  // Scrappy: Normal and Fighting hit Ghost
  // Source: Showdown data/abilities.ts -- Scrappy
  if (
    attackerAbility === "scrappy" &&
    effectiveness === 0 &&
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
  if (effectiveness === 0) {
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
  if (!moldBreaker && defenderAbility === "wonder-guard" && effectiveness < 2) {
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
  // Source: Showdown sim/battle-actions.ts
  if (effectiveness > 1) {
    let typeMod = effectiveness;
    while (typeMod >= 2) {
      baseDamage = baseDamage * 2;
      typeMod /= 2;
    }
  } else if (effectiveness < 1 && effectiveness > 0) {
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
  const hasBurn = isPhysical && attacker.pokemon.status === "burn";
  const gutsActive = attackerAbility === "guts" && attacker.pokemon.status !== null;
  const facadeBypass = move.id === "facade"; // Gen 6+: Facade bypasses burn
  const burnApplied = hasBurn && !gutsActive && !facadeBypass;
  const burnMultiplier = burnApplied ? 0.5 : 1;
  if (burnApplied) {
    baseDamage = pokeRound(baseDamage, 2048);
  }

  // Tinted Lens: double damage if not very effective
  // Source: Showdown data/abilities.ts -- Tinted Lens
  if (attackerAbility === "tinted-lens" && effectiveness < 1) {
    baseDamage = baseDamage * 2;
    abilityMultiplier *= 2;
  }

  // Filter / Solid Rock: 0.75x damage if super effective.
  // Both have flags: { breakable: 1 } in Showdown -- bypassed by Mold Breaker.
  // Source: Showdown data/abilities.ts -- Filter/Solid Rock: flags: { breakable: 1 }
  if (
    !moldBreaker &&
    (defenderAbility === "filter" || defenderAbility === "solid-rock") &&
    effectiveness > 1
  ) {
    baseDamage = pokeRound(baseDamage, 3072); // 0.75x
    abilityMultiplier *= 0.75;
  }

  // Prism Armor: 0.75x damage if super effective.
  // Unlike Filter/Solid Rock, Prism Armor is NOT bypassed by Mold Breaker.
  // Source: Showdown data/abilities.ts -- prismarmo: onSourceModifyDamage (no breakable flag)
  if (defenderAbility === "prism-armor" && effectiveness > 1) {
    baseDamage = pokeRound(baseDamage, 3072); // 0.75x
    abilityMultiplier *= 0.75;
  }

  // Screens: Reflect (physical), Light Screen (special), Aurora Veil (both): 0.5x in singles
  // Screens do NOT apply on crits.
  // Brick Break and Psychic Fangs bypass/break screens.
  // Source: Showdown sim/battle-actions.ts -- screens in modifyDamage
  let screenMultiplier = 1;
  const screenBypassMoves = new Set(["brick-break", "psychic-fangs"]);
  if (!isCrit && !screenBypassMoves.has(move.id)) {
    const sides = context.state?.sides;
    if (sides) {
      const defenderSideIndex = sides[0]?.active?.includes(defender) ? 0 : 1;
      const defenderSide = sides[defenderSideIndex];
      if (defenderSide?.screens) {
        const hasReflect =
          isPhysical && defenderSide.screens.some((s: { type: string }) => s.type === "reflect");
        const hasLightScreen =
          !isPhysical &&
          defenderSide.screens.some((s: { type: string }) => s.type === "light-screen");
        const hasAuroraVeil = defenderSide.screens.some(
          (s: { type: string }) => s.type === "aurora-veil",
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
  if (!attackerHasKlutz && attackerItem === "life-orb") {
    baseDamage = pokeRound(baseDamage, 5324);
    itemMultiplier = 5324 / 4096;
  }

  // Expert Belt: 1.2x for super-effective moves
  // Source: Showdown data/items.ts -- Expert Belt
  if (!attackerHasKlutz && attackerItem === "expert-belt" && effectiveness > 1) {
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
    const metronomeState = attacker.volatileStatuses.get("metronome-count");
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
  const defenderHasKlutzForBerry = defender.ability === "klutz";
  const defenderHasEmbargoForBerry = defender.volatileStatuses.has("embargo");
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
      if (resistType === "normal" || effectiveness > 1) {
        baseDamage = pokeRound(baseDamage, 2048); // 0.5x via pokeRound
        typeResistBerryConsumed = defenderItemForBerry;
      }
    }
  }

  // 10. Max Move through Protect: 0.25x modifier
  // Source: Showdown sim/battle-actions.ts -- Max Moves bypass Protect at 0.25x damage
  // Source: Bulbapedia "Max Move" -- Max Moves also deal 25% through Protect
  if (context.hitThroughProtect) {
    baseDamage = pokeRound(baseDamage, 1024); // 0.25x via pokeRound (1024/4096)
  }

  // 11. Minimum 1 damage (unless type immune)
  // Source: Showdown sim/battle-actions.ts -- minimum 1 damage
  const finalDamage = Math.max(1, baseDamage);

  // Consume type-resist berry if activated
  // Source: Showdown data/items.ts -- type-resist berries: consumed after activation
  if (typeResistBerryConsumed) {
    defender.pokemon.heldItem = null;
    if (defender.ability === "unburden" && !defender.volatileStatuses.has("unburden")) {
      defender.volatileStatuses.set("unburden", { turnsLeft: -1 });
    }
  }

  // Track type-resist berry in itemMultiplier for breakdown
  if (typeResistBerryConsumed) {
    itemMultiplier = itemMultiplier === 1 ? 0.5 : itemMultiplier * 0.5;
  }

  // Consume gem if activated; trigger Unburden
  // Source: Showdown data/abilities.ts -- Unburden: onAfterUseItem speed doubling
  if (gemConsumed) {
    attacker.pokemon.heldItem = null;
    if (attacker.ability === "unburden" && !attacker.volatileStatuses.has("unburden")) {
      attacker.volatileStatuses.set("unburden", { turnsLeft: -1 });
    }
    attacker.volatileStatuses.set("gem-used" as VolatileStatus, { turnsLeft: 1 });
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
  };
}
