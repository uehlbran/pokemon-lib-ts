import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, StatBlock, TypeChart } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateGen4Damage,
  createGen4DataManager,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
  GEN4_TYPES,
} from "../src";
import { createSyntheticOnFieldPokemon } from "./helpers/createSyntheticOnFieldPokemon";

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

const dataManager = createGen4DataManager();
const STRENGTH_MOVE = dataManager.getMove(GEN4_MOVE_IDS.strength);
const METRONOME_ITEM = GEN4_ITEM_IDS.metronome;
const DEFAULT_SPECIES_ID = GEN4_SPECIES_IDS.bulbasaur;
const DEFAULT_NATURE = GEN4_NATURE_IDS.hardy;
const DEFAULT_POKEBALL = GEN4_ITEM_IDS.pokeBall;
const METRONOME_COUNT_VOLATILE = "metronome-count";

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
  ability?: PokemonInstance["ability"];
  heldItem?: PokemonInstance["heldItem"];
  status?: PokemonInstance["status"];
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
}): ActivePokemon {
  const maxHp = opts.hp ?? 200;
  const calculatedStats: StatBlock = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };
  return createSyntheticOnFieldPokemon({
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    calculatedStats,
    currentHp: opts.currentHp ?? maxHp,
    gender: CORE_GENDERS.male,
    heldItem: opts.heldItem ?? null,
    level: opts.level ?? 50,
    nature: DEFAULT_NATURE,
    pokeball: DEFAULT_POKEBALL,
    speciesId: opts.speciesId ?? DEFAULT_SPECIES_ID,
    statStages: opts.statStages,
    status: opts.status ?? null,
    types: opts.types ?? [CORE_TYPE_IDS.normal],
  });
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

function createNeutralTypeChart(): TypeChart {
  const chart = {} as Record<string, Record<string, number>>;
  // Synthetic neutral chart on purpose: these tests isolate Metronome's damage multiplier
  // from type-matchup effects, which no canonical Gen 4 chart can represent globally.
  for (const atk of GEN4_TYPES) {
    chart[atk] = {};
    for (const def of GEN4_TYPES) {
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
      types: [CORE_TYPE_IDS.fighting], // no STAB on normal move
      heldItem: METRONOME_ITEM,
    });
    attacker.volatileStatuses.set(METRONOME_COUNT_VOLATILE, {
      turnsLeft: -1,
      data: { count: 7, moveId: STRENGTH_MOVE.id },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: STRENGTH_MOVE, rng: createMockRng(100) }),
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
      types: [CORE_TYPE_IDS.fighting],
      heldItem: METRONOME_ITEM,
    });
    attacker.volatileStatuses.set(METRONOME_COUNT_VOLATILE, {
      turnsLeft: -1,
      data: { count: 11, moveId: STRENGTH_MOVE.id },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: STRENGTH_MOVE, rng: createMockRng(100) }),
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
      types: [CORE_TYPE_IDS.fighting],
      heldItem: METRONOME_ITEM,
    });
    attacker.volatileStatuses.set(METRONOME_COUNT_VOLATILE, {
      turnsLeft: -1,
      data: { count: 21, moveId: STRENGTH_MOVE.id },
    });

    const defender = createActivePokemon({
      level: 50,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const chart = createNeutralTypeChart();

    const result = calculateGen4Damage(
      createDamageContext({ attacker, defender, move: STRENGTH_MOVE, rng: createMockRng(100) }),
      chart,
    );

    // 3.0x boost: floor(37 * 3.0) = 111
    expect(result.damage).toBe(111);
  });
});
