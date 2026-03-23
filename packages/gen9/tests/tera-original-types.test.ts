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

import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen9Terastallization } from "../src/Gen9Terastallization";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as terastallization.test.ts)
// ---------------------------------------------------------------------------

function makeActive(overrides: {
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
      speciesId: 6,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: 200,
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      ability: overrides.ability ?? "blaze",
      abilitySlot: "normal1" as const,
      heldItem: null,
      status: null,
      friendship: 70,
      gender: "male" as any,
      isShiny: false,
      metLocation: "test",
      metLevel: 50,
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: "poke-ball",
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
      hp: 0,
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? ["fire", "flying"],
    ability: overrides.ability ?? "blaze",
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

function makeSide(index: 0 | 1 = 0): BattleSide {
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

function makeState(): BattleState {
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
    const pokemon = makeActive({
      types: ["water", "ground"],
      teraType: "fire",
    });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    // After activation: pokemon.types should be [fire] (defensive type change)
    expect(pokemon.types).toEqual(["fire"]);
    // teraOriginalTypes stores the ORIGINAL pre-Tera types
    expect(pokemon.pokemon.teraOriginalTypes).toEqual(["water", "ground"]);
    // teraTypes stores the resolved defensive type (non-Stellar: [teraType])
    expect(pokemon.pokemon.teraTypes).toEqual(["fire"]);
  });

  it("given a pure Fire Pokemon Terastallizes into Dragon, when getOriginalTypes is checked via teraOriginalTypes, then returns [fire] (pre-Tera type)", () => {
    // Source: Showdown sim/battle-actions.ts -- teraOriginalTypes stores original species types
    const pokemon = makeActive({
      types: ["fire"],
      teraType: "dragon",
    });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    // Defensive type changes to [dragon]
    expect(pokemon.types).toEqual(["dragon"]);
    // teraOriginalTypes stores pre-Tera [fire]
    expect(pokemon.pokemon.teraOriginalTypes).toEqual(["fire"]);
    // teraTypes stores the resolved defensive type (non-Stellar: [teraType])
    expect(pokemon.pokemon.teraTypes).toEqual(["dragon"]);
  });

  it("given a Grass/Poison Pokemon Terastallizes into Grass (same type), when getOriginalTypes is checked, then teraOriginalTypes is [grass, poison] (not just [grass])", () => {
    // Source: Showdown sim/battle.ts -- even when Tera type matches one of the original types,
    // the original dual typing must be preserved for STAB calc.
    const pokemon = makeActive({
      types: ["grass", "poison"],
      teraType: "grass",
    });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    // Defensive type: single Tera type
    expect(pokemon.types).toEqual(["grass"]);
    // teraOriginalTypes: original dual types preserved
    expect(pokemon.pokemon.teraOriginalTypes).toEqual(["grass", "poison"]);
    // teraTypes stores the resolved defensive type (non-Stellar: [teraType])
    expect(pokemon.pokemon.teraTypes).toEqual(["grass"]);
  });

  it("given a Fire/Flying Pokemon Terastallizes into Stellar, when getOriginalTypes is checked, then teraOriginalTypes is [fire, flying] and pokemon.types is unchanged", () => {
    // Source: Showdown sim/pokemon.ts -- Stellar Tera retains original defensive types
    // teraOriginalTypes stores original types; teraTypes mirrors originalTypes for Stellar
    const pokemon = makeActive({
      types: ["fire", "flying"],
      teraType: "stellar" as PokemonType,
    });
    const side = makeSide();
    const state = makeState();

    tera.activate(pokemon, side, state);

    // Stellar: types unchanged
    expect(pokemon.types).toEqual(["fire", "flying"]);
    // teraOriginalTypes: original types captured before the (non-)change
    expect(pokemon.pokemon.teraOriginalTypes).toEqual(["fire", "flying"]);
    // teraTypes: Stellar resolves to originalTypes (same as teraOriginalTypes)
    expect(pokemon.pokemon.teraTypes).toEqual(["fire", "flying"]);
  });
});
