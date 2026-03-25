import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen9Ability } from "../src/Gen9Abilities";

/**
 * Gen 9 master ability dispatcher tests.
 *
 * Verifies correct routing between Gen9AbilitiesStat, Gen9AbilitiesNew,
 * and Gen9AbilitiesSwitch modules.
 *
 * Source: Gen9Abilities.ts -- routing priority:
 *   1. Stat abilities (Protosynthesis, Quark Drive)
 *   2. New/nerfed abilities (Toxic Chain, Good as Gold, etc.)
 *   3. Carry-forward switch abilities (Intimidate, weather setters, etc.)
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function makeTestUid() {
  return `test-${nextTestUid++}`;
}

function makePokemonInstance(overrides: {
  ability?: string;
  nickname?: string | null;
  heldItem?: string | null;
  status?: string | null;
  maxHp?: number;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: makeTestUid(),
    speciesId: 1,
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
  heldItem?: string | null;
  status?: string | null;
  maxHp?: number;
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isTerastallized?: boolean;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      heldItem: overrides.heldItem,
      status: overrides.status,
      maxHp: overrides.maxHp,
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
    isTerastallized: overrides.isTerastallized ?? false,
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

function makeRng(overrides?: Partial<SeededRandom>): SeededRandom {
  return {
    next: () => 0,
    int: () => 1,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
    ...overrides,
  };
}

function makeBattleState(overrides?: {
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: makeRng(),
  } as BattleState;
}

function makeContext(overrides: {
  pokemon: ReturnType<typeof makeActivePokemon>;
  opponent?: ReturnType<typeof makeActivePokemon>;
  trigger: string;
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
  move?: any;
  rng?: Partial<SeededRandom>;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon as any,
    opponent: overrides.opponent as any,
    state: makeBattleState({ weather: overrides.weather, terrain: overrides.terrain }),
    rng: makeRng(overrides.rng),
    trigger: overrides.trigger as any,
    move: overrides.move,
  };
}

// ---------------------------------------------------------------------------
// Dispatch routing tests
// ---------------------------------------------------------------------------

describe("handleGen9Ability -- routing", () => {
  it("routes protosynthesis to stat ability handler (priority 1)", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "protosynthesis" }),
      trigger: "on-switch-in",
      weather: { type: "sun", turnsLeft: 5, source: "drought" },
    });
    const result = handleGen9Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: "protosynthesis" }));
  });

  it("routes quark-drive to stat ability handler (priority 1)", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "quark-drive" }),
      trigger: "on-switch-in",
      terrain: { type: "electric", turnsLeft: 5, source: "electric-surge" },
    });
    const result = handleGen9Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: "quarkdrive" }));
  });

  it("routes intrepid-sword to new ability handler (priority 2)", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "intrepid-sword" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(expect.objectContaining({ stat: "attack", stages: 1 }));
  });

  it("routes intimidate to switch ability handler (priority 3)", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "intimidate" }),
      opponent: makeActivePokemon({}),
      trigger: "on-switch-in",
    });
    const result = handleGen9Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "attack", stages: -1 }));
  });

  it("routes drizzle to switch ability handler (priority 3)", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "drizzle" }),
      trigger: "on-switch-in",
    });
    const result = handleGen9Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ weather: "rain" }));
  });

  it("routes speed-boost on-turn-end to switch ability handler", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "speed-boost" }),
      trigger: "on-turn-end",
    });
    const result = handleGen9Ability("on-turn-end", ctx);
    expect(result.activated).toBe(true);
  });

  it("given unsupported trigger type, then returns inactive", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "intimidate" }),
      trigger: "on-damage",
    });
    const result = handleGen9Ability("on-damage", ctx);
    expect(result.activated).toBe(false);
  });

  it("given embody aspect (which isEmbodyAspect check covers), routes to new ability handler", () => {
    const ctx = makeContext({
      pokemon: makeActivePokemon({
        ability: "embody-aspect-teal",
        isTerastallized: true,
      }),
      trigger: "on-switch-in",
    });
    const result = handleGen9Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(expect.objectContaining({ stat: "speed", stages: 1 }));
  });
});

// ---------------------------------------------------------------------------
// Triage priority boost -- newly added healing moves (#803)
// ---------------------------------------------------------------------------

describe("handleGen9Ability -- Triage healing move coverage (#803)", () => {
  it("given Triage user with life-dew, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/moves.ts -- life-dew has heal flag
    // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "triage" }),
      trigger: "on-priority-check",
      move: { id: "life-dew", category: "status", type: "water", effect: null },
    });
    const result = handleGen9Ability("on-priority-check", ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });

  it("given Triage user with jungle-healing, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/moves.ts -- jungle-healing has heal flag
    // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "triage" }),
      trigger: "on-priority-check",
      move: { id: "jungle-healing", category: "status", type: "grass", effect: null },
    });
    const result = handleGen9Ability("on-priority-check", ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });

  it("given Triage user with lunar-blessing, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/moves.ts -- lunar-blessing has heal flag
    // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "triage" }),
      trigger: "on-priority-check",
      move: { id: "lunar-blessing", category: "status", type: "psychic", effect: null },
    });
    const result = handleGen9Ability("on-priority-check", ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });

  it("given Triage user with non-allowlisted move that has effectType heal, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/abilities.ts -- triage: move.flags.heal check
    // Verifies the effectType "heal" fallback for future moves not yet in the HEALING_MOVES allowlist
    const ctx = makeContext({
      pokemon: makeActivePokemon({ ability: "triage" }),
      trigger: "on-priority-check",
      move: {
        id: "custom-heal-move",
        category: "status",
        type: "normal",
        effect: { type: "heal" },
      },
    });
    const result = handleGen9Ability("on-priority-check", ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });
});
