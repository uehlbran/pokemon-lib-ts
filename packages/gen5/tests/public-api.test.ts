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
    expect(getAcrobaticsPower(false)).toBe(110);
    expect(getAcrobaticsPower(false)).toBe(getAcrobaticsBP(false));
    expect(getAcrobaticsPower(true)).toBe(getAcrobaticsBP(true));
  });

  it("given the canonical and deprecated Electro Ball exports, when called, then they match", () => {
    expect(getElectroBallPower(300, 100)).toBe(120);
    expect(getElectroBallPower(300, 100)).toBe(getElectroBallBP(300, 100));
  });

  it("given the canonical and deprecated Gyro Ball exports, when called, then they match", () => {
    expect(getGyroBallPower(50, 200)).toBe(101);
    expect(getGyroBallPower(50, 200)).toBe(getGyroBallBP(50, 200));
  });

  it("given the canonical and deprecated weight-based exports, when called, then they match", () => {
    expect(getWeightBasedPower(400, 100)).toBe(100);
    expect(getWeightBasedPower(400, 100)).toBe(getWeightBasedBP(400, 100));
  });

  it("given the canonical and deprecated Retaliate exports, when called, then they match", () => {
    expect(getRetaliatePower(true)).toBe(140);
    expect(getRetaliatePower(true)).toBe(getRetaliateBP(true));
    expect(getRetaliatePower(false)).toBe(getRetaliateBP(false));
  });
});
