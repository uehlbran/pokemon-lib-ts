---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
---

Add `type` parameter to `getBattleGimmick()` so multi-gimmick gens (Gen 7+) can distinguish Mega vs Z-Move vs Dynamax vs Tera requests. Fixes #586.
