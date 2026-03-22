/**
 * Regression tests for:
 * - #526: defenderHealAmount usage for Present-style target healing
 * - #540: wishSet scheduling for Wish delayed healing
 *
 * Source: Bulbapedia -- "Present has a 102/256 (40%) chance of 40 base power,
 *   76/256 (30%) chance of 80 base power, 26/256 (10%) chance of 120 base power,
 *   and 52/256 (20%) chance of healing the target by 1/4 max HP"
 * Source: pret/pokecrystal engine/battle/effect_commands.asm PresentEffect
 * Source: Bulbapedia -- "Wish: At the end of the next turn, the Pokemon in the
 *   slot will be restored by half the maximum HP of the Pokemon that used Wish"
 * Source: Showdown data/moves.ts -- wish: { condition: { duration: 2, onResidual: heals floor(hp/2) } }
 */

import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

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
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("processEffectResult -- defenderHealAmount (issue #526)", () => {
  it("given a move returns defenderHealAmount, when move resolves, then the target's HP increases (not the attacker's)", () => {
    // Arrange
    // Source: Bulbapedia -- Present heals the target by 1/4 max HP
    // The target (Blastoise, side 1) should be healed, not the attacker (Charizard, side 0)
    let callCount = 0;
    const ruleset = new MockRuleset();
    ruleset.executeMoveEffect = () => {
      callCount++;
      if (callCount === 1) {
        // First move (Charizard -> Blastoise): simulate Present heal case
        // 1/4 of 200 max HP = 50 HP heal to defender
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          defenderHealAmount: 50, // heal the defender, not the attacker
          switchOut: false,
          messages: [],
        };
      }
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
      };
    };

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Manually reduce Blastoise HP below max to see the heal
    const defenderActive = engine.state.sides[1].active[0]!;
    const defenderMaxHp = defenderActive.pokemon.calculatedStats?.hp ?? 200;
    defenderActive.pokemon.currentHp = defenderMaxHp - 80; // 120 HP, missing 80

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- defender (Blastoise, side 1) should have been healed by 50
    const defenderHealEvents = events.filter(
      (e) => e.type === "heal" && e.side === 1 && e.source === "move-effect",
    );
    expect(defenderHealEvents.length).toBe(1);
    expect(defenderHealEvents[0]!.type === "heal" && defenderHealEvents[0]!.amount).toBe(50);

    // The attacker should NOT have been healed
    const attackerHealEvents = events.filter(
      (e) => e.type === "heal" && e.side === 0 && e.source === "move-effect",
    );
    expect(attackerHealEvents.length).toBe(0);
  });

  it("given defenderHealAmount exceeds missing HP, when move resolves, then heal is capped at max HP", () => {
    // Arrange
    // Source: Standard game mechanic -- heal cannot exceed max HP
    let callCount = 0;
    const ruleset = new MockRuleset();
    ruleset.setFixedDamage(0); // no damage dealt, isolate heal behavior
    ruleset.executeMoveEffect = () => {
      callCount++;
      if (callCount === 1) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          defenderHealAmount: 100, // try to heal 100
          switchOut: false,
          messages: [],
        };
      }
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
      };
    };

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Defender is only missing 30 HP
    const defenderActive = engine.state.sides[1].active[0]!;
    const defenderMaxHp = defenderActive.pokemon.calculatedStats?.hp ?? 200;
    defenderActive.pokemon.currentHp = defenderMaxHp - 30;

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- heal is capped: only 30 HP healed (not 100)
    const healEvents = events.filter(
      (e) => e.type === "heal" && e.side === 1 && e.source === "move-effect",
    );
    expect(healEvents.length).toBe(1);
    expect(healEvents[0]!.type === "heal" && healEvents[0]!.amount).toBe(30);

    // Verify defender is at max HP
    expect(defenderActive.pokemon.currentHp).toBe(defenderMaxHp);
  });
});

describe("processEffectResult -- wishSet (issue #540)", () => {
  it("given wishSet is returned, when current turn ends and next turn's EOT runs, then active Pokemon is healed by wishSet.healAmount", () => {
    // Arrange
    // Source: Bulbapedia -- "At the end of the next turn, the Pokemon in the slot
    //   will be restored by half the maximum HP of the Pokemon that used Wish"
    // Source: Showdown data/moves.ts -- wish condition: { duration: 2, onResidual: heals floor(hp/2) }
    //
    // Turn 1: Charizard uses Wish -> wishSet = { healAmount: 100 } (floor(200/2))
    // Turn 2: end-of-turn Wish triggers, heals active Pokemon by 100 HP
    let turnCount = 0;
    const ruleset = new MockRuleset();

    // Override EOT order to include "wish"
    ruleset.getEndOfTurnOrder = () => ["wish", "status-damage"];

    // First turn: Charizard returns wishSet
    // Subsequent turns: no effect
    const originalExecute = ruleset.executeMoveEffect.bind(ruleset);
    ruleset.executeMoveEffect = (context) => {
      turnCount++;
      if (turnCount === 1) {
        // Turn 1, first action (Charizard uses Wish)
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: ["Charizard made a wish!"],
          wishSet: { healAmount: 100 }, // floor(200 / 2)
        };
      }
      return originalExecute(context);
    };

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Reduce Charizard's HP before Turn 1 so the heal is visible
    const side0 = engine.state.sides[0];
    const charizard = side0.active[0]!;
    charizard.pokemon.currentHp = 50; // 50 of 200 HP remaining

    // Act -- Turn 1: Charizard uses Wish
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Verify: Wish is now pending on side 0
    expect(side0.wish).not.toBeNull();
    expect(side0.wish!.active).toBe(true);
    expect(side0.wish!.healAmount).toBe(100);

    // Reduce Charizard's HP again (in case it was damaged or healed by turn actions)
    charizard.pokemon.currentHp = 50;

    // Act -- Turn 2: both use Tackle, Wish should trigger at EOT
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- Wish should have healed during Turn 2's EOT
    const wishHealEvents = events.filter(
      (e) => e.type === "heal" && e.side === 0 && e.source === "wish",
    );
    expect(wishHealEvents.length).toBe(1);

    // Wish state should be cleared after healing
    expect(side0.wish).toBeNull();
  });

  it("given wishSet is returned, when wish triggers but active Pokemon is at full HP, then no heal event is emitted", () => {
    // Arrange
    // Source: Standard game mechanic -- heal is a no-op at full HP
    let turnCount = 0;
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = () => ["wish", "status-damage"];
    ruleset.setFixedDamage(0); // no damage dealt

    ruleset.executeMoveEffect = () => {
      turnCount++;
      if (turnCount === 1) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: ["Charizard made a wish!"],
          wishSet: { healAmount: 100 },
        };
      }
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
      };
    };

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Keep Charizard at full HP
    const side0 = engine.state.sides[0];
    const charizard = side0.active[0]!;
    const maxHp = charizard.pokemon.calculatedStats?.hp ?? 200;
    charizard.pokemon.currentHp = maxHp;

    // Turn 1
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Turn 2 -- Wish triggers but Pokemon is at full HP
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- no wish heal event because already at full HP
    const wishHealEvents = events.filter(
      (e) => e.type === "heal" && e.side === 0 && e.source === "wish",
    );
    expect(wishHealEvents.length).toBe(0);

    // Wish state should still be cleared
    expect(side0.wish).toBeNull();
  });
});
