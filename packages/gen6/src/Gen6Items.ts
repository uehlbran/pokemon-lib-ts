import type { ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import {
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
  BATTLE_ITEM_EFFECT_VALUES,
} from "@pokemon-lib-ts/battle";
import type { MoveEffect, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TARGETS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  getTypeEffectiveness,
} from "@pokemon-lib-ts/core";
import { GEN6_ABILITY_IDS, GEN6_ITEM_IDS, GEN6_MOVE_IDS } from "./data/reference-ids.js";
import { GEN6_TYPE_CHART } from "./Gen6TypeChart.js";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

const ITEM_EFFECT_VALUE = BATTLE_ITEM_EFFECT_VALUES;

/**
 * Map of gem item IDs to the type they boost.
 * In Gen 6, only Normal Gem remains in the item data; the other Gems were removed.
 *
 * NOTE: Gem boost (1.3x base power) is handled in Gen6DamageCalc.ts, not here.
 * The damage calc consumes the gem (sets heldItem to null). This map is
 * exported for test convenience only.
 *
 * Source: packages/gen6/data/items.json -- only `normal-gem` is present in Gen 6 data
 * Source: Bulbapedia "Gem" -- most Gems are unavailable from Gen VI onward
 */
export const GEM_TYPES: Record<string, string> = {
  [CORE_ITEM_IDS.normalGem]: CORE_TYPE_IDS.normal,
};

/**
 * Get the HP threshold fraction for pinch berry activation.
 * Gluttony changes the activation threshold from 25% to 50%.
 * Normal berries (Sitrus, Oran) already use 50% and are unaffected.
 *
 * Source: Bulbapedia -- Gluttony: "Makes the Pokemon eat a held Berry when its HP
 *   drops to 50% or less instead of the usual 25%."
 * Source: Showdown data/abilities.ts -- Gluttony modifies pinch berry threshold
 *
 * @param pokemon - The Pokemon holding the berry
 * @param normalFraction - The normal activation fraction (0.25 for pinch berries)
 * @returns The effective threshold fraction
 */
export function getPinchBerryThreshold(
  pokemon: { ability: string },
  normalFraction: number,
): number {
  if (pokemon.ability === GEN6_ABILITY_IDS.gluttony && normalFraction <= 0.25) {
    return 0.5;
  }
  return normalFraction;
}

/**
 * Check if a held item is a Mega Stone.
 *
 * In Gen 6, Mega Stones cannot be removed by Knock Off, Trick, or Switcheroo.
 * They are identified by the "-ite" suffix (e.g., "venusaurite", "charizardite-x"),
 * plus primal reversion orbs ("blue-orb", "red-orb").
 *
 * Source: Showdown data/items.ts -- mega stones have onTakeItem: false
 * Source: Bulbapedia "Mega Stone" -- cannot be removed by Knock Off, Trick, Switcheroo
 */
export function isMegaStone(itemId: string): boolean {
  if (!itemId) return false;
  // Primal reversion orbs
  if (itemId === CORE_ITEM_IDS.blueOrb || itemId === CORE_ITEM_IDS.redOrb) return true;
  // Eviolite ends in "ite" but is NOT a mega stone — exclude it explicitly
  // Source: Bulbapedia "Eviolite" -- boosts defenses of unevolved Pokemon, not a Mega Stone
  if (itemId === GEN6_ITEM_IDS.eviolite) return false;
  // All mega stones end in "ite" (e.g., "venusaurite", "charizardite-x", "charizardite-y")
  // Source: Showdown data/items.ts -- naming convention for mega stones
  if (itemId.endsWith("ite") || itemId.endsWith("ite-x") || itemId.endsWith("ite-y")) {
    return true;
  }
  return false;
}

/**
 * Check if a move is blocked by Safety Goggles (powder moves).
 *
 * Source: Showdown data/items.ts -- safetygoggles: isPowderImmune
 * Source: Bulbapedia "Safety Goggles" -- blocks powder moves (Spore, Sleep Powder, etc.)
 */
export function isGen6PowderBlocked(itemId: string, moveFlags: { powder?: boolean }): boolean {
  return itemId === GEN6_ITEM_IDS.safetyGoggles && moveFlags.powder === true;
}

// ---------------------------------------------------------------------------
// Sheer Force + Life Orb suppression
// ---------------------------------------------------------------------------

/**
 * Moves with secondary effects stored as custom onHit functions in Showdown.
 * These can't be detected from MoveEffect alone, so we use a whitelist.
 *
 * Source: Showdown data/moves.ts -- moves with secondaries as onHit
 */
const SHEER_FORCE_WHITELIST: ReadonlySet<string> = new Set([
  CORE_MOVE_IDS.triAttack,
  GEN6_MOVE_IDS.secretPower,
  GEN6_MOVE_IDS.relicSong,
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
 * When Sheer Force activates, Life Orb's 10% recoil is suppressed.
 *
 * Source: Showdown scripts.ts -- if move.hasSheerForce && source.hasAbility('sheerforce'),
 *   skip Life Orb recoil
 */
function sheerForceSuppressesLifeOrb(
  abilityId: string,
  effect: MoveEffect | null,
  moveId: string,
): boolean {
  if (abilityId !== GEN6_ABILITY_IDS.sheerForce) return false;
  return hasSheerForceEligibleEffect(effect) || SHEER_FORCE_WHITELIST.has(moveId);
}

// Type resist berries are now handled in Gen6DamageCalc.ts as a pre-damage modifier,
// matching Showdown's onSourceModifyDamage timing. The TYPE_RESIST_BERRIES map has been
// moved there. See issue #622 for context.

// ---------------------------------------------------------------------------
// Main item handler
// ---------------------------------------------------------------------------

/**
 * Apply a Gen 6 held item effect at the given trigger point.
 *
 * Gen 6 item additions and changes from Gen 5:
 *   - Assault Vest: +50% SpDef (stat modifier in damage calc); blocks status moves
 *   - Safety Goggles: blocks weather chip damage (sand/hail) AND powder moves
 *   - Weakness Policy: +2 Atk / +2 SpAtk when hit by super-effective move (consumed)
 *   - Roseli Berry: halves Fairy damage (new type resist berry)
 *   - Kee Berry: +1 Def on physical hit (consumed)
 *   - Maranga Berry: +1 SpDef on special hit (consumed)
 *   - Luminous Moss: +1 SpDef on Water hit (consumed)
 *   - Snowball: +1 Atk on Ice hit (consumed)
 *   - Pixie Plate: 1.2x Fairy (handled in damage calc)
 *   - Gems: 1.3x (nerfed from 1.5x in Gen 5; handled in damage calc)
 *   - Mega Stones: cannot be removed by Knock Off/Trick/Switcheroo
 *
 * All Gen 5 items are carried forward with unchanged mechanics.
 *
 * Source: Showdown data/items.ts -- individual item entries
 * Source: Bulbapedia -- individual item pages
 *
 * @param trigger - When the item check occurs
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen6HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  // Klutz: holder cannot use its held item -- suppress all item triggers
  // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts -- Klutz gates all item battle effects
  if (context.pokemon.ability === GEN6_ABILITY_IDS.klutz) {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5/6 -- Embargo blocks item effects
  if (context.pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)) {
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
    context.pokemon.ability === GEN6_ABILITY_IDS.unburden &&
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
 *
 * Handles the Metronome item's consecutive-use counter.
 *
 * Source: Showdown sim/items.ts -- Metronome item onModifyDamage
 * Source: Bulbapedia -- Metronome (item): "Boosts the power of moves used
 *   consecutively. +20% per consecutive use, up to 100% (2.0x)."
 */
function handleBeforeMove(item: string, context: ItemContext): ItemResult {
  if (item !== GEN6_ITEM_IDS.metronome) return NO_ACTIVATION;

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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the opponent's max HP from the battle state.
 * Used by Rocky Helmet, Jaboca/Rowap Berry to deal retaliation damage
 * based on the attacker's HP.
 *
 * @param context - The item context (pokemon is the berry holder / defender)
 * @returns The opponent's max HP, or the holder's max HP as fallback
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
    case GEN6_ITEM_IDS.leftovers: {
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
    case GEN6_ITEM_IDS.blackSludge: {
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
    case GEN6_ITEM_IDS.toxicOrb: {
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
    case GEN6_ITEM_IDS.flameOrb: {
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
    case GEN6_ITEM_IDS.sitrusBerry: {
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
              value: GEN6_ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Oran Berry
    case GEN6_ITEM_IDS.oranBerry: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 10 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Lum Berry: Cures any primary status OR confusion (consumed)
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    case GEN6_ITEM_IDS.lumBerry: {
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
        value: GEN6_ITEM_IDS.lumBerry,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Lum Berry cured its status!`],
      };
    }

    // Cheri Berry: Cures paralysis (consumed)
    // Source: Showdown data/items.ts -- Cheri Berry
    case GEN6_ITEM_IDS.cheriBerry: {
      if (status === CORE_STATUS_IDS.paralysis) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.cheriBerry,
            },
          ],
          messages: [`${pokemonName}'s Cheri Berry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Chesto Berry: Cures sleep (consumed)
    // Source: Showdown data/items.ts -- Chesto Berry
    case GEN6_ITEM_IDS.chestoBerry: {
      if (status === CORE_STATUS_IDS.sleep) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.chestoBerry,
            },
          ],
          messages: [`${pokemonName}'s Chesto Berry woke it up!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Pecha Berry: Cures poison and badly-poisoned (consumed)
    // Source: Showdown data/items.ts -- Pecha Berry
    case GEN6_ITEM_IDS.pechaBerry: {
      if (status === CORE_STATUS_IDS.poison || status === CORE_STATUS_IDS.badlyPoisoned) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.pechaBerry,
            },
          ],
          messages: [`${pokemonName}'s Pecha Berry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rawst Berry: Cures burn (consumed)
    // Source: Showdown data/items.ts -- Rawst Berry
    case GEN6_ITEM_IDS.rawstBerry: {
      if (status === CORE_STATUS_IDS.burn) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.rawstBerry,
            },
          ],
          messages: [`${pokemonName}'s Rawst Berry cured its burn!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Aspear Berry: Cures freeze (consumed)
    // Source: Showdown data/items.ts -- Aspear Berry
    case GEN6_ITEM_IDS.aspearBerry: {
      if (status === CORE_STATUS_IDS.freeze) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.statusCure, target: BATTLE_EFFECT_TARGETS.self },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.aspearBerry,
            },
          ],
          messages: [`${pokemonName}'s Aspear Berry thawed it out!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Persim Berry: Cures confusion volatile status (consumed)
    // Source: Showdown data/items.ts -- Persim Berry
    case GEN6_ITEM_IDS.persimBerry: {
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
              value: GEN6_ITEM_IDS.persimBerry,
            },
          ],
          messages: [`${pokemonName}'s Persim Berry snapped it out of confusion!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Mental Herb: Cures infatuation AND (Gen 5+) Taunt, Encore, Disable, Torment, Heal Block
    // Source: Showdown data/items.ts -- Mental Herb onUpdate
    case GEN6_ITEM_IDS.mentalHerb: {
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
        value: GEN6_ITEM_IDS.mentalHerb,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Mental Herb cured its affliction!`],
      };
    }

    // Sticky Barb: 1/8 max HP damage to holder each turn (NOT consumed)
    // Source: Showdown data/items.ts -- Sticky Barb onResidual
    case GEN6_ITEM_IDS.stickyBarb: {
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
    case GEN6_ITEM_IDS.berryJuice: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 20 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.berryJuice,
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
 * Gen 6 additions:
 *   - Weakness Policy: +2 Atk / +2 SpAtk when hit by super-effective move (consumed)
 *   - Kee Berry: +1 Def on physical hit (consumed)
 *   - Maranga Berry: +1 SpDef on special hit (consumed)
 *   - Luminous Moss: +1 SpDef on Water hit (consumed)
 *   - Snowball: +1 Atk on Ice hit (consumed)
 *
 * Note: Type resist berries (Occa, Passho, Roseli, etc.) are handled in Gen6DamageCalc.ts
 * as a pre-damage modifier, matching Showdown's onSourceModifyDamage timing.
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
    // Focus Sash is handled by Gen6Ruleset.capLethalDamage (pre-damage hook).
    // It is NOT handled here (post-damage) because currentHp is already post-damage,
    // so currentHp === maxHp is always false when damage > 0.
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority (pre-damage)

    // Sitrus Berry: activates when HP drops to <= 50% after damage.
    // Note: currentHp is already post-damage when on-damage-taken fires.
    // Source: Showdown data/items.ts -- Sitrus Berry onUpdate post-damage check
    case GEN6_ITEM_IDS.sitrusBerry: {
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
              value: GEN6_ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: activates when HP drops to <= 50% after damage.
    // Note: currentHp is already post-damage when on-damage-taken fires.
    // Source: Showdown data/items.ts -- Oran Berry post-damage check
    case GEN6_ITEM_IDS.oranBerry: {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: BATTLE_ITEM_EFFECT_TYPES.heal, target: BATTLE_EFFECT_TARGETS.self, value: 10 },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // --- Stat pinch berries ---
    // Note: currentHp is already post-damage when on-damage-taken fires.
    case GEN6_ITEM_IDS.liechiBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "attack",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.liechiBerry,
            },
          ],
          messages: [`${pokemonName}'s Liechi Berry raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN6_ITEM_IDS.ganlonBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "defense",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.ganlonBerry,
            },
          ],
          messages: [`${pokemonName}'s Ganlon Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN6_ITEM_IDS.salacBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "speed",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.salacBerry,
            },
          ],
          messages: [`${pokemonName}'s Salac Berry raised its Speed!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN6_ITEM_IDS.petayaBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "spAttack",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.petayaBerry,
            },
          ],
          messages: [`${pokemonName}'s Petaya Berry raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN6_ITEM_IDS.apicotBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "spDefense",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.apicotBerry,
            },
          ],
          messages: [`${pokemonName}'s Apicot Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit
    case GEN6_ITEM_IDS.jabocaBerry: {
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
              value: GEN6_ITEM_IDS.jabocaBerry,
            },
          ],
          messages: [`${pokemonName}'s Jaboca Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Rowap Berry onDamagingHit
    case GEN6_ITEM_IDS.rowapBerry: {
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
              value: GEN6_ITEM_IDS.rowapBerry,
            },
          ],
          messages: [`${pokemonName}'s Rowap Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Sticky Barb: transfer to attacker on contact move if attacker has no held item.
    // Source: Showdown data/items.ts -- Sticky Barb onHit: item transfer on contact
    case GEN6_ITEM_IDS.stickyBarb: {
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
      // Transfer sticky-barb to attacker via an item-transfer effect.
      // Using a consume effect so the engine's processItemResult handles:
      //   1. Setting holder's heldItem = null (triggers Unburden if applicable)
      //   2. Emitting item-consumed event
      // The opponent's item gain is handled as a side-effect via direct mutation here
      // since there is no standard "item-gain" ItemEffect type.
      // Source: Showdown data/items.ts -- stickybarb: onDamagingHit
      opponent.pokemon.heldItem = GEN6_ITEM_IDS.stickyBarb;
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: GEN6_ITEM_IDS.stickyBarb,
          },
        ],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
      };
    }

    // Air Balloon: pops when hit by any damaging move (consumed)
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    case GEN6_ITEM_IDS.airBalloon: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.airBalloon,
            },
          ],
          messages: [`${pokemonName}'s Air Balloon popped!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Red Card: forces the attacker to switch out after being hit (consumed)
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary
    case GEN6_ITEM_IDS.redCard: {
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
              value: GEN6_ITEM_IDS.redCard,
            },
          ],
          messages: [`${pokemonName} held up its Red Card against the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Eject Button: holder switches out after being hit (consumed)
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary
    case GEN6_ITEM_IDS.ejectButton: {
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
              value: GEN6_ITEM_IDS.ejectButton,
            },
          ],
          messages: [`${pokemonName}'s Eject Button activated!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Absorb Bulb: +1 SpA when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit
    case GEN6_ITEM_IDS.absorbBulb: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.water) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "spAttack",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.absorbBulb,
            },
          ],
          messages: [`${pokemonName}'s Absorb Bulb raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Cell Battery: +1 Atk when hit by an Electric-type move (consumed)
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit
    case GEN6_ITEM_IDS.cellBattery: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.electric) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "attack",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.cellBattery,
            },
          ],
          messages: [`${pokemonName}'s Cell Battery raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    // --- NEW Gen 6 items ---

    // Weakness Policy: +2 Atk and +2 SpAtk when hit by a super-effective move (consumed)
    // Source: Showdown data/items.ts -- weaknesspolicy: onDamagingHit:
    //   if (move.typeMod >= 2) boost atk+spa by 2, useItem
    // Source: Bulbapedia "Weakness Policy" -- +2 Atk/SpAtk on super-effective hit
    case GEN6_ITEM_IDS.weaknessPolicy: {
      if (damage > 0 && context.move) {
        const effectiveness = getTypeEffectiveness(
          context.move.type,
          pokemon.types,
          GEN6_TYPE_CHART,
        );
        if (effectiveness >= 2) {
          return {
            activated: true,
            effects: [
              {
                type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
                target: BATTLE_EFFECT_TARGETS.self,
                value: "attack",
                stages: 2,
              },
              {
                type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
                target: BATTLE_EFFECT_TARGETS.self,
                value: "spAttack",
                stages: 2,
              },
              {
                type: BATTLE_ITEM_EFFECT_TYPES.consume,
                target: BATTLE_EFFECT_TARGETS.self,
                value: GEN6_ITEM_IDS.weaknessPolicy,
              },
            ],
            messages: [`${pokemonName}'s Weakness Policy sharply raised its Attack and Sp. Atk!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Kee Berry: +1 Def when hit by a physical move (consumed)
    // Source: Showdown data/items.ts -- keeberry: onDamagingHit physical: boost defense +1
    // Source: Bulbapedia "Kee Berry" -- raises Defense by 1 stage on physical hit
    case GEN6_ITEM_IDS.keeBerry: {
      if (damage > 0 && context.move?.category === CORE_MOVE_CATEGORIES.physical) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "defense",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.keeBerry,
            },
          ],
          messages: [`${pokemonName}'s Kee Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Maranga Berry: +1 SpDef when hit by a special move (consumed)
    // Source: Showdown data/items.ts -- marangaberry: onDamagingHit special: boost spd +1
    // Source: Bulbapedia "Maranga Berry" -- raises Sp. Def by 1 stage on special hit
    case GEN6_ITEM_IDS.marangaBerry: {
      if (damage > 0 && context.move?.category === CORE_MOVE_CATEGORIES.special) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "spDefense",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.marangaBerry,
            },
          ],
          messages: [`${pokemonName}'s Maranga Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Luminous Moss: +1 SpDef when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- luminousmoss: onDamagingHit Water: boost spd +1
    // Source: Bulbapedia "Luminous Moss" -- +1 Sp. Def when hit by Water move
    case GEN6_ITEM_IDS.luminousMoss: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.water) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "spDefense",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.luminousMoss,
            },
          ],
          messages: [`${pokemonName}'s Luminous Moss raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Snowball: +1 Atk when hit by an Ice-type move (consumed)
    // Source: Showdown data/items.ts -- snowball: onDamagingHit Ice: boost atk +1
    // Source: Bulbapedia "Snowball" -- +1 Atk when hit by Ice move
    case GEN6_ITEM_IDS.snowball: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.ice) {
        return {
          activated: true,
          effects: [
            {
              type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
              target: BATTLE_EFFECT_TARGETS.self,
              value: "attack",
            },
            {
              type: BATTLE_ITEM_EFFECT_TYPES.consume,
              target: BATTLE_EFFECT_TARGETS.self,
              value: GEN6_ITEM_IDS.snowball,
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
    case GEN6_ITEM_IDS.rockyHelmet: {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      // Damage is 1/6 of the ATTACKER's max HP, not the holder's
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
 * King's Rock / Razor Fang: 10% flinch on ALL damaging moves (Gen 5+ behavior, no whitelist).
 *
 * Source: Showdown data/items.ts -- King's Rock / Razor Fang
 * Source: Bulbapedia -- Gen 5+: applies to all damaging moves
 */
function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // Source: Showdown data/items.ts -- King's Rock onModifyMovePriority
    case GEN6_ITEM_IDS.kingsRock: {
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
    case GEN6_ITEM_IDS.razorFang: {
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
    case GEN6_ITEM_IDS.shellBell: {
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
    // 1.3x damage boost is handled in Gen6DamageCalc.ts
    // Sheer Force suppresses Life Orb recoil when the ability activates
    // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    case GEN6_ITEM_IDS.lifeOrb: {
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
// Helper: format item name for display
// ---------------------------------------------------------------------------

/**
 * Format an item ID into a display-friendly name.
 * Converts "roseli-berry" to "Roseli Berry".
 */
function _formatItemName(itemId: string): string {
  return itemId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
