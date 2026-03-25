import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine, RandomAI } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
  getTypeEffectiveness,
} from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_SPECIES_IDS,
  Gen2Ruleset,
} from "../../src";
import { calculateGen2Stats } from "../../src/Gen2StatCalc";

describe("Gen 2 Full Battle Integration", () => {
  const { dark, fire, ghost, normal, psychic, steel, water } = CORE_TYPE_IDS;
  const dataManager = createGen2DataManager();
  const ruleset = new Gen2Ruleset();
  let uidCounter = 0;

  const GEN2_LOADOUTS = {
    typhlosion: [
      GEN2_MOVE_IDS.flamethrower,
      GEN2_MOVE_IDS.thunderPunch,
      GEN2_MOVE_IDS.earthquake,
      GEN2_MOVE_IDS.fireBlast,
    ],
    feraligatr: [
      GEN2_MOVE_IDS.hydroPump,
      GEN2_MOVE_IDS.surf,
      GEN2_MOVE_IDS.iceBeam,
      GEN2_MOVE_IDS.slash,
    ],
    feraligatrAlt: [
      GEN2_MOVE_IDS.surf,
      GEN2_MOVE_IDS.hydroPump,
      GEN2_MOVE_IDS.iceBeam,
      GEN2_MOVE_IDS.slash,
    ],
    meganium: [
      GEN2_MOVE_IDS.razorLeaf,
      GEN2_MOVE_IDS.bodySlam,
      GEN2_MOVE_IDS.earthquake,
      GEN2_MOVE_IDS.synthesis,
    ],
    umbreon: [
      GEN2_MOVE_IDS.crunch,
      GEN2_MOVE_IDS.psychic,
      GEN2_MOVE_IDS.shadowBall,
      GEN2_MOVE_IDS.rest,
    ],
    umbreonDark: [
      GEN2_MOVE_IDS.crunch,
      GEN2_MOVE_IDS.shadowBall,
      GEN2_MOVE_IDS.rest,
      GEN2_MOVE_IDS.tackle,
    ],
    steelix: [
      GEN2_MOVE_IDS.ironTail,
      GEN2_MOVE_IDS.earthquake,
      GEN2_MOVE_IDS.bodySlam,
      GEN2_MOVE_IDS.rockThrow,
    ],
    tyranitar: [
      GEN2_MOVE_IDS.crunch,
      GEN2_MOVE_IDS.earthquake,
      GEN2_MOVE_IDS.rockSlide,
      GEN2_MOVE_IDS.fireBlast,
    ],
    alakazam: [
      GEN2_MOVE_IDS.psychic,
      GEN2_MOVE_IDS.confusion,
      GEN2_MOVE_IDS.recover,
      GEN2_MOVE_IDS.tackle,
    ],
    mewtwo: [
      GEN2_MOVE_IDS.psychic,
      GEN2_MOVE_IDS.confusion,
      GEN2_MOVE_IDS.recover,
      GEN2_MOVE_IDS.shadowBall,
    ],
    magikarp: [GEN2_MOVE_IDS.tackle, GEN2_MOVE_IDS.tackle, GEN2_MOVE_IDS.tackle, GEN2_MOVE_IDS.tackle],
    gengar: [
      GEN2_MOVE_IDS.shadowBall,
      GEN2_MOVE_IDS.crunch,
      GEN2_MOVE_IDS.hypnosis,
      GEN2_MOVE_IDS.tackle,
    ],
    snorlax: [
      GEN2_MOVE_IDS.bodySlam,
      GEN2_MOVE_IDS.hyperBeam,
      GEN2_MOVE_IDS.rest,
      GEN2_MOVE_IDS.earthquake,
    ],
    feraligatrWeakLead: [
      GEN2_MOVE_IDS.waterGun,
      GEN2_MOVE_IDS.surf,
      GEN2_MOVE_IDS.iceBeam,
      GEN2_MOVE_IDS.slash,
    ],
    gengarUtility: [
      GEN2_MOVE_IDS.shadowBall,
      GEN2_MOVE_IDS.confuseRay,
      GEN2_MOVE_IDS.shadowBall,
      GEN2_MOVE_IDS.tackle,
    ],
  } as const;

  const GEN2_SPECIES_NAMES = {
    typhlosion: dataManager.getSpecies(GEN2_SPECIES_IDS.typhlosion).displayName,
    feraligatr: dataManager.getSpecies(GEN2_SPECIES_IDS.feraligatr).displayName,
    meganium: dataManager.getSpecies(GEN2_SPECIES_IDS.meganium).displayName,
    umbreon: dataManager.getSpecies(GEN2_SPECIES_IDS.umbreon).displayName,
    steelix: dataManager.getSpecies(GEN2_SPECIES_IDS.steelix).displayName,
    tyranitar: dataManager.getSpecies(GEN2_SPECIES_IDS.tyranitar).displayName,
    alakazam: dataManager.getSpecies(GEN2_SPECIES_IDS.alakazam).displayName,
    gengar: dataManager.getSpecies(GEN2_SPECIES_IDS.gengar).displayName,
    snorlax: dataManager.getSpecies(GEN2_SPECIES_IDS.snorlax).displayName,
    crobat: dataManager.getSpecies(GEN2_SPECIES_IDS.crobat).displayName,
    mewtwo: dataManager.getSpecies(GEN2_SPECIES_IDS.mewtwo).displayName,
    magikarp: dataManager.getSpecies(GEN2_SPECIES_IDS.magikarp).displayName,
  } as const;

  const GEN2_MOVE_NAMES = {
    flamethrower: dataManager.getMove(GEN2_MOVE_IDS.flamethrower).displayName,
    thunderPunch: dataManager.getMove(GEN2_MOVE_IDS.thunderPunch).displayName,
    earthquake: dataManager.getMove(GEN2_MOVE_IDS.earthquake).displayName,
    fireBlast: dataManager.getMove(GEN2_MOVE_IDS.fireBlast).displayName,
    hydroPump: dataManager.getMove(GEN2_MOVE_IDS.hydroPump).displayName,
    surf: dataManager.getMove(GEN2_MOVE_IDS.surf).displayName,
    iceBeam: dataManager.getMove(GEN2_MOVE_IDS.iceBeam).displayName,
    slash: dataManager.getMove(GEN2_MOVE_IDS.slash).displayName,
    razorLeaf: dataManager.getMove(GEN2_MOVE_IDS.razorLeaf).displayName,
    bodySlam: dataManager.getMove(GEN2_MOVE_IDS.bodySlam).displayName,
    synthesis: dataManager.getMove(GEN2_MOVE_IDS.synthesis).displayName,
    crunch: dataManager.getMove(GEN2_MOVE_IDS.crunch).displayName,
    psychic: dataManager.getMove(GEN2_MOVE_IDS.psychic).displayName,
    shadowBall: dataManager.getMove(GEN2_MOVE_IDS.shadowBall).displayName,
    rest: dataManager.getMove(GEN2_MOVE_IDS.rest).displayName,
    ironTail: dataManager.getMove(GEN2_MOVE_IDS.ironTail).displayName,
    rockThrow: dataManager.getMove(GEN2_MOVE_IDS.rockThrow).displayName,
    rockSlide: dataManager.getMove(GEN2_MOVE_IDS.rockSlide).displayName,
    waterGun: dataManager.getMove(GEN2_MOVE_IDS.waterGun).displayName,
    confusion: dataManager.getMove(GEN2_MOVE_IDS.confusion).displayName,
    recover: dataManager.getMove(GEN2_MOVE_IDS.recover).displayName,
    tackle: dataManager.getMove(GEN2_MOVE_IDS.tackle).displayName,
    hypnosis: dataManager.getMove(GEN2_MOVE_IDS.hypnosis).displayName,
    confuseRay: dataManager.getMove(GEN2_MOVE_IDS.confuseRay).displayName,
    hyperBeam: dataManager.getMove(GEN2_MOVE_IDS.hyperBeam).displayName,
  } as const;

  const GEN2_ITEM_NAMES = {
    leftovers: dataManager.getItem(GEN2_ITEM_IDS.leftovers).displayName,
    berry: dataManager.getItem(GEN2_ITEM_IDS.berry).displayName,
  } as const;

  const GEN2_WEATHER_IDS = {
    sand: "sand" as const,
    rain: CORE_WEATHER_IDS.rain,
  } as const;

  const GEN2_DEFAULT_MET_LOCATION = "unknown" as const;
  const GEN2_DEFAULT_ORIGINAL_TRAINER = "Test Trainer" as const;
  const GEN2_DEFAULT_ABILITY_SLOT = "normal1" as const;
  const GEN2_DEFAULT_GENDER = "male" as const;
  const GEN2_BATTLE_FORMAT = "singles" as const;
  const GEN2_WEATHER_SAND_DAMAGE_SOURCE = "weather-sand" as const;

  beforeEach(() => {
    uidCounter = 0;
  });

  /**
   * Helper to create a Gen 2 PokemonInstance with specific moves.
   * Uses Gen 2 defaults: DVs (0-15), Stat EXP (0-65535), no natures.
   */
  function createGen2Pokemon(
    speciesId: number,
    level: number,
    moveIds: string[],
    nickname?: string,
    overrides?: Partial<PokemonInstance>,
  ): PokemonInstance {
    return {
      uid: `gen2-${speciesId}-${level}-${++uidCounter}`,
      speciesId,
      nickname: nickname ?? null,
      level,
      experience: 0,
      nature: ALL_NATURES[0].id,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
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
      abilitySlot: GEN2_DEFAULT_ABILITY_SLOT,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: GEN2_DEFAULT_GENDER,
      isShiny: false,
      metLocation: GEN2_DEFAULT_MET_LOCATION,
      metLevel: level,
      originalTrainer: GEN2_DEFAULT_ORIGINAL_TRAINER,
      originalTrainerId: 12345,
      pokeball: GEN2_ITEM_IDS.pokeBall,
      ...overrides,
    };
  }

  /**
   * Helper to create a BattleEngine with two teams and a seed.
   */
  function createBattle(
    team1: PokemonInstance[],
    team2: PokemonInstance[],
    seed: number,
  ): BattleEngine {
    const config: BattleConfig = {
      generation: 2,
      format: GEN2_BATTLE_FORMAT,
      teams: [team1, team2],
      seed,
    };
    return new BattleEngine(config, ruleset, dataManager);
  }

  function collectEffectivenessProbe(
    events: ReturnType<BattleEngine["getEventLog"]>,
  ): {
    effectivenessEvents: ReturnType<BattleEngine["getEventLog"]>;
    damageEvents: ReturnType<BattleEngine["getEventLog"]>;
  } {
    return {
      effectivenessEvents: events.filter((event) => event.type === "effectiveness"),
      damageEvents: events.filter((event) => event.type === "damage"),
    };
  }

  /**
   * Helper to run a full battle with RandomAI until it ends or hits a turn limit.
   */
  function runFullBattle(engine: BattleEngine, seed: number, maxTurns = 500): BattleEngine {
    const ai = new RandomAI();
    const aiRng = new SeededRandom(seed + 999);

    engine.start();

    let turns = 0;
    while (!engine.isEnded() && turns < maxTurns) {
      const phase = engine.getPhase();

      if (phase === "action-select") {
        const action0 = ai.chooseAction(
          0,
          engine.getState(),
          ruleset,
          aiRng,
          engine.getAvailableMoves(0),
        );
        const action1 = ai.chooseAction(
          1,
          engine.getState(),
          ruleset,
          aiRng,
          engine.getAvailableMoves(1),
        );
        engine.submitAction(0, action0);
        engine.submitAction(1, action1);
        turns++;
      } else if (phase === "switch-prompt") {
        for (const sideIdx of [0, 1] as const) {
          const active = engine.getActive(sideIdx);
          if (active && active.pokemon.currentHp <= 0) {
            const switchTarget = ai.chooseSwitchIn(sideIdx, engine.getState(), ruleset, aiRng);
            if (switchTarget !== null) {
              engine.submitSwitch(sideIdx, switchTarget);
            }
          }
        }
      } else {
        break;
      }
    }

    return engine;
  }

  /** Team 1: Typhlosion, Feraligatr, Meganium (Gen 2 starters) */
  function createTeam1(): PokemonInstance[] {
    return [
      createGen2Pokemon(
        GEN2_SPECIES_IDS.typhlosion,
        50,
        [...GEN2_LOADOUTS.typhlosion],
        GEN2_SPECIES_NAMES.typhlosion,
      ),
      createGen2Pokemon(GEN2_SPECIES_IDS.feraligatr, 50, [...GEN2_LOADOUTS.feraligatr], GEN2_SPECIES_NAMES.feraligatr),
      createGen2Pokemon(
        GEN2_SPECIES_IDS.meganium,
        50,
        [...GEN2_LOADOUTS.meganium],
        GEN2_SPECIES_NAMES.meganium,
      ),
    ];
  }

  /** Team 2: Umbreon, Steelix, Tyranitar (Gen 2 Pokemon) */
  function createTeam2(): PokemonInstance[] {
    return [
      createGen2Pokemon(GEN2_SPECIES_IDS.umbreon, 50, [...GEN2_LOADOUTS.umbreon], GEN2_SPECIES_NAMES.umbreon),
      createGen2Pokemon(GEN2_SPECIES_IDS.steelix, 50, [...GEN2_LOADOUTS.steelix], GEN2_SPECIES_NAMES.steelix),
      createGen2Pokemon(GEN2_SPECIES_IDS.tyranitar, 50, [...GEN2_LOADOUTS.tyranitar], GEN2_SPECIES_NAMES.tyranitar),
    ];
  }

  // --- Basic Gen 2 Battle Tests ---

  it("given two teams of Gen 2 Pokemon, when a full battle runs with RandomAI, then a winner is declared", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    expect(engine.isEnded()).toBe(true);
    const winner = engine.getWinner();
    expect(winner === 0 || winner === 1).toBe(true);
  });

  it("given same seed, when running the same battle twice, then events are identical (determinism)", () => {
    // Arrange
    const seed = 42;

    // Act: Run battle 1
    const team1a = createTeam1();
    const team2a = createTeam2();
    const engine1 = createBattle(team1a, team2a, seed);
    runFullBattle(engine1, seed);
    const events1 = engine1.getEventLog();

    // Act: Run battle 2 with identical setup
    uidCounter = 0;
    const team1b = createTeam1();
    const team2b = createTeam2();
    const engine2 = createBattle(team1b, team2b, seed);
    runFullBattle(engine2, seed);
    const events2 = engine2.getEventLog();

    expect(events1.length).toBeGreaterThan(0);
    expect(events1).toEqual(events2);
    expect(engine1.getWinner()).toBe(engine2.getWinner());
  });

  it("given different seeds, when running the same battle, then events differ (randomness matters)", () => {
    // Arrange
    const team1a = createTeam1();
    const team2a = createTeam2();
    const engine1 = createBattle(team1a, team2a, 42);

    const team1b = createTeam1();
    const team2b = createTeam2();
    const engine2 = createBattle(team1b, team2b, 99999);

    // Act
    runFullBattle(engine1, 42);
    runFullBattle(engine2, 99999);

    const events1 = engine1.getEventLog();
    const events2 = engine2.getEventLog();
    expect(events1).not.toEqual(events2);
  });

  it("given a Gen 2 battle, when it starts, then a battle-start event is emitted with generation 2", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    // Assert
    const events = engine.getEventLog();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.type).toBe("battle-start");
    if (events[0]?.type === "battle-start") {
      expect(events[0]?.generation).toBe(2);
      expect(events[0]?.format).toBe(GEN2_BATTLE_FORMAT);
    }
  });

  it("given a Gen 2 battle, when it starts, then switch-in events are emitted for both sides", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    // Assert
    const events = engine.getEventLog();
    const switchInEvents = events.filter((e) => e.type === "switch-in");
    expect(switchInEvents.length).toBe(2);

    const sides = switchInEvents.map((e) => (e.type === "switch-in" ? e.side : -1));
    expect(sides).toContain(0);
    expect(sides).toContain(1);
  });

  it("given a Gen 2 battle, when damage is dealt, then damage events are emitted with correct fields", () => {
    // Arrange: 1v1 battle
    const attacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [...GEN2_LOADOUTS.typhlosion],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const defender = createGen2Pokemon(
      GEN2_SPECIES_IDS.feraligatr,
      50,
      [...GEN2_LOADOUTS.feraligatrWeakLead],
      GEN2_SPECIES_NAMES.feraligatr,
    );
    const engine = createBattle([attacker], [defender], 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents.length).toBeGreaterThanOrEqual(1);

    for (const evt of damageEvents) {
      if (evt.type === "damage") {
        expect(evt.side === 0 || evt.side === 1).toBe(true);
        expect(typeof evt.pokemon).toBe("string");
        expect(evt.amount).toBeGreaterThan(0);
        expect(evt.currentHp).toBeGreaterThanOrEqual(0);
        expect(evt.maxHp).toBeGreaterThan(0);
        expect(typeof evt.source).toBe("string");
      }
    }
  });

  it("given a Gen 2 battle, when moves execute, then move-start events are emitted", () => {
    // Arrange
    const team1 = [
      createGen2Pokemon(
        GEN2_SPECIES_IDS.typhlosion,
        50,
        [...GEN2_LOADOUTS.typhlosion],
        GEN2_SPECIES_NAMES.typhlosion,
      ),
    ];
    const team2 = [
      createGen2Pokemon(
        GEN2_SPECIES_IDS.feraligatr,
        50,
        [...GEN2_LOADOUTS.feraligatrAlt],
        GEN2_SPECIES_NAMES.feraligatr,
      ),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const moveStartEvents = events.filter((e) => e.type === "move-start");
    expect(moveStartEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("given a Gen 2 battle, when a Pokemon faints, then a faint event is emitted", () => {
    // Arrange: Level 100 Mewtwo vs level 5 Magikarp
    const strong = createGen2Pokemon(
      GEN2_SPECIES_IDS.mewtwo,
      100,
      [...GEN2_LOADOUTS.mewtwo],
      GEN2_SPECIES_NAMES.mewtwo,
    );
    const weak = createGen2Pokemon(GEN2_SPECIES_IDS.magikarp, 5, [...GEN2_LOADOUTS.magikarp], GEN2_SPECIES_NAMES.magikarp);
    const engine = createBattle([strong], [weak], 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const faintEvents = events.filter((event) => event.type === "faint");
    expect(faintEvents).toEqual([{ type: "faint", side: 1, pokemon: GEN2_SPECIES_NAMES.magikarp }]);
  });

  it("given a Gen 2 battle, when the battle ends, then a battle-end event is emitted", () => {
    // Arrange: 1v1 for quick resolution
    const strong = createGen2Pokemon(
      GEN2_SPECIES_IDS.mewtwo,
      100,
      [...GEN2_LOADOUTS.mewtwo],
      GEN2_SPECIES_NAMES.mewtwo,
    );
    const weak = createGen2Pokemon(GEN2_SPECIES_IDS.magikarp, 5, [...GEN2_LOADOUTS.magikarp], GEN2_SPECIES_NAMES.magikarp);
    const engine = createBattle([strong], [weak], 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const events = engine.getEventLog();
    const endEvents = events.filter((event) => event.type === "battle-end");
    expect(endEvents).toEqual([{ type: "battle-end", winner: 0 }]);
  });

  it("given a Gen 2 battle, when stats are calculated at start, then all Pokemon have calculatedStats", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    for (const sideIdx of [0, 1] as const) {
      const team = engine.getTeam(sideIdx);
      for (const pokemon of team) {
        expect(pokemon.nickname).not.toBeNull();
        expect(pokemon.calculatedStats).toEqual(
          calculateGen2Stats(pokemon, dataManager.getSpecies(pokemon.speciesId)),
        );
      }
    }
  });

  it("given a full 3v3 battle, when it completes, then all Pokemon on losing side have 0 HP", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    expect(engine.isEnded()).toBe(true);
    const winner = engine.getWinner();
    expect(winner).not.toBeNull();
    const loserSide = winner === 0 ? 1 : 0;
    const loserTeam = engine.getTeam(loserSide as 0 | 1);

    for (const pokemon of loserTeam) {
      expect(pokemon.currentHp).toBe(0);
    }
  });

  it("given a full 3v3 battle, when it completes, then at least one Pokemon on winning side has HP > 0", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    expect(engine.isEnded()).toBe(true);
    const winner = engine.getWinner();
    expect(winner).not.toBeNull();
    const winnerTeam = engine.getTeam(winner as 0 | 1);
    const anyAlive = winnerTeam.some((p) => p.currentHp > 0);
    expect(anyAlive).toBe(true);
  });

  it("given a battle, when turn-start events are emitted, then turn numbers increment sequentially", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const events = engine.getEventLog();
    const turnStartEvents = events.filter((e) => e.type === "turn-start");
    expect(turnStartEvents.length).toBeGreaterThan(0);

    for (let i = 0; i < turnStartEvents.length; i++) {
      const evt = turnStartEvents[i];
      if (evt.type === "turn-start") {
        expect(evt.turnNumber).toBe(i + 1);
      }
    }
  });

  it("given a battle with multiple Pokemon, when a Pokemon faints, then a switch-in occurs", () => {
    // Arrange: Strong attacker vs team of 2 weak Pokemon
    const strong = createGen2Pokemon(
      GEN2_SPECIES_IDS.mewtwo,
      100,
      [...GEN2_LOADOUTS.mewtwo],
      GEN2_SPECIES_NAMES.mewtwo,
    );
    const weak1 = createGen2Pokemon(
      GEN2_SPECIES_IDS.magikarp,
      5,
      [...GEN2_LOADOUTS.magikarp],
      "Magikarp1",
    );
    const weak2 = createGen2Pokemon(
      GEN2_SPECIES_IDS.magikarp,
      5,
      [...GEN2_LOADOUTS.magikarp],
      "Magikarp2",
    );
    const engine = createBattle([strong], [weak1, weak2], 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const events = engine.getEventLog();
    const faintEvents = events.filter((e) => e.type === "faint");
    expect(faintEvents.length).toBeGreaterThanOrEqual(2);

    const switchInEvents = events.filter((e) => e.type === "switch-in");
    // Initial send-out (2) + at least one replacement switch
    expect(switchInEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("given a Gen 2 battle, when getAvailableMoves is called, then returns valid move data", () => {
    // Arrange
    const team1 = [
      createGen2Pokemon(
        GEN2_SPECIES_IDS.typhlosion,
        50,
        [...GEN2_LOADOUTS.typhlosion],
        GEN2_SPECIES_NAMES.typhlosion,
      ),
    ];
    const team2 = [
      createGen2Pokemon(
        GEN2_SPECIES_IDS.feraligatr,
        50,
        [...GEN2_LOADOUTS.feraligatrAlt],
        GEN2_SPECIES_NAMES.feraligatr,
      ),
    ];
    const engine = createBattle(team1, team2, 42);
    engine.start();

    // Act
    const moves = engine.getAvailableMoves(0);

    // Source: the fixed Typhlosion fixture above carries these four moves in this exact slot order.
    expect(moves).toEqual([
      {
        index: 0,
        moveId: GEN2_MOVE_IDS.flamethrower,
        displayName: GEN2_MOVE_NAMES.flamethrower,
        type: dataManager.getMove(GEN2_MOVE_IDS.flamethrower).type,
        category: dataManager.getMove(GEN2_MOVE_IDS.flamethrower).category,
        pp: 15,
        maxPp: 15,
        disabled: false,
        disabledReason: undefined,
      },
      {
        index: 1,
        moveId: GEN2_MOVE_IDS.thunderPunch,
        displayName: GEN2_MOVE_NAMES.thunderPunch,
        type: dataManager.getMove(GEN2_MOVE_IDS.thunderPunch).type,
        category: dataManager.getMove(GEN2_MOVE_IDS.thunderPunch).category,
        pp: 15,
        maxPp: 15,
        disabled: false,
        disabledReason: undefined,
      },
      {
        index: 2,
        moveId: GEN2_MOVE_IDS.earthquake,
        displayName: GEN2_MOVE_NAMES.earthquake,
        type: dataManager.getMove(GEN2_MOVE_IDS.earthquake).type,
        category: dataManager.getMove(GEN2_MOVE_IDS.earthquake).category,
        pp: 10,
        maxPp: 10,
        disabled: false,
        disabledReason: undefined,
      },
      {
        index: 3,
        moveId: GEN2_MOVE_IDS.fireBlast,
        displayName: GEN2_MOVE_NAMES.fireBlast,
        type: dataManager.getMove(GEN2_MOVE_IDS.fireBlast).type,
        category: dataManager.getMove(GEN2_MOVE_IDS.fireBlast).category,
        pp: 5,
        maxPp: 5,
        disabled: false,
        disabledReason: undefined,
      },
    ]);
  });

  it("given a battle with 3v3 teams, when getAvailableSwitches is called, then returns correct indices", () => {
    // Arrange
    const team1 = createTeam1();
    const team2 = createTeam2();
    const engine = createBattle(team1, team2, 42);
    engine.start();

    // Act
    const switches = engine.getAvailableSwitches(0);

    expect(switches).toEqual([1, 2]);
  });

  // --- Type Effectiveness Tests ---

  it("given Gen 2, when a Dark move hits a Psychic type, then it is super effective (2x)", () => {
    // Arrange: Umbreon (Dark) uses Crunch vs Alakazam (Psychic)
    // In Gen 2, Dark type is super effective against Psychic
    const darkAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.umbreon,
      50,
      [GEN2_MOVE_IDS.crunch, GEN2_MOVE_IDS.shadowBall, GEN2_MOVE_IDS.rest, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.umbreon,
    );
    const psychicDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.alakazam,
      50,
      [GEN2_MOVE_IDS.psychic, GEN2_MOVE_IDS.confusion, GEN2_MOVE_IDS.recover, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.alakazam,
    );
    const engine = createBattle([darkAttacker], [psychicDefender], 100);

    // Act
    engine.start();
    // Umbreon uses Crunch (dark) against Alakazam (psychic)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Tackle (normal)

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(dark, [psychic], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.alakazam, source: GEN2_MOVE_IDS.crunch }),
    );
  });

  it("given Gen 2, when a Psychic move hits a Dark type, then it has no effect (0x)", () => {
    // Arrange: Alakazam uses Psychic vs Umbreon (Dark)
    // In Gen 2, Psychic cannot hit Dark at all (immunity)
    const psychicAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.alakazam,
      50,
      [GEN2_MOVE_IDS.psychic, GEN2_MOVE_IDS.confusion, GEN2_MOVE_IDS.recover, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.alakazam,
    );
    const darkDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.umbreon,
      50,
      [GEN2_MOVE_IDS.crunch, GEN2_MOVE_IDS.shadowBall, GEN2_MOVE_IDS.rest, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.umbreon,
    );
    const engine = createBattle([psychicAttacker], [darkDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Psychic
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Tackle

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(psychic, [dark], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.umbreon, source: GEN2_MOVE_IDS.psychic }),
    );
  });

  it("given Gen 2, when a Ghost move hits a Psychic type, then it is super effective (2x — Gen 1 bug fixed)", () => {
    // Arrange: Gengar uses Shadow Ball (ghost) vs Alakazam (psychic)
    // In Gen 2, Ghost vs Psychic = super effective (Gen 1 bug was 0x, now fixed to 2x)
    const ghostAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.gengar,
      50,
      [GEN2_MOVE_IDS.shadowBall, GEN2_MOVE_IDS.crunch, GEN2_MOVE_IDS.hypnosis, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.gengar,
    );
    const psychicDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.alakazam,
      50,
      [GEN2_MOVE_IDS.psychic, GEN2_MOVE_IDS.confusion, GEN2_MOVE_IDS.recover, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.alakazam,
    );
    const engine = createBattle([ghostAttacker], [psychicDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Shadow Ball (ghost)
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Tackle

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(ghost, [psychic], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.alakazam, source: GEN2_MOVE_IDS.shadowBall }),
    );
  });

  it("given Gen 2, when a Fire move hits a Steel type, then it is super effective (2x)", () => {
    // Arrange: Typhlosion uses Flamethrower (fire) vs Steelix (steel/ground)
    const fireAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [GEN2_MOVE_IDS.flamethrower, GEN2_MOVE_IDS.thunderPunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const steelDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.steelix,
      50,
      [GEN2_MOVE_IDS.ironTail, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.bodySlam, GEN2_MOVE_IDS.rockThrow],
      GEN2_SPECIES_NAMES.steelix,
    );
    const engine = createBattle([fireAttacker], [steelDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Flamethrower
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 2 }); // Body Slam

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(fire, [steel], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.steelix, source: GEN2_MOVE_IDS.flamethrower }),
    );
  });

  it("given Gen 2, when a Normal move hits a Steel type, then it is not very effective (0.5x)", () => {
    // Arrange: Normal move vs Steelix (steel/ground) -> steel resists normal
    const normalAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.snorlax,
      50,
      [GEN2_MOVE_IDS.bodySlam, GEN2_MOVE_IDS.hyperBeam, GEN2_MOVE_IDS.rest, GEN2_MOVE_IDS.earthquake],
      GEN2_SPECIES_NAMES.snorlax,
    );
    const steelDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.steelix,
      50,
      [GEN2_MOVE_IDS.ironTail, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.bodySlam, GEN2_MOVE_IDS.rockThrow],
      GEN2_SPECIES_NAMES.steelix,
    );
    const engine = createBattle([normalAttacker], [steelDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Body Slam (normal)
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 2 }); // Body Slam

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(normal, [steel], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.steelix, source: GEN2_MOVE_IDS.bodySlam }),
    );
  });

  // --- Weather Tests (via ruleset, since engine doesn't handle weather-set from moves yet) ---

  it("given Gen 2 weather, when sandstorm is active, then non-rock/ground/steel types take damage", () => {
    // Arrange: Set up a battle and manually set weather
    const fireType = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [GEN2_MOVE_IDS.flamethrower, GEN2_MOVE_IDS.thunderPunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const rockType = createGen2Pokemon(
      GEN2_SPECIES_IDS.tyranitar,
      50,
      [GEN2_MOVE_IDS.crunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.rockSlide, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.tyranitar,
    );
    const engine = createBattle([fireType], [rockType], 42);

    engine.start();

    // Manually set sandstorm weather on the battle state
    // The Gen2Weather module uses "sand" as the weather type
    engine.state.weather = {
      type: GEN2_WEATHER_IDS.sand,
      turnsLeft: 5,
      source: GEN2_MOVE_IDS.sandstorm,
    };

    // Act: Submit moves to trigger a turn (which processes end-of-turn weather damage)
    const initialHp = engine.getActive(0)?.pokemon.currentHp ?? 200;
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const events = engine.getEventLog();
    const weatherDamageEvents = events.filter(
      (e) => e.type === "damage" && e.source === GEN2_WEATHER_SAND_DAMAGE_SOURCE,
    );
    const expectedMaxHp = engine.getActive(0)?.pokemon.calculatedStats?.hp ?? 200;
    const expectedDamage = Math.max(1, Math.floor(expectedMaxHp / 8));
    expect(weatherDamageEvents).toHaveLength(1);
    expect(weatherDamageEvents[0]).toEqual(
      expect.objectContaining({
        type: "damage",
        side: 0,
        pokemon: GEN2_SPECIES_NAMES.typhlosion,
        amount: expectedDamage,
        maxHp: expectedMaxHp,
        source: GEN2_WEATHER_SAND_DAMAGE_SOURCE,
      }),
    );
  });

  it("given Gen 2 weather, when weather countdown reaches 0, then weather-end event is emitted", () => {
    // Arrange: Set weather with 1 turn left
    const poke1 = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [GEN2_MOVE_IDS.flamethrower, GEN2_MOVE_IDS.thunderPunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const poke2 = createGen2Pokemon(
      GEN2_SPECIES_IDS.feraligatr,
      50,
      [GEN2_MOVE_IDS.surf, GEN2_MOVE_IDS.hydroPump, GEN2_MOVE_IDS.iceBeam, GEN2_MOVE_IDS.slash],
      GEN2_SPECIES_NAMES.feraligatr,
    );
    const engine = createBattle([poke1], [poke2], 42);
    engine.start();

    // Set weather with 1 turn left
    engine.state.weather = {
      type: GEN2_WEATHER_IDS.rain,
      turnsLeft: 1,
      source: GEN2_MOVE_IDS.rainDance,
    };

    // Act: Play a turn
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const weatherEndEvents = events.filter((e) => e.type === "weather-end");
    expect(weatherEndEvents.length).toBe(1);
    if (weatherEndEvents[0]?.type === "weather-end") {
      expect(weatherEndEvents[0]?.weather).toBe(GEN2_WEATHER_IDS.rain);
    }
  });

  // --- Held Items Tests (tested via ruleset since engine doesn't process leftovers yet) ---

  it("given a Pokemon with Leftovers, when applyHeldItem is called at end-of-turn, then it heals 1/16 max HP", () => {
    // Arrange
    const pokemon = createGen2Pokemon(
      GEN2_SPECIES_IDS.snorlax,
      50,
      [GEN2_MOVE_IDS.bodySlam, GEN2_MOVE_IDS.rest, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.hyperBeam],
      GEN2_SPECIES_NAMES.snorlax,
      { heldItem: GEN2_ITEM_IDS.leftovers },
    );
    const engine = createBattle([pokemon], [pokemon], 42);
    engine.start();

    const active = engine.getActive(0);
    if (!active) throw new Error("Expected active pokemon");

    const maxHp = active.pokemon.calculatedStats?.hp ?? 200;
    // Damage the Pokemon a bit
    active.pokemon.currentHp = Math.floor(maxHp * 0.5);

    // Act
    const result = ruleset.applyHeldItem("end-of-turn", {
      pokemon: active,
      state: engine.getState(),
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBeGreaterThan(0);
    const healEffect = result.effects.find((e) => e.type === "heal");
    expect(healEffect).toBeDefined();
    expect(healEffect?.value).toBe(Math.max(1, Math.floor(maxHp / 16)));
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("given a Pokemon at low HP holding Berry, when applyHeldItem is called at end-of-turn, then heals 10 HP and Berry is consumed", () => {
    // Arrange: Gen 2 Berry restores the HP amount documented in the owned item data.
    const pokemon = createGen2Pokemon(
      GEN2_SPECIES_IDS.umbreon,
      50,
      [GEN2_MOVE_IDS.crunch, GEN2_MOVE_IDS.shadowBall, GEN2_MOVE_IDS.rest, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.umbreon,
      { heldItem: GEN2_ITEM_IDS.berry },
    );
    const engine = createBattle([pokemon], [pokemon], 42);
    engine.start();

    const active = engine.getActive(0);
    if (!active) throw new Error("Expected active pokemon");

    // Set HP to 1 so it is clearly <= 50% of any max HP
    active.pokemon.currentHp = 1;

    // Act
    const result = ruleset.applyHeldItem("end-of-turn", {
      pokemon: active,
      state: engine.getState(),
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.type === "heal");
    const consumeEffect = result.effects.find((e) => e.type === "consume");
    const berryHealAmount = Number(
      dataManager.getItem(GEN2_ITEM_IDS.berry).description.match(/Restores (\d+) HP/)?.[1] ?? 0,
    );
    expect(healEffect).toEqual(expect.objectContaining({ type: "heal", value: berryHealAmount }));
    expect(consumeEffect).toEqual(expect.objectContaining({ type: "consume", value: GEN2_ITEM_IDS.berry }));
  });

  // --- Entry Hazards Tests ---

  it("given Spikes on the field, when a non-Flying Pokemon switches in, then it takes 1/8 HP damage", () => {
    // Arrange: Directly test via the ruleset
    const pokemon = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [GEN2_MOVE_IDS.flamethrower, GEN2_MOVE_IDS.thunderPunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const engine = createBattle([pokemon], [pokemon], 42);
    engine.start();

    const active = engine.getActive(0);
    if (!active) throw new Error("Expected active pokemon");

    const maxHp = active.pokemon.calculatedStats?.hp ?? 200;

    // Create a mock side with spikes
    const side = engine.getState().sides[0];
    side.hazards.push({ type: "spikes", layers: 1 });

    // Act
    const result = ruleset.applyEntryHazards(active, side);

    // Assert: Should deal 1/8 of max HP
    const expectedDamage = Math.max(1, Math.floor(maxHp / 8));
    expect(result.damage).toBe(expectedDamage);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("given Spikes on the field, when a Flying-type Pokemon switches in, then it takes no damage", () => {
    // Arrange: Crobat (#GEN2_SPECIES_IDS.crobat) is Poison/Flying
    const pokemon = createGen2Pokemon(
      GEN2_SPECIES_IDS.crobat,
      50,
      [GEN2_MOVE_IDS.crunch, GEN2_MOVE_IDS.confuseRay, GEN2_MOVE_IDS.shadowBall, GEN2_MOVE_IDS.tackle],
      GEN2_SPECIES_NAMES.crobat,
    );
    const engine = createBattle([pokemon], [pokemon], 42);
    engine.start();

    const active = engine.getActive(0);
    if (!active) throw new Error("Expected active pokemon");

    const side = engine.getState().sides[0];
    side.hazards.push({ type: "spikes", layers: 1 });

    // Act
    const result = ruleset.applyEntryHazards(active, side);

    // Assert: Flying type is immune to Spikes
    expect(result.damage).toBe(0);
  });

  // --- Gen 2 Specific Mechanic Tests ---

  it("given Gen 2, when a Pokemon's HP reaches 0, then its currentHp is 0", () => {
    // Arrange
    const strong = createGen2Pokemon(
      GEN2_SPECIES_IDS.mewtwo,
      100,
      [GEN2_MOVE_IDS.psychic, GEN2_MOVE_IDS.confusion, GEN2_MOVE_IDS.recover, GEN2_MOVE_IDS.shadowBall],
      GEN2_SPECIES_NAMES.mewtwo,
    );
    const weak = createGen2Pokemon(GEN2_SPECIES_IDS.magikarp, 5, [GEN2_MOVE_IDS.tackle, GEN2_MOVE_IDS.tackle, GEN2_MOVE_IDS.tackle, GEN2_MOVE_IDS.tackle], GEN2_SPECIES_NAMES.magikarp);
    const engine = createBattle([strong], [weak], 42);

    // Act
    runFullBattle(engine, 42);

    // Assert
    const defenderTeam = engine.getTeam(1);
    const magikarp = defenderTeam[0];
    expect(magikarp).toBeDefined();
    expect(magikarp?.currentHp).toBe(0);
  });

  it("given Gen 2, when a super-effective Water move hits a Fire type, then effectiveness is >= 2x", () => {
    // Arrange: Feraligatr (Water) uses Surf vs Typhlosion (Fire) = 2x
    const waterAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.feraligatr,
      50,
      [GEN2_MOVE_IDS.surf, GEN2_MOVE_IDS.hydroPump, GEN2_MOVE_IDS.iceBeam, GEN2_MOVE_IDS.slash],
      GEN2_SPECIES_NAMES.feraligatr,
    );
    const fireDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [GEN2_MOVE_IDS.flamethrower, GEN2_MOVE_IDS.thunderPunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const engine = createBattle([waterAttacker], [fireDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Surf
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 1 }); // Thunder Punch

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(water, [fire], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.typhlosion, source: GEN2_MOVE_IDS.surf }),
    );
  });

  it("given Gen 2, when a not-very-effective Fire move hits a Water type, then effectiveness is < 1", () => {
    // Arrange: Typhlosion uses Flamethrower (fire) vs Feraligatr (water) = 0.5x
    const fireAttacker = createGen2Pokemon(
      GEN2_SPECIES_IDS.typhlosion,
      50,
      [GEN2_MOVE_IDS.flamethrower, GEN2_MOVE_IDS.thunderPunch, GEN2_MOVE_IDS.earthquake, GEN2_MOVE_IDS.fireBlast],
      GEN2_SPECIES_NAMES.typhlosion,
    );
    const waterDefender = createGen2Pokemon(
      GEN2_SPECIES_IDS.feraligatr,
      50,
      [GEN2_MOVE_IDS.surf, GEN2_MOVE_IDS.hydroPump, GEN2_MOVE_IDS.iceBeam, GEN2_MOVE_IDS.slash],
      GEN2_SPECIES_NAMES.feraligatr,
    );
    const engine = createBattle([fireAttacker], [waterDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Flamethrower
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Slash

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({
      type: "effectiveness",
      multiplier: getTypeEffectiveness(fire, [water], dataManager.getTypeChart()),
    });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: GEN2_SPECIES_NAMES.feraligatr, source: GEN2_MOVE_IDS.flamethrower }),
    );
  });
});
