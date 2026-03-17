import { CRIT_MULTIPLIER_CLASSIC, CRIT_RATES_GEN3_5 } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN3_CRIT_MULTIPLIER,
  GEN3_CRIT_RATE_DENOMINATORS,
  GEN3_CRIT_RATES,
} from "../src/Gen3CritCalc";

describe("Gen 3 crit calc", () => {
  it("given stage 0, when checking crit rate denominator, then denominator is 16 (1/16 chance)", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 0 (no modifiers): 1/16 chance = denominator 16
    expect(GEN3_CRIT_RATE_DENOMINATORS[0]).toBe(16);
  });

  it("given stage 1, when checking crit rate denominator, then denominator is 8 (1/8 chance)", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 1 (Scope Lens or high-crit move): 1/8 chance = denominator 8
    expect(GEN3_CRIT_RATE_DENOMINATORS[1]).toBe(8);
  });

  it("given stage 2, when checking crit rate denominator, then denominator is 4 (1/4 chance)", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 2 (Scope Lens + high-crit move): 1/4 chance = denominator 4
    expect(GEN3_CRIT_RATE_DENOMINATORS[2]).toBe(4);
  });

  it("given stage 3, when checking crit rate denominator, then denominator is 3 (1/3 chance)", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 3 (Focus Energy = +2 stages): 1/3 chance = denominator 3
    expect(GEN3_CRIT_RATE_DENOMINATORS[3]).toBe(3);
  });

  it("given stage 4, when checking crit rate denominator, then denominator is 2 (1/2 chance)", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 4+ (max stage): 1/2 chance = denominator 2
    expect(GEN3_CRIT_RATE_DENOMINATORS[4]).toBe(2);
  });

  it("given crit rate table, when checking stage 0 probability, then probability is 1/16 = 0.0625", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 0: 1/16 = 0.0625
    expect(GEN3_CRIT_RATES[0]).toBeCloseTo(1 / 16, 5);
  });

  it("given crit rate table, when checking stage 1 probability, then probability is 1/8 = 0.125", () => {
    // Source: pret/pokeemerald src/battle_util.c CalcCritChanceStage
    // Stage 1: 1/8 = 0.125
    expect(GEN3_CRIT_RATES[1]).toBeCloseTo(1 / 8, 5);
  });

  it("given crit multiplier, when a crit lands, then damage multiplied by 2.0", () => {
    // Source: pret/pokeemerald src/battle_util.c — critical hits double damage in Gen 3
    // Gen 3-5: 2.0x multiplier (changed to 1.5x in Gen 6)
    expect(GEN3_CRIT_MULTIPLIER).toBe(2.0);
  });

  it("given crit multiplier, when comparing to CRIT_MULTIPLIER_CLASSIC, then values match", () => {
    // Source: packages/core/src/logic/critical-hit.ts — CRIT_MULTIPLIER_CLASSIC = 2.0
    // Gen 3 uses the classic multiplier, same as Gen 1-5
    expect(GEN3_CRIT_MULTIPLIER).toBe(CRIT_MULTIPLIER_CLASSIC);
  });

  it("given crit rate table, when comparing to CRIT_RATES_GEN3_5, then table is the same", () => {
    // Source: packages/core/src/logic/critical-hit.ts — CRIT_RATES_GEN3_5 is the authoritative table
    // Gen3CritCalc re-exports the core constant for convenience
    expect(GEN3_CRIT_RATES).toBe(CRIT_RATES_GEN3_5);
  });
});
