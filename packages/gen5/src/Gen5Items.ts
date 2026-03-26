import {
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
  BATTLE_ITEM_EFFECT_VALUES,
  type ItemContext,
  type ItemEffect,
  type ItemResult,
} from "@pokemon-lib-ts/battle";
import type { MoveEffect, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_MOVE_CATEGORIES,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { GEN5_ABILITY_IDS, GEN5_ITEM_IDS } from "./data/reference-ids.js";
import { sheerForceSuppressesLifeOrb } from "./Gen5AbilitiesDamage";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

const ITEM_EFFECT = BATTLE_ITEM_EFFECT_TYPES;
const EFFECT_TARGET = BATTLE_EFFECT_TARGETS;
const ITEM_EFFECT_VALUE = BATTLE_ITEM_EFFECT_VALUES;

/**
 * Map of gem item IDs to the type they boost.
 * Gen 5 has 17 gem types (no Fairy gem -- Fairy type was introduced in Gen 6).
 *
 * NOTE: Gem boost (1.5x base power) is handled in Gen5DamageCalc.ts, not here.
 * The damage calc consumes the gem (sets heldItem to null). This map is
 * exported for test convenience only.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem condition
 * Source: references/pokemon-showdown/data/items.ts -- individual gem entries
 */
export const GEM_TYPES: Record<string, string> = {
  [GEN5_ITEM_IDS.normalGem]: CORE_TYPE_IDS.normal,
  [GEN5_ITEM_IDS.fireGem]: CORE_TYPE_IDS.fire,
  [GEN5_ITEM_IDS.waterGem]: CORE_TYPE_IDS.water,
  [GEN5_ITEM_IDS.electricGem]: CORE_TYPE_IDS.electric,
  [GEN5_ITEM_IDS.grassGem]: CORE_TYPE_IDS.grass,
  [GEN5_ITEM_IDS.iceGem]: CORE_TYPE_IDS.ice,
  [GEN5_ITEM_IDS.fightingGem]: CORE_TYPE_IDS.fighting,
  [GEN5_ITEM_IDS.poisonGem]: CORE_TYPE_IDS.poison,
  [GEN5_ITEM_IDS.groundGem]: CORE_TYPE_IDS.ground,
  [GEN5_ITEM_IDS.flyingGem]: CORE_TYPE_IDS.flying,
  [GEN5_ITEM_IDS.psychicGem]: CORE_TYPE_IDS.psychic,
  [GEN5_ITEM_IDS.bugGem]: CORE_TYPE_IDS.bug,
  [GEN5_ITEM_IDS.rockGem]: CORE_TYPE_IDS.rock,
  [GEN5_ITEM_IDS.ghostGem]: CORE_TYPE_IDS.ghost,
  [GEN5_ITEM_IDS.dragonGem]: CORE_TYPE_IDS.dragon,
  [GEN5_ITEM_IDS.darkGem]: CORE_TYPE_IDS.dark,
  [GEN5_ITEM_IDS.steelGem]: CORE_TYPE_IDS.steel,
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
  if (pokemon.ability === GEN5_ABILITY_IDS.gluttony && normalFraction <= 0.25) {
    return 0.5;
  }
  return normalFraction;
}

/**
 * Apply a Gen 5 held item effect at the given trigger point.
 *
 * Gen 5 item additions and changes from Gen 4:
 *   - Type gems: 1.5x base power, consumed (handled in damage calc)
 *   - Eviolite: +50% Def/SpDef for NFE Pokemon (handled in damage calc)
 *   - Rocky Helmet: 1/6 max HP to attacker on contact
 *   - Air Balloon: Ground immunity, pops when hit by any damaging move
 *   - Red Card: forces opponent to switch after being hit
 *   - Eject Button: holder switches out after being hit
 *   - Ring Target: removes type immunities (handled in damage calc)
 *   - Absorb Bulb: +1 SpA when hit by Water move, consumed
 *   - Cell Battery: +1 Atk when hit by Electric move, consumed
 *   - Binding Band: changes partial trap damage from 1/16 to 1/8 (handled in conditions)
 *   - Mental Herb expanded: also cures Taunt, Encore, Disable, Torment, Heal Block
 *   - King's Rock/Razor Fang: no longer use the Gen 4 whitelist (applies to all damaging moves)
 *
 * Source: Showdown data/items.ts -- individual item entries
 * Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- gem, partiallytrapped
 *
 * @param trigger - When the item check occurs
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen5HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  // Klutz: holder cannot use its held item -- suppress all item triggers
  // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts -- Klutz gates all item battle effects
  if (context.pokemon.ability === GEN5_ABILITY_IDS.klutz) {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5 -- Embargo blocks item effects
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
    context.pokemon.ability === GEN5_ABILITY_IDS.unburden &&
    result.effects.some((e) => e.type === "consume") &&
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
 * Currently only handles the Metronome item's consecutive-use counter.
 * The Metronome item tracks how many times the holder uses the same move
 * in a row, boosting damage for consecutive uses.
 *
 * Source: Showdown sim/items.ts -- Metronome item onModifyDamage
 * Source: Bulbapedia -- Metronome (item): "Boosts the power of moves used
 *   consecutively. +20% per consecutive use, up to 100% (2.0x)."
 */
function handleBeforeMove(item: string, context: ItemContext): ItemResult {
  if (item !== GEN5_ITEM_IDS.metronome) return NO_ACTIVATION;

  const pokemon = context.pokemon;
  const moveId = context.move?.id;
  if (!moveId) return NO_ACTIVATION;

  const existing = pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.metronomeCount);
  const previousMoveId = existing?.data?.moveId as string | undefined;
  const previousCount = (existing?.data?.count as number) ?? 0;

  if (previousMoveId === moveId) {
    // Same move used consecutively -- increment count
    const newCount = previousCount + 1;
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.metronomeCount, {
      turnsLeft: -1,
      data: { count: newCount, moveId },
    });
  } else {
    // Different move (or first use) -- reset to count 1
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.metronomeCount, {
      turnsLeft: -1,
      data: { count: 1, moveId },
    });
  }

  // Metronome counter update is silent -- no battle message needed.
  return NO_ACTIVATION;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the opponent's max HP from the battle state.
 * Used by Jaboca/Rowap Berry to deal retaliation damage based on the attacker's HP.
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
    s.active.some((a) => a && a.pokemon === pokemon.pokemon),
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
    case GEN5_ITEM_IDS.leftovers: {
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount }],
        messages: [`${pokemonName}'s Leftovers restored its HP!`],
      };
    }

    // Black Sludge: Heals Poison-types 1/16 max HP; damages non-Poison-types 1/8 max HP
    // Source: Showdown data/items.ts -- Black Sludge onResidual
    case GEN5_ITEM_IDS.blackSludge: {
      if (isPoison) {
        const healAmount = Math.max(1, Math.floor(maxHp / 16));
        return {
          activated: true,
          effects: [{ type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount }],
          messages: [`${pokemonName}'s Black Sludge restored its HP!`],
        };
      }
      // Non-Poison: take 1/8 max HP damage
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: ITEM_EFFECT.chipDamage, target: EFFECT_TARGET.self, value: chipDamage }],
        messages: [`${pokemonName} was hurt by its Black Sludge!`],
      };
    }

    // Toxic Orb: Badly poisons the holder at end of turn
    // Source: Showdown data/items.ts -- Toxic Orb onResidual
    case GEN5_ITEM_IDS.toxicOrb: {
      if (status) return NO_ACTIVATION; // Already has a status
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
            type: ITEM_EFFECT.inflictStatus,
            target: EFFECT_TARGET.self,
            status: CORE_STATUS_IDS.badlyPoisoned,
          },
        ],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    case GEN5_ITEM_IDS.flameOrb: {
      if (status) return NO_ACTIVATION; // Already has a status
      // Fire types are immune to burns
      // Source: Showdown -- type immunity prevents Orb activation
      if (pokemon.types.includes(CORE_TYPE_IDS.fire)) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [
          {
            type: ITEM_EFFECT.inflictStatus,
            target: EFFECT_TARGET.self,
            status: CORE_STATUS_IDS.burn,
          },
        ],
        messages: [`${pokemonName} was burned by its Flame Orb!`],
      };
    }

    // Sitrus Berry: Heal 1/4 max HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Sitrus Berry onEat / onUpdate
    case GEN5_ITEM_IDS.sitrusBerry: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        const healAmount = Math.max(1, Math.floor(maxHp / 4));
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    // Source: Showdown data/items.ts -- Oran Berry
    case GEN5_ITEM_IDS.oranBerry: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: 10 },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Lum Berry: Cures any primary status OR confusion (consumed)
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    case GEN5_ITEM_IDS.lumBerry: {
      const hasConfusion = pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.confusion);
      const hasPrimaryStatus = status != null;
      if (!hasPrimaryStatus && !hasConfusion) {
        return NO_ACTIVATION;
      }
      const effects: ItemEffect[] = [];
      if (hasPrimaryStatus) {
        effects.push({ type: ITEM_EFFECT.statusCure, target: EFFECT_TARGET.self });
      }
      if (hasConfusion) {
        effects.push({
          type: ITEM_EFFECT.volatileCure,
          target: EFFECT_TARGET.self,
          value: CORE_VOLATILE_IDS.confusion,
        });
      }
      effects.push({
        type: ITEM_EFFECT.consume,
        target: EFFECT_TARGET.self,
        value: GEN5_ITEM_IDS.lumBerry,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Lum Berry cured its status!`],
      };
    }

    // Cheri Berry: Cures paralysis (consumed)
    // Source: Showdown data/items.ts -- Cheri Berry
    case GEN5_ITEM_IDS.cheriBerry: {
      if (status === CORE_STATUS_IDS.paralysis) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statusCure, target: EFFECT_TARGET.self },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.cheriBerry,
            },
          ],
          messages: [`${pokemonName}'s Cheri Berry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Chesto Berry: Cures sleep (consumed)
    // Source: Showdown data/items.ts -- Chesto Berry
    case GEN5_ITEM_IDS.chestoBerry: {
      if (status === CORE_STATUS_IDS.sleep) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statusCure, target: EFFECT_TARGET.self },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.chestoBerry,
            },
          ],
          messages: [`${pokemonName}'s Chesto Berry woke it up!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Pecha Berry: Cures poison and badly-poisoned (consumed)
    // Source: Showdown data/items.ts -- Pecha Berry
    case GEN5_ITEM_IDS.pechaBerry: {
      if (status === CORE_STATUS_IDS.poison || status === CORE_STATUS_IDS.badlyPoisoned) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statusCure, target: EFFECT_TARGET.self },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.pechaBerry,
            },
          ],
          messages: [`${pokemonName}'s Pecha Berry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rawst Berry: Cures burn (consumed)
    // Source: Showdown data/items.ts -- Rawst Berry
    case GEN5_ITEM_IDS.rawstBerry: {
      if (status === CORE_STATUS_IDS.burn) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statusCure, target: EFFECT_TARGET.self },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.rawstBerry,
            },
          ],
          messages: [`${pokemonName}'s Rawst Berry cured its burn!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Aspear Berry: Cures freeze (consumed)
    // Source: Showdown data/items.ts -- Aspear Berry
    case GEN5_ITEM_IDS.aspearBerry: {
      if (status === CORE_STATUS_IDS.freeze) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statusCure, target: EFFECT_TARGET.self },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.aspearBerry,
            },
          ],
          messages: [`${pokemonName}'s Aspear Berry thawed it out!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Persim Berry: Cures confusion volatile status (consumed)
    // Source: Showdown data/items.ts -- Persim Berry
    case GEN5_ITEM_IDS.persimBerry: {
      if (pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)) {
        return {
          activated: true,
          effects: [
            {
              type: ITEM_EFFECT.volatileCure,
              target: EFFECT_TARGET.self,
              value: CORE_VOLATILE_IDS.confusion,
            },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.persimBerry,
            },
          ],
          messages: [`${pokemonName}'s Persim Berry snapped it out of confusion!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Mental Herb: Cures infatuation AND (Gen 5+) Taunt, Encore, Disable, Torment, Heal Block
    // CHANGED from Gen 4 (was infatuation only)
    // Source: Showdown data/items.ts -- Mental Herb onUpdate:
    //   checks attract, taunt, encore, torment, disable, healblock
    case GEN5_ITEM_IDS.mentalHerb: {
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
          effects.push({ type: ITEM_EFFECT.volatileCure, target: EFFECT_TARGET.self, value: v });
        }
      }
      effects.push({
        type: ITEM_EFFECT.consume,
        target: EFFECT_TARGET.self,
        value: GEN5_ITEM_IDS.mentalHerb,
      });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Mental Herb cured its affliction!`],
      };
    }

    // Sticky Barb: 1/8 max HP damage to holder each turn (NOT consumed)
    // Source: Showdown data/items.ts -- Sticky Barb onResidual
    case GEN5_ITEM_IDS.stickyBarb: {
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: ITEM_EFFECT.chipDamage, target: EFFECT_TARGET.self, value: chipDamage }],
        messages: [`${pokemonName} was hurt by its Sticky Barb!`],
      };
    }

    // Berry Juice: Heal 20 HP when holder drops to <=50% HP (consumed)
    // Source: Showdown data/items.ts -- Berry Juice
    case GEN5_ITEM_IDS.berryJuice: {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: 20 },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.berryJuice,
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
    // Focus Sash is handled by Gen5Ruleset.capLethalDamage (pre-damage hook).
    // It is NOT handled here (post-damage) because currentHp is already post-damage,
    // so currentHp === maxHp is always false when damage > 0.
    // Source: Showdown data/items.ts -- Focus Sash onDamagePriority (pre-damage)

    // Focus Band is handled by Gen5Ruleset.capLethalDamage (pre-damage hook).
    // It is NOT handled here (post-damage) to avoid double-rolling the 10% chance
    // on a single lethal hit. capLethalDamage is the authoritative handler.
    // Source: Showdown sim/battle-actions.ts — Focus Band onDamage (pre-damage priority)

    // Sitrus Berry: Activates when HP drops to <= 50% after damage.
    // Note: currentHp is already post-damage (HP subtraction happens before this trigger).
    // Source: Showdown data/items.ts -- Sitrus Berry onUpdate post-damage check
    case GEN5_ITEM_IDS.sitrusBerry: {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        const healAmount = Math.max(1, Math.floor(maxHp / 4));
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.sitrusBerry,
            },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored its HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Activates when HP drops to <= 50% after damage.
    // Note: currentHp is already post-damage.
    // Source: Showdown data/items.ts -- Oran Berry post-damage check
    case GEN5_ITEM_IDS.oranBerry: {
      if (currentHp > 0 && currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: 10 },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.oranBerry,
            },
          ],
          messages: [`${pokemonName}'s Oran Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Stat pinch berries: boost a stat by +1 when HP drops to <=25% (or <=50% with Gluttony)
    // Source: Showdown data/items.ts -- stat pinch berries onUpdate trigger
    case GEN5_ITEM_IDS.liechiBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      // Note: currentHp is already post-damage (HP subtraction happens before this trigger).
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "attack" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.liechiBerry,
            },
          ],
          messages: [`${pokemonName}'s Liechi Berry raised its Attack!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN5_ITEM_IDS.ganlonBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "defense" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.ganlonBerry,
            },
          ],
          messages: [`${pokemonName}'s Ganlon Berry raised its Defense!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN5_ITEM_IDS.salacBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "speed" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.salacBerry,
            },
          ],
          messages: [`${pokemonName}'s Salac Berry raised its Speed!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN5_ITEM_IDS.petayaBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "spAttack" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.petayaBerry,
            },
          ],
          messages: [`${pokemonName}'s Petaya Berry raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    case GEN5_ITEM_IDS.apicotBerry: {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      if (currentHp > 0 && currentHp <= Math.floor(maxHp * threshold)) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "spDefense" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.apicotBerry,
            },
          ],
          messages: [`${pokemonName}'s Apicot Berry raised its Sp. Def!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit:
    //   this.damage(source.baseMaxhp / 8, source, target)
    case GEN5_ITEM_IDS.jabocaBerry: {
      const moveCategory = context.move?.category;
      if (moveCategory === CORE_MOVE_CATEGORIES.physical && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            {
              type: ITEM_EFFECT.chipDamage,
              target: EFFECT_TARGET.opponent,
              value: retaliationDamage,
            },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.jabocaBerry,
            },
          ],
          messages: [`${pokemonName}'s Jaboca Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Rowap Berry onDamagingHit:
    //   this.damage(source.baseMaxhp / 8, source, target)
    case GEN5_ITEM_IDS.rowapBerry: {
      const moveCategory = context.move?.category;
      if (moveCategory === CORE_MOVE_CATEGORIES.special && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            {
              type: ITEM_EFFECT.chipDamage,
              target: EFFECT_TARGET.opponent,
              value: retaliationDamage,
            },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.rowapBerry,
            },
          ],
          messages: [`${pokemonName}'s Rowap Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Sticky Barb: transfer to attacker on contact move if attacker has no held item.
    // Source: Showdown data/items.ts -- Sticky Barb onHit: item transfer on contact
    case GEN5_ITEM_IDS.stickyBarb: {
      const moveUsed = context.move;
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      const sides = context.state?.sides;
      if (!sides) return NO_ACTIVATION;
      const holderSide = sides.findIndex((s) =>
        s.active.some((a) => a && a.pokemon === pokemon.pokemon),
      );
      if (holderSide === -1) return NO_ACTIVATION;
      const opponentSide = holderSide === 0 ? 1 : 0;
      const opponent = sides[opponentSide]?.active?.[0];
      if (!opponent) return NO_ACTIVATION;
      if (opponent.pokemon.heldItem !== null) {
        return NO_ACTIVATION;
      }
      pokemon.pokemon.heldItem = null;
      opponent.pokemon.heldItem = GEN5_ITEM_IDS.stickyBarb;
      return {
        activated: true,
        effects: [],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
      };
    }

    // Air Balloon: pops when hit by any damaging move (consumed)
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    case GEN5_ITEM_IDS.airBalloon: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.airBalloon,
            },
          ],
          messages: [`${pokemonName}'s Air Balloon popped!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Red Card: forces the attacker to switch out after being hit (consumed)
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary:
    //   source.forceSwitchFlag = true; target.useItem()
    case GEN5_ITEM_IDS.redCard: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: ITEM_EFFECT.none,
              target: EFFECT_TARGET.opponent,
              value: ITEM_EFFECT_VALUE.forceSwitch,
            },
            { type: ITEM_EFFECT.consume, target: EFFECT_TARGET.self, value: GEN5_ITEM_IDS.redCard },
          ],
          messages: [`${pokemonName} held up its Red Card against the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Eject Button: holder switches out after being hit (consumed)
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary:
    //   target.switchFlag = true; target.useItem()
    case GEN5_ITEM_IDS.ejectButton: {
      if (damage > 0) {
        return {
          activated: true,
          effects: [
            {
              type: ITEM_EFFECT.none,
              target: EFFECT_TARGET.self,
              value: ITEM_EFFECT_VALUE.forceSwitch,
            },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.ejectButton,
            },
          ],
          messages: [`${pokemonName}'s Eject Button activated!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Absorb Bulb: +1 SpA when hit by a Water-type move (consumed)
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit:
    //   if (move.type === 'Water') boost spa by 1, useItem
    case GEN5_ITEM_IDS.absorbBulb: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.water) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "spAttack" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.absorbBulb,
            },
          ],
          messages: [`${pokemonName}'s Absorb Bulb raised its Sp. Atk!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Cell Battery: +1 Atk when hit by an Electric-type move (consumed)
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit:
    //   if (move.type === 'Electric') boost atk by 1, useItem
    case GEN5_ITEM_IDS.cellBattery: {
      if (damage > 0 && context.move?.type === CORE_TYPE_IDS.electric) {
        return {
          activated: true,
          effects: [
            { type: ITEM_EFFECT.statBoost, target: EFFECT_TARGET.self, value: "attack" },
            {
              type: ITEM_EFFECT.consume,
              target: EFFECT_TARGET.self,
              value: GEN5_ITEM_IDS.cellBattery,
            },
          ],
          messages: [`${pokemonName}'s Cell Battery raised its Attack!`],
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
    case GEN5_ITEM_IDS.rockyHelmet: {
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
          { type: ITEM_EFFECT.chipDamage, target: EFFECT_TARGET.opponent, value: chipDamage },
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
 * Key Gen 5 change: King's Rock / Razor Fang no longer use a whitelist.
 * They apply a 10% flinch chance to ALL damaging moves.
 *
 * Source: Showdown data/items.ts -- King's Rock / Razor Fang onModifyMovePriority
 * Source: Bulbapedia -- Gen 5+: King's Rock applies to all damaging moves
 */
function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // CHANGED from Gen 4 (Gen 4 used a ~200-move whitelist)
    // Source: Showdown data/items.ts -- King's Rock onModifyMovePriority -1
    //   In Gen 5+, the affectedByKingsRock list is removed; applies to all moves
    case GEN5_ITEM_IDS.kingsRock: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [{ type: ITEM_EFFECT.flinch, target: EFFECT_TARGET.opponent }],
            messages: [`${pokemonName}'s King's Rock caused flinching!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Razor Fang: 10% flinch chance on ALL damaging moves (Gen 5+, no whitelist)
    // CHANGED from Gen 4 (Gen 4 used the same whitelist as King's Rock)
    // Source: Showdown data/items.ts -- Razor Fang onModifyMovePriority
    case GEN5_ITEM_IDS.razorFang: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [{ type: ITEM_EFFECT.flinch, target: EFFECT_TARGET.opponent }],
            messages: [`${pokemonName}'s Razor Fang caused flinching!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Shell Bell: Heal 1/8 of damage dealt (NOT consumed -- permanent item)
    // Source: Showdown data/items.ts -- Shell Bell onAfterMoveSecondarySelf
    case GEN5_ITEM_IDS.shellBell: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        const healAmount = Math.max(1, Math.floor(damageDealt / 8));
        return {
          activated: true,
          effects: [{ type: ITEM_EFFECT.heal, target: EFFECT_TARGET.self, value: healAmount }],
          messages: [`${pokemonName}'s Shell Bell restored HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Life Orb: Recoil floor(maxHP/10) per hit
    // 1.3x damage boost is handled in Gen5DamageCalc.ts (pokeRound(baseDamage, 5324))
    // Sheer Force suppresses Life Orb recoil when the ability activates
    // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    case GEN5_ITEM_IDS.lifeOrb: {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        // Check Sheer Force suppression -- when SF activates, Life Orb recoil is skipped
        const moveEffect = (context.move?.effect ?? null) as MoveEffect | null;
        const moveId = context.move?.id ?? "";
        if (sheerForceSuppressesLifeOrb(pokemon.ability, moveEffect, moveId)) {
          return NO_ACTIVATION;
        }
        const recoil = Math.max(1, Math.floor(maxHp / 10));
        return {
          activated: true,
          effects: [{ type: ITEM_EFFECT.chipDamage, target: EFFECT_TARGET.self, value: recoil }],
          messages: [`${pokemonName} is hurt by its Life Orb!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}
