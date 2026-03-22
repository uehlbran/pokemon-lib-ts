/**
 * Gen 9 EXP formula tests.
 *
 * Gen 9 uses the same simplified formula as Gen 7-8 (no sqrt-based level scaling):
 *   Step 1: base = floor((baseExp * defeatedLevel) / (5 * participantCount))
 *   Step 2: if trainer battle: floor(base * 1.5)
 *   Step 3: if Lucky Egg: floor(base * 1.5)
 *   Step 4: if traded: floor(base * 1.5 or 1.7)
 *   Minimum: 1
 *
 * Key Gen 9 difference: EXP Share is ALWAYS active (same as Gen 8) -- cannot be toggled off.
 * The formula itself is unchanged; the engine always passes hasExpShare=true.
 *
 * Source: Showdown sim/battle.ts -- Gen 9 EXP formula (same as Gen 7-8)
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_IX
 */
import type { ExpContext } from "@pokemon-lib-ts/battle";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen9Ruleset } from "../src/Gen9Ruleset";

// ---------------------------------------------------------------------------
// Helper: create an ExpContext with defaults
// ---------------------------------------------------------------------------
function makeExpContext(overrides: Partial<ExpContext> = {}): ExpContext {
  return {
    defeatedLevel: overrides.defeatedLevel ?? 50,
    defeatedSpecies: overrides.defeatedSpecies ?? ({ baseExp: 100 } as any),
    participantLevel: overrides.participantLevel ?? 50,
    participantCount: overrides.participantCount ?? 1,
    isTrainerBattle: overrides.isTrainerBattle ?? false,
    hasLuckyEgg: overrides.hasLuckyEgg ?? false,
    hasExpShare: overrides.hasExpShare ?? false,
    affectionBonus: overrides.affectionBonus ?? false,
  } as ExpContext;
}

// ---------------------------------------------------------------------------
// Gen9Ruleset -- calculateExpGain base formula
// ---------------------------------------------------------------------------

describe("Gen9Ruleset -- calculateExpGain base formula", () => {
  const ruleset = new Gen9Ruleset(new DataManager());

  it("given wild battle at L50 with baseExp=100, when calculating EXP, then returns 1000", () => {
    // Source: Bulbapedia Gen IX EXP formula -- same simplified formula as Gen VII-VIII
    // base = floor((100 * 50) / (5 * 1)) = floor(5000 / 5) = 1000
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1000);
  });

  it("given wild battle at L30 with baseExp=142, when calculating EXP, then returns 852", () => {
    // Source: Bulbapedia Gen IX EXP formula
    // base = floor((142 * 30) / (5 * 1)) = floor(4260 / 5) = floor(852) = 852
    const context = makeExpContext({
      defeatedLevel: 30,
      defeatedSpecies: { baseExp: 142 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(852);
  });

  it("given wild battle at L100 with baseExp=255, when calculating EXP, then returns 5100", () => {
    // Source: Bulbapedia Gen IX EXP formula
    // base = floor((255 * 100) / (5 * 1)) = floor(25500 / 5) = 5100
    const context = makeExpContext({
      defeatedLevel: 100,
      defeatedSpecies: { baseExp: 255 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(5100);
  });

  it("given Gen 9 EXP formula, when varying participant level, then result does NOT change (no sqrt scaling)", () => {
    // Source: Bulbapedia Gen IX -- Gen 7+ removed the sqrt-based scaling
    // Participant level is irrelevant to the formula
    const ctx1 = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const ctx2 = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 20,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    expect(ruleset.calculateExpGain(ctx1)).toBe(ruleset.calculateExpGain(ctx2));
  });
});

// ---------------------------------------------------------------------------
// Gen9Ruleset -- calculateExpGain modifiers
// ---------------------------------------------------------------------------

describe("Gen9Ruleset -- calculateExpGain modifiers", () => {
  const ruleset = new Gen9Ruleset(new DataManager());

  it("given a trainer battle, when calculating EXP, then applies 1.5x multiplier", () => {
    // Source: Bulbapedia -- Trainer battles give 1.5x EXP
    // base = floor((100 * 50) / 5) = 1000
    // trainer: floor(1000 * 1.5) = 1500
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      isTrainerBattle: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1500);
  });

  it("given a wild battle with Lucky Egg, when calculating EXP, then applies 1.5x multiplier", () => {
    // Source: Bulbapedia -- Lucky Egg gives 1.5x EXP
    // base = 1000
    // Lucky Egg: floor(1000 * 1.5) = 1500
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      hasLuckyEgg: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1500);
  });

  it("given trainer battle with Lucky Egg, when calculating EXP, then applies both multipliers sequentially floored", () => {
    // Source: Bulbapedia -- multipliers are applied sequentially with floor between each
    // base = floor((100 * 50) / 5) = 1000
    // trainer: floor(1000 * 1.5) = 1500
    // Lucky Egg: floor(1500 * 1.5) = 2250
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      isTrainerBattle: true,
      hasLuckyEgg: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(2250);
  });

  it("given 2 participants, when calculating EXP, then splits EXP among participants", () => {
    // Source: Bulbapedia -- EXP is split among participants
    // base = floor((100 * 50) / (5 * 2)) = floor(5000 / 10) = 500
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      participantCount: 2,
    });
    expect(ruleset.calculateExpGain(context)).toBe(500);
  });

  it("given 3 participants at L25 with baseExp=60, when calculating EXP, then floors the division correctly", () => {
    // Source: Bulbapedia Gen IX EXP formula
    // base = floor((60 * 25) / (5 * 3)) = floor(1500 / 15) = 100
    const context = makeExpContext({
      defeatedLevel: 25,
      defeatedSpecies: { baseExp: 60 } as any,
      participantCount: 3,
    });
    expect(ruleset.calculateExpGain(context)).toBe(100);
  });

  it("given very low EXP scenario, when calculating EXP, then returns minimum of 1", () => {
    // Source: Bulbapedia -- minimum 1 EXP guaranteed
    // base = floor((1 * 1) / (5 * 6)) = floor(1 / 30) = 0
    // Math.max(1, 0) = 1
    const context = makeExpContext({
      defeatedLevel: 1,
      defeatedSpecies: { baseExp: 1 } as any,
      participantCount: 6,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gen9Ruleset -- calculateExpGain traded Pokemon EXP bonus
// ---------------------------------------------------------------------------

describe("Gen9Ruleset -- calculateExpGain traded Pokemon EXP bonus", () => {
  const ruleset = new Gen9Ruleset(new DataManager());

  it("given a same-language traded Pokemon, when calculating EXP, then applies 1.5x bonus", () => {
    // Source: Bulbapedia -- Same-language traded Pokemon receive 1.5x EXP
    // base = floor((100 * 50) / 5) = 1000
    // traded (same language): floor(1000 * 1.5) = 1500
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const notTraded = ruleset.calculateExpGain(context);
    const traded = ruleset.calculateExpGain({
      ...context,
      isTradedPokemon: true,
      isInternationalTrade: false,
    });

    expect(notTraded).toBe(1000);
    expect(traded).toBe(1500);
  });

  it("given an international traded Pokemon, when calculating EXP, then applies 1.7x bonus", () => {
    // Source: Bulbapedia -- International trades give 1.7x EXP instead of 1.5x
    // base = floor((100 * 50) / 5) = 1000
    // international traded: floor(1000 * 1.7) = 1700
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const result = ruleset.calculateExpGain({
      ...context,
      isTradedPokemon: true,
      isInternationalTrade: true,
    });

    expect(result).toBe(1700);
  });

  it("given trainer battle + traded (international) + Lucky Egg, when calculating EXP, then applies all modifiers sequentially", () => {
    // Source: Bulbapedia -- All multipliers applied sequentially with floor between each
    // base = floor((100 * 50) / 5) = 1000
    // trainer: floor(1000 * 1.5) = 1500
    // Lucky Egg: floor(1500 * 1.5) = 2250
    // international trade: floor(2250 * 1.7) = floor(3825) = 3825
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      isTrainerBattle: true,
      hasLuckyEgg: true,
    });
    const result = ruleset.calculateExpGain({
      ...context,
      isTradedPokemon: true,
      isInternationalTrade: true,
    });
    expect(result).toBe(3825);
  });
});

// ---------------------------------------------------------------------------
// Gen9Ruleset -- EXP Share always active (same as Gen 8)
// ---------------------------------------------------------------------------

describe("Gen9Ruleset -- EXP Share always active", () => {
  const ruleset = new Gen9Ruleset(new DataManager());

  it("given hasExpShare=true (always on in Gen 9), when calculating EXP, then returns the base formula result", () => {
    // Source: Bulbapedia Gen IX -- EXP Share is always active, all party members gain EXP
    // The EXP formula itself is unchanged; hasExpShare affects who receives EXP, not the amount
    // base = floor((100 * 50) / (5 * 1)) = 1000
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      hasExpShare: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1000);
  });

  it("given single participant, when calculating EXP, then full EXP goes to the battler", () => {
    // Source: Showdown -- Active battler gets full EXP share
    // base = floor((100 * 50) / (5 * 1)) = 1000
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      participantCount: 1,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1000);
  });
});
