import { SeededRandom } from "@pokemon-lib/core";
import { describe, expect, it } from "vitest";
import { RandomAI } from "../../src/ai/RandomAI";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleState } from "../../src/state";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

function createTestState(
  overrides?: Partial<{
    team1Hp: number[];
    team2Hp: number[];
    team1Pp: number[];
  }>,
): BattleState {
  const rng = new SeededRandom(42);

  const team1 = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        { moveId: "tackle", currentPP: overrides?.team1Pp?.[0] ?? 35, maxPP: 35, ppUps: 0 },
        { moveId: "scratch", currentPP: overrides?.team1Pp?.[1] ?? 35, maxPP: 35, ppUps: 0 },
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
    }),
    createTestPokemon(25, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 120,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 80,
        speed: 130,
      },
      currentHp: overrides?.team1Hp?.[1] ?? 120,
    }),
  ];

  const team2 = [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 80,
      },
      currentHp: overrides?.team2Hp?.[0] ?? 200,
    }),
  ];

  return {
    phase: "ACTION_SELECT",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
        trainer: null,
        team: team1,
        active: [
          {
            pokemon: team1[0]!,
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
            types: ["fire", "flying"],
            ability: "blaze",
            lastMoveUsed: null,
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
          },
        ],
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
        active: [
          {
            pokemon: team2[0]!,
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
            types: ["water"],
            ability: "torrent",
            lastMoveUsed: null,
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
          },
        ],
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

describe("RandomAI", () => {
  describe("chooseAction", () => {
    it("given an active pokemon with available moves, when chooseAction is called, then a move action is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState();
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(123);

      // Act
      const action = ai.chooseAction(0, state, ruleset, rng);

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
      const action = ai.chooseAction(0, state, ruleset, rng);

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
      const action1 = ai.chooseAction(0, state, ruleset, rng1);
      const rng2 = new SeededRandom(42);
      const action2 = ai.chooseAction(0, state, ruleset, rng2);

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
        const action = ai.chooseAction(0, state, ruleset, rng);
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

    it("given no alive bench pokemon, when chooseSwitchIn is called, then fallback slot is returned", () => {
      // Arrange
      const ai = new RandomAI();
      const state = createTestState({ team1Hp: [200, 0] }); // Pikachu fainted
      const ruleset = new MockRuleset();
      const rng = new SeededRandom(123);

      // Act
      const slot = ai.chooseSwitchIn(0, state, ruleset, rng);

      // Assert — no valid targets, returns fallback 0
      expect(slot).toBe(0);
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

  describe("integration with BattleEngine", () => {
    it("given a RandomAI, when it drives a full battle, then the battle completes normally", () => {
      // Arrange
      const ai = new RandomAI();
      const ruleset = new MockRuleset();
      ruleset.setFixedDamage(50); // Higher damage to end battle faster
      const dataManager = createMockDataManager();

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
          currentHp: 200,
        }),
      ];
      const team2 = [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 80,
          },
          currentHp: 200,
        }),
      ];

      const config: BattleConfig = {
        generation: 1,
        format: "singles",
        teams: [team1, team2],
        seed: 42,
      };

      const engine = new BattleEngine(config, ruleset, dataManager);
      engine.start();

      // Act — let AI play until battle ends or max turns
      let turns = 0;
      const maxTurns = 100;
      const aiRng = new SeededRandom(42);

      while (!engine.isEnded() && turns < maxTurns) {
        if (engine.getPhase() === "ACTION_SELECT") {
          const action0 = ai.chooseAction(0, engine.getState(), ruleset, aiRng);
          const action1 = ai.chooseAction(1, engine.getState(), ruleset, aiRng);
          engine.submitAction(0, action0);
          engine.submitAction(1, action1);
          turns++;
        } else if (engine.getPhase() === "SWITCH_PROMPT") {
          // No bench pokemon, so this shouldn't happen in this test
          break;
        } else {
          break;
        }
      }

      // Assert — battle should have ended within 100 turns
      expect(engine.isEnded()).toBe(true);
      expect(engine.getWinner()).not.toBeNull();
    });
  });
});
