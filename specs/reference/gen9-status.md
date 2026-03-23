# Gen 9 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** 100% complete (all 10 waves merged)
**Architecture:** Extends `BaseRuleset`
**Spec:** `specs/battle/10-gen9.md`
**Primary source:** Pokemon Showdown (no Gen 9 disassembly)

---

## Wave Status

| Wave | Name | Status |
|------|------|--------|
| 0 | Package Scaffold + Data + Battle Changes | Merged (PR #715) |
| 1 | Core Mechanic Overrides | Merged (PR #716) |
| 2 | Terastallization BattleGimmick | Merged (PR #718) |
| 3 | Damage Calculation | Merged (PR #722) |
| 4+5 | Weather (Snow) + Terrain + Entry Hazards | Merged (PR #721) |
| 6 | Abilities (Damage) | Merged (PR #727) |
| 7 | Held Items + Booster Energy | Merged (PR #720) |
| 8A | Abilities (Stat/Switch/New) | Merged (PR #729) |
| 8B | Move Effects | Merged (PR #728) |
| 9 | Integration Tests + Docs | This PR |

---

## DONE

| Wave | PR | Description |
|------|-----|-------------|
| 0 | #715 | Package scaffold, data files, type chart, crit calc, smoke tests |
| 1 | #716 | Core ruleset overrides (accuracy, STAB, speed tie, crits, etc.) |
| 2 | #718 | Gen9Terastallization gimmick + calculateTeraStab + 44 tests |
| 3 | #722 | Gen9DamageCalc + Tera STAB integration |
| 4+5 | #721 | Snow weather (Gen9Weather.ts), terrain system (Gen9Terrain.ts), entry hazards (Gen9EntryHazards.ts) -- Heavy-Duty Boots, Sticky Web Contrary, Klutz/Embargo suppression |
| 6 | #727 | Damage-modifying abilities -- Sheer Force, Multiscale, Fluffy, Sturdy OHKO block, Life Orb suppression, etc. |
| 7 | #720 | Held items + Booster Energy -- Gen9Items.ts, choice items, berries, terrain extenders |
| 8A | #729 | New Gen 9 abilities -- Protosynthesis, Quark Drive, Toxic Chain, Good as Gold, Mycelium Might, Embody Aspect, etc. |
| 8B | #728 | Move effects -- Population Bomb, Rage Fist, Last Respects, Shed Tail, Tidy Up, Salt Cure, Tera Blast, Make It Rain, Revival Blessing |
| 9 | (this PR) | Integration tests, coverage verification, gen9-ground-truth.md, docs update |

---

## MISSING / DEFERRED

| Item | Reason |
|------|--------|
| Dynamax | Removed in Gen 9 |
| Mega Evolution | Removed in Gen 9 |
| Z-Moves | Removed in Gen 9 |
| Doubles mechanics | Engine doesn't support doubles |
| Sky Drop / Pledge moves | Same engine-level deferral as Gen 6-8 |
| Psychic Terrain priority block engine wiring | checkPsychicTerrainPriorityBlock() helper exists but not wired into engine move execution path |
| Misty Terrain confusion immunity engine wiring | checkMistyTerrainConfusionImmunity() helper exists but engine applies volatiles unconditionally |

---

## Test Coverage

| Wave | Tests | Description |
|------|-------|-------------|
| 0 | 56 | smoke, data-loading, type-chart |
| 1 | ~30 | ruleset overrides |
| 2 | 44 | canUse, activate, modifyMove, calculateTeraStab, persistence |
| 3 | ~130 | damage calc, Tera STAB integration |
| 4+5 | ~155 | weather, terrain, entry hazards |
| 6 | ~120 | damage-modifying abilities |
| 7 | ~141 | held items, Booster Energy |
| 8A | ~184 | Protosynthesis, Quark Drive, Toxic Chain, Good as Gold, etc. |
| 8B | ~74 | Move effects (Population Bomb, Salt Cure, Shed Tail, etc.) |
| 9 | 35 | Integration tests (cross-mechanic, determinism, Tera+damage) |

**Total: 1,031 tests**

Coverage (v8):
- Statements: 91.56%
- Branches: 82.04%
- Functions: 94.31%
- Lines: 91.56%

---

## Open Bugs

None. All tracked bugs closed.

## Closed Bugs

| Issue | Fixed In | Severity | Summary |
|-------|----------|----------|---------|
| #749 | TBD | MEDIUM | Population Bomb multi-accuracy — each hit now re-rolls accuracy (checkPerHitAccuracy) |
| #750 | TBD | MEDIUM | Shed Tail substitute transfer on switch-in via shed-tail-sub volatile |
| #751 | TBD | LOW | timesAttacked not reset on switch-out for Rage Fist |
| #723 | TBD | MEDIUM | Psychic Terrain priority block implemented via shouldBlockPriorityMove ruleset hook |
| #724 | TBD | MEDIUM | Misty Terrain confusion immunity via shouldBlockVolatile ruleset hook |
| #725 | TBD | LOW | Focus Sash wired to capLethalDamage (survives lethal at 1 HP, consumes item) |
| #726 | TBD | LOW | Lansat Berry sets focus-energy volatile for crit-rate boost |
| #731 | TBD | LOW | Sturdy wired to capLethalDamage (full HP only — blocks OHKO) |


---

## PR History (partial — bughunt additions)

| PR | Branch | What was merged |
|----|--------|-----------------|
| #728 | feat/gen9-wave8b | Wave 8B: move effects (Population Bomb, Salt Cure, Shed Tail stubs, etc.) |
| #753 | feat/gen9-wave9 | Wave 9: integration tests + 100% completion docs |
| TBD | fix/gen5-8-bughunt-status | Bughunt wave 2: timesAttacked reset, Shed Tail transfer, Population Bomb multiaccuracy, Sturdy/Focus Sash capLethalDamage, Misty/Psychic terrain, Lansat Berry (closes #749 #750 #751 #723 #724 #725 #726 #731) |
