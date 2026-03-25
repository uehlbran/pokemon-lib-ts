/**
 * Gen 4 Mechanics Audit Regression Tests
 *
 * Verifies Gen 4-specific mechanics:
 *   - Paralysis speed penalty: 0.25x (NOT 0.5x like Gen 7+)
 *   - Burn damage: 1/8 max HP (NOT 1/16 like Gen 7+)
 *   - Sleep turns: rollSleepTurns returns 1-4 effective turns
 *     (NOT 1-5 as the class header comment erroneously states — see issue #554)
 *   - Protect formula: halving, capped at 12.5% (NOT the 1/256 cap of Gen 5)
 *   - Crit multiplier: 2.0x (NOT 1.5x like Gen 6+)
 *   - Magic Guard prevents burn/poison damage in Gen 4
 *
 * Source authority:
 *   - pret/pokeplatinum (where decompiled — verified for Protect formula)
 *   - Showdown data/mods/gen4/conditions.ts (primary authority)
 *
 * Issue refs: #554 (Gen4 class comment says "1-5 turns" but actual range is 1-4)
 */

import type { ActivePokemon, BattleState, CritContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
  Gen4Ruleset,
} from "../src";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const gen4Data = createGen4DataManager();
const DEFAULT_SPECIES = gen4Data.getSpecies(GEN4_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE = gen4Data.getNature(GEN4_NATURE_IDS.hardy);
const DEFAULT_BATTLE_TYPES = [CORE_TYPE_IDS.normal];
const DEFAULT_POKEBALL = GEN4_ITEM_IDS.pokeBall;
const GEN4_ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS };
const STATUS_IDS = CORE_STATUS_IDS;
const END_OF_TURN_EFFECT_IDS = CORE_END_OF_TURN_EFFECT_IDS;

function createActiveBattler(overrides: {
  maxHp?: number;
  speed?: number;
  status?: string | null;
  ability?: string;
  heldItem?: string | null;
  types?: string[];
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const speed = overrides.speed ?? 100;
  if (maxHp < 1) {
    throw new Error(`Test battler maxHp must be positive, got ${maxHp}`);
  }
  if (speed < 1) {
    throw new Error(`Test battler speed must be positive, got ${speed}`);
  }
  return {
    pokemon: {
      uid: "gen4-audit-battler",
      speciesId: DEFAULT_SPECIES.id,
      nickname: DEFAULT_SPECIES.displayName,
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE.id,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      ability: overrides.ability ?? GEN4_ABILITIES.blaze,
      abilitySlot: "normal1" as const,
      friendship: 0,
      gender: "male" as const,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: DEFAULT_POKEBALL,
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed,
      },
      currentHp: maxHp,
      status: overrides.status ?? null,
      heldItem: overrides.heldItem ?? null,
    },
    ability: overrides.ability ?? GEN4_ABILITIES.blaze,
    types: overrides.types ?? DEFAULT_BATTLE_TYPES,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses:
      (overrides.volatileStatuses as Map<
        import("@pokemon-lib-ts/core").VolatileStatus,
        { turnsLeft: number; data?: Record<string, unknown> }
      >) ?? new Map(),
    consecutiveProtects: 0,
  } as unknown as ActivePokemon;
}

function makeState(): BattleState {
  return {} as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Gen 4 Paralysis Speed Penalty
// ---------------------------------------------------------------------------

describe("Gen4Ruleset paralysis speed penalty (0.25x)", () => {
  const ruleset = new Gen4Ruleset();

  it("given a paralyzed Pokemon with 100 base speed in Gen4, when getEffectiveSpeed is called, then returns 25 (0.25x)", () => {
    // Source: pret/pokeplatinum — paralyzed speed = speed / 4 = 0.25x
    // Source: Showdown data/mods/gen4/conditions.ts lines 9-13 —
    //   par.onModifySpe: if (!quick-feet) return chainModify(0.25)
    // Gen 3-6 all use 0.25x. Gen 7+ uses 0.5x (BaseRuleset default).
    const pokemon = createActiveBattler({ speed: 100, status: STATUS_IDS.paralysis });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(25);
  });

  it("given a paralyzed Pokemon with 80 base speed in Gen4, when getEffectiveSpeed is called, then returns 20 (0.25x)", () => {
    // Source: pret/pokeplatinum — paralysis quarters speed
    // Triangulation: floor(80 * 0.25) = 20
    const pokemon = createActiveBattler({ speed: 80, status: STATUS_IDS.paralysis });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(20);
  });

  it("given a paralyzed Quick Feet Pokemon in Gen4, when getEffectiveSpeed is called, then returns 150 (1.5x, no penalty)", () => {
    // Source: Showdown data/mods/gen4/conditions.ts lines 9-13 — Quick Feet skips the 0.25x penalty
    // Source: Bulbapedia -- Quick Feet: "Boosts Speed by 50%; Speed drop from paralysis ignored."
    // Quick Feet is new in Gen 4. At 100 speed: 100 * 1.5 = 150
    const pokemon = createActiveBattler({
      speed: 100,
      status: STATUS_IDS.paralysis,
      ability: GEN4_ABILITIES.quickFeet,
    });
    const speed = (
      ruleset as unknown as { getEffectiveSpeed: (p: ActivePokemon) => number }
    ).getEffectiveSpeed(pokemon);
    expect(speed).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Gen 4 Burn Damage
// ---------------------------------------------------------------------------

describe("Gen4Ruleset burn damage (1/8 maxHP)", () => {
  const ruleset = new Gen4Ruleset();

  it("given a burned Pokemon with 200 maxHP in Gen4, when applyStatusDamage is called, then returns 25 (floor(200/8))", () => {
    // Source: pret/pokeplatinum — burn tick = maxHP / 8
    // Gen 3-6: 1/8 max HP. Gen 7+: 1/16 (BaseRuleset default).
    const pokemon = createActiveBattler({ maxHp: 200 });
    const damage = ruleset.applyStatusDamage(pokemon, STATUS_IDS.burn, makeState());
    expect(damage).toBe(25);
  });

  it("given a burned Pokemon with 160 maxHP in Gen4, when applyStatusDamage is called, then returns 20 (floor(160/8))", () => {
    // Source: pret/pokeplatinum — burn = maxHP / 8
    // Triangulation: floor(160/8) = 20
    const pokemon = createActiveBattler({ maxHp: 160 });
    const damage = ruleset.applyStatusDamage(pokemon, STATUS_IDS.burn, makeState());
    expect(damage).toBe(20);
  });

  it("given a burned Magic Guard Pokemon with 200 maxHP in Gen4, when applyStatusDamage is called, then returns 0", () => {
    // Source: Showdown Gen 4 -- Magic Guard prevents burn damage
    // Source: Bulbapedia -- Magic Guard (Gen 4 introduction): "prevents all indirect damage"
    const pokemon = createActiveBattler({ maxHp: 200, ability: GEN4_ABILITIES.magicGuard });
    const damage = ruleset.applyStatusDamage(pokemon, STATUS_IDS.burn, makeState());
    expect(damage).toBe(0);
  });

  it("given a burned Heatproof Pokemon with 200 maxHP in Gen4, when applyStatusDamage is called, then returns 12 (1/16)", () => {
    // Source: Showdown Gen4 data/mods/gen4/ -- Heatproof halves burn damage in Gen 4
    // floor(200/16) = 12
    const pokemon = createActiveBattler({ maxHp: 200, ability: GEN4_ABILITIES.heatproof });
    const damage = ruleset.applyStatusDamage(pokemon, STATUS_IDS.burn, makeState());
    expect(damage).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Gen 4 Sleep Turns (REGRESSION #554: class comment says "1-5" but code returns 1-4)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset sleep turns (rollSleepTurns returns 1-4, NOT 1-5)", () => {
  const ruleset = new Gen4Ruleset();

  it("given Gen4 sleep with seed 42, when rollSleepTurns called 500 times, then all values are in [1, 4]", () => {
    // REGRESSION #554: The Gen4Ruleset class header comment (line 62) erroneously says
    //   "rollSleepTurns — 1-5 turns" but the implementation returns rng.int(1, 4) = 1-4.
    //
    // Source: Showdown data/mods/gen4/conditions.ts line 32 —
    //   this.effectState.time = this.random(2, 6); // 2-5 inclusive
    //   Each turn, time decrements before check. time=2 → 1 effective turn. time=5 → 4 effective turns.
    //   So 1-4 effective sleep turns.
    // Our rollSleepTurns returns turnsLeft directly (1-4), which is equivalent.
    const rng = new SeededRandom(42);
    const values = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(4);
      values.add(turns);
    }
    // All four values should appear in 500 trials
    expect(values.has(1)).toBe(true);
    expect(values.has(2)).toBe(true);
    expect(values.has(3)).toBe(true);
    expect(values.has(4)).toBe(true);
    // No 5-turn sleep in Gen 4 international (despite the wrong class comment)
    expect(values.has(5)).toBe(false);
    expect(values.has(0)).toBe(false);
  });

  it("given Gen4 sleep with seed 8888, when rollSleepTurns called, then never returns 5 or more", () => {
    // Source: Showdown data/mods/gen4/conditions.ts -- maximum counter is 5, yielding 4 effective turns
    // Triangulation case confirming the upper bound
    const rng = new SeededRandom(8888);
    for (let i = 0; i < 200; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeLessThanOrEqual(4); // NOT 5 -- the class comment is wrong, the code is right
      expect(turns).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Gen 4 Protect Formula
// ---------------------------------------------------------------------------

describe("Gen4Ruleset rollProtectSuccess (halving, capped at 12.5%)", () => {
  const ruleset = new Gen4Ruleset();

  it("given 0 consecutive protects in Gen4, when rollProtectSuccess called 20 times, then always returns true", () => {
    // Source: pret/pokeplatinum battle_script.c:5351-5356 — sProtectSuccessRate[0] = 0xFFFF = 100%
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      expect(ruleset.rollProtectSuccess(0, rng)).toBe(true);
    }
  });

  it("given 1 consecutive protect in Gen4, when rollProtectSuccess called 10000 times, then ~50% success rate", () => {
    // Source: pret/pokeplatinum -- sProtectSuccessRate[1] = 0x7FFF ≈ 50% (0x7FFF/0xFFFF)
    const rng = new SeededRandom(42);
    let successes = 0;
    for (let i = 0; i < 10000; i++) {
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    const rate = successes / 10000;
    expect(rate).toBeGreaterThan(0.47);
    expect(rate).toBeLessThan(0.53);
  });

  it("given 3+ consecutive protects in Gen4, when rollProtectSuccess called, then success rate is ~12.5% (cap)", () => {
    // Source: VERIFIED pret/pokeplatinum battle_script.c:5351-5356
    //   sProtectSuccessRate has exactly 4 entries (0xFFFF, 0x7FFF, 0x3FFF, 0x1FFF)
    //   Counter caps at index 3 (line 5405). Minimum is 12.5% = 1/8.
    const rng = new SeededRandom(42);
    let successes = 0;
    for (let i = 0; i < 10000; i++) {
      if (ruleset.rollProtectSuccess(3, rng)) successes++;
    }
    const rate = successes / 10000;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.16);
  });

  it("given 5 consecutive protects (beyond cap), when rollProtectSuccess called, then same rate as 3 consecutive", () => {
    // Source: pret/pokeplatinum -- counter caps at 3; any higher consecutive count uses same 1/8 rate
    // Gen 4 NEVER reduces below 12.5%, unlike Gen 5 which continues doubling (down to 1/256)
    const rng3 = new SeededRandom(42);
    const rng5 = new SeededRandom(42); // same seed for identical sequence
    let s3 = 0;
    let s5 = 0;
    for (let i = 0; i < 5000; i++) {
      if (ruleset.rollProtectSuccess(3, rng3)) s3++;
      if (ruleset.rollProtectSuccess(5, rng5)) s5++;
    }
    expect(s3).toBe(s5);
  });
});

// ---------------------------------------------------------------------------
// Gen 4 Crit Multiplier
// ---------------------------------------------------------------------------

describe("Gen4Ruleset crit multiplier (2.0x, not Gen6+ 1.5x)", () => {
  const ruleset = new Gen4Ruleset();

  it("given Gen4, when getCritMultiplier is called, then returns 2.0", () => {
    // Source: Showdown data/mods/gen4/ -- no crit multiplier override; Gen 3-5 all use 2x
    // Source: Bulbapedia -- Gen 3-5: Critical hit = 2x damage. Gen 6+: 1.5x.
    const context = {} as CritContext;
    const mult = ruleset.getCritMultiplier(context);
    expect(mult).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// Gen 4 End-of-Turn Order Sanity Checks
// ---------------------------------------------------------------------------

describe("Gen4Ruleset getEndOfTurnOrder", () => {
  const ruleset = new Gen4Ruleset();

  it("given Gen4, when getEndOfTurnOrder is called, then weather-damage is first", () => {
    // Source: Showdown Gen 4 mod -- weather damage before everything else
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe(END_OF_TURN_EFFECT_IDS.weatherDamage);
  });

  it("given Gen4, when getEndOfTurnOrder is called, then leech-seed comes before leftovers", () => {
    // Source: Showdown Gen 4 -- Leech Seed drains before Leftovers recovers
    const order = ruleset.getEndOfTurnOrder();
    const leechIdx = order.indexOf(CORE_MOVE_IDS.leechSeed);
    const leftoversIdx = order.indexOf(END_OF_TURN_EFFECT_IDS.leftovers);
    expect(leechIdx).not.toBe(-1);
    expect(leftoversIdx).not.toBe(-1);
    expect(leechIdx).toBeLessThan(leftoversIdx);
  });

  it("given Gen4, when getEndOfTurnOrder is called, then poison-heal comes before status-damage", () => {
    // Source: Showdown Gen 4 -- Poison Heal replaces poison damage, so it fires before status-damage
    const order = ruleset.getEndOfTurnOrder();
    const phIdx = order.indexOf(GEN4_ABILITIES.poisonHeal);
    const sdIdx = order.indexOf(END_OF_TURN_EFFECT_IDS.statusDamage);
    expect(phIdx).not.toBe(-1);
    expect(sdIdx).not.toBe(-1);
    expect(phIdx).toBeLessThan(sdIdx);
  });

  it("given Gen4, when getEndOfTurnOrder is called, then includes black-sludge (Gen 4 introduction)", () => {
    // Source: Bulbapedia -- Black Sludge introduced in Gen 4 (Platinum)
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(GEN4_ITEM_IDS.blackSludge);
  });
});
