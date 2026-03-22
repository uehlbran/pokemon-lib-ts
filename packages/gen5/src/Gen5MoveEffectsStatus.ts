/**
 * Gen 5 status and utility move effect handlers.
 *
 * Implements Gen 5-specific behavior for status/utility moves:
 *   - Heal Pulse: heals target by 50% (ceil); Gen 5 has no Mega Launcher boost
 *   - Aromatherapy: cures status for entire team (no Soundproof check in Gen 5)
 *   - Heal Bell: cures status for entire team (no Soundproof check in Gen 5)
 *   - Soak: changes target to pure Water type (no Water-type failure check in Gen 5)
 *   - Incinerate: destroys target's Berry only (not Gems; Gen 6+ adds Gems)
 *   - Bestow: gives user's item to target (fails if user has no item or target has one)
 *   - Entrainment: replaces target's ability with user's ability
 *   - Round: base power doubles if an ally used Round earlier this turn
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts (base definitions)
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Target abilities that block Entrainment.
 *
 * Source: Showdown data/moves.ts entrainment.onTryHit:
 *   target.getAbility().flags['cantsuppress'] || target.ability === 'truant'
 *
 * In Gen 5, the cantsuppress flag applies to Multitype and Zen Mode.
 * Truant is checked separately (target can't receive Truant).
 * Source: Bulbapedia -- Entrainment: "Fails if target has Truant, Multitype, or Zen Mode"
 */
export const ENTRAINMENT_TARGET_BLOCKED: ReadonlySet<string> = new Set([
  "multitype",
  "zen-mode",
  "truant",
]);

/**
 * Source abilities that block Entrainment (user cannot give away these abilities).
 *
 * Source: Showdown data/moves.ts entrainment.onTryHit:
 *   source.getAbility().flags['noentrain']
 *
 * In Gen 5, the noentrain flag applies to: Flower Gift, Forecast, Illusion,
 * Imposter, Trace, Zen Mode.
 * Source: Bulbapedia -- Entrainment: "Fails if the user has Flower Gift,
 *   Forecast, Illusion, Imposter, Trace, or Zen Mode"
 */
export const ENTRAINMENT_SOURCE_BLOCKED: ReadonlySet<string> = new Set([
  "flower-gift",
  "forecast",
  "illusion",
  "imposter",
  "trace",
  "zen-mode",
]);

// ---------------------------------------------------------------------------
// Berry check helper
// ---------------------------------------------------------------------------

/**
 * Checks whether an item ID represents a Berry.
 *
 * Uses a simple naming convention check (all Berry item IDs end with "-berry").
 * This matches Showdown's isBerry property on item objects.
 *
 * Source: Showdown data/items.ts -- Berry items all have `isBerry: true`
 */
export function isBerry(itemId: string | null | undefined): boolean {
  if (!itemId) return false;
  return itemId.endsWith("-berry");
}

// ---------------------------------------------------------------------------
// Helper: empty result
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

// ---------------------------------------------------------------------------
// Individual Move Handlers
// ---------------------------------------------------------------------------

/**
 * Gen 5 Heal Pulse: heals the target by 50% of its max HP.
 *
 * In Gen 5, Heal Pulse always heals 50% (using Math.ceil).
 * The Mega Launcher boost (75%) was introduced in Gen 6 and does not apply here.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 356-362:
 *   healpulse: { onHit(target, source) {
 *     const success = !!this.heal(Math.ceil(target.baseMaxhp * 0.5));
 *   }}
 *
 * Note: Uses Math.ceil, not Math.round or Math.floor.
 */
function handleHealPulse(ctx: MoveEffectContext): MoveEffectResult {
  const targetMaxHp = ctx.defender.pokemon.calculatedStats?.hp ?? ctx.defender.pokemon.currentHp;
  // Source: Showdown gen5/moves.ts healpulse -- Math.ceil(target.baseMaxhp * 0.5)
  // Source: Bulbapedia -- "Heal Pulse restores up to half of the target's maximum HP"
  // Uses defenderHealAmount (not healAmount) because Heal Pulse heals the TARGET, not the user.
  // Source: Showdown data/moves.ts -- healPulse: { target: 'normal', heal: [1, 2] }
  const healAmount = Math.ceil(targetMaxHp * 0.5);

  return makeResult({
    defenderHealAmount: healAmount,
    messages: [],
  });
}

/**
 * Gen 5 Aromatherapy: cures status conditions for the user's entire team.
 *
 * In Gen 5, Aromatherapy cures ALL team members regardless of Soundproof.
 * (Gen 6+ respects Soundproof for allies with that ability.)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 18-25:
 *   aromatherapy: { onHit(target, source) {
 *     this.add('-activate', source, 'move: Aromatherapy');
 *     const allies = [...target.side.pokemon, ...target.side.allySide?.pokemon || []];
 *     for (const ally of allies) { ally.cureStatus(); }
 *   }}
 *
 * Note: No Soundproof check -- cures all allies unconditionally.
 */
function handleAromatherapy(_ctx: MoveEffectContext): MoveEffectResult {
  // Aromatherapy cures status for the ENTIRE TEAM (all benched allies too),
  // not just the active Pokemon. Uses teamStatusCure (not statusCuredOnly).
  // Source: Showdown gen5/moves.ts -- cures ALL allies, no ability check
  // Source: Bulbapedia -- "Aromatherapy cures the status conditions of all Pokemon on the user's team"
  // Source: Showdown data/moves.ts -- aromatherapy: { target: 'allyTeam' }
  return makeResult({
    teamStatusCure: { side: "attacker" },
    messages: ["A soothing aroma wafted through the area!"],
  });
}

/**
 * Gen 5 Heal Bell: cures status conditions for the user's entire team.
 *
 * In Gen 5, Heal Bell cures ALL team members regardless of Soundproof.
 * (Gen 6+ respects Soundproof for allies with that ability.)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 345-354:
 *   healbell: { onHit(target, source) {
 *     this.add('-activate', source, 'move: Heal Bell');
 *     const allies = [...target.side.pokemon, ...target.side.allySide?.pokemon || []];
 *     for (const ally of allies) { ally.cureStatus(); }
 *   }}
 *
 * Note: No Soundproof check -- cures all allies unconditionally.
 */
function handleHealBell(_ctx: MoveEffectContext): MoveEffectResult {
  // Heal Bell cures status for the ENTIRE TEAM (all benched allies too),
  // not just the active Pokemon. Uses teamStatusCure (not statusCuredOnly).
  // Source: Showdown gen5/moves.ts -- cures ALL allies, no ability check
  // Source: Bulbapedia -- "Heal Bell cures the status conditions of all Pokemon in the user's party"
  // Source: Showdown data/moves.ts -- healbell: { target: 'allyTeam' }
  return makeResult({
    teamStatusCure: { side: "attacker" },
    messages: ["A bell chimed!"],
  });
}

/**
 * Gen 5 Soak: changes the target's type to pure Water.
 *
 * In Gen 5, Soak does NOT fail if the target is already a pure Water type.
 * This is different from Gen 6+, which checks `target.getTypes().join() === 'Water'`
 * before calling `setType`.
 *
 * Soak fails only if the target has a form-locking ability (Multitype, RKS System, etc.)
 * or if `setType` fails for some other reason.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 847-856:
 *   soak: { onHit(target) {
 *     if (!target.setType('Water')) { this.add('-fail', target); return null; }
 *     this.add('-start', target, 'typechange', 'Water');
 *   }}
 *
 * Note: No `target.getTypes().join() === 'Water'` check (Gen 6+ only).
 */
function handleSoak(ctx: MoveEffectContext): MoveEffectResult {
  // In Gen 5, Soak only fails if setType fails (form-locking abilities).
  // We check for Multitype which is the main blocker in Gen 5.
  // Source: Showdown gen5/moves.ts soak -- no Water-type pre-check
  if (ctx.defender.ability === "multitype") {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  return makeResult({
    typeChange: { target: "defender", types: ["water"] as readonly PokemonType[] },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"} transformed into the Water type!`],
  });
}

/**
 * Gen 5 Incinerate: destroys the target's held Berry.
 *
 * In Gen 5, Incinerate ONLY destroys Berries.
 * Gen 6+ expanded this to also destroy Gems.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 467-475:
 *   incinerate: { basePower: 30, onHit(pokemon, source) {
 *     const item = pokemon.getItem();
 *     if (item.isBerry && pokemon.takeItem(source)) {
 *       this.add('-enditem', pokemon, item.name, '[from] move: Incinerate');
 *     }
 *   }}
 *
 * Note: Only checks `item.isBerry`, NOT `item.isGem`. BP is 30 in Gen 5.
 */
function handleIncinerate(ctx: MoveEffectContext): MoveEffectResult {
  const targetItem = ctx.defender.pokemon.heldItem;
  // Source: Showdown gen5/moves.ts incinerate -- only destroys Berries
  if (isBerry(targetItem)) {
    // Destroy the Berry by setting heldItem to null via direct mutation.
    // This follows the same pattern as Knock Off in Gen5MoveEffectsBehavior.ts.
    const item = targetItem as string;
    ctx.defender.pokemon.heldItem = null;
    return makeResult({
      messages: [`${ctx.defender.pokemon.nickname ?? "The target"}'s ${item} was incinerated!`],
    });
  }

  // Item is not a Berry (or target has no item) -- no destruction occurs
  return makeResult({
    messages: [],
  });
}

/**
 * Gen 5 Bestow: gives the user's held item to the target.
 *
 * Fails if the user has no item, or the target already has an item.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 1281-1301:
 *   bestow: { onHit(target, source, move) {
 *     if (target.item) return false;
 *     const myItem = source.takeItem();
 *     if (!myItem) return false;
 *     ...target.setItem(myItem)
 *   }}
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 69-71:
 *   bestow: { flags: { protect: 1, mirror: 1, noassist: 1, failcopycat: 1 } }
 *   (only flag changes; inherits base behavior)
 */
function handleBestow(ctx: MoveEffectContext): MoveEffectResult {
  const userItem = ctx.attacker.pokemon.heldItem;
  const targetItem = ctx.defender.pokemon.heldItem;

  // Source: Showdown data/moves.ts bestow -- fails if target has item
  if (targetItem != null && targetItem !== "") {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  // Source: Showdown data/moves.ts bestow -- fails if user has no item
  if (userItem == null || userItem === "") {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  // Transfer item: user loses item, target gains it
  // Use itemTransfer to signal the engine
  return makeResult({
    itemTransfer: { from: "attacker", to: "defender" },
    messages: [
      `${ctx.attacker.pokemon.nickname ?? "The user"} gave its ${userItem} to ${ctx.defender.pokemon.nickname ?? "the target"}!`,
    ],
  });
}

/**
 * Gen 5 Entrainment: replaces the target's ability with the user's ability.
 *
 * Fails if:
 *   - Target already has the same ability as the user
 *   - Target has a blocked ability (Multitype, Zen Mode, Truant)
 *   - User has a blocked source ability (Flower Gift, Forecast, Illusion,
 *     Imposter, Trace, Zen Mode)
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 5033-5062:
 *   entrainment: { onTryHit(target, source) {
 *     if (target === source || target.volatiles['dynamax']) return false;
 *     if (target.ability === source.ability ||
 *       target.getAbility().flags['cantsuppress'] || target.ability === 'truant' ||
 *       source.getAbility().flags['noentrain']) return false;
 *   }}
 *
 * Note: No Dynamax check needed for Gen 5.
 */
function handleEntrainment(ctx: MoveEffectContext): MoveEffectResult {
  const sourceAbility = ctx.attacker.ability;
  const targetAbility = ctx.defender.ability;

  // Source: Showdown data/moves.ts entrainment -- fails if same ability
  if (targetAbility === sourceAbility) {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  // Source: Showdown data/moves.ts entrainment -- fails if target ability is blocked
  if (ENTRAINMENT_TARGET_BLOCKED.has(targetAbility)) {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  // Source: Showdown data/moves.ts entrainment -- fails if source ability is blocked
  if (ENTRAINMENT_SOURCE_BLOCKED.has(sourceAbility)) {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  // Success: replace target's ability with source's ability.
  // Source: Showdown data/moves.ts entrainment -- target.setAbility(source.ability)
  // Source: Bulbapedia -- "Entrainment changes the target's Ability to match the user's"
  return makeResult({
    abilityChange: { target: "defender", ability: sourceAbility },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"} acquired ${sourceAbility}!`],
  });
}

/**
 * Gen 5 Round: doubles base power if an ally used Round earlier this turn.
 *
 * Round is a sound-based special move that, in doubles, causes the ally's
 * Round to happen immediately after and at doubled power. In singles, the
 * doubling still applies if somehow the ally used Round first (rare).
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 16072-16093:
 *   round: { basePowerCallback(target, source, move) {
 *     if (move.sourceEffect === 'round') return move.basePower * 2;
 *     return move.basePower;
 *   }}
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 764-767:
 *   round: { flags: { protect: 1, mirror: 1, sound: 1, metronome: 1 } }
 *   (only flag changes; inherits base behavior)
 *
 * Since our architecture processes moves one at a time in the effect handler,
 * we check turn history for a prior Round usage by an ally.
 */
function handleRound(_ctx: MoveEffectContext): MoveEffectResult {
  // Round's base power doubling is handled in Gen5DamageCalc.calculateGen5Damage(),
  // not in the effect handler. The damage calc checks if an ally used Round this turn
  // and doubles the base power accordingly.
  // Source: Showdown data/moves.ts -- round.basePowerCallback
  return makeResult({
    messages: [],
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch table for Gen 5 status/utility move effects.
 *
 * Returns null if the move is not a recognized status/utility move,
 * allowing the caller to fall through to other move effect handlers
 * (e.g., BaseRuleset's default handler).
 *
 * @param ctx - Full move execution context
 * @returns MoveEffectResult if handled, or null if unrecognized
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 */
export function handleGen5StatusMove(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case "heal-pulse":
      return handleHealPulse(ctx);
    case "aromatherapy":
      return handleAromatherapy(ctx);
    case "heal-bell":
      return handleHealBell(ctx);
    case "soak":
      return handleSoak(ctx);
    case "incinerate":
      return handleIncinerate(ctx);
    case "bestow":
      return handleBestow(ctx);
    case "entrainment":
      return handleEntrainment(ctx);
    case "round":
      return handleRound(ctx);
    default:
      return null;
  }
}
