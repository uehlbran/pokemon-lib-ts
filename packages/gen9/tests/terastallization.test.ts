import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src";
import { GEN9_ITEM_IDS, GEN9_MOVE_IDS, GEN9_NATURE_IDS, GEN9_SPECIES_IDS } from "../src/data";
import { calculateTeraStab, Gen9Terastallization } from "../src/Gen9Terastallization";

const dataManager = createGen9DataManager();
const I = GEN9_ITEM_IDS;
const M = GEN9_MOVE_IDS;
const N = GEN9_NATURE_IDS;
const SP = GEN9_SPECIES_IDS;
const C = CORE_ABILITY_IDS;
const STELLAR_TERA_TYPE = "stellar" as PokemonType;
const T = CORE_TYPE_IDS;
const DEFAULT_SPECIES_ID = SP.charizard;
const DEFAULT_POKEBALL = I.pokeBall;
const DEFAULT_NATURE = N.hardy;
const DEFAULT_LEVEL = 50;
const DEFAULT_RNG = new SeededRandom(9);

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function getCanonicalMove(moveId: string) {
  return dataManager.getMove(moveId);
}

/**
 * Create a battle-ready PokemonInstance from owned Gen 9 data.
 * Touched tests should use this instead of hand-writing canonical fields.
 */
function createPokemonInstanceForTest(overrides: {
  speciesId?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  nature?: string;
  pokeball?: string;
  moves?: string[];
  teraType?: PokemonType;
  terastallized?: boolean;
  teraTypes?: PokemonType[];
  teraOriginalTypes?: PokemonType[];
  stellarBoostedTypes?: PokemonType[];
  calculatedStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): PokemonInstance {
  const speciesId = overrides.speciesId ?? DEFAULT_SPECIES_ID;
  const species = dataManager.getSpecies(speciesId);
  const instance = createPokemonInstance(species, DEFAULT_LEVEL, DEFAULT_RNG, {
    nature: overrides.nature ?? DEFAULT_NATURE,
    pokeball: overrides.pokeball ?? DEFAULT_POKEBALL,
    moves: overrides.moves ?? [M.tackle],
    heldItem: overrides.heldItem ?? null,
    nickname: null,
    friendship: 70,
    metLocation: T.testSource,
    originalTrainer: "Test",
    originalTrainerId: 0,
  });

  instance.ability = overrides.ability ?? instance.ability;
  instance.currentHp = instance.calculatedStats?.hp ?? 200;

  if (overrides.teraType !== undefined) {
    instance.teraType = overrides.teraType;
  } else {
    delete instance.teraType;
  }

  if (overrides.calculatedStats) {
    instance.calculatedStats = { ...overrides.calculatedStats };
  }

  if (overrides.terastallized !== undefined) {
    instance.terastallized = overrides.terastallized;
  }
  if (overrides.teraTypes) {
    instance.teraTypes = [...overrides.teraTypes];
  }
  if (overrides.teraOriginalTypes) {
    instance.teraOriginalTypes = [...overrides.teraOriginalTypes];
  }
  if (overrides.stellarBoostedTypes) {
    instance.stellarBoostedTypes = [...overrides.stellarBoostedTypes];
  }

  return instance;
}

function createOnFieldPokemon(overrides: {
  speciesId?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  teraType?: PokemonType;
  terastallized?: boolean;
  teraTypes?: PokemonType[];
  teraOriginalTypes?: PokemonType[];
  stellarBoostedTypes?: PokemonType[];
  calculatedStats?: {
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}): ActivePokemon {
  const pokemon = createPokemonInstanceForTest(overrides);
  const species = dataManager.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const resolvedTypes = overrides.types ?? [...species.types];

  return createBattleOnFieldPokemon(pokemon, 0, resolvedTypes);
}

function createBattleSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: { id: T.testSource, displayName: "Test", trainerClass: "Trainer" },
    team: [],
    active: [],
    screens: [],
    hazards: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
  } as unknown as BattleSide;
}

function createBattleState(): BattleState {
  return {
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 9,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — canUse()
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization canUse()", () => {
  const tera = new Gen9Terastallization();

  it("given a fresh battle with no gimmick used, when canUse is called with a Pokemon that has a teraType, then returns true", () => {
    // Source: Showdown sim/battle.ts -- Tera is available when side hasn't used gimmick
    const pokemon = createOnFieldPokemon({ teraType: T.fire, types: [T.fire, T.flying] });
    const side = createBattleSide();
    const state = createBattleState();
    expect(tera.canUse(pokemon, side, state)).toBe(true);
  });

  it("given a battle where gimmickUsed is true, when canUse is called, then returns false", () => {
    // Source: Showdown sim/battle.ts -- one gimmick per side per battle
    const pokemon = createOnFieldPokemon({ teraType: T.fire, types: [T.fire, T.flying] });
    const side = createBattleSide();
    side.gimmickUsed = true;
    const state = createBattleState();
    expect(tera.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon without a teraType, when canUse is called, then returns false", () => {
    // Source: Showdown sim/battle.ts -- Pokemon must have a Tera Type assigned
    const pokemon = createOnFieldPokemon({ types: [T.fire, T.flying] }); // no teraType
    const side = createBattleSide();
    const state = createBattleState();
    expect(tera.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Pokemon already terastallized, when canUse is called, then returns false", () => {
    // Source: Showdown sim/battle.ts -- can't Tera if already Tera'd
    const pokemon = createOnFieldPokemon({
      teraType: T.fire,
      types: [T.fire],
      terastallized: true,
    });
    const side = createBattleSide();
    const state = createBattleState();
    expect(tera.canUse(pokemon, side, state)).toBe(false);
  });

  it("given a Water-type Pokemon with Electric teraType, when canUse is called, then returns true", () => {
    // Source: Showdown sim/battle.ts -- Tera Type can differ from original types
    const pokemon = createOnFieldPokemon({ teraType: T.electric, types: [T.water] });
    const side = createBattleSide();
    const state = createBattleState();
    expect(tera.canUse(pokemon, side, state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — activate()
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization activate()", () => {
  const tera = new Gen9Terastallization();

  it("given a Water/Flying Gyarados with Water teraType, when activate is called, then sets correct state and emits event", () => {
    // Source: Bulbapedia "Terastallization" -- type changes to Tera Type
    // Source: Showdown sim/battle.ts -- terastallize activation sets isTerastallized, teraType, types
    const pokemon = createOnFieldPokemon({ teraType: T.water, types: [T.water, T.flying] });
    pokemon.pokemon.uid = "gyarados-1";
    const side = createBattleSide();
    const state = createBattleState();

    const events = tera.activate(pokemon, side, state);

    // State mutations
    expect(pokemon.isTerastallized).toBe(true);
    expect(pokemon.teraType).toBe(T.water);
    expect(pokemon.types).toEqual([T.water]); // Single type defensively
    expect(side.gimmickUsed).toBe(true);

    // Event
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      type: "terastallize",
      side: 0,
      pokemon: "gyarados-1",
      teraType: T.water,
    });
  });

  it("given a Fire/Flying Charizard with Grass teraType, when activate is called, then defensive types become [grass]", () => {
    // Source: Showdown sim/pokemon.ts -- defensive typing becomes the single Tera type
    const pokemon = createOnFieldPokemon({ teraType: T.grass, types: [T.fire, T.flying] });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    expect(pokemon.isTerastallized).toBe(true);
    expect(pokemon.teraType).toBe(T.grass);
    expect(pokemon.types).toEqual([T.grass]);
  });

  it("given a Pokemon with Stellar teraType, when activate is called, then defensive types are unchanged (retains original defensive types)", () => {
    // Source: Showdown sim/pokemon.ts -- Stellar Tera retains original defensive types
    // Source: specs/battle/10-gen9.md -- "Stellar retains original types defensively"
    const pokemon = createOnFieldPokemon({
      teraType: STELLAR_TERA_TYPE,
      types: [T.fire, T.flying],
    });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    expect(pokemon.isTerastallized).toBe(true);
    expect(pokemon.teraType).toBe(STELLAR_TERA_TYPE);
    expect(pokemon.types).toEqual([T.fire, T.flying]); // Unchanged
  });

  it("given activate is called, then persistence fields are set on PokemonInstance for switch survival", () => {
    // Source: Gen 9 game mechanic -- Tera persists through switches
    // Source: Showdown sim/battle-actions.ts:1770-1785 -- teraTypes stores pre-Tera typing
    const pokemon = createOnFieldPokemon({ teraType: T.water, types: [T.water, T.flying] });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    expect(pokemon.pokemon.terastallized).toBe(true);
    expect(pokemon.pokemon.teraOriginalTypes).toEqual([T.water, T.flying]); // Pre-Tera types for STAB calc
  });

  it("given activate is called on side 1, when emitting event, then event has correct side index", () => {
    // Source: BattleEvent spec -- side field identifies which side activated the gimmick
    const pokemon = createOnFieldPokemon({ teraType: T.electric, types: [T.electric] });
    const side = createBattleSide(1);
    const state = createBattleState();

    const events = tera.activate(pokemon, side, state);

    expect(events[0]).toMatchObject({ side: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — modifyMove() (Tera Blast)
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization modifyMove()", () => {
  const tera = new Gen9Terastallization();

  it("given a non-terastallized Pokemon using Tera Blast, when modifyMove is called, then move is unchanged", () => {
    // Source: Showdown data/moves.ts:19919-19955 -- Tera Blast is Normal/Special when not Tera'd
    const pokemon = createOnFieldPokemon({ speciesId: SP.charizard });
    const move = getCanonicalMove(M.teraBlast);

    const result = tera.modifyMove(move, pokemon);

    expect(result.type).toBe(T.normal);
    expect(result.category).toBe(CORE_MOVE_CATEGORIES.special);
    expect(result.power).toBe(80);
  });

  it("given a non-Tera Blast move, when modifyMove is called, then move is unchanged regardless of Tera state", () => {
    // Source: Showdown data/moves.ts -- only Tera Blast is modified by the gimmick
    const pokemon = createOnFieldPokemon({
      teraType: T.fire,
      types: [T.fire],
      terastallized: true,
    });
    const move = getCanonicalMove(M.flamethrower);

    const result = tera.modifyMove(move, pokemon);

    expect(result).toBe(move); // Same reference, unchanged
  });

  it("given a Fire-Tera Pokemon with Atk > SpA using Tera Blast, when modifyMove is called, then type is fire and category is physical", () => {
    // Source: Showdown data/moves.ts:19930-19940 -- physical if Atk > SpA
    const pokemon = createOnFieldPokemon({
      teraType: T.fire,
      types: [T.fire],
      terastallized: true,
      calculatedStats: {
        hp: 200,
        attack: 120,
        defense: 100,
        spAttack: 80,
        spDefense: 100,
        speed: 100,
      },
    });
    const move = getCanonicalMove(M.teraBlast);

    const result = tera.modifyMove(move, pokemon);

    expect(result.type).toBe(T.fire);
    expect(result.category).toBe(CORE_MOVE_CATEGORIES.physical);
  });

  it("given a Water-Tera Pokemon with SpA > Atk using Tera Blast, when modifyMove is called, then type is water and category is special", () => {
    // Source: Showdown data/moves.ts:19930-19940 -- special if SpA >= Atk
    const pokemon = createOnFieldPokemon({
      teraType: T.water,
      types: [T.water],
      terastallized: true,
      calculatedStats: {
        hp: 200,
        attack: 80,
        defense: 100,
        spAttack: 120,
        spDefense: 100,
        speed: 100,
      },
    });
    const move = getCanonicalMove(M.teraBlast);

    const result = tera.modifyMove(move, pokemon);

    expect(result.type).toBe(T.water);
    expect(result.category).toBe(CORE_MOVE_CATEGORIES.special);
  });

  it("given a Stellar-Tera Pokemon using Tera Blast, when modifyMove is called, then base power is 100", () => {
    // Source: Showdown data/moves.ts:19919-19955 -- Stellar Tera Blast has 100 BP
    const pokemon = createOnFieldPokemon({
      teraType: STELLAR_TERA_TYPE,
      types: [T.fire, T.flying],
      terastallized: true,
    });
    const move = getCanonicalMove(M.teraBlast);

    const result = tera.modifyMove(move, pokemon);

    expect(result.power).toBe(100);
  });

  it("given a Tera'd Pokemon with equal Atk and SpA using Tera Blast, when modifyMove is called, then category remains special", () => {
    // Source: Showdown data/moves.ts -- physical only if atk > spa (strict greater than)
    const pokemon = createOnFieldPokemon({
      teraType: T.ice,
      types: [T.ice],
      terastallized: true,
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    });
    const move = getCanonicalMove(M.teraBlast);

    const result = tera.modifyMove(move, pokemon);

    expect(result.category).toBe(CORE_MOVE_CATEGORIES.special);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — Persistence through switches
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization persistence through switches", () => {
  const tera = new Gen9Terastallization();

  it("given a Terastallized Water-Tera Gyarados, when switched out and back in via createActivePokemon, then isTerastallized and teraType are restored", () => {
    // Source: Gen 9 game mechanic -- Terastallization persists through switches
    // Source: Showdown sim/pokemon.ts -- forme/tera state restored on sendOut
    const pokemon = createPokemonInstanceForTest({
      speciesId: SP.gyarados,
      ability: C.intimidate,
      teraType: T.water,
    });

    // Simulate switch-in
    const active1 = createBattleOnFieldPokemon(pokemon, 0, [
      ...dataManager.getSpecies(SP.gyarados).types,
    ]);
    expect(active1.isTerastallized).toBe(false);

    // Terastallize
    const side = createBattleSide();
    const state = createBattleState();
    tera.activate(active1, side, state);
    expect(active1.isTerastallized).toBe(true);
    expect(active1.teraType).toBe(T.water);
    expect(active1.types).toEqual([T.water]);

    // Simulate switch-out and switch back in
    const active2 = createBattleOnFieldPokemon(pokemon, 0, [
      ...dataManager.getSpecies(SP.gyarados).types,
    ]);

    // Tera state should be restored
    expect(active2.isTerastallized).toBe(true);
    expect(active2.teraType).toBe(T.water);
    expect(active2.types).toEqual([T.water]); // Tera types restored, not original
  });

  it("given a Stellar-Tera Pokemon with consumed boosts, when switched out and back in, then stellarBoostedTypes are preserved", () => {
    // Source: Showdown sim/battle-actions.ts -- stellarBoostedTypes tracking
    const pokemon = createPokemonInstanceForTest({
      speciesId: SP.charizard,
      ability: C.blaze,
      teraType: STELLAR_TERA_TYPE,
    });

    const active1 = createBattleOnFieldPokemon(pokemon, 0, [
      ...dataManager.getSpecies(SP.charizard).types,
    ]);
    const side = createBattleSide();
    const state = createBattleState();
    tera.activate(active1, side, state);

    // Simulate using a Fire move (consumes the Fire stellar boost)
    calculateTeraStab(active1, T.fire, [T.fire, T.flying], false);
    expect(active1.stellarBoostedTypes).toContain(T.fire);

    // Switch out and back in
    const active2 = createBattleOnFieldPokemon(pokemon, 0, [
      ...dataManager.getSpecies(SP.charizard).types,
    ]);

    // Stellar boost tracking should be preserved
    expect(active2.stellarBoostedTypes).toContain(T.fire);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Standard STAB (non-Tera)
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab non-Tera (standard STAB)", () => {
  it("given a non-Tera Fire/Flying Pokemon using Flamethrower (Fire), when calculating STAB, then returns 1.5", () => {
    // Source: Showdown sim/battle-actions.ts:1756-1760 -- standard 1.5x STAB for type match
    const pokemon = createOnFieldPokemon({ speciesId: SP.charizard });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], false)).toBe(1.5);
  });

  it("given a non-Tera Fire/Flying Pokemon using Shadow Ball (Ghost), when calculating STAB, then returns 1.0", () => {
    // Source: Showdown sim/battle-actions.ts -- no STAB for non-matching type
    const pokemon = createOnFieldPokemon({ speciesId: SP.charizard });
    expect(calculateTeraStab(pokemon, T.ghost, [T.fire, T.flying], false)).toBe(1.0);
  });

  it("given a non-Tera Pokemon with Adaptability using a STAB move, when calculating STAB, then returns 2.0", () => {
    // Source: Showdown data/abilities.ts:43-56 -- Adaptability: 1.5x -> 2.0x
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      ability: C.adaptability,
      types: [T.fire, T.flying],
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], true)).toBe(2.0);
  });

  it("given a non-Tera Pokemon with Adaptability using a non-STAB move, when calculating STAB, then returns 1.0", () => {
    // Source: Showdown data/abilities.ts -- Adaptability only modifies existing STAB
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      ability: C.adaptability,
      types: [T.fire, T.flying],
    });
    expect(calculateTeraStab(pokemon, T.ghost, [T.fire, T.flying], true)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Standard Tera (non-Stellar)
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab standard Tera", () => {
  it("given Charizard (Fire/Flying) with Fire Tera using Flamethrower (Fire), when calculating STAB, then returns 2.0 (Tera matches original + move)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 1
    // Source: Showdown sim/battle-actions.ts:1788-1791 -- Tera type matches original type AND move type
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      teraType: T.fire,
      terastallized: true,
      teraTypes: [T.fire],
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], false)).toBe(2.0);
  });

  it("given Charizard (Fire/Flying) with Fire Tera using Air Slash (Flying), when calculating STAB, then returns 1.5 (original type match only)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 2
    // Source: Showdown sim/battle-actions.ts -- Flying is in getTypes(false, true) but not hasType()
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      teraType: T.fire,
      terastallized: true,
      teraTypes: [T.fire],
    });
    expect(calculateTeraStab(pokemon, T.flying, [T.fire, T.flying], false)).toBe(1.5);
  });

  it("given Charizard (Fire/Flying) with Grass Tera using Flamethrower (Fire), when calculating STAB, then returns 1.5 (original type only, not Tera)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 3
    // Source: Showdown sim/battle-actions.ts -- Fire is original but not Tera type
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      teraType: T.grass,
      terastallized: true,
      teraTypes: [T.grass],
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], false)).toBe(1.5);
  });

  it("given Charizard (Fire/Flying) with Grass Tera using Energy Ball (Grass), when calculating STAB, then returns 1.5 (Tera type match only, not original)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 4
    // Source: Showdown sim/battle-actions.ts -- Grass is hasType() but not in getTypes(false,true)
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      teraType: T.grass,
      terastallized: true,
      teraTypes: [T.grass],
    });
    expect(calculateTeraStab(pokemon, T.grass, [T.fire, T.flying], false)).toBe(1.5);
  });

  it("given Gyarados (Water/Flying) with Water Tera using Waterfall (Water), when calculating STAB, then returns 2.0", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 5
    // Source: Showdown sim/battle-actions.ts -- Water is Tera AND original
    const pokemon = createOnFieldPokemon({
      speciesId: SP.gyarados,
      teraType: T.water,
      terastallized: true,
      teraTypes: [T.water],
    });
    expect(calculateTeraStab(pokemon, T.water, [T.water, T.flying], false)).toBe(2.0);
  });

  it("given Alakazam (Psychic) with Electric Tera using Shadow Ball (Ghost), when calculating STAB, then returns 1.0 (no STAB)", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 8
    // Source: Showdown sim/battle-actions.ts -- Ghost not in original or Tera
    const pokemon = createOnFieldPokemon({
      speciesId: SP.mewtwo,
      teraType: T.electric,
      terastallized: true,
      teraTypes: [T.electric],
    });
    expect(calculateTeraStab(pokemon, T.ghost, [T.psychic], false)).toBe(1.0);
  });

  it("given Alakazam (Psychic) with Electric Tera using Psychic (Psychic), when calculating STAB, then returns 1.5", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 9
    // Source: Showdown sim/battle-actions.ts -- Psychic is original but not Tera
    const pokemon = createOnFieldPokemon({
      speciesId: SP.mewtwo,
      teraType: T.electric,
      terastallized: true,
      teraTypes: [T.electric],
    });
    expect(calculateTeraStab(pokemon, T.psychic, [T.psychic], false)).toBe(1.5);
  });

  it("given Alakazam (Psychic) with Electric Tera using Thunderbolt (Electric), when calculating STAB, then returns 1.5", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 10
    // Source: Showdown sim/battle-actions.ts -- Electric is Tera but not original
    const pokemon = createOnFieldPokemon({
      speciesId: SP.mewtwo,
      teraType: T.electric,
      terastallized: true,
      teraTypes: [T.electric],
    });
    expect(calculateTeraStab(pokemon, T.electric, [T.psychic], false)).toBe(1.5);
  });

  it("given Gyarados (Water/Flying) with Dark Tera using Crunch (Dark), when calculating STAB, then returns 1.5", () => {
    // Source: specs/battle/10-gen9.md STAB scenario matrix -- row 7
    // Source: Showdown sim/battle-actions.ts -- Dark is Tera type only, not original
    const pokemon = createOnFieldPokemon({
      speciesId: SP.gyarados,
      teraType: T.dark,
      terastallized: true,
      teraTypes: [T.dark],
    });
    expect(calculateTeraStab(pokemon, T.dark, [T.water, T.flying], false)).toBe(1.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Adaptability interaction
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab Adaptability interaction", () => {
  it("given a Pokemon with Adaptability and Fire Tera (Fire is original type) using Fire move, when calculating STAB, then returns 2.25", () => {
    // Source: Showdown data/abilities.ts:43-56 -- if stab===2 return 2.25
    // Fire Tera + Fire original + Fire move = 2.0x base, Adaptability boosts to 2.25x
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire],
      ability: C.adaptability,
      teraType: T.fire,
      terastallized: true,
      teraTypes: [T.fire],
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], true)).toBe(2.25);
  });

  it("given a Pokemon with Adaptability and Grass Tera using Grass move (Grass = Tera only, not original), when calculating STAB, then returns 2.0", () => {
    // Source: Showdown data/abilities.ts:47 -- onModifySTAB triggers when source.hasType(move.type)
    // Grass is the current Tera type (hasType = true), base STAB = 1.5x, Adaptability -> 2.0x
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.grass],
      ability: C.adaptability,
      teraType: T.grass,
      terastallized: true,
      teraTypes: [T.grass],
    });
    expect(calculateTeraStab(pokemon, T.grass, [T.fire, T.flying], true)).toBe(2.0);
  });

  it("given Charizard (Fire/Flying) with Adaptability and Grass Tera using Flamethrower (Fire = original type, not Tera), when calculating STAB, then returns 1.5 (Adaptability does NOT apply)", () => {
    // Source: Showdown data/abilities.ts:47 -- onModifySTAB only triggers when source.hasType(move.type)
    // Fire is original type only, hasType(fire) = false when Tera'd to Grass
    // So Adaptability does NOT boost this STAB
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.grass],
      ability: C.adaptability,
      teraType: T.grass,
      terastallized: true,
      teraTypes: [T.grass],
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], true)).toBe(1.5);
  });

  it("given a Pokemon with Adaptability using a non-STAB move when Tera'd, when calculating STAB, then returns 1.0", () => {
    // Source: Showdown data/abilities.ts -- Adaptability only modifies existing STAB
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.grass],
      ability: C.adaptability,
      teraType: T.grass,
      terastallized: true,
      teraTypes: [T.grass],
    });
    expect(calculateTeraStab(pokemon, T.ghost, [T.fire, T.flying], true)).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// calculateTeraStab — Stellar Tera Type
// ═══════════════════════════════════════════════════════════════════════════

describe("calculateTeraStab Stellar Tera", () => {
  it("given a Stellar-Tera Charizard (Fire/Flying) using Flamethrower (Fire) for the first time, when calculating STAB, then returns 2.0", () => {
    // Source: Showdown sim/battle-actions.ts:1774-1779 -- first use of base type: 2x boost
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire, T.flying], // Stellar retains original types
      teraType: STELLAR_TERA_TYPE,
      terastallized: true,
      teraTypes: [T.fire, T.flying],
      stellarBoostedTypes: [],
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], false)).toBe(2.0);
    // Side effect: fire should now be in stellarBoostedTypes
    expect(pokemon.stellarBoostedTypes).toContain(T.fire);
  });

  it("given a Stellar-Tera Charizard using Flamethrower (Fire) for the second time, when calculating STAB, then returns 1.5", () => {
    // Source: Showdown sim/battle-actions.ts:1774-1779 -- already consumed Fire boost
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire, T.flying],
      teraType: STELLAR_TERA_TYPE,
      terastallized: true,
      teraTypes: [T.fire, T.flying],
      stellarBoostedTypes: [T.fire], // Already consumed
    });
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], false)).toBe(1.5);
  });

  it("given a Stellar-Tera Charizard using Air Slash (Flying) for the first time, when calculating STAB, then returns 2.0", () => {
    // Source: Showdown sim/battle-actions.ts:1774-1779 -- Flying is a base type, first use = 2x
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire, T.flying],
      teraType: STELLAR_TERA_TYPE,
      terastallized: true,
      teraTypes: [T.fire, T.flying],
      stellarBoostedTypes: [T.fire], // Fire already consumed, Flying not yet
    });
    expect(calculateTeraStab(pokemon, T.flying, [T.fire, T.flying], false)).toBe(2.0);
    expect(pokemon.stellarBoostedTypes).toContain(T.flying);
  });

  it("given a Stellar-Tera Charizard using Shadow Ball (Ghost, non-base type), when calculating STAB, then returns 4915/4096 (~1.2x)", () => {
    // Source: Showdown sim/battle-actions.ts:1781-1784 -- non-base type: 4915/4096
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire, T.flying],
      teraType: STELLAR_TERA_TYPE,
      terastallized: true,
      teraTypes: [T.fire, T.flying],
      stellarBoostedTypes: [],
    });
    // Ghost is not a base type of Fire/Flying Charizard
    expect(calculateTeraStab(pokemon, T.ghost, [T.fire, T.flying], false)).toBeCloseTo(
      4915 / 4096,
      10,
    );
  });

  it("given a Stellar-Tera Pokemon with Adaptability using a move, when calculating STAB, then Adaptability has no effect", () => {
    // Source: Showdown sim/battle-actions.ts -- ModifySTAB event only called in non-Stellar branch
    // Source: specs/battle/10-gen9.md -- "Stellar exclusion: ModifySTAB event ... is only called in the non-Stellar branch"
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire, T.flying],
      ability: C.adaptability,
      teraType: STELLAR_TERA_TYPE,
      terastallized: true,
      teraTypes: [T.fire, T.flying],
      stellarBoostedTypes: [],
    });
    // Even with Adaptability, Stellar STAB is unmodified
    // First use of Fire: should be 2.0x (not 2.25x with Adaptability)
    expect(calculateTeraStab(pokemon, T.fire, [T.fire, T.flying], true)).toBe(2.0);
  });

  it("given a Stellar-Tera Pokemon using a non-base type move, when Adaptability is present, then returns 4915/4096 (Adaptability has no effect on Stellar)", () => {
    // Source: Showdown sim/battle-actions.ts -- Stellar branch does not call ModifySTAB
    const pokemon = createOnFieldPokemon({
      speciesId: SP.charizard,
      types: [T.fire, T.flying],
      ability: C.adaptability,
      teraType: STELLAR_TERA_TYPE,
      terastallized: true,
      teraTypes: [T.fire, T.flying],
      stellarBoostedTypes: [],
    });
    expect(calculateTeraStab(pokemon, T.ghost, [T.fire, T.flying], true)).toBeCloseTo(
      4915 / 4096,
      10,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Gen9Terastallization — Properties
// ═══════════════════════════════════════════════════════════════════════════

describe("Gen9Terastallization properties", () => {
  it("given Gen9Terastallization, when checking name, then returns 'Terastallization'", () => {
    const tera = new Gen9Terastallization();
    expect(tera.name).toBe("Terastallization");
  });

  it("given Gen9Terastallization, when checking generations, then returns [9]", () => {
    // Source: Terastallization is exclusive to Gen 9
    const tera = new Gen9Terastallization();
    expect(tera.generations).toEqual([9]);
  });
});
