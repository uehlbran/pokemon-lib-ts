import type { AccuracyContext, ActivePokemon, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
  createEvs,
  createIvs,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  canInflictGen3Status,
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";
import { isGen3VolatileBlockedByAbility } from "../../src/Gen3Abilities";

/**
 * Gen 3 Ability Immunity Integration Tests
 *
 * Tests that ability immunities work correctly through the full pipeline:
 * - canInflictGen3Status — blocks status infliction when ability grants immunity
 * - isGen3VolatileBlockedByAbility — blocks volatile statuses like flinch
 * - doesMoveHit — accuracy-modifying abilities (Compound Eyes, Sand Veil, Hustle)
 *
 * Source hierarchy for Gen 3:
 *   1. pret/pokeemerald disassembly (ground truth)
 *   2. Pokemon Showdown Gen 3 mod
 *   3. Bulbapedia
 */

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
const abilities = { ...CORE_ABILITY_IDS, ...GEN3_ABILITY_IDS } as const;
const moveIds = GEN3_MOVE_IDS;
const speciesIds = GEN3_SPECIES_IDS;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
const volatileIds = CORE_VOLATILE_IDS;
const weatherIds = CORE_WEATHER_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.bulbasaur);
const sleepPowder = dataManager.getMove(moveIds.sleepPowder);
const surf = dataManager.getMove(moveIds.surf);
const strength = dataManager.getMove(moveIds.strength);
const flamethrower = dataManager.getMove(moveIds.flamethrower);
const swift = dataManager.getMove(moveIds.swift);
const thunder = dataManager.getMove(moveIds.thunder);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock RNG that returns a specific value for int(min, max) calls.
 * The intValue is scaled into the [min, max] range.
 * For doesMoveHit, rng.int(1, 100) is called once at the end.
 * intValue of 0.85 → Math.floor(0.85 * 100) + 1 = 86
 */
function createMockRng(intValue: number) {
  return {
    next: () => 0.5,
    int: (min: number, max: number) => {
      return Math.floor(intValue * (max - min + 1)) + min;
    },
    chance: (_numerator: number, _denominator: number) => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createOnFieldPokemon(opts: {
  types?: PokemonType[];
  ability?: string;
  status?: PrimaryStatus | null;
  hp?: number;
  maxHp?: number;
  statStages?: Partial<{
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    accuracy: number;
    evasion: number;
  }>;
}): ActivePokemon {
  const maxHp = opts.maxHp ?? 200;
  const stats: StatBlock = {
    hp: maxHp,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = createPokemonInstance(defaultSpecies, 50, new SeededRandom(3), {
    nature: GEN3_NATURE_IDS.hardy,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs(),
    abilitySlot: "normal1",
    gender: "male",
    heldItem: null,
    isShiny: false,
    metLocation: "test",
    originalTrainer: "test",
    originalTrainerId: 0,
  });
  pokemon.currentHp = opts.hp ?? maxHp;
  pokemon.ability = opts.ability ?? abilities.none;
  pokemon.status = opts.status ?? null;
  pokemon.calculatedStats = stats;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: opts.statStages?.speed ?? 0,
      accuracy: opts.statStages?.accuracy ?? 0,
      evasion: opts.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: opts.types ?? [...defaultSpecies.types],
    ability: opts.ability ?? abilities.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  } as unknown as ActivePokemon;
}

function createMinimalBattleState(
  side0Active: ActivePokemon,
  side1Active: ActivePokemon,
  weatherType?: string | null,
): BattleState {
  return {
    sides: [
      {
        active: [side0Active],
        team: [side0Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [side1Active],
        team: [side1Active.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: weatherType
      ? { type: weatherType, turnsLeft: 5, source: null }
      : { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

// ===========================================================================
// Limber blocks paralysis through canInflictGen3Status
// ===========================================================================

describe("Gen 3 Limber ability immunity integration", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_LIMBER blocks STATUS_PARALYSIS

  it("given target with Limber, when attempting to inflict paralysis, then returns false", () => {
    // Source: pret/pokeemerald — Limber blocks paralysis
    const target = createOnFieldPokemon({ types: [typeIds.normal], ability: abilities.limber });
    expect(canInflictGen3Status(statusIds.paralysis, target)).toBe(false);
  });

  it("given target with Limber, when attempting to inflict burn, then returns true (Limber only blocks paralysis)", () => {
    // Source: pret/pokeemerald — Limber does NOT block burn
    const target = createOnFieldPokemon({ types: [typeIds.normal], ability: abilities.limber });
    expect(canInflictGen3Status(statusIds.burn, target)).toBe(true);
  });

  it("given Electric-type target without Limber, when attempting to inflict paralysis, then returns true (no Electric immunity in Gen 3)", () => {
    // Source: pret/pokeemerald src/battle_util.c — CanBeStatusd has no Electric-type paralysis check
    // Electric-type paralysis immunity was introduced in Gen 6.
    // Source: Bulbapedia — "In Generation VI onward, Electric-type Pokemon are immune to paralysis."
    const target = createOnFieldPokemon({ types: [typeIds.electric], ability: abilities.static });
    expect(canInflictGen3Status(statusIds.paralysis, target)).toBe(true);
  });

  it("given Normal-type target without Limber, when attempting to inflict paralysis, then returns true", () => {
    // Source: pret/pokeemerald — Normal types with no blocking ability can be paralyzed
    const target = createOnFieldPokemon({ types: [typeIds.normal], ability: abilities.thickFat });
    expect(canInflictGen3Status(statusIds.paralysis, target)).toBe(true);
  });
});

// ===========================================================================
// Insomnia blocks sleep through canInflictGen3Status
// ===========================================================================

describe("Gen 3 Insomnia ability immunity integration", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_INSOMNIA blocks STATUS_SLEEP

  it("given target with Insomnia, when attempting to inflict sleep, then returns false", () => {
    const target = createOnFieldPokemon({ types: [typeIds.psychic], ability: abilities.insomnia });
    expect(canInflictGen3Status(statusIds.sleep, target)).toBe(false);
  });

  it("given target with Vital Spirit, when attempting to inflict sleep, then returns false", () => {
    // Source: pret/pokeemerald — Vital Spirit also blocks sleep
    const target = createOnFieldPokemon({
      types: [typeIds.fighting],
      ability: abilities.vitalSpirit,
    });
    expect(canInflictGen3Status(statusIds.sleep, target)).toBe(false);
  });

  it("given target with Insomnia, when attempting to inflict poison, then returns true (Insomnia only blocks sleep)", () => {
    const target = createOnFieldPokemon({ types: [typeIds.psychic], ability: abilities.insomnia });
    expect(canInflictGen3Status(statusIds.poison, target)).toBe(true);
  });
});

// ===========================================================================
// Inner Focus blocks flinch through isGen3VolatileBlockedByAbility
// ===========================================================================

describe("Gen 3 Inner Focus volatile immunity integration", () => {
  // Source: pret/pokeemerald src/battle_util.c — ABILITY_INNER_FOCUS blocks flinch

  it("given target with Inner Focus, when checking flinch volatile, then returns true (blocked)", () => {
    expect(isGen3VolatileBlockedByAbility(abilities.innerFocus, volatileIds.flinch)).toBe(true);
  });

  it("given target with Inner Focus, when checking confusion volatile, then returns false (Inner Focus only blocks flinch)", () => {
    expect(isGen3VolatileBlockedByAbility(abilities.innerFocus, volatileIds.confusion)).toBe(false);
  });

  it("given target with Own Tempo, when checking confusion volatile, then returns true (blocked)", () => {
    // Source: pret/pokeemerald — Own Tempo blocks confusion
    expect(isGen3VolatileBlockedByAbility(abilities.ownTempo, volatileIds.confusion)).toBe(true);
  });
});

// ===========================================================================
// doesMoveHit with accuracy-modifying abilities
// ===========================================================================

describe("Gen 3 doesMoveHit with accuracy-modifying abilities", () => {
  // Source: pret/pokeemerald src/battle_script_commands.c — accuracy formula

  it("given attacker with Compound Eyes using a 75-accuracy move, when rng rolls 96, then move hits (accuracy = floor(75 * 1.3) = 97)", () => {
    // Source: pret/pokeemerald — Compound Eyes multiplies accuracy by 1.3x
    // calc = floor(75 * 1 / 1) = 75 (stage 0 ratio)
    // calc = floor(75 * 130 / 100) = floor(97.5) = 97
    // rng.int(1,100) = floor(0.95 * 100) + 1 = 96 → 96 <= 97 → hit
    const attacker = createOnFieldPokemon({ ability: abilities.compoundEyes });
    const defender = createOnFieldPokemon({});
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(0.95);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: sleepPowder,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given attacker with Compound Eyes using a 75-accuracy move, when rng rolls 98, then move misses (accuracy = 97)", () => {
    // Source: pret/pokeemerald — Compound Eyes: floor(75 * 130 / 100) = 97
    // rng.int(1,100) = floor(0.97 * 100) + 1 = 98 → 98 > 97 → miss
    const attacker = createOnFieldPokemon({ ability: abilities.compoundEyes });
    const defender = createOnFieldPokemon({});
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(0.97);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: sleepPowder,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false);
  });

  it("given defender with Sand Veil in sandstorm using a 100-accuracy move, when rng rolls 86, then move misses (accuracy = floor(100 * 0.8) = 80)", () => {
    // Source: pret/pokeemerald — Sand Veil reduces opponent accuracy by 0.8x in sandstorm
    // calc = floor(100 * 1 / 1) = 100 (stage 0)
    // calc = floor(100 * 80 / 100) = 80
    // rng.int(1,100) = floor(0.85 * 100) + 1 = 86 → 86 > 80 → miss
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({ ability: abilities.sandVeil });
    const state = createMinimalBattleState(attacker, defender, weatherIds.sand);
    const rng = createMockRng(0.85);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: surf,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false);
  });

  it("given defender with Sand Veil in sandstorm using a 100-accuracy move, when rng rolls 80, then move hits (accuracy = 80)", () => {
    // Source: pret/pokeemerald — Sand Veil: calc = 80
    // rng.int(1,100) = floor(0.79 * 100) + 1 = 80 → 80 <= 80 → hit
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({ ability: abilities.sandVeil });
    const state = createMinimalBattleState(attacker, defender, weatherIds.sand);
    const rng = createMockRng(0.79);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: surf,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given attacker with Hustle using a physical-type move with 100 accuracy, when rng rolls 81, then move hits (accuracy = floor(100 * 0.8) = 80 but roll is at boundary)", () => {
    // Source: pret/pokeemerald — Hustle: 0.8x accuracy for physical moves
    // calc = floor(100 * 80 / 100) = 80
    // rng.int(1,100) = floor(0.79 * 100) + 1 = 80 → 80 <= 80 → hit
    const attacker = createOnFieldPokemon({ ability: abilities.hustle });
    const defender = createOnFieldPokemon({});
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(0.79);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: strength,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given attacker with Hustle using a physical-type move with 100 accuracy, when rng rolls 81, then move misses", () => {
    // Source: pret/pokeemerald — Hustle: calc = 80
    // rng.int(1,100) = floor(0.80 * 100) + 1 = 81 → 81 > 80 → miss
    const attacker = createOnFieldPokemon({ ability: abilities.hustle });
    const defender = createOnFieldPokemon({});
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(0.8);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: strength,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false);
  });

  it("given attacker with Hustle using a special-type move, when accuracy is 100, then Hustle does NOT reduce accuracy", () => {
    // Source: pret/pokeemerald — Hustle only affects physical moves
    // Gen 3 special types: Fire, Water, Electric, Grass, Ice, Psychic, Dragon, Dark
    // calc = 100 (unmodified by Hustle)
    // rng.int(1,100) = floor(0.85 * 100) + 1 = 86 → 86 <= 100 → hit
    const attacker = createOnFieldPokemon({ ability: abilities.hustle });
    const defender = createOnFieldPokemon({});
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(0.85);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: flamethrower,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given a never-miss move (accuracy === null), when any abilities are active, then move always hits", () => {
    // Source: pret/pokeemerald — Moves with null accuracy bypass all accuracy checks
    // Examples: Swift, Aerial Ace, Shock Wave
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({ ability: abilities.sandVeil });
    const state = createMinimalBattleState(attacker, defender, weatherIds.sand);
    const rng = createMockRng(0.99); // worst possible roll

    const context: AccuracyContext = {
      attacker,
      defender,
      move: swift,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given Thunder in rain, when accuracy check is called, then move always hits regardless of evasion", () => {
    // Source: pret/pokeemerald — Thunder bypasses accuracy check in rain
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({ statStages: { evasion: 6 } });
    const state = createMinimalBattleState(attacker, defender, weatherIds.rain);
    const rng = createMockRng(0.99);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: thunder,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true);
  });

  it("given Thunder in sun, when rng rolls 51, then move misses (accuracy reduced to 50)", () => {
    // Source: pret/pokeemerald — Thunder has 50% accuracy in sun
    // calc = floor(1 * 50 / 1) = 50 (stage 0 ratio)
    // rng.int(1,100) = floor(0.51 * 100) + 1 = 52 → 52 > 50 → miss
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({});
    const state = createMinimalBattleState(attacker, defender, weatherIds.sun);
    const rng = createMockRng(0.51);

    const context: AccuracyContext = {
      attacker,
      defender,
      move: thunder,
      state,
      rng: rng as AccuracyContext["rng"],
    };

    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Full status immunity pipeline through canInflictGen3Status
// ===========================================================================

describe("Gen 3 full status immunity pipeline", () => {
  // Source: pret/pokeemerald src/battle_util.c — full CanBeStatusd function

  it("given Fire-type target, when attempting to inflict burn, then returns false (type immunity)", () => {
    // Source: pret/pokeemerald — Fire types immune to burn
    const target = createOnFieldPokemon({ types: [typeIds.fire], ability: abilities.blaze });
    expect(canInflictGen3Status(statusIds.burn, target)).toBe(false);
  });

  it("given Ice-type target, when attempting to inflict freeze, then returns false (type immunity)", () => {
    // Source: pret/pokeemerald — Ice types immune to freeze
    const target = createOnFieldPokemon({ types: [typeIds.ice], ability: abilities.thickFat });
    expect(canInflictGen3Status(statusIds.freeze, target)).toBe(false);
  });

  it("given Poison-type target, when attempting to inflict poison, then returns false (type immunity)", () => {
    // Source: pret/pokeemerald — Poison types immune to poison
    const target = createOnFieldPokemon({ types: [typeIds.poison], ability: abilities.stench });
    expect(canInflictGen3Status(statusIds.poison, target)).toBe(false);
  });

  it("given Steel-type target, when attempting to inflict badly-poisoned, then returns false (type immunity)", () => {
    // Source: pret/pokeemerald — Steel types immune to poison/badly-poisoned
    const target = createOnFieldPokemon({ types: [typeIds.steel], ability: abilities.sturdy });
    expect(canInflictGen3Status(statusIds.badlyPoisoned, target)).toBe(false);
  });

  it("given Water Veil ability, when attempting to inflict burn, then returns false (ability immunity)", () => {
    // Source: pret/pokeemerald — Water Veil blocks burn
    const target = createOnFieldPokemon({ types: [typeIds.water], ability: abilities.waterVeil });
    expect(canInflictGen3Status(statusIds.burn, target)).toBe(false);
  });

  it("given Magma Armor ability, when attempting to inflict freeze, then returns false (ability immunity)", () => {
    // Source: pret/pokeemerald — Magma Armor blocks freeze
    const target = createOnFieldPokemon({ types: [typeIds.fire], ability: abilities.magmaArmor });
    expect(canInflictGen3Status(statusIds.freeze, target)).toBe(false);
  });

  it("given target already has a status, when attempting to inflict another, then returns false", () => {
    // Source: pret/pokeemerald — only one primary status at a time
    const target = createOnFieldPokemon({
      types: [typeIds.normal],
      ability: abilities.blaze,
      status: statusIds.burn,
    });
    expect(canInflictGen3Status(statusIds.paralysis, target)).toBe(false);
  });

  it("given dual-type Poison/Flying target, when attempting to inflict poison, then returns false (Poison typing blocks it)", () => {
    // Source: pret/pokeemerald — any type in the dual typing triggers immunity
    const target = createOnFieldPokemon({
      types: [typeIds.poison, typeIds.flying],
      ability: abilities.innerFocus,
    });
    expect(canInflictGen3Status(statusIds.poison, target)).toBe(false);
  });
});
