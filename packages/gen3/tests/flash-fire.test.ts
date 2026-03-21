import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen3Damage } from "../src/Gen3DamageCalc";
import { GEN3_TYPE_CHART } from "../src/Gen3TypeChart";

/**
 * Gen 3 Flash Fire Damage Boost Tests
 *
 * Tests for:
 *   - Flash Fire volatile: 1.5x boost to fire moves when attacker has "flash-fire" volatile
 *   - No boost for non-fire moves
 *   - Flash Fire immunity is still handled (separate from boost)
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_FLASH_FIRE
 * Source: Showdown data/abilities.ts — Flash Fire condition: onModifyAtk/onModifySpA 1.5x
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0.5,
    int: (_min: number, _max: number) => intReturnValue,
    chance: (_percent: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  types: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  hasFlashFire?: boolean;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: 1,
    nickname: null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability ?? "",
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

  const volatileStatuses = new Map<string, unknown>();
  if (opts.hasFlashFire) {
    volatileStatuses.set("flash-fire", true);
  }

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses,
    types: opts.types,
    ability: opts.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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

function createMove(type: PokemonType, power: number, id = "test-move"): MoveData {
  return {
    id,
    displayName: id,
    type,
    category: "special",
    power,
    accuracy: 100,
    pp: 10,
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
    generation: 3,
  } as MoveData;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

function createDamageContext(opts: {
  attacker: ActivePokemon;
  defender: ActivePokemon;
  move: MoveData;
  isCrit?: boolean;
  rng?: ReturnType<typeof createMockRng>;
  weather?: { type: string; turnsLeft: number; source: string } | null;
}): DamageContext {
  return {
    attacker: opts.attacker,
    defender: opts.defender,
    move: opts.move,
    isCrit: opts.isCrit ?? false,
    rng: opts.rng ?? createMockRng(100),
    state: createMockState(opts.weather),
  } as DamageContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const chart = GEN3_TYPE_CHART;

describe("Gen 3 Flash Fire damage boost", () => {
  it("given attacker with flash-fire volatile, when using a fire move, then damage is boosted by 1.5x", () => {
    // Source: pret/pokeemerald ABILITY_FLASH_FIRE
    // Source: Showdown data/abilities.ts — Flash Fire condition: onModifyAtk/onModifySpA 1.5x for fire
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["fire"],
      ability: "flash-fire",
      hasFlashFire: true,
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const flamethrower = createMove("fire", 90, "flamethrower");

    const boostCtx = createDamageContext({
      attacker,
      defender,
      move: flamethrower,
      rng: createMockRng(100),
    });
    const boostResult = calculateGen3Damage(boostCtx, chart);

    // Without flash fire:
    // levelFactor = 22, base = floor(floor(22*90*100/100)/50) = floor(1980/50) = 39
    // +2 = 41, random*1.0 = 41, STAB(fire attacker, fire move) = floor(41*1.5) = 61
    //
    // With flash fire 1.5x applied to attack stat:
    // spAttack modified: floor(100*1.5) = 150
    // base = floor(floor(22*90*150/100)/50) = floor(floor(297000/100)/50) = floor(2970/50) = 59
    // +2 = 61, random*1.0 = 61, STAB = floor(61*1.5) = 91
    // Source: manual derivation from pret/pokeemerald formula
    expect(boostResult.damage).toBe(91);
  });

  it("given attacker with flash-fire volatile, when using a non-fire move, then no boost applied", () => {
    // Source: pret/pokeemerald — Flash Fire only boosts fire-type moves
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["fire"],
      ability: "flash-fire",
      hasFlashFire: true,
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const thunderbolt = createMove("electric", 90, "thunderbolt");

    const ctx = createDamageContext({
      attacker,
      defender,
      move: thunderbolt,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // Normal damage: spAttack=100, power=90, electric is special
    // base = floor(floor(22*90*100/100)/50) = 39, +2 = 41
    // No STAB (fire attacker, electric move), neutral type
    // Source: manual derivation
    expect(result.damage).toBe(41);
  });

  it("given attacker with flash-fire ability but NO volatile, when using fire move, then no boost", () => {
    // Source: pret/pokeemerald — The boost requires the flash-fire volatile to be set
    // (which happens when absorbing a fire move). Just having the ability is not enough.
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["fire"],
      ability: "flash-fire",
      hasFlashFire: false, // volatile not set
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
    });
    const flamethrower = createMove("fire", 90, "flamethrower");

    const ctx = createDamageContext({
      attacker,
      defender,
      move: flamethrower,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // Without flash fire boost: spAttack=100
    // base = floor(floor(22*90*100/100)/50) = 39
    // +2 = 41, random*1.0 = 41, STAB = floor(41*1.5) = 61
    expect(result.damage).toBe(61);
  });

  it("given attacker with flash-fire volatile, when fire move targets flash-fire defender, then defender is immune (damage 0)", () => {
    // Source: pret/pokeemerald — Flash Fire on defender side grants immunity
    // The immunity check runs before the boost check
    const attacker = createActivePokemon({
      level: 50,
      spAttack: 100,
      types: ["fire"],
      ability: "flash-fire",
      hasFlashFire: true,
    });
    const defender = createActivePokemon({
      level: 50,
      spDefense: 100,
      types: ["normal"],
      ability: "flash-fire",
    });
    const flamethrower = createMove("fire", 90, "flamethrower");

    const ctx = createDamageContext({
      attacker,
      defender,
      move: flamethrower,
      rng: createMockRng(100),
    });
    const result = calculateGen3Damage(ctx, chart);

    // Defender Flash Fire = immune to fire
    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });
});
