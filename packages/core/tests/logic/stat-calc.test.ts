import { describe, expect, it } from "vitest";
import type { NatureData } from "../../src/entities/nature";
import type { PokemonInstance } from "../../src/entities/pokemon";
import type { PokemonSpeciesData } from "../../src/entities/species";
import type { StatBlock } from "../../src/entities/stats";
import {
  calculateAllStats,
  calculateHp,
  calculateStat,
  getNatureModifier,
} from "../../src/logic/stat-calc";

// --- Test Nature Data ---
const TIMID: NatureData = {
  id: "timid",
  displayName: "Timid",
  increased: "speed",
  decreased: "attack",
  likedFlavor: "sweet",
  dislikedFlavor: "spicy",
};

const JOLLY: NatureData = {
  id: "jolly",
  displayName: "Jolly",
  increased: "speed",
  decreased: "spAttack",
  likedFlavor: "sweet",
  dislikedFlavor: "dry",
};

const HARDY: NatureData = {
  id: "hardy",
  displayName: "Hardy",
  increased: null,
  decreased: null,
  likedFlavor: null,
  dislikedFlavor: null,
};

// --- Helper: create partial PokemonInstance for stat calc ---
function makeInstance(
  level: number,
  ivs: StatBlock,
  evs: StatBlock,
  nature: string,
): PokemonInstance {
  return {
    uid: "test",
    speciesId: 6,
    nickname: null,
    level,
    experience: 0,
    nature: nature as PokemonInstance["nature"],
    ivs,
    evs: { ...evs },
    currentHp: 0,
    moves: [],
    ability: "blaze",
    abilitySlot: "normal1",
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male",
    isShiny: false,
    metLocation: "unknown",
    metLevel: level,
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: "poke-ball",
  };
}

const ALL_31_IVS: StatBlock = {
  hp: 31,
  attack: 31,
  defense: 31,
  spAttack: 31,
  spDefense: 31,
  speed: 31,
};

describe("calculateHp", () => {
  it("should calculate L50 Charizard HP correctly (base 78, 31 IV, 0 EV)", () => {
    expect(calculateHp(78, 31, 0, 50)).toBe(153);
  });

  it("should calculate L100 Charizard HP correctly (base 78, 31 IV, 0 EV)", () => {
    expect(calculateHp(78, 31, 0, 100)).toBe(297);
  });

  it("should return 1 for Shedinja (base HP = 1) regardless of IVs/EVs/level", () => {
    expect(calculateHp(1, 31, 252, 50)).toBe(1);
    expect(calculateHp(1, 31, 252, 100)).toBe(1);
    expect(calculateHp(1, 0, 0, 1)).toBe(1);
  });

  it("should calculate L50 Pikachu HP correctly (base 35, 31 IV, 252 EV)", () => {
    expect(calculateHp(35, 31, 252, 50)).toBe(142);
  });

  it("should handle minimum values (0 IV, 0 EV, L1)", () => {
    // Source: pret/pokeemerald src/pokemon.c — HP formula:
    // floor((2 * base + IV + floor(EV/4)) * level / 100) + level + 10
    // Charizard (base HP=78), 0 IV, 0 EV, L1:
    // floor((156 + 0 + 0) * 1 / 100) + 1 + 10 = floor(1.56) + 11 = 1 + 11 = 12
    expect(calculateHp(78, 0, 0, 1)).toBe(12);
  });

  it("should calculate L50 Blissey HP correctly (base 255, 31 IV, 0 EV)", () => {
    // Source: pret/pokeemerald src/pokemon.c — HP formula:
    // floor((2 * base + IV + floor(EV/4)) * level / 100) + level + 10
    // Blissey (base HP=255), 31 IV, 0 EV, L50:
    // floor((510 + 31 + 0) * 50 / 100) + 50 + 10 = floor(27050/100) + 60 = 270 + 60 = 330
    expect(calculateHp(255, 31, 0, 50)).toBe(330);
  });

  it("should calculate L100 Blissey HP correctly (base 255, 31 IV, 0 EV)", () => {
    // Source: pret/pokeemerald src/pokemon.c — HP formula:
    // floor((2 * base + IV + floor(EV/4)) * level / 100) + level + 10
    // Blissey (base HP=255), 31 IV, 0 EV, L100:
    // floor((510 + 31 + 0) * 100 / 100) + 100 + 10 = floor(54100/100) + 110 = 541 + 110 = 651
    expect(calculateHp(255, 31, 0, 100)).toBe(651);
  });
});

describe("calculateStat", () => {
  it("should calculate L50 Charizard Attack with Timid (-Atk)", () => {
    // base 84, IV 31, EV 0, nature 0.9
    // floor((floor(((168+31)*50)/100)+5)*0.9) = floor(104*0.9) = floor(93.6) = 93
    expect(calculateStat(84, 31, 0, 50, 0.9)).toBe(93);
  });

  it("should calculate L50 Charizard Defense (neutral nature)", () => {
    expect(calculateStat(78, 31, 0, 50, 1.0)).toBe(98);
  });

  it("should calculate L50 Charizard SpAtk with 252 EVs (neutral nature)", () => {
    expect(calculateStat(109, 31, 252, 50, 1.0)).toBe(161);
  });

  it("should calculate L50 Charizard SpDef with 4 EVs (neutral nature)", () => {
    expect(calculateStat(85, 31, 4, 50, 1.0)).toBe(106);
  });

  it("should calculate L50 Charizard Speed with Timid (+Spe) and 252 EVs", () => {
    // floor((floor(((200+31+63)*50)/100)+5)*1.1) = floor(152*1.1) = floor(167.2) = 167
    expect(calculateStat(100, 31, 252, 50, 1.1)).toBe(167);
  });

  it("should calculate L100 Charizard Attack with Timid (-Atk)", () => {
    // floor((floor(((168+31)*100)/100)+5)*0.9) = floor(204*0.9) = floor(183.6) = 183
    expect(calculateStat(84, 31, 0, 100, 0.9)).toBe(183);
  });

  it("should calculate L100 Charizard Defense (neutral)", () => {
    expect(calculateStat(78, 31, 0, 100, 1.0)).toBe(192);
  });

  it("should calculate L100 Charizard SpAtk with 252 EVs (neutral)", () => {
    expect(calculateStat(109, 31, 252, 100, 1.0)).toBe(317);
  });

  it("should calculate L100 Charizard SpDef with 4 EVs (neutral)", () => {
    expect(calculateStat(85, 31, 4, 100, 1.0)).toBe(207);
  });

  it("should calculate L100 Charizard Speed with Timid (+Spe) and 252 EVs", () => {
    // floor((floor(((200+31+63)*100)/100)+5)*1.1) = floor(299*1.1) = floor(328.9) = 328
    expect(calculateStat(100, 31, 252, 100, 1.1)).toBe(328);
  });

  it("should calculate L50 Pikachu Attack with Jolly (neutral for Atk)", () => {
    // Jolly: +Spe, -SpA. So attack is neutral (1.0).
    // Pikachu base Atk: 55, IV 31, EV 0
    expect(calculateStat(55, 31, 0, 50, 1.0)).toBe(75);
  });

  it("should calculate L50 Pikachu Speed with Jolly (+Spe) and 252 EVs", () => {
    expect(calculateStat(90, 31, 252, 50, 1.1)).toBe(156);
  });
});

describe("getNatureModifier", () => {
  it("should return 1.1 for boosted stat", () => {
    expect(getNatureModifier(TIMID, "speed")).toBe(1.1);
  });

  it("should return 0.9 for hindered stat", () => {
    expect(getNatureModifier(TIMID, "attack")).toBe(0.9);
  });

  it("should return 1.0 for neutral stats", () => {
    expect(getNatureModifier(TIMID, "defense")).toBe(1.0);
    expect(getNatureModifier(TIMID, "spAttack")).toBe(1.0);
    expect(getNatureModifier(TIMID, "spDefense")).toBe(1.0);
  });

  it("should return 1.0 for all stats with a neutral nature", () => {
    expect(getNatureModifier(HARDY, "attack")).toBe(1.0);
    expect(getNatureModifier(HARDY, "defense")).toBe(1.0);
    expect(getNatureModifier(HARDY, "spAttack")).toBe(1.0);
    expect(getNatureModifier(HARDY, "spDefense")).toBe(1.0);
    expect(getNatureModifier(HARDY, "speed")).toBe(1.0);
  });
});

describe("calculateAllStats", () => {
  // Charizard base stats — using modern (Gen 3+) values for formula testing.
  // Note: Gen 1 uses a unified Special stat (109/109). These split values
  // (spAttack: 109, spDefense: 85) are correct for the generation-agnostic formula.
  const charizardSpecies = {
    baseStats: {
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 109,
      spDefense: 85,
      speed: 100,
    },
  } as PokemonSpeciesData;

  it("should calculate all stats for L50 Timid Charizard (0/0/0/252/4/252 EVs)", () => {
    const pokemon = makeInstance(
      50,
      ALL_31_IVS,
      { hp: 0, attack: 0, defense: 0, spAttack: 252, spDefense: 4, speed: 252 },
      "timid",
    );

    const stats = calculateAllStats(pokemon, charizardSpecies, TIMID);

    expect(stats.hp).toBe(153);
    expect(stats.attack).toBe(93); // Timid: -Atk (0.9)
    expect(stats.defense).toBe(98);
    expect(stats.spAttack).toBe(161);
    expect(stats.spDefense).toBe(106);
    expect(stats.speed).toBe(167); // Timid: +Spe (1.1)
  });

  it("should calculate all stats for L100 Timid Charizard (0/0/0/252/4/252 EVs)", () => {
    const pokemon = makeInstance(
      100,
      ALL_31_IVS,
      { hp: 0, attack: 0, defense: 0, spAttack: 252, spDefense: 4, speed: 252 },
      "timid",
    );

    const stats = calculateAllStats(pokemon, charizardSpecies, TIMID);

    expect(stats.hp).toBe(297);
    expect(stats.attack).toBe(183); // Timid: -Atk (0.9)
    expect(stats.defense).toBe(192);
    expect(stats.spAttack).toBe(317);
    expect(stats.spDefense).toBe(207);
    expect(stats.speed).toBe(328); // Timid: +Spe (1.1)
  });

  it("should calculate L50 Jolly Pikachu (252/0/0/0/0/252 EVs)", () => {
    const pikachuSpecies = {
      baseStats: {
        hp: 35,
        attack: 55,
        defense: 40,
        spAttack: 50,
        spDefense: 50,
        speed: 90,
      },
    } as PokemonSpeciesData;

    const pokemon = makeInstance(
      50,
      ALL_31_IVS,
      { hp: 252, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 252 },
      "jolly",
    );

    const stats = calculateAllStats(pokemon, pikachuSpecies, JOLLY);

    expect(stats.hp).toBe(142);
    expect(stats.attack).toBe(75);
    expect(stats.defense).toBe(60);
    expect(stats.spAttack).toBe(63); // Jolly: -SpA (0.9)
    expect(stats.spDefense).toBe(70);
    expect(stats.speed).toBe(156);
  });
});
