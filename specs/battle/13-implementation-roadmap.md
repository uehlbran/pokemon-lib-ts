# Battle Engine Implementation Roadmap

## Next Features

Two major features are pending implementation after Gen 1-9 are complete:

- **Doubles battle support** — `specs/battle/12-doubles.md`
- **Custom Ruleset system** — `specs/battle/11-custom-ruleset.md`

## Decided Ordering

### 1. Doubles Phases 0–4

Implement the slot-aware engine refactor and core doubles mechanics first.

**Why first:** Doubles Phase 0 replaces 63+ hardcoded `active[0]` references in `BattleEngine.ts` with slot-aware helpers (`getActiveSlot`, `getAllActive`, `forEachActive`). This is a foundational infrastructure change. Building CustomRuleset on the pre-refactor API means its engine integration points get written against single-slot assumptions and immediately need updating.

### 2. CustomRuleset

Implement the configuration-driven wrapper class after the engine is slot-aware.

**Why second:** `CustomRuleset` wraps `GenerationRuleset` and delegates — it is format-agnostic by design. Its clause enforcers operate on `BattleState`, which already has `active` as an array. Building it after doubles means it naturally works with both formats from day one with no retrofitting.

### 3. Doubles Phase 5

Implement doubles-specific mechanics (redirection, ally abilities, Helping Hand, screen reduction) last.

**Why last:** The doubles spec explicitly defers competitive clause enforcement to CustomRuleset (e.g., Sleep Clause counting asleep Pokemon per side). Phase 5 needs CustomRuleset to exist so clause enforcement can be wired up correctly.

## Dependency Graph

```
Doubles Phases 0-4
      ↓
 CustomRuleset
      ↓
Doubles Phase 5
```

## Exception

If TPPC needs (ban lists, Battle Tower rulesets) become urgent before doubles work starts, CustomRuleset can ship first. The maintenance cost of keeping its 2 engine call sites (`getAvailableMoves`, `canExecuteMove`) working through the doubles Phase 0 refactor is small.
