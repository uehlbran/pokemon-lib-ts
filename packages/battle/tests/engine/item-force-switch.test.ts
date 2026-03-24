import { describe, expect, it } from "vitest";
import type { BattleConfig, ItemContext, ItemResult } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

class ForceSwitchItemRuleset extends MockRuleset {
  private activated = false;

  constructor(
    private readonly mode: "red-card" | "eject-button",
    private readonly holderUid: string,
  ) {
    super();
  }

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    if (
      trigger !== "on-contact" ||
      this.activated ||
      context.pokemon.pokemon.uid !== this.holderUid
    ) {
      return { activated: false, effects: [], messages: [] };
    }

    this.activated = true;
    if (this.mode === "red-card") {
      return {
        activated: true,
        effects: [
          { type: "none", target: "opponent", value: "force-switch" },
          { type: "consume", target: "self", value: "red-card" },
        ],
        messages: ["Blastoise held up its Red Card against the attacker!"],
      };
    }

    return {
      activated: true,
      effects: [
        { type: "none", target: "self", value: "force-switch" },
        { type: "consume", target: "self", value: "eject-button" },
      ],
      messages: ["Blastoise's Eject Button activated!"],
    };
  }
}

function createForceSwitchItemEngine(mode: "red-card" | "eject-button") {
  const ruleset = new ForceSwitchItemRuleset(mode, "blastoise-1");
  const config: BattleConfig = {
    generation: 5,
    format: "singles",
    teams: [
      [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 153,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
          currentHp: 153,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-side0-bench",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 70,
            spAttack: 80,
            spDefense: 70,
            speed: 90,
          },
          currentHp: 120,
        }),
      ],
      [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 154,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 80,
          },
          currentHp: 154,
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-bench",
          nickname: "Pikachu",
          moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          calculatedStats: {
            hp: 120,
            attack: 80,
            defense: 70,
            spAttack: 80,
            spDefense: 70,
            speed: 90,
          },
          currentHp: 120,
        }),
      ],
    ],
    seed: 42,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, createMockDataManager());
  return engine;
}

describe("Held-item force switch handling", () => {
  it("given Red Card activates on the defender, when the attacker made contact, then the attacker is switched out immediately", () => {
    const engine = createForceSwitchItemEngine("red-card");

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[0].active[0]?.pokemon.uid).toBe("pikachu-side0-bench");
  });

  it("given Eject Button activates before the holder acts, when the holder is switched out, then its queued move is skipped", () => {
    const engine = createForceSwitchItemEngine("eject-button");

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[1].active[0]?.pokemon.uid).toBe("pikachu-bench");
    expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBe(153);
  });
});
