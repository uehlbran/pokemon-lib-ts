/**
 * Pret diff engine — pure, importable comparison functions.
 *
 * Compares committed package data (packages/genN/data/*.json) against
 * pret disassembly/decomp source data for Gen 1-4.
 *
 * Import this module for programmatic use. For CLI output, use discover-diffs.ts.
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
// Committed data shapes (matches packages/genN/data/*.json)
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
// Public diff record shape
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
// @pkmn/data helper — get move field value for a gen
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

export function diffMoves(gen: number, pretData: PretGenData, repoRoot: string): DiffRecord[] {
  const committed = loadCommittedMoves(repoRoot, gen);
  const diffs: DiffRecord[] = [];

  // Primary lookup by exact id.
  const committedById = new Map(committed.map((m) => [m.id, m]));
  // Fallback: normalised id (lowercase, hyphens removed) handles compound ASM names
  // like BUBBLEBEAM (pret) → "bubblebeam" vs "bubble-beam" (our JSON).
  const committedByNorm = new Map(committed.map((m) => [m.id.replace(/-/g, ""), m]));

  for (const pretMove of pretData.moves) {
    const ours =
      committedById.get(pretMove.id) ?? committedByNorm.get(pretMove.id.replace(/-/g, ""));
    if (!ours) {
      // Move not in our committed data — skip (gen availability difference or unknown ASM name)
      continue;
    }
    // Use the canonical committed ID in all diff records for consistency.
    const canonId = ours.id;

    // Compare priority (only if pret has this field)
    if (pretMove.priority !== undefined) {
      if (pretMove.priority !== ours.priority) {
        diffs.push({
          gen,
          kind: "move",
          id: canonId,
          field: "priority",
          pretValue: pretMove.priority,
          ourValue: ours.priority,
          pkmnValue: getPkmnMoveValue(gen, canonId, "priority"),
          pretSource: pretMove.source,
        });
      }
    }

    // Compare power (readers normalize 0 → null for both sides)
    if (pretMove.power !== undefined) {
      const ourPower = ours.power;
      if (pretMove.power !== ourPower) {
        diffs.push({
          gen,
          kind: "move",
          id: canonId,
          field: "power",
          pretValue: pretMove.power,
          ourValue: ourPower,
          pkmnValue: getPkmnMoveValue(gen, canonId, "basePower"),
          pretSource: pretMove.source,
        });
      }
    }

    // Compare accuracy (readers normalize 0 → null for both sides)
    if (pretMove.accuracy !== undefined) {
      const ourAcc = ours.accuracy;
      if (pretMove.accuracy !== ourAcc) {
        diffs.push({
          gen,
          kind: "move",
          id: canonId,
          field: "accuracy",
          pretValue: pretMove.accuracy,
          ourValue: ourAcc,
          pkmnValue: getPkmnMoveValue(gen, canonId, "accuracy"),
          pretSource: pretMove.source,
        });
      }
    }

    // Compare PP
    if (pretMove.pp !== undefined && pretMove.pp !== ours.pp) {
      diffs.push({
        gen,
        kind: "move",
        id: canonId,
        field: "pp",
        pretValue: pretMove.pp,
        ourValue: ours.pp,
        pkmnValue: getPkmnMoveValue(gen, canonId, "pp"),
        pretSource: pretMove.source,
      });
    }

    // Compare type
    if (pretMove.type !== undefined && pretMove.type !== ours.type) {
      diffs.push({
        gen,
        kind: "move",
        id: canonId,
        field: "type",
        pretValue: pretMove.type,
        ourValue: ours.type,
        pkmnValue: getPkmnMoveValue(gen, canonId, "type"),
        pretSource: pretMove.source,
      });
    }

    // Compare category (Gen 4 only — Gen 1-3 derive from type split)
    if (gen === 4 && pretMove.category !== undefined && pretMove.category !== ours.category) {
      diffs.push({
        gen,
        kind: "move",
        id: canonId,
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

export function diffPokemon(gen: number, pretData: PretGenData, repoRoot: string): DiffRecord[] {
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

export function diffTypeChart(gen: number, pretData: PretGenData, repoRoot: string): DiffRecord[] {
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
// Pret availability check
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

export function isPretAvailable(repoRoot: string, gen: number): boolean {
  const marker = PRET_MARKER_FILES[gen];
  if (!marker) return false;
  return fs.existsSync(path.join(repoRoot, marker));
}

// ---------------------------------------------------------------------------
// Reader dispatch
// ---------------------------------------------------------------------------

export function loadPretData(repoRoot: string, gen: number): PretGenData {
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
