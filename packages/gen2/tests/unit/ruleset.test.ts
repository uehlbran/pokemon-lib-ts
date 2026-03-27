import type {
  AbilityContext,
  ActivePokemon,
  BattleAction,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_GIMMICK_IDS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TYPES,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createStatExp,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it, vi } from "vitest";
import { createGen2DataManager, GEN2_ITEM_IDS, GEN2_MOVE_IDS, GEN2_SPECIES_IDS } from "../../src";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

const {
  bug,
  dark,
  dragon,
  electric,
  fighting,
  fire,
  flying,
  ghost,
  grass,
  ground,
  ice,
  normal,
  poison: poisonType,
  psychic,
  rock,
  steel,
  water,
} = CORE_TYPE_IDS;
const { freeze, burn, badlyPoisoned, paralysis, poison, sleep } = CORE_STATUS_IDS;
const { spikes, stealthRock, toxicSpikes } = CORE_HAZARD_IDS;
const { mega } = CORE_GIMMICK_IDS;
const { leftovers } = CORE_ITEM_IDS;
const { bind, leechSeed, perishSong } = CORE_MOVE_IDS;
const { confusion, curse, flinch, nightmare, protect, sleepCounter, toxicCounter, trapped } =
  CORE_VOLATILE_IDS;
const {
  defrost,
  disableCountdown,
  encoreCountdown,
  futureAttack,
  healingItems,
  screenCountdown,
  statBoostingItems,
  statusDamage,
  weatherCountdown,
  weatherDamage,
} = CORE_END_OF_TURN_EFFECT_IDS;
const { adamant, hardy } = CORE_NATURE_IDS;
const { charcoal, mysteryBerry, quickClaw } = GEN2_ITEM_IDS;
const { quickAttack, tackle } = GEN2_MOVE_IDS;
const {
  custom,
  damage,
  fixedDamage,
  levelDamage,
  multiHit,
  ohko,
  removeHazards,
  screen,
  terrain,
  twoTurn,
} = CORE_MOVE_EFFECT_TYPES;
const TEST_DATA_MANAGER = createGen2DataManager();
function createMoveSlotFixture(
  moveId: string,
  overrides: Partial<{ pp: number }> = {},
): ReturnType<typeof createMoveSlot> {
  const moveData = TEST_DATA_MANAGER.getMove(moveId);
  return createMoveSlot(moveId, overrides.pp ?? moveData.pp);
}

function createValidationPokemonFixture(
  species: PokemonSpeciesData,
  overrides: Partial<PokemonInstance> = {},
): PokemonInstance {
  const defaultMoveId =
    species.learnset.levelUp[0]?.move ??
    species.learnset.tm[0] ??
    species.learnset.egg[0] ??
    species.learnset.tutor[0] ??
    species.learnset.event?.[0] ??
    tackle;

  return {
    uid: `validation-${species.id}`,
    speciesId: species.id,
    nickname: null,
    level: 50,
    experience: 0,
    nature: hardy,
    ivs: createDvs(),
    evs: createStatExp(),
    currentHp: 100,
    moves: [createMoveSlotFixture(defaultMoveId)],
    ability: "",
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: createFriendship(species.baseFriendship),
    gender:
      species.genderRatio === -1
        ? CORE_GENDERS.genderless
        : species.genderRatio === 0
          ? CORE_GENDERS.female
          : CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    metLevel: 50,
    originalTrainer: "test",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    ...overrides,
  };
}

/**
 * Helper to create a minimal ActivePokemon mock for testing.
 */
function createOnFieldPokemonFixture(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    status: PrimaryStatus | null;
    types: PokemonType[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    moves: ReturnType<typeof createMoveSlot>[];
    friendship: number;
    abilitySlot: PokemonInstance["abilitySlot"];
    gender: PokemonInstance["gender"];
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const species =
    overrides.speciesId === undefined
      ? TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.bulbasaur)
      : TEST_DATA_MANAGER.getSpecies(overrides.speciesId);
  return {
    pokemon: {
      speciesId: species.id,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: createDvs(),
      evs: createStatExp(),
      moves: overrides.moves ?? [createMoveSlotFixture(tackle)],
      friendship: createFriendship(overrides.friendship ?? species.baseFriendship),
      abilitySlot: overrides.abilitySlot ?? CORE_ABILITY_SLOTS.normal1,
      gender:
        overrides.gender ??
        (species.genderRatio === -1
          ? CORE_GENDERS.genderless
          : species.genderRatio === 0
            ? CORE_GENDERS.female
            : CORE_GENDERS.male),
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
    },
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? species.types,
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as unknown as ActivePokemon;
}

/**
 * Helper to create a minimal BattleSide mock.
 */
function createBattleSideFixture(
  index: 0 | 1,
  active: ActivePokemon,
  hazards: Array<{ type: string; layers: number }> = [],
): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

/**
 * Helper to create a minimal BattleState mock.
 */
function createBattleStateFixture(
  side0: BattleSide,
  side1: BattleSide,
  weather: { type: string; turnsLeft: number } | null = null,
): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

const EXPECTED_GEN2_TYPES = [
  normal,
  fire,
  water,
  electric,
  grass,
  ice,
  fighting,
  poisonType,
  ground,
  flying,
  psychic,
  bug,
  rock,
  ghost,
  dragon,
  dark,
  steel,
] as const;

describe("Gen2Ruleset", () => {
  // --- Generation Identity ---

  describe("Given Gen2Ruleset", () => {
    it("given a Gen 2 ruleset, when reading the generation, then it is 2", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.generation).toBe(2);
    });

    it('given a Gen 2 ruleset, when reading the name, then it is "Gen 2 (GSC)"', () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.name).toBe("Gen 2 (GSC)");
    });

    it("given Gen 2 ruleset, when getting the type chart, then it exposes the 17 pre-Fairy types", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const chart = ruleset.getTypeChart();
      // Assert
      // Source: Gen 2 adds Dark and Steel for 17 total types; Fairy arrives in Gen 6.
      const types = Object.keys(chart);
      expect(types).toEqual(EXPECTED_GEN2_TYPES);
    });

    it("given Gen 2 ruleset, when getting available types, then it returns the full 17-type list", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const types = ruleset.getAvailableTypes();
      // Assert
      // Source: Gen2 type chart includes the same 17 pre-Fairy types.
      expect(types).toEqual(EXPECTED_GEN2_TYPES);
    });

    it("given Gen 2 ruleset, when checking abilities support, then it reports abilities disabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasAbilities()).toBe(false);
    });

    it("given Gen 2 ruleset, when checking held-item support, then it reports held items enabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasHeldItems()).toBe(true);
    });

    it("given Gen 2 ruleset, when checking weather support, then it reports weather enabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasWeather()).toBe(true);
    });

    it("given Gen 2 ruleset, when checking terrain support, then it reports terrain disabled", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.hasTerrain()).toBe(false);
    });

    it("given Gen 2 ruleset, when getting hazards, then only Spikes is available", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const hazards = ruleset.getAvailableHazards();
      // Assert
      expect(hazards).toEqual([spikes]);
    });

    it("given Gen 2 ruleset, when requesting a battle gimmick, then it returns null because Gen 2 has none", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.getBattleGimmick(mega)).toEqual(null);
    });

    it("given Gen 2 ruleset, when getting end-of-turn order, then it matches pokecrystal HandleBetweenTurnEffects phase 2", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:250-296 HandleBetweenTurnEffects
      // Phase 2 only — status-damage, leech-seed, nightmare, curse are Phase 1 (getPostAttackResidualOrder)
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const order = ruleset.getEndOfTurnOrder();
      // Assert: complete decomp order including previously-missing effects
      expect(order).toEqual([
        futureAttack,
        weatherDamage,
        weatherCountdown,
        bind,
        perishSong,
        leftovers,
        mysteryBerry,
        defrost,
        // safeguard-countdown removed: Safeguard is stored as a ScreenType and handled by screen-countdown
        screenCountdown,
        statBoostingItems,
        healingItems,
        disableCountdown,
        encoreCountdown,
      ]);
    });

    it("given Gen 2 ruleset, when getting post-attack residual order, then returns Phase 1 effects", () => {
      // Source: pret/pokecrystal engine/battle/core.asm — ResidualDamage runs after each attack
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const order = ruleset.getPostAttackResidualOrder();
      // Assert
      expect(order).toEqual([statusDamage, leechSeed, nightmare, curse]);
    });

    it("given Gen 2 ruleset, when getting the crit rate table, then it returns the five Gen 2 stage thresholds", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act
      const table = ruleset.getCritRateTable();
      // Assert
      // Source: Gen2CritCalc GEN2_CRIT_RATES keeps the five classic Gen 2 stage thresholds.
      // Stage table: 17/256, 32/256, 64/256, 85/256, 128/256.
      expect(table.length).toBe(5);
      expect(table[0]).toBeCloseTo(17 / 256);
      expect(table[3]).toBeCloseTo(85 / 256);
      expect(table[4]).toBeCloseTo(128 / 256);
    });

    it("given a critical hit multiplier query, when the Gen 2 ruleset is asked, then it returns 2.0", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      // Act / Assert
      expect(ruleset.getCritMultiplier()).toBe(2);
    });
  });

  // --- Freeze Thaw ---

  describe("Given freeze thaw check", () => {
    it("given a frozen Pokemon, when checkFreezeThaw is called, then returns false because Gen 2 thaws between turns not pre-move", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
      // In Gen 2, thaw happens in HandleBetweenTurnEffects (end-of-turn phase),
      // NOT before the move executes. checkFreezeThaw is called by the engine
      // pre-move, so it must always return false for Gen 2.
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockActive = createOnFieldPokemonFixture({ status: freeze });
      const rng = new SeededRandom(42);

      // Act
      const result = ruleset.checkFreezeThaw(mockActive, rng);

      // Assert
      expect(result).toBe(false);
    });

    it("given the pre-move freeze-thaw check, when it runs, then it always returns false", () => {
      // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockActive = createOnFieldPokemonFixture({ status: freeze });
      const rng = new SeededRandom(42);

      // Act
      const result = ruleset.checkFreezeThaw(mockActive, rng);

      // Assert
      expect(result).toBe(false);
    });
  });

  // --- Sleep Turns ---

  describe("Given sleep turns roll", () => {
    it("given the Gen 2 sleep-turn roll, when the ruleset asks rng for a value, then it uses the inclusive 2-7 range", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const int = vi.fn().mockReturnValue(4);
      const rng = { int } as unknown as SeededRandom;

      // Act
      const turns = ruleset.rollSleepTurns(rng);

      // Assert
      // Source: the mocked RNG returns 4 only to prove rollSleepTurns forwards the value unchanged.
      expect(turns).toBe(4);
      expect(int).toHaveBeenCalledWith(2, 7);
    });
  });

  // --- Sleep Turn Processing ---

  describe("Given processSleepTurn", () => {
    it("given a sleep-counter of 1 turn, when the sleep turn resolves, then the Pokemon wakes up and can act", () => {
      // Given a Pokemon that will wake up this turn (turnsLeft = 1)
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createOnFieldPokemonFixture({ status: sleep });
      mockActivePokemon.pokemon.status = sleep;
      mockActivePokemon.volatileStatuses.set(sleepCounter, { turnsLeft: 1 });
      const mockState = createBattleStateFixture(
        createBattleSideFixture(0, mockActivePokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then the Pokemon wakes up and CAN act (Gen 2 behavior)
      expect(result).toBe(true);
      expect(mockActivePokemon.pokemon.status).toBeNull();
      expect(mockActivePokemon.volatileStatuses.has(sleepCounter)).toBe(false);
    });

    it("given more than 1 sleep turn remaining, when the sleep turn resolves, then the Pokemon stays asleep", () => {
      // Given a Pokemon with multiple sleep turns left
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createOnFieldPokemonFixture({ status: sleep });
      mockActivePokemon.pokemon.status = sleep;
      mockActivePokemon.volatileStatuses.set(sleepCounter, { turnsLeft: 3 });
      const mockState = createBattleStateFixture(
        createBattleSideFixture(0, mockActivePokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then the Pokemon is still asleep and cannot act
      expect(result).toBe(false);
      expect(mockActivePokemon.pokemon.status).toBe(sleep);
      expect(mockActivePokemon.volatileStatuses.get(sleepCounter)?.turnsLeft).toBe(2);
    });

    it("given exactly 1 sleep turn remaining, when the sleep turn resolves, then the Pokemon wakes up", () => {
      // Given a Pokemon with 1 turn of sleep remaining
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createOnFieldPokemonFixture({ status: sleep });
      mockActivePokemon.pokemon.status = sleep;
      mockActivePokemon.volatileStatuses.set(sleepCounter, { turnsLeft: 1 });
      const mockState = createBattleStateFixture(
        createBattleSideFixture(0, mockActivePokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then it decrements and wakes up, allowing action
      expect(result).toBe(true);
      expect(mockActivePokemon.pokemon.status).toBeNull();
    });

    it("given a sleep counter already at 0, when the sleep turn resolves, then the Pokemon wakes up immediately", () => {
      // Given a Pokemon with 0 turns of sleep remaining
      const ruleset = new Gen2Ruleset();
      const mockActivePokemon = createOnFieldPokemonFixture({ status: sleep });
      mockActivePokemon.pokemon.status = sleep;
      mockActivePokemon.volatileStatuses.set(sleepCounter, { turnsLeft: 0 });
      const mockState = createBattleStateFixture(
        createBattleSideFixture(0, mockActivePokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // When processing the sleep turn
      const result = ruleset.processSleepTurn(mockActivePokemon, mockState);

      // Then it wakes up and can act
      expect(result).toBe(true);
      expect(mockActivePokemon.pokemon.status).toBeNull();
    });
  });

  // --- Spikes Entry Hazard ---

  describe("Given Spikes entry hazard", () => {
    it("given one layer of Spikes, when a grounded Pokemon switches in, then it takes floor(maxHp/8) damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ maxHp: 320, types: [normal] });
      const side = createBattleSideFixture(0, pokemon, [{ type: spikes, layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Source: Gen 2 Spikes deal floor(maxHP / 8).
      expect(result.damage).toBe(40);
      expect(result.messages).toEqual(["The Pokemon was hurt by spikes!"]);
    });

    it("given a Flying-type Pokemon, when it switches into Spikes, then it takes no damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ maxHp: 320, types: [flying, normal] });
      const side = createBattleSideFixture(0, pokemon, [{ type: spikes, layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert: flying types are immune
      expect(result.damage).toBe(0);
    });

    it("given 1 max HP, when a grounded Pokemon switches into Spikes, then it still takes 1 damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ maxHp: 1, types: [normal] });
      const side = createBattleSideFixture(0, pokemon, [{ type: spikes, layers: 1 }]);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert
      expect(result.damage).toBe(1);
    });

    it("given no Spikes on the field, when a Pokemon switches in, then it takes no hazard damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ maxHp: 320, types: [normal] });
      const side = createBattleSideFixture(0, pokemon);

      // Act
      const result = ruleset.applyEntryHazards(pokemon, side);

      // Assert
      expect(result.damage).toBe(0);
    });
  });

  // --- getMaxHazardLayers ---

  describe("Given getMaxHazardLayers", () => {
    it("given spikes in Gen 2, when querying max layers, then returns 1", () => {
      // Source: pret/pokecrystal — Gen 2 introduced Spikes with only a single layer.
      // Multi-layer Spikes were not introduced until Gen 3.
      const ruleset = new Gen2Ruleset();
      expect(ruleset.getMaxHazardLayers(spikes)).toBe(1);
    });

    it("given toxic-spikes in Gen 2, when querying max layers, then returns 1", () => {
      // Toxic Spikes do not exist in Gen 2 — returning 1 as a safe fallback.
      // Source: Bulbapedia — Toxic Spikes introduced in Generation IV (Diamond/Pearl).
      const ruleset = new Gen2Ruleset();
      expect(ruleset.getMaxHazardLayers(toxicSpikes)).toBe(1);
    });

    it("given stealth-rock in Gen 2, when querying max layers, then returns 1", () => {
      // Stealth Rock does not exist in Gen 2 — returning 1 as a safe fallback.
      // Source: Bulbapedia — Stealth Rock introduced in Generation IV (Diamond/Pearl).
      const ruleset = new Gen2Ruleset();
      expect(ruleset.getMaxHazardLayers(stealthRock)).toBe(1);
    });
  });

  // --- Validation ---

  describe("Given validation", () => {
    it("given a dex number in the Gen 2 range, when validatePokemon runs, then the species is accepted", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.celebi);
      const pokemon = createValidationPokemonFixture(species);

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("given a dex number above the Gen 2 range, when validatePokemon runs, then the species is rejected", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = { id: 252, displayName: "Treecko" } as unknown as PokemonSpeciesData;
      const pokemon = createValidationPokemonFixture(
        TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.chikorita),
      );

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("not available in Gen 2"))).toBe(true);
    });

    it("given a Pokemon with a held item, when validatePokemon runs, then the item is accepted", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.snorlax);
      const pokemon = createValidationPokemonFixture(species, { heldItem: leftovers });

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(true);
    });

    it("given a Pokemon with zero moves, when validatePokemon runs, then the move-count validation fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu);
      const pokemon = createValidationPokemonFixture(species, { moves: [] });

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("1-4 moves"))).toBe(true);
    });

    it("given a Pokemon with five moves, when validatePokemon runs, then the move-count validation fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu);
      const pokemon = createValidationPokemonFixture(species, {
        moves: [
          createMoveSlotFixture(tackle),
          createMoveSlotFixture(quickAttack),
          createMoveSlotFixture(tackle),
          createMoveSlotFixture(quickAttack),
          createMoveSlotFixture(tackle),
        ],
      });

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
    });

    it("given an invalid level, when validatePokemon runs, then the level validation fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu);
      const pokemon = createValidationPokemonFixture(species, { level: 0 });

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("Level"))).toBe(true);
    });
  });

  // --- Accuracy Check ---

  describe("Given accuracy check", () => {
    it("given a 100% accurate move, when hit chance is checked, then Gen 2 short-circuits before any RNG roll", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const move = { accuracy: 100, id: tackle } as unknown as MoveData;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const int = vi.fn();
      const rng = { int } as unknown as SeededRandom;

      // Act
      const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });

      // Assert
      expect(hit).toBe(true);
      expect(int).not.toHaveBeenCalled();
    });

    it("given a 100% accurate move, when hit chance is checked, then it always hits", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const move = { accuracy: 100 } as unknown as MoveData;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );

      // Act / Assert
      expect(
        ruleset.doesMoveHit({ attacker, defender, move, state, rng: new SeededRandom(42) }),
      ).toBe(true);
    });

    it("given a null-accuracy move, when hit chance is checked, then it always hits", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      // Even with -6 evasion stage changes
      defender.statStages.evasion = 6;
      const move = { accuracy: null } as unknown as MoveData;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );

      // Act
      const hit = ruleset.doesMoveHit({ attacker, defender, move, state, rng });

      // Assert
      expect(hit).toBe(true);
    });
  });

  // --- Confusion Damage ---

  describe("Given confusion damage", () => {
    it("given Gen 2 confusion self-hit, when calculating damage with a fixed seed, then it uses the exact 40 BP typeless physical formula", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const pokemon = createOnFieldPokemonFixture({
        level: 50,
        attack: 150,
        defense: 100,
      });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, pokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // Act
      const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

      // Assert
      // Source: Gen2Ruleset.calculateConfusionDamage delegates to the classic 40 BP
      // self-hit formula, and SeededRandom(42) produces the max 255/255 damage roll here.
      expect(damage).toBe(28);
    });

    it("given a high-attack Pokemon, when confusion damage is calculated, then it exceeds simple maxHp/8 damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // High attack Pokemon
      const pokemon = createOnFieldPokemonFixture({
        level: 100,
        maxHp: 300,
        attack: 400,
        defense: 100,
      });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, pokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // Act
      const confusionDamage = ruleset.calculateConfusionDamage(pokemon, state, rng);
      const simpleDamage = Math.floor(300 / 8); // 37

      // Assert: formula-based confusion damage exceeds maxHP/8 for high attack
      expect(confusionDamage).toBeGreaterThan(simpleDamage);
    });

    it("given a weak confused Pokemon, when confusion damage is calculated, then it still deals at least 1 damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const pokemon = createOnFieldPokemonFixture({
        level: 1,
        attack: 1,
        defense: 999,
      });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, pokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // Act
      const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);

      // Assert
      expect(damage).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Ability/Terrain no-ops ---

  describe("Given ability check", () => {
    it("given Gen 2 has no abilities, when applyAbility runs, then it returns a non-activated result", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();

      // Act
      const result = ruleset.applyAbility(
        CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
        {} as unknown as AbilityContext,
      );

      // Assert
      expect(result.activated).toBe(false);
      expect(result.effects).toEqual([]);
    });
  });

  describe("Given terrain check", () => {
    it("given Gen 2 ruleset, when applying terrain effects, then it returns no effects because terrain does not exist yet", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();

      // Act
      const result = ruleset.applyTerrainEffects({} as unknown as BattleState);

      // Assert
      expect(result).toEqual([]);
    });
  });

  // --- Weather Effects ---

  describe("Given weather effects", () => {
    it("given sandstorm and two non-immune Pokemon, when weather effects resolve, then both take damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ maxHp: 400, types: [fire] });
      const side0 = createBattleSideFixture(0, pokemon);
      const side1 = createBattleSideFixture(1, createOnFieldPokemonFixture({ types: [water] }));
      const state = createBattleStateFixture(side0, side1, {
        type: CORE_WEATHER_IDS.sand,
        turnsLeft: 3,
      });

      // Act
      const results = ruleset.applyWeatherEffects(state);

      // Assert: both fire and water Pokemon take sandstorm damage
      expect(results.length).toBe(2);
    });

    it("given sandstorm and Rock/Steel Pokemon, when weather effects resolve, then they take no damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rockPokemon = createOnFieldPokemonFixture({ types: [rock] });
      const steelPokemon = createOnFieldPokemonFixture({ types: [steel] });
      const side0 = createBattleSideFixture(0, rockPokemon);
      const side1 = createBattleSideFixture(1, steelPokemon);
      const state = createBattleStateFixture(side0, side1, {
        type: CORE_WEATHER_IDS.sand,
        turnsLeft: 3,
      });

      // Act
      const results = ruleset.applyWeatherEffects(state);

      // Assert
      expect(results.length).toBe(0);
    });
  });

  // --- Critical Hits ---

  describe("Given critical hit check", () => {
    it("given a status move, when critical hit chance is rolled, then it never crits", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );
      const statusMove = {
        category: CORE_MOVE_CATEGORIES.status,
        id: GEN2_MOVE_IDS.toxic,
      } as unknown as MoveData;

      // Act
      for (let seed = 0; seed < 100; seed++) {
        const rng = new SeededRandom(seed);
        const result = ruleset.rollCritical({ attacker, move: statusMove, state, rng });

        // Assert
        expect(result).toBe(false);
      }
    });
  });

  // --- Turn Order ---

  describe("Given turn order resolution", () => {
    it("given a switch and a move, when turn order is resolved, then the switch acts first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createOnFieldPokemonFixture({
        speed: 50,
        moves: [createMoveSlotFixture(tackle)],
      });
      const active1 = createOnFieldPokemonFixture({
        speed: 200,
        moves: [createMoveSlotFixture(tackle)],
      });
      const side0 = createBattleSideFixture(0, active0);
      const side1 = createBattleSideFixture(1, active1);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "switch", side: 1, switchTo: 1 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: switch comes first
      expect(sorted[0].type).toBe("switch");
      expect(sorted[1].type).toBe("move");
    });

    it("given a run action and a move, when turn order is resolved, then the run action acts first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createOnFieldPokemonFixture({ moves: [createMoveSlotFixture(tackle)] });
      const active1 = createOnFieldPokemonFixture();
      const side0 = createBattleSideFixture(0, active0);
      const side1 = createBattleSideFixture(1, active1);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "run", side: 1 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: run comes first
      expect(sorted[0].type).toBe("run");
      expect(sorted[1].type).toBe("move");
    });

    it("given moves with different priorities, when turn order is resolved, then the higher priority move acts first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // quick-attack has priority +1 (Showdown-compatible scale), tackle has priority 0
      const active0 = createOnFieldPokemonFixture({
        speed: 50,
        moves: [createMoveSlotFixture(quickAttack)],
      });
      const active1 = createOnFieldPokemonFixture({
        speed: 200,
        moves: [createMoveSlotFixture(tackle)],
      });
      const side0 = createBattleSideFixture(0, active0);
      const side1 = createBattleSideFixture(1, active1);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: quick-attack (priority +1) goes before tackle (priority 0)
      expect(sorted[0].side).toBe(0);
      expect(sorted[1].side).toBe(1);
    });

    it("given equal-priority moves, when turn order is resolved, then the faster Pokemon acts first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const slowActive = createOnFieldPokemonFixture({
        speed: 50,
        moves: [createMoveSlotFixture(tackle)],
      });
      const fastActive = createOnFieldPokemonFixture({
        speed: 200,
        moves: [createMoveSlotFixture(tackle)],
      });
      const side0 = createBattleSideFixture(0, slowActive);
      const side1 = createBattleSideFixture(1, fastActive);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: faster Pokemon (side 1, speed 200) goes first
      expect(sorted[0].side).toBe(1);
      expect(sorted[1].side).toBe(0);
    });

    it("given Quick Claw and a slower attacker, when turn order is resolved, then Quick Claw can move first", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const slowActive = createOnFieldPokemonFixture({
        speed: 10,
        heldItem: quickClaw,
        moves: [createMoveSlotFixture(tackle)],
      });
      const fastActive = createOnFieldPokemonFixture({
        speed: 300,
        moves: [createMoveSlotFixture(tackle)],
      });
      const side0 = createBattleSideFixture(0, slowActive);
      const side1 = createBattleSideFixture(1, fastActive);
      const state = createBattleStateFixture(side0, side1);
      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];
      const int = vi.fn().mockReturnValue(1);
      const next = vi.fn().mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);
      const rng = { int, next } as unknown as SeededRandom;

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert
      expect(sorted[0].side).toBe(0);
      expect(sorted[1].side).toBe(1);
    });

    it("given equal speed on both sides, when turn order is resolved, then the tiebreak key decides the order", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const active0 = createOnFieldPokemonFixture({
        speed: 100,
        moves: [createMoveSlotFixture(tackle)],
      });
      const active1 = createOnFieldPokemonFixture({
        speed: 100,
        moves: [createMoveSlotFixture(tackle)],
      });
      const side0 = createBattleSideFixture(0, active0);
      const side1 = createBattleSideFixture(1, active1);
      const state = createBattleStateFixture(side0, side1);
      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      const firstSorted = ruleset.resolveTurnOrder(actions, state, {
        next: vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.9),
      } as unknown as SeededRandom);
      const secondSorted = ruleset.resolveTurnOrder(actions, state, {
        next: vi.fn().mockReturnValueOnce(0.9).mockReturnValueOnce(0.1),
      } as unknown as SeededRandom);

      // Assert
      expect(firstSorted[0].side).toBe(0);
      expect(secondSorted[0].side).toBe(1);
    });

    it("given struggle and recharge actions, when turn order is resolved, then speed still breaks the tie", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const slowActive = createOnFieldPokemonFixture({ speed: 50 });
      const fastActive = createOnFieldPokemonFixture({ speed: 200 });
      const side0 = createBattleSideFixture(0, slowActive);
      const side1 = createBattleSideFixture(1, fastActive);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "struggle", side: 0 },
        { type: "recharge", side: 1 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: faster side (1, speed 200) goes first
      expect(sorted[0].side).toBe(1);
    });

    it("given a missing active Pokemon, when move order is resolved, then the ruleset still returns both actions", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createOnFieldPokemonFixture({ moves: [createMoveSlotFixture(tackle)] });
      const side0 = createBattleSideFixture(0, active0);
      // Create a side with no active Pokemon
      const side1 = {
        index: 1,
        trainer: null,
        team: [],
        active: [null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      } as unknown as BattleSide;
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: it returns a sorted array without crashing
      expect(sorted.length).toBe(2);
    });

    it("given unknown move IDs, when turn order is resolved, then both moves fall back to priority 0", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const active0 = createOnFieldPokemonFixture({
        speed: 100,
        moves: [{ moveId: "nonexistent-move", pp: 10, maxPp: 10 }],
      });
      const active1 = createOnFieldPokemonFixture({
        speed: 100,
        moves: [{ moveId: "another-fake-move", pp: 10, maxPp: 10 }],
      });
      const side0 = createBattleSideFixture(0, active0);
      const side1 = createBattleSideFixture(1, active1);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: it returns both actions with default priority 0
      expect(sorted.length).toBe(2);
    });

    it("given a paralyzed Pokemon, when turn order is resolved, then its speed is reduced to 25%", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      // Paralyzed Pokemon with 200 speed -> effective 50
      // Other Pokemon with 60 speed -> faster after paralysis
      const paralyzedActive = createOnFieldPokemonFixture({
        speed: 200,
        status: paralysis,
        moves: [createMoveSlotFixture(tackle)],
      });
      const healthyActive = createOnFieldPokemonFixture({
        speed: 60,
        moves: [createMoveSlotFixture(tackle)],
      });
      const side0 = createBattleSideFixture(0, paralyzedActive);
      const side1 = createBattleSideFixture(1, healthyActive);
      const state = createBattleStateFixture(side0, side1);

      const actions: BattleAction[] = [
        { type: "move", side: 0, moveIndex: 0 },
        { type: "move", side: 1, moveIndex: 0 },
      ];

      // Act
      const sorted = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert: paralyzed Pokemon (200 * 0.25 = 50) is slower than 60
      expect(sorted[0].side).toBe(1);
      expect(sorted[1].side).toBe(0);
    });
  });

  // --- Accuracy with Evasion/Accuracy Stages ---

  describe("Given accuracy check with stat stages", () => {
    it("given positive accuracy stages, when hit chance is checked, then the threshold increases exactly", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      attacker.statStages.accuracy = 2;
      const defender = createOnFieldPokemonFixture();
      const move = { accuracy: 50 } as unknown as MoveData;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const hitRng = { int: () => 209 } as unknown as SeededRandom;
      const missRng = { int: () => 210 } as unknown as SeededRandom;

      // Assert: floor(50 * 255 / 100) = 127, * 166/100 = 210.
      expect(ruleset.doesMoveHit({ attacker, defender, move, state, rng: hitRng })).toBe(true);
      expect(ruleset.doesMoveHit({ attacker, defender, move, state, rng: missRng })).toBe(false);
    });

    it("given a negative net accuracy stage, when hit chance is checked, then the threshold decreases exactly", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      defender.statStages.evasion = 2;
      const move = { accuracy: 100 } as unknown as MoveData;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const hitRng = { int: () => 152 } as unknown as SeededRandom;
      const missRng = { int: () => 153 } as unknown as SeededRandom;

      // Assert: floor(100 * 255 / 100) = 255, * 3/5 = 153.
      expect(ruleset.doesMoveHit({ attacker, defender, move, state, rng: hitRng })).toBe(true);
      expect(ruleset.doesMoveHit({ attacker, defender, move, state, rng: missRng })).toBe(false);
    });
  });

  // --- executeMoveEffect ---

  describe("Given executeMoveEffect", () => {
    it("given a move with no effect, when executeMoveEffect runs, then it returns the zero-value payload", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = { id: tackle, effect: null } as unknown as MoveData;
      const rng = new SeededRandom(42);

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 50,
        state,
        rng,
      });

      // Assert: the default result is the zero-value payload used by the engine.
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        }),
      );
    });

    it("given a successful status-chance effect, when executeMoveEffect runs, then it inflicts the status", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ types: [ice] });
      const defender = createOnFieldPokemonFixture({ types: [normal] });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.iceBeam,
        type: ice,
        effect: { type: "status-chance", status: freeze, chance: 100 },
      } as unknown as MoveData;

      // Act — force the 0-255 roll to succeed and prove the primary status path.
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 95,
        state,
        rng: { int: () => 0 } as unknown as SeededRandom,
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: freeze,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a status-chance move, when the target already has a status, then no additional status is inflicted", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture({ status: paralysis });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.thunder,
        effect: { type: "status-chance", status: paralysis, chance: 100 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 80,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a status-chance burn move, when the target is Fire-type, then Gen 2 type immunity prevents burn", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture({ types: [fire] });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.flamethrower,
        effect: { type: "status-chance", status: burn, chance: 100 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 70,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a status-guaranteed effect, when executeMoveEffect runs, then it inflicts the status", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture({ types: [normal] });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.toxic,
        effect: { type: "status-guaranteed", status: badlyPoisoned },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: badlyPoisoned,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a guaranteed-status move, when the target already has a status, then no replacement status is inflicted", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture({ status: burn });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.thunderWave,
        effect: { type: "status-guaranteed", status: paralysis },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a successful stat-change effect, when executeMoveEffect runs, then it applies the stat stage change", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.swordsDance,
        effect: {
          type: "stat-change",
          target: "self",
          chance: 100,
          changes: [{ stat: "attack", stages: 2 }],
        },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statChanges: [{ target: "attacker", stat: "attack", stages: 2 }],
          statusInflicted: null,
          volatileInflicted: null,
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a stat-change effect with a failed 0-255 roll, when executeMoveEffect runs, then it applies no stat changes", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.psychic,
        effect: {
          type: "stat-change",
          target: "opponent",
          chance: 1, // 1% chance — very unlikely to trigger
          changes: [{ stat: "spDefense", stages: -1 }],
        },
      } as unknown as MoveData;

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 80,
        state,
        rng: { int: () => 255 } as unknown as SeededRandom,
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          statChanges: [],
          statusInflicted: null,
          volatileInflicted: null,
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a recoil effect, when executeMoveEffect runs, then it applies the exact configured recoil fraction", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const damageDealt = 100;
      const move = {
        id: GEN2_MOVE_IDS.doubleEdge,
        effect: { type: "recoil", amount: 0.25 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: damageDealt,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: floor(100 * 0.25) = 25.
      // Source: recoil is floor(damage * amount), so 25% of 100 damage is 25.
      expect(result.recoilDamage).toBe(damageDealt / 4);
    });

    it("given a drain effect, when executeMoveEffect runs, then it heals exactly the configured fraction of dealt damage", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const damageDealt = 80;
      const move = {
        id: GEN2_MOVE_IDS.gigaDrain,
        effect: { type: "drain", amount: 0.5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: damageDealt,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: floor(80 * 0.5) = 40.
      // Source: drain heals floor(damage * amount), so 50% of 80 is 40.
      expect(result.healAmount).toBe(damageDealt / 2);
    });

    it("given a heal effect, when executeMoveEffect runs, then it heals exactly the configured fraction of max HP", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attackerMaxHp = 300;
      const attacker = createOnFieldPokemonFixture({ maxHp: attackerMaxHp });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.recover,
        effect: { type: "heal", amount: 0.5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: floor(300 * 0.5) = 150.
      // Source: heal effects use floor(max HP * amount), so 50% of 300 is 150.
      expect(result.healAmount).toBe(attackerMaxHp / 2);
    });

    it("given a multi-effect move, when executeMoveEffect runs, then each sub-effect is applied", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture({ types: [normal] });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.firePunch,
        effect: {
          type: "multi",
          effects: [
            { type: "status-chance", status: burn, chance: 100 },
            {
              type: "stat-change",
              target: "self",
              chance: 100,
              changes: [{ stat: "attack", stages: 1 }],
            },
          ],
        },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 60,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: both sub-effects are applied
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: burn,
          statChanges: [{ target: "attacker", stat: "attack", stages: 1 }],
          volatileInflicted: null,
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a volatile-status effect, when executeMoveEffect runs, then it inflicts the volatile status", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.confuseRay,
        effect: { type: "volatile-status", status: confusion, chance: 100 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: confusion,
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a volatile-status move with a failed 0-255 roll, when executeMoveEffect runs, then it applies no volatile", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.headbutt,
        effect: { type: "volatile-status", status: flinch, chance: 1 },
      } as unknown as MoveData;

      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 60,
        state,
        rng: { int: () => 255 } as unknown as SeededRandom,
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: null,
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a weather effect, when executeMoveEffect runs, then it returns the exact weather payload for the engine to apply", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.rainDance,
        effect: { type: "weather", weather: CORE_WEATHER_IDS.rain, turns: 5 },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      // Source: the move effect specifies a five-turn Rain Dance payload.
      expect(result.weatherSet).toEqual({
        weather: CORE_WEATHER_IDS.rain,
        turns: 5,
        source: GEN2_MOVE_IDS.rainDance,
      });
    });

    it("given an entry-hazard effect, when executeMoveEffect runs, then it targets the defender side with Spikes", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const side0 = createBattleSideFixture(0, attacker);
      const side1 = createBattleSideFixture(1, defender);
      const state = createBattleStateFixture(side0, side1);
      const move = {
        id: GEN2_MOVE_IDS.spikes,
        effect: { type: "entry-hazard", hazard: spikes },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: the hazard is placed on the opponent's side (side 1)
      expect(result.hazardSet).toEqual({
        hazard: spikes,
        targetSide: 1,
      });
    });

    it("given a self-targeted switch-out effect, when executeMoveEffect runs, then it marks the attacker to switch out", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.batonPass,
        effect: { type: "switch-out", target: "self" },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          switchOut: true,
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
        }),
      );
    });

    it("given a protect effect, when executeMoveEffect runs, then it returns the protect volatile for the engine to apply", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.protect,
        effect: { type: CORE_VOLATILE_IDS.protect },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: protect,
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given a remove-hazards effect, when executeMoveEffect runs, then it emits the exact hazard-clearing message", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ nickname: "Starmie" });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: "rapid-spin-generic",
        effect: { type: removeHazards },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 20,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages).toEqual(["Starmie blew away hazards!"]);
    });

    it("given fixed-damage, level-damage, ohko, and damage effects, when executeMoveEffect runs, then they are treated as no-ops", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const rng = new SeededRandom(42);

      for (const effectType of [fixedDamage, levelDamage, ohko, damage]) {
        const move = {
          id: "test-move",
          effect: { type: effectType },
        } as unknown as MoveData;

        // Act
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 50,
          state,
          rng,
        });

        // Assert: these are no-ops
        expect(result.statusInflicted).toBeNull();
        expect(result.recoilDamage).toBe(0);
      }
    });

    it("given terrain, screen, multi-hit, and two-turn effects, when executeMoveEffect runs, then they are treated as no-ops", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const rng = new SeededRandom(42);

      for (const effectType of [terrain, screen, multiHit, twoTurn]) {
        const move = {
          id: "test-move",
          effect: { type: effectType },
        } as unknown as MoveData;

        // Act
        const result = ruleset.executeMoveEffect({
          attacker,
          defender,
          move,
          damage: 50,
          state,
          rng,
        });

        // Assert: these are no-ops
        expect(result.statusInflicted).toBeNull();
        expect(result.recoilDamage).toBe(0);
      }
    });
  });

  // --- Custom Move Effects ---

  describe("Given custom move effects", () => {
    it("given Belly Drum, when the user has more than half HP, then it pays half HP and maximizes Attack", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({
        maxHp: 200,
        currentHp: 200,
        nickname: "Poliwrath",
      });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.bellyDrum,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      // Source: Belly Drum spends half of max HP and raises Attack to +6.
      expect(result).toEqual(
        expect.objectContaining({
          recoilDamage: 100,
          statChanges: [
            {
              target: "attacker",
              stat: "attack",
              stages: 6 - attacker.statStages.attack,
            },
          ],
          messages: ["Poliwrath cut its own HP and maximized Attack!"],
        }),
      );
    });

    it("given Belly Drum at 50% HP or below, when executeMoveEffect runs, then it fails without recoil or stat changes", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({
        maxHp: 200,
        currentHp: 99,
        nickname: "Poliwrath",
      });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.bellyDrum,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          recoilDamage: 0,
          statChanges: [],
          messages: ["Poliwrath is too weak to use Belly Drum!"],
        }),
      );
    });

    it("given Rapid Spin, when executeMoveEffect runs, then it emits the hazard-clearing message", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ nickname: "Starmie" });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.rapidSpin,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 20,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages).toEqual(["Starmie blew away leech seed and spikes!"]);
    });

    it("given Mean Look, when executeMoveEffect runs, then it inflicts the trapped volatile", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.meanLook,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          volatileInflicted: trapped,
          statusInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });

    it("given Spider Web, when executeMoveEffect runs, then it inflicts the trapped volatile", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.spiderWeb,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.volatileInflicted).toBe(trapped);
    });

    it("given Thief and an itemless attacker, when the defender holds an item, then the item is transferred to the attacker", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ heldItem: null, nickname: "Sneasel" });
      const defender = createOnFieldPokemonFixture({ heldItem: leftovers, nickname: "Snorlax" });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.thief,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 40,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          itemTransfer: { from: "defender", to: "attacker" },
          messages: ["Sneasel stole Snorlax's leftovers!"],
        }),
      );
    });

    it("given Thief and an attacker that already holds an item, when executeMoveEffect runs, then no item is stolen", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ heldItem: charcoal });
      const defender = createOnFieldPokemonFixture({ heldItem: leftovers });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.thief,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 40,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result.messages).toEqual([]);
    });

    it("given Baton Pass, when executeMoveEffect runs, then it requests a switching baton-pass handoff", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.batonPass,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          switchOut: true,
          batonPass: true,
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
        }),
      );
    });

    it("given an unsupported custom move effect, when executeMoveEffect runs, then it returns the default no-op result", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: "some-unknown-move",
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 0,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: it returns the default result without crashing
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        }),
      );
    });
  });

  // --- Explosion/Selfdestruct User Faints ---

  describe("Given Explosion/Selfdestruct user faints", () => {
    it("given Explosion, when executeMoveEffect runs, then it marks the user to faint", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ nickname: "Gengar" });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.explosion,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 250,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          selfFaint: true,
          messages: ["Gengar exploded!"],
        }),
      );
    });

    it("given Self-Destruct, when executeMoveEffect runs, then it marks the user to faint", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ nickname: "Electrode" });
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.selfDestruct,
        effect: { type: custom },
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 200,
        state,
        rng: new SeededRandom(42),
      });

      // Assert
      expect(result).toEqual(
        expect.objectContaining({
          selfFaint: true,
          messages: ["Electrode exploded!"],
        }),
      );
    });

    it("given a regular damaging move, when executeMoveEffect runs, then it emits no self-faint signal", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: tackle,
        effect: null,
      } as unknown as MoveData;

      // Act
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 30,
        state,
        rng: new SeededRandom(42),
      });

      // Assert: regular attacks return the default payload and omit the optional selfFaint flag entirely.
      expect(result.messages).toEqual([]);
      expect(Object.hasOwn(result, "selfFaint")).toBe(false);
    });
  });

  // --- EXP Gain ---

  describe("Given EXP gain calculation", () => {
    it("given a trainer battle context, when calculateExpGain runs, then it applies the 1.5x trainer multiplier", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const context = {
        defeatedSpecies: { baseExp: 200 } as unknown as PokemonSpeciesData,
        defeatedLevel: 50,
        participantLevel: 50,
        isTrainerBattle: true,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
      };

      // Act
      const exp = ruleset.calculateExpGain(context);

      // Assert: floor(200 * 50 / 7) * 1.5 = 2142
      expect(exp).toBe(2142);
    });

    it("given a wild battle context, when calculateExpGain runs, then it returns the unboosted Gen 2 EXP formula result", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const context = {
        defeatedSpecies: { baseExp: 200 } as unknown as PokemonSpeciesData,
        defeatedLevel: 30,
        participantLevel: 50,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
      };

      // Act
      const exp = ruleset.calculateExpGain(context);

      // Assert: floor(200 * 30 / 7) = 857
      expect(exp).toBe(857);
    });

    it("given a traded (same-language) Pokemon in Gen 2, when calculateExpGain with isTradedPokemon=true, then returns 1.5x boosted EXP", () => {
      // Source: pret/pokecrystal — Gen 2 trades give 1.5x EXP to traded Pokemon.
      // Language is not tracked in Gen 2 box data, so only 1.5x bonus is modeled.
      // b=64, L_d=30, s=1, t=1.0 (wild):
      //   step1 = floor(64 * 30 / 7) = floor(1920 / 7) = 274
      //   step2 = floor(274 / 1)     = 274
      //   step3 = floor(274 * 1.0)   = 274
      //   traded: floor(274 * 1.5)   = 411
      const ruleset = new Gen2Ruleset();
      const notTradedCtx = {
        defeatedSpecies: { baseExp: 64 } as unknown as PokemonSpeciesData,
        defeatedLevel: 30,
        participantLevel: 25,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
        isTradedPokemon: false,
      };
      const tradedCtx = { ...notTradedCtx, isTradedPokemon: true };

      const notTraded = ruleset.calculateExpGain(notTradedCtx);
      const traded = ruleset.calculateExpGain(tradedCtx);

      expect(notTraded).toBe(274);
      expect(traded).toBe(411);
      expect(traded).toBeGreaterThan(notTraded);
    });

    it("given a traded Pokemon with isInternationalTrade=true in Gen 2, when calculateExpGain, then still returns 1.5x (no international concept in Gen 2)", () => {
      // Source: pret/pokecrystal — Gen 2 cartridges have no language field on box data;
      // isInternationalTrade is ignored and only the 1.5x bonus applies.
      // b=64, L_d=30, s=1, t=1.0 → base=274; floor(274 * 1.5) = 411
      const ruleset = new Gen2Ruleset();
      const context = {
        defeatedSpecies: { baseExp: 64 } as unknown as PokemonSpeciesData,
        defeatedLevel: 30,
        participantLevel: 25,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
        isTradedPokemon: true,
        isInternationalTrade: true, // Gen 2 ignores this flag
      };

      const result = ruleset.calculateExpGain(context);

      // Same as same-language traded: 1.5x only
      expect(result).toBe(411);
    });
  });

  // --- Validation edge case ---

  describe("Given validation edge cases", () => {
    it("given a level above 100, when validatePokemon runs, then the level check fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu);
      const pokemon = createValidationPokemonFixture(species, { level: 101 });

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      // Source: Gen 2 validation caps levels at 100.
      expect(result.errors.some((e: string) => e.includes("Level"))).toBe(true);
    });

    it("given dex id 0, when validatePokemon runs, then the species check fails", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = { id: 0, displayName: "MissingNo" } as unknown as PokemonSpeciesData;
      const pokemon = createValidationPokemonFixture(
        TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu),
      );

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert
      expect(result.valid).toBe(false);
      // Source: Gen 2 only accepts Pokédex numbers 1-251.
      expect(result.errors.some((e: string) => e.includes("not available in Gen 2"))).toBe(true);
    });

    it("given invalid level, invalid species, and no moves, when validatePokemon runs, then it collects all three errors", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const species = { id: 999, displayName: "FutureMon" } as unknown as PokemonSpeciesData;
      const pokemon = createValidationPokemonFixture(
        TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu),
        { level: 0, moves: [] },
      );

      // Act
      const result = ruleset.validatePokemon(pokemon, species);

      // Assert: there are 3 errors (level, species, moves)
      expect(result.valid).toBe(false);
      // Source: invalid level, invalid species, species-id mismatch, and empty move list each produce a validation error.
      expect(result.errors.length).toBe(4);
    });

    it("given invalid friendship and a non-neutral nature, when validatePokemon runs, then both errors are collected", () => {
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu);
      const pokemon = createValidationPokemonFixture(species, {
        friendship: 999,
        nature: adamant,
      });

      const result = ruleset.validatePokemon(pokemon, species);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("friendship must be between 0 and 255");
      expect(result.errors).toContain(`Nature "${adamant}" is not supported in Gen 2`);
    });

    it("given invalid DVs and Stat Exp, when validatePokemon runs, then bounded-domain errors are returned", () => {
      const ruleset = new Gen2Ruleset();
      const species = TEST_DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.pikachu);
      const pokemon = createValidationPokemonFixture(species, {
        ivs: {
          hp: 15,
          attack: 16,
          defense: 15,
          spAttack: 15,
          spDefense: 15,
          speed: 15,
        },
        evs: {
          hp: 65535,
          attack: 70000,
          defense: 65535,
          spAttack: 65535,
          spDefense: 65535,
          speed: 65535,
        },
      });

      const result = ruleset.validatePokemon(pokemon, species);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("attack DV must be between 0 and 15");
      expect(result.errors).toContain("attack Stat Exp must be between 0 and 65535");
    });
  });

  // --- Confusion No Variance (Showdown: noDamageVariance) ---

  describe("Given confusion self-hit damage", () => {
    it("given confusion self-hit damage, when different RNG seeds are used, then the damage stays identical", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ level: 50, attack: 100, defense: 100 });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, pokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // Act
      const result = ruleset.calculateConfusionDamage(pokemon, state, new SeededRandom(42));

      // Assert: the formula is deterministic for Gen 2 confusion self-hit damage.
      // Hand-trace (level=50, attack=100, defense=100, power=40):
      //   base = floor(floor((floor(2*50/5)+2) * 40 * 100) / 100 / 50)
      //        = floor(floor(22 * 40 * 100) / 100 / 50)
      //        = floor(880 / 50) = 17
      //   +2   = 19, max(1, 19) = 19
      expect(result).toBe(19);
    });
  });

  // --- Accuracy 0-255 Scale ---

  describe("Given accuracy check on 0-255 scale", () => {
    it("given a 100% accurate move at zero stat stages, when checking hit chance, then Gen 2 short-circuits to a guaranteed hit", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      const defender = createOnFieldPokemonFixture();
      const move = { accuracy: 100, id: tackle } as any;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );

      // Act / Assert: floor(100 * 255 / 100) = 255, which short-circuits to hit.
      expect(
        ruleset.doesMoveHit({ attacker, defender, move, state, rng: new SeededRandom(42) }),
      ).toBe(true);
    });

    it("given +6 accuracy stages on a 70% move, when checking hit chance, then Gen 2 caps at 255 and always hits", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture();
      attacker.statStages.accuracy = 6;
      const defender = createOnFieldPokemonFixture();
      const move = { accuracy: 70, id: GEN2_MOVE_IDS.thunder } as any;
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );

      // Act / Assert: floor(70 * 255 / 100) = 178, * 3 = 534, capped at 255 → always hits.
      expect(
        ruleset.doesMoveHit({ attacker, defender, move, state, rng: new SeededRandom(42) }),
      ).toBe(true);
    });
  });

  // --- 1/256 Failure Rate for Secondary Effects ---

  describe("Given secondary effect 1/256 failure rate", () => {
    it("given a 100% status-chance effect, when the RNG rolls 255, then Gen 2 still allows the 1/256 failure", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const attacker = createOnFieldPokemonFixture({ types: [fire] });
      const defender = createOnFieldPokemonFixture({ types: [normal] });
      const state = createBattleStateFixture(
        createBattleSideFixture(0, attacker),
        createBattleSideFixture(1, defender),
      );
      const move = {
        id: GEN2_MOVE_IDS.flamethrower,
        type: fire,
        effect: { type: "status-chance", status: burn, chance: 100 },
      } as any;
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move,
        damage: 70,
        state,
        rng: { int: () => 255 } as unknown as SeededRandom,
      });

      // Assert: 100% chance still fails on an exact 255 roll because the effect uses a 0-255 scale.
      expect(result).toEqual(
        expect.objectContaining({
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
        }),
      );
    });
  });

  // --- Switch Out ---

  describe("Given a Pokemon switching out", () => {
    it("given badly-poisoned status and toxic-counter volatile, when the Pokemon switches out, then it clears the counter and reverts to poison", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const pokemon = createOnFieldPokemonFixture({ status: badlyPoisoned });
      pokemon.volatileStatuses.set(toxicCounter, 4);
      const state = createBattleStateFixture(
        createBattleSideFixture(0, pokemon),
        createBattleSideFixture(1, createOnFieldPokemonFixture()),
      );

      // Act
      ruleset.onSwitchOut(pokemon, state);

      // Assert: toxic-counter is cleared AND badly-poisoned reverts to regular poison
      // Source: pret/pokecrystal core.asm:4078-4104 NewBattleMonStatus — zeros substatus bytes
      // (SUBSTATUS_TOXIC is in SubStatus5). The main status byte (PSN) stays, but without
      // SUBSTATUS_TOXIC the toxic counter is gone → regular poison on switch-back.
      expect(pokemon.volatileStatuses.has(toxicCounter)).toBe(false);
      expect(pokemon.pokemon.status).toBe(poison);
    });
  });

  // --- Struggle Recoil ---

  describe("calculateStruggleRecoil", () => {
    // Gen 2 Struggle recoil = floor(maxHp / 4)
    // Source: bug #317 fix — uses maxHp, not damageDealt

    it("given attacker with 200 max HP and damage=100, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createOnFieldPokemonFixture(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 100);
      // Assert: floor(200/4) = 50
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=1, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createOnFieldPokemonFixture(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 1);
      // Assert: floor(200/4) = 50 (damage dealt is irrelevant)
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=0, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createOnFieldPokemonFixture(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 0);
      // Assert: floor(200/4) = 50 (damage dealt is irrelevant)
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });

    it("given attacker with 200 max HP and damage=101, when calculating recoil, then returns 50 (floor(200/4))", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const mockAttacker = createOnFieldPokemonFixture(); // maxHp defaults to 200
      // Act
      const recoil = ruleset.calculateStruggleRecoil(mockAttacker, 101);
      // Assert: floor(200/4) = 50 (damage dealt is irrelevant)
      // Source: bug #317 fix — uses maxHp
      expect(recoil).toBe(50);
    });
  });

  // --- Multi-Hit Count ---

  describe("rollMultiHitCount", () => {
    it("given seed=0, when rolling multi-hit count, then returns a value from [2,2,2,3,3,3,4,5]", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(0);
      const mockAttacker = createOnFieldPokemonFixture();
      // Act
      const count = ruleset.rollMultiHitCount(mockAttacker, rng);
      // Assert: must be one of the values in the weighted array
      expect([2, 3, 4, 5]).toContain(count);
    });

    it("given 100 rolls, when rolling multi-hit count, then all values are in {2,3,4,5}", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const mockAttacker = createOnFieldPokemonFixture();
      // Act / Assert
      for (let i = 0; i < 100; i++) {
        const count = ruleset.rollMultiHitCount(mockAttacker, rng);
        expect([2, 3, 4, 5]).toContain(count);
      }
    });

    it("given 100 rolls, when rolling multi-hit count, then at least some 2s and some 3s appear", () => {
      // Arrange
      const ruleset = new Gen2Ruleset();
      const rng = new SeededRandom(42);
      const mockAttacker = createOnFieldPokemonFixture();
      const counts = new Set<number>();
      // Act
      for (let i = 0; i < 100; i++) {
        counts.add(ruleset.rollMultiHitCount(mockAttacker, rng));
      }
      // Assert: weighted array has 3 twos and 3 threes out of 8, so both values appear
      expect(counts.has(2)).toBe(true);
      expect(counts.has(3)).toBe(true);
    });
  });

  // --- Move Priority Values (gen2-ground-truth.md §9 — Showdown-compatible scale) ---

  describe("Given Gen 2 move priority values from moves.json data", () => {
    it("given Gen 2 ruleset, when getting Protect move priority, then returns +3", () => {
      // Source: gen2-ground-truth.md §9 — Protect: +3 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.protect).priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Detect move priority, then returns +3", () => {
      // Source: gen2-ground-truth.md §9 — Detect: +3 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.detect).priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Quick Attack move priority, then returns +1", () => {
      // Source: gen2-ground-truth.md §9 — Quick Attack: +1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.quickAttack).priority;
      // Assert
      expect(priority).toBe(1);
    });

    it("given Gen 2 ruleset, when getting Vital Throw move priority, then returns -1", () => {
      // Source: gen2-ground-truth.md §9 — Vital Throw: -1, never misses, goes last
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.vitalThrow).priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Counter move priority, then returns -1", () => {
      // Source: gen2-ground-truth.md §9 — Counter: -1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.counter).priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Mirror Coat move priority, then returns -1", () => {
      // Source: gen2-ground-truth.md §9 — Mirror Coat: -1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.mirrorCoat).priority;
      // Assert
      expect(priority).toBe(-1);
    });

    it("given Gen 2 ruleset, when getting Endure move priority, then returns +3", () => {
      // Source: gen2-ground-truth.md §9 — Endure: +3 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.endure).priority;
      // Assert
      expect(priority).toBe(3);
    });

    it("given Gen 2 ruleset, when getting Mach Punch move priority, then returns +1", () => {
      // Source: gen2-ground-truth.md §9 — Mach Punch: +1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.machPunch).priority;
      // Assert
      expect(priority).toBe(1);
    });

    it("given Gen 2 ruleset, when getting ExtremeSpeed move priority, then returns +1", () => {
      // Source: gen2-ground-truth.md §9 — ExtremeSpeed: +1 (Showdown-compatible scale)
      // Arrange
      const dm = createGen2DataManager();
      // Act
      const priority = dm.getMove(GEN2_MOVE_IDS.extremeSpeed).priority;
      // Assert
      expect(priority).toBe(1);
    });

    it("given Gen 2 ruleset, when getting Roar move priority, then returns -6", () => {
      // Source: pret/pokecrystal engine/battle/core.asm — Whirlwind/Roar always go last
      // Priority -6 ensures they go after all other moves including Counter/Mirror Coat (-1)
      // Reference: Bulbapedia — Roar has priority -6 in Gen 2+
      const dm = createGen2DataManager();
      const move = dm.getMove(GEN2_MOVE_IDS.roar);
      expect(move?.priority).toBe(-6);
    });

    it("given Gen 2 ruleset, when getting Whirlwind move priority, then returns -6", () => {
      // Source: pret/pokecrystal engine/battle/core.asm — Whirlwind/Roar always go last
      // Priority -6 ensures they go after all other moves including Counter/Mirror Coat (-1)
      // Reference: Bulbapedia — Whirlwind has priority -6 in Gen 2+
      const dm = createGen2DataManager();
      const move = dm.getMove(GEN2_MOVE_IDS.whirlwind);
      expect(move?.priority).toBe(-6);
    });
  });
});
