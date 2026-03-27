/**
 * Gen 9 Weather System Tests
 *
 * Covers:
 *   - Snow replaces Hail: NO chip damage (key Gen 9 change)
 *   - Sandstorm chip damage: 1/16 max HP to non-Rock/Ground/Steel
 *   - Weather immunity: type-based, ability-based, item-based
 *   - Rain/Sun: no chip damage
 *   - Weather duration constants
 *
 * Source: Showdown data/conditions.ts:696-728 -- Snow weather
 * Source: Showdown data/conditions.ts -- sandstorm weather
 * Source: Bulbapedia -- Weather conditions page
 */

import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_NATURE_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src";
import { GEN9_ABILITY_IDS, GEN9_ITEM_IDS, GEN9_SPECIES_IDS } from "../src/data";
import {
  applyGen9WeatherEffects,
  getWeatherDuration,
  isGen9WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "../src/Gen9Weather";
import { ABILITY_WEATHER_TURNS } from "../src/internal";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const gen9Data = createGen9DataManager();
const DEFAULT_SPECIES = gen9Data.getSpecies(GEN9_SPECIES_IDS.eevee);
const DEFAULT_POKEBALL = GEN9_ITEM_IDS.pokeBall;

const NORMAL_TYPING = [CORE_TYPE_IDS.normal] as const;
const FIRE_TYPING = [CORE_TYPE_IDS.fire] as const;
const WATER_TYPING = [CORE_TYPE_IDS.water] as const;
const ICE_TYPING = [CORE_TYPE_IDS.ice] as const;
const ROCK_TYPING = [CORE_TYPE_IDS.rock] as const;
const GROUND_TYPING = [CORE_TYPE_IDS.ground] as const;
const STEEL_TYPING = [CORE_TYPE_IDS.steel] as const;
const BUG_GHOST_TYPING = [CORE_TYPE_IDS.bug, CORE_TYPE_IDS.ghost] as const;
const FIRE_FLYING_TYPING = [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying] as const;
const SNOW_WEATHER = CORE_WEATHER_IDS.snow;
const SAND_WEATHER = CORE_WEATHER_IDS.sand;
const RAIN_WEATHER = CORE_WEATHER_IDS.rain;
const SUN_WEATHER = CORE_WEATHER_IDS.sun;
const HARSH_SUN_WEATHER = CORE_WEATHER_IDS.harshSun;
const HAIL_WEATHER = CORE_WEATHER_IDS.hail;
const HEAVY_RAIN_WEATHER = CORE_WEATHER_IDS.heavyRain;
const MAGIC_GUARD = GEN9_ABILITY_IDS.magicGuard;
const OVERCOAT = GEN9_ABILITY_IDS.overcoat;
const SAND_RUSH = GEN9_ABILITY_IDS.sandRush;
const SAND_FORCE = GEN9_ABILITY_IDS.sandForce;
const SAND_VEIL = GEN9_ABILITY_IDS.sandVeil;
const BLAZE = CORE_ABILITY_IDS.blaze;
const SAFETY_GOGGLES = GEN9_ITEM_IDS.safetyGoggles;
const WEATHER_SOURCES = {
  rain: GEN9_ABILITY_IDS.drizzle,
  sun: GEN9_ABILITY_IDS.drought,
  sand: GEN9_ABILITY_IDS.sandStream,
  snow: GEN9_ABILITY_IDS.snowWarning,
  harshSun: GEN9_ABILITY_IDS.desolateLand,
  hail: GEN9_ABILITY_IDS.snowWarning,
  heavyRain: GEN9_ABILITY_IDS.primordialSea,
} as const;

function createOnFieldPokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: readonly string[];
  ability?: string;
  nickname?: string;
  heldItem?: string | null;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? DEFAULT_SPECIES.name,
      speciesId: DEFAULT_SPECIES.id,
      heldItem: overrides.heldItem ?? null,
      nature: CORE_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      friendship: createFriendship(DEFAULT_SPECIES.baseFriendship),
      gender: CORE_GENDERS.male,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      pokeball: DEFAULT_POKEBALL,
    },
    ability: overrides.ability ?? BLAZE,
    types: overrides.types ?? NORMAL_TYPING,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
  } as unknown as ActivePokemon;
}

function createBattleSide(active: ActivePokemon, index: 0 | 1 = 0): BattleSide {
  return {
    index,
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function createBattleState(
  weatherType: string | null,
  turnsLeft: number,
  sides: [BattleSide, BattleSide],
): BattleState {
  return {
    weather: weatherType
      ? {
          type: weatherType,
          turnsLeft,
          source: WEATHER_SOURCES[weatherType as keyof typeof WEATHER_SOURCES],
        }
      : null,
    sides,
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 9 Weather", () => {
  describe("isGen9WeatherImmune", () => {
    // --- Sandstorm Type Immunity ---

    it("given a Rock-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen9WeatherImmune(ROCK_TYPING, SAND_WEATHER)).toBe(true);
    });

    it("given a Ground-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen9WeatherImmune(GROUND_TYPING, SAND_WEATHER)).toBe(true);
    });

    it("given a Steel-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen9WeatherImmune(STEEL_TYPING, SAND_WEATHER)).toBe(true);
    });

    it("given a dual-type Rock/Ground Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: any of Rock/Ground/Steel in typing grants immunity
      expect(isGen9WeatherImmune([CORE_TYPE_IDS.rock, CORE_TYPE_IDS.ground], SAND_WEATHER)).toBe(
        true,
      );
    });

    it("given a Normal-type Pokemon, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- Normal types take sandstorm chip damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER)).toBe(false);
    });

    it("given a Fire/Flying Pokemon, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- Fire and Flying are not sand-immune types
      expect(isGen9WeatherImmune(FIRE_FLYING_TYPING, SAND_WEATHER)).toBe(false);
    });

    // --- Sandstorm Ability Immunity ---

    it("given a Pokemon with Magic Guard, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- magicguard: immune to indirect damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, MAGIC_GUARD)).toBe(true);
    });

    it("given a Pokemon with Overcoat, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- overcoat: blocks weather damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, OVERCOAT)).toBe(true);
    });

    it("given a Pokemon with Sand Rush, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sandrush: immune to sandstorm chip
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, SAND_RUSH)).toBe(true);
    });

    it("given a Pokemon with Sand Force, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sandforce: immune to sandstorm chip
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, SAND_FORCE)).toBe(true);
    });

    it("given a Pokemon with Sand Veil, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sandveil: immune to sandstorm chip
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, SAND_VEIL)).toBe(true);
    });

    it("given a Pokemon with no relevant ability, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- non-sand abilities don't grant immunity
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, BLAZE)).toBe(false);
    });

    // --- Safety Goggles ---

    it("given a Pokemon with Safety Goggles in sandstorm, when checking immunity, then returns true", () => {
      // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, SAND_WEATHER, undefined, SAFETY_GOGGLES)).toBe(
        true,
      );
    });

    it("given a Pokemon with Safety Goggles in sandstorm without any sand ability, when checking immunity, then returns true", () => {
      // Source: Showdown data/items.ts -- safetygoggles supersedes type/ability
      expect(isGen9WeatherImmune(FIRE_TYPING, SAND_WEATHER, BLAZE, SAFETY_GOGGLES)).toBe(true);
    });

    // --- Snow (replaces Hail) -- NO CHIP DAMAGE ---

    it("given any Pokemon in Snow weather, when checking immunity, then returns false (no chip damage to check)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // Snow "immunity" is always false because there's nothing to be immune to
      expect(isGen9WeatherImmune(NORMAL_TYPING, SNOW_WEATHER)).toBe(false);
    });

    it("given an Ice-type Pokemon in Snow weather, when checking immunity, then returns false (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      expect(isGen9WeatherImmune(ICE_TYPING, SNOW_WEATHER)).toBe(false);
    });

    // --- Hail (legacy) ---

    it("given any Pokemon in Hail weather, when checking immunity, then returns false (Hail is not sand)", () => {
      // In Gen 9, Hail shouldn't exist, but if it were present, isGen9WeatherImmune
      // only checks for sand chip damage. Hail is treated like rain/sun (no chip).
      expect(isGen9WeatherImmune(NORMAL_TYPING, HAIL_WEATHER)).toBe(false);
    });

    // --- Rain/Sun: no chip damage ---

    it("given any Pokemon in Rain, when checking immunity, then returns false (rain has no chip)", () => {
      // Source: Showdown data/conditions.ts -- rain has no residual damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, RAIN_WEATHER)).toBe(false);
    });

    it("given any Pokemon in Sun, when checking immunity, then returns false (sun has no chip)", () => {
      // Source: Showdown data/conditions.ts -- sun has no residual damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, SUN_WEATHER)).toBe(false);
    });

    it("given any Pokemon in heavy rain, when checking immunity, then returns false", () => {
      // Source: Showdown data/conditions.ts -- heavy rain has no residual damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, HEAVY_RAIN_WEATHER)).toBe(false);
    });

    it("given any Pokemon in harsh sun, when checking immunity, then returns false", () => {
      // Source: Showdown data/conditions.ts -- harsh sun has no residual damage
      expect(isGen9WeatherImmune(NORMAL_TYPING, HARSH_SUN_WEATHER)).toBe(false);
    });
  });

  describe("applyGen9WeatherEffects", () => {
    // --- Snow: no chip damage ---

    it("given Snow weather and a Normal-type Pokemon, when applying weather effects, then returns empty (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // This is THE key Gen 9 weather change: Snow replaces Hail but has no chip damage
      const normal = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 200 });
      const side0 = createBattleSide(normal, 0);
      const side1 = createBattleSide(createOnFieldPokemon({}), 1);
      const state = createBattleState(SNOW_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Snow weather and an Ice-type Pokemon, when applying weather effects, then returns empty (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // Ice types are unaffected by Hail chip but Snow has no chip at all
      const iceType = createOnFieldPokemon({ types: ICE_TYPING, maxHp: 200 });
      const side0 = createBattleSide(iceType, 0);
      const side1 = createBattleSide(createOnFieldPokemon({}), 1);
      const state = createBattleState(SNOW_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Snow weather and a Fire-type Pokemon, when applying weather effects, then returns empty (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // Even types that would take Hail chip in Gen 8 are unaffected by Snow
      const fireType = createOnFieldPokemon({ types: FIRE_TYPING, maxHp: 200 });
      const side0 = createBattleSide(fireType, 0);
      const side1 = createBattleSide(createOnFieldPokemon({}), 1);
      const state = createBattleState(SNOW_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Sandstorm chip damage ---

    it("given Sandstorm and a Normal-type Pokemon with 200 HP, when applying weather effects, then deals 12 damage (floor(200/16))", () => {
      // Source: Showdown data/conditions.ts -- sandstorm: damage = floor(maxHP / 16)
      // 200 / 16 = 12.5, floor = 12
      const normal = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 200 });
      const side0 = createBattleSide(normal, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(12);
    });

    it("given Sandstorm and a Water-type Pokemon with 300 HP, when applying weather effects, then deals 18 damage (floor(300/16))", () => {
      // Source: Showdown data/conditions.ts -- sandstorm: damage = floor(maxHP / 16)
      // 300 / 16 = 18.75, floor = 18
      const water = createOnFieldPokemon({ types: WATER_TYPING, maxHp: 300 });
      const side0 = createBattleSide(water, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(18);
    });

    it("given Sandstorm and a Pokemon with 1 max HP, when applying weather effects, then deals minimum 1 damage", () => {
      // Source: Showdown data/conditions.ts -- weather damage minimum 1 via Math.max(1, ...)
      const shedinja = createOnFieldPokemon({ types: BUG_GHOST_TYPING, maxHp: 1 });
      const side0 = createBattleSide(shedinja, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(1);
    });

    it("given Sandstorm and a Rock-type Pokemon, when applying weather effects, then no chip damage", () => {
      // Source: Bulbapedia -- Sandstorm: Rock-type is immune
      const rock = createOnFieldPokemon({ types: ROCK_TYPING, maxHp: 200 });
      const side0 = createBattleSide(rock, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: GROUND_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Ground-type Pokemon, when applying weather effects, then no chip damage", () => {
      // Source: Bulbapedia -- Sandstorm: Ground-type is immune
      const ground = createOnFieldPokemon({ types: GROUND_TYPING, maxHp: 200 });
      const side0 = createBattleSide(ground, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Steel-type Pokemon, when applying weather effects, then no chip damage", () => {
      // Source: Bulbapedia -- Sandstorm: Steel-type is immune
      const steel = createOnFieldPokemon({ types: STEEL_TYPING, maxHp: 200 });
      const side0 = createBattleSide(steel, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Pokemon with Safety Goggles, when applying weather effects, then no chip damage", () => {
      // Source: Showdown data/items.ts -- safetygoggles blocks weather chip
      const gogglesMon = createOnFieldPokemon({
        types: NORMAL_TYPING,
        maxHp: 200,
        heldItem: SAFETY_GOGGLES,
      });
      const side0 = createBattleSide(gogglesMon, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Pokemon with Magic Guard, when applying weather effects, then no chip damage", () => {
      // Source: Showdown data/abilities.ts -- magicguard blocks indirect damage
      const magicGuardMon = createOnFieldPokemon({
        types: NORMAL_TYPING,
        maxHp: 200,
        ability: MAGIC_GUARD,
      });
      const side0 = createBattleSide(magicGuardMon, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Pokemon with Overcoat, when applying weather effects, then no chip damage", () => {
      // Source: Showdown data/abilities.ts -- overcoat blocks weather damage
      const overcoatMon = createOnFieldPokemon({
        types: NORMAL_TYPING,
        maxHp: 200,
        ability: OVERCOAT,
      });
      const side0 = createBattleSide(overcoatMon, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Sandstorm message ---

    it("given Sandstorm chip damage, when result is returned, then message says 'buffeted by the sandstorm'", () => {
      // Source: Showdown sim/battle.ts -- standard sandstorm damage message
      const normal = createOnFieldPokemon({
        types: NORMAL_TYPING,
        maxHp: 200,
        nickname: DEFAULT_SPECIES.name,
      });
      const side0 = createBattleSide(normal, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results[0].message).toBe(`${DEFAULT_SPECIES.name} is buffeted by the sandstorm!`);
    });

    // --- Rain/Sun: no chip damage ---

    it("given Rain weather, when applying weather effects, then returns empty", () => {
      // Source: Showdown data/conditions.ts -- rain has no residual damage
      const normal = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 200 });
      const side0 = createBattleSide(normal, 0);
      const side1 = createBattleSide(createOnFieldPokemon({}), 1);
      const state = createBattleState(RAIN_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sun weather, when applying weather effects, then returns empty", () => {
      // Source: Showdown data/conditions.ts -- sun has no residual damage
      const normal = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 200 });
      const side0 = createBattleSide(normal, 0);
      const side1 = createBattleSide(createOnFieldPokemon({}), 1);
      const state = createBattleState(SUN_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- No weather ---

    it("given no weather, when applying weather effects, then returns empty", () => {
      const normal = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 200 });
      const side0 = createBattleSide(normal, 0);
      const side1 = createBattleSide(createOnFieldPokemon({}), 1);
      const state = createBattleState(null, 0, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Fainted Pokemon ---

    it("given Sandstorm and a fainted Pokemon, when applying weather effects, then skips the fainted Pokemon", () => {
      // Fainted Pokemon should not take chip damage
      const fainted = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 200, currentHp: 0 });
      const side0 = createBattleSide(fainted, 0);
      const side1 = createBattleSide(createOnFieldPokemon({ types: ROCK_TYPING }), 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Both sides take damage ---

    it("given Sandstorm and vulnerable Pokemon on both sides, when applying weather effects, then returns results for both", () => {
      // Source: Showdown data/conditions.ts -- sandstorm hits all non-immune Pokemon on both sides
      const normal0 = createOnFieldPokemon({ types: NORMAL_TYPING, maxHp: 160, nickname: "Mon0" });
      const normal1 = createOnFieldPokemon({ types: FIRE_TYPING, maxHp: 320, nickname: "Mon1" });
      const side0 = createBattleSide(normal0, 0);
      const side1 = createBattleSide(normal1, 1);
      const state = createBattleState(SAND_WEATHER, 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(2);
      // floor(160/16) = 10, floor(320/16) = 20
      expect(results[0].damage).toBe(10);
      expect(results[1].damage).toBe(20);
    });
  });

  describe("Weather Duration Constants", () => {
    it("given ABILITY_WEATHER_TURNS, then equals 5", () => {
      // Source: Bulbapedia -- Weather (Gen 6+): ability-summoned weather lasts 5 turns
      expect(ABILITY_WEATHER_TURNS).toBe(5);
    });

    it("given WEATHER_ROCK_EXTENSION, then equals 3 (5+3=8 total)", () => {
      // Source: Bulbapedia -- Weather rocks extend duration to 8 turns
      expect(WEATHER_ROCK_EXTENSION).toBe(3);
    });

    it("given getWeatherDuration without weather rock, then returns 5", () => {
      // Source: Showdown sim/battle.ts -- weather duration = 5
      expect(getWeatherDuration(false)).toBe(5);
    });

    it("given getWeatherDuration with weather rock, then returns 8", () => {
      // Source: Showdown sim/battle.ts -- weather duration = 5 + 3 = 8 with rock
      expect(getWeatherDuration(true)).toBe(8);
    });
  });

  describe("SANDSTORM_IMMUNE_TYPES constant", () => {
    it("given SANDSTORM_IMMUNE_TYPES, then includes rock, ground, and steel", () => {
      // Source: Bulbapedia -- Sandstorm: Rock, Ground, Steel immune
      expect(SANDSTORM_IMMUNE_TYPES).toContain(CORE_TYPE_IDS.rock);
      expect(SANDSTORM_IMMUNE_TYPES).toContain(CORE_TYPE_IDS.ground);
      expect(SANDSTORM_IMMUNE_TYPES).toContain(CORE_TYPE_IDS.steel);
    });

    it("given SANDSTORM_IMMUNE_TYPES, then has exactly 3 types", () => {
      expect(SANDSTORM_IMMUNE_TYPES).toHaveLength(3);
    });
  });
});
