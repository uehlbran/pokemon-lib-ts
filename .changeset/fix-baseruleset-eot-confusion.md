---
"@pokemon-lib-ts/battle": patch
---

Fix BaseRuleset: correct end-of-turn ordering to match Showdown residualOrder (future-attack first, wish before weather, leftovers before leech-seed, nightmare/curse before bind) and apply 85-100% random factor to confusion self-hit damage
