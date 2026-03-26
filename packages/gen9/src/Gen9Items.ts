import type { ActivePokemon, ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import { CORE_WEATHER_IDS, getTypeEffectiveness } from "@pokemon-lib-ts/core";
import { GEN9_TYPE_CHART } from "./Gen9TypeChart.js";

// ---------------------------------------------------------------------------
// No-op result
// ---------------------------------------------------------------------------

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// Type-Boost Items (carried from Gen 6-8, 1.2x = 4915/4096)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same set as Gen 6-8 plus Fairy Feather (Gen 9 new).
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 * Source: Showdown data/items.ts -- Fairy Feather: onBasePowerPriority 15,
 *   chainModify([4915, 4096]) for Fairy-type moves (Gen 9 new)
 */
const TYPE_BOOST_ITEMS: Readonly<Record<string, PokemonType>> = {
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
  // Gen 9 new: Fairy Feather boosts Fairy-type moves
  // Source: Showdown data/items.ts -- fairyfeather: onBasePower Fairy 4915/4096
  "fairy-feather": "fairy",
};

/**
 * Plate items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same set as Gen 6-8 (includes Pixie Plate).
 *
 * Source: Showdown data/items.ts -- Flame Plate etc. use onBasePower with
 *   chainModify([4915, 4096])
 */
const PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
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

/**
 * Incense items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same as Gen 6-8.
 *
 * Source: Showdown data/items.ts -- incense items onBasePower
 */
const INCENSE_ITEMS: Readonly<Record<string, PokemonType>> = {
  "sea-incense": "water",
  "wave-incense": "water",
  "rose-incense": "grass",
  "odd-incense": "psychic",
  "rock-incense": "rock",
};

// ═══════════════════════════════════════════════════════════════════════════
// Type-Resist Berries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type-resist berries: halve super-effective damage of the matching type.
 * Consumed after activation. Same set as Gen 6-8.
 * Chilan Berry activates on any Normal-type hit (no super-effective requirement).
 *
 * Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
 * Source: Bulbapedia -- type-resist berries
 */
const TYPE_RESIST_BERRIES: Readonly<Record<string, PokemonType>> = {
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

// ═══════════════════════════════════════════════════════════════════════════
// Choice Items
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Choice items lock the holder into one move but boost a stat by 1.5x.
 * In Gen 9, Dynamax is removed so Choice lock is never suppressed.
 *
 * Source: Showdown data/items.ts -- Choice Band/Specs/Scarf onModifyAtk/onModifySpe
 * Source: Bulbapedia -- Choice Band/Specs/Scarf
 */
const CHOICE_ITEMS: Readonly<
  Record<string, { stat: "atk" | "spatk" | "spe"; multiplier: number }>
> = {
  "choice-band": { stat: "atk", multiplier: 1.5 },
  "choice-specs": { stat: "spatk", multiplier: 1.5 },
  "choice-scarf": { stat: "spe", multiplier: 1.5 },
};

/**
 * Get the choice item stat boost for a given item.
 * Returns null for non-choice items.
 *
 * Source: Showdown data/items.ts -- Choice Band/Specs/Scarf
 */
export function getChoiceItemBoost(
  item: string,
): { stat: "atk" | "spatk" | "spe"; multiplier: number } | null {
  return CHOICE_ITEMS[item] ?? null;
}

/**
 * Check whether a Pokemon is choice-locked.
 * In Gen 9 there is no Dynamax suppression (Dynamax removed).
 *
 * Source: Showdown data/items.ts -- Choice items lock move
 * Source: Bulbapedia -- Choice Band/Specs/Scarf lock move
 */
export function isChoiceLocked(pokemon: ActivePokemon): boolean {
  const item = pokemon.pokemon.heldItem;
  if (!item || !(item in CHOICE_ITEMS)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Item Damage Modifier (4096-based)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the 4096-based damage modifier for an item.
 * Used by the damage calculation formula.
 *
 * - Type-boost items / plates / incenses: 4915 (1.2x)
 * - Life Orb: 5325 (1.3x)
 * - Choice Band: 6144 (1.5x) for physical
 * - Choice Specs: 6144 (1.5x) for special
 *
 * Returns 4096 (1.0x, no change) for items that don't modify damage.
 *
 * Source: Showdown data/items.ts -- various onBasePower and onModifyDamage handlers
 */
export function getItemDamageModifier(
  item: string,
  context: {
    moveType?: PokemonType;
    moveCategory?: "physical" | "special" | "status";
    attackerAbility?: string;
  },
): number {
  const moveType = context.moveType;
  const moveCategory = context.moveCategory;
  // Type-boost items and Life Orb only apply to damaging moves (physical or special).
  // Status moves like Will-O-Wisp and Toxic must not receive a boost.
  // Source: Showdown data/items.ts -- all type-boost and Life Orb handlers check for
  //   damaging hits via onBasePower / onModifyDamage (which never fire for status moves)
  const isDamagingMove = moveCategory === "physical" || moveCategory === "special";

  // Type-boost items: 1.2x (4915/4096) for matching type
  if (isDamagingMove && moveType) {
    const typeBoost = TYPE_BOOST_ITEMS[item];
    if (typeBoost === moveType) return 4915;

    const plateBoost = PLATE_ITEMS[item];
    if (plateBoost === moveType) return 4915;

    const incenseBoost = INCENSE_ITEMS[item];
    if (incenseBoost === moveType) return 4915;
  }

  // Life Orb: 1.3x (5325/4096) -- applies to all damaging moves
  // Source: Showdown data/items.ts -- Life Orb onModifyDamage chainModify([5325, 4096])
  if (item === "life-orb" && isDamagingMove) return 5325;

  // Choice Band: 1.5x (6144/4096) for physical moves only
  // Source: Showdown data/items.ts -- Choice Band onModifyAtk
  if (item === "choice-band" && moveCategory === "physical") return 6144;

  // Choice Specs: 1.5x (6144/4096) for special moves only
  // Source: Showdown data/items.ts -- Choice Specs onModifySpA
  if (item === "choice-specs" && moveCategory === "special") return 6144;

  return 4096;
}

// ═══════════════════════════════════════════════════════════════════════════
// Life Orb
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Life Orb recoil damage: floor(maxHP / 10).
 * Minimum 1 HP damage.
 *
 * Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf:
 *   this.damage(pokemon.baseMaxhp / 10, pokemon, pokemon)
 */
export function getLifeOrbRecoil(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 10));
}

// ═══════════════════════════════════════════════════════════════════════════
// Rocky Helmet
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Rocky Helmet chip damage: floor(attackerMaxHP / 6).
 * Minimum 1 HP damage. Deals damage to the ATTACKER (opponent).
 *
 * Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit:
 *   this.damage(source.baseMaxhp / 6, source, target)
 */
export function getRockyHelmetDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 6));
}

// ═══════════════════════════════════════════════════════════════════════════
// Leftovers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Leftovers healing: floor(maxHP / 16).
 * Minimum 1 HP heal.
 *
 * Source: Showdown data/items.ts -- Leftovers onResidual:
 *   this.heal(target.baseMaxhp / 16)
 */
export function getLeftoversHeal(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 16));
}

// ═══════════════════════════════════════════════════════════════════════════
// Black Sludge
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate Black Sludge effect.
 * - Poison types: heal floor(maxHP / 16). Minimum 1.
 * - Non-Poison types: damage floor(maxHP / 8). Minimum 1.
 *
 * Source: Showdown data/items.ts -- Black Sludge onResidual:
 *   Poison: heal target.baseMaxhp / 16
 *   Non-poison: damage target.baseMaxhp / 8
 */
export function getBlackSludgeEffect(pokemon: { types: readonly PokemonType[]; maxHp: number }): {
  type: "heal" | "damage";
  amount: number;
} {
  const isPoison = pokemon.types.includes("poison");
  if (isPoison) {
    return { type: "heal", amount: Math.max(1, Math.floor(pokemon.maxHp / 16)) };
  }
  return { type: "damage", amount: Math.max(1, Math.floor(pokemon.maxHp / 8)) };
}

// ═══════════════════════════════════════════════════════════════════════════
// Eviolite
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the Eviolite defensive modifier in 4096-based math.
 * Returns 6144 (1.5x) for unevolved Pokemon, 4096 (1.0x) otherwise.
 *
 * Source: Showdown data/items.ts -- Eviolite onModifyDef/onModifySpD:
 *   chainModify(1.5) for Pokemon that can still evolve
 * Source: Bulbapedia "Eviolite" -- boosts Def and SpDef by 50% for unevolved Pokemon
 */
export function getEvioliteModifier(isUnevolved: boolean): number {
  return isUnevolved ? 6144 : 4096;
}

// ═══════════════════════════════════════════════════════════════════════════
// Assault Vest
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a Pokemon is holding an Assault Vest.
 * Assault Vest: +1.5x SpDef (6144/4096), blocks status moves.
 *
 * Source: Showdown data/items.ts -- Assault Vest onModifySpD/onDisableMove
 * Source: Bulbapedia "Assault Vest" -- boosts SpDef by 50%, prevents status moves
 */
export function isAssaultVestHolder(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === "assault-vest";
}

// ═══════════════════════════════════════════════════════════════════════════
// Focus Sash
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine if Focus Sash should trigger: survive a KO hit from full HP.
 * Returns true if the Pokemon is at full HP and the damage would KO.
 *
 * Source: Showdown data/items.ts -- Focus Sash onDamagePriority:
 *   if (pokemon.hp === pokemon.maxhp && damage >= pokemon.hp)
 * Source: Bulbapedia "Focus Sash" -- survive a hit that would KO from full HP
 */
export function getFocusSashTrigger(pokemon: {
  currentHp: number;
  maxHp: number;
  damage: number;
}): boolean {
  return pokemon.currentHp === pokemon.maxHp && pokemon.damage >= pokemon.currentHp;
}

// ═══════════════════════════════════════════════════════════════════════════
// Type-Boost Item (pure function)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the type-boost modifier for an item and move type.
 * Returns 4915 (1.2x in 4096-based math) for matching type, 4096 (1.0x) otherwise.
 *
 * Source: Showdown data/items.ts -- type-boosting items onBasePower chainModify([4915, 4096])
 */
export function getTypeBoostItem(item: string, moveType: PokemonType): number {
  const boost = TYPE_BOOST_ITEMS[item];
  if (boost === moveType) return 4915;
  const plate = PLATE_ITEMS[item];
  if (plate === moveType) return 4915;
  const incense = INCENSE_ITEMS[item];
  if (incense === moveType) return 4915;
  return 4096;
}

// ═══════════════════════════════════════════════════════════════════════════
// Type-Resist Berry (pure function)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the type-resist berry modifier for an item against a move type.
 * Returns 2048 (0.5x in 4096-based math) when the berry matches the incoming
 * super-effective type AND the effectiveness is >= 2 (or Normal for Chilan).
 * Returns 4096 (1.0x) if not activated.
 *
 * Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage:
 *   chainModify(0.5) if move type matches and is super-effective
 * Source: Bulbapedia -- Chilan Berry activates on any Normal hit (no SE requirement)
 */
export function getTypeResistBerry(
  item: string,
  moveType: PokemonType,
  typeEffectiveness: number,
): number {
  const berryType = TYPE_RESIST_BERRIES[item];
  if (!berryType || berryType !== moveType) return 4096;
  // Chilan Berry: activates on any Normal hit (no SE requirement)
  if (berryType === "normal") return 2048;
  // Other berries: only activate on super-effective (>= 2x)
  if (typeEffectiveness >= 2) return 2048;
  return 4096;
}

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a Pokemon is holding an Air Balloon (Ground immunity while held).
 *
 * Source: Showdown data/items.ts -- Air Balloon: immunity to Ground
 * Source: Bulbapedia "Air Balloon" -- makes holder immune to Ground-type moves,
 *   pops when hit by a damaging move
 */
export function hasAirBalloon(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === "air-balloon";
}

// ═══════════════════════════════════════════════════════════════════════════
// Iron Ball
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a Pokemon is holding an Iron Ball (halves Speed, grounds the holder).
 *
 * Source: Showdown data/items.ts -- Iron Ball: onModifySpe 0.5x, grounds holder
 * Source: Bulbapedia "Iron Ball" -- halves Speed, negates Ground immunity
 */
export function hasIronBall(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === "iron-ball";
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Umbrella (carried from Gen 8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a Pokemon is holding a Utility Umbrella, which negates weather-based
 * damage modifiers and weather-based accuracy changes for the holder.
 *
 * Source: Showdown data/items.ts -- utilityumbrella: weather immunity for holder
 * Source: Bulbapedia "Utility Umbrella" -- negates the effects of harsh sunlight
 *   and rain for the holder (damage boosts, accuracy changes, etc.)
 */
export function hasUtilityUmbrella(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === "utility-umbrella";
}

// ═══════════════════════════════════════════════════════════════════════════
// Booster Energy (Gen 9 new)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an item ID is Booster Energy.
 * Booster Energy is consumed to activate Protosynthesis or Quark Drive when
 * the weather/terrain trigger condition is NOT met.
 *
 * The full activation logic is in Wave 8A (ability triggers). This is just
 * the item identification helper.
 *
 * Source: Showdown data/items.ts -- boosterenergy: onUpdate triggers
 *   Protosynthesis/Quark Drive when weather/terrain isn't active
 * Source: Bulbapedia "Booster Energy" -- consumed to activate Protosynthesis
 *   or Quark Drive when Sun/Electric Terrain is not active
 */
export function isBoosterEnergy(item: string): boolean {
  return item === "booster-energy";
}

// ═══════════════════════════════════════════════════════════════════════════
// Covert Cloak (Gen 9 new)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a Pokemon is holding a Covert Cloak, which protects from
 * secondary effects of opponent's moves.
 *
 * Source: Showdown data/items.ts -- covertcloak: onModifySecondaries
 *   "This Pokemon is protected from the secondary effects of attacks."
 * Source: Bulbapedia "Covert Cloak" -- blocks secondary effects of moves
 */
export function hasCovertCloak(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === "covert-cloak";
}

// ═══════════════════════════════════════════════════════════════════════════
// Terrain Extender (carried from Gen 7-8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The item ID for Terrain Extender, which extends terrain duration from 5 to 8 turns.
 *
 * Source: Showdown data/items.ts -- terrainextender: onSetStatus changes terrain duration
 * Source: Bulbapedia "Terrain Extender" -- extends terrain set by holder from 5 to 8 turns
 */
export const TERRAIN_EXTENDER_ITEM_ID = "terrain-extender";

/**
 * Check if a Pokemon is holding a Terrain Extender.
 *
 * Source: Showdown data/items.ts -- terrainextender
 */
export function hasTerrainExtender(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === TERRAIN_EXTENDER_ITEM_ID;
}

// ═══════════════════════════════════════════════════════════════════════════
// Weather Rocks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Weather rocks extend weather duration from 5 to 8 turns.
 * Applied when weather is set (checked by the engine at weather-set time).
 *
 * Source: Showdown data/items.ts -- heatrock/damprock/smoothrock/icyrock
 * Source: Bulbapedia -- weather rocks extend weather to 8 turns
 */
const WEATHER_ROCKS: Readonly<Record<string, string>> = {
  "heat-rock": CORE_WEATHER_IDS.sun,
  "damp-rock": CORE_WEATHER_IDS.rain,
  "smooth-rock": CORE_WEATHER_IDS.sand,
  "icy-rock": CORE_WEATHER_IDS.snow,
};

/**
 * Get the weather type extended by a held item.
 * Returns null if the item is not a weather rock.
 *
 * Source: Showdown data/items.ts -- weather rock items
 */
export function getWeatherRockType(item: string): string | null {
  return WEATHER_ROCKS[item] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gen 9 New Consumable Items
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Throat Spray should trigger: activates when a sound-based move is used.
 * Consumable, one-time use. Raises Sp.Atk by 1 stage.
 *
 * Source: Showdown data/items.ts -- Throat Spray onAfterMoveSecondarySelf:
 *   if (move.flags['sound']) { boost spa +1, consume }
 * Source: Bulbapedia "Throat Spray" -- raises Sp. Atk by 1 after using a sound move
 */
export function getThroatSprayTrigger(moveFlags: { sound?: boolean } | undefined): boolean {
  return moveFlags?.sound === true;
}

/**
 * Resolve the effect of a consumable item when its trigger condition is met.
 * Returns the stat change and item name for the engine to apply.
 *
 * Source: Showdown data/items.ts -- individual consumable item handlers
 */
export function getConsumableItemEffect(
  item: string,
  context: {
    statChange?: number;
    moveMissed?: boolean;
    moveFlags?: { sound?: boolean };
    trickRoomActive?: boolean;
  },
): { stat: string; stages: number; consumed: boolean } | null {
  switch (item) {
    case "eject-pack":
      if (context.statChange !== undefined && context.statChange < 0) {
        // Eject Pack forces switch (no stat boost), consumed
        return { stat: "none", stages: 0, consumed: true };
      }
      return null;
    case "blunder-policy":
      if (context.moveMissed) {
        return { stat: "speed", stages: 2, consumed: true };
      }
      return null;
    case "throat-spray":
      if (context.moveFlags?.sound) {
        return { stat: "spAttack", stages: 1, consumed: true };
      }
      return null;
    case "room-service":
      if (context.trickRoomActive) {
        return { stat: "speed", stages: -1, consumed: true };
      }
      return null;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Gluttony helper (carried from Gen 6-8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the HP threshold fraction for pinch berry activation.
 * Gluttony changes the activation threshold from 25% to 50%.
 *
 * Source: Bulbapedia -- Gluttony: "Makes the Pokemon eat a held Berry when its HP
 *   drops to 50% or less instead of the usual 25%."
 * Source: Showdown data/abilities.ts -- Gluttony modifies pinch berry threshold
 */
export function getPinchBerryThreshold(
  pokemon: { ability: string },
  normalFraction: number,
): number {
  if (pokemon.ability === "gluttony" && normalFraction <= 0.25) {
    return 0.5;
  }
  return normalFraction;
}

// ═══════════════════════════════════════════════════════════════════════════
// Safety Goggles (carried from Gen 6-8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a move is blocked by Safety Goggles (powder moves).
 *
 * Source: Showdown data/items.ts -- safetygoggles: isPowderImmune
 * Source: Bulbapedia "Safety Goggles" -- blocks powder moves
 */
export function isGen9PowderBlocked(itemId: string, moveFlags: { powder?: boolean }): boolean {
  return itemId === "safety-goggles" && moveFlags.powder === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheer Force + Life Orb suppression (carried from Gen 6-8)
// ═══════════════════════════════════════════════════════════════════════════

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
 * Check whether Sheer Force suppresses Life Orb recoil for this move.
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
 */
function sheerForceSuppressesLifeOrb(
  abilityId: string,
  effect: MoveEffect | null,
  moveId: string,
): boolean {
  if (abilityId !== "sheer-force") return false;
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_WHITELIST.has(moveId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find the opponent's max HP from the battle state.
 * Used by Rocky Helmet, Jaboca/Rowap Berry to deal retaliation damage
 * based on the attacker's HP.
 *
 * Prefers context.opponent (the direct attacker reference) over the sides
 * array lookup, to avoid misattributing retaliation damage to the wrong
 * Pokemon or falling back to the holder's own HP.
 *
 * Returns null when the attacker cannot be resolved -- callers must skip
 * activation in that case.
 */
function getOpponentMaxHp(context: ItemContext): number | null {
  // Prefer the direct attacker reference provided by the engine
  if (context.opponent) {
    return context.opponent.pokemon.calculatedStats?.hp ?? context.opponent.pokemon.currentHp;
  }
  const pokemon = context.pokemon;
  const sides = context.state?.sides;
  if (!sides) {
    return null;
  }
  const holderSide = sides.findIndex((s) =>
    s.active.some((a: { pokemon: unknown } | null) => a && a.pokemon === pokemon.pokemon),
  );
  if (holderSide === -1) {
    return null;
  }
  const opponentSide = holderSide === 0 ? 1 : 0;
  const opponent = sides[opponentSide]?.active?.[0];
  if (!opponent) {
    return null;
  }
  return opponent.pokemon.calculatedStats?.hp ?? opponent.pokemon.currentHp;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main item handler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a Gen 9 held item effect at the given trigger point.
 *
 * Gen 9 item changes from Gen 8:
 *   - Z-Crystals: REMOVED (already gone in Gen 8)
 *   - Mega Stones: REMOVED (already gone in Gen 8)
 *   - Dynamax suppression of Choice lock: REMOVED (Dynamax removed in Gen 9)
 *   - Booster Energy (new): consumed to activate Protosynthesis/Quark Drive
 *   - Covert Cloak (new): blocks secondary effects of moves
 *   - Fairy Feather (new): 1.2x boost to Fairy-type moves
 *   - Mirror Herb (new): copies stat boosts from opponent (doubles -- deferred)
 *   - Loaded Dice (new): multi-hit moves hit 4-5 times (handled in move mechanics)
 *   - Clear Amulet (new): prevents stat lowering by opponents
 *
 * All Gen 8 non-Dynamax items are carried forward with unchanged mechanics.
 *
 * Source: Showdown data/items.ts -- Gen 9 item handlers
 * Source: Bulbapedia -- individual item pages
 *
 * @param trigger - When the item check occurs
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen9HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  // Klutz: holder cannot use its held item -- suppress all item triggers
  // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts -- Klutz gates all item battle effects
  if (context.pokemon.ability === "klutz") {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5/6/7/8/9 -- Embargo blocks item effects
  if (context.pokemon.volatileStatuses.has("embargo")) {
    return NO_ACTIVATION;
  }

  // Magic Room: suppresses all held item effects for 5 turns
  // Source: Showdown data/moves.ts -- magicroom condition: onTakeItem returns false
  // Source: Bulbapedia "Magic Room" -- "makes all held items have no effect in battle"
  if (context.state.magicRoom?.active) {
    return NO_ACTIVATION;
  }

  let result: ItemResult;
  switch (trigger) {
    case "before-turn-order":
      result = handleBeforeTurnOrder(item, context);
      break;
    case "before-move":
      result = handleBeforeMove(item, context);
      break;
    case "end-of-turn":
      result = handleEndOfTurn(item, context);
      break;
    case "on-damage-taken":
      result = handleOnDamageTaken(item, context);
      break;
    case "on-contact":
      result = handleOnContact(item, context);
      break;
    case "on-hit":
      result = handleOnHit(item, context);
      break;
    default:
      result = NO_ACTIVATION;
      break;
  }

  // Unburden: when a held item is consumed and the holder has Unburden,
  // set the "unburden" volatile to double Speed.
  // Source: Bulbapedia -- Unburden: "Doubles the Pokemon's Speed stat when its held
  //   item is used or lost."
  // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
  if (
    result.activated &&
    context.pokemon.ability === "unburden" &&
    result.effects.some((e) => e.type === "consume") &&
    !context.pokemon.volatileStatuses.has("unburden")
  ) {
    context.pokemon.volatileStatuses.set("unburden", { turnsLeft: -1 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// before-turn-order
// ---------------------------------------------------------------------------

function handleBeforeTurnOrder(item: string, context: ItemContext): ItemResult {
  const { pokemon } = context;
  const pokemonName = pokemon.pokemon.nickname ?? "The Pokemon";
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const currentHp = pokemon.pokemon.currentHp;

  switch (item) {
    case "quick-claw":
      if (context.rng.chance(0.2)) {
        return {
          activated: true,
          effects: [],
          messages: [`${pokemonName}'s Quick Claw let it move first!`],
        };
      }
      return NO_ACTIVATION;

    case "custap-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [{ type: "consume", target: "self", value: "custap-berry" }],
          messages: [`${pokemonName}'s Custap Berry let it move first!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// before-move
// ---------------------------------------------------------------------------

/**
 * Handle before-move item effects.
 * Handles the Metronome item's consecutive-use counter.
 *
 * Source: Showdown sim/items.ts -- Metronome item onModifyDamage
 * Source: Bulbapedia -- Metronome (item): "Boosts the power of moves used
 *   consecutively. +20% per consecutive use, up to 100% (2.0x)."
 */
function handleBeforeMove(item: string, context: ItemContext): ItemResult {
  if (item !== "metronome") return NO_ACTIVATION;

  const pokemon = context.pokemon;
  const moveId = context.move?.id;
  if (!moveId) return NO_ACTIVATION;

  const existing = pokemon.volatileStatuses.get("metronome-count");
  const previousMoveId = existing?.data?.moveId as string | undefined;
  const previousCount = (existing?.data?.count as number) ?? 0;

  if (previousMoveId === moveId) {
    const newCount = previousCount + 1;
    pokemon.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: newCount, moveId },
    });
  } else {
    pokemon.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 1, moveId },
    });
  }

  return NO_ACTIVATION;
}

// ---------------------------------------------------------------------------
// end-of-turn
// ---------------------------------------------------------------------------

/**
 * Handle end-of-turn item effects.
 *
 * Source: Showdown data/items.ts -- end-of-turn item triggers
 */
function handleEndOfTurn(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
  const status = pokemon.pokemon.status;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;
  const isPoison = pokemon.types.includes("poison");

  switch (item) {
    // Leftovers: Heal 1/16 max HP each turn, NOT consumed
    // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP
    case "leftovers": {
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ type: "heal", target: "self", value: healAmount }],
        messages: [`${pokemonName}'s Leftovers restored its HP!`],
      };
    }

    // Black Sludge: Heals Poison-types 1/16 max HP; damages non-Poison-types 1/8 max HP
    // Source: Showdown data/items.ts -- Black Sludge onResidual
    case "black-sludge": {
      if (isPoison) {
        const healAmount = Math.max(1, Math.floor(maxHp / 16));
        return {
          activated: true,
          effects: [{ type: "heal", target: "self", value: healAmount }],
          messages: [`${pokemonName}'s Black Sludge restored its HP!`],
        };
      }
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: "chip-damage", target: "self", value: chipDamage }],
        messages: [`${pokemonName} was hurt by its Black Sludge!`],
      };
    }

    // Toxic Orb: Badly poisons the holder at end of turn
    // Source: Showdown data/items.ts -- Toxic Orb onResidual
    case "toxic-orb": {
      if (status) return NO_ACTIVATION;
      // Poison and Steel types are immune to poisoning
      // Source: Showdown -- type immunity prevents Orb activation
      if (pokemon.types.includes("poison") || pokemon.types.includes("steel")) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ type: "inflict-status", target: "self", status: "badly-poisoned" }],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    case "flame-orb": {
      if (status) return NO_ACTIVATION;
      // Fire types are immune to burns
      // Source: Showdown -- type immunity prevents Orb activation
      if (pokemon.types.includes("fire")) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ type: "inflict-status", target: "self", status: "burn" }],
        messages: [`${pokemonName} was burned by its Flame Orb!`],
      };
    }

    // Sitrus Berry: Heal 1/4 max HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Sitrus Berry onEat / onUpdate
    case "sitrus-berry": {
      if (currentHp <= Math.floor(maxHp / 2)) {
        const healAmount = Math.max(1, Math.floor(maxHp / 4));
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: healAmount },
            { type: "consume", target: "self", value: "sitrus-berry" },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Oran Berry
    case "oran-berry": {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 10 },
            { type: "consume", target: "self", value: "oran-berry" },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Lum Berry: Cures any primary status OR confusion (consumed)
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    case "lum-berry": {
      const hasConfusion = pokemon.volatileStatuses.has("confusion");
      const hasPrimaryStatus = status != null;
      if (!hasPrimaryStatus && !hasConfusion) {
        return NO_ACTIVATION;
      }
      const effects: ItemEffect[] = [];
      if (hasPrimaryStatus) {
        effects.push({ type: "status-cure", target: "self" });
      }
      if (hasConfusion) {
        effects.push({ type: "volatile-cure", target: "self", value: "confusion" });
      }
      effects.push({ type: "consume", target: "self", value: "lum-berry" });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Lum Berry cured its status!`],
      };
    }

    // Cheri Berry: Cures paralysis (consumed)
    // Source: Showdown data/items.ts -- Cheri Berry
    case "cheri-berry": {
      if (status === "paralysis") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self" },
            { type: "consume", target: "self", value: "cheri-berry" },
          ],
          messages: [`${pokemonName}'s Cheri Berry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Chesto Berry: Cures sleep (consumed)
    // Source: Showdown data/items.ts -- Chesto Berry
    case "chesto-berry": {
      if (status === "sleep") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self" },
            { type: "consume", target: "self", value: "chesto-berry" },
          ],
          messages: [`${pokemonName}'s Chesto Berry woke it up!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Pecha Berry: Cures poison and badly-poisoned (consumed)
    // Source: Showdown data/items.ts -- Pecha Berry
    case "pecha-berry": {
      if (status === "poison" || status === "badly-poisoned") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self" },
            { type: "consume", target: "self", value: "pecha-berry" },
          ],
          messages: [`${pokemonName}'s Pecha Berry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rawst Berry: Cures burn (consumed)
    // Source: Showdown data/items.ts -- Rawst Berry
    case "rawst-berry": {
      if (status === "burn") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self" },
            { type: "consume", target: "self", value: "rawst-berry" },
          ],
          messages: [`${pokemonName}'s Rawst Berry cured its burn!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Aspear Berry: Cures freeze (consumed)
    // Source: Showdown data/items.ts -- Aspear Berry
    case "aspear-berry": {
      if (status === "freeze") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self" },
            { type: "consume", target: "self", value: "aspear-berry" },
          ],
          messages: [`${pokemonName}'s Aspear Berry thawed it out!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Persim Berry: Cures confusion volatile status (consumed)
    // Source: Showdown data/items.ts -- Persim Berry
    case "persim-berry": {
      if (pokemon.volatileStatuses.has("confusion")) {
        return {
          activated: true,
          effects: [
            { type: "volatile-cure", target: "self", value: "confusion" },
            { type: "consume", target: "self", value: "persim-berry" },
          ],
          messages: [`${pokemonName}'s Persim Berry snapped it out of confusion!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Mental Herb: Cures infatuation AND (Gen 5+) Taunt, Encore, Disable, Torment, Heal Block
    // Source: Showdown data/items.ts -- Mental Herb onUpdate
    case "mental-herb": {
      const mentalVolatiles: VolatileStatus[] = [
        "infatuation",
        "taunt",
        "encore",
        "disable",
        "torment",
        "heal-block",
      ];
      const hasMentalVolatile = mentalVolatiles.some((v) => pokemon.volatileStatuses.has(v));
      if (!hasMentalVolatile) {
        return NO_ACTIVATION;
      }
      const effects: ItemEffect[] = [];
      for (const v of mentalVolatiles) {
        if (pokemon.volatileStatuses.has(v)) {
          effects.push({ type: "volatile-cure", target: "self", value: v });
        }
      }
      effects.push({ type: "consume", target: "self", value: "mental-herb" });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Mental Herb cured its affliction!`],
      };
    }

    // Sticky Barb: 1/8 max HP damage to holder each turn (NOT consumed)
    // Source: Showdown data/items.ts -- Sticky Barb onResidual
    case "sticky-barb": {
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: "chip-damage", target: "self", value: chipDamage }],
        messages: [`${pokemonName} was hurt by its Sticky Barb!`],
      };
    }

    // Berry Juice: Heal 20 HP when holder drops to <=50% HP (consumed)
    // Source: Showdown data/items.ts -- Berry Juice
    case "berry-juice": {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 20 },
            { type: "consume", target: "self", value: "berry-juice" },
          ],
          messages: [`${pokemonName}'s Berry Juice restored 20 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// on-damage-taken (defender perspective, after taking damage)
// ---------------------------------------------------------------------------

/**
 * Handle on-damage-taken item effects.
 *
 * Source: Showdown data/items.ts -- onDamagingHit and onAfterMoveSecondary triggers
 */
function handleOnDamageTaken(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
  const damage = context.damage ?? 0;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Focus Sash: Survive with 1 HP if at full HP and damage would KO (consumed, single-use)
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority
    case "focus-sash": {
      if (currentHp === maxHp && currentHp - damage <= 0) {
        return {
          activated: true,
          effects: [
            { type: "survive", target: "self", value: 1 },
            { type: "consume", target: "self", value: "focus-sash" },
          ],
          messages: [`${pokemonName} held on with its Focus Sash!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Focus Band: 10% chance to survive with 1 HP (NOT consumed)
    // Source: Showdown data/items.ts -- Focus Band onDamagePriority:
    //   this.randomChance(1, 10) -- 10% chance
    // Source: Bulbapedia "Focus Band" -- 10% chance to endure any hit at 1 HP
    case "focus-band": {
      if (currentHp - damage <= 0 && context.rng.chance(0.1)) {
        return {
          activated: true,
          effects: [{ type: "survive", target: "self", value: 1 }],
          messages: [`${pokemonName} held on with its Focus Band!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Sitrus Berry: activates when HP drops to <= 50% after damage.
    // Source: Showdown data/items.ts -- Sitrus Berry onUpdate post-damage check
    case "sitrus-berry": {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        const healAmount = Math.max(1, Math.floor(maxHp / 4));
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: healAmount },
            { type: "consume", target: "self", value: "sitrus-berry" },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: activates when HP drops to <= 50% after damage.
    // Source: Showdown data/items.ts -- Oran Berry post-damage check
    case "oran-berry": {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 10 },
            { type: "consume", target: "self", value: "oran-berry" },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // --- Stat pinch berries ---
    case "liechi-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "attack" },
            { type: "consume", target: "self", value: "liechi-berry" },
          ],
          messages: [`${pokemonName}'s Liechi Berry raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    case "ganlon-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "defense" },
            { type: "consume", target: "self", value: "ganlon-berry" },
          ],
          messages: [`${pokemonName}'s Ganlon Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    case "salac-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "speed" },
            { type: "consume", target: "self", value: "salac-berry" },
          ],
          messages: [`${pokemonName}'s Salac Berry raised its Speed!`],
        };
      }
      return NO_ACTIVATION;
    }

    case "petaya-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "spAttack" },
            { type: "consume", target: "self", value: "petaya-berry" },
          ],
          messages: [`${pokemonName}'s Petaya Berry raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    case "apicot-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "spDefense" },
            { type: "consume", target: "self", value: "apicot-berry" },
          ],
          messages: [`${pokemonName}'s Apicot Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Lansat Berry: +2 crit stages at <= 25% HP (consumed).
    // Identical effect to Focus Energy — sets the "focus-energy" volatile.
    // Source: Showdown data/items.ts -- lansatberry onEat: source.addVolatile('focusenergy')
    // Source: Showdown data/conditions.ts -- focusenergy: onModifyCritRatio: critRatio + 2
    // Source: Bulbapedia "Lansat Berry" -- raises critical-hit ratio by 2 stages
    case "lansat-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        // Set focus-energy volatile to grant +2 crit stages, matching Showdown behavior.
        // The rollCritical in BaseRuleset checks for this volatile and adds +2 stages.
        pokemon.volatileStatuses.set("focus-energy", { turnsLeft: -1 });
        return {
          activated: true,
          effects: [{ type: "consume", target: "self", value: "lansat-berry" }],
          messages: [`${pokemonName}'s Lansat Berry raised its critical-hit ratio!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Starf Berry: raises a random stat by 2 stages at <= 25% HP (consumed)
    // Source: Showdown data/items.ts -- Starf Berry onUpdate
    // Source: Bulbapedia "Starf Berry" -- raises a random stat by 2 stages
    case "starf-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        // Pick a random stat from atk/def/spa/spd/spe
        const stats = ["attack", "defense", "spAttack", "spDefense", "speed"] as const;
        const chosenStat = context.rng.pick(stats);
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: chosenStat, stages: 2 },
            { type: "consume", target: "self", value: "starf-berry" },
          ],
          messages: [`${pokemonName}'s Starf Berry sharply raised its ${chosenStat}!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit
    case "jaboca-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "physical" && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        if (attackerMaxHp === null) return NO_ACTIVATION;
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            { type: "chip-damage", target: "opponent", value: retaliationDamage },
            { type: "consume", target: "self", value: "jaboca-berry" },
          ],
          messages: [`${pokemonName}'s Jaboca Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Rowap Berry onDamagingHit
    case "rowap-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "special" && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        if (attackerMaxHp === null) return NO_ACTIVATION;
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            { type: "chip-damage", target: "opponent", value: retaliationDamage },
            { type: "consume", target: "self", value: "rowap-berry" },
          ],
          messages: [`${pokemonName}'s Rowap Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Air Balloon: pops when hit by any damaging move (consumed)
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    case "air-balloon": {
      if (damage > 0) {
        return {
          activated: true,
          effects: [{ type: "consume", target: "self", value: "air-balloon" }],
          messages: [`${pokemonName}'s Air Balloon popped!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Red Card: forces the attacker to switch out after being hit (consumed)
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary
    case "red-card": {
      if (currentHp > 0 && damage > 0) {
        return {
          activated: true,
          effects: [
            { type: "none", target: "opponent", value: "force-switch" },
            { type: "consume", target: "self", value: "red-card" },
          ],
          messages: [`${pokemonName} held up its Red Card against the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Eject Button: holder switches out after being hit (consumed)
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary
    case "eject-button": {
      if (currentHp > 0 && damage > 0) {
        return {
          activated: true,
          effects: [
            { type: "none", target: "self", value: "force-switch" },
            { type: "consume", target: "self", value: "eject-button" },
          ],
          messages: [`${pokemonName}'s Eject Button activated!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Absorb Bulb: +1 SpA when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit
    case "absorb-bulb": {
      if (currentHp > 0 && damage > 0 && context.move?.type === "water") {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "spAttack" },
            { type: "consume", target: "self", value: "absorb-bulb" },
          ],
          messages: [`${pokemonName}'s Absorb Bulb raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Cell Battery: +1 Atk when hit by an Electric-type move (consumed)
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit
    case "cell-battery": {
      if (currentHp > 0 && damage > 0 && context.move?.type === "electric") {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "attack" },
            { type: "consume", target: "self", value: "cell-battery" },
          ],
          messages: [`${pokemonName}'s Cell Battery raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Weakness Policy: +2 Atk and +2 SpAtk when hit by a super-effective move (consumed)
    // Source: Showdown data/items.ts -- weaknesspolicy: onDamagingHit
    // Source: Bulbapedia "Weakness Policy" -- +2 Atk/SpAtk on super-effective hit
    case "weakness-policy": {
      if (currentHp > 0 && damage > 0 && context.move) {
        const effectiveness = getTypeEffectiveness(
          context.move.type,
          pokemon.types,
          GEN9_TYPE_CHART,
        );
        if (effectiveness >= 2) {
          return {
            activated: true,
            effects: [
              { type: "stat-boost", target: "self", value: "attack", stages: 2 },
              { type: "stat-boost", target: "self", value: "spAttack", stages: 2 },
              { type: "consume", target: "self", value: "weakness-policy" },
            ],
            messages: [`${pokemonName}'s Weakness Policy sharply raised its Attack and Sp. Atk!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Kee Berry: +1 Def when hit by a physical move (consumed)
    // Source: Showdown data/items.ts -- keeberry: onDamagingHit physical
    case "kee-berry": {
      if (currentHp > 0 && damage > 0 && context.move?.category === "physical") {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "defense" },
            { type: "consume", target: "self", value: "kee-berry" },
          ],
          messages: [`${pokemonName}'s Kee Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Maranga Berry: +1 SpDef when hit by a special move (consumed)
    // Source: Showdown data/items.ts -- marangaberry: onDamagingHit special
    case "maranga-berry": {
      if (currentHp > 0 && damage > 0 && context.move?.category === "special") {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "spDefense" },
            { type: "consume", target: "self", value: "maranga-berry" },
          ],
          messages: [`${pokemonName}'s Maranga Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Luminous Moss: +1 SpDef when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- luminousmoss: onDamagingHit Water
    case "luminous-moss": {
      if (currentHp > 0 && damage > 0 && context.move?.type === "water") {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "spDefense" },
            { type: "consume", target: "self", value: "luminous-moss" },
          ],
          messages: [`${pokemonName}'s Luminous Moss raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Snowball: +1 Atk when hit by an Ice-type move (consumed)
    // Source: Showdown data/items.ts -- snowball: onDamagingHit Ice
    case "snowball": {
      if (currentHp > 0 && damage > 0 && context.move?.type === "ice") {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "attack" },
            { type: "consume", target: "self", value: "snowball" },
          ],
          messages: [`${pokemonName}'s Snowball raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Sticky Barb: transfer to attacker on contact move if attacker has no held item.
    // Source: Showdown data/items.ts -- Sticky Barb onHit: item transfer on contact
    case "sticky-barb": {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      // Prefer context.opponent (direct reference), fall back to scanning sides.
      // Source: Showdown data/items.ts -- Sticky Barb transfers to the attacker
      let opponent = context.opponent ?? null;
      if (!opponent) {
        const sides = context.state?.sides;
        if (!sides) return NO_ACTIVATION;
        const holderSide = sides.findIndex((s) =>
          s.active.some((a: { pokemon: unknown } | null) => a && a.pokemon === pokemon.pokemon),
        );
        if (holderSide === -1) return NO_ACTIVATION;
        const opponentSide = holderSide === 0 ? 1 : 0;
        opponent = sides[opponentSide]?.active?.[0] ?? null;
      }
      if (!opponent) return NO_ACTIVATION;
      if (opponent.pokemon.heldItem !== null) {
        return NO_ACTIVATION;
      }
      opponent.pokemon.heldItem = "sticky-barb";
      return {
        activated: true,
        effects: [{ type: "consume", target: "self", value: "sticky-barb" }],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// on-contact (defender perspective, after being hit by a contact move)
// ---------------------------------------------------------------------------

/**
 * Handle on-contact item effects (defender's perspective).
 *
 * Source: Showdown data/items.ts -- onDamagingHit triggers with contact check
 */
function handleOnContact(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Rocky Helmet: deals 1/6 of the ATTACKER's max HP to the attacker on contact.
    // NOT consumed -- permanent item.
    // Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit:
    //   if (move.flags['contact']) this.damage(source.baseMaxhp / 6, source, target)
    case "rocky-helmet": {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      const attackerMaxHp = getOpponentMaxHp(context);
      if (attackerMaxHp === null) return NO_ACTIVATION;
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 6));
      return {
        activated: true,
        effects: [{ type: "chip-damage", target: "opponent", value: chipDamage }],
        messages: [`${pokemonName}'s Rocky Helmet hurt the attacker!`],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// on-hit (attacker perspective, after dealing damage)
// ---------------------------------------------------------------------------

/**
 * Handle on-hit item effects (attacker's perspective, after dealing damage).
 *
 * Source: Showdown data/items.ts -- on-hit triggers
 */
function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // Source: Showdown data/items.ts -- King's Rock onModifyMovePriority
    case "kings-rock": {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [{ type: "flinch", target: "opponent" }],
            messages: [`${pokemonName}'s King's Rock caused flinching!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Razor Fang: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // Source: Showdown data/items.ts -- Razor Fang onModifyMovePriority
    case "razor-fang": {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [{ type: "flinch", target: "opponent" }],
            messages: [`${pokemonName}'s Razor Fang caused flinching!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Shell Bell: Heal 1/8 of damage dealt (NOT consumed -- permanent item)
    // Source: Showdown data/items.ts -- Shell Bell onAfterMoveSecondarySelf
    case "shell-bell": {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        const healAmount = Math.max(1, Math.floor(damageDealt / 8));
        return {
          activated: true,
          effects: [{ type: "heal", target: "self", value: healAmount }],
          messages: [`${pokemonName}'s Shell Bell restored HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Life Orb: Recoil floor(maxHP/10) per hit
    // 1.3x damage boost is handled in Gen9DamageCalc.ts
    // Sheer Force suppresses Life Orb recoil when the ability activates
    // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    case "life-orb": {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        const moveEffect = (context.move?.effect ?? null) as MoveEffect | null;
        const moveId = context.move?.id ?? "";
        if (sheerForceSuppressesLifeOrb(pokemon.ability, moveEffect, moveId)) {
          return NO_ACTIVATION;
        }
        const recoil = Math.max(1, Math.floor(maxHp / 10));
        return {
          activated: true,
          effects: [{ type: "chip-damage", target: "self", value: recoil }],
          messages: [`${pokemonName} is hurt by its Life Orb!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Throat Spray: +1 SpA when using a sound-based move (consumed).
    // Activates for any sound move, including status moves (Growl, Metal Sound, etc.).
    // Source: Showdown data/items.ts -- Throat Spray onAfterMoveSecondarySelf: sound flag only
    case "throat-spray": {
      if (context.move?.flags?.sound) {
        return {
          activated: true,
          effects: [
            { type: "stat-boost", target: "self", value: "spAttack" },
            { type: "consume", target: "self", value: "throat-spray" },
          ],
          messages: [`${pokemonName}'s Throat Spray raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}
