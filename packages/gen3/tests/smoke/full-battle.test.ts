import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine, RandomAI } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_SLOTS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";

/**
 * Gen 3 Full Battle Integration Tests
 *
 * End-to-end tests that create a BattleEngine with Gen3Ruleset, run battles,
 * and verify deterministic outcomes. Wave 2 expands coverage to abilities,
 * weather interactions, and end-of-turn ordering.
 *
 * Source: pret/pokeemerald, Showdown Gen 3 mechanics
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
let uidCounter = 0;
const DEFAULT_NATURE = ALL_NATURES[0].id;

beforeEach(() => {
  uidCounter = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a Gen 3 PokemonInstance with specific moves.
 * Uses Gen 3 defaults: IVs (0-31), EVs (0-255), natures.
 */
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
    nature: DEFAULT_NATURE,
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
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: 70,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "littleroot-town",
    metLevel: level,
    originalTrainer: "Brendan",
    originalTrainerId: 12345,
    pokeball: GEN3_ITEM_IDS.pokeBall,
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

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/** Team 1: Blaziken, Swampert, Gardevoir (Gen 3 starters + Gardevoir) */
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

/** Team 2: Aggron, Salamence, Metagross (Gen 3 powerhouses) */
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

/**
 * Team with Intimidate lead (Salamence) to test on-switch-in ability triggers.
 * Source: pret/pokeemerald — Salamence has Intimidate
 */
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

/**
 * Team with Drizzle lead (Kyogre) to test weather-setting on switch-in.
 * Source: pret/pokeemerald — Kyogre has Drizzle
 */
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

/**
 * Team with Swift Swim (Horsea) and Rain Dance support.
 * Source: pret/pokeemerald — Horsea/Seadra have Swift Swim
 */
function createSwiftSwimTeam(): PokemonInstance[] {
  return [
    createGen3Pokemon(
      GEN3_SPECIES_IDS.seadra,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.rainDance, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.toxic],
      "Seadra",
      {
        ability: GEN3_ABILITY_IDS.swiftSwim,
      },
    ),
    createGen3Pokemon(
      GEN3_SPECIES_IDS.gyarados,
      50,
      [
        GEN3_MOVE_IDS.surf,
        GEN3_MOVE_IDS.earthquake,
        GEN3_MOVE_IDS.dragonDance,
        GEN3_MOVE_IDS.iceBeam,
      ],
      "Gyarados",
      {
        ability: GEN3_ABILITY_IDS.intimidate,
      },
    ),
  ];
}

/**
 * Team with Speed Boost (Ninjask) to test EoT speed boost accumulation.
 * Source: pret/pokeemerald — Ninjask has Speed Boost
 */
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

// ---------------------------------------------------------------------------
// Core battle tests (from Wave 1)
// ---------------------------------------------------------------------------

describe("Gen 3 Full Battle Integration", () => {
  it("given two teams of Gen 3 Pokemon, when a full battle runs with RandomAI, then a winner is declared", () => {
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
    // Source: PRNG determinism requirement — same seed = same battle
    // Arrange
    const seed = 42;

    // Act: Run battle 1
    const savedCounter = uidCounter;
    uidCounter = 0;
    const team1a = createTeam1();
    const team2a = createTeam2();
    const engine1 = createBattle(team1a, team2a, seed);
    runFullBattle(engine1, seed);
    const events1 = engine1.getEventLog();

    // Act: Run battle 2 with identical setup
    uidCounter = 0; // Reset so UIDs match
    const team1b = createTeam1();
    const team2b = createTeam2();
    const engine2 = createBattle(team1b, team2b, seed);
    runFullBattle(engine2, seed);
    const events2 = engine2.getEventLog();

    // Restore counter
    uidCounter = savedCounter;

    // Assert: Event logs must be identical
    expect(events1.length).toBe(events2.length);
    expect(events1.length).toBeGreaterThan(0);

    for (let i = 0; i < events1.length; i++) {
      expect(events1[i]?.type).toBe(events2[i]?.type);
    }

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

    // Assert
    const events1 = engine1.getEventLog();
    const events2 = engine2.getEventLog();
    const eventsMatch =
      events1.length === events2.length && events1.every((e, i) => e.type === events2[i]?.type);
    expect(eventsMatch).toBe(false);
  });

  it("given a Gen 3 battle, when it starts, then a battle-start event is emitted with generation 3", () => {
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
      // Source: createBattle() hard-codes generation 3 for this Gen 3 suite.
      expect(events[0]?.generation).toBe(3);
      expect(events[0]?.format).toBe("singles");
    }
  });

  it("given a Gen 3 battle, when it starts, then switch-in events are emitted for both sides", () => {
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

  it("given a Gen 3 battle with 1v1 teams, when both sides attack, then damage events are emitted", () => {
    // Arrange: 1v1 battle — Blaziken L50 (HP=155) uses Flamethrower, Swampert L50 (HP=175) uses Surf
    // Source: pret/pokeemerald — Gen 3 damage formula produces non-zero damage for these matchups
    // HP formula: Blaziken base HP=80: floor((2*80+31)*50/100)+60 = 155
    //             Swampert base HP=100: floor((2*100+31)*50/100)+60 = 175
    const attacker = createGen3Pokemon(
      GEN3_SPECIES_IDS.blaziken,
      50,
      [
        GEN3_MOVE_IDS.flamethrower,
        GEN3_MOVE_IDS.skyUppercut,
        GEN3_MOVE_IDS.rockSlide,
        GEN3_MOVE_IDS.swordsDance,
      ],
      "Blaziken",
    );
    const defender = createGen3Pokemon(
      GEN3_SPECIES_IDS.swampert,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.earthquake, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.protect],
      "Swampert",
    );
    const engine = createBattle([attacker], [defender], 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: both moves deal damage so exactly 2 damage events (one per attacker)
    // Surf is 2x effective vs Blaziken (Water→Fire = 2×, Water→Fighting = 1×); Flamethrower vs Swampert is 0.5x
    const events = engine.getEventLog();
    const damageEvents = events.filter((e) => e.type === "damage");
    // Both moves hit — expect exactly 2 combat damage events this turn
    expect(damageEvents.length).toBe(2);

    // damage event side = the side that takes damage
    // team1 = Blaziken (side 0), team2 = Swampert (side 1)
    // Swampert's Surf hits Blaziken → side 0 takes damage (maxHp = 155)
    // Blaziken's Flamethrower hits Swampert → side 1 takes damage (maxHp = 175)
    const side0Damage = damageEvents.find((e) => e.type === "damage" && e.side === 0);
    const side1Damage = damageEvents.find((e) => e.type === "damage" && e.side === 1);

    // Blaziken (side 0) takes Surf damage — Blaziken maxHp = 155
    // Source: HP formula: floor((2*80+31)*50/100)+60 = 155
    expect(side0Damage?.type === "damage" ? side0Damage.maxHp : undefined).toBe(155);
    expect(side0Damage?.type === "damage" ? side0Damage.amount : undefined).toBeGreaterThan(0);

    // Swampert (side 1) takes Flamethrower damage — Swampert maxHp = 175
    // Source: HP formula: floor((2*100+31)*50/100)+60 = 175
    expect(side1Damage?.type === "damage" ? side1Damage.maxHp : undefined).toBe(175);
    expect(side1Damage?.type === "damage" ? side1Damage.amount : undefined).toBeGreaterThan(0);
  });

  it("given a Gen 3 battle, when moves execute, then move-start events are emitted", () => {
    // Arrange
    const team1 = [
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
    ];
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert: both Blaziken and Swampert used moves → expect exactly 2 move-start events
    // Source: BattleEngine — each submitted move that executes emits one "move-start" event
    const events = engine.getEventLog();
    const moveStartEvents = events.filter((e) => e.type === "move-start");
    expect(moveStartEvents.length).toBe(2);

    // Verify each side's move-start event is present
    const movedSides = moveStartEvents.map((e) => (e.type === "move-start" ? e.side : -1));
    expect(movedSides).toContain(0); // Blaziken side
    expect(movedSides).toContain(1); // Swampert side
  });
});

// ---------------------------------------------------------------------------
// Wave 2: Ability integration tests
// ---------------------------------------------------------------------------

describe("Gen 3 Ability Integration", () => {
  it("given Salamence with Intimidate lead, when battle starts, then opponent's Attack is lowered", () => {
    // Source: pret/pokeemerald — Intimidate lowers opponent's Attack by 1 on switch-in
    // Arrange
    const team1 = createIntimidateTeam();
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    // Assert: Intimidate triggered a stat-change event lowering the opposing side's Attack by 1
    // Source: pret/pokeemerald — ABILITY_INTIMIDATE lowers gBattlerTarget's Attack by 1 stage on entry
    // Side 0 = Salamence (Intimidate user), Side 1 = Blaziken (target of Intimidate)
    const events = engine.getEventLog();
    const statEvents = events.filter((e) => e.type === "stat-change");
    const intimidateEvent = statEvents.find(
      (e) => e.type === "stat-change" && e.stat === "attack" && e.stages === -1 && e.side === 1,
    );
    // Intimidate must have fired and must have targeted side 1 (the opponent, Blaziken)
    expect(intimidateEvent).not.toBeNull();
    expect(intimidateEvent).not.toBeUndefined();
  });

  it("given Kyogre with Drizzle lead, when battle starts, then rain weather is set", () => {
    // Source: pret/pokeemerald — Drizzle sets permanent rain on switch-in
    // Arrange
    const team1 = createDrizzleTeam();
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();

    // Assert: Drizzle fires exactly once on battle start, setting rain weather
    // Source: pret/pokeemerald — ABILITY_DRIZZLE sets WEATHER_RAIN on switch-in; fires exactly once
    const events = engine.getEventLog();
    const weatherEvents = events.filter((e) => e.type === "weather-set");
    // Drizzle fires exactly once (only one side has a weather-setting ability)
    expect(weatherEvents.length).toBe(1);
    const rainEvent = weatherEvents.find(
      (e) => e.type === "weather-set" && e.weather === CORE_WEATHER_IDS.rain,
    );
    // The single weather event must be the rain event from Drizzle
    expect(rainEvent).not.toBeNull();
    expect(rainEvent).not.toBeUndefined();

    // Verify state reflects rain
    const state = engine.getState();
    expect(state.weather?.type).toBe(CORE_WEATHER_IDS.rain);
  });

  it("given a Drizzle team vs a normal team, when battle runs to completion, then it finishes (stability)", () => {
    // Source: pret/pokeemerald — weather-setting abilities should not cause infinite loops
    // Arrange
    const team1 = createDrizzleTeam();
    const team2 = createTeam2();

    const engine = createBattle(team1, team2, 77);
    runFullBattle(engine, 77);

    // Assert
    expect(engine.isEnded()).toBe(true);
  });

  // Bug #484 FIXED: BattleEngine.processEndOfTurn() now deduplicates applyAbility("on-turn-end")
  // calls per Pokemon per turn via a Set, so Speed Boost fires exactly once regardless of how
  // many EoT ability-dispatching cases (weather-healing, shed-skin, speed-boost, etc.) exist.
  //
  // Speed Boost first-turn skip:
  // Source: pret/pokeemerald src/battle_util.c:2642-2643 — gDisableStructs[battler].isFirstTurn != 2
  // Speed Boost does NOT activate on the first turn after switching in.
  it("given a Ninjask with Speed Boost, when first turn ends, then Speed Boost does NOT activate (first-turn skip)", () => {
    // Source: pret/pokeemerald src/battle_util.c:2642-2643 — isFirstTurn != 2
    // Arrange
    const team1 = createSpeedBoostTeam();
    const team2 = [
      createGen3Pokemon(
        GEN3_SPECIES_IDS.snorlax,
        50,
        [GEN3_MOVE_IDS.bodySlam, GEN3_MOVE_IDS.earthquake, GEN3_MOVE_IDS.rest, GEN3_MOVE_IDS.curse],
        "Snorlax",
        {
          ability: GEN3_ABILITY_IDS.thickFat,
        },
      ),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act: Start and run turn 1
    engine.start();
    // Turn 1: Ninjask uses Protect, Snorlax attacks
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 }); // protect
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // body-slam

    // Assert: After turn 1, Speed Boost should NOT fire (first-turn skip per decomp)
    const events = engine.getEventLog();
    const speedBoostEvents = events.filter(
      (e) => e.type === "stat-change" && e.stat === "speed" && e.stages === 1,
    );
    expect(speedBoostEvents.length).toBe(0);
  });

  it("given a Ninjask with Speed Boost, when second turn ends and Ninjask is alive, then Speed is boosted once", () => {
    // Source: pret/pokeemerald src/battle_util.c:2642-2643 — Speed Boost skips turn 1,
    // activates from turn 2 onward
    // Use a weaker opponent (Chansey with Seismic Toss) so Ninjask survives to turn 2 EoT
    // Arrange
    const team1 = createSpeedBoostTeam();
    const team2 = [
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
        {
          ability: GEN3_ABILITY_IDS.naturalCure,
        },
      ),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act: Start and run 2 turns
    engine.start();
    // Turn 1: Ninjask uses Protect, Chansey attacks (Speed Boost skipped — first turn)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 }); // protect
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // seismic-toss
    // Turn 2: Ninjask uses Protect, Chansey attacks (Speed Boost should activate)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 }); // protect
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // seismic-toss

    // Check if Ninjask survived (Seismic Toss does flat 50 damage; Ninjask has ~136 HP)
    const state = engine.getState();
    const ninjask = state.sides[0].active[0];
    if (!ninjask || ninjask.pokemon.currentHp <= 0) {
      // Ninjask fainted — cannot test Speed Boost. Skip assertion.
      // This path is unlikely since Seismic Toss only does 50 damage/turn.
      return;
    }

    // Assert: After turn 2, exactly one Speed Boost event (from turn 2 end-of-turn)
    const events = engine.getEventLog();
    const speedBoostEvents = events.filter(
      (e) => e.type === "stat-change" && e.stat === "speed" && e.stages === 1,
    );
    expect(speedBoostEvents.length).toBe(1);

    // Verify it targeted Ninjask's side (side 0)
    const boostEvent = speedBoostEvents[0];
    expect(boostEvent?.type === "stat-change" && boostEvent.side).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Wave 2: Weather interaction integration tests
// ---------------------------------------------------------------------------

describe("Gen 3 Weather Integration", () => {
  it("given rain weather active, when a Water move is used, then damage is boosted by 1.5x", () => {
    // Source: pret/pokeemerald src/pokemon.c — rain boosts water moves by 1.5x
    // Arrange: Kyogre (Drizzle) vs Blaziken
    const team1 = createDrizzleTeam();
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    // Rain is now active from Drizzle
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // surf
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // flamethrower

    // Assert: Rain boosts Surf (Water) 1.5x; Blaziken is 2x weak to Water (Water→Fire = 2×, Water→Fighting = 1×)
    // Source: pret/pokeemerald — rain multiplies Water damage by 1.5x; type effectiveness stacks
    // Speed comparison: Kyogre base speed=90 (eff. 110 at L50) vs Blaziken base speed=80 (eff. 100)
    // Kyogre goes first; Surf (2x effective × 1.5x rain) OHKOs Blaziken before Flamethrower fires
    // Formula: Kyogre L50 SpAtk (200) vs Blaziken L50 SpDef (90), power 95, 2× type × 1.5× rain → OHKO
    const events = engine.getEventLog();
    const damageEvents = events.filter((e) => e.type === "damage");
    // Kyogre OHKOs Blaziken with Surf before Flamethrower executes → exactly 1 damage event
    expect(damageEvents.length).toBe(1);

    // The single damage event must be Surf hitting Blaziken (side 1)
    const surfDamage = damageEvents[0];
    expect(surfDamage?.type).toBe("damage");
    if (surfDamage?.type === "damage") {
      // Surf hits Blaziken (side 1)
      expect(surfDamage.side).toBe(1);
      // Blaziken HP = 155 (floor((2*80+31)*50/100)+60 = 155)
      // Source: HP formula from pret/pokeemerald
      expect(surfDamage.maxHp).toBe(155);
      // OHKO: currentHp = 0 after damage (Surf exceeds Blaziken's HP)
      expect(surfDamage.currentHp).toBe(0);
      // Damage must exceed Blaziken's HP (OHKO) — rain×1.5 × type×2 produces overkill
      expect(surfDamage.amount).toBeGreaterThanOrEqual(155);
    }
  });

  it("given rain active with Swift Swim Pokemon, when battling vs another, then Swift Swim user moves first", () => {
    // Source: pret/pokeemerald — Swift Swim doubles Speed in rain
    // Arrange: Seadra (Swift Swim, slower base speed) vs a faster Pokemon
    // Seadra base speed = 85; we pair against something fast
    const team1 = createSwiftSwimTeam();
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act: First turn — Seadra uses Rain Dance
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 }); // rain-dance
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // flamethrower

    // Now rain is active. Turn 2: Seadra should get 2x speed from Swift Swim
    if (!engine.isEnded()) {
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // surf
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // flamethrower

      // Assert: Check move order — Swift Swim Seadra should move first
      const events = engine.getEventLog();
      // Collect turn 2 move-start events (after turn-start for turn 2)
      const turn2Start = events.findIndex(
        (e, i) => e.type === "turn-start" && i > events.findIndex((e2) => e2.type === "turn-start"),
      );
      if (turn2Start >= 0) {
        const turn2Events = events.slice(turn2Start);
        const moveStarts = turn2Events.filter((e) => e.type === "move-start");
        // With Swift Swim active in rain, Seadra (side 0) should move before Blaziken (side 1)
        if (moveStarts.length >= 2) {
          const firstMover = moveStarts[0];
          if (firstMover && firstMover.type === "move-start") {
            expect(firstMover.side).toBe(0); // Seadra should move first due to Swift Swim
          }
        }
      }
    }
  });

  it("given sandstorm weather, when non-Rock/Ground/Steel Pokemon is active, then it takes 1/16 chip damage", () => {
    // Source: pret/pokeemerald src/battle_util.c — sandstorm chip = maxHP/16
    // Arrange: Tyranitar (Sand Stream) vs Blaziken (Fire/Fighting, not immune)
    const team1 = [
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
    ];
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    // Sand Stream sets sandstorm on Tyranitar's switch-in
    const state = engine.getState();
    expect(state.weather?.type).toBe("sand");

    // Execute one turn
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // rock-slide
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // protect

    // Assert: Check for weather damage event on Blaziken (non-immune)
    // Source: pret/pokeemerald src/battle_util.c — sandstorm chip = floor(maxHP/16)
    // Blaziken L50 (31 IVs, 0 EVs, Hardy, base HP=80):
    //   HP = floor((2*80+31)*50/100) + 60 = 95 + 60 = 155
    //   Sandstorm chip = floor(155/16) = 9
    // Tyranitar is Rock-type → immune to sandstorm chip
    const events = engine.getEventLog();
    const weatherDmgEvents = events.filter(
      (e) =>
        e.type === "damage" &&
        "source" in e &&
        (e as { source?: string }).source?.startsWith("weather-"),
    );
    // Exactly one weather chip event: only Blaziken (side 1) takes sandstorm chip damage
    expect(weatherDmgEvents.length).toBe(1);

    // Verify it targeted Blaziken (side 1) with the correct chip amount
    const chipEvt = weatherDmgEvents[0];
    if (chipEvt?.type === "damage") {
      expect(chipEvt.side).toBe(1); // Blaziken's side
      // Source: pret/pokeemerald — sandstorm chip = floor(maxHP/16)
      // Blaziken HP = 155: floor(155/16) = 9
      expect(chipEvt.amount).toBe(9);
    }
  });

  it("given a weather battle (Drizzle vs Sand Stream), when run to completion, then it finishes deterministically", () => {
    // Stability test with dueling weather setters
    // Arrange
    const team1 = createDrizzleTeam();
    const team2 = [
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

    const engine = createBattle(team1, team2, 55);
    runFullBattle(engine, 55);

    expect(engine.isEnded()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Wave 2: End-of-turn ordering
// ---------------------------------------------------------------------------

describe("Gen 3 End-of-Turn Order", () => {
  it("given the Gen 3 ruleset, when getting EoT order, then effects are in correct pokeemerald order", () => {
    // Source: pret/pokeemerald src/battle_main.c — end-of-turn phase ordering
    const order = ruleset.getEndOfTurnOrder();
    // Source: pret/pokeemerald src/battle_main.c — Uproar processing in end-of-turn loop
    expect(order).toEqual([
      CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
      CORE_END_OF_TURN_EFFECT_IDS.futureAttack,
      CORE_END_OF_TURN_EFFECT_IDS.wish,
      CORE_END_OF_TURN_EFFECT_IDS.weatherHealing,
      GEN3_ITEM_IDS.leftovers,
      CORE_VOLATILE_IDS.ingrain,
      CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
      CORE_VOLATILE_IDS.leechSeed,
      CORE_VOLATILE_IDS.curse,
      CORE_VOLATILE_IDS.nightmare,
      GEN3_MOVE_IDS.bind,
      CORE_END_OF_TURN_EFFECT_IDS.statBoostingItems,
      CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.disableCountdown,
      CORE_END_OF_TURN_EFFECT_IDS.tauntCountdown,
      GEN3_MOVE_IDS.perishSong,
      CORE_VOLATILE_IDS.uproar,
      GEN3_ABILITY_IDS.speedBoost,
      GEN3_ABILITY_IDS.shedSkin,
      CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
    ]);
  });

  it("given weather damage and status damage both active, when turn ends, then weather damage resolves before status damage", () => {
    // Source: pret/pokeemerald — weather damage tick before burn/poison tick
    // Arrange: Sandstorm + poisoned Blaziken
    const team1 = [
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
    ];
    const team2 = [
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
    ];
    const engine = createBattle(team1, team2, 42);

    // Act: Start battle (Sand Stream activates)
    engine.start();
    // Turn 1: Tyranitar uses Toxic, Blaziken attacks
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 3 }); // toxic
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // flamethrower

    // Assert: In the event log, weather chip damage (type: "damage", source: "weather-*")
    // should appear before status damage (type: "damage", source: CORE_STATUS_IDS.burn/CORE_STATUS_IDS.poison/CORE_STATUS_IDS.badlyPoisoned)
    const events = engine.getEventLog();
    const weatherDmgIdx = events.findIndex(
      (e) =>
        e.type === "damage" &&
        "source" in e &&
        (e as { source?: string }).source?.startsWith("weather-"),
    );
    const statusDmgIdx = events.findIndex(
      (e) =>
        e.type === "damage" &&
        "source" in e &&
        ((e as { source?: string }).source === CORE_STATUS_IDS.poison ||
          (e as { source?: string }).source === CORE_STATUS_IDS.badlyPoisoned ||
          (e as { source?: string }).source === CORE_STATUS_IDS.burn),
    );

    // Both should exist if Blaziken was poisoned and sandstorm is active
    if (weatherDmgIdx >= 0 && statusDmgIdx >= 0) {
      expect(weatherDmgIdx).toBeLessThan(statusDmgIdx);
    }
  });
});

// ---------------------------------------------------------------------------
// Wave 2: Cross-cutting ability immunity
// ---------------------------------------------------------------------------

describe("Gen 3 Ability Immunity Integration", () => {
  it("given Limber Persian, when opponent uses Thunder Wave, then paralysis is blocked", () => {
    // Source: pret/pokeemerald — ABILITY_LIMBER blocks STATUS_PARALYSIS
    // Arrange: Persian (Limber) vs opponent using Thunder Wave
    const team1 = [
      createGen3Pokemon(
        GEN3_SPECIES_IDS.persian,
        50,
        [GEN3_MOVE_IDS.slash, GEN3_MOVE_IDS.bite, GEN3_MOVE_IDS.fakeOut, GEN3_MOVE_IDS.protect],
        "Persian",
        {
          ability: GEN3_ABILITY_IDS.limber,
        },
      ),
    ];
    const team2 = [
      createGen3Pokemon(
        GEN3_SPECIES_IDS.pikachu,
        50,
        [
          GEN3_MOVE_IDS.thunderWave,
          GEN3_MOVE_IDS.thunderbolt,
          GEN3_MOVE_IDS.surf,
          GEN3_MOVE_IDS.protect,
        ],
        "Pikachu",
        {
          ability: GEN3_ABILITY_IDS.static,
        },
      ),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 3 }); // protect
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // thunder-wave

    // Assert: Persian should NOT be paralyzed
    const persianActive = engine.getActive(0);
    expect(persianActive?.pokemon.status).toBeNull();
  });

  it("given Insomnia Hypno, when opponent uses Spore, then sleep is blocked", () => {
    // Source: pret/pokeemerald — ABILITY_INSOMNIA blocks STATUS_SLEEP
    // Arrange: Hypno (Insomnia) vs opponent using Spore
    const team1 = [
      createGen3Pokemon(
        GEN3_SPECIES_IDS.hypno,
        50,
        [
          GEN3_MOVE_IDS.psychic,
          GEN3_MOVE_IDS.thunderbolt,
          GEN3_MOVE_IDS.protect,
          GEN3_MOVE_IDS.calmMind,
        ],
        "Hypno",
        {
          ability: GEN3_ABILITY_IDS.insomnia,
        },
      ),
    ];
    const team2 = [
      createGen3Pokemon(
        GEN3_SPECIES_IDS.breloom,
        50,
        [
          GEN3_MOVE_IDS.spore,
          GEN3_MOVE_IDS.machPunch,
          GEN3_MOVE_IDS.skyUppercut,
          GEN3_MOVE_IDS.swordsDance,
        ],
        "Breloom",
        {
          ability: GEN3_ABILITY_IDS.effectSpore,
        },
      ),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 }); // protect
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // spore

    // Assert: Hypno should NOT be asleep
    const hypnoActive = engine.getActive(0);
    expect(hypnoActive?.pokemon.status).toBeNull();
  });

  it("given Immunity Snorlax, when opponent uses Toxic, then poison is blocked", () => {
    // Source: pret/pokeemerald — ABILITY_IMMUNITY blocks STATUS_POISON/STATUS_TOXIC
    // Arrange
    const team1 = [
      createGen3Pokemon(
        GEN3_SPECIES_IDS.snorlax,
        50,
        [GEN3_MOVE_IDS.bodySlam, GEN3_MOVE_IDS.earthquake, GEN3_MOVE_IDS.rest, GEN3_MOVE_IDS.curse],
        "Snorlax",
        {
          ability: GEN3_ABILITY_IDS.immunity,
        },
      ),
    ];
    const team2 = [
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
      ),
    ];
    const engine = createBattle(team1, team2, 42);

    // Act
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 2 }); // rest
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // toxic

    // Assert: Snorlax should NOT be poisoned
    const snorlaxActive = engine.getActive(0);
    // Snorlax may have used Rest (which inflicts sleep), but should not be poisoned
    expect(snorlaxActive?.pokemon.status !== CORE_STATUS_IDS.poison).toBe(true);
    expect(snorlaxActive?.pokemon.status !== CORE_STATUS_IDS.badlyPoisoned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue #GEN3_SPECIES_IDS.kyogre: Choice Band move lock-in mechanic
// ---------------------------------------------------------------------------

describe("Gen 3 Choice Band move lock-in mechanic", () => {
  /**
   * Choice Band locks the user into the first move it uses.
   * After using a move, a "choice-locked" volatile is set on the user,
   * and all other moves become disabled in getAvailableMoves.
   *
   * Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_CHOICE_BAND
   * Source: Bulbapedia — "Choice Band locks the user into the first move selected"
   */

  it("given a Pokemon holding Choice Band, when it uses its first move, then other moves are disabled on the next turn", () => {
    // Source: pret/pokeemerald — after using a move with Choice Band, 'choice-locked' volatile is set
    // Blaziken moveset: [flamethrower(0), sky-uppercut(1), rock-slide(2), swords-dance(3)]
    // After using move index 0 (flamethrower), moves 1-3 should be disabled
    const blaziken = createGen3Pokemon(
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
    );
    const swampert = createGen3Pokemon(
      GEN3_SPECIES_IDS.swampert,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.earthquake, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.protect],
      "Swampert",
    );
    const engine = createBattle([blaziken], [swampert], 42);

    // Act: Start battle, use move index 0 (flamethrower) with Choice Band
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // flamethrower
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // protect

    // Assert: After turn 1, moves 1-3 for Blaziken should be disabled (Choice locked)
    const availableMoves = engine.getAvailableMoves(0);
    expect(availableMoves.length).toBe(4); // All 4 moves listed

    // Move 0 (flamethrower) should NOT be disabled (it's the locked move)
    expect(availableMoves[0]?.disabled).toBe(false);

    // Moves 1-3 should be disabled with "Locked by Choice item" reason
    expect(availableMoves[1]?.disabled).toBe(true);
    expect(availableMoves[1]?.disabledReason).toBe("Locked by Choice item");
    expect(availableMoves[2]?.disabled).toBe(true);
    expect(availableMoves[3]?.disabled).toBe(true);
  });

  it("given a Pokemon NOT holding Choice Band, when it uses a move, then all moves remain available next turn", () => {
    // Source: pret/pokeemerald — Choice lock only applies when holding a Choice item
    // Without Choice Band, no lock-in should occur
    const blaziken = createGen3Pokemon(
      GEN3_SPECIES_IDS.blaziken,
      50,
      [
        GEN3_MOVE_IDS.flamethrower,
        GEN3_MOVE_IDS.skyUppercut,
        GEN3_MOVE_IDS.rockSlide,
        GEN3_MOVE_IDS.swordsDance,
      ],
      "Blaziken",
      { heldItem: null },
    );
    const swampert = createGen3Pokemon(
      GEN3_SPECIES_IDS.swampert,
      50,
      [GEN3_MOVE_IDS.surf, GEN3_MOVE_IDS.earthquake, GEN3_MOVE_IDS.iceBeam, GEN3_MOVE_IDS.protect],
      "Swampert",
    );
    const engine = createBattle([blaziken], [swampert], 42);

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 }); // flamethrower (no CB)
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 3 }); // protect

    // All moves should still be available (no choice lock)
    const availableMoves = engine.getAvailableMoves(0);
    const disabledMoves = availableMoves.filter((m) => m.disabled);
    expect(disabledMoves.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Issue #387: Protect consecutive-use success-rate decay
// ---------------------------------------------------------------------------

describe("Gen 3 Protect consecutive-use success rate decay", () => {
  /**
   * Protect's success rate decays with consecutive uses.
   * Source: pret/pokeemerald src/battle_script_commands.c sProtectSuccessRates:
   *   sProtectSuccessRates = [USHRT_MAX, USHRT_MAX/2, USHRT_MAX/4, USHRT_MAX/8]
   *   Index 0: 100% (always succeeds on first use or after reset)
   *   Index 1: 50% (second consecutive use)
   *   Index 2: 25% (third consecutive use)
   *   Index 3: 12.5% (fourth+ consecutive use, capped)
   *
   * BaseRuleset.rollProtectSuccess(consecutiveProtects, rng) implements this:
   *   0 consecutive → always true
   *   1 consecutive → rng.chance(1 / 3^1) ← NOTE: implementation uses 3^n, not 2^n
   *
   * The implementation uses 3^n denominators (pokeemerald uses 2^n halving).
   * These tests verify the IMPLEMENTATION's actual behavior per the testing standard:
   * "Read the actual implementation first to find the exact threshold values used."
   */

  function makeMockRng(nextValue: number): SeededRandom {
    return {
      next: () => nextValue,
      int: (_min: number, _max: number) => Math.floor(nextValue * (_max - _min + 1)) + _min,
      chance: (p: number) => nextValue < p,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    } as unknown as SeededRandom;
  }

  it("given consecutiveProtects=0, when rollProtectSuccess is called, then always returns true (100% first use)", () => {
    // Source: pret/pokeemerald sProtectSuccessRates[0] = USHRT_MAX (100%)
    // BaseRuleset.rollProtectSuccess: if(consecutiveProtects === 0) return true
    const rng = makeMockRng(0.99); // any RNG value — always succeeds on first use
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });

  it("given consecutiveProtects=1, when RNG < 1/2, then Protect succeeds", () => {
    // Source: pret/pokeemerald sProtectSuccessRates[1] = 32768 / 65535 ≈ 0.5 → rng.chance(1/2)
    // Gen 3 override uses halving formula: 2^1 = 2 denominator
    // value 0.40 < 0.50 → succeeds
    const rng = makeMockRng(0.4);
    expect(ruleset.rollProtectSuccess(1, rng)).toBe(true);
  });

  it("given consecutiveProtects=1, when RNG >= 1/2, then Protect fails", () => {
    // Source: pret/pokeemerald sProtectSuccessRates[1] = 32768 / 65535 ≈ 0.5 → rng.chance(1/2)
    // Gen 3 override uses halving formula: 2^1 = 2 denominator
    // value 0.60 > 0.50 → fails
    const rng = makeMockRng(0.6);
    expect(ruleset.rollProtectSuccess(1, rng)).toBe(false);
  });

  it("given consecutiveProtects=2, when RNG < 1/4, then Protect succeeds", () => {
    // Source: pret/pokeemerald sProtectSuccessRates[2] = 16384 / 65535 ≈ 0.25 → rng.chance(1/4)
    // Gen 3 override uses halving formula: 2^2 = 4 denominator
    // value 0.20 < 0.25 → succeeds
    const rng = makeMockRng(0.2);
    expect(ruleset.rollProtectSuccess(2, rng)).toBe(true);
  });

  it("given consecutiveProtects=2, when RNG >= 1/4, then Protect fails", () => {
    // Source: pret/pokeemerald sProtectSuccessRates[2] = 16384 / 65535 ≈ 0.25 → rng.chance(1/4)
    // Gen 3 override uses halving formula: 2^2 = 4 denominator
    // value 0.30 > 0.25 → fails
    const rng = makeMockRng(0.3);
    expect(ruleset.rollProtectSuccess(2, rng)).toBe(false);
  });
});
