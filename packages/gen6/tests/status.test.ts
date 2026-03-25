import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_STATUS_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
  Gen6Ruleset,
} from "../src";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN6_ABILITY_IDS } as const
const STATUSES = CORE_STATUS_IDS
const dataManager = createGen6DataManager()
const defaultSpecies = dataManager.getSpecies(GEN6_SPECIES_IDS.bulbasaur)
const defaultLevel = 50
const ruleset = new Gen6Ruleset(dataManager)
const emptyBattleState = {} as unknown as BattleState

function createStatusTestPokemon(
  overrides: {
    maxHp?: number;
    currentHp?: number;
    status?: PrimaryStatus | null;
    ability?: string | null;
  } = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const pokemon = createPokemonInstance(defaultSpecies, defaultLevel, new SeededRandom(6), {
    nature: GEN6_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: "normal1",
    heldItem: null,
    gender: "male",
    isShiny: false,
    metLocation: "test",
    originalTrainer: "test",
    originalTrainerId: 0,
  })

  pokemon.currentHp = overrides.currentHp ?? maxHp
  pokemon.status = overrides.status ?? null
  pokemon.ability = overrides.ability ?? ABILITIES.none
  pokemon.calculatedStats = {
    ...pokemon.calculatedStats,
    hp: maxHp,
  }

  return {
    pokemon,
    ability: overrides.ability ?? ABILITIES.none,
  } as unknown as ActivePokemon;
}

// ---------------------------------------------------------------------------
// Gen6Ruleset — applyStatusDamage
// ---------------------------------------------------------------------------

describe("Gen6Ruleset — burn damage", () => {
  it("given a Pokemon with 160 max HP, when applying burn damage, then returns 20 (1/8 of 160)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    // 160 / 8 = 20
    const pokemon = createStatusTestPokemon({ maxHp: 160, status: STATUSES.burn });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.burn, emptyBattleState)).toBe(20);
  });

  it("given a Pokemon with 200 max HP, when applying burn damage, then returns 25 (1/8 of 200)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    // 200 / 8 = 25
    const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.burn });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.burn, emptyBattleState)).toBe(25);
  });

  it("given a Pokemon with 7 max HP, when applying burn damage, then returns at least 1", () => {
    // Source: Showdown -- minimum 1 damage from status
    // floor(7 / 8) = 0, clamped to 1
    const pokemon = createStatusTestPokemon({ maxHp: 7, status: STATUSES.burn });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.burn, emptyBattleState)).toBe(1);
  });
});

describe("Gen6Ruleset — burn damage with Heatproof", () => {
  it("given a Pokemon with Heatproof and 160 max HP, when applying burn damage, then returns 10 (1/16 of 160)", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage (1/8 -> 1/16)
    // 160 / 16 = 10
    const pokemon = createStatusTestPokemon({
      maxHp: 160,
      status: STATUSES.burn,
      ability: ABILITIES.heatproof,
    });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.burn, emptyBattleState)).toBe(10);
  });

  it("given a Pokemon with Heatproof and 200 max HP, when applying burn damage, then returns 12 (floor(200/16))", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage
    // floor(200 / 16) = 12
    const pokemon = createStatusTestPokemon({
      maxHp: 200,
      status: STATUSES.burn,
      ability: ABILITIES.heatproof,
    });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.burn, emptyBattleState)).toBe(12);
  });
});

describe("Gen6Ruleset — burn damage with Magic Guard", () => {
  it("given a Pokemon with Magic Guard, when applying burn damage, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const pokemon = createStatusTestPokemon({
      maxHp: 160,
      status: STATUSES.burn,
      ability: ABILITIES.magicGuard,
    });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.burn, emptyBattleState)).toBe(0);
  });

  it("given a Pokemon with Magic Guard, when applying poison damage, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including poison
    const pokemon = createStatusTestPokemon({
      maxHp: 160,
      status: STATUSES.poison,
      ability: ABILITIES.magicGuard,
    });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.poison, emptyBattleState)).toBe(0);
  });
});

describe("Gen6Ruleset — poison damage (delegates to BaseRuleset)", () => {
  it("given a Pokemon with 160 max HP, when applying poison damage, then returns 20 (1/8 of 160)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP (consistent across gens)
    // 160 / 8 = 20
    const pokemon = createStatusTestPokemon({ maxHp: 160, status: STATUSES.poison });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.poison, emptyBattleState)).toBe(20);
  });

  it("given a Pokemon with 200 max HP, when applying poison damage, then returns 25 (1/8 of 200)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP
    // 200 / 8 = 25
    const pokemon = createStatusTestPokemon({ maxHp: 200, status: STATUSES.poison });
    expect(ruleset.applyStatusDamage(pokemon, STATUSES.poison, emptyBattleState)).toBe(25);
  });
});
