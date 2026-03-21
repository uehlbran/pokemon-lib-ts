import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

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
    rng: new SeededRandom(overrides.seed ?? 1),
  };
}

// ---------------------------------------------------------------------------
// Thunder — 100% accuracy in rain
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Thunder 100% accuracy in rain", () => {
  it("given Thunder move and rain weather, when checking accuracy, then always hits (100%)", () => {
    // Source: Showdown sim/battle-actions.ts — Thunder always hits in rain
    // Source: Bulbapedia — Thunder: "Has 100% accuracy during rain."
    // Thunder base accuracy is 70, but in rain it bypasses the accuracy check entirely.
    const ruleset = makeRuleset();
    const trials = 100;
    let hits = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "thunder",
        moveAccuracy: 70,
        weather: "rain",
        seed,
      });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }

    // Thunder should always hit in rain — all 100 trials should be hits
    expect(hits).toBe(trials);
  });

  it("given Thunder move and rain weather with -6 accuracy stage, when checking accuracy, then still always hits", () => {
    // Source: Showdown sim/battle-actions.ts — weather override bypasses stat stages
    // Even with terrible accuracy stages, Thunder still always hits in rain
    const ruleset = makeRuleset();
    const trials = 50;
    let hits = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "thunder",
        moveAccuracy: 70,
        weather: "rain",
        accStage: -6,
        seed,
      });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }

    expect(hits).toBe(trials);
  });
});

// ---------------------------------------------------------------------------
// Thunder — 50% accuracy in sun
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Thunder 50% accuracy in sun", () => {
  it("given Thunder move and sun weather, when checking accuracy, then uses 50% accuracy (not base 70%)", () => {
    // Source: Showdown sim/battle-actions.ts — Thunder has 50% accuracy in sun
    // Source: Bulbapedia — Thunder: "Has 50% accuracy during harsh sunlight."
    // Over many trials, ~50% should hit. The hit rate should NOT match 70% (base accuracy).
    const ruleset = makeRuleset();
    const trials = 1000;
    let hits = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "thunder",
        moveAccuracy: 70,
        weather: "sun",
        seed,
      });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }

    // With 50% accuracy, expect ~500 hits out of 1000 (allow tolerance for PRNG variance)
    // Hit rate should be around 50%, NOT 70%
    const hitRate = hits / trials;
    expect(hitRate).toBeGreaterThan(0.35); // Lower bound: 35%
    expect(hitRate).toBeLessThan(0.65); // Upper bound: 65%
  });

  it("given Thunder in sun with +6 accuracy stage, when checking accuracy, then accuracy is still capped at 50%", () => {
    // Source: Showdown sim/battle-actions.ts — sun Thunder override is 50% flat
    // The weather override applies before the stage calculation, so stages do not help.
    const ruleset = makeRuleset();
    const trials = 500;
    let hits = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "thunder",
        moveAccuracy: 70,
        weather: "sun",
        accStage: 6,
        seed,
      });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }

    // Even with +6 accuracy, Thunder should still be ~50% in sun
    const hitRate = hits / trials;
    expect(hitRate).toBeGreaterThan(0.35);
    expect(hitRate).toBeLessThan(0.65);
  });
});

// ---------------------------------------------------------------------------
// Blizzard — 100% accuracy in hail
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Blizzard 100% accuracy in hail", () => {
  it("given Blizzard move and hail weather, when checking accuracy, then always hits (100%)", () => {
    // Source: Showdown sim/battle-actions.ts — Blizzard always hits in hail
    // Source: Bulbapedia — Blizzard: "100% accuracy in hail" (NEW in Gen 4)
    // Blizzard base accuracy is 70, but in hail it bypasses the accuracy check entirely.
    const ruleset = makeRuleset();
    const trials = 100;
    let hits = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "blizzard",
        moveAccuracy: 70,
        weather: "hail",
        seed,
      });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }

    // Blizzard should always hit in hail — all trials should be hits
    expect(hits).toBe(trials);
  });

  it("given Blizzard move and hail weather with -6 accuracy stage, when checking accuracy, then still always hits", () => {
    // Source: Showdown sim/battle-actions.ts — weather override bypasses stat stages
    const ruleset = makeRuleset();
    const trials = 50;
    let hits = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "blizzard",
        moveAccuracy: 70,
        weather: "hail",
        accStage: -6,
        seed,
      });
      if (ruleset.doesMoveHit(ctx)) hits++;
    }

    expect(hits).toBe(trials);
  });
});

// ---------------------------------------------------------------------------
// Weather accuracy — no override when weather doesn't match
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — weather accuracy overrides only apply to matching weather", () => {
  it("given Thunder move and no weather, when checking accuracy, then uses base 70% accuracy", () => {
    // Source: Showdown sim/battle-actions.ts — no weather = normal accuracy
    // Thunder base accuracy 70; without weather override, standard formula applies.
    const ruleset = makeRuleset();
    const trials = 200;
    let misses = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "thunder",
        moveAccuracy: 70,
        weather: null,
        seed,
      });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // With 70% accuracy, there should be some misses (30% miss rate)
    expect(misses).toBeGreaterThan(0);
  });

  it("given Thunder move and hail weather, when checking accuracy, then uses base 70% accuracy (hail only boosts Blizzard)", () => {
    // Source: Showdown sim/battle-actions.ts — hail does NOT boost Thunder accuracy
    const ruleset = makeRuleset();
    const trials = 200;
    let misses = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "thunder",
        moveAccuracy: 70,
        weather: "hail",
        seed,
      });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // Thunder in hail should miss sometimes (~30% of the time)
    expect(misses).toBeGreaterThan(0);
  });

  it("given Blizzard move and rain weather, when checking accuracy, then uses base 70% accuracy (rain only boosts Thunder)", () => {
    // Source: Showdown sim/battle-actions.ts — rain does NOT boost Blizzard accuracy
    const ruleset = makeRuleset();
    const trials = 200;
    let misses = 0;

    for (let seed = 1; seed <= trials; seed++) {
      const ctx = makeCtx({
        moveId: "blizzard",
        moveAccuracy: 70,
        weather: "rain",
        seed,
      });
      if (!ruleset.doesMoveHit(ctx)) misses++;
    }

    // Blizzard in rain should miss sometimes (~30% of the time)
    expect(misses).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Zoom Lens — +20% accuracy when attacker moves last
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Zoom Lens accuracy bonus", () => {
  it("given attacker with Zoom Lens and defender already moved, when checking accuracy with 70% move, then calc boosted to 84", () => {
    // Source: Bulbapedia — Zoom Lens: "Boosts accuracy by 20% if the holder moves after target."
    // Source: Showdown sim/items.ts — Zoom Lens onSourceModifyAccuracy
    // Derivation: base calc = 70; Zoom Lens: floor(70 * 120 / 100) = floor(84) = 84
    // Compared to no-item baseline of 70, Zoom Lens should produce fewer misses.
    const ruleset = makeRuleset();

    let zoomLensMisses = 0;
    let noItemMisses = 0;
    const trials = 500;

    for (let seed = 1; seed <= trials; seed++) {
      const ctxZoomLens = makeCtx({
        moveAccuracy: 70,
        attackerItem: "zoom-lens",
        defenderMovedThisTurn: true,
        seed,
      });
      const ctxNoItem = makeCtx({
        moveAccuracy: 70,
        defenderMovedThisTurn: true,
        seed,
      });

      if (!ruleset.doesMoveHit(ctxZoomLens)) zoomLensMisses++;
      if (!ruleset.doesMoveHit(ctxNoItem)) noItemMisses++;
    }

    // Zoom Lens (84% hit rate) should produce fewer misses than no item (70% hit rate)
    expect(zoomLensMisses).toBeLessThan(noItemMisses);
  });

  it("given attacker with Zoom Lens but defender has NOT moved yet, when checking accuracy, then Zoom Lens does NOT activate", () => {
    // Source: Bulbapedia — Zoom Lens only activates if holder moves after target
    // Source: Showdown sim/items.ts — checks if target has already moved
    // If the defender hasn't moved this turn, Zoom Lens doesn't apply.
    const ruleset = makeRuleset();

    let zoomLensMisses = 0;
    let noItemMisses = 0;
    const trials = 200;

    for (let seed = 1; seed <= trials; seed++) {
      const ctxZoomLens = makeCtx({
        moveAccuracy: 70,
        attackerItem: "zoom-lens",
        defenderMovedThisTurn: false, // defender hasn't moved yet
        seed,
      });
      const ctxNoItem = makeCtx({
        moveAccuracy: 70,
        defenderMovedThisTurn: false,
        seed,
      });

      if (!ruleset.doesMoveHit(ctxZoomLens)) zoomLensMisses++;
      if (!ruleset.doesMoveHit(ctxNoItem)) noItemMisses++;
    }

    // With the defender not having moved, Zoom Lens doesn't activate,
    // so both should have the same miss rate
    expect(zoomLensMisses).toBe(noItemMisses);
  });
});

// ---------------------------------------------------------------------------
// BrightPowder / Lax Incense — 10% evasion boost for defender
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — BrightPowder / Lax Incense evasion", () => {
  it("given defender with BrightPowder and a 100% accuracy move, when checking accuracy, then accuracy is reduced to 90", () => {
    // Source: Bulbapedia — BrightPowder: "Lowers opposing accuracy by 10%."
    // Source: Showdown sim/items.ts — BrightPowder onModifyAccuracy
    // Derivation: base calc = 100; BrightPowder: floor(100 * 90 / 100) = 90
    const ruleset = makeRuleset();

    let brightPowderMisses = 0;
    let noItemMisses = 0;
    const trials = 500;

    for (let seed = 1; seed <= trials; seed++) {
      const ctxBrightPowder = makeCtx({
        moveAccuracy: 100,
        defenderItem: "bright-powder",
        seed,
      });
      const ctxNoItem = makeCtx({
        moveAccuracy: 100,
        seed,
      });

      if (!ruleset.doesMoveHit(ctxBrightPowder)) brightPowderMisses++;
      if (!ruleset.doesMoveHit(ctxNoItem)) noItemMisses++;
    }

    // 100% accuracy move never misses without item; BrightPowder makes it miss sometimes
    expect(noItemMisses).toBe(0);
    expect(brightPowderMisses).toBeGreaterThan(0);
  });

  it("given defender with Lax Incense and a 100% accuracy move, when checking accuracy, then accuracy is reduced to 90", () => {
    // Source: Bulbapedia — Lax Incense: "Lowers opposing accuracy by 10%."
    // Source: Showdown sim/items.ts — Lax Incense onModifyAccuracy (same as BrightPowder)
    // Derivation: base calc = 100; Lax Incense: floor(100 * 90 / 100) = 90
    const ruleset = makeRuleset();

    let laxIncenseMisses = 0;
    let noItemMisses = 0;
    const trials = 500;

    for (let seed = 1; seed <= trials; seed++) {
      const ctxLaxIncense = makeCtx({
        moveAccuracy: 100,
        defenderItem: "lax-incense",
        seed,
      });
      const ctxNoItem = makeCtx({
        moveAccuracy: 100,
        seed,
      });

      if (!ruleset.doesMoveHit(ctxLaxIncense)) laxIncenseMisses++;
      if (!ruleset.doesMoveHit(ctxNoItem)) noItemMisses++;
    }

    // Same behavior as BrightPowder
    expect(noItemMisses).toBe(0);
    expect(laxIncenseMisses).toBeGreaterThan(0);
  });

  it("given defender with BrightPowder and a 70% accuracy move, when checking accuracy, then accuracy is reduced from 70 to 63", () => {
    // Source: Bulbapedia — BrightPowder: "Lowers opposing accuracy by 10%."
    // Derivation: base calc = 70; BrightPowder: floor(70 * 90 / 100) = floor(63) = 63
    // With 63% hit rate vs 70%, BrightPowder should produce more misses.
    const ruleset = makeRuleset();

    let brightPowderMisses = 0;
    let noItemMisses = 0;
    const trials = 500;

    for (let seed = 1; seed <= trials; seed++) {
      const ctxBrightPowder = makeCtx({
        moveAccuracy: 70,
        defenderItem: "bright-powder",
        seed,
      });
      const ctxNoItem = makeCtx({
        moveAccuracy: 70,
        seed,
      });

      if (!ruleset.doesMoveHit(ctxBrightPowder)) brightPowderMisses++;
      if (!ruleset.doesMoveHit(ctxNoItem)) noItemMisses++;
    }

    // BrightPowder should cause more misses than no item
    expect(brightPowderMisses).toBeGreaterThan(noItemMisses);
  });
});
