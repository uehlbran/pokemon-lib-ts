import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  handleGen5SwitchAbility,
  isMoldBreakerAbility,
  isTrappedByAbility,
  VICTORY_STAR_ACCURACY_MULTIPLIER,
} from "../src/Gen5AbilitiesSwitch";

/**
 * Gen 5 Ability Tests — switch-in, contact, passive, and utility abilities.
 *
 * Source: references/pokemon-showdown/data/mods/gen5/abilities.ts
 * Source: references/pokemon-showdown/data/abilities.ts
 * Source: Bulbapedia — individual ability pages
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
  gender?: Gender;
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
    gender: (overrides.gender ?? "male") as const,
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
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
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
      gender: overrides.gender,
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    suppressedAbility: null,
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
  } as unknown as BattleSide;
}

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
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

function makeMove(type: PokemonType, overrides?: Partial<MoveData>): MoveData {
  return {
    id: overrides?.id ?? "test-move",
    displayName: overrides?.displayName ?? "Test Move",
    type,
    category: overrides?.category ?? "physical",
    power: overrides?.power ?? 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "adjacent-foe",
    generation: 5,
    flags: { contact: true },
    effectChance: null,
    secondaryEffects: [],
    ...overrides,
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  rngNextValues?: number[];
  move?: MoveData;
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    defense: opts.defense,
    spDefense: opts.spDefense,
    gender: opts.gender,
    volatiles: opts.volatiles,
    substituteHp: opts.substituteHp,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// ON-SWITCH-IN ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-switch-in -- Intimidate", () => {
  it("given Intimidate, when Pokemon switches in with opponent present, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts — Intimidate: -1 Atk to opponent on switch-in
    const opponent = makeActivePokemon({ ability: "blaze", nickname: "Charizard" });
    const ctx = makeContext({ ability: "intimidate", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "opponent",
      stat: "attack",
      stages: -1,
    });
  });

  it("given Intimidate, when opponent has Substitute, then does not lower Attack", () => {
    // Source: Showdown data/abilities.ts — Intimidate blocked by Substitute
    const opponent = makeActivePokemon({
      ability: "blaze",
      nickname: "Charizard",
      substituteHp: 50,
    });
    const ctx = makeContext({ ability: "intimidate", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Pressure", () => {
  it("given Pressure, when Pokemon switches in, then emits announcement message", () => {
    // Source: Showdown data/abilities.ts — Pressure onStart message
    const ctx = makeContext({ ability: "pressure", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Pressure");
  });

  it("given Pressure, when Pokemon switches in, then effect is none (informational only)", () => {
    // Source: Showdown data/abilities.ts — Pressure onStart has no stat/status effect
    const ctx = makeContext({ ability: "pressure", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Weather setters", () => {
  it("given Drizzle, when Pokemon switches in, then sets permanent rain", () => {
    // Source: Showdown Gen 5 — Drizzle sets permanent rain (weatherTurns=-1)
    const ctx = makeContext({ ability: "drizzle", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: "rain",
      weatherTurns: -1,
    });
  });

  it("given Drought, when Pokemon switches in, then sets permanent sun", () => {
    // Source: Showdown Gen 5 — Drought sets permanent sun (weatherTurns=-1)
    const ctx = makeContext({ ability: "drought", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: "sun",
      weatherTurns: -1,
    });
  });

  it("given Sand Stream, when Pokemon switches in, then sets permanent sandstorm", () => {
    // Source: Showdown Gen 5 — Sand Stream sets permanent sandstorm (weatherTurns=-1)
    const ctx = makeContext({ ability: "sand-stream", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: "sand",
      weatherTurns: -1,
    });
  });

  it("given Snow Warning, when Pokemon switches in, then sets permanent hail", () => {
    // Source: Showdown Gen 5 — Snow Warning sets permanent hail (weatherTurns=-1)
    const ctx = makeContext({ ability: "snow-warning", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "weather-set",
      target: "field",
      weather: "hail",
      weatherTurns: -1,
    });
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Download", () => {
  it("given Download with opponent's Def < SpDef, when switches in, then raises Attack", () => {
    // Source: Showdown data/abilities.ts — Download compares foe Def vs SpDef
    const opponent = makeActivePokemon({
      ability: "blaze",
      defense: 80,
      spDefense: 120,
    });
    const ctx = makeContext({ ability: "download", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Download with opponent's Def >= SpDef, when switches in, then raises SpAtk", () => {
    // Source: Showdown data/abilities.ts — Download: Def >= SpDef means raise SpAtk
    const opponent = makeActivePokemon({
      ability: "blaze",
      defense: 120,
      spDefense: 80,
    });
    const ctx = makeContext({ ability: "download", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Trace", () => {
  it("given Trace with copyable opponent ability, when switches in, then copies ability", () => {
    // Source: Showdown data/abilities.ts — Trace copies opponent's ability
    const opponent = makeActivePokemon({ ability: "blaze", nickname: "Foe" });
    const ctx = makeContext({ ability: "trace", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: "blaze",
    });
  });

  it("given Trace with Illusion opponent, when switches in, then fails (uncopyable)", () => {
    // Source: Bulbapedia — Trace cannot copy Illusion in Gen 5
    const opponent = makeActivePokemon({ ability: "illusion", nickname: "Foe" });
    const ctx = makeContext({ ability: "trace", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Mold Breaker / Teravolt / Turboblaze", () => {
  it("given Mold Breaker, when switches in, then emits 'breaks the mold' message", () => {
    // Source: Showdown data/abilities.ts — Mold Breaker switch-in announcement
    const ctx = makeContext({ ability: "mold-breaker", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("breaks the mold");
  });

  it("given Teravolt, when switches in, then emits 'bursting aura' message", () => {
    // Source: Showdown data/abilities.ts — Teravolt switch-in announcement
    const ctx = makeContext({ ability: "teravolt", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("bursting aura");
  });

  it("given Turboblaze, when switches in, then emits 'blazing aura' message", () => {
    // Source: Showdown data/abilities.ts — Turboblaze switch-in announcement
    const ctx = makeContext({ ability: "turboblaze", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("blazing aura");
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Imposter", () => {
  it("given Imposter with opponent present, when switches in, then emits transform message", () => {
    // Source: Showdown data/abilities.ts — Imposter transforms into opponent
    const opponent = makeActivePokemon({ ability: "blaze", nickname: "Foe" });
    const ctx = makeContext({ ability: "imposter", trigger: "on-switch-in", opponent });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("transformed into");
  });

  it("given Imposter without opponent, when switches in, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Imposter requires a target
    const ctx = makeContext({ ability: "imposter", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-switch-in -- Illusion", () => {
  it("given Illusion, when switches in, then sets illusion volatile", () => {
    // Source: Showdown data/abilities.ts — Illusion onStart
    const ctx = makeContext({ ability: "illusion", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "illusion",
    });
  });

  it("given Illusion, when switches in, then no messages (disguise is silent)", () => {
    // Source: Showdown data/abilities.ts — Illusion: no message on activation
    const ctx = makeContext({ ability: "illusion", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.messages).toHaveLength(0);
  });
});

// ===========================================================================
// ON-SWITCH-OUT ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-switch-out -- Regenerator", () => {
  it("given Regenerator with 300 max HP, when switches out, then heals 100 HP (floor(300/3))", () => {
    // Source: Showdown data/abilities.ts — Regenerator: pokemon.heal(pokemon.baseMaxhp / 3)
    // floor(300 / 3) = 100
    const ctx = makeContext({
      ability: "regenerator",
      trigger: "on-switch-out",
      maxHp: 300,
      currentHp: 100,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 100 });
  });

  it("given Regenerator with 200 max HP, when switches out, then heals 66 HP (floor(200/3))", () => {
    // Source: Showdown data/abilities.ts — Regenerator: heals floor(maxHp/3)
    // floor(200 / 3) = 66
    const ctx = makeContext({
      ability: "regenerator",
      trigger: "on-switch-out",
      maxHp: 200,
      currentHp: 50,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 66 });
  });
});

describe("handleGen5SwitchAbility on-switch-out -- Natural Cure", () => {
  it("given Natural Cure with burn status, when switches out, then cures status", () => {
    // Source: Showdown data/abilities.ts — Natural Cure: cures status on switch-out
    const ctx = makeContext({
      ability: "natural-cure",
      trigger: "on-switch-out",
      status: "burn",
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "status-cure", target: "self" });
  });

  it("given Natural Cure with no status, when switches out, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Natural Cure: no-op without status
    const ctx = makeContext({
      ability: "natural-cure",
      trigger: "on-switch-out",
      status: null,
    });
    const result = handleGen5SwitchAbility("on-switch-out", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-CONTACT ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-contact -- Static", () => {
  it("given Static with RNG < 0.3, when attacker makes contact, then paralyzes attacker", () => {
    // Source: Showdown data/abilities.ts — Static: 30% paralysis on contact
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "static",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1], // < 0.3 = triggers
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "paralysis",
    });
  });

  it("given Static with RNG >= 0.3, when attacker makes contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Static: 30% threshold
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "static",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.5], // >= 0.3 = no trigger
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Flame Body", () => {
  it("given Flame Body with RNG < 0.3, when attacker makes contact, then burns attacker", () => {
    // Source: Showdown data/abilities.ts — Flame Body: 30% burn on contact
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "flame-body",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "burn",
    });
  });

  it("given Flame Body when attacker already has status, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — cannot inflict status if already statused
    const opponent = makeActivePokemon({ ability: "blaze", status: "poison" });
    const ctx = makeContext({
      ability: "flame-body",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Poison Point", () => {
  it("given Poison Point with RNG < 0.3, when attacker makes contact, then poisons attacker", () => {
    // Source: Showdown data/abilities.ts — Poison Point: 30% poison on contact
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "poison-point",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.2],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "poison",
    });
  });

  it("given Poison Point with RNG >= 0.3, when attacker makes contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Poison Point: 30% threshold
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "poison-point",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.9],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Rough Skin / Iron Barbs", () => {
  it("given Rough Skin with 200 HP attacker, when contact, then deals 25 chip (floor(200/8))", () => {
    // Source: Showdown data/abilities.ts — Rough Skin: source.baseMaxhp / 8
    // floor(200 / 8) = 25
    const opponent = makeActivePokemon({ ability: "blaze", maxHp: 200 });
    const ctx = makeContext({
      ability: "rough-skin",
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 25,
    });
  });

  it("given Iron Barbs with 160 HP attacker, when contact, then deals 20 chip (floor(160/8))", () => {
    // Source: Showdown data/abilities.ts — Iron Barbs: identical to Rough Skin (1/8 HP)
    // floor(160 / 8) = 20
    const opponent = makeActivePokemon({ ability: "blaze", maxHp: 160 });
    const ctx = makeContext({
      ability: "iron-barbs",
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 20,
    });
    expect(result.messages[0]).toContain("Iron Barbs");
  });
});

describe("handleGen5SwitchAbility on-contact -- Effect Spore", () => {
  it("given Effect Spore with roll 5 (0-9 range), when contact, then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts — Effect Spore: roll < 10 = sleep
    // RNG value 0.05 => floor(0.05 * 100) = 5
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.05],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "sleep",
    });
  });

  it("given Effect Spore with roll 15 (10-19 range), when contact, then inflicts paralysis", () => {
    // Source: Showdown data/abilities.ts — Effect Spore: 10 <= roll < 20 = paralysis
    // RNG value 0.15 => floor(0.15 * 100) = 15
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.15],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "paralysis",
    });
  });

  it("given Effect Spore with Grass-type attacker, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Gen 5+: Grass types immune to Effect Spore
    const opponent = makeActivePokemon({ ability: "blaze", types: ["grass"] });
    const ctx = makeContext({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.05],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Cute Charm", () => {
  it("given Cute Charm with opposite genders and RNG < 0.3, when contact, then infatuates", () => {
    // Source: Showdown data/abilities.ts — Cute Charm: 30% infatuation, opposite genders required
    const opponent = makeActivePokemon({
      ability: "blaze",
      gender: "male",
    });
    const ctx = makeContext({
      ability: "cute-charm",
      trigger: "on-contact",
      opponent,
      gender: "female",
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: "infatuation",
    });
  });

  it("given Cute Charm with same genders, when contact, then does not infatuate", () => {
    // Source: Showdown data/abilities.ts — Cute Charm: fails with same gender
    const opponent = makeActivePokemon({
      ability: "blaze",
      gender: "male",
    });
    const ctx = makeContext({
      ability: "cute-charm",
      trigger: "on-contact",
      opponent,
      gender: "male",
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Aftermath", () => {
  it("given Aftermath holder at 0 HP and 400 HP attacker, when contact KOs, then deals 100 chip", () => {
    // Source: Showdown data/abilities.ts — Aftermath: source.baseMaxhp / 4
    // floor(400 / 4) = 100
    const opponent = makeActivePokemon({ ability: "blaze", maxHp: 400 });
    const ctx = makeContext({
      ability: "aftermath",
      trigger: "on-contact",
      opponent,
      currentHp: 0,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "chip-damage",
      target: "opponent",
      value: 100,
    });
  });

  it("given Aftermath holder still alive, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Aftermath only triggers when holder faints
    const opponent = makeActivePokemon({ ability: "blaze", maxHp: 400 });
    const ctx = makeContext({
      ability: "aftermath",
      trigger: "on-contact",
      opponent,
      currentHp: 50,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Mummy", () => {
  it("given Mummy and attacker with regular ability, when contact, then changes attacker ability to Mummy", () => {
    // Source: Showdown data/abilities.ts — Mummy: source.setAbility('mummy', target)
    const opponent = makeActivePokemon({ ability: "blaze", nickname: "Foe" });
    const ctx = makeContext({
      ability: "mummy",
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: "mummy",
    });
  });

  it("given Mummy and attacker already has Mummy, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Mummy: sourceAbility.id === 'mummy' check
    const opponent = makeActivePokemon({ ability: "mummy", nickname: "Foe" });
    const ctx = makeContext({
      ability: "mummy",
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Mummy and attacker with Multitype, when contact, then does not overwrite (unsuppressable)", () => {
    // Source: Showdown data/abilities.ts — Mummy: cantsuppress flag blocks
    const opponent = makeActivePokemon({ ability: "multitype", nickname: "Foe" });
    const ctx = makeContext({
      ability: "mummy",
      trigger: "on-contact",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Poison Touch", () => {
  it("given Poison Touch attacker with RNG < 0.3, when making contact, then poisons target", () => {
    // Source: Showdown data/abilities.ts — Poison Touch: 30% poison on own contact moves
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "poison-touch",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "poison",
    });
  });

  it("given Poison Touch attacker with RNG >= 0.3, when making contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Poison Touch: 30% threshold
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "poison-touch",
      trigger: "on-contact",
      opponent,
      rngNextValues: [0.5],
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-contact -- Pickpocket", () => {
  it("given Pickpocket holder without item and attacker with item, when contact, then steals item", () => {
    // Source: Showdown data/abilities.ts — Pickpocket: steals attacker's item
    const opponent = makeActivePokemon({
      ability: "blaze",
      heldItem: "leftovers",
      nickname: "Foe",
    });
    const ctx = makeContext({
      ability: "pickpocket",
      trigger: "on-contact",
      opponent,
      heldItem: null,
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("leftovers");
  });

  it("given Pickpocket holder already has item, when contact, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Pickpocket: target.item check
    const opponent = makeActivePokemon({
      ability: "blaze",
      heldItem: "leftovers",
      nickname: "Foe",
    });
    const ctx = makeContext({
      ability: "pickpocket",
      trigger: "on-contact",
      opponent,
      heldItem: "choice-band",
    });
    const result = handleGen5SwitchAbility("on-contact", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-DAMAGE-TAKEN ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-damage-taken -- Cursed Body", () => {
  it("given Cursed Body with RNG < 0.3, when hit, then disables attacker's move", () => {
    // Source: Showdown data/abilities.ts — Cursed Body: randomChance(3, 10) = 30%
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "cursed-body",
      trigger: "on-damage-taken",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: "disable",
      data: { turnsLeft: 4 },
    });
  });

  it("given Cursed Body when attacker already disabled, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Cursed Body: source.volatiles['disable'] check
    const disableVolatile = new Map([["disable", { turnsLeft: 3 }]]) as unknown as Map<
      string,
      { turnsLeft: number }
    >;
    const opponent = makeActivePokemon({ ability: "blaze" });
    (opponent as any).volatileStatuses = disableVolatile;
    const ctx = makeContext({
      ability: "cursed-body",
      trigger: "on-damage-taken",
      opponent,
      rngNextValues: [0.1],
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-damage-taken -- Rattled", () => {
  it("given Rattled hit by Dark-type move, when takes damage, then Speed +1", () => {
    // Source: Showdown data/abilities.ts — Rattled: ['Dark', 'Bug', 'Ghost'].includes(move.type)
    const move = makeMove("dark");
    const ctx = makeContext({
      ability: "rattled",
      trigger: "on-damage-taken",
      move,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Rattled hit by Bug-type move, when takes damage, then Speed +1", () => {
    // Source: Showdown data/abilities.ts — Rattled triggers on Bug moves too
    const move = makeMove("bug");
    const ctx = makeContext({
      ability: "rattled",
      trigger: "on-damage-taken",
      move,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Rattled hit by Normal-type move, when takes damage, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Rattled: only Bug/Dark/Ghost
    const move = makeMove("normal");
    const ctx = makeContext({
      ability: "rattled",
      trigger: "on-damage-taken",
      move,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-damage-taken -- Illusion break", () => {
  it("given Illusion active, when takes damaging hit, then Illusion breaks", () => {
    // Source: Showdown data/abilities.ts — Illusion: onDamagingHit breaks disguise
    const volatiles = new Map([["illusion", { turnsLeft: -1 }]]) as unknown as Map<
      string,
      { turnsLeft: number }
    >;
    const ctx = makeContext({
      ability: "illusion",
      trigger: "on-damage-taken",
      volatiles,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Illusion was broken");
  });

  it("given no Illusion volatile, when takes damaging hit, then does not trigger", () => {
    // Source: Showdown data/abilities.ts — Illusion: only breaks if volatile exists
    const ctx = makeContext({
      ability: "illusion",
      trigger: "on-damage-taken",
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility on-damage-taken -- Synchronize", () => {
  it("given Synchronize with burn, when triggered, then spreads burn to opponent", () => {
    // Source: Showdown data/abilities.ts — Synchronize: passes burn/paralysis/poison
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "synchronize",
      trigger: "on-damage-taken",
      status: "burn",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "burn",
    });
  });

  it("given Synchronize with sleep, when triggered, then does NOT spread (sleep excluded)", () => {
    // Source: Showdown data/abilities.ts — Synchronize: status.id !== 'slp' && !== 'frz'
    const opponent = makeActivePokemon({ ability: "blaze" });
    const ctx = makeContext({
      ability: "synchronize",
      trigger: "on-damage-taken",
      status: "sleep",
      opponent,
    });
    const result = handleGen5SwitchAbility("on-damage-taken", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// PASSIVE-IMMUNITY ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility passive-immunity -- Levitate", () => {
  it("given Levitate and incoming Ground move, when passive check, then blocks move", () => {
    // Source: Showdown data/abilities.ts — Levitate: Ground immunity
    const move = makeMove("ground");
    const ctx = makeContext({ ability: "levitate", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
  });

  it("given Levitate and incoming Fire move, when passive check, then does not block", () => {
    // Source: Showdown data/abilities.ts — Levitate: only Ground
    const move = makeMove("fire");
    const ctx = makeContext({ ability: "levitate", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Flash Fire", () => {
  it("given Flash Fire and incoming Fire move, when passive check, then activates boost", () => {
    // Source: Showdown data/abilities.ts — Flash Fire: Fire immunity + flash-fire volatile
    const move = makeMove("fire");
    const ctx = makeContext({ ability: "flash-fire", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "flash-fire",
    });
  });

  it("given Flash Fire when frozen, when hit by Fire, then does NOT activate (allows thaw)", () => {
    // Source: Showdown — frozen Pokemon cannot activate Flash Fire
    const move = makeMove("fire");
    const ctx = makeContext({
      ability: "flash-fire",
      trigger: "passive-immunity",
      move,
      status: "freeze",
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Water Absorb", () => {
  it("given Water Absorb with 200 HP and incoming Water move, when passive check, then heals 50 HP", () => {
    // Source: Showdown data/abilities.ts — Water Absorb: heal 1/4 max HP
    // floor(200 / 4) = 50
    const move = makeMove("water");
    const ctx = makeContext({
      ability: "water-absorb",
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 50 });
  });

  it("given Water Absorb and incoming Fire move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Water Absorb: only Water
    const move = makeMove("fire");
    const ctx = makeContext({
      ability: "water-absorb",
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Volt Absorb", () => {
  it("given Volt Absorb with 160 HP and incoming Electric move, when passive check, then heals 40 HP", () => {
    // Source: Showdown data/abilities.ts — Volt Absorb: heal 1/4 max HP
    // floor(160 / 4) = 40
    const move = makeMove("electric");
    const ctx = makeContext({
      ability: "volt-absorb",
      trigger: "passive-immunity",
      move,
      maxHp: 160,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 40 });
  });

  it("given Volt Absorb and incoming Water move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Volt Absorb: only Electric
    const move = makeMove("water");
    const ctx = makeContext({
      ability: "volt-absorb",
      trigger: "passive-immunity",
      move,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Motor Drive", () => {
  it("given Motor Drive and incoming Electric move, when passive check, then raises Speed +1", () => {
    // Source: Showdown data/abilities.ts — Motor Drive: Electric immune + Speed +1
    const move = makeMove("electric");
    const ctx = makeContext({ ability: "motor-drive", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Motor Drive and incoming Ground move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Motor Drive: only Electric
    const move = makeMove("ground");
    const ctx = makeContext({ ability: "motor-drive", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Dry Skin", () => {
  it("given Dry Skin with 200 HP and incoming Water move, when passive check, then heals 50 HP", () => {
    // Source: Showdown data/abilities.ts — Dry Skin: Water immune + heal 1/4 HP
    // floor(200 / 4) = 50
    const move = makeMove("water");
    const ctx = makeContext({
      ability: "dry-skin",
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "heal", target: "self", value: 50 });
  });

  it("given Dry Skin and incoming Fire move, when passive check, then does not activate (Fire weakness handled in damage calc)", () => {
    // Source: Showdown data/abilities.ts — Dry Skin passive: only Water
    const move = makeMove("fire");
    const ctx = makeContext({
      ability: "dry-skin",
      trigger: "passive-immunity",
      move,
      maxHp: 200,
    });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Overcoat", () => {
  it("given Overcoat, when passive check triggered, then grants weather immunity", () => {
    // Source: Showdown data/mods/gen5/abilities.ts — Overcoat: sandstorm/hail immunity only
    const ctx = makeContext({ ability: "overcoat", trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "weather-immunity", target: "self" });
  });

  it("given Overcoat, when passive check triggered, then no messages (silent)", () => {
    // Source: Showdown data/mods/gen5/abilities.ts — Overcoat: no announcement
    const ctx = makeContext({ ability: "overcoat", trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.messages).toHaveLength(0);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Sand Rush", () => {
  it("given Sand Rush, when passive check triggered, then grants weather immunity", () => {
    // Source: Showdown data/abilities.ts — Sand Rush: sandstorm immunity
    const ctx = makeContext({ ability: "sand-rush", trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ effectType: "weather-immunity", target: "self" });
  });

  it("given Sand Rush, when passive check triggered, then speed doubling handled elsewhere", () => {
    // Source: Bulbapedia — Sand Rush: speed handled in getEffectiveSpeed, not here
    const ctx = makeContext({ ability: "sand-rush", trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    // Just confirm it returns weather-immunity, not stat-change
    expect(result.effects.every((e) => e.effectType !== "stat-change")).toBe(true);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Sap Sipper", () => {
  it("given Sap Sipper and incoming Grass move, when passive check, then raises Attack +1", () => {
    // Source: Showdown data/abilities.ts — Sap Sipper: Grass immune + Atk +1
    const move = makeMove("grass");
    const ctx = makeContext({ ability: "sap-sipper", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Sap Sipper and incoming Water move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Sap Sipper: only Grass
    const move = makeMove("water");
    const ctx = makeContext({ ability: "sap-sipper", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Magic Guard", () => {
  it("given Magic Guard, when passive check triggered, then activates (signals indirect damage immunity)", () => {
    // Source: Showdown data/abilities.ts — Magic Guard: immune to non-move damage
    const ctx = makeContext({ ability: "magic-guard", trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
  });

  it("given Magic Guard, when passive check triggered, then effect is none (flag only)", () => {
    // Source: Showdown data/abilities.ts — Magic Guard: no specific effects, just a flag
    const ctx = makeContext({ ability: "magic-guard", trigger: "passive-immunity" });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Storm Drain (Gen 5+)", () => {
  it("given Storm Drain and incoming Water move, when passive check, then raises SpAtk +1", () => {
    // Source: Bulbapedia — Storm Drain (Gen 5+): Water immune + SpAtk +1
    // Gen 5 changed from redirect-only (Gen 4) to immunity + boost
    const move = makeMove("water");
    const ctx = makeContext({ ability: "storm-drain", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Storm Drain and incoming Fire move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Storm Drain: only Water
    const move = makeMove("fire");
    const ctx = makeContext({ ability: "storm-drain", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

describe("handleGen5SwitchAbility passive-immunity -- Lightning Rod (Gen 5+)", () => {
  it("given Lightning Rod and incoming Electric move, when passive check, then raises SpAtk +1", () => {
    // Source: Bulbapedia — Lightning Rod (Gen 5+): Electric immune + SpAtk +1
    // Gen 5 changed from redirect-only (Gen 3-4) to immunity + boost
    const move = makeMove("electric");
    const ctx = makeContext({ ability: "lightning-rod", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Lightning Rod and incoming Water move, when passive check, then does not activate", () => {
    // Source: Showdown data/abilities.ts — Lightning Rod: only Electric
    const move = makeMove("water");
    const ctx = makeContext({ ability: "lightning-rod", trigger: "passive-immunity", move });
    const result = handleGen5SwitchAbility("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// ON-STAT-CHANGE ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-stat-change -- Big Pecks", () => {
  it("given Big Pecks, when stat change triggers, then activates to block Defense drop", () => {
    // Source: Showdown data/abilities.ts — Big Pecks: prevents Defense from being lowered
    const ctx = makeContext({ ability: "big-pecks", trigger: "on-stat-change" });
    const result = handleGen5SwitchAbility("on-stat-change", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Defense");
  });

  it("given Big Pecks, when stat change triggers, then effect is informational only", () => {
    // Source: Showdown data/abilities.ts — Big Pecks: engine reads activated=true to block
    const ctx = makeContext({ ability: "big-pecks", trigger: "on-stat-change" });
    const result = handleGen5SwitchAbility("on-stat-change", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

// ===========================================================================
// ON-ACCURACY-CHECK ABILITIES
// ===========================================================================

describe("handleGen5SwitchAbility on-accuracy-check -- Victory Star", () => {
  it("given Victory Star, when accuracy check triggers, then activates", () => {
    // Source: Showdown data/abilities.ts — Victory Star: accuracy * 4506/4096
    const ctx = makeContext({ ability: "victory-star", trigger: "on-accuracy-check" });
    const result = handleGen5SwitchAbility("on-accuracy-check", ctx);

    expect(result.activated).toBe(true);
  });

  it("given Victory Star, when accuracy check triggers, then effect is informational", () => {
    // Source: Showdown data/abilities.ts — actual accuracy modification is in engine
    const ctx = makeContext({ ability: "victory-star", trigger: "on-accuracy-check" });
    const result = handleGen5SwitchAbility("on-accuracy-check", ctx);

    expect(result.effects[0]).toEqual({ effectType: "none", target: "self" });
  });
});

// ===========================================================================
// TRAPPING ABILITIES
// ===========================================================================

describe("isTrappedByAbility", () => {
  it("given Shadow Tag trapper and non-Shadow-Tag opponent, when check, then trapped", () => {
    // Source: Showdown data/abilities.ts — Shadow Tag: traps unless opponent also has Shadow Tag
    const result = isTrappedByAbility(
      { ability: "shadow-tag" },
      { ability: "blaze", types: ["fire"] },
      true,
    );
    expect(result).toBe(true);
  });

  it("given Shadow Tag trapper and Shadow Tag opponent, when check, then not trapped", () => {
    // Source: Showdown data/abilities.ts — Shadow Tag: does not trap another Shadow Tag
    const result = isTrappedByAbility(
      { ability: "shadow-tag" },
      { ability: "shadow-tag", types: ["psychic"] },
      true,
    );
    expect(result).toBe(false);
  });

  it("given Arena Trap trapper and grounded opponent, when check, then trapped", () => {
    // Source: Showdown data/abilities.ts — Arena Trap: traps grounded opponents
    const result = isTrappedByAbility(
      { ability: "arena-trap" },
      { ability: "blaze", types: ["fire"] },
      true,
    );
    expect(result).toBe(true);
  });

  it("given Arena Trap trapper and non-grounded opponent, when check, then not trapped", () => {
    // Source: Showdown data/abilities.ts — Arena Trap: does not trap flying/levitating
    const result = isTrappedByAbility(
      { ability: "arena-trap" },
      { ability: "levitate", types: ["fire"] },
      false,
    );
    expect(result).toBe(false);
  });

  it("given Magnet Pull trapper and Steel-type opponent, when check, then trapped", () => {
    // Source: Showdown data/abilities.ts — Magnet Pull: traps Steel types
    const result = isTrappedByAbility(
      { ability: "magnet-pull" },
      { ability: "blaze", types: ["steel"] },
      true,
    );
    expect(result).toBe(true);
  });

  it("given Magnet Pull trapper and non-Steel opponent, when check, then not trapped", () => {
    // Source: Showdown data/abilities.ts — Magnet Pull: only Steel types
    const result = isTrappedByAbility(
      { ability: "magnet-pull" },
      { ability: "blaze", types: ["fire"] },
      true,
    );
    expect(result).toBe(false);
  });
});

// ===========================================================================
// UTILITY EXPORTS
// ===========================================================================

describe("isMoldBreakerAbility", () => {
  it("given mold-breaker, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts — Mold Breaker sets move.ignoreAbility
    expect(isMoldBreakerAbility("mold-breaker")).toBe(true);
  });

  it("given teravolt, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts — Teravolt sets move.ignoreAbility
    expect(isMoldBreakerAbility("teravolt")).toBe(true);
  });

  it("given turboblaze, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts — Turboblaze sets move.ignoreAbility
    expect(isMoldBreakerAbility("turboblaze")).toBe(true);
  });

  it("given blaze, when checking, then returns false", () => {
    // Source: Showdown data/abilities.ts — Blaze is not a Mold Breaker variant
    expect(isMoldBreakerAbility("blaze")).toBe(false);
  });
});

describe("VICTORY_STAR_ACCURACY_MULTIPLIER", () => {
  it("equals approximately 1.1 (4506/4096 from Showdown)", () => {
    // Source: Showdown data/abilities.ts — victorystar: chainModify([4506, 4096])
    // 4506 / 4096 = 1.10009765625
    expect(VICTORY_STAR_ACCURACY_MULTIPLIER).toBeCloseTo(1.1, 2);
  });

  it("equals exactly 4506/4096", () => {
    // Source: Showdown data/abilities.ts — victorystar: chainModify([4506, 4096])
    expect(VICTORY_STAR_ACCURACY_MULTIPLIER).toBe(4506 / 4096);
  });
});

// ===========================================================================
// UNKNOWN / DEFAULT TRIGGERS
// ===========================================================================

describe("handleGen5SwitchAbility default behavior", () => {
  it("given unknown ability for any trigger, when dispatched, then returns no effect", () => {
    const ctx = makeContext({ ability: "some-unknown-ability", trigger: "on-switch-in" });
    const result = handleGen5SwitchAbility("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given unknown trigger type, when dispatched, then returns no effect", () => {
    const ctx = makeContext({ ability: "intimidate", trigger: "on-turn-end" });
    const result = handleGen5SwitchAbility("on-turn-end" as any, ctx);

    expect(result.activated).toBe(false);
  });
});
