/**
 * Tests for Gen 6 Wave 8B:
 *   8B.1: Powder/Spore immunity for Grass types
 *   8B.2: Terrain-based status integration (already covered in terrain.test.ts)
 *   8B.3: Oblivion Wing drain recovery (75% vs standard 50%)
 *
 * Source: Showdown data/moves.ts -- powder moves check target.hasType('Grass')
 * Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
 *   powder and spore moves."
 * Source: Showdown data/moves.ts -- oblivionwing: { drain: [3, 4] } = 75%
 */

import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  executeGen6MoveEffect,
  handleDrainEffect,
  isGen6GrassPowderBlocked,
} from "../src/Gen6MoveEffects";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  ability?: string;
  heldItem?: string | null;
  volatileStatuses?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  consecutiveProtects?: number;
  turnsOnField?: number;
  nickname?: string | null;
  maxHp?: number;
  currentHp?: number;
  moves?: Array<{ moveId: string }>;
  types?: readonly string[];
  speciesId?: number | string;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      currentHp: overrides.currentHp ?? maxHp,
      status: null,
      heldItem: overrides.heldItem ?? null,
      moves: overrides.moves ?? [{ moveId: "tackle" }],
      nickname: overrides.nickname ?? null,
      speciesId: overrides.speciesId ?? 25,
    },
    ability: overrides.ability ?? "blaze",
    volatileStatuses: overrides.volatileStatuses ?? new Map(),
    types: (overrides.types ?? ["normal"]) as readonly string[],
    consecutiveProtects: overrides.consecutiveProtects ?? 0,
    turnsOnField: overrides.turnsOnField ?? 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
  } as unknown as ActivePokemon;
}

function makeMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    displayName: id,
    type: "normal",
    category: "status",
    power: null,
    accuracy: null,
    pp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      sound: false,
      bullet: false,
      pulse: false,
      punch: false,
      bite: false,
      wind: false,
      slicing: false,
      powder: false,
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      bypassSubstitute: false,
    },
    effect: null,
    description: "",
    generation: 6,
    ...overrides,
  } as MoveData;
}

function makeState(overrides?: Partial<BattleState>): BattleState {
  return {
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    weather: null,
    terrain: null,
    rng: new SeededRandom(42),
    ...overrides,
  } as unknown as BattleState;
}

function makeContext(
  moveId: string,
  options?: {
    state?: Partial<BattleState>;
    attacker?: Parameters<typeof makeActivePokemon>[0];
    defender?: Parameters<typeof makeActivePokemon>[0];
    moveOverrides?: Partial<MoveData>;
    damage?: number;
  },
): MoveEffectContext {
  return {
    attacker: makeActivePokemon(options?.attacker ?? {}),
    defender: makeActivePokemon(options?.defender ?? {}),
    move: makeMove(moveId, options?.moveOverrides),
    damage: options?.damage ?? 0,
    state: makeState(options?.state),
    rng: new SeededRandom(42),
  } as MoveEffectContext;
}

/** Always-succeed protect roll for testing */
function alwaysSucceedProtect(_consecutiveProtects: number, _rng: SeededRandom): boolean {
  return true;
}

// ===========================================================================
// 8B.1: Powder/Spore Immunity for Grass Types
// ===========================================================================

// ---------------------------------------------------------------------------
// isGen6GrassPowderBlocked — pure function
// ---------------------------------------------------------------------------

describe("isGen6GrassPowderBlocked — pure function", () => {
  it("given a powder move and Grass-type target, when checking immunity, then returns true", () => {
    // Source: Showdown data/moves.ts -- spore: flags: { powder: 1 }
    // Source: Bulbapedia -- "As of Generation VI, Grass-type Pokemon are immune to
    //   powder and spore moves."
    const move = makeMove("spore", {
      flags: {
        powder: true,
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen6GrassPowderBlocked(move, ["grass"])).toBe(true);
  });

  it("given a powder move and Grass/Poison dual-type target, when checking immunity, then returns true", () => {
    // Source: Showdown -- target.hasType('Grass') checks if Grass is any of the types
    // e.g. Venusaur (Grass/Poison) is immune to Spore
    const move = makeMove("sleep-powder", {
      flags: {
        powder: true,
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen6GrassPowderBlocked(move, ["grass", "poison"])).toBe(true);
  });

  it("given a powder move and non-Grass target, when checking immunity, then returns false", () => {
    // Source: Showdown -- only Grass types are immune to powder moves
    const move = makeMove("stun-spore", {
      flags: {
        powder: true,
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen6GrassPowderBlocked(move, ["fire"])).toBe(false);
  });

  it("given a non-powder move and Grass-type target, when checking immunity, then returns false", () => {
    // Source: Showdown -- Tackle does not have flags.powder, so it is not blocked
    const move = makeMove("tackle", {
      category: "physical",
      power: 40,
      flags: {
        powder: false,
        contact: true,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen6GrassPowderBlocked(move, ["grass"])).toBe(false);
  });

  it("given Powder Snow (not a powder move despite the name), when checking, then returns false", () => {
    // Source: Showdown data/moves.ts -- powdersnow does NOT have flags: { powder: 1 }
    // Powder immunity is flag-based, not name-based
    const move = makeMove("powder-snow", {
      type: "ice",
      category: "special",
      power: 40,
      flags: {
        powder: false,
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        protect: true,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen6GrassPowderBlocked(move, ["grass"])).toBe(false);
  });

  it("given a powder move and pure Normal-type target, when checking immunity, then returns false", () => {
    // Source: Showdown -- Normal types are not immune to powder moves
    const move = makeMove("poison-powder", {
      flags: {
        powder: true,
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        protect: false,
        mirror: false,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
    });
    expect(isGen6GrassPowderBlocked(move, ["normal"])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Gen6Ruleset.executeMoveEffect — powder immunity integration
// ---------------------------------------------------------------------------

describe("Gen6Ruleset.executeMoveEffect — powder immunity integration", () => {
  // 15s timeout: async dynamic import triggers module compilation; under full-suite parallel
  // load this can take longer than the default 5s.
  it("given Grass-type defender and powder move, when executeMoveEffect called, then returns blocked result with immunity message", async () => {
    // Source: Showdown -- powder moves return null against Grass types
    // Source: Bulbapedia -- "It doesn't affect <target>..."
    const { Gen6Ruleset } = await import("../src/Gen6Ruleset");
    const ruleset = new Gen6Ruleset();

    const ctx = makeContext("spore", {
      defender: { types: ["grass"], speciesId: "bulbasaur", nickname: "Bulbasaur" },
      moveOverrides: {
        flags: {
          powder: true,
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          protect: false,
          mirror: false,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
      },
    });
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.statusInflicted).toBeNull();
    expect(result.healAmount).toBe(0);
    expect(result.messages).toEqual(["It doesn't affect Bulbasaur..."]);
  }, 15000);

  it("given Grass/Poison-type defender and Stun Spore, when executeMoveEffect called, then returns blocked result", async () => {
    // Source: Showdown -- any Pokemon with Grass as one of its types is immune
    const { Gen6Ruleset } = await import("../src/Gen6Ruleset");
    const ruleset = new Gen6Ruleset();

    const ctx = makeContext("stun-spore", {
      defender: { types: ["grass", "poison"], speciesId: "venusaur", nickname: "Venusaur" },
      moveOverrides: {
        flags: {
          powder: true,
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          protect: false,
          mirror: false,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
      },
    });
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.messages).toEqual(["It doesn't affect Venusaur..."]);
    expect(result.statusInflicted).toBeNull();
  });

  it("given non-Grass defender and powder move, when executeMoveEffect called, then does NOT block (falls through)", async () => {
    // Source: Showdown -- only Grass types are immune; Fire types are not
    const { Gen6Ruleset } = await import("../src/Gen6Ruleset");
    const ruleset = new Gen6Ruleset();

    const ctx = makeContext("sleep-powder", {
      defender: { types: ["fire"] },
      moveOverrides: {
        flags: {
          powder: true,
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          protect: false,
          mirror: false,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
      },
    });
    const result = ruleset.executeMoveEffect(ctx);

    // Not blocked -- falls through to BaseRuleset default (no immunity message)
    const hasImmunityMessage = result.messages.some((m) => m.includes("doesn't affect"));
    expect(hasImmunityMessage).toBe(false);
  });

  it("given Grass-type defender and powder move with no nickname, when blocked, then uses speciesId in message", async () => {
    // Source: message formatting -- falls back to speciesId when nickname is null
    const { Gen6Ruleset } = await import("../src/Gen6Ruleset");
    const ruleset = new Gen6Ruleset();

    const ctx = makeContext("spore", {
      defender: { types: ["grass"], speciesId: "oddish", nickname: null },
      moveOverrides: {
        flags: {
          powder: true,
          contact: false,
          sound: false,
          bullet: false,
          pulse: false,
          punch: false,
          bite: false,
          wind: false,
          slicing: false,
          protect: false,
          mirror: false,
          snatch: false,
          gravity: false,
          defrost: false,
          recharge: false,
          charge: false,
          bypassSubstitute: false,
        },
      },
    });
    const result = ruleset.executeMoveEffect(ctx);

    expect(result.messages).toEqual(["It doesn't affect oddish..."]);
  });
});

// ===========================================================================
// 8B.3: Drain Handling (Oblivion Wing, Giga Drain, etc.)
// ===========================================================================

// ---------------------------------------------------------------------------
// handleDrainEffect — pure function
// ---------------------------------------------------------------------------

describe("handleDrainEffect — pure function", () => {
  it("given Oblivion Wing (75% drain) dealing 100 damage, when handling drain, then healAmount is 75", () => {
    // Source: Showdown data/moves.ts -- oblivionwing: { drain: [3, 4] } = 75%
    // Source: Bulbapedia -- "Oblivion Wing restores the user's HP by up to 75%
    //   of the damage dealt to the target."
    // 100 * 0.75 = 75
    const ctx = makeContext("oblivion-wing", {
      damage: 100,
      moveOverrides: {
        type: "flying",
        category: "special",
        power: 80,
        effect: { type: "drain", amount: 0.75 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(75);
  });

  it("given Oblivion Wing (75% drain) dealing 53 damage, when handling drain, then healAmount is 39 (floor)", () => {
    // Source: Showdown -- integer arithmetic, floor rounding
    // floor(53 * 0.75) = floor(39.75) = 39
    const ctx = makeContext("oblivion-wing", {
      damage: 53,
      moveOverrides: {
        type: "flying",
        category: "special",
        power: 80,
        effect: { type: "drain", amount: 0.75 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(39);
  });

  it("given Giga Drain (50% drain) dealing 100 damage, when handling drain, then healAmount is 50", () => {
    // Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
    // 100 * 0.5 = 50
    const ctx = makeContext("giga-drain", {
      damage: 100,
      moveOverrides: {
        type: "grass",
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(50);
  });

  it("given Giga Drain (50% drain) dealing 77 damage, when handling drain, then healAmount is 38 (floor)", () => {
    // Source: Showdown -- floor(77 * 0.5) = floor(38.5) = 38
    const ctx = makeContext("giga-drain", {
      damage: 77,
      moveOverrides: {
        type: "grass",
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(38);
  });

  it("given drain move dealing 0 damage, when handling drain, then healAmount is 0", () => {
    // Source: edge case -- 0 damage = 0 drain (clamped to 0 by Math.max)
    const ctx = makeContext("giga-drain", {
      damage: 0,
      moveOverrides: {
        type: "grass",
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(0);
  });

  it("given move with no drain effect, when handling drain, then returns null", () => {
    // Source: handleDrainEffect returns null for non-drain moves
    const ctx = makeContext("thunderbolt", {
      damage: 80,
      moveOverrides: {
        type: "electric",
        category: "special",
        power: 90,
        effect: null,
      },
    });
    const result = handleDrainEffect(ctx);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// executeGen6MoveEffect — drain dispatch
// ---------------------------------------------------------------------------

describe("executeGen6MoveEffect — drain dispatch", () => {
  it("given Oblivion Wing dealing 120 damage, when dispatched, then returns result with healAmount 90", () => {
    // Source: Showdown data/moves.ts -- oblivionwing: { drain: [3, 4] } = 75%
    // floor(120 * 0.75) = 90
    const ctx = makeContext("oblivion-wing", {
      damage: 120,
      moveOverrides: {
        type: "flying",
        category: "special",
        power: 80,
        effect: { type: "drain", amount: 0.75 },
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(90);
  });

  it("given Giga Drain dealing 60 damage, when dispatched, then returns result with healAmount 30", () => {
    // Source: Showdown data/moves.ts -- gigadrain: { drain: [1, 2] } = 50%
    // floor(60 * 0.5) = 30
    const ctx = makeContext("giga-drain", {
      damage: 60,
      moveOverrides: {
        type: "grass",
        category: "special",
        power: 75,
        effect: { type: "drain", amount: 0.5 },
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).not.toBeNull();
    expect(result!.healAmount).toBe(30);
  });

  it("given non-drain move with no special Gen6 handling, when dispatched, then returns null", () => {
    // Source: executeGen6MoveEffect returns null for unrecognized non-drain moves
    const ctx = makeContext("flamethrower", {
      damage: 90,
      moveOverrides: {
        type: "fire",
        category: "special",
        power: 90,
        effect: null,
      },
    });
    const rng = new SeededRandom(42);
    const result = executeGen6MoveEffect(ctx, rng, alwaysSucceedProtect);

    expect(result).toBeNull();
  });
});
