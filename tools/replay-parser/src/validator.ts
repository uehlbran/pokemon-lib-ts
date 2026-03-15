import { getTypeEffectiveness } from "@pokemon-lib/core";
import type { DataManager, PokemonType, TypeChart } from "@pokemon-lib/core";
import { createGen1DataManager } from "@pokemon-lib/gen1";
import type {
  ParsedReplay,
  ReconstructedPokemon,
  ValidationMismatch,
  ValidationResult,
} from "./replay-types.js";

// Cache the data manager (expensive to create)
let cachedDm: DataManager | null = null;
function getDataManager(): DataManager {
  if (!cachedDm) cachedDm = createGen1DataManager();
  return cachedDm;
}

/** Status IDs that are immune to each status condition (Gen 1 rules).
 * Note: Electric paralysis immunity and Ice freeze immunity were introduced
 * in later generations (Gen 6+ and Gen 2+ respectively), NOT Gen 1.
 */
const STATUS_IMMUNE_TYPES: Record<string, string[]> = {
  brn: ["fire"],
  psn: ["poison"],
  tox: ["poison"],
};

/**
 * Resolve a nickname to a ReconstructedPokemon by searching both teams.
 */
function resolvePokemon(
  nickname: string,
  teams: ParsedReplay["teams"],
): ReconstructedPokemon | null {
  for (const team of teams) {
    const found = team.find((p) => p.nickname === nickname);
    if (found) return found;
  }
  return null;
}

export function validateReplay(replay: ParsedReplay): ValidationResult {
  const dm = getDataManager();
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

          // Resolve target species
          const targetPokemon = resolvePokemon(targetNickname, replay.teams);
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
        const immuneTypes = STATUS_IMMUNE_TYPES[statusEvent.statusId];

        // Only validate if we know the immunity rule for this status
        if (immuneTypes !== undefined) {
          const afflictedNickname = statusEvent.ident.nickname;
          const afflictedPokemon = resolvePokemon(afflictedNickname, replay.teams);

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
