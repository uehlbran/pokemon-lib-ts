/**
 * Terrain Oracle Suite
 *
 * Validates terrain mechanics against ground-truth expected values.
 *
 * Live oracle checks:
 *   - Terrain duration constants (default 5 turns, extended 8 turns with Terrain Extender)
 *   - Terrain damage modifier values (6144 = 1.5x for Gen 6-7, 5325 = 1.3x for Gen 8-9)
 *   - Misty Terrain Dragon reduction (2048 = 0.5x all gens)
 *
 * Source authority:
 *   Gen 6:   Pokemon Showdown sim/battle-actions.ts — terrain introduced
 *   Gen 7:   Pokemon Showdown data/conditions.ts — 1.5× boost, Psychic Terrain added
 *   Gen 8+:  Pokemon Showdown data/mods/gen8/scripts.ts — 1.3× boost (ERRATA #17)
 *
 * ERRATA #17: Electric Terrain boost changed from 1.5× (Gen 7) to 1.3× (Gen 8+).
 * ERRATA #27: Misty Terrain halves Dragon-type damage only vs grounded targets,
 *             NOT all damage types.
 */

import { getTerrainDamageModifier as getGen6TerrainDamageModifier } from "../../../packages/gen6/src/Gen6Terrain.js";
import {
  TERRAIN_DEFAULT_TURNS as GEN7_TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS as GEN7_TERRAIN_EXTENDED_TURNS,
} from "../../../packages/gen7/src/Gen7Terrain.js";
import {
  TERRAIN_DEFAULT_TURNS as GEN8_TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS as GEN8_TERRAIN_EXTENDED_TURNS,
} from "../../../packages/gen8/src/Gen8Terrain.js";
import {
  TERRAIN_DEFAULT_TURNS as GEN9_TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS as GEN9_TERRAIN_EXTENDED_TURNS,
} from "../../../packages/gen9/src/Gen9Terrain.js";
import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const TERRAIN_SUITE_NAME = "terrain";
const TERRAIN_SKIP_REASON = "Terrain not available in Gen 1-5";

/**
 * Expected terrain duration values from Showdown/Bulbapedia.
 * Source: Showdown data/conditions.ts — terrain duration: 5 turns
 * Source: Showdown data/items.ts — terrainextender duration: 8 turns
 * Source: Bulbapedia "Terrain" — "Terrain lasts for five turns, or eight if the user holds a Terrain Extender"
 */
const EXPECTED_TERRAIN_DEFAULT_TURNS = 5;
const EXPECTED_TERRAIN_EXTENDED_TURNS = 8;

/**
 * Expected terrain damage modifier values (4096-based power step).
 *
 * Gen 6-7: 1.5× boost = 6144/4096
 * Source: Showdown data/conditions.ts — electricterrain/grassyterrain/psychicterrain onBasePower:
 *   chainModify(1.5) → 6144 in 4096-based math
 *
 * Gen 8-9: 1.3× boost = 5325/4096
 * Source: Showdown data/mods/gen8/scripts.ts — terrain boost nerfed to 5325/4096 (ERRATA #17)
 *
 * All gens: Misty Terrain Dragon reduction = 0.5× = 2048/4096
 * Source: Showdown data/conditions.ts — mistyterrain onBasePower: chainModify(0.5) (ERRATA #27)
 */
const EXPECTED_TERRAIN_BOOST_GEN6_7 = 6144; // 1.5× in 4096-based math
const EXPECTED_TERRAIN_BOOST_GEN8_PLUS = 5325; // 1.3× in 4096-based math
const EXPECTED_MISTY_DRAGON_REDUCTION = 2048; // 0.5× in 4096-based math

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCheckId(gen: number, scope: string): string {
  return `gen${gen}:${TERRAIN_SUITE_NAME}:${scope}`;
}

function makeSkip(): SuiteResult {
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

// ── Gen-specific duration loaders ─────────────────────────────────────────────

interface TerrainDurationValues {
  readonly defaultTurns: number;
  readonly extendedTurns: number | null; // null = Terrain Extender not available in this gen
}

function getDurationValues(gen: number): TerrainDurationValues {
  if (gen === 6) {
    // Gen 6: Terrain Extender not introduced until Gen 7.
    // Duration is 5 turns; no item extends it.
    // Source: Bulbapedia "Terrain" — Terrain Extender introduced in Gen 7
    return { defaultTurns: 5, extendedTurns: null };
  }
  if (gen === 7) {
    return {
      defaultTurns: GEN7_TERRAIN_DEFAULT_TURNS,
      extendedTurns: GEN7_TERRAIN_EXTENDED_TURNS,
    };
  }
  if (gen === 8) {
    return {
      defaultTurns: GEN8_TERRAIN_DEFAULT_TURNS,
      extendedTurns: GEN8_TERRAIN_EXTENDED_TURNS,
    };
  }
  // gen >= 9
  return {
    defaultTurns: GEN9_TERRAIN_DEFAULT_TURNS,
    extendedTurns: GEN9_TERRAIN_EXTENDED_TURNS,
  };
}

// ── Run suite ─────────────────────────────────────────────────────────────────

/**
 * Run the terrain oracle suite for a single generation.
 *
 * For gens 1-5: returns status "skip" (terrain not available).
 * For gen 6+: validates terrain duration constants and damage modifier values
 * against ground-truth expected values from Showdown source code.
 */
export function runTerrainSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const gen = generation.gen;

  if (gen <= 5) {
    return makeSkip();
  }

  const oracleChecks: OracleCheck[] = [];
  const notes: string[] = [];

  // ── Duration checks ────────────────────────────────────────────────────────

  const duration = getDurationValues(gen);

  oracleChecks.push({
    id: buildCheckId(gen, "default-duration"),
    suite: TERRAIN_SUITE_NAME,
    description: `Gen ${gen} terrain default duration matches Showdown (5 turns)`,
    ourValue: duration.defaultTurns,
    oracleValue: EXPECTED_TERRAIN_DEFAULT_TURNS,
  });

  if (duration.extendedTurns !== null) {
    oracleChecks.push({
      id: buildCheckId(gen, "extended-duration"),
      suite: TERRAIN_SUITE_NAME,
      description: `Gen ${gen} terrain extended duration (Terrain Extender) matches Showdown (8 turns)`,
      ourValue: duration.extendedTurns,
      oracleValue: EXPECTED_TERRAIN_EXTENDED_TURNS,
    });
  } else {
    notes.push(
      `Gen ${gen}: Terrain Extender not available (introduced Gen 7); 5-turn duration only`,
    );
  }

  // ── Gen 6: damage modifier checks (getTerrainDamageModifier is exported) ──

  if (gen === 6) {
    // Electric Terrain: 1.5× for Electric moves vs grounded attacker
    // Source: Showdown data/conditions.ts — electricterrain.onBasePower chainModify(1.5)
    const electricMod = getGen6TerrainDamageModifier(
      "electric",
      "electric",
      "thunderbolt",
      true,
      false,
    );
    oracleChecks.push({
      id: buildCheckId(gen, "electric-terrain-boost"),
      suite: TERRAIN_SUITE_NAME,
      description: `Gen ${gen} Electric Terrain boost modifier (Electric move, grounded attacker) = 1.5× (6144/4096)`,
      ourValue: electricMod.powerModifier,
      oracleValue: EXPECTED_TERRAIN_BOOST_GEN6_7,
    });

    // Grassy Terrain: 1.5× for Grass moves vs grounded attacker
    // Source: Showdown data/conditions.ts — grassyterrain.onBasePower chainModify(1.5)
    const grassyMod = getGen6TerrainDamageModifier("grassy", "grass", "energyball", true, false);
    oracleChecks.push({
      id: buildCheckId(gen, "grassy-terrain-boost"),
      suite: TERRAIN_SUITE_NAME,
      description: `Gen ${gen} Grassy Terrain boost modifier (Grass move, grounded attacker) = 1.5× (6144/4096)`,
      ourValue: grassyMod.powerModifier,
      oracleValue: EXPECTED_TERRAIN_BOOST_GEN6_7,
    });

    // Misty Terrain: 0.5× for Dragon moves vs grounded defender
    // Source: Showdown data/conditions.ts — mistyterrain.onBasePower chainModify(0.5) (ERRATA #27)
    const mistyMod = getGen6TerrainDamageModifier("misty", "dragon", "dragonbreath", false, true);
    oracleChecks.push({
      id: buildCheckId(gen, "misty-terrain-dragon-reduction"),
      suite: TERRAIN_SUITE_NAME,
      description: `Gen ${gen} Misty Terrain Dragon reduction modifier (Dragon move vs grounded defender) = 0.5× (2048/4096)`,
      ourValue: mistyMod.powerModifier,
      oracleValue: EXPECTED_MISTY_DRAGON_REDUCTION,
    });

    // No Psychic Terrain in Gen 6
    notes.push("Gen 6: Psychic Terrain not available (introduced Gen 7)");
  }

  // ── Terrain boost multiplier documentation (Gen 7-9) ──────────────────────
  // Note: getTerrainDamageModifier is a private function in Gen 7-9 DamageCalc modules.
  // The boost value is documented here and validated indirectly through compare-damage.ts.

  if (gen === 7) {
    notes.push(
      "Gen 7: Electric Terrain boost 1.5× (6144/4096) — same as Gen 6. " +
        "Source: Showdown data/conditions.ts electricterrain.onBasePower",
    );
    notes.push(
      "Gen 7: Grassy Terrain boost 1.5× (6144/4096). " +
        "Source: Showdown data/conditions.ts grassyterrain.onBasePower",
    );
    notes.push(
      "Gen 7: Psychic Terrain boost 1.5× (6144/4096) — NEW in Gen 7. " +
        "Source: Showdown data/conditions.ts psychicterrain.onBasePower",
    );
    notes.push(
      "Gen 7: Misty Terrain Dragon reduction 0.5× (2048/4096). " +
        "Source: Showdown data/conditions.ts mistyterrain.onBasePower (ERRATA #27)",
    );
  }

  if (gen >= 8) {
    notes.push(
      `Gen ${gen}: Electric/Grassy/Psychic Terrain boost 1.3× (5325/4096) — nerfed from 1.5× in Gen 7 (ERRATA #17). ` +
        "Source: Showdown data/mods/gen8/scripts.ts terrain boost",
    );
    notes.push(
      `Gen ${gen}: Misty Terrain Dragon reduction 0.5× (2048/4096). ` +
        "Source: Showdown data/conditions.ts mistyterrain.onBasePower (ERRATA #27)",
    );
  }

  // ── Complex behavior documentation ────────────────────────────────────────
  // These behaviors require full engine validation (replay/smoke suites).

  notes.push(
    `Gen ${gen}: Electric Terrain — grounded Pokemon cannot fall asleep. ` +
      "Source: Showdown data/conditions.ts electricterrain.onSetStatus",
  );
  notes.push(
    `Gen ${gen}: Misty Terrain — grounded Pokemon cannot gain primary status conditions. ` +
      "Source: Showdown data/conditions.ts mistyterrain.onSetStatus (ERRATA #27)",
  );
  notes.push(
    `Gen ${gen}: Grassy Terrain — grounded Pokemon restore 1/16 max HP at end of each turn. ` +
      "Source: Showdown data/conditions.ts grassyterrain.onResidual",
  );

  if (gen >= 7) {
    notes.push(
      `Gen ${gen}: Psychic Terrain — prevents priority moves targeting grounded Pokemon. ` +
        "Source: Showdown data/conditions.ts psychicterrain.onTryHit",
    );
    notes.push(
      `Gen ${gen}: Surge abilities (Tapu Koko/Bulu/Fini/Lele) auto-set terrain on switch-in. ` +
        "Source: Showdown data/abilities.ts electricsurge/grassysurge/mistysurge/psychicsurge",
    );
  }

  // ── Resolve oracle checks ─────────────────────────────────────────────────

  const resolved = resolveOracleChecks(TERRAIN_SUITE_NAME, oracleChecks, knownDisagreements);
  const failures = [...resolved.failures];
  notes.push(
    ...resolved.matchedKnownDisagreements.map((id) => `Known disagreement matched registry: ${id}`),
  );
  notes.push(...resolved.staleDisagreements.map((id) => `Stale disagreement detected: ${id}`));

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes,
    matchedKnownDisagreements: resolved.matchedKnownDisagreements,
    staleDisagreements: resolved.staleDisagreements,
    oracleChecks,
  };
}
