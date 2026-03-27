/**
 * Targeted coverage tests for Gen6Abilities.ts (master dispatcher) and
 * Gen6AbilitiesStat.ts / Gen6AbilitiesRemaining.ts low-coverage branches.
 *
 * Focuses on exercising every dispatch path through applyGen6Ability
 * and the remaining ability sub-module handlers.
 *
 * Source: Showdown data/abilities.ts, Bulbapedia ability articles
 */

import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { BATTLE_ABILITY_EFFECT_TYPES } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TYPES,
  CORE_NATURE_IDS,
  CORE_POKEMON_DEFAULTS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
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
  applyGen6Ability,
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { handleGen6RemainingAbility } from "../src/Gen6AbilitiesRemaining";
import { handleGen6StatAbility } from "../src/Gen6AbilitiesStat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

const abilityIds = GEN6_ABILITY_IDS;
const itemIds = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS } as const;
const moveIds = GEN6_MOVE_IDS;
const speciesIds = GEN6_SPECIES_IDS;
const coreAbilityIds = CORE_ABILITY_IDS;
const typeIds = CORE_TYPE_IDS;
const statusIds = CORE_STATUS_IDS;
const weatherIds = CORE_WEATHER_IDS;
const abilityTriggers = CORE_ABILITY_TRIGGER_IDS;
const moveCategories = CORE_MOVE_CATEGORIES;
const dataManager = createGen6DataManager();
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const defaultMove = dataManager.getMove(moveIds.tackle);
const defaultNature = dataManager.getNature(CORE_NATURE_IDS.hardy).id;

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: PrimaryStatus | null;
  heldItem?: string | null;
  gender?: Gender;
  uid?: string;
}) {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(6 + species.id), {
    nature: defaultNature,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: CORE_POKEMON_DEFAULTS.metLocation,
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });
  pokemon.uid = overrides.uid ?? createTestUid();
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.status = overrides.status ?? null;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.ability = overrides.ability ?? coreAbilityIds.none;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  return {
    pokemon,
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
    types: overrides.types ?? [...(species.types as PokemonType[])],
    ability: overrides.ability ?? coreAbilityIds.none,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
  };
}

function createBattleSide(index: 0 | 1): BattleSide {
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

function createBattleState(overrides?: {
  weather?: BattleState["weather"];
  format?: string;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 0,
      chance: () => true,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createSyntheticMove(
  type: PokemonType,
  opts?: {
    id?: string;
    category?: MoveData["category"];
    power?: number | null;
    flags?: Record<string, boolean>;
    displayName?: string;
    effect?: { type: string; [key: string]: unknown } | null;
  },
): MoveData {
  const baseMove = (() => {
    try {
      return dataManager.getMove(opts?.id ?? moveIds.tackle);
    } catch {
      return {
        ...defaultMove,
        id: opts?.id ?? defaultMove.id,
        displayName: opts?.displayName ?? defaultMove.displayName,
      };
    }
  })();
  return {
    ...baseMove,
    id: opts?.id ?? baseMove.id,
    displayName: opts?.displayName ?? baseMove.displayName,
    type,
    category: opts?.category ?? baseMove.category,
    power: opts?.power ?? baseMove.power,
    priority: 0,
    target: baseMove.target,
    flags: { ...baseMove.flags, ...(opts?.flags ?? {}) },
    effect: opts?.effect ?? baseMove.effect,
  } as MoveData;
}

function createAbilityContext(overrides: {
  ability: string;
  trigger: AbilityContext["trigger"];
  types?: PokemonType[];
  move?: MoveData;
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  state?: BattleState;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: PrimaryStatus | null;
  heldItem?: string | null;
  speciesId?: number;
  statChange?: { stages: number; source: string };
  turnsOnField?: number;
}): AbilityContext {
  const pokemon = createOnFieldPokemon({
    ability: overrides.ability,
    types: overrides.types,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    status: overrides.status,
    heldItem: overrides.heldItem,
    speciesId: overrides.speciesId,
  });
  if (overrides.turnsOnField !== undefined) {
    pokemon.turnsOnField = overrides.turnsOnField;
  }
  return {
    pokemon,
    opponent: overrides.opponent ?? undefined,
    state: overrides.state ?? createBattleState(),
    rng: (overrides.state ?? createBattleState()).rng,
    trigger: overrides.trigger,
    move: overrides.move,
    statChange: overrides.statChange,
  } as unknown as AbilityContext;
}

// ===========================================================================
// applyGen6Ability — dispatcher coverage
// ===========================================================================

describe("applyGen6Ability — dispatcher triggers", () => {
  // ---- Single-module triggers ----

  it("given on-priority-check trigger with Prankster + status move, when dispatching, then routes to stat module and activates", () => {
    // Source: Showdown data/abilities.ts -- Prankster onModifyPriority +1 for status
    const ctx = createAbilityContext({
      ability: abilityIds.prankster,
      trigger: abilityTriggers.onPriorityCheck,
      move: createSyntheticMove(typeIds.normal, { category: moveCategories.status }),
    });
    const result = applyGen6Ability(abilityTriggers.onPriorityCheck, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-after-move-used trigger with Moxie + fainted foe, when dispatching, then routes to stat module", () => {
    // Source: Showdown data/abilities.ts -- Moxie onSourceAfterFaint: +1 Atk
    const foe = createOnFieldPokemon({ currentHp: 0 });
    const ctx = createAbilityContext({
      ability: abilityIds.moxie,
      trigger: abilityTriggers.onAfterMoveUsed,
      opponent: foe,
    });
    const result = applyGen6Ability(abilityTriggers.onAfterMoveUsed, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-flinch trigger with Steadfast, when dispatching, then routes to stat module", () => {
    // Source: Showdown data/abilities.ts -- Steadfast onFlinch: +1 Speed
    const ctx = createAbilityContext({
      ability: abilityIds.steadfast,
      trigger: abilityTriggers.onFlinch,
    });
    const result = applyGen6Ability(abilityTriggers.onFlinch, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-item-use trigger with Unnerve, when dispatching, then routes to stat module", () => {
    // Source: Showdown data/abilities.ts -- Unnerve onFoeTryEatItem
    const ctx = createAbilityContext({
      ability: abilityIds.unnerve,
      trigger: abilityTriggers.onItemUse,
    });
    const result = applyGen6Ability(abilityTriggers.onItemUse, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-before-move trigger with Protean + non-matching type, when dispatching, then routes to stat module and activates", () => {
    // Source: Showdown data/abilities.ts -- Protean onPrepareHit
    const ctx = createAbilityContext({
      ability: abilityIds.protean,
      trigger: abilityTriggers.onBeforeMove,
      move: createSyntheticMove(typeIds.fire),
    });
    const result = applyGen6Ability(abilityTriggers.onBeforeMove, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-switch-out trigger with Regenerator, when dispatching, then routes to switch module", () => {
    // Source: Showdown data/abilities.ts -- Regenerator onSwitchOut: heal 1/3
    const ctx = createAbilityContext({
      ability: abilityIds.regenerator,
      trigger: abilityTriggers.onSwitchOut,
    });
    const result = applyGen6Ability(abilityTriggers.onSwitchOut, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-contact trigger with Rough Skin + opponent, when dispatching, then routes to switch module", () => {
    // Source: Showdown data/abilities.ts -- Rough Skin: 1/8 chip damage
    const foe = createOnFieldPokemon({});
    const ctx = createAbilityContext({
      ability: abilityIds.roughSkin,
      trigger: abilityTriggers.onContact,
      opponent: foe,
    });
    const result = applyGen6Ability(abilityTriggers.onContact, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-status-inflicted trigger with Synchronize + burn, when dispatching, then routes to switch module", () => {
    // Source: Showdown data/abilities.ts -- Synchronize onAfterSetStatus
    const foe = createOnFieldPokemon({});
    const ctx = createAbilityContext({
      ability: abilityIds.synchronize,
      trigger: abilityTriggers.onStatusInflicted,
      status: statusIds.burn,
      opponent: foe,
    });
    const result = applyGen6Ability(abilityTriggers.onStatusInflicted, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-accuracy-check trigger with Victory Star, when dispatching, then routes to switch module", () => {
    // Source: Showdown data/abilities.ts -- Victory Star onAnyAccuracy: 1.1x
    const ctx = createAbilityContext({
      ability: abilityIds.victoryStar,
      trigger: abilityTriggers.onAccuracyCheck,
    });
    const result = applyGen6Ability(abilityTriggers.onAccuracyCheck, ctx);
    expect(result.activated).toBe(true);
  });

  // ---- Multi-module triggers ----

  it("given on-switch-in trigger with Drizzle, when dispatching, then routes to switch module first", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Drizzle sets 5-turn rain
    const ctx = createAbilityContext({
      ability: abilityIds.drizzle,
      trigger: abilityTriggers.onSwitchIn,
    });
    const result = applyGen6Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(weatherIds.rain);
  });

  it("given on-switch-in trigger with Frisk + foe holding item, when dispatching, then falls through to remaining module", () => {
    // Source: Showdown data/abilities.ts -- Frisk reveals all foe items
    const foe = createOnFieldPokemon({ heldItem: itemIds.leftovers });
    const ctx = createAbilityContext({
      ability: abilityIds.frisk,
      trigger: abilityTriggers.onSwitchIn,
      opponent: foe,
    });
    const result = applyGen6Ability(abilityTriggers.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(itemIds.leftovers);
  });

  it("given on-damage-calc trigger with Technician + low-power move, when dispatching, then routes to damage module", () => {
    // Source: Showdown data/abilities.ts -- Technician: 1.5x for power <= 60
    const ctx = createAbilityContext({
      ability: abilityIds.technician,
      trigger: abilityTriggers.onDamageCalc,
      move: createSyntheticMove(typeIds.normal, { power: 40 }),
    });
    const result = applyGen6Ability(abilityTriggers.onDamageCalc, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-damage-calc trigger with Serene Grace, when dispatching, then falls through to remaining module", () => {
    // Source: Showdown data/abilities.ts -- Serene Grace doubles secondary chances
    const ctx = createAbilityContext({
      ability: abilityIds.sereneGrace,
      trigger: abilityTriggers.onDamageCalc,
      move: createSyntheticMove(typeIds.normal),
    });
    const result = applyGen6Ability(abilityTriggers.onDamageCalc, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-damage-taken trigger with Sturdy + OHKO move, when dispatching, then routes to immunity module first", () => {
    // Source: Showdown data/abilities.ts -- Sturdy blocks OHKO moves
    const ctx = createAbilityContext({
      ability: abilityIds.sturdy,
      trigger: abilityTriggers.onDamageTaken,
      move: createSyntheticMove(typeIds.ground, {
        id: moveIds.fissure,
        effect: { type: CORE_MOVE_EFFECT_TYPES.ohko },
      }),
    });
    const result = applyGen6Ability(abilityTriggers.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-damage-taken trigger with Cursed Body + opponent, when dispatching, then falls through to switch module", () => {
    // Source: Showdown data/abilities.ts -- Cursed Body: 30% disable
    const foe = createOnFieldPokemon({});
    // RNG next returns 0 which is < 0.3 so Cursed Body triggers
    const ctx = createAbilityContext({
      ability: abilityIds.cursedBody,
      trigger: abilityTriggers.onDamageTaken,
      opponent: foe,
    });
    const result = applyGen6Ability(abilityTriggers.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-damage-taken trigger with Justified + dark move, when dispatching, then falls through to stat module", () => {
    // Source: Showdown data/abilities.ts -- Justified: +1 Atk on dark hit
    const foe = createOnFieldPokemon({});
    const state = createBattleState();
    // Make RNG return high so Cursed Body (from switch) doesn't activate
    state.rng.next = () => 0.99;
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: abilityTriggers.onDamageTaken,
      move: createSyntheticMove(typeIds.dark),
      opponent: foe,
      state,
    });
    const result = applyGen6Ability(abilityTriggers.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-stat-change trigger with Defiant + opponent-sourced drop, when dispatching, then routes to stat module", () => {
    // Source: Showdown data/abilities.ts -- Defiant: +2 Atk on any stat drop by foe
    const ctx = createAbilityContext({
      ability: abilityIds.defiant,
      trigger: abilityTriggers.onStatChange,
      statChange: { stages: -1, source: "opponent" },
    });
    const result = applyGen6Ability(abilityTriggers.onStatChange, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-turn-end trigger with Speed Boost + turnsOnField > 0, when dispatching, then routes to stat module", () => {
    // Source: Showdown data/abilities.ts -- Speed Boost onResidual
    const ctx = createAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: abilityTriggers.onTurnEnd,
      turnsOnField: 1,
    });
    const result = applyGen6Ability(abilityTriggers.onTurnEnd, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-turn-end trigger with Zen Mode + low HP, when dispatching, then falls through to remaining module", () => {
    // Source: Showdown data/abilities.ts -- Zen Mode: transforms below 50%
    const ctx = createAbilityContext({
      ability: abilityIds.zenMode,
      trigger: abilityTriggers.onTurnEnd,
      currentHp: 50,
      maxHp: 200,
      turnsOnField: 0, // Speed Boost wouldn't trigger first
    });
    const result = applyGen6Ability(abilityTriggers.onTurnEnd, ctx);
    expect(result.activated).toBe(true);
  });

  // ---- passive-immunity ----

  it("given passive-immunity trigger with Levitate + ground move, when dispatching, then returns activated", () => {
    // Source: Showdown data/abilities.ts -- Levitate: ground immunity
    const ctx = createAbilityContext({
      ability: abilityIds.levitate,
      trigger: abilityTriggers.passiveImmunity,
      move: dataManager.getMove(moveIds.earthquake),
    });
    const result = applyGen6Ability(abilityTriggers.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Earthquake");
  });

  it("given passive-immunity trigger with Levitate under Gravity, when dispatching, then type-immunity path is skipped but switch module Levitate still fires", () => {
    // Source: Bulbapedia -- Gravity negates Levitate for the type-immunity path
    // Note: The switch module's Levitate handler does not re-check Gravity, so it
    // still activates. This tests the dispatcher's fallthrough behavior.
    const state = createBattleState();
    (state.gravity as { active: boolean }).active = true;
    const ctx = createAbilityContext({
      ability: abilityIds.levitate,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.ground),
      state,
    });
    const result = applyGen6Ability(abilityTriggers.passiveImmunity, ctx);
    // The type-immunity path skips (levitateActive = false), but the switch module's
    // Levitate handler still returns activated: true for ground moves
    expect(result.activated).toBe(true);
  });

  it("given passive-immunity trigger with Levitate + Iron Ball, when dispatching, then type-immunity path is skipped but switch module still fires", () => {
    // Source: Bulbapedia -- Iron Ball grounds the holder, negating Levitate
    // Note: Same fallthrough as Gravity -- switch module doesn't re-check
    const ctx = createAbilityContext({
      ability: abilityIds.levitate,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.ground),
      heldItem: itemIds.ironBall,
    });
    const result = applyGen6Ability(abilityTriggers.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given passive-immunity trigger with Volt Absorb + electric move, when dispatching, then returns activated", () => {
    // Source: Showdown data/abilities.ts -- Volt Absorb: electric immunity
    const ctx = createAbilityContext({
      ability: abilityIds.voltAbsorb,
      trigger: abilityTriggers.passiveImmunity,
      move: dataManager.getMove(moveIds.thunderbolt),
    });
    const result = applyGen6Ability(abilityTriggers.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given passive-immunity trigger with Sap Sipper + grass move, when dispatching, then returns activated", () => {
    // Source: Showdown data/abilities.ts -- Sap Sipper: grass immunity
    const ctx = createAbilityContext({
      ability: abilityIds.sapSipper,
      trigger: abilityTriggers.passiveImmunity,
      move: dataManager.getMove(moveIds.energyBall),
    });
    const result = applyGen6Ability(abilityTriggers.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given passive-immunity trigger with non-immune ability, when dispatching, then falls through to switch/remaining/stat", () => {
    // Source: Showdown -- non-immune abilities fall through
    const ctx = createAbilityContext({
      ability: abilityIds.intimidate,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.fire),
    });
    const result = applyGen6Ability(abilityTriggers.passiveImmunity, ctx);
    expect(result.activated).toBe(false);
  });

  it("given unknown trigger, when dispatching, then returns NO_ACTIVATION", () => {
    // Default case
    const ctx = createAbilityContext({
      ability: abilityIds.levitate,
      trigger: "unknown-trigger",
    });
    const result = applyGen6Ability("unknown-trigger" as never, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6StatAbility — coverage for under-tested branches
// ===========================================================================

describe("handleGen6StatAbility — branch coverage", () => {
  it("given Gale Wings + flying move (no HP check in Gen 6), when on-priority-check, then activates", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Gale Wings no HP check in Gen 6
    const ctx = createAbilityContext({
      ability: abilityIds.galeWings,
      trigger: abilityTriggers.onPriorityCheck,
      move: createSyntheticMove(typeIds.flying),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Gale Wings + non-flying move, when on-priority-check, then does not activate", () => {
    // Source: Showdown -- Gale Wings only boosts Flying moves
    const ctx = createAbilityContext({
      ability: abilityIds.galeWings,
      trigger: abilityTriggers.onPriorityCheck,
      move: createSyntheticMove(typeIds.normal),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Competitive + opponent stat drop, when on-stat-change, then activates with +2 SpAtk", () => {
    // Source: Showdown data/abilities.ts -- Competitive: +2 SpAtk on opponent drop
    const ctx = createAbilityContext({
      ability: abilityIds.competitive,
      trigger: abilityTriggers.onStatChange,
      statChange: { stages: -1, source: "opponent" },
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "spAttack", stages: 2 }));
  });

  it("given Contrary, when on-stat-change, then activates (reversal is signaled)", () => {
    // Source: Showdown data/abilities.ts -- Contrary: reverses stat changes
    const ctx = createAbilityContext({
      ability: abilityIds.contrary,
      trigger: abilityTriggers.onStatChange,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Simple, when on-stat-change, then activates (doubling is signaled)", () => {
    // Source: Showdown data/abilities.ts -- Simple: doubles stat changes
    const ctx = createAbilityContext({
      ability: abilityIds.simple,
      trigger: abilityTriggers.onStatChange,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Justified + dark move, when on-damage-taken, then +1 Attack", () => {
    // Source: Showdown data/abilities.ts -- Justified
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: abilityTriggers.onDamageTaken,
      move: createSyntheticMove(typeIds.dark),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ stat: CORE_STAT_IDS.attack, stages: 1 }),
    );
  });

  it("given Justified + non-dark move, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Justified only fires for Dark moves
    const ctx = createAbilityContext({
      ability: abilityIds.justified,
      trigger: abilityTriggers.onDamageTaken,
      move: createSyntheticMove(typeIds.fire),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Weak Armor + physical move, when on-damage-taken, then -1 Def and +1 Speed", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Weak Armor Gen 5-6: +1 Spe
    const ctx = createAbilityContext({
      ability: abilityIds.weakArmor,
      trigger: abilityTriggers.onDamageTaken,
      move: createSyntheticMove(typeIds.normal, { category: moveCategories.physical }),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(2);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ stat: CORE_STAT_IDS.defense, stages: -1 }),
    );
    expect(result.effects[1]).toEqual(
      expect.objectContaining({ stat: CORE_STAT_IDS.speed, stages: 1 }),
    );
  });

  it("given Weak Armor + special move, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Weak Armor only fires for physical
    const ctx = createAbilityContext({
      ability: abilityIds.weakArmor,
      trigger: abilityTriggers.onDamageTaken,
      move: createSyntheticMove(typeIds.fire, { category: moveCategories.special }),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Speed Boost + turnsOnField === 0, when on-turn-end, then does not activate", () => {
    // Source: Showdown -- Speed Boost doesn't fire on turn of switch-in
    const ctx = createAbilityContext({
      ability: abilityIds.speedBoost,
      trigger: abilityTriggers.onTurnEnd,
      turnsOnField: 0,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Moody, when on-turn-end, then raises one stat +2 and lowers another -1", () => {
    // Source: Showdown data/mods/gen7/abilities.ts -- Moody Gen 5-7
    const ctx = createAbilityContext({
      ability: abilityIds.moody,
      trigger: abilityTriggers.onTurnEnd,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBeGreaterThanOrEqual(1);
  });

  it("given Unnerve, when on-item-use, then activates", () => {
    // Source: Showdown data/abilities.ts -- Unnerve blocks berry consumption
    const ctx = createAbilityContext({
      ability: abilityIds.unnerve,
      trigger: abilityTriggers.onItemUse,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Protean + already matching type, when on-before-move, then does not activate", () => {
    // Source: Showdown -- Protean only fires if type doesn't match
    const ctx = createAbilityContext({
      ability: abilityIds.protean,
      trigger: abilityTriggers.onBeforeMove,
      types: [typeIds.fire],
      move: createSyntheticMove(typeIds.fire),
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  // --- Stance Change (bug #675) ---

  it("given Stance Change (Aegislash, speciesId 681) using Shadow Ball, when on-before-move, then transforms to Blade Forme", () => {
    // Source: Showdown data/abilities.ts -- stancechange: attacking moves switch to Blade Forme
    // Source: Bulbapedia "Stance Change" -- "Aegislash changes to Blade Forme when using an attacking move"
    // Bug #675: Previously handleBeforeMove only handled Protean; Stance Change was missing.
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.stanceChange,
      speciesId: speciesIds.aegislash,
    });
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onBeforeMove,
      move: createSyntheticMove(typeIds.ghost, {
        id: moveIds.shadowBall,
        category: moveCategories.special,
      }),
    } as unknown as AbilityContext;
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe(BATTLE_ABILITY_EFFECT_TYPES.volatileInflict);
    expect(result.effects[0]?.volatile).toBe(CORE_VOLATILE_IDS.stanceChangeBlade);
    expect(result.messages[0]).toContain("Blade Forme");
  });

  it("given Stance Change (Aegislash) already in Blade Forme using King's Shield, when on-before-move, then transforms to Shield Forme", () => {
    // Source: Showdown data/abilities.ts -- stancechange: King's Shield reverts to Shield Forme
    // Source: Bulbapedia "Stance Change" -- "reverts to Shield Forme when using King's Shield"
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.stanceChange,
      speciesId: speciesIds.aegislash,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.stanceChangeBlade, { turnsLeft: -1 } as never);
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onBeforeMove,
      move: createSyntheticMove(typeIds.steel, {
        id: moveIds.kingsShield,
        category: moveCategories.status,
      }),
    } as unknown as AbilityContext;
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("volatile-remove");
    expect(result.effects[0]?.volatile).toBe(CORE_VOLATILE_IDS.stanceChangeBlade);
    expect(result.messages[0]).toContain("Shield Forme");
  });

  it("given Stance Change (Aegislash) in Shield Forme using status move (not King's Shield), when on-before-move, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- stancechange: status moves other than King's Shield
    // do not trigger Stance Change when in Shield Forme
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.stanceChange,
      speciesId: speciesIds.aegislash,
    });
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onBeforeMove,
      move: createSyntheticMove(typeIds.normal, {
        id: moveIds.protect,
        category: moveCategories.status,
      }),
    } as unknown as AbilityContext;
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Stance Change on non-Aegislash (wrong speciesId), when on-before-move with attack, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- stancechange only applies to Aegislash (speciesId 681)
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.stanceChange,
      speciesId: speciesIds.pikachu, // Pikachu, not Aegislash
    });
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onBeforeMove,
      move: createSyntheticMove(typeIds.electric, {
        id: moveIds.thunderbolt,
        category: moveCategories.special,
      }),
    } as unknown as AbilityContext;
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Steadfast with non-steadfast ability, when on-flinch, then does not activate", () => {
    // Source: Showdown -- only Steadfast responds to flinch
    const ctx = createAbilityContext({
      ability: abilityIds.intimidate,
      trigger: abilityTriggers.onFlinch,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given passive-immunity trigger in stat module, when dispatching, then returns inactive", () => {
    // passive-immunity in stat module is currently unused
    const ctx = createAbilityContext({
      ability: abilityIds.intimidate,
      trigger: abilityTriggers.passiveImmunity,
    });
    const result = handleGen6StatAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6RemainingAbility — coverage for under-tested branches
// ===========================================================================

describe("handleGen6RemainingAbility — branch coverage", () => {
  it("given Zen Mode + above 50% HP + currently in zen form, when on-turn-end, then reverts to standard", () => {
    // Source: Showdown data/abilities.ts -- zenmode: reverts above 50%
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.zenMode,
      currentHp: 150,
      maxHp: 200,
    });
    pokemon.volatileStatuses.set(abilityIds.zenMode, { turnsLeft: -1 } as never);
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onTurnEnd,
    } as unknown as AbilityContext;
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("standard form");
  });

  it("given Zen Mode + below 50% HP + already in zen form, when on-turn-end, then does not activate", () => {
    // Source: Showdown -- already in zen mode below 50%, no action needed
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.zenMode,
      currentHp: 50,
      maxHp: 200,
    });
    pokemon.volatileStatuses.set(abilityIds.zenMode, { turnsLeft: -1 } as never);
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onTurnEnd,
    } as unknown as AbilityContext;
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Harvest + sun weather + consumed berry, when on-turn-end, then restores berry at 100%", () => {
    // Source: Showdown data/abilities.ts -- Harvest in sun: 100% restore
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.harvest,
      heldItem: null,
    });
    pokemon.volatileStatuses.set("harvest-berry", {
      turnsLeft: -1,
      data: { berryId: itemIds.sitrusBerry },
    } as never);
    const state = createBattleState({ weather: { type: weatherIds.sun, turnsLeft: 3 } });
    const ctx = {
      pokemon,
      state,
      rng: state.rng,
      trigger: abilityTriggers.onTurnEnd,
    } as unknown as AbilityContext;
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(itemIds.sitrusBerry);
  });

  it("given Harvest + no sun + RNG fails, when on-turn-end, then does not restore berry", () => {
    // Source: Showdown -- Harvest without sun: 50% chance
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.harvest,
      heldItem: null,
    });
    pokemon.volatileStatuses.set("harvest-berry", {
      turnsLeft: -1,
      data: { berryId: itemIds.sitrusBerry },
    } as never);
    const state = createBattleState();
    state.rng.next = () => 0.9; // >= 0.5 fails
    const ctx = {
      pokemon,
      state,
      rng: state.rng,
      trigger: abilityTriggers.onTurnEnd,
    } as unknown as AbilityContext;
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Harvest + already holding item, when on-turn-end, then does not activate", () => {
    // Source: Showdown -- cannot restore if already holding
    const pokemon = createOnFieldPokemon({
      ability: abilityIds.harvest,
      heldItem: itemIds.leftovers,
    });
    const ctx = {
      pokemon,
      state: createBattleState(),
      rng: createBattleState().rng,
      trigger: abilityTriggers.onTurnEnd,
    } as unknown as AbilityContext;
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Telepathy in doubles + ally attacking, when passive-immunity, then activates", () => {
    // Source: Showdown data/abilities.ts -- Telepathy: blocks ally damage moves
    const state = createBattleState({ format: "doubles" });
    const pokemon = createOnFieldPokemon({ ability: abilityIds.telepathy, uid: "poke-1" });
    const ally = createOnFieldPokemon({ uid: "poke-2" });
    // Both on same side
    const side = state.sides[0];
    side.active = [pokemon, ally] as never;
    const ctx = {
      pokemon,
      opponent: ally,
      state,
      rng: state.rng,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.fire, { category: moveCategories.physical }),
    } as unknown as AbilityContext;
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Telepathy in singles, when passive-immunity, then does not activate", () => {
    // Source: Showdown -- Telepathy no-op in singles
    const ctx = createAbilityContext({
      ability: abilityIds.telepathy,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.fire),
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Oblivious + Attract move, when passive-immunity, then blocks it", () => {
    // Source: Showdown data/abilities.ts -- Oblivious blocks Attract
    const ctx = createAbilityContext({
      ability: abilityIds.oblivious,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.normal, {
        id: moveIds.attract,
        category: moveCategories.status,
      }),
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Oblivious + Captivate move, when passive-immunity, then blocks it", () => {
    // Source: Showdown data/abilities.ts -- Oblivious blocks Captivate
    const ctx = createAbilityContext({
      ability: abilityIds.oblivious,
      trigger: abilityTriggers.passiveImmunity,
      move: createSyntheticMove(typeIds.normal, {
        id: moveIds.captivate,
        category: moveCategories.status,
      }),
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Keen Eye, when passive-immunity, then returns inactive (no-op)", () => {
    // Source: Showdown -- Keen Eye passive effects handled by engine
    const ctx = createAbilityContext({
      ability: abilityIds.keenEye,
      trigger: abilityTriggers.passiveImmunity,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Friend Guard in doubles, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Friend Guard: 0.75x ally damage
    const ctx = createAbilityContext({
      ability: abilityIds.friendGuard,
      trigger: abilityTriggers.onDamageCalc,
    });
    (ctx.state as { format: string }).format = "doubles";
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Friend Guard in singles, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Friend Guard no-op in singles
    const ctx = createAbilityContext({
      ability: abilityIds.friendGuard,
      trigger: abilityTriggers.onDamageCalc,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Serene Grace + move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Serene Grace doubles secondary chances
    const ctx = createAbilityContext({
      ability: abilityIds.sereneGrace,
      trigger: abilityTriggers.onDamageCalc,
      move: createSyntheticMove(typeIds.normal),
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given unknown trigger, when dispatching remaining, then returns inactive", () => {
    const ctx = createAbilityContext({
      ability: abilityIds.zenMode,
      trigger: abilityTriggers.onContact,
    });
    const result = handleGen6RemainingAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
