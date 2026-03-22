# Gen 9 Ground Truth Reference

Authoritative mechanical values for Gen 9 (Scarlet/Violet). Primary source: Pokemon Showdown (no complete Gen 9 disassembly exists).

---

## Damage Formula

Same as Gen 5-8 with 4096-based modifier chain (pokeRound):

```text
baseDamage = floor(floor((2*Level/5 + 2) * Power * Atk / Def) / 50) + 2
```

Modifier application order:
1. Spread modifier (doubles only): pokeRound(damage, 3072) = 0.75x
2. Weather: pokeRound(damage, 6144 or 2048) = 1.5x or 0.5x
3. Critical hit: pokeRound(damage, 6144) = 1.5x
4. Random factor: floor(damage * roll / 100) where roll is [85..100]
5. STAB: pokeRound with Tera STAB rules
6. Type effectiveness: integer multiply/divide
7. Burn: pokeRound(damage, 2048) = 0.5x (physical only, Facade exempt)
8. Final modifiers: Life Orb, Screens, etc.
9. Minimum 1 damage (unless type immune)

Source: Showdown sim/battle-actions.ts -- Gen 9 damage formula

---

## Critical Hit System

| Stage | Denominator | Probability |
|-------|------------|-------------|
| 0 | 24 | 1/24 (~4.17%) |
| 1 | 8 | 1/8 (12.5%) |
| 2 | 2 | 1/2 (50%) |
| 3+ | 1 | Always (100%) |

Critical hit multiplier: **1.5x**

Source: Showdown sim/battle-actions.ts -- Gen 6-9 crit rate table [24, 8, 2, 1]

---

## Terastallization STAB Rules

| Condition | STAB Multiplier |
|-----------|----------------|
| Move matches Tera type AND original type | 2.0x |
| Move matches Tera type only (not original) | 1.5x |
| Move matches original type only (not Tera) | 1.5x |
| No type match | 1.0x |
| Adaptability + current type match: 1.5x case | 2.0x |
| Adaptability + current type match: 2.0x case | 2.25x |

Source: Showdown sim/battle-actions.ts:1756-1793 -- STAB logic

### Stellar Tera Type

| Condition | STAB Multiplier |
|-----------|----------------|
| First use of a base type | 2.0x (one-time, consumed) |
| Base type already boosted | 1.5x (standard STAB) |
| Non-base type | 4915/4096 (~1.2x) |

- Stellar Tera retains original defensive types (no defensive type change)
- Adaptability does NOT apply during Stellar Tera
- stellarBoostedTypes tracks which types have been consumed

Source: Showdown sim/battle-actions.ts:1770-1785 -- Stellar STAB

### Tera Blast

- Not Terastallized: Normal type, Special, 80 BP (unchanged)
- Terastallized (non-Stellar): type becomes Tera Type, physical if Atk > SpA
- Terastallized (Stellar): 100 BP, self-debuff -1 Atk and -1 SpA

Source: Showdown data/moves.ts:19919-19955 -- Tera Blast

---

## Snow Weather (Replaces Hail)

- **NO chip damage** (unlike Hail which dealt 1/16 to non-Ice types)
- Ice-type Pokemon get **1.5x Defense** boost (physical Defense stat)
- Applied as a stat modifier to the base Defense value, not as a damage modifier
- Only affects physical Defense, not Special Defense

Source: Showdown data/conditions.ts:696-728 -- Snow weather
Source: Showdown data/conditions.ts:709 -- snow.onModifyDef: this.modify(def, 1.5)

---

## Salt Cure

- Applies "salt-cure" volatile status
- End-of-turn residual damage at residualOrder 13 (same position as bind/trapping)
- **Water/Steel types**: floor(maxHP / 4) per turn
- **All other types**: floor(maxHP / 8) per turn
- Minimum 1 damage
- Cannot stack (Salt Cure cannot be applied if already present)
- noCopy: true (cannot be Baton Passed)

Source: Showdown data/moves.ts:16210-16238
Source: Showdown data/moves.ts:16225-16227 -- onResidual damage formula

---

## Supreme Overlord Power Table

4096-based modifier indexed by number of fainted allies (capped at 5):

| Fainted Allies | 4096-Based Modifier | Approximate Multiplier |
|----------------|--------------------|-----------------------|
| 0 | 4096 | 1.0x |
| 1 | 4506 | ~1.10x |
| 2 | 4915 | ~1.20x |
| 3 | 5325 | ~1.30x |
| 4 | 5734 | ~1.40x |
| 5 | 6144 | 1.50x |

Source: Showdown data/abilities.ts:4634-4658 -- supremeoverlord
  const powMod = [4096, 4506, 4915, 5325, 5734, 6144];

---

## Orichalcum Pulse / Hadron Engine

- **Orichalcum Pulse**: 5461/4096 (~1.333x) Attack in Sun or Desolate Land
- **Hadron Engine**: 5461/4096 (~1.333x) SpA on Electric Terrain
- Both are stat modifiers applied to the raw stat before the damage formula

Source: Showdown data/abilities.ts:3016-3035 -- orichalcumpulse onModifyAtk
Source: Showdown data/abilities.ts:1725-1742 -- hadronengine onModifySpA

---

## Rage Fist

- Power = min(350, 50 + 50 * timesAttacked)
- timesAttacked persists through switches (stored on PokemonInstance)
- Multi-hit moves count as one increment per move use (not per hit)
- Cap: 350 at 6+ hits taken

Source: Showdown data/moves.ts:15126-15128
  basePowerCallback(pokemon) { return Math.min(350, 50 + 50 * pokemon.timesAttacked); }

---

## Last Respects

- Power = 50 + 50 * totalFainted (no cap, unlike Rage Fist)
- totalFainted = side.faintCount (number of Pokemon that fainted on the user's side)

Source: Showdown data/moves.ts:10473-10474
  basePowerCallback(pokemon) { return 50 + 50 * pokemon.side.totalFainted; }

---

## Confusion

- Self-hit chance: 33% (1/3), same as Gen 7-8
- Changed from 50% in Gen 6 and earlier

Source: Showdown data/conditions.ts -- confusion self-hit 33% from Gen 7 onwards

---

## Paralysis

- Speed multiplier: 0.5x (same as Gen 7-8)
- Changed from 0.25x in Gen 6 and earlier

Source: Showdown sim/pokemon.ts -- paralysis speed modifier Gen 7+

---

## Burn

- Residual damage: 1/16 max HP per turn (same as Gen 7-8)
- Physical damage penalty: 0.5x (Facade and Guts bypass)

Source: Showdown data/conditions.ts -- burn damage and attack reduction

---

## Sleep Duration

- 1-3 turns (same as Gen 5+)

Source: Showdown data/conditions.ts -- sleep turn range

---

## Protosynthesis / Quark Drive

- **Protosynthesis**: activates in Sun/Desolate Land or with Booster Energy
- **Quark Drive**: activates in Electric Terrain or with Booster Energy
- Both boost the highest non-HP stat by 30% (5325/4096), or Speed by 50% (6144/4096)
- Booster Energy is consumed on use (permanent until switch-out)
- Weather/terrain-triggered activation does NOT consume Booster Energy

Source: Showdown data/abilities.ts -- protosynthesis, quarkdrive

---

## Removed Mechanics (from Gen 8)

- **Dynamax/Gigantamax**: completely removed
- **Z-Moves**: remain absent (removed in Gen 8)
- **Mega Evolution**: remains absent (removed in Gen 8)
- **Pursuit**: remains absent (removed in Gen 8)
- **Hidden Power, Return, Frustration**: remain absent

Source: Showdown data/mods/gen9 -- no Mega, Z-Moves, or Dynamax
