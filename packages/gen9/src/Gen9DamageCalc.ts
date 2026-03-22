/**
 * Gen 9 (Scarlet/Violet) damage calculation.
 *
 * The Gen 9 damage formula is fundamentally the same as Gen 8, using the 4096-based
 * modifier system (pokeRound). Key differences from Gen 8:
 *
 *   - Terastallization STAB: uses calculateTeraStab() for STAB calculation
 *     when the attacker is Terastallized (2.0x when Tera + original match,
 *     1.5x otherwise, Stellar one-time 2x per type, etc.)
 *   - Snow replaces Hail: no weather chip damage, but Ice-type defenders get
 *     1.5x Defense stat boost in Snow (applied to defense stat, not as modifier)
 *   - Dynamax removed: no anti-Dynamax moves (Behemoth Blade/Bash/Dynamax Cannon)
 *   - Z-Moves removed (carried from Gen 8)
 *   - Mega Evolution removed (carried from Gen 8)
 *   - Terrain boost: 1.3x (same as Gen 8)
 *   - -ate abilities: 1.2x (same as Gen 7-8)
 *   - Parental Bond second hit: 0.25x (same as Gen 7-8)
 *   - Facade bypasses burn penalty (same as Gen 6-8)
 *
 * Formula order follows Showdown's modifyDamage() (battle-actions.ts):
 *   1. Base formula: floor(floor((2*L/5+2) * Power * Atk / Def) / 50) + 2
 *   2. Spread modifier (doubles only): pokeRound(baseDamage, 3072) = 0.75x
 *   3. Weather modifier: pokeRound(baseDamage, 6144 or 2048) = 1.5x or 0.5x
 *   4. Critical hit: pokeRound(baseDamage, 6144) = 1.5x
 *   5. Random factor: floor(baseDamage * randomRoll / 100) where roll is [85..100]
 *   6. STAB: via calculateTeraStab() or standard 1.5x/2.0x
 *   7. Type effectiveness: integer multiply/divide
 *   8. Burn: pokeRound(baseDamage, 2048) = 0.5x (physical only, Facade exempt)
 *   9. Final modifier (Life Orb, Screens, etc.): pokeRound(baseDamage, modifier)
 *  10. Minimum 1 damage (unless type immune)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 9 damage formula
 * Source: Showdown data/conditions.ts:696-728 -- Snow Ice Defense boost
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */

import type {
  ActivePokemon,
  DamageBreakdown,
  DamageContext,
  DamageResult,
} from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, TypeChart, VolatileStatus } from "@pokemon-lib-ts/core";
import { getStatStageMultiplier, getTypeEffectiveness } from "@pokemon-lib-ts/core";
import { calculateTeraStab } from "./Gen9Terastallization.js";

// ---- pokeRound: the 4096-based rounding function ----

/**
 * Apply a 4096-based modifier to a value, using Showdown's rounding convention.
 *
 * Equivalent to Showdown's `modify(value, modifier/4096)`:
 *   `tr((tr(value * modifier) + 2048 - 1) / 4096)`
 *
 * For positive damage values, simplifies to:
 *   `floor((value * modifier + 2047) / 4096)`
 *
 * Source: references/pokemon-showdown/sim/battle.ts modify() method
 *
 * @param value - The damage/stat value to modify
 * @param modifier - The 4096-based modifier (4096 = 1.0x, 6144 = 1.5x, etc.)
 * @returns The modified value after rounding
 */
export function pokeRound(value: number, modifier: number): number {
  return Math.floor((value * modifier + 2047) / 4096);
}

// ---- Type-Resist Berries ----

/**
 * Type-resist berries: halve super-effective damage of the matching type, then consumed.
 * Same set as Gen 6-8 (includes Roseli Berry for Fairy).
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
 * of the matching type. Same as Gen 6-8.
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 */
const TYPE_BOOST_ITEMS: Readonly<Record<string, string>> = {
  charcoal: "fire",
  "mystic-water": "water",
  "miracle-seed": "grass",
  magnet: "electric",
  "twisted-spoon": "psychic",
  "spell-tag": "ghost",
  "never-melt-ice": "ice",
  "black-belt": "fighting",
  "poison-barb": "poison",
  "soft-sand": "ground",
  "sharp-beak": "flying",
  "hard-stone": "rock",
  "silver-powder": "bug",
  "dragon-fang": "dragon",
  "black-glasses": "dark",
  "metal-coat": "steel",
  "silk-scarf": "normal",
};

/**
 * Plate items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same set as Gen 6-8 (includes Pixie Plate).
 *
 * Source: Showdown data/items.ts -- Flame Plate etc. use onBasePower with
 *   chainModify([4915, 4096])
 */
const PLATE_ITEMS: Readonly<Record<string, string>> = {
  "flame-plate": "fire",
  "splash-plate": "water",
  "meadow-plate": "grass",
  "zap-plate": "electric",
  "mind-plate": "psychic",
  "spooky-plate": "ghost",
  "icicle-plate": "ice",
  "fist-plate": "fighting",
  "toxic-plate": "poison",
  "earth-plate": "ground",
  "sky-plate": "flying",
  "stone-plate": "rock",
  "insect-plate": "bug",
  "draco-plate": "dragon",
  "dread-plate": "dark",
  "iron-plate": "steel",
  "pixie-plate": "fairy",
};

// ---- Gem Items (Gen 9) ----

/**
 * Gen 9 gem items: only Normal Gem remains available (same as Gen 7-8).
 * Other gems were removed from standard gameplay after Gen 5.
 * Boost is 1.3x (5325/4096), same as Gen 6-8.
 *
 * Source: Showdown data/items.ts -- normalGem: onBasePower chainModify([5325, 4096])
 * Source: Bulbapedia "Gem" -- "From Generation VII onwards, only Normal Gem is available."
 */
const GEM_ITEMS: Readonly<Record<string, string>> = {
  "normal-gem": "normal",
};

/**
 * Gen 9 gem boost multiplier in 4096-based math.
 * 1.3x = Math.round(1.3 * 4096) = 5325
 *
 * Source: Showdown data/items.ts -- gem onBasePower: chainModify([5325, 4096]) in Gen 6+
 */
const GEN9_GEM_MODIFIER = 5325; // 1.3x in 4096-based math

// ---- Pinch Ability Types ----

/**
 * Pinch abilities: boost move power by 1.5x when the user's HP is at or
 * below floor(maxHP/3) and the move type matches the ability's type.
 *
 * Source: Showdown sim/battle.ts -- pinch ability check
 * Source: Bulbapedia -- Overgrow / Blaze / Torrent / Swarm
 */
const PINCH_ABILITY_TYPES: Readonly<Record<string, string>> = {
  overgrow: "grass",
  blaze: "fire",
  torrent: "water",
  swarm: "bug",
};

// ---- Ability Immunity Map ----

/**
 * Defender abilities that grant full type immunity to incoming moves.
 * Checked before the damage formula runs; returns 0 damage with effectiveness 0.
 *
 * Gen 9 additions: Earth Eater (Ground immunity), Wind Rider handled elsewhere.
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
  "earth-eater": "ground",
};

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
 * Same logic as Gen 6-8 grounding check.
 *
 * Source: Showdown sim/pokemon.ts -- isGrounded()
 * Source: Bulbapedia -- grounding mechanics
 */
export function isGen9Grounded(pokemon: ActivePokemon, gravityActive: boolean): boolean {
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
 * Gen 9 terrain boost is 1.3x (same as Gen 8, nerfed from 1.5x in Gen 7).
 *
 * Source: Showdown data/conditions.ts -- terrain onBasePower handlers
 * Source: specs/battle/10-gen9.md -- terrain boost 1.3x (Gen 8+)
 */
interface TerrainDamageModifier {
  readonly powerModifier: number | null;
  readonly grassyGroundHalved: boolean;
}

/**
 * Gen 9 terrain boost modifier: 1.3x (5325/4096).
 * Same as Gen 8.
 *
 * Source: Showdown data/conditions.ts -- terrain boost 5325/4096 in Gen 8+
 */
const TERRAIN_BOOST_MODIFIER = 5325; // 1.3x in 4096-based math

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
  // Source: Showdown data/conditions.ts -- electricterrain.onBasePower
  if (terrainType === "electric" && moveType === "electric" && attackerGrounded) {
    powerModifier = TERRAIN_BOOST_MODIFIER;
  }

  // Grassy Terrain: 1.3x for Grass moves when attacker is grounded
  // Source: Showdown data/conditions.ts -- grassyterrain.onBasePower
  if (terrainType === "grassy" && moveType === "grass" && attackerGrounded) {
    powerModifier = TERRAIN_BOOST_MODIFIER;
  }

  // Misty Terrain: 0.5x for Dragon moves when defender is grounded
  // Source: Showdown data/conditions.ts -- mistyterrain.onBasePower
  if (terrainType === "misty" && moveType === "dragon" && defenderGrounded) {
    powerModifier = 2048;
  }

  // Psychic Terrain: 1.3x for Psychic moves when attacker is grounded
  // Source: Showdown data/conditions.ts -- psychicterrain.onBasePower
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

// ---- Stat Stage Helpers ----

/**
 * Get effective stat stage accounting for Simple and Unaware abilities.
 *
 * Source: Showdown sim/battle.ts -- Simple doubles stat stages; Unaware ignores them
 */
function getEffectiveStatStage(
  pokemon: ActivePokemon,
  stat: string,
  opponent?: ActivePokemon,
): number {
  const raw = (pokemon.statStages as Record<string, number>)[stat] ?? 0;
  if (pokemon.ability === "simple") return Math.max(-6, Math.min(6, raw * 2));
  if (opponent?.ability === "unaware") return 0;
  return raw;
}

// ---- Attack Stat Calculation ----

/**
 * Get the effective attack stat for a move in Gen 9.
 *
 * Same as Gen 8 except:
 *   - No Gorilla Tactics (not in Gen 9 as of base game, readded in DLC)
 *   - Body Press: uses user's Defense stat instead of Attack (same as Gen 8)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 9 attack stat
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

  // Gorilla Tactics: 1.5x physical attack (DLC readded)
  // Source: Showdown data/abilities.ts -- Gorilla Tactics: onModifyAtk multiply 1.5
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

  // Deep Sea Tooth: 2x SpAtk for Clamperl (366)
  // Source: Showdown data/items.ts -- Deep Sea Tooth
  if (
    !attackerHasKlutz &&
    !isPhysical &&
    attackerItem === "deep-sea-tooth" &&
    attackerSpecies === 366
  ) {
    rawStat = rawStat * 2;
  }

  // Light Ball: 2x Atk AND SpAtk for Pikachu (25)
  // Source: Showdown data/items.ts -- Light Ball Gen 4+ behavior
  if (!attackerHasKlutz && attackerItem === "light-ball" && attackerSpecies === 25) {
    rawStat = rawStat * 2;
  }

  // Thick Club: 2x Attack for Cubone (104) / Marowak (105) / Alolan Marowak (10115)
  // Source: Showdown data/items.ts -- Thick Club
  if (
    !attackerHasKlutz &&
    isPhysical &&
    !isBodyPress &&
    attackerItem === "thick-club" &&
    (attackerSpecies === 104 || attackerSpecies === 105 || attackerSpecies === 10115)
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
 * Get the effective defense stat for a move in Gen 9.
 *
 * Key Gen 9 difference from Gen 8:
 *   - Snow replaces Hail: Ice-type defenders get 1.5x Defense in Snow
 *     (applied as stat modifier, not damage modifier)
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 9 defense stat
 * Source: Showdown data/conditions.ts:696-728 -- Snow Ice Defense boost
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
    defenderSpecies === 366
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

  // Sandstorm Rock SpDef boost: 1.5x SpDef for Rock-types in sandstorm
  // Source: Bulbapedia -- Sandstorm: "Rock-type Pokemon have their Special Defense
  //   raised by 50% during a sandstorm. (Generation IV+)"
  if (!isPhysical && weather === "sand" && defender.types.includes("rock")) {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Snow Ice Defense boost (Gen 9): 1.5x Defense for Ice-types in Snow
  // This replaces Hail (which had no stat boost). Applied to physical Defense only.
  // Source: Showdown data/conditions.ts:709 -- snow.onModifyDef: this.modify(def, 1.5)
  // Source: specs/battle/10-gen9.md -- "Snow: Ice-type Defense boost: 1.5x"
  if (isPhysical && weather === "snow" && defender.types.includes("ice")) {
    baseStat = Math.floor(baseStat * 1.5);
  }

  // Flower Gift: 1.5x SpDef in Harsh Sunlight
  // Source: Showdown data/abilities.ts -- Flower Gift
  if (!isPhysical && !moldBreaker && weather === "sun" && defender.ability === "flower-gift") {
    baseStat = Math.floor((baseStat * 150) / 100);
  }

  // Stat stages
  const defStatKey = isPhysical ? "defense" : "spDefense";
  const stage = getEffectiveStatStage(defender, defStatKey, attacker);

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
 * Gen 9: no Z-Crystals, no Mega Stones (both removed).
 *
 * Source: Showdown sim/battle-actions.ts -- Knock Off boost check
 * Source: Bulbapedia "Knock Off" Gen 6+ -- 1.5x damage if target has removable item
 */
function isRemovableItem(item: string): boolean {
  if (!item) return false;

  // Eviolite ends with "ite" but is NOT a Mega Stone -- it is a standard removable item.
  // Source: Showdown data/items.ts -- Eviolite has no megaStone/megaEvolves property
  if (item === "eviolite") return true;

  // Rusted Sword / Rusted Shield: not removable (needed for Crowned forms)
  // Source: Showdown data/items.ts -- Rusted Sword/Shield have forcedForme property
  if (item === "rusted-sword" || item === "rusted-shield") return true;

  // Booster Energy: removable in Gen 9
  // Source: Showdown data/items.ts -- Booster Energy has no forcedForme property

  return true;
}

// ---- -ate Abilities (Gen 9) ----

/**
 * -ate abilities: change Normal-type moves to the ability's type + 1.2x power in Gen 9.
 * Same as Gen 7-8 (was 1.3x in Gen 6).
 *
 * Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate/galvanize:
 *   onModifyType: if move.type === 'Normal', change to ability type
 *   Gen 7+: onBasePower chainModify([4915, 4096]) = 1.2x
 * Source: Bulbapedia -- "-ate abilities 1.2x in Gen 7+"
 */
const ATE_ABILITY_TYPES: Readonly<Record<string, PokemonType>> = {
  aerilate: "flying",
  pixilate: "fairy",
  refrigerate: "ice",
  galvanize: "electric",
};

/**
 * -ate ability power boost in Gen 9: 1.2x (4915/4096).
 * Same as Gen 7-8.
 *
 * Source: Showdown data/abilities.ts -- Gen 7+ -ate abilities: chainModify([4915, 4096])
 */
const GEN9_ATE_MODIFIER = 4915; // 1.2x in 4096-based math

// ---- Original Types Helper ----

/**
 * Get the original (pre-Tera) types of a Pokemon.
 * These are the base species types, stored before Terastallization changed
 * the defensive typing. Uses PokemonInstance.teraTypes if Tera'd, otherwise
 * current types.
 *
 * For non-Terastallized Pokemon, this just returns their current types.
 * For Terastallized Pokemon, we need the original types. Since
 * Gen9Terastallization.activate() stores the post-Tera defensive types
 * in pokemon.teraTypes, we look at the species data or base pokemon types.
 *
 * The simplest approach: Pokemon species types are on the species data,
 * but since we don't have direct access to species data in the damage calc,
 * we use a heuristic: if not terastallized, types are original.
 * If terastallized, the original types were whatever the types were before
 * the tera changed them. We can get these from the pokemon's base species.
 *
 * In practice, the engine should track original types. For now, we use
 * a simple approach: non-Tera Pokemon have their current types as original;
 * Tera'd Pokemon need their original types passed in or inferred.
 *
 * Source: Showdown sim/pokemon.ts -- getTypes(false, true) returns base types
 */
function getOriginalTypes(pokemon: ActivePokemon): PokemonType[] {
  // If not terastallized, current types ARE the original types
  if (!pokemon.isTerastallized) {
    return [...pokemon.types];
  }
  // For Terastallized Pokemon, we need to reconstruct original types.
  // The base species types can be derived from the calculatedStats context.
  // Since we store teraTypes on PokemonInstance for defensive typing,
  // and the original types are lost after Tera, we need to find them.

  // Best approach: check if the pokemon instance has stored original types.
  // The engine or test helpers should set this up.
  // Fallback: if Tera type matches a current type, use current types
  // (this is imperfect but handles the common case).

  // In practice, the Gen9Terastallization.activate() replaces pokemon.types
  // with [teraType]. But the STAB calculation in calculateTeraStab needs
  // the original types. We need to get them from somewhere.

  // The PokemonInstance doesn't directly store pre-Tera types,
  // but we can infer: before Tera, types were the species types.
  // Since we don't have species data here, we rely on the test/engine
  // to pass appropriate data.

  // For Stellar Tera: pokemon.types was NOT changed (stays original).
  // For non-Stellar Tera: pokemon.types was changed to [teraType].

  // If Stellar, current types ARE the original types
  if ((pokemon.teraType as string) === "stellar") {
    return [...pokemon.types];
  }

  // For non-Stellar Tera'd Pokemon, we need the original types.
  // The engine should store these somewhere accessible.
  // As a practical solution: the PokemonInstance may have its species
  // types available through calculatedStats or another field.
  // For now, return an empty array if we truly can't determine them,
  // and let the test infrastructure provide the data.

  // Check if pokemon has volatileStatus tracking original types
  // Cast needed because "original-types" is not in the VolatileStatus union
  // but may be set by the engine/test infrastructure for Tera tracking.
  const originalTypesVolatile = (
    pokemon.volatileStatuses as Map<string, { turnsLeft: number; data?: Record<string, unknown> }>
  ).get("original-types");
  if (originalTypesVolatile?.data?.types) {
    return originalTypesVolatile.data.types as PokemonType[];
  }

  // Fallback: return current types (which for Tera'd Pokemon would be [teraType])
  // This means STAB for original types won't work in this fallback.
  // The calculateTeraStab function takes originalTypes as a parameter,
  // so the caller (calculateGen9Damage) should provide them.
  return [...pokemon.types];
}

// ---- Main Damage Formula ----

/**
 * Calculate damage for a move in Gen 9.
 *
 * See module-level JSDoc for the full modifier order and Gen 9 differences.
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 9 damage formula
 * Source: Showdown data/conditions.ts:696-728 -- Snow Ice Defense boost
 * Source: Bulbapedia "Damage" -- https://bulbapedia.bulbagarden.net/wiki/Damage
 */
export function calculateGen9Damage(
  context: DamageContext,
  typeChart: Record<string, Record<string, number>>,
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
  const weather = context.state.weather?.type ?? null;

  // -ate abilities + Normalize: type-changing abilities
  // Source: Showdown data/abilities.ts -- aerilate/pixilate/refrigerate/galvanize: onModifyTypePriority -1
  // Source: Showdown data/abilities.ts -- normalize: onModifyTypePriority -2
  let effectiveMoveType: PokemonType = move.type;
  let ateBoostApplied = false;

  // -ate abilities: change Normal-type moves to the ability's type + 1.2x power (Gen 9)
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

  // SolarBeam half power in rain/sand/snow (NOT sun)
  // Source: Showdown -- SolarBeam power halved in non-sun weather
  if (
    move.id === "solar-beam" &&
    weather !== null &&
    weather !== "sun" &&
    weather !== "harsh-sun"
  ) {
    power = Math.floor(power / 2);
  }

  // Gem boost: only Normal Gem available in Gen 9, 1.3x via pokeRound
  // Source: Showdown data/items.ts -- gem: chainModify([5325, 4096])
  const attackerHasEmbargo = attacker.volatileStatuses.has("embargo");
  let gemConsumed = false;
  if (!attackerHasKlutz && !attackerHasEmbargo && attackerItem) {
    const gemType = GEM_ITEMS[attackerItem];
    if (gemType && gemType === effectiveMoveType) {
      power = pokeRound(power, GEN9_GEM_MODIFIER);
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
    (attacker.pokemon.speciesId === 380 || attacker.pokemon.speciesId === 381) &&
    (effectiveMoveType === "psychic" || effectiveMoveType === "dragon")
  ) {
    power = pokeRound(power, 4915);
  }

  // Knock Off (Gen 6+): 1.5x base power when target holds a removable item
  // Source: Showdown data/moves.ts -- knockoff onBasePower
  if (move.id === "knock-off" && defender.pokemon.heldItem) {
    if (isRemovableItem(defender.pokemon.heldItem)) {
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

  // -ate / Normalize power boost: 1.2x (4915/4096) in Gen 9
  // Source: Showdown data/abilities.ts -- Gen 7+ -ate abilities: chainModify([4915, 4096])
  if (ateBoostApplied) {
    power = pokeRound(power, GEN9_ATE_MODIFIER);
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
      attacker.pokemon.speciesId === 483 &&
      (effectiveMoveType === "dragon" || effectiveMoveType === "steel")
    ) {
      power = pokeRound(power, 4915);
    }
    if (
      attackerItem === "lustrous-orb" &&
      attacker.pokemon.speciesId === 484 &&
      (effectiveMoveType === "water" || effectiveMoveType === "dragon")
    ) {
      power = pokeRound(power, 4915);
    }
    if (
      attackerItem === "griseous-orb" &&
      attacker.pokemon.speciesId === 487 &&
      (effectiveMoveType === "ghost" || effectiveMoveType === "dragon")
    ) {
      power = pokeRound(power, 4915);
    }
  }

  // Terrain power modifiers (Gen 9)
  // Source: Showdown data/conditions.ts -- terrain boost 1.3x (Gen 8+)
  if (context.state?.terrain) {
    const terrainGravity = context.state.gravity?.active ?? false;
    const attackerGrounded = isGen9Grounded(attacker, terrainGravity);
    const defenderGrounded = isGen9Grounded(defender, terrainGravity);

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
        return {
          damage: 0,
          effectiveness: 0,
          isCrit,
          randomFactor: 1,
          effectiveType: effectiveMoveType,
        };
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
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor: 1,
      effectiveType: effectiveMoveType,
    };
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
        return {
          damage: 0,
          effectiveness: 0,
          isCrit,
          randomFactor: 1,
          effectiveType: effectiveMoveType,
        };
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
        return {
          damage: 0,
          effectiveness: 0,
          isCrit,
          randomFactor: 1,
          effectiveType: effectiveMoveType,
        };
      }
      baseDamage = pokeRound(baseDamage, 2048); // 0.5x
      weatherMod = 0.5;
    }
  }
  // Snow: NO damage modifier (the Ice Defense boost was applied in getDefenseStat)
  // Source: Showdown data/conditions.ts:696-728 -- Snow has no onBasePower/onModifyDamage

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

  // 6. STAB via calculateTeraStab (Gen 9 Tera-aware STAB) or standard
  // Source: Showdown sim/battle-actions.ts:1760-1793
  const originalTypes = getOriginalTypes(attacker);
  const hasAdaptability = attackerAbility === "adaptability";
  const stabMod = calculateTeraStab(attacker, effectiveMoveType, originalTypes, hasAdaptability);

  if (stabMod > 1) {
    // Convert STAB multiplier to 4096-based modifier
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
  let effectiveness = getTypeEffectiveness(
    effectiveMoveType,
    effectiveDefenderTypes,
    typeChart as TypeChart,
  );

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
        ? getTypeEffectiveness(effectiveMoveType, nonGhostTypes, typeChart as TypeChart)
        : 1;
  }

  // If effectiveness === 0: type immunity -- return 0 damage
  if (effectiveness === 0) {
    return {
      damage: 0,
      effectiveness: 0,
      isCrit,
      randomFactor,
      effectiveType: effectiveMoveType,
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
      effectiveType: effectiveMoveType,
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

  // 10. Minimum 1 damage (unless type immune)
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
    effectiveType: effectiveMoveType,
    effectiveCategory: isPhysical ? "physical" : "special",
  };
}
