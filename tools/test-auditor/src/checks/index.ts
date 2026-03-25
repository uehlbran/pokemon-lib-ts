import type { Check } from "../types.ts";
import { checkAssertionStrength } from "./assertion-strength.ts";
import { checkCanonicalPayloadDuplication } from "./canonical-payload-duplication.ts";
import { checkInternalDomainMocking } from "./internal-domain-mock.ts";
import { checkProvenance } from "./provenance.ts";
import { checkRawReferenceIds } from "./raw-reference-id.ts";
import { checkTestIsolation } from "./test-isolation.ts";
import { checkTestNaming } from "./test-naming.ts";
import { checkStaleTestComments } from "./stale-comments.ts";
import { checkTodoSkipDebt } from "./todo-skip-debt.ts";

export const ALL_CHECKS: readonly Check[] = [
  { name: "provenance", run: checkProvenance },
  { name: "assertion-strength", run: checkAssertionStrength },
  { name: "canonical-payload-duplication", run: checkCanonicalPayloadDuplication },
  { name: "test-naming", run: checkTestNaming },
  { name: "test-isolation", run: checkTestIsolation },
  { name: "todo-skip-debt", run: checkTodoSkipDebt },
  { name: "internal-domain-mock", run: checkInternalDomainMocking },
  { name: "stale-test-comments", run: checkStaleTestComments },
  { name: "raw-reference-id", run: checkRawReferenceIds },
];
