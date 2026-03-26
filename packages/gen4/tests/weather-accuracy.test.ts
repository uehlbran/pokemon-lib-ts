import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type {
  PokemonInstance,
  PokemonType,
  SeededRandom as SeededRandomType,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createMoveSlot,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
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

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = CORE_ABILITY_IDS;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const MOVES = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const moveCategories = CORE_MOVE_CATEGORIES;
const abilitySlots = CORE_ABILITY_SLOTS;
const genders = CORE_GENDERS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN4_NATURE_IDS.hardy;

const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);

function makeRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(DATA_MANAGER);
}

function createSyntheticPokemonInstance(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  heldItem?: PokemonInstance["heldItem"];
}): PokemonInstance {
  return {
    uid: "test",
    speciesId: SPECIES.bulbasaur,
    nickname: null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: overrides.maxHp ?? 200,
    moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
    ability: ABILITIES.none,
    abilitySlot: abilitySlots.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: createFriendship(0),
    gender: genders.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
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

function createSyntheticOnFieldPokemon(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: PokemonInstance["ability"];
  heldItem?: PokemonInstance["heldItem"];
  movedThisTurn?: boolean;
}): ActivePokemon {
  return {
    pokemon: createSyntheticPokemonInstance({
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
    types: overrides.types ?? [TYPES.normal],
    ability: overrides.ability ?? ABILITIES.none,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

type AccuracyContext = Parameters<Gen4Ruleset["doesMoveHit"]>[0];

function makeCtx(overrides: {
  moveId?: AccuracyContext["move"]["id"];
  moveAccuracy?: number | null;
  attackerAbility?: PokemonInstance["ability"];
  defenderAbility?: PokemonInstance["ability"];
  accStage?: number;
  evaStage?: number;
  weather?: (typeof WEATHER)[keyof typeof WEATHER] | null;
  attackerItem?: PokemonInstance["heldItem"];
  defenderItem?: PokemonInstance["heldItem"];
  moveCategory?: (typeof moveCategories)[keyof typeof moveCategories];
  seed?: number;
  rng?: SeededRandomType;
  defenderMovedThisTurn?: boolean;
}): AccuracyContext {
  const attacker = createSyntheticOnFieldPokemon({
    ability: overrides.attackerAbility ?? "",
    heldItem: overrides.attackerItem,
  });
  const defender = createSyntheticOnFieldPokemon({
    ability: overrides.defenderAbility ?? "",
    heldItem: overrides.defenderItem,
    movedThisTurn: overrides.defenderMovedThisTurn ?? false,
  });

  if (overrides.accStage !== undefined) attacker.statStages.accuracy = overrides.accStage;
  if (overrides.evaStage !== undefined) defender.statStages.evasion = overrides.evaStage;

  const move = DATA_MANAGER.getMove(overrides.moveId ?? MOVES.tackle);

  return {
    attacker,
    defender,
    move: {
      ...move,
      accuracy: overrides.moveAccuracy !== undefined ? overrides.moveAccuracy : move.accuracy,
      category: overrides.moveCategory ?? move.category,
    } as AccuracyContext["move"],
    state: {
      weather: overrides.weather ? { type: overrides.weather, turnsLeft: 5, source: null } : null,
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
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.rain,
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in rain and rng roll of 1, when checking accuracy, then always hits (rain bypasses roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.rain,
      rng: createMockRng(1),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in rain with -6 accuracy stage, when checking accuracy, then still always hits (weather override bypasses stages)", () => {
    // Source: Showdown sim/battle-actions.ts — weather override bypasses stat stages
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.rain,
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
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.sun,
      rng: createMockRng(50),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in sun and rng roll of 51, when checking accuracy, then misses (boundary: 51 > 50)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.sun,
      rng: createMockRng(51),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Thunder in sun and rng roll of 1, when checking accuracy, then hits (minimum roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.sun,
      rng: createMockRng(1),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder in sun with +6 accuracy stage and rng roll of 51, when checking accuracy, then still misses (sun override is flat 50%)", () => {
    // Source: Showdown sim/battle-actions.ts — sun Thunder override is 50% flat,
    // bypasses normal accuracy/evasion stage formula entirely.
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.sun,
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
      moveId: MOVES.blizzard,
      moveAccuracy: 70,
      weather: WEATHER.hail,
      rng: createMockRng(100),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Blizzard in hail and rng roll of 1, when checking accuracy, then always hits (hail bypasses roll)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.blizzard,
      moveAccuracy: 70,
      weather: WEATHER.hail,
      rng: createMockRng(1),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Blizzard in hail with -6 accuracy stage, when checking accuracy, then still always hits (weather override bypasses stages)", () => {
    // Source: Showdown sim/battle-actions.ts — weather override bypasses stat stages
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.blizzard,
      moveAccuracy: 70,
      weather: WEATHER.hail,
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
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: null,
      rng: createMockRng(70),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Thunder and no weather, when rng roll is 71, then misses (base 70% accuracy, boundary: 71 > 70)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.thunder,
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
      moveId: MOVES.thunder,
      moveAccuracy: 70,
      weather: WEATHER.hail,
      rng: createMockRng(71),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Blizzard and rain weather, when rng roll is 71, then misses (rain does NOT boost Blizzard, boundary: 71 > 70)", () => {
    // Source: Showdown sim/battle-actions.ts — rain does NOT boost Blizzard accuracy
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveId: MOVES.blizzard,
      moveAccuracy: 70,
      weather: WEATHER.rain,
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
      attackerItem: ITEMS.zoomLens,
      defenderMovedThisTurn: true,
      rng: createMockRng(84),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Zoom Lens with defender moved and rng roll of 85, when checking accuracy, then misses (boundary: 85 > 84)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      attackerItem: ITEMS.zoomLens,
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
      attackerItem: ITEMS.zoomLens,
      defenderMovedThisTurn: false,
      rng: createMockRng(71),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given Zoom Lens with defender NOT moved and rng roll of 70, when checking accuracy, then hits (Zoom Lens inactive, base 70: 70 <= 70)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      attackerItem: ITEMS.zoomLens,
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
      defenderItem: ITEMS.brightPowder,
      rng: createMockRng(90),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given BrightPowder defender and 100% move, when rng roll is 91, then misses (boundary: 91 > 90)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 100,
      defenderItem: ITEMS.brightPowder,
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
      defenderItem: ITEMS.laxIncense,
      rng: createMockRng(91),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });

  it("given BrightPowder defender and 70% move, when rng roll is 63, then hits (boundary: 63 <= 63)", () => {
    // Derivation: floor(70 * 90 / 100) = 63
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      defenderItem: ITEMS.brightPowder,
      rng: createMockRng(63),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given BrightPowder defender and 70% move, when rng roll is 64, then misses (boundary: 64 > 63)", () => {
    const ruleset = makeRuleset();
    const ctx = makeCtx({
      moveAccuracy: 70,
      defenderItem: ITEMS.brightPowder,
      rng: createMockRng(64),
    });
    expect(ruleset.doesMoveHit(ctx)).toBe(false);
  });
});
