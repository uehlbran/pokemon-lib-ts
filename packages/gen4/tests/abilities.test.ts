import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4Ability } from "../src/Gen4Abilities";

/**
 * Gen 4 Ability Tests
 *
 * Tests cover:
 *   on-switch-in: Intimidate, Drizzle, Drought, Sand Stream, Snow Warning,
 *                 Download, Anticipation, Forewarn, Frisk, Slow Start
 *   on-turn-end: Speed Boost, Rain Dish, Ice Body, Dry Skin, Solar Power,
 *                Hydration, Shed Skin, Bad Dreams, Poison Heal
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ability trigger dispatch
 * Source: Bulbapedia — individual ability mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
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
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
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
      defense: overrides.defense ?? 100,
      spAttack: 100,
      spDefense: overrides.spDefense ?? 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      defense: overrides.defense,
      spDefense: overrides.spDefense,
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
    types: overrides.types ?? ["normal"],
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
  };
}

function makeSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
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

function makeBattleState(weather?: {
  type: "sand" | "hail" | "rain" | "sun";
  turnsLeft: number;
  source: string;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  weather?: { type: "sand" | "hail" | "rain" | "sun"; turnsLeft: number; source: string };
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  rngChance?: boolean;
}): AbilityContext {
  const state = makeBattleState(opts.weather);
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    defense: opts.defense,
    spDefense: opts.spDefense,
  });
  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: "on-switch-in",
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ---------------------------------------------------------------------------
// on-switch-in: weather setters
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Drizzle", () => {
  it("given Drizzle, when Pokemon switches in, then sets rain weather with -1 turns (permanent)", () => {
    // Source: Showdown Gen 4 mod — Drizzle sets permanent rain on switch-in (Gen 4: no turn limit)
    const ctx = makeContext({ ability: "drizzle" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: "rain",
      weatherTurns: -1,
    });
  });

  it("given Drizzle, when Pokemon switches in, then message mentions rain", () => {
    // Source: Showdown Gen 4 mod — Drizzle message text
    const ctx = makeContext({ ability: "drizzle" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.messages[0]).toContain("rain");
  });
});

describe("applyGen4Ability on-switch-in — Drought", () => {
  it("given Drought, when Pokemon switches in, then sets sun weather with -1 turns (permanent)", () => {
    // Source: Showdown Gen 4 mod — Drought sets permanent sun on switch-in
    const ctx = makeContext({ ability: "drought" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: "sun",
      weatherTurns: -1,
    });
  });
});

describe("applyGen4Ability on-switch-in — Sand Stream", () => {
  it("given Sand Stream, when Pokemon switches in, then sets sandstorm weather with -1 turns (permanent)", () => {
    // Source: Showdown Gen 4 mod — Sand Stream sets permanent sandstorm on switch-in
    const ctx = makeContext({ ability: "sand-stream" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: "sand",
      weatherTurns: -1,
    });
  });
});

describe("applyGen4Ability on-switch-in — Snow Warning (NEW in Gen 4)", () => {
  it("given Snow Warning, when Pokemon switches in, then sets hail weather with -1 turns (permanent)", () => {
    // Source: Bulbapedia — Snow Warning introduced in Gen 4 with Abomasnow; sets permanent hail
    // Source: Showdown Gen 4 mod — Snow Warning trigger
    const ctx = makeContext({ ability: "snow-warning" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: "hail",
      weatherTurns: -1,
    });
  });

  it("given Snow Warning, when Pokemon switches in, then message mentions hail", () => {
    // Source: Showdown Gen 4 mod — Snow Warning message text
    const ctx = makeContext({ ability: "snow-warning" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.messages[0]).toContain("hail");
  });
});

// ---------------------------------------------------------------------------
// on-switch-in: Intimidate
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Intimidate", () => {
  it("given Intimidate and an opponent present, when Pokemon switches in, then lowers opponent Attack by 1 stage", () => {
    // Source: Showdown Gen 4 mod — Intimidate lowers opponent's Attack -1 on switch-in
    const opponent = makeActivePokemon({ ability: "", speciesId: 2 });
    const ctx = makeContext({ ability: "intimidate", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "opponent",
      stat: "attack",
      stages: -1,
    });
  });

  it("given Intimidate and no opponent present, when Pokemon switches in, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Intimidate requires an opponent to lower
    const ctx = makeContext({ ability: "intimidate" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-switch-in: Download (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Download (NEW in Gen 4)", () => {
  it("given Download and foe's Def < foe's SpDef, when Pokemon switches in, then raises Attack by 1", () => {
    // Source: Bulbapedia — Download: raises Attack if foe Def < SpDef
    // Source: Showdown Gen 4 mod — Download trigger
    // Derivation: foe has Def=80, SpDef=100 → 80 < 100 → +1 Atk
    const opponent = makeActivePokemon({ defense: 80, spDefense: 100 });
    const ctx = makeContext({ ability: "download", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Download and foe's Def >= foe's SpDef, when Pokemon switches in, then raises SpAtk by 1", () => {
    // Source: Bulbapedia — Download: raises SpAtk if foe Def >= SpDef
    // Derivation: foe has Def=100, SpDef=80 → 100 >= 80 → +1 SpAtk
    const opponent = makeActivePokemon({ defense: 100, spDefense: 80 });
    const ctx = makeContext({ ability: "download", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Download and equal Def = SpDef, when Pokemon switches in, then raises SpAtk (not Attack)", () => {
    // Source: Bulbapedia — Download raises SpAtk when Def >= SpDef (equal counts as >=)
    // Derivation: foe has Def=100, SpDef=100 → 100 >= 100 → +1 SpAtk
    const opponent = makeActivePokemon({ defense: 100, spDefense: 100 });
    const ctx = makeContext({ ability: "download", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      stat: "spAttack",
      stages: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// on-switch-in: informational abilities
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Anticipation", () => {
  it("given Anticipation, when Pokemon switches in, then activates with none effect and a message", () => {
    // Source: Bulbapedia — Anticipation: alerts trainer if foe has SE/OHKO move (informational)
    const ctx = makeContext({ ability: "anticipation" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("none");
    expect(result.messages).toHaveLength(1);
  });
});

describe("applyGen4Ability on-switch-in — Forewarn", () => {
  it("given Forewarn with an opponent, when Pokemon switches in, then activates with none effect and a message", () => {
    // Source: Bulbapedia — Forewarn: reveals foe's strongest move on switch-in (informational)
    const opponent = makeActivePokemon({ speciesId: 2 });
    const ctx = makeContext({ ability: "forewarn", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("none");
    expect(result.messages).toHaveLength(1);
  });

  it("given Forewarn with no opponent, when Pokemon switches in, then does not activate", () => {
    const ctx = makeContext({ ability: "forewarn" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-switch-in — Frisk", () => {
  it("given Frisk and an opponent holding an item, when Pokemon switches in, then activates and reveals the item", () => {
    // Source: Bulbapedia — Frisk: reveals foe's held item on switch-in (informational)
    const opponent = makeActivePokemon({ heldItem: "leftovers", speciesId: 2 });
    const ctx = makeContext({ ability: "frisk", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("leftovers");
  });
});

describe("applyGen4Ability on-switch-in — Slow Start", () => {
  it("given Slow Start, when Pokemon switches in, then activates with none effect and a message", () => {
    // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns (informational on switch-in)
    const ctx = makeContext({ ability: "slow-start" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("none");
    expect(result.messages).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Speed Boost
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Speed Boost", () => {
  it("given Speed Boost, when turn ends, then raises Speed by 1 stage", () => {
    // Source: Bulbapedia — Speed Boost: raises Speed by 1 at end of each turn
    const ctx = makeContext({ ability: "speed-boost" });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Speed Boost, when turn ends, then message mentions Speed Boost", () => {
    const ctx = makeContext({ ability: "speed-boost" });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.messages[0]).toContain("Speed Boost");
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Rain Dish
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Rain Dish", () => {
  it("given Rain Dish and active rain, when turn ends, then activates with heal effect type and 1/16 max HP value", () => {
    // Source: Bulbapedia — Rain Dish: restores 1/16 HP in rain each turn
    // Derivation: maxHp=160, floor(160/16) = 10
    const ctx = makeContext({
      ability: "rain-dish",
      maxHp: 160,
      currentHp: 100,
      weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(10);
    expect(result.messages[0]).toContain("Rain Dish");
  });

  it("given Rain Dish and no rain, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Rain Dish only activates in rain
    const ctx = makeContext({ ability: "rain-dish", maxHp: 160 });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Ice Body
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Ice Body (NEW in Gen 4)", () => {
  it("given Ice Body and active hail, when turn ends, then activates with heal effect type and 1/16 max HP value", () => {
    // Source: Bulbapedia — Ice Body (Gen 4): heals 1/16 HP per turn in hail; also immune to hail chip
    // Derivation: maxHp=160, floor(160/16) = 10
    const ctx = makeContext({
      ability: "ice-body",
      maxHp: 160,
      currentHp: 100,
      weather: { type: "hail", turnsLeft: 5, source: "hail" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(10);
    expect(result.messages[0]).toContain("Ice Body");
  });

  it("given Ice Body and no hail, when turn ends, then does not activate", () => {
    const ctx = makeContext({ ability: "ice-body", maxHp: 160 });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Dry Skin
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Dry Skin (NEW in Gen 4)", () => {
  it("given Dry Skin and rain, when turn ends, then heals 1/8 max HP with heal effect type", () => {
    // Source: Bulbapedia — Dry Skin: heals 1/8 HP in rain at end of turn
    // Derivation: maxHp=160, floor(160/8) = 20
    const ctx = makeContext({
      ability: "dry-skin",
      maxHp: 160,
      currentHp: 100,
      weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
    expect(result.messages[0]).toContain("Dry Skin");
  });

  it("given Dry Skin and sun, when turn ends, then takes 1/8 max HP chip damage with chip-damage effect type", () => {
    // Source: Bulbapedia — Dry Skin: takes 1/8 HP chip damage in sun at end of turn
    // Derivation: maxHp=160, floor(160/8) = 20 (positive — engine applies as damage)
    const ctx = makeContext({
      ability: "dry-skin",
      maxHp: 160,
      weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Dry Skin and no weather, when turn ends, then does not activate", () => {
    const ctx = makeContext({ ability: "dry-skin", maxHp: 160 });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Solar Power
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Solar Power (NEW in Gen 4)", () => {
  it("given Solar Power and sun, when turn ends, then takes 1/8 max HP chip damage with chip-damage effect type", () => {
    // Source: Bulbapedia — Solar Power: takes 1/8 HP chip in sun; SpAtk 1.5x (damage calc)
    // Derivation: maxHp=160, floor(160/8) = 20 (positive — engine applies as damage)
    const ctx = makeContext({
      ability: "solar-power",
      maxHp: 160,
      weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Solar Power and no sun, when turn ends, then does not activate", () => {
    const ctx = makeContext({ ability: "solar-power", maxHp: 160 });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Hydration
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Hydration (NEW in Gen 4)", () => {
  it("given Hydration, rain, and poison status, when turn ends, then cures the status", () => {
    // Source: Bulbapedia — Hydration: cures status at end of turn in rain
    const ctx = makeContext({
      ability: "hydration",
      status: "poison",
      weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-cure");
    expect(result.messages[0]).toContain("Hydration");
  });

  it("given Hydration, rain, but no status, when turn ends, then does not activate", () => {
    const ctx = makeContext({
      ability: "hydration",
      weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Hydration, status, but no rain, when turn ends, then does not activate", () => {
    const ctx = makeContext({ ability: "hydration", status: "burn" });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Shed Skin
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Shed Skin", () => {
  it("given Shed Skin with a status and RNG succeeds, when turn ends, then cures the status", () => {
    // Source: Bulbapedia — Shed Skin: 33% chance to cure status each turn
    const ctx = makeContext({ ability: "shed-skin", status: "paralysis", rngChance: true });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-cure");
    expect(result.messages[0]).toContain("Shed Skin");
  });

  it("given Shed Skin with a status and RNG fails, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Shed Skin: 33% chance (RNG fail = no activation)
    const ctx = makeContext({ ability: "shed-skin", status: "burn", rngChance: false });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Shed Skin with no status, when turn ends, then does not activate regardless of RNG", () => {
    // Source: Bulbapedia — Shed Skin only checks if a status is present
    const ctx = makeContext({ ability: "shed-skin", rngChance: true });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Bad Dreams
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Bad Dreams (NEW in Gen 4)", () => {
  it("given Bad Dreams and a sleeping opponent, when turn ends, then deals 1/8 opponent's max HP with chip-damage effect type", () => {
    // Source: Bulbapedia — Bad Dreams: damages sleeping opponents for 1/8 HP each turn
    // Derivation: opponent maxHp=160, floor(160/8) = 20 (positive — engine applies as damage)
    const opponent = makeActivePokemon({ status: "sleep", maxHp: 160 });
    const ctx = makeContext({ ability: "bad-dreams", opponent });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.target).toBe("opponent");
    expect(result.effects[0]?.value).toBe(20);
    expect(result.messages[0]).toContain("Bad Dreams");
  });

  it("given Bad Dreams and a non-sleeping opponent, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Bad Dreams only affects sleeping opponents
    const opponent = makeActivePokemon({ status: "burn" });
    const ctx = makeContext({ ability: "bad-dreams", opponent });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Bad Dreams and no opponent, when turn ends, then does not activate", () => {
    const ctx = makeContext({ ability: "bad-dreams" });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Poison Heal
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Poison Heal (NEW in Gen 4)", () => {
  it("given Poison Heal and poison status below max HP, when turn ends, then heals 1/8 max HP with heal effect type", () => {
    // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn when poisoned (instead of damage)
    // Derivation: maxHp=160, currentHp=100, floor(160/8) = 20
    const ctx = makeContext({
      ability: "poison-heal",
      status: "poison",
      maxHp: 160,
      currentHp: 100,
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
    expect(result.messages[0]).toContain("Poison Heal");
  });

  it("given Poison Heal and badly-poisoned status below max HP, when turn ends, then heals 1/8 max HP with heal effect type", () => {
    // Source: Bulbapedia — Poison Heal works for both regular and bad poison
    // Derivation: maxHp=160, currentHp=80, floor(160/8) = 20
    const ctx = makeContext({
      ability: "poison-heal",
      status: "badly-poisoned",
      maxHp: 160,
      currentHp: 80,
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Poison Heal and poison at full HP, when turn ends, then activates with no effects (suppresses poison damage tick)", () => {
    // Poison Heal must return activated:true even at full HP so the engine knows
    // the poison-heal EoT slot handled the tick and skips status-damage for this Pokemon.
    // Source: Bulbapedia — Poison Heal: heals instead of taking damage; no damage is ever dealt
    // Source: Showdown Gen 4 mod — Poison Heal activates when poisoned regardless of current HP
    const ctx = makeContext({
      ability: "poison-heal",
      status: "poison",
      maxHp: 160,
      currentHp: 160,
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
  });

  it("given Poison Heal and no status, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Poison Heal only triggers when holder is poisoned
    const ctx = makeContext({ ability: "poison-heal", maxHp: 160, currentHp: 100 });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown ability / unknown trigger
// ---------------------------------------------------------------------------

describe("applyGen4Ability — unknown ability/trigger", () => {
  it("given an unknown ability, when trigger fires, then returns not activated", () => {
    const ctx = makeContext({ ability: "some-unknown-ability" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a known ability, when an unknown trigger fires, then returns not activated", () => {
    const ctx = makeContext({ ability: "drizzle" });
    // @ts-expect-error intentional unknown trigger for test
    const result = applyGen4Ability("on-faint", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Triangulation: heal/chip-damage effect types with second input value
// ---------------------------------------------------------------------------

describe("applyGen4Ability — heal/chip-damage effect types (triangulation)", () => {
  it("given Rain Dish with maxHp=320 in rain, when turn ends, then heal value is 20 (floor(320/16))", () => {
    // Source: Bulbapedia — Rain Dish: restores 1/16 HP in rain
    // Triangulation: second test with different maxHp to verify formula, not a constant
    // Derivation: maxHp=320, floor(320/16) = 20
    const ctx = makeContext({
      ability: "rain-dish",
      maxHp: 320,
      currentHp: 200,
      weather: { type: "rain", turnsLeft: 5, source: "rain-dance" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Ice Body with maxHp=320 in hail, when turn ends, then heal value is 20 (floor(320/16))", () => {
    // Source: Bulbapedia — Ice Body: restores 1/16 HP in hail
    // Triangulation: confirms formula scales with maxHp
    // Derivation: maxHp=320, floor(320/16) = 20
    const ctx = makeContext({
      ability: "ice-body",
      maxHp: 320,
      currentHp: 200,
      weather: { type: "hail", turnsLeft: 5, source: "hail" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Dry Skin with maxHp=320 in sun, when turn ends, then chip-damage value is 40 (floor(320/8))", () => {
    // Source: Bulbapedia — Dry Skin: takes 1/8 HP in sun
    // Triangulation: confirms chip-damage value scales with maxHp
    // Derivation: maxHp=320, floor(320/8) = 40
    const ctx = makeContext({
      ability: "dry-skin",
      maxHp: 320,
      weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(40);
  });

  it("given Solar Power with maxHp=320 in sun, when turn ends, then chip-damage value is 40 (floor(320/8))", () => {
    // Source: Bulbapedia — Solar Power: takes 1/8 HP in sun
    // Triangulation: confirms chip-damage formula scales with maxHp
    // Derivation: maxHp=320, floor(320/8) = 40
    const ctx = makeContext({
      ability: "solar-power",
      maxHp: 320,
      weather: { type: "sun", turnsLeft: 5, source: "sunny-day" },
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(40);
  });

  it("given Bad Dreams with sleeping opponent maxHp=320, when turn ends, then chip-damage value is 40 targeting opponent", () => {
    // Source: Bulbapedia — Bad Dreams: damages sleeping opponents for 1/8 HP each turn
    // Triangulation: confirms chip-damage targets opponent and scales with opponent maxHp
    // Derivation: oppMaxHp=320, floor(320/8) = 40
    const opponent = makeActivePokemon({ status: "sleep", maxHp: 320 });
    const ctx = makeContext({ ability: "bad-dreams", opponent });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.target).toBe("opponent");
    expect(result.effects[0]?.value).toBe(40);
  });

  it("given Poison Heal with maxHp=320 and poison, when turn ends, then heal value is 40 (floor(320/8))", () => {
    // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn when poisoned
    // Triangulation: confirms heal formula scales with maxHp
    // Derivation: maxHp=320, floor(320/8) = 40
    const ctx = makeContext({
      ability: "poison-heal",
      status: "poison",
      maxHp: 320,
      currentHp: 200,
    });
    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Integration: Rain Dish through applyAbility with proper context
// ---------------------------------------------------------------------------

describe("applyGen4Ability — integration: Rain Dish end-to-end", () => {
  it("given a Pokemon with Rain Dish in rain at 80% HP, when applyAbility is called with on-turn-end trigger, then returns activated:true with heal effect of 1/16 max HP", () => {
    // Source: Bulbapedia — Rain Dish restores 1/16 HP in rain
    // Derivation: maxHp=160, currentHp=128 (80%), floor(160/16) = 10
    const maxHp = 160;
    const pokemon = makeActivePokemon({
      ability: "rain-dish",
      currentHp: 128,
      maxHp,
    });
    const state = makeBattleState({ type: "rain", turnsLeft: 3, source: "drizzle" });
    const ctx: AbilityContext = {
      pokemon,
      state,
      trigger: "on-turn-end",
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    } as unknown as AbilityContext;

    const result = applyGen4Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]?.effectType).toBe("heal");
    // Source: 1/16 of 160 = 10
    expect(result.effects[0]?.value).toBe(10);
  });
});
