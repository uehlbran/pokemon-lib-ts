# Spec Errata — Cross-Gen Lessons Learned

This document captures error patterns found during spec audits across all generations (Gen 1-2 via PRs #29/#30, Gen 3-5 via decomp/Showdown audits). Use this as a pre-implementation checklist before starting any new generation.

---

## Error Category 1: Wrong Stat Formulas

**The Error**: Spec writes a stat formula that omits the Base stat entirely or uses wrong constants.

**Gen 3 example** (confirmed in `specs/battle/04-gen3.md` before fix):
```
// WRONG — missing Base stat
HP = 2 * IV + 2 * EV / 4 + Level + 5

// WRONG — missing Base stat
Stat = (2 * IV + 2 * EV / 4 + Level / 5 + 5) * NatureMod
```

**Correct Gen 3+ formulas**:
```
HP   = floor(((2 * Base + IV + floor(EV/4)) * Level) / 100) + Level + 10
Stat = floor((floor(((2 * Base + IV + floor(EV/4)) * Level) / 100) + 5) * NatureMod)
```

**Correct Gen 1/2 formulas** (DVs, not IVs; StatExp not EVs):
```
HP   = floor(((Base + DV) * 2 + floor(ceil(sqrt(StatExp)) / 4)) * Level / 100) + Level + 10
Stat = floor(((Base + DV) * 2 + floor(ceil(sqrt(StatExp)) / 4)) * Level / 100) + 5
```

**Ground truth**: Bulbapedia "Stat" article, Showdown `sim/dex-data.ts`.

---

## Error Category 2: Type Chart Errors (Fairy in Pre-Gen 6)

**The Error**: Fairy type appears in type charts, type lists, or move type assignments for generations before Gen 6.

**Timeline**:
- Gen 1: 15 types (no Dark, Steel, Fairy)
- Gen 2-5: 17 types (Dark + Steel added in Gen 2; still no Fairy)
- Gen 6+: 18 types (Fairy added)

**Common mistakes found**:
- Fairy listed in PokemonType enum for Gen 3-5 specs
- Fairy type chart row/column in Gen 3-5 specs
- Clefairy described as Fairy-type in pre-Gen 6 specs (it was Normal until Gen 6)

**Ground truth**: Bulbapedia "Type" article by generation, Showdown `data/typechart.ts`.

---

## Error Category 3: Damage Formula Errors

**Sub-error A: Wrong rounding**

Gen 1 damage uses sequential integer truncation at each step:
```
// CORRECT: floor at each multiplication step
step1 = floor(2 * Level / 5) + 2
step2 = floor(step1 * Base * A/D)
step3 = floor(step2 / 50) + 2
// then apply modifiers sequentially with floor at each step
```

Gen 3+ damage uses a single combined modifier at the end:
```
// CORRECT: combine modifiers, then floor once
damage = floor(baseDamage * combinedModifier)
```

**Sub-error B: STAB application order**

STAB must be applied at the correct point in the modifier chain. In Gen 1, STAB is applied to the base damage before other modifiers. In Gen 3+, STAB is one of the chained modifiers.

**Sub-error C: Type effectiveness application (Gen 1 specific)**

In Gen 1, type effectiveness against dual-typed Pokémon must be applied **sequentially with floor between each type**, not as a combined multiplier:
```
// Gen 1 CORRECT: sequential with floor
effectiveness = typeChart[attackType][type1]  // e.g., 2.0
damage_intermediate = floor(damage * effectiveness)
effectiveness2 = typeChart[attackType][type2]  // e.g., 0.5
final_damage = floor(damage_intermediate * effectiveness2)
// Result: floor(floor(100 * 2.0) * 0.5) = floor(200 * 0.5) = 100

// Gen 1 WRONG: combined multiplier
combined = 2.0 * 0.5 = 1.0
final_damage = floor(100 * 1.0) = 100
// (Same result here but differs with odd numbers due to floor)
```

**Ground truth**: Showdown Gen 1 damage formula in `sim/battle.ts`, Bulbapedia "Damage" article.

---

## Error Category 4: Status Mechanic Errors

**Sleep duration**:
- Gen 1: 1-7 turns (random at application)
- Gen 2: 1-7 turns (Showdown confirmed; some sources say 1-6, but 1-7 is correct)
- Gen 3: 2-5 turns
- Gen 4: 1-5 turns (international); 2-6 turns (Japanese DP only) — Bulbapedia confirmed
- Gen 5+: 1-3 turns (sleep mechanics changed)

**Burn damage**:
- Gen 1: 1/16 max HP per turn. pokered `engine/battle/core.asm:546` `HandlePoisonBurnLeechSeed_DecreaseOwnHP`: 4× right-shift = ÷16
- Gen 2: 1/8 max HP per turn. pokecrystal `engine/battle/core.asm:1005` `ResidualDamage`: calls `GetEighthMaxHP` for both burn and poison
- Gen 3-6: 1/8 max HP per turn. pokeemerald `src/battle_util.c:830`: `gBattleMons[...].maxHP / 8`
- Gen 7+: 1/16 max HP per turn (nerfed back in Gen 7)

**Poison damage (regular)**:
- Gen 1: 1/16 max HP per turn. pokered: same `HandlePoisonBurnLeechSeed_DecreaseOwnHP` routine (÷16)
- Gen 2+: 1/8 max HP per turn. pokecrystal: `GetEighthMaxHP`. pokeemerald: `maxHP / 8`

**Toxic damage (badly poisoned)**:
- All gens: N/16 per turn where N increments each turn (1/16, 2/16, 3/16...)
- Gen 1: pokered `engine/battle/core.asm:572`: `(maxHP / 16) × toxicCounter` via loop. Counter increments each turn.
- Gen 2: pokecrystal `engine/battle/core.asm:1041`: `GetSixteenthMaxHP`, counter incremented, damage = base × counter via loop
- Gen 3+: pokeemerald `src/battle_util.c:816`: `(maxHP / 16) × N`. Counter resets on switch-out.

**Leech Seed drain**:
- Gen 1: drains 1/16 of MAXIMUM HP (not damage dealt). Uses same ÷16 routine as burn/poison.
- Gen 2+: drains 1/8 of MAXIMUM HP

**Paralysis speed reduction**:
- Gen 1: ×0.25 Speed (two right shifts = ÷4). pokered `engine/battle/core.asm:6283` `QuarterSpeedDueToParalysis`
- Gen 2: ×0.25 Speed. pokecrystal `engine/battle/core.asm:6579` `ApplyPrzEffectOnSpeed` (same `srl a / rr b` ×2)
- Gen 3-4: ×0.25 Speed. Showdown `data/mods/gen4/conditions.ts` explicitly `chainModify(0.25)`
- Gen 5+: ×0.5 Speed. Showdown `data/conditions.ts` line 35: `spe * 50 / 100`

**Confusion duration**:
- Gen 1: 2-5 turns (NOT 1-4). pokered `engine/battle/effects.asm:1143-1147`: `and $3; inc a; inc a` = random(0-3)+2 = 2-5
- Gen 2: 2-5 turns (same formula). pokecrystal inherits same mechanics.
- Gen 3+: 2-5 turns. pokeemerald confirms via Showdown.

**Haze non-volatile status curing (Gen 1)**:
- Haze cures non-volatile status (burn/freeze/sleep/paralysis/poison) for the **TARGET only**, not both Pokémon.
- Haze cures volatile statuses (confusion, Disable, Leech Seed, Reflect, Light Screen, Focus Energy, X Accuracy, Mist, Bad Poison flag) for **both** Pokémon.
- pokered `engine/battle/move_effects/haze.asm:15`: "cure non-volatile status, but only for the target"

**Freeze**:
- Gen 1: NO natural thaw. Thaw only from: (a) Fire-type move hitting the frozen mon, (b) Haze. pokered `engine/battle/core.asm:3355` — no random check, just `bit FRZ, [hl]` → can't move.
- Gen 2: 25/256 (~9.77%) natural thaw per turn. pokecrystal `engine/battle/core.asm:1543` `HandleDefrost`: `call BattleRandom / cp 10 percent / ret nc` where `10 percent` = `10 * $FF / 100` = 25. So `cp 25 / ret nc` = thaw if random byte < 25, i.e. 25/256. **WARNING: Showdown gen2 mod has NO random thaw** (`data/mods/gen2/conditions.ts` overrides `onBeforeMove` without a random check) — this is a **Showdown bug**. The decomp is authoritative.
- Gen 3+: 20% (1/5) natural thaw per turn. pokeemerald `src/battle_util.c:2062`: `if (Random() % 5)` (stays frozen 80%, thaws 20%). pokefirered `src/battle_util.c:1313`: identical. Showdown `data/conditions.ts`: `this.randomChance(1, 5)`.

**Ground truth**: pret decomps (pokered, pokecrystal, pokeemerald, pokefirered) > Showdown > Bulbapedia. See `SPEC-STATUS.md` oracle hierarchy.

---

## Error Category 5: Wrong Code Identifiers (Enum vs String Literal)

**The Error**: Spec uses TypeScript enum-style identifiers instead of lowercase string literals.

**This codebase uses lowercase string literals everywhere**:
```typescript
// WRONG (enum style — not used in this codebase)
MoveCategory.Physical
WeatherType.Rain
BattleGimmick.DYNAMAX
PokemonType.FAIRY

// CORRECT (string literal style)
'physical'
'rain'
'dynamax'
'fairy'
```

**Common violations found in unverified specs**:
- `MoveCategory.Physical` / `.Special` / `.Status`
- `WeatherType.Rain` / `.Sun` etc.
- `BattleGimmick.DYNAMAX` / `.TERASTALLIZATION`
- ALL_CAPS constants for what should be string literals

**How to check**: Search spec for `.Physical` `.Special` `.Status` (with dot prefix) or ALL_CAPS type identifiers.

---

## Error Category 6: Features From Wrong Generation

**The Error**: A mechanic is described as existing in a generation where it wasn't available.

**Examples found**:
- Abilities in Gen 1-2 specs (abilities were introduced in Gen 3)
- Natures in Gen 1-2 specs (natures were introduced in Gen 3)
- Held items in Gen 1 specs (held items were introduced in Gen 2)
- Blizzard in the Gen 2 high-crit moves list (Blizzard was removed from high-crit in Gen 2)
- Stealth Rock in Gen 1-3 type chart docs (Stealth Rock introduced Gen 4)
- Fairy type in Stealth Rock damage table for Gen 4-5 (Fairy doesn't exist pre-Gen 6)

**How to check**: Before writing a mechanic, verify its introduction generation on Bulbapedia.

---

## Pre-Implementation Audit Checklist

Use this checklist before implementing any new generation's ruleset:

```
Spec Accuracy Checklist for Gen N Implementation
================================================

[ ] Stat formula verified against Bulbapedia and Showdown
[ ] Type chart verified (correct number of types, correct effectiveness values)
[ ] No Fairy type if Gen < 6
[ ] Damage formula verified (correct modifier order, correct rounding)
[ ] Critical hit formula verified (Speed-based for Gen 1, stage table for Gen 2+)
[ ] Sleep duration verified per-gen
[ ] Burn/poison damage fractions verified
[ ] Leech Seed fraction verified
[ ] All status conditions use string literals, not enum-style
[ ] All mechanic introductions verified (no abilities in Gen 1-2, no held items in Gen 1, etc.)
[ ] End-of-turn order verified (what happens and in what sequence)
[ ] Weather mechanics verified (does this gen have weather? which types?)
[ ] Move categories verified (type-based for Gen 1-3, per-move for Gen 4+)
[ ] Any known errata addressed or flagged
```

---

## Error Category 7: Priority Value Errors

**The Error**: Move priority values are wrong — often copied from a different generation or from inaccurate secondary sources.

**Gen 1**: No priority system (all moves effectively priority 0 except Quick Attack which goes first via a hardcoded flag).

**Gen 2** (pokecrystal `data/moves/effects_priorities.asm`):
- Protect/Endure/Detect = +3 (NOT +4)
- Quick Attack/Mach Punch/ExtremeSpeed = +2 (NOT +1)
- Vital Throw = 0
- Counter/Mirror Coat = -1

**Gen 3** (pokeemerald `src/data/battle_moves.h`):
- Helping Hand = +5
- Magic Coat/Snatch = +4 (NOT +3 — commonly misattributed)
- Protect/Detect/Endure/Follow Me = +3
- Quick Attack/Mach Punch/ExtremeSpeed/Fake Out = +1
- Vital Throw = -1
- Focus Punch = -3
- Revenge = -4
- Counter/Mirror Coat = -5
- Roar/Whirlwind = -6

**Gen 4** (pokeplatinum `res/battle/moves/*/data.json`):
- Helping Hand = +5
- Magic Coat/Snatch = +4
- Protect/Detect/Endure/Follow Me = +3
- Feint = +2 (NEW in Gen 4)
- Aqua Jet/Bide/Bullet Punch/ExtremeSpeed/Fake Out/Ice Shard/Mach Punch/Quick Attack/Shadow Sneak/Sucker Punch/Vacuum Wave = +1
- Vital Throw = -1
- Focus Punch = -3
- Avalanche/Revenge = -4 (NOT -5 — commonly misattributed)
- Counter/Mirror Coat = -5 (NOT -6 — commonly misattributed)
- Roar/Whirlwind = -6
- Trick Room = -7 (NEW in Gen 4)
- Whirlpool = 0 (NOT -6 — it's a normal-priority trapping move)

**Gen 5** (Showdown `data/mods/gen5/moves.ts` + base `data/moves.ts`):
- Helping Hand = +5
- Magic Coat/Snatch = +4
- Protect/Detect/Endure/Wide Guard/Quick Guard/Crafty Shield = +3
- ExtremeSpeed = +2 (NOT +1 — changed in Gen 5)
- Aqua Jet/Bullet Punch/Fake Out/Ice Shard/Mach Punch/Quick Attack/Shadow Sneak/Sucker Punch/Vacuum Wave = +1
- Vital Throw = -1
- Focus Punch = -3
- Avalanche/Revenge = -4
- Counter/Mirror Coat = -5 (NOT -6)
- Roar/Whirlwind/Dragon Tail/Circle Throw = -6
- Trick Room = -7

**How to check**: For Gen 1-3, verify against pret decomps. For Gen 4, use pokeplatinum move JSON files. For Gen 5+, verify against Showdown source (follow the mod inheritance chain: gen5 → gen6 → gen7 → base). Priority values change between generations — never assume Gen N's values are the same as Gen N+1.

---

## Error Category 8: Ability Move Lists (Iron Fist, etc.)

**The Error**: Ability-affected move lists contain moves that aren't in the correct category, don't exist in the generation, or are missing actual qualifying moves.

**Iron Fist (Gen 4)** — pokeplatinum `src/battle/battle_lib.c:6566-6582` `sPunchingMoves`:
Correct list (15 moves): Ice Punch, Fire Punch, Thunder Punch, Mach Punch, Focus Punch, Dizzy Punch, Dynamic Punch, Hammer Arm, Mega Punch, Comet Punch, Meteor Mash, Shadow Punch, Drain Punch, Bullet Punch, Sky Uppercut

Commonly wrong inclusions: Close Combat (not a punch), Cross Chop (not a punch), Heat Wave (special move), Hurricane (Gen 5), Inferno (Gen 5), Megahorn (Bug move), Poison Powder (status), Power-Up Punch (Gen 6), Submission, Superpower, Vacuum Wave (special), Vital Throw (throw), Wake-Up Slap (slap)

**How to check**: For ability-specific move lists, always check the decomp for the authoritative array.

---

## Error Category 9: Protect/Detect Consecutive Rate

**The Error**: Specs claim Protect success rate decays to "minimum 1/256" on consecutive use. The decomp shows a hard cap.

**Gen 4** (pokeplatinum `src/battle/battle_script.c:5351-5356`):
4 tiers only: 100% → ~50% → ~25% → ~12.5% (caps here). Array `sProtectSuccessRate` has exactly 4 entries. Counter capped at index 3.

**Gen 5+** (Showdown `data/mods/gen5/conditions.ts:24-46`):
Does NOT cap at 12.5%. Counter starts at 2 and doubles each consecutive use (2→4→8→16→32→64→128→256), with success = 1/counter. After 256, effectively 0 (1/2^32). This is a mechanical difference from Gen 4.

**How to check**: For Gen 4, look for the success rate table in the decomp. For Gen 5+, check the Showdown stall counter logic (follow mod inheritance chain).

---

## Error Category 10: Multi-Hit Distribution Changes

**The Error**: Multi-hit move distributions are assumed to be the same across all generations. They changed in Gen 5.

**Gen 1-4**: 37.5/37.5/12.5/12.5 (2 hits/3 hits/4 hits/5 hits). pokeemerald `src/battle_script_commands.c:7139-7154`: double-roll system produces this distribution.

**Gen 5+**: 35/35/15/15. Showdown `sim/battle-actions.ts:865-867`: `if (this.battle.gen >= 5)` uses sample array `[2×7, 3×7, 4×3, 5×3]` = 35/35/15/15 out of 20.

**Common mistake**: Using the Gen 4 distribution (37.5/37.5/12.5/12.5) or an incorrect distribution (50/25/12.5/12.5) for Gen 5+.

**How to check**: For Gen 1-4, verify against decomp. For Gen 5+, check `sim/battle-actions.ts` for the gen-conditional branch.

---

## Ground Truth Source Priority

When spec and external source disagree, use this priority order:

**Gen 1-3** (pret decomps available):
1. **pret decomps** (pokered/pokecrystal/pokeemerald) — cartridge ground truth, always wins
2. **Showdown source code** — battle-tested, but has known bugs (e.g., Gen 2 freeze thaw missing)
3. **Bulbapedia** — comprehensive, usually accurate

**Gen 4** (pret WIP decomps):
1. **pret WIP decomps** (pokeplatinum/pokeheartgold) — use with caution (may be incomplete)
2. **Showdown source code**
3. **Bulbapedia**

**Gen 5+** (no decomps):
1. **Showdown source code** — highest priority
2. **Bulbapedia**
3. **Serebii** — useful for move/species data

**Never use**: random fan sites, YouTube guides, or personal recollections without cross-checking.
