import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

/**
 * Gen 2 Struggle Damage Tests
 *
 * Verifies that calculateStruggleDamage computes typeless physical damage in Gen 2.
 * Ghost-type defenders are NOT immune — Struggle is typeless (no type chart applied).
 */

const ruleset = new Gen2Ruleset();

function makeActivePokemon(
  overrides: Partial<{
    level: number;
    attack: number;
    defense: number;
    types: PokemonType[];
  }> = {},
): ActivePokemon {
  const attack = overrides.attack ?? 80;
  const defense = overrides.defense ?? 60;
  return {
    pokemon: {
      speciesId: 1,
      level: overrides.level ?? 50,
      currentHp: 100,
      status: null,
      heldItem: null,
      nickname: null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: "struggle", pp: 1, maxPp: 1 }],
      calculatedStats: {
        hp: 100,
        attack,
        defense,
        spAttack: 80,
        spDefense: 60,
        speed: 100,
      },
    } as unknown as PokemonInstance,
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
    types: overrides.types ?? (["normal"] as PokemonType[]),
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

function makeBattleState(): BattleState {
  const rng = new SeededRandom(42);
  return {
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
    turn: 1,
    format: { id: "singles", slots: 1 },
    rng,
  } as unknown as BattleState;
}

describe("Gen2Ruleset.calculateStruggleDamage", () => {
  describe("Given a Ghost-type defender", () => {
    it("should return positive damage (Struggle is typeless — Ghost immunity does NOT apply in Gen 2)", () => {
      // Arrange
      const attacker = makeActivePokemon({ types: ["normal"], level: 50, attack: 80 });
      const defender = makeActivePokemon({ types: ["ghost"], defense: 60 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — Struggle is typeless in Gen 2, no immunity applies
      // Source: pret/pokecrystal engine/battle/effect_commands.asm — Struggle formula: floor((2*L/5+2)*50*Atk/Def/50)+2
      // L50, Atk=80, Def=60 → levelFactor=floor(2*50/5)+2=22, floor(22*50*80/60/50)+2=floor(29.33)+2=31
      expect(damage).toBe(31);
    });
  });

  describe("Given a non-Ghost-type defender", () => {
    it("should return positive damage against a Normal-type defender", () => {
      // Arrange
      const attacker = makeActivePokemon({ types: ["normal"], level: 50, attack: 80 });
      const defender = makeActivePokemon({ types: ["normal"], defense: 60 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert
      // Source: pret/pokecrystal engine/battle/effect_commands.asm — Struggle formula: floor((2*L/5+2)*50*Atk/Def/50)+2
      // L50, Atk=80, Def=60 → levelFactor=floor(2*50/5)+2=22, floor(22*50*80/60/50)+2=floor(29.33)+2=31
      expect(damage).toBe(31);
    });

    it("should return at least 1 damage even against high-defense defenders", () => {
      // Arrange — extremely high defense, very low attack
      const attacker = makeActivePokemon({ types: ["normal"], level: 1, attack: 5 });
      const defender = makeActivePokemon({ types: ["rock"], defense: 999 });
      const state = makeBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — minimum damage is 1
      expect(damage).toBeGreaterThanOrEqual(1);
    });

    it("should scale with attacker level and stats", () => {
      // Arrange — two attackers with different levels
      const weakAttacker = makeActivePokemon({ level: 5, attack: 20, defense: 30 });
      const strongAttacker = makeActivePokemon({ level: 100, attack: 200, defense: 30 });
      const defender = makeActivePokemon({ defense: 100 });
      const state = makeBattleState();

      // Act
      const weakDamage = ruleset.calculateStruggleDamage(weakAttacker, defender, state);
      const strongDamage = ruleset.calculateStruggleDamage(strongAttacker, defender, state);

      // Assert — stronger/higher level attacker deals more damage
      expect(strongDamage).toBeGreaterThan(weakDamage);
    });
  });
});
