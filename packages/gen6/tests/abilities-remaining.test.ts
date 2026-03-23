import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  FRIEND_GUARD_DAMAGE_MULTIPLIER,
  getSereneGraceMultiplier,
  getWeightMultiplier,
  HARVEST_BASE_PROBABILITY,
  HARVEST_SUN_PROBABILITY,
  HEALER_PROBABILITY,
  HEAVY_METAL_WEIGHT_MULTIPLIER,
  handleGen6RemainingAbility,
  LIGHT_METAL_WEIGHT_MULTIPLIER,
  SERENE_GRACE_CHANCE_MULTIPLIER,
} from "../src/Gen6AbilitiesRemaining";

/**
 * Gen 6 remaining ability tests.
 *
 * Tests Gen 6-specific behavior including:
 *   - Frisk: reveals ALL foes' items (Gen 6 change from Gen 5 single reveal)
 *   - Serene Grace: no longer excludes Secret Power (Gen 6 change from Gen 5)
 *   - Carry-forward: Zen Mode, Harvest, Healer, Friend Guard, Telepathy, Oblivious
 *   - Weight multiplier utilities: Heavy Metal, Light Metal
 *
 * Source: Showdown data/abilities.ts
 * Source: Showdown data/mods/gen6/abilities.ts
 * Source: Bulbapedia -- individual ability articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${Math.random()}`,
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
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      status: overrides.status,
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
    substituteHp: 0,
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

function makeBattleState(weather?: { type: string } | null): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
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
    category?: "physical" | "special" | "status";
  } = {},
): MoveData {
  return {
    id: opts.id ?? "test-move",
    displayName: "Test Move",
    type,
    category: opts.category ?? "physical",
    power: opts.category === "status" ? 0 : 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 6,
    flags: {},
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
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  rngNext?: number;
  weather?: { type: string } | null;
  format?: "singles" | "doubles";
}): AbilityContext {
  const state = makeBattleState(opts.weather);
  if (opts.format) {
    // @ts-expect-error - override format for doubles tests
    state.format = opts.format;
  }
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    nickname: opts.nickname ?? "TestMon",
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    heldItem: opts.heldItem,
    status: opts.status,
    volatiles: opts.volatiles,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    move: opts.move,
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
// on-turn-end: Zen Mode
// ===========================================================================

describe("Zen Mode (on-turn-end)", () => {
  it("given Zen Mode Darmanitan below 50% HP, when on-turn-end, then transforms to Zen", () => {
    // Source: Showdown data/abilities.ts -- zenmode: form change below 50% HP at turn end
    // Source: Bulbapedia "Zen Mode" -- "Activates when HP drops below half at end of turn."
    // 100/300 = 33% HP, below 50% threshold (floor(300/2) = 150)
    const ctx = makeContext({
      ability: "zen-mode",
      trigger: "on-turn-end",
      currentHp: 100,
      maxHp: 300,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-inflict");
    expect(volatileEffect?.volatile).toBe("zen-mode");
  });

  it("given Zen Mode Darmanitan above 50% HP while in Zen Form, when on-turn-end, then reverts", () => {
    // Source: Showdown data/abilities.ts -- zenmode: reverts when HP > 50% and in Zen form
    const zenVolatiles = new Map([["zen-mode", { turnsLeft: -1 }]]);
    const ctx = makeContext({
      ability: "zen-mode",
      trigger: "on-turn-end",
      currentHp: 250,
      maxHp: 300,
      volatiles: zenVolatiles,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const volatileEffect = result.effects.find((e) => e.effectType === "volatile-remove");
    expect(volatileEffect?.volatile).toBe("zen-mode");
  });
});

// ===========================================================================
// on-turn-end: Harvest
// ===========================================================================

describe("Harvest (on-turn-end)", () => {
  it("given Harvest in sun with consumed berry, when on-turn-end, then always restores berry", () => {
    // Source: Showdown data/abilities.ts -- harvest: 100% restore in sun
    // Source: Bulbapedia "Harvest" -- "Guaranteed in sunlight."
    const harvestVolatiles = new Map([
      ["harvest-berry", { turnsLeft: -1, data: { berryId: "oran-berry" } }],
    ]);
    const ctx = makeContext({
      ability: "harvest",
      trigger: "on-turn-end",
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: { type: "sun" },
      rngNext: 0.9, // Would fail 50% roll, but sun makes it 100%
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const itemEffect = result.effects.find((e) => e.effectType === "item-restore");
    expect(itemEffect?.item).toBe("oran-berry");
  });

  it("given Harvest with no sun and RNG >= 50%, when on-turn-end, then does not restore", () => {
    // Source: Showdown data/abilities.ts -- harvest: 50% chance outside sun
    // rngNext = 0.7 >= 0.5, so restore fails
    const harvestVolatiles = new Map([
      ["harvest-berry", { turnsLeft: -1, data: { berryId: "sitrus-berry" } }],
    ]);
    const ctx = makeContext({
      ability: "harvest",
      trigger: "on-turn-end",
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: null,
      rngNext: 0.7,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Harvest in harsh-sun (Desolate Land) with consumed berry, when on-turn-end, then always restores berry", () => {
    // Source: Showdown data/abilities.ts -- harvest: `this.field.isWeather(['sunnyday', 'desolateland'])`
    // Both regular sun and harsh sun (Desolate Land) guarantee Harvest activation.
    // Bug #673: Previously only checked for "sun", missing "harsh-sun".
    const harvestVolatiles = new Map([
      ["harvest-berry", { turnsLeft: -1, data: { berryId: "lum-berry" } }],
    ]);
    const ctx = makeContext({
      ability: "harvest",
      trigger: "on-turn-end",
      heldItem: null,
      volatiles: harvestVolatiles,
      weather: { type: "harsh-sun" },
      rngNext: 0.9, // Would fail 50% roll, but harsh-sun makes it 100%
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    const itemEffect = result.effects.find((e) => e.effectType === "item-restore");
    expect(itemEffect?.item).toBe("lum-berry");
  });
});

// ===========================================================================
// on-switch-in: Frisk (Gen 6: reveals ALL foes)
// ===========================================================================

describe("Frisk (Gen 6: reveals all foes)", () => {
  it("given Frisk, when opponent has a held item, then reveals it", () => {
    // Source: Showdown data/abilities.ts (base Gen 6+) -- frisk: reveals ALL foes
    // Source: Bulbapedia "Frisk" Gen VI -- "Checks all foes' held items."
    // In singles, there is only one foe so result is same as Gen 5 single reveal
    const opponent = makeActivePokemon({ ability: "none", heldItem: "choice-band" });
    const ctx = makeContext({ ability: "frisk", trigger: "on-switch-in", opponent });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("choice-band");
  });

  it("given Frisk, when opponent has no held item, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- frisk: only reveals if item exists
    const opponent = makeActivePokemon({ ability: "none", heldItem: null });
    const ctx = makeContext({ ability: "frisk", trigger: "on-switch-in", opponent });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Oblivious
// ===========================================================================

describe("Oblivious (passive-immunity)", () => {
  it("given Oblivious, when targeted by Attract, then blocks infatuation", () => {
    // Source: Showdown data/abilities.ts -- oblivious: blocks Attract
    const attractMove = makeMove("normal", { id: "attract", category: "status" });
    const ctx = makeContext({
      ability: "oblivious",
      trigger: "passive-immunity",
      move: attractMove,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Oblivious, when targeted by Captivate, then blocks it", () => {
    // Source: Showdown data/abilities.ts -- oblivious: blocks Captivate
    const captivateMove = makeMove("normal", { id: "captivate", category: "status" });
    const ctx = makeContext({
      ability: "oblivious",
      trigger: "passive-immunity",
      move: captivateMove,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });
});

// ===========================================================================
// on-damage-calc: Serene Grace (Gen 6: no Secret Power exclusion)
// ===========================================================================

describe("Serene Grace (Gen 6: no Secret Power exclusion)", () => {
  it("given Serene Grace, when used with any move, then activates and doubles secondary chance", () => {
    // Source: Showdown data/abilities.ts (base Gen 6+) -- serenegrace: no move exclusions
    // Gen 6 change: Secret Power exclusion removed (was Gen 5 specific)
    const tbolt = makeMove("electric", { id: "thunderbolt" });
    const ctx = makeContext({ ability: "serene-grace", trigger: "on-damage-calc", move: tbolt });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Serene Grace, when used with Secret Power (Gen 5 excluded it), then still activates in Gen 6", () => {
    // Source: Showdown data/mods/gen5/abilities.ts -- excluded secretpower (Gen 5 only)
    // Source: Showdown data/abilities.ts (base) -- no exclusion in Gen 6
    const secretPower = makeMove("normal", { id: "secret-power" });
    const ctx = makeContext({
      ability: "serene-grace",
      trigger: "on-damage-calc",
      move: secretPower,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });
});

describe("getSereneGraceMultiplier utility (Gen 6)", () => {
  it("given serene-grace ability, then returns 2x multiplier", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: doubles secondary chance
    expect(getSereneGraceMultiplier("serene-grace")).toBe(SERENE_GRACE_CHANCE_MULTIPLIER);
    expect(getSereneGraceMultiplier("serene-grace")).toBe(2);
  });

  it("given a non-Serene Grace ability, then returns 1 (no boost)", () => {
    // Source: Showdown data/abilities.ts -- only serenegrace activates this
    expect(getSereneGraceMultiplier("intimidate")).toBe(1);
  });
});

// ===========================================================================
// on-damage-calc: Friend Guard (doubles only)
// ===========================================================================

describe("Friend Guard (on-damage-calc)", () => {
  it("given Friend Guard in doubles, when on-damage-calc, then activates damage reduction", () => {
    // Source: Showdown data/abilities.ts -- friendguard: reduces ally damage by 25% in doubles
    // Source: Bulbapedia "Friend Guard" -- "Reduces damage done to allies by 25%."
    const ctx = makeContext({
      ability: "friend-guard",
      trigger: "on-damage-calc",
      format: "doubles",
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("damage-reduction");
  });

  it("given Friend Guard in singles format, when on-damage-calc, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- friendguard: no allies in singles
    const ctx = makeContext({
      ability: "friend-guard",
      trigger: "on-damage-calc",
      format: "singles",
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Constants
// ===========================================================================

describe("Constant values", () => {
  it("FRIEND_GUARD_DAMAGE_MULTIPLIER is 0.75", () => {
    // Source: Showdown data/abilities.ts -- friendguard: chainModify(0.75)
    expect(FRIEND_GUARD_DAMAGE_MULTIPLIER).toBe(0.75);
  });

  it("SERENE_GRACE_CHANCE_MULTIPLIER is 2", () => {
    // Source: Showdown data/abilities.ts -- serenegrace: secondary.chance *= 2
    expect(SERENE_GRACE_CHANCE_MULTIPLIER).toBe(2);
  });

  it("HARVEST_BASE_PROBABILITY is 0.5 (50%)", () => {
    // Source: Showdown data/abilities.ts -- harvest: randomChance(1, 2) = 50%
    expect(HARVEST_BASE_PROBABILITY).toBe(0.5);
  });

  it("HARVEST_SUN_PROBABILITY is 1.0 (100%)", () => {
    // Source: Showdown data/abilities.ts -- harvest: 100% in sun
    expect(HARVEST_SUN_PROBABILITY).toBe(1.0);
  });

  it("HEALER_PROBABILITY is 0.3 (30%)", () => {
    // Source: Showdown data/abilities.ts -- healer: randomChance(3, 10) = 30%
    expect(HEALER_PROBABILITY).toBe(0.3);
  });

  it("HEAVY_METAL_WEIGHT_MULTIPLIER is 2", () => {
    // Source: Showdown data/abilities.ts -- heavymetal: weighthg * 2
    expect(HEAVY_METAL_WEIGHT_MULTIPLIER).toBe(2);
  });

  it("LIGHT_METAL_WEIGHT_MULTIPLIER is 0.5", () => {
    // Source: Showdown data/abilities.ts -- lightmetal: trunc(weighthg / 2) = 50%
    expect(LIGHT_METAL_WEIGHT_MULTIPLIER).toBe(0.5);
  });
});

// ===========================================================================
// Weight multiplier utility
// ===========================================================================

describe("getWeightMultiplier utility", () => {
  it("given heavy-metal, then returns 2x multiplier", () => {
    // Source: Showdown data/abilities.ts -- heavymetal: doubles weight
    expect(getWeightMultiplier("heavy-metal")).toBe(2);
  });

  it("given light-metal, then returns 0.5x multiplier", () => {
    // Source: Showdown data/abilities.ts -- lightmetal: halves weight
    expect(getWeightMultiplier("light-metal")).toBe(0.5);
  });

  it("given a non-weight-modifying ability, then returns 1 (no change)", () => {
    // Source: Showdown data/abilities.ts -- only heavy-metal and light-metal modify weight
    expect(getWeightMultiplier("levitate")).toBe(1);
  });
});
