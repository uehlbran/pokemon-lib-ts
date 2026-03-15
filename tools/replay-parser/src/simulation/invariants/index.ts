export { determinism } from "./determinism.js";
export { effectivenessBounds, effectivenessCorrectness } from "./effectiveness.js";
export { faintAtZero, noPostFaintAction, switchAfterFaint } from "./faint-consistency.js";
export { hpBounds, hpDeltaConsistency, positiveDamage } from "./hp-bounds.js";
export { statusTypeImmunity } from "./status-legality.js";
export { eventFraming, noTimeout, sequentialTurns, singleBattleEnd } from "./structural.js";
export { winnerConsistency } from "./winner-consistency.js";

import type { Invariant } from "../types.js";
import { determinism } from "./determinism.js";
import { effectivenessBounds, effectivenessCorrectness } from "./effectiveness.js";
import { faintAtZero, noPostFaintAction, switchAfterFaint } from "./faint-consistency.js";
import { hpBounds, hpDeltaConsistency, positiveDamage } from "./hp-bounds.js";
import { statusTypeImmunity } from "./status-legality.js";
import { eventFraming, noTimeout, sequentialTurns, singleBattleEnd } from "./structural.js";
import { winnerConsistency } from "./winner-consistency.js";

/** All registered invariants in check order */
export const ALL_INVARIANTS: readonly Invariant[] = [
  eventFraming,
  singleBattleEnd,
  sequentialTurns,
  noTimeout,
  hpBounds,
  positiveDamage,
  hpDeltaConsistency,
  statusTypeImmunity,
  effectivenessBounds,
  effectivenessCorrectness,
  faintAtZero,
  noPostFaintAction,
  switchAfterFaint,
  winnerConsistency,
  determinism,
];
