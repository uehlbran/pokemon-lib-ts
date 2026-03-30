import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN5_ABILITY_IDS, GEN5_ITEM_IDS, GEN5_SPECIES_IDS, Gen5Ruleset } from "../src";

const C_ABILITIES = CORE_ABILITY_IDS;
const C_EOT = CORE_END_OF_TURN_EFFECT_IDS;
const C_ITEMS = CORE_ITEM_IDS;
const C_MOVES = CORE_MOVE_IDS;
const C_STATUSES = CORE_STATUS_IDS;
const C_TYPES = CORE_TYPE_IDS;
const C_VOLATILES = CORE_VOLATILE_IDS;
const C_WEATHER = CORE_WEATHER_IDS;
const G_ABILITIES = GEN5_ABILITY_IDS;
const G_ITEMS = GEN5_ITEM_IDS;
const G_SPECIES = GEN5_SPECIES_IDS;

/**
 * Typed accessor for Gen5Ruleset internals under test.
 * getEffectiveSpeed is protected, _currentWeather is private —
 * accessed here via unknown cast to avoid `as any`.
 */
type Gen5RulesetInternals = Gen5Ruleset & {
  getEffectiveSpeed(active: ActivePokemon): number;
  _currentWeather: string | null;
};
function asInternals(r: Gen5Ruleset): Gen5RulesetInternals {
  return r as unknown as Gen5RulesetInternals;
}

/**
 * Helper: create a minimal ActivePokemon mock for ruleset tests.
 */
function createOnFieldPokemon(overrides: {
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
      speciesId: G_SPECIES.charizard,
      nickname: "TestMon",
    },
    ability: overrides.ability ?? C_ABILITIES.blaze,
    types: overrides.types ?? [C_TYPES.normal],
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

function sampleProtectSuccessRate(
  consecutiveProtects: number,
  iterations: number,
  seed: number,
): number {
  const ruleset = new Gen5Ruleset();
  const rng = new SeededRandom(seed);
  return (
    Array.from({ length: iterations }, () =>
      ruleset.rollProtectSuccess(consecutiveProtects, rng),
    ).reduce((successCount, success) => successCount + (success ? 1 : 0), 0) / iterations
  );
}

// --- Protect ---

describe("Gen5 Protect consecutive success", () => {
  const ruleset = new Gen5Ruleset();

  it("given 0 consecutive Protects, when rollProtectSuccess called, then always returns true", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- first use always succeeds
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — first use always succeeds (no RNG)
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given 1 consecutive Protect, when rollProtectSuccess called, then has approximately 1/2 success chance", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- stall condition
    //   onStart sets counter=2 after first successful use
    //   At N=1, onStallMove checks counter=2 → randomChance(1, 2) = 1/2
    const ratio = sampleProtectSuccessRate(1, 2000, 42);
    // Expected: 1/2 = 0.5, with tolerance
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — stall randomChance(1, 2) after first use
    expect(ratio).toBeGreaterThan(0.43);
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — stall randomChance(1, 2) after first use
    expect(ratio).toBeLessThan(0.57);
  });

  it("given 2 consecutive Protects, when rollProtectSuccess called, then has approximately 1/4 success chance", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
    //   At N=2, onRestart doubled counter to 4 → chance = 1/4
    const ratio = sampleProtectSuccessRate(2, 4000, 42);
    // Expected: 1/4 = 0.25, with tolerance
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — counter doubled to 4, randomChance(1, 4)
    expect(ratio).toBeGreaterThan(0.18);
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — counter doubled to 4, randomChance(1, 4)
    expect(ratio).toBeLessThan(0.32);
  });

  it("given 7 consecutive Protects, when rollProtectSuccess called, then has approximately 1/128 success chance", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts
    //   At N=7, counter = 2^7 = 128 (still below cap of 256) → chance = 1/128 ≈ 0.0078
    const ratio = sampleProtectSuccessRate(7, 15000, 42);
    // Expected: 1/128 ~ 0.0078
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — counter = 2^7 = 128, randomChance(1, 128)
    expect(ratio).toBeGreaterThan(0.003);
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — counter = 2^7 = 128, randomChance(1, 128)
    expect(ratio).toBeLessThan(0.016);
  });

  it("given 8 consecutive Protects (cap hit), when rollProtectSuccess called, then has effectively 0% success chance", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- counterMax: 256
    //   At N=8, counter = 2^8 = 256 = cap. Showdown uses randomChance(1, 2**32)
    //   which is ~1 in 4 billion, effectively impossible.
    const successCount = (() => {
      const rng = new SeededRandom(42);
      let count = 0;
      for (let i = 0; i < 10000; i++) {
        if (ruleset.rollProtectSuccess(8, rng)) count++;
      }
      return count;
    })();
    // Expected: ~0 successes (1 in 2^32 chance per attempt)
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — counterMax: 256, uses randomChance(1, 2^32) at cap
    expect(successCount).toBe(0);
  });

  it("given 10 consecutive Protects (beyond cap), when rollProtectSuccess called, then has effectively 0% success chance", () => {
    // Source: Showdown Gen 5 conditions.ts -- counterMax: 256, 2^10=1024 > cap
    //   Still uses randomChance(1, 2**32) since denominator >= 256
    const successCount = (() => {
      const rng = new SeededRandom(42);
      let count = 0;
      for (let i = 0; i < 10000; i++) {
        if (ruleset.rollProtectSuccess(10, rng)) count++;
      }
      return count;
    })();
    // Expected: ~0 successes (1 in 2^32 chance per attempt)
    // Source: Showdown Gen 5 conditions.ts — counterMax: 256, denominator capped, randomChance(1, 2^32) effectively 0
    expect(successCount).toBe(0);
  });

  it("given consecutiveProtects=0, when rollProtectSuccess called, then first use never consumes RNG (always true)", () => {
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts -- first use always succeeds
    // Verifying that consecutiveProtects=0 is a deterministic true, confirming the formula boundary.
    const rng = new SeededRandom(12345);
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — consecutiveProtects=0 always succeeds
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    // Source: references/pokemon-showdown/data/mods/gen5/conditions.ts — consecutiveProtects=0 always succeeds
    expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
  });
});

// --- Speed ---

describe("Gen5 speed resolution", () => {
  const ruleset = new Gen5Ruleset();

  it("given paralyzed pokemon in Gen5 with base 100 speed, when getEffectiveSpeed called, then returns 25 (0.25x)", () => {
    // Source: Bulbapedia -- Paralysis reduces speed to 25% in Gen 1-6 (x0.25)
    // Gen 7+ changed to 50% (x0.5)
    const pokemon = createOnFieldPokemon({ speed: 100, status: C_STATUSES.paralysis });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Paralysis" — speed reduced to 25% in Gen 1-6
    expect(speed).toBe(25);
  });

  it("given paralyzed pokemon in Gen5 with base 80 speed, when getEffectiveSpeed called, then returns 20 (0.25x)", () => {
    // Source: Bulbapedia -- Paralysis reduces speed to 25% in Gen 1-6 (x0.25)
    // Triangulation case
    const pokemon = createOnFieldPokemon({ speed: 80, status: C_STATUSES.paralysis });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Paralysis" — speed reduced to 25% in Gen 1-6 (triangulation: 80*0.25=20)
    expect(speed).toBe(20);
  });

  it("given pokemon with Choice Scarf, when getEffectiveSpeed called, then speed is 1.5x", () => {
    // Source: Choice Scarf effect -- 1.5x speed
    const pokemon = createOnFieldPokemon({ speed: 100, heldItem: G_ITEMS.choiceScarf });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — Choice Scarf item boosts speed by 1.5×
    expect(speed).toBe(150);
  });

  it("given pokemon with Choice Scarf and base 80 speed, when getEffectiveSpeed called, then speed is 120", () => {
    // Source: Choice Scarf effect -- 1.5x speed
    // Triangulation case: floor(80 * 1.5) = 120
    const pokemon = createOnFieldPokemon({ speed: 80, heldItem: G_ITEMS.choiceScarf });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — Choice Scarf 1.5× speed (triangulation: floor(80*1.5)=120)
    expect(speed).toBe(120);
  });

  it("given pokemon with Slow Start active (turns 1-5), when getEffectiveSpeed called, then speed is halved", () => {
    // Source: Slow Start ability -- halves speed for first 5 turns
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.slowStart,
      volatileStatuses: new Map([[C_ABILITIES.slowStart, { turnsLeft: 3 }]]),
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — Slow Start ability halves speed for first 5 turns
    expect(speed).toBe(50);
  });

  it("given pokemon with Chlorophyll in Sun, when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Chlorophyll ability -- 2x speed in sun
    const pokemon = createOnFieldPokemon({ speed: 100, ability: G_ABILITIES.chlorophyll });
    asInternals(ruleset)._currentWeather = C_WEATHER.sun;
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    asInternals(ruleset)._currentWeather = null;
    // Source: Showdown Gen 5 — Chlorophyll ability doubles speed in sun
    expect(speed).toBe(200);
  });

  it("given pokemon with Swift Swim in Rain, when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Swift Swim ability -- 2x speed in rain
    const pokemon = createOnFieldPokemon({ speed: 100, ability: G_ABILITIES.swiftSwim });
    asInternals(ruleset)._currentWeather = C_WEATHER.rain;
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    asInternals(ruleset)._currentWeather = null;
    // Source: Showdown Gen 5 — Swift Swim ability doubles speed in rain
    expect(speed).toBe(200);
  });

  it("given pokemon with Sand Rush in Sandstorm, when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Sand Rush ability -- 2x speed in sandstorm
    const pokemon = createOnFieldPokemon({ speed: 100, ability: G_ABILITIES.sandRush });
    asInternals(ruleset)._currentWeather = C_WEATHER.sand;
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    asInternals(ruleset)._currentWeather = null;
    // Source: Showdown Gen 5 — Sand Rush ability doubles speed in sandstorm
    expect(speed).toBe(200);
  });

  it("given pokemon with Iron Ball, when getEffectiveSpeed called, then speed is halved", () => {
    // Source: Iron Ball -- halves speed
    const pokemon = createOnFieldPokemon({ speed: 100, heldItem: C_ITEMS.ironBall });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — Iron Ball item halves holder's speed
    expect(speed).toBe(50);
  });

  it("given pokemon with Quick Feet and status, when getEffectiveSpeed called, then speed is 1.5x (not paralysis penalty)", () => {
    // Source: Quick Feet -- 1.5x speed when statused, overrides paralysis penalty
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: G_ABILITIES.quickFeet,
      status: C_STATUSES.paralysis,
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — Quick Feet ability boosts speed 1.5× when statused, overrides paralysis penalty
    expect(speed).toBe(150);
  });

  it("given pokemon with Unburden (item consumed), when getEffectiveSpeed called, then speed is doubled", () => {
    // Source: Unburden -- 2x speed when held item consumed
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.unburden,
      heldItem: null,
      volatileStatuses: new Map([[C_VOLATILES.unburden, { turnsLeft: 99 }]]),
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — Unburden ability doubles speed when held item is consumed
    expect(speed).toBe(200);
  });

  it("given pokemon with no modifiers, when getEffectiveSpeed called, then returns base speed", () => {
    // Source: No modifiers = base speed unchanged
    const pokemon = createOnFieldPokemon({ speed: 120 });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — no modifiers, effective speed equals base stat
    expect(speed).toBe(120);
  });

  it("given pokemon with +1 speed stage, when getEffectiveSpeed called, then applies stage multiplier", () => {
    // Source: Stat stage +1 = 1.5x (3/2)
    const pokemon = createOnFieldPokemon({ speed: 100, statStages: { speed: 1 } });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Showdown Gen 5 — stat stage +1 multiplier = (2+1)/2 = 1.5×
    expect(speed).toBe(150);
  });

  // --- Simple ability ---

  it("given pokemon with Simple ability and +2 speed stage, when getEffectiveSpeed called, then speed multiplier is as if stage is +4", () => {
    // Source: Bulbapedia -- Simple doubles stat stage effects
    // +2 doubled = +4, multiplier = (2+4)/2 = 3.0, floor(100 * 3.0) = 300
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.simple,
      statStages: { speed: 2 },
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Simple (ability)" — Simple doubles stat stage effects, +2→+4, multiplier 3.0
    expect(speed).toBe(300);
  });

  it("given pokemon with Simple ability and +4 speed stage, when getEffectiveSpeed called, then stage is clamped to +6 (not +8)", () => {
    // Source: Bulbapedia -- Simple doubles stat stage effects, clamped to [-6, +6]
    // +4 doubled = +8, clamped to +6, multiplier = (2+6)/2 = 4.0, floor(100 * 4.0) = 400
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.simple,
      statStages: { speed: 4 },
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Simple (ability)" — +4 doubled=+8, clamped to +6, multiplier (2+6)/2=4.0
    expect(speed).toBe(400);
  });

  it("given pokemon with Simple ability and -2 speed stage, when getEffectiveSpeed called, then speed multiplier is as if stage is -4", () => {
    // Source: Bulbapedia -- Simple doubles stat stage effects
    // -2 doubled = -4, multiplier = 2/(2+4) = 2/6 = 0.333..., floor(100 * 0.333...) = 33
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.simple,
      statStages: { speed: -2 },
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Simple (ability)" — -2 doubled=-4, multiplier 2/(2+4)=0.333, floor(100*0.333)=33
    expect(speed).toBe(33);
  });

  // --- Klutz ability ---

  it("given pokemon with Klutz ability holding Choice Scarf, when getEffectiveSpeed called, then Choice Scarf does NOT apply", () => {
    // Source: Bulbapedia -- Klutz prevents holder's items from taking effect
    // Speed should remain at base 100, not 150
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.klutz,
      heldItem: G_ITEMS.choiceScarf,
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Klutz (ability)" — suppresses holder's item effects including Choice Scarf
    expect(speed).toBe(100);
  });

  it("given pokemon with Klutz ability holding Iron Ball, when getEffectiveSpeed called, then Iron Ball does NOT apply", () => {
    // Source: Bulbapedia -- Klutz prevents holder's items from taking effect
    // Speed should remain at base 100, not 50
    const pokemon = createOnFieldPokemon({
      speed: 100,
      ability: C_ABILITIES.klutz,
      heldItem: C_ITEMS.ironBall,
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Klutz (ability)" — suppresses holder's item effects including Iron Ball
    expect(speed).toBe(100);
  });

  it("given pokemon with Klutz ability holding Choice Scarf and base 80 speed, when getEffectiveSpeed called, then returns 80 (item suppressed)", () => {
    // Source: Bulbapedia -- Klutz prevents holder's items from taking effect
    // Triangulation: different base speed to confirm Klutz suppresses the item
    const pokemon = createOnFieldPokemon({
      speed: 80,
      ability: C_ABILITIES.klutz,
      heldItem: G_ITEMS.choiceScarf,
    });
    const speed = asInternals(ruleset).getEffectiveSpeed(pokemon);
    // Source: Bulbapedia "Klutz (ability)" — suppresses Choice Scarf, triangulation with base 80 speed
    expect(speed).toBe(80);
  });
});

// --- Status Damage ---

describe("Gen5 status damage abilities", () => {
  const ruleset = new Gen5Ruleset();

  it("given pokemon with Magic Guard and burn status, when applyStatusDamage called, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including burn
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      ability: G_ABILITIES.magicGuard,
      status: C_STATUSES.burn,
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.burn, state);
    // Source: Bulbapedia "Magic Guard" — prevents all indirect damage including burn
    expect(damage).toBe(0);
  });

  it("given pokemon with Magic Guard and badly-poisoned status, when applyStatusDamage called, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including toxic
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      ability: G_ABILITIES.magicGuard,
      status: C_STATUSES.badlyPoisoned,
      volatileStatuses: new Map([
        [C_VOLATILES.toxicCounter, { turnsLeft: 99, data: { counter: 3 } }],
      ]),
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.badlyPoisoned, state);
    // Source: Bulbapedia "Magic Guard" — prevents all indirect damage including toxic
    expect(damage).toBe(0);
  });

  it("given pokemon with Magic Guard and poison status, when applyStatusDamage called, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including poison
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      ability: G_ABILITIES.magicGuard,
      status: C_STATUSES.poison,
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.poison, state);
    // Source: Bulbapedia "Magic Guard" — prevents all indirect damage including poison
    expect(damage).toBe(0);
  });

  it("given pokemon with Heatproof and burn status with 200 max HP, when applyStatusDamage called, then returns 12 (floor(200/16))", () => {
    // Source: Bulbapedia -- Heatproof halves damage from burn: 1/8 -> 1/16
    // floor(200/16) = 12
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      ability: G_ABILITIES.heatproof,
      status: C_STATUSES.burn,
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.burn, state);
    // Source: Bulbapedia "Heatproof (ability)" — halves burn damage from 1/8 to 1/16; floor(200/16)=12
    expect(damage).toBe(12);
  });

  it("given pokemon with Heatproof and burn status with 160 max HP, when applyStatusDamage called, then returns 10 (floor(160/16))", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage: 1/8 -> 1/16
    // Triangulation: floor(160/16) = 10
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      ability: G_ABILITIES.heatproof,
      status: C_STATUSES.burn,
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.burn, state);
    // Source: Bulbapedia "Heatproof (ability)" — halves burn damage from 1/8 to 1/16; floor(160/16)=10
    expect(damage).toBe(10);
  });

  it("given pokemon with no relevant ability and burn status with 200 max HP, when applyStatusDamage called, then returns 25 (floor(200/8))", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage = maxhp/8
    // floor(200/8) = 25
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      status: C_STATUSES.burn,
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.burn, state);
    // Source: Showdown sim/battle-actions.ts — Gen < 7 burn damage = maxhp/8; floor(200/8)=25
    expect(damage).toBe(25);
  });

  it("given pokemon with no relevant ability and burn status with 160 max HP, when applyStatusDamage called, then returns 20 (floor(160/8))", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage = maxhp/8
    // Triangulation: floor(160/8) = 20
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      status: C_STATUSES.burn,
    });
    const state = {} as BattleState;
    const damage = ruleset.applyStatusDamage(pokemon, C_STATUSES.burn, state);
    // Source: Showdown sim/battle-actions.ts — Gen < 7 burn damage = maxhp/8; floor(160/8)=20
    expect(damage).toBe(20);
  });
});

// --- Multi-hit ---

describe("Gen5 multi-hit", () => {
  const ruleset = new Gen5Ruleset();

  it("given pokemon with Skill Link, when rollMultiHitCount is called, then always returns 5", () => {
    // Source: Showdown -- Skill Link always hits 5 times (Gen 5+)
    const rng = new SeededRandom(42);
    const pokemon = createOnFieldPokemon({ ability: C_ABILITIES.skillLink });
    for (let i = 0; i < 50; i++) {
      // Source: Showdown Gen 5 — Skill Link always produces maximum 5 hits
      expect(ruleset.rollMultiHitCount(pokemon, rng)).toBe(5);
    }
  });

  it("given pokemon without Skill Link, when rollMultiHitCount is called, then returns 2-5 with Gen5 distribution", () => {
    // Source: BaseRuleset Gen 5+ distribution: 35/35/15/15% for 2/3/4/5
    const rng = new SeededRandom(42);
    const pokemon = createOnFieldPokemon({});
    const counts = { 2: 0, 3: 0, 4: 0, 5: 0 };
    const iterations = 2000;
    for (let i = 0; i < iterations; i++) {
      const hits = ruleset.rollMultiHitCount(pokemon, rng);
      // Source: Showdown Gen 5 — multi-hit moves hit 2-5 times
      expect(hits).toBeGreaterThanOrEqual(2);
      // Source: Showdown Gen 5 — multi-hit moves hit 2-5 times
      expect(hits).toBeLessThanOrEqual(5);
      counts[hits as 2 | 3 | 4 | 5]++;
    }
    // Source: Showdown Gen 5 — multi-hit distribution: 35% 2-hits, 35% 3-hits, 15% 4-hits, 15% 5-hits
    expect(counts[2] / iterations).toBeGreaterThan(0.28);
    // Source: Showdown Gen 5 — multi-hit distribution: 35% 2-hits upper bound
    expect(counts[2] / iterations).toBeLessThan(0.42);
    // Source: Showdown Gen 5 — multi-hit distribution: 35% 3-hits lower bound
    expect(counts[3] / iterations).toBeGreaterThan(0.28);
    // Source: Showdown Gen 5 — multi-hit distribution: 35% 3-hits upper bound
    expect(counts[3] / iterations).toBeLessThan(0.42);
    // Source: Showdown Gen 5 — multi-hit distribution: 15% 4-hits lower bound
    expect(counts[4] / iterations).toBeGreaterThan(0.08);
    // Source: Showdown Gen 5 — multi-hit distribution: 15% 4-hits upper bound
    expect(counts[4] / iterations).toBeLessThan(0.22);
    // Source: Showdown Gen 5 — multi-hit distribution: 15% 5-hits lower bound
    expect(counts[5] / iterations).toBeGreaterThan(0.08);
    // Source: Showdown Gen 5 — multi-hit distribution: 15% 5-hits upper bound
    expect(counts[5] / iterations).toBeLessThan(0.22);
  });
});

// --- Bind Damage ---

describe("Gen5 bind damage", () => {
  const ruleset = new Gen5Ruleset();

  it("given bound pokemon in Gen5, when calculateBindDamage called with 160 max HP, then takes 20 (1/8)", () => {
    // Source: BaseRuleset Gen 5+ bind damage = 1/8 max HP (increased from 1/16 in Gen 4)
    const pokemon = createOnFieldPokemon({ maxHp: 160 });
    const damage = ruleset.calculateBindDamage(pokemon);
    // Source: Showdown Gen 5 — bind/wrap damage increased to 1/8 maxHP (from 1/16 in Gen 4)
    expect(damage).toBe(20);
  });

  it("given bound pokemon in Gen5, when calculateBindDamage called with 200 max HP, then takes 25 (1/8)", () => {
    // Source: BaseRuleset Gen 5+ bind damage = 1/8 max HP
    // Triangulation case
    const pokemon = createOnFieldPokemon({ maxHp: 200 });
    const damage = ruleset.calculateBindDamage(pokemon);
    // Source: Showdown Gen 5 — bind/wrap damage 1/8 maxHP (triangulation: floor(200/8)=25)
    expect(damage).toBe(25);
  });
});

// --- End-of-Turn Order ---

describe("Gen5 end-of-turn order", () => {
  const ruleset = new Gen5Ruleset();

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then weather-damage comes first", () => {
    // Source: specs/battle/06-gen5.md section 17 -- weather damage is first
    const order = ruleset.getEndOfTurnOrder();
    // Source: Showdown Gen 5 — weather damage fires first in end-of-turn sequence
    expect(order[0]).toBe(C_EOT.weatherDamage);
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then status-damage comes after weather-damage", () => {
    // Source: specs/battle/06-gen5.md section 17 -- status damage after weather
    const order = ruleset.getEndOfTurnOrder();
    const weatherIdx = order.indexOf(C_EOT.weatherDamage);
    const statusIdx = order.indexOf(C_EOT.statusDamage);
    // Source: Showdown Gen 5 — status damage follows weather damage in end-of-turn order
    expect(statusIdx).toBeGreaterThan(weatherIdx);
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then perish-song is near end", () => {
    // Source: specs/battle/06-gen5.md section 17 -- Perish Song is one of the last effects
    const order = ruleset.getEndOfTurnOrder();
    const perishIdx = order.indexOf(C_MOVES.perishSong);
    // Source: Showdown Gen 5 — Perish Song countdown occurs after status damage in EOT
    expect(perishIdx).toBeGreaterThan(order.indexOf(C_EOT.statusDamage));
    // Source: Showdown Gen 5 — Perish Song countdown occurs after Leftovers in EOT
    expect(perishIdx).toBeGreaterThan(order.indexOf(C_ITEMS.leftovers));
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then includes speed-boost and moody", () => {
    // Source: specs/battle/06-gen5.md section 17 -- Speed Boost and Moody are end-of-turn effects
    const order = ruleset.getEndOfTurnOrder();
    // Source: Showdown Gen 5 — Speed Boost triggers at end of turn
    expect(order).toContain(C_ABILITIES.speedBoost);
    // Source: Showdown Gen 5 — Moody triggers at end of turn
    expect(order).toContain(C_ABILITIES.moody);
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then leftovers is included", () => {
    // Source: specs/battle/06-gen5.md section 17
    const order = ruleset.getEndOfTurnOrder();
    // Source: Showdown Gen 5 — Leftovers heals at end of turn
    expect(order).toContain(C_ITEMS.leftovers);
  });

  it("given Gen5Ruleset, when getEndOfTurnOrder called, then weather-countdown comes after most effects", () => {
    // Source: specs/battle/06-gen5.md section 17 -- weather countdown near end
    const order = ruleset.getEndOfTurnOrder();
    const weatherCdIdx = order.indexOf(C_EOT.weatherCountdown);
    // Source: Showdown Gen 5 — weather turn countdown occurs near end of EOT order
    expect(weatherCdIdx).toBeGreaterThan(order.indexOf(C_EOT.statusDamage));
  });

  it("given Gen5Ruleset, when getPostAttackResidualOrder called, then returns empty array", () => {
    // Source: Gen 5 (like Gen 3+) has no per-attack residuals; all in Phase 2
    const order = ruleset.getPostAttackResidualOrder();
    // Source: Showdown Gen 5 — no post-attack residuals; all EOT effects in main phase
    expect(order).toEqual([]);
  });
});
