---
"@pokemon-lib-ts/core": patch
---

Add explicit `gen1toN*` helper names for the shared Gen 1-2, Gen 1-4, and
Gen 1-6 battle logic helpers in `@pokemon-lib-ts/core`.

The old `gen12*`, `gen14*`, and `gen16*` exports remain as deprecated aliases
for compatibility while internal callers move to the clearer public names.
