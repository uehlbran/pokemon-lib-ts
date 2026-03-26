import type { ActivePokemon, BattleSide, BattleState, ItemContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN7_ABILITY_IDS,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_NATURE_IDS,
  GEN7_SPECIES_IDS,
} from "../src";
import { createGen7DataManager } from "../src/data";
import {
  applyGen7HeldItem,
  getPinchBerryThreshold,
  getSpeciesZMoves,
  getTypedZMoves,
  getZCrystalType,
  hasTerrainExtender,
  isMegaStone,
  isSpeciesZCrystal,
  isZCrystal,
  TERRAIN_EXTENDER_ITEM_ID,
} from "../src/Gen7Items";

const GEN7_DATA = createGen7DataManager();
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const TYPE_IDS = CORE_TYPE_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const ITEM_TRIGGERS = CORE_ITEM_TRIGGER_IDS;
const DEFAULT_SPECIES = GEN7_DATA.getSpecies(GEN7_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE_ID = GEN7_DATA.getNature(GEN7_NATURE_IDS.hardy).id;
const DEFAULT_MOVE = GEN7_DATA.getMove(MOVE_IDS.tackle);
const NON_CONTACT_MOVE = GEN7_DATA.getMove(MOVE_IDS.thunderbolt);
const FIRE_MOVE = GEN7_DATA.getMove(MOVE_IDS.flamethrower);
const BASE_PINCH_BERRY_THRESHOLD = 0.25;
const GLUTTONY_PINCH_BERRY_THRESHOLD = 0.5;
const DEFAULT_POKEBALL = DEFAULT_SPECIES.pokeball;

// ---------------------------------------------------------------------------
// Helper factories (mirrors Gen6 items.test.ts pattern)
// ---------------------------------------------------------------------------

function createSyntheticPokemonInstance(overrides: {
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
}): ReturnType<typeof createPokemonInstance> {
  const species = GEN7_DATA.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const hp = overrides.hp ?? 200;
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(7), {
    nature: DEFAULT_NATURE_ID,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    friendship: createFriendship(species.baseFriendship),
    gender: CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    nickname: overrides.nickname ?? null,
    moves: [DEFAULT_MOVE.id],
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: DEFAULT_POKEBALL,
    isShiny: false,
  });
  pokemon.status = overrides.status ?? null;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.calculatedStats = {
    hp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };
  pokemon.ability = overrides.ability ?? ABILITY_IDS.none;
  return pokemon;
}

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
  const pokemon = createSyntheticPokemonInstance(overrides);
  const species = GEN7_DATA.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const active = createBattleOnFieldPokemon(pokemon, 0, [...(overrides.types ?? species.types)]);
  active.ability = pokemon.ability;
  active.volatileStatuses = overrides.volatiles ?? new Map();
  return active;
}

function createBattleSide(active: ActivePokemon, index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon],
    active: [active],
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

function createBattleState(overrides?: { sides?: [BattleSide, BattleSide] }): BattleState {
  const defaultLeft = createBattleSide(createOnFieldPokemon({}), 0);
  const defaultRight = createBattleSide(createOnFieldPokemon({}), 1);
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 7,
    turnNumber: 1,
    sides: overrides?.sides ?? [defaultLeft, defaultRight],
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

// ═══════════════════════════════════════════════════════════════════════════
// Z-Crystal Identification
// ═══════════════════════════════════════════════════════════════════════════

describe("Z-Crystal Identification", () => {
  describe("isZCrystal", () => {
    it("given a type-specific Z-Crystal, when checking isZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- normaliumz has zMove property
      expect(isZCrystal(ITEM_IDS.normaliumZ)).toBe(true);
    });

    it("given a second type-specific Z-Crystal, when checking isZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- firiumz has zMove property
      expect(isZCrystal(ITEM_IDS.firiumZ)).toBe(true);
    });

    it("given a species-specific Z-Crystal, when checking isZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- pikaniumz has zMove with zMoveFrom
      expect(isZCrystal(ITEM_IDS.pikaniumZ)).toBe(true);
    });

    it("given a non-Z-Crystal item, when checking isZCrystal, then returns false", () => {
      // Source: Showdown data/items.ts -- leftovers does not have zMove
      expect(isZCrystal(ITEM_IDS.leftovers)).toBe(false);
    });

    it("given another non-Z-Crystal item, when checking isZCrystal, then returns false", () => {
      // Source: Showdown data/items.ts -- choice-band does not have zMove
      expect(isZCrystal(ITEM_IDS.choiceBand)).toBe(false);
    });
  });

  describe("getZCrystalType", () => {
    it("given Firium Z, when getting Z-Crystal type, then returns fire", () => {
      // Source: Showdown data/items.ts -- firiumz.zMoveType = 'Fire'
      expect(getZCrystalType(ITEM_IDS.firiumZ)).toBe(TYPE_IDS.fire);
    });

    it("given the Electric typed Z-Crystal, when getting Z-Crystal type, then returns electric", () => {
      // Source: Showdown data/items.ts -- electriumz.zMoveType = 'Electric'
      expect(getZCrystalType(ITEM_IDS.electriumZ)).toBe(TYPE_IDS.electric);
    });

    it("given a species-specific Z-Crystal, when getting type, then returns null", () => {
      // Source: Showdown data/items.ts -- species Z-Crystals don't have zMoveType
      expect(getZCrystalType(ITEM_IDS.pikaniumZ)).toBeNull();
    });

    it("given a non-Z-Crystal item, when getting type, then returns null", () => {
      // Source: Showdown data/items.ts -- non-Z items have no zMoveType property
      expect(getZCrystalType(ITEM_IDS.leftovers)).toBeNull();
    });
  });

  describe("isSpeciesZCrystal", () => {
    it("given Pikanium Z, when checking isSpeciesZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- pikaniumz.zMoveFrom = 'Volt Tackle'
      expect(isSpeciesZCrystal(ITEM_IDS.pikaniumZ)).toBe(true);
    });

    it("given a species-specific Z-Crystal with zMoveFrom metadata, when checking isSpeciesZCrystal, then returns true", () => {
      // Source: Showdown data/items.ts -- marshadiumz.zMoveFrom = 'Spectral Thief'
      expect(isSpeciesZCrystal(ITEM_IDS.marshadiumZ)).toBe(true);
    });

    it("given a type-specific Z-Crystal, when checking isSpeciesZCrystal, then returns false", () => {
      // Source: Showdown data/items.ts -- normaliumz has zMoveType, not zMoveFrom
      expect(isSpeciesZCrystal(ITEM_IDS.normaliumZ)).toBe(false);
    });

    it("given a non-Z-Crystal item, when checking isSpeciesZCrystal, then returns false", () => {
      expect(isSpeciesZCrystal(ITEM_IDS.lifeOrb)).toBe(false);
    });
  });

  describe("getTypedZMoves", () => {
    it("given the typed Z-Move map, when counting entries, then has exactly 18 entries", () => {
      // Source: Showdown data/items.ts -- 18 typed Z-Crystals (one per type)
      const map = getTypedZMoves();
      expect(Object.keys(map).length).toBe(18);
    });

    it("given the typed Z-Move map, when checking Fairium Z, then maps to fairy", () => {
      // Source: Showdown data/items.ts -- fairiumz.zMoveType = 'Fairy'
      const map = getTypedZMoves();
      expect(map[ITEM_IDS.fairiumZ]).toBe(TYPE_IDS.fairy);
    });
  });

  describe("getSpeciesZMoves", () => {
    it("given the species Z-Move map, when counting entries, then has 17 entries", () => {
      // Source: Showdown data/items.ts -- 17 species-specific Z-Crystals in Gen 7
      const map = getSpeciesZMoves();
      expect(Object.keys(map).length).toBe(17);
    });

    it("given the species Z-Move map, when checking Pikanium Z, then maps to Catastropika", () => {
      // Source: Showdown data/items.ts -- pikaniumz.zMove = 'Catastropika'
      const map = getSpeciesZMoves();
      expect(map[ITEM_IDS.pikaniumZ]).toBe("catastropika");
    });

    it("given the species Z-Move map, when checking Ultra Necrozium Z, then maps to Light That Burns the Sky", () => {
      // Source: Showdown data/items.ts -- ultranecroziumz.zMove = 'Light That Burns the Sky'
      const map = getSpeciesZMoves();
      expect(map[ITEM_IDS.ultranecroziumZ]).toBe("light-that-burns-the-sky");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Terrain Extender
// ═══════════════════════════════════════════════════════════════════════════

describe("Terrain Extender", () => {
  it("given a Pokemon holding the terrain-duration extender item, when checking hasTerrainExtender, then returns true", () => {
    // Source: Showdown data/items.ts -- terrainextender: extends terrain from 5 to 8 turns
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.terrainExtender });
    expect(hasTerrainExtender(pokemon)).toBe(true);
  });

  it("given a Pokemon holding Leftovers, when checking hasTerrainExtender, then returns false", () => {
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.leftovers });
    expect(hasTerrainExtender(pokemon)).toBe(false);
  });

  it("given the terrain-duration extender item ID constant, when checked, then matches the owned constant", () => {
    // Source: Showdown data/items.ts -- item ID maps to the owned Terrain Extender constant
    expect(TERRAIN_EXTENDER_ITEM_ID).toBe(ITEM_IDS.terrainExtender);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mega Stone check
// ═══════════════════════════════════════════════════════════════════════════

describe("isMegaStone", () => {
  it("given venusaurite, when checking isMegaStone, then returns true", () => {
    // Source: Showdown data/items.ts -- mega stones end in 'ite'
    expect(isMegaStone(ITEM_IDS.venusaurite)).toBe(true);
  });

  it("given eviolite, when checking isMegaStone, then returns false", () => {
    // Source: Bulbapedia "Eviolite" -- boosts defenses of unevolved Pokemon, not a Mega Stone
    expect(isMegaStone(ITEM_IDS.eviolite)).toBe(false);
  });

  it("given empty string, when checking isMegaStone, then returns false", () => {
    expect(isMegaStone("")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Suppression: Klutz and Embargo
// ═══════════════════════════════════════════════════════════════════════════

describe("Item Suppression", () => {
  it("given a Pokemon with Klutz holding Leftovers, when end of turn fires, then item does not activate", () => {
    // Source: Bulbapedia -- Klutz: "The Pokemon can't use any held items"
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.leftovers,
      ability: ABILITY_IDS.klutz,
      currentHp: 100,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon under Embargo holding Leftovers, when end of turn fires, then item does not activate", () => {
    // Source: Bulbapedia -- Embargo: "prevents the target from using its held item"
    const volatiles = new Map([[VOLATILE_IDS.embargo, { turnsLeft: 3 }]]);
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.leftovers,
      currentHp: 100,
      volatiles,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// End-of-Turn Items
// ═══════════════════════════════════════════════════════════════════════════

describe("End-of-Turn Items", () => {
  describe("Leftovers", () => {
    it("given a Pokemon with 400 max HP holding Leftovers, when end of turn fires, then heals 25 HP (floor(400/16))", () => {
      // Source: Showdown data/items.ts -- Leftovers: floor(maxHP / 16)
      // 400 / 16 = 25
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.leftovers,
        hp: 400,
        currentHp: 300,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 25 }]);
    });

    it("given a Pokemon with 100 max HP holding Leftovers, when end of turn fires, then heals 6 HP (floor(100/16))", () => {
      // Source: Showdown data/items.ts -- Leftovers: floor(maxHP / 16)
      // 100 / 16 = 6.25, floor = 6
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.leftovers,
        hp: 100,
        currentHp: 50,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 6 }]);
    });
  });

  describe("Black Sludge", () => {
    it("given a Poison-type Pokemon with 400 HP holding Black Sludge, when end of turn fires, then heals 25 HP", () => {
      // Source: Showdown data/items.ts -- Black Sludge: Poison types heal 1/16 max HP
      // 400 / 16 = 25
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.blackSludge,
        hp: 400,
        currentHp: 300,
        types: [TYPE_IDS.poison],
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "heal", target: "self", value: 25 }]);
    });

    it("given a non-Poison-type Pokemon with 400 HP holding Black Sludge, when end of turn fires, then takes 50 damage (floor(400/8))", () => {
      // Source: Showdown data/items.ts -- Black Sludge: non-Poison types take 1/8 max HP
      // 400 / 8 = 50
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.blackSludge,
        hp: 400,
        currentHp: 300,
        types: [TYPE_IDS.normal],
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([{ type: "chip-damage", target: "self", value: 50 }]);
    });
  });

  describe("Toxic Orb", () => {
    it("given a healthy Pokemon holding Toxic Orb, when end of turn fires, then inflicts the owned badly poisoned status", () => {
      // Source: Showdown data/items.ts -- Toxic Orb: inflicts badly-poisoned at end of turn
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.toxicOrb,
        types: [TYPE_IDS.normal],
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "inflict-status", target: "self", status: STATUS_IDS.badlyPoisoned },
      ]);
    });

    it("given a Poison-type holding Toxic Orb, when end of turn fires, then does not activate (type immunity)", () => {
      // Source: Showdown -- type immunity prevents Orb activation
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.toxicOrb,
        types: [TYPE_IDS.poison],
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Flame Orb", () => {
    it("given a healthy Pokemon holding Flame Orb, when end of turn fires, then inflicts burn", () => {
      // Source: Showdown data/items.ts -- Flame Orb: inflicts burn at end of turn
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.flameOrb,
        types: [TYPE_IDS.normal],
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects).toEqual([
        { type: "inflict-status", target: "self", status: STATUS_IDS.burn },
      ]);
    });

    it("given a Fire-type holding Flame Orb, when end of turn fires, then does not activate (type immunity)", () => {
      // Source: Showdown -- type immunity prevents Orb activation
      const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.flameOrb, types: [TYPE_IDS.fire] });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Sitrus Berry (end of turn)", () => {
    it("given a Pokemon at 50% HP holding Sitrus Berry, when end of turn fires, then heals 25% max HP and is consumed", () => {
      // Source: Showdown data/items.ts -- Sitrus Berry: heals 1/4 max HP at <= 50%
      // 400 / 4 = 100
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.sitrusBerry,
        hp: 400,
        currentHp: 200,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 100 });
      expect(result.effects[1]).toEqual({
        type: "consume",
        target: "self",
        value: ITEM_IDS.sitrusBerry,
      });
    });

    it("given a Pokemon above 50% HP holding Sitrus Berry, when end of turn fires, then does not activate", () => {
      // Source: Showdown data/items.ts -- Sitrus Berry threshold: <= 50%
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.sitrusBerry,
        hp: 400,
        currentHp: 201,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Lum Berry", () => {
    it("given a paralyzed Pokemon holding Lum Berry, when end of turn fires, then cures status and is consumed", () => {
      // Source: Showdown data/items.ts -- Lum Berry: cures any status + confusion
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.lumBerry,
        status: STATUS_IDS.paralysis,
      });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects.some((e) => e.type === "status-cure")).toBe(true);
      expect(result.effects.some((e) => e.type === "consume")).toBe(true);
    });

    it("given a healthy Pokemon holding Lum Berry, when end of turn fires, then does not activate", () => {
      const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lumBerry });
      const ctx = createItemContext({ pokemon });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// On-Damage-Taken Items
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Damage-Taken Items", () => {
  describe("Focus Sash (moved to capLethalDamage, #784)", () => {
    it("given a full-HP Pokemon holding Focus Sash taking a KO hit, when damage taken fires, then does NOT activate (handled by capLethalDamage now)", () => {
      // Focus Sash was moved from handleOnDamageTaken to capLethalDamage (pre-damage hook)
      // because handleOnDamageTaken fires post-damage, making currentHp === maxHp always false.
      // See: Gen7Ruleset.capLethalDamage and GitHub issue #784
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.focusSash,
        hp: 200,
        currentHp: 200,
      });
      const ctx = createItemContext({ pokemon, damage: 300 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });

    it("given a non-full-HP Pokemon holding Focus Sash taking a KO hit, when damage taken fires, then does not activate", () => {
      // Source: Showdown data/items.ts -- Focus Sash only works at full HP
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.focusSash,
        hp: 200,
        currentHp: 199,
      });
      const ctx = createItemContext({ pokemon, damage: 300 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Assault Vest (status move block)", () => {
    it("given Assault Vest behavior, when checking for status block, then the item is handled in the damage calc (not here)", () => {
      // Source: Showdown data/items.ts -- Assault Vest: +50% SpDef is in damage calc;
      // status move block is in move validation, not item trigger. No damage taken effect.
      // This test just confirms the item handler does not crash for Assault Vest.
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.assaultVest,
        hp: 200,
        currentHp: 100,
      });
      const ctx = createItemContext({ pokemon, damage: 50 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      // Assault Vest does not have an damage taken trigger
      expect(result.activated).toBe(false);
    });
  });

  describe("Pinch Berries", () => {
    it("given a Pokemon at 25% HP holding Liechi Berry, when damage taken fires, then boosts Attack and is consumed", () => {
      // Source: Showdown data/items.ts -- Liechi Berry: +1 Atk at <= 25% HP
      // 400 * 0.25 = 100, currentHp 100 <= 100 triggers
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.liechiBerry,
        hp: 400,
        currentHp: 100,
      });
      const ctx = createItemContext({ pokemon, damage: 100 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({
        type: "stat-boost",
        target: "self",
        value: "attack",
      });
      expect(result.effects[1]).toEqual({
        type: "consume",
        target: "self",
        value: ITEM_IDS.liechiBerry,
      });
    });

    it("given a Pokemon at 26% HP holding Liechi Berry, when damage taken fires, then does not activate", () => {
      // 400 * 0.25 = 100, currentHp 101 > 100, no trigger
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.liechiBerry,
        hp: 400,
        currentHp: 101,
      });
      const ctx = createItemContext({ pokemon, damage: 50 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// On-Contact Items
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Contact Items", () => {
  describe("Rocky Helmet", () => {
    it("given a defender holding Rocky Helmet hit by a contact move, when contact fires, then deals 1/6 attacker's max HP", () => {
      // Source: Showdown data/items.ts -- Rocky Helmet: floor(attacker.baseMaxhp / 6)
      // Attacker max HP = 300, 300 / 6 = 50
      const defender = createOnFieldPokemon({
        heldItem: ITEM_IDS.rockyHelmet,
        hp: 200,
        currentHp: 200,
      });
      const attacker = createOnFieldPokemon({ hp: 300, currentHp: 300 });
      const state = createBattleState({
        sides: [
          { active: [defender], team: [defender.pokemon] },
          { active: [attacker], team: [attacker.pokemon] },
        ],
      });
      const move = DEFAULT_MOVE;
      const ctx = createItemContext({ pokemon: defender, state, move, damage: 50 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onContact, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "opponent", value: 50 });
    });

    it("given a defender holding Rocky Helmet hit by a non-contact move, when contact fires, then does not activate", () => {
      // Source: Showdown data/items.ts -- Rocky Helmet only triggers on contact
      const defender = createOnFieldPokemon({ heldItem: ITEM_IDS.rockyHelmet });
      const move = NON_CONTACT_MOVE;
      const ctx = createItemContext({ pokemon: defender, move, damage: 50 });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onContact, ctx);
      expect(result.activated).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// On-Hit Items (attacker perspective)
// ═══════════════════════════════════════════════════════════════════════════

describe("On-Hit Items", () => {
  describe("Life Orb", () => {
    it("given a Pokemon with 200 max HP holding Life Orb dealing damage, when hit fires, then takes 20 HP recoil (floor(200/10))", () => {
      // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10) recoil
      // 200 / 10 = 20
      const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lifeOrb, hp: 200, currentHp: 200 });
      const ctx = createItemContext({ pokemon, damage: 80, move: DEFAULT_MOVE });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 20 });
    });

    it("given a Pokemon with 150 max HP holding Life Orb dealing damage, when hit fires, then takes 15 HP recoil (floor(150/10))", () => {
      // Source: Showdown data/items.ts -- Life Orb: floor(maxHP / 10) recoil
      // 150 / 10 = 15
      const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.lifeOrb, hp: 150, currentHp: 150 });
      const ctx = createItemContext({ pokemon, damage: 60, move: DEFAULT_MOVE });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "chip-damage", target: "self", value: 15 });
    });

    it("given a Pokemon with Sheer Force using a move with secondary effect, when hit fires with Life Orb, then no recoil", () => {
      // Source: Showdown scripts.ts -- Sheer Force suppresses Life Orb recoil
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.lifeOrb,
        hp: 200,
        ability: ABILITY_IDS.sheerForce,
      });
      const move = NON_CONTACT_MOVE;
      const ctx = createItemContext({ pokemon, damage: 80, move });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(false);
    });
  });

  describe("Shell Bell", () => {
    it("given a Pokemon holding Shell Bell dealing 80 damage, when hit fires, then heals 10 HP (floor(80/8))", () => {
      // Source: Showdown data/items.ts -- Shell Bell: heals floor(damageDealt / 8)
      // 80 / 8 = 10
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.shellBell,
        hp: 200,
        currentHp: 150,
      });
      const ctx = createItemContext({ pokemon, damage: 80, move: DEFAULT_MOVE });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
    });

    it("given a Pokemon holding Shell Bell dealing 160 damage, when hit fires, then heals 20 HP (floor(160/8))", () => {
      // Source: Showdown data/items.ts -- Shell Bell: floor(damageDealt / 8)
      // 160 / 8 = 20
      const pokemon = createOnFieldPokemon({
        heldItem: ITEM_IDS.shellBell,
        hp: 200,
        currentHp: 100,
      });
      const ctx = createItemContext({ pokemon, damage: 160, move: DEFAULT_MOVE });
      const result = applyGen7HeldItem(ITEM_TRIGGERS.onHit, ctx);
      expect(result.activated).toBe(true);
      expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 20 });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gluttony / Pinch Berry Threshold
// ═══════════════════════════════════════════════════════════════════════════

describe("getPinchBerryThreshold", () => {
  it("given a Pokemon with Gluttony, when checking the base pinch berry threshold, then returns the Gluttony threshold", () => {
    // Source: Bulbapedia -- Gluttony changes pinch berry threshold from 25% to 50%
    expect(
      getPinchBerryThreshold({ ability: ABILITY_IDS.gluttony }, BASE_PINCH_BERRY_THRESHOLD),
    ).toBe(GLUTTONY_PINCH_BERRY_THRESHOLD);
  });

  it("given a Pokemon without Gluttony, when checking the base pinch berry threshold, then returns the unchanged threshold", () => {
    // Source: Showdown data/items.ts -- pinch berries use a 25% threshold without Gluttony
    expect(getPinchBerryThreshold({ ability: ABILITY_IDS.none }, BASE_PINCH_BERRY_THRESHOLD)).toBe(
      BASE_PINCH_BERRY_THRESHOLD,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Type Resist Berry (damage taken via damage calc)
// ═══════════════════════════════════════════════════════════════════════════

describe("Type Resist Berry (Occa Berry)", () => {
  it("given a Pokemon with Occa Berry, when applyGen7HeldItem is called damage taken, then NO_ACTIVATION is returned (handled in damage calc)", () => {
    // Type-resist berries (Occa, Passho, Wacan, Rindo, Yache, Chople, Kebia, Shuca, Coba,
    // Payapa, Tanga, Charti, Kasib, Haban, Colbur, Babiri, Chilan, Roseli) activate at the
    // pre-damage modifier stage inside Gen7DamageCalc.ts -- NOT in applyGen7HeldItem.
    // Source: Showdown data/items.ts -- Occa Berry: onSourceModifyDamage halves SE Fire damage
    // Source: Showdown sim/battle-actions.ts -- item modifiers run before final damage is applied
    // This test verifies the design: applyGen7HeldItem does NOT activate Occa Berry damage taken.
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.occaBerry, hp: 200, currentHp: 100 });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given a non-fire move hitting an Occa Berry holder, when applyGen7HeldItem is called damage taken, then NO_ACTIVATION is returned", () => {
    // Occa Berry should not activate even for non-fire hits (handled in damage calc only).
    // Source: Showdown data/items.ts -- Occa Berry only activates for Fire moves in damage calc
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.occaBerry, hp: 200, currentHp: 50 });
    const ctx = createItemContext({ pokemon, damage: 30 });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Unburden volatile integration
// ═══════════════════════════════════════════════════════════════════════════

describe("Unburden integration", () => {
  it("given a Pokemon with Unburden consuming a Sitrus Berry, when end of turn fires, then unburden volatile is set", () => {
    // Source: Bulbapedia -- Unburden: doubles Speed when held item is consumed
    // Source: Showdown data/abilities.ts -- Unburden onAfterUseItem
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.sitrusBerry,
      hp: 200,
      currentHp: 100,
      ability: ABILITY_IDS.unburden,
    });
    const ctx = createItemContext({ pokemon });
    applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(pokemon.volatileStatuses.has(ABILITY_IDS.unburden)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Status Cure Berries
// ═══════════════════════════════════════════════════════════════════════════

describe("Status Cure Berries", () => {
  it("given a paralyzed Pokemon holding Cheri Berry, when end of turn fires, then cures paralysis and is consumed", () => {
    // Source: Showdown data/items.ts -- Cheri Berry cures paralysis
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.cheriBerry,
      status: STATUS_IDS.paralysis,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
    expect(result.effects[1]).toEqual({
      type: "consume",
      target: "self",
      value: ITEM_IDS.cheriBerry,
    });
  });

  it("given a sleeping Pokemon holding Chesto Berry, when end of turn fires, then cures sleep and is consumed", () => {
    // Source: Showdown data/items.ts -- Chesto Berry cures sleep
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.chestoBerry,
      status: STATUS_IDS.sleep,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a poisoned Pokemon holding Pecha Berry, when end of turn fires, then cures poison and is consumed", () => {
    // Source: Showdown data/items.ts -- Pecha Berry cures poison
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.pechaBerry,
      status: STATUS_IDS.poison,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a burned Pokemon holding Rawst Berry, when end of turn fires, then cures burn and is consumed", () => {
    // Source: Showdown data/items.ts -- Rawst Berry cures burn
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.rawstBerry,
      status: STATUS_IDS.burn,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a frozen Pokemon holding Aspear Berry, when end of turn fires, then cures freeze and is consumed", () => {
    // Source: Showdown data/items.ts -- Aspear Berry cures freeze
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.aspearBerry,
      status: STATUS_IDS.freeze,
    });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "status-cure", target: "self" });
  });

  it("given a confused Pokemon holding Persim Berry, when end of turn fires, then cures confusion and is consumed", () => {
    // Source: Showdown data/items.ts -- Persim Berry cures confusion
    const volatiles = new Map([[VOLATILE_IDS.confusion, { turnsLeft: 3 }]]);
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.persimBerry, volatiles });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "volatile-cure",
      target: "self",
      value: VOLATILE_IDS.confusion,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No-item guard
// ═══════════════════════════════════════════════════════════════════════════

describe("No-item guard", () => {
  it("given a Pokemon with no held item, when any trigger fires, then returns no activation", () => {
    const pokemon = createOnFieldPokemon({ heldItem: null });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Weakness Policy
// ═══════════════════════════════════════════════════════════════════════════

describe("Weakness Policy", () => {
  it("given a Grass-type Pokemon hit by a super-effective Fire move holding Weakness Policy, when damage taken fires, then boosts Atk and SpAtk by 2 and consumes", () => {
    // Source: Showdown data/items.ts -- Weakness Policy: +2 Atk/SpAtk on SE hit
    // Source: Bulbapedia "Weakness Policy" -- triggered by super-effective damage
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.weaknessPolicy,
      types: [TYPE_IDS.grass],
      hp: 200,
      currentHp: 100,
    });
    const move = FIRE_MOVE;
    const ctx = createItemContext({ pokemon, move, damage: 80 });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "attack",
      stages: 2,
    });
    expect(result.effects[1]).toEqual({
      type: "stat-boost",
      target: "self",
      value: "spAttack",
      stages: 2,
    });
    expect(result.effects[2]).toEqual({
      type: "consume",
      target: "self",
      value: ITEM_IDS.weaknessPolicy,
    });
  });

  it("given a Normal-type Pokemon hit by a neutral Fire move holding Weakness Policy, when damage taken fires, then does not activate", () => {
    // Normal takes 1x from Fire -- not super effective, no trigger
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.weaknessPolicy,
      types: [TYPE_IDS.normal],
      hp: 200,
      currentHp: 100,
    });
    const move = FIRE_MOVE;
    const ctx = createItemContext({ pokemon, move, damage: 80 });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Air Balloon
// ═══════════════════════════════════════════════════════════════════════════

describe("Air Balloon", () => {
  it("given a Pokemon holding Air Balloon hit by any damaging move, when damage taken fires, then balloon pops (consumed)", () => {
    // Source: Showdown data/items.ts -- Air Balloon: pops on any damaging hit
    const pokemon = createOnFieldPokemon({
      heldItem: ITEM_IDS.airBalloon,
      hp: 200,
      currentHp: 150,
    });
    const ctx = createItemContext({ pokemon, damage: 50 });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      type: "consume",
      target: "self",
      value: ITEM_IDS.airBalloon,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Oran Berry
// ═══════════════════════════════════════════════════════════════════════════

describe("Oran Berry", () => {
  it("given a Pokemon at 50% HP holding Oran Berry, when end of turn fires, then heals exactly 10 HP", () => {
    // Source: Showdown data/items.ts -- Oran Berry: restores 10 HP (fixed, not %)
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.oranBerry, hp: 200, currentHp: 100 });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({ type: "heal", target: "self", value: 10 });
  });

  it("given a Pokemon at 51% HP holding Oran Berry, when end of turn fires, then does not activate", () => {
    // 200 / 2 = 100, currentHp 101 > 100
    const pokemon = createOnFieldPokemon({ heldItem: ITEM_IDS.oranBerry, hp: 200, currentHp: 101 });
    const ctx = createItemContext({ pokemon });
    const result = applyGen7HeldItem(ITEM_TRIGGERS.endOfTurn, ctx);
    expect(result.activated).toBe(false);
  });
});
