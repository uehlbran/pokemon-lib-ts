import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { GEN_NUMBERS } from "@pokemon-lib-ts/core";
import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

interface LocalSpecies {
  readonly id: number;
  readonly name: string;
  readonly displayName: string;
  readonly types: readonly string[];
  readonly baseStats: Record<string, number>;
}

type LocalTypeChart = Record<string, Record<string, number>>;
interface OracleSpeciesRecord {
  readonly id: string;
  readonly name: string;
  readonly types: readonly string[];
  readonly baseSpecies: string;
}

const ORACLE_GENERATIONS = new Generations(Dex);
const DATA_SUITE_NAME = "data";

function normalizeSpeciesId(id: string): string {
  return id.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function normalizeOracleSpecies(generation: ImplementedGeneration): OracleSpeciesRecord[] {
  const oracle = ORACLE_GENERATIONS.get(generation.gen);
  return [...oracle.species]
    .filter((species) => species.baseSpecies === species.name)
    .map((species) => ({
      id: species.id,
      name: species.name,
      types: species.types.map((type) => type.toLowerCase()),
      baseSpecies: species.baseSpecies,
    }));
}

function buildCheckId(
  generation: ImplementedGeneration,
  scope: string,
  target: string,
  field: string,
): string {
  return `gen${generation.gen}:${DATA_SUITE_NAME}:${scope}:${target}:${field}`;
}

export function runDataSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const failures: string[] = [];
  const notes: string[] = [];
  const oracleChecks: OracleCheck[] = [];

  const localPokemon = JSON.parse(
    readFileSync(join(generation.dataDir, "pokemon.json"), "utf8"),
  ) as LocalSpecies[];
  const localTypeChart = JSON.parse(
    readFileSync(join(generation.dataDir, "type-chart.json"), "utf8"),
  ) as LocalTypeChart;

  const oracle = ORACLE_GENERATIONS.get(generation.gen);
  const oracleSpecies = normalizeOracleSpecies(generation);
  const oracleSpeciesById = new Map(
    oracleSpecies.map((species) => [normalizeSpeciesId(species.id), species] as const),
  );
  const oracleTypeNames = [...oracle.types]
    .map((type) => type.name.toLowerCase())
    .filter((type) => type !== "???");
  const oracleFormCount = [...oracle.species].length - oracleSpecies.length;

  oracleChecks.push({
    id: buildCheckId(generation, "species", "base", "count"),
    suite: DATA_SUITE_NAME,
    description: "Base-species count matches the oracle base-species count",
    ourValue: localPokemon.length,
    oracleValue: oracleSpecies.length,
  });

  for (const species of localPokemon) {
    const oracleSpeciesEntry = oracleSpeciesById.get(normalizeSpeciesId(species.name));
    oracleChecks.push({
      id: buildCheckId(generation, "species", normalizeSpeciesId(species.name), "exists"),
      suite: DATA_SUITE_NAME,
      description: `Species ${species.name} exists in the oracle base-species dataset`,
      ourValue: true,
      oracleValue: oracleSpeciesEntry !== undefined,
    });
    if (!oracleSpeciesEntry) {
      continue;
    }

    const localTypes = [...species.types];
    const oracleTypes = [...oracleSpeciesEntry.types];
    oracleChecks.push({
      id: buildCheckId(generation, "species", normalizeSpeciesId(species.name), "types"),
      suite: DATA_SUITE_NAME,
      description: `Species ${species.name} types match the oracle`,
      ourValue: localTypes,
      oracleValue: oracleTypes,
    });
  }

  const localTypes = Object.keys(localTypeChart).sort();
  const expectedTypeCount =
    generation.gen === GEN_NUMBERS.gen1 ? 15 : generation.gen <= GEN_NUMBERS.gen5 ? 17 : 18;
  if (localTypes.length !== expectedTypeCount) {
    failures.push(
      `Gen ${generation.gen}: type count mismatch (ours=${localTypes.length}, expected=${expectedTypeCount})`,
    );
  }

  const oracleOnlyTypes = oracleTypeNames.filter((type) => !localTypes.includes(type));
  if (oracleOnlyTypes.length > 0) {
    notes.push(`Gen ${generation.gen}: oracle-only types ${oracleOnlyTypes.join(", ")}`);
  }
  if (oracleFormCount > 0) {
    notes.push(
      `Gen ${generation.gen}: ignored ${oracleFormCount} oracle alt-form entries to compare against base-species data`,
    );
  }

  for (const attacker of localTypes) {
    for (const defender of localTypes) {
      const ours = localTypeChart[attacker]?.[defender];
      if (typeof ours !== "number") {
        failures.push(`Gen ${generation.gen}: missing type-chart entry ${attacker} -> ${defender}`);
        continue;
      }

      const oracleAttacker = oracle.types.get(attacker);
      const oracleDefender = oracle.types.get(defender);
      if (!oracleAttacker?.exists || !oracleDefender?.exists) {
        failures.push(
          `Gen ${generation.gen}: oracle missing type metadata for ${attacker} -> ${defender}`,
        );
        continue;
      }
      const oracleValue = oracleAttacker.effectiveness[oracleDefender.name];

      oracleChecks.push({
        id: buildCheckId(generation, "type-chart", `${attacker}-to-${defender}`, "effectiveness"),
        suite: DATA_SUITE_NAME,
        description: `Type effectiveness ${attacker} -> ${defender} matches the oracle`,
        ourValue: ours,
        oracleValue,
      });
    }
  }

  const resolvedOracleChecks = resolveOracleChecks(
    DATA_SUITE_NAME,
    oracleChecks,
    knownDisagreements,
  );
  failures.push(...resolvedOracleChecks.failures);
  notes.push(
    ...resolvedOracleChecks.matchedKnownDisagreements.map(
      (id) => `Known disagreement matched registry: ${id}`,
    ),
  );
  notes.push(
    ...resolvedOracleChecks.staleDisagreements.map((id) => `Stale disagreement detected: ${id}`),
  );

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
    matchedKnownDisagreements: resolvedOracleChecks.matchedKnownDisagreements,
    staleDisagreements: resolvedOracleChecks.staleDisagreements,
    oracleChecks,
  };
}
