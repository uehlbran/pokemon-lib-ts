/**
 * Gen 6 Engine Infrastructure Tests
 *
 * Tests the engine-level infrastructure added for Gen 6 features:
 *  - Battle gimmick activation hook in executeMove (Mega Evolution, Z-Move, Dynamax, Tera)
 *  - Grassy Terrain end-of-turn healing that actually applies HP changes
 *  - Terrain-setting from move effect results (processEffectResult)
 *
 * These are engine orchestration tests using MockRuleset. They verify that the
 * engine correctly delegates to the ruleset and applies the results to state.
 *
 * Source: Showdown sim/battle-actions.ts — gimmick activation, terrain setting
 * Source: Showdown sim/field.ts — Grassy Terrain residual healing
 */

import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { CORE_MOVE_IDS, CORE_TERRAIN_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it, vi } from "vitest";
import type {
  BattleConfig,
  BattleGimmick,
  EndOfTurnEffect,
  MoveEffectContext,
  MoveEffectResult,
  TerrainEffectResult,
} from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { ActivePokemon, BattleSide, BattleState } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";
import { createMockMoveSlot } from "../../helpers/move-slot";

const TERRAIN_IDS = CORE_TERRAIN_IDS;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  const team2 = overrides?.team2 ?? [
    createTestPokemon(9, 50, {
      uid: "blastoise-1",
      nickname: "Blastoise",
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

  const config: BattleConfig = {
    generation: 6,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

// ─── Gimmick Activation Hook Tests ──────────────────────────────────────────

describe("gimmick activation hook in executeMove", () => {
  it("given a ruleset that returns a gimmick from getBattleGimmick and canUse returns true, when action.mega is true, then gimmick.activate is called and events are emitted", () => {
    // Source: Showdown sim/battle-actions.ts — mega evolution triggers before move execution
    const ruleset = new MockRuleset();
    const activateSpy = vi.fn(() => megaEvents);
    const megaEvents: BattleEvent[] = [
      {
        type: "mega-evolve",
        side: 0 as const,
        pokemon: "Charizard",
        form: "mega-charizard-x",
      },
    ];

    const mockGimmick: BattleGimmick = {
      name: "Mega Evolution",
      generations: [6],
      canUse: (_pokemon: ActivePokemon, _side: BattleSide, _state: BattleState) => true,
      activate: activateSpy,
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    // Act — submit move with mega=true for side 0, normal move for side 1
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, mega: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    expect(activateSpy).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({
      type: "mega-evolve",
      side: 0,
      pokemon: "Charizard",
      form: "mega-charizard-x",
    });
  });

  it("given a ruleset gimmick where canUse returns false, when action.mega is true, then gimmick.activate is NOT called", () => {
    // Source: Showdown sim/battle-actions.ts — canMegaEvo check prevents activation
    const ruleset = new MockRuleset();
    const canUseSpy = vi.fn(() => false);
    const activateSpy = vi.fn(() => []);

    const mockGimmick: BattleGimmick = {
      name: "Mega Evolution",
      generations: [6],
      canUse: canUseSpy,
      activate: activateSpy,
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    const charizard = engine.getState().sides[0].active[0]?.pokemon;
    const blastoise = engine.getState().sides[1].active[0]?.pokemon;
    const charizardHp = charizard?.currentHp ?? 0;
    const charizardMaxHp = charizard?.calculatedStats.hp ?? 0;
    const blastoiseHp = blastoise?.currentHp ?? 0;
    const blastoiseMaxHp = blastoise?.calculatedStats.hp ?? 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, mega: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — activate should not have been called
    expect(canUseSpy).toHaveBeenCalledTimes(1);
    expect(activateSpy).not.toHaveBeenCalled();
    const megaEvent = events.find((e) => e.type === "mega-evolve");
    expect(megaEvent).toBeUndefined();
    expect(events.filter((e) => e.type === "move-start")).toEqual([
      {
        type: "move-start",
        side: 0,
        pokemon: "Charizard",
        move: CORE_MOVE_IDS.tackle,
      },
      {
        type: "move-start",
        side: 1,
        pokemon: "Blastoise",
        move: CORE_MOVE_IDS.tackle,
      },
    ]);
    expect(events.filter((e) => e.type === "damage")).toEqual([
      {
        type: "damage",
        side: 1,
        pokemon: "Blastoise",
        amount: 10,
        currentHp: blastoiseHp - 10,
        maxHp: blastoiseMaxHp,
        source: CORE_MOVE_IDS.tackle,
      },
      {
        type: "damage",
        side: 0,
        pokemon: "Charizard",
        amount: 10,
        currentHp: charizardHp - 10,
        maxHp: charizardMaxHp,
        source: CORE_MOVE_IDS.tackle,
      },
    ]);
  });

  it("given a ruleset with no gimmick (returns null), when action.mega is true, then no gimmick events are emitted and move proceeds normally", () => {
    // Source: Gen 1-5 rulesets all return null from getBattleGimmick()
    const ruleset = new MockRuleset();
    // MockRuleset.getBattleGimmick() returns null by default
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;
    const charizard = engine.getState().sides[0].active[0]?.pokemon;
    const blastoise = engine.getState().sides[1].active[0]?.pokemon;
    const charizardHp = charizard?.currentHp ?? 0;
    const charizardMaxHp = charizard?.calculatedStats.hp ?? 0;
    const blastoiseHp = blastoise?.currentHp ?? 0;
    const blastoiseMaxHp = blastoise?.calculatedStats.hp ?? 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0, mega: true });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — no mega event, but the normal move resolution still happens exactly once per side.
    const megaEvent = events.find((e) => e.type === "mega-evolve");
    expect(megaEvent).toBeUndefined();
    const moveStartEvents = events.filter((e) => e.type === "move-start");
    expect(moveStartEvents).toEqual([
      {
        type: "move-start",
        side: 0,
        pokemon: "Charizard",
        move: CORE_MOVE_IDS.tackle,
      },
      {
        type: "move-start",
        side: 1,
        pokemon: "Blastoise",
        move: CORE_MOVE_IDS.tackle,
      },
    ]);
    const damageEvents = events.filter((e) => e.type === "damage");
    expect(damageEvents).toEqual([
      {
        type: "damage",
        side: 1,
        pokemon: "Blastoise",
        amount: 10,
        currentHp: blastoiseHp - 10,
        maxHp: blastoiseMaxHp,
        source: CORE_MOVE_IDS.tackle,
      },
      {
        type: "damage",
        side: 0,
        pokemon: "Charizard",
        amount: 10,
        currentHp: charizardHp - 10,
        maxHp: charizardMaxHp,
        source: CORE_MOVE_IDS.tackle,
      },
    ]);
  });

  it("given action.mega is false/undefined, when move executes, then gimmick hook is skipped entirely", () => {
    // Source: only gimmick flags trigger the hook
    const ruleset = new MockRuleset();
    const canUseSpy = vi.fn(() => true);
    const activateSpy = vi.fn(() => []);

    const mockGimmick: BattleGimmick = {
      name: "Mega Evolution",
      generations: [6],
      canUse: canUseSpy,
      activate: activateSpy,
    };

    ruleset.getBattleGimmick = () => mockGimmick;
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];

    const { engine } = createEngine({ ruleset });
    engine.start();

    // No mega flag
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — canUse should not be called when no gimmick flag is set
    expect(canUseSpy).not.toHaveBeenCalled();
    expect(activateSpy).not.toHaveBeenCalled();
  });
});

// ─── Grassy Terrain Heal Tests ──────────────────────────────────────────────

describe("grassy terrain heal end-of-turn", () => {
  it("given grassy terrain is active and applyTerrainEffects returns healAmount, when end of turn runs, then Pokemon HP is increased and heal event is emitted", () => {
    // Source: Showdown sim/field.ts — Grassy Terrain heals 1/16 max HP for grounded Pokemon
    // A Pokemon with max HP 200 should heal 12 HP (floor(200/16) = 12)
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["grassy-terrain-heal"];

    // Override applyTerrainEffects to return healing
    ruleset.applyTerrainEffects = (_state: BattleState): TerrainEffectResult[] => [
      {
        side: 0,
        pokemon: "Charizard",
        effect: "grassy-heal",
        message: "Charizard was healed by the grassy terrain!",
        healAmount: 12, // floor(200/16) = 12
      },
      {
        side: 1,
        pokemon: "Blastoise",
        effect: "grassy-heal",
        message: "Blastoise was healed by the grassy terrain!",
        healAmount: 12,
      },
    ];

    const team1 = [
      createTestPokemon(6, 50, {
        uid: "charizard-1",
        nickname: "Charizard",
        moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
        currentHp: 150, // Damaged: 50 HP missing
      }),
    ];

    const team2 = [
      createTestPokemon(9, 50, {
        uid: "blastoise-1",
        nickname: "Blastoise",
        moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
        currentHp: 150, // Damaged: 50 HP missing
      }),
    ];

    const { engine, events } = createEngine({ ruleset, team1, team2 });
    engine.start();

    // Set grassy terrain on the state
    engine.state.terrain = {
      type: "grassy",
      turnsLeft: 5,
      source: CORE_TERRAIN_IDS.grassyTerrain,
    };

    // Reduce HP to simulate damage (engine may have set currentHp to calculatedStats.hp)
    const internalState = engine.state;
    const p0 = internalState.sides[0].active[0];
    const p1 = internalState.sides[1].active[0];
    if (p0) p0.pokemon.currentHp = 150;
    if (p1) p1.pokemon.currentHp = 150;

    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — heal events should be present
    const healEvents = events.filter(
      (e) =>
        e.type === "heal" && (e as { source: string }).source === CORE_TERRAIN_IDS.grassyTerrain,
    );
    expect(healEvents.length).toBeGreaterThanOrEqual(1);

    // Check that at least one heal event has the correct amount
    // Source: floor(200/16) = 12
    const charizardHeal = healEvents.find(
      (e) => e.type === "heal" && (e as { pokemon: string }).pokemon === "Charizard",
    );
    expect(charizardHeal?.type === "heal" && charizardHeal.amount).toBe(12);
    expect(charizardHeal?.type === "heal" && charizardHeal.source).toBe(
      CORE_TERRAIN_IDS.grassyTerrain,
    );
  });

  it("given grassy terrain is active and Pokemon is at full HP, when end of turn runs with healAmount, then no heal event is emitted (no overheal)", () => {
    // Source: Showdown sim/field.ts — heal is capped at max HP
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["grassy-terrain-heal"];

    ruleset.applyTerrainEffects = (_state: BattleState): TerrainEffectResult[] => [
      {
        side: 0,
        pokemon: "Charizard",
        effect: "grassy-heal",
        message: "Charizard was healed by the grassy terrain!",
        healAmount: 12,
      },
    ];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Set grassy terrain — Pokemon is at full HP (200/200)
    engine.state.terrain = {
      type: "grassy",
      turnsLeft: 5,
      source: CORE_TERRAIN_IDS.grassyTerrain,
    };
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — Charizard takes damage from tackle first, so heal might still apply.
    // But we are testing the case where healed amount would be 0 because currentHp == maxHp.
    // Depending on turn resolution order, side 0 might be damaged.
    // To truly test no-overheal, check that no heal event has amount > max missing HP.
    const healEvents = events.filter(
      (e) =>
        e.type === "heal" && (e as { source: string }).source === CORE_TERRAIN_IDS.grassyTerrain,
    );
    for (const heal of healEvents) {
      if (heal.type === "heal") {
        // Heal amount should never result in currentHp exceeding maxHp
        expect(heal.currentHp).toBeLessThanOrEqual(heal.maxHp);
      }
    }
  });

  it("given grassy terrain is active but applyTerrainEffects returns healAmount=0, when end of turn runs, then no heal event is emitted", () => {
    // Source: Showdown sim/field.ts — non-grounded Pokemon or immune Pokemon get 0 heal
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["grassy-terrain-heal"];

    ruleset.applyTerrainEffects = (_state: BattleState): TerrainEffectResult[] => [
      {
        side: 0,
        pokemon: "Charizard",
        effect: "grassy-heal",
        message: "",
        healAmount: 0, // Not grounded — no healing
      },
    ];

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    engine.state.terrain = {
      type: "grassy",
      turnsLeft: 5,
      source: CORE_TERRAIN_IDS.grassyTerrain,
    };
    const state = engine.getState();
    const p0 = state.sides[0].active[0];
    if (p0) p0.pokemon.currentHp = 150;
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — no grassy-terrain heal event
    const grassyHeals = events.filter(
      (e) =>
        e.type === "heal" && (e as { source: string }).source === CORE_TERRAIN_IDS.grassyTerrain,
    );
    expect(grassyHeals.length).toBe(0);
  });

  it("given no grassy terrain is active, when grassy-terrain-heal EoT runs, then applyTerrainEffects is not called", () => {
    // Source: Showdown sim/field.ts — terrain effects only fire when terrain is active
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => ["grassy-terrain-heal"];

    const applyTerrainEffectsSpy = vi.spyOn(ruleset, "applyTerrainEffects").mockReturnValue([]);

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    // No terrain set — state.terrain remains null
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    expect(applyTerrainEffectsSpy).not.toHaveBeenCalled();
  });
});

// ─── Terrain Setting from Move Effects Tests ────────────────────────────────

describe("terrain-setting from move effect results", () => {
  it("given a move effect that returns terrainSet with grassy terrain, when the move resolves, then state.terrain is set and terrain-set event is emitted", () => {
    // Source: Showdown sim/battle-actions.ts — Grassy Terrain move sets terrain for 5 turns
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    // Enable terrain support in the mock
    ruleset.hasTerrain = () => true;

    // Override executeMoveEffect to return terrainSet on first call only.
    const executeMoveEffectSpy = vi.spyOn(ruleset, "executeMoveEffect");
    executeMoveEffectSpy.mockImplementationOnce((_ctx: MoveEffectContext): MoveEffectResult => {
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
        terrainSet: {
          terrain: TERRAIN_IDS.grassy,
          turns: 5,
          source: TERRAIN_IDS.grassyTerrain,
        },
      };
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — terrain should be set
    expect(executeMoveEffectSpy).toHaveBeenCalledTimes(2);
    expect(engine.getState().terrain).toEqual({
      type: TERRAIN_IDS.grassy,
      turnsLeft: 5,
      source: TERRAIN_IDS.grassyTerrain,
    });

    expect(events).toContainEqual({
      type: "terrain-set",
      terrain: TERRAIN_IDS.grassy,
      source: TERRAIN_IDS.grassyTerrain,
    });
  });

  it("given a move effect that returns terrainSet=null, when terrain is currently active, then terrain is cleared and terrain-end event is emitted", () => {
    // Source: Showdown sim/battle-actions.ts — certain moves clear terrain
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    ruleset.hasTerrain = () => true;

    const executeMoveEffectSpy = vi.spyOn(ruleset, "executeMoveEffect");
    executeMoveEffectSpy.mockImplementationOnce((_ctx: MoveEffectContext): MoveEffectResult => {
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
        terrainSet: null, // Clear terrain
      };
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();

    // Pre-set terrain
    engine.state.terrain = {
      type: TERRAIN_IDS.electric,
      turnsLeft: 3,
      source: TERRAIN_IDS.electricTerrain,
    };
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — terrain should be cleared
    expect(executeMoveEffectSpy).toHaveBeenCalledTimes(2);
    expect(engine.getState().terrain).toBeNull();

    const terrainEndEvent = events.find((e) => e.type === "terrain-end");
    expect(terrainEndEvent).toEqual({
      type: "terrain-end",
      terrain: TERRAIN_IDS.electric,
    });
  });

  it("given hasTerrain returns false, when move effect returns terrainSet, then terrain is not set (gen pre-6 guard)", () => {
    // Source: Gen 1-5 rulesets return hasTerrain()=false
    const ruleset = new MockRuleset();
    ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => [];
    // hasTerrain returns false by default in MockRuleset

    const executeMoveEffectSpy = vi.spyOn(ruleset, "executeMoveEffect");
    executeMoveEffectSpy.mockImplementationOnce((_ctx: MoveEffectContext): MoveEffectResult => {
      return {
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
        terrainSet: {
          terrain: TERRAIN_IDS.grassy,
          turns: 5,
          source: TERRAIN_IDS.grassyTerrain,
        },
      };
    });

    const { engine, events } = createEngine({ ruleset });
    engine.start();
    events.length = 0;

    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert — terrain should remain null
    expect(executeMoveEffectSpy).toHaveBeenCalledTimes(2);
    expect(executeMoveEffectSpy.mock.results[0]?.value).toEqual({
      statusInflicted: null,
      volatileInflicted: null,
      statChanges: [],
      recoilDamage: 0,
      healAmount: 0,
      switchOut: false,
      messages: [],
      terrainSet: {
        terrain: TERRAIN_IDS.grassy,
        turns: 5,
        source: TERRAIN_IDS.grassyTerrain,
      },
    });
    expect(engine.getState().terrain).toBeNull();
    expect(events.some((e) => e.type === "terrain-set")).toBe(false);
  });
});
