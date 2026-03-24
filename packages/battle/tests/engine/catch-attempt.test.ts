import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, CatchResult } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

/**
 * Creates a test engine configured for wild battles with configurable teams and ruleset.
 * Defaults to a wild battle (isWildBattle: true) to enable catch mechanics.
 */
function createWildBattleEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  isWildBattle?: boolean;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    createTestPokemon(25, 50, {
      uid: "pikachu-wild",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 150,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 100,
      },
      currentHp: 150,
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 42,
    isWildBattle: overrides?.isWildBattle ?? true,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("BattleEngine - Catch Attempt mechanics", () => {
  it("given a wild battle and catch succeeds, when poke-ball thrown, then CatchAttemptEvent(caught=true) and battle-end winner=0 emitted", () => {
    // Arrange
    const ruleset = new MockRuleset();
    // Source: MockRuleset default returns caught=true, shakes=3
    ruleset.setNextCatchResult({ shakes: 3, caught: true });

    const { engine, events } = createWildBattleEngine({ ruleset });
    engine.start();

    // Act — side 0 throws poke-ball, side 1 uses move
    engine.submitAction(0, { type: "item", side: 0, itemId: "poke-ball" });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — catch-attempt event carries full content
    const catchEvent = events.find((e) => e.type === "catch-attempt");
    expect(catchEvent).toEqual(
      expect.objectContaining({
        type: "catch-attempt",
        caught: true,
        shakes: 3,
        ball: "poke-ball",
      }),
    );

    // Battle should end with side 0 (player) winning
    const endEvent = events.find((e) => e.type === "battle-end");
    expect(endEvent).toEqual(expect.objectContaining({ type: "battle-end", winner: 0 }));

    // Engine should be in ended state with winner set
    expect(engine.isEnded()).toBe(true);
    expect(engine.getWinner()).toBe(0);
  });

  it("given a wild battle and catch fails with 2 shakes, when poke-ball thrown, then CatchAttemptEvent(caught=false, shakes=2) and battle continues", () => {
    // Arrange
    const ruleset = new MockRuleset();
    // Source: MockRuleset configured to fail with 2 shakes
    ruleset.setNextCatchResult({ shakes: 2, caught: false });

    const { engine, events } = createWildBattleEngine({ ruleset });
    engine.start();

    // Act
    engine.submitAction(0, { type: "item", side: 0, itemId: "poke-ball" });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — catch-attempt event carries full content
    const catchEvent = events.find((e) => e.type === "catch-attempt");
    expect(catchEvent).toEqual(
      expect.objectContaining({ type: "catch-attempt", caught: false, shakes: 2 }),
    );

    // Battle should NOT end
    const endEvent = events.find((e) => e.type === "battle-end");
    expect(endEvent).toBeUndefined();
    expect(engine.isEnded()).toBe(false);
  });

  it("given a trainer battle (not wild), when poke-ball thrown, then message emitted and catch blocked", () => {
    // Arrange — isWildBattle: false for trainer battle
    const ruleset = new MockRuleset();
    ruleset.setNextCatchResult({ shakes: 3, caught: true });

    const { engine, events } = createWildBattleEngine({
      ruleset,
      isWildBattle: false,
    });
    engine.start();

    // Act
    engine.submitAction(0, { type: "item", side: 0, itemId: "poke-ball" });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — should get a blocking message, no catch event
    const blockedMsg = events.find(
      (e) => e.type === "message" && "text" in e && e.text.includes("trainer"),
    );
    expect(blockedMsg).toEqual(expect.objectContaining({ type: "message" }));

    const catchEvent = events.find((e) => e.type === "catch-attempt");
    expect(catchEvent).toBeUndefined();

    // Battle should continue (not ended by a blocked catch)
    expect(engine.isEnded()).toBe(false);
  });

  it("given side 1 submits a ball item action, when resolved, then no catch attempt occurs", () => {
    // Arrange — only side 0 (player) can throw balls
    const ruleset = new MockRuleset();
    ruleset.setNextCatchResult({ shakes: 3, caught: true });

    const { engine, events } = createWildBattleEngine({ ruleset });
    engine.start();

    // Act — side 1 tries to throw a ball (invalid, wild Pokemon shouldn't throw balls)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "item", side: 1, itemId: "poke-ball" });

    // Assert — no catch attempt event
    const catchEvent = events.find((e) => e.type === "catch-attempt");
    expect(catchEvent).toBeUndefined();
  });

  it("given Ultra Ball item, when thrown at wild pokemon, then ballModifier=2 is passed to rollCatchAttempt", () => {
    // Arrange
    const ruleset = new MockRuleset();
    let capturedBallModifier = 0;

    // Override rollCatchAttempt to capture the ballModifier argument
    ruleset.rollCatchAttempt = (
      _catchRate: number,
      _maxHp: number,
      _currentHp: number,
      _status: import("@pokemon-lib-ts/core").PrimaryStatus | null,
      ballModifier: number,
      _rng: import("@pokemon-lib-ts/core").SeededRandom,
    ): CatchResult => {
      capturedBallModifier = ballModifier;
      return { shakes: 3, caught: true };
    };

    const { engine, events } = createWildBattleEngine({ ruleset });
    engine.start();

    // Act — throw ultra-ball
    engine.submitAction(0, { type: "item", side: 0, itemId: "ultra-ball" });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Ultra Ball has catchRateModifier = 2
    // Source: Bulbapedia "Ultra Ball" — catch rate modifier is 2x
    expect(capturedBallModifier).toBe(2);

    const catchEvent = events.find((e) => e.type === "catch-attempt");
    expect(catchEvent).toEqual(expect.objectContaining({ type: "catch-attempt", caught: true }));
  });

  it("given a Potion used (not a catch item), when item action submitted, then normal bag item logic applies (regression)", () => {
    // Arrange — ensure catch-type fork doesn't break normal items
    const ruleset = new MockRuleset();
    // Source: Bulbapedia "Potion" — heals 20 HP
    ruleset.setNextBagItemResult({
      activated: true,
      healAmount: 20,
      messages: ["Charizard recovered 20 HP!"],
    });

    const { engine, events } = createWildBattleEngine({ ruleset });
    engine.start();

    // Damage the pokemon after engine init
    const active = engine.state.sides[0].active[0];
    const maxHp = active!.pokemon.calculatedStats!.hp;
    active!.pokemon.currentHp = maxHp - 50;

    // Act — use potion (not a catch item)
    engine.submitAction(0, { type: "item", side: 0, itemId: "potion" });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — should get heal event, NOT catch event
    const healEvent = events.find((e) => e.type === "heal");
    expect(healEvent).toEqual(expect.objectContaining({ type: "heal" }));

    const catchEvent = events.find((e) => e.type === "catch-attempt");
    expect(catchEvent).toBeUndefined();
  });

  it("given the same seed, when two identical catch attempts run, then results are deterministic", () => {
    // Arrange — run the same scenario twice with the same seed
    const seed = 99999;

    function runCatchAttempt(): BattleEvent[] {
      const ruleset = new MockRuleset();
      // Source: packages/core/src/prng/seeded-random.ts — same seed produces the same
      // sequence, so the catch outcome is driven by the seeded RNG state.
      const { engine, events } = createWildBattleEngine({ ruleset, seed });
      engine.start();
      engine.submitAction(0, { type: "item", side: 0, itemId: "poke-ball" });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
      return [...events];
    }

    // Act
    const events1 = runCatchAttempt();
    const events2 = runCatchAttempt();

    // Assert — same seed produces identical event streams (full stream equality)
    // Source: CLAUDE.md "Seeded PRNG: Mulberry32. Deterministic battles for testing and replay."
    expect(events1).toEqual(events2);
  });
});
