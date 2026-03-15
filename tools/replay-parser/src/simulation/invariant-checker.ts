import type { BattleEvent } from "@pokemon-lib-ts/battle";
import { ALL_INVARIANTS } from "./invariants/index.js";
import type { BattleRunConfig, Invariant, InvariantViolation } from "./types.js";

/**
 * Run all registered invariants against a battle event stream.
 * Returns all violations found.
 */
export function checkAllInvariants(
  events: readonly BattleEvent[],
  config: BattleRunConfig,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  for (const invariant of ALL_INVARIANTS) {
    const found = invariant.check(events, config);
    violations.push(...found);
  }
  return violations;
}

/**
 * Run a specific subset of invariants by name.
 */
export function checkInvariants(
  events: readonly BattleEvent[],
  config: BattleRunConfig,
  names: readonly string[],
): InvariantViolation[] {
  const nameSet = new Set(names);
  const selected = ALL_INVARIANTS.filter((inv) => nameSet.has(inv.name));
  const violations: InvariantViolation[] = [];
  for (const invariant of selected) {
    violations.push(...invariant.check(events, config));
  }
  return violations;
}

/**
 * Get the full list of registered invariants (for introspection/reporting).
 */
export function getRegisteredInvariants(): readonly Invariant[] {
  return ALL_INVARIANTS;
}
