import { describe, expect, it } from "vitest";
import {
  detectDirectMutationPatterns,
  scanSourceForDirectMutations,
  shouldInspect,
} from "../src/direct-mutation-audit.js";

describe("detectDirectMutationPatterns", () => {
  it("ignores comparisons against ctx.state fields", () => {
    expect(detectDirectMutationPatterns('if (ctx.state.phase === "move") {')).toEqual([]);
    expect(detectDirectMutationPatterns("return ctx.state.turnNumber !== 0;")).toEqual([]);
  });

  it("detects state assignments and increments", () => {
    expect(detectDirectMutationPatterns('ctx.state.phase = "move";')).toContain(
      "ctx-state-mutation",
    );
    expect(detectDirectMutationPatterns('ctx.state.phase &&= "move";')).toContain(
      "ctx-state-mutation",
    );
    expect(detectDirectMutationPatterns('ctx.state.phase ||= "switch";')).toContain(
      "ctx-state-mutation",
    );
    expect(detectDirectMutationPatterns('ctx.state.phase ??= "idle";')).toContain(
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

describe("scanSourceForDirectMutations", () => {
  it("detects simple aliases, alias chains, and mutator calls", () => {
    const findings = scanSourceForDirectMutations(
      `
      function sample(ctx: MoveEffectContext, context: AbilityContext) {
        const { attacker, state } = ctx;
        const mutableState = ctx.state as BattleState;
        const side = state.sides[0];
        const targetPokemon = side.team[1];
        const pokemon = context.pokemon;

        attacker.pokemon.heldItem = null;
        mutableState.terrain = { type: "electric" };
        targetPokemon.currentHp = 10;
        pokemon.volatileStatuses.delete("charge");
        ctx.attacker.volatileStatuses.set("focusenergy", { turnsLeft: 1 });
      }
      `,
      "packages/gen9/src/Gen9MoveEffects.ts",
    );

    expect(findings.map((finding) => finding.pattern)).toEqual([
      "active-pokemon-mutation",
      "ctx-state-mutation",
      "ctx-state-mutation",
      "active-pokemon-mutation",
      "active-pokemon-mutation",
    ]);
  });

  it("detects chained destructuring aliases from tracked roots", () => {
    const findings = scanSourceForDirectMutations(
      `
      function sample(ctx: MoveEffectContext) {
        const { attacker } = ctx;
        const { pokemon } = attacker;
        pokemon.currentHp = 10;
      }
      `,
      "packages/gen9/src/Gen9MoveEffects.ts",
    );

    expect(findings.map((finding) => finding.pattern)).toEqual(["active-pokemon-mutation"]);
  });

  it("ignores local scratch mutations that do not derive from tracked context", () => {
    const findings = scanSourceForDirectMutations(
      `
      function sample(ctx: MoveEffectContext) {
        if (ctx.state.phase === "move") {
          const localState = { turnsLeft: 1 };
          localState.turnsLeft += 1;
          const map = new Map();
          map.set("x", 1);
        }

        return {
          effects: [],
          messages: ["ok"],
        };
      }
      `,
      "packages/gen9/src/Gen9MoveEffects.ts",
    );

    expect(findings).toEqual([]);
  });

  it("tracks aliases introduced by for-of loops over tracked state", () => {
    const findings = scanSourceForDirectMutations(
      `
      function sample(ctx: MoveEffectContext) {
        for (const side of ctx.state.sides) {
          side.conditions = {};
          for (const active of side.active) {
            active.substituteHp = 0;
          }
        }
      }
      `,
      "packages/gen9/src/Gen9MoveEffects.ts",
    );

    expect(findings.map((finding) => finding.pattern)).toEqual([
      "ctx-state-mutation",
      "ctx-state-mutation",
    ]);
  });

  it("detects mutator add calls on tracked sets", () => {
    const findings = scanSourceForDirectMutations(
      `
      function sample(ctx: MoveEffectContext) {
        ctx.state.pseudoWeather.add("trickroom");
      }
      `,
      "packages/gen9/src/Gen9MoveEffects.ts",
    );

    expect(findings.map((finding) => finding.pattern)).toEqual(["ctx-state-mutation"]);
  });
});

describe("shouldInspect", () => {
  it("includes expanded generation runtime helper families", () => {
    expect(shouldInspect("packages/gen8/src/Gen8Terrain.ts")).toBe(true);
    expect(shouldInspect("packages/gen8/src/Gen8Dynamax.ts")).toBe(true);
    expect(shouldInspect("packages/gen9/src/Gen9DamageCalc.ts")).toBe(true);
    expect(shouldInspect("packages/gen9/src/Gen9Weather.ts")).toBe(true);
  });

  it("ignores non-target files", () => {
    expect(shouldInspect("packages/battle/src/engine/BattleEngine.ts")).toBe(false);
    expect(shouldInspect("tools/oracle-validation/src/direct-mutation-audit.ts")).toBe(false);
  });
});
