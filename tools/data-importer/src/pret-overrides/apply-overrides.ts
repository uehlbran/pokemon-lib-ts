/**
 * Pret override application engine.
 *
 * Applies pret authority overrides to data arrays produced by the importer
 * (moves, pokemon). For Gen 1-4, pret values always win over @pkmn/data.
 *
 * Validation rules:
 * - Missing target (move/pokemon not found): hard error
 * - Override that does not change anything: hard error (stale)
 * - showdownValue mismatch: warning (Showdown may have been updated)
 */

import { GEN_NUMBERS } from "@pokemon-lib-ts/core";
import type { MoveOverride, PokemonOverride, PretOverride } from "./types";

// ---------------------------------------------------------------------------
// Output data shapes (must match what buildMovesData / buildPokemonData return)
// Exported so import-gen.ts can type its builder return values without unsafe casts.
// ---------------------------------------------------------------------------

export interface ImportedMove {
  id: string;
  priority: number;
  power: number | null;
  accuracy: number | null;
  pp: number;
  type: string;
  category: "physical" | "special" | "status";
  [key: string]: unknown;
}

export interface ImportedStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  spAttack: number;
  spDefense: number;
}

export interface ImportedPokemon {
  name: string;
  baseStats: ImportedStats;
  types: string[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Gen 2 base priority constant (1-based pokecrystal scale)
// ---------------------------------------------------------------------------

const GEN2_BASE_PRIORITY = 1;

// ---------------------------------------------------------------------------
// Apply overrides to moves array
// ---------------------------------------------------------------------------

export function applyMoveOverrides(
  gen: number,
  moves: ImportedMove[],
  overrides: readonly PretOverride[],
): ImportedMove[] {
  // For Gen 2, first apply the bulk priority scale shift: all priority=0 → 1
  const result =
    gen === GEN_NUMBERS.gen2 ? applyGen2PriorityScale(moves) : moves.map((m) => ({ ...m }));

  const moveOverrides = overrides.filter((o): o is MoveOverride => o.target === "move");

  for (const override of moveOverrides) {
    const move = result.find((m) => m.id === override.moveId);
    if (!move) {
      throw new Error(
        `[pret-overrides] Move override target not found: "${override.moveId}" (gen ${gen})`,
      );
    }

    const currentValue = move[override.field];

    // Warn if showdownValue no longer matches (Showdown may have been updated)
    if (override.showdownValue !== undefined) {
      const baseline = override.showdownValue;
      if (currentValue !== baseline && currentValue !== override.value) {
        console.warn(
          `[pret-overrides] WARNING: Move "${override.moveId}" field "${override.field}" ` +
            `has value ${JSON.stringify(currentValue)}, expected Showdown value ` +
            `${JSON.stringify(baseline)}. Showdown may have been updated.`,
        );
      }
    }

    // Hard error if override changes nothing
    if (currentValue === override.value) {
      throw new Error(
        `[pret-overrides] Stale override: move "${override.moveId}" field "${override.field}" ` +
          `already has value ${JSON.stringify(override.value)} — remove or update this override.`,
      );
    }

    (move as Record<string, unknown>)[override.field] = override.value;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Apply Gen 2 priority scale: all priority=0 → BASE_PRIORITY (1)
// ---------------------------------------------------------------------------

function applyGen2PriorityScale(moves: ImportedMove[]): ImportedMove[] {
  return moves.map((m) => {
    if (m.priority === 0) {
      return { ...m, priority: GEN2_BASE_PRIORITY };
    }
    return { ...m };
  });
}

// ---------------------------------------------------------------------------
// Apply overrides to pokemon array
// ---------------------------------------------------------------------------

export function applyPokemonOverrides(
  gen: number,
  pokemon: ImportedPokemon[],
  overrides: readonly PretOverride[],
): ImportedPokemon[] {
  const result = pokemon.map((p) => ({
    ...p,
    baseStats: { ...p.baseStats },
    types: [...p.types],
  }));

  const pokemonOverrides = overrides.filter((o): o is PokemonOverride => o.target === "pokemon");

  for (const override of pokemonOverrides) {
    const mon = result.find((p) => p.name.toLowerCase() === override.name.toLowerCase());
    if (!mon) {
      throw new Error(
        `[pret-overrides] Pokemon override target not found: "${override.name}" (gen ${gen})`,
      );
    }

    // Navigate the field path (supports "baseStats.hp" etc.)
    const parts = override.field.split(".");
    const part0 = parts[0] ?? "";
    const part1 = parts[1];
    let currentValue: unknown;
    if (parts.length === 1) {
      currentValue = (mon as Record<string, unknown>)[part0];
    } else if (parts.length === 2 && part0 === "baseStats" && part1 !== undefined) {
      currentValue = mon.baseStats[part1 as keyof ImportedStats];
    } else {
      throw new Error(`[pret-overrides] Unsupported field path: "${override.field}"`);
    }

    if (JSON.stringify(currentValue) === JSON.stringify(override.value)) {
      throw new Error(
        `[pret-overrides] Stale override: pokemon "${override.name}" field "${override.field}" ` +
          `already has value ${JSON.stringify(override.value)} — remove or update this override.`,
      );
    }

    if (parts.length === 1) {
      (mon as Record<string, unknown>)[part0] = override.value;
    } else if (part0 === "baseStats" && part1 !== undefined) {
      (mon.baseStats as Record<string, unknown>)[part1] = override.value;
    }
  }

  return result;
}
