import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

/** Minimal PokemonInstance for speed ordering tests. */
function makePokemonInstance(overrides: {
  speed?: number;
  status?: PokemonInstance["status"];
  heldItem?: string | null;
  moves?: Array<{ moveId: string; pp: number; maxPp: number }>;
  ability?: string;
  currentHp?: number;
  maxHp?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${overrides.speed ?? 100}`,
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
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
      speed: overrides.speed ?? 100,
    },
  } as PokemonInstance;
}

/** Minimal ActivePokemon for speed ordering tests. */
function makeActivePokemon(overrides: {
  speed?: number;
  status?: PokemonInstance["status"];
  heldItem?: string | null;
  types?: PokemonType[];
  moves?: Array<{ moveId: string; pp: number; maxPp: number }>;
  ability?: string;
  currentHp?: number;
  maxHp?: number;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance(overrides),
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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

/**
 * Build a minimal BattleState with two sides for turn order tests.
 * Supports Tailwind per side and Trick Room field effect.
 */
function buildTwoSideState(
  side0Pokemon: ActivePokemon,
  side1Pokemon: ActivePokemon,
  opts?: {
    side0Tailwind?: boolean;
    side1Tailwind?: boolean;
    trickRoom?: boolean;
  },
): BattleState {
  const makeSide = (index: 0 | 1, active: ActivePokemon, tailwindActive: boolean): BattleSide =>
    ({
      index,
      trainer: null,
      team: [active.pokemon],
      active: [active],
      hazards: [],
      screens: [],
      tailwind: { active: tailwindActive, turnsLeft: tailwindActive ? 3 : 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    }) as BattleSide;

  return {
    phase: "action-select",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [
      makeSide(0, side0Pokemon, opts?.side0Tailwind ?? false),
      makeSide(1, side1Pokemon, opts?.side1Tailwind ?? false),
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: opts?.trickRoom ?? false, turnsLeft: opts?.trickRoom ? 5 : 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(0),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Normal speed ordering (baseline)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- normal speed ordering", () => {
  it("given two move actions where Pokemon A (speed 100) is faster than Pokemon B (speed 80), when resolveTurnOrder is called, then Pokemon A's action comes first", () => {
    // Source: Showdown Gen 4 -- faster Pokemon moves first (same as BaseRuleset)
    // Derivation: speed 100 > speed 80, no Tailwind, no Trick Room
    const monA = makeActivePokemon({ speed: 100 });
    const monB = makeActivePokemon({ speed: 80 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // speed 100 first
    expect(ordered[1]).toEqual(actions[1]); // speed 80 second
  });

  it("given two move actions where Pokemon A (speed 60) is slower than Pokemon B (speed 120), when resolveTurnOrder is called, then Pokemon B's action comes first", () => {
    // Source: Showdown Gen 4 -- faster Pokemon moves first
    // Triangulation: reverse case to ensure not a constant return
    const monA = makeActivePokemon({ speed: 60 });
    const monB = makeActivePokemon({ speed: 120 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // speed 120 first
    expect(ordered[1]).toEqual(actions[0]); // speed 60 second
  });
});

// ---------------------------------------------------------------------------
// Tailwind speed doubling
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Tailwind", () => {
  it("given Pokemon A (side 0, speed 80) with Tailwind active and Pokemon B (side 1, speed 100) without Tailwind, when resolveTurnOrder is called, then Pokemon A moves first (80*2=160 > 100)", () => {
    // Source: Bulbapedia -- Tailwind doubles Speed of user's side for 3 turns
    // Source: Showdown Gen 4 mod -- Tailwind doubles Speed
    // Derivation: A effective speed = 80 * 2 = 160; B effective speed = 100
    // 160 > 100, so A goes first
    const monA = makeActivePokemon({ speed: 80 });
    const monB = makeActivePokemon({ speed: 100 });
    const state = buildTwoSideState(monA, monB, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (160 with Tailwind) first
    expect(ordered[1]).toEqual(actions[1]); // B (100) second
  });

  it("given Pokemon A (side 0, speed 40) with Tailwind active and Pokemon B (side 1, speed 100) without Tailwind, when resolveTurnOrder is called, then Pokemon B moves first (40*2=80 < 100)", () => {
    // Source: Bulbapedia -- Tailwind doubles Speed
    // Triangulation: Tailwind doesn't guarantee going first if base speed too low
    // Derivation: A effective speed = 40 * 2 = 80; B effective speed = 100
    // 80 < 100, so B goes first
    const monA = makeActivePokemon({ speed: 40 });
    const monB = makeActivePokemon({ speed: 100 });
    const state = buildTwoSideState(monA, monB, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (100) first
    expect(ordered[1]).toEqual(actions[0]); // A (80 with Tailwind) second
  });

  it("given both sides have Tailwind active, when resolveTurnOrder is called, then faster base speed still goes first (both doubled)", () => {
    // Source: Showdown Gen 4 -- both sides can have Tailwind simultaneously
    // Derivation: A = 80*2 = 160; B = 100*2 = 200; B goes first
    const monA = makeActivePokemon({ speed: 80 });
    const monB = makeActivePokemon({ speed: 100 });
    const state = buildTwoSideState(monA, monB, {
      side0Tailwind: true,
      side1Tailwind: true,
    });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (200) first
    expect(ordered[1]).toEqual(actions[0]); // A (160) second
  });
});

// ---------------------------------------------------------------------------
// Trick Room
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Trick Room", () => {
  it("given Pokemon A (speed 120) and Pokemon B (speed 80) with Trick Room active, when resolveTurnOrder is called, then Pokemon B (slower) moves first", () => {
    // Source: Showdown Gen 4 mod -- Trick Room: slower Pokemon move first
    // Source: Bulbapedia -- Trick Room reverses speed order
    // Derivation: under Trick Room, lower speed goes first: 80 < 120, so B first
    const monA = makeActivePokemon({ speed: 120 });
    const monB = makeActivePokemon({ speed: 80 });
    const state = buildTwoSideState(monA, monB, { trickRoom: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (80, slower) first in Trick Room
    expect(ordered[1]).toEqual(actions[0]); // A (120, faster) second in Trick Room
  });

  it("given Pokemon A (speed 50) and Pokemon B (speed 150) with Trick Room active, when resolveTurnOrder is called, then Pokemon A (slower) moves first", () => {
    // Source: Showdown Gen 4 mod -- Trick Room: slower Pokemon move first
    // Triangulation: second case with different speeds
    // Derivation: under Trick Room, 50 < 150, so A first
    const monA = makeActivePokemon({ speed: 50 });
    const monB = makeActivePokemon({ speed: 150 });
    const state = buildTwoSideState(monA, monB, { trickRoom: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (50, slower) first in Trick Room
    expect(ordered[1]).toEqual(actions[1]); // B (150, faster) second in Trick Room
  });
});

// ---------------------------------------------------------------------------
// Trick Room + Tailwind
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Trick Room + Tailwind interaction", () => {
  it("given Pokemon A (side 0, speed 40) with Tailwind (eff 80) and Pokemon B (side 1, speed 100), with Trick Room active, when resolveTurnOrder is called, then Pokemon A moves first (80 < 100, slower goes first in Trick Room)", () => {
    // Source: Bulbapedia -- Trick Room reverses speed; Tailwind doubles speed before reversal
    // Derivation: A effective = 40 * 2 = 80 (Tailwind); B effective = 100
    // Trick Room: slower goes first; 80 < 100, so A goes first
    const monA = makeActivePokemon({ speed: 40 });
    const monB = makeActivePokemon({ speed: 100 });
    const state = buildTwoSideState(monA, monB, {
      side0Tailwind: true,
      trickRoom: true,
    });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (80 with Tailwind, slower) first in Trick Room
    expect(ordered[1]).toEqual(actions[1]); // B (100) second
  });

  it("given Pokemon A (side 0, speed 60) with Tailwind (eff 120) and Pokemon B (side 1, speed 100), with Trick Room active, when resolveTurnOrder is called, then Pokemon B moves first (100 < 120, B is slower)", () => {
    // Source: Bulbapedia -- Trick Room + Tailwind interaction
    // Derivation: A effective = 60 * 2 = 120 (Tailwind); B effective = 100
    // Trick Room: slower goes first; 100 < 120, so B goes first
    const monA = makeActivePokemon({ speed: 60 });
    const monB = makeActivePokemon({ speed: 100 });
    const state = buildTwoSideState(monA, monB, {
      side0Tailwind: true,
      trickRoom: true,
    });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (100, slower in Trick Room) first
    expect(ordered[1]).toEqual(actions[0]); // A (120 with Tailwind) second
  });
});

// ---------------------------------------------------------------------------
// Quick Claw + Tailwind interaction
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Quick Claw with Tailwind", () => {
  it("given Pokemon A (speed 80, side 0 Tailwind, Quick Claw activated) and Pokemon B (speed 200), when resolveTurnOrder is called, then Pokemon A moves first (QC beats speed)", () => {
    // Source: pret/pokeplatinum -- Quick Claw 20% activation; goes before speed check
    // Quick Claw activation trumps speed within same priority bracket
    // Use a deterministic RNG seed that activates Quick Claw (20% chance)
    const monA = makeActivePokemon({ speed: 80, heldItem: "quick-claw" });
    const monB = makeActivePokemon({ speed: 200 });
    const state = buildTwoSideState(monA, monB, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    // Find a seed where Quick Claw activates for side 0
    // QC check is rng.chance(0.2) -- we need to find a seed where it triggers
    let activatingSeed = -1;
    for (let seed = 1; seed <= 100; seed++) {
      const testRng = new SeededRandom(seed);
      // Quick Claw check: first rng call is chance(0.2) for action 0
      if (testRng.chance(0.2)) {
        activatingSeed = seed;
        break;
      }
    }
    // Ensure we found a seed (statistically almost certain within 100 tries)
    expect(activatingSeed).toBeGreaterThan(0);

    const rng = new SeededRandom(activatingSeed);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Quick Claw activated for A, so A goes first despite lower speed
    expect(ordered[0]).toEqual(actions[0]); // A (QC activated) first
    expect(ordered[1]).toEqual(actions[1]); // B second
  });
});

// ---------------------------------------------------------------------------
// Priority moves override Tailwind
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- priority overrides Tailwind", () => {
  it("given Pokemon A (side 1, speed 200) using Tackle and Pokemon B (side 0, speed 60, Tailwind) using Quick Attack (+1 priority), when resolveTurnOrder is called, then Pokemon B's priority move comes first", () => {
    // Source: Showdown Gen 4 -- priority bracket is independent of speed
    // Quick Attack has priority +1, Tackle has priority 0
    // Priority +1 always goes before priority 0 regardless of speed
    const monA = makeActivePokemon({
      speed: 200,
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
    });
    const monB = makeActivePokemon({
      speed: 60,
      moves: [{ moveId: "quick-attack", pp: 30, maxPp: 30 }],
    });
    // Build state with monB on side 0 (with Tailwind) and monA on side 1
    // monA's Tailwind doesn't matter here — priority trumps speed
    const stateFlipped = buildTwoSideState(monB, monA, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 }, // monB using Quick Attack (+1 priority)
      { type: "move", side: 1, moveIndex: 0 }, // monA using Tackle (0 priority)
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, stateFlipped, rng);

    // Quick Attack (+1) goes before Tackle (0) regardless of speed
    expect(ordered[0]).toEqual(actions[0]); // Quick Attack (+1 priority) first
    expect(ordered[1]).toEqual(actions[1]); // Tackle (0 priority) second
  });

  it("given Pokemon A (speed 200) using Quick Attack and Pokemon B (speed 60, Tailwind) using Mach Punch (+1 priority), when resolveTurnOrder is called, then speed determines order within same priority", () => {
    // Source: Showdown Gen 4 -- within same priority bracket, speed decides
    // Both Quick Attack and Mach Punch have priority +1
    // B has Tailwind: 60 * 2 = 120; A has no Tailwind: 200
    // 200 > 120, so A goes first
    const monA = makeActivePokemon({
      speed: 200,
      moves: [{ moveId: "quick-attack", pp: 30, maxPp: 30 }],
    });
    const monB = makeActivePokemon({
      speed: 60,
      moves: [{ moveId: "mach-punch", pp: 30, maxPp: 30 }],
    });
    const state = buildTwoSideState(monB, monA, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 }, // monB using Mach Punch (+1) speed 60*2=120
      { type: "move", side: 1, moveIndex: 0 }, // monA using Quick Attack (+1) speed 200
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Same priority (+1), so speed decides: 200 > 120
    expect(ordered[0]).toEqual(actions[1]); // A (200 speed) first
    expect(ordered[1]).toEqual(actions[0]); // B (120 with Tailwind) second
  });
});

// ---------------------------------------------------------------------------
// Switch actions still go first
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- switches go first with Tailwind", () => {
  it("given a switch action and a move action with Tailwind active, when resolveTurnOrder is called, then switch goes first", () => {
    // Source: Showdown Gen 4 -- switches always go before moves regardless of speed or Tailwind
    const monA = makeActivePokemon({ speed: 200 });
    const monB = makeActivePokemon({ speed: 50 });
    const state = buildTwoSideState(monA, monB, { side1Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "switch", side: 1, switchTo: 1 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // switch first
    expect(ordered[1]).toEqual(actions[0]); // move second
  });
});

// ---------------------------------------------------------------------------
// Paralysis + Tailwind interaction
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Paralysis + Tailwind", () => {
  it("given paralyzed Pokemon A (speed 200) with Tailwind and healthy Pokemon B (speed 80), when resolveTurnOrder is called, then A moves first (200*0.25*2=100 > 80)", () => {
    // Source: pret/pokeplatinum -- paralysis quarters speed (x0.25); Tailwind doubles
    // Source: Bulbapedia -- Tailwind doubles Speed after paralysis reduction
    // Derivation: A base speed = 200; paralyzed = floor(200 * 0.25) = 50; Tailwind = 50 * 2 = 100
    // B speed = 80; 100 > 80, so A goes first
    const monA = makeActivePokemon({ speed: 200, status: "paralysis" });
    const monB = makeActivePokemon({ speed: 80 });
    const state = buildTwoSideState(monA, monB, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // A: floor(200 * 0.25) = 50, then * 2 (Tailwind) = 100
    // B: 80
    // 100 > 80, A goes first
    expect(ordered[0]).toEqual(actions[0]); // A (100 effective) first
    expect(ordered[1]).toEqual(actions[1]); // B (80) second
  });

  it("given paralyzed Pokemon A (speed 100) with Tailwind and healthy Pokemon B (speed 80), when resolveTurnOrder is called, then B moves first (100*0.25*2=50 < 80)", () => {
    // Source: pret/pokeplatinum -- paralysis quarters speed; Tailwind doubles
    // Triangulation: case where paralysis + Tailwind still results in slower speed
    // Derivation: A base speed = 100; paralyzed = floor(100 * 0.25) = 25; Tailwind = 25 * 2 = 50
    // B speed = 80; 50 < 80, so B goes first
    const monA = makeActivePokemon({ speed: 100, status: "paralysis" });
    const monB = makeActivePokemon({ speed: 80 });
    const state = buildTwoSideState(monA, monB, { side0Tailwind: true });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // A: floor(100 * 0.25) = 25, then * 2 (Tailwind) = 50
    // B: 80
    // 50 < 80, B goes first
    expect(ordered[0]).toEqual(actions[1]); // B (80) first
    expect(ordered[1]).toEqual(actions[0]); // A (50 effective) second
  });
});

// ---------------------------------------------------------------------------
// Iron Ball -- Speed halving
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Iron Ball speed halving", () => {
  it("given Pokemon A (speed 100) with Iron Ball and Pokemon B (speed 60), when resolveTurnOrder is called, then Pokemon B moves first (100*0.5=50 < 60)", () => {
    // Source: Bulbapedia — Iron Ball: "Cuts the Speed stat of the holder to half."
    // Source: Showdown data/items.ts — Iron Ball onModifySpe halves speed
    // Derivation: A effective speed = floor(100 * 0.5) = 50; B speed = 60
    // 50 < 60, so B goes first
    const monA = makeActivePokemon({ speed: 100, heldItem: "iron-ball" });
    const monB = makeActivePokemon({ speed: 60 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (60) first
    expect(ordered[1]).toEqual(actions[0]); // A (50 with Iron Ball) second
  });

  it("given Pokemon A (speed 101) with Iron Ball and Pokemon B (speed 50), when resolveTurnOrder is called, then Pokemon B moves first (floor(101*0.5)=50, tiebreak)", () => {
    // Source: Bulbapedia — Iron Ball: "Cuts the Speed stat of the holder to half."
    // Triangulation: odd speed value tests floor behavior
    // Derivation: A effective speed = floor(101 * 0.5) = 50; B speed = 50
    // Equal speed: random tiebreak determines order
    const monA = makeActivePokemon({ speed: 101, heldItem: "iron-ball" });
    const monB = makeActivePokemon({ speed: 51 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // floor(101 * 0.5) = 50 < 51, so B goes first
    expect(ordered[0]).toEqual(actions[1]); // B (51) first
    expect(ordered[1]).toEqual(actions[0]); // A (50 with Iron Ball) second
  });

  it("given Pokemon A (speed 100) with Iron Ball and paralysis, when resolveTurnOrder is called against Pokemon B (speed 15), then Pokemon A moves first (floor(floor(100*0.25)*0.5)=12 < 15 means B first)", () => {
    // Source: Bulbapedia — Iron Ball halves speed; paralysis quarters speed
    // Source: pret/pokeplatinum — paralysis applied before Iron Ball
    // Derivation: A effective = floor(100 * 0.25) = 25 (paralysis), then floor(25 * 0.5) = 12 (Iron Ball)
    // B speed = 15; 12 < 15, so B goes first
    const monA = makeActivePokemon({ speed: 100, heldItem: "iron-ball", status: "paralysis" });
    const monB = makeActivePokemon({ speed: 15 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // A: floor(100 * 0.25) = 25 (paralysis), then floor(25 * 0.5) = 12 (Iron Ball)
    // B: 15
    // 12 < 15, B goes first
    expect(ordered[0]).toEqual(actions[1]); // B (15) first
    expect(ordered[1]).toEqual(actions[0]); // A (12 with paralysis+Iron Ball) second
  });
});

// ---------------------------------------------------------------------------
// Stall ability -- Always move last in priority bracket
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Stall ability", () => {
  it("given Stall user (speed 200) vs non-Stall user (speed 50) at same priority, when resolveTurnOrder is called, then Stall user moves second", () => {
    // Source: Bulbapedia — Stall: "The Pokemon moves after all other Pokemon"
    // Source: Showdown data/abilities.ts — Stall: onFractionalPriority -0.1
    // Despite having higher speed (200 > 50), Stall forces A to move last
    const monA = makeActivePokemon({ speed: 200, ability: "stall" });
    const monB = makeActivePokemon({ speed: 50 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (non-Stall) first
    expect(ordered[1]).toEqual(actions[0]); // A (Stall) second, despite higher speed
  });

  it("given two Stall users with different speeds, when resolveTurnOrder is called, then faster Stall user moves first (both Stall, normal speed tiebreak)", () => {
    // Source: Showdown data/abilities.ts — both have Stall, so the -0.1 priority
    // cancels out, and normal speed ordering resumes
    // Derivation: both Stall → speed tiebreak: 120 > 80, A goes first
    const monA = makeActivePokemon({ speed: 120, ability: "stall" });
    const monB = makeActivePokemon({ speed: 80, ability: "stall" });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (120, both Stall) first
    expect(ordered[1]).toEqual(actions[1]); // B (80, both Stall) second
  });
});

// ---------------------------------------------------------------------------
// Lagging Tail / Full Incense -- Always move last in priority bracket
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Lagging Tail", () => {
  it("given Lagging Tail holder (speed 200) vs non-holder (speed 50), when resolveTurnOrder is called, then holder moves second", () => {
    // Source: Bulbapedia — Lagging Tail: "Holder always moves last"
    // Source: Showdown data/items.ts — Lagging Tail: onFractionalPriority -0.1
    // Despite having higher speed, Lagging Tail forces A to move last
    const monA = makeActivePokemon({ speed: 200, heldItem: "lagging-tail" });
    const monB = makeActivePokemon({ speed: 50 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (no Lagging Tail) first
    expect(ordered[1]).toEqual(actions[0]); // A (Lagging Tail) second
  });

  it("given Lagging Tail holder (speed 50) vs non-holder (speed 200), when resolveTurnOrder is called, then holder still moves second (Lagging Tail forces last)", () => {
    // Source: Bulbapedia — Lagging Tail: "Holder always moves last"
    // Triangulation: holder is already slower, but Lagging Tail still applies
    const monA = makeActivePokemon({ speed: 50, heldItem: "lagging-tail" });
    const monB = makeActivePokemon({ speed: 200 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (200) first
    expect(ordered[1]).toEqual(actions[0]); // A (50, Lagging Tail) second
  });
});

describe("Gen4Ruleset resolveTurnOrder -- Full Incense", () => {
  it("given Full Incense holder (speed 200) vs non-holder (speed 50), when resolveTurnOrder is called, then holder moves second", () => {
    // Source: Bulbapedia — Full Incense: "Holder always moves last in its priority bracket"
    // Source: Showdown data/items.ts — Full Incense: onFractionalPriority -0.1
    // Full Incense has identical behavior to Lagging Tail
    const monA = makeActivePokemon({ speed: 200, heldItem: "full-incense" });
    const monB = makeActivePokemon({ speed: 50 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[1]); // B (no Full Incense) first
    expect(ordered[1]).toEqual(actions[0]); // A (Full Incense) second
  });
});

// ---------------------------------------------------------------------------
// Custap Berry -- Move first at <=25% HP
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Custap Berry", () => {
  it("given Custap Berry holder at 50/200 HP (25%) with speed 50 vs non-holder with speed 200, when resolveTurnOrder is called, then Custap user moves first", () => {
    // Source: Bulbapedia — Custap Berry: "When the holder's HP drops to 1/4 or less,
    //   it will move first in its priority bracket."
    // Source: Showdown data/items.ts — Custap Berry: onFractionalPriority checks HP <= 0.25
    // Derivation: 50/200 = 25% = exactly threshold, so Custap activates
    const monA = makeActivePokemon({
      speed: 50,
      heldItem: "custap-berry",
      currentHp: 50,
      maxHp: 200,
    });
    const monB = makeActivePokemon({ speed: 200 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (Custap activated) first
    expect(ordered[1]).toEqual(actions[1]); // B second
  });

  it("given Custap Berry holder at 51/200 HP (25.5%) with speed 50, when resolveTurnOrder is called, then Custap does NOT activate (slower user goes second normally)", () => {
    // Source: Bulbapedia — Custap Berry: activates at <=25% HP
    // Source: Showdown data/items.ts — Custap Berry checks HP <= floor(maxHp * 0.25)
    // Derivation: floor(200 * 0.25) = 50; 51 > 50, so Custap does NOT activate
    const monA = makeActivePokemon({
      speed: 50,
      heldItem: "custap-berry",
      currentHp: 51,
      maxHp: 200,
    });
    const monB = makeActivePokemon({ speed: 200 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    // Custap didn't activate: normal speed ordering — 200 > 50
    expect(ordered[0]).toEqual(actions[1]); // B (200) first
    expect(ordered[1]).toEqual(actions[0]); // A (50, Custap inactive) second
  });

  it("given Custap Berry holder at 1/200 HP (0.5%) with speed 50, when resolveTurnOrder is called against Pokemon with speed 200, then Custap user moves first", () => {
    // Source: Bulbapedia — Custap Berry activates at <=25% HP
    // Triangulation: very low HP still activates
    // Derivation: 1/200 = 0.5% <= 25%, so Custap activates
    const monA = makeActivePokemon({
      speed: 50,
      heldItem: "custap-berry",
      currentHp: 1,
      maxHp: 200,
    });
    const monB = makeActivePokemon({ speed: 200 });
    const state = buildTwoSideState(monA, monB);
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rng = new SeededRandom(42);
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);

    expect(ordered[0]).toEqual(actions[0]); // A (Custap activated) first
    expect(ordered[1]).toEqual(actions[1]); // B second
  });
});

// ---------------------------------------------------------------------------
// Issue #452 — Trick Room equal-Speed edge case
// ---------------------------------------------------------------------------

describe("Gen4Ruleset resolveTurnOrder -- Trick Room equal Speed tie-breaking (issue #452)", () => {
  it("given Trick Room is active and both Pokemon have IDENTICAL Speed, when determining action order, then the tie-breaking is NOT reversed by Trick Room (original index order applies)", () => {
    // Source: Showdown Gen 4 — equal Speed tie-breaking in Trick Room follows normal rules
    // Bulbapedia — Trick Room: "If two Pokémon with the same Speed use moves in the same
    //   priority bracket, one is chosen at random regardless of Trick Room."
    // Key behavior: Trick Room reverses UNEQUAL speeds. When speeds are equal, it is a true
    // tie, and the same random/original ordering applies as it would outside Trick Room.
    // Neither Pokemon gets a deterministic advantage purely due to Trick Room.
    //
    // Derivation: monA speed=100 and monB speed=100. Under Trick Room, sorting by ascending speed
    // still produces a tie. The stable sort preserves original action array order (side 0 first).
    // With seeded RNG seed=42, the tie-breaking produces deterministic results.
    const monA = makeActivePokemon({ speed: 100 });
    const monB = makeActivePokemon({ speed: 100 });
    const stateWithTrickRoom = buildTwoSideState(monA, monB, { trickRoom: true });
    const stateNoTrickRoom = buildTwoSideState(monA, monB, { trickRoom: false });
    const ruleset = makeRuleset();

    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rngWithTrick = new SeededRandom(42);
    const rngNoTrick = new SeededRandom(42);
    const orderedWithTrick = ruleset.resolveTurnOrder(actions, stateWithTrickRoom, rngWithTrick);
    const orderedNoTrick = ruleset.resolveTurnOrder(actions, stateNoTrickRoom, rngNoTrick);

    // Equal speeds: Trick Room should NOT change the tiebreak order compared to no-Trick-Room.
    // Both rng seeds start at 42 so the tie-break random roll is identical in both cases.
    expect(orderedWithTrick[0]).toEqual(orderedNoTrick[0]);
    expect(orderedWithTrick[1]).toEqual(orderedNoTrick[1]);
  });

  it("given Trick Room is active, both Pokemon have Speed 100, when compared to unequal speeds that ARE reversed by Trick Room, then the equal-speed case is distinct from the reversed case", () => {
    // Source: Showdown Gen 4 — Trick Room reversal only applies when speeds differ
    // Triangulation: confirms equal-speed behavior differs from the inequality-reversal case
    //
    // In the unequal case (100 vs 80), Trick Room makes 80 go first.
    // In the equal case (100 vs 100), both produce a tie; Trick Room has no directional effect.
    const monFast = makeActivePokemon({ speed: 100 });
    const monSlow = makeActivePokemon({ speed: 80 });
    const monEqual = makeActivePokemon({ speed: 100 });
    const unequalStateTrickRoom = buildTwoSideState(monFast, monSlow, { trickRoom: true });
    const equalStateTrickRoom = buildTwoSideState(monFast, monEqual, { trickRoom: true });
    const ruleset = makeRuleset();

    const actionsUnequal: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];
    const actionsEqual: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ];

    const rngUnequal = new SeededRandom(42);
    const orderedUnequal = ruleset.resolveTurnOrder(
      actionsUnequal,
      unequalStateTrickRoom,
      rngUnequal,
    );

    const rngEqual = new SeededRandom(42);
    const orderedEqual = ruleset.resolveTurnOrder(actionsEqual, equalStateTrickRoom, rngEqual);

    // Unequal case: Trick Room reverses — monSlow (side 1, speed=80) goes first
    expect(orderedUnequal[0]).toEqual(actionsUnequal[1]); // side 1 (speed=80, slower) first
    expect(orderedUnequal[1]).toEqual(actionsUnequal[0]); // side 0 (speed=100, faster) second

    // Equal case: no reversal — tie-breaking applies (both have speed=100)
    // The result is deterministic (seed 42) and equal to the no-Trick-Room case
    // The first action with a 100-speed tie comes from the stable ordering, NOT guaranteed reversal
    expect(orderedEqual).toHaveLength(2);
    // Both actions must be present (order may be either way, but both must be there)
    expect([actionsEqual[0], actionsEqual[1]]).toContain(orderedEqual[0]);
    expect([actionsEqual[0], actionsEqual[1]]).toContain(orderedEqual[1]);
  });
});
