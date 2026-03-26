import {
  CORE_ABILITY_IDS,
  CORE_MOVE_IDS,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { createGen1DataManager, GEN1_SPECIES_IDS } from "@pokemon-lib-ts/gen1";
import { describe, expect, it } from "vitest";
import { RandomAI } from "../../../src/ai/RandomAI";
import type { AvailableMove } from "../../../src/context";
import type { BattleState } from "../../../src/state";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

const GEN1_DATA_MANAGER = createGen1DataManager();
const TACKLE_SLOT = createMoveSlot(
  CORE_MOVE_IDS.tackle,
  GEN1_DATA_MANAGER.getMove(CORE_MOVE_IDS.tackle).pp,
);
const SCRATCH_SLOT = createMoveSlot(
  CORE_MOVE_IDS.scratch,
  GEN1_DATA_MANAGER.getMove(CORE_MOVE_IDS.scratch).pp,
);
const CHARIZARD_TYPES = [...GEN1_DATA_MANAGER.getSpecies(GEN1_SPECIES_IDS.charizard).types];
const BLASTOISE_TYPES = [...GEN1_DATA_MANAGER.getSpecies(GEN1_SPECIES_IDS.blastoise).types];

function createTestState(
  overrides?: Partial<{
    team1Hp: number[];
    team2Hp: number[];
    team1Pp: number[];
  }>,
): BattleState {
  const rng = new SeededRandom(42);

  const team1 = [
    createTestPokemon(GEN1_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        {
          ...TACKLE_SLOT,
          currentPP: overrides?.team1Pp?.[0] ?? TACKLE_SLOT.currentPP,
        },
        {
          ...SCRATCH_SLOT,
          currentPP: overrides?.team1Pp?.[1] ?? SCRATCH_SLOT.currentPP,
        },
      ],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 120,
      },
      currentHp: overrides?.team1Hp?.[0] ?? 200,
      ability: CORE_ABILITY_IDS.none,
    }),
    createTestPokemon(GEN1_SPECIES_IDS.pikachu, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
      moves: [{ ...TACKLE_SLOT }],
      calculatedStats: {
        hp: 120,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 80,
        speed: 130,
      },
      currentHp: overrides?.team1Hp?.[1] ?? 120,
      ability: CORE_ABILITY_IDS.none,
    }),
  ];

  const team2 = [
    createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ ...TACKLE_SLOT }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: overrides?.team2Hp?.[0] ?? 200,
      ability: CORE_ABILITY_IDS.none,
    }),
  ];

  return {
    phase: "action-select",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: team1,
        active: [createOnFieldPokemon(team1[0], 0, CHARIZARD_TYPES)],
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
        index: 1,
        trainer: null,
        team: team2,
        active: [createOnFieldPokemon(team2[0], 0, BLASTOISE_TYPES)],
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
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    ended: false,
    winner: null,
  };
}

function createAvailableMoves(state: BattleState, side: 0 | 1): AvailableMove[] {
  const active = state.sides[side].active[0];
  if (!active) {
    return [];
  }

  return active.pokemon.moves.map((slot, index) => {
    const move = GEN1_DATA_MANAGER.getMove(slot.moveId);
    return {
      index,
      moveId: slot.moveId,
      displayName: move.displayName,
      type: move.type,
      category: move.category,
      pp: slot.currentPP,
      maxPp: slot.maxPP,
      disabled: slot.currentPP <= 0,
      disabledReason: slot.currentPP <= 0 ? "No PP remaining" : undefined,
    };
  });
}

describe("RandomAI", () => {
  describe("chooseAction", () => {
    it("given an active pokemon with available moves, when chooseAction is called, then a move action is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(123);

      // Act
      const action = ai.chooseAction(0, state, ruleset, rng, createAvailableMoves(state, 0));

      // Assert
      expect(action.type).toBe("move");
      expect(action.side).toBe(0);
      if (action.type === "move") {
        expect(action.moveIndex).toBeGreaterThanOrEqual(0);
        expect(action.moveIndex).toBeLessThan(2); // 2 moves available
      }
    });

    it("given a pokemon with no PP on any move, when chooseAction is called, then struggle is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState({ team1Pp: [0, 0] });
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(123);

      // Act
      const action = ai.chooseAction(0, state, ruleset, rng, createAvailableMoves(state, 0));

      // Assert
      expect(action.type).toBe("struggle");
      expect(action.side).toBe(0);
    });

    it("given the same seed, when chooseAction is called twice, then same result is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();

      // Act
      const rng1 = new SeededRandom(42);
      const action1 = ai.chooseAction(0, state, ruleset, rng1, createAvailableMoves(state, 0));
      const rng2 = new SeededRandom(42);
      const action2 = ai.chooseAction(0, state, ruleset, rng2, createAvailableMoves(state, 0));

      // Assert
      expect(action1).toEqual(action2);
    });

    it("given multiple calls with advancing RNG, when chooseAction is called many times, then all moves are chosen at least once", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(1);

      const moveIndices = new Set<number>();

      // Act — call many times
      for (let i = 0; i < 100; i++) {
        const action = ai.chooseAction(0, state, ruleset, rng, createAvailableMoves(state, 0));
        if (action.type === "move") {
          moveIndices.add(action.moveIndex);
        }
      }

      // Assert — both moves should have been chosen at least once
      expect(moveIndices.has(0)).toBe(true);
      expect(moveIndices.has(1)).toBe(true);
    });
  });

  describe("chooseSwitchIn", () => {
    it("given alive bench pokemon, when chooseSwitchIn is called, then a valid team slot is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(123);

      // Act
      const slot = ai.chooseSwitchIn(0, state, ruleset, rng);

      // Assert
      expect(slot).toBe(1); // Only Pikachu is on the bench and alive
    });

    it("given no alive bench pokemon, when chooseSwitchIn is called, then null is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState({ team1Hp: [200, 0] }); // Pikachu fainted
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(123);

      // Act
      const slot = ai.chooseSwitchIn(0, state, ruleset, rng);

      expect(slot).toBeNull();
    });

    it("given the same seed, when chooseSwitchIn is called twice, then same result is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();

      // Act
      const rng1 = new SeededRandom(42);
      const slot1 = ai.chooseSwitchIn(0, state, ruleset, rng1);
      const rng2 = new SeededRandom(42);
      const slot2 = ai.chooseSwitchIn(0, state, ruleset, rng2);

      // Assert
      expect(slot1).toBe(slot2);
    });
  });
});
