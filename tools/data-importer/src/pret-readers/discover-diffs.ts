#!/usr/bin/env tsx
/**
 * Pret diff discovery CLI.
 *
 * Compares committed package data (packages/genN/data/*.json) against
 * pret disassembly/decomp sources for Gen 1-4, reporting every mismatch.
 *
 * Usage:
 *   npx tsx tools/data-importer/src/pret-readers/discover-diffs.ts --gen=2
 *   npx tsx tools/data-importer/src/pret-readers/discover-diffs.ts          # all Gen 1-4
 *   npx tsx tools/data-importer/src/pret-readers/discover-diffs.ts --json   # write JSON report
 *
 * For programmatic use, import from pret-diff.ts instead.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import type { DiffRecord } from "./pret-diff";
import { diffMoves, diffPokemon, diffTypeChart, isPretAvailable, loadPretData } from "./pret-diff";

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
// Main
// ---------------------------------------------------------------------------

// Resolve repo root relative to this file so the script works regardless of
// the working directory it is invoked from.
// Script location: tools/data-importer/src/pret-readers/discover-diffs.ts
// Go up 4 levels: pret-readers/ → src/ → data-importer/ → tools/ → repo root
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

interface ReportEntry {
  gen: number;
  pretAvailable: boolean;
  moveCount: number;
  pokemonCount: number;
  typeChartCount: number;
  mismatches: DiffRecord[];
  error?: string;
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

  let pretData: ReturnType<typeof loadPretData>;
  try {
    pretData = loadPretData(repoRoot, gen);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  [ERROR] Failed to load pret data for Gen ${gen}:`, err);
    report.push({
      gen,
      pretAvailable: true,
      moveCount: 0,
      pokemonCount: 0,
      typeChartCount: 0,
      mismatches: [],
      error: message,
    });
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
  } else if (entry.error) {
    console.log(`  Gen ${entry.gen}: [ERROR] ${entry.error}`);
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
