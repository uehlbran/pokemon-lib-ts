import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_HAZARD_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  type EntryHazardType,
  type PrimaryStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen6DataManager, GEN6_ABILITY_IDS, GEN6_TYPES, Gen6Ruleset } from "../../src";

const DATA_MANAGER = createGen6DataManager();
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(1);
const GEN6_HAZARDS = [
  CORE_HAZARD_IDS.stealthRock,
  CORE_HAZARD_IDS.spikes,
  CORE_HAZARD_IDS.toxicSpikes,
  CORE_HAZARD_IDS.stickyWeb,
] as const satisfies readonly EntryHazardType[];
const BURN_STATUS = CORE_STATUS_IDS.burn;
const POISON_STATUS = CORE_STATUS_IDS.poison;
const WEATHER_DAMAGE = CORE_END_OF_TURN_EFFECT_IDS.weatherDamage;
const HEATPROOF_ABILITY = GEN6_ABILITY_IDS.heatproof;
const MAGIC_GUARD_ABILITY = GEN6_ABILITY_IDS.magicGuard;

function createStatusPokemon(options: {
  readonly hp: number;
  readonly currentHp: number;
  readonly status: PrimaryStatus;
  readonly ability: string | null;
  readonly types?: readonly string[];
}): ActivePokemon {
  return {
    pokemon: {
      calculatedStats: { hp: options.hp },
      currentHp: options.currentHp,
      nickname: null,
      speciesId: DEFAULT_SPECIES.id,
      status: options.status,
    },
    ability: options.ability,
    types: [...(options.types ?? [CORE_TYPE_IDS.normal])],
  } as unknown as ActivePokemon;
}

function createBattleState(): BattleState {
  return {
    activeSideIndex: 0,
    battleType: "singles",
    currentTurn: 1,
    field: null,
    gimmickState: null,
    lastMoveUsed: null,
    sides: [
      {
        active: [],
        bench: [],
        hazards: [],
        index: 0,
        name: "side-0",
      },
      {
        active: [],
        bench: [],
        hazards: [],
        index: 1,
        name: "side-1",
      },
    ],
    terrain: null,
    turnPhase: "start",
    weather: null,
  } as unknown as BattleState;
}

describe("Gen6Ruleset smoke tests", () => {
  it("given Gen6Ruleset, when checking generation property, then returns 6", () => {
    // Source: Gen6Ruleset.generation is set to 6 in the class definition
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    expect(ruleset.generation).toBe(6);
  });

  it("given Gen6Ruleset, when checking name, then includes Gen 6", () => {
    // Source: Gen6Ruleset.name is set to "Gen 6 (X/Y/Omega Ruby/Alpha Sapphire)"
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    expect(ruleset.name).toContain("Gen 6");
  });

  it("given Gen6Ruleset, when getting type chart, then returns non-empty type chart", () => {
    // Source: Gen 6 has 18 types (adds Fairy)
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const chart = ruleset.getTypeChart();
    expect(Object.keys(chart).length).toBe(GEN6_TYPES.length);
    expect(GEN6_TYPES).toContain(CORE_TYPE_IDS.fairy);
  });

  it("given Gen6Ruleset, when getting available types, then returns array of 18 types", () => {
    // Source: Gen 6 type chart includes 18 types (adds Fairy)
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const types = ruleset.getAvailableTypes();
    expect(types).toEqual(GEN6_TYPES);
  });

  it("given Gen6Ruleset, when checking recalculatesFutureAttackDamage, then returns true", () => {
    // Source: Bulbapedia -- Gen 5+ recalculates Future Sight/Doom Desire at hit time
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });

  it("given Gen6Ruleset, when getting crit multiplier, then returns 1.5", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier is 1.5x
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    expect(ruleset.getCritMultiplier()).toBe(1.5);
  });

  it("given Gen6Ruleset, when getting crit rate table, then returns Gen 6+ table", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit rate table
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const table = ruleset.getCritRateTable();
    expect(table).toEqual([24, 8, 2, 1]);
  });

  it("given Gen6Ruleset, when getting end-of-turn order, then includes weather-damage first", () => {
    // Source: Showdown data/conditions.ts -- weather damage is first residual
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const order = ruleset.getEndOfTurnOrder();
    expect(order[0]).toBe(WEATHER_DAMAGE);
    expect(order.length).toBeGreaterThan(10);
  });

  it("given Gen6Ruleset, when getting post-attack residual order, then returns empty array", () => {
    // Source: Gen 6 (like Gen 3+) has no per-attack residuals
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    expect(ruleset.getPostAttackResidualOrder()).toEqual([]);
  });

  it("given Gen6Ruleset, when getting available hazards, then includes sticky-web", () => {
    // Source: Bulbapedia -- Sticky Web introduced in Gen 6
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toEqual(GEN6_HAZARDS);
  });
});

// ---------------------------------------------------------------------------
// Gen6Ruleset status damage
// ---------------------------------------------------------------------------

describe("Gen6Ruleset status damage", () => {
  it("given Gen6Ruleset, when calling applyStatusDamage with burn, then returns 1/8 max HP", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const pokemon = createStatusPokemon({
      hp: 160,
      currentHp: 160,
      status: BURN_STATUS,
      ability: null,
    });
    const damage = ruleset.applyStatusDamage(pokemon, BURN_STATUS, createBattleState());
    expect(damage).toBe(20);
  });

  it("given Gen6Ruleset with different HP, when calling applyStatusDamage with burn, then returns correct 1/8 value", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen < 7 burn damage is 1/8 max HP
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const pokemon = createStatusPokemon({
      hp: 200,
      currentHp: 200,
      status: BURN_STATUS,
      ability: null,
    });
    const damage = ruleset.applyStatusDamage(pokemon, BURN_STATUS, createBattleState());
    expect(damage).toBe(25);
  });

  it("given Gen6Ruleset with Heatproof, when calling applyStatusDamage with burn, then returns 1/16 max HP", () => {
    // Source: Bulbapedia -- Heatproof halves burn damage (1/8 -> 1/16)
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const pokemon = createStatusPokemon({
      hp: 160,
      currentHp: 160,
      status: BURN_STATUS,
      ability: HEATPROOF_ABILITY,
    });
    const damage = ruleset.applyStatusDamage(pokemon, BURN_STATUS, createBattleState());
    expect(damage).toBe(10);
  });

  it("given Gen6Ruleset with Magic Guard, when calling applyStatusDamage with burn, then returns 0", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const pokemon = createStatusPokemon({
      hp: 160,
      currentHp: 160,
      status: BURN_STATUS,
      ability: MAGIC_GUARD_ABILITY,
    });
    const damage = ruleset.applyStatusDamage(pokemon, BURN_STATUS, createBattleState());
    expect(damage).toBe(0);
  });

  it("given Gen6Ruleset, when calling applyStatusDamage with poison, then delegates to BaseRuleset (1/8 max HP)", () => {
    // Source: BaseRuleset poison damage is 1/8 max HP (consistent across gens)
    const ruleset = new Gen6Ruleset(DATA_MANAGER);
    const pokemon = createStatusPokemon({
      hp: 160,
      currentHp: 160,
      status: POISON_STATUS,
      ability: null,
    });
    const damage = ruleset.applyStatusDamage(pokemon, POISON_STATUS, createBattleState());
    expect(damage).toBe(20);
  });
});
