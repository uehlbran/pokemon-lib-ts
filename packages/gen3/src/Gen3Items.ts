import type { ItemContext, ItemEffect, ItemResult } from "@pokemon-lib-ts/battle";
import type { BattleStat, MoveData, MoveEffect } from "@pokemon-lib-ts/core";

/** No-op result for when an item doesn't activate. */
const NO_ACTIVATION: ItemResult = {
  activated: false,
  effects: [],
  messages: [],
};

/**
 * Type-boosting items: map from item ID to the move type it boosts.
 * Each grants a 1.1x (10%) damage increase for moves of the matching type.
 *
 * Source: pret/pokeemerald src/data/items.h — HoldEffect HOLD_EFFECT_*_POWER
 */
export const TYPE_BOOST_ITEMS: Readonly<Record<string, string>> = {
  charcoal: "fire",
  "mystic-water": "water",
  "miracle-seed": "grass",
  magnet: "electric",
  "twisted-spoon": "psychic",
  "spell-tag": "ghost",
  "never-melt-ice": "ice",
  "black-belt": "fighting",
  "poison-barb": "poison",
  "soft-sand": "ground",
  "sharp-beak": "flying",
  "hard-stone": "rock",
  "silver-powder": "bug",
  "dragon-fang": "dragon",
  "black-glasses": "dark",
  "metal-coat": "steel",
  "silk-scarf": "normal",
};

/**
 * Apply a Gen 3 held item effect at the given trigger point.
 *
 * Gen 3 held items follow the RSE item system. Key differences from Gen 2:
 * - Modern berry names (Sitrus Berry, Oran Berry, Lum Berry, etc.)
 * - Sitrus Berry heals flat 30 HP (NOT percentage — that's Gen 4+)
 * - Focus Band is reusable (NOT consumed)
 * - King's Rock has a 10% flinch chance (Gen 2 was 30/256 ~11.72%)
 * - Shell Bell heals 1/8 of damage dealt (permanent, not consumed)
 * - Choice Band boosts Attack by 1.5x (handled inline in damage calc)
 * - Type-boosting items give 1.1x damage (handled inline in damage calc)
 *
 * @param trigger - When the item check occurs ("end-of-turn", "on-damage-taken", "on-hit")
 * @param context - The item context (pokemon, state, rng, etc.)
 * @returns The item result
 *
 * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects
 */
export function applyGen3HeldItem(trigger: string, context: ItemContext): ItemResult {
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
    case "stat-boost-between-turns":
      return handleStatBoostBetweenTurns(item, context);
    default:
      return NO_ACTIVATION;
  }
}

/**
 * Handle end-of-turn item effects.
 *
 * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects (ITEMEFFECT_ON_RESIDUAL)
 */
function handleEndOfTurn(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
  const status = pokemon.pokemon.status;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Leftovers: Heal 1/16 max HP each turn, NOT consumed
    // Source: pret/pokeemerald HOLD_EFFECT_LEFTOVERS — heals 1/16 every turn
    case "leftovers": {
      const healAmount = Math.max(1, Math.floor(maxHp / 16));
      return {
        activated: true,
        effects: [{ type: "heal", target: "self", value: healAmount }],
        messages: [`${pokemonName}'s Leftovers restored its HP!`],
      };
    }

    // Sitrus Berry: Restore flat 30 HP when HP <= 50% max HP (consumed)
    // Source: pret/pokeemerald HOLD_EFFECT_RESTORE_HP — flat 30 HP in Gen 3 (NOT % based)
    // Gen 4+ changed this to 25% max HP; Gen 3 uses the flat value from the item data (30)
    case "sitrus-berry": {
      if (currentHp <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 30 },
            { type: "consume", target: "self", value: "sitrus-berry" },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored 30 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Restore 10 HP when HP <= 50% max HP (consumed)
    // Source: pret/pokeemerald HOLD_EFFECT_RESTORE_HP — 10 HP flat
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_STATUS — cures all status conditions
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_PAR
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_SLP
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_PSN
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_BRN
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_FRZ
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_CONFUSION
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
    // Source: pret/pokeemerald HOLD_EFFECT_CURE_ATTRACT
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

/**
 * Handle on-damage-taken item effects.
 *
 * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects (ITEMEFFECT_ON_DAMAGE)
 */
function handleOnDamageTaken(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const currentHp = pokemon.pokemon.currentHp;
  const damage = context.damage ?? 0;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // Focus Band: 10% chance to survive with 1 HP when damage would KO
    // Source: pret/pokeemerald HOLD_EFFECT_FOCUS_BAND — 10% (1/10) activation rate
    // NOTE: Focus Band is NOT consumed in Gen 3 (reusable)
    case "focus-band": {
      if (currentHp - damage <= 0) {
        // Gen 3 Focus Band: 10% chance (pokeemerald uses 10/100)
        // Source: pret/pokeemerald — FOCUS_BAND_CHANCE = 10
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
    // Source: pret/pokeemerald — berry check after damage
    case "sitrus-berry": {
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
      const hpAfterDamage = currentHp - damage;
      if (hpAfterDamage > 0 && hpAfterDamage <= Math.floor(maxHp / 2)) {
        return {
          activated: true,
          effects: [
            { type: "heal", target: "self", value: 30 },
            { type: "consume", target: "self", value: "sitrus-berry" },
          ],
          messages: [`${pokemonName}'s Sitrus Berry restored 30 HP!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Oran Berry: Also activates when HP drops to <= 50% after damage
    // Source: pret/pokeemerald — berry check after damage
    case "oran-berry": {
      const maxHp = pokemon.pokemon.calculatedStats?.hp ?? currentHp;
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

/**
 * Handle on-hit item effects (attacker's perspective, after dealing damage).
 *
 * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects (ITEMEFFECT_ON_HIT)
 */
function handleOnHit(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // King's Rock: 10% flinch chance on damaging moves that don't already have a flinch effect.
    // Source: pret/pokeemerald src/battle_util.c HOLD_EFFECT_FLINCH — 10% chance in Gen 3
    // (Gen 2 was 30/256 ~11.72%; Gen 3 simplified to flat 10%)
    // Source: Bulbapedia — "King's Rock only activates on moves that do not already have
    //   a chance to flinch."
    case "kings-rock": {
      // Only apply flinch for moves that don't already have a flinch effect
      // Source: pret/pokeemerald — King's Rock checked only when move has no inherent flinch
      const move = context.move;
      if (move && moveHasInherentFlinch(move)) {
        return NO_ACTIVATION;
      }
      if (context.rng.chance(0.1)) {
        return {
          activated: true,
          effects: [{ type: "flinch", target: "opponent" }],
          messages: [`${pokemonName}'s King's Rock caused flinching!`],
        };
      }
      return NO_ACTIVATION;
    }

    // Shell Bell: Heal 1/8 of damage dealt (NOT consumed — permanent item)
    // Source: pret/pokeemerald HOLD_EFFECT_SHELL_BELL — heals 1/8 of damage dealt
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

    default:
      return NO_ACTIVATION;
  }
}

/**
 * Check if a move has an inherent flinch chance (e.g., Bite, Headbutt, Air Slash).
 * King's Rock only applies to moves that do NOT already have a flinch effect.
 *
 * Source: pret/pokeemerald src/battle_util.c — King's Rock checked only when move has no flinch
 * Source: Bulbapedia — "King's Rock will not activate on moves that already have
 *   a chance of flinching."
 */
function moveHasInherentFlinch(move: MoveData): boolean {
  if (!move.effect) return false;
  return checkEffectForFlinch(move.effect);
}

/**
 * Recursively check a MoveEffect for a flinch volatile status.
 */
function checkEffectForFlinch(effect: NonNullable<MoveData["effect"]>): boolean {
  if (effect.type === "volatile-status" && effect.status === "flinch") {
    return true;
  }
  if (effect.type === "multi") {
    return effect.effects.some((e: MoveEffect) => checkEffectForFlinch(e));
  }
  return false;
}

/**
 * Handle stat-boost-between-turns item effects.
 *
 * Source: pret/pokeemerald src/battle_util.c ItemBattleEffects (ITEMEFFECT_ON_STAT_BOOST)
 */
function handleStatBoostBetweenTurns(item: string, context: ItemContext): ItemResult {
  const pokemon = context.pokemon;
  const pokemonName = pokemon.pokemon.nickname ?? `Pokemon #${pokemon.pokemon.speciesId}`;

  switch (item) {
    // White Herb: consumed on first stat decrease, restoring all lowered stats to 0 stages.
    // Source: pret/pokeemerald src/battle_util.c HOLD_EFFECT_RESTORE_STATS
    // Source: Bulbapedia — "White Herb restores any lowered stat stages to 0 when held.
    //   It is consumed after use."
    case "white-herb": {
      const statNames: BattleStat[] = [
        "attack",
        "defense",
        "spAttack",
        "spDefense",
        "speed",
        "accuracy",
        "evasion",
      ];
      let anyLowered = false;
      for (const stat of statNames) {
        const stage = pokemon.statStages[stat];
        if (stage !== undefined && stage < 0) {
          anyLowered = true;
          pokemon.statStages[stat] = 0;
        }
      }
      if (anyLowered) {
        return {
          activated: true,
          effects: [{ type: "consume", target: "self", value: "white-herb" }],
          messages: [`${pokemonName}'s White Herb restored its stats!`],
        };
      }
      return NO_ACTIVATION;
    }

    default:
      return NO_ACTIVATION;
  }
}
