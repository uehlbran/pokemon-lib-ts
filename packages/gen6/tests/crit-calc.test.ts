import { describe, expect, it } from "vitest";
import { GEN6_CRIT_MULTIPLIER, GEN6_CRIT_RATE_TABLE } from "../src/Gen6CritCalc";

// ---------------------------------------------------------------------------
// Gen 6 Critical Hit Constants
// ---------------------------------------------------------------------------

describe("Gen 6 critical hit constants", () => {
  it("given GEN6_CRIT_RATE_TABLE, then stage 0 denominator is 24 (~4.2%)", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- stage 0: 1/24
    expect(GEN6_CRIT_RATE_TABLE[0]).toBe(24);
  });

  it("given GEN6_CRIT_RATE_TABLE, then stage 1 denominator is 8 (12.5%)", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- stage 1: 1/8
    expect(GEN6_CRIT_RATE_TABLE[1]).toBe(8);
  });

  it("given GEN6_CRIT_RATE_TABLE, then stage 2 denominator is 2 (50%)", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- stage 2: 1/2
    expect(GEN6_CRIT_RATE_TABLE[2]).toBe(2);
  });

  it("given GEN6_CRIT_RATE_TABLE, then stage 3+ denominator is 1 (guaranteed)", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- stage 3+: guaranteed (1/1)
    expect(GEN6_CRIT_RATE_TABLE[3]).toBe(1);
  });

  it("given GEN6_CRIT_RATE_TABLE, then it has exactly 4 entries", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- 4 stages (0, 1, 2, 3+)
    expect(GEN6_CRIT_RATE_TABLE).toHaveLength(4);
  });

  it("given GEN6_CRIT_RATE_TABLE, then values match [24, 8, 2, 1]", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- complete table
    expect(Array.from(GEN6_CRIT_RATE_TABLE)).toEqual([24, 8, 2, 1]);
  });

  it("given GEN6_CRIT_MULTIPLIER, then it is 1.5", () => {
    // Source: Bulbapedia "Critical hit" Gen 6 -- multiplier reduced from 2x to 1.5x
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier
    expect(GEN6_CRIT_MULTIPLIER).toBe(1.5);
  });

  it("given GEN6_CRIT_MULTIPLIER is 1.5, then it differs from Gen 5's 2.0x", () => {
    // Source: Bulbapedia "Critical hit" -- Gen 5 used 2.0x, Gen 6 changed to 1.5x
    // Triangulation: verify the value is specifically 1.5, not 2.0
    expect(GEN6_CRIT_MULTIPLIER).not.toBe(2.0);
    expect(GEN6_CRIT_MULTIPLIER).toBe(1.5);
  });
});
