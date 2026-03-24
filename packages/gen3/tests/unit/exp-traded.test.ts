/**
 * Tests for traded Pokemon EXP bonus (1.5× same-language, 1.7× international).
 *
 * Source: pret/pokeplatinum src/battle/battle_script.c lines 9980-9988
 *   BattleSystem_PokemonIsOT == FALSE → traded bonus:
 *     MON_DATA_LANGUAGE != gGameLanguage → 1.7×, else 1.5×
 *
 * Covers: Gen3Ruleset.calculateExpGain with isTradedPokemon and isInternationalTrade flags.
 * Gen 3+ is the first generation where both language-tagged trades are modeled.
 */
import type { PokemonSpeciesData } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../../src/data";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";

function makeRuleset(): Gen3Ruleset {
  return new Gen3Ruleset(createGen3DataManager());
}

/** Minimal species stub with a known baseExp for formula tests. */
function makeSpecies(baseExp: number): PokemonSpeciesData {
  return { baseExp } as PokemonSpeciesData;
}

// ---------------------------------------------------------------------------
// Derivations for the base context used across all cases below
//   Classic formula: exp = floor(floor(floor(b * L_d / 7) / s) * t)
//   b=64, L_d=30, s=1, t=1.0 (wild) →
//     step1 = floor(64 * 30 / 7) = floor(1920 / 7) = floor(274.28…) = 274
//     step2 = floor(274 / 1)     = 274
//     step3 = floor(274 * 1.0)   = 274
//   Traded (same language): floor(274 * 1.5)  = floor(411.0) = 411
//   Traded (international):  floor(274 * 1.7)  = floor(465.8) = 465
// ---------------------------------------------------------------------------

describe("Gen3Ruleset calculateExpGain — traded Pokemon EXP bonus", () => {
  it("given a non-traded Pokemon, when calculateExpGain, then returns base EXP without trade bonus", () => {
    // Arrange
    // Source: pret/pokeemerald src/battle_util.c GiveExpToMon — no OT check for own Pokemon
    // floor((64 * 30 / 7) / 1 * 1.0) = 274
    const ruleset = makeRuleset();
    const context = {
      defeatedSpecies: makeSpecies(64),
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: false,
      isInternationalTrade: false,
    };

    // Act
    const result = ruleset.calculateExpGain(context);

    // Assert
    // floor(floor(floor(64 * 30 / 7) / 1) * 1.0) = 274
    expect(result).toBe(274);
  });

  it("given a traded (same language) Pokemon, when calculateExpGain, then returns 1.5x boosted EXP", () => {
    // Arrange
    // Source: pret/pokeplatinum src/battle/battle_script.c line 9984
    //   MON_DATA_LANGUAGE == gGameLanguage → totalExp = totalExp * 150 / 100
    // Base EXP = 274; floor(274 * 1.5) = 411
    const ruleset = makeRuleset();
    const context = {
      defeatedSpecies: makeSpecies(64),
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: false,
    };

    // Act
    const result = ruleset.calculateExpGain(context);

    // Assert
    // floor(274 * 1.5) = 411
    expect(result).toBe(411);
  });

  it("given a traded international Pokemon, when calculateExpGain, then returns 1.7x boosted EXP", () => {
    // Arrange
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9981-9982
    //   MON_DATA_LANGUAGE != gGameLanguage → totalExp = totalExp * 170 / 100
    // Base EXP = 274; floor(274 * 1.7) = 465
    const ruleset = makeRuleset();
    const context = {
      defeatedSpecies: makeSpecies(64),
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: true,
    };

    // Act
    const result = ruleset.calculateExpGain(context);

    // Assert
    // floor(274 * 1.7) = floor(465.8) = 465
    expect(result).toBe(465);
  });

  it("given omitted isTradedPokemon (default), when calculateExpGain, then returns base EXP (no bonus)", () => {
    // Arrange
    // Source: ExpContext interface — isTradedPokemon is optional, defaults to false
    const ruleset = makeRuleset();
    const context = {
      defeatedSpecies: makeSpecies(64),
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    };

    // Act
    const result = ruleset.calculateExpGain(context);

    // Assert — same as non-traded case: 274
    expect(result).toBe(274);
  });

  it("given a traded Pokemon in a trainer battle, when calculateExpGain, then both trainer bonus and trade bonus stack", () => {
    // Arrange
    // Source: pret/pokeplatinum src/battle/battle_script.c — trainer bonus (line 9976-9978)
    //   applied before traded bonus (lines 9980-9985)
    // b=64, L_d=30, s=1, t=1.5 (trainer battle):
    //   step1 = floor(64 * 30 / 7) = 274
    //   step2 = floor(274 / 1)     = 274
    //   step3 = floor(274 * 1.5)   = 411
    //   trade: floor(411 * 1.5)    = 616  (same-language traded in trainer battle)
    const ruleset = makeRuleset();
    const context = {
      defeatedSpecies: makeSpecies(64),
      defeatedLevel: 30,
      participantLevel: 25,
      isTrainerBattle: true,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: false,
    };

    // Act
    const result = ruleset.calculateExpGain(context);

    // Assert
    // floor(floor(floor(64 * 30 / 7) / 1) * 1.5) * 1.5 = floor(411 * 1.5) = 616
    expect(result).toBe(616);
  });

  it("given traded Gen 3 EXP contexts, when comparing international vs same-language trade, then international bonus is larger", () => {
    // Arrange
    // Source: pret/pokeplatinum src/battle/battle_script.c lines 9981-9984
    //   170/100 vs 150/100 — international is always larger
    const ruleset = makeRuleset();
    const baseCtx = {
      defeatedSpecies: makeSpecies(100),
      defeatedLevel: 50,
      participantLevel: 40,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    };

    // Act
    const sameLanguage = ruleset.calculateExpGain({
      ...baseCtx,
      isTradedPokemon: true,
      isInternationalTrade: false,
    });
    const international = ruleset.calculateExpGain({
      ...baseCtx,
      isTradedPokemon: true,
      isInternationalTrade: true,
    });

    // Assert — international must always exceed same-language
    expect(international).toBeGreaterThan(sameLanguage);
  });
});
