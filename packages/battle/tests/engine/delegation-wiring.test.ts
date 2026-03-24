import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import type { BattleConfig, EndOfTurnEffect } from "../../src/context";
import { BattleEngine } from "../../src/engine";
import type { BattleEvent } from "../../src/events";
import { createTestPokemon } from "../../src/utils";
import { createMockDataManager } from "../helpers/mock-data-manager";
import { MockRuleset } from "../helpers/mock-ruleset";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fixed drain/damage amount returned by all three custom ruleset methods below. */
const FIXED_AMOUNT = 42;

/** MockRuleset subclass that returns FIXED_AMOUNT for all three delegation targets. */
class DelegatingMockRuleset extends MockRuleset {
  override calculateLeechSeedDrain(): number {
    return FIXED_AMOUNT;
  }
  override calculateCurseDamage(): number {
    return FIXED_AMOUNT;
  }
  override calculateNightmareDamage(): number {
    return FIXED_AMOUNT;
  }
}

function createEngine(opts: {
  eotOrder: readonly EndOfTurnEffect[];
  team1?: PokemonInstance[];
  team2?: PokemonInstance[];
}) {
  const ruleset = new DelegatingMockRuleset();
  ruleset.getEndOfTurnOrder = (): readonly EndOfTurnEffect[] => opts.eotOrder;

  const dataManager = createMockDataManager();
  const events: BattleEvent[] = [];

  const team1 = opts.team1 ?? [
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
        speed: 80,
      },
      currentHp: 200,
    }),
  ];

  const team2 = opts.team2 ?? [
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
        speed: 120,
      },
      currentHp: 200,
    }),
  ];

  const config: BattleConfig = {
    generation: 2,
    format: "singles",
    teams: [team1, team2],
    seed: 12345,
  };

  ruleset.setGenerationForTest(config.generation);
  const engine = new BattleEngine(config, ruleset, dataManager);
  engine.on((e) => events.push(e));

  return { engine, events };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("delegation wiring — leech seed / curse / nightmare formulas", () => {
  describe("processLeechSeed", () => {
    it("given a ruleset whose calculateLeechSeedDrain returns 42, when a pokemon with leech-seed volatile ends its turn, then the damage event amount equals 42", () => {
      // Arrange
      const { engine, events } = createEngine({ eotOrder: ["leech-seed"] });
      engine.start();

      const blastoise = engine.getActive(1);
      blastoise?.volatileStatuses.set("leech-seed", { turnsLeft: 99 });

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const drainEvents = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "leech-seed",
      );
      expect(drainEvents.length).toBeGreaterThan(0);

      const drainEvent = drainEvents[0];
      if (drainEvent && drainEvent.type === "damage") {
        expect(drainEvent.amount).toBe(FIXED_AMOUNT);
      }
    });
  });

  describe("processCurse", () => {
    it("given a ruleset whose calculateCurseDamage returns 42, when a pokemon with curse volatile ends its turn, then the damage event amount equals 42", () => {
      // Arrange
      const { engine, events } = createEngine({ eotOrder: ["curse"] });
      engine.start();

      const blastoise = engine.getActive(1);
      blastoise?.volatileStatuses.set("curse", { turnsLeft: 99 });

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const curseEvents = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "curse",
      );
      expect(curseEvents.length).toBeGreaterThan(0);

      const curseEvent = curseEvents[0];
      if (curseEvent && curseEvent.type === "damage") {
        expect(curseEvent.amount).toBe(FIXED_AMOUNT);
      }
    });
  });

  describe("processNightmare", () => {
    it("given a ruleset whose calculateNightmareDamage returns 42, when a sleeping pokemon with nightmare volatile ends its turn, then the damage event amount equals 42", () => {
      // Arrange
      const { engine, events } = createEngine({ eotOrder: ["nightmare"] });
      engine.start();

      const blastoise = engine.getActive(1);
      if (blastoise) {
        blastoise.pokemon.status = "sleep";
        // sleep-counter keeps processSleepTurn from immediately waking the pokemon
        blastoise.volatileStatuses.set("sleep-counter", { turnsLeft: 5 });
        blastoise.volatileStatuses.set("nightmare", { turnsLeft: 99 });
      }

      // Act
      events.length = 0;
      engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
      engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

      // Assert
      const nightmareEvents = events.filter(
        (e) => e.type === "damage" && "source" in e && e.source === "nightmare",
      );
      expect(nightmareEvents.length).toBeGreaterThan(0);

      const nightmareEvent = nightmareEvents[0];
      if (nightmareEvent && nightmareEvent.type === "damage") {
        expect(nightmareEvent.amount).toBe(FIXED_AMOUNT);
      }
    });
  });
});
