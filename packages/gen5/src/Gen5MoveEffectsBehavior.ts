/**
 * Gen 5 Move Behavioral Overrides
 *
 * These functions handle moves that BEHAVE differently in Gen 5 compared to
 * Gen 6+. This is distinct from data differences (base power, accuracy) which
 * are handled by the data JSON files.
 *
 * Key Gen 5 behavioral differences:
 *   - Defog: only clears TARGET side hazards + screens (Gen 6+ clears both)
 *   - Scald: thaws frozen USER, does NOT thaw frozen TARGET (Gen 6+ thaws target)
 *   - Toxic: Poison-types do NOT get guaranteed accuracy (Gen 6+ adds that)
 *   - Growth: +2 Atk/SpAtk in sun (data shows +1, behavioral override doubles it)
 *   - Powder moves: Grass types are NOT immune (Gen 6+ adds Grass immunity)
 *   - Knock Off: 20 BP flat, no damage bonus (Gen 6+ adds 1.5x bonus for item removal)
 *   - Thief/Covet: steal target's held item (identical to Gen 6+ but listed here for completeness)
 *   - String Shot: -1 Speed (Gen 7+ is -2)
 *   - Sweet Scent: -1 Evasion (Gen 6+ is -2)
 *   - Encore: exactly 3 turns (Gen 4 was random 4-8)
 *   - Taunt: exactly 3 turns (Gen 4 was random 3-5)
 *   - Disable: exactly 4 turns (Gen 4 was random 4-7)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 */

import {
  BATTLE_EFFECT_TARGETS,
  type MoveEffectContext,
  type MoveEffectResult,
} from "@pokemon-lib-ts/battle";
import {
  type BattleStat,
  CORE_ABILITY_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  type PrimaryStatus,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";

type MoveEffectBehaviorTarget =
  | typeof BATTLE_EFFECT_TARGETS.attacker
  | typeof BATTLE_EFFECT_TARGETS.defender;

type MoveEffectBehaviorMultiTarget = MoveEffectBehaviorTarget | typeof BATTLE_EFFECT_TARGETS.both;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Powder/spore moves that Grass types are immune to in Gen 6+, but NOT in Gen 5.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
 *   sleeppowder, stunspore, spore, poisonpowder, cottonspore all have
 *   empty `onTryHit() {}` overrides, removing the Gen 6+ Grass immunity.
 */
const GEN5_POWDER_MOVES: ReadonlySet<string> = new Set([
  "sleep-powder",
  "stun-spore",
  "spore",
  "poison-powder",
  "cotton-spore",
]);

// ---------------------------------------------------------------------------
// Powder Move Check
// ---------------------------------------------------------------------------

/**
 * Checks whether a powder move is blocked by the target's type in Gen 5.
 *
 * In Gen 5, powder moves are NOT blocked by Grass type.
 * This function always returns `false` for Grass types, unlike Gen 6+
 * where `isGen6PowderMoveBlocked` would return `true`.
 *
 * @param moveId - The move being used (e.g., "spore", "sleep-powder")
 * @param targetTypes - The defending Pokemon's current type(s)
 * @returns `false` always in Gen 5 (Grass types have no powder immunity)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
 *   All powder moves have empty `onTryHit() {}` overrides which remove
 *   the Gen 6+ `onTryHit(target) { if (target.hasType('Grass')) return null; }`
 */
export function isGen5PowderMoveBlocked(moveId: string, _targetTypes: string[]): boolean {
  // In Gen 5, even Grass types are hit by powder moves.
  // The function exists so that callers can use a uniform interface across gens.
  // The _targetTypes param is unused because there is no immunity check.
  if (!GEN5_POWDER_MOVES.has(moveId)) {
    return false; // Not a powder move at all; not blocked
  }
  // Gen 5: Grass types are NOT immune to powder moves
  // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- empty onTryHit overrides
  return false;
}

// ---------------------------------------------------------------------------
// Behavioral Override Handler
// ---------------------------------------------------------------------------

/**
 * Handles Gen 5 move-specific behavioral overrides.
 *
 * Returns a `MoveEffectResult` for moves with Gen 5-specific behavior,
 * or `null` if the move has no behavioral override and should fall through
 * to the standard data-driven move effect handler.
 *
 * @param ctx - Full move execution context (attacker, defender, move, state, rng)
 * @returns MoveEffectResult for overridden moves, or `null` for no override
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 */
export function handleGen5BehaviorMove(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case "defog":
      return handleDefog(ctx);
    case "scald":
      return handleScald(ctx);
    case "growth":
      return handleGrowth(ctx);
    case "knock-off":
      return handleKnockOff(ctx);
    case "thief":
    case "covet":
      return handleThiefCovet(ctx);
    case "rapid-spin":
      return handleRapidSpin(ctx);
    case "encore":
      return handleEncore(ctx);
    case "taunt":
      return handleTaunt(ctx);
    case "disable":
      return handleDisable(ctx);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Individual Move Handlers
// ---------------------------------------------------------------------------

/**
 * Gen 5 Defog: only clears hazards + screens from the TARGET's side.
 *
 * Gen 6+ Defog clears BOTH sides (target hazards + screens AND user side hazards).
 * Gen 5 Defog only clears the target side. Additionally, it lowers the target's
 * evasion by 1 stage (same as Gen 6+).
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- defog.onHit:
 *   removes reflect, lightscreen, safeguard, mist, spikes, toxicspikes, stealthrock
 *   from `pokemon.side` (the TARGET's side only), plus evasion -1.
 */
function handleDefog(_ctx: MoveEffectContext): MoveEffectResult {
  return makeResult({
    // Evasion -1 on target
    // Source: Showdown gen5/moves.ts -- `this.boost({evasion: -1})` on target
    statChanges: [
      { target: BATTLE_EFFECT_TARGETS.defender, stat: CORE_STAT_IDS.evasion, stages: -1 },
    ],
    // Clear hazards and screens from TARGET side only
    // Source: Showdown gen5/moves.ts -- removes from `pokemon.side` (target)
    clearSideHazards: BATTLE_EFFECT_TARGETS.defender,
    screensCleared: BATTLE_EFFECT_TARGETS.defender,
    messages: [],
  });
}

/**
 * Gen 5 Scald: thaws the USER if frozen, but does NOT thaw the TARGET.
 *
 * In Gen 6+, Scald also thaws a frozen target when it deals damage.
 * In Gen 5, the `thawsTarget: false` override means only the user is thawed.
 * The defrost flag on the move data handles user thawing (via MoveFlags.defrost).
 * The 30% burn chance is handled by the standard status-chance effect from data.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
 *   scald: `thawsTarget: false`
 */
function handleScald(ctx: MoveEffectContext): MoveEffectResult {
  const result: {
    statusInflicted: PrimaryStatus | null;
    statusCuredOnly: { target: MoveEffectBehaviorMultiTarget } | null;
    messages: string[];
    statChanges: Array<{ target: MoveEffectBehaviorTarget; stat: BattleStat; stages: number }>;
  } = {
    statusInflicted: null,
    statusCuredOnly: null,
    messages: [],
    statChanges: [],
  };

  // Thaw the USER if frozen (the defrost flag handles this in the engine,
  // but we also produce the result here for completeness)
  if (ctx.attacker.pokemon.status === CORE_STATUS_IDS.freeze) {
    result.statusCuredOnly = { target: BATTLE_EFFECT_TARGETS.attacker };
    result.messages.push(`${ctx.attacker.pokemon.nickname ?? "The attacker"} thawed out!`);
  }

  // 30% burn chance on target (from data-driven effect, not behavioral override)
  // This is handled by the standard effect system from moves.json, so we
  // only handle the Gen 5-specific part (no target thawing).

  return makeResult(result);
}

/**
 * Gen 5 Growth: +2 Atk / +2 SpAtk in sun, +1/+1 otherwise.
 *
 * The data file shows +1/+1 (base effect). In sun, this behavioral override
 * doubles the boost to +2/+2.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
 *   Growth in Gen 5 has `pp: 40` override but no onModifyMove override;
 *   the sun boost is handled in the base gen5 scripts (same as Gen 6+).
 * Source: Bulbapedia -- Growth: "In intense sunlight, the stat increases
 *   are doubled, raising both Attack and Special Attack by two stages."
 */
function handleGrowth(ctx: MoveEffectContext): MoveEffectResult {
  const isSunny = ctx.state.weather?.type === "sun" || ctx.state.weather?.type === "harsh-sun";

  // Source: Bulbapedia -- Growth: +1 Atk/SpAtk normally, +2 in sun
  const stages = isSunny ? 2 : 1;

  return makeResult({
    statChanges: [
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.attack, stages },
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.spAttack, stages },
    ],
    messages: [],
  });
}

/**
 * Gen 5 Knock Off: 20 BP, no damage bonus for item removal.
 *
 * In Gen 6+, Knock Off deals 1.5x damage if the target is holding an item.
 * In Gen 5, Knock Off is just a 20 BP move that removes the item with no bonus.
 * The base power is already correct in the data (20), but we ensure no
 * `onBasePower` bonus is applied.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
 *   knockoff: `basePower: 20, onBasePower() {}`
 *   The empty `onBasePower() {}` explicitly removes any base power bonus.
 */
function handleKnockOff(ctx: MoveEffectContext): MoveEffectResult {
  // Remove the target's held item (if any).
  // Direct mutation is required here because the engine's itemTransfer path only transfers
  // items between two different Pokemon — there is no engine-level "discard" path.
  // Gen 4 uses the same direct-mutation pattern (see Gen4MoveEffects.ts).
  // Source: references/pokemon-showdown/data/mods/gen5/moves.ts -- knockoff:
  //   item is removed via `target.takeItem()` which sets item to null.
  const hasItem = ctx.defender.pokemon.heldItem != null && ctx.defender.pokemon.heldItem !== "";
  if (hasItem && !ctx.defender.itemKnockedOff) {
    const item = ctx.defender.pokemon.heldItem as string;
    ctx.defender.pokemon.heldItem = null;
    ctx.defender.itemKnockedOff = true;

    // Unburden: if the target has Unburden, set the volatile to double Speed.
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem + onUpdate:
    //   activates when the Pokemon loses its item by any means (consumed, stolen, knocked off).
    // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is used or lost."
    if (
      ctx.defender.ability === CORE_ABILITY_IDS.unburden &&
      !ctx.defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
    ) {
      ctx.defender.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
    }

    return makeResult({
      messages: [`${ctx.defender.pokemon.nickname ?? "The defender"} lost its ${item}!`],
    });
  }

  return makeResult({ messages: [] });
}

/**
 * Gen 5 Thief / Covet: steal the target's held item after dealing damage.
 *
 * Thief (40 BP Dark physical) and Covet (60 BP Normal physical) share identical
 * steal logic: if the user has no held item and the target does, transfer the
 * target's item to the user. The steal only fires when the move deals damage
 * (onAfterHit, not onHit).
 *
 * Source: Showdown data/moves.ts -- thief.onAfterHit / covet.onAfterHit:
 *   `if (source.item || source.volatiles['gem']) return;`
 *   `let yourItem = target.takeItem(source);`
 *   `if (!yourItem) return;`
 *   `source.setItem(yourItem);`
 * Source: Bulbapedia -- Thief: "If the user is not holding an item and the
 *   target is, the user will steal the target's held item."
 */
function handleThiefCovet(ctx: MoveEffectContext): MoveEffectResult {
  // onAfterHit: only fires when damage > 0
  // Source: Showdown data/moves.ts -- thief/covet use onAfterHit callback
  if (ctx.damage <= 0) {
    return makeResult({ messages: [] });
  }

  // Cannot steal through a Substitute -- move hit the sub, not the Pokemon.
  // Source: Showdown sim/battle-actions.ts -- onAfterHit only fires when the target is hit directly.
  // brokeSubstitute means this hit destroyed the sub (still did not hit the Pokemon directly).
  if (
    ctx.brokeSubstitute ||
    (ctx.defender.volatileStatuses.has(CORE_VOLATILE_IDS.substitute) &&
      !ctx.move.flags.bypassSubstitute)
  ) {
    return makeResult({ messages: [] });
  }

  const userItem = ctx.attacker.pokemon.heldItem;
  const targetItem = ctx.defender.pokemon.heldItem;

  // User already has an item -- cannot steal.
  // Also blocked if the user consumed a Gem this move (gem-used volatile marks this).
  // Source: Showdown data/moves.ts -- `if (source.item || source.volatiles['gem']) return;`
  if (userItem != null && userItem !== "") {
    return makeResult({ messages: [] });
  }
  if (ctx.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.gemUsed as VolatileStatus)) {
    return makeResult({ messages: [] });
  }

  // Target has no item -- nothing to steal
  if (targetItem == null || targetItem === "") {
    return makeResult({ messages: [] });
  }

  const attackerName = ctx.attacker.pokemon.nickname ?? "The user";
  const defenderName = ctx.defender.pokemon.nickname ?? "the target";

  // Unburden: if the target has Unburden, set the volatile to double Speed.
  // Source: Showdown data/abilities.ts -- Unburden activates when item is lost by any means.
  // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is used or lost."
  if (
    ctx.defender.ability === CORE_ABILITY_IDS.unburden &&
    !ctx.defender.volatileStatuses.has(CORE_VOLATILE_IDS.unburden)
  ) {
    ctx.defender.volatileStatuses.set(CORE_VOLATILE_IDS.unburden, { turnsLeft: -1 });
  }

  return makeResult({
    itemTransfer: {
      from: BATTLE_EFFECT_TARGETS.defender,
      to: BATTLE_EFFECT_TARGETS.attacker,
    },
    messages: [`${attackerName} stole ${defenderName}'s ${targetItem}!`],
  });
}

/**
 * Gen 5 Rapid Spin: removes hazards, Leech Seed, and binding moves from the user's side.
 *
 * Rapid Spin is a 20 BP Normal-type physical contact move. After dealing damage,
 * it clears all hazards from the USER's side (not the target's side), removes
 * Leech Seed, and frees the user from binding/trapping moves.
 *
 * In Gen 5, Rapid Spin does NOT grant +1 Speed (that was added in Gen 8).
 *
 * Source: Showdown data/moves.ts -- rapidspin.onAfterHit
 *   removes: leechseed, spikes, toxicspikes, stealthrock, stickyweb, partiallytrapped
 *   Note: stickyweb did not exist in Gen 5 (introduced Gen 6)
 */
function handleRapidSpin(ctx: MoveEffectContext): MoveEffectResult {
  // Rapid Spin uses onAfterHit in Showdown, which only fires when the move
  // successfully deals damage. On type immunity (e.g., Normal vs Ghost), the move
  // deals 0 damage and the effect must not trigger.
  // Source: Showdown data/moves.ts -- rapidspin: onAfterHit (not onHit)
  //   onAfterHit fires only when damage > 0; immunity causes the move to fail before
  //   this callback executes.
  if (ctx.damage <= 0) {
    return makeResult({ messages: [] });
  }

  const messages: string[] = [];

  // Clear Leech Seed from the user
  // Source: Showdown data/moves.ts -- rapidspin: pokemon.removeVolatile('leechseed')
  const volatilesToClear: Array<{
    target: MoveEffectBehaviorTarget;
    volatile: VolatileStatus;
  }> = [];

  if (ctx.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.leechSeed)) {
    volatilesToClear.push({
      target: BATTLE_EFFECT_TARGETS.attacker,
      volatile: CORE_VOLATILE_IDS.leechSeed,
    });
    messages.push("The Leech Seed was removed!");
  }

  // Clear binding/trapping from the user
  // Source: Showdown data/moves.ts -- rapidspin: pokemon.removeVolatile('partiallytrapped')
  if (ctx.attacker.volatileStatuses.has(CORE_VOLATILE_IDS.bound)) {
    volatilesToClear.push({
      target: BATTLE_EFFECT_TARGETS.attacker,
      volatile: CORE_VOLATILE_IDS.bound,
    });
    messages.push("The binding was removed!");
  }

  return makeResult({
    // Clear all hazards from the USER's side
    // Source: Showdown data/moves.ts -- rapidspin: removes spikes/toxicspikes/stealthrock
    clearSideHazards: BATTLE_EFFECT_TARGETS.attacker,
    volatilesToClear: volatilesToClear.length > 0 ? volatilesToClear : undefined,
    messages,
  });
}

/**
 * Gen 5 Encore: locks the target into its last used move for exactly 3 turns.
 *
 * Gen 4 used random 4-8 turns. Gen 5 simplified to a fixed 3-turn duration.
 * Fails if the target has no last move or is already Encored.
 *
 * Source: Showdown data/mods/gen5/moves.ts -- encore: `condition.duration = 3`
 * Source: Bulbapedia -- "Encore lasts for 3 turns in Generation V onwards"
 */
function handleEncore(ctx: MoveEffectContext): MoveEffectResult {
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);

  // Fail if target has no last move or is already Encored
  // Source: Showdown data/moves.ts -- encore: onTry checks target.lastMove and volatile
  if (!defender.lastMoveUsed || defender.volatileStatuses.has(CORE_VOLATILE_IDS.encore)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Gen 5: exactly 3 turns (changed from Gen 4's random 4-8)
  // Source: Showdown data/mods/gen5/moves.ts -- encore: condition.duration = 3
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.encore,
    volatileData: { turnsLeft: 3, data: { moveId: defender.lastMoveUsed } },
    messages: [`${defenderName} got an encore!`],
  });
}

/**
 * Gen 5 Taunt: prevents the target from using status moves for exactly 3 turns.
 *
 * Gen 4 used random 3-5 turns. Gen 5 simplified to a fixed 3-turn duration.
 * Fails if the target is already Taunted.
 *
 * Source: Showdown data/mods/gen5/moves.ts -- taunt: `condition.duration = 3`
 * Source: Bulbapedia -- "Taunt lasts for 3 turns in Generation V onwards"
 */
function handleTaunt(ctx: MoveEffectContext): MoveEffectResult {
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);

  // Fail if target is already Taunted
  // Source: Showdown data/moves.ts -- taunt: volatileStatus check
  if (defender.volatileStatuses.has(CORE_VOLATILE_IDS.taunt)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Gen 5: exactly 3 turns (changed from Gen 4's random 3-5)
  // Source: Showdown data/mods/gen5/moves.ts -- taunt: condition.duration = 3
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.taunt,
    volatileData: { turnsLeft: 3 },
    messages: [`${defenderName} fell for the taunt!`],
  });
}

/**
 * Gen 5 Disable: disables the target's last used move for exactly 4 turns.
 *
 * Gen 4 used random 4-7 turns. Gen 5 simplified to a fixed 4-turn duration.
 * Fails if the target has no last move or is already Disabled.
 *
 * Source: Showdown data/mods/gen5/moves.ts -- disable: `condition.duration = 4`
 * Source: Bulbapedia -- "Disable lasts for 4 turns in Generation V onwards"
 */
function handleDisable(ctx: MoveEffectContext): MoveEffectResult {
  const { defender } = ctx;
  const defenderName = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);

  // Fail if target has no last move or is already Disabled
  // Source: Showdown data/moves.ts -- disable: onTry checks target.lastMove and volatile
  if (!defender.lastMoveUsed || defender.volatileStatuses.has(CORE_VOLATILE_IDS.disable)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Gen 5: exactly 4 turns (changed from Gen 4's random 4-7)
  // Source: Showdown data/mods/gen5/moves.ts -- disable: condition.duration = 4
  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.disable,
    volatileData: { turnsLeft: 4, data: { moveId: defender.lastMoveUsed } },
    messages: [`${defenderName}'s ${defender.lastMoveUsed} was disabled!`],
  });
}

// ---------------------------------------------------------------------------
// Toxic Accuracy Check
// ---------------------------------------------------------------------------

/**
 * Checks whether Toxic should have guaranteed accuracy for the attacker.
 *
 * In Gen 6+, Poison-type Pokemon using Toxic never miss.
 * In Gen 5, there is NO guaranteed accuracy for Poison-types using Toxic.
 * Toxic always uses its base 90% accuracy, regardless of the user's type.
 *
 * @param attackerTypes - The attacking Pokemon's current type(s)
 * @returns `false` always in Gen 5 (no type-based accuracy guarantee for Toxic)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts --
 *   toxic: `onPrepareHit() {}` -- empty override removes the Gen 6+
 *   `if (source.hasType('Poison')) return true` accuracy bypass.
 */
export function isToxicGuaranteedAccuracy(attackerTypes: readonly string[]): boolean {
  // In Gen 5, Poison-types do NOT get guaranteed Toxic accuracy.
  // The _attackerTypes param is unused because there is no type check.
  void attackerTypes; // suppress unused parameter warning
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a full MoveEffectResult with all required fields, using defaults
 * for any field not provided.
 */
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
