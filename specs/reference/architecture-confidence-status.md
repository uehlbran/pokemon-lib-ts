# Architecture Confidence Status

**Last updated:** 2026-03-26  
**Purpose:** Track structural hotspots that reduce correctness confidence, testability, or public API reliability.

## Prioritization Rule

Refactors are in scope, but they must support one or more of:
- correctness confidence
- testability
- public API clarity
- regression-risk reduction

This is not a style-only cleanup list.

## Hotspot Matrix

| Area | Current Risk | Evidence | Why It Matters | Suggested Direction |
| --- | --- | --- | --- | --- |
| `packages/battle/src/engine/BattleEngine.ts` | Critical | Local branch-density scan score `499`; `battle-status.md` documents a 5,678-line engine; many ordering and event responsibilities are centralized | Ordering bugs, branch interaction regressions, and event/state drift are hard to falsify in a giant engine | Continue extracting deterministic sub-pipelines and make ordering contracts separately testable |
| `packages/battle/src/ruleset/BaseRuleset.ts` | High | Branch-density scan score `79`; central shared defaults affect Gen3+ | Shared logic bugs cascade across multiple gens | Split validation, turn-order, and shared mechanic helpers into narrower units |
| `packages/gen1/src/Gen1Ruleset.ts` | High | Branch-density scan score `166`; Gen1 direct ruleset owns many cartridge-specific branches | Large direct ruleset makes ground-truth deltas and stale test assumptions easy to miss | Factor cartridge-specific subsystems into smaller helpers without losing Gen1 ownership |
| `packages/gen4/src/Gen4MoveEffects.ts` | Critical | Open issue #780; branch-density scan score `128`; long-standing god-function evidence | Large switch-heavy move dispatch is brittle and hard to mutation-test | Split into effect-family modules and table-driven move handler registration |
| `packages/gen5-9/src/GenNDamageCalc.ts` | Critical | Open issue #762; branch-density scan scores: Gen5 `107`, Gen6 `124`, Gen7 `142`, Gen8 `144`, Gen9 `159` | Modifier-order, immunity, and gimmick logic can hide in giant pipelines; one bug can affect many interactions | Decompose into staged modifier pipeline with smaller pure helpers |
| `packages/gen5-9/src/GenNItems.ts` | High | Branch-density scan scores: Gen5 `62`, Gen6 `79`, Gen7 `82`, Gen8 `103`, Gen9 `110` | Item-trigger logic is interaction-dense and easy to regress, especially with on-hit/on-turn-end branching | Split by trigger and item family; reduce giant item switches |
| `packages/gen5-9/src/GenNAbilities*` | High | Branch-density scans show dense switch-heavy files across Damage/Switch/Stat/Remaining modules | Ability dispatch drives ordering and modifier behavior; current shape encourages brittle trigger branches | Move toward trigger-keyed dispatch tables with smaller handlers |
| Package export surfaces | High | Open issue #772; current gen packages export many internal helpers alongside consumer-facing API | Public repo users can couple to unstable internal surfaces; refactors become riskier | Separate public consumer API from internal helper exports |
| Mega Evolution data duplication | Medium/High | Open issue #767 | Duplicate data makes behavior drift and public inconsistency more likely | Consolidate shared mega stone data behind a single owned surface |
| On-damage-calc contract boundary | High | Open issue #994 | Unclear boundary encourages direct mutation and hidden coupling | Make damage-calc contract explicit before broader pipeline refactors |
| Barrel/export circularity in battle | Medium | Open issue #1026 | Build warnings indicate boundary ambiguity and brittle import shape | Reduce barrel churn and make package boundaries explicit |

## Current Evidence Inputs

- Open issues:
  - `#780`
  - `#762`
  - `#772`
  - `#767`
  - `#994`
  - `#1026`
- Local branch-density scan across `packages/*/src`
- Existing status docs, especially `battle-status.md`

## First Refactor Candidates

1. `BattleEngine` ordering/resolution helpers that can be extracted without changing public behavior
2. `BaseRuleset` shared validation and shared turn-order helpers
3. `Gen4MoveEffects` effect-family extraction
4. `Gen5-9` damage pipelines into explicit modifier stages
5. `Gen5-9` item/ability dispatch modules into smaller trigger-keyed units
6. Public export cleanup to separate consumer API from internals

## Non-Goals

- cosmetic renaming with no confidence payoff
- mass rewrites detached from correctness or API benefits
- moving generation-specific logic into the battle engine
