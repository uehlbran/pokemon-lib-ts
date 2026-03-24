# Doubles Battle Support

## Overview

The battle engine supports singles only. This spec designs doubles support — 2 active Pokemon per side, 4 actions per turn, multi-target move resolution, and doubles-specific mechanics (redirection, ally abilities, screen reduction).

**Scope**: Doubles only. Triples and Rotation battles are deferred to separate specs.

## Current State

### Already doubles-ready (no changes needed)

| Component | Location | Status |
|-----------|----------|--------|
| `BattleFormat` type | `BattleState.ts:35` | Includes `"doubles"` |
| `BattleSide.active` | `BattleSide.ts:26` | `(ActivePokemon \| null)[]` — array, comment says "2 for doubles" |
| `MoveAction.targetSide/targetSlot` | `BattleAction.ts:33-36` | Fields exist, currently unused |
| `MoveTarget` type | `move.ts:9-26` | 11 targeting categories covering all doubles scenarios |
| Move data `target` field | All `moves.json` | Every move carries correct `target` value |
| Spread move modifier | Gen 5-9 `*DamageCalc.ts` | 0.75x when `format !== "singles"` and target is spread |
| Quick Guard | Gen 5+ `MoveEffectsField.ts` | Blocks priority > 0 moves |
| Wide Guard | Gen 5+ `MoveEffectsField.ts` | Blocks spread moves |
| Mat Block | Gen 8 `MoveEffects.ts` | Blocks damaging moves, first turn only |
| Crafty Shield | Gen 8 `MoveEffects.ts` | Blocks status moves targeting side |
| `SwitchInEvent.slot` | `BattleEvent.ts:135` | Already carries slot index |
| Follow Me / Rage Powder priority | Move data | Correct priority values |

### Must change

| Component | Issue |
|-----------|-------|
| `BattleEngine.ts` | 63+ hardcoded `active[0]` references; single-target move execution; 2-action turn resolution; single-slot faint handling; single-slot EoT processing |
| `BattleAction.ts` | `SwitchAction` lacks `slot` field; all action types need `slot` for which active position is acting |
| `BaseRuleset.ts` | `resolveTurnOrder()` reads `active[0]` for speed comparison |
| AI controllers | `RandomAI` hardcoded to `active[0]`, returns 1 action per side |
| `BattleEvent.ts` | Most events lack `slot` field |

### Not yet implemented (doubles-specific mechanics)

| Mechanic | Notes |
|----------|-------|
| Redirection | Follow Me, Rage Powder, Lightning Rod/Storm Drain in doubles |
| Ally abilities | Plus/Minus (#141), Friend Guard, Battery, Power Spot, Telepathy, Flower Gift |
| Helping Hand | 1.5x damage boost to ally's next move |
| Screen reduction | 2/3 in doubles instead of 1/2 in singles |
| Intimidate (doubles) | Must affect all opponents, not just one |
| Pledge combos | Grass+Fire/Water Pledge doubles combinations (deferred) |

## Refactoring Strategy

**Incremental helper-method migration.**

A separate `if (format === "doubles")` code path was rejected — it would duplicate ~80% of the turn loop logic, doubling maintenance burden. A massive single refactor of all 63+ sites in a 5400-line file was rejected as unreviewable. Incremental helpers let Phase 0 change zero behavior (all singles tests pass unchanged), then subsequent phases add doubles behavior behind the helpers.

## Phase 0: Foundation Refactor

**Goal**: Replace all `active[0]` references with slot-aware helpers. Zero behavioral change — all 546 existing battle tests must pass unchanged.

### New helper methods on BattleEngine

```typescript
/** Get the active Pokemon in a specific slot. */
getActiveSlot(side: 0 | 1, slot: number): ActivePokemon | null

/** Get all living active Pokemon for a side. */
getAllActive(side: 0 | 1): ActivePokemon[]

/** Get all living active opponents. */
getOpponents(side: 0 | 1): ActivePokemon[]

/** Get the ally in the other active slot (doubles). */
getAlly(side: 0 | 1, slot: number): ActivePokemon | null

/** Determine which slot an ActivePokemon occupies. */
getSlotIndex(side: 0 | 1, active: ActivePokemon): number

/** Iterate all living active Pokemon on both sides. */
forEachActive(callback: (active: ActivePokemon, side: 0 | 1, slot: number) => void): void
```

### Migration targets

- `getActive(side)` → calls `getActiveSlot(side, 0)` (kept temporarily as alias)
- `getOpponentActive(side)` → kept temporarily, callers migrate to `getOpponents()`
- `getSideIndex(active)` → checks all slots, not just `active[0]`
- `createSide()` → initializes `active` array with format-based length (1 singles, 2 doubles)
- All ~15 EoT methods → iterate all active slots instead of `active[0]`
- `checkMidTurnFaints()` → checks all active slots
- `needsSwitchPrompt()` → checks all active slots
- `recordParticipation()` → tracks all active-vs-active pairings

### Files changed

`BattleEngine.ts` only. ~800 lines. Low risk.

## Phase 1: Core Doubles Turn Loop

**Goal**: The engine accepts 2 actions per side, sorts 4 actions by priority, and executes moves with correct targeting.

### Action submission

```typescript
/** New — accepts array of actions, one per active slot. */
submitActions(side: 0 | 1, actions: BattleAction[]): void

/** Existing — kept for backwards compat, wraps in single-element array. */
submitAction(side: 0 | 1, action: BattleAction): void
```

`pendingActions` changes from `Map<0 | 1, BattleAction>` to `Map<0 | 1, BattleAction[]>`.

Validation: `actions.length` must equal the number of living active Pokemon on that side. Both sides' submissions trigger `resolveTurn()`.

### Add `slot` field to action types

```typescript
// BattleAction.ts — add to MoveAction, SwitchAction, StruggleAction, RechargeAction
readonly slot?: number; // which active slot is acting (default 0 for singles)
```

### Target resolution

New `resolveTargets(action, actor, moveData)` method returns `ActivePokemon[]`:

| `MoveTarget` | Singles | Doubles |
|-------------|---------|---------|
| `adjacent-foe` | Single opponent | Target from `targetSide/targetSlot`. Retarget if fainted. |
| `any` | Single opponent | Target from `targetSide/targetSlot`. Can target ally. |
| `random-foe` | Single opponent | Random living opponent via RNG |
| `all-adjacent-foes` | Single opponent | All living opponents |
| `all-foes` | Single opponent | All living opponents |
| `all-adjacent` | Single opponent | All living opponents + ally |
| `adjacent-ally` | — (fails) | The partner in the other slot |
| `self` | Actor | Actor |
| `user-and-allies` | Actor | All living Pokemon on actor's side |
| `user-field` | — (field effect) | — (field effect) |
| `foe-field` | — (field effect) | — (field effect) |
| `entire-field` | — (field effect) | — (field effect) |

**Retarget on faint**: If the chosen target fainted mid-turn, auto-retarget to the other opponent slot. If no valid target, move fails.

### Multi-target move execution

`executeMove()` loops over resolved targets. Each target gets its own:
- Accuracy check
- Damage calculation (spread modifier already in damage calcs)
- Effect application
- Ability/item trigger checks

### Turn order fix

`BaseRuleset.resolveTurnOrder()` reads `active[action.slot ?? 0]` instead of `active[0]` for speed comparison.

### Event updates

Add optional `slot?: number` to: `SwitchOutEvent`, `MoveStartEvent`, `FaintEvent`. Defaults to 0 for backwards compatibility.

### Files changed

`BattleEngine.ts`, `BattleAction.ts`, `BattleEvent.ts`, `BaseRuleset.ts`. ~1100 lines across 2 PRs.

## Phase 2: Faint Handling and Switches

**Goal**: Correct mid-turn faint behavior and post-faint slot replacement.

### Doubles faint rules (Showdown behavior)

- **Mid-turn faint**: Slot becomes null immediately. Partner continues acting.
- **Replacement timing**: End of turn, after all actions and EoT effects resolve.
- **Both Pokemon faint**: Battle may end immediately if no reserves.
- **Replacement order**: Faster Pokemon switches in first (for entry ability trigger order).

### Data structure changes

- `sidesNeedingSwitch`: `Set<0 | 1>` → `Map<0 | 1, number[]>` (side → slot indices needing replacement)
- `pendingSwitches`: keyed by `"${side}-${slot}"` for per-slot replacement

### API updates

```typescript
submitSwitch(side: 0 | 1, teamSlot: number, activeSlot?: number): void
```

`executeSwitch()` uses `action.slot` to switch out the correct active position.

### Self-switch moves

U-turn, Volt Switch, Baton Pass, Shed Tail: the switch-out applies to the specific slot that used the move.

### Files changed

`BattleEngine.ts`. ~400 lines.

## Phase 3: Battle Start and Entry Abilities

**Goal**: Doubles battles correctly send out 2 Pokemon per side at start and fire entry abilities in the right order.

### `start()` method

```typescript
const slotsToFill = this.state.format === "doubles" ? 2 : 1;
for (let slot = 0; slot < slotsToFill && slot < side.team.length; slot++) {
  this.sendOut(side, slot, /* skipAbility */ true, /* activeSlot */ slot);
}
// Then fire entry abilities in speed order across all 4 Pokemon
```

### Entry ability ordering

With 4 Pokemon entering simultaneously, sort by speed for ability trigger order (faster Pokemon's ability fires first). Current code handles 2 — generalize to sort all entering Pokemon.

### Intimidate in doubles

Must fire against all opponents. The engine calls `applyAbility("on-switch-in", ...)` once per opponent and processes each result separately. This avoids changing the `AbilityContext` interface — Intimidate's handler returns a stat drop, the engine applies it to each opponent in sequence.

### Files changed

`BattleEngine.ts`, possibly `context/types.ts`. ~300 lines.

## Phase 4: AI Controller Update

**Goal**: AI controllers produce valid doubles actions.

### Interface addition

```typescript
/** Returns one BattleAction per active slot. */
chooseActions(side: 0 | 1, state: BattleState, ruleset: GenerationRuleset, rng: SeededRandom): BattleAction[]

/** Updated: forSlot parameter indicates which slot needs replacement. */
chooseSwitchIn(side: 0 | 1, state: BattleState, forSlot?: number): number | null
```

### RandomAI update

- Iterate all active slots on the side
- For each slot: pick random move, assign target based on `MoveTarget` type
- Single-target moves: pick random living opponent slot
- Self/ally/field moves: no target selection
- Switch targets: exclude Pokemon already active in other slots
- Include `slot`, `targetSide`, `targetSlot` in `MoveAction`

### Files changed

`AIController.ts`, `RandomAI.ts`. ~200 lines.

## Phase 5: Doubles-Specific Mechanics

**Goal**: Implement mechanics that only apply or behave differently in doubles.

### Redirection

**Follow Me / Rage Powder**: Before target resolution, check for redirection volatiles on opponents. Single-target moves are redirected to the Pokemon with the volatile.
- Rage Powder: blocked by Safety Goggles, Overcoat, and Grass-types
- Implementation: `resolveTargets()` checks for redirection as a pre-pass

**Lightning Rod / Storm Drain (doubles)**: Redirect Electric/Water single-target moves to the ability holder (including ally moves). Already implemented as abilities in singles (immunity + stat boost), but doubles redirection is new behavior.

### Screen reduction in doubles

Reflect/Light Screen reduce by 2/3 (~0.66x) in doubles instead of 1/2 (0.5x) in singles. Damage calc screen modifier code needs a `format` check. Currently hardcoded to `Math.floor(baseDamage / 2)`.

### Ally-affecting abilities

| Ability | Effect | Gens |
|---------|--------|------|
| Plus / Minus | 1.5x SpAtk when ally has the complementary ability | 3+ |
| Friend Guard | Ally takes 0.75x damage | 5+ |
| Battery | Ally's special moves deal 1.3x damage | 7+ |
| Power Spot | Ally's moves deal 1.3x damage | 8+ |
| Flower Gift | Ally gets 1.5x Attack and 1.5x SpDef in sun | 4+ |
| Telepathy | Immune to ally's spread moves | 5+ |

### Helping Hand

1.5x damage multiplier on the ally's next move this turn. Sets a `helping-hand` volatile on the target ally. The damage calc checks for this volatile and applies the modifier.

### Protect variants (context-aware)

Already implemented as move effects. In doubles, their targeting resolution changes:
- Wide Guard: blocks spread moves targeting any Pokemon on the user's side
- Quick Guard: blocks priority moves targeting any Pokemon on the user's side
- These already check volatiles — the engine's target resolution and accuracy check need to honor them for all side members, not just slot 0

### Files changed

Gen-specific ability/damage calc files, `BattleEngine.ts`. ~500 lines.

## Deferred (not in this spec)

| Feature | Reason |
|---------|--------|
| Triples | Adjacency rules (slot 0 can't target slot 2). Separate spec. |
| Rotation | Completely different mechanic (3 Pokemon, 1 attacks). Separate spec. |
| Pledge combos | Grass+Fire/Water combinations. Low priority, complex coordination. |
| Ally Switch | Position-swapping with complex targeting interactions. |
| Doubles-specific AI strategies | Threat assessment, synergy. Separate effort. |
| Doubles competitive clauses | Rule enforcement belongs in CustomRuleset, not engine. |
| Gen 3 spread penalty | Uses `/ 2` not 0.75x. Minor data fix, not architectural. |
| Gen 4 spread penalty | Not implemented. Minor addition to Gen4DamageCalc. |

## File Change Summary

| File | Phases | Scope |
|------|--------|-------|
| `packages/battle/src/engine/BattleEngine.ts` | 0-3, 5 | Major |
| `packages/battle/src/events/BattleAction.ts` | 1 | Minor — add `slot` to all action types |
| `packages/battle/src/events/BattleEvent.ts` | 1 | Minor — add `slot` to several events |
| `packages/battle/src/ai/AIController.ts` | 4 | Minor — add `chooseActions()` |
| `packages/battle/src/ai/RandomAI.ts` | 4 | Moderate — multi-slot actions |
| `packages/battle/src/ruleset/BaseRuleset.ts` | 1 | Minor — slot-aware speed lookup |
| `packages/battle/src/context/types.ts` | 3 | Minor — `opponents?` on AbilityContext |
| Gen 3-9 damage calcs | 5 | Moderate — screen reduction, ally ability modifiers |
| Gen 3-9 ability handlers | 5 | Moderate — Intimidate multi-target, ally abilities |
| `packages/battle/src/state/BattleSide.ts` | — | None |
| `packages/battle/src/state/BattleState.ts` | — | None |

## Verification Plan

| Phase | Test Strategy |
|-------|--------------|
| 0 | All 546 existing singles tests pass unchanged. New tests for helper methods. |
| 1 | `doubles-turn-loop.test.ts` — 4-action submission, priority sort, spread moves, single-target resolution |
| 2 | `doubles-faint-handling.test.ts` — mid-turn faint, slot replacement, double faint |
| 3 | `doubles-battle-start.test.ts` — 2 leads per side, entry ability ordering |
| 4 | `doubles-ai.test.ts` — RandomAI valid doubles actions |
| 5 | `doubles-mechanics.test.ts` — Follow Me, screen reduction, Helping Hand, ally abilities |
| Integration | Full doubles battles with Gen 5 or Gen 9, deterministic seeds |
