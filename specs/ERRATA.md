# Spec Errata — Cross-Gen Lessons Learned

This document captures error patterns found during the Gen 1 and Gen 2 deep-dive audits (PRs #29, #30). Use this as a pre-implementation checklist before starting any new generation.

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
- Gen 3-4: 2-5 turns
- Gen 5+: 1-3 turns (sleep mechanics changed)

**Burn damage**:
- Gen 1: 1/16 max HP per turn
- Gen 2+: 1/8 max HP per turn

**Poison damage (regular)**:
- Gen 1: 1/16 max HP per turn
- Gen 2+: 1/8 max HP per turn

**Toxic damage (badly poisoned)**:
- All gens: N/16 per turn where N increments each turn (1/16, 2/16, 3/16...)
- Gen 1: 1/16 of MAXIMUM HP (not current HP), N increments
- Gen 2+: same formula but toxic counter resets on switch-out

**Leech Seed drain**:
- Gen 1: drains 1/16 of MAXIMUM HP (not damage dealt)
- Gen 2+: drains 1/8 of MAXIMUM HP

**Freeze**:
- Gen 1: no natural thaw chance; thaw only from Fire-type move or Haze
- Gen 2+: 25/256 (~9.8%) chance to thaw per turn (NOT 20% as some sources claim)

**Ground truth**: Showdown `sim/battle.ts` end-of-turn handlers, Bulbapedia "Status condition" article.

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

## Ground Truth Source Priority

When spec and external source disagree, use this priority order:

1. **Showdown source code** (`smogon/pokemon-showdown`) — highest priority; battle-tested by competitive community
2. **Bulbapedia** — comprehensive and usually accurate; good for obscure mechanics
3. **Serebii** — useful for move/species data
4. **Gen-specific wikis** — use with caution; may have errors

**Never use**: random fan sites, YouTube guides, or personal recollections without cross-checking.
