import type { AbilityTrigger, DamageContext } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { createMockMoveSlot } from "../../helpers/move-slot";
import type {
  AbilityContext,
  BattleConfig,
  ItemContext,
  MoveEffectContext,
  MoveEffectResult,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

const defaultMoveEffectResult: MoveEffectResult = {
  statusInflicted: null,
  volatileInflicted: null,
  statChanges: [],
  recoilDamage: 0,
  healAmount: 0,
  switchOut: false,
  messages: [],
};

function makeStats(hp: number, speed: number) {
  return {
    hp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed,
  };
}

function createRecursiveHookEngine(ruleset: RecursiveHookRuleset): BattleEngine {
  const config: BattleConfig = {
    generation: 5,
    format: "singles",
    teams: [
      [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.swordsDance)],
          calculatedStats: makeStats(200, 120),
          currentHp: 200,
        }),
      ],
      [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [createMockMoveSlot(CORE_MOVE_IDS.swordsDance)],
          calculatedStats: makeStats(200, 80),
          currentHp: 200,
        }),
      ],
    ],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  return new BattleEngine(config, ruleset, createMockDataManager());
}

class RecursiveHookRuleset extends MockRuleset {
  readonly passiveImmunityTriggers: AbilityTrigger[] = [];
  readonly damageAbilityTriggers: AbilityTrigger[] = [];
  readonly itemTriggers: string[] = [];
  readonly recursiveEffectCalls: string[] = [];

  constructor(
    private readonly options: {
      recursiveMoveId: string;
      damageByMoveId: Record<string, { damage: number; effectiveness: number }>;
      passiveImmunityActivates: boolean;
    },
  ) {
    super();
  }

  override hasAbilities(): boolean {
    return true;
  }

  override hasHeldItems(): boolean {
    return true;
  }

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    if (context.move.id === this.options.recursiveMoveId) {
      this.recursiveEffectCalls.push(context.move.id);
    }

    const base = { ...defaultMoveEffectResult };
    if (context.move.id !== CORE_MOVE_IDS.swordsDance || context.attacker.pokemon.uid !== "charizard-1") {
      return base;
    }

    return {
      ...base,
      recursiveMove: this.options.recursiveMoveId,
    };
  }

  override calculateDamage(context: DamageContext) {
    const profile =
      this.options.damageByMoveId[context.move.id] ?? this.options.damageByMoveId.default;
    return {
      damage: profile.damage,
      effectiveness: profile.effectiveness,
      isCrit: false,
      randomFactor: 1,
    };
  }

  override applyAbility(trigger: AbilityTrigger, _context: AbilityContext) {
    if (trigger === "passive-immunity") {
      this.passiveImmunityTriggers.push(trigger);
      if (this.options.passiveImmunityActivates) {
        return { activated: true, effects: [], messages: [] };
      }
    }

    if (trigger === "on-damage-taken" || trigger === "on-contact") {
      this.damageAbilityTriggers.push(trigger);
    }

    return { activated: false, effects: [], messages: [] };
  }

  override applyHeldItem(trigger: string, _context: ItemContext) {
    if (trigger === "on-damage-taken" || trigger === "on-contact" || trigger === "on-hit") {
      this.itemTriggers.push(trigger);
    }

    return { activated: false, effects: [], messages: [] };
  }
}

describe("BattleEngine.executeMoveById recursive hook parity", () => {
  it("given a recursive move that is fully absorbed, when executeMoveById resolves it, then passive-immunity fires and the recursive move never executes", () => {
    const ruleset = new RecursiveHookRuleset({
      recursiveMoveId: CORE_MOVE_IDS.thunderbolt,
      damageByMoveId: {
        thunderbolt: { damage: 0, effectiveness: 0 },
        default: { damage: 10, effectiveness: 1 },
      },
      passiveImmunityActivates: true,
    });
    const engine = createRecursiveHookEngine(ruleset);
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(ruleset.passiveImmunityTriggers).toEqual(["passive-immunity"]);
    expect(ruleset.recursiveEffectCalls).toHaveLength(0);
    expect(ruleset.itemTriggers).toHaveLength(0);
    expect(ruleset.damageAbilityTriggers).toHaveLength(0);
  });

  it("given a recursive contact move that deals damage, when executeMoveById resolves it, then on-damage-taken and on-contact hooks fire", () => {
    // Source of truth: executeMove() should remain the parity baseline for recursive move execution.
    // A successful damaging contact hit reaches defender on-damage-taken/on-contact hooks and attacker
    // on-hit item hooks (Life Orb / Shell Bell style post-damage effects) in the normal move path.
    const ruleset = new RecursiveHookRuleset({
      recursiveMoveId: CORE_MOVE_IDS.tackle,
      damageByMoveId: {
        tackle: { damage: 30, effectiveness: 1 },
        default: { damage: 10, effectiveness: 1 },
      },
      passiveImmunityActivates: false,
    });
    const engine = createRecursiveHookEngine(ruleset);
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Source: executeMove() parity contract for recursive moves.
    expect(ruleset.recursiveEffectCalls).toEqual([CORE_MOVE_IDS.tackle]);
    expect(ruleset.itemTriggers).toEqual(
      expect.arrayContaining(["on-damage-taken", "on-contact", "on-hit"]),
    );
    // Source: executeMove() parity contract for recursive moves.
    expect(ruleset.damageAbilityTriggers).toEqual(
      expect.arrayContaining(["on-damage-taken", "on-contact"]),
    );
  });
});
