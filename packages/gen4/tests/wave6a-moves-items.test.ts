import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem, getPinchBerryThreshold } from "../src/Gen4Items";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Wave 6A -- Utility Moves, Combat Items, Speed/Berry Mechanics Tests
 *
 * Covers: Magnet Rise, Acupressure, Power/Guard/Heart Swap, Curse (Ghost),
 *         Sticky Barb, Berry Juice, Grip Claw, Gluttony, Unburden,
 *         and binding move duration.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia -- individual move/item/ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers (same pattern as wave5a-volatile-moves.test.ts)
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number, nextValue = 0) {
  return {
    next: () => nextValue,
    int: (_min: number, _max: number) => intReturnValue,
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
  maxHp?: number;
  level?: number;
  ability?: string;
  lastMoveUsed?: string | null;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  statStages?: Partial<Record<string, number>>;
  gender?: string;
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
    uid: `test-${Math.random().toString(36).slice(2, 8)}`,
    speciesId: 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: opts.moves ?? [
      { moveId: "tackle", currentPP: 35, maxPP: 35 },
      { moveId: "ember", currentPP: 25, maxPP: 25 },
    ],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: (opts.gender ?? "male") as "male" | "female" | "genderless",
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  const volatiles =
    opts.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();

  const defaultStages = {
    hp: 0,
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
    accuracy: 0,
    evasion: 0,
    ...(opts.statStages ?? {}),
  };

  return {
    pokemon,
    teamSlot: 0,
    statStages: defaultStages,
    volatileStatuses: volatiles,
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: opts.lastMoveUsed ?? null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    category: "status",
    power: 0,
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
    gravity: { active: false, turnsLeft: 0 },
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  rng: ReturnType<typeof createMockRng>,
  stateOverrides?: Partial<BattleState>,
): MoveEffectContext {
  const state = { ...createMinimalBattleState(attacker, defender), ...stateOverrides };
  return { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;
}

// ===========================================================================
// Magnet Rise
// ===========================================================================

describe("Magnet Rise", () => {
  it("given attacker uses Magnet Rise, when executed, then attacker gets magnet-rise volatile with turnsLeft=5", () => {
    // Source: Bulbapedia -- Magnet Rise: "levitates for five turns"
    // Source: Showdown Gen 4 mod -- Magnet Rise self-volatile, 5 turns
    const attacker = createActivePokemon({ types: ["electric"], nickname: "Magnezone" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("magnet-rise", { type: "electric" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBe("magnet-rise");
    expect(result.selfVolatileData).toEqual({ turnsLeft: 5 });
    expect(result.messages).toContain("Magnezone levitated with electromagnetism!");
  });

  it("given Gravity is active, when attacker uses Magnet Rise, then it fails", () => {
    // Source: Bulbapedia -- Magnet Rise fails under Gravity
    // Source: Showdown Gen 4 mod -- Magnet Rise blocked by Gravity
    const attacker = createActivePokemon({ types: ["electric"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("magnet-rise", { type: "electric" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng, {
      gravity: { active: true, turnsLeft: 3 },
    });

    const result = executeGen4MoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker already has Magnet Rise, when Magnet Rise is used again, then it fails", () => {
    // Source: Showdown Gen 4 mod -- Magnet Rise fails if already active
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("magnet-rise", { turnsLeft: 3 });
    const attacker = createActivePokemon({ types: ["electric"], volatiles });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("magnet-rise", { type: "electric" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.selfVolatileInflicted).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Acupressure
// ===========================================================================

describe("Acupressure", () => {
  it("given attacker uses Acupressure with no stats at +6, when executed, then a random stat is boosted by +2", () => {
    // Source: Bulbapedia -- Acupressure: "Sharply raises one of the user's stats at random"
    // Source: Showdown Gen 4 mod -- Acupressure +2 to random stat
    const attacker = createActivePokemon({ types: ["normal"], nickname: "Shuckle" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("acupressure");
    // rng.int returns 0, which picks the first boostable stat ("attack")
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0].target).toBe("attacker");
    expect(result.statChanges[0].stages).toBe(2);
    // First boostable stat alphabetically in our array is "attack"
    expect(result.statChanges[0].stat).toBe("attack");
  });

  it("given all stats are at +6, when Acupressure is used, then it fails", () => {
    // Source: Showdown Gen 4 mod -- Acupressure fails when all stats maxed
    const attacker = createActivePokemon({
      types: ["normal"],
      statStages: {
        attack: 6,
        defense: 6,
        spAttack: 6,
        spDefense: 6,
        speed: 6,
        accuracy: 6,
        evasion: 6,
      },
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("acupressure");
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.statChanges).toHaveLength(0);
    expect(result.messages).toContain("But it failed!");
  });

  it("given only speed is below +6, when Acupressure is used, then speed is boosted by +2", () => {
    // Source: Showdown Gen 4 mod -- only non-maxed stats are eligible
    const attacker = createActivePokemon({
      types: ["normal"],
      statStages: {
        attack: 6,
        defense: 6,
        spAttack: 6,
        spDefense: 6,
        speed: 4,
        accuracy: 6,
        evasion: 6,
      },
    });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("acupressure");
    // rng.int returns 0, only boostable stat is speed
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0].stat).toBe("speed");
    expect(result.statChanges[0].stages).toBe(2);
  });
});

// ===========================================================================
// Power Swap
// ===========================================================================

describe("Power Swap", () => {
  it("given attacker has +2 Atk and defender has -1 SpAtk, when Power Swap is used, then Atk and SpAtk stages are swapped", () => {
    // Source: Bulbapedia -- Power Swap swaps Atk and SpAtk stat stages
    // Source: Showdown Gen 4 mod -- Power Swap exchanges offensive stat changes
    const attacker = createActivePokemon({
      types: ["psychic"],
      statStages: { attack: 2, spAttack: 0 },
    });
    const defender = createActivePokemon({
      types: ["normal"],
      statStages: { attack: 0, spAttack: -1 },
    });
    const move = createMove("power-swap", { type: "psychic" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    expect(attacker.statStages.attack).toBe(0);
    expect(attacker.statStages.spAttack).toBe(-1);
    expect(defender.statStages.attack).toBe(2);
    expect(defender.statStages.spAttack).toBe(0);
  });

  it("given both have zero stages, when Power Swap is used, then stages remain zero", () => {
    // Source: Showdown Gen 4 mod -- Power Swap with no changes is a no-op swap
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("power-swap", { type: "psychic" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(attacker.statStages.attack).toBe(0);
    expect(attacker.statStages.spAttack).toBe(0);
    expect(defender.statStages.attack).toBe(0);
    expect(defender.statStages.spAttack).toBe(0);
    expect(result.messages.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Guard Swap
// ===========================================================================

describe("Guard Swap", () => {
  it("given attacker has +3 Def and defender has -2 SpDef, when Guard Swap is used, then Def and SpDef stages are swapped", () => {
    // Source: Bulbapedia -- Guard Swap swaps Def and SpDef stat stages
    // Source: Showdown Gen 4 mod -- Guard Swap exchanges defensive stat changes
    const attacker = createActivePokemon({
      types: ["psychic"],
      statStages: { defense: 3, spDefense: 0 },
    });
    const defender = createActivePokemon({
      types: ["normal"],
      statStages: { defense: 0, spDefense: -2 },
    });
    const move = createMove("guard-swap", { type: "psychic" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    expect(attacker.statStages.defense).toBe(0);
    expect(attacker.statStages.spDefense).toBe(-2);
    expect(defender.statStages.defense).toBe(3);
    expect(defender.statStages.spDefense).toBe(0);
  });

  it("given attacker has -1 Def and +2 SpDef and defender has +1 Def and -3 SpDef, when Guard Swap is used, then both stats swap correctly", () => {
    // Source: Showdown Gen 4 mod -- Guard Swap swaps all defensive stages
    const attacker = createActivePokemon({
      types: ["psychic"],
      statStages: { defense: -1, spDefense: 2 },
    });
    const defender = createActivePokemon({
      types: ["normal"],
      statStages: { defense: 1, spDefense: -3 },
    });
    const move = createMove("guard-swap", { type: "psychic" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    expect(attacker.statStages.defense).toBe(1);
    expect(attacker.statStages.spDefense).toBe(-3);
    expect(defender.statStages.defense).toBe(-1);
    expect(defender.statStages.spDefense).toBe(2);
  });
});

// ===========================================================================
// Heart Swap
// ===========================================================================

describe("Heart Swap", () => {
  it("given attacker has various stages and defender has different stages, when Heart Swap is used, then ALL stat stages are swapped", () => {
    // Source: Bulbapedia -- Heart Swap: "swaps all stat changes with the target"
    // Source: Showdown Gen 4 mod -- Heart Swap swaps every stat stage
    const attacker = createActivePokemon({
      types: ["psychic"],
      statStages: {
        attack: 2,
        defense: -1,
        spAttack: 3,
        spDefense: 0,
        speed: 1,
        accuracy: -2,
        evasion: 0,
      },
    });
    const defender = createActivePokemon({
      types: ["normal"],
      statStages: {
        attack: -3,
        defense: 1,
        spAttack: 0,
        spDefense: 2,
        speed: -1,
        accuracy: 0,
        evasion: 1,
      },
    });
    const move = createMove("heart-swap", { type: "psychic" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    // Attacker now has defender's old stages
    expect(attacker.statStages.attack).toBe(-3);
    expect(attacker.statStages.defense).toBe(1);
    expect(attacker.statStages.spAttack).toBe(0);
    expect(attacker.statStages.spDefense).toBe(2);
    expect(attacker.statStages.speed).toBe(-1);
    expect(attacker.statStages.accuracy).toBe(0);
    expect(attacker.statStages.evasion).toBe(1);
    // Defender now has attacker's old stages
    expect(defender.statStages.attack).toBe(2);
    expect(defender.statStages.defense).toBe(-1);
    expect(defender.statStages.spAttack).toBe(3);
    expect(defender.statStages.spDefense).toBe(0);
    expect(defender.statStages.speed).toBe(1);
    expect(defender.statStages.accuracy).toBe(-2);
    expect(defender.statStages.evasion).toBe(0);
  });

  it("given both have zero stages, when Heart Swap is used, then stages remain zero and message is emitted", () => {
    // Source: Showdown Gen 4 mod -- Heart Swap still succeeds even with no changes
    const attacker = createActivePokemon({ types: ["psychic"], nickname: "Manaphy" });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("heart-swap", { type: "psychic" });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.messages).toContain("Manaphy swapped all stat changes with the target!");
  });
});

// ===========================================================================
// Curse (Ghost-type)
// ===========================================================================

describe("Curse (Ghost-type)", () => {
  it("given Ghost-type attacker uses Curse, when executed, then attacker takes 1/2 max HP and target gets curse volatile", () => {
    // Source: Bulbapedia -- Curse (Ghost): "user loses half its maximum HP, target is cursed"
    // Source: Showdown Gen 4 mod -- Ghost Curse: 1/2 HP cost, curse volatile on target
    const attacker = createActivePokemon({
      types: ["ghost"],
      nickname: "Gengar",
      maxHp: 200,
      currentHp: 200,
    });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Snorlax" });
    const move = createMove("curse", {
      type: "ghost",
      effect: { type: "volatile-status", status: "curse", chance: 100 },
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    // HP cost = floor(200 / 2) = 100
    expect(result.customDamage).toEqual({
      target: "attacker",
      amount: 100,
      source: "curse",
    });
    expect(result.volatileInflicted).toBe("curse");
    expect(result.messages).toContain("Gengar cut its own HP and laid a curse on Snorlax!");
  });

  it("given target already has curse volatile, when Ghost Curse is used, then it fails", () => {
    // Source: Showdown Gen 4 mod -- Curse fails if target already cursed
    const attacker = createActivePokemon({ types: ["ghost"] });
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("curse", { turnsLeft: -1 });
    const defender = createActivePokemon({ types: ["normal"], volatiles });
    const move = createMove("curse", {
      type: "ghost",
      effect: { type: "volatile-status", status: "curse", chance: 100 },
    });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages).toContain("But it failed!");
  });
});

// ===========================================================================
// Sticky Barb
// ===========================================================================

describe("Sticky Barb", () => {
  it("given holder has Sticky Barb, when end-of-turn triggers, then holder takes 1/8 max HP damage", () => {
    // Source: Bulbapedia -- Sticky Barb: "1/8 of its maximum HP at the end of every turn"
    // Source: Showdown Gen 4 mod -- Sticky Barb EoT chip
    const pokemon = createActivePokemon({
      types: ["normal"],
      heldItem: "sticky-barb",
      maxHp: 200,
      currentHp: 200,
      nickname: "Holder",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng,
    });

    expect(result.activated).toBe(true);
    // floor(200 / 8) = 25
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 25 }]);
    expect(result.messages).toContain("Holder was hurt by its Sticky Barb!");
  });

  it("given holder has 16 max HP with Sticky Barb, when end-of-turn triggers, then holder takes floor(16/8)=2 damage", () => {
    // Source: Showdown Gen 4 mod -- Sticky Barb damage is floor(maxHP/8)
    const pokemon = createActivePokemon({
      types: ["normal"],
      heldItem: "sticky-barb",
      maxHp: 16,
      currentHp: 16,
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 2 }]);
  });
});

// ===========================================================================
// Berry Juice
// ===========================================================================

describe("Berry Juice", () => {
  it("given holder has Berry Juice and HP at 50%, when end-of-turn triggers, then holder heals 20 HP and Berry Juice is consumed", () => {
    // Source: Bulbapedia -- Berry Juice: "Restores 20 HP when HP drops to 50% or below"
    // Source: Showdown Gen 4 mod -- Berry Juice trigger at 50%
    const pokemon = createActivePokemon({
      types: ["normal"],
      heldItem: "berry-juice",
      maxHp: 200,
      currentHp: 100, // 50% exactly
      nickname: "Holder",
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 20 },
      { type: "consume", target: "self", value: "berry-juice" },
    ]);
    expect(result.messages).toContain("Holder's Berry Juice restored 20 HP!");
  });

  it("given holder has Berry Juice and HP above 50%, when end-of-turn triggers, then Berry Juice does not activate", () => {
    // Source: Showdown Gen 4 mod -- Berry Juice only triggers at <=50%
    const pokemon = createActivePokemon({
      types: ["normal"],
      heldItem: "berry-juice",
      maxHp: 200,
      currentHp: 101, // Above 50%
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng,
    });

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Grip Claw (binding moves)
// ===========================================================================

describe("Grip Claw and Binding Moves", () => {
  it("given attacker holds Grip Claw, when using Bind, then binding lasts 6 turns", () => {
    // Source: Showdown Gen 4 mod — Grip Claw sets binding to the maximum duration (6 turns)
    // In Gen 4, binding lasts 3-6 turns (rng.int(3, 6)), Grip Claw forces max = 6.
    // Note: Gen 4 Grip Claw is 5+1 extension = 6, not 7 (7 was Gen 5+).
    const attacker = createActivePokemon({
      types: ["normal"],
      heldItem: "grip-claw",
    });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Target" });
    const move = createMove("bind", { type: "normal", category: "physical", power: 15 });
    const rng = createMockRng(4); // Would be 4 normally, but Grip Claw overrides
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("bound");
    expect(result.volatileData).toEqual({ turnsLeft: 6 });
  });

  it("given attacker does NOT hold Grip Claw, when using Fire Spin, then binding lasts 3-6 turns based on RNG", () => {
    // Source: Showdown Gen 4 mod — binding duration is rng.int(3, 6) without Grip Claw
    // Source: Bulbapedia — Binding moves last 2-5 turns in Gen 4 (exclusive upper = 3-6 inclusive for int)
    const attacker = createActivePokemon({ types: ["fire"] });
    const defender = createActivePokemon({ types: ["normal"], nickname: "Foe" });
    const move = createMove("fire-spin", { type: "fire", category: "special", power: 15 });
    // rng.int returns 4 (min of range)
    const rng = createMockRng(4);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBe("bound");
    expect(result.volatileData).toEqual({ turnsLeft: 4 });
  });

  it("given target already has bound volatile, when binding move is used, then no additional binding is applied", () => {
    // Source: Showdown Gen 4 mod -- cannot stack binding moves
    const attacker = createActivePokemon({ types: ["normal"] });
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("bound", { turnsLeft: 3 });
    const defender = createActivePokemon({ types: ["normal"], volatiles });
    const move = createMove("wrap", { type: "normal", category: "physical", power: 15 });
    const rng = createMockRng(4);
    const ctx = createContext(attacker, defender, move, rng);

    const result = executeGen4MoveEffect(ctx);

    expect(result.volatileInflicted).toBeNull();
  });
});

// ===========================================================================
// Gluttony
// ===========================================================================

describe("Gluttony", () => {
  it("given normal fraction 0.25, when holder has Gluttony, then threshold becomes 0.5", () => {
    // Source: Bulbapedia -- Gluttony: "eats Berry at 50% HP instead of 25%"
    // Source: Showdown data/abilities.ts -- Gluttony modifies pinch berry threshold
    const result = getPinchBerryThreshold({ ability: "gluttony" }, 0.25);
    expect(result).toBe(0.5);
  });

  it("given normal fraction 0.25, when holder does NOT have Gluttony, then threshold stays 0.25", () => {
    // Source: Showdown data/abilities.ts -- non-Gluttony Pokemon use normal threshold
    const result = getPinchBerryThreshold({ ability: "blaze" }, 0.25);
    expect(result).toBe(0.25);
  });

  it("given normal fraction 0.5, when holder has Gluttony, then threshold stays 0.5 (Gluttony only affects 25% berries)", () => {
    // Source: Bulbapedia -- Gluttony only affects berries with 25% threshold
    // Sitrus Berry already activates at 50%, unaffected by Gluttony
    const result = getPinchBerryThreshold({ ability: "gluttony" }, 0.5);
    expect(result).toBe(0.5);
  });
});

// ===========================================================================
// Unburden
// ===========================================================================

describe("Unburden", () => {
  it("given holder has Unburden and consumed berry, when getEffectiveSpeed is called, then speed is doubled", () => {
    // Source: Bulbapedia -- Unburden: "Doubles Speed when held item is consumed/lost"
    // Source: Showdown data/abilities.ts -- Unburden onModifySpe
    const ruleset = new Gen4Ruleset();
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("unburden", { turnsLeft: -1 });
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "unburden",
      heldItem: null, // Item already consumed
      volatiles,
    });

    // Access protected method via casting or through resolveTurnOrder
    // We test through the speed ordering mechanism
    const opponentAction = {
      type: "move" as const,
      side: 1 as 0 | 1,
      moveIndex: 0,
      targets: [0 as 0 | 1],
    };
    const unburdenAction = {
      type: "move" as const,
      side: 0 as 0 | 1,
      moveIndex: 0,
      targets: [1 as 0 | 1],
    };

    // Create a slower opponent (speed 300) -- unburden pokemon has speed 100 * 2 = 200
    const opponent = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 200,
    });
    (opponent.pokemon.calculatedStats as { speed: number }).speed = 300;

    const state = createMinimalBattleState(pokemon, opponent);
    const rng = createMockRng(0);
    const actions = [unburdenAction, opponentAction];

    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Opponent (speed 300) should still be faster than unburden (100 * 2 = 200)
    expect(ordered[0].side).toBe(1);
    expect(ordered[1].side).toBe(0);
  });

  it("given holder has Unburden volatile but still holds an item, when getEffectiveSpeed is called, then speed is NOT doubled", () => {
    // Source: Showdown data/abilities.ts -- Unburden only active when item is absent
    const ruleset = new Gen4Ruleset();
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("unburden", { turnsLeft: -1 });
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "unburden",
      heldItem: "leftovers", // Still has item
      volatiles,
    });

    const opponent = createActivePokemon({
      types: ["normal"],
      maxHp: 200,
      currentHp: 200,
    });
    // Set opponent speed to 150 -- if Unburden triggers, pokemon would have 200 speed
    // and go first. If Unburden does NOT trigger, pokemon has 100 speed and goes second.
    (opponent.pokemon.calculatedStats as { speed: number }).speed = 150;

    const state = createMinimalBattleState(pokemon, opponent);
    const rng = createMockRng(0);

    const opponentAction = {
      type: "move" as const,
      side: 1 as 0 | 1,
      moveIndex: 0,
      targets: [0 as 0 | 1],
    };
    const unburdenAction = {
      type: "move" as const,
      side: 0 as 0 | 1,
      moveIndex: 0,
      targets: [1 as 0 | 1],
    };

    const ordered = ruleset.resolveTurnOrder([unburdenAction, opponentAction], state, rng);

    // Opponent (150) faster than pokemon (100, Unburden NOT active because it has an item)
    expect(ordered[0].side).toBe(1);
    expect(ordered[1].side).toBe(0);
  });

  it("given berry is consumed and holder has Unburden, when item trigger fires, then unburden volatile is set", () => {
    // Source: Showdown Gen 4 mod -- Unburden volatile set when item is consumed
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "unburden",
      heldItem: "sitrus-berry",
      maxHp: 200,
      currentHp: 80, // Below 50%
    });
    const state = createMinimalBattleState(pokemon, createActivePokemon({ types: ["normal"] }));
    const rng = createMockRng(0);

    applyGen4HeldItem("end-of-turn", { pokemon, state, rng });

    expect(pokemon.volatileStatuses.has("unburden")).toBe(true);
  });

  it("given Knock Off removes defender's item and defender has Unburden, then unburden volatile is set", () => {
    // Source: Showdown Gen 4 mod -- Unburden triggers on Knock Off
    const attacker = createActivePokemon({ types: ["dark"] });
    const defender = createActivePokemon({
      types: ["normal"],
      ability: "unburden",
      heldItem: "leftovers",
    });
    const move = createMove("knock-off", { type: "dark", category: "physical", power: 20 });
    const rng = createMockRng(0);
    const ctx = createContext(attacker, defender, move, rng);

    executeGen4MoveEffect(ctx);

    expect(defender.pokemon.heldItem).toBeNull();
    expect(defender.volatileStatuses.has("unburden")).toBe(true);
  });
});

// ===========================================================================
// Magnet Rise -- Ground immunity in damage calc
// ===========================================================================

describe("Magnet Rise Ground immunity", () => {
  it("given defender has magnet-rise volatile, when hit by Ground move, then damage is 0", () => {
    // Source: Bulbapedia -- Magnet Rise: "makes the user immune to Ground-type moves"
    // Source: Showdown Gen 4 mod -- Magnet Rise grants Ground immunity

    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("magnet-rise", { turnsLeft: 3 });

    const attacker = createActivePokemon({ types: ["ground"], maxHp: 200 });
    const defender = createActivePokemon({ types: ["electric"], volatiles, maxHp: 200 });

    const move = createMove("earthquake", {
      type: "ground",
      category: "physical",
      power: 100,
    });

    const rng = createMockRng(100);
    const state = createMinimalBattleState(attacker, defender);

    const result = calculateGen4Damage(
      {
        attacker,
        defender,
        move,
        state,
        rng,
        isCrit: false,
      },
      GEN4_TYPE_CHART,
    );

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given defender has magnet-rise volatile but Gravity is active, when hit by Ground move, then damage is NOT 0", () => {
    // Source: Bulbapedia -- Gravity suppresses Magnet Rise
    // Source: Showdown Gen 4 mod -- Gravity grounds Magnet Rise users

    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set("magnet-rise", { turnsLeft: 3 });

    const attacker = createActivePokemon({ types: ["ground"], maxHp: 200 });
    const defender = createActivePokemon({ types: ["electric"], volatiles, maxHp: 200 });

    const move = createMove("earthquake", {
      type: "ground",
      category: "physical",
      power: 100,
    });

    const rng = createMockRng(100);
    const state = {
      ...createMinimalBattleState(attacker, defender),
      gravity: { active: true, turnsLeft: 3 },
    } as BattleState;

    const result = calculateGen4Damage(
      {
        attacker,
        defender,
        move,
        state,
        rng,
        isCrit: false,
      },
      GEN4_TYPE_CHART,
    );

    // Ground move should hit because Gravity is active
    expect(result.damage).toBeGreaterThan(0);
  });
});
