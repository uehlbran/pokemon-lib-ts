#!/usr/bin/env tsx
/**
 * Pret diff discovery tool.
 *
 * Compares committed package data (packages/genN/data/*.json) against
 * pret disassembly/decomp sources for Gen 1-4, reporting every mismatch.
 *
 * Usage:
 *   npx tsx tools/data-importer/src/pret-readers/discover-diffs.ts --gen=2
 *   npx tsx tools/data-importer/src/pret-readers/discover-diffs.ts          # all Gen 1-4
 *   npx tsx tools/data-importer/src/pret-readers/discover-diffs.ts --json   # write JSON report
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import { readGen1Data } from "./gen1-reader";
import { readGen2Data } from "./gen2-reader";
import { readGen3Data } from "./gen3-reader";
import { readGen4Data } from "./gen4-reader";
import type { PretGenData } from "./types";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const genArg = args.find((a) => a.startsWith("--gen="));
const writeJson = args.includes("--json");
const requestedGen = genArg ? Number(genArg.split("=")[1]) : null;

const SUPPORTED_GENS = [1, 2, 3, 4] as const;
const gensToScan: readonly number[] = requestedGen !== null ? [requestedGen] : SUPPORTED_GENS;

// ---------------------------------------------------------------------------
// Committed data types (matches packages/genN/data/*.json shape)
// ---------------------------------------------------------------------------

interface CommittedMove {
  id: string;
  priority: number;
  power: number | null;
  accuracy: number | null;
  pp: number;
  type: string;
  category: "physical" | "special" | "status";
}

interface CommittedStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  spAttack: number;
  spDefense: number;
}

interface CommittedPokemon {
  id: number;
  name: string;
  baseStats: CommittedStats;
  types: string[];
}

// type-chart.json: { [attacker: string]: { [defender: string]: number } }
type CommittedTypeChart = Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// Diff record shape
// ---------------------------------------------------------------------------

export interface DiffRecord {
  gen: number;
  kind: "move" | "pokemon" | "typeChart";
  /** kebab-case move id, species name, or "attacker→defender" */
  id: string;
  field: string;
  pretValue: number | string | null | undefined;
  ourValue: number | string | null | undefined;
  pkmnValue: number | string | null | undefined;
  pretSource: string;
}

// ---------------------------------------------------------------------------
// Load committed data helpers
// ---------------------------------------------------------------------------

function loadCommittedMoves(repoRoot: string, gen: number): CommittedMove[] {
  const filePath = path.join(repoRoot, `packages/gen${gen}/data/moves.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Committed moves not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CommittedMove[];
}

function loadCommittedPokemon(repoRoot: string, gen: number): CommittedPokemon[] {
  const filePath = path.join(repoRoot, `packages/gen${gen}/data/pokemon.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Committed pokemon not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CommittedPokemon[];
}

function loadCommittedTypeChart(repoRoot: string, gen: number): CommittedTypeChart {
  const filePath = path.join(repoRoot, `packages/gen${gen}/data/type-chart.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Committed type-chart not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CommittedTypeChart;
}

// ---------------------------------------------------------------------------
// @pkmn/data helper — get move data for a gen
// ---------------------------------------------------------------------------

const gens = new Generations(Dex);

function getPkmnMoveValue(
  gen: number,
  moveId: string,
  field: "priority" | "basePower" | "accuracy" | "pp" | "type",
): number | string | null | undefined {
  const g = gens.get(gen as 1 | 2 | 3 | 4);
  // @pkmn ids are lowercase without hyphens (e.g., "quickattack")
  const pkmnId = moveId.replace(/-/g, "");
  const move = g.moves.get(pkmnId);
  if (!move) return undefined;
  if (field === "priority") return move.priority;
  if (field === "basePower") return move.basePower || null;
  if (field === "accuracy") return move.accuracy === true ? null : (move.accuracy as number | null);
  if (field === "pp") return move.pp;
  if (field === "type") return move.type.toLowerCase();
  return undefined;
}

// ---------------------------------------------------------------------------
// Move diff comparison
// ---------------------------------------------------------------------------

function diffMoves(gen: number, pretData: PretGenData, repoRoot: string): DiffRecord[] {
  const committed = loadCommittedMoves(repoRoot, gen);
  const diffs: DiffRecord[] = [];

  // Build lookup map from committed data
  const committedByid = new Map(committed.map((m) => [m.id, m]));

  for (const pretMove of pretData.moves) {
    const ours = committedByid.get(pretMove.id);
    if (!ours) {
      // Move not in our committed data — skip (could be gen availability difference)
      continue;
    }

    // Compare priority (only if pret has this field)
    if (pretMove.priority !== undefined) {
      if (pretMove.priority !== ours.priority) {
        diffs.push({
          gen,
          kind: "move",
          id: pretMove.id,
          field: "priority",
          pretValue: pretMove.priority,
          ourValue: ours.priority,
          pkmnValue: getPkmnMoveValue(gen, pretMove.id, "priority"),
          pretSource: pretMove.source,
        });
      }
    }

    // Compare power
    if (pretMove.power !== undefined) {
      // Normalise: 0 power in pret = variable (treat same as null)
      const pretPower = pretMove.power === 0 ? null : pretMove.power;
      const ourPower = ours.power;
      if (pretPower !== ourPower) {
        diffs.push({
          gen,
          kind: "move",
          id: pretMove.id,
          field: "power",
          pretValue: pretPower,
          ourValue: ourPower,
          pkmnValue: getPkmnMoveValue(gen, pretMove.id, "basePower"),
          pretSource: pretMove.source,
        });
      }
    }

    // Compare accuracy (null = always hits in both pret and our data)
    if (pretMove.accuracy !== undefined) {
      // pret accuracy 0 means "always hits" (same as null in our data)
      const pretAcc = pretMove.accuracy === 0 ? null : pretMove.accuracy;
      const ourAcc = ours.accuracy;
      if (pretAcc !== ourAcc) {
        diffs.push({
          gen,
          kind: "move",
          id: pretMove.id,
          field: "accuracy",
          pretValue: pretAcc,
          ourValue: ourAcc,
          pkmnValue: getPkmnMoveValue(gen, pretMove.id, "accuracy"),
          pretSource: pretMove.source,
        });
      }
    }

    // Compare PP
    if (pretMove.pp !== undefined && pretMove.pp !== ours.pp) {
      diffs.push({
        gen,
        kind: "move",
        id: pretMove.id,
        field: "pp",
        pretValue: pretMove.pp,
        ourValue: ours.pp,
        pkmnValue: getPkmnMoveValue(gen, pretMove.id, "pp"),
        pretSource: pretMove.source,
      });
    }

    // Compare type
    if (pretMove.type !== undefined && pretMove.type !== ours.type) {
      diffs.push({
        gen,
        kind: "move",
        id: pretMove.id,
        field: "type",
        pretValue: pretMove.type,
        ourValue: ours.type,
        pkmnValue: getPkmnMoveValue(gen, pretMove.id, "type"),
        pretSource: pretMove.source,
      });
    }

    // Compare category (Gen 4 only — Gen 1-3 derive from type split)
    if (gen === 4 && pretMove.category !== undefined && pretMove.category !== ours.category) {
      diffs.push({
        gen,
        kind: "move",
        id: pretMove.id,
        field: "category",
        pretValue: pretMove.category,
        ourValue: ours.category,
        pkmnValue: undefined,
        pretSource: pretMove.source,
      });
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Pokemon diff comparison
// ---------------------------------------------------------------------------

function diffPokemon(gen: number, pretData: PretGenData, repoRoot: string): DiffRecord[] {
  const committed = loadCommittedPokemon(repoRoot, gen);
  const diffs: DiffRecord[] = [];

  // Build lookup by lowercase name
  const committedByName = new Map(committed.map((p) => [p.name.toLowerCase(), p]));

  for (const pretMon of pretData.pokemon) {
    const ours = committedByName.get(pretMon.name.toLowerCase());
    if (!ours) {
      // Not in our dex range for this gen — skip
      continue;
    }

    const pretStats = pretMon.baseStats;
    const ourStats = ours.baseStats;

    const statFields: [keyof typeof pretStats, keyof CommittedStats][] = [
      ["hp", "hp"],
      ["attack", "attack"],
      ["defense", "defense"],
      ["speed", "speed"],
      ["specialAttack", "spAttack"],
      ["specialDefense", "spDefense"],
    ];

    for (const [pretField, ourField] of statFields) {
      if (pretStats[pretField] !== ourStats[ourField]) {
        diffs.push({
          gen,
          kind: "pokemon",
          id: pretMon.name,
          field: `baseStats.${ourField}`,
          pretValue: pretStats[pretField],
          ourValue: ourStats[ourField],
          pkmnValue: undefined,
          pretSource: pretMon.source,
        });
      }
    }

    // Compare types (order-insensitive)
    const pretTypes = [...pretMon.types].sort();
    const ourTypes = [...ours.types].sort();
    if (JSON.stringify(pretTypes) !== JSON.stringify(ourTypes)) {
      diffs.push({
        gen,
        kind: "pokemon",
        id: pretMon.name,
        field: "types",
        pretValue: pretTypes.join("/"),
        ourValue: ourTypes.join("/"),
        pkmnValue: undefined,
        pretSource: pretMon.source,
      });
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Type chart diff comparison
// ---------------------------------------------------------------------------

function diffTypeChart(gen: number, pretData: PretGenData, repoRoot: string): DiffRecord[] {
  // Gen 4 type chart is in C code, not data files — skip
  if (gen === 4 || pretData.typeChart.length === 0) return [];

  const committed = loadCommittedTypeChart(repoRoot, gen);
  const diffs: DiffRecord[] = [];

  for (const pretEntry of pretData.typeChart) {
    const ourValue = committed[pretEntry.attacker]?.[pretEntry.defender];
    if (ourValue === undefined || ourValue !== pretEntry.multiplier) {
      diffs.push({
        gen,
        kind: "typeChart",
        id: `${pretEntry.attacker}→${pretEntry.defender}`,
        field: "multiplier",
        pretValue: pretEntry.multiplier,
        ourValue: ourValue ?? 1,
        pkmnValue: undefined,
        pretSource: pretEntry.source,
      });
    }
  }

  // Also check for non-neutral entries in our chart that pret doesn't have
  const pretIndex = new Set(pretData.typeChart.map((e) => `${e.attacker}→${e.defender}`));
  for (const [attacker, defenders] of Object.entries(committed)) {
    for (const [defender, mult] of Object.entries(defenders)) {
      if (mult === 1) continue; // neutral — skip
      const key = `${attacker}→${defender}`;
      if (!pretIndex.has(key)) {
        diffs.push({
          gen,
          kind: "typeChart",
          id: key,
          field: "multiplier",
          pretValue: 1, // pret implies neutral (not in non-neutral table)
          ourValue: mult,
          pkmnValue: undefined,
          pretSource: `pret does not list ${key} as non-neutral`,
        });
      }
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Detect whether pret sources are available
// ---------------------------------------------------------------------------

const PRET_MARKER_FILES: Record<number, string> = {
  1: path.join("references", "pokered-master", "pokered-master", "data", "moves", "moves.asm"),
  2: path.join(
    "references",
    "pokecrystal-master",
    "pokecrystal-master",
    "data",
    "moves",
    "moves.asm",
  ),
  3: path.join(
    "references",
    "pokeemerald-master",
    "pokeemerald-master",
    "src",
    "data",
    "battle_moves.h",
  ),
  4: path.join("references", "pokeplatinum-main", "pokeplatinum-main", "res", "battle", "moves"),
};

function isPretAvailable(repoRoot: string, gen: number): boolean {
  const marker = PRET_MARKER_FILES[gen];
  if (!marker) return false;
  return fs.existsSync(path.join(repoRoot, marker));
}

// ---------------------------------------------------------------------------
// Reader dispatch
// ---------------------------------------------------------------------------

function loadPretData(repoRoot: string, gen: number): PretGenData {
  switch (gen) {
    case 1:
      return readGen1Data(repoRoot);
    case 2:
      return readGen2Data(repoRoot);
    case 3:
      return readGen3Data(repoRoot);
    case 4:
      return readGen4Data(repoRoot);
    default:
      throw new Error(`No pret reader for Gen ${gen}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const repoRoot = process.cwd();

interface ReportEntry {
  gen: number;
  pretAvailable: boolean;
  moveCount: number;
  pokemonCount: number;
  typeChartCount: number;
  mismatches: DiffRecord[];
}

const report: ReportEntry[] = [];
let totalMismatches = 0;

for (const gen of gensToScan) {
  if (!SUPPORTED_GENS.includes(gen as (typeof SUPPORTED_GENS)[number])) {
    console.error(`Gen ${gen} is not supported. Only Gen 1-4 have pret sources.`);
    process.exit(1);
  }

  console.log(`\n=== Gen ${gen} ===`);

  if (!isPretAvailable(repoRoot, gen)) {
    console.log(`  [SKIP] Pret source not found. Clone the reference repo to references/ first.`);
    report.push({
      gen,
      pretAvailable: false,
      moveCount: 0,
      pokemonCount: 0,
      typeChartCount: 0,
      mismatches: [],
    });
    continue;
  }

  let pretData: PretGenData;
  try {
    pretData = loadPretData(repoRoot, gen);
  } catch (err) {
    console.error(`  [ERROR] Failed to load pret data for Gen ${gen}:`, err);
    continue;
  }

  const moveDiffs = diffMoves(gen, pretData, repoRoot);
  const pokemonDiffs = diffPokemon(gen, pretData, repoRoot);
  const typeChartDiffs = diffTypeChart(gen, pretData, repoRoot);
  const allDiffs = [...moveDiffs, ...pokemonDiffs, ...typeChartDiffs];
  totalMismatches += allDiffs.length;

  console.log(
    `  Loaded: ${pretData.moves.length} moves, ${pretData.pokemon.length} pokemon, ${pretData.typeChart.length} type chart entries`,
  );

  if (allDiffs.length === 0) {
    console.log("  No mismatches found.");
  } else {
    console.log(`  Found ${allDiffs.length} mismatch(es):`);
    for (const d of allDiffs) {
      console.log(
        `    [${d.kind}] ${d.id} .${d.field}: pret=${JSON.stringify(d.pretValue)} ours=${JSON.stringify(d.ourValue)} @pkmn=${JSON.stringify(d.pkmnValue)}`,
      );
      console.log(`      Source: ${d.pretSource}`);
    }
  }

  report.push({
    gen,
    pretAvailable: true,
    moveCount: pretData.moves.length,
    pokemonCount: pretData.pokemon.length,
    typeChartCount: pretData.typeChart.length,
    mismatches: allDiffs,
  });
}

console.log(`\n=== Summary ===`);
console.log(`Total mismatches: ${totalMismatches}`);
for (const entry of report) {
  if (!entry.pretAvailable) {
    console.log(`  Gen ${entry.gen}: [pret not available]`);
  } else {
    const m = entry.mismatches;
    const moveMismatches = m.filter((d) => d.kind === "move").length;
    const pokemonMismatches = m.filter((d) => d.kind === "pokemon").length;
    const typeMismatches = m.filter((d) => d.kind === "typeChart").length;
    console.log(
      `  Gen ${entry.gen}: ${m.length} total — moves: ${moveMismatches}, pokemon: ${pokemonMismatches}, type chart: ${typeMismatches}`,
    );
  }
}

if (writeJson) {
  const outPath = path.join(repoRoot, "tools", "data-importer", "pret-diff-report.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalMismatches,
        gens: report,
      },
      null,
      2,
    ),
  );
  console.log(`\nReport written to: ${outPath}`);
}
