/**
 * Gen 6 move effect handlers: protect variants and two-turn moves.
 *
 * Implements Gen 6-specific moves:
 *   - King's Shield: protect variant, blocks moves with flags.protect (except Status);
 *     -1 Atk to contact attackers
 *   - Spiky Shield: protect variant, blocks all moves with flags.protect;
 *     1/8 max HP chip damage to contact attackers
 *   - Mat Block: team-side protect, blocks damaging moves (not status, not self-targeting);
 *     first turn only; uses stalling mechanic
 *   - Crafty Shield: team-side protect, blocks status moves targeting the side;
 *     does NOT use stalling mechanic
 *   - Phantom Force: two-turn Ghost move, bypasses protect (breaksProtect);
 *     shares "shadow-force-charging" volatile with Shadow Force
 *
 * Source: references/pokemon-showdown/data/moves.ts
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import type { MoveData, SeededRandom, VolatileStatus } from "@pokemon-lib-ts/core";

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
// Protect Variant Handlers
// ---------------------------------------------------------------------------

/**
 * Handle King's Shield move effect.
 *
 * Priority +4 protect variant. Blocks moves with `flags.protect` EXCEPT Status moves.
 * If the attacker makes contact, their Attack is lowered by 1 stage.
 * Uses the stalling mechanic (same consecutive-use scaling as Protect).
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 10270-10328
 *   stallingMove: true, volatileStatus: 'kingsshield'
 *   condition.onTryHit: if (!move.flags['protect'] || move.category === 'Status') return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.boost({ atk: -1 }, source, target, ...)
 */
function handleKingsShield(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  // King's Shield uses the same stalling mechanic as Protect.
  // Source: Showdown -- stallingMove: true, onPrepareHit checks StallMove
  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Set the "kings-shield" volatile on the attacker (self).
  // The engine checks this volatile to block incoming moves and apply contact penalty.
  // Source: Showdown -- volatileStatus: 'kingsshield', duration: 1
  return {
    ...base,
    selfVolatileInflicted: "kings-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

/**
 * Handle Spiky Shield move effect.
 *
 * Priority +4 protect variant. Blocks ALL moves with `flags.protect` (including Status).
 * If the attacker makes contact, they take 1/8 of their own max HP as damage.
 * Uses the stalling mechanic.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 18175-18232
 *   stallingMove: true, volatileStatus: 'spikyshield'
 *   condition.onTryHit: if (!move.flags['protect']) return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.damage(source.baseMaxhp / 8, source, target);
 */
function handleSpikyShield(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  // Spiky Shield uses the same stalling mechanic as Protect.
  // Source: Showdown -- stallingMove: true, onPrepareHit checks StallMove
  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Set the "spiky-shield" volatile on the attacker (self).
  // Source: Showdown -- volatileStatus: 'spikyshield', duration: 1
  return {
    ...base,
    selfVolatileInflicted: "spiky-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

/**
 * Handle Mat Block move effect.
 *
 * Priority 0 team-side protect. Blocks damaging moves (not status, not self-targeting)
 * on the first turn the Pokemon is on the field only.
 * Uses the stalling mechanic.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 11390-11438
 *   stallingMove: true, sideCondition: 'matblock'
 *   onTry: if (source.activeMoveActions > 1) return false; -- first turn only
 *   condition.onTryHit: if (!move.flags['protect']) return;
 *     if (move.target === 'self' || move.category === 'Status') return;
 *
 * In our system, turnsOnField === 0 during move execution on the first turn
 * (turnsOnField is incremented at end of turn).
 * Showdown's activeMoveActions > 1 means the Pokemon has executed more than one
 * move action since switching in. For singles, this effectively means "not first turn."
 */
function handleMatBlock(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  // Mat Block only works on the first turn the Pokemon is on the field.
  // Source: Showdown -- onTry: if (source.activeMoveActions > 1) return false;
  if (ctx.attacker.turnsOnField > 0) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Mat Block uses the stalling mechanic.
  // Source: Showdown -- stallingMove: true
  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Set the "mat-block" volatile on the attacker (self).
  // Source: Showdown -- sideCondition: 'matblock', duration: 1
  return {
    ...base,
    selfVolatileInflicted: "mat-block",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected the team with Mat Block!"],
  };
}

/**
 * Handle Crafty Shield move effect.
 *
 * Priority +3 team-side protect. Blocks status moves targeting the side
 * (not self-targeting, not "all" targeting).
 * Does NOT use the stalling mechanic (no stallingMove in Showdown source).
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 3253-3284
 *   sideCondition: 'craftyshield' (no stallingMove)
 *   condition.onTryHit: if (['self', 'all'].includes(move.target) || move.category !== 'Status') return;
 */
function handleCraftyShield(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();

  // Crafty Shield does NOT use the stalling mechanic -- no rollProtectSuccess needed.
  // Source: Showdown -- no stallingMove property on craftyshield (unlike King's Shield/Spiky Shield)

  // Set the "crafty-shield" volatile on the attacker (self).
  // Source: Showdown -- sideCondition: 'craftyshield', duration: 1
  return {
    ...base,
    selfVolatileInflicted: "crafty-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: [`${ctx.attacker.pokemon.nickname ?? "The Pokemon"} used Crafty Shield!`],
  };
}

// ---------------------------------------------------------------------------
// Two-Turn Move Handlers
// ---------------------------------------------------------------------------

/**
 * Two-turn volatile map for Gen 6 moves.
 * Maps move ID to the volatile status applied during the charge turn.
 * Phantom Force shares the same "shadow-force-charging" volatile as Shadow Force.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 13795-13824
 *   phantomforce: condition.onInvulnerability: false
 *   (same semi-invulnerable state as Shadow Force)
 */
const GEN6_TWO_TURN_VOLATILE_MAP: Readonly<Record<string, VolatileStatus>> = {
  "phantom-force": "shadow-force-charging",
};

/**
 * Charge-turn messages for Gen 6 two-turn moves.
 *
 * Source: Showdown -- phantomforce: this.add('-prepare', attacker, move.name);
 * Source: Bulbapedia -- "The user vanishes somewhere, then strikes the target"
 */
const GEN6_TWO_TURN_MESSAGES: Readonly<Record<string, string>> = {
  "phantom-force": "{pokemon} vanished!",
};

/**
 * Handle Phantom Force charge turn.
 *
 * First turn: sets "shadow-force-charging" volatile and forces the next move.
 * Second turn: returns null so the engine handles normal damage (the move data
 * has breaksProtect: true, which the engine uses to bypass Protect).
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 13795-13824
 *   onTryMove: if (attacker.removeVolatile(move.id)) return; -- second turn, attack
 *   attacker.addVolatile('twoturnmove', defender); return null; -- first turn, charge
 *   condition: { duration: 2, onInvulnerability: false }
 */
function handlePhantomForce(ctx: MoveEffectContext): MoveEffectResult | null {
  const { attacker, move } = ctx;

  // If the attacker already has the charge volatile, this is the SECOND turn (attack turn).
  // Return null so the engine handles normal damage.
  // Source: Showdown -- if (attacker.removeVolatile(move.id)) return; (attack turn)
  if (attacker.volatileStatuses.has("shadow-force-charging")) {
    return null;
  }

  // First turn: charge -- set the semi-invulnerable volatile and force the move next turn.
  const volatile = GEN6_TWO_TURN_VOLATILE_MAP[move.id];
  if (!volatile) return null;

  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";
  const messageTemplate = GEN6_TWO_TURN_MESSAGES[move.id] ?? "{pokemon} is charging!";
  const message = messageTemplate.replace("{pokemon}", attackerName);

  // Find the move index in the attacker's moveset
  const moveIndex = attacker.pokemon.moves.findIndex(
    (m: { moveId: string }) => m.moveId === move.id,
  );

  const base = createBaseResult();
  return {
    ...base,
    forcedMoveSet: {
      moveIndex: moveIndex >= 0 ? moveIndex : 0,
      moveId: move.id,
      volatileStatus: volatile,
    },
    messages: [message],
  };
}

// ---------------------------------------------------------------------------
// Powder/Spore Immunity (Gen 6+)
// ---------------------------------------------------------------------------

/**
 * Check if a powder/spore move is blocked by the target being a Grass type.
 *
 * In Gen 6+, Grass-type Pokemon are immune to all moves with the `flags.powder`
 * flag. This is identified by `move.flags.powder === true` in the move data,
 * NOT by move name. Powder Snow, Cotton Guard, and Worry Seed do NOT have
 * this flag and are NOT powder moves.
 *
 * @param move - The move being used
 * @param targetTypes - The defending Pokemon's current type(s)
 * @returns `true` if the move is blocked (Grass type + powder move), `false` otherwise
 *
 * Source: Showdown data/moves.ts -- every powder move has:
 *   `onTryHit(target) { if (target.hasType('Grass')) return null; }`
 * Source: specs/battle/07-gen6.md Section 12 -- "Grass-type Pokemon became immune
 *   to powder and spore-based moves."
 * Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
 *   powder and spore moves."
 */
export function isGen6GrassPowderBlocked(move: MoveData, targetTypes: readonly string[]): boolean {
  if (!move.flags.powder) return false;
  return targetTypes.includes("grass");
}

// ---------------------------------------------------------------------------
// Drain Handling (Oblivion Wing, Giga Drain, etc.)
// ---------------------------------------------------------------------------

/**
 * Handle data-driven drain effects for Gen 6.
 *
 * Reads the move's `effect.type === "drain"` and computes `healAmount` based on
 * the damage dealt multiplied by the drain fraction.
 *
 * Most drain moves use 0.5 (50% -- Giga Drain, Drain Punch, etc.), but
 * Oblivion Wing uses 0.75 (75%) which is already encoded in the move data.
 *
 * @param ctx - The move effect execution context
 * @returns MoveEffectResult with healAmount set, or null if the move has no drain effect
 *
 * Source: Showdown data/moves.ts -- oblivionwing: { drain: [3, 4] } = 75%
 * Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
 * Source: Bulbapedia -- "Oblivion Wing restores the user's HP by up to 75%
 *   of the damage dealt to the target."
 */
export function handleDrainEffect(ctx: MoveEffectContext): MoveEffectResult | null {
  if (ctx.move.effect?.type !== "drain") return null;

  const drainFraction = ctx.move.effect.amount;
  const healAmount = Math.floor(ctx.damage * drainFraction);

  return {
    ...createBaseResult(),
    healAmount: Math.max(0, healAmount),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch table for Gen 6 move effects.
 *
 * Handles Gen 6-specific moves:
 *   - Protect variants (King's Shield, Spiky Shield, Mat Block, Crafty Shield)
 *   - Two-turn moves (Phantom Force)
 *   - Data-driven drain effects (Oblivion Wing 75%, Giga Drain 50%, etc.)
 *
 * Returns null if the move is not a recognized Gen 6 move effect,
 * allowing the caller to fall through to Gen 5 / BaseRuleset handlers.
 *
 * Note: Powder/spore immunity for Grass types is NOT handled here.
 * It is checked in Gen6Ruleset.executeMoveEffect BEFORE this dispatcher
 * is called, because powder immunity blocks the entire move (not just effects).
 *
 * Source: references/pokemon-showdown/data/moves.ts
 */
export function executeGen6MoveEffect(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult | null {
  switch (ctx.move.id) {
    case "kings-shield":
      return handleKingsShield(ctx, rng, rollProtectSuccess);
    case "spiky-shield":
      return handleSpikyShield(ctx, rng, rollProtectSuccess);
    case "mat-block":
      return handleMatBlock(ctx, rng, rollProtectSuccess);
    case "crafty-shield":
      return handleCraftyShield(ctx);
    case "phantom-force":
      return handlePhantomForce(ctx);
    default:
      break;
  }

  // Data-driven drain effects (Oblivion Wing 75%, Giga Drain 50%, etc.)
  // Source: Showdown data/moves.ts -- drain: [numerator, denominator] on drain moves
  const drainResult = handleDrainEffect(ctx);
  if (drainResult !== null) return drainResult;

  return null;
}

/**
 * Check if a move would be blocked by King's Shield.
 *
 * King's Shield blocks moves with flags.protect EXCEPT Status category moves.
 * Status moves pass through King's Shield (unlike regular Protect).
 *
 * Returns the contact penalty info if the move is blocked.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 10294-10314
 *   onTryHit: if (!move.flags['protect'] || move.category === 'Status') return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.boost({ atk: -1 }, source, target, ...)
 */
export function isBlockedByKingsShield(
  moveCategory: string,
  moveHasProtectFlag: boolean,
  moveHasContactFlag: boolean,
): { blocked: boolean; contactPenalty: boolean } {
  // King's Shield allows Status moves through
  // Source: Showdown -- if (!move.flags['protect'] || move.category === 'Status') return;
  if (!moveHasProtectFlag || moveCategory === "status") {
    return { blocked: false, contactPenalty: false };
  }
  return {
    blocked: true,
    contactPenalty: moveHasContactFlag,
  };
}

/**
 * Check if a move would be blocked by Spiky Shield.
 *
 * Spiky Shield blocks ALL moves with flags.protect (including Status).
 *
 * Returns the contact damage info if the move is blocked.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 18198-18218
 *   onTryHit: if (!move.flags['protect']) return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.damage(source.baseMaxhp / 8, source, target);
 */
export function isBlockedBySpikyShield(
  moveHasProtectFlag: boolean,
  moveHasContactFlag: boolean,
): { blocked: boolean; contactDamage: boolean } {
  if (!moveHasProtectFlag) {
    return { blocked: false, contactDamage: false };
  }
  return {
    blocked: true,
    contactDamage: moveHasContactFlag,
  };
}

/**
 * Check if a move would be blocked by Mat Block.
 *
 * Mat Block blocks damaging moves (not Status, not self-targeting) with flags.protect.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 11415-11430
 *   onTryHit: if (!move.flags['protect']) return;
 *     if (move.target === 'self' || move.category === 'Status') return;
 */
export function isBlockedByMatBlock(
  moveCategory: string,
  moveHasProtectFlag: boolean,
  moveTarget: string,
): boolean {
  if (!moveHasProtectFlag) return false;
  // Mat Block allows self-targeting moves and Status moves through
  // Source: Showdown -- if (move && (move.target === 'self' || move.category === 'Status')) return;
  if (moveTarget === "self" || moveCategory === "status") return false;
  return true;
}

/**
 * Check if a move would be blocked by Crafty Shield.
 *
 * Crafty Shield blocks Status moves that target the opponent's side.
 * Moves targeting 'self' or 'all' are NOT blocked.
 * Non-Status moves are NOT blocked.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 3273-3276
 *   onTryHit: if (['self', 'all'].includes(move.target) || move.category !== 'Status') return;
 */
export function isBlockedByCraftyShield(moveCategory: string, moveTarget: string): boolean {
  // Only blocks Status category moves
  // Source: Showdown -- if (... move.category !== 'Status') return;
  if (moveCategory !== "status") return false;
  // Does not block self-targeting or field-wide moves
  // Source: Showdown -- if (['self', 'all'].includes(move.target)) return;
  if (moveTarget === "self" || moveTarget === "all" || moveTarget === "entire-field") return false;
  return true;
}

/**
 * Calculate Spiky Shield contact damage.
 *
 * When a contact move is blocked by Spiky Shield, the attacker takes 1/8 of their
 * own max HP as damage.
 *
 * Source: references/pokemon-showdown/data/moves.ts line 18217
 *   this.damage(source.baseMaxhp / 8, source, target);
 *
 * @param attackerMaxHp - The attacker's maximum HP
 * @returns The damage to deal to the attacker (minimum 1)
 */
export function calculateSpikyShieldDamage(attackerMaxHp: number): number {
  // Source: Showdown -- source.baseMaxhp / 8 (integer division via damage() function)
  return Math.max(1, Math.floor(attackerMaxHp / 8));
}
