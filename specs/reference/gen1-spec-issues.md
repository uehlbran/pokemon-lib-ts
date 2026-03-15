# Gen 1 Spec Issues: 02-gen1.md vs Ground Truth

Every discrepancy between the existing spec and the ground-truth reference.
Severity: CRITICAL (wrong behavior), MAJOR (missing mechanic), MINOR (cosmetic/clarity).

---

## CRITICAL Issues

### 1. Stat Formula Is Wrong
**Location:** Section 2, lines 40-61
**Problem:** The spec uses `2 * baseValue + iv + Math.floor(ev / 4)` which is the modern EV formula. Gen 1 uses Stat Experience with a sqrt:
```
floor(((Base + DV) * 2 + floor(ceil(sqrt(statExp)) / 4)) * Level / 100) + 5
```
The `iv` should be `DV` (0-15), and `Math.floor(ev / 4)` should be `Math.floor(Math.ceil(Math.sqrt(statExp)) / 4)`.
**Impact:** Every stat calculation is wrong.

### 2. HP Formula Constant Is Wrong
**Location:** Section 2, line 60
**Problem:** HP formula ends with `+ level + 5` but should be `+ level + 10`.
**Impact:** Every HP calculation is 5 too low.

### 3. Poison Damage Is Completely Wrong
**Location:** Section 6, lines 470-495 and 892-899
**Problem:** The spec says:
- "Regular Poison: no damage" — **WRONG.** Regular poison deals 1/16 max HP per turn.
- "Badly Poisoned: 1/8 HP damage" — **WRONG.** Toxic starts at 1/16 and escalates by 1/16 each turn (1/16, 2/16, 3/16...).
- `applyStatusDamage()` says "Regular Poison and Burn do no damage in Gen 1" — **COMPLETELY WRONG.** Both deal 1/16 per turn.
**Impact:** Core battle mechanic entirely broken.

### 4. Burn Damage Is Wrong
**Location:** Section 10, line 898
**Problem:** "Regular Poison and Burn do no damage in Gen 1" is false. Burn deals 1/16 max HP per turn.
**Impact:** Burn is non-functional.

### 5. Ghost vs Psychic Bug Description Is Wrong
**Location:** Section 3, lines 109-118
**Problem:** Spec says Ghost moves do "normal damage (1.0x)" to Psychic. Actually they do **0x (immune)**. The bug is that Ghost → Psychic is coded as immune when it should be super effective.
**Impact:** Wrong type effectiveness value.

### 6. STAB Missing from Damage Formula
**Location:** Section 4, lines 148-192
**Problem:** The damage formula code doesn't include STAB at all. STAB should be applied after the base damage calculation: `damage += floor(damage / 2)` if type matches.
**Impact:** STAB damage bonus never applied.

### 7. Damage Formula Missing Type Effectiveness Application Details
**Location:** Section 4
**Problem:** Type effectiveness is described but not shown in the actual formula code. In Gen 1, it's applied as `floor(damage * 20 / 10)` for SE, `floor(damage * 5 / 10)` for NVE, applied sequentially per defender type.
**Impact:** Type effectiveness implementation unclear/wrong.

### 8. Type Chart References Steel Type
**Location:** Section 3, lines 88-105
**Problem:** The type chart table includes Steel in multiple entries (Fire SE vs Steel, Ground SE vs Steel, etc.). Steel does not exist in Gen 1.
**Impact:** Type chart has phantom entries.

---

## MAJOR Issues

### 9. Random Factor Range Is Vague
**Location:** Section 4, line 286
**Problem:** Spec says "0.85 to 1.00" which is approximate. The actual range is 217-255 out of 255 (39 distinct values). Implementation should use `floor(damage * random(217..255) / 255)`.
**Impact:** Could lead to incorrect random roll implementation.

### 10. Sleep: Cannot Act on Wake Turn Not Mentioned
**Location:** Section 6, lines 450-466
**Problem:** The spec doesn't mention that in Gen 1, a Pokemon **cannot act on the turn it wakes up**. Counter is decremented before action check; when it hits 0, wake but forfeit action.
**Impact:** Sleep is 1 turn shorter than it should be.

### 11. Freeze Thaw: Haze Not Mentioned
**Location:** Section 6, lines 426-430
**Problem:** Spec says freeze only thaws from Fire moves or items. Haze also cures freeze in Gen 1 (unique to Gen 1).
**Impact:** Missing thaw condition.

### 12. Toxic Counter Bug Not Mentioned
**Location:** Section 6
**Problem:** The shared counter between Toxic, burn, poison, and Leech Seed is not documented. Burn can escalate using a prior Toxic counter.
**Impact:** Missing a notable Gen 1 bug.

### 13. High-Crit Moves Not Mentioned
**Location:** Section 5
**Problem:** Spec only covers the base `speed / 512` formula. Doesn't mention that Slash, Razor Leaf, Crabhammer, and Karate Chop have 8x the crit rate (`speed / 64`).
**Impact:** Four moves have wrong crit rates.

### 14. Counter Only Works on Normal/Fighting Types
**Location:** Section 9, lines 841-857
**Problem:** Spec says Counter reflects "Physical moves." Actually Counter only reflects damage from **Normal-type and Fighting-type moves specifically**, not all physical moves.
**Impact:** Counter works against wrong moves.

### 15. Hyper Beam Recharge Conditions Incomplete
**Location:** Section 7, lines 583-599
**Problem:** Spec only mentions "KO" as skipping recharge. Hyper Beam also skips recharge if it **breaks a Substitute** or **misses**.
**Impact:** Hyper Beam recharges when it shouldn't.

### 16. Self-Destruct/Explosion Defense Halving Not Mentioned
**Location:** Not in spec
**Problem:** Self-Destruct and Explosion halve the target's Defense stat during damage calculation, effectively doubling their power. Not mentioned anywhere.
**Impact:** Missing a core mechanic of two important moves.

### 17. Struggle Mechanics Not Documented
**Location:** Not in spec
**Problem:** Struggle in Gen 1: 50 power, Normal type, 50% recoil of damage dealt (NOT 25% of max HP like later gens). Not documented.
**Impact:** Missing move mechanic.

### 18. Reflect/Light Screen Duration Wrong
**Location:** Section 10, line 912
**Problem:** Spec says "Effect lasts for 5 turns." In Gen 1, Reflect and Light Screen have **no turn limit** — they last until the Pokemon switches out or faints.
**Impact:** Screens expire too early.

### 19. Stat Overflow Handling Not Documented
**Location:** Not in spec
**Problem:** If Attack or Defense >= 256 during damage calc, both are divided by 4 mod 256. If either becomes 0 after this, Attack is set to 1, but Defense = 0 causes a division-by-zero crash in the original game.
**Impact:** Missing edge case that can crash.

### 20. Dragon Type Classification Missing
**Location:** Section 7, line 544-558
**Problem:** The physical/special type lists don't include Dragon. Dragon is a **Special** type in Gen 1 (only Dragon Rage exists, but the type itself is Special).
**Impact:** Dragon moves would use wrong stat.

### 21. Poison Type Is Physical
**Location:** Section 7, line 549
**Problem:** Poison is listed under `specialTypes` in the code. Poison is actually a **Physical** type in Gen 1.
**Wait — let me recheck.** The spec lists Poison in `specialTypes` at line 549. This is **WRONG**. Poison is Physical.
**Impact:** Poison moves use wrong attack/defense stats.

---

## MINOR Issues

### 22. References to Non-Gen1 Mechanics
**Location:** Various
**Problem:** The spec references Dragon Dance (doesn't exist in Gen 1), Espeon (Gen 2), Steel type, abilities, weather. These shouldn't appear in a Gen 1 spec.
**Impact:** Confusing, suggests mechanics that don't exist.

### 23. Crit Rate Example Math Wrong
**Location:** Section 5, line 373
**Problem:** "Crit rate maxes at ~100% for base Speed 100+" is wrong. Base Speed 100 gives 50/256 ≈ 19.5%, nowhere near 100%. Even Speed 255 gives 127/256 ≈ 49.6% for normal moves.
**Impact:** Misleading example.

### 24. Evasion Formula Has Errors
**Location:** Section 8, line 684
**Problem:** For negative stages, formula uses `3 / (3 + stage)` which for stage = -1 gives `3 / 2 = 1.5` (boost, not reduction). Should match the stat stage multiplier table.
**Impact:** Evasion stages calculated incorrectly.

### 25. DV Terminology
**Location:** Throughout
**Problem:** Spec uses "IV" (Individual Value) which is the Gen 3+ term. Gen 1 uses "DV" (Determinant Value). Range is 0-15, not 0-31.
**Impact:** Confusing terminology, though functionally similar.

### 26. HP DV Derivation Not Documented
**Location:** Section 2
**Problem:** HP DV is derived from the parity of the other four DVs, not independently random. This is not mentioned.
**Impact:** Missing mechanic that affects HP values.

### 27. Confusion Self-Hit Substitute Bug Not Mentioned
**Location:** Not in spec
**Problem:** If a confused Pokemon behind a Substitute hits itself, the damage applies to the **opponent's** Substitute instead.
**Impact:** Missing bug.

### 28. Damage Formula Cap at 997 Not Mentioned
**Location:** Section 4
**Problem:** After the base damage calculation (before STAB/type/random), damage is capped at 997.
**Impact:** Missing cap.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 8 |
| MAJOR | 13 |
| MINOR | 7 |
| **Total** | **28** |

The spec needs a substantial rewrite. The stat formula, poison/burn damage, Ghost/Psychic interaction, and missing STAB are the highest-priority fixes.
