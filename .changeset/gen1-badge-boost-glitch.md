---
"@pokemon-lib-ts/battle": patch
"@pokemon-lib-ts/gen1": minor
---

feat(gen1): implement badge boost glitch via onStatStageChange hook

- Add optional `onStatStageChange` hook to `GenerationRuleset`/`MoveSystem` interface
- Call hook from all stat stage mutation sites in `BattleEngine`
- Add `applyBadgeBoostGlitch` to `Gen1StatCalc` — re-applies ×9/8 badge multiplier to `calculatedStats` on every stat stage change
- Add `badgeBoostGlitch` option to `Gen1RulesetOptions` and `Gen1Ruleset`
- Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts routine
