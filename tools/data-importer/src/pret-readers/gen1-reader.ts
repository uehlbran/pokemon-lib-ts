import * as fs from "node:fs";
import * as path from "node:path";
import type { PretGenData, PretMoveData, PretPokemonData, PretTypeChartEntry } from "./types";

// ---------------------------------------------------------------------------
// Constants — derived from pokered sources
// ---------------------------------------------------------------------------

const POKERED_ROOT = path.join("references", "pokered-master", "pokered-master");

// Source: pret/pokered engine/battle/core.asm — priority checks around line 371-391.
// Gen 1 has NO priority field in moves.asm. The engine hardcodes two special cases:
//   QUICK_ATTACK → moves first (priority 1)
//   COUNTER      → moves last  (priority -1)
//   everything else → speed comparison (priority 0)
const GEN1_PRIORITY: Readonly<Record<string, number>> = {
  "quick-attack": 1,
  counter: -1,
};

// Mapping from pokered ASM type constants to lowercase names.
// Source: pret/pokered constants/type_constants.asm
const TYPE_CONSTANT_MAP: Readonly<Record<string, string>> = {
  NORMAL: "normal",
  FIRE: "fire",
  WATER: "water",
  ELECTRIC: "electric",
  GRASS: "grass",
  ICE: "ice",
  FIGHTING: "fighting",
  POISON: "poison",
  GROUND: "ground",
  FLYING: "flying",
  PSYCHIC_TYPE: "psychic",
  BUG: "bug",
  ROCK: "rock",
  GHOST: "ghost",
  DRAGON: "dragon",
};

// Type-effectiveness constants to numeric multiplier.
// Source: pret/pokered constants/type_constants.asm
const MULTIPLIER_MAP: Readonly<Record<string, 0 | 0.5 | 2>> = {
  SUPER_EFFECTIVE: 2,
  NOT_VERY_EFFECTIVE: 0.5,
  NO_EFFECT: 0,
};

// ---------------------------------------------------------------------------
// Move parsing
// ---------------------------------------------------------------------------

/**
 * Convert a pokered SCREAMING_SNAKE_CASE move name to a kebab-case ID.
 *
 * pokered uses all-caps names with underscores between words (e.g. FIRE_PUNCH,
 * QUICK_ATTACK). A handful omit underscores (e.g. THUNDERPUNCH, BUBBLEBEAM) —
 * we simply lowercase and replace underscores with hyphens, which matches the
 * canonical Showdown IDs for Gen 1 moves.
 *
 * Source: pret/pokered data/moves/moves.asm (first column of each move macro)
 */
function asmNameToKebab(asmName: string): string {
  return asmName.toLowerCase().replace(/_/g, "-");
}

/**
 * Parse Gen 1 moves from pokered's data/moves/moves.asm.
 *
 * Move macro format:
 *   move NAME, EFFECT, power, TYPE, accuracy, pp
 *
 * Source: pret/pokered data/moves/moves.asm
 */
function parseMoves(repoRoot: string): PretMoveData[] {
  const filePath = path.join(repoRoot, POKERED_ROOT, "data", "moves", "moves.asm");
  const sourceFile = "pret/pokered data/moves/moves.asm";
  const content = fs.readFileSync(filePath, "utf-8");

  const moves: PretMoveData[] = [];
  let lineNumber = 0;

  for (const line of content.split("\n")) {
    lineNumber++;
    // Regex: `move NAME, EFFECT, power, TYPE, accuracy, pp`
    // Each field is separated by a comma with optional whitespace.
    const match =
      /^\s*move\s+([A-Z0-9_]+)\s*,\s*[A-Z0-9_]+\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(
        line,
      );
    if (!match) continue;

    const asmName = match[1] as string;
    const powerStr = match[2] as string;
    const typeConst = match[3] as string;
    const accuracyStr = match[4] as string;
    const ppStr = match[5] as string;
    const id = asmNameToKebab(asmName);
    const type = TYPE_CONSTANT_MAP[typeConst] ?? typeConst.toLowerCase();
    const priority = GEN1_PRIORITY[id] ?? 0;

    moves.push({
      id,
      priority,
      power: Number(powerStr),
      accuracy: Number(accuracyStr),
      pp: Number(ppStr),
      type,
      source: `${sourceFile} — move ${asmName} line ${lineNumber}`,
    });
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Base stats parsing
// ---------------------------------------------------------------------------

/**
 * Parse the INCLUDE list from pokered's data/pokemon/base_stats.asm.
 * Returns absolute paths to each individual .asm file in Pokédex order.
 *
 * Source: pret/pokered data/pokemon/base_stats.asm
 */
function parseBaseStatsIncludeList(repoRoot: string): string[] {
  const indexPath = path.join(repoRoot, POKERED_ROOT, "data", "pokemon", "base_stats.asm");
  const content = fs.readFileSync(indexPath, "utf-8");

  const includePaths: string[] = [];
  for (const line of content.split("\n")) {
    const match = /INCLUDE\s+"([^"]+)"/.exec(line);
    if (match) {
      includePaths.push(path.join(repoRoot, POKERED_ROOT, match[1] as string));
    }
  }
  return includePaths;
}

/**
 * Parse a single pokered base_stats .asm file.
 *
 * File format (example: data/pokemon/base_stats/bulbasaur.asm):
 *   db DEX_BULBASAUR ; pokedex id
 *   db  45,  49,  49,  45,  65
 *   ;   hp  atk  def  spd  spc
 *   db GRASS, POISON ; type
 *   ...
 *
 * In Gen 1 there is only one Special stat. SpAtk == SpDef == spc.
 *
 * Source: pret/pokered data/pokemon/base_stats/*.asm
 */
function parseBaseStatsFile(filePath: string): PretPokemonData | null {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const speciesName = path.basename(filePath, ".asm").toLowerCase();

  let stats: number[] | null = null;
  let types: string[] = [];
  let statLineIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();

    if (stats === null) {
      // The stat line has exactly 5 comma-separated numbers after `db`.
      // Gen 1 format: `db  45,  49,  49,  45,  65`  (hp, atk, def, spd, spc)
      const statsMatch = /^db\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/.exec(
        line,
      );
      if (statsMatch) {
        stats = [
          Number(statsMatch[1]),
          Number(statsMatch[2]),
          Number(statsMatch[3]),
          Number(statsMatch[4]),
          Number(statsMatch[5]),
        ];
        statLineIdx = i;
        continue;
      }
    }

    // Type line immediately follows the stats line.
    if (statLineIdx >= 0 && i === statLineIdx + 1) {
      // Format: `db GRASS, POISON ; type` or `db NORMAL ; type`
      const typeMatch = /^db\s+([A-Z_]+)(?:\s*,\s*([A-Z_]+))?/.exec(line);
      if (typeMatch) {
        const raw1 = typeMatch[1] as string;
        const t1 = TYPE_CONSTANT_MAP[raw1] ?? raw1.toLowerCase();
        types = [t1];
        if (typeMatch[2]) {
          const raw2 = typeMatch[2] as string;
          const t2 = TYPE_CONSTANT_MAP[raw2] ?? raw2.toLowerCase();
          if (t2 !== t1) types.push(t2);
        }
      }
    }
  }

  if (stats === null) return null;

  // Gen 1: [hp, atk, def, spd, spc]
  const [hp, attack, defense, speed, special] = stats as [number, number, number, number, number];

  // Build a short relative path for the source citation.
  const pokeredMarker = `pokered-master${path.sep}`;
  const relPath = filePath.split(pokeredMarker).pop() ?? path.basename(filePath);

  return {
    name: speciesName,
    baseStats: {
      hp,
      attack,
      defense,
      speed,
      specialAttack: special,
      specialDefense: special,
    },
    types,
    source: `pret/pokered ${relPath}`,
  };
}

/**
 * Parse all Gen 1 Pokemon base stats.
 *
 * Source: pret/pokered data/pokemon/base_stats.asm (include list) +
 *         pret/pokered data/pokemon/base_stats/*.asm (individual files)
 */
function parsePokemon(repoRoot: string): PretPokemonData[] {
  const includeList = parseBaseStatsIncludeList(repoRoot);
  const result: PretPokemonData[] = [];
  for (const filePath of includeList) {
    const mon = parseBaseStatsFile(filePath);
    if (mon) result.push(mon);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Type chart parsing
// ---------------------------------------------------------------------------

/**
 * Parse the Gen 1 type effectiveness table from pokered's
 * data/types/type_matchups.asm.
 *
 * Entry format:
 *   db ATTACKER_TYPE, DEFENDER_TYPE, MULTIPLIER_CONSTANT
 *
 * Table ends at `db -1`.
 *
 * Notable Gen 1 specifics (faithful to the cartridge):
 *   - GHOST vs PSYCHIC_TYPE is NO_EFFECT (the famous Gen 1 bug)
 *   - No STEEL, DARK, or FAIRY types exist in Gen 1
 *
 * Source: pret/pokered data/types/type_matchups.asm
 */
function parseTypeChart(repoRoot: string): PretTypeChartEntry[] {
  const filePath = path.join(repoRoot, POKERED_ROOT, "data", "types", "type_matchups.asm");
  const sourceFile = "pret/pokered data/types/type_matchups.asm";
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: PretTypeChartEntry[] = [];

  let lineNumber = 0;
  for (const line of content.split("\n")) {
    lineNumber++;
    // Strip inline comments and whitespace.
    const stripped = line.replace(/;.*$/, "").trim();
    if (!stripped) continue;

    // The table ends at `db -1`.
    if (/^db\s+-1/.test(stripped)) break;

    const match = /^db\s+([A-Z_]+)\s*,\s*([A-Z_]+)\s*,\s*([A-Z_]+)/.exec(stripped);
    if (!match) continue;

    const attackerConst = match[1] as string;
    const defenderConst = match[2] as string;
    const multConst = match[3] as string;
    const attacker = TYPE_CONSTANT_MAP[attackerConst];
    const defender = TYPE_CONSTANT_MAP[defenderConst];
    const multiplier = MULTIPLIER_MAP[multConst];

    // Skip entries for types not in this generation's type map.
    if (attacker === undefined || defender === undefined || multiplier === undefined) continue;

    entries.push({
      attacker,
      defender,
      multiplier,
      source: `${sourceFile} — line ${lineNumber}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read all Gen 1 data from the pokered pret repository.
 *
 * @param repoRoot - Absolute path to the pokemon-lib-ts repository root.
 *   The pokered source is expected at:
 *   `<repoRoot>/references/pokered-master/pokered-master/`
 *
 * Source: pret/pokered (https://github.com/pret/pokered)
 */
export function readGen1Data(repoRoot: string): PretGenData {
  return {
    gen: 1,
    moves: parseMoves(repoRoot),
    pokemon: parsePokemon(repoRoot),
    typeChart: parseTypeChart(repoRoot),
  };
}
