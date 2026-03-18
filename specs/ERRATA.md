# Spec Errata — Cross-Gen Lessons Learned

This document captures error patterns found during spec audits across all generations (Gen 1-2 via PRs #29/#30, Gen 3-9 via decomp/Showdown audits). Use this as a pre-implementation checklist before starting any new generation.

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
- Gen 3-6: ×0.25 Speed. Showdown `data/mods/gen6/conditions.ts:14`: `Math.floor(spe * 25 / 100)`. Gen 5 inherits from Gen 6 (no override).
- Gen 7+: ×0.5 Speed. Showdown `data/conditions.ts` line 35: `spe * 50 / 100`. Gen 7 conditions.ts has no par override, so inherits base.
<!-- CORRECTION 2026-03-16: Previously stated Gen 5+ was ×0.5. The change actually happened in Gen 7, not Gen 5. Gen 6 conditions.ts explicitly overrides par to 25/100. -->

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

**Gen 5** (Showdown `data/mods/gen5/conditions.ts:24-46`):
Counter starts at 2 and DOUBLES each consecutive use (2→4→8→16→32→64→128→256), with success = 1/counter. After 256, effectively 0 (1/2^32). counterMax = 256.

**Gen 6+** (Showdown `data/conditions.ts:439-461`):
Counter starts at 3 and TRIPLES each consecutive use (3→9→27→81→243→729), with success = 1/counter. counterMax = 729. This is a different formula from Gen 5.

**How to check**: For Gen 4, look for the success rate table in the decomp. For Gen 5, check `data/mods/gen5/conditions.ts` (doubling). For Gen 6+, check base `data/conditions.ts` (tripling). These are three distinct mechanisms across generations.

---

## Error Category 10: Multi-Hit Distribution Changes

**The Error**: Multi-hit move distributions are assumed to be the same across all generations. They changed in Gen 5.

**Gen 1-4**: 37.5/37.5/12.5/12.5 (2 hits/3 hits/4 hits/5 hits). pokeemerald `src/battle_script_commands.c:7139-7154`: double-roll system produces this distribution.

**Gen 5+**: 35/35/15/15. Showdown `sim/battle-actions.ts:865-867`: `if (this.battle.gen >= 5)` uses sample array `[2×7, 3×7, 4×3, 5×3]` = 35/35/15/15 out of 20.

**Common mistake**: Using the Gen 4 distribution (37.5/37.5/12.5/12.5) or an incorrect distribution (50/25/12.5/12.5) for Gen 5+.

**How to check**: For Gen 1-4, verify against decomp. For Gen 5+, check `sim/battle-actions.ts` for the gen-conditional branch.

---

## Error Category 11: Fairy Type Chart Confusion (Offense vs Defense)

**The Error**: Fairy's offensive matchups (what Fairy deals reduced damage to) are confused with Fairy's defensive matchups (what Fairy resists).

**Correct Fairy matchups** (Showdown `data/typechart.ts:103-124`):

Defensively (damage Fairy TAKES):
- Resists (0.5x): Fighting, Bug, Dark
- Immune (0x): Dragon
- Weak (2x): Poison, Steel
- Neutral: Everything else including Fire

Offensively (damage Fairy DEALS):
- Super-effective (2x): Dragon, Fighting, Dark
- Not very effective (0.5x): Fire, Poison, Steel
- No effect (0x): None

**Common mistake**: Listing Fire/Poison/Steel as what Fairy RESISTS. Those are what RESIST Fairy attacks — the opposite direction. Fire is neutral defensively against Fairy.

**How to check**: In Showdown typechart.ts, each type's `damageTaken` object shows DEFENSIVE matchups (how much damage that type takes). Values: 0=neutral, 1=weak(2x), 2=resist(0.5x), 3=immune(0x).

---

## Error Category 12: Parental Bond Second Hit (Gen 6 vs Gen 7)

**The Error**: Parental Bond's second hit multiplier is listed as 25% across all gens. It was actually 50% in Gen 6 and nerfed to 25% in Gen 7.

**Gen 6**: Second hit = 50% of first hit damage
**Gen 7+**: Second hit = 25% of first hit damage

**Source**: Showdown `sim/battle-actions.ts:1740`: `this.battle.gen > 6 ? 0.25 : 0.5`

---

## Error Category 13: Gale Wings HP Requirement

**The Error**: Gale Wings is described with an HP requirement ("at full HP") in Gen 6. The HP check was a Gen 7 nerf.

**Gen 6**: +1 priority to ALL Flying moves, no conditions. Showdown `data/mods/gen6/abilities.ts:19-20`: just checks `move.type === 'Flying'`.
**Gen 7+**: +1 priority only when at full HP. Base `data/abilities.ts` includes HP check.

---

## Error Category 14: Paralysis Speed Change (Gen 7, Not Gen 5)

**The Error**: Paralysis speed reduction is cited as changing from ×0.25 to ×0.5 in Gen 5. The actual change happened in Gen 7.

**Gen 1-6**: ×0.25 Speed. Showdown `data/mods/gen6/conditions.ts:14`: `Math.floor(spe * 25 / 100)`. Gen 5 inherits from Gen 6.
**Gen 7+**: ×0.5 Speed. Showdown base `data/conditions.ts:35`: `Math.floor(spe * 50 / 100)`. Gen 7 has no override, inherits base.

**How to check**: Follow the Showdown mod inheritance chain. Gen 6 explicitly overrides par. Gen 7 does not, so it inherits the base (Gen 9) value.

---

## Error Category 15: Z-Move Power Table Truncation

**The Error**: Z-Move base power table has too few rows and wrong max power. Spec listed 7 ranges with max 180; actual table has 11 ranges with max 200.

**Correct table** (Showdown `sim/dex-moves.ts:551-577`):
- 0 (no base power) → 100
- 1–59 → 100, 60–69 → 120, 70–79 → 140, 80–89 → 160, 90–99 → 175
- 100–109 → 180, 110–119 → 185, 120–129 → 190, 130–139 → 195, 140+ → 200

**Pattern**: The upper ranges (100+) were collapsed into a single "110+ → 180" row. This causes Close Combat (120 BP) to be calculated as 180 Z-power instead of correct 190.

---

## Error Category 16: Status Z-Move Fabrication

**The Error**: Status Z-Moves described as converting to named damage moves (e.g., "Z-Swords Dance becomes Clanging Scales"). Status Z-Moves do NOT become damage moves — they perform the original status effect plus a Z-Power bonus (stat boost, heal, etc.).

**How it happens**: Signature Z-Moves for specific Pokemon (Kommo-o's Clangorous Soulblaze, Necrozma's Light That Burns the Sky) were confused with generic status Z-Move conversions.

**Source**: Showdown `data/moves.ts` — status moves have `zMove: { effect: 'clearnegativeboost' }` or `zMove: { boost: { atk: 1 } }`, NOT references to damage moves.

---

## Error Category 17: Terrain Boost Misdating (Gen 7 vs Gen 8)

**The Error**: Terrain power boost listed as 1.3x in Gen 7. The actual Gen 7 value is 1.5x; the nerf to 1.3x happened in Gen 8.

**Gen 6-7**: 1.5x terrain boost. Showdown `data/mods/gen7/moves.ts:211`: `chainModify(1.5)` for Electric Terrain (and similarly for Grassy, Psychic).
**Gen 8+**: 1.3x terrain boost. Base `data/moves.ts` defaults to `chainModify(1.3)`.

**Pattern**: Same as paralysis speed (Error Category 14) — a value from a later gen is incorrectly backdated to an earlier gen because the spec author assumed the current value was always the value.

---

## Error Category 18: Mega Evolution Persistence

**The Error**: Mega Evolution described as "lasts until switched out or faints" with a deactivation method that reverts the form on switch. Mega Evolution is actually permanent for the rest of the battle — switching out does NOT revert it.

**Found in**: Gen 6 spec, Gen 7 spec (both had this error).

**Source**: Showdown — Mega forms persist through switches. No `onSwitchOut` handler reverts the form.

---

## Error Category 19: Dynamax HP Formula

**The Error**: Dynamax HP multiplier formula completely wrong. Spec said `normalHP × (1 + (dynamaxLevel + 10) / 100)` = ×1.10 at level 0 to ×1.20 at level 10. Actual is ×1.50 to ×2.00.

**Correct formula** (Showdown `data/conditions.ts:771`):
```
const ratio = 1.5 + (pokemon.dynamaxLevel * 0.05);
pokemon.maxhp = Math.floor(pokemon.maxhp * ratio);
```
Level 0 = ×1.50, Level 5 = ×1.75, Level 10 = ×2.00

**Impact**: Off by 3-5× in HP calculation. A 300 HP Pokemon at level 0 should have 450 HP Dynamaxed, not 330.

---

## Error Category 20: Max Move Dual Power Table

**The Error**: Max Move power table was presented as a single table. There are actually TWO tables — Fighting/Poison types use a lower power table, all other types use a higher table.

**Fighting/Poison**: <45→70, 45-54→75, 55-64→80, 65-74→85, 75-109→90, 110-149→95, ≥150→100
**All other types**: <45→90, 45-54→100, 55-64→110, 65-74→120, 75-109→130, 110-149→140, ≥150→150

**Source**: Showdown `sim/dex-moves.ts:517-549`

**Impact**: Flamethrower (90 BP, Fire) converts to Max Flare 130 power, not 85.

---

## Error Category 21: Fabricated G-Max Moves / Abilities

**The Error**: Specs contain moves, abilities, or mechanics that don't exist in the game or Showdown source code.

**Gen 8 examples**:
- "G-Max Teraflare" for Mewtwo — Mewtwo has no Gigantamax form
- "Fluid Sorption" ability — completely fabricated, not in Showdown
- G-Max Wildfire described as setting Sunny Weather (actually deals residual damage)

**Pattern**: Especially common in Dynamax/Gigantamax mechanics, where the spec author appears to have guessed or confused similar-sounding mechanics.

**Prevention**: Always verify against Showdown `data/moves.ts` and `data/abilities.ts` before implementing.

---

## Error Category 22: Move Base Power Errors

**The Error**: Specs list wrong base power for moves. This is a simple data error but has cascading effects on all damage calculations.

**Gen 8 examples**:
- Body Press: listed as 130 BP, actually 80 BP
- Behemoth Blade: listed as 130 BP, actually 100 BP
- Behemoth Bash: listed as 130 BP, actually 100 BP

**Source**: Showdown `data/moves.ts` — the authoritative source for all move data.

**Prevention**: Cross-check every move's base power against Showdown `data/moves.ts`, not Bulbapedia summaries.

---

## Error Category 23: Gen 8 vs Gen 9 Ability Nerfs

**The Error**: Spec doesn't distinguish between Gen 8 and Gen 9 ability behavior. Several abilities were nerfed in Gen 9 and the spec may list the nerfed version.

**Key differences**:
- **Libero/Protean**: Gen 8 = activates every move. Gen 9 = once per switchin.
- **Intrepid Sword/Dauntless Shield**: Gen 8 = activates every switchin. Gen 9 = once per battle.

**Source**: Compare `data/mods/gen8/abilities.ts` overrides vs base `data/abilities.ts`.

**Pattern**: Same as Error Category 17 (terrain boost misdating) — a Gen 9 value is incorrectly backdated to Gen 8.

---

## Error Category 24: Weather Duration Confusion (Move-Summoned)

**The Error**: Move-summoned weather listed as "8 turns" base. Actually 5 turns base, 8 with weather rocks. The spec confused the rock-extended duration with the default.

**Correct values** (all gens with weather rocks, Gen 4+):
- Move-summoned: **5 turns** default, **8 turns** with weather rock (Damp Rock, Heat Rock, Smooth Rock, Icy Rock)
- Ability-summoned: **Indefinite** in Gen 3-5, **5 turns (8 with rock)** in Gen 6+ (permanent weather nerfed)

**Source**: Showdown `data/conditions.ts:476-512` (Rain Dance): `duration: 5`, `durationCallback` returns 8 if source has `damprock`, else 5. Gen 4 and Gen 5 mods do NOT override these durations.

**Found in**: Gen 5 spec listed move-summoned weather as "8 turns (same as Gen 4)". Gen 4 spec was correct (5 turns base).

---

## Error Category 25: Knock Off Damage Boost Misdating

**The Error**: Knock Off's 1.5× damage boost when removing an item listed as "Gen 5+" when it was actually introduced in Gen 6.

**Timeline**:
- Gen 3-5: Knock Off removes held item, NO damage boost
- Gen 6+: Knock Off removes held item AND deals 1.5× damage if target has a removable item

**Source**: Showdown `data/mods/gen5/moves.ts` has no damage boost for Knock Off. Base `data/moves.ts` adds the boost (Gen 6+).

**Found in**: Gen 4 spec listed "Knock Off does NOT get 1.5x damage boost (that's Gen 5+)" — should say "Gen 6+".

---

## Error Category 26: Adaptability Multiplier Error

**The Error**: Adaptability described as "doubling" STAB (1.5×→3.0×, 2.0×→4.0×). Actual Showdown implementation uses clamped values: 1.5×→2.0×, 2.0×→2.25×.

**Source**: Showdown `data/abilities.ts:43-56` — `onModifySTAB` returns `2` for 1.5× base and `2.25` for 2× base. It does NOT multiply by 2.

**Impact**: Over-estimates damage by 50-78% when Adaptability is active. A 2× Tera STAB attack would be calculated at 4× instead of the correct 2.25×.

---

## Error Category 27: Fabricated Terrain Effects

**The Error**: Terrain effects described with mechanics that don't exist in any game or Showdown source.

**Gen 9 examples**:
- Electric Terrain "halves speed of Pokémon not benefiting" — FALSE (prevents Sleep, boosts Electric moves 1.3×)
- Electric Terrain "regains 1/8 HP of Electric types" — FALSE
- Misty Terrain "reduces damage to grounded Pokémon" — WRONG (only reduces Dragon-type damage by 50%)
- Psychic Terrain "extends by 1 turn" — FALSE (fixed 5/8 turn duration)

**Pattern**: The spec author appears to have invented terrain effects by combining real partial mechanics with guessed behaviors.

**Prevention**: Always verify terrain condition implementations in Showdown `data/conditions.ts`.

---

## Error Category 28: Protosynthesis/Quark Drive Speed Exception

**The Error**: Protosynthesis and Quark Drive described as "30% boost to highest stat". Speed actually gets a 50% boost, not 30%.

**Correct values**:
- Attack, Defense, SpA, SpD: 30% boost (5325/4096 ≈ 1.30×)
- Speed: **50% boost** (chainModify(1.5))

**Source**: Showdown `data/abilities.ts:3480-3483` (Protosynthesis) and `data/abilities.ts:3617-3620` (Quark Drive) — `onModifySpe` uses `chainModify(1.5)` while all other stat modifiers use `chainModify([5325, 4096])`.

---

## Error Category 29: Orichalcum Pulse / Hadron Engine Move Type Fabrication

**The Error**: These abilities described as changing move types ("move type becomes Steel" / "move type becomes Electric"). Neither ability changes move types — they only boost a single stat.

**Correct behavior**:
- Orichalcum Pulse: sets Sun, boosts Attack by 33.3% (5461/4096) in Sun
- Hadron Engine: sets Electric Terrain, boosts SpA by 33.3% (5461/4096) on Electric Terrain

**Source**: Showdown `data/abilities.ts:3016-3035` and `data/abilities.ts:1725-1742` — only `onModifyAtk` / `onModifySpA` handlers, no `onModifyType` or `onModifyMove`.

---

## Error Category 30: Tera STAB Scenario Errors

**The Error**: When a Pokémon Terastallizes to a type matching one of its original types, the spec claimed the OTHER original type loses STAB entirely (1.0×). Showdown's `isSTAB` check uses `getTypes(false, true)` (base types, pre-Tera), so original types still get 1.5× STAB.

**Example**: Fire/Flying Charizard with Fire Tera using Air Slash:
- WRONG (spec): 1.0× (Flying "lost" STAB)
- CORRECT (Showdown): 1.5× (Flying is a base type, isSTAB=true)

**Source**: Showdown `sim/battle-actions.ts:1765` — `pokemon.getTypes(false, true).includes(type)` checks base types.

---

## Error Category 31: Defog Incomplete Removal List

**The Error**: Specs list Defog as removing only Reflect, Light Screen, and hazards from the target's side. In reality, Defog also removes Aurora Veil, Safeguard, Mist, and G-Max Steelsurge from the target's side, AND removes all hazards (including G-Max Steelsurge) from the USER's side.

**Affected gens**: Gen 6+ (Aurora Veil from Gen 7+; G-Max Steelsurge Gen 8 only).

**Source**: Showdown `data/moves.ts:3581-3595` — `removeTarget` includes `auroraveil`, `safeguard`, `mist`; `removeAll` (both sides) includes `gmaxsteelsurge`.

---

## Error Category 32: Residual Fabricated Content After Cleanup

**The Error**: After a major audit removes fabricated content from prose/tables, residual references to the fabricated content survive in code blocks elsewhere in the spec. v2.0 of the Gen 8 spec removed "Fluid Sorption" from the ability table but left `"fluid-sorption"` in a code array. Similarly, "mewtwo" was left in `gigantamaxSpecies` after G-Max Teraflare was removed, and "eternatus" remained despite prose correctly noting it can't Dynamax.

**Prevention**: After removing fabricated content, grep the entire spec for all references (string literals, code arrays, comments).

---

## Error Category 33: Spec Pseudocode Method Name Drift

**The Error**: Spec pseudocode references method names or signatures that were renamed or refactored during implementation, causing the spec to describe correct logic with wrong identifiers.

**Examples found in core systems audit (2026-03-17)**:
- `getTypeFactor` → actual `getTypeMultiplier` (core/02-shared-logic)
- `applyModifier` → actual `applyDamageModifier` (core/02-shared-logic)
- `getWeatherModifier` → actual `getWeatherDamageModifier` (core/02-shared-logic)
- `getStruggleRecoilFraction()` → actual `calculateStruggleRecoil(actor, actualDamage)` (battle/01-core-engine)
- `processLeftovers()` → actual `processHeldItemEndOfTurn()` (battle/01-core-engine)
- `getValidTypes()` → actual `getAvailableTypes()` (battle/00-architecture)
- `TrainerRef` → actual `TrainerDataRef` (battle/00-architecture)

**Prevention**: After any method/type rename during implementation, grep all spec files for the old name.

---

## Error Category 34: Aspirational Spec Content (Not Yet Implemented)

**The Error**: Spec describes mechanics as if they're implemented when they actually aren't in the code. The spec was written as a design document before implementation and sections were never updated to reflect what was actually built.

**Examples found in battle/01-core-engine.md**:
- `applyAbility('on-before-move', ...)` for Protean/Libero — NOT IMPLEMENTED
- `applyAbility('on-after-move-hit', ...)` for contact abilities — NOT IMPLEMENTED
- `processExpGains()` — NOT IMPLEMENTED
- 13 end-of-turn effects (black-sludge, aqua-ring, ingrain, grassy-terrain-heal, wish, future-attack, speed-boost, moody, bad-dreams, harvest, pickup, poison-heal) — NOT YET IMPLEMENTED
- `executeMultiHitMove()` — no such method exists

**Prevention**: When auditing IMPLEMENTED specs, verify every method call and code path against actual source. Mark aspirational content clearly.

---

## Error Category 35: Constructor/Factory Signature Mismatch

**The Error**: Spec shows a constructor or factory method with the wrong number of parameters or wrong parameter order.

**Example**: BattleEngine constructor shown as `(config, dataManager)` — actual is `(config, ruleset, dataManager)` with separate `fromGeneration()` factory.

**Impact**: All code examples and test setup code using the wrong signature will fail to compile.

**Prevention**: After any constructor change, update all spec code examples that call it.

---

## Error Category 36: Deep Accuracy Audit — Formula Corrections (fix/deep-accuracy-audit, 2026-03-18)

The following bugs were found and fixed during a systematic accuracy audit cross-referencing all Gen 1-3 implementations against pret decomp sources and the battle engine against its own abstraction contract.

### 36A. Gen 1 Bugs (source: pret/pokered)

#### 36A-1: Burn on Critical Hits — Attack Incorrectly Halved
- **What was wrong**: When a burned Pokémon scored a critical hit, the burn's Attack-halving was still applied during damage calculation. Critical hits in Gen 1 use unmodified base stats — burn halving should be ignored on crits.
- **Correct behavior**: On a critical hit, use the attacker's unmodified Attack stat (no burn halving). The burn halving applies only to non-crit damage.
- **Decomp source**: pokered `engine/battle/core.asm` — crit path reloads raw stats from species data, bypassing the `HandleBurnedPokemon` stat reduction.
- **Fixed in**: `packages/gen1/src/Gen1DamageCalc.ts`

#### 36A-2: Accuracy Calculation — Two Sequential Floor Operations on 0-255 Scale
- **What was wrong**: The accuracy calculation used a single combined float multiplication (e.g., `floor(moveAccuracy * accMult / evaMult)`), which can produce incorrect results due to floating-point ordering.
- **Correct behavior**: Gen 1 accuracy uses the 0-255 scale with two sequential floor operations: `threshold = floor(floor(moveAccuracy * accNumerator / accDenominator) * evaDenominator / evaNumerator)`. Each application of the stage ratio is a separate integer division.
- **Decomp source**: pokered `engine/battle/core.asm` `CalcHitChance` — two separate `call DivideByN` routines applied sequentially.
- **Fixed in**: `packages/gen1/src/Gen1Ruleset.ts` accuracy calculation

### 36B. Gen 2 Bugs (source: pret/pokecrystal)

#### 36B-1: Damage Modifier Order — Item Before Crit, Weather Before STAB
- **What was wrong**: The Gen 2 damage formula in the spec listed modifiers in the order: Crit → STAB → Type → Weather → Item. The correct pokecrystal order is: Crit → Item → STAB → Type → Weather.
- **Correct behavior**: Item modifiers (type-boosting items, Thick Club, Light Ball) apply between the critical hit multiplier and STAB. Weather applies after type effectiveness.
- **Decomp source**: pokecrystal `engine/battle/core.asm` damage calculation routine — modifier application sequence.
- **Fixed in**: `packages/gen2/src/Gen2DamageCalc.ts`, `specs/battle/03-gen2.md` §4

#### 36B-2: High-Crit Move Stage — +2 Not +1; Razor Wind Missing from List
- **What was wrong**: High-crit moves were documented as granting +1 crit stage (moving from stage 0 threshold 17/256 to stage 1 threshold 32/256). Decomp shows they grant +2 stages (threshold 64/256). Razor Wind was also missing from the high-crit list.
- **Correct behavior**: High-crit moves (Slash, Karate Chop, Crabhammer, Razor Leaf, Cross Chop, Aeroblast, Razor Wind) grant +2 crit stages in Gen 2. Without other modifiers, they use the 64/256 = 25% threshold, not 32/256.
- **Decomp source**: pokecrystal `data/moves/effects_priorities.asm` and `engine/battle/core.asm` `CriticalHitTest` — high-crit flag sets stage to 2.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts`, `specs/battle/03-gen2.md` §5

#### 36B-3: Accuracy Stage Table — Exact Ratios, Not Simplified Fractions
- **What was wrong**: The Gen 2 accuracy stage table was documented as matching the Gen 3+ 3/9 system (3-based fractions). Gen 2 uses a different lookup table with exact byte values that don't simplify to the same ratios.
- **Correct behavior**: Gen 2 accuracy stages use the table from pokecrystal `data/moves/accuracy_stages.asm`: stage −6 = 25/100 (25%), −5 = 28/100, −4 = 33/100, −3 = 40/100, −2 = 50/100, −1 = 66/100, 0 = 100%, +1 = 133%, +2 = 166%, +3 = 200%, +4 = 233%, +5 = 266%, +6 = 300%. These are implemented as numerator/denominator pairs.
- **Decomp source**: pokecrystal `data/moves/accuracy_stages.asm` — explicit lookup table of byte pairs.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts`, `specs/battle/03-gen2.md` §8 (accuracy), `specs/core/02-shared-logic.md` §4.2

#### 36B-4: Sleep Duration — 2-7 Not 1-7
- **What was wrong**: Gen 2 sleep duration was documented as 1-7 turns. The correct range is 2-7 turns.
- **Correct behavior**: When sleep is applied in Gen 2, the sleep counter is set to `1 + (random % 6) + 1` = 2-7 inclusive. A counter of 0 never occurs on initial application.
- **Decomp source**: pokecrystal `engine/battle/effect_commands.asm` `SleepEffect` — `ld a, [rng]; and $7; jr z, SleepEffect` (re-rolls on 0); effective range is 1-7 game turns, but the internal counter starts at 2-7 due to pre-decrement before the first check.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` `getSleepDuration()`, `specs/battle/03-gen2.md` §9

#### 36B-5: Focus Band Activation Rate — 30/256 Not 12%
- **What was wrong**: Focus Band activation rate was documented as approximately 12% (31/256 or 1/8). The actual rate is 30/256 ≈ 11.72%.
- **Correct behavior**: Focus Band activates when `random(0..255) < 30`, giving exactly 30/256 probability.
- **Decomp source**: pokecrystal `engine/battle/core.asm` `FocusBandCheck`: `call BattleRandom; cp 30; ret nc`.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` focus band handler

#### 36B-6: Toxic Reverts to Poison on Switch-Out
- **What was wrong**: Badly-poisoned (Toxic) status was documented as persisting through switch-out with only the counter resetting. In Gen 2, Toxic reverts entirely to regular poison status on switch-out.
- **Correct behavior**: When a badly-poisoned Pokémon switches out, its status changes from `badly-poisoned` back to `poison` (regular). The escalating damage counter resets AND the status downgrades. In Gen 1, the counter resets but the status remains badly-poisoned.
- **Decomp source**: pokecrystal `engine/battle/core.asm` `HandleSwitchOut` — clears the Toxic flag (`res TOXIC_BIT`), leaving only the basic poison status bit.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` switch-out handler

#### 36B-7: Protect Formula — Power-of-2 Halving Not Power-of-3
- **What was wrong**: The spec documented Protect success rate as `1/3^n` (denominator triples each consecutive use). Gen 2 uses power-of-2 halving: `1/2^n`.
- **Correct behavior**: First consecutive use = ~50% (1/2), second = 25% (1/4), third = 12.5% (1/8), etc. The initial use is always 100%. Each consecutive use halves the success rate. This matches Gen 3 behavior, not the tripling used in Gen 6+.
- **Decomp source**: pokecrystal `engine/battle/move_effects/protect.asm` — uses a bit-shift (`srl a`) to halve the probability byte each use.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` protect handler, `specs/battle/03-gen2.md` §10

#### 36B-8: Struggle Recoil — 1/4 Damage Dealt Not 1/4 Max HP
- **What was wrong**: Struggle recoil was documented as 1/4 of the user's max HP. The correct source of the recoil is 1/4 of the damage dealt to the opponent.
- **Correct behavior**: `recoil = floor(damageDealt / 4)`. Minimum 1.
- **Decomp source**: pokecrystal `engine/battle/move_effects/struggle.asm` — `ld a, [wDamage]; srl a; srl a` (two right shifts = ÷4) applied to `wDamage` (the damage dealt field), not to max HP.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` `calculateStruggleRecoil()`

#### 36B-9: End-of-Turn Order — 6 Missing Effects
- **What was wrong**: The Gen 2 end-of-turn order was missing: Future Sight damage, Mystery Berry PP restore, Defrost (random thaw check), Safeguard countdown, Encore countdown, and Stat-boosting held items.
- **Correct behavior**: The full two-phase Gen 2 end-of-turn order (Phase 1: per-Pokémon after each attack; Phase 2: between turns for both Pokémon) includes all 12 Phase-2 effects documented in §12.
- **Decomp source**: pokecrystal `engine/battle/core.asm` `HandleBetweenTurnEffects` — full list with order.
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` `getEndOfTurnOrder()`

#### 36B-10: Freeze Thaw Timing — Between Turns Not Pre-Move
- **What was wrong**: The Gen 2 freeze thaw check was implemented as a pre-move check (before the frozen Pokémon's action slot). Decomp shows it occurs in Phase 2 (between turns), not before individual moves.
- **Correct behavior**: Freeze thaw (25/256 ≈ 9.77% chance) is checked in `HandleBetweenTurnEffects` (between turns), not in the per-Pokémon move execution phase.
- **Decomp source**: pokecrystal `engine/battle/core.asm` `HandleBetweenTurnEffects` step 7 (Defrost).
- **Fixed in**: `packages/gen2/src/Gen2Ruleset.ts` freeze handling

### 36C. Gen 3 Bugs (source: pret/pokeemerald)

#### 36C-1: Damage Formula Modifier Order and Burn Placement
- **What was wrong**: The Gen 3 damage modifier chain placed Burn halving at position 7 (last, after type effectiveness). The pokeemerald order applies Burn before Random factor but after type effectiveness, and the exact ordering of weather vs. STAB was wrong.
- **Correct behavior** (pokeemerald `src/battle_script_commands.c`): Weather → Critical (2x) → Random (85-100)/100 → STAB (1.5x) → Type effectiveness (sequential, floor between types) → Burn (0.5x) → item modifiers (if applicable).
- **Decomp source**: pokeemerald `src/battle_script_commands.c` `CalcDamage` — the exact `chainModify` call sequence.
- **Fixed in**: `packages/gen3/src/Gen3DamageCalc.ts`, `specs/battle/04-gen3.md` §3

#### 36C-2: Quick Claw Rate — 20% Not 18.75%
- **What was wrong**: Quick Claw activation probability was listed as "~20%" in a note but the implementation used 48/256 ≈ 18.75%.
- **Correct behavior**: Quick Claw activates with exactly 20% probability — but NOT via a 256-scale check. pokeemerald uses `Random() % 10 < 2` (0-9, activates on 0 or 1 = 2/10 = 20%), not `Random() < 51/256`.
- **Decomp source**: pokeemerald `src/battle_util.c` `ItemBattleEffects` Quick Claw handler: `if (Random() % 10 < 2)`.
- **Fixed in**: `packages/gen3/src/Gen3Ruleset.ts` Quick Claw handler, `specs/battle/04-gen3.md` §9

#### 36C-3: Struggle Recoil — 1/4 Damage Dealt Not 1/2
- **What was wrong**: Gen 3 Struggle recoil was documented as 1/2 of damage dealt (following Gen 1's 50% rate). pokeemerald uses 1/4.
- **Correct behavior**: `recoil = floor(damageDealt / 4)`. Minimum 1.
- **Decomp source**: pokeemerald `src/battle_script_commands.c` `BattleScript_StruggleRecoil` — `ld a, RECOIL_DMG_QUARTER` constant.
- **Fixed in**: `packages/gen3/src/Gen3Ruleset.ts` `calculateStruggleRecoil()`

#### 36C-4: Secondary Effect Chance Scale — 0-99 Not 0-255
- **What was wrong**: Secondary effect chances (e.g., 30% flinch from Rock Slide, 10% burn from Flamethrower) were checked against a 0-255 scale (e.g., `random < 77` for 30%). Gen 3 uses a 0-99 scale.
- **Correct behavior**: Secondary effect trigger: `random(0..99) < effectChance`. For a 30% effect: `random(0..99) < 30`. This is consistent with how move data stores effect chances (integers 0-100).
- **Decomp source**: pokeemerald `src/battle_script_commands.c` — `Random() % 100 < gBattleMoves[gCurrentMove].secondaryEffectChance`.
- **Fixed in**: `packages/gen3/src/Gen3Ruleset.ts` secondary effect resolution

#### 36C-5: Accuracy Stage Table — Uses sAccuracyStageRatios, Not Simplified Formula
- **What was wrong**: The Gen 3 accuracy stage multipliers were described as the 3/9 fractional system matching the `getAccuracyEvasionMultiplier()` formula in core. pokeemerald uses an explicit lookup table `sAccuracyStageRatios` with byte-pair ratios.
- **Correct behavior**: pokeemerald `sAccuracyStageRatios` (in `src/battle_util.c`): stage −6 = 33/100, −5 = 36/100, −4 = 43/100, −3 = 50/100, −2 = 60/100, −1 = 75/100, 0 = 100/100, +1 = 133/100, +2 = 166/100, +3 = 200/100, +4 = 233/100, +5 = 266/100, +6 = 300/100. These are close to but NOT identical to `(3+stage)/3`.
- **Decomp source**: pokeemerald `src/battle_util.c` `sAccuracyStageRatios` lookup table.
- **Fixed in**: `packages/gen3/src/Gen3Ruleset.ts` accuracy calculation, `packages/core/src/logic/statCalc.ts` accuracy table, `specs/core/02-shared-logic.md` §4.2

### 36D. Battle Engine Bugs

#### 36D-1: Switch-In Ability Results Discarded (Intimidate, Drizzle, etc. Had No Effect)
- **What was wrong**: The battle engine called switch-in ability handlers but discarded the returned `BattleEvent[]`. Events from Intimidate (stat drops), Drizzle (weather set), Sand Stream, Drought, etc. were never applied to the battle state or emitted to consumers.
- **Correct behavior**: All events returned from `applyAbilityOnSwitchIn()` must be processed — stat changes applied, weather state set, events emitted. Switch-in abilities with no observable effect is a critical correctness bug.
- **Fixed in**: `packages/battle/src/BattleEngine.ts` switch-in handler

#### 36D-2: Confusion Turn Countdown Hardcoded (Not Delegated to Ruleset)
- **What was wrong**: The confusion duration countdown was hardcoded in the engine as 2-5 turns using a fixed RNG call. Confusion duration varies by generation and should be delegated to the ruleset's `getConfusionDuration()` method.
- **Correct behavior**: Engine calls `ruleset.getConfusionDuration(rng)` to determine turn count. Gen 1-3 all use 2-5 turns, but Gen 5+ changed the mechanic — the engine must not assume the range.
- **Fixed in**: `packages/battle/src/BattleEngine.ts` confusion application

#### 36D-3: Bound/Trap Turn Countdown Hardcoded (Not Delegated to Ruleset)
- **What was wrong**: The Bind/Wrap/Fire Spin/Clamp trap duration was hardcoded as 2-5 turns in the engine. Like confusion, this should be delegated to `ruleset.getTrapDuration(rng)`.
- **Correct behavior**: Engine calls `ruleset.getTrapDuration(rng)`. Gen 2 introduced changes to trapping mechanics; the engine must not assume Gen 1 behavior.
- **Fixed in**: `packages/battle/src/BattleEngine.ts` trap application

### 36E. Core Missing Features

#### 36E-1: No Integer Stat Stage Ratio Lookup Tables
- **What was wrong**: `getStatStageMultiplier()` in core used the formula `(2 + stage) / 2` or `2 / (2 - stage)` which is mathematically correct but stores fractions as floats. Some gens apply stages as integer numerator/denominator pairs from lookup tables to avoid floating-point drift.
- **Correct behavior**: Core should expose integer ratio lookup tables (numerator and denominator separately) so gen packages can apply `floor(stat * numerator / denominator)` without floating-point precision issues.
- **Fixed in**: `packages/core/src/logic/statCalc.ts` — added `STAT_STAGE_RATIOS` lookup table

#### 36E-2: No Accuracy Stage Ratio Lookup Table (Different from Stat Stages)
- **What was wrong**: `getAccuracyEvasionMultiplier()` used the formula `(3 + stage) / 3` or `3 / (3 - stage)`. While this matches Gen 3+ semantics, it was applied globally without gen awareness, and the exact integer ratios from decomp tables differ slightly from the formula output for some stages.
- **Correct behavior**: Core should expose `ACCURACY_STAGE_RATIOS` as a separate lookup from `STAT_STAGE_RATIOS`, since accuracy/evasion uses a 3-based system while stats use a 2-based system. Gen 1-2 accuracy stages use entirely different tables (see Gen 2 correction 36B-3 above).
- **Fixed in**: `packages/core/src/logic/statCalc.ts` — added `ACCURACY_STAGE_RATIOS` lookup table, `specs/core/02-shared-logic.md` §4

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
