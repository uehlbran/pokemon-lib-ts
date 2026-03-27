import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
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

export function runDataSuite(generation: ImplementedGeneration): SuiteResult {
  const failures: string[] = [];
  const notes: string[] = [];

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

  if (localPokemon.length !== oracleSpecies.length) {
    failures.push(
      `Gen ${generation.gen}: species count mismatch (ours=${localPokemon.length}, oracle=${oracleSpecies.length})`,
    );
  }

  for (const species of localPokemon) {
    const oracleSpeciesEntry = oracleSpeciesById.get(normalizeSpeciesId(species.name));
    if (!oracleSpeciesEntry) {
      failures.push(`Gen ${generation.gen}: species ${species.name} missing from oracle data`);
      continue;
    }

    const localTypes = [...species.types];
    const oracleTypes = [...oracleSpeciesEntry.types];
    if (localTypes.join(",") !== oracleTypes.join(",")) {
      failures.push(
        `Gen ${generation.gen}: species ${species.name} type mismatch (ours=${localTypes.join("/")}, oracle=${oracleTypes.join("/")})`,
      );
    }
  }

  const localTypes = Object.keys(localTypeChart).sort();
  const expectedTypeCount = generation.gen === 1 ? 15 : generation.gen <= 5 ? 17 : 18;
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
      }
    }
  }

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
  };
}
