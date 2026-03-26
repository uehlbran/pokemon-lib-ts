import {
  type AbilityTrigger,
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
  type PokemonInstance,
} from "@pokemon-lib-ts/core";
import { createGen4DataManager, GEN4_ABILITY_IDS, GEN4_SPECIES_IDS } from "@pokemon-lib-ts/gen4";
import { describe, expect, it } from "vitest";
import type { AbilityContext, AbilityResult, BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

const DATA_MANAGER = createGen4DataManager();
const FLINCH_TRIGGER = CORE_ABILITY_TRIGGER_IDS.onFlinch;
const FLINCH = CORE_VOLATILE_IDS.flinch;
const SPECIES_IDS = GEN4_SPECIES_IDS;
const ABILITY_IDS = GEN4_ABILITY_IDS;
const TACKLE = DATA_MANAGER.getMove(CORE_MOVE_IDS.tackle);

function createCanonicalTackleSlot() {
  return createMoveSlot(TACKLE.id, TACKLE.pp);
}

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

function createFlinchAbilityBattleEngine() {
  const ruleset = new FlinchAbilityMockRuleset();
  const events: BattleEvent[] = [];

  // Side 0: Tyrogue (Steadfast, slower, will flinch)
  // Side 1: Blastoise (faster, will use tackle)
  const team1: PokemonInstance[] = [
    createTestPokemon(SPECIES_IDS.tyrogue, 50, {
      uid: "tyrogue-1",
      nickname: "Tyrogue",
      ability: ABILITY_IDS.steadfast,
      moves: [createCanonicalTackleSlot()],
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
    createTestPokemon(SPECIES_IDS.blastoise, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      ability: CORE_ABILITY_IDS.torrent,
      moves: [createCanonicalTackleSlot()],
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
  const engine = new BattleEngine(config, ruleset, DATA_MANAGER);
  engine.on((event) => events.push(event));

  return { engine, ruleset, events };
}

describe("On-flinch ability dispatch", () => {
  it("given a Pokemon with Steadfast that flinches, when it tries to move, then on-flinch ability triggers", () => {
    // Arrange
    const { engine, ruleset, events } = createFlinchAbilityBattleEngine();
    // Source: Bulbapedia — Steadfast raises Speed by 1 stage when the Pokemon flinches
    ruleset.setAbilityHandler((trigger, ctx) => {
      if (trigger === FLINCH_TRIGGER && ctx.pokemon.ability === ABILITY_IDS.steadfast) {
        return {
          activated: true,
          effects: [{ effectType: "stat-change", target: "self", stat: "speed", stages: 1 }],
          messages: ["Steadfast raised its Speed!"],
        };
      }
      return { activated: false, effects: [], messages: [] };
    });

    engine.start();

    // Set flinch volatile on the slower Pokemon (side 0's Tyrogue)
    const active0 = engine.state.sides[0].active[0];
    active0!.volatileStatuses.set(FLINCH, { turnsLeft: 1 });

    // Act — both sides use tackle; side 0 is slower, will try to move but flinch
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — on-flinch trigger should have fired for Tyrogue
    const flinchTriggers = ruleset.triggerLog.filter((t) => t.trigger === FLINCH_TRIGGER);
    expect(flinchTriggers.length).toBe(1);
    expect(flinchTriggers[0]!.pokemonUid).toBe("tyrogue-1");

    // Verify Speed boost was applied
    // Source: Bulbapedia — Steadfast raises Speed by 1 stage
    const tyrogue = engine.state.sides[0].active[0];
    expect(tyrogue!.statStages.speed).toBe(1);

    // Verify the flinch message was emitted
    expect(events).toContainEqual({
      type: "message",
      text: "Tyrogue flinched and couldn't move!",
    });
  });

  it("given a Pokemon with abilities that does NOT flinch, when it moves normally, then on-flinch does NOT trigger", () => {
    // Arrange
    const { engine, ruleset } = createFlinchAbilityBattleEngine();
    ruleset.setAbilityHandler((trigger) => {
      if (trigger === FLINCH_TRIGGER) {
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
    const flinchTriggers = ruleset.triggerLog.filter((t) => t.trigger === FLINCH_TRIGGER);
    expect(flinchTriggers.length).toBe(0);

    // Speed should remain at default (0)
    const tyrogue = engine.state.sides[0].active[0];
    expect(tyrogue!.statStages.speed).toBe(0);
  });
});
