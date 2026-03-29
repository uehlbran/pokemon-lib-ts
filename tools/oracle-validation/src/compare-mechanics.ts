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

interface MoveEffectMultiHit {
  readonly type: "multi-hit";
  readonly min: number;
  readonly max: number;
}

interface MoveEffectRecoil {
  readonly type: "recoil";
  readonly amount: number;
}

interface MoveEffectDrain {
  readonly type: "drain";
  readonly amount: number;
}

type LocalMoveEffect =
  | MoveEffectMultiHit
  | MoveEffectRecoil
  | MoveEffectDrain
  | { readonly type: string }
  | null;

interface LocalMove {
  readonly id: string;
  readonly priority: number;
  readonly power: number | null;
  readonly effect: LocalMoveEffect;
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
 * 1. Move priority values — compares our moves.json priority against @pkmn/data
 *    for every move with a non-zero priority in either source.
 * 2. Ability assignment (Gen 3+ only) — compares our pokemon.json
 *    abilities.normal[0] against @pkmn/data species abilities slot 0.
 * 3. Multi-hit move counts — compares our effect.min/max against @pkmn/data multihit.
 *    Source: spec 1.7k
 * 4. Recoil fractions — compares our effect.amount against @pkmn/data recoil fraction.
 *    Source: spec 1.7l
 * 5. Drain fractions — compares our effect.amount against @pkmn/data drain fraction.
 *    Source: spec 1.7l
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

  const localMoves = JSON.parse(
    readFileSync(join(generation.dataDir, "moves.json"), "utf8"),
  ) as LocalMove[];

  // ── 1. Move Priority ───────────────────────────────────────────────────────

  let movePriorityChecked = 0;

  for (const move of localMoves) {
    const moveId = normalizeMoveId(move.id);
    const oracleMove = oracle.moves.get(moveId);

    if (!oracleMove?.exists) {
      continue;
    }

    const ourPriority = move.priority;
    const oraclePriority = oracleMove.priority ?? 0;

    // Gen 2 uses a 1-based priority scale (BASE_PRIORITY=1 in pokecrystal).
    // A "neutral" Gen 2 move has our priority=1 and oracle priority=0.
    // Skip these normal moves — the scale difference is intentional and documented.
    // Source: pret/pokecrystal data/moves/effects_priorities.asm
    const basePriority = generation.gen === 2 ? 1 : 0;
    if (ourPriority === basePriority && oraclePriority === 0) {
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
    `Gen ${generation.gen}: checked ${movePriorityChecked} move${movePriorityChecked === 1 ? "" : "s"} with non-neutral priority`,
  );

  // ── 2. Ability Assignment (Gen 3+ only) ────────────────────────────────────

  if (generation.gen >= 3) {
    const localPokemon = JSON.parse(
      readFileSync(join(generation.dataDir, "pokemon.json"), "utf8"),
    ) as LocalSpecies[];

    let abilityChecked = 0;

    for (const species of localPokemon) {
      if (!species.abilities) {
        continue;
      }

      const speciesSlug = normalizeSpeciesId(species.name);
      const oracleSpecies = oracle.species.get(species.name);

      if (!oracleSpecies?.exists) {
        continue;
      }
      if (oracleSpecies.baseSpecies !== oracleSpecies.name) {
        continue;
      }

      const ourFirstAbility = species.abilities.normal[0] ?? null;

      // @pkmn/data ability slot "0" is the first non-hidden ability.
      // Normalize to lowercase, strip non-alphanumeric except hyphens, convert spaces to hyphens.
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

  // ── 3. Multi-Hit Counts (spec 1.7k) ────────────────────────────────────────
  // Validates our multi-hit move min/max counts against @pkmn/data.
  // Source: Showdown sim/moves.ts multihit property
  // Source: Bulbapedia "Multi-strike move"

  let multiHitChecked = 0;

  for (const move of localMoves) {
    const effect = move.effect;
    if (!effect || effect.type !== "multi-hit") {
      continue;
    }

    const multiHitEffect = effect as MoveEffectMultiHit;
    const moveId = normalizeMoveId(move.id);
    const oracleMove = oracle.moves.get(moveId);

    if (!oracleMove?.exists || oracleMove.multihit === undefined) {
      continue;
    }

    // @pkmn/data multihit is either a fixed number (e.g. 2) or [min, max] tuple.
    const oracleMultihit = oracleMove.multihit;
    const oracleMin = Array.isArray(oracleMultihit) ? oracleMultihit[0] : oracleMultihit;
    const oracleMax = Array.isArray(oracleMultihit) ? oracleMultihit[1] : oracleMultihit;

    oracleChecks.push({
      id: buildCheckId(generation, "multihit-min", moveId),
      suite: MECHANICS_SUITE_NAME,
      description: `Move ${move.id} min hit count matches @pkmn/data`,
      ourValue: multiHitEffect.min,
      oracleValue: oracleMin,
    });

    oracleChecks.push({
      id: buildCheckId(generation, "multihit-max", moveId),
      suite: MECHANICS_SUITE_NAME,
      description: `Move ${move.id} max hit count matches @pkmn/data`,
      ourValue: multiHitEffect.max,
      oracleValue: oracleMax,
    });

    multiHitChecked += 1;
  }

  notes.push(
    `Gen ${generation.gen}: checked ${multiHitChecked} multi-hit move${multiHitChecked === 1 ? "" : "s"} (spec 1.7k)`,
  );

  // ── 4. Recoil Fractions (spec 1.7l) ───────────────────────────────────────
  // Validates our recoil move amounts against @pkmn/data.
  // @pkmn/data recoil is [numerator, denominator] (e.g. [33, 100] for Brave Bird 33%).
  // Our effect.amount is a decimal (e.g. 0.33 for Brave Bird).
  // Source: Showdown data/moves.ts recoil property
  // Source: Bulbapedia "Recoil"

  let recoilChecked = 0;

  for (const move of localMoves) {
    const effect = move.effect;
    if (!effect || effect.type !== "recoil") {
      continue;
    }

    const recoilEffect = effect as MoveEffectRecoil;
    const moveId = normalizeMoveId(move.id);
    const oracleMove = oracle.moves.get(moveId);

    if (!oracleMove?.exists || !oracleMove.recoil) {
      continue;
    }

    const oracleRecoil = oracleMove.recoil;
    const oracleFraction = oracleRecoil[0] / oracleRecoil[1];

    // Round to 3 decimal places to avoid floating-point noise in OracleCheck output.
    // resolveOracleChecks handles the actual pass/fail comparison — always push so
    // stale known-disagreements can be detected.
    oracleChecks.push({
      id: buildCheckId(generation, "recoil-amount", moveId),
      suite: MECHANICS_SUITE_NAME,
      description: `Move ${move.id} recoil fraction matches @pkmn/data`,
      ourValue: Math.round(recoilEffect.amount * 1000) / 1000,
      oracleValue: Math.round(oracleFraction * 1000) / 1000,
    });

    recoilChecked += 1;
  }

  notes.push(
    `Gen ${generation.gen}: checked ${recoilChecked} recoil move${recoilChecked === 1 ? "" : "s"} (spec 1.7l)`,
  );

  // ── 5. Drain Fractions (spec 1.7l) ────────────────────────────────────────
  // Validates our drain move amounts against @pkmn/data.
  // @pkmn/data drain is [numerator, denominator] (e.g. [1, 2] for 50% drain).
  // Our effect.amount is a decimal (e.g. 0.5 for 50% drain).
  // Source: Showdown data/moves.ts drain property
  // Source: Bulbapedia "Draining move"

  let drainChecked = 0;

  for (const move of localMoves) {
    const effect = move.effect;
    if (!effect || effect.type !== "drain") {
      continue;
    }

    const drainEffect = effect as MoveEffectDrain;
    const moveId = normalizeMoveId(move.id);
    const oracleMove = oracle.moves.get(moveId);

    if (!oracleMove?.exists || !oracleMove.drain) {
      continue;
    }

    const oracleDrain = oracleMove.drain;
    const oracleFraction = oracleDrain[0] / oracleDrain[1];

    // Round to 3 decimal places to avoid floating-point noise in OracleCheck output.
    // resolveOracleChecks handles the actual pass/fail comparison — always push so
    // stale known-disagreements can be detected.
    oracleChecks.push({
      id: buildCheckId(generation, "drain-amount", moveId),
      suite: MECHANICS_SUITE_NAME,
      description: `Move ${move.id} drain fraction matches @pkmn/data`,
      ourValue: Math.round(drainEffect.amount * 1000) / 1000,
      oracleValue: Math.round(oracleFraction * 1000) / 1000,
    });

    drainChecked += 1;
  }

  notes.push(
    `Gen ${generation.gen}: checked ${drainChecked} drain move${drainChecked === 1 ? "" : "s"} (spec 1.7l)`,
  );

  // ── Documentation: Status Effects (spec 1.7c) ─────────────────────────────
  // These are engine-level behaviors validated by the replay/smoke suites.
  notes.push(
    "Spec 1.7c (status effects): burn halves Attack (Gen 1: halves Special); paralysis halves Speed (Gen 7+: 25% chance); " +
      "sleep 1-7 turns (Gen 1: 1-7 cartridge, Gen 2-4: 2-5, Gen 5+: 1-3); " +
      "freeze thaw chance per gen; toxic damage 1/16, 2/16, ... escalating. " +
      "Sources: pret/pokered engine/battle, pret/pokecrystal engine/battle, Showdown sim/battle-actions.ts",
  );

  // ── Documentation: Field Effects (spec 1.7d) ──────────────────────────────
  notes.push(
    "Spec 1.7d (field effects): Rain doubles Water, halves Fire; Sun doubles Fire, halves Water; " +
      "Sand deals 1/16 damage per turn to non-Rock/Ground/Steel; Hail deals 1/16 to non-Ice. " +
      "Sources: Showdown sim/battle-actions.ts onWeather handlers",
  );

  // ── Documentation: Item Effects (spec 1.7e) ────────────────────────────────
  notes.push(
    "Spec 1.7e (item effects): Choice Band/Specs lock move after first use; Life Orb adds 30% boost, " +
      "deals 10% recoil (Sheer Force negates recoil); berries trigger at 50% HP (25% with Gluttony); " +
      "Knock Off deals 1.5x vs item-holder (Gen 6+). " +
      "Source: Showdown sim/battle-actions.ts onAfterMove, onBasePower",
  );

  // ── Documentation: Stat Stages (spec 1.7f) ────────────────────────────────
  notes.push(
    "Spec 1.7f (stat stages): ±6 cap; stage multipliers 2/8 to 8/2; critical hits ignore negative atk/def stages (Gen 2+); " +
      "evasion/accuracy stages use 3/9 to 9/3 range. " +
      "Source: Showdown sim/battle-actions.ts getStat, getAccuracy",
  );

  // ── Documentation: Gen 1-2 Unique Mechanics (spec 1.7g) ─────────────────
  notes.push(
    "Spec 1.7g (Gen 1-2 unique): Gen 1 badge boosts apply to base stat (not stage); " +
      "1/256 miss glitch applies to accuracy-ignoring moves; Focus Energy bugged (cuts crit rate); " +
      "Gen 1 crit formula: baseSpeed/512 (high-crit moves: baseSpeed/64); " +
      "DV system: HP DV derived from other DVs; stat exp range 0-65535. " +
      "Source: pret/pokered src/engine/battle/core.asm",
  );

  // ── Documentation: Multi-Turn Moves (spec 1.7h) ───────────────────────────
  notes.push(
    "Spec 1.7h (multi-turn): Toxic damage escalates 1/16 per turn; sleep counter per gen varies; " +
      "confusion self-hit 50% each turn; Perish Song triggers after 3 turns; " +
      "Encore locks move for 2-6 turns; Disable lasts 4-8 turns. " +
      "Source: Showdown sim/battle-actions.ts onBeforeMove, onResidual",
  );

  // ── Documentation: Switch-In Triggers (spec 1.7i) ─────────────────────────
  notes.push(
    "Spec 1.7i (switch-in): Spikes added Gen 2 (1/8 HP max 3 layers); Stealth Rock added Gen 4 (type-scaled 1/8); " +
      "Toxic Spikes added Gen 4 (2 layers = badly poison); Sticky Web added Gen 6 (Spe -1); " +
      "Intimidate triggers on switch-in (Atk -1 to opponent). " +
      "Source: pret/pokecrystal engine/battle, pret/pokeplatinum, Showdown sim/battle-actions.ts",
  );

  // ── Documentation: Rooms and Gravity (spec 1.7j) ──────────────────────────
  notes.push(
    "Spec 1.7j (rooms/gravity): Trick Room reverses speed order for 5 turns; " +
      "Magic Room suppresses held items for 5 turns; Wonder Room swaps Def/SpDef for 5 turns; " +
      "Gravity increases accuracy 5/3, grounds flying/levitating Pokemon for 5 turns. " +
      "Source: Showdown sim/battle-actions.ts room/gravity handlers",
  );

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
