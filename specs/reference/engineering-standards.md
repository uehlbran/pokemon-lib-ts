# Engineering Standards

Status docs are summaries, not proof of correctness.

Boundary contracts must be enforced with explicit invariant tests at the seam where the bug can enter the system.

Required standards for this repo:
- Replacement semantics require reload/regression tests. If an API says it replaces prior state, tests must prove stale state is gone after reload.
- Imported identifiers must normalize or fail explicitly at the boundary. Runtime must not silently accept unsupported imported values.
- Battle startup must reject invalid input before state initialization and mutation.
- Battle code must not mutate caller-owned `PokemonInstance` inputs. Runtime mutation belongs on internal battle copies only.
- When a bug is fixed at a subsystem boundary, add or update a narrow invariant test for that boundary instead of relying on broad coverage totals or status docs.

Current foundation-hardening invariant entrypoints:
- `packages/core/tests/unit/invariants/foundation-hardening.invariant.test.ts`
- `packages/battle/tests/unit/invariants/foundation-hardening.invariant.test.ts`
- `tools/data-importer/tests/foundation-hardening.invariant.test.ts`
