# Gen 8 Ground-Truth Mechanics Reference

> Sources: Pokemon Showdown (`references/pokemon-showdown/`), Bulbapedia.
> This document is the canonical reference for Gen 8 mechanics. If the spec (09-gen8.md) disagrees with this document, this document is correct.
> Gen 8 falls under the "Gen 5-9" source authority tier: Showdown is primary, Bulbapedia is cross-reference.

---

## 1. Stat Calculation

Gen 8 uses the standard modern stat formula (unchanged since Gen 3).

### HP:
```typescript
floor(((2 * Base + IV + floor(EV / 4)) * Level / 100) + Level + 10)
```

Special case: Shedinja always has 1 HP regardless of formula.

### Other stats (Attack, Defense, Sp.Atk, Sp.Def, Speed):
```typescript
floor((floor(((2 * Base + IV + floor(EV / 4)) * Level / 100) + 5) * NatureMultiplier))
```

Where NatureMultiplier is 1.1 (boosted), 0.9 (hindered), or 1.0 (neutral).

### Nature Minting

Gen 8 introduces Nature Mints which change the stat-modifying nature without changing the actual nature value. The stat calculation uses the minted nature if present.

### IVs and EVs

- IVs: 0-31 per stat
- EVs: 0-252 per stat, 510 total cap
- Same as Gen 3-7

---

## 2. Type Chart (18 Types)

Same 18-type chart as Gen 6-7. No type effectiveness changes in Gen 8.

Types: Normal, Fire, Water, Electric, Grass, Ice, Fighting, Poison, Ground, Flying, Psychic, Bug, Rock, Ghost, Dragon, Dark, Steel, Fairy.

---

## 3. Dynamax System

### Dynamax HP Formula

```typescript
const ratio = 1.5 + (pokemon.dynamaxLevel * 0.05);
pokemon.maxhp = Math.floor(pokemon.maxhp * ratio);
pokemon.hp = Math.floor(pokemon.hp * ratio);
```
// Source: Showdown data/conditions.ts:771

- dynamaxLevel 0: x1.50 (150%)
- dynamaxLevel 5: x1.75 (175%)
- dynamaxLevel 10: x2.00 (200%)

Example: A Pokemon with 300 HP at dynamaxLevel 10: floor(300 * 2.00) = 600 HP.

### Dynamax Duration

3 turns. Counter increments at end of turn with `onResidualPriority: -100` (runs after all other residuals).
// Source: Showdown data/conditions.ts:794

### Dynamax Reversion

When Dynamax ends:
```typescript
pokemon.hp = pokemon.getUndynamaxedHP();
pokemon.maxhp = pokemon.baseMaxhp;
```
// Source: Showdown data/conditions.ts:800-802

HP is reverted proportionally (current HP ratio preserved).

### Dynamax Immunities

- Flinch immune: `onTryAddVolatile` returns null for flinch
  // Source: Showdown data/conditions.ts:778
- OHKO immune: Fissure, Horn Drill, Guillotine, Sheer Cold fail
- Forced-switch immune: Roar, Whirlwind, Dragon Tail, Circle Throw blocked
  // Source: Showdown data/conditions.ts:789-792
- Weight-based moves fail (Low Kick, Grass Knot, Heavy Slam, Heat Crash)

### Dynamax Restrictions

- One Dynamax per team per battle
- Cannot Dynamax: Zacian, Zamazenta, Eternatus (`cannotDynamax: true`)
  // Source: Showdown sim/pokemon.ts:1045
- Cannot Dynamax if holding Mega Stone or Z-Crystal
- Choice item lock is suppressed during Dynamax

### Anti-Dynamax Moves

Behemoth Blade, Behemoth Bash, and Dynamax Cannon deal 2x damage to Dynamaxed targets:
```typescript
if (move.id === 'behemothbash' || move.id === 'behemothblade' || move.id === 'dynamaxcannon') {
    return this.chainModify(2);
}
```
// Source: Showdown data/conditions.ts:785-786

---

## 4. Max Move Power Tables

Max Move power is determined by the base move's power AND type.

### Fighting / Poison types:

| Base Move Power | Max Move Power |
|-----------------|----------------|
| 0 (variable)    | 100            |
| < 45            | 70             |
| 45-54           | 75             |
| 55-64           | 80             |
| 65-74           | 85             |
| 75-109          | 90             |
| 110-149         | 95             |
| >= 150          | 100            |

### All other types:

| Base Move Power | Max Move Power |
|-----------------|----------------|
| 0 (variable)    | 100            |
| < 45            | 90             |
| 45-54           | 100            |
| 55-64           | 110            |
| 65-74           | 120            |
| 75-109          | 130            |
| 110-149         | 140            |
| >= 150          | 150            |

// Source: Showdown sim/dex-moves.ts:511-549

### Max Move Secondary Effects

| Type | Max Move | Secondary Effect |
|------|----------|-----------------|
| Normal | Max Strike | Speed -1 to all opponents |
| Fire | Max Flare | Sets Sun for 5 turns |
| Water | Max Geyser | Sets Rain for 5 turns |
| Electric | Max Lightning | Sets Electric Terrain for 5 turns |
| Grass | Max Overgrowth | Sets Grassy Terrain for 5 turns |
| Ice | Max Hailstorm | Sets Hail for 5 turns |
| Fighting | Max Knuckle | Attack +1 to user and allies |
| Poison | Max Ooze | Sp.Atk +1 to user and allies |
| Ground | Max Quake | Sp.Def +1 to user and allies |
| Flying | Max Airstream | Speed +1 to user and allies |
| Psychic | Max Mindstorm | Sets Psychic Terrain for 5 turns |
| Bug | Max Flutterby | Sp.Atk -1 to all opponents |
| Rock | Max Rockfall | Sets Sandstorm for 5 turns |
| Ghost | Max Phantasm | Defense -1 to all opponents |
| Dragon | Max Wyrmwind | Attack -1 to all opponents |
| Dark | Max Darkness | Sp.Def -1 to all opponents |
| Steel | Max Steelspike | Defense +1 to user and allies |
| Fairy | Max Starfall | Sets Misty Terrain for 5 turns |

// Source: Showdown data/moves.ts:11457-11892

### Max Move Flags

All Max Moves and G-Max Moves have `flags: {}` (empty). They never make contact, cannot be reflected by Mirror, and have special protection bypass rules.
// Source: Showdown data/moves.ts -- all maxstrike through maxstarfall entries

### Max Guard

Status moves become Max Guard during Dynamax. Priority +4 (same as Protect). Blocks all moves including other Max Moves (except G-Max One Blow and G-Max Rapid Flow).
// Source: Showdown data/moves.ts:11568

---

## 5. G-Max Moves (Complete Table)

33 G-Max moves total. Power uses the same table as regular Max Moves (based on base move power), except for Drum Solo/Fireball/Hydrosnipe which have fixed 160 BP.

| Pokemon | G-Max Move | Type | Line | Effect |
|---------|-----------|------|------|--------|
| Venusaur | G-Max Vine Lash | Grass | 7634 | 1/6 HP residual dmg 4 turns (non-Grass) |
| Charizard | G-Max Wildfire | Fire | 7735 | 1/6 HP residual dmg 4 turns (non-Fire) |
| Blastoise | G-Max Cannonade | Water | 6979 | 1/6 HP residual dmg 4 turns (non-Water) |
| Butterfree | G-Max Befuddle | Bug | 6950 | Random: Sleep/Paralysis/Poison to all foes |
| Pikachu | G-Max Volt Crash | Electric | 7712 | Paralyzes all foes |
| Meowth | G-Max Gold Rush | Normal | 7218 | Confuses all foes |
| Machamp | G-Max Chi Strike | Fighting | 7041 | Crit ratio boost to user+allies (stacks 3x) |
| Gengar | G-Max Terror | Ghost | 7611 | Traps all foes (no switch) |
| Kingler | G-Max Foam Burst | Water | 7195 | Speed -2 to all foes |
| Lapras | G-Max Resonance | Ice | 7384 | Sets Aurora Veil |
| Eevee | G-Max Cuddle | Normal | 7083 | Infatuates all foes (no gender check) |
| Snorlax | G-Max Replenish | Normal | 7353 | 50% restore consumed Berry for user+allies |
| Garbodor | G-Max Malodor | Poison | 7276 | Poisons all foes |
| Melmetal | G-Max Meltdown | Steel | 7298 | Torment all non-Dynamaxed foes (3 turns) |
| Rillaboom | G-Max Drum Solo | Grass | 7138 | **Fixed BP 160; ignoreAbility** |
| Cinderace | G-Max Fireball | Fire | 7178 | **Fixed BP 160; ignoreAbility** |
| Inteleon | G-Max Hydrosnipe | Water | 7259 | **Fixed BP 160; ignoreAbility** |
| Corviknight | G-Max Wind Rage | Flying | 7774 | Removes hazards+screens both sides (Defog) |
| Orbeetle | G-Max Gravitas | Psychic | 7241 | Sets Gravity 5 turns |
| Drednaw | G-Max Stonesurge | Water | 7514 | Sets Stealth Rock on foe side |
| Coalossal | G-Max Volcalith | Rock | 7673 | 1/6 HP residual dmg 4 turns (non-Rock) |
| Flapple | G-Max Tartness | Grass | 7588 | Evasion -1 to all foes |
| Appletun | G-Max Sweetness | Grass | 7565 | Cures all status on user's party |
| Sandaconda | G-Max Sandblast | Ground | 7403 | Partial trap all foes (4-5 turns) |
| Toxtricity | G-Max Stun Shock | Electric | 7537 | Random: Paralysis/Poison to all foes |
| Centiskorch | G-Max Centiferno | Fire | 7018 | Partial trap all foes (4-5 turns) |
| Hatterene | G-Max Smite | Fairy | 7426 | Confuses all foes |
| Grimmsnarl | G-Max Snooze | Dark | 7449 | 50% Yawn on target |
| Alcremie | G-Max Finale | Fairy | 7155 | Heals user+allies by 1/6 max HP |
| Copperajah | G-Max Steelsurge | Steel | 7475 | Steel-type Stealth Rock on foe side |
| Duraludon | G-Max Depletion | Dragon | 7106 | -2 PP from foes' last move |
| Urshifu | G-Max One Blow | Dark | 7321 | Bypasses all protection |
| Urshifu-RS | G-Max Rapid Flow | Water | 7337 | Bypasses all protection |

// Source: Showdown data/moves.ts:6950-7800

---

## 6. Dynamax Edge Case Interactions

### Transform/Imposter + Dynamax

- Transform into Dynamaxed target: copies stats/moves/boosts but NOT Dynamax status (`noCopy: true` on Dynamax volatile)
  // Source: Showdown data/conditions.ts:755, sim/pokemon.ts:1223
- Dynamaxed Pokemon cannot use Transform (it becomes Max Guard as a status move)
- Imposter (Ditto) works same as Transform: copies non-Dynamax form, does NOT gain Dynamax HP
- After transforming, Ditto CAN Dynamax on a later turn using its own HP

### Encore/Disable + Dynamax

- Encore fails if target is Dynamaxed: `target.volatiles['dynamax'] -> return false`
  // Source: Showdown data/moves.ts:4910
- Disable fails if last move was a Max Move: `target.lastMove.isZOrMaxPowered || target.lastMove.isMax -> return false`
  // Source: Showdown data/moves.ts:3792
- Pre-existing Encore/Disable are effectively suspended during Dynamax (move IDs don't match Max Move slots); they resume after Dynamax ends if turns remain

### Choice Items + Dynamax

Choice Band/Specs/Scarf lock is suppressed during Dynamax. The Pokemon can freely choose any Max Move. After Dynamax ends, Choice lock resumes.

---

## 7. Terrain Boost Nerf

Gen 8 nerfs the terrain power boost from 1.5x (Gen 6-7) to 1.3x.
// Source: Showdown data/mods/gen8/scripts.ts (terrain modifier)

Applies to: Electric Terrain (Electric moves), Grassy Terrain (Grass moves), Psychic Terrain (Psychic moves from grounded Pokemon). Misty Terrain halves Dragon damage (0.5x, unchanged).

---

## 8. Key Move Changes

### Body Press
- Type: Fighting, Category: Physical, BP: 80, Accuracy: 100
- Uses user's **Defense** stat instead of Attack for damage calculation
- Still targets opponent's Defense (physical move)
  // Source: Showdown data/moves.ts:1625-1638

### Behemoth Blade (Zacian)
- Type: Steel, Category: Physical, BP: 100, Accuracy: 100
- 2x damage vs Dynamaxed targets (handled by Dynamax condition, not the move)
  // Source: Showdown data/conditions.ts:785

### Behemoth Bash (Zamazenta)
- Type: Steel, Category: Physical, BP: 100, Accuracy: 100
- 2x damage vs Dynamaxed targets
  // Source: Showdown data/conditions.ts:785

### Dynamax Cannon (Eternatus)
- Type: Dragon, Category: Special, BP: 100, Accuracy: 100
- 2x damage vs Dynamaxed targets
  // Source: Showdown data/conditions.ts:785

### Steel Beam
- Type: Steel, Category: Special, BP: 140, Accuracy: 95
- Recoil: `Math.round(maxHP / 2)` -- applies even on miss (mindBlownRecoil behavior)
  // Source: Showdown data/moves.ts (steelbeam entry, mindBlownRecoil flag)

### Rapid Spin (Gen 8 buff)
- BP buffed from 20 to 50
- Now grants +1 Speed on hit (new in Gen 8)
- Still removes Stealth Rock, Spikes, Toxic Spikes, Sticky Web, G-Max Steelsurge, Leech Seed, partial trapping
  // Source: Showdown data/moves.ts:15252

---

## 9. Key Ability Behaviors

### Libero / Protean (Gen 8 -- pre-nerf)
- Changes user's type to match the move being used
- Activates on **every** move use (no once-per-switchin limit)
- Nerfed to once-per-switchin in Gen 9
  // Source: Showdown data/mods/gen8/ has no once-per-switchin check

### Intrepid Sword (Zacian)
- Raises Attack by 1 stage on **every** switch-in
- Nerfed to once-per-battle in Gen 9
  // Source: Showdown data/mods/gen8/ has pure onStart with no flag

### Dauntless Shield (Zamazenta)
- Raises Defense by 1 stage on **every** switch-in
- Nerfed to once-per-battle in Gen 9
  // Source: Showdown data/mods/gen8/ has pure onStart with no flag

### Screen Cleaner
- On switch-in: removes Reflect, Light Screen, **and Aurora Veil** from **both** sides
  // Source: Showdown data/abilities.ts:4013-4026

### Gorilla Tactics
- Locks user into first selected move (like Choice Band)
- Raises Attack by 1.5x (multiplicative with other modifiers)

### Neutralizing Gas
- Nullifies all abilities on the field (including allies)
- When the Neutralizing Gas Pokemon leaves, all abilities reactivate

---

## 10. Key Item Behaviors

### Heavy-Duty Boots
- Blocks ALL entry hazard damage on switch-in: Stealth Rock, Spikes (all layers), Toxic Spikes, Sticky Web, G-Max Steelsurge
- Does NOT block: weather damage, terrain effects
- Does NOT remove hazards (only prevents damage)
- Can be removed by Knock Off
  // Source: Showdown data/items.ts (heavydutyboots entry)

---

## 11. Status Effects

### Burn
- Damage: 1/16 max HP per turn (same as Gen 7)
- Residual order: 10
  // Source: Showdown data/conditions.ts:15

### Paralysis
- Speed multiplier: 0.5x (same as Gen 7)
- 25% chance of full paralysis

### Poison
- Damage: 1/8 max HP per turn
- Residual order: 9
  // Source: Showdown data/conditions.ts:133

### Toxic (Badly Poisoned)
- Damage: N/16 max HP per turn (N increments each turn)
- Residual order: 9
  // Source: Showdown data/conditions.ts:154

### Confusion
- 33% chance of self-hit (same as Gen 7)
- Self-hit uses 40 BP typeless physical move

---

## 12. End-of-Turn Residual Order

All residual effects are collected and sorted by: order (ascending), priority (descending), speed (descending), subOrder (ascending).

| Order | Effect |
|-------|--------|
| Field 1 | Weather countdown + chip damage (Sandstorm/Hail: 1/16 HP) |
| Field 27 | Terrain countdown |
| 3 | Future Sight / Doom Desire |
| 4 | Wish |
| 5 sub 1 | G-Max residuals (Wildfire/Cannonade/Vine Lash/Volcalith), Fire Pledge |
| 5 sub 2 | Grassy Terrain healing (1/16 HP) |
| 6 | Aqua Ring (1/16 HP) |
| 7 | Ingrain (1/16 HP) |
| 8 | Leech Seed (1/8 HP) |
| 9 | Poison (1/8 HP), Toxic (N/16 HP) |
| 10 | Burn (1/16 HP) |
| 11 | Nightmare (1/4 HP) |
| 12 | Curse (1/4 HP) |
| 13 | Partial trapping (1/8 or 1/6 HP), Salt Cure |
| 14 | Octolock |
| 15-22 | Move countdowns (Taunt, Encore, Disable, Magnet Rise, Telekinesis, Heal Block, Embargo, Throat Chop) |
| 23 | Yawn (sleep next turn) |
| 24 | Perish Song |
| 25 | Roost (restore Flying type) |
| 28 | Abilities (Bad Dreams, Moody, Speed Boost) |
| 29 | Ability/item effects (Harvest, Pickup, Leftovers) |
| Pri -100 | Dynamax turn counter |

// Source: Showdown sim/battle.ts:404-411 (comparePriority), data/conditions.ts, data/moves.ts

---

## 13. Removed Mechanics

### No Mega Evolution
Mega Evolution is completely absent. `getMegaEvolutionGimmick()` returns null.

### No Z-Moves
Z-Moves are completely absent. `getZMoveGimmick()` returns null.

### No Pursuit
Pursuit move removed. No "attack before switch" mechanic exists.

### Removed Moves Count
- 94 regular moves removed (were in Gen 7, not in Gen 8)
- 14 signature moves removed in Gen 8 but restored in Gen 9
- All Z-Moves removed
- All Hidden Power variants removed
  // Source: Showdown data/moves.ts (isNonstandard: "Past"), data/mods/gen8/moves.ts

---

## 14. EXP Share

Always on, cannot be toggled.
- Active battler: 100% EXP
- Inactive party: 50% EXP each
- Fainted Pokemon: no EXP

---

## 15. Weather

Gen 8 uses **Hail** (not Snow). Hail deals 1/16 max HP chip damage per turn to non-Ice types.
Snow (which replaces Hail) was introduced in Gen 9.

Weather types: Sun, Rain, Sandstorm, Hail.
- Sun: +50% Fire moves, -50% Water moves
- Rain: +50% Water moves, -50% Fire moves
- Sandstorm: 1/16 chip to non-Rock/Ground/Steel, +50% SpDef to Rock types
- Hail: 1/16 chip to non-Ice types

Sandstorm SpDef boost:
```typescript
onModifySpD(spd, pokemon) {
    if (pokemon.hasType('Rock') && this.field.isWeather('sandstorm')) {
        return this.modify(spd, 1.5);
    }
}
```
// Source: Showdown data/conditions.ts:641-645

---

## 16. Damage Formula

Gen 8 uses the standard modern damage formula (same structure as Gen 3-7):

```
damage = ((((2 * Level / 5 + 2) * Power * A / D) / 50) + 2)
         * Targets * PB * Weather * GlaiveRush * Critical * random * STAB * Type * Burn * other * ZMove * TeraShield
```

Key Gen 8 modifiers:
- Terrain boost: 1.3x (nerfed from 1.5x in Gen 7)
- Dynamax moves use Max Move power (from dual table)
- Anti-Dynamax moves (Behemoth Blade/Bash/Dynamax Cannon): 2x vs Dynamaxed

// Source: Showdown sim/battle-actions.ts (damage calculation chain)
