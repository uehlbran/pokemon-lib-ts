import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  createDvs,
  createFriendship,
  createStatExp,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen1Ruleset } from "../../src";

/**
 * Gen 1 Struggle Damage Tests
 *
 * Verifies that calculateStruggleDamage correctly applies Normal-type effectiveness
 * in Gen 1 — specifically that Ghost-type defenders are immune (Normal = 0x vs Ghost).
 */

const ruleset = new Gen1Ruleset();
const ABILITY_IDS = CORE_ABILITY_IDS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const GENDERS = CORE_GENDERS;
const ITEM_IDS = CORE_ITEM_IDS;
const MOVE_IDS = CORE_MOVE_IDS;
const NATURE_IDS = CORE_NATURE_IDS;
const TYPE_IDS = CORE_TYPE_IDS;

function createSyntheticOnFieldPokemon(
  overrides: Partial<{
    level: number;
    attack: number;
    defense: number;
    types: PokemonType[];
    speciesId: number;
  }> = {},
): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: overrides.speciesId ?? 25,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURE_IDS.hardy,
      ivs: createDvs(),
      evs: createStatExp(),
      moves: [{ moveId: MOVE_IDS.struggle, currentPP: 1, maxPP: 1, ppUps: 0 }],
      currentHp: 100,
      status: null,
      friendship: createFriendship(70),
      heldItem: null,
      ability: ABILITY_IDS.none,
      abilitySlot: ABILITY_SLOTS.normal1,
      gender: GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: ITEM_IDS.pokeBall,
      calculatedStats: {
        hp: 100,
        attack: overrides.attack ?? 80,
        defense: overrides.defense ?? 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
      },
    } as PokemonInstance,
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
    types: overrides.types ?? [TYPE_IDS.electric],
    ability: ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 1,
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
  };
}

function createBattleState(seed = 42): BattleState {
  const rng = new SeededRandom(seed);
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0 as const,
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
      },
      {
        index: 1 as const,
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
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: null,
    turnOrder: [],
    rng,
  } as unknown as BattleState;
}

describe("Gen1Ruleset.calculateStruggleDamage", () => {
  describe("Given a Ghost-type defender", () => {
    it("should return 0 damage (Normal type is immune vs Ghost in Gen 1)", () => {
      // Arrange
      const attacker = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.normal], attack: 80 });
      const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.ghost], defense: 60 });
      const state = createBattleState(99);

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — Ghost is immune to Normal-type moves in Gen 1
      expect(damage).toBe(0);
    });
  });

  describe("Given a non-Ghost-type defender", () => {
    it("should return exact damage against a Normal-type defender", () => {
      // Arrange
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.normal],
        level: 50,
        attack: 80,
      });
      const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.normal], defense: 60 });
      const state = createBattleState(99);
      const seed = 99;

      // Act
      const expectedRandomRoll = new SeededRandom(seed).int(217, 255);
      const initialRngState = state.rng.getState();
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — this test derives the expected damage from the same Gen 1 math
      // used by calculateDamage, using the live battle RNG roll for seed 99.
      // Source: pret/pokered — Struggle is Normal-type BP=50 in Gen 1
      // L50, Atk=80, Def=60, STAB (attacker types: [normal] matches move type normal):
      //   levelFactor = floor(2*50/5)+2 = 22
      //   inner = floor(22*50*80) / 60 = floor(88000) / 60 = floor(1466.67) = 1466
      //   baseDamage = floor(1466/50)+2 = 29+2 = 31
      //   STAB: floor(31 * 1.5) = 46
      //   Normal vs Normal type: 1x → 46
      //   Seed 99 → RNG roll 227 from SeededRandom(99).int(217, 255)
      //   Random factor: floor(46 * 227 / 255) = 40
      expect(damage).toBe(40);
      expect(state.rng.getState()).not.toBe(initialRngState);
      expect(expectedRandomRoll).toBe(227);
    });

    it("given different battle RNG seeds, when calculating Struggle damage, then the damage roll changes", () => {
      // Arrange
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.normal],
        level: 50,
        attack: 80,
      });
      const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.normal], defense: 60 });
      const lowRollState = createBattleState(99);
      const highRollState = createBattleState(1);
      const lowRollExpected = new SeededRandom(99).int(217, 255);
      const highRollExpected = new SeededRandom(1).int(217, 255);

      // Act
      const lowRollDamage = ruleset.calculateStruggleDamage(attacker, defender, lowRollState);
      const highRollDamage = ruleset.calculateStruggleDamage(attacker, defender, highRollState);

      // Assert — seed 99 → RNG roll 227, seed 1 → RNG roll 241.
      // That keeps the hardcoded damage expectations traceable:
      //   seed 99 => floor(46 * 227 / 255) = 40
      //   seed 1  => floor(46 * 241 / 255) = 43
      expect(lowRollExpected).toBe(227);
      expect(highRollExpected).toBe(241);
      expect(lowRollDamage).toBe(40);
      expect(highRollDamage).toBe(43);
    });

    it("should return exact damage against an Electric-type defender", () => {
      // Arrange
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.fire],
        level: 50,
        attack: 100,
      });
      const defender = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.electric],
        defense: 80,
      });
      const state = createBattleState(99);
      const seed = 99;

      // Act
      const expectedRandomRoll = new SeededRandom(seed).int(217, 255);
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — this test derives the expected damage from the same Gen 1 math
      // used by calculateDamage, using the live battle RNG roll for seed 99.
      // Source: pret/pokered — Struggle is Normal-type BP=50 in Gen 1
      // L50, Atk=100, Def=80, no STAB (fire != normal):
      //   levelFactor = floor(2*50/5)+2 = 22
      //   inner = floor(22*50*100) / 80 = floor(110000) / 80 = floor(1375) = 1375
      //   baseDamage = floor(1375/50)+2 = 27+2 = 29
      //   No STAB, Normal vs Electric = 1x → 29
      //   Seed 99 → RNG roll 227 from SeededRandom(99).int(217, 255)
      //   Random factor: floor(29 * 227 / 255) = 25
      expect(damage).toBe(25);
      expect(expectedRandomRoll).toBe(227);
    });

    it("should return at least 1 damage even against high-defense defenders", () => {
      // Arrange — extremely high defense, very low attack
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.normal],
        level: 1,
        attack: 5,
      });
      const defender = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.rock],
        defense: 999,
      });
      const state = createBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — minimum damage is 1 per Gen 1 rules
      expect(damage).toBeGreaterThanOrEqual(1);
    });
  });
});
