import { describe, expect, it } from "vitest";
import { CORE_ITEM_TRIGGER_IDS, CORE_MOVE_IDS, type PokemonInstance } from "../../../../core/src";
import type { BattleConfig, ItemContext, ItemResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

// ---------------------------------------------------------------------------
// Bug #519: ItemContext.opponent missing for on-damage-taken and on-hit triggers
// ---------------------------------------------------------------------------

/**
 * Bug #519: The engine was not passing the opponent field in ItemContext for
 * on-damage-taken and on-hit triggers. This prevented item handlers from
 * accessing the attacker (for on-damage-taken) or defender (for on-hit).
 * The on-contact trigger already passed opponent correctly.
 *
 * Source: Showdown sim/battle-actions.ts — item hooks receive both holder and opponent
 */

/**
 * MockRuleset subclass that enables held items and captures ItemContext.
 */
class ItemContextCaptureMockRuleset extends MockRuleset {
  capturedContexts: { trigger: string; context: ItemContext }[] = [];

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    this.capturedContexts.push({ trigger, context });
    return { activated: false, effects: [], messages: [] };
  }
}

const ITEM_TRIGGERS = {
  damageTaken: CORE_ITEM_TRIGGER_IDS.onDamageTaken,
  hit: CORE_ITEM_TRIGGER_IDS.onHit,
  contact: CORE_ITEM_TRIGGER_IDS.onContact,
} as const;

function createItemContextBattleEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: ItemContextCaptureMockRuleset;
}) {
  const ruleset = overrides?.ruleset ?? new ItemContextCaptureMockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    generation: 5,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("Bug #519 — ItemContext.opponent field", () => {
  it("given on-damage-taken item trigger, when fired, then ItemContext.opponent is the attacker", () => {
    // Arrange
    const { engine, ruleset } = createItemContextBattleEngine();
    engine.start();

    // Act — both sides use tackle. Charizard (speed 120) moves first, hitting Blastoise.
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — find the on-damage-taken trigger context
    // Source: Showdown — onDamagingHit item hooks receive attacker as opponent
    const damageTakenCtx = ruleset.capturedContexts.filter(
      (c) => c.trigger === ITEM_TRIGGERS.damageTaken,
    );
    expect(damageTakenCtx.length).toBeGreaterThanOrEqual(1);

    // The first on-damage-taken fires for Blastoise (defender) when Charizard (attacker) hits.
    // context.pokemon should be Blastoise (defender/holder), context.opponent should be Charizard (attacker)
    const firstCtx = damageTakenCtx[0]!;
    expect(firstCtx.context.pokemon.pokemon.uid).toBe("blastoise-1");
    expect(firstCtx.context.opponent?.pokemon.uid).toBe("charizard-1");
  });

  it("given on-hit item trigger, when fired, then ItemContext.opponent is the defender", () => {
    // Arrange
    const { engine, ruleset } = createItemContextBattleEngine();
    engine.start();

    // Act — both sides use tackle
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — find the on-hit trigger context
    // Source: Showdown — onHit item hooks receive defender as opponent
    const onHitCtx = ruleset.capturedContexts.filter((c) => c.trigger === ITEM_TRIGGERS.hit);
    expect(onHitCtx.length).toBeGreaterThanOrEqual(1);

    // The first on-hit fires for Charizard (attacker/holder) when it hits Blastoise (defender).
    // context.pokemon should be Charizard (attacker/holder), context.opponent should be Blastoise (defender)
    const firstCtx = onHitCtx[0]!;
    expect(firstCtx.context.pokemon.pokemon.uid).toBe("charizard-1");
    expect(firstCtx.context.opponent?.pokemon.uid).toBe("blastoise-1");
  });

  it("given a contact move hitting a contact-item holder, when on-contact item trigger fires, then ItemContext.opponent is the attacker", () => {
    // Arrange — tackle has contact flag, so on-contact should fire
    const { engine, ruleset } = createItemContextBattleEngine();
    engine.start();

    // Act — both sides use tackle (which has the contact flag)
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — find the on-contact trigger context
    // Source: Showdown — on-contact item hooks (Rocky Helmet) receive attacker as opponent
    const onContactCtx = ruleset.capturedContexts.filter(
      (c) => c.trigger === ITEM_TRIGGERS.contact,
    );
    expect(onContactCtx.length).toBeGreaterThanOrEqual(1);

    // The first on-contact fires for Blastoise (defender/holder) when Charizard (attacker) hits.
    // context.pokemon should be Blastoise (defender/holder), context.opponent should be Charizard (attacker)
    const firstCtx = onContactCtx[0]!;
    expect(firstCtx.context.pokemon.pokemon.uid).toBe("blastoise-1");
    expect(firstCtx.context.opponent?.pokemon.uid).toBe("charizard-1");
  });
});
