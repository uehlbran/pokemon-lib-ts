import type { BattleEvent } from "@pokemon-lib-ts/battle";
import type { Invariant, InvariantViolation } from "../types.js";

/** Invariant 16: Same seed produces identical event stream */
export const determinism: Invariant = {
  name: "determinism",
  description: "Running the same battle seed twice must produce identical events",
  check(_events, _config) {
    // This invariant is checked specially by runBatch in determinism mode.
    // When called directly, it always passes (the runner handles the two-run comparison).
    return [];
  },
};

/**
 * Compare two event streams for equality. Returns violations if they differ.
 */
export function checkDeterminism(
  events1: readonly BattleEvent[],
  events2: readonly BattleEvent[],
  seed: number,
): InvariantViolation[] {
  if (events1.length !== events2.length) {
    return [
      {
        invariant: "determinism",
        severity: "error",
        turnNumber: null,
        message: `Seed ${seed}: run 1 produced ${events1.length} events, run 2 produced ${events2.length} events`,
        eventIndex: 0,
      },
    ];
  }
  for (let i = 0; i < events1.length; i++) {
    const a = JSON.stringify(events1[i]);
    const b = JSON.stringify(events2[i]);
    if (a !== b) {
      return [
        {
          invariant: "determinism",
          severity: "error",
          turnNumber: null,
          message: `Seed ${seed}: events diverge at index ${i}: ${a} vs ${b}`,
          eventIndex: i,
        },
      ];
    }
  }
  return [];
}
