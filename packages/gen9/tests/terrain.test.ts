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
import type { PokemonType, TerrainType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
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

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeActive(overrides: {
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  nickname?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: 1,
      nickname: overrides.nickname ?? null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? "none",
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: null,
      friendship: 0,
      gender: "male" as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: "pokeball",
      calculatedStats: { hp, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "none",
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

function makeState(overrides?: {
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
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(true);
      expect(result.message).toContain("Electric Terrain");
    });

    it("given Electric Terrain, when inflicting paralysis on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("paralysis", target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting burn on a grounded Pokemon, then allows it", () => {
      // Source: Showdown data/conditions.ts -- electricterrain only blocks sleep
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("burn", target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting sleep on a Flying-type (not grounded), then allows it", () => {
      // Source: Showdown sim/pokemon.ts -- flying types are not grounded
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(false);
    });

    it("given Electric Terrain, when inflicting sleep on a Levitate Pokemon (not grounded), then allows it", () => {
      // Source: Showdown sim/pokemon.ts -- Levitate makes Pokemon not grounded
      const target = makeActive({ ability: "levitate" });
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("sleep", target, state);
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
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("poison", target, state);
      expect(result.immune).toBe(true);
      expect(result.message).toContain("Misty Terrain");
    });

    it("given Misty Terrain, when inflicting burn on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("burn", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting sleep on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("sleep", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting freeze on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("freeze", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting badly-poisoned on a grounded Pokemon, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain blocks all status
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("badly-poisoned", target, state);
      expect(result.immune).toBe(true);
    });

    it("given Misty Terrain, when inflicting poison on a Flying-type (not grounded), then allows it", () => {
      // Source: Showdown sim/pokemon.ts -- flying types are not grounded
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      const result = checkGen9TerrainStatusImmunity("poison", target, state);
      expect(result.immune).toBe(false);
    });
  });

  describe("confusion immunity", () => {
    it("given Misty Terrain, when checking confusion immunity on grounded Pokemon, then returns true", () => {
      // Source: Showdown data/conditions.ts -- mistyterrain.onTryAddVolatile:
      //   if (status.id === 'confusion') { return null; }
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(true);
    });

    it("given Misty Terrain, when checking confusion immunity on Flying-type (not grounded), then returns false", () => {
      // Source: Showdown sim/pokemon.ts -- flying types are not grounded
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "misty", turnsLeft: 5, source: "test" },
      });
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(false);
    });

    it("given no terrain, when checking confusion immunity, then returns false", () => {
      const target = makeActive({});
      const state = makeState({});
      expect(checkMistyTerrainConfusionImmunity(target, state)).toBe(false);
    });

    it("given Electric Terrain, when checking confusion immunity, then returns false (only Misty blocks confusion)", () => {
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
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
    const target = makeActive({});
    const state = makeState({});
    const result = checkGen9TerrainStatusImmunity("sleep", target, state);
    expect(result.immune).toBe(false);
  });

  it("given no terrain, when applying terrain effects, then returns empty", () => {
    const state = makeState({});
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
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "psychic", turnsLeft: 5, source: "test" },
      });
      expect(checkPsychicTerrainPriorityBlock("psychic", 1, target, state)).toBe(true);
    });

    it("given Psychic Terrain, when priority +2 move targets grounded defender, then blocks it", () => {
      // Source: Showdown data/conditions.ts -- blocks all priority > 0
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "psychic", turnsLeft: 5, source: "test" },
      });
      expect(checkPsychicTerrainPriorityBlock("psychic", 2, target, state)).toBe(true);
    });

    it("given Psychic Terrain, when priority 0 move targets grounded defender, then allows it", () => {
      // Source: Showdown data/conditions.ts -- only blocks priority > 0
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "psychic", turnsLeft: 5, source: "test" },
      });
      expect(checkPsychicTerrainPriorityBlock("psychic", 0, target, state)).toBe(false);
    });

    it("given Psychic Terrain, when negative priority move targets grounded defender, then allows it", () => {
      // Source: Showdown data/conditions.ts -- only blocks priority > 0, not negative
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "psychic", turnsLeft: 5, source: "test" },
      });
      expect(checkPsychicTerrainPriorityBlock("psychic", -1, target, state)).toBe(false);
    });

    it("given Psychic Terrain, when priority move targets Flying-type (not grounded), then allows it", () => {
      // Source: Showdown data/conditions.ts -- only blocks if target is grounded
      const target = makeActive({ types: ["flying"] });
      const state = makeState({
        terrain: { type: "psychic", turnsLeft: 5, source: "test" },
      });
      expect(checkPsychicTerrainPriorityBlock("psychic", 1, target, state)).toBe(false);
    });

    it("given no Psychic Terrain, when priority move targets grounded defender, then allows it", () => {
      const target = makeActive({});
      const state = makeState({});
      expect(checkPsychicTerrainPriorityBlock(null, 1, target, state)).toBe(false);
    });

    it("given Electric Terrain, when priority move targets grounded defender, then allows it", () => {
      // Only Psychic Terrain blocks priority, not Electric
      const target = makeActive({});
      const state = makeState({
        terrain: { type: "electric", turnsLeft: 5, source: "test" },
      });
      expect(checkPsychicTerrainPriorityBlock("electric", 1, target, state)).toBe(false);
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
      const mon = makeActive({ hp: 200, currentHp: 150 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
      const mon = makeActive({ hp: 320, currentHp: 240 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
      const mon = makeActive({ hp: 200, currentHp: 200 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
      const flyingMon = makeActive({ types: ["flying"], hp: 200, currentHp: 100 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
      const levitateMon = makeActive({ ability: "levitate", hp: 200, currentHp: 100 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
        sides: [
          { index: 0, active: [levitateMon] },
          { index: 1, active: [] },
        ],
      });
      const results = applyGen9TerrainEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Grassy Terrain and fainted Pokemon, when applying terrain effects, then no healing", () => {
      const fainted = makeActive({ hp: 200, currentHp: 0 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
      const mon = makeActive({ hp: 15, currentHp: 14 });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
      const mon = makeActive({ hp: 200, currentHp: 100, nickname: "Bulbasaur" });
      const state = makeState({
        terrain: { type: "grassy", turnsLeft: 5, source: "test" },
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
    const mon = makeActive({ hp: 200, currentHp: 100 });
    const state = makeState({
      terrain: { type: "electric", turnsLeft: 5, source: "test" },
      sides: [
        { index: 0, active: [mon] },
        { index: 1, active: [] },
      ],
    });
    const results = applyGen9TerrainEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given Psychic Terrain, when applying terrain effects, then returns empty", () => {
    const mon = makeActive({ hp: 200, currentHp: 100 });
    const state = makeState({
      terrain: { type: "psychic", turnsLeft: 5, source: "test" },
      sides: [
        { index: 0, active: [mon] },
        { index: 1, active: [] },
      ],
    });
    const results = applyGen9TerrainEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given Misty Terrain, when applying terrain effects, then returns empty", () => {
    const mon = makeActive({ hp: 200, currentHp: 100 });
    const state = makeState({
      terrain: { type: "misty", turnsLeft: 5, source: "test" },
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
    const mon = makeActive({});
    expect(isGen9Grounded(mon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- flying types are not grounded
    const mon = makeActive({ types: ["flying"] });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a dual-type Normal/Flying Pokemon, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- any type being Flying means not grounded
    const mon = makeActive({ types: ["normal", "flying"] });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Levitate ability, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate grants non-grounded
    const mon = makeActive({ ability: "levitate" });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Air Balloon (alive), when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Air Balloon grants non-grounded while HP > 0
    const mon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 100 });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Air Balloon at 0 HP, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Air Balloon inactive when fainted
    const mon = makeActive({ heldItem: "air-balloon", hp: 200, currentHp: 0 });
    expect(isGen9Grounded(mon, false)).toBe(true);
  });

  it("given a Flying-type with Gravity active, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity forces all Pokemon to be grounded
    const mon = makeActive({ types: ["flying"] });
    expect(isGen9Grounded(mon, true)).toBe(true);
  });

  it("given a Levitate Pokemon with Gravity active, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity overrides Levitate
    const mon = makeActive({ ability: "levitate" });
    expect(isGen9Grounded(mon, true)).toBe(true);
  });

  it("given a Pokemon with Iron Ball, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Iron Ball forces grounding
    const mon = makeActive({ types: ["flying"], heldItem: "iron-ball" });
    expect(isGen9Grounded(mon, false)).toBe(true);
  });

  it("given a Pokemon with Iron Ball and Klutz ability, when checking grounded, then returns false (Iron Ball suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- Klutz suppresses held item effects
    const mon = makeActive({ types: ["flying"], heldItem: "iron-ball", ability: "klutz" });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Magnet Rise volatile, when checking grounded, then returns false", () => {
    // Source: Showdown sim/pokemon.ts -- Magnet Rise grants non-grounded
    const volatiles = new Map([["magnet-rise", { turnsLeft: 5 }]]);
    const mon = makeActive({ volatiles });
    expect(isGen9Grounded(mon, false)).toBe(false);
  });

  it("given a Pokemon with Ingrain volatile, when checking grounded, then returns true", () => {
    // Source: Showdown sim/pokemon.ts -- Ingrain forces grounding
    const volatiles = new Map([["ingrain", { turnsLeft: 0 }]]);
    const mon = makeActive({ types: ["flying"], volatiles });
    expect(isGen9Grounded(mon, false)).toBe(true);
  });
});

// ===========================================================================
// Surge Abilities
// ===========================================================================

describe("Surge Abilities", () => {
  it("given Electric Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility("electric-surge")).toBe(true);
  });

  it("given Grassy Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility("grassy-surge")).toBe(true);
  });

  it("given Psychic Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility("psychic-surge")).toBe(true);
  });

  it("given Misty Surge, when checking isSurgeAbility, then returns true", () => {
    expect(isSurgeAbility("misty-surge")).toBe(true);
  });

  it("given Intimidate, when checking isSurgeAbility, then returns false", () => {
    expect(isSurgeAbility("intimidate")).toBe(false);
  });

  it("given null ability, when checking isSurgeAbility, then returns false", () => {
    expect(isSurgeAbility(null)).toBe(false);
  });

  it("given Electric Surge, when getting terrain type, then returns 'electric'", () => {
    // Source: Showdown data/abilities.ts -- electricsurge sets Electric Terrain
    expect(getSurgeTerrainType("electric-surge")).toBe("electric");
  });

  it("given Grassy Surge, when getting terrain type, then returns 'grassy'", () => {
    // Source: Showdown data/abilities.ts -- grassysurge sets Grassy Terrain
    expect(getSurgeTerrainType("grassy-surge")).toBe("grassy");
  });

  it("given non-surge ability, when getting terrain type, then returns null", () => {
    expect(getSurgeTerrainType("blaze")).toBeNull();
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
