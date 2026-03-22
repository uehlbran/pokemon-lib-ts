import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";

import {
  DYNAMAX_IMMUNE_SPECIES,
  DYNAMAX_TURNS,
  Gen8Dynamax,
  getDynamaxCurrentHp,
  getDynamaxMaxHp,
  getUndynamaxedHp,
} from "../src/Gen8Dynamax.js";

// --- Test Helpers ---

function createMockPokemon(overrides: Partial<PokemonInstance> = {}): PokemonInstance {
  return {
    uid: "test-pokemon-1",
    speciesId: 25, // Pikachu
    nickname: null,
    level: 50,
    experience: 0,
    nature: "adamant",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: "static",
    abilitySlot: "normal1",
    heldItem: null,
    status: null,
    friendship: 70,
    gender: "male",
    isShiny: false,
    metLocation: "test",
    metLevel: 1,
    originalTrainer: "Ash",
    originalTrainerId: 12345,
    pokeball: "poke-ball",
    calculatedStats: { hp: 300, attack: 100, defense: 80, spAttack: 90, spDefense: 70, speed: 110 },
    dynamaxLevel: 10,
    ...overrides,
  } as PokemonInstance;
}

function createMockActive(
  pokemonOverrides: Partial<PokemonInstance> = {},
  activeOverrides: Partial<ActivePokemon> = {},
): ActivePokemon {
  return {
    pokemon: createMockPokemon(pokemonOverrides),
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
    types: ["electric"],
    ability: "static",
    suppressedAbility: null,
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
    forcedMove: null,
    ...activeOverrides,
  } as ActivePokemon;
}

function createMockSide(overrides: Partial<BattleSide> = {}): BattleSide {
  return {
    index: 0,
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
    ...overrides,
  } as BattleSide;
}

function createMockState(
  side0Active: ActivePokemon | null = null,
  side1Active: ActivePokemon | null = null,
): BattleState {
  return {
    sides: [
      createMockSide({ active: side0Active ? [side0Active] : [] }),
      createMockSide({ index: 1, active: side1Active ? [side1Active] : [] }),
    ],
    weather: null,
    terrain: null,
    trickRoom: null,
    turnNumber: 1,
  } as unknown as BattleState;
}

// --- Tests ---

describe("Gen8Dynamax", () => {
  describe("Constants", () => {
    it("given DYNAMAX_TURNS, when checking value, then equals 3", () => {
      // Source: Showdown data/conditions.ts line 766 -- duration: 3
      expect(DYNAMAX_TURNS).toBe(3);
    });

    it("given DYNAMAX_IMMUNE_SPECIES, when checking contents, then includes zacian, zamazenta, eternatus", () => {
      // Source: Bulbapedia "Dynamax" -- these three species cannot Dynamax
      expect(DYNAMAX_IMMUNE_SPECIES).toContain("zacian");
      expect(DYNAMAX_IMMUNE_SPECIES).toContain("zamazenta");
      expect(DYNAMAX_IMMUNE_SPECIES).toContain("eternatus");
      expect(DYNAMAX_IMMUNE_SPECIES.length).toBe(3);
    });
  });

  describe("getDynamaxMaxHp", () => {
    it("given dynamaxLevel=0 and baseMaxHp=300, when calculating, then returns floor(300 * 1.5) = 450", () => {
      // Source: Showdown data/conditions.ts line 771 -- ratio = 1.5 + (level * 0.05)
      // dynamaxLevel=0: ratio = 1.5, floor(300 * 1.5) = 450
      const result = getDynamaxMaxHp(300, 0);
      expect(result).toBe(450);
    });

    it("given dynamaxLevel=10 and baseMaxHp=300, when calculating, then returns floor(300 * 2.0) = 600", () => {
      // Source: Showdown data/conditions.ts line 771 -- dynamaxLevel 10: ratio = 2.0
      // floor(300 * 2.0) = 600
      const result = getDynamaxMaxHp(300, 10);
      expect(result).toBe(600);
    });

    it("given dynamaxLevel=5 and baseMaxHp=300, when calculating, then returns floor(300 * 1.75) = 525", () => {
      // Inline derivation: ratio = 1.5 + (5 * 0.05) = 1.75, floor(300 * 1.75) = 525
      const result = getDynamaxMaxHp(300, 5);
      expect(result).toBe(525);
    });

    it("given dynamaxLevel=10 and baseMaxHp=1 (Shedinja), when calculating, then returns floor(1 * 2.0) = 2", () => {
      // Source: Showdown -- Shedinja can Dynamax; HP still scales
      // floor(1 * 2.0) = 2
      const result = getDynamaxMaxHp(1, 10);
      expect(result).toBe(2);
    });
  });

  describe("getDynamaxCurrentHp", () => {
    it("given currentHp=200 and dynamaxLevel=0, when calculating, then returns floor(200 * 1.5) = 300", () => {
      // Source: Showdown data/conditions.ts lines 771-774 -- same ratio applied to currentHp
      const result = getDynamaxCurrentHp(200, 0);
      expect(result).toBe(300);
    });

    it("given currentHp=200 and dynamaxLevel=10, when calculating, then returns floor(200 * 2.0) = 400", () => {
      // Inline derivation: ratio = 2.0, floor(200 * 2.0) = 400
      const result = getDynamaxCurrentHp(200, 10);
      expect(result).toBe(400);
    });

    it("given currentHp=150 and dynamaxLevel=5, when calculating, then returns floor(150 * 1.75) = 262", () => {
      // Inline derivation: ratio = 1.75, floor(150 * 1.75) = 262.5 -> 262
      const result = getDynamaxCurrentHp(150, 5);
      expect(result).toBe(262);
    });
  });

  describe("getUndynamaxedHp", () => {
    it("given currentHp=225, maxHp=450, baseMaxHp=300, when reverting, then returns round(225*300/450) = 150", () => {
      // Source: Showdown data/conditions.ts lines 801-802 -- proportional HP restoration
      // round(225 * 300 / 450) = round(150) = 150
      const result = getUndynamaxedHp(225, 450, 300);
      expect(result).toBe(150);
    });

    it("given currentHp=600, maxHp=600, baseMaxHp=300, when reverting at full HP, then returns 300", () => {
      // Inline derivation: round(600 * 300 / 600) = round(300) = 300
      const result = getUndynamaxedHp(600, 600, 300);
      expect(result).toBe(300);
    });

    it("given currentHp=0, maxHp=600, baseMaxHp=300, when reverting at 0 HP, then returns 0", () => {
      // Inline derivation: round(0 * 300 / 600) = 0
      const result = getUndynamaxedHp(0, 600, 300);
      expect(result).toBe(0);
    });

    it("given currentHp=301, maxHp=600, baseMaxHp=300, when reverting with odd ratio, then rounds correctly", () => {
      // Inline derivation: round(301 * 300 / 600) = round(150.5) = 151 (round rounds up at .5)
      const result = getUndynamaxedHp(301, 600, 300);
      expect(result).toBe(151);
    });

    it("given maxHp=0 (edge case), when reverting, then returns 0 without division by zero", () => {
      const result = getUndynamaxedHp(100, 0, 300);
      expect(result).toBe(0);
    });
  });

  describe("Gen8Dynamax.canUse", () => {
    it("given pokemon not dynamaxed and side has not used gimmick, when checking canUse, then returns true", () => {
      // Source: Showdown data/conditions.ts -- basic Dynamax eligibility
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive();
      const side = createMockSide();
      const state = createMockState();

      expect(dynamax.canUse(pokemon, side, state)).toBe(true);
    });

    it("given pokemon already isDynamaxed, when checking canUse, then returns false", () => {
      // Source: Showdown -- cannot Dynamax if already Dynamaxed
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({}, { isDynamaxed: true });
      const side = createMockSide();
      const state = createMockState();

      expect(dynamax.canUse(pokemon, side, state)).toBe(false);
    });

    it("given side.gimmickUsed is true, when checking canUse, then returns false", () => {
      // Source: Showdown -- one gimmick per side per battle
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive();
      const side = createMockSide({ gimmickUsed: true });
      const state = createMockState();

      expect(dynamax.canUse(pokemon, side, state)).toBe(false);
    });

    it("given Zacian (speciesId 888), when checking canUse, then returns false", () => {
      // Source: Bulbapedia "Dynamax" -- Zacian (#888) cannot Dynamax
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ speciesId: 888 });
      const side = createMockSide();
      const state = createMockState();

      expect(dynamax.canUse(pokemon, side, state)).toBe(false);
    });

    it("given Zamazenta (speciesId 889), when checking canUse, then returns false", () => {
      // Source: Bulbapedia "Dynamax" -- Zamazenta (#889) cannot Dynamax
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ speciesId: 889 });
      const side = createMockSide();
      const state = createMockState();

      expect(dynamax.canUse(pokemon, side, state)).toBe(false);
    });

    it("given Eternatus (speciesId 890), when checking canUse, then returns false", () => {
      // Source: Bulbapedia "Dynamax" -- Eternatus (#890) cannot Dynamax
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ speciesId: 890 });
      const side = createMockSide();
      const state = createMockState();

      expect(dynamax.canUse(pokemon, side, state)).toBe(false);
    });
  });

  describe("Gen8Dynamax.activate", () => {
    it("given a normal pokemon with dynamaxLevel=10, when activating, then sets isDynamaxed=true and dynamaxTurnsLeft=3", () => {
      // Source: Showdown data/conditions.ts -- Dynamax state on activation
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive();
      const side = createMockSide();
      const state = createMockState();

      dynamax.activate(pokemon, side, state);

      expect(pokemon.isDynamaxed).toBe(true);
      expect(pokemon.dynamaxTurnsLeft).toBe(3);
    });

    it("given a pokemon with dynamaxLevel=10 and 300 max HP, when activating, then HP doubles to 600", () => {
      // Source: Showdown data/conditions.ts line 771 -- dynamaxLevel 10: ratio = 2.0
      // floor(300 * 2.0) = 600
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ currentHp: 300, dynamaxLevel: 10 });
      const side = createMockSide();
      const state = createMockState();

      dynamax.activate(pokemon, side, state);

      expect(pokemon.pokemon.calculatedStats!.hp).toBe(600);
      expect(pokemon.pokemon.currentHp).toBe(600);
    });

    it("given a pokemon with dynamaxLevel=0 and 300 max HP/200 current HP, when activating, then scales HP by 1.5x", () => {
      // Source: Showdown data/conditions.ts line 771 -- dynamaxLevel 0: ratio = 1.5
      // maxHp: floor(300 * 1.5) = 450, currentHp: floor(200 * 1.5) = 300
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ currentHp: 200, dynamaxLevel: 0 });
      const side = createMockSide();
      const state = createMockState();

      dynamax.activate(pokemon, side, state);

      expect(pokemon.pokemon.calculatedStats!.hp).toBe(450);
      expect(pokemon.pokemon.currentHp).toBe(300);
    });

    it("given activation, when checking side state, then side.gimmickUsed is true", () => {
      // Source: Showdown -- gimmickUsed set on activation
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive();
      const side = createMockSide();
      const state = createMockState();

      dynamax.activate(pokemon, side, state);

      expect(side.gimmickUsed).toBe(true);
    });

    it("given activation, when checking events, then returns DynamaxEvent with correct data", () => {
      // Source: BattleEvent interface -- dynamax event
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive();
      const side = createMockSide();
      const state = createMockState();

      const events = dynamax.activate(pokemon, side, state);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "dynamax",
        side: 0,
        pokemon: "test-pokemon-1",
      });
    });
  });

  describe("Gen8Dynamax.revert", () => {
    it("given dynamaxed pokemon, when reverting, then sets isDynamaxed=false and dynamaxTurnsLeft=0", () => {
      // Source: Showdown data/conditions.ts -- Dynamax end
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ dynamaxLevel: 10 });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      // First activate
      dynamax.activate(pokemon, side, state);
      expect(pokemon.isDynamaxed).toBe(true);

      // Then revert
      dynamax.revert(pokemon, state);
      expect(pokemon.isDynamaxed).toBe(false);
      expect(pokemon.dynamaxTurnsLeft).toBe(0);
    });

    it("given dynamaxed pokemon at full HP with dynamaxLevel=10, when reverting, then restores HP proportionally", () => {
      // Source: Showdown data/conditions.ts lines 801-802
      // Activate: maxHp 300 -> 600, currentHp 300 -> 600
      // Revert: currentHp 600 * (300/600) = 300
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ currentHp: 300, dynamaxLevel: 10 });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(600);
      expect(pokemon.pokemon.currentHp).toBe(600);

      dynamax.revert(pokemon, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(300);
      expect(pokemon.pokemon.currentHp).toBe(300);
    });

    it("given dynamaxed pokemon that took damage, when reverting, then restores proportional HP", () => {
      // Source: Showdown data/conditions.ts lines 801-802
      // Activate: maxHp 300 -> 600, currentHp 300 -> 600
      // Take 300 damage -> currentHp = 300 out of 600
      // Revert: round(300 * 300 / 600) = round(150) = 150
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ currentHp: 300, dynamaxLevel: 10 });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      // Simulate damage
      pokemon.pokemon.currentHp = 300;

      dynamax.revert(pokemon, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(300);
      expect(pokemon.pokemon.currentHp).toBe(150);
    });

    it("given non-dynamaxed pokemon, when reverting, then returns empty events", () => {
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive();
      const state = createMockState(pokemon, null);

      const events = dynamax.revert(pokemon, state);
      expect(events).toHaveLength(0);
    });

    it("given revert, when checking events, then returns DynamaxEndEvent", () => {
      // Source: BattleEvent interface -- dynamax-end event
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ dynamaxLevel: 10 });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      const events = dynamax.revert(pokemon, state);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("dynamax-end");
    });
  });

  describe("Gen8Dynamax.revert side index (Bug M1)", () => {
    it("given dynamaxed pokemon on side 0, when reverting, then emits event with side: 0", () => {
      // Source: BattleState.sides[n].active maps ActivePokemon to side index
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ dynamaxLevel: 10 });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      const events = dynamax.revert(pokemon, state);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "dynamax-end",
        side: 0,
        pokemon: "test-pokemon-1",
      });
    });

    it("given dynamaxed pokemon on side 1, when reverting, then emits event with side: 1", () => {
      // Bug M1: Previously hardcoded side: 0, which was wrong for opponent-side pokemon
      // Source: BattleState.sides[n].active maps ActivePokemon to side index
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ uid: "opponent-pokemon-1", dynamaxLevel: 10 }, {});
      const side = createMockSide({ index: 1, active: [pokemon] });
      const state = createMockState(null, pokemon);

      dynamax.activate(pokemon, side, state);
      const events = dynamax.revert(pokemon, state);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "dynamax-end",
        side: 1,
        pokemon: "opponent-pokemon-1",
      });
    });

    it("given dynamaxed pokemon not found in any side active slot, when reverting, then throws", () => {
      // Bug M1 fix: rather than silently emitting side: 0 for an invalid state, we now
      // throw an error to surface the corrupted state immediately.
      // Source: Showdown -- BattleState always has the Dynamaxed pokemon in an active slot
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({ uid: "orphan-pokemon", dynamaxLevel: 10 });
      const side = createMockSide();
      const state = createMockState(); // No active pokemon in either side

      dynamax.activate(pokemon, side, state);
      expect(() => dynamax.revert(pokemon, state)).toThrow(
        "Gen8Dynamax.revert: Pokemon uid=orphan-pokemon not found in any active slot",
      );
    });
  });

  describe("Gen8Dynamax.revert HP round-trip (Bug M2)", () => {
    it("given HP=100 and dynamaxLevel=10 (ratio=2.0), when activate then revert at full HP, then restores exactly 100", () => {
      // Source: Showdown sim/pokemon.ts -- pokemon.baseMaxhp stores original max HP
      // Inline: activate: maxHp = floor(100 * 2.0) = 200, currentHp = floor(100 * 2.0) = 200
      // revert: baseMaxHp = stored 100 (not round(200/2.0) = 100), restoredHp = round(200*100/200) = 100
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({
        currentHp: 100,
        dynamaxLevel: 10,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 80,
          spAttack: 90,
          spDefense: 70,
          speed: 110,
        },
      });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(200);
      expect(pokemon.pokemon.currentHp).toBe(200);

      dynamax.revert(pokemon, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(100);
      expect(pokemon.pokemon.currentHp).toBe(100);
    });

    it("given HP=137 and dynamaxLevel=7 (ratio=1.85), when activate then revert at full HP, then restores exactly 137", () => {
      // This is an edge case where reverse-division could produce off-by-1.
      // Inline: activate: maxHp = floor(137 * 1.85) = floor(253.45) = 253
      //         currentHp = floor(137 * 1.85) = 253
      // Old buggy revert: baseMaxHp = round(253 / 1.85) = round(136.756...) = 137 (happens to be correct here)
      // New revert: baseMaxHp = stored 137 (always exact)
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({
        currentHp: 137,
        dynamaxLevel: 7,
        calculatedStats: {
          hp: 137,
          attack: 100,
          defense: 80,
          spAttack: 90,
          spDefense: 70,
          speed: 110,
        },
      });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(253); // floor(137 * 1.85)
      expect(pokemon.pokemon.currentHp).toBe(253);

      dynamax.revert(pokemon, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(137);
      expect(pokemon.pokemon.currentHp).toBe(137);
    });

    it("given HP=141 and dynamaxLevel=3 (ratio=1.65), when activate then revert at full HP, then restores exactly 141", () => {
      // This exercises a case where floor(141 * 1.65) = floor(232.65) = 232
      // Old buggy revert: round(232 / 1.65) = round(140.606...) = 141 (happens to round correctly)
      // But floor(currentHp * baseMaxHp / maxHp) = round(232 * 141 / 232) = round(141) = 141
      // With stored baseMaxHp we always get exactly 141.
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({
        currentHp: 141,
        dynamaxLevel: 3,
        calculatedStats: {
          hp: 141,
          attack: 100,
          defense: 80,
          spAttack: 90,
          spDefense: 70,
          speed: 110,
        },
      });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(232); // floor(141 * 1.65)
      expect(pokemon.pokemon.currentHp).toBe(232);

      dynamax.revert(pokemon, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(141);
      expect(pokemon.pokemon.currentHp).toBe(141);
    });

    it("given HP=201 and dynamaxLevel=1 (ratio=1.55), when activate then take damage then revert, then HP is proportional", () => {
      // Tests proportional HP restoration after damage with stored baseMaxHp
      // Inline: activate: maxHp = floor(201 * 1.55) = floor(311.55) = 311
      //         currentHp = floor(201 * 1.55) = 311
      // Take 100 damage -> currentHp = 211
      // Revert: baseMaxHp = stored 201, restoredHp = round(211 * 201 / 311) = round(136.37...) = 136
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({
        currentHp: 201,
        dynamaxLevel: 1,
        calculatedStats: {
          hp: 201,
          attack: 100,
          defense: 80,
          spAttack: 90,
          spDefense: 70,
          speed: 110,
        },
      });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(311); // floor(201 * 1.55)

      // Simulate taking 100 damage
      pokemon.pokemon.currentHp = 211;

      dynamax.revert(pokemon, state);
      expect(pokemon.pokemon.calculatedStats!.hp).toBe(201);
      // round(211 * 201 / 311) = round(136.373...) = 136
      expect(pokemon.pokemon.currentHp).toBe(136);
    });

    it("given revert clears preDynamaxMaxHp field, when checking after revert, then field is undefined", () => {
      // Ensures the stored value is cleaned up after revert
      const dynamax = new Gen8Dynamax();
      const pokemon = createMockActive({
        currentHp: 100,
        dynamaxLevel: 10,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 80,
          spAttack: 90,
          spDefense: 70,
          speed: 110,
        },
      });
      const side = createMockSide({ active: [pokemon] });
      const state = createMockState(pokemon, null);

      dynamax.activate(pokemon, side, state);
      expect(pokemon.preDynamaxMaxHp).toBe(100);

      dynamax.revert(pokemon, state);
      expect(pokemon.preDynamaxMaxHp).toBeUndefined();
    });
  });

  describe("Gen8Dynamax.modifyMove", () => {
    const dynamax = new Gen8Dynamax();

    const baseMove = {
      id: "flamethrower",
      displayName: "Flamethrower",
      type: "fire" as const,
      category: "special" as const,
      power: 90,
      accuracy: 100,
      pp: 15,
      priority: 0,
      target: "adjacent-foe" as const,
      flags: {
        contact: false,
        sound: false,
        bullet: false,
        pulse: false,
        punch: false,
        bite: false,
        wind: false,
        slicing: false,
        powder: false,
        protect: true,
        mirror: true,
        snatch: false,
        gravity: false,
        defrost: false,
        recharge: false,
        charge: false,
        bypassSubstitute: false,
      },
      effect: null,
      description: "test",
      generation: 1 as const,
    };

    it("given non-dynamaxed pokemon, when modifying move, then returns move unchanged", () => {
      const pokemon = createMockActive();
      const result = dynamax.modifyMove(baseMove, pokemon);
      expect(result).toBe(baseMove); // Same reference
    });

    it("given dynamaxed pokemon with damage move, when modifying, then converts to Max Move with scaled power", () => {
      // Source: Showdown sim/battle-actions.ts -- damage moves become Max Moves
      // Fire + BP 90 -> Max Flare with BP 125 (standard table: 85-90 -> 125)
      const pokemon = createMockActive({}, { isDynamaxed: true });
      const result = dynamax.modifyMove(baseMove, pokemon);

      expect(result.displayName).toBe("Max Flare");
      expect(result.power).toBe(125);
      expect(result.accuracy).toBeNull();
    });

    it("given dynamaxed pokemon with status move, when modifying, then converts to Max Guard", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves become Max Guard
      const statusMove = {
        ...baseMove,
        id: "toxic",
        displayName: "Toxic",
        category: "status" as const,
        power: null,
      };
      const pokemon = createMockActive({}, { isDynamaxed: true });
      const result = dynamax.modifyMove(statusMove, pokemon);

      expect(result.displayName).toBe("Max Guard");
      expect(result.id).toBe("max-guard");
    });
  });
});
