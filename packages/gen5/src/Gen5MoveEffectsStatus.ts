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
 *   - Simple Beam: sets target's ability to Simple
 *   - Worry Seed: sets target's ability to Insomnia (cures sleep)
 *   - Gastro Acid: suppresses target's ability
 *   - Role Play: user copies target's ability
 *   - Skill Swap: user and target exchange abilities
 *   - Round: base power doubles if an ally used Round earlier this turn
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts
 * Source: references/pokemon-showdown/data/moves.ts (base definitions)
 */

import {
  BATTLE_EFFECT_TARGETS,
  type MoveEffectContext,
  type MoveEffectResult,
} from "@pokemon-lib-ts/battle";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type PokemonType,
} from "@pokemon-lib-ts/core";
import { GEN5_ABILITY_IDS } from "./data/reference-ids.js";

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

/**
 * Abilities that cannot be suppressed (cantsuppress flag) in Gen 5.
 *
 * Used by Simple Beam, Worry Seed, Gastro Acid, and Role Play (source check).
 *
 * Source: Showdown data/abilities.ts -- abilities with flags.cantsuppress
 * In Gen 5, only Multitype and Zen Mode have this flag.
 */
export const GEN5_CANTSUPPRESS: ReadonlySet<string> = new Set(["multitype", "zen-mode"]);

/**
 * Target abilities that block Role Play (failroleplay flag) in Gen 5.
 *
 * Source: Showdown data/abilities.ts -- abilities with flags.failroleplay
 * Source: Showdown data/moves.ts roleplay.onTryHit -- target.getAbility().flags['failroleplay']
 */
export const GEN5_FAIL_ROLE_PLAY: ReadonlySet<string> = new Set([
  "flower-gift",
  "forecast",
  "illusion",
  "imposter",
  "multitype",
  "trace",
  "zen-mode",
]);

/**
 * Abilities that block Skill Swap (failskillswap flag) in Gen 5.
 *
 * Applies to BOTH source and target.
 *
 * Source: Showdown data/abilities.ts -- abilities with flags.failskillswap
 * Source: Showdown sim/battle.ts skillSwap -- sourceAbility.flags['failskillswap'] || targetAbility.flags['failskillswap']
 */
export const GEN5_FAIL_SKILL_SWAP: ReadonlySet<string> = new Set([
  "illusion",
  "imposter",
  "multitype",
  "wonder-guard",
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
 * Source: Showdown data/items.ts -- Berry items all have isBerry: true
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
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 18-25
 */
function handleAromatherapy(_ctx: MoveEffectContext): MoveEffectResult {
  return makeResult({
    teamStatusCure: { side: BATTLE_EFFECT_TARGETS.attacker },
    messages: ["A soothing aroma wafted through the area!"],
  });
}

/**
 * Gen 5 Heal Bell: cures status conditions for the user's entire team.
 *
 * In Gen 5, Heal Bell cures ALL team members regardless of Soundproof.
 * (Gen 6+ respects Soundproof for allies with that ability.)
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 345-354
 */
function handleHealBell(_ctx: MoveEffectContext): MoveEffectResult {
  return makeResult({
    teamStatusCure: { side: BATTLE_EFFECT_TARGETS.attacker },
    messages: ["A bell chimed!"],
  });
}

/**
 * Gen 5 Soak: changes the target's type to pure Water.
 *
 * In Gen 5, Soak does NOT fail if the target is already a pure Water type.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 847-856
 */
function handleSoak(ctx: MoveEffectContext): MoveEffectResult {
  if (ctx.defender.ability === "multitype") {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  return makeResult({
    typeChange: {
      target: BATTLE_EFFECT_TARGETS.defender,
      types: [CORE_TYPE_IDS.water] as readonly PokemonType[],
    },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"} transformed into the Water type!`],
  });
}

/**
 * Gen 5 Incinerate: destroys the target's held Berry.
 *
 * In Gen 5, Incinerate ONLY destroys Berries.
 * Gen 6+ expanded this to also destroy Gems.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 467-475
 */
function handleIncinerate(ctx: MoveEffectContext): MoveEffectResult {
  const targetItem = ctx.defender.pokemon.heldItem;
  if (isBerry(targetItem)) {
    const item = targetItem as string;
    return makeResult({
      itemChange: {
        target: BATTLE_EFFECT_TARGETS.defender,
        item: null,
      },
      messages: [`${ctx.defender.pokemon.nickname ?? "The target"}'s ${item} was incinerated!`],
    });
  }

  return makeResult({
    messages: [],
  });
}

/**
 * Gen 5 Bestow: gives the user's held item to the target.
 *
 * Fails if the user has no item, or the target already has an item.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 1281-1301
 */
function handleBestow(ctx: MoveEffectContext): MoveEffectResult {
  const userItem = ctx.attacker.pokemon.heldItem;
  const targetItem = ctx.defender.pokemon.heldItem;

  if (targetItem != null && targetItem !== "") {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  if (userItem == null || userItem === "") {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  return makeResult({
    itemTransfer: {
      from: BATTLE_EFFECT_TARGETS.attacker,
      to: BATTLE_EFFECT_TARGETS.defender,
    },
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
 * Source: references/pokemon-showdown/data/moves.ts lines 5033-5062
 */
function handleEntrainment(ctx: MoveEffectContext): MoveEffectResult {
  const sourceAbility = ctx.attacker.ability;
  const targetAbility = ctx.defender.ability;

  if (targetAbility === sourceAbility) {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  if (ENTRAINMENT_TARGET_BLOCKED.has(targetAbility)) {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  if (ENTRAINMENT_SOURCE_BLOCKED.has(sourceAbility)) {
    return makeResult({
      messages: ["But it failed!"],
    });
  }

  return makeResult({
    abilityChange: { target: BATTLE_EFFECT_TARGETS.defender, ability: sourceAbility },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"} acquired ${sourceAbility}!`],
  });
}

/**
 * Gen 5 Simple Beam: sets the target's ability to Simple.
 *
 * Fails if:
 *   - Target already has Simple
 *   - Target has Truant
 *   - Target has a cantsuppress ability (Multitype, Zen Mode)
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 17091-17114:
 *   simplebeam: { onTryHit(target) {
 *     if (target.getAbility().flags['cantsuppress'] || target.ability === 'truant' ||
 *       target.ability === 'simple') return false;
 *   }, onHit(target) { target.setAbility('simple'); }}
 *
 * Source: Bulbapedia -- "Simple Beam changes the target's Ability to Simple"
 */
function handleSimpleBeam(ctx: MoveEffectContext): MoveEffectResult {
  const targetAbility = ctx.defender.ability;

  // Source: Showdown data/moves.ts simplebeam.onTryHit -- target.ability === 'simple'
  if (targetAbility === GEN5_ABILITY_IDS.simple) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts simplebeam.onTryHit -- target.ability === 'truant'
  if (targetAbility === GEN5_ABILITY_IDS.truant) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts simplebeam.onTryHit -- cantsuppress flag
  if (GEN5_CANTSUPPRESS.has(targetAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts simplebeam.onHit -- target.setAbility('simple')
  return makeResult({
    abilityChange: { target: BATTLE_EFFECT_TARGETS.defender, ability: GEN5_ABILITY_IDS.simple },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"} acquired Simple!`],
  });
}

/**
 * Gen 5 Worry Seed: sets the target's ability to Insomnia.
 * If the target is asleep, it wakes up.
 *
 * Fails if:
 *   - Target already has Insomnia
 *   - Target has Truant
 *   - Target has a cantsuppress ability (Multitype, Zen Mode)
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 21837-21867:
 *   worryseed: { onTryHit(target) {
 *     if (target.getAbility().flags['cantsuppress'] || target.ability === 'truant' ||
 *       target.ability === 'insomnia') return false;
 *   }, onHit(target) {
 *     target.setAbility('insomnia');
 *     if (target.status === 'slp') target.cureStatus();
 *   }}
 *
 * Source: Bulbapedia -- "Worry Seed changes the target's Ability to Insomnia.
 *   If the target is sleeping, it will wake up."
 */
function handleWorrySeed(ctx: MoveEffectContext): MoveEffectResult {
  const targetAbility = ctx.defender.ability;

  // Source: Showdown data/moves.ts worryseed -- target.ability === 'insomnia'
  if (targetAbility === GEN5_ABILITY_IDS.insomnia) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts worryseed -- target.ability === 'truant'
  if (targetAbility === GEN5_ABILITY_IDS.truant) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts worryseed -- cantsuppress flag
  if (GEN5_CANTSUPPRESS.has(targetAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  const messages: string[] = [];
  const wokeTarget = ctx.defender.pokemon.status === CORE_STATUS_IDS.sleep;
  if (wokeTarget) {
    messages.push(`${ctx.defender.pokemon.nickname ?? "The target"} woke up!`);
  }

  messages.push(`${ctx.defender.pokemon.nickname ?? "The target"} acquired Insomnia!`);

  return makeResult({
    statusCuredOnly: wokeTarget ? { target: BATTLE_EFFECT_TARGETS.defender } : null,
    volatilesToClear: wokeTarget
      ? [{ target: BATTLE_EFFECT_TARGETS.defender, volatile: CORE_VOLATILE_IDS.sleepCounter }]
      : [],
    abilityChange: {
      target: BATTLE_EFFECT_TARGETS.defender,
      ability: GEN5_ABILITY_IDS.insomnia,
    },
    messages,
  });
}

/**
 * Gen 5 Gastro Acid: suppresses the target's ability.
 *
 * The target's original ability is stored in suppressedAbility and its active
 * ability is set to "" (empty string). The suppression is lifted on switch-out.
 *
 * Fails if:
 *   - Target has a cantsuppress ability (Multitype, Zen Mode)
 *   - Target's ability is already suppressed (suppressedAbility is non-null)
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 6653-6688:
 *   gastroacid: { volatileStatus: 'gastroacid',
 *     onTryHit(target) { if (target.getAbility().flags['cantsuppress']) return false; }}
 * Source: Gen4MoveEffects.ts lines 1517-1518 -- same suppressedAbility pattern
 */
function handleGastroAcid(ctx: MoveEffectContext): MoveEffectResult {
  const targetAbility = ctx.defender.ability;

  // Source: Showdown data/moves.ts gastroacid.onTryHit -- cantsuppress flag
  if (GEN5_CANTSUPPRESS.has(targetAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Gen4MoveEffects.ts -- if already suppressed, fail (idempotent)
  if (ctx.defender.suppressedAbility != null) {
    return makeResult({ messages: ["But it failed!"] });
  }

  return makeResult({
    abilitySuppress: {
      target: BATTLE_EFFECT_TARGETS.defender,
    },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"}'s ability was suppressed!`],
  });
}

/**
 * Gen 5 Role Play: user copies the target's ability.
 *
 * Fails if:
 *   - User and target have the same ability
 *   - Target has a failroleplay ability (Flower Gift, Forecast, Illusion,
 *     Imposter, Multitype, Trace, Zen Mode)
 *   - Source has a cantsuppress ability (cannot replace its own Multitype/Zen Mode)
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 15893-15915:
 *   roleplay: { onTryHit(target, source) {
 *     if (target.ability === source.ability) return false;
 *     if (target.getAbility().flags['failroleplay'] ||
 *       source.getAbility().flags['cantsuppress']) return false;
 *   }, onHit(target, source) { source.setAbility(target.ability); }}
 *
 * Source: Bulbapedia -- "Role Play copies the target's Ability, replacing the user's"
 */
function handleRolePlay(ctx: MoveEffectContext): MoveEffectResult {
  const sourceAbility = ctx.attacker.ability;
  const targetAbility = ctx.defender.ability;

  // Source: Showdown data/moves.ts roleplay.onTryHit -- same ability check
  if (sourceAbility === targetAbility) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts roleplay.onTryHit -- failroleplay flag on target
  if (GEN5_FAIL_ROLE_PLAY.has(targetAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts roleplay.onTryHit -- cantsuppress flag on source
  if (GEN5_CANTSUPPRESS.has(sourceAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown data/moves.ts roleplay.onHit -- source.setAbility(target.ability)
  // Uses abilityChange with target: attacker since only the user's ability changes.
  return makeResult({
    abilityChange: { target: BATTLE_EFFECT_TARGETS.attacker, ability: targetAbility },
    messages: [`${ctx.attacker.pokemon.nickname ?? "The user"} copied ${targetAbility}!`],
  });
}

/**
 * Gen 5 Skill Swap: exchanges the abilities of the user and the target.
 *
 * Fails if:
 *   - Either side has a failskillswap ability (Illusion, Imposter, Multitype,
 *     Wonder Guard, Zen Mode)
 *   - In Gen 5, fails if both have the same ability (Gen 6+ allows it)
 *
 * Source: references/pokemon-showdown/sim/battle.ts lines 1300-1324:
 *   skillSwap(source, target, sourceAbility, targetAbility) {
 *     if (sourceAbility.flags['failskillswap'] || targetAbility.flags['failskillswap']) return false;
 *     if (this.gen <= 5 && sourceAbility.id === targetAbility.id) return false;
 *     source.ability = targetAbility.id; target.ability = sourceAbility.id;
 *   }
 *
 * Uses direct mutation because abilityChange only supports a single target,
 * but Skill Swap changes both simultaneously.
 */
function handleSkillSwap(ctx: MoveEffectContext): MoveEffectResult {
  const sourceAbility = ctx.attacker.ability;
  const targetAbility = ctx.defender.ability;

  // Source: Showdown sim/battle.ts skillSwap -- failskillswap flag on source
  if (GEN5_FAIL_SKILL_SWAP.has(sourceAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown sim/battle.ts skillSwap -- failskillswap flag on target
  if (GEN5_FAIL_SKILL_SWAP.has(targetAbility)) {
    return makeResult({ messages: ["But it failed!"] });
  }

  // Source: Showdown sim/battle.ts skillSwap -- gen <= 5 same-ability check
  if (sourceAbility === targetAbility) {
    return makeResult({ messages: ["But it failed!"] });
  }

  return makeResult({
    abilitySwap: true,
    messages: [
      `${ctx.attacker.pokemon.nickname ?? "The user"} swapped abilities with ${ctx.defender.pokemon.nickname ?? "the target"}!`,
    ],
  });
}

/**
 * Gen 5 Round: doubles base power if an ally used Round earlier this turn.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 16072-16093
 */
function handleRound(_ctx: MoveEffectContext): MoveEffectResult {
  // Round's base power doubling is handled in Gen5DamageCalc.calculateGen5Damage(),
  // not in the effect handler.
  return makeResult({
    messages: [],
  });
}

function handleTelekinesis(ctx: MoveEffectContext): MoveEffectResult {
  if (
    ctx.defender.volatileStatuses.has(CORE_VOLATILE_IDS.telekinesis) ||
    ctx.state.gravity?.active
  ) {
    return makeResult({ messages: ["But it failed!"] });
  }

  return makeResult({
    volatileInflicted: CORE_VOLATILE_IDS.telekinesis,
    volatileData: { turnsLeft: 3 },
    messages: [`${ctx.defender.pokemon.nickname ?? "The target"} was hurled into the air!`],
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
    case "simple-beam":
      return handleSimpleBeam(ctx);
    case "worry-seed":
      return handleWorrySeed(ctx);
    case "gastro-acid":
      return handleGastroAcid(ctx);
    case "role-play":
      return handleRolePlay(ctx);
    case "skill-swap":
      return handleSkillSwap(ctx);
    case "round":
      return handleRound(ctx);
    case "telekinesis":
      return handleTelekinesis(ctx);
    default:
      return null;
  }
}
