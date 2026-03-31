import type { ActivePokemon, ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import {
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
  BATTLE_ITEM_EFFECT_VALUES,
} from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TARGETS,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  getTypeEffectiveness,
  TYPE_EFFECTIVENESS_MULTIPLIERS,
} from "@pokemon-lib-ts/core";
import { GEN8_ABILITY_IDS, GEN8_ITEM_IDS, GEN8_MOVE_IDS } from "./data/reference-ids";
import { GEN8_TYPE_CHART } from "./Gen8TypeChart.js";

// ---------------------------------------------------------------------------
// No-op result
// ---------------------------------------------------------------------------

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

const ITEM_EFFECT_VALUE = BATTLE_ITEM_EFFECT_VALUES;
const ITEM_IDS = GEN8_ITEM_IDS;
const BLACK_SLUDGE_EFFECT_TYPES = {
  heal: "heal",
  damage: "damage",
} as const;

const CONSUMABLE_ITEM_STAT_IDS = {
  none: "none",
  speed: CORE_STAT_IDS.speed,
  spAttack: CORE_STAT_IDS.spAttack,
} as const;

const ABILITY_IDS = GEN8_ABILITY_IDS;
const STATUS_IDS = CORE_STATUS_IDS;

function canHolderSwitchOut(context: ItemContext): boolean {
  const side = context.state.sides.find((candidate) =>
    candidate.active?.some((active) => active === context.pokemon),
  );
  if (!side) return true;
  const sideState = side as unknown as {
    team?: Array<{ currentHp: number }>;
    bench?: Array<{ pokemon?: { currentHp: number }; currentHp?: number }>;
  };

  if (Array.isArray(sideState.team)) {
    return sideState.team.some(
      (teamPokemon, index) => teamPokemon.currentHp > 0 && index !== context.pokemon.teamSlot,
    );
  }

  if (Array.isArray(sideState.bench)) {
    return sideState.bench.some(
      (benchPokemon) => (benchPokemon.pokemon?.currentHp ?? benchPokemon.currentHp ?? 0) > 0,
    );
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Type-Boost Items (carried from Gen 6-7, 1.2x = 4915/4096)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type-boosting held items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same set as Gen 6-7.
 *
 * Source: Showdown data/items.ts -- Charcoal, Mystic Water, etc. use
 *   onBasePower with chainModify([4915, 4096])
 */
const TYPE_BOOST_ITEMS: Readonly<Record<string, PokemonType>> = {
  [ITEM_IDS.charcoal]: CORE_TYPE_IDS.fire,
  [ITEM_IDS.mysticWater]: CORE_TYPE_IDS.water,
  [ITEM_IDS.miracleSeed]: CORE_TYPE_IDS.grass,
  [ITEM_IDS.magnet]: CORE_TYPE_IDS.electric,
  [ITEM_IDS.twistedSpoon]: CORE_TYPE_IDS.psychic,
  [ITEM_IDS.spellTag]: CORE_TYPE_IDS.ghost,
  [ITEM_IDS.neverMeltIce]: CORE_TYPE_IDS.ice,
  [ITEM_IDS.blackBelt]: CORE_TYPE_IDS.fighting,
  [ITEM_IDS.poisonBarb]: CORE_TYPE_IDS.poison,
  [ITEM_IDS.softSand]: CORE_TYPE_IDS.ground,
  [ITEM_IDS.sharpBeak]: CORE_TYPE_IDS.flying,
  [ITEM_IDS.hardStone]: CORE_TYPE_IDS.rock,
  [ITEM_IDS.silverPowder]: CORE_TYPE_IDS.bug,
  [ITEM_IDS.dragonFang]: CORE_TYPE_IDS.dragon,
  [ITEM_IDS.blackGlasses]: CORE_TYPE_IDS.dark,
  [ITEM_IDS.metalCoat]: CORE_TYPE_IDS.steel,
  [ITEM_IDS.silkScarf]: CORE_TYPE_IDS.normal,
};

/**
 * Plate items present in the Gen 8 data bundle.
 * The current Gen 8 item data only includes Pixie Plate.
 *
 * Source: packages/gen8/data/items.json
 */
const PLATE_ITEMS: Readonly<Record<string, PokemonType>> = {
  [ITEM_IDS.pixiePlate]: CORE_TYPE_IDS.fairy,
};

/**
 * Incense items: ~1.2x (4915/4096) base power increase for moves
 * of the matching type. Same as Gen 6-7.
 *
 * Source: Showdown data/items.ts -- incense items onBasePower
 */
const INCENSE_ITEMS: Readonly<Record<string, PokemonType>> = {
  [ITEM_IDS.seaIncense]: CORE_TYPE_IDS.water,
  [ITEM_IDS.waveIncense]: CORE_TYPE_IDS.water,
  [ITEM_IDS.roseIncense]: CORE_TYPE_IDS.grass,
  [ITEM_IDS.oddIncense]: CORE_TYPE_IDS.psychic,
  [ITEM_IDS.rockIncense]: CORE_TYPE_IDS.rock,
};

// ═══════════════════════════════════════════════════════════════════════════
// Type-Resist Berries (reference to Gen8DamageCalc.ts for damage formula)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type-resist berries: halve super-effective damage of the matching type.
 * Consumed after activation. Same set as Gen 6-7.
 * Chilan Berry activates on any Normal-type hit (no super-effective requirement).
 *
 * Source: Showdown data/items.ts -- type-resist berries onSourceModifyDamage
 * Source: Bulbapedia -- type-resist berries
 */
const TYPE_RESIST_BERRIES: Readonly<Record<string, PokemonType>> = {
  [ITEM_IDS.occaBerry]: CORE_TYPE_IDS.fire,
  [ITEM_IDS.passhoBerry]: CORE_TYPE_IDS.water,
  [ITEM_IDS.wacanBerry]: CORE_TYPE_IDS.electric,
  [ITEM_IDS.rindoBerry]: CORE_TYPE_IDS.grass,
  [ITEM_IDS.yacheBerry]: CORE_TYPE_IDS.ice,
  [ITEM_IDS.chopleBerry]: CORE_TYPE_IDS.fighting,
  [ITEM_IDS.kebiaBerry]: CORE_TYPE_IDS.poison,
  [ITEM_IDS.shucaBerry]: CORE_TYPE_IDS.ground,
  [ITEM_IDS.cobaBerry]: CORE_TYPE_IDS.flying,
  [ITEM_IDS.payapaBerry]: CORE_TYPE_IDS.psychic,
  [ITEM_IDS.tangaBerry]: CORE_TYPE_IDS.bug,
  [ITEM_IDS.chartiBerry]: CORE_TYPE_IDS.rock,
  [ITEM_IDS.kasibBerry]: CORE_TYPE_IDS.ghost,
  [ITEM_IDS.habanBerry]: CORE_TYPE_IDS.dragon,
  [ITEM_IDS.colburBerry]: CORE_TYPE_IDS.dark,
  [ITEM_IDS.babiriBerry]: CORE_TYPE_IDS.steel,
  [ITEM_IDS.chilanBerry]: CORE_TYPE_IDS.normal,
  [ITEM_IDS.roseliBerry]: CORE_TYPE_IDS.fairy,
};

// ═══════════════════════════════════════════════════════════════════════════
// Choice Items
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Choice items lock the holder into one move but boost a stat by 1.5x.
 *
 * Source: Showdown data/items.ts -- Choice Band/Specs/Scarf onModifyAtk/onModifySpe
 * Source: Bulbapedia -- Choice Band/Specs/Scarf
 */
const CHOICE_ITEMS: Readonly<
  Record<string, { stat: "atk" | "spatk" | "spe"; multiplier: number }>
> = {
  [ITEM_IDS.choiceBand]: { stat: "atk", multiplier: 1.5 },
  [ITEM_IDS.choiceSpecs]: { stat: "spatk", multiplier: 1.5 },
  [ITEM_IDS.choiceScarf]: { stat: "spe", multiplier: 1.5 },
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
 * Check whether a Pokemon is choice-locked (has a Choice item and is NOT Dynamaxed).
 * Dynamax suppresses Choice item locking in Gen 8.
 *
 * Source: Showdown sim/battle-actions.ts Gen 8 -- Dynamax suppresses Choice lock
 * Source: Bulbapedia "Dynamax" -- "Choice items do not lock the user into a single move"
 */
export function isChoiceLocked(pokemon: ActivePokemon): boolean {
  const item = pokemon.pokemon.heldItem;
  if (!item || !(item in CHOICE_ITEMS)) return false;
  // Dynamax suppresses Choice item lock in Gen 8
  if (pokemon.isDynamaxed) return false;
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
  const isDamagingMove =
    moveCategory === CORE_MOVE_CATEGORIES.physical || moveCategory === CORE_MOVE_CATEGORIES.special;

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
  if (item === ITEM_IDS.lifeOrb && isDamagingMove) return 5325;

  // Choice Band: 1.5x (6144/4096) for physical moves only
  // Source: Showdown data/items.ts -- Choice Band onModifyAtk
  if (item === ITEM_IDS.choiceBand && moveCategory === CORE_MOVE_CATEGORIES.physical) {
    return 6144;
  }

  // Choice Specs: 1.5x (6144/4096) for special moves only
  // Source: Showdown data/items.ts -- Choice Specs onModifySpA
  if (item === ITEM_IDS.choiceSpecs && moveCategory === CORE_MOVE_CATEGORIES.special) {
    return 6144;
  }

  return 4096;
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Umbrella (Gen 8 new)
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
  return pokemon.pokemon.heldItem === ITEM_IDS.utilityUmbrella;
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
  type: (typeof BLACK_SLUDGE_EFFECT_TYPES)["heal"] | (typeof BLACK_SLUDGE_EFFECT_TYPES)["damage"];
  amount: number;
} {
  const isPoison = pokemon.types.includes(CORE_TYPE_IDS.poison);
  if (isPoison) {
    return {
      type: BLACK_SLUDGE_EFFECT_TYPES.heal,
      amount: Math.max(1, Math.floor(pokemon.maxHp / 16)),
    };
  }
  return {
    type: BLACK_SLUDGE_EFFECT_TYPES.damage,
    amount: Math.max(1, Math.floor(pokemon.maxHp / 8)),
  };
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
  return pokemon.pokemon.heldItem === ITEM_IDS.assaultVest;
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
  if (berryType === CORE_TYPE_IDS.normal) return 2048;
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
  return pokemon.pokemon.heldItem === ITEM_IDS.airBalloon;
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
  return pokemon.pokemon.heldItem === ITEM_IDS.ironBall;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gen 8 New Consumable Items
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Eject Pack should trigger: activates when any stat is lowered.
 * Consumable, one-time use. Forces the holder to switch out.
 *
 * Source: Showdown data/items.ts -- Eject Pack onAfterBoost:
 *   if any boost is < 0, force switch and consume item
 * Source: Bulbapedia "Eject Pack" -- activates when the holder's stats are lowered
 */
export function getEjectPackTrigger(statChange: number): boolean {
  return statChange < 0;
}

/**
 * Check if Blunder Policy should trigger: activates when a move misses.
 * Consumable, one-time use. Raises Speed by 2 stages.
 *
 * Source: Showdown data/items.ts -- Blunder Policy onAfterMoveSelf:
 *   if (!move.hit) { boost speed +2, consume }
 * Source: Bulbapedia "Blunder Policy" -- raises Speed by 2 when a move misses
 */
export function getBlunderPolicyTrigger(moveMissed: boolean): boolean {
  return moveMissed;
}

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
 * Check if Room Service should trigger: activates when Trick Room is active.
 * Consumable, one-time use. Lowers Speed by 1 stage.
 *
 * Source: Showdown data/items.ts -- Room Service onAfterTrickRoom:
 *   if (source.volatiles['trickroom']) { boost spe -1, consume }
 * Source: Bulbapedia "Room Service" -- lowers Speed by 1 when Trick Room takes effect
 */
export function getRoomServiceTrigger(trickRoomActive: boolean): boolean {
  return trickRoomActive;
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
    case ITEM_IDS.ejectPack:
      if (context.statChange !== undefined && context.statChange < 0) {
        // Eject Pack forces switch (no stat boost), consumed
        return { stat: CONSUMABLE_ITEM_STAT_IDS.none, stages: 0, consumed: true };
      }
      return null;
    case ITEM_IDS.blunderPolicy:
      if (context.moveMissed) {
        return { stat: CONSUMABLE_ITEM_STAT_IDS.speed, stages: 2, consumed: true };
      }
      return null;
    case ITEM_IDS.throatSpray:
      if (context.moveFlags?.sound) {
        return { stat: CONSUMABLE_ITEM_STAT_IDS.spAttack, stages: 1, consumed: true };
      }
      return null;
    case ITEM_IDS.roomService:
      if (context.trickRoomActive) {
        return { stat: CONSUMABLE_ITEM_STAT_IDS.speed, stages: -1, consumed: true };
      }
      return null;
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Gluttony helper (carried from Gen 6-7)
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
  if (pokemon.ability === ABILITY_IDS.gluttony && normalFraction <= 0.25) {
    return 0.5;
  }
  return normalFraction;
}

// ═══════════════════════════════════════════════════════════════════════════
// Safety Goggles (carried from Gen 6-7)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a move is blocked by Safety Goggles (powder moves).
 *
 * Source: Showdown data/items.ts -- safetygoggles: isPowderImmune
 * Source: Bulbapedia "Safety Goggles" -- blocks powder moves
 */
export function isGen8PowderBlocked(itemId: string, moveFlags: { powder?: boolean }): boolean {
  return itemId === ITEM_IDS.safetyGoggles && moveFlags.powder === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheer Force + Life Orb suppression (carried from Gen 6-7)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Moves with secondary effects stored as custom onHit functions in Showdown.
 *
 * Source: Showdown data/moves.ts -- moves with secondaries as onHit
 */
const SHEER_FORCE_WHITELIST: ReadonlySet<string> = new Set([CORE_MOVE_IDS.triAttack]);

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
 * Check whether Sheer Force suppresses Life Orb recoil for this move.
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
 */
function sheerForceSuppressesLifeOrb(
  abilityId: string,
  effect: MoveEffect | null,
  moveId: string,
): boolean {
  if (abilityId !== ABILITY_IDS.sheerForce) return false;
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
 * Returns null when the attacker cannot be resolved — callers must skip
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
 * Apply a Gen 8 held item effect at the given trigger point.
 *
 * Gen 8 item changes from Gen 7:
 *   - Z-Crystals: REMOVED (no Z-Move system in Gen 8)
 *   - Mega Stones: REMOVED (no Mega Evolution in Gen 8)
 *   - Heavy-Duty Boots (new): blocks ALL entry hazard damage
 *   - Room Service (new): -1 Speed when Trick Room activates
 *   - Eject Pack (new): forces switch when any stat is lowered
 *   - Blunder Policy (new): +2 Speed when a move misses
 *   - Throat Spray (new): +1 SpAtk after using a sound move
 *   - Utility Umbrella (new): negates weather effects for holder
 *   - Choice item lock suppressed during Dynamax
 *
 * All Gen 7 non-Z/non-Mega items are carried forward with unchanged mechanics.
 *
 * Source: Showdown data/items.ts -- Gen 8 item handlers
 * Source: Bulbapedia -- individual item pages
 *
 * @param trigger - When the item check occurs
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen8HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  // Klutz: holder cannot use its held item -- suppress all item triggers
  // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts -- Klutz gates all item battle effects
  if (context.pokemon.ability === ABILITY_IDS.klutz) {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5/6/7/8 -- Embargo blocks item effects
  if (context.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)) {
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
    case CORE_ITEM_TRIGGER_IDS.onStatChange:
      result = handleOnStatChange(item, context);
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
    context.pokemon.ability === ABILITY_IDS.unburden &&
    result.effects.some((e) => e.type === BATTLE_ITEM_EFFECT_TYPES.consume) &&
    !context.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
  ) {
    context.pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
  }

  return result;
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

  const existing = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.metronomeCount);
  const previousMoveId = existing?.data?.moveId as string | undefined;
  const previousCount = (existing?.data?.count as number) ?? 0;

  if (previousMoveId === moveId) {
    const newCount = previousCount + 1;
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.metronomeCount, {
      turnsLeft: -1,
      data: { count: newCount, moveId },
    });
  } else {
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.metronomeCount, {
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
  const isPoison = pokemon.types.includes(CORE_TYPE_IDS.poison);

  switch (item) {
    // Leftovers: Heal 1/16 max HP each turn, NOT consumed
    // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP
    case ITEM_IDS.leftovers: {
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.heal,
            target: BATTLE_EFFECT_TARGETS.self,
            value: healAmount,
          },
        ],
        messages: [`${pokemonName}'s Leftovers restored its HP!`],
      };
    }

    // Black Sludge: Heals Poison-types 1/16 max HP; damages non-Poison-types 1/8 max HP
    // Source: Showdown data/items.ts -- Black Sludge onResidual
    case ITEM_IDS.blackSludge: {
      if (isPoison) {
        const healAmount = Math.max(1, Math.floor(maxHp / 16));
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.heal,
              target: BATTLE_EFFECT_TARGETS.self,
              value: healAmount,
            },
          ],
          messages: [`${pokemonName}'s Black Sludge restored its HP!`],
        };
      }
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.chipDamage,
            target: BATTLE_EFFECT_TARGETS.self,
            value: chipDamage,
          },
        ],
        messages: [`${pokemonName} was hurt by its Black Sludge!`],
      };
    }

    // Toxic Orb: Badly poisons the holder at end of turn
    // Source: Showdown data/items.ts -- Toxic Orb onResidual
    case ITEM_IDS.toxicOrb: {
      if (status) return NO_ACTIVATION;
      // Poison and Steel types are immune to poisoning
      if (
        pokemon.types.includes(CORE_TYPE_IDS.poison) ||
        pokemon.types.includes(CORE_TYPE_IDS.steel)
      ) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.inflictStatus,
            target: BATTLE_EFFECT_TARGETS.self,
            status: STATUS_IDS.badlyPoisoned,
          },
        ],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    case ITEM_IDS.flameOrb: {
      if (status) return NO_ACTIVATION;
      // Fire types are immune to burns
      if (pokemon.types.includes(CORE_TYPE_IDS.fire)) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.inflictStatus,
            target: BATTLE_EFFECT_TARGETS.self,
            status: STATUS_IDS.burn,
          },
        ],
        messages: [`${pokemonName} was burned by its Flame Orb!`],
      };
    }

    // Sitrus Berry: Heal 1/4 max HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Sitrus Berry onEat / onUpdate
    case ITEM_IDS.sitrusBerry: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        const healAmount = Math.max(1, Math.floor(maxHp / 4));
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.heal,
              target: BATTLE_EFFECT_TARGETS.self,
              value: healAmount,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Oran Berry
    case ITEM_IDS.oranBerry: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 10 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Lum Berry: Cures any primary status OR confusion (consumed)
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    case ITEM_IDS.lumBerry: {
      const hasConfusion = pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.confusion);
      const hasPrimaryStatus = status != null;
      if (!hasPrimaryStatus && !hasConfusion) {
        return NO_ACTIVATION;
      }
      const effects: ItemEffect[] = [];
      if (hasPrimaryStatus) {
        effects.push({
          type: BATTLE_ITEM_EFFECT_TYPES.statusCure,
          target: BATTLE_EFFECT_TARGETS.self,
        });
      }
      if (hasConfusion) {
        effects.push({
          type: BATTLE_ITEM_EFFECT_TYPES.volatileCure,
          target: BATTLE_EFFECT_TARGETS.self,
          value: CORE_VOLATILE_IDS.confusion,
        });
      }
      effects.push({
        type: BATTLE_ITEM_EFFECT_TYPES.consume,
        target: BATTLE_EFFECT_TARGETS.self,
        value: ITEM_IDS.lumBerry,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Lum Berry cured its status!`],
      };
    }

    // Cheri Berry: Cures paralysis (consumed)
    case ITEM_IDS.cheriBerry: {
      if (status === STATUS_IDS.paralysis) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.cheriBerry,
            },
          ],
          messages: [`${pokemonName}'s Cheri Berry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Chesto Berry: Cures sleep (consumed)
    case ITEM_IDS.chestoBerry: {
      if (status === STATUS_IDS.sleep) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.chestoBerry,
            },
          ],
          messages: [`${pokemonName}'s Chesto Berry woke it up!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Pecha Berry: Cures poison and badly-poisoned (consumed)
    case ITEM_IDS.pechaBerry: {
      if (status === STATUS_IDS.poison || status === STATUS_IDS.badlyPoisoned) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.pechaBerry,
            },
          ],
          messages: [`${pokemonName}'s Pecha Berry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rawst Berry: Cures burn (consumed)
    case ITEM_IDS.rawstBerry: {
      if (status === STATUS_IDS.burn) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.rawstBerry,
            },
          ],
          messages: [`${pokemonName}'s Rawst Berry cured its burn!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Aspear Berry: Cures freeze (consumed)
    case ITEM_IDS.aspearBerry: {
      if (status === STATUS_IDS.freeze) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.aspearBerry,
            },
          ],
          messages: [`${pokemonName}'s Aspear Berry thawed it out!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Persim Berry: Cures confusion volatile status (consumed)
    case ITEM_IDS.persimBerry: {
      if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.volatileCure,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_VOLATILE_IDS.confusion,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.persimBerry,
            },
          ],
          messages: [`${pokemonName}'s Persim Berry snapped it out of confusion!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Mental Herb: Cures infatuation, Taunt, Encore, Disable, Torment, Heal Block
    // Source: Showdown data/items.ts -- Mental Herb onUpdate
    case ITEM_IDS.mentalHerb: {
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
          effects.push({
            type: BATTLE_ITEM_EFFECT_TYPES.volatileCure,
            target: BATTLE_EFFECT_TARGETS.self,
            value: v,
          });
        }
      }
      effects.push({
        type: BATTLE_ITEM_EFFECT_TYPES.consume,
        target: BATTLE_EFFECT_TARGETS.self,
        value: ITEM_IDS.mentalHerb,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Mental Herb cured its affliction!`],
      };
    }

    // Sticky Barb: 1/8 max HP damage to holder each turn (NOT consumed)
    // Source: Showdown data/items.ts -- Sticky Barb onResidual
    case ITEM_IDS.stickyBarb: {
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.chipDamage,
            target: BATTLE_EFFECT_TARGETS.self,
            value: chipDamage,
          },
        ],
        messages: [`${pokemonName} was hurt by its Sticky Barb!`],
      };
    }

    // Berry Juice: Heal 20 HP when holder drops to <=50% HP (consumed)
    // Source: Showdown data/items.ts -- Berry Juice
    case ITEM_IDS.berryJuice: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 20 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.berryJuice,
            },
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
    // Focus Sash is handled by Gen8Ruleset.capLethalDamage (pre-damage hook).
    // It is NOT handled here (post-damage) because currentHp is already post-damage,
    // so currentHp === maxHp is always false when damage > 0.
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority (pre-damage)

    // Sitrus Berry: activates when HP drops to <= 50% after damage.
    case ITEM_IDS.sitrusBerry: {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        const healAmount = Math.max(1, Math.floor(maxHp / 4));
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.heal,
              target: BATTLE_EFFECT_TARGETS.self,
              value: healAmount,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: activates when HP drops to <= 50% after damage.
    case ITEM_IDS.oranBerry: {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 10 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // --- Stat pinch berries ---
    case ITEM_IDS.liechiBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.attack,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.liechiBerry,
            },
          ],
          messages: [`${pokemonName}'s Liechi Berry raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    case ITEM_IDS.ganlonBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.defense,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.ganlonBerry,
            },
          ],
          messages: [`${pokemonName}'s Ganlon Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    case ITEM_IDS.salacBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.speed,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.salacBerry,
            },
          ],
          messages: [`${pokemonName}'s Salac Berry raised its Speed!`],
        };
      }
      return NO_ACTIVATION;
    }

    case ITEM_IDS.petayaBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.spAttack,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.petayaBerry,
            },
          ],
          messages: [`${pokemonName}'s Petaya Berry raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    case ITEM_IDS.apicotBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.spDefense,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.apicotBerry,
            },
          ],
          messages: [`${pokemonName}'s Apicot Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit
    case ITEM_IDS.jabocaBerry: {
      const moveCategory = context.move?.category;
      if (moveCategory === CORE_MOVE_CATEGORIES.physical && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        if (attackerMaxHp === null) return NO_ACTIVATION;
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.chipDamage,
              target: BATTLE_EFFECT_TARGETS.opponent,
              value: retaliationDamage,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.jabocaBerry,
            },
          ],
          messages: [`${pokemonName}'s Jaboca Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Rowap Berry onDamagingHit
    case ITEM_IDS.rowapBerry: {
      const moveCategory = context.move?.category;
      if (moveCategory === CORE_MOVE_CATEGORIES.special && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        if (attackerMaxHp === null) return NO_ACTIVATION;
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.chipDamage,
              target: BATTLE_EFFECT_TARGETS.opponent,
              value: retaliationDamage,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.rowapBerry,
            },
          ],
          messages: [`${pokemonName}'s Rowap Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Sticky Barb: transfer to attacker on contact move if attacker has no held item.
    // Source: Showdown data/items.ts -- Sticky Barb onHit: item transfer on contact
    case ITEM_IDS.stickyBarb: {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      const sides = context.state?.sides;
      if (!sides) return NO_ACTIVATION;
      const holderSide = sides.findIndex((s) =>
        s.active.some((a: { pokemon: unknown } | null) => a && a.pokemon === pokemon.pokemon),
      );
      if (holderSide === -1) return NO_ACTIVATION;
      const opponentSide = holderSide === 0 ? 1 : 0;
      const opponent = sides[opponentSide]?.active?.[0];
      if (!opponent) return NO_ACTIVATION;
      if (opponent.pokemon.heldItem !== null) {
        return NO_ACTIVATION;
      }
      opponent.pokemon.heldItem = ITEM_IDS.stickyBarb;
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: ITEM_IDS.stickyBarb,
          },
        ],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
      };
    }

    // Air Balloon: pops when hit by any damaging move (consumed)
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    case ITEM_IDS.airBalloon: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.airBalloon,
            },
          ],
          messages: [`${pokemonName}'s Air Balloon popped!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Red Card: forces the attacker to switch out after being hit (consumed)
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary
    case ITEM_IDS.redCard: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.none,
              target: BATTLE_EFFECT_TARGETS.opponent,
              value: ITEM_EFFECT_VALUE.forceSwitch,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.redCard,
            },
          ],
          messages: [`${pokemonName} held up its Red Card against the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Eject Button: holder switches out after being hit (consumed)
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary
    case ITEM_IDS.ejectButton: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.none,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_EFFECT_VALUE.forceSwitch,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.ejectButton,
            },
          ],
          messages: [`${pokemonName}'s Eject Button activated!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Absorb Bulb: +1 SpA when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit
    case ITEM_IDS.absorbBulb: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.water) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.spAttack,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.absorbBulb,
            },
          ],
          messages: [`${pokemonName}'s Absorb Bulb raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Cell Battery: +1 Atk when hit by an Electric-type move (consumed)
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit
    case ITEM_IDS.cellBattery: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.electric) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.attack,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.cellBattery,
            },
          ],
          messages: [`${pokemonName}'s Cell Battery raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Weakness Policy: +2 Atk and +2 SpAtk when hit by a super-effective move (consumed)
    // Source: Showdown data/items.ts -- weaknesspolicy: onDamagingHit
    case ITEM_IDS.weaknessPolicy: {
      if (damage > 0 && context.move) {
        const effectiveness = getTypeEffectiveness(
          context.move.type,
          pokemon.types,
          GEN8_TYPE_CHART,
        );
        if (effectiveness >= TYPE_EFFECTIVENESS_MULTIPLIERS.superEffective) {
          return {
            activated: true,
            effects: [
              {
                type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
                target: BATTLE_EFFECT_TARGETS.self,
                value: CORE_STAT_IDS.attack,
                stages: 2,
              },
              {
                type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
                target: BATTLE_EFFECT_TARGETS.self,
                value: CORE_STAT_IDS.spAttack,
                stages: 2,
              },
              {
                type: BATTLE_ITEM_EFFECT_TYPES.consume,
                target: BATTLE_EFFECT_TARGETS.self,
                value: ITEM_IDS.weaknessPolicy,
              },
            ],
            messages: [`${pokemonName}'s Weakness Policy sharply raised its Attack and Sp. Atk!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Kee Berry: +1 Def when hit by a physical move (consumed)
    // Source: Showdown data/items.ts -- keeberry: onDamagingHit physical
    case ITEM_IDS.keeBerry: {
      if (damage > 0 && context.move?.category === CORE_MOVE_CATEGORIES.physical) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.defense,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.keeBerry,
            },
          ],
          messages: [`${pokemonName}'s Kee Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Maranga Berry: +1 SpDef when hit by a special move (consumed)
    // Source: Showdown data/items.ts -- marangaberry: onDamagingHit special
    case ITEM_IDS.marangaBerry: {
      if (damage > 0 && context.move?.category === CORE_MOVE_CATEGORIES.special) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.spDefense,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.marangaBerry,
            },
          ],
          messages: [`${pokemonName}'s Maranga Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Luminous Moss: +1 SpDef when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- luminousmoss: onDamagingHit Water
    case ITEM_IDS.luminousMoss: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.water) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.spDefense,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.luminousMoss,
            },
          ],
          messages: [`${pokemonName}'s Luminous Moss raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Snowball: +1 Atk when hit by an Ice-type move (consumed)
    // Source: Showdown data/items.ts -- snowball: onDamagingHit Ice
    case ITEM_IDS.snowball: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.ice) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: CORE_STAT_IDS.attack,
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: ITEM_IDS.snowball,
            },
          ],
          messages: [`${pokemonName}'s Snowball raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
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
    case ITEM_IDS.rockyHelmet: {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      const attackerMaxHp = getOpponentMaxHp(context);
      if (attackerMaxHp === null) return NO_ACTIVATION;
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 6));
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.chipDamage,
            target: BATTLE_EFFECT_TARGETS.opponent,
            value: chipDamage,
          },
        ],
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
    case ITEM_IDS.kingsRock: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [
              { type: BATTLE_ITEM_EFFECT_TYPES.flinch, target: BATTLE_EFFECT_TARGETS.opponent },
            ],
            messages: [`${pokemonName}'s King's Rock caused flinching!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Shell Bell: Heal 1/8 of damage dealt (NOT consumed -- permanent item)
    // Source: Showdown data/items.ts -- Shell Bell onAfterMoveSecondarySelf
    case ITEM_IDS.shellBell: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        const healAmount = Math.max(1, Math.floor(damageDealt / 8));
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.heal,
              target: BATTLE_EFFECT_TARGETS.self,
              value: healAmount,
            },
          ],
          messages: [`${pokemonName}'s Shell Bell restored HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Life Orb: Recoil floor(maxHP/10) per hit
    // 1.3x damage boost is handled in Gen8DamageCalc.ts
    // Sheer Force suppresses Life Orb recoil when the ability activates
    // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    case ITEM_IDS.lifeOrb: {
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
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.chipDamage,
              target: BATTLE_EFFECT_TARGETS.self,
              value: recoil,
            },
          ],
          messages: [`${pokemonName} is hurt by its Life Orb!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// on-stat-change (holder-side stat change reactions)
// ---------------------------------------------------------------------------

function handleOnStatChange(item: string, context: ItemContext): ItemResult {
  const statChange = context.statChange;
  if (!statChange) return NO_ACTIVATION;

  const pokemon = context.pokemon;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Eject Pack: consume and force the holder out after one of its stats is lowered.
    // Source: Showdown data/items.ts -- ejectpack.onAfterBoost
    case ITEM_IDS.ejectPack: {
      if (
        statChange.phase !== "after" ||
        statChange.causeId === GEN8_MOVE_IDS.partingShot ||
        !statChange.applied.some((change) => change.stages < 0) ||
        !canHolderSwitchOut(context)
      ) {
        return NO_ACTIVATION;
      }

      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.none,
            target: BATTLE_EFFECT_TARGETS.self,
            value: ITEM_EFFECT_VALUE.forceSwitch,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: ITEM_IDS.ejectPack,
          },
        ],
        messages: [`${pokemonName}'s Eject Pack activated!`],
      };
    }

    // Adrenaline Orb: +1 Speed after an Intimidate-style Attack drop from the foe.
    // Source: Showdown data/items.ts -- adrenalineorb.onAfterBoost
    case ITEM_IDS.adrenalineOrb: {
      const attemptedAttackDrop = statChange.attempted.some(
        (change) => change.stat === CORE_STAT_IDS.attack && change.stages < 0,
      );
      const appliedAttackDrop = statChange.applied.some(
        (change) => change.stat === CORE_STAT_IDS.attack && change.stages < 0,
      );
      const currentAttackStage = pokemon.statStages[CORE_STAT_IDS.attack] ?? 0;
      const nullifiedByStageClamp =
        !appliedAttackDrop &&
        (!attemptedAttackDrop ||
          currentAttackStage <= -6 ||
          (pokemon.ability === GEN8_ABILITY_IDS.contrary && currentAttackStage >= 6));
      const currentSpeedStage = pokemon.statStages[CORE_STAT_IDS.speed] ?? 0;
      if (
        statChange.phase !== "after" ||
        statChange.source !== BATTLE_EFFECT_TARGETS.opponent ||
        statChange.causeId !== GEN8_ABILITY_IDS.intimidate ||
        nullifiedByStageClamp ||
        currentSpeedStage >= 6
      ) {
        return NO_ACTIVATION;
      }

      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.speed,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: ITEM_IDS.adrenalineOrb,
          },
        ],
        messages: [`${pokemonName}'s Adrenaline Orb raised its Speed!`],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}
