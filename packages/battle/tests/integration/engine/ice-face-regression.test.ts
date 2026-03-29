import type { BattleConfig, BattleEvent } from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { Gen8Ruleset } from "@pokemon-lib-ts/gen8";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "@pokemon-lib-ts/gen8/data";
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

  const team1 = [createBattlePokemon(GEN8_SPECIES_IDS.pikachu, "Pikachu", GEN8_ABILITY_IDS.static)];

  const team2 = [createBattlePokemon(GEN8_SPECIES_IDS.eiscue, "Eiscue", GEN8_ABILITY_IDS.iceFace)];

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

function createBattlePokemon(
  speciesId: number,
  nickname: string,
  abilityId: string,
): PokemonInstance {
  const dataManager = createGen8DataManager();
  const species = dataManager.getSpecies(speciesId);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(42), {
    nickname,
    nature: GEN8_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    moves: [GEN8_MOVE_IDS.tackle],
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    friendship: createFriendship(species.baseFriendship),
    gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });

  pokemon.uid = `${nickname.toLowerCase()}-${speciesId}`;
  pokemon.ability = abilityId;
  pokemon.currentHp = 1;
  pokemon.calculatedStats = {
    hp: 1,
    attack: 1,
    defense: 1,
    spAttack: 1,
    spDefense: 1,
    speed: 1,
  };
  return pokemon;
}

describe("Bug #890 - Gen 8 Ice Face pre-damage blocking", () => {
  it("given Eiscue with intact Ice Face, when hit by a physical move, then HP stays full and Ice Face breaks before damage is applied", () => {
    const { engine, events } = createBattle();
    engine.start();

    const defender = engine.state.sides[1].active[0];
    expect(defender).not.toBeNull();
    const startingHp = defender.pokemon.currentHp;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(defender.pokemon.currentHp).toBe(startingHp);
    expect(defender.volatileStatuses.has(CORE_VOLATILE_IDS.iceFaceBroken)).toBe(true);

    const damageEvents = events.filter((event) => event.type === "damage" && event.side === 1);
    expect(damageEvents).toHaveLength(1);
    expect(damageEvents[0]?.amount).toBe(0);

    const iceFaceMessages = events.filter(
      (event) =>
        event.type === "message" &&
        typeof event.text === "string" &&
        event.text === "Eiscue's Ice Face absorbed the damage!",
    );
    expect(iceFaceMessages).toHaveLength(1);
  });
});
