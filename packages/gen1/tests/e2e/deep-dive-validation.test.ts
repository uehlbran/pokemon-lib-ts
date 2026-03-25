/**
 * Deep-Dive Validation Tests — Gen 1 Ground-Truth Verification
 *
 * Five sections verifying Gen 1 mechanics against known values:
 *   3A: Stat calculations for known Pokemon at L100/max DVs/max StatExp
 *   3B: Type chart cross-validation (Gen 1-specific matchups and Steel absence)
 *   3C: Damage formula exact values (STAB, 4x SE, crits, stat overflow)
 *   3D: Crit rate verification by base Speed
 *   3E: Status damage amounts (burn, poison, toxic escalation, no damage on others)
 */

import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import { createActivePokemon, createTestPokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PrimaryStatus,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen1DataManager,
  GEN1_MOVE_IDS,
  GEN1_SPECIES_IDS,
} from "../../src";
import { getGen1CritRate } from "../../src/Gen1CritCalc";
import { calculateGen1Damage } from "../../src/Gen1DamageCalc";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";
import { calculateGen1Stats } from "../../src/Gen1StatCalc";
import { GEN1_TYPE_CHART } from "../../src/Gen1TypeChart";

// ============================================================================
// Shared helpers
// ============================================================================

const dataManager = createGen1DataManager();
const M = GEN1_MOVE_IDS;
const P = GEN1_SPECIES_IDS;
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;
const NEUTRAL_NATURE = NEUTRAL_NATURES[0];
const GEN1_TEST_TYPES: readonly PokemonType[] = [
  T.normal,
  T.fire,
  T.water,
  T.electric,
  T.grass,
  T.ice,
  T.fighting,
  T.poison,
  T.ground,
  T.flying,
  T.psychic,
  T.bug,
  T.rock,
  T.ghost,
  T.dragon,
];

function getSpecies(id: number): PokemonSpeciesData {
  return dataManager.getSpecies(id);
}

function getMove(id: string): MoveData {
  return dataManager.getMove(id);
}

function makeInstance(opts: {
  speciesId: number;
  level: number;
  ivs: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  evs: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): PokemonInstance {
  return createTestPokemon(opts.speciesId, opts.level, {
    ivs: opts.ivs,
    evs: opts.evs,
    currentHp: 1,
    nature: NEUTRAL_NATURE,
    ability: "",
    moves: [],
  });
}

const MAX_DVS = { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 };
const MAX_STAT_EXP = {
  hp: 65535,
  attack: 65535,
  defense: 65535,
  spAttack: 65535,
  spDefense: 65535,
  speed: 65535,
};
const _ZERO_STAT_EXP = { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 };

/** At L100, max DVs (15), max StatExp (65535): HP = base*2+204; other = base*2+99 */
function expectedHp(base: number): number {
  return base * 2 + 204;
}

function expectedStat(base: number): number {
  return base * 2 + 99;
}

function expectedMaxStatBlock(species: PokemonSpeciesData): StatBlock {
  return {
    hp: expectedHp(species.baseStats.hp),
    attack: expectedStat(species.baseStats.attack),
    defense: expectedStat(species.baseStats.defense),
    spAttack: expectedStat(species.baseStats.spAttack),
    spDefense: expectedStat(species.baseStats.spDefense),
    speed: expectedStat(species.baseStats.speed),
  };
}

// ============================================================================
// 3A: Stat Calculations — Known Values
// ============================================================================

describe("3A: Stat Calculations (known Pokemon, L100 max DVs max StatExp)", () => {
  it("given Mewtwo at L100 max DVs max StatExp, when calculating HP, then returns 416", () => {
    // Arrange — base HP 106: 106*2+204 = 416
    const species = getSpecies(P.mewtwo);
    const pokemon = makeInstance({ speciesId: P.mewtwo, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(expectedHp(species.baseStats.hp)); // 416
  });

  it("given Mewtwo at L100 max DVs max StatExp, when calculating Attack, then returns 319", () => {
    // Arrange — base Atk 110: 110*2+99 = 319
    const species = getSpecies(P.mewtwo);
    const pokemon = makeInstance({ speciesId: P.mewtwo, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.attack).toBe(expectedStat(species.baseStats.attack)); // 319
  });

  it("given Mewtwo at L100 max DVs max StatExp, when calculating Special, then returns 407", () => {
    // Arrange — base Spc 154: 154*2+99 = 407
    const species = getSpecies(P.mewtwo);
    const pokemon = makeInstance({ speciesId: P.mewtwo, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert — Gen 1 unified special; spAttack and spDefense are equal
    expect(stats.spAttack).toBe(expectedStat(species.baseStats.spAttack)); // 407
    expect(stats.spDefense).toBe(expectedStat(species.baseStats.spDefense)); // 407
  });

  it("given Chansey at L100 max DVs max StatExp, when calculating HP, then returns 704", () => {
    // Arrange — base HP 250: 250*2+204 = 704
    const species = getSpecies(P.chansey);
    const pokemon = makeInstance({ speciesId: P.chansey, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(expectedHp(species.baseStats.hp)); // 704
  });

  it("given Chansey at L100 max DVs max StatExp, when calculating all stats, then match formula", () => {
    // Arrange
    const species = getSpecies(P.chansey);
    const pokemon = makeInstance({ speciesId: P.chansey, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.attack).toBe(expectedStat(species.baseStats.attack)); // 109
    expect(stats.defense).toBe(expectedStat(species.baseStats.defense)); // 109
    expect(stats.spAttack).toBe(expectedStat(species.baseStats.spAttack)); // 309
    expect(stats.speed).toBe(expectedStat(species.baseStats.speed)); // 199
  });

  it("given Snorlax at L100 max DVs max StatExp, when calculating HP, then returns 524", () => {
    // Arrange — base HP 160: 160*2+204 = 524
    const species = getSpecies(P.snorlax);
    const pokemon = makeInstance({ speciesId: P.snorlax, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(expectedHp(species.baseStats.hp)); // 524
    expect(stats.attack).toBe(expectedStat(species.baseStats.attack)); // 319
    expect(stats.speed).toBe(expectedStat(species.baseStats.speed)); // 159
  });

  it("given Alakazam at L100 max DVs max StatExp, when calculating stats, then special is 369", () => {
    // Arrange — base Spc 135: 135*2+99 = 369
    const species = getSpecies(P.alakazam);
    const pokemon = makeInstance({ speciesId: P.alakazam, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(expectedHp(species.baseStats.hp)); // 314
    expect(stats.spAttack).toBe(expectedStat(species.baseStats.spAttack)); // 369
    expect(stats.speed).toBe(expectedStat(species.baseStats.speed)); // 339
  });

  it("given Tauros at L100 max DVs max StatExp, when calculating stats, then match formula", () => {
    // Arrange — base: HP 75, Atk 100, Def 95, Spe 110, Spc 70
    const species = getSpecies(P.tauros);
    const pokemon = makeInstance({ speciesId: P.tauros, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(expectedHp(species.baseStats.hp)); // 354
    expect(stats.attack).toBe(expectedStat(species.baseStats.attack)); // 299
    expect(stats.defense).toBe(expectedStat(species.baseStats.defense)); // 289
    expect(stats.speed).toBe(expectedStat(species.baseStats.speed)); // 319
    expect(stats.spAttack).toBe(expectedStat(species.baseStats.spAttack)); // 239
  });

  it("given Dragonite at L100 max DVs max StatExp, when calculating Attack, then returns 367", () => {
    // Arrange — base Atk 134: 134*2+99 = 367
    const species = getSpecies(P.dragonite);
    const pokemon = makeInstance({ speciesId: P.dragonite, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.attack).toBe(expectedStat(species.baseStats.attack)); // 367
    expect(stats.hp).toBe(expectedHp(species.baseStats.hp)); // 386
  });

  it("given Gengar at L100 max DVs max StatExp, when calculating stats, then speed and special match formula", () => {
    // Arrange — base Spe 110, Spc 130
    const species = getSpecies(P.gengar);
    const pokemon = makeInstance({ speciesId: P.gengar, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.speed).toBe(expectedStat(species.baseStats.speed)); // 319
    expect(stats.spAttack).toBe(expectedStat(species.baseStats.spAttack)); // 359
  });

  it("given Pikachu at L50 max DVs max StatExp, when calculating HP, then returns 142", () => {
    // Arrange — base HP 35, L50, max DVs (15), max StatExp
    // HP = floor(((35+15)*2+64)*50/100) + 50 + 10
    //     = floor((100+64)*50/100) + 60
    //     = floor(164*50/100) + 60 = floor(82) + 60 = 82 + 60 = 142
    const species = getSpecies(P.pikachu);
    const pokemon = makeInstance({ speciesId: P.pikachu, level: 50, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.hp).toBe(142);
  });

  it("given Pikachu at L50 max DVs max StatExp, when calculating Speed, then returns 142", () => {
    // Arrange — base Spe 90, L50, max DVs (15), max StatExp
    // Spe = floor(((90+15)*2+64)*50/100) + 5
    //     = floor((210+64)*50/100) + 5
    //     = floor(274*50/100) + 5 = floor(137) + 5 = 137 + 5 = 142
    // Wait — let me recalc: (90+15)*2 = 210; 210+64 = 274; 274*50/100 = 137; floor(137)+5 = 142
    // Hmm. Speed = 142? Let me verify with formula.
    const species = getSpecies(P.pikachu);
    const pokemon = makeInstance({ speciesId: P.pikachu, level: 50, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert — Speed: floor(((90+15)*2+64)*50/100)+5 = floor(274*0.5)+5 = 137+5 = 142
    expect(stats.speed).toBe(142);
  });

  it("given Starmie at L100 max DVs max StatExp, when calculating stats, then speed is 329 and special is 299", () => {
    // Arrange — base Spe 115, Spc 100
    const species = getSpecies(P.starmie);
    const pokemon = makeInstance({ speciesId: P.starmie, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert
    expect(stats.speed).toBe(expectedStat(species.baseStats.speed)); // 329
    expect(stats.spAttack).toBe(expectedStat(species.baseStats.spAttack)); // 299
  });

  it("given any Pokemon at L100 with max DVs and max StatExp, when comparing HP to same-base non-HP stat, then HP is always larger by 105", () => {
    // Arrange — HP offset = level + 5 = 105 at L100
    const species = {
      ...getSpecies(P.mewtwo),
      baseStats: {
        hp: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    } as PokemonSpeciesData;
    const pokemon = makeInstance({ speciesId: P.mewtwo, level: 100, ivs: MAX_DVS, evs: MAX_STAT_EXP });
    // Act
    const stats = calculateGen1Stats(pokemon, species);
    // Assert — Source: Gen 1 HP formula adds Level+10 while non-HP stats add +5,
    // so same-base HP exceeds the matched non-HP stat by 105 at level 100.
    expect(stats.hp - stats.attack).toBe(105);
  });
});

// ============================================================================
// 3B: Type Chart Cross-Validation
// ============================================================================

function getEffectiveness(chart: TypeChart, attackType: string, defenderType: string): number {
  return (chart as Record<string, Record<string, number>>)[attackType]?.[defenderType] ?? 1;
}

describe("3B: Type Chart Cross-Validation (Gen 1-specific matchups)", () => {
  const chart = GEN1_TYPE_CHART;

  it("given Gen 1 type chart, when checking Ghost vs Psychic, then is immune (0x) — the famous Gen 1 bug", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.ghost, T.psychic);
    // Assert — Ghost should be SE vs Psychic but is coded as immune due to bug
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Ghost vs Normal, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.ghost, T.normal);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Normal vs Ghost, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.normal, T.ghost);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Poison vs Bug, then is super effective (2x) — changed to 1x in Gen 2", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.poison, T.bug);
    // Assert — Gen 1-specific: Poison is SE against Bug
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Bug vs Poison, then is super effective (2x) — changed to 0.5x in Gen 2", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.bug, T.poison);
    // Assert — Gen 1-specific: Bug is SE against Poison
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Ice vs Fire, then is neutral (1x) — changed to 0.5x in Gen 2", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.ice, T.fire);
    // Assert — Gen 1-specific: Ice is neutral against Fire (not resisted)
    expect(multiplier).toBe(1);
  });

  it("given Gen 1 type chart, when checking Electric vs Ground, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.electric, T.ground);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Ground vs Flying, then is immune (0x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.ground, T.flying);
    // Assert
    expect(multiplier).toBe(0);
  });

  it("given Gen 1 type chart, when checking Psychic vs Fighting, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.psychic, T.fighting);
    // Assert — Psychic dominance of Gen 1 meta
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking Psychic vs Poison, then is super effective (2x)", () => {
    // Arrange / Act
    const multiplier = getEffectiveness(chart, T.psychic, T.poison);
    // Assert
    expect(multiplier).toBe(2);
  });

  it("given Gen 1 type chart, when checking for Steel type entries, then Steel does not appear (Gen 2+ only)", () => {
    // Arrange / Act
    const types = Object.keys(chart);
    // Assert — Steel was introduced in Gen 2
    expect(types).not.toContain(T.steel);
    // Also verify no row contains 'steel' as a defender key
    for (const row of Object.values(chart as Record<string, Record<string, number>>)) {
      expect(Object.keys(row)).not.toContain(T.steel);
    }
  });

  it("given Gen 1 type chart, when checking for Dark type entries, then Dark does not appear (Gen 2+ only)", () => {
    // Arrange / Act
    const types = Object.keys(chart);
    // Assert — Dark was introduced in Gen 2
    expect(types).not.toContain(T.dark);
  });

  it("given Gen 1 type chart, when checking for Fairy type entries, then Fairy does not appear (Gen 6+ only)", () => {
    // Arrange / Act
    const types = Object.keys(chart);
    // Assert — Fairy was introduced in Gen 6
    expect(types).not.toContain(T.fairy);
  });

  it("given Gen 1 type chart, when counting types, then has exactly 15 types", () => {
    // Arrange / Act
    const types = Object.keys(chart);
    // Assert — Source: Gen 1 uses exactly the original 15 types before Steel/Dark/Fairy were introduced.
    expect(types.length).toBe(15);
  });
});

// ============================================================================
// 3C: Damage Formula — Exact Expected Values
// ============================================================================

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

function makeDamageActivePokemon(opts: {
  level: number;
  stats: StatBlock;
  types: PokemonType[];
  status?: PrimaryStatus | null;
  speciesId: number;
}): ActivePokemon {
  const pokemon = createTestPokemon(opts.speciesId, opts.level, {
    currentHp: opts.stats.hp,
    nature: NEUTRAL_NATURE,
    ability: "",
    moves: [],
    status: opts.status ?? null,
    calculatedStats: opts.stats,
  });
  return createActivePokemon(pokemon, 0, [...opts.types]);
}

function neutralTypeChart(): TypeChart {
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of GEN1_TEST_TYPES) {
    chart[atk] = {};
    for (const def of GEN1_TEST_TYPES) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

describe("3C: Damage Formula (exact expected values)", () => {
  // --- STAB Psychic (special) ---

  it("given Mewtwo using Psychic (STAB, neutral, max roll), when calculating damage at L100, then damage is correct", () => {
    // Arrange:
    // Mewtwo: Spc = 154*2+99 = 407 (L100, max DVs, max StatExp)
    // Chansey: Spc = 105*2+99 = 309 (Gen 1 unified Special base 105, used as special defense)
    // Psychic: power 90, special, psychic type — Mewtwo is Psychic type → STAB
    // levelFactor = floor(2*100/5)+2 = 42
    // Overflow: atk(407)≥256 → floor(407/4)%256=101; def(309)≥256 → floor(309/4)%256=77
    // baseDamage (before STAB) = floor(floor(42*90*101)/77)/50 + 2
    //   = floor(floor(381780)/77)/50 + 2
    //   = floor(381780/77) = floor(4958.18) = 4958; floor(4958/50)+2 = 99+2 = 101
    // STAB: floor(101 * 1.5) = 151
    // type effectiveness: 1x (psychic vs normal here, use neutral chart)
    // random 255/255 = 1: floor(151 * 255 / 255) = 151
    const psychicMove = getMove(M.psychic);
    const chart = neutralTypeChart();
    const mewtwoBattleSpecies = getSpecies(P.mewtwo);
    const mewtwoStats = expectedMaxStatBlock(mewtwoBattleSpecies);
    const chanseyStats = expectedMaxStatBlock(getSpecies(P.chansey));
    const mewtwo = makeDamageActivePokemon({
      speciesId: P.mewtwo,
      level: 100,
      stats: mewtwoStats,
      types: [T.psychic],
    });
    const chansey = makeDamageActivePokemon({
      speciesId: P.chansey,
      level: 100,
      stats: chanseyStats,
      types: [T.normal],
    });
    const rng = createMockRng(255);
    const context: DamageContext = {
      attacker: mewtwo,
      defender: chansey,
      move: psychicMove,
      state: {} as DamageContext["state"],
      rng: rng as DamageContext["rng"],
      isCrit: false,
    };
    // Act
    const result = calculateGen1Damage(context, chart, mewtwoBattleSpecies);
    // Assert — damage should be positive and reflect STAB
    expect(result.damage).toBeGreaterThan(0);
    expect(Number.isInteger(result.damage)).toBe(true);
    // Exact expected damage at max roll (255/255): 151 (overflow path — atk 407→101, def 309→77)
    expect(result.damage).toBe(151);
    // With STAB (1.5x) vs without, the ratio should be approx 1.5x
    const rngNoStab = createMockRng(255);
    const mewtwoNoStab = makeDamageActivePokemon({
      speciesId: P.mewtwo,
      level: 100,
      stats: mewtwoStats,
      types: [T.water],
    });
    const ctxNoStab: DamageContext = {
      attacker: mewtwoNoStab,
      defender: chansey,
      move: psychicMove,
      state: {} as DamageContext["state"],
      rng: rngNoStab as DamageContext["rng"],
      isCrit: false,
    };
    const noStabResult = calculateGen1Damage(ctxNoStab, chart, mewtwoBattleSpecies);
    expect(result.damage).toBeGreaterThan(noStabResult.damage);
    const ratio = result.damage / noStabResult.damage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  // --- 4x Super Effective Electric vs Water/Flying ---

  it("given Thunderbolt (Electric) vs Gyarados (Water/Flying = 4x), when calculating, then damage is approx 4x neutral", () => {
    // Arrange: Thunderbolt is electric (special), power 95
    // Use neutral chart for baseline, then 4x effectiveness chart
    const tbolt = getMove(M.thunderbolt);
    const chartNeutral = neutralTypeChart();
    // Build 4x: electric vs water = 2x AND electric vs flying = 2x → combined 4x
    const chart4x = neutralTypeChart();
    (chart4x as Record<string, Record<string, number>>).electric!.water = 2;
    (chart4x as Record<string, Record<string, number>>).electric!.flying = 2;

    const attackerStats: StatBlock = {
      hp: 300,
      attack: 200,
      defense: 150,
      spAttack: 200,
      spDefense: 150,
      speed: 200,
    };
    const defenderStats: StatBlock = {
      hp: 400,
      attack: 100,
      defense: 200,
      spAttack: 100,
      spDefense: 200,
      speed: 81,
    };
    const attackerSpecies = getSpecies(P.raichu);
    const attacker = makeDamageActivePokemon({
      speciesId: P.raichu,
      level: 100,
      stats: attackerStats,
      types: [T.electric],
    });
    const gyaradosNeutral = makeDamageActivePokemon({
      speciesId: P.gyarados,
      level: 100,
      stats: defenderStats,
      types: [T.normal],
    });
    const gyarados = makeDamageActivePokemon({
      speciesId: P.gyarados,
      level: 100,
      stats: defenderStats,
      types: [T.water, T.flying],
    });

    const ctxNeutral: DamageContext = {
      attacker,
      defender: gyaradosNeutral,
      move: tbolt,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const ctx4x: DamageContext = {
      attacker,
      defender: gyarados,
      move: tbolt,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    // Act
    const neutralDamage = calculateGen1Damage(ctxNeutral, chartNeutral, attackerSpecies).damage;
    const superDamage = calculateGen1Damage(ctx4x, chart4x, attackerSpecies).damage;
    // Assert — 4x SE should be roughly 4x the neutral damage
    expect(superDamage).toBeGreaterThan(neutralDamage);
    if (neutralDamage > 0) {
      const ratio = superDamage / neutralDamage;
      expect(ratio).toBeGreaterThanOrEqual(3.5);
      expect(ratio).toBeLessThanOrEqual(4.5);
    }
  });

  // --- STAB Body Slam for Snorlax (Normal type, physical) ---

  it("given Snorlax using Body Slam (STAB, Normal physical, 85 power), when calculating, then STAB applies", () => {
    // Arrange: Body Slam is Normal/Physical, Snorlax is Normal type → STAB
    const bodySlam = getMove(M.bodySlam);
    const chart = neutralTypeChart();
    const snorlaxStats: StatBlock = {
      hp: expectedHp(getSpecies(P.snorlax).baseStats.hp),
      attack: expectedStat(getSpecies(P.snorlax).baseStats.attack),
      defense: expectedStat(getSpecies(P.snorlax).baseStats.defense),
      spAttack: expectedStat(getSpecies(P.snorlax).baseStats.spAttack),
      spDefense: expectedStat(getSpecies(P.snorlax).baseStats.spDefense),
      speed: expectedStat(getSpecies(P.snorlax).baseStats.speed),
    };
    const defenderStats: StatBlock = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    };
    const snorlaxSpecies = getSpecies(P.snorlax);
    const snorlaxStab = makeDamageActivePokemon({
      speciesId: P.snorlax,
      level: 100,
      stats: snorlaxStats,
      types: [T.normal],
    });
    const snorlaxNoStab = makeDamageActivePokemon({
      speciesId: P.snorlax,
      level: 100,
      stats: snorlaxStats,
      types: [T.water],
    });
    const defender = makeDamageActivePokemon({
      speciesId: P.chansey,
      level: 100,
      stats: defenderStats,
      types: [T.normal],
    });

    const ctxStab: DamageContext = {
      attacker: snorlaxStab,
      defender,
      move: bodySlam,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const ctxNoStab: DamageContext = {
      attacker: snorlaxNoStab,
      defender,
      move: bodySlam,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    // Act
    const stabDamage = calculateGen1Damage(ctxStab, chart, snorlaxSpecies).damage;
    const noStabDamage = calculateGen1Damage(ctxNoStab, chart, snorlaxSpecies).damage;
    // Assert
    expect(stabDamage).toBeGreaterThan(noStabDamage);
    const ratio = stabDamage / noStabDamage;
    expect(ratio).toBeGreaterThanOrEqual(1.4);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  // --- Critical hit roughly doubles damage via level doubling ---

  it("given a critical hit at L50, when comparing to non-crit, then damage ratio is approx 1.86x (not exactly 2x)", () => {
    // Arrange: At L50, levelFactor normal = 22, crit = 42; ratio = 42/22 ≈ 1.909
    // After floor operations the actual damage ratio is ~1.86x (e.g. 69/37), not 1.91x
    // Final damage ratio is ~1.86x because level doubles and floors compound, not a flat 2x multiplier
    const move = getMove(M.tackle);
    const chart = neutralTypeChart();
    const attackStats: StatBlock = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    };
    const defStats: StatBlock = {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    };
    const species = getSpecies(P.snorlax);
    const attacker = makeDamageActivePokemon({
      speciesId: P.charizard,
      level: 50,
      stats: attackStats,
      types: [T.fire],
    });
    const defender = makeDamageActivePokemon({
      speciesId: P.chansey,
      level: 50,
      stats: defStats,
      types: [T.normal],
    });

    const ctxCrit: DamageContext = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: true,
    };
    const ctxNoCrit: DamageContext = {
      attacker,
      defender,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    // Act
    const critDamage = calculateGen1Damage(ctxCrit, chart, species).damage;
    const noCritDamage = calculateGen1Damage(ctxNoCrit, chart, species).damage;
    // Assert
    expect(critDamage).toBeGreaterThan(noCritDamage);
    const ratio = critDamage / noCritDamage;
    // Level doubling gives ~1.91x at L50, not flat 2x
    expect(ratio).toBeGreaterThanOrEqual(1.7);
    expect(ratio).toBeLessThanOrEqual(2.1);
    // Source: Gen 1 critical hits double the level term in the damage formula, not a flat 2.0 multiplier.
    expect(ratio).not.toBeCloseTo(2.0, 5);
  });

  // --- Stat overflow: Attack >= 256 → divide-by-4 logic ---

  it("given attack stat 300 (>= 256), when calculating damage, then overflow maps to floor(300/4)%256=75 effectively", () => {
    // Arrange: Gen 1 bug — if attack OR defense >= 256, both are divided by 4 mod 256
    // attack=300: floor(300/4)%256 = 75; defense=100: floor(100/4)%256 = 25
    const move = getMove(M.strength);
    const chart = neutralTypeChart();
    const species = getSpecies(P.snorlax);

    // Attacker with overflow stats (Attack=300)
    const overflowStats: StatBlock = {
      hp: 400,
      attack: 300,
      defense: 100,
      spAttack: 300,
      spDefense: 100,
      speed: 100,
    };
    // Attacker with pre-computed overflowed values (attack=75, defense=25)
    const postOverflowStats: StatBlock = {
      hp: 400,
      attack: 75,
      defense: 100,
      spAttack: 75,
      spDefense: 100,
      speed: 100,
    };
    // Defender stats for overflow scenario (defense=100 → overflowed to 25)
    const defenderNormalStats: StatBlock = {
      hp: 400,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    };
    const defenderOverflowedStats: StatBlock = {
      hp: 400,
      attack: 100,
      defense: 25,
      spAttack: 100,
      spDefense: 25,
      speed: 100,
    };

    const attackerOverflow = makeDamageActivePokemon({
      level: 100,
      stats: overflowStats,
      speciesId: P.charizard,
      types: [T.fire],
    });
    const attackerPost = makeDamageActivePokemon({
      level: 100,
      stats: postOverflowStats,
      speciesId: P.charizard,
      types: [T.fire],
    });
    const defenderOverflow = makeDamageActivePokemon({
      level: 100,
      stats: defenderNormalStats,
      speciesId: P.chansey,
      types: [T.normal],
    });
    const defenderPost = makeDamageActivePokemon({
      level: 100,
      stats: defenderOverflowedStats,
      speciesId: P.chansey,
      types: [T.normal],
    });

    const ctxOverflow: DamageContext = {
      attacker: attackerOverflow,
      defender: defenderOverflow,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    const ctxPost: DamageContext = {
      attacker: attackerPost,
      defender: defenderPost,
      move,
      state: {} as DamageContext["state"],
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };
    // Act
    const overflowDamage = calculateGen1Damage(ctxOverflow, chart, species).damage;
    const postDamage = calculateGen1Damage(ctxPost, chart, species).damage;
    // Assert — equivalence: overflow path must yield same result as post-overflow path
    expect(overflowDamage).toBe(postDamage);
    // Assert — exact intermediate values: independently verify the overflow arithmetic
    // Source: Showdown scripts.ts lines 848-860 — attack >= 256: attack = floor(attack/4) % 256
    // attack=300:  floor(300/4)  = 75,  75%256 = 75  (no modular wrap needed)
    // defense=100: floor(100/4)  = 25,  25%256 = 25  (no modular wrap needed)
    expect(Math.floor(300 / 4) % 256).toBe(75);
    expect(Math.floor(100 / 4) % 256).toBe(25);
    // Assert — exact final damage value: attack=75, defense=25, L100, BP=80, no STAB, neutral, roll=255
    // Source: pret/pokered src/engine/battle/core.asm — damage calculation routine
    //   levelFactor = floor(2*100/5)+2 = 42
    //   inner = floor(42*80*75) / 25 = floor(252000)/25 = 10080
    //   baseDamage = floor(10080/50)+2 = 201+2 = 203 (201 < 997 so cap does not apply)
    //   No STAB, neutral type, roll=255: floor(203*255/255) = 203
    expect(overflowDamage).toBe(203);
    expect(postDamage).toBe(203);
  });
});

// ============================================================================
// 3D: Crit Rate Verification (by base Speed)
// ============================================================================

describe("3D: Crit Rate Verification (base Speed → crit threshold)", () => {
  it("given Mewtwo base Speed 130, when getting crit rate, then threshold is floor(130/2)=65 → 65/256 ≈ 25.4%", () => {
    // Arrange
    const baseSpeed = 130;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, false);
    // Assert — Showdown: critChance=65, normal mult ×2→130, then /2→65; 65/256
    expect(rate).toBeCloseTo(65 / 256, 4);
  });

  it("given Pikachu base Speed 90, when getting crit rate, then threshold is 45 → 45/256 ≈ 17.6%", () => {
    // Arrange
    const baseSpeed = 90;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, false);
    // Assert — critChance = floor(90/2)=45, ×2=90, /2=45; 45/256
    expect(rate).toBeCloseTo(45 / 256, 4);
  });

  it("given Chansey base Speed 50, when getting crit rate, then threshold is 25 → 25/256 ≈ 9.8%", () => {
    // Arrange
    const baseSpeed = 50;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, false);
    // Assert — critChance = floor(50/2)=25, ×2=50, /2=25; 25/256
    expect(rate).toBeCloseTo(25 / 256, 4);
  });

  it("given Snorlax base Speed 30, when getting crit rate, then threshold is 15 → 15/256 ≈ 5.9%", () => {
    // Arrange
    const baseSpeed = 30;
    // Act
    const rate = getGen1CritRate(baseSpeed, false, false);
    // Assert — critChance = floor(30/2)=15, ×2=30, /2=15; 15/256
    expect(rate).toBeCloseTo(15 / 256, 4);
  });

  it("given Slash (high-crit move) with base Speed 80, when getting crit rate, then rate is much higher than normal", () => {
    // Arrange: High-crit moves multiply rate by 8 effectively (×2 for FE skipped, then ×4)
    // critChance = floor(80/2)=40, (no FE) ×2=80, high-crit ×4=320 → clamped to 255; 255/256
    const baseSpeed = 80;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(normalRate);
    expect(highCritRate).toBeGreaterThan(0.5); // Should be very high
  });

  it("given Razor Leaf (high-crit move) with base Speed 45, when getting crit rate, then rate significantly elevated", () => {
    // Arrange
    const baseSpeed = 45;
    // Act
    const normalRate = getGen1CritRate(baseSpeed, false, false);
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(normalRate);
  });

  it("given Karate Chop / Crabhammer (high-crit moves) with Kingler Speed 75, when getting crit rate, then rate is very high", () => {
    // Arrange: Kingler base Speed 75 — high-crit via Crabhammer or Karate Chop
    const baseSpeed = 75;
    // Act
    const highCritRate = getGen1CritRate(baseSpeed, false, true);
    // Assert
    expect(highCritRate).toBeGreaterThan(0.5);
  });

  it("given crit rates for Mewtwo vs Chansey, when comparing, then Mewtwo has a higher rate", () => {
    // Arrange
    const mewtwoCritRate = getGen1CritRate(130, false, false);
    const chanseyCritRate = getGen1CritRate(50, false, false);
    // Act / Assert
    expect(mewtwoCritRate).toBeGreaterThan(chanseyCritRate);
  });

  it("given all four Pokemon, when checking crit rates, then rates are monotonically ordered by base Speed", () => {
    // Arrange: Snorlax (30) < Chansey (50) < Pikachu (90) < Mewtwo (130)
    const snorlaxRate = getGen1CritRate(30, false, false);
    const chanseyRate = getGen1CritRate(50, false, false);
    const pikachuRate = getGen1CritRate(90, false, false);
    const mewtwoRate = getGen1CritRate(130, false, false);
    // Act / Assert
    expect(snorlaxRate).toBeLessThan(chanseyRate);
    expect(chanseyRate).toBeLessThan(pikachuRate);
    expect(pikachuRate).toBeLessThan(mewtwoRate);
  });
});

// ============================================================================
// 3E: Status Damage Amounts
// ============================================================================

describe("3E: Status Damage Amounts", () => {
  const ruleset = new Gen1Ruleset();
  const mockState = {} as ReturnType<
    typeof import("@pokemon-lib-ts/battle")
  >["BattleEngine"] extends never
    ? never
    : Parameters<(typeof ruleset)["applyStatusDamage"]>[2];

  function makeStatusPokemon(
    maxHp: number,
    volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>,
  ): ActivePokemon {
    const active = makeDamageActivePokemon({
      speciesId: P.snorlax,
      level: 100,
      stats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      types: [T.normal],
    });
    return {
      ...active,
      volatileStatuses: volatiles ?? new Map(),
    };
  }

  it("given burn on Mewtwo (HP=416), when applying status damage, then deals floor(416/16)=26", () => {
    // Arrange — Mewtwo HP = 106*2+204 = 416
    const mewtwoHp = expectedHp(getSpecies(P.mewtwo).baseStats.hp); // 416
    const pokemon = makeStatusPokemon(mewtwoHp);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.burn,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert
    expect(damage).toBe(Math.floor(416 / 16)); // 26
  });

  it("given poison on Chansey (HP=704), when applying status damage, then deals floor(704/16)=44", () => {
    // Arrange — Chansey HP = 250*2+204 = 704
    const chanseyHp = expectedHp(getSpecies(P.chansey).baseStats.hp); // 704
    const pokemon = makeStatusPokemon(chanseyHp);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.poison,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert
    expect(damage).toBe(Math.floor(704 / 16)); // 44
  });

  it("given badly-poisoned (Toxic) Snorlax (HP=524) on turn 1, when applying status damage, then deals floor(524/16)=32", () => {
    // Arrange — Snorlax HP = 160*2+204 = 524
    const snorlaxHp = expectedHp(getSpecies(P.snorlax).baseStats.hp); // 524
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(V.toxicCounter, { turnsLeft: 0, data: { counter: 1 } });
    const pokemon = makeStatusPokemon(snorlaxHp, volatiles);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.badlyPoisoned,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert — turn 1: floor(524 * 1 / 16) = floor(32.75) = 32
    expect(damage).toBe(Math.floor((524 * 1) / 16)); // 32
  });

  it("given badly-poisoned Snorlax (HP=524) on turn 2, when applying status damage, then deals floor(524*2/16)=65", () => {
    // Arrange
    const snorlaxHp = expectedHp(getSpecies(P.snorlax).baseStats.hp); // 524
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(V.toxicCounter, { turnsLeft: 0, data: { counter: 2 } });
    const pokemon = makeStatusPokemon(snorlaxHp, volatiles);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.badlyPoisoned,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert — turn 2: floor(524 * 2 / 16) = floor(65.5) = 65
    expect(damage).toBe(Math.floor((524 * 2) / 16)); // 65
  });

  it("given badly-poisoned Snorlax (HP=524) on turn 3, when applying status damage, then deals floor(524*3/16)=98", () => {
    // Arrange
    const snorlaxHp = expectedHp(getSpecies(P.snorlax).baseStats.hp); // 524
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(V.toxicCounter, { turnsLeft: 0, data: { counter: 3 } });
    const pokemon = makeStatusPokemon(snorlaxHp, volatiles);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.badlyPoisoned,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert — turn 3: floor(524 * 3 / 16) = floor(98.25) = 98
    expect(damage).toBe(Math.floor((524 * 3) / 16)); // 98
  });

  it("given paralysis on a Pokemon, when applying status damage, then returns 0 (paralysis deals no HP damage)", () => {
    // Arrange
    const pokemon = makeStatusPokemon(300);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.paralysis,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert
    expect(damage).toBe(0);
  });

  it("given sleep on a Pokemon, when applying status damage, then returns 0 (sleep deals no HP damage)", () => {
    // Arrange
    const pokemon = makeStatusPokemon(300);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.sleep,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert
    expect(damage).toBe(0);
  });

  it("given freeze on a Pokemon, when applying status damage, then returns 0 (freeze deals no HP damage)", () => {
    // Arrange
    const pokemon = makeStatusPokemon(300);
    // Act
    const damage = ruleset.applyStatusDamage(
      pokemon,
      S.freeze,
      mockState as Parameters<typeof ruleset.applyStatusDamage>[2],
    );
    // Assert
    expect(damage).toBe(0);
  });

  it("given toxic escalation over 3 turns on same Pokemon, when applying status damage sequentially, then damage increases each turn", () => {
    // Arrange — verify escalation by mutating the counter as the implementation does
    const snorlaxHp = expectedHp(getSpecies(P.snorlax).baseStats.hp); // 524
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(V.toxicCounter, { turnsLeft: 0, data: { counter: 1 } });
    const pokemon = makeStatusPokemon(snorlaxHp, volatiles);
    const state = mockState as Parameters<typeof ruleset.applyStatusDamage>[2];
    // Act — call 3 times; the ruleset mutates the counter in the volatile data
    const turn1 = ruleset.applyStatusDamage(pokemon, S.badlyPoisoned, state);
    const turn2 = ruleset.applyStatusDamage(pokemon, S.badlyPoisoned, state);
    const turn3 = ruleset.applyStatusDamage(pokemon, S.badlyPoisoned, state);
    // Assert
    expect(turn2).toBeGreaterThan(turn1);
    expect(turn3).toBeGreaterThan(turn2);
    expect(turn1).toBe(32); // floor(524*1/16)
    expect(turn2).toBe(65); // floor(524*2/16)
    expect(turn3).toBe(98); // floor(524*3/16)
  });
});
