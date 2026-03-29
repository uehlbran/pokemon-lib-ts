/**
 * Type definitions for the pret override system.
 *
 * Pret overrides correct values imported from @pkmn/data (Showdown) when the
 * authoritative pret disassembly/decomp source disagrees. For Gen 1-4, pret
 * always wins.
 */

export type OverrideTarget = "move" | "pokemon";

export interface MoveOverride {
  readonly target: "move";
  /** kebab-case move id as it appears in our committed data (e.g., "quick-attack") */
  readonly moveId: string;
  readonly field: "priority" | "power" | "accuracy" | "pp" | "type" | "category";
  readonly value: number | string | null;
  /** Optional: the @pkmn/data value we expect to be replacing. Warn if it changes. */
  readonly showdownValue?: number | string | null;
  /** Pret source citation — must include file and line/symbol */
  readonly source: string;
}

export interface PokemonOverride {
  readonly target: "pokemon";
  /** Pokemon name as it appears in our committed data (e.g., "Bulbasaur") */
  readonly name: string;
  readonly field:
    | "baseStats.hp"
    | "baseStats.attack"
    | "baseStats.defense"
    | "baseStats.speed"
    | "baseStats.spAttack"
    | "baseStats.spDefense"
    | "types";
  readonly value: number | string[];
  readonly showdownValue?: number | string[];
  readonly source: string;
}

export type PretOverride = MoveOverride | PokemonOverride;
