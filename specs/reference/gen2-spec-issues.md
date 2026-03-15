# Gen 2 Spec Issues: 03-gen2.md vs Ground Truth

Every discrepancy between the existing spec and the ground-truth reference.
Severity: CRITICAL (wrong behavior), MAJOR (missing mechanic), MINOR (cosmetic/clarity).

---

## CRITICAL Issues

### 1. Stat Formula Is Wrong
**Location:** Section 2, lines 37-38
**Problem:** Uses `2 * base + DV + EV / 4` but should use `(Base + DV) * 2 + floor(ceil(sqrt(statExp)) / 4)`. Same bug as Gen 1 spec — wrong order of operations and missing sqrt for stat experience.
**Impact:** Every stat calculation is wrong.

### 2. HP Formula Constant Is Wrong
**Location:** Section 2, line 37
**Problem:** HP formula ends with `+ level + 5` but should be `+ level + 10`.
**Impact:** Every HP calculation is 5 too low.

### 3. Freeze Thaw Chance Is Wrong
**Location:** Section 8, line 522
**Problem:** Spec says "20% chance to thaw each turn." Actual is **25/256 ≈ 9.77%**. This is a massive difference — 20% vs ~10%.
**Impact:** Frozen Pokemon thaw roughly twice as often as they should.

### 4. Poison Type Listed as Special
**Location:** Section 4, line 219 and Section 9, line 544, line 850
**Problem:** Poison is listed under `SPECIAL_TYPES`. Poison is **Physical** in Gen 2.
**Impact:** All Poison-type moves use wrong stat pair (Sp.Atk/Sp.Def instead of Attack/Defense).

### 5. Leech Seed Missing from End-of-Turn
**Location:** Section 11, line 768-769
**Problem:** Spec says "Leech Seed: Not present in Gen 2." **Leech Seed has existed since Gen 1.** It absolutely exists in Gen 2 and deals 1/8 max HP per turn.
**Impact:** Entire mechanic missing.

### 6. Leftovers Timing Wrong
**Location:** Section 11, line 771-777
**Problem:** Spec has Leftovers at Step 4 (after status damage). In Gen 2, **Leftovers triggers BEFORE burn/poison damage** (Step 1 of end-of-turn). This is competitively significant.
**Impact:** Pokemon survive/faint incorrectly at low HP.

### 7. Damage Formula Missing Integer Truncation
**Location:** Section 4, line 182
**Problem:** The formula `((((2 * level / 5 + 2) * move.power * atkStat) / defStat) / 50) + 2` has no `Math.floor()` calls. Every intermediate step needs floor truncation.
**Impact:** Damage calculations can be off by several points.

### 8. Random Factor Implementation Wrong
**Location:** Section 4, lines 201-203
**Problem:** Spec uses `85 + Math.floor(Math.random() * 16)` giving integers 85-100 divided by 100. Actual Gen 2 uses `random(217..255) / 255` which gives different values (217/255 = 0.851, not 85/100 = 0.85).
**Impact:** Slight damage calculation errors.

---

## MAJOR Issues

### 9. Critical Hit Thresholds Are Approximate
**Location:** Section 5, lines 261-266
**Problem:** Spec uses `1/16, 1/8, 1/4, 1/2` but actual Gen 2 thresholds are **17/256, 32/256, 64/256, 85/256, 128/256**. The base rate 17/256 ≈ 6.64%, not 6.25% (1/16). Stage 3 is 85/256 ≈ 33.2%, not 50% (1/2).
**Impact:** Crit rates off for every stage.

### 10. Critical Hit Stat Interaction Not Documented
**Location:** Section 5
**Problem:** Gen 2 crits have conditional stat stage behavior: if defender's stage ≥ attacker's stage, ignore all stages. If attacker's stage > defender's, keep stages. This is completely undocumented.
**Impact:** Crit damage calculated incorrectly in many scenarios.

### 11. Sleep: Can Act on Wake Turn Not Mentioned
**Location:** Section 8, lines 476-478
**Problem:** Spec doesn't mention that Gen 2 Pokemon CAN act on the turn they wake up (unlike Gen 1 where they couldn't). This is a significant competitive change.
**Impact:** Sleep is effectively 1 turn longer than it should be.

### 12. Type Chart Has Fairy References
**Location:** Section 3, lines 99, 104, 105, 112, 113, 114
**Problem:** Multiple type entries reference "Fairy" type which doesn't exist until Gen 6. Needs removal.
**Impact:** Phantom type interactions.

### 13. Steel Weaknesses Wrong
**Location:** Section 3, line 123
**Problem:** Spec says Steel is weak to "Fire, Water, Electric, Ground." Water and Electric are NOT super effective vs Steel. Steel's weaknesses are **Fire, Fighting, Ground**.
**Impact:** Two incorrect type matchups.

### 14. Type-Boosting Items Wrong Multiplier
**Location:** Section 6, line 342
**Problem:** Comments say "+20%" but Gen 2 type-boosting items give **1.1x (10%)**. The 1.2x (20%) multiplier is Gen 4+.
**Impact:** Type-boosted moves do 10% too much damage.

### 15. Wrong Berry Names
**Location:** Section 6, lines 315-322
**Problem:** Uses Gen 3+ berry names (Cheri Berry, Pecha Berry). Gen 2 uses PSNCureBerry, PRZCureBerry, Mint Berry, Ice Berry, etc. Also references Lum Berry (lines 517, 532) which is Gen 3+.
**Impact:** Wrong item names, won't match data.

### 16. Stat Boost Berries Don't Exist in Gen 2
**Location:** Section 6, lines 326-336
**Problem:** Pomeg/Kelpsy/Qualot/Hondew/Grepa/Tamato berries don't exist in Gen 2. These are Gen 3+ berries that reduce EVs.
**Impact:** Phantom items.

### 17. Burn Applied as Post-Modifier
**Location:** Section 4, lines 206-208
**Problem:** Burn is applied after the random factor. Burn should halve the Attack stat BEFORE damage calculation begins, not as a damage modifier at the end.
**Impact:** Burn damage calculation order wrong.

### 18. Protect Success Formula Wrong
**Location:** Section 9, line 557
**Problem:** Spec says "50% on second use." Actual is 1/3 (~33%) — the denominator multiplies by 3 each use, not 2.
**Impact:** Protect succeeds too often on repeated use.

### 19. Trapping Moves Not Updated for Gen 2
**Location:** Not in spec
**Problem:** Gen 2 massively nerfed trapping moves from Gen 1. Target CAN attack while trapped (just can't switch). User is NOT locked into the move. This is not documented.
**Impact:** Trapping moves behave like Gen 1 (way too strong).

### 20. Thunder/SolarBeam Weather Interactions Missing
**Location:** Section 7
**Problem:** Thunder has perfect accuracy in Rain. SolarBeam charges instantly in Sun and has halved power in Rain. Neither documented.
**Impact:** Missing weather-move interactions.

### 21. Reflect/Light Screen Duration Wrong
**Location:** Not explicitly stated
**Problem:** Gen 2 Reflect/Light Screen last 5 turns (changed from Gen 1's permanent). Not clearly documented.
**Impact:** Screens may last wrong duration.

### 22. OHKO Mechanics Changed
**Location:** Not in spec
**Problem:** Gen 2 OHKO moves use level comparison (fail if user < target level), not Speed comparison like Gen 1. This isn't documented.
**Impact:** OHKO moves use wrong comparison.

---

## MINOR Issues

### 23. Wake-Up Slap Doesn't Exist
**Location:** Section 8, line 479
**Problem:** "Wake-Up Slap is a new move that hits harder vs. Sleep" — Wake-Up Slap was introduced in Gen 4, not Gen 2.
**Impact:** Non-existent move referenced.

### 24. Assault Vest Referenced
**Location:** Section 6, line 379
**Problem:** Assault Vest is Gen 6+, not Gen 2.
**Impact:** Non-existent item referenced.

### 25. Shiny Determination Algorithm Incomplete
**Location:** Section 2, lines 51-73
**Problem:** The shiny check code is vague and says "use Bulbapedia's exact algorithm." Should document the actual DV requirements: Atk DV in {2,3,6,7,10,11,14,15}, Def/Spd/Spc DVs all = 10.
**Impact:** Shiny check not implementable from spec.

### 26. Missing Nightmare and Curse Mechanics
**Location:** Not in spec
**Problem:** Nightmare (1/4 max HP while asleep) and Ghost-type Curse (1/4 max HP per turn, costs 1/2 user HP) are not documented, but they appear in end-of-turn.
**Impact:** Missing mechanics.

### 27. Baton Pass Details Incomplete
**Location:** Section 9, line 578
**Problem:** "Deals damage; if opponent switches, damage is doubled" — this describes Pursuit, not Baton Pass. Baton Pass needs its own section listing what it passes.
**Impact:** Key competitive mechanic underdocumented.

### 28. Counter Works Differently in Gen 2
**Location:** Not documented
**Problem:** In Gen 2, Counter reflects damage from any physical-type move (based on the type's physical/special classification). This is broader than Gen 1's Normal/Fighting only.
**Impact:** Counter interacts with wrong moves.

### 29. HP DV Derivation Not Documented
**Location:** Section 2
**Problem:** Same as Gen 1 — HP DV derived from parity of other DVs, not documented.
**Impact:** Missing mechanic.

### 30. Breeding DV Inheritance Wrong
**Location:** Section 10, lines 653-656
**Problem:** Code shows 50/50 random inheritance per stat. Actual Gen 2 breeding: Attack DV random, Defense DV from one parent, Speed/Special from one parent. It's more complex than shown.
**Impact:** Wrong breeding implementation.

### 31. Pokérus Doubles Stat Exp, Not +50% EXP
**Location:** Section 10, lines 724-726
**Problem:** Spec says "+50% EXP while infected." Pokérus actually **doubles stat experience gain**, not regular EXP gain.
**Impact:** Wrong Pokérus effect.

### 32. Sandstorm Damage in Wrong End-of-Turn Position
**Location:** Section 11
**Problem:** Spec has Sandstorm as Step 1 (before status damage). In the ground truth order, Sandstorm is Step 7 (after Leech Seed, Nightmare, Curse).
**Impact:** Sandstorm timing wrong.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 8 |
| MAJOR | 14 |
| MINOR | 10 |
| **Total** | **32** |

The Gen 2 spec shares many of the same fundamental issues as Gen 1 (stat formula, HP constant, missing truncation) plus has numerous Gen 2-specific errors (freeze thaw rate, Leftovers timing, Poison type classification, wrong item names/multipliers).
