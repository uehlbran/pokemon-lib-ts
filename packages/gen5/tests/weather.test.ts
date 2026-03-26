import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  type PokemonType,
  type WeatherType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN5_ABILITY_IDS, GEN5_SPECIES_IDS } from "../src";
import { Gen5Ruleset } from "../src/Gen5Ruleset";
import {
  applyGen5WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen5WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "../src/Gen5Weather";

const ABILITIES = GEN5_ABILITY_IDS;
const SPECIES = GEN5_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const DEFAULT_POKEMON_NAME = "TestMon";
const WEATHER_SOURCES = {
  rain: ABILITIES.drizzle,
  sun: ABILITIES.drought,
  sand: ABILITIES.sandStream,
  hail: ABILITIES.snowWarning,
} as const;

function getExpectedWeatherChip(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 16));
}

/**
 * Helper: create a minimal ActivePokemon mock for weather tests.
 */
function createOnFieldPokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  nickname?: string;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? DEFAULT_POKEMON_NAME,
      speciesId: SPECIES.bulbasaur,
    },
    ability: overrides.ability ?? ABILITIES.blaze,
    types: overrides.types ?? [TYPES.normal],
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
    weather: weatherType
      ? { type: weatherType, turnsLeft, source: WEATHER_SOURCES[weatherType] }
      : null,
    sides,
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
  } as unknown as BattleState;
}

describe("Gen5 weather immunity", () => {
  it("given Rock-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen5WeatherImmune([TYPES.rock], WEATHER.sand)).toBe(true);
  });

  it("given Ground-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen5WeatherImmune([TYPES.ground], WEATHER.sand)).toBe(true);
  });

  it("given Steel-type in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel are immune to sandstorm damage
    expect(isGen5WeatherImmune([TYPES.steel], WEATHER.sand)).toBe(true);
  });

  it("given Normal-type in sandstorm, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes sandstorm damage
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.sand)).toBe(false);
  });

  it("given Ice-type in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Ice types are immune to hail damage
    expect(isGen5WeatherImmune([TYPES.ice], WEATHER.hail)).toBe(true);
  });

  it("given Normal-type in hail, when checking immunity, then is NOT immune", () => {
    // Source: Bulbapedia -- Normal type takes hail damage
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.hail)).toBe(false);
  });

  it("given pokemon with Magic Guard in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.sand, ABILITIES.magicGuard)).toBe(true);
  });

  it("given pokemon with Magic Guard in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage including weather
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.hail, ABILITIES.magicGuard)).toBe(true);
  });

  it("given pokemon with Overcoat in sandstorm, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage in Gen 5 (NOT powder moves, that's Gen 6+)
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.sand, ABILITIES.overcoat)).toBe(true);
  });

  it("given pokemon with Overcoat in hail, when checking immunity, then is immune", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage in Gen 5
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.hail, ABILITIES.overcoat)).toBe(true);
  });

  it("given pokemon with Sand Rush in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Rush: immune to sandstorm chip + 2x speed
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.sand, ABILITIES.sandRush)).toBe(true);
  });

  it("given pokemon with Sand Force in sandstorm, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Sand Force: immune to sandstorm chip
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.sand, ABILITIES.sandForce)).toBe(true);
  });

  it("given pokemon with Ice Body in hail, when checking immunity, then is immune to chip", () => {
    // Source: Bulbapedia -- Ice Body: heals 1/16 in hail instead of taking damage
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.hail, ABILITIES.iceBody)).toBe(true);
  });

  it("given any pokemon in rain, when checking immunity, then returns false (rain has no chip)", () => {
    // Source: Rain/Sun have no chip damage
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.rain)).toBe(false);
  });

  it("given any pokemon in sun, when checking immunity, then returns false (sun has no chip)", () => {
    // Source: Rain/Sun have no chip damage
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.sun)).toBe(false);
  });
});

describe("Gen5 weather chip damage", () => {
  it("given sandstorm active, when non-Rock/Ground/Steel pokemon takes end-of-turn tick, then takes maxHp/16 damage", () => {
    // Source: Bulbapedia -- Sandstorm chip damage is 1/16 max HP
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [TYPES.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.rock] }), 1);
    const state = createBattleState(WEATHER.sand, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([
      {
        side: 0,
        pokemon: DEFAULT_POKEMON_NAME,
        damage: getExpectedWeatherChip(160),
        message: `${DEFAULT_POKEMON_NAME} is buffeted by the sandstorm!`,
      },
    ]);
  });

  it("given sandstorm active, when Rock-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [TYPES.rock] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.rock] }), 1);
    const state = createBattleState(WEATHER.sand, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([]);
  });

  it("given sandstorm active, when Steel-type pokemon takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Rock, Ground, Steel immune to sandstorm chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [TYPES.steel] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.steel] }), 1);
    const state = createBattleState(WEATHER.sand, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([]);
  });

  it("given hail active, when non-Ice pokemon takes end-of-turn tick, then takes maxHp/16 damage", () => {
    // Source: Bulbapedia -- Hail chip damage is 1/16 max HP
    const pokemon = createOnFieldPokemon({ maxHp: 320, types: [TYPES.fire] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.ice] }), 1);
    const state = createBattleState(WEATHER.hail, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([
      {
        side: 0,
        pokemon: DEFAULT_POKEMON_NAME,
        damage: getExpectedWeatherChip(320),
        message: `${DEFAULT_POKEMON_NAME} is pelted by hail!`,
      },
    ]);
  });

  it("given hail active, when Ice-type takes end-of-turn tick, then takes no damage", () => {
    // Source: Bulbapedia -- Ice types immune to hail chip
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [TYPES.ice] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.ice] }), 1);
    const state = createBattleState(WEATHER.hail, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([]);
  });

  it("given sandstorm and pokemon with Overcoat, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Overcoat blocks weather damage in Gen 5 (NOT powder moves)
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [TYPES.normal],
      ability: ABILITIES.overcoat,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.rock] }), 1);
    const state = createBattleState(WEATHER.sand, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    const overcoatResult = results.find((r) => r.side === 0);
    expect(overcoatResult).toBeUndefined();
    expect(results).toEqual([]);
  });

  it("given hail and pokemon with Magic Guard, when end-of-turn tick fires, then takes no damage", () => {
    // Source: Bulbapedia -- Magic Guard prevents all indirect damage
    const pokemon = createOnFieldPokemon({
      maxHp: 160,
      types: [TYPES.normal],
      ability: ABILITIES.magicGuard,
    });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.ice] }), 1);
    const state = createBattleState(WEATHER.hail, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    const magicResult = results.find((r) => r.side === 0);
    expect(magicResult).toBeUndefined();
    expect(results).toEqual([]);
  });

  it("given rain active, when end-of-turn tick fires, then no chip damage to anyone", () => {
    // Source: Rain has no chip damage
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.fire] }), 1);
    const state = createBattleState(WEATHER.rain, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([]);
  });

  it("given sun active, when end-of-turn tick fires, then no chip damage to anyone", () => {
    // Source: Sun has no chip damage
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.grass] }), 1);
    const state = createBattleState(WEATHER.sun, 5, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([]);
  });

  it("given no weather active, when end-of-turn tick fires, then no results", () => {
    // Source: No weather = no effects
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.fire] }), 1);
    const state = createBattleState(null, 0, [side0, side1]);

    const results = applyGen5WeatherEffects(state);

    expect(results).toEqual([]);
  });
});

describe("Gen5 weather duration — BattleState shape", () => {
  // Weather duration values are stored in BattleState.weather.turnsLeft.
  // Move-summoned: 5 turns. Damp/Heat/Icy/Smooth Rock: 8 turns. Ability-summoned: -1 (indefinite).
  // These are set by the BattleEngine when the weather is started, not by Gen5Ruleset.
  // Source: Bulbapedia -- Weather conditions page, Gen 5 section
  // Source: Showdown gen5 -- Drizzle/Drought/Sandstream/Snowwarning set indefinite weather

  it("given a BattleState with rain turnsLeft=5, when applyWeatherEffects called, then no chip damage (rain has none)", () => {
    // Source: Bulbapedia -- Rain does not deal chip damage; confirms the state shape is valid
    const ruleset = new Gen5Ruleset();
    const state = createBattleState(WEATHER.rain, 5, [
      createBattleSide(createOnFieldPokemon({ types: [TYPES.fire] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [TYPES.water] }), 1),
    ]);
    const results = ruleset.applyWeatherEffects(state);
    // Rain never deals chip damage — 0 results regardless of turnsLeft
    expect(results).toEqual([]);
  });

  it("given a BattleState with sand turnsLeft=8 (Smooth Rock), when applyWeatherEffects called, then non-immune types take chip damage", () => {
    // Source: Bulbapedia -- Smooth Rock extends sandstorm to 8 turns; chip still applies each turn
    const ruleset = new Gen5Ruleset();
    const state = createBattleState(WEATHER.sand, 8, [
      createBattleSide(createOnFieldPokemon({ maxHp: 160, types: [TYPES.fire] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [TYPES.rock] }), 1),
    ]);
    const results = ruleset.applyWeatherEffects(state);
    expect(results).toEqual([
      {
        side: 0,
        pokemon: DEFAULT_POKEMON_NAME,
        damage: getExpectedWeatherChip(160),
        message: `${DEFAULT_POKEMON_NAME} is buffeted by the sandstorm!`,
      },
    ]);
  });

  it("given a BattleState with sand turnsLeft=-1 (Sandstream, indefinite), when applyWeatherEffects called, then chip damage still applies", () => {
    // Source: Showdown gen5 -- Sandstream sets indefinite weather (turnsLeft=-1 per our WeatherState shape)
    const ruleset = new Gen5Ruleset();
    const state = createBattleState(WEATHER.sand, -1, [
      createBattleSide(createOnFieldPokemon({ maxHp: 160, types: [TYPES.fire] }), 0),
      createBattleSide(createOnFieldPokemon({ types: [TYPES.ground] }), 1),
    ]);
    const results = ruleset.applyWeatherEffects(state);
    expect(results).toEqual([
      {
        side: 0,
        pokemon: DEFAULT_POKEMON_NAME,
        damage: getExpectedWeatherChip(160),
        message: `${DEFAULT_POKEMON_NAME} is buffeted by the sandstorm!`,
      },
    ]);
  });
});

describe("Gen5 weather integration via ruleset", () => {
  it("given Gen5Ruleset, when applyWeatherEffects called with sandstorm state, then returns chip results", () => {
    // Source: Bulbapedia -- Sandstorm chip damage
    const ruleset = new Gen5Ruleset();
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [TYPES.fire] });
    const side0 = createBattleSide(pokemon, 0);
    const side1 = createBattleSide(createOnFieldPokemon({ types: [TYPES.rock] }), 1);
    const state = createBattleState(WEATHER.sand, 5, [side0, side1]);

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toEqual([
      {
        side: 0,
        pokemon: DEFAULT_POKEMON_NAME,
        damage: getExpectedWeatherChip(160),
        message: `${DEFAULT_POKEMON_NAME} is buffeted by the sandstorm!`,
      },
    ]);
  });
});

describe("Gen5 weather immunity type constants", () => {
  it("given SANDSTORM_IMMUNE_TYPES, then includes rock, ground, steel", () => {
    // Source: Bulbapedia -- these types are immune to sandstorm chip
    expect(SANDSTORM_IMMUNE_TYPES).toEqual([TYPES.rock, TYPES.ground, TYPES.steel]);
  });

  it("given HAIL_IMMUNE_TYPES, then includes only ice", () => {
    // Source: Bulbapedia -- only ice is immune to hail chip
    expect(HAIL_IMMUNE_TYPES).toEqual([TYPES.ice]);
  });
});

describe("Gen5 Snow Cloak hail immunity", () => {
  it("given a Pokemon with snow-cloak in hail, when isGen5WeatherImmune called, then returns true (grants chip immunity)", () => {
    // Source: references/pokemon-showdown/data/abilities.ts -- snowcloak.onImmunity
    //   "if (type === 'hail') return false"
    // In Showdown's event system, onImmunity returning false means the pokemon IS immune:
    //   weather damage check: "!target.runStatusImmunity(effect.id)" → skips damage when false
    //   runStatusImmunity calls runEvent('Immunity') → onImmunity returning false → immune
    // Source: Bulbapedia -- Snow Cloak: "The Pokemon is immune to damage from hail."
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.hail, ABILITIES.snowCloak)).toBe(true);
  });

  it("given a Pokemon with ice-body in hail, when isGen5WeatherImmune called, then returns true (grants chip immunity)", () => {
    // Source: Bulbapedia -- Ice Body: "the Pokémon is unaffected by hail"
    expect(isGen5WeatherImmune([TYPES.normal], WEATHER.hail, ABILITIES.iceBody)).toBe(true);
  });
});
