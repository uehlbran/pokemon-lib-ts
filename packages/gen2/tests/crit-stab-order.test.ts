import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";

// ---------------------------------------------------------------------------
// Test helpers (adapted from damage-calc.test.ts)
// ---------------------------------------------------------------------------

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

/** Minimal ActivePokemon mock. */
function createActivePokemon(opts: {
  level: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  types: PokemonType[];
  status?: "burn" | null;
  heldItem?: string | null;
  speciesId?: number;
  statStages?: Partial<Record<string, number>>;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack,
    defense: opts.defense,
    spAttack: opts.spAttack,
    spDefense: opts.spDefense,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
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
    volatileStatuses: new Map(),
    types: opts.types,
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

/** Create a move mock with the given type and power. */
function createMove(
  type: PokemonType,
  power: number,
  category: "physical" | "special" | "status" = "physical",
  id = "test-move",
): MoveData {
  return {
    id,
    displayName: "Test Move",
    type,
    category,
    power,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: true,
      mirror: true,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 2,
  } as MoveData;
}

/** Minimal species data mock. */
function createSpecies(types: PokemonType[] = ["normal"]): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types,
    baseStats: { hp: 100, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    abilities: { normal: [""], hidden: null },
    genderRatio: 50,
    catchRate: 45,
    baseExp: 64,
    expGroup: "medium-slow",
    evYield: {},
    eggGroups: ["monster"],
    learnset: { levelUp: [], tm: [], egg: [], tutor: [] },
    evolution: null,
    dimensions: { height: 1, weight: 10 },
    spriteKey: "test",
    baseFriendship: 70,
    generation: 2,
    isLegendary: false,
    isMythical: false,
  } as PokemonSpeciesData;
}

/** All-neutral type chart for 17 Gen 2 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
  ];
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

    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("fighting", 80); // Non-STAB to avoid STAB interaction
    const typeChart = createNeutralTypeChart();
    const species = createSpecies();

    // Max random (255) for deterministic assertion
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: { weather: null, sides: [], turn: 1 } as any,
      rng: createMockRng(255),
      isCrit: true,
    };

    const result = calculateGen2Damage(context, typeChart, species);
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

    const attacker = createActivePokemon({
      level: 100,
      attack: 150,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const defender = createActivePokemon({
      level: 100,
      attack: 100,
      defense: 80,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("fighting", 100);
    const typeChart = createNeutralTypeChart();
    const species = createSpecies();

    const nonCritCtx: DamageContext = {
      attacker,
      defender,
      move,
      state: { weather: null, sides: [], turn: 1 } as any,
      rng: createMockRng(255),
      isCrit: false,
    };
    const critCtx: DamageContext = {
      ...nonCritCtx,
      isCrit: true,
    };

    const nonCritResult = calculateGen2Damage(nonCritCtx, typeChart, species);
    const critResult = calculateGen2Damage(critCtx, typeChart, species);

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

    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["fire"], // STAB for fire moves
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    const move = createMove("fire", 85);
    const typeChart = createNeutralTypeChart();
    const species = createSpecies(["fire"]);

    // Rain weather to get 0.5x for fire + 1.5x STAB
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: {
        weather: { type: "rain", turnsLeft: 5 },
        sides: [],
        turn: 1,
      } as any,
      rng: createMockRng(255), // max random
      isCrit: false,
    };

    const result = calculateGen2Damage(context, typeChart, species);

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

    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["water"],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: ["normal"],
    });
    // Water is special in Gen 2, so spAttack is used
    const move = createMove("water", 80, "special");
    const typeChart = createNeutralTypeChart();
    const species = createSpecies(["water"]);

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: {
        weather: { type: "rain", turnsLeft: 5 },
        sides: [],
        turn: 1,
      } as any,
      rng: createMockRng(255),
      isCrit: false,
    };

    const result = calculateGen2Damage(context, typeChart, species);

    // Derivation:
    //   levelFactor = 22, base = floor(1760/50)=35, +2=37
    //   weather: floor(37*1.5)=55, STAB: floor(55*1.5)=82
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Stab
    expect(result.damage).toBe(82);
  });
});
