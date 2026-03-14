import { describe, expect, it } from "vitest"
import type { Learnset, PokemonSpeciesData } from "../../src/entities/species"
import { SeededRandom } from "../../src/prng/seeded-random"
import {
  createMoveSlot,
  createPokemonInstance,
  determineGender,
  getDefaultMoves,
} from "../../src/logic/pokemon-factory"

// --- Mock Species Data ---

function makeMockSpecies(overrides?: Partial<PokemonSpeciesData>): PokemonSpeciesData {
  return {
    id: 6,
    name: "charizard",
    displayName: "Charizard",
    types: ["fire", "flying"],
    baseStats: {
      hp: 78,
      attack: 84,
      defense: 78,
      spAttack: 109,
      spDefense: 85,
      speed: 100,
    },
    abilities: {
      normal: ["blaze"],
      hidden: "solar-power",
    },
    genderRatio: 87.5,
    catchRate: 45,
    baseExp: 240,
    expGroup: "medium-slow",
    evYield: { spAttack: 3 },
    eggGroups: ["monster", "dragon"],
    learnset: {
      levelUp: [
        { level: 1, move: "scratch" },
        { level: 1, move: "growl" },
        { level: 7, move: "ember" },
        { level: 10, move: "smokescreen" },
        { level: 17, move: "dragon-rage" },
        { level: 21, move: "scary-face" },
        { level: 28, move: "fire-fang" },
        { level: 32, move: "flame-burst" },
        { level: 36, move: "slash" },
        { level: 41, move: "flamethrower" },
        { level: 47, move: "fire-spin" },
        { level: 56, move: "inferno" },
        { level: 62, move: "heat-wave" },
        { level: 71, move: "flare-blitz" },
      ],
      tm: [],
      egg: [],
      tutor: [],
    },
    evolution: null,
    dimensions: { height: 1.7, weight: 90.5 },
    spriteKey: "charizard",
    baseFriendship: 70,
    generation: 1,
    isLegendary: false,
    isMythical: false,
    ...overrides,
  }
}

// --- determineGender ---

describe("determineGender", () => {
  it("given genderRatio of -1, when called, then returns genderless", () => {
    // Arrange
    const rng = new SeededRandom(42)

    // Act
    const gender = determineGender(-1, rng)

    // Assert
    expect(gender).toBe("genderless")
  })

  it("given genderRatio of 100, when called, then returns male", () => {
    // Arrange
    const rng = new SeededRandom(42)

    // Act
    const gender = determineGender(100, rng)

    // Assert
    expect(gender).toBe("male")
  })

  it("given genderRatio of 0, when called, then returns female", () => {
    // Arrange
    const rng = new SeededRandom(42)

    // Act
    const gender = determineGender(0, rng)

    // Assert
    expect(gender).toBe("female")
  })

  it("given mixed genderRatio (87.5), when called with deterministic seed, then returns valid gender", () => {
    // Arrange
    const rng = new SeededRandom(42)

    // Act
    const gender = determineGender(87.5, rng)

    // Assert
    expect(["male", "female"]).toContain(gender)
  })

  it("given mixed genderRatio (50), when called many times, then produces both genders", () => {
    // Arrange
    const rng = new SeededRandom(12345)
    const results = new Set<string>()

    // Act
    for (let i = 0; i < 100; i++) {
      results.add(determineGender(50, rng))
    }

    // Assert
    expect(results.has("male")).toBe(true)
    expect(results.has("female")).toBe(true)
    expect(results.size).toBe(2)
  })
})

// --- getDefaultMoves ---

describe("getDefaultMoves", () => {
  const learnset: Learnset = {
    levelUp: [
      { level: 1, move: "scratch" },
      { level: 1, move: "growl" },
      { level: 7, move: "ember" },
      { level: 10, move: "smokescreen" },
      { level: 17, move: "dragon-rage" },
      { level: 21, move: "scary-face" },
      { level: 28, move: "fire-fang" },
    ],
    tm: [],
    egg: [],
    tutor: [],
  }

  it("given a learnset and level 50, when called, then returns the latest 4 level-up moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 50)

    // Assert
    expect(moves).toHaveLength(4)
    expect(moves[0]!.moveId).toBe("fire-fang")
    expect(moves[1]!.moveId).toBe("scary-face")
    expect(moves[2]!.moveId).toBe("dragon-rage")
    expect(moves[3]!.moveId).toBe("smokescreen")
  })

  it("given a learnset and level 7, when called, then returns only 3 eligible moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 7)

    // Assert
    expect(moves).toHaveLength(3)
    expect(moves[0]!.moveId).toBe("ember")
    expect(moves[1]!.moveId).toBe("growl")
    expect(moves[2]!.moveId).toBe("scratch")
  })

  it("given a learnset and level 1, when called, then returns only level-1 moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 1)

    // Assert
    expect(moves).toHaveLength(2)
    expect(moves[0]!.moveId).toBe("growl")
    expect(moves[1]!.moveId).toBe("scratch")
  })

  it("given a learnset with many moves and a high level, when called, then caps at 4 moves", () => {
    // Arrange / Act
    const moves = getDefaultMoves(learnset, 100)

    // Assert
    expect(moves).toHaveLength(4)
  })

  it("given an empty learnset, when called, then returns empty array", () => {
    // Arrange
    const emptyLearnset: Learnset = { levelUp: [], tm: [], egg: [], tutor: [] }

    // Act
    const moves = getDefaultMoves(emptyLearnset, 50)

    // Assert
    expect(moves).toHaveLength(0)
  })

  it("given a level below any move's level, when called, then returns empty array", () => {
    // Arrange
    const highLevelLearnset: Learnset = {
      levelUp: [{ level: 10, move: "ember" }],
      tm: [],
      egg: [],
      tutor: [],
    }

    // Act
    const moves = getDefaultMoves(highLevelLearnset, 5)

    // Assert
    expect(moves).toHaveLength(0)
  })
})

// --- createMoveSlot ---

describe("createMoveSlot", () => {
  it("given a moveId with no PP, when called, then creates a slot with 0 PP", () => {
    // Arrange / Act
    const slot = createMoveSlot("flamethrower")

    // Assert
    expect(slot.moveId).toBe("flamethrower")
    expect(slot.currentPP).toBe(0)
    expect(slot.maxPP).toBe(0)
    expect(slot.ppUps).toBe(0)
  })

  it("given a moveId with PP specified, when called, then creates a slot with full PP", () => {
    // Arrange / Act
    const slot = createMoveSlot("flamethrower", 15)

    // Assert
    expect(slot.moveId).toBe("flamethrower")
    expect(slot.currentPP).toBe(15)
    expect(slot.maxPP).toBe(15)
    expect(slot.ppUps).toBe(0)
  })

  it("given a moveId with PP and 3 ppUps, when called, then increases max PP by 60%", () => {
    // Arrange / Act
    const slot = createMoveSlot("flamethrower", 15, 3)

    // Assert
    // maxPP = floor(15 * (1 + 0.2 * 3)) = floor(15 * 1.6) = floor(24) = 24
    expect(slot.maxPP).toBe(24)
    expect(slot.currentPP).toBe(24)
    expect(slot.ppUps).toBe(3)
  })

  it("given a moveId with PP and 1 ppUp, when called, then increases max PP by 20%", () => {
    // Arrange / Act
    const slot = createMoveSlot("tackle", 35, 1)

    // Assert
    // maxPP = floor(35 * (1 + 0.2 * 1)) = floor(35 * 1.2) = floor(42) = 42
    expect(slot.maxPP).toBe(42)
    expect(slot.currentPP).toBe(42)
    expect(slot.ppUps).toBe(1)
  })

  it("given a move with odd PP and ppUps, when called, then applies floor truncation", () => {
    // Arrange / Act
    const slot = createMoveSlot("fire-blast", 5, 1)

    // Assert
    // maxPP = floor(5 * 1.2) = floor(6) = 6
    expect(slot.maxPP).toBe(6)
    expect(slot.currentPP).toBe(6)
  })
})

// --- createPokemonInstance ---

describe("createPokemonInstance", () => {
  it("given a species and level, when called with defaults, then creates a valid instance with all required fields", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(instance.speciesId).toBe(6)
    expect(instance.level).toBe(50)
    expect(instance.experience).toBe(0)
    expect(instance.currentHp).toBe(0)
    expect(instance.status).toBeNull()
    expect(instance.nickname).toBeNull()
    expect(instance.heldItem).toBeNull()
    expect(instance.metLevel).toBe(50)
    expect(instance.metLocation).toBe("unknown")
    expect(instance.originalTrainer).toBe("Player")
    expect(instance.originalTrainerId).toBe(0)
    expect(instance.pokeball).toBe("poke-ball")
    expect(instance.friendship).toBe(70) // baseFriendship
    expect(instance.uid).toBeTruthy()
    expect(typeof instance.uid).toBe("string")
    expect(instance.uid.length).toBe(16) // 8 hex chars + 8 hex chars
  })

  it("given a species, when called with default IVs, then generates random IVs between 0 and 31", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    const stats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const
    for (const stat of stats) {
      expect(instance.ivs[stat]).toBeGreaterThanOrEqual(0)
      expect(instance.ivs[stat]).toBeLessThanOrEqual(31)
    }
  })

  it("given a species, when called with default nature, then picks a valid nature", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)
    const allNatures = [
      "hardy", "lonely", "brave", "adamant", "naughty",
      "bold", "docile", "relaxed", "impish", "lax",
      "timid", "hasty", "serious", "jolly", "naive",
      "modest", "mild", "quiet", "bashful", "rash",
      "calm", "gentle", "sassy", "careful", "quirky",
    ]

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(allNatures).toContain(instance.nature)
  })

  it("given a species, when called with default gender, then returns valid gender based on ratio", () => {
    // Arrange
    const species = makeMockSpecies({ genderRatio: 87.5 })
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(["male", "female"]).toContain(instance.gender)
  })

  it("given a genderless species, when called, then returns genderless", () => {
    // Arrange
    const species = makeMockSpecies({ genderRatio: -1 })
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(instance.gender).toBe("genderless")
  })

  it("given a species, when called with default ability, then selects a valid ability", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(instance.ability).toBe("blaze") // Only one normal ability
    expect(instance.abilitySlot).toBe("normal1")
  })

  it("given a species with two normal abilities, when called, then randomly selects one", () => {
    // Arrange
    const species = makeMockSpecies({
      abilities: { normal: ["intimidate", "moxie"], hidden: "mold-breaker" },
    })
    const results = new Set<string>()

    // Act - run with many seeds to get both abilities
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed)
      const instance = createPokemonInstance(species, 50, rng)
      results.add(instance.ability)
    }

    // Assert
    expect(results.has("intimidate")).toBe(true)
    expect(results.has("moxie")).toBe(true)
  })

  it("given a species, when called with default shiny, then is almost never shiny (1/4096)", () => {
    // Arrange
    const species = makeMockSpecies()
    let shinyCount = 0

    // Act
    for (let seed = 0; seed < 1000; seed++) {
      const rng = new SeededRandom(seed)
      const instance = createPokemonInstance(species, 50, rng)
      if (instance.isShiny) shinyCount++
    }

    // Assert - with 1/4096 chance and 1000 trials, expect very few shinies
    expect(shinyCount).toBeLessThan(10)
  })

  it("given a species, when called with default moves, then uses latest 4 level-up moves", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 36, rng)

    // Assert - level 36: eligible moves up to 36: slash(36), flame-burst(32), fire-fang(28), scary-face(21)
    expect(instance.moves).toHaveLength(4)
    expect(instance.moves[0]!.moveId).toBe("slash")
    expect(instance.moves[1]!.moveId).toBe("flame-burst")
    expect(instance.moves[2]!.moveId).toBe("fire-fang")
    expect(instance.moves[3]!.moveId).toBe("scary-face")
  })

  it("given a species, when called with default EVs, then all EVs are 0", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    const stats = ["hp", "attack", "defense", "spAttack", "spDefense", "speed"] as const
    for (const stat of stats) {
      expect(instance.evs[stat]).toBe(0)
    }
  })

  it("given a species, when called with option overrides, then uses the provided values", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)
    const customIvs = { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 }
    const customEvs = { hp: 252, attack: 0, defense: 0, spAttack: 252, spDefense: 4, speed: 0 }

    // Act
    const instance = createPokemonInstance(species, 100, rng, {
      nature: "adamant",
      ivs: customIvs,
      evs: customEvs,
      gender: "female",
      isShiny: true,
      nickname: "Flame",
      moves: ["flamethrower", "air-slash", "dragon-pulse", "roost"],
      heldItem: "leftovers",
      friendship: 255,
      metLocation: "pallet-town",
      originalTrainer: "Ash",
      originalTrainerId: 54321,
      pokeball: "ultra-ball",
      abilitySlot: "hidden",
      teraType: "dragon",
      dynamaxLevel: 10,
    })

    // Assert
    expect(instance.nature).toBe("adamant")
    expect(instance.ivs).toEqual(customIvs)
    expect(instance.evs).toEqual(customEvs)
    expect(instance.gender).toBe("female")
    expect(instance.isShiny).toBe(true)
    expect(instance.nickname).toBe("Flame")
    expect(instance.moves).toHaveLength(4)
    expect(instance.moves[0]!.moveId).toBe("flamethrower")
    expect(instance.moves[1]!.moveId).toBe("air-slash")
    expect(instance.moves[2]!.moveId).toBe("dragon-pulse")
    expect(instance.moves[3]!.moveId).toBe("roost")
    expect(instance.heldItem).toBe("leftovers")
    expect(instance.friendship).toBe(255)
    expect(instance.metLocation).toBe("pallet-town")
    expect(instance.originalTrainer).toBe("Ash")
    expect(instance.originalTrainerId).toBe(54321)
    expect(instance.pokeball).toBe("ultra-ball")
    expect(instance.ability).toBe("solar-power") // hidden ability
    expect(instance.abilitySlot).toBe("hidden")
    expect(instance.teraType).toBe("dragon")
    expect(instance.dynamaxLevel).toBe(10)
  })

  it("given the same seed, when called twice, then produces identical instances", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng1 = new SeededRandom(42)
    const rng2 = new SeededRandom(42)

    // Act
    const instance1 = createPokemonInstance(species, 50, rng1)
    const instance2 = createPokemonInstance(species, 50, rng2)

    // Assert
    expect(instance1).toEqual(instance2)
  })

  it("given a species with no hidden ability, when abilitySlot is hidden, then falls back to normal1", () => {
    // Arrange
    const species = makeMockSpecies({
      abilities: { normal: ["blaze"], hidden: null },
    })
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng, { abilitySlot: "hidden" })

    // Assert
    expect(instance.ability).toBe("blaze")
  })

  it("given a species with one normal ability, when abilitySlot is normal2, then falls back to normal1", () => {
    // Arrange
    const species = makeMockSpecies({
      abilities: { normal: ["blaze"], hidden: "solar-power" },
    })
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng, { abilitySlot: "normal2" })

    // Assert
    expect(instance.ability).toBe("blaze")
  })

  it("given a species, when called with default teraType, then uses first species type", () => {
    // Arrange
    const species = makeMockSpecies({ types: ["fire", "flying"] })
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(instance.teraType).toBe("fire")
  })

  it("given a species, when called with default dynamaxLevel, then is 0", () => {
    // Arrange
    const species = makeMockSpecies()
    const rng = new SeededRandom(42)

    // Act
    const instance = createPokemonInstance(species, 50, rng)

    // Assert
    expect(instance.dynamaxLevel).toBe(0)
  })
})
