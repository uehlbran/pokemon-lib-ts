import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

/**
 * Helper: create a minimal ActivePokemon mock for ruleset tests.
 */
function makeActivePokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  speed?: number;
  status?: string | null;
  ability?: string;
  heldItem?: string | null;
  types?: string[];
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        speed,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
      },
      currentHp: overrides.currentHp ?? maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
      speciesId: 1,
      nickname: "TestMon",
    },
    ability: overrides.ability ?? "blaze",
    types: overrides.types ?? ["normal"],
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: 0,
      evasion: 0,
    },
  } as unknown as ActivePokemon;
}

// --- Protect ---

describe("Gen5 Protect consecutive success", () => {
  const ruleset = new Gen5Ruleset();

  it("given 0 consecutive Protects, when rollProtectSuccess called, then always returns true", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- first use always succeeds
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given 1 consecutive Protect, when rollProtectSuccess called, then has approximately 1/4 success chance", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
    // counter starts at 2, doubles on restart: 2^(1+1) = 4, chance = 1/4
    const rng = new SeededRandom(42);
    let successCount = 0;
    const iterations = 2000;
    for (let i = 0; i < iterations; i++) {
      if (ruleset.rollProtectSuccess(1, rng)) successCount++;
    }
    const ratio = successCount / iterations;
    // Expected: 1/4 = 0.25, with tolerance
    expect(ratio).toBeGreaterThan(0.18);
    expect(ratio).toBeLessThan(0.32);
  });

  it("given 2 consecutive Protects, when rollProtectSuccess called, then has approximately 1/8 success chance", () => {
    // Source: counter = 2^(2+1) = 8, chance = 1/8
    const rng = new SeededRandom(42);
    let successCount = 0;
    const iterations = 4000;
    for (let i = 0; i < iterations; i++) {
      if (ruleset.rollProtectSuccess(2, rng)) successCount++;
    }
    const ratio = successCount / iterations;
    // Expected: 1/8 = 0.125, with tolerance
    expect(ratio).toBeGreaterThan(0.08);
    expect(ratio).toBeLessThan(0.18);
  });

  it("given 7 consecutive Protects, when rollProtectSuccess called, then has approximately 1/256 success chance (capped)", () => {
    // Source: counter capped at 256 = 2^8, but 2^(7+1) = 256, so chance = 1/256
    const rng = new SeededRandom(42);
    let successCount = 0;
    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      if (ruleset.rollProtectSuccess(7, rng)) successCount++;
    }
    const ratio = successCount / iterations;
    // Expected: 1/256 ~ 0.0039, with wide tolerance due to rarity
    expect(ratio).toBeLessThan(0.02);
  });

  it("given 10 consecutive Protects, when rollProtectSuccess called, then still capped at 1/256", () => {
    // Source: counterMax: 256 in Showdown conditions.ts
    // 2^(10+1) = 2048, but capped at 256, so chance = 1/256
    const rng = new SeededRandom(42);
    let successCount = 0;
    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      if (ruleset.rollProtectSuccess(10, rng)) successCount++;
    }
    const ratio = successCount / iterations;
    // Should be same as 7 consecutive (both capped at 1/256)
    expect(ratio).toBeLessThan(0.02);
  });
});

// --- Speed ---

describe("Gen5 speed resolution", () => {
  const ruleset = new Gen5Ruleset();

  it("given paralyzed pokemon in Gen5 with base 100 speed, when getEffectiveSpeed called, then returns 25 (0.25x)", () => {
    // Source: Bulbapedia -- Paralysis reduces speed to 25% in Gen 1-6 (x0.25)
    // Gen 7+ changed to 50% (x0.5)
    const pokemon = makeActivePokemon({ speed: 100, status: "paralysis" });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(25);
  });

  it("given paralyzed pokemon in Gen5 with base 80 speed, when getEffectiveSpeed called, then returns 20 (0.25x)", () => {
    // Source: Bulbapedia -- Paralysis reduces speed to 25% in Gen 1-6 (x0.25)
    // Triangulation case
    const pokemon = makeActivePokemon({ speed: 80, status: "paralysis" });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(20);
  });

  it("given pokemon with Choice Scarf, when getEffectiveSpeed called, then speed is 1.5x", () => {
    // Source: Choice Scarf effect -- 1.5x speed
    const pokemon = makeActivePokemon({ speed: 100, heldItem: "choice-scarf" });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(150);
  });

  it("given pokemon with Choice Scarf and base 80 speed, when getEffectiveSpeed called, then speed is 120", () => {
    // Source: Choice Scarf effect -- 1.5x speed
    // Triangulation case: floor(80 * 1.5) = 120
    const pokemon = makeActivePokemon({ speed: 80, heldItem: "choice-scarf" });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(120);
  });

  it("given pokemon with Slow Start active (turns 1-5), when getEffectiveSpeed called, then speed is halved", () => {
    // Source: Slow Start ability -- halves speed for first 5 turns
    const pokemon = makeActivePokemon({
      speed: 100,
      ability: "slow-start",
      volatileStatuses: new Map([["slow-start", { turnsLeft: 3 }]]),
    });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(50);
  });

  it("given pokemon with Chlorophyll in Sun, when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Chlorophyll ability -- 2x speed in sun
    const pokemon = makeActivePokemon({ speed: 100, ability: "chlorophyll" });
    (ruleset as any)._currentWeather = "sun";
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    (ruleset as any)._currentWeather = null;
    expect(speed).toBe(200);
  });

  it("given pokemon with Swift Swim in Rain, when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Swift Swim ability -- 2x speed in rain
    const pokemon = makeActivePokemon({ speed: 100, ability: "swift-swim" });
    (ruleset as any)._currentWeather = "rain";
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    (ruleset as any)._currentWeather = null;
    expect(speed).toBe(200);
  });

  it("given pokemon with Sand Rush in Sandstorm, when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Sand Rush ability -- 2x speed in sandstorm
    const pokemon = makeActivePokemon({ speed: 100, ability: "sand-rush" });
    (ruleset as any)._currentWeather = "sand";
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    (ruleset as any)._currentWeather = null;
    expect(speed).toBe(200);
  });

  it("given pokemon with Iron Ball, when getEffectiveSpeed called, then speed is halved", () => {
    // Source: Iron Ball -- halves speed
    const pokemon = makeActivePokemon({ speed: 100, heldItem: "iron-ball" });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(50);
  });

  it("given pokemon with Quick Feet and status, when getEffectiveSpeed called, then speed is 1.5x (not paralysis penalty)", () => {
    // Source: Quick Feet -- 1.5x speed when statused, overrides paralysis penalty
    const pokemon = makeActivePokemon({
      speed: 100,
      ability: "quick-feet",
      status: "paralysis",
    });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(150);
  });

  it("given pokemon with Unburden (item consumed), when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Unburden -- 2x speed when held item consumed
    const pokemon = makeActivePokemon({
      speed: 100,
      ability: "unburden",
      heldItem: null,
      volatileStatuses: new Map([["unburden", { turnsLeft: 99 }]]),
    });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(200);
  });

  it("given pokemon with no modifiers, when getEffectiveSpeed called, then returns base speed", () => {
    // Source: No modifiers = base speed unchanged
    const pokemon = makeActivePokemon({ speed: 120 });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(120);
  });

  it("given pokemon with +1 speed stage, when getEffectiveSpeed called, then applies stage multiplier", () => {
    // Source: Stat stage +1 = 1.5x (3/2)
    const pokemon = makeActivePokemon({ speed: 100, statStages: { speed: 1 } });
    const speed = (ruleset as any).getEffectiveSpeed(pokemon);
    expect(speed).toBe(150);
  });
});

// --- Multi-hit ---

describe("Gen5 multi-hit", () => {
  const ruleset = new Gen5Ruleset();

  it("given pokemon with Skill Link, when rollMultiHitCount is called, then always returns 5", () => {
    // Source: Showdown -- Skill Link always hits 5 times (Gen 5+)
    const rng = new SeededRandom(42);
    const pokemon = makeActivePokemon({ ability: "skill-link" });
    for (let i = 0; i < 50; i++) {
      expect(ruleset.rollMultiHitCount(pokemon, rng)).toBe(5);
    }
  });

  it("given pokemon without Skill Link, when rollMultiHitCount is called, then returns 2-5 with Gen5 distribution", () => {
    // Source: BaseRuleset Gen 5+ distribution: 35/35/15/15% for 2/3/4/5
    const rng = new SeededRandom(42);
    const pokemon = makeActivePokemon({});
    const counts = { 2: 0, 3: 0, 4: 0, 5: 0 };
    const iterations = 2000;
    for (let i = 0; i < iterations; i++) {
      const hits = ruleset.rollMultiHitCount(pokemon, rng);
      expect(hits).toBeGreaterThanOrEqual(2);
      expect(hits).toBeLessThanOrEqual(5);
      counts[hits as 2 | 3 | 4 | 5]++;
    }
    expect(counts[2] / iterations).toBeGreaterThan(0.28);
    expect(counts[2] / iterations).toBeLessThan(0.42);
    expect(counts[3] / iterations).toBeGreaterThan(0.28);
    expect(counts[3] / iterations).toBeLessThan(0.42);
    expect(counts[4] / iterations).toBeGreaterThan(0.08);
    expect(counts[4] / iterations).toBeLessThan(0.22);
    expect(counts[5] / iterations).toBeGreaterThan(0.08);
    expect(counts[5] / iterations).toBeLessThan(0.22);
  });
});

// --- Bind Damage ---

describe("Gen5 bind damage", () => {
  const ruleset = new Gen5Ruleset();

  it("given bound pokemon in Gen5, when calculateBindDamage called with 160 max HP, then takes 20 (1/8)", () => {
    // Source: BaseRuleset Gen 5+ bind damage = 1/8 max HP (increased from 1/16 in Gen 4)
    const pokemon = makeActivePokemon({ maxHp: 160 });
    const damage = ruleset.calculateBindDamage(pokemon);
    expect(damage).toBe(20);
  });

  it("given bound pokemon in Gen5, when calculateBindDamage called with 200 max HP, then takes 25 (1/8)", () => {
    // Source: BaseRuleset Gen 5+ bind damage = 1/8 max HP
    // Triangulation case
    const pokemon = makeActivePokemon({ maxHp: 200 });
    const damage = ruleset.calculateBindDamage(pokemon);
    expect(damage).toBe(25);
  });
});

// --- End-of-Turn Order ---

describe("Gen5 end-of-turn order", () => {
  const ruleset = new Gen5Ruleset();

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then weather-damage comes first", () => {
    // Source: specs/battle/06-gen5.md section 17 -- weather damage is first
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe("weather-damage");
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then status-damage comes after weather-damage", () => {
    // Source: specs/battle/06-gen5.md section 17 -- status damage after weather
    const order = ruleset.getEndOfTurnOrder();
    const weatherIdx = order.indexOf("weather-damage");
    const statusIdx = order.indexOf("status-damage");
    expect(statusIdx).toBeGreaterThan(weatherIdx);
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then perish-song is near end", () => {
    // Source: specs/battle/06-gen5.md section 17 -- Perish Song is one of the last effects
    const order = ruleset.getEndOfTurnOrder();
    const perishIdx = order.indexOf("perish-song");
    expect(perishIdx).toBeGreaterThan(order.indexOf("status-damage"));
    expect(perishIdx).toBeGreaterThan(order.indexOf("leftovers"));
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then includes speed-boost and moody", () => {
    // Source: specs/battle/06-gen5.md section 17 -- Speed Boost and Moody are end-of-turn effects
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("speed-boost");
    expect(order).toContain("moody");
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then leftovers is included", () => {
    // Source: specs/battle/06-gen5.md section 17
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("leftovers");
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then weather-countdown comes after most effects", () => {
    // Source: specs/battle/06-gen5.md section 17 -- weather countdown near end
    const order = ruleset.getEndOfTurnOrder();
    const weatherCdIdx = order.indexOf("weather-countdown");
    expect(weatherCdIdx).toBeGreaterThan(order.indexOf("status-damage"));
  });

  it("given Gen5Ruleset, when getPostAttackResidualOrder called, then returns empty array", () => {
    // Source: Gen 5 (like Gen 3+) has no per-attack residuals; all in Phase 2
    const order = ruleset.getPostAttackResidualOrder();
    expect(order).toEqual([]);
  });
});
