import { describe, expect, it } from "vitest";
import { pokeRound } from "../src/Gen5DamageCalc";

/**
 * Regression tests for pokeRound off-by-one fix (GitHub #536).
 *
 * Source: Showdown sim/battle.ts modify() — the correct formula is:
 *   tr((tr(value * modifier) + 2048 - 1) / 4096)
 * which for positive integers is:
 *   Math.floor((value * modifier + 2047) / 4096)
 *
 * The bug used + 2048 instead of + 2047, causing rounding up instead of
 * rounding down when (value * modifier) % 4096 === 2048.
 */
describe("pokeRound correctness (Showdown modify() parity)", () => {
  it("given value=3 and modifier=2048, when applying pokeRound, then returns 1 (not 2)", () => {
    // Source: Showdown sim/battle.ts modify() — tr((tr(3*2048) + 2048 - 1) / 4096)
    // 3 * 2048 = 6144; floor((6144 + 2047) / 4096) = floor(8191 / 4096) = floor(1.9997...) = 1
    // Bug returned 2: floor((6144 + 2048) / 4096) = floor(8192 / 4096) = 2
    expect(pokeRound(3, 2048)).toBe(1);
  });

  it("given value=100 and modifier=2048, when applying pokeRound, then returns 50", () => {
    // Source: Showdown sim/battle.ts modify()
    // 100 * 2048 = 204800; floor((204800 + 2047) / 4096) = floor(206847 / 4096) = floor(50.4997...) = 50
    // This case is unaffected by the off-by-one (no exact boundary hit).
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("given value=100 and modifier=2457, when applying pokeRound, then returns 60", () => {
    // Source: Showdown sim/battle.ts modify()
    // 100 * 2457 = 245700; floor((245700 + 2047) / 4096) = floor(247747 / 4096) = floor(60.484...) = 60
    expect(pokeRound(100, 2457)).toBe(60);
  });

  it("given value=1 and modifier=4096, when applying pokeRound (1.0x), then returns 1", () => {
    // Source: Showdown sim/battle.ts modify()
    // 1 * 4096 = 4096; floor((4096 + 2047) / 4096) = floor(6143 / 4096) = floor(1.4997...) = 1
    expect(pokeRound(1, 4096)).toBe(1);
  });

  it("given value=57 and modifier=6144, when applying pokeRound, then returns 85 (not 86)", () => {
    // Source: Showdown sim/battle.ts modify()
    // 57 * 6144 = 350208; floor((350208 + 2047) / 4096) = floor(352255 / 4096) = floor(85.9997...) = 85
    // Bug returned 86: floor((350208 + 2048) / 4096) = floor(352256 / 4096) = 86.0
    // This is an exact boundary case: 350208 % 4096 = 350208 - 85*4096 = 350208 - 348160 = 2048
    expect(pokeRound(57, 6144)).toBe(85);
  });

  it("given value=100 and modifier=6144, when applying pokeRound (1.5x), then returns 150", () => {
    // Source: Showdown sim/battle.ts modify()
    // 100 * 6144 = 614400; floor((614400 + 2047) / 4096) = floor(616447 / 4096) = floor(150.4997...) = 150
    // Unaffected by off-by-one.
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("given value=7 and modifier=2048, when applying pokeRound, then returns 3 (boundary case)", () => {
    // Source: Showdown sim/battle.ts modify()
    // 7 * 2048 = 14336; floor((14336 + 2047) / 4096) = floor(16383 / 4096) = floor(3.9997...) = 3
    // Bug returned 4: floor((14336 + 2048) / 4096) = floor(16384 / 4096) = 4.0
    // Boundary: 14336 % 4096 = 14336 - 3*4096 = 14336 - 12288 = 2048 (exact boundary)
    expect(pokeRound(7, 2048)).toBe(3);
  });

  it("given value=1 and modifier=2048, when applying pokeRound, then returns 0 (small value boundary case)", () => {
    // Source: Showdown sim/battle.ts modify() — regression counterexample for off-by-one fix
    // 1 * 2048 = 2048; floor((2048 + 2047) / 4096) = floor(4095 / 4096) = floor(0.9997...) = 0
    // Bug returned 1: floor((2048 + 2048) / 4096) = floor(4096 / 4096) = 1.0
    // This is the minimal exact-boundary case: 2048 % 4096 = 2048 exactly — off-by-one flips 0 → 1
    expect(pokeRound(1, 2048)).toBe(0);
  });
});
