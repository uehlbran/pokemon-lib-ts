import type { DataManager, MoveData, PokemonInstance, SeededRandom } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_MOVE_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { GEN9_SPECIES_IDS } from "@pokemon-lib-ts/gen9";
import { describe, expect, it } from "vitest";
import type { BattleConfig, MoveEffectContext, MoveEffectResult } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent } from "../../../src/events";
import type { ActivePokemon } from "../../../src/state";
import { createTestPokemon } from "../../../src/utils";
import { createMockMoveSlot } from "../../helpers/move-slot";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

const DEFAULT_CHARIZARD_STATS = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 120,
} as const;
const DEFAULT_BLASTOISE_STATS = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 80,
} as const;

function createBattlePokemon(
  speciesId: number,
  uid: string,
  nickname: string,
  speed: number,
  overrides: Partial<PokemonInstance> = {},
) {
  return createTestPokemon(speciesId, 50, {
    uid,
    nickname,
    moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle)],
    calculatedStats: {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed,
    },
    currentHp: 200,
    ...overrides,
  });
}

function createEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
  dataManager?: DataManager;
  isWildBattle?: boolean;
  generation?: number;
}) {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = overrides?.dataManager ?? createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createBattlePokemon(
      GEN9_SPECIES_IDS.charizard,
      "charizard-1",
      "Charizard",
      DEFAULT_CHARIZARD_STATS.speed,
      { currentHp: 200 },
    ),
  ];

  const team2 = overrides?.team2 ?? [
    createBattlePokemon(
      GEN9_SPECIES_IDS.blastoise,
      "blastoise-1",
      "Blastoise",
      DEFAULT_BLASTOISE_STATS.speed,
      { currentHp: 200 },
    ),
  ];

  const config: BattleConfig = {
    generation: overrides?.generation ?? 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
    isWildBattle: overrides?.isWildBattle ?? false,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events, dataManager };
}

class RecursiveEscapeRuleset extends MockRuleset {
  private executeMoveEffectCalls = 0;

  override executeMoveEffect(context: MoveEffectContext): MoveEffectResult {
    this.executeMoveEffectCalls += 1;
    const base = super.executeMoveEffect(context);

    if (this.executeMoveEffectCalls === 1) {
      return {
        ...base,
        recursiveMove: "recharge-test-move",
      };
    }

    return {
      ...base,
      escapeBattle: true,
    };
  }
}

class DelegatingPerishSongRuleset extends MockRuleset {
  private perishSongCalls = 0;

  getPerishSongCalls(): number {
    return this.perishSongCalls;
  }

  override getEndOfTurnOrder(): readonly (
    | typeof CORE_MOVE_IDS.perishSong
    | typeof CORE_END_OF_TURN_EFFECT_IDS.statusDamage
  )[] {
    return [CORE_MOVE_IDS.perishSong, CORE_END_OF_TURN_EFFECT_IDS.statusDamage];
  }

  override processPerishSong(active: ActivePokemon): {
    readonly newCount: number;
    readonly fainted: boolean;
  } {
    this.perishSongCalls += 1;
    return super.processPerishSong(active);
  }
}

describe("BattleEngine — advanced scenarios", () => {
  describe("move miss", () => {
    it("given the ruleset says move misses, when a move is used, then move-miss event is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setAlwaysHit(false);
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const missEvents = events.filter((e) => e.type === "move-miss");
      expect(
        missEvents.map((event) => ({
          type: event.type,
          side: event.side,
          pokemon: event.pokemon,
          move: event.move,
        })),
      ).toEqual([
      { type: "move-miss", side: 0, pokemon: "Charizard", move: CORE_MOVE_IDS.tackle },
      { type: "move-miss", side: 1, pokemon: "Blastoise", move: CORE_MOVE_IDS.tackle },
      ]);
    });

    it("given a move misses, when turn resolves, then no damage is dealt by that move", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setAlwaysHit(false);
      const { engine } = createEngine({ ruleset });
      engine.start();

      const initialHp0 = engine.state.sides[0].active[0]?.pokemon.currentHp;
      const initialHp1 = engine.state.sides[1].active[0]?.pokemon.currentHp;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — both pokemon should still be at full HP (both missed)
      expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBe(initialHp0);
      expect(engine.state.sides[1].active[0]?.pokemon.currentHp).toBe(initialHp1);
    });
  });

  describe("critical hit", () => {
    it("given the ruleset always crits, when a move is used, then critical-hit event is emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setAlwaysCrit(true);
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const critEvents = events.filter((e) => e.type === "critical-hit");
      expect(critEvents).toEqual([{ type: "critical-hit" }, { type: "critical-hit" }]);
    });
  });

  describe("battle end from battle action", () => {
    it("given both sides faint simultaneously, when damage resolves, then a winner is declared", () => {
      // Arrange — both at 1 HP
      const team1 = [
        createBattlePokemon(GEN9_SPECIES_IDS.charizard, "charizard-1", "Charizard", 120, {
          currentHp: 1,
        }),
      ];
      const team2 = [
        createBattlePokemon(GEN9_SPECIES_IDS.blastoise, "blastoise-1", "Blastoise", 80, {
          currentHp: 1,
        }),
      ];

      const { engine } = createEngine({ team1, team2 });
      engine.start();

      // Manually set HP to 1 after start (start recalculates)
      engine.state.sides[0].active[0]!.pokemon.currentHp = 1;
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — battle should have ended
      expect(engine.isEnded()).toBe(true);
      expect(engine.getWinner()).toBe(0);
    });

    it("given a recursive move ends the battle, when the outer move resolves, then it stops post-battle bookkeeping", () => {
      // Arrange
      const dataManager = createMockDataManager();
      const tackleMove = dataManager.getMove(CORE_MOVE_IDS.tackle);
      const rechargeMove = {
        ...tackleMove,
        id: "recharge-test-move",
        displayName: "Recharge Test Move",
        flags: {
          ...tackleMove.flags,
          recharge: true,
        },
      } satisfies MoveData;
      (dataManager as unknown as { movesById: Map<string, MoveData> }).movesById.set(
        rechargeMove.id,
        rechargeMove,
      );

      const team1 = [
        createBattlePokemon(GEN9_SPECIES_IDS.charizard, "charizard-1", "Charizard", 120, {
          currentHp: 1,
          moves: [createMockMoveSlot(CORE_MOVE_IDS.tackle, { currentPP: 5, maxPP: 5 })],
        }),
      ];

      const { engine } = createEngine({
        team1,
        ruleset: new RecursiveEscapeRuleset(),
        dataManager,
        isWildBattle: true,
      });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const actor = engine.state.sides[0].active[0] as ActivePokemon;
      expect(engine.isEnded()).toBe(true);
      expect(engine.getPhase()).toBe("battle-end");
      expect(actor.volatileStatuses.has(CORE_VOLATILE_IDS.recharge)).toBe(false);
    });
  });

  describe("end-of-turn status effects", () => {
    it("given a badly-poisoned pokemon, when end of turn processes, then toxic damage is applied", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      engine.state.sides[0].active[0]!.pokemon.status = CORE_STATUS_IDS.badlyPoisoned;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const statusDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === CORE_STATUS_IDS.badlyPoisoned,
      );
      expect(statusDamage.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("weather and terrain countdown", () => {
    it("given active weather with turns remaining, when weather-countdown runs, then turnsLeft decrements by 1 without ending weather", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      // Set weather manually.
      engine.state.weather = { type: CORE_WEATHER_IDS.rain, turnsLeft: 2, source: "test" };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.weather).toEqual({ type: CORE_WEATHER_IDS.rain, turnsLeft: 1, source: "test" });
      expect(events.filter((event) => event.type === "weather-end")).toEqual([]);
    });

    it("given weather at 1 turn remaining, when end of turn processes with weather-countdown, then weather clears", () => {
      // Arrange — use a ruleset that includes weather-countdown
      const ruleset = new MockRuleset();
      // Override getEndOfTurnOrder to include weather
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.weather = { type: CORE_WEATHER_IDS.rain, turnsLeft: 1, source: "test" };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.weather).toBeNull();
      const weatherEnd = events.find((e) => e.type === "weather-end");
      expect(weatherEnd).toEqual({ type: "weather-end", weather: CORE_WEATHER_IDS.rain });
    });

    it("given terrain at 1 turn remaining, when end of turn processes with terrain-countdown, then terrain clears", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.terrainCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.terrain = { type: CORE_TERRAIN_IDS.electric, turnsLeft: 1, source: "test" };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.terrain).toBeNull();
      const terrainEnd = events.find((e) => e.type === "terrain-end");
      expect(terrainEnd).toEqual({ type: "terrain-end", terrain: CORE_TERRAIN_IDS.electric });
    });
  });

  describe("screen countdown", () => {
    it("given a screen at 1 turn remaining, when end of turn processes, then screen expires", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.screenCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.sides[0].screens = [{ type: CORE_SCREEN_IDS.reflect, turnsLeft: 1 }];

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[0].screens).toHaveLength(0);
      const screenEnd = events.find((e) => e.type === "screen-end");
      expect(screenEnd).toEqual({ type: "screen-end", side: 0, screen: CORE_SCREEN_IDS.reflect });
    });

    it("given Safeguard at 1 turn remaining, when safeguard-countdown runs, then it emits screen-end", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.safeguardCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.sides[0].screens = [{ type: "safeguard", turnsLeft: 1 }];

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[0].screens).toHaveLength(0);
      const screenEnd = events.find(
        (event) =>
          event.type === "screen-end" && event.side === 0 && event.screen === "safeguard",
      );
      expect(screenEnd).toEqual({ type: "screen-end", side: 0, screen: "safeguard" });
      const screenEndIndex = events.indexOf(screenEnd);
      const safeguardWearOffMessage = events.find(
        (event) => event.type === "message" && event.text === "Side 0's Safeguard wore off!",
      );
      // Source: packages/battle/src/engine/BattleEngine.ts emits the legacy wear-off text
      // immediately after the new screen-end event for Safeguard expiration.
      expect(safeguardWearOffMessage).toEqual({
        type: "message",
        text: "Side 0's Safeguard wore off!",
      });
      const safeguardWearOffMessageIndex = events.indexOf(safeguardWearOffMessage);
      expect(screenEndIndex).toBeLessThan(safeguardWearOffMessageIndex);
    });

    it("given Safeguard at 5 turns remaining, when both screen-countdown and safeguard-countdown run, then it only loses one turn", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.screenCountdown,
        CORE_END_OF_TURN_EFFECT_IDS.safeguardCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      // Source: specs/battle/05-gen4.md lists Safeguard as lasting 5 turns in Gen 4.
      engine.state.sides[0].screens = [{ type: "safeguard", turnsLeft: 5 }];

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[0].screens).toEqual([{ type: "safeguard", turnsLeft: 4 }]);
      const screenEnd = events.find((event) => event.type === "screen-end");
      expect(screenEnd).toBeUndefined();
    });
  });

  describe("perish song countdown", () => {
    it("given a pokemon affected by Perish Song, when end of turn processes, then the engine delegates the countdown to the ruleset contract", () => {
      // Arrange
      const ruleset = new DelegatingPerishSongRuleset().setGenerationForTest(2);
      ruleset.setAlwaysHit(false);
      const { engine } = createEngine({ ruleset, generation: 2 });
      engine.start();

      const active = engine.state.sides[0].active[0];
      active!.volatileStatuses.set(CORE_MOVE_IDS.perishSong, {
        turnsLeft: -1,
        data: { counter: 2 },
      });
      const initialHp = active!.pokemon.currentHp;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(ruleset.getPerishSongCalls()).toBe(1);
      expect(active!.volatileStatuses.get(CORE_MOVE_IDS.perishSong)?.data?.counter).toBe(1);
      expect(active!.pokemon.currentHp).toBe(initialHp);
    });
  });

  describe("hazard removal effects", () => {
    it("given a move effect clears defender hazards, when turn resolution removes them, then hazard-clear events are emitted for each removed hazard", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setMoveEffectResult({ clearSideHazards: "defender" });
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.state.sides[1].hazards = [
        { type: "spikes", layers: 2 },
        { type: "stealth-rock", layers: 1 },
      ];

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[1].hazards).toHaveLength(0);
      const hazardClearEvents = events.filter(
        (event) => event.type === "hazard-clear" && event.side === 1,
      );
      // Source: the fixture seeded only Spikes and Stealth Rock on side 1, so those are the hazards cleared.
      expect(hazardClearEvents).toEqual([
        { type: "hazard-clear", side: 1, hazard: "spikes" },
        { type: "hazard-clear", side: 1, hazard: "stealth-rock" },
      ]);
      const hazardClearMessageIndex = events.findIndex(
        (event) => event.type === "message" && event.text === "The hazards were cleared!",
      );
      const lastHazardClearEventIndex = events.reduce((lastIndex, event, index) => {
        return event.type === "hazard-clear" && event.side === 1 ? index : lastIndex;
      }, -1);
      // Source: BattleEngine emits the legacy clear message after the structured hazard-clear events.
      expect(hazardClearMessageIndex).toBeGreaterThan(lastHazardClearEventIndex);
    });
  });

  describe("screen removal effects", () => {
    it("given a move effect clears selected defender screens, when turn resolution removes them, then screen-end events are emitted for each removed screen", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setMoveEffectResult({
        screensCleared: "defender",
        screenTypesToRemove: [CORE_SCREEN_IDS.reflect, CORE_SCREEN_IDS.lightScreen],
      });
      const { engine, events } = createEngine({ ruleset });
      engine.start();

      engine.state.sides[1].screens = [
        { type: CORE_SCREEN_IDS.reflect, turnsLeft: 5 },
        { type: CORE_SCREEN_IDS.lightScreen, turnsLeft: 5 },
        { type: "safeguard", turnsLeft: 5 },
      ];

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      // Source: only Reflect and Light Screen were targeted for removal in the fixture above.
      expect(engine.state.sides[1].screens).toEqual([{ type: "safeguard", turnsLeft: 5 }]);
      const screenEndEvents = events.filter(
        (event) => event.type === "screen-end" && event.side === 1,
      );
      // Source: clearScreens emits one screen-end event per removed screen, in removal order.
      expect(screenEndEvents).toEqual([
        { type: "screen-end", side: 1, screen: CORE_SCREEN_IDS.reflect },
        { type: "screen-end", side: 1, screen: CORE_SCREEN_IDS.lightScreen },
      ]);
    });
  });

  describe("tailwind countdown", () => {
    it("given tailwind at 1 turn remaining, when end of turn processes, then tailwind expires", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.tailwindCountdown,
        ...originalOrder,
      ];

      const { engine } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.sides[0].tailwind = { active: true, turnsLeft: 1 };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[0].tailwind.active).toBe(false);
    });
  });

  describe("trick room countdown", () => {
    it("given trick room at 1 turn remaining, when end of turn processes, then trick room expires", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.trickRoomCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.trickRoom = { active: true, turnsLeft: 1 };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.trickRoom.active).toBe(false);
      expect(events).toContainEqual({
        type: "message",
        text: "The twisted dimensions returned to normal!",
      });
    });
  });

  describe("encore countdown", () => {
    it("given encore tracked by moveId, when the encored move reaches 0 PP, then encore ends at end of turn", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
        ...originalOrder,
      ];

      const { engine, events } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      const active = engine.state.sides[0].active[0] as ActivePokemon;
      active.pokemon.moves[0] = createMockMoveSlot(CORE_MOVE_IDS.tackle, { currentPP: 1 });
      active.volatileStatuses.set(CORE_VOLATILE_IDS.encore, {
        turnsLeft: 2,
        data: { moveId: CORE_MOVE_IDS.tackle },
      });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(active.volatileStatuses.has(CORE_VOLATILE_IDS.encore)).toBe(false);
      const encoreEnd = events.find(
        (event) =>
          event.type === "volatile-end" &&
          event.side === 0 &&
          event.volatile === CORE_VOLATILE_IDS.encore,
      );
      expect(encoreEnd).toEqual({
        type: "volatile-end",
        side: 0,
        pokemon: "Charizard",
        volatile: CORE_VOLATILE_IDS.encore,
      });
    });
  });

  describe(`volatile ${CORE_VOLATILE_IDS.flinch}`, () => {
    it("given a pokemon with flinch volatile, when it tries to move, then it cannot move", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Give Blastoise (side 1, slower) the flinch volatile
      const blastoise = engine.state.sides[1].active[0] as ActivePokemon;
      blastoise.volatileStatuses.set(CORE_VOLATILE_IDS.flinch, { turnsLeft: 1 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — Blastoise should be flinched
      expect(events).toContainEqual({
        type: "message",
        text: "Blastoise flinched and couldn't move!",
      });

      // Blastoise shouldn't have a move-start
      const blastoiseMoves = events.filter(
        (e) => e.type === "move-start" && "pokemon" in e && e.pokemon === "Blastoise",
      );
      expect(blastoiseMoves).toHaveLength(0);
    });
  });

  describe(`volatile ${CORE_VOLATILE_IDS.confusion}`, () => {
    it("given a confused pokemon, when it tries to move, then confusion message is emitted", () => {
      // Arrange
      const { engine, events } = createEngine({ seed: 100 });
      engine.start();

      // Give Blastoise confusion
      const blastoise = engine.state.sides[1].active[0] as ActivePokemon;
      blastoise.volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 });

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Blastoise is confused!",
      });
    });

    it("given a ruleset with zero confusion self-hit chance, when a confused pokemon moves, then it does not self-hit even if rollConfusionSelfHit returns true", () => {
      class ZeroChanceConfusionRuleset extends MockRuleset {
        override getConfusionSelfHitChance(): number {
          return 0;
        }

        override rollConfusionSelfHit(_rng: SeededRandom): boolean {
          return true;
        }
      }

      const { engine, events } = createEngine({ ruleset: new ZeroChanceConfusionRuleset() });
      engine.start();

      const blastoise = engine.state.sides[1].active[0] as ActivePokemon;
      blastoise.volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 });
      const initialHp = engine.state.sides[0].active[0]?.pokemon.currentHp;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const confusionDamage = events.find(
        (e) => e.type === "damage" && "source" in e && e.source === CORE_VOLATILE_IDS.confusion,
      );
      expect(confusionDamage).toBeUndefined();

      const side1MoveStart = events.find(
        (e) => e.type === "move-start" && "side" in e && e.side === 1,
      );
      expect(side1MoveStart).toEqual({
        type: "move-start",
        side: 1,
        pokemon: "Blastoise",
        move: CORE_MOVE_IDS.tackle,
      });

      expect(engine.state.sides[0].active[0]?.pokemon.currentHp).toBeLessThan(initialHp ?? 0);
    });
  });

  describe("paralysis full para", () => {
    it("given a paralyzed pokemon, when full paralysis triggers, then it cannot move", () => {
      // Arrange — use a seed that triggers the 25% paralysis check
      // We'll run multiple seeds until we find one that triggers full para
      let foundFullPara = false;

      for (let seed = 0; seed < 100; seed++) {
        const { engine, events } = createEngine({ seed });
        engine.start();

        engine.state.sides[1].active[0]!.pokemon.status = CORE_STATUS_IDS.paralysis;

        engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
        engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

        const paraMsg = events.find(
          (e) => e.type === "message" && "text" in e && e.text.includes("fully paralyzed"),
        );
        if (paraMsg) {
          foundFullPara = true;
          break;
        }
      }

      // Assert — at 25% chance, we should find full para within 100 seeds
      expect(foundFullPara).toBe(true);
    });
  });

  describe("getState", () => {
    it("given a started battle, when getState is called, then full state is accessible", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Act
      const state = engine.getState();

      // Assert
      expect(state.generation).toBe(1);
      expect(state.format).toBe("singles");
      expect(state.phase).toBe("action-select");
      expect(state.sides).toHaveLength(2);
      expect(state.turnNumber).toBe(0);
    });
  });

  describe("submitSwitch error handling", () => {
    it("given battle not in switch-prompt, when submitSwitch is called, then it throws", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Act & Assert
      expect(() => engine.submitSwitch(0, 1)).toThrow(
        "Cannot submit switch in phase action-select",
      );
    });

    it("given switch-prompt, when submitSwitch is called with an already-active team slot, then it throws", () => {
      const team2 = [
        createBattlePokemon(GEN9_SPECIES_IDS.blastoise, "blastoise-1", "Blastoise", 80, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          currentHp: 1,
        }),
        createBattlePokemon(GEN9_SPECIES_IDS.pikachu, "pikachu-2", "Pikachu2", 130, {
          uid: "pikachu-2",
          nickname: "Pikachu2",
          currentHp: 120,
        }),
      ];
      const { engine } = createEngine({ team2 });
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      expect(engine.getPhase()).toBe("switch-prompt");
      expect(() => engine.submitSwitch(1, 0)).toThrow("Team slot 0 is already active");
    });
  });

  describe("action on ended battle", () => {
    it("given a battle that has ended, when submitAction is called, then it throws", () => {
      // Arrange
      const team2 = [
        createBattlePokemon(GEN9_SPECIES_IDS.blastoise, "blastoise-1", "Blastoise", 80, {
          uid: "blastoise-1",
          nickname: "Blastoise",
          currentHp: 1,
        }),
      ];
      const { engine } = createEngine({ team2 });
      engine.start();
      engine.state.sides[1].active[0]!.pokemon.currentHp = 1;

      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Battle should be ended now
      expect(engine.isEnded()).toBe(true);

      // Act & Assert
      expect(() => engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 })).toThrow();
    });
  });

  describe("recharge action", () => {
    it("given a recharge action, when turn resolves, then recharge message is emitted", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: CORE_VOLATILE_IDS.recharge, side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Charizard must recharge!",
      });
    });
  });

  describe("run action", () => {
    it("given a run action in a trainer battle, when turn resolves, then the trainer-battle failure message is emitted", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "run", side: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Can't run from a trainer battle!",
      });
    });
  });

  describe("item action", () => {
    it("given an item action, when turn resolves, then item usage message is emitted", () => {
      // Arrange
      const { engine, events } = createEngine();
      engine.start();

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: "potion" });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — the engine emits "Side 0 used potion!" followed by ruleset result messages
      const itemMsg = events.find(
        (e) => e.type === "message" && "text" in e && e.text.includes("potion"),
      );
      expect(itemMsg).toEqual({ type: "message", text: "Side 0 used potion!" });
    });
  });

  describe("permanent weather", () => {
    it("given weather with -1 turnsLeft (permanent), when end of turn processes, then weather persists", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const originalOrder = ruleset.getEndOfTurnOrder();
      const patchedRuleset = Object.create(ruleset) as MockRuleset;
      patchedRuleset.getEndOfTurnOrder = () => [
        CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
        ...originalOrder,
      ];

      const { engine } = createEngine({ ruleset: patchedRuleset });
      engine.start();

      engine.state.weather = {
        type: CORE_WEATHER_IDS.rain,
        turnsLeft: -1,
        source: CORE_ABILITY_IDS.drizzle,
      };

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — permanent weather should still be there
      expect(engine.state.weather).toEqual({
        type: CORE_WEATHER_IDS.rain,
        turnsLeft: -1,
        source: CORE_ABILITY_IDS.drizzle,
      });
    });
  });

  describe("move effect processing", () => {
    it("given a move that inflicts status, when the effect result has status, then status is applied", () => {
      // Arrange — patch the mock ruleset to return a status effect
      const ruleset = new MockRuleset();
      const _originalExecute = ruleset.executeMoveEffect.bind(ruleset);
      ruleset.executeMoveEffect = () => ({
        statusInflicted: CORE_STATUS_IDS.burn,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const statusInflict = events.find((e) => e.type === "status-inflict");
      expect(statusInflict).toEqual({
        type: "status-inflict",
        side: 1,
        pokemon: "Blastoise",
        status: CORE_STATUS_IDS.burn,
      });
      expect(engine.state.sides[1].active[0]?.pokemon.status).toBe(CORE_STATUS_IDS.burn);
    });

    it("given a move that inflicts a volatile, when effect result has volatile, then volatile is applied", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.executeMoveEffect = () => ({
        statusInflicted: null,
        volatileInflicted: CORE_VOLATILE_IDS.confusion,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: ["Target became confused!"],
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const volatileStart = events.find((e) => e.type === "volatile-start");
      expect(volatileStart).toEqual({
        type: "volatile-start",
        side: 1,
        pokemon: "Blastoise",
        volatile: CORE_VOLATILE_IDS.confusion,
      });
    });

    it("given a move that changes stats, when effect result has stat changes, then stats are modified", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.executeMoveEffect = () => ({
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [{ target: "defender" as const, stat: "attack" as const, stages: -1 }],
        recoilDamage: 0,
        healAmount: 0,
        switchOut: false,
        messages: [],
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const statChange = events.find((e) => e.type === "stat-change");
      expect(statChange).toEqual({
        type: "stat-change",
        side: 1,
        pokemon: "Blastoise",
        stat: "attack",
        stages: -1,
        currentStage: -1,
      });
    });

    it("given a move with recoil, when effect result has recoil damage, then attacker takes damage", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.executeMoveEffect = () => ({
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 10,
        healAmount: 0,
        switchOut: false,
        messages: [],
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const recoilDamage = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "recoil",
      );
      expect(
        recoilDamage.map((event) => ({
          type: event.type,
          side: event.side,
          pokemon: event.pokemon,
          amount: event.amount,
          source: event.source,
        })),
      ).toEqual([
        {
          type: "damage",
          side: 0,
          pokemon: "Charizard",
          amount: 10,
          source: "recoil",
        },
        {
          type: "damage",
          side: 1,
          pokemon: "Blastoise",
          amount: 10,
          source: "recoil",
        },
      ]);
    });

    it("given a move with healing, when effect result has heal amount, then attacker heals", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.executeMoveEffect = () => ({
        statusInflicted: null,
        volatileInflicted: null,
        statChanges: [],
        recoilDamage: 0,
        healAmount: 50,
        switchOut: false,
        messages: [],
      });

      const { engine, events } = createEngine({ ruleset });
      engine.start();

      // Lower Charizard's HP to 150
      engine.state.sides[0].active[0]!.pokemon.currentHp = 150;

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const healEvents = events.filter((e) => e.type === "heal");
      expect(
        healEvents.map((event) => ({
          side: event.side,
          pokemon: event.pokemon,
          amount: event.amount,
          source: event.source,
        })),
      ).toEqual([
        { side: 0, pokemon: "Charizard", amount: 3, source: "move-effect" },
        { side: 1, pokemon: "Blastoise", amount: 10, source: "move-effect" },
      ]);
    });
  });

  describe("turnsOnField increment", () => {
    it("given active pokemon, when a turn completes, then turnsOnField increments", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      expect(engine.state.sides[0].active[0]?.turnsOnField).toBe(0);

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(engine.state.sides[0].active[0]?.turnsOnField).toBe(1);
      expect(engine.state.sides[1].active[0]?.turnsOnField).toBe(1);
    });
  });

  describe("movedThisTurn reset", () => {
    it("given a completed turn, when next turn starts, then movedThisTurn is reset", () => {
      // Arrange
      const { engine } = createEngine();
      engine.start();

      // Act — play turn 1
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — after turn completes, movedThisTurn should be reset for next turn
      expect(engine.state.sides[0].active[0]?.movedThisTurn).toBe(false);
      expect(engine.state.sides[1].active[0]?.movedThisTurn).toBe(false);
    });
  });

  describe("unknown move handling", () => {
    it("given a pokemon using an unknown move, when the move is executed, then move-fail event is emitted", () => {
      // Arrange
      const team1 = [
        createBattlePokemon(GEN9_SPECIES_IDS.charizard, "charizard-1", "Charizard", 120, {
          moves: [
            {
              moveId: "nonexistent-move",
              currentPP: 35,
              maxPP: 35,
              ppUps: 0,
            },
          ],
          currentHp: 200,
        }),
      ];

      const { engine, events } = createEngine({ team1 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const failEvent = events.find(
        (e) => e.type === "move-fail" && "reason" in e && e.reason === "unknown move",
      );
      expect(failEvent).toEqual({
        type: "move-fail",
        side: 0,
        pokemon: "Charizard",
        move: "nonexistent-move",
        reason: "unknown move",
      });
    });
  });
});
