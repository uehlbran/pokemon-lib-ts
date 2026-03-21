---
"@pokemon-lib-ts/gen3": patch
---

fix(gen3): use Gen 3 halving Protect formula instead of inherited Gen 5+ 1/3^N formula

Gen 3's `rollProtectSuccess` was inheriting the BaseRuleset default of `1/(3^N)` probability
for consecutive uses, which reflects Gen 5+ behavior. Per `pret/pokeemerald
src/battle_script_commands.c`, Gen 3 uses a halving table (`1/(2^N)`), identical to Gen 4.

Each consecutive Protect use now halves the success chance (capped at consecutive index 3 =
12.5%), matching pokeemerald's `sProtectSuccessRate` table.
