import type { ExpContext } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { Gen6Ruleset } from "../src/Gen6Ruleset";

// ---------------------------------------------------------------------------
// Helper: create an ExpContext
// ---------------------------------------------------------------------------
function makeExpContext(overrides: Partial<ExpContext> = {}): ExpContext {
  return {
    defeatedLevel: overrides.defeatedLevel ?? 50,
    defeatedSpecies: overrides.defeatedSpecies ?? { baseExp: 100 },
    participantLevel: overrides.participantLevel ?? 50,
    participantCount: overrides.participantCount ?? 1,
    isTrainerBattle: overrides.isTrainerBattle ?? false,
    hasLuckyEgg: overrides.hasLuckyEgg ?? false,
  } as ExpContext;
}

// ---------------------------------------------------------------------------
// Gen6Ruleset — calculateExpGain
// Uses the Gen 5/6 sqrt-based formula:
//   a = 2 * defeatedLevel + 10
//   b = defeatedLevel + participantLevel + 10
//   exp = floor( floor(sqrt(a) * a^2) * baseExp / floor(sqrt(b) * b^2) ) + 1
// ---------------------------------------------------------------------------

describe("Gen6Ruleset — calculateExpGain base formula", () => {
  const ruleset = new Gen6Ruleset();

  it("given equal-level battle (L50 vs L50, baseExp=100), when calculating EXP, then returns expected value", () => {
    // Source: Bulbapedia -- Gen 5/6 EXP formula
    // a = 2*50 + 10 = 110, b = 50 + 50 + 10 = 110
    // sqrt(110) * 110^2 = 10.488... * 12100 = 126909.xx, floor = 126909
    // exp = floor(126909 * 100 / 126909) + 1 = floor(100) + 1 = 101
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(101);
  });

  it("given higher-level foe (L70 vs L50, baseExp=100), when calculating EXP, then returns more EXP than equal level", () => {
    // Source: Bulbapedia -- Gen 5/6 EXP formula gives more EXP when foe level is higher
    // a = 2*70 + 10 = 150, b = 70 + 50 + 10 = 130
    // floor(sqrt(150) * 150^2) = floor(12.247... * 22500) = floor(275567.7...) = 275567
    // floor(sqrt(130) * 130^2) = floor(11.401... * 16900) = floor(192686.2...) = 192686
    // exp = floor(275567 * 100 / 192686) + 1 = floor(143.01...) + 1 = 144
    const context = makeExpContext({
      defeatedLevel: 70,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const result = ruleset.calculateExpGain(context);
    expect(result).toBe(144);
  });

  it("given lower-level foe (L30 vs L50, baseExp=100), when calculating EXP, then returns less EXP than equal level", () => {
    // Source: Bulbapedia -- Gen 5/6 EXP formula gives less EXP when foe level is lower
    // a = 2*30 + 10 = 70, b = 30 + 50 + 10 = 90
    // floor(sqrt(70) * 70^2) = floor(8.3666... * 4900) = floor(40996.3...) = 40996
    // floor(sqrt(90) * 90^2) = floor(9.4868... * 8100) = floor(76843.4...) = 76843
    // exp = floor(40996 * 100 / 76843) + 1 = floor(53.34...) + 1 = 54
    const context = makeExpContext({
      defeatedLevel: 30,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const result = ruleset.calculateExpGain(context);
    expect(result).toBe(54);
  });
});

describe("Gen6Ruleset — calculateExpGain modifiers", () => {
  const ruleset = new Gen6Ruleset();

  it("given a trainer battle, when calculating EXP, then applies 1.5x multiplier", () => {
    // Source: Bulbapedia -- Trainer battles give 1.5x EXP
    // Base: 101 (from equal-level test above)
    // Trainer: floor(101 * 1.5) = floor(151.5) = 151
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      isTrainerBattle: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(151);
  });

  it("given Lucky Egg, when calculating EXP, then applies 1.5x multiplier", () => {
    // Source: Bulbapedia -- Lucky Egg gives 1.5x EXP
    // Base: 101 (from equal-level test above)
    // Lucky Egg: floor(101 * 1.5) = floor(151.5) = 151
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      hasLuckyEgg: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(151);
  });

  it("given trainer battle with Lucky Egg, when calculating EXP, then applies both multipliers sequentially", () => {
    // Source: Bulbapedia -- multipliers stack sequentially
    // Base: 101, Trainer: floor(101 * 1.5) = 151, Lucky Egg: floor(151 * 1.5) = 226
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      isTrainerBattle: true,
      hasLuckyEgg: true,
    });
    expect(ruleset.calculateExpGain(context)).toBe(226);
  });

  it("given 2 participants, when calculating EXP, then splits EXP evenly", () => {
    // Source: Bulbapedia -- EXP is split among participants
    // Base: 101, Split: floor(101 / 2) = 50
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
      participantCount: 2,
    });
    expect(ruleset.calculateExpGain(context)).toBe(50);
  });

  it("given very low EXP scenario, when calculating EXP, then returns 1 (minimum floor)", () => {
    // Source: Bulbapedia -- minimum 1 EXP guaranteed by Math.max(1, exp)
    // a = 2*1 + 10 = 12; sqrt(12)*12^2 = 3.464...*144 = 498.xx, floor = 498
    // b = 1 + 100 + 10 = 111; sqrt(111)*111^2 = 10.535...*12321 = 129788.xx, floor = 129788
    // exp = floor(498 * 1 / 129788) + 1 = floor(0.003...) + 1 = 0 + 1 = 1
    // participantCount=6: floor(1 / 6) = 0, then Math.max(1, 0) = 1
    const context = makeExpContext({
      defeatedLevel: 1,
      participantLevel: 100,
      defeatedSpecies: { baseExp: 1 } as any,
      participantCount: 6,
    });
    expect(ruleset.calculateExpGain(context)).toBe(1);
  });
});

describe("Gen6Ruleset — calculateExpGain with different baseExp values", () => {
  const ruleset = new Gen6Ruleset();

  it("given baseExp=200, when calculating EXP, then scales linearly with baseExp", () => {
    // Source: Bulbapedia -- baseExp is a linear factor in the formula
    // Same setup as equal-level test but baseExp=200 instead of 100
    // exp = floor(126909 * 200 / 126909) + 1 = floor(200) + 1 = 201
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 200 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(201);
  });

  it("given baseExp=50, when calculating EXP, then scales linearly with baseExp", () => {
    // Source: Bulbapedia -- baseExp is a linear factor in the formula
    // exp = floor(126909 * 50 / 126909) + 1 = floor(50) + 1 = 51
    const context = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 50 } as any,
    });
    expect(ruleset.calculateExpGain(context)).toBe(51);
  });
});

describe("Gen6Ruleset — calculateExpGain traded Pokemon EXP bonus", () => {
  const ruleset = new Gen6Ruleset();

  it("given a traded (same-language) Pokemon in Gen 6, when calculateExpGain with isTradedPokemon=true, then returns 1.5x boosted EXP", () => {
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula (Gen 6)
    // Gen 6 uses the same sqrt-based formula as Gen 5; traded bonus applied after all multipliers.
    // baseExp=100, L_d=50, L_p=50 → exp=101 (from equal-level base test)
    // traded (same language): floor(101 * 1.5) = 151
    const baseCtx = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const notTraded = ruleset.calculateExpGain(baseCtx);
    const traded = ruleset.calculateExpGain({ ...baseCtx, isTradedPokemon: true, isInternationalTrade: false });

    expect(notTraded).toBe(101);
    expect(traded).toBe(151);
  });

  it("given a traded international Pokemon in Gen 6, when calculateExpGain with isInternationalTrade=true, then returns 1.7x boosted EXP", () => {
    // Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Experience#Gain_formula (Gen 6)
    // baseExp=100, L_d=50, L_p=50 → exp=101 (from equal-level base test)
    // international: floor(101 * 1.7) = floor(171.7) = 171
    const baseCtx = makeExpContext({
      defeatedLevel: 50,
      participantLevel: 50,
      defeatedSpecies: { baseExp: 100 } as any,
    });
    const result = ruleset.calculateExpGain({ ...baseCtx, isTradedPokemon: true, isInternationalTrade: true });

    expect(result).toBe(171);
  });
});
