import * as fs from "node:fs";
import * as path from "node:path";
import type { PretGenData, PretMoveData, PretPokemonData, PretTypeChartEntry } from "./types";

// ---------------------------------------------------------------------------
// Constants — derived from pokecrystal sources
// ---------------------------------------------------------------------------

const POKECRYSTAL_ROOT = path.join("references", "pokecrystal-master", "pokecrystal-master");

// Source: pret/pokecrystal constants/battle_constants.asm — BASE_PRIORITY EQU 1
// All moves not listed in MoveEffectPriorities default to this value.
const BASE_PRIORITY = 1;

// Source: pret/pokecrystal data/moves/effects_priorities.asm
// Maps effect constant name to the priority value from the table.
// Includes the Vital Throw special-case from engine/battle/core.asm GetMovePriority.
const EFFECT_PRIORITY_MAP: Readonly<Record<string, number>> = {
  // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PROTECT, 3
  EFFECT_PROTECT: 3,
  // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_ENDURE, 3
  EFFECT_ENDURE: 3,
  // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_PRIORITY_HIT, 2
  // Used by Quick Attack, Mach Punch, ExtremeSpeed
  EFFECT_PRIORITY_HIT: 2,
  // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_FORCE_SWITCH, 0
  // Used by Roar, Whirlwind
  EFFECT_FORCE_SWITCH: 0,
  // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_COUNTER, 0
  EFFECT_COUNTER: 0,
  // Source: pret/pokecrystal data/moves/effects_priorities.asm — EFFECT_MIRROR_COAT, 0
  EFFECT_MIRROR_COAT: 0,
};

// Source: pret/pokecrystal engine/battle/core.asm GetMovePriority (line 835)
// Vital Throw is hardcoded BEFORE the MoveEffectPriorities table lookup.
// The check returns priority 0 for Vital Throw before the table is consulted.
// Its effect is EFFECT_ALWAYS_HIT which has no entry in the priority table —
// the hardcoded check ensures priority 0 instead of BASE_PRIORITY.
const VITAL_THROW_ID = "vital-throw";

// Mapping from pokecrystal ASM type constants to lowercase names.
// Source: pret/pokecrystal constants/type_constants.asm
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
  DARK: "dark",
  STEEL: "steel",
  // CURSE_TYPE is an internal placeholder; not a gameplay type
};

// Type-effectiveness constants to numeric multiplier.
// Source: pret/pokecrystal constants/battle_constants.asm
const MULTIPLIER_MAP: Readonly<Record<string, 0 | 0.5 | 2>> = {
  SUPER_EFFECTIVE: 2,
  NOT_VERY_EFFECTIVE: 0.5,
  NO_EFFECT: 0,
};

// ---------------------------------------------------------------------------
// Move parsing
// ---------------------------------------------------------------------------

/**
 * Convert a pokecrystal SCREAMING_SNAKE_CASE move name to a kebab-case ID.
 *
 * Source: pret/pokecrystal data/moves/moves.asm (first column of each move macro)
 */
function asmNameToKebab(asmName: string): string {
  return asmName.toLowerCase().replace(/_/g, "-");
}

/**
 * Parse Gen 2 moves from pokecrystal's data/moves/moves.asm.
 *
 * Move macro format:
 *   move NAME, EFFECT, power, TYPE, accuracy, pp, effect_chance
 *
 * Priority is resolved by cross-referencing the EFFECT constant with the
 * MoveEffectPriorities table in data/moves/effects_priorities.asm.
 * Vital Throw is a special case hardcoded in engine/battle/core.asm.
 *
 * Source: pret/pokecrystal data/moves/moves.asm
 */
function parseMoves(repoRoot: string): PretMoveData[] {
  const filePath = path.join(repoRoot, POKECRYSTAL_ROOT, "data", "moves", "moves.asm");
  const sourceFile = "pret/pokecrystal data/moves/moves.asm";
  const content = fs.readFileSync(filePath, "utf-8");

  const moves: PretMoveData[] = [];
  let lineNumber = 0;

  for (const line of content.split("\n")) {
    lineNumber++;
    // Regex: `move NAME, EFFECT, power, TYPE, accuracy, pp, effect_chance`
    const match =
      /^\s*move\s+([A-Z0-9_]+)\s*,\s*([A-Z0-9_]+)\s*,\s*(\d+)\s*,\s*([A-Z0-9_]+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(
        line,
      );
    if (!match) continue;

    const asmName = match[1] as string;
    const effectConst = match[2] as string;
    const powerStr = match[3] as string;
    const typeConst = match[4] as string;
    const accuracyStr = match[5] as string;
    const ppStr = match[6] as string;
    const id = asmNameToKebab(asmName);
    const type = TYPE_CONSTANT_MAP[typeConst] ?? typeConst.toLowerCase();

    // Determine priority:
    // 1. Vital Throw is hardcoded to 0 by the engine before the table lookup.
    //    Source: pret/pokecrystal engine/battle/core.asm GetMovePriority
    // 2. Effect constant is looked up in EFFECT_PRIORITY_MAP.
    // 3. Everything else gets BASE_PRIORITY (1).
    let priority: number;
    if (id === VITAL_THROW_ID) {
      priority = 0;
    } else {
      priority = EFFECT_PRIORITY_MAP[effectConst] ?? BASE_PRIORITY;
    }

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
 * Parse the INCLUDE list from pokecrystal's data/pokemon/base_stats.asm.
 * Returns absolute paths to each individual .asm file in Pokédex order.
 *
 * Source: pret/pokecrystal data/pokemon/base_stats.asm
 */
function parseBaseStatsIncludeList(repoRoot: string): string[] {
  const indexPath = path.join(repoRoot, POKECRYSTAL_ROOT, "data", "pokemon", "base_stats.asm");
  const content = fs.readFileSync(indexPath, "utf-8");

  const includePaths: string[] = [];
  for (const line of content.split("\n")) {
    const match = /INCLUDE\s+"([^"]+)"/.exec(line);
    if (match) {
      includePaths.push(path.join(repoRoot, POKECRYSTAL_ROOT, match[1] as string));
    }
  }
  return includePaths;
}

/**
 * Parse a single pokecrystal base_stats .asm file.
 *
 * File format (example: data/pokemon/base_stats/bulbasaur.asm):
 *   db BULBASAUR ; 001
 *   db  45,  49,  49,  45,  65,  65
 *   ;   hp  atk  def  spd  sat  sdf
 *   db GRASS, POISON ; type
 *   ...
 *
 * Gen 2 separates SpAtk (sat) and SpDef (sdf).
 *
 * Source: pret/pokecrystal data/pokemon/base_stats/*.asm
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
      // Gen 2 stat line has exactly 6 comma-separated numbers after `db`.
      // Format: `db  45,  49,  49,  45,  65,  65`  (hp, atk, def, spd, sat, sdf)
      const statsMatch =
        /^db\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*$/.exec(line);
      if (statsMatch) {
        stats = [
          Number(statsMatch[1]),
          Number(statsMatch[2]),
          Number(statsMatch[3]),
          Number(statsMatch[4]),
          Number(statsMatch[5]),
          Number(statsMatch[6]),
        ];
        statLineIdx = i;
        continue;
      }
    }

    // Type line immediately follows the stats line.
    if (statLineIdx >= 0 && i === statLineIdx + 1) {
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

  // Gen 2: [hp, atk, def, spd, specialAttack, specialDefense]
  const [hp, attack, defense, speed, specialAttack, specialDefense] = stats as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  const pokecrystalMarker = `pokecrystal-master${path.sep}`;
  const relPath = filePath.split(pokecrystalMarker).pop() ?? path.basename(filePath);

  return {
    name: speciesName,
    baseStats: {
      hp,
      attack,
      defense,
      speed,
      specialAttack,
      specialDefense,
    },
    types,
    source: `pret/pokecrystal ${relPath}`,
  };
}

/**
 * Parse all Gen 2 Pokemon base stats.
 *
 * Source: pret/pokecrystal data/pokemon/base_stats.asm (include list) +
 *         pret/pokecrystal data/pokemon/base_stats/*.asm (individual files)
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
 * Parse the Gen 2 type effectiveness table from pokecrystal's
 * data/types/type_matchups.asm.
 *
 * Entry format:
 *   db ATTACKER_TYPE, DEFENDER_TYPE, MULTIPLIER_CONSTANT
 *
 * The main table ends at `db -2` (Foresight override entries follow after it).
 * We parse only up to the -2 sentinel and discard the Foresight section;
 * those entries represent in-battle Foresight overrides, not the baseline chart.
 *
 * Notable Gen 2 changes vs Gen 1:
 *   - GHOST vs PSYCHIC_TYPE is now SUPER_EFFECTIVE (Gen 1 bug fixed)
 *   - STEEL and DARK types added
 *
 * Source: pret/pokecrystal data/types/type_matchups.asm
 */
function parseTypeChart(repoRoot: string): PretTypeChartEntry[] {
  const filePath = path.join(repoRoot, POKECRYSTAL_ROOT, "data", "types", "type_matchups.asm");
  const sourceFile = "pret/pokecrystal data/types/type_matchups.asm";
  const content = fs.readFileSync(filePath, "utf-8");
  const entries: PretTypeChartEntry[] = [];

  let lineNumber = 0;
  for (const line of content.split("\n")) {
    lineNumber++;
    const stripped = line.replace(/;.*$/, "").trim();
    if (!stripped) continue;

    // `db -2` ends the main chart (Foresight override section follows).
    // `db -1` is the final end sentinel.
    // Stop at either.
    if (/^db\s+-[12]/.test(stripped)) break;

    const match = /^db\s+([A-Z_]+)\s*,\s*([A-Z_]+)\s*,\s*([A-Z_]+)/.exec(stripped);
    if (!match) continue;

    const attackerConst = match[1] as string;
    const defenderConst = match[2] as string;
    const multConst = match[3] as string;
    const attacker = TYPE_CONSTANT_MAP[attackerConst];
    const defender = TYPE_CONSTANT_MAP[defenderConst];
    const multiplier = MULTIPLIER_MAP[multConst];

    // Skip entries for types not in this generation's type map (e.g., CURSE_TYPE).
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
 * Read all Gen 2 data from the pokecrystal pret repository.
 *
 * @param repoRoot - Absolute path to the pokemon-lib-ts repository root.
 *   The pokecrystal source is expected at:
 *   `<repoRoot>/references/pokecrystal-master/pokecrystal-master/`
 *
 * Source: pret/pokecrystal (https://github.com/pret/pokecrystal)
 */
export function readGen2Data(repoRoot: string): PretGenData {
  return {
    gen: 2,
    moves: parseMoves(repoRoot),
    pokemon: parsePokemon(repoRoot),
    typeChart: parseTypeChart(repoRoot),
  };
}
