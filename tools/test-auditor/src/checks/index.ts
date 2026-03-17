import type { Check } from "../types.ts";
import { checkAssertionStrength } from "./assertion-strength.ts";
import { checkProvenance } from "./provenance.ts";
import { checkTestIsolation } from "./test-isolation.ts";
import { checkTestNaming } from "./test-naming.ts";

export const ALL_CHECKS: readonly Check[] = [
  { name: "provenance", run: checkProvenance },
  { name: "assertion-strength", run: checkAssertionStrength },
  { name: "test-naming", run: checkTestNaming },
  { name: "test-isolation", run: checkTestIsolation },
];
