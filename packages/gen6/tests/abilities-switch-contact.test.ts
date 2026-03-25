import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  handleGen6SwitchAbility,
  isBulletproofBlocked,
  isMoldBreakerAbility,
  isTrappedByAbility,
  VICTORY_STAR_ACCURACY_MULTIPLIER,
} from "../src/Gen6AbilitiesSwitch";

/**
 * Gen 6 switch-in, contact, and passive ability tests.
 *
 * Tests Gen 6-specific behavior including:
 *   - Weather abilities now set 5-turn weather (not permanent as in Gen 5)
 *   - Stance Change (new Gen 6)
 *   - Overcoat blocks powder moves (new Gen 6 addition)
 *   - Bulletproof (new Gen 6)
 *   - Sweet Veil (new Gen 6)
 *   - Flower Veil (new Gen 6)
 *   - Aroma Veil (new Gen 6)
 *   - Trace updated ban list (blocks Stance Change)
 *   - All carry-forward contact/switch abilities
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function makeTestUid() {
  return `test-${nextTestUid++}`;
}

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
  gender?: "male" | "female" | "genderless";
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: makeTestUid(),
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
    status: (overrides.status as PokemonInstance["status"]) ?? null,
    friendship: 0,
    gender: overrides.gender ?? "male",
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
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: string | null;
  heldItem?: string | null;
  gender?: "male" | "female" | "genderless";
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
      heldItem: overrides.heldItem,
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
    suppressedAbility: null,
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
    stellarBoostedTypes: [],
    forcedMove: null,
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

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
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

function makeMove(
  type: PokemonType,
  opts: {
    id?: string;
    displayName?: string;
    category?: "physical" | "special" | "status";
    flags?: Record<string, boolean>;
    effect?: { type: string; [key: string]: unknown } | null;
  } = {},
): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: opts.displayName ?? "Test Move",
    type,
    category: opts.category ?? "physical",
    power: opts.category === "status" ? 0 : 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 6,
    flags: opts.flags ?? { contact: true },
    effect: opts.effect ?? null,
    effectChance: null,
    secondaryEffects: [],
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  move?: MoveData;
  nickname?: string;
  heldItem?: string | null;
  speciesId?: number;
  status?: string | null;
  gender?: "male" | "female" | "genderless";
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  rngNext?: number;
  maxHp?: number;
  statChange?: { stat: string; stages: number; source: "self" | "opponent" };
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    speciesId: opts.speciesId,
    status: opts.status,
    heldItem: opts.heldItem,
    gender: opts.gender,
    substituteHp: opts.substituteHp,
    volatiles: opts.volatiles,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
    statChange: opts.statChange,
    rng: {
      next: () => opts.rngNext ?? 0,
      int: () => 1,
      chance: () => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// on-switch-in: Weather abilities (Gen 6: 5-turn, not permanent)
// ===========================================================================

describe("Drizzle (Gen 6: 5-turn rain)", () => {
  it("given Drizzle, when on-switch-in, then sets rain for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- drizzle sets 5-turn rain in Gen 6
    // Source: Bulbapedia "Drizzle" Gen VI -- "Summons rain for 5 turns on entry."
    const ctx = makeContext({ ability: "drizzle", trigger: "on-switch-in" });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect).toBeDefined();
    expect(weatherEffect?.weather).toBe("rain");
    // Gen 6 key change: 5 turns, not -1 (permanent)
    expect(weatherEffect?.weatherTurns).toBe(5);
  });

  it("given Drizzle, when on-switch-in, then produces expected message", () => {
    // Source: Showdown data/abilities.ts -- drizzle onStart message
    const ctx = makeContext({ ability: "drizzle", trigger: "on-switch-in", nickname: "Politoed" });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Politoed");
    expect(result.messages[0]).toContain("rain");
  });
});

describe("Drought (Gen 6: 5-turn sun)", () => {
  it("given Drought, when on-switch-in, then sets sun for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- drought sets 5-turn sun in Gen 6
    // Source: Bulbapedia "Drought" Gen VI -- "Summons sunlight for 5 turns on entry."
    const ctx = makeContext({ ability: "drought", trigger: "on-switch-in" });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe("sun");
    expect(weatherEffect?.weatherTurns).toBe(5);
  });

  it("given Drought, when on-switch-in, then Gen 6 weather is 5 turns NOT permanent", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- drought weatherTurns: -1 (Gen 5 permanent)
    // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 sets weatherTurns: 5
    const ctx = makeContext({ ability: "drought", trigger: "on-switch-in" });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weatherTurns).not.toBe(-1);
    expect(weatherEffect?.weatherTurns).toBe(5);
  });
});

describe("Sand Stream (Gen 6: 5-turn sandstorm)", () => {
  it("given Sand Stream, when on-switch-in, then sets sandstorm for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- sand-stream sets 5-turn sandstorm in Gen 6
    const ctx = makeContext({ ability: "sand-stream", trigger: "on-switch-in" });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe("sand");
    expect(weatherEffect?.weatherTurns).toBe(5);
  });

  it("given Snow Warning, when on-switch-in, then sets hail for 5 turns", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- snow-warning sets 5-turn hail in Gen 6
    const ctx = makeContext({ ability: "snow-warning", trigger: "on-switch-in" });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    const weatherEffect = result.effects.find((e) => e.effectType === "weather-set");
    expect(weatherEffect?.weather).toBe("hail");
    expect(weatherEffect?.weatherTurns).toBe(5);
  });
});

// ===========================================================================
// on-switch-in: Stance Change (NEW Gen 6)
// ===========================================================================

describe("Stance Change (Gen 6 new)", () => {
  it("given Stance Change on Aegislash (speciesId 681), when on-switch-in, then activates", () => {
    // Source: Showdown data/abilities.ts -- stancechange onStart for Aegislash
    // Source: Bulbapedia "Stance Change" -- Aegislash changes form based on move used
    const ctx = makeContext({
      ability: "stance-change",
      trigger: "on-switch-in",
      speciesId: 681,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Stance Change on non-Aegislash species, when on-switch-in, then does not activate", () => {
    // Stance Change only applies to Aegislash (speciesId 681)
    // Source: Showdown data/abilities.ts -- stancechange: only applied to Aegislash
    const ctx = makeContext({
      ability: "stance-change",
      trigger: "on-switch-in",
      speciesId: 1,
    });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-switch-in: Intimidate
// ===========================================================================

describe("Intimidate", () => {
  it("given Intimidate, when on-switch-in with opponent, then lowers opponent Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- intimidate: lower opponent Attack by 1
    // Source: Bulbapedia "Intimidate" -- "Lowers the foe's Attack stat by one stage upon entry."
    const opponent = makeActivePokemon({ ability: "none", types: ["normal"] });
    const ctx = makeContext({ ability: "intimidate", trigger: "on-switch-in", opponent });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    const statEffect = result.effects.find((e) => e.effectType === "stat-change");
    expect(statEffect?.stat).toBe("attack");
    expect(statEffect?.stages).toBe(-1);
    expect(statEffect?.target).toBe("opponent");
  });

  it("given Intimidate, when opponent has a Substitute active, then does not activate", () => {
    // Source: Showdown Gen 6 -- Intimidate blocked by Substitute
    // Source: Bulbapedia "Intimidate" -- "Blocked by Substitute"
    const opponent = makeActivePokemon({ ability: "none", substituteHp: 50 });
    const ctx = makeContext({ ability: "intimidate", trigger: "on-switch-in", opponent });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-switch-in: Trace (Gen 6 ban list includes Stance Change)
// ===========================================================================

describe("Trace (Gen 6 expanded ban list)", () => {
  it("given Trace, when opponent has a copyable ability, then copies it", () => {
    // Source: Showdown data/abilities.ts -- trace: copies opponent ability on switch-in
    const opponent = makeActivePokemon({ ability: "swift-swim" });
    const ctx = makeContext({ ability: "trace", trigger: "on-switch-in", opponent });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    const abilityEffect = result.effects.find((e) => e.effectType === "ability-change");
    expect(abilityEffect?.newAbility).toBe("swift-swim");
  });

  it("given Trace, when opponent has Stance Change, then cannot copy (Gen 6 ban)", () => {
    // Source: Bulbapedia "Trace" Gen VI -- "Cannot copy Stance Change, Power Construct"
    // Gen 6 added Stance Change to the uncopyable list
    const opponent = makeActivePokemon({ ability: "stance-change" });
    const ctx = makeContext({ ability: "trace", trigger: "on-switch-in", opponent });
    const result = handleGen6SwitchAbility("on-switch-in", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-switch-out: Regenerator / Natural Cure
// ===========================================================================

describe("Regenerator", () => {
  it("given Regenerator, when on-switch-out, then heals 1/3 max HP", () => {
    // Source: Showdown data/abilities.ts -- regenerator: heals 1/3 maxHp on switch-out
    // Source: Bulbapedia "Regenerator" -- "Restores 1/3 of its maximum HP upon switching out."
    // floor(300 / 3) = 100
    const ctx = makeContext({ ability: "regenerator", trigger: "on-switch-out", maxHp: 300 });
    const result = handleGen6SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.effectType === "heal");
    expect(healEffect?.value).toBe(100);
  });

  it("given Regenerator at 1 HP, when on-switch-out, then heals at least 1", () => {
    // Source: Showdown data/abilities.ts -- Math.max(1, floor(maxHp/3))
    // floor(1 / 3) = 0, but clamped to 1
    const ctx = makeContext({ ability: "regenerator", trigger: "on-switch-out", maxHp: 1 });
    const result = handleGen6SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.effectType === "heal");
    // Math.max(1, Math.floor(1 / 3)) = Math.max(1, 0) = 1
    expect(healEffect?.value).toBe(1);
  });
});

describe("Natural Cure", () => {
  it("given Natural Cure with a status condition, when on-switch-out, then cures status", () => {
    // Source: Showdown data/abilities.ts -- naturalcure: cures status on switch-out
    // Source: Bulbapedia "Natural Cure" -- "All status conditions are healed upon switching out."
    const ctx = makeContext({ ability: "natural-cure", trigger: "on-switch-out", status: "burn" });
    const result = handleGen6SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-cure");
  });

  it("given Natural Cure with no status condition, when on-switch-out, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- naturalcure: only fires if status exists
    const ctx = makeContext({ ability: "natural-cure", trigger: "on-switch-out", status: null });
    const result = handleGen6SwitchAbility("on-switch-out", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Static / Flame Body / Poison Point
// ===========================================================================

describe("Static (on-contact)", () => {
  it("given Static, when RNG < 30%, then paralyzes attacker", () => {
    // Source: Showdown data/abilities.ts -- static: 30% paralysis on contact
    // Source: Bulbapedia "Static" -- "30% chance of paralyzing on contact."
    // rngNext = 0 < 0.3, so paralysis triggers
    const attacker = makeActivePokemon({ ability: "none" });
    const ctx = makeContext({
      ability: "static",
      trigger: "on-contact",
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect?.status).toBe("paralysis");
  });

  it("given Static, when RNG >= 30%, then does not paralyze", () => {
    // Source: Showdown data/abilities.ts -- static: this.randomChance(3, 10) = 30%
    // rngNext = 0.5 >= 0.3, so no paralysis
    const attacker = makeActivePokemon({ ability: "none" });
    const ctx = makeContext({
      ability: "static",
      trigger: "on-contact",
      opponent: attacker,
      rngNext: 0.5,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Flame Body (on-contact)", () => {
  it("given Flame Body, when RNG < 30%, then burns attacker", () => {
    // Source: Showdown data/abilities.ts -- flamebody: 30% burn on contact
    const attacker = makeActivePokemon({ ability: "none" });
    const ctx = makeContext({
      ability: "flame-body",
      trigger: "on-contact",
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect?.status).toBe("burn");
  });

  it("given Flame Body, when attacker already has status, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- status already present = no status inflict
    const attacker = makeActivePokemon({ ability: "none", status: "paralysis" });
    const ctx = makeContext({
      ability: "flame-body",
      trigger: "on-contact",
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Rough Skin / Iron Barbs
// ===========================================================================

describe("Rough Skin / Iron Barbs (on-contact)", () => {
  it("given Rough Skin, when attacker makes contact, then deals 1/8 attacker max HP chip", () => {
    // Source: Showdown data/abilities.ts -- roughskin: 1/8 attacker max HP on contact
    // Source: Bulbapedia "Rough Skin" -- "Damages the attacker for 1/8 of its max HP."
    // floor(200 / 8) = 25
    const attacker = makeActivePokemon({ ability: "none", maxHp: 200 });
    const ctx = makeContext({
      ability: "rough-skin",
      trigger: "on-contact",
      opponent: attacker,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    const chipEffect = result.effects.find((e) => e.effectType === "chip-damage");
    expect(chipEffect?.value).toBe(25);
  });

  it("given Iron Barbs, when attacker makes contact, then deals same 1/8 attacker max HP chip", () => {
    // Source: Showdown data/abilities.ts -- ironbarbs: identical to roughskin
    // Source: Bulbapedia "Iron Barbs" -- "Same as Rough Skin."
    const attacker = makeActivePokemon({ ability: "none", maxHp: 160 });
    const ctx = makeContext({
      ability: "iron-barbs",
      trigger: "on-contact",
      opponent: attacker,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    const chipEffect = result.effects.find((e) => e.effectType === "chip-damage");
    // floor(160 / 8) = 20
    expect(chipEffect?.value).toBe(20);
  });
});

// ===========================================================================
// on-contact: Mummy
// ===========================================================================

describe("Mummy (on-contact)", () => {
  it("given Mummy, when attacker has a copyable ability, then overwrites attacker's ability", () => {
    // Source: Showdown data/abilities.ts -- mummy: changes attacker ability to Mummy on contact
    const attacker = makeActivePokemon({ ability: "swift-swim" });
    const ctx = makeContext({ ability: "mummy", trigger: "on-contact", opponent: attacker });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    const abilityEffect = result.effects.find((e) => e.effectType === "ability-change");
    expect(abilityEffect?.newAbility).toBe("mummy");
  });

  it("given Mummy, when attacker already has Mummy, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- mummy: cannot overwrite Mummy itself
    const attacker = makeActivePokemon({ ability: "mummy" });
    const ctx = makeContext({ ability: "mummy", trigger: "on-contact", opponent: attacker });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mummy, when attacker has Wonder Guard, then DOES overwrite (Wonder Guard is suppressable in Gen 6)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Gen 6 UNSUPPRESSABLE only includes
    // multitype, stance-change, zen-mode. Wonder Guard is NOT unsuppressable.
    // Bug #672: Previously UNSUPPRESSABLE_ABILITIES included Gen 7+ abilities like
    // wonder-guard, shields-down, power-construct, etc. which don't apply in Gen 6.
    const attacker = makeActivePokemon({ ability: "wonder-guard" });
    const ctx = makeContext({ ability: "mummy", trigger: "on-contact", opponent: attacker });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    const abilityEffect = result.effects.find((e) => e.effectType === "ability-change");
    expect(abilityEffect?.newAbility).toBe("mummy");
  });

  it("given Mummy, when attacker has Stance Change, then does NOT overwrite (unsuppressable in Gen 6)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- stance-change: cantsuppress: 1
    // Stance Change IS in the Gen 6 unsuppressable set.
    const attacker = makeActivePokemon({ ability: "stance-change" });
    const ctx = makeContext({ ability: "mummy", trigger: "on-contact", opponent: attacker });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Effect Spore (Gen 6: Overcoat blocks it)
// ===========================================================================

describe("Effect Spore (on-contact)", () => {
  it("given Effect Spore, when RNG yields sleep (0-9 range), then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts -- effectspore: roll 0-9 = sleep
    // Using rngNext = 0 / 100 = 0 (first roll < 10 → sleep)
    // We mock rng.next() * 100 to be 0
    const attacker = makeActivePokemon({ ability: "none", types: ["normal"] });
    const ctxWith0Roll = {
      pokemon: makeActivePokemon({ ability: "effect-spore" }),
      opponent: attacker,
      state: makeBattleState(),
      trigger: "on-contact",
      rng: { next: () => 0, int: () => 0 },
    } as unknown as AbilityContext;
    const result = handleGen6SwitchAbility("on-contact", ctxWith0Roll);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.status).toBe("sleep");
  });

  it("given Effect Spore, when attacker has Overcoat (Gen 6), then does not activate", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- overcoat: blocks Effect Spore in Gen 6
    // Gen 5: Overcoat only blocks weather, NOT Effect Spore
    // Gen 6: Overcoat also blocks powder/spore moves and effects like Effect Spore
    const attacker = makeActivePokemon({ ability: "overcoat", types: ["normal"] });
    const ctx = makeContext({
      ability: "effect-spore",
      trigger: "on-contact",
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-damage-taken: Cursed Body / Rattled / Illusion
// ===========================================================================

describe("Cursed Body (on-damage-taken)", () => {
  it("given Cursed Body, when RNG < 30%, then disables attacker's last move", () => {
    // Source: Showdown data/abilities.ts -- cursedbody: 30% disable on damage
    const attacker = makeActivePokemon({ ability: "none" });
    const ctx = makeContext({
      ability: "cursed-body",
      trigger: "on-damage-taken",
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-inflict");
    expect(volatileEffect?.volatile).toBe("disable");
  });

  it("given Cursed Body, when attacker already has disable volatile, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- cursedbody: skips if already disabled
    const disabledVolatiles = new Map([["disable", { turnsLeft: 4 }]]);
    const attacker = makeActivePokemon({ ability: "none", volatiles: disabledVolatiles });
    const ctx = makeContext({
      ability: "cursed-body",
      trigger: "on-damage-taken",
      opponent: attacker,
      rngNext: 0,
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Rattled (on-damage-taken)", () => {
  it("given Rattled, when hit by a Dark move, then raises Speed by 1", () => {
    // Source: Showdown data/abilities.ts -- rattled: +1 Speed from Bug/Dark/Ghost hit
    const darkMove = makeMove("dark");
    const ctx = makeContext({
      ability: "rattled",
      trigger: "on-damage-taken",
      move: darkMove,
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(true);
    const statEffect = result.effects.find((e) => e.effectType === "stat-change");
    expect(statEffect?.stat).toBe("speed");
    expect(statEffect?.stages).toBe(1);
  });

  it("given Rattled, when hit by a Fire move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- rattled: only Bug/Dark/Ghost
    const fireMove = makeMove("fire");
    const ctx = makeContext({
      ability: "rattled",
      trigger: "on-damage-taken",
      move: fireMove,
    });
    const result = handleGen6SwitchAbility("on-damage-taken", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-status-inflicted: Synchronize
// ===========================================================================

describe("Synchronize (on-status-inflicted)", () => {
  it("given Synchronize, when burned by opponent, then inflicts burn on opponent", () => {
    // Source: Showdown data/abilities.ts -- synchronize: spreads burn/paralysis/poison back
    const ctx = makeContext({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      status: "burn",
      opponent: makeActivePokemon({ ability: "none" }),
    });
    const result = handleGen6SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(true);
    const statusEffect = result.effects.find((e) => e.effectType === "status-inflict");
    expect(statusEffect?.status).toBe("burn");
    expect(statusEffect?.target).toBe("opponent");
  });

  it("given Synchronize, when put to sleep by opponent, then does NOT spread sleep", () => {
    // Source: Showdown data/abilities.ts -- synchronize: only burn/paralysis/poison, not sleep
    const ctx = makeContext({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      status: "sleep",
      opponent: makeActivePokemon({ ability: "none" }),
    });
    const result = handleGen6SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Overcoat (Gen 6: also blocks powder)
// ===========================================================================

describe("Overcoat (Gen 6: blocks powder moves)", () => {
  it("given Overcoat, when hit by a powder move, then blocks it (Gen 6 new)", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- overcoat: also blocks powder flag
    // Gen 6 change: Overcoat now blocks moves with the powder flag (Sleep Powder, Spore, etc.)
    // Source: Bulbapedia "Overcoat" Gen VI -- "Also protects from powder and spore moves."
    const powderMove = makeMove("grass", { id: "sleep-powder", flags: { powder: true } });
    const ctx = makeContext({
      ability: "overcoat",
      trigger: "passive-immunity",
      move: powderMove,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Overcoat, when hit by a non-powder move, then returns no passive-immunity effect", () => {
    // Source: Showdown data/abilities.ts -- overcoat's weather immunity is handled
    // by the weather module, not the passive-immunity hook.
    const normalMove = makeMove("normal", { flags: {} });
    const ctx = makeContext({
      ability: "overcoat",
      trigger: "passive-immunity",
      move: normalMove,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ===========================================================================
// passive-immunity: Bulletproof (NEW Gen 6)
// ===========================================================================

describe("Bulletproof (Gen 6 new)", () => {
  it("given Bulletproof, when hit by Shadow Ball (bullet flag), then blocks it", () => {
    // Source: Showdown data/abilities.ts -- bulletproof: blocks moves with bullet flag
    // Source: Bulbapedia "Bulletproof" -- "Protects the Pokemon from some ball and bomb moves."
    const shadowBall = makeMove("ghost", { id: "shadow-ball", flags: { bullet: true } });
    const ctx = makeContext({
      ability: "bulletproof",
      trigger: "passive-immunity",
      move: shadowBall,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Bulletproof, when hit by a non-ball move like Flamethrower, then does not block", () => {
    // Source: Showdown data/abilities.ts -- bulletproof: only blocks flagged ball/bomb moves
    const flamethrower = makeMove("fire", { id: "flamethrower" });
    const ctx = makeContext({
      ability: "bulletproof",
      trigger: "passive-immunity",
      move: flamethrower,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("isBulletproofBlocked utility", () => {
  it("given bulletproof ability and move with bullet flag, then returns true", () => {
    // Source: Showdown data/abilities.ts -- bulletproof checks move.flags.bullet
    expect(isBulletproofBlocked("bulletproof", { bullet: true })).toBe(true);
  });

  it("given bulletproof ability and move without bullet flag, then returns false", () => {
    // Source: Showdown data/abilities.ts -- no bullet flag = not blocked
    expect(isBulletproofBlocked("bulletproof", {})).toBe(false);
  });

  it("given non-bulletproof ability and move with bullet flag, then returns false", () => {
    // Source: Showdown data/abilities.ts -- only bulletproof blocks bullet moves
    expect(isBulletproofBlocked("blaze", { bullet: true })).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Sweet Veil (NEW Gen 6)
// ===========================================================================

describe("Sweet Veil (Gen 6 new)", () => {
  it("given Sweet Veil, when targeted by Sleep Powder (sleep effect), then blocks sleep", () => {
    // Source: Showdown data/abilities.ts -- sweetveil: prevents sleep on holder and allies
    // Source: Bulbapedia "Sweet Veil" -- "Prevents the Pokemon and its allies from falling asleep."
    const sleepPowder = makeMove("grass", {
      id: "sleep-powder",
      category: "status",
      effect: { type: "status-guaranteed", status: "sleep" },
    });
    const ctx = makeContext({
      ability: "sweet-veil",
      trigger: "passive-immunity",
      move: sleepPowder,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sweet Veil, when targeted by Spore (sleep effect), then also blocks sleep", () => {
    // Source: Bulbapedia "Sweet Veil" -- blocks all sleep-inducing moves
    const spore = makeMove("grass", {
      id: "spore",
      category: "status",
      effect: { type: "status-guaranteed", status: "sleep" },
    });
    const ctx = makeContext({
      ability: "sweet-veil",
      trigger: "passive-immunity",
      move: spore,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sweet Veil, when targeted by Thunder Wave (paralyze, not sleep), then does NOT block", () => {
    // Source: Showdown data/abilities.ts -- Sweet Veil only blocks sleep
    // Bug #668: Previously checked hardcoded move IDs. Now checks move.effect for sleep status.
    // A non-sleep status move should not trigger Sweet Veil.
    const thunderWave = makeMove("electric", {
      id: "thunder-wave",
      category: "status",
      effect: { type: "status-guaranteed", status: "paralysis" },
    });
    const ctx = makeContext({
      ability: "sweet-veil",
      trigger: "passive-immunity",
      move: thunderWave,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sweet Veil, when targeted by Yawn (volatile sleep), then blocks it", () => {
    // Source: Showdown data/abilities.ts -- Sweet Veil prevents all forms of sleep, including Yawn
    // Source: Bulbapedia "Sweet Veil" -- prevents sleep; Yawn leads to sleep so it's blocked
    const yawn = makeMove("normal", {
      id: "yawn",
      category: "status",
      effect: { type: "volatile-status", status: "yawn" },
    });
    const ctx = makeContext({
      ability: "sweet-veil",
      trigger: "passive-immunity",
      move: yawn,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// passive-immunity: Flash Fire / Water Absorb / Sap Sipper
// ===========================================================================

describe("Flash Fire (passive-immunity)", () => {
  it("given Flash Fire, when hit by a Fire move, then activates and grants boost", () => {
    // Source: Showdown data/abilities.ts -- flashfire: immune to Fire + gains flash-fire boost
    // Source: Bulbapedia "Flash Fire" -- "Powers up Fire moves when hit by Fire-type moves."
    const fireMove = makeMove("fire");
    const ctx = makeContext({ ability: "flash-fire", trigger: "passive-immunity", move: fireMove });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-inflict");
    expect(volatileEffect?.volatile).toBe("flash-fire");
  });

  it("given Flash Fire, when hit by a Water move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- flashfire: only triggers on fire-type moves
    const waterMove = makeMove("water");
    const ctx = makeContext({
      ability: "flash-fire",
      trigger: "passive-immunity",
      move: waterMove,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Water Absorb (passive-immunity)", () => {
  it("given Water Absorb, when hit by a Water move, then heals 1/4 max HP", () => {
    // Source: Showdown data/abilities.ts -- waterabsorb: Water immune + heal 1/4 HP
    // Source: Bulbapedia "Water Absorb" -- "Heals 1/4 max HP when hit by Water-type moves."
    // floor(200 / 4) = 50
    const waterMove = makeMove("water");
    const ctx = makeContext({
      ability: "water-absorb",
      trigger: "passive-immunity",
      move: waterMove,
      maxHp: 200,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
    const healEffect = result.effects.find((e) => e.effectType === "heal");
    expect(healEffect?.value).toBe(50);
  });

  it("given Water Absorb, when hit by a Fire move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- waterabsorb: only water-type
    const fireMove = makeMove("fire");
    const ctx = makeContext({
      ability: "water-absorb",
      trigger: "passive-immunity",
      move: fireMove,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Sap Sipper (passive-immunity)", () => {
  it("given Sap Sipper, when hit by a Grass move, then raises Attack by 1", () => {
    // Source: Showdown data/abilities.ts -- sapsipper: Grass immune + Attack +1
    const grassMove = makeMove("grass");
    const ctx = makeContext({
      ability: "sap-sipper",
      trigger: "passive-immunity",
      move: grassMove,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(true);
    const statEffect = result.effects.find((e) => e.effectType === "stat-change");
    expect(statEffect?.stat).toBe("attack");
    expect(statEffect?.stages).toBe(1);
  });

  it("given Sap Sipper, when hit by a Water move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- sapsipper: only grass-type
    const waterMove = makeMove("water");
    const ctx = makeContext({
      ability: "sap-sipper",
      trigger: "passive-immunity",
      move: waterMove,
    });
    const result = handleGen6SwitchAbility("passive-immunity", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-stat-change: Big Pecks / Flower Veil
// ===========================================================================

describe("Big Pecks (on-stat-change)", () => {
  it("given Big Pecks, when Defense is about to be lowered, then blocks the drop", () => {
    // Source: Showdown data/abilities.ts -- bigpecks: blocks Defense drops
    const ctx = makeContext({
      ability: "big-pecks",
      trigger: "on-stat-change",
      statChange: { stat: "defense", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility("on-stat-change", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Big Pecks, when Speed is lowered (not Defense), then does not activate", () => {
    // Source: Showdown data/abilities.ts -- bigpecks: only Defense
    const ctx = makeContext({
      ability: "big-pecks",
      trigger: "on-stat-change",
      statChange: { stat: "speed", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility("on-stat-change", ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Flower Veil (Gen 6 new, on-stat-change)", () => {
  it("given Flower Veil on a Grass-type, when opponent lowers a stat, then blocks the drop", () => {
    // Source: Showdown data/abilities.ts -- flowerveil: blocks stat drops for Grass-type holders
    // Source: Bulbapedia "Flower Veil" -- "Prevents lowering of ally Grass-type Pokemon's stats."
    const opponent = makeActivePokemon({ ability: "none" });
    const ctx = makeContext({
      ability: "flower-veil",
      trigger: "on-stat-change",
      types: ["grass"],
      opponent,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility("on-stat-change", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Flower Veil on a non-Grass-type, when stat is lowered, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- flowerveil: only for Grass types
    const opponent = makeActivePokemon({ ability: "none" });
    const ctx = makeContext({
      ability: "flower-veil",
      trigger: "on-stat-change",
      types: ["normal"],
      opponent,
      statChange: { stat: "attack", stages: -1, source: "opponent" },
    });
    const result = handleGen6SwitchAbility("on-stat-change", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-accuracy-check: Victory Star
// ===========================================================================

describe("Victory Star (on-accuracy-check)", () => {
  it("given Victory Star, when on-accuracy-check, then activates", () => {
    // Source: Showdown data/abilities.ts -- victorystar: raises accuracy by ~10%
    const ctx = makeContext({ ability: "victory-star", trigger: "on-accuracy-check" });
    const result = handleGen6SwitchAbility("on-accuracy-check", ctx);
    expect(result.activated).toBe(true);
  });

  it("given Victory Star accuracy multiplier, then equals 4506/4096 (~1.1x)", () => {
    // Source: Showdown data/abilities.ts -- victorystar: chainModify([4506, 4096])
    // 4506 / 4096 = 1.1000976...
    expect(VICTORY_STAR_ACCURACY_MULTIPLIER).toBeCloseTo(1.1, 1);
  });
});

// ===========================================================================
// Trapping utilities
// ===========================================================================

describe("isTrappedByAbility utilities", () => {
  it("given Shadow Tag trapper, when trapped has different ability, then isTrapped is true", () => {
    // Source: Showdown data/abilities.ts -- shadowtag: traps unless opponent also has Shadow Tag
    expect(
      isTrappedByAbility({ ability: "shadow-tag" }, { ability: "none", types: [] }, true),
    ).toBe(true);
  });

  it("given Shadow Tag trapper, when trapped also has Shadow Tag, then isTrapped is false", () => {
    // Source: Showdown data/abilities.ts -- Shadow Tag: both have Shadow Tag = no trap
    expect(
      isTrappedByAbility({ ability: "shadow-tag" }, { ability: "shadow-tag", types: [] }, true),
    ).toBe(false);
  });
});

describe("isMoldBreakerAbility utility", () => {
  it("given mold-breaker, then isMoldBreaker returns true", () => {
    // Source: Showdown data/abilities.ts -- moldbreaker, teravolt, turboblaze all ignore ability
    expect(isMoldBreakerAbility("mold-breaker")).toBe(true);
  });

  it("given teravolt, then isMoldBreaker returns true", () => {
    // Source: Showdown data/abilities.ts -- teravolt: onModifyMove: move.ignoreAbility = true
    expect(isMoldBreakerAbility("teravolt")).toBe(true);
  });

  it("given levitate, then isMoldBreaker returns false", () => {
    // Source: Showdown data/abilities.ts -- levitate is not a mold-breaker variant
    expect(isMoldBreakerAbility("levitate")).toBe(false);
  });
});
