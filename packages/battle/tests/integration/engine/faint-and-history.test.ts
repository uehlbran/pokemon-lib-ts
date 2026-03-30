import { CORE_MOVE_IDS, CORE_VOLATILE_IDS, type PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

// -----------------------------------------------------------------------
// Bug #78 — checkMidTurnFaints() emits duplicate faint events
// -----------------------------------------------------------------------
describe("BattleEngine — faint deduplication (#78)", () => {
  it("given a pokemon at 0 HP, when checkMidTurnFaints is called twice, then only one faint event is emitted", () => {
    // Arrange
    const { engine, events } = createEngine();
    engine.start();

    // Directly set the active pokemon's HP to 0 to simulate a mid-turn faint
    const side0 = engine.state.sides[0];
    const active = side0.active[0];
    if (!active) throw new Error("No active pokemon on side 0");
    active.pokemon.currentHp = 0;

    // Access the private method via cast — test-only pattern
    const enginePrivate = engine as unknown as { checkMidTurnFaints(): void };

    // Act — call twice to simulate the duplicate-emission scenario
    enginePrivate.checkMidTurnFaints();
    enginePrivate.checkMidTurnFaints();

    // Assert — exactly one faint event for the pokemon on side 0
    const faintEvents = events.filter((e) => e.type === "faint" && e.side === 0);
    expect(faintEvents).toHaveLength(1);
  });

  it("given a pokemon at 0 HP, when checkMidTurnFaints is called, then it emits faint without switch-out", () => {
    // Arrange
    const { engine, events } = createEngine();
    engine.start();

    const side0 = engine.state.sides[0];
    const active = side0.active[0];
    if (!active) throw new Error("No active pokemon on side 0");
    active.pokemon.currentHp = 0;

    const enginePrivate = engine as unknown as { checkMidTurnFaints(): void };

    // Act
    enginePrivate.checkMidTurnFaints();

    // Assert
    const faintEvents = events.filter((e) => e.type === "faint" && e.side === 0);
    const switchOutEvents = events.filter((e) => e.type === "switch-out" && e.side === 0);
    expect(faintEvents).toHaveLength(1);
    expect(switchOutEvents).toHaveLength(0);
  });

  it("given a pokemon at 0 HP, when checkMidTurnFaints is called twice, then faintCount is incremented only once", () => {
    // Arrange
    const { engine } = createEngine();
    engine.start();

    const side0 = engine.state.sides[0];
    const active = side0.active[0];
    if (!active) throw new Error("No active pokemon on side 0");
    active.pokemon.currentHp = 0;

    const enginePrivate = engine as unknown as { checkMidTurnFaints(): void };
    const faintCountBefore = side0.faintCount;

    // Act
    enginePrivate.checkMidTurnFaints();
    enginePrivate.checkMidTurnFaints();

    // Assert — faintCount incremented exactly once
    expect(side0.faintCount).toBe(faintCountBefore + 1);
  });

  it("given both pokemon at 0 HP, when checkMidTurnFaints is called twice, then exactly one faint event per side", () => {
    // Arrange
    const { engine, events } = createEngine();
    engine.start();

    for (const side of engine.state.sides) {
      const active = side.active[0];
      if (active) active.pokemon.currentHp = 0;
    }

    const enginePrivate = engine as unknown as { checkMidTurnFaints(): void };

    // Act
    enginePrivate.checkMidTurnFaints();
    enginePrivate.checkMidTurnFaints();

    // Assert — exactly one faint per side (2 total)
    const faintEvents = events.filter((e) => e.type === "faint");
    expect(faintEvents).toHaveLength(2);
    const side0Faints = faintEvents.filter((e) => e.type === "faint" && e.side === 0);
    const side1Faints = faintEvents.filter((e) => e.type === "faint" && e.side === 1);
    expect(side0Faints).toHaveLength(1);
    expect(side1Faints).toHaveLength(1);
  });

  it("given the faintedPokemonThisTurn set is cleared between turns, when checkMidTurnFaints is called again after clearing, then a faint event is emitted again", () => {
    // Arrange
    const { engine, events } = createEngine();
    engine.start();

    const enginePrivate = engine as unknown as {
      checkMidTurnFaints(): void;
      faintedPokemonThisTurn: Set<string>;
    };
    const side0 = engine.state.sides[0];
    const active = side0.active[0];
    if (!active) throw new Error("No active pokemon on side 0");
    active.pokemon.currentHp = 0;

    // Simulate turn 1: two calls — only one faint should be emitted
    enginePrivate.checkMidTurnFaints();
    enginePrivate.checkMidTurnFaints();
    const faintsAfterFirstBatch = events.filter((e) => e.type === "faint" && e.side === 0).length;
    expect(faintsAfterFirstBatch).toBe(1);

    // Simulate start of a new turn: clear the set (mirrors what resolveTurn() does)
    enginePrivate.faintedPokemonThisTurn.clear();

    // Call checkMidTurnFaints again — should emit another faint since set was cleared
    enginePrivate.checkMidTurnFaints();
    const faintsAfterSecondBatch = events.filter((e) => e.type === "faint" && e.side === 0).length;

    // Assert — clearing the set allows a new faint event to be emitted
    expect(faintsAfterSecondBatch).toBe(2);
  });
});

// -----------------------------------------------------------------------
// Bug #84 — Turn history records last 50 events instead of current-turn events only
// -----------------------------------------------------------------------
describe("BattleEngine — per-turn event history (#84)", () => {
  it("given a 2-turn battle, when turn history is recorded, then each entry contains only that turn's events", () => {
    // Arrange — use a ruleset that does not deal lethal damage so we can run 2 turns
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(1); // low damage so no faints
    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Act — run turn 1
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.turnHistory).toHaveLength(1);
    const turn1History = engine.state.turnHistory[0];
    const turn1Events = turn1History?.events ?? [];

    // Act — run turn 2
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.turnHistory).toHaveLength(2);
    const turn2History = engine.state.turnHistory[1];
    const turn2Events = turn2History?.events ?? [];

    // Assert — turn 1 events should NOT include turn 2 events
    // The sum of turn1 + turn2 event counts should be less than or equal to total events
    // (they should not both count the same events)
    expect(turn1Events.length + turn2Events.length).toBeLessThanOrEqual(events.length);

    // The first turn's events should only be a subset from the start
    // and should NOT contain events emitted in turn 2
    // If fixed correctly, turn1Events.length < eventsAfterTurn1 (turn 2 added more events)
    // and turn2Events should not include turn-start event from turn 1
    const turn2TurnStartEvents = turn2Events.filter(
      (e) =>
        e.type === "turn-start" &&
        "turnNumber" in e &&
        (e as { turnNumber: number }).turnNumber === 2,
    );
    const turn1TurnStartInTurn2 = turn2Events.filter(
      (e) =>
        e.type === "turn-start" &&
        "turnNumber" in e &&
        (e as { turnNumber: number }).turnNumber === 1,
    );

    // Turn 2's history should contain turn 2's turn-start event
    expect(turn2TurnStartEvents).toHaveLength(1);
    // Turn 2's history should NOT contain turn 1's turn-start event
    expect(turn1TurnStartInTurn2).toHaveLength(0);

    // Turn 1 events should not contain turn 2's turn-start event
    const turn2StartInTurn1 = turn1Events.filter(
      (e) =>
        e.type === "turn-start" &&
        "turnNumber" in e &&
        (e as { turnNumber: number }).turnNumber === 2,
    );
    expect(turn2StartInTurn1).toHaveLength(0);
  });

  it("given turn 1, when turn history entry is created, then its events count matches only turn 1 events not all 50", () => {
    // Arrange
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(1);
    const { engine } = createEngine({ ruleset });
    engine.start();

    // Count events before turn 1 starts (battle-start events)
    const eventsBeforeTurn = engine.state.turnHistory.length; // 0

    // Act — run turn 1
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    expect(engine.state.turnHistory).toHaveLength(1);
    const turn1History = engine.state.turnHistory[0];

    // The events in turn 1 history should have the turn-start event for turn 1
    const turn1StartEvents = (turn1History?.events ?? []).filter(
      (e) =>
        e.type === "turn-start" &&
        "turnNumber" in e &&
        (e as { turnNumber: number }).turnNumber === 1,
    );
    expect(turn1StartEvents).toHaveLength(1);

    // The events should NOT contain battle-start events (those happened before the turn)
    const battleStartEvents = (turn1History?.events ?? []).filter((e) => e.type === "battle-start");
    expect(battleStartEvents).toHaveLength(0);

    void eventsBeforeTurn;
  });
});

// -----------------------------------------------------------------------
// Bug #868 — Turn history records rewritten actions instead of submitted choices
// -----------------------------------------------------------------------
describe("BattleEngine — turn history submitted actions (#868)", () => {
  it("given a submitted move that is rewritten into recharge, when the turn is recorded, then turn history keeps the submitted move", () => {
    const ruleset = new MockRuleset();
    const { engine } = createEngine({ ruleset });
    engine.start();

    const active = engine.state.sides[0].active[0];
    if (!active) {
      throw new Error("No active pokemon on side 0");
    }

    active.volatileStatuses.set(CORE_VOLATILE_IDS.recharge, { turnsLeft: 1 });

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.turnHistory).toHaveLength(1);
    expect(engine.state.turnHistory[0]?.actions).toEqual([
      { type: "move", side: 0, moveIndex: 0 },
      { type: "move", side: 1, moveIndex: 0 },
    ]);
  });
});
