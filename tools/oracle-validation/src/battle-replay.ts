/**
 * Battle replay validation suite (Tier 1).
 *
 * Reads committed Showdown replay JSON fixtures and validates structural integrity:
 * - HP invariants: HP never negative, never exceeds max
 * - Status legality: status conditions not applied to immune types (Gen-aware)
 * - Type effectiveness: super-effective/resisted markers vs our type chart
 *   (NOTE: skips variable-type moves like Hidden Power, and immune markers which
 *   are often ability-based, not type-chart-based. Immune skipped because Levitate,
 *   Water Absorb, Flash Fire, etc. override the type chart and cannot be validated
 *   without full ability tracking.)
 *
 * Replay fixtures live in tools/oracle-validation/data/replays/genN/.
 * Downloaded from replay.pokemonshowdown.com, converted via replay-parser.
 * No network access in CI — all validation is against committed files.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DataManager, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import { CORE_TYPE_IDS, GEN_NUMBERS, getTypeEffectiveness } from "@pokemon-lib-ts/core";
import { createGen1DataManager } from "@pokemon-lib-ts/gen1";
import { createGen2DataManager } from "@pokemon-lib-ts/gen2";
import { createGen3DataManager } from "@pokemon-lib-ts/gen3";
import { createGen4DataManager } from "@pokemon-lib-ts/gen4";
import { createGen5DataManager } from "@pokemon-lib-ts/gen5";
import { createGen6DataManager } from "@pokemon-lib-ts/gen6";
import { createGen7DataManager } from "@pokemon-lib-ts/gen7";
import { createGen8DataManager } from "@pokemon-lib-ts/gen8";
import { createGen9DataManager } from "@pokemon-lib-ts/gen9";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

const MIN_REPLAYS_REQUIRED = 15;

/**
 * Showdown protocol event type discriminants for ParsedEvent.
 * Use these instead of raw string literals when comparing `event.type`.
 */
const PARSED_EVENT_TYPES = {
  move: "move",
  damage: "damage",
  heal: "heal",
  supereffective: "supereffective",
  resisted: "resisted",
  immune: "immune",
  status: "status",
} as const;

/**
 * Showdown protocol status shortcodes used in replay event data.
 * Use these instead of raw string literals when comparing statusId values.
 */
const SHOWDOWN_STATUS_CODES = {
  burn: "brn",
  poison: "psn",
  badlyPoisoned: "tox",
  freeze: "frz",
  paralysis: "par",
  sleep: "slp",
} as const;

/**
 * Moves with variable type based on IVs/held items — cannot validate effectiveness
 * from move name alone.
 * Source: Bulbapedia "Hidden Power", "Judgment", "Techno Blast", "Natural Gift"
 */
const VARIABLE_TYPE_MOVES = new Set([
  "hidden-power",
  "judgment",
  "techno-blast",
  "multi-attack",
  "natural-gift",
  "weather-ball", // type changes with weather — may not match base chart
]);

const _dmCache = new Map<number, DataManager>();

function getDataManager(gen: number): DataManager {
  if (!_dmCache.has(gen)) {
    const factories: Record<number, () => DataManager> = {
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
    _dmCache.set(gen, (factories[gen] ?? createGen1DataManager)());
  }
  return _dmCache.get(gen) as DataManager;
}

/**
 * Status type immunities per generation.
 * - All gens: Fire immune to burn, Poison/Steel immune to poison/toxic
 * - Gen 2+: Ice immune to freeze
 * - Gen 6+: Electric immune to paralysis
 */
function getStatusImmuneTypes(statusId: string, gen: number): string[] {
  if (statusId === SHOWDOWN_STATUS_CODES.burn) return [CORE_TYPE_IDS.fire];
  if (
    statusId === SHOWDOWN_STATUS_CODES.poison ||
    statusId === SHOWDOWN_STATUS_CODES.badlyPoisoned
  ) {
    return [CORE_TYPE_IDS.poison, CORE_TYPE_IDS.steel];
  }
  if (statusId === SHOWDOWN_STATUS_CODES.freeze && gen >= GEN_NUMBERS.gen2)
    return [CORE_TYPE_IDS.ice];
  if (statusId === SHOWDOWN_STATUS_CODES.paralysis && gen >= GEN_NUMBERS.gen6)
    return [CORE_TYPE_IDS.electric];
  return [];
}

interface ParsedTurn {
  readonly turnNumber: number;
  readonly events: readonly ParsedEvent[];
}

type ParsedEvent =
  | {
      type: "move";
      moveId: string;
      moveName: string;
      targetIdent: { side: number; nickname: string } | null;
    }
  | {
      type: "damage";
      ident: { side: number; nickname: string };
      hp: { current: number; max: number };
    }
  | {
      type: "heal";
      ident: { side: number; nickname: string };
      hp: { current: number; max: number };
    }
  | { type: "supereffective" | "resisted" | "immune" }
  | { type: "status"; ident: { side: number; nickname: string }; statusId: string }
  | { type: string };

interface ParsedTeamMember {
  readonly nickname: string;
  readonly species: string;
}

interface ParsedReplay {
  readonly id: string;
  readonly format: string;
  readonly generation: number;
  readonly players: readonly [string, string];
  readonly teams: readonly [readonly ParsedTeamMember[], readonly ParsedTeamMember[]];
  readonly turns: readonly ParsedTurn[];
  readonly winner: string | null;
}

interface ReplayValidationResult {
  hardFailures: string[]; // HP/status failures — block pass
  typeNotes: string[]; // Type-effectiveness discrepancies — advisory only
}

function resolvePokemon(
  nickname: string,
  side: number,
  teams: readonly [readonly ParsedTeamMember[], readonly ParsedTeamMember[]],
): ParsedTeamMember | null {
  const team = teams[side as 0 | 1];
  if (!team) return null;
  return team.find((p) => p.nickname === nickname) ?? null;
}

function validateReplayStructure(replay: ParsedReplay): ReplayValidationResult {
  const hardFailures: string[] = [];
  const typeNotes: string[] = [];
  const gen = replay.generation > 0 ? replay.generation : 1;
  const dm = getDataManager(gen);
  const typeChart = dm.getTypeChart();

  for (const turn of replay.turns) {
    const events = turn.events;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;

      // -----------------------------------------------------------------------
      // HP invariant: HP must not go below 0 or above max
      // -----------------------------------------------------------------------
      if (
        (event.type === PARSED_EVENT_TYPES.damage || event.type === PARSED_EVENT_TYPES.heal) &&
        "hp" in event
      ) {
        const hpEvent = event as {
          type: string;
          ident: { side: number; nickname: string };
          hp: { current: number; max: number };
        };
        const { current, max } = hpEvent.hp;

        if (current < 0) {
          hardFailures.push(
            `Turn ${turn.turnNumber}: ${hpEvent.ident.nickname} HP went negative (${current}/${max})`,
          );
        }
        if (max > 0 && current > max) {
          hardFailures.push(
            `Turn ${turn.turnNumber}: ${hpEvent.ident.nickname} HP exceeded max (${current}/${max})`,
          );
        }
      }

      // -----------------------------------------------------------------------
      // Type effectiveness: compare our type chart vs Showdown's marker
      // Immune markers are skipped — they're frequently ability-based (Levitate,
      // Water Absorb, Flash Fire, Volt Absorb, etc.) which we don't track here.
      // Type-effectiveness failures are ADVISORY (typeNotes), not hard failures,
      // because Forme changes, Tera, and abilities can cause legitimate disagreements.
      // -----------------------------------------------------------------------
      if (event.type === PARSED_EVENT_TYPES.move && "targetIdent" in event) {
        const moveEvent = event as {
          type: "move";
          moveId: string;
          moveName: string;
          targetIdent: { side: number; nickname: string } | null;
        };
        if (moveEvent.targetIdent === null) continue;

        // Skip moves with variable type (Hidden Power type depends on IVs/DVs)
        if (VARIABLE_TYPE_MOVES.has(moveEvent.moveId)) continue;

        let effectivenessType:
          | typeof PARSED_EVENT_TYPES.supereffective
          | typeof PARSED_EVENT_TYPES.resisted
          | null = null;
        for (let j = i + 1; j < Math.min(i + 4, events.length); j++) {
          const next = events[j];
          if (!next) continue;
          if (next.type === PARSED_EVENT_TYPES.supereffective) {
            effectivenessType = PARSED_EVENT_TYPES.supereffective;
            break;
          }
          if (next.type === PARSED_EVENT_TYPES.resisted) {
            effectivenessType = PARSED_EVENT_TYPES.resisted;
            break;
          }
          // Skip immune — often ability-based, not type-chart-based
          if (next.type === PARSED_EVENT_TYPES.immune || next.type === PARSED_EVENT_TYPES.move)
            break;
        }

        if (effectivenessType === null) continue;

        let moveType: string | null = null;
        try {
          const moveData = dm.getMove(moveEvent.moveId);
          moveType = moveData.type;
          // Skip unknown/variable move types
          if (moveType === CORE_TYPE_IDS.unknown) continue;
        } catch {
          continue;
        }

        const targetPokemon = resolvePokemon(
          moveEvent.targetIdent.nickname,
          moveEvent.targetIdent.side,
          replay.teams,
        );
        if (!targetPokemon) continue;

        let targetTypes: readonly string[] | null = null;
        try {
          const speciesData = dm.getSpeciesByName(targetPokemon.species);
          targetTypes = speciesData.types;
        } catch {
          continue;
        }

        const multiplier = getTypeEffectiveness(
          moveType as PokemonType,
          targetTypes as readonly PokemonType[],
          typeChart as TypeChart,
        );

        if (effectivenessType === PARSED_EVENT_TYPES.supereffective && multiplier < 2) {
          typeNotes.push(
            `Turn ${turn.turnNumber}: "${moveEvent.moveName}" super-effective ` +
              `vs ${targetPokemon.species} (${targetTypes.join("/")}), chart gives ×${multiplier} — may be ability/forme/tera`,
          );
        } else if (effectivenessType === PARSED_EVENT_TYPES.resisted && multiplier > 0.5) {
          typeNotes.push(
            `Turn ${turn.turnNumber}: "${moveEvent.moveName}" resisted ` +
              `vs ${targetPokemon.species} (${targetTypes.join("/")}), chart gives ×${multiplier} — may be ability/forme/tera`,
          );
        }
      }

      // -----------------------------------------------------------------------
      // Status legality: status not applied to immune types (type-based only)
      // -----------------------------------------------------------------------
      if (event.type === PARSED_EVENT_TYPES.status && "statusId" in event) {
        const statusEvent = event as {
          type: "status";
          ident: { side: number; nickname: string };
          statusId: string;
        };
        const immuneTypes = getStatusImmuneTypes(statusEvent.statusId, gen);
        if (immuneTypes.length === 0) continue;

        const afflicted = resolvePokemon(
          statusEvent.ident.nickname,
          statusEvent.ident.side,
          replay.teams,
        );
        if (!afflicted) continue;

        let speciesTypes: readonly string[] | null = null;
        try {
          const speciesData = dm.getSpeciesByName(afflicted.species);
          speciesTypes = speciesData.types;
        } catch {
          continue;
        }

        if (speciesTypes.some((t) => immuneTypes.includes(t))) {
          hardFailures.push(
            `Turn ${turn.turnNumber}: ${afflicted.species} (${speciesTypes.join("/")}) ` +
              `received "${statusEvent.statusId}" but is type-immune (gen ${gen})`,
          );
        }
      }
    }
  }

  return { hardFailures, typeNotes };
}

export function runReplaySuite(generation: ImplementedGeneration, repoRoot: string): SuiteResult {
  const gen = generation.gen;
  const replayDir = join(repoRoot, "tools", "oracle-validation", "data", "replays", `gen${gen}`);

  if (!existsSync(replayDir)) {
    return {
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [],
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
      skipReason: `No replay directory found at data/replays/gen${gen}/`,
    };
  }

  const replayFiles = readdirSync(replayDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (replayFiles.length < MIN_REPLAYS_REQUIRED) {
    return {
      status: "skip",
      suitePassed: false,
      failed: 0,
      skipped: 1,
      failures: [],
      notes: [],
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
      skipReason: `Only ${replayFiles.length} replay(s) — need ${MIN_REPLAYS_REQUIRED}+ for Gen ${gen}`,
    };
  }

  const hardFailures: string[] = [];
  const allTypeNotes: string[] = [];
  const notes: string[] = [];

  for (const file of replayFiles) {
    const filePath = join(replayDir, file);
    let replay: ParsedReplay;
    try {
      replay = JSON.parse(readFileSync(filePath, "utf-8")) as ParsedReplay;
    } catch (err) {
      hardFailures.push(
        `${file}: failed to parse — ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const result = validateReplayStructure(replay);
    for (const f of result.hardFailures) {
      hardFailures.push(`${file}: ${f}`);
    }
    for (const n of result.typeNotes) {
      allTypeNotes.push(`${file}: ${n}`);
    }
  }

  notes.push(`${replayFiles.length} replays validated (Gen ${gen})`);
  if (allTypeNotes.length > 0) {
    notes.push(
      `${allTypeNotes.length} type-effectiveness advisory notes (ability/forme/tera effects not tracked)`,
    );
  }

  if (hardFailures.length > 0) {
    return {
      status: "fail",
      suitePassed: false,
      failed: hardFailures.length,
      skipped: 0,
      failures: hardFailures,
      notes: [...notes, ...allTypeNotes.slice(0, 5)], // Show first 5 type notes as context
      matchedKnownDisagreements: [],
      staleDisagreements: [],
      oracleChecks: [],
    };
  }

  return {
    status: "pass",
    suitePassed: true,
    failed: 0,
    skipped: 0,
    failures: [],
    notes: [...notes, ...allTypeNotes.slice(0, 5)],
    matchedKnownDisagreements: [],
    staleDisagreements: [],
    oracleChecks: [],
  };
}
