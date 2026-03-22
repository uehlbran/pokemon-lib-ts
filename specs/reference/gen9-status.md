# Gen 9 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~15% complete (Waves 0-2)
**Architecture:** Extends `BaseRuleset`
**Spec:** `specs/battle/10-gen9.md`
**Primary source:** Pokemon Showdown (no Gen 9 disassembly)

---

## Wave Status

| Wave | Name | Status |
|------|------|--------|
| 0 | Package Scaffold + Data + Battle Changes | Merged (PR #715) |
| 1 | Core Mechanic Overrides | Not Started |
| 2 | Terastallization BattleGimmick | In Progress |
| 3 | Damage Calculation | Not Started |
| 4 | Weather System (Snow) | Not Started |
| 5 | Terrain + Entry Hazards | Not Started |
| 6 | Abilities (Damage) | Not Started |
| 7 | Held Items | Not Started |
| 8A | Abilities (Stat/Switch/New) | Not Started |
| 8B | Move Effects | Not Started |
| 9 | Integration + Polish | Not Started |

---

## DONE

| Wave | PR | Description |
|------|-----|-------------|
| 0 | #715 | Package scaffold, data files, type chart, crit calc, smoke tests |

---

## IN PROGRESS

| Item | Branch | Notes |
|------|--------|-------|
| Wave 2 Terastallization | feat/gen9-wave2-terastallization | Gen9Terastallization gimmick + calculateTeraStab + 44 tests |

---

## MISSING / DEFERRED

| Item | Reason |
|------|--------|
| Dynamax | Removed in Gen 9 |
| Mega Evolution | Removed in Gen 9 |
| Z-Moves | Removed in Gen 9 |
| Doubles mechanics | Engine doesn't support doubles |
| Sky Drop / Pledge moves | Same engine-level deferral as Gen 6-8 |

---

## Test Coverage

Wave 0: 56 tests (smoke, data-loading, type-chart)
Wave 2: 44 tests (canUse, activate, modifyMove, calculateTeraStab, persistence)
Current total: 100 tests
Target: ~985 tests at 100% complete
