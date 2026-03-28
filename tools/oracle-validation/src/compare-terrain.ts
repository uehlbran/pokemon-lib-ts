/**
 * Terrain Documentation Suite
 *
 * Documents terrain boost mechanics per generation. This suite records known
 * mechanic values and errata — it does NOT perform live oracle comparisons.
 * Terrain boost verification against replays is deferred to the replay suite (PR4).
 *
 * Source authority:
 *   Gen 6:   Pokemon Showdown (terrain introduced)
 *   Gen 7:   Pokemon Showdown sim/battle-actions.ts — 1.5× boost
 *   Gen 8+:  Pokemon Showdown sim/battle-actions.ts — 1.3× boost (nerf in Sw/Sh)
 *
 * ERRATA #17: Electric Terrain boost changed from 1.5× (Gen 7) to 1.3× (Gen 8+).
 * ERRATA #27: Misty Terrain halves Dragon-type damage only vs grounded targets,
 *             NOT all damage types.
 */

import { type KnownDisagreement, resolveOracleChecks } from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

const TERRAIN_SUITE_NAME = "terrain";
const TERRAIN_SKIP_REASON = "Terrain not available in Gen 1-5";

/**
 * Notes documenting Gen 6 terrain mechanics.
 * Gen 6 introduced terrains at 1.5× boost; the 1.3× nerf did not happen until Gen 8.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 6 branch)
 */
const GEN6_TERRAIN_NOTES: readonly string[] = [
  "Gen 6: Terrains introduced — Electric, Grassy, and Misty Terrain available",
  "Gen 6: Electric Terrain boost: 1.5× for grounded Electric-type moves",
  "Gen 6: Grassy Terrain boost: 1.5× for grounded Grass-type moves; restores 1/16 HP per turn",
  "Gen 6: Misty Terrain: halves Dragon-type damage vs grounded targets only (ERRATA #27 — NOT all damage types)",
  "Gen 6: Terrain duration: 5 turns base, 8 turns with Terrain Extender",
  "Gen 6: Psychic Terrain not yet available (introduced in Gen 7)",
];

/**
 * Notes documenting Gen 7 terrain mechanics.
 * Gen 7 introduced Psychic Terrain and kept the 1.5× boost from Gen 6.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 7 branch)
 */
const GEN7_TERRAIN_NOTES: readonly string[] = [
  "Gen 7: Electric Terrain boost: 1.5× for grounded Electric-type moves (NOT 1.3× — that is Gen 8+, ERRATA #17)",
  "Gen 7: Grassy Terrain boost: 1.5× for grounded Grass-type moves",
  "Gen 7: Misty Terrain: halves Dragon-type damage vs grounded targets only (ERRATA #27 — NOT all damage types)",
  "Gen 7: Psychic Terrain boost: 1.5× for grounded Psychic-type moves; blocks priority moves vs grounded targets",
  "Gen 7: Terrain duration: 5 turns base, 8 turns with Terrain Extender",
];

/**
 * Notes documenting Gen 8+ terrain mechanics.
 * Gen 8 (Sword/Shield) nerfed all terrain boosts from 1.5× to 1.3×.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 8 branch)
 * ERRATA #17: terrain boost nerf from 1.5× to 1.3× in Gen 8.
 */
const GEN8_PLUS_TERRAIN_NOTES: readonly string[] = [
  "Gen 8+: Electric Terrain boost: 1.3× for grounded Electric-type moves (nerfed from 1.5× in Gen 7, ERRATA #17)",
  "Gen 8+: Grassy Terrain boost: 1.3× for grounded Grass-type moves (nerfed from 1.5× in Gen 7)",
  "Gen 8+: Misty Terrain: halves Dragon-type damage vs grounded targets only (ERRATA #27 — NOT all damage types)",
  "Gen 8+: Psychic Terrain boost: 1.3× for grounded Psychic-type moves (nerfed from 1.5× in Gen 7)",
  "Gen 8+: Terrain duration: 5 turns base, 8 turns with Terrain Extender",
];

/**
 * Run the terrain documentation suite for a single generation.
 *
 * For gens 1-5: returns status "skip" (terrain not available).
 * For gen 6+: returns status "pass" with notes documenting terrain boost values.
 */
export function runTerrainSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const gen = generation.gen;

  if (gen <= 5) {
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
      skipReason: TERRAIN_SKIP_REASON,
    };
  }

  let terrainNotes: readonly string[];
  if (gen === 6) {
    terrainNotes = GEN6_TERRAIN_NOTES;
  } else if (gen === 7) {
    terrainNotes = GEN7_TERRAIN_NOTES;
  } else {
    terrainNotes = GEN8_PLUS_TERRAIN_NOTES;
  }

  // Resolve against the registry to catch any misplaced known-disagreement entries
  // (this suite performs no live comparisons, so oracleChecks is always empty)
  const resolved = resolveOracleChecks(TERRAIN_SUITE_NAME, [], knownDisagreements);
  const failures = [...resolved.failures];

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes: [...terrainNotes],
    matchedKnownDisagreements: resolved.matchedKnownDisagreements,
    staleDisagreements: resolved.staleDisagreements,
    oracleChecks: [],
  };
}
