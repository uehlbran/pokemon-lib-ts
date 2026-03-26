import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_TYPE_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../../src/data";
import { GEN3_ABILITY_IDS, GEN3_SPECIES_IDS } from "../../src/data/reference-ids";
import { applyGen3Ability } from "../../src/Gen3Abilities";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";

/**
 * Gen 3 Pressure ability tests.
 *
 * Pressure: when the target has Pressure, moves cost 2 PP instead of 1.
 * Announces "is exerting its Pressure!" on switch-in.
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_PRESSURE
 * Source: Bulbapedia — "Pressure causes moves targeting the Ability-bearer to use 2 PP"
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();

function createMockRng() {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => 100,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  ability: string;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  const species = dataManager.getSpecies(opts.speciesId ?? GEN3_SPECIES_IDS.articuno);
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  const pokemon = {
    uid: "test",
    speciesId: species.id,
    nickname: opts.nickname === undefined ? species.displayName : opts.nickname,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: CORE_GENDERS.genderless,
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
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createPressurePokemon(opts: { nickname?: string | null } = {}): ActivePokemon {
  const species = dataManager.getSpecies(GEN3_SPECIES_IDS.articuno);

  return createActivePokemon({
    types: species.types as PokemonType[],
    ability: GEN3_ABILITY_IDS.pressure,
    speciesId: species.id,
    nickname: opts.nickname === undefined ? species.displayName : opts.nickname,
  });
}

// ---------------------------------------------------------------------------
// Tests: getPPCost
// ---------------------------------------------------------------------------

describe("Gen 3 Pressure — getPPCost", () => {
  const ruleset = new Gen3Ruleset();

  it("given defender has Pressure, when getPPCost is called, then returns 2", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_PRESSURE: deductsExtraMove
    // Source: Bulbapedia — "Pressure causes moves targeting the Ability-bearer to use 2 PP"
    const actor = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.hugePower,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.ice, CORE_TYPE_IDS.flying],
      ability: GEN3_ABILITY_IDS.pressure,
    });
    const state = { weather: null } as BattleState;
    expect(ruleset.getPPCost(actor, defender, state)).toBe(2);
  });

  it("given defender does not have Pressure, when getPPCost is called, then returns 1", () => {
    // Source: pret/pokeemerald — default PP cost is 1 without Pressure
    // Triangulation: non-Pressure defender
    const actor = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.hugePower,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.intimidate,
    });
    const state = { weather: null } as BattleState;
    expect(ruleset.getPPCost(actor, defender, state)).toBe(1);
  });

  it("given no defender (null), when getPPCost is called, then returns 1", () => {
    // Source: pret/pokeemerald — no target means no Pressure check
    const actor = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: GEN3_ABILITY_IDS.hugePower,
    });
    const state = { weather: null } as BattleState;
    expect(ruleset.getPPCost(actor, null, state)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: on-switch-in announcement
// ---------------------------------------------------------------------------

describe("Gen 3 Pressure — on-switch-in announcement", () => {
  it("given Pressure Pokemon switches in, when on-switch-in fires, then emits 'is exerting its Pressure!' message", () => {
    // Source: pret/pokeemerald — ABILITY_PRESSURE announces on entry
    // Source: Bulbapedia — "Pressure is announced on entry"
    const pokemon = createPressurePokemon();
    const articuno = dataManager.getSpecies(GEN3_SPECIES_IDS.articuno);
    const ctx = {
      pokemon,
      state: { weather: null } as AbilityContext["state"],
      rng: createMockRng(),
      trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
    } as AbilityContext;

    const result = applyGen3Ability(CORE_ABILITY_TRIGGER_IDS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(0);
    expect(result.messages[0]).toBe(`${articuno.displayName} is exerting its Pressure!`);
  });

  it("given Pressure Pokemon with no nickname switches in, when on-switch-in fires, then message uses speciesId", () => {
    // Source: pret/pokeemerald — nickname fallback to species ID
    const pokemon = createPressurePokemon({ nickname: null });
    const articuno = dataManager.getSpecies(GEN3_SPECIES_IDS.articuno);
    const ctx = {
      pokemon,
      state: { weather: null } as AbilityContext["state"],
      rng: createMockRng(),
      trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
    } as AbilityContext;

    const result = applyGen3Ability(CORE_ABILITY_TRIGGER_IDS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toBe(`${String(articuno.id)} is exerting its Pressure!`);
  });
});
