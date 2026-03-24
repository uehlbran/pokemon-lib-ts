/**
 * Regression tests for:
 *   - Bug #551: Focus Sash never activates (on-damage-taken item context uses post-damage HP)
 *   - Bug #600: Leftovers/Black Sludge can activate twice per turn via toxic-orb-activation
 *
 * Source: Bulbapedia -- Focus Sash: "If the holder is at full HP, it will survive a hit
 *   that would KO it with 1 HP remaining. The item is then consumed."
 * Source: Showdown sim/battle-actions.ts -- Focus Sash uses onDamage priority, fires
 *   before HP subtraction (like Sturdy).
 * Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP once per turn.
 */
import type { MoveData } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, EndOfTurnEffect, ItemContext, ItemResult } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import type { ActivePokemon, BattleState } from "../../src/state";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ---------------------------------------------------------------------------
// Mock Ruleset for Focus Sash tests
// ---------------------------------------------------------------------------

/**
 * MockRuleset that implements capLethalDamage for Focus Sash.
 * Simulates: if defender holds "focus-sash" and is at full HP, cap damage to maxHp-1,
 * consume the item.
 */
class FocusSashMockRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    _state: BattleState,
  ): { damage: number; survived: boolean; messages: string[]; consumedItem?: string } {
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    const heldItem = defender.pokemon.heldItem;

    // Focus Sash: full HP -> survive at 1 HP, consume item
    // Source: Bulbapedia -- Focus Sash: survive with 1 HP if at full HP; consumed
    // Source: Showdown data/items.ts -- Focus Sash onDamage
    if (
      heldItem === "focus-sash" &&
      defender.pokemon.currentHp === maxHp &&
      damage >= defender.pokemon.currentHp
    ) {
      const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on with its Focus Sash!`],
        consumedItem: "focus-sash",
      };
    }

    return { damage, survived: false, messages: [] };
  }
}

// ---------------------------------------------------------------------------
// Mock Ruleset for Leftovers double-activation tests
// ---------------------------------------------------------------------------

/**
 * MockRuleset that tracks how many times applyHeldItem("end-of-turn") fires
 * and simulates Leftovers healing.
 */
class LeftoversMockRuleset extends MockRuleset {
  endOfTurnItemCalls = 0;

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    if (trigger === "end-of-turn") {
      this.endOfTurnItemCalls++;
      const item = context.pokemon.pokemon.heldItem;
      if (item === "leftovers") {
        const maxHp =
          context.pokemon.pokemon.calculatedStats?.hp ?? context.pokemon.pokemon.currentHp;
        const healAmount = Math.max(1, Math.floor(maxHp / 16));
        return {
          activated: true,
          effects: [{ type: "heal", target: "self", value: healAmount }],
          messages: ["Leftovers restored HP!"],
        };
      }
    }
    return { activated: false, effects: [], messages: [] };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createFocusSashEngine(overrides?: {
  seed?: number;
  defenderHp?: number;
  fixedDamage?: number;
  heldItem?: string;
}) {
  const ruleset = new FocusSashMockRuleset();
  ruleset.setFixedDamage(overrides?.fixedDamage ?? 300);
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const defenderHp = overrides?.defenderHp ?? 200;

  const team1 = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 150,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const team2 = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      heldItem: overrides?.heldItem ?? "focus-sash",
      calculatedStats: {
        hp: defenderHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: defenderHp,
    }),
  ];

  const config: BattleConfig = {
    generation: 5,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

function createLeftoversEngine(eotOrder: readonly EndOfTurnEffect[]) {
  const ruleset = new LeftoversMockRuleset();
  ruleset.setFixedDamage(0); // No combat damage -- isolate EOT effects
  ruleset.getEndOfTurnOrder = () => eotOrder;
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      heldItem: "leftovers",
      calculatedStats: {
        hp: 160,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: 100, // Below max to see healing
    }),
  ];

  const team2 = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 160,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: 160,
    }),
  ];

  const config: BattleConfig = {
    generation: 5,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ---------------------------------------------------------------------------
// Bug #551 -- Focus Sash activation via capLethalDamage
// ---------------------------------------------------------------------------

describe("Bug #551 -- Focus Sash activation via capLethalDamage", () => {
  it("given a full-HP Pokemon with Focus Sash, when a move would KO, then it survives with 1 HP and Focus Sash is consumed", () => {
    // Source: Bulbapedia -- Focus Sash: "If holder is at full HP, it will survive a hit
    //   that would KO, with 1 HP remaining. The item is then consumed."
    // Source: Showdown data/items.ts -- Focus Sash onDamage (priority -30)

    // Arrange
    const { engine, events } = createFocusSashEngine({ fixedDamage: 300 });
    engine.start();

    const defender = engine.state.sides[1].active[0];
    expect(defender).not.toBeNull();
    // Engine recalculates stats via MockRuleset; read the actual maxHp
    const maxHp = defender!.pokemon.calculatedStats?.hp ?? defender!.pokemon.currentHp;
    expect(defender!.pokemon.currentHp).toBe(maxHp); // Full HP
    expect(defender!.pokemon.heldItem).toBe("focus-sash");

    // Act -- Charizard (speed 120) attacks Blastoise (speed 80)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- Blastoise survives at 1 HP
    expect(defender!.pokemon.currentHp).toBe(1);

    // Focus Sash should be consumed
    expect(defender!.pokemon.heldItem).toBeNull();

    // Verify the Focus Sash message was emitted
    const sashMessages = events.filter(
      (e) => e.type === "message" && typeof e.text === "string" && e.text.includes("Focus Sash"),
    );
    expect(sashMessages.length).toBe(1);
  });

  it("given a non-full-HP Pokemon with Focus Sash, when a move would KO, then Focus Sash does NOT activate and Pokemon faints", () => {
    // Source: Bulbapedia -- Focus Sash: "If the holder is at FULL HP..." (must be full)
    // Source: Showdown data/items.ts -- Focus Sash checks pokemon.hp === pokemon.baseMaxhp

    // Arrange
    const { engine } = createFocusSashEngine({ fixedDamage: 300 });
    engine.start();

    const defender = engine.state.sides[1].active[0];
    expect(defender).not.toBeNull();
    const maxHp = defender!.pokemon.calculatedStats?.hp ?? defender!.pokemon.currentHp;
    // Reduce HP below max BEFORE the attack
    defender!.pokemon.currentHp = maxHp - 1; // Not full

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- Blastoise faints (Focus Sash doesn't activate at non-full HP)
    expect(defender!.pokemon.currentHp).toBe(0);

    // Focus Sash should NOT be consumed
    expect(defender!.pokemon.heldItem).toBe("focus-sash");
  });

  it("given a full-HP Pokemon with Focus Sash, when a move does NOT KO, then Focus Sash does NOT activate", () => {
    // Source: Bulbapedia -- Focus Sash only activates on a would-be KO
    // Source: Showdown -- Focus Sash: only when damage >= currentHp

    // Arrange -- fixedDamage=50 won't KO
    const { engine } = createFocusSashEngine({ fixedDamage: 50 });
    engine.start();

    const defender = engine.state.sides[1].active[0];
    expect(defender).not.toBeNull();
    const maxHp = defender!.pokemon.calculatedStats?.hp ?? defender!.pokemon.currentHp;

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- Blastoise took damage but Focus Sash didn't activate
    expect(defender!.pokemon.currentHp).toBe(maxHp - 50);
    expect(defender!.pokemon.heldItem).toBe("focus-sash"); // Not consumed
  });
});

// ---------------------------------------------------------------------------
// Bug #600 -- Leftovers double-activation via toxic-orb-activation
// ---------------------------------------------------------------------------

describe("Bug #600 -- Leftovers should not activate twice when toxic-orb-activation runs", () => {
  it("given a Pokemon with Leftovers and EOT order [leftovers, toxic-orb-activation], when EOT runs, then Leftovers heals exactly once (1/16 max HP)", () => {
    // Source: Showdown data/items.ts -- Leftovers heals 1/16 max HP once per turn
    // Bug: toxic-orb-activation calls applyHeldItem("end-of-turn") unfiltered,
    //   causing Leftovers to fire again during the orb phase.

    // Arrange
    const { engine, ruleset, events } = createLeftoversEngine([
      "leftovers",
      "toxic-orb-activation",
    ]);
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    expect(active0).not.toBeNull();
    // The engine may recalculate HP; set it after start
    active0!.pokemon.currentHp = 100;
    const maxHp = active0!.pokemon.calculatedStats?.hp ?? 160;
    const expectedHeal = Math.max(1, Math.floor(maxHp / 16));

    ruleset.endOfTurnItemCalls = 0;
    events.length = 0;

    // Act -- play a turn to trigger EOT
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- Leftovers should heal exactly once
    // The heal events for the Leftovers holder (side 0) should total exactly expectedHeal
    const healEvents = events.filter(
      (e) =>
        e.type === "heal" &&
        "side" in e &&
        e.side === 0 &&
        "source" in e &&
        e.source === "held-item",
    );
    // Should be exactly 1 heal event, not 2
    expect(healEvents.length).toBe(1);

    // HP should be 100 + expectedHeal, NOT 100 + 2*expectedHeal
    expect(active0!.pokemon.currentHp).toBe(100 + expectedHeal);
  });

  it("given a Pokemon with Leftovers and EOT order [leftovers, flame-orb-activation], when EOT runs, then Leftovers heals exactly once", () => {
    // Source: Showdown data/items.ts -- same bug as toxic-orb but with flame-orb phase
    // Triangulation test with flame-orb-activation instead of toxic-orb-activation

    // Arrange
    const { engine, ruleset, events } = createLeftoversEngine([
      "leftovers",
      "flame-orb-activation",
    ]);
    engine.start();

    const active0 = engine.state.sides[0].active[0];
    expect(active0).not.toBeNull();
    active0!.pokemon.currentHp = 100;
    const maxHp = active0!.pokemon.calculatedStats?.hp ?? 160;
    const expectedHeal = Math.max(1, Math.floor(maxHp / 16));

    ruleset.endOfTurnItemCalls = 0;
    events.length = 0;

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const healEvents = events.filter(
      (e) =>
        e.type === "heal" &&
        "side" in e &&
        e.side === 0 &&
        "source" in e &&
        e.source === "held-item",
    );
    expect(healEvents.length).toBe(1);
    expect(active0!.pokemon.currentHp).toBe(100 + expectedHeal);
  });
});
