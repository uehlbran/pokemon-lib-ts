import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectContext, MoveEffectResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { VolatileStatusState } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    createTestPokemon(25, 50, {
      uid: "pikachu-1",
      nickname: "Pikachu",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 110,
      },
      currentHp: 100,
    }),
  ];

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
    createTestPokemon(6, 50, {
      uid: "charizard-2",
      nickname: "Charizard2",
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 70,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

function createLinkedVolatile(sourcePokemonUid: string): VolatileStatusState {
  return {
    turnsLeft: 2,
    sourcePokemonUid,
    blocksAction: true,
  } as unknown as VolatileStatusState;
}

describe("BattleEngine - source-linked target volatile lifecycle", () => {
  it("given executeMoveEffect applies a source-linked blocking volatile, when the source resolves it on the next turn, then the target is blocked until the resolution clears the volatile", () => {
    // Source: Showdown Sky Drop / trapping-style move flow — the target becomes immobilized
    // while the user keeps the effect active, then the effect is cleared by the resolving move.
    const ruleset = new MockRuleset();
    let callCount = 0;
    const originalExecute = ruleset.executeMoveEffect.bind(ruleset);
    ruleset.executeMoveEffect = (context: MoveEffectContext): MoveEffectResult => {
      callCount += 1;
      if (context.attacker.pokemon.uid === "charizard-1" && callCount === 1) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          targetVolatileInflicted: {
            volatile: "trapped",
            turnsLeft: 2,
            sourcePokemonUid: context.attacker.pokemon.uid,
            blocksAction: true,
          } as never,
        } as MoveEffectResult;
      }
      if (context.attacker.pokemon.uid === "charizard-1" && callCount === 2) {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          volatilesToClear: [{ target: "defender", volatile: "trapped" }],
        } as MoveEffectResult;
      }
      return originalExecute(context);
    };

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const linkedVolatile = engine.state.sides[1].active[0]?.volatileStatuses.get("trapped");
    expect(linkedVolatile).toEqual({
      turnsLeft: 2,
      sourcePokemonUid: "charizard-1",
      blocksAction: true,
    });

    const turn1MoveStarts = events.filter((event) => event.type === "move-start");
    expect(turn1MoveStarts).toHaveLength(1);
    expect(
      (turn1MoveStarts[0] as Extract<BattleEvent, { type: "move-start" }> | undefined)?.side,
    ).toBe(0);
    expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBe(
      engine.state.sides[0].active[0]?.pokemon.calculatedStats?.hp,
    );

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    const clearedVolatile = engine.state.sides[1].active[0]?.volatileStatuses.get("trapped");
    expect(clearedVolatile).toBeUndefined();

    const targetMoveStarts = events.filter(
      (event) => event.type === "move-start" && event.side === 1,
    );
    expect(targetMoveStarts).toHaveLength(1);

    const volatileEndEvents = events.filter(
      (event) => event.type === "volatile-end" && event.side === 1 && event.volatile === "trapped",
    );
    expect(volatileEndEvents).toHaveLength(1);
  });

  it("given a target with a source-linked blocking volatile, when the source switches out, then the volatile is cleared and the target can act", () => {
    // Source: Sky Drop-style source-leaves-field cleanup — switching out should release
    // the linked target before the opponent's move resolves.
    const { engine, events } = createEngine();
    engine.start();

    engine.state.sides[1].active[0]!.volatileStatuses.set(
      "trapped",
      createLinkedVolatile("charizard-1"),
    );

    engine.submitAction(0, { type: "switch", side: 0, switchTo: 1 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[1].active[0]?.volatileStatuses.has("trapped")).toBe(false);

    const volatileEndEvents = events.filter(
      (event) => event.type === "volatile-end" && event.side === 1 && event.volatile === "trapped",
    );
    expect(volatileEndEvents).toHaveLength(1);

    const targetMoveStarts = events.filter(
      (event) => event.type === "move-start" && event.side === 1,
    );
    expect(targetMoveStarts).toHaveLength(1);
  });

  it("given a target with a source-linked blocking volatile, when the source faints, then the volatile is cleared and the target can act", () => {
    // Source: Sky Drop-style source-faint cleanup — if the user faints, the target is released
    // before the opponent's move resolves.
    const ruleset = new MockRuleset();
    const originalExecute = ruleset.executeMoveEffect.bind(ruleset);
    ruleset.executeMoveEffect = (context: MoveEffectContext): MoveEffectResult => {
      if (context.attacker.pokemon.uid === "charizard-1") {
        return {
          statusInflicted: null,
          volatileInflicted: null,
          statChanges: [],
          recoilDamage: 0,
          healAmount: 0,
          switchOut: false,
          messages: [],
          selfFaint: true,
        } as MoveEffectResult;
      }
      return originalExecute(context);
    };

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    engine.state.sides[1].active[0]!.volatileStatuses.set(
      "trapped",
      createLinkedVolatile("charizard-1"),
    );

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(engine.state.sides[1].active[0]?.volatileStatuses.has("trapped")).toBe(false);

    const faintEvents = events.filter((event) => event.type === "faint" && event.side === 0);
    expect(faintEvents).toHaveLength(1);

    const volatileEndEvents = events.filter(
      (event) => event.type === "volatile-end" && event.side === 1 && event.volatile === "trapped",
    );
    expect(volatileEndEvents).toHaveLength(1);

    const targetMoveStarts = events.filter(
      (event) => event.type === "move-start" && event.side === 1,
    );
    expect(targetMoveStarts).toHaveLength(1);
  });
});
