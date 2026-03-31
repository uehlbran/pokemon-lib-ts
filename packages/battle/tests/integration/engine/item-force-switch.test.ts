import { CORE_ITEM_TRIGGER_IDS, CORE_MOVE_IDS, createMoveSlot } from "@pokemon-lib-ts/core";
import { GEN5_ITEM_IDS } from "@pokemon-lib-ts/gen5";
import { describe, expect, it } from "vitest";
import type { BattleConfig, ItemContext, ItemResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

class ForceSwitchItemRuleset extends MockRuleset {
  private activated = false;

  constructor(
    private readonly mode: typeof GEN5_ITEM_IDS.redCard | typeof GEN5_ITEM_IDS.ejectButton,
    private readonly holderUid: string,
  ) {
    super();
  }

  override hasHeldItems(): boolean {
    return true;
  }

  override applyHeldItem(trigger: string, context: ItemContext): ItemResult {
    if (
      trigger !== CORE_ITEM_TRIGGER_IDS.onContact ||
      this.activated ||
      context.pokemon.pokemon.uid !== this.holderUid
    ) {
      return { activated: false, effects: [], messages: [] };
    }

    this.activated = true;
    if (this.mode === GEN5_ITEM_IDS.redCard) {
      return {
        activated: true,
        effects: [
          { type: "none", target: "opponent", value: "force-switch" },
          { type: "consume", target: "self", value: GEN5_ITEM_IDS.redCard },
        ],
        messages: ["Blastoise held up its Red Card against the attacker!"],
      };
    }

    return {
      activated: true,
      effects: [
        { type: "none", target: "self", value: "force-switch" },
        { type: "consume", target: "self", value: GEN5_ITEM_IDS.ejectButton },
      ],
      messages: ["Blastoise's Eject Button activated!"],
    };
  }
}

const DEFAULT_MOVE = createMockDataManager().getMove(CORE_MOVE_IDS.tackle);

function createForceSwitchItemEngine(
  mode: typeof GEN5_ITEM_IDS.redCard | typeof GEN5_ITEM_IDS.ejectButton,
  options?: { holderHasBench?: boolean; attackerHasBench?: boolean },
) {
  const holderHasBench = options?.holderHasBench ?? true;
  const attackerHasBench = options?.attackerHasBench ?? true;
  const ruleset = new ForceSwitchItemRuleset(mode, "blastoise-1");
  const config: BattleConfig = {
    generation: 5,
    format: "singles",
    teams: [
      [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
          calculatedStats: {
            // Source: createTestPokemon species #6 Charizard at level 50 in this test fixture path has 153 HP.
            hp: 153,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
          currentHp: 153,
        }),
        ...(attackerHasBench
          ? [
              createTestPokemon(25, 50, {
                uid: "pikachu-side0-bench",
                nickname: "Pikachu",
                moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
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
            ]
          : []),
      ],
      [
        createTestPokemon(9, 50, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          heldItem: mode,
          moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
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
        ...(holderHasBench
          ? [
              createTestPokemon(25, 50, {
                uid: "pikachu-bench",
                nickname: "Pikachu",
                moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
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
            ]
          : []),
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
    const engine = createForceSwitchItemEngine(GEN5_ITEM_IDS.redCard);

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[0].active[0]?.pokemon.uid).toBe("pikachu-side0-bench");
  });

  it("given Eject Button activates before the holder acts, when the holder is prompted to switch, then its queued move is skipped", () => {
    const engine = createForceSwitchItemEngine(GEN5_ITEM_IDS.ejectButton);

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("switch-prompt");
    // Source: the Charizard fixture above is initialized with 153 HP and should remain untouched
    // because Eject Button forces the holder out before its queued move resolves.
    expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBe(153);

    engine.submitSwitch(1, 1);

    expect(engine.getPhase()).toBe("action-select");
    expect(engine.state.sides[1].active[0]?.pokemon.uid).toBe("pikachu-bench");
  });

  it("given Eject Button would activate but the holder has no legal replacement, when contact damage resolves, then the item is not consumed and the holder still acts", () => {
    const engine = createForceSwitchItemEngine(GEN5_ITEM_IDS.ejectButton, {
      holderHasBench: false,
    });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("action-select");
    expect(engine.state.sides[1].active[0]?.pokemon.uid).toBe("blastoise-1");
    expect(engine.state.sides[1].active[0]?.pokemon.heldItem).toBe(GEN5_ITEM_IDS.ejectButton);
    expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBe(143);
  });

  it("given Red Card would force the attacker out but the attacker has no legal replacement, when contact damage resolves, then the item is not consumed and the attacker stays in", () => {
    const engine = createForceSwitchItemEngine(GEN5_ITEM_IDS.redCard, {
      attackerHasBench: false,
    });

    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.getPhase()).toBe("action-select");
    expect(engine.state.sides[0].active[0]?.pokemon.uid).toBe("charizard-1");
    expect(engine.state.sides[1].active[0]?.pokemon.heldItem).toBe(GEN5_ITEM_IDS.redCard);
  });
});
