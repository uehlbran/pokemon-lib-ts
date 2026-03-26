/**
 * Gen 9 move effect handlers.
 *
 * Implements Gen 9-specific new moves:
 *   - Population Bomb: 10-hit multi-hit move with independent accuracy per hit
 *   - Rage Fist: base power scales with times the user has been hit
 *   - Make It Rain: 120 BP Steel special, user SpA -1 after damage
 *   - Revival Blessing: revives a fainted party member at 50% HP
 *   - Last Respects: base power scales with number of fainted allies
 *   - Shed Tail: sacrifice HP to create a Substitute, then forced switch
 *   - Tidy Up: removes all Substitutes and hazards from both sides, +1 Atk/Spe
 *   - Salt Cure: applies volatile that deals 1/8 max HP per turn (1/4 for Water/Steel)
 *   - Tera Blast (Stellar): self-debuff -1 Atk and -1 SpA
 *
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: Bulbapedia -- individual move pages
 */

import type {
  ActivePokemon,
  BattleSide,
  MoveEffectContext,
  MoveEffectResult,
} from "@pokemon-lib-ts/battle";
import { BATTLE_EFFECT_TARGETS } from "@pokemon-lib-ts/battle";
import {
  CORE_STAT_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { GEN9_MOVE_IDS } from "./data/reference-ids.js";

// ---------------------------------------------------------------------------
// Default empty result
// ---------------------------------------------------------------------------

function createBaseResult(): MoveEffectResult {
  return {
    statusInflicted: null,
    volatileInflicted: null,
    statChanges: [],
    recoilDamage: 0,
    healAmount: 0,
    switchOut: false,
    messages: [],
  };
}

// ---------------------------------------------------------------------------
// Population Bomb
// ---------------------------------------------------------------------------

/**
 * Population Bomb is a 10-hit multi-hit move with independent accuracy per hit.
 *
 * The multi-hit count (10) and multiaccuracy (true) are data-driven properties on
 * the move itself. The engine handles multi-hit processing when the move has a
 * `multihit` property. This handler returns an empty result since the engine
 * handles the hit loop and per-hit accuracy checks based on move data.
 *
 * Note: if the engine doesn't support multiaccuracy, each hit will use the first
 * accuracy check. Per-hit accuracy is an engine feature, not a move effect concern.
 *
 * Source: Showdown data/moves.ts:14112-14126
 *   multihit: 10, multiaccuracy: true
 */
export function handlePopulationBomb(_ctx: MoveEffectContext): MoveEffectResult {
  // Population Bomb always hits exactly 10 times (min === max === 10 in move data).
  // multiHitCount is the number of ADDITIONAL hits beyond the first, so 10 total = 9 extra.
  // Each hit independently checks accuracy (multiaccuracy: true).
  //
  // Source: Showdown data/moves.ts:14112-14126 -- multihit: 10, multiaccuracy: true
  return { ...createBaseResult(), multiHitCount: 9, checkPerHitAccuracy: true };
}

// ---------------------------------------------------------------------------
// Rage Fist
// ---------------------------------------------------------------------------

/**
 * Calculate the base power of Rage Fist.
 *
 * Power = min(350, 50 + 50 * timesAttacked).
 * timesAttacked persists through switches (stored on PokemonInstance).
 *
 * Source: Showdown data/moves.ts:15126-15128
 *   basePowerCallback(pokemon) { return Math.min(350, 50 + 50 * pokemon.timesAttacked); }
 *
 * @param timesAttacked - Number of times the Pokemon has been hit by a move
 * @returns The base power of Rage Fist (50-350)
 */
export function getRageFistPower(timesAttacked: number): number {
  return Math.min(350, 50 + 50 * timesAttacked);
}

/**
 * Handle Rage Fist move effect.
 *
 * Rage Fist is a Ghost/Physical move whose base power scales with the number
 * of times the user has been attacked. The base power modification is handled
 * in the damage calc (via getRageFistPower), so this handler returns an empty
 * result. The move effect itself has no secondary effects.
 *
 * Source: Showdown data/moves.ts:15122-15137 -- no secondary effects
 */
export function handleRageFist(_ctx: MoveEffectContext): MoveEffectResult {
  // Base power scaling is handled by the damage calc.
  // No secondary effects on the move itself.
  return createBaseResult();
}

// ---------------------------------------------------------------------------
// Make It Rain
// ---------------------------------------------------------------------------

/**
 * Handle Make It Rain move effect.
 *
 * Steel/Special, 120 BP, 100% accuracy, PP 5.
 * After dealing damage, the user's Special Attack drops by 1 stage.
 * Target: allAdjacentFoes (in doubles; singles just hits one target).
 *
 * Source: Showdown data/moves.ts:11339-11357
 *   self: { boosts: { spa: -1 } }
 */
export function handleMakeItRain(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  const attackerName = ctx.attacker.pokemon.nickname ?? "The attacking Pokemon";

  return {
    ...base,
    statChanges: [
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.spAttack, stages: -1 },
    ],
    messages: [`${attackerName}'s Special Attack fell!`],
  };
}

// ---------------------------------------------------------------------------
// Revival Blessing
// ---------------------------------------------------------------------------

/**
 * Check whether Revival Blessing can be used (at least one fainted ally exists).
 *
 * Source: Showdown data/moves.ts:15682-15685
 *   onTryHit(source) { if (!source.side.pokemon.filter(ally => ally.fainted).length) return false; }
 *
 * @param side - The user's side
 * @returns true if there are fainted party members to revive
 */
export function canUseRevivalBlessing(side: BattleSide): boolean {
  return side.team.some((p) => p.currentHp <= 0);
}

/**
 * Find the first fainted party member for Revival Blessing to revive.
 *
 * In an actual game, the player chooses which fainted member to revive.
 * In our simulation, we revive the first fainted member (deterministic).
 *
 * Source: Showdown data/moves.ts:15672-15691
 *   The move triggers a "switch protocol" to choose a fainted member.
 *
 * @param side - The user's side
 * @returns Index of the fainted member in the team array, or -1 if none
 */
export function findRevivalTarget(side: BattleSide): number {
  return side.team.findIndex((p) => p.currentHp <= 0);
}

/**
 * Calculate the HP to restore for Revival Blessing (50% of max HP, minimum 1).
 *
 * Source: Showdown side.ts -- Revival Blessing revives at 50% HP
 * Source: Bulbapedia -- "restores it to half of its maximum HP"
 *
 * @param maxHp - The fainted Pokemon's max HP
 * @returns HP amount to restore
 */
export function calculateRevivalHp(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 2));
}

/**
 * Handle Revival Blessing move effect.
 *
 * Normal/Status, PP 1, noPPBoosts.
 * Revives a fainted party member at 50% HP.
 * Fails if no party members are fainted.
 *
 * Source: Showdown data/moves.ts:15672-15691
 */
export function handleRevivalBlessing(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  const attackerSideIndex = ctx.state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === ctx.attacker.pokemon),
  );

  if (attackerSideIndex < 0) {
    return { ...base, messages: ["But it failed!"] };
  }

  const attackerSide = ctx.state.sides[attackerSideIndex];
  if (!attackerSide || !canUseRevivalBlessing(attackerSide)) {
    return { ...base, messages: ["But it failed!"] };
  }

  const targetIndex = findRevivalTarget(attackerSide);
  if (targetIndex < 0) {
    return { ...base, messages: ["But it failed!"] };
  }

  const targetPokemon = attackerSide.team[targetIndex];
  if (!targetPokemon) {
    return { ...base, messages: ["But it failed!"] };
  }

  // calculatedStats.hp is the Pokemon's max HP. It should always be populated
  // after the battle engine initializes stats. Fallback to 10 (a safe minimum)
  // if somehow missing to avoid reviving at 0 HP.
  // Source: Showdown sim/battle-actions.ts -- revival sets HP to floor(maxhp/2)
  const maxHp = targetPokemon.calculatedStats?.hp ?? 10;
  const healAmount = calculateRevivalHp(maxHp);

  // Revive the fainted Pokemon by restoring HP
  targetPokemon.currentHp = healAmount;
  // Clear status on revival (fainted Pokemon have no active status)
  targetPokemon.status = null;

  const pokeName = targetPokemon.nickname ?? "The Pokemon";
  return {
    ...base,
    messages: [`${pokeName} was revived and restored to health!`],
  };
}

// ---------------------------------------------------------------------------
// Last Respects
// ---------------------------------------------------------------------------

/**
 * Calculate the base power of Last Respects.
 *
 * Power = 50 + 50 * faintedAllies (no cap, unlike Rage Fist).
 *
 * Source: Showdown data/moves.ts:10473-10474
 *   basePowerCallback(pokemon, target, move) { return 50 + 50 * pokemon.side.totalFainted; }
 *
 * @param faintedAllies - Number of fainted allies on the user's side
 * @returns The base power of Last Respects (minimum 50, no cap)
 */
export function getLastRespectsPower(faintedAllies: number): number {
  return 50 + 50 * faintedAllies;
}

/**
 * Handle Last Respects move effect.
 *
 * Ghost/Physical, base power scales with number of fainted allies.
 * The base power modification is handled in the damage calc (via getLastRespectsPower),
 * so this handler returns an empty result. No secondary effects.
 *
 * Source: Showdown data/moves.ts:10469-10484 -- no secondary effects
 */
export function handleLastRespects(_ctx: MoveEffectContext): MoveEffectResult {
  // Base power scaling is handled by the damage calc.
  // No secondary effects on the move itself.
  return createBaseResult();
}

// ---------------------------------------------------------------------------
// Shed Tail
// ---------------------------------------------------------------------------

/**
 * Calculate the HP cost for Shed Tail.
 *
 * Cost = ceil(maxHP / 2).
 *
 * Source: Showdown data/moves.ts:16784
 *   this.directDamage(Math.ceil(target.maxhp / 2));
 *
 * @param maxHp - The user's maximum HP
 * @returns HP cost
 */
export function calculateShedTailCost(maxHp: number): number {
  return Math.ceil(maxHp / 2);
}

/**
 * Check whether Shed Tail can be used.
 *
 * Fails if:
 *   - User already has a Substitute
 *   - User's HP is at or below ceil(maxHP/2)
 *   - No allies available to switch to
 *
 * Source: Showdown data/moves.ts:16769-16781
 *   onTryHit(source):
 *     - if (!this.canSwitch(source.side)) fail
 *     - if (source.volatiles['substitute']) fail
 *     - if (source.hp <= Math.ceil(source.maxhp / 2)) fail
 *
 * @returns Object with `canUse` boolean and `reason` if it fails
 */
export function canUseShedTail(
  attacker: ActivePokemon,
  attackerSide: BattleSide,
): { canUse: boolean; reason?: string } {
  const maxHp = attacker.pokemon.calculatedStats?.hp ?? attacker.pokemon.currentHp;
  const cost = calculateShedTailCost(maxHp);

  // Check if attacker already has a Substitute
  if (attacker.substituteHp > 0) {
    return { canUse: false, reason: "already has a Substitute" };
  }

  // Check if attacker has enough HP
  if (attacker.pokemon.currentHp <= cost) {
    return { canUse: false, reason: "not enough HP" };
  }

  // Check if there are allies available to switch to
  const available = attackerSide.team.filter(
    (p, i) => p.currentHp > 0 && !attackerSide.active.some((a) => a?.teamSlot === i),
  );
  if (available.length === 0) {
    return { canUse: false, reason: "no allies available to switch to" };
  }

  return { canUse: true };
}

/**
 * Handle Shed Tail move effect.
 *
 * Normal/Status, PP 10.
 * User loses ceil(maxHP/2) HP.
 * Creates a Substitute for the incoming Pokemon (sub HP = floor(maxHP/4)).
 * User then switches out (forced switch).
 *
 * The substitute is passed to the switch-in Pokemon. In Showdown, this is
 * implemented via a selfSwitch:'shedtail' mechanism. Here, we use the
 * existing MoveEffectResult.switchOut + a volatile marker to signal
 * that the switch-in should inherit a Substitute.
 *
 * Source: Showdown data/moves.ts:16759-16796
 *   onHit: this.directDamage(Math.ceil(target.maxhp / 2))
 *   volatileStatus: 'substitute' (the sub is created on the switch-in)
 *   selfSwitch: 'shedtail'
 * Source: Showdown data/conditions.ts substitute.onStart:
 *   this.effectState.hp = Math.floor(target.maxhp / 4)
 */
export function handleShedTail(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  const attackerSideIndex = ctx.state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === ctx.attacker.pokemon),
  );

  if (attackerSideIndex < 0) {
    return { ...base, messages: ["But it failed!"] };
  }

  const attackerSide = ctx.state.sides[attackerSideIndex];
  if (!attackerSide) {
    return { ...base, messages: ["But it failed!"] };
  }
  const check = canUseShedTail(ctx.attacker, attackerSide);
  if (!check.canUse) {
    return { ...base, messages: ["But it failed!"] };
  }

  const maxHp = ctx.attacker.pokemon.calculatedStats?.hp ?? ctx.attacker.pokemon.currentHp;
  const cost = calculateShedTailCost(maxHp);

  // Deduct HP from the user
  // Source: Showdown data/moves.ts:16784 -- this.directDamage(Math.ceil(target.maxhp / 2))
  ctx.attacker.pokemon.currentHp -= cost;

  // The substitute HP for the switch-in is floor(maxHP/4)
  // Source: Showdown data/conditions.ts substitute.onStart -- this.effectState.hp = Math.floor(target.maxhp / 4)
  const subHp = Math.floor(maxHp / 4);

  // Mark that a Shed Tail sub should be passed to the switch-in.
  // We store this as a volatile on the attacker; the engine's switch logic
  // should check for this volatile and create a Substitute on the switch-in.
  // "shed-tail-sub" is defined in core's VolatileStatus union (added in this wave).
  // Cast required because the worktree build may resolve to an older core dist.
  ctx.attacker.volatileStatuses.set(CORE_VOLATILE_IDS.shedTailSub as VolatileStatus, {
    turnsLeft: -1,
    data: { substituteHp: subHp },
  });

  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";

  return {
    ...base,
    switchOut: true,
    shedTail: true,
    messages: [`${attackerName} shed its tail to create a decoy!`],
  };
}

// ---------------------------------------------------------------------------
// Tidy Up
// ---------------------------------------------------------------------------

/**
 * Handle Tidy Up move effect.
 *
 * Normal/Status, PP 10.
 * Removes ALL Substitutes from ALL active Pokemon (both sides).
 * Removes entry hazards from BOTH sides (Spikes, Toxic Spikes, Stealth Rock,
 *   Sticky Web; also G-Max Steelsurge for completeness though not in Gen 9).
 * Boosts user's Attack +1 and Speed +1.
 * Does NOT remove screens (Reflect, Light Screen, Aurora Veil).
 *
 * Source: Showdown data/moves.ts:20351-20381
 *   onHit(pokemon):
 *     for (const active of this.getAllActive())
 *       active.removeVolatile('substitute')
 *     const removeAll = ['spikes', 'toxicspikes', 'stealthrock', 'stickyweb', 'gmaxsteelsurge']
 *     for each side, remove those sideConditions
 *     return !!this.boost({ atk: 1, spe: 1 }, ...)
 */
export function handleTidyUp(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();
  const messages: string[] = [];

  // Remove all Substitutes from all active Pokemon on both sides
  // Source: Showdown data/moves.ts:20362-20364
  for (const side of ctx.state.sides) {
    for (const active of side.active) {
      if (active && active.substituteHp > 0) {
        active.substituteHp = 0;
        active.volatileStatuses.delete(CORE_VOLATILE_IDS.substitute);
        const pokeName = active.pokemon.nickname ?? "The Pokemon";
        messages.push(`${pokeName}'s substitute faded!`);
      }
    }
  }

  // Remove hazards from both sides
  // Source: Showdown data/moves.ts:20365-20374
  // Hazard types: spikes, toxic-spikes, stealth-rock, sticky-web
  for (const side of ctx.state.sides) {
    if (side.hazards.length > 0) {
      side.hazards = [];
      messages.push("The hazards disappeared from the field!");
    }
  }

  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
  messages.push(`${attackerName}'s Attack rose!`);
  messages.push(`${attackerName}'s Speed rose!`);

  return {
    ...base,
    statChanges: [
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.attack, stages: 1 },
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.speed, stages: 1 },
    ],
    messages,
  };
}

// ---------------------------------------------------------------------------
// Salt Cure
// ---------------------------------------------------------------------------

/**
 * Calculate Salt Cure residual damage.
 *
 * Deals 1/8 max HP per turn, or 1/4 max HP for Water or Steel types.
 * Minimum 1 damage.
 *
 * Source: Showdown data/moves.ts:16225-16227
 *   onResidual(pokemon) {
 *     this.damage(pokemon.baseMaxhp / (pokemon.hasType(['Water', 'Steel']) ? 4 : 8));
 *   }
 *
 * @param maxHp - The target's maximum HP
 * @param types - The target's current types
 * @returns Residual damage amount
 */
export function calculateSaltCureDamage(maxHp: number, types: readonly string[]): number {
  const isWaterOrSteel = types.includes(CORE_TYPE_IDS.water) || types.includes(CORE_TYPE_IDS.steel);
  const divisor = isWaterOrSteel ? 4 : 8;
  return Math.max(1, Math.floor(maxHp / divisor));
}

/**
 * Handle Salt Cure move effect (applying the volatile status after damage).
 *
 * Rock/Physical, 40 BP, 100% accuracy, PP 15.
 * Applies the "salt-cure" volatile status to the target.
 * The residual damage (1/8 or 1/4 for Water/Steel) is handled by the
 * end-of-turn processing in the Gen9Ruleset.
 *
 * Salt Cure cannot be applied if the target already has it.
 *
 * Source: Showdown data/moves.ts:16210-16238
 *   secondary: { chance: 100, volatileStatus: 'saltcure' }
 *   condition: { noCopy: true, onResidualOrder: 13, onResidual: damage }
 */
export function handleSaltCure(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();

  // Check if target already has Salt Cure
  // "salt-cure" is defined in core's VolatileStatus union (added in this wave).
  // Cast required because the worktree build may resolve to an older core dist.
  if (ctx.defender.volatileStatuses.has(CORE_VOLATILE_IDS.saltCure as VolatileStatus)) {
    // Salt Cure is already applied; the damaging hit still works, just no new volatile
    return base;
  }

  const defenderName = ctx.defender.pokemon.nickname ?? "The defending Pokemon";

  return {
    ...base,
    volatileInflicted: CORE_VOLATILE_IDS.saltCure as VolatileStatus,
    volatileData: { turnsLeft: -1 }, // Salt Cure has no set expiry
    messages: [`${defenderName} is being salt cured!`],
  };
}

// ---------------------------------------------------------------------------
// Tera Blast (Stellar self-debuff)
// ---------------------------------------------------------------------------

/**
 * Check whether a Tera Blast should apply the Stellar self-debuff.
 *
 * The self-debuff (-1 Atk and -1 SpA) only applies when the user has
 * Terastallized into the Stellar Tera Type.
 *
 * Source: Showdown data/moves.ts:19948-19949
 *   if (pokemon.terastallized === 'Stellar') {
 *     move.self = { boosts: { atk: -1, spa: -1 } };
 *   }
 *
 * @returns true if the Stellar self-debuff should apply
 */
export function shouldApplyStellarDebuff(attacker: ActivePokemon): boolean {
  if (!attacker.isTerastallized) return false;
  const teraType = attacker.teraType ?? attacker.pokemon.teraType;
  return (teraType as string) === "stellar";
}

/**
 * Handle Tera Blast move effect.
 *
 * The type/category changes are already handled in Gen9Terastallization.modifyMove().
 * This handler only applies the Stellar Tera Blast self-debuff: -1 Atk and -1 SpA.
 *
 * For non-Stellar Tera Blast, this is a no-op.
 *
 * Source: Showdown data/moves.ts:19944-19950
 *   onModifyMove: if (pokemon.terastallized === 'Stellar')
 *     move.self = { boosts: { atk: -1, spa: -1 } };
 */
export function handleTeraBlast(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();

  if (!shouldApplyStellarDebuff(ctx.attacker)) {
    return base;
  }

  const attackerName = ctx.attacker.pokemon.nickname ?? "The attacking Pokemon";

  return {
    ...base,
    statChanges: [
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.attack, stages: -1 },
      { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.spAttack, stages: -1 },
    ],
    messages: [`${attackerName}'s Attack fell!`, `${attackerName}'s Sp. Atk fell!`],
  };
}

// ---------------------------------------------------------------------------
// Master dispatch
// ---------------------------------------------------------------------------

/**
 * Master dispatcher for Gen 9-specific move effects.
 *
 * Routes to the appropriate handler based on move ID. Returns `null` if the
 * move is not a Gen 9-specific move (the caller should then fall through to
 * BaseRuleset's default handler).
 *
 * @param ctx - Move effect context from the engine
 * @returns MoveEffectResult if handled, or null if not a Gen 9-specific move
 */
export function executeGen9MoveEffect(ctx: MoveEffectContext): MoveEffectResult | null {
  switch (ctx.move.id) {
    case GEN9_MOVE_IDS.populationBomb:
      return handlePopulationBomb(ctx);

    case GEN9_MOVE_IDS.rageFist:
      return handleRageFist(ctx);

    case GEN9_MOVE_IDS.makeItRain:
      return handleMakeItRain(ctx);

    case GEN9_MOVE_IDS.revivalBlessing:
      return handleRevivalBlessing(ctx);

    case GEN9_MOVE_IDS.lastRespects:
      return handleLastRespects(ctx);

    case GEN9_MOVE_IDS.shedTail:
      return handleShedTail(ctx);

    case GEN9_MOVE_IDS.tidyUp:
      return handleTidyUp(ctx);

    case GEN9_MOVE_IDS.saltCure:
      return handleSaltCure(ctx);

    case GEN9_MOVE_IDS.teraBlast:
      return handleTeraBlast(ctx);

    default:
      return null;
  }
}
