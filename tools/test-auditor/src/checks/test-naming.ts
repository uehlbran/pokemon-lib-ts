import type { FileContext, Finding } from "../types.ts";

// Generic patterns that indicate a vague test name
const GENERIC_NAME_RE =
  /^should (work|pass|succeed|be correct|calculate correctly|return correct|return the correct|handle it|handle correctly)$/i;

// Specific signal terms — Pokemon species names, type names, scenario keywords
const SPECIFIC_SIGNAL_TERMS = [
  // Species
  "charizard",
  "blastoise",
  "venusaur",
  "pikachu",
  "mewtwo",
  "gengar",
  "alakazam",
  "snorlax",
  "garchomp",
  "pokemon",
  "bulbasaur",
  "squirtle",
  // Type names
  "thunder",
  "fire",
  "water",
  "grass",
  "psychic",
  "poison",
  "ice",
  "dragon",
  "dark",
  "steel",
  "fairy",
  "normal",
  "fighting",
  "flying",
  "ghost",
  "rock",
  "ground",
  "bug",
  "electric",
  // Scenario keywords
  "level",
  "base",
  "iv",
  "ev",
  "crit",
  "critical",
  "status",
  "paralysis",
  "burn",
  "sleep",
  "freeze",
  "confus",
  "flinch",
  "accuracy",
  "damage",
  "hp",
  "atk",
  "def",
  "spe",
  "spd",
  "stat",
  "move",
  "ability",
  "type",
  "gen1",
  "gen2",
  "stab",
  "modifier",
  "formula",
  "round",
  "floor",
];

// Regex to detect test block line and extract name
const TEST_LINE_RE = /^\s*(it|test)\s*\(\s*(['"`])(.+?)\2/;

export function checkTestNaming(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i] ?? "";
    const match = TEST_LINE_RE.exec(line);
    if (!match) continue;

    const name = match[3] ?? "";

    let isVague = false;

    // Condition a: name too short
    if (name.length < 20) {
      isVague = true;
    }

    // Condition b: matches a generic pattern
    if (!isVague && GENERIC_NAME_RE.test(name)) {
      isVague = true;
    }

    // Condition c: no specific signal (digit or known term)
    if (!isVague) {
      const nameLower = name.toLowerCase();
      const hasDigit = /\d/.test(name);
      const hasSpecificTerm = SPECIFIC_SIGNAL_TERMS.some((term) => nameLower.includes(term));
      if (!hasDigit && !hasSpecificTerm) {
        isVague = true;
      }
    }

    if (isVague) {
      findings.push({
        check: "test-naming",
        severity: "info",
        file: ctx.relativePath,
        line: i + 1,
        message: `Vague test name: '${name}'`,
        suggestion:
          "Use Given/When/Then format: 'given [context], when [action], then [expected outcome]'",
      });
    }
  }

  return findings;
}
