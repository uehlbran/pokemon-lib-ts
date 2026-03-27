import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ImplementedGeneration {
  readonly gen: number;
  readonly packageDir: string;
  readonly dataDir: string;
  readonly packageName: string;
}

const REQUIRED_DATA_FILES = ["pokemon.json", "moves.json", "type-chart.json"] as const;

export function discoverImplementedGenerations(repoRoot: string): ImplementedGeneration[] {
  const implemented: ImplementedGeneration[] = [];

  for (let gen = 1; gen <= 9; gen += 1) {
    const packageDir = join(repoRoot, "packages", `gen${gen}`);
    const srcIndex = join(packageDir, "src", "index.ts");
    const packageJson = join(packageDir, "package.json");
    const dataDir = join(packageDir, "data");

    const hasBaseStructure =
      existsSync(packageDir) &&
      existsSync(srcIndex) &&
      existsSync(packageJson) &&
      existsSync(dataDir);
    const hasRequiredData = REQUIRED_DATA_FILES.every((file) => existsSync(join(dataDir, file)));

    if (hasBaseStructure && hasRequiredData) {
      implemented.push({
        gen,
        packageDir,
        dataDir,
        packageName: `@pokemon-lib-ts/gen${gen}`,
      });
    }
  }

  return implemented;
}
