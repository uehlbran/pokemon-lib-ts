import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { applyGen5Ability } from "../../src/Gen5Abilities";
import { applyGen5HeldItem } from "../../src/Gen5Items";
import { executeGen5MoveEffect } from "../../src/Gen5MoveEffects";
import { Gen5Ruleset } from "../../src/Gen5Ruleset";
import { applyGen5WeatherEffects } from "../../src/Gen5Weather";

describe("Gen5Ruleset smoke tests", () => {
  it("given Gen5Ruleset, when checking generation property, then returns 5", () => {
    // Source: Gen5Ruleset.generation is set to 5 in the class definition
    const ruleset = new Gen5Ruleset();
    expect(ruleset.generation).toBe(5);
  });

  it("given Gen5Ruleset, when checking name, then includes Gen 5", () => {
    // Source: Gen5Ruleset.name is set to "Gen 5 (Black/White/Black2/White2)"
    const ruleset = new Gen5Ruleset();
    expect(ruleset.name).toContain("Gen 5");
  });

  it("given Gen5Ruleset, when getting type chart, then returns non-empty type chart", () => {
    // Source: Gen 5 has 17 types (same as Gen 2-4)
    const ruleset = new Gen5Ruleset();
    const chart = ruleset.getTypeChart();
    expect(Object.keys(chart).length).toBeGreaterThan(0);
  });

  it("given Gen5Ruleset, when getting available types, then returns array of 17 types", () => {
    // Source: Gen 5 type chart includes 17 types (no Fairy)
    const ruleset = new Gen5Ruleset();
    const types = ruleset.getAvailableTypes();
    expect(types.length).toBe(17);
  });

  it("given Gen5Ruleset, when checking recalculatesFutureAttackDamage, then returns true", () => {
    // Source: Bulbapedia -- Gen 5+ recalculates Future Sight/Doom Desire at hit time
    const ruleset = new Gen5Ruleset();
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });

  it("given Gen5Ruleset, when getting crit multiplier, then returns 2.0", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 3-5 crit multiplier is 2.0x
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getCritMultiplier()).toBe(2.0);
  });

  it("given Gen5Ruleset, when getting crit rate table, then returns Gen 3-5 denominators", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 3-5 crit rate table
    const ruleset = new Gen5Ruleset();
    const table = ruleset.getCritRateTable();
    expect(table).toEqual([16, 8, 4, 3, 2]);
  });

  it("given Gen5Ruleset, when getting end-of-turn order, then includes weather-damage first", () => {
    // Source: Showdown Gen 5 mod conditions.ts -- weather damage is first residual
    const ruleset = new Gen5Ruleset();
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe("weather-damage");
    // Source: BaseRuleset.getEndOfTurnOrder() returns at least 11 slots:
    // weather-damage, hail-damage, sandstorm-damage, burn, poison, bad-poison,
    // leech-seed, binding, nightmare, curse, future-attack (11 entries minimum)
    expect(order.length).toBeGreaterThan(10);
  });

  it("given Gen5Ruleset, when getting post-attack residual order, then returns empty array", () => {
    // Source: Gen 5 (like Gen 3+) has no per-attack residuals
    const ruleset = new Gen5Ruleset();
    expect(ruleset.getPostAttackResidualOrder()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset status damage
// ---------------------------------------------------------------------------

describe("Gen5Ruleset status damage", () => {
  it("given Gen5Ruleset, when calling applyStatusDamage with burn, then returns 1/8 max HP", () => {
    // Source: Showdown Gen < 7 burn damage is 1/8 max HP
    const ruleset = new Gen5Ruleset();
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

  it("given Gen5Ruleset with Heatproof, when calling applyStatusDamage with burn, then returns 1/16 max HP", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage (1/8 -> 1/16)
    const ruleset = new Gen5Ruleset();
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

  it("given Gen5Ruleset with Magic Guard, when calling applyStatusDamage with burn, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const ruleset = new Gen5Ruleset();
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

  it("given Gen5Ruleset, when calling applyStatusDamage with poison, then delegates to BaseRuleset (1/8 max HP)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP (consistent across gens)
    const ruleset = new Gen5Ruleset();
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

// ---------------------------------------------------------------------------
// Master dispatcher smoke tests
// ---------------------------------------------------------------------------

describe("Gen 5 master dispatchers", () => {
  it("given applyGen5Ability dispatcher with unrecognized trigger, when called, then returns inactive result", () => {
    // Source: applyGen5Ability default case returns { activated: false, effects: [], messages: [] }
    const mockCtx = {
      pokemon: { ability: "unknown-ability" },
      trigger: "unrecognized-trigger",
    } as any;
    const result = applyGen5Ability("unrecognized-trigger" as any, mockCtx);
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given applyGen5HeldItem with no held item, when called, then returns no activation", () => {
    // Source: applyGen5HeldItem returns NO_ACTIVATION when pokemon has no item
    const mockPokemon = {
      pokemon: {
        heldItem: null,
        currentHp: 100,
        calculatedStats: { hp: 100 },
        nickname: null,
        speciesId: 1,
        status: null,
      },
      types: ["normal"],
      ability: "none",
      volatileStatuses: new Map(),
    } as unknown as ActivePokemon;
    const result = applyGen5HeldItem("end-of-turn", {
      pokemon: mockPokemon,
      state: {} as BattleState,
      rng: { chance: () => false, nextInt: () => 0, next: () => 0 } as any,
    });
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
  });

  it("given executeGen5MoveEffect dispatcher with unrecognized move, when called, then returns null", () => {
    // Source: executeGen5MoveEffect returns null when no sub-module recognizes the move
    const mockCtx = {
      move: { id: "unknown-move-xyz" },
      attacker: { pokemon: { currentHp: 100 } },
      defender: { pokemon: { currentHp: 100 } },
      state: { rng: { chance: () => false, next: () => 0, nextInt: () => 0 } },
    } as any;
    const mockRng = { chance: () => false, next: () => 0, nextInt: () => 0 } as any;
    const mockRollProtect = () => true;
    const result = executeGen5MoveEffect(mockCtx, mockRng, mockRollProtect);
    expect(result).toBeNull();
  });

  it("given applyGen5WeatherEffects with no weather, when called, then returns empty array", () => {
    // Source: No weather = no chip damage effects
    const state = { weather: null, sides: [] } as unknown as BattleState;
    const result = applyGen5WeatherEffects(state);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset canHitSemiInvulnerable
// ---------------------------------------------------------------------------

describe("Gen5Ruleset canHitSemiInvulnerable", () => {
  const ruleset = new Gen5Ruleset();

  it("given flying volatile and Thunder, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Thunder can hit Pokemon using Fly/Bounce
    expect(ruleset.canHitSemiInvulnerable("thunder", "flying")).toBe(true);
  });

  it("given flying volatile and Hurricane, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Hurricane can hit Flying targets (added in Gen 5)
    expect(ruleset.canHitSemiInvulnerable("hurricane", "flying")).toBe(true);
  });

  it("given flying volatile and Smack Down, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Smack Down can hit Flying targets (added in Gen 5)
    expect(ruleset.canHitSemiInvulnerable("smack-down", "flying")).toBe(true);
  });

  it("given flying volatile and Surf, when checking canHit, then returns false", () => {
    // Source: Bulbapedia -- Surf cannot hit Flying targets
    expect(ruleset.canHitSemiInvulnerable("surf", "flying")).toBe(false);
  });

  it("given underground volatile and Earthquake, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Earthquake can hit Digging targets
    expect(ruleset.canHitSemiInvulnerable("earthquake", "underground")).toBe(true);
  });

  it("given underground volatile and Thunder, when checking canHit, then returns false", () => {
    // Source: Bulbapedia -- Thunder cannot hit Digging targets
    expect(ruleset.canHitSemiInvulnerable("thunder", "underground")).toBe(false);
  });

  it("given underwater volatile and Surf, when checking canHit, then returns true", () => {
    // Source: Bulbapedia -- Surf can hit Diving targets
    expect(ruleset.canHitSemiInvulnerable("surf", "underwater")).toBe(true);
  });

  it("given shadow-force-charging volatile and any move, when checking canHit, then returns false", () => {
    // Source: Bulbapedia -- Nothing bypasses Shadow Force's charging turn
    expect(ruleset.canHitSemiInvulnerable("thunder", "shadow-force-charging")).toBe(false);
    expect(ruleset.canHitSemiInvulnerable("earthquake", "shadow-force-charging")).toBe(false);
  });

  it("given charging volatile and any move, when checking canHit, then returns true", () => {
    // Source: Charging moves (SolarBeam, etc.) are NOT semi-invulnerable
    expect(ruleset.canHitSemiInvulnerable("tackle", "charging")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset rollProtectSuccess
// ---------------------------------------------------------------------------

describe("Gen5Ruleset rollProtectSuccess", () => {
  const ruleset = new Gen5Ruleset();

  it("given 0 consecutive protects, when rolling, then always succeeds", () => {
    // Source: Showdown Gen 5 mod -- first Protect always succeeds
    const rng = { chance: () => false } as any;
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });

  it("given 1 consecutive protect, when rolling with success, then uses 1/2 chance", () => {
    // Source: Showdown Gen 5 mod -- stall counter starts at 2, chance = 1/2
    let calledWith = 0;
    const rng = {
      chance: (p: number) => {
        calledWith = p;
        return true;
      },
    } as any;
    ruleset.rollProtectSuccess(1, rng);
    expect(calledWith).toBe(0.5);
  });

  it("given 8+ consecutive protects, when rolling, then uses effectively-impossible 1/2^32 chance", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- counterMax: 256
    //   At cap (counter >= 256), Showdown uses randomChance(1, 2**32), not 1/256.
    let calledWith = 0;
    const rng = {
      chance: (p: number) => {
        calledWith = p;
        return false;
      },
    } as any;
    ruleset.rollProtectSuccess(10, rng);
    expect(calledWith).toBeCloseTo(1 / 2 ** 32);
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset sleep mechanics
// ---------------------------------------------------------------------------

describe("Gen5Ruleset sleep mechanics", () => {
  const ruleset = new Gen5Ruleset();

  it("given sleeping Pokemon on switch-in, when sleep counter has startTime, then resets counter", () => {
    // Source: Showdown Gen 5 mod -- slp.onSwitchIn: time = startTime
    const pokemon = {
      pokemon: { status: "sleep" },
      volatileStatuses: new Map([["sleep-counter", { turnsLeft: 1, data: { startTime: 3 } }]]),
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    ruleset.onSwitchIn(pokemon, state);
    expect(pokemon.volatileStatuses.get("sleep-counter")!.turnsLeft).toBe(3);
  });

  it("given sleeping Pokemon, when processSleepTurn with counter at 1, then wakes up and can act", () => {
    // Source: Showdown Gen 5 mod -- Pokemon can act on wake turn
    const pokemon = {
      pokemon: { status: "sleep" },
      volatileStatuses: new Map([["sleep-counter", { turnsLeft: 1 }]]),
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const canAct = ruleset.processSleepTurn(pokemon, state);
    expect(canAct).toBe(true);
    expect(pokemon.pokemon.status).toBeNull();
  });

  it("given sleeping Pokemon, when processSleepTurn with counter at 3, then stays asleep", () => {
    // Source: Showdown Gen 5 mod -- counter decrements, still sleeping
    const pokemon = {
      pokemon: { status: "sleep" },
      volatileStatuses: new Map([["sleep-counter", { turnsLeft: 3 }]]),
    } as unknown as ActivePokemon;
    const state = {} as unknown as BattleState;
    const canAct = ruleset.processSleepTurn(pokemon, state);
    expect(canAct).toBe(false);
    expect(pokemon.volatileStatuses.get("sleep-counter")!.turnsLeft).toBe(2);
  });
});
