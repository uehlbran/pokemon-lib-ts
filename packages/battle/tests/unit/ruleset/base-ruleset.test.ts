import type {
  Generation,
  MoveData,
  PokemonSpeciesData,
  PokemonType,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import { BATTLE_GIMMICK_IDS } from "../../../src";
import type {
  AbilityContext,
  DamageContext,
  DamageResult,
  ItemContext,
  MoveEffectContext,
} from "../../../src/context";
import { BaseRuleset } from "../../../src/ruleset/BaseRuleset";
import type { ActivePokemon, BattleSide, BattleState } from "../../../src/state";
import { createOnFieldPokemon, createTestPokemon } from "../../../src/utils";
import { createMockDataManager } from "../../helpers/mock-data-manager";
import { createMockMoveSlot } from "../../helpers/move-slot";

const {
  bug,
  dark,
  dragon,
  electric,
  fighting,
  fire,
  flying,
  ghost,
  grass,
  ground,
  ice,
  normal,
  poison: poisonType,
  psychic,
  rock,
  steel,
  water,
} = CORE_TYPE_IDS;
const { skillLink } = CORE_ABILITY_IDS;
const {
  encoreCountdown,
  futureAttack,
  screenCountdown,
  statusDamage,
  tailwindCountdown,
  terrainCountdown,
  trickRoomCountdown,
  weatherCountdown,
  weatherDamage,
} = CORE_END_OF_TURN_EFFECT_IDS;
const { spikes, stealthRock, toxicSpikes } = CORE_HAZARD_IDS;
const { blackSludge, leftovers } = CORE_ITEM_IDS;
const { bind, leechSeed, perishSong, quickAttack, scratch, tackle, wish } = CORE_MOVE_IDS;
const { badlyPoisoned, burn, paralysis, poison, sleep } = CORE_STATUS_IDS;
const { curse, ingrain, nightmare, sleepCounter, toxicCounter } = CORE_VOLATILE_IDS;
const TEST_DATA_MANAGER = createMockDataManager();

function createCanonicalMove(moveId: string): MoveData {
  const baseMove = TEST_DATA_MANAGER.getMove(moveId);
  return {
    ...baseMove,
    flags: { ...baseMove.flags },
  } as MoveData;
}

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData> = {}): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
  } as MoveData;
}

// Concrete implementation of BaseRuleset for testing
class TestRuleset extends BaseRuleset {
  readonly generation: Generation = 3;
  readonly name = "Test Gen 3";

  constructor() {
    super(TEST_DATA_MANAGER);
  }

  getTypeChart(): TypeChart {
    const types = this.getAvailableTypes();
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

  getAvailableTypes(): readonly PokemonType[] {
    return [
      normal,
      fire,
      water,
      electric,
      grass,
      ice,
      fighting,
      poisonType,
      ground,
      flying,
      psychic,
      bug,
      rock,
      ghost,
      dragon,
      dark,
      steel,
    ];
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

const testSpecies: PokemonSpeciesData = TEST_DATA_MANAGER.getSpecies(6);

const HARDY_FALLBACK_CHARIZARD_STATS = {
  attack: 104,
  spAttack: 129,
} as const;

const BASE_RULESET_CRIT_MULTIPLIER = 1.5;
const SKILL_LINK_HIT_COUNT = 5;
const DEFAULT_END_OF_TURN_ORDER = [
  futureAttack,
  wish,
  weatherDamage,
  leftovers,
  blackSludge,
  ingrain,
  leechSeed,
  statusDamage,
  nightmare,
  curse,
  bind,
  perishSong,
  screenCountdown,
  weatherCountdown,
  terrainCountdown,
  tailwindCountdown,
  trickRoomCountdown,
  encoreCountdown,
] as const;

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
      // Source: Gen 3+ stat formula — HP: floor(((2*base + iv + floor(ev/4)) * L) / 100) + L + 10
      // HP = floor(((2*78 + 31 + 0) * 50) / 100) + 50 + 10 = floor(9350/100) + 60 = 93 + 60 = 153
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — HP formula applied to L50 Charizard
      expect(stats.hp).toBe(153);
      // Source: Gen 3+ stat formula — non-HP stats, plus Adamant nature (+10% Attack, -10% SpAttack)
      // Uses Gen 3 Charizard: spAttack=109, spDefense=85 (Gen 3 split; Gen 1 had unified spc=85)
      // Attack = floor(((2*84 + 31 + 0) * 50) / 100) + 5 = 104; floor(104 * 1.1) = 114
      // Defense = floor(((2*78 + 31 + 0) * 50) / 100) + 5 = 98
      // SpAttack = floor(((2*109 + 31 + 0) * 50) / 100) + 5 = 129; floor(129 * 0.9) = 116
      // SpDefense = floor(((2*85 + 31 + 0) * 50) / 100) + 5 = 105 (neutral nature)
      // Speed = floor(((2*100 + 31 + 0) * 50) / 100) + 5 = 120
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — non-HP stats with Adamant nature at L50
      expect(stats.attack).toBe(114);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — Defense neutral L50
      expect(stats.defense).toBe(98);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — SpAtk with Adamant (-SpA, 0.9x) L50
      expect(stats.spAttack).toBe(116);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — SpDef neutral L50
      expect(stats.spDefense).toBe(105);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — Speed neutral L50
      expect(stats.speed).toBe(120);
    });

    it("given a level 100 pokemon, when calculateStats is called, then exact stats are returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 100);

      // Act
      const stats = ruleset.calculateStats(pokemon, testSpecies);

      // Assert
      // Source: Gen 3+ stat formula with level 100 and Adamant nature
      // SpAttack base=109: floor((218+31)*1+5) * 0.9 = floor(254*0.9) = floor(228.6) = 228
      // SpDefense base=85: floor((170+31)*1+5) * 1.0 = 206 (neutral nature; Gen 3 split)
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — all stats L100 Adamant Charizard
      expect(stats.hp).toBe(297);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — Attack with Adamant (+Atk, 1.1x) L100
      expect(stats.attack).toBe(224);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — Defense neutral L100
      expect(stats.defense).toBe(192);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — SpAtk with Adamant (-SpA, 0.9x) L100
      expect(stats.spAttack).toBe(228);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — SpDef neutral L100
      expect(stats.spDefense).toBe(206);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — Speed neutral L100
      expect(stats.speed).toBe(236);
    });

    it("given an unknown nature id, when calculateStats is called, then Hardy fallback behavior is used", () => {
      const pokemon = {
        ...createTestPokemon(6, 50),
        nature: "not-a-real-nature" as unknown as ReturnType<typeof createTestPokemon>["nature"],
      };

      const stats = ruleset.calculateStats(pokemon, testSpecies);

      // Source: invalid natures fall back to Hardy, so the neutral-nature Charizard
      // level-50 stats must match the Hardy calculation path used elsewhere in this suite.
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — invalid nature falls back to Hardy (neutral 1.0x)
      expect(stats.attack).toBe(HARDY_FALLBACK_CHARIZARD_STATS.attack);
      // Source: pret/pokeemerald src/pokemon.c:2851 CalculateMonStats — Hardy (neutral) nature leaves SpAttack unmodified
      expect(stats.spAttack).toBe(HARDY_FALLBACK_CHARIZARD_STATS.spAttack);
    });
  });

  describe("getCritRateTable", () => {
    it("given a Gen 3+ ruleset, when getCritRateTable is called, then Gen 6+ table is returned", () => {
      // Act
      const table = ruleset.getCritRateTable();

      // Assert
      // Source: Showdown Gen 6+ — crit rate table [1/24, 1/8, 1/2, 1/1] by stage
      expect(table).toEqual([24, 8, 2, 1]);
    });
  });

  describe("getCritMultiplier", () => {
    it("given a Gen 3+ ruleset, when getCritMultiplier is called, then 1.5 is returned", () => {
      // Act & Assert
      // Source: BaseRuleset defaults to the Gen 6+ critical-hit multiplier.
      expect(ruleset.getCritMultiplier()).toBe(BASE_RULESET_CRIT_MULTIPLIER);
    });
  });

  describe("rollCritical", () => {
    it("given a normal pokemon, when rollCritical is called, then crit probability is based on stage 0", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createOnFieldPokemon(pokemon, 0, [fire, flying]);
      const rng = new SeededRandom(42);
      const move = createCanonicalMove(tackle);

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
      // Source: Showdown Gen 6+ — stage 0 crit rate 1/24
      expect(crits).toBeGreaterThan(10);
      // Source: Showdown Gen 6+ — stage 0 crit rate ~4.2% over 1000 rolls, expected within 10–100
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
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
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
      // Source: Showdown Gen 3+ BaseRuleset — faster pokemon acts first at equal priority
      expect(ordered[0]?.side).toBe(0);
      // Source: Showdown Gen 3+ BaseRuleset — slower pokemon acts second at equal priority
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
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
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
      // Source: Showdown Gen 3+ BaseRuleset — switch actions precede move actions in turn order
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
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
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
      // Source: Showdown Gen 4+ — Trick Room reverses speed order; slower pokemon acts first
      expect(ordered[0]?.side).toBe(1);
      // Source: Showdown Gen 4+ — Trick Room reverses speed order; faster pokemon acts second
      expect(ordered[1]?.side).toBe(0);
    });
  });

  describe("doesMoveHit", () => {
    it("given a move with null accuracy, when doesMoveHit is called, then true is returned", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
      const rng = new SeededRandom(42);
      const move = createSyntheticMoveFrom(createCanonicalMove(tackle), { accuracy: null });

      // Act
      const hits = ruleset.doesMoveHit({
        attacker: active1,
        defender: active2,
        move,
        state: {} as unknown as BattleState,
        rng,
      });

      // Assert
      // Source: Showdown Gen 3+ — null accuracy moves always hit (Swift/etc.)
      expect(hits).toBe(true);
    });

    it("given a 100 accuracy move with neutral stages, when doesMoveHit is called many times, then it always hits", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
      const rng = new SeededRandom(42);
      const move = createSyntheticMoveFrom(createCanonicalMove(tackle), { accuracy: 100 });

      // Act & Assert — 100% accuracy at neutral stages should always hit
      for (let i = 0; i < 100; i++) {
        // Source: Showdown Gen 3+ — accuracy formula: floor(move.accuracy * accStage/evaStage); at neutral 100% always hits
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
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
      active1.statStages.accuracy = 6;
      const rng = new SeededRandom(42);
      const move = createSyntheticMoveFrom(createCanonicalMove(tackle), { accuracy: 70 });

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
      // Source: Showdown Gen 3+ — accuracy stage +6 multiplier is 9/3; 70*(9/3)=210% caps at always hit
      expect(hits).toBe(100);
    });

    it("given evasion stages boosted, when doesMoveHit is called, then hit rate decreases", () => {
      // Arrange
      const pokemon1 = createTestPokemon(6, 50);
      const pokemon2 = createTestPokemon(9, 50);
      const active1 = createOnFieldPokemon(pokemon1, 0, [fire]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
      active2.statStages.evasion = 6;
      const rng = new SeededRandom(42);
      const move = createCanonicalMove(tackle);

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
      // Source: Showdown Gen 3+ — evasion stage +6 multiplier is 3/9; 100*(3/9)≈33%
      expect(hits).toBeGreaterThan(10);
      // Source: Showdown Gen 3+ — at +6 evasion ~33% hit rate; expect fewer than 60 hits in 100 trials
      expect(hits).toBeLessThan(60);
    });
  });

  describe("executeMoveEffect", () => {
    it("given any context, when executeMoveEffect is called, then empty result is returned", () => {
      // Act
      const result = ruleset.executeMoveEffect({} as unknown as MoveEffectContext);

      // Assert
      // Source: Showdown Gen 3+ BaseRuleset — executeMoveEffect base implementation returns empty no-op result
      expect(result.statusInflicted).toBeNull();
      // Source: Showdown Gen 3+ BaseRuleset — no volatile status applied in base no-op
      expect(result.volatileInflicted).toBeNull();
      // Source: Showdown Gen 3+ BaseRuleset — no stat changes in base no-op
      expect(result.statChanges).toEqual([]);
      // Source: Showdown Gen 3+ BaseRuleset — no recoil in base no-op
      expect(result.recoilDamage).toBe(0);
      // Source: Showdown Gen 3+ BaseRuleset — no healing in base no-op
      expect(result.healAmount).toBe(0);
      // Source: Showdown Gen 3+ BaseRuleset — no forced switch in base no-op
      expect(result.switchOut).toBe(false);
      // Source: Showdown Gen 3+ BaseRuleset — no messages in base no-op
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
      const active = createOnFieldPokemon(pokemon, 0, [fire]);

      // Act
      const damage = ruleset.applyStatusDamage(active, burn, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — burn deals 1/16 max HP per turn
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
      const active = createOnFieldPokemon(pokemon, 0, [fire]);

      // Act
      const damage = ruleset.applyStatusDamage(active, poison, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — regular poison deals 1/8 max HP per turn
      expect(damage).toBe(25); // floor(200/8) = 25
    });

    it("given a sleeping pokemon, when applyStatusDamage is called, then 0 damage is returned", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createOnFieldPokemon(pokemon, 0, [fire]);

      // Act
      const damage = ruleset.applyStatusDamage(active, sleep, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — sleep does not deal residual damage
      expect(damage).toBe(0);
    });
  });

  describe("checkFreezeThaw", () => {
    it("given a frozen pokemon, when checkFreezeThaw is called many times, then thaw rate is ~20%", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50);
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      const rng = new SeededRandom(42);

      // Act
      let thaws = 0;
      for (let i = 0; i < 1000; i++) {
        if (ruleset.checkFreezeThaw(active, rng)) thaws++;
      }

      // Assert — ~20% thaw rate
      // Source: Showdown Gen 3+ — frozen pokemon has 20% chance to thaw per turn
      expect(thaws).toBeGreaterThan(150);
      // Source: Showdown Gen 3+ — 20% thaw rate over 1000 rolls; expect fewer than 250 thaws
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
      // Source: Showdown Gen 3+ — sleep lasts 1-3 turns (randomly selected on infliction)
      expect(values.has(1)).toBe(true);
      // Source: Showdown Gen 3+ — sleep duration range includes 2 turns
      expect(values.has(2)).toBe(true);
      // Source: Showdown Gen 3+ — sleep duration range includes 3 turns
      expect(values.has(3)).toBe(true);
      for (const v of values) {
        // Source: Showdown Gen 3+ — sleep turn count range is [1, 3]
        expect(v).toBeGreaterThanOrEqual(1);
        // Source: Showdown Gen 3+ — sleep turn count upper bound is 3
        expect(v).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("checkFullParalysis", () => {
    it("given a paralyzed pokemon and a deterministic-true RNG, when called, then returns true (fully paralyzed)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: paralysis });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      // Mock RNG: next() always returns 0 → chance(0.25) → 0 < 0.25 → true
      const rng = { next: () => 0, int: () => 0, chance: () => true } as unknown as SeededRandom;

      // Act
      const result = ruleset.checkFullParalysis(active, rng);

      // Assert
      // Source: Showdown Gen 3+ — paralysis has 25% chance to fully paralyze (prevent action)
      expect(result).toBe(true);
    });

    it("given a paralyzed pokemon and a deterministic-false RNG, when called, then returns false (can move)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: paralysis });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      // Mock RNG: next() always returns 0.9999 → chance(0.25) → 0.9999 < 0.25 → false
      const rng = {
        next: () => 0.9999,
        int: () => 255,
        chance: () => false,
      } as unknown as SeededRandom;

      // Act
      const result = ruleset.checkFullParalysis(active, rng);

      // Assert
      // Source: Showdown Gen 3+ — paralysis 25% rate; deterministic-false RNG confirms no paralysis
      expect(result).toBe(false);
    });

    it("given a seeded RNG, when checkFullParalysis is called many times, then paralysis rate is ~25%", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: paralysis });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      const rng = new SeededRandom(42);

      // Act
      let paralyzed = 0;
      for (let i = 0; i < 1000; i++) {
        if (ruleset.checkFullParalysis(active, rng)) paralyzed++;
      }

      // Assert — ~25% rate
      // Source: Showdown Gen 3+ — full paralysis probability is 1/4 (25%)
      expect(paralyzed).toBeGreaterThan(200);
      // Source: Showdown Gen 3+ — 25% paralysis rate over 1000 rolls; expect fewer than 310
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
      // Source: Showdown Gen 3+ — confused pokemon has 50% chance to hit itself
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
      // Source: Showdown Gen 3+ — confused pokemon 50% self-hit; deterministic-false RNG confirms no self-hit
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
      // Source: Showdown Gen 3+ — confusion self-hit probability is 1/2 (50%)
      expect(selfHits).toBeGreaterThan(400);
      // Source: Showdown Gen 3+ — 50% self-hit rate over 1000 rolls; expect fewer than 600
      expect(selfHits).toBeLessThan(600);
    });
  });

  describe("processSleepTurn", () => {
    it("given a pokemon with turnsLeft > 1, when called, then decrements counter and returns false (still sleeping)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: sleep });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      active.volatileStatuses.set(sleepCounter, { turnsLeft: 3 });

      // Act
      const canAct = ruleset.processSleepTurn(active, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — each sleep turn decrements the counter; pokemon stays asleep until counter reaches 0
      expect(canAct).toBe(false);
      // Source: Showdown Gen 3+ — sleep counter decrements by 1 each turn (3 → 2)
      expect(active.volatileStatuses.get(sleepCounter)?.turnsLeft).toBe(2);
      // Source: Showdown Gen 3+ — sleep status persists while counter > 0
      expect(active.pokemon.status).toBe(sleep);
    });

    it("given a pokemon with turnsLeft = 1, when called, then wakes up, clears status, and returns true (can act)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: sleep });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      active.volatileStatuses.set(sleepCounter, { turnsLeft: 1 });

      // Act
      const canAct = ruleset.processSleepTurn(active, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — when sleep counter reaches 1, pokemon wakes up and clears status
      expect(canAct).toBe(true);
      // Source: Showdown Gen 3+ — waking up clears the sleep status condition
      expect(active.pokemon.status).toBeNull();
      // Source: Showdown Gen 3+ — waking up removes the sleepCounter volatile
      expect(active.volatileStatuses.has(sleepCounter)).toBe(false);
    });

    it("given a pokemon with turnsLeft = 0, when called, then wakes up, clears status, and returns true (can act)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, { status: sleep });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      active.volatileStatuses.set(sleepCounter, { turnsLeft: 0 });

      // Act
      const canAct = ruleset.processSleepTurn(active, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — sleep counter at 0 also wakes the pokemon (boundary case)
      expect(canAct).toBe(true);
      // Source: Showdown Gen 3+ — waking up clears the sleep status condition (counter 0 boundary)
      expect(active.pokemon.status).toBeNull();
      // Source: Showdown Gen 3+ — waking up removes the sleepCounter volatile (counter 0 boundary)
      expect(active.volatileStatuses.has(sleepCounter)).toBe(false);
    });
  });

  describe("feature flags", () => {
    it("given a Gen 3+ ruleset, when hasAbilities is called, then true is returned", () => {
      // Source: Showdown Gen 3+ — abilities introduced in Gen 3
      expect(ruleset.hasAbilities()).toBe(true);
    });

    it("given a Gen 3+ ruleset, when hasHeldItems is called, then true is returned", () => {
      // Source: Showdown Gen 2+ — held items introduced in Gen 2; all Gen 3+ rulesets support them
      expect(ruleset.hasHeldItems()).toBe(true);
    });

    it("given a Gen 3+ ruleset, when hasWeather is called, then true is returned", () => {
      // Source: Showdown Gen 3+ — weather mechanics fully present in Gen 3
      expect(ruleset.hasWeather()).toBe(true);
    });

    it("given a Gen 3+ base ruleset, when hasTerrain is called, then false is returned", () => {
      // Source: Showdown Gen 6+ — terrain mechanics introduced in Gen 6; BaseRuleset defaults to false
      expect(ruleset.hasTerrain()).toBe(false);
    });
  });

  describe("applyAbility", () => {
    it("given any trigger, when applyAbility is called, then no-op result is returned", () => {
      const result = ruleset.applyAbility(
        CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
        {} as unknown as AbilityContext,
      );
      // Source: Showdown Gen 3+ BaseRuleset — applyAbility base implementation returns no-op (activated: false)
      expect(result.activated).toBe(false);
    });
  });

  describe("applyHeldItem", () => {
    it("given any trigger, when applyHeldItem is called, then no-op result is returned", () => {
      const result = ruleset.applyHeldItem(
        CORE_ITEM_TRIGGER_IDS.onAfterAttack,
        {} as unknown as ItemContext,
      );
      // Source: Showdown Gen 3+ BaseRuleset — applyHeldItem base implementation returns no-op (activated: false)
      expect(result.activated).toBe(false);
    });
  });

  describe("applyWeatherEffects", () => {
    it("given any state, when applyWeatherEffects is called, then empty array is returned", () => {
      // Source: Showdown Gen 3+ BaseRuleset — applyWeatherEffects base returns empty array (gen-specific rulesets override)
      expect(ruleset.applyWeatherEffects({} as unknown as BattleState)).toEqual([]);
    });
  });

  describe("applyTerrainEffects", () => {
    it("given any state, when applyTerrainEffects is called, then empty array is returned", () => {
      // Source: Showdown Gen 3+ BaseRuleset — applyTerrainEffects base returns empty array (terrain not active pre-Gen 6)
      expect(ruleset.applyTerrainEffects({} as unknown as BattleState)).toEqual([]);
    });
  });

  describe("getAvailableHazards", () => {
    it("given a Gen 3+ ruleset, when getAvailableHazards is called, then base hazards are returned", () => {
      const hazards = ruleset.getAvailableHazards();
      // Source: Showdown Gen 3+ — Stealth Rock (Gen 4+), Spikes (Gen 2+), Toxic Spikes (Gen 4+) available in BaseRuleset
      expect(hazards).toContain(stealthRock);
      // Source: Showdown Gen 2+ — Spikes available as entry hazard
      expect(hazards).toContain(spikes);
      // Source: Showdown Gen 4+ — Toxic Spikes available as entry hazard
      expect(hazards).toContain(toxicSpikes);
    });
  });

  describe("applyEntryHazards", () => {
    it("given any context, when applyEntryHazards is called, then no-op result is returned", () => {
      const result = ruleset.applyEntryHazards(
        {} as unknown as ActivePokemon,
        {} as unknown as BattleSide,
      );
      // Source: Showdown Gen 3+ BaseRuleset — applyEntryHazards base implementation returns no-op (damage: 0)
      expect(result.damage).toBe(0);
    });
  });

  describe("getMaxHazardLayers", () => {
    it("given spikes in BaseRuleset (Gen 3+ default), when querying max layers, then returns 3", () => {
      // Derivation: multi-layer Spikes introduced in Gen 3, max is 3.
      // Source: Showdown data/moves.ts — spikes max 3 layers (Gen 3+)
      expect(ruleset.getMaxHazardLayers(spikes)).toBe(3);
    });

    it("given toxic-spikes in BaseRuleset (Gen 4+ default), when querying max layers, then returns 2", () => {
      // 1 layer = regular poison, 2 layers = bad poison
      // Source: Showdown data/moves.ts — toxic-spikes max 2 layers
      expect(ruleset.getMaxHazardLayers(toxicSpikes)).toBe(2);
    });

    it("given stealth-rock in BaseRuleset, when querying max layers, then returns 1", () => {
      // Source: Showdown data/moves.ts — stealth-rock is always 1 layer (not stackable)
      expect(ruleset.getMaxHazardLayers(stealthRock)).toBe(1);
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
      // Source: Bulbapedia "Experience" — Gen 5+ formula: floor(b*L/5*S/T) * isTrainer(1.5)
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
      // Source: Bulbapedia "Experience" — wild battle uses 1.0x trainer multiplier
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
      // Source: Bulbapedia "Lucky Egg" — Lucky Egg multiplies EXP gained by 1.5×
      expect(exp).toBe(3600);
    });
  });

  describe("getBattleGimmick", () => {
    it("given a base ruleset, when getBattleGimmick is called, then null is returned", () => {
      // Source: Showdown Gen 3+ BaseRuleset — no gimmick active by default; gimmicks are Gen-specific overrides
      expect(ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega)).toBeNull();
    });
  });

  describe("validatePokemon", () => {
    it("given a valid pokemon, when validatePokemon is called, then a valid result is returned", () => {
      const result = ruleset.validatePokemon(
        createTestPokemon(6, 50, { moves: [createMockMoveSlot(scratch)] }),
        testSpecies,
      );
      // Source: Showdown Gen 3+ BaseRuleset — validatePokemon returns valid result for legal inputs
      expect(result.valid).toBe(true);
      // Source: Showdown Gen 3+ BaseRuleset — no errors for valid pokemon
      expect(result.errors).toEqual([]);
    });

    it("given invalid bounded-domain state, when validatePokemon is called, then validation errors are returned", () => {
      const result = ruleset.validatePokemon(
        createTestPokemon(6, 50, {
          friendship: 999,
          ivs: {
            hp: 31,
            attack: 32,
            defense: 31,
            spAttack: 31,
            spDefense: 31,
            speed: 31,
          },
        }),
        testSpecies,
      );

      // Source: Showdown Gen 3+ BaseRuleset — validatePokemon enforces bounded-domain rules (IVs 0–31, friendship 0–255)
      expect(result.valid).toBe(false);
      // Source: Showdown Gen 3+ BaseRuleset — attack IV out-of-range produces descriptive error
      expect(result.errors).toContain("attack IV must be between 0 and 31");
      // Source: Showdown Gen 3+ BaseRuleset — friendship out-of-range produces descriptive error
      expect(result.errors).toContain("friendship must be between 0 and 255");
    });
  });

  describe("getEndOfTurnOrder", () => {
    it("given a base ruleset, when getEndOfTurnOrder is called, then default order is returned", () => {
      const order = ruleset.getEndOfTurnOrder();
      // Source: Showdown Gen 3+ BaseRuleset — getEndOfTurnOrder returns the canonical residual processing sequence
      expect(order).toEqual(DEFAULT_END_OF_TURN_ORDER);
    });

    // Source: Showdown data/moves.ts — nightmare onResidualOrder: 11, curse onResidualOrder: 12
    it("given a base ruleset, when getEndOfTurnOrder is called, then nightmare comes before curse", () => {
      const order = ruleset.getEndOfTurnOrder();
      // Source: Showdown data/moves.ts — nightmare onResidualOrder: 11, curse onResidualOrder: 12
      expect(order).toContain(nightmare);
      // Source: Showdown data/moves.ts — curse onResidualOrder: 12 is included in end-of-turn order
      expect(order).toContain(curse);
      const curseIdx = order.indexOf(curse);
      const nightmareIdx = order.indexOf(nightmare);
      // nightmare (Showdown order 11) must come before curse (order 12)
      // Source: Showdown data/moves.ts — nightmare onResidualOrder: 11 precedes curse onResidualOrder: 12
      expect(nightmareIdx).toBeLessThan(curseIdx);
    });
  });

  describe("applyStatusDamage — badly-poisoned escalation", () => {
    it("given a badly-poisoned pokemon with toxic-counter at 1, when called twice, then damage escalates", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        calculatedStats: {
          hp: 160,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);
      // Set up toxic-counter volatile with counter=1
      active.volatileStatuses.set(toxicCounter, {
        turnsLeft: -1,
        data: { counter: 1 },
      });

      // Act — first call (counter=1): floor(160*1/16) = 10
      const dmg1 = ruleset.applyStatusDamage(active, badlyPoisoned, {} as unknown as BattleState);
      // Act — second call (counter=2): floor(160*2/16) = 20
      const dmg2 = ruleset.applyStatusDamage(active, badlyPoisoned, {} as unknown as BattleState);
      // Act — third call (counter=3): floor(160*3/16) = 30
      const dmg3 = ruleset.applyStatusDamage(active, badlyPoisoned, {} as unknown as BattleState);

      // Assert
      // Source: Showdown Gen 3+ — badly poisoned damage escalates: floor(maxHp * counter / 16) per turn
      expect(dmg1).toBe(10);
      // Source: Showdown Gen 3+ — badly poisoned counter=2: floor(160*2/16)=20
      expect(dmg2).toBe(20);
      // Source: Showdown Gen 3+ — badly poisoned counter=3: floor(160*3/16)=30
      expect(dmg3).toBe(30);
    });
  });

  describe("resolveTurnOrder — move priority", () => {
    it("given Quick Attack (+1) vs Tackle (0), when resolveTurnOrder is called, then Quick Attack goes first regardless of speed", () => {
      // Arrange — side 0 is slower but uses Quick Attack (+1 priority)
      const pokemon1 = createTestPokemon(6, 50, {
        moves: [createMockMoveSlot(quickAttack)],
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
        moves: [createMockMoveSlot(tackle)],
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 200,
        },
      });
      const active1 = createOnFieldPokemon(pokemon1, 0, [normal]);
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
      const rng = new SeededRandom(42);
      const rulesetWithDm = new TestRuleset(TEST_DATA_MANAGER);

      const state = {
        sides: [{ active: [active1] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;

      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // Act
      const ordered = rulesetWithDm.resolveTurnOrder(actions, state, rng);

      // Assert — side 0 (Quick Attack, priority +1) goes first despite lower speed
      // Source: Showdown Gen 3+ BaseRuleset — higher priority bracket always acts before lower priority bracket
      expect(ordered[0]?.side).toBe(0);
      // Source: Showdown Gen 3+ BaseRuleset — lower priority bracket acts second
      expect(ordered[1]?.side).toBe(1);
    });
  });

  describe("getEffectiveSpeed", () => {
    it("given a paralyzed pokemon with speed 100, when getEffectiveSpeed is called, then speed is halved", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        status: paralysis,
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, [fire]);

      // Act — access via resolveTurnOrder (getEffectiveSpeed is protected)
      // We test it indirectly: paralyzed side 0 (base 100) vs healthy side 1 (base 49)
      // Without paralysis: side 0 wins (100 > 49); with paralysis: side 0 effective = 50 > 49, still wins
      // But if effective speed < 49, side 1 wins. Use speed 100 → 50 effective vs opponent speed 49.
      const pokemon2 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 49,
        },
      });
      const active2 = createOnFieldPokemon(pokemon2, 0, [water]);
      const rng = new SeededRandom(42);
      const state = {
        sides: [{ active: [active] }, { active: [active2] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;
      const actions = [
        { type: "move" as const, side: 0 as const, moveIndex: 0 },
        { type: "move" as const, side: 1 as const, moveIndex: 0 },
      ];

      // side 0: paralyzed, speed=100 → effective=50; side 1: speed=49 → effective=49
      // side 0 still goes first (50 > 49)
      const ordered = ruleset.resolveTurnOrder(actions, state, rng);
      // Source: Showdown Gen 3+ — paralysis halves speed; effective 50 still beats opponent 49
      expect(ordered[0]?.side).toBe(0);

      // Now test that side 1 (speed 51) beats paralyzed side 0 (effective 50)
      const pokemon3 = createTestPokemon(9, 50, {
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 51,
        },
      });
      const active3 = createOnFieldPokemon(pokemon3, 0, [water]);
      const state2 = {
        sides: [{ active: [active] }, { active: [active3] }],
        trickRoom: { active: false, turnsLeft: 0 },
      } as unknown as BattleState;
      const rng2 = new SeededRandom(42);
      const ordered2 = ruleset.resolveTurnOrder(actions, state2, rng2);
      // side 1 (speed 51 effective) beats side 0 (paralyzed, effective 50)
      // Source: Showdown Gen 3+ — paralysis halves speed; opponent with higher effective speed goes first
      expect(ordered2[0]?.side).toBe(1);
    });
  });

  describe("calculateStruggleRecoil", () => {
    it("given maxHp=100, when calculating recoil, then returns 25 (floor(100/4))", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        currentHp: 100,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, [fire, flying]);
      // Act
      const recoil = ruleset.calculateStruggleRecoil(active, 0);
      // Assert: floor(100 / 4) = 25
      // Source: Showdown Gen 4+ — Struggle recoil is floor(maxHp/4), not a percentage of damage dealt
      expect(recoil).toBe(25);
    });

    it("given maxHp=1, when calculating recoil, then returns 1 (min 1)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        currentHp: 1,
        calculatedStats: {
          hp: 1,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, [fire, flying]);
      // Act
      const recoil = ruleset.calculateStruggleRecoil(active, 0);
      // Assert: max(1, floor(1/4)) = max(1, 0) = 1
      // Source: Showdown Gen 4+ — Struggle recoil minimum is 1 HP
      expect(recoil).toBe(1);
    });

    it("given damageDealt=0, when calculating recoil, then recoil is based on maxHp (not damageDealt)", () => {
      // Arrange
      const pokemon = createTestPokemon(6, 50, {
        currentHp: 200,
        calculatedStats: {
          hp: 200,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      });
      const active = createOnFieldPokemon(pokemon, 0, [fire, flying]);
      // Act: pass 0 for damageDealt — BaseRuleset ignores it
      const recoil = ruleset.calculateStruggleRecoil(active, 0);
      // Assert: floor(200 / 4) = 50, not 0
      // Source: Showdown Gen 4+ — Struggle recoil based on maxHp, ignores damageDealt parameter
      expect(recoil).toBe(50);
    });
  });

  describe("rollMultiHitCount", () => {
    it("given 1000 rolls, when rolling multi-hit count, then result is always in {2,3,4,5}", () => {
      // Arrange
      const rng = new SeededRandom(42);
      const pokemon = createTestPokemon(6, 50);
      const active = createOnFieldPokemon(pokemon, 0, [fire, flying]);
      // Act / Assert
      for (let i = 0; i < 1000; i++) {
        const count = ruleset.rollMultiHitCount(active, rng);
        // Source: Showdown Gen 3+ — multi-hit move hits 2–5 times (35%/35%/15%/15% distribution)
        expect([2, 3, 4, 5]).toContain(count);
      }
    });

    it("given attacker has Skill Link ability, when rolling multi-hit count, then always returns 5", () => {
      // Arrange
      const rng = new SeededRandom(42);
      const pokemon = createTestPokemon(6, 50, { ability: skillLink });
      const active = createOnFieldPokemon(pokemon, 0, [fire, flying]);
      // Act / Assert
      for (let i = 0; i < 20; i++) {
        const count = ruleset.rollMultiHitCount(active, rng);
        // Source: Skill Link forces the max-hit branch for multi-hit move rolls.
        expect(count).toBe(SKILL_LINK_HIT_COUNT);
      }
    });
  });
});
