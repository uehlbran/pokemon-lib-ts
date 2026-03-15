import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReplay } from "../../../tools/replay-parser/src/parser.js";
import type { ValidationResult } from "../../../tools/replay-parser/src/replay-types.js";
import { validateReplay } from "../../../tools/replay-parser/src/validator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPLAYS_DIR = join(__dirname, "../../../tools/replay-parser/replays/gen1");

describe("Gen 1 Replay Validation", () => {
  const replayFiles = existsSync(REPLAYS_DIR)
    ? readdirSync(REPLAYS_DIR).filter((f) => f.endsWith(".log"))
    : [];

  if (replayFiles.length === 0) {
    it("setup — replay fixtures exist (REQUIRED)", () => {
      expect(replayFiles.length).toBeGreaterThan(0);
    });
    return;
  }

  // Test each replay file individually
  for (const filename of replayFiles) {
    it(`given ${filename}, when validated, then zero type-effectiveness errors`, () => {
      // Arrange
      const logText = readFileSync(join(REPLAYS_DIR, filename), "utf-8");

      // Act
      const parsed = parseReplay(logText);
      const result = validateReplay(parsed);

      // Assert: No type effectiveness errors (the hard requirement)
      const typeEffectivenessErrors = result.mismatches.filter(
        (m) => m.severity === "error" && m.check.includes("type-effectiveness"),
      );

      if (typeEffectivenessErrors.length > 0) {
        const messages = typeEffectivenessErrors.map((m) => `  Turn ${m.turnNumber}: ${m.message}`);
        throw new Error(`Type effectiveness errors in ${filename}:\n${messages.join("\n")}`);
      }

      expect(typeEffectivenessErrors).toHaveLength(0);
    });
  }

  it(`given all ${replayFiles.length} replay files, when validated together, then all parse successfully`, () => {
    // Arrange + Act
    const results: Array<{ file: string; result: ValidationResult }> = [];

    for (const filename of replayFiles) {
      const logText = readFileSync(join(REPLAYS_DIR, filename), "utf-8");
      const parsed = parseReplay(logText);
      const result = validateReplay(parsed);
      results.push({ file: filename, result });
    }

    // Assert: All replays parse and validate without crashing
    expect(results).toHaveLength(replayFiles.length);

    // Log summary for awareness (not failure)
    const totalErrors = results.reduce(
      (sum, r) => sum + r.result.mismatches.filter((m) => m.severity === "error").length,
      0,
    );
    const totalWarnings = results.reduce(
      (sum, r) => sum + r.result.mismatches.filter((m) => m.severity === "warning").length,
      0,
    );
    const totalPassed = results.reduce((sum, r) => sum + r.result.passed, 0);

    console.log(
      `Validation summary across ${replayFiles.length} replays: ${totalPassed} passed, ${totalErrors} errors, ${totalWarnings} warnings`,
    );
  });
});
