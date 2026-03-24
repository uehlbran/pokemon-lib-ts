import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager, Gen3Ruleset } from "../../src";

/**
 * Deterministic Gen 3 battle-engine scenarios.
 *
 * These stay on the default integration path because they cover short,
 * reproducible engine interactions rather than broad completion sweeps.
 *
 * Source: pret/pokeemerald, Showdown Gen 3 mechanics
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
let uidCounter = 0;

function createGen3Pokemon(
  speciesId: number,
  level: number,
  moveIds: string[],
  nickname?: string,
  overrides?: Partial<PokemonInstance>,
): PokemonInstance {
  return {
    uid: `gen3-${speciesId}-${level}-${++uidCounter}`,
    speciesId,
    nickname: nickname ?? null,
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 300,
    moves: moveIds.map((id) => {
      const moveData = dataManager.getMove(id);
      return {
        moveId: id,
        currentPP: moveData.pp,
        maxPP: moveData.pp,
        ppUps: 0,
      };
    }),
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male" as const,
    isShiny: false,
    metLocation: "littleroot-town",
    metLevel: level,
    originalTrainer: "Brendan",
    originalTrainerId: 12345,
    pokeball: "poke-ball",
    ...overrides,
  };
}

function createBattle(
  team1: PokemonInstance[],
  team2: PokemonInstance[],
  seed: number,
): BattleEngine {
  const config: BattleConfig = {
    generation: 3,
    format: "singles",
    teams: [team1, team2],
    seed,
  };
  return new BattleEngine(config, ruleset, dataManager);
}

function createTeam1(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      257,
      50,
      ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
      "Blaziken",
    ),
    createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert"),
    createGen3Pokemon(282, 50, ["psychic", "thunderbolt", "calm-mind", "shadow-ball"], "Gardevoir"),
  ];
}

function createTeam2(): PokemonInstance[] {
  return [
    createGen3Pokemon(306, 50, ["iron-tail", "earthquake", "rock-slide", "double-edge"], "Aggron"),
    createGen3Pokemon(
      373,
      50,
      ["dragon-claw", "flamethrower", "earthquake", "dragon-dance"],
      "Salamence",
    ),
    createGen3Pokemon(376, 50, ["meteor-mash", "earthquake", "psychic", "explosion"], "Metagross"),
  ];
}

function createDrizzleTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(382, 50, ["surf", "thunder", "ice-beam", "calm-mind"], "Kyogre", {
      ability: "drizzle",
    }),
    createGen3Pokemon(121, 50, ["surf", "thunderbolt", "ice-beam", "psychic"], "Starmie", {
      ability: "natural-cure",
    }),
  ];
}

function createIntimidateTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      373,
      50,
      ["dragon-claw", "flamethrower", "earthquake", "dragon-dance"],
      "Salamence",
      { ability: "intimidate" },
    ),
    createGen3Pokemon(376, 50, ["meteor-mash", "earthquake", "psychic", "explosion"], "Metagross"),
  ];
}

function createSpeedBoostTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(291, 50, ["swords-dance", "slash", "protect", "baton-pass"], "Ninjask", {
      ability: "speed-boost",
    }),
    createGen3Pokemon(248, 50, ["rock-slide", "earthquake", "crunch", "dragon-dance"], "Tyranitar"),
  ];
}

describe("Gen 3 Battle Engine Integration", () => {
  it("given a Gen 3 battle, when it starts, then a battle-start event is emitted with generation 3", () => {
    const engine = createBattle(createTeam1(), createTeam2(), 42);

    engine.start();

    const events = engine.getEventLog();
    expect(events[0]?.type).toBe("battle-start");
    if (events[0]?.type === "battle-start") {
      expect(events[0].generation).toBe(3);
      expect(events[0].format).toBe("singles");
    }
  });

  it("given a Gen 3 battle, when it starts, then switch-in events are emitted for both sides", () => {
    const engine = createBattle(createTeam1(), createTeam2(), 42);

    engine.start();

    const switchInEvents = engine.getEventLog().filter((event) => event.type === "switch-in");
    expect(switchInEvents.length).toBe(2);
    expect(switchInEvents.map((event) => (event.type === "switch-in" ? event.side : -1))).toEqual(
      expect.arrayContaining([0, 1]),
    );
  });

  it("given a Gen 3 1v1 battle, when both sides attack, then damage events are emitted for both defenders", () => {
    // Source: pret/pokeemerald — both Surf and Flamethrower produce non-zero Gen 3 damage in this matchup.
    const engine = createBattle(
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
        ),
      ],
      [createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert")],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const damageEvents = engine.getEventLog().filter((event) => event.type === "damage");
    expect(damageEvents.length).toBe(2);
    expect(damageEvents.find((event) => event.type === "damage" && event.side === 0)?.maxHp).toBe(
      155,
    );
    expect(damageEvents.find((event) => event.type === "damage" && event.side === 1)?.maxHp).toBe(
      175,
    );
  });

  it("given a Gen 3 battle turn, when both battlers use moves, then move-start events are emitted for both sides", () => {
    const engine = createBattle(
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
        ),
      ],
      [createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert")],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const moveStartEvents = engine.getEventLog().filter((event) => event.type === "move-start");
    expect(moveStartEvents.length).toBe(2);
    expect(moveStartEvents.map((event) => (event.type === "move-start" ? event.side : -1))).toEqual(
      expect.arrayContaining([0, 1]),
    );
  });

  it("given Salamence with Intimidate lead, when battle starts, then the opposing active loses one Attack stage", () => {
    // Source: pret/pokeemerald — Intimidate lowers the foe's Attack by one stage on switch-in.
    const engine = createBattle(
      createIntimidateTeam(),
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();

    const intimidateEvent = engine
      .getEventLog()
      .find(
        (event) =>
          event.type === "stat-change" &&
          event.side === 1 &&
          event.stat === "attack" &&
          event.stages === -1,
      );

    expect(intimidateEvent).toBeDefined();
  });

  it("given Kyogre with Drizzle lead, when battle starts, then rain is set immediately", () => {
    // Source: pret/pokeemerald — Drizzle sets rain on switch-in.
    const engine = createBattle(
      createDrizzleTeam(),
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();

    const weatherEvents = engine.getEventLog().filter((event) => event.type === "weather-set");
    expect(weatherEvents).toHaveLength(1);
    expect(weatherEvents[0]?.type === "weather-set" ? weatherEvents[0].weather : null).toBe("rain");
    expect(engine.getState().weather?.type).toBe("rain");
  });

  it("given a Ninjask with Speed Boost, when the first turn ends, then Speed Boost does not trigger yet", () => {
    // Source: pret/pokeemerald src/battle_util.c:2642-2643 — Speed Boost skips the first turn on field.
    const engine = createBattle(
      createSpeedBoostTeam(),
      [
        createGen3Pokemon(143, 50, ["body-slam", "earthquake", "rest", "curse"], "Snorlax", {
          ability: "thick-fat",
        }),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const speedBoostEvents = engine
      .getEventLog()
      .filter(
        (event) => event.type === "stat-change" && event.side === 0 && event.stat === "speed",
      );

    expect(speedBoostEvents).toHaveLength(0);
  });

  it("given a Ninjask with Speed Boost, when the second turn ends while it is still alive, then Speed Boost triggers once", () => {
    // Source: pret/pokeemerald src/battle_util.c:2642-2643 — Speed Boost begins on turn two.
    const engine = createBattle(
      createSpeedBoostTeam(),
      [
        createGen3Pokemon(
          113,
          50,
          ["seismic-toss", "soft-boiled", "thunder-wave", "toxic"],
          "Chansey",
          { ability: "natural-cure" },
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const speedBoostEvents = engine
      .getEventLog()
      .filter(
        (event) =>
          event.type === "stat-change" &&
          event.side === 0 &&
          event.stat === "speed" &&
          event.stages === 1,
      );

    expect(speedBoostEvents).toHaveLength(1);
  });

  it("given rain from Drizzle, when Kyogre uses Surf into Blaziken, then the damage event reflects an OHKO", () => {
    // Source: pret/pokeemerald — rain boosts Water by 1.5x and Blaziken is weak to Water.
    const engine = createBattle(
      createDrizzleTeam(),
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const damageEvents = engine.getEventLog().filter((event) => event.type === "damage");
    expect(damageEvents).toHaveLength(1);
    if (damageEvents[0]?.type === "damage") {
      expect(damageEvents[0].side).toBe(1);
      expect(damageEvents[0].maxHp).toBe(155);
      expect(damageEvents[0].currentHp).toBe(0);
      expect(damageEvents[0].amount).toBeGreaterThanOrEqual(155);
    }
  });

  it("given Sand Stream and a non-immune foe, when the first turn ends, then sandstorm chip is applied at 1/16 max HP", () => {
    // Source: pret/pokeemerald src/battle_util.c — sandstorm chip is floor(maxHP / 16).
    const engine = createBattle(
      [
        createGen3Pokemon(
          248,
          50,
          ["rock-slide", "earthquake", "crunch", "dragon-dance"],
          "Tyranitar",
          {
            ability: "sand-stream",
          },
        ),
      ],
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "protect"],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 });

    const weatherDamageEvents = engine
      .getEventLog()
      .filter(
        (event) =>
          event.type === "damage" &&
          "source" in event &&
          (event as { source?: string }).source?.startsWith("weather-"),
      );

    expect(weatherDamageEvents).toHaveLength(1);
    if (weatherDamageEvents[0]?.type === "damage") {
      expect(weatherDamageEvents[0].side).toBe(1);
      expect(weatherDamageEvents[0].amount).toBe(9);
    }
  });

  it("given sandstorm and poison on the same turn, when end-of-turn damage resolves, then weather damage appears before poison damage", () => {
    // Source: pret/pokeemerald — weather damage resolves before poison/burn damage in end-of-turn order.
    const engine = createBattle(
      [
        createGen3Pokemon(248, 50, ["rock-slide", "earthquake", "crunch", "toxic"], "Tyranitar", {
          ability: "sand-stream",
        }),
      ],
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "protect"],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 3 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const events = engine.getEventLog();
    const weatherIndex = events.findIndex(
      (event) =>
        event.type === "damage" &&
        "source" in event &&
        (event as { source?: string }).source?.startsWith("weather-"),
    );
    const statusIndex = events.findIndex(
      (event) =>
        event.type === "damage" &&
        "source" in event &&
        ((event as { source?: string }).source === "poison" ||
          (event as { source?: string }).source === "badly-poisoned" ||
          (event as { source?: string }).source === "burn"),
    );

    expect(weatherIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThanOrEqual(0);
    expect(weatherIndex).toBeLessThan(statusIndex);
  });

  it("given Choice Band, when the holder uses its first move, then the next-turn move list is choice-locked", () => {
    // Source: pret/pokeemerald — Choice Band locks the holder into its first selected move.
    const engine = createBattle(
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
          { heldItem: "choice-band" },
        ),
      ],
      [createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert")],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 });

    const availableMoves = engine.getAvailableMoves(0);
    expect(availableMoves[0]?.disabled).toBe(false);
    expect(availableMoves[1]?.disabled).toBe(true);
    expect(availableMoves[1]?.disabledReason).toBe("Locked by Choice item");
    expect(availableMoves[2]?.disabled).toBe(true);
    expect(availableMoves[3]?.disabled).toBe(true);
  });

  it("given no Choice Band, when the holder uses a move, then the next-turn move list stays fully available", () => {
    const engine = createBattle(
      [
        createGen3Pokemon(
          257,
          50,
          ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
          "Blaziken",
        ),
      ],
      [createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert")],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 });

    expect(engine.getAvailableMoves(0).some((move) => move.disabled)).toBe(false);
  });
});
