import { describe, expect, it } from "vitest";
import {
  createDvs,
  createEvs,
  createIvs,
  createStatExp,
  MAX_DV,
  MAX_EV,
  MAX_IV,
  MAX_STAT_EXP,
  MAX_TOTAL_EVS,
  MIN_DV,
  MIN_EV,
  MIN_IV,
  MIN_STAT_EXP,
  validateDvs,
  validateEvs,
  validateIvs,
  validateStatExp,
} from "../../../src";

describe("stat input constants", () => {
  it("given the exported stat boundary constants, when reading them, then they expose the canonical ranges", () => {
    // Source: Gen 3+ IVs are 0-31; EVs are 0-252 per stat with a 510 total cap.
    // Source: Gen 1-2 DVs are 0-15; Stat Exp ranges 0-65535.
    expect(MIN_IV).toBe(0);
    expect(MAX_IV).toBe(31);
    expect(MIN_EV).toBe(0);
    expect(MAX_EV).toBe(252);
    expect(MAX_TOTAL_EVS).toBe(510);
    expect(MIN_DV).toBe(0);
    expect(MAX_DV).toBe(15);
    expect(MIN_STAT_EXP).toBe(0);
    expect(MAX_STAT_EXP).toBe(65535);
  });
});

describe("createIvs and validateIvs", () => {
  it("given no overrides, when creating IVs, then they default to the canonical max value", () => {
    expect(createIvs()).toEqual({
      hp: 31,
      attack: 31,
      defense: 31,
      spAttack: 31,
      spDefense: 31,
      speed: 31,
    });
  });

  it("given an out-of-range IV, when validating, then it reports a failure", () => {
    const result = validateIvs({ speed: 32 });

    expect(result.valid).toBe(false);
    expect(result.failures).toEqual([
      {
        field: "speed",
        value: 32,
        message: "speed IV must be between 0 and 31",
      },
    ]);
  });

  it("given an invalid IV override, when creating IVs, then it throws", () => {
    expect(() => createIvs({ attack: -1 })).toThrow("IV validation failed");
  });
});

describe("createEvs and validateEvs", () => {
  it("given no overrides, when creating EVs, then they default to zero", () => {
    expect(createEvs()).toEqual({
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
    });
  });

  it("given a per-stat EV overflow, when validating, then it reports the field failure", () => {
    const result = validateEvs({ attack: 253 });

    expect(result.valid).toBe(false);
    expect(result.failures).toEqual([
      {
        field: "attack",
        value: 253,
        message: "attack EV must be between 0 and 252",
      },
    ]);
  });

  it("given an EV total over the cap, when validating, then it reports the total failure", () => {
    const result = validateEvs({
      hp: 252,
      attack: 252,
      defense: 252,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({
      field: "total",
      value: 756,
      message: "total EVs must be <= 510",
    });
  });

  it("given a valid competitive EV spread, when creating EVs, then it succeeds", () => {
    expect(
      createEvs({
        hp: 4,
        attack: 252,
        speed: 252,
      }),
    ).toEqual({
      hp: 4,
      attack: 252,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 252,
    });
  });
});

describe("createDvs and validateDvs", () => {
  it("given no overrides, when creating DVs, then hp is derived from the other max DVs", () => {
    expect(createDvs()).toEqual({
      hp: 15,
      attack: 15,
      defense: 15,
      spAttack: 15,
      spDefense: 15,
      speed: 15,
    });
  });

  it("given mixed DV parity, when creating DVs, then hp is derived from attack/defense/speed/spAttack", () => {
    expect(
      createDvs({
        attack: 15,
        defense: 14,
        speed: 15,
        spAttack: 14,
        spDefense: 10,
      }),
    ).toEqual({
      hp: 10,
      attack: 15,
      defense: 14,
      spAttack: 14,
      spDefense: 10,
      speed: 15,
    });
  });

  it("given an explicit hp DV input, when validating, then it fails because hp is derived", () => {
    const result = validateDvs({
      hp: 15,
      attack: 15,
      defense: 15,
      speed: 15,
      spAttack: 15,
    });

    expect(result.valid).toBe(false);
    expect(result.failures).toContainEqual({
      field: "hp",
      value: 15,
      message: "hp DV is derived from the other DVs and cannot be provided directly",
    });
  });
});

describe("createStatExp and validateStatExp", () => {
  it("given no overrides, when creating Stat Exp, then it defaults to zero", () => {
    expect(createStatExp()).toEqual({
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
    });
  });

  it("given a Stat Exp overflow, when validating, then it reports the field failure", () => {
    const result = validateStatExp({ spAttack: 65536 });

    expect(result.valid).toBe(false);
    expect(result.failures).toEqual([
      {
        field: "spAttack",
        value: 65536,
        message: "spAttack Stat Exp must be between 0 and 65535",
      },
    ]);
  });

  it("given an invalid Stat Exp override, when creating Stat Exp, then it throws", () => {
    expect(() => createStatExp({ hp: -1 })).toThrow("Stat Exp validation failed");
  });
});
