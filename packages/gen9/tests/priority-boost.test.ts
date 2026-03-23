import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen9Ruleset } from "../src/Gen9Ruleset";

/**
 * Tests for issue #783: Prankster/Gale Wings/Triage priority boost
 * in Gen 9 resolveTurnOrder (inherited from BaseRuleset).
 *
 * Gen 9 inherits resolveTurnOrder from BaseRuleset. Before this fix,
 * ability-based priority boosts were never applied to turn ordering.
 * Additionally, Gen 9's ability dispatcher was missing the on-priority-check
 * routing for carry-forward abilities (Prankster, Gale Wings, Triage).
 *
 * Source: Showdown sim/battle.ts -- getActionSpeed computes effective priority
 *   including ability boosts via onModifyPriority
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeActive(
  overrides: {
    speed?: number;
    ability?: string | null;
    status?: string | null;
    heldItem?: string | null;
    speedStage?: number;
    moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
    types?: PokemonType[];
    currentHp?: number;
    maxHp?: number;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        speed: overrides.speed ?? 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
      },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      level: 50,
      nickname: null,
      speciesId: 25,
      moves: overrides.moves ?? [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
    },
    ability: overrides.ability ?? null,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: overrides.speedStage ?? 0,
      accuracy: 0,
      evasion: 0,
    },
    types: overrides.types ?? ["electric"],
    volatileStatuses: new Map(),
    teamSlot: 0,
    substituteHp: 0,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
    suppressedAbility: null,
  } as unknown as ActivePokemon;
}

function makeSide(index: 0 | 1, active: ActivePokemon[] = []): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function makeBattleState(sideA: BattleSide, sideB: BattleSide): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [sideA, sideB],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0.5,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeRng(nextVal = 0.5): SeededRandom {
  return {
    next: () => nextVal,
    int: () => 1,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

// ---------------------------------------------------------------------------
// Prankster priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset.resolveTurnOrder -- Prankster priority boost (#783)", () => {
  const ruleset = new Gen9Ruleset();

  it(
    "given Prankster user with a status move (priority 0) vs faster opponent using priority-0 attack, " +
      "when resolving turn order, then Prankster user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster onModifyPriority:
      //   gives +1 priority to status moves
      // Both moves have base priority 0. Prankster boosts will-o-wisp to priority 1.
      // Prankster user should always go first regardless of speed.

      const pranksterUser = makeActive({
        ability: "prankster",
        speed: 50, // Slower to prove priority beats speed
        moves: [{ moveId: "will-o-wisp", currentPP: 15, maxPP: 15 }],
      });
      const opponent = makeActive({
        speed: 200, // Faster, but lower priority
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });

      const sideA = makeSide(0, [pranksterUser]);
      const sideB = makeSide(1, [opponent]);
      const state = makeBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Prankster user (side 0) should move first
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Prankster user with a physical move, when resolving turn order, " +
      "then priority is NOT boosted (Prankster only affects status moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster only for status moves
      // Prankster does not boost physical/special moves.
      // Faster opponent should go first.

      const pranksterUser = makeActive({
        ability: "prankster",
        speed: 50, // Slower
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });
      const opponent = makeActive({
        speed: 200, // Faster
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });

      const sideA = makeSide(0, [pranksterUser]);
      const sideB = makeSide(1, [opponent]);
      const state = makeBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Opponent (side 1) should go first since Prankster doesn't boost physical
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Gale Wings priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset.resolveTurnOrder -- Gale Wings priority boost (#783)", () => {
  const ruleset = new Gen9Ruleset();

  it(
    "given Gale Wings user at full HP with a Flying-type move vs faster opponent, " +
      "when resolving turn order, then Gale Wings user moves first due to +1 priority",
    () => {
      // Source: Showdown data/abilities.ts -- Gale Wings: +1 to Flying moves at full HP (Gen 7+)
      // Brave Bird has base priority 0; Gale Wings boosts it to +1.

      const galeWingsUser = makeActive({
        ability: "gale-wings",
        speed: 50, // Slower to prove priority beats speed
        moves: [{ moveId: "brave-bird", currentPP: 15, maxPP: 15 }],
        types: ["normal", "flying"],
        currentHp: 200,
        maxHp: 200,
      });
      const opponent = makeActive({
        speed: 200, // Faster, but lower priority
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });

      const sideA = makeSide(0, [galeWingsUser]);
      const sideB = makeSide(1, [opponent]);
      const state = makeBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Gale Wings user (side 0) should move first
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Gale Wings user NOT at full HP with a Flying-type move, " +
      "when resolving turn order, then priority is NOT boosted (Gen 7+ HP restriction)",
    () => {
      // Source: Showdown data/abilities.ts -- Gale Wings: requires pokemon.hp === pokemon.maxhp
      // In Gen 7+, Gale Wings only works at full HP.

      const galeWingsUser = makeActive({
        ability: "gale-wings",
        speed: 50, // Slower
        moves: [{ moveId: "brave-bird", currentPP: 15, maxPP: 15 }],
        types: ["normal", "flying"],
        currentHp: 150, // Not at full HP
        maxHp: 200,
      });
      const opponent = makeActive({
        speed: 200, // Faster
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });

      const sideA = makeSide(0, [galeWingsUser]);
      const sideB = makeSide(1, [opponent]);
      const state = makeBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Opponent (side 1) should go first since Gale Wings is inactive
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// Triage priority boost (#783)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset.resolveTurnOrder -- Triage priority boost (#783)", () => {
  const ruleset = new Gen9Ruleset();

  it(
    "given Triage user with a healing move (Drain Punch) vs opponent with Quick Attack (+1), " +
      "when resolving turn order, then Triage user moves first due to +3 priority beating +1",
    () => {
      // Source: Showdown data/abilities.ts -- triage: onModifyPriority +3 for heal moves
      // Drain Punch has base priority 0; Triage boosts it to priority 3.
      // Quick Attack has base priority 1.
      // Triage user should go first (3 > 1).

      const triageUser = makeActive({
        ability: "triage",
        speed: 50, // Slower to prove priority beats speed
        moves: [{ moveId: "drain-punch", currentPP: 10, maxPP: 10 }],
      });
      const opponent = makeActive({
        speed: 200, // Faster, but Quick Attack only has +1 priority
        moves: [{ moveId: "quick-attack", currentPP: 30, maxPP: 30 }],
      });

      const sideA = makeSide(0, [triageUser]);
      const sideB = makeSide(1, [opponent]);
      const state = makeBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Triage user (side 0) should move first (priority 3 > 1)
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(0);
    },
  );

  it(
    "given Triage user with a non-healing physical move, when resolving turn order, " +
      "then priority is NOT boosted (Triage only affects healing moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Triage only for move.flags.heal
      // Tackle is not a healing move; Triage should not boost it.

      const triageUser = makeActive({
        ability: "triage",
        speed: 50, // Slower
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });
      const opponent = makeActive({
        speed: 200, // Faster
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
      });

      const sideA = makeSide(0, [triageUser]);
      const sideB = makeSide(1, [opponent]);
      const state = makeBattleState(sideA, sideB);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0, target: 1 },
        { type: "move", side: 1, moveIndex: 0, target: 0 },
      ];

      const ordered = ruleset.resolveTurnOrder(actions, state, makeRng());

      // Opponent (side 1) should go first since Triage doesn't boost non-healing
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});
