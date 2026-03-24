import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";

describe("core public API exports", () => {
  it("exports the clearer shared-mechanics names from the root barrel", () => {
    expect(core.gen1to2FullParalysisCheck).toBeDefined();
    expect(core.gen1to4MultiHitRoll).toBeDefined();
    expect(core.gen1to6ConfusionSelfHitRoll).toBeDefined();
  });

  it("does not export the ambiguous digit-concatenation names from the root barrel", () => {
    expect("gen12FullParalysisCheck" in core).toBe(false);
    expect("gen14MultiHitRoll" in core).toBe(false);
    expect("gen16ConfusionSelfHitRoll" in core).toBe(false);
  });
});
