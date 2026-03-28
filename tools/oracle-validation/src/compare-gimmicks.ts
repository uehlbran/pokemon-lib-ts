/**
 * Gimmick Documentation Suite
 *
 * Documents per-generation gimmick mechanics. This suite records known mechanic
 * values and errata — it does NOT perform live oracle comparisons.
 *
 * Source authority:
 *   Gen 6:   Pokemon Showdown sim/battle-actions.ts — Mega Evolution
 *   Gen 7:   Pokemon Showdown sim/battle-actions.ts — Z-Moves + Mega Evolution
 *   Gen 8:   Pokemon Showdown sim/battle-actions.ts — Dynamax
 *   Gen 9:   Pokemon Showdown sim/battle-actions.ts — Terastallization
 *
 * ERRATA #15: Z-Move power uses an 11-range table, not a linear formula.
 * ERRATA #16: Status Z-Moves grant a bonus effect; they do NOT become damage moves.
 * ERRATA #17: Electric/Grassy/Psychic Terrain boost changed from 1.5× to 1.3× in Gen 8+.
 * ERRATA #18: Mega Evolution stat changes persist through switches — NOT reverted on switch-out.
 * ERRATA #19: Dynamax HP formula is floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05)).
 * ERRATA #20: Max Move power follows a dual power table (base power NOT simply doubled).
 * ERRATA #21: G-Max Wildfire deals residual damage, NOT Sunny Day weather.
 * ERRATA #26: Terastallization + Adaptability: base type 2.0×, Tera match 2.25×.
 * ERRATA #30: Terastallization retains 1.5× STAB for base types even after Tera.
 */

import { type KnownDisagreement, resolveOracleChecks } from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

const GIMMICKS_SUITE_NAME = "gimmicks";
const GIMMICK_SKIP_REASON = "No gimmicks in this generation";

/**
 * Gen 6 Mega Evolution notes.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 6 branch)
 * ERRATA #18: Mega Evolution stat changes are NOT reverted on switch-out.
 */
const GEN6_GIMMICK_NOTES: readonly string[] = [
  "Gen 6: Mega Evolution available — Mega Stone triggers mid-battle transformation",
  "Gen 6: Mega Evolution stat changes apply immediately on the turn Mega is triggered",
  "Gen 6: Mega Evolution persists through switches — stat changes NOT reverted on switch-out (ERRATA #18)",
  "Gen 6: Speed on Mega turn: Pokemon acts at pre-Mega Speed value in Gen 6 (priority determined before transformation)",
  "Gen 6: Only one Mega Evolution allowed per battle per trainer",
  "Gen 6: Mega Evolution changes typing and/or ability in addition to stats",
];

/**
 * Gen 7 Z-Move and Mega Evolution notes.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 7 branch)
 * ERRATA #15: Z-Move power uses an 11-range lookup table.
 * ERRATA #16: Status Z-Moves grant bonus effects, do NOT become damage moves.
 * ERRATA #18: Mega Evolution stat changes persist through switches.
 */
const GEN7_GIMMICK_NOTES: readonly string[] = [
  "Gen 7: Z-Moves available — Z-Crystal converts a damaging or status move into a Z-Move",
  "Gen 7: Z-Move power uses an 11-range lookup table (ERRATA #15 — NOT a linear formula):",
  "Gen 7:   1-55 BP → 100 power",
  "Gen 7:   60-65 BP → 120 power",
  "Gen 7:   70-75 BP → 140 power",
  "Gen 7:   80-85 BP → 160 power",
  "Gen 7:   90-95 BP → 175 power",
  "Gen 7:   100-105 BP → 180 power",
  "Gen 7:   110-115 BP → 185 power",
  "Gen 7:   120-125 BP → 190 power",
  "Gen 7:   130-135 BP → 195 power",
  "Gen 7:   140+ BP → 200 power",
  "Gen 7: Status Z-Moves grant a bonus effect (e.g. +1 stat stage) — they do NOT become damage moves (ERRATA #16)",
  "Gen 7: Mega Evolution available (same rules as Gen 6)",
  "Gen 7: Mega Evolution stat changes persist through switches — NOT reverted on switch-out (ERRATA #18)",
  "Gen 7: Speed on Mega turn: Pokemon acts at post-Mega Speed in Gen 7 (changed from Gen 6 behavior)",
  "Gen 7: Z-Moves and Mega Evolution cannot be used in the same battle turn",
];

/**
 * Gen 8 Dynamax notes.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 8 branch)
 * ERRATA #19: Dynamax HP formula uses floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05)).
 * ERRATA #20: Max Move power follows a dual power table.
 * ERRATA #21: G-Max Wildfire is residual damage, NOT Sunny weather.
 */
const GEN8_GIMMICK_NOTES: readonly string[] = [
  "Gen 8: Dynamax available — doubles HP for exactly 3 turns",
  "Gen 8: Dynamax HP formula: floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05)) (ERRATA #19)",
  "Gen 8:   Dynamax level 0 (default) = 1.5× base HP",
  "Gen 8:   Dynamax level 10 (max) = 2.0× base HP",
  "Gen 8: Dynamax duration: exactly 3 turns; cannot be extended",
  "Gen 8: Max Move power follows a dual power table (ERRATA #20 — NOT simply doubled base power):",
  "Gen 8:   Example: Flamethrower (90 BP Fire) → Max Flare 130 power",
  "Gen 8:   Example: Close Combat (120 BP Fighting) → Max Knuckle 95 power",
  "Gen 8: G-Max Moves available for Gigantamax forms (special G-Max effects on top of Max Move)",
  "Gen 8: G-Max Wildfire sets a residual-damage field effect — NOT the Sunny Day weather (ERRATA #21)",
  "Gen 8: Status moves become Max Guard (protects from all moves including Max Moves) during Dynamax",
  "Gen 8: Dynamax and Mega Evolution cannot coexist in the same battle",
];

/**
 * Gen 9 Terastallization notes.
 * Source: Pokemon Showdown sim/battle-actions.ts (Gen 9 branch)
 * ERRATA #26: Adaptability interaction with Terastallization.
 * ERRATA #30: Base types retain 1.5× STAB after Terastallization.
 */
const GEN9_GIMMICK_NOTES: readonly string[] = [
  "Gen 9: Terastallization available — changes Pokemon's type to its Tera type for the battle",
  "Gen 9: Base types retain 1.5× STAB even after Terastallization (ERRATA #30 — base type STAB is preserved)",
  "Gen 9: Tera type STAB: 1.5× if Tera type does not match any original base type",
  "Gen 9: Tera type STAB: 2.0× if Tera type matches one of the Pokemon's original base types",
  "Gen 9: Adaptability ability with Terastallization (ERRATA #26):",
  "Gen 9:   Adaptability + base type match (no Tera): 2.0× (standard Adaptability STAB)",
  "Gen 9:   Adaptability + Tera type matches original base type: 2.25× (stacked bonus)",
  "Gen 9: Stellar Tera type: grants a one-time 2× boost per move type (resets per type on each use)",
  "Gen 9: Terastallization persists for the remainder of the battle once activated",
  "Gen 9: Only one Terastallization allowed per battle per trainer",
];

/**
 * Run the gimmick documentation suite for a single generation.
 *
 * For gens 1-5: returns status "skip" (no gimmicks available).
 * For gen 6+: returns status "pass" with notes documenting gimmick mechanics.
 */
export function runGimmicksSuite(
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
      skipReason: GIMMICK_SKIP_REASON,
    };
  }

  let gimmickNotes: readonly string[];
  switch (gen) {
    case 6:
      gimmickNotes = GEN6_GIMMICK_NOTES;
      break;
    case 7:
      gimmickNotes = GEN7_GIMMICK_NOTES;
      break;
    case 8:
      gimmickNotes = GEN8_GIMMICK_NOTES;
      break;
    case 9:
      gimmickNotes = GEN9_GIMMICK_NOTES;
      break;
    default:
      gimmickNotes = [`Gen ${gen}: no documented gimmick mechanics`];
  }

  // Resolve against the registry to catch any misplaced known-disagreement entries
  // (this suite performs no live comparisons, so oracleChecks is always empty)
  const resolved = resolveOracleChecks(GIMMICKS_SUITE_NAME, [], knownDisagreements);
  const failures = [...resolved.failures];

  return {
    status: failures.length === 0 ? "pass" : "fail",
    suitePassed: failures.length === 0,
    failed: failures.length,
    skipped: 0,
    failures,
    notes: [...gimmickNotes],
    matchedKnownDisagreements: resolved.matchedKnownDisagreements,
    staleDisagreements: resolved.staleDisagreements,
    oracleChecks: [],
  };
}
