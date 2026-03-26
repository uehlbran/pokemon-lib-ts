<!-- SPEC FRONT-MATTER -->
<!-- status: IMPLEMENTED -->
<!-- last-updated: 2026-03-15 -->

# Core Pokémon Library — Shared Logic

> **Status: IMPLEMENTED** — Formulas implemented in `packages/core/src/logic/`. Code is source of truth. Known issues documented below.

> Stat calculation, type effectiveness, experience curves, nature modifiers, catch rate,
> stat stages, and Pokémon factory functions.
>
> All functions are pure (no side effects, no state mutation) unless noted.
> The formulas here are the **Gen 3+ modern standard**. Generation-specific overrides
> (Gen 1 crit formula, Gen 2 stat calc, etc.) live in the battle library's gen plugins.

---

## 1. Stat Calculation

### 1.1 HP Formula (Gen 3+)

```typescript
/**
 * Calculate a Pokémon's maximum HP.
 *
 * Formula (Gen 3+):
 *   HP = floor(((2 * Base + IV + floor(EV / 4)) * Level) / 100) + Level + 10
 *
 * Special case: Shedinja always has 1 HP regardless of stats.
 *
 * @param base - Base HP stat (from species data)
 * @param iv - Individual Value (0-31)
 * @param ev - Effort Value (0-252)
 * @param level - Pokémon level (1-100)
 * @returns Maximum HP
 */
export function calculateHp(base: number, iv: number, ev: number, level: number): number {
  if (base === 1) return 1; // Shedinja
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
}
```

### 1.2 Other Stat Formula (Gen 3+)

```typescript
/**
 * Calculate a non-HP stat (Attack, Defense, SpAtk, SpDef, Speed).
 *
 * Formula (Gen 3+):
 *   Stat = floor((floor(((2 * Base + IV + floor(EV / 4)) * Level) / 100) + 5) * NatureMod)
 *
 * @param base - Base stat value
 * @param iv - Individual Value (0-31)
 * @param ev - Effort Value (0-252)
 * @param level - Pokémon level (1-100)
 * @param natureMod - Nature modifier (0.9, 1.0, or 1.1)
 * @returns Calculated stat value
 */
export function calculateStat(
  base: number, iv: number, ev: number, level: number, natureMod: number
): number {
  return Math.floor(
    (Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * natureMod
  );
}
```

### 1.3 Nature Modifier Lookup

```typescript
/**
 * Get the nature modifier for a specific stat.
 *
 * @returns 1.1 if nature boosts this stat, 0.9 if it hinders, 1.0 if neutral
 */
export function getNatureModifier(nature: NatureData, stat: NonHpStat): number {
  if (nature.increased === stat) return 1.1;
  if (nature.decreased === stat) return 0.9;
  return 1.0;
}
```

### 1.4 Calculate All Stats

```typescript
/**
 * Calculate all six stats for a Pokémon instance.
 * This is the main entry point for stat calculation.
 */
export function calculateAllStats(
  pokemon: PokemonInstance,
  species: PokemonSpeciesData,
  nature: NatureData
): StatBlock {
  return {
    hp: calculateHp(
      species.baseStats.hp,
      pokemon.ivs.hp,
      pokemon.evs.hp,
      pokemon.level
    ),
    attack: calculateStat(
      species.baseStats.attack,
      pokemon.ivs.attack,
      pokemon.evs.attack,
      pokemon.level,
      getNatureModifier(nature, 'attack')
    ),
    defense: calculateStat(
      species.baseStats.defense,
      pokemon.ivs.defense,
      pokemon.evs.defense,
      pokemon.level,
      getNatureModifier(nature, 'defense')
    ),
    spAttack: calculateStat(
      species.baseStats.spAttack,
      pokemon.ivs.spAttack,
      pokemon.evs.spAttack,
      pokemon.level,
      getNatureModifier(nature, 'spAttack')
    ),
    spDefense: calculateStat(
      species.baseStats.spDefense,
      pokemon.ivs.spDefense,
      pokemon.evs.spDefense,
      pokemon.level,
      getNatureModifier(nature, 'spDefense')
    ),
    speed: calculateStat(
      species.baseStats.speed,
      pokemon.ivs.speed,
      pokemon.evs.speed,
      pokemon.level,
      getNatureModifier(nature, 'speed')
    ),
  };
}
```

### 1.5 Stat Verification Values

Known-correct values for testing (verified against Bulbapedia/Showdown):

| Pokémon | Level | IVs | EVs | Nature | HP | Atk | Def | SpA | SpD | Spe |
|---------|-------|-----|-----|--------|-----|-----|-----|-----|-----|-----|
| Charizard (base: 78/84/78/109/85/100) | 50 | all 31 | 0/0/0/252/4/252 | Timid | 153 | 93 | 98 | 161 | 106 | 167 |
| Charizard | 100 | all 31 | 0/0/0/252/4/252 | Timid | 297 | 193 | 192 | 317 | 207 | 299 |<!-- VERIFY: Level 100 Timid Charizard row needs nature-adjusted Atk/Spe recalculation -->
| Shedinja | 50 | all 31 | all 252 | any | 1 | — | — | — | — | — |
| Pikachu (base: 35/55/40/50/50/90) | 50 | all 31 | 252/0/0/0/0/252 | Jolly | 142 | 75 | 60 | 70 | 70 | 156 |

---

## 2. Type Effectiveness

### 2.1 Single Type Lookup

```typescript
/**
 * Get the type effectiveness multiplier for one attacking type vs one defending type.
 *
 * @returns 0 (immune), 0.5 (resisted), 1 (neutral), or 2 (super effective)
 */
export function getTypeMultiplier(
  attackType: PokemonType,
  defendType: PokemonType,
  chart: TypeChart
): number {
  return chart[attackType]?.[defendType] ?? 1;
}
```

### 2.2 Full Type Effectiveness (vs dual type)

```typescript
/**
 * Get the combined type effectiveness multiplier against a (possibly dual-typed) defender.
 * Multiplies the individual factors.
 *
 * @returns 0, 0.25, 0.5, 1, 2, or 4
 */
export function getTypeEffectiveness(
  attackType: PokemonType,
  defenderTypes: readonly PokemonType[],
  chart: TypeChart
): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    multiplier *= getTypeMultiplier(attackType, defType, chart);
  }
  return multiplier;
}
```

### 2.3 Gen 6+ Type Chart (Default)

The complete 18×18 matrix. This is the canonical chart used by default.
Generation plugins can supply their own chart for historical accuracy.

Key differences from earlier gens that the chart reflects:
- Fairy type exists (added Gen 6)
- Steel does NOT resist Ghost or Dark (changed in Gen 6)
- Ghost IS super effective vs Psychic (fixed from Gen 1 bug)

```typescript
/**
 * The complete Gen 6+ type chart (18×18 matrix).
 * Exported as a constant — no function call needed.
 *
 * Usage: import { GEN6_TYPE_CHART } from '@pokemon-lib-ts/core'
 */
export const GEN6_TYPE_CHART: TypeChart = { /* 18x18 matrix */ };
```

> **Note**: `getDefaultTypeChart()` is deprecated. Use `GEN6_TYPE_CHART` directly.

Key relationships:
- Fire > Grass, Ice, Bug, Steel
- Water > Fire, Ground, Rock
- Grass > Water, Ground, Rock
- Electric > Water, Flying
- Ice > Grass, Ground, Flying, Dragon
- Fighting > Normal, Ice, Rock, Dark, Steel
- Poison > Grass, Fairy
- Ground > Fire, Electric, Poison, Rock, Steel
- Flying > Grass, Fighting, Bug
- Psychic > Fighting, Poison
- Bug > Grass, Psychic, Dark
- Rock > Fire, Ice, Flying, Bug
- Ghost > Psychic, Ghost
- Dragon > Dragon
- Dark > Psychic, Ghost
- Steel > Ice, Rock, Fairy
- Fairy > Fighting, Dragon, Dark

Immunities:
- Normal, Fighting → 0x vs Ghost
- Electric → 0x vs Ground
- Poison → 0x vs Steel
- Ground → 0x vs Flying
- Psychic → 0x vs Dark
- Ghost → 0x vs Normal
- Dragon → 0x vs Fairy

### 2.4 Effectiveness Classification

```typescript
export type EffectivenessCategory =
  | 'immune'              // 0x
  | 'double-resisted'     // 0.25x
  | 'resisted'            // 0.5x
  | 'neutral'             // 1x
  | 'super-effective'     // 2x
  | 'double-super';       // 4x

/**
 * Classify a multiplier into a human-readable category.
 */
export function classifyEffectiveness(multiplier: number): EffectivenessCategory {
  if (multiplier === 0) return 'immune';
  if (multiplier === 0.25) return 'double-resisted';
  if (multiplier === 0.5) return 'resisted';
  if (multiplier === 1) return 'neutral';
  if (multiplier === 2) return 'super-effective';
  return 'double-super'; // 4
}
```

---

## 3. Experience Curves

Six experience groups, each with a different formula mapping level → total EXP required.

### 3.1 EXP-to-Level Formulas

```typescript
/**
 * Calculate the total experience needed to reach a given level.
 *
 * All formulas are from Bulbapedia:
 * https://bulbapedia.bulbagarden.net/wiki/Experience
 *
 * @param group - Experience growth rate group
 * @param level - Target level (1-100)
 * @returns Total cumulative EXP needed to reach this level
 *
 * // Guard: if level <= 1, returns 0 (level 1 requires 0 total EXP for all groups)
 * // Guard: level is clamped to [1, 100]
 */
export function getExpForLevel(group: ExperienceGroup, level: number): number {
  const n = level;

  switch (group) {
    case 'erratic':
      // Piecewise formula
      if (n <= 50)      return Math.floor((n ** 3 * (100 - n)) / 50);
      if (n <= 68)      return Math.floor((n ** 3 * (150 - n)) / 100);
      if (n <= 98)      return Math.floor((n ** 3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n ** 3 * (160 - n)) / 100);

    case 'fast':
      return Math.floor((4 * n ** 3) / 5);

    case 'medium-fast':
      return n ** 3;

    case 'medium-slow':
      return Math.floor((6 / 5) * n ** 3 - 15 * n ** 2 + 100 * n - 140);

    case 'slow':
      return Math.floor((5 * n ** 3) / 4);

    case 'fluctuating':
      // Piecewise formula
      if (n <= 15)      return Math.floor(n ** 3 * ((Math.floor((n + 1) / 3) + 24) / 50));
      if (n <= 36)      return Math.floor(n ** 3 * ((n + 14) / 50));
      return Math.floor(n ** 3 * ((Math.floor(n / 2) + 32) / 50));
  }
}

/**
 * Get the EXP needed to advance from one level to the next.
 */
export function getExpToNextLevel(group: ExperienceGroup, currentLevel: number): number {
  if (currentLevel >= 100) return 0;
  return getExpForLevel(group, currentLevel + 1) - getExpForLevel(group, currentLevel);
}
```

### 3.2 EXP Gain Formula

```typescript
/**
 * Calculate experience gained from defeating a Pokémon.
 *
 * Gen 5+ "Scaled" formula:
 *   EXP = (b * L_d / 5) * (1 / s) * ((2 * L_d + 10)^2.5 / (L_d + L_p + 10)^2.5) + 1) * t * e
 *
 * Where:
 *   b = base EXP yield of defeated species
 *   L_d = level of defeated Pokémon
 *   L_p = level of participating Pokémon
 *   s = number of Pokémon that participated (EXP Share not counted here)
 *   t = 1.5 if trainer battle, 1.0 if wild
 *   e = 1.5 if holding Lucky Egg, 1.0 otherwise
 *
 * @param baseExpYield - Defeated species' base EXP yield
 * @param defeatedLevel - Level of the defeated Pokémon
 * @param participantLevel - Level of the Pokémon gaining EXP
 * @param isTrainerBattle - Whether this is a trainer battle
 * @param participantCount - Number of Pokémon that participated
 * @param hasLuckyEgg - Whether the gaining Pokémon holds Lucky Egg
 * @returns EXP gained (always at least 1)
 */
export function calculateExpGain(
  baseExpYield: number,
  defeatedLevel: number,
  participantLevel: number,
  isTrainerBattle: boolean,
  participantCount: number = 1,
  hasLuckyEgg: boolean = false,
): number {
  const b = baseExpYield;
  const Ld = defeatedLevel;
  const Lp = participantLevel;
  const s = participantCount;
  const t = isTrainerBattle ? 1.5 : 1.0;
  const e = hasLuckyEgg ? 1.5 : 1.0;

  const scaledBase = (b * Ld) / 5 / s;
  const levelFactor = (Math.pow(2 * Ld + 10, 2.5) / Math.pow(Ld + Lp + 10, 2.5)) + 1;
  const exp = Math.floor(scaledBase * levelFactor * t * e);

  return Math.max(1, exp);
}

/**
 * Classic (Gen 1-4) EXP formula — provided for gen plugins.
 *
 *   EXP = (b * L_d / 7) * (1 / s) * t
 *
 * Simpler — no level scaling, stronger Pokémon don't get reduced EXP.
 */
export function calculateExpGainClassic(
  baseExpYield: number,
  defeatedLevel: number,
  isTrainerBattle: boolean,
  participantCount: number = 1,
): number {
  const t = isTrainerBattle ? 1.5 : 1.0;
  return Math.max(1, Math.floor((baseExpYield * defeatedLevel / 7 / participantCount) * t));
}
```

---

## 4. Stat Stage Modifiers

In-battle stat stages range from -6 to +6. Each stage applies a multiplier to the stat.

### 4.1 Regular Stats (Atk, Def, SpAtk, SpDef, Speed)

**Integer ratio lookup tables** are exposed so gen packages can apply `floor(stat * numerator / denominator)` without floating-point precision issues. The formula `(2+stage)/2` and `2/(2-stage)` is mathematically equivalent but produces floating-point values.

> **Source**: Added in fix/deep-accuracy-audit (2026-03-18). See ERRATA.md §36E-1.

```typescript
/**
 * Stat stage multiplier table.
 * Stage 0 = 1x (no modification).
 * Positive stages boost, negative stages reduce.
 *
 * Formula: multiplier = max(2, 2 + stage) / max(2, 2 - stage)
 *
 * | Stage | Num | Den | Multiplier  |
 * |-------|-----|-----|-------------|
 * | -6    |  2  |  8  | 0.25        |
 * | -5    |  2  |  7  | ≈ 0.286     |
 * | -4    |  2  |  6  | ≈ 0.333     |
 * | -3    |  2  |  5  | 0.40        |
 * | -2    |  2  |  4  | 0.50        |
 * | -1    |  2  |  3  | ≈ 0.667     |
 * |  0    |  2  |  2  | 1.00        |
 * | +1    |  3  |  2  | 1.50        |
 * | +2    |  4  |  2  | 2.00        |
 * | +3    |  5  |  2  | 2.50        |
 * | +4    |  6  |  2  | 3.00        |
 * | +5    |  7  |  2  | 3.50        |
 * | +6    |  8  |  2  | 4.00        |
 */

/** Numerators for stat stage lookup (index 0 = stage -6, index 6 = stage 0, index 12 = stage +6) */
export const STAT_STAGE_NUMERATORS: readonly number[] = [
  2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8
] as const;

/** Denominators for stat stage lookup (index 0 = stage -6, index 6 = stage 0, index 12 = stage +6) */
export const STAT_STAGE_DENOMINATORS: readonly number[] = [
  8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2
] as const;

/** Apply a stat stage as integer arithmetic: floor(stat * num / den) */
export function applyStatStageInteger(stat: number, stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  const index = clamped + 6;
  return Math.floor(stat * STAT_STAGE_NUMERATORS[index]! / STAT_STAGE_DENOMINATORS[index]!);
}

export function getStatStageMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  if (clamped >= 0) {
    return (2 + clamped) / 2;
  }
  return 2 / (2 - clamped);
}
```

### 4.2 Accuracy and Evasion

**Gen 3+ (pokeemerald `sAccuracyStageRatios`)**: The accuracy stage table uses a 3-based system, but the exact values come from an explicit lookup table in the decomp, not the pure formula `(3+stage)/3`. The formula is a close approximation, but the lookup table is authoritative for Gen 3 implementation.

> **Source**: pokeemerald `src/battle_util.c` `sAccuracyStageRatios`. See ERRATA.md §36C-5. The Gen 3+ table below is the canonical source for accuracy stage ratios in packages/gen3 and later.

**Gen 1**: Accuracy stages use the same 2-based table as regular stat stages (`(2+stage)/2`), NOT the 3-based table. Two sequential floor operations are applied (see specs/battle/02-gen1.md §8).

**Gen 2**: Uses a different lookup table from pokecrystal `data/moves/accuracy_stages.asm` with byte-pair ratios. See ERRATA.md §36B-3.

```typescript
/**
 * Accuracy/Evasion stage multiplier (Gen 3+ default).
 * Uses the pokeemerald sAccuracyStageRatios lookup table values.
 *
 * | Stage | Num/Den   | Decimal |
 * |-------|-----------|---------|
 * | -6    | 33/100    | 0.330   |
 * | -5    | 36/100    | 0.360   |
 * | -4    | 43/100    | 0.430   |
 * | -3    | 50/100    | 0.500   |
 * | -2    | 60/100    | 0.600   |
 * | -1    | 75/100    | 0.750   |
 * |  0    | 100/100   | 1.000   |
 * | +1    | 133/100   | 1.330   |
 * | +2    | 166/100   | 1.660   |
 * | +3    | 200/100   | 2.000   |
 * | +4    | 233/100   | 2.330   |
 * | +5    | 266/100   | 2.660   |
 * | +6    | 300/100   | 3.000   |
 *
 * Note: The formula (3+stage)/3 approximates these values but differs for
 * stages ±1, ±2, ±4, ±5. Use the lookup table for Gen 3+ accuracy calculations.
 */

/** Numerators for accuracy stage lookup (index 0 = stage -6, index 6 = stage 0, index 12 = stage +6) */
export const ACCURACY_STAGE_NUMERATORS: readonly number[] = [
  33, 36, 43, 50, 60, 75, 100, 133, 166, 200, 233, 266, 300
] as const;

/** All accuracy/evasion use denominator 100 in Gen 3+ */
export const ACCURACY_STAGE_DENOMINATOR = 100;

export function getAccuracyEvasionMultiplier(stage: number): number {
  const clamped = Math.max(-6, Math.min(6, stage));
  const index = clamped + 6; // 0-12
  return ACCURACY_STAGE_NUMERATORS[index]! / ACCURACY_STAGE_DENOMINATOR;
}

/**
 * Calculate the effective accuracy of a move in battle (Gen 3+ default).
 *
 * Uses lookup table ratios and floor at each step.
 * netStage = clamp(accuracyStage - evasionStage, -6, 6)
 *
 * Gen 1 uses a different formula — see specs/battle/02-gen1.md §8.
 * Gen 2 uses a different lookup table — see ERRATA.md §36B-3.
 *
 * If move accuracy is null, the move never misses.
 */
export function calculateAccuracy(
  moveAccuracy: number | null,
  accuracyStage: number,
  evasionStage: number,
): number {
  if (moveAccuracy === null) return Infinity;
  const accMod = getAccuracyEvasionMultiplier(accuracyStage);
  const evaMod = getAccuracyEvasionMultiplier(evasionStage);
  return Math.floor(moveAccuracy * accMod / evaMod);
}
```

---

## 5. Critical Hit

### 5.1 Critical Hit Stages & Rates

```typescript
/**
 * Critical hit probability by stage (Gen 6+).
 *
 * | Stage | Rate      |
 * |-------|-----------|
 * | 0     | 1/24 (≈4.17%) |
 * | 1     | 1/8 (12.5%) |
 * | 2     | 1/2 (50%)   |
 * | 3+    | 1/1 (100%)  |
 *
 * Gen 1 used Speed-based crit rate (see Gen 1 battle spec).
 */
export const CRIT_RATES_GEN6: readonly number[] = [
  1 / 24,  // Stage 0
  1 / 8,   // Stage 1
  1 / 2,   // Stage 2
  1,       // Stage 3+
] as const;

/**
 * Gen 2 critical hit rates (threshold-based, not stage-based like Gen 3+).
 * In Gen 2, crit checks use a random number 0-255 compared to a threshold.
 * These are the raw threshold values (higher = more likely to crit).
 * Stage 0: threshold = 17 (17/256 ≈ 6.64%)
 */
export const CRIT_RATES_GEN2: readonly number[] = [
  17 / 256,  // Stage 0 ≈ 6.64%
  32 / 256,  // Stage 1 = 12.5%
  64 / 256,  // Stage 2 = 25%
  85 / 256,  // Stage 3 ≈ 33.2%
  128 / 256, // Stage 4 = 50%
] as const;

/**
 * Gen 3-5 critical hit rates (stage-based probability table).
 */
export const CRIT_RATES_GEN3_5: readonly number[] = [
  1 / 16,  // Stage 0 = 6.25%
  1 / 8,   // Stage 1 = 12.5%
  1 / 4,   // Stage 2 = 25%
  1 / 3,   // Stage 3 ≈ 33.3%
  1 / 2,   // Stage 4+ = 50%
] as const;

// Note: The old CRIT_RATES_GEN2_5 name was split into CRIT_RATES_GEN2 and CRIT_RATES_GEN3_5 to accurately reflect per-gen differences.

/**
 * Get the critical hit rate for a given stage.
 * @param stage - Crit stage (0+, clamped to max index)
 * @param rateTable - Which generation's rate table to use
 * @returns Probability of critical hit (0 to 1)
 *
 * // Guard: negative stages are treated as 0 (stage is clamped to [0, max])
 */
export function getCritRate(stage: number, rateTable: readonly number[]): number {
  const index = Math.min(stage, rateTable.length - 1);
  return rateTable[index]!;
}

/** Critical hit damage multiplier (Gen 6+: 1.5x, Gen 1-5: 2x) */
export const CRIT_MULTIPLIER_MODERN = 1.5;
export const CRIT_MULTIPLIER_CLASSIC = 2.0;
```

---

## 6. Catch Rate

### 6.1 Modern Catch Rate Formula (Gen 3+)

```typescript
/**
 * Calculate the modified catch rate.
 *
 * Formula (Gen 3-4):
 *   a = ((3 * HP_max - 2 * HP_current) * CatchRate * BallMod) / (3 * HP_max)) * StatusMod
 *
 * Gen 5+ is similar but with different status modifiers.
 *
 * @returns Modified catch rate (0-255). Higher = easier to catch.
 */
export function calculateModifiedCatchRate(
  maxHp: number,
  currentHp: number,
  baseCatchRate: number,
  ballModifier: number,
  statusModifier: number,
): number {
  const hpFactor = (3 * maxHp - 2 * currentHp) / (3 * maxHp);
  const a = hpFactor * baseCatchRate * ballModifier * statusModifier;
  return Math.min(255, Math.max(1, Math.floor(a)));
}

/**
 * Status condition catch rate modifiers.
 */
export const STATUS_CATCH_MODIFIERS: Record<PrimaryStatus, number> = {
  'sleep': 2.5,          // Gen 5+ (was 2.0 in Gen 3-4)
  'freeze': 2.5,         // Gen 5+ (was 2.0 in Gen 3-4)
  'paralysis': 1.5,
  'burn': 1.5,
  'poison': 1.5,
  'badly-poisoned': 1.5,
} as const;

/**
 * Calculate how many times the ball shakes (0-3).
 * 3 shakes = caught.
 *
 * Formula:
 *   b = 65536 / (255 / a)^0.1875
 *   Each shake succeeds if a random number [0, 65535] < b
 *   4 successful checks = caught
 *
 * @returns Number of shake checks that succeed (0-4, where 4 = caught)
 */
export function calculateShakeChecks(
  modifiedCatchRate: number,
  rng: SeededRandom,
): number {
  if (modifiedCatchRate >= 255) return 4; // Guaranteed catch

  const b = Math.floor(65536 / Math.pow(255 / modifiedCatchRate, 0.1875));

  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rng.int(0, 65535) < b) {
      shakes++;
    } else {
      break;
    }
  }
  return shakes;
}
```

---

## 7. Pokémon Factory

### 7.1 Creating a Pokémon Instance

```typescript
/**
 * Create a new PokémonInstance from a species and level.
 *
 * If options aren't provided, generates random values:
 * - IVs: Random 0-31 per stat
 * - Nature: Random
 * - Gender: Based on species gender ratio
 * - Ability: Random from normal abilities
 * - Shiny: 1/4096 chance (Gen 6+ rate)
 * - Moves: Latest 4 level-up moves at or below the level
 *
 * @param species - Species data
 * @param level - Level (1-100)
 * @param rng - Seeded random for deterministic generation
 * @param options - Override any default values
 */
export function createPokemonInstance(
  species: PokemonSpeciesData,
  level: number,
  rng: SeededRandom,
  options?: Partial<PokemonCreationOptions>,
): PokemonInstance {
  // Generate IVs
  const ivs: StatBlock = options?.ivs ?? {
    hp: rng.int(0, 31),
    attack: rng.int(0, 31),
    defense: rng.int(0, 31),
    spAttack: rng.int(0, 31),
    spDefense: rng.int(0, 31),
    speed: rng.int(0, 31),
  };

  // Pick nature
  const ALL_NATURES: NatureId[] = [/* all 25 */];
  const nature = options?.nature ?? rng.pick(ALL_NATURES);

  // Determine gender
  const gender = options?.gender ?? determineGender(species.genderRatio, rng);

  // Pick ability
  const abilitySlot = options?.abilitySlot ?? (
    species.abilities.normal.length > 1
      ? (rng.chance(0.5) ? 'normal1' : 'normal2')
      : 'normal1'
  );
  const ability = getAbilityForSlot(species, abilitySlot);

  // Determine shininess
  const isShiny = options?.isShiny ?? rng.chance(1 / 4096);

  // Select moves — latest 4 level-up moves at or below this level
  const moves = options?.moves
    ? options.moves.map(moveId => createMoveSlot(moveId))
    : getDefaultMoves(species.learnset, level);

  // EVs default to 0
  const evs: MutableStatBlock = options?.evs
    ? { ...options.evs }
    : { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

  const uid = generateUid(rng);

  const instance: PokemonInstance = {
    uid,
    speciesId: species.id,
    nickname: options?.nickname ?? null,
    level,
    experience: 0, // Will be set based on group
    nature,
    ivs,
    evs,
    currentHp: 0,  // Will be set after stat calc
    moves,
    ability,
    abilitySlot,
    heldItem: options?.heldItem ?? null,
    status: null,
    friendship: options?.friendship ?? species.baseFriendship,
    gender,
    isShiny,
    metLocation: options?.metLocation ?? 'unknown',
    metLevel: level,
    originalTrainer: options?.originalTrainer ?? 'Player',
    originalTrainerId: options?.originalTrainerId ?? 0,
    pokeball: options?.pokeball ?? 'poke-ball',
    teraType: options?.teraType ?? species.types[0],
    dynamaxLevel: options?.dynamaxLevel ?? 0,
  };

  // Calculate stats and set HP to max
  // (Caller must provide nature data from DataManager for accurate calc)
  // instance.calculatedStats = calculateAllStats(instance, species, natureData);
  // instance.currentHp = instance.calculatedStats.hp;
  // instance.experience = getExpForLevel(species.expGroup, level);

  return instance;
}
```

Design note:
- The current shared `createPokemonInstance(...)` surface is modern-stat-model oriented. As the cleanup progresses, generation-aware validated stat-input helpers should sit in front of it so callers do not hand-roll raw IV/EV/DV/Stat Exp bags or accidentally apply the wrong model for the target generation.
- Those helpers should use explicit validators plus shared `ValidationFailure` / `ValidationResult` naming and owned min/max/cap constants instead of repeating literals like `31`, `252`, `510`, `15`, and `65535`.
- Once those validated helpers exist, they become the default public creation path for bounded stat inputs in touched code. Keep the validators reusable, but do not let normal call sites keep constructing raw stat bags and hope a later validator catches the mistake.
- The same ownership split should mirror the canonical-vs-synthetic test-fixture rule: canonical data comes directly from the owning generation data manager, while any intentionally synthetic variant must be built explicitly from that canonical base rather than through an ambiguous helper that hides the source.

### 7.2 Helper Functions

```typescript
/**
 * Determine gender based on species gender ratio.
 * @param genderRatio - % male. -1 = genderless.
 */
export function determineGender(genderRatio: number, rng: SeededRandom): Gender {
  if (genderRatio === -1) return 'genderless';
  if (genderRatio === 0) return 'female';
  if (genderRatio === 100) return 'male';
  return rng.int(1, 100) <= genderRatio ? 'male' : 'female';
}

/**
 * Get the default moveset for a Pokémon at a given level.
 * Takes the latest 4 level-up moves at or below the level.
 */
export function getDefaultMoves(learnset: Learnset, level: number): MoveSlot[] {
  const eligible = learnset.levelUp
    .filter(m => m.level <= level)
    .reverse()  // Latest first
    .slice(0, 4);

  return eligible.map(m => createMoveSlot(m.move));
}

/**
 * Create a MoveSlot with full PP.
 */
export function createMoveSlot(moveId: string, pp?: number, ppUps: number = 0): MoveSlot {
  // PP comes from move data — caller should provide it
  // Default fallback uses a placeholder that gets resolved by DataManager
  const maxPP = pp ? Math.floor(pp * (1 + 0.2 * ppUps)) : 0;
  return {
    moveId,
    currentPP: maxPP,
    maxPP,
    ppUps,
  };
}
```

---

## 8. Damage Utility Functions

These are shared building blocks used by gen-specific damage calculators in the battle library.

```typescript
/**
 * Apply a damage modifier to a value with integer truncation.
 * This is the standard way damage modifiers are applied in Pokémon.
 */
export function applyDamageModifier(value: number, modifier: number): number {
  return Math.floor(value * modifier);
}

/**
 * Apply a chain of damage modifiers to a value.
 * Each modifier is applied with floor truncation in sequence.
 */
export function applyDamageModifierChain(value: number, modifiers: readonly number[]): number {
  let result = value;
  for (const mod of modifiers) {
    result = applyDamageModifier(result, mod);
  }
  return result;
}

/**
 * STAB (Same Type Attack Bonus) modifier.
 * @returns 1.5 normally, 2.0 with Adaptability ability, 1.0 if no STAB
 */
export function getStabModifier(
  moveType: PokemonType,
  attackerTypes: readonly PokemonType[],
  hasAdaptability: boolean = false,
): number {
  const isStab = attackerTypes.includes(moveType);
  if (!isStab) return 1.0;
  return hasAdaptability ? 2.0 : 1.5;
}

/**
 * Weather damage modifier for moves.
 *
 * Rain:  Water moves × 1.5, Fire moves × 0.5
 * Sun:   Fire moves × 1.5, Water moves × 0.5
 * Other: No damage modification (sand/snow damage is applied at turn end)
 */
export function getWeatherDamageModifier(
  moveType: PokemonType,
  weather: WeatherType | null,
): number {
  if (!weather) return 1.0;

  if (weather === 'rain' || weather === 'heavy-rain') {
    if (moveType === 'water') return 1.5;
    if (moveType === 'fire') return weather === 'heavy-rain' ? 0 : 0.5;
  }

  if (weather === 'sun' || weather === 'harsh-sun') {
    if (moveType === 'fire') return 1.5;
    if (moveType === 'water') return weather === 'harsh-sun' ? 0 : 0.5;
  }

  return 1.0;
}
```

---

## 9. Tooling Configuration

Based on project conventions, both packages use:

### 9.1 Biome (Linting & Formatting)

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "correctness": {
        "useExhaustiveDependencies": "warn"
      }
    }
  },
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignore": ["node_modules", "dist", "build", "coverage"]
  }
}
```

### 9.2 Vitest Configuration

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts', '**/*.test.ts', '**/*.d.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### 9.3 CLAUDE.md (Per Package)

Each package gets a `CLAUDE.md` that Claude Code reads at the start of every session.

```markdown
# @pokemon-lib-ts/core

## Project Context
<!-- Fill in project-specific context here -->

## Tech Stack
TypeScript, Vitest, Biome

## Architecture
- `src/entities/` — TypeScript interfaces and types (no logic)
- `src/logic/` — Pure functions: stat calc, type chart, EXP curves
- `src/data/` — DataManager for loading/caching JSON data
- `src/prng/` — Seeded PRNG (Mulberry32)
- `src/constants/` — Enums, lookup tables

## Build & Test
- Build: `npm run build` (tsc)
- Test: `npx vitest run` / `npx vitest run --coverage`
- Typecheck: `npm run typecheck`
- Lint/Format: `npx @biomejs/biome check --write .`

## Key Rules
- Zero runtime dependencies. Zero game engine imports.
- All entity interfaces use `readonly` for immutable fields.
- All formulas must be pure functions (no side effects).
- Test against known-correct values from Bulbapedia/Showdown.
- Never use Math.random() — always use SeededRandom.
- Biome handles formatting — no style rules here.
```

---

## 10. Implementation Cross-Reference

| Concept | Source File | Notes |
|---------|-------------|-------|
| calculateHp, calculateStat | `packages/core/src/logic/statCalc.ts` (verify filename) | Gen 3+ formulas |
| calculateAllStats | `packages/core/src/logic/statCalc.ts` (verify filename) | Calls above |
| getNatureModifier | `packages/core/src/logic/statCalc.ts` (verify filename) | 0.9/1.0/1.1 |
| getTypeMultiplier, getTypeEffectiveness | `packages/core/src/logic/typeChart.ts` (verify filename) | Chart lookup |
| GEN6_TYPE_CHART | `packages/core/src/logic/typeChart.ts` (verify filename) | Constant, not function |
| getExpForLevel | `packages/core/src/logic/experience.ts` (verify filename) | EXP curves |
| CRIT_RATES_GEN2, CRIT_RATES_GEN3_5 | `packages/core/src/logic/critCalc.ts` (verify filename) | Split constants |
| applyDamageModifier, applyDamageModifierChain | `packages/core/src/logic/damageUtils.ts` | Modifier application |
| getWeatherDamageModifier | `packages/core/src/logic/damageUtils.ts` | Weather modifier |
| SeededRandom | `packages/core/src/prng/SeededRandom.ts` | Mulberry32 |

> **Note**: Verify exact filenames by checking `packages/core/src/logic/`.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.4 | 2026-03-18 | Deep accuracy audit (fix/deep-accuracy-audit): Added STAT_STAGE_NUMERATORS/DENOMINATORS integer lookup tables and applyStatStageInteger(). Replaced accuracy stage formula with ACCURACY_STAGE_NUMERATORS lookup from pokeemerald sAccuracyStageRatios; added gen-specific notes (Gen 1 uses 2-based table; Gen 2 uses pokecrystal table). See ERRATA.md §36E. |
| 1.3 | 2026-03-17 | Renamed getTypeFactor→getTypeMultiplier; removed p parameter from EXP gain formula; renamed applyModifier→applyDamageModifier, applyModifierChain→applyDamageModifierChain, getWeatherModifier→getWeatherDamageModifier; updated Cross-Reference |
| 1.2 | 2026-03-15 | Fixed stat verification table (nature-adjusted values), documented net-stage accuracy formula, split CRIT_RATES_GEN2_5 into gen-specific constants, renamed getDefaultTypeChart→GEN6_TYPE_CHART, added guards documentation, added Cross-Reference |
| 1.0 | 2024 | Initial shared logic spec |
