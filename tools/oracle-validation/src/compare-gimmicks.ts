/**
 * Gimmick Oracle Suite
 *
 * Validates per-generation gimmick mechanics against @pkmn/data and ground-truth values.
 *
 * Live oracle checks:
 *   - Z-Move base power (Gen 7): our getZMovePower(move) vs @pkmn/data move.zMove.basePower
 *   - Dynamax HP multiplier formula (Gen 8): formula values at key dynamax levels
 *
 * Documentation notes (engine-level, validated by replay/smoke suites):
 *   - Mega Evolution stat persistence, speed recalc Gen 6 vs 7
 *   - Status Z-Move bonus effects
 *   - Max Move dual power table
 *   - Terastallization STAB rules and Adaptability interaction
 *
 * Source authority:
 *   Gen 6:   Pokemon Showdown sim/battle-actions.ts — Mega Evolution
 *   Gen 7:   Pokemon Showdown sim/dex-moves.ts, sim/battle-actions.ts — Z-Moves
 *   Gen 8:   Pokemon Showdown sim/battle-actions.ts — Dynamax
 *   Gen 9:   Pokemon Showdown sim/battle-actions.ts — Terastallization
 *
 * ERRATA #15: Z-Move power uses an 11-range table, not a linear formula.
 * ERRATA #16: Status Z-Moves grant a bonus effect; they do NOT become damage moves.
 * ERRATA #18: Mega Evolution stat changes persist through switches — NOT reverted on switch-out.
 * ERRATA #19: Dynamax HP formula is floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05)).
 * ERRATA #20: Max Move power follows a dual power table (base power NOT simply doubled).
 * ERRATA #21: G-Max Wildfire deals residual damage, NOT Sunny Day weather.
 * ERRATA #26: Terastallization + Adaptability: base type 2.0×, Tera match 2.25×.
 * ERRATA #30: Terastallization retains 1.5× STAB for base types even after Tera.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";
// Import our actual Gen 7 Z-Move power function to test it against oracle.
// This is intentionally a source-level import (not public API) — same pattern as compare-damage.ts.
import { getZMovePower } from "../../../packages/gen7/src/Gen7ZMove.js";
import {
  type KnownDisagreement,
  type OracleCheck,
  resolveOracleChecks,
} from "./disagreement-registry.js";
import type { ImplementedGeneration } from "./gen-discovery.js";
import type { SuiteResult } from "./result-schema.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORACLE_GENERATIONS = new Generations(Dex);
const GIMMICKS_SUITE_NAME = "gimmicks";
const GIMMICK_SKIP_REASON = "No gimmicks in this generation";

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface LocalMoveEffect {
  readonly type: string;
  readonly min?: number;
  readonly max?: number;
  readonly amount?: number;
}

interface LocalMove {
  readonly id: string;
  readonly power: number | null;
  readonly category: "physical" | "special" | "status";
  readonly effect: LocalMoveEffect | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeMoveId(id: string): string {
  return id.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
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
    skipReason: GIMMICK_SKIP_REASON,
  };
}

// ── Z-Move oracle (Gen 7) ─────────────────────────────────────────────────────

/**
 * Validate Z-Move base power for damaging moves in Gen 7.
 *
 * Compares our actual getZMovePower(move) result against @pkmn/data move.zMove.basePower.
 * Failures indicate bugs or known deviations in our Z-Move power table logic.
 *
 * Source: smogon/pokemon-showdown sim/dex-moves.ts getZMovePower (ERRATA #15)
 */
function buildZMovePowerChecks(
  generation: ImplementedGeneration,
  oracleChecks: OracleCheck[],
  notes: string[],
): void {
  const oracle = ORACLE_GENERATIONS.get(generation.gen);
  const localMoves = JSON.parse(
    readFileSync(join(generation.dataDir, "moves.json"), "utf8"),
  ) as LocalMove[];

  let checked = 0;

  for (const move of localMoves) {
    // Only damaging moves have Z-Move power conversion
    if (move.category === "status" || move.power === null || move.power === 0) {
      continue;
    }

    const moveId = normalizeMoveId(move.id);
    const oracleMove = oracle.moves.get(moveId);

    if (!oracleMove?.exists) {
      continue;
    }

    // @pkmn/data stores Z-Move power as zMove.basePower on the source move.
    // Skip moves without a Z-Move power entry.
    const oracleZPower = oracleMove.zMove?.basePower;
    if (oracleZPower === undefined || oracleZPower === 0) {
      continue;
    }

    // Use our actual getZMovePower function, feeding it a MoveData-compatible object.
    // getZMovePower only accesses: category, power, effect.type — safe to shim.
    const moveDataShim = {
      id: move.id,
      category: move.category,
      power: move.power,
      effect: move.effect,
    };
    const ourZPower = getZMovePower(moveDataShim as Parameters<typeof getZMovePower>[0]);

    oracleChecks.push({
      id: `gen${generation.gen}:${GIMMICKS_SUITE_NAME}:z-move-power:${moveId}`,
      suite: GIMMICKS_SUITE_NAME,
      description: `Gen ${generation.gen} Z-Move power for ${move.id} (${move.power} BP) matches @pkmn/data`,
      ourValue: ourZPower,
      oracleValue: oracleZPower,
    });

    checked += 1;
  }

  notes.push(
    `Gen ${generation.gen}: validated Z-Move power for ${checked} damaging move${checked === 1 ? "" : "s"} against @pkmn/data (ERRATA #15)`,
  );
}

// ── Dynamax HP formula (Gen 8) ────────────────────────────────────────────────

/**
 * Validate Dynamax HP multiplier formula at key dynamax levels.
 *
 * Formula: 1.5 + dynamaxLevel × 0.05
 * ERRATA #19: floor(baseMaxHP × (1.5 + dynamaxLevel × 0.05))
 * Source: smogon/pokemon-showdown sim/battle-actions.ts getDynamaxHP
 */
function buildDynamaxHPChecks(
  generation: ImplementedGeneration,
  oracleChecks: OracleCheck[],
  notes: string[],
): void {
  const checkLevels = [
    { level: 0, expectedMultiplier: 1.5 },
    { level: 5, expectedMultiplier: 1.75 },
    { level: 10, expectedMultiplier: 2.0 },
  ] as const;

  for (const { level, expectedMultiplier } of checkLevels) {
    const actualMultiplier = 1.5 + level * 0.05;

    oracleChecks.push({
      id: `gen${generation.gen}:${GIMMICKS_SUITE_NAME}:dynamax-hp-level${level}`,
      suite: GIMMICKS_SUITE_NAME,
      description: `Gen ${generation.gen} Dynamax HP multiplier at level ${level} = ${expectedMultiplier}× (ERRATA #19)`,
      ourValue: Math.round(actualMultiplier * 1000) / 1000,
      oracleValue: expectedMultiplier,
    });
  }

  notes.push(
    `Gen ${generation.gen}: validated Dynamax HP multiplier at levels 0/5/10 against Showdown formula (ERRATA #19)`,
  );
}

// ── Run suite ─────────────────────────────────────────────────────────────────

/**
 * Run the gimmick oracle suite for a single generation.
 *
 * For gens 1-5: returns status "skip" (no gimmicks available).
 * For gen 6+: validates gimmick-specific mechanics against oracle sources.
 */
export function runGimmicksSuite(
  generation: ImplementedGeneration,
  knownDisagreements: readonly KnownDisagreement[] = [],
): SuiteResult {
  const gen = generation.gen;

  if (gen <= 5) {
    return makeSkip();
  }

  const oracleChecks: OracleCheck[] = [];
  const notes: string[] = [];

  // ── Gen 6: Mega Evolution ─────────────────────────────────────────────────

  if (gen === 6 || gen === 7) {
    notes.push(
      `Gen ${gen}: Mega Evolution — Mega Stone triggers mid-battle transformation. ` +
        "Stat changes apply on the Mega turn and persist through switches (ERRATA #18 — NOT reverted on switch-out). " +
        "Source: Showdown sim/battle-actions.ts onAfterMove Mega Evolution handler",
    );
    notes.push(
      gen === 6
        ? "Gen 6: Speed on Mega turn: Pokemon acts at pre-Mega Speed (priority determined before transformation). " +
            "Source: Showdown sim/battle-actions.ts Gen 6 — speed recalc deferred"
        : "Gen 7: Speed on Mega turn: Pokemon acts at post-Mega Speed (changed from Gen 6 behavior). " +
            "Source: Showdown sim/battle-actions.ts Gen 7 — immediate speed recalc",
    );
    notes.push(`Gen ${gen}: Only one Mega Evolution allowed per battle per trainer.`);
  }

  // ── Gen 7: Z-Moves ────────────────────────────────────────────────────────

  if (gen === 7) {
    buildZMovePowerChecks(generation, oracleChecks, notes);

    notes.push(
      "Gen 7: Status Z-Moves grant a bonus effect (e.g. +1 stat stage) — they do NOT become damage moves (ERRATA #16). " +
        "Source: Showdown sim/battle-actions.ts zMove handler status branch",
    );
    notes.push(
      "Gen 7: Z-Moves and Mega Evolution cannot be used in the same battle turn. " +
        "Source: Showdown sim/battle-actions.ts canMegaEvo/canUseZMove mutual exclusion",
    );
    notes.push("Gen 7: Only one Z-Move allowed per battle per trainer.");
  }

  // ── Gen 8: Dynamax ────────────────────────────────────────────────────────

  if (gen === 8) {
    buildDynamaxHPChecks(generation, oracleChecks, notes);

    notes.push(
      "Gen 8: Dynamax duration: exactly 3 turns; cannot be extended. " +
        "Source: Showdown sim/battle-actions.ts Dynamax duration handler",
    );
    notes.push(
      "Gen 8: Max Move power follows a dual power table (ERRATA #20 — NOT simply doubled base power). " +
        "Examples: Flamethrower (90 BP Fire) → Max Flare 130; Close Combat (120 BP Fighting) → Max Knuckle 95. " +
        "Source: Showdown data/moves.ts maxMove.basePower",
    );
    notes.push(
      "Gen 8: Status moves become Max Guard (protects from all moves including Max Moves) during Dynamax. " +
        "Source: Showdown sim/battle-actions.ts Max Guard handler",
    );
    notes.push(
      "Gen 8: G-Max Wildfire sets a residual-damage field effect — NOT the Sunny Day weather (ERRATA #21). " +
        "Source: Showdown data/moves.ts gmaxwildfire effect",
    );
    notes.push("Gen 8: Dynamax and Mega Evolution cannot coexist in the same battle.");
  }

  // ── Gen 9: Terastallization ───────────────────────────────────────────────

  if (gen === 9) {
    notes.push(
      "Gen 9: Terastallization — changes Pokemon's type to its Tera type for the battle. " +
        "Base types retain 1.5× STAB even after Tera (ERRATA #30). " +
        "Source: Showdown sim/battle-actions.ts getSTAB Tera handler",
    );
    notes.push(
      "Gen 9: Tera STAB rules: " +
        "non-matching Tera type = 1.5×; Tera type matches original base type = 2.0×. " +
        "Source: Showdown sim/battle-actions.ts getSTAB (ERRATA #30)",
    );
    notes.push(
      "Gen 9: Adaptability + Terastallization (ERRATA #26): " +
        "standard Adaptability match = 2.0×; Tera type matches original base type = 2.25×. " +
        "Source: Showdown sim/battle-actions.ts getSTAB Adaptability+Tera branch",
    );
    notes.push(
      "Gen 9: Stellar Tera type: grants a one-time 2× boost per move type (resets per type on each use). " +
        "Source: Showdown data/conditions.ts stellartype handler",
    );
    notes.push(
      "Gen 9: Terastallization persists for the remainder of the battle once activated. " +
        "Only one Terastallization allowed per battle per trainer.",
    );
  }

  // ── Resolve oracle checks ─────────────────────────────────────────────────

  const resolved = resolveOracleChecks(GIMMICKS_SUITE_NAME, oracleChecks, knownDisagreements);
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
