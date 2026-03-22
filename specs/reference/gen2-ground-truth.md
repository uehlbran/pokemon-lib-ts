# Gen 2 Ground-Truth Mechanics Reference

> Sources: pret/pokecrystal disassembly, Bulbapedia, Smogon GSC research.
> This document is the canonical reference for Gen 2 mechanics. If the spec (03-gen2.md) disagrees with this document, this document is correct.

---

## 1. Stat Calculation

### Same DV/Stat Exp System as Gen 1

Gen 2 uses the **exact same** stat calculation system as Gen 1. DVs (0-15), Stat Experience (0-65535), same formulas.

**HP:**
```typescript
floor(((Base + DV) * 2 + floor(ceil(sqrt(statExp)) / 4)) * Level / 100) + Level + 10
```

**Other stats (Attack, Defense, Speed, Sp.Atk, Sp.Def):**
```typescript
floor(((Base + DV) * 2 + floor(ceil(sqrt(statExp)) / 4)) * Level / 100) + 5
```

### Special Stat Split

The major change: Gen 1's single "Special" stat is split into **Sp.Atk** and **Sp.Def**.
- Both share the same DV (the "Special DV")
- Both have independent Stat Experience values
- Both have independent base stats per species

### HP DV Derivation

Same as Gen 1: `HP_DV = (Atk_DV & 1) << 3 | (Def_DV & 1) << 2 | (Spd_DV & 1) << 1 | (Spc_DV & 1)`

### Shiny Determination (Gen 2 Specific)

Based on DVs:
- Attack DV must be 2, 3, 6, 7, 10, 11, 14, or 15
- Defense DV must be 10
- Speed DV must be 10
- Special DV must be 10

Probability: approximately 1/8192.

### Stat Stage Multipliers

Same table as Gen 1:

| Stage | Multiplier |
|-------|-----------|
| -6 | 2/8 |
| -5 | 2/7 |
| -4 | 2/6 |
| -3 | 2/5 |
| -2 | 2/4 |
| -1 | 2/3 |
| 0 | 2/2 |
| +1 | 3/2 |
| +2 | 4/2 |
| +3 | 5/2 |
| +4 | 6/2 |
| +5 | 7/2 |
| +6 | 8/2 |

Applied as: `floor(stat * numerator / denominator)`.

---

## 2. Type Chart (17 Types)

Types: Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon, **Dark**, **Steel**.

### Changes from Gen 1

| Change | Gen 1 | Gen 2 |
|--------|-------|-------|
| Ghost → Psychic | 0x (immune, bug) | **2x** (super effective, bug fixed) |
| Bug → Poison | 2x (super effective) | **0.5x** (not very effective) |
| Poison → Bug | 2x (super effective) | **1x** (neutral) |
| Ice → Fire | 1x (neutral) | **0.5x** (not very effective) |

### New Type Interactions

**Dark type:**
- Super effective against: Psychic, Ghost
- Not very effective against: Fighting, Dark, Steel
- Immune to: Psychic (attacking Dark)
- Weak to: Fighting, Bug

**Steel type:**
- Super effective against: Ice, Rock
- Not very effective against: Fire, Water, Electric, Steel
- Immune to: Poison (attacking Steel)
- Weak to: Fire, Fighting, Ground
- Resists: Normal, Flying, Rock, Bug, Ghost, Steel, Grass, Psychic, Ice, Dragon, Dark

### Immunities

- Normal → Ghost: 0x
- Ghost → Normal: 0x
- Electric → Ground: 0x
- Ground → Flying: 0x
- Psychic → Dark: 0x
- Poison → Steel: 0x
- Fighting → Ghost: 0x

### Physical vs Special (by type)

**Physical:** Normal, Fighting, Flying, **Poison**, Ground, Rock, Bug, Ghost, **Steel**
**Special:** Fire, Water, Electric, Grass, Ice, Psychic, Dragon, **Dark**

Note: Poison is PHYSICAL. Dark is SPECIAL. Same type-based split as Gen 1, with the two new types assigned.

---

## 3. Damage Formula

### Complete Order of Operations

The base formula is identical to Gen 1:

```
1. Determine effective level (double if critical hit — see crit section for caveats)
2. Look up Attack and Defense stats:
   - If crit: conditional behavior (see crit section)
   - If not crit: apply stat stages, Reflect/Light Screen
   - If burned and move is physical: halve Attack stat
3. Handle stat overflow: same as Gen 1 (if Atk or Def >= 256, divide both by 4 mod 256)
4. Base damage = floor(floor(floor(level * 2 / 5 + 2) * power * attack / defense) / 50) + 2
5. Cap base damage at 997
6. STAB: if move type matches attacker type, damage += floor(damage / 2)
7. Type effectiveness: applied sequentially per defender type
   - SE: damage = floor(damage * 20 / 10)
   - NVE: damage = floor(damage * 5 / 10)
   - Immune: damage = 0
8. If damage == 0 and not immune: damage = 1
9. Random factor: damage = floor(damage * random(217..255) / 255)
10. If final damage == 0 and not immune: damage = 1
```

### Weather Modifiers

Applied as multipliers on the damage:
- **Rain Dance:** Water moves ×1.5, Fire moves ×0.5
- **Sunny Day:** Fire moves ×1.5, Water moves ×0.5
- **Sandstorm:** No direct damage modifier (only deals end-of-turn damage)

Weather modifiers are applied after STAB but before random factor.

### Held Item Damage Modifiers

Type-boosting held items give **1.1x (10%) boost** in Gen 2:
- Charcoal (Fire), Mystic Water (Water), Magnet (Electric), Miracle Seed (Grass), NeverMeltIce (Ice), BlackBelt (Fighting), Poison Barb (Poison), Soft Sand (Ground), Sharp Beak (Flying), TwistedSpoon (Psychic), SilverPowder (Bug), Hard Stone (Rock), Spell Tag (Ghost), Dragon Fang (Dragon), BlackGlasses (Dark), Metal Coat (Steel), Silk Scarf/Pink Bow (Normal — Pink Bow is 1.1x in Gen 2)

Species-specific items:
- **Light Ball** (Pikachu): doubles Sp.Atk
- **Thick Club** (Cubone/Marowak): doubles Attack
- **Metal Powder** (Ditto): doubles Defense when untransformed

### Self-Destruct / Explosion

Same as Gen 1: target's Defense is halved during damage calculation. User faints regardless.

---

## 4. Critical Hits

### Stage-Based System (New in Gen 2)

Gen 2 replaced Gen 1's speed-based crit formula with a **threshold system**:

| Crit Stage | Threshold (T) | Probability |
|-----------|---------------|-------------|
| 0 (base) | 17 | 17/256 ≈ 6.64% |
| +1 | 32 | 32/256 = 12.5% |
| +2 | 64 | 64/256 = 25% |
| +3 | 85 | 85/256 ≈ 33.2% |
| +4 | 128 | 128/256 = 50% |

Crit occurs if `random(0..255) < threshold`.

**Important:** These are NOT exact fractions (1/16, 1/8, 1/4). The threshold 17 gives 17/256, not 16/256.

### Crit Stage Sources

| Source | Stage Bonus |
|--------|------------|
| High-crit moves (Slash, Razor Leaf, Crabhammer, Cross Chop, Karate Chop, Aeroblast) | +1 |
| Focus Energy / Dire Hit | +1 |
| Scope Lens (held item) | +1 |
| Stick (Farfetch'd held item) | +2 |
| Lucky Punch (Chansey held item) | +2 |

### Focus Energy Fix

**Fixed in Gen 2.** Focus Energy correctly adds +1 crit stage (not +2 as some sources claim — verify against pokecrystal). The Gen 1 divide-by-4 bug is gone.

### Crit Damage Behavior

Crits **double the level** in the damage formula (same mechanical approach as Gen 1).

**Stat stage interaction** (unique to Gen 2):
- If the target's defense stage modifier is greater than or equal to the attacker's attack stage modifier: crit ignores ALL stat stage changes on both sides, and ignores Reflect/Light Screen
- If the attacker's attack stage modifier is greater: stat stages apply normally even for crits

This means crits conditionally ignore stat changes — they ignore unfavorable situations for the attacker but keep favorable ones.

---

## 5. Accuracy

### Formula

Same as Gen 1: `threshold = floor(moveAccuracy * accStageMultiplier / evaStageMultiplier)`

### 1/256 Miss Bug — Partially Fixed

- If the computed threshold = 255 or higher (i.e., 100% accuracy with no stage modifiers), the move **always hits** (no random check)
- If threshold < 255 (accuracy modified by stages), the 1/256 glitch can still occur
- Swift still bypasses the accuracy check entirely

### OHKO Moves

- Fail if user's level < target's level (changed from Speed comparison in Gen 1)
- Base accuracy: 30 (raw 0-255 byte; 30/256 ≈ 11.7% hit rate at equal levels)
- Accuracy increases by 2 units per level the user is above the target — `add a` in decomp doubles the level difference
- Source: pret/pokecrystal engine/battle/effect_commands.asm:5440 (BattleCommand_OHKO)
- Not affected by accuracy/evasion stage modifiers

---

## 6. Status Conditions

### Sleep

- **Duration:** 1-7 turns (random)
- **CAN act on wake turn** (unlike Gen 1 where you couldn't)
- Sleep counter decremented at the start of the turn; if it hits 0, wake up AND act
- Sleep counter does NOT reset on switch (persists across switches)
- Sleep Talk and Snore can be used while asleep (new in Gen 2)

### Freeze

- **Natural thaw: 25/256 per turn** (≈9.77%, NOT 20%)
- Checked at the start of the turn; if thaw, Pokemon CAN act
- Also thaws from: damaging Fire-type moves, Flame Wheel (self-thaw), Sacred Fire (self-thaw)
- Haze no longer cures freeze (Gen 1 only)
- Ice-type Pokemon cannot be frozen (immunity added in Gen 2)

### Burn

- **1/8 max HP damage per turn** (increased from Gen 1's 1/16)
- **Halves Attack stat** (applied to the stat directly, not as a damage modifier)
- Fire-type Pokemon cannot be burned (immunity added in Gen 2)

### Poison (Regular)

- **1/8 max HP damage per turn** (same as Gen 1)
- Poison-type and Steel-type Pokemon cannot be poisoned

### Toxic (Bad Poison)

- Starts at 1/16 max HP, escalates by 1/16 each turn (N/16 where N = turn count)
- **Counter resets on switch** (reverts to regular poison in Gen 2)
- The Gen 1 toxic counter bug (shared with burn/Leech Seed) is **fixed in Gen 2**

### Paralysis

- 25% chance (63/256) of full paralysis each turn
- Speed quartered (×0.25)
- Electric-type Pokemon CAN be paralyzed in Gen 2 (no immunity until Gen 6)

### Confusion

- Duration: 2-5 turns
- 50% chance to hit self each turn
- Self-hit: 40 power, typeless, physical, uses own Attack/Defense, no crit
- Clears on switch-out

---

## 7. Held Items

### Key Battle Items

| Item | Effect | Timing |
|------|--------|--------|
| Leftovers | Recover 1/16 max HP | End of turn |
| Scope Lens | +1 crit stage | Passive |
| King's Rock | 10% flinch on any damaging move | On hit |
| Quick Claw | ~23.4% chance to go first (60/256) | Start of turn |
| Focus Band | 12% chance to survive lethal hit at 1 HP | On hit |
| Bright Powder | Reduces opponent's accuracy by ~6% | Passive |
| Light Ball | Doubles Pikachu's Sp.Atk | Passive |
| Thick Club | Doubles Cubone/Marowak's Attack | Passive |
| Metal Powder | Doubles Ditto's Defense (untransformed) | Passive |
| Berry | Restores 10 HP when HP ≤ 50% | Auto |
| Gold Berry | Restores 30 HP when HP ≤ 50% | Auto |
| PSNCureBerry | Cures poison | Auto |
| PRZCureBerry | Cures paralysis | Auto |
| Ice Berry | Cures burn | Auto |
| Mint Berry | Cures sleep | Auto |
| MiracleBerry | Cures any status | Auto |
| Bitter Berry | Cures confusion | Auto |

**Important:** Gen 2 does NOT use Cheri Berry, Pecha Berry, Lum Berry, etc. Those are Gen 3+ berry names.

### Type-Boosting Items

All give **1.1x (10%) boost** to matching type moves. See §3 for full list.

---

## 8. Weather

### Rain Dance

- Duration: 5 turns
- Water moves: ×1.5 damage
- Fire moves: ×0.5 damage
- Thunder: bypasses accuracy check (always hits)
- SolarBeam: halved power (60 instead of 120)
- Moonlight/Morning Sun: restores 1/4 max HP (instead of 1/2)

### Sunny Day

- Duration: 5 turns
- Fire moves: ×1.5 damage
- Water moves: ×0.5 damage
- SolarBeam: charges instantly (no charge turn)
- Moonlight/Morning Sun: restores 3/4 max HP
- Synthesis: restores 3/4 max HP

### Sandstorm

- Duration: 5 turns
- Deals 1/8 max HP damage to non-Rock/Ground/Steel Pokemon at end of turn
- Does NOT boost Rock-type Sp.Def (that's Gen 4+)

---

## 9. Move Mechanics

### New Priority Moves

| Move | Priority | Notes |
|------|----------|-------|
| Protect / Detect | +3 | Blocks most moves for one turn |
| Endure | +3 | Survives at 1 HP |
| Quick Attack | +1 | Same as Gen 1 |
| Mach Punch | +1 | New Fighting priority move |
| ExtremeSpeed | +1 | New Normal priority move |
| Vital Throw | -1 | Never misses, goes last |
| Counter | -1 | Same as Gen 1 |
| Mirror Coat | -1 | Reflects special damage (new) |
| Roar / Whirlwind | -1 | Forces switch (now works on trainers) |

### Protect / Detect

- First use: always succeeds
- Success rate: `1/(X)` where X starts at 1 and multiplies by 3 each consecutive use
  - Use 1: 100%, Use 2: ~33% (85/256), Use 3: ~11% (28/256), Use 4: ~4% (9/256)
- Counter resets when a different move is used
- **Denominator cap: 255** — after enough consecutive uses, X is capped at 255. It does NOT reach 729 (3^6). The cap prevents the denominator from exceeding a single byte (0xFF).
- Implementation: `successThreshold = max(1, floor(255 / X))` where X is capped at 255. Crit if `random(0..255) < successThreshold`.

Source: pret/pokecrystal — the consecutive use counter is a single byte and is capped at 255.

### Pursuit

- Normal priority (0)
- If the target is switching out on the same turn: Pursuit executes BEFORE the switch at **double power** (80 instead of 40)
- If target is not switching: executes normally at 40 power

### Baton Pass

Passes to the replacement:
- All stat stage changes (+/- Attack, Defense, etc.)
- Substitute (and its remaining HP)
- Mean Look/Spider Web trapping
- Confusion
- Leech Seed
- Focus Energy
- Curse (Ghost-type)
- Perish Song countdown

Does NOT pass: primary status conditions (burn, sleep, etc.)

### Spikes

- Entry hazard: damages Pokemon switching in
- 1/8 max HP damage on switch-in
- Only 1 layer in Gen 2 (no stacking until Gen 3)
- Does not affect Flying types
- Removed by Rapid Spin

### Thief

- 60 power, Dark type, 100% accuracy
- Steals opponent's held item (attacker gains it)
- Only steals if attacker has no held item
- Cannot steal mail items

### Rapid Spin

- 20 power, Normal type, 100% accuracy
- Removes: Spikes, Leech Seed, binding moves (Wrap/Bind/etc.) from user's side

### Perish Song

- All Pokemon on the field receive a 3-turn perish counter
- After 3 turns, if still on the field, the Pokemon faints
- Counter ticks down at end of each turn
- Switching resets the counter (Pokemon is safe)
- Soundproof blocks it (but no abilities in Gen 2)

### Mean Look / Spider Web

- Prevents target from switching
- Effect ends when **the user (the Pokemon that used Mean Look/Spider Web) switches out** — the volatile is removed from the target at that point
- Baton Pass passes the trapping effect to the replacement (target remains trapped)
- **Trapped Pokemon's volatile on switch-out:** The `trapped` volatile on the target should be cleared when the trapper switches out. If the trapper faints, the trap also ends. The target cannot voluntarily switch while trapped; the volatile is removed from the trapped Pokemon when the trapper leaves the field.

Source: pret/pokecrystal — MeanLook/SpiderWeb tracking is tied to the trapper's presence on the field.

### Return / Frustration

- Return: power = friendship / 2.5 (max 102 at 255 friendship)
- Frustration: power = (255 - friendship) / 2.5 (max 102 at 0 friendship)

### Reflect / Light Screen

- Duration: **5 turns** (changed from Gen 1's permanent until switch)
- Doubles Defense (Reflect) or Sp.Def (Light Screen) during damage calc
- Ignored by critical hits

### Counter / Mirror Coat

- Counter: reflects **physical** damage at 2x (priority -1)
- Mirror Coat: reflects **special** damage at 2x (priority -1, new in Gen 2)
- In Gen 2, Counter works against any physical-type move (including Dark, Ghost, etc.)

### Struggle

- 50 power, Normal type, no PP cost
- **Recoil: 1/4 of the user's max HP** — formula: `floor(maxHp / 4)`
- This is different from Gen 1 where Struggle recoil = 50% of damage dealt
- The recoil is based on max HP, NOT on the damage Struggle dealt
- Affected by Substitute? No — recoil bypasses the target's substitute but the user still takes full 1/4 HP recoil

Source: pret/pokecrystal — Struggle recoil uses the user's max HP divided by 4, not a fraction of damage dealt.

### Hyper Beam

- Same as Gen 1: skips recharge on KO
- Also skips recharge if it misses
- No longer skips recharge on Substitute break (changed from Gen 1 — verify)

### Trapping Moves (Wrap, Bind, Fire Spin, Clamp, Whirlpool)

- Nerfed from Gen 1: target CAN attack while trapped (just can't switch)
- Duration: 2-5 turns
- Deal 1/16 max HP per turn (verified)
- User is NOT locked into the move (can choose different moves)

---

## 10. End-of-Turn Order

Gen 2 (GSC) uses a **two-phase** end-of-turn system. The single-pass view previously documented here was incorrect — pokecrystal has two distinct routines.

Source: pret/pokecrystal engine/battle/core.asm:250-296 (HandleBetweenTurnEffects) and core.asm:1005-1122 (ResidualDamage)

### Phase 1 — ResidualDamage (runs per-Pokemon AFTER EACH ATTACK)

```
1. Status damage (burn: 1/8 max HP; poison: 1/8 max HP; toxic: N/16 max HP)
2. Leech Seed drain (1/8 max HP, heals the seeder)
3. Nightmare damage (1/4 max HP, only while asleep)
4. Curse damage (1/4 max HP, from Ghost-type Curse)
```

This phase fires after each individual attack resolves, not once at the end of both Pokemon's turns.

### Phase 2 — HandleBetweenTurnEffects (runs ONCE after both Pokemon have acted)

```
1. Future Attack activation (HandleFutureSight)
2. Weather damage — Sandstorm: 1/8 max HP for non-Rock/Ground/Steel (HandleWeather)
3. Weather turn decrement (HandleWeather, same call as step 2)
4. Bind/trapping damage — 1/16 max HP per turn (HandleWrap)
5. Perish Song countdown — decrement, faint at 0 (HandlePerishSong)
6. Leftovers recovery — 1/16 max HP (HandleLeftovers)
7. Mystery Berry — restores PP (HandleMysteryberry)
8. End-of-turn defrost check — 25/256 thaw chance (HandleDefrost)
9. Safeguard countdown (HandleSafeguard)
10. Screen countdowns — Reflect, Light Screen (HandleScreens)
11. Stat-boosting held items (HandleStatBoostingHeldItems)
12. Healing held items (HandleHealingItems)
13. Encore countdown (HandleEncore)
```

### Important Notes

- **Leftovers fires in Phase 2**, not Phase 1. In the old single-pass model, Leftovers appeared "first" (before status damage). In the correct two-phase model, Leftovers fires in Phase 2 — after all Phase 1 per-attack residual effects.
- This does NOT mean a Pokemon cannot heal and then take damage in the same turn. The two phases are separated by the attack boundary: Phase 1 fires after each attack, Phase 2 fires once after all attacks.
- The competitive significance changes: Leftovers recovery happens after both Pokemon have attacked, not before status damage kicks in.
- Phase 1 effects can cause fainting mid-turn (after an attack); Phase 2 faint checks happen after all Phase 2 effects resolve.

---

## 11. Switching Mechanics

### What Resets on Switch-Out

- Stat stages (all reset to 0)
- Confusion
- Toxic counter (reverts to regular poison)
- Trapping (Wrap, Mean Look, etc.)
- Disable
- Encore
- Attract
- Nightmare
- Torment (doesn't exist in Gen 2)

### What Persists

- Primary status (burn, freeze, paralysis, poison, sleep)
- Sleep counter (does NOT reset)
- PP usage

### Entry Effects on Switch-In

- Spikes damage (1/8 max HP, if not Flying-type)
- Held berry activation (if applicable)

---

## 12. Known Bugs & Quirks

| Bug/Quirk | Description |
|-----------|-------------|
| 1/256 miss (partial) | Still exists for modified accuracy < 255 |
| Belly Drum + stat overflow | If Belly Drum sets Attack to exactly 999, badge boost can overflow |
| Present heal | Present can heal the opponent (random damage/healing move) |
| Beat Up | Each hit uses a different party member's Attack stat |
| Thick Club + Transform | If Ditto transforms into Cubone/Marowak and holds Thick Club, gets double Attack |
| Struggle | 50 power, Normal type, **1/4 max HP recoil** (changed from Gen 1's 50% of damage dealt). Formula: `floor(maxHp / 4)`. |
| Sleep Talk | Can call any move including two-turn moves (but won't charge) |

---

## References

- pret/pokecrystal: https://github.com/pret/pokecrystal
- Bulbapedia Damage (Gen II): https://bulbapedia.bulbagarden.net/wiki/Damage
- Bulbapedia Critical Hit: https://bulbapedia.bulbagarden.net/wiki/Critical_hit
- Bulbapedia Status Conditions: https://bulbapedia.bulbagarden.net/wiki/Status_condition
- Smogon GSC Mechanics: https://www.smogon.com/forums/threads/gsc-mechanics.3542417/
- Smogon GSC Research Thread: https://www.smogon.com/forums/threads/gsc-research-thread.67609/
- Smogon GSC Status Guide: https://www.smogon.com/gs/articles/status
