import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_SPECIES_IDS,
} from "@pokemon-lib-ts/gen5";
import { describe, expect, it } from "vitest";
import { applyGen5HeldItem, getPinchBerryThreshold } from "../src/Gen5Items";
import { Gen5Ruleset } from "../src/Gen5Ruleset";

const gen5DataManager = createGen5DataManager();
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS } as const;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN5_ITEM_IDS } as const;
const SPECIES_IDS = GEN5_SPECIES_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const TRIGGER_IDS = CORE_ABILITY_TRIGGER_IDS;
const ITEM_TRIGGER_IDS = CORE_ITEM_TRIGGER_IDS;

// ---------------------------------------------------------------------------
// Helper factories (mirrors damage-calc.test.ts pattern)
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  speciesId?: number;
  nickname?: string | null;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? SPECIES_IDS.charizard,
      nickname: overrides.nickname ?? null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: CORE_NATURE_IDS.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
      friendship: createFriendship(0),
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEM_IDS.pokeBall,
      calculatedStats: {
        hp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
    },
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
    types: overrides.types ?? [TYPE_IDS.normal],
    ability: overrides.ability ?? ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
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
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createCanonicalMove(moveId: string): MoveData {
  return gen5DataManager.getMove(moveId);
}

function createSyntheticMoveFrom(overrides?: {
  id?: string;
  type?: PokemonType;
  category?: MoveData["category"];
  power?: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
}): MoveData {
  const moveId = overrides?.id ?? MOVE_IDS.tackle;
  const baseMove = createCanonicalMove(moveId);
  return {
    ...baseMove,
    id: moveId,
    type: overrides?.type ?? baseMove.type,
    category: overrides?.category ?? baseMove.category,
    power: overrides?.power ?? baseMove.power,
    flags: { ...baseMove.flags, ...overrides?.flags },
    effect: overrides?.effect ?? baseMove.effect,
  } as MoveData;
}

function createBattleState(overrides?: { sides?: [any, any] }): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 5,
    turnNumber: 1,
    sides: overrides?.sides ?? [{}, {}],
  } as unknown as BattleState;
}

function createItemContext(overrides: {
  pokemon?: ActivePokemon;
  state?: BattleState;
  move?: MoveData;
  damage?: number;
  seed?: number;
}): ItemContext {
  return {
    pokemon: overrides.pokemon ?? createOnFieldPokemon({}),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    move: overrides.move,
    damage: overrides.damage,
  };
}

// ---------------------------------------------------------------------------
// Suppression: Klutz and Embargo
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Klutz and Embargo suppression", () => {
  it("given a Pokemon with Klutz holding Leftovers, when end-of-turn triggers, then the item does not activate", () => {
    // Source: Showdown data/abilities.ts -- Klutz: suppresses all held item effects for the holder
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.leftovers,
      ability: ABILITY_IDS.klutz,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon under Embargo holding Leftovers, when end-of-turn triggers, then the item does not activate", () => {
    // Source: Showdown data/moves.ts -- embargo condition: suppresses held item effects for 5 turns
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(VOLATILE_IDS.embargo, { turnsLeft: 3 });
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.leftovers,
      hp: 200,
      currentHp: 100,
      volatiles,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with no held item, when any trigger fires, then the item does not activate", () => {
    // Source: Showdown sim/battle.ts -- item handlers are gated on pokemon.item !== ''; null/empty item means no handler fires
    const pokemon = createOnFieldPokemon({ heldItem: null });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leftovers
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Leftovers", () => {
  it("given a Pokemon with 200 max HP holding Leftovers, when end-of-turn triggers, then it heals 12 HP (floor(200/16))", () => {
    // Source: Showdown data/items.ts -- Leftovers: heal 1/16 max HP
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers, hp: 200, currentHp: 100 });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 12 }]);
  });

  it("given a Pokemon with 15 max HP holding Leftovers, when end-of-turn triggers, then it heals 1 HP (minimum 1)", () => {
    // Source: floor(15/16) = 0, clamped to 1
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers, hp: 15, currentHp: 10 });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Black Sludge
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Black Sludge", () => {
  it("given a Poison-type with 320 max HP holding Black Sludge, when end-of-turn triggers, then it heals 20 HP (floor(320/16))", () => {
    // Source: Showdown data/items.ts -- Black Sludge heals Poison-types 1/16
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.blackSludge,
      types: [STATUS_IDS.poison],
      hp: 320,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 20 }]);
  });

  it("given a non-Poison-type with 160 max HP holding Black Sludge, when end-of-turn triggers, then it takes 20 HP damage (floor(160/8))", () => {
    // Source: Showdown data/items.ts -- Black Sludge damages non-Poison types 1/8
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.blackSludge,
      types: ["fire"],
      hp: 160,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });
});

// ---------------------------------------------------------------------------
// Toxic Orb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Toxic Orb", () => {
  it("given a Pokemon with no status holding Toxic Orb, when end-of-turn triggers, then it gets badly poisoned", () => {
    // Source: Showdown data/items.ts -- Toxic Orb onResidual
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.toxicOrb,
      types: ["normal"],
      status: null,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "inflict-status", target: "self", status: STATUS_IDS.badlyPoisoned },
    ]);
  });

  it("given a Pokemon already burned holding Toxic Orb, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Toxic Orb: only activates if target has no status condition
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.toxicOrb,
      types: ["normal"],
      status: STATUS_IDS.burn,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Poison-type holding Toxic Orb, when end-of-turn triggers, then it does not activate (type immune)", () => {
    // Source: Showdown -- type immunity prevents Orb activation
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.toxicOrb,
      types: [STATUS_IDS.poison],
      status: null,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Steel-type holding Toxic Orb, when end-of-turn triggers, then it does not activate (type immune)", () => {
    // Source: Showdown -- Steel-types are immune to Poison status; Orb cannot inflict it
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.toxicOrb,
      types: ["steel"],
      status: null,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Flame Orb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Flame Orb", () => {
  it("given a Pokemon with no status holding Flame Orb, when end-of-turn triggers, then it gets burned", () => {
    // Source: Showdown data/items.ts -- Flame Orb onResidual
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.flameOrb,
      types: ["normal"],
      status: null,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "inflict-status", target: "self", status: STATUS_IDS.burn },
    ]);
  });

  it("given a Fire-type holding Flame Orb, when end-of-turn triggers, then it does not activate (type immune)", () => {
    // Source: Showdown -- Fire-types are immune to Burn status; Orb cannot inflict it
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.flameOrb,
      types: ["fire"],
      status: null,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sitrus Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Sitrus Berry", () => {
  it("given a Pokemon with 200 max HP at 50% HP holding Sitrus Berry, when end-of-turn triggers, then it heals 50 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry heals 1/4 max HP
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.sitrusBerry,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 50 },
      { type: "consume", target: "self", value: ITEM_IDS.sitrusBerry },
    ]);
  });

  it("given a Pokemon at 51% HP holding Sitrus Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry: activates at <= 50% HP
    // 102 > floor(200 / 2) = 100, so threshold is not met
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.sitrusBerry,
      hp: 200,
      currentHp: 102,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon at 50% HP after taking damage holding Sitrus Berry, when on-damage-taken triggers, then it heals and is consumed", () => {
    // Source: Showdown -- Sitrus Berry also triggers on-damage-taken
    // Note: currentHp is already post-damage (engine subtracts HP before on-damage-taken fires)
    // 100 <= floor(200/2) = 100, so threshold is met
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.sitrusBerry,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon, damage: 100 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 50 },
      { type: "consume", target: "self", value: ITEM_IDS.sitrusBerry },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Lum Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Lum Berry", () => {
  it("given a paralyzed Pokemon holding Lum Berry, when end-of-turn triggers, then it cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Lum Berry onUpdate
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.lumBerry,
      status: STATUS_IDS.paralysis,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: ITEM_IDS.lumBerry },
    ]);
  });

  it("given a confused Pokemon holding Lum Berry, when end-of-turn triggers, then it cures confusion and is consumed", () => {
    // Source: Showdown data/items.ts -- Lum Berry onUpdate: also cures confusion (volatile status)
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(VOLATILE_IDS.confusion, { turnsLeft: 3 });
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.lumBerry,
      volatiles,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "volatile-cure", target: "self", value: VOLATILE_IDS.confusion },
      { type: "consume", target: "self", value: ITEM_IDS.lumBerry },
    ]);
  });

  it("given a healthy Pokemon holding Lum Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Lum Berry onUpdate: only triggers if status or confusion present
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lumBerry });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Status-cure berries (Cheri, Chesto, Pecha, Rawst, Aspear)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Status-cure berries", () => {
  it("given a paralyzed Pokemon holding Cheri Berry, when end-of-turn triggers, then it cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Cheri Berry onUpdate: cures 'par' status
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.cheriBerry,
      status: STATUS_IDS.paralysis,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a sleeping Pokemon holding Chesto Berry, when end-of-turn triggers, then it cures sleep and is consumed", () => {
    // Source: Showdown data/items.ts -- Chesto Berry onUpdate: cures 'slp' status
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.chestoBerry,
      status: STATUS_IDS.sleep,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a poisoned Pokemon holding Pecha Berry, when end-of-turn triggers, then it cures poison and is consumed", () => {
    // Source: Showdown data/items.ts -- Pecha Berry onUpdate: cures 'psn' and 'tox' status
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pechaBerry,
      status: STATUS_IDS.poison,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a badly-poisoned Pokemon holding Pecha Berry, when end-of-turn triggers, then it cures badly-poisoned", () => {
    // Source: Showdown data/items.ts -- Pecha Berry cures both 'psn' and 'tox' (badly-poisoned)
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pechaBerry,
      status: STATUS_IDS.badlyPoisoned,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a burned Pokemon holding Rawst Berry, when end-of-turn triggers, then it cures burn and is consumed", () => {
    // Source: Showdown data/items.ts -- Rawst Berry onUpdate: cures 'brn' status
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.rawstBerry,
      status: STATUS_IDS.burn,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a frozen Pokemon holding Aspear Berry, when end-of-turn triggers, then it cures freeze and is consumed", () => {
    // Source: Showdown data/items.ts -- Aspear Berry onUpdate: cures 'frz' status
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.aspearBerry,
      status: STATUS_IDS.freeze,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "status-cure",
      target: "self",
    });
  });

  it("given a healthy Pokemon holding Cheri Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- single-status berries only fire if the matched condition is present
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.cheriBerry });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persim Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Persim Berry", () => {
  it("given a confused Pokemon holding Persim Berry, when end-of-turn triggers, then it cures confusion and is consumed", () => {
    // Source: Showdown data/items.ts -- Persim Berry onUpdate: removes 'confusion' volatile status
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(VOLATILE_IDS.confusion, { turnsLeft: 3 });
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.persimBerry, volatiles });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "volatile-cure", target: "self", value: VOLATILE_IDS.confusion },
      { type: "consume", target: "self", value: ITEM_IDS.persimBerry },
    ]);
  });

  it("given a non-confused Pokemon holding Persim Berry, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Persim Berry only fires if confusion volatile is present
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.persimBerry });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mental Herb (Gen 5 expanded)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Mental Herb (expanded)", () => {
  it("given a Pokemon with infatuation holding Mental Herb, when end-of-turn triggers, then it cures infatuation and is consumed", () => {
    // Source: Showdown data/items.ts -- Mental Herb onUpdate
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(CORE_VOLATILE_IDS.infatuation, { turnsLeft: -1 });
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.mentalHerb, volatiles });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: "volatile-cure", value: CORE_VOLATILE_IDS.infatuation }),
    );
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "consume" }));
  });

  it("given a taunted Pokemon holding Mental Herb, when end-of-turn triggers, then it cures taunt (Gen 5 expansion)", () => {
    // CHANGED from Gen 4: Mental Herb now cures Taunt, Encore, Disable, Torment, Heal Block
    // Source: Showdown data/items.ts -- Mental Herb checks attract, taunt, encore, torment, disable, healblock
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(VOLATILE_IDS.taunt, { turnsLeft: 3 });
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.mentalHerb, volatiles });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: "volatile-cure", value: VOLATILE_IDS.taunt }),
    );
  });

  it("given a Pokemon with Encore and Disable holding Mental Herb, when end-of-turn triggers, then it cures both volatiles", () => {
    // Source: Showdown data/items.ts -- Mental Herb Gen 5 expansion: checks attract, taunt, encore, torment, disable, healblock; cures all present
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(MOVE_IDS.encore, { turnsLeft: 3 });
    volatiles.set(MOVE_IDS.disable, { turnsLeft: 4 });
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.mentalHerb, volatiles });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: "volatile-cure", value: MOVE_IDS.encore }),
    );
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: "volatile-cure", value: MOVE_IDS.disable }),
    );
  });

  it("given a healthy Pokemon holding Mental Herb, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Mental Herb only fires when one of the six volatiles is present
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.mentalHerb });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sticky Barb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Sticky Barb", () => {
  it("given a Pokemon with 200 max HP holding Sticky Barb, when end-of-turn triggers, then it takes 25 HP damage (floor(200/8))", () => {
    // Source: Showdown data/items.ts -- Sticky Barb onResidual: 1/8 max HP
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.stickyBarb,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 25 }]);
  });

  it("given a Pokemon with 7 max HP holding Sticky Barb, when end-of-turn triggers, then it takes 1 HP damage (minimum 1)", () => {
    // Source: Showdown data/items.ts -- Sticky Barb: floor(maxHP / 8), minimum 1
    // floor(7 / 8) = 0, clamped to 1
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.stickyBarb, hp: 7, currentHp: 5 });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Focus Sash
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Focus Sash", () => {
  it("given a full-HP Pokemon holding Focus Sash, when on-damage-taken triggers, then it does not activate (handled by capLethalDamage)", () => {
    // Source: Focus Sash is handled by Gen5Ruleset.capLethalDamage (pre-damage hook).
    // The on-damage-taken trigger fires AFTER HP subtraction, so currentHp is already
    // post-damage. Focus Sash cannot detect a KO here because currentHp !== maxHp.
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.focusSash, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 250 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a non-full-HP Pokemon holding Focus Sash taking a KO hit, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash: requires pokemon.hp === pokemon.baseMaxhp to activate
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.focusSash, hp: 200, currentHp: 199 });
    const ctx = createItemContext({ pokemon, damage: 250 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a full-HP Pokemon holding Focus Sash taking a non-KO hit, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash: only blocks hits that would reduce HP to 0 or below
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.focusSash, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Focus Band
// ---------------------------------------------------------------------------

// Focus Band is handled by Gen5Ruleset.capLethalDamage (pre-damage hook), NOT on-damage-taken.
// This prevents double-rolling the 10% chance on a single lethal hit.
// Source: Showdown sim/battle-actions.ts -- Focus Band onDamage (pre-damage priority)
describe("Gen 5 Items -- Focus Band (not handled in on-damage-taken)", () => {
  it("given a Pokemon holding Focus Band and lethal damage, when on-damage-taken triggers, then it does NOT activate (handled by capLethalDamage instead)", () => {
    // Focus Band moved to capLethalDamage to avoid double-rolling.
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.focusBand, hp: 100, currentHp: 100 });
    const ctx = createItemContext({ pokemon, damage: 150, seed: 0 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon taking a non-KO hit, when Focus Band is checked via on-damage-taken, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Band: only applies when damage would be lethal
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.focusBand, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

describe("Gen5Ruleset.capLethalDamage -- Focus Band (authoritative handler)", () => {
  it("given Focus Band at reduced HP and lucky RNG, when lethal damage is dealt, then survives with damage capped to currentHp - 1", () => {
    // Source: Showdown data/items.ts -- Focus Band 10% activation
    // Fix: damage capped to currentHp - 1 (not maxHp - 1) to leave exactly 1 HP
    // Verification: seed 7 deterministically passes the 10% check in this ruleset path.
    // currentHp=60, maxHp=200, damage=300 -> capped damage = 59 (leaves 1 HP)
    const ruleset = new Gen5Ruleset();
    const defender = createOnFieldPokemon({ heldItem: ITEM_IDS.focusBand, hp: 200, currentHp: 60 });
    const state = { ...createBattleState(), rng: new SeededRandom(7) } as unknown as BattleState;
    const luckyResult = ruleset.capLethalDamage(
      300,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(luckyResult.survived).toBe(true);
    expect(luckyResult.damage).toBe(59); // currentHp - 1 = 60 - 1 = 59; HP after = 60 - 59 = 1
    expect(luckyResult.messages[0]).toContain("Focus Band");
  });

  it("given Focus Band and unlucky RNG, when lethal damage is dealt, then does not survive", () => {
    // Source: Showdown data/items.ts -- Focus Band 10% chance; most seeds fail
    // Find a seed where ALL 200 rolls fail (highly likely for a single seed at 10% chance)
    const ruleset = new Gen5Ruleset();
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusBand,
      hp: 100,
      currentHp: 100,
    });
    // SeededRandom seed=42 consistently fails the 10% check
    const state = { ...createBattleState(), rng: new SeededRandom(42) } as unknown as BattleState;
    const result = ruleset.capLethalDamage(
      100,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(100); // Original lethal damage unchanged
  });
});

// ---------------------------------------------------------------------------
// Focus Sash / Focus Band -- Klutz, Embargo, Magic Room suppression (#804)
// ---------------------------------------------------------------------------

describe("Gen5Ruleset.capLethalDamage -- item suppression (#804)", () => {
  it("given a full-HP Pokemon with Klutz holding Focus Sash, when taking lethal damage, then Focus Sash does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- klutz: suppresses all held item effects for the holder
    // Source: Showdown data/items.ts -- Focus Sash: not activated when items are suppressed
    const ruleset = new Gen5Ruleset();
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusSash,
      ability: ABILITY_IDS.klutz,
      hp: 200,
      currentHp: 200,
    });
    const state = createBattleState();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(300);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given a full-HP Pokemon under Embargo holding Focus Sash, when taking lethal damage, then Focus Sash does NOT activate", () => {
    // Source: Showdown data/moves.ts -- embargo: target's item is unusable
    // Source: Showdown data/items.ts -- Focus Sash: not activated when items are suppressed
    const ruleset = new Gen5Ruleset();
    const volatiles = new Map<string, { turnsLeft: number }>([
      [VOLATILE_IDS.embargo, { turnsLeft: 5 }],
    ]);
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
      volatiles,
    });
    const state = createBattleState();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(300);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Magic Room is active and a full-HP Pokemon holds Focus Sash, when taking lethal damage, then Focus Sash does NOT activate", () => {
    // Source: Showdown sim/battle.ts -- Magic Room suppresses all held item effects
    const ruleset = new Gen5Ruleset();
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
    });
    const state = {
      ...createBattleState(),
      magicRoom: { active: true, turnsLeft: 3 },
    } as unknown as BattleState;
    const result = ruleset.capLethalDamage(
      300,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(300);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given a Pokemon with Klutz holding Focus Band, when taking lethal damage with lucky RNG, then Focus Band does NOT activate", () => {
    // Source: Showdown data/abilities.ts -- klutz: suppresses all held item effects for the holder
    // Source: Showdown data/items.ts -- Focus Band: not activated when items are suppressed
    // Verification: seed 7 is a lucky Focus Band seed without suppression, so using it here
    // proves Klutz blocks the activation rather than relying on an unlucky roll.
    const ruleset = new Gen5Ruleset();
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusBand,
      ability: ABILITY_IDS.klutz,
      hp: 100,
      currentHp: 100,
    });
    const state = {
      ...createBattleState(),
      rng: new SeededRandom(7),
    } as unknown as BattleState;
    const result = ruleset.capLethalDamage(
      200,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(200);
  });

  it("given a Pokemon under Embargo holding Focus Band, when taking lethal damage with lucky RNG, then Focus Band does NOT activate", () => {
    // Source: Showdown data/moves.ts -- embargo: target's item is unusable
    // Verification: seed 7 is a lucky Focus Band seed without suppression, so using it here
    // proves Embargo blocks the activation rather than relying on an unlucky roll.
    const ruleset = new Gen5Ruleset();
    const volatiles = new Map<string, { turnsLeft: number }>([
      [VOLATILE_IDS.embargo, { turnsLeft: 5 }],
    ]);
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusBand,
      hp: 100,
      currentHp: 100,
      volatiles,
    });
    const state = {
      ...createBattleState(),
      rng: new SeededRandom(7),
    } as unknown as BattleState;
    const result = ruleset.capLethalDamage(
      200,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(false);
    expect(result.damage).toBe(200);
  });

  it("given no suppression and a full-HP Pokemon with Focus Sash, when taking lethal damage, then Focus Sash still works normally", () => {
    // Source: Showdown data/items.ts -- Focus Sash: activates when no suppression
    // Regression: ensure the suppression check doesn't break normal behavior
    const ruleset = new Gen5Ruleset();
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
    });
    const state = createBattleState();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      defender,
      createCanonicalMove(MOVE_IDS.tackle),
      state,
    );
    expect(result.survived).toBe(true);
    expect(result.damage).toBe(199); // maxHp - 1 = 200 - 1 = 199
    expect(result.consumedItem).toBe(ITEM_IDS.focusSash);
    expect(result.messages[0]).toContain("Focus Sash");
  });
});

// ---------------------------------------------------------------------------
// Stat pinch berries
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Stat pinch berries", () => {
  it("given a Pokemon at 25% HP after damage holding Liechi Berry, when on-damage-taken triggers, then Attack is boosted and consumed", () => {
    // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at <=25% HP
    // Note: currentHp is already post-damage (engine subtracts HP before on-damage-taken fires)
    // 49 <= floor(200*0.25) = 50, so threshold is met
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.liechiBerry,
      hp: 200,
      currentHp: 49,
    });
    const ctx = createItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack" },
      { type: "consume", target: "self", value: ITEM_IDS.liechiBerry },
    ]);
  });

  it("given a Pokemon at 26% HP after damage holding Liechi Berry, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- pinch berries activate at <= 25% HP threshold
    // Note: currentHp is already post-damage. 51 > floor(200 * 0.25) = 50, so threshold is not met
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.liechiBerry,
      hp: 200,
      currentHp: 51,
    });
    const ctx = createItemContext({ pokemon, damage: 49 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Gluttony holding Liechi Berry at 50% after damage, when on-damage-taken triggers, then it activates early", () => {
    // Source: Bulbapedia -- Gluttony: pinch berries activate at 50% instead of 25%
    // Note: currentHp is already post-damage. 100 <= floor(200*0.5) = 100, so threshold is met
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.liechiBerry,
      ability: ABILITY_IDS.gluttony,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon, damage: 100 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
    });
  });

  it("given Ganlon Berry activating, then it boosts Defense", () => {
    // Source: Showdown data/items.ts -- Ganlon Berry onEat: boosts: { def: 1 }
    // Note: currentHp is already post-damage. 49 <= floor(200*0.25) = 50
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.ganlonBerry,
      hp: 200,
      currentHp: 49,
    });
    const ctx = createItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "defense",
    });
  });

  it("given Salac Berry activating, then it boosts Speed", () => {
    // Source: Showdown data/items.ts -- Salac Berry onEat: boosts: { spe: 1 }
    // Note: currentHp is already post-damage. 49 <= floor(200*0.25) = 50
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.salacBerry, hp: 200, currentHp: 49 });
    const ctx = createItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "speed",
    });
  });

  it("given Petaya Berry activating, then it boosts Sp. Atk", () => {
    // Source: Showdown data/items.ts -- Petaya Berry onEat: boosts: { spa: 1 }
    // Note: currentHp is already post-damage. 49 <= floor(200*0.25) = 50
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.petayaBerry,
      hp: 200,
      currentHp: 49,
    });
    const ctx = createItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
    });
  });

  it("given Apicot Berry activating, then it boosts Sp. Def", () => {
    // Source: Showdown data/items.ts -- Apicot Berry onEat: boosts: { spd: 1 }
    // Note: currentHp is already post-damage. 49 <= floor(200*0.25) = 50
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.apicotBerry,
      hp: 200,
      currentHp: 49,
    });
    const ctx = createItemContext({ pokemon, damage: 51 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });
});

// ---------------------------------------------------------------------------
// getPinchBerryThreshold
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- getPinchBerryThreshold", () => {
  it("given a Pokemon with Gluttony and a 25% threshold, then returns 50%", () => {
    // Source: Bulbapedia -- Gluttony: pinch berries (<=25% threshold) activate at <=50% instead
    expect(getPinchBerryThreshold({ ability: ABILITY_IDS.gluttony }, 0.25)).toBe(0.5);
  });

  it("given a Pokemon without Gluttony and a 25% threshold, then returns 25%", () => {
    // Source: Showdown data/items.ts -- default pinch berry threshold is 0.25 (25% HP)
    expect(getPinchBerryThreshold({ ability: ABILITY_IDS.none }, 0.25)).toBe(0.25);
  });

  it("given a Pokemon with Gluttony and a 50% threshold (Sitrus), then returns 50% unchanged", () => {
    // Source: Bulbapedia -- Gluttony only affects berries with threshold <= 0.25; Sitrus (0.5) is unaffected
    expect(getPinchBerryThreshold({ ability: ABILITY_IDS.gluttony }, 0.5)).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Rocky Helmet (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Rocky Helmet", () => {
  it("given a defender with Rocky Helmet hit by a contact move, when on-contact triggers, then attacker takes 1/6 attacker max HP", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet onDamagingHit:
    //   if (move.flags['contact']) this.damage(source.baseMaxhp / 6, source, target)
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.rockyHelmet,
      hp: 200,
      currentHp: 150,
    });
    const attacker = createOnFieldPokemon({ hp: 300, currentHp: 300 });
    const sides = [
      { active: [defender], team: [], format: "singles" },
      { active: [attacker], team: [], format: "singles" },
    ];
    const state = createBattleState({ sides: sides as any });
    const contactMove = createSyntheticMoveFrom({ flags: { contact: true } });
    const ctx = createItemContext({ pokemon: defender, state, move: contactMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(true);
    // 1/6 of attacker's 300 HP = 50
    expect(result.effects).toEqual([{ type: "chip-damage", target: "opponent", value: 50 }]);
  });

  it("given a defender with Rocky Helmet hit by a non-contact move, when on-contact triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Rocky Helmet: only fires when move.flags['contact'] is true
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.rockyHelmet,
      hp: 200,
      currentHp: 150,
    });
    const nonContactMove = createSyntheticMoveFrom({ flags: { contact: false } });
    const ctx = createItemContext({ pokemon: defender, move: nonContactMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Air Balloon (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Air Balloon", () => {
  it("given a defender with Air Balloon taking damage, when on-damage-taken triggers, then balloon pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit: useItem()
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.airBalloon,
      hp: 200,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon, damage: 30 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "consume", target: "self", value: ITEM_IDS.airBalloon },
    ]);
    expect(result.messages[0]).toContain("popped");
  });

  it("given a defender with Air Balloon taking 0 damage, when on-damage-taken triggers, then it does not pop", () => {
    // Source: Showdown data/items.ts -- Air Balloon onDamagingHit only fires on actual damaging hits
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.airBalloon,
      hp: 200,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Red Card (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Red Card", () => {
  it("given a defender with Red Card taking damage, when on-damage-taken triggers, then opponent is forced to switch and Red Card is consumed", () => {
    // Source: Showdown data/items.ts -- Red Card onAfterMoveSecondary:
    //   source.forceSwitchFlag = true
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.redCard, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual(
      expect.objectContaining({
        type: ABILITY_IDS.none,
        target: "opponent",
        value: "force-switch",
      }),
    );
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "consume" }));
  });

  it("given a defender with Red Card taking 0 damage, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Red Card only fires on actual damaging hits
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.redCard, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Eject Button (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Eject Button", () => {
  it("given a defender with Eject Button taking damage, when on-damage-taken triggers, then holder is forced to switch and Eject Button is consumed", () => {
    // Source: Showdown data/items.ts -- Eject Button onAfterMoveSecondary:
    //   target.switchFlag = true
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.ejectButton,
      hp: 200,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual(
      expect.objectContaining({ type: ABILITY_IDS.none, target: "self", value: "force-switch" }),
    );
    expect(result.effects).toContainEqual(expect.objectContaining({ type: "consume" }));
  });

  it("given a defender with Eject Button taking 0 damage, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Eject Button only fires on actual damaging hits
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.ejectButton,
      hp: 200,
      currentHp: 200,
    });
    const ctx = createItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Absorb Bulb (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Absorb Bulb", () => {
  it("given a defender with Absorb Bulb hit by a Water move, when on-damage-taken triggers, then SpA is boosted and consumed", () => {
    // Source: Showdown data/items.ts -- Absorb Bulb onDamagingHit:
    //   if (move.type === 'Water') boost spa by 1, useItem
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.absorbBulb,
      hp: 200,
      currentHp: 150,
    });
    const waterMove = createSyntheticMoveFrom({ type: CORE_TYPE_IDS.water });
    const ctx = createItemContext({ pokemon, move: waterMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "spAttack" },
      { type: "consume", target: "self", value: ITEM_IDS.absorbBulb },
    ]);
  });

  it("given a defender with Absorb Bulb hit by a non-Water move, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Absorb Bulb: only triggers on Water-type moves
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.absorbBulb,
      hp: 200,
      currentHp: 150,
    });
    const fireMove = createSyntheticMoveFrom({ type: CORE_TYPE_IDS.fire });
    const ctx = createItemContext({ pokemon, move: fireMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cell Battery (NEW Gen 5)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Cell Battery", () => {
  it("given a defender with Cell Battery hit by an Electric move, when on-damage-taken triggers, then Atk is boosted and consumed", () => {
    // Source: Showdown data/items.ts -- Cell Battery onDamagingHit:
    //   if (move.type === 'Electric') boost atk by 1, useItem
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.cellBattery,
      hp: 200,
      currentHp: 150,
    });
    const electricMove = createSyntheticMoveFrom({ type: CORE_TYPE_IDS.electric });
    const ctx = createItemContext({ pokemon, move: electricMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "stat-boost", target: "self", value: "attack" },
      { type: "consume", target: "self", value: ITEM_IDS.cellBattery },
    ]);
  });

  it("given a defender with Cell Battery hit by a non-Electric move, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Cell Battery: only triggers on Electric-type moves
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.cellBattery,
      hp: 200,
      currentHp: 150,
    });
    const normalMove = createSyntheticMoveFrom({ type: CORE_TYPE_IDS.normal });
    const ctx = createItemContext({ pokemon, move: normalMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// King's Rock / Razor Fang (Gen 5: no whitelist)
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- King's Rock / Razor Fang (no whitelist in Gen 5)", () => {
  it("given a Pokemon with King's Rock using any damaging move with lucky RNG, when on-hit triggers, then it causes flinch", () => {
    // Source: Showdown data/items.ts -- Gen 5+ King's Rock applies to ALL damaging moves
    // (no more affectedByKingsRock whitelist)
    // Verification: seed 7 deterministically hits the King's Rock flinch branch.
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.kingsRock });
    const flinchResult = applyGen5HeldItem(
      ITEM_TRIGGER_IDS.onHit,
      createItemContext({ pokemon, damage: 50, seed: 7 }),
    );
    expect(flinchResult.activated).toBe(true);
    expect(flinchResult.effects).toEqual([{ type: "flinch", target: "opponent" }]);
  });

  it("given a Pokemon with Razor Fang dealing damage, when on-hit triggers with lucky RNG, then it causes flinch", () => {
    // Source: Showdown data/items.ts -- Razor Fang: same 10% flinch chance as King's Rock, applies to all damaging moves in Gen 5
    // Verification: seed 7 deterministically hits the Razor Fang flinch branch.
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.razorFang });
    const flinchResult = applyGen5HeldItem(
      ITEM_TRIGGER_IDS.onHit,
      createItemContext({ pokemon, damage: 50, seed: 7 }),
    );
    expect(flinchResult.activated).toBe(true);
    expect(flinchResult.effects).toEqual([{ type: "flinch", target: "opponent" }]);
  });

  it("given a Pokemon with King's Rock dealing 0 damage, when on-hit triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- King's Rock: requires damage > 0 to have a flinch chance
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.kingsRock });
    const ctx = createItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shell Bell
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Shell Bell", () => {
  it("given a Pokemon with Shell Bell dealing 80 damage, when on-hit triggers, then it heals 10 HP (floor(80/8))", () => {
    // Source: Showdown data/items.ts -- Shell Bell: heal 1/8 damage dealt
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.shellBell });
    const ctx = createItemContext({ pokemon, damage: 80 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 10 }]);
  });

  it("given a Pokemon with Shell Bell dealing 5 damage, when on-hit triggers, then it heals 1 HP (minimum 1)", () => {
    // Source: Showdown data/items.ts -- Shell Bell: heal floor(damage / 8), minimum 1
    // floor(5 / 8) = 0, clamped to 1
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.shellBell });
    const ctx = createItemContext({ pokemon, damage: 5 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// Life Orb
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Life Orb", () => {
  it("given a Pokemon with 200 max HP and Life Orb dealing damage, when on-hit triggers, then it takes 20 HP recoil (floor(200/10))", () => {
    // Source: Showdown data/items.ts -- Life Orb recoil: floor(maxHP/10)
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lifeOrb, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });

  it("given a Pokemon with 15 max HP and Life Orb dealing damage, when on-hit triggers, then it takes 1 HP recoil (minimum 1)", () => {
    // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10), minimum 1
    // floor(15 / 10) = 1
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lifeOrb, hp: 15, currentHp: 15 });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 1 }]);
  });

  it("given a Pokemon with Life Orb dealing 0 damage, when on-hit triggers, then it does not take recoil", () => {
    // Source: Showdown data/items.ts -- Life Orb: requires damage > 0 to trigger recoil
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lifeOrb, hp: 200, currentHp: 200 });
    const ctx = createItemContext({ pokemon, damage: 0 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Life Orb + Sheer Force interaction
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Life Orb + Sheer Force interaction", () => {
  it("given a Sheer Force Pokemon using a move with a secondary effect and Life Orb, when on-hit triggers, then Life Orb recoil is suppressed", () => {
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    // Sheer Force suppresses LO recoil when the move has an eligible secondary effect
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.lifeOrb,
      ability: ABILITY_IDS.sheerForce,
      hp: 200,
      currentHp: 200,
    });
    // Move with a status-chance secondary effect (Sheer Force eligible)
    // Source: Showdown -- Flamethrower: secondary.status burn, chance 10
    const moveWithEffect = createSyntheticMoveFrom({
      effect: {
        type: "status-chance",
        status: STATUS_IDS.burn,
        chance: 10,
      },
    });
    const ctx = createItemContext({ pokemon, move: moveWithEffect, damage: 80 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    // Should NOT activate because Sheer Force suppresses Life Orb recoil
    expect(result.activated).toBe(false);
  });

  it("given a Sheer Force Pokemon using a move without a secondary effect and Life Orb, when on-hit triggers, then Life Orb recoil is NOT suppressed", () => {
    // Source: Showdown scripts.ts -- Sheer Force: only suppresses Life Orb recoil when move.hasSheerForce is set (move has eligible secondary)
    // When the move doesn't qualify for Sheer Force, Life Orb recoil applies normally
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.lifeOrb,
      ability: ABILITY_IDS.sheerForce,
      hp: 200,
      currentHp: 200,
    });
    // Move with NO secondary effect (Sheer Force does NOT activate)
    const moveWithoutEffect = createSyntheticMoveFrom({ effect: null });
    const ctx = createItemContext({ pokemon, move: moveWithoutEffect, damage: 80 });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.onHit, ctx);
    // SHOULD activate because Sheer Force did not trigger
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 20 }]);
  });
});

// ---------------------------------------------------------------------------
// Unburden interaction
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Unburden interaction", () => {
  it("given a Pokemon with Unburden whose item is consumed, when the item triggers, then the unburden volatile is set", () => {
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.sitrusBerry,
      ability: ABILITY_IDS.unburden,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(pokemon.volatileStatuses.has(ABILITY_IDS.unburden)).toBe(true);
  });

  it("given a Pokemon without Unburden whose item is consumed, when the item triggers, then no unburden volatile is set", () => {
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem: only sets volatile when pokemon.hasAbility('unburden')
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.sitrusBerry,
      ability: ABILITY_IDS.none,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(pokemon.volatileStatuses.has(ABILITY_IDS.unburden)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Metronome item
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Metronome item", () => {
  it("given a Pokemon with Metronome item using the same move twice, when before-move triggers, then consecutive count increments", () => {
    // Source: Showdown data/items.ts -- Metronome item onModifyDamage
    const pokemon = createOnFieldPokemon({ heldItem: MOVE_IDS.metronome });
    const move = createSyntheticMoveFrom({ id: MOVE_IDS.iceBeam });

    // First use
    const ctx1 = createItemContext({ pokemon, move });
    applyGen5HeldItem(ITEM_TRIGGER_IDS.beforeMove, ctx1);
    const state1 = pokemon.volatileStatuses.get(VOLATILE_IDS.metronomeCount);
    expect(state1?.data?.count).toBe(1);
    expect(state1?.data?.moveId).toBe(MOVE_IDS.iceBeam);

    // Second use (same move)
    const ctx2 = createItemContext({ pokemon, move });
    applyGen5HeldItem(ITEM_TRIGGER_IDS.beforeMove, ctx2);
    const state2 = pokemon.volatileStatuses.get(VOLATILE_IDS.metronomeCount);
    expect(state2?.data?.count).toBe(2);
  });

  it("given a Pokemon with Metronome item switching moves, when before-move triggers, then consecutive count resets to 1", () => {
    // Source: Showdown data/items.ts -- Metronome item: count resets to 1 when moveId !== lastMoveId
    const pokemon = createOnFieldPokemon({ heldItem: MOVE_IDS.metronome });
    const move1 = createSyntheticMoveFrom({ id: MOVE_IDS.iceBeam });
    const move2 = createSyntheticMoveFrom({ id: MOVE_IDS.thunderbolt });

    // First use
    const ctx1 = createItemContext({ pokemon, move: move1 });
    applyGen5HeldItem(ITEM_TRIGGER_IDS.beforeMove, ctx1);

    // Second use (different move)
    const ctx2 = createItemContext({ pokemon, move: move2 });
    applyGen5HeldItem(ITEM_TRIGGER_IDS.beforeMove, ctx2);
    const state = pokemon.volatileStatuses.get(VOLATILE_IDS.metronomeCount);
    expect(state?.data?.count).toBe(1);
    expect(state?.data?.moveId).toBe(MOVE_IDS.thunderbolt);
  });
});

// ---------------------------------------------------------------------------
// Jaboca / Rowap Berry
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Jaboca / Rowap Berry", () => {
  it("given a Pokemon holding Jaboca Berry hit by a physical move, when on-damage-taken triggers, then attacker takes 1/8 attacker max HP retaliation", () => {
    // Source: Showdown data/items.ts -- Jaboca Berry: this.damage(source.baseMaxhp / 8)
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.jabocaBerry,
      hp: 200,
      currentHp: 150,
    });
    const attacker = createOnFieldPokemon({ hp: 400, currentHp: 400 });
    const sides = [
      { active: [defender], team: [], format: "singles" },
      { active: [attacker], team: [], format: "singles" },
    ];
    const state = createBattleState({ sides: sides as any });
    const physicalMove = createSyntheticMoveFrom({ category: CORE_MOVE_CATEGORIES.physical });
    const ctx = createItemContext({ pokemon: defender, state, move: physicalMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    // 1/8 of attacker's 400 HP = 50
    expect(result.effects[0]).toEqual({
      type: "chip-damage",
      target: "opponent",
      value: 50,
    });
    expect(result.effects[1]).toEqual({
      type: "consume",
      target: "self",
      value: ITEM_IDS.jabocaBerry,
    });
  });

  it("given a Pokemon holding Rowap Berry hit by a special move, when on-damage-taken triggers, then attacker takes 1/8 attacker max HP retaliation", () => {
    // Source: Showdown data/items.ts -- Rowap Berry: same formula as Jaboca
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.rowapBerry,
      hp: 200,
      currentHp: 150,
    });
    const attacker = createOnFieldPokemon({ hp: 240, currentHp: 240 });
    const sides = [
      { active: [defender], team: [], format: "singles" },
      { active: [attacker], team: [], format: "singles" },
    ];
    const state = createBattleState({ sides: sides as any });
    const specialMove = createSyntheticMoveFrom({ category: CORE_MOVE_CATEGORIES.special });
    const ctx = createItemContext({ pokemon: defender, state, move: specialMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    // 1/8 of attacker's 240 HP = 30
    expect(result.effects[0]).toEqual({
      type: "chip-damage",
      target: "opponent",
      value: 30,
    });
  });

  it("given a Pokemon holding Jaboca Berry hit by a special move, when on-damage-taken triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Jaboca Berry: only fires when move.category === 'physical'
    const defender = createOnFieldPokemon({
      heldItem: ITEM_IDS.jabocaBerry,
      hp: 200,
      currentHp: 150,
    });
    const specialMove = createSyntheticMoveFrom({ category: CORE_MOVE_CATEGORIES.special });
    const ctx = createItemContext({ pokemon: defender, move: specialMove, damage: 50 });
    const result = applyGen5HeldItem(TRIGGER_IDS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Berry Juice
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- Berry Juice", () => {
  it("given a Pokemon at 50% HP holding Berry Juice, when end-of-turn triggers, then it heals 20 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Berry Juice: restores 20 HP at <=50%
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.berryJuice,
      hp: 200,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 20 },
      { type: "consume", target: "self", value: ITEM_IDS.berryJuice },
    ]);
  });

  it("given a Pokemon above 50% HP holding Berry Juice, when end-of-turn triggers, then it does not activate", () => {
    // Source: Showdown data/items.ts -- Berry Juice: threshold is currentHP <= maxHP / 2; 150 > 100 so no activation
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.berryJuice,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown trigger / unknown item
// ---------------------------------------------------------------------------

describe("Gen 5 Items -- unknown trigger and unknown items", () => {
  it("given a Pokemon with an unrecognized item, when any trigger fires, then it does not activate", () => {
    // Source: Showdown data/items.ts -- unrecognized item IDs have no handler; applyGen5HeldItem returns { activated: false }
    const pokemon = createOnFieldPokemon({ heldItem: "some-unknown-item" });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem(ITEM_TRIGGER_IDS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Leftovers, when an unknown trigger fires, then it does not activate", () => {
    // Source: Showdown data/items.ts -- unrecognized trigger names fall through the switch; returns { activated: false }
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers });
    const ctx = createItemContext({ pokemon });
    const result = applyGen5HeldItem("some-unknown-trigger", ctx);
    expect(result.activated).toBe(false);
  });
});
