/**
 * Gen 7 status damage tests — Wave 1 verification.
 *
 * Gen 7 changed burn damage from 1/8 max HP (Gen 3-6) to 1/16 max HP.
 * This is the BaseRuleset default, so Gen7 inherits it without overriding.
 * Poison remains 1/8, badly poisoned escalates from 1/16 per counter.
 *
 * Source: Showdown sim/battle-actions.ts -- Gen 7 burn damage is 1/16
 * Source: Bulbapedia -- https://bulbapedia.bulbagarden.net/wiki/Burn_(status_condition)
 */
import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_SPECIES_IDS,
  Gen7Ruleset,
} from "../src";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GEN7_DATA_MANAGER = createGen7DataManager();
const TACKLE = GEN7_DATA_MANAGER.getMove(GEN7_MOVE_IDS.tackle);
const VOLATILES = CORE_VOLATILE_IDS;

function createOnFieldPokemon(
  overrides: {
    hp?: number;
    currentHp?: number;
    status?: string | null;
    ability?: string | null;
    volatiles?: [string, unknown][];
  } = {},
): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp,
        speed: 100,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
      },
      currentHp: overrides.currentHp ?? hp,
      status: overrides.status ?? null,
      heldItem: null,
      level: 50,
      nickname: null,
      speciesId: GEN7_SPECIES_IDS.pikachu,
      moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
      pokeball: GEN7_ITEM_IDS.pokeBall,
    },
    ability: overrides.ability ?? null,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    types: [CORE_TYPE_IDS.electric],
    volatileStatuses: new Map(
      (overrides.volatiles ?? []).map(([k, v]) => [k, v] as [string, unknown]),
    ),
    substituteHp: 0,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    suppressedAbility: null,
    teamSlot: 0,
  } as unknown as ActivePokemon;
}

/** Instantiate a Gen7Ruleset with the owned Gen 7 data manager. */
function createTestRuleset(): Gen7Ruleset {
  return new Gen7Ruleset(GEN7_DATA_MANAGER);
}

const ruleset = createTestRuleset();

// ===========================================================================
// Burn damage — 1/16 max HP in Gen 7 (changed from 1/8 in Gen 3-6)
// ===========================================================================

describe("Gen7Ruleset — applyStatusDamage (burn)", () => {
  it("given burned Pokemon with 160 max HP, when applying status damage, then takes 10 HP (160/16)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 7+ burn damage is 1/16 max HP
    // Source: Bulbapedia -- Burn: "From Generation VII onwards, a burned Pokemon loses 1/16 of
    //   its maximum HP at the end of each turn"
    // 160 / 16 = 10
    const pokemon = createOnFieldPokemon({ hp: 160, status: CORE_STATUS_IDS.burn });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.burn as never,
      {} as BattleState,
    );
    expect(result).toBe(10);
  });

  it("given burned Pokemon with 200 max HP, when applying status damage, then takes 12 HP (floor(200/16)=12)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 7+ burn damage is floor(maxHp/16)
    // 200 / 16 = 12.5, floor = 12
    const pokemon = createOnFieldPokemon({ hp: 200, status: CORE_STATUS_IDS.burn });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.burn as never,
      {} as BattleState,
    );
    expect(result).toBe(12);
  });

  it("given burned Pokemon with 15 max HP, when applying status damage, then takes minimum 1 HP", () => {
    // Source: Showdown -- damage is max(1, floor(maxHp/16))
    // 15 / 16 = 0.9375, floor = 0, max(1, 0) = 1
    const pokemon = createOnFieldPokemon({ hp: 15, status: CORE_STATUS_IDS.burn });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.burn as never,
      {} as BattleState,
    );
    expect(result).toBe(1);
  });
});

// ===========================================================================
// Poison damage — 1/8 max HP (same as Gen 3+)
// ===========================================================================

describe("Gen7Ruleset — applyStatusDamage (poison)", () => {
  it("given poisoned Pokemon with 200 max HP, when applying status damage, then takes 25 HP (200/8)", () => {
    // Source: Showdown -- Poison damage is 1/8 max HP in all gens
    // 200 / 8 = 25
    const pokemon = createOnFieldPokemon({ hp: 200, status: CORE_STATUS_IDS.poison });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.poison as never,
      {} as BattleState,
    );
    expect(result).toBe(25);
  });

  it("given poisoned Pokemon with 160 max HP, when applying status damage, then takes 20 HP (160/8)", () => {
    // Source: Showdown -- Poison damage is 1/8 max HP
    // 160 / 8 = 20
    const pokemon = createOnFieldPokemon({ hp: 160, status: CORE_STATUS_IDS.poison });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.poison as never,
      {} as BattleState,
    );
    expect(result).toBe(20);
  });

  it("given poisoned Pokemon with 7 max HP, when applying status damage, then takes minimum 1 HP", () => {
    // Source: Showdown -- damage is max(1, floor(maxHp/8))
    // 7 / 8 = 0.875, floor = 0, max(1, 0) = 1
    const pokemon = createOnFieldPokemon({ hp: 7, status: CORE_STATUS_IDS.poison });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.poison as never,
      {} as BattleState,
    );
    expect(result).toBe(1);
  });
});

// ===========================================================================
// Badly-poisoned damage — escalating 1/16 per counter
// ===========================================================================

describe("Gen7Ruleset — applyStatusDamage (badly-poisoned)", () => {
  it("given badly-poisoned Pokemon with toxic counter at 1 and 160 max HP, when applying status damage, then takes 10 HP (160*1/16)", () => {
    // Source: Showdown -- Toxic damage starts at 1/16, then 2/16, 3/16...
    // 160 * 1 / 16 = 10
    const pokemon = createOnFieldPokemon({
      hp: 160,
      status: CORE_STATUS_IDS.badlyPoisoned,
      volatiles: [[VOLATILES.toxicCounter, { turnsLeft: -1, data: { counter: 1 } }]],
    });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.badlyPoisoned as never,
      {} as BattleState,
    );
    expect(result).toBe(10);
  });

  it("given badly-poisoned Pokemon with toxic counter at 3 and 160 max HP, when applying status damage, then takes 30 HP (160*3/16)", () => {
    // Source: Showdown -- Toxic damage at counter=3 is 3/16 max HP
    // 160 * 3 / 16 = 30
    const pokemon = createOnFieldPokemon({
      hp: 160,
      status: CORE_STATUS_IDS.badlyPoisoned,
      volatiles: [[VOLATILES.toxicCounter, { turnsLeft: -1, data: { counter: 3 } }]],
    });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.badlyPoisoned as never,
      {} as BattleState,
    );
    expect(result).toBe(30);
  });
});

// ===========================================================================
// Sleep/Freeze/Paralysis — no chip damage
// ===========================================================================

describe("Gen7Ruleset — applyStatusDamage (no-damage statuses)", () => {
  it("given sleeping Pokemon, when applying status damage, then takes 0 HP", () => {
    // Source: Showdown -- sleep has no per-turn chip damage
    const pokemon = createOnFieldPokemon({ status: CORE_STATUS_IDS.sleep });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.sleep as never,
      {} as BattleState,
    );
    expect(result).toBe(0);
  });

  it("given frozen Pokemon, when applying status damage, then takes 0 HP", () => {
    // Source: Showdown -- freeze has no per-turn chip damage
    const pokemon = createOnFieldPokemon({ status: CORE_STATUS_IDS.freeze });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.freeze as never,
      {} as BattleState,
    );
    expect(result).toBe(0);
  });

  it("given paralyzed Pokemon, when applying status damage, then takes 0 HP", () => {
    // Source: Showdown -- paralysis has no per-turn chip damage
    const pokemon = createOnFieldPokemon({ status: CORE_STATUS_IDS.paralysis });
    const result = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.paralysis as never,
      {} as BattleState,
    );
    expect(result).toBe(0);
  });
});

// ===========================================================================
// Gen 7 burn damage differs from Gen 6 (1/16 vs 1/8)
// ===========================================================================

describe("Gen7Ruleset — burn damage differs from Gen 6", () => {
  it("given Pokemon with 160 max HP, when comparing Gen 7 burn damage to expected Gen 6 value, then Gen 7 is exactly half", () => {
    // Source: Showdown -- Gen 6 burn = 1/8 = 20, Gen 7 burn = 1/16 = 10
    // This confirms the Gen 7 change
    const pokemon = createOnFieldPokemon({ hp: 160 });
    const gen7Damage = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.burn as never,
      {} as BattleState,
    );
    const expectedGen6Damage = Math.floor(160 / 8); // 20
    expect(gen7Damage).toBe(10);
    expect(expectedGen6Damage).toBe(20);
    expect(gen7Damage).toBe(expectedGen6Damage / 2);
  });

  it("given Pokemon with 200 max HP, when comparing Gen 7 burn damage to Gen 6, then Gen 7 is less", () => {
    // Source: Showdown -- Gen 7 burn = floor(200/16)=12, Gen 6 burn = floor(200/8)=25
    const pokemon = createOnFieldPokemon({ hp: 200 });
    const gen7Damage = ruleset.applyStatusDamage(
      pokemon,
      CORE_STATUS_IDS.burn as never,
      {} as BattleState,
    );
    const expectedGen6Damage = Math.floor(200 / 8); // 25
    expect(gen7Damage).toBe(12);
    expect(expectedGen6Damage).toBe(25);
    expect(gen7Damage).toBeLessThan(expectedGen6Damage);
  });
});
