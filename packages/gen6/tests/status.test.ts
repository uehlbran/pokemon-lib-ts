import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

// ---------------------------------------------------------------------------
// Helper: create a mock ActivePokemon for status damage tests
// ---------------------------------------------------------------------------
function makeStatusPokemon(
  overrides: {
    maxHp?: number;
    currentHp?: number;
    status?: string | null;
    ability?: string | null;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
    },
    ability: overrides.ability ?? null,
  } as unknown as ActivePokemon;
}

const emptyState = {} as unknown as BattleState;

// ---------------------------------------------------------------------------
// Gen6Ruleset — applyStatusDamage
// ---------------------------------------------------------------------------

describe("Gen6Ruleset — burn damage", () => {
  const ruleset = new Gen6Ruleset();

  it("given a Pokemon with 160 max HP, when applying burn damage, then returns 20 (1/8 of 160)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    // 160 / 8 = 20
    const pokemon = makeStatusPokemon({ maxHp: 160, status: "burn" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", emptyState)).toBe(20);
  });

  it("given a Pokemon with 200 max HP, when applying burn damage, then returns 25 (1/8 of 200)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    // 200 / 8 = 25
    const pokemon = makeStatusPokemon({ maxHp: 200, status: "burn" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", emptyState)).toBe(25);
  });

  it("given a Pokemon with 7 max HP, when applying burn damage, then returns at least 1", () => {
    // Source: Showdown -- minimum 1 damage from status
    // floor(7 / 8) = 0, clamped to 1
    const pokemon = makeStatusPokemon({ maxHp: 7, status: "burn" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", emptyState)).toBe(1);
  });
});

describe("Gen6Ruleset — burn damage with Heatproof", () => {
  const ruleset = new Gen6Ruleset();

  it("given a Pokemon with Heatproof and 160 max HP, when applying burn damage, then returns 10 (1/16 of 160)", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage (1/8 -> 1/16)
    // 160 / 16 = 10
    const pokemon = makeStatusPokemon({ maxHp: 160, status: "burn", ability: "heatproof" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", emptyState)).toBe(10);
  });

  it("given a Pokemon with Heatproof and 200 max HP, when applying burn damage, then returns 12 (floor(200/16))", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage
    // floor(200 / 16) = 12
    const pokemon = makeStatusPokemon({ maxHp: 200, status: "burn", ability: "heatproof" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", emptyState)).toBe(12);
  });
});

describe("Gen6Ruleset — burn damage with Magic Guard", () => {
  const ruleset = new Gen6Ruleset();

  it("given a Pokemon with Magic Guard, when applying burn damage, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const pokemon = makeStatusPokemon({ maxHp: 160, status: "burn", ability: "magic-guard" });
    expect(ruleset.applyStatusDamage(pokemon, "burn", emptyState)).toBe(0);
  });

  it("given a Pokemon with Magic Guard, when applying poison damage, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including poison
    const pokemon = makeStatusPokemon({ maxHp: 160, status: "poison", ability: "magic-guard" });
    expect(ruleset.applyStatusDamage(pokemon, "poison", emptyState)).toBe(0);
  });
});

describe("Gen6Ruleset — poison damage (delegates to BaseRuleset)", () => {
  const ruleset = new Gen6Ruleset();

  it("given a Pokemon with 160 max HP, when applying poison damage, then returns 20 (1/8 of 160)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP (consistent across gens)
    // 160 / 8 = 20
    const pokemon = makeStatusPokemon({ maxHp: 160, status: "poison" });
    expect(ruleset.applyStatusDamage(pokemon, "poison", emptyState)).toBe(20);
  });

  it("given a Pokemon with 200 max HP, when applying poison damage, then returns 25 (1/8 of 200)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP
    // 200 / 8 = 25
    const pokemon = makeStatusPokemon({ maxHp: 200, status: "poison" });
    expect(ruleset.applyStatusDamage(pokemon, "poison", emptyState)).toBe(25);
  });
});
