import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import {
  applyGen7WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen7WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "../src/Gen7Weather";

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
// Weather Immunity Tests
// ---------------------------------------------------------------------------

describe("Gen7 weather immunity", () => {
  // --- Sandstorm type immunity ---

  it("given Rock-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen7WeatherImmune(["rock"], "sand")).toBe(true);
  });

  it("given Ground-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen7WeatherImmune(["ground"], "sand")).toBe(true);
  });

  it("given Steel-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen7WeatherImmune(["steel"], "sand")).toBe(true);
  });

  it("given Fire-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Fire type takes sandstorm damage
    expect(isGen7WeatherImmune(["fire"], "sand")).toBe(false);
  });

  it("given Water-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Water type takes sandstorm damage
    expect(isGen7WeatherImmune(["water"], "sand")).toBe(false);
  });

  it("given Grass-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Grass type takes sandstorm damage
    expect(isGen7WeatherImmune(["grass"], "sand")).toBe(false);
  });

  it("given Electric-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Electric type takes sandstorm damage
    expect(isGen7WeatherImmune(["electric"], "sand")).toBe(false);
  });

  // --- Hail type immunity ---

  it("given Ice-type in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Ice types are immune to hail damage
    expect(isGen7WeatherImmune(["ice"], "hail")).toBe(true);
  });

  it("given Normal-type in hail, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes hail damage
    expect(isGen7WeatherImmune(["normal"], "hail")).toBe(false);
  });

  it("given Fire-type in hail, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Fire type takes hail damage
    expect(isGen7WeatherImmune(["fire"], "hail")).toBe(false);
  });

  // --- Ability immunity ---

  it("given pokemon with Magic Guard in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen7WeatherImmune(["normal"], "sand", "magic-guard")).toBe(true);
  });

  it("given pokemon with Magic Guard in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen7WeatherImmune(["normal"], "hail", "magic-guard")).toBe(true);
  });

  it("given pokemon with Overcoat in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage
    expect(isGen7WeatherImmune(["normal"], "sand", "overcoat")).toBe(true);
  });

  it("given pokemon with Overcoat in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage
    expect(isGen7WeatherImmune(["normal"], "hail", "overcoat")).toBe(true);
  });

  it("given pokemon with Sand Rush in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Sand Rush: "immune to sandstorm damage"
    expect(isGen7WeatherImmune(["normal"], "sand", "sand-rush")).toBe(true);
  });

  it("given pokemon with Sand Force in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Sand Force: "immune to sandstorm damage"
    expect(isGen7WeatherImmune(["normal"], "sand", "sand-force")).toBe(true);
  });

  it("given pokemon with Sand Veil in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Sand Veil: "immune to sandstorm damage"
    expect(isGen7WeatherImmune(["normal"], "sand", "sand-veil")).toBe(true);
  });

  it("given pokemon with Ice Body in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Ice Body: "unaffected by hail"
    expect(isGen7WeatherImmune(["normal"], "hail", "ice-body")).toBe(true);
  });

  it("given pokemon with Snow Cloak in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Snow Cloak: "immune to hail damage"
    expect(isGen7WeatherImmune(["normal"], "hail", "snow-cloak")).toBe(true);
  });

  // --- Gen 7 new: Slush Rush hail immunity ---

  it("given pokemon with Slush Rush in hail, when checking immunity, then is immune (Gen 7 new)", () => {
    // Source: Showdown data/abilities.ts -- slushrush: onImmunity for hail
    // Source: Bulbapedia -- Slush Rush: "is not damaged by hail"
    expect(isGen7WeatherImmune(["normal"], "hail", "slush-rush")).toBe(true);
  });

  // --- Safety Goggles ---

  it("given pokemon with Safety Goggles in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Safety Goggles: "holder is unaffected by weather damage"
    expect(isGen7WeatherImmune(["normal"], "sand", undefined, "safety-goggles")).toBe(true);
  });

  it("given pokemon with Safety Goggles in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Safety Goggles: "holder is unaffected by weather damage"
    expect(isGen7WeatherImmune(["normal"], "hail", undefined, "safety-goggles")).toBe(true);
  });

  // --- Rain/Sun have no chip ---

  it("given any pokemon in rain, when checking immunity, then returns false (no chip concept)", () => {
    // Source: Bulbapedia -- Rain has no chip damage
    expect(isGen7WeatherImmune(["normal"], "rain")).toBe(false);
  });

  it("given any pokemon in sun, when checking immunity, then returns false (no chip concept)", () => {
    // Source: Bulbapedia -- Sun has no chip damage
    expect(isGen7WeatherImmune(["normal"], "sun")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Weather Chip Damage Tests
// ---------------------------------------------------------------------------

describe("Gen7 applyGen7WeatherEffects", () => {
  it("given sandstorm with a Fire-type, when applying weather, then deals 1/16 max HP", () => {
    // Source: Showdown data/conditions.ts -- sandstorm damage = floor(maxHP/16)
    // Source: Bulbapedia -- Sandstorm: "1/16 of their maximum HP"
    // maxHp=200 -> floor(200/16) = 12
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 200, nickname: "Flareon" });
    const state = makeState("sand", 5, [makeSide(mon), makeSide(makeActivePokemon({}), 1)]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(2);
    // First result is the Fire-type
    expect(results[0]!.damage).toBe(12);
    expect(results[0]!.message).toBe("Flareon is buffeted by the sandstorm!");
  });

  it("given sandstorm with a Rock-type, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Rock types are immune to sandstorm damage
    const mon = makeActivePokemon({ types: ["rock"], maxHp: 200, nickname: "Golem" });
    const side2 = makeSide(makeActivePokemon({ types: ["rock"], nickname: "Onix" }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sandstorm with Ground-type, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Ground types are immune to sandstorm damage
    const mon = makeActivePokemon({ types: ["ground"], maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["ground"] }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sandstorm with Steel-type, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Steel types are immune to sandstorm damage
    const mon = makeActivePokemon({ types: ["steel"], maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["steel"] }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sandstorm with Magic Guard, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const mon = makeActivePokemon({ types: ["normal"], ability: "magic-guard", maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["normal"], ability: "magic-guard" }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sandstorm with Overcoat, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage
    const mon = makeActivePokemon({ types: ["normal"], ability: "overcoat", maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["normal"], ability: "overcoat" }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sandstorm with Safety Goggles, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Safety Goggles blocks weather damage
    const mon = makeActivePokemon({
      types: ["normal"],
      maxHp: 200,
      heldItem: "safety-goggles",
    });
    const side2 = makeSide(makeActivePokemon({ types: ["normal"], heldItem: "safety-goggles" }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given hail with a Fire-type, when applying weather, then deals 1/16 max HP", () => {
    // Source: Showdown -- hail damage = floor(maxHP/16)
    // Source: Bulbapedia -- Hail: "1/16 of their maximum HP"
    // maxHp=160 -> floor(160/16) = 10
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 160, nickname: "Arcanine" });
    const side2 = makeSide(makeActivePokemon({ types: ["ice"], nickname: "Glaceon" }), 1);
    const state = makeState("hail", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    // Only Arcanine takes damage (Glaceon is Ice-type, immune)
    expect(results).toHaveLength(1);
    expect(results[0]!.damage).toBe(10);
    expect(results[0]!.message).toBe("Arcanine is pelted by hail!");
  });

  it("given hail with an Ice-type, when applying weather, then no chip damage", () => {
    // Source: Bulbapedia -- Ice types are immune to hail damage
    const mon = makeActivePokemon({ types: ["ice"], maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);
    const state = makeState("hail", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given rain, when applying weather, then no chip damage to anyone", () => {
    // Source: Bulbapedia -- Rain has no chip damage
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["water"] }), 1);
    const state = makeState("rain", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sun, when applying weather, then no chip damage to anyone", () => {
    // Source: Bulbapedia -- Sun has no chip damage
    const mon = makeActivePokemon({ types: ["grass"], maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["fire"] }), 1);
    const state = makeState("sun", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given no weather, when applying weather, then returns empty array", () => {
    // No weather set
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const side2 = makeSide(makeActivePokemon({ types: ["normal"] }), 1);
    const state = makeState(null, 0, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(0);
  });

  it("given sandstorm with different max HP, when applying weather, then damage is floor(maxHp/16)", () => {
    // Source: Showdown -- floor division, min 1
    // maxHp=100 -> floor(100/16) = 6
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 100, nickname: "Litleo" });
    const side2 = makeSide(makeActivePokemon({ types: ["steel"] }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(1);
    expect(results[0]!.damage).toBe(6);
  });

  it("given sandstorm with very low max HP, when applying weather, then minimum damage is 1", () => {
    // Source: Showdown -- Math.max(1, floor(maxHp/16))
    // maxHp=10 -> floor(10/16) = 0 -> clamped to 1
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 10, nickname: "Tiny" });
    const side2 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
    const state = makeState("sand", 5, [makeSide(mon), side2]);
    const results = applyGen7WeatherEffects(state);
    expect(results).toHaveLength(1);
    expect(results[0]!.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Constant Tests
// ---------------------------------------------------------------------------

describe("Gen7 weather constants", () => {
  it("sandstorm immune types are Rock, Ground, Steel", () => {
    // Source: Bulbapedia -- Sandstorm immunity
    expect(SANDSTORM_IMMUNE_TYPES).toEqual(["rock", "ground", "steel"]);
  });

  it("hail immune types are Ice", () => {
    // Source: Bulbapedia -- Hail immunity
    expect(HAIL_IMMUNE_TYPES).toEqual(["ice"]);
  });
});
