import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen1Ruleset } from "../src";

/**
 * Gen 1 Struggle Damage Tests
 *
 * Verifies that calculateStruggleDamage correctly applies Normal-type effectiveness
 * in Gen 1 — specifically that Ghost-type defenders are immune (Normal = 0x vs Ghost).
 */

const ruleset = new Gen1Ruleset();

function makeActivePokemon(
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
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: "struggle", currentPP: 1, maxPP: 1, ppUps: 0 }],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
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
    types: overrides.types ?? (["electric"] as PokemonType[]),
    ability: "",
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

function makeBattleState(): BattleState {
  const rng = new SeededRandom(42);
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
      const attacker = makeActivePokemon({ types: ["normal"], attack: 80 });
      const defender = makeActivePokemon({ types: ["ghost"], defense: 60 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — Ghost is immune to Normal-type moves in Gen 1
      expect(damage).toBe(0);
    });
  });

  describe("Given a non-Ghost-type defender", () => {
    it("should return exact damage against a Normal-type defender", () => {
      // Arrange
      const attacker = makeActivePokemon({ types: ["normal"], level: 50, attack: 80 });
      const defender = makeActivePokemon({ types: ["normal"], defense: 60 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — calculateStruggleDamage uses SeededRandom(0); seed 0 → int(217,255) = 227
      // Source: pret/pokered — Struggle is Normal-type BP=50 in Gen 1
      // L50, Atk=80, Def=60, STAB (attacker types: [normal] matches move type normal):
      //   levelFactor = floor(2*50/5)+2 = 22
      //   inner = floor(22*50*80) / 60 = floor(88000) / 60 = floor(1466.67) = 1466
      //   baseDamage = floor(1466/50)+2 = 29+2 = 31
      //   STAB: floor(31 * 1.5) = 46
      //   Normal vs Normal type: 1x → 46
      //   Random: floor(46 * 227 / 255) = floor(10442/255) = 40
      expect(damage).toBe(40);
    });

    it("should return exact damage against an Electric-type defender", () => {
      // Arrange
      const attacker = makeActivePokemon({ types: ["fire"], level: 50, attack: 100 });
      const defender = makeActivePokemon({ types: ["electric"], defense: 80 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — calculateStruggleDamage uses SeededRandom(0); seed 0 → int(217,255) = 227
      // Source: pret/pokered — Struggle is Normal-type BP=50 in Gen 1
      // L50, Atk=100, Def=80, no STAB (fire != normal):
      //   levelFactor = floor(2*50/5)+2 = 22
      //   inner = floor(22*50*100) / 80 = floor(110000) / 80 = floor(1375) = 1375
      //   baseDamage = floor(1375/50)+2 = 27+2 = 29
      //   No STAB, Normal vs Electric = 1x → 29
      //   Random: floor(29 * 227 / 255) = floor(6583/255) = 25
      expect(damage).toBe(25);
    });

    it("should return at least 1 damage even against high-defense defenders", () => {
      // Arrange — extremely high defense, very low attack
      const attacker = makeActivePokemon({ types: ["normal"], level: 1, attack: 5 });
      const defender = makeActivePokemon({ types: ["rock"], defense: 999 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — minimum damage is 1 per Gen 1 rules
      expect(damage).toBeGreaterThanOrEqual(1);
    });
  });
});
