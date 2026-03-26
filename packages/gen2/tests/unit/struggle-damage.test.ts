import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
import { CORE_MOVE_IDS, CORE_TYPE_IDS, createMoveSlot, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";
import { createSyntheticOnFieldPokemon as createSharedSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

/**
 * Gen 2 Struggle Damage Tests
 *
 * Verifies that calculateStruggleDamage computes typeless physical damage in Gen 2.
 * Ghost-type defenders are NOT immune — Struggle is typeless (no type chart applied).
 */

const ruleset = new Gen2Ruleset();
const TYPE_IDS = CORE_TYPE_IDS;

function createSyntheticOnFieldPokemon(
  overrides: Partial<{
    level: number;
    attack: number;
    defense: number;
    types: PokemonType[];
  }> = {},
): ActivePokemon {
  const attack = overrides.attack ?? 80;
  const defense = overrides.defense ?? 60;
  const pokemon = createSharedSyntheticOnFieldPokemon({
    level: overrides.level ?? 50,
    currentHp: 100,
    calculatedStats: {
      hp: 100,
      attack,
      defense,
      spAttack: 80,
      spDefense: 60,
      speed: 100,
    },
    moveSlots: [createMoveSlot(CORE_MOVE_IDS.struggle, 1)],
    types: overrides.types ?? [TYPE_IDS.normal],
  });
  pokemon.ability = "";
  return pokemon;
}

function createBattleState(): BattleState {
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
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.normal],
        level: 50,
        attack: 80,
      });
      const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.ghost], defense: 60 });
      const state = createBattleState();

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
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.normal],
        level: 50,
        attack: 80,
      });
      const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.normal], defense: 60 });
      const state = createBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert
      // Source: pret/pokecrystal engine/battle/effect_commands.asm — Struggle formula: floor((2*L/5+2)*50*Atk/Def/50)+2
      // L50, Atk=80, Def=60 → levelFactor=floor(2*50/5)+2=22, floor(22*50*80/60/50)+2=floor(29.33)+2=31
      expect(damage).toBe(31);
    });

    it("should return at least 1 damage even against high-defense defenders", () => {
      // Arrange — extremely high defense, very low attack
      const attacker = createSyntheticOnFieldPokemon({
        types: [TYPE_IDS.normal],
        level: 1,
        attack: 5,
      });
      const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.rock], defense: 999 });
      const state = createBattleState();

      // Act
      const damage = ruleset.calculateStruggleDamage(attacker, defender, state);

      // Assert — minimum damage is 1
      expect(damage).toBeGreaterThanOrEqual(1);
    });

    it("should scale with attacker level and stats", () => {
      // Arrange — two attackers with different levels
      const weakAttacker = createSyntheticOnFieldPokemon({ level: 5, attack: 20, defense: 30 });
      const strongAttacker = createSyntheticOnFieldPokemon({
        level: 100,
        attack: 200,
        defense: 30,
      });
      const defender = createSyntheticOnFieldPokemon({ defense: 100 });
      const state = createBattleState();

      // Act
      const weakDamage = ruleset.calculateStruggleDamage(weakAttacker, defender, state);
      const strongDamage = ruleset.calculateStruggleDamage(strongAttacker, defender, state);

      // Assert — stronger/higher level attacker deals more damage
      expect(strongDamage).toBeGreaterThan(weakDamage);
    });
  });
});
