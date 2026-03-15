import type { ItemContext, ItemResult } from "@pokemon-lib-ts/battle";

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
 * - Berry: restore 10 HP when HP <= 50% max HP at end of turn (consumed)
 * - PRZCureBerry: cure paralysis at end of turn (consumed)
 * - Gold Berry: restore 30 HP when HP <= 50% max HP (consumed, end-of-turn and on-damage-taken)
 * - Ice Berry: cure burn at end of turn (consumed)
 * - Mint Berry: cure sleep at end of turn (consumed)
 * - Burnt Berry: cure freeze at end of turn (consumed)
 * - PSNCureBerry: cure poison/badly-poisoned at end of turn (consumed)
 * - Bitter Berry: cure confusion at end of turn (consumed)
 * - Miracle Berry: cure any primary status at end of turn (consumed)
 * - Berry Juice: heal 20 HP when HP <= 50% (consumed)
 * - Focus Band: 12% chance to survive a KO at 1 HP (on-damage-taken)
 * - King's Rock: 30/256 (~11.72%) flinch on damaging moves (on-hit)
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

    // Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    case "berry": {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 10 },
            { type: "consume", target: "self", value: "berry" },
          ],
          messages: [`${pokemonName}'s Berry restored 10 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // PRZCureBerry: Cures paralysis (consumed)
    case "prz-cure-berry": {
      if (status === "paralysis") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: "paralysis" },
            { type: "consume", target: "self", value: "prz-cure-berry" },
          ],
          messages: [`${pokemonName}'s PRZCureBerry cured its paralysis!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Gold Berry: Restore 30 HP when HP <= 50% max HP (consumed)
    case "gold-berry": {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 30 },
            { type: "consume", target: "self", value: "gold-berry" },
          ],
          messages: [`${pokemonName}'s Gold Berry restored 30 HP!`],
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
    case "psn-cure-berry": {
      if (status === "poison" || status === "badly-poisoned") {
        return {
          activated: true,
          effects: [
            { type: "status-cure", target: "self", value: status },
            { type: "consume", target: "self", value: "psn-cure-berry" },
          ],
          messages: [`${pokemonName}'s PSNCureBerry cured its poisoning!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Bitter Berry: Cures confusion volatile status (consumed)
    case "bitter-berry": {
      if (pokemon.volatileStatuses.has("confusion")) {
        return {
          activated: true,
          effects: [
            { type: "volatile-cure", target: "self", value: "confusion" },
            { type: "consume", target: "self", value: "bitter-berry" },
          ],
          messages: [`${pokemonName}'s Bitter Berry snapped it out of confusion!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Miracle Berry: Cures any primary status OR confusion (consumed)
    case "miracle-berry": {
      const hasConfusion = pokemon.volatileStatuses.has("confusion");
      const hasPrimaryStatus = status != null;
      if (!hasPrimaryStatus && !hasConfusion) {
        return NO_ACTIVATION;
      }
      const effects: Array<{
        type: string;
        target: "self" | "opponent" | "field";
        value: string | boolean;
      }> = [];
      if (hasPrimaryStatus) {
        effects.push({ type: "status-cure", target: "self", value: status! });
      }
      if (hasConfusion) {
        effects.push({ type: "volatile-cure", target: "self", value: "confusion" });
      }
      effects.push({ type: "consume", target: "self", value: "miracle-berry" });
      return {
        activated: true,
        effects,
        messages: [`${pokemonName}'s Miracle Berry cured its status!`],
      };
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
        if (context.rng.chance(0.12)) {
          return {
            activated: true,
            effects: [{ type: "survive", target: "self", value: 1 }],
            messages: [`${pokemonName} hung on using its Focus Band!`],
          };
        }
      }
      return NO_ACTIVATION;
    }

    // Gold Berry: Heal 30 HP when HP drops to <= 50%
    case "gold-berry": {
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
      const hpAfterDamage = currentHp - damage;
      if (
        hpAfterDamage > 0 &&
        hpAfterDamage <= Math.floor(maxHp / 2) &&
        currentHp > Math.floor(maxHp / 2)
      ) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 30 },
            { type: "consume", target: "self", value: "gold-berry" },
          ],
          messages: [`${pokemonName}'s Gold Berry restored 30 HP!`],
        };
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
    // King's Rock: 30/256 (~11.72%) flinch chance on damaging moves
    case "kings-rock": {
      if (context.rng.chance(30 / 256)) {
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
