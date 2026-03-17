# Gen 1 Decomp-Verified Bug Fixes

## Context

Two bugs found by auditing the Gen 1 implementation against the pokered decompilation (pret/pokered). Both confirmed wrong in code via decomp source citations.

**Branch**: `fix/gen1-confusion-haze-decomp`

---

## Bug 1: Confusion Duration — 1-4 → 2-5

**Source**: pokered `effects.asm:1143-1147` — `and $3; inc a; inc a` = random(0-3)+2 = **2-5 turns**

**Fix**: `packages/gen1/src/Gen1Ruleset.ts` — Changed `rng.int(1, 4)` → `rng.int(2, 5)`

---

## Bug 2: Haze Status Curing — Both → Target Only

**Source**: pokered `move_effects/haze.asm:15-43` — non-volatile status cured for **target only**, not both

**Fix**:
- `statusCured = { target: "defender" }` — cure defender status + reset defender stages
- `statStagesReset = { target: "attacker" }` — reset attacker stages only (no status cure)

New `statStagesReset` field added to `MoveEffectResult` in `packages/battle/src/context/types.ts`.

---

## Edge Cases

1. **Toxic counter + Haze**: Attacker badly-poisoned → Haze clears `toxic-counter` volatile (both) but does NOT cure badly-poisoned status (attacker only).
2. **Gen 2 future**: Gen 2 Haze resets stages only, no status cure → will use just `statStagesReset: { target: "both" }`.
