/**
 * Gen 4 behavioral move handlers.
 *
 * Handles Gen 4 moves with behavioral overrides that require special logic:
 *   - Roost: heal 50% HP + temporarily remove Flying type for this turn
 *   - Knock Off: remove defender's held item (no damage boost in Gen 4)
 *   - Trick / Switcheroo: swap held items between attacker and defender
 *   - Natural Gift: type + power from held berry, berry consumed
 *   - Fling: throw held item for damage, item consumed
 *   - Pluck / Bug Bite: steal and eat target's berry after dealing damage
 *   - Sucker Punch: fails if target is not about to use a damaging move
 *   - Feint: only hits if target has Protect/Detect active
 *   - Focus Punch: fails if attacker took damage this turn
 *   - Doom Desire: schedule a Steel-type future attack 3 turns later
 *   - Magnet Rise: levitate for 5 turns, fails in Gravity or if already levitating
 *   - Thief / Covet: steal defender's item if attacker has none
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: pret/pokeplatinum — where decompiled
 */

import type { ActivePokemon, MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  CORE_MOVE_CATEGORIES,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type PokemonType,
  type PrimaryStatus,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { GEN4_ABILITY_IDS, GEN4_ITEM_IDS, GEN4_MOVE_IDS } from "./data/reference-ids";
import { getFlingPower, NATURAL_GIFT_TABLE } from "./Gen4ItemMoveData";

const ITEM_IDS = GEN4_ITEM_IDS;

// ---------------------------------------------------------------------------
// Internal mutable result type for berry effect application
// ---------------------------------------------------------------------------

type MutableResult = {
  statusInflicted: PrimaryStatus | null;
  volatileInflicted: VolatileStatus | null;
  statChanges: Array<{
    target: typeof BATTLE_EFFECT_TARGETS.attacker | typeof BATTLE_EFFECT_TARGETS.defender;
    stat: string;
    stages: number;
  }>;
  recoilDamage: number;
  healAmount: number;
  switchOut: boolean;
  messages: string[];
  statusCuredOnly?: {
    target: typeof BATTLE_EFFECT_TARGETS.attacker | typeof BATTLE_EFFECT_TARGETS.both;
  } | null;
  volatilesToClear?: Array<{
    target: typeof BATTLE_EFFECT_TARGETS.attacker | typeof BATTLE_EFFECT_TARGETS.defender;
    volatile: VolatileStatus;
  }>;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Helper: empty result
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<MoveEffectResult> & { messages: string[] },
): MoveEffectResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Private helper: apply berry effect to the attacker (Pluck/Bug Bite)
// ---------------------------------------------------------------------------

/**
 * Apply a stolen berry's effect to the attacker via Pluck/Bug Bite.
 * This simulates the attacker immediately eating the berry.
 * Only the most common berry effects are implemented.
 *
 * Source: Showdown sim/battle-actions.ts — Pluck/Bug Bite activate berry for user
 * Source: Bulbapedia — Pluck/Bug Bite: "eats it immediately, gaining its effects"
 */
function applyBerryEffectToAttacker(
  berry: string,
  attacker: ActivePokemon,
  result: MutableResult,
): void {
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;

  switch (berry) {
    case ITEM_IDS.oranBerry:
      result.healAmount = Math.min(10, maxHp - attacker.pokemon.currentHp);
      break;
    case ITEM_IDS.sitrusBerry:
      result.healAmount = Math.max(1, Math.floor(maxHp / 4));
      break;
    case ITEM_IDS.lumBerry: {
      // Lum Berry cures any primary status AND confusion
      // Source: pokeplatinum/src/battle/battle_lib.c BattleSystem_PluckBerry —
      //   PLUCK_EFFECT_ALL_RESTORE checks MON_CONDITION_ANY and VOLATILE_CONDITION_CONFUSION,
      //   queuing confusion-cure subscript when attacker has it
      if (attacker.pokemon.status) {
        result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
      }
      if (attacker.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)) {
        result.volatilesToClear = [
          ...(result.volatilesToClear ?? []),
          { target: BATTLE_EFFECT_TARGETS.attacker, volatile: CORE_VOLATILE_IDS.confusion },
        ];
      }
      break;
    }
    case ITEM_IDS.cheriBerry:
      if (attacker.pokemon.status === CORE_STATUS_IDS.paralysis) {
        result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
      }
      break;
    case ITEM_IDS.chestoBerry:
      if (attacker.pokemon.status === CORE_STATUS_IDS.sleep) {
        result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
      }
      break;
    case ITEM_IDS.pechaBerry:
      if (
        attacker.pokemon.status === CORE_STATUS_IDS.poison ||
        attacker.pokemon.status === CORE_STATUS_IDS.badlyPoisoned
      ) {
        result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
      }
      break;
    case ITEM_IDS.rawstBerry:
      if (attacker.pokemon.status === CORE_STATUS_IDS.burn) {
        result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
      }
      break;
    case ITEM_IDS.aspearBerry:
      if (attacker.pokemon.status === CORE_STATUS_IDS.freeze) {
        result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
      }
      break;
    case ITEM_IDS.persimBerry:
      if (attacker.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)) {
        result.volatilesToClear = [
          ...(result.volatilesToClear ?? []),
          {
            target: BATTLE_EFFECT_TARGETS.attacker,
            volatile: CORE_VOLATILE_IDS.confusion,
          },
        ];
      }
      break;
    case ITEM_IDS.leppaBerry:
      // Restore 10 PP to the first depleted move
      // Source: Showdown — Leppa Berry restores 10 PP
      break;
    // Stat pinch berries — boost stat immediately when eaten via Pluck/Bug Bite
    case ITEM_IDS.liechiBerry:
      result.statChanges.push({
        target: BATTLE_EFFECT_TARGETS.attacker,
        stat: CORE_STAT_IDS.attack,
        stages: 1,
      });
      break;
    case ITEM_IDS.ganlonBerry:
      result.statChanges.push({
        target: BATTLE_EFFECT_TARGETS.attacker,
        stat: CORE_STAT_IDS.defense,
        stages: 1,
      });
      break;
    case ITEM_IDS.salacBerry:
      result.statChanges.push({
        target: BATTLE_EFFECT_TARGETS.attacker,
        stat: CORE_STAT_IDS.speed,
        stages: 1,
      });
      break;
    case ITEM_IDS.petayaBerry:
      result.statChanges.push({
        target: BATTLE_EFFECT_TARGETS.attacker,
        stat: CORE_STAT_IDS.spAttack,
        stages: 1,
      });
      break;
    case ITEM_IDS.apicotBerry:
      result.statChanges.push({
        target: BATTLE_EFFECT_TARGETS.attacker,
        stat: CORE_STAT_IDS.spDefense,
        stages: 1,
      });
      break;
    default:
      // Many berries have no in-battle effect when consumed this way
      break;
  }
}

// ---------------------------------------------------------------------------
// Behavioral Move Handlers
// ---------------------------------------------------------------------------

function handleRoost(ctx: MoveEffectContext): MoveEffectResult {
  // Heal 50% max HP + temporarily remove Flying type for this turn
  // Source: Showdown Gen 4 — Roost heals 50% and removes Flying type
  // Source: Bulbapedia — Roost: the user temporarily loses its Flying type
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  // Heal Block: prevent HP recovery
  // Source: Showdown Gen 4 mod — heal-block volatile gates all healing
  if (attacker.volatileStatuses.has(CORE_VOLATILE_IDS.healBlock)) {
    return makeResult({ messages: [`${attackerName} is blocked from healing!`] });
  }

  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
  // Use the data's fraction if present (0.5), otherwise default to 0.5
  const healEffect = ctx.move.effect as { type: string; amount: number } | null;
  const healFraction = healEffect?.amount ?? 0.5;
  const healAmount = Math.max(1, Math.floor(maxHp * healFraction));

  if (attacker.types.includes(CORE_TYPE_IDS.flying)) {
    const newTypes = attacker.types.filter((t) => t !== CORE_TYPE_IDS.flying);
    return makeResult({
      healAmount,
      typeChange: {
        target: BATTLE_EFFECT_TARGETS.attacker,
        types:
          newTypes.length > 0
            ? (newTypes as readonly PokemonType[])
            : ([CORE_TYPE_IDS.normal] as const),
      },
      messages: [`${attackerName} landed and recovered health!`],
    });
  }

  return makeResult({
    healAmount,
    messages: [`${attackerName} landed and recovered health!`],
  });
}

function handleKnockOff(ctx: MoveEffectContext): MoveEffectResult {
  // Knock Off: remove defender's held item (no damage boost in Gen 4)
  // Source: Showdown Gen 4 — Knock Off removes defender's item, no damage boost in Gen 4
  // (Gen 5+ adds 50% damage boost)
  // Note: Directly mutates defender.pokemon.heldItem (consistent with Gen 3 pattern).
  // The itemKnockedOff flag prevents Trick/Switcheroo from re-giving an item.
  // Source: Showdown Gen 4 — itemKnockedOff flag suppresses item re-giving
  const { defender } = ctx;
  if (defender.pokemon.heldItem) {
    const defenderName = defender.pokemon.nickname ?? "The foe";
    // Sticky Hold blocks item removal from Knock Off
    // Source: pokeplatinum/src/battle/battle_script.c BtlCmd_TryKnockOff —
    //   if DEFENDING_MON.heldItem && Battler_IgnorableAbility(ABILITY_STICKY_HOLD) == TRUE,
    //   print "{0}'s {1} made {2} ineffective!" and don't remove item
    if (defender.ability === GEN4_ABILITY_IDS.stickyHold) {
      return makeResult({
        messages: [`${defenderName}'s Sticky Hold made Knock Off ineffective!`],
      });
    }
    const item = defender.pokemon.heldItem;
    defender.pokemon.heldItem = null;
    defender.itemKnockedOff = true;
    const result = makeResult({ messages: [`${defenderName} lost its ${item}!`] });
    // Unburden: if the defender had Unburden, set the volatile now that its item is gone
    // Source: Showdown Gen 4 mod — Unburden activates when item is knocked off
    if (
      defender.ability === GEN4_ABILITY_IDS.unburden &&
      !defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
    ) {
      defender.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
    }
    return result;
  }
  return makeResult({ messages: [] });
}

function handleTrickSwitcheroo(ctx: MoveEffectContext): MoveEffectResult {
  // Trick / Switcheroo: swap held items between attacker and defender.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Trick/Switcheroo swap items
  // Source: Bulbapedia — "The user swaps held items with the target"
  // Fails if: both have no item, target has Sticky Hold, either has Multitype,
  //   or either holds a Mail or Griseous Orb, or either had their item knocked off.
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const defenderName = defender.pokemon.nickname ?? "The foe";

  // Fail if either party had their item knocked off (Knock Off flag)
  // Source: Showdown Gen 4 — itemKnockedOff flag prevents Trick/Switcheroo from re-giving items
  if (attacker.itemKnockedOff || defender.itemKnockedOff) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Fail if neither Pokemon is holding an item
  // Source: Showdown Gen 4 — Trick fails if both have no item
  if (!attacker.pokemon.heldItem && !defender.pokemon.heldItem) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Fail if target has Sticky Hold
  // Source: Showdown data/abilities.ts — Sticky Hold blocks item removal
  // Source: Bulbapedia — Sticky Hold prevents item removal by the foe
  if (defender.ability === GEN4_ABILITY_IDS.stickyHold) {
    return makeResult({ messages: [`${defenderName}'s Sticky Hold made Trick fail!`] });
  }

  // Fail if either has Multitype (Arceus's plates are bound)
  // Source: Showdown Gen 4 — Trick fails if either has Multitype
  if (
    attacker.ability === GEN4_ABILITY_IDS.multitype ||
    defender.ability === GEN4_ABILITY_IDS.multitype
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Fail if either holds Griseous Orb (Giratina's form item cannot be tricked away)
  // Source: Showdown Gen 4 — Griseous Orb is unswappable (like plates under Multitype)
  // Source: Bulbapedia — Griseous Orb: cannot be traded, tricked, or otherwise removed
  if (
    attacker.pokemon.heldItem === ITEM_IDS.griseousOrb ||
    defender.pokemon.heldItem === ITEM_IDS.griseousOrb
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Perform the item swap
  // Source: Showdown Gen 4 — item swap is direct mutation
  const attackerItem = attacker.pokemon.heldItem;
  const defenderItem = defender.pokemon.heldItem;
  attacker.pokemon.heldItem = defenderItem;
  defender.pokemon.heldItem = attackerItem;

  const messages: string[] = [];
  if (attackerItem && defenderItem) {
    messages.push(`${attackerName} switched items with ${defenderName}!`);
  } else if (defenderItem) {
    messages.push(`${attackerName} obtained ${defenderItem} from ${defenderName}!`);
  } else if (attackerItem) {
    messages.push(`${attackerName} gave ${attackerItem} to ${defenderName}!`);
  }

  // Pre-mutation above (lines 341-344) already handles the swap correctly for both
  // symmetric (both have items) and asymmetric (one has item) cases.
  // Do NOT return itemTransfer — the engine's itemTransfer path only handles one-directional
  // transfers and would undo asymmetric swaps.
  // Source: Showdown sim/battle-actions.ts Gen 4 — Trick directly mutates items, no engine transfer
  const result = makeResult({ messages });

  // Unburden: if either Pokemon had an item and now doesn't, and has Unburden, activate it.
  // Source: Showdown Gen 4 mod — Unburden activates when item is lost via Trick/Switcheroo
  if (
    attackerItem &&
    !attacker.pokemon.heldItem &&
    attacker.ability === GEN4_ABILITY_IDS.unburden &&
    !attacker.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
  ) {
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
  }
  if (
    defenderItem &&
    !defender.pokemon.heldItem &&
    defender.ability === GEN4_ABILITY_IDS.unburden &&
    !defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
  ) {
    defender.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
  }

  return result;
}

function handleNaturalGift(ctx: MoveEffectContext): MoveEffectResult {
  // Natural Gift: type + power determined by held berry, berry consumed after use.
  // Fails if user has no held item, held item is not a berry, user has Klutz, or Embargo.
  // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Natural_Gift_(move)
  // Source: Showdown sim/battle-actions.ts Gen 4 — Natural Gift type/power lookup
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const heldItem = attacker.pokemon.heldItem;
  // Fails if no held item, not a berry, Klutz, or Embargo
  if (
    !heldItem ||
    !NATURAL_GIFT_TABLE[heldItem] ||
    attacker.ability === GEN4_ABILITY_IDS.klutz ||
    attacker.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }
  const berryData = NATURAL_GIFT_TABLE[heldItem];
  // Unburden: if attacker has Unburden, set the volatile before the engine consumes the item.
  // The ruleset speed calc checks both the volatile AND !heldItem, so this is safe to set early.
  // Source: Bulbapedia Unburden — "Doubles the Pokemon's Speed stat when its held item is used or lost"
  // Source: Showdown Gen 4 mod — Unburden activates on any item loss
  if (
    attacker.ability === GEN4_ABILITY_IDS.unburden &&
    !attacker.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
  ) {
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
  }
  // Do NOT set customDamage — damage should go through the normal damage calc path.
  // The engine calls calculateDamage() before executeMoveEffect(), so the move's
  // base power and type in the data determine the damage output.
  // Source: Showdown Gen 4 — Natural Gift uses onModifyMove to set base power/type
  return makeResult({
    attackerItemConsumed: true,
    messages: [`${attackerName} used Natural Gift! (${berryData.type} / ${berryData.power} BP)`],
  });
}

function handleFling(ctx: MoveEffectContext): MoveEffectResult {
  // Fling: throw held item at target for damage based on item's Fling power, item consumed.
  // Fails if user has no held item, item has no Fling power, user has Klutz, or Embargo.
  // Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Fling_(move)
  // Source: Showdown sim/battle-actions.ts Gen 4 — Fling power lookup
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const heldItem = attacker.pokemon.heldItem;
  if (
    !heldItem ||
    attacker.ability === GEN4_ABILITY_IDS.klutz ||
    attacker.volatileStatuses.has(CORE_VOLATILE_IDS.embargo)
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }
  const flingPower = getFlingPower(heldItem);
  if (flingPower === 0) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Unburden: if attacker has Unburden, set the volatile before the engine consumes the item.
  // Source: Bulbapedia Unburden — "Doubles the Pokemon's Speed stat when its held item is used or lost"
  // Source: Showdown Gen 4 mod — Unburden activates on any item loss
  if (
    attacker.ability === GEN4_ABILITY_IDS.unburden &&
    !attacker.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
  ) {
    attacker.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
  }
  // Do NOT set customDamage — damage should go through the normal damage calc path.
  // The engine calls calculateDamage() before executeMoveEffect(), so the move's
  // base power in the data determines the damage output.
  // Source: Showdown Gen 4 — Fling uses onModifyMove to set base power
  return makeResult({
    attackerItemConsumed: true,
    messages: [`${attackerName} flung its ${heldItem}!`],
  });
}

function handlePluckBugBite(ctx: MoveEffectContext): MoveEffectResult {
  // Pluck / Bug Bite: after dealing damage, steal and activate target's berry.
  // These are damaging moves (effect: null in data) that consume the target's berry.
  // Source: Bulbapedia — Pluck: "steals the target's held Berry if it is holding one"
  // Source: Bulbapedia — Bug Bite: same mechanic as Pluck
  // Source: Showdown sim/battle-actions.ts Gen 4 — Pluck/Bug Bite berry steal
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const defenderName = defender.pokemon.nickname ?? "The foe";
  const defenderItem = defender.pokemon.heldItem;
  // Fail if defender has Sticky Hold (prevents item removal)
  // Source: Showdown Gen 4 — Sticky Hold blocks Pluck/Bug Bite berry steal
  // Source: Bulbapedia — Sticky Hold: "Prevents other Pokemon from removing the holder's item"
  if (defender.ability === GEN4_ABILITY_IDS.stickyHold) {
    return makeResult({ messages: [] });
  }
  // Check if defender holds a berry (berry IDs end with "-berry")
  if (defenderItem?.endsWith("-berry")) {
    // Steal and consume the berry
    const stolenBerry = defenderItem;
    defender.pokemon.heldItem = null;
    // Apply the berry's effect to the attacker (simulate eating it)
    // For healing berries, we heal the attacker; for status berries, we cure attacker's status
    const result: MutableResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
    applyBerryEffectToAttacker(stolenBerry, attacker, result);
    result.messages.push(`${attackerName} stole and ate ${defenderName}'s ${stolenBerry}!`);
    // Unburden: if the defender had Unburden, set the volatile
    if (
      defender.ability === GEN4_ABILITY_IDS.unburden &&
      !defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
    ) {
      defender.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
    }
    return result as unknown as MoveEffectResult;
  }
  // Even if no berry was stolen, the move's damage already happened (effect: null)
  return makeResult({ messages: [] });
}

function handleSuckerPunch(ctx: MoveEffectContext): MoveEffectResult {
  // Sucker Punch: fails if the target is not about to use a damaging move this turn.
  // Sucker Punch has +1 priority so it normally resolves before the target acts.
  // The engine populates defenderSelectedMove in MoveEffectContext with the defender's
  // selected move and its category, allowing us to check directly.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Sucker Punch onTry: fails if
  //   target is not using a damaging move or has already moved
  // Source: Bulbapedia — "Sucker Punch will fail if the target does not select a
  //   move that deals damage, or if the target moves before the user."
  const { defender } = ctx;

  // If the defender already moved this turn, Sucker Punch fails (target acted first).
  // Source: Showdown Gen 4 — Sucker Punch fails if target already moved
  if (defender.movedThisTurn) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Check if the defender selected a move action this turn
  const defMove = ctx.defenderSelectedMove;
  if (!defMove) {
    // Defender is not using a move (switching, using item, etc.) — Sucker Punch fails
    return makeResult({ messages: ["But it failed!"] });
  }

  // Fail if the defender selected a status move (non-damaging)
  // Source: Showdown Gen 4 — Sucker Punch fails if target's move is status category
  if (defMove.category === CORE_MOVE_CATEGORIES.status) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // If we get here, Sucker Punch succeeds (damage already applied by engine)
  return makeResult({ messages: [] });
}

function handleFeint(ctx: MoveEffectContext): MoveEffectResult {
  // Feint: only hits if the target has Protect or Detect active.
  // If the target is not protecting, Feint fails. If they are protecting,
  // Feint lifts the protection and deals damage normally.
  // Note: Detect and Protect both set the "protect" volatile in our system,
  // so we only need to check for "protect".
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Feint: breaks Protect/Detect
  // Source: Bulbapedia — "Feint will fail if the target has not used Protect or
  //   Detect during the turn. If successful, it lifts the effects of those moves."
  const { defender } = ctx;
  const hasProtect = defender.volatileStatuses.has(CORE_VOLATILE_IDS.protect);

  if (!hasProtect) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Remove the protection volatile
  // Source: Showdown Gen 4 — Feint removes Protect/Detect volatile
  const defenderName = defender.pokemon.nickname ?? "The foe";
  return makeResult({
    volatilesToClear: [
      { target: BATTLE_EFFECT_TARGETS.defender, volatile: CORE_VOLATILE_IDS.protect },
    ],
    messages: [`${defenderName} fell for the feint!`],
  });
}

function handleFocusPunch(ctx: MoveEffectContext): MoveEffectResult {
  // Focus Punch: fails if the attacker took damage this turn before moving.
  // Focus Punch has -3 priority, so it always moves last. If the user was hit
  // by any damaging move before it could execute, Focus Punch fails.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Focus Punch: beforeTurn sets
  //   "focusing" message, onTry checks if user was hit
  // Source: Bulbapedia — "The user will lose its focus and be unable to attack
  //   if it is hit by a damaging move before it can execute Focus Punch."
  const { attacker } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  // If the attacker took damage this turn, Focus Punch fails
  // Source: Showdown Gen 4 — Focus Punch fails if pokemon.lastDamageTaken > 0
  if (attacker.lastDamageTaken > 0) {
    return makeResult({ messages: [`${attackerName} lost its focus and couldn't move!`] });
  }

  // Otherwise Focus Punch succeeds — damage was already applied by engine
  return makeResult({ messages: [] });
}

function handleDoomDesire(ctx: MoveEffectContext): MoveEffectResult {
  // Doom Desire: schedule a delayed 2-turn Steel-type future attack.
  // Identical pattern to Future Sight but with Steel type and 120 power.
  //
  // Source: Showdown sim/battle-actions.ts Gen 4 — Doom Desire: future attack
  // Source: Bulbapedia — "Doom Desire deals typeless damage 2 turns after being used.
  //   It has 120 base power and is Steel-type in Gen 4."
  // Note: In Gen 4, Future Sight and Doom Desire deal typeless damage at hit time
  //   (type chart is not applied). The type is stored for completeness.
  const { attacker, state } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const attackerSideIndex = state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === attacker.pokemon),
  );

  // Fail if there's already a future attack pending on the target's side
  // Source: Showdown Gen 4 — Doom Desire fails if a future attack is already set
  const targetSideIndex = attackerSideIndex === 0 ? 1 : 0;
  if (state.sides[targetSideIndex].futureAttack) {
    return makeResult({ messages: ["But it failed!"] });
  }

  return makeResult({
    futureAttack: {
      moveId: GEN4_MOVE_IDS.doomDesire,
      turnsLeft: 3,
      sourceSide: (attackerSideIndex === 0 ? 0 : 1) as 0 | 1,
    },
    messages: [`${attackerName} chose Doom Desire as its destiny!`],
  });
}

function handleMagnetRise(ctx: MoveEffectContext): MoveEffectResult {
  // Magnet Rise: apply "magnet-rise" volatile to user for 5 turns.
  // Fails if user is already under Gravity or already has Magnet Rise.
  // Source: Showdown Gen 4 mod — Magnet Rise sets volatile on self for 5 turns
  // Source: Bulbapedia — Magnet Rise: "The user levitates using electrically generated
  //   magnetism for five turns." Fails under Gravity.
  const { attacker, state } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  // Fail if Gravity is active
  if (state.gravity?.active) {
    return makeResult({ messages: ["But it failed!"] });
  }
  // Fail if already has Magnet Rise
  if (attacker.volatileStatuses.has(CORE_VOLATILE_IDS.magnetRise)) {
    return makeResult({ messages: ["But it failed!"] });
  }
  return makeResult({
    selfVolatileInflicted: CORE_VOLATILE_IDS.magnetRise,
    selfVolatileData: { turnsLeft: 5 },
    messages: [`${attackerName} levitated with electromagnetism!`],
  });
}

function handleThiefCovet(ctx: MoveEffectContext): MoveEffectResult {
  // Steal defender's item if user has no item
  // Source: Showdown Gen 4 — Thief/Covet takes held item
  const { attacker, defender } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const defenderName = defender.pokemon.nickname ?? "The foe";
  if (!attacker.pokemon.heldItem && defender.pokemon.heldItem) {
    // Fail if defender has Sticky Hold
    // Source: Showdown Gen 4 — Sticky Hold blocks Thief/Covet item steal
    // Source: Bulbapedia — Sticky Hold: "Prevents other Pokemon from removing the holder's item"
    if (defender.ability === GEN4_ABILITY_IDS.stickyHold) {
      return makeResult({ messages: [`${defenderName}'s Sticky Hold prevented item theft!`] });
    }
    return makeResult({
      itemTransfer: {
        from: BATTLE_EFFECT_TARGETS.defender,
        to: BATTLE_EFFECT_TARGETS.attacker,
      },
      messages: [`${attackerName} stole ${defenderName}'s ${defender.pokemon.heldItem}!`],
    });
  }
  return makeResult({ messages: [] });
}

// ---------------------------------------------------------------------------
// Public dispatcher
// ---------------------------------------------------------------------------

/**
 * Handle Gen 4 behavioral override moves.
 *
 * Returns a MoveEffectResult if this is a recognized behavioral move,
 * or null if not recognized (caller should try other handlers).
 *
 * @param ctx - Full move execution context
 * @returns MoveEffectResult if handled, or null if unrecognized
 */
export function handleGen4BehaviorMove(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case GEN4_MOVE_IDS.roost:
      return handleRoost(ctx);
    case GEN4_MOVE_IDS.knockOff:
      return handleKnockOff(ctx);
    case GEN4_MOVE_IDS.trick:
    case GEN4_MOVE_IDS.switcheroo:
      return handleTrickSwitcheroo(ctx);
    case GEN4_MOVE_IDS.naturalGift:
      return handleNaturalGift(ctx);
    case GEN4_MOVE_IDS.fling:
      return handleFling(ctx);
    case GEN4_MOVE_IDS.pluck:
    case GEN4_MOVE_IDS.bugBite:
      return handlePluckBugBite(ctx);
    case GEN4_MOVE_IDS.suckerPunch:
      return handleSuckerPunch(ctx);
    case GEN4_MOVE_IDS.feint:
      return handleFeint(ctx);
    case GEN4_MOVE_IDS.focusPunch:
      return handleFocusPunch(ctx);
    case GEN4_MOVE_IDS.doomDesire:
      return handleDoomDesire(ctx);
    case GEN4_MOVE_IDS.magnetRise:
      return handleMagnetRise(ctx);
    case GEN4_MOVE_IDS.thief:
    case GEN4_MOVE_IDS.covet:
      return handleThiefCovet(ctx);
    default:
      return null;
  }
}
