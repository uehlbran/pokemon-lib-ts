import type { DataManager } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent, ExpGainEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

function createTestEngine(overrides?: {
  seed?: number;
  ruleset?: MockRuleset;
  dataManager?: DataManager;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const team2 = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

function createSwitchPromptBattleWithBench(): {
  dataManager: DataManager;
  engine: BattleEngine;
  ruleset: MockRuleset;
} {
  const ruleset = new MockRuleset();
  ruleset.setFixedDamage(500);
  const dataManager = createMockDataManager();

  const side0Team = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
    }),
    createTestPokemon(25, 50, {
      uid: "pikachu-0",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 150,
        attack: 90,
        defense: 70,
        spAttack: 80,
        spDefense: 80,
        speed: 110,
      },
      currentHp: 150,
    }),
  ];

  const side1Team = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 200,
    }),
    createTestPokemon(25, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 150,
        attack: 90,
        defense: 70,
        spAttack: 80,
        spDefense: 80,
        speed: 110,
      },
      currentHp: 150,
    }),
  ];

  const engine = new BattleEngine(
    {
      generation: 1,
      format: "singles",
      teams: [side0Team, side1Team],
      seed: 12345,
    },
    ruleset,
    dataManager,
  );

  engine.start();

  return { dataManager, engine, ruleset };
}

describe("BattleEngine.deserialize", () => {
  it("given serialized state and a ruleset whose generation does not match the saved battle generation, when deserialized, then it throws", () => {
    const { engine } = createTestEngine();
    const serialized = engine.serialize();
    const mismatchedRuleset = new MockRuleset();

    mismatchedRuleset.setGenerationForTest(9);

    expect(() =>
      BattleEngine.deserialize(serialized, mismatchedRuleset, createMockDataManager()),
    ).toThrow("BattleEngine.deserialize: ruleset generation 9 does not match battle generation 1");
  });

  it("given a battle saved in switch-prompt, when deserialized, then submitSwitch resumes with the saved switch requirements", () => {
    const { dataManager, engine, ruleset } = createSwitchPromptBattleWithBench();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: side 1's active Pokemon faints and still has a healthy bench Pokemon,
    // so the engine transitions into switch-prompt and side 1 must choose slot 1.
    expect(engine.getState().phase).toBe("switch-prompt");

    const serialized = engine.serialize();
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

    expect(restored.getState().phase).toBe("switch-prompt");
    expect(() => restored.submitSwitch(1, 1)).not.toThrow();
    expect(restored.getActive(1)?.pokemon.uid).toBe("pikachu-1");
    expect(restored.getState().phase).toBe("action-select");
  });

  it("given serialized switch-prompt state with one pending switch already recorded, when deserialized, then the remaining switch submission completes the prompt", () => {
    const { dataManager, engine, ruleset } = createSwitchPromptBattleWithBench();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getState().phase).toBe("switch-prompt");

    const serializedState = JSON.parse(engine.serialize()) as {
      pendingSwitches: { __type: "Map"; entries: [0 | 1, number][] };
      sidesNeedingSwitch: { __type: "Set"; values: (0 | 1)[] };
      state: {
        phase: string;
        sides: Array<{
          active: Array<{ pokemon: { currentHp: number } }>;
          team: Array<{ currentHp: number }>;
        }>;
      };
    };

    serializedState.state.sides[0].active[0]!.pokemon.currentHp = 0;
    serializedState.state.sides[0].team[0]!.currentHp = 0;
    serializedState.pendingSwitches = { __type: "Map", entries: [[1, 1]] };
    serializedState.sidesNeedingSwitch = { __type: "Set", values: [0, 1] };

    const restored = BattleEngine.deserialize(
      JSON.stringify(serializedState),
      ruleset,
      dataManager,
    );

    expect(restored.getState().phase).toBe("switch-prompt");
    expect(restored.getActive(1)?.pokemon.uid).toBe("blastoise-1");

    expect(() => restored.submitSwitch(0, 1)).not.toThrow();
    expect(restored.getActive(0)?.pokemon.uid).toBe("pikachu-0");
    expect(restored.getActive(1)?.pokemon.uid).toBe("pikachu-1");
    expect(restored.getState().phase).toBe("action-select");
  });

  it("given a serialized battle state where currentHp is less than maxHp, when deserialized, then currentHp matches the saved value (not recalculated)", () => {
    // Arrange — create an engine, start it, deal some damage to reduce HP
    const ruleset = new MockRuleset();
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    // Directly reduce HP to simulate damage taken during a battle
    // MockRuleset.calculateStats computes HP as: floor((2*78+31)*50/100)+50+10 = 153
    // Source: MockRuleset.calculateStats formula in mock-ruleset.ts
    const active = engine.getActive(0)!;
    const maxHp = active.pokemon.calculatedStats!.hp;
    const damagedHp = Math.floor(maxHp / 2); // Set to half HP
    active.pokemon.currentHp = damagedHp;

    // Serialize with the damaged HP
    const serialized = engine.serialize();

    // Act — deserialize the state
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

    // Assert — currentHp should be the damaged value, NOT full HP from stat recalculation
    // Source: The bug is that the old `new BattleEngine(...)` constructor resets
    // currentHp = calculatedStats.hp (full HP). After fix, deserialized HP should
    // match the saved value exactly.
    const restoredActive = restored.getActive(0)!;
    expect(restoredActive.pokemon.currentHp).toBe(damagedHp);
    expect(restoredActive.pokemon.currentHp).not.toBe(maxHp);
  });

  it("given a serialized battle state, when deserialized and a turn is executed, then the battle resumes correctly", () => {
    // Arrange — create an engine, start it, run one turn, then serialize
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(10);
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    // Run one turn
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const hpAfterTurn1Side0 = engine.getActive(0)!.pokemon.currentHp;
    const hpAfterTurn1Side1 = engine.getActive(1)!.pokemon.currentHp;
    const turnAfterFirst = engine.getState().turnNumber;

    // Serialize after the first turn
    const serialized = engine.serialize();

    // Act — deserialize and run another turn
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);
    const restoredEvents: BattleEvent[] = [];
    restored.on((e) => restoredEvents.push(e));

    restored.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    restored.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — the battle should have advanced one turn from where it was serialized
    // Source: Turn number increments by 1 per turn — engine state machine invariant
    expect(restored.getState().turnNumber).toBe(turnAfterFirst + 1);

    // Both sides should have taken additional damage (10 damage from MockRuleset)
    // Source: MockRuleset.fixedDamage = 10 (set above)
    const restoredHpSide0 = restored.getActive(0)!.pokemon.currentHp;
    const restoredHpSide1 = restored.getActive(1)!.pokemon.currentHp;
    expect(restoredHpSide0).toBe(hpAfterTurn1Side0 - 10);
    expect(restoredHpSide1).toBe(hpAfterTurn1Side1 - 10);

    // Should have emitted events for the second turn
    const damageEvents = restoredEvents.filter((e) => e.type === "damage");
    expect(damageEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("given a serialized battle state, when deserialized, then the event log matches the saved battle history", () => {
    // Arrange — start a battle and execute one turn so the event log contains
    // both battle-start and turn-resolution events.
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(10);
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const savedEventLog = engine.getEventLog();
    const serialized = engine.serialize();

    // Act — deserialize the battle state.
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

    // Assert — the restored engine should preserve the full event log so replay,
    // undo, and audit consumers still see the same history after load.
    expect(restored.getEventLog()).toEqual(savedEventLog);
  });

  it("given a serialized state with a specific PRNG state, when deserialized, then PRNG continues from that exact state", () => {
    // Arrange — create two engines with the same seed, advance one by some RNG calls
    const ruleset = new MockRuleset();
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ seed: 42, ruleset, dataManager });
    engine.start();

    // Run a turn to advance the PRNG state
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Capture the PRNG state at this point
    const rngStateBeforeSerialize = engine.getState().rng.getState();

    // Generate the expected next values from a reference RNG with the same state
    // Source: SeededRandom (Mulberry32) is deterministic — same state produces same sequence
    const referenceRng = new SeededRandom(0);
    referenceRng.setState(rngStateBeforeSerialize);
    const expectedValue1 = referenceRng.next();
    const expectedValue2 = referenceRng.next();

    // Serialize the battle
    const serialized = engine.serialize();

    // Act — deserialize and read PRNG values
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);
    const restoredRngState = restored.getState().rng.getState();

    // Assert — PRNG state should match exactly
    expect(restoredRngState).toBe(rngStateBeforeSerialize);

    // And the next values from the deserialized RNG should match the reference
    const actualValue1 = restored.getState().rng.next();
    const actualValue2 = restored.getState().rng.next();
    expect(actualValue1).toBe(expectedValue1);
    expect(actualValue2).toBe(expectedValue2);
  });

  it("given a serialized battle state where currentHp is 1 (near faint), when deserialized, then currentHp is 1 (not reset to max)", () => {
    // Arrange — second triangulation case for the HP preservation regression
    const ruleset = new MockRuleset();
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    // Set HP to 1 (near-faint)
    const active = engine.getActive(0)!;
    const maxHp = active.pokemon.calculatedStats!.hp;
    active.pokemon.currentHp = 1;

    const serialized = engine.serialize();

    // Act
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

    // Assert — HP should be 1, not maxHp
    // Source: Same regression as above — constructor would reset to maxHp
    const restoredActive = restored.getActive(0)!;
    expect(restoredActive.pokemon.currentHp).toBe(1);
    expect(restoredActive.pokemon.currentHp).not.toBe(maxHp);
  });

  it("given participation was recorded before serialize, when deserialized and foe faints, then EXP is awarded to the pre-serialization participant", () => {
    // Arrange — regression test for participantTracker not being serialized.
    // Setup: two side-0 pokemon (Charizard, Pikachu). Charizard faces Blastoise for one turn
    // (recording participation), then we serialize. On load, Pikachu comes in and Blastoise faints.
    // Without the fix, Charizard's participation would be forgotten and it would receive 0 EXP;
    // with the fix, Charizard is still a recorded participant and receives a share of EXP.
    //
    // Source: Qodo/CodeRabbit review on PR #280 — participantTracker not included in serialize().
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(5); // won't KO either pokemon in one hit; we'll set HP manually

    const dataManager = createMockDataManager();

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      }),
      createTestPokemon(25, 50, {
        uid: "pikachu-1",
        nickname: "Pikachu",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      }),
    ];

    const team2 = [
      createTestPokemon(9, 30, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      }),
    ];

    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [team1, team2],
      seed: 12345,
      isWildBattle: true,
    };

    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.start();

    // Set Blastoise HP to 15 (survives turn 1's 5-damage hit, faints next turn from manual set)
    // and Charizard HP high so it doesn't faint in turn 1.
    engine.getActive(1)!.pokemon.currentHp = 15;
    engine.getActive(0)!.pokemon.currentHp = 200;

    // Turn 1: Charizard faces Blastoise — records Charizard as participant vs Blastoise.
    // Blastoise survives (15 - 5 = 10 HP). Blastoise hits Charizard (200 - 5 = 195 HP).
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Serialize mid-battle — Charizard is a recorded participant for Blastoise.
    const serialized = engine.serialize();

    // Act — deserialize and manually set Blastoise HP to 1 so it faints next attack.
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);
    const restoredEvents: BattleEvent[] = [];
    restored.on((e) => restoredEvents.push(e));

    // Override: set Blastoise HP to 1 in the restored engine so it faints on next hit.
    restored.getActive(1)!.pokemon.currentHp = 1;

    // Turn 2: Charizard (still active) hits Blastoise (1 → faint).
    // Source: MockRuleset.calculateExpGain — floor(defeatedSpecies.baseExp * defeatedLevel / (5 * participantCount))
    // Blastoise baseExp=239, defeatedLevel=30, participantCount=1 (only Charizard, who is living)
    // → floor(239 * 30 / (5 * 1)) = 1434
    restored.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    restored.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Charizard was a participant before the serialize, and should still receive EXP.
    const expGainEvents = restoredEvents.filter((e): e is ExpGainEvent => e.type === "exp-gain");
    expect(expGainEvents.length).toBeGreaterThanOrEqual(1);

    const charizardExpEvent = expGainEvents.find((e) => e.pokemon === "charizard-1");
    if (!charizardExpEvent) throw new Error("Expected charizard-1 to receive an exp-gain event");
    // Source: MockRuleset.calculateExpGain — floor(239 * 30 / (5 * 1)) = 1434
    expect(charizardExpEvent.amount).toBe(1434);
  });

  it("given a deserialized engine, when on() is called, then listeners receive events", () => {
    // Arrange — verify that the deserialized engine initializes listeners correctly
    const ruleset = new MockRuleset();
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    const serialized = engine.serialize();

    // Act
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);
    const events: BattleEvent[] = [];
    restored.on((e) => events.push(e));

    // Run a turn to trigger events
    restored.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    restored.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — listener should have received events
    // Source: Engine emits events for every turn action — this verifies that
    // deserialized engines have a working listener set
    expect(events.length).toBeGreaterThanOrEqual(1);
    const hasDamageEvent = events.some((e) => e.type === "damage");
    expect(hasDamageEvent).toBe(true);
  });
});
