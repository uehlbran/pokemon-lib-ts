import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_STAT_IDS, CORE_STATUS_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";
import { createGen3TestPokemon } from "../helpers/createGen3TestPokemon";

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

function createGen3Pokemon(
  speciesId: number,
  level: number,
  moveIds: string[],
  nickname?: string,
  overrides?: Partial<PokemonInstance>,
): PokemonInstance {
  const pokemon = createGen3TestPokemon({
    speciesId,
    level,
    moveIds,
    nickname,
    ability: overrides?.ability,
    abilitySlot: overrides?.abilitySlot,
    currentHp: overrides?.currentHp ?? 300,
    friendship: overrides?.friendship ?? 70,
    gender: overrides?.gender,
    heldItem: overrides?.heldItem,
    metLocation: overrides?.metLocation ?? "littleroot-town",
    originalTrainer: overrides?.originalTrainer ?? "Brendan",
    originalTrainerId: overrides?.originalTrainerId ?? 12345,
    pokeball: overrides?.pokeball ?? GEN3_ITEM_IDS.pokeBall,
    status: overrides?.status,
  });

  if (overrides?.metLevel !== undefined) {
    pokemon.metLevel = overrides.metLevel;
  }

  return pokemon;
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
      GEN3_SPECIES_IDS.blaziken,
      50,
      [
        GEN3_MOVE_IDS.flamethrower,
        GEN3_MOVE_IDS.skyUppercut,
        GEN3_MOVE_IDS.rockSlide,
        GEN3_MOVE_IDS.swordsDance,
      ],
      "Blaziken",
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.swampert,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.earthquake, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.protect],
      "Swampert",
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.gardevoir,
      50,
      [
        GEN3_MOVE_IDS.psychic,
        GEN3_MOVE_IDS.thunderbolt,
        GEN3_MOVE_IDS.calmMind,
        GEN3_MOVE_IDS.shadowBall,
      ],
      "Gardevoir",
    ),
  ];
}

function createTeam2(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      GEN3_SPECIES_IDS.aggron,
      50,
      [
        GEN3_MOVE_IDS.ironTail,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.rockSlide,
        GEN3_MOVE_IDS.doubleEdge,
      ],
      "Aggron",
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.salamence,
      50,
      [
        GEN3_MOVE_IDS.dragonClaw,
        GEN3_MOVE_IDS.flamethrower,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.dragonDance,
      ],
      "Salamence",
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.metagross,
      50,
      [
        GEN3_MOVE_IDS.meteorMash,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.psychic,
        GEN3_MOVE_IDS.explosion,
      ],
      "Metagross",
    ),
  ];
}

function createDrizzleTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      GEN3_SPECIES_IDS.kyogre,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.thunder, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.calmMind],
      "Kyogre",
      {
        ability: GEN3_ABILITY_IDS.drizzle,
      },
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.starmie,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.thunderbolt, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.psychic],
      "Starmie",
      {
        ability: GEN3_ABILITY_IDS.naturalCure,
      },
    ),
  ];
}

function createIntimidateTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      GEN3_SPECIES_IDS.salamence,
      50,
      [
        GEN3_MOVE_IDS.dragonClaw,
        GEN3_MOVE_IDS.flamethrower,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.dragonDance,
      ],
      "Salamence",
      { ability: GEN3_ABILITY_IDS.intimidate },
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.metagross,
      50,
      [
        GEN3_MOVE_IDS.meteorMash,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.psychic,
        GEN3_MOVE_IDS.explosion,
      ],
      "Metagross",
    ),
  ];
}

function createSpeedBoostTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      GEN3_SPECIES_IDS.ninjask,
      50,
      [
        GEN3_MOVE_IDS.swordsDance,
        GEN3_MOVE_IDS.slash,
        GEN3_MOVE_IDS.protect,
        GEN3_MOVE_IDS.batonPass,
      ],
      "Ninjask",
      {
        ability: GEN3_ABILITY_IDS.speedBoost,
      },
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.tyranitar,
      50,
      [
        GEN3_MOVE_IDS.rockSlide,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.crunch,
        GEN3_MOVE_IDS.dragonDance,
      ],
      "Tyranitar",
    ),
  ];
}

describe("Gen 3 Battle Engine Integration", () => {
  it("given a Gen 3 battle, when it starts, then a battle-start event is emitted with generation 3", () => {
    const engine = createBattle(createTeam1(), createTeam2(), 42);

    engine.start();

    const events = engine.getEventLog();
    expect(events[0]?.type).toBe("battle-start");
    if (events[0]?.type === "battle-start") {
      // Source: createBattle() hard-codes generation 3 for this Gen 3 suite.
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
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
          "Blaziken",
        ),
      ],
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.swampert,
          50,
          [
            GEN3_MOVE_IDS.surf,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.iceBeam,
            GEN3_MOVE_IDS.protect,
          ],
          "Swampert",
        ),
      ],
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
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
          "Blaziken",
        ),
      ],
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.swampert,
          50,
          [
            GEN3_MOVE_IDS.surf,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.iceBeam,
            GEN3_MOVE_IDS.protect,
          ],
          "Swampert",
        ),
      ],
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
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
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
          event.stat === CORE_STAT_IDS.attack &&
          event.stages === -1,
      );

    expect(intimidateEvent).toMatchObject({
      type: "stat-change",
      side: 1,
      stat: CORE_STAT_IDS.attack,
      stages: -1,
    });
  });

  it("given Kyogre with Drizzle lead, when battle starts, then rain is set immediately", () => {
    // Source: pret/pokeemerald — Drizzle sets rain on switch-in.
    const engine = createBattle(
      createDrizzleTeam(),
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();

    const weatherEvents = engine.getEventLog().filter((event) => event.type === "weather-set");
    expect(weatherEvents).toHaveLength(1);
    expect(weatherEvents[0]?.type === "weather-set" ? weatherEvents[0].weather : null).toBe(
      CORE_WEATHER_IDS.rain,
    );
    expect(engine.getState().weather?.type).toBe(CORE_WEATHER_IDS.rain);
  });

  it("given a Ninjask with Speed Boost, when the first turn ends, then Speed Boost does not trigger yet", () => {
    // Source: pret/pokeemerald src/battle_util.c:2642-2643 — Speed Boost skips the first turn on field.
    const engine = createBattle(
      createSpeedBoostTeam(),
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.snorlax,
          50,
          [
            GEN3_MOVE_IDS.bodySlam,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.rest,
            GEN3_MOVE_IDS.curse,
          ],
          "Snorlax",
          {
            ability: GEN3_ABILITY_IDS.thickFat,
          },
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const speedBoostEvents = engine
      .getEventLog()
      .filter(
        (event) =>
          event.type === "stat-change" && event.side === 0 && event.stat === CORE_STAT_IDS.speed,
      );

    expect(speedBoostEvents).toHaveLength(0);
  });

  it("given a Ninjask with Speed Boost, when the second turn ends while it is still alive, then Speed Boost triggers once", () => {
    // Source: pret/pokeemerald src/battle_util.c:2642-2643 — Speed Boost begins on turn two.
    const engine = createBattle(
      createSpeedBoostTeam(),
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.chansey,
          50,
          [
            GEN3_MOVE_IDS.seismicToss,
            GEN3_MOVE_IDS.softBoiled,
            GEN3_MOVE_IDS.thunderWave,
            GEN3_MOVE_IDS.toxic,
          ],
          "Chansey",
          { ability: GEN3_ABILITY_IDS.naturalCure },
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
          event.stat === CORE_STAT_IDS.speed &&
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
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
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
          GEN3_SPECIES_IDS.tyranitar,
          50,
          [
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.crunch,
            GEN3_MOVE_IDS.dragonDance,
          ],
          "Tyranitar",
          {
            ability: GEN3_ABILITY_IDS.sandStream,
          },
        ),
      ],
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.protect,
          ],
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
        createGen3Pokemon(
          GEN3_SPECIES_IDS.tyranitar,
          50,
          [
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.crunch,
            GEN3_MOVE_IDS.toxic,
          ],
          "Tyranitar",
          {
            ability: GEN3_ABILITY_IDS.sandStream,
          },
        ),
      ],
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.protect,
          ],
          "Blaziken",
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 3 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const damageSources = engine
      .getEventLog()
      .filter(
        (event): event is Extract<typeof event, { type: "damage" }> =>
          event.type === "damage" &&
          "source" in event &&
          ((event as { source?: string }).source?.startsWith("weather-") ||
            (event as { source?: string }).source === CORE_STATUS_IDS.poison ||
            (event as { source?: string }).source === CORE_STATUS_IDS.badlyPoisoned ||
            (event as { source?: string }).source === CORE_STATUS_IDS.burn),
      )
      .map((event) => (event as { source?: string }).source)
      .filter((source): source is string => Boolean(source));

    expect(damageSources[0]).toMatch(/^weather-/);
    expect([CORE_STATUS_IDS.poison, CORE_STATUS_IDS.badlyPoisoned, CORE_STATUS_IDS.burn]).toContain(
      damageSources[1],
    );
  });

  it("given Choice Band, when the holder uses its first move, then the next-turn move list is choice-locked", () => {
    // Source: pret/pokeemerald — Choice Band locks the holder into its first selected move.
    const engine = createBattle(
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
          "Blaziken",
          { heldItem: GEN3_ITEM_IDS.choiceBand },
        ),
      ],
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.swampert,
          50,
          [
            GEN3_MOVE_IDS.surf,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.iceBeam,
            GEN3_MOVE_IDS.protect,
          ],
          "Swampert",
        ),
      ],
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
          GEN3_SPECIES_IDS.blaziken,
          50,
          [
            GEN3_MOVE_IDS.flamethrower,
            GEN3_MOVE_IDS.skyUppercut,
            GEN3_MOVE_IDS.rockSlide,
            GEN3_MOVE_IDS.swordsDance,
          ],
          "Blaziken",
        ),
      ],
      [
        createGen3Pokemon(
          GEN3_SPECIES_IDS.swampert,
          50,
          [
            GEN3_MOVE_IDS.surf,
            GEN3_MOVE_IDS.earthquake,
            GEN3_MOVE_IDS.iceBeam,
            GEN3_MOVE_IDS.protect,
          ],
          "Swampert",
        ),
      ],
      42,
    );

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 });

    expect(engine.getAvailableMoves(0).some((move) => move.disabled)).toBe(false);
  });
});
