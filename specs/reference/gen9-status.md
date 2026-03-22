# Gen 9 Implementation Status

**Last updated:** 2026-03-22
**Overall estimate:** ~5% complete (Wave 0 scaffold only)
**Architecture:** Extends `BaseRuleset`
**Spec:** `specs/battle/10-gen9.md`
**Primary source:** Pokemon Showdown (no Gen 9 disassembly)

---

## Wave Status

| Wave | Name | Status |
|------|------|--------|
| 0 | Package Scaffold + Data + Battle Changes | In Progress |
| 1 | Core Mechanic Overrides | Not Started |
| 2 | Terastallization BattleGimmick | Not Started |
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

_(Nothing merged yet -- Wave 0 in progress)_

---

## IN PROGRESS

| Item | Branch | Notes |
|------|--------|-------|
| Wave 0 scaffold | feat/gen9-wave0-scaffold | Package structure, data, battle pkg changes |

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

Wave 0: 57 tests (smoke, data-loading, type-chart)
Target: ~985 tests at 100% complete
