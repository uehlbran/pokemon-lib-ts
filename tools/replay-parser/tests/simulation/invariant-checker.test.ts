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
    expect(violations).toHaveLength(0);
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
    const framingViolations = violations.filter((v) => v.invariant === "event-framing");
    expect(framingViolations.length).toBeGreaterThan(0);
  });

  it("given events with only battle-start and no battle-end, when checking all invariants, then returns an event-framing violation", () => {
    // Arrange
    const events = [
      { type: "battle-start", generation: 1, format: "singles" },
    ] as unknown as BattleEvent[];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    const framingViolations = violations.filter((v) => v.invariant === "event-framing");
    expect(framingViolations.length).toBeGreaterThan(0);
  });

  it("given an empty event stream, when checking all invariants, then returns an event-framing violation", () => {
    // Arrange
    const events: BattleEvent[] = [];

    // Act
    const violations = checkAllInvariants(events, baseConfig);

    // Assert
    const framingViolations = violations.filter((v) => v.invariant === "event-framing");
    expect(framingViolations.length).toBeGreaterThan(0);
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
    const singleEndViolations = violations.filter((v) => v.invariant === "single-battle-end");
    expect(singleEndViolations.length).toBeGreaterThan(0);
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
    const seqViolations = violations.filter((v) => v.invariant === "sequential-turns");
    expect(seqViolations.length).toBeGreaterThan(0);
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
    const hpViolations = violations.filter((v) => v.invariant === "hp-bounds");
    expect(hpViolations.length).toBeGreaterThan(0);
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
    const hpViolations = violations.filter((v) => v.invariant === "hp-bounds");
    expect(hpViolations.length).toBeGreaterThan(0);
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
    const dmgViolations = violations.filter((v) => v.invariant === "positive-damage");
    expect(dmgViolations.length).toBeGreaterThan(0);
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
    const hpViolations = violations.filter((v) => v.invariant === "hp-bounds");
    expect(hpViolations).toHaveLength(0);
  });

  it("given an unrecognized invariant name, when checking, then returns empty violations array", () => {
    // Arrange
    const events = makeValidEvents();

    // Act
    const violations = checkInvariants(events, baseConfig, ["does-not-exist"]);

    // Assert
    expect(violations).toHaveLength(0);
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
    expect(invariants).toHaveLength(15);
  });

  it("given the invariant registry, when retrieving all invariants, then each has a name, description, and check function", () => {
    // Act
    const invariants = getRegisteredInvariants();

    // Assert
    for (const inv of invariants) {
      expect(typeof inv.name).toBe("string");
      expect(inv.name.length).toBeGreaterThan(0);
      expect(typeof inv.description).toBe("string");
      expect(inv.description.length).toBeGreaterThan(0);
      expect(typeof inv.check).toBe("function");
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
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.invariant).toBe("hp-bounds");
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
