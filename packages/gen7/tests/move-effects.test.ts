import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveTarget } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { beforeAll, describe, expect, it } from "vitest";
import {
  calculateSpikyShieldDamage,
  executeGen7MoveEffect,
  handleDrainEffect,
  isBlockedByBanefulBunker,
  isBlockedByCraftyShield,
  isBlockedByKingsShield,
  isBlockedByMatBlock,
  isBlockedBySpikyShield,
  isGen7GrassPowderBlocked,
} from "../src/Gen7MoveEffects";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  consecutiveProtects?: number;
  turnsOnField?: number;
  nickname?: string;
  maxHp?: number;
  currentHp?: number;
  moves?: Array<{ moveId: string }>;
  types?: readonly string[];
  status?: string | null;
  speciesId?: number;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      moves: overrides.moves ?? [{ moveId: "tackle" }],
      nickname: overrides.nickname ?? null,
      speciesId: overrides.speciesId ?? 25,
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: (overrides.types ?? ["normal"]) as readonly string[],
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    turnsOnField: overrides.turnsOnField ?? 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  } as unknown as ActivePokemon;
}

function makeMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    displayName: id,
    type: "normal",
    category: "status",
    power: null,
    accuracy: null,
    pp: 10,
    priority: 0,
    target: "self" as MoveTarget,
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 7,
    ...overrides,
  } as MoveData;
}

function makeState(overrides?: Partial<BattleState>): BattleState {
  return {
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    weather: null,
    terrain: null,
    rng: new SeededRandom(42),
    ...overrides,
  } as unknown as BattleState;
}

function makeContext(
  moveId: string,
  options?: {
    state?: Partial<BattleState>;
    attacker?: Parameters<typeof makeActivePokemon>[0];
    defender?: Parameters<typeof makeActivePokemon>[0];
    moveOverrides?: Partial<MoveData>;
    damage?: number;
  },
): MoveEffectContext {
  return {
    attacker: makeActivePokemon(options?.attacker ?? {}),
    defender: makeActivePokemon(options?.defender ?? {}),
    move: makeMove(moveId, options?.moveOverrides),
    damage: options?.damage ?? 0,
    state: makeState(options?.state),
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

/** Always-succeed protect roll for testing guard moves */
function alwaysSucceedProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return true;
}

/** Always-fail protect roll for testing guard move failure */
function alwaysFailProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return false;
}

// ===========================================================================
// King's Shield
// ===========================================================================

describe("Gen7 King's Shield -- executeGen7MoveEffect", () => {
  it("given no consecutive protect uses, when King's Shield is used, then succeeds and sets kings-shield volatile", () => {
    // Source: Showdown data/moves.ts -- kingsshield: volatileStatus: 'kingsshield', duration: 1
    const ctx = makeContext("kings-shield");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("kings-shield");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given consecutive protect uses exceeded, when King's Shield is used, then fails", () => {
    // Source: Showdown data/moves.ts -- stallingMove: true, stall counter shared with Protect
    const ctx = makeContext("kings-shield");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given attacker has consecutiveProtects=3, when King's Shield used, then passes correct count to rollProtectSuccess", () => {
    // Source: Showdown -- King's Shield shares stall counter with Protect
    const ctx = makeContext("kings-shield", { attacker: { consecutiveProtects: 3 } });
    const rng = new SeededRandom(42);

    let capturedCount = -1;
    const captureProtectRoll = (count: number, _rng: SeededRandom): boolean => {
      capturedCount = count;
      return true;
    };

    executeGen7MoveEffect(ctx, rng, captureProtectRoll);
    expect(capturedCount).toBe(3);
  });
});

describe("Gen7 isBlockedByKingsShield", () => {
  it("given physical contact move with protect flag, when checking, then blocked with -2 Attack penalty", () => {
    // Source: Showdown mods/gen7/moves.ts line 580 -- this.boost({ atk: -2 }, ...)
    // Gen 7 changed contact penalty from -1 (Gen 6) to -2.
    const result = isBlockedByKingsShield("physical", true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
    expect(result.attackDropStages).toBe(-2);
  });

  it("given physical non-contact move with protect flag, when checking, then blocked without penalty", () => {
    // Source: Showdown -- blocked but no contact means no boost
    const result = isBlockedByKingsShield("physical", true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(false);
    expect(result.attackDropStages).toBe(0);
  });

  it("given status move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown mods/gen7/moves.ts line 567 --
    //   if (!move.flags['protect'] || move.category === 'Status') return;
    const result = isBlockedByKingsShield("status", true, false);
    expect(result.blocked).toBe(false);
    expect(result.contactPenalty).toBe(false);
  });

  it("given special contact move with protect flag, when checking, then blocked with -2 Attack penalty", () => {
    // Source: Showdown -- only Status excluded; Special moves with contact ARE blocked
    const result = isBlockedByKingsShield("special", true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
    expect(result.attackDropStages).toBe(-2);
  });

  it("given physical move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect'] || ...) return;
    const result = isBlockedByKingsShield("physical", false, true);
    expect(result.blocked).toBe(false);
  });
});

// ===========================================================================
// Spiky Shield
// ===========================================================================

describe("Gen7 Spiky Shield -- executeGen7MoveEffect", () => {
  it("given no consecutive protect uses, when Spiky Shield is used, then succeeds and sets volatile", () => {
    // Source: Showdown data/moves.ts -- spikyshield: volatileStatus, duration: 1
    const ctx = makeContext("spiky-shield");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("spiky-shield");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given stalling check fails, when Spiky Shield is used, then fails", () => {
    // Source: Showdown -- stallingMove: true
    const ctx = makeContext("spiky-shield");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen7 isBlockedBySpikyShield", () => {
  it("given physical contact move with protect flag, when checking, then blocked with contact damage", () => {
    // Source: Showdown data/moves.ts -- spikyshield: if contact, damage 1/8 max HP
    const result = isBlockedBySpikyShield(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(true);
  });

  it("given status move with protect flag, when checking, then blocked (unlike King's Shield)", () => {
    // Source: Showdown -- Spiky Shield checks only flags.protect, no category exception
    const result = isBlockedBySpikyShield(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    const result = isBlockedBySpikyShield(false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactDamage).toBe(false);
  });
});

describe("Gen7 calculateSpikyShieldDamage", () => {
  it("given attacker with 200 max HP, when calculating contact damage, then returns 25 (floor(200/8))", () => {
    // Source: Showdown -- this.damage(source.baseMaxhp / 8, ...)
    // 200 / 8 = 25
    expect(calculateSpikyShieldDamage(200)).toBe(25);
  });

  it("given attacker with 7 max HP, when calculating contact damage, then returns 1 (minimum)", () => {
    // Source: Showdown -- damage function enforces minimum 1
    // floor(7 / 8) = 0, clamped to 1
    expect(calculateSpikyShieldDamage(7)).toBe(1);
  });

  it("given attacker with 300 max HP, when calculating contact damage, then returns 37 (floor(300/8))", () => {
    // Source: Showdown -- floor(300/8) = 37
    expect(calculateSpikyShieldDamage(300)).toBe(37);
  });
});

// ===========================================================================
// Baneful Bunker (NEW in Gen 7)
// ===========================================================================

describe("Gen7 Baneful Bunker -- executeGen7MoveEffect", () => {
  it("given no consecutive protect uses, when Baneful Bunker is used, then succeeds and sets baneful-bunker volatile", () => {
    // Source: Showdown data/moves.ts -- banefulbunker: volatileStatus: 'banefulbunker', duration: 1
    const ctx = makeContext("baneful-bunker");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("baneful-bunker");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given stalling check fails, when Baneful Bunker is used, then fails", () => {
    // Source: Showdown -- stallingMove: true
    const ctx = makeContext("baneful-bunker");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given attacker has consecutiveProtects=2, when Baneful Bunker used, then passes correct count", () => {
    // Source: Showdown -- Baneful Bunker shares stall counter with Protect
    const ctx = makeContext("baneful-bunker", { attacker: { consecutiveProtects: 2 } });
    const rng = new SeededRandom(42);

    let capturedCount = -1;
    const captureProtectRoll = (count: number, _rng: SeededRandom): boolean => {
      capturedCount = count;
      return true;
    };

    executeGen7MoveEffect(ctx, rng, captureProtectRoll);
    expect(capturedCount).toBe(2);
  });
});

describe("Gen7 isBlockedByBanefulBunker", () => {
  it("given physical contact move with protect flag, when checking, then blocked with contact poison", () => {
    // Source: Showdown data/moves.ts lines 1059-1060 --
    //   if (this.checkMoveMakesContact(move, source, target))
    //     source.trySetStatus('psn', target);
    const result = isBlockedByBanefulBunker(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPoison).toBe(true);
  });

  it("given status move with protect flag and no contact, when checking, then blocked without poison", () => {
    // Source: Showdown data/moves.ts -- Baneful Bunker blocks ALL moves with protect flag
    //   (unlike King's Shield, it does NOT exclude Status moves)
    const result = isBlockedByBanefulBunker(true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPoison).toBe(false);
  });

  it("given move without protect flag and no contact, when checking, then NOT blocked and no poison", () => {
    // Source: Showdown -- if (!move.flags['protect']) return; -- both false means neither blocked nor poisoned
    const result = isBlockedByBanefulBunker(false, false);
    expect(result.blocked).toBe(false);
    expect(result.contactPoison).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown data/moves.ts line 1042 -- if (!move.flags['protect']) return;
    const result = isBlockedByBanefulBunker(false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactPoison).toBe(false);
  });
});

// ===========================================================================
// Mat Block
// ===========================================================================

describe("Gen7 Mat Block -- executeGen7MoveEffect", () => {
  it("given first turn (turnsOnField=0), when Mat Block is used, then succeeds and sets volatile", () => {
    // Source: Showdown data/moves.ts -- matblock: onTry checks activeMoveActions
    //   In our system, turnsOnField === 0 means first turn
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 0 } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("mat-block");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("Mat Block");
  });

  it("given second turn (turnsOnField=1), when Mat Block is used, then fails", () => {
    // Source: Showdown -- onTry: if (source.activeMoveActions > 1) return false;
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 1 } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given first turn but stalling check fails, when Mat Block is used, then fails", () => {
    // Source: Showdown -- stallingMove: true; if stall check fails, move fails
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 0 } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen7 isBlockedByMatBlock", () => {
  it("given physical move with protect flag, when checking, then blocked", () => {
    // Source: Showdown -- blocks damaging moves with protect flag
    expect(isBlockedByMatBlock("physical", true, "normal")).toBe(true);
  });

  it("given status move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (move.target === 'self' || move.category === 'Status') return;
    expect(isBlockedByMatBlock("status", true, "normal")).toBe(false);
  });

  it("given self-targeting move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (move.target === 'self' || ...) return;
    expect(isBlockedByMatBlock("physical", true, "self")).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    expect(isBlockedByMatBlock("physical", false, "normal")).toBe(false);
  });
});

// ===========================================================================
// Crafty Shield
// ===========================================================================

describe("Gen7 Crafty Shield -- executeGen7MoveEffect", () => {
  it("given Crafty Shield used, when called, then succeeds without stall check and sets volatile", () => {
    // Source: Showdown data/moves.ts -- craftyshield has no stallingMove property
    // It succeeds even when protect roll would fail
    const ctx = makeContext("crafty-shield", { attacker: { nickname: "Klefki" } });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("crafty-shield");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("Crafty Shield");
  });
});

describe("Gen7 isBlockedByCraftyShield", () => {
  it("given status move targeting normal, when checking, then blocked", () => {
    // Source: Showdown -- blocks status moves that don't target self or all
    expect(isBlockedByCraftyShield("status", "normal")).toBe(true);
  });

  it("given status move targeting self, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (['self', 'all'].includes(move.target)) return;
    expect(isBlockedByCraftyShield("status", "self")).toBe(false);
  });

  it("given status move targeting entire-field, when checking, then NOT blocked", () => {
    // Source: Showdown -- 'all' maps to our 'entire-field' for field-wide moves
    expect(isBlockedByCraftyShield("status", "entire-field")).toBe(false);
  });

  it("given physical move targeting normal, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (... move.category !== 'Status') return;
    expect(isBlockedByCraftyShield("physical", "normal")).toBe(false);
  });

  it("given stealth-rock (target foe-field), when checking, then NOT blocked", () => {
    // Source: Bulbapedia -- Crafty Shield does not protect against entry hazards
    // Source: Showdown data/moves.ts -- stealth-rock target: foeSide (maps to foe-field)
    expect(isBlockedByCraftyShield("status", "foe-field")).toBe(false);
  });

  it("given spikes (target foe-field), when checking, then NOT blocked", () => {
    // Source: Bulbapedia -- entry hazard moves pass through Crafty Shield
    // Source: Showdown data/moves.ts -- spikes target: foeSide
    expect(isBlockedByCraftyShield("status", "foe-field")).toBe(false);
  });

  it("given user-field targeting status move, when checking, then NOT blocked", () => {
    // Source: Showdown -- user-field hazards (e.g. Sticky Web vs opponent side) are side-condition setters
    // that should pass through Crafty Shield per Bulbapedia ruling
    expect(isBlockedByCraftyShield("status", "user-field")).toBe(false);
  });
});

// ===========================================================================
// Drain Effects
// ===========================================================================

describe("Gen7 Drain Effects -- handleDrainEffect", () => {
  it("given Giga Drain dealing 100 damage with 50% drain, when handling, then heals 50 HP", () => {
    // Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
    // 100 * 0.5 = 50
    const ctx = makeContext("giga-drain", {
      damage: 100,
      moveOverrides: {
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(50);
    expect(result!.recoilDamage).toBe(0);
  });

  it("given Draining Kiss dealing 80 damage with 75% drain, when handling, then heals 60 HP", () => {
    // Source: Showdown data/moves.ts -- drainingkiss: { drain: [3, 4] } = 75%
    // floor(80 * 0.75) = 60
    const ctx = makeContext("draining-kiss", {
      damage: 80,
      moveOverrides: {
        category: "special",
        power: 50,
        effect: { type: "drain", amount: 0.75 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(60);
  });

  it("given drain move with Big Root, when handling, then heals 30% more (1.3x)", () => {
    // Source: Showdown data/items.ts -- bigroot: this.chainModify([5324, 4096]) ~= 1.3x
    // Source: Bulbapedia -- "Big Root increases the amount of HP recovered by 30%"
    // Base: 100 * 0.5 = 50. With Big Root: floor(50 * 1.3) = 65
    const ctx = makeContext("giga-drain", {
      damage: 100,
      attacker: { heldItem: "big-root" },
      moveOverrides: {
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(65);
  });

  it("given drain move against Liquid Ooze, when handling, then attacker takes damage instead of healing", () => {
    // Source: Showdown data/abilities.ts -- liquidooze: return -heal
    // Source: Bulbapedia -- "Liquid Ooze causes the attacker to lose HP instead of gaining it"
    // Base drain: 100 * 0.5 = 50. Instead of healing 50, take 50 damage.
    const ctx = makeContext("giga-drain", {
      damage: 100,
      defender: { ability: "liquid-ooze" },
      moveOverrides: {
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(0);
    expect(result!.recoilDamage).toBe(50);
    expect(result!.messages[0]).toContain("liquid ooze");
  });

  it("given drain move against Liquid Ooze with zero damage dealt, when handling, then no recoil occurs", () => {
    // Source: Showdown data/abilities.ts -- liquidooze: return -heal
    // When ctx.damage is 0 (e.g., move dealt 0 damage), healAmount=0 and recoil must also be 0.
    // Previously Math.max(1, 0)=1 caused phantom 1-damage recoil even on a 0-damage drain.
    const ctx = makeContext("giga-drain", {
      damage: 0,
      defender: { ability: "liquid-ooze" },
      moveOverrides: {
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    // Wave 6 added an early guard: ctx.damage <= 0 returns null immediately
    // (before the Liquid Ooze check), so no recoil occurs when drain damage is zero.
    // Source: Showdown sim/battle-actions.ts -- drain only triggers when damage > 0
    expect(result).toBeNull();
  });

  it("given move without drain effect, when handling, then returns null", () => {
    // Non-drain moves should fall through
    const ctx = makeContext("tackle", {
      damage: 50,
      moveOverrides: {
        category: "physical",
        power: 40,
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).toBeNull();
  });

  it("given Leech Life dealing 120 damage with 50% drain, when handling, then heals 60 HP", () => {
    // Source: Showdown data/moves.ts -- leechlife: { drain: [1, 2] } = 50%
    // Gen 7 buffed Leech Life to 80 BP (was 20 in Gen 1-6)
    // floor(120 * 0.5) = 60
    const ctx = makeContext("leech-life", {
      damage: 120,
      moveOverrides: {
        category: "physical",
        power: 80,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(60);
  });
});

// ===========================================================================
// Two-Turn Moves
// ===========================================================================

describe("Gen7 Two-Turn Moves -- executeGen7MoveEffect", () => {
  it("given Fly with no charge volatile, when used (charge turn), then sets flying volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- fly: condition.onInvulnerability: false
    //   First turn: charge, become semi-invulnerable (flying)
    const ctx = makeContext("fly", {
      attacker: {
        nickname: "Pidgeot",
        moves: [{ moveId: "fly" }, { moveId: "tackle" }],
      },
      moveOverrides: {
        category: "physical",
        power: 90,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "fly",
      volatileStatus: "flying",
    });
    expect(result!.messages[0]).toBe("Pidgeot flew up high!");
  });

  it("given Fly with flying volatile already set, when used (attack turn), then returns null for engine damage handling", () => {
    // Source: Showdown -- if (attacker.removeVolatile(move.id)) return; (attack turn)
    const chargeVolatiles = new Map<string, { turnsLeft: number }>();
    chargeVolatiles.set("flying", { turnsLeft: 1 });

    const ctx = makeContext("fly", {
      attacker: {
        volatileStatuses: chargeVolatiles,
        moves: [{ moveId: "fly" }],
      },
      moveOverrides: {
        category: "physical",
        power: 90,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    // null means "not handled -- let engine handle normal damage"
    expect(result).toBeNull();
  });

  it("given Dig on charge turn, when used, then sets underground volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- dig: condition volatile "underground"
    const ctx = makeContext("dig", {
      attacker: {
        nickname: "Dugtrio",
        moves: [{ moveId: "dig" }],
      },
      moveOverrides: {
        category: "physical",
        power: 80,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "dig",
      volatileStatus: "underground",
    });
    expect(result!.messages[0]).toBe("Dugtrio dug underground!");
  });

  it("given Dive on charge turn, when used, then sets underwater volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- dive: condition volatile "underwater"
    const ctx = makeContext("dive", {
      attacker: {
        nickname: "Gyarados",
        moves: [{ moveId: "dive" }],
      },
      moveOverrides: {
        category: "physical",
        power: 80,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "dive",
      volatileStatus: "underwater",
    });
    expect(result!.messages[0]).toBe("Gyarados dived underwater!");
  });

  it("given Solar Beam on charge turn WITHOUT sun, when used, then sets charging volatile and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- solarbeam: two-turn move, charge unless sun
    // Source: Bulbapedia -- "Solar Beam requires a turn to charge unless in harsh sunlight."
    const ctx = makeContext("solar-beam", {
      attacker: {
        nickname: "Venusaur",
        moves: [{ moveId: "solar-beam" }],
      },
      moveOverrides: {
        category: "special",
        power: 120,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "solar-beam",
      volatileStatus: "charging",
    });
    expect(result!.messages[0]).toBe("Venusaur is absorbing sunlight!");
  });

  it("given Solar Beam on charge turn WITH sun, when used, then fires immediately (no forcedMoveSet)", () => {
    // Source: Showdown data/moves.ts -- solarbeam: fires immediately in sun
    // Source: Bulbapedia -- "In harsh sunlight, Solar Beam can be used without a charging turn."
    const ctx = makeContext("solar-beam", {
      attacker: {
        nickname: "Venusaur",
        moves: [{ moveId: "solar-beam" }],
      },
      state: { weather: { type: "sun", turnsLeft: 5, source: "drought" } },
      moveOverrides: {
        category: "special",
        power: 120,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toBeUndefined();
  });

  it("given Solar Blade on charge turn WITH sun, when used, then fires immediately (no forcedMoveSet)", () => {
    // Source: Showdown data/moves.ts -- solarblade: same behavior as solarbeam in sun
    // Source: Bulbapedia -- "Solar Blade executes immediately in harsh sunlight."
    const ctx = makeContext("solar-blade", {
      attacker: {
        nickname: "Lurantis",
        moves: [{ moveId: "solar-blade" }],
      },
      state: { weather: { type: "sun", turnsLeft: 5, source: "drought" } },
      moveOverrides: {
        category: "physical",
        power: 125,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toBeUndefined();
  });

  it("given Solar Blade on charge turn WITHOUT sun, when used, then sets charging volatile", () => {
    // Source: Showdown data/moves.ts -- solarblade requires charge without sun
    const ctx = makeContext("solar-blade", {
      attacker: {
        nickname: "Lurantis",
        moves: [{ moveId: "solar-blade" }],
      },
      moveOverrides: {
        category: "physical",
        power: 125,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "solar-blade",
      volatileStatus: "charging",
    });
    expect(result!.messages[0]).toBe("Lurantis is absorbing sunlight!");
  });

  it("given Phantom Force on charge turn, when used, then sets shadow-force-charging and forcedMoveSet", () => {
    // Source: Showdown data/moves.ts -- phantomforce shares shadow-force-charging volatile
    const ctx = makeContext("phantom-force", {
      attacker: {
        nickname: "Trevenant",
        moves: [{ moveId: "phantom-force" }, { moveId: "tackle" }],
      },
      moveOverrides: {
        category: "physical",
        power: 90,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "phantom-force",
      volatileStatus: "shadow-force-charging",
    });
    expect(result!.messages[0]).toBe("Trevenant vanished!");
  });

  it("given Phantom Force with shadow-force-charging volatile, when used (attack turn), then returns null", () => {
    // Source: Showdown -- attack turn: removeVolatile and proceed with damage
    const chargeVolatiles = new Map<string, { turnsLeft: number }>();
    chargeVolatiles.set("shadow-force-charging", { turnsLeft: 1 });

    const ctx = makeContext("phantom-force", {
      attacker: {
        volatileStatuses: chargeVolatiles,
        moves: [{ moveId: "phantom-force" }],
      },
      moveOverrides: {
        category: "physical",
        power: 90,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });

  it("given Shadow Force on charge turn, when used, then sets shadow-force-charging volatile", () => {
    // Source: Showdown data/moves.ts -- shadowforce: condition volatile "shadow-force-charging"
    const ctx = makeContext("shadow-force", {
      attacker: {
        nickname: "Giratina",
        moves: [{ moveId: "shadow-force" }],
      },
      moveOverrides: {
        category: "physical",
        power: 120,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "shadow-force",
      volatileStatus: "shadow-force-charging",
    });
    expect(result!.messages[0]).toBe("Giratina vanished!");
  });

  it("given Sky Attack on charge turn, when used, then sets charging volatile", () => {
    // Source: Showdown data/moves.ts -- skyattack: two-turn move, not semi-invulnerable
    const ctx = makeContext("sky-attack", {
      attacker: {
        nickname: "Moltres",
        moves: [{ moveId: "sky-attack" }],
      },
      moveOverrides: {
        category: "physical",
        power: 140,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "sky-attack",
      volatileStatus: "charging",
    });
    expect(result!.messages[0]).toBe("Moltres is glowing!");
  });

  it("given Fly on charge turn with Power Herb, when used, then fires immediately and skips charge", () => {
    // Source: Showdown data/items.ts -- powerherb: skip charge turn, consume
    // Source: Bulbapedia -- "Power Herb allows the holder to skip the charge turn"
    const ctx = makeContext("fly", {
      attacker: {
        nickname: "Pidgeot",
        heldItem: "power-herb",
        moves: [{ moveId: "fly" }],
      },
      moveOverrides: {
        category: "physical",
        power: 90,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toBeUndefined();
    expect(result!.messages[0]).toContain("Power Herb");
    // Power Herb is consumed (single-use)
    // Source: Showdown data/items.ts -- powerherb onTryMove: item is consumed after activation
    expect(ctx.attacker.pokemon.heldItem).toBeNull();
  });

  it("given Bounce on charge turn, when used, then sets flying volatile", () => {
    // Source: Showdown data/moves.ts -- bounce shares flying volatile with fly
    const ctx = makeContext("bounce", {
      attacker: {
        nickname: "Lopunny",
        moves: [{ moveId: "bounce" }],
      },
      moveOverrides: {
        category: "physical",
        power: 85,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "bounce",
      volatileStatus: "flying",
    });
    expect(result!.messages[0]).toBe("Lopunny sprang up!");
  });

  it("given Fly used when move is not in moveset (Mirror Move scenario), when charging, then returns null", () => {
    // Source: Showdown -- two-turn moves invoked via Mirror Move/Metronome won't be in moveset
    // When findIndex() returns -1, return null to avoid defaulting to slot 0 (wrong move).
    const ctx = makeContext("fly", {
      attacker: {
        nickname: "Pidgeot",
        // Moveset does NOT contain fly -- simulates Mirror Move / Metronome scenario
        moves: [{ moveId: "tackle" }, { moveId: "roost" }],
      },
      moveOverrides: {
        category: "physical",
        power: 90,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    // Should return null (no forced charge) to prevent slot-0 fallback executing wrong move
    expect(result).toBeNull();
  });
});

// ===========================================================================
// Powder / Spore Immunity (Grass type)
// ===========================================================================

describe("Gen7 Grass-type Powder Immunity -- isGen7GrassPowderBlocked", () => {
  it("given Grass-type target and Sleep Powder (powder flag), when checking, then blocked", () => {
    // Source: Showdown data/moves.ts -- sleeppowder: flags: { powder: 1 }
    // Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
    //   powder and spore moves."
    const move = makeMove("sleep-powder", {
      category: "status",
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: true,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen7GrassPowderBlocked(move, ["grass"])).toBe(true);
  });

  it("given Grass-type target and Spore (powder flag), when checking, then blocked", () => {
    // Source: Showdown data/moves.ts -- spore: flags: { powder: 1 }
    const move = makeMove("spore", {
      category: "status",
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: true,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen7GrassPowderBlocked(move, ["grass"])).toBe(true);
  });

  it("given non-Grass target and Sleep Powder, when checking, then NOT blocked", () => {
    // Source: Only Grass types are immune; other types are affected normally
    const move = makeMove("sleep-powder", {
      category: "status",
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: true,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen7GrassPowderBlocked(move, ["normal"])).toBe(false);
  });

  it("given Grass-type target and non-powder move, when checking, then NOT blocked", () => {
    // Source: Only moves with the powder flag are blocked, not all Grass-type moves
    const move = makeMove("razor-leaf", {
      category: "physical",
      power: 55,
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: false,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen7GrassPowderBlocked(move, ["grass"])).toBe(false);
  });

  it("given Grass/Poison dual-type target and Stun Spore, when checking, then blocked", () => {
    // Source: Any Pokemon with Grass as one of its types is immune
    const move = makeMove("stun-spore", {
      category: "status",
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: true,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen7GrassPowderBlocked(move, ["grass", "poison"])).toBe(true);
  });
});

// ===========================================================================
// Dispatch: unrecognized moves return null
// ===========================================================================

describe("Gen7 executeGen7MoveEffect -- dispatch", () => {
  it("given unrecognized move, when dispatch called, then returns null", () => {
    // Unrecognized moves should fall through to BaseRuleset
    const ctx = makeContext("thunderbolt");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });

  it("given Protect (handled by engine/BaseRuleset), when dispatch called, then returns null", () => {
    // Protect is handled by the engine directly, not Gen7MoveEffects
    const ctx = makeContext("protect");
    const rng = new SeededRandom(42);
    const result = executeGen7MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });
});

// ===========================================================================
// Gen7Ruleset.executeMoveEffect integration
// ===========================================================================

describe("Gen7Ruleset.executeMoveEffect -- integration", () => {
  // Share a single Gen7Ruleset instance across all integration tests to avoid
  // repeated construction (loads 807 Pokemon + 690 moves from JSON) causing
  // test timeouts on slow CI runners.
  let ruleset: import("../src/Gen7Ruleset").Gen7Ruleset;
  beforeAll(async () => {
    const { Gen7Ruleset } = await import("../src/Gen7Ruleset");
    ruleset = new Gen7Ruleset();
  });

  it("given Gen7Ruleset, when executing King's Shield, then returns kings-shield volatile", () => {
    // Source: Showdown mods/gen7/moves.ts -- kingsshield
    const ctx = makeContext("kings-shield");
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBe("kings-shield");
  });

  it("given Gen7Ruleset, when executing Baneful Bunker, then returns baneful-bunker volatile", () => {
    // Source: Showdown data/moves.ts -- banefulbunker: volatileStatus
    const ctx = makeContext("baneful-bunker");
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBe("baneful-bunker");
  });

  it("given Gen7Ruleset, when executing unrecognized move, then falls through to BaseRuleset", () => {
    // Source: Gen7Ruleset.executeMoveEffect falls through to super.executeMoveEffect
    const ctx = makeContext("tackle");
    const result = ruleset.executeMoveEffect(ctx);

    // BaseRuleset returns default empty result for unrecognized moves
    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
  });

  it("given Gen7Ruleset, when executing Sleep Powder against Grass-type, then blocked by powder immunity", () => {
    // Source: Showdown data/moves.ts -- powder moves check target.hasType('Grass')
    // Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
    //   powder and spore moves."

    const ctx = makeContext("sleep-powder", {
      defender: { types: ["grass", "poison"], nickname: "Bulbasaur" },
      moveOverrides: {
        category: "status",
        flags: {
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: true,
          protect: true,
          mirror: false,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
      },
    });
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.messages[0]).toContain("doesn't affect");
    expect(result.statusInflicted).toBeNull();
  });

  it("given Gen7Ruleset, when executing Sleep Powder against non-Grass, then NOT blocked", () => {
    // Source: Powder immunity only applies to Grass types

    const ctx = makeContext("sleep-powder", {
      defender: { types: ["normal"] },
      moveOverrides: {
        category: "status",
        flags: {
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: true,
          protect: true,
          mirror: false,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
      },
    });
    const result = ruleset.executeMoveEffect(ctx);

    // Non-Grass target: falls through to BaseRuleset (default empty result = no messages, no effects)
    // Source: Gen7Ruleset delegates to super.executeMoveEffect which returns createBaseResult()
    expect(result.messages).toEqual([]);
    expect(result.statusInflicted).toBeNull();
  });
});
