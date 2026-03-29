/**
 * All 18 Pokemon types (as of Gen 6+), plus the special "unknown" sentinel.
 * Gen 1 had 15 (no Dark, Steel, Fairy).
 * Gen 2 added Dark and Steel.
 * Gen 6 added Fairy.
 * "unknown" represents TYPE_MYSTERY/CURSE_TYPE used exclusively by Curse in Gen 2-4.
 *   - Gen 2 (pokecrystal): CURSE_TYPE = 19 (constants/type_constants.asm)
 *   - Gen 3 (pokeemerald): TYPE_MYSTERY = 9 (include/constants/pokemon.h)
 *   - Gen 4 (pokeplatinum): TYPE_MYSTERY = 9 (include/constants/pokemon.h)
 * It is a move type only — no Pokemon has "unknown" as a species type.
 * Generation plugins in the battle library filter this list as needed.
 */
export type PokemonType =
  | "normal"
  | "fire"
  | "water"
  | "electric"
  | "grass"
  | "ice"
  | "fighting"
  | "poison"
  | "ground"
  | "flying"
  | "psychic"
  | "bug"
  | "rock"
  | "ghost"
  | "dragon"
  | "dark"
  | "steel"
  | "fairy"
  | "unknown"; // TYPE_MYSTERY/CURSE_TYPE (Gen 2-4 only, move type sentinel)

/**
 * Types valid as a Pokemon species type (excludes move-only sentinels like "unknown").
 * Use this for species.types, mega types, and regional form types.
 * No Pokemon in any generation has "unknown" as a species type.
 */
export type SpeciesType = Exclude<PokemonType, "unknown">;

/** Number of types per generation — used by battle gen plugins to validate data */
export const TYPES_BY_GEN: Record<number, readonly PokemonType[]> = {
  1: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
  ],
  2: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ],
  3: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ],
  4: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ],
  5: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ],
  6: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ],
  7: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ],
  8: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ],
  9: [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ],
} as const;

/** Supported game generations */
export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Human-readable generation names */
export const GENERATION_NAMES: Record<Generation, string> = {
  1: "Red / Blue / Yellow",
  2: "Gold / Silver / Crystal",
  3: "Ruby / Sapphire / Emerald",
  4: "Diamond / Pearl / Platinum",
  5: "Black / White / B2W2",
  6: "X / Y / ORAS",
  7: "Sun / Moon / USUM",
  8: "Sword / Shield",
  9: "Scarlet / Violet",
} as const;

/** National dex range per generation (cumulative) */
export const DEX_RANGE: Record<Generation, { start: number; end: number }> = {
  1: { start: 1, end: 151 },
  2: { start: 1, end: 251 },
  3: { start: 1, end: 386 },
  4: { start: 1, end: 493 },
  5: { start: 1, end: 649 },
  6: { start: 1, end: 721 },
  7: { start: 1, end: 809 },
  8: { start: 1, end: 905 },
  9: { start: 1, end: 1025 },
} as const;
