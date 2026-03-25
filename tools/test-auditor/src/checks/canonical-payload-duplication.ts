import type { FileContext, Finding } from "../types.ts";

const IMPORT_LINE_RE = /^\s*import\b/;
const COMMENT_LINE_RE = /^\s*(?:\/\/|\/\*|\*)/;

const FIELD_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "display name", re: /\bdisplayName:\s*["'`]/ },
  { kind: "move category", re: /\bcategory:\s*["'`](?:physical|special|status)["'`]/ },
  { kind: "move metadata", re: /\b(?:power|accuracy|priority|pp|maxPP|currentPP|ppUps):\s*(?:-?\d+(?:\.\d+)?|true|false)\b/ },
  { kind: "species typings", re: /\btypes:\s*\[/ },
  { kind: "species base stats", re: /\bbaseStats:\s*\{/ },
  { kind: "species abilities", re: /\babilities:\s*\{/ },
  { kind: "species gender ratio", re: /\bgenderRatio:\s*\d/ },
];

const HELPER_SIGNATURE_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: "synthetic move helper category", re: /\b(?:createMove|makeMove)\([^,\n]+,\s*["'`](?:physical|special|status)["'`]/ },
];

const DATA_BACKED_CONTEXT_RE = /\b(?:getMove|getSpecies|getItem|getAbility|getNature|createGen\d+DataManager|DATA_MANAGER)\b/;
const EXPLICIT_OVERRIDE_RE = /(?:override|synthetic|custom|derived|scenario)/i;
const PRIMARY_FIELD_KINDS = new Set(["display name", "species base stats", "species abilities"]);
const SPECIES_PAYLOAD_FIELD_KINDS = new Set(["display name", "species base stats", "species abilities", "species gender ratio"]);

function getWindowFieldKinds(lines: string[]): Set<string> {
  const kinds = new Set<string>();
  for (const candidate of lines) {
    for (const pattern of FIELD_PATTERNS) {
      if (pattern.re.test(candidate)) {
        kinds.add(pattern.kind);
      }
    }
  }
  return kinds;
}

export function checkCanonicalPayloadDuplication(ctx: FileContext): Finding[] {
  const findings: Finding[] = [];

  for (let index = 0; index < ctx.lines.length; index++) {
    const line = ctx.lines[index] ?? "";
    if (IMPORT_LINE_RE.test(line) || COMMENT_LINE_RE.test(line)) continue;

    for (const pattern of FIELD_PATTERNS) {
      if (!pattern.re.test(line)) continue;

      const contextLines = ctx.lines.slice(Math.max(0, index - 2), Math.min(ctx.lines.length, index + 3));
      const contextWindow = contextLines.join("\n");
      const windowKinds = getWindowFieldKinds(contextLines);
      const looksLikeCanonicalRecord =
        PRIMARY_FIELD_KINDS.has(pattern.kind) ||
        (pattern.kind === "species typings"
          ? [...windowKinds].some((kind) => SPECIES_PAYLOAD_FIELD_KINDS.has(kind))
          : windowKinds.size >= 2 || DATA_BACKED_CONTEXT_RE.test(contextWindow));

      if (!looksLikeCanonicalRecord) {
        continue;
      }

      if (EXPLICIT_OVERRIDE_RE.test(contextWindow)) {
        continue;
      }

      if (DATA_BACKED_CONTEXT_RE.test(contextWindow)) {
        continue;
      }

      findings.push({
        check: "canonical-payload-duplication",
        severity: "warning",
        file: ctx.relativePath,
        line: index + 1,
        message: `Potential duplicated canonical ${pattern.kind} field in test fixture/setup`,
        suggestion:
          "Start from the owning generation data-manager or exported reference surface and override only intentionally synthetic scenario fields",
      });
    }

    for (const pattern of HELPER_SIGNATURE_PATTERNS) {
      if (!pattern.re.test(line)) continue;

      findings.push({
        check: "canonical-payload-duplication",
        severity: "warning",
        file: ctx.relativePath,
        line: index + 1,
        message: `Potential duplicated canonical ${pattern.kind} in helper call`,
        suggestion:
          "Prefer a data-backed helper or pass an owned data record instead of restating canonical move/species metadata inline",
      });
    }
  }

  return findings;
}
