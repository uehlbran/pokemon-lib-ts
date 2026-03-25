import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine, RandomAI } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createGen2DataManager, Gen2Ruleset } from "../../src";

describe("Gen 2 Full Battle Integration", () => {
  const dataManager = createGen2DataManager();
  const ruleset = new Gen2Ruleset();
  let uidCounter = 0;

  const expectedBattleStartStats = {
    Typhlosion: { hp: 153, attack: 104, defense: 98, spAttack: 129, spDefense: 105, speed: 120 },
    Feraligatr: { hp: 160, attack: 125, defense: 120, spAttack: 99, spDefense: 103, speed: 98 },
    Meganium: { hp: 155, attack: 102, defense: 120, spAttack: 103, spDefense: 120, speed: 100 },
    Umbreon: { hp: 170, attack: 85, defense: 130, spAttack: 80, spDefense: 150, speed: 85 },
    Steelix: { hp: 150, attack: 105, defense: 220, spAttack: 75, spDefense: 85, speed: 50 },
    Tyranitar: { hp: 175, attack: 154, defense: 130, spAttack: 115, spDefense: 120, speed: 81 },
  } as const;

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
      nature: "hardy",
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
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: "male" as const,
      isShiny: false,
      metLocation: "new-bark-town",
      metLevel: level,
      originalTrainer: "Gold",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
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
      format: "singles",
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
        157,
        50,
        ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
        "Typhlosion",
      ),
      createGen2Pokemon(160, 50, ["hydro-pump", "surf", "ice-beam", "slash"], "Feraligatr"),
      createGen2Pokemon(
        154,
        50,
        ["razor-leaf", "body-slam", "earthquake", "synthesis"],
        "Meganium",
      ),
    ];
  }

  /** Team 2: Umbreon, Steelix, Tyranitar (Gen 2 Pokemon) */
  function createTeam2(): PokemonInstance[] {
    return [
      createGen2Pokemon(197, 50, ["crunch", "psychic", "shadow-ball", "rest"], "Umbreon"),
      createGen2Pokemon(208, 50, ["iron-tail", "earthquake", "body-slam", "rock-throw"], "Steelix"),
      createGen2Pokemon(248, 50, ["crunch", "earthquake", "rock-slide", "fire-blast"], "Tyranitar"),
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
      expect(events[0]?.format).toBe("singles");
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
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
    );
    const defender = createGen2Pokemon(
      160,
      50,
      ["water-gun", "surf", "ice-beam", "slash"],
      "Feraligatr",
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
        157,
        50,
        ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
        "Typhlosion",
      ),
    ];
    const team2 = [
      createGen2Pokemon(160, 50, ["surf", "hydro-pump", "ice-beam", "slash"], "Feraligatr"),
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
      150,
      100,
      ["psychic", "confusion", "recover", "shadow-ball"],
      "Mewtwo",
    );
    const weak = createGen2Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp");
    const engine = createBattle([strong], [weak], 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const faintEvents = events.filter((event) => event.type === "faint");
    expect(faintEvents).toEqual([{ type: "faint", side: 1, pokemon: "Magikarp" }]);
  });

  it("given a Gen 2 battle, when the battle ends, then a battle-end event is emitted", () => {
    // Arrange: 1v1 for quick resolution
    const strong = createGen2Pokemon(
      150,
      100,
      ["psychic", "confusion", "recover", "shadow-ball"],
      "Mewtwo",
    );
    const weak = createGen2Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp");
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

    // Derived from the Gen 2 DV=15, Stat Exp=0, level 50 formula for the fixed team fixtures above.
    for (const sideIdx of [0, 1] as const) {
      const team = engine.getTeam(sideIdx);
      for (const pokemon of team) {
        expect(pokemon.nickname).not.toBeNull();
        expect(pokemon.calculatedStats).toEqual(
          expectedBattleStartStats[pokemon.nickname as keyof typeof expectedBattleStartStats],
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
      150,
      100,
      ["psychic", "confusion", "recover", "shadow-ball"],
      "Mewtwo",
    );
    const weak1 = createGen2Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp1");
    const weak2 = createGen2Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp2");
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
        157,
        50,
        ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
        "Typhlosion",
      ),
    ];
    const team2 = [
      createGen2Pokemon(160, 50, ["surf", "hydro-pump", "ice-beam", "slash"], "Feraligatr"),
    ];
    const engine = createBattle(team1, team2, 42);
    engine.start();

    // Act
    const moves = engine.getAvailableMoves(0);

    // Source: the fixed Typhlosion fixture above carries these four moves in this exact slot order.
    expect(moves).toEqual([
      {
        index: 0,
        moveId: "flamethrower",
        displayName: "Flamethrower",
        type: "fire",
        category: "special",
        pp: 15,
        maxPp: 15,
        disabled: false,
        disabledReason: undefined,
      },
      {
        index: 1,
        moveId: "thunder-punch",
        displayName: "Thunder Punch",
        type: "electric",
        category: "special",
        pp: 15,
        maxPp: 15,
        disabled: false,
        disabledReason: undefined,
      },
      {
        index: 2,
        moveId: "earthquake",
        displayName: "Earthquake",
        type: "ground",
        category: "physical",
        pp: 10,
        maxPp: 10,
        disabled: false,
        disabledReason: undefined,
      },
      {
        index: 3,
        moveId: "fire-blast",
        displayName: "Fire Blast",
        type: "fire",
        category: "special",
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
      197,
      50,
      ["crunch", "shadow-ball", "rest", "tackle"],
      "Umbreon",
    );
    const psychicDefender = createGen2Pokemon(
      65,
      50,
      ["psychic", "confusion", "recover", "tackle"],
      "Alakazam",
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
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 2 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Alakazam", source: "crunch" }),
    );
  });

  it("given Gen 2, when a Psychic move hits a Dark type, then it has no effect (0x)", () => {
    // Arrange: Alakazam uses Psychic vs Umbreon (Dark)
    // In Gen 2, Psychic cannot hit Dark at all (immunity)
    const psychicAttacker = createGen2Pokemon(
      65,
      50,
      ["psychic", "confusion", "recover", "tackle"],
      "Alakazam",
    );
    const darkDefender = createGen2Pokemon(
      197,
      50,
      ["crunch", "shadow-ball", "rest", "tackle"],
      "Umbreon",
    );
    const engine = createBattle([psychicAttacker], [darkDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Psychic
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Tackle

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 0 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Umbreon", source: "psychic" }),
    );
  });

  it("given Gen 2, when a Ghost move hits a Psychic type, then it is super effective (2x — Gen 1 bug fixed)", () => {
    // Arrange: Gengar uses Shadow Ball (ghost) vs Alakazam (psychic)
    // In Gen 2, Ghost vs Psychic = super effective (Gen 1 bug was 0x, now fixed to 2x)
    const ghostAttacker = createGen2Pokemon(
      94,
      50,
      ["shadow-ball", "crunch", "hypnosis", "tackle"],
      "Gengar",
    );
    const psychicDefender = createGen2Pokemon(
      65,
      50,
      ["psychic", "confusion", "recover", "tackle"],
      "Alakazam",
    );
    const engine = createBattle([ghostAttacker], [psychicDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Shadow Ball (ghost)
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Tackle

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 2 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Alakazam", source: "shadow-ball" }),
    );
  });

  it("given Gen 2, when a Fire move hits a Steel type, then it is super effective (2x)", () => {
    // Arrange: Typhlosion uses Flamethrower (fire) vs Steelix (steel/ground)
    const fireAttacker = createGen2Pokemon(
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
    );
    const steelDefender = createGen2Pokemon(
      208,
      50,
      ["iron-tail", "earthquake", "body-slam", "rock-throw"],
      "Steelix",
    );
    const engine = createBattle([fireAttacker], [steelDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Flamethrower
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 2 }); // Body Slam

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 2 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Steelix", source: "flamethrower" }),
    );
  });

  it("given Gen 2, when a Normal move hits a Steel type, then it is not very effective (0.5x)", () => {
    // Arrange: Normal move vs Steelix (steel/ground) -> steel resists normal
    const normalAttacker = createGen2Pokemon(
      143,
      50,
      ["body-slam", "hyper-beam", "rest", "earthquake"],
      "Snorlax",
    );
    const steelDefender = createGen2Pokemon(
      208,
      50,
      ["iron-tail", "earthquake", "body-slam", "rock-throw"],
      "Steelix",
    );
    const engine = createBattle([normalAttacker], [steelDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Body Slam (normal)
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 2 }); // Body Slam

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 0.5 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Steelix", source: "body-slam" }),
    );
  });

  // --- Weather Tests (via ruleset, since engine doesn't handle weather-set from moves yet) ---

  it("given Gen 2 weather, when sandstorm is active, then non-rock/ground/steel types take damage", () => {
    // Arrange: Set up a battle and manually set weather
    const fireType = createGen2Pokemon(
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
    );
    const rockType = createGen2Pokemon(
      248,
      50,
      ["crunch", "earthquake", "rock-slide", "fire-blast"],
      "Tyranitar",
    );
    const engine = createBattle([fireType], [rockType], 42);

    engine.start();

    // Manually set sandstorm weather on the battle state
    // The Gen2Weather module uses "sand" as the weather type
    engine.state.weather = {
      type: "sand",
      turnsLeft: 5,
      source: "test",
    };

    // Act: Submit moves to trigger a turn (which processes end-of-turn weather damage)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Derived from the Gen 2 level-50 stat formula with DVs=15 and Stat Exp=0:
    // Typhlosion max HP is 153, so sandstorm deals floor(153 / 8) = 19 damage.
    const events = engine.getEventLog();
    const weatherDamageEvents = events.filter(
      (e) => e.type === "damage" && e.source === "weather-sand",
    );
    expect(weatherDamageEvents).toEqual([
      {
        type: "damage",
        side: 0,
        pokemon: "Typhlosion",
        amount: 19,
        currentHp: 81,
        maxHp: 153,
        source: "weather-sand",
      },
    ]);
  });

  it("given Gen 2 weather, when weather countdown reaches 0, then weather-end event is emitted", () => {
    // Arrange: Set weather with 1 turn left
    const poke1 = createGen2Pokemon(
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
    );
    const poke2 = createGen2Pokemon(
      160,
      50,
      ["surf", "hydro-pump", "ice-beam", "slash"],
      "Feraligatr",
    );
    const engine = createBattle([poke1], [poke2], 42);
    engine.start();

    // Set weather with 1 turn left
    engine.state.weather = {
      type: "rain",
      turnsLeft: 1,
      source: "rain-dance",
    };

    // Act: Play a turn
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    const events = engine.getEventLog();
    const weatherEndEvents = events.filter((e) => e.type === "weather-end");
    expect(weatherEndEvents.length).toBe(1);
    if (weatherEndEvents[0]?.type === "weather-end") {
      expect(weatherEndEvents[0]?.weather).toBe("rain");
    }
  });

  // --- Held Items Tests (tested via ruleset since engine doesn't process leftovers yet) ---

  it("given a Pokemon with Leftovers, when applyHeldItem is called at end-of-turn, then it heals 1/16 max HP", () => {
    // Arrange
    const pokemon = createGen2Pokemon(
      143,
      50,
      ["body-slam", "rest", "earthquake", "hyper-beam"],
      "Snorlax",
      { heldItem: "leftovers" },
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
    // Arrange: "berry" restores 10 HP when HP <= 50% in Gen 2
    const pokemon = createGen2Pokemon(
      197,
      50,
      ["crunch", "shadow-ball", "rest", "tackle"],
      "Umbreon",
      { heldItem: "berry" },
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
    expect(healEffect).toEqual(expect.objectContaining({ type: "heal", value: 10 }));
    // Source: Gen 2 Berry restores exactly 10 HP at or below 50% HP.
    expect(consumeEffect).toEqual(expect.objectContaining({ type: "consume" }));
  });

  // --- Entry Hazards Tests ---

  it("given Spikes on the field, when a non-Flying Pokemon switches in, then it takes 1/8 HP damage", () => {
    // Arrange: Directly test via the ruleset
    const pokemon = createGen2Pokemon(
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
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
    // Arrange: Crobat (#169) is Poison/Flying
    const pokemon = createGen2Pokemon(
      169,
      50,
      ["crunch", "confuse-ray", "shadow-ball", "tackle"],
      "Crobat",
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
      150,
      100,
      ["psychic", "confusion", "recover", "shadow-ball"],
      "Mewtwo",
    );
    const weak = createGen2Pokemon(129, 5, ["tackle", "tackle", "tackle", "tackle"], "Magikarp");
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
      160,
      50,
      ["surf", "hydro-pump", "ice-beam", "slash"],
      "Feraligatr",
    );
    const fireDefender = createGen2Pokemon(
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
    );
    const engine = createBattle([waterAttacker], [fireDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Surf
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 1 }); // Thunder Punch

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 2 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Typhlosion", source: "surf" }),
    );
  });

  it("given Gen 2, when a not-very-effective Fire move hits a Water type, then effectiveness is < 1", () => {
    // Arrange: Typhlosion uses Flamethrower (fire) vs Feraligatr (water) = 0.5x
    const fireAttacker = createGen2Pokemon(
      157,
      50,
      ["flamethrower", "thunder-punch", "earthquake", "fire-blast"],
      "Typhlosion",
    );
    const waterDefender = createGen2Pokemon(
      160,
      50,
      ["surf", "hydro-pump", "ice-beam", "slash"],
      "Feraligatr",
    );
    const engine = createBattle([fireAttacker], [waterDefender], 100);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // Flamethrower
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // Slash

    // Assert
    const events = engine.getEventLog();
    const { effectivenessEvents, damageEvents } = collectEffectivenessProbe(events);
    expect(effectivenessEvents).toContainEqual({ type: "effectiveness", multiplier: 0.5 });
    expect(damageEvents).toContainEqual(
      expect.objectContaining({ pokemon: "Feraligatr", source: "flamethrower" }),
    );
  });
});
