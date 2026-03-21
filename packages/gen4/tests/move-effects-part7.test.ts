import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type {
  MoveCategory,
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";

/**
 * Gen 4 Move Effects — Part 7 Tests
 *
 * Tests for Counter, Mirror Coat, Destiny Bond, Taunt, Disable, and Future Sight
 * move effect handlers.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia — move-specific articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, chanceResult = false) {
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

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  level?: number;
  ability?: string;
  lastDamageTaken?: number;
  lastDamageCategory?: MoveCategory | null;
  lastMoveUsed?: string | null;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
    lastDamageTaken: opts.lastDamageTaken ?? 0,
    lastDamageType: null,
    lastDamageCategory: opts.lastDamageCategory ?? null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    name: id,
    type: "normal",
    category: "physical",
    power: 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: [],
    effect: null,
    critRatio: 0,
    generation: 4,
    isContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
    description: "",
    ...overrides,
  } as MoveData;
}

function createMinimalBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

// ─── Counter ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Counter", () => {
  it("given attacker took 50 physical damage last turn, when Counter is used, then returns customDamage.amount = 100", () => {
    // Source: Showdown Gen 4 — Counter returns 2x physical damage received
    // 50 * 2 = 100
    const attacker = createActivePokemon({
      types: ["normal"],
      lastDamageTaken: 50,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("counter");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).not.toBeNull();
    expect(result.customDamage!.amount).toBe(100);
    expect(result.customDamage!.target).toBe("defender");
    expect(result.customDamage!.source).toBe("counter");
  });

  it("given attacker took 75 physical damage last turn, when Counter is used, then returns customDamage.amount = 150", () => {
    // Source: Showdown Gen 4 — Counter returns 2x physical damage received
    // 75 * 2 = 150 (triangulation with different input)
    const attacker = createActivePokemon({
      types: ["fighting"],
      lastDamageTaken: 75,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("counter");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).not.toBeNull();
    expect(result.customDamage!.amount).toBe(150);
  });

  it("given attacker took 60 special damage last turn, when Counter is used, then fails with message", () => {
    // Source: Showdown Gen 4 — Counter only responds to physical damage
    const attacker = createActivePokemon({
      types: ["normal"],
      lastDamageTaken: 60,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("counter");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker took no damage, when Counter is used, then fails with message", () => {
    // Source: Showdown Gen 4 — Counter fails if no damage was taken
    const attacker = createActivePokemon({
      types: ["normal"],
      lastDamageTaken: 0,
      lastDamageCategory: null,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("counter");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ─── Mirror Coat ──────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Mirror Coat", () => {
  it("given attacker took 60 special damage last turn, when Mirror Coat is used, then returns customDamage.amount = 120", () => {
    // Source: Showdown Gen 4 — Mirror Coat returns 2x special damage received
    // 60 * 2 = 120
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 60,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("mirror-coat");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).not.toBeNull();
    expect(result.customDamage!.amount).toBe(120);
    expect(result.customDamage!.target).toBe("defender");
    expect(result.customDamage!.source).toBe("mirror-coat");
  });

  it("given attacker took 40 special damage last turn, when Mirror Coat is used, then returns customDamage.amount = 80", () => {
    // Source: Showdown Gen 4 — Mirror Coat returns 2x special damage received
    // 40 * 2 = 80 (triangulation with different input)
    const attacker = createActivePokemon({
      types: ["water"],
      lastDamageTaken: 40,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["fire"] });
    const move = dataManager.getMove("mirror-coat");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).not.toBeNull();
    expect(result.customDamage!.amount).toBe(80);
  });

  it("given attacker took 50 physical damage last turn, when Mirror Coat is used, then fails", () => {
    // Source: Showdown Gen 4 — Mirror Coat only responds to special damage
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 50,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("mirror-coat");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker took no damage, when Mirror Coat is used, then fails", () => {
    // Source: Showdown Gen 4 — Mirror Coat fails if no damage was taken
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 0,
      lastDamageCategory: null,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("mirror-coat");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ─── Destiny Bond ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Destiny Bond", () => {
  it("given Pokemon uses Destiny Bond, then selfVolatileInflicted is destiny-bond", () => {
    // Source: Bulbapedia — "Destiny Bond sets the destiny-bond volatile on the user"
    // Source: Showdown Gen 4 — sets destiny-bond volatile status
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("destiny-bond");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("destiny-bond");
  });

  it("given Pokemon with nickname uses Destiny Bond, then message references the nickname", () => {
    // Source: Showdown Gen 4 — "[Pokemon] is trying to take its foe down with it!"
    const attacker = createActivePokemon({ types: ["ghost"], nickname: "Gengar" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("destiny-bond");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Gengar is trying to take its foe down with it!");
  });
});

// ─── Taunt ────────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Taunt", () => {
  it("given Pokemon uses Taunt, then volatileInflicted is taunt with turnsLeft = 3", () => {
    // Source: Bulbapedia — "Taunt lasts for 3 turns in Generation IV"
    // Source: Showdown Gen 4 — Taunt duration is 3 turns
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("taunt");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("taunt");
    expect(result.volatileData).toEqual({ turnsLeft: 3 });
  });

  it("given Pokemon uses Taunt against different target, then volatileData.turnsLeft is still 3", () => {
    // Source: Bulbapedia — Taunt duration is always 3 turns in Gen 4 regardless of target
    // Triangulation: same mechanic with different types to ensure it's not type-dependent
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["water"] });
    const move = dataManager.getMove("taunt");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("taunt");
    expect(result.volatileData!.turnsLeft).toBe(3);
  });
});

// ─── Disable ──────────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Disable", () => {
  it("given target has lastMoveUsed = tackle, when Disable is used, then volatileInflicted is disable with data.moveId = tackle", () => {
    // Source: Showdown Gen 4 — Disable targets the last used move for 4 turns
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["normal"],
      lastMoveUsed: "tackle",
    });
    const move = dataManager.getMove("disable");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData).toEqual({
      turnsLeft: 4,
      data: { moveId: "tackle" },
    });
  });

  it("given target has lastMoveUsed = flamethrower, when Disable is used, then data.moveId = flamethrower and turnsLeft = 4", () => {
    // Source: Showdown Gen 4 — Disable lasts 4 turns, records the move ID
    // Triangulation: different move to ensure the handler reads lastMoveUsed dynamically
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({
      types: ["fire"],
      lastMoveUsed: "flamethrower",
    });
    const move = dataManager.getMove("disable");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("disable");
    expect(result.volatileData!.turnsLeft).toBe(4);
    expect(result.volatileData!.data!.moveId).toBe("flamethrower");
  });

  it("given target has no lastMoveUsed, when Disable is used, then fails with message", () => {
    // Source: Showdown Gen 4 — Disable fails if the target hasn't used a move
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({
      types: ["normal"],
      lastMoveUsed: null,
    });
    const move = dataManager.getMove("disable");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });
});

// ─── Future Sight ─────────────────────────────────────────────────────────────

describe("Gen 4 executeMoveEffect — Future Sight", () => {
  it("given Pokemon uses Future Sight, then futureAttack.moveId = future-sight and turnsLeft = 3", () => {
    // Source: Bulbapedia — "Future Sight hits 2 turns after being used (3 EoT ticks)"
    // Source: Showdown Gen 4 — Future Sight schedules attack for 3 end-of-turn decrements
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("future-sight");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.futureAttack).not.toBeNull();
    expect(result.futureAttack!.moveId).toBe("future-sight");
    expect(result.futureAttack!.turnsLeft).toBe(3);
  });

  it("given Pokemon on side 0 uses Future Sight, then sourceSide = 0", () => {
    // Source: Showdown Gen 4 — Future Sight tracks which side used the move
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["fighting"] });
    const move = dataManager.getMove("future-sight");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.futureAttack!.sourceSide).toBe(0);
  });

  it("given Pokemon uses Future Sight, then message says foresaw an attack", () => {
    // Source: Showdown Gen 4 — "[Pokemon] foresaw an attack!"
    const attacker = createActivePokemon({ types: ["psychic"], nickname: "Alakazam" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = dataManager.getMove("future-sight");
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages).toContain("Alakazam foresaw an attack!");
  });
});
