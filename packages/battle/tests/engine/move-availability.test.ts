import type { MoveData, PokemonInstance } from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { MockRuleset } from "../helpers/mock-ruleset";

/**
 * Creates a DataManager with moves of different categories for testing
 * taunt and choice lock mechanics.
 */
function createMoveAvailabilityDataManager(): DataManager {
  const dm = new DataManager();

  const makeMove = (
    id: string,
    displayName: string,
    category: "physical" | "special" | "status",
    type = "normal" as const,
    power: number | null = category === "status" ? null : 40,
  ): MoveData => ({
    id,
    displayName,
    type,
    category,
    power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: category === "physical",
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: `Test move: ${displayName}`,
    generation: 1,
  });

  const species = {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: ["fire" as const, "flying" as const],
    baseStats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
    abilities: { normal: ["blaze" as const], hidden: "solar-power" },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 240,
    expGroup: "medium-slow" as const,
    evYield: { spAttack: 3 },
    eggGroups: ["monster" as const, "dragon" as const],
    learnset: { levelUp: [{ level: 1, move: "tackle" }], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "charizard",
    baseFriendship: 70,
    generation: 1 as const,
    isLegendary: false,
    isMythical: false,
  };

  const blastoise = {
    ...species,
    id: 9,
    name: "blastoise",
    displayName: "Blastoise",
    types: ["water" as const],
    baseStats: { hp: 79, attack: 83, defense: 100, spAttack: 85, spDefense: 105, speed: 78 },
    abilities: { normal: ["torrent" as const], hidden: "rain-dish" },
    spriteKey: "blastoise",
  };

  const typeChart: Record<string, Record<string, number>> = {};
  const allTypes = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
  ];
  for (const atk of allTypes) {
    const row: Record<string, number> = {};
    typeChart[atk] = row;
    for (const def of allTypes) {
      row[def] = 1;
    }
  }

  dm.loadFromObjects({
    pokemon: [species, blastoise],
    moves: [
      makeMove("tackle", "Tackle", "physical"),
      makeMove("thunderbolt", "Thunderbolt", "special", "electric", 90),
      makeMove("thunder-wave", "Thunder Wave", "status", "electric"),
      makeMove("swords-dance", "Swords Dance", "status"),
    ],
    typeChart: typeChart as unknown as import("@pokemon-lib-ts/core").TypeChart,
  });

  return dm;
}

/**
 * MockRuleset that supports held items (for choice lock testing).
 */
class ChoiceLockMockRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }
}

function createTauntTestEngine() {
  const ruleset = new MockRuleset();
  const dataManager = createMoveAvailabilityDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        { moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 },
        { moveId: "thunder-wave", currentPP: 20, maxPP: 20, ppUps: 0 },
        { moveId: "swords-dance", currentPP: 20, maxPP: 20, ppUps: 0 },
      ],
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

  const team2: PokemonInstance[] = [
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
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));
  return { engine, ruleset, events };
}

function createChoiceLockTestEngine() {
  const ruleset = new ChoiceLockMockRuleset();
  const dataManager = createMoveAvailabilityDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      heldItem: "choice-band",
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 },
        { moveId: "thunderbolt", currentPP: 15, maxPP: 15, ppUps: 0 },
        { moveId: "thunder-wave", currentPP: 20, maxPP: 20, ppUps: 0 },
        { moveId: "swords-dance", currentPP: 20, maxPP: 20, ppUps: 0 },
      ],
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

  const team2: PokemonInstance[] = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      heldItem: null,
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

  const config: BattleConfig = {
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));
  return { engine, ruleset, events };
}

describe("Taunt move availability", () => {
  it("given a taunted Pokemon with status moves, when checking available moves, then status moves are disabled with reason 'Blocked by Taunt'", () => {
    // Source: Bulbapedia — "Taunt prevents the target from using status moves"
    // Arrange
    const { engine } = createTauntTestEngine();
    engine.start();

    // Apply taunt to side 0's Charizard
    const active0 = engine.getActive(0);
    active0!.volatileStatuses.set("taunt", { turnsLeft: 3 });

    // Act
    const moves = engine.getAvailableMoves(0);

    // Assert — tackle (physical) and thunderbolt (special) should be enabled
    const tackle = moves.find((m) => m.moveId === "tackle");
    expect(tackle!.disabled).toBe(false);

    const thunderbolt = moves.find((m) => m.moveId === "thunderbolt");
    expect(thunderbolt!.disabled).toBe(false);

    // thunder-wave (status) and swords-dance (status) should be disabled
    const thunderWave = moves.find((m) => m.moveId === "thunder-wave");
    expect(thunderWave!.disabled).toBe(true);
    expect(thunderWave!.disabledReason).toBe("Blocked by Taunt");

    const swordsDance = moves.find((m) => m.moveId === "swords-dance");
    expect(swordsDance!.disabled).toBe(true);
    expect(swordsDance!.disabledReason).toBe("Blocked by Taunt");
  });

  it("given a Pokemon without taunt, when checking available moves, then all moves with PP are enabled", () => {
    // Arrange
    const { engine } = createTauntTestEngine();
    engine.start();

    // No taunt applied

    // Act
    const moves = engine.getAvailableMoves(0);

    // Assert — all 4 moves should be enabled
    for (const move of moves) {
      expect(move.disabled).toBe(false);
    }
  });
});

describe("Choice lock move availability", () => {
  it("given a choice-locked Pokemon, when checking available moves, then only the locked move is enabled", () => {
    // Source: Bulbapedia — "Choice Band boosts the holder's Attack by 50%,
    // but only allows the use of the first move selected."
    // Arrange
    const { engine } = createChoiceLockTestEngine();
    engine.start();

    // Simulate using tackle (which sets choice-locked via the engine's executeMove)
    // We set it manually for this unit test
    const active0 = engine.getActive(0);
    active0!.volatileStatuses.set("choice-locked", {
      turnsLeft: -1,
      data: { moveId: "tackle" },
    });

    // Act
    const moves = engine.getAvailableMoves(0);

    // Assert — only tackle should be enabled
    const tackle = moves.find((m) => m.moveId === "tackle");
    expect(tackle!.disabled).toBe(false);

    const thunderbolt = moves.find((m) => m.moveId === "thunderbolt");
    expect(thunderbolt!.disabled).toBe(true);
    expect(thunderbolt!.disabledReason).toBe("Locked by Choice item");

    const thunderWave = moves.find((m) => m.moveId === "thunder-wave");
    expect(thunderWave!.disabled).toBe(true);
    expect(thunderWave!.disabledReason).toBe("Locked by Choice item");

    const swordsDance = moves.find((m) => m.moveId === "swords-dance");
    expect(swordsDance!.disabled).toBe(true);
    expect(swordsDance!.disabledReason).toBe("Locked by Choice item");
  });

  it("given a Pokemon holding Choice Band that uses a move, when the move succeeds, then the choice-locked volatile is set automatically", () => {
    // Source: Bulbapedia — Choice items lock into the first move used
    // Arrange
    const { engine } = createChoiceLockTestEngine();
    engine.start();

    const active0 = engine.getActive(0);
    expect(active0!.volatileStatuses.has("choice-locked")).toBe(false);

    // Act — use tackle
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — choice-locked should be set on side 0
    const updatedActive0 = engine.getActive(0);
    expect(updatedActive0!.volatileStatuses.has("choice-locked")).toBe(true);
    const choiceData = updatedActive0!.volatileStatuses.get("choice-locked");
    expect(choiceData!.data!.moveId).toBe("tackle");
  });
});
