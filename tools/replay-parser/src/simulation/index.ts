// Public API for the simulation harness

export { runBatch, runBattle } from "./battle-runner.js";
export {
  checkAllInvariants,
  checkInvariants,
  getRegisteredInvariants,
} from "./invariant-checker.js";
export { ALL_INVARIANTS } from "./invariants/index.js";
export { generateRandomTeam } from "./team-generator.js";
export type {
  BatchReport,
  BattleReport,
  BattleRunConfig,
  Invariant,
  InvariantViolation,
  SimulationResult,
  TeamGeneratorOptions,
} from "./types.js";
