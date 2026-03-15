import type { ItemContext, ItemResult } from "@pokemon-lib/battle";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

/**
 * Apply a Gen 2 held item effect at the given trigger point.
 *
 * Gen 2 held items:
 * - Leftovers: restore 1/16 max HP at end of turn (NOT consumed)
 * - Berry: cure paralysis at end of turn (consumed)
 * - Ice Berry: cure burn at end of turn (consumed)
 * - Mint Berry: cure sleep at end of turn (consumed)
 * - Burnt Berry: cure freeze at end of turn (consumed)
 * - PSNCureBerry: cure poison/badly-poisoned at end of turn (consumed)
 * - Berry Juice: heal 20 HP when HP <= 50% (consumed)
 * - Focus Band: 12% chance to survive a KO at 1 HP (on-damage-taken)
 * - King's Rock: 10% flinch on damaging moves (on-hit)
 * - Type-boosting items: 10% damage boost (handled in damage calc, not here)
 *
 * @param trigger - When the item check occurs ("end-of-turn", "on-damage-taken", "on-hit")
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen2HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  switch (trigger) {
    case "end-of-turn":
      return handleEndOfTurn(item, context);
    case "on-damage-taken":
      return handleOnDamageTaken(item, context);
    case "on-hit":
      return handleOnHit(item, context);
    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle end-of-turn item effects.
 */
function handleEndOfTurn(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
  const status = pokemon.pokemon.status;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Leftovers: Heal 1/16 max HP each turn, NOT consumed
    case "leftovers": {
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ type: "heal", target: "self", value: healAmount }],
        messages: [`${pokemonName}'s Leftovers restored its HP!`],
      };
    }

    // Berry: Cures paralysis (consumed)
    case "berry": {
      if (status === "paralysis") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: "paralysis" },
            { type: "consume", target: "self", value: "berry" },
          ],
          messages: [`${pokemonName}'s Berry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Ice Berry: Cures burn (consumed)
    case "ice-berry": {
      if (status === "burn") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: "burn" },
            { type: "consume", target: "self", value: "ice-berry" },
          ],
          messages: [`${pokemonName}'s Ice Berry cured its burn!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Mint Berry: Cures sleep (consumed)
    case "mint-berry": {
      if (status === "sleep") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: "sleep" },
            { type: "consume", target: "self", value: "mint-berry" },
          ],
          messages: [`${pokemonName}'s Mint Berry woke it up!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Burnt Berry: Cures freeze (consumed)
    case "burnt-berry": {
      if (status === "freeze") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: "freeze" },
            { type: "consume", target: "self", value: "burnt-berry" },
          ],
          messages: [`${pokemonName}'s Burnt Berry thawed it out!`],
        };
      }
      return NO_ACTIVATION;
    }

    // PSNCureBerry: Cures poison and badly-poisoned (consumed)
    case "psncureberry": {
      if (status === "poison" || status === "badly-poisoned") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: status },
            { type: "consume", target: "self", value: "psncureberry" },
          ],
          messages: [`${pokemonName}'s PSNCureBerry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Berry Juice: Heal 20 HP when HP <= 50% max (consumed)
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

/**
 * Handle on-damage-taken item effects.
 */
function handleOnDamageTaken(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const damage = context.damage ?? 0;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Focus Band: 12% chance to survive with 1 HP when damage would KO
    case "focus-band": {
      if (currentHp - damage <= 0) {
        if (context.rng.chance(12)) {
          return {
            activated: true,
            effects: [{ type: "survive", target: "self", value: 1 }],
            messages: [`${pokemonName} hung on using its Focus Band!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Berry Juice: Heal 20 HP when HP drops below 50%
    case "berry-juice": {
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp / 2)) {
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

/**
 * Handle on-hit item effects.
 */
function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on damaging moves
    case "kings-rock": {
      if (context.rng.chance(10)) {
        return {
          activated: true,
          effects: [{ type: "flinch", target: "opponent", value: true }],
          messages: [`${pokemonName}'s King's Rock caused flinching!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}
