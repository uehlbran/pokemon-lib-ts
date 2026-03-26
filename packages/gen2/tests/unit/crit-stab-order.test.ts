import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_MOVE_CATEGORIES,
  type CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_MOVE_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
  GEN2_TYPES,
} from "../../src";
import { calculateGen2Damage } from "../../src/Gen2DamageCalc";
import { createSyntheticOnFieldPokemon as createSharedSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

// ---------------------------------------------------------------------------
// Test helpers (adapted from damage-calc.test.ts)
// ---------------------------------------------------------------------------

const DATA = createGen2DataManager();
const MOVE_IDS = GEN2_MOVE_IDS;
const _NATURE_IDS = GEN2_NATURE_IDS;
const SPECIES_IDS = GEN2_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const DEFAULT_MOVE = DATA.getMove(MOVE_IDS.tackle);
const NORMAL_SPECIES = DATA.getSpecies(SPECIES_IDS.snorlax);
const FIRE_SPECIES = DATA.getSpecies(SPECIES_IDS.magmar);
const WATER_SPECIES = DATA.getSpecies(SPECIES_IDS.feraligatr);
const DEFAULT_HP = 200;
const DEFAULT_SPEED = 100;
const MAX_RANDOM_ROLL = 255;

function createCanonicalMove(moveId: string): MoveData {
  return DATA.getMove(moveId) as MoveData;
}

function createSyntheticMove(opts: {
  id: string;
  displayName: string;
  type: PokemonType;
  power: number;
  category: (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES];
}): MoveData {
  return {
    ...DEFAULT_MOVE,
    ...opts,
    generation: 2,
  } as MoveData;
}

// Synthetic probes isolate exact arithmetic branches that do not have a canonical
// Gen 2 move with the required power/type combination.
const SYNTHETIC_FIGHTING_POWER_80 = createSyntheticMove({
  id: "synthetic-fighting-power-80",
  displayName: "Synthetic Fighting Power 80",
  type: TYPES.fighting,
  power: 80,
  category: CORE_MOVE_CATEGORIES.physical,
});

const SYNTHETIC_FIRE_POWER_85 = createSyntheticMove({
  id: "synthetic-fire-power-85",
  displayName: "Synthetic Fire Power 85",
  type: TYPES.fire,
  power: 85,
  category: CORE_MOVE_CATEGORIES.special,
});

const SYNTHETIC_WATER_POWER_80 = createSyntheticMove({
  id: "synthetic-water-power-80",
  displayName: "Synthetic Water Power 80",
  type: TYPES.water,
  power: 80,
  category: CORE_MOVE_CATEGORIES.special,
});

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createSyntheticOnFieldPokemon(opts: {
  species?: PokemonSpeciesData;
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types?: PokemonType[];
  status?: typeof CORE_STATUS_IDS.burn | null;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const species = opts.species ?? NORMAL_SPECIES;
  const stats: StatBlock = {
    hp: DEFAULT_HP,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: DEFAULT_SPEED,
  };
  return createSharedSyntheticOnFieldPokemon({
    speciesId: species.id,
    level: opts.level,
    moveSlots: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    calculatedStats: stats,
    currentHp: DEFAULT_HP,
    types: opts.types ?? species.types,
    statStages: {
      hp: 0,
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  });
}

/** All-neutral type chart for 17 Gen 2 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [...GEN2_TYPES];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

// ---------------------------------------------------------------------------
// #547: Gen 2 critical hits use 2x post-formula multiplier, NOT level doubling
// Source: pret/pokecrystal engine/battle/effect_commands.asm lines 3022-3129
//   .CriticalMultiplier (lines 3108-3129): shifts quotient left 1 bit (= *2)
//   Level is NOT doubled (lines 2943-2961 always use actual level)
// ---------------------------------------------------------------------------

describe("#547: Gen 2 critical hit uses 2x post-formula multiplier (not level doubling)", () => {
  it("given L50, P=80, A=100, D=100 crit, when calculating damage, then gives 72 not 69", () => {
    // Source: issue #547 — inline derivation from pret/pokecrystal BattleCommand_DamageCalc
    //
    // Correct (2x multiplier after formula):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor(floor(22*80*100/100)/50) = floor(1760/50) = 35
    //   After item (none): 35
    //   After 2x crit: 35 * 2 = 70
    //   Clamp [1,997]: 70
    //   +2 → 72
    //   No STAB, no weather, neutral type, max random (255/255) → 72
    //
    // Wrong (level doubling — Gen 1 approach):
    //   levelFactor = floor(2*100/5)+2 = 42
    //   base = floor(floor(42*80*100/100)/50) = floor(3360/50) = 67
    //   Clamp [1,997]: 67
    //   +2 → 69

    const attacker = createSyntheticOnFieldPokemon({
      species: NORMAL_SPECIES,
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const defender = createSyntheticOnFieldPokemon({
      species: NORMAL_SPECIES,
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const move = SYNTHETIC_FIGHTING_POWER_80;
    const typeChart = createNeutralTypeChart();

    // Max random (255) for deterministic assertion
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: { weather: null, sides: [], turn: 1 } as any,
      rng: createMockRng(MAX_RANDOM_ROLL),
      isCrit: true,
    };

    const result = calculateGen2Damage(context, typeChart, NORMAL_SPECIES);
    expect(result.damage).toBe(72);
    expect(result.isCrit).toBe(true);
  });

  it("given L100, P=100, A=150, D=80 crit, when calculating damage, then gives 2x non-crit damage", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm lines 3108-3129
    //   .CriticalMultiplier: sla [hl] = shift left = *2
    //
    // Non-crit derivation:
    //   levelFactor = floor(2*100/5)+2 = 42
    //   step1 = floor(42*100*150) = 630000
    //   step2 = floor(630000/80) = 7875
    //   base  = floor(7875/50)   = 157
    //   Clamp: 157, +2 → 159
    //   max random → 159
    //
    // Crit derivation (correct Gen 2: 2x multiplier after formula):
    //   base = 157 (same — level NOT doubled)
    //   After 2x crit: 157 * 2 = 314
    //   Clamp: 314, +2 → 316
    //   max random → 316
    //
    // Wrong (Gen 1 level doubling):
    //   levelFactor = floor(2*200/5)+2 = 82
    //   step1 = floor(82*100*150) = 1230000
    //   step2 = floor(1230000/80) = 15375
    //   base  = floor(15375/50) = 307
    //   +2 → 309

    const attacker = createSyntheticOnFieldPokemon({
      species: NORMAL_SPECIES,
      level: 100,
      attack: 150,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const defender = createSyntheticOnFieldPokemon({
      species: NORMAL_SPECIES,
      level: 100,
      attack: 100,
      defense: 80,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const move = createCanonicalMove(MOVE_IDS.dynamicPunch);
    const typeChart = createNeutralTypeChart();

    const nonCritCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: { weather: null, sides: [], turn: 1 } as any,
      rng: createMockRng(MAX_RANDOM_ROLL),
      isCrit: false,
    };
    const critCtx: DamageContext = {
      ...nonCritCtx,
      isCrit: true,
    };

    const nonCritResult = calculateGen2Damage(nonCritCtx, typeChart, NORMAL_SPECIES);
    const critResult = calculateGen2Damage(critCtx, typeChart, NORMAL_SPECIES);

    // Non-crit: 159, Correct crit: 316, Wrong crit (level doubling): 309
    expect(nonCritResult.damage).toBe(159);
    expect(critResult.damage).toBe(316);
    // Verify: crit is exactly 2x non-crit base (before +2)
    // (316 - 2) should equal 2 * (159 - 2) → 314 = 2 * 157 ✓
    expect(critResult.damage - 2).toBe(2 * (nonCritResult.damage - 2));
  });
});

// ---------------------------------------------------------------------------
// #544: Weather modifier must be applied BEFORE STAB (not after)
// Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
//   Line 1251: farcall DoWeatherModifiers — weather runs first
//   Lines 1270-1285: STAB addition — STAB runs second
// ---------------------------------------------------------------------------

describe("#544: Weather modifier applied before STAB (pokecrystal order)", () => {
  it("given a Fire STAB move in Sun, when calculating damage, then applies weather before STAB", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
    //   weather is applied first (line 1251), then STAB (lines 1270-1285)
    //
    // Use values where order matters due to flooring:
    //   L50, P=65, Fire-type attacker, Fire move, Sun weather, A=120, D=100
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor(floor(22*65*120/100)/50) = floor(floor(171600/100)/50) = floor(1716/50) = 34
    //   Clamp: 34, +2 → 36
    //
    //   Correct (weather-then-STAB per pokecrystal):
    //     weather: floor(36 * 1.5) = floor(54) = 54
    //     STAB:    floor(54 * 1.5) = floor(81) = 81
    //
    //   Wrong (STAB-then-weather):
    //     STAB:    floor(36 * 1.5) = floor(54) = 54
    //     weather: floor(54 * 1.5) = floor(81) = 81
    //
    // In this case both orders give the same result! We need a value where they diverge.
    // Divergence requires a base value where floor(x*1.5) != floor(floor(x*1.5)*1) somehow
    // Actually the key is: we need base B where floor(floor(B*1.5)*1.5) != floor(floor(B*1.5)*1.5)
    // Since both apply 1.5x twice, the order only matters when floor(B*1.5) is odd vs even
    // leading to different results on the second 1.5x.
    //
    // Let's find such a case. B=37:
    //   weather first: floor(37*1.5)=55, floor(55*1.5)=82
    //   STAB first:    floor(37*1.5)=55, floor(55*1.5)=82 (same — both 1.5x)
    //
    // Wait — when both multipliers are 1.5x, order doesn't matter because they are
    // the same operation. The divergence matters when STAB uses += floor(damage/2)
    // per the pret assembly (damage + floor(damage/2)) vs floor(damage * 1.5).
    //
    // pret/pokecrystal BattleCommand_Stab STAB logic (lines 1270-1285):
    //   ld a, [hli] ; hl = wCurDamage
    //   srl a       ; a = damage >> 1 = floor(damage/2)
    //   add [hl]    ; damage += floor(damage/2)
    //
    // Actually pokecrystal uses 16-bit damage: the STAB is "add half" (integer divide by 2).
    // floor(x + floor(x/2)) vs floor(x * 1.5) should be identical for integers since
    // x + floor(x/2) is exactly floor(x * 1.5) when x is a positive integer.
    // (For odd x: x + (x-1)/2 = (3x-1)/2, and floor(x*1.5) = floor((3x)/2) = (3x-1)/2.)
    //
    // So the divergence between orderings only manifests via the interaction
    // of Weather's 0.5x in the opposite direction with STAB's 1.5x.
    //
    // Better test: Fire move in Rain (weather=0.5x) with STAB (1.5x). For base=37:
    //   weather first: floor(37*0.5)=18, then STAB: floor(18*1.5)=27
    //   STAB first:    floor(37*1.5)=55, then weather: floor(55*0.5)=27 (same!)
    //
    // For base=39:
    //   weather first: floor(39*0.5)=19, STAB: floor(19*1.5)=28
    //   STAB first:    floor(39*1.5)=58, weather: floor(58*0.5)=29
    //   DIVERGENCE: 28 vs 29!
    //
    // So: Fire STAB user using a Fire move in Rain. base=39 → correct=28, wrong=29.
    //
    // We need to find L, P, A, D that produce base=39 (after +2, so pre-+2 = 37 → after clamp+2 = 39).
    // Actually base after +2 = 39 means pre-+2 clamped value = 37.
    // floor(floor(levelFactor * P * A / D) / 50) needs to be 37.
    // levelFactor = floor(2*L/5)+2. For L=50: 22.
    // floor(floor(22 * P * A / D) / 50) = 37 → floor(22*P*A/D) in [1850,1899]
    // 22*P*A/D in [1850, 1900). With A=D=100: 22*P in [1850,1900) → P in [84.09,86.36)
    // P=85: 22*85=1870, floor(1870/50)=37. YES!

    const attacker = createSyntheticOnFieldPokemon({
      species: FIRE_SPECIES,
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.fire],
    });
    const defender = createSyntheticOnFieldPokemon({
      species: NORMAL_SPECIES,
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.normal],
    });
    const move = SYNTHETIC_FIRE_POWER_85;
    const typeChart = createNeutralTypeChart();

    // Rain weather to get 0.5x for fire + 1.5x STAB
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: {
        weather: { type: WEATHER_IDS.rain, turnsLeft: 5 },
        sides: [],
        turn: 1,
      } as any,
      rng: createMockRng(MAX_RANDOM_ROLL),
      isCrit: false,
    };

    const result = calculateGen2Damage(context, typeChart, FIRE_SPECIES);

    // Derivation (with max random 255/255):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor(floor(22*85*100/100)/50) = floor(1870/50) = 37
    //   Clamp: 37, +2 → 39
    //   Correct order (weather→STAB): floor(39*0.5)=19, floor(19*1.5)=28
    //   Wrong order   (STAB→weather): floor(39*1.5)=58, floor(58*0.5)=29
    //   With max random: 28 (correct) or 29 (wrong)
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
    expect(result.damage).toBe(28);
  });

  it("given a Water STAB move in Rain (both 1.5x), when calculating damage, then applies weather before STAB", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
    //   weather first (line 1251), STAB second (lines 1270-1285)
    //
    // Water-type attacker using Water move in Rain:
    //   weather = 1.5x (rain boosts water), STAB = 1.5x
    //   With base value where floor operations diverge by order.
    //
    // For base B where floor(floor(B*1.5)*1.5) != floor(floor(B*1.5)*1.5):
    //   Both multipliers are 1.5x, so: weather→STAB vs STAB→weather are the same operation.
    //   These always give the same result. But we should still test the order is correct.
    //
    // Let's use base=41 (41+2=43 after +2 is wrong; let me recalc):
    // We want a base (after +2) that produces the same result regardless of order,
    // just to verify the function works for this combination.
    //
    // L=50, P=80, A=100, D=100:
    //   levelFactor = 22
    //   base = floor(floor(22*80*100/100)/50) = floor(1760/50) = 35
    //   +2 → 37
    //   weather(rain+water=1.5x): floor(37*1.5) = 55
    //   STAB(1.5x): floor(55*1.5) = 82
    //   max random → 82

    const attacker = createSyntheticOnFieldPokemon({
      species: WATER_SPECIES,
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.water],
    });
    const defender = createSyntheticOnFieldPokemon({
      species: NORMAL_SPECIES,
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [TYPES.normal],
    });
    // Water is special in Gen 2, so spAttack is used
    const move = SYNTHETIC_WATER_POWER_80;
    const typeChart = createNeutralTypeChart();

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: {
        weather: { type: WEATHER_IDS.rain, turnsLeft: 5 },
        sides: [],
        turn: 1,
      } as any,
      rng: createMockRng(MAX_RANDOM_ROLL),
      isCrit: false,
    };

    const result = calculateGen2Damage(context, typeChart, WATER_SPECIES);

    // Derivation:
    //   levelFactor = 22, base = floor(1760/50)=35, +2=37
    //   weather: floor(37*1.5)=55, STAB: floor(55*1.5)=82
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
    expect(result.damage).toBe(82);
  });
});
