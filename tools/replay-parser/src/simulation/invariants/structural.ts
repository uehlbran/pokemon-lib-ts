import type { BattleEvent } from "@pokemon-lib-ts/battle";
import { BATTLE_EVENT_TYPES } from "@pokemon-lib-ts/battle";
import type { Invariant, InvariantViolation } from "../types.js";

// Helper
function violation(
  invariant: string,
  message: string,
  eventIndex: number,
  turnNumber: number | null = null,
): InvariantViolation {
  return { invariant, severity: "error", turnNumber, message, eventIndex };
}

/** Invariant 1: First event = battle-start, last event = battle-end */
export const eventFraming: Invariant = {
  name: "event-framing",
  description: "First event must be battle-start and last must be battle-end",
  check(events, _config) {
    const violations: InvariantViolation[] = [];
    if (events.length === 0) {
      violations.push(violation("event-framing", "Event stream is empty", 0));
      return violations;
    }
    if (events[0]?.type !== BATTLE_EVENT_TYPES.battleStart) {
      violations.push(
        violation(
          "event-framing",
          `First event is "${events[0]?.type}", expected "battle-start"`,
          0,
        ),
      );
    }
    if (events[events.length - 1]?.type !== BATTLE_EVENT_TYPES.battleEnd) {
      violations.push(
        violation(
          "event-framing",
          `Last event is "${events[events.length - 1]?.type}", expected "battle-end"`,
          events.length - 1,
        ),
      );
    }
    return violations;
  },
};

/** Invariant 2: Exactly one battle-end event */
export const singleBattleEnd: Invariant = {
  name: "single-battle-end",
  description: "Exactly one battle-end event must appear in the stream",
  check(events, _config) {
    const count = events.filter((e) => e.type === BATTLE_EVENT_TYPES.battleEnd).length;
    if (count !== 1) {
      return [
        violation(
          "single-battle-end",
          `Expected exactly 1 battle-end event, found ${count}`,
          events.length - 1,
        ),
      ];
    }
    return [];
  },
};

/** Invariant 3: turn-start.turnNumber increments by 1 each time */
export const sequentialTurns: Invariant = {
  name: "sequential-turns",
  description: "turn-start events must have incrementing turnNumber starting at 1",
  check(events, _config) {
    const violations: InvariantViolation[] = [];
    let expectedTurn = 1;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event?.type === BATTLE_EVENT_TYPES.turnStart) {
        const e = event as Extract<BattleEvent, { type: "turn-start" }>;
        if (e.turnNumber !== expectedTurn) {
          violations.push(
            violation(
              "sequential-turns",
              `Turn ${e.turnNumber} out of order, expected ${expectedTurn}`,
              i,
              e.turnNumber,
            ),
          );
        }
        expectedTurn = e.turnNumber + 1;
      }
    }
    return violations;
  },
};

/** Invariant 4: Battle ends within maxTurns */
export const noTimeout: Invariant = {
  name: "no-timeout",
  description: "Battle must end within maxTurns turns",
  check(events, config) {
    const turnStarts = events.filter((e) => e.type === BATTLE_EVENT_TYPES.turnStart).length;
    const battleEnded = events.some((e) => e.type === BATTLE_EVENT_TYPES.battleEnd);
    if (!battleEnded && turnStarts >= config.maxTurns) {
      return [
        {
          invariant: "no-timeout",
          severity: "warning",
          turnNumber: turnStarts,
          message: `Battle exceeded ${config.maxTurns} turns without ending (potential infinite loop)`,
          eventIndex: events.length - 1,
        },
      ];
    }
    return [];
  },
};
