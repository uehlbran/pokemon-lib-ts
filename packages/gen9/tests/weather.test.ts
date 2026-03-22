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
import { describe, expect, it } from "vitest";
import {
  ABILITY_WEATHER_TURNS,
  applyGen9WeatherEffects,
  getWeatherDuration,
  isGen9WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "../src/Gen9Weather";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: string[];
  ability?: string;
  nickname?: string;
  heldItem?: string | null;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? "TestMon",
      speciesId: 1,
      heldItem: overrides.heldItem ?? null,
    },
    ability: overrides.ability ?? "blaze",
    types: overrides.types ?? ["normal"],
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
  } as unknown as ActivePokemon;
}

function makeSide(active: ActivePokemon, index: 0 | 1 = 0): BattleSide {
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

function makeState(
  weatherType: string | null,
  turnsLeft: number,
  sides: [BattleSide, BattleSide],
): BattleState {
  return {
    weather: weatherType ? { type: weatherType, turnsLeft, source: "test" } : null,
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
      expect(isGen9WeatherImmune(["rock"], "sand")).toBe(true);
    });

    it("given a Ground-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen9WeatherImmune(["ground"], "sand")).toBe(true);
    });

    it("given a Steel-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen9WeatherImmune(["steel"], "sand")).toBe(true);
    });

    it("given a dual-type Rock/Ground Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: any of Rock/Ground/Steel in typing grants immunity
      expect(isGen9WeatherImmune(["rock", "ground"], "sand")).toBe(true);
    });

    it("given a Normal-type Pokemon, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- Normal types take sandstorm chip damage
      expect(isGen9WeatherImmune(["normal"], "sand")).toBe(false);
    });

    it("given a Fire/Flying Pokemon, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- Fire and Flying are not sand-immune types
      expect(isGen9WeatherImmune(["fire", "flying"], "sand")).toBe(false);
    });

    // --- Sandstorm Ability Immunity ---

    it("given a Pokemon with Magic Guard, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- magicguard: immune to indirect damage
      expect(isGen9WeatherImmune(["normal"], "sand", "magic-guard")).toBe(true);
    });

    it("given a Pokemon with Overcoat, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- overcoat: blocks weather damage
      expect(isGen9WeatherImmune(["normal"], "sand", "overcoat")).toBe(true);
    });

    it("given a Pokemon with Sand Rush, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sandrush: immune to sandstorm chip
      expect(isGen9WeatherImmune(["normal"], "sand", "sand-rush")).toBe(true);
    });

    it("given a Pokemon with Sand Force, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sandforce: immune to sandstorm chip
      expect(isGen9WeatherImmune(["normal"], "sand", "sand-force")).toBe(true);
    });

    it("given a Pokemon with Sand Veil, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sandveil: immune to sandstorm chip
      expect(isGen9WeatherImmune(["normal"], "sand", "sand-veil")).toBe(true);
    });

    it("given a Pokemon with no relevant ability, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- non-sand abilities don't grant immunity
      expect(isGen9WeatherImmune(["normal"], "sand", "blaze")).toBe(false);
    });

    // --- Safety Goggles ---

    it("given a Pokemon with Safety Goggles in sandstorm, when checking immunity, then returns true", () => {
      // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
      expect(isGen9WeatherImmune(["normal"], "sand", undefined, "safety-goggles")).toBe(true);
    });

    it("given a Pokemon with Safety Goggles in sandstorm without any sand ability, when checking immunity, then returns true", () => {
      // Source: Showdown data/items.ts -- safetygoggles supersedes type/ability
      expect(isGen9WeatherImmune(["fire"], "sand", "blaze", "safety-goggles")).toBe(true);
    });

    // --- Snow (replaces Hail) -- NO CHIP DAMAGE ---

    it("given any Pokemon in Snow weather, when checking immunity, then returns false (no chip damage to check)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // Snow "immunity" is always false because there's nothing to be immune to
      expect(isGen9WeatherImmune(["normal"], "snow")).toBe(false);
    });

    it("given an Ice-type Pokemon in Snow weather, when checking immunity, then returns false (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      expect(isGen9WeatherImmune(["ice"], "snow")).toBe(false);
    });

    // --- Hail (legacy) ---

    it("given any Pokemon in Hail weather, when checking immunity, then returns false (Hail is not sand)", () => {
      // In Gen 9, Hail shouldn't exist, but if it were present, isGen9WeatherImmune
      // only checks for sand chip damage. Hail is treated like rain/sun (no chip).
      expect(isGen9WeatherImmune(["normal"], "hail")).toBe(false);
    });

    // --- Rain/Sun: no chip damage ---

    it("given any Pokemon in Rain, when checking immunity, then returns false (rain has no chip)", () => {
      // Source: Showdown data/conditions.ts -- rain has no residual damage
      expect(isGen9WeatherImmune(["normal"], "rain")).toBe(false);
    });

    it("given any Pokemon in Sun, when checking immunity, then returns false (sun has no chip)", () => {
      // Source: Showdown data/conditions.ts -- sun has no residual damage
      expect(isGen9WeatherImmune(["normal"], "sun")).toBe(false);
    });

    it("given any Pokemon in heavy rain, when checking immunity, then returns false", () => {
      // Source: Showdown data/conditions.ts -- heavy rain has no residual damage
      expect(isGen9WeatherImmune(["normal"], "heavy-rain")).toBe(false);
    });

    it("given any Pokemon in harsh sun, when checking immunity, then returns false", () => {
      // Source: Showdown data/conditions.ts -- harsh sun has no residual damage
      expect(isGen9WeatherImmune(["normal"], "harsh-sun")).toBe(false);
    });
  });

  describe("applyGen9WeatherEffects", () => {
    // --- Snow: no chip damage ---

    it("given Snow weather and a Normal-type Pokemon, when applying weather effects, then returns empty (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // This is THE key Gen 9 weather change: Snow replaces Hail but has no chip damage
      const normal = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(normal, 0);
      const side1 = makeSide(makeActivePokemon({}), 1);
      const state = makeState("snow", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Snow weather and an Ice-type Pokemon, when applying weather effects, then returns empty (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // Ice types are unaffected by Hail chip but Snow has no chip at all
      const iceType = makeActivePokemon({ types: ["ice"], maxHp: 200 });
      const side0 = makeSide(iceType, 0);
      const side1 = makeSide(makeActivePokemon({}), 1);
      const state = makeState("snow", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Snow weather and a Fire-type Pokemon, when applying weather effects, then returns empty (no chip damage)", () => {
      // Source: Showdown data/conditions.ts:696-728 -- Snow has no residual damage
      // Even types that would take Hail chip in Gen 8 are unaffected by Snow
      const fireType = makeActivePokemon({ types: ["fire"], maxHp: 200 });
      const side0 = makeSide(fireType, 0);
      const side1 = makeSide(makeActivePokemon({}), 1);
      const state = makeState("snow", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Sandstorm chip damage ---

    it("given Sandstorm and a Normal-type Pokemon with 200 HP, when applying weather effects, then deals 12 damage (floor(200/16))", () => {
      // Source: Showdown data/conditions.ts -- sandstorm: damage = floor(maxHP / 16)
      // 200 / 16 = 12.5, floor = 12
      const normal = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(normal, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(12);
    });

    it("given Sandstorm and a Water-type Pokemon with 300 HP, when applying weather effects, then deals 18 damage (floor(300/16))", () => {
      // Source: Showdown data/conditions.ts -- sandstorm: damage = floor(maxHP / 16)
      // 300 / 16 = 18.75, floor = 18
      const water = makeActivePokemon({ types: ["water"], maxHp: 300 });
      const side0 = makeSide(water, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(18);
    });

    it("given Sandstorm and a Pokemon with 1 max HP, when applying weather effects, then deals minimum 1 damage", () => {
      // Source: Showdown data/conditions.ts -- weather damage minimum 1 via Math.max(1, ...)
      const shedinja = makeActivePokemon({ types: ["bug", "ghost"], maxHp: 1 });
      const side0 = makeSide(shedinja, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(1);
    });

    it("given Sandstorm and a Rock-type Pokemon, when applying weather effects, then no chip damage", () => {
      // Source: Bulbapedia -- Sandstorm: Rock-type is immune
      const rock = makeActivePokemon({ types: ["rock"], maxHp: 200 });
      const side0 = makeSide(rock, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["ground"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Ground-type Pokemon, when applying weather effects, then no chip damage", () => {
      // Source: Bulbapedia -- Sandstorm: Ground-type is immune
      const ground = makeActivePokemon({ types: ["ground"], maxHp: 200 });
      const side0 = makeSide(ground, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Steel-type Pokemon, when applying weather effects, then no chip damage", () => {
      // Source: Bulbapedia -- Sandstorm: Steel-type is immune
      const steel = makeActivePokemon({ types: ["steel"], maxHp: 200 });
      const side0 = makeSide(steel, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Pokemon with Safety Goggles, when applying weather effects, then no chip damage", () => {
      // Source: Showdown data/items.ts -- safetygoggles blocks weather chip
      const gogglesMon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        heldItem: "safety-goggles",
      });
      const side0 = makeSide(gogglesMon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Pokemon with Magic Guard, when applying weather effects, then no chip damage", () => {
      // Source: Showdown data/abilities.ts -- magicguard blocks indirect damage
      const magicGuardMon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        ability: "magic-guard",
      });
      const side0 = makeSide(magicGuardMon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sandstorm and a Pokemon with Overcoat, when applying weather effects, then no chip damage", () => {
      // Source: Showdown data/abilities.ts -- overcoat blocks weather damage
      const overcoatMon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        ability: "overcoat",
      });
      const side0 = makeSide(overcoatMon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Sandstorm message ---

    it("given Sandstorm chip damage, when result is returned, then message says 'buffeted by the sandstorm'", () => {
      // Source: Showdown sim/battle.ts -- standard sandstorm damage message
      const normal = makeActivePokemon({ types: ["normal"], maxHp: 200, nickname: "Pikachu" });
      const side0 = makeSide(normal, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results[0].message).toBe("Pikachu is buffeted by the sandstorm!");
    });

    // --- Rain/Sun: no chip damage ---

    it("given Rain weather, when applying weather effects, then returns empty", () => {
      // Source: Showdown data/conditions.ts -- rain has no residual damage
      const normal = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(normal, 0);
      const side1 = makeSide(makeActivePokemon({}), 1);
      const state = makeState("rain", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    it("given Sun weather, when applying weather effects, then returns empty", () => {
      // Source: Showdown data/conditions.ts -- sun has no residual damage
      const normal = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(normal, 0);
      const side1 = makeSide(makeActivePokemon({}), 1);
      const state = makeState("sun", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- No weather ---

    it("given no weather, when applying weather effects, then returns empty", () => {
      const normal = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(normal, 0);
      const side1 = makeSide(makeActivePokemon({}), 1);
      const state = makeState(null, 0, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Fainted Pokemon ---

    it("given Sandstorm and a fainted Pokemon, when applying weather effects, then skips the fainted Pokemon", () => {
      // Fainted Pokemon should not take chip damage
      const fainted = makeActivePokemon({ types: ["normal"], maxHp: 200, currentHp: 0 });
      const side0 = makeSide(fainted, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);
      const results = applyGen9WeatherEffects(state);
      expect(results).toHaveLength(0);
    });

    // --- Both sides take damage ---

    it("given Sandstorm and vulnerable Pokemon on both sides, when applying weather effects, then returns results for both", () => {
      // Source: Showdown data/conditions.ts -- sandstorm hits all non-immune Pokemon on both sides
      const normal0 = makeActivePokemon({ types: ["normal"], maxHp: 160, nickname: "Mon0" });
      const normal1 = makeActivePokemon({ types: ["fire"], maxHp: 320, nickname: "Mon1" });
      const side0 = makeSide(normal0, 0);
      const side1 = makeSide(normal1, 1);
      const state = makeState("sand", 5, [side0, side1]);
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
      expect(SANDSTORM_IMMUNE_TYPES).toContain("rock");
      expect(SANDSTORM_IMMUNE_TYPES).toContain("ground");
      expect(SANDSTORM_IMMUNE_TYPES).toContain("steel");
    });

    it("given SANDSTORM_IMMUNE_TYPES, then has exactly 3 types", () => {
      expect(SANDSTORM_IMMUNE_TYPES).toHaveLength(3);
    });
  });
});
