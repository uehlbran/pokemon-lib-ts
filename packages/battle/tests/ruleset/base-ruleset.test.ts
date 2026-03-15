import type {
  Generation,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  AbilityContext,
  DamageContext,
  DamageResult,
  ItemContext,
  MoveEffectContext,
} from "../../src/context";
import { BaseRuleset } from "../../src/ruleset/BaseRuleset";
import type { ActivePokemon, BattleSide, BattleState } from "../../src/state";
import { createActivePokemon, createDefaultStatStages, createTestPokemon } from "../../src/utils";

// Concrete implementation of BaseRuleset for testing
class TestRuleset extends BaseRuleset {
  readonly generation: Generation = 3;
  readonly name = "Test Gen 3";

  getTypeChart(): TypeChart {
    const types = this.getValidTypes();
    const chart: Record<string, Record<string, number>> = {};
    for (const atk of types) {
      const row: Record<string, number> = {};
      chart[atk] = row;
      for (const def of types) {
        row[def] = 1;
      }
    }
    return chart as TypeChart;
  }

  getValidTypes(): readonly PokemonType[] {
    return [
      "normal",
      "fire",
      "water",
      "electric",
      "grass",
      "ice",
      "fighting",
      "poison",
      "ground",
      "flying",
      "psychic",
      "bug",
      "rock",
      "ghost",
      "dragon",
      "dark",
      "steel",
    ];
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

const testSpecies: PokemonSpeciesData = {
  id: 6,
  name: "charizard",
  displayName: "Charizard",
  types: ["fire", "flying"],
  baseStats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
  abilities: { normal: ["blaze"], hidden: "solar-power" },
  genderRatio: 87.5,
  catchRate: 45,
  baseExp: 240,
  expGroup: "medium-slow",
  evYield: { spAttack: 3 },
  eggGroups: ["monster", "dragon"],
  learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
  evolution: null,
  dimensions: { height: 1.7, weight: 90.5 },
  spriteKey: "charizard",
  baseFriendship: 70,
  generation: 1,
  isLegendary: false,
  isMythical: false,
};

describe("BaseRuleset", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  describe("calculateStats", () => {
    it("given a level 50 pokemon, when calculateStats is called, then correct HP is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);

      // Act
      const stats = ruleset.calculateStats(pokemon, testSpecies);

      // Assert
      // HP = floor(((2 * 78 + 31 + floor(0/4)) * 50) / 100) + 50 + 10 = floor(9350/100) + 60 = 93 + 60 = 153
      expect(stats.hp).toBe(153);
      expect(stats.attack).toBeGreaterThan(0);
      expect(stats.defense).toBeGreaterThan(0);
      expect(stats.spAttack).toBeGreaterThan(0);
      expect(stats.spDefense).toBeGreaterThan(0);
      expect(stats.speed).toBeGreaterThan(0);
    });

    it("given a level 100 pokemon, when calculateStats is called, then stats are higher", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 100);

      // Act
      const stats = ruleset.calculateStats(pokemon, testSpecies);

      // Assert
      expect(stats.hp).toBeGreaterThan(200);
      expect(stats.speed).toBeGreaterThan(100);
    });
  });

  describe("getCritRateTable", () => {
    it("given a Gen 3+ ruleset, when getCritRateTable is called, then Gen 6+ table is returned", () => {
      // Act
      const table = ruleset.getCritRateTable();

      // Assert
      expect(table).toEqual([24, 8, 2, 1]);
    });
  });

  describe("getCritMultiplier", () => {
    it("given a Gen 3+ ruleset, when getCritMultiplier is called, then 1.5 is returned", () => {
      // Act & Assert
      expect(ruleset.getCritMultiplier()).toBe(1.5);
    });
  });

  describe("rollCritical", () => {
    it("given a normal pokemon, when rollCritical is called, then crit probability is based on stage 0", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createActivePokemon(pokemon, 0, ["fire", "flying"]);
      const rng = new SeededRandom(42);
      const move = {
        id: "tackle",
        displayName: "Tackle",
        type: "normal" as const,
        category: "physical" as const,
        power: 40,
        accuracy: 100,
        pp: 35,
        priority: 0,
        target: "adjacent-foe" as const,
        flags: {
          contact: true,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: false,
          protect: true,
          mirror: true,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
        effect: null,
        description: "",
        generation: 1 as const,
      };

      // Act — run many times and check distribution
      let crits = 0;
      for (let i = 0; i < 1000; i++) {
        if (
          ruleset.rollCritical({ attacker: active, move, state: {} as unknown as BattleState, rng })
        ) {
          crits++;
        }
      }

      // Assert — ~1/24 chance ≈ 4.2%, should be in range
      expect(crits).toBeGreaterThan(10);
      expect(crits).toBeLessThan(100);
    });
  });

  describe("resolveTurnOrder", () => {
    it("given two move actions, when resolveTurnOrder is called, then faster pokemon goes first", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      });
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
      });
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Act
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert — side 0 (speed 120) goes first
      expect(ordered[0]?.side).toBe(0);
      expect(ordered[1]?.side).toBe(1);
    });

    it("given a switch and a move, when resolveTurnOrder is called, then switch goes first", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 50,
        },
      });
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      });
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions = [
        { type: "switch" as const, side: 0 as const, switchTo: 1 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Act
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert — switch goes first even though side 0 is slower
      expect(ordered[0]?.type).toBe("switch");
    });

    it("given trick room active, when resolveTurnOrder is called, then slower pokemon goes first", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      });
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 80,
        },
      });
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: true, turnsLeft: 3 },
      } as unknown as BattleState;

      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Act
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);

      // Assert — side 1 (speed 80) goes first in Trick Room
      expect(ordered[0]?.side).toBe(1);
      expect(ordered[1]?.side).toBe(0);
    });
  });

  describe("doesMoveHit", () => {
    it("given a move with null accuracy, when doesMoveHit is called, then true is returned", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);
      const move = {
        id: "swift",
        displayName: "Swift",
        type: "normal" as const,
        category: "special" as const,
        power: 60,
        accuracy: null,
        pp: 20,
        priority: 0,
        target: "adjacent-foe" as const,
        flags: {
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: false,
          protect: true,
          mirror: true,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
        effect: null,
        description: "",
        generation: 1 as const,
      };

      // Act
      const hits = ruleset.doesMoveHit({
        attacker: active1,
        defender: active2,
        move,
        state: {} as unknown as BattleState,
        rng,
      });

      // Assert
      expect(hits).toBe(true);
    });

    it("given a 100 accuracy move with neutral stages, when doesMoveHit is called many times, then it always hits", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      const rng = new SeededRandom(42);
      const move = {
        id: "tackle",
        displayName: "Tackle",
        type: "normal" as const,
        category: "physical" as const,
        power: 40,
        accuracy: 100,
        pp: 35,
        priority: 0,
        target: "adjacent-foe" as const,
        flags: {
          contact: true,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: false,
          protect: true,
          mirror: true,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
        effect: null,
        description: "",
        generation: 1 as const,
      };

      // Act & Assert — 100% accuracy at neutral stages should always hit
      for (let i = 0; i < 100; i++) {
        expect(
          ruleset.doesMoveHit({
            attacker: active1,
            defender: active2,
            move,
            state: {} as unknown as BattleState,
            rng,
          }),
        ).toBe(true);
      }
    });

    it("given accuracy stages boosted, when doesMoveHit is called, then hit rate increases", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      active1.statStages.accuracy = 6;
      const rng = new SeededRandom(42);
      const move = {
        id: "focus-blast",
        displayName: "Focus Blast",
        type: "fighting" as const,
        category: "special" as const,
        power: 120,
        accuracy: 70,
        pp: 5,
        priority: 0,
        target: "adjacent-foe" as const,
        flags: {
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: false,
          protect: true,
          mirror: true,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
        effect: null,
        description: "",
        generation: 4 as const,
      };

      // Act
      let hits = 0;
      for (let i = 0; i < 100; i++) {
        if (
          ruleset.doesMoveHit({
            attacker: active1,
            defender: active2,
            move,
            state: {} as unknown as BattleState,
            rng,
          })
        ) {
          hits++;
        }
      }

      // Assert — at +6 accuracy, 70 * (9/3) = 210%, should always hit
      expect(hits).toBe(100);
    });

    it("given evasion stages boosted, when doesMoveHit is called, then hit rate decreases", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createActivePokemon(pokemon1, 0, ["fire"]);
      const active2 = createActivePokemon(pokemon2, 0, ["water"]);
      active2.statStages.evasion = 6;
      const rng = new SeededRandom(42);
      const move = {
        id: "tackle",
        displayName: "Tackle",
        type: "normal" as const,
        category: "physical" as const,
        power: 40,
        accuracy: 100,
        pp: 35,
        priority: 0,
        target: "adjacent-foe" as const,
        flags: {
          contact: true,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          powder: false,
          protect: true,
          mirror: true,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
        effect: null,
        description: "",
        generation: 1 as const,
      };

      // Act
      let hits = 0;
      for (let i = 0; i < 100; i++) {
        if (
          ruleset.doesMoveHit({
            attacker: active1,
            defender: active2,
            move,
            state: {} as unknown as BattleState,
            rng,
          })
        ) {
          hits++;
        }
      }

      // Assert — at +6 evasion, accuracy = floor(100 * 3/9) = 33, should miss about 2/3 of the time
      expect(hits).toBeGreaterThan(10);
      expect(hits).toBeLessThan(60);
    });
  });

  describe("executeMoveEffect", () => {
    it("given any context, when executeMoveEffect is called, then empty result is returned", () => {
      // Act
      const result = ruleset.executeMoveEffect({} as unknown as MoveEffectContext);

      // Assert
      expect(result.statusInflicted).toBeNull();
      expect(result.volatileInflicted).toBeNull();
      expect(result.statChanges).toEqual([]);
      expect(result.recoilDamage).toBe(0);
      expect(result.healAmount).toBe(0);
      expect(result.switchOut).toBe(false);
      expect(result.messages).toEqual([]);
    });
  });

  describe("applyStatusDamage", () => {
    it("given a burned pokemon, when applyStatusDamage is called, then 1/16 max HP damage is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const damage = ruleset.applyStatusDamage(active, "burn", {} as unknown as BattleState);

      // Assert
      expect(damage).toBe(12); // floor(200/16) = 12
    });

    it("given a poisoned pokemon, when applyStatusDamage is called, then 1/8 max HP damage is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const damage = ruleset.applyStatusDamage(active, "poison", {} as unknown as BattleState);

      // Assert
      expect(damage).toBe(25); // floor(200/8) = 25
    });

    it("given a sleeping pokemon, when applyStatusDamage is called, then 0 damage is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createActivePokemon(pokemon, 0, ["fire"]);

      // Act
      const damage = ruleset.applyStatusDamage(active, "sleep", {} as unknown as BattleState);

      // Assert
      expect(damage).toBe(0);
    });
  });

  describe("checkFreezeThaw", () => {
    it("given a frozen pokemon, when checkFreezeThaw is called many times, then thaw rate is ~20%", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      const rng = new SeededRandom(42);

      // Act
      let thaws = 0;
      for (let i = 0; i < 1000; i++) {
        if (ruleset.checkFreezeThaw(active, rng)) thaws++;
      }

      // Assert — ~20% thaw rate
      expect(thaws).toBeGreaterThan(150);
      expect(thaws).toBeLessThan(250);
    });
  });

  describe("rollSleepTurns", () => {
    it("given a seeded RNG, when rollSleepTurns is called many times, then values are 1-3", () => {
      // Arrange
      const rng = new SeededRandom(42);

      // Act
      const values = new Set<number>();
      for (let i = 0; i < 100; i++) {
        values.add(ruleset.rollSleepTurns(rng));
      }

      // Assert
      expect(values.has(1)).toBe(true);
      expect(values.has(2)).toBe(true);
      expect(values.has(3)).toBe(true);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("checkFullParalysis", () => {
    it("given a paralyzed pokemon and a deterministic-true RNG, when called, then returns true (fully paralyzed)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: "paralysis" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      // Mock RNG: next() always returns 0 → chance(0.25) → 0 < 0.25 → true
      const rng = { next: () => 0, int: () => 0, chance: () => true } as unknown as SeededRandom;

      // Act
      const result = ruleset.checkFullParalysis(active, rng);

      // Assert
      expect(result).toBe(true);
    });

    it("given a paralyzed pokemon and a deterministic-false RNG, when called, then returns false (can move)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: "paralysis" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      // Mock RNG: next() always returns 0.9999 → chance(0.25) → 0.9999 < 0.25 → false
      const rng = {
        next: () => 0.9999,
        int: () => 255,
        chance: () => false,
      } as unknown as SeededRandom;

      // Act
      const result = ruleset.checkFullParalysis(active, rng);

      // Assert
      expect(result).toBe(false);
    });

    it("given a seeded RNG, when checkFullParalysis is called many times, then paralysis rate is ~25%", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: "paralysis" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      const rng = new SeededRandom(42);

      // Act
      let paralyzed = 0;
      for (let i = 0; i < 1000; i++) {
        if (ruleset.checkFullParalysis(active, rng)) paralyzed++;
      }

      // Assert — ~25% rate
      expect(paralyzed).toBeGreaterThan(200);
      expect(paralyzed).toBeLessThan(310);
    });
  });

  describe("rollConfusionSelfHit", () => {
    it("given a deterministic-true RNG, when called, then returns true (self-hit)", () => {
      // Arrange
      const rng = { next: () => 0, int: () => 0, chance: () => true } as unknown as SeededRandom;

      // Act
      const result = ruleset.rollConfusionSelfHit(rng);

      // Assert
      expect(result).toBe(true);
    });

    it("given a deterministic-false RNG, when called, then returns false (no self-hit)", () => {
      // Arrange
      const rng = {
        next: () => 0.9999,
        int: () => 255,
        chance: () => false,
      } as unknown as SeededRandom;

      // Act
      const result = ruleset.rollConfusionSelfHit(rng);

      // Assert
      expect(result).toBe(false);
    });

    it("given a seeded RNG, when rollConfusionSelfHit is called many times, then self-hit rate is ~50%", () => {
      // Arrange
      const rng = new SeededRandom(42);

      // Act
      let selfHits = 0;
      for (let i = 0; i < 1000; i++) {
        if (ruleset.rollConfusionSelfHit(rng)) selfHits++;
      }

      // Assert — ~50% rate
      expect(selfHits).toBeGreaterThan(400);
      expect(selfHits).toBeLessThan(600);
    });
  });

  describe("processSleepTurn", () => {
    it("given a pokemon with turnsLeft > 1, when called, then decrements counter and returns false (still sleeping)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: "sleep" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      active.volatileStatuses.set("sleep-counter", { turnsLeft: 3 });

      // Act
      const canAct = ruleset.processSleepTurn(active, {} as unknown as BattleState);

      // Assert
      expect(canAct).toBe(false);
      expect(active.volatileStatuses.get("sleep-counter")?.turnsLeft).toBe(2);
      expect(active.pokemon.status).toBe("sleep");
    });

    it("given a pokemon with turnsLeft = 1, when called, then wakes up, clears status, and returns true (can act)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: "sleep" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      active.volatileStatuses.set("sleep-counter", { turnsLeft: 1 });

      // Act
      const canAct = ruleset.processSleepTurn(active, {} as unknown as BattleState);

      // Assert
      expect(canAct).toBe(true);
      expect(active.pokemon.status).toBeNull();
      expect(active.volatileStatuses.has("sleep-counter")).toBe(false);
    });

    it("given a pokemon with turnsLeft = 0, when called, then wakes up, clears status, and returns true (can act)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: "sleep" });
      const active = createActivePokemon(pokemon, 0, ["fire"]);
      active.volatileStatuses.set("sleep-counter", { turnsLeft: 0 });

      // Act
      const canAct = ruleset.processSleepTurn(active, {} as unknown as BattleState);

      // Assert
      expect(canAct).toBe(true);
      expect(active.pokemon.status).toBeNull();
      expect(active.volatileStatuses.has("sleep-counter")).toBe(false);
    });
  });

  describe("feature flags", () => {
    it("given a Gen 3+ ruleset, when hasAbilities is called, then true is returned", () => {
      expect(ruleset.hasAbilities()).toBe(true);
    });

    it("given a Gen 3+ ruleset, when hasHeldItems is called, then true is returned", () => {
      expect(ruleset.hasHeldItems()).toBe(true);
    });

    it("given a Gen 3+ ruleset, when hasWeather is called, then true is returned", () => {
      expect(ruleset.hasWeather()).toBe(true);
    });

    it("given a Gen 3+ base ruleset, when hasTerrain is called, then false is returned", () => {
      expect(ruleset.hasTerrain()).toBe(false);
    });
  });

  describe("applyAbility", () => {
    it("given any trigger, when applyAbility is called, then no-op result is returned", () => {
      const result = ruleset.applyAbility("on-switch-in", {} as unknown as AbilityContext);
      expect(result.activated).toBe(false);
    });
  });

  describe("applyHeldItem", () => {
    it("given any trigger, when applyHeldItem is called, then no-op result is returned", () => {
      const result = ruleset.applyHeldItem("on-after-attack", {} as unknown as ItemContext);
      expect(result.activated).toBe(false);
    });
  });

  describe("applyWeatherEffects", () => {
    it("given any state, when applyWeatherEffects is called, then empty array is returned", () => {
      expect(ruleset.applyWeatherEffects({} as unknown as BattleState)).toEqual([]);
    });
  });

  describe("applyTerrainEffects", () => {
    it("given any state, when applyTerrainEffects is called, then empty array is returned", () => {
      expect(ruleset.applyTerrainEffects({} as unknown as BattleState)).toEqual([]);
    });
  });

  describe("getAvailableHazards", () => {
    it("given a Gen 3+ ruleset, when getAvailableHazards is called, then base hazards are returned", () => {
      const hazards = ruleset.getAvailableHazards();
      expect(hazards).toContain("stealth-rock");
      expect(hazards).toContain("spikes");
      expect(hazards).toContain("toxic-spikes");
    });
  });

  describe("applyEntryHazards", () => {
    it("given any context, when applyEntryHazards is called, then no-op result is returned", () => {
      const result = ruleset.applyEntryHazards(
        {} as unknown as ActivePokemon,
        {} as unknown as BattleSide,
      );
      expect(result.damage).toBe(0);
    });
  });

  describe("calculateExpGain", () => {
    it("given a defeated pokemon, when calculateExpGain is called, then EXP is calculated", () => {
      const exp = ruleset.calculateExpGain({
        defeatedSpecies: testSpecies,
        defeatedLevel: 50,
        participantLevel: 50,
        isTrainerBattle: true,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
      });

      // floor((1.5 * 240 * 50) / (5 * 1) * 1) = floor(18000/5) = 3600
      expect(exp).toBe(3600);
    });

    it("given a wild battle, when calculateExpGain is called, then EXP uses 1x multiplier", () => {
      const exp = ruleset.calculateExpGain({
        defeatedSpecies: testSpecies,
        defeatedLevel: 50,
        participantLevel: 50,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: false,
        hasExpShare: false,
        affectionBonus: false,
      });

      // floor((1 * 240 * 50) / (5 * 1) * 1) = floor(12000/5) = 2400
      expect(exp).toBe(2400);
    });

    it("given a lucky egg, when calculateExpGain is called, then EXP is 1.5x", () => {
      const exp = ruleset.calculateExpGain({
        defeatedSpecies: testSpecies,
        defeatedLevel: 50,
        participantLevel: 50,
        isTrainerBattle: false,
        participantCount: 1,
        hasLuckyEgg: true,
        hasExpShare: false,
        affectionBonus: false,
      });

      // floor((1 * 240 * 50) / (5 * 1) * 1.5) = floor(3600) = 3600
      expect(exp).toBe(3600);
    });
  });

  describe("getBattleGimmick", () => {
    it("given a base ruleset, when getBattleGimmick is called, then null is returned", () => {
      expect(ruleset.getBattleGimmick()).toBeNull();
    });
  });

  describe("validatePokemon", () => {
    it("given any pokemon, when validatePokemon is called, then valid result is returned", () => {
      const result = ruleset.validatePokemon(
        {} as unknown as PokemonInstance,
        {} as unknown as PokemonSpeciesData,
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("getEndOfTurnOrder", () => {
    it("given a base ruleset, when getEndOfTurnOrder is called, then default order is returned", () => {
      const order = ruleset.getEndOfTurnOrder();
      expect(order.length).toBeGreaterThan(0);
      expect(order).toContain("weather-damage");
      expect(order).toContain("status-damage");
    });
  });
});
