import type { DataManager } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_SLOTS, NEUTRAL_NATURES, SeededRandom } from "@pokemon-lib-ts/core";
import { createGen1DataManager } from "@pokemon-lib-ts/gen1";
import { createGen2DataManager } from "@pokemon-lib-ts/gen2";
import { describe, expect, it } from "vitest";
import { generateRandomTeam } from "../../src/simulation/team-generator.js";

// ---------------------------------------------------------------------------
// Shared data managers — expensive to load, create once per describe block
// ---------------------------------------------------------------------------

const gen1Dm: DataManager = createGen1DataManager();
const gen2Dm: DataManager = createGen2DataManager();

// ---------------------------------------------------------------------------
// Team size
// ---------------------------------------------------------------------------

describe("generateRandomTeam — team size", () => {
  it("given default options, when generating a Gen 1 team with seed 42, then returns a team of 3", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    expect(team).toHaveLength(3);
  });

  it("given teamSize: 2, when generating a team, then returns exactly 2 Pokemon", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng, { teamSize: 2 });

    // Assert
    expect(team).toHaveLength(2);
  });

  it("given teamSize: 6, when generating a Gen 2 team, then returns exactly 6 Pokemon", () => {
    // Arrange
    const rng = new SeededRandom(99);

    // Act
    const team = generateRandomTeam(2, gen2Dm, rng, { teamSize: 6 });

    // Assert
    expect(team).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Move validity
// ---------------------------------------------------------------------------

describe("generateRandomTeam — move validity", () => {
  it("given default options, when generating a team, then all Pokemon have at least 1 move", () => {
    // Arrange
    const rng = new SeededRandom(7);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(pokemon.moves.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("given default options, when generating a team, then all moves have positive PP", () => {
    // Arrange
    const rng = new SeededRandom(13);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      for (const move of pokemon.moves) {
        expect(move.currentPP).toBeGreaterThan(0);
        expect(move.maxPP).toBeGreaterThan(0);
        expect(move.currentPP).toBe(move.maxPP);
      }
    }
  });

  it("given movesPerPokemon: [4, 4], when generating a team, then no Pokemon has more than 4 moves", () => {
    // Arrange
    const rng = new SeededRandom(55);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng, { movesPerPokemon: [4, 4] });

    // Assert
    for (const pokemon of team) {
      expect(pokemon.moves.length).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Level range
// ---------------------------------------------------------------------------

describe("generateRandomTeam — level range", () => {
  it("given default levelRange [50, 100], when generating a team, then all Pokemon levels are between 50 and 100 inclusive", () => {
    // Arrange
    const rng = new SeededRandom(21);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(pokemon.level).toBeGreaterThanOrEqual(50);
      expect(pokemon.level).toBeLessThanOrEqual(100);
    }
  });

  it("given levelRange [5, 10], when generating a team, then all Pokemon levels are between 5 and 10 inclusive", () => {
    // Arrange
    const rng = new SeededRandom(33);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng, { levelRange: [5, 10] });

    // Assert
    for (const pokemon of team) {
      expect(pokemon.level).toBeGreaterThanOrEqual(5);
      expect(pokemon.level).toBeLessThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// Duplicate species
// ---------------------------------------------------------------------------

describe("generateRandomTeam — duplicate species", () => {
  it("given allowDuplicateSpecies: false (default), when generating a team, then all speciesIds are unique", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    const speciesIds = team.map((p) => p.speciesId);
    const uniqueIds = new Set(speciesIds);
    expect(uniqueIds.size).toBe(speciesIds.length);
  });

  it("given allowDuplicateSpecies: true, when generating a team of 3 from a pool of 151, then completes successfully", () => {
    // Arrange — with 151 species and teamSize 3, duplicates are possible but not guaranteed
    const rng = new SeededRandom(1);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng, { allowDuplicateSpecies: true });

    // Assert — simply verify it returned a full team (duplicate guard removed)
    expect(team).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("generateRandomTeam — determinism", () => {
  it("given the same seed, when generating two teams, then both teams have identical speciesIds", () => {
    // Arrange
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);

    // Act
    const team1 = generateRandomTeam(1, gen1Dm, rng1);
    const team2 = generateRandomTeam(1, gen1Dm, rng2);

    // Assert
    expect(team1.map((p) => p.speciesId)).toEqual(team2.map((p) => p.speciesId));
  });

  it("given the same seed, when generating two teams, then both teams have identical levels", () => {
    // Arrange
    const rng1 = new SeededRandom(99);
    const rng2 = new SeededRandom(99);

    // Act
    const team1 = generateRandomTeam(1, gen1Dm, rng1);
    const team2 = generateRandomTeam(1, gen1Dm, rng2);

    // Assert
    expect(team1.map((p) => p.level)).toEqual(team2.map((p) => p.level));
  });

  it("given different seeds (42 vs 43), when generating two teams, then teams have different speciesIds", () => {
    // Arrange
    const rng42 = new SeededRandom(42);
    const rng43 = new SeededRandom(43);

    // Act
    const team42 = generateRandomTeam(1, gen1Dm, rng42);
    const team43 = generateRandomTeam(1, gen1Dm, rng43);

    // Assert — different seeds should produce different teams
    const ids42 = team42.map((p) => p.speciesId);
    const ids43 = team43.map((p) => p.speciesId);
    expect(ids42).not.toEqual(ids43);
  });
});

// ---------------------------------------------------------------------------
// Generation-specific mechanics
// ---------------------------------------------------------------------------

describe("generateRandomTeam — Gen 1 mechanics", () => {
  it("given generation 1, when generating a team, then all Pokemon have empty ability string", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert — Gen 1 has no abilities
    for (const pokemon of team) {
      expect(pokemon.ability).toBe("");
    }
  });

  it("given generation 1, when generating a team, then all IVs are at most 15 (DVs, not IVs)", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert — Gen 1 uses 0-15 DVs, and the seeded generator should stay deterministic.
    expect(team.map((pokemon) => pokemon.ivs)).toEqual([
      { hp: 4, attack: 5, defense: 10, spAttack: 3, spDefense: 2, speed: 11 },
      { hp: 12, attack: 7, defense: 2, spAttack: 13, spDefense: 8, speed: 13 },
      { hp: 3, attack: 6, defense: 8, spAttack: 15, spDefense: 7, speed: 13 },
    ]);
  });

  it("given generation 1, when generating a team, then all Pokemon have no held item", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert — Gen 1 has no held items
    for (const pokemon of team) {
      expect(pokemon.heldItem).toBeNull();
    }
  });

  it("given generation 1, when generating a team, then abilitySlot is always the primary slot", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(pokemon.abilitySlot).toBe(CORE_ABILITY_SLOTS.normal1);
    }
  });
});

describe("generateRandomTeam — Gen 2 mechanics", () => {
  it("given generation 2, when generating a team, then all IVs are at most 15 (Gen 2 still uses DVs)", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(2, gen2Dm, rng);

    // Assert — Gen 2 also uses DVs (0-15)
    for (const pokemon of team) {
      const { hp, attack, defense, spAttack, spDefense, speed } = pokemon.ivs;
      expect(hp).toBeLessThanOrEqual(15);
      expect(attack).toBeLessThanOrEqual(15);
      expect(defense).toBeLessThanOrEqual(15);
      expect(spAttack).toBeLessThanOrEqual(15);
      expect(spDefense).toBeLessThanOrEqual(15);
      expect(speed).toBeLessThanOrEqual(15);
    }
  });

  it("given generation 2, when generating a team, then all Pokemon have empty ability string", () => {
    // Arrange
    const rng = new SeededRandom(77);

    // Act
    const team = generateRandomTeam(2, gen2Dm, rng);

    // Assert — Gen 2 has no abilities
    for (const pokemon of team) {
      expect(pokemon.ability).toBe("");
    }
  });
});

// ---------------------------------------------------------------------------
// Metadata correctness
// ---------------------------------------------------------------------------

describe("generateRandomTeam — metadata", () => {
  it("given any generation, when generating a team, then each Pokemon has a unique uid", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng, { teamSize: 3 });

    // Assert
    const uids = team.map((p) => p.uid);
    const uniqueUids = new Set(uids);
    expect(uniqueUids.size).toBe(uids.length);
  });

  it("given any generation, when generating a team, then metLocation is 'simulation'", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(pokemon.metLocation).toBe("simulation");
    }
  });

  it("given any generation, when generating a team, then status is null for all Pokemon", () => {
    // Arrange
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(pokemon.status).toBeNull();
    }
  });

  it("given generation 1, when generating a team, then each Pokemon's nature is neutral", () => {
    // Arrange
    const neutralNatures = new Set(NEUTRAL_NATURES);
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(1, gen1Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(neutralNatures.has(pokemon.nature)).toBe(true);
    }
  });

  it("given generation 2, when generating a team, then each Pokemon's nature is neutral", () => {
    // Arrange
    const neutralNatures = new Set(NEUTRAL_NATURES);
    const rng = new SeededRandom(42);

    // Act
    const team = generateRandomTeam(2, gen2Dm, rng);

    // Assert
    for (const pokemon of team) {
      expect(neutralNatures.has(pokemon.nature)).toBe(true);
    }
  });
});
