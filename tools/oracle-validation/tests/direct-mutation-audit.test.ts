import { describe, expect, it } from "vitest";
import { detectDirectMutationPatterns } from "../src/direct-mutation-audit.js";

describe("detectDirectMutationPatterns", () => {
  it("ignores comparisons against ctx.state fields", () => {
    expect(detectDirectMutationPatterns('if (ctx.state.phase === "move") {')).toEqual([]);
    expect(detectDirectMutationPatterns("return ctx.state.turnNumber !== 0;")).toEqual([]);
  });

  it("detects state assignments and increments", () => {
    expect(detectDirectMutationPatterns('ctx.state.phase = "move";')).toContain(
      "ctx-state-mutation",
    );
    expect(detectDirectMutationPatterns("ctx.state.turnNumber++;")).toContain("ctx-state-mutation");
    expect(detectDirectMutationPatterns("--ctx.state.turnNumber;")).toContain("ctx-state-mutation");
  });

  it("detects nested attacker and defender mutations", () => {
    expect(detectDirectMutationPatterns("ctx.attacker.currentHp -= 10;")).toContain(
      "active-pokemon-mutation",
    );
    expect(
      detectDirectMutationPatterns('ctx.defender.side.conditions["reflect"] = { turns: 5 };'),
    ).toContain("active-pokemon-mutation");
    expect(detectDirectMutationPatterns("ctx.attacker.pokemon.statStages.atk++;")).toContain(
      "active-pokemon-mutation",
    );
  });
});
