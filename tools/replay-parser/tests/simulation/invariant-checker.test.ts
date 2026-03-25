import type { BattleEvent } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import {
  checkAllInvariants,
  checkInvariants,
  getRegisteredInvariants,
} from "../../src/simulation/invariant-checker.js";
import type { BattleRunConfig } from "../../src/simulation/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: BattleRunConfig = { generation: 1, seed: 42, teamSize: 3, maxTurns: 500 };

/**
 * Build a minimal valid battle event stream: battle-start → turn-start(1) → battle-end(winner:0)
 */
function makeValidEvents(): BattleEvent[] {
  return [
    { type: "battle-start", generation: 1, format: "singles" },
    { type: "turn-start", turnNumber: 1 },
    { type: "battle-end", winner: 0 },
  ] as unknown as BattleEvent[];
}

// ---------------------------------------------------------------------------
// checkAllInvariants
// ---------------------------------------------------------------------------

describe("checkAllInvariants — valid battle", () => {
  it("given a minimal valid event stream, when checking all invariants, then returns zero violations", () => {
    // Arrange
    const events = makeValidEvents();

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([]);
  });
});

describe("checkAllInvariants — event framing", () => {
  it("given events that do not start with battle-start, when checking all invariants, then returns an event-framing violation", () => {
    // Arrange
    const events = [
      { type: "turn-start", turnNumber: 1 },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "event-framing",
        severity: "error",
        turnNumber: null,
        message: 'First event is "turn-start", expected "battle-start"',
        eventIndex: 0,
      },
    ]);
  });

  it("given events with only battle-start and no battle-end, when checking all invariants, then returns an event-framing violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "event-framing",
        severity: "error",
        turnNumber: null,
        message: 'Last event is "battle-start", expected "battle-end"',
        eventIndex: 0,
      },
      {
        invariant: "single-battle-end",
        severity: "error",
        turnNumber: null,
        message: "Expected exactly 1 battle-end event, found 0",
        eventIndex: 0,
      },
    ]);
  });

  it("given an empty event stream, when checking all invariants, then returns an event-framing violation", () => {
    // Arrange
    const events: BattleEvent[] = [];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "event-framing",
        severity: "error",
        turnNumber: null,
        message: "Event stream is empty",
        eventIndex: 0,
      },
      {
        invariant: "single-battle-end",
        severity: "error",
        turnNumber: null,
        message: "Expected exactly 1 battle-end event, found 0",
        eventIndex: -1,
      },
    ]);
  });
});

describe("checkAllInvariants — single-battle-end", () => {
  it("given two battle-end events, when checking all invariants, then returns a single-battle-end violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      { type: "battle-end", winner: 0 },
      { type: "battle-end", winner: 1 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "single-battle-end",
        severity: "error",
        turnNumber: null,
        message: "Expected exactly 1 battle-end event, found 2",
        eventIndex: 3,
      },
    ]);
  });
});

describe("checkAllInvariants — sequential-turns", () => {
  it("given turn 1 followed by turn 3 (skipping turn 2), when checking all invariants, then returns a sequential-turns violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      { type: "turn-start", turnNumber: 3 },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "sequential-turns",
        severity: "error",
        turnNumber: 3,
        message: "Turn 3 out of order, expected 2",
        eventIndex: 2,
      },
    ]);
  });
});

describe("checkAllInvariants — hp-bounds", () => {
  it("given a damage event with currentHp=-1, when checking all invariants, then returns an hp-bounds violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      {
        type: "damage",
        side: 0,
        pokemon: "bulbasaur",
        currentHp: -1,
        maxHp: 100,
        amount: 101,
        source: "move",
      },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "hp-bounds",
        severity: "error",
        turnNumber: 1,
        message: "Side 0 pokemon bulbasaur: currentHp=-1 out of [0, 100]",
        eventIndex: 2,
      },
    ]);
  });

  it("given a damage event with currentHp exceeding maxHp, when checking all invariants, then returns an hp-bounds violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      {
        type: "damage",
        side: 0,
        pokemon: "bulbasaur",
        currentHp: 150,
        maxHp: 100,
        amount: 0,
        source: "move",
      },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "hp-bounds",
        severity: "error",
        turnNumber: 1,
        message: "Side 0 pokemon bulbasaur: currentHp=150 out of [0, 100]",
        eventIndex: 2,
      },
    ]);
  });
});

describe("checkAllInvariants — positive-damage", () => {
  it("given a damage event with amount=-1 (negative), when checking all invariants, then returns a positive-damage violation", () => {
    // Arrange — amount=0 is valid (floor-rounding edge case in Gen 2), only negative is a violation
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      {
        type: "damage",
        side: 0,
        pokemon: "bulbasaur",
        currentHp: 100,
        maxHp: 100,
        amount: -1,
        source: "move",
      },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "positive-damage",
        severity: "error",
        turnNumber: 1,
        message: "Side 0 pokemon bulbasaur: damage amount -1 is negative",
        eventIndex: 2,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// checkInvariants
// ---------------------------------------------------------------------------

describe("checkInvariants — selective", () => {
  it("given only 'event-framing' requested, when events have invalid HP, then does not return hp-bounds violations", () => {
    // Arrange — events trigger hp-bounds but not event-framing
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      {
        type: "damage",
        side: 0,
        pokemon: "bulbasaur",
        currentHp: -5,
        maxHp: 100,
        amount: 105,
        source: "move",
      },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkInvariants(events, baseConfig, ["event-framing"]);

    // Assert — only event-framing ran, so no hp-bounds violation
    expect(violations).toEqual([]);
  });

  it("given an unrecognized invariant name, when checking, then returns empty violations array", () => {
    // Arrange
    const events = makeValidEvents();

    // Act
    const violations = checkInvariants(events, baseConfig, ["does-not-exist"]);

    // Assert
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getRegisteredInvariants
// ---------------------------------------------------------------------------

describe("getRegisteredInvariants", () => {
  it("given the invariant registry, when retrieving all invariants, then returns exactly 15 invariants", () => {
    // Act
    const invariants = getRegisteredInvariants();

    // Assert
    expect(invariants.map((inv) => inv.name)).toEqual([
      "event-framing",
      "single-battle-end",
      "sequential-turns",
      "no-timeout",
      "hp-bounds",
      "positive-damage",
      "hp-delta-consistency",
      "status-type-immunity",
      "effectiveness-bounds",
      "effectiveness-correctness",
      "faint-at-zero",
      "no-post-faint-action",
      "switch-after-faint",
      "winner-consistency",
      "determinism",
    ]);
  });

  it("given the invariant registry, when retrieving all invariants, then each has a name, description, and check function", () => {
    // Act
    const invariants = getRegisteredInvariants();

    // Assert
    expect(
      invariants.map((inv) => ({
        name: inv.name,
        description: inv.description,
      })),
    ).toEqual([
      {
        name: "event-framing",
        description: "First event must be battle-start and last must be battle-end",
      },
      {
        name: "single-battle-end",
        description: "Exactly one battle-end event must appear in the stream",
      },
      {
        name: "sequential-turns",
        description: "turn-start events must have incrementing turnNumber starting at 1",
      },
      {
        name: "no-timeout",
        description: "Battle must end within maxTurns turns",
      },
      {
        name: "hp-bounds",
        description: "currentHp must be between 0 and maxHp inclusive on all damage/heal events",
      },
      {
        name: "positive-damage",
        description:
          "Damage amount must be non-negative (negative damage is clearly wrong; 0 is valid for floor-rounding edge cases)",
      },
      {
        name: "hp-delta-consistency",
        description:
          "Damage must reduce HP (not increase it); declared amount must be >= actual HP drop (overkill is valid)",
      },
      {
        name: "status-type-immunity",
        description: "Type-based status immunities must be respected (Fire can't burn, etc.)",
      },
      {
        name: "effectiveness-bounds",
        description: "Type effectiveness multiplier must be one of {0, 0.25, 0.5, 1, 2, 4}",
      },
      {
        name: "effectiveness-correctness",
        description: "Effectiveness events must agree with type chart (multiplier != 1 means actually non-neutral)",
      },
      {
        name: "faint-at-zero",
        description: "A Pokemon whose HP reaches 0 via a damage event must receive a faint event before the battle ends",
      },
      {
        name: "no-post-faint-action",
        description: "A fainted Pokemon must not use moves after fainting",
      },
      {
        name: "switch-after-faint",
        description: "When a Pokemon faints and the team has reserves, a switch-in must follow",
      },
      {
        name: "winner-consistency",
        description: "Winner must have surviving Pokemon; loser must have all fainted",
      },
      {
        name: "determinism",
        description: "Running the same battle seed twice must produce identical events",
      },
    ]);

    for (const inv of invariants) {
      expect(inv.check).toEqual(expect.any(Function));
    }
  });
});

// ---------------------------------------------------------------------------
// Individual invariant spot checks
// ---------------------------------------------------------------------------

describe("hp-bounds — spot check", () => {
  it("given a damage event where currentHp > maxHp, when checking hp-bounds, then returns a violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      {
        type: "damage",
        side: 1,
        pokemon: "charizard",
        currentHp: 200,
        maxHp: 180,
        amount: 0,
        source: "move",
      },
      { type: "battle-end", winner: 0 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkInvariants(events, baseConfig, ["hp-bounds"]);

    // Assert
    expect(violations).toEqual([
      {
        invariant: "hp-bounds",
        severity: "error",
        turnNumber: 1,
        message: "Side 1 pokemon charizard: currentHp=200 out of [0, 180]",
        eventIndex: 2,
      },
    ]);
  });
});

describe("status-type-immunity — spot check", () => {
  it("given the status-type-immunity invariant, when checked, then returns no violations (type data not available in event stream)", () => {
    // The status-type-immunity invariant requires type data not present in PokemonSnapshot.
    // It is stubbed out to return [] until type data is surfaced in events.
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
      { type: "turn-start", turnNumber: 1 },
      {
        type: "switch-in",
        side: 0,
        slot: 0,
        pokemon: {
          speciesId: 6,
          nickname: null,
          level: 50,
          currentHp: 150,
          maxHp: 150,
          status: null,
          gender: "male",
          isShiny: false,
        },
      },
      { type: "status-inflict", side: 0, pokemon: "charizard", status: "brn" },
      { type: "battle-end", winner: 1 },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkInvariants(events, baseConfig, ["status-type-immunity"]);

    // Assert — stubbed invariant returns no violations
    expect(violations).toHaveLength(0);
  });
});
