import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";
import {
  applyGen4WeatherEffects,
  HAIL_IMMUNE_TYPES,
  isGen4WeatherImmune,
  SANDSTORM_IMMUNE_TYPES,
} from "../src/Gen4Weather";

/**
 * Gen 4 Weather Tests
 *
 * Sandstorm: 1/16 max HP chip damage to non-Rock/Ground/Steel.
 * Hail: 1/16 max HP chip damage to non-Ice.
 * Rain/Sun: no chip damage.
 *
 * KEY GEN 4 DIFFERENCE FROM GEN 3:
 * - Magic Guard ability grants full immunity to weather chip damage.
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — weather end-of-turn damage
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  maxHp?: number;
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
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
    ability: overrides.ability ?? "",
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
  ability?: string;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      ability: overrides.ability,
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
    ability: overrides.ability ?? "",
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
    stellarBoostedTypes: [],
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
    generation: 4,
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

describe("Gen4Weather constants", () => {
  it("SANDSTORM_IMMUNE_TYPES contains rock, ground, and steel", () => {
    // Source: Showdown Gen 4 mod — sandstorm immunity list
    expect(SANDSTORM_IMMUNE_TYPES).toContain("rock");
    expect(SANDSTORM_IMMUNE_TYPES).toContain("ground");
    expect(SANDSTORM_IMMUNE_TYPES).toContain("steel");
  });

  it("HAIL_IMMUNE_TYPES contains ice only", () => {
    // Source: Showdown Gen 4 mod — hail immunity list (ice only)
    expect(HAIL_IMMUNE_TYPES).toContain("ice");
    expect(HAIL_IMMUNE_TYPES).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// isGen4WeatherImmune — type-based
// ---------------------------------------------------------------------------

describe("isGen4WeatherImmune — sandstorm type immunity", () => {
  it("given a Rock-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: Showdown Gen 4 mod — Rock type immune to sandstorm chip
    expect(isGen4WeatherImmune(["rock"], "sand")).toBe(true);
  });

  it("given a Ground-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: Showdown Gen 4 mod — Ground type immune to sandstorm chip
    expect(isGen4WeatherImmune(["ground"], "sand")).toBe(true);
  });

  it("given a Steel-type Pokemon, when checking sandstorm immunity, then returns true", () => {
    // Source: Showdown Gen 4 mod — Steel type immune to sandstorm chip
    expect(isGen4WeatherImmune(["steel"], "sand")).toBe(true);
  });

  it("given a Fire-type Pokemon, when checking sandstorm immunity, then returns false", () => {
    // Source: Showdown Gen 4 mod — Fire type takes sandstorm chip
    expect(isGen4WeatherImmune(["fire"], "sand")).toBe(false);
  });

  it("given a dual Rock/Fire-type, when checking sandstorm immunity, then returns true (Rock grants immunity)", () => {
    // Source: Showdown Gen 4 mod — any immune type grants full immunity
    expect(isGen4WeatherImmune(["rock", "fire"], "sand")).toBe(true);
  });
});

describe("isGen4WeatherImmune — hail type immunity", () => {
  it("given an Ice-type Pokemon, when checking hail immunity, then returns true", () => {
    // Source: Showdown Gen 4 mod — Ice type immune to hail chip
    expect(isGen4WeatherImmune(["ice"], "hail")).toBe(true);
  });

  it("given a Water-type Pokemon, when checking hail immunity, then returns false", () => {
    // Source: Showdown Gen 4 mod — Water type takes hail chip
    expect(isGen4WeatherImmune(["water"], "hail")).toBe(false);
  });

  it("given a dual Ice/Water-type, when checking hail immunity, then returns true (Ice grants immunity)", () => {
    // Source: Showdown Gen 4 mod — any immune type grants full immunity
    expect(isGen4WeatherImmune(["ice", "water"], "hail")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isGen4WeatherImmune — Magic Guard (NEW vs Gen 3)
// ---------------------------------------------------------------------------

describe("isGen4WeatherImmune — Magic Guard ability (Gen 4 NEW)", () => {
  it("given a non-immune type with Magic Guard in sandstorm, when checking immunity, then returns true", () => {
    // Source: Bulbapedia — Magic Guard: immune to all indirect damage including sandstorm
    // Source: Showdown Gen 4 mod — Magic Guard check before weather chip loop
    expect(isGen4WeatherImmune(["normal"], "sand", "magic-guard")).toBe(true);
  });

  it("given a non-immune type with Magic Guard in hail, when checking immunity, then returns true", () => {
    // Source: Bulbapedia — Magic Guard: immune to all indirect damage including hail
    expect(isGen4WeatherImmune(["fire"], "hail", "magic-guard")).toBe(true);
  });

  it("given a Rock-type with Magic Guard in sandstorm, when checking immunity, then returns true (doubly immune)", () => {
    // Source: Showdown Gen 4 mod — Magic Guard short-circuits before type check anyway
    expect(isGen4WeatherImmune(["rock"], "sand", "magic-guard")).toBe(true);
  });

  it("given a non-immune type without Magic Guard in sandstorm, when checking immunity, then returns false", () => {
    // Verify Magic Guard absent means normal immunity rules apply
    expect(isGen4WeatherImmune(["normal"], "sand", "levitate")).toBe(false);
    expect(isGen4WeatherImmune(["normal"], "sand")).toBe(false);
  });
});

describe("isGen4WeatherImmune — rain/sun (no chip damage)", () => {
  it("given any type in rain, when checking immunity, then returns false (no chip damage)", () => {
    // Source: Showdown Gen 4 mod — rain has no chip damage
    expect(isGen4WeatherImmune(["normal"], "rain")).toBe(false);
    expect(isGen4WeatherImmune(["water"], "rain")).toBe(false);
  });

  it("given any type in sun, when checking immunity, then returns false (no chip damage)", () => {
    // Source: Showdown Gen 4 mod — sun has no chip damage
    expect(isGen4WeatherImmune(["fire"], "sun")).toBe(false);
    expect(isGen4WeatherImmune(["normal"], "sun")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyGen4WeatherEffects — sandstorm
// ---------------------------------------------------------------------------

describe("applyGen4WeatherEffects — sandstorm", () => {
  it("given sandstorm, when a Rock-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: Showdown Gen 4 mod — Rock type immune to sandstorm chip
    const rockMon = makeActivePokemon({ types: ["rock"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [rockMon],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given sandstorm, when a Ground-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: Showdown Gen 4 mod — Ground type immune to sandstorm chip
    const groundMon = makeActivePokemon({ types: ["ground"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [groundMon],
      [],
    );

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });

  it("given sandstorm, when a Steel-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: Showdown Gen 4 mod — Steel type immune to sandstorm chip
    const steelMon = makeActivePokemon({ types: ["steel"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [steelMon],
      [],
    );

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });

  it("given sandstorm, when a Fire-type Pokemon with 160 maxHP ends its turn, then takes 10 HP (1/16 maxHP)", () => {
    // Source: Showdown Gen 4 mod — sandstorm chip = floor(maxHP / 16)
    // Derivation: floor(160 / 16) = 10
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [fireMon],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });

  it("given sandstorm, when a Normal-type Pokemon with 200 maxHP ends its turn, then takes 12 HP (floor(200/16))", () => {
    // Source: Showdown Gen 4 mod — sandstorm chip = floor(maxHP / 16)
    // Derivation: floor(200 / 16) = floor(12.5) = 12
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [normalMon],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(12);
  });

  it("given sandstorm, when result message is checked for a non-immune Pokemon, then message says 'buffeted by the sandstorm'", () => {
    // Source: Showdown Gen 4 mod — sandstorm message text
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [fireMon],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    expect(results[0]?.message).toContain("sandstorm");
  });
});

// ---------------------------------------------------------------------------
// applyGen4WeatherEffects — hail
// ---------------------------------------------------------------------------

describe("applyGen4WeatherEffects — hail", () => {
  it("given hail, when an Ice-type Pokemon's turn ends, then no damage is taken", () => {
    // Source: Showdown Gen 4 mod — Ice type immune to hail chip
    const iceMon = makeActivePokemon({ types: ["ice"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [iceMon], []);

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });

  it("given hail, when a Fire-type Pokemon with 160 maxHP ends its turn, then takes 10 HP (1/16 maxHP)", () => {
    // Source: Showdown Gen 4 mod — hail chip = floor(maxHP / 16)
    // Derivation: floor(160 / 16) = 10
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [fireMon], []);

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });

  it("given hail, when a Water-type Pokemon with 200 maxHP ends its turn, then takes 12 HP (floor(200/16))", () => {
    // Source: Showdown Gen 4 mod — hail chip = floor(maxHP / 16)
    // Derivation: floor(200 / 16) = 12
    const waterMon = makeActivePokemon({ types: ["water"], maxHp: 200 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [waterMon], []);

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(12);
  });

  it("given hail, when result message is checked for a non-immune Pokemon, then message says 'pelted by hail'", () => {
    // Source: Showdown Gen 4 mod — hail message text
    const fireMon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const state = makeBattleState({ type: "hail", turnsLeft: 5, source: "hail" }, [fireMon], []);

    const results = applyGen4WeatherEffects(state);

    expect(results[0]?.message).toContain("hail");
  });
});

// ---------------------------------------------------------------------------
// applyGen4WeatherEffects — Magic Guard immunity (Gen 4 NEW)
// ---------------------------------------------------------------------------

describe("applyGen4WeatherEffects — Magic Guard immunity (Gen 4 NEW)", () => {
  it("given sandstorm and a Normal-type Pokemon with Magic Guard, when weather effects applied, then takes no damage", () => {
    // Source: Bulbapedia — Magic Guard: immune to all indirect damage including sandstorm
    // Derivation: without Magic Guard, floor(160/16) = 10 damage; with Magic Guard, 0 damage
    const magicGuardMon = makeActivePokemon({
      types: ["normal"],
      maxHp: 160,
      ability: "magic-guard",
    });
    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [magicGuardMon],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(0);
  });

  it("given hail and a Fire-type Pokemon with Magic Guard, when weather effects applied, then takes no damage", () => {
    // Source: Bulbapedia — Magic Guard: immune to all indirect damage including hail
    // Derivation: without Magic Guard, floor(160/16) = 10 damage; with Magic Guard, 0 damage
    const magicGuardMon = makeActivePokemon({
      types: ["fire"],
      maxHp: 160,
      ability: "magic-guard",
    });
    const state = makeBattleState(
      { type: "hail", turnsLeft: 5, source: "hail" },
      [magicGuardMon],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyGen4WeatherEffects — rain and sun (no chip damage)
// ---------------------------------------------------------------------------

describe("applyGen4WeatherEffects — rain", () => {
  it("given rain, when weather effects are applied, then no chip damage is dealt", () => {
    // Source: Showdown Gen 4 mod — rain has no chip damage
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(
      { type: "rain", turnsLeft: 5, source: "rain-dance" },
      [normalMon],
      [],
    );

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });
});

describe("applyGen4WeatherEffects — sun", () => {
  it("given sun, when weather effects are applied, then no chip damage is dealt", () => {
    // Source: Showdown Gen 4 mod — sun has no chip damage
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(
      { type: "sun", turnsLeft: 5, source: "sunny-day" },
      [normalMon],
      [],
    );

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyGen4WeatherEffects — null/fainted slots
// ---------------------------------------------------------------------------

describe("applyGen4WeatherEffects — null active slots", () => {
  it("given sandstorm with a null active slot, when weather effects are applied, then skips null slot", () => {
    // Source: Showdown Gen 4 mod — fainted/absent Pokemon are skipped in weather ticks
    const state = makeBattleState({ type: "sand", turnsLeft: 5, source: "sandstorm" }, [null], []);

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });
});

describe("applyGen4WeatherEffects — no weather", () => {
  it("given no active weather, when weather effects are applied, then returns empty array", () => {
    // Source: Showdown Gen 4 mod — weather effects skipped when no weather is active
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const state = makeBattleState(null, [normalMon], []);

    expect(applyGen4WeatherEffects(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Issue #436 — calculatedStats null-fallback branch (Gen4Weather.ts:96)
// ---------------------------------------------------------------------------

describe("applyGen4WeatherEffects — calculatedStats null-fallback (issue #436)", () => {
  it("given sandstorm and a Pokemon with null calculatedStats, when weather effects applied, then falls back to currentHp for damage calculation", () => {
    // Exercises Gen4Weather.ts:96 null-fallback branch:
    //   const maxHp = active.pokemon.calculatedStats?.hp ?? active.pokemon.currentHp;
    // When calculatedStats is null/undefined (e.g., stats not yet calculated at battle start),
    // the code falls back to currentHp.
    //
    // Source: Showdown Gen 4 mod — weather chip uses max HP; fallback to currentHp is defensive
    // Derivation: currentHp=160, floor(160/16)=10 damage expected
    const normalMon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    // Override the pokemon to have no calculatedStats (null-fallback path)
    const pokemonWithNullStats = {
      ...normalMon,
      pokemon: {
        ...normalMon.pokemon,
        calculatedStats: null as never,
        currentHp: 160,
      },
    } as ActivePokemon;

    const state = makeBattleState(
      { type: "sand", turnsLeft: 5, source: "sandstorm" },
      [pokemonWithNullStats],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    // Falls back to currentHp=160; floor(160/16) = 10 damage
    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(10);
  });

  it("given hail and a Pokemon with null calculatedStats, when weather effects applied, then falls back to currentHp for damage calculation", () => {
    // Exercises Gen4Weather.ts:96 null-fallback branch for hail
    // Source: Showdown Gen 4 mod — hail chip uses max HP; fallback to currentHp
    // Derivation: currentHp=320, floor(320/16)=20 damage expected
    const waterMon = makeActivePokemon({ types: ["water"], maxHp: 320 });
    const pokemonWithNullStats = {
      ...waterMon,
      pokemon: {
        ...waterMon.pokemon,
        calculatedStats: null as never,
        currentHp: 320,
      },
    } as ActivePokemon;

    const state = makeBattleState(
      { type: "hail", turnsLeft: 5, source: "hail" },
      [pokemonWithNullStats],
      [],
    );

    const results = applyGen4WeatherEffects(state);

    // Falls back to currentHp=320; floor(320/16) = 20 damage
    expect(results).toHaveLength(1);
    expect(results[0]?.damage).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Gen4Ruleset.applyWeatherEffects integration
// ---------------------------------------------------------------------------

describe("Gen4Ruleset.applyWeatherEffects integration", () => {
  it("given a Gen4Ruleset and sandstorm, when applyWeatherEffects called with a Fire-type Pokemon of 160 maxHP, then returns 10 damage", () => {
    // Source: Showdown Gen 4 mod — sandstorm chip = floor(maxHP / 16)
    // Derivation: floor(160 / 16) = 10
    const ruleset = new Gen4Ruleset(createGen4DataManager());
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

  it("given a Gen4Ruleset and hail, when applyWeatherEffects called with a Normal-type Pokemon with Magic Guard, then returns 0 results (immune)", () => {
    // Source: Bulbapedia — Magic Guard immune to indirect damage
    // Derivation: without Magic Guard: floor(160/16) = 10 damage; with Magic Guard: no damage
    const ruleset = new Gen4Ruleset(createGen4DataManager());
    const magicGuardMon = makeActivePokemon({
      types: ["normal"],
      maxHp: 160,
      ability: "magic-guard",
    });
    const state = makeBattleState(
      { type: "hail", turnsLeft: 5, source: "hail" },
      [magicGuardMon],
      [],
    );

    const results = ruleset.applyWeatherEffects(state);

    expect(results).toHaveLength(0);
  });
});
