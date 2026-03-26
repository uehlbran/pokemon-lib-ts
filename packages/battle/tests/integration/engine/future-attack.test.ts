import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_END_OF_TURN_EFFECT_IDS, CORE_MOVE_IDS, type DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type {
  BattleConfig,
  DamageContext,
  DamageResult,
  EndOfTurnEffect,
  MoveEffectContext,
  MoveEffectResult,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

// Source: packages/battle/src/engine/BattleEngine.ts — CORE_END_OF_TURN_EFFECT_IDS.futureAttack resolves at end
// of turn once the countdown reaches 0.
// Source: packages/battle/src/ruleset/GenerationRuleset.ts — Gen 2-4 store future
// attack damage at use time; Gen 5+ recalculate it when the attack lands.

/**
 * MockRuleset subclass that includes CORE_END_OF_TURN_EFFECT_IDS.futureAttack in the end-of-turn order
 * and supports configurable executeMoveEffect for scheduling future attacks.
 */
class FutureAttackMockRuleset extends MockRuleset {
  private effectHandler: ((ctx: MoveEffectContext) => MoveEffectResult) | null = null;
  private futureSightDamage = 80;

  setEffectHandler(handler: (ctx: MoveEffectContext) => MoveEffectResult) {
    this.effectHandler = handler;
  }

  setFutureSightDamage(damage: number) {
    this.futureSightDamage = damage;
  }

  override getEndOfTurnOrder(): readonly EndOfTurnEffect[] {
    return [CORE_END_OF_TURN_EFFECT_IDS.futureAttack];
  }

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    if (this.effectHandler) {
      return this.effectHandler(context);
    }
    return super.executeMoveEffect(context);
  }

  override calculateDamage(context: DamageContext): DamageResult {
    // For future sight, return a configurable damage amount
    if (context.move.id === CORE_MOVE_IDS.futureSight) {
      return {
        damage: this.futureSightDamage,
        effectiveness: 1,
        isCrit: false,
        randomFactor: 1,
      };
    }
    return super.calculateDamage(context);
  }
}

/**
 * Creates a battle test data manager that includes Future Sight alongside the shared mock records.
 */
function createFutureAttackDataManager(): DataManager {
  return createMockDataManager();
}

function createFutureAttackEngine() {
  const ruleset = new FutureAttackMockRuleset();
  const dataManager = createFutureAttackDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [
        createMockMoveSlot(CORE_MOVE_IDS.tackle),
        createMockMoveSlot(CORE_MOVE_IDS.futureSight),
      ],
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

  const team2: PokemonInstance[] = [
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
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 4,
    format: "singles",
    teams: [team1, team2],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));

  return { engine, ruleset, events };
}

const SYNTHETIC_MISSING_FUTURE_MOVE_ID = "missing-future-move";

describe("Future Sight end-of-turn processing", () => {
  it("given a pending future attack with turnsLeft=2, when end of turn runs, then the counter decrements to 1 and no damage is dealt", () => {
    // Source: packages/battle/src/engine/BattleEngine.ts — CORE_END_OF_TURN_EFFECT_IDS.futureAttack resolves when
    // the countdown reaches 0, so turnsLeft=2 becomes 1 without damage.
    // Arrange
    const { engine, events } = createFutureAttackEngine();
    engine.start();

    // Manually set a future attack on side 1 (targeting Blastoise's side)
    engine.state.sides[1].futureAttack = {
      moveId: CORE_MOVE_IDS.futureSight,
      turnsLeft: 2,
      damage: 0, // Gen 4: damage calculated at hit time
      sourceSide: 0,
    };

    // Act — run a turn (both use tackle)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — turnsLeft should be decremented to 1
    expect(engine.state.sides[1].futureAttack).not.toBeNull();
    expect(engine.state.sides[1].futureAttack!.turnsLeft).toBe(1);

    // No future-sight damage event should have been emitted
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === CORE_MOVE_IDS.futureSight,
    );
    expect(futureSightDamage.length).toBe(0);
  });

  it("given a pending future attack with turnsLeft=1, when end of turn runs, then damage is calculated and dealt to the target", () => {
    // Arrange
    const { engine, ruleset, events } = createFutureAttackEngine();
    // Fixture: the mock stores 80 damage so the Gen 4 hit-time value is observable.
    ruleset.setFutureSightDamage(80);
    engine.start();

    // Set future attack about to trigger (turnsLeft=1, damage=0 for Gen 4 calc-on-hit)
    engine.state.sides[1].futureAttack = {
      moveId: CORE_MOVE_IDS.futureSight,
      turnsLeft: 1,
      damage: 0, // Gen 4: damage calculated at hit time
      sourceSide: 0,
    };

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — future attack should have been cleared
    expect(engine.state.sides[1].futureAttack).toBeNull();

    // Source: packages/battle/src/ruleset/GenerationRuleset.ts — Gen 2-4 use the stored
    // CORE_END_OF_TURN_EFFECT_IDS.futureAttack damage value when the hit resolves.
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === CORE_MOVE_IDS.futureSight,
    );
    expect(futureSightDamage.length).toBe(1);

    // Fixture value from the mock setup above.
    const fsEvent = futureSightDamage[0]!;
    expect(fsEvent.type === "damage" && fsEvent.amount).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// Bug #505: Future attack damage recalculation for Gen 5+
// ---------------------------------------------------------------------------

describe("Bug #505 — Future attack recalculation (Gen 5+)", () => {
  /**
   * MockRuleset subclass that implements recalculatesFutureAttackDamage()
   * and allows configuring whether recalculation is enabled.
   */
  class RecalcFutureAttackMockRuleset extends FutureAttackMockRuleset {
    private shouldRecalculate = false;

    setRecalculates(value: boolean) {
      this.shouldRecalculate = value;
    }

    recalculatesFutureAttackDamage(): boolean {
      return this.shouldRecalculate;
    }
  }

  it("given a Gen 5 battle with non-zero stored future attack damage, when attack triggers, then damage is recalculated using current stats", () => {
    // Arrange — set up a ruleset that recalculates and returns a different value
    const ruleset = new RecalcFutureAttackMockRuleset();
    ruleset.setRecalculates(true);
    // Source: packages/battle/src/ruleset/GenerationRuleset.ts — Gen 5+ recalculates
    // future attack damage when the attack lands.
    ruleset.setFutureSightDamage(120);

    const dataManager = createFutureAttackDataManager();
    const events: BattleEvent[] = [];

    const team1: PokemonInstance[] = [
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
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const team2: PokemonInstance[] = [
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
          speed: 120,
        },
        currentHp: 200,
      }),
    ];

    const config: BattleConfig = {
      generation: 5,
      format: "singles",
      teams: [team1, team2],
      seed: 42,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((event) => events.push(event));
    engine.start();

    // Set future attack with NON-ZERO stored damage (50), but recalculation should override it
    engine.state.sides[1].futureAttack = {
      moveId: CORE_MOVE_IDS.futureSight,
      turnsLeft: 1,
      damage: 50, // Stored at use time — should be IGNORED in Gen 5+
      sourceSide: 0,
    };

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — damage should be recalculated (120), not the stored value (50)
    // Source: Bulbapedia — "From Generation V onwards, damage is calculated when
    //   Future Sight or Doom Desire hits, not when it is used."
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === CORE_MOVE_IDS.futureSight,
    );
    expect(futureSightDamage.length).toBe(1);
    const fsEvent = futureSightDamage[0]!;
    expect(fsEvent.type === "damage" && fsEvent.amount).toBe(120);
  });

  it("given a Gen 4 battle with non-zero stored future attack damage, when attack triggers, then stored damage is used unchanged", () => {
    // Arrange — Gen 4 does NOT recalculate
    const ruleset = new RecalcFutureAttackMockRuleset();
    ruleset.setRecalculates(false);
    // Source: packages/battle/src/ruleset/GenerationRuleset.ts — Gen 2-4 keep the
    // stored CORE_END_OF_TURN_EFFECT_IDS.futureAttack damage value instead of recalculating.
    ruleset.setFutureSightDamage(120);

    const dataManager = createFutureAttackDataManager();
    const events: BattleEvent[] = [];

    const team1: PokemonInstance[] = [
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
          speed: 80,
        },
        currentHp: 200,
      }),
    ];

    const team2: PokemonInstance[] = [
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
          speed: 120,
        },
        currentHp: 200,
      }),
    ];

    const config: BattleConfig = {
      generation: 4,
      format: "singles",
      teams: [team1, team2],
      seed: 42,
    };

    ruleset.setGenerationForTest(config.generation);
    const engine = new BattleEngine(config, ruleset, dataManager);
    engine.on((event) => events.push(event));
    engine.start();

    // Set future attack with stored damage of 50
    engine.state.sides[1].futureAttack = {
      moveId: CORE_MOVE_IDS.futureSight,
      turnsLeft: 1,
      damage: 50, // Stored at use time — should be USED in Gen 4
      sourceSide: 0,
    };

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — damage should be the stored value (50), not recalculated (120)
    // Source: Bulbapedia — "In Generations II-IV, damage is calculated when used"
    const futureSightDamage = events.filter(
      (e) => e.type === "damage" && "source" in e && e.source === CORE_MOVE_IDS.futureSight,
    );
    expect(futureSightDamage.length).toBe(1);
    const fsEvent = futureSightDamage[0]!;
    expect(fsEvent.type === "damage" && fsEvent.amount).toBe(50);
  });
});

describe("Future attack integrity warnings", () => {
  it("given scheduling uses missing move data, when a future attack is created, then the engine emits a warning instead of silently storing zero damage", () => {
    const { engine, ruleset, events } = createFutureAttackEngine();
    ruleset.setEffectHandler((context) => {
      if (context.move.id !== CORE_MOVE_IDS.futureSight) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
        };
      }

      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
        futureAttack: {
          moveId: SYNTHETIC_MISSING_FUTURE_MOVE_ID,
          turnsLeft: 2,
          sourceSide: 0,
        },
      };
    });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(
      events.some(
        (event) =>
          event.type === "engine-warning" &&
          event.message.includes(
            `Future attack move "${SYNTHETIC_MISSING_FUTURE_MOVE_ID}" data missing while scheduling.`,
          ),
      ),
    ).toBe(true);
    expect(engine.state.sides[1].futureAttack?.damage).toBe(0);
  });

  it("given future attack resolution uses missing move data, when the hit resolves, then the engine emits a warning before falling back to stored damage", () => {
    const { engine, ruleset, events } = createFutureAttackEngine();
    Object.assign(ruleset, {
      recalculatesFutureAttackDamage: () => true,
    });
    engine.start();

    engine.state.sides[1].futureAttack = {
      moveId: SYNTHETIC_MISSING_FUTURE_MOVE_ID,
      turnsLeft: 1,
      damage: 33,
      sourceSide: 0,
    };

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(
      events.some(
        (event) =>
          event.type === "engine-warning" &&
          event.message.includes(
            `Future attack move "${SYNTHETIC_MISSING_FUTURE_MOVE_ID}" data missing while resolving.`,
          ),
      ),
    ).toBe(true);

    const futureSightDamage = events.filter(
      (event) =>
        event.type === "damage" &&
        "source" in event &&
        event.source === SYNTHETIC_MISSING_FUTURE_MOVE_ID,
    );
    expect(futureSightDamage).toHaveLength(1);
    const damageEvent = futureSightDamage[0]!;
    // Source: future attack damage resolves to the canonical fixed 33 HP hit in this regression.
    expect(damageEvent.type === "damage" && damageEvent.amount).toBe(33);
  });
});
