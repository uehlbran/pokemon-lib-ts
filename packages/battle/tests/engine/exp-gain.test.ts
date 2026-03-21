import { getExpForLevel } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent, ExpGainEvent, LevelUpEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

/**
 * Creates and starts a battle engine configured for EXP gain tests.
 *
 * Default setup: wild battle (isWildBattle: true), Charizard (side 0) vs Blastoise (side 1).
 * After engine.start() the active Blastoise's HP is set to 1 so the next move causes a faint.
 * Charizard speed > Blastoise speed so Charizard always moves first.
 *
 * Note: BattleEngine constructor recalculates calculatedStats and resets currentHp for all
 * pokemon, so HP must be adjusted after construction. This helper does that automatically.
 */
function createAndStartExpTestEngine(overrides?: {
  seed?: number;
  team1?: ReturnType<typeof createTestPokemon>[];
  team2?: ReturnType<typeof createTestPokemon>[];
  ruleset?: MockRuleset;
  isWildBattle?: boolean;
  skipFaintSetup?: boolean;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
    }),
  ];

  // Blastoise level 30: MockRuleset HP = floor(((2*79+31)*30)/100) + 30 + 10 = 96
  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 30, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
    isWildBattle: overrides?.isWildBattle ?? true,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));
  engine.start();

  // After start(), the engine has recalculated stats. Now set the opponent's HP to 1
  // so that MockRuleset's fixed 10-damage attack causes a faint on the next move.
  if (!overrides?.skipFaintSetup) {
    const blastoiseActive = engine.getActive(1);
    if (blastoiseActive) {
      blastoiseActive.pokemon.currentHp = 1;
    }
  }

  return { engine, ruleset, events };
}

describe("BattleEngine - EXP gain on faint", () => {
  describe("basic EXP gain", () => {
    it("given wild pokemon faints, when participant is below level 100, then ExpGainEvent emitted with correct amount", () => {
      // Arrange
      // MockRuleset calculateStats for Charizard (base HP=78) at level 50:
      //   floor(((2*78+31)*50)/100) + 50 + 10 = floor(93.5) + 60 = 153
      // Charizard calculatedStats.speed at level 50 with MockRuleset calcStat(100):
      //   floor(((2*100+31)*50)/100) + 5 = floor(115.5) + 5 = 120
      // Blastoise speed at level 30 with MockRuleset calcStat(78):
      //   floor(((2*78+31)*30)/100) + 5 = floor(56.7) + 5 = 61
      // Charizard (speed 120) > Blastoise (speed 61) → Charizard moves first.
      const { engine, events } = createAndStartExpTestEngine();

      // Act — Charizard moves first, deals 10 dmg to Blastoise (1 HP → faint)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: MockRuleset.calculateExpGain — floor(defeatedSpecies.baseExp * defeatedLevel / (5 * participantCount))
      // Blastoise baseExp=239 (from mock-data-manager.ts), defeatedLevel=30, participantCount=1
      // → floor(239 * 30 / (5 * 1)) = floor(1434) = 1434
      const expGainEvent = events.find((e): e is ExpGainEvent => e.type === "exp-gain");
      if (!expGainEvent) throw new Error("Expected an exp-gain event to be emitted");
      // EXP goes to side 0 (the winner, opposite the fainted pokemon on side 1)
      expect(expGainEvent.side).toBe(0);
      expect(expGainEvent.pokemon).toBe("charizard-1");
      // Source: mock-configured value — see MockRuleset.calculateExpGain formula above
      expect(expGainEvent.amount).toBe(1434);
    });
  });

  describe("level up", () => {
    it("given enough EXP gained for level up, when pokemon gains EXP, then LevelUpEvent emitted with correct new level", () => {
      // Arrange
      // Source: getExpForLevel("medium-slow", 51) — Charizard uses medium-slow growth
      // medium-slow formula: floor(6/5 * n^3 - 15*n^2 + 100*n - 140)
      // Level 51: floor(1.2*132651 - 15*2601 + 5100 - 140) = floor(159181.2 - 39015 + 5100 - 140) = 125126
      const expForLevel51 = getExpForLevel("medium-slow", 51);
      // Mock gain: floor(239*30/(5*1)) = 1434
      // Start exp just below threshold so the gain pushes past it
      const startExp = expForLevel51 - 1434;

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          experience: startExp >= 0 ? startExp : 0,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleEngine.awardExpForFaint level-up loop — emits LevelUpEvent per level gained
      const levelUpEvent = events.find((e): e is LevelUpEvent => e.type === "level-up");
      if (!levelUpEvent) throw new Error("Expected a level-up event to be emitted");
      // Source: Charizard started at level 50, gained 1434 EXP → crossed level 51 threshold
      expect(levelUpEvent.newLevel).toBe(51);
      expect(levelUpEvent.side).toBe(0);
      expect(levelUpEvent.pokemon).toBe("charizard-1");
    });

    it("given pokemon has enough EXP for 8 level-ups, when fainted opponent awards EXP, then 8 LevelUpEvents emitted in ascending order from level 6 to 13", () => {
      // Arrange: Charizard at level 5 with 0 EXP; inject EXP via setNextExpGain to trigger 8 level-ups.
      // Source: getExpForLevel("medium-slow", N) — medium-slow formula: floor(1.2*n³ - 15*n² + 100*n - 140)
      // expPastLevel8 = getExpForLevel("medium-slow", 8) + 1000 = 314 + 1000 = 1314
      // Starting at level 5 with 0 EXP, after gaining 1314 EXP:
      //   Level 6 threshold: 179  → 1314 ≥ 179  ✓ (level up to 6)
      //   Level 7 threshold: 236  → 1314 ≥ 236  ✓ (level up to 7)
      //   Level 8 threshold: 314  → 1314 ≥ 314  ✓ (level up to 8)
      //   Level 9 threshold: 419  → 1314 ≥ 419  ✓ (level up to 9)
      //   Level 10 threshold: 560 → 1314 ≥ 560  ✓ (level up to 10)
      //   Level 11 threshold: 742 → 1314 ≥ 742  ✓ (level up to 11)
      //   Level 12 threshold: 973 → 1314 ≥ 973  ✓ (level up to 12)
      //   Level 13 threshold: 1261 → 1314 ≥ 1261 ✓ (level up to 13)
      //   Level 14 threshold: 1612 → 1314 < 1612  ✗ (stop)
      // Total: 8 level-ups (levels 6 through 13)
      const expPastLevel8 = getExpForLevel("medium-slow", 8) + 1000;

      const ruleset = new MockRuleset();
      // Source: mock-configured value — setNextExpGain stores a one-shot override in MockRuleset
      ruleset.setNextExpGain(expPastLevel8);

      const team1 = [
        createTestPokemon(6, 5, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          level: 5,
          experience: 0,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1, ruleset });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleEngine.awardExpForFaint — emits one LevelUpEvent per level gained
      const levelUpEvents = events.filter((e): e is LevelUpEvent => e.type === "level-up");
      // Source: formula derivation above — exactly 8 level-ups (levels 6 through 13)
      expect(levelUpEvents.length).toBe(8);
      expect(levelUpEvents[0].newLevel).toBe(6);
      expect(levelUpEvents[7].newLevel).toBe(13);
      // Events must be in ascending order (level 6 → 7 → 8 → ... → 13)
      for (let i = 0; i < levelUpEvents.length - 1; i++) {
        expect(levelUpEvents[i + 1].newLevel).toBe(levelUpEvents[i].newLevel + 1);
      }
    });
  });

  describe("participant count", () => {
    it("given two participants who each had a turn against fainted pokemon but one fainted, when awarding EXP, then participantCount=1 passed to calculateExpGain", () => {
      // Arrange: Charizard (side 0) and Pikachu (side 0 bench) both fight Blastoise.
      // Round 1: Charizard (speed 120) hits Blastoise (20→10 HP).
      //          Blastoise (speed 61) hits Charizard (10 HP exactly → faint).
      // Switch prompt: side 0 sends Pikachu in.
      // Round 2: Pikachu (speed ~112) > Blastoise (~66); Pikachu hits Blastoise (10→0 HP, faint).
      // participantCount should be 1 — Charizard fainted before Blastoise did, so only
      // Pikachu (the sole living participant) counts toward EXP division.
      // Source: Bulbapedia — "EXP divided among Pokémon that participated and have not fainted."
      let capturedParticipantCount = 0;
      const ruleset = new MockRuleset();
      const originalCalcExp = ruleset.calculateExpGain.bind(ruleset);
      ruleset.calculateExpGain = (context) => {
        capturedParticipantCount = context.participantCount;
        return originalCalcExp(context);
      };

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
        }),
      ];

      const { engine } = createAndStartExpTestEngine({ team1, ruleset, skipFaintSetup: true });

      // Set Charizard's HP to 10 (exactly one hit = faint) and Blastoise's HP to 20
      // (survives round 1, faints round 2). Done after start() to override recalculated stats.
      const charizardActive = engine.getActive(0)!;
      charizardActive.pokemon.currentHp = 10;

      const blastoiseActive = engine.getActive(1)!;
      blastoiseActive.pokemon.currentHp = 20;

      // Act: Round 1 — Charizard (speed 120) hits Blastoise (20→10 HP);
      //               Blastoise (speed ~61) hits Charizard (10→0, faint)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Charizard fainted → switch-prompt
      expect(engine.getPhase()).toBe("switch-prompt");
      engine.submitSwitch(0, 1);

      // Round 2 — Pikachu > Blastoise in speed; Pikachu hits Blastoise (10→0 HP, faint)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: Bulbapedia EXP mechanics — Charizard fainted before Blastoise, so only
      // Pikachu (living participant) counts → participantCount=1
      expect(capturedParticipantCount).toBe(1);
    });
  });

  describe("level 100 cap", () => {
    it("given participant is level 100, when wild pokemon faints, then no ExpGainEvent emitted for that participant", () => {
      // Arrange
      // Source: Game mechanic — level 100 is the maximum; EXP cannot be gained past level 100
      const team1 = [
        createTestPokemon(6, 100, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          level: 100,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const expGainEvents = events.filter((e): e is ExpGainEvent => e.type === "exp-gain");
      expect(expGainEvents).toHaveLength(0);
    });
  });

  describe("trainer battle flag", () => {
    it("given trainer battle flag set, when pokemon faints, then isTrainerBattle=true in ExpContext", () => {
      // Arrange
      // Source: Game mechanic — trainer battles award 1.5× EXP (isTrainerBattle=true)
      //         vs wild battles which award 1.0× (isTrainerBattle=false)
      let capturedIsTrainerBattle: boolean | undefined;
      const ruleset = new MockRuleset();
      const originalCalcExp = ruleset.calculateExpGain.bind(ruleset);
      ruleset.calculateExpGain = (context) => {
        capturedIsTrainerBattle = context.isTrainerBattle;
        return originalCalcExp(context);
      };

      const { engine } = createAndStartExpTestEngine({ ruleset, isWildBattle: false });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: BattleEngine.awardExpForFaint — passes `!state.isWildBattle` as `isTrainerBattle`
      expect(capturedIsTrainerBattle).toBe(true);
    });
  });

  describe("HP adjustment on level up", () => {
    it("given level up occurs, when stats recalculated, then currentHp increases by HP stat difference", () => {
      // Arrange
      // MockRuleset.calculateStats for Charizard (base HP=78):
      //   Level 50: floor(((2*78+31)*50)/100) + 50 + 10 = floor(93.5) + 60 = 153
      //   Level 51: floor(((2*78+31)*51)/100) + 51 + 10 = floor(95.37) + 61 = 156
      //   HP stat delta = 156 - 153 = 3
      // Source: BattleEngine.awardExpForFaint — currentHp += (newStats.hp - oldHpStat), capped at newStats.hp
      const expForLevel51 = getExpForLevel("medium-slow", 51);
      // mock gain = floor(239*30/(5*1)) = 1434 → startExp = expForLevel51 - 1434
      const startExp = expForLevel51 - 1434;

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          experience: startExp >= 0 ? startExp : 0,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1 });

      // Verify Charizard's HP is at its calculated max before the faint
      // Source: MockRuleset calcHp at level 50 = 153 (see formula above)
      const charizardBefore = engine.getActive(0);
      expect(charizardBefore?.pokemon.currentHp).toBe(153);

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const levelUpEvent = events.find((e): e is LevelUpEvent => e.type === "level-up");
      if (!levelUpEvent) throw new Error("Expected a level-up event to be emitted");

      // Source: MockRuleset calcHp at level 51 = 156; started at 153 (full HP)
      // After level-up: currentHp = min(153 + (156-153), 156) = min(156, 156) = 156
      const charizardAfter = engine.getActive(0);
      expect(charizardAfter?.pokemon.currentHp).toBe(156);
      expect(charizardAfter?.pokemon.calculatedStats?.hp).toBe(156);
    });
  });
});
