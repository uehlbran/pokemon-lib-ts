# Battle Implementation Status

**Last updated:** 2026-03-31
**Overall estimate:** Feature-complete for singles battles, but this page is a summary, not a correctness proof.
**Architecture:** Pluggable gen-agnostic engine. Delegates ALL gen-specific behavior to GenerationRuleset. Depends only on @pokemon-lib-ts/core.

Battle correctness claims now rely on explicit seam tests, especially:
- `packages/battle/tests/unit/invariants/foundation-hardening.invariant.test.ts`
- `packages/battle/tests/unit/battle-engine-surface.test.ts`
- `packages/battle/tests/integration/engine/exp-gain.test.ts`

---

## DONE

### BattleEngine (`packages/battle/src/engine/BattleEngine.ts` — 5,678 lines)
- Full turn resolution loop (turn-start → action selection → priority sort → turn-resolve → turn-end → faint-check)
- `start()`, `submitAction()`, `submitSwitch()`, `getAvailableMoves()`, `getAvailableSwitches()`
- `serialize()`/`deserialize()` — full JSON-safe state serialization
- Event emitter system (`on`/`off`/`getEventLog`/`emit`)
- Factory `fromGeneration()` via GenerationRegistry
- Preflight validation now rejects invalid species, moves, held items, abilities, and malformed singles setups before battle state initialization

### End-of-Turn Pipeline Helper (`packages/battle/src/engine/BattleEndOfTurnPipeline.ts` — 646 lines)
- Extracted residual-effect dispatch order from `BattleEngine`
- Dedupe for `on-turn-end` ability triggers and held-item routing kept outside the engine core
- Keeps the residual-processing pipeline isolated without changing public API or turn ordering

### GenerationRuleset Interface (`packages/battle/src/ruleset/GenerationRuleset.ts` — 753 lines)
- 15 sub-interfaces (ISP): TypeSystem, StatCalculator, DamageSystem, CriticalHitSystem, TurnOrderSystem, MoveSystem, StatusSystem, AbilitySystem, ItemSystem, WeatherSystem, TerrainSystem, HazardSystem, SwitchSystem, EndOfTurnSystem, ValidationSystem
- ~40 methods total; fully covers all battle delegation points

### BaseRuleset (`packages/battle/src/ruleset/BaseRuleset.ts` — 1,027 lines)
- All Gen 3+ defaults: stat calc, crit (Gen 6+ 1.5×), turn order, accuracy/evasion, status damage, freeze/thaw, sleep/confusion/paralysis, Struggle, multi-hit, Protect diminishing returns, bind, perish song
- 17-item EoT order, Pursuit pre-switch, switch-out volatile clearing
- Tests: 4 files, 2,780 lines

### BattleState, BattleSide, ActivePokemon
- `BattlePhase` (8 phases), `BattleFormat` (4 formats — singles only implemented), `WeatherState`, `TerrainState`, `TurnRecord`
- All side/active state: volatiles, stat stages, forced moves, two-turn states, gimmicks, encode/encore, disable, protect counters, future attacks, screens, hazard layers
- Constructor/runtime isolation now keeps caller-owned `PokemonInstance` inputs out of mutable battle state; battle mutations stay on internal clones
- Direct helper invariant coverage now pins malformed battle-wrapper rejection in `packages/battle/tests/unit/utils/battle-helpers.test.ts`, including:
  - invalid `createOnFieldPokemon()` team slots / type lists / persisted Mega-Tera state
  - invalid `createBattleSide()` active-team mismatches, duplicates, and faint-count bounds
  - invalid `createBattleState()` side ordering, counters, premature winners, and singles multi-active layouts

### BattleEvent (30 types), BattleAction (6 types)
- Full discriminated union for all event/action types
- 30 events: battle-start, turn-start/end, send-out, switch, move-used, damage, heal, faint, status, stat-change, weather, terrain, ability, item, message, battle-end, volatiles, hazards, screens, type-change, flee-attempt (Wave 2)

### Turn Flow (fully tested)
- Priority sort with Quick Claw, Trick Room, speed tiebreak
- Accuracy/evasion checks (stage formula)
- Pursuit pre-switch (Gen 2-7)
- PP tracking; Struggle when no PP; PP deduction with Pressure support
- Two-turn moves, semi-invulnerable states
- Protect with diminishing returns
- Gravity countdown and move blocking
- Critical hits (stage calc, item/ability bonuses)
- Multi-hit moves (Gen 5+ distribution, Skill Link)
- Recoil and drain
- Switching (entry hazards, entry abilities, volatile clearing)
- Fainting (Destiny Bond, dedup, battle-end check)

### End-of-Turn Effects (38 handlers implemented)
weather-damage, weather-countdown, terrain-countdown, status-damage, screen-countdown, tailwind-countdown, trick-room-countdown, leftovers, leech-seed, perish-song, curse, nightmare, bind, defrost, safeguard-countdown, mystery-berry, stat-boosting-items, healing-items, encore-countdown, weather-healing, shed-skin, poison-heal, bad-dreams, speed-boost, slow-start-countdown, toxic-orb-activation, flame-orb-activation, black-sludge, aqua-ring, ingrain, wish, future-attack, taunt-countdown, disable-countdown, gravity-countdown, yawn-countdown, heal-block-countdown, embargo-countdown, magnet-rise-countdown

Gen 5+ stubs (moody, harvest, grassy-terrain-heal now implemented in gen5+ rulesets): pickup — added PR #236, still a stub (overworld mechanic)

### Volatile Status Management
- ~30+ volatile types tracked via Map on ActivePokemon
- Confusion, flinch, bound/wrap, substitute, leech seed, curse, nightmare, perish song, encore, disable, taunt, yawn, heal block, embargo, magnet rise, two-turn states, Destiny Bond, sleep/toxic counters, just-frozen

### Ability System (hooks, not implementations)
- Entry triggers (speed-ordered), contact triggers, passive immunity check, flinch trigger (Steadfast)
- `processAbilityResult()` handles 11 effect types
- Actual implementations in gen rulesets

### Held Item System (hooks, not implementations)
- before-turn-order, before-move, holder-side stat-change, foe-side stat-change, on-damage-taken, on-hit, on-contact, and EoT item hooks
- Deferred held-item reactions now flush through move-prevented, passive-immunity, flinch, and failed reactive-switch exits so item consumers stay on the engine-owned seam instead of helper-only branches
- `processItemResult()` handles 8 effect types
- Engine-path regression coverage now pins the shared item seams directly in `packages/battle/tests/integration/engine/held-item-stat-change.test.ts` and `packages/battle/tests/integration/engine/item-force-switch.test.ts`
- Actual implementations in gen rulesets

### Weather System
- WeatherState with turnsRemaining + infinite flag
- weather-damage, weather-countdown, weather-healing processed in EoT
- Weather modification delegated to `applyWeatherEffects()`

### AI Controllers
- `AIController` interface — `chooseAction()`, `chooseSwitchIn()`
- `RandomAI` — random move (with PP) or Struggle; random valid switch, or `null` when no legal replacement exists
- Tests: 2 files, 855 lines

### MockRuleset + MockDataManager (test helpers)
- `tests/helpers/mock-ruleset.ts` — 586 lines, configurable fixed damage/hit/crit
- `tests/helpers/mock-data-manager.ts` — 519 lines

### Serialization
- `serialize()`/`deserialize()` round-trips full battle state including Map/Set/SeededRandom
- Stable-checkpoint restore rules are now pinned directly:
  - rejects lossy non-checkpoint phases during `deserialize()`
  - re-links deserialized `active.pokemon` references back to the saved team instance
  - rejects tampered active/team UID mismatches and contradictory singles active-slot shapes
- Tests: `deserialize.test.ts` (expanded direct restore / malformed-save coverage)

### Foundation Hardening Invariants
- `tests/unit/invariants/foundation-hardening.invariant.test.ts`
- Explicit seam checks for:
  - battle preflight validation
  - caller-input non-mutation across construction, action, and switch flows

---

## STUBBED

- `pickup` — Gen 5+ effect (overworld mechanic, negligible singles battle impact); still a stub in engine

---

## MISSING / DEFERRED

| Item | Notes |
|------|-------|
| Doubles/Triples/Rotation formats | Massive separate initiative; BattleFormat type exists |
| Greedy AI controller | Spec'd but deferred; RandomAI is sufficient for current gens |
| Minimax AI controller | Spec'd but deferred |
| Later-gen held-item trigger surfaces for move miss / sound-move use / room activation | Tracked by `#1746`; Gen 8-9 `Blunder Policy`, `Throat Spray`, and `Room Service` still lack engine dispatch hooks |

This page no longer claims "no missing issues" for singles correctness. New seam regressions are expected to be caught by invariant tests and CI, not by this summary doc.

---

## PR History

| PR | Branch | What was merged |
|----|--------|-----------------|
| (initial) | main | Battle engine bootstrapped: engine, ruleset interface, BaseRuleset, state, events |
| (various) | main | Ongoing engine improvements: EoT handlers, pursuit, gravity, two-turn moves, serialization, AI, test suite expansion |
| #236 | feat/battle-cleanup-spec-sync | processAbilityResult docs, Gen 5+ EoT stubs (moody/harvest/pickup/grassy-terrain-heal), spec sync |
| #242 | feat/battle-run-action | RunAction flee mechanic (FleeSystem interface, BaseRuleset Gen 3+ formula, Gen 1/2 overrides, FleeAttemptEvent) |
| #243 | feat/battle-item-action | ItemAction bag items (BagItemSystem interface, BaseRuleset healing/status/stat/revive, engine executeItem()) |
| #245 | feat/battle-docs-sync (changesets) | Changesets for gen1/gen2 flee + bag item implementations |
| #280 | feat/battle-exp-gain | EXP gain on faint: participation tracker, awardExpForFaint, ExpGainEvent, LevelUpEvent, level-up stat recalc |
| #281 | feat/battle-catch-attempt | Poke Ball catch: CatchSystem interface, CatchResult, BaseRuleset.rollCatchAttempt, executeCatchAttempt, wild-only guard, ballModifier |
| #604 | fix/battle | Focus Sash activation (pre-damage HP check) + Leftovers double-activation fix |
| #607 | fix | Wish delayed heal via `wishSet` field in MoveEffectResult + engine EoT handler; Present heal via `healDefender` field |
| #615 | fix/battle | Sleep Talk/Snore bypass sleep check in `canExecuteMove`; closes #524 |
| #618 | fix/battle/gen2 | Per-hit power via `perHitDamage` field in MoveEffectResult; enables Triple Kick/Beat Up; closes #525 |
| #632 | fix/gen5,gen6 | Type resist berries moved to damage calc; Magic Room suppression added |
| #634 | fix/battle,gen2 | Hazard `maxLayers` delegated to GenerationRuleset (gen-configurable cap) |
| #635 | fix/all-gens | Traded Pokémon EXP bonus: 1.5x same-language, 1.7x international |
| #636 | fix/battle,gen6 | `getBattleGimmick()` gains type parameter for Gen 7 disambiguation |
| #1067 | chore/core-battle-confidence-phase1 | BattleEngine deserialize now rejects lossy non-checkpoint restores, re-links active Pokemon back to saved team instances, and rejects contradictory active/team checkpoint state |
| #1068 | chore/core-battle-confidence-phase2 | Battle helper fixture surfaces now pin malformed `createOnFieldPokemon()` / `createBattleSide()` / `createBattleState()` inputs with direct invariant tests while preserving supported active-only and Tera fallback fixture shapes |
| #1797 | feat/trigger-surface-routing | Shared held-item stat-change / reactive-switch seams for Adrenaline Orb, Eject Pack, Mirror Herb, Clear Amulet, Red Card, and Eject Button, plus early-return flushing for deferred item reactions |
