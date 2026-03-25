import { CORE_ABILITY_IDS, CORE_MOVE_IDS, CORE_VOLATILE_IDS, type AbilityTrigger, type PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createMockMoveSlot } from "../../helpers/move-slot";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

/**
 * MockRuleset subclass that enables abilities and tracks on-flinch triggers.
 */
class FlinchAbilityMockRuleset extends MockRuleset {
  triggerLog: Array<{ trigger: AbilityTrigger; pokemonUid: string }> = [];
  private abilityHandler: ((trigger: AbilityTrigger, ctx: AbilityContext) => AbilityResult) | null =
    null;

  override hasAbilities(): boolean {
    return true;
  }

  setAbilityHandler(handler: (trigger: AbilityTrigger, ctx: AbilityContext) => AbilityResult) {
    this.abilityHandler = handler;
  }

  override applyAbility(trigger: AbilityTrigger, context: AbilityContext): AbilityResult {
    this.triggerLog.push({ trigger, pokemonUid: context.pokemon.pokemon.uid });
    if (this.abilityHandler) {
      return this.abilityHandler(trigger, context);
    }
    return { activated: false, effects: [], messages: [] };
  }
}

function createTestEngine() {
  const ruleset = new FlinchAbilityMockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  // Side 0: Charizard (slower, will flinch)
  // Side 1: Blastoise (faster, will use tackle)
  const team1: PokemonInstance[] = [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      ability: CORE_ABILITY_IDS.steadfast,
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
      ability: CORE_ABILITY_IDS.torrent,
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

describe("On-flinch ability dispatch", () => {
  it("given a Pokemon with Steadfast that flinches, when it tries to move, then on-flinch ability triggers", () => {
    // Arrange
    const { engine, ruleset, events } = createTestEngine();
    // Source: Bulbapedia — Steadfast raises Speed by 1 stage when the Pokemon flinches
    ruleset.setAbilityHandler((trigger, ctx) => {
      if (trigger === "on-flinch" && ctx.pokemon.ability === CORE_ABILITY_IDS.steadfast) {
        return {
          activated: true,
          effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
          messages: ["Steadfast raised its Speed!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Set flinch volatile on the slower Pokemon (side 0's Charizard)
    const active0 = engine.state.sides[0].active[0];
    active0!.volatileStatuses.set(CORE_VOLATILE_IDS.flinch, { turnsLeft: 1 });

    // Act — both sides use tackle; side 0 is slower, will try to move but flinch
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — on-flinch trigger should have fired for Charizard
    const flinchTriggers = ruleset.triggerLog.filter((t) => t.trigger === "on-flinch");
    expect(flinchTriggers.length).toBe(1);
    expect(flinchTriggers[0]!.pokemonUid).toBe("charizard-1");

    // Verify Speed boost was applied
    // Source: Bulbapedia — Steadfast raises Speed by 1 stage
    const charizard = engine.state.sides[0].active[0];
    expect(charizard!.statStages.speed).toBe(1);

    // Verify the flinch message was emitted
    const flinchMsg = events.find((e) => e.type === "message" && e.text.includes("flinched"));
    expect(flinchMsg).toBeDefined();
  });

  it("given a Pokemon with abilities that does NOT flinch, when it moves normally, then on-flinch does NOT trigger", () => {
    // Arrange
    const { engine, ruleset } = createTestEngine();
    ruleset.setAbilityHandler((trigger) => {
      if (trigger === "on-flinch") {
        return {
          activated: true,
          effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
          messages: ["Steadfast raised its Speed!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();
    // Do NOT set flinch volatile — normal move execution

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — no on-flinch triggers
    const flinchTriggers = ruleset.triggerLog.filter((t) => t.trigger === "on-flinch");
    expect(flinchTriggers.length).toBe(0);

    // Speed should remain at default (0)
    const charizard = engine.state.sides[0].active[0];
    expect(charizard!.statStages.speed).toBe(0);
  });
});
