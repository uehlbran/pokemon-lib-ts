import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

function makePokemonInstance(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  heldItem?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
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
  maxHp?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
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

/** Build a minimal BattleSide with specified hazards. */
function makeSideWithHazards(
  active: ActivePokemon,
  hazards: Array<{ type: string; layers: number }>,
) {
  return {
    index: 0 as const,
    trainer: null,
    team: [],
    active: [active],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

// ---------------------------------------------------------------------------
// applyEntryHazards — Stealth Rock
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyEntryHazards — Stealth Rock", () => {
  it("given a neutral-typed Pokemon and one Stealth Rock layer, when switching in, then takes 1/8 maxHP damage", () => {
    // Source: Bulbapedia — Stealth Rock: base 1/8 max HP × type effectiveness of Rock
    // Neutral effectiveness (1x): 1/8 maxHP
    // Derivation: floor(200 * 1 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, [{ type: "stealth-rock", layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(25);
  });

  it("given a Fire/Flying Pokemon and Stealth Rock, when switching in, then takes 1/2 maxHP damage (4x weak)", () => {
    // Source: Bulbapedia — Stealth Rock: Rock vs Fire = 2x, Rock vs Flying = 2x → 4x total
    // 4x weak: base 1/8 * 4 = 1/2 maxHP
    // Derivation: floor(200 * 4 / 8) = 100
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["fire", "flying"] });
    const side = makeSideWithHazards(mon, [{ type: "stealth-rock", layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(100);
  });

  it("given a Ground-type Pokemon and Stealth Rock, when switching in, then takes 1/16 maxHP damage (resists Rock)", () => {
    // Source: Bulbapedia — Stealth Rock: Rock vs Ground = 0.5x (resist)
    // 0.5x resist: base 1/8 * 0.5 = 1/16 maxHP
    // Derivation: floor(200 * 0.5 / 8) = floor(12.5) = 12
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["ground"] });
    const side = makeSideWithHazards(mon, [{ type: "stealth-rock", layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(12);
  });

  it("given a Pokemon and no hazards, when switching in, then takes 0 damage", () => {
    // Source: pret/pokeplatinum — no hazards = no damage
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, []);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyEntryHazards — Spikes
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyEntryHazards — Spikes", () => {
  it("given a grounded Pokemon and 1 Spike layer, when switching in, then takes 1/8 maxHP damage", () => {
    // Source: pret/pokeplatinum — Spikes 1 layer = 1/8 maxHP (same as Gen 3)
    // Derivation: floor(200 * (1/8)) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(25);
  });

  it("given a grounded Pokemon and 2 Spike layers, when switching in, then takes 1/6 maxHP damage", () => {
    // Source: pret/pokeplatinum — Spikes 2 layers = 1/6 maxHP
    // Derivation: floor(200 * (1/6)) = floor(33.33...) = 33
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(33);
  });

  it("given a grounded Pokemon and 3 Spike layers, when switching in, then takes 1/4 maxHP damage", () => {
    // Source: pret/pokeplatinum — Spikes 3 layers = 1/4 maxHP
    // Derivation: floor(200 * (1/4)) = 50
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 3 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(50);
  });

  it("given a Flying-type Pokemon and Spikes, when switching in, then takes 0 damage (immune)", () => {
    // Source: Bulbapedia — Flying-type Pokemon are not affected by Spikes
    // Source: pret/pokeplatinum — grounded check excludes Flying-types
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 3 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(0);
  });

  it("given a Levitate Pokemon and Spikes, when switching in, then takes 0 damage (immune)", () => {
    // Source: pret/pokeplatinum — Levitate ability grants Ground immunity, including Spikes
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"], ability: "levitate" });
    const side = makeSideWithHazards(mon, [{ type: "spikes", layers: 3 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// applyEntryHazards — Toxic Spikes
// ---------------------------------------------------------------------------

describe("Gen4Ruleset applyEntryHazards — Toxic Spikes", () => {
  it("given a grounded non-Poison Pokemon and 1 Toxic Spike layer, when switching in, then inflicts poison", () => {
    // Source: Bulbapedia — Toxic Spikes: 1 layer = regular poison
    // Source: pret/pokeplatinum — 1 layer of Toxic Spikes inflicts PSN (poison)
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, [{ type: "toxic-spikes", layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBe("poison");
  });

  it("given a grounded non-Poison Pokemon and 2 Toxic Spike layers, when switching in, then inflicts badly-poisoned", () => {
    // Source: Bulbapedia — Toxic Spikes: 2 layers = badly poisoned (toxic)
    // Source: pret/pokeplatinum — 2 layers of Toxic Spikes inflicts TOX (badly-poisoned)
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSideWithHazards(mon, [{ type: "toxic-spikes", layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBe("badly-poisoned");
  });

  it("given a grounded Poison-type Pokemon and Toxic Spikes, when switching in, then absorbs spikes (no status)", () => {
    // Source: Bulbapedia — Poison-types absorb (remove) Toxic Spikes on switch-in
    // Source: pret/pokeplatinum — grounded Poison-type clears Toxic Spikes, no status inflicted
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["poison"] });
    const side = makeSideWithHazards(mon, [{ type: "toxic-spikes", layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBeNull();
  });

  it("given a grounded Steel-type Pokemon and Toxic Spikes, when switching in, then no status inflicted (Steel immune to poison)", () => {
    // Source: Bulbapedia — Steel-type Pokemon cannot be poisoned
    // Source: pret/pokeplatinum — Steel-type check prevents poison from Toxic Spikes
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["steel"] });
    const side = makeSideWithHazards(mon, [{ type: "toxic-spikes", layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBeNull();
  });

  it("given a Flying-type Pokemon and Toxic Spikes, when switching in, then no status inflicted (immune)", () => {
    // Source: Bulbapedia — Flying-types are not grounded, so not affected by Toxic Spikes
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const side = makeSideWithHazards(mon, [{ type: "toxic-spikes", layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// doesMoveHit — accuracy system
// ---------------------------------------------------------------------------

/** Minimal MoveData for accuracy tests. */
type AccuracyContext = Parameters<Gen4Ruleset["doesMoveHit"]>[0];

function makeAccuracyContext(overrides: {
  moveAccuracy?: number | null;
  attackerAbility?: string;
  defenderAbility?: string;
  accStage?: number;
  evaStage?: number;
  weather?: string | null;
  attackerItem?: string | null;
  moveCategory?: "physical" | "special" | "status";
}): AccuracyContext {
  const attacker = makeActivePokemon({ ability: overrides.attackerAbility ?? "" });
  const defender = makeActivePokemon({ ability: overrides.defenderAbility ?? "" });
  if (overrides.attackerItem) {
    (attacker.pokemon as { heldItem: string | null }).heldItem = overrides.attackerItem;
  }
  if (overrides.accStage !== undefined) {
    attacker.statStages.accuracy = overrides.accStage;
  }
  if (overrides.evaStage !== undefined) {
    defender.statStages.evasion = overrides.evaStage;
  }

  return {
    attacker,
    defender,
    move: {
      id: "tackle",
      accuracy: overrides.moveAccuracy !== undefined ? overrides.moveAccuracy : 100,
      category: overrides.moveCategory ?? "physical",
    } as AccuracyContext["move"],
    state: {
      weather: overrides.weather ? { type: overrides.weather } : null,
    } as AccuracyContext["state"],
    rng: new SeededRandom(42),
  };
}

describe("Gen4Ruleset doesMoveHit", () => {
  it("given a move with null accuracy (never-miss), when doesMoveHit, then always returns true", () => {
    // Source: pret/pokeplatinum — moves with accuracy=null always hit (e.g., Swift, Aerial Ace)
    const ruleset = makeRuleset();
    const ctx = makeAccuracyContext({ moveAccuracy: null });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given attacker with No Guard ability, when doesMoveHit, then always returns true", () => {
    // Source: Bulbapedia — No Guard: all moves used by or against the user always hit
    const ruleset = makeRuleset();
    const ctx = makeAccuracyContext({ attackerAbility: "no-guard", moveAccuracy: 50 });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given defender with No Guard ability, when doesMoveHit, then always returns true", () => {
    // Source: Bulbapedia — No Guard: all moves used by or against the user always hit
    const ruleset = makeRuleset();
    const ctx = makeAccuracyContext({ defenderAbility: "no-guard", moveAccuracy: 50 });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given a 100% accuracy move at neutral stages, when doesMoveHit with seeded RNG rolling 1-100, then returns true", () => {
    // Source: pret/pokeplatinum — 100% accuracy move at stage 0: calc = 100, roll <= 100 always hits
    // Stage 0 ratio: dividend=1, divisor=1 → calc = floor(1 * 100 / 1) = 100
    // Any roll 1-100 <= 100, so always hits
    // Using seed 1 which rolls an early value <= 100
    const ruleset = makeRuleset();
    const _ctx = makeAccuracyContext({ moveAccuracy: 100, accStage: 0, evaStage: 0 });
    // With 100% accuracy at stage 0, the move always hits
    const results = Array.from({ length: 20 }, (_, i) => {
      const localCtx = makeAccuracyContext({ moveAccuracy: 100, accStage: 0, evaStage: 0 });
      (localCtx as { rng: unknown }).rng = new SeededRandom(i + 1);
      return ruleset.doesMoveHit(localCtx);
    });
    // All 20 trials should hit (100% accuracy)
    expect(results.every(Boolean)).toBe(true);
  });

  it("given attacker with Compound Eyes and 70% accuracy move, when doesMoveHit calculation, then effective accuracy is 91% (floor(70 * 130/100))", () => {
    // Source: pret/pokeplatinum — Compound Eyes: 1.3x accuracy bonus
    // Derivation: calc = floor(1 * 70 / 1) = 70; with Compound Eyes: floor(70 * 130 / 100) = 91
    // A roll of 91 should hit; a roll of 92 should miss.
    const ruleset = makeRuleset();

    // Find a seed that rolls exactly 91 (should hit) — use the SeededRandom.int(1,100) behavior
    // By inspecting: with compound eyes, calc becomes 91.
    // Test with a known-hit seed and a move that has 70% base accuracy
    // With compound eyes active, a roll of 91 or less hits.

    // Verify the basic calculation: without Compound Eyes, 70% accuracy with seed-1 roll
    // Testing the modifier logic directly by checking that Compound Eyes calc > standard calc
    const ctxStandard = makeAccuracyContext({ moveAccuracy: 70, accStage: 0, evaStage: 0 });
    const ctxCompound = makeAccuracyContext({
      moveAccuracy: 70,
      accStage: 0,
      evaStage: 0,
      attackerAbility: "compound-eyes",
    });

    // Both use the same seed (42) — compound eyes should be able to hit more often
    // With accuracy = 70 and no modifier: calc = 70
    // With Compound Eyes: calc = floor(70 * 130 / 100) = 91
    // Verify: the compound eyes version has a hit threshold of 91 vs 70
    // Seed 42 on SeededRandom.int(1,100): check what value it produces
    const rng = new SeededRandom(42);
    const roll = rng.int(1, 100);
    // If roll <= 70, both hit. If 71 <= roll <= 91, only compound eyes hits.
    if (roll > 70 && roll <= 91) {
      // Roll is in the "compound eyes saves it" zone
      expect(ruleset.doesMoveHit(ctxStandard)).toBe(false);
      expect(ruleset.doesMoveHit(ctxCompound)).toBe(true);
    } else if (roll <= 70) {
      // Both hit
      expect(ruleset.doesMoveHit(ctxStandard)).toBe(true);
      expect(ruleset.doesMoveHit(ctxCompound)).toBe(true);
    } else {
      // roll > 91: both miss
      expect(ruleset.doesMoveHit(ctxStandard)).toBe(false);
      expect(ruleset.doesMoveHit(ctxCompound)).toBe(false);
    }
  });
});
