import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, MoveTarget, PokemonInstance } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateRevivalHp,
  calculateSaltCureDamage,
  calculateShedTailCost,
  canUseRevivalBlessing,
  canUseShedTail,
  executeGen9MoveEffect,
  findRevivalTarget,
  getLastRespectsPower,
  getRageFistPower,
  handleMakeItRain,
  handleRevivalBlessing,
  handleSaltCure,
  handleShedTail,
  handleTeraBlast,
  handleTidyUp,
  shouldApplyStellarDebuff,
} from "../src/Gen9MoveEffects";
import { Gen9Ruleset } from "../src/Gen9Ruleset";

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
  substituteHp?: number;
  isTerastallized?: boolean;
  teraType?: string | null;
  teamSlot?: number;
  timesAttacked?: number;
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
      timesAttacked: overrides.timesAttacked ?? 0,
      teraType: overrides.teraType ?? null,
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: (overrides.types ?? ["normal"]) as readonly string[],
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    turnsOnField: overrides.turnsOnField ?? 0,
    substituteHp: overrides.substituteHp ?? 0,
    isTerastallized: overrides.isTerastallized ?? false,
    teraType: (overrides.teraType ?? null) as any,
    teamSlot: overrides.teamSlot ?? 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    stellarBoostedTypes: [],
    movedThisTurn: false,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    forcedMove: null,
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
    generation: 9,
    ...overrides,
  } as MoveData;
}

function makePokemonInstance(overrides?: Partial<PokemonInstance>): PokemonInstance {
  return {
    uid: "test-uid",
    speciesId: 25,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "adamant",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [{ moveId: "tackle", currentPp: 35, maxPp: 35 }],
    ability: "static",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male" as any,
    isShiny: false,
    metLocation: "pallet-town",
    metLevel: 5,
    originalTrainer: "Ash",
    originalTrainerId: 12345,
    pokeball: "poke-ball",
    calculatedStats: {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
    ...overrides,
  } as PokemonInstance;
}

function makeSide(overrides?: Partial<BattleSide>): BattleSide {
  return {
    index: 0,
    trainer: null,
    team: [makePokemonInstance()],
    active: [makeActivePokemon({})],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    ...overrides,
  } as unknown as BattleSide;
}

function makeState(overrides?: {
  sides?: BattleSide[];
  weather?: BattleState["weather"];
}): BattleState {
  const sides = overrides?.sides ?? [
    makeSide({ index: 0 as const }),
    makeSide({ index: 1 as const }),
  ];
  return {
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    weather: overrides?.weather ?? null,
    terrain: null,
    rng: new SeededRandom(42),
    sides,
  } as unknown as BattleState;
}

function makeContext(
  moveId: string,
  options?: {
    state?: BattleState;
    attacker?: Parameters<typeof makeActivePokemon>[0];
    defender?: Parameters<typeof makeActivePokemon>[0];
    moveOverrides?: Partial<MoveData>;
    damage?: number;
    sides?: BattleSide[];
  },
): MoveEffectContext {
  const attacker = makeActivePokemon(options?.attacker ?? {});
  const defender = makeActivePokemon(options?.defender ?? {});

  // If sides provided, use them. Otherwise, create default sides with attacker/defender.
  const sides = options?.sides ?? [
    {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon],
    } as unknown as BattleSide,
    {
      ...makeSide({ index: 1 as const }),
      active: [defender],
      team: [defender.pokemon],
    } as unknown as BattleSide,
  ];

  const state = options?.state ?? makeState({ sides });

  return {
    attacker,
    defender,
    move: makeMove(moveId, options?.moveOverrides),
    damage: options?.damage ?? 0,
    state,
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

// ===========================================================================
// Population Bomb
// ===========================================================================

describe("Gen9 Population Bomb", () => {
  it("given Population Bomb used, when executeGen9MoveEffect is called, then returns base result (engine handles multi-hit)", () => {
    // Source: Showdown data/moves.ts:14112-14126
    // Population Bomb's multi-hit is handled by the engine via multihit:10.
    // The move effect itself has no secondary effects.
    const ctx = makeContext("population-bomb");
    const result = executeGen9MoveEffect(ctx);
    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([]);
    expect(result!.statusInflicted).toBeNull();
    expect(result!.volatileInflicted).toBeNull();
  });

  it("given Population Bomb used, when checking move properties, then multihit is 10 and accuracy is 90", () => {
    // Source: Showdown data/moves.ts:14121-14122
    // Population Bomb: multihit: 10, multiaccuracy: true (each hit checks 90% accuracy)
    // Verify that the gen9 moves data file encodes these properties correctly.
    type MoveEntry = { id: string; accuracy: number; effect?: { min?: number; max?: number } };
    const movesData: MoveEntry[] = require("../data/moves.json");
    const populationBomb = movesData.find((m) => m.id === "population-bomb");
    expect(populationBomb).toBeDefined();
    expect(populationBomb!.accuracy).toBe(90);
    // multihit is encoded as effect.min and effect.max
    expect(populationBomb!.effect?.min).toBe(10);
    expect(populationBomb!.effect?.max).toBe(10);
  });
});

// ===========================================================================
// Rage Fist
// ===========================================================================

describe("Gen9 Rage Fist -- getRageFistPower", () => {
  it("given a Pokemon hit 0 times, when calculating Rage Fist power, then returns 50", () => {
    // Source: Showdown data/moves.ts:15127 -- Math.min(350, 50 + 50 * 0) = 50
    expect(getRageFistPower(0)).toBe(50);
  });

  it("given a Pokemon hit 1 time, when calculating Rage Fist power, then returns 100", () => {
    // Source: Showdown data/moves.ts:15127 -- Math.min(350, 50 + 50 * 1) = 100
    expect(getRageFistPower(1)).toBe(100);
  });

  it("given a Pokemon hit 3 times, when calculating Rage Fist power, then returns 200", () => {
    // Source: Showdown data/moves.ts:15127 -- Math.min(350, 50 + 50 * 3) = 200
    expect(getRageFistPower(3)).toBe(200);
  });

  it("given a Pokemon hit 6 times, when calculating Rage Fist power, then returns 350 (capped)", () => {
    // Source: Showdown data/moves.ts:15127 -- Math.min(350, 50 + 50 * 6) = Math.min(350, 350) = 350
    expect(getRageFistPower(6)).toBe(350);
  });

  it("given a Pokemon hit 7 times, when calculating Rage Fist power, then returns 350 (capped at 350)", () => {
    // Source: Showdown data/moves.ts:15127 -- Math.min(350, 50 + 50 * 7) = Math.min(350, 400) = 350
    expect(getRageFistPower(7)).toBe(350);
  });

  it("given a Pokemon hit 10 times, when calculating Rage Fist power, then returns 350 (still capped)", () => {
    // Source: Showdown data/moves.ts:15127 -- Math.min(350, 50 + 50 * 10) = Math.min(350, 550) = 350
    expect(getRageFistPower(10)).toBe(350);
  });
});

describe("Gen9 Rage Fist -- move effect", () => {
  it("given Rage Fist used, when executeGen9MoveEffect is called, then returns base result (power is in damage calc)", () => {
    // Source: Showdown data/moves.ts:15122-15137 -- no secondary effects
    const ctx = makeContext("rage-fist");
    const result = executeGen9MoveEffect(ctx);
    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([]);
  });
});

// ===========================================================================
// Rage Fist counter -- onDamageReceived
// ===========================================================================

describe("Gen9 Rage Fist counter -- onDamageReceived", () => {
  it("given a Pokemon with 0 timesAttacked, when hit by a move, then timesAttacked increments to 1", () => {
    // Source: Showdown sim/pokemon.ts -- timesAttacked incremented in hitBy()
    const ruleset = new Gen9Ruleset();
    const defender = makeActivePokemon({ timesAttacked: 0 });
    const move = makeMove("tackle", { category: "physical", power: 40 });
    const state = makeState();

    ruleset.onDamageReceived(defender, 50, move, state);

    const pokemon = defender.pokemon as unknown as Record<string, unknown>;
    expect(pokemon.timesAttacked).toBe(1);
  });

  it("given a Pokemon with 3 timesAttacked, when hit again, then timesAttacked increments to 4", () => {
    // Source: Showdown sim/pokemon.ts -- timesAttacked tracks cumulative hits
    const ruleset = new Gen9Ruleset();
    const defender = makeActivePokemon({ timesAttacked: 3 });
    const move = makeMove("tackle", { category: "physical", power: 40 });
    const state = makeState();

    ruleset.onDamageReceived(defender, 50, move, state);

    const pokemon = defender.pokemon as unknown as Record<string, unknown>;
    expect(pokemon.timesAttacked).toBe(4);
  });

  it("given a multi-hit move on turn 2, when onDamageReceived called twice same turn, then timesAttacked only increments once", () => {
    // Source: Showdown sim/pokemon.ts -- timesAttacked incremented once per move use
    // Multi-hit moves (e.g., Population Bomb) call onDamageReceived once per hit,
    // but timesAttacked must only increment once per move use.
    const ruleset = new Gen9Ruleset();
    const defender = makeActivePokemon({ timesAttacked: 0 });
    const move = makeMove("population-bomb", { category: "physical", power: 20 });
    const state = { ...makeState(), turnNumber: 2 } as unknown as BattleState;

    // Simulate two hits of the same multi-hit move in the same turn
    ruleset.onDamageReceived(defender, 20, move, state);
    ruleset.onDamageReceived(defender, 20, move, state);

    const pokemon = defender.pokemon as unknown as Record<string, unknown>;
    // Should be 1, not 2 — second hit is deduplicated by turn+move tracking
    expect(pokemon.timesAttacked).toBe(1);
  });
});

// ===========================================================================
// Make It Rain
// ===========================================================================

describe("Gen9 Make It Rain", () => {
  it("given Make It Rain hits, when move effect resolves, then attacker SpAttack drops by 1", () => {
    // Source: Showdown data/moves.ts:11348-11352 -- self: { boosts: { spa: -1 } }
    const ctx = makeContext("make-it-rain", { damage: 100 });
    const result = handleMakeItRain(ctx);

    expect(result.statChanges).toEqual([{ target: "attacker", stat: "spAttack", stages: -1 }]);
  });

  it("given Make It Rain, when dispatched via executeGen9MoveEffect, then returns result with SpA drop", () => {
    // Source: Showdown data/moves.ts:11348-11352 -- self: { boosts: { spa: -1 } }
    const ctx = makeContext("make-it-rain", { damage: 100 });
    const result = executeGen9MoveEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.statChanges).toHaveLength(1);
    expect(result!.statChanges[0]).toEqual({
      target: "attacker",
      stat: "spAttack",
      stages: -1,
    });
  });

  it("given Make It Rain, when move effect resolves, then messages include SpA fell", () => {
    // Source: Showdown -- standard stat drop message
    const ctx = makeContext("make-it-rain", {
      attacker: { nickname: "Gholdengo" },
      damage: 100,
    });
    const result = handleMakeItRain(ctx);

    expect(result.messages).toContain("Gholdengo's Special Attack fell!");
  });
});

// ===========================================================================
// Revival Blessing
// ===========================================================================

describe("Gen9 Revival Blessing -- canUseRevivalBlessing", () => {
  it("given a side with one fainted member, when checking canUseRevivalBlessing, then returns true", () => {
    // Source: Showdown data/moves.ts:15682-15685
    // onTryHit: return false if no fainted allies
    const side = makeSide({
      team: [makePokemonInstance({ currentHp: 200 }), makePokemonInstance({ currentHp: 0 })],
    });
    expect(canUseRevivalBlessing(side)).toBe(true);
  });

  it("given a side with no fainted members, when checking canUseRevivalBlessing, then returns false", () => {
    // Source: Showdown data/moves.ts:15682-15685
    const side = makeSide({
      team: [makePokemonInstance({ currentHp: 200 }), makePokemonInstance({ currentHp: 150 })],
    });
    expect(canUseRevivalBlessing(side)).toBe(false);
  });
});

describe("Gen9 Revival Blessing -- findRevivalTarget", () => {
  it("given two fainted members, when finding target, then returns index of first fainted", () => {
    // Source: Showdown -- in simulation, we revive the first fainted member
    const side = makeSide({
      team: [
        makePokemonInstance({ currentHp: 200 }),
        makePokemonInstance({ currentHp: 0 }),
        makePokemonInstance({ currentHp: 0 }),
      ],
    });
    expect(findRevivalTarget(side)).toBe(1);
  });

  it("given no fainted members, when finding target, then returns -1", () => {
    const side = makeSide({
      team: [makePokemonInstance({ currentHp: 100 })],
    });
    expect(findRevivalTarget(side)).toBe(-1);
  });
});

describe("Gen9 Revival Blessing -- calculateRevivalHp", () => {
  it("given 400 max HP, when calculating revival HP, then returns 200 (50%)", () => {
    // Source: Bulbapedia -- "restores it to half of its maximum HP"
    // 400 / 2 = 200
    expect(calculateRevivalHp(400)).toBe(200);
  });

  it("given 1 max HP (Shedinja), when calculating revival HP, then returns 1 (minimum)", () => {
    // Source: Bulbapedia -- Shedinja always has 1 HP
    // floor(1/2) = 0, clamped to max(1, 0) = 1
    expect(calculateRevivalHp(1)).toBe(1);
  });

  it("given 301 max HP, when calculating revival HP, then returns 150 (floor of 150.5)", () => {
    // floor(301/2) = 150
    expect(calculateRevivalHp(301)).toBe(150);
  });
});

describe("Gen9 Revival Blessing -- handleRevivalBlessing", () => {
  it("given a fainted ally at 400 max HP, when Revival Blessing is used, then ally is revived at 200 HP", () => {
    // Source: Showdown data/moves.ts:15672-15691
    // Source: Bulbapedia -- "restores it to half of its maximum HP"
    const faintedPokemon = makePokemonInstance({
      currentHp: 0,
      calculatedStats: {
        hp: 400,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const attacker = makeActivePokemon({});
    const side0 = {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon, faintedPokemon],
    } as unknown as BattleSide;
    const side1 = makeSide({ index: 1 as const });

    const ctx = makeContext("revival-blessing", {
      sides: [side0, side1],
      attacker: {},
    });
    // Override the context's state to have our custom sides
    Object.assign(ctx, {
      state: makeState({ sides: [side0, side1] }),
      attacker,
    });

    const result = handleRevivalBlessing(ctx);

    expect(faintedPokemon.currentHp).toBe(200);
    expect(faintedPokemon.status).toBeNull();
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("given no fainted allies, when Revival Blessing is used, then move fails", () => {
    // Source: Showdown data/moves.ts:15682-15685 -- move fails if no fainted allies
    const attacker = makeActivePokemon({});
    const allyAlive = makePokemonInstance({ currentHp: 100 });
    const side0 = {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon, allyAlive],
    } as unknown as BattleSide;
    const side1 = makeSide({ index: 1 as const });

    const ctx = makeContext("revival-blessing", {
      sides: [side0, side1],
    });
    Object.assign(ctx, {
      state: makeState({ sides: [side0, side1] }),
      attacker,
    });

    const result = handleRevivalBlessing(ctx);
    expect(result.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Last Respects
// ===========================================================================

describe("Gen9 Last Respects -- getLastRespectsPower", () => {
  it("given 0 fainted allies, when calculating Last Respects power, then returns 50", () => {
    // Source: Showdown data/moves.ts:10473-10474
    // basePowerCallback: 50 + 50 * pokemon.side.totalFainted
    // 50 + 50 * 0 = 50
    expect(getLastRespectsPower(0)).toBe(50);
  });

  it("given 1 fainted ally, when calculating Last Respects power, then returns 100", () => {
    // Source: Showdown data/moves.ts:10473-10474 -- 50 + 50 * 1 = 100
    expect(getLastRespectsPower(1)).toBe(100);
  });

  it("given 3 fainted allies, when calculating Last Respects power, then returns 200", () => {
    // Source: Showdown data/moves.ts:10473-10474 -- 50 + 50 * 3 = 200
    expect(getLastRespectsPower(3)).toBe(200);
  });

  it("given 5 fainted allies, when calculating Last Respects power, then returns 300 (no cap unlike Rage Fist)", () => {
    // Source: Showdown data/moves.ts:10469-10484 -- no Math.min cap
    // This differs from Rage Fist which caps at 350
    // 50 + 50 * 5 = 300
    expect(getLastRespectsPower(5)).toBe(300);
  });

  it("given 10 fainted allies (theoretical max), when calculating, then returns 550 (no cap)", () => {
    // Source: Showdown data/moves.ts:10473-10474 -- no cap in the code
    // In a 6v6 singles battle max fainted is 5, but formula has no cap
    // 50 + 50 * 10 = 550
    expect(getLastRespectsPower(10)).toBe(550);
  });
});

describe("Gen9 Last Respects vs Rage Fist comparison", () => {
  it("given 6 hits/fainted for each, Rage Fist is capped at 350 while Last Respects is 350", () => {
    // Source: Showdown data/moves.ts
    // Rage Fist: Math.min(350, 50 + 50 * 6) = Math.min(350, 350) = 350
    // Last Respects: 50 + 50 * 6 = 350 (no cap, but happens to equal the Rage Fist cap)
    expect(getRageFistPower(6)).toBe(350);
    expect(getLastRespectsPower(6)).toBe(350);
  });

  it("given 7 hits/fainted, Rage Fist stays at 350 (capped) while Last Respects reaches 400", () => {
    // Source: Showdown data/moves.ts
    // Rage Fist: Math.min(350, 50 + 50 * 7) = 350 (capped)
    // Last Respects: 50 + 50 * 7 = 400 (no cap)
    expect(getRageFistPower(7)).toBe(350);
    expect(getLastRespectsPower(7)).toBe(400);
  });
});

// ===========================================================================
// Shed Tail
// ===========================================================================

describe("Gen9 Shed Tail -- calculateShedTailCost", () => {
  it("given 400 max HP, when calculating Shed Tail cost, then returns 200 (ceil(400/2))", () => {
    // Source: Showdown data/moves.ts:16784
    // this.directDamage(Math.ceil(target.maxhp / 2))
    // ceil(400/2) = 200
    expect(calculateShedTailCost(400)).toBe(200);
  });

  it("given 401 max HP, when calculating Shed Tail cost, then returns 201 (ceil(401/2))", () => {
    // Source: Showdown data/moves.ts:16784 -- Math.ceil(401/2) = 201
    expect(calculateShedTailCost(401)).toBe(201);
  });

  it("given 1 max HP, when calculating Shed Tail cost, then returns 1 (ceil(1/2))", () => {
    // Source: Showdown data/moves.ts:16784 -- Math.ceil(1/2) = 1
    expect(calculateShedTailCost(1)).toBe(1);
  });
});

describe("Gen9 Shed Tail -- canUseShedTail", () => {
  it("given Pokemon at 75% HP with no substitute and allies available, then canUseShedTail returns true", () => {
    // Source: Showdown data/moves.ts:16769-16781
    const attacker = makeActivePokemon({ maxHp: 400, currentHp: 300, teamSlot: 0 });
    const allyPokemon = makePokemonInstance({ currentHp: 200 });
    const side = {
      ...makeSide(),
      active: [attacker],
      team: [attacker.pokemon, allyPokemon],
    } as unknown as BattleSide;

    expect(canUseShedTail(attacker, side).canUse).toBe(true);
  });

  it("given Pokemon at exactly 50% HP (equal to cost), then canUseShedTail returns false", () => {
    // Source: Showdown data/moves.ts:16778
    // if (source.hp <= Math.ceil(source.maxhp / 2)) fail
    // HP=200, maxHP=400, cost=ceil(400/2)=200 -> 200 <= 200 -> fail
    const attacker = makeActivePokemon({ maxHp: 400, currentHp: 200, teamSlot: 0 });
    const allyPokemon = makePokemonInstance({ currentHp: 200 });
    const side = {
      ...makeSide(),
      active: [attacker],
      team: [attacker.pokemon, allyPokemon],
    } as unknown as BattleSide;

    expect(canUseShedTail(attacker, side).canUse).toBe(false);
  });

  it("given Pokemon at 40% HP, then canUseShedTail returns false (not enough HP)", () => {
    // Source: Showdown data/moves.ts:16778
    // HP=160, maxHP=400, cost=200 -> 160 <= 200 -> fail
    const attacker = makeActivePokemon({ maxHp: 400, currentHp: 160, teamSlot: 0 });
    const allyPokemon = makePokemonInstance({ currentHp: 200 });
    const side = {
      ...makeSide(),
      active: [attacker],
      team: [attacker.pokemon, allyPokemon],
    } as unknown as BattleSide;

    expect(canUseShedTail(attacker, side).canUse).toBe(false);
  });

  it("given Pokemon with existing Substitute, then canUseShedTail returns false", () => {
    // Source: Showdown data/moves.ts:16774
    // if (source.volatiles['substitute']) fail
    const attacker = makeActivePokemon({
      maxHp: 400,
      currentHp: 300,
      substituteHp: 100,
      teamSlot: 0,
    });
    const allyPokemon = makePokemonInstance({ currentHp: 200 });
    const side = {
      ...makeSide(),
      active: [attacker],
      team: [attacker.pokemon, allyPokemon],
    } as unknown as BattleSide;

    expect(canUseShedTail(attacker, side).canUse).toBe(false);
    expect(canUseShedTail(attacker, side).reason).toBe("already has a Substitute");
  });

  it("given no allies available to switch to, then canUseShedTail returns false", () => {
    // Source: Showdown data/moves.ts:16770
    // if (!this.canSwitch(source.side)) fail
    const attacker = makeActivePokemon({ maxHp: 400, currentHp: 300, teamSlot: 0 });
    const side = {
      ...makeSide(),
      active: [attacker],
      team: [attacker.pokemon], // Only the active Pokemon, no bench
    } as unknown as BattleSide;

    expect(canUseShedTail(attacker, side).canUse).toBe(false);
    expect(canUseShedTail(attacker, side).reason).toBe("no allies available to switch to");
  });
});

describe("Gen9 Shed Tail -- handleShedTail", () => {
  it("given valid conditions, when Shed Tail is used, then user loses HP and switchOut is true", () => {
    // Source: Showdown data/moves.ts:16784 -- this.directDamage(Math.ceil(target.maxhp / 2))
    // Source: Showdown data/moves.ts:16791 -- selfSwitch: 'shedtail'
    const attacker = makeActivePokemon({ maxHp: 400, currentHp: 300, teamSlot: 0 });
    const allyPokemon = makePokemonInstance({ currentHp: 200 });
    const side0 = {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon, allyPokemon],
    } as unknown as BattleSide;
    const side1 = makeSide({ index: 1 as const });

    const ctx = makeContext("shed-tail", { sides: [side0, side1] });
    Object.assign(ctx, {
      state: makeState({ sides: [side0, side1] }),
      attacker,
    });

    const result = handleShedTail(ctx);

    // User should lose ceil(400/2) = 200 HP
    expect(attacker.pokemon.currentHp).toBe(100); // 300 - 200 = 100
    // Result should indicate switch-out
    expect(result.switchOut).toBe(true);
    // Should have a shed-tail-sub volatile for the incoming Pokemon
    expect(attacker.volatileStatuses.has("shed-tail-sub" as any)).toBe(true);
    const subData = attacker.volatileStatuses.get("shed-tail-sub" as any);
    // Sub HP should be floor(400/4) = 100
    expect(subData?.data?.substituteHp).toBe(100);
  });

  it("given insufficient HP, when Shed Tail is used, then move fails", () => {
    // Source: Showdown data/moves.ts:16778 -- fail if HP <= ceil(maxhp/2)
    const attacker = makeActivePokemon({ maxHp: 400, currentHp: 160, teamSlot: 0 });
    const allyPokemon = makePokemonInstance({ currentHp: 200 });
    const side0 = {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon, allyPokemon],
    } as unknown as BattleSide;
    const side1 = makeSide({ index: 1 as const });

    const ctx = makeContext("shed-tail", { sides: [side0, side1] });
    Object.assign(ctx, {
      state: makeState({ sides: [side0, side1] }),
      attacker,
    });

    const result = handleShedTail(ctx);

    expect(result.switchOut).toBe(false);
    expect(result.messages).toContain("But it failed!");
    // HP should be unchanged
    expect(attacker.pokemon.currentHp).toBe(160);
  });
});

// ===========================================================================
// Tidy Up
// ===========================================================================

describe("Gen9 Tidy Up", () => {
  it("given hazards on both sides and substitutes, when Tidy Up is used, then all cleared and user gets +1 Atk/Spe", () => {
    // Source: Showdown data/moves.ts:20360-20376
    // Removes all substitutes, all hazards from both sides, +1 Atk and +1 Spe
    const attacker = makeActivePokemon({ substituteHp: 0 });
    const defender = makeActivePokemon({ substituteHp: 50 });

    const side0 = {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon],
      hazards: [
        { type: "stealth-rock", layers: 1 },
        { type: "spikes", layers: 2 },
      ],
    } as unknown as BattleSide;
    const side1 = {
      ...makeSide({ index: 1 as const }),
      active: [defender],
      team: [defender.pokemon],
      hazards: [{ type: "toxic-spikes", layers: 1 }],
    } as unknown as BattleSide;

    const ctx = makeContext("tidy-up", { sides: [side0, side1] });
    Object.assign(ctx, {
      state: makeState({ sides: [side0, side1] }),
      attacker,
      defender,
    });

    const result = handleTidyUp(ctx);

    // Hazards should be cleared from both sides
    expect(side0.hazards).toEqual([]);
    expect(side1.hazards).toEqual([]);
    // Defender's substitute should be removed
    expect(defender.substituteHp).toBe(0);
    // Stat boosts
    expect(result.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ]);
  });

  it("given screens active (Reflect, Light Screen), when Tidy Up is used, then screens are NOT removed", () => {
    // Source: Showdown data/moves.ts:20365
    // removeAll only includes hazard types, NOT screens
    const attacker = makeActivePokemon({});

    const side0 = {
      ...makeSide({ index: 0 as const }),
      active: [attacker],
      team: [attacker.pokemon],
      screens: [
        { type: "reflect", turnsLeft: 3 },
        { type: "light-screen", turnsLeft: 2 },
      ],
      hazards: [],
    } as unknown as BattleSide;
    const side1 = makeSide({ index: 1 as const });

    const ctx = makeContext("tidy-up", { sides: [side0, side1] });
    Object.assign(ctx, {
      state: makeState({ sides: [side0, side1] }),
      attacker,
    });

    handleTidyUp(ctx);

    // Screens should be unchanged
    expect(side0.screens).toHaveLength(2);
    expect(side0.screens[0].type).toBe("reflect");
    expect(side0.screens[1].type).toBe("light-screen");
  });

  it("given no hazards and no substitutes, when Tidy Up is used, then still gets +1 Atk/Spe", () => {
    // Source: Showdown data/moves.ts:20376
    // return !!this.boost({ atk: 1, spe: 1 }) -- boosts happen regardless
    const ctx = makeContext("tidy-up");
    const result = handleTidyUp(ctx);

    expect(result.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ]);
  });
});

// ===========================================================================
// Salt Cure
// ===========================================================================

describe("Gen9 Salt Cure -- calculateSaltCureDamage", () => {
  it("given a Water-type Pokemon with 400 max HP, when calculating Salt Cure damage, then returns 100 (1/4)", () => {
    // Source: Showdown data/moves.ts:16226
    // pokemon.baseMaxhp / (pokemon.hasType(['Water', 'Steel']) ? 4 : 8)
    // 400 / 4 = 100
    expect(calculateSaltCureDamage(400, ["water"])).toBe(100);
  });

  it("given a Steel-type Pokemon with 400 max HP, when calculating Salt Cure damage, then returns 100 (1/4)", () => {
    // Source: Showdown data/moves.ts:16226 -- Steel is also affected at 1/4
    // 400 / 4 = 100
    expect(calculateSaltCureDamage(400, ["steel"])).toBe(100);
  });

  it("given a Water/Steel dual-type Pokemon with 400 max HP, when calculating Salt Cure damage, then returns 100 (1/4)", () => {
    // Source: Showdown data/moves.ts:16226 -- hasType checks either type
    expect(calculateSaltCureDamage(400, ["water", "steel"])).toBe(100);
  });

  it("given a Normal-type Pokemon with 400 max HP, when calculating Salt Cure damage, then returns 50 (1/8)", () => {
    // Source: Showdown data/moves.ts:16226 -- non-Water/Steel gets 1/8
    // 400 / 8 = 50
    expect(calculateSaltCureDamage(400, ["normal"])).toBe(50);
  });

  it("given a Fire-type Pokemon with 400 max HP, when calculating Salt Cure damage, then returns 50 (1/8)", () => {
    // Source: Showdown data/moves.ts:16226 -- non-Water/Steel gets 1/8
    expect(calculateSaltCureDamage(400, ["fire"])).toBe(50);
  });

  it("given a Pokemon with 7 max HP, when calculating Salt Cure damage, then returns 1 (minimum)", () => {
    // Source: Showdown -- damage function enforces minimum 1
    // floor(7/8) = 0, max(1, 0) = 1
    expect(calculateSaltCureDamage(7, ["normal"])).toBe(1);
  });

  it("given a Water-type Pokemon with 3 max HP, when calculating Salt Cure damage, then returns 1 (minimum)", () => {
    // floor(3/4) = 0, max(1, 0) = 1
    expect(calculateSaltCureDamage(3, ["water"])).toBe(1);
  });
});

describe("Gen9 Salt Cure -- handleSaltCure", () => {
  it("given target without Salt Cure, when Salt Cure hits, then applies salt-cure volatile", () => {
    // Source: Showdown data/moves.ts:16232-16234
    // secondary: { chance: 100, volatileStatus: 'saltcure' }
    const ctx = makeContext("salt-cure", { damage: 30 });
    const result = handleSaltCure(ctx);

    expect(result.volatileInflicted).toBe("salt-cure");
    expect(result.volatileData?.turnsLeft).toBe(-1); // No set expiry
  });

  it("given target already has Salt Cure, when Salt Cure hits again, then no duplicate volatile applied", () => {
    // Source: Showdown -- noCopy: true, cannot stack
    const ctx = makeContext("salt-cure", {
      defender: {
        volatileStatuses: new Map([["salt-cure", { turnsLeft: -1 }]]),
      },
      damage: 30,
    });
    const result = handleSaltCure(ctx);

    expect(result.volatileInflicted).toBeNull();
  });
});

describe("Gen9 Salt Cure -- processSaltCureDamage via Gen9Ruleset", () => {
  it("given a Normal-type with salt-cure and 400 HP, when processing salt cure EoT, then takes 50 damage", () => {
    // Source: Showdown data/moves.ts:16226 -- 400/8 = 50
    const ruleset = new Gen9Ruleset();
    const active = makeActivePokemon({
      maxHp: 400,
      currentHp: 400,
      types: ["normal"],
      volatileStatuses: new Map([["salt-cure", { turnsLeft: -1 }]]) as any,
    });

    const damage = ruleset.processSaltCureDamage(active);
    expect(damage).toBe(50);
    expect(active.pokemon.currentHp).toBe(350); // 400 - 50
  });

  it("given a Water-type with salt-cure and 400 HP, when processing salt cure EoT, then takes 100 damage", () => {
    // Source: Showdown data/moves.ts:16226 -- 400/4 = 100
    const ruleset = new Gen9Ruleset();
    const active = makeActivePokemon({
      maxHp: 400,
      currentHp: 400,
      types: ["water"],
      volatileStatuses: new Map([["salt-cure", { turnsLeft: -1 }]]) as any,
    });

    const damage = ruleset.processSaltCureDamage(active);
    expect(damage).toBe(100);
    expect(active.pokemon.currentHp).toBe(300); // 400 - 100
  });

  it("given a Pokemon without salt-cure, when processing salt cure EoT, then takes 0 damage", () => {
    const ruleset = new Gen9Ruleset();
    const active = makeActivePokemon({
      maxHp: 400,
      currentHp: 400,
    });

    const damage = ruleset.processSaltCureDamage(active);
    expect(damage).toBe(0);
    expect(active.pokemon.currentHp).toBe(400);
  });

  it("given a fainted Pokemon with salt-cure, when processing salt cure EoT, then takes 0 damage", () => {
    const ruleset = new Gen9Ruleset();
    const active = makeActivePokemon({
      maxHp: 400,
      currentHp: 0,
      volatileStatuses: new Map([["salt-cure", { turnsLeft: -1 }]]) as any,
    });

    const damage = ruleset.processSaltCureDamage(active);
    expect(damage).toBe(0);
  });
});

// ===========================================================================
// Tera Blast (Stellar self-debuff)
// ===========================================================================

describe("Gen9 Tera Blast -- shouldApplyStellarDebuff", () => {
  it("given Stellar-Tera Pokemon, when checking shouldApplyStellarDebuff, then returns true", () => {
    // Source: Showdown data/moves.ts:19948-19949
    // if (pokemon.terastallized === 'Stellar') move.self = { boosts: { atk: -1, spa: -1 } }
    const attacker = makeActivePokemon({
      isTerastallized: true,
      teraType: "stellar",
    });
    expect(shouldApplyStellarDebuff(attacker)).toBe(true);
  });

  it("given non-Stellar Tera Pokemon (Fire), when checking shouldApplyStellarDebuff, then returns false", () => {
    // Source: Showdown data/moves.ts:19948 -- only Stellar triggers the debuff
    const attacker = makeActivePokemon({
      isTerastallized: true,
      teraType: "fire",
    });
    expect(shouldApplyStellarDebuff(attacker)).toBe(false);
  });

  it("given non-Terastallized Pokemon, when checking shouldApplyStellarDebuff, then returns false", () => {
    // Source: Showdown -- only applies when terastallized
    const attacker = makeActivePokemon({
      isTerastallized: false,
      teraType: null,
    });
    expect(shouldApplyStellarDebuff(attacker)).toBe(false);
  });
});

describe("Gen9 Tera Blast -- handleTeraBlast", () => {
  it("given Stellar-Tera Pokemon using Tera Blast, when move effect resolves, then user gets -1 Atk and -1 SpA", () => {
    // Source: Showdown data/moves.ts:19948-19949
    // move.self = { boosts: { atk: -1, spa: -1 } }
    const ctx = makeContext("tera-blast", {
      attacker: { isTerastallized: true, teraType: "stellar" },
      damage: 100,
    });
    const result = handleTeraBlast(ctx);

    expect(result.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: -1 },
      { target: "attacker", stat: "spAttack", stages: -1 },
    ]);
  });

  it("given Fire-Tera Pokemon using Tera Blast, when move effect resolves, then no stat changes", () => {
    // Source: Showdown data/moves.ts:19948 -- self-debuff only for Stellar
    const ctx = makeContext("tera-blast", {
      attacker: { isTerastallized: true, teraType: "fire" },
      damage: 100,
    });
    const result = handleTeraBlast(ctx);

    expect(result.statChanges).toEqual([]);
  });

  it("given non-Terastallized Pokemon using Tera Blast, when move effect resolves, then no stat changes", () => {
    // Source: Showdown -- Tera Blast without Tera is just a normal move
    const ctx = makeContext("tera-blast", {
      attacker: { isTerastallized: false },
      damage: 80,
    });
    const result = handleTeraBlast(ctx);

    expect(result.statChanges).toEqual([]);
  });
});

// ===========================================================================
// Master Dispatcher
// ===========================================================================

describe("Gen9 executeGen9MoveEffect -- dispatch", () => {
  it("given an unknown move ID, when dispatched, then returns null (not handled)", () => {
    const ctx = makeContext("flamethrower");
    const result = executeGen9MoveEffect(ctx);
    expect(result).toBeNull();
  });

  it("given population-bomb, when dispatched, then returns non-null result", () => {
    const ctx = makeContext("population-bomb");
    expect(executeGen9MoveEffect(ctx)).not.toBeNull();
  });

  it("given rage-fist, when dispatched, then returns non-null result", () => {
    const ctx = makeContext("rage-fist");
    expect(executeGen9MoveEffect(ctx)).not.toBeNull();
  });

  it("given make-it-rain, when dispatched, then returns non-null result with spa drop", () => {
    const ctx = makeContext("make-it-rain", { damage: 100 });
    const result = executeGen9MoveEffect(ctx);
    expect(result).not.toBeNull();
    expect(result!.statChanges).toHaveLength(1);
  });

  it("given salt-cure, when dispatched, then returns non-null result with volatile", () => {
    const ctx = makeContext("salt-cure", { damage: 30 });
    const result = executeGen9MoveEffect(ctx);
    expect(result).not.toBeNull();
    expect(result!.volatileInflicted).toBe("salt-cure");
  });

  it("given tera-blast with Stellar, when dispatched, then returns stat drops", () => {
    const ctx = makeContext("tera-blast", {
      attacker: { isTerastallized: true, teraType: "stellar" },
      damage: 100,
    });
    const result = executeGen9MoveEffect(ctx);
    expect(result).not.toBeNull();
    expect(result!.statChanges).toHaveLength(2);
  });

  it("given tidy-up, when dispatched, then returns non-null result with stat boosts", () => {
    const ctx = makeContext("tidy-up");
    const result = executeGen9MoveEffect(ctx);
    expect(result).not.toBeNull();
    expect(result!.statChanges).toEqual([
      { target: "attacker", stat: "attack", stages: 1 },
      { target: "attacker", stat: "speed", stages: 1 },
    ]);
  });
});

// ===========================================================================
// Gen9Ruleset Integration
// ===========================================================================

describe("Gen9Ruleset -- executeMoveEffect integration", () => {
  it("given gen9 ruleset, when executeMoveEffect called with make-it-rain, then delegates to gen9 handler", () => {
    const ruleset = new Gen9Ruleset();
    const ctx = makeContext("make-it-rain", { damage: 100 });
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.statChanges).toEqual([{ target: "attacker", stat: "spAttack", stages: -1 }]);
  });

  it("given gen9 ruleset, when executeMoveEffect called with unknown move, then falls back to BaseRuleset", () => {
    const ruleset = new Gen9Ruleset();
    const ctx = makeContext("flamethrower", { damage: 80 });
    const result = ruleset.executeMoveEffect(ctx);

    // BaseRuleset returns empty result
    expect(result.statChanges).toEqual([]);
    expect(result.statusInflicted).toBeNull();
  });
});

describe("Gen9Ruleset -- getEndOfTurnOrder includes salt-cure", () => {
  it("given gen9 ruleset, when getting EoT order, then salt-cure appears after bind", () => {
    // Source: Showdown data/moves.ts:16224 -- onResidualOrder: 13 (same as bind)
    const ruleset = new Gen9Ruleset();
    const order = ruleset.getEndOfTurnOrder();

    const bindIndex = order.indexOf("bind");
    const saltCureIndex = order.indexOf("salt-cure" as any);

    expect(bindIndex).toBeGreaterThan(-1);
    expect(saltCureIndex).toBeGreaterThan(-1);
    expect(saltCureIndex).toBe(bindIndex + 1); // Salt cure comes right after bind
  });

  it("given gen9 ruleset, when getting EoT order, then contains all standard effects plus salt-cure", () => {
    const ruleset = new Gen9Ruleset();
    const order = ruleset.getEndOfTurnOrder();

    // Standard effects from BaseRuleset should still be present
    expect(order).toContain("weather-damage");
    expect(order).toContain("status-damage");
    expect(order).toContain("leech-seed");
    expect(order).toContain("bind");
    expect(order).toContain("perish-song");
    // Gen 9 addition
    expect(order).toContain("salt-cure" as any);
  });
});
