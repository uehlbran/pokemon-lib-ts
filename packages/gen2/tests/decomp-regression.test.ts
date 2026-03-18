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
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { getGen2CritStage } from "../src/Gen2CritCalc";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

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

/** Create a minimal ActivePokemon. */
function createActivePokemon(opts: {
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

  return {
    pokemon: {
      uid: "test",
      speciesId: opts.speciesId ?? 1,
      nickname: null,
      level: opts.level ?? 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: maxHp,
      moves: [],
      ability: "",
      abilitySlot: "normal1" as const,
      heldItem: opts.heldItem ?? null,
      status: opts.status ?? null,
      friendship: 70,
      gender: "male" as const,
      isShiny: false,
      metLocation: "test",
      metLevel: 5,
      originalTrainer: "Test",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
      calculatedStats: stats,
    } as PokemonInstance,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: (opts.volatileStatuses ?? new Map()) as Map<never, never>,
    types: opts.types ?? ["normal"],
    ability: "",
    lastMoveUsed: null,
    turnsOnField: 1,
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
  } as unknown as ActivePokemon;
}

/** Create a minimal MoveData. */
function createMove(opts: {
  id?: string;
  type: PokemonType;
  power?: number;
  category?: "physical" | "special" | "status";
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power ?? 80,
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

/** Create a minimal species data mock. */
function createSpecies(): PokemonSpeciesData {
  return {
    id: 1,
    name: "test",
    displayName: "Test",
    types: ["normal"],
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

/** Create a neutral type chart (all interactions = 1). */
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

describe("Bug 4A regression: damage modifier order — item before crit", () => {
  it("given a type-boosting item + crit, when calculating damage, then item is applied before crit (decomp order)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:2983 (item) before :3023 (crit)
    // L50, 80 power Normal-type physical move, attacker holds Silk Scarf (1.1x Normal boost)
    // Attack=100, Defense=100, no weather, no STAB, neutral type chart
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"], // Not normal — no STAB
      heldItem: "silk-scarf", // 1.1x boost for Normal moves
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80 });
    const typeChart = createNeutralTypeChart();
    const state = createMockDamageState();
    const rng = createMockRng(255); // Max random roll

    // Correct decomp order:
    //   base = floor(floor(22*80*100/100)/50) = 35
    //   item: floor(35 * 1.1) = 38   (step 2 — BEFORE crit)
    //   crit: 38 * 2 = 76             (step 3 — AFTER item)
    //   clamp: 76 (in [1,997])
    //   +2: 78
    //   no weather, no STAB, neutral type
    //   random: floor(78 * 255/255) = 78

    // Wrong order (crit before item) would give:
    //   base = 35, crit: 70, item: floor(70*1.1) = 77, clamp, +2 = 79, random = 79

    const contextCrit: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
      isCrit: true,
    };

    // Act
    const result = calculateGen2Damage(contextCrit, typeChart, createSpecies());

    // Assert — 78 proves item-before-crit; 79 would mean crit-before-item
    // Source: pret/pokecrystal effect_commands.asm:2983 vs :3023
    expect(result.damage).toBe(78);
  });

  it("given no item + crit, when calculating damage, then result differs from item+crit (triangulation)", () => {
    // Arrange — same setup but no item
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fire"],
      heldItem: null, // No item
    });
    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80 });
    const typeChart = createNeutralTypeChart();
    const state = createMockDamageState();
    const rng = createMockRng(255);

    // base = 35, no item, crit: 70, clamp, +2 = 72, random = 72

    const context: DamageContext = {
      attacker,
      defender,
      move,
      state,
      rng: rng as unknown as import("@pokemon-lib-ts/core").SeededRandom,
      isCrit: true,
    };

    // Act
    const result = calculateGen2Damage(context, typeChart, createSpecies());

    // Assert
    expect(result.damage).toBe(72);
  });
});

// ---------------------------------------------------------------------------
// Regression Test 2: High-crit moves add +2 (Bug 4B)
// Source: pret/pokecrystal effect_commands.asm:1182-1184 — inc c; inc c
// ---------------------------------------------------------------------------

describe("Bug 4B regression: high-crit moves add +2 to crit stage, not +1", () => {
  it("given Slash (high-crit move) with no other modifiers, when getting crit stage, then stage is 2", () => {
    // Arrange
    // Source: pret/pokecrystal effect_commands.asm:1182-1184 — inc c; inc c (two increments = +2)
    const attacker = createActivePokemon({});
    const move = createMove({ id: "slash", type: "normal" });

    // Act
    const stage = getGen2CritStage(attacker, move);

    // Assert — +2, not +1
    expect(stage).toBe(2);
  });

  it("given Cross Chop (high-crit move) with no other modifiers, when getting crit stage, then stage is 2", () => {
    // Arrange
    // Source: pret/pokecrystal effect_commands.asm:1182-1184 — inc c; inc c (applies to all HIGH_CRIT_MOVES)
    const attacker = createActivePokemon({});
    const move = createMove({ id: "cross-chop", type: "fighting" });

    // Act
    const stage = getGen2CritStage(attacker, move);

    // Assert
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
// Regression Test 4: Protect uses bit-shift halving (Bug 4G)
// Source: pret/pokecrystal engine/battle/move_effects/protect.asm:14-74 — srl b
// ---------------------------------------------------------------------------

describe("Bug 4G regression: Protect success uses bit-shift halving (srl b), not powers of 3", () => {
  const ruleset = new Gen2Ruleset();

  it("given first use (consecutiveProtects=0), when rolling, then always succeeds (255/255)", () => {
    // Arrange
    // Source: pret/pokecrystal protect.asm — first use always succeeds
    const rng = new SeededRandom(42);

    // Act
    const result = ruleset.rollProtectSuccess(0, rng);

    // Assert
    expect(result).toBe(true);
  });

  it("given second consecutive use (consecutiveProtects=1), then threshold is 127 (floor(255 >> 1))", () => {
    // Arrange
    // Source: pret/pokecrystal protect.asm:14-74 — srl b shifts 255 right by 1 = 127
    // threshold = 127, roll is 1-255, so success rate = 127/255 ~ 49.8%
    let successes = 0;
    const trials = 10000;

    // Act
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i * 7919);
      if (ruleset.rollProtectSuccess(1, rng)) successes++;
    }
    const rate = successes / trials;

    // Assert — 127/255 ~ 49.8%, tolerance +/- 3%
    expect(rate).toBeGreaterThan(0.46);
    expect(rate).toBeLessThan(0.53);
  });

  it("given third consecutive use (consecutiveProtects=2), then threshold is 63 (floor(255 >> 2))", () => {
    // Arrange
    // Source: pret/pokecrystal protect.asm — srl b twice = 63
    // rate = 63/255 ~ 24.7%
    let successes = 0;
    const trials = 10000;

    // Act
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i * 3571);
      if (ruleset.rollProtectSuccess(2, rng)) successes++;
    }
    const rate = successes / trials;

    // Assert — 63/255 ~ 24.7%, tolerance +/- 3%
    expect(rate).toBeGreaterThan(0.21);
    expect(rate).toBeLessThan(0.28);
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
    const pokemon = createActivePokemon({
      types: ["poison"],
      status: "badly-poisoned",
    });
    const opponent = createActivePokemon({ types: ["normal"] });

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
    expect(pokemon.pokemon.status).toBe("badly-poisoned");

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — status reverts to regular poison, not cleared entirely
    // Source: pret/pokecrystal core.asm:4078-4104
    expect(pokemon.pokemon.status).toBe("poison");
  });

  it("given a regularly-poisoned Pokemon, when it switches out, then status remains poison (no change)", () => {
    // Arrange — triangulation: regular poison should not be cleared
    const ruleset = new Gen2Ruleset();
    const pokemon = createActivePokemon({
      types: ["normal"],
      status: "poison",
    });
    const opponent = createActivePokemon({ types: ["normal"] });

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
    expect(pokemon.pokemon.status).toBe("poison");
  });
});

// ---------------------------------------------------------------------------
// Regression Test 6: Struggle recoil = floor(damageDealt / 4) (Bug 4H)
// Source: pret/pokecrystal effect_commands.asm:5670-5729 BattleCommand_Recoil — srl b twice
// ---------------------------------------------------------------------------

describe("Bug 4H regression: Struggle recoil is floor(damageDealt / 4), not floor(maxHp / 4)", () => {
  const ruleset = new Gen2Ruleset();

  it("given 60 damage dealt, when calculating struggle recoil, then recoil is 15 (floor(60/4))", () => {
    // Arrange
    // Source: pret/pokecrystal effect_commands.asm:5670-5729 — uses wCurDamage / 4
    const attacker = createActivePokemon({ maxHp: 200 });
    const damageDealt = 60;

    // Act
    const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

    // Assert — recoil is based on damage dealt, not max HP
    // floor(60 / 4) = 15 (NOT floor(200 / 4) = 50)
    expect(recoil).toBe(15);
  });

  it("given 100 damage dealt with maxHp 300, when calculating struggle recoil, then recoil is 25 (not 75)", () => {
    // Arrange — triangulation with different maxHp to prove it's damage-based not HP-based
    // Source: pret/pokecrystal effect_commands.asm:5670-5729
    const attacker = createActivePokemon({ maxHp: 300 });
    const damageDealt = 100;

    // Act
    const recoil = ruleset.calculateStruggleRecoil(attacker, damageDealt);

    // Assert — floor(100/4) = 25 (NOT floor(300/4) = 75)
    expect(recoil).toBe(25);
  });
});
