import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

describe("Gen6Ruleset smoke tests", () => {
  it("given Gen6Ruleset, when checking generation property, then returns 6", () => {
    // Source: Gen6Ruleset.generation is set to 6 in the class definition
    const ruleset = new Gen6Ruleset();
    expect(ruleset.generation).toBe(6);
  });

  it("given Gen6Ruleset, when checking name, then includes Gen 6", () => {
    // Source: Gen6Ruleset.name is set to "Gen 6 (X/Y/Omega Ruby/Alpha Sapphire)"
    const ruleset = new Gen6Ruleset();
    expect(ruleset.name).toContain("Gen 6");
  });

  it("given Gen6Ruleset, when getting type chart, then returns non-empty type chart", () => {
    // Source: Gen 6 has 18 types (adds Fairy)
    const ruleset = new Gen6Ruleset();
    const chart = ruleset.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given Gen6Ruleset, when getting available types, then returns array of 18 types", () => {
    // Source: Gen 6 type chart includes 18 types (adds Fairy)
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Generation_VI
    const ruleset = new Gen6Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types.length).toBe(18);
  });

  it("given Gen6Ruleset, when getting available types, then includes fairy", () => {
    // Source: Fairy type introduced in Gen 6
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Fairy_(type)
    const ruleset = new Gen6Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types).toContain("fairy");
  });

  it("given Gen6Ruleset, when checking recalculatesFutureAttackDamage, then returns true", () => {
    // Source: Bulbapedia -- Gen 5+ recalculates Future Sight/Doom Desire at hit time
    const ruleset = new Gen6Ruleset();
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });

  it("given Gen6Ruleset, when getting crit multiplier, then returns 1.5", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier is 1.5x
    // Gen 6 changed from 2.0x (Gen 3-5) to 1.5x
    const ruleset = new Gen6Ruleset();
    expect(ruleset.getCritMultiplier()).toBe(1.5);
  });

  it("given Gen6Ruleset, when getting crit rate table, then returns Gen 6+ table", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit rate table
    // Gen 6 changed from [16, 8, 4, 3, 2] to [24, 8, 2, 1]
    const ruleset = new Gen6Ruleset();
    const table = ruleset.getCritRateTable();
    expect(table).toEqual([24, 8, 2, 1]);
  });

  it("given Gen6Ruleset, when getting end-of-turn order, then includes weather-damage first", () => {
    // Source: Showdown data/conditions.ts -- weather damage is first residual
    const ruleset = new Gen6Ruleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe("weather-damage");
    expect(order.length).toBeGreaterThan(10);
  });

  it("given Gen6Ruleset, when getting post-attack residual order, then returns empty array", () => {
    // Source: Gen 6 (like Gen 3+) has no per-attack residuals
    const ruleset = new Gen6Ruleset();
    expect(ruleset.getPostAttackResidualOrder()).toEqual([]);
  });

  it("given Gen6Ruleset, when getting available hazards, then includes sticky-web", () => {
    // Source: Bulbapedia -- Sticky Web introduced in Gen 6
    const ruleset = new Gen6Ruleset();
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toContain("sticky-web");
    // Also includes Gen 4-5 hazards
    expect(hazards).toContain("stealth-rock");
    expect(hazards).toContain("spikes");
    expect(hazards).toContain("toxic-spikes");
  });
});

// ---------------------------------------------------------------------------
// Gen6Ruleset status damage
// ---------------------------------------------------------------------------

describe("Gen6Ruleset status damage", () => {
  it("given Gen6Ruleset, when calling applyStatusDamage with burn, then returns 1/8 max HP", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    // 160 / 8 = 20
    const ruleset = new Gen6Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 160 },
        currentHp: 160,
        status: "burn",
      },
      ability: null,
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(20);
  });

  it("given Gen6Ruleset with different HP, when calling applyStatusDamage with burn, then returns correct 1/8 value", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    // 200 / 8 = 25
    const ruleset = new Gen6Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 200 },
        currentHp: 200,
        status: "burn",
      },
      ability: null,
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(25);
  });

  it("given Gen6Ruleset with Heatproof, when calling applyStatusDamage with burn, then returns 1/16 max HP", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage (1/8 -> 1/16)
    // 160 / 16 = 10
    const ruleset = new Gen6Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 160 },
        currentHp: 160,
        status: "burn",
      },
      ability: "heatproof",
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(10);
  });

  it("given Gen6Ruleset with Magic Guard, when calling applyStatusDamage with burn, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const ruleset = new Gen6Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 160 },
        currentHp: 160,
        status: "burn",
      },
      ability: "magic-guard",
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "burn", state);
    expect(damage).toBe(0);
  });

  it("given Gen6Ruleset, when calling applyStatusDamage with poison, then delegates to BaseRuleset (1/8 max HP)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP (consistent across gens)
    // 160 / 8 = 20
    const ruleset = new Gen6Ruleset();
    const pokemon = {
      pokemon: {
        calculatedStats: { hp: 160 },
        currentHp: 160,
        status: "poison",
      },
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, "poison", state);
    expect(damage).toBe(20);
  });
});
