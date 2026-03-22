import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import {
  ABILITY_WEATHER_TURNS,
  applyGen8WeatherEffects,
  getWeatherDuration,
  HAIL_IMMUNE_TYPES,
  isGen8WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "../src/Gen8Weather";

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

describe("Gen 8 Weather", () => {
  describe("isGen8WeatherImmune", () => {
    // --- Sandstorm Type Immunity ---

    it("given a Rock-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen8WeatherImmune(["rock"], "sand")).toBe(true);
    });

    it("given a Ground-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen8WeatherImmune(["ground"], "sand")).toBe(true);
    });

    it("given a Steel-type Pokemon, when checking sandstorm immunity, then returns true", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(isGen8WeatherImmune(["steel"], "sand")).toBe(true);
    });

    it("given a Normal-type Pokemon, when checking sandstorm immunity, then returns false", () => {
      // Source: Bulbapedia -- Normal-type has no sandstorm immunity
      expect(isGen8WeatherImmune(["normal"], "sand")).toBe(false);
    });

    it("given a dual Fire/Steel Pokemon, when checking sandstorm immunity, then returns true (Steel grants immunity)", () => {
      // Source: Bulbapedia -- Sandstorm immunity is per-type; any immune type grants immunity
      expect(isGen8WeatherImmune(["fire", "steel"], "sand")).toBe(true);
    });

    // --- Hail Type Immunity ---

    it("given an Ice-type Pokemon, when checking hail immunity, then returns true", () => {
      // Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
      expect(isGen8WeatherImmune(["ice"], "hail")).toBe(true);
    });

    it("given a Fire-type Pokemon, when checking hail immunity, then returns false", () => {
      // Source: Bulbapedia -- Fire-type has no hail immunity
      expect(isGen8WeatherImmune(["fire"], "hail")).toBe(false);
    });

    // --- Ability Immunity ---

    it("given Magic Guard, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- magicguard: onImmunity for weather
      expect(isGen8WeatherImmune(["normal"], "sand", "magic-guard")).toBe(true);
    });

    it("given Overcoat, when checking hail immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- overcoat: onImmunity for weather
      expect(isGen8WeatherImmune(["normal"], "hail", "overcoat")).toBe(true);
    });

    it("given Ice Face (Gen 8 ability), when checking hail immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- iceface: onImmunity for hail
      // Source: Bulbapedia -- Ice Face: Eiscue's ability, is not damaged by hail
      expect(isGen8WeatherImmune(["normal"], "hail", "ice-face")).toBe(true);
    });

    it("given Slush Rush, when checking hail immunity, then returns true", () => {
      // Source: Showdown data/abilities.ts -- slushrush: onImmunity for hail
      expect(isGen8WeatherImmune(["normal"], "hail", "slush-rush")).toBe(true);
    });

    // --- Item Immunity ---

    it("given Safety Goggles, when checking sandstorm immunity, then returns true", () => {
      // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
      expect(isGen8WeatherImmune(["normal"], "sand", undefined, "safety-goggles")).toBe(true);
    });

    it("given Safety Goggles, when checking hail immunity, then returns true", () => {
      // Source: Showdown data/items.ts -- safetygoggles: onImmunity for weather damage
      expect(isGen8WeatherImmune(["normal"], "hail", undefined, "safety-goggles")).toBe(true);
    });

    // --- Rain/Sun have no chip damage ---

    it("given any Pokemon in rain, when checking weather immunity, then returns false (no chip)", () => {
      // Source: Showdown data/conditions.ts -- rain has no chip damage
      expect(isGen8WeatherImmune(["normal"], "rain" as any)).toBe(false);
    });

    it("given any Pokemon in sun, when checking weather immunity, then returns false (no chip)", () => {
      // Source: Showdown data/conditions.ts -- sun has no chip damage
      expect(isGen8WeatherImmune(["normal"], "sun" as any)).toBe(false);
    });
  });

  describe("applyGen8WeatherEffects", () => {
    it("given sandstorm and a Normal-type with 200 HP, when applying weather, then deals 12 damage (floor(200/16))", () => {
      // Source: Showdown data/conditions.ts -- sandstorm damage = Math.floor(maxHP / 16)
      // floor(200 / 16) = floor(12.5) = 12
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(12);
      expect(results[0].message).toContain("buffeted by the sandstorm");
    });

    it("given sandstorm and a Water-type with 320 HP, when applying weather, then deals 20 damage (floor(320/16))", () => {
      // Source: Showdown data/conditions.ts -- sandstorm damage = Math.floor(maxHP / 16)
      // floor(320 / 16) = 20
      const mon = makeActivePokemon({ types: ["water"], maxHp: 320 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["steel"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(20);
    });

    it("given sandstorm and a Rock-type, when applying weather, then deals no damage", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      const mon = makeActivePokemon({ types: ["rock"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      // Both are Rock-type, immune
      expect(results).toHaveLength(0);
    });

    it("given sandstorm and a Ground-type, when applying weather, then deals no damage", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      const mon = makeActivePokemon({ types: ["ground"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["ground"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(0);
    });

    it("given sandstorm and a Steel-type, when applying weather, then deals no damage", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      const mon = makeActivePokemon({ types: ["steel"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["steel"] }), 1);
      const state = makeState("sand", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(0);
    });

    it("given hail and a Normal-type with 200 HP, when applying weather, then deals 12 damage (floor(200/16))", () => {
      // Source: Showdown data/conditions.ts -- hail damage = Math.floor(maxHP / 16)
      // floor(200 / 16) = floor(12.5) = 12
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);
      const state = makeState("hail", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(1);
      expect(results[0].damage).toBe(12);
      expect(results[0].message).toContain("pelted by hail");
    });

    it("given hail and an Ice-type, when applying weather, then deals no damage", () => {
      // Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
      const mon = makeActivePokemon({ types: ["ice"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);
      const state = makeState("hail", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(0);
    });

    it("given no weather, when applying weather effects, then returns empty array", () => {
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["normal"] }), 1);
      const state = makeState(null, 0, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(0);
    });

    it("given rain, when applying weather effects, then returns empty array (rain has no chip)", () => {
      // Source: Showdown data/conditions.ts -- rain has no chip damage
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["normal"] }), 1);
      const state = makeState("rain", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(0);
    });

    it("given sun, when applying weather effects, then returns empty array (sun has no chip)", () => {
      // Source: Showdown data/conditions.ts -- sun has no chip damage
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side0 = makeSide(mon, 0);
      const side1 = makeSide(makeActivePokemon({ types: ["normal"] }), 1);
      const state = makeState("sun", 5, [side0, side1]);

      const results = applyGen8WeatherEffects(state);

      expect(results).toHaveLength(0);
    });
  });

  describe("getWeatherDuration", () => {
    it("given no weather rock, when getting duration, then returns 5 turns", () => {
      // Source: Bulbapedia -- Weather (Gen 6+): ability-summoned weather lasts 5 turns
      expect(getWeatherDuration(false)).toBe(5);
    });

    it("given weather rock present, when getting duration, then returns 8 turns", () => {
      // Source: Bulbapedia -- Weather rocks extend ability-summoned weather to 8 turns
      expect(getWeatherDuration(true)).toBe(8);
    });
  });

  describe("Weather constants", () => {
    it("ABILITY_WEATHER_TURNS is 5", () => {
      // Source: Showdown sim/battle.ts -- weather duration = 5
      expect(ABILITY_WEATHER_TURNS).toBe(5);
    });

    it("WEATHER_ROCK_EXTENSION is 3", () => {
      // Source: Showdown sim/battle.ts -- rock adds 3 turns (5 + 3 = 8)
      expect(WEATHER_ROCK_EXTENSION).toBe(3);
    });

    it("SANDSTORM_IMMUNE_TYPES contains rock, ground, steel", () => {
      // Source: Bulbapedia -- Sandstorm: "Rock-, Ground-, and Steel-type Pokemon are unaffected"
      expect(SANDSTORM_IMMUNE_TYPES).toEqual(["rock", "ground", "steel"]);
    });

    it("HAIL_IMMUNE_TYPES contains ice", () => {
      // Source: Bulbapedia -- Hail: "Ice-type Pokemon are unaffected"
      expect(HAIL_IMMUNE_TYPES).toEqual(["ice"]);
    });
  });
});
