const DEFAULT_VERIFY_LOCAL_VITEST_MAX_CONCURRENCY = "2";

function hasCliFlag(args, flagName) {
  return args.some((arg) => arg === flagName || arg.startsWith(`${flagName}=`));
}

function getConfiguredVitestFlag(envKey, defaultValue) {
  const explicitValue = process.env[envKey];
  if (explicitValue) {
    return explicitValue;
  }

  return process.env.VERIFY_LOCAL === "1" ? defaultValue : null;
}

export function buildVitestRunArgs(testArgs = []) {
  const vitestArgs = ["exec", "--", "vitest", "run", ...testArgs];
  const maxWorkers = getConfiguredVitestFlag("VERIFY_LOCAL_VITEST_MAX_WORKERS", null);
  const maxConcurrency = getConfiguredVitestFlag(
    "VERIFY_LOCAL_VITEST_MAX_CONCURRENCY",
    DEFAULT_VERIFY_LOCAL_VITEST_MAX_CONCURRENCY,
  );

  if (
    !maxWorkers &&
    process.env.VERIFY_LOCAL === "1" &&
    !hasCliFlag(testArgs, "--no-file-parallelism")
  ) {
    vitestArgs.push("--no-file-parallelism");
  }

  if (maxWorkers && !hasCliFlag(testArgs, "--maxWorkers")) {
    vitestArgs.push(`--maxWorkers=${maxWorkers}`);
  }

  if (maxConcurrency && !hasCliFlag(testArgs, "--maxConcurrency")) {
    vitestArgs.push(`--maxConcurrency=${maxConcurrency}`);
  }

  return vitestArgs;
}
