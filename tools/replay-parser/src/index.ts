#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { downloadAndSave, searchReplays } from "./downloader.js";
import { parseReplay } from "./parser.js";
import type { ValidationResult } from "./replay-types.js";
import { formatCombinedReport, printReport } from "./report.js";
import { validateReplay } from "./validator.js";

const [, , command, ...rest] = process.argv;

async function cmdDownload(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      format: { type: "string", default: "gen1ou" },
      count: { type: "string", default: "10" },
      "output-dir": { type: "string" },
    },
    strict: false,
  });

  const format = (values.format as string | undefined) ?? "gen1ou";
  const count = Number.parseInt(String((values.count as string | undefined) ?? "10"), 10);
  const outputDir = resolve(
    (values["output-dir"] as string | undefined) ?? "tools/replay-parser/replays/gen1",
  );

  console.log(`Searching for ${count} ${format} replays...`);

  const results = await searchReplays({ format, count });
  console.log(`Found ${results.length} replays. Downloading...`);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    console.log(`  Downloading ${result.id}... (${i + 1}/${results.length})`);
    try {
      const path = await downloadAndSave(result.id, outputDir);
      console.log(`  Saved: ${path}`);
    } catch (e) {
      console.error(`  Failed: ${result.id} — ${e}`);
    }
  }

  console.log("Done.");
}

async function cmdParse(args: string[]): Promise<void> {
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: parse <path-to-replay.log>");
    process.exit(1);
  }

  const logText = await readFile(resolve(filePath), "utf-8");
  const parsed = parseReplay(logText);

  const summary = {
    id: parsed.id || filePath,
    format: parsed.format,
    generation: parsed.generation,
    players: parsed.players,
    turns: parsed.turns.length,
    teams: parsed.teams.map((team) =>
      team.map((p) => ({ species: p.species, moves: p.knownMoves })),
    ),
    winner: parsed.winner,
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function cmdValidate(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      json: { type: "boolean", default: false },
      "no-color": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const filePath = positionals[0];
  if (!filePath) {
    console.error("Usage: validate <path-to-replay.log> [--json]");
    process.exit(1);
  }

  const logText = await readFile(resolve(filePath), "utf-8");
  const parsed = parseReplay(logText);
  const result = validateReplay(parsed);

  printReport(result, {
    json: values.json as boolean | undefined,
    noColor: values["no-color"] as boolean | undefined,
  });

  const errors = result.mismatches.filter((m) => m.severity === "error").length;
  if (errors > 0) process.exit(1);
}

async function cmdValidateAll(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      json: { type: "boolean", default: false },
      "no-color": { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: false,
  });

  const dirPath = positionals[0];
  if (!dirPath) {
    console.error("Usage: validate-all <directory> [--json]");
    process.exit(1);
  }

  const dir = resolve(dirPath);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".log"));

  if (files.length === 0) {
    console.log("No .log files found.");
    return;
  }

  console.log(`Validating ${files.length} replays...`);

  const results: ValidationResult[] = [];
  for (const filename of files) {
    const logText = await readFile(join(dir, filename), "utf-8");
    const parsed = parseReplay(logText);
    const result = validateReplay({ ...parsed, id: parsed.id || filename.replace(".log", "") });
    results.push(result);
  }

  const output = formatCombinedReport(results, {
    json: values.json as boolean | undefined,
    noColor: values["no-color"] as boolean | undefined,
  });
  process.stdout.write(`${output}\n`);

  const totalErrors = results.reduce(
    (sum, r) => sum + r.mismatches.filter((m) => m.severity === "error").length,
    0,
  );
  if (totalErrors > 0) process.exit(1);
}

// Main dispatch
async function main(): Promise<void> {
  switch (command) {
    case "download":
      await cmdDownload(rest);
      break;
    case "parse":
      await cmdParse(rest);
      break;
    case "validate":
      await cmdValidate(rest);
      break;
    case "validate-all":
      await cmdValidateAll(rest);
      break;
    default:
      console.error(`Unknown command: ${command ?? "(none)"}`);
      console.error("Commands: download, parse, validate, validate-all");
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
