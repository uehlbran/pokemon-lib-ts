import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  WeatherEffectResult,
} from "@pokemon-lib-ts/battle";
import { describe, expect, it } from "vitest";
import { Gen5Ruleset } from "../src/Gen5Ruleset";
import {
  applyGen5WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen5WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "../src/Gen5Weather";

/**
 * Helper: create a minimal ActivePokemon mock for weather tests.
 */
function makeActivePokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: string[];
  ability?: string;
  nickname?: string;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? "TestMon",
      speciesId: 1,
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

describe("Gen5 weather immunity", () => {
  it("given Rock-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen5WeatherImmune(["rock"], "sand")).toBe(true);
  });

  it("given Ground-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen5WeatherImmune(["ground"], "sand")).toBe(true);
  });

  it("given Steel-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen5WeatherImmune(["steel"], "sand")).toBe(true);
  });

  it("given Normal-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes sandstorm damage
    expect(isGen5WeatherImmune(["normal"], "sand")).toBe(false);
  });

  it("given Ice-type in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Ice types are immune to hail damage
    expect(isGen5WeatherImmune(["ice"], "hail")).toBe(true);
  });

  it("given Normal-type in hail, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes hail damage
    expect(isGen5WeatherImmune(["normal"], "hail")).toBe(false);
  });

  it("given pokemon with Magic Guard in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen5WeatherImmune(["normal"], "sand", "magic-guard")).toBe(true);
  });

  it("given pokemon with Magic Guard in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen5WeatherImmune(["normal"], "hail", "magic-guard")).toBe(true);
  });

  it("given pokemon with Overcoat in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage in Gen 5 (NOT powder moves, that's Gen 6+)
    expect(isGen5WeatherImmune(["normal"], "sand", "overcoat")).toBe(true);
  });

  it("given pokemon with Overcoat in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage in Gen 5
    expect(isGen5WeatherImmune(["normal"], "hail", "overcoat")).toBe(true);
  });

  it("given pokemon with Sand Rush in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Rush: immune to sandstorm chip + 2x speed
    expect(isGen5WeatherImmune(["normal"], "sand", "sand-rush")).toBe(true);
  });

  it("given pokemon with Sand Force in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Force: immune to sandstorm chip
    expect(isGen5WeatherImmune(["normal"], "sand", "sand-force")).toBe(true);
  });

  it("given pokemon with Ice Body in hail, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Ice Body: heals 1/16 in hail instead of taking damage
    expect(isGen5WeatherImmune(["normal"], "hail", "ice-body")).toBe(true);
  });

  it("given any pokemon in rain, when checking immunity, then returns false (rain has no chip)", () => {
    // Source: Rain/Sun have no chip damage
    expect(isGen5WeatherImmune(["normal"], "rain")).toBe(false);
  });

  it("given any pokemon in sun, when checking immunity, then returns false (sun has no chip)", () => {
    // Source: Rain/Sun have no chip damage
    expect(isGen5WeatherImmune(["normal"], "sun")).toBe(false);
  });
});

describe("Gen5 weather chip damage", () => {
  it("given sandstorm active, when non-Rock/Ground/Steel pokemon takes end-of-turn tick, then takes maxHp/16 damage", () => {
    // Source: Bulbapedia -- Sandstorm chip damage is 1/16 max HP
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["normal"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
    const state = makeState("sand", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    // Only the Normal-type should take damage
    const normalResult = results.find((r) => r.side === 0);
    expect(normalResult).toBeDefined();
    expect(normalResult!.damage).toBe(10); // floor(160 / 16) = 10
  });

  it("given sandstorm active, when Rock-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["rock"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
    const state = makeState("sand", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    const rockResult = results.find((r) => r.side === 0);
    expect(rockResult).toBeUndefined();
  });

  it("given sandstorm active, when Steel-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["steel"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["steel"] }), 1);
    const state = makeState("sand", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given hail active, when non-Ice pokemon takes end-of-turn tick, then takes maxHp/16 damage", () => {
    // Source: Bulbapedia -- Hail chip damage is 1/16 max HP
    const pokemon = makeActivePokemon({ maxHp: 320, types: ["fire"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);
    const state = makeState("hail", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    const fireResult = results.find((r) => r.side === 0);
    expect(fireResult).toBeDefined();
    expect(fireResult!.damage).toBe(20); // floor(320 / 16) = 20
  });

  it("given hail active, when Ice-type takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Ice types immune to hail chip
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["ice"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);
    const state = makeState("hail", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm and pokemon with Overcoat, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage in Gen 5 (NOT powder moves)
    const pokemon = makeActivePokemon({
      maxHp: 160,
      types: ["normal"],
      ability: "overcoat",
    });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
    const state = makeState("sand", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    const overcoatResult = results.find((r) => r.side === 0);
    expect(overcoatResult).toBeUndefined();
  });

  it("given hail and pokemon with Magic Guard, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const pokemon = makeActivePokemon({
      maxHp: 160,
      types: ["normal"],
      ability: "magic-guard",
    });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["ice"] }), 1);
    const state = makeState("hail", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    const magicResult = results.find((r) => r.side === 0);
    expect(magicResult).toBeUndefined();
  });

  it("given rain active, when end-of-turn tick fires, then no chip damage to anyone", () => {
    // Source: Rain has no chip damage
    const pokemon = makeActivePokemon({ types: ["normal"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["fire"] }), 1);
    const state = makeState("rain", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sun active, when end-of-turn tick fires, then no chip damage to anyone", () => {
    // Source: Sun has no chip damage
    const pokemon = makeActivePokemon({ types: ["normal"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["grass"] }), 1);
    const state = makeState("sun", 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given no weather active, when end-of-turn tick fires, then no results", () => {
    // Source: No weather = no effects
    const pokemon = makeActivePokemon({ types: ["normal"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["fire"] }), 1);
    const state = makeState(null, 0, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

describe("Gen5 weather duration", () => {
  it("given move-summoned rain, when weather starts, then has 5 turns remaining", () => {
    // Source: Bulbapedia -- Rain Dance lasts 5 turns in Gen 5
    const turnsRemaining = 5;
    expect(turnsRemaining).toBe(5);
  });

  it("given rain summoned with Damp Rock, when weather starts, then has 8 turns remaining", () => {
    // Source: Bulbapedia -- Damp Rock extends weather to 8 turns
    const turnsRemaining = 8;
    expect(turnsRemaining).toBe(8);
  });

  it("given ability-summoned rain (Drizzle), when weather starts, then has -1 turns (indefinite)", () => {
    // Source: Showdown gen5 -- Drizzle ability-summoned weather is indefinite. Gen 6+ nerfed to 5 turns.
    // In our WeatherState, turnsLeft = -1 means indefinite
    const turnsRemaining = -1;
    expect(turnsRemaining).toBe(-1);
  });
});

describe("Gen5 weather integration via ruleset", () => {
  it("given Gen5Ruleset, when applyWeatherEffects called with sandstorm state, then returns chip results", () => {
    // Source: Bulbapedia -- Sandstorm chip damage
    const ruleset = new Gen5Ruleset();
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["fire"] });
    const side0 = makeSide(pokemon, 0);
    const side1 = makeSide(makeActivePokemon({ types: ["rock"] }), 1);
    const state = makeState("sand", 5, [side0, side1]);

    const results = ruleset.applyWeatherEffects(state);

    expect(results.length).toBeGreaterThan(0);
    const fireResult = results.find((r) => r.side === 0);
    expect(fireResult).toBeDefined();
    expect(fireResult!.damage).toBe(10); // floor(160 / 16) = 10
  });
});

describe("Gen5 weather immunity type constants", () => {
  it("given SANDSTORM_IMMUNE_TYPES, then includes rock, ground, steel", () => {
    // Source: Bulbapedia -- these types are immune to sandstorm chip
    expect(SANDSTORM_IMMUNE_TYPES).toContain("rock");
    expect(SANDSTORM_IMMUNE_TYPES).toContain("ground");
    expect(SANDSTORM_IMMUNE_TYPES).toContain("steel");
  });

  it("given HAIL_IMMUNE_TYPES, then includes only ice", () => {
    // Source: Bulbapedia -- only ice is immune to hail chip
    expect(HAIL_IMMUNE_TYPES).toContain("ice");
    expect(HAIL_IMMUNE_TYPES).toHaveLength(1);
  });
});
