import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type {
  PokemonInstance,
  PokemonType,
  SeededRandom as SeededRandomType,
} from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

/**
 * A mock RNG whose int() always returns a fixed value.
 * Used for deterministic accuracy boundary testing.
 * doesMoveHit calls rng.int(1, 100) and compares <= calc.
 */
function createMockRng(intReturnValue: number): SeededRandomType {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  } as SeededRandomType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

function makePokemonInstance(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  heldItem?: string | null;
}): PokemonInstance {
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.maxHp ?? 200,
    moves: [],
    ability: "",
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
      hp: overrides.maxHp ?? 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  movedThisTurn?: boolean;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      maxHp: overrides.maxHp,
      status: overrides.status,
      heldItem: overrides.heldItem,
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
    movedThisTurn: overrides.movedThisTurn ?? false,
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

type AccuracyContext = Parameters<Gen4Ruleset["doesMoveHit"]>[0];

function makeCtx(overrides: {
  moveId?: string;
  moveAccuracy?: number | null;
  attackerAbility?: string;
  defenderAbility?: string;
  accStage?: number;
  evaStage?: number;
  weather?: string | null;
  attackerItem?: string | null;
  defenderItem?: string | null;
  moveCategory?: "physical" | "special" | "status";
  seed?: number;
  rng?: SeededRandomType;
  defenderMovedThisTurn?: boolean;
}): AccuracyContext {
  const attacker = makeActivePokemon({
    ability: overrides.attackerAbility ?? "",
    heldItem: overrides.attackerItem,
  });
  const defender = makeActivePokemon({
    ability: overrides.defenderAbility ?? "",
    heldItem: overrides.defenderItem,
    movedThisTurn: overrides.defenderMovedThisTurn ?? false,
  });

  if (overrides.accStage !== undefined) attacker.statStages.accuracy = overrides.accStage;
  if (overrides.evaStage !== undefined) defender.statStages.evasion = overrides.evaStage;

  return {
    attacker,
    defender,
    move: {
      id: overrides.moveId ?? "tackle",
      accuracy: overrides.moveAccuracy !== undefined ? overrides.moveAccuracy : 100,
      category: overrides.moveCategory ?? "physical",
    } as AccuracyContext["move"],
    state: {
      weather: overrides.weather ? { type: overrides.weather } : null,
    } as AccuracyContext["state"],
    rng: overrides.rng ?? new SeededRandom(overrides.seed ?? 1),
  };
}

// ---------------------------------------------------------------------------
// Thunder — 100% accuracy in rain
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Thunder 100% accuracy in rain", () => {
  // Source: Showdown sim/battle-actions.ts — Thunder always hits in rain
  // Source: Bulbapedia — Thunder: "Has 100% accuracy during rain."
  // Thunder base accuracy is 70, but in rain it bypasses the accuracy check entirely (returns true).

  it("given Thunder in rain and rng roll of 100, when checking accuracy, then always hits (rain bypasses roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "rain",
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in rain and rng roll of 1, when checking accuracy, then always hits (rain bypasses roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "rain",
      rng: createMockRng(1),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in rain with -6 accuracy stage, when checking accuracy, then still always hits (weather override bypasses stages)", () => {
    // Source: Showdown sim/battle-actions.ts — weather override bypasses stat stages
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "rain",
      accStage: -6,
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Thunder — 50% accuracy in sun
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Thunder 50% accuracy in sun", () => {
  // Source: Showdown sim/battle-actions.ts — Thunder has 50% accuracy in sun
  // Source: Bulbapedia — Thunder: "Has 50% accuracy during harsh sunlight."
  // doesMoveHit uses rng.int(1, 100) <= 50 for Thunder in sun.

  it("given Thunder in sun and rng roll of 50, when checking accuracy, then hits (boundary: 50 <= 50)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "sun",
      rng: createMockRng(50),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in sun and rng roll of 51, when checking accuracy, then misses (boundary: 51 > 50)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "sun",
      rng: createMockRng(51),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Thunder in sun and rng roll of 1, when checking accuracy, then hits (minimum roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "sun",
      rng: createMockRng(1),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in sun with +6 accuracy stage and rng roll of 51, when checking accuracy, then still misses (sun override is flat 50%)", () => {
    // Source: Showdown sim/battle-actions.ts — sun Thunder override is 50% flat,
    // bypasses normal accuracy/evasion stage formula entirely.
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "sun",
      accStage: 6,
      rng: createMockRng(51),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blizzard — 100% accuracy in hail
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Blizzard 100% accuracy in hail", () => {
  // Source: Showdown sim/battle-actions.ts — Blizzard always hits in hail
  // Source: Bulbapedia — Blizzard: "100% accuracy in hail" (NEW in Gen 4)
  // Blizzard base accuracy is 70, but in hail it bypasses the accuracy check entirely (returns true).

  it("given Blizzard in hail and rng roll of 100, when checking accuracy, then always hits (hail bypasses roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "blizzard",
      moveAccuracy: 70,
      weather: "hail",
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Blizzard in hail and rng roll of 1, when checking accuracy, then always hits (hail bypasses roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "blizzard",
      moveAccuracy: 70,
      weather: "hail",
      rng: createMockRng(1),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Blizzard in hail with -6 accuracy stage, when checking accuracy, then still always hits (weather override bypasses stages)", () => {
    // Source: Showdown sim/battle-actions.ts — weather override bypasses stat stages
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "blizzard",
      moveAccuracy: 70,
      weather: "hail",
      accStage: -6,
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Weather accuracy — no override when weather doesn't match
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — weather accuracy overrides only apply to matching weather", () => {
  // Source: Showdown sim/battle-actions.ts — weather overrides are move+weather specific.
  // Without a matching override, the normal accuracy formula applies.
  // Thunder/Blizzard base accuracy = 70. At stage 0/0, calc = floor(70 * 3/3) = 70.
  // doesMoveHit uses rng.int(1, 100) <= 70.

  it("given Thunder and no weather, when rng roll is 70, then hits (base 70% accuracy, boundary: 70 <= 70)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: null,
      rng: createMockRng(70),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder and no weather, when rng roll is 71, then misses (base 70% accuracy, boundary: 71 > 70)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: null,
      rng: createMockRng(71),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Thunder and hail weather, when rng roll is 71, then misses (hail does NOT boost Thunder, boundary: 71 > 70)", () => {
    // Source: Showdown sim/battle-actions.ts — hail does NOT boost Thunder accuracy
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "thunder",
      moveAccuracy: 70,
      weather: "hail",
      rng: createMockRng(71),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Blizzard and rain weather, when rng roll is 71, then misses (rain does NOT boost Blizzard, boundary: 71 > 70)", () => {
    // Source: Showdown sim/battle-actions.ts — rain does NOT boost Blizzard accuracy
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: "blizzard",
      moveAccuracy: 70,
      weather: "rain",
      rng: createMockRng(71),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Zoom Lens — +20% accuracy when attacker moves last
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Zoom Lens accuracy bonus", () => {
  // Source: Bulbapedia — Zoom Lens: "Boosts accuracy by 20% if the holder moves after target."
  // Source: Showdown sim/items.ts — Zoom Lens onSourceModifyAccuracy
  // Derivation: base calc = 70 (stage 0/0); Zoom Lens: floor(70 * 120 / 100) = 84

  it("given Zoom Lens with defender moved and rng roll of 84, when checking accuracy, then hits (boundary: 84 <= 84)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      attackerItem: "zoom-lens",
      defenderMovedThisTurn: true,
      rng: createMockRng(84),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Zoom Lens with defender moved and rng roll of 85, when checking accuracy, then misses (boundary: 85 > 84)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      attackerItem: "zoom-lens",
      defenderMovedThisTurn: true,
      rng: createMockRng(85),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Zoom Lens with defender NOT moved and rng roll of 71, when checking accuracy, then misses (Zoom Lens inactive, base 70: 71 > 70)", () => {
    // Source: Bulbapedia — Zoom Lens only activates if holder moves after target
    // Without activation, calc stays at 70 (no boost).
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      attackerItem: "zoom-lens",
      defenderMovedThisTurn: false,
      rng: createMockRng(71),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Zoom Lens with defender NOT moved and rng roll of 70, when checking accuracy, then hits (Zoom Lens inactive, base 70: 70 <= 70)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      attackerItem: "zoom-lens",
      defenderMovedThisTurn: false,
      rng: createMockRng(70),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BrightPowder / Lax Incense — 10% evasion boost for defender
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — BrightPowder / Lax Incense evasion", () => {
  // Source: Bulbapedia — BrightPowder: "Lowers opposing accuracy by 10%."
  // Source: Showdown sim/items.ts — BrightPowder/Lax Incense onModifyAccuracy
  // Derivation (100% move): floor(100 * 90 / 100) = 90
  // Derivation (70% move): floor(70 * 90 / 100) = 63

  it("given BrightPowder defender and 100% move, when rng roll is 90, then hits (boundary: 90 <= 90)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 100,
      defenderItem: "bright-powder",
      rng: createMockRng(90),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given BrightPowder defender and 100% move, when rng roll is 91, then misses (boundary: 91 > 90)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 100,
      defenderItem: "bright-powder",
      rng: createMockRng(91),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given no defender item and 100% move, when rng roll is 100, then hits (100 <= 100, no item penalty)", () => {
    // Baseline: without BrightPowder, a 100% move at stage 0/0 has calc = 100.
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 100,
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Lax Incense defender and 100% move, when rng roll is 91, then misses (same as BrightPowder: 91 > 90)", () => {
    // Source: Bulbapedia — Lax Incense: "Lowers opposing accuracy by 10%." (same as BrightPowder)
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 100,
      defenderItem: "lax-incense",
      rng: createMockRng(91),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given BrightPowder defender and 70% move, when rng roll is 63, then hits (boundary: 63 <= 63)", () => {
    // Derivation: floor(70 * 90 / 100) = 63
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      defenderItem: "bright-powder",
      rng: createMockRng(63),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given BrightPowder defender and 70% move, when rng roll is 64, then misses (boundary: 64 > 63)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      defenderItem: "bright-powder",
      rng: createMockRng(64),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });
});
