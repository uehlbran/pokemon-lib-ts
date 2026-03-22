import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

/**
 * Tests for:
 * - Issue #623: Assault Vest blocks status moves
 * - Issue #625: Prankster and Gale Wings +1 priority in resolveTurnOrder
 *
 * Source: Showdown data/items.ts -- Assault Vest: "The holder is unable to use status moves"
 * Source: Showdown data/abilities.ts -- Prankster onModifyPriority
 * Source: Showdown data/mods/gen6/abilities.ts -- Gale Wings (no HP check in Gen 6)
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
    moves?: Array<{ moveId: string }>;
    types?: PokemonType[];
  } = {},
): ActivePokemon {
  return {
    pokemon: {
      calculatedStats: {
        hp: 200,
        speed: overrides.speed ?? 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
      },
      currentHp: 200,
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
    generation: 6,
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
// Issue #625: Prankster and Gale Wings +1 priority in resolveTurnOrder
// ---------------------------------------------------------------------------

describe("Gen6Ruleset.resolveTurnOrder -- Prankster priority boost (#625)", () => {
  const ruleset = new Gen6Ruleset();

  it(
    "given Prankster user with a status move vs opponent with a damage move at same base priority, " +
      "when resolveTurnOrder is called, then Prankster user moves first due to +1 priority",
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
    "given Prankster user with a damage move (physical), when resolveTurnOrder is called, " +
      "then priority is NOT boosted (Prankster only affects status moves)",
    () => {
      // Source: Showdown data/abilities.ts -- Prankster only for status moves
      // Both use physical moves at priority 0; faster Pokemon should go first.

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

      // Opponent (side 1) should go first since Prankster doesn't boost physical moves
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});

describe("Gen6Ruleset.resolveTurnOrder -- Gale Wings priority boost (#625)", () => {
  const ruleset = new Gen6Ruleset();

  it(
    "given Gale Wings user with a Flying-type move vs opponent at same base priority, " +
      "when resolveTurnOrder is called, then Gale Wings user moves first due to +1 priority",
    () => {
      // Source: Bulbapedia "Gale Wings" Gen 6 -- "+1 priority to Flying-type moves"
      // Source: Showdown data/mods/gen6/abilities.ts -- galeWings has no HP check
      // Brave Bird has base priority 0; Gale Wings boosts it to +1.

      const galeWingsUser = makeActive({
        ability: "gale-wings",
        speed: 50, // Slower to prove priority beats speed
        moves: [{ moveId: "brave-bird", currentPP: 15, maxPP: 15 }],
        types: ["normal", "flying"],
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
    "given Gale Wings user with a non-Flying move, when resolveTurnOrder is called, " +
      "then priority is NOT boosted",
    () => {
      // Source: Bulbapedia "Gale Wings" -- only Flying-type moves get priority boost
      // Tackle is Normal-type; Gale Wings should not boost it.

      const galeWingsUser = makeActive({
        ability: "gale-wings",
        speed: 50, // Slower
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
        types: ["normal", "flying"],
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

      // Opponent (side 1) should go first since Gale Wings doesn't boost non-Flying moves
      expect(ordered[0].type).toBe("move");
      expect((ordered[0] as { side: number }).side).toBe(1);
    },
  );
});
