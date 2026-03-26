import type { AbilityContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import {
  createOnFieldPokemon as createBattleOnFieldPokemon,
  createBattleSide,
  createBattleState,
} from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_NATURE_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen9DataManager,
  GEN9_ABILITY_IDS,
  GEN9_ITEM_IDS,
  GEN9_MOVE_IDS,
  GEN9_SPECIES_IDS,
} from "../src";
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

const dataManager = createGen9DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS } as const;
const abilityTriggers = CORE_ABILITY_TRIGGER_IDS;
const itemIds = { ...CORE_ITEM_IDS, ...GEN9_ITEM_IDS } as const;
const moveCategories = CORE_MOVE_CATEGORIES;
const moveIds = GEN9_MOVE_IDS;
const speciesIds = GEN9_SPECIES_IDS;
const terrainIds = CORE_TERRAIN_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.eevee);
const defaultNature = dataManager.getNature(CORE_NATURE_IDS.hardy).id;

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

function createCanonicalMove(moveId: (typeof moveIds)[keyof typeof moveIds]): MoveData {
  return dataManager.getMove(moveId);
}

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides.effect ?? baseMove.effect,
  };
}

function createSyntheticPokemonInstance(overrides: {
  ability?: (typeof abilityIds)[keyof typeof abilityIds] | "";
  nickname?: string | null;
  heldItem?: (typeof itemIds)[keyof typeof itemIds] | null;
  status?: PrimaryStatus | null;
  maxHp?: number;
  speciesId?: (typeof speciesIds)[keyof typeof speciesIds];
}): ActivePokemon["pokemon"] {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(7), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    moves: [],
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.uid = createTestUid();
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = maxHp;
  pokemon.ability = overrides.ability ?? "";
  pokemon.heldItem = overrides.heldItem ?? null;
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

function createOnFieldPokemon(overrides: {
  ability?: (typeof abilityIds)[keyof typeof abilityIds] | "";
  types?: PokemonType[];
  nickname?: string | null;
  heldItem?: (typeof itemIds)[keyof typeof itemIds] | null;
  status?: PrimaryStatus | null;
  maxHp?: number;
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isTerastallized?: boolean;
  speciesId?: (typeof speciesIds)[keyof typeof speciesIds];
}): ActivePokemon {
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    nickname: overrides.nickname,
    heldItem: overrides.heldItem,
    status: overrides.status,
    maxHp: overrides.maxHp,
    speciesId: overrides.speciesId,
  });
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  activePokemon.ability = overrides.ability ?? "";
  activePokemon.volatileStatuses = overrides.volatiles ?? new Map();
  activePokemon.substituteHp = overrides.substituteHp ?? 0;
  activePokemon.isTerastallized = overrides.isTerastallized ?? false;
  return activePokemon;
}

function createTestRng(overrides?: Partial<SeededRandom>): SeededRandom {
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

function createAbilityBattleState(overrides?: {
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
}): BattleState {
  return createBattleState({
    generation: 9,
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    sides: [createBattleSide({ index: 0 }), createBattleSide({ index: 1 })],
    rng: createTestRng(),
  });
}

function createAbilityContext(overrides: {
  pokemon: ActivePokemon;
  opponent?: ActivePokemon;
  trigger: AbilityContext["trigger"];
  weather?: BattleState["weather"];
  terrain?: BattleState["terrain"];
  move?: MoveData;
  rng?: Partial<SeededRandom>;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon,
    opponent: overrides.opponent,
    state: createAbilityBattleState({ weather: overrides.weather, terrain: overrides.terrain }),
    rng: createTestRng(overrides.rng),
    trigger: overrides.trigger,
    move: overrides.move,
  };
}

// ---------------------------------------------------------------------------
// Dispatch routing tests
// ---------------------------------------------------------------------------

describe("handleGen9Ability -- routing", () => {
  it("routes protosynthesis to stat ability handler (priority 1)", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.protosynthesis }),
      trigger: abilityTriggers.onSwitchIn,
      weather: { type: weatherIds.sun, turnsLeft: 5, source: abilityIds.drought },
    });
    const result = handleGen9Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ volatile: volatileIds.protosynthesis }),
    );
  });

  it("routes quark-drive to stat ability handler (priority 1)", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.quarkDrive }),
      trigger: abilityTriggers.onSwitchIn,
      terrain: {
        type: terrainIds.electric,
        turnsLeft: 5,
        source: abilityIds.electricSurge,
      },
    });
    const result = handleGen9Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ volatile: volatileIds.quarkDrive }),
    );
  });

  it("routes intrepid-sword to new ability handler (priority 2)", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.intrepidSword }),
      trigger: abilityTriggers.onSwitchIn,
    });
    const result = handleGen9Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[1]).toEqual(expect.objectContaining({ stat: "attack", stages: 1 }));
  });

  it("routes intimidate to switch ability handler (priority 3)", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.intimidate }),
      opponent: createOnFieldPokemon({}),
      trigger: abilityTriggers.onSwitchIn,
    });
    const result = handleGen9Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "attack", stages: -1 }));
  });

  it("routes drizzle to switch ability handler (priority 3)", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.drizzle }),
      trigger: abilityTriggers.onSwitchIn,
    });
    const result = handleGen9Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ weather: weatherIds.rain }));
  });

  it("routes speed-boost on-turn-end to switch ability handler", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.speedBoost }),
      trigger: abilityTriggers.onTurnEnd,
    });
    const result = handleGen9Ability(abilityTriggers.onTurnEnd, ctx);
    expect(result.activated).toBe(true);
  });

  it("given unsupported trigger type, then returns inactive", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.intimidate }),
      trigger: "on-damage",
    });
    const result = handleGen9Ability("on-damage", ctx);
    expect(result.activated).toBe(false);
  });

  it("given embody aspect (which isEmbodyAspect check covers), routes to new ability handler", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: abilityIds.embodyAspectTeal,
        isTerastallized: true,
      }),
      trigger: abilityTriggers.onSwitchIn,
    });
    const result = handleGen9Ability(abilityTriggers.onSwitchIn, ctx);
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
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.triage }),
      trigger: abilityTriggers.onPriorityCheck,
      move: createCanonicalMove(moveIds.lifeDew),
    });
    const result = handleGen9Ability(abilityTriggers.onPriorityCheck, ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });

  it("given Triage user with jungle-healing, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/moves.ts -- jungle-healing has heal flag
    // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.triage }),
      trigger: abilityTriggers.onPriorityCheck,
      move: createCanonicalMove(moveIds.jungleHealing),
    });
    const result = handleGen9Ability(abilityTriggers.onPriorityCheck, ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });

  it("given Triage user with lunar-blessing, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/moves.ts -- lunar-blessing has heal flag
    // Source: Bulbapedia "Triage" -- "+3 priority to healing moves"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.triage }),
      trigger: abilityTriggers.onPriorityCheck,
      move: createCanonicalMove(moveIds.lunarBlessing),
    });
    const result = handleGen9Ability(abilityTriggers.onPriorityCheck, ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });

  it("given Triage user with non-allowlisted move that has effectType heal, when checking priority, then returns activated with +3 boost", () => {
    // Source: Showdown data/abilities.ts -- triage: move.flags.heal check
    // Verifies the effectType "heal" fallback for future moves not yet in the HEALING_MOVES allowlist
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: abilityIds.triage }),
      trigger: abilityTriggers.onPriorityCheck,
      move: createSyntheticMoveFrom(createCanonicalMove(moveIds.lifeDew), {
        id: "custom-heal-move",
        category: moveCategories.status,
        type: typeIds.normal,
        effect: { type: "heal" },
      }),
    });
    const result = handleGen9Ability(abilityTriggers.onPriorityCheck, ctx);
    expect(result.activated).toBe(true);
    expect(result.priorityBoost).toBe(3);
  });
});
