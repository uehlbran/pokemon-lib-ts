import { describe, expect, it } from "vitest";
import { GEN2_ITEM_IDS } from "../../../../gen2/src";
import { createGen8DataManager, GEN8_SPECIES_IDS } from "../../../../gen8/src";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  NATURES_BY_ID,
} from "../../../src";
import type { Learnset, PokemonSpeciesData } from "../../../src/entities/species";
import {
  createMoveSlot,
  createPokemonInstance,
  determineGender,
  getDefaultMoves,
} from "../../../src/logic/pokemon-factory";
import { SeededRandom } from "../../../src/prng/seeded-random";

function makeScriptedRng(script: {
  ints?: number[];
  picks?: string[];
  chances?: boolean[];
}): SeededRandom {
  let intIndex = 0;
  let pickIndex = 0;
  let chanceIndex = 0;

  return {
    next(): number {
      throw new Error("This test double should use scripted int/pick/chance calls only.");
    },
    int(min: number, max: number): number {
      const value = script.ints?.[intIndex++];
      if (value === undefined) {
        throw new Error(`Missing scripted int for range [${min}, ${max}]`);
      }
      if (value < min || value > max) {
        throw new Error(`Scripted int ${value} is outside range [${min}, ${max}]`);
      }
      return value;
    },
    chance(_probability: number): boolean {
      const value = script.chances?.[chanceIndex++];
      if (value === undefined) {
        throw new Error("Missing scripted chance value");
      }
      return value;
    },
    pick<T>(array: readonly T[]): T {
      const value = script.picks?.[pickIndex++] as T | undefined;
      if (value === undefined) {
        throw new Error("Missing scripted pick value");
      }
      if (!array.includes(value)) {
        throw new Error(`Scripted pick ${String(value)} is not in the provided array`);
      }
      return value;
    },
    shuffle<T>(array: readonly T[]): T[] {
      return [...array];
    },
    getState(): number {
      return 0;
    },
    setState(_state: number): void {},
  } as SeededRandom;
}

// --- Mock Species Data ---

const dataManager = createGen8DataManager();
const canonicalCharizardSpecies = dataManager.getSpecies(GEN8_SPECIES_IDS.charizard);
const syntheticLevelUpLearnset: Learnset = {
  levelUp: [
    { level: 1, move: CORE_MOVE_IDS.growl },
    { level: 1, move: CORE_MOVE_IDS.tackle },
    { level: 7, move: CORE_MOVE_IDS.surf },
    { level: 10, move: CORE_MOVE_IDS.flamethrower },
    { level: 17, move: CORE_MOVE_IDS.thunderbolt },
    { level: 21, move: CORE_MOVE_IDS.swift },
  ],
  tm: [],
  egg: [],
  tutor: [],
};

function createSyntheticSpeciesData(overrides?: Partial<PokemonSpeciesData>): PokemonSpeciesData {
  return {
    ...canonicalCharizardSpecies,
    learnset: syntheticLevelUpLearnset,
    ...overrides,
  };
}

function getNatureById(natureId: string) {
  const nature = NATURES_BY_ID.get(natureId);
  if (!nature) {
    throw new Error(`Missing canonical nature for id ${natureId}`);
  }
  return nature;
}

function createSpeciesWithGenderRatio(genderRatio: number): PokemonSpeciesData {
  return createSyntheticSpeciesData({ genderRatio });
}

function createSpeciesWithAbilities(
  abilities: PokemonSpeciesData["abilities"],
): PokemonSpeciesData {
  return createSyntheticSpeciesData({ abilities });
}

function createSpeciesWithTypes(types: PokemonSpeciesData["types"]): PokemonSpeciesData {
  return createSyntheticSpeciesData({ types });
}

const ADAMANT_NATURE = getNatureById(CORE_NATURE_IDS.adamant);
const BOLD_NATURE = getNatureById(CORE_NATURE_IDS.bold);
const HARDY_NATURE = getNatureById(CORE_NATURE_IDS.hardy);
const TIMID_NATURE = getNatureById(CORE_NATURE_IDS.timid);
const DUAL_NORMAL_ABILITY_SET = {
  normal: [CORE_ABILITY_IDS.intimidate, CORE_ABILITY_IDS.static],
  hidden: CORE_ABILITY_IDS.moldBreaker,
} as const;
const NO_HIDDEN_ABILITY_SET = {
  normal: [CORE_ABILITY_IDS.blaze],
  hidden: null,
} as const;
const SINGLE_NORMAL_ABILITY_SET = {
  normal: [CORE_ABILITY_IDS.blaze],
  hidden: CORE_ABILITY_IDS.solarPower,
} as const;

// --- determineGender ---

describe("determineGender", () => {
  it("given genderRatio of -1, when called, then returns genderless", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const gender = determineGender(-1, rng);

    // Assert
    expect(gender).toBe(CORE_GENDERS.genderless);
  });

  it("given genderRatio of 100, when called, then returns male", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const gender = determineGender(100, rng);

    // Assert
    expect(gender).toBe(CORE_GENDERS.male);
  });

  it("given genderRatio of 0, when called, then returns female", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const gender = determineGender(0, rng);

    // Assert
    expect(gender).toBe(CORE_GENDERS.female);
  });

  it("given mixed genderRatio (87.5), when the roll is at the male threshold, then returns male", () => {
    // Derived from determineGender: male iff rng.int(1, 100) <= genderRatio.
    const rng = makeScriptedRng({ ints: [87] });

    const gender = determineGender(87.5, rng);

    expect(gender).toBe(CORE_GENDERS.male);
  });

  it("given mixed genderRatio (87.5), when the roll is above the male threshold, then returns female", () => {
    // Derived from determineGender: male iff rng.int(1, 100) <= genderRatio.
    const rng = makeScriptedRng({ ints: [88] });

    const gender = determineGender(87.5, rng);

    expect(gender).toBe(CORE_GENDERS.female);
  });
});

// --- getDefaultMoves ---

describe("getDefaultMoves", () => {
  const learnset: Learnset = {
    levelUp: [
      { level: 1, move: CORE_MOVE_IDS.growl },
      { level: 1, move: CORE_MOVE_IDS.tackle },
      { level: 7, move: CORE_MOVE_IDS.surf },
      { level: 10, move: CORE_MOVE_IDS.flamethrower },
      { level: 17, move: CORE_MOVE_IDS.thunderbolt },
      { level: 21, move: CORE_MOVE_IDS.swift },
    ],
    tm: [],
    egg: [],
    tutor: [],
  };

  it("given a learnset and level 50, when called, then returns the latest 4 level-up moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 50);

    // Assert
    expect(moves).toHaveLength(4);
    expect(moves[0]?.moveId).toBe(CORE_MOVE_IDS.swift);
    expect(moves[1]?.moveId).toBe(CORE_MOVE_IDS.thunderbolt);
    expect(moves[2]?.moveId).toBe(CORE_MOVE_IDS.flamethrower);
    expect(moves[3]?.moveId).toBe(CORE_MOVE_IDS.surf);
  });

  it("given a learnset and level 7, when called, then returns only 3 eligible moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 7);

    // Assert
    expect(moves).toHaveLength(3);
    expect(moves[0]?.moveId).toBe(CORE_MOVE_IDS.surf);
    expect(moves[1]?.moveId).toBe(CORE_MOVE_IDS.tackle);
    expect(moves[2]?.moveId).toBe(CORE_MOVE_IDS.growl);
  });

  it("given a learnset and level 1, when called, then returns only level-1 moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 1);

    // Assert
    expect(moves).toHaveLength(2);
    expect(moves[0]?.moveId).toBe(CORE_MOVE_IDS.tackle);
    expect(moves[1]?.moveId).toBe(CORE_MOVE_IDS.growl);
  });

  it("given a learnset with many moves and a high level, when called, then caps at 4 moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 100);

    // Assert
    expect(moves).toHaveLength(4);
  });

  it("given an empty learnset, when called, then returns empty array", () => {
    // Arrange
    const emptyLearnset: Learnset = { levelUp: [], tm: [], egg: [], tutor: [] };

    // Act
    const moves = getDefaultMoves(emptyLearnset, 50);

    // Assert
    expect(moves).toHaveLength(0);
  });

  it("given a level below any move's level, when called, then returns empty array", () => {
    // Arrange
    const highLevelLearnset: Learnset = {
      levelUp: [{ level: 10, move: CORE_MOVE_IDS.flamethrower }],
      tm: [],
      egg: [],
      tutor: [],
    };

    // Act
    const moves = getDefaultMoves(highLevelLearnset, 5);

    // Assert
    expect(moves).toHaveLength(0);
  });
});

// --- createMoveSlot ---

describe("createMoveSlot", () => {
  it("given a moveId with no PP, when called, then creates a slot with 0 PP", () => {
    // Arrange / Act
    const slot = createMoveSlot(CORE_MOVE_IDS.flamethrower);

    // Assert
    expect(slot.moveId).toBe(CORE_MOVE_IDS.flamethrower);
    expect(slot.currentPP).toBe(0);
    expect(slot.maxPP).toBe(0);
    expect(slot.ppUps).toBe(0);
  });

  it("given a moveId with PP specified, when called, then creates a slot with full PP", () => {
    // Arrange / Act
    const slot = createMoveSlot(CORE_MOVE_IDS.flamethrower, 15);

    // Assert
    // Source: Flamethrower's canonical PP is 15 in the game data.
    expect(slot.moveId).toBe(CORE_MOVE_IDS.flamethrower);
    expect(slot.currentPP).toBe(15);
    expect(slot.maxPP).toBe(15);
    expect(slot.ppUps).toBe(0);
  });

  it("given a moveId with PP and 3 ppUps, when called, then increases max PP by 60%", () => {
    // Arrange / Act
    const slot = createMoveSlot(CORE_MOVE_IDS.flamethrower, 15, 3);

    // Assert
    // maxPP = floor(15 * (1 + 0.2 * 3)) = floor(15 * 1.6) = floor(24) = 24
    expect(slot.maxPP).toBe(24);
    expect(slot.currentPP).toBe(24);
    expect(slot.ppUps).toBe(3);
  });

  it("given a moveId with PP and 1 ppUp, when called, then increases max PP by 20%", () => {
    // Arrange / Act
    const slot = createMoveSlot(CORE_MOVE_IDS.tackle, 35, 1);

    // Assert
    // maxPP = floor(35 * (1 + 0.2 * 1)) = floor(35 * 1.2) = floor(42) = 42
    expect(slot.maxPP).toBe(42);
    expect(slot.currentPP).toBe(42);
    expect(slot.ppUps).toBe(1);
  });

  it("given a move with PP that produces a fractional bonus, when called, then applies floor truncation", () => {
    // Arrange / Act
    const slot = createMoveSlot(CORE_MOVE_IDS.surf, 7, 1);

    // Assert
    // Derived from createMoveSlot: floor(7 * (1 + 0.2 * 1)) = floor(8.4) = 8.
    expect(slot.maxPP).toBe(8);
    expect(slot.currentPP).toBe(8);
  });
});

// --- createPokemonInstance ---

describe("createPokemonInstance", () => {
  it("given a species and scripted defaults, when called, then creates the exact default instance fields", () => {
    const species = createSyntheticSpeciesData();
    const rng = makeScriptedRng({
      // Source: createPokemonInstance rolls six IVs, then determineGender, then generateUid twice.
      ints: [31, 0, 15, 20, 25, 30, 87, 0x12345678, 0x9abcdef0],
      picks: [ADAMANT_NATURE.id],
      chances: [false],
    });

    const instance = createPokemonInstance(species, 50, rng);

    // Derived from determineGender: male iff rng.int(1, 100) <= genderRatio.
    // Derived from generateUid: concatenates two zero-padded 32-bit hex values.
    expect(instance.speciesId).toBe(canonicalCharizardSpecies.id);
    expect(instance.level).toBe(50);
    expect(instance.experience).toBe(0);
    expect(instance.currentHp).toBe(0);
    expect(instance.status).toBeNull();
    expect(instance.nickname).toBeNull();
    expect(instance.heldItem).toBeNull();
    expect(instance.metLevel).toBe(50);
    expect(instance.metLocation).toBe("unknown");
    expect(instance.originalTrainer).toBe("Player");
    expect(instance.originalTrainerId).toBe(0);
    expect(instance.pokeball).toBe(GEN2_ITEM_IDS.pokeBall);
    expect(instance.friendship).toBe(canonicalCharizardSpecies.baseFriendship);
    expect(instance.uid).toBe("123456789abcdef0");
    expect(instance.nature).toBe(ADAMANT_NATURE.id);
    expect(instance.gender).toBe(CORE_GENDERS.male);
    expect(instance.ability).toBe(CORE_ABILITY_IDS.blaze);
    expect(instance.abilitySlot).toBe(CORE_ABILITY_SLOTS.normal1);
    expect(instance.isShiny).toBe(false);
    expect(instance.ivs).toEqual({
      hp: 31,
      attack: 0,
      defense: 15,
      spAttack: 20,
      spDefense: 25,
      speed: 30,
    });
  });

  it("given a species and scripted IV rolls, when called with default IVs, then uses those exact IVs", () => {
    const species = createSyntheticSpeciesData();
    const rng = makeScriptedRng({
      ints: [5, 10, 15, 20, 25, 30, 40, 0, 1],
      picks: [BOLD_NATURE.id],
      chances: [false],
    });

    const instance = createPokemonInstance(species, 50, rng);

    expect(instance.ivs).toEqual({
      hp: 5,
      attack: 10,
      defense: 15,
      spAttack: 20,
      spDefense: 25,
      speed: 30,
    });
  });

  it("given a species and a scripted nature pick, when called, then uses that exact nature", () => {
    const species = createSyntheticSpeciesData();
    const rng = makeScriptedRng({
      ints: [0, 0, 0, 0, 0, 0, 87, 0, 1],
      picks: [TIMID_NATURE.id],
      chances: [false],
    });

    const instance = createPokemonInstance(species, 50, rng);

    expect(instance.nature).toBe(TIMID_NATURE.id);
  });

  it("given a species with 87.5% male ratio and a scripted female roll, when called, then returns female", () => {
    const species = createSpeciesWithGenderRatio(87.5);
    const rng = makeScriptedRng({
      ints: [0, 0, 0, 0, 0, 0, 88, 0, 1],
      picks: [HARDY_NATURE.id],
      chances: [false],
    });

    const instance = createPokemonInstance(species, 50, rng);

    expect(instance.gender).toBe(CORE_GENDERS.female);
  });

  it("given a genderless species, when called, then returns genderless", () => {
    // Arrange
    const species = createSpeciesWithGenderRatio(-1);
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng);

    // Assert
    expect(instance.gender).toBe(CORE_GENDERS.genderless);
  });

  it("given a species, when called with default ability, then selects a valid ability", () => {
    // Arrange
    const species = createSyntheticSpeciesData();
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng);

    // Assert
    expect(instance.ability).toBe(CORE_ABILITY_IDS.blaze); // Only one normal ability
    expect(instance.abilitySlot).toBe(CORE_ABILITY_SLOTS.normal1);
  });

  it("given a species with two normal abilities and a true ability roll, when called, then selects normal1", () => {
    const species = createSpeciesWithAbilities(DUAL_NORMAL_ABILITY_SET);
    const rng = makeScriptedRng({
      ints: [0, 0, 0, 0, 0, 0, 50, 0, 1],
      picks: [HARDY_NATURE.id],
      chances: [true, false],
    });

    const instance = createPokemonInstance(species, 50, rng);

    expect(instance.abilitySlot).toBe(CORE_ABILITY_SLOTS.normal1);
    expect(instance.ability).toBe(CORE_ABILITY_IDS.intimidate);
  });

  it("given a species and a false shiny roll, when called with default shiny odds, then is not shiny", () => {
    const species = createSyntheticSpeciesData();
    const rng = makeScriptedRng({
      ints: [0, 0, 0, 0, 0, 0, 50, 0, 1],
      picks: [HARDY_NATURE.id],
      // Source: createPokemonInstance uses rng.chance(1 / 4096) for default shiny odds.
      chances: [false],
    });

    const instance = createPokemonInstance(species, 50, rng);

    expect(instance.isShiny).toBe(false);
  });

  it("given a species and a true shiny roll, when called with default shiny odds, then is shiny", () => {
    const species = createSyntheticSpeciesData();
    const rng = makeScriptedRng({
      ints: [0, 0, 0, 0, 0, 0, 50, 0, 1],
      picks: [HARDY_NATURE.id],
      // Source: createPokemonInstance uses rng.chance(1 / 4096) for default shiny odds.
      chances: [true],
    });

    const instance = createPokemonInstance(species, 50, rng);

    expect(instance.isShiny).toBe(true);
  });

  it("given a species, when called with default moves, then uses latest 4 level-up moves", () => {
    // Arrange
    const species = createSyntheticSpeciesData();
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 36, rng);

    // Assert - level 36: eligible moves up to 36 are swift(21), thunderbolt(17), flamethrower(10), surf(7)
    expect(instance.moves).toHaveLength(4);
    expect(instance.moves[0]?.moveId).toBe(CORE_MOVE_IDS.swift);
    expect(instance.moves[1]?.moveId).toBe(CORE_MOVE_IDS.thunderbolt);
    expect(instance.moves[2]?.moveId).toBe(CORE_MOVE_IDS.flamethrower);
    expect(instance.moves[3]?.moveId).toBe(CORE_MOVE_IDS.surf);
  });

  it("given a species, when called with default EVs, then all EVs are 0", () => {
    // Arrange
    const species = createSyntheticSpeciesData();
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng);

    // Assert
    const stats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const;
    for (const stat of stats) {
      expect(instance.evs[stat]).toBe(0);
    }
  });

  it("given a species, when called with option overrides, then uses the provided values", () => {
    // Arrange
    const species = createSyntheticSpeciesData();
    const rng = new SeededRandom(42);
    const customIvs = { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 };
    const customEvs = { hp: 252, attack: 0, defense: 0, spAttack: 252, spDefense: 4, speed: 0 };
    const customMetLocation = species.spriteKey;

    // Act
    const instance = createPokemonInstance(species, 100, rng, {
      nature: ADAMANT_NATURE.id,
      ivs: customIvs,
      evs: customEvs,
      gender: CORE_GENDERS.female,
      isShiny: true,
      nickname: "Flame",
      moves: [
        CORE_MOVE_IDS.flamethrower,
        CORE_MOVE_IDS.surf,
        CORE_MOVE_IDS.thunderbolt,
        CORE_MOVE_IDS.swift,
      ],
      heldItem: CORE_ITEM_IDS.leftovers,
      friendship: 255,
      metLocation: customMetLocation,
      originalTrainer: "Ash",
      originalTrainerId: 54321,
      pokeball: GEN2_ITEM_IDS.ultraBall,
      abilitySlot: CORE_ABILITY_SLOTS.hidden,
      teraType: CORE_TYPE_IDS.dragon,
      dynamaxLevel: 10,
    });

    // Assert
    expect(instance.nature).toBe(ADAMANT_NATURE.id);
    expect(instance.ivs).toEqual(customIvs);
    expect(instance.evs).toEqual(customEvs);
    expect(instance.gender).toBe(CORE_GENDERS.female);
    expect(instance.isShiny).toBe(true);
    expect(instance.nickname).toBe("Flame");
    expect(instance.moves).toHaveLength(4);
    expect(instance.moves[0]?.moveId).toBe(CORE_MOVE_IDS.flamethrower);
    expect(instance.moves[1]?.moveId).toBe(CORE_MOVE_IDS.surf);
    expect(instance.moves[2]?.moveId).toBe(CORE_MOVE_IDS.thunderbolt);
    expect(instance.moves[3]?.moveId).toBe(CORE_MOVE_IDS.swift);
    expect(instance.heldItem).toBe(CORE_ITEM_IDS.leftovers);
    expect(instance.friendship).toBe(255); // Source: friendship override is provided explicitly in the options above.
    expect(instance.metLocation).toBe(customMetLocation);
    expect(instance.originalTrainer).toBe("Ash");
    expect(instance.originalTrainerId).toBe(54321); // Source: trainer ID override is provided explicitly in the options above.
    expect(instance.pokeball).toBe(GEN2_ITEM_IDS.ultraBall);
    expect(instance.ability).toBe(CORE_ABILITY_IDS.solarPower); // hidden ability
    expect(instance.abilitySlot).toBe(CORE_ABILITY_SLOTS.hidden);
    expect(instance.teraType).toBe(CORE_TYPE_IDS.dragon);
    expect(instance.dynamaxLevel).toBe(10); // Source: Dynamax Level override is provided explicitly in the options above.
  });

  it("given the same seed, when called twice, then produces identical instances", () => {
    // Arrange
    const species = createSyntheticSpeciesData();
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    // Act
    const instance1 = createPokemonInstance(species, 50, rng1);
    const instance2 = createPokemonInstance(species, 50, rng2);

    // Assert
    expect(instance1).toEqual(instance2);
  });

  it("given a species with no hidden ability, when abilitySlot is hidden, then falls back to normal1", () => {
    // Arrange
    const species = createSpeciesWithAbilities(NO_HIDDEN_ABILITY_SET);
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng, {
      abilitySlot: CORE_ABILITY_SLOTS.hidden,
    });

    // Assert
    expect(instance.ability).toBe(CORE_ABILITY_IDS.blaze);
  });

  it("given a species with one normal ability, when abilitySlot is normal2, then falls back to normal1", () => {
    // Arrange
    const species = createSpeciesWithAbilities(SINGLE_NORMAL_ABILITY_SET);
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });

    // Assert
    expect(instance.ability).toBe(CORE_ABILITY_IDS.blaze);
  });

  it("given a species with two normal abilities, when abilitySlot is normal2, then uses the second normal ability", () => {
    const species = createSpeciesWithAbilities(DUAL_NORMAL_ABILITY_SET);
    const rng = new SeededRandom(42);

    const instance = createPokemonInstance(species, 50, rng, {
      abilitySlot: CORE_ABILITY_SLOTS.normal2,
    });

    // Derived from getAbilityForSlot: normal2 maps to abilities.normal[1] when present.
    expect(instance.abilitySlot).toBe(CORE_ABILITY_SLOTS.normal2);
    expect(instance.ability).toBe(CORE_ABILITY_IDS.static);
  });

  it("given a species, when called with default teraType, then uses first species type", () => {
    // Arrange
    const species = createSpeciesWithTypes(canonicalCharizardSpecies.types);
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng);

    // Assert
    expect(instance.teraType).toBe(CORE_TYPE_IDS.fire);
  });

  it("given a species, when called with default dynamaxLevel, then is 0", () => {
    // Arrange
    const species = createSyntheticSpeciesData();
    const rng = new SeededRandom(42);

    // Act
    const instance = createPokemonInstance(species, 50, rng);

    // Assert
    expect(instance.dynamaxLevel).toBe(0);
  });
});
