import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { Gen4Ruleset } from "../src/Gen4Ruleset";

const dataManager = createGen4DataManager();
const coreAbilityIds = CORE_ABILITY_IDS;
const abilityIds = GEN4_ABILITY_IDS;
const itemIds = GEN4_ITEM_IDS;
const moveCategories = CORE_MOVE_CATEGORIES;
const moveIds = GEN4_MOVE_IDS;
const natureIds = GEN4_NATURE_IDS;
const speciesIds = GEN4_SPECIES_IDS;
const typeIds = CORE_TYPE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const defaultSpeciesId = speciesIds.bulbasaur;
const defaultNature = dataManager.getNature(natureIds.hardy).id;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(dataManager);
}

function createSyntheticPokemonInstance(overrides: {
  maxHp?: number;
  status?: PrimaryStatus | null;
  heldItem?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: defaultSpeciesId,
    nickname: null,
    level: 50,
    experience: 0,
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: maxHp,
    moves: [],
    ability: coreAbilityIds.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
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

function createOnFieldPokemon(overrides: {
  maxHp?: number;
  status?: PrimaryStatus | null;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
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
    types: overrides.types ?? [typeIds.normal],
    ability: overrides.ability ?? coreAbilityIds.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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

type AccuracyContext = Parameters<Gen4Ruleset["doesMoveHit"]>[0];

function createAccuracyContext(overrides: {
  moveAccuracy?: number | null;
  attackerAbility?: string;
  defenderAbility?: string;
  accStage?: number;
  evaStage?: number;
  weather?: string | null;
  attackerItem?: string | null;
  moveCategory?: MoveData["category"];
  seed?: number;
}): AccuracyContext {
  const attacker = createOnFieldPokemon({
    ability: overrides.attackerAbility ?? coreAbilityIds.none,
  });
  const defender = createOnFieldPokemon({
    ability: overrides.defenderAbility ?? coreAbilityIds.none,
  });

  if (overrides.attackerItem !== undefined) {
    (attacker.pokemon as { heldItem: string | null }).heldItem = overrides.attackerItem;
  }
  if (overrides.accStage !== undefined) attacker.statStages.accuracy = overrides.accStage;
  if (overrides.evaStage !== undefined) defender.statStages.evasion = overrides.evaStage;

  return {
    attacker,
    defender,
    move: {
      id: moveIds.tackle,
      accuracy: overrides.moveAccuracy !== undefined ? overrides.moveAccuracy : 100,
      category: overrides.moveCategory ?? moveCategories.physical,
    } as AccuracyContext["move"],
    state: {
      weather: overrides.weather ? { type: overrides.weather } : null,
    } as AccuracyContext["state"],
    rng: new SeededRandom(overrides.seed ?? 1),
  };
}

// ---------------------------------------------------------------------------
// doesMoveHit — weather-ability branches (Sand Veil, Snow Cloak)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — weather ability branches", () => {
  it("given defender with Sand Veil in sandstorm and a 100% accuracy move, when checking hit for seed 4, then Sand Veil causes the miss while no ability still hits", () => {
    // Source: pret/pokeplatinum — Sand Veil: evasion +20% in sandstorm
    // Derivation: base calc = 100; Sand Veil: floor(100 * 80 / 100) = 80
    const ruleset = createRuleset();
    const sandVeilCtx = createAccuracyContext({
      moveAccuracy: 100,
      defenderAbility: abilityIds.sandVeil,
      weather: weatherIds.sand,
      seed: 4,
    });
    const noAbilityCtx = createAccuracyContext({
      moveAccuracy: 100,
      weather: weatherIds.sand,
      seed: 4,
    });

    // Source: deterministic seed 4 exercises the Sand Veil miss branch.
    expect(ruleset.doesMoveHit(sandVeilCtx)).toBe(false);
    expect(ruleset.doesMoveHit(noAbilityCtx)).toBe(true);
  });

  it("given defender with Snow Cloak in hail and a 100% accuracy move, when checking hit for seed 4, then Snow Cloak causes the miss while no ability still hits", () => {
    // Source: Bulbapedia — Snow Cloak: evasion +20% in hail (analogous to Sand Veil in sandstorm)
    // Derivation: base calc = 100; Snow Cloak: floor(100 * 80 / 100) = 80
    const ruleset = createRuleset();
    const snowCloakCtx = createAccuracyContext({
      moveAccuracy: 100,
      defenderAbility: abilityIds.snowCloak,
      weather: weatherIds.hail,
      seed: 4,
    });
    const noAbilityCtx = createAccuracyContext({
      moveAccuracy: 100,
      weather: weatherIds.hail,
      seed: 4,
    });

    // Source: deterministic seed 4 exercises the Snow Cloak miss branch.
    expect(ruleset.doesMoveHit(snowCloakCtx)).toBe(false);
    expect(ruleset.doesMoveHit(noAbilityCtx)).toBe(true);
  });

  it("given Sand Veil in non-sandstorm weather, when doesMoveHit, then Sand Veil branch is NOT applied", () => {
    // Source: pret/pokeplatinum — Sand Veil only activates in sandstorm, not other weather
    const ruleset = createRuleset();
    const ctx = createAccuracyContext({
      moveAccuracy: 100,
      defenderAbility: abilityIds.sandVeil,
      weather: weatherIds.rain, // not sandstorm
      seed: 4,
    });

    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });

  it("given Snow Cloak outside hail, when doesMoveHit, then Snow Cloak branch is NOT applied", () => {
    // Source: Bulbapedia — Snow Cloak only activates in hail
    const ruleset = createRuleset();
    const ctx = createAccuracyContext({
      moveAccuracy: 100,
      defenderAbility: abilityIds.snowCloak,
      weather: weatherIds.sand, // not hail
      seed: 4,
    });

    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// doesMoveHit — Hustle branch (physical move penalty)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Hustle accuracy penalty", () => {
  it("given attacker with Hustle using a physical move, when accuracy is checked, then accuracy is reduced by 0.8x", () => {
    // Source: pret/pokeplatinum — Hustle accuracy penalty on physical moves: 0.8x
    // Gen 4 uses per-move category (physical/special split)
    // Derivation: base 100% accuracy; Hustle: floor(100 * 80/100) = 80
    const ruleset = createRuleset();
    const hustleCtx = createAccuracyContext({
      moveAccuracy: 100,
      attackerAbility: abilityIds.hustle,
      moveCategory: moveCategories.physical,
      seed: 4,
    });
    const noHustleCtx = createAccuracyContext({
      moveAccuracy: 100,
      moveCategory: moveCategories.physical,
      seed: 4,
    });

    // Source: deterministic seed 4 exercises the Hustle miss branch.
    expect(ruleset.doesMoveHit(hustleCtx)).toBe(false);
    expect(ruleset.doesMoveHit(noHustleCtx)).toBe(true);
  });

  it("given attacker with Hustle using a special move, when accuracy is checked, then accuracy is NOT reduced", () => {
    // Source: pret/pokeplatinum — Hustle only penalizes physical moves
    const ruleset = createRuleset();
    const ctx = createAccuracyContext({
      moveAccuracy: 100,
      attackerAbility: abilityIds.hustle,
      moveCategory: moveCategories.special, // special move — not penalized
      seed: 4,
    });

    expect(ruleset.doesMoveHit(ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// doesMoveHit — Wide Lens (held item, NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("Gen4Ruleset doesMoveHit — Wide Lens accuracy bonus", () => {
  it("given attacker with Wide Lens and a 70% accuracy move, when doesMoveHit, then calc is boosted to 77", () => {
    // Source: Bulbapedia — Wide Lens: accuracy * 1.1 (introduced in Gen 4)
    // Derivation: base calc = 70; Wide Lens: floor(70 * 110/100) = floor(77) = 77
    const ruleset = createRuleset();

    let wideLensMisses = 0;
    let noItemMisses = 0;
    const trials = 200;

    for (let seed = 1; seed <= trials; seed++) {
      const ctxWideLens = createAccuracyContext({
        moveAccuracy: 70,
        attackerItem: itemIds.wideLens,
        seed,
      });
      const ctxNoItem = createAccuracyContext({ moveAccuracy: 70, seed });

      if (!ruleset.doesMoveHit(ctxWideLens)) wideLensMisses++;
      if (!ruleset.doesMoveHit(ctxNoItem)) noItemMisses++;
    }

    // Wide Lens should produce fewer misses than no item (77% vs 70% hit rate)
    expect(wideLensMisses).toBeLessThan(noItemMisses);
  });
});
