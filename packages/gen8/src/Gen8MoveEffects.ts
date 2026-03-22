/**
 * Gen 8 move effect handlers.
 *
 * Implements Gen 8-specific moves and carries forward Gen 7 protect/drain/two-turn
 * mechanics with Gen 8 additions:
 *
 *   - Obstruct (NEW in Gen 8): Protect variant; contact attackers get -2 Defense.
 *   - Rapid Spin buff: 50 BP (was 20), +1 Speed on successful hit.
 *   - Defog enhancement: clears both sides' hazards, terrain, Aurora Veil, Safeguard, Mist.
 *   - Steel Beam: 140 BP Steel special, user loses half HP regardless of hit/miss.
 *   - Body Press: uses Defense for attack calc (flag only; calc handled in Gen8DamageCalc).
 *   - Behemoth Blade/Bash/Dynamax Cannon: 2x vs Dynamaxed (flag only; calc handled in Gen8DamageCalc).
 *   - No Retreat: +1 all stats, user trapped.
 *   - Tar Shot: -1 Speed on target, sets tar-shot volatile (doubles Fire damage).
 *   - Jaw Lock: traps both user and target.
 *   - Clangorous Soul: costs 1/3 HP, +1 all stats.
 *   - Fishious Rend / Bolt Beak: 85 BP normally, 170 BP if user moves first.
 *
 * Carry-forward from Gen 7 (unchanged logic):
 *   - Protect variants: King's Shield (-2 Atk on contact), Spiky Shield (1/8 HP recoil),
 *     Baneful Bunker (poison on contact), Mat Block (first-turn team protect),
 *     Crafty Shield (blocks status moves).
 *   - Two-turn moves: Fly, Dig, Dive, Bounce, Phantom Force, Shadow Force, etc.
 *   - Drain effects: data-driven (Giga Drain 50%, Drain Kiss 75%, etc.)
 *   - Powder immunity: Grass types + Overcoat + Safety Goggles.
 *
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: references/pokemon-showdown/data/mods/gen8/moves.ts
 * Source: Bulbapedia -- individual move pages
 */

import type { MoveEffectContext, MoveEffectResult } from "@pokemon-lib-ts/battle";
import type { SeededRandom, VolatileStatus } from "@pokemon-lib-ts/core";

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
// Aurora Veil constants (carried forward from Gen 7)
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

// ---------------------------------------------------------------------------
// Protect Variant Handlers
// ---------------------------------------------------------------------------

/**
 * Handle King's Shield move effect (Gen 7+ version, unchanged in Gen 8).
 *
 * Priority +4 protect variant. Blocks moves with `flags.protect` EXCEPT Status moves.
 * Contact penalty is -2 Attack (Gen 7+ behavior).
 * Uses the stalling mechanic.
 *
 * Source: references/pokemon-showdown/data/mods/gen7/moves.ts lines 558-588
 * Source: Showdown data/moves.ts -- kingsshield: stallingMove: true, volatileStatus: 'kingsshield'
 */
function handleKingsShield(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: "kings-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

/**
 * Handle Spiky Shield move effect (carried forward from Gen 6).
 *
 * Priority +4 protect variant. Blocks ALL moves with `flags.protect`.
 * Contact attackers take 1/8 of their own max HP as damage.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- spikyshield:
 *   condition.onTryHit: if (!move.flags['protect']) return;
 *   if contact: this.damage(source.baseMaxhp / 8, ...)
 */
function handleSpikyShield(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: "spiky-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

/**
 * Handle Mat Block move effect (carried forward from Gen 6).
 *
 * Priority 0 team-side protect. First turn only.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- matblock:
 *   onTry: if (source.activeMoveActions > 1) return false;
 */
function handleMatBlock(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  if (ctx.attacker.turnsOnField > 0) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: "mat-block",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected the team with Mat Block!"],
  };
}

/**
 * Handle Crafty Shield move effect (carried forward from Gen 6).
 *
 * Priority +3 team-side protect. Blocks status moves targeting the side.
 * Does NOT use the stalling mechanic.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- craftyshield (no stallingMove)
 */
function handleCraftyShield(ctx: MoveEffectContext): MoveEffectResult {
  const base = createBaseResult();

  return {
    ...base,
    selfVolatileInflicted: "crafty-shield",
    selfVolatileData: { turnsLeft: 1 },
    messages: [`${ctx.attacker.pokemon.nickname ?? "The Pokemon"} used Crafty Shield!`],
  };
}

/**
 * Handle Baneful Bunker move effect (Gen 7+, unchanged in Gen 8).
 *
 * Priority +4 protect variant. Blocks ALL moves with `flags.protect`.
 * Contact moves that are blocked cause the attacker to be poisoned.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- banefulbunker:
 *   stallingMove: true, condition.onTryHit: if contact -> trySetStatus('psn')
 */
function handleBanefulBunker(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: "baneful-bunker",
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

/**
 * Handle Obstruct move effect (NEW in Gen 8).
 *
 * Priority +4 protect variant. Blocks moves with `flags.protect`.
 * When hit by a CONTACT move, lowers attacker's Defense by 2 stages.
 * Uses the stalling mechanic.
 *
 * Source: Showdown data/moves.ts -- obstruct:
 *   stallingMove: true, volatileStatus: 'obstruct'
 *   condition.onTryHit: if (!move.flags['protect']) return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.boost({ def: -2 }, source, target);
 */
function handleObstruct(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult {
  const base = createBaseResult();

  if (!rollProtectSuccess(ctx.attacker.consecutiveProtects, rng)) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: "obstruct" as VolatileStatus,
    selfVolatileData: { turnsLeft: 1 },
    messages: ["The Pokemon protected itself!"],
  };
}

// ---------------------------------------------------------------------------
// Protect Checking Functions (exported for engine use)
// ---------------------------------------------------------------------------

/**
 * Check if a move would be blocked by King's Shield (Gen 7+ version).
 *
 * King's Shield blocks moves with flags.protect EXCEPT Status category moves.
 * Contact penalty is -2 Attack.
 *
 * Source: references/pokemon-showdown/data/mods/gen7/moves.ts lines 566-581
 *   onTryHit: if (!move.flags['protect'] || move.category === 'Status') return;
 *   if contact: this.boost({ atk: -2 }, ...)
 */
export function isBlockedByKingsShield(
  moveCategory: string,
  moveHasProtectFlag: boolean,
  moveHasContactFlag: boolean,
): { blocked: boolean; contactPenalty: boolean; attackDropStages: number } {
  if (!moveHasProtectFlag || moveCategory === "status") {
    return { blocked: false, contactPenalty: false, attackDropStages: 0 };
  }
  return {
    blocked: true,
    contactPenalty: moveHasContactFlag,
    // Gen 7+: -2 Attack on contact
    // Source: Showdown mods/gen7/moves.ts -- this.boost({ atk: -2 }, ...)
    attackDropStages: moveHasContactFlag ? -2 : 0,
  };
}

/**
 * Check if a move would be blocked by Spiky Shield.
 *
 * Blocks ALL moves with flags.protect (including Status).
 * Contact attackers take 1/8 max HP damage.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- spikyshield:
 *   onTryHit: if (!move.flags['protect']) return;
 *   if contact: this.damage(source.baseMaxhp / 8, ...)
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
 * Blocks damaging moves (not Status, not self-targeting) with flags.protect.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- matblock:
 *   onTryHit: if (!move.flags['protect']) return;
 *     if (move.target === 'self' || move.category === 'Status') return;
 */
export function isBlockedByMatBlock(
  moveCategory: string,
  moveHasProtectFlag: boolean,
  moveTarget: string,
): boolean {
  if (!moveHasProtectFlag) return false;
  if (moveTarget === "self" || moveCategory === "status") return false;
  return true;
}

/**
 * Check if a move would be blocked by Crafty Shield.
 *
 * Blocks Status moves targeting the opponent's side.
 * Moves targeting 'self', 'all', 'entire-field', 'foe-field', 'user-field' are NOT blocked.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- craftyshield:
 *   onTryHit: if (['self', 'all'].includes(move.target) || move.category !== 'Status') return;
 */
export function isBlockedByCraftyShield(moveCategory: string, moveTarget: string): boolean {
  if (moveCategory !== "status") return false;
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
 * Blocks ALL moves with flags.protect. Contact moves poison the attacker.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- banefulbunker:
 *   onTryHit: if (!move.flags['protect']) return;
 *   if contact: source.trySetStatus('psn', target);
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
 * Check if a move would be blocked by Obstruct (NEW in Gen 8).
 *
 * Blocks moves with flags.protect (like Protect).
 * Contact moves that are blocked lower the attacker's Defense by 2 stages.
 *
 * Source: Showdown data/moves.ts -- obstruct:
 *   condition.onTryHit: if (!move.flags['protect']) return;
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.boost({ def: -2 }, source, target);
 */
export function isBlockedByObstruct(
  moveHasProtectFlag: boolean,
  moveHasContactFlag: boolean,
): { blocked: boolean; contactPenalty: boolean; defenseDropStages: number } {
  if (!moveHasProtectFlag) {
    return { blocked: false, contactPenalty: false, defenseDropStages: 0 };
  }
  return {
    blocked: true,
    contactPenalty: moveHasContactFlag,
    // Source: Showdown data/moves.ts -- obstruct: this.boost({ def: -2 }, source, target)
    defenseDropStages: moveHasContactFlag ? -2 : 0,
  };
}

/**
 * Calculate Obstruct defense drop penalty.
 *
 * When a contact move is blocked by Obstruct, the attacker's Defense drops by 2 stages.
 *
 * Source: Showdown data/moves.ts -- obstruct onHit:
 *   if (this.checkMoveMakesContact(move, source, target))
 *     this.boost({ def: -2 }, source, target);
 *
 * @param contactMade - Whether the blocked move makes contact
 * @returns Object with defenseStages penalty (-2 if contact, 0 otherwise)
 */
export function calculateObstructPenalty(contactMade: boolean): { defenseStages: number } {
  return { defenseStages: contactMade ? -2 : 0 };
}

/**
 * Calculate Spiky Shield contact damage.
 *
 * When a contact move is blocked by Spiky Shield, the attacker takes 1/8 of their
 * own max HP as damage.
 *
 * Source: references/pokemon-showdown/data/moves.ts -- spikyshield:
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
// Rapid Spin (Gen 8 buff)
// ---------------------------------------------------------------------------

/**
 * Get the Speed boost granted by Rapid Spin in Gen 8.
 *
 * In Gen 8, Rapid Spin grants +1 Speed on successful hit (new mechanic).
 * BP was also buffed from 20 to 50, but that's handled in move data.
 *
 * Source: Showdown data/moves.ts -- rapidSpin Gen 8: onAfterHit: this.boost({ spe: 1 })
 * Source: Bulbapedia -- "Starting in Generation VIII, Rapid Spin also raises the
 *   user's Speed by one stage."
 *
 * @param moveId - The ID of the move used
 * @param hitSuccess - Whether the move successfully hit the target
 * @returns Object with speedStages boost (1 if Rapid Spin hit, 0 otherwise)
 */
export function getRapidSpinSpeedBoost(
  moveId: string,
  hitSuccess: boolean,
): { speedStages: number } {
  if (moveId === "rapid-spin" && hitSuccess) {
    return { speedStages: 1 };
  }
  return { speedStages: 0 };
}

// ---------------------------------------------------------------------------
// Defog (Gen 8 enhancement)
// ---------------------------------------------------------------------------

/**
 * All hazard types that Gen 8 Defog removes.
 *
 * Source: Showdown data/moves.ts -- defog Gen 8 onHit: removes all hazards,
 *   screens, terrain from both sides
 */
const DEFOG_CLEARABLE_HAZARDS = [
  "stealth-rock",
  "spikes",
  "toxic-spikes",
  "sticky-web",
  "g-max-steelsurge",
] as const;

/**
 * All screen types that Gen 8 Defog removes.
 *
 * Source: Showdown data/moves.ts -- defog Gen 8 onHit:
 *   target.side.removeSideCondition('auroraveil');
 *   target.side.removeSideCondition('safeguard');
 *   target.side.removeSideCondition('mist');
 */
const DEFOG_CLEARABLE_SCREENS = ["aurora-veil", "safeguard", "mist"] as const;

/**
 * Execute Gen 8 Defog effect.
 *
 * Standard Defog (Gen 4+): removes hazards from target's side, lowers evasion by 1.
 * Gen 6+: also removes hazards from the user's side.
 * Gen 8 enhancement: also clears terrain AND removes Aurora Veil, Safeguard, Mist
 * from both sides, plus G-Max Steelsurge.
 *
 * Source: Showdown data/moves.ts -- defog Gen 8 onHit:
 *   Removes: Stealth Rock, Spikes, Toxic Spikes, Sticky Web, G-Max Steelsurge (both sides)
 *   Removes: Aurora Veil, Safeguard, Mist (both sides)
 *   Clears: terrain (any active terrain)
 *
 * @param userSideHazards - Array of hazard type strings on the user's side
 * @param targetSideHazards - Array of hazard type strings on the target's side
 * @param userSideScreens - Array of screen type strings on the user's side
 * @param targetSideScreens - Array of screen type strings on the target's side
 * @param activeTerrain - The currently active terrain type, or null
 * @returns Object describing what was cleared
 */
export function executeGen8Defog(
  userSideHazards: readonly string[],
  targetSideHazards: readonly string[],
  userSideScreens: readonly string[],
  targetSideScreens: readonly string[],
  activeTerrain: string | null,
): { clearedHazards: string[]; clearedScreens: string[]; clearedTerrain: boolean } {
  const clearedHazards: string[] = [];
  const clearedScreens: string[] = [];

  // Clear hazards from target side
  for (const hazard of targetSideHazards) {
    if ((DEFOG_CLEARABLE_HAZARDS as readonly string[]).includes(hazard)) {
      clearedHazards.push(hazard);
    }
  }

  // Clear hazards from user side (Gen 6+ behavior)
  // Source: Showdown data/moves.ts -- defog: source.side.removeSideCondition(...)
  for (const hazard of userSideHazards) {
    if ((DEFOG_CLEARABLE_HAZARDS as readonly string[]).includes(hazard)) {
      clearedHazards.push(hazard);
    }
  }

  // Clear screens from both sides
  for (const screen of targetSideScreens) {
    if ((DEFOG_CLEARABLE_SCREENS as readonly string[]).includes(screen)) {
      clearedScreens.push(screen);
    }
  }
  for (const screen of userSideScreens) {
    if ((DEFOG_CLEARABLE_SCREENS as readonly string[]).includes(screen)) {
      clearedScreens.push(screen);
    }
  }

  // Clear terrain
  // Source: Showdown data/moves.ts -- defog Gen 8: this.field.clearTerrain()
  const clearedTerrain = activeTerrain !== null;

  return { clearedHazards, clearedScreens, clearedTerrain };
}

// ---------------------------------------------------------------------------
// Steel Beam
// ---------------------------------------------------------------------------

/**
 * Check if a move is Steel Beam (for mindBlownRecoil behavior).
 *
 * Steel Beam has the mindBlownRecoil flag: the user loses half their max HP
 * regardless of whether the move hits or misses.
 *
 * Source: Showdown data/moves.ts -- steelbeam: mindBlownRecoil: true
 *
 * @param moveId - The ID of the move
 * @returns true if the move is Steel Beam
 */
export function isSteelBeamRecoil(moveId: string): boolean {
  return moveId === "steel-beam";
}

/**
 * Calculate Steel Beam recoil damage.
 *
 * The user loses half their max HP (rounded normally) regardless of hit/miss.
 * Uses Math.round (matching mindBlownRecoil behavior in Showdown).
 *
 * Source: Showdown data/moves.ts -- steelbeam: mindBlownRecoil flag
 * Source: Showdown sim/battle-actions.ts -- mindBlownRecoil: Math.round(pokemon.maxhp / 2)
 *
 * @param maxHp - The user's maximum HP
 * @returns The recoil damage amount
 */
export function calculateSteelBeamRecoil(maxHp: number): number {
  return Math.round(maxHp / 2);
}

// ---------------------------------------------------------------------------
// Body Press (flag only -- calc in Gen8DamageCalc)
// ---------------------------------------------------------------------------

/**
 * Check if a move is Body Press.
 *
 * Body Press uses the user's Defense stat instead of Attack for damage calculation.
 * The actual stat substitution is handled in Gen8DamageCalc.ts.
 *
 * Source: Showdown data/moves.ts -- bodypress: overrideOffensiveStat: 'def'
 *
 * @param moveId - The ID of the move
 * @returns true if the move is Body Press
 */
export function isBodyPress(moveId: string): boolean {
  return moveId === "body-press";
}

// ---------------------------------------------------------------------------
// Anti-Dynamax Moves (flag only -- calc in Gen8DamageCalc)
// ---------------------------------------------------------------------------

/**
 * Check if a move deals double damage to Dynamaxed targets.
 *
 * Behemoth Blade, Behemoth Bash, and Dynamax Cannon deal 2x damage vs Dynamaxed
 * Pokemon. The actual damage doubling is handled in Gen8DamageCalc.ts.
 *
 * Source: Showdown data/conditions.ts:785-786 -- Dynamax condition:
 *   if (move.id === 'behemothbash' || move.id === 'behemothblade' || move.id === 'dynamaxcannon')
 *     return this.chainModify(2);
 *
 * @param moveId - The ID of the move
 * @returns true if the move is an anti-Dynamax move
 */
export function isAntiDynamaxMove(moveId: string): boolean {
  return moveId === "behemoth-blade" || moveId === "behemoth-bash" || moveId === "dynamax-cannon";
}

// ---------------------------------------------------------------------------
// No Retreat
// ---------------------------------------------------------------------------

/**
 * Handle No Retreat move effect.
 *
 * Raises all of the user's stats (Attack, Defense, Sp.Atk, Sp.Def, Speed) by 1 stage
 * and prevents the user from switching out by setting the 'no-retreat' volatile.
 * Fails if the user already has the no-retreat volatile.
 *
 * Source: Showdown data/moves.ts -- noretreat:
 *   onTry: if (source.volatiles['noretreat']) return false;
 *   boosts: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }
 *   volatileStatus: 'noretreat'
 *   condition: { onTrapPokemon(pokemon) { pokemon.tryTrap(); } }
 * Source: Bulbapedia -- "No Retreat raises the user's Attack, Defense, Special Attack,
 *   Special Defense, and Speed by one stage each. It also prevents the user from
 *   switching out or fleeing."
 *
 * @param hasNoRetreatAlready - Whether the user already has the no-retreat volatile
 * @returns MoveEffectResult with stat boosts and volatile, or failure message
 */
export function handleNoRetreat(hasNoRetreatAlready: boolean): MoveEffectResult {
  const base = createBaseResult();

  // Fails if already used
  // Source: Showdown -- onTry: if (source.volatiles['noretreat']) return false;
  if (hasNoRetreatAlready) {
    return {
      ...base,
      messages: ["But it failed!"],
    };
  }

  return {
    ...base,
    selfVolatileInflicted: "no-retreat",
    selfVolatileData: { turnsLeft: -1 }, // Permanent until switch
    statChanges: [
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "defense", stages: 1 },
      { target: "attacker", stat: "spAttack", stages: 1 },
      { target: "attacker", stat: "spDefense", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ],
    messages: ["The Pokemon boosted all its stats and can no longer switch out!"],
  };
}

// ---------------------------------------------------------------------------
// Tar Shot
// ---------------------------------------------------------------------------

/**
 * Handle Tar Shot move effect.
 *
 * Lowers the target's Speed by 1 stage and sets the 'tar-shot' volatile on the target.
 * The tar-shot volatile makes the target take 2x damage from Fire-type moves
 * (essentially adding a Fire weakness).
 *
 * Source: Showdown data/moves.ts -- tarshot:
 *   boosts: { spe: -1 }
 *   volatileStatus: 'tarshot'
 *   condition: { onModifyTypePriority: -2, onEffectiveness:
 *     if (type === 'Fire') return typeMod + 1; }
 * Source: Bulbapedia -- "Tar Shot lowers the target's Speed stat by one stage.
 *   It also makes the target weak to Fire-type moves."
 *
 * @param targetHasTarShot - Whether the target already has the tar-shot volatile
 * @returns MoveEffectResult with speed drop and volatile
 */
export function handleTarShot(targetHasTarShot: boolean): MoveEffectResult {
  const base = createBaseResult();

  // Speed drop always applies, but volatile only sets once
  // Source: Showdown -- boosts always apply; volatileStatus set separately
  const result: MoveEffectResult = {
    ...base,
    statChanges: [{ target: "defender", stat: "speed", stages: -1 }],
    messages: [],
  };

  if (!targetHasTarShot) {
    return {
      ...result,
      volatileInflicted: "tar-shot",
      volatileData: { turnsLeft: -1 }, // Permanent until switch
      messages: ["The target became weaker to fire!"],
    };
  }

  return result;
}

/**
 * Check if a target has the Tar Shot volatile active.
 *
 * When Tar Shot is active, Fire-type moves deal double damage to the target.
 *
 * Source: Showdown data/moves.ts -- tarshot condition.onEffectiveness:
 *   if (type === 'Fire') return typeMod + 1;
 *
 * @param targetVolatiles - The target's volatile statuses map
 * @returns true if the target has tar-shot volatile
 */
export function isTarShotActive(targetVolatiles: ReadonlyMap<string, unknown>): boolean {
  return targetVolatiles.has("tar-shot");
}

// ---------------------------------------------------------------------------
// Jaw Lock
// ---------------------------------------------------------------------------

/**
 * Handle Jaw Lock move effect.
 *
 * Traps both the user and the target (neither can switch) as long as both
 * remain on the field. Sets volatile on both sides.
 *
 * Source: Showdown data/moves.ts -- jawlock:
 *   onHit: source.addVolatile('jawlock', target); target.addVolatile('jawlock', source);
 *   condition: { onTrapPokemon(pokemon) { if counterpart still active: pokemon.tryTrap(); } }
 * Source: Bulbapedia -- "Jaw Lock prevents the user and the target from switching out
 *   or fleeing."
 *
 * @returns MoveEffectResult with volatiles set on both user and target
 */
export function handleJawLock(): MoveEffectResult {
  const base = createBaseResult();

  return {
    ...base,
    // Set trapped volatile on the defender
    volatileInflicted: "jaw-lock" as VolatileStatus,
    volatileData: { turnsLeft: -1 }, // Permanent until either switches
    // Set trapped volatile on the attacker (self)
    selfVolatileInflicted: "jaw-lock" as VolatileStatus,
    selfVolatileData: { turnsLeft: -1 },
    messages: ["Neither Pokemon can switch out!"],
  };
}

// ---------------------------------------------------------------------------
// Clangorous Soul
// ---------------------------------------------------------------------------

/**
 * Calculate the HP cost for Clangorous Soul.
 *
 * The user loses 1/3 of its max HP (rounded down) to gain +1 to all stats.
 *
 * Source: Showdown data/moves.ts -- clangoroussoul:
 *   onTry: if (pokemon.hp <= Math.floor(pokemon.maxhp / 3) || ...) return false;
 *   The cost is Math.floor(pokemon.maxhp / 3)
 * Source: Bulbapedia -- "Clangorous Soul causes the user to lose 1/3 of its maximum HP"
 *
 * @param maxHp - The user's maximum HP
 * @returns The HP cost (floor(maxHp / 3))
 */
export function calculateClangorousSoulCost(maxHp: number): number {
  return Math.floor(maxHp / 3);
}

// ---------------------------------------------------------------------------
// Fishious Rend / Bolt Beak
// ---------------------------------------------------------------------------

/**
 * Get the effective base power for Fishious Rend or Bolt Beak.
 *
 * These moves have 85 BP normally, but double to 170 BP if the user moves
 * before the target (i.e., the user moved first this turn).
 *
 * Source: Showdown data/moves.ts -- fishouisrend / boltbeak:
 *   basePowerCallback(pokemon, target, move) {
 *     if (target.newlySwitched || this.queue.willMove(target))
 *       return move.basePower * 2;
 *     return move.basePower;
 *   }
 * Source: Bulbapedia -- "If the user moves before the target, the power of
 *   Fishious Rend doubles from 85 to 170."
 *
 * @param moveId - The ID of the move ('fishious-rend' or 'bolt-beak')
 * @param userMovedFirst - Whether the user moved before the target this turn
 * @returns The effective base power (85 or 170)
 */
export function getFishiousBoltBeakPower(moveId: string, userMovedFirst: boolean): number {
  if ((moveId === "fishious-rend" || moveId === "bolt-beak") && userMovedFirst) {
    // Source: Showdown -- basePower * 2 = 85 * 2 = 170
    return 170;
  }
  // Source: Showdown -- basePower: 85
  return 85;
}

// ---------------------------------------------------------------------------
// Drain Effects (carried forward from Gen 7)
// ---------------------------------------------------------------------------

/**
 * Handle data-driven drain effects for Gen 8.
 *
 * Same logic as Gen 7. Reads `effect.type === "drain"` and computes healAmount.
 *
 * Key interactions:
 *   - Big Root: 1.3x drain healing
 *   - Liquid Ooze: attacker takes damage instead of healing
 *
 * Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
 * Source: Showdown data/items.ts -- bigroot: 1.3x for drain
 * Source: Showdown data/abilities.ts -- liquidooze: damage instead of heal
 */
export function handleDrainEffect(ctx: MoveEffectContext): MoveEffectResult | null {
  if (ctx.move.effect?.type !== "drain") return null;

  // Guard: no drain effect if move dealt no damage
  // Source: Showdown sim/battle-actions.ts -- drain only triggers when damage > 0
  if (ctx.damage <= 0) return null;

  const drainFraction = ctx.move.effect.amount;
  let healAmount = Math.floor(ctx.damage * drainFraction);

  // Big Root: increases drain healing by 30%
  // Source: Showdown data/items.ts -- bigroot: ~1.3x
  if (ctx.attacker.pokemon.heldItem === "big-root") {
    healAmount = Math.floor(healAmount * 1.3);
  }

  // Liquid Ooze: attacker takes damage instead of healing
  // Source: Showdown data/abilities.ts -- liquidooze: return -heal
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
 * Check if a powder/spore move is blocked in Gen 8.
 *
 * Grass-type Pokemon are immune to all powder moves (Gen 6+).
 * Overcoat ability also blocks powder moves.
 * Safety Goggles item also blocks powder moves.
 *
 * Source: Showdown data/moves.ts -- powder moves: if (target.hasType('Grass')) return null;
 * Source: Showdown data/abilities.ts -- overcoat: onTryHit for powder
 * Source: Showdown data/items.ts -- safetygoggles: onTryHit for powder
 * Source: Bulbapedia -- "Grass-type Pokemon are immune to powder and spore moves."
 *
 * @param targetTypes - The defending Pokemon's current type(s)
 * @param abilityId - The defending Pokemon's ability
 * @param heldItem - The defending Pokemon's held item
 * @returns true if the move is blocked
 */
export function isGen8GrassPowderBlocked(
  targetTypes: readonly string[],
  abilityId: string,
  heldItem: string | null,
): boolean {
  // Grass types are immune to powder moves
  if (targetTypes.includes("grass")) return true;
  // Overcoat blocks powder moves
  if (abilityId === "overcoat") return true;
  // Safety Goggles blocks powder moves
  if (heldItem === "safety-goggles") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Two-Turn Move Handlers (carried forward from Gen 7)
// ---------------------------------------------------------------------------

/**
 * Two-turn volatile map for Gen 8 moves.
 * Maps move ID to the volatile status applied during the charge turn.
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
 * Handle the charge turn of a two-turn move (carried forward from Gen 7).
 *
 * Source: Showdown data/moves.ts -- two-turn move onTryMove handlers
 */
function handleTwoTurnMove(ctx: MoveEffectContext): MoveEffectResult | null {
  const { attacker, move } = ctx;
  const attackerName = attacker.pokemon.nickname ?? "The Pokemon";

  const volatile = TWO_TURN_VOLATILE_MAP[move.id];
  if (!volatile) return null;

  // If attacker already has the charge volatile, this is the attack turn.
  if (attacker.volatileStatuses.has(volatile)) {
    return null;
  }

  // SolarBeam / SolarBlade in sun: skip charge
  // Source: Showdown -- solarbeam/solarblade fire immediately in sun
  if (
    (move.id === "solar-beam" || move.id === "solar-blade") &&
    ctx.state.weather?.type === "sun"
  ) {
    return createBaseResult();
  }

  // Power Herb: skip charge, consume item
  // Source: Showdown data/items.ts -- powerherb: skip charge turn, consume
  if (attacker.pokemon.heldItem === "power-herb") {
    attacker.pokemon.heldItem = null;
    const base = createBaseResult();
    return {
      ...base,
      messages: [`${attackerName} became fully charged due to its Power Herb!`],
    };
  }

  const moveIndex = attacker.pokemon.moves.findIndex(
    (m: { moveId: string }) => m.moveId === move.id,
  );

  const base = createBaseResult();
  const messageTemplate = TWO_TURN_MESSAGES[move.id] ?? "{pokemon} is charging up!";
  const message = messageTemplate.replace("{pokemon}", attackerName);

  if (moveIndex < 0) return null;

  return {
    ...base,
    forcedMoveSet: {
      moveIndex,
      moveId: move.id,
      volatileStatus: volatile,
    },
    messages: [message],
  };
}

// ---------------------------------------------------------------------------
// Public API -- Master Dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch table for Gen 8 move effects.
 *
 * Handles all Gen 8-specific moves plus carry-forward effects from Gen 7.
 *
 * Returns null if the move is not a recognized Gen 8 move effect,
 * allowing the caller to fall through to BaseRuleset handlers.
 *
 * Source: references/pokemon-showdown/data/moves.ts
 * Source: references/pokemon-showdown/data/mods/gen8/moves.ts
 */
export function executeGen8MoveEffect(
  ctx: MoveEffectContext,
  rng: SeededRandom,
  rollProtectSuccess: (consecutiveProtects: number, rng: SeededRandom) => boolean,
): MoveEffectResult | null {
  switch (ctx.move.id) {
    // --- Protect variants ---
    case "obstruct":
      return handleObstruct(ctx, rng, rollProtectSuccess);
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

    // --- New Gen 8 moves (handled inline) ---
    case "no-retreat": {
      const hasNoRetreat = ctx.attacker.volatileStatuses.has("no-retreat");
      return handleNoRetreat(hasNoRetreat);
    }
    case "tar-shot": {
      const hasTarShot = ctx.defender.volatileStatuses.has("tar-shot");
      return handleTarShot(hasTarShot);
    }
    case "jaw-lock":
      return handleJawLock();

    case "clangorous-soul": {
      const base = createBaseResult();
      const maxHp = ctx.attacker.pokemon.calculatedStats?.hp ?? ctx.attacker.pokemon.currentHp;
      const cost = calculateClangorousSoulCost(maxHp);
      // Fails if user doesn't have enough HP
      // Source: Showdown -- onTry: if (pokemon.hp <= cost) return false;
      if (ctx.attacker.pokemon.currentHp <= cost) {
        return {
          ...base,
          messages: ["But it failed!"],
        };
      }
      return {
        ...base,
        recoilDamage: cost,
        statChanges: [
          { target: "attacker", stat: "attack", stages: 1 },
          { target: "attacker", stat: "defense", stages: 1 },
          { target: "attacker", stat: "spAttack", stages: 1 },
          { target: "attacker", stat: "spDefense", stages: 1 },
          { target: "attacker", stat: "speed", stages: 1 },
        ],
        messages: ["The Pokemon boosted all its stats!"],
      };
    }

    default:
      break;
  }

  // Two-turn moves
  if (ctx.move.id in TWO_TURN_VOLATILE_MAP) {
    return handleTwoTurnMove(ctx);
  }

  // Data-driven drain effects
  const drainResult = handleDrainEffect(ctx);
  if (drainResult !== null) return drainResult;

  return null;
}
