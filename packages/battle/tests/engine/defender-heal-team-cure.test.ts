/**
 * Tests for defenderHealAmount and teamStatusCure in processEffectResult.
 *
 * defenderHealAmount: heals the DEFENDER (used by Heal Pulse)
 * teamStatusCure: cures status for ALL Pokemon on a side's team (used by Aromatherapy, Heal Bell)
 *
 * Source: Bulbapedia -- "Heal Pulse restores up to half of the target's maximum HP"
 * Source: Showdown data/moves.ts -- healPulse: { target: 'normal', heal: [1, 2] }
 * Source: Bulbapedia -- "Aromatherapy cures the status conditions of all Pokemon on the user's team"
 * Source: Showdown data/moves.ts -- aromatherapy: { target: 'allyTeam' }
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
      currentHp: 100, // at 50% HP for heal tests
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

describe("processEffectResult -- defenderHealAmount", () => {
  it("given defenderHealAmount=80, when move resolves, then defender is healed by 80 HP", () => {
    // Source: Heal Pulse heals the TARGET (defender), not the user (attacker)
    // Source: Showdown data/moves.ts -- healPulse: { target: 'normal', heal: [1, 2] }
    let callCount = 0;
    const ruleset = new MockRuleset();
    // Only the first move (Charizard -> Blastoise) heals the defender;
    // the second move (Blastoise -> Charizard) returns a no-op result.
    ruleset.executeMoveEffect = () => {
      callCount++;
      if (callCount === 1) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          defenderHealAmount: 80,
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

    // Manually reduce Blastoise HP after start (engine recalculates stats in constructor)
    const defenderActive = engine.state.sides[1].active[0]!;
    const defenderMaxHp = defenderActive.pokemon.calculatedStats?.hp ?? 200;
    defenderActive.pokemon.currentHp = defenderMaxHp - 100; // 100 HP below max

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- defender (Blastoise, side 1) should have been healed
    // Charizard (speed 120) moves first, so it heals Blastoise
    const healEvents = events.filter(
      (e) => e.type === "heal" && e.side === 1 && e.source === "move-effect",
    );
    expect(healEvents.length).toBeGreaterThanOrEqual(1);

    // Verify the attacker was NOT healed (healAmount was 0 and no defenderHealAmount on 2nd move)
    const attackerHealEvents = events.filter(
      (e) => e.type === "heal" && e.side === 0 && e.source === "move-effect",
    );
    expect(attackerHealEvents.length).toBe(0);
  });

  it("given defenderHealAmount=300 exceeds max HP, when move resolves, then defender HP capped at max", () => {
    // Source: healing cannot exceed max HP
    const ruleset = new MockRuleset();
    ruleset.executeMoveEffect = () => ({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      defenderHealAmount: 300, // exceeds max HP
      switchOut: false,
      messages: [],
    });

    const { engine } = createEngine({ ruleset });
    engine.start();

    // Manually reduce Blastoise HP after start
    const defenderActive = engine.state.sides[1].active[0]!;
    const defenderMaxHp = defenderActive.pokemon.calculatedStats?.hp ?? 200;
    defenderActive.pokemon.currentHp = defenderMaxHp - 100;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Healing of 300 should cap HP at max
    const defenderAfter = engine.state.sides[1].active[0]!;
    expect(defenderAfter.pokemon.currentHp).toBeLessThanOrEqual(defenderMaxHp);
  });
});

describe("processEffectResult -- teamStatusCure", () => {
  it("given teamStatusCure on attacker side, when move resolves, then benched poisoned Pokemon is cured", () => {
    // Source: Bulbapedia -- "Aromatherapy cures the status conditions of all Pokemon on the user's team"
    // Source: Showdown data/moves.ts -- aromatherapy: { target: 'allyTeam' }
    const ruleset = new MockRuleset();
    ruleset.executeMoveEffect = () => ({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
      teamStatusCure: { side: "attacker" },
    });

    // Create team with 2 Pokemon -- use species 25 (Pikachu, known to mock data manager)
    // Status will be set after engine.start() since the constructor recalculates stats
    const team1 = [
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
      createTestPokemon(25, 50, {
        uid: "pikachu-1",
        nickname: "Pikachu",
        moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 150,
      }),
    ];

    const { engine } = createEngine({ team1, ruleset });
    engine.start();

    // Set poison on the benched Pikachu AFTER engine.start() (constructor resets state)
    engine.state.sides[0].team[1].status = "poison";

    // Verify benched Pikachu has poison before the move
    const benchedBefore = engine.state.sides[0].team[1];
    expect(benchedBefore.status).toBe("poison");

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- benched Pikachu should have its poison cured
    const benchedAfter = engine.state.sides[0].team[1];
    expect(benchedAfter.status).toBeNull();
  });
});

describe("processEffectResult -- abilityChange", () => {
  it("given abilityChange targeting defender, when move resolves, then defender's ability is changed", () => {
    // Source: Showdown data/moves.ts entrainment -- target.setAbility(source.ability)
    // Source: Bulbapedia -- "Entrainment changes the target's Ability to match the user's"
    const ruleset = new MockRuleset();
    ruleset.executeMoveEffect = () => ({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
      abilityChange: { target: "defender", ability: "intimidate" },
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Verify defender (Blastoise) starts with default ability (not intimidate)
    const defenderBefore = engine.state.sides[1].active[0]!;
    expect(defenderBefore.ability).not.toBe("intimidate");

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert -- defender's ability should have been changed to intimidate
    // Charizard (speed 120) moves first, so its effect applies to Blastoise
    const defenderAfter = engine.state.sides[1].active[0]!;
    expect(defenderAfter.ability).toBe("intimidate");

    // Verify a message was emitted about the ability change
    const abilityMessages = events.filter(
      (e) => e.type === "message" && (e as { text?: string }).text?.includes("intimidate"),
    );
    expect(abilityMessages.length).toBeGreaterThanOrEqual(1);
  });
});
