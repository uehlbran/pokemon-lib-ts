/**
 * Edge Case Scenario Suite
 *
 * Wires per-generation edge-case scenario files to oracle checks.
 * Each gen has a JSON file at data/edge-case-scenarios/genN-edge-cases.json.
 *
 * Evaluable checks (no battle engine required):
 *   - expected_category         move category lookup from local moves.json
 *   - expected_priority         move priority lookup from local moves.json
 *   - expectedZPower            Gen 7 Z-Move power via getZMovePower()
 *   - expectedHPMultiplier      Gen 8 Dynamax HP formula: 1.5 + dynamaxLevel × 0.05
 *   - expectedMaxMovePower      Gen 8 Max Move power via getMaxMovePower()
 *   - expected_type_effectiveness / expectedEffectiveness  type chart lookup
 *   - expected_damage (fixed)   fixed-damage effect.damage from local moves.json
 *
 * Deferred (engine-level or covered by other suites):
 *   - type: "mechanic-documentation"  explicit documentation entries
 *   - expectedBoost (terrain)         covered by terrain suite
 *   - all remaining scenarios         no recognised evaluable field
 *
 * Source authority: per-scenario `authority` field in each JSON file.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MoveData } from "@pokemon-lib-ts/core";
import { GEN_NUMBERS } from "@pokemon-lib-ts/core";
import type { PokemonType } from "../../../packages/core/src/entities/types.js";
import { getZMovePower } from "../../../packages/gen7/src/Gen7ZMove.js";
import { getMaxMovePower } from "../../../packages/gen8/src/Gen8MaxMoves.js";
import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUITE_NAME = "edge-cases";
const SCENARIO_DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/edge-case-scenarios",
);

// ── Scenario types ────────────────────────────────────────────────────────────

interface EdgeCaseDefender {
  readonly species?: string;
  readonly types?: readonly string[];
}

interface EdgeCaseScenario {
  readonly id: string;
  readonly description: string;
  readonly type?: string;
  readonly move?: string;
  readonly defender?: EdgeCaseDefender;
  // evaluable fields
  readonly expected_category?: string;
  readonly expected_priority?: number;
  readonly expectedZPower?: number;
  readonly sourceBP?: number;
  readonly expectedHPMultiplier?: number;
  readonly dynamaxLevel?: number;
  readonly expectedMaxMovePower?: number;
  readonly maxMoveType?: string;
  readonly expected_type_effectiveness?: number;
  readonly expectedEffectiveness?: number;
  readonly expected_damage?: number;
  // terrain — covered by terrain suite
  readonly expectedBoost?: number;
  readonly terrain?: string;
}

interface EdgeCaseFile {
  readonly gen: number;
  readonly authority: string;
  readonly scenarios: readonly EdgeCaseScenario[];
}

// ── Local data types ──────────────────────────────────────────────────────────

interface LocalMoveEffect {
  readonly type: string;
  readonly damage?: number;
  readonly min?: number;
  readonly max?: number;
}

interface LocalMove {
  readonly id: string;
  readonly type: string;
  readonly category: "physical" | "special" | "status";
  readonly power: number | null;
  readonly priority: number;
  readonly effect: LocalMoveEffect | null;
}

interface LocalSpecies {
  readonly name: string;
  readonly types: readonly string[];
}

type LocalTypeChart = Record<string, Record<string, number>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeId(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function buildCheckId(gen: number, scenarioId: string, field: string): string {
  return `gen${gen}:${SUITE_NAME}:${scenarioId}:${field}`;
}

// ── Evaluators ────────────────────────────────────────────────────────────────

/**
 * Returns true if the scenario has this evaluable field (whether or not data was found).
 */
function evaluateMoveCategory(
  scenario: EdgeCaseScenario,
  movesById: Map<string, LocalMove>,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  if (scenario.expected_category === undefined || !scenario.move) return false;
  const localMove = movesById.get(normalizeId(scenario.move));
  if (localMove) {
    oracleChecks.push({
      id: buildCheckId(gen, scenario.id, "category"),
      suite: SUITE_NAME,
      description: `${scenario.description} — move category`,
      ourValue: localMove.category,
      oracleValue: scenario.expected_category,
    });
  }
  return true;
}

function evaluateMovePriority(
  scenario: EdgeCaseScenario,
  movesById: Map<string, LocalMove>,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  if (scenario.expected_priority === undefined || !scenario.move) return false;
  const localMove = movesById.get(normalizeId(scenario.move));
  if (localMove) {
    oracleChecks.push({
      id: buildCheckId(gen, scenario.id, "priority"),
      suite: SUITE_NAME,
      description: `${scenario.description} — move priority`,
      ourValue: localMove.priority,
      oracleValue: scenario.expected_priority,
    });
  }
  return true;
}

function evaluateZPower(
  scenario: EdgeCaseScenario,
  movesById: Map<string, LocalMove>,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  if (scenario.expectedZPower === undefined || scenario.sourceBP === undefined) return false;
  if (gen !== GEN_NUMBERS.gen7) return false;

  // Build a MoveData shim using the local move if available, else from scenario fields.
  const moveId = scenario.move ? normalizeId(scenario.move) : "";
  const localMove = moveId ? movesById.get(moveId) : undefined;

  const moveShim = {
    id: localMove?.id ?? scenario.move ?? "unknown",
    category: localMove?.category ?? ("physical" as const),
    power: scenario.sourceBP,
    effect: localMove?.effect ?? null,
  } as unknown as MoveData;

  const ourZPower = getZMovePower(moveShim);

  oracleChecks.push({
    id: buildCheckId(gen, scenario.id, "z-power"),
    suite: SUITE_NAME,
    description: `${scenario.description} — Z-Move power`,
    ourValue: ourZPower,
    oracleValue: scenario.expectedZPower,
  });
  return true;
}

function evaluateHPMultiplier(
  scenario: EdgeCaseScenario,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  if (scenario.expectedHPMultiplier === undefined || scenario.dynamaxLevel === undefined)
    return false;
  if (gen !== GEN_NUMBERS.gen8) return false;

  // Formula: 1.5 + dynamaxLevel × 0.05 (ERRATA #19)
  // Source: Showdown data/conditions.ts — Dynamax HP multiplier
  const ourMultiplier = 1.5 + scenario.dynamaxLevel * 0.05;

  oracleChecks.push({
    id: buildCheckId(gen, scenario.id, "hp-multiplier"),
    suite: SUITE_NAME,
    description: `${scenario.description} — Dynamax HP multiplier`,
    ourValue: ourMultiplier,
    oracleValue: scenario.expectedHPMultiplier,
  });
  return true;
}

function evaluateMaxMovePower(
  scenario: EdgeCaseScenario,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  if (
    scenario.expectedMaxMovePower === undefined ||
    scenario.sourceBP === undefined ||
    !scenario.maxMoveType
  ) {
    return false;
  }
  if (gen !== GEN_NUMBERS.gen8) return false;

  const ourPower = getMaxMovePower(scenario.sourceBP, scenario.maxMoveType as PokemonType);

  oracleChecks.push({
    id: buildCheckId(gen, scenario.id, "max-move-power"),
    suite: SUITE_NAME,
    description: `${scenario.description} — Max Move power`,
    ourValue: ourPower,
    oracleValue: scenario.expectedMaxMovePower,
  });
  return true;
}

function evaluateTypeEffectiveness(
  scenario: EdgeCaseScenario,
  movesById: Map<string, LocalMove>,
  speciesById: Map<string, LocalSpecies>,
  typeChart: LocalTypeChart,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  const expected = scenario.expected_type_effectiveness ?? scenario.expectedEffectiveness;
  if (expected === undefined || !scenario.move) return false;

  const localMove = movesById.get(normalizeId(scenario.move));
  if (!localMove) return true; // field present but move not in this gen — handled

  // Resolve defender types: explicit types field takes priority over species lookup.
  let defenderTypes: readonly string[];
  if (scenario.defender?.types) {
    defenderTypes = scenario.defender.types;
  } else if (scenario.defender?.species) {
    const localSpecies = speciesById.get(normalizeId(scenario.defender.species));
    if (!localSpecies) return true; // field present but species not found — handled
    defenderTypes = localSpecies.types;
  } else {
    return true; // field present but no defender info — handled (cannot evaluate)
  }

  const attackType = localMove.type;
  let effectiveness = 1;
  for (const defType of defenderTypes) {
    effectiveness *= typeChart[attackType]?.[defType] ?? 1;
  }

  oracleChecks.push({
    id: buildCheckId(gen, scenario.id, "type-effectiveness"),
    suite: SUITE_NAME,
    description: `${scenario.description} — type effectiveness`,
    ourValue: effectiveness,
    oracleValue: expected,
  });
  return true;
}

function evaluateFixedDamage(
  scenario: EdgeCaseScenario,
  movesById: Map<string, LocalMove>,
  gen: number,
  oracleChecks: OracleCheck[],
): boolean {
  if (scenario.expected_damage === undefined || !scenario.move) return false;

  const localMove = movesById.get(normalizeId(scenario.move));
  if (!localMove) return true; // field present but move not in gen — handled

  // Only validate fixed-damage moves (level-damage depends on attacker level → engine-level).
  if (localMove.effect?.type !== "fixed-damage") return true;

  const storedDamage = localMove.effect.damage;
  if (storedDamage === undefined) return true;

  oracleChecks.push({
    id: buildCheckId(gen, scenario.id, "fixed-damage"),
    suite: SUITE_NAME,
    description: `${scenario.description} — fixed damage value`,
    ourValue: storedDamage,
    oracleValue: scenario.expected_damage,
  });
  return true;
}

// ── Main suite ─────────────────────────────────────────────────────────────────

export function runEdgeCasesSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const gen = generation.gen;

  const edgeCases = JSON.parse(
    readFileSync(join(SCENARIO_DATA_DIR, `gen${gen}-edge-cases.json`), "utf8"),
  ) as EdgeCaseFile;

  const localMoves = JSON.parse(
    readFileSync(join(generation.dataDir, "moves.json"), "utf8"),
  ) as LocalMove[];
  const movesById = new Map(localMoves.map((m) => [normalizeId(m.id), m]));

  const localPokemon = JSON.parse(
    readFileSync(join(generation.dataDir, "pokemon.json"), "utf8"),
  ) as LocalSpecies[];
  const speciesById = new Map(localPokemon.map((s) => [normalizeId(s.name), s]));

  const typeChart = JSON.parse(
    readFileSync(join(generation.dataDir, "type-chart.json"), "utf8"),
  ) as LocalTypeChart;

  const oracleChecks: OracleCheck[] = [];
  const notes: string[] = [];
  let deferredCount = 0;

  for (const scenario of edgeCases.scenarios) {
    // Documentation-only → skip
    if (scenario.type === "mechanic-documentation") {
      deferredCount += 1;
      continue;
    }

    // Terrain boost scenarios → covered by terrain suite → skip
    if (scenario.expectedBoost !== undefined && scenario.terrain !== undefined) {
      deferredCount += 1;
      continue;
    }

    const handled =
      evaluateMoveCategory(scenario, movesById, gen, oracleChecks) ||
      evaluateMovePriority(scenario, movesById, gen, oracleChecks) ||
      evaluateZPower(scenario, movesById, gen, oracleChecks) ||
      evaluateHPMultiplier(scenario, gen, oracleChecks) ||
      evaluateMaxMovePower(scenario, gen, oracleChecks) ||
      evaluateTypeEffectiveness(scenario, movesById, speciesById, typeChart, gen, oracleChecks) ||
      evaluateFixedDamage(scenario, movesById, gen, oracleChecks);

    if (!handled) {
      deferredCount += 1;
    }
  }

  const totalScenarios = edgeCases.scenarios.length;
  const evaluatedChecks = oracleChecks.length;

  // Report deferred count in notes (schema forbids skipped > 0 for pass/fail status).
  if (deferredCount > 0) {
    notes.push(
      `Gen ${gen}: ${deferredCount} scenario${deferredCount === 1 ? "" : "s"} deferred ` +
        `(mechanic-documentation or engine-level — no static check possible)`,
    );
  }
  notes.push(
    `Gen ${gen}: evaluated ${evaluatedChecks} oracle check${evaluatedChecks === 1 ? "" : "s"} ` +
      `from ${totalScenarios} scenario${totalScenarios === 1 ? "" : "s"} (authority: ${edgeCases.authority})`,
  );

  const resolved = resolveOracleChecks(SUITE_NAME, oracleChecks, knownDisagreements);
  const failures = [...resolved.failures];
  notes.push(
    ...resolved.matchedKnownDisagreements.map((id) => `Known disagreement matched registry: ${id}`),
  );
  notes.push(...resolved.staleDisagreements.map((id) => `Stale disagreement detected: ${id}`));

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
    matchedKnownDisagreements: resolved.matchedKnownDisagreements,
    staleDisagreements: resolved.staleDisagreements,
    oracleChecks,
  };
}
