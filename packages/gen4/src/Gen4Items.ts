import type { ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

/**
 * Apply a Gen 4 held item effect at the given trigger point.
 *
 * Gen 4 held items follow the DPPt item system. Key differences from Gen 3:
 * - Sitrus Berry heals 1/4 max HP (Gen 3 used flat 30 HP)
 * - Black Sludge: heals Poison-types, damages others (NEW in Gen 4)
 * - Toxic Orb: badly poisons holder at end of turn (NEW in Gen 4)
 * - Flame Orb: burns holder at end of turn (NEW in Gen 4)
 * - Focus Sash: survive with 1 HP if at full HP, then consumed (NEW in Gen 4)
 * - Life Orb: recoil floor(maxHP/10) per hit (damage boost handled in damage calc)
 * - Razor Fang: 10% flinch chance on contact (NEW in Gen 4, same mechanic as King's Rock)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ItemBattleEffects
 * Source: Bulbapedia — individual item mechanics in Gen 4
 *
 * @param trigger - When the item check occurs ("end-of-turn", "on-damage-taken", "on-hit")
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 */
export function applyGen4HeldItem(trigger: string, context: ItemContext): ItemResult {
  const item = context.pokemon.pokemon.heldItem;

  if (!item) {
    return NO_ACTIVATION;
  }

  // Klutz: holder cannot use its held item — suppress all item triggers
  // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
  // Source: Showdown data/abilities.ts — Klutz gates all item battle effects
  if (context.pokemon.ability === "klutz") {
    return NO_ACTIVATION;
  }

  // Embargo: prevents item use for 5 turns
  // Source: Bulbapedia — Embargo: "prevents the target from using its held item"
  // Source: Showdown Gen 4 mod — Embargo blocks item effects
  if (context.pokemon.volatileStatuses.has("embargo")) {
    return NO_ACTIVATION;
  }

  switch (trigger) {
    case "before-move":
      return handleBeforeMove(item, context);
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
 * Source: Showdown sim/items.ts — Metronome item onModifyDamage
 * Source: Bulbapedia — Metronome (item): "Boosts the power of moves used
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
    // Same move used consecutively — increment count
    const newCount = previousCount + 1;
    pokemon.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: newCount, moveId },
    });
  } else {
    // Different move (or first use) — reset to count 1
    pokemon.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 1, moveId },
    });
  }

  // Metronome counter update is silent — no battle message needed.
  return NO_ACTIVATION;
}

// ---------------------------------------------------------------------------
// end-of-turn
// ---------------------------------------------------------------------------

/**
 * Handle end-of-turn item effects.
 *
 * Source: Showdown Gen 4 mod — ItemBattleEffects (end-of-turn phase)
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
    // Source: Showdown Gen 4 mod — Leftovers heals 1/16 max HP (same as Gen 3)
    case "leftovers": {
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ type: "heal", target: "self", value: healAmount }],
        messages: [`${pokemonName}'s Leftovers restored its HP!`],
      };
    }

    // Black Sludge: Heals Poison-types 1/16 max HP; damages non-Poison-types 1/8 max HP (NEW Gen 4)
    // Source: Bulbapedia — Black Sludge: Gen 4 item, heals Poison-types, damages others
    // Source: Showdown Gen 4 mod — Black Sludge trigger
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

    // Toxic Orb: Badly poisons the holder at end of turn (NEW Gen 4)
    // Only activates if the holder has no status yet.
    // Source: Bulbapedia — Toxic Orb: badly poisons holder at end of first turn held
    // Source: Showdown Gen 4 mod — Toxic Orb trigger
    case "toxic-orb": {
      if (status) return NO_ACTIVATION; // Already has a status
      return {
        activated: true,
        effects: [{ type: "none", target: "self", value: "badly-poisoned" }],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn (NEW Gen 4)
    // Only activates if the holder has no status yet.
    // Source: Bulbapedia — Flame Orb: burns holder at end of first turn held
    // Source: Showdown Gen 4 mod — Flame Orb trigger
    case "flame-orb": {
      if (status) return NO_ACTIVATION; // Already has a status
      return {
        activated: true,
        effects: [{ type: "none", target: "self", value: "burn" }],
        messages: [`${pokemonName} was burned by its Flame Orb!`],
      };
    }

    // Sitrus Berry: Heal 1/4 max HP when HP <= 50% max HP (consumed)
    // CHANGED from Gen 3 (was flat 30 HP) — Gen 4 changed to percentage-based healing
    // Source: Bulbapedia — Sitrus Berry: Gen 4+ heals 1/4 max HP (Gen 3 was flat 30)
    // Source: Showdown Gen 4 mod — Sitrus Berry uses 25% max HP
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
    // Source: Showdown Gen 4 mod — Oran Berry same as Gen 3 (10 HP flat)
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
    // Source: Showdown Gen 4 mod — Lum Berry cures all statuses (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Cheri Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Chesto Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Pecha Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Rawst Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Aspear Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Persim Berry (same as Gen 3)
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

    // Mental Herb: Cures attraction/infatuation volatile status (consumed)
    // Source: Showdown Gen 4 mod — Mental Herb (same as Gen 3)
    case "mental-herb": {
      if (pokemon.volatileStatuses.has("infatuation")) {
        return {
          activated: true,
          effects: [
            { type: "volatile-cure", target: "self", value: "infatuation" },
            { type: "consume", target: "self", value: "mental-herb" },
          ],
          messages: [`${pokemonName}'s Mental Herb cured its infatuation!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}

// ---------------------------------------------------------------------------
// on-damage-taken
// ---------------------------------------------------------------------------

/**
 * Handle on-damage-taken item effects.
 *
 * Source: Showdown Gen 4 mod — ItemBattleEffects (on-damage phase)
 */
function handleOnDamageTaken(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
  const damage = context.damage ?? 0;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Focus Sash: Survive with 1 HP if at full HP and damage would KO (consumed, single-use)
    // NEW in Gen 4. Unlike Focus Band it is always consumed when it activates.
    // Source: Bulbapedia — Focus Sash: guarantees survival at 1 HP if at full HP; consumed on use
    // Source: Showdown Gen 4 mod — Focus Sash trigger
    case "focus-sash": {
      // Must be at full HP before this hit to activate
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

    // Focus Band: 10% chance to survive with 1 HP (NOT consumed — reusable)
    // Source: Showdown Gen 4 mod — Focus Band 10% activation (same as Gen 3)
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

    // Sitrus Berry: Also activates when HP drops to <= 50% after damage (Gen 4: 1/4 max HP)
    // CHANGED from Gen 3 (was flat 30 HP) — Gen 4 uses percentage-based healing
    // Source: Bulbapedia — Sitrus Berry: Gen 4+ heals 1/4 max HP; triggers when HP <= 50%
    // Source: Showdown Gen 4 mod — Sitrus Berry post-damage check
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
    // Source: Showdown Gen 4 mod — Oran Berry post-damage check (same as Gen 3)
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
 * Source: Showdown Gen 4 mod — ItemBattleEffects (on-hit phase)
 */
function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? pokemon.pokemon.currentHp;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on damaging moves
    // Source: Showdown Gen 4 mod — King's Rock 10% flinch (same as Gen 3)
    case "kings-rock": {
      if (context.rng.chance(0.1)) {
        return {
          activated: true,
          effects: [{ type: "flinch", target: "opponent" }],
          messages: [`${pokemonName}'s King's Rock caused flinching!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Razor Fang: 10% flinch chance on damaging moves (NEW in Gen 4 — same mechanic as King's Rock)
    // Source: Bulbapedia — Razor Fang: 10% chance to cause flinch on contact moves
    // Source: Showdown Gen 4 mod — Razor Fang trigger
    case "razor-fang": {
      if (context.rng.chance(0.1)) {
        return {
          activated: true,
          effects: [{ type: "flinch", target: "opponent" }],
          messages: [`${pokemonName}'s Razor Fang caused flinching!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Shell Bell: Heal 1/8 of damage dealt (NOT consumed — permanent item)
    // Source: Showdown Gen 4 mod — Shell Bell 1/8 damage dealt (same as Gen 3)
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

    // Life Orb: Recoil floor(maxHP/10) per hit (1.3x damage boost handled in damage calc)
    // NEW in Gen 4. Life Orb gives 1.3x damage but deals recoil each time the holder attacks.
    // Source: Bulbapedia — Life Orb: 1.3x damage, deals floor(maxHP/10) recoil per hit
    // Source: Showdown Gen 4 mod — Life Orb recoil trigger
    case "life-orb": {
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
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
