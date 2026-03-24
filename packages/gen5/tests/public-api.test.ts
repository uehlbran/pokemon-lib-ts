import { describe, expect, it } from "vitest";
import {
  getAcrobaticsBP,
  getAcrobaticsPower,
  getElectroBallBP,
  getElectroBallPower,
  getGyroBallBP,
  getGyroBallPower,
  getRetaliateBP,
  getRetaliatePower,
  getWeightBasedBP,
  getWeightBasedPower,
} from "../src/Gen5MoveEffects";

describe("Gen5 move-effects barrel exports", () => {
  it("given the canonical and deprecated Acrobatics exports, when called, then they match", () => {
    // Source: Showdown data/moves.ts -- Acrobatics has basePower 55 and doubles to 110
    // without an item; see the direct helper coverage in move-effects-combat.test.ts.
    expect(getAcrobaticsPower(false)).toBe(110);
    expect(getAcrobaticsPower(false)).toBe(getAcrobaticsBP(false));
    expect(getAcrobaticsPower(true)).toBe(getAcrobaticsBP(true));
  });

  it("given the canonical and deprecated Electro Ball exports, when called, then they match", () => {
    // Source: Showdown data/moves.ts -- floor(300 / 100) = 3, so Electro Ball uses
    // the fourth table entry and returns 120; see the direct helper coverage.
    expect(getElectroBallPower(300, 100)).toBe(120);
    expect(getElectroBallPower(300, 100)).toBe(getElectroBallBP(300, 100));
  });

  it("given the canonical and deprecated Gyro Ball exports, when called, then they match", () => {
    // Source: Showdown data/moves.ts -- floor(25 * 200 / 50) + 1 = 101 for Gyro Ball;
    // see the direct helper coverage in move-effects-combat.test.ts.
    expect(getGyroBallPower(50, 200)).toBe(101);
    expect(getGyroBallPower(50, 200)).toBe(getGyroBallBP(50, 200));
  });

  it("given the canonical and deprecated weight-based exports, when called, then they match", () => {
    // Source: Showdown data/moves.ts -- Heat Crash / Heavy Slam use 100 BP when the
    // attacker is at least 4x but less than 5x the target's weight.
    expect(getWeightBasedPower(400, 100)).toBe(100);
    expect(getWeightBasedPower(400, 100)).toBe(getWeightBasedBP(400, 100));
  });

  it("given the canonical and deprecated Retaliate exports, when called, then they match", () => {
    // Source: Showdown data/moves.ts -- Retaliate doubles from 70 to 140 after an ally
    // fainted last turn; the false case keeps the same value as the deprecated alias.
    expect(getRetaliatePower(true)).toBe(140);
    expect(getRetaliatePower(true)).toBe(getRetaliateBP(true));
    expect(getRetaliatePower(false)).toBe(getRetaliateBP(false));
  });
});
