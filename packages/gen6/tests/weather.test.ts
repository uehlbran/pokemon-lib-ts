import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { WeatherType } from "@pokemon-lib-ts/core";
import { CORE_ABILITY_IDS, CORE_TYPE_IDS, CORE_WEATHER_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN6_ABILITY_IDS, GEN6_SPECIES_IDS } from "../src";
import { Gen6Ruleset } from "../src/Gen6Ruleset";
import {
  ABILITY_WEATHER_TURNS,
  applyGen6WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen6WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
  WEATHER_ROCK_EXTENSION,
} from "../src/Gen6Weather";

/**
 * Helper: create a minimal ActivePokemon mock for weather tests.
 */
const A = GEN6_ABILITY_IDS;
const SP = GEN6_SPECIES_IDS;
const C = CORE_ABILITY_IDS;
const T = CORE_TYPE_IDS;
const W = CORE_WEATHER_IDS;

function createOnFieldPokemon(overrides: {
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
      speciesId: SP.bulbasaur,
    },
    ability: overrides.ability ?? A.blaze,
    types: overrides.types ?? [T.normal],
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
  weatherType: WeatherType | null,
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

// ==================== Duration Constants ====================

describe("Gen6 weather duration constants", () => {
  it("given ABILITY_WEATHER_TURNS, then equals 5 (Gen 6 nerf from permanent)", () => {
    // Source: Bulbapedia -- "Weather" Gen 6 section: "weather-inducing Abilities
    //   now only cause the weather to last for five turns"
    // Source: Showdown sim/battle.ts -- Gen 6 ability weather duration = 5
    expect(ABILITY_WEATHER_TURNS).toBe(5);
  });

  it("given WEATHER_ROCK_EXTENSION, then equals 3 (total 8 with rock)", () => {
    // Source: Bulbapedia -- Weather rocks extend duration by 3 turns (5 -> 8 total)
    // Source: Showdown sim/battle.ts -- weather rock adds 3 turns
    expect(WEATHER_ROCK_EXTENSION).toBe(3);
  });

  it("given ABILITY_WEATHER_TURNS + WEATHER_ROCK_EXTENSION, then equals 8", () => {
    // Source: Bulbapedia -- "Weather rocks extend the duration to 8 turns"
    expect(ABILITY_WEATHER_TURNS + WEATHER_ROCK_EXTENSION).toBe(8);
  });
});

// ==================== Type Immunity Constants ====================

describe("Gen6 weather immunity type constants", () => {
  it("given SANDSTORM_IMMUNE_TYPES, then includes rock, ground, steel", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm chip damage
    expect(SANDSTORM_IMMUNE_TYPES).toEqual([T.rock, T.ground, T.steel]);
  });

  it("given HAIL_IMMUNE_TYPES, then includes only ice", () => {
    // Source: Bulbapedia -- only Ice type is immune to hail chip damage
    expect(HAIL_IMMUNE_TYPES).toEqual([T.ice]);
  });
});

// ==================== Type-Based Immunity ====================

describe("Gen6 weather immunity (type-based)", () => {
  it("given Rock-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen6WeatherImmune([T.rock], W.sand)).toBe(true);
  });

  it("given Ground-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen6WeatherImmune([T.ground], W.sand)).toBe(true);
  });

  it("given Steel-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen6WeatherImmune([T.steel], W.sand)).toBe(true);
  });

  it("given Normal-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes sandstorm damage
    expect(isGen6WeatherImmune([T.normal], W.sand)).toBe(false);
  });

  it("given Fire-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Fire type is not listed among sandstorm-immune types
    expect(isGen6WeatherImmune([T.fire], W.sand)).toBe(false);
  });

  it("given dual Rock/Fire type in sandstorm, when checking immunity, then is immune (Rock grants it)", () => {
    // Source: Bulbapedia -- any immune type grants immunity even if other type is not immune
    expect(isGen6WeatherImmune([T.rock, T.fire], W.sand)).toBe(true);
  });

  it("given Ice-type in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Ice types are immune to hail damage
    expect(isGen6WeatherImmune([T.ice], W.hail)).toBe(true);
  });

  it("given Normal-type in hail, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes hail damage
    expect(isGen6WeatherImmune([T.normal], W.hail)).toBe(false);
  });

  it("given dual Ice/Water type in hail, when checking immunity, then is immune (Ice grants it)", () => {
    // Source: Bulbapedia -- any immune type in a dual type grants hail immunity
    expect(isGen6WeatherImmune([T.ice, T.water], W.hail)).toBe(true);
  });
});

// ==================== Ability-Based Immunity ====================

describe("Gen6 weather immunity (ability-based)", () => {
  it("given pokemon with Magic Guard in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen6WeatherImmune([T.normal], W.sand, A.magicGuard)).toBe(true);
  });

  it("given pokemon with Magic Guard in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen6WeatherImmune([T.normal], W.hail, A.magicGuard)).toBe(true);
  });

  it("given pokemon with Overcoat in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage (Gen 5+)
    expect(isGen6WeatherImmune([T.normal], W.sand, A.overcoat)).toBe(true);
  });

  it("given pokemon with Overcoat in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage (Gen 5+)
    expect(isGen6WeatherImmune([T.normal], W.hail, A.overcoat)).toBe(true);
  });

  it("given pokemon with Sand Rush in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Rush: immune to sandstorm chip + 2x speed
    expect(isGen6WeatherImmune([T.normal], W.sand, A.sandRush)).toBe(true);
  });

  it("given pokemon with Sand Force in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Force: immune to sandstorm chip
    expect(isGen6WeatherImmune([T.normal], W.sand, A.sandForce)).toBe(true);
  });

  it("given pokemon with Sand Veil in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Veil: immune to sandstorm chip + evasion boost
    expect(isGen6WeatherImmune([T.normal], W.sand, A.sandVeil)).toBe(true);
  });

  it("given pokemon with Ice Body in hail, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Ice Body: heals 1/16 in hail instead of taking damage
    expect(isGen6WeatherImmune([T.normal], W.hail, A.iceBody)).toBe(true);
  });

  it("given pokemon with Snow Cloak in hail, when checking immunity, then is immune to chip", () => {
    // Source: Showdown data/abilities.ts -- snowcloak.onImmunity returns false for hail
    //   (meaning immune in Showdown's event system)
    // Source: Bulbapedia -- Snow Cloak: "immune to hail damage"
    expect(isGen6WeatherImmune([T.normal], W.hail, A.snowCloak)).toBe(true);
  });
});

// ==================== Rain/Sun No-Chip ====================

describe("Gen6 weather immunity (rain/sun have no chip)", () => {
  it("given any pokemon in rain, when checking immunity, then returns false (no chip to be immune to)", () => {
    // Source: Rain has no chip damage -- immunity concept does not apply
    expect(isGen6WeatherImmune([T.normal], W.rain)).toBe(false);
  });

  it("given any pokemon in sun, when checking immunity, then returns false (no chip to be immune to)", () => {
    // Source: Sun has no chip damage -- immunity concept does not apply
    expect(isGen6WeatherImmune([T.normal], W.sun)).toBe(false);
  });
});

// ==================== Sandstorm Chip Damage ====================

describe("Gen6 sandstorm chip damage", () => {
  it("given sandstorm active, when Normal-type with 160 HP takes end-of-turn tick, then takes 10 damage (floor(160/16))", () => {
    // Source: Bulbapedia -- Sandstorm chip damage is 1/16 max HP
    // Derivation: floor(160 / 16) = 10
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const normalResult = results.find((r) => r.side === 0);
    expect(normalResult).toBeDefined();
    expect(normalResult!.damage).toBe(10);
  });

  it("given sandstorm active, when Fire-type with 320 HP takes end-of-turn tick, then takes 20 damage (floor(320/16))", () => {
    // Source: Bulbapedia -- Sandstorm chip damage is 1/16 max HP
    // Derivation: floor(320 / 16) = 20
    const pokemon = createOnFieldPokemon({ maxHp: 320, types: [T.fire] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const fireResult = results.find((r) => r.side === 0);
    expect(fireResult).toBeDefined();
    expect(fireResult!.damage).toBe(20);
  });

  it("given sandstorm active, when Rock-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.rock] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const rockResult = results.find((r) => r.side === 0);
    expect(rockResult).toBeUndefined();
  });

  it("given sandstorm active, when Steel-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.steel] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.steel] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm active, when Ground-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.ground] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ground] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ==================== Hail Chip Damage ====================

describe("Gen6 hail chip damage", () => {
  it("given hail active, when Fire-type with 320 HP takes end-of-turn tick, then takes 20 damage (floor(320/16))", () => {
    // Source: Bulbapedia -- Hail chip damage is 1/16 max HP
    // Derivation: floor(320 / 16) = 20
    const pokemon = createOnFieldPokemon({ maxHp: 320, types: [T.fire] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const fireResult = results.find((r) => r.side === 0);
    expect(fireResult).toBeDefined();
    expect(fireResult!.damage).toBe(20);
  });

  it("given hail active, when Normal-type with 160 HP takes end-of-turn tick, then takes 10 damage (floor(160/16))", () => {
    // Source: Bulbapedia -- Hail chip damage is 1/16 max HP
    // Derivation: floor(160 / 16) = 10
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const normalResult = results.find((r) => r.side === 0);
    expect(normalResult).toBeDefined();
    expect(normalResult!.damage).toBe(10);
  });

  it("given hail active, when Ice-type takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Ice types immune to hail chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.ice] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ==================== Ability Immunity in Chip Damage ====================

describe("Gen6 weather chip damage with ability immunities", () => {
  it("given sandstorm and pokemon with Overcoat, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [T.normal],
      ability: A.overcoat,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const overcoatResult = results.find((r) => r.side === 0);
    expect(overcoatResult).toBeUndefined();
  });

  it("given hail and pokemon with Magic Guard, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [T.normal],
      ability: A.magicGuard,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const magicResult = results.find((r) => r.side === 0);
    expect(magicResult).toBeUndefined();
  });

  it("given sandstorm and pokemon with Sand Veil, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Sand Veil: "immune to sandstorm damage"
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [T.normal],
      ability: A.sandVeil,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const sandVeilResult = results.find((r) => r.side === 0);
    expect(sandVeilResult).toBeUndefined();
  });

  it("given hail and pokemon with Snow Cloak, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Snow Cloak: "immune to hail damage"
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [T.normal],
      ability: A.snowCloak,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const snowCloakResult = results.find((r) => r.side === 0);
    expect(snowCloakResult).toBeUndefined();
  });
});

// ==================== Minimum Damage ====================

describe("Gen6 weather minimum chip damage", () => {
  it("given sandstorm and non-immune pokemon with 1 HP max, when chip applied, then takes 1 damage (minimum)", () => {
    // Source: Bulbapedia -- weather damage has a minimum of 1 HP
    // Derivation: floor(1 / 16) = 0, but minimum is 1
    const pokemon = createOnFieldPokemon({ maxHp: 1, types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const result = results.find((r) => r.side === 0);
    expect(result).toBeDefined();
    expect(result!.damage).toBe(1);
  });

  it("given hail and non-immune pokemon with 15 HP max, when chip applied, then takes 1 damage (floor(15/16) = 0, min 1)", () => {
    // Source: Bulbapedia -- weather damage has a minimum of 1 HP
    // Derivation: floor(15 / 16) = 0, but minimum is 1
    const pokemon = createOnFieldPokemon({ maxHp: 15, types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    const result = results.find((r) => r.side === 0);
    expect(result).toBeDefined();
    expect(result!.damage).toBe(1);
  });
});

// ==================== No Weather / Rain / Sun ====================

describe("Gen6 weather chip damage -- no chip for rain/sun/no weather", () => {
  it("given rain active, when end-of-turn tick fires, then no chip damage to anyone", () => {
    // Source: Bulbapedia -- Rain has no chip damage
    const pokemon = createOnFieldPokemon({ types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.fire] }), 1);
    const state = createBattleState(W.rain, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sun active, when end-of-turn tick fires, then no chip damage to anyone", () => {
    // Source: Bulbapedia -- Sun has no chip damage
    const pokemon = createOnFieldPokemon({ types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.grass] }), 1);
    const state = createBattleState(W.sun, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given no weather active, when end-of-turn tick fires, then no results", () => {
    // Source: No weather = no effects
    const pokemon = createOnFieldPokemon({ types: [T.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.fire] }), 1);
    const state = createBattleState(null, 0, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ==================== Weather Duration Shape ====================

describe("Gen6 weather duration -- BattleState shape", () => {
  // Weather duration values are stored in BattleState.weather.turnsLeft.
  // In Gen 6, ability-summoned: 5 turns. With weather rock: 8 turns.
  // Duration is set by the BattleEngine when weather starts, not by this function.
  // Source: Bulbapedia -- Weather conditions page, Gen 6 section
  // Source: specs/battle/07-gen6.md -- Section 6: Weather Nerfs

  it("given a BattleState with sand turnsLeft=5 (ability-summoned), when applyWeatherEffects called, then non-immune types take chip damage", () => {
    // Source: Bulbapedia -- ability-summoned weather lasts 5 turns in Gen 6
    const ruleset = new Gen6Ruleset();
    const state = createBattleState(W.sand, 5, [
      createBattleSide(createOnFieldPokemon({ maxHp: 160, types: [T.fire] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1),
    ]);
    const results = ruleset.applyWeatherEffects(state);
    expect(results).toHaveLength(1); // only Fire takes chip; Rock is immune
    expect(results[0].damage).toBe(10); // floor(160/16)=10
  });

  it("given a BattleState with sand turnsLeft=8 (weather rock), when applyWeatherEffects called, then chip damage still applies", () => {
    // Source: Bulbapedia -- Smooth Rock extends sandstorm to 8 turns
    const ruleset = new Gen6Ruleset();
    const state = createBattleState(W.sand, 8, [
      createBattleSide(createOnFieldPokemon({ maxHp: 160, types: [T.fire] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1),
    ]);
    const results = ruleset.applyWeatherEffects(state);
    expect(results).toHaveLength(1);
    expect(results[0].damage).toBe(10); // floor(160/16)=10
  });

  it("given a BattleState with rain turnsLeft=5, when applyWeatherEffects called, then no chip damage (rain has none)", () => {
    // Source: Bulbapedia -- Rain does not deal chip damage
    const ruleset = new Gen6Ruleset();
    const state = createBattleState(W.rain, 5, [
      createBattleSide(createOnFieldPokemon({ types: [T.fire] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [T.water] }), 1),
    ]);
    const results = ruleset.applyWeatherEffects(state);
    expect(results).toHaveLength(0);
  });
});

// ==================== Messages ====================

describe("Gen6 weather damage messages", () => {
  it("given sandstorm, when chip damage dealt, then message says 'buffeted by the sandstorm'", () => {
    // Source: Showdown -- sandstorm damage message format
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [T.normal],
      nickname: "Chansey",
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results[0].message).toBe("Chansey is buffeted by the sandstorm!");
  });

  it("given hail, when chip damage dealt, then message says 'pelted by hail'", () => {
    // Source: Showdown -- hail damage message format
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [T.normal],
      nickname: "Blissey",
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results[0].message).toBe("Blissey is pelted by hail!");
  });
});

// ==================== Integration via Gen6Ruleset ====================

describe("Gen6 weather integration via ruleset", () => {
  it("given Gen6Ruleset, when applyWeatherEffects called with sandstorm state, then returns chip results", () => {
    // Source: Bulbapedia -- Sandstorm chip damage
    const ruleset = new Gen6Ruleset();
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [T.fire] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.rock] }), 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = ruleset.applyWeatherEffects(state);

    expect(results.length).toBe(1);
    const fireResult = results.find((r) => r.side === 0);
    expect(fireResult).toBeDefined();
    expect(fireResult!.damage).toBe(10); // floor(160 / 16) = 10
  });

  it("given Gen6Ruleset, when applyWeatherEffects called with hail state, then returns chip results for non-Ice", () => {
    // Source: Bulbapedia -- Hail chip damage
    const ruleset = new Gen6Ruleset();
    const pokemon = createOnFieldPokemon({ maxHp: 320, types: [T.grass] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [T.ice] }), 1);
    const state = createBattleState(W.hail, 5, [side0, side1]);

    const results = ruleset.applyWeatherEffects(state);

    expect(results.length).toBe(1);
    expect(results[0].damage).toBe(20); // floor(320 / 16) = 20
  });

  it("given Gen6Ruleset, when applyWeatherEffects called with no weather, then returns empty", () => {
    // Source: No weather = no effects
    const ruleset = new Gen6Ruleset();
    const state = createBattleState(null, 0, [
      createBattleSide(createOnFieldPokemon({ types: [T.normal] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [T.fire] }), 1),
    ]);

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ==================== Both Sides Take Damage ====================

describe("Gen6 weather affects both sides", () => {
  it("given sandstorm, when both sides have non-immune pokemon, then both take chip damage", () => {
    // Source: Bulbapedia -- sandstorm damages all non-immune Pokemon on both sides
    const pokemon0 = createOnFieldPokemon({
      maxHp: 160,
      types: [T.fire],
      nickname: "Arcanine",
    });
    const pokemon1 = createOnFieldPokemon({
      maxHp: 200,
      types: [T.water],
      nickname: "Vaporeon",
    });
    const side0 = createBattleSide(pokemon0, 0);
    const side1 = createBattleSide(pokemon1, 1);
    const state = createBattleState(W.sand, 5, [side0, side1]);

    const results = applyGen6WeatherEffects(state);

    expect(results).toHaveLength(2);
    const fireResult = results.find((r) => r.side === 0);
    const waterResult = results.find((r) => r.side === 1);
    expect(fireResult!.damage).toBe(10); // floor(160/16) = 10
    expect(waterResult!.damage).toBe(12); // floor(200/16) = 12
  });
});
