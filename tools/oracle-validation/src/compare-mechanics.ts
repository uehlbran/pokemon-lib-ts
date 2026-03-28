import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface LocalMove {
  readonly id: string;
  readonly priority: number;
}

interface LocalAbilities {
  readonly normal: readonly string[];
  readonly hidden: string | null;
}

interface LocalSpecies {
  readonly id: number;
  readonly name: string;
  readonly abilities?: LocalAbilities;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORACLE_GENERATIONS = new Generations(Dex);
const MECHANICS_SUITE_NAME = "mechanics";

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCheckId(generation: ImplementedGeneration, scope: string, target: string): string {
  return `gen${generation.gen}:${MECHANICS_SUITE_NAME}:${scope}:${target}`;
}

function normalizeMoveId(id: string): string {
  return id.toLowerCase().replaceAll(/[^a-z0-9-]/g, "");
}

function normalizeSpeciesId(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

// ── Main suite function ────────────────────────────────────────────────────────

/**
 * Run the mechanics oracle suite for a single generation.
 *
 * Checks:
 * 1. Move priority values — for all gens, compares our moves.json priority
 *    against @pkmn/data for every move with a non-zero priority in either source.
 * 2. Ability assignment — for Gen 3+ only, compares our pokemon.json
 *    abilities.normal[0] (first ability) against @pkmn/data species abilities slot 0.
 *
 * Source authority:
 *   Gen 1-2: pret/pokered, pret/pokecrystal
 *   Gen 3:   pret/pokeemerald
 *   Gen 4:   pret/pokeplatinum
 *   Gen 5-9: Pokemon Showdown
 */
export function runMechanicsSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const failures: string[] = [];
  const notes: string[] = [];
  const oracleChecks: OracleCheck[] = [];

  const oracle = ORACLE_GENERATIONS.get(generation.gen);

  // ── 1. Move Priority ───────────────────────────────────────────────────────

  const localMoves = JSON.parse(
    readFileSync(join(generation.dataDir, "moves.json"), "utf8"),
  ) as LocalMove[];

  let movePriorityChecked = 0;

  for (const move of localMoves) {
    const moveId = normalizeMoveId(move.id);
    const oracleMove = oracle.moves.get(moveId);

    if (!oracleMove?.exists) {
      // Move not found in oracle for this gen — skip
      continue;
    }

    const ourPriority = move.priority;
    const oraclePriority = oracleMove.priority ?? 0;

    // Skip moves where both are 0 — not interesting
    if (ourPriority === 0 && oraclePriority === 0) {
      continue;
    }

    oracleChecks.push({
      id: buildCheckId(generation, "move-priority", moveId),
      suite: MECHANICS_SUITE_NAME,
      description: `Move ${move.id} priority matches @pkmn/data`,
      ourValue: ourPriority,
      oracleValue: oraclePriority,
    });

    movePriorityChecked += 1;
  }

  notes.push(
    `Gen ${generation.gen}: checked ${movePriorityChecked} move${movePriorityChecked === 1 ? "" : "s"} with non-zero priority`,
  );

  // ── 2. Ability Assignment (Gen 3+ only) ────────────────────────────────────

  if (generation.gen >= 3) {
    const localPokemon = JSON.parse(
      readFileSync(join(generation.dataDir, "pokemon.json"), "utf8"),
    ) as LocalSpecies[];

    let abilityChecked = 0;

    for (const species of localPokemon) {
      // Skip species without ability data (Gen 1-2 compat guard — redundant but safe)
      if (!species.abilities) {
        continue;
      }

      const speciesSlug = normalizeSpeciesId(species.name);
      const oracleSpecies = oracle.species.get(species.name);

      // Only compare base-species entries
      if (!oracleSpecies?.exists) {
        continue;
      }
      if (oracleSpecies.baseSpecies !== oracleSpecies.name) {
        continue;
      }

      // Our first ability (slot 0 / normal[0])
      const ourFirstAbility = species.abilities.normal[0] ?? null;

      // @pkmn/data ability slot "0" is the first non-hidden ability
      // Normalize to lowercase, strip non-alphanumeric except hyphens, convert spaces to hyphens.
      // Example: "Dragon's Maw" → "dragons-maw", matching our data's "dragons-maw".
      const oracleAbility0 = oracleSpecies.abilities["0"] ?? null;
      const oracleFirstAbility =
        oracleAbility0 !== null
          ? oracleAbility0
              .toLowerCase()
              .replaceAll(/[^a-z0-9\s-]/g, "")
              .trim()
              .replaceAll(/\s+/g, "-")
          : null;

      oracleChecks.push({
        id: buildCheckId(generation, "ability-slot0", speciesSlug),
        suite: MECHANICS_SUITE_NAME,
        description: `Species ${species.name} first ability (slot 0) matches @pkmn/data`,
        ourValue: ourFirstAbility,
        oracleValue: oracleFirstAbility,
      });

      abilityChecked += 1;
    }

    notes.push(`Gen ${generation.gen}: checked ${abilityChecked} species for ability slot 0`);
  }

  // ── Resolve oracle checks against known disagreements ─────────────────────

  const resolvedOracleChecks = resolveOracleChecks(
    MECHANICS_SUITE_NAME,
    oracleChecks,
    knownDisagreements,
  );
  failures.push(...resolvedOracleChecks.failures);
  notes.push(
    ...resolvedOracleChecks.matchedKnownDisagreements.map(
      (id) => `Known disagreement matched registry: ${id}`,
    ),
  );
  notes.push(
    ...resolvedOracleChecks.staleDisagreements.map((id) => `Stale disagreement detected: ${id}`),
  );

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
    matchedKnownDisagreements: resolvedOracleChecks.matchedKnownDisagreements,
    staleDisagreements: resolvedOracleChecks.staleDisagreements,
    oracleChecks,
  };
}
