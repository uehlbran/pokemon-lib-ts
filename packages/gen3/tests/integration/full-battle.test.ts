import type { BattleConfig } from "@pokemon-lib-ts/battle";
import { BattleEngine, RandomAI } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager, Gen3Ruleset } from "../../src";

/**
 * Gen 3 Full Battle Integration Tests
 *
 * End-to-end tests that create a BattleEngine with Gen3Ruleset, run battles,
 * and verify deterministic outcomes.
 *
 * Source: pret/pokeemerald, Showdown Gen 3 mechanics
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
let uidCounter = 0;

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

function runFullBattle(engine: BattleEngine, seed: number, maxTurns = 500): BattleEngine {
  const ai = new RandomAI();
  const aiRng = new SeededRandom(seed + 999);

  engine.start();

  let turns = 0;
  while (!engine.isEnded() && turns < maxTurns) {
    const phase = engine.getPhase();

    if (phase === "action-select") {
      const action0 = ai.chooseAction(0, engine.getState(), ruleset, aiRng);
      const action1 = ai.chooseAction(1, engine.getState(), ruleset, aiRng);
      engine.submitAction(0, action0);
      engine.submitAction(1, action1);
      turns++;
    } else if (phase === "switch-prompt") {
      for (const sideIdx of [0, 1] as const) {
        const active = engine.getActive(sideIdx);
        if (active && active.pokemon.currentHp <= 0) {
          const switchTarget = ai.chooseSwitchIn(sideIdx, engine.getState(), ruleset, aiRng);
          engine.submitSwitch(sideIdx, switchTarget);
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
      257,
      50,
      ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
      "Blaziken",
    ),
    createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert"),
    createGen3Pokemon(282, 50, ["psychic", "thunderbolt", "calm-mind", "shadow-ball"], "Gardevoir"),
  ];
}

/** Team 2: Aggron, Salamence, Metagross (Gen 3 powerhouses) */
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

// ---------------------------------------------------------------------------
// Tests
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
    // Arrange: 1v1 battle
    const attacker = createGen3Pokemon(
      257,
      50,
      ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
      "Blaziken",
    );
    const defender = createGen3Pokemon(
      260,
      50,
      ["surf", "earthquake", "ice-beam", "protect"],
      "Swampert",
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
        expect(evt.amount).toBeGreaterThan(0);
        expect(evt.maxHp).toBeGreaterThan(0);
      }
    }
  });

  it("given a Gen 3 battle, when moves execute, then move-start events are emitted", () => {
    // Arrange
    const team1 = [
      createGen3Pokemon(
        257,
        50,
        ["flamethrower", "sky-uppercut", "rock-slide", "swords-dance"],
        "Blaziken",
      ),
    ];
    const team2 = [
      createGen3Pokemon(260, 50, ["surf", "earthquake", "ice-beam", "protect"], "Swampert"),
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

  it("given a 3v3 Gen 3 battle, when run to completion multiple times, then always finishes within 500 turns", () => {
    // Stability test: ensure the battle engine doesn't loop infinitely
    for (const seed of [100, 200, 300]) {
      const team1 = createTeam1();
      const team2 = createTeam2();
      const engine = createBattle(team1, team2, seed);
      runFullBattle(engine, seed, 500);
      expect(engine.isEnded()).toBe(true);
    }
  });
});
