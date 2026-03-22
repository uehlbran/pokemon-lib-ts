import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, StatBlock } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen3Ruleset } from "../src";
import { createGen3DataManager } from "../src/data";

/**
 * Gen 3 Turn Order Determinism Tests
 *
 * Validates that resolveTurnOrder produces deterministic results with seeded PRNG
 * and handles Quick Claw activation correctly.
 *
 * Source: pret/pokeemerald src/battle_util.c — turn order resolution
 * Source: GitHub issue #120 — tiebreak keys must be pre-assigned for determinism
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createActivePokemon(opts: {
  speed: number;
  heldItem?: string | null;
  moves?: string[];
}): ActivePokemon {
  const moves = (opts.moves ?? ["tackle"]).map((id) => {
    try {
      const moveData = dataManager.getMove(id);
      return { moveId: id, currentPP: moveData.pp, maxPP: moveData.pp, ppUps: 0 };
    } catch {
      return { moveId: id, currentPP: 10, maxPP: 10, ppUps: 0 };
    }
  });

  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: opts.speed,
  };

  const pokemon = {
    uid: `test-spd-${opts.speed}`,
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves,
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: null,
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
    types: ["normal"],
    ability: "",
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createBattleState(active0: ActivePokemon, active1: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [active0],
        team: [active0.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [active1],
        team: [active1.pokemon],
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

describe("Gen 3 Turn Order Determinism", () => {
  it("given same seed, when resolveTurnOrder called twice with same actions, then same order both times", () => {
    // Source: GitHub issue #120 — tiebreak keys must be pre-assigned for PRNG determinism
    const active0 = createActivePokemon({ speed: 100 });
    const active1 = createActivePokemon({ speed: 100 });
    const state = createBattleState(active0, active1);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const rng1 = new SeededRandom(42);
    const order1 = ruleset.resolveTurnOrder([...actions], state, rng1);

    const rng2 = new SeededRandom(42);
    const order2 = ruleset.resolveTurnOrder([...actions], state, rng2);

    // Both orderings should be identical
    expect(order1.length).toBe(order2.length);
    for (let i = 0; i < order1.length; i++) {
      expect(order1[i]!.side).toBe(order2[i]!.side);
    }
  });

  it("given speed tie, when resolved with same seed, then tiebreak is PRNG-deterministic", () => {
    // Source: pret/pokeemerald — speed ties broken by random coin flip
    const active0 = createActivePokemon({ speed: 100 });
    const active1 = createActivePokemon({ speed: 100 });
    const state = createBattleState(active0, active1);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    // Run 10 times with the same seed — all should produce the same result
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      const rng = new SeededRandom(12345);
      const order = ruleset.resolveTurnOrder([...actions], state, rng);
      results.push(order[0]!.side);
    }

    // All 10 runs should produce the same first-mover
    expect(new Set(results).size).toBe(1);
  });

  it("given different seeds, when resolving same speed tie, then may produce different order", () => {
    // Source: pret/pokeemerald — different RNG seeds produce different tiebreaks
    const active0 = createActivePokemon({ speed: 100 });
    const active1 = createActivePokemon({ speed: 100 });
    const state = createBattleState(active0, active1);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    // Try many different seeds and check that at least some produce different results
    const firstMovers = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      const order = ruleset.resolveTurnOrder([...actions], state, rng);
      firstMovers.add(order[0]!.side);
    }

    // With 100 different seeds for a coin flip, we should see both sides go first
    expect(firstMovers.size).toBe(2);
  });

  it("given faster Pokemon, when resolving turn order, then faster moves first", () => {
    // Source: pret/pokeemerald — higher speed acts first (no Trick Room)
    const fast = createActivePokemon({ speed: 200 });
    const slow = createActivePokemon({ speed: 50 });
    const state = createBattleState(fast, slow);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const rng = new SeededRandom(42);
    const order = ruleset.resolveTurnOrder([...actions], state, rng);

    // Side 0 (speed 200) should always go first
    expect(order[0]!.side).toBe(0);
    expect(order[1]!.side).toBe(1);
  });

  it("given unknown moveId for one side, when resolving turn order, then defaults priority to 0 and still resolves", () => {
    // Covers Gen3Ruleset.ts lines 795-796 — catch block for getMove on unknown moveId
    const active0 = createActivePokemon({ speed: 100, moves: ["tackle"] });
    const active1 = createActivePokemon({ speed: 100, moves: ["unknown-fake-move"] });
    const state = createBattleState(active0, active1);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const rng = new SeededRandom(42);
    // Should not throw — unknown move defaults to priority 0
    const order = ruleset.resolveTurnOrder([...actions], state, rng);
    expect(order.length).toBe(2);
  });

  it("given Trick Room active, when faster and slower Pokemon both use moves, then slower moves first", () => {
    // Source: pret/pokeemerald — Trick Room inverts speed order (slower moves first)
    // Covers Gen3Ruleset.ts line 811 — trickRoom.active branch with speedA !== speedB
    const fast = createActivePokemon({ speed: 200 });
    const slow = createActivePokemon({ speed: 50 });
    const state = createBattleState(fast, slow);
    state.trickRoom = { active: true, turnsLeft: 3 };
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const rng = new SeededRandom(42);
    const order = ruleset.resolveTurnOrder([...actions], state, rng);

    // Under Trick Room, side 1 (speed 50) should go first
    expect(order[0]!.side).toBe(1);
    expect(order[1]!.side).toBe(0);
  });

  it("given two switch actions, when resolving turn order, then tiebreak is PRNG-deterministic", () => {
    // Covers Gen3Ruleset.ts line 817-818 — non-move vs non-move tiebreak fallthrough
    const active0 = createActivePokemon({ speed: 100 });
    const active1 = createActivePokemon({ speed: 100 });
    const state = createBattleState(active0, active1);
    const actions: BattleAction[] = [
      { type: "switch", side: 0, switchIndex: 1 },
      { type: "switch", side: 1, switchIndex: 1 },
    ];

    // Run with same seed twice — must be deterministic
    const rng1 = new SeededRandom(42);
    const order1 = ruleset.resolveTurnOrder([...actions], state, rng1);

    const rng2 = new SeededRandom(42);
    const order2 = ruleset.resolveTurnOrder([...actions], state, rng2);

    expect(order1[0]!.side).toBe(order2[0]!.side);
    expect(order1[1]!.side).toBe(order2[1]!.side);
  });

  it("given Quick Claw holder with slower speed, when Quick Claw activates, then holder moves first", () => {
    // Source: pret/pokeemerald — Quick Claw activated holder acts first
    // Quick Claw activates with 3/16 chance; we use a seed that triggers it
    const slow = createActivePokemon({ speed: 50, heldItem: "quick-claw" });
    const fast = createActivePokemon({ speed: 200 });
    const state = createBattleState(slow, fast);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    // Find a seed where Quick Claw activates for side 0
    // Quick Claw check happens first in the loop, using rng.chance(3/16)
    let foundSeed = -1;
    for (let seed = 0; seed < 1000; seed++) {
      const testRng = new SeededRandom(seed);
      // Simulate: first call is rng.chance(3/16) for side 0's Quick Claw
      if (testRng.chance(3 / 16)) {
        foundSeed = seed;
        break;
      }
    }

    // Verify we found a seed
    expect(foundSeed).toBeGreaterThanOrEqual(0);

    const rng = new SeededRandom(foundSeed);
    const order = ruleset.resolveTurnOrder([...actions], state, rng);

    // Side 0 (slower but Quick Claw activated) should go first
    expect(order[0]!.side).toBe(0);
  });
});
