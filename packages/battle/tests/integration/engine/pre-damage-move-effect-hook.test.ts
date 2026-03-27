import type { AbilityTrigger, PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { BATTLE_EFFECT_TARGETS, BattleEngine } from "../../../src";
import type {
  AbilityContext,
  BattleConfig,
  DamageContext,
  DamageResult,
  MoveEffectContext,
} from "../../../src/context";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager, MOCK_SPECIES_IDS } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

const NO_OP_PRE_DAMAGE_RESULT = {
  statusInflicted: null,
  volatileInflicted: null,
  statChanges: [],
  recoilDamage: 0,
  healAmount: 0,
  switchOut: false,
  messages: [],
} as const;

function createEngine(ruleset: MockRuleset) {
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1: PokemonInstance[] = [
    createTestPokemon(MOCK_SPECIES_IDS.charizard, 50, {
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

  const team2: PokemonInstance[] = [
    createTestPokemon(MOCK_SPECIES_IDS.blastoise, 50, {
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
  ];

  const config: BattleConfig = {
    generation: 7,
    format: "singles",
    teams: [team1, team2],
    seed: 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((event) => events.push(event));
  return { engine, events };
}

class TrackingPreDamageRuleset extends MockRuleset {
  readonly damageSnapshots: Array<{
    attacker: string;
    defender: string;
    attackStage: number;
    defenseStage: number;
    randomRoll: number;
  }> = [];

  readonly onDamageTakenDefenseStages: number[] = [];
  readonly preDamageRngRolls: number[] = [];
  readonly onDamageTakenRngRolls: number[] = [];

  private consumedPreDamageHook = false;
  private forceImmuneHit = false;
  private forceBlockedHit = false;
  private consumePreDamageRng = false;

  setForceImmuneHit(forceImmuneHit: boolean): void {
    this.forceImmuneHit = forceImmuneHit;
  }

  setForceBlockedHit(forceBlockedHit: boolean): void {
    this.forceBlockedHit = forceBlockedHit;
  }

  setConsumePreDamageRng(consumePreDamageRng: boolean): void {
    this.consumePreDamageRng = consumePreDamageRng;
  }

  override calculateDamage(context: DamageContext): DamageResult {
    const randomRoll = context.rng.int(85, 100);
    this.damageSnapshots.push({
      attacker: context.attacker.pokemon.uid,
      defender: context.defender.pokemon.uid,
      attackStage: context.attacker.statStages.attack,
      defenseStage: context.defender.statStages.defense,
      randomRoll,
    });

    if (this.forceImmuneHit && context.attacker.pokemon.uid === "charizard-1") {
      return {
        damage: 0,
        effectiveness: 0,
        isCrit: context.isCrit,
        randomFactor: 1,
      };
    }

    if (this.forceBlockedHit && context.attacker.pokemon.uid === "charizard-1") {
      return {
        damage: 0,
        effectiveness: 1,
        isCrit: context.isCrit,
        randomFactor: 1,
      };
    }

    const damage = Math.max(
      1,
      20 +
        context.attacker.statStages.attack * 10 -
        context.defender.statStages.defense * 5 +
        (randomRoll - 85),
    );
    return {
      damage,
      effectiveness: 1,
      isCrit: context.isCrit,
      randomFactor: randomRoll / 100,
    };
  }

  override executePreDamageMoveEffect(context: MoveEffectContext) {
    if (this.consumedPreDamageHook || context.attacker.pokemon.uid !== "charizard-1") {
      return null;
    }
    this.consumedPreDamageHook = true;
    if (this.consumePreDamageRng) {
      this.preDamageRngRolls.push(context.rng.int(1, 100));
    }

    return {
      ...NO_OP_PRE_DAMAGE_RESULT,
      statChanges: [
        {
          target: BATTLE_EFFECT_TARGETS.attacker,
          stat: CORE_STAT_IDS.attack,
          // The hook simulates a single +2 Attack stage boost before damage.
          // Derivation: fixture-specific pre-damage attacker delta = +2
          stages: 2,
        },
        {
          target: BATTLE_EFFECT_TARGETS.defender,
          stat: CORE_STAT_IDS.defense,
          // The hook simultaneously removes the defender's starting +2 Defense stage.
          // Derivation: fixture-specific pre-damage defender delta = -2
          stages: -2,
        },
      ],
    };
  }

  override hasAbilities(): boolean {
    return true;
  }

  override applyAbility(trigger: AbilityTrigger, context: AbilityContext) {
    if (
      trigger === CORE_ABILITY_TRIGGER_IDS.onDamageTaken &&
      context.pokemon.pokemon.uid === "blastoise-1"
    ) {
      this.onDamageTakenDefenseStages.push(context.pokemon.statStages.defense);
      if (this.consumePreDamageRng) {
        this.onDamageTakenRngRolls.push(context.rng.int(1, 100));
      }
    }
    return { activated: false, effects: [], messages: [] };
  }
}

describe("BattleEngine pre-damage move-effect hook", () => {
  it("given a pre-damage stat-changing hook, when a move resolves, then the engine recalculates damage from the same RNG roll and reactive hooks see the updated stages", () => {
    const ruleset = new TrackingPreDamageRuleset();
    const { engine, events } = createEngine(ruleset);

    engine.start();
    engine.state.sides[1].active[0]!.statStages.defense = 2;
    events.length = 0;
    ruleset.damageSnapshots.length = 0;
    ruleset.onDamageTakenDefenseStages.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const charizardSnapshots = ruleset.damageSnapshots.filter(
      (snapshot) => snapshot.attacker === "charizard-1",
    );
    expect(charizardSnapshots).toEqual([
      {
        attacker: "charizard-1",
        defender: "blastoise-1",
        // The attacker starts at neutral raw stages before the pre-damage hook.
        // Derivation: default battle state initializes Attack stage to 0
        attackStage: 0,
        // The defender is explicitly seeded to +2 Defense in this test setup.
        // Derivation: engine.state.sides[1].active[0]!.statStages.defense = 2
        defenseStage: 2,
        // Damage rolls are sampled from the Gen 3+ [85, 100] range in this test ruleset.
        // Derivation: TrackingPreDamageRuleset.calculateDamage uses rng.int(85, 100)
        randomRoll: charizardSnapshots[0]?.randomRoll ?? 85,
      },
      {
        attacker: "charizard-1",
        defender: "blastoise-1",
        // The hook adds +2 raw Attack before the recomputed damage pass.
        // Derivation: 0 + 2 = 2
        attackStage: 2,
        // The hook removes the defender's seeded +2 Defense before recomputing damage.
        // Derivation: 2 - 2 = 0
        defenseStage: 0,
        randomRoll: charizardSnapshots[0]?.randomRoll ?? 85,
      },
    ]);
    expect(charizardSnapshots[0]?.randomRoll).toBe(charizardSnapshots[1]?.randomRoll);
    // onDamageTaken runs after the hook-applied -2 Defense, so the defender is already back at 0.
    // Derivation: seeded +2 Defense + hook-applied -2 = 0
    expect(ruleset.onDamageTakenDefenseStages).toEqual([0]);

    const charizardAttackBoostIndex = events.findIndex(
      (event) =>
        event.type === "stat-change" &&
        event.side === 0 &&
        event.stat === CORE_STAT_IDS.attack &&
        event.currentStage === 2,
    );
    const blastoiseDefenseDropIndex = events.findIndex(
      (event) =>
        event.type === "stat-change" &&
        event.side === 1 &&
        event.stat === CORE_STAT_IDS.defense &&
        event.currentStage === 0,
    );
    const firstDamageIndex = events.findIndex(
      (event) =>
        event.type === "damage" &&
        event.side === 1 &&
        // Mock damage formula: 20 + AttackStage*10 - DefenseStage*5 + (roll - 85).
        // With recomputed stages (+2 Attack, 0 Defense), damage becomes 40 + (roll - 85).
        // Derivation: 20 + 2*10 - 0*5 + (roll - 85)
        event.amount === 40 + ((charizardSnapshots[0]?.randomRoll ?? 85) - 85),
    );

    expect(charizardAttackBoostIndex).toBeGreaterThanOrEqual(0);
    expect(blastoiseDefenseDropIndex).toBeGreaterThan(charizardAttackBoostIndex);
    expect(firstDamageIndex).toBeGreaterThan(blastoiseDefenseDropIndex);
  });

  it("given an immune hit, when a move resolves, then the pre-damage hook is skipped", () => {
    const ruleset = new TrackingPreDamageRuleset();
    ruleset.setForceImmuneHit(true);
    const { engine, events } = createEngine(ruleset);

    engine.start();
    events.length = 0;
    ruleset.damageSnapshots.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const charizardSnapshots = ruleset.damageSnapshots.filter(
      (snapshot) => snapshot.attacker === "charizard-1",
    );
    expect(charizardSnapshots).toEqual([
      {
        attacker: "charizard-1",
        defender: "blastoise-1",
        attackStage: 0,
        defenseStage: 0,
        // Damage rolls are sampled from the Gen 3+ [85, 100] range in this test ruleset.
        // Derivation: TrackingPreDamageRuleset.calculateDamage uses rng.int(85, 100)
        randomRoll: charizardSnapshots[0]?.randomRoll ?? 85,
      },
    ]);

    const statChangeEvents = events.filter((event) => event.type === "stat-change");
    expect(statChangeEvents).toHaveLength(0);
  });

  it("given an effective hit that is still blocked before damage, when a move resolves, then the pre-damage hook is skipped", () => {
    const ruleset = new TrackingPreDamageRuleset();
    ruleset.setForceBlockedHit(true);
    const { engine, events } = createEngine(ruleset);

    engine.start();
    events.length = 0;
    ruleset.damageSnapshots.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const charizardSnapshots = ruleset.damageSnapshots.filter(
      (snapshot) => snapshot.attacker === "charizard-1",
    );
    expect(charizardSnapshots).toEqual([
      {
        attacker: "charizard-1",
        defender: "blastoise-1",
        attackStage: 0,
        defenseStage: 0,
        // Damage rolls are sampled from the Gen 3+ [85, 100] range in this test ruleset.
        // Derivation: TrackingPreDamageRuleset.calculateDamage uses rng.int(85, 100)
        randomRoll: charizardSnapshots[0]?.randomRoll ?? 85,
      },
    ]);

    const statChangeEvents = events.filter((event) => event.type === "stat-change");
    expect(statChangeEvents).toHaveLength(0);
  });

  it("given a pre-damage hook that consumes RNG, when damage is recomputed, then the main RNG stream is not rewound", () => {
    const ruleset = new TrackingPreDamageRuleset();
    ruleset.setConsumePreDamageRng(true);
    const { engine } = createEngine(ruleset);

    engine.start();
    engine.state.sides[1].active[0]!.statStages.defense = 2;
    ruleset.damageSnapshots.length = 0;
    ruleset.preDamageRngRolls.length = 0;
    ruleset.onDamageTakenRngRolls.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const expectedRng = new SeededRandom(12345);
    // The mock damage path consumes the first RNG draw from the [85, 100] damage-roll range.
    // Derivation: TrackingPreDamageRuleset.calculateDamage uses rng.int(85, 100)
    const expectedDamageRoll = expectedRng.int(85, 100);
    // The hook then consumes one standalone [1, 100] draw when enabled.
    // Derivation: executePreDamageMoveEffect calls context.rng.int(1, 100)
    const expectedPreDamageRoll = expectedRng.int(1, 100);
    // Finally, the reactive onDamageTaken ability probe consumes the next [1, 100] draw.
    // Derivation: applyAbility(onDamageTaken) calls context.rng.int(1, 100)
    const expectedOnDamageTakenRoll = expectedRng.int(1, 100);

    const charizardSnapshots = ruleset.damageSnapshots.filter(
      (snapshot) => snapshot.attacker === "charizard-1",
    );
    expect(charizardSnapshots[0]?.randomRoll).toBe(expectedDamageRoll);
    expect(charizardSnapshots[1]?.randomRoll).toBe(expectedDamageRoll);
    expect(ruleset.preDamageRngRolls).toEqual([expectedPreDamageRoll]);
    expect(ruleset.onDamageTakenRngRolls).toEqual([expectedOnDamageTakenRoll]);
  });
});
