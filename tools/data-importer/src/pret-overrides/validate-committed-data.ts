#!/usr/bin/env tsx
/**
 * Pret committed-data validator.
 *
 * Verifies that every pret override is reflected in the committed package JSON
 * files (packages/genN/data/*.json). This prevents manual edits or re-imports
 * from silently reverting cartridge-accurate values.
 *
 * Usage:
 *   npx tsx tools/data-importer/src/pret-overrides/validate-committed-data.ts
 *   npx tsx tools/data-importer/src/pret-overrides/validate-committed-data.ts --gen=2
 *
 * Exit codes:
 *   0 — all overrides are correctly reflected
 *   1 — one or more overrides are wrong or missing
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { getOverridesForGen } from "./index";
import type { MoveOverride, PokemonOverride } from "./types";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const genArg = args.find((a) => a.startsWith("--gen="));
const requestedGen = genArg ? Number(genArg.split("=")[1]) : null;

const SUPPORTED_GENS = [1, 2, 3, 4] as const;

if (
  requestedGen !== null &&
  !SUPPORTED_GENS.includes(requestedGen as (typeof SUPPORTED_GENS)[number])
) {
  console.error(
    `Invalid --gen value: "${genArg}". Supported generations: ${SUPPORTED_GENS.join(", ")}`,
  );
  process.exit(1);
}

const gensToValidate: readonly number[] = requestedGen !== null ? [requestedGen] : SUPPORTED_GENS;

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// Script: tools/data-importer/src/pret-overrides/validate-committed-data.ts
// Go up 4 levels to repo root: pret-overrides/ → src/ → data-importer/ → tools/ → repo root
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");

// ---------------------------------------------------------------------------
// Committed data shapes
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

// ---------------------------------------------------------------------------
// Gen 2 base priority constant
// ---------------------------------------------------------------------------

const GEN2_BASE_PRIORITY = 1;

// ---------------------------------------------------------------------------
// Validation logic
// ---------------------------------------------------------------------------

interface ValidationError {
  gen: number;
  kind: "move" | "pokemon";
  id: string;
  field: string;
  expected: unknown;
  actual: unknown;
  source: string;
}

function loadCommittedMoves(gen: number): CommittedMove[] {
  const filePath = path.join(repoRoot, `packages/gen${gen}/data/moves.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Committed moves not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as CommittedMove[];
}

function validateGen(gen: number): ValidationError[] {
  const overrides = getOverridesForGen(gen);
  const errors: ValidationError[] = [];

  // Pokemon overrides are not yet validated by this script.
  // Fail loudly if any exist so they are not silently skipped.
  const pokemonOverrides = overrides.filter((o): o is PokemonOverride => o.target === "pokemon");
  if (pokemonOverrides.length > 0) {
    for (const o of pokemonOverrides) {
      console.error(
        `  [ERROR] Gen ${gen} has a PokemonOverride for "${o.name}" (.${o.field}) that this validator does not yet check. Add pokemon.json validation or remove the override.`,
      );
      errors.push({
        gen,
        kind: "pokemon",
        id: o.name,
        field: o.field,
        expected: o.value,
        actual: "NOT VALIDATED",
        source: o.source,
      });
    }
  }

  const moveOverrides = overrides.filter((o): o is MoveOverride => o.target === "move");
  if (moveOverrides.length === 0 && gen !== 2) {
    // No explicit move overrides for this gen — nothing to validate
    return errors;
  }

  let moves: CommittedMove[];
  try {
    moves = loadCommittedMoves(gen);
  } catch (err) {
    console.error(`  [ERROR] Could not load moves for Gen ${gen}:`, err);
    return [
      ...errors,
      {
        gen,
        kind: "move" as const,
        id: "N/A",
        field: "N/A",
        expected: "file exists",
        actual: "missing",
        source: "",
      },
    ];
  }

  const moveById = new Map(moves.map((m) => [m.id, m]));

  // ── For Gen 2: validate bulk priority scale (all normal moves should be 1) ──
  if (gen === 2) {
    // Moves with no explicit override should have priority === GEN2_BASE_PRIORITY
    const explicitOverrideIds = new Set(moveOverrides.map((o) => o.moveId));
    let normalMoveErrors = 0;
    for (const move of moves) {
      if (explicitOverrideIds.has(move.id)) continue;
      // Protect/Detect/Endure are at 3 — expected higher-than-base
      if (move.priority === 3) continue;
      // Any other non-base priority is wrong
      if (move.priority !== GEN2_BASE_PRIORITY) {
        normalMoveErrors++;
        if (normalMoveErrors <= 5) {
          // Only report first 5 to avoid flooding output
          errors.push({
            gen,
            kind: "move",
            id: move.id,
            field: "priority",
            expected: GEN2_BASE_PRIORITY,
            actual: move.priority,
            source: "pret/pokecrystal data/moves/effects_priorities.asm — BASE_PRIORITY=1",
          });
        }
      }
    }
    if (normalMoveErrors > 5) {
      console.error(
        `  Gen 2: ${normalMoveErrors} normal moves have wrong priority (showing first 5)`,
      );
    }
  }

  // ── Validate explicit overrides ──
  for (const override of moveOverrides) {
    const move = moveById.get(override.moveId);
    if (!move) {
      errors.push({
        gen,
        kind: "move",
        id: override.moveId,
        field: override.field,
        expected: override.value,
        actual: "NOT FOUND",
        source: override.source,
      });
      continue;
    }

    const actualValue = move[override.field as keyof CommittedMove];
    if (actualValue !== override.value) {
      errors.push({
        gen,
        kind: "move",
        id: override.moveId,
        field: override.field,
        expected: override.value,
        actual: actualValue,
        source: override.source,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let totalErrors = 0;

for (const gen of gensToValidate) {
  console.log(`\n=== Gen ${gen} ===`);
  const errors = validateGen(gen);
  totalErrors += errors.length;

  if (errors.length === 0) {
    console.log("  All pret overrides correctly reflected in committed data.");
  } else {
    for (const err of errors) {
      console.error(
        `  [FAIL] ${err.kind} "${err.id}" .${err.field}: expected=${JSON.stringify(err.expected)} actual=${JSON.stringify(err.actual)}`,
      );
      console.error(`         Source: ${err.source}`);
    }
  }
}

console.log(`\n=== Summary ===`);
if (totalErrors === 0) {
  console.log("All pret overrides validated. No mismatches found.");
} else {
  console.error(
    `FAILED: ${totalErrors} mismatch(es) found. Run the data importer to regenerate, or fix the JSON manually.`,
  );
  process.exit(1);
}
