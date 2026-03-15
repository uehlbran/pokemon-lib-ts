import { searchReplays, downloadAndSave } from "../src/downloader.js";
import { mkdir } from "node:fs/promises";

const outputDir = "tools/replay-parser/replays/gen1";
await mkdir(outputDir, { recursive: true });

const results = await searchReplays({ format: "gen1ou", count: 15 });
console.log("Found", results.length, "replays");

for (const result of results) {
  try {
    const path = await downloadAndSave(result.id, outputDir);
    console.log("Downloaded:", result.id, "->", path);
  } catch (e) {
    console.error("Failed:", result.id, e);
  }
}
console.log("Done!");
