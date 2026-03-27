import { fileURLToPath } from "node:url";
import type { Alias } from "vite";

function workspacePackage(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export function workspaceTestAliases(): Alias[] {
  return [
    {
      find: "@pokemon-lib-ts/battle/utils",
      replacement: workspacePackage("./packages/battle/src/utils/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/core",
      replacement: workspacePackage("./packages/core/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/battle",
      replacement: workspacePackage("./packages/battle/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen1",
      replacement: workspacePackage("./packages/gen1/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen2",
      replacement: workspacePackage("./packages/gen2/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen3",
      replacement: workspacePackage("./packages/gen3/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen4",
      replacement: workspacePackage("./packages/gen4/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen5",
      replacement: workspacePackage("./packages/gen5/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen6",
      replacement: workspacePackage("./packages/gen6/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen7",
      replacement: workspacePackage("./packages/gen7/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen8",
      replacement: workspacePackage("./packages/gen8/src/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen9/data",
      replacement: workspacePackage("./packages/gen9/src/data/index.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen9/internal",
      replacement: workspacePackage("./packages/gen9/src/internal.ts"),
    },
    {
      find: "@pokemon-lib-ts/gen9",
      replacement: workspacePackage("./packages/gen9/src/index.ts"),
    },
  ];
}
