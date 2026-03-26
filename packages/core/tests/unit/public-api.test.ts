import { describe, expect, it } from "vitest";
import {
  BASE_PINCH_ABILITY_TYPES,
  BASE_PLATE_ITEMS,
  BASE_TYPE_BOOST_ITEMS,
} from "../../src/constants/index.js";
import * as core from "../../src/index.js";
import {
  gen1to2FullParalysisCheck,
  gen1to4MultiHitRoll,
  gen1to6ConfusionSelfHitRoll,
} from "../../src/logic/gen12-shared.js";
import { createEvs, createIvs, MAX_EV, MAX_IV, MAX_TOTAL_EVS } from "../../src/logic/index.js";

describe("core public API exports", () => {
  it("given the root barrel, when reading shared damage lookup table exports, then it re-exports the canonical module bindings", () => {
    expect(core.BASE_TYPE_BOOST_ITEMS).toBe(BASE_TYPE_BOOST_ITEMS);
    expect(core.BASE_PLATE_ITEMS).toBe(BASE_PLATE_ITEMS);
    expect(core.BASE_PINCH_ABILITY_TYPES).toBe(BASE_PINCH_ABILITY_TYPES);
  });

  it("given the root barrel, when reading the clearer shared-mechanics exports, then it re-exports the canonical renamed bindings", () => {
    expect(core.gen1to2FullParalysisCheck).toBe(gen1to2FullParalysisCheck);
    expect(core.gen1to4MultiHitRoll).toBe(gen1to4MultiHitRoll);
    expect(core.gen1to6ConfusionSelfHitRoll).toBe(gen1to6ConfusionSelfHitRoll);
  });

  it("given the root barrel, when reading deprecated digit-concatenation names, then it does not export them", () => {
    expect("gen12FullParalysisCheck" in core).toBe(false);
    expect("gen14MultiHitRoll" in core).toBe(false);
    expect("gen16ConfusionSelfHitRoll" in core).toBe(false);
  });

  it("given the root barrel, when reading stat-input helpers and constants, then it re-exports them", () => {
    expect(core.createIvs).toBe(createIvs);
    expect(core.createEvs).toBe(createEvs);
    expect(core.MAX_IV).toBe(MAX_IV);
    expect(core.MAX_EV).toBe(MAX_EV);
    expect(core.MAX_TOTAL_EVS).toBe(MAX_TOTAL_EVS);
  });
});
