/**
 * Gen 3 pret reader - reads battle data from pokeemerald.
 *
 * Sources:
 *   - Moves: pret/pokeemerald src/data/battle_moves.h
 *   - Pokemon: pret/pokeemerald src/data/pokemon/species_info.h
 *   - Type chart: pret/pokeemerald src/battle_main.c gTypeEffectiveness[]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { PretGenData, PretMoveData, PretPokemonData, PretTypeChartEntry } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POKEEMERALD_ROOT = path.join("references", "pokeemerald-master", "pokeemerald-master");

// Source: pret/pokeemerald include/constants/pokemon.h
const TYPE_CONSTANT_MAP: Readonly<Record<string, string>> = {
  TYPE_NORMAL: "normal",
  TYPE_FIGHTING: "fighting",
  TYPE_FLYING: "flying",
  TYPE_POISON: "poison",
  TYPE_GROUND: "ground",
  TYPE_ROCK: "rock",
  TYPE_BUG: "bug",
  TYPE_GHOST: "ghost",
  TYPE_STEEL: "steel",
  TYPE_FIRE: "fire",
  TYPE_WATER: "water",
  TYPE_GRASS: "grass",
  TYPE_ELECTRIC: "electric",
  TYPE_PSYCHIC: "psychic",
  TYPE_ICE: "ice",
  TYPE_DRAGON: "dragon",
  TYPE_DARK: "dark",
};

// Source: pret/pokeemerald include/battle_main.h
// TYPE_MUL_NO_EFFECT=0, TYPE_MUL_NOT_EFFECTIVE=5, TYPE_MUL_SUPER_EFFECTIVE=20
const MULTIPLIER_CONSTANT_MAP: Readonly<Record<string, 0 | 0.5 | 2>> = {
  TYPE_MUL_NO_EFFECT: 0,
  TYPE_MUL_NOT_EFFECTIVE: 0.5,
  TYPE_MUL_SUPER_EFFECTIVE: 2,
};

// ---------------------------------------------------------------------------
// Move name normalisation
// ---------------------------------------------------------------------------

/**
 * Convert a pokeemerald MOVE_X constant to a kebab-case move ID.
 * Example: MOVE_QUICK_ATTACK -> quick-attack
 *
 * Source: pret/pokeemerald src/data/battle_moves.h -- [MOVE_*] designators
 */
function moveConstantToKebab(constant: string): string {
  return constant
    .replace(/^MOVE_/, "")
    .toLowerCase()
    .replace(/_/g, "-");
}

// ---------------------------------------------------------------------------
// Move parsing
// ---------------------------------------------------------------------------

/**
 * Parse Gen 3 moves from pokeemerald's src/data/battle_moves.h.
 *
 * The file uses C designated initialisers:
 *   [MOVE_NAME] = { .power = N, .type = TYPE_X, .accuracy = N,
 *                   .pp = N, .priority = N, ... }
 *
 * All moves have an explicit .priority field (0 for normal speed).
 * .power = 0 -> null (status / no base power).
 * .accuracy = 0 -> null (always hits).
 *
 * Source: pret/pokeemerald src/data/battle_moves.h
 */
function parseMoves(repoRoot: string): PretMoveData[] {
  const filePath = path.join(repoRoot, POKEEMERALD_ROOT, "src", "data", "battle_moves.h");
  const sourceFile = "pret/pokeemerald src/data/battle_moves.h";
  const content = fs.readFileSync(filePath, "utf-8");

  const moves: PretMoveData[] = [];
  let currentMoveName: string | null = null;
  const currentBlock: string[] = [];

  const flush = (): void => {
    if (!currentMoveName) return;
    const block = currentBlock.join("\n");

    const powerMatch = /\.power\s*=\s*(\d+)/.exec(block);
    const typeMatch = /\.type\s*=\s*(TYPE_\w+)/.exec(block);
    const accuracyMatch = /\.accuracy\s*=\s*(\d+)/.exec(block);
    const ppMatch = /\.pp\s*=\s*(\d+)/.exec(block);
    const priorityMatch = /\.priority\s*=\s*(-?\d+)/.exec(block);

    if (!powerMatch || !typeMatch || !accuracyMatch || !ppMatch || !priorityMatch) {
      currentMoveName = null;
      currentBlock.length = 0;
      return;
    }

    const id = moveConstantToKebab(currentMoveName);
    const rawPower = Number(powerMatch[1]);
    const rawAccuracy = Number(accuracyMatch[1]);
    const typeConst = typeMatch[1] ?? "";
    const type = TYPE_CONSTANT_MAP[typeConst] ?? typeConst.toLowerCase();

    moves.push({
      id,
      priority: Number(priorityMatch[1]),
      power: rawPower === 0 ? null : rawPower,
      accuracy: rawAccuracy === 0 ? null : rawAccuracy,
      pp: Number(ppMatch[1]),
      type,
      source: `${sourceFile} -- [${currentMoveName}]`,
    });

    currentMoveName = null;
    currentBlock.length = 0;
  };

  for (const line of content.split("\n")) {
    const headerMatch = /^\s*\[(\s*MOVE_[A-Z0-9_]+\s*)\]\s*=/.exec(line);
    if (headerMatch) {
      flush();
      currentMoveName = (headerMatch[1] ?? "").trim();
      currentBlock.length = 0;
      currentBlock.push(line);
      continue;
    }

    if (currentMoveName) {
      currentBlock.push(line);
      if (/^\s*\},\s*$/.test(line)) {
        flush();
      }
    }
  }
  flush();

  return moves;
}

// ---------------------------------------------------------------------------
// Base stats parsing
// ---------------------------------------------------------------------------

/**
 * Convert a pokeemerald SPECIES_X constant to a lowercase species name.
 * Example: SPECIES_BULBASAUR -> bulbasaur
 */
function speciesConstantToName(constant: string): string {
  return constant.replace(/^SPECIES_/, "").toLowerCase();
}

/**
 * Parse Gen 3 pokemon base stats from pokeemerald's
 * src/data/pokemon/species_info.h.
 *
 * Format (designated initialiser per species):
 *   [SPECIES_BULBASAUR] = {
 *     .baseHP = 45, .baseAttack = 49, .baseDefense = 49,
 *     .baseSpeed = 45, .baseSpAttack = 65, .baseSpDefense = 65,
 *     .types = { TYPE_GRASS, TYPE_POISON }, ...
 *   }
 *
 * Source: pret/pokeemerald src/data/pokemon/species_info.h
 */
function parsePokemon(repoRoot: string): PretPokemonData[] {
  const filePath = path.join(
    repoRoot,
    POKEEMERALD_ROOT,
    "src",
    "data",
    "pokemon",
    "species_info.h",
  );
  const sourceFile = "pret/pokeemerald src/data/pokemon/species_info.h";
  const content = fs.readFileSync(filePath, "utf-8");

  const pokemon: PretPokemonData[] = [];

  let currentSpeciesName: string | null = null;
  const currentBlock: string[] = [];
  let braceDepth = 0;

  const flush = (): void => {
    if (!currentSpeciesName) return;
    const block = currentBlock.join("\n");

    const hpMatch = /\.baseHP\s*=\s*(\d+)/.exec(block);
    const atkMatch = /\.baseAttack\s*=\s*(\d+)/.exec(block);
    const defMatch = /\.baseDefense\s*=\s*(\d+)/.exec(block);
    const spdMatch = /\.baseSpeed\s*=\s*(\d+)/.exec(block);
    const spAtkMatch = /\.baseSpAttack\s*=\s*(\d+)/.exec(block);
    const spDefMatch = /\.baseSpDefense\s*=\s*(\d+)/.exec(block);
    const typesMatch = /\.types\s*=\s*\{\s*(TYPE_\w+)\s*(?:,\s*(TYPE_\w+)\s*)?\}/.exec(block);

    if (!hpMatch || !atkMatch || !defMatch || !spdMatch || !spAtkMatch || !spDefMatch) {
      currentSpeciesName = null;
      currentBlock.length = 0;
      return;
    }

    const name = speciesConstantToName(currentSpeciesName);
    const types: string[] = [];
    if (typesMatch) {
      const rawT1 = typesMatch[1] ?? "";
      const t1 = TYPE_CONSTANT_MAP[rawT1] ?? rawT1.toLowerCase();
      types.push(t1);
      if (typesMatch[2]) {
        const rawT2 = typesMatch[2];
        const t2 = rawT2 ? (TYPE_CONSTANT_MAP[rawT2] ?? rawT2.toLowerCase()) : t1;
        if (t2 !== t1) types.push(t2);
      }
    }

    pokemon.push({
      name,
      baseStats: {
        hp: Number(hpMatch[1] ?? "0"),
        attack: Number(atkMatch[1] ?? "0"),
        defense: Number(defMatch[1] ?? "0"),
        speed: Number(spdMatch[1] ?? "0"),
        specialAttack: Number(spAtkMatch[1] ?? "0"),
        specialDefense: Number(spDefMatch[1] ?? "0"),
      },
      types,
      source: `${sourceFile} -- [${currentSpeciesName}]`,
    });

    currentSpeciesName = null;
    currentBlock.length = 0;
  };

  for (const line of content.split("\n")) {
    const headerMatch = /^\s*\[(\s*SPECIES_[A-Z0-9_]+\s*)\]\s*=/.exec(line);
    if (headerMatch) {
      flush();
      currentSpeciesName = (headerMatch[1] ?? "").trim();
      currentBlock.length = 0;
      braceDepth = 0;
      currentBlock.push(line);
    } else if (currentSpeciesName) {
      currentBlock.push(line);
    }

    if (currentSpeciesName) {
      for (const ch of line) {
        if (ch === "{") braceDepth++;
        else if (ch === "}") {
          braceDepth--;
          if (braceDepth <= 0) {
            flush();
            break;
          }
        }
      }
    }
  }
  flush();

  return pokemon;
}

// ---------------------------------------------------------------------------
// Type chart parsing
// ---------------------------------------------------------------------------

/**
 * Parse the Gen 3 type effectiveness table from pokeemerald's
 * src/battle_main.c gTypeEffectiveness[] array.
 *
 * Array format -- each row has three tokens:
 *   ATTACKER_TYPE, DEFENDER_TYPE, MULTIPLIER_CONSTANT,
 *
 * Stops at TYPE_FORESIGHT (0xFE) or TYPE_ENDTABLE (0xFF).
 * Entries after TYPE_FORESIGHT are Foresight-specific overrides and
 * must NOT appear in the main type chart.
 *
 * Source: pret/pokeemerald src/battle_main.c gTypeEffectiveness[336]
 */
function parseTypeChart(repoRoot: string): PretTypeChartEntry[] {
  const filePath = path.join(repoRoot, POKEEMERALD_ROOT, "src", "battle_main.c");
  const sourceFile = "pret/pokeemerald src/battle_main.c";
  const content = fs.readFileSync(filePath, "utf-8");

  const arrayMatch = /const u8 gTypeEffectiveness\[\d+\]\s*=\s*\{([\s\S]*?)\};/.exec(content);
  if (!arrayMatch) return [];

  const arrayBody = arrayMatch[1] ?? "";
  const entries: PretTypeChartEntry[] = [];

  for (const rawLine of arrayBody.split("\n")) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;

    const match = /^(TYPE_\w+)\s*,\s*(TYPE_\w+)\s*,\s*(TYPE_MUL_\w+)\s*,?/.exec(line);
    if (!match) continue;

    const [, attackerConst = "", defenderConst = "", mulConst = ""] = match;

    // Stop at Foresight or EndTable sentinels
    if (
      attackerConst === "TYPE_FORESIGHT" ||
      attackerConst === "TYPE_ENDTABLE" ||
      defenderConst === "TYPE_FORESIGHT" ||
      defenderConst === "TYPE_ENDTABLE"
    ) {
      break;
    }

    const attacker = TYPE_CONSTANT_MAP[attackerConst];
    const defender = TYPE_CONSTANT_MAP[defenderConst];
    const multiplier = MULTIPLIER_CONSTANT_MAP[mulConst];

    if (attacker === undefined || defender === undefined || multiplier === undefined) continue;

    entries.push({
      attacker,
      defender,
      multiplier,
      source: `${sourceFile} gTypeEffectiveness[] -- ${attackerConst}, ${defenderConst}, ${mulConst}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read all Gen 3 data from the pokeemerald pret repository.
 *
 * @param repoRoot - Absolute path to the pokemon-lib-ts repository root.
 *   The pokeemerald source is expected at:
 *   <repoRoot>/references/pokeemerald-master/pokeemerald-master/
 *
 * Source: pret/pokeemerald (https://github.com/pret/pokeemerald)
 */
export function readGen3Data(repoRoot: string): PretGenData {
  return {
    gen: 3,
    moves: parseMoves(repoRoot),
    pokemon: parsePokemon(repoRoot),
    typeChart: parseTypeChart(repoRoot),
  };
}
