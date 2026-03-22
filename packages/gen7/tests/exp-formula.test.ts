import type { ExpContext } from "@pokemon-lib-ts/battle";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen7Ruleset } from "../src/Gen7Ruleset";

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
// Gen7Ruleset -- calculateExpGain
//
// Gen 7 uses a simplified formula (no sqrt-based level scaling):
//   Step 1: base = floor((baseExp * defeatedLevel) / (5 * participantCount))
//   Step 2: if trainer battle: floor(base * 1.5)
//   Step 3: if Lucky Egg: floor(base * 1.5)
//   Step 4: if traded: floor(base * 1.5 or 1.7)
//   Minimum: 1
//
// Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_VII
// ---------------------------------------------------------------------------

describe("Gen7Ruleset -- calculateExpGain base formula", () => {
  const ruleset = new Gen7Ruleset(new DataManager());

  it("given wild battle at L50 with baseExp=100, when calculating EXP, then returns base formula result", () => {
    // Source: Bulbapedia Gen VII EXP formula -- simplified formula
    // base = floor((100 * 50) / (5 * 1)) = floor(5000 / 5) = 1000
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1000);
  });

  it("given wild battle at L30 with baseExp=142 (Charmeleon), when calculating EXP, then returns correct value", () => {
    // Source: Bulbapedia Gen VII EXP formula
    // Charmeleon base EXP yield = 142
    // base = floor((142 * 30) / (5 * 1)) = floor(4260 / 5) = floor(852) = 852
    const context = makeExpContext({
      defeatedLevel: 30,
      defeatedSpecies: { baseExp: 142 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(852);
  });

  it("given wild battle at L1 with baseExp=64 (Pidgey), when calculating EXP, then returns correct value", () => {
    // Source: Bulbapedia Gen VII EXP formula
    // Pidgey base EXP yield = 50 (Gen 7), using 64 as example
    // base = floor((64 * 1) / (5 * 1)) = floor(64 / 5) = floor(12.8) = 12
    const context = makeExpContext({
      defeatedLevel: 1,
      defeatedSpecies: { baseExp: 64 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(12);
  });

  it("given wild battle at L100 with baseExp=255 (Blissey), when calculating EXP, then returns correct value", () => {
    // Source: Bulbapedia Gen VII EXP formula
    // Blissey has the highest base EXP yield: 255 (Gen 7 value)
    // base = floor((255 * 100) / (5 * 1)) = floor(25500 / 5) = 5100
    const context = makeExpContext({
      defeatedLevel: 100,
      defeatedSpecies: { baseExp: 255 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(5100);
  });

  it("given Gen 7 EXP formula, when comparing to Gen 5/6, then does NOT use level-scaling (no sqrt)", () => {
    // Source: Bulbapedia Gen VII -- Gen 7 removed the sqrt-based scaling
    // In Gen 5/6, defeating a L30 with a L50 participant gives LESS EXP than equal levels.
    // In Gen 7, participant level is irrelevant to the formula.
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
    // Both should return the same value -- participant level is not used
    expect(ruleset.calculateExpGain(ctx1)).toBe(ruleset.calculateExpGain(ctx2));
  });
});

describe("Gen7Ruleset -- calculateExpGain modifiers", () => {
  const ruleset = new Gen7Ruleset(new DataManager());

  it("given a trainer battle, when calculating EXP, then applies 1.5x multiplier (floored)", () => {
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

  it("given a wild battle with Lucky Egg, when calculating EXP, then applies 1.5x multiplier (floored)", () => {
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

  it("given trainer battle with Lucky Egg and an odd base step, when calculating EXP, then staged flooring differs from one-shot multiplication", () => {
    // Source: inline formula derivation -- values chosen so staged flooring diverges from one-shot
    // base = floor((101 * 5) / 5) = floor(101) = 101
    // trainer: floor(101 * 1.5) = floor(151.5) = 151
    // Lucky Egg: floor(151 * 1.5) = floor(226.5) = 226
    // One-shot would give: floor(101 * 2.25) = floor(227.25) = 227 (DIFFERENT)
    // Staged flooring = 226; proves the sequential Math.floor() behavior is correct.
    const context = makeExpContext({
      defeatedLevel: 5,
      defeatedSpecies: { baseExp: 101 } as any,
      isTrainerBattle: true,
      hasLuckyEgg: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(226);
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

  it("given 3 participants with non-divisible base, when calculating EXP, then floors the result", () => {
    // Source: Bulbapedia -- EXP division is floored
    // base = floor((100 * 50) / (5 * 3)) = floor(5000 / 15) = floor(333.33...) = 333
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      participantCount: 3,
    });
    expect(ruleset.calculateExpGain(context)).toBe(333);
  });

  it("given very low EXP scenario, when calculating EXP, then returns minimum of 1", () => {
    // Source: Bulbapedia -- minimum 1 EXP guaranteed by Math.max(1, exp)
    // base = floor((1 * 1) / (5 * 6)) = floor(1 / 30) = floor(0.033...) = 0
    // Math.max(1, 0) = 1
    const context = makeExpContext({
      defeatedLevel: 1,
      defeatedSpecies: { baseExp: 1 } as any,
      participantCount: 6,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1);
  });
});

describe("Gen7Ruleset -- calculateExpGain traded Pokemon EXP bonus", () => {
  const ruleset = new Gen7Ruleset(new DataManager());

  it("given a same-language traded Pokemon, when calculating EXP, then applies 1.5x bonus", () => {
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula
    // Same-language traded Pokemon receive 1.5x EXP
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

  it("given trainer battle with international traded Pokemon and Lucky Egg, when calculating EXP, then applies all multipliers sequentially", () => {
    // Source: Bulbapedia -- all multipliers stack with sequential flooring
    // base = floor((100 * 50) / 5) = 1000
    // trainer: floor(1000 * 1.5) = 1500
    // Lucky Egg: floor(1500 * 1.5) = 2250
    // international traded: floor(2250 * 1.7) = floor(3825) = 3825
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

describe("Gen7Ruleset -- calculateExpGain with different baseExp values", () => {
  const ruleset = new Gen7Ruleset(new DataManager());

  it("given baseExp=200, when calculating EXP, then scales linearly with baseExp", () => {
    // Source: Bulbapedia -- baseExp is a linear factor in the Gen 7 formula
    // base = floor((200 * 50) / 5) = floor(10000 / 5) = 2000
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 200 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(2000);
  });

  it("given baseExp=50, when calculating EXP, then scales linearly with baseExp", () => {
    // Source: Bulbapedia -- baseExp is a linear factor in the Gen 7 formula
    // base = floor((50 * 50) / 5) = floor(2500 / 5) = 500
    const context = makeExpContext({
      defeatedLevel: 50,
      defeatedSpecies: { baseExp: 50 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(500);
  });
});
