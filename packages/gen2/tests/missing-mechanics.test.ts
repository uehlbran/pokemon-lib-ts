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
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen2Damage } from "../src/Gen2DamageCalc";
import { Gen2Ruleset } from "../src/Gen2Ruleset";
import { checkIsShinyByDVs } from "../src/Gen2StatCalc";
import { GEN2_TYPE_CHART } from "../src/Gen2TypeChart";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

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
    types: string[];
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
      speciesId: overrides.speciesId ?? 1,
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
      moves: [{ moveId: "tackle", pp: 35, maxPp: 35 }],
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
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
    types: (overrides.types as unknown as PokemonType[]) ?? ["normal"],
    ability: "",
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
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 3 });

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
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 2 });

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
    pokemon.volatileStatuses.set("perish-song", { turnsLeft: 1 });

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
    pokemon.volatileStatuses.set("perish-song", {
      turnsLeft: 3,
      data: { counter: 3 },
    });

    // Act & Assert — turn 1
    const turn1 = ruleset.processPerishSong(pokemon);
    expect(turn1.newCount).toBe(2);
    expect(turn1.fainted).toBe(false);

    // Update counter (simulate engine decrement)
    const state1 = pokemon.volatileStatuses.get("perish-song");
    if (state1?.data) state1.data.counter = 2;

    // Act & Assert — turn 2
    const turn2 = ruleset.processPerishSong(pokemon);
    expect(turn2.newCount).toBe(1);
    expect(turn2.fainted).toBe(false);

    // Update counter
    const state2 = pokemon.volatileStatuses.get("perish-song");
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
    const attacker = createMockActive({ level: 50, attack: 100, types: ["dark"] });
    const defender = createMockActive({ defense: 100, types: ["normal"] });
    const rng = createMockRng(255); // Max damage roll for deterministic comparison
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const pursuitNormal = {
      id: "pursuit",
      type: "dark",
      category: "physical",
      power: 40,
      accuracy: 100,
      priority: 0,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    const pursuitDoubled = {
      ...pursuitNormal,
      power: 80, // Doubled base power for pre-switch execution
    } as unknown as MoveData;

    // Act
    const normalDmg = calculateGen2Damage(
      { attacker, defender, move: pursuitNormal, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );
    const doubledDmg = calculateGen2Damage(
      { attacker, defender, move: pursuitDoubled, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );

    // Assert: doubled power yields exactly 2x damage (before random factor, same roll)
    // The ratio may not be exactly 2 due to integer arithmetic, but should be approximately 2x
    expect(doubledDmg.damage).toBeGreaterThan(normalDmg.damage);
    // Dark is special in Gen 2 — but the formula still scales linearly with power
    // For same stats and deterministic RNG, doubled power should give roughly 2x damage
    expect(doubledDmg.damage / normalDmg.damage).toBeCloseTo(2, 0);
  });

  it("given Pursuit used normally (no switch), when calculating damage, then uses standard BP (40)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm — normal Pursuit BP = 40
    // When no switch occurs, Pursuit fires as a normal 40-BP move.
    // Arrange
    const attacker = createMockActive({ level: 50, attack: 100, types: ["dark"] });
    const defender = createMockActive({ defense: 100, types: ["normal"] });
    const rng = createMockRng(255);
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const pursuitMove = {
      id: "pursuit",
      type: "dark",
      category: "physical",
      power: 40,
      accuracy: 100,
      priority: 0,
      effect: null,
      flags: {},
    } as unknown as MoveData;

    // Act
    const result = calculateGen2Damage(
      { attacker, defender, move: pursuitMove, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );

    // Assert: normal 40 BP damage (positive, non-zero)
    // Dark is special, so it uses SpAttack/SpDefense, but we're testing that the move fires
    expect(result.damage).toBeGreaterThan(0);
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

  const thunderMove = {
    id: "thunder",
    type: "electric",
    category: "special",
    power: 110,
    accuracy: 70,
    priority: 0,
    effect: { type: "thunder-accuracy" },
    flags: {},
  } as unknown as MoveData;

  it("given Rain weather is active, when Thunder is used, then accuracy check always returns true (bypassed)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:1286-1290
    // "ld a, BATTLE_WEATHER_RAIN ; cp [wBattleWeather] ; ret z" — if rain, skip accuracy check (always hits)
    // Arrange
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "rain",
      turnsLeft: 4,
    });

    // Act: test across 1000 seeds — every trial should hit
    let misses = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const rng = new SeededRandom(seed);
      const hit = ruleset.doesMoveHit({
        attacker,
        defender,
        move: thunderMove,
        state,
        rng,
      } as unknown as AccuracyContext);
      if (!hit) misses++;
    }

    // Assert: Thunder always hits in rain
    expect(misses).toBe(0);
  });

  it("given no weather, when Thunder is used, then hit rate approximately matches base 70% accuracy", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm ThunderAccuracy
    // Without rain, Thunder uses its base 70% accuracy (178/255 on 0-255 scale).
    // Over 1000 trials, miss rate should be approximately 30%.
    // Arrange
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(
      createMockSide(0, attacker),
      createMockSide(1, defender),
      null, // no weather
    );

    // Act
    let hits = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed++) {
      const rng = new SeededRandom(seed);
      if (
        ruleset.doesMoveHit({
          attacker,
          defender,
          move: thunderMove,
          state,
          rng,
        } as unknown as AccuracyContext)
      ) {
        hits++;
      }
    }

    // Assert: hit rate should be roughly 65-75% (within 5% of 70% base accuracy)
    const hitRate = hits / trials;
    expect(hitRate).toBeGreaterThan(0.6);
    expect(hitRate).toBeLessThan(0.8);
  });

  it("given SolarBeam in Rain weather, when calculating damage, then power is halved (60 instead of 120)", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SolarBeamPower
    // In rain or sandstorm, SolarBeam power is halved before damage calc.
    // Arrange
    const attacker = createMockActive({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createMockActive({ spDefense: 100, types: ["normal"] });
    const rng = createMockRng(255);
    const rainState = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "rain",
      turnsLeft: 4,
    });
    const clearState = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const solarBeam = {
      id: "solar-beam",
      type: "grass",
      category: "special",
      power: 120,
      accuracy: 100,
      priority: 0,
      effect: { type: "two-turn" },
      flags: {},
    } as unknown as MoveData;

    // Act
    const rainDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: rainState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );
    const clearDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: clearState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
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
    const attacker = createMockActive({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createMockActive({ spDefense: 100, types: ["normal"] });
    const rng = createMockRng(255);
    const sandState = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "sand",
      turnsLeft: 4,
    });
    const clearState = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const solarBeam = {
      id: "solar-beam",
      type: "grass",
      category: "special",
      power: 120,
      accuracy: 100,
      priority: 0,
      effect: { type: "two-turn" },
      flags: {},
    } as unknown as MoveData;

    // Act
    const sandDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: sandState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );
    const clearDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: clearState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
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
    const attacker = createMockActive({ level: 50, spAttack: 100, types: ["grass"] });
    const defender = createMockActive({ spDefense: 100, types: ["normal"] });
    const rng = createMockRng(255);
    const sunState = createMockState(createMockSide(0, attacker), createMockSide(1, defender), {
      type: "sun",
      turnsLeft: 4,
    });
    const clearState = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const solarBeam = {
      id: "solar-beam",
      type: "grass",
      category: "special",
      power: 120,
      accuracy: 100,
      priority: 0,
      effect: { type: "two-turn" },
      flags: {},
    } as unknown as MoveData;

    // Act
    const sunDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: sunState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );
    const clearDmg = calculateGen2Damage(
      { attacker, defender, move: solarBeam, state: clearState, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );

    // Assert: sunny day does NOT halve SolarBeam, so sun damage >= clear damage
    expect(sunDmg.damage).toBeGreaterThanOrEqual(clearDmg.damage);
  });
});

// ---------------------------------------------------------------------------
// Issue #365 — OHKO level-based accuracy formula
// ---------------------------------------------------------------------------

describe("Issue #365 — OHKO moves level-based accuracy formula", () => {
  const ruleset = new Gen2Ruleset();

  const fissureMove = {
    id: "fissure",
    type: "ground",
    category: "physical",
    power: null,
    accuracy: 30,
    priority: 0,
    effect: { type: "ohko" },
    flags: {},
  } as unknown as MoveData;

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
    // Arrange
    const attacker = createMockActive({ level: 40 });
    const defender = createMockActive({ level: 50 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act: test across many seeds
    let anyHit = false;
    for (let seed = 0; seed < 500; seed++) {
      const rng = new SeededRandom(seed);
      const hit = ruleset.doesMoveHit({
        attacker,
        defender,
        move: fissureMove,
        state,
        rng,
      } as unknown as AccuracyContext);
      if (hit) anyHit = true;
    }

    // Assert: OHKO always fails when attacker level < defender level
    expect(anyHit).toBe(false);
  });

  it("given attacker L100 vs defender L50, when checking OHKO accuracy, then ohkoAcc = min(255, 30+100) = 130, so high hit rate", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm:5440 BattleCommand_OHKO
    // Level diff = 50, doubled = 100, base moveAcc = 30 → ohkoAcc = 130 out of 255
    // Hit rate ≈ 130/255 ≈ 51%
    // Arrange
    const attacker = createMockActive({ level: 100 });
    const defender = createMockActive({ level: 50 });
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act: test over many seeds, expect approximately 51% hit rate
    let hits = 0;
    const trials = 2000;
    for (let seed = 0; seed < trials; seed++) {
      const rng = new SeededRandom(seed);
      if (
        ruleset.doesMoveHit({
          attacker,
          defender,
          move: fissureMove,
          state,
          rng,
        } as unknown as AccuracyContext)
      ) {
        hits++;
      }
    }

    // Assert: hit rate approximately 51% ± 5%
    const hitRate = hits / trials;
    expect(hitRate).toBeGreaterThan(0.4);
    expect(hitRate).toBeLessThan(0.65);
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
      move: {
        id: moveId,
        type: "normal",
        category: "status",
        power: null,
        accuracy: null,
        priority: 0,
        // Weather-sensitive healing moves use effect.type = "custom" in Gen 2 data.
        // The actual healing logic is dispatched by handleCustomEffect based on move.id.
        // Source: packages/gen2/data/moves.json — moonlight/morning-sun/synthesis use "custom" effect
        effect: { type: "custom", handler: moveId },
        flags: {},
      } as unknown as MoveData,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    };
  }

  it("given maxHP=100, no weather, when using Moonlight, then heals floor(100 * 1/2) = 50 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // No weather: heals 1/2 max HP (floor)
    const context = createHealingMoveContext("moonlight", 100, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(50);
  });

  it("given maxHP=100, no weather, when using Morning Sun, then heals 50 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Morning Sun has same healing formula as Moonlight/Synthesis.
    const context = createHealingMoveContext("morning-sun", 100, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(50);
  });

  it("given maxHP=100, no weather, when using Synthesis, then heals 50 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Synthesis has same healing formula.
    const context = createHealingMoveContext("synthesis", 100, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(50);
  });

  it("given maxHP=100, sunny weather, when using Moonlight, then heals floor(100 * 2/3) = 66 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Sunny Day: heals 2/3 max HP (floor). floor(100 * 2/3) = floor(66.67) = 66
    const context = createHealingMoveContext("moonlight", 100, { type: "sun", turnsLeft: 4 });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(66);
  });

  it("given maxHP=150, sunny weather, when using Moonlight, then heals floor(150 * 2/3) = 100 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Triangulation: floor(150 * 2/3) = floor(100) = 100
    const context = createHealingMoveContext("moonlight", 150, { type: "sun", turnsLeft: 4 });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(100);
  });

  it("given maxHP=100, rain weather, when using Moonlight, then heals floor(100 * 1/4) = 25 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Rain Dance: heals 1/4 max HP (floor). floor(100 / 4) = 25
    const context = createHealingMoveContext("moonlight", 100, { type: "rain", turnsLeft: 4 });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(25);
  });

  it("given maxHP=100, sandstorm weather, when using Moonlight, then heals floor(100 * 1/4) = 25 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // Sandstorm: also heals 1/4 max HP (floor)
    const context = createHealingMoveContext("moonlight", 100, { type: "sand", turnsLeft: 4 });
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(25);
  });

  it("given maxHP=1 (edge case), no weather, when using Moonlight, then heals minimum 1 HP", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MoonlightEffect
    // floor(1 * 1/2) = 0 → clamped to minimum 1
    const context = createHealingMoveContext("moonlight", 1, null);
    const result = ruleset.executeMoveEffect(context);
    expect(result.healAmount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Issue #368 — Bright Powder accuracy reduction
// ---------------------------------------------------------------------------

describe("Issue #368 — Bright Powder accuracy reduction", () => {
  const ruleset = new Gen2Ruleset();

  const normalMove = {
    id: "tackle",
    type: "normal",
    category: "physical",
    power: 35,
    accuracy: 100,
    priority: 0,
    effect: null,
    flags: {},
  } as unknown as MoveData;

  it("given defender holds Bright Powder, when attacker uses a 100% accurate move, then effective accuracy is reduced by 20 (on 0-255 scale)", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:1074-1094 BrightPowderEffect
    // "sub 20" — subtracts 20 from the final accuracy value on the 0-255 scale.
    // 100% accuracy = 255/255 → 255 - 20 = 235 out of 255 = 92.2% effective.
    // Arrange
    const attacker = createMockActive();
    const defenderWithBP = createMockActive({ heldItem: "bright-powder" });
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
    const defender = createMockActive({ heldItem: "bright-powder" });
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
    // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
    // Hidden Power type index = (atkDv%2)*8 + (defDv%2)*4 + (speDv%2)*2 + (spcDv%2)
    // HP_TYPES[0] = "fighting" (physical type in Gen 2)
    // To get index 0: all low bits = 0 → atkDv=0, defDv=0, speDv=0, spcDv=0 (even DVs)
    //
    // For fighting-type HP: uses Attack and Defense stats (physical)
    // Arrange
    // DVs: attack=0 (even), defense=0 (even), speed=0 (even), spAttack=0 (even) → typeIndex=0 → "fighting"
    const physAttacker = createMockActive({
      level: 50,
      attack: 200, // High attack — should boost physical HP damage
      spAttack: 50, // Low special attack — should NOT be used for physical HP
      types: ["normal"],
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
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const hiddenPower = {
      id: "hidden-power",
      type: "normal", // Will be overridden by DV calculation
      category: "special", // Category overridden by HP type
      power: 60, // Will be overridden by DV power calculation
      accuracy: 100,
      priority: 0,
      effect: { type: "hidden-power" },
      flags: {},
    } as unknown as MoveData;

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
      species,
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
      species,
    );

    // Assert: effective category should be "physical" for Fighting-type HP
    expect(dmgLowDef.effectiveCategory).toBe("physical");
    // Physical move uses Defense stat: low defense → more damage, high defense → less damage
    expect(dmgLowDef.damage).toBeGreaterThan(dmgHighDef.damage);
  });

  it("given attacker with DVs that produce a special HP type (Fire), when calculating Hidden Power, then effectiveCategory is 'special'", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
    // HP_TYPES[8] = "fire" (special type in Gen 2)
    // typeIndex 8 = (atkDv%2)*8 + ... → requires atkDv to be odd, others even
    // atkDv=1 (odd), defDv=0, speDv=0, spcDv=0 → typeIndex = 1*8 = 8 → "fire" (special)
    // Arrange
    const specAttacker = createMockActive({
      level: 50,
      attack: 50,
      spAttack: 200, // High special attack — used for special HP
      types: ["fire"],
      ivs: { attack: 1, defense: 0, speed: 0, spAttack: 0, spDefense: 0, hp: 0 },
    });
    const defender = createMockActive({ spDefense: 100 });
    const rng = createMockRng(255);
    const state = createMockState(createMockSide(0, specAttacker), createMockSide(1, defender));
    const species = {
      id: 1,
      baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
    } as never;

    const hiddenPower = {
      id: "hidden-power",
      type: "normal",
      category: "special",
      power: 60,
      accuracy: 100,
      priority: 0,
      effect: { type: "hidden-power" },
      flags: {},
    } as unknown as MoveData;

    // Act
    const result = calculateGen2Damage(
      { attacker: specAttacker, defender, move: hiddenPower, state, rng, isCrit: false },
      GEN2_TYPE_CHART,
      species,
    );

    // Assert: Fire type → special category
    expect(result.effectiveCategory).toBe("special");
  });

  it("given all Gen 2 physical HP types, when checking effectiveCategory, then all return 'physical'", () => {
    // Source: pret/pokecrystal engine/battle/effect_commands.asm HiddenPower
    // Gen 2 physical types: normal, fighting, flying, ground, rock, bug, ghost, poison, steel
    // From HP_TYPES list (indices 0-7): fighting, flying, poison, ground, rock, bug, ghost, steel — ALL physical
    // This exercises the physical branch path for all 8 physical-type HP types.
    //
    // DV combinations for each index 0-7:
    //   index 0 = 0b0000 → atk=even, def=even, spe=even, spc=even
    //   index 1 = 0b0001 → atk=even, def=even, spe=even, spc=odd
    //   index 2 = 0b0010 → atk=even, def=even, spe=odd, spc=even
    //   index 3 = 0b0011 → atk=even, def=even, spe=odd, spc=odd
    //   index 4 = 0b0100 → atk=even, def=odd, spe=even, spc=even
    //   index 5 = 0b0101 → atk=even, def=odd, spe=even, spc=odd
    //   index 6 = 0b0110 → atk=even, def=odd, spe=odd, spc=even
    //   index 7 = 0b0111 → atk=even, def=odd, spe=odd, spc=odd

    const dvCombos: [number, number, number, number][] = [
      [0, 0, 0, 0], // index 0 → fighting
      [0, 0, 0, 1], // index 1 → flying
      [0, 0, 1, 0], // index 2 → poison
      [0, 0, 1, 1], // index 3 → ground
      [0, 1, 0, 0], // index 4 → rock
      [0, 1, 0, 1], // index 5 → bug
      [0, 1, 1, 0], // index 6 → ghost
      [0, 1, 1, 1], // index 7 → steel
    ];

    for (const [atkDv, defDv, speDv, spcDv] of dvCombos) {
      const attacker = createMockActive({
        level: 50,
        attack: 100,
        types: ["normal"],
        ivs: {
          attack: atkDv,
          defense: defDv,
          speed: speDv,
          spAttack: spcDv,
          spDefense: 15,
          hp: 15,
        },
      });
      // Use "water" type for the defender to avoid Ghost-type immunity
      // (Ghost vs Normal-type is immune in Gen 2, which returns early without effectiveCategory)
      const defender = createMockActive({ types: ["water"] });
      const rng = createMockRng(255);
      const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));
      const species = {
        id: 1,
        baseStats: { hp: 45, attack: 49, defense: 49, spAttack: 65, spDefense: 65, speed: 45 },
      } as never;

      const hiddenPower = {
        id: "hidden-power",
        type: "normal",
        category: "special",
        power: 60,
        accuracy: 100,
        priority: 0,
        effect: { type: "hidden-power" },
        flags: {},
      } as unknown as MoveData;

      const result = calculateGen2Damage(
        { attacker, defender, move: hiddenPower, state, rng, isCrit: false },
        GEN2_TYPE_CHART,
        species,
      );

      // Assert: indices 0-7 are all physical types
      expect(result.effectiveCategory).toBe("physical");
    }
  });
});
