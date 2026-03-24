import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

/**
 * Tests for Issue #623: Assault Vest blocks status moves.
 *
 * Source: Showdown data/items.ts -- Assault Vest: "The holder is unable to use status moves"
 * Source: Bulbapedia "Assault Vest" -- "The holder cannot use status moves"
 */

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        { moveId: "swords-dance", currentPP: 20, maxPP: 20, ppUps: 0 },
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
  ];

  const config: BattleConfig = {
    generation: 6,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

describe("Assault Vest -- getAvailableMoves (#623)", () => {
  it(
    "given a Pokemon holding Assault Vest with both physical and status moves, " +
      "when getAvailableMoves is called, then status moves are disabled",
    () => {
      // Source: Showdown data/items.ts -- Assault Vest: "The holder is unable to use status moves"
      // Source: Bulbapedia "Assault Vest" -- prevents holder from selecting status moves
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Set Assault Vest on the active Pokemon
      const active = engine.getActive(0);
      expect(active).not.toBeNull();
      active!.pokemon.heldItem = "assault-vest";

      const moves = engine.getAvailableMoves(0);

      // tackle (physical) should be enabled
      const tackle = moves.find((m) => m.moveId === "tackle");
      expect(tackle?.disabled).toBe(false);

      // swords-dance (status) should be disabled by Assault Vest
      const swordsDance = moves.find((m) => m.moveId === "swords-dance");
      expect(swordsDance?.disabled).toBe(true);
      expect(swordsDance?.disabledReason).toBe("Blocked by Assault Vest");
    },
  );

  it(
    "given a Pokemon without Assault Vest, " +
      "when getAvailableMoves is called, then status moves are NOT disabled",
    () => {
      // Source: Showdown data/items.ts -- only Assault Vest blocks status moves
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine } = createEngine({ ruleset });
      engine.start();

      const moves = engine.getAvailableMoves(0);

      // swords-dance should be available when not holding Assault Vest
      const swordsDance = moves.find((m) => m.moveId === "swords-dance");
      expect(swordsDance?.disabled).toBe(false);
    },
  );
});

describe("Assault Vest -- canExecuteMove runtime enforcement (#623)", () => {
  it(
    "given a Pokemon holding Assault Vest that tries to use a status move, " +
      "when the move executes, then the move is blocked with a message",
    () => {
      // Source: Showdown data/items.ts -- Assault Vest blocks status move execution
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Set Assault Vest on the active Pokemon
      const active = engine.getActive(0);
      expect(active).not.toBeNull();
      active!.pokemon.heldItem = "assault-vest";

      events.length = 0;

      // Try to use swords-dance (status move)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 1, target: 0 }); // swords-dance
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0, target: 0 }); // tackle

      // Should have a message about Assault Vest blocking
      const blockMessages = events.filter(
        (e) => e.type === "message" && e.text.includes("Assault Vest"),
      );
      expect(blockMessages.length).toBe(1);
      expect((blockMessages[0] as { type: "message"; text: string }).text).toBe(
        "Charizard can't use Swords Dance because of its Assault Vest!",
      );
    },
  );

  it(
    "given a Pokemon holding Assault Vest that uses a physical move, " +
      "when the move executes, then it is NOT blocked",
    () => {
      // Source: Showdown data/items.ts -- Assault Vest only blocks status moves
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Set Assault Vest on the active Pokemon
      const active = engine.getActive(0);
      expect(active).not.toBeNull();
      active!.pokemon.heldItem = "assault-vest";

      events.length = 0;

      // Use tackle (physical move) -- should NOT be blocked
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, target: 1 }); // tackle
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0, target: 0 }); // tackle

      // Should NOT have an Assault Vest blocking message
      const blockMessages = events.filter(
        (e) => e.type === "message" && e.text.includes("Assault Vest"),
      );
      expect(blockMessages.length).toBe(0);
    },
  );
});
