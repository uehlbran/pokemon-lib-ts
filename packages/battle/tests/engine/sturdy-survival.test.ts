import type { MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { ActivePokemon, BattleConfig, BattleState, EndOfTurnEffect } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ---------------------------------------------------------------------------
// Bug #500: Sturdy Gen 5 survival engine timing
// ---------------------------------------------------------------------------

/**
 * Bug #500: Sturdy's survival effect (survive any lethal hit at full HP with
 * 1 HP remaining) could not be implemented via the "on-damage-taken" ability
 * hook because the engine applied damage before firing the hook. The fix adds
 * a pre-damage hook (capLethalDamage) that fires before HP subtraction.
 *
 * Source: Showdown data/abilities.ts -- sturdy: onDamage (priority -30)
 *   "If this Pokemon is at full HP, it survives attacks that would KO it with 1 HP."
 * Source: Bulbapedia -- Sturdy (Ability)
 */

/**
 * MockRuleset that implements capLethalDamage for testing the engine hook.
 * Simulates Sturdy: if defender has ability "sturdy" and is at full HP,
 * cap damage to maxHp - 1.
 */
class SturdyMockRuleset extends MockRuleset {
  capLethalDamage(
    damage: number,
    defender: ActivePokemon,
    _attacker: ActivePokemon,
    _move: MoveData,
    _state: BattleState,
  ): { damage: number; survived: boolean; messages: string[] } {
    // Simulate Sturdy: full HP -> survive at 1 HP
    // Source: Showdown data/abilities.ts -- sturdy onDamage
    const maxHp = defender.pokemon.calculatedStats?.hp ?? defender.pokemon.currentHp;
    if (
      defender.ability === "sturdy" &&
      defender.pokemon.currentHp === maxHp &&
      damage >= defender.pokemon.currentHp
    ) {
      const name = defender.pokemon.nickname ?? String(defender.pokemon.speciesId);
      return {
        damage: maxHp - 1,
        survived: true,
        messages: [`${name} held on thanks to Sturdy!`],
      };
    }
    return { damage, survived: false, messages: [] };
  }
}

function createSturdyEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  fixedDamage?: number;
}) {
  const ruleset = new SturdyMockRuleset();
  // Set damage high enough to KO from full HP (200 HP defender)
  ruleset.setFixedDamage(overrides?.fixedDamage ?? 250);
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
    generation: 5,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("Bug #500 — Sturdy survival via capLethalDamage", () => {
  it("given a Pokemon with Sturdy at full HP, when a lethal hit is received, then HP is set to 1", () => {
    // Arrange
    const { engine, events } = createSturdyEngine({ fixedDamage: 250 });
    engine.start();

    // Set defender's ability to "sturdy"
    const defender = engine.getActive(1);
    expect(defender).not.toBeNull();
    defender!.ability = "sturdy";

    // Act — Charizard (speed 120) attacks Blastoise (speed 80) first
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Blastoise should survive at 1 HP thanks to Sturdy
    // Source: Showdown data/abilities.ts -- sturdy onDamage: return target.hp - 1
    expect(defender!.pokemon.currentHp).toBe(1);

    // Verify the Sturdy message was emitted
    const sturdyMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("held on thanks to Sturdy"),
    );
    expect(sturdyMessages.length).toBe(1);
  });

  it("given a Pokemon with Sturdy not at full HP, when a lethal hit is received, then Pokemon faints", () => {
    // Arrange
    const { engine, events } = createSturdyEngine({ fixedDamage: 250 });
    engine.start();

    // Set defender's ability to "sturdy" but reduce HP below max
    const defender = engine.getActive(1);
    expect(defender).not.toBeNull();
    defender!.ability = "sturdy";
    defender!.pokemon.currentHp = 150; // Not at full HP (max is 200)

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Blastoise should faint (Sturdy only triggers at full HP)
    // Source: Showdown -- sturdy checks target.hp === target.maxhp
    expect(defender!.pokemon.currentHp).toBe(0);

    // No Sturdy message should appear
    const sturdyMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("held on thanks to Sturdy"),
    );
    expect(sturdyMessages.length).toBe(0);
  });

  it("given a Pokemon without Sturdy at full HP, when a lethal hit is received, then Pokemon faints", () => {
    // Arrange
    const { engine, events } = createSturdyEngine({ fixedDamage: 250 });
    engine.start();

    // Defender has a non-Sturdy ability
    const defender = engine.getActive(1);
    expect(defender).not.toBeNull();
    defender!.ability = "torrent"; // Not sturdy

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Blastoise should faint (no Sturdy)
    // Source: Without Sturdy, capLethalDamage returns damage unchanged
    expect(defender!.pokemon.currentHp).toBe(0);

    // No Sturdy message
    const sturdyMessages = events.filter(
      (e) =>
        e.type === "message" &&
        typeof e.text === "string" &&
        e.text.includes("held on thanks to Sturdy"),
    );
    expect(sturdyMessages.length).toBe(0);
  });
});
