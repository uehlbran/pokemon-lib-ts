/**
 * Integration tests: BattleEngine processing of item-related MoveEffectResult fields.
 *
 * These tests verify the ENGINE CONTRACT — that when a move effect handler returns
 * specific flags (attackerItemConsumed, itemTransfer), the engine:
 * 1. Mutates state correctly (items removed/transferred)
 * 2. Emits the correct events (item-consumed)
 *
 * These tests exist because handler unit tests CANNOT verify engine behavior.
 * Handler tests only check the return value; these tests check what the engine
 * DOES with that return value.
 *
 * Closes the integration test gap identified in the PR #1105 post-mortem:
 * - attackerItemConsumed: 7 handler tests, 0 engine integration tests
 * - itemTransfer: 12 handler tests, 0 engine integration tests
 */

import { CORE_ITEM_IDS, CORE_MOVE_IDS, type PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

function createTestEngine(overrides?: {
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  seed?: number;
}): { engine: BattleEngine; events: BattleEvent[]; ruleset: MockRuleset } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "attacker-1",
      nickname: "Attacker",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      uid: "defender-1",
      nickname: "Defender",
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
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));

  return { engine, events, ruleset };
}

// ---------------------------------------------------------------------------
// attackerItemConsumed contract: engine must emit item-consumed event
// ---------------------------------------------------------------------------

describe("BattleEngine — attackerItemConsumed contract", () => {
  it("given a move effect that sets attackerItemConsumed, when the turn executes, then item-consumed event is emitted with the correct item ID", () => {
    // This test verifies the ENGINE processes the attackerItemConsumed flag correctly.
    // The handler returns the flag; the engine must:
    // 1. Record the item ID before nulling it
    // 2. Null the held item
    // 3. Emit an item-consumed event with the original item ID
    //
    // Source: BattleEngine.ts:4375-4390 — attackerItemConsumed processing path
    const { engine, events, ruleset } = createTestEngine({
      team1: [
        createTestPokemon(6, 50, {
          uid: "natural-gift-user",
          nickname: "Ambipom",
          heldItem: CORE_ITEM_IDS.airBalloon,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      ],
    });

    ruleset.setMoveEffectResult({
      attackerItemConsumed: true,
      messages: ["Ambipom used Natural Gift!"],
    });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const itemConsumedEvents = events.filter((e) => e.type === "item-consumed");
    expect(itemConsumedEvents).toHaveLength(1);

    const evt = itemConsumedEvents[0];
    if (evt?.type === "item-consumed") {
      expect(evt.side).toBe(0);
      expect(evt.pokemon).toBe("Ambipom");
      expect(evt.item).toBe(CORE_ITEM_IDS.airBalloon);
    }

    const attacker = engine.state.sides[0].active[0];
    expect(attacker?.pokemon.heldItem).toBeNull();
  });

  it("given a move effect that does NOT set attackerItemConsumed, when the turn executes, then no item-consumed event is emitted and item is preserved", () => {
    // Negative case: the engine must NOT consume the item when the flag is absent
    const { engine, events, ruleset } = createTestEngine({
      team1: [
        createTestPokemon(6, 50, {
          uid: "normal-move-user",
          nickname: "Ambipom",
          heldItem: CORE_ITEM_IDS.airBalloon,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      ],
    });

    // Default: no attackerItemConsumed flag
    ruleset.setMoveEffectResult({ messages: ["Ambipom used Tackle!"] });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const itemConsumedEvents = events.filter((e) => e.type === "item-consumed");
    expect(itemConsumedEvents).toHaveLength(0);

    const attacker = engine.state.sides[0].active[0];
    expect(attacker?.pokemon.heldItem).toBe(CORE_ITEM_IDS.airBalloon);
  });
});

// ---------------------------------------------------------------------------
// itemTransfer contract: engine must transfer items between pokemon
// ---------------------------------------------------------------------------

describe("BattleEngine — itemTransfer contract", () => {
  it("given a move effect with itemTransfer from defender to attacker, when defender has an item and attacker does not, then item transfers", () => {
    // Verifies the engine's itemTransfer path (BattleEngine.ts:4509-4517)
    // This is the Thief/Covet pattern: steal defender's item
    const { engine, events, ruleset } = createTestEngine({
      team1: [
        createTestPokemon(6, 50, {
          uid: "thief-user",
          nickname: "Thief",
          heldItem: null,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      ],
      team2: [
        createTestPokemon(9, 50, {
          uid: "thief-target",
          nickname: "Target",
          heldItem: CORE_ITEM_IDS.leftovers,
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
      ],
    });

    ruleset.setMoveEffectResult({
      itemTransfer: { from: "defender", to: "attacker" },
      messages: ["Thief stole Target's Leftovers!"],
    });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const attacker = engine.state.sides[0].active[0];
    const defender = engine.state.sides[1].active[0];
    expect(attacker?.pokemon.heldItem).toBe(CORE_ITEM_IDS.leftovers);
    expect(defender?.pokemon.heldItem).toBeNull();
  });

  it("given a move effect with itemTransfer but defender has no item, when the turn executes, then no transfer occurs", () => {
    // Guard condition: engine only transfers when from has item AND to has none
    // Source: BattleEngine.ts:4513 — if (from.pokemon.heldItem && !to.pokemon.heldItem)
    const { engine, ruleset } = createTestEngine({
      team1: [
        createTestPokemon(6, 50, {
          uid: "thief-user-2",
          nickname: "Thief",
          heldItem: null,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      ],
      team2: [
        createTestPokemon(9, 50, {
          uid: "thief-target-2",
          nickname: "Target",
          heldItem: null,
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
      ],
    });

    ruleset.setMoveEffectResult({
      itemTransfer: { from: "defender", to: "attacker" },
      messages: [],
    });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const attacker = engine.state.sides[0].active[0];
    const defender = engine.state.sides[1].active[0];
    expect(attacker?.pokemon.heldItem).toBeNull();
    expect(defender?.pokemon.heldItem).toBeNull();
  });
});
