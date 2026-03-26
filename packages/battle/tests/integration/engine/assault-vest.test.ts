import type { DataManager, PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { GEN6_ITEM_IDS, GEN6_SPECIES_IDS } from "@pokemon-lib-ts/gen6";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

const ITEMS = GEN6_ITEM_IDS;
const MOVES = CORE_MOVE_IDS;
const SPECIES = GEN6_SPECIES_IDS;

/**
 * Tests for Issue #623: Assault Vest blocks status moves.
 *
 * Source: packages/battle/src/engine/BattleEngine.ts — getAvailableMoves() and executeMove()
 *   block status moves when the holder has Assault Vest.
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
  const tackle = dataManager.getMove(MOVES.tackle);
  const swordsDance = dataManager.getMove(MOVES.swordsDance);

  const team1 = overrides?.team1 ?? [
    createTestPokemon(SPECIES.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: tackle.id, currentPP: tackle.pp, maxPP: tackle.pp, ppUps: 0 },
        {
          moveId: swordsDance.id,
          currentPP: swordsDance.pp ?? 0,
          maxPP: swordsDance.pp ?? 0,
          ppUps: 0,
        },
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
    createTestPokemon(SPECIES.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: tackle.id, currentPP: tackle.pp, maxPP: tackle.pp, ppUps: 0 }],
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
      // Source: packages/battle/src/engine/BattleEngine.ts — getAvailableMoves() blocks
      // status moves when the holder has Assault Vest.
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine } = createEngine({ ruleset });
      engine.start();

      // Set Assault Vest on the active Pokemon
      const active = engine.state.sides[0].active[0];
      expect(active).not.toBeNull();
      active!.pokemon.heldItem = ITEMS.assaultVest;

      const moves = engine.getAvailableMoves(0);

      // tackle (physical) should be enabled
      const tackleChoice = moves.find((m) => m.moveId === MOVES.tackle);
      expect(tackleChoice?.disabled).toBe(false);

      // swords-dance (status) should be disabled by Assault Vest
      const swordsDanceChoice = moves.find((m) => m.moveId === MOVES.swordsDance);
      expect(swordsDanceChoice?.disabled).toBe(true);
      expect(swordsDanceChoice?.disabledReason).toBe("Blocked by Assault Vest");
    },
  );

  it(
    "given a Pokemon without Assault Vest, " +
      "when getAvailableMoves is called, then status moves are NOT disabled",
    () => {
      // Source: packages/battle/src/engine/BattleEngine.ts — only Assault Vest blocks
      // status moves here.
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine } = createEngine({ ruleset });
      engine.start();

      const moves = engine.getAvailableMoves(0);

      // swords-dance should be available when not holding Assault Vest
      const swordsDanceChoice = moves.find((m) => m.moveId === MOVES.swordsDance);
      expect(swordsDanceChoice?.disabled).toBe(false);
    },
  );
});

describe("Assault Vest -- canExecuteMove runtime enforcement (#623)", () => {
  it(
    "given a Pokemon holding Assault Vest that tries to use a status move, " +
      "when the move executes, then the move is blocked with a message",
    () => {
      // Source: packages/battle/src/engine/BattleEngine.ts — executeMove() blocks status
      // moves when the holder has Assault Vest.
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Set Assault Vest on the active Pokemon
      const active = engine.state.sides[0].active[0];
      expect(active).not.toBeNull();
      active!.pokemon.heldItem = ITEMS.assaultVest;

      events.length = 0;

      // Try to use swords-dance (status move)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 1, target: 0 }); // swords-dance
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0, target: 0 }); // tackle

      // Should have a message about Assault Vest blocking
      const blockMessages = events.filter(
        (e) => e.type === "message" && e.text.includes("Assault Vest"),
      );
      expect(blockMessages.length).toBe(1);
      const swordsDance = engine.dataManager.getMove(MOVES.swordsDance);
      const assaultVestMessage = `${active!.pokemon.nickname ?? "Pokemon"} can't use ${swordsDance.displayName} because of its Assault Vest!`;
      expect((blockMessages[0] as { type: "message"; text: string }).text).toBe(assaultVestMessage);
    },
  );

  it(
    "given a Pokemon holding Assault Vest that uses a physical move, " +
      "when the move executes, then it is NOT blocked",
    () => {
      // Source: packages/battle/src/engine/BattleEngine.ts — Assault Vest only blocks
      // status moves.
      const ruleset = new MockRuleset();
      ruleset.hasHeldItems = () => true;

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Set Assault Vest on the active Pokemon
      const active = engine.state.sides[0].active[0];
      expect(active).not.toBeNull();
      active!.pokemon.heldItem = ITEMS.assaultVest;

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
