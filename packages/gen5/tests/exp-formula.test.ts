import type { ExpContext } from "@pokemon-lib-ts/battle";
import type { PokemonSpeciesData } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

/**
 * Helper: make a minimal PokemonSpeciesData with baseExp.
 */
function makeSpecies(baseExp: number): PokemonSpeciesData {
  return {
    baseExp,
    baseStats: { hp: 78, attack: 84, defense: 78, spAttack: 109, spDefense: 85, speed: 100 },
  } as unknown as PokemonSpeciesData;
}

/**
 * Helper: make an ExpContext.
 */
function makeExpContext(overrides: {
  defeatedBaseExp: number;
  defeatedLevel: number;
  participantLevel: number;
  isTrainerBattle?: boolean;
  participantCount?: number;
  hasLuckyEgg?: boolean;
  hasExpShare?: boolean;
}): ExpContext {
  return {
    defeatedSpecies: makeSpecies(overrides.defeatedBaseExp),
    defeatedLevel: overrides.defeatedLevel,
    participantLevel: overrides.participantLevel,
    isTrainerBattle: overrides.isTrainerBattle ?? false,
    participantCount: overrides.participantCount ?? 1,
    hasLuckyEgg: overrides.hasLuckyEgg ?? false,
    hasExpShare: overrides.hasExpShare ?? false,
    affectionBonus: false,
  };
}

/**
 * Calculate the Gen 5 EXP formula manually for verification.
 *
 * Source: https://bulbapedia.bulbagarden.net/wiki/Experience#Generation_V_and_VI
 * Source: specs/battle/06-gen5.md section 16, lines 867-929
 */
function manualGen5Exp(
  defeatedBaseExp: number,
  defeatedLevel: number,
  participantLevel: number,
): number {
  const a = 2 * defeatedLevel + 10;
  const b = defeatedLevel + participantLevel + 10;
  const sqrtA = Math.sqrt(a);
  const sqrtB = Math.sqrt(b);
  return Math.floor((Math.floor(sqrtA * a * a) * defeatedBaseExp) / Math.floor(sqrtB * b * b)) + 1;
}

describe("Gen5 EXP formula", () => {
  const ruleset = new Gen5Ruleset();

  it("given L50 pokemon (base exp 240) defeating L50 wild Pokemon, when calculating exp for L50 winner, then returns expected value", () => {
    // Source: Bulbapedia Gen 5 EXP formula
    // a = 2*50+10 = 110, b = 50+50+10 = 110
    // sqrt(110) ~ 10.488..., floor(10.488 * 110 * 110) = floor(126862.8...) = 126862
    // baseEXP = floor(126862 * 240 / 126862) + 1 = floor(240) + 1 = 241
    const expected = manualGen5Exp(240, 50, 50);
    expect(expected).toBe(241); // Verify manual calc
    const context = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
    });
    const result = ruleset.calculateExpGain(context);
    // Source: Bulbapedia Gen 5 EXP formula (verified above: manualGen5Exp(240,50,50) = 241)
    expect(result).toBe(expected);
  });

  it("given L50 winner defeating L5 wild Pokemon (base exp 64), when calculating exp, then winner receives less than if levels were equal", () => {
    // Source: Bulbapedia EXP formula -- lower fainted level yields less EXP
    const expected = manualGen5Exp(64, 5, 50);
    const context = makeExpContext({
      defeatedBaseExp: 64,
      defeatedLevel: 5,
      participantLevel: 50,
    });
    const result = ruleset.calculateExpGain(context);
    // Source: Bulbapedia Gen 5 EXP formula -- lower fainted level yields less EXP (manualGen5Exp(64,5,50))
    expect(result).toBe(expected);
    // Should be much less than equal-level
    const equalLevel = manualGen5Exp(64, 50, 50);
    expect(result).toBeLessThan(equalLevel);
  });

  it("given L1 winner defeating L100 wild Pokemon (base exp 100), when calculating exp, then winner receives much more than base", () => {
    // Source: Bulbapedia -- large level gap in fainted's favor yields bonus EXP
    const expected = manualGen5Exp(100, 100, 1);
    const context = makeExpContext({
      defeatedBaseExp: 100,
      defeatedLevel: 100,
      participantLevel: 1,
    });
    const result = ruleset.calculateExpGain(context);
    // Source: Bulbapedia Gen 5 EXP formula -- large level gap in fainted's favor yields bonus EXP (manualGen5Exp(100,100,1))
    expect(result).toBe(expected);
    // Should be much more than equal-level (100 base exp)
    expect(result).toBeGreaterThan(100);
  });

  it("given trainer battle multiplier, when applied, then EXP is 1.5x base", () => {
    // Source: Bulbapedia -- Trainer battle modifier 1.5x
    const baseContext = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
      isTrainerBattle: false,
    });
    const trainerContext = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
      isTrainerBattle: true,
    });

    const baseExp = ruleset.calculateExpGain(baseContext);
    const trainerExp = ruleset.calculateExpGain(trainerContext);

    // Trainer exp should be floor(baseExp * 1.5)
    // Source: Bulbapedia -- Trainer battle modifier 1.5x applied as floor(baseExp * 1.5)
    expect(trainerExp).toBe(Math.floor(baseExp * 1.5));
  });

  it("given Lucky Egg held item, when applied, then EXP is 1.5x base", () => {
    // Source: Bulbapedia -- Lucky Egg modifier 1.5x
    const baseContext = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
      hasLuckyEgg: false,
    });
    const luckyContext = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
      hasLuckyEgg: true,
    });

    const baseExp = ruleset.calculateExpGain(baseContext);
    const luckyExp = ruleset.calculateExpGain(luckyContext);

    // Lucky Egg exp should be floor(baseExp * 1.5)
    // Source: Bulbapedia -- Lucky Egg modifier 1.5x applied as floor(baseExp * 1.5)
    expect(luckyExp).toBe(Math.floor(baseExp * 1.5));
  });

  it("given L5 Rattata defeating L5 Pidgey (base exp 58), when calculating exp, then matches spec example", () => {
    // Source: specs/battle/06-gen5.md section 16, lines 912-926
    const expected = manualGen5Exp(58, 5, 5);
    expect(expected).toBe(59);

    const context = makeExpContext({
      defeatedBaseExp: 58,
      defeatedLevel: 5,
      participantLevel: 5,
    });
    const result = ruleset.calculateExpGain(context);
    // Source: specs/battle/06-gen5.md section 16 -- spec example: L5 Rattata vs L5 Pidgey (base 58) = 59 EXP
    expect(result).toBe(59);
  });

  it("given multiple participants, when calculating exp, then exp is divided", () => {
    // Source: Bulbapedia -- EXP is split among participants
    const singleContext = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
      participantCount: 1,
    });
    const doubleContext = makeExpContext({
      defeatedBaseExp: 240,
      defeatedLevel: 50,
      participantLevel: 50,
      participantCount: 2,
    });

    const singleExp = ruleset.calculateExpGain(singleContext);
    const doubleExp = ruleset.calculateExpGain(doubleContext);

    // Should be roughly half when split between 2
    expect(doubleExp).toBeLessThan(singleExp);
  });
});

describe("Gen5Ruleset calculateExpGain — traded Pokemon EXP bonus", () => {
  const ruleset = new Gen5Ruleset();

  it("given a traded (same-language) Pokemon in Gen 5, when calculateExpGain with isTradedPokemon=true, then returns 1.5x boosted EXP", () => {
    // Source: Showdown sim/battle-actions.ts — traded bonus applied after other multipliers
    // Gen 5 sqrt formula: baseExp=100, L_d=50, L_p=50
    //   a=110, b=110; floor(sqrt(110)*110^2)=126909; exp = floor(126909*100/126909)+1 = 101
    //   traded (same): floor(101 * 1.5) = 151
    const baseCtx = makeExpContext({
      defeatedBaseExp: 100,
      defeatedLevel: 50,
      participantLevel: 50,
    });
    const notTraded = ruleset.calculateExpGain(baseCtx);
    const traded = ruleset.calculateExpGain({
      ...baseCtx,
      isTradedPokemon: true,
      isInternationalTrade: false,
    });

    expect(notTraded).toBe(101);
    expect(traded).toBe(151);
  });

  it("given a traded international Pokemon in Gen 5, when calculateExpGain with isInternationalTrade=true, then returns 1.7x boosted EXP", () => {
    // Source: Showdown sim/battle-actions.ts — international trade gives 1.7x (same as Gen 3-4 pattern)
    // Gen 5 sqrt formula: exp=101 (same as above)
    //   international: floor(101 * 1.7) = floor(171.7) = 171
    const baseCtx = makeExpContext({
      defeatedBaseExp: 100,
      defeatedLevel: 50,
      participantLevel: 50,
    });
    const result = ruleset.calculateExpGain({
      ...baseCtx,
      isTradedPokemon: true,
      isInternationalTrade: true,
    });

    expect(result).toBe(171);
  });
});
