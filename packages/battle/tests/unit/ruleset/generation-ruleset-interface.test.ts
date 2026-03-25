import { CORE_STATUS_IDS, CORE_TYPE_IDS, CORE_VOLATILE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { MoveEffectContext } from "../../../src/context";
import type { BattleState } from "../../../src/state";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";
import { MockRuleset } from "../../helpers/mock-ruleset";

describe("MockRuleset contract behavior", () => {
  it("given a sleeping Pokemon, when processSleepTurn runs, then the counter ticks down and wakes at zero", () => {
    const statusIds = CORE_STATUS_IDS;
    const typeIds = CORE_TYPE_IDS;
    const volatileIds = CORE_VOLATILE_IDS;
    const ruleset = new MockRuleset();
    const pokemon = createTestPokemon(6, 50, { status: statusIds.sleep });
    const active = createOnFieldPokemon(pokemon, 0, [typeIds.fire, typeIds.flying]);
    const state = {} as BattleState;

    active.volatileStatuses.set(volatileIds.sleepCounter, { turnsLeft: 2 });

    expect(ruleset.processSleepTurn(active, state)).toBe(false);
    expect(active.pokemon.status).toBe(statusIds.sleep);
    expect(active.volatileStatuses.get(volatileIds.sleepCounter)?.turnsLeft).toBe(1);

    expect(ruleset.processSleepTurn(active, state)).toBe(true);
    expect(active.pokemon.status).toBeNull();
    expect(active.volatileStatuses.has(volatileIds.sleepCounter)).toBe(false);
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
