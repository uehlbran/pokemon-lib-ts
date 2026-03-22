import type { ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

/**
 * Get the HP threshold fraction for pinch berry activation.
 * Gluttony changes the activation threshold from 25% to 50%.
 * Normal berries (Sitrus, Oran) already use 50% and are unaffected.
 *
 * Source: Bulbapedia — Gluttony: "Makes the Pokemon eat a held Berry when its HP
 *   drops to 50% or less instead of the usual 25%."
 * Source: Showdown data/abilities.ts — Gluttony modifies pinch berry threshold
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
    case "on-hit":
      result = handleOnHit(item, context);
      break;
    default:
      result = NO_ACTIVATION;
      break;
  }

  // Unburden: when a held item is consumed and the holder has Unburden,
  // set the "unburden" volatile to double Speed.
  // Source: Bulbapedia — Unburden: "Doubles the Pokemon's Speed stat when its held
  //   item is used or lost."
  // Source: Showdown data/abilities.ts — Unburden onAfterUseItem
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
 * Source: Showdown data/mods/gen4/items.ts — Metronome item onModifyDamagePhase2:
 *   return damage * (1 + (this.effectState.numConsecutive / 10));
 * Gen 4: +10% per consecutive use, NO cap (boost accumulates indefinitely).
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
    // Magic Guard: prevents indirect (chip) damage from Black Sludge on non-Poison holders.
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard blocks Black Sludge chip
    case "black-sludge": {
      if (isPoison) {
        const healAmount = Math.max(1, Math.floor(maxHp / 16));
        return {
          activated: true,
          effects: [{ type: "heal", target: "self", value: healAmount }],
          messages: [`${pokemonName}'s Black Sludge restored its HP!`],
        };
      }
      // Non-Poison: take 1/8 max HP damage — blocked by Magic Guard
      if (pokemon.ability === "magic-guard") return NO_ACTIVATION;
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: "chip-damage", target: "self", value: chipDamage }],
        messages: [`${pokemonName} was hurt by its Black Sludge!`],
      };
    }

    // Toxic Orb: Badly poisons the holder at end of turn (NEW Gen 4)
    // Only activates if the holder has no status yet and is not type-immune.
    // Source: Bulbapedia — Toxic Orb: badly poisons holder at end of first turn held
    // Source: Showdown Gen 4 mod — Toxic Orb trigger; type immunity prevents activation
    case "toxic-orb": {
      if (status) return NO_ACTIVATION; // Already has a status
      // Poison and Steel types are immune to poisoning
      // Source: Showdown Gen 4 — type immunity prevents Orb activation
      if (context.pokemon.types.includes("poison") || context.pokemon.types.includes("steel")) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ type: "inflict-status", target: "self", status: "badly-poisoned" }],
        messages: [`${pokemonName} was badly poisoned by its Toxic Orb!`],
      };
    }

    // Flame Orb: Burns the holder at end of turn (NEW Gen 4)
    // Only activates if the holder has no status yet and is not type-immune.
    // Source: Bulbapedia — Flame Orb: burns holder at end of first turn held
    // Source: Showdown Gen 4 mod — Flame Orb trigger; type immunity prevents activation
    case "flame-orb": {
      if (status) return NO_ACTIVATION; // Already has a status
      // Fire types are immune to burns
      // Source: Showdown Gen 4 — type immunity prevents Orb activation
      if (context.pokemon.types.includes("fire")) {
        return NO_ACTIVATION;
      }
      return {
        activated: true,
        effects: [{ type: "inflict-status", target: "self", status: "burn" }],
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
    // Source: Showdown Gen 4 mod — Cheri Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Chesto Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Pecha Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Rawst Berry (same as Gen 3)
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
    // Source: Showdown Gen 4 mod — Aspear Berry (same as Gen 3)
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

    // Sticky Barb: 1/8 max HP damage to holder each turn (NOT consumed)
    // Source: Bulbapedia — Sticky Barb: "At the end of every turn, the holder takes
    //   damage equal to 1/8 of its maximum HP."
    // Source: Showdown Gen 4 mod — Sticky Barb end-of-turn chip
    // Magic Guard: prevents indirect chip damage from Sticky Barb.
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard blocks Sticky Barb chip
    case "sticky-barb": {
      if (pokemon.ability === "magic-guard") return NO_ACTIVATION;
      const chipDamage = Math.max(1, Math.floor(maxHp / 8));
      return {
        activated: true,
        effects: [{ type: "chip-damage", target: "self", value: chipDamage }],
        messages: [`${pokemonName} was hurt by its Sticky Barb!`],
      };
    }

    // Berry Juice: Heal 20 HP when holder drops to ≤50% HP (consumed)
    // Source: Bulbapedia — Berry Juice: "Restores 20 HP when the holder's HP drops
    //   to 50% or below."
    // Source: Showdown Gen 4 mod — Berry Juice EoT trigger at 50%
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

    // Stat pinch berries: boost a stat by +1 when HP drops to <=25% (or <=50% with Gluttony)
    // Source: Bulbapedia — Liechi/Ganlon/Salac/Petaya/Apicot berries
    // Source: Showdown sim/items.ts — stat pinch berries onUpdate trigger
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

    // Jaboca Berry: when hit by a physical move, attacker takes 1/8 of ATTACKER's max HP.
    // Source: Bulbapedia — Jaboca Berry: "If holder is hit by a physical move,
    //   attacker loses 1/8 of its max HP."
    // Source: Showdown data/items.ts — Jaboca Berry onDamagingHit:
    //   this.damage(source.baseMaxhp / 8, source, target) — source is the attacker
    case "jaboca-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "physical" && damage > 0) {
        // Find the attacker's max HP from the battle state
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

    // Rowap Berry: when hit by a special move, attacker takes 1/8 of ATTACKER's max HP.
    // Source: Bulbapedia — Rowap Berry: "If holder is hit by a special move,
    //   attacker loses 1/8 of its max HP."
    // Source: Showdown data/items.ts — Rowap Berry onDamagingHit:
    //   this.damage(source.baseMaxhp / 8, source, target) — source is the attacker
    case "rowap-berry": {
      const moveCategory = context.move?.category;
      if (moveCategory === "special" && damage > 0) {
        // Find the attacker's max HP from the battle state
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
    // The end-of-turn chip damage is handled separately in handleEndOfTurn.
    // Source: Bulbapedia — Sticky Barb: "If the holder is hit with a contact move,
    //   the Sticky Barb transfers to the attacker (unless the attacker already holds an item)"
    // Source: Showdown data/items.ts — Sticky Barb onHit: item transfer on contact
    case "sticky-barb": {
      const moveUsed = context.move;
      // Only transfer on contact moves
      if (!moveUsed?.flags?.contact) {
        return NO_ACTIVATION;
      }
      // Find the opponent (attacker) from the battle state.
      // The holder (defender) is context.pokemon; find which side they're on.
      const sides = context.state?.sides;
      if (!sides) return NO_ACTIVATION;
      const holderSide = sides.findIndex((s) =>
        s.active.some((a) => a && a.pokemon === pokemon.pokemon),
      );
      if (holderSide === -1) return NO_ACTIVATION;
      const opponentSide = holderSide === 0 ? 1 : 0;
      const opponent = sides[opponentSide]?.active?.[0];
      if (!opponent) return NO_ACTIVATION;
      // Only transfer if the attacker has no held item
      if (opponent.pokemon.heldItem !== null) {
        return NO_ACTIVATION;
      }
      // Transfer: remove from holder, give to attacker
      // Direct mutation is consistent with other item transfer patterns (e.g., Thief, Trick)
      pokemon.pokemon.heldItem = null;
      opponent.pokemon.heldItem = "sticky-barb";
      // Unburden: if holder had Unburden, activate it now that their item is gone
      // Source: Showdown Gen 4 mod — Unburden activates on any item loss including Sticky Barb transfer
      // Follows the same pattern as Knock Off (Gen4MoveEffects.ts)
      if (pokemon.ability === "unburden" && !pokemon.volatileStatuses.has("unburden")) {
        pokemon.volatileStatuses.set("unburden", { turnsLeft: -1 });
      }
      return {
        activated: true,
        effects: [],
        messages: [
          `${pokemonName}'s Sticky Barb latched onto ${opponent.pokemon.nickname ?? "the attacker"}!`,
        ],
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
 * Gen 4 whitelist of moves eligible for King's Rock / Razor Fang flinch.
 * In Gen 4, these items only add a 10% flinch chance to moves that don't
 * already have a secondary effect (roughly ~200 moves).
 *
 * Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/items.ts —
 *   kingsrock.onModifyMove and razorfang.onModifyMove use this exact list
 */
const KINGS_ROCK_ELIGIBLE_MOVES = new Set([
  "aerial-ace",
  "aeroblast",
  "air-cutter",
  "air-slash",
  "aqua-jet",
  "aqua-tail",
  "arm-thrust",
  "assurance",
  "attack-order",
  "aura-sphere",
  "avalanche",
  "barrage",
  "beat-up",
  "bide",
  "bind",
  "blast-burn",
  "bone-rush",
  "bonemerang",
  "bounce",
  "brave-bird",
  "brick-break",
  "brine",
  "bug-bite",
  "bullet-punch",
  "bullet-seed",
  "charge-beam",
  "clamp",
  "close-combat",
  "comet-punch",
  "crabhammer",
  "cross-chop",
  "cross-poison",
  "crush-grip",
  "cut",
  "dark-pulse",
  "dig",
  "discharge",
  "dive",
  "double-hit",
  "double-kick",
  "double-slap",
  "double-edge",
  "draco-meteor",
  "dragon-breath",
  "dragon-claw",
  "dragon-pulse",
  "dragon-rage",
  "dragon-rush",
  "drain-punch",
  "drill-peck",
  "earth-power",
  "earthquake",
  "egg-bomb",
  "endeavor",
  "eruption",
  "explosion",
  "extreme-speed",
  "false-swipe",
  "feint-attack",
  "fire-fang",
  "fire-spin",
  "flail",
  "flash-cannon",
  "fly",
  "force-palm",
  "frenzy-plant",
  "frustration",
  "fury-attack",
  "fury-cutter",
  "fury-swipes",
  "giga-impact",
  "grass-knot",
  "gunk-shot",
  "gust",
  "gyro-ball",
  "hammer-arm",
  "head-smash",
  "hidden-power",
  "high-jump-kick",
  "horn-attack",
  "hydro-cannon",
  "hydro-pump",
  "hyper-beam",
  "ice-ball",
  "ice-fang",
  "ice-shard",
  "icicle-spear",
  "iron-head",
  "judgment",
  "jump-kick",
  "karate-chop",
  "last-resort",
  "lava-plume",
  "leaf-blade",
  "leaf-storm",
  "low-kick",
  "mach-punch",
  "magical-leaf",
  "magma-storm",
  "magnet-bomb",
  "magnitude",
  "mega-kick",
  "mega-punch",
  "megahorn",
  "meteor-mash",
  "mirror-shot",
  "mud-bomb",
  "mud-shot",
  "muddy-water",
  "night-shade",
  "night-slash",
  "ominous-wind",
  "outrage",
  "overheat",
  "pay-day",
  "payback",
  "peck",
  "petal-dance",
  "pin-missile",
  "pluck",
  "poison-jab",
  "poison-tail",
  "pound",
  "power-gem",
  "power-whip",
  "psycho-boost",
  "psycho-cut",
  "psywave",
  "punishment",
  "quick-attack",
  "rage",
  "rapid-spin",
  "razor-leaf",
  "razor-wind",
  "return",
  "revenge",
  "reversal",
  "roar-of-time",
  "rock-blast",
  "rock-climb",
  "rock-throw",
  "rock-wrecker",
  "rolling-kick",
  "rollout",
  "sand-tomb",
  "scratch",
  "seed-bomb",
  "seed-flare",
  "seismic-toss",
  "self-destruct",
  "shadow-claw",
  "shadow-force",
  "shadow-punch",
  "shadow-sneak",
  "shock-wave",
  "signal-beam",
  "silver-wind",
  "skull-bash",
  "sky-attack",
  "sky-uppercut",
  "slam",
  "slash",
  "snore",
  "solar-beam",
  "sonic-boom",
  "spacial-rend",
  "spike-cannon",
  "spit-up",
  "steel-wing",
  "stone-edge",
  "strength",
  "struggle",
  "submission",
  "sucker-punch",
  "surf",
  "swift",
  "tackle",
  "take-down",
  "thrash",
  "thunder-fang",
  "triple-kick",
  "trump-card",
  "twister",
  "u-turn",
  "uproar",
  "vacuum-wave",
  "vice-grip",
  "vine-whip",
  "vital-throw",
  "volt-tackle",
  "wake-up-slap",
  "water-gun",
  "water-pulse",
  "waterfall",
  "weather-ball",
  "whirlpool",
  "wing-attack",
  "wood-hammer",
  "wrap",
  "wring-out",
  "x-scissor",
  "zen-headbutt",
]);

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
    // King's Rock: 10% flinch chance ONLY on moves in the Gen 4 whitelist.
    // In Gen 4, these items only affect moves without existing secondary effects.
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/items.ts —
    //   kingsrock.onModifyMove checks affectedByKingsRock list
    case "kings-rock": {
      const moveId = context.move?.id;
      if (!moveId || !KINGS_ROCK_ELIGIBLE_MOVES.has(moveId)) return NO_ACTIVATION;
      if (context.rng.chance(0.1)) {
        return {
          activated: true,
          effects: [{ type: "flinch", target: "opponent" }],
          messages: [`${pokemonName}'s King's Rock caused flinching!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Razor Fang: 10% flinch chance ONLY on moves in the Gen 4 whitelist (same as King's Rock).
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/items.ts —
    //   razorfang.onModifyMove checks identical affectedByRazorFang list
    case "razor-fang": {
      const moveId = context.move?.id;
      if (!moveId || !KINGS_ROCK_ELIGIBLE_MOVES.has(moveId)) return NO_ACTIVATION;
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
    //
    // Magic Guard: prevents the Life Orb recoil chip-damage (the 1.3x boost still applies
    // because that is handled in calculateGen4Damage, not here).
    // Source: Bulbapedia — Magic Guard: "prevents all indirect damage"
    // Source: Showdown Gen 4 — Magic Guard prevents Life Orb self-damage
    // Fix for issue #549: previous code emitted chip-damage even for Magic Guard holders.
    case "life-orb": {
      if (pokemon.ability === "magic-guard") return NO_ACTIVATION;
      const damageDealt = context.damage ?? 0;
      if (damageDealt > 0) {
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
