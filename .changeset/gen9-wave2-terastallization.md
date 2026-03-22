---
"@pokemon-lib-ts/gen9": minor
"@pokemon-lib-ts/core": patch
"@pokemon-lib-ts/battle": patch
---

feat(gen9): Wave 2 -- Terastallization BattleGimmick + calculateTeraStab

- Gen9Terastallization class implementing BattleGimmick (canUse, activate, modifyMove for Tera Blast)
- calculateTeraStab() helper with full Tera STAB logic including Stellar and Adaptability
- Tera persistence through switches via new PokemonInstance fields (terastallized, teraTypes, stellarBoostedTypes)
- createActivePokemon() updated to restore Tera state on switch-in
