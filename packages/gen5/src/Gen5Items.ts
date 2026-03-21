import type { ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import type { MoveEffect, VolatileStatus } from "@pokemon-lib-ts/core";
import { sheerForceSuppressesLifeOrb } from "./Gen5AbilitiesDamage";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

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
  "normal-gem": "normal",
  "fire-gem": "fire",
  "water-gem": "water",
  "electric-gem": "electric",
  "grass-gem": "grass",
  "ice-gem": "ice",
  "fighting-gem": "fighting",
  "poison-gem": "poison",
  "ground-gem": "ground",
  "flying-gem": "flying",
  "psychic-gem": "psychic",
  "bug-gem": "bug",
  "rock-gem": "rock",
  "ghost-gem": "ghost",
  "dragon-gem": "dragon",
  "dark-gem": "dark",
  "steel-gem": "steel",
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
  if (pokemon.ability === "gluttony" && normalFraction <= 0.25) {
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
  if (context.pokemon.ability === "klutz") {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 5 -- Embargo blocks item effects
  if (context.pokemon.volatileStatuses.has("embargo")) {
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
  if (item !== "metronome") return NO_ACTIVATION;

  const pokemon = context.pokemon;
  const moveId = context.move?.id;
  if (!moveId) return NO_ACTIVATION;

  const existing = pokemon.volatileStatuses.get("metronome-count");
  const previousMoveId = existing?.data?.moveId as string | undefined;
  const previousCount = (existing?.data?.count as number) ?? 0;

  if (previousMoveId === moveId) {
    // Same move used consecutively -- increment count
    const newCount = previousCount + 1;
    pokemon.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: newCount, moveId },
    });
  } else {
    // Different move (or first use) -- reset to count 1
    pokemon.volatileStatuses.set("metronome-count", {
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
      // Non-Poison: take 1/8 max HP damage
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: "none", target: "self", value: -chipDamage }],
        messages: [`${pokemonName} was hurt by its Black Sludge!`],
      };
    }

    // Toxic Orb: Badly poisons the holder at end of turn
    // Source: Showdown data/items.ts -- Toxic Orb onResidual
    case "toxic-orb": {
      if (status) return NO_ACTIVATION; // Already has a status
      // Poison and Steel types are immune to poisoning
      // Source: Showdown -- type immunity prevents Orb activation
      if (pokemon.types.includes("poison") || pokemon.types.includes("steel")) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ type: "none", target: "self", value: "badly-poisoned" }],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    case "flame-orb": {
      if (status) return NO_ACTIVATION; // Already has a status
      // Fire types are immune to burns
      // Source: Showdown -- type immunity prevents Orb activation
      if (pokemon.types.includes("fire")) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ type: "none", target: "self", value: "burn" }],
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
        effects.push({ type: "status-cure", target: "self", value: status as string });
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
            { type: "status-cure", target: "self", value: "paralysis" },
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
            { type: "status-cure", target: "self", value: "sleep" },
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
            { type: "status-cure", target: "self", value: status },
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
            { type: "status-cure", target: "self", value: "burn" },
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
            { type: "status-cure", target: "self", value: "freeze" },
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
    // CHANGED from Gen 4 (was infatuation only)
    // Source: Showdown data/items.ts -- Mental Herb onUpdate:
    //   checks attract, taunt, encore, torment, disable, healblock
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
        effects: [{ type: "none", target: "self", value: -chipDamage }],
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

    // Focus Band: 10% chance to survive with 1 HP (NOT consumed -- reusable)
    // Source: Showdown data/items.ts -- Focus Band 10% activation
    case "focus-band": {
      if (currentHp - damage <= 0) {
        if (context.rng.chance(0.1)) {
          return {
            activated: true,
            effects: [{ type: "survive", target: "self", value: 1 }],
            messages: [`${pokemonName} hung on using its Focus Band!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Sitrus Berry: Also activates when HP drops to <= 50% after damage
    // Source: Showdown data/items.ts -- Sitrus Berry onUpdate post-damage check
    case "sitrus-berry": {
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp / 2)) {
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

    // Oran Berry: Also activates when HP drops to <= 50% after damage
    // Source: Showdown data/items.ts -- Oran Berry post-damage check
    case "oran-berry": {
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp / 2)) {
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

    // Stat pinch berries: boost a stat by +1 when HP drops to <=25% (or <=50% with Gluttony)
    // Source: Showdown data/items.ts -- stat pinch berries onUpdate trigger
    case "liechi-berry": {
      const threshold = getPinchBerryThreshold(pokemon, 0.25);
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp * threshold)) {
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
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp * threshold)) {
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
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp * threshold)) {
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
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp * threshold)) {
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
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp * threshold)) {
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
    // Source: Showdown data/items.ts -- Jaboca Berry onDamagingHit:
    //   this.damage(source.baseMaxhp / 8, source, target)
    case "jaboca-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "physical" && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            { type: "self-damage", target: "opponent", value: retaliationDamage },
            { type: "consume", target: "self", value: "jaboca-berry" },
          ],
          messages: [`${pokemonName}'s Jaboca Berry hurt the attacker!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP
    // Source: Showdown data/items.ts -- Rowap Berry onDamagingHit:
    //   this.damage(source.baseMaxhp / 8, source, target)
    case "rowap-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "special" && damage > 0) {
        const attackerMaxHp = getOpponentMaxHp(context);
        const retaliationDamage = Math.max(1, Math.floor(attackerMaxHp / 8));
        return {
          activated: true,
          effects: [
            { type: "self-damage", target: "opponent", value: retaliationDamage },
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
      opponent.pokemon.heldItem = "sticky-barb";
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
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary:
    //   source.forceSwitchFlag = true; target.useItem()
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
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary:
    //   target.switchFlag = true; target.useItem()
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
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit:
    //   if (move.type === 'Water') boost spa by 1, useItem
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
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit:
    //   if (move.type === 'Electric') boost atk by 1, useItem
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
      // Damage is 1/6 of the ATTACKER's max HP, not the holder's
      const attackerMaxHp = getOpponentMaxHp(context);
      const chipDamage = Math.max(1, Math.floor(attackerMaxHp / 6));
      return {
        activated: true,
        effects: [{ type: "self-damage", target: "opponent", value: chipDamage }],
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
    // CHANGED from Gen 4 (Gen 4 used the same whitelist as King's Rock)
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
    // 1.3x damage boost is handled in Gen5DamageCalc.ts (pokeRound(baseDamage, 5324))
    // Sheer Force suppresses Life Orb recoil when the ability activates
    // Source: Showdown data/items.ts -- Life Orb onAfterMoveSecondarySelf
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    case "life-orb": {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
        // Check Sheer Force suppression -- when SF activates, Life Orb recoil is skipped
        const moveEffect = (context.move?.effect ?? null) as MoveEffect | null;
        if (sheerForceSuppressesLifeOrb(pokemon.ability, moveEffect)) {
          return NO_ACTIVATION;
        }
        const recoil = Math.max(1, Math.floor(maxHp / 10));
        return {
          activated: true,
          effects: [{ type: "none", target: "self", value: -recoil }],
          messages: [`${pokemonName} is hurt by its Life Orb!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}
