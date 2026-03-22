---
"@pokemon-lib-ts/battle": patch
---

fix(battle): reset BattleGimmick per-battle state in BattleEngine constructor — prevents Z-Move/Mega usage tracking from leaking across battles when a shared ruleset instance is reused
