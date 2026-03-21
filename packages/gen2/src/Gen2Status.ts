import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";

/**
 * Gen 2 type immunities to status conditions.
 *
 * - Fire types: immune to burn
 * - Ice types: immune to freeze
 * - Poison types: immune to poison and badly-poisoned
 * - Steel types: immune to poison and badly-poisoned (new type in Gen 2)
 *
 * Note: Electric types are NOT immune to paralysis in Gen 2. That immunity
 * was introduced in Gen 6. Both Gen 1 and Gen 2 allow Electric types to
 * be paralyzed.
 */
const STATUS_IMMUNITIES: Record<string, readonly PokemonType[]> = {
  burn: ["fire"],
  poison: ["poison", "steel"],
  "badly-poisoned": ["poison", "steel"],
  freeze: ["ice"],
};

/**
 * Calculate the residual damage dealt by a status condition in Gen 2.
 *
 * - Burn: 1/8 max HP per turn
 * - Poison: 1/8 max HP per turn
 * - Badly-poisoned (Toxic): N/16 max HP per turn (N = toxic counter, starts at 1)
 *   The toxic counter resets on switch (unlike Gen 1). Tracked via volatileStatuses.
 * - Sleep, Freeze, Paralysis: 0 damage (no residual damage)
 *
 * @param pokemon - The affected Pokemon
 * @param status - The primary status condition
 * @param state - The current battle state (unused for now but available for future mechanics)
 * @returns The damage dealt this turn (floored, minimum 1 for damaging statuses)
 */
export function calculateGen2StatusDamage(
  pokemon: ActivePokemon,
  status: PrimaryStatus,
  _state: BattleState,
): number {
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;

  switch (status) {
    case "burn":
    case "poison": {
      // 1/8 max HP per turn, minimum 1
      return Math.max(1, Math.floor(maxHp / 8));
    }

    case "badly-poisoned": {
      // Toxic: N/16 max HP, where N starts at 1 and increments each turn
      // Counter tracked via volatileStatuses "toxic-counter"
      let toxicCounter = 1;
      const toxicState = pokemon.volatileStatuses.get("toxic-counter" as never);
      if (toxicState) {
        const data = (toxicState as { data?: Record<string, unknown> }).data;
        if (data && typeof data.counter === "number") {
          toxicCounter = data.counter;
        }
      }
      return Math.max(1, Math.floor((maxHp * toxicCounter) / 16));
    }

    case "sleep":
    case "freeze":
    case "paralysis": {
      // No residual damage
      return 0;
    }

    default:
      return 0;
  }
}

/**
 * Check whether a status condition can be inflicted on a target Pokemon in Gen 2.
 *
 * Checks:
 * 1. The target must not already have a primary status condition.
 * 2. The target must not be immune based on its type(s).
 * 3. Safeguard on the target's side blocks all primary status conditions.
 *
 * Type immunities (Gen 2):
 * - Fire: immune to burn
 * - Ice: immune to freeze
 * - Poison/Steel: immune to poison and badly-poisoned
 *
 * Note: Electric types are NOT immune to paralysis in Gen 2 (that immunity
 * was added in Gen 6). No type is immune to paralysis in Gen 2.
 *
 * @param status - The status to attempt to inflict
 * @param target - The target Pokemon
 * @param state - Optional battle state; when provided, checks for Safeguard on the target's side
 * @returns true if the status can be inflicted
 */
export function canInflictGen2Status(
  status: PrimaryStatus,
  target: ActivePokemon,
  state?: BattleState,
): boolean {
  // Can't have two primary statuses at once
  if (target.pokemon.status !== null) {
    return false;
  }

  // Check type immunities
  const immuneTypes = STATUS_IMMUNITIES[status];
  if (immuneTypes) {
    for (const type of target.types) {
      if (immuneTypes.includes(type)) {
        return false;
      }
    }
  }

  // Safeguard prevents status infliction on the target's side
  // Source: pret/pokecrystal engine/battle/effect_commands.asm CheckSafeguard
  if (state) {
    const defenderSide = state.sides.find((s) =>
      s.active.some((a) => a?.pokemon === target.pokemon),
    );
    if (defenderSide?.screens.some((s) => s.type === "safeguard")) {
      return false;
    }
  }

  return true;
}
