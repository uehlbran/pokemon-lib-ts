import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

function createPhazeTestEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  // Side 0: fast attacker (speed 120) — will go first and use a "phazing" move
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

  // Side 1: slow defender (speed 80) with 2 team members — gets phased out
  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    createTestPokemon(25, 50, {
      uid: "pikachu-bench",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 120,
        attack: 80,
        defense: 70,
        spAttack: 80,
        spDefense: 70,
        speed: 90,
      },
      currentHp: 120,
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("Forced switch (phazing) action inheritance", () => {
  it("given Whirlwind forces a switch mid-turn, when the phased-out Pokemon had a queued move, then the replacement does not execute that queued move", () => {
    // Arrange
    // Source: Bulbapedia — "When a Pokémon is forced to switch out by a move like Whirlwind
    // or Roar, the replacement Pokémon does not get to execute the phased-out Pokémon's
    // queued action for that turn."
    // The MockRuleset resolves turn order by speed: side 0 (speed 120) goes first,
    // side 1 (speed 80) goes second. Side 0's executeMoveEffect returns forcedSwitch=true,
    // causing side 1's active to be phased out. Side 1's queued tackle should be skipped.
    const { engine, ruleset, events } = createPhazeTestEngine();

    // Configure the first executeMoveEffect call to simulate a phazing move
    ruleset.setMoveEffectResult({ switchOut: true, forcedSwitch: true });

    engine.start();

    // Both sides queue a move (tackle)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Act — resolve the turn
    // Side 0 goes first (speed 120 > 80), its tackle triggers forcedSwitch,
    // which phases out side 1's Blastoise for Pikachu.
    // Side 1's queued tackle should NOT be executed by Pikachu.

    // Assert — count how many "move-execute" (or damage) events happened.
    // Only side 0's move should execute. Side 1's queued move should be skipped.
    const _moveExecuteEvents = events.filter((e) => e.type === "damage" && "side" in e);

    // Side 0's tackle does damage (10, from MockRuleset.fixedDamage).
    // Side 1 was phased — the replacement should NOT have acted.
    // We verify by checking that the replacement (Pikachu, hp=120) took damage
    // from side 0's attack, but did NOT deal damage back.

    // Check that side 1's active is now Pikachu (the replacement)
    const side1Active = engine.state.sides[1].active[0];
    expect(side1Active).toBeDefined();
    expect(side1Active!.pokemon.uid).toBe("pikachu-bench");

    // Check that Charizard (side 0) was NOT damaged by any move from side 1.
    // MockRuleset.calculateStats recalculates from species base stats:
    // Charizard base HP=78, level 50 → floor(((2*78+31)*50)/100) + 50 + 10 = 153
    // Source: MockRuleset.calculateStats formula
    const side0Active = engine.state.sides[0].active[0];
    expect(side0Active).toBeDefined();
    expect(side0Active!.pokemon.currentHp).toBe(153); // Full HP — never attacked
  });

  it("given a side was phased out, when the phased side had a queued move, then that move is skipped (triangulation with different damage)", () => {
    // Arrange
    // Source: same Bulbapedia reference as above.
    // Second test with different fixed damage to triangulate.
    // MockRuleset.calculateStats: Charizard (base HP=78, lv50) → 153 HP
    const { engine, ruleset } = createPhazeTestEngine({ seed: 99 });

    // Set damage to 50 — if the replacement attacks, Charizard loses 50 HP.
    ruleset.setFixedDamage(50);
    // Configure the phazing effect for the first executeMoveEffect call
    ruleset.setMoveEffectResult({ switchOut: true, forcedSwitch: true });

    engine.start();

    // Side 0 queues a move (which will trigger phazing)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    // Side 1 also queues a move
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Side 0 goes first (faster), phases side 1.
    // Side 1's queued move should be skipped.

    // Verify the replacement is on the field
    const side1Active = engine.state.sides[1].active[0];
    expect(side1Active).toBeDefined();
    expect(side1Active!.pokemon.uid).toBe("pikachu-bench");

    // Charizard should be at full HP (153) — side 1's move was skipped
    const side0Active = engine.state.sides[0].active[0];
    expect(side0Active).toBeDefined();
    expect(side0Active!.pokemon.currentHp).toBe(153);
  });
});
