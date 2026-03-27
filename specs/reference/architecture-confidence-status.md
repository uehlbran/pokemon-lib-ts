# Architecture Confidence Status

**Last updated:** 2026-03-27
**Purpose:** Track structural hotspots that reduce correctness confidence, testability, or public API reliability.

## Prioritization Rule

Refactors are in scope, but they must support one or more of:
- correctness confidence
- testability
- public API clarity
- regression-risk reduction

This is not a style-only cleanup list.

## Execution Tracks

The architecture-confidence work is split into three execution tracks:

1. Correctness / testability refactors
   - branch-heavy hotspots that make behavior hard to prove or mutation-test
   - examples: `#762`, `#780`
2. Public API / export-surface cleanup
   - unstable or overly broad public exports that let consumers couple to internal helpers
   - examples: `#772`, `#767`
3. Contract-boundary cleanup
   - implicit cross-package seams where hidden mutation or unclear ownership lowers confidence
   - example: `#994`

## Hotspot Matrix

| Area | Current Risk | Evidence | Why It Matters | Public API Risk | Suggested Direction |
| --- | --- | --- | --- | --- | --- |
| `packages/battle/src/engine/BattleEngine.ts` | Critical | `6133` LOC on current `main`; many ordering and event responsibilities are centralized | Ordering bugs, branch interaction regressions, and event/state drift are hard to falsify in a giant engine | Medium | Continue extracting deterministic sub-pipelines and make ordering contracts separately testable |
| `packages/battle/src/ruleset/BaseRuleset.ts` | High | `1222` LOC on current `main`; central shared defaults affect Gen3+ | Shared logic bugs cascade across multiple gens | Low | Split validation, turn-order, and shared mechanic helpers into narrower units |
| `packages/gen1/src/Gen1Ruleset.ts` | High | `2059` LOC; Gen1 direct ruleset owns many cartridge-specific branches | Large direct ruleset makes ground-truth deltas and stale test assumptions easy to miss | Low | Factor cartridge-specific subsystems into smaller helpers without losing Gen1 ownership |
| `packages/gen4/src/Gen4MoveEffects.ts` | Critical | Open issue `#780`; `2308` LOC; long-standing god-function evidence | Large switch-heavy move dispatch is brittle and hard to mutation-test | Low | Split into effect-family modules and table-driven move handler registration |
| `packages/gen5-9/src/GenNDamageCalc.ts` | Critical | Open issue `#762`; current line counts: Gen5 `1080`, Gen6 `1249`, Gen7 `1526`, Gen8 `1453`, Gen9 `1591` | Modifier-order, immunity, and gimmick logic can hide in giant pipelines; one bug can affect many interactions | Medium | Decompose into staged modifier pipeline with smaller pure helpers |
| `packages/gen5-9/src/GenNItems.ts` | High | Current line counts remain large, including Gen8 `1860` and Gen9 `1916` | Item-trigger logic is interaction-dense and easy to regress, especially with on-hit/on-turn-end branching | Medium | Split by trigger and item family; reduce giant item switches |
| `packages/gen5-9/src/GenNAbilities*` | High | Dense switch-heavy files across Damage/Switch/Stat/Remaining modules | Ability dispatch drives ordering and modifier behavior; current shape encourages brittle trigger branches | Medium | Move toward trigger-keyed dispatch tables with smaller handlers |
| Package export surfaces (`packages/*/src/index.ts`) | High | Open issue `#772`; current gen packages still export broad mixed public/internal surfaces | Public repo users can couple to unstable internal surfaces; refactors become riskier | Critical | Separate public consumer API from internal helper exports |
| Mega Evolution data duplication (`Gen6MegaEvolution` / `Gen7MegaEvolution`) | Medium/High | Open issue `#767` | Duplicate data makes behavior drift and public inconsistency more likely | High | Consolidate shared mega stone data behind a single owned surface |
| On-damage-calc contract boundary (`battle` + `gen*` rulesets) | High | Open issue `#994` | Unclear boundary encourages direct mutation and hidden coupling | High | Make damage-calc contract explicit before broader pipeline refactors |

_Line-count snapshot metadata: command `wc -l packages/battle/src/engine/BattleEngine.ts packages/battle/src/ruleset/BaseRuleset.ts packages/gen1/src/Gen1Ruleset.ts packages/gen4/src/Gen4MoveEffects.ts packages/gen5/src/Gen5DamageCalc.ts packages/gen6/src/Gen6DamageCalc.ts packages/gen7/src/Gen7DamageCalc.ts packages/gen8/src/Gen8DamageCalc.ts packages/gen9/src/Gen9DamageCalc.ts packages/gen8/src/Gen8Items.ts packages/gen9/src/Gen9Items.ts`, commit `f48eec0c`, date `2026-03-27`, artifact `none`._

## Current Evidence Inputs

- Open issues:
  - `#780`
  - `#762`
  - `#772`
  - `#767`
  - `#994`
- Local branch-density scan across `packages/*/src`
- Existing status docs, especially `battle-status.md`

## Blocking Evidence

High/critical hotspots should move when one or more of these are true:
- repeated bugs or regressions cluster in the same module family
- mutation survivors cluster in the same module family
- weak rows in [testing-status.md](./testing-status.md) stay blocked by the current code shape
- export instability or consumer-coupling risk raises the public-API cost of leaving the current shape in place

## Default PR Sequencing

1. `battle` engine / ruleset seams that directly improve ordering confidence
2. `core` / `battle` contract-boundary cleanup, especially `#994`
3. `gen4` move-effects split (`#780`)
4. `gen5-9` damage-pipeline decomposition (`#762`)
5. public export cleanup (`#772`)
6. shared Mega Evolution data cleanup (`#767`)

## First Refactor Candidates

1. `BattleEngine` ordering/resolution helpers that can be extracted without changing public behavior
2. `BaseRuleset` shared validation and shared turn-order helpers
3. Explicit on-damage-calc contract cleanup (`#994`) before broader damage-pipeline work
4. `Gen4MoveEffects` effect-family extraction (`#780`)
5. `Gen5-9` damage pipelines into explicit modifier stages (`#762`)
6. Public export cleanup to separate consumer API from internals (`#772`)
7. Shared Mega Evolution data consolidation before more Gen 6/7 Mega surface growth (`#767`)

## Non-Goals

- cosmetic renaming with no confidence payoff
- mass rewrites detached from correctness or API benefits
- moving generation-specific logic into the battle engine
