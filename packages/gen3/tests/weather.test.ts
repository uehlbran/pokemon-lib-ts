import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";
import {
  applyGen3WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen3WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "../src/Gen3Weather";

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

function makePokemonInstance(overrides: {
  maxHp?: number;
  speciesId?: number;
  nickname?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  types: PokemonType[];
  maxHp?: number;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
    }),
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
    volatileStatuses: new Map(),
    types: overrides.types,
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

function makeSide(index: 0 | 1, active: (ActivePokemon | null)[]): BattleSide {
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
  type: "sand" | "hail" | "rain" | "sun";
  turnsLeft: number;
  source: string;
} | null;

function makeBattleState(
  weather: WeatherOverride,
  side0Active: (ActivePokemon | null)[],
  side1Active: (ActivePokemon | null)[],
): BattleState {
  return {
    phase: "turn-end",
    generation: 3,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0, side0Active), makeSide(1, side1Active)],
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
    expect(SANDSTORM_IMMUNE_TYPES).toContain("rock");
    expect(SANDSTORM_IMMUNE_TYPES).toContain("ground");
    expect(SANDSTORM_IMMUNE_TYPES).toContain("steel");
  });

  it("HAIL_IMMUNE_TYPES contains ice", () => {
    // Source: pret/pokeemerald src/battle_util.c — hail immunity list (ice only)
    expect(HAIL_IMMUNE_TYPES).toContain("ice");
    expect(HAIL_IMMUNE_TYPES).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isGen3WeatherImmune
// ---------------------------------------------------------------------------

describe("isGen3WeatherImmune — sandstorm", () => {
  it("given a Rock-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: pret/pokeemerald — Rock type immune to sandstorm damage
    expect(isGen3WeatherImmune(["rock"], "sand")).toBe(true);
  });

  it("given a Ground-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: pret/pokeemerald — Ground type immune to sandstorm damage
    expect(isGen3WeatherImmune(["ground"], "sand")).toBe(true);
  });

  it("given a Steel-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: pret/pokeemerald — Steel type immune to sandstorm damage
    expect(isGen3WeatherImmune(["steel"], "sand")).toBe(true);
  });

  it("given a Fire-type Pokemon, when checking sandstorm immunity, then returns false", () => {
    // Source: pret/pokeemerald — Fire type is not immune to sandstorm
    expect(isGen3WeatherImmune(["fire"], "sand")).toBe(false);
  });

  it("given a Normal-type Pokemon, when checking sandstorm immunity, then returns false", () => {
    // Source: pret/pokeemerald — Normal type is not immune to sandstorm
    expect(isGen3WeatherImmune(["normal"], "sand")).toBe(false);
  });

  it("given a dual Rock/Fire-type Pokemon, when checking sandstorm immunity, then returns true (Rock grants immunity)", () => {
    // Source: pret/pokeemerald — having any immune type is sufficient
    expect(isGen3WeatherImmune(["rock", "fire"], "sand")).toBe(true);
  });
});

describe("isGen3WeatherImmune — hail", () => {
  it("given an Ice-type Pokemon, when checking hail immunity, then returns true", () => {
    // Source: pret/pokeemerald — Ice type immune to hail damage
    expect(isGen3WeatherImmune(["ice"], "hail")).toBe(true);
  });

  it("given a Water-type Pokemon, when checking hail immunity, then returns false", () => {
    // Source: pret/pokeemerald — Water type is not immune to hail
    expect(isGen3WeatherImmune(["water"], "hail")).toBe(false);
  });

  it("given a dual Ice/Water-type Pokemon, when checking hail immunity, then returns true (Ice grants immunity)", () => {
    // Source: pret/pokeemerald — having any immune type is sufficient
    expect(isGen3WeatherImmune(["ice", "water"], "hail")).toBe(true);
  });
});

describe("isGen3WeatherImmune — rain/sun (no chip damage)", () => {
  it("given any type in rain, when checking immunity, then returns false (no chip damage)", () => {
    // Source: pret/pokeemerald — rain has no chip damage in any generation
    expect(isGen3WeatherImmune(["normal"], "rain")).toBe(false);
    expect(isGen3WeatherImmune(["fire"], "rain")).toBe(false);
    expect(isGen3WeatherImmune(["water"], "rain")).toBe(false);
  });

  it("given any type in sun, when checking immunity, then returns false (no chip damage)", () => {
    // Source: pret/pokeemerald — sun has no chip damage in any generation
    expect(isGen3WeatherImmune(["normal"], "sun")).toBe(false);
    expect(isGen3WeatherImmune(["fire"], "sun")).toBe(false);
    expect(isGen3WeatherImmune(["water"], "sun")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — sandstorm
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — sandstorm", () => {
  it("given sandstorm, when a Rock-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Rock type immune to sandstorm chip damage
    const rockMon = makeActivePokemon({ types: ["rock"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [rockMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm, when a Ground-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Ground type immune to sandstorm chip damage
    const groundMon = makeActivePokemon({ types: ["ground"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [groundMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm, when a Steel-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Steel type immune to sandstorm chip damage
    const steelMon = makeActivePokemon({ types: ["steel"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
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
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [fireMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });

  it("given sandstorm, when a Normal-type Pokemon with 200 maxHP ends its turn, then takes 12 HP (floor(200/16))", () => {
    // Source: pret/pokeemerald src/battle_util.c — sandstorm damage = floor(maxHP / 16)
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [normalMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(12);
  });

  it("given sandstorm, when result message is checked for a non-immune Pokemon, then message says 'buffeted by the sandstorm'", () => {
    // Source: pret/pokeemerald — sandstorm message text
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160, speciesId: 6 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [fireMon],
      [],
    );

    const results = applyGen3WeatherEffects(state);

    expect(results[0]?.message).toContain("sandstorm");
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — hail
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — hail", () => {
  it("given hail, when an Ice-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: pret/pokeemerald — Ice type immune to hail chip damage
    const iceMon = makeActivePokemon({ types: ["ice"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [iceMon], []);

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given hail, when a Fire-type Pokemon with 160 maxHP ends its turn, then takes 10 HP (1/16 maxHP)", () => {
    // Source: pret/pokeemerald src/battle_util.c — hail damage = maxHP / 16
    // Hail is new in Gen 3 (did not exist in Gen 2). Chip = 1/16 max HP.
    // Derivation: floor(160 / 16) = 10
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [fireMon], []);

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });

  it("given hail, when a Water-type Pokemon with 200 maxHP ends its turn, then takes 12 HP (floor(200/16))", () => {
    // Source: pret/pokeemerald src/battle_util.c — hail damage = floor(maxHP / 16)
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const waterMon = makeActivePokemon({ types: ["water"], maxHp: 200 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [waterMon], []);

    const results = applyGen3WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(12);
  });

  it("given hail, when result message is checked for a non-immune Pokemon, then message says 'pelted by hail'", () => {
    // Source: pret/pokeemerald — hail message text
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [fireMon], []);

    const results = applyGen3WeatherEffects(state);

    expect(results[0]?.message).toContain("hail");
  });
});

// ---------------------------------------------------------------------------
// applyGen3WeatherEffects — rain and sun (no chip damage)
// ---------------------------------------------------------------------------

describe("applyGen3WeatherEffects — rain", () => {
  it("given rain, when weather effects are applied, then no chip damage is dealt", () => {
    // Source: pret/pokeemerald — Rain Dance has no end-of-turn chip damage in any generation
    // Rain only modifies Water/Fire move power (handled in damage calc).
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(
      { type: "rain", turnsLeft: 5, source: "rain-dance" },
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
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(
      { type: "sun", turnsLeft: 5, source: "sunny-day" },
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
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(null, [normalMon], []);

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
    const state = makeBattleState({ type: "sand", turnsLeft: 5, source: "sandstorm" }, [null], []);

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
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [fireMon],
      [],
    );

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });

  it("given a Gen3Ruleset and hail, when applyWeatherEffects called with a Normal-type Pokemon of 160 maxHP, then returns 10 damage", () => {
    // Source: pret/pokeemerald — Gen 3 hail chip = 1/16 max HP
    // Derivation: floor(160 / 16) = 10
    const ruleset = new Gen3Ruleset(createGen3DataManager());
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [normalMon], []);

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });
});
