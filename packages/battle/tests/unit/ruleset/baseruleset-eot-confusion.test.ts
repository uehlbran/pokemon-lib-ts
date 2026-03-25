import type { Generation, PokemonType, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { DamageContext, DamageResult } from "../../../src/context";
import { BaseRuleset } from "../../../src/ruleset/BaseRuleset";
import type { BattleState } from "../../../src/state";
import { createActivePokemon, createTestPokemon } from "../../../src/utils";

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
  poison,
  psychic,
  rock,
  steel,
  water,
} = CORE_TYPE_IDS;
const { futureAttack, screenCountdown, statusDamage, weatherCountdown, weatherDamage, wish } =
  CORE_END_OF_TURN_EFFECT_IDS;
const { blackSludge, leftovers } = CORE_ITEM_IDS;
const { bind, leechSeed, perishSong } = CORE_MOVE_IDS;
const { curse, nightmare } = CORE_VOLATILE_IDS;
const GEN5_SUPPORTED_TYPES = [
  normal,
  fire,
  water,
  electric,
  grass,
  ice,
  fighting,
  poison,
  ground,
  flying,
  psychic,
  bug,
  rock,
  ghost,
  dragon,
  dark,
  steel,
] as const satisfies readonly PokemonType[];
const DEFAULT_END_OF_TURN_ORDER = [
  futureAttack,
  wish,
  weatherDamage,
  leftovers,
  blackSludge,
  leechSeed,
  statusDamage,
  nightmare,
  curse,
  bind,
  perishSong,
  screenCountdown,
  weatherCountdown,
] as const;

// Concrete implementation of BaseRuleset for testing (minimal overrides)
class TestRuleset extends BaseRuleset {
  readonly generation: Generation = 5;
  readonly name = "Test Gen 5";

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
    return GEN5_SUPPORTED_TYPES;
  }

  calculateDamage(_context: DamageContext): DamageResult {
    return { damage: 50, effectiveness: 1, isCrit: false, randomFactor: 1 };
  }
}

describe("BaseRuleset end-of-turn order (#555)", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  // Source: Showdown data/conditions.ts -- futuremove onResidualOrder: 3 (first)
  //         weather damage (Sandstorm/Hail) onResidualOrder: 5
  it("given default EOT order, when getEndOfTurnOrder is called, then future-attack comes before weather-damage", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();
    const futureIdx = order.indexOf(futureAttack);
    const weatherIdx = order.indexOf(weatherDamage);

    // Assert
    expect(futureIdx).not.toBe(-1);
    expect(weatherIdx).not.toBe(-1);
    expect(futureIdx).toBeLessThan(weatherIdx);
  });

  // Source: Showdown data/moves.ts -- wish onResidualOrder: 4 (before weather at 5)
  it("given default EOT order, when getEndOfTurnOrder is called, then wish comes before weather-damage", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();
    const wishIdx = order.indexOf(wish);
    const weatherIdx = order.indexOf(weatherDamage);

    // Assert
    expect(wishIdx).not.toBe(-1);
    expect(weatherIdx).not.toBe(-1);
    expect(wishIdx).toBeLessThan(weatherIdx);
  });

  // Source: Showdown data/items.ts -- leftovers onResidualOrder: 5.2 (before leech-seed at 8)
  it("given default EOT order, when getEndOfTurnOrder is called, then leftovers comes before leech-seed", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();
    const leftIdx = order.indexOf(leftovers);
    const leechIdx = order.indexOf(leechSeed);

    // Assert
    expect(leftIdx).not.toBe(-1);
    expect(leechIdx).not.toBe(-1);
    expect(leftIdx).toBeLessThan(leechIdx);
  });

  // Source: Showdown data/moves.ts -- leechseed onResidualOrder: 8
  //         data/conditions.ts -- brn onResidualOrder: 10, psn onResidualOrder: 9
  it("given default EOT order, when getEndOfTurnOrder is called, then leech-seed comes before status-damage", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();
    const leechIdx = order.indexOf(leechSeed);
    const statusIdx = order.indexOf(statusDamage);

    // Assert
    expect(leechIdx).not.toBe(-1);
    expect(statusIdx).not.toBe(-1);
    expect(leechIdx).toBeLessThan(statusIdx);
  });

  // Source: Showdown data/moves.ts -- nightmare onResidualOrder: 11,
  //         data/conditions.ts -- partiallytrapped onResidualOrder: 13
  it("given default EOT order, when getEndOfTurnOrder is called, then nightmare comes before bind", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();
    const nightmareIdx = order.indexOf(nightmare);
    const bindIdx = order.indexOf(bind);

    // Assert
    expect(nightmareIdx).not.toBe(-1);
    expect(bindIdx).not.toBe(-1);
    expect(nightmareIdx).toBeLessThan(bindIdx);
  });

  // Source: Showdown data/moves.ts -- curse onResidualOrder: 12,
  //         data/conditions.ts -- partiallytrapped onResidualOrder: 13
  it("given default EOT order, when getEndOfTurnOrder is called, then curse comes before bind", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();
    const curseIdx = order.indexOf(curse);
    const bindIdx = order.indexOf(bind);

    // Assert
    expect(curseIdx).not.toBe(-1);
    expect(bindIdx).not.toBe(-1);
    expect(curseIdx).toBeLessThan(bindIdx);
  });

  // Source: Showdown data -- comprehensive relative order validation from residualOrder values
  it("given default EOT order, when getEndOfTurnOrder is called, then full order matches Showdown residualOrder", () => {
    // Arrange & Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert: verify key relative orderings from Showdown residualOrder
    expect(order).toEqual(expect.arrayContaining(DEFAULT_END_OF_TURN_ORDER));
    const futureIdx = order.indexOf(futureAttack); // 3
    const wishIdx = order.indexOf(wish); // 4
    const weatherDmgIdx = order.indexOf(weatherDamage); // 5
    const leftIdx = order.indexOf(leftovers); // 5.2
    const blackSludgeIdx = order.indexOf(blackSludge); // 5.2
    const leechIdx = order.indexOf(leechSeed); // 8
    const statusIdx = order.indexOf(statusDamage); // 9-10
    const nightmareIdx = order.indexOf(nightmare); // 11
    const curseIdx = order.indexOf(curse); // 12
    const bindIdx = order.indexOf(bind); // 13
    const perishIdx = order.indexOf(perishSong); // 24
    const screenIdx = order.indexOf(screenCountdown); // 26
    const weatherCountIdx = order.indexOf(weatherCountdown); // 26

    // future-attack(3) -> wish(4) -> weather(5)
    expect(futureIdx).toBeLessThan(wishIdx);
    expect(wishIdx).toBeLessThan(weatherDmgIdx);

    // leftovers/black-sludge(5.2) before leech-seed(8)
    expect(leftIdx).toBeLessThan(leechIdx);
    expect(blackSludgeIdx).toBeLessThan(leechIdx);

    // leech-seed(8) before status-damage(9-10)
    expect(leechIdx).toBeLessThan(statusIdx);

    // nightmare(11) before curse(12) before bind(13)
    expect(nightmareIdx).toBeLessThan(curseIdx);
    expect(curseIdx).toBeLessThan(bindIdx);

    // bind(13) before perish-song(24)
    expect(bindIdx).toBeLessThan(perishIdx);

    // perish-song(24) before countdowns(26)
    expect(perishIdx).toBeLessThan(screenIdx);
    expect(perishIdx).toBeLessThan(weatherCountIdx);
  });
});

describe("BaseRuleset calculateConfusionDamage (#557)", () => {
  let ruleset: TestRuleset;

  beforeEach(() => {
    ruleset = new TestRuleset();
  });

  // Source: Showdown sim/battle-actions.ts -- confusion self-hit applies random 85-100% factor
  // like normal damage: damage = tr(damage * randomFactor / 100) where randomFactor in [85,100]
  it("given two different RNG seeds, when calculateConfusionDamage is called, then results differ due to random factor", () => {
    // Arrange
    const pokemon = createTestPokemon(6, 50, {
      calculatedStats: {
        hp: 153,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createActivePokemon(pokemon, 0, [fire, flying]);
    const state = {} as BattleState;

    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(12345);

    // Act
    const damage1 = ruleset.calculateConfusionDamage(active, state, rng1);
    const damage2 = ruleset.calculateConfusionDamage(active, state, rng2);

    // Assert -- with different seeds, the random factor (85-100) should produce
    // different damage values at least some of the time.
    // If the RNG is not being used, both will be identical (the bug).
    expect(damage1).not.toBe(damage2);
  });

  // Source: Showdown sim/battle-actions.ts -- confusion damage formula:
  // baseDamage = floor(floor(2*level/5+2) * 40 * atk / def / 50) + 2
  // finalDamage = max(1, floor(baseDamage * randomFactor / 100)) where randomFactor in [85,100]
  //
  // Inline derivation for L50 pokemon with 100 atk and 100 def:
  //   levelFactor = floor(2*50/5) + 2 = 22
  //   baseDamage = floor(floor(22 * 40 * 100) / 100 / 50) + 2
  //             = floor(88000 / 100 / 50) + 2 = floor(17.6) + 2 = 17 + 2 = 19
  //   With 85% roll: max(1, floor(19 * 85 / 100)) = max(1, floor(16.15)) = 16
  //   With 100% roll: max(1, floor(19 * 100 / 100)) = 19
  // So confusion damage should be in range [16, 19] for this setup.
  it("given a L50 pokemon with 100 atk/def, when calculateConfusionDamage is called many times, then damage is bounded by 85-100% of base", () => {
    // Arrange
    const pokemon = createTestPokemon(6, 50, {
      calculatedStats: {
        hp: 153,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const active = createActivePokemon(pokemon, 0, [fire, flying]);
    const state = {} as BattleState;

    // Inline derivation of expected values:
    // levelFactor = floor(2*50/5) + 2 = 22
    // baseDamage = floor(22 * 40 * 100 / 100 / 50) + 2 = floor(17.6) + 2 = 19
    // minDamage = max(1, floor(19 * 85 / 100)) = floor(16.15) = 16
    // maxDamage = floor(19 * 100 / 100) = 19
    const expectedBaseDamage = 19;
    const expectedMin = Math.max(1, Math.floor((expectedBaseDamage * 85) / 100)); // 16
    const expectedMax = Math.floor((expectedBaseDamage * 100) / 100); // 19

    // Act -- run many times to sample the distribution
    const damages = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const rng = new SeededRandom(seed);
      const dmg = ruleset.calculateConfusionDamage(active, state, rng);
      damages.add(dmg);
    }

    // Assert -- all values should be in [16, 19]
    for (const d of damages) {
      expect(d).toBeGreaterThanOrEqual(expectedMin);
      expect(d).toBeLessThanOrEqual(expectedMax);
    }
    // With 200 seeds, we should see at least 2 distinct values
    // (proves the random factor is actually being applied)
    expect(damages.size).toBeGreaterThanOrEqual(2);
  });
});
