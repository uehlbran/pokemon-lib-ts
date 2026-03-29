/**
 * Gen 4 pret reader - reads battle data from pokeplatinum.
 *
 * Sources:
 *   - Moves: pret/pokeplatinum res/battle/moves/{name}/data.json
 *   - Pokemon: pret/pokeplatinum res/pokemon/{name}/data.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { PretGenData, PretMoveData, PretPokemonData } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POKEPLATINUM_ROOT = path.join("references", "pokeplatinum-main", "pokeplatinum-main");

// Move class to category mapping.
// Source: pret/pokeplatinum res/battle/moves/aqua_jet/data.json -- class field
const CLASS_MAP: Readonly<Record<string, "physical" | "special" | "status">> = {
  CLASS_PHYSICAL: "physical",
  CLASS_SPECIAL: "special",
  CLASS_STATUS: "status",
};

// Type constant to lowercase name.
// Source: pret/pokeplatinum res/battle/moves/aqua_jet/data.json -- type field
const TYPE_MAP: Readonly<Record<string, string>> = {
  TYPE_NORMAL: "normal",
  TYPE_FIRE: "fire",
  TYPE_WATER: "water",
  TYPE_ELECTRIC: "electric",
  TYPE_GRASS: "grass",
  TYPE_ICE: "ice",
  TYPE_FIGHTING: "fighting",
  TYPE_POISON: "poison",
  TYPE_GROUND: "ground",
  TYPE_FLYING: "flying",
  TYPE_PSYCHIC: "psychic",
  TYPE_BUG: "bug",
  TYPE_ROCK: "rock",
  TYPE_GHOST: "ghost",
  TYPE_DRAGON: "dragon",
  TYPE_DARK: "dark",
  TYPE_STEEL: "steel",
};

// ---------------------------------------------------------------------------
// Move name normalisation
// ---------------------------------------------------------------------------

/**
 * Convert a pokeplatinum move directory name (snake_case) to a kebab-case ID.
 * Example: aqua_jet -> aqua-jet
 *
 * Source: pret/pokeplatinum res/battle/moves/ directory names
 */
function dirNameToMoveId(dirName: string): string {
  return dirName.replace(/_/g, "-");
}

// ---------------------------------------------------------------------------
// Move data interface (for JSON parsing)
// ---------------------------------------------------------------------------

interface Gen4MoveJson {
  name: string;
  class: string;
  type: string;
  power: number;
  accuracy: number;
  pp: number;
  priority: number;
}

// ---------------------------------------------------------------------------
// Move parsing
// ---------------------------------------------------------------------------

/**
 * Parse Gen 4 moves from pokeplatinum's res/battle/moves/{name}/data.json.
 *
 * Each named subdirectory (non-numeric) has a data.json with:
 *   name, class, type, power, accuracy, pp, priority, effect, range, flags
 *
 * Skip:
 *   - Directories with all-digit names (placeholders like 0000, 0468-0500)
 *   - Entries with no meaningful name (name is "-" or empty)
 *
 * power = 0 -> null (status move with no base power).
 * accuracy = 0 -> null (always hits).
 *
 * Source: pret/pokeplatinum res/battle/moves/{name}/data.json
 */
function parseMoves(repoRoot: string): PretMoveData[] {
  const movesDir = path.join(repoRoot, POKEPLATINUM_ROOT, "res", "battle", "moves");
  const sourceBase = "pret/pokeplatinum res/battle/moves";

  const entries = fs.readdirSync(movesDir);
  const moves: PretMoveData[] = [];

  for (const entry of entries) {
    // Skip numeric-only directory names (placeholders 0000, 0468-0500)
    if (/^\d+$/.test(entry)) continue;

    const dataPath = path.join(movesDir, entry, "data.json");
    if (!fs.existsSync(dataPath)) continue;

    const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8")) as Gen4MoveJson;

    // Skip entries with no meaningful name
    if (!raw.name || raw.name === "-") continue;

    const id = dirNameToMoveId(entry);
    const category = CLASS_MAP[raw.class];
    const type = TYPE_MAP[raw.type] ?? raw.type.toLowerCase();
    const rawPower = raw.power;
    const rawAccuracy = raw.accuracy;

    moves.push({
      id,
      priority: raw.priority,
      power: rawPower === 0 ? null : rawPower,
      accuracy: rawAccuracy === 0 ? null : rawAccuracy,
      pp: raw.pp,
      type,
      category,
      source: `${sourceBase}/${entry}/data.json -- priority field`,
    });
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Pokemon data interface (for JSON parsing)
// ---------------------------------------------------------------------------

interface Gen4PokemonJson {
  base_stats: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    special_attack: number;
    special_defense: number;
  };
  types: string[];
}

// ---------------------------------------------------------------------------
// Pokemon parsing
// ---------------------------------------------------------------------------

/**
 * Parse Gen 4 pokemon base stats from pokeplatinum's res/pokemon/{name}/data.json.
 *
 * Each subdirectory named after the pokemon (lowercase) has a data.json with:
 *   base_stats: { hp, attack, defense, speed, special_attack, special_defense }
 *   types: ["TYPE_WATER", "TYPE_STEEL"]
 *
 * Deduplicate types (some single-type pokemon list the same type twice).
 *
 * Source: pret/pokeplatinum res/pokemon/{name}/data.json
 */
function parsePokemon(repoRoot: string): PretPokemonData[] {
  const pokemonDir = path.join(repoRoot, POKEPLATINUM_ROOT, "res", "pokemon");
  const sourceBase = "pret/pokeplatinum res/pokemon";

  const entries = fs.readdirSync(pokemonDir);
  const pokemon: PretPokemonData[] = [];

  for (const entry of entries) {
    // Skip hidden/special directories
    if (entry.startsWith(".")) continue;

    const dataPath = path.join(pokemonDir, entry, "data.json");
    if (!fs.existsSync(dataPath)) continue;

    const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8")) as Gen4PokemonJson;

    if (!raw.base_stats) continue;

    // Deduplicate types
    const rawTypes: string[] = raw.types ?? [];
    const seenTypes = new Set<string>();
    const types: string[] = [];
    for (const typeConst of rawTypes) {
      const typeName = TYPE_MAP[typeConst] ?? typeConst.toLowerCase();
      if (!seenTypes.has(typeName)) {
        seenTypes.add(typeName);
        types.push(typeName);
      }
    }

    pokemon.push({
      name: entry,
      baseStats: {
        hp: raw.base_stats.hp,
        attack: raw.base_stats.attack,
        defense: raw.base_stats.defense,
        speed: raw.base_stats.speed,
        specialAttack: raw.base_stats.special_attack,
        specialDefense: raw.base_stats.special_defense,
      },
      types,
      source: `${sourceBase}/${entry}/data.json`,
    });
  }

  return pokemon;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read all Gen 4 data from the pokeplatinum pret repository.
 *
 * @param repoRoot - Absolute path to the pokemon-lib-ts repository root.
 *   The pokeplatinum source is expected at:
 *   <repoRoot>/references/pokeplatinum-main/pokeplatinum-main/
 *
 * Note: Gen 4 does not use a C type effectiveness array in the same format
 * as Gen 3; type chart data is not currently parsed from pokeplatinum.
 * The typeChart array is returned empty -- consumers should use the Gen 3
 * type chart (which is identical in Gen 4 mechanics).
 *
 * Source: pret/pokeplatinum (https://github.com/pret/pokeplatinum)
 */
export function readGen4Data(repoRoot: string): PretGenData {
  return {
    gen: 4,
    moves: parseMoves(repoRoot),
    pokemon: parsePokemon(repoRoot),
    typeChart: [],
  };
}
