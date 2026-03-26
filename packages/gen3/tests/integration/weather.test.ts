import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType, WeatherType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager, GEN3_MOVE_IDS, GEN3_NATURE_IDS, GEN3_SPECIES_IDS } from "../../src";
import { Gen3Ruleset } from "../../src/Gen3Ruleset";
import {
  applyGen3WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen3WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "../../src/Gen3Weather";

/**
 * Gen 3 Weather Tests
 *
 * Sandstorm: 1/16 max HP chip damage (not 1/8 like Gen 2) to non-Rock/Ground/Steel.
 * Hail: 1/16 max HP chip damage to non-Ice. NEW in Gen 3.
 * Rain/Sun: no chip damage.
 *
 * CRITICAL: NO SpDef boost in sandstorm — that was added in Gen 4 (Diamond/Pearl).
 *
 * Source: pret/pokeemerald src/battle_util.c — weather end-of-turn damage routines
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen3DataManager();
const TYPE_IDS = CORE_TYPE_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const MOVE_IDS = GEN3_MOVE_IDS;
const NATURE_IDS = GEN3_NATURE_IDS;
const SPECIES_IDS = GEN3_SPECIES_IDS;
const ABILITY_IDS = CORE_ABILITY_IDS;
const ITEM_IDS = CORE_ITEM_IDS;
const DEFAULT_LEVEL = 50;
const DEFAULT_MAX_HP = 200;

function createPokemonInstanceFixture(
  overrides: { maxHp?: number; speciesId?: number; nickname?: string | null } = {},
): PokemonInstance {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? SPECIES_IDS.bulbasaur);
  const maxHp = overrides.maxHp ?? DEFAULT_MAX_HP;
  const pokemon = createPokemonInstance(species, DEFAULT_LEVEL, new SeededRandom(species.id), {
    nature: DATA_MANAGER.getNature(NATURE_IDS.hardy).id,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: species.genderRatio === -1 ? CORE_GENDERS.genderless : CORE_GENDERS.male,
    heldItem: null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: ITEM_IDS.pokeBall,
    moves: [],
    nickname: overrides.nickname ?? null,
  });

  pokemon.currentHp = maxHp;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  return pokemon;
}

function createOnFieldPokemonFixture(
  overrides: {
    speciesId?: number;
    types?: PokemonType[];
    maxHp?: number;
    nickname?: string | null;
    ability?: string;
    status?: PokemonInstance["status"];
    heldItem?: string | null;
  } = {},
): ActivePokemon {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? SPECIES_IDS.bulbasaur);
  const pokemon = createPokemonInstanceFixture({
    speciesId: species.id,
    maxHp: overrides.maxHp,
    nickname: overrides.nickname,
  });

  pokemon.ability = overrides.ability ?? ABILITY_IDS.none;
  pokemon.status = overrides.status ?? null;
  pokemon.heldItem = overrides.heldItem ?? null;

  const active = createBattleOnFieldPokemon(pokemon, 0, overrides.types ?? [...species.types]);
  active.ability = overrides.ability ?? ABILITY_IDS.none;
  return active;
}

function createBattleSideFixture(index: 0 | 1, active: (ActivePokemon | null)[]): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

type WeatherOverride = {
  type: WeatherType;
  turnsLeft: number;
  source: string;
} | null;

function expectedWeatherChipDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 16));
}

function createBattleStateFixture(
  weather: WeatherOverride,
  side0Active: (ActivePokemon | null)[],
  side1Active: (ActivePokemon | null)[],
): BattleState {
  return {
    phase: "turn-end",
    generation: 3,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSideFixture(0, side0Active), createBattleSideFixture(1, side1Active)],
    weather: weather as never,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Immunity constant tests
// ---------------------------------------------------------------------------

describe("Gen3Weather constants", () => {
  it("SANDSTORM_IMMUNE_TYPES contains rock, ground, and steel", () => {
    // Source: pret/pokeemerald src/battle_util.c — sandstorm immunity list
    expect(SANDSTORM_IMMUNE_TYPES).toContain(TYPE_IDS.rock);
    expect(SANDSTORM_IMMUNE_TYPES).toContain(TYPE_IDS.ground);
    expect(SANDSTORM_IMMUNE_TYPES).toContain(TYPE_IDS.steel);
  });

  it("HAIL_IMMUNE_TYPES contains ice", () => {
    // Source: pret/pokeemerald src/battle_util.c — hail immunity list (ice only)
    expect(HAIL_IMMUNE_TYPES).toContain(TYPE_IDS.ice);
    expect(HAIL_IMMUNE_TYPES).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isGen3WeatherImmune
// ---------------------------------------------------------------------------

describe("isGen3WeatherImmune — sandstorm", () => {
  it("given a Rock-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: pret/pokeemerald — Rock type immune to sandstorm damage
    expect(isGen3WeatherImmune([TYPE_IDS.rock], WEATHER_IDS.sand)).toBe(true);
  });

  it("given a Ground-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: pret/pokeemerald — Ground type immune to sandstorm damage
    expect(isGen3WeatherImmune([TYPE_IDS.ground], WEATHER_IDS.sand)).toBe(true);
  });

  it("given a Steel-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: pret/pokeemerald — Steel type immune to sandstorm damage
    expect(isGen3WeatherImmune([TYPE_IDS.steel], WEATHER_IDS.sand)).toBe(true);
  });

  it("given a Fire-type Pokemon, when checking sandstorm immunity, then returns false", () => {
    // Source: pret/pokeemerald — Fire type is not immune to sandstorm
    expect(isGen3WeatherImmune([TYPE_IDS.fire], WEATHER_IDS.sand)).toBe(false);
  });

  it("given a Normal-type Pokemon, when checking sandstorm immunity, then returns false", () => {
    // Source: pret/pokeemerald — Normal type is not immune to sandstorm
    expect(isGen3WeatherImmune([TYPE_IDS.normal], WEATHER_IDS.sand)).toBe(false);
  });

  it("given a dual Rock/Fire-type Pokemon, when checking sandstorm immunity, then returns true (Rock grants immunity)", () => {
    // Source: pret/pokeemerald — having any immune type is sufficient
    expect(isGen3WeatherImmune([TYPE_IDS.rock, TYPE_IDS.fire], WEATHER_IDS.sand)).toBe(true);
  });
});

describe("isGen3WeatherImmune — hail", () => {
  it("given an Ice-type Pokemon, when checking hail immunity, then returns true", () => {
    // Source: pret/pokeemerald — Ice type immune to hail damage
    expect(isGen3WeatherImmune([TYPE_IDS.ice], WEATHER_IDS.hail)).toBe(true);
  });

  it("given a Water-type Pokemon, when checking hail immunity, then returns false", () => {
    // Source: pret/pokeemerald — Water type is not immune to hail
    expect(isGen3WeatherImmune([TYPE_IDS.water], WEATHER_IDS.hail)).toBe(false);
  });

  it("given a dual Ice/Water-type Pokemon, when checking hail immunity, then returns true (Ice grants immunity)", () => {
    // Source: pret/pokeemerald — having any immune type is sufficient
    expect(isGen3WeatherImmune([TYPE_IDS.ice, TYPE_IDS.water], WEATHER_IDS.hail)).toBe(true);
  });
});

describe("isGen3WeatherImmune — rain/sun (no chip damage)", () => {
  it("given any type in rain, when checking immunity, then returns false (no chip damage)", () => {
    // Source: pret/pokeemerald — rain has no chip damage in any generation
    expect(isGen3WeatherImmune([TYPE_IDS.normal], WEATHER_IDS.rain)).toBe(false);
    expect(isGen3WeatherImmune([TYPE_IDS.fire], WEATHER_IDS.rain)).toBe(false);
    expect(isGen3WeatherImmune([TYPE_IDS.water], WEATHER_IDS.rain)).toBe(false);
  });

  it("given any type in sun, when checking immunity, then returns false (no chip damage)", () => {
    // Source: pret/pokeemerald — sun has no chip damage in any generation
    expect(isGen3WeatherImmune([TYPE_IDS.normal], WEATHER_IDS.sun)).toBe(false);
    expect(isGen3WeatherImmune([TYPE_IDS.fire], WEATHER_IDS.sun)).toBe(false);
    expect(isGen3WeatherImmune([TYPE_IDS.water], WEATHER_IDS.sun)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — sandstorm
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — sandstorm", () => {
  it("given sandstorm, when a Rock-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Rock type immune to sandstorm chip damage
    const rockMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.rock], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [rockMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm, when a Ground-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Ground type immune to sandstorm chip damage
    const groundMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.ground], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [groundMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm, when a Steel-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Steel type immune to sandstorm chip damage
    const steelMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.steel], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [steelMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm, when a Fire-type Pokemon with 160 maxHP ends its turn, then takes 10 HP (1/16 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — sandstorm damage = maxHP / 16
    // Gen 3: 1/16 max HP (Gen 2 used 1/8, Gen 3 reduced this).
    // Derivation: floor(160 / 16) = 10
    // NOTE: NO SpDef boost for Rock-types — that was added in Gen 4 (Diamond/Pearl).
    const fireMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.fire], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [fireMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(expectedWeatherChipDamage(160));
  });

  it("given sandstorm, when a Normal-type Pokemon with 200 maxHP ends its turn, then takes 12 HP (floor(200/16))", () => {
    // Source: pret/pokeemerald src/battle_util.c — sandstorm damage = floor(maxHP / 16)
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const normalMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.normal], maxHp: 200 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [normalMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(expectedWeatherChipDamage(200));
  });

  it("given sandstorm, when result message is checked for a non-immune Pokemon, then message says 'buffeted by the sandstorm'", () => {
    // Source: pret/pokeemerald — sandstorm message text
    const fireMon = createOnFieldPokemonFixture({
      types: [TYPE_IDS.fire],
      maxHp: 160,
      speciesId: SPECIES_IDS.charizard,
    });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [fireMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results[0]?.message).toContain(MOVE_IDS.sandstorm);
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — hail
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — hail", () => {
  it("given hail, when an Ice-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Ice type immune to hail chip damage
    const iceMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.ice], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.hail, turnsLeft: 5, source: MOVE_IDS.hail },
      [iceMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given hail, when a Fire-type Pokemon with 160 maxHP ends its turn, then takes 10 HP (1/16 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — hail damage = maxHP / 16
    // Hail is new in Gen 3 (did not exist in Gen 2). Chip = 1/16 max HP.
    // Derivation: floor(160 / 16) = 10
    const fireMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.fire], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.hail, turnsLeft: 5, source: MOVE_IDS.hail },
      [fireMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(expectedWeatherChipDamage(160));
  });

  it("given hail, when a Water-type Pokemon with 200 maxHP ends its turn, then takes 12 HP (floor(200/16))", () => {
    // Source: pret/pokeemerald src/battle_util.c — hail damage = floor(maxHP / 16)
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const waterMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.water], maxHp: 200 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.hail, turnsLeft: 5, source: MOVE_IDS.hail },
      [waterMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(expectedWeatherChipDamage(200));
  });

  it("given hail, when result message is checked for a non-immune Pokemon, then message says 'pelted by hail'", () => {
    // Source: pret/pokeemerald — hail message text
    const fireMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.fire], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.hail, turnsLeft: 5, source: MOVE_IDS.hail },
      [fireMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results[0]?.message).toContain(WEATHER_IDS.hail);
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — rain and sun (no chip damage)
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — rain", () => {
  it("given rain, when weather effects are applied, then no chip damage is dealt", () => {
    // Source: pret/pokeemerald — Rain Dance has no end-of-turn chip damage in any generation
    // Rain only modifies Water/Fire move power (handled in damage calc).
    const normalMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.normal], maxHp: 200 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.rain, turnsLeft: 5, source: MOVE_IDS.rainDance },
      [normalMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

describe("applyGen3WeatherEffects — sun", () => {
  it("given sun, when weather effects are applied, then no chip damage is dealt", () => {
    // Source: pret/pokeemerald — Sunny Day has no end-of-turn chip damage in any generation
    // Sun only modifies Fire/Water move power (handled in damage calc).
    const normalMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.normal], maxHp: 200 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sun, turnsLeft: 5, source: MOVE_IDS.sunnyDay },
      [normalMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — null weather
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — no weather", () => {
  it("given no active weather, when weather effects are applied, then returns empty array", () => {
    // Source: pret/pokeemerald — weather effects are skipped when no weather is active
    const normalMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.normal], maxHp: 200 });
    const state = createBattleStateFixture(null, [normalMon], []);

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — null active slots
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — null active slots", () => {
  it("given sandstorm with a null active slot, when weather effects are applied, then skips null slot", () => {
    // Source: pret/pokeemerald — fainted/absent Pokemon are skipped in weather ticks
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [null],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Gen3Ruleset.applyWeatherEffects integration
// ---------------------------------------------------------------------------

describe("Gen3Ruleset.applyWeatherEffects integration", () => {
  it("given a Gen3Ruleset and sandstorm, when applyWeatherEffects called with a Fire-type Pokemon of 160 maxHP, then returns 10 damage", () => {
    // Source: pret/pokeemerald — Gen 3 sandstorm chip = 1/16 max HP
    // Derivation: floor(160 / 16) = 10
    const ruleset = new Gen3Ruleset(createGen3DataManager());
    const fireMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.fire], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.sand, turnsLeft: 5, source: MOVE_IDS.sandstorm },
      [fireMon],
      [],
    );

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(expectedWeatherChipDamage(160));
  });

  it("given a Gen3Ruleset and hail, when applyWeatherEffects called with a Normal-type Pokemon of 160 maxHP, then returns 10 damage", () => {
    // Source: pret/pokeemerald — Gen 3 hail chip = 1/16 max HP
    // Derivation: floor(160 / 16) = 10
    const ruleset = new Gen3Ruleset(createGen3DataManager());
    const normalMon = createOnFieldPokemonFixture({ types: [TYPE_IDS.normal], maxHp: 160 });
    const state = createBattleStateFixture(
      { type: WEATHER_IDS.hail, turnsLeft: 5, source: MOVE_IDS.hail },
      [normalMon],
      [],
    );

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(expectedWeatherChipDamage(160));
  });
});
