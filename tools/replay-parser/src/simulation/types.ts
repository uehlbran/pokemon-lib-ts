import type { BattleEvent } from "@pokemon-lib-ts/battle";
import type { ValidationSeverity } from "../replay-types.js";

export interface TeamGeneratorOptions {
  teamSize: number;
  levelRange: [number, number];
  movesPerPokemon: [number, number];
  allowDuplicateSpecies: boolean;
  uidPrefix: string;
}

export type SupportedGeneration = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface BattleRunConfig {
  generation: SupportedGeneration;
  seed: number;
  teamSize: number;
  maxTurns: number;
}

export interface BattleReport {
  seed: number;
  generation: SupportedGeneration;
  winner: 0 | 1 | null;
  turnCount: number;
  events: readonly BattleEvent[];
  timedOut: boolean;
  error: Error | null;
  durationMs: number;
}

export interface InvariantViolation {
  invariant: string;
  severity: ValidationSeverity;
  turnNumber: number | null;
  message: string;
  eventIndex: number;
}

export interface Invariant {
  name: string;
  description: string;
  check(events: readonly BattleEvent[], config: BattleRunConfig): InvariantViolation[];
}

export interface BatchReport {
  config: BattleRunConfig;
  totalBattles: number;
  completed: number;
  timedOut: number;
  crashed: number;
  violations: InvariantViolation[];
  durationMs: number;
}

export interface SimulationResult {
  type: "simulation";
  report: BatchReport;
}
