---
"@pokemon-lib-ts/gen5": minor
---

Wire Gen 5 ability and move-effect master dispatchers into Gen5Ruleset

- Replace `applyGen5Ability` stub (returned `[]`) with master dispatcher routing all
  AbilityTrigger events to Damage/Stat/Switch/Remaining sub-modules
- Replace `executeGen5MoveEffect` stub (returned empty MoveEffectResult) with master
  dispatcher routing moves through Field -> Behavior -> Combat sub-modules
- Add `applyAbility` override to Gen5Ruleset (was missing -- BaseRuleset no-op default)
- Simplify `executeMoveEffect` to delegate to master dispatcher instead of inline dispatch
- Update index.ts to export all sub-module re-exports through master dispatchers
- Update smoke tests to match new dispatcher signatures
