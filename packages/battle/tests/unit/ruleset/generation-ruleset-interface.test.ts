import { describe, expect, it } from "vitest";
import type { MoveEffectContext } from "../../../src/context";
import type { BattleState } from "../../../src/state";
import { createActivePokemon, createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

describe("MockRuleset contract behavior", () => {
  it("given a sleeping Pokemon, when processSleepTurn runs, then the counter ticks down and wakes at zero", () => {
    const ruleset = new MockRuleset();
    const pokemon = createTestPokemon(6, 50, { status: "sleep" });
    const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
    const state = {} as BattleState;

    active.volatileStatuses.set("sleep-counter", { turnsLeft: 2 });

    expect(ruleset.processSleepTurn(active, state)).toBe(false);
    expect(active.pokemon.status).toBe("sleep");
    expect(active.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(1);

    expect(ruleset.processSleepTurn(active, state)).toBe(true);
    expect(active.pokemon.status).toBeNull();
    expect(active.volatileStatuses.has("sleep-counter")).toBe(false);
  });

  it("given a one-shot move effect override, when executeMoveEffect runs, then the override is consumed and the default result returns next", () => {
    const ruleset = new MockRuleset();
    const context = {} as MoveEffectContext;

    ruleset.setMoveEffectResult({
      recoilDamage: 12,
      switchOut: true,
      messages: ["Override applied"],
    });

    expect(ruleset.executeMoveEffect(context)).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 12,
      healAmount: 0,
      switchOut: true,
      messages: ["Override applied"],
    });

    expect(ruleset.executeMoveEffect(context)).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
    });
  });
});
