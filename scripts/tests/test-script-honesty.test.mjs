import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { validateTestTierDirectory } from "../lib/test-tier-gate.mjs";

const REPO_ROOT = process.cwd();
const TIER_NAMES = ["integration", "smoke", "e2e", "stress"];

function getWorkspacePackagePaths() {
  const packagePaths = [];

  for (const scopeDir of ["packages", "tools"]) {
    for (const entry of readdirSync(join(REPO_ROOT, scopeDir), { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageJsonPath = join(REPO_ROOT, scopeDir, entry.name, "package.json");
      if (existsSync(packageJsonPath)) {
        packagePaths.push(packageJsonPath);
      }
    }
  }

  return packagePaths.sort();
}

function collectTestFiles(dir) {
  /** @type {string[]} */
  const files = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && /\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

test("given advertised non-unit test tiers, when validating workspace scripts, then every advertised tier has runnable tests", () => {
  for (const packageJsonPath of getWorkspacePackagePaths()) {
    const packageDir = join(packageJsonPath, "..");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const scripts = packageJson.scripts ?? {};

    for (const tier of TIER_NAMES) {
      if (!scripts[`test:${tier}`]) {
        continue;
      }

      const validation = validateTestTierDirectory({ cwd: packageDir, tier });
      assert.equal(
        validation.isValid,
        true,
        `${relative(REPO_ROOT, packageDir)} advertises test:${tier} but is not runnable: ${validation.error}`,
      );
    }
  }
});

test("given unit tests under tests/unit, when checking workspace unit scripts, then nested unit tests are discoverable", () => {
  for (const packageJsonPath of getWorkspacePackagePaths()) {
    const packageDir = join(packageJsonPath, "..");
    const unitDir = join(packageDir, "tests", "unit");
    if (!existsSync(unitDir)) {
      continue;
    }

    const testFiles = collectTestFiles(unitDir);
    if (testFiles.length === 0) {
      continue;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const unitScript = packageJson.scripts?.["test:unit"] ?? "";
    const discoversNestedUnitTests =
      unitScript.includes("run-package-tier-tests.mjs unit") || unitScript.includes("tests/unit");

    assert.equal(
      discoversNestedUnitTests,
      true,
      `${relative(REPO_ROOT, packageDir)} has nested tests/unit files but test:unit does not select them`,
    );
  }
});

test("given battle contract tests, when checking ordinary battle test commands, then contracts are part of the normal test path", () => {
  const battlePackageJson = JSON.parse(
    readFileSync(join(REPO_ROOT, "packages", "battle", "package.json"), "utf8"),
  );

  assert.match(
    battlePackageJson.scripts.test,
    /typecheck:contracts/,
    "packages/battle test script must exercise contract checks",
  );
});

test("given the main verification surfaces, when checking their commands, then they run the honest all-tier path", () => {
  const rootPackageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  const verifyLocalSource = readFileSync(join(REPO_ROOT, "scripts", "verify-local.mjs"), "utf8");
  const verifyQuickSource = readFileSync(join(REPO_ROOT, "scripts", "verify-quick.mjs"), "utf8");
  const verifyCiSource = readFileSync(join(REPO_ROOT, "scripts", "verify-ci.mjs"), "utf8");
  const ciSource = readFileSync(join(REPO_ROOT, ".github", "workflows", "ci.yml"), "utf8");

  assert.equal(typeof rootPackageJson.scripts["verify:quick"], "string");
  assert.equal(typeof rootPackageJson.scripts["verify:local"], "string");
  assert.equal(typeof rootPackageJson.scripts["verify:ci"], "string");
  assert.doesNotMatch(
    verifyLocalSource,
    /Promise\.all/,
    "verify-local must execute heavyweight steps serially",
  );
  assert.match(verifyLocalSource, /test:all/, "verify-local must run test:all");
  assert.match(verifyLocalSource, /test:invariants/, "verify-local must run invariant tests");
  assert.match(verifyLocalSource, /oracle:fast/, "verify-local must run the fast oracle proof");
  assert.match(
    verifyLocalSource,
    /validate-control-plane\.ts/,
    "verify-local must validate the control plane before proof preview",
  );
  assert.match(
    verifyLocalSource,
    /status:generate/,
    "verify-local must regenerate completeness status",
  );
  assert.match(
    verifyLocalSource,
    /status:check/,
    "verify-local must enforce generated status honesty",
  );
  assert.match(
    verifyQuickSource,
    /affected:\s*true/,
    "verify-quick should only touch changed workspaces by default",
  );
  assert.match(
    verifyCiSource,
    /test:all/,
    "verify-ci must retain the broad committed-tier test path",
  );
  assert.match(
    verifyCiSource,
    /validate-control-plane\.ts/,
    "verify-ci must validate the control plane",
  );
  assert.match(verifyCiSource, /proof:preview/, "verify-ci must mirror the proof preview step");
  assert.match(
    verifyCiSource,
    /proof:audit:mutation/,
    "verify-ci must run the direct mutation audit",
  );
  assert.match(verifyCiSource, /proof:enforce/, "verify-ci must mirror proof-gate enforcement");
  assert.match(ciSource, /npm run test:all/, "CI must run test:all");
  assert.match(ciSource, /npm run test:workflow/, "CI must run workflow honesty tests");
  assert.match(ciSource, /npm run oracle:fast/, "CI must run fast oracle proof");
  assert.match(ciSource, /npm run status:generate/, "CI must regenerate completeness status");
  assert.match(ciSource, /npm run status:check/, "CI must enforce generated status honesty");
  assert.match(ciSource, /npm run changeset:check/, "CI proof gate must run changeset checking");
  assert.match(
    ciSource,
    /npm run proof:audit:mutation/,
    "CI proof gate must run the direct mutation audit",
  );
});

test("given normal verification package scripts, when checking test commands, then direct vitest calls are routed through the shared wrapper", () => {
  for (const packageJsonPath of getWorkspacePackagePaths()) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const scripts = packageJson.scripts ?? {};

    for (const [scriptName, scriptValue] of Object.entries(scripts)) {
      if (!["test", "test:unit", "test:invariants"].includes(scriptName)) {
        continue;
      }

      assert.doesNotMatch(
        scriptValue,
        /\b(?:npx\s+)?vitest run\b/,
        `${relative(REPO_ROOT, packageJsonPath)} ${scriptName} must use the shared Vitest wrapper`,
      );
    }
  }
});
