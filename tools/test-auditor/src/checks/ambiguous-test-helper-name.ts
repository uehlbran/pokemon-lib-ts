import type { FileContext, Finding } from "../types.ts";

const DISALLOWED_HELPERS = [
  {
    name: "makeMove",
    suggestion:
      "Use dataManager.getMove(...) for canonical moves or createSyntheticMoveFrom(...) for explicit synthetic variants",
  },
  {
    name: "makeState",
    suggestion:
      "Rename this to createBattleState(...) or createSyntheticBattleState(...) so the fixture intent is explicit",
  },
  {
    name: "makeSide",
    suggestion: "Rename this to createBattleSide(...) so the fixture intent is explicit",
  },
  {
    name: "makePokemonInstance",
    suggestion:
      "Rename this to createSyntheticPokemonInstance(...) or use a canonical data-backed builder when the fixture is not synthetic",
  },
  {
    name: "makeActivePokemon",
    suggestion:
      "Rename this to createOnFieldPokemon(...) or createSyntheticOnFieldPokemon(...) so the on-field fixture intent is explicit",
  },
] as const;

function getHelperPattern(helperName: string): RegExp {
  return new RegExp(
    String.raw`\b(?:function|const|let)\s+${helperName}\b|\b${helperName}\s*[:=]\s*\(`,
  );
}

export function checkAmbiguousTestHelperNames(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let index = 0; index < ctx.lines.length; index++) {
    const line = ctx.lines[index] ?? "";

    for (const helper of DISALLOWED_HELPERS) {
      if (!getHelperPattern(helper.name).test(line)) continue;

      findings.push({
        check: "ambiguous-test-helper-name",
        severity: "warning",
        file: ctx.relativePath,
        line: index + 1,
        message: `Ambiguous helper name "${helper.name}" hides whether the fixture is canonical or synthetic`,
        suggestion: helper.suggestion,
      });
    }
  }

  return findings;
}
