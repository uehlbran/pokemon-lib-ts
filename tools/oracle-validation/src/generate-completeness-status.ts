import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { loadDisagreementRegistrySummary } from "./disagreement-registry.js";
import { discoverImplementedGenerations, type ImplementedGeneration } from "./gen-discovery.js";
import { type RunnerOutput, runnerOutputSchema } from "./result-schema.js";
import { getSourceAuthority } from "./source-authority.js";

interface LocalSpecies {
  readonly name: string;
  readonly abilities: {
    readonly special?: string | null;
  };
}

interface LocalMove {
  readonly id: string;
  readonly effect?: {
    readonly type?: string;
    readonly target?: string;
  } | null;
  readonly critRatio?: number;
}

interface LocalItem {
  readonly id: string;
  readonly flingPower?: number;
  readonly flingEffect?: string;
}

interface LocalAbility {
  readonly id: string;
}

interface InventoryBucketSummary {
  readonly oracleTotal: number;
  readonly localTotal: number;
  readonly missingFromLocal: readonly string[];
  readonly localOnly: readonly string[];
}

interface MetadataSummary {
  readonly required: number;
  readonly mismatches: readonly string[];
}

interface GenerationInventorySummary {
  readonly species: InventoryBucketSummary & {
    readonly specialAbility: MetadataSummary;
  };
  readonly moves: InventoryBucketSummary & {
    readonly statChangeTarget: MetadataSummary;
    readonly critRatio: MetadataSummary;
  };
  readonly items: InventoryBucketSummary & {
    readonly flingPower: MetadataSummary;
    readonly flingEffect: MetadataSummary;
  };
  readonly abilities: InventoryBucketSummary;
}

interface GenerationInventoryDetails {
  readonly gen: number;
  readonly packageName: string;
  readonly sourceAuthority: ReturnType<typeof getSourceAuthority>;
  readonly inventory: GenerationInventorySummary;
  readonly blockers: readonly string[];
}

interface CompletenessStatusRecord extends GenerationInventoryDetails {
  readonly fastSuites: Record<string, "pass" | "fail" | "skip" | "missing">;
  readonly complianceSuites: Record<string, "pass" | "fail" | "skip" | "missing">;
  readonly status: "incomplete" | "verified" | "compliant";
}

interface CompletenessStatusOutput {
  readonly timestamp: string;
  readonly fastResultsPath: string | null;
  readonly complianceResultsPath: string | null;
  readonly generations: readonly CompletenessStatusRecord[];
}

const ORACLE_GENERATIONS = new Generations(Dex);

function normalizeId(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function normalizeKebab(value: string): string {
  return value
    .replace(/['']/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function moveIdToKebab(displayName: string): string {
  return displayName
    .replace(/['']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizeOracleMoveInventoryId(showdownId: string, displayName: string): string {
  return canonicalizeMoveInventoryId(
    showdownId === "visegrip" ? "vicegrip" : normalizeId(moveIdToKebab(displayName)),
  );
}

function canonicalizeMoveInventoryId(moveId: string): string {
  if (moveId === "visegrip") {
    return "vicegrip";
  }
  return moveId;
}

function mapExpectedStatChangeTarget(target: string): string {
  return target === "self" || target === "adjacentAllyOrSelf" ? "self" : "foe";
}

function isLocalStatChangeMove(move: LocalMove): boolean {
  return move.effect?.type === "stat-change";
}

function mapExpectedFlingEffect(item: {
  fling?: { status?: string; volatileStatus?: string };
}): string | null {
  if (item.fling?.status) {
    const statuses: Record<string, string> = {
      brn: "burn",
      par: "paralysis",
      psn: "poison",
      tox: "badly-poisoned",
      slp: "sleep",
      frz: "freeze",
    };
    return statuses[item.fling.status] ?? item.fling.status;
  }

  if (item.fling?.volatileStatus) {
    const volatiles: Record<string, string> = {
      confusion: "confusion",
      flinch: "flinch",
      attract: "attract",
      encore: "encore",
      embargo: "embargo",
      healblock: "heal-block",
      ingrain: "ingrain",
      taunt: "taunt",
      telekinesis: "telekinesis",
      torment: "torment",
    };
    return volatiles[item.fling.volatileStatus] ?? item.fling.volatileStatus;
  }

  return null;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function loadRunnerOutput(resultsDir: string, fileName: string): RunnerOutput | null {
  const filePath = join(resultsDir, fileName);
  if (!existsSync(filePath)) {
    return null;
  }

  return runnerOutputSchema.parse(readJson(filePath));
}

function buildInventorySummary(
  oracleIds: readonly string[],
  localIds: readonly string[],
): InventoryBucketSummary {
  const oracleSet = new Set(oracleIds);
  const localSet = new Set(localIds);

  return {
    oracleTotal: oracleIds.length,
    localTotal: localIds.length,
    missingFromLocal: oracleIds.filter((id) => !localSet.has(id)),
    localOnly: localIds.filter((id) => !oracleSet.has(id)),
  };
}

function isDerivedHiddenPowerVariant(moveId: string): boolean {
  return moveId.startsWith("hiddenpower") && moveId !== "hiddenpower";
}

function isTrackableBattleItemGeneration(gen: number): boolean {
  // Gen 1 has no held-item battle surface; stones/balls are bag data, not supported battle items here.
  return gen >= 2;
}

function filterKnownLocalOnlyInventoryIds(
  generation: ImplementedGeneration,
  scope: "species" | "moves" | "items" | "abilities",
  localOnlyIds: readonly string[],
  repoRoot: string,
): string[] {
  const registry = loadDisagreementRegistrySummary(generation, repoRoot);
  const knownIds = new Set(
    registry.knownDisagreements
      .filter(
        (entry) =>
          entry.suite === "data" &&
          entry.id.startsWith(`gen${generation.gen}:data:${scope}:`) &&
          entry.id.endsWith(":exists") &&
          entry.ourValue === true &&
          entry.oracleValue === false,
      )
      .map((entry) => entry.id.split(":")[3])
      .filter((entry): entry is string => Boolean(entry)),
  );

  return localOnlyIds.filter((id) => !knownIds.has(id));
}

function buildGenerationInventory(
  generation: ImplementedGeneration,
  repoRoot: string,
): GenerationInventoryDetails {
  const oracle = ORACLE_GENERATIONS.get(generation.gen);
  const dataDir = generation.dataDir;
  const authority = getSourceAuthority(generation.gen);

  const localSpecies = readJson<LocalSpecies[]>(join(dataDir, "pokemon.json"));
  const localMoves = readJson<LocalMove[]>(join(dataDir, "moves.json"));
  const localItems = readJson<LocalItem[]>(join(dataDir, "items.json"));
  const abilitiesPath = join(dataDir, "abilities.json");
  const localAbilities = existsSync(abilitiesPath) ? readJson<LocalAbility[]>(abilitiesPath) : [];

  const localSpeciesById = new Map(
    localSpecies.map((species) => [normalizeId(species.name), species] as const),
  );
  const localMovesById = new Map(localMoves.map((move) => [normalizeId(move.id), move] as const));
  const localItemsById = new Map(localItems.map((item) => [normalizeId(item.id), item] as const));
  const oracleSpecies = [...oracle.species]
    .filter((species) => species.exists && species.baseSpecies === species.name)
    .map((species) => normalizeId(species.id));
  const supportedOracleMoveIds = [...oracle.moves]
    .filter((move) => move.exists && !move.isNonstandard && !move.isMax && !move.isZ)
    .map((move) => normalizeOracleMoveInventoryId(move.id, move.name))
    .filter((moveId) => !isDerivedHiddenPowerVariant(moveId));
  const oracleMoves = supportedOracleMoveIds;
  const unsupportedOracleMoveIdSet = new Set(
    [...oracle.moves]
      .filter((move) => move.exists && (move.isNonstandard || move.isMax || move.isZ))
      .map((move) => normalizeOracleMoveInventoryId(move.id, move.name))
      .filter((moveId) => !isDerivedHiddenPowerVariant(moveId)),
  );
  const oracleItems = isTrackableBattleItemGeneration(generation.gen)
    ? [...oracle.items]
        .filter((item) => item.exists && !item.isNonstandard)
        .map((item) => normalizeId(normalizeKebab(item.name)))
    : [];
  const oracleAbilities = [...oracle.abilities]
    .filter((ability) => ability.exists && !ability.isNonstandard)
    .map((ability) => normalizeId(normalizeKebab(ability.name)));

  const missingStatChangeTargets: string[] = [];
  const missingCritRatios: string[] = [];
  const missingFlingPower: string[] = [];
  const missingFlingEffect: string[] = [];
  const missingSpecialAbilities: string[] = [];

  for (const move of oracle.moves) {
    if (!move.exists || move.isNonstandard || move.isMax || move.isZ) {
      continue;
    }

    const localMove = localMovesById.get(normalizeId(moveIdToKebab(move.name)));
    if (!localMove) {
      continue;
    }

    if (move.boosts && !move.basePower && isLocalStatChangeMove(localMove)) {
      const actualTarget = localMove.effect?.target ?? null;
      if (actualTarget !== mapExpectedStatChangeTarget(move.target)) {
        missingStatChangeTargets.push(move.id);
      }
    }

    if (typeof move.critRatio === "number" && move.critRatio > 1) {
      if ((localMove.critRatio ?? null) !== move.critRatio - 1) {
        missingCritRatios.push(move.id);
      }
    }
  }

  for (const item of oracle.items) {
    if (generation.gen < 4 || !item.exists || item.isNonstandard || !item.fling) {
      continue;
    }

    const localItem = localItemsById.get(normalizeId(normalizeKebab(item.name)));
    if (!localItem) {
      continue;
    }

    if ((localItem.flingPower ?? null) !== (item.fling.basePower ?? null)) {
      missingFlingPower.push(item.id);
    }

    const expectedFlingEffect = mapExpectedFlingEffect(item);
    if (expectedFlingEffect !== null && (localItem.flingEffect ?? null) !== expectedFlingEffect) {
      missingFlingEffect.push(item.id);
    }
  }

  for (const species of oracle.species) {
    if (!species.exists || species.baseSpecies !== species.name) {
      continue;
    }

    const specialAbility = (species.abilities as { S?: string }).S;
    if (!specialAbility) {
      continue;
    }

    const localSpeciesEntry = localSpeciesById.get(normalizeId(species.id));
    if ((localSpeciesEntry?.abilities.special ?? null) !== normalizeKebab(specialAbility)) {
      missingSpecialAbilities.push(species.id);
    }
  }

  const speciesInventory = {
    ...buildInventorySummary(
      oracleSpecies,
      localSpecies.map((species) => normalizeId(species.name)),
    ),
    localOnly: filterKnownLocalOnlyInventoryIds(
      generation,
      "species",
      buildInventorySummary(
        oracleSpecies,
        localSpecies.map((species) => normalizeId(species.name)),
      ).localOnly,
      repoRoot,
    ),
    specialAbility: {
      required: [...oracle.species].filter((species) => {
        return (
          species.exists &&
          species.baseSpecies === species.name &&
          Boolean((species.abilities as { S?: string }).S)
        );
      }).length,
      mismatches: missingSpecialAbilities.sort(),
    },
  };

  const inventory: GenerationInventorySummary = {
    species: speciesInventory,
    moves: {
      ...{
        ...buildInventorySummary(
          oracleMoves,
          localMoves
            .map((move) => canonicalizeMoveInventoryId(normalizeId(move.id)))
            .filter((moveId) => !isDerivedHiddenPowerVariant(moveId))
            .filter((moveId) => !unsupportedOracleMoveIdSet.has(moveId)),
        ),
        localOnly: filterKnownLocalOnlyInventoryIds(
          generation,
          "moves",
          buildInventorySummary(
            oracleMoves,
            localMoves
              .map((move) => canonicalizeMoveInventoryId(normalizeId(move.id)))
              .filter((moveId) => !isDerivedHiddenPowerVariant(moveId))
              .filter((moveId) => !unsupportedOracleMoveIdSet.has(moveId)),
          ).localOnly,
          repoRoot,
        ),
      },
      statChangeTarget: {
        required: [...oracle.moves].filter((move) => {
          if (
            !move.exists ||
            move.isNonstandard ||
            move.isMax ||
            move.isZ ||
            !move.boosts ||
            move.basePower
          ) {
            return false;
          }
          const localMove = localMovesById.get(normalizeId(moveIdToKebab(move.name)));
          return Boolean(localMove && isLocalStatChangeMove(localMove));
        }).length,
        mismatches: missingStatChangeTargets.sort(),
      },
      critRatio: {
        required: [...oracle.moves].filter(
          (move) =>
            move.exists &&
            !move.isNonstandard &&
            !move.isMax &&
            !move.isZ &&
            typeof move.critRatio === "number" &&
            move.critRatio > 1,
        ).length,
        mismatches: missingCritRatios.sort(),
      },
    },
    items: {
      ...buildInventorySummary(
        oracleItems,
        isTrackableBattleItemGeneration(generation.gen)
          ? localItems.map((item) => normalizeId(item.id))
          : [],
      ),
      flingPower: {
        required:
          generation.gen >= 4
            ? [...oracle.items].filter(
                (item) =>
                  item.exists && !item.isNonstandard && typeof item.fling?.basePower === "number",
              ).length
            : 0,
        mismatches: missingFlingPower.sort(),
      },
      flingEffect: {
        required:
          generation.gen >= 4
            ? [...oracle.items].filter(
                (item) =>
                  item.exists &&
                  !item.isNonstandard &&
                  Boolean(item.fling?.status || item.fling?.volatileStatus),
              ).length
            : 0,
        mismatches: missingFlingEffect.sort(),
      },
    },
    abilities: buildInventorySummary(
      oracleAbilities,
      localAbilities.map((ability) => normalizeId(ability.id)),
    ),
  };

  const blockers: string[] = [];
  for (const [scope, summary] of Object.entries(inventory)) {
    if (summary.missingFromLocal.length > 0) {
      blockers.push(
        `${scope}: ${summary.missingFromLocal.length} oracle entries missing from local data`,
      );
    }
    if (summary.localOnly.length > 0) {
      blockers.push(`${scope}: ${summary.localOnly.length} local entries missing from oracle`);
    }
  }

  if (inventory.moves.statChangeTarget.mismatches.length > 0) {
    blockers.push(
      `moves: ${inventory.moves.statChangeTarget.mismatches.length} status stat-change target mismatches`,
    );
  }
  if (inventory.moves.critRatio.mismatches.length > 0) {
    blockers.push(`moves: ${inventory.moves.critRatio.mismatches.length} crit-ratio mismatches`);
  }
  if (inventory.items.flingPower.mismatches.length > 0) {
    blockers.push(`items: ${inventory.items.flingPower.mismatches.length} fling-power mismatches`);
  }
  if (inventory.items.flingEffect.mismatches.length > 0) {
    blockers.push(
      `items: ${inventory.items.flingEffect.mismatches.length} fling-effect mismatches`,
    );
  }
  if (inventory.species.specialAbility.mismatches.length > 0) {
    blockers.push(
      `species: ${inventory.species.specialAbility.mismatches.length} special-ability mismatches`,
    );
  }

  return {
    gen: generation.gen,
    packageName: generation.packageName,
    sourceAuthority: authority,
    inventory,
    blockers,
  };
}

function getSuiteStatuses(
  output: RunnerOutput | null,
  gen: number,
): Record<string, "pass" | "fail" | "skip" | "missing"> {
  if (!output) {
    return { missing: "missing" };
  }

  const generation = output.generations.find((candidate) => candidate.gen === gen);
  if (!generation) {
    return { missing: "missing" };
  }

  return Object.fromEntries(
    Object.entries(generation.suites).map(([suite, result]) => [suite, result.status]),
  );
}

function allSuitesPassed(statuses: Record<string, "pass" | "fail" | "skip" | "missing">): boolean {
  const values = Object.values(statuses);
  return values.length > 0 && values.every((status) => status === "pass" || status === "skip");
}

function renderMarkdown(output: CompletenessStatusOutput): string {
  const lines = [
    "# Generated Completeness Status",
    "",
    `Generated: ${output.timestamp}`,
    "",
    "Status meanings:",
    "- `incomplete`: inventory drift, oracle failures, or missing proof artifacts remain",
    "- `verified`: fast oracle suites pass and inventory has no known drift blockers",
    "- `compliant`: full compliance suites pass and inventory has no known drift blockers",
    "",
    "| Package | Gen | Status | Fast | Compliance | Blockers | Source Authority |",
    "|---------|-----|--------|------|------------|----------|------------------|",
  ];

  for (const generation of output.generations) {
    const fast = allSuitesPassed(generation.fastSuites) ? "pass" : "missing/fail";
    const compliance = allSuitesPassed(generation.complianceSuites) ? "pass" : "missing/fail";
    const blockers = generation.blockers.length > 0 ? generation.blockers.join("; ") : "none";
    const authority = generation.sourceAuthority.primary.join(" + ");
    lines.push(
      `| ${generation.packageName} | ${generation.gen} | ${generation.status} | ${fast} | ${compliance} | ${blockers} | ${authority} |`,
    );
  }

  lines.push(
    "",
    `Fast oracle results: ${output.fastResultsPath ?? "missing"}`,
    `Compliance results: ${output.complianceResultsPath ?? "missing"}`,
    "Full inventory: `tools/oracle-validation/results/completeness-inventory.json`",
    "",
  );

  return lines.join("\n");
}

function main(): void {
  const repoRoot = resolve(import.meta.dirname ?? __dirname, "../../..");
  const resultsDir = join(repoRoot, "tools", "oracle-validation", "results");
  const fastOutput = loadRunnerOutput(resultsDir, "fast-path.json");
  const complianceOutput = loadRunnerOutput(resultsDir, "compliance.json");
  const generations = discoverImplementedGenerations(repoRoot);

  const statusRecords: CompletenessStatusRecord[] = generations.map((generation) => {
    const inventory = buildGenerationInventory(generation, repoRoot);
    const fastSuites = getSuiteStatuses(fastOutput, generation.gen);
    const complianceSuites = getSuiteStatuses(complianceOutput, generation.gen);
    const blockers = [...inventory.blockers];

    if (!allSuitesPassed(fastSuites)) {
      blockers.push("fast oracle proof missing or failing");
    }

    const status: "incomplete" | "verified" | "compliant" =
      blockers.length > 0
        ? "incomplete"
        : allSuitesPassed(complianceSuites)
          ? "compliant"
          : "verified";

    return {
      ...inventory,
      fastSuites,
      complianceSuites,
      blockers,
      status,
    };
  });

  const statusOutput: CompletenessStatusOutput = {
    timestamp: new Date().toISOString(),
    fastResultsPath: fastOutput ? "tools/oracle-validation/results/fast-path.json" : null,
    complianceResultsPath: complianceOutput
      ? "tools/oracle-validation/results/compliance.json"
      : null,
    generations: statusRecords,
  };

  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(
    join(resultsDir, "completeness-status.json"),
    `${JSON.stringify(statusOutput, null, 2)}\n`,
  );
  writeFileSync(
    join(resultsDir, "completeness-inventory.json"),
    `${JSON.stringify(
      {
        timestamp: statusOutput.timestamp,
        generations: statusRecords.map(({ gen, packageName, sourceAuthority, inventory }) => ({
          gen,
          packageName,
          sourceAuthority,
          inventory,
        })),
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(resultsDir, "completeness-status.md"), `${renderMarkdown(statusOutput)}\n`);
}

main();
