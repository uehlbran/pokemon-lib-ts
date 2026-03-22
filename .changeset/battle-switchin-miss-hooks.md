---
"@pokemon-lib-ts/battle": minor
"@pokemon-lib-ts/gen1": patch
"@pokemon-lib-ts/gen2": patch
---

Add `onSwitchIn` hook to GenerationRuleset interface and wire it in BattleEngine.sendOut(). Fix `onMoveMiss` not being called for semi-invulnerable target misses and recursive move misses. Fix double-KO replacement switch-in abilities targeting fainted Pokemon instead of the new replacements.
