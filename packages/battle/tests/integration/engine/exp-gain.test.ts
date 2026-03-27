import {
  CORE_HAZARD_IDS,
  CORE_MOVE_IDS,
  DataManager,
  type ExperienceGroupIdentifier,
  getExpForLevel,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, EntryHazardResult, ExpContext } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent, ExpGainEvent, LevelUpEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

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
  generation?: BattleConfig["generation"];
  seed?: number;
  team1?: ReturnType<typeof createTestPokemon>[];
  team2?: ReturnType<typeof createTestPokemon>[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
  isWildBattle?: boolean;
  skipFaintSetup?: boolean;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const generation = overrides?.generation ?? overrides?.ruleset?.generation ?? 1;
  const ruleset = (overrides?.ruleset ?? new MockRuleset()).setGenerationForTest(generation);
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    }),
  ];

  // Blastoise level 30 HP under the standard stat formula:
  //   floor(((2*79+31)*30)/100) + 30 + 10 = 96
  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 30, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    }),
  ];

  const config: BattleConfig = {
    generation,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
    isWildBattle: overrides?.isWildBattle ?? true,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));
  engine.start();

  // After start(), the engine has recalculated stats. Set the opponent's HP to 1 so the
  // configured 10-damage attack causes a faint on the next move.
  if (!overrides?.skipFaintSetup) {
    const blastoiseActive = engine.state.sides[1].active[0];
    if (blastoiseActive) {
      blastoiseActive.pokemon.currentHp = 1;
    }
  }

  return { engine, ruleset, events };
}

function createAliasGrowthRateDataManager(expGroup: ExperienceGroupIdentifier): DataManager {
  const baseDataManager = createMockDataManager();
  const dataManager = new DataManager();

  dataManager.loadFromObjects({
    pokemon: [
      {
        ...baseDataManager.getSpecies(MOCK_SPECIES_IDS.charizard),
        expGroup,
      },
      baseDataManager.getSpecies(MOCK_SPECIES_IDS.blastoise),
      baseDataManager.getSpecies(MOCK_SPECIES_IDS.pikachu),
    ],
    moves: baseDataManager.getAllMoves(),
    abilities: baseDataManager.getAllAbilities(),
    items: baseDataManager.getAllItems(),
    natures: baseDataManager.getAllNatures(),
    typeChart: baseDataManager.getTypeChart(),
  });

  return dataManager;
}

class PhazingHazardRuleset extends MockRuleset {
  getAvailableHazards(): readonly import("@pokemon-lib-ts/core").EntryHazardType[] {
    return [CORE_HAZARD_IDS.stealthRock];
  }

  applyEntryHazards(
    pokemon: import("../../../src/state").ActivePokemon,
    side: import("../../../src/state").BattleSide,
  ): EntryHazardResult {
    if (side.index !== 1) {
      return { damage: 0, statusInflicted: null, statChanges: [], messages: [] };
    }

    return {
      // Derived from the local fixture: the phazed-in Pikachu should be KO'd by the
      // hazard so the only way to observe it is through participant tracking.
      damage: pokemon.pokemon.currentHp,
      statusInflicted: null,
      statChanges: [],
      messages: [],
    };
  }
}

describe("BattleEngine - EXP gain on faint", () => {
  describe("basic EXP gain", () => {
    it("given wild pokemon faints, when participant is below level 100, then ExpGainEvent emitted with correct amount", () => {
      // Arrange
      // Charizard is faster than Blastoise in this fixture, so it moves first and the
      // opponent is reduced to 1 HP before EXP is awarded.
      const { engine, events } = createAndStartExpTestEngine();

      // Act — Charizard moves first, deals 10 dmg to Blastoise (1 HP → faint)
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Derived inline from the EXP formula:
      // floor(defeatedSpecies.baseExp * defeatedLevel / (5 * participantCount))
      // = floor(239 * 30 / (5 * 1)) = 1434
      const expGainEvent = events.find((e): e is ExpGainEvent => e.type === "exp-gain");
      if (!expGainEvent) throw new Error("Expected an exp-gain event to be emitted");
      // EXP goes to side 0 (the winner, opposite the fainted pokemon on side 1)
      expect(expGainEvent.side).toBe(0);
      expect(expGainEvent.pokemon).toBe("charizard-1");
      // Derived from the same EXP formula above.
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
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          experience: startExp >= 0 ? startExp : 0,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // The engine should emit one LevelUpEvent per level threshold crossed.
      const levelUpEvent = events.find((e): e is LevelUpEvent => e.type === "level-up");
      if (!levelUpEvent) throw new Error("Expected a level-up event to be emitted");
      // Charizard started at level 50 and gained 1434 EXP, so it crosses the level 51 threshold.
      expect(levelUpEvent.newLevel).toBe(51);
      expect(levelUpEvent.side).toBe(0);
      expect(levelUpEvent.pokemon).toBe("charizard-1");
    });

    it("given pokemon has enough EXP for 8 level-ups, when fainted opponent awards EXP, then 8 LevelUpEvents emitted in ascending order from level 6 to 13", () => {
      // Arrange: Charizard at level 5 with 0 EXP; inject EXP via setNextExpGain to trigger 8 level-ups.
      // getExpForLevel("medium-slow", N) uses the medium-slow formula: floor(1.2*n³ - 15*n² + 100*n - 140)
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
      // Configured one-shot EXP gain for this test fixture.
      ruleset.setNextExpGain(expPastLevel8);

      const team1 = [
        createTestPokemon(6, 5, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          level: 5,
          experience: 0,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1, ruleset });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // The engine should emit one LevelUpEvent per level gained.
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

    it("given a participant species still uses a shipped alias growth rate, when battle EXP triggers a level-up, then the runtime normalizes it", () => {
      // Source: PokeAPI growth-rate naming — slow-then-very-fast is the erratic formula.
      // Fixture EXP gain from Blastoise level 30 remains 1434 in this helper battle.
      const expForLevel51 = getExpForLevel("erratic", 51);
      const startExp = expForLevel51 - 1434;

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          experience: startExp,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({
        team1,
        dataManager: createAliasGrowthRateDataManager("slow-then-very-fast"),
      });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const levelUpEvent = events.find((event): event is LevelUpEvent => event.type === "level-up");
      if (!levelUpEvent) throw new Error("Expected a level-up event to be emitted");
      expect(levelUpEvent.newLevel).toBe(51);
      expect(levelUpEvent.side).toBe(0);
      expect(levelUpEvent.pokemon).toBe("charizard-1");
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
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
      ];

      const { engine } = createAndStartExpTestEngine({ team1, ruleset, skipFaintSetup: true });

      // Set Charizard's HP to 10 (exactly one hit = faint) and Blastoise's HP to 20
      // (survives round 1, faints round 2). Done after start() to override recalculated stats.
      const charizardActive = engine.state.sides[0].active[0]!;
      charizardActive.pokemon.currentHp = 10;

      const blastoiseActive = engine.state.sides[1].active[0]!;
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

    it("given Whirlwind drags in a replacement that faints to entry hazards, when the turn ends, then the replacement is still recorded as a participant", () => {
      const ruleset = new PhazingHazardRuleset();
      ruleset.setFixedDamage(0);
      ruleset.setMoveEffectResult({ switchOut: true, forcedSwitch: true });

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
        createTestPokemon(25, 50, {
          uid: "pikachu-bench",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 60,
            spAttack: 80,
            spDefense: 80,
            speed: 90,
          },
          currentHp: 120,
        }),
      ];

      const config: BattleConfig = {
        generation: 1,
        format: "singles",
        teams: [team1, team2],
        seed: 54321,
        isWildBattle: true,
      };

      const dataManager = createMockDataManager();
      const engine = new BattleEngine(config, ruleset, dataManager);
      engine.start();
      engine.state.sides[1].hazards.push({ type: CORE_HAZARD_IDS.stealthRock, layers: 1 });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");
      expect(engine.state.sides[1].active[0]?.pokemon.uid).toBe("pikachu-bench");
      expect(engine.state.sides[1].active[0]?.pokemon.currentHp).toBe(0);

      const serialized = JSON.parse(engine.serialize()) as {
        participantTracker: Record<string, string[]>;
      };

      // Derived from the local fixture uids: the Whirlwind replacement is Pikachu, and it
      // should be recorded immediately even if hazards faint it before the next turn.
      expect(serialized.participantTracker["charizard-1"]).toContain("pikachu-bench");
    });
  });

  describe("EXP Share recipients", () => {
    it("given a Gen 3 benched Exp. Share holder, when a teammate faints the opponent, then the holder receives a held-item EXP award", () => {
      const capturedContexts = new Map<string, ExpContext>();
      const ruleset = new MockRuleset().setGenerationForTest(3);
      ruleset.calculateExpGain = (context) => {
        // Source: this test's mock split policy — full EXP for participants, 50% for Exp. Share recipients
        const recipientUid = context.hasExpShare ? "pikachu-1" : "charizard-1";
        capturedContexts.set(recipientUid, context);
        return context.hasExpShare ? 50 : 100;
      };

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          heldItem: "exp-share",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.growl)],
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({
        generation: 3,
        team1,
        ruleset,
      });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const expGainEvents = events.filter(
        (event): event is ExpGainEvent => event.type === "exp-gain",
      );
      // Source: mocked calculateExpGain override above
      expect(expGainEvents).toEqual([
        { type: "exp-gain", side: 0, pokemon: "charizard-1", amount: 100 },
        { type: "exp-gain", side: 0, pokemon: "pikachu-1", amount: 50 },
      ]);

      expect(capturedContexts.get("charizard-1")?.hasExpShare).toBe(false);
      expect(capturedContexts.get("pikachu-1")?.hasExpShare).toBe(true);
      expect(capturedContexts.get("pikachu-1")?.participantCount).toBe(1);
    });

    it("given a Gen 8 inactive party member, when a teammate faints the opponent, then the inactive member receives the always-on EXP Share award", () => {
      const capturedContexts = new Map<string, ExpContext>();
      const ruleset = new MockRuleset().setGenerationForTest(8);
      ruleset.calculateExpGain = (context) => {
        // Source: this test's mock split policy — full EXP for participants, 50% for Exp. Share recipients
        const recipientUid = context.hasExpShare ? "pikachu-1" : "charizard-1";
        capturedContexts.set(recipientUid, context);
        return context.hasExpShare ? 50 : 100;
      };

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-1",
          nickname: "Pikachu",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.growl)],
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({
        generation: 8,
        team1,
        ruleset,
      });

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const expGainEvents = events.filter(
        (event): event is ExpGainEvent => event.type === "exp-gain",
      );
      // Source: mocked calculateExpGain override above
      expect(expGainEvents).toEqual([
        { type: "exp-gain", side: 0, pokemon: "charizard-1", amount: 100 },
        { type: "exp-gain", side: 0, pokemon: "pikachu-1", amount: 50 },
      ]);

      expect(capturedContexts.get("charizard-1")?.hasExpShare).toBe(false);
      expect(capturedContexts.get("pikachu-1")?.hasExpShare).toBe(true);
      expect(capturedContexts.get("pikachu-1")?.participantCount).toBe(1);
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
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
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
      // Charizard HP under the standard stat formula:
      //   Level 50: floor(((2*78+31)*50)/100) + 50 + 10 = 153
      //   Level 51: floor(((2*78+31)*51)/100) + 51 + 10 = 156
      //   HP stat delta = 3
      // Level-up restores current HP by the HP delta, capped at the new max HP.
      const expForLevel51 = getExpForLevel("medium-slow", 51);
      // mock gain = floor(239*30/(5*1)) = 1434 → startExp = expForLevel51 - 1434
      const startExp = expForLevel51 - 1434;

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
          experience: startExp >= 0 ? startExp : 0,
        }),
      ];

      const { engine, events } = createAndStartExpTestEngine({ team1 });

      // Verify Charizard's HP is at its calculated max before the faint
      // Charizard level 50 HP under the standard stat formula is 153.
      const charizardBefore = engine.state.sides[0].active[0];
      expect(charizardBefore?.pokemon.currentHp).toBe(153);

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const levelUpEvent = events.find((e): e is LevelUpEvent => e.type === "level-up");
      if (!levelUpEvent) throw new Error("Expected a level-up event to be emitted");

      // Charizard level 51 HP under the standard stat formula is 156; starting from 153,
      // the level-up restores the HP delta and caps at the new max.
      const charizardAfter = engine.state.sides[0].active[0];
      expect(charizardAfter?.pokemon.currentHp).toBe(156);
      expect(charizardAfter?.pokemon.calculatedStats?.hp).toBe(156);
    });
  });
});
