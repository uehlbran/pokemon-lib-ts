import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type {
  EntryHazardType,
  Gender,
  PrimaryStatus,
  PokemonInstance,
  PokemonType,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen5SwitchAbility } from "../src/Gen5AbilitiesSwitch";
import { applyGen5EntryHazards } from "../src/Gen5EntryHazards";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS };
const ITEMS = GEN5_ITEM_IDS;
const SPECIES = GEN5_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const STATUSES = CORE_STATUS_IDS;
const HAZARDS = CORE_HAZARD_IDS;
const TRIGGER_IDS = CORE_ABILITY_TRIGGER_IDS;
const dataManager = createGen5DataManager();
const DEFAULT_SPECIES = dataManager.getSpecies(SPECIES.bulbasaur);
const DEFAULT_NATURE = dataManager.getNature(GEN5_NATURE_IDS.hardy).id;
const DEFAULT_FRIENDSHIP = createFriendship(0);
const DEFAULT_POKEBALL = ITEMS.pokeBall;
const HAZARD_STATUS_SOURCE = "hazard-status-source";

/**
 * Bughunt batch 2 regression tests.
 *
 * Covers:
 *   #650 — Magic Guard Poison-type Toxic Spikes absorption
 *   #649 — UNSUPPRESSABLE_ABILITIES trimmed to Gen 5 set
 *   #657 — Effect Spore sleep threshold (< 11, not < 10)
 *   #661 — Synchronize does NOT trigger from Toxic Spikes
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createCanonicalPokemonInstance(overrides: {
  speciesId?: string;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(7), {
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    moves: [],
    heldItem: overrides.heldItem ?? null,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    friendship: DEFAULT_FRIENDSHIP,
    gender: overrides.gender ?? CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: DEFAULT_POKEBALL,
  });
  pokemon.uid = "test";
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? ABILITIES.none;
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
  ability?: string;
  types?: PokemonType[];
  speciesId?: string;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
}): ActivePokemon {
  const species = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  return {
    pokemon: createCanonicalPokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      gender: overrides.gender,
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
    types: overrides.types ?? [...(species.types as PokemonType[])],
    ability: overrides.ability ?? ABILITIES.none,
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
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
  } as unknown as ActivePokemon;
}

function createHazardSide(
  hazards: Array<{ type: EntryHazardType; layers: number }>,
  index: 0 | 1 = 0,
): BattleSide {
  return {
    index,
    active: [],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function createBattleState(gravityActive = false): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: "singles",
    turnNumber: 1,
    weather: null,
    terrain: null,
    sides: [createHazardSide([]), createHazardSide([], 1)],
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: gravityActive, turnsLeft: gravityActive ? 5 : 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ActivePokemon;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  rngNextValues?: number[];
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): AbilityContext {
  const state = createBattleState();
  const pokemon = createOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    volatiles: opts.volatiles,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// #650 — Magic Guard Poison-type Toxic Spikes absorption
// ===========================================================================

describe("#650 — Magic Guard + Poison-type Toxic Spikes absorption", () => {
  it("given a Poison-type with Magic Guard, when switching into Toxic Spikes, then absorbs and removes hazard", () => {
    // Source: Showdown data/conditions.ts — Toxic Spikes: grounded Poison-type always
    //   absorbs (removes) the hazard, regardless of abilities like Magic Guard.
    // Source: Bulbapedia — Toxic Spikes: "A grounded Poison-type Pokemon will absorb
    //   Toxic Spikes, removing them from the field."
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.poison],
      ability: ABILITIES.magicGuard,
    });
    const side = createHazardSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual([HAZARDS.toxicSpikes]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("absorbed the poison spikes");
  });

  it("given a Poison/Flying-type with Magic Guard, when switching into Toxic Spikes with Gravity, then absorbs hazard", () => {
    // Source: Showdown — Gravity grounds Flying-types; Poison-type still absorbs even with Magic Guard
    // Gravity makes the Pokemon grounded, so Toxic Spikes can be absorbed.
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.poison, TYPES.flying],
      ability: ABILITIES.magicGuard,
    });
    const side = createHazardSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState(true); // gravity active
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual([HAZARDS.toxicSpikes]);
  });

  it("given a Normal-type with Magic Guard, when switching into Toxic Spikes, then does NOT absorb hazard", () => {
    // Source: Showdown — only Poison-types absorb Toxic Spikes; other types just get immunity from Magic Guard
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.normal],
      ability: ABILITIES.magicGuard,
    });
    const side = createHazardSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toBeUndefined();
    expect(result.messages).toHaveLength(0);
  });
});

// ===========================================================================
// #649 — UNSUPPRESSABLE_ABILITIES trimmed to Gen 5 set
// ===========================================================================

describe("#649 — UNSUPPRESSABLE_ABILITIES scope in Gen 5", () => {
  it("given a Pokemon with Wonder Guard, when contacted by a Mummy holder, then ability is changed to Mummy", () => {
    // Source: Showdown data/abilities.ts — Gen 5: Wonder Guard CAN be overwritten by Mummy
    //   (only Multitype and Zen Mode are truly unsuppressable in Gen 5)
    // Source: Bulbapedia — Mummy: "Cannot overwrite Multitype" (Gen 5); Wonder Guard not listed
    const defender = createOnFieldPokemon({
      ability: ABILITIES.mummy,
      types: [TYPES.ghost],
      nickname: "Cofagrigus",
    });
    const attacker = createOnFieldPokemon({
      ability: ABILITIES.wonderGuard,
      types: [TYPES.bug, TYPES.ghost],
      nickname: "Shedinja",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.mummy,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.ghost],
    });
    // Inject the attacker as the opponent in the context
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: ABILITIES.mummy,
    });
  });

  it("given a Pokemon with Truant, when contacted by a Mummy holder, then ability is changed to Mummy", () => {
    // Source: Showdown data/abilities.ts — Gen 5: Truant CAN be overwritten by Mummy
    //   (Truant was only made unsuppressable in later gens, not Gen 5)
    const defender = createOnFieldPokemon({
      ability: ABILITIES.mummy,
      types: [TYPES.ghost],
      nickname: "Cofagrigus",
    });
    const attacker = createOnFieldPokemon({
      ability: ABILITIES.truant,
      types: [TYPES.normal],
      nickname: "Slaking",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.mummy,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.ghost],
    });
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: ABILITIES.mummy,
    });
  });

  it("given a Pokemon with Multitype, when contacted by a Mummy holder, then ability is NOT changed", () => {
    // Source: Showdown data/abilities.ts — Multitype is unsuppressable in Gen 5
    // Source: Bulbapedia — Multitype: "Cannot be overwritten by other Abilities"
    const defender = createOnFieldPokemon({
      ability: ABILITIES.mummy,
      types: [TYPES.ghost],
      nickname: "Cofagrigus",
    });
    const attacker = createOnFieldPokemon({
      ability: ABILITIES.multitype,
      types: [TYPES.normal],
      nickname: "Arceus",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.mummy,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.ghost],
    });
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Zen Mode, when contacted by a Mummy holder, then ability is NOT changed", () => {
    // Source: Showdown data/abilities.ts — Zen Mode is unsuppressable in Gen 5
    // Source: Bulbapedia — Zen Mode: "Cannot be suppressed"
    const defender = createOnFieldPokemon({
      ability: ABILITIES.mummy,
      types: [TYPES.ghost],
      nickname: "Cofagrigus",
    });
    const attacker = createOnFieldPokemon({
      ability: ABILITIES.zenMode,
      types: [TYPES.fire],
      nickname: "Darmanitan",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.mummy,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.ghost],
    });
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// #657 — Effect Spore sleep threshold (< 11, not < 10)
// ===========================================================================

describe("#657 — Effect Spore sleep/poison/paralysis thresholds", () => {
  it("given Effect Spore holder, when roll=10 (i.e., 10/100), then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts — effectspore: this.random(100)
    //   < 11 = sleep, < 21 = poison, < 30 = paralysis
    //   roll=10 is < 11, so it should be sleep
    const opponent = createOnFieldPokemon({ ability: ABILITIES.blaze, types: [TYPES.fire] });
    const ctx = createAbilityContext({
      ability: ABILITIES.effectSpore,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.grass],
      opponent,
      // roll = Math.floor(rngNext * 100); for roll=10, rngNext = 10/100 = 0.10
      rngNextValues: [0.1],
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.sleep,
    });
  });

  it("given Effect Spore holder, when roll=9 (i.e., 9/100), then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts — roll=9 < 11, so sleep
    const opponent = createOnFieldPokemon({ ability: ABILITIES.blaze, types: [TYPES.fire] });
    const ctx = createAbilityContext({
      ability: ABILITIES.effectSpore,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.grass],
      opponent,
      rngNextValues: [0.09],
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.sleep,
    });
  });

  it("given Effect Spore holder, when roll=11 (i.e., 11/100), then inflicts poison (not sleep)", () => {
    // Source: Showdown data/abilities.ts — roll=11 >= 11 but < 21, so poison
    //   Before the fix, roll=11 was < 20 = paralysis (wrong order).
    //   After the fix, roll=11 is >= 11 but < 21, so poison.
    const opponent = createOnFieldPokemon({ ability: ABILITIES.blaze, types: [TYPES.fire] });
    const ctx = createAbilityContext({
      ability: ABILITIES.effectSpore,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.grass],
      opponent,
      rngNextValues: [0.11],
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given Effect Spore holder, when roll=20 (i.e., 20/100), then inflicts poison (boundary)", () => {
    // Source: Showdown data/abilities.ts — roll=20 < 21, so poison
    const opponent = createOnFieldPokemon({ ability: ABILITIES.blaze, types: [TYPES.fire] });
    const ctx = createAbilityContext({
      ability: ABILITIES.effectSpore,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.grass],
      opponent,
      rngNextValues: [0.2],
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given Effect Spore holder, when roll=21 (i.e., 21/100), then inflicts paralysis", () => {
    // Source: Showdown data/abilities.ts — roll=21 >= 21 but < 30, so paralysis
    const opponent = createOnFieldPokemon({ ability: ABILITIES.blaze, types: [TYPES.fire] });
    const ctx = createAbilityContext({
      ability: ABILITIES.effectSpore,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.grass],
      opponent,
      rngNextValues: [0.21],
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.paralysis,
    });
  });

  it("given Effect Spore holder, when roll=30 (i.e., 30/100), then no effect", () => {
    // Source: Showdown data/abilities.ts — roll=30 >= 30, no effect
    const opponent = createOnFieldPokemon({ ability: ABILITIES.blaze, types: [TYPES.fire] });
    const ctx = createAbilityContext({
      ability: ABILITIES.effectSpore,
      trigger: TRIGGER_IDS.onContact,
      types: [TYPES.grass],
      opponent,
      rngNextValues: [0.3],
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// #661 — Synchronize does NOT trigger from Toxic Spikes
// ===========================================================================

describe("#661 — Synchronize hazard-source exclusion", () => {
  it("given Synchronize holder poisoned by Toxic Spikes (hazard-status-source volatile present), when Synchronize checks, then does NOT trigger", () => {
    // Source: Showdown data/abilities.ts — Synchronize: if (effect.id === 'toxicspikes') return;
    // The entry hazard code sets a "hazard-status-source" volatile when Toxic Spikes inflicts
    // status. Synchronize checks for this volatile and skips activation.
    const opponent = createOnFieldPokemon({
      ability: ABILITIES.blaze,
      types: [TYPES.fire],
      nickname: "Charizard",
    });
    const hazardVolatile = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>([
      [HAZARD_STATUS_SOURCE, { turnsLeft: 1 }],
    ]);
    const ctx = createAbilityContext({
      ability: ABILITIES.synchronize,
      trigger: TRIGGER_IDS.onStatusInflicted,
      types: [TYPES.psychic],
      status: STATUSES.poison,
      opponent,
      volatiles: hazardVolatile,
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
    // The volatile should be removed after checking
    expect(ctx.pokemon.volatileStatuses.has(HAZARD_STATUS_SOURCE)).toBe(false);
  });

  it("given Synchronize holder poisoned by opponent's Toxic move, when Synchronize checks, then DOES trigger", () => {
    // Source: Showdown data/abilities.ts — Synchronize: spreads poison/burn/paralysis from opponent's move
    // No hazard-status-source volatile present, so Synchronize fires normally.
    const opponent = createOnFieldPokemon({
      ability: ABILITIES.blaze,
      types: [TYPES.fire],
      nickname: "Charizard",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.synchronize,
      trigger: TRIGGER_IDS.onStatusInflicted,
      types: [TYPES.psychic],
      status: STATUSES.poison,
      opponent,
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onStatusInflicted, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.poison,
    });
  });

  it("given Synchronize holder burned by opponent's Will-O-Wisp, when Synchronize checks, then DOES trigger", () => {
    // Source: Showdown data/abilities.ts — Synchronize: spreads burn from opponent's move
    // Source: Bulbapedia — Synchronize: "Passes burn, paralysis, or poison to the foe."
    const opponent = createOnFieldPokemon({
      ability: ABILITIES.blaze,
      types: [TYPES.fire],
      nickname: "Charizard",
    });
    const ctx = createAbilityContext({
      ability: ABILITIES.synchronize,
      trigger: TRIGGER_IDS.onStatusInflicted,
      types: [TYPES.psychic],
      status: STATUSES.burn,
      opponent,
    });

    const result = handleGen5SwitchAbility(TRIGGER_IDS.onStatusInflicted, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: STATUSES.burn,
    });
  });

  it("given Toxic Spikes inflicting status, when applyGen5EntryHazards returns, then hazard-status-source volatile is set", () => {
    // Source: Showdown data/abilities.ts — Synchronize: if (effect.id === 'toxicspikes') return;
    // Verify that the entry hazard code sets the volatile marker for Synchronize to check.
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.normal],
      ability: ABILITIES.synchronize,
    });
    const side = createHazardSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.statusInflicted).toBe(STATUSES.poison);
    expect(pokemon.volatileStatuses.has(HAZARD_STATUS_SOURCE)).toBe(true);
  });
});
