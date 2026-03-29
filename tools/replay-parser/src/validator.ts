import type { DataManager, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { getTypeEffectiveness } from "@pokemon-lib-ts/core";
import { createGen1DataManager } from "@pokemon-lib-ts/gen1";
import { createGen2DataManager } from "@pokemon-lib-ts/gen2";
import { createGen3DataManager } from "@pokemon-lib-ts/gen3";
import { createGen4DataManager } from "@pokemon-lib-ts/gen4";
import { createGen5DataManager } from "@pokemon-lib-ts/gen5";
import { createGen6DataManager } from "@pokemon-lib-ts/gen6";
import { createGen7DataManager } from "@pokemon-lib-ts/gen7";
import { createGen8DataManager } from "@pokemon-lib-ts/gen8";
import { createGen9DataManager } from "@pokemon-lib-ts/gen9";
import type {
  ParsedReplay,
  ReconstructedPokemon,
  ValidationMismatch,
  ValidationResult,
} from "./replay-types.js";

// Cache data managers by generation (expensive to create)
const _dataManagerCache = new Map<number, DataManager>();

function getDataManager(generation: number): DataManager {
  if (_dataManagerCache.has(generation)) {
    return _dataManagerCache.get(generation) as DataManager;
  }
  const creators: Record<number, () => DataManager> = {
    1: createGen1DataManager,
    2: createGen2DataManager,
    3: createGen3DataManager,
    4: createGen4DataManager,
    5: createGen5DataManager,
    6: createGen6DataManager,
    7: createGen7DataManager,
    8: createGen8DataManager,
    9: createGen9DataManager,
  };
  const create = creators[generation] ?? createGen1DataManager;
  const dm = create();
  _dataManagerCache.set(generation, dm);
  return dm;
}

/**
 * Status types that are immune to each status condition, by generation.
 * - Gen 2+: Ice types cannot be frozen (Source: Bulbapedia "Freeze")
 * - Gen 6+: Electric types cannot be paralyzed (Source: Bulbapedia "Paralysis")
 * - All gens: Fire types cannot be burned, Poison types cannot be poisoned/badly poisoned
 */
function getStatusImmuneTypes(statusId: string, generation: number): string[] {
  if (statusId === "brn") return ["fire"];
  if (statusId === "psn" || statusId === "tox") return ["poison", "steel"];
  if (statusId === "frz" && generation >= 2) return ["ice"];
  if (statusId === "par" && generation >= 6) return ["electric"];
  return [];
}

/**
 * Resolve a nickname to a ReconstructedPokemon using side (0 = p1, 1 = p2).
 * Searching only the correct team prevents cross-team nickname collisions.
 */
function resolvePokemon(
  nickname: string,
  side: 0 | 1,
  teams: ParsedReplay["teams"],
): ReconstructedPokemon | null {
  const team = teams[side];
  if (!team) return null;
  return team.find((p) => p.nickname === nickname) ?? null;
}

export function validateReplay(replay: ParsedReplay): ValidationResult {
  const generation = replay.generation > 0 ? replay.generation : 1;
  const dm = getDataManager(generation);
  const typeChart = dm.getTypeChart();
  const mismatches: ValidationMismatch[] = [];
  let passed = 0;

  for (const turn of replay.turns) {
    const events = turn.events;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;

      // -----------------------------------------------------------------------
      // Type effectiveness validation
      // When we see a move event, look ahead for an effectiveness event
      // -----------------------------------------------------------------------
      if (event.type === "move" && event.targetIdent !== null) {
        const moveEvent = event;

        // Look ahead up to 3 events for an effectiveness marker
        let effectivenessType: "supereffective" | "resisted" | "immune" | null = null;
        for (let j = i + 1; j < Math.min(i + 4, events.length); j++) {
          const next = events[j];
          if (!next) continue;
          if (
            next.type === "supereffective" ||
            next.type === "resisted" ||
            next.type === "immune"
          ) {
            effectivenessType = next.type;
            break;
          }
          // Stop scanning if we hit another move event (new action sequence)
          if (next.type === "move") break;
        }

        // Only validate if we found an effectiveness marker
        if (effectivenessType !== null) {
          // targetIdent is non-null here: the outer guard is `event.targetIdent !== null`
          const targetNickname = moveEvent.targetIdent?.nickname ?? "";

          // Resolve move type
          let moveType: string | null = null;
          try {
            const moveData = dm.getMove(moveEvent.moveId);
            moveType = moveData.type;
          } catch {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "info",
              check: "type-effectiveness",
              message: `Unknown move "${moveEvent.moveId}" — skipping effectiveness check`,
            });
            continue;
          }

          // Resolve target species — use side from ident to avoid cross-team nickname collisions
          const targetPokemon = resolvePokemon(
            targetNickname,
            moveEvent.targetIdent?.side ?? 0,
            replay.teams,
          );
          if (targetPokemon === null) {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "info",
              check: "type-effectiveness",
              message: `Cannot resolve target "${targetNickname}" to a species — skipping effectiveness check`,
            });
            continue;
          }

          // Resolve target species types
          let targetTypes: readonly string[] | null = null;
          try {
            const speciesData = dm.getSpeciesByName(targetPokemon.species);
            targetTypes = speciesData.types;
          } catch {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "info",
              check: "type-effectiveness",
              message: `Unknown species "${targetPokemon.species}" — skipping effectiveness check`,
            });
            continue;
          }

          // Calculate our expected effectiveness.
          // moveType and targetTypes come from DataManager which uses PokemonType,
          // so the cast is safe. TypeChart is indexed by PokemonType.
          const multiplier = getTypeEffectiveness(
            moveType as PokemonType,
            targetTypes as readonly PokemonType[],
            typeChart as TypeChart,
          );

          // Compare Showdown's claim to our calculation
          let mismatchMessage: string | null = null;
          if (effectivenessType === "supereffective" && multiplier < 2) {
            mismatchMessage =
              `Showdown says "${moveEvent.moveName}" is super-effective vs ${targetPokemon.species} ` +
              `(${targetTypes.join("/")}), but our chart gives ×${multiplier}`;
          } else if (effectivenessType === "resisted" && multiplier > 0.5) {
            mismatchMessage =
              `Showdown says "${moveEvent.moveName}" is resisted vs ${targetPokemon.species} ` +
              `(${targetTypes.join("/")}), but our chart gives ×${multiplier}`;
          } else if (effectivenessType === "immune" && multiplier !== 0) {
            mismatchMessage =
              `Showdown says "${moveEvent.moveName}" is immune vs ${targetPokemon.species} ` +
              `(${targetTypes.join("/")}), but our chart gives ×${multiplier}`;
          }

          if (mismatchMessage !== null) {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "error",
              check: "type-effectiveness",
              message: mismatchMessage,
            });
          } else {
            passed++;
          }
        }
      }

      // -----------------------------------------------------------------------
      // Status legality validation
      // -----------------------------------------------------------------------
      if (event.type === "status") {
        const statusEvent = event;
        const immuneTypes = getStatusImmuneTypes(statusEvent.statusId, generation);

        // Only validate if we know the immunity rule for this status
        if (immuneTypes.length > 0) {
          const afflictedNickname = statusEvent.ident.nickname;
          const afflictedPokemon = resolvePokemon(
            afflictedNickname,
            statusEvent.ident.side,
            replay.teams,
          );

          if (afflictedPokemon === null) {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "info",
              check: "status-legality",
              message: `Cannot resolve "${afflictedNickname}" to a species — skipping status check`,
            });
            continue;
          }

          let speciesTypes: readonly string[] | null = null;
          try {
            const speciesData = dm.getSpeciesByName(afflictedPokemon.species);
            speciesTypes = speciesData.types;
          } catch {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "info",
              check: "status-legality",
              message: `Unknown species "${afflictedPokemon.species}" — skipping status check`,
            });
            continue;
          }

          // Check if any of the species' types grant immunity to this status
          const isImmune = speciesTypes.some((t) => immuneTypes.includes(t));
          if (isImmune) {
            mismatches.push({
              turnNumber: turn.turnNumber,
              severity: "error",
              check: "status-legality",
              message:
                `${afflictedPokemon.species} (${speciesTypes.join("/")}) received status ` +
                `"${statusEvent.statusId}" but is immune due to its type`,
            });
          } else {
            passed++;
          }
        }
      }
    }
  }

  return {
    replayId: replay.id,
    format: replay.format,
    totalTurns: replay.turns.length,
    winner: replay.winner,
    passed,
    mismatches,
  };
}
