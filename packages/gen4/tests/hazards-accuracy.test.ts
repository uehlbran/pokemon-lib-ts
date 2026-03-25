import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { Gender, PokemonInstance, PokemonType, WeatherType } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_HAZARD_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager, GEN4_ABILITY_IDS, GEN4_MOVE_IDS, GEN4_SPECIES_IDS } from "../src";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const GEN4_DATA = createGen4DataManager();

const DEFAULT_NATURE_ID = ALL_NATURES[0]!.id;
const DEFAULT_SPECIES_ID = GEN4_SPECIES_IDS.mewtwo;
const DEFAULT_POKEBALL = GEN4_DATA.getSpecies(DEFAULT_SPECIES_ID).pokeball;

const TYPE_IDS = CORE_TYPE_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const MOVE_IDS = GEN4_MOVE_IDS;
const ABILITY_IDS = GEN4_ABILITY_IDS;
const HAZARD_IDS = CORE_HAZARD_IDS;

function createRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(GEN4_DATA);
}

function createPokemonInstanceFixture(
  overrides: {
    maxHp?: number;
    status?: PokemonInstance["status"];
    heldItem?: string | null;
    gender?: Gender;
    speciesId?: number;
  } = {},
): PokemonInstance {
  const species = GEN4_DATA.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const maxHp = overrides.maxHp ?? 200;
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(36), {
    nature: DEFAULT_NATURE_ID,
    heldItem: overrides.heldItem ?? null,
    pokeball: DEFAULT_POKEBALL,
    gender: overrides.gender,
  });

  pokemon.currentHp = maxHp;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  return pokemon;
}

function createActivePokemonFixture(
  overrides: {
    maxHp?: number;
    status?: PokemonInstance["status"];
    types?: PokemonType[];
    ability?: string;
    heldItem?: string | null;
    gender?: Gender;
    speciesId?: number;
  } = {},
): ActivePokemon {
  const species = GEN4_DATA.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const pokemon = createPokemonInstanceFixture({
    maxHp: overrides.maxHp,
    status: overrides.status,
    heldItem: overrides.heldItem,
    gender: overrides.gender,
    speciesId: overrides.speciesId,
  });
  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: overrides.types ?? [...species.types],
    ability: overrides.ability ?? pokemon.ability,
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

/** Build a minimal BattleSide with specified hazards. */
function createBattleSideFixture(
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
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.stealthRock, layers: 1 }]);

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
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.fire, TYPE_IDS.flying] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.stealthRock, layers: 1 }]);

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
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.ground] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.stealthRock, layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(12);
  });

  it("given a Pokemon and no hazards, when switching in, then takes 0 damage", () => {
    // Source: pret/pokeplatinum — no hazards = no damage
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, []);

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
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.spikes, layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(25);
  });

  it("given a grounded Pokemon and 2 Spike layers, when switching in, then takes 1/6 maxHP damage", () => {
    // Source: pret/pokeplatinum — Spikes 2 layers = 1/6 maxHP
    // Derivation: floor(200 * (1/6)) = floor(33.33...) = 33
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.spikes, layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(33);
  });

  it("given a grounded Pokemon and 3 Spike layers, when switching in, then takes 1/4 maxHP damage", () => {
    // Source: pret/pokeplatinum — Spikes 3 layers = 1/4 maxHP
    // Derivation: floor(200 * (1/4)) = 50
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.spikes, layers: 3 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(50);
  });

  it("given a Flying-type Pokemon and Spikes, when switching in, then takes 0 damage (immune)", () => {
    // Source: Bulbapedia — Flying-type Pokemon are not affected by Spikes
    // Source: pret/pokeplatinum — grounded check excludes Flying-types
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.flying] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.spikes, layers: 3 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.damage).toBe(0);
  });

  it("given a Levitate Pokemon and Spikes, when switching in, then takes 0 damage (immune)", () => {
    // Source: pret/pokeplatinum — Levitate ability grants Ground immunity, including Spikes
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({
      maxHp: 200,
      types: [TYPE_IDS.normal],
      ability: ABILITY_IDS.levitate,
    });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.spikes, layers: 3 }]);

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
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.toxicSpikes, layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBe(STATUS_IDS.poison);
  });

  it("given a grounded non-Poison Pokemon and 2 Toxic Spike layers, when switching in, then inflicts badly-poisoned", () => {
    // Source: Bulbapedia — Toxic Spikes: 2 layers = badly poisoned (toxic)
    // Source: pret/pokeplatinum — 2 layers of Toxic Spikes inflicts TOX (badly-poisoned)
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.normal] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.toxicSpikes, layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBe(STATUS_IDS.badlyPoisoned);
  });

  it("given a grounded Poison-type Pokemon and Toxic Spikes, when switching in, then absorbs spikes (no status)", () => {
    // Source: Bulbapedia — Poison-types absorb (remove) Toxic Spikes on switch-in
    // Source: pret/pokeplatinum — grounded Poison-type clears Toxic Spikes, no status inflicted
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.poison] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.toxicSpikes, layers: 2 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBeNull();
    // Source: Bulbapedia — Poison-types absorb (remove) Toxic Spikes on switch-in
    expect(result.hazardsToRemove).toEqual([HAZARD_IDS.toxicSpikes]);
  });

  it("given a grounded Steel-type Pokemon and Toxic Spikes, when switching in, then no status inflicted (Steel immune to poison)", () => {
    // Source: Bulbapedia — Steel-type Pokemon cannot be poisoned
    // Source: pret/pokeplatinum — Steel-type check prevents poison from Toxic Spikes
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.steel] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.toxicSpikes, layers: 1 }]);

    const result = ruleset.applyEntryHazards(
      mon,
      side as Parameters<Gen4Ruleset["applyEntryHazards"]>[1],
    );
    expect(result.statusInflicted).toBeNull();
  });

  it("given a Flying-type Pokemon and Toxic Spikes, when switching in, then no status inflicted (immune)", () => {
    // Source: Bulbapedia — Flying-types are not grounded, so not affected by Toxic Spikes
    const ruleset = createRuleset();
    const mon = createActivePokemonFixture({ maxHp: 200, types: [TYPE_IDS.flying] });
    const side = createBattleSideFixture(mon, [{ type: HAZARD_IDS.toxicSpikes, layers: 2 }]);

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

function createAccuracyContextFixture(overrides: {
  moveAccuracy?: number | null;
  attackerAbility?: string;
  defenderAbility?: string;
  accStage?: number;
  evaStage?: number;
  weather?: WeatherType | null;
  attackerItem?: string | null;
  moveCategory?: (typeof MOVE_CATEGORIES)[keyof typeof MOVE_CATEGORIES];
}): AccuracyContext {
  const attacker = createActivePokemonFixture({ ability: overrides.attackerAbility });
  const defender = createActivePokemonFixture({ ability: overrides.defenderAbility });
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
      id: MOVE_IDS.tackle,
      accuracy: overrides.moveAccuracy !== undefined ? overrides.moveAccuracy : 100,
      category: overrides.moveCategory ?? MOVE_CATEGORIES.physical,
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
    const ruleset = createRuleset();
    const ctx = createAccuracyContextFixture({ moveAccuracy: null });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given attacker with No Guard ability, when doesMoveHit, then always returns true", () => {
    // Source: Bulbapedia — No Guard: all moves used by or against the user always hit
    const ruleset = createRuleset();
    const ctx = createAccuracyContextFixture({
      attackerAbility: ABILITY_IDS.noGuard,
      moveAccuracy: 50,
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given defender with No Guard ability, when doesMoveHit, then always returns true", () => {
    // Source: Bulbapedia — No Guard: all moves used by or against the user always hit
    const ruleset = createRuleset();
    const ctx = createAccuracyContextFixture({
      defenderAbility: ABILITY_IDS.noGuard,
      moveAccuracy: 50,
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given a 100% accuracy move at neutral stages, when doesMoveHit with seeded RNG rolling 1-100, then returns true", () => {
    // Source: pret/pokeplatinum — 100% accuracy move at stage 0: calc = 100, roll <= 100 always hits
    // Stage 0 ratio: dividend=1, divisor=1 → calc = floor(1 * 100 / 1) = 100
    // Any roll 1-100 <= 100, so always hits
    // Using seed 1 which rolls an early value <= 100
    const ruleset = createRuleset();
    const _ctx = createAccuracyContextFixture({ moveAccuracy: 100, accStage: 0, evaStage: 0 });
    // With 100% accuracy at stage 0, the move always hits
    const results = Array.from({ length: 20 }, (_, i) => {
      const localCtx = createAccuracyContextFixture({
        moveAccuracy: 100,
        accStage: 0,
        evaStage: 0,
      });
      (localCtx as { rng: unknown }).rng = new SeededRandom(i + 1);
      return ruleset.doesMoveHit(localCtx);
    });
    // All 20 trials should hit (100% accuracy)
    expect(results.every(Boolean)).toBe(true);
  });

  it("given attacker with Compound Eyes and 70% accuracy move, when doesMoveHit with seed producing roll 74, then base misses but Compound Eyes hits", () => {
    // Source: pret/pokeplatinum — Compound Eyes: 1.3x accuracy bonus
    // Derivation: calc = floor(1 * 70 / 1) = 70; with Compound Eyes: floor(70 * 130 / 100) = 91
    // Seed 2 produces SeededRandom.int(1,100) = 74
    // Without Compound Eyes: 74 > 70 → miss
    // With Compound Eyes:    74 <= 91 → hit
    const ruleset = createRuleset();

    const ctxStandard = createAccuracyContextFixture({
      moveAccuracy: 70,
      accStage: 0,
      evaStage: 0,
    });
    (ctxStandard as { rng: unknown }).rng = new SeededRandom(2);
    expect(ruleset.doesMoveHit(ctxStandard)).toBe(false);

    const ctxCompound = createAccuracyContextFixture({
      moveAccuracy: 70,
      accStage: 0,
      evaStage: 0,
      attackerAbility: ABILITY_IDS.compoundEyes,
    });
    (ctxCompound as { rng: unknown }).rng = new SeededRandom(2);
    expect(ruleset.doesMoveHit(ctxCompound)).toBe(true);
  });
});
