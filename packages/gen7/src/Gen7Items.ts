import type { ActivePokemon, ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import {
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
  BATTLE_ITEM_EFFECT_VALUES,
} from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
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
import { GEN7_ABILITY_IDS, GEN7_ITEM_IDS, GEN7_MOVE_IDS } from "./data/reference-ids.js";
import { GEN7_TYPE_CHART } from "./Gen7TypeChart.js";

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

// ═══════════════════════════════════════════════════════════════════════════
// Z-Crystal System
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map of type-specific Z-Crystal item IDs to the type they power.
 * There are 18 type-specific Z-Crystals (one per type).
 *
 * Source: Showdown data/items.ts -- individual Z-Crystal entries
 * Source: Bulbapedia "Z-Crystal" -- https://bulbapedia.bulbagarden.net/wiki/Z-Crystal
 */
const TYPED_Z_CRYSTALS: Readonly<Record<string, PokemonType>> = {
  [GEN7_ITEM_IDS.normaliumZ]: CORE_TYPE_IDS.normal,
  [GEN7_ITEM_IDS.fightiniumZ]: CORE_TYPE_IDS.fighting,
  [GEN7_ITEM_IDS.flyiniumZ]: CORE_TYPE_IDS.flying,
  [GEN7_ITEM_IDS.poisoniumZ]: CORE_TYPE_IDS.poison,
  [GEN7_ITEM_IDS.groundiumZ]: CORE_TYPE_IDS.ground,
  [GEN7_ITEM_IDS.rockiumZ]: CORE_TYPE_IDS.rock,
  [GEN7_ITEM_IDS.buginiumZ]: CORE_TYPE_IDS.bug,
  [GEN7_ITEM_IDS.ghostiumZ]: CORE_TYPE_IDS.ghost,
  [GEN7_ITEM_IDS.steeliumZ]: CORE_TYPE_IDS.steel,
  [GEN7_ITEM_IDS.firiumZ]: CORE_TYPE_IDS.fire,
  [GEN7_ITEM_IDS.wateriumZ]: CORE_TYPE_IDS.water,
  [GEN7_ITEM_IDS.grassiumZ]: CORE_TYPE_IDS.grass,
  [GEN7_ITEM_IDS.electriumZ]: CORE_TYPE_IDS.electric,
  [GEN7_ITEM_IDS.psychiumZ]: CORE_TYPE_IDS.psychic,
  [GEN7_ITEM_IDS.iciumZ]: CORE_TYPE_IDS.ice,
  [GEN7_ITEM_IDS.dragoniumZ]: CORE_TYPE_IDS.dragon,
  [GEN7_ITEM_IDS.darkiniumZ]: CORE_TYPE_IDS.dark,
  [GEN7_ITEM_IDS.fairiumZ]: CORE_TYPE_IDS.fairy,
};

/**
 * Species-specific Z-Move ids are canonical runtime ids, but they are not present in the
 * generated move reference surface because they are unlocked through held-item state rather
 * than standard learnset/move-data lookup in this package.
 */
const GEN7_Z_MOVE_IDS = {
  catastrophika: "catastropika",
  tenMillionVoltThunderbolt: "10000000-volt-thunderbolt",
  stokedSparksurfer: "stoked-sparksurfer",
  pulverizingPancake: "pulverizing-pancake",
  genesisSupernova: "genesis-supernova",
  sinisterArrowRaid: "sinister-arrow-raid",
  maliciousMoonsault: "malicious-moonsault",
  oceanicOperetta: "oceanic-operetta",
  guardianOfAlola: "guardian-of-alola",
  soulStealingSevenStarStrike: "soul-stealing-7-star-strike",
  clangorousSoulblaze: "clangorous-soulblaze",
  splinteredStormshards: "splintered-stormshards",
  letsSnuggleForever: "lets-snuggle-forever",
  menacingMoonrazeMaelstrom: "menacing-moonraze-maelstrom",
  searingSunrazeSmash: "searing-sunraze-smash",
  lightThatBurnsTheSky: "light-that-burns-the-sky",
  extremeEvoboost: "extreme-evoboost",
} as const;

/**
 * Map of species-specific Z-Crystal item IDs to the signature Z-Move they unlock.
 * These Z-Crystals require a specific Pokemon holding a specific move.
 *
 * Source: Showdown data/items.ts -- species Z-Crystal entries (e.g., pikaniumz.zMove)
 * Source: Bulbapedia "Z-Crystal" -- species-specific Z-Crystals section
 */
const SPECIES_Z_CRYSTALS: Readonly<Record<string, string>> = {
  [GEN7_ITEM_IDS.pikaniumZ]: GEN7_Z_MOVE_IDS.catastrophika,
  [GEN7_ITEM_IDS.pikashuniumZ]: GEN7_Z_MOVE_IDS.tenMillionVoltThunderbolt,
  [GEN7_ITEM_IDS.aloraichiumZ]: GEN7_Z_MOVE_IDS.stokedSparksurfer,
  [GEN7_ITEM_IDS.snorliumZ]: GEN7_Z_MOVE_IDS.pulverizingPancake,
  [GEN7_ITEM_IDS.mewniumZ]: GEN7_Z_MOVE_IDS.genesisSupernova,
  [GEN7_ITEM_IDS.decidiumZ]: GEN7_Z_MOVE_IDS.sinisterArrowRaid,
  [GEN7_ITEM_IDS.inciniumZ]: GEN7_Z_MOVE_IDS.maliciousMoonsault,
  [GEN7_ITEM_IDS.primariumZ]: GEN7_Z_MOVE_IDS.oceanicOperetta,
  [GEN7_ITEM_IDS.tapuniumZ]: GEN7_Z_MOVE_IDS.guardianOfAlola,
  [GEN7_ITEM_IDS.marshadiumZ]: GEN7_Z_MOVE_IDS.soulStealingSevenStarStrike,
  [GEN7_ITEM_IDS.kommoniumZ]: GEN7_Z_MOVE_IDS.clangorousSoulblaze,
  [GEN7_ITEM_IDS.lycaniumZ]: GEN7_Z_MOVE_IDS.splinteredStormshards,
  [GEN7_ITEM_IDS.mimikiumZ]: GEN7_Z_MOVE_IDS.letsSnuggleForever,
  [GEN7_ITEM_IDS.lunaliumZ]: GEN7_Z_MOVE_IDS.menacingMoonrazeMaelstrom,
  [GEN7_ITEM_IDS.solganiumZ]: GEN7_Z_MOVE_IDS.searingSunrazeSmash,
  [GEN7_ITEM_IDS.ultranecroziumZ]: GEN7_Z_MOVE_IDS.lightThatBurnsTheSky,
  [GEN7_ITEM_IDS.eeviumZ]: GEN7_Z_MOVE_IDS.extremeEvoboost,
};

/**
 * Check if an item is a Z-Crystal (type-specific OR species-specific).
 *
 * Source: Showdown data/items.ts -- all Z-Crystal items have zMove property
 */
export function isZCrystal(itemId: string): boolean {
  return itemId in TYPED_Z_CRYSTALS || itemId in SPECIES_Z_CRYSTALS;
}

/**
 * Get the type associated with a type-specific Z-Crystal.
 * Returns null for non-Z-Crystal items or species-specific Z-Crystals.
 *
 * Source: Showdown data/items.ts -- typed Z-Crystals have zMoveType
 */
export function getZCrystalType(itemId: string): PokemonType | null {
  return TYPED_Z_CRYSTALS[itemId] ?? null;
}

/**
 * Check if a Z-Crystal is species-specific (requires a specific Pokemon).
 *
 * Source: Showdown data/items.ts -- species Z-Crystals have zMoveFrom
 */
export function isSpeciesZCrystal(itemId: string): boolean {
  return itemId in SPECIES_Z_CRYSTALS;
}

/**
 * Get the map of type-specific Z-Crystal IDs to their types.
 *
 * Source: Showdown data/items.ts -- typed Z-Crystal entries
 */
export function getTypedZMoves(): Readonly<Record<string, PokemonType>> {
  return TYPED_Z_CRYSTALS;
}

/**
 * Get the map of species-specific Z-Crystal IDs to their signature Z-Moves.
 *
 * Source: Showdown data/items.ts -- species Z-Crystal entries
 */
export function getSpeciesZMoves(): Readonly<Record<string, string>> {
  return SPECIES_Z_CRYSTALS;
}

// ═══════════════════════════════════════════════════════════════════════════
// Terrain Extender
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The item ID for Terrain Extender, which extends terrain duration from 5 to 8 turns.
 *
 * Source: Showdown data/items.ts -- terrainextender: onSetStatus changes terrain duration
 * Source: Bulbapedia "Terrain Extender" -- extends terrain set by holder from 5 to 8 turns
 */
export const TERRAIN_EXTENDER_ITEM_ID = GEN7_ITEM_IDS.terrainExtender;

/**
 * Check if a Pokemon is holding a Terrain Extender.
 *
 * Source: Showdown data/items.ts -- terrainextender
 */
export function hasTerrainExtender(pokemon: ActivePokemon): boolean {
  return pokemon.pokemon.heldItem === TERRAIN_EXTENDER_ITEM_ID;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mega Stone check (carried from Gen 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a held item is a Mega Stone.
 * Same logic as Gen 6 -- mega stones end in "-ite" suffix or are primal orbs.
 *
 * Source: Showdown data/items.ts -- mega stones have onTakeItem: false
 * Source: Bulbapedia "Mega Stone" -- cannot be removed by Knock Off, Trick, Switcheroo
 */
export function isMegaStone(itemId: string): boolean {
  if (!itemId) return false;
  if (itemId === CORE_ITEM_IDS.blueOrb || itemId === CORE_ITEM_IDS.redOrb) return true;
  if (itemId === CORE_ITEM_IDS.eviolite) return false;
  if (itemId.endsWith("ite") || itemId.endsWith("ite-x") || itemId.endsWith("ite-y")) {
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Sheer Force + Life Orb suppression (carried from Gen 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Moves with secondary effects stored as custom onHit functions in Showdown.
 *
 * Source: Showdown data/moves.ts -- moves with secondaries as onHit
 */
const SHEER_FORCE_WHITELIST: ReadonlySet<string> = new Set([
  CORE_MOVE_IDS.triAttack,
  GEN7_MOVE_IDS.secretPower,
  GEN7_MOVE_IDS.relicSong,
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
  if (abilityId !== GEN7_ABILITY_IDS.sheerForce) return false;
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_WHITELIST.has(moveId);
}

// ═══════════════════════════════════════════════════════════════════════════
// Gluttony helper (carried from Gen 6)
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
  if (pokemon.ability === GEN7_ABILITY_IDS.gluttony && normalFraction <= 0.25) {
    return 0.5;
  }
  return normalFraction;
}

// ═══════════════════════════════════════════════════════════════════════════
// Safety Goggles (carried from Gen 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a move is blocked by Safety Goggles (powder moves).
 *
 * Source: Showdown data/items.ts -- safetygoggles: isPowderImmune
 * Source: Bulbapedia "Safety Goggles" -- blocks powder moves
 */
export function isGen7PowderBlocked(itemId: string, moveFlags: { powder?: boolean }): boolean {
  return itemId === GEN7_ITEM_IDS.safetyGoggles && moveFlags.powder === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find the opponent's max HP from the battle state.
 * Used by Rocky Helmet, Jaboca/Rowap Berry to deal retaliation damage
 * based on the attacker's HP.
 */
function getOpponentMaxHp(context: ItemContext): number {
  const pokemon = context.pokemon;
  const sides = context.state?.sides;
  if (!sides) {
    return pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  }
  const holderSide = sides.findIndex((s) =>
    s.active.some((a: { pokemon: unknown } | null) => a && a.pokemon === pokemon.pokemon),
  );
  if (holderSide === -1) {
    return pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  }
  const opponentSide = holderSide === 0 ? 1 : 0;
  const opponent = sides[opponentSide]?.active?.[0];
  if (!opponent) {
    return pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  }
  return opponent.pokemon.calculatedStats?.hp ?? opponent.pokemon.currentHp;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main item handler
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply a Gen 7 held item effect at the given trigger point.
 *
 * Gen 7 item changes from Gen 6:
 *   - Z-Crystals: cannot be removed by Knock Off, Trick, Switcheroo (like Mega Stones)
 *   - Soul Dew: now boosts Psychic/Dragon type moves by 1.2x for Latios/Latias
 *     (was SpA/SpDef 1.5x in Gen 6). Handled in damage calc, not here.
 *   - Terrain Extender: extends terrain duration from 5 to 8 turns (handled in terrain module)
 *   - Gems: only Normal Gem exists in Gen 6+; no type gems (removed in Gen 6)
 *
 * All Gen 6 items are carried forward with unchanged mechanics.
 *
 * Source: Showdown data/items.ts -- Gen 7 item handlers
 * Source: Bulbapedia -- individual item pages
 *
 * @param trigger - When the item check occurs
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen7HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  // Klutz: holder cannot use its held item -- suppress all item triggers
  // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts -- Klutz gates all item battle effects
  if (context.pokemon.ability === CORE_ABILITY_IDS.klutz) {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5/6/7 -- Embargo blocks item effects
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
    case "stat-boost-between-turns":
      // Stat-pinch berries activate at end of turn when HP drops to <= 25%
      // from residual damage (weather, status, etc.)
      // Source: Showdown data/items.ts -- pinch berries: onEat (check in onResidual)
      // Source: Bulbapedia -- stat-pinch berries activate at end of turn if HP <= 25%
      result = handleStatBoostBetweenTurns(item, context);
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
    context.pokemon.ability === CORE_ABILITY_IDS.unburden &&
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
  if (item !== GEN7_ITEM_IDS.metronome) return NO_ACTIVATION;

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
    case GEN7_ITEM_IDS.leftovers: {
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
    case GEN7_ITEM_IDS.blackSludge: {
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
    case GEN7_ITEM_IDS.toxicOrb: {
      if (status) return NO_ACTIVATION;
      // Poison and Steel types are immune to poisoning
      // Source: Showdown -- type immunity prevents Orb activation
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
            status: CORE_STATUS_IDS.badlyPoisoned,
          },
        ],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    case GEN7_ITEM_IDS.flameOrb: {
      if (status) return NO_ACTIVATION;
      // Fire types are immune to burns
      // Source: Showdown -- type immunity prevents Orb activation
      if (pokemon.types.includes(CORE_TYPE_IDS.fire)) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.inflictStatus,
            target: BATTLE_EFFECT_TARGETS.self,
            status: CORE_STATUS_IDS.burn,
          },
        ],
        messages: [`${pokemonName} was burned by its Flame Orb!`],
      };
    }

    // Sitrus Berry: Heal 1/4 max HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Sitrus Berry onEat / onUpdate
    case GEN7_ITEM_IDS.sitrusBerry: {
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
              value: GEN7_ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Oran Berry
    case GEN7_ITEM_IDS.oranBerry: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 10 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Lum Berry: Cures any primary status OR confusion (consumed)
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    case GEN7_ITEM_IDS.lumBerry: {
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
        value: GEN7_ITEM_IDS.lumBerry,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Lum Berry cured its status!`],
      };
    }

    // Cheri Berry: Cures paralysis (consumed)
    // Source: Showdown data/items.ts -- Cheri Berry
    case GEN7_ITEM_IDS.cheriBerry: {
      if (status === CORE_STATUS_IDS.paralysis) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.cheriBerry,
            },
          ],
          messages: [`${pokemonName}'s Cheri Berry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Chesto Berry: Cures sleep (consumed)
    // Source: Showdown data/items.ts -- Chesto Berry
    case GEN7_ITEM_IDS.chestoBerry: {
      if (status === CORE_STATUS_IDS.sleep) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.chestoBerry,
            },
          ],
          messages: [`${pokemonName}'s Chesto Berry woke it up!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Pecha Berry: Cures poison and badly-poisoned (consumed)
    // Source: Showdown data/items.ts -- Pecha Berry
    case GEN7_ITEM_IDS.pechaBerry: {
      if (status === CORE_STATUS_IDS.poison || status === CORE_STATUS_IDS.badlyPoisoned) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.pechaBerry,
            },
          ],
          messages: [`${pokemonName}'s Pecha Berry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rawst Berry: Cures burn (consumed)
    // Source: Showdown data/items.ts -- Rawst Berry
    case GEN7_ITEM_IDS.rawstBerry: {
      if (status === CORE_STATUS_IDS.burn) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.rawstBerry,
            },
          ],
          messages: [`${pokemonName}'s Rawst Berry cured its burn!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Aspear Berry: Cures freeze (consumed)
    // Source: Showdown data/items.ts -- Aspear Berry
    case GEN7_ITEM_IDS.aspearBerry: {
      if (status === CORE_STATUS_IDS.freeze) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.aspearBerry,
            },
          ],
          messages: [`${pokemonName}'s Aspear Berry thawed it out!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Persim Berry: Cures confusion volatile status (consumed)
    // Source: Showdown data/items.ts -- Persim Berry
    case GEN7_ITEM_IDS.persimBerry: {
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
              value: GEN7_ITEM_IDS.persimBerry,
            },
          ],
          messages: [`${pokemonName}'s Persim Berry snapped it out of confusion!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Mental Herb: Cures infatuation AND (Gen 5+) Taunt, Encore, Disable, Torment, Heal Block
    // Source: Showdown data/items.ts -- Mental Herb onUpdate
    case GEN7_ITEM_IDS.mentalHerb: {
      const mentalVolatiles: VolatileStatus[] = [
        CORE_VOLATILE_IDS.infatuation,
        CORE_VOLATILE_IDS.taunt,
        CORE_VOLATILE_IDS.encore,
        CORE_VOLATILE_IDS.disable,
        CORE_VOLATILE_IDS.torment,
        CORE_VOLATILE_IDS.healBlock,
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
        value: GEN7_ITEM_IDS.mentalHerb,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Mental Herb cured its affliction!`],
      };
    }

    // Sticky Barb: 1/8 max HP damage to holder each turn (NOT consumed)
    // Source: Showdown data/items.ts -- Sticky Barb onResidual
    case GEN7_ITEM_IDS.stickyBarb: {
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
    case GEN7_ITEM_IDS.berryJuice: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 20 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.berryJuice,
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
 * All Gen 6 on-damage-taken items are carried forward.
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
    // Focus Sash is handled by Gen7Ruleset.capLethalDamage (pre-damage hook).
    // It is NOT handled here (post-damage) because currentHp is already post-damage,
    // so currentHp === maxHp is always false when damage > 0.
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority (pre-damage)

    // Sitrus Berry: activates when HP drops to <= 50% after damage.
    // Source: Showdown data/items.ts -- Sitrus Berry onUpdate post-damage check
    case GEN7_ITEM_IDS.sitrusBerry: {
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
              value: GEN7_ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: activates when HP drops to <= 50% after damage.
    // Source: Showdown data/items.ts -- Oran Berry post-damage check
    case GEN7_ITEM_IDS.oranBerry: {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 10 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // --- Stat pinch berries ---
    case GEN7_ITEM_IDS.liechiBerry: {
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
              value: GEN7_ITEM_IDS.liechiBerry,
            },
          ],
          messages: [`${pokemonName}'s Liechi Berry raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN7_ITEM_IDS.ganlonBerry: {
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
              value: GEN7_ITEM_IDS.ganlonBerry,
            },
          ],
          messages: [`${pokemonName}'s Ganlon Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN7_ITEM_IDS.salacBerry: {
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
              value: GEN7_ITEM_IDS.salacBerry,
            },
          ],
          messages: [`${pokemonName}'s Salac Berry raised its Speed!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN7_ITEM_IDS.petayaBerry: {
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
              value: GEN7_ITEM_IDS.petayaBerry,
            },
          ],
          messages: [`${pokemonName}'s Petaya Berry raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN7_ITEM_IDS.apicotBerry: {
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
              value: GEN7_ITEM_IDS.apicotBerry,
            },
          ],
          messages: [`${pokemonName}'s Apicot Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit
    case GEN7_ITEM_IDS.jabocaBerry: {
      const moveCategory = context.move?.category;
      if (moveCategory === CORE_MOVE_CATEGORIES.physical && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
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
              value: GEN7_ITEM_IDS.jabocaBerry,
            },
          ],
          messages: [`${pokemonName}'s Jaboca Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Rowap Berry onDamagingHit
    case GEN7_ITEM_IDS.rowapBerry: {
      const moveCategory = context.move?.category;
      if (moveCategory === CORE_MOVE_CATEGORIES.special && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
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
              value: GEN7_ITEM_IDS.rowapBerry,
            },
          ],
          messages: [`${pokemonName}'s Rowap Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Sticky Barb: transfer to attacker on contact move if attacker has no held item.
    // Source: Showdown data/items.ts -- Sticky Barb onHit: item transfer on contact
    case GEN7_ITEM_IDS.stickyBarb: {
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
      opponent.pokemon.heldItem = GEN7_ITEM_IDS.stickyBarb;
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: GEN7_ITEM_IDS.stickyBarb,
          },
        ],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
      };
    }

    // Air Balloon: pops when hit by any damaging move (consumed)
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    case GEN7_ITEM_IDS.airBalloon: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN7_ITEM_IDS.airBalloon,
            },
          ],
          messages: [`${pokemonName}'s Air Balloon popped!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Red Card: forces the attacker to switch out after being hit (consumed)
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary
    case GEN7_ITEM_IDS.redCard: {
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
              value: GEN7_ITEM_IDS.redCard,
            },
          ],
          messages: [`${pokemonName} held up its Red Card against the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Eject Button: holder switches out after being hit (consumed)
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary
    case GEN7_ITEM_IDS.ejectButton: {
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
              value: GEN7_ITEM_IDS.ejectButton,
            },
          ],
          messages: [`${pokemonName}'s Eject Button activated!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Absorb Bulb: +1 SpA when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit
    case GEN7_ITEM_IDS.absorbBulb: {
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
              value: GEN7_ITEM_IDS.absorbBulb,
            },
          ],
          messages: [`${pokemonName}'s Absorb Bulb raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Cell Battery: +1 Atk when hit by an Electric-type move (consumed)
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit
    case GEN7_ITEM_IDS.cellBattery: {
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
              value: GEN7_ITEM_IDS.cellBattery,
            },
          ],
          messages: [`${pokemonName}'s Cell Battery raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Weakness Policy: +2 Atk and +2 SpAtk when hit by a super-effective move (consumed)
    // Source: Showdown data/items.ts -- weaknesspolicy: onDamagingHit
    // Source: Bulbapedia "Weakness Policy" -- +2 Atk/SpAtk on super-effective hit
    case GEN7_ITEM_IDS.weaknessPolicy: {
      if (damage > 0 && context.move) {
        const effectiveness = getTypeEffectiveness(
          context.move.type,
          pokemon.types,
          GEN7_TYPE_CHART,
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
                value: GEN7_ITEM_IDS.weaknessPolicy,
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
    case GEN7_ITEM_IDS.keeBerry: {
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
              value: GEN7_ITEM_IDS.keeBerry,
            },
          ],
          messages: [`${pokemonName}'s Kee Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Maranga Berry: +1 SpDef when hit by a special move (consumed)
    // Source: Showdown data/items.ts -- marangaberry: onDamagingHit special
    case GEN7_ITEM_IDS.marangaBerry: {
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
              value: GEN7_ITEM_IDS.marangaBerry,
            },
          ],
          messages: [`${pokemonName}'s Maranga Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Luminous Moss: +1 SpDef when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- luminousmoss: onDamagingHit Water
    case GEN7_ITEM_IDS.luminousMoss: {
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
              value: GEN7_ITEM_IDS.luminousMoss,
            },
          ],
          messages: [`${pokemonName}'s Luminous Moss raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Snowball: +1 Atk when hit by an Ice-type move (consumed)
    // Source: Showdown data/items.ts -- snowball: onDamagingHit Ice
    case GEN7_ITEM_IDS.snowball: {
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
              value: GEN7_ITEM_IDS.snowball,
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
    case GEN7_ITEM_IDS.rockyHelmet: {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      const attackerMaxHp = getOpponentMaxHp(context);
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

// ---------------------------------------------------------------------------
// stat-boost-between-turns
// ---------------------------------------------------------------------------

/**
 * Handle stat-boost berry triggers between turns.
 *
 * Stat-pinch berries (Liechi, Ganlon, Salac, Petaya, Apicot) activate when HP
 * drops to <= 25% (or <= 50% for Gluttony) from residual damage between turns
 * (weather chip, poison tick, burn tick, etc.).
 *
 * Source: Showdown data/items.ts -- liechi/ganlon/salac/petaya/apicot: onEat triggers
 * Source: Bulbapedia -- stat-boosting berries: "Raises [stat] by one stage when
 *   the holder's HP drops to 1/4 or below."
 */
function handleStatBoostBetweenTurns(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  // Only alive Pokemon can consume berries
  if (currentHp <= 0) return NO_ACTIVATION;

  // Map of stat-pinch berries to their stat boost
  // Source: Showdown data/items.ts -- liechi-berry raises attack, ganlon-berry raises defense, etc.
  const STAT_PINCH_BERRIES: Record<string, { stat: string; displayStat: string }> = {
    [GEN7_ITEM_IDS.liechiBerry]: { stat: CORE_STAT_IDS.attack, displayStat: "Attack" },
    [GEN7_ITEM_IDS.ganlonBerry]: { stat: CORE_STAT_IDS.defense, displayStat: "Defense" },
    [GEN7_ITEM_IDS.salacBerry]: { stat: CORE_STAT_IDS.speed, displayStat: "Speed" },
    [GEN7_ITEM_IDS.petayaBerry]: { stat: CORE_STAT_IDS.spAttack, displayStat: "Sp. Atk" },
    [GEN7_ITEM_IDS.apicotBerry]: { stat: CORE_STAT_IDS.spDefense, displayStat: "Sp. Def" },
  };

  const berryData = STAT_PINCH_BERRIES[item];
  if (!berryData) return NO_ACTIVATION;

  const threshold = getPinchBerryThreshold(pokemon, 0.25);
  if (currentHp <= Math.floor(maxHp * threshold)) {
    return {
      activated: true,
      effects: [
        {
          type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
          target: BATTLE_EFFECT_TARGETS.self,
          value: berryData.stat,
        },
        { type: BATTLE_ITEM_EFFECT_TYPES.consume, target: BATTLE_EFFECT_TARGETS.self, value: item },
      ],
      messages: [
        `${pokemonName}'s ${item.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} raised its ${berryData.displayStat}!`,
      ],
    };
  }
  return NO_ACTIVATION;
}

function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // Source: Showdown data/items.ts -- King's Rock onModifyMovePriority
    case GEN7_ITEM_IDS.kingsRock: {
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

    // Razor Fang: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // Source: Showdown data/items.ts -- Razor Fang onModifyMovePriority
    case GEN7_ITEM_IDS.razorFang: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [
              { type: BATTLE_ITEM_EFFECT_TYPES.flinch, target: BATTLE_EFFECT_TARGETS.opponent },
            ],
            messages: [`${pokemonName}'s Razor Fang caused flinching!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Shell Bell: Heal 1/8 of damage dealt (NOT consumed -- permanent item)
    // Source: Showdown data/items.ts -- Shell Bell onAfterMoveSecondarySelf
    case GEN7_ITEM_IDS.shellBell: {
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
    // 1.3x damage boost is handled in Gen7DamageCalc.ts
    // Sheer Force suppresses Life Orb recoil when the ability activates
    // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    case GEN7_ITEM_IDS.lifeOrb: {
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
// on-stat-change
// ---------------------------------------------------------------------------

function handleOnStatChange(item: string, context: ItemContext): ItemResult {
  const statChange = context.statChange;
  if (!statChange) return NO_ACTIVATION;

  const pokemon = context.pokemon;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Adrenaline Orb: +1 Speed after an Intimidate-style Attack drop from the foe.
    // Source: Showdown data/items.ts -- adrenalineorb.onAfterBoost
    case GEN7_ITEM_IDS.adrenalineOrb: {
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
          (pokemon.ability === GEN7_ABILITY_IDS.contrary && currentAttackStage >= 6));
      const currentSpeedStage = pokemon.statStages[CORE_STAT_IDS.speed] ?? 0;
      if (
        statChange.phase !== "after" ||
        statChange.source !== BATTLE_EFFECT_TARGETS.opponent ||
        statChange.causeId !== GEN7_ABILITY_IDS.intimidate ||
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
            value: GEN7_ITEM_IDS.adrenalineOrb,
          },
        ],
        messages: [`${pokemonName}'s Adrenaline Orb raised its Speed!`],
      };
    }

    default:
      return NO_ACTIVATION;
  }
}
