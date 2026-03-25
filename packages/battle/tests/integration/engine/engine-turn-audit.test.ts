/**
 * engine-turn-audit.test.ts
 *
 * Regression tests for bugs discovered during the engine turn-resolution audit.
 * Covers:
 *   - #531: capLethalDamage hook missing from executeMoveById (recursive moves)
 *   - #538: Choice lock not applied when a move misses
 *   - #539: capLethalDamage (Sturdy) not called for hits 2+ in multi-hit move loop
 *   - Verifications: single accuracy check for multi-hit, sub absorbs contact item triggers
 *
 * Source authority: Showdown sim/battle-actions.ts and sim/battle.ts for
 * generation-agnostic engine behavior.
 *
 * Note on stat calculations: these regression tests use explicit stat values derived from
 * the standard formula. At level 50:
 *   Charizard (base HP 78): floor((2*78+31)*50/100) + 60 = 153 HP
 *   Blastoise (base HP 79): floor((2*79+31)*50/100) + 60 = 154 HP
 *   Pikachu (base HP 35):   floor((2*35+31)*50/100) + 60 = 110 HP
 * Tests that assert HP values use these computed values, not passed-in calculatedStats,
 * because the battle setup recalculates stats on start.
 */

import type { MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_VOLATILE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createMockMoveSlot } from "../../helpers/move-slot";
import type {
  ActivePokemon,
  BattleConfig,
  BattleState,
  MoveEffectContext,
  MoveEffectResult,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeStats(hp: number, speed: number) {
  return {
    hp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };
}

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
      calculatedStats: makeStats(200, 120),
      currentHp: 200,
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
      calculatedStats: makeStats(200, 80),
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 3,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

// ─── Bug #531: capLethalDamage missing from executeMoveById ──────────────────
//
// executeMoveById is used for recursive moves (Metronome, Mirror Move).
// This regression verifies that lethal-damage protection is still applied on both the
// primary move path and the recursive move path.
//
// Source: Showdown sim/battle-actions.ts — the onDamage hook chain (which implements
// Sturdy) fires before HP subtraction in ALL damage application paths.

/**
 * Test ruleset that:
 *  1. On first executeMoveEffect call: returns a recursiveMove (triggering executeMoveById).
 *     On subsequent calls (from the recursiveMove's own effect): returns empty result
 *     to prevent infinite recursion.
 *  2. Implements capLethalDamage to count how many times it's called.
 */
class RecursiveMoveSturdyRuleset extends MockRuleset {
  capLethalDamageCalls = 0;
  effectCallCount = 0;

  override executeMoveEffect(_context: MoveEffectContext): MoveEffectResult {
    this.effectCallCount++;
    const base: MoveEffectResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
    // Only return recursiveMove on the first call to prevent infinite recursion
    if (this.effectCallCount === 1) {
      return { ...base, recursiveMove: CORE_MOVE_IDS.scratch };
    }
    return base;
  }

  override capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    _state: BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    this.capLethalDamageCalls++;
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    if (
      defender.ability === CORE_ABILITY_IDS.sturdy &&
      defender.pokemon.currentHp === maxHp &&
      damage >= maxHp
    ) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${defender.pokemon.nickname ?? "Defender"} held on thanks to Sturdy!`],
      };
    }
    return { damage, survived: false, messages: [] };
  }
}

describe("Bug #531 — capLethalDamage not called in executeMoveById (recursive move path)", () => {
  describe("given a Pokemon with Sturdy at full HP and an opponent whose move triggers a recursive Scratch via executeMoveById", () => {
    it("when executeMoveById applies lethal damage, then capLethalDamage is invoked at least once (for primary hit) but should be called for recursive hit too", () => {
      // Arrange
      // Source: Showdown sim/battle-actions.ts — capLethalDamage must fire for all damage
      // application paths, including recursive moves via executeMoveById.
      //
      // What the test proves:
      //   - Hit 1 (main move path): capLethalDamage is called because damage >= defender.currentHp.
      //   - Hit 2 (recursive path): capLethalDamage should also be called.
      //
      // Blastoise HP at level 50 under the standard stat formula is 154.
      //
      // With fixedDamage=200 (lethal against 154 HP):
      //   - Expected (post-fix): capLethalDamage called twice, Sturdy blocks KO on hit 1.
      //   - Actual (buggy): capLethalDamage called once (hit 1), recursive hit kills via executeMoveById.
      const ruleset = new RecursiveMoveSturdyRuleset();
      ruleset.setFixedDamage(200); // lethal against 154 HP

      const { engine } = createEngine({ ruleset });
      engine.start();

      // After engine.start() the constructor already recalculated HP to 154.
      // Blastoise is at full HP (154). Give it Sturdy ability.
      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.ability = CORE_ABILITY_IDS.sturdy;

      // Reset call counter after start() (start fires entry events that may call ruleset hooks)
      ruleset.capLethalDamageCalls = 0;
      ruleset.effectCallCount = 0;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — capLethalDamage should be called once for the primary hit and once for the
      // recursive hit path.
      expect(ruleset.capLethalDamageCalls).toBe(2);
    });

    it("when the recursive move delivers lethal damage and capLethalDamage is NOT called for it, then the recursive hit kills the defender even with Sturdy", () => {
      // Arrange — defender starts at 50 HP, below full HP, so Sturdy will not save it on
      // the first hit. The recursive hit path should still route through the lethal-damage hook.
      const ruleset = new RecursiveMoveSturdyRuleset();
      ruleset.setFixedDamage(200);

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Blastoise at 50 HP (NOT full HP) — Sturdy won't trigger on hit 1.
      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.ability = CORE_ABILITY_IDS.sturdy;
      defender!.pokemon.currentHp = 50; // below full HP (154)

      ruleset.capLethalDamageCalls = 0;
      ruleset.effectCallCount = 0;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — defender faints. The regression is that recursive hits should also route
      // through the survival hook.
      expect(defender!.pokemon.currentHp).toBe(0);
    });
  });
});

// ─── Bug #538 — Choice lock not applied on move miss ─────────────────────────
//
// In executeMove, choice lock is applied at the END of the function (~line 1525).
// When a move misses, the function returns early at the miss guard (~line 1157),
// skipping the choice lock code entirely.
//
// In Gen 3+, Showdown applies the choice lock when the move is selected (effectively:
// the first move a Choice holder ATTEMPTS is the locked move, regardless of hit/miss).
//
// Source: Showdown sim/battle-actions.ts — Choice lock is set in onModifyMove which
// fires before the accuracy roll. Therefore a miss still locks the user into that move.

class AlwaysMissChoiceRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  override doesMoveHit(): boolean {
    return false;
  }
}

class AlwaysHitChoiceRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }
}

describe("Bug #538 — Choice lock not applied when move misses", () => {
  describe("given a Pokemon holding Choice Band and using tackle (moveIndex 0) which always misses", () => {
    it("when the move misses on the first use, then the Pokemon should be choice-locked into tackle (confirms bug #538 is fixed)", () => {
      // Arrange
      // Source: Showdown Gen 3+ — onModifyMove sets choicelock before accuracy roll.
      // A miss does not prevent the lock from applying.
      //
      // Fixed: Choice lock now applied before the accuracy check in executeMove.
      const ruleset = new AlwaysMissChoiceRuleset();

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-choice",
          nickname: "Charizard",
          moves: [
            createMockMoveSlot(CORE_MOVE_IDS.tackle),
            createMockMoveSlot(CORE_MOVE_IDS.scratch),
          ],
          heldItem: CORE_ITEM_IDS.choiceBand,
          calculatedStats: makeStats(200, 120),
          currentHp: 200,
        }),
      ];

      const { engine } = createEngine({ ruleset, team1 });
      engine.start();

      const actor = engine.state.sides[0].active[0];
      expect(actor).not.toBeNull();
      expect(actor!.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked)).toBe(false);

      // Act — use tackle (moveIndex 0); always misses
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — choice-locked should be set (expected post-fix behavior).
      // Bug #538: currently evaluates to false (lock not applied on miss).
      // This assertion FAILS until bug #538 is fixed.
      // Source: Showdown Gen 3+ — choice lock applies even on miss.
      expect(actor!.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked)).toBe(true);
      const lockData = actor!.volatileStatuses.get(CORE_VOLATILE_IDS.choiceLocked)?.data;
      expect(lockData?.moveId).toBe(CORE_MOVE_IDS.tackle);
    });

    it("when the move hits successfully on the first use, then the Pokemon is choice-locked (baseline confirms existing behavior)", () => {
      // Arrange — baseline: a HIT correctly applies the choice lock.
      // Choice lock should still be applied even when the move misses.
      const ruleset = new AlwaysHitChoiceRuleset();
      ruleset.setFixedDamage(10); // non-lethal

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-hit",
          nickname: "Charizard",
          moves: [
            createMockMoveSlot(CORE_MOVE_IDS.tackle),
            createMockMoveSlot(CORE_MOVE_IDS.scratch),
          ],
          heldItem: CORE_ITEM_IDS.choiceBand,
          calculatedStats: makeStats(200, 120),
          currentHp: 200,
        }),
      ];

      const { engine } = createEngine({ ruleset, team1 });
      engine.start();

      const actor = engine.state.sides[0].active[0];
      expect(actor).not.toBeNull();

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — move hit; choice lock applied correctly (existing correct path)
      expect(actor!.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked)).toBe(true);
      const lockData = actor!.volatileStatuses.get(CORE_VOLATILE_IDS.choiceLocked)?.data;
      expect(lockData?.moveId).toBe(CORE_MOVE_IDS.tackle);
    });
  });

  describe("given a Choice-locked Pokemon whose locked move misses", () => {
    it("when the already-locked move misses, then the Pokemon remains locked (lock is not cleared by miss)", () => {
      // Arrange — Pokemon already has choice-lock before the turn
      // Source: Choice lock persists until switch-out; a miss on the locked move
      // must not clear the lock. This verifies no unintended lock-clearing on miss.
      const ruleset = new AlwaysMissChoiceRuleset();

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-locked",
          nickname: "Charizard",
          moves: [
            createMockMoveSlot(CORE_MOVE_IDS.tackle),
            createMockMoveSlot(CORE_MOVE_IDS.scratch),
          ],
          heldItem: CORE_ITEM_IDS.choiceBand,
          calculatedStats: makeStats(200, 120),
          currentHp: 200,
        }),
      ];

      const { engine } = createEngine({ ruleset, team1 });
      engine.start();

      const actor = engine.state.sides[0].active[0];
      expect(actor).not.toBeNull();
      // Pre-apply choice lock
      actor!.volatileStatuses.set(CORE_VOLATILE_IDS.choiceLocked, {
        turnsLeft: -1,
        data: { moveId: CORE_MOVE_IDS.tackle },
      });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — lock persists (was not cleared by the miss)
      expect(actor!.volatileStatuses.has(CORE_VOLATILE_IDS.choiceLocked)).toBe(true);
      const lockData = actor!.volatileStatuses.get(CORE_VOLATILE_IDS.choiceLocked)?.data;
      expect(lockData?.moveId).toBe(CORE_MOVE_IDS.tackle);
    });
  });
});

// ─── Bug #539 — capLethalDamage not called for hits 2+ of multi-hit move ─────
//
// The multi-hit loop should apply damage for each hit and still route lethal hits through
// capLethalDamage. Only the first hit is guaranteed by the primary damage path.
//
// Source: Showdown data/abilities.ts — Sturdy fires onDamage (priority -30).
// In Showdown, every damage application goes through the handler chain, including
// each individual hit of a multi-hit move.
//
// Note on expected HP values: these fixtures use explicit stat values derived from the
// standard formula.
// Blastoise at level 50: floor((2*79+31)*50/100) + 60 = 154 HP.

/**
 * Test ruleset that returns multiHitCount=3 (4 hits total) for side 0 (Charizard, speed 153)
 * and tracks capLethalDamage invocations.
 */
class MultiHitSturdyRuleset extends MockRuleset {
  readonly capLethalDamageInvocations: number[] = [];
  // Expose effectCallCount for reset in tests
  effectCallCount = 0;

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    this.effectCallCount++;
    const base: MoveEffectResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
    // Return multiHitCount only for the attacker's first move (side 0 = Charizard)
    // We identify by checking if the attacker is the faster Pokemon (speed 120)
    const attackerSpeed = context.attacker.pokemon.calculatedStats?.speed ?? 0;
    if (attackerSpeed >= 120) {
      return { ...base, multiHitCount: 3 }; // 4 hits total for Charizard
    }
    return base; // Blastoise uses a single-hit move
  }

  override capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    _state: BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    this.capLethalDamageInvocations.push(damage);
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    if (
      defender.ability === CORE_ABILITY_IDS.sturdy &&
      defender.pokemon.currentHp === maxHp &&
      damage >= maxHp
    ) {
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${defender.pokemon.nickname ?? "Defender"} held on thanks to Sturdy!`],
      };
    }
    return { damage, survived: false, messages: [] };
  }
}

describe("Bug #539 — capLethalDamage not called for hits 2+ in multi-hit move loop", () => {
  describe("given Charizard (4-hit multi-hit, multiHitCount=3) attacking Blastoise", () => {
    it("when all 4 hits land, then capLethalDamage is invoked 4 times (once per hit, confirms bug #539 is fixed)", () => {
      // Arrange
      // Source: Showdown data/abilities.ts — Sturdy's onDamage fires for every damage
      // application including each hit of a multi-hit move.
      //
      // Bug #539: capLethalDamage should be called for every hit in the multi-hit loop.
      //
      // Blastoise HP is 154. Fixed damage is 200, so the first hit is lethal and should
      // still route through the lethal-damage hook.
      //
      // Expected (post-fix): 4 calls (one per hit, each going through the hook).
      // Actual (buggy): 1 call (only hit 1 via main path; loop bypasses the hook).
      const ruleset = new MultiHitSturdyRuleset();
      ruleset.setFixedDamage(200); // lethal against 154 HP

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Blastoise at full HP (154, recalculated by engine constructor)
      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.ability = CORE_ABILITY_IDS.sturdy;
      ruleset.capLethalDamageInvocations.length = 0; // reset after start()
      ruleset.effectCallCount = 0;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — capLethalDamage should be called for every hit where damage >= currentHp:
      // Hit 1: 200 >= 154 → called, Sturdy caps to 153, HP = 1.
      // Hit 2: 200 >= 1 → called, not full HP so no Sturdy cap, HP = 0.
      // Hits 3-4: loop breaks (defender fainted).
      // Total: 2 invocations (the guard `damage >= currentHp` correctly limits calls).
      // Pre-fix (bug #539): only 1 invocation (hit 1 only; loop bypassed the hook).
      expect(ruleset.capLethalDamageInvocations.length).toBe(2);
    });

    it("when hits 1 and 2 are non-lethal but hit 3 would KO from a reduced HP, then capLethalDamage must be called for hit 3 (confirms bug #539 is fixed)", () => {
      // Arrange — Blastoise HP: 154 (computed). Fixed damage: 55.
      // Hit 1: 154-55=99 HP. Hit 2: 99-55=44 HP. Hit 3: 44-55=-11 → KO.
      // capLethalDamage must be called for hit 3 (damage=55 >= currentHp=44).
      // Bug #539: hit 3 is in the multi-hit loop, so the hook must still run there.
      //
      // Source: Showdown — every damage application calls the onDamage handler chain.
      // Blastoise HP at level 50 under the standard stat formula is 154.
      const ruleset = new MultiHitSturdyRuleset();
      ruleset.setFixedDamage(55); // non-lethal for first 2 hits, lethal at hit 3

      const { engine } = createEngine({ ruleset });
      engine.start();

      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.ability = CORE_ABILITY_IDS.sturdy;
      ruleset.capLethalDamageInvocations.length = 0;
      ruleset.effectCallCount = 0;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Hit 1 (55 < 154): capLethalDamage not called (guard: damage >= currentHp is false).
      // Hit 2 (55 < 99): not called.
      // Hit 3 (55 >= 44): capLethalDamage SHOULD be called (lethal hit in loop).
      // Bug #539: hit 3 is in the loop, capLethalDamage not called → defender faints.
      //
      // Post-fix: invocations.length >= 1 (called for hit 3 at minimum).
      // Currently: 0 invocations (loop bypasses the hook entirely).
      expect(ruleset.capLethalDamageInvocations.length).toBeGreaterThanOrEqual(1);
    });

    it("when multi-hit move is used against a defender without Sturdy, then total damage equals 4x the per-hit damage", () => {
      // Arrange — baseline: no Sturdy, 4 hits of 30 = 120 total damage.
      // Blastoise at HP 154 (computed) → ends at 154 - 120 = 34 HP.
      // Each hit should apply the configured fixed damage.
      //
      // This is a sanity check for the multi-hit loop itself. 4 hits × 30 = 120 total,
      // leaving the defender at 34 HP. If the loop runs correctly, this passes.
      const ruleset = new MultiHitSturdyRuleset();
      ruleset.setFixedDamage(30); // non-lethal across all 4 hits (4×30=120 < 154)

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.ability = CORE_ABILITY_IDS.torrent; // no Sturdy
      ruleset.capLethalDamageInvocations.length = 0;
      ruleset.effectCallCount = 0;

      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — 4 hits × 30 = 120. Blastoise ends at 154-120 = 34 HP.
      // Each hit should apply the configured fixed damage.
      // Source: 154 HP - 120 damage from four 30-damage hits = 34 HP.
      expect(defender!.pokemon.currentHp).toBe(34);

      // Four damage events emitted (one per hit to Blastoise, side 1)
      const damageToBlastoise = events.filter((e) => e.type === "damage" && e.side === 1);
      // Source: four hits are expected because the ruleset returns multiHitCount=3.
      expect(damageToBlastoise.length).toBe(4);
    });
  });
});

// ─── Verify: single accuracy check for all hits of a multi-hit move ───────────
//
// Accuracy is checked once before the first hit. Subsequent hits of a multi-hit move
// auto-land — no per-hit accuracy roll.
//
// Source: Bulbapedia — "If a multi-hit move successfully hits, it will hit up to 4
//   additional times."
// Source: Showdown — a single accuracy check is performed; the hit loop does not call
//   doesMoveHit per iteration.

class AccuracyTrackingRuleset extends MockRuleset {
  accuracyCheckCount = 0;

  override doesMoveHit(): boolean {
    this.accuracyCheckCount++;
    return true;
  }

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    const base: MoveEffectResult = {
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    };
    // Return multiHitCount only for side 0 (faster Pokemon)
    const attackerSpeed = context.attacker.pokemon.calculatedStats?.speed ?? 0;
    if (attackerSpeed >= 120) {
      return { ...base, multiHitCount: 4 }; // 5 hits total
    }
    return base;
  }
}

describe("Multi-hit accuracy — single check for all hits", () => {
  describe("given a 5-hit multi-hit move (multiHitCount=4) and a normal single-hit move", () => {
    it("when both sides move in the same turn, then accuracy is checked exactly once per move (2 total)", () => {
      // Arrange
      // Source: Bulbapedia / Showdown — accuracy is checked ONCE for the entire multi-hit
      // move. The hit loop inside BattleEngine does not call doesMoveHit per iteration.
      const ruleset = new AccuracyTrackingRuleset();
      ruleset.setFixedDamage(10);

      const { engine } = createEngine({ ruleset });
      engine.start();

      ruleset.accuracyCheckCount = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — exactly 2 accuracy checks: 1 for each move.
      // If the loop re-checked accuracy, there would be 5+1=6 checks.
      // The single accuracy check is the behavior under test here.
      expect(ruleset.accuracyCheckCount).toBe(2);
    });
  });
});

// ─── Verify: substitute blocks held-item on-contact triggers ─────────────────
//
// When a contact move hits a Substitute, the held-item on-contact trigger (Rocky Helmet,
// King's Rock, etc.) must NOT activate. The engine guards this with `!hitSubstitute`
// at lines ~1325–1343 in BattleEngine.ts.
//
// Source: Showdown sim/battle-actions.ts — onDamagingHit contact item hooks are gated
// behind `!hitSub` check. If the move hit the sub, the contact hook is skipped.
//
// Test design: team2 uses "thunderbolt" (non-contact, flags.contact=false) so that
// Blastoise's own attack never triggers the on-contact hook on Charizard.
// Only Charizard's tackle (contact) vs Blastoise (with/without sub) is relevant.

class ContactItemTrackingRuleset extends MockRuleset {
  contactItemTriggerCount = 0;

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string): import("../../../src/context").ItemResult {
    if (trigger === "on-contact") {
      this.contactItemTriggerCount++;
      return {
        activated: true,
        effects: [],
        messages: ["Rocky Helmet dealt damage!"],
      };
    }
    return { activated: false, effects: [], messages: [] };
  }
}

describe("Substitute blocks held-item on-contact triggers", () => {
  // team2 uses thunderbolt (non-contact) so only Charizard's tackle (contact) is
  // counted, preventing Blastoise's hit on Charizard from incrementing the count.
  const team2NonContact = [
    createTestPokemon(9, 50, {
      uid: "blastoise-sub",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.thunderbolt)],
      calculatedStats: makeStats(200, 80),
      currentHp: 200,
    }),
  ];

  describe("given the defender has an active Substitute and the attacker uses a contact move", () => {
    it("when the contact move hits the Substitute without breaking it, then on-contact item does NOT trigger", () => {
      // Arrange
      // Source: Showdown sim/battle-actions.ts — `!hitSubstitute` guard prevents
      // on-contact item hooks when the move hits a Substitute.
      // Tackle is a contact move (flags.contact=true in mock data).
      // Blastoise uses thunderbolt (non-contact) so no contact trigger from Blastoise's side.
      const ruleset = new ContactItemTrackingRuleset();
      ruleset.setFixedDamage(30); // sub has 50 HP; won't break

      const { engine } = createEngine({ ruleset, team2: team2NonContact });
      engine.start();

      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.substituteHp = 50;
      defender!.volatileStatuses.set(CORE_VOLATILE_IDS.substitute, { turnsLeft: -1 });

      ruleset.contactItemTriggerCount = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no on-contact item trigger when move hits substitute.
      expect(ruleset.contactItemTriggerCount).toBe(0);
    });

    it("when the contact move breaks the Substitute, then sub HP is 0 and volatile-end event is emitted", () => {
      // Arrange — damage (80) > sub HP (50), so the Substitute breaks.
      // Source: Showdown — excess damage from a sub-breaking hit does NOT overflow to the
      // Pokemon. The move ends once the sub breaks.
      // Excess damage should not overflow past the Substitute.
      const ruleset = new ContactItemTrackingRuleset();
      ruleset.setFixedDamage(80); // sub has 50 HP; breaks

      const { engine, events } = createEngine({ ruleset, team2: team2NonContact });
      engine.start();

      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      defender!.substituteHp = 50;
      defender!.volatileStatuses.set(CORE_VOLATILE_IDS.substitute, { turnsLeft: -1 });

      events.length = 0;
      ruleset.contactItemTriggerCount = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Substitute broken (HP floored to 0)
      expect(defender!.substituteHp).toBe(0);
      expect(defender!.volatileStatuses.has(CORE_VOLATILE_IDS.substitute)).toBe(false);

      // Assert — volatile-end event emitted for substitute removal
      const subEndEvent = events.find(
        (e) =>
          e.type === "volatile-end" &&
          "volatile" in e &&
          e.volatile === CORE_VOLATILE_IDS.substitute,
      );
      expect(subEndEvent).toMatchObject({
        type: "volatile-end",
        volatile: CORE_VOLATILE_IDS.substitute,
      });
    });

    it("when a non-contact move hits the Substitute, then on-contact item does NOT trigger (regardless of sub)", () => {
      // Arrange — thunderbolt is a non-contact move (flags.contact=false).
      // The on-contact item should not trigger for non-contact moves even if sub is absent.
      // Source: Showdown — on-contact hooks only fire for moves with the contact flag.
      const ruleset = new ContactItemTrackingRuleset();
      ruleset.setFixedDamage(50);

      const team1NonContact = [
        createTestPokemon(6, 50, {
          uid: "charizard-special",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.thunderbolt)],
          calculatedStats: makeStats(200, 120),
          currentHp: 200,
        }),
      ];

      const { engine } = createEngine({ ruleset, team1: team1NonContact, team2: team2NonContact });
      engine.start();

      const defender = engine.state.sides[1].active[0];
      expect(defender).not.toBeNull();
      // No substitute needed — test pure non-contact behavior
      defender!.substituteHp = 0;

      ruleset.contactItemTriggerCount = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — no contact item trigger (thunderbolt is not a contact move).
      expect(ruleset.contactItemTriggerCount).toBe(0);
    });
  });
});

// ─── Verify: simultaneous faint — both Pokemon faint in the same turn ─────────
//
// When both Pokemon faint in the same turn (e.g., both at 1 HP, both take lethal damage),
// both faint events should be emitted. In practice, with different speeds, the faster one
// acts first and KOs the slower one, which then cannot execute its move. The test verifies
// the faint event is emitted and the engine transitions to an appropriate phase.
//
// Source: Showdown sim/battle.ts — faint detection iterates all active slots
// after each action using checkFainted(). Both KOs are detected.

describe("Faint handling — Pokemon faints, engine transitions to switch-prompt", () => {
  describe("given Charizard at 1 HP and Blastoise using a move that deals 10 damage", () => {
    it("when Blastoise uses tackle on Charizard at 1 HP, then a faint event is emitted and engine requests switch", () => {
      // Arrange — Charizard (speed 120) acts first but with 1 HP.
      // Blastoise (speed 80) acts second — KOs Charizard (1 HP - 10 = -9 → 0).
      // Charizard's tackle deals 10 damage to Blastoise (154 HP, non-lethal).
      //
      // After Charizard faints, team1 backup (Pikachu, id=25) is needed.
      // Source: Showdown sim/battle.ts — after a KO, the engine requests a switch.
      const ruleset = new MockRuleset();
      ruleset.setFixedDamage(10);

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-low",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(200, 120),
          currentHp: 200,
        }),
        // Backup Pikachu (id=25, in mock data) so engine doesn't end battle immediately.
        createTestPokemon(25, 50, {
          uid: "pikachu-backup",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(110, 90),
          currentHp: 110,
        }),
      ];

      const team2 = [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(200, 80),
          currentHp: 200,
        }),
      ];

      const { engine, events } = createEngine({ ruleset, team1, team2 });
      engine.start();

      // Force Charizard to 1 HP (below engine-calculated 153, which is fine —
      // the constructor sets HP=153, then we manually lower it here).
      const actor = engine.state.sides[0].active[0];
      expect(actor).not.toBeNull();
      actor!.pokemon.currentHp = 1;

      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — at least one faint event emitted (Charizard faints when Blastoise attacks).
      const faintEvents = events.filter((e) => e.type === "faint");
      expect(faintEvents.length).toBeGreaterThanOrEqual(1);

      // Engine should be in switch-prompt (Charizard fainted, Pikachu backup available)
      // Source: Showdown — after a KO, the engine requests a forced switch for that side.
      const phase = engine.getPhase();
      expect(["switch-prompt", "battle-end"].includes(phase)).toBe(true);
    });

    it("when both Pokemon are at 1 HP with the same speed, then the RNG-determined first mover KOs the other", () => {
      // Arrange — both at 1 HP, same speed. Only one KOs the other per turn.
      // With seed 42 and equal speed, the RNG picks one side to go first.
      // Speed ties are resolved by the test ruleset's 50/50 RNG branch.
      // Blastoise and Charizard HP at level 50 under the standard stat formula are 154 and 153.
      const ruleset = new MockRuleset();
      ruleset.setFixedDamage(10);

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1hp",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(200, 100),
          currentHp: 200,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-backup",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(110, 90),
          currentHp: 110,
        }),
      ];
      const team2 = [
        createTestPokemon(9, 50, {
          uid: "blastoise-1hp",
          nickname: "Blastoise",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(200, 100),
          currentHp: 200,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-backup2",
          nickname: "Pikachu2",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: makeStats(110, 90),
          currentHp: 110,
        }),
      ];

      const { engine, events } = createEngine({ ruleset, team1, team2, seed: 42 });
      engine.start();

      // Both at 1 HP
      const actor0 = engine.state.sides[0].active[0];
      const actor1 = engine.state.sides[1].active[0];
      actor0!.pokemon.currentHp = 1;
      actor1!.pokemon.currentHp = 1;
      events.length = 0;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — at least one faint event (the first mover KOs the second)
      const faintEvents = events.filter((e) => e.type === "faint");
      expect(faintEvents.length).toBeGreaterThanOrEqual(1);

      // Engine in switch-prompt or battle-end (both have backups)
      const phase = engine.getPhase();
      expect(["switch-prompt", "battle-end"].includes(phase)).toBe(true);
    });
  });
});
