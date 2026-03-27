import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
} from "../../../packages/core/src/constants/index.js";
import type { PokemonInstance } from "../../../packages/core/src/entities/pokemon.js";
import type { PokemonType } from "../../../packages/core/src/entities/types.js";
import { createFriendship } from "../../../packages/core/src/logic/friendship-inputs.js";
import { createDvs, createStatExp } from "../../../packages/core/src/logic/stat-inputs.js";
import { getTypeEffectiveness } from "../../../packages/core/src/logic/type-effectiveness.js";
import { createGen1DataManager } from "../../../packages/gen1/src/data/index.js";
import { getGen1CritRate } from "../../../packages/gen1/src/Gen1CritCalc.js";
import { calculateGen1Stats } from "../../../packages/gen1/src/Gen1StatCalc.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

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

const groundTruthCaseSchema = z.discriminatedUnion("kind", [
  typeChartCaseSchema,
  derivedStatCaseSchema,
  critRateCaseSchema,
]);

const groundTruthDatasetSchema = z.object({
  gen: z.literal(1),
  authority: z.string().min(1),
  cases: z.array(groundTruthCaseSchema).min(1),
});

type TypeChartCase = z.infer<typeof typeChartCaseSchema>;
type DerivedStatCase = z.infer<typeof derivedStatCaseSchema>;
type CritRateCase = z.infer<typeof critRateCaseSchema>;
type GroundTruthCase = z.infer<typeof groundTruthCaseSchema>;
type GroundTruthDataset = z.infer<typeof groundTruthDatasetSchema>;

function makeSkip(reason: string): SuiteResult {
  return {
    status: "skip",
    suitePassed: false,
    failed: 0,
    skipped: 1,
    failures: [],
    notes: [],
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

export function loadGroundTruthDataset(repoRoot: string): GroundTruthDataset {
  const datasetPath = join(
    repoRoot,
    "tools",
    "oracle-validation",
    "data",
    "ground-truth",
    "gen1-ground-truth.json",
  );
  return groundTruthDatasetSchema.parse(JSON.parse(readFileSync(datasetPath, "utf8")));
}

function evaluateTypeChartCase(
  testCase: TypeChartCase,
  generation: ImplementedGeneration,
): string | null {
  const typeChart = JSON.parse(
    readFileSync(join(generation.dataDir, "type-chart.json"), "utf8"),
  ) as Record<string, Record<string, number>>;
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

function evaluateDerivedStatCase(testCase: DerivedStatCase): string | null {
  const dataManager = createGen1DataManager();
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

function evaluateCase(testCase: GroundTruthCase, generation: ImplementedGeneration): string | null {
  if (testCase.kind === "typeChart") {
    return evaluateTypeChartCase(testCase, generation);
  }
  if (testCase.kind === "derivedStat") {
    return evaluateDerivedStatCase(testCase);
  }
  return evaluateCritRateCase(testCase);
}

export function runGroundTruthSuite(
  generation: ImplementedGeneration,
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.."),
): SuiteResult {
  if (generation.gen !== 1) {
    return makeSkip("Ground-truth dataset only implemented for Gen 1 in the initial oracle slice");
  }

  const dataset = loadGroundTruthDataset(repoRoot);
  const failures = dataset.cases
    .map((testCase) => evaluateCase(testCase, generation))
    .filter((failure): failure is string => failure !== null);

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes: [
      `Authority: ${dataset.authority}`,
      `Dataset: tools/oracle-validation/data/ground-truth/gen1-ground-truth.json`,
      "Gen 1 suite uses cartridge-authoritative data; later Gen 1-4 suites should treat Showdown as a differential cross-check.",
    ],
  };
}
