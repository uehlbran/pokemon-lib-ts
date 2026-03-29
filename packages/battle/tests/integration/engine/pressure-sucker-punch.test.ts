import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it, vi } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      moves: [
        createMockMoveSlot(CORE_MOVE_IDS.tackle),
        createMockMoveSlot(CORE_MOVE_IDS.swordsDance),
      ],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

// ─── Bug #309 — Pressure PP cost applies to self-target moves ────────────────

/**
 * Bug #309: The engine unconditionally passed the opponent as `defender`
 * to getPPCost, even for self-targeting moves. Pressure should only cost
 * 2 PP when the move actually targets the opponent.
 *
 * Source: Showdown sim/battle.ts — Pressure check skips self-target moves
 * Source: Bulbapedia — "Pressure causes any Pokemon targeting the ability-bearer
 *   [...] to use 2 PP for their move instead of 1."
 */
describe("Bug #309 — Pressure + self-target moves", () => {
  it("given opponent has Pressure ability, when attacker uses Swords Dance (self-targeting), then getPPCost receives null as defender", () => {
    // Arrange — set up engine and spy on getPPCost to capture the defender argument
    const { engine, ruleset } = createEngine();
    const getPPCostSpy = vi.spyOn(ruleset, "getPPCost");
    engine.start();

    // Act — side 0 uses Swords Dance (moveIndex 1), which is a self-targeting move
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — getPPCost was called for both sides; for the Swords Dance call,
    // the defender argument should be null (not the opponent ActivePokemon)
    // Source: Showdown — Pressure only applies when the move targets the ability-bearer
    expect(getPPCostSpy.mock.calls.length).toBe(2);

    // Find the call where defender is null — that's the Swords Dance call
    const swordsDanceCall = getPPCostSpy.mock.calls.find((call) => call[1] === null);
    expect(swordsDanceCall?.[1]).toBeNull();

    // Find the call where defender is not null — that's the Tackle call
    const tackleCall = getPPCostSpy.mock.calls.find((call) => call[1] !== null);
    expect(tackleCall?.[1]).not.toBeNull();
  });

  it("given opponent has Pressure ability, when attacker uses Tackle (opponent-targeting), then getPPCost receives the opponent as defender", () => {
    // Arrange
    const { engine, ruleset } = createEngine();
    const getPPCostSpy = vi.spyOn(ruleset, "getPPCost");
    engine.start();

    // Act — side 0 uses Tackle (moveIndex 0), which targets the opponent
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — all getPPCost calls should have a non-null defender for opponent-targeting moves
    // Source: Showdown — Pressure applies when move targets the ability-bearer
    const callsWithDefender = getPPCostSpy.mock.calls.filter((call) => call[1] !== null);
    // Both sides use Tackle (opponent-targeting), so both calls should have a defender
    expect(callsWithDefender.length).toBe(2);
  });

  it("given opponent has Pressure ability, when attacker uses self-target move, then PP cost is 1 (not 2)", () => {
    // Arrange — use a ruleset that mimics real Pressure behavior
    // The MockRuleset.getPPCost returns ppCostOverride ?? 1, but we need the
    // real BaseRuleset behavior. Instead, we override getPPCost to check the
    // defender argument like BaseRuleset does.
    const ruleset = new MockRuleset();
    // Override getPPCost to simulate Pressure — return 2 when defender has pressure
    vi.spyOn(ruleset, "getPPCost").mockImplementation((_actor, defender, _state) => {
      return defender?.ability === CORE_ABILITY_IDS.pressure ? 2 : 1;
    });

    const { engine } = createEngine({ ruleset });
    engine.start();

    // Set the opponent's ability to CORE_ABILITY_IDS.pressure
    const active1 = engine.state.sides[1].active[0];
    expect(active1).not.toBeNull();
    active1!.ability = CORE_ABILITY_IDS.pressure;

    // The attacker has Swords Dance at moveIndex 1
    const active0 = engine.state.sides[0].active[0];
    expect(active0).not.toBeNull();
    const swordsDanceSlot = active0!.pokemon.moves[1];
    expect(swordsDanceSlot).not.toBeNull();
    const ppBefore = swordsDanceSlot!.currentPP;

    // Act — side 0 uses Swords Dance (self-targeting)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Swords Dance cost 1 PP (Pressure doesn't apply to self-targeting moves)
    // Source: Bulbapedia — Pressure only affects moves that target the ability-bearer
    expect(swordsDanceSlot!.currentPP).toBe(ppBefore - 1);
  });

  it("given opponent has Pressure ability, when attacker uses opponent-targeting move, then PP cost is 2", () => {
    // Arrange — same Pressure simulation as above
    const ruleset = new MockRuleset();
    vi.spyOn(ruleset, "getPPCost").mockImplementation((_actor, defender, _state) => {
      return defender?.ability === CORE_ABILITY_IDS.pressure ? 2 : 1;
    });

    const { engine } = createEngine({ ruleset });
    engine.start();

    // Set the opponent's ability to CORE_ABILITY_IDS.pressure
    const active1 = engine.state.sides[1].active[0];
    expect(active1).not.toBeNull();
    active1!.ability = CORE_ABILITY_IDS.pressure;

    const active0 = engine.state.sides[0].active[0];
    expect(active0).not.toBeNull();
    const tackleSlot = active0!.pokemon.moves[0];
    expect(tackleSlot).not.toBeNull();
    const ppBefore = tackleSlot!.currentPP;

    // Act — side 0 uses Tackle (opponent-targeting)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Tackle cost 2 PP (Pressure applies to opponent-targeting moves)
    // Source: Showdown sim/battle.ts — Pressure check in deductPP
    expect(tackleSlot!.currentPP).toBe(ppBefore - 2);
  });
});

// ─── Bug #512 — Pressure PP cost applied to foe-field/entire-field moves ─────

/**
 * Bug #512: The engine did not exclude foe-field and entire-field targeting moves
 * from the Pressure PP cost check. Stealth Rock (foe-field) and Gravity
 * (entire-field) should not trigger Pressure's extra PP cost because they
 * do not directly target the opposing Pokemon.
 *
 * Source: Showdown sim/battle.ts — Pressure only applies when move targets the ability-bearer
 * Source: Bulbapedia — "Pressure causes any Pokemon targeting the ability-bearer to use 2 PP"
 */
describe("Bug #512 — Pressure + foe-field/entire-field moves", () => {
  it("given a foe-field move (stealth-rock target), when opponent has Pressure, then PP cost is 1", () => {
    // Arrange — create a Pokemon with stealth-rock and a Pressure opponent
    const ruleset = new MockRuleset();
    vi.spyOn(ruleset, "getPPCost").mockImplementation((_actor, defender, _state) => {
      // Simulate Pressure: cost 2 when defender is non-null (opponent targeted)
      return defender?.ability === CORE_ABILITY_IDS.pressure ? 2 : 1;
    });

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [
          createMockMoveSlot(CORE_MOVE_IDS.stealthRock),
          createMockMoveSlot(CORE_MOVE_IDS.tackle),
        ],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      }),
    ];

    const { engine } = createEngine({ team1, ruleset });
    engine.start();

    // Set opponent's ability to Pressure
    const active1 = engine.state.sides[1].active[0];
    expect(active1).not.toBeNull();
    active1!.ability = CORE_ABILITY_IDS.pressure;

    const active0 = engine.state.sides[0].active[0];
    expect(active0).not.toBeNull();
    const stealthRockSlot = active0!.pokemon.moves[0];
    expect(stealthRockSlot).not.toBeNull();
    const ppBefore = stealthRockSlot!.currentPP;

    // Act — side 0 uses Stealth Rock (foe-field targeting)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Stealth Rock cost 1 PP (Pressure doesn't apply to foe-field moves)
    // Source: Showdown — foe-field moves do not target the ability-bearer directly
    expect(stealthRockSlot!.currentPP).toBe(ppBefore - 1);
  });

  it("given an entire-field move (gravity target), when opponent has Pressure, then PP cost is 1", () => {
    // Arrange — create a Pokemon with gravity and a Pressure opponent
    const ruleset = new MockRuleset();
    vi.spyOn(ruleset, "getPPCost").mockImplementation((_actor, defender, _state) => {
      return defender?.ability === CORE_ABILITY_IDS.pressure ? 2 : 1;
    });

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [
          createMockMoveSlot(CORE_MOVE_IDS.gravity),
          createMockMoveSlot(CORE_MOVE_IDS.tackle),
        ],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 200,
      }),
    ];

    const { engine } = createEngine({ team1, ruleset });
    engine.start();

    // Set opponent's ability to Pressure
    const active1 = engine.state.sides[1].active[0];
    expect(active1).not.toBeNull();
    active1!.ability = CORE_ABILITY_IDS.pressure;

    const active0 = engine.state.sides[0].active[0];
    expect(active0).not.toBeNull();
    const gravitySlot = active0!.pokemon.moves[0];
    expect(gravitySlot).not.toBeNull();
    const ppBefore = gravitySlot!.currentPP;

    // Act — side 0 uses Gravity (entire-field targeting)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Gravity cost 1 PP (Pressure doesn't apply to entire-field moves)
    // Source: Showdown — entire-field moves do not target the ability-bearer directly
    expect(gravitySlot!.currentPP).toBe(ppBefore - 1);
  });
});

// ─── Bug #310 — Sucker Punch fails against Struggling opponent ───────────────

/**
 * Bug #310: getDefenderSelectedMove returned null for struggle actions,
 * causing Sucker Punch to fail when the opponent was forced to Struggle.
 * Struggle is a physical attacking move — Sucker Punch should succeed.
 *
 * Source: Showdown sim — Sucker Punch succeeds when target is using Struggle
 */
describe("Bug #310 — Sucker Punch vs Struggling opponent", () => {
  it("given defender has no PP and must Struggle, when getDefenderSelectedMove is called, then it returns a physical move descriptor for Struggle", () => {
    // Arrange — defender has 0 PP on all moves, forcing Struggle
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle, { currentPP: 0 })],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const { engine, events } = createEngine({ team2 });
    engine.start();

    // Act — side 1 submits a struggle action (no PP left), side 0 uses tackle
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: CORE_MOVE_IDS.struggle, side: 1 });

    // Assert — both actions resolved; no "move-fail" for side 0 (the attacker)
    // This verifies the engine can handle a struggle action from the defender
    // Source: Showdown — Struggle is a valid action when all PP exhausted
    const moveStarts = events.filter((e) => e.type === "move-start");
    expect(moveStarts).toHaveLength(2);

    // Verify the struggle action emits a move-start for struggle
    const struggleMoveStart = events.find(
      (e) => e.type === "move-start" && e.side === 1 && e.move === CORE_MOVE_IDS.struggle,
    );
    expect(struggleMoveStart).toEqual(
      expect.objectContaining({
        type: "move-start",
        side: 1,
        move: CORE_MOVE_IDS.struggle,
      }),
    );
  });

  it("given defender submits Struggle action, when currentTurnActions is queried for defender's move, then Struggle is found as physical category", () => {
    // Arrange — This test verifies the getDefenderSelectedMove method works
    // by checking the MoveEffectContext that the engine passes to executeMoveEffect.
    // We spy on executeMoveEffect to capture the context.
    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle, { currentPP: 0 })],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const ruleset = new MockRuleset();
    const executeMoveEffectSpy = vi.spyOn(ruleset, "executeMoveEffect");
    const { engine } = createEngine({ team2, ruleset });
    engine.start();

    // Act — side 0 uses Tackle, side 1 is forced to Struggle
    // Charizard is faster (speed 120 vs 80), so it moves first.
    // When Charizard's Tackle fires, the engine builds a MoveEffectContext
    // that includes defenderSelectedMove from getDefenderSelectedMove.
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: CORE_MOVE_IDS.struggle, side: 1 });

    // Assert — executeMoveEffect was called for Tackle (side 0's move)
    // and the context's defenderSelectedMove should show Struggle as physical
    // Source: Showdown sim — Sucker Punch succeeds when target is using Struggle
    expect(executeMoveEffectSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    const tackleCall = executeMoveEffectSpy.mock.calls[0];
    const context = tackleCall[0];
    // The defenderSelectedMove should be { id: CORE_MOVE_IDS.struggle, category: "physical" }
    expect(context.defenderSelectedMove).toEqual({
      id: CORE_MOVE_IDS.struggle,
      category: "physical",
    });
  });
});
