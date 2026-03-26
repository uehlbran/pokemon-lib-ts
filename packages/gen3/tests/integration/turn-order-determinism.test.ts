import type { ActivePokemon, BattleAction, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN3_ITEM_IDS, GEN3_SPECIES_IDS, Gen3Ruleset } from "../../src";
import { createGen3DataManager } from "../../src/data";

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
const ITEM_IDS = GEN3_ITEM_IDS;
const SPECIES_IDS = GEN3_SPECIES_IDS;
const TYPE_IDS = CORE_TYPE_IDS;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createCanonicalMoveSlot(moveId: string) {
  const moveData = dataManager.getMove(moveId);
  return createMoveSlot(moveData.id, moveData.pp);
}

function createSyntheticMoveSlot(moveId: string) {
  return {
    moveId,
    currentPP: 10,
    maxPP: 10,
    ppUps: 0,
  };
}

function createSyntheticOnFieldPokemon(opts: {
  speed: number;
  heldItem?: string | null;
  moves?: string[];
}): ActivePokemon {
  const moves = (opts.moves ?? [CORE_MOVE_IDS.tackle]).map((id) => {
    try {
      return createCanonicalMoveSlot(id);
    } catch {
      return createSyntheticMoveSlot(id);
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
    speciesId: SPECIES_IDS.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs(),
    currentHp: 200,
    moves,
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [TYPE_IDS.normal],
    ability: CORE_ABILITY_IDS.none,
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

function createMockRng(opts?: { nextValue?: number; intValue?: number; chanceResult?: boolean }) {
  return {
    next: () => opts?.nextValue ?? 0,
    int: (_min: number, _max: number) => opts?.intValue ?? 0,
    chance: (_p: number) => opts?.chanceResult ?? false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as SeededRandom;
}

describe("Gen 3 Turn Order Determinism", () => {
  it("given same seed, when resolveTurnOrder called twice with same actions, then same order both times", () => {
    // Source: GitHub issue #120 — tiebreak keys must be pre-assigned for PRNG determinism
    const active0 = createSyntheticOnFieldPokemon({ speed: 100 });
    const active1 = createSyntheticOnFieldPokemon({ speed: 100 });
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

  it("given faster Pokemon, when resolving turn order, then faster moves first", () => {
    // Source: pret/pokeemerald — higher speed acts first (no Trick Room)
    const fast = createSyntheticOnFieldPokemon({ speed: 200 });
    const slow = createSyntheticOnFieldPokemon({ speed: 50 });
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
    const active0 = createSyntheticOnFieldPokemon({ speed: 100, moves: [CORE_MOVE_IDS.tackle] });
    const active1 = createSyntheticOnFieldPokemon({ speed: 100, moves: ["unknown-fake-move"] });
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
    const fast = createSyntheticOnFieldPokemon({ speed: 200 });
    const slow = createSyntheticOnFieldPokemon({ speed: 50 });
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
    const active0 = createSyntheticOnFieldPokemon({ speed: 100 });
    const active1 = createSyntheticOnFieldPokemon({ speed: 100 });
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
    // This integration test keeps the scenario deterministic by forcing the
    // Quick Claw branch instead of scanning seeds.
    const slow = createSyntheticOnFieldPokemon({ speed: 50, heldItem: ITEM_IDS.quickClaw });
    const fast = createSyntheticOnFieldPokemon({ speed: 200 });
    const state = createBattleState(slow, fast);
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0, target: 1 },
      { type: "move", side: 1, moveIndex: 0, target: 0 },
    ];

    const rng = createMockRng({ chanceResult: true });
    const order = ruleset.resolveTurnOrder([...actions], state, rng);

    // Side 0 (slower but Quick Claw activated) should go first
    expect(order[0]!.side).toBe(0);
  });
});
