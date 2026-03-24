import type { DataManager } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, BattleGimmick } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent, ExpGainEvent } from "../../src/events";
import type { BattleGimmickType } from "../../src/ruleset";
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

class SerializableTrackingGimmick implements BattleGimmick {
  readonly name = "Tracking Z-Move";
  readonly generations = [7] as const;
  private readonly usedBySide = new Set<0 | 1>();

  canUseForSide(sideIndex: 0 | 1): boolean {
    return !this.usedBySide.has(sideIndex);
  }

  canUse(
    _pokemon: import("../../src/state").ActivePokemon,
    side: import("../../src/state").BattleSide,
  ): boolean {
    return this.canUseForSide(side.index);
  }

  activate(
    _pokemon: import("../../src/state").ActivePokemon,
    side: import("../../src/state").BattleSide,
  ): BattleEvent[] {
    this.usedBySide.add(side.index);
    return [];
  }

  reset(): void {
    this.usedBySide.clear();
  }

  serializeState(): { usedBySide: Array<0 | 1> } {
    return { usedBySide: [...this.usedBySide] };
  }

  restoreState(state: unknown): void {
    this.usedBySide.clear();

    if (!state || typeof state !== "object" || !("usedBySide" in state)) {
      return;
    }

    const usedBySide = (state as { usedBySide?: unknown }).usedBySide;
    if (!Array.isArray(usedBySide)) {
      return;
    }

    for (const sideIndex of usedBySide) {
      if (sideIndex === 0 || sideIndex === 1) {
        this.usedBySide.add(sideIndex);
      }
    }
  }
}

class SerializableTrackingRuleset extends MockRuleset {
  readonly generation = 7;
  private readonly gimmick = new SerializableTrackingGimmick();

  override getBattleGimmick(type: BattleGimmickType): BattleGimmick | null {
    return type === "zmove" ? this.gimmick : null;
  }

  canUseZMove(sideIndex: 0 | 1): boolean {
    return this.gimmick.canUseForSide(sideIndex);
  }
}

describe("BattleEngine.deserialize", () => {
  it("given one side has already submitted an action, when serialized and deserialized, then the pending action is preserved", () => {
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(10);
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    const initialHpSide0 = engine.state.sides[0].active[0]!.pokemon.currentHp;
    const initialHpSide1 = engine.state.sides[1].active[0]!.pokemon.currentHp;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });

    const serialized = engine.serialize();
    const restored = BattleEngine.deserialize(serialized, ruleset, dataManager);

    restored.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(restored.getState().turnNumber).toBe(1);
    expect(restored.getActive(0)?.pokemon.currentHp).toBe(initialHpSide0 - 10);
    expect(restored.getActive(1)?.pokemon.currentHp).toBe(initialHpSide1 - 10);
  });

  it("given serialize is called during turn resolution, when a save is attempted, then it throws instead of producing a lossy snapshot", () => {
    const ruleset = new MockRuleset();
    const dataManager = createMockDataManager();
    const { engine } = createTestEngine({ ruleset, dataManager });
    engine.start();

    let serializeError: Error | null = null;

    engine.on((event) => {
      if (event.type !== "damage") {
        return;
      }

      try {
        engine.serialize();
      } catch (error) {
        serializeError = error as Error;
      }
    });

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(serializeError?.message).toBe(
      "BattleEngine.serialize cannot save during phase turn-resolve; save only from stable checkpoint phases",
    );
  });

  it("given serialized state and a ruleset whose generation does not match the saved battle generation, when deserialized, then it throws", () => {
    const { engine } = createTestEngine();
    const serialized = engine.serialize();
    const mismatchedRuleset = new MockRuleset();

    mismatchedRuleset.setGenerationForTest(9);

    expect(() =>
      BattleEngine.deserialize(serialized, mismatchedRuleset, createMockDataManager()),
    ).toThrow("BattleEngine.deserialize: ruleset generation 9 does not match battle generation 1");
  });

  it("given a serialized battle state with a non-singles format, when deserialized, then it rejects unsupported multi-active formats", () => {
    const { engine } = createTestEngine();
    const parsed = JSON.parse(engine.serialize()) as {
      state: {
        format: string;
      };
    };
    parsed.state.format = "triples";

    expect(() =>
      BattleEngine.deserialize(JSON.stringify(parsed), new MockRuleset(), createMockDataManager()),
    ).toThrow('BattleEngine.deserialize: battle format "triples" is not supported');
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

  it("given a battle saved in switch-prompt after Baton Pass queues a self-switch, when deserialized, then the replacement still receives the preserved state", () => {
    const ruleset = new MockRuleset();
    const dataManager = createMockDataManager();
    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        speed: 120,
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      }),
      createTestPokemon(25, 50, {
        uid: "pikachu-1",
        nickname: "Pikachu",
      }),
    ];
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        speed: 80,
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      }),
    ];

    const engine = new BattleEngine(
      {
        generation: 1,
        format: "singles",
        teams: [team1, team2],
        seed: 12345,
      },
      ruleset,
      dataManager,
    );

    ruleset.setMoveEffectResult({ switchOut: true, batonPass: true });
    engine.start();

    const attacker = engine.state.sides[0].active[0]!;
    attacker.statStages.attack = 2;
    attacker.substituteHp = 50;
    attacker.volatileStatuses.set("confusion", { turnsLeft: 2 });
    attacker.volatileStatuses.set("substitute", { turnsLeft: -1 });

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    expect(engine.getState().phase).toBe("switch-prompt");

    const restored = BattleEngine.deserialize(engine.serialize(), ruleset, dataManager);
    expect(restored.getState().phase).toBe("switch-prompt");

    restored.submitSwitch(0, 1);

    const replacement = restored.getActive(0)!;
    expect(replacement.pokemon.uid).toBe("pikachu-1");
    // Source: Baton Pass preserves the outgoing Pokemon's stat stages across the queued self-switch,
    // so the replacement after restored.submitSwitch(0, 1) should still have the attack boost.
    expect(replacement.statStages.attack).toBe(2);
    // Source: Substitute state is tracked separately from volatileStatuses via substituteHp, so
    // the deserialized Baton Pass flow must preserve both the substitute volatile and its HP value.
    // The opponent damages the substitute for 10 before the switch prompt, leaving 40 HP to pass.
    expect(replacement.substituteHp).toBe(40);
    // Source: the original attacker started at confusion turnsLeft = 2, and the mock ruleset consumes
    // one confusion turn during move resolution before the switch prompt, so the replacement inherits 1.
    expect(replacement.volatileStatuses.get("confusion")).toEqual({ turnsLeft: 1 });
    expect(replacement.volatileStatuses.get("substitute")).toEqual({ turnsLeft: -1 });
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

  it("given serialized switch-prompt state with malformed switch bookkeeping, when deserialized, then invalid entries are ignored and the prompt remains resumable", () => {
    const { dataManager, engine, ruleset } = createSwitchPromptBattleWithBench();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const serializedState = JSON.parse(engine.serialize()) as {
      pendingSwitches: { __type: "Map"; entries: [number, number][] };
      sidesNeedingSwitch: { __type: "Set"; values: number[] };
    };

    serializedState.pendingSwitches = {
      __type: "Map",
      entries: [
        [7, 1],
        [1, 1],
        [0, 99],
      ],
    };
    serializedState.sidesNeedingSwitch = {
      __type: "Set",
      values: [1, 12],
    };

    const restored = BattleEngine.deserialize(
      JSON.stringify(serializedState),
      ruleset,
      dataManager,
    );

    expect(restored.getState().phase).toBe("switch-prompt");
    expect(() => restored.submitSwitch(1, 1)).not.toThrow();
    expect(restored.getActive(1)?.pokemon.uid).toBe("pikachu-1");
    expect(restored.getState().phase).toBe("action-select");
  });

  it("given serialized non-switch state with stale switch bookkeeping, when deserialized, then stale switch requirements are cleared", () => {
    const { dataManager, engine, ruleset } = createTestEngine();
    engine.start();

    const serializedState = JSON.parse(engine.serialize()) as {
      pendingSwitches: { __type: "Map"; entries: [number, number][] };
      sidesNeedingSwitch: { __type: "Set"; values: number[] };
    };

    serializedState.pendingSwitches = {
      __type: "Map",
      entries: [[0, 0]],
    };
    serializedState.sidesNeedingSwitch = {
      __type: "Set",
      values: [0],
    };

    const restored = BattleEngine.deserialize(
      JSON.stringify(serializedState),
      ruleset,
      dataManager,
    );

    const reserialized = JSON.parse(restored.serialize()) as {
      pendingSwitches: { __type: "Map"; entries: [number, number][] };
      sidesNeedingSwitch: { __type: "Set"; values: number[] };
      state: { phase: string };
    };

    expect(reserialized.state.phase).toBe("action-select");
    expect(reserialized.pendingSwitches.entries).toEqual([]);
    expect(reserialized.sidesNeedingSwitch.values).toEqual([]);
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
    const active = engine.state.sides[0].active[0]!;
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

    const hpAfterTurn1Side0 = engine.state.sides[0].active[0]!.pokemon.currentHp;
    const hpAfterTurn1Side1 = engine.state.sides[1].active[0]!.pokemon.currentHp;
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
    const active = engine.state.sides[0].active[0]!;
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
    engine.state.sides[1].active[0]!.pokemon.currentHp = 15;
    engine.state.sides[0].active[0]!.pokemon.currentHp = 200;

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
    restored.state.sides[1].active[0]!.pokemon.currentHp = 1;

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

  it("given a ruleset gimmick tracks once-per-battle state outside BattleState, when deserialized with a fresh ruleset, then the restored gimmick still blocks reuse", () => {
    const dataManager = createMockDataManager();
    const ruleset = new SerializableTrackingRuleset();
    const engine = new BattleEngine(
      {
        generation: 7,
        format: "singles",
        teams: [
          [
            createTestPokemon(25, 50, {
              uid: "pikachu-0",
              nickname: "Pikachu",
              moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
            }),
          ],
          [
            createTestPokemon(9, 50, {
              uid: "blastoise-1",
              nickname: "Blastoise",
              moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
            }),
          ],
        ],
        seed: 12345,
      },
      ruleset,
      dataManager,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, zMove: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const serialized = engine.serialize();
    const restoredRuleset = new SerializableTrackingRuleset();
    const restored = BattleEngine.deserialize(serialized, restoredRuleset, dataManager);

    expect(restored.getState().generation).toBe(7);
    expect(ruleset.canUseZMove(0)).toBe(false);
    expect(restoredRuleset.canUseZMove(0)).toBe(false);
    expect(restoredRuleset.canUseZMove(1)).toBe(true);
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
