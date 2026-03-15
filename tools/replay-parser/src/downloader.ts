import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReplaySearchResult, ShowdownReplayJson } from "./replay-types.js";

const BASE_URL = "https://replay.pokemonshowdown.com";
const RATE_LIMIT_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a single replay by ID.
 * GET https://replay.pokemonshowdown.com/{id}.json
 */
export async function downloadReplay(id: string): Promise<ShowdownReplayJson> {
  const url = `${BASE_URL}/${id}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch replay ${id}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<ShowdownReplayJson>;
}

/**
 * Search for replays by format.
 * GET https://replay.pokemonshowdown.com/search.json?format=gen1ou
 */
export async function searchReplays(options: {
  format: string;
  count?: number;
}): Promise<ReplaySearchResult[]> {
  const url = `${BASE_URL}/search.json?format=${encodeURIComponent(options.format)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to search replays: ${response.status} ${response.statusText}`);
  }
  const results = (await response.json()) as ReplaySearchResult[];
  if (options.count !== undefined) {
    return results.slice(0, options.count);
  }
  return results;
}

/**
 * Download a replay and save its .log file to outputDir.
 * Applies rate limiting (1 second between requests).
 */
export async function downloadAndSave(id: string, outputDir: string): Promise<string> {
  const replay = await downloadReplay(id);
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${id}.log`);
  await writeFile(filePath, replay.log, "utf-8");
  await sleep(RATE_LIMIT_MS);
  return filePath;
}

/**
 * Download multiple replays from a search and save them.
 */
export async function downloadBatch(options: {
  format: string;
  count: number;
  outputDir: string;
  onProgress?: (id: string, index: number, total: number) => void;
}): Promise<string[]> {
  const results = await searchReplays({ format: options.format, count: options.count });
  const paths: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result) continue;
    options.onProgress?.(result.id, i, results.length);
    const path = await downloadAndSave(result.id, options.outputDir);
    paths.push(path);
  }

  return paths;
}
