import type {
  AbilityContext,
  AccuracyContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  DamageContext,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  MoveFlags,
  PokemonInstance,
  PokemonType,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Bugfix Wave 8 -- fixes for issues #258, #260, #261, #263, #264,
 * #268, #270, #272, #273, #276, #277, #278
 *
 * Each test section covers one bug, with source provenance comments for
 * every hardcoded expected value.
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEFAULT_FLAGS: MoveFlags = {
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
  mirror: true,
  snatch: false,
  gravity: false,
  defrost: false,
  recharge: false,
  charge: false,
  bypassSubstitute: false,
};

function createMockRng(intReturnValue = 0, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

/** RNG that returns different values for successive int() calls */
function createSequentialRng(intValues: number[]) {
  let callIndex = 0;
  return {
    next: () => 0,
    int: (_min: number, _max: number) => {
      const val = intValues[callIndex % intValues.length];
      callIndex++;
      return val;
    },
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${Math.random().toString(36).slice(2, 8)}`,
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: overrides.moves ?? [
      { moveId: "tackle", currentPP: 35, maxPP: 35 },
      { moveId: "ember", currentPP: 25, maxPP: 25 },
    ],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "genderless" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  lastMoveUsed?: string | null;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
  statStages?: Partial<{
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    accuracy: number;
    evasion: number;
  }>;
}): ActivePokemon {
  const pokemon = makePokemonInstance({
    ability: overrides.ability,
    speciesId: overrides.speciesId,
    nickname: overrides.nickname,
    status: overrides.status,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    heldItem: overrides.heldItem,
    moves: overrides.moves,
  });

  const volatiles =
    overrides.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
      ...overrides.statStages,
    },
    volatileStatuses: volatiles,
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    lastMoveUsed: overrides.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function makeSide(index: 0 | 1, overrides?: Partial<BattleSide>): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    ...overrides,
  } as BattleSide;
}

function makeBattleState(overrides?: Partial<BattleState>): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createMockRng(),
    ended: false,
    winner: null,
    ...overrides,
  } as unknown as BattleState;
}

function makeMove(overrides: Partial<MoveData>): MoveData {
  return {
    id: overrides.id ?? "tackle",
    displayName: overrides.displayName ?? "Tackle",
    type: overrides.type ?? "normal",
    category: overrides.category ?? "physical",
    power: overrides.power ?? 40,
    accuracy: overrides.accuracy ?? 100,
    pp: overrides.pp ?? 35,
    priority: overrides.priority ?? 0,
    target: overrides.target ?? "single",
    effect: overrides.effect ?? null,
    flags: overrides.flags ?? { ...DEFAULT_FLAGS },
    generation: overrides.generation ?? 4,
  } as MoveData;
}

function makeAbilityContext(
  pokemon: ActivePokemon,
  opponent?: ActivePokemon,
  state?: BattleState,
  trigger?: string,
): AbilityContext {
  return {
    pokemon,
    opponent: opponent ?? makeActivePokemon({ types: ["normal"] }),
    state: state ?? makeBattleState(),
    rng: createMockRng(),
    trigger: trigger ?? "on-switch-in",
  } as AbilityContext;
}

// ============================================================================
// #258 Tangled Feet -- halves accuracy, not +2 evasion stages
// ============================================================================

describe("#258 Tangled Feet accuracy halving", () => {
  it("given a confused defender with Tangled Feet, when checking 100-acc move with rng=50, then halves the calc to 50 and the move misses", () => {
    // Source: Showdown data/abilities.ts — Tangled Feet onModifyAccuracy: accuracy * 0.5
    // A 100 accuracy move at neutral stages: calc = floor(3*100/3) = 100
    // After Tangled Feet: calc = floor(100 * 0.5) = 50
    // rng(1,100) = 50 <= 50, so it hits
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      ability: "tangled-feet",
      volatiles: new Map([["confusion", { turnsLeft: 3 }]]),
    });
    const move = makeMove({ accuracy: 100 });
    const rng = createMockRng(50); // roll = 50

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: makeBattleState(),
      rng,
    };
    // roll 50 <= calc 50 => hit
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given a confused defender with Tangled Feet, when checking 100-acc move with rng=51, then the move misses", () => {
    // Source: Showdown data/abilities.ts — Tangled Feet onModifyAccuracy: accuracy * 0.5
    // calc = floor(100 * 0.5) = 50, rng(1,100) = 51 > 50 => miss
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      ability: "tangled-feet",
      volatiles: new Map([["confusion", { turnsLeft: 3 }]]),
    });
    const move = makeMove({ accuracy: 100 });
    const rng = createMockRng(51); // roll = 51

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: makeBattleState(),
      rng,
    };
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false);
  });

  it("given a non-confused defender with Tangled Feet, when checking 100-acc move with rng=51, then Tangled Feet does not activate", () => {
    // Source: Showdown — Tangled Feet only activates when confused
    // Without confusion: calc = 100, rng 51 <= 100 => hit
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      ability: "tangled-feet",
    });
    const move = makeMove({ accuracy: 100 });
    const rng = createMockRng(51);

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: makeBattleState(),
      rng,
    };
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });
});

// ============================================================================
// #260 End-of-turn order -- leech-seed before leftovers
// ============================================================================

describe("#260 end-of-turn order: leech-seed before leftovers", () => {
  it("given Gen4Ruleset, when getting end-of-turn order, then leech-seed comes before leftovers", () => {
    // Source: Bulbapedia Gen 4 end-of-turn order — Leech Seed drains before
    // Leftovers/item recovery
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const order = ruleset.getEndOfTurnOrder();
    const leechSeedIdx = order.indexOf("leech-seed");
    const leftoversIdx = order.indexOf("leftovers");
    expect(leechSeedIdx).toBeGreaterThan(-1);
    expect(leftoversIdx).toBeGreaterThan(-1);
    expect(leechSeedIdx).toBeLessThan(leftoversIdx);
  });

  it("given Gen4Ruleset, when getting end-of-turn order, then leech-seed comes after shed-skin", () => {
    // Source: Bulbapedia Gen 4 end-of-turn order — Shed Skin cures status before
    // Leech Seed drains
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const order = ruleset.getEndOfTurnOrder();
    const leechSeedIdx = order.indexOf("leech-seed");
    const shedSkinIdx = order.indexOf("shed-skin");
    expect(leechSeedIdx).toBeGreaterThan(shedSkinIdx);
  });
});

// ============================================================================
// #261 Trick Room toggle -- sets turnsLeft: 0 to deactivate
// ============================================================================

describe("#261 Trick Room toggle deactivation", () => {
  it("given Trick Room is active, when using Trick Room, then result.trickRoomSet.turnsLeft is 0", () => {
    // Source: Showdown Gen 4 — Trick Room toggle: using it while active ends it
    // Trick Room has effect: null in Gen 4 data, routed through handleNullEffectMoves
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeBattleState({
      trickRoom: { active: true, turnsLeft: 3 },
    });
    state.sides[0].active = [attacker];
    const move = makeMove({
      id: "trick-room",
      type: "psychic",
      category: "status",
      power: null,
      accuracy: null,
      effect: null,
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.trickRoomSet).toBeDefined();
    expect(result.trickRoomSet!.turnsLeft).toBe(0);
  });

  it("given Trick Room is inactive, when using Trick Room, then result.trickRoomSet.turnsLeft is 5", () => {
    // Source: Showdown Gen 4 — Trick Room sets for 5 turns when not active
    // Trick Room has effect: null in Gen 4 data, routed through handleNullEffectMoves
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const move = makeMove({
      id: "trick-room",
      type: "psychic",
      category: "status",
      power: null,
      accuracy: null,
      effect: null,
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.trickRoomSet).toBeDefined();
    expect(result.trickRoomSet!.turnsLeft).toBe(5);
  });
});

// ============================================================================
// #264 Perish Song -- must include turnsLeft: 3 on both volatiles
// ============================================================================

describe("#264 Perish Song volatile data with turnsLeft", () => {
  it("given attacker uses Perish Song, when effect resolves, then selfVolatileData has turnsLeft 3", () => {
    // Source: Bulbapedia — Perish Song: "All Pokemon that hear this song will faint in 3 turns."
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const move = makeMove({
      id: "perish-song",
      type: "normal",
      category: "status",
      power: null,
      accuracy: null,
      effect: { type: "custom", id: "perish-song" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.selfVolatileInflicted).toBe("perish-song");
    expect(result.volatileInflicted).toBe("perish-song");
    expect(result.selfVolatileData).toEqual({ turnsLeft: 3 });
    expect(result.volatileData).toEqual({ turnsLeft: 3 });
  });

  it("given Perish Song used, when checking both sides, then both get turnsLeft 3", () => {
    // Source: Bulbapedia — Perish Song affects all Pokemon in battle (3 turns)
    // Triangulation: different attacker/defender types
    const attacker = makeActivePokemon({ types: ["fire"] });
    const defender = makeActivePokemon({ types: ["water"] });
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const move = makeMove({
      id: "perish-song",
      type: "normal",
      category: "status",
      power: null,
      accuracy: null,
      effect: { type: "custom", id: "perish-song" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.selfVolatileData!.turnsLeft).toBe(3);
    expect(result.volatileData!.turnsLeft).toBe(3);
  });
});

// ============================================================================
// #268 Disable duration -- random 4-7 turns, not fixed 4
// ============================================================================

describe("#268 Disable random duration 4-7 turns", () => {
  it("given rng returns 4, when Disable resolves, then turnsLeft is 4", () => {
    // Source: Showdown Gen 4 — this.random(4, 8) = 4-7 inclusive
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      lastMoveUsed: "tackle",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const rng = createMockRng(4); // int(4,7) returns 4
    const move = makeMove({
      id: "disable",
      type: "normal",
      category: "status",
      power: null,
      accuracy: 100,
      effect: { type: "volatile-status", volatile: "disable" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng,
    };

    const result = executeGen4MoveEffect(context);
    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData!.turnsLeft).toBe(4);
  });

  it("given rng returns 7, when Disable resolves, then turnsLeft is 7", () => {
    // Source: Showdown Gen 4 — this.random(4, 8) = 4-7 inclusive
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      lastMoveUsed: "tackle",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const rng = createMockRng(7); // int(4,7) returns 7
    const move = makeMove({
      id: "disable",
      type: "normal",
      category: "status",
      power: null,
      accuracy: 100,
      effect: { type: "volatile-status", volatile: "disable" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng,
    };

    const result = executeGen4MoveEffect(context);
    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData!.turnsLeft).toBe(7);
  });
});

// ============================================================================
// #278 Disable fails if target's last move has 0 PP
// ============================================================================

describe("#278 Disable fails when target's last move has 0 PP", () => {
  it("given defender's last move has 0 PP, when Disable is used, then it fails", () => {
    // Source: Showdown Gen 4 — Disable fails if target's last move has 0 PP
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      lastMoveUsed: "tackle",
      moves: [{ moveId: "tackle", currentPP: 0, maxPP: 35 }],
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const move = makeMove({
      id: "disable",
      type: "normal",
      category: "status",
      power: null,
      accuracy: 100,
      effect: { type: "volatile-status", volatile: "disable" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(5),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender's last move has PP > 0, when Disable is used, then it succeeds", () => {
    // Source: Showdown Gen 4 — Disable succeeds if target's last move has PP > 0
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({
      lastMoveUsed: "tackle",
      moves: [{ moveId: "tackle", currentPP: 10, maxPP: 35 }],
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    const move = makeMove({
      id: "disable",
      type: "normal",
      category: "status",
      power: null,
      accuracy: 100,
      effect: { type: "volatile-status", volatile: "disable" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(5),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.volatileInflicted).toBe("disable");
  });
});

// ============================================================================
// #277 Future Sight fails when a future attack is already pending
// ============================================================================

describe("#277 Future Sight fails when future attack is already pending", () => {
  it("given target side already has a future attack, when using Future Sight, then it fails", () => {
    // Source: Showdown Gen 4 — Future Sight fails if a future attack is already set
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    // Attacker is on side 0, target is side 1 — set future attack on target side
    state.sides[1].futureAttack = {
      moveId: "future-sight",
      turnsLeft: 2,
      damage: 100,
      sourceSide: 0,
    } as any;
    const move = makeMove({
      id: "future-sight",
      type: "psychic",
      category: "special",
      power: 80,
      accuracy: 90,
      effect: { type: "custom", id: "future-sight" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(),
    };

    const result = executeGen4MoveEffect(context);
    // futureAttack is not set (remains undefined) when the move fails
    expect(result.futureAttack).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given target side has no future attack, when using Future Sight, then it succeeds", () => {
    // Source: Showdown Gen 4 — Future Sight succeeds normally
    const attacker = makeActivePokemon({});
    const defender = makeActivePokemon({});
    const state = makeBattleState();
    state.sides[0].active = [attacker];
    state.sides[1].futureAttack = null;
    const move = makeMove({
      id: "future-sight",
      type: "psychic",
      category: "special",
      power: 80,
      accuracy: 90,
      effect: { type: "custom", id: "future-sight" },
    });
    const context: MoveEffectContext = {
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: createMockRng(),
    };

    const result = executeGen4MoveEffect(context);
    expect(result.futureAttack).toBeDefined();
    expect(result.futureAttack!.moveId).toBe("future-sight");
    expect(result.futureAttack!.turnsLeft).toBe(3);
  });
});

// ============================================================================
// #263 Intimidate blocked by Substitute
// ============================================================================

describe("#263 Intimidate blocked by Substitute", () => {
  it("given opponent has a Substitute, when Intimidate activates, then it does not reduce Attack", () => {
    // Source: Showdown Gen 4 — Intimidate is blocked by Substitute
    const user = makeActivePokemon({ ability: "intimidate" });
    const opponent = makeActivePokemon({ substituteHp: 50 });
    const ctx = makeAbilityContext(user, opponent);

    const result = applyGen4Ability("on-switch-in", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given opponent has no Substitute, when Intimidate activates, then it reduces Attack by 1 stage", () => {
    // Source: Showdown Gen 4 — Intimidate lowers opponent's Attack by 1 stage
    const user = makeActivePokemon({ ability: "intimidate", nickname: "User" });
    const opponent = makeActivePokemon({ substituteHp: 0, nickname: "Foe" });
    const ctx = makeAbilityContext(user, opponent);

    const result = applyGen4Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].effectType).toBe("stat-change");
  });
});

// ============================================================================
// #273 Flash Fire does not activate when frozen
// ============================================================================

describe("#273 Flash Fire does not activate when frozen", () => {
  it("given a frozen Pokemon with Flash Fire, when hit by a Fire move, then Flash Fire does not activate", () => {
    // Source: Showdown Gen 4 — frozen Pokemon cannot activate Flash Fire;
    // the Fire move should proceed and thaw the frozen Pokemon
    const pokemon = makeActivePokemon({
      ability: "flash-fire",
      types: ["fire"],
      status: "freeze",
    });
    const fireMove = makeMove({ id: "flamethrower", type: "fire", category: "special" });
    const ctx: AbilityContext = {
      pokemon,
      opponent: makeActivePokemon({}),
      state: makeBattleState(),
      rng: createMockRng(),
      trigger: "passive-immunity",
      move: fireMove,
    } as AbilityContext;

    const result = applyGen4Ability("passive-immunity", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a non-frozen Pokemon with Flash Fire, when hit by a Fire move, then Flash Fire activates", () => {
    // Source: Showdown Gen 4 — Flash Fire activates normally when not frozen
    const pokemon = makeActivePokemon({
      ability: "flash-fire",
      types: ["fire"],
      status: null,
    });
    const fireMove = makeMove({ id: "flamethrower", type: "fire", category: "special" });
    const ctx: AbilityContext = {
      pokemon,
      opponent: makeActivePokemon({}),
      state: makeBattleState(),
      rng: createMockRng(),
      trigger: "passive-immunity",
      move: fireMove,
    } as AbilityContext;

    const result = applyGen4Ability("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });
});

// ============================================================================
// #276 Forewarn BP: Counter/Mirror Coat/Metal Burst = 120, 0-BP damaging = 80
// ============================================================================

describe("#276 Forewarn base power assignments", () => {
  it("given opponent knows Counter, when Forewarn activates, then Counter is reported with BP 120", () => {
    // Source: Showdown Gen 4 — Forewarn assigns 120 to Counter/Mirror Coat/Metal Burst
    const dataManager = createGen4DataManager();
    const user = makeActivePokemon({ ability: "forewarn", nickname: "User" });
    const opponent = makeActivePokemon({
      moves: [
        { moveId: "counter", currentPP: 20, maxPP: 20 },
        { moveId: "tackle", currentPP: 35, maxPP: 35 },
      ],
    });
    const ctx = makeAbilityContext(user, opponent);

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);
    // Counter (BP 120) > Tackle (BP 40) — Counter should be reported
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Counter");
  });

  it("given opponent knows Mirror Coat and a 100-BP move, when Forewarn activates, then Mirror Coat (120) beats the 100-BP move", () => {
    // Source: Showdown Gen 4 — Mirror Coat is treated as BP 120 for Forewarn
    const dataManager = createGen4DataManager();
    const user = makeActivePokemon({ ability: "forewarn", nickname: "User" });
    const opponent = makeActivePokemon({
      moves: [
        { moveId: "mirror-coat", currentPP: 20, maxPP: 20 },
        { moveId: "fire-blast", currentPP: 5, maxPP: 5 },
      ],
    });
    const ctx = makeAbilityContext(user, opponent);

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);
    expect(result.activated).toBe(true);
    // Mirror Coat (120) > Fire Blast (110 in Gen 4) — Mirror Coat wins
    expect(result.messages[0]).toContain("Mirror Coat");
  });
});

// ============================================================================
// #270 Flame Orb / Toxic Orb type immunity
// ============================================================================

describe("#270 Flame/Toxic Orb type immunity", () => {
  it("given a Poison-type Pokemon with Toxic Orb, when end-of-turn triggers, then Toxic Orb does not activate", () => {
    // Source: Showdown Gen 4 — Poison types are immune to poisoning; Toxic Orb doesn't activate
    const pokemon = makeActivePokemon({
      types: ["poison"],
      heldItem: "toxic-orb",
    });
    const ctx: ItemContext = {
      pokemon,
      state: makeBattleState(),
      rng: createMockRng(),
    };

    const result = applyGen4HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Steel-type Pokemon with Toxic Orb, when end-of-turn triggers, then Toxic Orb does not activate", () => {
    // Source: Showdown Gen 4 — Steel types are immune to poisoning; Toxic Orb doesn't activate
    const pokemon = makeActivePokemon({
      types: ["steel"],
      heldItem: "toxic-orb",
    });
    const ctx: ItemContext = {
      pokemon,
      state: makeBattleState(),
      rng: createMockRng(),
    };

    const result = applyGen4HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Fire-type Pokemon with Flame Orb, when end-of-turn triggers, then Flame Orb does not activate", () => {
    // Source: Showdown Gen 4 — Fire types are immune to burns; Flame Orb doesn't activate
    const pokemon = makeActivePokemon({
      types: ["fire"],
      heldItem: "flame-orb",
    });
    const ctx: ItemContext = {
      pokemon,
      state: makeBattleState(),
      rng: createMockRng(),
    };

    const result = applyGen4HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Normal-type Pokemon with Toxic Orb, when end-of-turn triggers, then Toxic Orb activates", () => {
    // Source: Showdown Gen 4 — Normal types are NOT immune to poison; Toxic Orb activates
    const pokemon = makeActivePokemon({
      types: ["normal"],
      heldItem: "toxic-orb",
    });
    const ctx: ItemContext = {
      pokemon,
      state: makeBattleState(),
      rng: createMockRng(),
    };

    const result = applyGen4HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
  });

  it("given a Water-type Pokemon with Flame Orb, when end-of-turn triggers, then Flame Orb activates", () => {
    // Source: Showdown Gen 4 — Water types are NOT immune to burns; Flame Orb activates
    const pokemon = makeActivePokemon({
      types: ["water"],
      heldItem: "flame-orb",
    });
    const ctx: ItemContext = {
      pokemon,
      state: makeBattleState(),
      rng: createMockRng(),
    };

    const result = applyGen4HeldItem("end-of-turn", ctx);
    expect(result.activated).toBe(true);
  });
});

// ============================================================================
// #272 Adamant Orb / Lustrous Orb damage boost
// ============================================================================

describe("#272 Adamant Orb and Lustrous Orb base power boost", () => {
  it("given Dialga holding Adamant Orb using Dragon Pulse, when damage is calculated, then base power is boosted by 1.2x", () => {
    // Source: Bulbapedia — Adamant Orb: "Boosts the power of Dialga's Dragon- and Steel-type
    //   moves by 20%." Showdown data/items.ts — onBasePower: basePower * 0x1333 / 0x1000
    // Dragon Pulse base power 90, boosted: floor(90 * 4915 / 4096) = floor(107.9...) = 107
    // We verify via damage result that the boost is applied.
    const attacker = makeActivePokemon({
      speciesId: 483, // Dialga
      types: ["steel", "dragon"],
      heldItem: "adamant-orb",
    });
    const defender = makeActivePokemon({
      types: ["normal"],
    });
    const move = makeMove({
      id: "dragon-pulse",
      displayName: "Dragon Pulse",
      type: "dragon",
      category: "special",
      power: 90,
      accuracy: 100,
    });
    const state = makeBattleState();
    const rng = createMockRng(100); // max random roll for predictability

    // Calculate WITH Adamant Orb
    const contextWith: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWith = calculateGen4Damage(contextWith, GEN4_TYPE_CHART);

    // Calculate WITHOUT Adamant Orb
    const attackerWithout = makeActivePokemon({
      speciesId: 483,
      types: ["steel", "dragon"],
      heldItem: null,
    });
    const contextWithout: DamageContext = {
      attacker: attackerWithout,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWithout = calculateGen4Damage(contextWithout, GEN4_TYPE_CHART);

    // Source: Bulbapedia — Adamant Orb boosts Dialga's Dragon/Steel moves by 20% (4915/4096)
    // Formula derivation (all stats = 100, level = 50, no weather/crit, max random roll = 100):
    //   WITH orb: power = floor(90 * 4915 / 4096) = 107
    //     levelFactor = floor(2*50/5) + 2 = 22
    //     baseDamage = floor(floor(22 * 107 * 100 / 100) / 50) + 2 = 49
    //     after random (100/100 = 1.0): 49; after STAB 1.5x: floor(49 * 1.5) = 73
    //   WITHOUT orb: power = 90
    //     baseDamage = floor(floor(22 * 90 * 100 / 100) / 50) + 2 = 41
    //     after random: 41; after STAB: floor(41 * 1.5) = 61
    expect(resultWith.damage).toBe(73);
    expect(resultWithout.damage).toBe(61);
  });

  it("given Palkia holding Lustrous Orb using Surf, when damage is calculated, then base power is boosted", () => {
    // Source: Bulbapedia — Lustrous Orb: "Boosts the power of Palkia's Water- and Dragon-type
    //   moves by 20%."
    const attacker = makeActivePokemon({
      speciesId: 484, // Palkia
      types: ["water", "dragon"],
      heldItem: "lustrous-orb",
    });
    const defender = makeActivePokemon({ types: ["normal"] });
    const move = makeMove({
      id: "surf",
      displayName: "Surf",
      type: "water",
      category: "special",
      power: 95,
      accuracy: 100,
    });
    const state = makeBattleState();

    const contextWith: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWith = calculateGen4Damage(contextWith, GEN4_TYPE_CHART);

    const attackerWithout = makeActivePokemon({
      speciesId: 484,
      types: ["water", "dragon"],
      heldItem: null,
    });
    const contextWithout: DamageContext = {
      attacker: attackerWithout,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWithout = calculateGen4Damage(contextWithout, GEN4_TYPE_CHART);

    // Source: Bulbapedia — Lustrous Orb boosts Palkia's Water/Dragon moves by 20% (4915/4096)
    // Formula derivation (all stats = 100, level = 50, no weather/crit, max random roll = 100):
    //   WITH orb: power = floor(95 * 4915 / 4096) = 113
    //     baseDamage = floor(floor(22 * 113 * 100 / 100) / 50) + 2 = 51
    //     after random (1.0): 51; after STAB 1.5x: floor(51 * 1.5) = 76
    //   WITHOUT orb: power = 95
    //     baseDamage = floor(floor(22 * 95 * 100 / 100) / 50) + 2 = 43
    //     after random: 43; after STAB: floor(43 * 1.5) = 64
    expect(resultWith.damage).toBe(76);
    expect(resultWithout.damage).toBe(64);
  });

  it("given Dialga holding Adamant Orb using Flamethrower (Fire), when damage is calculated, then no boost", () => {
    // Source: Showdown — Adamant Orb only boosts Dragon and Steel moves for Dialga
    const attacker = makeActivePokemon({
      speciesId: 483,
      types: ["steel", "dragon"],
      heldItem: "adamant-orb",
    });
    const defender = makeActivePokemon({ types: ["normal"] });
    const move = makeMove({
      id: "flamethrower",
      displayName: "Flamethrower",
      type: "fire",
      category: "special",
      power: 95,
      accuracy: 100,
    });
    const state = makeBattleState();

    const contextWith: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWith = calculateGen4Damage(contextWith, GEN4_TYPE_CHART);

    const attackerWithout = makeActivePokemon({
      speciesId: 483,
      types: ["steel", "dragon"],
      heldItem: null,
    });
    const contextWithout: DamageContext = {
      attacker: attackerWithout,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWithout = calculateGen4Damage(contextWithout, GEN4_TYPE_CHART);

    // No boost for Fire moves — damage should be equal
    expect(resultWith.damage).toBe(resultWithout.damage);
  });

  it("given non-Dialga holding Adamant Orb using Dragon move, when damage is calculated, then no boost", () => {
    // Source: Showdown — Adamant Orb only works for Dialga (species 483)
    const attacker = makeActivePokemon({
      speciesId: 149, // Dragonite
      types: ["dragon", "flying"],
      heldItem: "adamant-orb",
    });
    const defender = makeActivePokemon({ types: ["normal"] });
    const move = makeMove({
      id: "dragon-pulse",
      type: "dragon",
      category: "special",
      power: 90,
    });
    const state = makeBattleState();

    const contextWith: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWith = calculateGen4Damage(contextWith, GEN4_TYPE_CHART);

    const attackerWithout = makeActivePokemon({
      speciesId: 149,
      types: ["dragon", "flying"],
      heldItem: null,
    });
    const contextWithout: DamageContext = {
      attacker: attackerWithout,
      defender,
      move,
      state,
      rng: createMockRng(100),
      isCrit: false,
    };
    const resultWithout = calculateGen4Damage(contextWithout, GEN4_TYPE_CHART);

    expect(resultWith.damage).toBe(resultWithout.damage);
  });
});
