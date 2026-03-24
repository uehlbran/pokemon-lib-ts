import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const damageCalcSource = readFileSync(new URL("../src/Gen5DamageCalc.ts", import.meta.url), "utf8");

describe("Gen5 pokeRound export wiring", () => {
  it("re-exports pokeRound from core instead of maintaining a local copy", () => {
    expect(damageCalcSource).toContain("pokeRound,");
    expect(damageCalcSource).toContain('} from "@pokemon-lib-ts/core";');
    expect(damageCalcSource).toContain("export { pokeRound };");
    expect(damageCalcSource).not.toContain("export function pokeRound");
  });
});
