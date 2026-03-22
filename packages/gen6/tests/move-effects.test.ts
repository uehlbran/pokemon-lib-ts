import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveTarget } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateSpikyShieldDamage,
  executeGen6MoveEffect,
  isBlockedByCraftyShield,
  isBlockedByKingsShield,
  isBlockedByMatBlock,
  isBlockedBySpikyShield,
} from "../src/Gen6MoveEffects";

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
  moves?: Array<{ moveId: string }>;
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
      currentHp: maxHp,
      status: null,
      heldItem: overrides.heldItem ?? null,
      moves: overrides.moves ?? [{ moveId: "tackle" }],
      nickname: overrides.nickname ?? null,
      speciesId: 25,
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: ["normal"] as const,
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
    generation: 6,
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
  },
): MoveEffectContext {
  return {
    attacker: makeActivePokemon(options?.attacker ?? {}),
    defender: makeActivePokemon(options?.defender ?? {}),
    move: makeMove(moveId, options?.moveOverrides),
    damage: 0,
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

// ---------------------------------------------------------------------------
// King's Shield
// ---------------------------------------------------------------------------

describe("Gen6 King's Shield — executeGen6MoveEffect", () => {
  it("given no consecutive protect uses, when King's Shield is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 10270-10328
    //   King's Shield sets 'kingsshield' volatile with duration: 1
    const ctx = makeContext("kings-shield");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("kings-shield");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given consecutive protect uses exceeded, when King's Shield is used, then fails", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 10280
    //   stallingMove: true -- uses same stall counter as Protect
    const ctx = makeContext("kings-shield");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given attacker has consecutiveProtects set, when King's Shield is used, then passes correct count to rollProtectSuccess", () => {
    // Source: BattleEngine.ts -- consecutiveProtects tracked on ActivePokemon
    // Source: Showdown -- King's Shield shares stall counter with Protect
    const ctx = makeContext("kings-shield", { attacker: { consecutiveProtects: 3 } });
    const rng = new SeededRandom(42);

    let capturedCount = -1;
    const captureProtectRoll = (count: number, _rng: SeededRandom): boolean => {
      capturedCount = count;
      return true;
    };

    executeGen6MoveEffect(ctx, rng, captureProtectRoll);
    expect(capturedCount).toBe(3);
  });
});

describe("Gen6 isBlockedByKingsShield", () => {
  it("given physical move with protect flag and contact, when checking, then blocked with contact penalty", () => {
    // Source: Showdown -- if (!move.flags['protect'] || move.category === 'Status') return;
    //   if (this.checkMoveMakesContact(move, source, target)) this.boost({ atk: -1 }, ...);
    const result = isBlockedByKingsShield("physical", true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
  });

  it("given physical move with protect flag but no contact, when checking, then blocked without contact penalty", () => {
    // Source: Showdown -- blocked but no contact check fires
    const result = isBlockedByKingsShield("physical", true, false);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(false);
  });

  it("given status move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown line 10295 -- if (!move.flags['protect'] || move.category === 'Status') return;
    //   Status moves pass through King's Shield
    const result = isBlockedByKingsShield("status", true, false);
    expect(result.blocked).toBe(false);
    expect(result.contactPenalty).toBe(false);
  });

  it("given special move with protect flag and contact, when checking, then blocked with contact penalty", () => {
    // Source: Showdown -- only Status is excluded; Special moves ARE blocked
    const result = isBlockedByKingsShield("special", true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactPenalty).toBe(true);
  });

  it("given physical move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown -- if (!move.flags['protect']) return;
    const result = isBlockedByKingsShield("physical", false, true);
    expect(result.blocked).toBe(false);
    expect(result.contactPenalty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spiky Shield
// ---------------------------------------------------------------------------

describe("Gen6 Spiky Shield — executeGen6MoveEffect", () => {
  it("given no consecutive protect uses, when Spiky Shield is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 18175-18232
    //   Spiky Shield sets 'spikyshield' volatile with duration: 1
    const ctx = makeContext("spiky-shield");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("spiky-shield");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("protected itself");
  });

  it("given consecutive protect uses exceeded, when Spiky Shield is used, then fails", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 18184
    //   stallingMove: true -- uses same stall counter as Protect
    const ctx = makeContext("spiky-shield");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen6 isBlockedBySpikyShield", () => {
  it("given physical move with protect flag and contact, when checking, then blocked with contact damage", () => {
    // Source: Showdown line 18199 -- if (!move.flags['protect']) return;
    // Source: Showdown line 18216 -- if (this.checkMoveMakesContact) damage 1/8
    const result = isBlockedBySpikyShield(true, true);
    expect(result.blocked).toBe(true);
    expect(result.contactDamage).toBe(true);
  });

  it("given status move with protect flag, when checking, then blocked (unlike King's Shield)", () => {
    // Source: Showdown -- Spiky Shield checks only flags.protect, NOT category
    //   if (!move.flags['protect']) return; -- no Status exclusion
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

describe("Gen6 calculateSpikyShieldDamage", () => {
  it("given attacker with 200 max HP, when calculating contact damage, then returns 25 (floor(200/8))", () => {
    // Source: Showdown line 18217 -- this.damage(source.baseMaxhp / 8, source, target);
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

  it("given attacker with 1 max HP, when calculating contact damage, then returns 1 (minimum)", () => {
    // Source: Showdown -- floor(1/8) = 0, clamped to 1
    expect(calculateSpikyShieldDamage(1)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mat Block
// ---------------------------------------------------------------------------

describe("Gen6 Mat Block — executeGen6MoveEffect", () => {
  it("given first turn (turnsOnField=0), when Mat Block is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 11390-11438
    //   onTry: if (source.activeMoveActions > 1) return false; -- first turn only
    //   sideCondition: 'matblock', duration: 1
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 0 } });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("mat-block");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("Mat Block");
  });

  it("given second turn (turnsOnField=1), when Mat Block is used, then fails", () => {
    // Source: Showdown -- onTry: if (source.activeMoveActions > 1) return false;
    //   "Mat Block only works on your first turn out."
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 1 } });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given third turn (turnsOnField=2), when Mat Block is used, then fails", () => {
    // Source: Showdown -- any turn after the first fails
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 2 } });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given first turn but stalling check fails, when Mat Block is used, then fails", () => {
    // Source: Showdown -- stallingMove: true; if stall check fails, move fails
    const ctx = makeContext("mat-block", { attacker: { turnsOnField: 0 } });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

describe("Gen6 isBlockedByMatBlock", () => {
  it("given physical move with protect flag, when checking, then blocked", () => {
    // Source: Showdown -- blocks damaging moves with protect flag
    expect(isBlockedByMatBlock("physical", true, "normal")).toBe(true);
  });

  it("given special move with protect flag, when checking, then blocked", () => {
    // Source: Showdown -- special moves are also damaging
    expect(isBlockedByMatBlock("special", true, "normal")).toBe(true);
  });

  it("given status move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown line 11421 -- if (move.target === 'self' || move.category === 'Status') return;
    expect(isBlockedByMatBlock("status", true, "normal")).toBe(false);
  });

  it("given self-targeting move with protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown line 11421 -- if (move.target === 'self' || ...) return;
    expect(isBlockedByMatBlock("physical", true, "self")).toBe(false);
  });

  it("given move without protect flag, when checking, then NOT blocked", () => {
    // Source: Showdown line 11416 -- if (!move.flags['protect']) return;
    expect(isBlockedByMatBlock("physical", false, "normal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Crafty Shield
// ---------------------------------------------------------------------------

describe("Gen6 Crafty Shield — executeGen6MoveEffect", () => {
  it("given Crafty Shield used, when called, then succeeds and sets volatile (no stall check)", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 3253-3284
    //   No stallingMove property -- Crafty Shield does NOT use the stalling mechanic
    //   sideCondition: 'craftyshield', duration: 1
    const ctx = makeContext("crafty-shield", { attacker: { nickname: "Klefki" } });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysFailProtect);

    // Should succeed even when rollProtectSuccess would fail -- Crafty Shield
    // does not use the stalling mechanic
    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("crafty-shield");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toContain("Crafty Shield");
  });

  it("given Crafty Shield used with no nickname, when called, then uses default name", () => {
    // Source: message formatting test -- default name used when no nickname
    const ctx = makeContext("crafty-shield");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toContain("The Pokemon");
  });
});

describe("Gen6 isBlockedByCraftyShield", () => {
  it("given status move targeting normal, when checking, then blocked", () => {
    // Source: Showdown line 3274 -- blocks status moves that don't target self or all
    expect(isBlockedByCraftyShield("status", "normal")).toBe(true);
  });

  it("given status move targeting all-adjacent-foes, when checking, then blocked", () => {
    // Source: Showdown -- any non-self/non-all status move is blocked
    expect(isBlockedByCraftyShield("status", "all-adjacent-foes")).toBe(true);
  });

  it("given status move targeting self, when checking, then NOT blocked", () => {
    // Source: Showdown line 3274 -- if (['self', 'all'].includes(move.target)) return;
    expect(isBlockedByCraftyShield("status", "self")).toBe(false);
  });

  it("given status move targeting all, when checking, then NOT blocked", () => {
    // Source: Showdown line 3274 -- if (['self', 'all'].includes(move.target)) return;
    expect(isBlockedByCraftyShield("status", "all")).toBe(false);
  });

  it("given status move targeting entire-field, when checking, then NOT blocked", () => {
    // Source: Showdown -- 'all' maps to our 'entire-field' for field-wide moves
    expect(isBlockedByCraftyShield("status", "entire-field")).toBe(false);
  });

  it("given physical move targeting normal, when checking, then NOT blocked", () => {
    // Source: Showdown line 3274 -- if (... move.category !== 'Status') return;
    expect(isBlockedByCraftyShield("physical", "normal")).toBe(false);
  });

  it("given special move targeting normal, when checking, then NOT blocked", () => {
    // Source: Showdown -- only Status category is blocked
    expect(isBlockedByCraftyShield("special", "normal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phantom Force
// ---------------------------------------------------------------------------

describe("Gen6 Phantom Force — executeGen6MoveEffect", () => {
  it("given no charge volatile, when Phantom Force is used (charge turn), then sets shadow-force-charging and forcedMoveSet", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 13795-13824
    //   onTryMove: attacker.addVolatile('twoturnmove', defender); return null;
    //   condition: { duration: 2, onInvulnerability: false }
    //   Phantom Force shares shadow-force-charging volatile with Shadow Force
    const ctx = makeContext("phantom-force", {
      attacker: {
        nickname: "Trevenant",
        moves: [{ moveId: "phantom-force" }, { moveId: "tackle" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: "phantom-force",
      volatileStatus: "shadow-force-charging",
    });
    expect(result!.messages[0]).toBe("Trevenant vanished!");
  });

  it("given shadow-force-charging volatile present, when Phantom Force is used (attack turn), then returns null for engine to handle damage", () => {
    // Source: Showdown -- if (attacker.removeVolatile(move.id)) return; -- attack turn
    //   The engine handles normal damage calculation on the attack turn.
    const chargeVolatiles = new Map<string, { turnsLeft: number }>();
    chargeVolatiles.set("shadow-force-charging", { turnsLeft: 1 });

    const ctx = makeContext("phantom-force", {
      attacker: {
        volatileStatuses: chargeVolatiles,
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    // null means "not handled by Gen6MoveEffects -- let engine handle damage"
    expect(result).toBeNull();
  });

  it("given Phantom Force on charge turn with no nickname, when used, then uses default name in message", () => {
    // Source: message formatting -- default name when no nickname
    const ctx = makeContext("phantom-force", {
      attacker: {
        moves: [{ moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.messages[0]).toBe("The Pokemon vanished!");
  });

  it("given Phantom Force on charge turn with move at index 1, when used, then forcedMoveSet.moveIndex is 1", () => {
    // Source: engine uses moveIndex to know which slot to force
    const ctx = makeContext("phantom-force", {
      attacker: {
        moves: [{ moveId: "tackle" }, { moveId: "phantom-force" }],
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.forcedMoveSet!.moveIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Dispatch: unrecognized moves return null
// ---------------------------------------------------------------------------

describe("Gen6 executeGen6MoveEffect — dispatch", () => {
  it("given unrecognized move, when dispatch called, then returns null", () => {
    // Unrecognized moves should fall through to BaseRuleset
    const ctx = makeContext("thunderbolt");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });

  it("given Protect (not a Gen6-specific move), when dispatch called, then returns null", () => {
    // Protect is handled by the engine directly and BaseRuleset, not Gen6MoveEffects
    const ctx = makeContext("protect");
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gen6Ruleset.executeMoveEffect integration
// ---------------------------------------------------------------------------

describe("Gen6Ruleset.executeMoveEffect — integration", () => {
  // Lazy import to avoid Gen6Ruleset construction overhead in unit tests above.
  // 15s timeout: async dynamic import triggers module compilation; under full-suite parallel
  // load this can take longer than the default 5s.
  it("given Gen6Ruleset, when executing King's Shield, then returns kings-shield volatile", async () => {
    // Source: references/pokemon-showdown/data/moves.ts -- kingsshield
    const { Gen6Ruleset } = await import("../src/Gen6Ruleset");
    const ruleset = new Gen6Ruleset();

    const ctx = makeContext("kings-shield");
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBe("kings-shield");
  }, 15000);

  it("given Gen6Ruleset, when executing unrecognized move, then falls through to BaseRuleset", async () => {
    // Source: Gen6Ruleset.executeMoveEffect falls through to super.executeMoveEffect
    const { Gen6Ruleset } = await import("../src/Gen6Ruleset");
    const ruleset = new Gen6Ruleset();

    const ctx = makeContext("tackle");
    const result = ruleset.executeMoveEffect(ctx);

    // BaseRuleset returns default empty result for unrecognized moves
    expect(result.statusInflicted).toBeNull();
    expect(result.volatileInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
  });
});
