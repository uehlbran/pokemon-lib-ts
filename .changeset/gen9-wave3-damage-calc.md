---
"@pokemon-lib-ts/gen9": minor
---

feat(gen9): Wave 3 -- damage calculation with Tera STAB integration

Add calculateGen9Damage() implementing the full Gen 9 damage formula with
4096-based modifier chain, Tera STAB via calculateTeraStab(), Snow Ice-type
Defense boost, terrain boost, ability/item modifiers, and 130 tests.
