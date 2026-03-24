import type { BattleConfig, BattleEvent } from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { createGen8DataManager, Gen8Ruleset } from "@pokemon-lib-ts/gen8";
import { describe, expect, it } from "vitest";

/**
 * Regression tests for Bug #890:
 * Gen 8 Ice Face must block the first physical hit before HP is reduced.
 *
 * Source: Showdown data/abilities.ts -- iceface.onDamage returns 0 damage for the first hit.
 * Source: Bulbapedia "Ice Face" -- Eiscue takes no damage from the first physical move.
 */

function createBattle(): { engine: BattleEngine; events: BattleEvent[] } {
  const dataManager = createGen8DataManager();
  const ruleset = new Gen8Ruleset(dataManager);
  const events: BattleEvent[] = [];

  const team1 = [makePokemon(25, "Pikachu", "static")];

  const team2 = [makePokemon(875, "Eiscue", "ice-face")];

  const config: BattleConfig = {
    generation: 8,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));

  return { engine, events };
}

function makePokemon(speciesId: number, nickname: string, ability: string): PokemonInstance {
  return {
    uid: `${nickname.toLowerCase()}-${speciesId}`,
    speciesId,
    nickname,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 1,
    moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
    ability,
    abilitySlot: "normal1",
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male",
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: 1,
      attack: 1,
      defense: 1,
      spAttack: 1,
      spDefense: 1,
      speed: 1,
    },
  } as PokemonInstance;
}

describe("Bug #890 - Gen 8 Ice Face pre-damage blocking", () => {
  it("given Eiscue with intact Ice Face, when hit by a physical move, then HP stays full and Ice Face breaks before damage is applied", () => {
    const { engine, events } = createBattle();
    engine.start();

    const defender = engine.state.sides[1].active[0];
    expect(defender).toBeDefined();
    const startingHp = defender.pokemon.currentHp;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(defender.pokemon.currentHp).toBe(startingHp);
    expect(defender.volatileStatuses.has("ice-face-broken")).toBe(true);

    const damageEvents = events.filter((event) => event.type === "damage" && event.side === 1);
    expect(damageEvents).toHaveLength(1);
    expect(damageEvents[0]?.amount).toBe(0);

    const iceFaceMessages = events.filter(
      (event) =>
        event.type === "message" &&
        typeof event.text === "string" &&
        event.text.includes("Ice Face"),
    );
    expect(iceFaceMessages).toHaveLength(1);
  });
});
