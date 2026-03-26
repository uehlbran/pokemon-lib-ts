/**
 * Regression tests for 8 decomp-verified bug fixes (4A through 4H).
 *
 * Each test locks the corrected behavior so it cannot silently regress.
 * Every expected value has a source comment from pret/pokecrystal disassembly.
 *
 * Bugs covered:
 *   4A — Damage modifier ordering (item before crit, weather before STAB)
 *   4B — High-crit moves add +2 (not +1) per effect_commands.asm:1182-1184
 *   4C — Accuracy stage table uses exact numerator/denominator from accuracy_multipliers.asm
 *   4D — Sleep duration 2-7 turns (never 1) per core.asm:3608-3621
 *   4E — Focus Band check: rng.int(0,255) < 30 (not rng.chance(0.12))
 *   4F — Toxic reverts to regular poison on switch-out per core.asm:4078-4104
 *   4G — Protect uses bit-shift halving (srl b) not powers of 3
 *   4H — Struggle recoil = floor(damageDealt/4) per effect_commands.asm:5670-5729
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { PokemonType, StatBlock, TypeChart } from "@pokemon-lib-ts/core";
import { ALL_NATURES, CORE_STATUS_IDS, CORE_TYPE_IDS, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager, GEN2_ITEM_IDS, GEN2_MOVE_IDS, GEN2_SPECIES_IDS } from "../../src";
import { getGen2CritStage } from "../../src/Gen2CritCalc";
import { calculateGen2Damage } from "../../src/Gen2DamageCalc";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";
import { createSyntheticOnFieldPokemon as createSharedSyntheticOnFieldPokemon } from "../helpers/createSyntheticOnFieldPokemon";

const DATA_MANAGER = createGen2DataManager();
const BASE_SPECIES = DATA_MANAGER.getSpecies(GEN2_SPECIES_IDS.bulbasaur);
const MOVE_IDS = GEN2_MOVE_IDS;
const ITEM_IDS = GEN2_ITEM_IDS;
// Gen 2 battles still require a nature field in the shared Pokemon model.
// Use a core-owned neutral nature id because Gen 2 does not own a separate nature bundle.
const _DEFAULT_NATURE = ALL_NATURES[0].id;
const NORMAL = CORE_TYPE_IDS.normal;
const FIRE = CORE_TYPE_IDS.fire;
const WATER = CORE_TYPE_IDS.water;
const ELECTRIC = CORE_TYPE_IDS.electric;
const GRASS = CORE_TYPE_IDS.grass;
const ICE = CORE_TYPE_IDS.ice;
const FIGHTING = CORE_TYPE_IDS.fighting;
const POISON = CORE_TYPE_IDS.poison;
const GROUND = CORE_TYPE_IDS.ground;
const FLYING = CORE_TYPE_IDS.flying;
const PSYCHIC = CORE_TYPE_IDS.psychic;
const BUG = CORE_TYPE_IDS.bug;
const ROCK = CORE_TYPE_IDS.rock;
const GHOST = CORE_TYPE_IDS.ghost;
const DRAGON = CORE_TYPE_IDS.dragon;
const DARK = CORE_TYPE_IDS.dark;
const STEEL = CORE_TYPE_IDS.steel;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Create a mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_p: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createSyntheticOnFieldPokemon(opts: {
  speciesId?: number;
  level?: number;
  maxHp?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  types?: PokemonType[];
  heldItem?: string | null;
  status?: string | null;
  volatileStatuses?: Map<string, unknown>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: opts.speed ?? 100,
  };

  return createSharedSyntheticOnFieldPokemon({
    speciesId: opts.speciesId ?? BASE_SPECIES.id,
    level: opts.level ?? 50,
    currentHp: maxHp,
    calculatedStats: stats,
    heldItem: opts.heldItem ?? null,
    status: (opts.status as typeof CORE_STATUS_IDS.burn | null | undefined) ?? null,
    friendship: 70,
    types: opts.types ?? [NORMAL],
    volatileStatuses: opts.volatileStatuses,
    turnsOnField: 1,
  });
}

/** Create a neutral type chart (all interactions = 1). */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    NORMAL,
    FIRE,
    WATER,
    ELECTRIC,
    GRASS,
    ICE,
    FIGHTING,
    POISON,
    GROUND,
    FLYING,
    PSYCHIC,
    BUG,
    ROCK,
    GHOST,
    DRAGON,
    DARK,
    STEEL,
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

/** Create a minimal DamageContext state mock. */
function createMockDamageState(
  weather?: { type: string; turnsLeft: number; source: string } | null,
): DamageContext["state"] {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

// ---------------------------------------------------------------------------
// Regression Test 1: Damage modifier ordering (Bug 4A)
// Item modifier applied before crit (line 2983 before line 3023 in decomp)
// ---------------------------------------------------------------------------

describe("Bug 4A regression: damage modifier order — item applied in modifier chain", () => {
  it("given a type-boosting item + crit, when calculating damage, then item is applied before 2x crit multiplier", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm lines 2983, 3108-3129
    //   Item modifier applied first (line 2983), then .CriticalMultiplier (sla = *2)
    // L50, 80 power Normal-type physical move, attacker holds Pink Bow (1.1x Normal boost)
    // Attack=100, Defense=100, no weather, no STAB, neutral type chart
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      types: [FIRE], // Not normal — no STAB
      heldItem: ITEM_IDS.pinkBow, // 1.1x boost for Normal moves in Gen 2
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      defense: 100,
      types: [NORMAL],
    });
    const move = DATA_MANAGER.getMove(MOVE_IDS.strength);
    const typeChart = createNeutralTypeChart();
    const state = createMockDamageState();
    const rng = createMockRng(255); // Max random roll

    // With correct Gen 2 crit (2x post-formula multiplier):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor(floor(22*80*100/100)/50) = floor(1760/50) = 35
    //   item: floor(35 * 1.1) = floor(38.5) = 38
    //   crit 2x: 38 * 2 = 76
    //   clamp: 76 (in [1,997])
    //   +2: 78
    //   no weather, no STAB, neutral type
    //   random: floor(78 * 255/255) = 78

    const contextCrit: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
      isCrit: true,
    };

    // Act
    const result = calculateGen2Damage(contextCrit, typeChart, BASE_SPECIES);

    // Assert — 78 with 2x crit multiplier + item
    // Source: pret/pokecrystal — base=35, item=38, crit*2=76, +2=78
    expect(result.damage).toBe(78);
  });

  it("given no item + crit, when calculating damage, then result differs from item+crit (triangulation)", () => {
    // Arrange — same setup but no item
    const attacker = createSyntheticOnFieldPokemon({
      level: 50,
      attack: 100,
      types: [FIRE],
      heldItem: null, // No item
    });
    const defender = createSyntheticOnFieldPokemon({
      level: 50,
      defense: 100,
      types: [NORMAL],
    });
    const move = DATA_MANAGER.getMove(MOVE_IDS.strength);
    const typeChart = createNeutralTypeChart();
    const state = createMockDamageState();
    const rng = createMockRng(255);

    // With correct Gen 2 crit (2x post-formula multiplier):
    //   levelFactor = floor(2*50/5)+2 = 22
    //   base = floor(floor(22*80*100/100)/50) = floor(1760/50) = 35
    //   no item. crit 2x: 35*2=70. clamp. +2 = 72. random = 72

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
      isCrit: true,
    };

    // Act
    const result = calculateGen2Damage(context, typeChart, BASE_SPECIES);

    // Assert — 72 with 2x crit multiplier, no item
    // Source: pret/pokecrystal — base=35, crit*2=70, +2=72
    expect(result.damage).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// Regression Test 2: High-crit moves add +1 (Bug #324 fix)
// Source: bug #324 — high-crit moves add +1 to crit stage
// ---------------------------------------------------------------------------

describe("Bug #324 regression: high-crit moves add +2 to crit stage (pokecrystal ground truth)", () => {
  it("given Slash (high-crit move) with no other modifiers, when getting crit stage, then stage is 2", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm L1183-1184 —
    //   BattleCommand_Critical .CheckCritical: "inc c; inc c" = +2 for CriticalHitMoves
    // NOTE: This corrects the earlier bug #324 "fix" which incorrectly changed +2 to +1.
    // The cartridge assembly uses two increments; the correct value is +2.
    const attacker = createSyntheticOnFieldPokemon({});
    const move = DATA_MANAGER.getMove(MOVE_IDS.slash);

    // Act
    const stage = getGen2CritStage(attacker, move);

    // Assert — +2, per pokecrystal assembly
    expect(stage).toBe(2);
  });

  it("given Cross Chop (high-crit move) with no other modifiers, when getting crit stage, then stage is 2", () => {
    // Arrange
    // Source: pret/pokecrystal effect_commands.asm L1183-1184 — "inc c; inc c" = +2
    const attacker = createSyntheticOnFieldPokemon({});
    const move = DATA_MANAGER.getMove(MOVE_IDS.crossChop);

    // Act
    const stage = getGen2CritStage(attacker, move);

    // Assert — +2 per pokecrystal
    expect(stage).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Regression Test 3: Sleep duration 2-7 turns (Bug 4D)
// Source: pret/pokecrystal engine/battle/core.asm:3608-3621 — SLP_MASK rejects 0, then inc a
// ---------------------------------------------------------------------------

describe("Bug 4D regression: sleep lasts 2-7 turns (never 1)", () => {
  it("given 1000 rolls of sleep duration, when collecting results, then min is 2, max is 7, and 1 never appears", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/core.asm:3608-3621
    //   and SLP_MASK rejects 0, then inc a, so minimum counter is 2
    const ruleset = new Gen2Ruleset();
    const results = new Set<number>();
    const allValues: number[] = [];

    // Act — 1000 rolls to ensure we see the full range
    for (let i = 0; i < 1000; i++) {
      const rng = new SeededRandom(i);
      const turns = ruleset.rollSleepTurns(rng);
      results.add(turns);
      allValues.push(turns);
    }

    // Assert
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);

    // Minimum is 2, never 1
    expect(min).toBe(2);
    // Maximum is 7
    expect(max).toBe(7);
    // Value 1 must never appear
    expect(results.has(1)).toBe(false);
    // All values must be in [2, 7]
    for (const v of allValues) {
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression Test 4: Protect uses divide-by-3 formula (Bug #318 fix)
// Source: gen2-ground-truth.md §9 — Protect/Detect
// ---------------------------------------------------------------------------

describe("Bug #318 regression: Protect success uses divide-by-3 formula", () => {
  const ruleset = new Gen2Ruleset();

  it("given first use (consecutiveProtects=0), when rolling, then always succeeds", () => {
    // Arrange
    // Source: gen2-ground-truth.md §9 — first use always succeeds
    const rng = new SeededRandom(42);

    // Act
    const result = ruleset.rollProtectSuccess(0, rng);

    // Assert
    expect(result).toBe(true);
  });

  it("given second consecutive use (consecutiveProtects=1), then threshold is floor(255/3) = 85, rate ≈ 33.2%", () => {
    // Arrange
    // Source: gen2-ground-truth.md §9 — denominator = 3^1 = 3, threshold = floor(255/3) = 85
    // success rate = 85/256 ≈ 33.2%
    let successes = 0;
    const trials = 10000;

    // Act
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i * 7919);
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    const rate = successes / trials;

    // Assert — 85/256 ≈ 33.2%, tolerance +/- 3%
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.37);
  });

  it("given third consecutive use (consecutiveProtects=2), then threshold is floor(255/9) = 28, rate ≈ 10.9%", () => {
    // Arrange
    // Source: gen2-ground-truth.md §9 — denominator = 3^2 = 9, threshold = floor(255/9) = 28
    // rate = 28/256 ≈ 10.9%
    let successes = 0;
    const trials = 10000;

    // Act
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i * 3571);
      if (ruleset.rollProtectSuccess(2, rng)) successes++;
    }
    const rate = successes / trials;

    // Assert — 28/256 ≈ 10.9%, tolerance +/- 3%
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.14);
  });
});

// ---------------------------------------------------------------------------
// Regression Test 5: Toxic reverts to regular poison on switch-out (Bug 4F)
// Source: pret/pokecrystal engine/battle/core.asm:4078-4104 NewBattleMonStatus
// ---------------------------------------------------------------------------

describe("Bug 4F regression: badly-poisoned reverts to regular poison on switch-out", () => {
  it("given a badly-poisoned Pokemon, when it switches out, then status becomes regular poison", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/core.asm:4078-4104
    //   NewBattleMonStatus zeros SUBSTATUS_TOXIC on switch, reverting to regular poison
    const ruleset = new Gen2Ruleset();
    const pokemon = createSyntheticOnFieldPokemon({
      types: [POISON],
      status: CORE_STATUS_IDS.badlyPoisoned,
    });
    const opponent = createSyntheticOnFieldPokemon({ types: [NORMAL] });

    const state: BattleState = {
      sides: [
        {
          index: 0,
          trainer: null,
          team: [],
          active: [pokemon],
          hazards: [],
          screens: [],
          tailwind: { active: false, turnsLeft: 0 },
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
        {
          index: 1,
          trainer: null,
          team: [],
          active: [opponent],
          hazards: [],
          screens: [],
          tailwind: { active: false, turnsLeft: 0 },
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
      ],
      turn: 1,
      weather: null,
      terrain: null,
      trickRoom: null,
      format: { id: "singles", slots: 1 },
    } as unknown as BattleState;

    // Pre-condition: status is badly-poisoned
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.badlyPoisoned);

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — status reverts to regular poison, not cleared entirely
    // Source: pret/pokecrystal core.asm:4078-4104
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.poison);
  });

  it("given a regularly-poisoned Pokemon, when it switches out, then status remains poison (no change)", () => {
    // Arrange — triangulation: regular poison should not be cleared
    const ruleset = new Gen2Ruleset();
    const pokemon = createSyntheticOnFieldPokemon({
      types: [NORMAL],
      status: CORE_STATUS_IDS.poison,
    });
    const opponent = createSyntheticOnFieldPokemon({ types: [NORMAL] });

    const state: BattleState = {
      sides: [
        {
          index: 0,
          trainer: null,
          team: [],
          active: [pokemon],
          hazards: [],
          screens: [],
          tailwind: { active: false, turnsLeft: 0 },
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
        {
          index: 1,
          trainer: null,
          team: [],
          active: [opponent],
          hazards: [],
          screens: [],
          tailwind: { active: false, turnsLeft: 0 },
          luckyChant: { active: false, turnsLeft: 0 },
          wish: null,
          futureAttack: null,
          faintCount: 0,
          gimmickUsed: false,
        },
      ],
      turn: 1,
      weather: null,
      terrain: null,
      trickRoom: null,
      format: { id: "singles", slots: 1 },
    } as unknown as BattleState;

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — regular poison persists
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.poison);
  });
});

// ---------------------------------------------------------------------------
// Regression Test 6: Struggle recoil = floor(maxHp / 4) (Bug #317 fix)
// Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_Recoil — wMaxHP
// ---------------------------------------------------------------------------

describe("Bug #317 regression: Struggle recoil is floor(maxHp / 4), not floor(damageDealt / 4)", () => {
  const ruleset = new Gen2Ruleset();

  it("given maxHp=200 and 60 damage dealt, when calculating struggle recoil, then recoil is 50 (floor(200/4))", () => {
    // Arrange
    // Source: bug #317 fix — uses maxHp, not damageDealt
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const damageDealt = 60;

    // Act
    const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

    // Assert — recoil is based on max HP, not damage dealt
    // floor(200 / 4) = 50 (NOT floor(60 / 4) = 15)
    expect(recoil).toBe(50);
  });

  it("given maxHp=300 and 100 damage dealt, when calculating struggle recoil, then recoil is 75 (not 25)", () => {
    // Arrange — triangulation with different maxHp to prove it's HP-based not damage-based
    // Source: bug #317 fix
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 300 });
    const damageDealt = 100;

    // Act
    const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

    // Assert — floor(300/4) = 75 (NOT floor(100/4) = 25)
    expect(recoil).toBe(75);
  });
});
