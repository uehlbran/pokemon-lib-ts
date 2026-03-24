import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

describe("@pokemon-lib-ts/core public API", () => {
  it("exports explicit gen1toN helper names from the root barrel", () => {
    expect(core.gen1to2FullParalysisCheck).toBeTypeOf("function");
    expect(core.gen1to4MultiHitRoll).toBeTypeOf("function");
    expect(core.gen1to6ConfusionSelfHitRoll).toBeTypeOf("function");
  });

  it("keeps the legacy aliases wired to the canonical helpers", () => {
    expect(core.gen12FullParalysisCheck).toBe(core.gen1to2FullParalysisCheck);
    expect(core.gen14MultiHitRoll).toBe(core.gen1to4MultiHitRoll);
    expect(core.gen16ConfusionSelfHitRoll).toBe(core.gen1to6ConfusionSelfHitRoll);
  });
});
