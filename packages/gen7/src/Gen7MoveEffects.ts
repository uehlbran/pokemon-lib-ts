/**
 * Gen 7 move effect handlers.
 *
 * Implements Gen 7-specific moves:
 *   - Aurora Veil: Hail-only screen, halves damage from both physical and special
 *     moves. Lasts 5 turns (8 with Light Clay). Does not stack with Reflect/Light Screen.
 *   - Baneful Bunker (NEW in Gen 7): Protect variant, blocks all moves with flags.protect;
 *     poisons contact attackers. Uses stalling mechanic.
 *   - King's Shield (Gen 7 override): Contact penalty is -2 Attack (was -1 in Gen 6).
 *   - Spiky Shield (carry-forward from Gen 6): Contact attackers take 1/8 max HP damage.
 *   - Mat Block (carry-forward from Gen 6): Team protect, first turn only.
 *   - Crafty Shield (carry-forward from Gen 6): Blocks status moves targeting the side.
 *   - Two-turn moves: Fly, Dig, Dive, Sky Attack, Solar Beam, Solar Blade, Phantom Force,
 *     Shadow Force, Bounce.
 *   - Drain effects: data-driven (Giga Drain 50%, Drain Kiss 75%, etc.), with Big Root
 *     and Liquid Ooze interactions.
 *
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: references/pokemon-showdown/data/mods/gen7/moves.ts
 * Source: Bulbapedia -- individual move pages
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
// Aurora Veil
// ---------------------------------------------------------------------------

/**
 * Default duration for Aurora Veil (5 turns).
 *
 * Source: Showdown data/moves.ts -- auroraveil: sideCondition, duration: 5
 * Source: Bulbapedia -- "Aurora Veil lasts for five turns"
 */
export const AURORA_VEIL_DEFAULT_TURNS = 5;

/**
 * Extended duration for Aurora Veil with Light Clay (8 turns).
 *
 * Source: Showdown data/items.ts -- lightclay: extends screen duration by 3
 * Source: Bulbapedia -- "Light Clay extends Aurora Veil to 8 turns"
 */
export const AURORA_VEIL_LIGHT_CLAY_TURNS = 8;

/**
 * Handle Aurora Veil move effect.
 *
 * Aurora Veil is an Ice-type status move introduced in Gen 7.
 * It can ONLY be used during Hail weather -- the move fails otherwise.
 * When active, it halves damage from both physical and special moves
 * (like having both Reflect and Light Screen at once).
 *
 * Key mechanics:
 *   - Fails if weather is not Hail
 *   - Lasts 5 turns (8 with Light Clay)
 *   - Does NOT stack with Reflect/Light Screen (their effects don't apply additionally)
 *   - Bypassed by critical hits
 *   - Removed by Brick Break, Defog, Psychic Fangs
 *   - Sets the "aurora-veil" screen on the user's side
 *
 * Source: Showdown data/moves.ts -- auroraveil:
 *   onTry(source) { return source.effectiveWeather() === 'hail'; }
 *   sideCondition: 'auroraveil', condition: { duration: 5 }
 *   onAnyModifyDamage: if (!crit) return this.chainModify(0.5); (singles)
 * Source: Bulbapedia -- Aurora Veil: "This move can only be used during hail...
 *   Reduces damage taken from physical and special moves by half"
 */
export function handleAuroraVeil(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();

  // Aurora Veil fails if weather is not Hail
  // Source: Showdown data/moves.ts -- onTry: source.effectiveWeather() === 'hail'
  if (!ctx.state.weather || ctx.state.weather.type !== "hail") {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Check if Aurora Veil is already active on the user's side
  const attackerSideIndex = ctx.state.sides.findIndex((side) =>
    side.active.some((a) => a?.pokemon === ctx.attacker.pokemon),
  );
  if (attackerSideIndex >= 0) {
    const attackerSide = ctx.state.sides[attackerSideIndex];
    if (attackerSide?.screens.some((s) => s.type === "aurora-veil")) {
      return {
        ...base,
        messages: ["But it failed!"],
      };
    }
  }

  // Light Clay extends screen duration from 5 to 8 turns
  // Source: Showdown data/items.ts -- lightclay: extends screen duration
  const turns =
    ctx.attacker.pokemon.heldItem === "light-clay"
      ? AURORA_VEIL_LIGHT_CLAY_TURNS
      : AURORA_VEIL_DEFAULT_TURNS;

  const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";

  return {
    ...base,
    screenSet: { screen: "aurora-veil", turnsLeft: turns, side: "attacker" },
    messages: [
      `Aurora Veil made ${attackerName}'s team stronger against physical and special moves!`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Protect Variant Handlers
// ---------------------------------------------------------------------------

/**
 * Handle King's Shield move effect (Gen 7 version).
 *
 * Priority +4 protect variant. Blocks moves with `flags.protect` EXCEPT Status moves.
 * In Gen 7, contact penalty is -2 Attack (was -1 in Gen 6).
 * Uses the stalling mechanic (same consecutive-use scaling as Protect).
 *
 * Source: references/pokemon-showdown/data/mods/gen7/moves.ts lines 558-588
 *   King's Shield Gen 7 override: this.boost({ atk: -2 }, ...) on contact
 * Source: Showdown data/moves.ts lines 10270-10328
 *   stallingMove: true, volatileStatus: 'kingsshield'
 *   condition.onTryHit: if (!move.flags['protect'] || move.category === 'Status') return;
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
  // Source: Showdown -- no stallingMove property on craftyshield

  // Set the "crafty-shield" volatile on the attacker (self).
  // Source: Showdown -- sideCondition: 'craftyshield', duration: 1
  return {
    ...base,
    selfVolatileInflicted: "crafty-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: [`${ctx.attacker.pokemon.nickname ?? "The Pokemon"} used Crafty Shield!`],
  };
}

/**
 * Handle Baneful Bunker move effect (NEW in Gen 7).
 *
 * Priority +4 protect variant. Blocks ALL moves with `flags.protect` (both damaging
 * AND status moves). Contact moves that are blocked cause the attacker to be poisoned.
 * Uses the stalling mechanic.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 1018-1075
 *   stallingMove: true, volatileStatus: 'banefulbunker'
 *   condition.onTryHit: if (!move.flags['protect']) return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     source.trySetStatus('psn', target);
 */
function handleBanefulBunker(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  // Baneful Bunker uses the same stalling mechanic as Protect.
  // Source: Showdown -- stallingMove: true, onPrepareHit checks StallMove
  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  // Set the "baneful-bunker" volatile on the attacker (self).
  // Source: Showdown -- volatileStatus: 'banefulbunker', duration: 1
  return {
    ...base,
    selfVolatileInflicted: "baneful-bunker",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

// ---------------------------------------------------------------------------
// Protect Checking Functions (exported for engine use)
// ---------------------------------------------------------------------------

/**
 * Check if a move would be blocked by King's Shield (Gen 7 version).
 *
 * King's Shield blocks moves with flags.protect EXCEPT Status category moves.
 * In Gen 7, contact penalty is -2 Attack (was -1 in Gen 6).
 *
 * Source: references/pokemon-showdown/data/mods/gen7/moves.ts lines 566-581
 *   onTryHit: if (!move.flags['protect'] || move.category === 'Status') return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.boost({ atk: -2 }, source, target, ...)  -- Gen 7: -2 (not -1)
 */
export function isBlockedByKingsShield(
  moveCategory: string,
  moveHasProtectFlag: boolean,
  moveHasContactFlag: boolean,
): { blocked: boolean; contactPenalty: boolean; attackDropStages: number } {
  // King's Shield allows Status moves through
  // Source: Showdown -- if (!move.flags['protect'] || move.category === 'Status') return;
  if (!moveHasProtectFlag || moveCategory === "status") {
    return { blocked: false, contactPenalty: false, attackDropStages: 0 };
  }
  return {
    blocked: true,
    contactPenalty: moveHasContactFlag,
    // Gen 7: -2 Attack on contact (was -1 in Gen 6)
    // Source: Showdown mods/gen7/moves.ts -- this.boost({ atk: -2 }, ...)
    attackDropStages: moveHasContactFlag ? -2 : 0,
  };
}

/**
 * Check if a move would be blocked by Spiky Shield.
 *
 * Spiky Shield blocks ALL moves with flags.protect (including Status).
 * Contact attackers take 1/8 max HP damage.
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
  // Entry hazards target "foe-field" or "user-field" and pass through Crafty Shield.
  // Source: Bulbapedia -- Crafty Shield does not protect against entry hazard moves
  // Source: Showdown data/moves.ts -- hazards (stealth-rock, spikes, toxic-spikes, sticky-web) use target: foeSide
  if (
    moveTarget === "self" ||
    moveTarget === "all" ||
    moveTarget === "entire-field" ||
    moveTarget === "foe-field" ||
    moveTarget === "user-field"
  )
    return false;
  return true;
}

/**
 * Check if a move would be blocked by Baneful Bunker.
 *
 * Baneful Bunker blocks ALL moves with flags.protect (both damaging AND status).
 * Contact moves that are blocked cause the attacker to be poisoned.
 *
 * Source: references/pokemon-showdown/data/moves.ts lines 1041-1062
 *   onTryHit: if (!move.flags['protect']) return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     source.trySetStatus('psn', target);
 */
export function isBlockedByBanefulBunker(
  moveHasProtectFlag: boolean,
  moveHasContactFlag: boolean,
): { blocked: boolean; contactPoison: boolean } {
  if (!moveHasProtectFlag) {
    return { blocked: false, contactPoison: false };
  }
  return {
    blocked: true,
    contactPoison: moveHasContactFlag,
  };
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

// ---------------------------------------------------------------------------
// Two-Turn Move Handlers
// ---------------------------------------------------------------------------

/**
 * Two-turn volatile map for Gen 7 moves.
 * Maps move ID to the volatile status applied during the charge turn.
 *
 * Semi-invulnerable moves use specific volatiles (flying, underground, underwater,
 * shadow-force-charging). Non-semi-invulnerable charge moves use "charging".
 *
 * Source: references/pokemon-showdown/data/moves.ts -- two-turn move conditions
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Semi-invulnerable_turn
 */
const TWO_TURN_VOLATILE_MAP: Readonly<Record<string, VolatileStatus>> = {
  fly: "flying",
  bounce: "flying",
  dig: "underground",
  dive: "underwater",
  "phantom-force": "shadow-force-charging",
  "shadow-force": "shadow-force-charging",
  "solar-beam": "charging",
  "solar-blade": "charging",
  "sky-attack": "charging",
};

/**
 * Charge-turn messages for two-turn moves.
 *
 * Source: Showdown -- this.add('-prepare', attacker, move.name);
 * Source: Bulbapedia -- individual move charge turn descriptions
 */
const TWO_TURN_MESSAGES: Readonly<Record<string, string>> = {
  fly: "{pokemon} flew up high!",
  bounce: "{pokemon} sprang up!",
  dig: "{pokemon} dug underground!",
  dive: "{pokemon} dived underwater!",
  "phantom-force": "{pokemon} vanished!",
  "shadow-force": "{pokemon} vanished!",
  "solar-beam": "{pokemon} is absorbing sunlight!",
  "solar-blade": "{pokemon} is absorbing sunlight!",
  "sky-attack": "{pokemon} is glowing!",
};

/**
 * Handle the charge turn of a two-turn move.
 *
 * On the charge turn:
 *   1. If the attacker already has the charge volatile, this is the ATTACK turn --
 *      return null so the engine handles normal damage.
 *   2. Check skip-charge conditions (SolarBeam/SolarBlade in sun, Power Herb).
 *   3. If charging, set forcedMoveSet and emit a charge message.
 *
 * Source: Showdown data/moves.ts -- two-turn move onTryMove handlers
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Two-turn_move
 */
function handleTwoTurnMove(ctx: MoveEffectContext): MoveEffectResult | null {
  const { attacker, move } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  const volatile = TWO_TURN_VOLATILE_MAP[move.id];
  if (!volatile) return null;

  // If the attacker already has the charge volatile, this is the SECOND turn (attack turn).
  // Return null so the engine handles normal damage.
  // Source: Showdown -- if (attacker.removeVolatile(move.id)) return; (attack turn)
  if (attacker.volatileStatuses.has(volatile)) {
    return null;
  }

  // SolarBeam / SolarBlade in sun: skip charge, attack immediately
  // Source: Showdown data/moves.ts -- solarbeam/solarblade: onChargeMove fires immediately in sun
  // Source: Bulbapedia -- "In harsh sunlight, Solar Beam can be used without a charging turn."
  if (
    (move.id === "solar-beam" || move.id === "solar-blade") &&
    ctx.state.weather?.type === "sun"
  ) {
    return createBaseResult(); // No forcedMoveSet -- engine proceeds with attack immediately
  }

  // Power Herb: skip charge, consume the item
  // Source: Showdown data/items.ts -- powerherb: skip charge turn, consume
  // Source: Bulbapedia -- "Power Herb allows the holder to skip the charge turn"
  if (attacker.pokemon.heldItem === "power-herb") {
    // Consume the Power Herb immediately -- it is single-use.
    // Source: Showdown data/items.ts -- powerherb: onTryMove, item is consumed then move fires
    attacker.pokemon.heldItem = null;
    const base = createBaseResult();
    return {
      ...base,
      messages: [`${attackerName} became fully charged due to its Power Herb!`],
    };
  }

  // Determine the move index from the attacker's moveset
  const moveIndex = attacker.pokemon.moves.findIndex(
    (m: { moveId: string }) => m.moveId === move.id,
  );

  const base = createBaseResult();
  const messageTemplate = TWO_TURN_MESSAGES[move.id] ?? "{pokemon} is charging up!";
  const message = messageTemplate.replace("{pokemon}", attackerName);

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
// Drain Effects
// ---------------------------------------------------------------------------

/**
 * Handle data-driven drain effects for Gen 7.
 *
 * Reads the move's `effect.type === "drain"` and computes `healAmount` based on
 * the damage dealt multiplied by the drain fraction.
 *
 * Key interactions:
 *   - Big Root: increases drain healing by 30% (1.3x), applied via floor
 *   - Liquid Ooze: instead of healing, the draining Pokemon takes damage equal
 *     to what it would have healed
 *
 * @param ctx - The move effect execution context
 * @returns MoveEffectResult with healAmount set, or null if the move has no drain effect
 *
 * Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
 * Source: Showdown data/moves.ts -- drainingkiss: { drain: [3, 4] } = 75%
 * Source: Showdown data/items.ts -- bigroot: onTryHeal: 1.3x for drain/Leech Seed
 * Source: Showdown data/abilities.ts -- liquidooze: onSourceTryHeal: damage instead of heal
 * Source: Bulbapedia -- Big Root: "increases the amount of HP the holder recovers
 *   from draining moves by 30%"
 * Source: Bulbapedia -- Liquid Ooze: "When a Pokemon with Liquid Ooze is hit by
 *   an HP-draining move, the attacker loses the HP it would have gained instead"
 */
export function handleDrainEffect(ctx: MoveEffectContext): MoveEffectResult | null {
  if (ctx.move.effect?.type !== "drain") return null;

  // Guard: no drain effect if the move dealt no damage (e.g., move missed after hitting substitute,
  // or target already fainted). Without this, Math.max(1, 0) would trigger 1 Liquid Ooze recoil.
  // Source: Showdown sim/battle-actions.ts -- drain only triggers when damage > 0
  if (ctx.damage <= 0) return null;


  const drainFraction = ctx.move.effect.amount;
  let healAmount = Math.floor(ctx.damage * drainFraction);

  // Big Root: increases drain healing by 30%
  // Source: Showdown data/items.ts -- bigroot: this.chainModify([5324, 4096]) ~= 1.3x
  if (ctx.attacker.pokemon.heldItem === "big-root") {
    healAmount = Math.floor(healAmount * 1.3);
  }

  // Liquid Ooze: the attacker takes damage instead of healing
  // Source: Showdown data/abilities.ts -- liquidooze: return -heal
  // Only deal recoil if healAmount > 0 (drain move actually drained some HP).
  // When ctx.damage is 0 (e.g., move missed/didn't connect), healAmount is 0 and
  // no recoil should occur.
  if (ctx.defender.ability === "liquid-ooze") {
    if (healAmount <= 0) return createBaseResult();
    const attackerName = ctx.attacker.pokemon.nickname ?? "The Pokemon";
    return {
      ...createBaseResult(),
      recoilDamage: healAmount,
      messages: [`${attackerName} sucked up the liquid ooze!`],
    };
  }

  return {
    ...createBaseResult(),
    healAmount: Math.max(0, healAmount),
  };
}

// ---------------------------------------------------------------------------
// Powder/Spore Immunity (Gen 6+)
// ---------------------------------------------------------------------------

/**
 * Check if a powder/spore move is blocked by the target being a Grass type.
 *
 * In Gen 6+, Grass-type Pokemon are immune to all moves with the `flags.powder`
 * flag. This is identified by `move.flags.powder === true` in the move data.
 *
 * @param move - The move being used
 * @param targetTypes - The defending Pokemon's current type(s)
 * @returns `true` if the move is blocked (Grass type + powder move), `false` otherwise
 *
 * Source: Showdown data/moves.ts -- every powder move has:
 *   `onTryHit(target) { if (target.hasType('Grass')) return null; }`
 * Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
 *   powder and spore moves."
 */
export function isGen7GrassPowderBlocked(move: MoveData, targetTypes: readonly string[]): boolean {
  if (!move.flags?.powder) return false;
  return targetTypes.includes("grass");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dispatch table for Gen 7 move effects.
 *
 * Handles Gen 7-specific moves:
 *   - Aurora Veil (Hail-only dual screen)
 *   - Baneful Bunker (new Gen 7 protect variant)
 *   - Protect variants (King's Shield, Spiky Shield, Mat Block, Crafty Shield)
 *   - Two-turn moves (Fly, Dig, Dive, Bounce, Phantom Force, Shadow Force,
 *     Solar Beam, Solar Blade, Sky Attack)
 *   - Data-driven drain effects (Giga Drain 50%, Drain Kiss 75%, etc.)
 *
 * Returns null if the move is not a recognized Gen 7 move effect,
 * allowing the caller to fall through to BaseRuleset handlers.
 *
 * Note: Powder/spore immunity for Grass types is NOT handled here.
 * It is checked in Gen7Ruleset.executeMoveEffect BEFORE this dispatcher
 * is called, because powder immunity blocks the entire move (not just effects).
 *
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: references/pokemon-showdown/data/mods/gen7/moves.ts
 */
export function executeGen7MoveEffect(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult | null {
  switch (ctx.move.id) {
    case "aurora-veil":
      return handleAuroraVeil(ctx);
    case "baneful-bunker":
      return handleBanefulBunker(ctx, rng, rollProtectSuccess);
    case "kings-shield":
      return handleKingsShield(ctx, rng, rollProtectSuccess);
    case "spiky-shield":
      return handleSpikyShield(ctx, rng, rollProtectSuccess);
    case "mat-block":
      return handleMatBlock(ctx, rng, rollProtectSuccess);
    case "crafty-shield":
      return handleCraftyShield(ctx);
    default:
      break;
  }

  // Two-turn moves (Fly, Dig, Dive, Bounce, Phantom Force, Shadow Force,
  // Solar Beam, Solar Blade, Sky Attack)
  if (ctx.move.id in TWO_TURN_VOLATILE_MAP) {
    return handleTwoTurnMove(ctx);
  }

  // Data-driven drain effects (Giga Drain 50%, Drain Kiss 75%, etc.)
  // Source: Showdown data/moves.ts -- drain: [numerator, denominator] on drain moves
  const drainResult = handleDrainEffect(ctx);
  if (drainResult !== null) return drainResult;

  return null;
}
