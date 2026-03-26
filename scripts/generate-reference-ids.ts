import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type IdEntry = {
  id: string;
};

type SpeciesEntry = {
  id: number;
  name: string;
};

const REPO_ROOT = process.cwd();
const PACKAGES_DIR = path.join(REPO_ROOT, "packages");

function toCamelCase(value: string): string {
  const parts = value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const [first = "", ...rest] = parts;
  const base = [
    first.toLowerCase(),
    ...rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()),
  ].join("");

  if (!base) return "unknownId";
  if (/^[0-9]/.test(base)) return `id${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  return base;
}

function toUniquePropertyName(value: string, usedNames: Set<string>): string {
  const baseName = toCamelCase(value);
  let propertyName = baseName;
  let suffix = 2;

  while (usedNames.has(propertyName)) {
    propertyName = `${baseName}${suffix}`;
    suffix += 1;
  }

  usedNames.add(propertyName);
  return propertyName;
}

async function readJson<T>(filePath: string): Promise<T> {
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as T;
}

function buildIdObject(entries: readonly IdEntry[]): string {
  const usedNames = new Set<string>();
  return entries
    .map((entry) => {
      const propertyName = toUniquePropertyName(entry.id, usedNames);
      return `  ${propertyName}: "${entry.id}",`;
    })
    .join("\n");
}

function buildSpeciesIdObject(entries: readonly SpeciesEntry[]): string {
  const usedNames = new Set<string>();
  return entries
    .map((entry) => {
      const propertyName = toUniquePropertyName(entry.name, usedNames);
      return `  ${propertyName}: ${entry.id},`;
    })
    .join("\n");
}

async function generateReferenceIdsForPackage(packageName: string): Promise<void> {
  const generationNumber = packageName.replace("gen", "");
  const prefix = `GEN${generationNumber}`;
  const packageDir = path.join(PACKAGES_DIR, packageName);
  const dataDir = path.join(packageDir, "data");
  const outputPath = path.join(packageDir, "src", "data", "reference-ids.ts");

  const moves = await readJson<IdEntry[]>(path.join(dataDir, "moves.json"));
  const items = await readJson<IdEntry[]>(path.join(dataDir, "items.json"));
  const natures = await readJson<IdEntry[]>(path.join(dataDir, "natures.json"));
  const species = await readJson<SpeciesEntry[]>(path.join(dataDir, "pokemon.json"));

  const abilitiesPath = path.join(dataDir, "abilities.json");
  let abilities: IdEntry[] = [];
  try {
    abilities = await readJson<IdEntry[]>(abilitiesPath);
  } catch {
    abilities = [];
  }

  const fileContents = `/**
 * Auto-generated from ${packageName}/data/*.json by scripts/generate-reference-ids.ts.
 *
 * Tests and package consumers should import these ids instead of re-declaring
 * brittle file-local move, item, ability, species, or nature identifiers.
 */

export const ${prefix}_MOVE_IDS = {
${buildIdObject(moves)}
} as const;

export const ${prefix}_ITEM_IDS = {
${buildIdObject(items)}
} as const;

export const ${prefix}_ABILITY_IDS = {
${buildIdObject(abilities)}
} as const;

export const ${prefix}_NATURE_IDS = {
${buildIdObject(natures)}
} as const;

export const ${prefix}_SPECIES_IDS = {
${buildSpeciesIdObject(species)}
} as const;
`;

  await writeFile(outputPath, fileContents);
}

async function main(): Promise<void> {
  const packageNames = (await readdir(PACKAGES_DIR, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^gen[0-9]+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort(
      (left, right) => Number.parseInt(left.slice(3), 10) - Number.parseInt(right.slice(3), 10),
    );

  await Promise.all(packageNames.map((packageName) => generateReferenceIdsForPackage(packageName)));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
