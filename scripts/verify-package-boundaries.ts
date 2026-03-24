import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  name: string;
  private?: boolean;
  exports?: Record<string, unknown> | string;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
};

type ExportTarget = {
  exportKey: string;
  target: string;
};

type PublishablePackage = {
  dir: string;
  packageJsonPath: string;
  packageJson: PackageJson;
};

type PackedFile = {
  path: string;
};

type PackResult = {
  files?: PackedFile[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packagesRoot = path.join(repoRoot, "packages");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const tscBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);

const failures: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      [`Command failed: ${command} ${args.join(" ")}`, output].filter(Boolean).join("\n"),
    );
  }

  return result.stdout;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

function flattenExports(
  exportKey: string,
  value: unknown,
  targets: ExportTarget[] = [],
): ExportTarget[] {
  if (typeof value === "string") {
    targets.push({ exportKey, target: value });
    return targets;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenExports(exportKey, item, targets);
    }
    return targets;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      flattenExports(exportKey, nestedValue, targets);
    }
  }

  return targets;
}

function dedupeTargets(targets: ExportTarget[]): ExportTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.exportKey}::${target.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "(.+)");
  return new RegExp(`^${escaped}$`);
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    }),
  );
  return files.flat();
}

async function resolveWildcardMatches(
  packageDir: string,
  relativePattern: string,
): Promise<string[]> {
  const allFiles = await listFilesRecursive(packageDir);
  const normalizedPattern = normalizeRelativePath(relativePattern);
  const matcher = wildcardToRegExp(normalizedPattern);

  return allFiles
    .map((filePath) => normalizeRelativePath(path.relative(packageDir, filePath)))
    .filter((filePath) => matcher.test(filePath))
    .sort();
}

function exportSpecifierForMatch(
  packageName: string,
  exportKey: string,
  matchedPath: string,
): string {
  const normalizedKey = exportKey.replace(/^\.\//, "");
  const normalizedPath = matchedPath.replace(/^\.\//, "");
  const matcher = wildcardToRegExp(normalizedKey);
  const match = normalizedPath.match(matcher);

  if (!match) {
    throw new Error(
      `Could not derive export specifier for ${packageName} ${exportKey} from ${matchedPath}`,
    );
  }

  const captures = match.slice(1);
  let captureIndex = 0;
  const substituted = exportKey.replace(/\*/g, () => {
    const value = captures[captureIndex];
    captureIndex += 1;
    return value ?? "";
  });

  const cleaned = substituted.replace(/^\.\//, "");
  return cleaned ? `${packageName}/${cleaned}` : packageName;
}

function getPackCommandArgs(packageName: string): string[] {
  return ["pack", "--dry-run", "--json", "--workspace", packageName];
}

function getPackedFileSet(packResult: PackResult): Set<string> {
  return new Set((packResult.files ?? []).map((file) => normalizeRelativePath(file.path)));
}

function toAbsolutePackagePath(packageDir: string, relativePath: string): string {
  return path.resolve(packageDir, relativePath);
}

async function loadPublishablePackages(): Promise<PublishablePackage[]> {
  const packageDirs = await listDirectories(packagesRoot);
  const packages = await Promise.all(
    packageDirs.map(async (dir) => {
      const packageJsonPath = path.join(dir, "package.json");
      const packageJson = await readJson<PackageJson>(packageJsonPath);
      return { dir, packageJsonPath, packageJson };
    }),
  );

  return packages
    .filter((pkg) => !pkg.packageJson.private)
    .sort((a, b) => a.packageJson.name.localeCompare(b.packageJson.name));
}

async function verifyArtifactPaths(
  pkg: PublishablePackage,
  exportTargets: ExportTarget[],
): Promise<void> {
  const { name, types, main, module: modulePath } = pkg.packageJson;

  const distDir = path.join(pkg.dir, "dist");
  if (!(await pathExists(distDir))) {
    fail(`${name}: missing dist/ directory`);
  }

  for (const declaredPath of [types, main, modulePath]) {
    if (!declaredPath) continue;
    const absolutePath = toAbsolutePackagePath(pkg.dir, declaredPath);
    if (!(await pathExists(absolutePath))) {
      fail(`${name}: declared package path does not exist: ${declaredPath}`);
    }
  }

  for (const target of exportTargets) {
    if (!target.target.startsWith("./")) continue;

    if (target.target.includes("*")) {
      const matches = await resolveWildcardMatches(pkg.dir, target.target);
      if (matches.length === 0) {
        fail(
          `${name}: export ${target.exportKey} points to missing wildcard target ${target.target}`,
        );
      }
      continue;
    }

    const absolutePath = toAbsolutePackagePath(pkg.dir, target.target);
    if (!(await pathExists(absolutePath))) {
      fail(`${name}: export ${target.exportKey} points to missing file ${target.target}`);
    }
  }
}

async function verifyPackContents(
  pkg: PublishablePackage,
  exportTargets: ExportTarget[],
): Promise<void> {
  const output = run(npmBin, getPackCommandArgs(pkg.packageJson.name), repoRoot);
  const packResults = JSON.parse(output) as PackResult[];
  const packResult = packResults[0];

  if (!packResult) {
    fail(`${pkg.packageJson.name}: npm pack --dry-run returned no JSON result`);
    return;
  }

  const packedFiles = getPackedFileSet(packResult);

  for (const declaredPath of [
    pkg.packageJson.types,
    pkg.packageJson.main,
    pkg.packageJson.module,
  ]) {
    if (!declaredPath) continue;
    const normalized = normalizeRelativePath(declaredPath);
    if (!packedFiles.has(normalized)) {
      fail(`${pkg.packageJson.name}: packed tarball is missing declared file ${declaredPath}`);
    }
  }

  for (const target of exportTargets) {
    if (!target.target.startsWith("./")) continue;

    if (target.target.includes("*")) {
      const matches = await resolveWildcardMatches(pkg.dir, target.target);
      if (matches.length === 0) continue;
      for (const matched of matches) {
        if (!packedFiles.has(normalizeRelativePath(matched))) {
          fail(
            `${pkg.packageJson.name}: packed tarball is missing exported wildcard file ${matched} for ${target.exportKey}`,
          );
        }
      }
      continue;
    }

    const normalized = normalizeRelativePath(target.target);
    if (!packedFiles.has(normalized)) {
      fail(
        `${pkg.packageJson.name}: packed tarball is missing export target ${target.target} for ${target.exportKey}`,
      );
    }
  }
}

async function buildSmokeImports(
  packages: Array<{ pkg: PublishablePackage; exportTargets: ExportTarget[] }>,
): Promise<void> {
  const tempDir = await mkdtemp(path.join(repoRoot, ".tmp-package-boundaries-"));

  try {
    const importSpecifiers = new Set<string>();

    for (const { pkg, exportTargets } of packages) {
      importSpecifiers.add(pkg.packageJson.name);

      for (const target of exportTargets) {
        if (target.exportKey === ".") continue;

        if (target.exportKey.includes("*")) {
          const matches = await resolveWildcardMatches(pkg.dir, target.target);
          for (const matchedPath of matches) {
            const specifier = exportSpecifierForMatch(
              pkg.packageJson.name,
              target.exportKey,
              matchedPath,
            );
            importSpecifiers.add(specifier);
          }
          continue;
        }

        const subpath = target.exportKey.replace(/^\.\//, "");
        const specifier = `${pkg.packageJson.name}/${subpath}`;
        importSpecifiers.add(specifier);
      }
    }

    const importLines = [...importSpecifiers]
      .sort()
      .flatMap((specifier, index) => [
        `import * as smoke_${index} from "${specifier}";`,
        `void smoke_${index};`,
      ]);

    const tsconfigPath = path.join(tempDir, "tsconfig.json");
    const smokePath = path.join(tempDir, "smoke.ts");

    await writeFile(
      tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            skipLibCheck: false,
            noEmit: true,
          },
          include: ["smoke.ts"],
        },
        null,
        2,
      ),
    );
    await writeFile(smokePath, `${importLines.join("\n")}\n`);

    const result = spawnSync(tscBin, ["-p", tsconfigPath], {
      cwd: tempDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      fail(`package-boundary smoke typecheck failed:\n${output}`);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const publishablePackages = await loadPublishablePackages();
  const packageExports = publishablePackages.map((pkg) => {
    const rootExportValue =
      typeof pkg.packageJson.exports === "string" || Array.isArray(pkg.packageJson.exports)
        ? pkg.packageJson.exports
        : pkg.packageJson.exports?.["."];

    const exportTargets = dedupeTargets(
      rootExportValue ? flattenExports(".", rootExportValue) : [],
    );

    const explicitExports =
      pkg.packageJson.exports &&
      typeof pkg.packageJson.exports === "object" &&
      !Array.isArray(pkg.packageJson.exports)
        ? Object.entries(pkg.packageJson.exports)
            .filter(([key]) => key !== ".")
            .flatMap(([key, value]) => flattenExports(key, value))
        : [];

    return {
      pkg,
      exportTargets: dedupeTargets([...exportTargets, ...explicitExports]),
    };
  });

  for (const { pkg, exportTargets } of packageExports) {
    await verifyArtifactPaths(pkg, exportTargets);
    await verifyPackContents(pkg, exportTargets);
  }

  await buildSmokeImports(packageExports);

  if (failures.length > 0) {
    console.error("Package boundary verification failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Verified package boundaries for ${packageExports.length} publishable packages.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
