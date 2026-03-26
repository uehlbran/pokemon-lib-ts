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

describe("RandomAI — edge cases", () => {
  describe("chooseAction", () => {
    it("given no active pokemon, when chooseAction is called, then struggle is returned as fallback", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      // Remove active pokemon
      state.sides[0].active = [];
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(42);

      // Act
      const action = ai.chooseAction(0, state, ruleset, rng, []);

      // Assert
      expect(action.type).toBe(CORE_MOVE_IDS.struggle);
      expect(action.side).toBe(0);
    });

    it("given a pokemon with one move at 0 PP and one with PP, when chooseAction is called, then only the move with PP is selected", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState({ team1Pp: [0, SCRATCH_SLOT.currentPP] });
      const ruleset = new MockRuleset();
      const _rng = new SeededRandom(42);

      const moveIndices = new Set<number>();

      // Act — call many times to verify only index 1 is picked
      for (let i = 0; i < 50; i++) {
        const action = ai.chooseAction(
          0,
          state,
          ruleset,
          new SeededRandom(i),
          createAvailableMoves(state, 0),
        );
        if (action.type === "move") {
          moveIndices.add(action.moveIndex);
        }
      }

      // Assert — only move index 1 (scratch with PP) should be chosen
      expect(moveIndices.has(0)).toBe(false); // tackle has 0 PP
      expect(moveIndices.has(1)).toBe(true); // scratch has 35 PP
    });

    it("given a pokemon with only one move with PP, when chooseAction is called many times, then it always returns that move", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState({ team1Pp: [TACKLE_SLOT.currentPP, 0] });
      const ruleset = new MockRuleset();

      // Act & Assert
      for (let i = 0; i < 20; i++) {
        const action = ai.chooseAction(
          0,
          state,
          ruleset,
          new SeededRandom(i),
          createAvailableMoves(state, 0),
        );
        expect(action.type).toBe("move");
        if (action.type === "move") {
          expect(action.moveIndex).toBe(0); // Only tackle has PP
        }
      }
    });

    it("given one move is disabled in the available move snapshot, when chooseAction is called many times, then the disabled move is never selected", () => {
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();
      const availableMoves = createAvailableMoves(state, 0).map((move) =>
        move.index === 0 ? { ...move, disabled: true, disabledReason: "Blocked by Taunt" } : move,
      );

      for (let i = 0; i < 20; i++) {
        const action = ai.chooseAction(0, state, ruleset, new SeededRandom(i), availableMoves);
        expect(action.type).toBe("move");
        if (action.type === "move") {
          expect(action.moveIndex).toBe(1);
        }
      }
    });
  });

  describe("chooseSwitchIn", () => {
    it("given multiple alive bench pokemon, when chooseSwitchIn is called many times, then different pokemon can be selected", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      // Add a third pokemon to team
      const extraMon = createTestPokemon(GEN1_SPECIES_IDS.blastoise, 50, {
        uid: "extra-1",
        nickname: "Extra",
        moves: [{ ...TACKLE_SLOT }],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 200,
      });
      state.sides[0].team.push(extraMon);

      const ruleset = new MockRuleset();
      const slots = new Set<number>();

      // Act
      for (let i = 0; i < 100; i++) {
        const slot = ai.chooseSwitchIn(0, state, ruleset, new SeededRandom(i));
        slots.add(slot);
      }

      // Assert — both bench slots (1 and 2) should be picked at least once
      expect(slots.has(1)).toBe(true);
      expect(slots.has(2)).toBe(true);
      expect(slots.has(0)).toBe(false); // Active slot should not be picked
    });
  });
});
