/**
 * Gen 9 Terrain System Tests
 *
 * Covers:
 *   - Grassy Terrain: 1/16 HP heal at EoT for grounded Pokemon
 *   - Electric Terrain: blocks sleep for grounded Pokemon
 *   - Misty Terrain: blocks all primary status for grounded Pokemon
 *   - Misty Terrain: blocks confusion for grounded Pokemon
 *   - Psychic Terrain: blocks priority moves targeting grounded defenders
 *   - Grounding check: Flying type, Levitate, Air Balloon, Iron Ball, Gravity
 *   - Surge abilities: terrain-setting ability detection
 *   - Terrain duration constants
 *
 * Source: Showdown data/conditions.ts -- terrain handlers
 * Source: Bulbapedia -- Terrain mechanics
 */

import type { ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType, TerrainType, VolatileStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS, GEN9_SPECIES_IDS } from "../src";
import {
  applyGen9TerrainEffects,
  checkGen9TerrainStatusImmunity,
  checkMistyTerrainConfusionImmunity,
  checkPsychicTerrainPriorityBlock,
  getSurgeTerrainType,
  isGen9Grounded,
  isSurgeAbility,
  TERRAIN_DEFAULT_TURNS,
  TERRAIN_EXTENDED_TURNS,
} from "../src/Gen9Terrain";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS };
const ITEMS = { ...CORE_ITEM_IDS, ...GEN9_ITEM_IDS };
const SPECIES = GEN9_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TERRAINS = CORE_TERRAIN_IDS;
const TERRAIN_TEST_SOURCE = CORE_TERRAIN_IDS.testSource;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
  hp?: number;
  currentHp?: number;
  types?: readonly [PokemonType] | readonly [PokemonType, PokemonType];
  ability?: string;
  heldItem?: string | null;
  nickname?: string | null;
  volatiles?: Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: SPECIES.eevee,
      nickname: overrides.nickname ?? null,
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: createFriendship(0),
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: { hp, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    },
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: [...(overrides.types ?? [TYPES.normal])],
    ability: overrides.ability ?? ABILITIES.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleState(overrides?: {
  terrain?: { type: TerrainType; turnsLeft: number; source: string } | null;
  gravity?: { active: boolean; turnsLeft: number };
  sides?: Array<{
    index?: number;
    active?: Array<ActivePokemon | null>;
  }>;
}): BattleState {
  return {
    weather: null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 9,
    turnNumber: 1,
    sides: overrides?.sides ?? [
      { index: 0, active: [] },
      { index: 1, active: [] },
    ],
  } as unknown as BattleState;
}

// ===========================================================================
// Electric Terrain -- Status Immunity
// ===========================================================================

describe("Electric Terrain", () => {
  describe("status immunity", () => {
    it("given Electric Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
      //   if (status.id === 'slp') { ... return false; }
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.sleep, target, state);
      expect(result.immune).toBe(true);
      expect(result.message).toContain("Electric Terrain");
    });

    it("given Electric Terrain, when inflicting paralysis on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.paralysis, target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting burn on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.burn, target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting sleep on a Flying-type (not grounded), then allows it", () => {
      // Source: Showdown sim/pokemon.ts -- flying types are not grounded
      const target = createOnFieldPokemon({ types: [TYPES.flying] });
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.sleep, target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting sleep on a Levitate Pokemon (not grounded), then allows it", () => {
      // Source: Showdown sim/pokemon.ts -- Levitate makes Pokemon not grounded
      const target = createOnFieldPokemon({ ability: ABILITIES.levitate });
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.sleep, target, state);
      expect(result.immune).toBe(false);
    });
  });
});

// ===========================================================================
// Misty Terrain -- Status Immunity
// ===========================================================================

describe("Misty Terrain", () => {
  describe("status immunity", () => {
    it("given Misty Terrain, when inflicting poison on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: return false
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.poison, target, state);
      expect(result.immune).toBe(true);
      expect(result.message).toContain("Misty Terrain");
    });

    it("given Misty Terrain, when inflicting burn on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.burn, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.sleep, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting freeze on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.freeze, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting badly-poisoned on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.badlyPoisoned, target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting poison on a Flying-type (not grounded), then allows it", () => {
      // Source: Showdown sim/pokemon.ts -- flying types are not grounded
      const target = createOnFieldPokemon({ types: [TYPES.flying] });
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      const result = checkGen9TerrainStatusImmunity(STATUSES.poison, target, state);
      expect(result.immune).toBe(false);
    });
  });

  describe("confusion immunity", () => {
    it("given Misty Terrain, when checking confusion immunity on grounded Pokemon, then returns true", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile:
      //   if (status.id === 'confusion') { return null; }
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(true);
    });

    it("given Misty Terrain, when checking confusion immunity on Flying-type (not grounded), then returns false", () => {
      // Source: Showdown sim/pokemon.ts -- flying types are not grounded
      const target = createOnFieldPokemon({ types: [TYPES.flying] });
      const state = createBattleState({
        terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(false);
    });

    it("given no terrain, when checking confusion immunity, then returns false", () => {
      const target = createOnFieldPokemon({});
      const state = createBattleState({});
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(false);
    });

    it("given Electric Terrain, when checking confusion immunity, then returns false (only Misty blocks confusion)", () => {
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(false);
    });
  });
});

// ===========================================================================
// No terrain active
// ===========================================================================

describe("No Terrain", () => {
  it("given no terrain, when checking status immunity, then returns not immune", () => {
    const target = createOnFieldPokemon({});
    const state = createBattleState({});
    const result = checkGen9TerrainStatusImmunity(STATUSES.sleep, target, state);
    expect(result.immune).toBe(false);
  });

  it("given no terrain, when applying terrain effects, then returns empty", () => {
    const state = createBattleState({});
    const results = applyGen9TerrainEffects(state);
    expect(results).toHaveLength(0);
  });
});

// ===========================================================================
// Psychic Terrain -- Priority Blocking
// ===========================================================================

describe("Psychic Terrain", () => {
  describe("priority blocking", () => {
    it("given Psychic Terrain, when priority move targets grounded defender, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- psychicterrain.onTryHit:
      //   if (target.isGrounded() && move.priority > 0) { return false; }
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkPsychicTerrainPriorityBlock(TERRAINS.psychic, 1, target, state)).toBe(true);
    });

    it("given Psychic Terrain, when priority +2 move targets grounded defender, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- blocks all priority > 0
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkPsychicTerrainPriorityBlock(TERRAINS.psychic, 2, target, state)).toBe(true);
    });

    it("given Psychic Terrain, when priority 0 move targets grounded defender, then allows it", () => {
      // Source: Showdown data/conditions.ts -- only blocks priority > 0
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkPsychicTerrainPriorityBlock(TERRAINS.psychic, 0, target, state)).toBe(false);
    });

    it("given Psychic Terrain, when negative priority move targets grounded defender, then allows it", () => {
      // Source: Showdown data/conditions.ts -- only blocks priority > 0, not negative
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkPsychicTerrainPriorityBlock(TERRAINS.psychic, -1, target, state)).toBe(false);
    });

    it("given Psychic Terrain, when priority move targets Flying-type (not grounded), then allows it", () => {
      // Source: Showdown data/conditions.ts -- only blocks if target is grounded
      const target = createOnFieldPokemon({ types: [TYPES.flying] });
      const state = createBattleState({
        terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkPsychicTerrainPriorityBlock(TERRAINS.psychic, 1, target, state)).toBe(false);
    });

    it("given no Psychic Terrain, when priority move targets grounded defender, then allows it", () => {
      const target = createOnFieldPokemon({});
      const state = createBattleState({});
      expect(checkPsychicTerrainPriorityBlock(null, 1, target, state)).toBe(false);
    });

    it("given Electric Terrain, when priority move targets grounded defender, then allows it", () => {
      // Only Psychic Terrain blocks priority, not Electric
      const target = createOnFieldPokemon({});
      const state = createBattleState({
        terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      });
      expect(checkPsychicTerrainPriorityBlock(TERRAINS.electric, 1, target, state)).toBe(false);
    });
  });
});

// ===========================================================================
// Grassy Terrain -- End-of-Turn Healing
// ===========================================================================

describe("Grassy Terrain", () => {
  describe("end-of-turn healing", () => {
    it("given Grassy Terrain and grounded Pokemon at 150/200 HP, when applying terrain effects, then heals 12 (floor(200/16))", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual: heal(baseMaxhp / 16)
      // 200 / 16 = 12.5, floor = 12
      const mon = createOnFieldPokemon({ hp: 200, currentHp: 150 });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [mon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].healAmount).toBe(12);
      expect(results[0].effect).toBe("grassy-heal");
    });

    it("given Grassy Terrain and grounded Pokemon at 240/320 HP, when applying terrain effects, then heals 20 (floor(320/16))", () => {
      // Source: Showdown data/conditions.ts -- grassyterrain: heal = floor(maxhp/16)
      // 320 / 16 = 20
      const mon = createOnFieldPokemon({ hp: 320, currentHp: 240 });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [mon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].healAmount).toBe(20);
    });

    it("given Grassy Terrain and grounded Pokemon at full HP, when applying terrain effects, then no healing", () => {
      // Pokemon at full HP should not receive healing events
      const mon = createOnFieldPokemon({ hp: 200, currentHp: 200 });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [mon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain and Flying-type Pokemon (not grounded), when applying terrain effects, then no healing", () => {
      // Source: Bulbapedia -- Grassy Terrain only heals grounded Pokemon
      const flyingMon = createOnFieldPokemon({ types: [TYPES.flying], hp: 200, currentHp: 100 });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [flyingMon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain and Levitate Pokemon (not grounded), when applying terrain effects, then no healing", () => {
      // Source: Showdown sim/pokemon.ts -- Levitate makes Pokemon not grounded
      const levitateMon = createOnFieldPokemon({
        ability: ABILITIES.levitate,
        hp: 200,
        currentHp: 100,
      });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [levitateMon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain and fainted Pokemon, when applying terrain effects, then no healing", () => {
      const fainted = createOnFieldPokemon({ hp: 200, currentHp: 0 });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [fainted] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain and low-max-HP Pokemon at 14/15, when applying terrain effects, then heals at least 1", () => {
      // Min 1 heal: Math.max(1, floor(15/16)) = Math.max(1, 0) = 1
      // Source: Showdown data/conditions.ts -- grassyterrain.onResidual: heal(baseMaxhp / 16), min 1
      const mon = createOnFieldPokemon({ hp: 15, currentHp: 14 });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [mon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].healAmount).toBe(1);
    });

    it("given Grassy Terrain, when heal result is returned, then message says 'healed by Grassy Terrain'", () => {
      // Source: Showdown sim/battle.ts -- standard grassy terrain heal message
      const mon = createOnFieldPokemon({ hp: 200, currentHp: 100, nickname: "Bulbasaur" });
      const state = createBattleState({
        terrain: { type: TERRAINS.grassy, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
        sides: [
          { index: 0, active: [mon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results[0].message).toBe("Bulbasaur is healed by Grassy Terrain!");
    });
  });
});

// ===========================================================================
// Non-Grassy Terrain -- No End-of-Turn Effects
// ===========================================================================

describe("Non-Grassy Terrain EoT", () => {
  it("given Electric Terrain, when applying terrain effects, then returns empty (no EoT heal)", () => {
    const mon = createOnFieldPokemon({ hp: 200, currentHp: 100 });
    const state = createBattleState({
      terrain: { type: TERRAINS.electric, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      sides: [
        { index: 0, active: [mon] },
        { index: 1, active: [] },
      ],
    });
    const results = applyGen9TerrainEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given Psychic Terrain, when applying terrain effects, then returns empty", () => {
    const mon = createOnFieldPokemon({ hp: 200, currentHp: 100 });
    const state = createBattleState({
      terrain: { type: TERRAINS.psychic, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      sides: [
        { index: 0, active: [mon] },
        { index: 1, active: [] },
      ],
    });
    const results = applyGen9TerrainEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given Misty Terrain, when applying terrain effects, then returns empty", () => {
    const mon = createOnFieldPokemon({ hp: 200, currentHp: 100 });
    const state = createBattleState({
      terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_TEST_SOURCE },
      sides: [
        { index: 0, active: [mon] },
        { index: 1, active: [] },
      ],
    });
    const results = applyGen9TerrainEffects(state);
    expect(results).toHaveLength(0);
  });
});

// ===========================================================================
// Grounding Check
// ===========================================================================

describe("isGen9Grounded", () => {
  it("given a normal Pokemon without levitation, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- non-flying, non-Levitate = grounded
    const mon = createOnFieldPokemon({});
    expect(isGen9Grounded(mon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- flying types are not grounded
    const mon = createOnFieldPokemon({ types: [TYPES.flying] });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a dual-type Normal/Flying Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- any type being Flying means not grounded
    const mon = createOnFieldPokemon({ types: [TYPES.normal, TYPES.flying] });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Levitate ability, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate grants non-grounded
    const mon = createOnFieldPokemon({ ability: ABILITIES.levitate });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Air Balloon (alive), when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Air Balloon grants non-grounded while HP > 0
    const mon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon, hp: 200, currentHp: 100 });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Air Balloon at 0 HP, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Air Balloon inactive when fainted
    const mon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon, hp: 200, currentHp: 0 });
    expect(isGen9Grounded(mon, false)).toBe(true);
  });

  it("given a Flying-type with Gravity active, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity forces all Pokemon to be grounded
    const mon = createOnFieldPokemon({ types: [TYPES.flying] });
    expect(isGen9Grounded(mon, true)).toBe(true);
  });

  it("given a Levitate Pokemon with Gravity active, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity overrides Levitate
    const mon = createOnFieldPokemon({ ability: ABILITIES.levitate });
    expect(isGen9Grounded(mon, true)).toBe(true);
  });

  it("given a Pokemon with Iron Ball, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Iron Ball forces grounding
    const mon = createOnFieldPokemon({ types: [TYPES.flying], heldItem: ITEMS.ironBall });
    expect(isGen9Grounded(mon, false)).toBe(true);
  });

  it("given a Pokemon with Iron Ball and Klutz ability, when checking grounded, then returns false (Iron Ball suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- Klutz suppresses held item effects
    const mon = createOnFieldPokemon({
      types: [TYPES.flying],
      heldItem: ITEMS.ironBall,
      ability: ABILITIES.klutz,
    });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Magnet Rise volatile, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Magnet Rise grants non-grounded
    const volatiles = new Map([[VOLATILES.magnetRise, { turnsLeft: 5 }]]);
    const mon = createOnFieldPokemon({ volatiles });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Ingrain volatile, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Ingrain forces grounding
    const volatiles = new Map([[VOLATILES.ingrain, { turnsLeft: 0 }]]);
    const mon = createOnFieldPokemon({ types: [TYPES.flying], volatiles });
    expect(isGen9Grounded(mon, false)).toBe(true);
  });
});

// ===========================================================================
// Surge Abilities
// ===========================================================================

describe("Surge Abilities", () => {
  it("given Electric Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility(ABILITIES.electricSurge)).toBe(true);
  });

  it("given Grassy Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility(ABILITIES.grassySurge)).toBe(true);
  });

  it("given Psychic Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility(ABILITIES.psychicSurge)).toBe(true);
  });

  it("given Misty Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility(ABILITIES.mistySurge)).toBe(true);
  });

  it("given Intimidate, when checking isSurgeAbility, then returns false", () => {
    expect(isSurgeAbility(ABILITIES.intimidate)).toBe(false);
  });

  it("given null ability, when checking isSurgeAbility, then returns false", () => {
    expect(isSurgeAbility(null)).toBe(false);
  });

  it("given Electric Surge, when getting terrain type, then returns 'electric'", () => {
    // Source: Showdown data/abilities.ts -- electricsurge sets Electric Terrain
    expect(getSurgeTerrainType(ABILITIES.electricSurge)).toBe(TERRAINS.electric);
  });

  it("given Grassy Surge, when getting terrain type, then returns 'grassy'", () => {
    // Source: Showdown data/abilities.ts -- grassysurge sets Grassy Terrain
    expect(getSurgeTerrainType(ABILITIES.grassySurge)).toBe(TERRAINS.grassy);
  });

  it("given non-surge ability, when getting terrain type, then returns null", () => {
    expect(getSurgeTerrainType(ABILITIES.blaze)).toBeNull();
  });
});

// ===========================================================================
// Terrain Duration Constants
// ===========================================================================

describe("Terrain Duration Constants", () => {
  it("given TERRAIN_DEFAULT_TURNS, then equals 5", () => {
    // Source: Bulbapedia -- Terrain lasts 5 turns by default
    expect(TERRAIN_DEFAULT_TURNS).toBe(5);
  });

  it("given TERRAIN_EXTENDED_TURNS, then equals 8", () => {
    // Source: Bulbapedia -- Terrain Extender extends to 8 turns
    expect(TERRAIN_EXTENDED_TURNS).toBe(8);
  });
});
