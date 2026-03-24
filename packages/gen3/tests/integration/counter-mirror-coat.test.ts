import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../../src";
import { createGen3DataManager } from "../../src/data";

/**
 * Gen 3 Counter / Mirror Coat / Destiny Bond / Perish Song Tests
 *
 * Tests for issue #223: Counter, Mirror Coat, Destiny Bond, Perish Song.
 *
 * In Gen 3, physical/special is determined by move TYPE, not move category.
 * Physical types: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel
 * Special types: Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intValue = 0) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intValue,
    chance: () => false,
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
  ability?: string;
  lastDamageTaken?: number;
  lastDamageCategory?: "physical" | "special" | null;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
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
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 200,
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
    lastMoveUsed: null,
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
    stellarBoostedTypes: [],
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
    generation: 3,
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
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
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

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

describe("Gen 3 Counter", () => {
  it("given attacker took 50 physical damage, when Counter used, then customDamage = 100 (2x)", () => {
    // Source: pret/pokeemerald — Counter returns 2x physical damage
    // Source: Bulbapedia — "Counter deals damage equal to twice the damage dealt by the
    //   last physical move that hit the user"
    const attacker = createActivePokemon({
      types: ["fighting"],
      lastDamageTaken: 50,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("counter", { type: "fighting", category: "physical", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 100,
      source: "counter",
    });
  });

  it("given attacker took 1 physical damage, when Counter used, then customDamage = 2 (minimum 2x1)", () => {
    // Source: pret/pokeemerald — Counter formula: lastDamageTaken * 2
    const attacker = createActivePokemon({
      types: ["fighting"],
      lastDamageTaken: 1,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("counter", { type: "fighting", category: "physical", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 2,
      source: "counter",
    });
  });

  it("given attacker took special damage only, when Counter used, then it fails", () => {
    // Source: pret/pokeemerald — Counter only responds to physical damage
    const attacker = createActivePokemon({
      types: ["fighting"],
      lastDamageTaken: 80,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("counter", { type: "fighting", category: "physical", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker took no damage, when Counter used, then it fails", () => {
    // Source: pret/pokeemerald — Counter fails if no damage taken
    const attacker = createActivePokemon({
      types: ["fighting"],
      lastDamageTaken: 0,
      lastDamageCategory: null,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("counter", { type: "fighting", category: "physical", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Mirror Coat
// ---------------------------------------------------------------------------

describe("Gen 3 Mirror Coat", () => {
  it("given attacker took 60 special damage, when Mirror Coat used, then customDamage = 120 (2x)", () => {
    // Source: pret/pokeemerald — Mirror Coat returns 2x special damage
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 60,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("mirror-coat", {
      type: "psychic",
      category: "special",
      power: null,
    });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 120,
      source: "mirror-coat",
    });
  });

  it("given attacker took 25 special damage, when Mirror Coat used, then customDamage = 50", () => {
    // Source: pret/pokeemerald — Mirror Coat formula: lastDamageTaken * 2
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 25,
      lastDamageCategory: "special",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("mirror-coat", {
      type: "psychic",
      category: "special",
      power: null,
    });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 50,
      source: "mirror-coat",
    });
  });

  it("given attacker took physical damage only, when Mirror Coat used, then it fails", () => {
    // Source: pret/pokeemerald — Mirror Coat only responds to special damage
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 80,
      lastDamageCategory: "physical",
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("mirror-coat", {
      type: "psychic",
      category: "special",
      power: null,
    });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker took no damage, when Mirror Coat used, then it fails", () => {
    // Source: pret/pokeemerald — Mirror Coat fails if no damage taken
    const attacker = createActivePokemon({
      types: ["psychic"],
      lastDamageTaken: 0,
      lastDamageCategory: null,
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("mirror-coat", {
      type: "psychic",
      category: "special",
      power: null,
    });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Destiny Bond
// ---------------------------------------------------------------------------

describe("Gen 3 Destiny Bond", () => {
  it("given attacker uses Destiny Bond, when executeMoveEffect called, then selfVolatileInflicted = destiny-bond", () => {
    // Source: pret/pokeemerald — sets destiny-bond volatile on user
    const attacker = createActivePokemon({ types: ["ghost"], nickname: "Gengar" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("destiny-bond", { type: "ghost", category: "status", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("destiny-bond");
    expect(result.messages).toContain("Gengar is trying to take its foe down with it!");
  });

  it("given attacker with no nickname uses Destiny Bond, when executeMoveEffect called, then default name in message", () => {
    // Source: pret/pokeemerald — Destiny Bond message
    const attacker = createActivePokemon({ types: ["ghost"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("destiny-bond", { type: "ghost", category: "status", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe("destiny-bond");
    expect(result.messages).toContain("The Pokemon is trying to take its foe down with it!");
  });
});

// ---------------------------------------------------------------------------
// Perish Song
// ---------------------------------------------------------------------------

describe("Gen 3 Perish Song", () => {
  it("given neither Pokemon has perish-song, when Perish Song used, then both get perish-song volatile with counter=3", () => {
    // Source: pret/pokeemerald — Perish Song sets 3-turn countdown on both
    // Source: Bulbapedia — "All Pokemon that hear the song will faint in 3 turns
    //   unless they switch out"
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("perish-song", { type: "normal", category: "status", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("perish-song");
    expect(result.volatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
    expect(result.selfVolatileInflicted).toBe("perish-song");
    expect(result.selfVolatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
    expect(result.messages).toContain("All Pokemon that heard the song will faint in 3 turns!");
  });

  it("given defender already has perish-song, when Perish Song used, then only attacker gets volatile", () => {
    // Source: pret/pokeemerald — already-affected Pokemon are skipped
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    defender.volatileStatuses.set("perish-song", { turnsLeft: 2 });
    const move = createMove("perish-song", { type: "normal", category: "status", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    // Defender already has perish-song, so volatileInflicted should NOT be set
    expect(result.volatileInflicted).toBeNull();
    // Attacker should still get it
    expect(result.selfVolatileInflicted).toBe("perish-song");
    expect(result.selfVolatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
  });

  it("given attacker already has perish-song, when Perish Song used, then only defender gets volatile", () => {
    // Source: pret/pokeemerald — already-affected Pokemon are skipped
    const attacker = createActivePokemon({ types: ["normal"] });
    attacker.volatileStatuses.set("perish-song", { turnsLeft: 1 });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("perish-song", { type: "normal", category: "status", power: null });
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe("perish-song");
    expect(result.volatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
    // Attacker already has it
    expect(result.selfVolatileInflicted).toBeUndefined();
  });
});
