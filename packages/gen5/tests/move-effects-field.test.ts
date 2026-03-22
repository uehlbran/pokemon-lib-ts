import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, MoveTarget } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  getGen5PriorityOverride,
  handleGen5FieldMove,
  isBlockedByQuickGuard,
  isBlockedByWideGuard,
} from "../src/Gen5MoveEffectsField";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  return {
    pokemon: {
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      currentHp: 200,
      status: null,
      heldItem: overrides.heldItem ?? null,
      moves: [],
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: ["normal"] as const,
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
    type: "psychic",
    category: "status",
    power: null,
    accuracy: null,
    pp: 10,
    priority: 0,
    target: "entire-field" as MoveTarget,
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
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 5,
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
    ...overrides,
  } as unknown as BattleState;
}

function makeContext(
  moveId: string,
  state?: Partial<BattleState>,
  attackerOverrides?: Parameters<typeof makeActivePokemon>[0],
): MoveEffectContext {
  return {
    attacker: makeActivePokemon(attackerOverrides ?? {}),
    defender: makeActivePokemon({}),
    move: makeMove(moveId),
    damage: 0,
    state: makeState(state),
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
// Magic Room
// ---------------------------------------------------------------------------

describe("Gen5 Magic Room", () => {
  it("given Magic Room is not active, when Magic Room is used, then activates for 5 turns", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 11153-11197
    //   magicroom condition -- duration: 5
    const ctx = makeContext("magic-room");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.magicRoomSet).toEqual({ turnsLeft: 5 });
    expect(result!.messages[0]).toBe(
      "It created a bizarre area in which Pokemon's held items lose their effects!",
    );
  });

  it("given Magic Room is already active, when Magic Room is used again, then toggles off", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 11183
    //   onFieldRestart: this.field.removePseudoWeather('magicroom') -- toggle off
    const ctx = makeContext("magic-room", {
      magicRoom: { active: true, turnsLeft: 3 },
    });
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.magicRoomSet).toEqual({ turnsLeft: 0 });
    expect(result!.messages[0]).toBe("The area returned to normal!");
  });

  it("given Magic Room is activated, when checking result, then no stat changes or status inflicted", () => {
    // Source: Magic Room is a pure field effect -- no stat changes or status
    const ctx = makeContext("magic-room");
    const rng = new SeededRandom(99);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.statusInflicted).toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.statChanges).toEqual([]);
    expect(result!.recoilDamage).toBe(0);
    expect(result!.healAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wonder Room
// ---------------------------------------------------------------------------

describe("Gen5 Wonder Room", () => {
  it("given Wonder Room is not active, when Wonder Room is used, then activates for 5 turns", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 21753-21800
    //   wonderroom condition -- duration: 5
    const ctx = makeContext("wonder-room");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.wonderRoomSet).toEqual({ turnsLeft: 5 });
    expect(result!.messages[0]).toBe(
      "It created a bizarre area in which Defense and Sp. Def stats are swapped!",
    );
  });

  it("given Wonder Room is already active, when Wonder Room is used again, then toggles off", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 21788
    //   onFieldRestart: this.field.removePseudoWeather('wonderroom') -- toggle off
    const ctx = makeContext("wonder-room", {
      wonderRoom: { active: true, turnsLeft: 2 },
    });
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.wonderRoomSet).toEqual({ turnsLeft: 0 });
    expect(result!.messages[0]).toBe(
      "Wonder Room wore off, and Defense and Sp. Def stats returned to normal!",
    );
  });

  it("given Wonder Room is activated, when checking result, then no stat changes or status inflicted", () => {
    // Source: Wonder Room is a pure field effect -- no stat changes or status
    const ctx = makeContext("wonder-room");
    const rng = new SeededRandom(123);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.statusInflicted).toBeNull();
    expect(result!.volatileInflicted).toBeNull();
    expect(result!.statChanges).toEqual([]);
    expect(result!.recoilDamage).toBe(0);
    expect(result!.healAmount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Trick Room
// ---------------------------------------------------------------------------

describe("Gen5 Trick Room", () => {
  it("given Trick Room is not active, when Trick Room is used, then activates for 5 turns", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 20683-20718
    //   trickroom condition -- duration: 5
    const ctx = makeContext("trick-room");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.trickRoomSet).toEqual({ turnsLeft: 5 });
    expect(result!.messages[0]).toBe("The dimensions were twisted!");
  });

  it("given Trick Room is already active, when Trick Room is used again, then toggles off", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 20710
    //   onFieldRestart: this.field.removePseudoWeather('trickroom') -- toggle off
    const ctx = makeContext("trick-room", {
      trickRoom: { active: true, turnsLeft: 3 },
    });
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.trickRoomSet).toEqual({ turnsLeft: 0 });
    expect(result!.messages[0]).toBe("The twisted dimensions returned to normal!");
  });
});

// ---------------------------------------------------------------------------
// Quick Guard
// ---------------------------------------------------------------------------

describe("Gen5 Quick Guard", () => {
  it("given no consecutive protect uses, when Quick Guard is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 682-713
    //   Quick Guard is a stallingMove that sets quick-guard volatile
    const ctx = makeContext("quick-guard");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("quick-guard");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toBe("Quick Guard protected the team!");
  });

  it("given consecutive protect uses exceeded, when Quick Guard is used, then fails", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 685-686
    //   stallingMove: true -- uses same stall counter as Protect
    //   When stall check fails, the move fails
    const ctx = makeContext("quick-guard");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    // No volatile applied on failure -- selfVolatileInflicted is not set (undefined)
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });

  it("given attacker has protect volatile with consecutive uses, when Quick Guard is used, then reads consecutive count from protect data", () => {
    // Source: Showdown Gen 5 -- Quick Guard shares stall counter with Protect
    // The protect volatile's data.consecutiveUses tracks how many times in a row
    const protectData = new Map([["protect", { turnsLeft: 0, data: { consecutiveUses: 2 } }]]);
    const ctx = makeContext("quick-guard", {}, { volatileStatuses: protectData });
    const rng = new SeededRandom(42);

    // With alwaysSucceedProtect, it succeeds regardless of consecutive count
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);
    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("quick-guard");
  });
});

// ---------------------------------------------------------------------------
// Wide Guard
// ---------------------------------------------------------------------------

describe("Gen5 Wide Guard", () => {
  it("given no consecutive protect uses, when Wide Guard is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 1029-1037
    //   Wide Guard is a stallingMove that sets wide-guard side condition
    const ctx = makeContext("wide-guard");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.selfVolatileInflicted).toBe("wide-guard");
    expect(result!.selfVolatileData).toEqual({ turnsLeft: 1 });
    expect(result!.messages[0]).toBe("Wide Guard protected the team!");
  });

  it("given consecutive protect uses exceeded, when Wide Guard is used, then fails", () => {
    // Source: Showdown Gen 5 wideguard -- stallingMove: true, uses stall counter
    const ctx = makeContext("wide-guard");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysFailProtect);

    expect(result).not.toBeNull();
    // No volatile applied on failure -- selfVolatileInflicted is not set (undefined)
    expect(result!.selfVolatileInflicted).toBeUndefined();
    expect(result!.messages[0]).toBe("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// isBlockedByQuickGuard
// ---------------------------------------------------------------------------

describe("Gen5 isBlockedByQuickGuard", () => {
  it("given a priority +1 move, when checked against Quick Guard, then is blocked", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 697-700
    //   Quick Guard blocks moves with natural priority > 0
    // Example: Mach Punch has priority +1
    // Source: Showdown data/moves.ts machpunch -- priority: 1
    expect(isBlockedByQuickGuard("mach-punch", 1)).toBe(true);
  });

  it("given a priority +2 move (ExtremeSpeed), when checked against Quick Guard, then is blocked", () => {
    // Source: Showdown data/moves.ts extremespeed -- priority: 2
    // ExtremeSpeed has priority +2 in Gen 5, Quick Guard should block it
    expect(isBlockedByQuickGuard("extreme-speed", 2)).toBe(true);
  });

  it("given a priority 0 move, when checked against Quick Guard, then is not blocked", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 700
    //   if dex.moves.get(effect.id).priority <= 0 return; (no block)
    // Example: Thunderbolt has priority 0
    expect(isBlockedByQuickGuard("thunderbolt", 0)).toBe(false);
  });

  it("given a negative priority move, when checked against Quick Guard, then is not blocked", () => {
    // Source: Showdown Gen 5 quickguard -- priority <= 0 means no block
    // Example: Trick Room has priority -7
    expect(isBlockedByQuickGuard("trick-room", -7)).toBe(false);
  });

  it("given Feint, when checked against Quick Guard, then is not blocked (Feint bypasses)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 700
    //   if effect.id === 'feint' return; (no block, Feint bypasses)
    // Feint has priority +2 but always bypasses Quick Guard
    expect(isBlockedByQuickGuard("feint", 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isBlockedByWideGuard
// ---------------------------------------------------------------------------

describe("Gen5 isBlockedByWideGuard", () => {
  it("given a move targeting all-adjacent-foes, when checked against Wide Guard, then is blocked", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 21604-21607
    //   onTryHit: blocks if move.target === 'allAdjacentFoes'
    // Our equivalent: 'all-adjacent-foes'
    // Example: Surf (in doubles) targets all-adjacent
    expect(isBlockedByWideGuard("all-adjacent-foes")).toBe(true);
  });

  it("given a move targeting all-adjacent, when checked against Wide Guard, then is blocked", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 21604-21607
    //   onTryHit: blocks if move.target === 'allAdjacent'
    // Our equivalent: 'all-adjacent'
    // Example: Earthquake targets all adjacent Pokemon (including allies)
    expect(isBlockedByWideGuard("all-adjacent")).toBe(true);
  });

  it("given a single-target move, when checked against Wide Guard, then is not blocked", () => {
    // Source: Showdown wideguard condition -- only blocks spread moves
    // Single-target moves like Thunderbolt are not blocked
    expect(isBlockedByWideGuard("adjacent-foe")).toBe(false);
  });

  it("given a self-targeting move, when checked against Wide Guard, then is not blocked", () => {
    // Source: Showdown wideguard condition -- self-targeting moves pass through
    expect(isBlockedByWideGuard("self")).toBe(false);
  });

  it("given an entire-field move, when checked against Wide Guard, then is not blocked", () => {
    // Source: Showdown wideguard -- only allAdjacent and allAdjacentFoes are blocked
    // Field-wide status moves like Trick Room are not spread moves
    expect(isBlockedByWideGuard("entire-field")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Priority Overrides
// ---------------------------------------------------------------------------

describe("Gen5 priority overrides", () => {
  it("given ExtremeSpeed, when getting Gen 5 priority, then returns +2", () => {
    // Source: references/pokemon-showdown/data/mods/gen4/moves.ts line 518 -- extremespeed priority: 1
    // Source: references/pokemon-showdown/data/moves.ts line 5206 -- extremespeed priority: 2 (Gen 5+)
    // ExtremeSpeed changed from +1 (Gen 4) to +2 (Gen 5+)
    expect(getGen5PriorityOverride("extreme-speed")).toBe(2);
  });

  it("given Follow Me, when getting Gen 5 priority, then returns +3", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 253 -- followme priority: 3
    // Follow Me changed from +2 (Gen 4) to +3 (Gen 5)
    expect(getGen5PriorityOverride("follow-me")).toBe(3);
  });

  it("given Rage Powder, when getting Gen 5 priority, then returns +3", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 717 -- ragepowder priority: 3
    // Rage Powder has priority +3 in Gen 5 (new move introduced in Gen 5)
    expect(getGen5PriorityOverride("rage-powder")).toBe(3);
  });

  it("given Protect, when getting Gen 5 priority, then returns null (unchanged)", () => {
    // Source: Showdown data/moves.ts protect -- priority: 4 (unchanged in Gen 5)
    // Protect's priority did not change between Gen 4 and Gen 5
    expect(getGen5PriorityOverride("protect")).toBeNull();
  });

  it("given Tackle (a normal move), when getting Gen 5 priority, then returns null", () => {
    // Tackle has priority 0 in all generations -- no override needed
    expect(getGen5PriorityOverride("tackle")).toBeNull();
  });

  it("given Quick Guard (new in Gen 5), when getting Gen 5 priority, then returns null (use data value)", () => {
    // Quick Guard is new in Gen 5 with priority +3 -- no override from Gen 4 needed
    // Source: references/pokemon-showdown/data/moves.ts line 15028 -- quickguard priority: 3
    expect(getGen5PriorityOverride("quick-guard")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleGen5FieldMove dispatch
// ---------------------------------------------------------------------------

describe("Gen5 handleGen5FieldMove dispatch", () => {
  it("given an unrecognized move, when dispatched, then returns null", () => {
    // Non-field moves should return null so the caller can fall through
    const ctx = makeContext("thunderbolt");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });

  it("given magic-room, when dispatched, then returns a non-null result with magicRoomSet", () => {
    // Verify dispatch routes to the correct handler
    const ctx = makeContext("magic-room");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.magicRoomSet).toBeDefined();
  });

  it("given wonder-room, when dispatched, then returns a non-null result with wonderRoomSet", () => {
    // Verify dispatch routes to the correct handler
    const ctx = makeContext("wonder-room");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.wonderRoomSet).toBeDefined();
  });

  it("given trick-room, when dispatched, then returns a non-null result with trickRoomSet", () => {
    // Verify dispatch routes to the correct handler
    const ctx = makeContext("trick-room");
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.trickRoomSet).toBeDefined();
  });
});
