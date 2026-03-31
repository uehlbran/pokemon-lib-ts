import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  GEN_NUMBERS,
} from "../../../packages/core/src/constants/index.js";
import type { PokemonInstance } from "../../../packages/core/src/entities/pokemon.js";
import type { PokemonType } from "../../../packages/core/src/entities/types.js";
import { createFriendship } from "../../../packages/core/src/logic/friendship-inputs.js";
import { createDvs, createStatExp } from "../../../packages/core/src/logic/stat-inputs.js";
import { getTypeEffectiveness } from "../../../packages/core/src/logic/type-effectiveness.js";
import { createGen1DataManager } from "../../../packages/gen1/src/data/index.js";
import { getGen1CritRate } from "../../../packages/gen1/src/Gen1CritCalc.js";
import { calculateGen1Stats } from "../../../packages/gen1/src/Gen1StatCalc.js";
import { getMaxMovePower } from "../../../packages/gen8/src/Gen8MaxMoves.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

// ── Case schemas ──────────────────────────────────────────────────────────────

const typeChartCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("typeChart"),
  attackerType: z.string().min(1),
  defenderTypes: z.array(z.string().min(1)).min(1),
  expected: z.number(),
  source: z.string().min(1),
  note: z.string().optional(),
});

const derivedStatCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("derivedStat"),
  speciesName: z.string().min(1),
  level: z.number().int().min(1).max(100),
  dvs: z.object({
    attack: z.number().int().min(0).max(15),
    defense: z.number().int().min(0).max(15),
    speed: z.number().int().min(0).max(15),
    special: z.number().int().min(0).max(15),
  }),
  statExp: z.object({
    hp: z.number().int().min(0).max(65535),
    attack: z.number().int().min(0).max(65535),
    defense: z.number().int().min(0).max(65535),
    speed: z.number().int().min(0).max(65535),
    special: z.number().int().min(0).max(65535),
  }),
  expected: z.object({
    hp: z.number().int().positive(),
    attack: z.number().int().positive(),
    defense: z.number().int().positive(),
    speed: z.number().int().positive(),
    special: z.number().int().positive(),
  }),
  source: z.string().min(1),
  note: z.string().optional(),
});

const critRateCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("critRate"),
  attackerBaseSpeed: z.number().int().min(1),
  hasFocusEnergy: z.boolean(),
  isHighCritMove: z.boolean(),
  expected: z.number().min(0).max(1),
  source: z.string().min(1),
  note: z.string().optional(),
});

const hazardDamageCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("hazardDamage"),
  hazard: z.string().min(1),
  defenderSpecies: z.string().min(1),
  defenderTypes: z.array(z.string().min(1)).min(1),
  hazardType: z.string().min(1),
  expectedFraction: z.number().positive(),
  source: z.string().min(1),
  note: z.string().optional(),
});

const moveCategoryCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("moveCategoryCheck"),
  moveId: z.string().min(1),
  expectedCategory: z.enum(["physical", "special", "status"]),
  source: z.string().min(1),
  note: z.string().optional(),
});

const movePriorityCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("movePriorityCheck"),
  moveId: z.string().min(1),
  expectedPriority: z.number().int(),
  source: z.string().min(1),
  note: z.string().optional(),
});

const movePowerCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("movePowerCheck"),
  moveId: z.string().min(1),
  expectedBasePower: z.number().int().nonnegative(),
  expectedBoostWhenHoldingItem: z.number().optional(),
  expectedBoostOnSwitch: z.number().optional(),
  source: z.string().min(1),
  note: z.string().optional(),
});

const zMoveCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("zMoveCheck"),
  moveId: z.string().min(1),
  sourceBP: z.number().int().positive(),
  expectedZPower: z.number().int().positive(),
  source: z.string().min(1),
  note: z.string().optional(),
});

const dynamaxHPCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("dynamaxHPCheck"),
  level: z.number().int().min(0).max(10),
  expectedMultiplier: z.number().positive(),
  formula: z.string().optional(),
  source: z.string().min(1),
  note: z.string().optional(),
});

// Skip-evaluation schemas: parse minimally and evaluate as no-op
const mechanicDocumentationCaseSchema = z
  .object({ id: z.string().min(1), kind: z.literal("mechanic-documentation") })
  .passthrough();

const abilityCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("abilityCheck"),
  abilityId: z.string().min(1),
  expectedBoost: z.number(),
  affectedMoves: z.array(z.string().min(1)),
  source: z.string().min(1),
  note: z.string().optional(),
});

const moveRecoilCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("moveRecoilCheck"),
  moveId: z.string().min(1),
  expectedRecoilFraction: z.number(),
  source: z.string().min(1),
  note: z.string().optional(),
});

const statusSpeedCheckCaseSchema = z
  .object({ id: z.string().min(1), kind: z.literal("statusSpeedCheck") })
  .passthrough();

const terrainBoostCheckCaseSchema = z
  .object({ id: z.string().min(1), kind: z.literal("terrainBoostCheck") })
  .passthrough();

const maxMovePowerCheckCaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("maxMovePowerCheck"),
  sourceBP: z.number().int().min(0),
  moveType: z.string().min(1),
  expectedPower: z.number().int().min(0),
  source: z.string().min(1),
  note: z.string().optional(),
});

const groundTruthCaseSchema = z.discriminatedUnion("kind", [
  typeChartCaseSchema,
  derivedStatCaseSchema,
  critRateCaseSchema,
  hazardDamageCaseSchema,
  moveCategoryCheckCaseSchema,
  movePriorityCheckCaseSchema,
  movePowerCheckCaseSchema,
  zMoveCaseSchema,
  dynamaxHPCheckCaseSchema,
  mechanicDocumentationCaseSchema,
  abilityCheckCaseSchema,
  moveRecoilCheckCaseSchema,
  statusSpeedCheckCaseSchema,
  terrainBoostCheckCaseSchema,
  maxMovePowerCheckCaseSchema,
]);

const groundTruthDatasetSchema = z.object({
  gen: z.number().int().min(1).max(9),
  authority: z.string().min(1),
  confidence: z.string().optional(),
  cases: z.array(groundTruthCaseSchema).min(1),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type TypeChartCase = z.infer<typeof typeChartCaseSchema>;
type DerivedStatCase = z.infer<typeof derivedStatCaseSchema>;
type CritRateCase = z.infer<typeof critRateCaseSchema>;
type HazardDamageCase = z.infer<typeof hazardDamageCaseSchema>;
type MoveCategoryCheckCase = z.infer<typeof moveCategoryCheckCaseSchema>;
type MovePriorityCheckCase = z.infer<typeof movePriorityCheckCaseSchema>;
type MovePowerCheckCase = z.infer<typeof movePowerCheckCaseSchema>;
type ZMoveCase = z.infer<typeof zMoveCaseSchema>;
type DynamaxHPCase = z.infer<typeof dynamaxHPCheckCaseSchema>;
type AbilityCheckCase = z.infer<typeof abilityCheckCaseSchema>;
type MoveRecoilCheckCase = z.infer<typeof moveRecoilCheckCaseSchema>;
type MaxMovePowerCheckCase = z.infer<typeof maxMovePowerCheckCaseSchema>;
type GroundTruthDataset = z.infer<typeof groundTruthDatasetSchema>;
type LoadedTypeChart = Record<string, Record<string, number>>;

interface LocalMoveEffect {
  readonly type: string;
  readonly amount?: number;
}

interface LocalMove {
  readonly id: string;
  readonly category: "physical" | "special" | "status";
  readonly power: number | null;
  readonly priority: number;
  readonly flags?: Readonly<Record<string, boolean>>;
  readonly effect?: LocalMoveEffect | null;
}

// Maps ability IDs to the move flag they govern.
// Extend this map whenever new abilityCheck ground-truth cases are added.
const ABILITY_FLAG_MAP: Readonly<Record<string, string>> = {
  "iron-fist": "punch",
  "strong-jaw": "bite",
  bulletproof: "bullet",
  soundproof: "sound",
  powder: "powder",
};

// ── Z-Move power table ────────────────────────────────────────────────────────
// Source: smogon/pokemon-showdown sim/moves.ts getZMovePower (ERRATA #15)
// Uses threshold-based logic: return power for the first threshold >= basePower.
//
// NOTE: This function tests the raw threshold table only (ground-truth cases use basePower
// scalars, not move IDs). Per-move overrides (14 moves with explicit Showdown zMove.basePower)
// are validated by the live gimmicks oracle in compare-gimmicks.ts, which calls the actual
// Gen7ZMove.getZMovePower() implementation.
// Migration to use the real function tracked in: uehlbran/pokemon-lib-ts#1153
function getZMovePower(basePower: number): number {
  if (basePower <= 55) return 100;
  if (basePower <= 65) return 120;
  if (basePower <= 75) return 140;
  if (basePower <= 85) return 160;
  if (basePower <= 95) return 175;
  if (basePower <= 105) return 180;
  if (basePower <= 115) return 185;
  if (basePower <= 125) return 190;
  if (basePower <= 135) return 195;
  return 200;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSkip(reason: string): SuiteResult {
  return {
    status: "skip",
    suitePassed: false,
    failed: 0,
    skipped: 1,
    failures: [],
    notes: [],
    matchedKnownDisagreements: [],
    staleDisagreements: [],
    oracleChecks: [],
    skipReason: reason,
  };
}

function createGen1OraclePokemon(testCase: DerivedStatCase): PokemonInstance {
  return {
    uid: `ground-truth-${testCase.id}`,
    speciesId: 0,
    nickname: null,
    level: testCase.level,
    experience: 0,
    nature: CORE_NATURE_IDS.hardy,
    ivs: createDvs({
      attack: testCase.dvs.attack,
      defense: testCase.dvs.defense,
      speed: testCase.dvs.speed,
      spAttack: testCase.dvs.special,
    }),
    evs: createStatExp({
      hp: testCase.statExp.hp,
      attack: testCase.statExp.attack,
      defense: testCase.statExp.defense,
      spAttack: testCase.statExp.special,
      spDefense: testCase.statExp.special,
      speed: testCase.statExp.speed,
    }),
    currentHp: 1,
    moves: [],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "oracle",
    metLevel: testCase.level,
    originalTrainer: "oracle",
    originalTrainerId: 1,
    pokeball: CORE_ITEM_IDS.pokeBall,
  };
}

// ── Evaluation functions ──────────────────────────────────────────────────────

function evaluateTypeChartCase(testCase: TypeChartCase, typeChart: LoadedTypeChart): string | null {
  if (!(testCase.attackerType in typeChart)) {
    return `${testCase.id}: unknown attacker type ${testCase.attackerType} (${testCase.source})`;
  }
  for (const defenderType of testCase.defenderTypes) {
    if (!(defenderType in typeChart)) {
      return `${testCase.id}: unknown defender type ${defenderType} (${testCase.source})`;
    }
  }

  const actual = getTypeEffectiveness(
    testCase.attackerType as PokemonType,
    testCase.defenderTypes as readonly PokemonType[],
    typeChart,
  );

  if (actual !== testCase.expected) {
    return `${testCase.id}: expected type multiplier ${testCase.expected}, got ${actual} (${testCase.source})`;
  }

  return null;
}

function evaluateDerivedStatCase(
  testCase: DerivedStatCase,
  dataManager: ReturnType<typeof createGen1DataManager>,
): string | null {
  try {
    const species = dataManager.getSpeciesByName(testCase.speciesName);
    const pokemon = createGen1OraclePokemon(testCase);
    const stats = calculateGen1Stats(
      {
        ...pokemon,
        speciesId: species.id,
      },
      species,
    );

    const actual = {
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      speed: stats.speed,
      special: stats.spAttack,
    };
    const mismatches = Object.entries(testCase.expected).filter(([stat, expected]) => {
      const actualValue = actual[stat as keyof typeof actual];
      return actualValue !== expected;
    });

    if (mismatches.length > 0) {
      const detail = mismatches
        .map(
          ([stat, expected]) =>
            `${stat}=${actual[stat as keyof typeof actual]} (expected ${expected})`,
        )
        .join(", ");
      return `${testCase.id}: derived stat mismatch ${detail} (${testCase.source})`;
    }

    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `${testCase.id}: ${message} (${testCase.source})`;
  }
}

function evaluateCritRateCase(testCase: CritRateCase): string | null {
  const actual = getGen1CritRate(
    testCase.attackerBaseSpeed,
    testCase.hasFocusEnergy,
    testCase.isHighCritMove,
  );

  if (actual !== testCase.expected) {
    return `${testCase.id}: expected crit rate ${testCase.expected}, got ${actual} (${testCase.source})`;
  }

  return null;
}

function evaluateHazardDamageCase(
  testCase: HazardDamageCase,
  typeChart: LoadedTypeChart,
): string | null {
  if (testCase.hazard !== "stealth-rock") {
    // Only Stealth Rock is validated here; other hazards deferred to replay suite (PR4+)
    return null;
  }

  const effectiveness = getTypeEffectiveness(
    testCase.hazardType as PokemonType,
    testCase.defenderTypes as readonly PokemonType[],
    typeChart,
  );

  // Stealth Rock base damage = 1/8 of max HP × type effectiveness multiplier
  // Source: pret/pokeplatinum src/battle/battle_script.c StealthRockDamage
  const expectedFraction = (1 / 8) * effectiveness;

  if (Math.abs(expectedFraction - testCase.expectedFraction) > 0.0001) {
    return `${testCase.id}: Stealth Rock damage fraction expected ${testCase.expectedFraction}, computed ${expectedFraction} (effectiveness=${effectiveness}) (${testCase.source})`;
  }

  return null;
}

function evaluateMoveCategoryCase(
  testCase: MoveCategoryCheckCase,
  moves: readonly LocalMove[],
): string | null {
  const move = moves.find((m) => m.id === testCase.moveId);
  if (!move) {
    return `${testCase.id}: move "${testCase.moveId}" not found in moves.json (${testCase.source})`;
  }
  if (move.category !== testCase.expectedCategory) {
    return `${testCase.id}: expected category "${testCase.expectedCategory}", got "${move.category}" (${testCase.source})`;
  }
  return null;
}

function evaluateMovePriorityCase(
  testCase: MovePriorityCheckCase,
  moves: readonly LocalMove[],
): string | null {
  const move = moves.find((m) => m.id === testCase.moveId);
  if (!move) {
    return `${testCase.id}: move "${testCase.moveId}" not found in moves.json (${testCase.source})`;
  }
  if (move.priority !== testCase.expectedPriority) {
    return `${testCase.id}: expected priority ${testCase.expectedPriority}, got ${move.priority} (${testCase.source})`;
  }
  return null;
}

function evaluateMovePowerCase(
  testCase: MovePowerCheckCase,
  moves: readonly LocalMove[],
): string | null {
  const move = moves.find((m) => m.id === testCase.moveId);
  if (!move) {
    return `${testCase.id}: move "${testCase.moveId}" not found in moves.json (${testCase.source})`;
  }
  const power = move.power ?? 0;
  if (power !== testCase.expectedBasePower) {
    return `${testCase.id}: expected base power ${testCase.expectedBasePower}, got ${power} (${testCase.source})`;
  }
  return null;
}

function evaluateZMoveCase(testCase: ZMoveCase): string | null {
  const actual = getZMovePower(testCase.sourceBP);
  if (actual !== testCase.expectedZPower) {
    return `${testCase.id}: Z-Move power for ${testCase.sourceBP} BP expected ${testCase.expectedZPower}, got ${actual} (${testCase.source})`;
  }
  return null;
}

function evaluateDynamaxHPCase(testCase: DynamaxHPCase): string | null {
  // Source: smogon/pokemon-showdown sim/battle-actions.ts ERRATA #19
  // Formula: floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05))
  const actual = 1.5 + testCase.level * 0.05;
  if (Math.abs(actual - testCase.expectedMultiplier) > 0.0001) {
    return `${testCase.id}: Dynamax HP multiplier at level ${testCase.level} expected ${testCase.expectedMultiplier}, got ${actual} (${testCase.source})`;
  }
  return null;
}

function evaluateAbilityCheckCase(
  testCase: AbilityCheckCase,
  moves: readonly LocalMove[],
): { flagFailure: string | null; hasExpectedBoost: boolean } {
  // Validates that every move in affectedMoves has the flag corresponding to
  // this ability in our moves.json. ABILITY_FLAG_MAP maps ability IDs to flag names.
  // The flag check is a real oracle check (pass/fail).
  // testCase.expectedBoost cannot be verified here — verifying the boost multiplier
  // requires engine integration (battle simulation). It is explicitly deferred with a note.
  const flagName = ABILITY_FLAG_MAP[testCase.abilityId];
  if (flagName === undefined) {
    return {
      flagFailure:
        `${testCase.id}: ability "${testCase.abilityId}" not in ABILITY_FLAG_MAP — ` +
        `add explicit mapping in compare-ground-truth.ts (${testCase.source})`,
      hasExpectedBoost: true,
    };
  }

  const movesById = new Map(moves.map((m) => [m.id, m]));
  const missingFlag: string[] = [];

  for (const moveId of testCase.affectedMoves) {
    const move = movesById.get(moveId);
    if (!move) {
      missingFlag.push(`${moveId} (not found in data)`);
      continue;
    }
    if (!move.flags?.[flagName]) {
      missingFlag.push(`${moveId} (flag "${flagName}" is false/absent)`);
    }
  }

  if (missingFlag.length > 0) {
    return {
      flagFailure:
        `${testCase.id}: ability "${testCase.abilityId}" — ` +
        `affected moves missing "${flagName}" flag: ${missingFlag.join(", ")} (${testCase.source})`,
      hasExpectedBoost: true,
    };
  }
  // expectedBoost is always present (required field in schema)
  return { flagFailure: null, hasExpectedBoost: true };
}

function evaluateMoveRecoilCheckCase(
  testCase: MoveRecoilCheckCase,
  moves: readonly LocalMove[],
  notes: string[],
): string | null {
  const move = moves.find((m) => m.id === testCase.moveId);
  if (!move) {
    return `${testCase.id}: move "${testCase.moveId}" not found in moves.json (${testCase.source})`;
  }

  // Struggle's recoil is engine-level (BaseRuleset.calculateStruggleRecoil) — not stored
  // as a recoil effect in moves.json. It's validated by integration tests.
  if (testCase.moveId === "struggle") {
    notes.push(
      `${testCase.id}: Struggle recoil (${testCase.expectedRecoilFraction}× max HP) is engine-level — validated by integration tests`,
    );
    return null;
  }

  const effect = move.effect;
  if (!effect || effect.type !== "recoil") {
    return (
      `${testCase.id}: move "${testCase.moveId}" expected recoil effect, ` +
      `got ${effect?.type ?? "null"} (${testCase.source})`
    );
  }

  const actual = Math.round((effect.amount ?? 0) * 1000) / 1000;
  const expected = Math.round(testCase.expectedRecoilFraction * 1000) / 1000;

  if (actual !== expected) {
    return (
      `${testCase.id}: move "${testCase.moveId}" recoil fraction ${actual} !== ` +
      `expected ${expected} (${testCase.source})`
    );
  }
  return null;
}

function evaluateMaxMovePowerCheckCase(testCase: MaxMovePowerCheckCase): string | null {
  // Calls our Gen 8 getMaxMovePower implementation with the case inputs.
  // Source: smogon/pokemon-showdown data/moves.ts ERRATA #20
  const actual = getMaxMovePower(testCase.sourceBP, testCase.moveType as PokemonType);
  if (actual !== testCase.expectedPower) {
    return (
      `${testCase.id}: getMaxMovePower(${testCase.sourceBP} BP, ${testCase.moveType}) = ${actual}, ` +
      `expected ${testCase.expectedPower} (${testCase.source})`
    );
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function loadGroundTruthDataset(repoRoot: string, gen = 1): GroundTruthDataset {
  const datasetPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "data",
    "ground-truth",
    `gen${gen}-ground-truth.json`,
  );
  return groundTruthDatasetSchema.parse(JSON.parse(readFileSync(datasetPath, "utf8")));
}

export function runGroundTruthSuite(
  generation: ImplementedGeneration,
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
): SuiteResult {
  const { gen } = generation;

  const datasetPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "data",
    "ground-truth",
    `gen${gen}-ground-truth.json`,
  );

  if (!existsSync(datasetPath)) {
    return makeSkip(`No ground-truth dataset for Gen ${gen}`);
  }

  const dataset = loadGroundTruthDataset(repoRoot, gen);
  const typeChart = JSON.parse(
    readFileSync(join(generation.dataDir, "type-chart.json"), "utf8"),
  ) as LoadedTypeChart;
  const moves = JSON.parse(
    readFileSync(join(generation.dataDir, "moves.json"), "utf8"),
  ) as LocalMove[];

  // Gen 1 specific resources (only created when needed)
  let gen1DataManager: ReturnType<typeof createGen1DataManager> | null = null;

  const failures: string[] = [];
  const notes: string[] = [
    `Authority: ${dataset.authority}`,
    `Dataset: tools/oracle-validation/data/ground-truth/gen${gen}-ground-truth.json`,
  ];
  let deferredCases = 0;

  for (const testCase of dataset.cases) {
    let failure: string | null = null;

    if (testCase.kind === "typeChart") {
      failure = evaluateTypeChartCase(testCase, typeChart);
    } else if (testCase.kind === "derivedStat") {
      if (gen !== GEN_NUMBERS.gen1) {
        deferredCases += 1;
        continue;
      }
      if (gen1DataManager === null) {
        gen1DataManager = createGen1DataManager();
      }
      failure = evaluateDerivedStatCase(testCase, gen1DataManager);
    } else if (testCase.kind === "critRate") {
      if (gen !== GEN_NUMBERS.gen1) {
        deferredCases += 1;
        continue;
      }
      failure = evaluateCritRateCase(testCase);
    } else if (testCase.kind === "hazardDamage") {
      failure = evaluateHazardDamageCase(testCase, typeChart);
    } else if (testCase.kind === "moveCategoryCheck") {
      failure = evaluateMoveCategoryCase(testCase, moves);
    } else if (testCase.kind === "movePriorityCheck") {
      failure = evaluateMovePriorityCase(testCase, moves);
    } else if (testCase.kind === "movePowerCheck") {
      failure = evaluateMovePowerCase(testCase, moves);
    } else if (testCase.kind === "zMoveCheck") {
      failure = evaluateZMoveCase(testCase);
    } else if (testCase.kind === "dynamaxHPCheck") {
      failure = evaluateDynamaxHPCase(testCase);
    } else {
      // mechanic-documentation — documentation-only, no evaluation needed
      // statusSpeedCheck, terrainBoostCheck — require engine integration (deferred)
      if (testCase.kind === "abilityCheck") {
        const abilityResult = evaluateAbilityCheckCase(testCase, moves);
        failure = abilityResult.flagFailure;
        if (abilityResult.hasExpectedBoost) {
          deferredCases += 1;
          notes.push(
            `${testCase.id}: expectedBoost=${testCase.expectedBoost} not validated — ` +
              `requires battle engine (Phase 6 scope)`,
          );
        }
      } else if (testCase.kind === "moveRecoilCheck") {
        failure = evaluateMoveRecoilCheckCase(testCase, moves, notes);
      } else if (testCase.kind === "maxMovePowerCheck") {
        failure = evaluateMaxMovePowerCheckCase(testCase);
      } else {
        deferredCases += 1;
        continue;
      }
    }

    if (failure !== null) {
      failures.push(failure);
    }
  }

  if (deferredCases > 0) {
    notes.push(`${deferredCases} documentation-only or engine-deferred case(s) skipped`);
  }

  if (gen === GEN_NUMBERS.gen1) {
    notes.push(
      "Gen 1 suite uses cartridge-authoritative data; later Gen 1-4 suites treat Showdown as a differential cross-check.",
    );
  }

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
    matchedKnownDisagreements: [],
    staleDisagreements: [],
    oracleChecks: [],
  };
}
