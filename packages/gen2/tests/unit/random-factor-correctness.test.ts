import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Damage } from "../../src/Gen2DamageCalc";
import {
  createGen2DataManager,
  GEN2_MOVE_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
} from "../../src";

/**
 * Regression tests for the Gen 2 random factor multiplication.
 *
 * Source: pret/pokecrystal engine/battle/core.asm — the cartridge computes
 *   finalDamage = floor((baseDamage * randomRoll) / 255)
 * using integer-only arithmetic. A float intermediate:
 *   finalDamage = floor(baseDamage * (randomRoll / 255))
 * can diverge at specific baseDamage values due to IEEE 754 precision loss.
 *
 * Tracks: GitHub issue #542
 */

const dataManager = createGen2DataManager();
const TEST_SPECIES = dataManager.getSpecies(GEN2_SPECIES_IDS.magmar);
const SYNTHETIC_MOVE_BASE = dataManager.getMove(GEN2_MOVE_IDS.tackle);

// ---------------------------------------------------------------------------
// Test helpers (mirrored from damage-calc.test.ts)
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
  status?: typeof CORE_STATUS_IDS.burn | null;
  heldItem?: string | null;
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
    speciesId: TEST_SPECIES.id,
    nickname: null,
    level: opts.level,
    experience: 0,
    nature: GEN2_NATURE_IDS.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: CORE_ABILITY_IDS.none,
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
    pokeball: CORE_ITEM_IDS.pokeBall,
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
    ability: CORE_ABILITY_IDS.none,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createSyntheticMove(type: PokemonType, power: number): MoveData {
  const move = { ...SYNTHETIC_MOVE_BASE } as MoveData;
  move.id = `synthetic-${type}-${power}`;
  move.displayName = `Synthetic ${type} ${power}`;
  move.type = type;
  move.category = "physical";
  move.power = power;
  move.generation = 2;
  return move;
}

/** All-neutral type chart for 17 Gen 2 types. */
function createNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [
    CORE_TYPE_IDS.normal,
    CORE_TYPE_IDS.fire,
    CORE_TYPE_IDS.water,
    CORE_TYPE_IDS.electric,
    CORE_TYPE_IDS.grass,
    CORE_TYPE_IDS.ice,
    CORE_TYPE_IDS.fighting,
    CORE_TYPE_IDS.poison,
    CORE_TYPE_IDS.ground,
    CORE_TYPE_IDS.flying,
    CORE_TYPE_IDS.psychic,
    CORE_TYPE_IDS.bug,
    CORE_TYPE_IDS.rock,
    CORE_TYPE_IDS.ghost,
    CORE_TYPE_IDS.dragon,
    CORE_TYPE_IDS.dark,
    CORE_TYPE_IDS.steel,
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

/** Create a BattleState mock. */
function createMockState() {
  return {
    weather: null,
  } as DamageContext["state"];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 random factor — integer-only arithmetic (issue #542)", () => {
  /**
   * This test targets a boundary where the float path and integer path diverge.
   *
   * Setup: L=100, P=150, Attack=245, Defense=52. Attacker is fire-type using
   * a normal-type move (no STAB). No weather, neutral type chart.
   *   levelFactor = floor(2*100/5 + 2) = 42
   *   inner = floor(42 * 150 * 245) = 1543500
   *   afterDef = floor(1543500 / 52) = 29682
   *   afterDiv50 = floor(29682 / 50) = 593
   *   clamp [1, 997] = 593
   *   baseDamage = 593 + 2 = 595 (no STAB, no weather, neutral types)
   *
   * With randomRoll = 219:
   *   Float path:   Math.floor(595 * (219/255)) = 510  (IEEE 754 rounds down)
   *   Integer path: Math.floor((595 * 219) / 255) = 511 (exact integer division)
   *
   * Source: pret/pokecrystal engine/battle/core.asm — integer multiply then divide by 255
   */
  it("given baseDamage=595 and roll=219 (P=150 A=245 D=52), when calculating damage, then uses integer arithmetic yielding 511 not 510", () => {
    const attacker = createActivePokemon({
      level: 100,
      attack: 245,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fire],
    });
    const defender = createActivePokemon({
      level: 100,
      attack: 100,
      defense: 52,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
    });
    const move = createSyntheticMove(CORE_TYPE_IDS.normal, 150);
    const chart = createNeutralTypeChart();
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(219) as DamageContext["rng"],
      isCrit: false,
    };

    const result = calculateGen2Damage(context, chart, TEST_SPECIES);

    // Source: pret/pokecrystal engine/battle/core.asm — floor((595 * 219) / 255) = 511
    expect(result.damage).toBe(511);
  });

  /**
   * Second divergence case with different params to triangulate (same baseDamage=595
   * reached through different power/attack/defense combination).
   *
   * Setup: L=100, P=200, Attack=219, Defense=62. Fire-type attacker, normal move.
   *   levelFactor = 42
   *   inner = floor(42 * 200 * 219) = 1839600
   *   afterDef = floor(1839600 / 62) = 29670
   *   afterDiv50 = floor(29670 / 50) = 593
   *   baseDamage = 593 + 2 = 595
   *
   * With randomRoll = 219:
   *   Float:   Math.floor(595 * (219/255)) = 510
   *   Integer: Math.floor((595 * 219) / 255) = 511
   *
   * Source: pret/pokecrystal engine/battle/core.asm — integer multiply then divide by 255
   */
  it("given baseDamage=595 and roll=219 (P=200 A=219 D=62), when calculating damage, then uses integer arithmetic yielding 511 not 510", () => {
    const attacker = createActivePokemon({
      level: 100,
      attack: 219,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fire],
    });
    const defender = createActivePokemon({
      level: 100,
      attack: 100,
      defense: 62,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
    });
    const move = createSyntheticMove(CORE_TYPE_IDS.normal, 200);
    const chart = createNeutralTypeChart();
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(219) as DamageContext["rng"],
      isCrit: false,
    };

    const result = calculateGen2Damage(context, chart, TEST_SPECIES);

    // Source: pret/pokecrystal — floor((595 * 219) / 255) = 511
    expect(result.damage).toBe(511);
  });

  /**
   * Control test: at normal values (baseDamage=37, roll=255), both paths agree.
   * This proves the fix doesn't break the common case.
   *
   * Setup: L=50, P=80, Attack=100, Defense=100. Fire-type attacker, normal move (no STAB).
   *   levelFactor = floor(2*50/5 + 2) = 22
   *   inner = floor(22 * 80 * 100) = 176000
   *   afterDef = floor(176000 / 100) = 1760
   *   afterDiv50 = floor(1760 / 50) = 35
   *   baseDamage = 35 + 2 = 37
   *
   * With randomRoll = 255: floor((37 * 255) / 255) = 37
   *
   * Source: pret/pokecrystal engine/battle/core.asm — integer formula at max roll
   */
  it("given baseDamage=37 and max roll 255, when calculating damage, then returns 37", () => {
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.fire],
    });
    const defender = createActivePokemon({
      level: 50,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      types: [CORE_TYPE_IDS.water],
    });
    const move = createSyntheticMove(CORE_TYPE_IDS.normal, 80);
    const chart = createNeutralTypeChart();
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: createMockState(),
      rng: createMockRng(255) as DamageContext["rng"],
      isCrit: false,
    };

    const result = calculateGen2Damage(context, chart, TEST_SPECIES);

    // Source: pret/pokecrystal — floor((37 * 255) / 255) = 37
    expect(result.damage).toBe(37);
  });
});
