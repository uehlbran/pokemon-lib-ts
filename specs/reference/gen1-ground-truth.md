# Gen 1 Ground-Truth Mechanics Reference

> Sources: pret/pokered disassembly, Bulbapedia, Smogon RBY research, The Cave of Dragonflies.
> This document is the canonical reference for Gen 1 mechanics. If the spec (02-gen1.md) disagrees with this document, this document is correct.

---

## 1. Stat Calculation

### DVs (Determinant Values), NOT IVs

Gen 1 uses DVs (0-15), not IVs (0-31). Each stat except HP has an independent DV.

**HP DV is derived from other DVs:**
```
HP_DV = (Attack_DV & 1) << 3 | (Defense_DV & 1) << 2 | (Speed_DV & 1) << 1 | (Special_DV & 1)
```
Result: 0-15 based on the parity (odd/even) of the four other DVs.

### Stat Experience (NOT EVs)

Gen 1 uses "Stat Experience" (0-65535 per stat). No total cap — all five stats can be maxed independently.

Gained by defeating Pokemon: you gain stat exp equal to the defeated Pokemon's base stats.

**Stat exp bonus calculation:**
```
statExpBonus = floor(ceil(sqrt(statExp)) / 4)
```
Cap: `ceil(sqrt(65535)) = 256`, capped at 255, so max bonus contribution is `floor(255 / 4) = 63` at level 100.

### Formulas

**HP:**
```typescript
floor(((Base + DV) * 2 + statExpBonus) * Level / 100) + Level + 10
```

**Other stats (Attack, Defense, Speed, Special):**
```typescript
floor(((Base + DV) * 2 + statExpBonus) * Level / 100) + 5
```

Where `statExpBonus = floor(ceil(sqrt(statExp)) / 4)`.

**Special case:** Shedinja (doesn't exist in Gen 1, ignore).

### Stat Stage Multipliers

| Stage | Multiplier (fraction) |
|-------|----------------------|
| -6 | 2/8 = 25% |
| -5 | 2/7 ≈ 28.6% |
| -4 | 2/6 ≈ 33.3% |
| -3 | 2/5 = 40% |
| -2 | 2/4 = 50% |
| -1 | 2/3 ≈ 66.7% |
| 0 | 2/2 = 100% |
| +1 | 3/2 = 150% |
| +2 | 4/2 = 200% |
| +3 | 5/2 = 250% |
| +4 | 6/2 = 300% |
| +5 | 7/2 = 350% |
| +6 | 8/2 = 400% |

Formula: `numerator / denominator` where numerator = max(2, 2 + stage), denominator = max(2, 2 - stage).

Applied as: `floor(stat * numerator / denominator)`.

### Unified Special Stat — Stage Changes (CRITICAL Gen 1 mechanic)

Gen 1 has a **single Special stat** used for both special attack and special defense. There is no Sp.Atk/Sp.Def split.

**Consequence for stat stage changes:** When any move modifies the Special stage (Amnesia, Growth, etc.), it must modify **both** the attacker and defender roles of the Special stat simultaneously:
- `Amnesia` raises Special by +2 — this means both the offense side and defense side go up by +2
- `Growth` raises Special by +1 — same: both sides up by +1
- Moves that lower Special (Psych Up effects, opponent's stat drops) — both sides affected

**Implementation rule:** The stat stage data structure must treat Special as a single unified stage. Any code that separately tracks `spAttack` and `spDefense` stages will produce incorrect behavior. Amnesia/Growth will appear to do nothing to defense (or offense) if they are tracked separately.

Source: pret/pokered — there is only one special stat and one stat stage slot for it.

### Badge Boosts

| Badge | Stat |
|-------|------|
| Boulder | Attack |
| Thunder | Defense |
| Soul | Speed |
| Volcano | Special |

Multiplier: 9/8 (1.125x), floored. **NOT applied in link battles.**

**Badge boost glitch:** When any stat stage is modified in battle, badge boosts are re-applied to the modified stat, causing compounding. Can stack indefinitely until stat caps at 999.

---

## 2. Type Chart (15 Types)

Types: Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon.

**No Steel, Dark, or Fairy types.**

### Key Gen 1-Specific Matchups

| Interaction | Effectiveness | Notes |
|-------------|--------------|-------|
| Ghost → Psychic | **0x (immune)** | BUG: should be 2x. Psychic has no real weakness in Gen 1. |
| Poison → Bug | 2x | Changed to 1x in Gen 2 |
| Bug → Poison | 2x | Changed to 0.5x in Gen 2 |
| Ice → Fire | 1x (neutral) | Changed to 0.5x (NVE) in Gen 2 |
| Ghost → Normal | 0x (immune) | Correct behavior |
| Normal → Ghost | 0x (immune) | Correct behavior |

### Immunities
- Normal → Ghost: 0x
- Ghost → Normal: 0x
- Ghost → Psychic: 0x (BUG)
- Electric → Ground: 0x
- Ground → Flying: 0x

### Physical vs Special (by type)

**Physical types:** Normal, Fighting, Flying, Ground, Rock, Bug, Ghost, Poison
**Special types:** Fire, Water, Electric, Grass, Ice, Psychic, Dragon

Note: Dragon is special. Poison is physical.

---

## 3. Damage Formula

### Complete Order of Operations

```
1. Determine effective level (double if critical hit)
2. Look up Attack and Defense stats:
   - If crit: use unmodified stats (ignore ALL stat stages, Reflect, Light Screen)
   - If not crit: apply stat stages, then Reflect/Light Screen (doubles defense)
   - If burned and move is physical: halve Attack
3. Handle stat overflow: if Attack or Defense >= 256, divide both by 4 mod 256
   - If Attack becomes 0, set to 1
   - If Defense becomes 0: division by zero (crash in original game)
4. Base damage = floor(floor(floor(level * 2 / 5 + 2) * power * attack / defense) / 50) + 2
5. Cap base damage at 997
6. STAB: if move type matches attacker's type, damage += floor(damage / 2)
7. Type effectiveness: for each defender type, multiply damage by effectiveness
   - 2x: damage = floor(damage * 20 / 10)
   - 0.5x: damage = floor(damage * 5 / 10)
   - 0x: damage = 0
   - Applied sequentially for dual types
8. If damage == 0 and move is not immune: damage = 1
9. Random factor: damage = floor(damage * random(217..255) / 255)
10. If final damage == 0 and not immune: damage = 1
```

### Random Factor

Range: 217 to 255 inclusive (39 possible values).
217/255 ≈ 85.1%, 255/255 = 100%.

### STAB

Not a 1.5x multiplier. It's: `damage = damage + floor(damage / 2)`.
This is equivalent to 1.5x with the floor applied to the bonus half, not the total.

### Self-Destruct and Explosion

Target's Defense is **halved** during the damage calculation (before the division step). Effectively doubles the power. User faints regardless of hit/miss/immunity.

---

## 4. Critical Hits

### Rate Formula

**Normal moves:** `threshold = floor(baseSpeed / 2)` → crit if `random(0..255) < threshold`
- Probability: baseSpeed / 512

**High-crit moves** (Slash, Razor Leaf, Crabhammer, Karate Chop):
`threshold = floor(baseSpeed * 8 / 2)` capped at 255 → crit if `random(0..255) < threshold`
- Probability: baseSpeed * 8 / 512 = baseSpeed / 64
- For baseSpeed >= 64, this is virtually guaranteed (255/256)

### Focus Energy Bug

**Intended:** multiply threshold by 4.
**Actual:** divides threshold by 4.
Same bug applies to Dire Hit.

### Crit Damage

Crits **double the level** in the damage formula (not 2x damage).
Crits **ignore ALL stat stages** on both sides.
Crits **ignore Reflect and Light Screen**.
Crits use unmodified base stats.

### Examples

| Pokemon | Base Speed | Normal Crit Rate | High-Crit Rate |
|---------|-----------|-----------------|----------------|
| Alakazam | 120 | 60/256 = 23.4% | 255/256 ≈ 99.6% |
| Tauros | 110 | 55/256 = 21.5% | 255/256 ≈ 99.6% |
| Chansey | 50 | 25/256 = 9.8% | 200/256 = 78.1% |
| Snorlax | 30 | 15/256 = 5.9% | 120/256 = 46.9% |

---

## 5. Accuracy

### Formula

```
threshold = floor(moveAccuracy * accStageMultiplier / evaStageMultiplier)
```
Clamped to 1-255.
Hit if `random(0..255) < threshold`.

### Accuracy/Evasion Stage Multipliers

Same table as stat stages (numerator/denominator system).

### 1/256 Miss Bug

If `threshold` computes to 256 (or higher after stage modifiers on a 100% move), it's stored as a single byte, wrapping to 0. This means:
- 100% accuracy moves (stored as 255 internally) have a 1/256 chance to miss
- `random(0..255) < 255` fails when random == 255

**Swift bypasses the accuracy check entirely** (does not roll). It is the ONLY move that truly cannot miss in Gen 1.

### OHKO Moves (Horn Drill, Guillotine, Fissure)

- Fail automatically if user's Speed < target's Speed
- Base accuracy: 30%
- Affected by accuracy/evasion stages
- X Accuracy makes them auto-hit (bypasses accuracy check, but Speed check still applies)

---

## 6. Status Conditions

### Sleep

- Duration: 1-7 turns (random)
- Counter decremented **before** action check
- **Cannot act on the turn of waking** (counter hits 0 → wake but skip turn)
- Rest: sets counter to exactly 2 (effectively 2 full turns of sleep, wake on 3rd but can't act)
- Sleep counter does NOT reset on switch-out (persists)

### Freeze

- **No natural thaw in Gen 1** (0% per turn)
- Thaw conditions: hit by a damaging Fire-type move, Haze, or item
- Fire Spin does NOT thaw (it's a trapping move, not a standard damaging Fire move — actually need to verify this)
- Ice-type Pokemon cannot be frozen
- Fire-type Pokemon CAN be frozen in Gen 1 (no Fire immunity to freeze)

### Burn

- **1/16 max HP damage per turn** (this IS applied, contrary to some incorrect sources)
- Halves Attack stat (applied to the stat value, not as a stage)
- **Toxic counter bug:** burn damage uses the same counter as Toxic. If a Pokemon was previously Toxic'd, then cured, then burned, the burn damage escalates using the old Toxic counter value.

### Poison (Regular)

- **1/16 max HP damage per turn**

### Toxic (Bad Poison)

- Starts at 1/16, escalates by 1/16 each turn: 1/16, 2/16, 3/16, ...
- Counter resets on switch (reverts to regular poison)
- **Shared counter with burn and Leech Seed** (the toxic counter bug)

### Paralysis

- 25% chance (63/256) of full paralysis (cannot act) each turn
- Speed quartered (×0.25), applied to the stat value directly
- Speed reduction is immediate upon paralysis

### Confusion

- Duration: 1-4 turns (random, counter decremented before check)
- 50% chance to hit self each turn
- Self-hit: 40 power, typeless, physical (uses attacker's own Attack/Defense)
- Clears on switch-out

---

## 7. Move Mechanics

### Secondary Effect Chance

Moves with secondary effects (stat drops, status infliction, flinch) have a `chance` field in their move data. This probability **must be rolled before the effect is applied**, not after.

- Roll: `random(0..255) < floor(chance * 256 / 100)` — i.e., a chance of 10% = threshold 25
- If the roll fails, the secondary effect does not occur
- The chance roll is independent of the damage roll
- **Stat-drop secondaries:** e.g., Psychic has 33% to lower Sp.Def by 1, Blizzard has 10% to freeze, etc.

An implementation that always applies secondary effects (ignoring the chance field) will produce wildly incorrect battle behavior for moves like Psychic, Blizzard, Fire Blast, Body Slam, etc.

### Trapping Moves (Wrap, Bind, Fire Spin, Clamp)

- Duration: 2-5 turns
- Target is **completely immobilized** — cannot attack or switch
- Deals damage each application (same damage as initial hit? Or 1/16? Need to verify — in Gen 1, each hit of the trapping move recalculates damage)
- Attacker is locked into the move for the duration
- If attacker is faster, can trap-lock opponent indefinitely by reusing after duration ends

### Hyper Beam

- Skips recharge if: KOs the target, breaks a Substitute, or misses
- If frozen during recharge turn, stuck in recharge state until thaw

### Counter

- Priority: -1 (acts last)
- Only reflects damage from **Normal and Fighting type moves** (not all physical moves)
- Returns 2x the damage received
- Various storage bugs: can counter damage from previous turn

### Fixed Damage Moves

| Move | Damage | Type |
|------|--------|------|
| Seismic Toss | = user's level | Fighting |
| Night Shade | = user's level | Ghost |
| Dragon Rage | 40 | Dragon |
| Sonic Boom | 20 | Normal |
| Super Fang | 50% current HP | Normal |
| Psywave | random 1 to 1.5x user's level | Psychic |

These ignore Attack/Defense stats and type effectiveness.
Seismic Toss hits Ghost types (despite being Fighting type, it uses fixed damage).

### Multi-Hit Moves

Distribution: 37.5% / 37.5% / 12.5% / 12.5% for 2/3/4/5 hits.
Only first hit can crit. All subsequent hits deal same damage as first.
Ends immediately if it breaks Substitute.

### Self-Destruct / Explosion

- User always faints (even on miss or immunity)
- Target's Defense halved during damage calc

### Struggle

- Used when all PP depleted
- 50 power, Normal type, 100% accuracy (subject to 1/256 miss)
- **Recoil: 50% of damage dealt** (NOT 25% of max HP)
- Does not consume PP

### Rage

- Locks user into Rage after first use (1 PP consumed total)
- Attack rises each time user is hit
- If Rage misses due to accuracy/evasion, can get stuck in permanent miss loop
- Disable interaction bug: Disable always triggers Rage counter buildup

### Bide

- Stores damage for 2-3 turns, returns double
- Bypasses accuracy check
- Known bugs: high-byte damage counter bug, non-damaging move counter bug

### Substitute

- Costs 25% of max HP (user faints if HP is exactly 25%)
- Blocks most status moves
- Does NOT block: sleep, paralysis from status moves
- Confusion self-hit applies to OPPONENT's substitute (bug)
- Crash damage from Jump Kick/Hi Jump Kick applies to opponent's substitute (bug)

### Reflect / Light Screen

- Doubles the relevant defense stat during damage calculation
- **No turn limit in Gen 1** — lasts until the Pokemon switches out or faints
- Ignored by critical hits

### Rest

- Fully heals the user's HP
- Sets primary status to sleep with exactly 2 turns remaining
- Cures any existing status condition before applying sleep
- User wakes at the start of turn 3 (cannot act on the wake turn, same as normal sleep)

### Thrash / Petal Dance

- Locks user into the move for 2-3 turns
- After the lock ends, user becomes confused (confusion applied automatically)
- Cannot switch while locked in

### Mist

- Protects the user's stats from being lowered by the opponent for 5 turns
- Does **not** protect against the user's own stat reductions
- Does **not** protect against Haze (Haze bypasses Mist)
- One layer only — does not stack

### Teleport

- Fails when used by a trainer Pokemon in a trainer battle (no escape from trainer battles)
- In wild battles, functions as an escape attempt (always succeeds for trainer-commanded Pokemon)
- No damage; purely an escape/flee mechanic

### Mimic

- Copies the last move used by the opponent
- Replaces the Mimic slot for the duration of the battle (or until switch)
- The copied move has 5 PP regardless of the original's max PP
- Cannot Mimic: Mimic, Transform, Metronome, Struggle

### Mirror Move

- Calls the last move the opponent used against the user
- Fails if the opponent has not yet used a move, or used a move that cannot be Mirrored
- Cannot mirror: Mirror Move itself

### Transform

- User transforms into the target: copies types, stats, moves (with 5 PP each), and stat stages at the time of transformation
- DVs (for crit rate) do NOT change — user keeps their own DVs
- HP does NOT change — user keeps current HP total
- Stat stages at the moment of transformation are copied, but subsequent stage changes on either side are independent

### Splash

- Has no effect whatsoever
- Displays a message but does nothing to battle state

### Conversion (Gen 1 version)

- Changes user's type to **opponent's type** (not based on user's moves like later gens)

### Haze

- Resets ALL stat stages for both Pokemon
- Cures both Pokemon's status conditions (including freeze — unique to Gen 1)
- Resets Toxic counter
- Removes Leech Seed, Reflect, Light Screen, Focus Energy, confusion, disable

### Metronome

- Calls a random move from the entire Gen 1 move pool
- Cannot call itself or Struggle

---

## 8. Turn Flow

### Turn Order

1. Both players choose action (move or switch)
2. Switches always execute first (before moves)
3. Among moves: higher priority goes first, then higher Speed
4. Speed ties: random 50/50

### Priority Moves in Gen 1

| Move | Priority |
|------|----------|
| Quick Attack | +1 |
| Counter | -1 |

All other moves: priority 0.

### End-of-Turn Order

1. Burn damage (1/16 max HP)
2. Poison damage (1/16 max HP, or N/16 for Toxic)
3. Leech Seed drain (1/16 max HP)
4. Check fainting

The toxic counter bug means burn, poison, and Leech Seed share a counter — the N counter increments across all three effects, not just Toxic.

**Leech Seed position:** Leech Seed always triggers after poison/burn damage and before the faint check. This ordering is fixed — any implementation must list 'leech-seed' as a distinct step between poison and faint-check in `getEndOfTurnOrder()`.

### What Resets on Switch-Out

- Stat stages (all reset to 0)
- Confusion
- Toxic counter (reverts to regular poison)
- Disable
- Rage state
- Type changes (Conversion)
- Trapping/binding
- Focus Energy

### What Persists on Switch-Out

- Sleep counter (does NOT reset)
- Primary status (burn, freeze, paralysis, poison, sleep)

---

## 9. Known Bugs Summary

| Bug | Description | Impact |
|-----|-------------|--------|
| Ghost/Psychic immunity | Ghost → Psychic = 0x instead of 2x | Psychic type has no real weakness |
| 1/256 miss | 100% accuracy moves miss 1/256 of the time | Affects all non-Swift moves |
| Focus Energy | Divides crit rate by 4 instead of multiplying | Move is actively harmful |
| Badge boost stacking | Badge boosts re-apply on stat stage changes | Stats can compound to 999 |
| Toxic counter shared | Burn/poison/Leech Seed share damage counter | Burn can escalate like Toxic |
| Stat overflow | Attack or Defense >= 256 causes divide-by-4 | Can cause division by zero crash |
| Hyper Beam no recharge on KO | Skips recharge when target faints | Makes Hyper Beam much stronger |
| Substitute confusion | Self-hit damages opponent's sub | Rare but exploitable |
| Rage miss loop | Rage can get stuck permanently missing | Effectively kills the Pokemon |
| Sleep wake can't act | Pokemon can't move on the turn it wakes | Effectively +1 sleep turn |

---

## References

- pret/pokered: https://github.com/pret/pokered
- Bulbapedia Damage: https://bulbapedia.bulbagarden.net/wiki/Damage
- Bulbapedia Critical Hit: https://bulbapedia.bulbagarden.net/wiki/Critical_hit
- Bulbapedia Gen 1 Glitches: https://bulbapedia.bulbagarden.net/wiki/List_of_battle_glitches_in_Generation_I
- Smogon RBY Mechanics: https://www.smogon.com/rb/articles/rby_mechanics_guide
- Smogon RBY Trapping: https://www.smogon.com/rb/articles/rby_trapping
- Smogon RBY Speed: https://www.smogon.com/rb/articles/rby_speed
- Smogon RBY Crits: https://www.smogon.com/rb/articles/critical_hits
- Cave of Dragonflies Gen 1 Stats: https://www.dragonflycave.com/mechanics/gen-i-stat-modification/
