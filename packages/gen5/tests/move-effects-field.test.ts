import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it, vi } from "vitest";
import {
  createGen5DataManager,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import {
  getGen5PriorityOverride,
  handleGen5FieldMove,
  isBlockedByQuickGuard,
  isBlockedByWideGuard,
} from "../src/Gen5MoveEffectsField";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const gen5DataManager = createGen5DataManager()
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS } as const
const DEFAULT_SPECIES = gen5DataManager.getSpecies(GEN5_SPECIES_IDS.bulbasaur)
const DEFAULT_NATURE = gen5DataManager.getNature(GEN5_NATURE_IDS.hardy).id

function getCanonicalGen5Move(moveId: (typeof MOVE_IDS)[keyof typeof MOVE_IDS]): MoveData {
  const move = gen5DataManager.getMove(moveId)
  return { ...move, flags: { ...move.flags } }
}

function createFieldTestPokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  consecutiveProtects?: number;
  speciesId?: number;
}): ActivePokemon {
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? DEFAULT_SPECIES.id,
      nickname: null,
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
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
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: "normal1" as const,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
    },
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: [CORE_TYPE_IDS.normal] as const,
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
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

function createFieldBattleState(overrides?: Partial<BattleState>): BattleState {
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

function createFieldMoveContext(
  moveId: (typeof MOVE_IDS)[keyof typeof MOVE_IDS],
  state?: Partial<BattleState>,
  attackerOverrides?: Parameters<typeof createFieldTestPokemon>[0],
): MoveEffectContext {
  return {
    attacker: createFieldTestPokemon(attackerOverrides ?? {}),
    defender: createFieldTestPokemon({}),
    move: getCanonicalGen5Move(moveId),
    damage: 0,
    state: createFieldBattleState(state),
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
    const ctx = createFieldMoveContext(MOVE_IDS.magicRoom);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["It created a bizarre area in which Pokemon's held items lose their effects!"],
      magicRoomSet: { turnsLeft: 5 },
    });
  });

  it("given Magic Room is already active, when Magic Room is used again, then toggles off", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 11183
    //   onFieldRestart: this.field.removePseudoWeather('magicroom') -- toggle off
    const ctx = createFieldMoveContext(MOVE_IDS.magicRoom, {
      magicRoom: { active: true, turnsLeft: 3 },
    });
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["The area returned to normal!"],
      magicRoomSet: { turnsLeft: 0 },
    });
  });

  it("given Magic Room is activated, when checking result, then no stat changes or status inflicted", () => {
    // Source: Magic Room is a pure field effect -- no stat changes or status
    const ctx = createFieldMoveContext(MOVE_IDS.magicRoom);
    const rng = new SeededRandom(99);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["It created a bizarre area in which Pokemon's held items lose their effects!"],
      magicRoomSet: { turnsLeft: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// Wonder Room
// ---------------------------------------------------------------------------

describe("Gen5 Wonder Room", () => {
  it("given Wonder Room is not active, when Wonder Room is used, then activates for 5 turns", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 21753-21800
    //   wonderroom condition -- duration: 5
    const ctx = createFieldMoveContext(MOVE_IDS.wonderRoom);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["It created a bizarre area in which Defense and Sp. Def stats are swapped!"],
      wonderRoomSet: { turnsLeft: 5 },
    });
  });

  it("given Wonder Room is already active, when Wonder Room is used again, then toggles off", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 21788
    //   onFieldRestart: this.field.removePseudoWeather('wonderroom') -- toggle off
    const ctx = createFieldMoveContext(MOVE_IDS.wonderRoom, {
      wonderRoom: { active: true, turnsLeft: 2 },
    });
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["Wonder Room wore off, and Defense and Sp. Def stats returned to normal!"],
      wonderRoomSet: { turnsLeft: 0 },
    });
  });

  it("given Wonder Room is activated, when checking result, then no stat changes or status inflicted", () => {
    // Source: Wonder Room is a pure field effect -- no stat changes or status
    const ctx = createFieldMoveContext(MOVE_IDS.wonderRoom);
    const rng = new SeededRandom(123);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["It created a bizarre area in which Defense and Sp. Def stats are swapped!"],
      wonderRoomSet: { turnsLeft: 5 },
    });
  });
});

// ---------------------------------------------------------------------------
// Trick Room
// ---------------------------------------------------------------------------

describe("Gen5 Trick Room", () => {
  it("given Trick Room is not active, when Trick Room is used, then activates for 5 turns", () => {
    // Source: references/pokemon-showdown/data/moves.ts lines 20683-20718
    //   trickroom condition -- duration: 5
    const ctx = createFieldMoveContext(MOVE_IDS.trickRoom);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["The dimensions were twisted!"],
      trickRoomSet: { turnsLeft: 5 },
    });
  });

  it("given Trick Room is already active, when Trick Room is used again, then toggles off", () => {
    // Source: references/pokemon-showdown/data/moves.ts line 20710
    //   onFieldRestart: this.field.removePseudoWeather('trickroom') -- toggle off
    const ctx = createFieldMoveContext(MOVE_IDS.trickRoom, {
      trickRoom: { active: true, turnsLeft: 3 },
    });
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["The twisted dimensions returned to normal!"],
      trickRoomSet: { turnsLeft: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// Quick Guard
// ---------------------------------------------------------------------------

describe("Gen5 Quick Guard", () => {
  it("given no consecutive protect uses, when Quick Guard is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 682-713
    //   Quick Guard is a stallingMove that sets quick-guard volatile
    const ctx = createFieldMoveContext(MOVE_IDS.quickGuard);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["Quick Guard protected the team!"],
      selfVolatileInflicted: MOVE_IDS.quickGuard,
      selfVolatileData: { turnsLeft: 1 },
    });
  });

  it("given consecutive protect uses exceeded, when Quick Guard is used, then fails", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 685-686
    //   stallingMove: true -- uses same stall counter as Protect
    //   When stall check fails, the move fails
    const ctx = createFieldMoveContext(MOVE_IDS.quickGuard);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysFailProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["But it failed!"],
    });
  });

  it("given attacker has consecutiveProtects set, when Quick Guard is used, then passes correct count to rollProtectSuccess", () => {
    // Source: BattleEngine.ts -- consecutiveProtects tracked on ActivePokemon, not volatile data
    // Source: Showdown Gen 5 -- Quick Guard shares stall counter with Protect
    const ctx = createFieldMoveContext(MOVE_IDS.quickGuard, {}, { consecutiveProtects: 2 });
    const rng = new SeededRandom(42);

    const captureProtectRoll = vi.fn((count: number, _rng: SeededRandom): boolean => true);

    const result = handleGen5FieldMove(ctx, rng, captureProtectRoll);
    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["Quick Guard protected the team!"],
      selfVolatileInflicted: MOVE_IDS.quickGuard,
      selfVolatileData: { turnsLeft: 1 },
    });
    expect(captureProtectRoll).toHaveBeenCalledTimes(1);
    expect(captureProtectRoll).toHaveBeenCalledWith(2, rng);
  });
});

// ---------------------------------------------------------------------------
// Wide Guard
// ---------------------------------------------------------------------------

describe("Gen5 Wide Guard", () => {
  it("given no consecutive protect uses, when Wide Guard is used, then succeeds and sets volatile", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts lines 1029-1037
    //   Wide Guard is a stallingMove that sets wide-guard side condition
    const ctx = createFieldMoveContext(MOVE_IDS.wideGuard);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["Wide Guard protected the team!"],
      selfVolatileInflicted: MOVE_IDS.wideGuard,
      selfVolatileData: { turnsLeft: 1 },
    });
  });

  it("given consecutive protect uses exceeded, when Wide Guard is used, then fails", () => {
    // Source: Showdown Gen 5 wideguard -- stallingMove: true, uses stall counter
    const ctx = createFieldMoveContext(MOVE_IDS.wideGuard);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysFailProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["But it failed!"],
    });
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
    expect(isBlockedByQuickGuard(MOVE_IDS.machPunch, 1)).toBe(true);
  });

  it("given a priority +2 move (ExtremeSpeed), when checked against Quick Guard, then is blocked", () => {
    // Source: Showdown data/moves.ts extremespeed -- priority: 2
    // ExtremeSpeed has priority +2 in Gen 5, Quick Guard should block it
    expect(isBlockedByQuickGuard(MOVE_IDS.extremeSpeed, 2)).toBe(true);
  });

  it("given a priority 0 move, when checked against Quick Guard, then is not blocked", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 700
    //   if dex.moves.get(effect.id).priority <= 0 return; (no block)
    // Example: Thunderbolt has priority 0
    expect(isBlockedByQuickGuard(MOVE_IDS.thunderbolt, 0)).toBe(false);
  });

  it("given a negative priority move, when checked against Quick Guard, then is not blocked", () => {
    // Source: Showdown Gen 5 quickguard -- priority <= 0 means no block
    // Example: Trick Room has priority -7
    expect(isBlockedByQuickGuard(MOVE_IDS.trickRoom, -7)).toBe(false);
  });

  it("given Feint, when checked against Quick Guard, then is not blocked (Feint bypasses)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 700
    //   if effect.id === 'feint' return; (no block, Feint bypasses)
    // Feint has priority +2 but always bypasses Quick Guard
    expect(isBlockedByQuickGuard(MOVE_IDS.feint, 2)).toBe(false);
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
    expect(getGen5PriorityOverride(MOVE_IDS.extremeSpeed)).toBe(2);
  });

  it("given Follow Me, when getting Gen 5 priority, then returns +3", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 253 -- followme priority: 3
    // Follow Me changed from +2 (Gen 4) to +3 (Gen 5)
    expect(getGen5PriorityOverride(MOVE_IDS.followMe)).toBe(3);
  });

  it("given Rage Powder, when getting Gen 5 priority, then returns +3", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/moves.ts line 717 -- ragepowder priority: 3
    // Rage Powder has priority +3 in Gen 5 (new move introduced in Gen 5)
    expect(getGen5PriorityOverride(MOVE_IDS.ragePowder)).toBe(3);
  });

  it("given Protect, when getting Gen 5 priority, then returns null (unchanged)", () => {
    // Source: Showdown data/moves.ts protect -- priority: 4 (unchanged in Gen 5)
    // Protect's priority did not change between Gen 4 and Gen 5
    expect(getGen5PriorityOverride(MOVE_IDS.protect)).toBe(null);
  });

  it("given Tackle (a normal move), when getting Gen 5 priority, then returns null", () => {
    // Tackle has priority 0 in all generations -- no override needed
    expect(getGen5PriorityOverride(MOVE_IDS.tackle)).toBe(null);
  });

  it("given Quick Guard (new in Gen 5), when getting Gen 5 priority, then returns null (use data value)", () => {
    // Quick Guard is new in Gen 5 with priority +3 -- no override from Gen 4 needed
    // Source: references/pokemon-showdown/data/moves.ts line 15028 -- quickguard priority: 3
    expect(getGen5PriorityOverride(MOVE_IDS.quickGuard)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// handleGen5FieldMove dispatch
// ---------------------------------------------------------------------------

describe("Gen5 handleGen5FieldMove dispatch", () => {
  it("given an unrecognized move, when dispatched, then returns null", () => {
    // Non-field moves should return null so the caller can fall through
    const ctx = createFieldMoveContext(MOVE_IDS.thunderbolt);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toBe(null);
  });

  it("given magic-room, when dispatched, then returns a non-null result with magicRoomSet", () => {
    // Verify dispatch routes to the correct handler
    const ctx = createFieldMoveContext(MOVE_IDS.magicRoom);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["It created a bizarre area in which Pokemon's held items lose their effects!"],
      magicRoomSet: { turnsLeft: 5 },
    });
  });

  it("given wonder-room, when dispatched, then returns a non-null result with wonderRoomSet", () => {
    // Verify dispatch routes to the correct handler
    const ctx = createFieldMoveContext(MOVE_IDS.wonderRoom);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["It created a bizarre area in which Defense and Sp. Def stats are swapped!"],
      wonderRoomSet: { turnsLeft: 5 },
    });
  });

  it("given trick-room, when dispatched, then returns a non-null result with trickRoomSet", () => {
    // Verify dispatch routes to the correct handler
    const ctx = createFieldMoveContext(MOVE_IDS.trickRoom);
    const rng = new SeededRandom(42);
    const result = handleGen5FieldMove(ctx, rng, alwaysSucceedProtect);

    expect(result).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: ["The dimensions were twisted!"],
      trickRoomSet: { turnsLeft: 5 },
    });
  });
});
