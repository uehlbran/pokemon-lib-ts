import {
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
} from "@pokemon-lib-ts/core";
import { GEN9_ITEM_IDS, GEN9_SPECIES_IDS } from "@pokemon-lib-ts/gen9/data";
import {
  BATTLE_EFFECT_TARGETS,
  BATTLE_ITEM_EFFECT_TYPES,
  BATTLE_ITEM_EFFECT_VALUES,
} from "../../../src";
import type { BattleConfig, ItemContext } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent, StatChangeEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createStats(hp: number, speed: number) {
  return {
    hp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };
}

class HeldItemStatBoostRuleset extends MockRuleset {
  readonly itemTriggers: string[] = [];

  override hasHeldItems(): boolean {
    return true;
  }

  override calculateDamage() {
    // Fixture: return super-effective damage so a Weakness Policy-style item activates.
    return {
      damage: 20,
      effectiveness: 2,
      isCrit: false,
      randomFactor: 1,
    };
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    this.itemTriggers.push(trigger);

    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onDamageTaken &&
      context.pokemon.pokemon.heldItem === GEN9_ITEM_IDS.weaknessPolicy
    ) {
      return {
        activated: true,
        effects: [
          // Source: packages/gen9/tests/items.test.ts -- Weakness Policy raises Attack and SpAtk by 2 stages.
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.attack,
            stages: 2,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.spAttack,
            stages: 2,
          },
        ],
        messages: ["Weakness Policy activated!"],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

class StatChangeBlockRuleset extends MockRuleset {
  readonly capturedPhases: string[] = [];

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    if (trigger !== CORE_ITEM_TRIGGER_IDS.onStatChange || !context.statChange) {
      return { activated: false, effects: [], messages: [] };
    }

    this.capturedPhases.push(context.statChange.phase);
    if (
      context.statChange.phase === "before" &&
      context.pokemon.pokemon.heldItem === GEN9_ITEM_IDS.weaknessPolicy
    ) {
      return {
        activated: true,
        effects: [],
        messages: ["Clear Amulet blocked the drop!"],
        blockedStatChanges: [CORE_STAT_IDS.defense],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

class StatChangeForceSwitchRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onStatChange &&
      context.statChange?.phase === "after" &&
      context.pokemon.pokemon.heldItem === CORE_ITEM_IDS.leftovers &&
      context.statChange.applied.some((change) => change.stages < 0)
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.none,
            target: BATTLE_EFFECT_TARGETS.self,
            value: BATTLE_ITEM_EFFECT_VALUES.forceSwitch,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_ITEM_IDS.leftovers,
          },
        ],
        messages: ["Eject Pack activated!"],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

class CompetingSwitchItemRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onDamageTaken &&
      context.pokemon.pokemon.uid === "blastoise-1"
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.none,
            target: BATTLE_EFFECT_TARGETS.self,
            value: BATTLE_ITEM_EFFECT_VALUES.forceSwitch,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_ITEM_IDS.ejectButton,
          },
        ],
        messages: ["Blastoise's Eject Button activated!"],
      };
    }

    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onStatChange &&
      context.statChange?.phase === "after" &&
      context.pokemon.pokemon.uid === "charizard-1" &&
      context.statChange.applied.some((change) => change.stages < 0)
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.none,
            target: BATTLE_EFFECT_TARGETS.self,
            value: BATTLE_ITEM_EFFECT_VALUES.forceSwitch,
          },
          {
            type: BATTLE_ITEM_EFFECT_TYPES.consume,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_ITEM_IDS.leftovers,
          },
        ],
        messages: ["Charizard's Eject Pack activated!"],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

class EmptyAppliedReactionRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onStatChange &&
      context.statChange?.phase === "after" &&
      context.pokemon.pokemon.uid === "charizard-1" &&
      context.statChange.attempted.some(
        (change) => change.stat === CORE_STAT_IDS.attack && change.stages < 0,
      ) &&
      context.statChange.applied.length === 0
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.speed,
          },
        ],
        messages: ["Adrenaline Orb-style reaction activated!"],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

class DeferredHeldItemChainRuleset extends MockRuleset {
  override hasHeldItems(): boolean {
    return true;
  }

  override calculateDamage() {
    return {
      damage: 20,
      effectiveness: 2,
      isCrit: false,
      randomFactor: 1,
    };
  }

  override applyHeldItem(trigger: string, context: ItemContext) {
    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onDamageTaken &&
      context.pokemon.pokemon.uid === "blastoise-1"
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.attack,
          },
        ],
        messages: ["First deferred stat boost activated!"],
      };
    }

    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onFoeStatChange &&
      context.pokemon.pokemon.uid === "charizard-1" &&
      context.statChange?.phase === "foe-after" &&
      context.statChange.applied.some(
        (change) => change.stat === CORE_STAT_IDS.attack && change.stages > 0,
      ) &&
      context.pokemon.statStages.speed === 0
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.speed,
          },
        ],
        messages: ["Second deferred stat boost activated!"],
      };
    }

    if (
      trigger === CORE_ITEM_TRIGGER_IDS.onFoeStatChange &&
      context.pokemon.pokemon.uid === "blastoise-1" &&
      context.statChange?.phase === "foe-after" &&
      context.statChange.applied.some(
        (change) => change.stat === CORE_STAT_IDS.speed && change.stages > 0,
      ) &&
      context.pokemon.statStages.spAttack === 0
    ) {
      return {
        activated: true,
        effects: [
          {
            type: BATTLE_ITEM_EFFECT_TYPES.statBoost,
            target: BATTLE_EFFECT_TARGETS.self,
            value: CORE_STAT_IDS.spAttack,
          },
        ],
        messages: ["Third deferred stat boost activated!"],
      };
    }

    return { activated: false, effects: [], messages: [] };
  }
}

function createHeldItemStatBoostEngine(ruleset: HeldItemStatBoostRuleset) {
  const config: BattleConfig = {
    generation: 9,
    format: "singles",
    teams: [
      [
        createTestPokemon(GEN9_SPECIES_IDS.charizard, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: createStats(200, 120),
          currentHp: 200,
        }),
      ],
      [
        createTestPokemon(GEN9_SPECIES_IDS.blastoise, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          heldItem: GEN9_ITEM_IDS.weaknessPolicy,
          moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: createStats(200, 80),
          currentHp: 200,
        }),
      ],
    ],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  return new BattleEngine(config, ruleset, createMockDataManager());
}

function createStatChangeEngine(
  ruleset: MockRuleset,
  side0HeldItem: string | null,
  side1HeldItem: string | null,
  includeBenchOnSide0 = false,
  includeBenchOnSide1 = false,
) {
  const side0Team = [
    createTestPokemon(GEN9_SPECIES_IDS.charizard, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      heldItem: side0HeldItem,
      moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: createStats(200, 120),
      currentHp: 200,
    }),
  ];
  if (includeBenchOnSide0) {
    side0Team.push(
      createTestPokemon(GEN9_SPECIES_IDS.pikachu, 50, {
        uid: "pikachu-1",
        nickname: "Pikachu",
        moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
        calculatedStats: createStats(120, 90),
        currentHp: 120,
      }),
    );
  }

  const config: BattleConfig = {
    generation: 9,
    format: "singles",
    teams: [
      side0Team,
      [
        createTestPokemon(GEN9_SPECIES_IDS.blastoise, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          heldItem: side1HeldItem,
          moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: createStats(200, 80),
          currentHp: 200,
        }),
        ...(includeBenchOnSide1
          ? [
              createTestPokemon(GEN9_SPECIES_IDS.pikachu, 50, {
                uid: "pikachu-2",
                nickname: "Pikachu",
                moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
                calculatedStats: createStats(120, 90),
                currentHp: 120,
              }),
            ]
          : []),
      ],
    ],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  return new BattleEngine(config, ruleset, createMockDataManager());
}

describe("BattleEngine held-item stat boosts", () => {
  it("given a held item stat-boost effect, when damage resolves, then a stat-change event is emitted and the stage is applied", () => {
    const ruleset = new HeldItemStatBoostRuleset();
    const engine = createHeldItemStatBoostEngine(ruleset);
    const events: BattleEvent[] = [];
    engine.on((event) => events.push(event));
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const statChangeEvents = events.filter(
      (event): event is StatChangeEvent => event.type === "stat-change",
    );
    expect(statChangeEvents).toHaveLength(2);
    expect(statChangeEvents.map((event) => event.stat)).toEqual([
      CORE_STAT_IDS.attack,
      CORE_STAT_IDS.spAttack,
    ]);
    expect(statChangeEvents.map((event) => event.stages)).toEqual([2, 2]);
    expect(statChangeEvents.map((event) => event.currentStage)).toEqual([2, 2]);

    const defender = engine.state.sides[1].active[0];
    expect(defender!.statStages.attack).toBe(2);
    expect(defender!.statStages.spAttack).toBe(2);
    expect(ruleset.itemTriggers).toContain(CORE_ITEM_TRIGGER_IDS.onDamageTaken);
  });

  it("given a pre-apply stat-change item, when the move tries to lower the holder's stat, then the engine blocks the change before emitting stat-change", () => {
    const ruleset = new StatChangeBlockRuleset();
    ruleset.setMoveEffectResult({
      statChanges: [
        { target: BATTLE_EFFECT_TARGETS.defender, stat: CORE_STAT_IDS.defense, stages: -1 },
      ],
    });
    const engine = createStatChangeEngine(ruleset, null, GEN9_ITEM_IDS.weaknessPolicy);
    const events: BattleEvent[] = [];
    engine.on((event) => events.push(event));
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(events.filter((event) => event.type === "stat-change")).toHaveLength(0);
    expect(engine.state.sides[1].active[0]?.statStages.defense).toBe(0);
    expect(ruleset.capturedPhases).toContain("before");
  });

  it("given a post-apply stat-change item that forces a switch, when the holder lowers its own stat, then the engine enters switch-prompt and applies the replacement after selection", () => {
    const ruleset = new StatChangeForceSwitchRuleset();
    ruleset.setMoveEffectResult({
      statChanges: [
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.defense, stages: -1 },
      ],
    });
    const engine = createStatChangeEngine(ruleset, CORE_ITEM_IDS.leftovers, null, true);
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("switch-prompt");
    engine.submitSwitch(0, 1);

    expect(engine.getPhase()).toBe("action-select");
    expect(engine.state.sides[0].active[0]?.pokemon.uid).toBe("pikachu-1");
  });

  it("given another switch effect is already pending from the move, when a post-apply stat-change force-switch item would activate, then the item stays unused and emits no message", () => {
    const ruleset = new CompetingSwitchItemRuleset();
    ruleset.setMoveEffectResult({
      statChanges: [
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.defense, stages: -1 },
      ],
    });
    const engine = createStatChangeEngine(
      ruleset,
      CORE_ITEM_IDS.leftovers,
      CORE_ITEM_IDS.ejectButton,
      true,
      true,
    );
    const events: BattleEvent[] = [];
    engine.on((event) => events.push(event));
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("switch-prompt");
    expect(engine.state.sides[0].active[0]?.pokemon.uid).toBe("charizard-1");
    expect(engine.state.sides[0].active[0]?.pokemon.heldItem).toBe(CORE_ITEM_IDS.leftovers);
    expect(engine.state.sides[1].active[0]?.pokemon.heldItem).toBeNull();
    expect(
      events.some(
        (event) => event.type === "message" && event.text === "Charizard's Eject Pack activated!",
      ),
    ).toBe(false);
  });

  it("given a post-apply held item reaction with no applied stat delta, when the drop clamps at the stage floor, then the engine still runs the after-phase item hook", () => {
    const ruleset = new EmptyAppliedReactionRuleset();
    ruleset.setMoveEffectResult({
      statChanges: [
        { target: BATTLE_EFFECT_TARGETS.attacker, stat: CORE_STAT_IDS.attack, stages: -1 },
      ],
    });
    const engine = createStatChangeEngine(ruleset, CORE_ITEM_IDS.leftovers, null);
    engine.start();
    engine.state.sides[0].active[0]!.statStages.attack = -6;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[0].active[0]?.statStages.attack).toBe(-6);
    expect(engine.state.sides[0].active[0]?.statStages.speed).toBe(1);
  });

  it("given deferred held-item boosts that enqueue more deferred held-item boosts, when the queue flushes, then it drains until the chain is fully applied", () => {
    const ruleset = new DeferredHeldItemChainRuleset();
    const engine = createStatChangeEngine(
      ruleset,
      CORE_ITEM_IDS.leftovers,
      CORE_ITEM_IDS.leftovers,
    );
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[1].active[0]?.statStages.attack).toBe(1);
    expect(engine.state.sides[0].active[0]?.statStages.speed).toBe(1);
    expect(engine.state.sides[1].active[0]?.statStages.spAttack).toBe(1);
  });
});
