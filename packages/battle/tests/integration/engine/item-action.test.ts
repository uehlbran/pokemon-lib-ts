import type { PokemonInstance } from "@pokemon-lib-ts/core";
import {
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig } from "../../../src/context";
import { BattleEngine } from "../../../src/engine";
import type { BattleEvent, HealEvent, StatChangeEvent, StatusCureEvent } from "../../../src/events";
import { createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { MockRuleset } from "../../helpers/mock-ruleset";

const DEFAULT_MOVE = createMockDataManager().getMove(CORE_MOVE_IDS.tackle);

/**
 * Creates a test engine with configurable teams and ruleset.
 * Both teams have a single Pokemon by default.
 */
function createTestEngine(overrides?: {
  seed?: number;
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
  ruleset?: MockRuleset;
}): { engine: BattleEngine; ruleset: MockRuleset; events: BattleEvent[] } {
  const ruleset = overrides?.ruleset ?? new MockRuleset();
  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = overrides?.team1 ?? [
    createTestPokemon(6, 50, {
      uid: "charizard-1",
      nickname: "Charizard",
      moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
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
      moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
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
    generation: 1,
    format: "singles",
    teams: [team1, team2],
    seed: overrides?.seed ?? 12345,
  };

  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, ruleset, events };
}

describe("BattleEngine - ItemAction bag item usage", () => {
  describe("healing items", () => {
    it("given a Potion used on a damaged pokemon, when item action submitted, then pokemon heals 20 HP", () => {
      // Arrange
      const ruleset = new MockRuleset();
      // Source: Bulbapedia "Potion" — heals 20 HP in all generations
      ruleset.setNextBagItemResult({
        activated: true,
        healAmount: 20,
        messages: ["Charizard recovered 20 HP!"],
      });

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Damage the pokemon after engine init (engine recalculates stats on start,
      // overwriting any currentHp set in the constructor).
      // Charizard HP at level 50: floor(((2*78 + 31 + 0) * 50) / 100) + 50 + 10 = 153
      const active = engine.state.sides[0].active[0];
      const maxHp = active!.pokemon.calculatedStats!.hp; // 153
      active!.pokemon.currentHp = maxHp - 50; // 103 HP (50 HP missing)

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.potion });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const healEvent = events.find((e) => e.type === "heal") as HealEvent | undefined;
      // Source: Potion heals 20 HP. Starting HP was 103, so after heal = 123.
      expect(healEvent?.amount).toBe(20);
      expect(healEvent?.currentHp).toBe(123);
      expect(healEvent?.source).toBe(CORE_ITEM_IDS.potion);
    });

    it("given a Potion used on a full-HP pokemon, when item action submitted, then no heal event emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      // When Pokemon is at full HP, ruleset returns activated: false
      ruleset.setNextBagItemResult({
        activated: false,
        messages: ["Charizard's HP is already full!"],
      });

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.potion });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const healEvent = events.find((e) => e.type === "heal" && e.source === CORE_ITEM_IDS.potion);
      expect(healEvent).toBeUndefined();

      expect(events).toContainEqual({
        type: "message",
        text: "Charizard's HP is already full!",
      });
    });
  });

  describe("status cure items", () => {
    it("given an Antidote used on a poisoned pokemon, when item action submitted, then status-cure event emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      // Source: Bulbapedia "Antidote" — cures poison/badly-poisoned
      ruleset.setNextBagItemResult({
        activated: true,
        statusCured: CORE_STATUS_IDS.poison,
        messages: ["Charizard's poison was cured!"],
      });

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-1",
          nickname: "Charizard",
          moves: [createMoveSlot(CORE_MOVE_IDS.tackle, DEFAULT_MOVE.pp)],
          calculatedStats: {
            hp: 200,
            attack: 100,
            defense: 100,
            spAttack: 100,
            spDefense: 100,
            speed: 120,
          },
          currentHp: 200,
          status: CORE_STATUS_IDS.poison,
        }),
      ];

      const { engine, events } = createTestEngine({ ruleset, team1 });
      engine.start();

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.antidote });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const cureEvent = events.find((e) => e.type === "status-cure") as StatusCureEvent | undefined;
      expect(cureEvent?.status).toBe(CORE_STATUS_IDS.poison);

      // Verify the pokemon's status was actually cleared
      const active = engine.state.sides[0].active[0];
      expect(active!.pokemon.status).toBeNull();
    });

    it("given an Antidote used on a non-poisoned pokemon, when item action submitted, then no effect", () => {
      // Arrange
      const ruleset = new MockRuleset();
      // Ruleset returns no effect when status doesn't match
      ruleset.setNextBagItemResult({
        activated: false,
        messages: ["It won't have any effect."],
      });

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.antidote });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const cureEvent = events.find((e) => e.type === "status-cure");
      expect(cureEvent).toBeUndefined();

      expect(events).toContainEqual({
        type: "message",
        text: "It won't have any effect.",
      });
    });
  });

  describe("stat boost items", () => {
    it("given an X Attack used, when item action submitted, then stat-change event for attack emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      // Source: Bulbapedia "X Attack" — raises Attack by 2 stages (Gen 7+)
      ruleset.setNextBagItemResult({
        activated: true,
        statChange: { stat: "attack", stages: 2 },
        messages: ["Charizard's attack rose sharply!"],
      });

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.xAttack });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const statEvent = events.find((e) => e.type === "stat-change") as StatChangeEvent | undefined;
      expect(statEvent?.stat).toBe(CORE_STAT_IDS.attack);
      expect(statEvent?.stages).toBe(2);
      // Source: starting stage 0 + 2 = 2
      expect(statEvent?.currentStage).toBe(2);

      // Verify the stat stage was actually applied
      const active = engine.state.sides[0].active[0];
      expect(active!.statStages.attack).toBe(2);
    });
  });

  describe("revive items", () => {
    it("given a Revive used on a fainted pokemon, when item action submitted, then pokemon revived at half HP", () => {
      // Arrange
      const ruleset = new MockRuleset();

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "charizard-active",
          nickname: "ActiveMon",
          moves: [createMoveSlot(CORE_MOVE_IDS.tackle, DEFAULT_MOVE.pp)],
        }),
        createTestPokemon(25, 50, {
          uid: "pikachu-fainted",
          nickname: "FaintedMon",
          moves: [createMoveSlot(CORE_MOVE_IDS.tackle, DEFAULT_MOVE.pp)],
        }),
      ];

      const { engine, events } = createTestEngine({ ruleset, team1 });
      engine.start();

      // Faint the bench pokemon after engine init (engine recalculates stats on start).
      // Pikachu HP at level 50: floor(((2*35 + 31 + 0) * 50) / 100) + 50 + 10 = 110
      const faintedMon = engine.getState().sides[0].team[1];
      const faintedMaxHp = faintedMon.calculatedStats!.hp; // 110
      faintedMon.currentHp = 0; // faint it

      // Source: Bulbapedia "Revive" — revives at half max HP
      const halfHp = Math.floor(faintedMaxHp / 2); // 55
      ruleset.setNextBagItemResult({
        activated: true,
        revived: true,
        healAmount: halfHp,
        messages: ["FaintedMon was revived!"],
      });

      // Act — target team slot 1 (the fainted bench pokemon)
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.revive, target: 1 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const healEvent = events.find((e) => e.type === "heal") as HealEvent | undefined;
      // Source: Revive restores half max HP
      expect(healEvent?.amount).toBe(halfHp);
      expect(healEvent?.currentHp).toBe(halfHp);

      // Verify the fainted pokemon now has HP
      expect(faintedMon.currentHp).toBe(halfHp);
    });

    it("given a Max Revive used on a fainted pokemon, when item action submitted, then pokemon revived at full HP", () => {
      // Arrange
      const ruleset = new MockRuleset();

      const team1 = [
        createTestPokemon(6, 50, {
          uid: "active-mon",
          nickname: "ActiveMon",
          moves: [createMoveSlot(CORE_MOVE_IDS.tackle, DEFAULT_MOVE.pp)],
        }),
        createTestPokemon(25, 50, {
          uid: "fainted-mon",
          nickname: "FaintedMon",
          moves: [createMoveSlot(CORE_MOVE_IDS.tackle, DEFAULT_MOVE.pp)],
        }),
      ];

      const { engine, events } = createTestEngine({ ruleset, team1 });
      engine.start();

      // Faint the bench pokemon after engine init (engine recalculates stats on start).
      // Pikachu HP at level 50: floor(((2*35 + 31 + 0) * 50) / 100) + 50 + 10 = 110
      const faintedMon = engine.getState().sides[0].team[1];
      const faintedMaxHp = faintedMon.calculatedStats!.hp; // 110
      faintedMon.currentHp = 0; // faint it

      // Source: Bulbapedia "Max Revive" — revives at full HP
      ruleset.setNextBagItemResult({
        activated: true,
        revived: true,
        healAmount: faintedMaxHp,
        messages: ["FaintedMon was revived!"],
      });

      // Act — target team slot 1 (the fainted bench pokemon)
      engine.submitAction(0, {
        type: "item",
        side: 0,
        itemId: CORE_ITEM_IDS.maxRevive,
        target: 1,
      });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const healEvent = events.find((e) => e.type === "heal") as HealEvent | undefined;
      // Source: Max Revive restores full HP
      expect(healEvent?.amount).toBe(faintedMaxHp);
      expect(healEvent?.currentHp).toBe(faintedMaxHp);

      // Verify the fainted pokemon now has full HP
      expect(faintedMon.currentHp).toBe(faintedMaxHp);
    });
  });

  describe("priority ordering", () => {
    it("given item action submitted before move action, when both sides submit, then item executes first", () => {
      // Arrange
      // Source: Bulbapedia "Priority" — item usage has higher priority than moves.
      // This test expects item actions to resolve before moves.
      const ruleset = new MockRuleset();
      ruleset.setNextBagItemResult({
        activated: true,
        healAmount: 20,
        messages: ["Charizard recovered 20 HP!"],
      });

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Damage the pokemon after engine init so the heal has something to restore
      const active = engine.state.sides[0].active[0];
      active!.pokemon.currentHp = active!.pokemon.calculatedStats!.hp - 50;

      // Act — side 0 uses item, side 1 uses move
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.potion });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — heal event (from item) should appear before damage event (from move)
      const healIndex = events.findIndex(
        (e) => e.type === "heal" && e.source === CORE_ITEM_IDS.potion,
      );
      const moveStartIndex = events.findIndex((e) => e.type === "move-start");
      expect(healIndex).toBeGreaterThan(-1);
      expect(moveStartIndex).toBeGreaterThan(-1);
      // Item usage should resolve before the move
      expect(healIndex).toBeLessThan(moveStartIndex);
    });
  });

  describe("canUseBagItems restriction", () => {
    it("given canUseBagItems returns false, when item action submitted, then blocked message emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      ruleset.setBagItemsAllowed(false);

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.potion });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      expect(events).toContainEqual({
        type: "message",
        text: "Items cannot be used here!",
      });

      // No heal event should be emitted
      const healEvent = events.find((e) => e.type === "heal");
      expect(healEvent).toBeUndefined();
    });
  });

  describe("unknown item ids", () => {
    it("given an item action with an unknown item id, when it is submitted, then the engine emits a warning and still falls back to bag-item handling", () => {
      const ruleset = new MockRuleset();

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      engine.submitAction(0, { type: "item", side: 0, itemId: "mystery-item" });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      const warning = events.find((event) => event.type === "engine-warning");
      expect(warning).toMatchObject({
        type: "engine-warning",
        message:
          'Item "mystery-item" not found in data manager; falling back to bag-item handling.',
      });

      const usageMessage = events.find(
        (event) =>
          event.type === "message" && "text" in event && event.text === "Side 0 used mystery-item!",
      );
      expect(usageMessage).toMatchObject({
        type: "message",
        text: "Side 0 used mystery-item!",
      });

      const noEffectMessage = events.find(
        (event) =>
          event.type === "message" && "text" in event && event.text === "It had no effect.",
      );
      expect(noEffectMessage).toMatchObject({
        type: "message",
        text: "It had no effect.",
      });
    });
  });

  describe("Full Restore", () => {
    it("given a Full Restore used on a damaged and poisoned pokemon, when item action submitted, then both heal and status cure events emitted", () => {
      // Arrange
      const ruleset = new MockRuleset();
      const configuredDamage = 10;
      // configuredDamage controls the expected post-move HP in this test.
      ruleset.setFixedDamage(configuredDamage);
      // Source: Bulbapedia "Full Restore" — heals all HP and cures all status conditions
      ruleset.setNextBagItemResult({
        activated: true,
        healAmount: 50,
        statusCured: CORE_STATUS_IDS.poison,
        messages: ["Charizard recovered 50 HP!", "Charizard's poison was cured!"],
      });

      const { engine, events } = createTestEngine({ ruleset });
      engine.start();

      // Damage and poison the pokemon after engine init (engine recalculates stats
      // on start, overwriting any currentHp/status set in the constructor).
      // Charizard HP at level 50: floor(((2*78 + 31 + 0) * 50) / 100) + 50 + 10 = 153
      const active = engine.state.sides[0].active[0];
      const maxHp = active!.pokemon.calculatedStats!.hp; // 153
      active!.pokemon.currentHp = maxHp - 50; // 103 HP (50 HP missing)
      active!.pokemon.status = CORE_STATUS_IDS.poison;

      // Act
      engine.submitAction(0, { type: "item", side: 0, itemId: CORE_ITEM_IDS.fullRestore });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert — both heal and status cure should be present
      const healEvent = events.find((e) => e.type === "heal") as HealEvent | undefined;
      expect(healEvent?.amount).toBe(50);

      const cureEvent = events.find((e) => e.type === "status-cure") as StatusCureEvent | undefined;
      expect(cureEvent?.status).toBe(CORE_STATUS_IDS.poison);

      // Verify state was mutated — after heal, HP = 103 + 50 = 153 (= maxHp, capped).
      // Then the configured damage leaves the pokemon at maxHp - configuredDamage.
      const activeAfter = engine.state.sides[0].active[0];
      expect(activeAfter!.pokemon.currentHp).toBe(maxHp - configuredDamage);
      expect(activeAfter!.pokemon.status).toBeNull();
    });
  });
});
