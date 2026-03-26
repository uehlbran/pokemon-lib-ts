/**
 * Missing Mechanics Tests for Gen 2
 *
 * Covers the following GitHub issues:
 *   #360 — calculateBindDamage unit tests
 *   #361 — processPerishSong countdown and faint
 *   #362 — shiny DV determination formula
 *   #363 — Pursuit double power on switch-out
 *   #364 — Thunder accuracy in rain/sun, SolarBeam power in weather
 *   #365 — OHKO level-based accuracy formula
 *   #367 — Moonlight/Morning Sun/Synthesis weather-dependent healing
 *   #368 — Bright Powder accuracy reduction
 *   #373 — Hidden Power physical-type category path
 */

import type {
  AccuracyContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen2DataManager, GEN2_ITEM_IDS, GEN2_MOVE_IDS, GEN2_SPECIES_IDS } from "../../src";
import { calculateGen2Damage } from "../../src/Gen2DamageCalc";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";
import { checkIsShinyByDVs } from "../../src/Gen2StatCalc";
import { GEN2_TYPE_CHART } from "../../src/Gen2TypeChart";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const gen2Data = createGen2DataManager();
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN2_MOVE_IDS } as const;
const ITEM_IDS = GEN2_ITEM_IDS;
const SPECIES_IDS = GEN2_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const DEFAULT_MOVE = gen2Data.getMove(MOVE_IDS.tackle);
const DEFAULT_SPECIES = gen2Data.getSpecies(SPECIES_IDS.bulbasaur);
const DEFAULT_SYNTHETIC_STATS = {
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

function getMove(moveId: string, overrides: Partial<MoveData> = {}): MoveData {
  const move = gen2Data.getMove(moveId);
  return {
    ...move,
    ...overrides,
    flags: { ...move.flags, ...overrides.flags },
  } as MoveData;
}

function createSyntheticMove(moveId: string, overrides: Partial<MoveData>): MoveData {
  return getMove(moveId, overrides);
}

function createMockActive(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    status: string | null;
    types: PokemonType[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    ivs: Partial<{
      hp: number;
      attack: number;
      defense: number;
      spAttack: number;
      spDefense: number;
      speed: number;
    }>;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: overrides.speciesId ?? SPECIES_IDS.bulbasaur,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: {
        hp: overrides.ivs?.hp ?? 15,
        attack: overrides.ivs?.attack ?? 15,
        defense: overrides.ivs?.defense ?? 15,
        spAttack: overrides.ivs?.spAttack ?? 15,
        spDefense: overrides.ivs?.spDefense ?? 15,
        speed: overrides.ivs?.speed ?? 15,
      },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [
        {
          moveId: MOVE_IDS.tackle,
          currentPP: DEFAULT_MOVE.pp,
          maxPP: DEFAULT_MOVE.pp,
          ppUps: 0,
        },
      ],
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? DEFAULT_SYNTHETIC_STATS.attack,
        defense: overrides.defense ?? DEFAULT_SYNTHETIC_STATS.defense,
        spAttack: overrides.spAttack ?? DEFAULT_SYNTHETIC_STATS.spAttack,
        spDefense: overrides.spDefense ?? DEFAULT_SYNTHETIC_STATS.spDefense,
        speed: overrides.speed ?? DEFAULT_SYNTHETIC_STATS.speed,
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
    types: overrides.types ?? [TYPES.normal],
    ability: CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    turnsOnField: 0,
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

function createMockSide(index: 0 | 1, active: ActivePokemon): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createMockState(
  side0: BattleSide,
  side1: BattleSide,
  weather: { type: string; turnsLeft: number } | null = null,
): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

/** A mock RNG whose int() always returns a fixed value. */
function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

// ---------------------------------------------------------------------------
// Issue #360 — calculateBindDamage
// ---------------------------------------------------------------------------

describe("Issue #360 — calculateBindDamage", () => {
  const ruleset = new Gen2Ruleset();

  it("given a trapped Pokemon with maxHP=160, when calculateBindDamage is called, then damage = floor(160/16) = 10", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — wrap damage is 1/16 max HP
    // Wrap/Bind/Clamp/etc. deal 1/16 of max HP each turn in Gen 2-4.
    // Arrange
    const pokemon = createMockActive({ maxHp: 160 });

    // Act
    const damage = ruleset.calculateBindDamage(pokemon);

    // Assert: floor(160 / 16) = 10
    expect(damage).toBe(10);
  });

  it("given a trapped Pokemon with maxHP=200, when calculateBindDamage is called, then damage = floor(200/16) = 12", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — wrap damage is 1/16 max HP
    // Second triangulation case: 200 / 16 = 12.5, floor = 12
    // Arrange
    const pokemon = createMockActive({ maxHp: 200 });

    // Act
    const damage = ruleset.calculateBindDamage(pokemon);

    // Assert: floor(200 / 16) = 12
    expect(damage).toBe(12);
  });

  it("given a trapped Pokemon with maxHP=1 (edge case), when calculateBindDamage is called, then damage = 1 (minimum)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — minimum 1 damage
    // floor(1 / 16) = 0 → clamped to 1
    // Arrange
    const pokemon = createMockActive({ maxHp: 1 });

    // Act
    const damage = ruleset.calculateBindDamage(pokemon);

    // Assert: at least 1 damage (minimum clamp)
    expect(damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Issue #361 — processPerishSong countdown and faint
// ---------------------------------------------------------------------------

describe("Issue #361 — processPerishSong countdown and faint", () => {
  const ruleset = new Gen2Ruleset();

  it("given Pokemon affected by Perish Song with counter=3, when processPerishSong called, then counter decrements to 2 and no faint", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Perish Song counter decrements each turn
    // Counter starts at 3, decrements to 0, faints at 0.
    // Arrange
    const pokemon = createMockActive();
    pokemon.volatileStatuses.set(VOLATILES.perishSong, { turnsLeft: 3 });

    // Act
    const result = ruleset.processPerishSong(pokemon);

    // Assert
    expect(result.newCount).toBe(2);
    expect(result.fainted).toBe(false);
  });

  it("given Pokemon affected by Perish Song with counter=2, when processPerishSong called, then counter decrements to 1 and no faint", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Perish Song counter
    // Triangulation: second step of the countdown.
    // Arrange
    const pokemon = createMockActive();
    pokemon.volatileStatuses.set(VOLATILES.perishSong, { turnsLeft: 2 });

    // Act
    const result = ruleset.processPerishSong(pokemon);

    // Assert
    expect(result.newCount).toBe(1);
    expect(result.fainted).toBe(false);
  });

  it("given Pokemon affected by Perish Song with counter=1, when processPerishSong called, then fainted=true", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Perish Song counter reaches 0 → faint
    // When counter <= 1, the Pokemon faints this turn.
    // Arrange
    const pokemon = createMockActive();
    pokemon.volatileStatuses.set(VOLATILES.perishSong, { turnsLeft: 1 });

    // Act
    const result = ruleset.processPerishSong(pokemon);

    // Assert
    expect(result.fainted).toBe(true);
    expect(result.newCount).toBe(0);
  });

  it("given Pokemon not affected by Perish Song, when processPerishSong called, then no faint and counter 0", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — no perish-song volatile = no effect
    // Arrange
    const pokemon = createMockActive();
    // No perish-song volatile

    // Act
    const result = ruleset.processPerishSong(pokemon);

    // Assert
    expect(result.fainted).toBe(false);
    expect(result.newCount).toBe(0);
  });

  it("given Pokemon with Perish Song using data.counter, when processPerishSong called three times, then faints on third call", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Perish Song three-turn countdown
    // Full 3-turn simulation using data.counter storage path.
    // Arrange
    const pokemon = createMockActive();
    pokemon.volatileStatuses.set(VOLATILES.perishSong, {
      turnsLeft: 3,
      data: { counter: 3 },
    });

    // Act & Assert — turn 1
    const turn1 = ruleset.processPerishSong(pokemon);
    expect(turn1.newCount).toBe(2);
    expect(turn1.fainted).toBe(false);

    // Update counter (simulate engine decrement)
    const state1 = pokemon.volatileStatuses.get(VOLATILES.perishSong);
    if (state1?.data) state1.data.counter = 2;

    // Act & Assert — turn 2
    const turn2 = ruleset.processPerishSong(pokemon);
    expect(turn2.newCount).toBe(1);
    expect(turn2.fainted).toBe(false);

    // Update counter
    const state2 = pokemon.volatileStatuses.get(VOLATILES.perishSong);
    if (state2?.data) state2.data.counter = 1;

    // Act & Assert — turn 3 (faint)
    const turn3 = ruleset.processPerishSong(pokemon);
    expect(turn3.fainted).toBe(true);
    expect(turn3.newCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Issue #362 — shiny DV determination formula
// ---------------------------------------------------------------------------

describe("Issue #362 — checkIsShinyByDVs", () => {
  it("given DVs Defense=10, Speed=10, Special=10, Attack=10 (bit 1 set), when checking isShiny, then returns true", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm — CheckShininess
    // Source: pret/pokecrystal engine/gfx/color.asm:3-6 — SHINY_ATK_MASK=%0010, SHINY_DEF_DV=10, SHINY_SPD_DV=10, SHINY_SPC_DV=10
    // Attack=10 (0b1010) has bit 1 set → shiny
    expect(checkIsShinyByDVs(10, 10, 10, 10)).toBe(true);
  });

  it("given DVs Defense=10, Speed=10, Special=10, Attack=2 (bit 1 set), when checking isShiny, then returns true", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm — CheckShininess
    // Attack=2 (0b0010) has bit 1 set → shiny
    // This is the minimum Attack DV value that produces shininess
    expect(checkIsShinyByDVs(2, 10, 10, 10)).toBe(true);
  });

  it("given DVs Defense=10, Speed=10, Special=10, Attack=3 (bit 1 set), when checking isShiny, then returns true", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm:3 — SHINY_ATK_MASK = %0010
    // Attack=3 (0b0011) has bit 1 set → shiny
    expect(checkIsShinyByDVs(3, 10, 10, 10)).toBe(true);
  });

  it("given DVs Defense=10, Speed=10, Special=10, Attack=1 (bit 1 NOT set), when checking isShiny, then returns false", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm:17-18 — AND SHINY_ATK_MASK<<4, jr z .not_shiny
    // Attack=1 (0b0001) has bit 1 NOT set → NOT shiny
    expect(checkIsShinyByDVs(1, 10, 10, 10)).toBe(false);
  });

  it("given DVs Defense=9 (not 10), Speed=10, Special=10, Attack=10, when checking isShiny, then returns false", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm:4 — SHINY_DEF_DV EQU 10; cp SHINY_DEF_DV; jr nz .not_shiny
    // Defense must be exactly 10
    expect(checkIsShinyByDVs(10, 9, 10, 10)).toBe(false);
  });

  it("given DVs Defense=10, Speed=9 (not 10), Special=10, Attack=10, when checking isShiny, then returns false", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm:5 — SHINY_SPD_DV EQU 10
    // Speed must be exactly 10
    expect(checkIsShinyByDVs(10, 10, 9, 10)).toBe(false);
  });

  it("given DVs Defense=10, Speed=10, Special=9 (not 10), Attack=10, when checking isShiny, then returns false", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm:6 — SHINY_SPC_DV EQU 10
    // Special DV must be exactly 10
    expect(checkIsShinyByDVs(10, 10, 10, 9)).toBe(false);
  });

  it("given all-zero DVs, when checking isShiny, then returns false", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm — CheckShininess; none of the conditions met
    // All DVs = 0, none match the shiny requirements
    expect(checkIsShinyByDVs(0, 0, 0, 0)).toBe(false);
  });

  it("given all-15 DVs (max IVs), when checking isShiny, then returns false", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm — CheckShininess
    // Attack=15 (0b1111) has bit 1 set, but Defense/Speed/Special all = 15 (not 10) → NOT shiny
    // Triangulation: verifies max-IV Pokemon are not shiny
    expect(checkIsShinyByDVs(15, 15, 15, 15)).toBe(false);
  });

  it("given the full set of valid Attack DVs {2,3,6,7,10,11,14,15}, when checking each with fixed Defense=Speed=Special=10, then all return true", () => {
    // Source: pret/pokecrystal engine/gfx/color.asm:3 — SHINY_ATK_MASK = %0010 means bit 1 of AtkDV must be set
    // The values with bit 1 set in range 0-15 are: 2,3,6,7,10,11,14,15
    const validAtkDvs = [2, 3, 6, 7, 10, 11, 14, 15];
    for (const atkDv of validAtkDvs) {
      expect(checkIsShinyByDVs(atkDv, 10, 10, 10)).toBe(true);
    }
    // And the invalid ones (bit 1 NOT set): 0,1,4,5,8,9,12,13
    const invalidAtkDvs = [0, 1, 4, 5, 8, 9, 12, 13];
    for (const atkDv of invalidAtkDvs) {
      expect(checkIsShinyByDVs(atkDv, 10, 10, 10)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Issue #363 — Pursuit double power on switch-out
// ---------------------------------------------------------------------------

describe("Issue #363 — Pursuit double power on switch-out", () => {
  it("given Pursuit used with powerMultiplier=2 (pre-switch), when calculating damage, then uses doubled BP (80 instead of 40)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Pursuit doubles base power when target switches
    // The engine passes powerMultiplier=2 to executeMove when Pursuit fires pre-switch.
    // We test the damage calc directly: same attacker/defender, power=80 vs power=40, ratio should be ~2x.
    // Arrange
    const attacker = createMockActive({ level: 50, attack: 100, types: [TYPES.dark] });
    const defender = createMockActive({ defense: 100, types: [TYPES.normal] });
    const rng = createMockRng(255); // Max damage roll for deterministic comparison
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const pursuitNormal = getMove(MOVE_IDS.pursuit);
    const pursuitDoubled = createSyntheticMove(MOVE_IDS.pursuit, {
      power: 80,
    });

    // Act
    const normalDmg = calculateGen2Damage(
      { attacker, defender, move: pursuitNormal, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );
    const doubledDmg = calculateGen2Damage(
      { attacker, defender, move: pursuitDoubled, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: doubled power yields the observed deterministic damage increase.
    expect(normalDmg.damage).toBe(28);
    expect(doubledDmg.damage).toBe(55);
  });

  it("given Pursuit used normally (no switch), when calculating damage, then uses standard BP (40)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — normal Pursuit BP = 40
    // When no switch occurs, Pursuit fires as a normal 40-BP move.
    // Arrange
    const attacker = createMockActive({ level: 50, attack: 100, types: [TYPES.dark] });
    const defender = createMockActive({ defense: 100, types: [TYPES.normal] });
    const rng = createMockRng(255);
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const pursuitMove = getMove(MOVE_IDS.pursuit);

    // Act
    const result = calculateGen2Damage(
      { attacker, defender, move: pursuitMove, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: normal 40 BP dark (special) move: L50, SpAtk=100, SpDef=100, no STAB (attacker types=dark but default spAttack=100)
    // Formula: levelFactor=22, power=40, atk=100 (spAtk, dark=special), def=100 (spDef)
    // baseDamage = floor(floor(22*40*100)/100)/50 = floor(880)/50 = 17; +2 = 19
    // STAB (attacker dark, move dark): floor(19*1.5) = 28; RNG=255 (max): floor(28*255/255) = 28
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BattleCommand_DamageCalc
    expect(result.damage).toBe(28);
  });

  it("given Gen2Ruleset, when calling shouldExecutePursuitPreSwitch, then returns true", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — Pursuit pre-switch is Gen 2 mechanic
    // The ruleset must signal the engine to handle Pursuit pre-switch execution.
    const ruleset = new Gen2Ruleset();
    expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue #364 — Thunder in rain / SolarBeam power in weather
// ---------------------------------------------------------------------------

describe("Issue #364 — Thunder accuracy in rain/sun, SolarBeam weather interactions", () => {
  const ruleset = new Gen2Ruleset();

  const thunderMove = getMove(MOVE_IDS.thunder);

  it("given Rain weather is active, when Thunder is used, then accuracy check always returns true (bypassed)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:1286-1290
    // "ld a, BATTLE_WEATHER_RAIN ; cp [wBattleWeather] ; ret z" — if rain, skip accuracy check (always hits)
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: WEATHER.rain,
      turnsLeft: 4,
    });

    // Act: even the highest possible accuracy roll is bypassed in rain.
    const rngMaxRoll = { int: (_min: number, max: number) => max } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: thunderMove,
      state,
      rng: rngMaxRoll,
    } as unknown as AccuracyContext);

    expect(hitResult).toBe(true);
  });

  it("given no weather and roll=177, when Thunder is used, then hits (177 < 178 accuracy threshold)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm ThunderAccuracy
    // Without rain, Thunder uses base 70% accuracy → floor(70*255/100) = 178 on 0-255 scale.
    // Hit condition: rng.int(0,255) < 178. Roll 177 is the highest-roll hit.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(
      createMockSide(0, attacker),
      createMockSide(1, defender),
      null, // no weather
    );

    const rngHit = { int: (_min: number, _max: number) => 177 } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: thunderMove,
      state,
      rng: rngHit,
    } as unknown as AccuracyContext);

    expect(hitResult).toBe(true);
  });

  it("given no weather and roll=178, when Thunder is used, then misses (178 >= 178 accuracy threshold)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm ThunderAccuracy
    // Thunder base accuracy = 70% → 178 on 0-255 scale. Roll 178 is exactly the miss boundary.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(
      createMockSide(0, attacker),
      createMockSide(1, defender),
      null, // no weather
    );

    const rngMiss = { int: (_min: number, _max: number) => 178 } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: thunderMove,
      state,
      rng: rngMiss,
    } as unknown as AccuracyContext);

    expect(hitResult).toBe(false);
  });

  it("given SolarBeam in Rain weather, when calculating damage, then power is halved (60 instead of 120)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
    // In rain or sandstorm, SolarBeam power is halved before damage calc.
    // Arrange
    const attacker = createMockActive({ level: 50, spAttack: 100, types: [TYPES.grass] });
    const defender = createMockActive({ spDefense: 100, types: [TYPES.normal] });
    const rng = createMockRng(255);
    const rainState = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: WEATHER.rain,
      turnsLeft: 4,
    });
    const clearState = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const solarBeam = getMove(MOVE_IDS.solarBeam);

    // Act
    const rainDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: rainState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );
    const clearDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: clearState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: rain halves SolarBeam power → ~halved damage
    // Note: weather modifier also reduces grass damage in rain, so total reduction is greater.
    // Key assertion: rain damage < clear damage
    expect(rainDmg.damage).toBeLessThan(clearDmg.damage);
  });

  it("given SolarBeam in Sandstorm weather, when calculating damage, then power is halved", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
    // In sandstorm (as well as rain), SolarBeam power is halved.
    // Arrange
    const attacker = createMockActive({ level: 50, spAttack: 100, types: [TYPES.grass] });
    const defender = createMockActive({ spDefense: 100, types: [TYPES.normal] });
    const rng = createMockRng(255);
    const sandState = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: WEATHER.sand,
      turnsLeft: 4,
    });
    const clearState = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const solarBeam = getMove(MOVE_IDS.solarBeam);

    // Act
    const sandDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: sandState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );
    const clearDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: clearState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: sandstorm halves SolarBeam power → less damage
    expect(sandDmg.damage).toBeLessThan(clearDmg.damage);
  });

  it("given SolarBeam in Sunny weather, when calculating damage, then power is NOT halved (receives sun boost)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
    // In sunny weather, SolarBeam does NOT have halved power. It fires immediately
    // and gets the sun boost (1.5x for fire/water, but grass/sun is 1.0x in Gen 2).
    // Key: damage should equal or exceed clear weather (not be halved)
    // Arrange
    const attacker = createMockActive({ level: 50, spAttack: 100, types: [TYPES.grass] });
    const defender = createMockActive({ spDefense: 100, types: [TYPES.normal] });
    const rng = createMockRng(255);
    const sunState = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: WEATHER.sun,
      turnsLeft: 4,
    });
    const clearState = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const solarBeam = getMove(MOVE_IDS.solarBeam);

    // Act
    const sunDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: sunState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );
    const clearDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: clearState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: sun does NOT halve SolarBeam (no power reduction), same damage as clear weather.
    // Formula: levelFactor=22, power=120, spAtk=100, spDef=100, STAB (grass vs grass), RNG=255
    // baseDamage = floor(floor(22*120*100)/100)/50 = floor(2640)/50 = 52; clamp: 52; +2 = 54
    // Weather: grass in sun has no modifier; STAB: floor(54*1.5) = 81; RNG=255: 81
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower — sun = no halving
    expect(sunDmg.damage).toBe(81);
    expect(clearDmg.damage).toBe(81);
  });
});

// ---------------------------------------------------------------------------
// Issue #365 — OHKO level-based accuracy formula
// ---------------------------------------------------------------------------

describe("Issue #365 — OHKO moves level-based accuracy formula", () => {
  const ruleset = new Gen2Ruleset();

  const fissureMove = getMove(MOVE_IDS.fissure);

  it("given attacker L50 vs defender L40, when checking OHKO accuracy, then effective accuracy = 30 + 2*(50-40) = 50 (on 0-255 scale)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5420-5462 BattleCommand_OHKO
    // Formula: ohkoAcc = min(255, moveAcc + 2 * (attackerLevel - defenderLevel))
    // Then: rng(0-255) < ohkoAcc → hit
    // With L50 vs L40: ohkoAcc = 30 + 2*10 = 50. A roll of 0-255 < 50 → ~19.6% hit rate.
    // Arrange
    const attacker = createMockActive({ level: 50 });
    const defender = createMockActive({ level: 40 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act: test with a roll that guarantees a hit (roll < 50)
    const rngHit = { int: (min: number, _max: number) => min } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: rngHit,
    } as unknown as AccuracyContext);

    // A roll of 0 should always hit when ohkoAcc >= 1
    expect(hitResult).toBe(true);
  });

  it("given attacker L40 vs defender L50 (lower level), when checking OHKO accuracy, then auto-miss (always false)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5428-5432 BattleCommand_OHKO
    // "cp [wEnemyMonLevel] ; jp c, .fail" — if attacker level < defender level, OHKO always fails.
    const attacker = createMockActive({ level: 40 });
    const defender = createMockActive({ level: 50 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act: even the lowest possible roll still auto-misses before the RNG matters.
    const rngZero = { int: (_min: number, _max: number) => 0 } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: rngZero,
    } as unknown as AccuracyContext);

    expect(hitResult).toBe(false);
  });

  it("given attacker L100 vs defender L50 and roll=129, when checking OHKO accuracy, then hits (129 < 130 threshold)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5440 BattleCommand_OHKO
    // ohkoAcc = min(255, 30 + 2*(100-50)) = min(255, 130) = 130
    // Hit condition: rng.int(0,255) < 130. Roll 129 is the highest-roll hit.
    const attacker = createMockActive({ level: 100 });
    const defender = createMockActive({ level: 50 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const rngHit = { int: (_min: number, _max: number) => 129 } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: rngHit,
    } as unknown as AccuracyContext);

    expect(hitResult).toBe(true);
  });

  it("given attacker L100 vs defender L50 and roll=130, when checking OHKO accuracy, then misses (130 >= 130 threshold)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5440 BattleCommand_OHKO
    // ohkoAcc = 130. Roll 130 is exactly the miss boundary: 130 < 130 is false → miss.
    const attacker = createMockActive({ level: 100 });
    const defender = createMockActive({ level: 50 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const rngMiss = { int: (_min: number, _max: number) => 130 } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: rngMiss,
    } as unknown as AccuracyContext);

    expect(hitResult).toBe(false);
  });

  it("given attacker same level as defender (L50 vs L50), when checking OHKO accuracy, then uses base accuracy 30", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5428-5432 BattleCommand_OHKO
    // "jp c, .fail" — only fails when attacker level < defender level (NOT <=).
    // Equal level: ohkoAcc = 30 + 2*0 = 30 → ~11.8% hit rate (30/255 on 0-255 scale).
    // Arrange
    const attacker = createMockActive({ level: 50 });
    const defender = createMockActive({ level: 50 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act: a roll of 0 should always hit
    const rngZero = { int: (_min: number, _max: number) => 0 } as SeededRandom;
    const hitResult = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: rngZero,
    } as unknown as AccuracyContext);

    // Assert: a roll of 0 is always < 30, so it hits
    expect(hitResult).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue #367 — Moonlight/Morning Sun/Synthesis weather-dependent healing
// ---------------------------------------------------------------------------

describe("Issue #367 — Moonlight/Morning Sun/Synthesis weather healing", () => {
  const ruleset = new Gen2Ruleset();

  function createHealingMoveContext(
    moveId: string,
    maxHp: number,
    weather: { type: string; turnsLeft: number } | null,
  ): MoveEffectContext {
    const attacker = createMockActive({ maxHp, currentHp: 1 });
    const defender = createMockActive();
    const state = createMockState(
      createMockSide(0, attacker),
      createMockSide(1, defender),
      weather,
    );
    return {
      attacker,
      defender,
      move: getMove(moveId),
      damage: 0,
      state,
      rng: new SeededRandom(42),
    };
  }

  it("given maxHP=100, no weather, when using Moonlight, then heals floor(100 * 1/2) = 50 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // No weather: heals 1/2 max HP (floor)
    const context = createHealingMoveContext(MOVE_IDS.moonlight, 100, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(50);
  });

  it("given maxHP=100, no weather, when using Morning Sun, then heals 50 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Morning Sun has same healing formula as Moonlight/Synthesis.
    const context = createHealingMoveContext(MOVE_IDS.morningSun, 100, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(50);
  });

  it("given maxHP=100, no weather, when using Synthesis, then heals 50 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Synthesis has same healing formula.
    const context = createHealingMoveContext(MOVE_IDS.synthesis, 100, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(50);
  });

  it("given maxHP=100, sunny weather, when using Moonlight, then heals floor(100 * 2/3) = 66 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Sunny Day: heals 2/3 max HP (floor). floor(100 * 2/3) = floor(66.67) = 66
    const context = createHealingMoveContext(MOVE_IDS.moonlight, 100, {
      type: WEATHER.sun,
      turnsLeft: 4,
    });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(66);
  });

  it("given maxHP=150, sunny weather, when using Moonlight, then heals floor(150 * 2/3) = 100 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Triangulation: floor(150 * 2/3) = floor(100) = 100
    const context = createHealingMoveContext(MOVE_IDS.moonlight, 150, {
      type: WEATHER.sun,
      turnsLeft: 4,
    });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(100);
  });

  it("given maxHP=100, rain weather, when using Moonlight, then heals floor(100 * 1/4) = 25 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Rain Dance: heals 1/4 max HP (floor). floor(100 / 4) = 25
    const context = createHealingMoveContext(MOVE_IDS.moonlight, 100, {
      type: WEATHER.rain,
      turnsLeft: 4,
    });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(25);
  });

  it("given maxHP=100, sandstorm weather, when using Moonlight, then heals floor(100 * 1/4) = 25 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Sandstorm: also heals 1/4 max HP (floor)
    const context = createHealingMoveContext(MOVE_IDS.moonlight, 100, {
      type: WEATHER.sand,
      turnsLeft: 4,
    });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(25);
  });

  it("given maxHP=1 (edge case), no weather, when using Moonlight, then heals minimum 1 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // floor(1 * 1/2) = 0 → clamped to minimum 1
    const context = createHealingMoveContext(MOVE_IDS.moonlight, 1, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Issue #368 — Bright Powder accuracy reduction
// ---------------------------------------------------------------------------

describe("Issue #368 — Bright Powder accuracy reduction", () => {
  const ruleset = new Gen2Ruleset();

  const normalMove = getMove(MOVE_IDS.strength);

  it("given defender holds Bright Powder, when attacker uses a 100% accurate move, then effective accuracy is reduced by 20 (on 0-255 scale)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1074-1094 BrightPowderEffect
    // "sub 20" — subtracts 20 from the final accuracy value on the 0-255 scale.
    // 100% accuracy = 255/255 → 255 - 20 = 235 out of 255 = 92.2% effective.
    // Arrange
    const attacker = createMockActive();
    const defenderWithBP = createMockActive({ heldItem: ITEM_IDS.brightPowder });
    const defenderNoBP = createMockActive({ heldItem: null });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defenderWithBP));
    const stateNoBP = createMockState(createMockSide(0, attacker), createMockSide(1, defenderNoBP));

    // Act: use a deterministic roll to measure the difference
    // A roll of 240 (>= 235 but < 255) should miss with BrightPowder but hit without
    const rollAboveBPThreshold = { int: (_min: number, _max: number) => 240 } as SeededRandom;

    const hitWithBP = ruleset.doesMoveHit({
      attacker,
      defender: defenderWithBP,
      move: normalMove,
      state,
      rng: rollAboveBPThreshold,
    } as unknown as AccuracyContext);

    const hitWithoutBP = ruleset.doesMoveHit({
      attacker,
      defender: defenderNoBP,
      move: normalMove,
      state: stateNoBP,
      rng: rollAboveBPThreshold,
    } as unknown as AccuracyContext);

    // Assert: BrightPowder reduces accuracy — roll of 240 should miss with BP but hit without
    expect(hitWithoutBP).toBe(true); // 240 < 255 → hit (100% acc, no BP)
    expect(hitWithBP).toBe(false); // 240 >= 235 → miss (100% acc with BP reduces to 235)
  });

  it("given defender holds Bright Powder, when testing over 1000 seeds with 100% accurate move, then hit rate is approximately 92% (not 100%)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1074-1094 BrightPowderEffect
    // 100% accuracy = 255 on 0-255 scale. After BrightPowder: 255 - 20 = 235.
    // Hit rate = 235/255 ≈ 92.2%
    // Arrange
    const attacker = createMockActive();
    const defender = createMockActive({ heldItem: ITEM_IDS.brightPowder });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    let hits = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed++) {
      const rng = new SeededRandom(seed);
      if (
        ruleset.doesMoveHit({
          attacker,
          defender,
          move: normalMove,
          state,
          rng,
        } as unknown as AccuracyContext)
      ) {
        hits++;
      }
    }

    // Assert: hit rate approximately 235/255 ≈ 92.2%, with some variance
    const hitRate = hits / trials;
    expect(hitRate).toBeGreaterThan(0.87);
    expect(hitRate).toBeLessThan(0.97);
  });

  it("given defender without Bright Powder, when attacker uses 100% accurate move, then always hits (100% accuracy)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm — no BrightPowder item check
    // Without Bright Powder, 100% accurate moves should always hit in Gen 2 (no 1/256 miss bug).
    // Arrange
    const attacker = createMockActive();
    const defender = createMockActive({ heldItem: null });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    let misses = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const rng = new SeededRandom(seed);
      const hit = ruleset.doesMoveHit({
        attacker,
        defender,
        move: normalMove,
        state,
        rng,
      } as unknown as AccuracyContext);
      if (!hit) misses++;
    }

    // Assert: no misses without BrightPowder
    expect(misses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Issue #373 — Hidden Power physical-type category
// ---------------------------------------------------------------------------

describe("Issue #373 — Hidden Power physical-type category path", () => {
  it("given attacker with DVs that produce a physical HP type (Fighting), when calculating Hidden Power damage, then uses physical damage formula (Attack vs Defense)", () => {
    // Source: pret/pokecrystal engine/battle/hidden_power.asm — HiddenPowerDamage
    // Hidden Power type index = (atkDv & 3) * 4 + (defDv & 3)
    // HP_TYPES[0] = "fighting" (physical type in Gen 2)
    // To get index 0: (atkDv & 3)=0 and (defDv & 3)=0 → e.g., atkDv=0, defDv=0
    //
    // For fighting-type HP: uses Attack and Defense stats (physical)
    // Arrange
    // DVs: attack=0, defense=0 → typeIndex = (0&3)*4 + (0&3) = 0 → "fighting"
    const physAttacker = createMockActive({
      level: 50,
      attack: 200, // High attack — should boost physical HP damage
      spAttack: 50, // Low special attack — should NOT be used for physical HP
      types: [TYPES.normal],
      ivs: { attack: 0, defense: 0, speed: 0, spAttack: 0, spDefense: 0, hp: 0 },
    });
    const lowDefDefender = createMockActive({
      defense: 50, // Low defense — should result in high damage for physical HP
      spDefense: 200,
    });
    const highDefDefender = createMockActive({
      defense: 200, // High defense — should result in low damage for physical HP
      spDefense: 50,
    });

    const rng = createMockRng(255);
    const state = createMockState(
      createMockSide(0, physAttacker),
      createMockSide(1, lowDefDefender),
    );
    const stateHigh = createMockState(
      createMockSide(0, physAttacker),
      createMockSide(1, highDefDefender),
    );
    const hiddenPower = getMove(MOVE_IDS.hiddenPower);

    // Act
    const dmgLowDef = calculateGen2Damage(
      {
        attacker: physAttacker,
        defender: lowDefDefender,
        move: hiddenPower,
        state,
        rng,
        isCrit: false,
      },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );
    const dmgHighDef = calculateGen2Damage(
      {
        attacker: physAttacker,
        defender: highDefDefender,
        move: hiddenPower,
        state: stateHigh,
        rng,
        isCrit: false,
      },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: Fighting-type Hidden Power is physical in Gen 2 and its damage is deterministic here.
    expect(dmgLowDef.effectiveCategory).toBe(CORE_MOVE_CATEGORIES.physical);
    expect(dmgLowDef.damage).toBe(112);
    expect(dmgHighDef.damage).toBe(30);
    // Physical move uses Defense stat: low defense → more damage, high defense → less damage
    expect(dmgLowDef.damage).toBeGreaterThan(dmgHighDef.damage);
  });

  it("given attacker with DVs that produce a special HP type (Fire), when calculating Hidden Power, then effectiveCategory is CORE_MOVE_CATEGORIES.special", () => {
    // Source: pret/pokecrystal engine/battle/hidden_power.asm — HiddenPowerDamage
    // HP_TYPES[8] = "fire" (special type in Gen 2)
    // typeIndex = (atkDv & 3) * 4 + (defDv & 3)
    // To get index 8: (atkDv & 3)=2, (defDv & 3)=0 → 2*4+0=8 → "fire"
    // atkDv=2, defDv=0 → typeIndex = 8 → "fire" (special)
    // Arrange
    const specAttacker = createMockActive({
      level: 50,
      attack: 50,
      spAttack: 200, // High special attack — used for special HP
      types: [TYPES.fire],
      ivs: { attack: 2, defense: 0, speed: 0, spAttack: 0, spDefense: 0, hp: 0 },
    });
    const defender = createMockActive({ spDefense: 100 });
    const rng = createMockRng(255);
    const state = createMockState(createMockSide(0, specAttacker), createMockSide(1, defender));
    const hiddenPower = getMove(MOVE_IDS.hiddenPower);

    // Act
    const result = calculateGen2Damage(
      { attacker: specAttacker, defender, move: hiddenPower, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      DEFAULT_SPECIES,
    );

    // Assert: Fire type → special category, with deterministic damage.
    expect(result.effectiveCategory).toBe(CORE_MOVE_CATEGORIES.special);
    expect(result.damage).toBe(43);
  });

  it("given all Gen 2 physical HP types, when checking effectiveCategory, then all return CORE_MOVE_CATEGORIES.physical", () => {
    // Source: pret/pokecrystal engine/battle/hidden_power.asm — HiddenPowerDamage
    // Gen 2 physical types: normal, fighting, flying, ground, rock, bug, ghost, poison, steel
    // From HP_TYPES list (indices 0-7): fighting, flying, poison, ground, rock, bug, ghost, steel — ALL physical
    // This exercises the physical branch path for all 8 physical-type HP types.
    //
    // New decomp formula: typeIndex = (atkDv & 3) * 4 + (defDv & 3)
    // DV combinations for each index 0-7 (only atkDv and defDv matter for type):
    //   index 0: (atk&3)=0, (def&3)=0 → e.g., atk=0, def=0
    //   index 1: (atk&3)=0, (def&3)=1 → e.g., atk=0, def=1
    //   index 2: (atk&3)=0, (def&3)=2 → e.g., atk=0, def=2
    //   index 3: (atk&3)=0, (def&3)=3 → e.g., atk=0, def=3
    //   index 4: (atk&3)=1, (def&3)=0 → e.g., atk=1, def=0
    //   index 5: (atk&3)=1, (def&3)=1 → e.g., atk=1, def=1
    //   index 6: (atk&3)=1, (def&3)=2 → e.g., atk=1, def=2
    //   index 7: (atk&3)=1, (def&3)=3 → e.g., atk=1, def=3

    const dvCombos: [number, number, number, number][] = [
      [0, 0, 0, 0], // index 0 → fighting
      [0, 1, 0, 0], // index 1 → flying
      [0, 2, 0, 0], // index 2 → poison
      [0, 3, 0, 0], // index 3 → ground
      [1, 0, 0, 0], // index 4 → rock
      [1, 1, 0, 0], // index 5 → bug
      [1, 2, 0, 0], // index 6 → ghost
      [1, 3, 0, 0], // index 7 → steel
    ];

    for (const [atkDv, defDv, speDv, spcDv] of dvCombos) {
      const attacker = createMockActive({
        level: 50,
        attack: 100,
        types: [TYPES.normal],
        ivs: {
          attack: atkDv,
          defense: defDv,
          speed: speDv,
          spAttack: spcDv,
          spDefense: 15,
          hp: 15,
        },
      });
      // Use Water type for the defender to avoid Ghost-type immunity
      // (Ghost vs Normal-type is immune in Gen 2, which returns early without effectiveCategory)
      const defender = createMockActive({ types: [TYPES.water] });
      const rng = createMockRng(255);
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const hiddenPower = getMove(MOVE_IDS.hiddenPower);

      const result = calculateGen2Damage(
        { attacker, defender, move: hiddenPower, state, rng, isCrit: false },
        GEN2_TYPE_CHART,
        DEFAULT_SPECIES,
      );

      // Assert: indices 0-7 are all physical types
      expect(result.effectiveCategory).toBe(CORE_MOVE_CATEGORIES.physical);
    }
  });
});
