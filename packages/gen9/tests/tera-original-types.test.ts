/**
 * Tests for #756: Gen9 Terastallization stores post-Tera types instead of pre-Tera.
 *
 * The activate() method must save original (pre-Tera) types into pokemon.pokemon.teraOriginalTypes
 * BEFORE changing pokemon.types to [teraType]. This is used by getOriginalTypes() for
 * STAB calculations.
 *
 * Field semantics:
 *   teraOriginalTypes — stores pre-Tera species types (always, regardless of Stellar)
 *   teraTypes         — stores resolved defensive types (non-Stellar: [teraType], Stellar: originalTypes)
 *
 * Source: Showdown sim/battle.ts -- teraOriginalTypes stores original species types
 * Source: Showdown sim/battle-actions.ts:1770-1785 -- teraOriginalTypes stores pre-Tera typing
 */

import type { ActivePokemon, BattleSide, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen9DataManager } from "../src";
import { GEN9_ITEM_IDS, GEN9_MOVE_IDS, GEN9_SPECIES_IDS } from "../src/data";
import { calculateGen9Damage } from "../src/Gen9DamageCalc";
import { Gen9Terastallization } from "../src/Gen9Terastallization";
import { GEN9_TYPE_CHART } from "../src/Gen9TypeChart";

const dataManager = createGen9DataManager();

// ---------------------------------------------------------------------------
// Helper factories (same pattern as terastallization.test.ts)
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
  types?: PokemonType[];
  ability?: string;
  teraType?: PokemonType;
  isTerastallized?: boolean;
  activeTeraType?: PokemonType | null;
  stellarBoostedTypes?: PokemonType[];
}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-pokemon",
      speciesId: GEN9_SPECIES_IDS.charizard,
      nickname: null,
      level: 50,
      experience: 0,
      nature: ALL_NATURES[0].id,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: 200,
      moves: [{ moveId: CORE_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 }],
      ability: overrides.ability ?? CORE_ABILITY_IDS.blaze,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: null,
      status: null,
      friendship: createFriendship(70),
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "test",
      metLevel: 50,
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: GEN9_ITEM_IDS.pokeBall,
      teraType: overrides.teraType,
      calculatedStats: {
        hp: 200,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
    },
    teamSlot: 0,
    statStages: {
      ...createDefaultStatStages(),
      hp: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
    ability: overrides.ability ?? CORE_ABILITY_IDS.blaze,
    suppressedAbility: null,
    itemKnockedOff: false,
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
    isTerastallized: overrides.isTerastallized ?? false,
    teraType: overrides.activeTeraType ?? null,
    stellarBoostedTypes: overrides.stellarBoostedTypes ?? [],
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleSide(index: 0 | 1 = 0): BattleSide {
  return {
    index,
    gimmickUsed: false,
    trainer: { id: "test", displayName: "Test", trainerClass: "Trainer" },
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

// ---------------------------------------------------------------------------
// #756: teraOriginalTypes must store pre-Tera types; teraTypes stores defensive types
// ---------------------------------------------------------------------------

describe("#756 — Gen9 Terastallization stores pre-Tera types in teraOriginalTypes", () => {
  const tera = new Gen9Terastallization();

  it("given a Water/Ground Pokemon Terastallizes into Fire, when getOriginalTypes is checked via teraOriginalTypes, then returns [water, ground] (pre-Tera types)", () => {
    // Source: Showdown sim/battle-actions.ts:1770-1785 -- teraOriginalTypes stores pre-Tera typing
    // Before fix: teraOriginalTypes was set AFTER changing pokemon.types, so it stored [fire] instead.
    const pokemon = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.water, CORE_TYPE_IDS.ground],
      teraType: CORE_TYPE_IDS.fire,
    });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    // After activation: pokemon.types should be [fire] (defensive type change)
    expect(pokemon.types).toEqual([CORE_TYPE_IDS.fire]);
    // teraOriginalTypes stores the ORIGINAL pre-Tera types
    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.water, CORE_TYPE_IDS.ground]);
    // teraTypes stores the resolved defensive type (non-Stellar: [teraType])
    expect(pokemon.pokemon.teraTypes).toEqual([CORE_TYPE_IDS.fire]);
  });

  it("given a pure Fire Pokemon Terastallizes into Dragon, when getOriginalTypes is checked via teraOriginalTypes, then returns [fire] (pre-Tera type)", () => {
    // Source: Showdown sim/battle-actions.ts -- teraOriginalTypes stores original species types
    const pokemon = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.fire],
      teraType: CORE_TYPE_IDS.dragon,
    });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    // Defensive type changes to [dragon]
    expect(pokemon.types).toEqual([CORE_TYPE_IDS.dragon]);
    // teraOriginalTypes stores pre-Tera [fire]
    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.fire]);
    // teraTypes stores the resolved defensive type (non-Stellar: [teraType])
    expect(pokemon.pokemon.teraTypes).toEqual([CORE_TYPE_IDS.dragon]);
  });

  it("given a Grass/Poison Pokemon Terastallizes into Grass (same type), when getOriginalTypes is checked, then teraOriginalTypes is [grass, poison] (not just [grass])", () => {
    // Source: Showdown sim/battle.ts -- even when Tera type matches one of the original types,
    // the original dual typing must be preserved for STAB calc.
    const pokemon = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.grass, CORE_TYPE_IDS.poison],
      teraType: CORE_TYPE_IDS.grass,
    });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    // Defensive type: single Tera type
    expect(pokemon.types).toEqual([CORE_TYPE_IDS.grass]);
    // teraOriginalTypes: original dual types preserved
    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.grass, CORE_TYPE_IDS.poison]);
    // teraTypes stores the resolved defensive type (non-Stellar: [teraType])
    expect(pokemon.pokemon.teraTypes).toEqual([CORE_TYPE_IDS.grass]);
  });

  it("given a Fire/Flying Pokemon Terastallizes into Stellar, when getOriginalTypes is checked, then teraOriginalTypes is [fire, flying] and pokemon.types is unchanged", () => {
    // Source: Showdown sim/pokemon.ts -- Stellar Tera retains original defensive types
    // teraOriginalTypes stores original types; teraTypes mirrors originalTypes for Stellar
    const pokemon = createOnFieldPokemon({
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
      // "stellar" is a valid Gen 9 Tera type but is not in the PokemonType union
      // (it has no type chart entry and is Gen 9-specific). Cast mirrors the
      // Gen9Terastallization.ts pattern — same rationale as (teraType as string) checks there.
      teraType: "stellar" as PokemonType,
    });
    const side = createBattleSide();
    const state = createBattleState();

    tera.activate(pokemon, side, state);

    // Stellar: types unchanged
    expect(pokemon.types).toEqual([CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    // teraOriginalTypes: original types captured before the (non-)change
    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
    // teraTypes: Stellar resolves to originalTypes (same as teraOriginalTypes)
    expect(pokemon.pokemon.teraTypes).toEqual([CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying]);
  });
});

// ---------------------------------------------------------------------------
// Damage calc pipeline: teraOriginalTypes drives cross-type STAB
// ---------------------------------------------------------------------------

/**
 * Helper factories for damage-calc integration tests.
 * Re-declared here (scoped to this describe block) to avoid coupling to the
 * damage-calc.test.ts helpers which are not exported.
 */
function createDamageOnFieldPokemon(overrides: {
  types?: PokemonType[];
  teraType?: PokemonType;
  isTerastallized?: boolean;
  attack?: number;
  defense?: number;
  teraOriginalTypes?: PokemonType[];
}): ActivePokemon {
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  return {
    pokemon: {
      uid: "dmg-test",
      speciesId: GEN9_SPECIES_IDS.gyarados,
      nickname: null,
      level: 50,
      experience: 0,
      nature: ALL_NATURES[0].id,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: 200,
      moves: [],
      ability: CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: null,
      status: null,
      friendship: createFriendship(0),
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: GEN9_ITEM_IDS.pokeBall,
      teraType: overrides.teraType ?? null,
      calculatedStats: {
        hp: 200,
        attack,
        defense,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      // Set teraOriginalTypes when provided (as if activate() already ran)
      teraOriginalTypes: overrides.teraOriginalTypes,
    },
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    ability: CORE_ABILITY_IDS.none,
    suppressedAbility: null,
    itemKnockedOff: false,
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
    isTerastallized: overrides.isTerastallized ?? false,
    teraType: overrides.teraType ?? null,
    stellarBoostedTypes: [],
    forcedMove: null,
  } as ActivePokemon;
}

function createDamageBattleState(): BattleState {
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

const dmgTypeChart = GEN9_TYPE_CHART;

describe("calculateGen9Damage — teraOriginalTypes cross-type STAB pipeline", () => {
  const tera = new Gen9Terastallization();

  it("given a Water/Flying Pokemon Tera'd into Fire that uses a Water-type move, when activate() sets teraOriginalTypes, then STAB is 1.5x (original Water type still grants STAB)", () => {
    // Source: Showdown sim/battle-actions.ts:1770-1785 -- teraOriginalTypes stores pre-Tera
    // species types; STAB is granted for any type in teraOriginalTypes OR equal to teraType.
    // Water/Flying Tera'd to Fire: Tera type = Fire, originalTypes = [water, flying].
    // Water move: matches teraOriginalTypes[0] but NOT teraType -- cross-type STAB = 1.5x.
    const pokemon = createDamageOnFieldPokemon({
      types: [CORE_TYPE_IDS.water, CORE_TYPE_IDS.flying],
      teraType: CORE_TYPE_IDS.fire,
    });
    const side = createBattleSide(0);
    const state = createDamageBattleState();

    // activate() saves ["water", "flying"] into teraOriginalTypes BEFORE updating types to [fire]
    tera.activate(pokemon, side, state);

    // After activation: types = ["fire"], teraOriginalTypes = ["water", "flying"]
    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.water, CORE_TYPE_IDS.flying]);

    const ctx: DamageContext = {
      attacker: pokemon,
      defender: createDamageOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], defense: 100 }),
      move: { ...dataManager.getMove(GEN9_MOVE_IDS.surf), power: 80 } as MoveData,
      state,
      rng: new SeededRandom(42),
      isCrit: false,
    };

    const result = calculateGen9Damage(ctx, dmgTypeChart);
    // Water move vs Water/Flying (now Tera Fire) attacker: original Water type in teraOriginalTypes
    // grants 1.5x STAB (not 2.0x because teraType=Fire does not also match Water).
    // Source: Showdown sim/battle-actions.ts:1788-1791 -- Tera != original type = 1.5x cross-STAB
    expect(result.breakdown!.stabMultiplier).toBe(1.5);
  });

  it("given a Fire Pokemon Tera'd into Fire that uses a Fire-type move, when activate() sets teraOriginalTypes, then STAB is 2.0x (Tera type and original type both match)", () => {
    // Source: Showdown sim/battle-actions.ts:1788-1791 -- Tera type === original type → 2.0x STAB
    // Fire Pokemon Tera'd into Fire: teraOriginalTypes = [fire], teraType = fire.
    // Fire move matches BOTH teraOriginalTypes and teraType → 2.0x enhanced STAB.
    const pokemon = createDamageOnFieldPokemon({
      types: [CORE_TYPE_IDS.fire],
      teraType: CORE_TYPE_IDS.fire,
    });
    const side = createBattleSide(0);
    const state = createDamageBattleState();

    tera.activate(pokemon, side, state);

    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.fire]);

    const ctx: DamageContext = {
      attacker: pokemon,
      defender: createDamageOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], defense: 100 }),
      move: { ...dataManager.getMove(GEN9_MOVE_IDS.flamethrower), power: 80 } as MoveData,
      state,
      rng: new SeededRandom(42),
      isCrit: false,
    };

    const result = calculateGen9Damage(ctx, dmgTypeChart);
    expect(result.breakdown!.stabMultiplier).toBe(2.0);
  });

  it("given a Water/Flying Pokemon Tera'd into Fire that uses a Fire-type move, when activate() sets teraOriginalTypes, then STAB is 1.5x (Tera type matches only, not original types)", () => {
    // Source: Showdown sim/battle-actions.ts:1760-1793 -- Tera-only STAB = 1.5x
    // Water/Flying Tera'd to Fire: teraOriginalTypes = [water, flying], teraType = fire.
    // Fire move: matches teraType but NOT teraOriginalTypes → standard Tera STAB = 1.5x.
    const pokemon = createDamageOnFieldPokemon({
      types: [CORE_TYPE_IDS.water, CORE_TYPE_IDS.flying],
      teraType: CORE_TYPE_IDS.fire,
    });
    const side = createBattleSide(0);
    const state = createDamageBattleState();

    tera.activate(pokemon, side, state);

    expect(pokemon.pokemon.teraOriginalTypes).toEqual([CORE_TYPE_IDS.water, CORE_TYPE_IDS.flying]);

    const ctx: DamageContext = {
      attacker: pokemon,
      defender: createDamageOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], defense: 100 }),
      move: { ...dataManager.getMove(GEN9_MOVE_IDS.flamethrower), power: 80 } as MoveData,
      state,
      rng: new SeededRandom(42),
      isCrit: false,
    };

    const result = calculateGen9Damage(ctx, dmgTypeChart);
    expect(result.breakdown!.stabMultiplier).toBe(1.5);
  });
});
