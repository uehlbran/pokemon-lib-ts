# Testing Rules

1. **TDD mandatory** -- test before or with implementation. Missing tests for behavior changes is a review finding.
2. **Provenance** -- every hardcoded expected value needs a source comment (Bulbapedia, Showdown, pret disassembly, or inline formula derivation).
3. **Triangulation** -- 2+ independent test cases per formula behavior (Beck's rule).
4. **Canonical data** -- load species/moves/items/abilities from `dataManager.get*()`. Never hardcode canonical data in tests. Never mutate canonical accessor results in place -- clone first.
5. **Owned ids** -- import ids from core/battle/genN exports (`GENN_*_IDS`, `CORE_*`). Never use raw string literals for domain values (types, statuses, volatiles, triggers, genders, ability slots, move categories).
6. **Naming & assertions** -- Given/When/Then names. Exact assertions (`toBe`/`toEqual`/`toBeCloseTo`). Never `toBeTruthy`/`toBeDefined`/`toBeGreaterThan(0)` for formula results. Descriptive local names (`dataManager`, `moveIds`), not cryptic aliases (`M`, `dm`).
7. **Fixtures** -- use explicit `createSynthetic*` builders to diverge from canonical data. No ambiguous `make*` helpers. Canonical helpers read like getters; synthetic helpers use `create...` names. Data-backed defaults (PP, base power, etc.) come from canonical data, not hardcoded literals.
8. **Bounded inputs** -- use validated creation helpers (`createIvs`, `createEvs`, `createDvs`, `createStatExp`) instead of raw object literals. Generation-valid references only (no Dark type in Gen 1, no abilities in Gen 1-2). Shared constants do not override generation semantics (e.g., Gen 1-3 move categories come from the type split, not Gen 4+ per-move metadata).
