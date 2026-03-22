import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";

/**
 * Regression tests for Metronome item — no consecutive-use cap in Gen 4.
 *
 * Source: Showdown data/mods/gen4/items.ts line 326-328:
 *   onModifyDamagePhase2(damage, source, target, move) {
 *     return damage * (1 + (this.effectState.numConsecutive / 10));
 *   }
 *
 * There is NO Math.min or cap on numConsecutive. The boost accumulates
 * indefinitely in Gen 4, unlike Gen 5+ which caps at 5 (2.0x via chainModify
 * lookup table).
 *
 * Bug #559: Our code had Math.min(boostSteps, 5), giving a spurious 1.5x cap.
 */

// ---------------------------------------------------------------------------
// Test helpers (mirrors damage-calc.test.ts helpers)
// ---------------------------------------------------------------------------

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

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "paralysis" | "sleep" | "freeze" | null;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: null,
    level,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
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

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types ?? ["normal"],
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

function createMove(opts: {
  type: PokemonType;
  power: number;
  category?: "physical" | "special" | "status";
  id?: string;
}): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type: opts.type,
    category: opts.category ?? "physical",
    power: opts.power,
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
    generation: 4,
  } as MoveData;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

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
// Tests: Metronome item — no cap on consecutive uses (Gen 4)
// ---------------------------------------------------------------------------

describe("Gen 4 Metronome item — no consecutive-use cap (bug #559)", () => {
  // Source: Showdown data/mods/gen4/items.ts lines 326-328:
  //   onModifyDamagePhase2: return damage * (1 + numConsecutive / 10)
  //   NO Math.min, NO cap — boost grows indefinitely.
  //
  // Baseline damage (no Metronome boost):
  //   L50, Atk=100, Def=100, power=80, fighting attacker + normal move (no STAB), rng=100
  //   levelFactor = floor(2*50/5)+2 = 22
  //   baseDmg = floor(floor(22*80*100/100)/50) + 2 = floor(1760/50) + 2 = 35 + 2 = 37
  //   No STAB, no weather, no crit, rng=100 -> final = 37

  it("given Metronome item with count=7 (6th consecutive boost), when calculating damage, then boost is 1.6x (no cap at 1.5x)", () => {
    // Source: Showdown data/mods/gen4/items.ts — no cap on numConsecutive
    // count=7 means 6 boost steps (count-1): multiplier = 1 + 6*0.1 = 1.6x
    // Derivation: floor(37 * 1.6) = floor(59.2) = 59
    // With the old buggy cap of 5, this would give floor(37 * 1.5) = 55
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"], // no STAB on normal move
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 7, moveId: "test-move" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // 1.6x boost (NOT capped at 1.5x): floor(37 * 1.6) = 59
    expect(result.damage).toBe(59);
  });

  it("given Metronome item with count=11 (10th consecutive boost), when calculating damage, then boost is 2.0x (no cap)", () => {
    // Source: Showdown data/mods/gen4/items.ts — no cap on numConsecutive
    // count=11 means 10 boost steps: multiplier = 1 + 10*0.1 = 2.0x
    // Derivation: floor(37 * 2.0) = 74
    // With the old buggy cap of 5, this would give floor(37 * 1.5) = 55
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 11, moveId: "test-move" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // 2.0x boost: floor(37 * 2.0) = 74
    expect(result.damage).toBe(74);
  });

  it("given Metronome item with count=21 (20th consecutive boost), when calculating damage, then boost is 3.0x (no cap, extreme case)", () => {
    // Source: Showdown data/mods/gen4/items.ts — no cap on numConsecutive
    // count=21 means 20 boost steps: multiplier = 1 + 20*0.1 = 3.0x
    // Derivation: floor(37 * 3.0) = 111
    // This extreme case verifies there is truly no ceiling on the multiplier.
    const attacker = createActivePokemon({
      level: 50,
      attack: 100,
      types: ["fighting"],
      heldItem: "metronome",
    });
    attacker.volatileStatuses.set("metronome-count", {
      turnsLeft: -1,
      data: { count: 21, moveId: "test-move" },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: ["normal"],
    });
    const move = createMove({ type: "normal", power: 80, category: "physical" });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move, rng: createMockRng(100) }),
      chart,
    );

    // 3.0x boost: floor(37 * 3.0) = 111
    expect(result.damage).toBe(111);
  });
});
