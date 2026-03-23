import type { ActivePokemon, ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import type { MoveEffect, PokemonType, VolatileStatus } from "@pokemon-lib-ts/core";
import { getTypeEffectiveness } from "@pokemon-lib-ts/core";
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
  "normalium-z": "normal",
  "fightinium-z": "fighting",
  "flyinium-z": "flying",
  "poisonium-z": "poison",
  "groundium-z": "ground",
  "rockium-z": "rock",
  "buginium-z": "bug",
  "ghostium-z": "ghost",
  "steelium-z": "steel",
  "firium-z": "fire",
  "waterium-z": "water",
  "grassium-z": "grass",
  "electrium-z": "electric",
  "psychium-z": "psychic",
  "icium-z": "ice",
  "dragonium-z": "dragon",
  "darkinium-z": "dark",
  "fairium-z": "fairy",
};

/**
 * Map of species-specific Z-Crystal item IDs to the signature Z-Move they unlock.
 * These Z-Crystals require a specific Pokemon holding a specific move.
 *
 * Source: Showdown data/items.ts -- species Z-Crystal entries (e.g., pikaniumz.zMove)
 * Source: Bulbapedia "Z-Crystal" -- species-specific Z-Crystals section
 */
const SPECIES_Z_CRYSTALS: Readonly<Record<string, string>> = {
  "pikanium-z": "catastropika",
  "pikashunium-z": "10000000-volt-thunderbolt",
  "aloraichium-z": "stoked-sparksurfer",
  "snorlium-z": "pulverizing-pancake",
  "mewnium-z": "genesis-supernova",
  "decidium-z": "sinister-arrow-raid",
  "incinium-z": "malicious-moonsault",
  "primarium-z": "oceanic-operetta",
  "tapunium-z": "guardian-of-alola",
  "marshadium-z": "soul-stealing-7-star-strike",
  "kommonium-z": "clangorous-soulblaze",
  "lycanium-z": "splintered-stormshards",
  "mimikium-z": "lets-snuggle-forever",
  "lunalium-z": "menacing-moonraze-maelstrom",
  "solganium-z": "searing-sunraze-smash",
  "ultranecrozium-z": "light-that-burns-the-sky",
  "eevium-z": "extreme-evoboost",
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
  if (itemId === "blue-orb" || itemId === "red-orb") return true;
  if (itemId === "eviolite") return false;
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
  if (pokemon.ability === "gluttony" && normalFraction <= 0.25) {
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
  return itemId === "safety-goggles" && moveFlags.powder === true;
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
  if (context.pokemon.ability === "klutz") {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5/6/7 -- Embargo blocks item effects
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
    context.pokemon.ability === "unburden" &&
    result.effects.some((e) => e.type === "consume") &&
    !context.pokemon.volatileStatuses.has("unburden")
  ) {
    context.pokemon.volatileStatuses.set("unburden", { turnsLeft: -1 });
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

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit
    case "jaboca-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "physical" && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
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

    // Sticky Barb: transfer to attacker on contact move if attacker has no held item.
    // Source: Showdown data/items.ts -- Sticky Barb onHit: item transfer on contact
    case "sticky-barb": {
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
      opponent.pokemon.heldItem = "sticky-barb";
      return {
        activated: true,
        effects: [{ type: "consume", target: "self", value: "sticky-barb" }],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
      };
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
      if (damage > 0) {
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
      if (damage > 0) {
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
      if (damage > 0 && context.move?.type === "water") {
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
      if (damage > 0 && context.move?.type === "electric") {
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
      if (damage > 0 && context.move) {
        const effectiveness = getTypeEffectiveness(
          context.move.type,
          pokemon.types,
          GEN7_TYPE_CHART,
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
      if (damage > 0 && context.move?.category === "physical") {
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
      if (damage > 0 && context.move?.category === "special") {
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
      if (damage > 0 && context.move?.type === "water") {
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
      if (damage > 0 && context.move?.type === "ice") {
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
    "liechi-berry": { stat: "attack", displayStat: "Attack" },
    "ganlon-berry": { stat: "defense", displayStat: "Defense" },
    "salac-berry": { stat: "speed", displayStat: "Speed" },
    "petaya-berry": { stat: "spAttack", displayStat: "Sp. Atk" },
    "apicot-berry": { stat: "spDefense", displayStat: "Sp. Def" },
  };

  const berryData = STAT_PINCH_BERRIES[item];
  if (!berryData) return NO_ACTIVATION;

  const threshold = getPinchBerryThreshold(pokemon, 0.25);
  if (currentHp <= Math.floor(maxHp * threshold)) {
    return {
      activated: true,
      effects: [
        { type: "stat-boost", target: "self", value: berryData.stat },
        { type: "consume", target: "self", value: item },
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
    // 1.3x damage boost is handled in Gen7DamageCalc.ts
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

    default:
      return NO_ACTIVATION;
  }
}
