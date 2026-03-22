import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen6StatAbility, isPranksterEligible } from "../src/Gen6AbilitiesStat";

/**
 * Gen 6 stat-modifying and priority ability tests.
 *
 * Tests Gen 6-specific behavior including:
 *   - Gale Wings (Gen 6): +1 priority to Flying moves with NO HP restriction
 *   - Protean: type changes to match move type before attacking
 *   - Competitive: +2 SpAtk on opponent stat drop
 *   - Carry-forward: Prankster, Defiant, Weak Armor, Speed Boost, Moxie, Steadfast
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test-pokemon",
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: null,
    friendship: 0,
    gender: "male" as const,
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
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  turnsOnField?: number;
  statStages?: Partial<Record<string, number>>;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
    }),
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: overrides.statStages?.accuracy ?? 0,
      evasion: overrides.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: overrides.turnsOnField ?? 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  };
}

function makeSide(index: 0 | 1): BattleSide {
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
  };
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
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
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeMove(
  type: PokemonType,
  category: "physical" | "special" | "status" = "physical",
): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type,
    category,
    power: category === "status" ? 0 : 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 6,
    flags: { contact: category !== "status" },
    effectChance: null,
    secondaryEffects: [],
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  move?: MoveData;
  turnsOnField?: number;
  nickname?: string;
  statStages?: Partial<Record<string, number>>;
  rngPick?: <T>(arr: readonly T[]) => T;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    turnsOnField: opts.turnsOnField,
    statStages: opts.statStages,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange,
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: opts.rngPick ?? (<T>(arr: readonly T[]) => arr[0] as T),
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// Gale Wings (NEW Gen 6 -- priority)
// ===========================================================================

describe("Gale Wings (Gen 6)", () => {
  it("given Gale Wings + Fly at full HP, when on-priority-check, then activates (+1 priority)", () => {
    // Source: Bulbapedia "Gale Wings" Gen 6 -- "+1 priority to Flying-type moves"
    // Source: Showdown data/mods/gen6/abilities.ts -- galeWings has no HP check
    const flyMove = makeMove("flying");
    const ctx = makeContext({
      ability: "gale-wings",
      trigger: "on-priority-check",
      move: flyMove,
      types: ["normal", "flying"],
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Gale Wings + Fly at 50% HP, when on-priority-check, then STILL activates (Gen 6 has NO HP restriction)", () => {
    // Source: Bulbapedia "Gale Wings" Gen 6 -- no HP requirement in Gen 6
    // Gen 7 added: "only when at full HP"
    // Source: Showdown data/mods/gen6/abilities.ts -- no hp check
    const flyMove = makeMove("flying");
    const ctx = makeContext({
      ability: "gale-wings",
      trigger: "on-priority-check",
      move: flyMove,
      types: ["normal", "flying"],
    });
    // Modify HP to be at 50%
    (ctx.pokemon.pokemon as any).currentHp = 100;
    (ctx.pokemon.pokemon as any).calculatedStats = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    };
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Gale Wings + Tackle (Normal, not Flying), when on-priority-check, then does not activate", () => {
    // Source: Bulbapedia "Gale Wings" -- only Flying-type moves get priority boost
    const normalMove = makeMove("normal");
    const ctx = makeContext({
      ability: "gale-wings",
      trigger: "on-priority-check",
      move: normalMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Protean (NEW Gen 6 -- type change)
// ===========================================================================

describe("Protean (Gen 6)", () => {
  it("given Protean + Water-type move, when on-before-move, then type changes to Water", () => {
    // Source: Bulbapedia "Protean" Gen 6 -- type changes to match move type before attacking
    // Source: Showdown data/abilities.ts -- protean: onPrepareHit
    const waterMove = makeMove("water", "special");
    const ctx = makeContext({
      ability: "protean",
      trigger: "on-before-move",
      move: waterMove,
      types: ["normal"], // current type is Normal, not Water
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "type-change", target: "self", types: ["water"] },
    ]);
  });

  it("given Protean + Fire-type move on a Fire-type Pokemon, when on-before-move, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- protean: no change if type already matches
    const fireMove = makeMove("fire", "special");
    const ctx = makeContext({
      ability: "protean",
      trigger: "on-before-move",
      move: fireMove,
      types: ["fire"], // already Fire-type
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Protean + Fighting-type move on a Normal/Flying Pokemon, when on-before-move, then type changes to Fighting", () => {
    // Source: Bulbapedia "Protean" -- type changes even for dual-type Pokemon
    const fightMove = makeMove("fighting");
    const ctx = makeContext({
      ability: "protean",
      trigger: "on-before-move",
      move: fightMove,
      types: ["normal", "flying"], // neither type is Fighting
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "type-change",
      target: "self",
      types: ["fighting"],
    });
  });
});

// ===========================================================================
// Competitive (in Gen 5 but important Gen 6 carry-forward)
// ===========================================================================

describe("Competitive", () => {
  it("given Competitive + Intimidate stat drop (opponent-caused), when on-stat-change, then +2 SpAtk", () => {
    // Source: Bulbapedia "Competitive" Gen 6 -- "+2 SpAtk when any stat lowered by opponent"
    // Source: Showdown data/abilities.ts -- competitive onAfterEachBoost
    const ctx = makeContext({
      ability: "competitive",
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 2,
    });
  });

  it("given Competitive + self-caused stat drop (Close Combat), when on-stat-change, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- competitive: only opponent-caused drops trigger
    const ctx = makeContext({
      ability: "competitive",
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Competitive + stat BOOST from opponent, when on-stat-change, then does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- competitive: only drops (stages < 0) trigger
    const ctx = makeContext({
      ability: "competitive",
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: 1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Prankster
// ===========================================================================

describe("Prankster (carry-forward)", () => {
  it("given Prankster + status move, when on-priority-check, then activates", () => {
    // Source: Showdown data/abilities.ts -- Prankster: move.category === 'Status'
    const statusMove = makeMove("normal", "status");
    const ctx = makeContext({
      ability: "prankster",
      trigger: "on-priority-check",
      move: statusMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Prankster + physical move, when on-priority-check, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Prankster only for status moves
    const physicalMove = makeMove("normal", "physical");
    const ctx = makeContext({
      ability: "prankster",
      trigger: "on-priority-check",
      move: physicalMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given isPranksterEligible with 'status', then returns true", () => {
    // Source: Showdown data/abilities.ts -- Prankster checks move.category === 'Status'
    expect(isPranksterEligible("status")).toBe(true);
  });

  it("given isPranksterEligible with 'physical', then returns false", () => {
    // Source: Showdown -- only status moves eligible
    expect(isPranksterEligible("physical")).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Defiant
// ===========================================================================

describe("Defiant (carry-forward)", () => {
  it("given Defiant + opponent-caused stat drop, when on-stat-change, then +2 Attack", () => {
    // Source: Showdown data/abilities.ts -- defiant onAfterEachBoost
    // Source: Bulbapedia -- Defiant: "+2 Attack when any stat lowered by opponent"
    const ctx = makeContext({
      ability: "defiant",
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 2,
    });
  });

  it("given Defiant + self-caused stat drop, when on-stat-change, then does not activate", () => {
    // Source: Showdown -- defiant only triggers on opponent-caused drops
    const ctx = makeContext({
      ability: "defiant",
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Speed Boost
// ===========================================================================

describe("Speed Boost (carry-forward)", () => {
  it("given Speed Boost + turnsOnField > 0, when on-turn-end, then +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual: if activeTurns, boost spe
    const ctx = makeContext({
      ability: "speed-boost",
      trigger: "on-turn-end",
      turnsOnField: 1,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Speed Boost + turnsOnField = 0, when on-turn-end, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost: only if activeTurns > 0
    const ctx = makeContext({
      ability: "speed-boost",
      trigger: "on-turn-end",
      turnsOnField: 0,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Weak Armor (Gen 5-6 version: +1 Speed)
// ===========================================================================

describe("Weak Armor (Gen 5-6 version)", () => {
  it("given Weak Armor + physical hit, when on-damage-taken, then -1 Def and +1 Speed", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: spe +1, def -1
    // Gen 7+ changed to spe +2
    const physMove = makeMove("normal", "physical");
    const ctx = makeContext({
      ability: "weak-armor",
      trigger: "on-damage-taken",
      move: physMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { effectType: "stat-change", target: "self", stat: "defense", stages: -1 },
      { effectType: "stat-change", target: "self", stat: "speed", stages: 1 },
    ]);
  });

  it("given Weak Armor + special hit, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Weak Armor only triggers on physical hits
    const specMove = makeMove("fire", "special");
    const ctx = makeContext({
      ability: "weak-armor",
      trigger: "on-damage-taken",
      move: specMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Justified
// ===========================================================================

describe("Justified (carry-forward)", () => {
  it("given Justified + Dark-type hit, when on-damage-taken, then +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- Justified: if Dark-type, boost atk
    const darkMove = makeMove("dark");
    const ctx = makeContext({
      ability: "justified",
      trigger: "on-damage-taken",
      move: darkMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Justified + Normal-type hit, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- only Dark-type moves trigger Justified
    const normalMove = makeMove("normal");
    const ctx = makeContext({
      ability: "justified",
      trigger: "on-damage-taken",
      move: normalMove,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Steadfast
// ===========================================================================

describe("Steadfast (carry-forward)", () => {
  it("given Steadfast, when on-flinch, then +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Steadfast: on flinch, boost spe
    const ctx = makeContext({
      ability: "steadfast",
      trigger: "on-flinch",
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given non-Steadfast ability, when on-flinch, then does not activate", () => {
    // Source: Showdown -- only Steadfast triggers on flinch in this module
    const ctx = makeContext({
      ability: "blaze",
      trigger: "on-flinch",
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Carry-forward: Contrary
// ===========================================================================

describe("Contrary (carry-forward)", () => {
  it("given Contrary, when on-stat-change, then activates (signals reversal)", () => {
    // Source: Showdown data/abilities.ts -- Contrary: reverses all stat changes
    const ctx = makeContext({
      ability: "contrary",
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: 2, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// Carry-forward: Simple
// ===========================================================================

describe("Simple (carry-forward)", () => {
  it("given Simple, when on-stat-change, then activates (signals doubling)", () => {
    // Source: Showdown data/abilities.ts -- Simple: doubles all stat changes
    const ctx = makeContext({
      ability: "simple",
      trigger: "on-stat-change",
      statChange: { stat: "attack", stages: 1, source: "self" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// Carry-forward: Moxie
// ===========================================================================

describe("Moxie (carry-forward)", () => {
  it("given Moxie + opponent fainted, when on-after-move-used, then +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint
    const faintedOpponent = makeActivePokemon({ currentHp: 0 });
    const ctx = makeContext({
      ability: "moxie",
      trigger: "on-after-move-used",
      opponent: faintedOpponent,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Moxie + opponent NOT fainted, when on-after-move-used, then does not activate", () => {
    // Source: Showdown -- Moxie only triggers on KO
    const aliveOpponent = makeActivePokemon({ currentHp: 100 });
    const ctx = makeContext({
      ability: "moxie",
      trigger: "on-after-move-used",
      opponent: aliveOpponent,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
