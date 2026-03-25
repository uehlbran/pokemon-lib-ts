import type { AbilityContext, ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  SeededRandom,
  createEvs,
  createIvs,
  createPokemonInstance,
  type MoveData,
  type PokemonType,
  type PrimaryStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen9DataManager,
  GEN9_ABILITY_IDS,
  GEN9_ITEM_IDS,
  GEN9_MOVE_IDS,
  GEN9_NATURE_IDS,
  GEN9_SPECIES_IDS,
} from "../src";
import {
  canToxicChainApply,
  EMBODY_ASPECT_BOOSTS,
  getSupremeOverlordFloatMultiplier,
  getSupremeOverlordMultiplier,
  handleDauntlessShieldGen9,
  handleEmbodyAspect,
  handleGen9DauntlessShield,
  handleGen9DauntlessShieldTrigger,
  handleGen9IntrepidSword,
  handleGen9IntrepidSwordTrigger,
  handleGen9NewAbility,
  handleGen9Protean,
  handleGen9ProteanTrigger,
  handleGoodAsGold,
  handleIntrepidSwordGen9,
  handleMyceliumMight,
  handleProteanGen9,
  handleToxicChain,
  hasMyceliumMightPriorityReduction,
  isBlockedByGoodAsGold,
  isEmbodyAspect,
  isMyceliumMightBypassingAbility,
  SUPREME_OVERLORD_TABLE,
} from "../src/Gen9AbilitiesNew";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS };
const ITEMS = { ...CORE_ITEM_IDS, ...GEN9_ITEM_IDS };
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const TRIGGER_IDS = CORE_ABILITY_TRIGGER_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DATA_MANAGER = createGen9DataManager();
const BASE_SPECIES = DATA_MANAGER.getSpecies(GEN9_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE = DATA_MANAGER.getNature(CORE_NATURE_IDS.hardy ?? GEN9_NATURE_IDS.hardy).id;

/**
 * Gen 9 new and nerfed ability tests.
 *
 * Source: Showdown data/abilities.ts
 * Source: specs/battle/10-gen9.md -- New Abilities section
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

/**
 * Scenario helper: start from owned Gen 9 data and only override the
 * synthetic battle-state fields needed for the test case.
 */
function createSyntheticPokemonInstance(overrides: {
  speciesId?: (typeof GEN9_SPECIES_IDS)[keyof typeof GEN9_SPECIES_IDS];
  nickname?: string | null;
  ability?: (typeof ABILITIES)[keyof typeof ABILITIES];
  heldItem?: (typeof ITEMS)[keyof typeof ITEMS] | null;
  currentHp?: number;
  maxHp?: number;
  status?: PrimaryStatus | null;
}): ActivePokemon["pokemon"] {
  const maxHp = overrides.maxHp ?? 200;
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? BASE_SPECIES.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(7), {
    nature: DEFAULT_NATURE,
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
    pokeball: ITEMS.pokeBall,
  });

  pokemon.uid = createTestUid();
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? CORE_ABILITY_IDS.none;
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
  ability?: (typeof ABILITIES)[keyof typeof ABILITIES];
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: (typeof GEN9_SPECIES_IDS)[keyof typeof GEN9_SPECIES_IDS];
  status?: PrimaryStatus | null;
  heldItem?: (typeof ITEMS)[keyof typeof ITEMS] | null;
  substituteHp?: number;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  isTerastallized?: boolean;
}): ActivePokemon {
  const pokemon = createSyntheticPokemonInstance({
      ability: overrides.ability,
      nickname: overrides.nickname,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      status: overrides.status,
      heldItem: overrides.heldItem,
    });
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? BASE_SPECIES.id);
  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  activePokemon.volatileStatuses = overrides.volatiles ?? new Map();
  activePokemon.ability = overrides.ability ?? ABILITIES.none;
  activePokemon.substituteHp = overrides.substituteHp ?? 0;
  activePokemon.isTerastallized = overrides.isTerastallized ?? false;
  return activePokemon;
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

function createBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 9,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createTestRng(),
  } as BattleState;
}

/**
 * Scenario helper: clone a Gen 9 move record and override only the explicit
 * synthetic fields needed for the test.
 */
function createCanonicalMove(
  moveId: (typeof GEN9_MOVE_IDS)[keyof typeof GEN9_MOVE_IDS],
): MoveData {
  const move = DATA_MANAGER.getMove(moveId);
  return { ...move, flags: { ...move.flags } };
}

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    id: overrides.id ?? baseMove.id,
    displayName: overrides.displayName ?? baseMove.displayName,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    accuracy: overrides.accuracy ?? baseMove.accuracy,
    pp: overrides.pp ?? baseMove.pp,
    priority: overrides.priority ?? baseMove.priority,
    target: overrides.target ?? baseMove.target,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: "effect" in overrides ? overrides.effect : baseMove.effect,
    description: overrides.description ?? baseMove.description,
    generation: overrides.generation ?? baseMove.generation,
    critRatio: baseMove.critRatio,
  } as MoveData;
}

function createSyntheticMoveFromRepresentativeBase(
  overrides: Partial<MoveData> & { id?: (typeof GEN9_MOVE_IDS)[keyof typeof GEN9_MOVE_IDS] },
): MoveData {
  const baseMove = createCanonicalMove(overrides.id ?? GEN9_MOVE_IDS.tackle);
  return createSyntheticMoveFrom(baseMove, overrides);
}

function createAbilityContext(overrides: {
  pokemon: ActivePokemon;
  opponent?: ActivePokemon;
  trigger: AbilityContext["trigger"];
  move?: MoveData;
  rng?: Partial<SeededRandom>;
}): AbilityContext {
  return {
    pokemon: overrides.pokemon,
    opponent: overrides.opponent,
    state: createBattleState(),
    rng: createTestRng(overrides.rng),
    trigger: overrides.trigger,
    move: overrides.move,
  };
}

// ---------------------------------------------------------------------------
// Toxic Chain
// ---------------------------------------------------------------------------

describe("handleToxicChain", () => {
  it("given on-after-move-used with physical move and 30% roll succeeds, when handling, then badly poisons target", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    // "this.randomChance(3, 10)" -- 30% chance
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain, nickname: "Pecharunt" }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal], nickname: "Mew" }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: STATUSES.badlyPoisoned,
        },
      ],
      messages: ["Pecharunt's Toxic Chain badly poisoned the target!"],
    });
  });

  it("given on-after-move-used with special move and 30% roll succeeds, when handling, then badly poisons target", () => {
    // Source: Showdown data/abilities.ts:5001-5014 -- works on any damaging move
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain, nickname: "Pecharunt" }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal], nickname: "Mew" }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.special }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "status-inflict",
          target: "opponent",
          status: STATUSES.badlyPoisoned,
        },
      ],
      messages: ["Pecharunt's Toxic Chain badly poisoned the target!"],
    });
  });

  it("given status move, when handling, then does not activate (status moves excluded)", () => {
    // Source: Showdown data/abilities.ts:5001-5014 -- only triggers on damage-dealing moves
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal] }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given 30% roll fails, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal] }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => false },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given target already has a status, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal], status: STATUSES.paralysis }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given target is Poison-type, when handling, then does not activate (type immunity)", () => {
    // Source: Showdown data/abilities.ts:5001-5014 -- type immunity check
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.poison] }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given target is Steel-type, when handling, then does not activate (type immunity)", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.steel] }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no opponent, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal] }),
      trigger: TRIGGER_IDS.onSwitchIn,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleToxicChain(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("canToxicChainApply", () => {
  it("given physical move, no status, non-immune types, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts:5001-5014
    const move = createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical });
    expect(canToxicChainApply(move, null, [TYPES.normal])).toBe(true);
  });

  it("given status move, when checking, then returns false", () => {
    const move = createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status });
    expect(canToxicChainApply(move, null, [TYPES.normal])).toBe(false);
  });

  it("given target has burn, when checking, then returns false", () => {
    const move = createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical });
    expect(canToxicChainApply(move, STATUSES.burn, [TYPES.normal])).toBe(false);
  });

  it("given target is Poison type, when checking, then returns false", () => {
    const move = createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical });
    expect(canToxicChainApply(move, null, [TYPES.poison, TYPES.flying])).toBe(false);
  });

  it("given target is Steel type, when checking, then returns false", () => {
    const move = createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical });
    expect(canToxicChainApply(move, null, [TYPES.steel])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Good as Gold
// ---------------------------------------------------------------------------

describe("handleGoodAsGold", () => {
  it("given on-before-move with Status-category move, when handling, then blocks the move", () => {
    // Source: Showdown data/abilities.ts:1573-1584
    // "if (move.category === 'Status' && target !== source) return null"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.goodAsGold, nickname: "Gholdengo" }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status, id: GEN9_MOVE_IDS.toxic }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [],
      messages: ["Gholdengo's Good as Gold made the move fail!"],
      movePrevented: true,
    });
  });

  it("given on-before-move with Physical-category move, when handling, then does not block", () => {
    // Source: Showdown data/abilities.ts:1573-1584 -- only blocks Status
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.goodAsGold }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });

  it("given on-before-move with Special-category move, when handling, then does not block", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.goodAsGold }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.special }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger (on-switch-in), when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.goodAsGold }),
      trigger: TRIGGER_IDS.onSwitchIn,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status }),
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no move in context, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.goodAsGold }),
      trigger: TRIGGER_IDS.onBeforeMove,
    });
    const result = handleGoodAsGold(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("isBlockedByGoodAsGold", () => {
  it("given good-as-gold and status category, when checking, then returns true", () => {
    expect(isBlockedByGoodAsGold(ABILITIES.goodAsGold, MOVE_CATEGORIES.status)).toBe(true);
  });

  it("given good-as-gold and physical category, when checking, then returns false", () => {
    expect(isBlockedByGoodAsGold(ABILITIES.goodAsGold, MOVE_CATEGORIES.physical)).toBe(false);
  });

  it("given different ability and status category, when checking, then returns false", () => {
    expect(isBlockedByGoodAsGold(ABILITIES.intimidate, MOVE_CATEGORIES.status)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Embody Aspect
// ---------------------------------------------------------------------------

describe("handleEmbodyAspect", () => {
  it("given Teal Embody Aspect on Tera'd switch-in, when handling, then boosts Speed", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspectteal: spe +1
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectTeal,
        nickname: "Ogerpon",
        isTerastallized: true,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.embodyAspectUsed,
        },
        {
          effectType: "stat-change",
          target: "self",
          stat: "speed",
          stages: 1,
        },
      ],
      messages: ["Ogerpon's Embody Aspect boosted its Speed!"],
    });
  });

  it("given Hearthflame Embody Aspect on Tera'd switch-in, when handling, then boosts Attack", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspecthearthflame: atk +1
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectHearthflame,
        nickname: "Ogerpon",
        isTerastallized: true,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.embodyAspectUsed,
        },
        {
          effectType: "stat-change",
          target: "self",
          stat: "attack",
          stages: 1,
        },
      ],
      messages: ["Ogerpon's Embody Aspect boosted its Attack!"],
    });
  });

  it("given Wellspring Embody Aspect on Tera'd switch-in, when handling, then boosts SpDefense", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspectwellspring: spd +1
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectWellspring,
        nickname: "Ogerpon",
        isTerastallized: true,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.embodyAspectUsed,
        },
        {
          effectType: "stat-change",
          target: "self",
          stat: "spDefense",
          stages: 1,
        },
      ],
      messages: ["Ogerpon's Embody Aspect boosted its Sp. Def!"],
    });
  });

  it("given Cornerstone Embody Aspect on Tera'd switch-in, when handling, then boosts Defense", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // embodyaspectcornerstone: def +1
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectCornerstone,
        nickname: "Ogerpon",
        isTerastallized: true,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.embodyAspectUsed,
        },
        {
          effectType: "stat-change",
          target: "self",
          stat: "defense",
          stages: 1,
        },
      ],
      messages: ["Ogerpon's Embody Aspect boosted its Defense!"],
    });
  });

  it("given not Terastallized, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    // "if (!pokemon.terastallized) return"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectTeal,
        isTerastallized: false,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(false);
  });

  it("given already used (volatile set), when handling, then does not activate again (once per battle)", () => {
    // Source: Showdown data/abilities.ts:1162-1212 -- once per battle check
    const volatiles = new Map([[VOLATILES.embodyAspectUsed, { turnsLeft: -1 }]]);
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectTeal,
        isTerastallized: true,
        volatiles: volatiles as any,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger (on-contact), when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.embodyAspectTeal,
        isTerastallized: true,
      }),
      trigger: TRIGGER_IDS.onContact,
    });
    const result = handleEmbodyAspect(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("isEmbodyAspect", () => {
  it("given embody-aspect-teal, when checking, then returns true", () => {
    expect(isEmbodyAspect(ABILITIES.embodyAspectTeal)).toBe(true);
  });

  it("given embody-aspect-hearthflame, when checking, then returns true", () => {
    expect(isEmbodyAspect(ABILITIES.embodyAspectHearthflame)).toBe(true);
  });

  it("given embody-aspect-wellspring, when checking, then returns true", () => {
    expect(isEmbodyAspect(ABILITIES.embodyAspectWellspring)).toBe(true);
  });

  it("given embody-aspect-cornerstone, when checking, then returns true", () => {
    expect(isEmbodyAspect(ABILITIES.embodyAspectCornerstone)).toBe(true);
  });

  it("given unrelated ability, when checking, then returns false", () => {
    expect(isEmbodyAspect(ABILITIES.intimidate)).toBe(false);
  });
});

describe("EMBODY_ASPECT_BOOSTS", () => {
  it("given Embody Aspect Teal, when looking up its stat boost, then it maps to Speed", () => {
    // Source: Showdown data/abilities.ts:1162-1212
    expect(EMBODY_ASPECT_BOOSTS[ABILITIES.embodyAspectTeal]).toBe("speed");
  });
  it("given Embody Aspect Hearthflame, when looking up its stat boost, then it maps to Attack", () => {
    expect(EMBODY_ASPECT_BOOSTS[ABILITIES.embodyAspectHearthflame]).toBe("attack");
  });
  it("given Embody Aspect Wellspring, when looking up its stat boost, then it maps to Sp. Def", () => {
    expect(EMBODY_ASPECT_BOOSTS[ABILITIES.embodyAspectWellspring]).toBe("spDefense");
  });
  it("given Embody Aspect Cornerstone, when looking up its stat boost, then it maps to Defense", () => {
    expect(EMBODY_ASPECT_BOOSTS[ABILITIES.embodyAspectCornerstone]).toBe("defense");
  });
});

// ---------------------------------------------------------------------------
// Mycelium Might
// ---------------------------------------------------------------------------

describe("handleMyceliumMight", () => {
  it("given on-priority-check with status move, when handling, then activates", () => {
    // Source: Showdown data/abilities.ts:2722-2738
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.myceliumMight }),
      trigger: TRIGGER_IDS.onPriorityCheck,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status }),
    });
    const result = handleMyceliumMight(ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-priority-check with physical move, when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts:2722-2738 -- only for status moves
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.myceliumMight }),
      trigger: TRIGGER_IDS.onPriorityCheck,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
    });
    const result = handleMyceliumMight(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger (on-switch-in), when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.myceliumMight }),
      trigger: TRIGGER_IDS.onSwitchIn,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status }),
    });
    const result = handleMyceliumMight(ctx);
    expect(result.activated).toBe(false);
  });
});

describe("hasMyceliumMightPriorityReduction", () => {
  it("given mycelium-might and status move, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts:2722-2728
    expect(hasMyceliumMightPriorityReduction(ABILITIES.myceliumMight, MOVE_CATEGORIES.status)).toBe(true);
  });

  it("given mycelium-might and physical move, when checking, then returns false", () => {
    expect(hasMyceliumMightPriorityReduction(ABILITIES.myceliumMight, MOVE_CATEGORIES.physical)).toBe(false);
  });

  it("given different ability and status move, when checking, then returns false", () => {
    expect(hasMyceliumMightPriorityReduction(ABILITIES.intimidate, MOVE_CATEGORIES.status)).toBe(false);
  });
});

describe("isMyceliumMightBypassingAbility", () => {
  it("given mycelium-might and status move, when checking, then returns true", () => {
    // Source: Showdown data/abilities.ts:2730-2738
    expect(isMyceliumMightBypassingAbility(ABILITIES.myceliumMight, MOVE_CATEGORIES.status)).toBe(true);
  });

  it("given mycelium-might and special move, when checking, then returns false", () => {
    expect(isMyceliumMightBypassingAbility(ABILITIES.myceliumMight, MOVE_CATEGORIES.special)).toBe(false);
  });

  it("given other ability and status move, when checking, then returns false", () => {
    expect(isMyceliumMightBypassingAbility(ABILITIES.protean, MOVE_CATEGORIES.status)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Supreme Overlord
// ---------------------------------------------------------------------------

describe("getSupremeOverlordFloatMultiplier", () => {
  it("given 0 fainted allies, when getting multiplier, then returns 1.0x", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    // "const dominated = [4096, 4506, 4915, 5325, 5734, 6144]"
    expect(getSupremeOverlordFloatMultiplier(0)).toBe(4096 / 4096);
  });

  it("given 1 fainted ally, when getting multiplier, then returns ~1.10x (4506/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(1)).toBeCloseTo(4506 / 4096, 10);
  });

  it("given 2 fainted allies, when getting multiplier, then returns ~1.20x (4915/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(2)).toBeCloseTo(4915 / 4096, 10);
  });

  it("given 3 fainted allies, when getting multiplier, then returns ~1.30x (5325/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(3)).toBeCloseTo(5325 / 4096, 10);
  });

  it("given 4 fainted allies, when getting multiplier, then returns ~1.40x (5734/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(4)).toBeCloseTo(5734 / 4096, 10);
  });

  it("given 5 fainted allies, when getting multiplier, then returns 1.50x (6144/4096)", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(getSupremeOverlordFloatMultiplier(5)).toBeCloseTo(6144 / 4096, 10);
  });

  it("given 6 fainted allies (exceeds max), when getting multiplier, then caps at 5 and returns 1.50x", () => {
    // Source: Showdown data/abilities.ts:4634-4658 -- capped at 5
    expect(getSupremeOverlordFloatMultiplier(6)).toBeCloseTo(6144 / 4096, 10);
  });

  it("given negative fainted allies, when getting multiplier, then clamps to 0 and returns 1.0x", () => {
    expect(getSupremeOverlordFloatMultiplier(-1)).toBe(1);
  });

  it("given the compatibility alias, when comparing it to the float helper, then it stays wired to the same implementation", () => {
    expect(getSupremeOverlordMultiplier).toBe(getSupremeOverlordFloatMultiplier);
  });
});

describe("SUPREME_OVERLORD_TABLE", () => {
  it("given the Supreme Overlord table, when checking values, then it matches the 4096-based source table", () => {
    // Source: Showdown data/abilities.ts:4634-4658
    expect(SUPREME_OVERLORD_TABLE).toEqual([
      1,
      4506 / 4096,
      4915 / 4096,
      5325 / 4096,
      5734 / 4096,
      6144 / 4096,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Intrepid Sword (Gen 9 nerf -- once per battle)
// ---------------------------------------------------------------------------

describe("handleGen9IntrepidSwordTrigger", () => {
  it("given on-switch-in with no prior usage, when handling, then boosts Attack and sets volatile", () => {
    // Source: Showdown data/abilities.ts -- intrepidsword: once per battle in Gen 9
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.intrepidSword, nickname: "Zacian" }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleGen9IntrepidSwordTrigger(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.intrepidSwordUsed,
        },
        {
          effectType: "stat-change",
          target: "self",
          stat: "attack",
          stages: 1,
        },
      ],
      messages: ["Zacian's Intrepid Sword raised its Attack!"],
    });
    expect(ctx.pokemon.pokemon.swordBoost).toBe(true);
  });

  it("given already used this battle, when handling, then does not activate", () => {
    // Source: specs/battle/10-gen9.md -- "Intrepid Sword: once per battle (nerfed from Gen 8)"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.intrepidSword,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    ctx.pokemon.pokemon.swordBoost = true;
    const result = handleGen9IntrepidSwordTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.intrepidSword }),
      trigger: TRIGGER_IDS.onContact,
    });
    const result = handleGen9IntrepidSwordTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("given the legacy Intrepid Sword aliases, when comparing exports, then they stay wired to the trigger handler", () => {
    expect(handleGen9IntrepidSword).toBe(handleGen9IntrepidSwordTrigger);
    expect(handleIntrepidSwordGen9).toBe(handleGen9IntrepidSwordTrigger);
  });

  it("given Intrepid Sword already used this battle, when switch-out clears volatiles, then the persistent once-per-battle flag still blocks it", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.intrepidSword }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });

    handleGen9IntrepidSwordTrigger(ctx);
    ctx.pokemon.volatileStatuses.clear();

    const secondResult = handleGen9IntrepidSwordTrigger(ctx);
    expect(secondResult.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dauntless Shield (Gen 9 nerf -- once per battle)
// ---------------------------------------------------------------------------

describe("handleGen9DauntlessShieldTrigger", () => {
  it("given on-switch-in with no prior usage, when handling, then boosts Defense and sets volatile", () => {
    // Source: Showdown data/abilities.ts -- dauntlessshield: once per battle in Gen 9
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.dauntlessShield, nickname: "Zamazenta" }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleGen9DauntlessShieldTrigger(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.dauntlessShieldUsed,
        },
        {
          effectType: "stat-change",
          target: "self",
          stat: "defense",
          stages: 1,
        },
      ],
      messages: ["Zamazenta's Dauntless Shield raised its Defense!"],
    });
    expect(ctx.pokemon.pokemon.shieldBoost).toBe(true);
  });

  it("given already used this battle, when handling, then does not activate", () => {
    // Source: specs/battle/10-gen9.md -- "Dauntless Shield: once per battle (nerfed from Gen 8)"
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.dauntlessShield,
      }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    ctx.pokemon.pokemon.shieldBoost = true;
    const result = handleGen9DauntlessShieldTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.dauntlessShield }),
      trigger: TRIGGER_IDS.onTurnEnd,
    });
    const result = handleGen9DauntlessShieldTrigger(ctx);
    expect(result.activated).toBe(false);
  });

  it("given the legacy Dauntless Shield aliases, when comparing exports, then they stay wired to the trigger handler", () => {
    expect(handleGen9DauntlessShield).toBe(handleGen9DauntlessShieldTrigger);
    expect(handleDauntlessShieldGen9).toBe(handleGen9DauntlessShieldTrigger);
  });

  it("given Dauntless Shield already used this battle, when switch-out clears volatiles, then the persistent once-per-battle flag still blocks it", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.dauntlessShield }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });

    handleGen9DauntlessShieldTrigger(ctx);
    ctx.pokemon.volatileStatuses.clear();

    const secondResult = handleGen9DauntlessShieldTrigger(ctx);
    expect(secondResult.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Protean / Libero (Gen 9 nerf -- once per switch-in)
// ---------------------------------------------------------------------------

describe("handleProteanGen9", () => {
  it("given on-before-move with no prior usage, when handling, then changes type and sets volatile", () => {
    // Source: Showdown data/abilities.ts -- protean/libero: once per switchin in Gen 9
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protean, types: [TYPES.normal], nickname: "Greninja" }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleProteanGen9(ctx);
    expect(result).toEqual({
      activated: true,
      effects: [
        {
          effectType: "volatile-inflict",
          target: "self",
          volatile: VOLATILES.proteanUsed,
        },
        {
          effectType: "type-change",
          target: "self",
          types: [TYPES.fire],
        },
      ],
      messages: ["Greninja's Protean changed its type to fire!"],
    });
  });

  it("given Libero ability, when handling, then also works and message says Libero", () => {
    // Source: Showdown data/abilities.ts -- libero: same as protean
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.libero, types: [TYPES.grass], nickname: "Cinderace" }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toBe("Cinderace's Libero changed its type to fire!");
  });

  it("given already used (volatile set), when handling, then does not activate (once per switch-in)", () => {
    // Source: specs/battle/10-gen9.md -- "Protean/Libero: once per switchin"
    const volatiles = new Map([[VOLATILES.proteanUsed, { turnsLeft: -1 }]]);
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({
        ability: ABILITIES.protean,
        types: [TYPES.normal],
        volatiles: volatiles as any,
      }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given already the move's type (single type matches), when handling, then does not activate", () => {
    // Source: Showdown data/abilities.ts -- doesn't activate if already the type
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protean, types: [TYPES.fire] }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given dual type where one matches move type, when handling, then activates (changes to mono-type)", () => {
    // Dual-type means types.length !== 1, so the single-type check doesn't block
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protean, types: [TYPES.fire, TYPES.flying] }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      {
        effectType: "volatile-inflict",
        target: "self",
        volatile: VOLATILES.proteanUsed,
      },
      {
        effectType: "type-change",
        target: "self",
        types: [TYPES.fire],
      },
    ]);
  });

  it("given wrong trigger, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protean }),
      trigger: TRIGGER_IDS.onSwitchIn,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given no move in context, when handling, then does not activate", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protean }),
      trigger: TRIGGER_IDS.onBeforeMove,
    });
    const result = handleProteanGen9(ctx);
    expect(result.activated).toBe(false);
  });

  it("given the legacy Protean aliases, when comparing exports, then they stay wired to the trigger handler", () => {
    expect(handleGen9Protean).toBe(handleGen9ProteanTrigger);
    expect(handleProteanGen9).toBe(handleGen9ProteanTrigger);
  });
});

// ---------------------------------------------------------------------------
// handleGen9NewAbility dispatch
// ---------------------------------------------------------------------------

describe("handleGen9NewAbility", () => {
  it("given toxic-chain ability, when dispatching, then routes to handleToxicChain", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.toxicChain }),
      opponent: createOnFieldPokemon({ types: [TYPES.normal] }),
      trigger: TRIGGER_IDS.onAfterMoveUsed,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.physical }),
      rng: { chance: () => true },
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given good-as-gold ability with status move, when dispatching, then routes to handleGoodAsGold", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.goodAsGold }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ category: MOVE_CATEGORIES.status }),
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given intrepid-sword ability, when dispatching, then routes to handleIntrepidSwordGen9", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.intrepidSword }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given dauntless-shield ability, when dispatching, then routes to handleDauntlessShieldGen9", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.dauntlessShield }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given protean ability, when dispatching, then routes to handleProteanGen9", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.protean, types: [TYPES.normal] }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.water }),
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given libero ability, when dispatching, then routes to handleProteanGen9", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.libero, types: [TYPES.grass] }),
      trigger: TRIGGER_IDS.onBeforeMove,
      move: createSyntheticMoveFromRepresentativeBase({ type: TYPES.fire }),
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given unrelated ability, when dispatching, then returns inactive", () => {
    const ctx = createAbilityContext({
      pokemon: createOnFieldPokemon({ ability: ABILITIES.levitate }),
      trigger: TRIGGER_IDS.onSwitchIn,
    });
    const result = handleGen9NewAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
