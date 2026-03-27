import {
  type AbilityTrigger,
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_MOVE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { AbilityContext, BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

class AbilityTriggerAuditRuleset extends MockRuleset {
  readonly abilityTriggers: AbilityTrigger[] = [];

  override hasAbilities(): boolean {
    return true;
  }

  override applyAbility(trigger: AbilityTrigger, _context: AbilityContext) {
    this.abilityTriggers.push(trigger);
    return { activated: false, effects: [], messages: [] };
  }
}

class LocalDamageCalcAuditRuleset extends AbilityTriggerAuditRuleset {
  override calculateDamage(context: Parameters<MockRuleset["calculateDamage"]>[0]) {
    this.applyAbility(CORE_ABILITY_TRIGGER_IDS.onDamageCalc, {
      pokemon: context.attacker,
      opponent: context.defender,
      state: context.state,
      rng: context.state.rng,
      trigger: CORE_ABILITY_TRIGGER_IDS.onDamageCalc,
      move: context.move,
    });

    return super.calculateDamage(context);
  }
}

function createAbilityTriggerAuditEngine(ruleset: AbilityTriggerAuditRuleset): BattleEngine {
  const config: BattleConfig = {
    generation: 7,
    format: "singles",
    teams: [
      [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          ability: CORE_ABILITY_IDS.blaze,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
      ],
      [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          ability: CORE_ABILITY_IDS.blaze,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        }),
      ],
    ],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  return new BattleEngine(config, ruleset, createMockDataManager());
}

describe("BattleEngine ability trigger contract", () => {
  it("given a normal damaging move, when the engine resolves the turn, then ordinary BattleEngine move resolution does not dispatch on-damage-calc through applyAbility", () => {
    // Source: BattleEngine executeMove path on current main dispatches lifecycle hooks like
    // passive-immunity, on-damage-taken, and on-contact during ordinary move resolution,
    // but it does not call applyAbility with on-damage-calc there. Damage-calc ability
    // handling remains generation-owned.
    const ruleset = new AbilityTriggerAuditRuleset();
    const engine = createAbilityTriggerAuditEngine(ruleset);
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(ruleset.abilityTriggers).not.toContain(CORE_ABILITY_TRIGGER_IDS.onDamageCalc);
    expect(ruleset.abilityTriggers).toContain(CORE_ABILITY_TRIGGER_IDS.onDamageTaken);
  });

  it("given a ruleset-local damage pipeline hook, when the engine resolves the turn, then on-damage-calc still flows through generation-owned code instead of direct engine dispatch", () => {
    // Source: generation damage calculators own on-damage-calc usage and may opt into
    // applyAbility locally while BattleEngine itself stays on lifecycle dispatch only.
    const ruleset = new LocalDamageCalcAuditRuleset();
    const engine = createAbilityTriggerAuditEngine(ruleset);
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(ruleset.abilityTriggers).toContain(CORE_ABILITY_TRIGGER_IDS.onDamageCalc);
  });
});
