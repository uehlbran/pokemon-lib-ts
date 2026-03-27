# Testing and Confidence Status

**Last updated:** 2026-03-27
**Purpose:** Track behavioral coverage confidence, architecture/testability hotspots, and cartridge-compliance rollout across the repo.

This document exists because raw line/branch coverage is not enough to claim correctness confidence. The repo needs visible status for:
- behavioral gap coverage
- oracle/compliance coverage
- mutation-testing coverage
- architecture hotspots that materially reduce confidence or public API quality

## Confidence Model

Confidence levels:
- `none` — no meaningful direct coverage
- `weak` — smoke/proxy coverage only; assertions do not prove the core behavior
- `strong` — direct, exact, provenance-backed assertions cover the behavior
- `oracle-backed` — strong local tests plus oracle/differential evidence
- `mutation-backed` — strong local tests plus mutation evidence showing relevant changes are killed

## Current Evidence Summary

### Existing strengths

- `core` reports 95%+ statement coverage and 99%+ branch coverage in [core-status.md](./core-status.md), with strong coverage across formulas and helpers.
- `core` also has direct invalid-state rejection coverage in:
  - `packages/core/tests/unit/logic/stat-inputs.test.ts`
  - `packages/core/tests/unit/logic/pokemon-factory.test.ts`
  - `packages/core/tests/unit/data/data-manager.test.ts`
- `battle` is functionally broad and documents a complete singles engine in [battle-status.md](./battle-status.md), including turn flow and end-of-turn handler coverage.
- `battle` has direct deterministic ordering coverage for same-speed ties, action-type priority, and forced-switch queued-action invalidation in its shared unit/integration suites.
- `battle` also now has direct setup/runtime invariant coverage for helper-built active/side/state wrappers in `packages/battle/tests/unit/utils/battle-helpers.test.ts`, plus stronger deserialize checkpoint/relink validation in `packages/battle/tests/integration/engine/deserialize.test.ts`.
- Gen 1 has the deepest source-backed confidence today:
  - ground-truth / deep-dive coverage
  - replay validation
  - deterministic turn-order coverage
- Gens 3-9 generally have broad test counts and strong branch coverage in status docs, especially Gen 3, Gen 6, Gen 8, and Gen 9.

### Current weaknesses

- Repo confidence is uneven: high raw counts do not imply every high-risk interaction is strongly proven.
- The oracle/compliance system now has an initial fast-path runner plus registry scaffolding for known disagreements and oracle bugs, and the data fast path now resolves matched/stale disagreement ids against the registry. Curated ground-truth scenarios and broader parity slices are still missing.
- Replay validation is still Gen 1-centric via `tools/replay-parser`; it is not yet a cross-gen confidence layer.
- Several open issues still identify correctness gaps in runtime identity, packaging, and missing mechanic coverage.
- Branch-heavy modules remain concentrated in the same mechanic hotspots where regressions are most likely.

## Authority Model

Correctness target is **cartridge accuracy**, not blind Showdown matching.

- Gen 1-3: local pret references in `./references` are authoritative.
- Gen 4: pret decomp is authoritative where the specific battle logic is actually decompiled and reliable; otherwise Showdown + Bulbapedia fallback.
- Gen 5-9: Showdown is the primary operational oracle, with Bulbapedia cross-check.

Showdown comparison is therefore:
- a differential regression detector for Gen 1-4
- a stronger oracle for Gen 5-9

Showdown parity is not the success criterion for Gen 1-4. For those gens, cartridge-accurate behavior wins when the authoritative local/source evidence disagrees with Showdown.

## Behavioral Gap Matrix (Initial Seed)

| Area | Packages | Current Confidence | Evidence | Next Action |
| --- | --- | --- | --- | --- |
| Speed tie determinism | battle | `strong` | Direct deterministic coverage exists in `packages/battle/tests/unit/ruleset/base-ruleset-branches.test.ts`, `packages/battle/tests/unit/ruleset/base-ruleset-rng-determinism.test.ts`, and `packages/battle/tests/integration/engine/battle-engine-branches.test.ts` | Keep strong local coverage and eventually add replay/trace parity for engine-level tie outcomes |
| Bracket modifiers (priority / Trick Room / go-first item family) | battle + all gens | `weak` | Shared engine coverage exists for move priority, action-type priority, and selected go-first items, but the repo still lacks a maintained matrix for combined bracket interactions and cross-gen negative-order classes | Build ordering rows keyed to specific bracket modifiers and close the remaining matrix gaps |
| Queued-action invalidation on forced switch | battle | `strong` | Direct regression coverage exists in `packages/battle/tests/integration/engine/forced-switch.test.ts` and `packages/battle/tests/integration/engine/item-force-switch.test.ts`, including queued move, Struggle, recharge, and item-driven invalidation | Extend the same explicit invalidation checks to the remaining forced-switch sources and faint-replacement edges |
| Base end-of-turn ordering | battle | `strong` | BaseRuleset and engine suites cover default handler ordering and confusion/countdown paths directly | Keep strong local confidence and extend later to trace/oracle validation |
| Gen-specific end-of-turn ordering | battle + gen1-9 | `weak` to `strong` mixed | Engine and per-gen suites cover many handlers, but there is no maintained per-generation order matrix | Build per-gen ordering matrix against tests + source notes |
| Hazard / grounded / semi-invulnerable interactions | gen5-9 | `weak` | Multiple historical bughunt fixes landed across gen5-9, but there is still no maintained confidence row tying those interactions to current test evidence | Audit tests against current rulesets and identify remaining blind spots |
| Data legality / packaging / canonical runtime identity | core + gen1 | `weak` | Open issues `#1014`, `#905`, and `#897` show runtime identity, packaging, and published-consumer confidence gaps still exist | Tighten runtime identity coverage, package-surface checks, and published-install/documentation validation |
| Invalid runtime-state rejection | core + battle | `strong` | `packages/core/tests/unit/logic/stat-inputs.test.ts`, `packages/core/tests/unit/logic/pokemon-factory.test.ts`, `packages/core/tests/unit/data/data-manager.test.ts`, `packages/battle/tests/unit/ruleset/base-ruleset.test.ts`, `packages/battle/tests/unit/battle-engine-surface.test.ts`, `packages/battle/tests/unit/utils/battle-helpers.test.ts`, and `packages/battle/tests/integration/engine/deserialize.test.ts` directly assert invalid bounded-domain input, malformed wrapper setup, and contradictory serialized runtime state are rejected | Continue outward from the helper / deserialize surfaces into the remaining ordering- and trace-centric runtime-state gaps |
| Gen 1 cartridge-only mechanics still outside confidence closure | gen1 | `weak` | Gen 1 has the strongest ground-truth assets, but `#530` remains open for the badge boost glitch | Keep Gen 1 cartridge rows visible and add explicit badge-boost confidence coverage before claiming closure |
| Cross-gen generation-specific move / ability / gimmick gaps | gen4-9 | `weak` | Open issues `#793`, `#788`, `#789`, `#1059`, and `#1060` show real singles mechanic surfaces still missing or still treated as live confidence debt; doubles-only gaps stay tracked separately | Separate missing singles mechanics from deferred doubles mechanics and cover the live singles gaps first |
| Replay / external differential validation | repo-wide | `none` beyond Gen1 | `tools/replay-parser` currently focuses on Gen 1 structural validation | Expand plan from Gen1-only precedent into fast compliance path |
| Oracle/compliance harness | repo-wide | `weak` | Fast path now runs `data` + `stats` for Gen 1-3 with generation-aware normalizations, and the data suite reports matched/stale registry disagreements; curated ground-truth scenarios and broader parity slices are still missing | Extend from fast path to curated ground-truth scenarios and broader package coverage |
| Battle event/state trace consistency | battle | `weak` | Serialization/event tests exist, but there is still no generic trace validator or replay-backed event oracle | Define trace invariants and feed them into the compliance program |

## Architecture Confidence Matrix (Initial Seed)

Metric provenance: the LOC / `switch` / `if` counts below were measured at commit `4c730459` with a local `wc -l` + `rg -c '\bswitch\b'` + `rg -c '\bif\b'` scan across the listed source files on current `main`.

| Hotspot | Risk | Evidence | Suggested Refactor Direction |
| --- | --- | --- | --- |
| `packages/battle/src/engine/BattleEngine.ts` | High | 6133 lines, 58 `switch`, 528 `if`; shared engine choke point for action resolution, event emission, and battle-state mutation | Split action resolution, turn progression, event emission, and state-transition pipelines into smaller engine modules with explicit contracts |
| `packages/gen4/src/Gen4MoveEffects.ts` | High | 2308 lines, 17 `switch`, 176 `if`; issue `#780` | Decompose into move-effect modules grouped by mechanic family |
| `packages/gen1/src/Gen1Ruleset.ts` | High | 2059 lines, 18 `switch`, 167 `if` | Split validation, status flow, move execution helpers, and ordering/state transitions |
| `packages/gen9/src/Gen9Items.ts` | High | 1916 lines, 10 `switch`, 120 `if` | Split by trigger/effect family; move item tables and trigger handlers into smaller modules |
| `packages/gen8/src/Gen8Items.ts` | High | 1860 lines, 12 `switch`, 113 `if` | Split item trigger logic from item metadata/power tables |
| `packages/gen4-9/src/Gen*DamageCalc.ts` family | High | Current main still has large damage modules across the family, including Gen 9 (1591 lines, 1 `switch`, 167 `if`), Gen 7 (1526 lines, 1 `switch`, 147 `if`), Gen 8 (1453 lines, 2 `switch`, 150 `if`), and Gen 6 (1249 lines, 1 `switch`, 130 `if`); issue `#762` covers the remaining decomposition debt after the `on-damage-calc` boundary clarification | Convert the damage family to explicit modifier pipeline stages with clearer pre-/post-modifier contracts |
| `packages/gen7/src/Gen7Items.ts` | High | 1591 lines, 7 `switch`, 86 `if` | Split trigger logic from data tables and grouped item behavior helpers |
| `packages/gen6/src/Gen6AbilitiesSwitch.ts` | High | 1336 lines, 27 `switch`, 78 `if` | Extract trigger-specific dispatch and per-ability handler tables |
| `packages/gen8/src/Gen8AbilitiesSwitch.ts` | High | 1462 lines, 26 `switch`, 97 `if` | Extract per-trigger dispatch maps and reduce repeated ability routing |

### API / Public Surface Hotspots

| Hotspot | Risk | Evidence | Suggested Refactor Direction |
| --- | --- | --- | --- |
| Large package export surfaces | Medium/High | Open issue `#772`; public barrels still mix stable consumer entrypoints with internal helpers, especially in later gen packages | Separate public consumer API from internal helper exports and tighten root/gen barrel contracts |

## Open-Issue Signals Driving This Program

### Issue Classification

Runtime / packaging / consumer-surface gaps:
- `#1014` regional-form species ids are unsupported in the runtime species model
- `#905` Gen 1 `./data` exports are not packaged
- `#897` core README install guidance points to an unpublished package path

Cartridge-accuracy gaps with limited competitive impact:
- `#530` Gen 1 badge boost glitch remains unimplemented, but is explicitly tracked as low-severity single-player cartridge debt rather than a current competitive-engine blocker

Missing singles mechanic gaps:
- `#793` Forecast type change missing in Gen 4-9
- `#788` Ultra Burst missing in Gen 7

Open tracker overlap requiring cleanup:
- `#789` remains as the umbrella tracker for the remaining Gen 7 move-effect tail.

Deferred doubles-only coverage debt:
- `#626` Parental Bond doubles edge case remains deferred to doubles support
- `#141` Plus/Minus remains open, but is also deferred with doubles support

Architecture / API confidence debt:
- `#762` Gen 4-9 damage calculators are still god functions
- `#767` Mega stone data is still duplicated across Gen 6 and Gen 7
- `#772` package barrels still expose unstable internal helpers alongside consumer API
- `#780` `Gen4MoveEffects` is still a god function

Docs / code-quality cleanup:
- `#818`, `#1015`, `#773`

Planned breaking-release cleanup:
- `#1008`, `#1011`, `#1024`

Historical drivers now treated as revalidated/closed rather than live matrix rows:
- older issue ranges such as `#800-#802`, `#895`, `#898-#904`, and `#906-#915` were useful to seed this program, but they are no longer the active issue set on current `main`

## Compliance Rollout Status

Current status:
- Spec exists: [claude-code-cartridge-compliance-system.md](../claude-code-cartridge-compliance-system.md)
- Gen 1 precedent exists:
  - deep-dive validation
  - replay validation
  - replay parser tool
- Fast path is implemented in `tools/oracle-validation`

### Authority Handling

- Gen 1-3: pret-first, with Showdown used only as a differential regression detector
- Gen 4: authority-tagged mixed mode, where pret decomp wins when the relevant battle logic is decompiled and trustworthy; otherwise Showdown + Bulbapedia are the fallback
- Gen 5-9: Showdown is the primary operational oracle, with Bulbapedia cross-check
- Every disagreement must be classified as one of:
  - our bug
  - cartridge-accurate deviation
  - oracle bug
  - unresolved investigation

### Fast Path Status

Implemented now:
- `tools/oracle-validation`
- `npm run oracle:fast`
- data parity scaffolding
- stat parity scaffolding
- ground-truth suite wiring, currently exercised by the Gen 1 dataset and runner path
- machine-readable oracle check ids plus disagreement matching and stale-disagreement reporting for the current data-suite fast path
- first live per-gen known-disagreement entries for the Gen 2 / Gen 3 type-chart Steel interactions, carried as cartridge-backed data-suite mismatches rather than silent parity failures

Still missing from visible confidence:
- curated ground-truth scenario coverage
- replay / trace parity beyond the Gen 1 precedent
- full Gen 4 authority tagging in the compliance results
- broader mechanics / gimmicks / terrain suites from the compliance spec

Planned initial slice:
- data parity
- type-chart parity
- stat parity
- curated damage/mechanic scenarios
- Gen 1-3 first, with generation-aware authority handling
- Current normalizations:
  - compare against base species when the oracle includes alternate forms
  - normalize species ids like `nidoran-f` vs `nidoranf`
  - ignore oracle `???` type rows when comparing against repo type-chart data

## Mutation-Testing Rollout Status

Current status:
- not yet implemented

First target scope:
- `packages/core/src/logic/*`
- `packages/core/src/data/*` where validation/lookups matter
- `packages/battle/src/engine/*`
- `packages/battle/src/utils/*`

First concrete targets:
- `packages/core/src/logic/stat-stages.ts` — do formula and stage-bounds tests kill the obvious branch mutations?
- `packages/core/src/logic/stat-inputs.ts` — do invalid-state constructors/validators actually reject malformed inputs?
- `packages/core/src/logic/pokemon-factory.ts` — do Pokemon creation paths reject contradictory runtime identity/state?
- `packages/core/src/data/data-manager.ts` — do canonical lookup invariants hold when ids or packages drift?
- `packages/core/src/logic/experience.ts`
- `packages/battle/src/ruleset/BaseRuleset.ts` — do shared ordering/helper branches have real falsification coverage?
- `packages/battle/src/ruleset/GenerationRegistry.ts` — does ruleset lookup/wiring fail loudly on bad registrations?
- `packages/battle/src/ruleset/cloneGenerationRuleset.ts` — does generation cloning preserve the expected ruleset identity/behavior?

## Default Next PR Sequence

1. Expand the confidence matrices and live issue mapping on current `main`
2. Close the highest-risk remaining `core` / `battle` ordering and trace-consistency gaps
3. Widen Gen 1 cartridge-confidence rows around the remaining open mechanic debt
4. Extend the oracle fast path with curated ground-truth scenarios
5. Establish the first mutation baseline for `core` + `battle`

## Next Updates Required

This file should be updated when:
- the behavioral gap matrix is expanded beyond the initial seed
- the architecture matrix is reprioritized with stronger evidence
- the fast compliance path lands
- mutation-testing targets and results become concrete
- a hotspot is refactored or explicitly deferred
