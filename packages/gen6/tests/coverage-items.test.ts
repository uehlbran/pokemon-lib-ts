/**
 * Targeted coverage tests for Gen6Items.ts
 *
 * Covers the on-damage-taken, on-contact, on-hit, before-move, and end-of-turn
 * item triggers that were not covered by existing tests.
 *
 * Source: Showdown data/items.ts -- individual item entries
 */

import type { ActivePokemon, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "@pokemon-lib-ts/gen6";
import { applyGen6HeldItem } from "../src/Gen6Items";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const abilityIds = { ...CORE_ABILITY_IDS, ...GEN6_ABILITY_IDS } as const;
const itemIds = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS } as const;
const moveIds = GEN6_MOVE_IDS;
const typeIds = CORE_TYPE_IDS;
const statusIds = CORE_STATUS_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const genderIds = CORE_GENDERS;
const abilitySlots = CORE_ABILITY_SLOTS;
const abilityTriggerIds = CORE_ABILITY_TRIGGER_IDS;
const itemTriggerIds = {
  beforeMove: "before-move",
  endOfTurn: CORE_ITEM_TRIGGER_IDS.endOfTurn,
  onDamageTaken: abilityTriggerIds.onDamageTaken,
  onHit: CORE_ITEM_TRIGGER_IDS.onHit,
} as const;
const dataManager = createGen6DataManager();
const defaultSpecies = dataManager.getSpecies(GEN6_SPECIES_IDS.bulbasaur);
const defaultNatureId = dataManager.getNature(GEN6_NATURE_IDS.hardy).id;
const tackleMove = dataManager.getMove(moveIds.tackle);
const flamethrowerMove = dataManager.getMove(moveIds.flamethrower);
const surfMove = dataManager.getMove(moveIds.surf);
const thunderboltMove = dataManager.getMove(moveIds.thunderbolt);
const iceBeamMove = dataManager.getMove(moveIds.iceBeam);
const metronomeCountVolatileId = "metronome-count" as const;
const forceSwitchEffect = "force-switch" as const;

type PokemonGender = (typeof genderIds)[keyof typeof genderIds];

function createOnFieldPokemon(overrides: {
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  nickname?: string | null;
  gender?: PokemonGender;
  speciesId?: ActivePokemon["pokemon"]["speciesId"];
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(6), {
    nickname: overrides.nickname ?? null,
    nature: defaultNatureId,
    ivs: createIvs(),
    evs: createEvs(),
    gender: overrides.gender ?? genderIds.male,
    abilitySlot: abilitySlots.normal1,
    heldItem: overrides.heldItem ?? null,
    moves: [],
    friendship: createFriendship(species.baseFriendship),
    isShiny: false,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });

  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  pokemon.ability = overrides.ability ?? pokemon.ability;

  const activePokemon = createBattleOnFieldPokemon(pokemon, 0, [...(overrides.types ?? species.types)]);
  activePokemon.ability = pokemon.ability;
  activePokemon.volatileStatuses = overrides.volatiles ?? new Map();
  return activePokemon;
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
    generation: 6,
    turnNumber: 1,
    rng: new SeededRandom(42),
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

// ===========================================================================
// End-of-turn items
// ===========================================================================

describe("Gen 6 Items -- Status cure berries (end-of-turn)", () => {
  it("given Cheri Berry + paralysis status, when end-of-turn triggers, then cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Cheri Berry cures paralysis
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.cheriBerry, status: statusIds.paralysis });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: itemIds.cheriBerry },
    ]);
  });

  it("given Cheri Berry without paralysis, when end-of-turn triggers, then does not activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.cheriBerry, status: null });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given Chesto Berry + sleep status, when end-of-turn triggers, then cures sleep", () => {
    // Source: Showdown data/items.ts -- Chesto Berry cures sleep
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.chestoBerry, status: statusIds.sleep });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: itemIds.chestoBerry },
    ]);
  });

  it("given Pecha Berry + poison status, when end-of-turn triggers, then cures poison", () => {
    // Source: Showdown data/items.ts -- Pecha Berry cures poison/badly-poisoned
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.pechaBerry, status: statusIds.poison });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: itemIds.pechaBerry },
    ]);
  });

  it("given Pecha Berry + badly-poisoned, when end-of-turn triggers, then cures it", () => {
    // Source: Showdown data/items.ts -- Pecha Berry also cures badly-poisoned
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.pechaBerry, status: statusIds.badlyPoisoned });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
  });

  it("given Rawst Berry + burn status, when end-of-turn triggers, then cures burn", () => {
    // Source: Showdown data/items.ts -- Rawst Berry cures burn
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.rawstBerry, status: statusIds.burn });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: itemIds.rawstBerry },
    ]);
  });

  it("given Aspear Berry + freeze status, when end-of-turn triggers, then cures freeze", () => {
    // Source: Showdown data/items.ts -- Aspear Berry cures freeze
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.aspearBerry, status: statusIds.freeze });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "status-cure", target: "self" },
      { type: "consume", target: "self", value: itemIds.aspearBerry },
    ]);
  });
});

describe("Gen 6 Items -- Persim Berry", () => {
  it("given Persim Berry + confusion, when end-of-turn triggers, then cures confusion", () => {
    // Source: Showdown data/items.ts -- Persim Berry cures confusion
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(volatileIds.confusion, { turnsLeft: 3 });
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.persimBerry, volatiles });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "volatile-cure", target: "self", value: volatileIds.confusion },
      { type: "consume", target: "self", value: itemIds.persimBerry },
    ]);
  });

  it("given Persim Berry without confusion, when end-of-turn triggers, then does not activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.persimBerry });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Lum Berry", () => {
  it("given Lum Berry + burn status, when end-of-turn triggers, then cures status", () => {
    // Source: Showdown data/items.ts -- Lum Berry cures any primary status OR confusion
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.lumBerry, status: statusIds.burn });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "status-cure", target: "self" });
    expect(result.effects).toContainEqual({ type: "consume", target: "self", value: itemIds.lumBerry });
  });

  it("given Lum Berry + confusion (no primary status), when end-of-turn triggers, then cures confusion", () => {
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(volatileIds.confusion, { turnsLeft: 2 });
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.lumBerry, volatiles });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: volatileIds.confusion,
    });
  });

  it("given Lum Berry with neither status nor confusion, when end-of-turn triggers, then does not activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.lumBerry });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Mental Herb", () => {
  it("given Mental Herb + taunt volatile, when end-of-turn triggers, then cures taunt and is consumed", () => {
    // Source: Showdown data/items.ts -- Mental Herb cures mental volatiles
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(volatileIds.taunt, { turnsLeft: 2 });
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.mentalHerb, volatiles });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: volatileIds.taunt,
    });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: itemIds.mentalHerb,
    });
  });

  it("given Mental Herb + infatuation + encore, when end-of-turn triggers, then cures BOTH", () => {
    // Source: Showdown data/items.ts -- Mental Herb cures all 6 mental volatiles at once
    const volatiles = new Map<string, { turnsLeft: number }>();
    volatiles.set(volatileIds.infatuation, { turnsLeft: -1 });
    volatiles.set(volatileIds.encore, { turnsLeft: 3 });
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.mentalHerb, volatiles });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: volatileIds.infatuation,
    });
    expect(result.effects).toContainEqual({
      type: "volatile-cure",
      target: "self",
      value: volatileIds.encore,
    });
  });

  it("given Mental Herb without any mental volatiles, when end-of-turn triggers, then does not activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.mentalHerb });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Sticky Barb end-of-turn", () => {
  it("given Sticky Barb with 200 max HP, when end-of-turn triggers, then deals 25 chip damage (floor(200/8))", () => {
    // Source: Showdown data/items.ts -- Sticky Barb: 1/8 max HP per turn
    // Derivation: floor(200/8) = 25
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.stickyBarb, hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 25 }]);
  });

  it("given Sticky Barb with 100 max HP, when end-of-turn triggers, then deals 12 chip damage (floor(100/8))", () => {
    // Derivation: floor(100/8) = 12
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.stickyBarb, hp: 100, currentHp: 80 });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 12 }]);
  });
});

describe("Gen 6 Items -- Berry Juice", () => {
  it("given Berry Juice with HP <= 50%, when end-of-turn triggers, then heals 20 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Berry Juice: heals 20 HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.berryJuice, hp: 200, currentHp: 90 });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 20 },
      { type: "consume", target: "self", value: itemIds.berryJuice },
    ]);
  });

  it("given Berry Juice with HP > 50%, when end-of-turn triggers, then does not activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.berryJuice, hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Oran Berry end-of-turn", () => {
  it("given Oran Berry with HP <= 50%, when end-of-turn triggers, then heals 10 HP and is consumed", () => {
    // Source: Showdown data/items.ts -- Oran Berry: heals 10 HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.oranBerry, hp: 100, currentHp: 40 });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([
      { type: "heal", target: "self", value: 10 },
      { type: "consume", target: "self", value: itemIds.oranBerry },
    ]);
  });
});

// ===========================================================================
// On-damage-taken items
// ===========================================================================

describe("Gen 6 Items -- Focus Sash (moved to capLethalDamage, #784)", () => {
  it("given Focus Sash at full HP with lethal damage, when on-damage-taken triggers, then does NOT activate (handled by capLethalDamage now)", () => {
    // Focus Sash was moved from handleOnDamageTaken to capLethalDamage (pre-damage hook)
    // because handleOnDamageTaken fires post-damage, making currentHp === maxHp always false.
    // See: Gen6Ruleset.capLethalDamage and GitHub issue #784
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.focusSash, hp: 200, currentHp: 200 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 300 }));
    expect(result.activated).toBe(false);
  });

  it("given Focus Sash NOT at full HP with lethal damage, when on-damage-taken triggers, then does NOT activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.focusSash, hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 200 }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- Pinch berries on-damage-taken", () => {
  it("given Liechi Berry at 25% HP after taking damage, when on-damage-taken triggers, then +1 Attack", () => {
    // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at 25% HP
    // 200 HP * 0.25 = 50 threshold
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.liechiBerry, hp: 200, currentHp: 45 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "attack" });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: itemIds.liechiBerry,
    });
  });

  it("given Ganlon Berry at 25% HP, when on-damage-taken triggers, then +1 Defense", () => {
    // Source: Showdown data/items.ts -- Ganlon Berry: +1 Def at 25% HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.ganlonBerry, hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "defense" });
  });

  it("given Salac Berry at 25% HP, when on-damage-taken triggers, then +1 Speed", () => {
    // Source: Showdown data/items.ts -- Salac Berry: +1 Speed at 25% HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.salacBerry, hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "speed" });
  });

  it("given Petaya Berry at 25% HP, when on-damage-taken triggers, then +1 SpAtk", () => {
    // Source: Showdown data/items.ts -- Petaya Berry: +1 SpAtk at 25% HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.petayaBerry, hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
    });
  });

  it("given Apicot Berry at 25% HP, when on-damage-taken triggers, then +1 SpDef", () => {
    // Source: Showdown data/items.ts -- Apicot Berry: +1 SpDef at 25% HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.apicotBerry, hp: 200, currentHp: 40 });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });

  it("given Gluttony ability with Liechi Berry, when on-damage-taken at 50% HP, then berry activates early", () => {
    // Source: Showdown data/abilities.ts -- Gluttony: activates pinch berries at 50% instead of 25%
    const pokemon = createOnFieldPokemon({
      heldItem: itemIds.liechiBerry,
      hp: 200,
      currentHp: 90,
      ability: abilityIds.gluttony,
    });
    const result = applyGen6HeldItem(itemTriggerIds.onDamageTaken, createItemContext({ pokemon, damage: 50 }));
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "stat-boost", target: "self", value: "attack" });
  });
});

describe("Gen 6 Items -- Jaboca Berry and Rowap Berry", () => {
  it("given Jaboca Berry + physical damage, when on-damage-taken triggers, then deals 1/8 attacker's max HP", () => {
    // Source: Showdown data/items.ts -- Jaboca Berry: 1/8 of ATTACKER's max HP on physical hit
    const defender = createOnFieldPokemon({ heldItem: itemIds.jabocaBerry, hp: 200, currentHp: 100 });
    const attacker = createOnFieldPokemon({ hp: 300, currentHp: 300 });
    const state = createBattleState({
      sides: [
        {
          active: [defender],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
        {
          active: [attacker],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
      ],
    });
    const physicalMove = tackleMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon: defender,
        state,
        damage: 50,
        move: physicalMove,
      }),
    );
    expect(result.activated).toBe(true);
    // floor(300/8) = 37
    expect(result.effects).toContainEqual({ type: "chip-damage", target: "opponent", value: 37 });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: itemIds.jabocaBerry,
    });
  });

  it("given Jaboca Berry + special damage, when on-damage-taken triggers, then does NOT activate", () => {
    const defender = createOnFieldPokemon({ heldItem: itemIds.jabocaBerry });
    const specialMove = flamethrowerMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon: defender,
        damage: 50,
        move: specialMove,
      }),
    );
    expect(result.activated).toBe(false);
  });

  it("given Rowap Berry + special damage, when on-damage-taken triggers, then deals 1/8 attacker's max HP", () => {
    // Source: Showdown data/items.ts -- Rowap Berry: 1/8 of ATTACKER's max HP on special hit
    const defender = createOnFieldPokemon({ heldItem: itemIds.rowapBerry, hp: 200, currentHp: 100 });
    const attacker = createOnFieldPokemon({ hp: 240, currentHp: 240 });
    const state = createBattleState({
      sides: [
        {
          active: [defender],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
        {
          active: [attacker],
          tailwind: { active: false, turnsLeft: 0 },
          hazards: new Map(),
          screens: new Map(),
        },
      ],
    });
    const specialMove = flamethrowerMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon: defender,
        state,
        damage: 50,
        move: specialMove,
      }),
    );
    expect(result.activated).toBe(true);
    // floor(240/8) = 30
    expect(result.effects).toContainEqual({ type: "chip-damage", target: "opponent", value: 30 });
  });
});

describe("Gen 6 Items -- Air Balloon, Red Card, Eject Button", () => {
  it("given Air Balloon + damage > 0, when on-damage-taken triggers, then balloon pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon pops on any damaging hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.airBalloon, hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "consume", target: "self", value: itemIds.airBalloon }]);
  });

  it("given Red Card + damage > 0, when on-damage-taken triggers, then force-switch opponent", () => {
    // Source: Showdown data/items.ts -- Red Card: force switch on damaging hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.redCard, hp: 200, currentHp: 100 });
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "none",
      target: "opponent",
      value: forceSwitchEffect,
    });
    expect(result.effects).toContainEqual({
      type: "consume",
      target: "self",
      value: itemIds.redCard,
    });
  });

  it("given Eject Button + damage > 0, when on-damage-taken triggers, then force-switch self", () => {
    // Source: Showdown data/items.ts -- Eject Button: self switches on damaging hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.ejectButton, hp: 200, currentHp: 100 });
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "none",
      target: "self",
      value: forceSwitchEffect,
    });
  });
});

describe("Gen 6 Items -- Absorb Bulb, Cell Battery, Snowball, Luminous Moss, Kee, Maranga", () => {
  it("given Absorb Bulb + Water hit, when on-damage-taken triggers, then +1 SpAtk", () => {
    // Source: Showdown data/items.ts -- Absorb Bulb: +1 SpAtk on Water hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.absorbBulb });
    const waterMove = surfMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
        move: waterMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
    });
  });

  it("given Cell Battery + Electric hit, when on-damage-taken triggers, then +1 Atk", () => {
    // Source: Showdown data/items.ts -- Cell Battery: +1 Atk on Electric hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.cellBattery });
    const elecMove = thunderboltMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
        move: elecMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
    });
  });

  it("given Snowball + Ice hit, when on-damage-taken triggers, then +1 Atk", () => {
    // Source: Showdown data/items.ts -- Snowball: +1 Atk on Ice hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.snowball });
    const iceMove = iceBeamMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
        move: iceMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
    });
  });

  it("given Luminous Moss + Water hit, when on-damage-taken triggers, then +1 SpDef", () => {
    // Source: Showdown data/items.ts -- Luminous Moss: +1 SpDef on Water hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.luminousMoss });
    const waterMove = surfMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
        move: waterMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });

  it("given Kee Berry + physical hit, when on-damage-taken triggers, then +1 Def", () => {
    // Source: Showdown data/items.ts -- Kee Berry: +1 Def on physical hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.keeBerry });
    const physicalMove = tackleMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
        move: physicalMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "defense",
    });
  });

  it("given Maranga Berry + special hit, when on-damage-taken triggers, then +1 SpDef", () => {
    // Source: Showdown data/items.ts -- Maranga Berry: +1 SpDef on special hit
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.marangaBerry });
    const specialMove = flamethrowerMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
        move: specialMove,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({
      type: "stat-boost",
      target: "self",
      value: "spDefense",
    });
  });
});

describe("Gen 6 Items -- Sitrus/Oran Berry on-damage-taken", () => {
  it("given Sitrus Berry post-damage HP <= 50%, when on-damage-taken triggers, then heals 1/4 max HP", () => {
    // Source: Showdown data/items.ts -- Sitrus Berry: heals 1/4 max HP at <= 50%
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.sitrusBerry, hp: 200, currentHp: 80 });
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 50,
      }),
    );
    expect(result.activated).toBe(true);
    // floor(200/4) = 50
    expect(result.effects).toContainEqual({ type: "heal", target: "self", value: 50 });
  });

  it("given Oran Berry post-damage HP <= 50%, when on-damage-taken triggers, then heals 10 HP", () => {
    // Source: Showdown data/items.ts -- Oran Berry: heals 10 HP
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.oranBerry, hp: 100, currentHp: 40 });
    const result = applyGen6HeldItem(
      itemTriggerIds.onDamageTaken,
      createItemContext({
        pokemon,
        damage: 30,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toContainEqual({ type: "heal", target: "self", value: 10 });
  });
});

// ===========================================================================
// On-hit items (attacker perspective)
// ===========================================================================

describe("Gen 6 Items -- Shell Bell", () => {
  it("given Shell Bell dealing 80 damage, when on-hit triggers, then heals 10 HP (floor(80/8))", () => {
    // Source: Showdown data/items.ts -- Shell Bell: heals 1/8 of damage dealt
    // Derivation: floor(80/8) = 10
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.shellBell, hp: 200, currentHp: 150 });
    const result = applyGen6HeldItem(
      itemTriggerIds.onHit,
      createItemContext({
        pokemon,
        damage: 80,
      }),
    );
    expect(result.activated).toBe(true);
    expect(result.effects).toEqual([{ type: "heal", target: "self", value: 10 }]);
  });

  it("given Shell Bell dealing 0 damage, when on-hit triggers, then does NOT activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.shellBell });
    const result = applyGen6HeldItem(itemTriggerIds.onHit, createItemContext({ pokemon, damage: 0 }));
    expect(result.activated).toBe(false);
  });
});

describe("Gen 6 Items -- King's Rock and Razor Fang flinch", () => {
  it("given King's Rock dealing damage with seed producing flinch, when on-hit triggers, then flinch effect fires", () => {
    // Source: Showdown data/items.ts -- King's Rock: 10% flinch on all damaging moves
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.kingsRock });
    const activatingResult = Array.from({ length: 100 }, (_, seed) =>
      applyGen6HeldItem(
        itemTriggerIds.onHit,
        createItemContext({
          pokemon,
          damage: 50,
          seed,
        }),
      ),
    ).find((result) => result.activated);
    expect(activatingResult).toBeDefined();
    expect(activatingResult?.effects).toContainEqual({ type: "flinch", target: "opponent" });
  });

  it("given Razor Fang dealing damage, when on-hit triggers with a flinch-producing seed, then flinch fires", () => {
    // Source: Showdown data/items.ts -- Razor Fang: 10% flinch on all damaging moves
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.razorFang });
    const activatingResult = Array.from({ length: 100 }, (_, seed) =>
      applyGen6HeldItem(
        itemTriggerIds.onHit,
        createItemContext({
          pokemon,
          damage: 50,
          seed,
        }),
      ),
    ).find((result) => result.activated);
    expect(activatingResult).toBeDefined();
    expect(activatingResult?.effects).toContainEqual({ type: "flinch", target: "opponent" });
  });
});

// ===========================================================================
// before-move: Metronome item
// ===========================================================================

describe("Gen 6 Items -- Metronome before-move", () => {
  it("given Metronome holding Pokemon, when before-move triggers with a move, then metronome-count volatile is set", () => {
    // Source: Showdown sim/items.ts -- Metronome item tracks consecutive-use counter
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.metronome });
    const move = flamethrowerMove;
    const result = applyGen6HeldItem(
      itemTriggerIds.beforeMove,
      createItemContext({
        pokemon,
        move,
      }),
    );
    // Metronome doesn't "activate" visibly, but sets the volatile
    expect(result.activated).toBe(false);
    // Verify volatile was set
    const vol = pokemon.volatileStatuses.get(metronomeCountVolatileId);
    expect(vol).toBeDefined();
    expect(vol?.data?.moveId).toBe(moveIds.flamethrower);
    expect(vol?.data?.count).toBe(1);
  });

  it("given Metronome with existing count for same move, when before-move triggers, then count increments", () => {
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(metronomeCountVolatileId, {
      turnsLeft: -1,
      data: { moveId: moveIds.flamethrower, count: 2 },
    });
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.metronome, volatiles });
    const move = flamethrowerMove;
    applyGen6HeldItem(itemTriggerIds.beforeMove, createItemContext({ pokemon, move }));
    const vol = pokemon.volatileStatuses.get(metronomeCountVolatileId);
    // Source: the existing metronome-count of 2 increments by 1 after reusing the same move.
    expect(vol?.data?.count).toBe(3);
  });

  it("given Metronome with existing count for DIFFERENT move, when before-move triggers, then count resets to 1", () => {
    const volatiles = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();
    volatiles.set(metronomeCountVolatileId, {
      turnsLeft: -1,
      data: { moveId: moveIds.flamethrower, count: 4 },
    });
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.metronome, volatiles });
    const move = iceBeamMove;
    applyGen6HeldItem(itemTriggerIds.beforeMove, createItemContext({ pokemon, move }));
    const vol = pokemon.volatileStatuses.get(metronomeCountVolatileId);
    expect(vol?.data?.moveId).toBe(moveIds.iceBeam);
    expect(vol?.data?.count).toBe(1);
  });
});

// ===========================================================================
// Unburden volatile
// ===========================================================================

describe("Gen 6 Items -- Unburden on item consumption", () => {
  it("given Unburden ability + consumed berry, when item triggers consume effect, then unburden volatile is set", () => {
    // Source: Showdown data/abilities.ts -- Unburden: sets volatile after item consumption
    const pokemon = createOnFieldPokemon({
      heldItem: itemIds.sitrusBerry,
      hp: 200,
      currentHp: 80,
      ability: abilityIds.unburden,
    });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(true);
    // Sitrus activates -> consume effect -> Unburden volatile should be set
    expect(pokemon.volatileStatuses.has(volatileIds.unburden)).toBe(true);
  });
});

// ===========================================================================
// Unknown trigger
// ===========================================================================

describe("Gen 6 Items -- Unknown trigger", () => {
  it("given a valid item, when an unknown trigger fires, then item does not activate", () => {
    const pokemon = createOnFieldPokemon({ heldItem: itemIds.leftovers });
    const result = applyGen6HeldItem("unknown-trigger", createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// No item
// ===========================================================================

describe("Gen 6 Items -- No held item", () => {
  it("given no held item, when any trigger fires, then returns no activation", () => {
    const pokemon = createOnFieldPokemon({ heldItem: null });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Toxic Orb / Flame Orb type immunity
// ===========================================================================

describe("Gen 6 Items -- Toxic/Flame Orb type immunity", () => {
  it("given Toxic Orb on a Poison-type, when end-of-turn triggers, then does NOT activate (type immune to poison)", () => {
    // Source: Showdown -- Poison and Steel types immune to poisoning
    const pokemon = createOnFieldPokemon({
      heldItem: itemIds.toxicOrb,
      types: [typeIds.poison],
    });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given Toxic Orb on a Steel-type, when end-of-turn triggers, then does NOT activate", () => {
    const pokemon = createOnFieldPokemon({
      heldItem: itemIds.toxicOrb,
      types: [typeIds.steel],
    });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });

  it("given Flame Orb on a Fire-type, when end-of-turn triggers, then does NOT activate (type immune to burn)", () => {
    // Source: Showdown -- Fire types immune to burn
    const pokemon = createOnFieldPokemon({
      heldItem: itemIds.flameOrb,
      types: [typeIds.fire],
    });
    const result = applyGen6HeldItem(itemTriggerIds.endOfTurn, createItemContext({ pokemon }));
    expect(result.activated).toBe(false);
  });
});
