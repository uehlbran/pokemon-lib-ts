import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createDestinyBondEngine(opts?: { side0Hp?: number; side1Hp?: number }) {
  const ruleset = new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  // Side 0: Charizard (slower) — will use Destiny Bond then get KO'd
  // Side 1: Blastoise (faster) — will use tackle to KO
  const team1: PokemonInstance[] = [
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
        speed: 80,
      },
      currentHp: opts?.side0Hp ?? 200,
    }),
    // Second pokemon for the case where Charizard faints
    createTestPokemon(25, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
      },
      currentHp: 100,
    }),
  ];

  const team2: PokemonInstance[] = [
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
        speed: 120,
      },
      currentHp: opts?.side1Hp ?? 200,
    }),
    createTestPokemon(25, 50, {
      uid: "pikachu-2",
      nickname: "Pikachu2",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
      },
      currentHp: 100,
    }),
  ];

  const config: BattleConfig = {
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));

  return { engine, ruleset, events };
}

describe("Destiny Bond faint check", () => {
  it("given a Pokemon with destiny-bond that faints from opponent's move, when the faint is processed, then the opponent also faints", () => {
    // Source: Bulbapedia — "If the user faints after using this move, the Pokemon
    // that knocked it out also faints."
    // Arrange — Charizard has 5 HP (mock deals 10 damage), will be KO'd by Blastoise
    const { engine, ruleset, events } = createDestinyBondEngine();
    ruleset.setFixedDamage(10); // Blastoise's tackle will KO Charizard (5 HP)
    engine.start();

    // Set HP after engine.start() — the constructor resets currentHp to calculatedStats.hp
    const active0 = engine.state.sides[0].active[0];
    active0!.pokemon.currentHp = 5;
    active0!.volatileStatuses.set("destiny-bond", { turnsLeft: -1 });

    // Act — Blastoise (faster, side 1) attacks first and KOs Charizard
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — both Pokemon should have fainted
    const faintEvents = events.filter((e) => e.type === "faint");
    expect(faintEvents.length).toBe(2);

    // Charizard fainted from the attack
    expect(faintEvents[0]!.type === "faint" && faintEvents[0]!.pokemon).toBe("Charizard");
    // Blastoise fainted from Destiny Bond
    expect(faintEvents[1]!.type === "faint" && faintEvents[1]!.pokemon).toBe("Blastoise");

    // Verify the Destiny Bond message was emitted
    const destinyBondMsg = events.find(
      (e) => e.type === "message" && e.text.includes("took its attacker down with it"),
    );
    expect(destinyBondMsg).toBeDefined();
  });

  it("given a Pokemon with destiny-bond that faints from weather damage, when the faint is processed, then Destiny Bond does NOT trigger", () => {
    // Source: Bulbapedia — Destiny Bond only triggers when the user faints from
    // the opponent's move, not from indirect damage sources
    // Arrange — Charizard has 1 HP, will take status damage (burn)
    const { engine, ruleset, events } = createDestinyBondEngine();
    // Configure the ruleset to include status-damage in EoT
    ruleset.setFixedDamage(0); // No damage from moves

    // Override getEndOfTurnOrder to include status-damage
    ruleset.getEndOfTurnOrder = () => ["status-damage"];

    engine.start();

    // Set HP after engine.start() — the constructor resets currentHp to calculatedStats.hp
    const active0 = engine.state.sides[0].active[0];
    active0!.pokemon.currentHp = 1;
    active0!.volatileStatuses.set("destiny-bond", { turnsLeft: -1 });
    active0!.pokemon.status = "burn";

    // Act — both sides use moves that deal 0 damage, then burn KOs Charizard at EoT
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — only Charizard should have fainted, not Blastoise
    const faintEvents = events.filter((e) => e.type === "faint");
    // Charizard faints from burn, but Destiny Bond should NOT trigger because
    // the faint was from status damage, not from the opponent's move
    const blastoiseFaints = faintEvents.filter(
      (e) => e.type === "faint" && e.pokemon === "Blastoise",
    );
    expect(blastoiseFaints.length).toBe(0);

    // Blastoise should still be alive
    const blastoise = engine.state.sides[1].active[0];
    if (blastoise) {
      expect(blastoise.pokemon.currentHp).toBeGreaterThan(0);
    }
  });
});
