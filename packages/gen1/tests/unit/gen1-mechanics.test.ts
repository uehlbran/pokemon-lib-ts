import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
  SeededRandom,
  createMoveSlot,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS, Gen1Ruleset } from "../../src";

/**
 * Gen 1 Move Mechanics Tests
 *
 * Tests for implemented Gen 1 mechanics: Counter, trapping moves,
 * Reflect/Light Screen, OHKO moves, and fixed/level-damage moves.
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();
const gen1DataManager = createGen1DataManager();
const MOVES = GEN1_MOVE_IDS;
const SPECIES = GEN1_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0]!;
const DEFAULT_SPECIES = gen1DataManager.getSpecies(SPECIES.pikachu);
const TACKLE = gen1DataManager.getMove(MOVES.tackle);
const COUNTER = gen1DataManager.getMove(MOVES.counter);
const WRAP = gen1DataManager.getMove(MOVES.wrap);
const REFLECT = gen1DataManager.getMove(MOVES.reflect);
const LIGHT_SCREEN = gen1DataManager.getMove(MOVES.lightScreen);
const STRENGTH = gen1DataManager.getMove(MOVES.strength);
const FISSURE = gen1DataManager.getMove(MOVES.fissure);
const DRAGON_RAGE = gen1DataManager.getMove(MOVES.dragonRage);
const SEISMIC_TOSS = gen1DataManager.getMove(MOVES.seismicToss);
const NIGHT_SHADE = gen1DataManager.getMove(MOVES.nightShade);
const RECOVER = gen1DataManager.getMove(MOVES.recover);

const DEFAULT_MOVE_FLAGS: MoveData["flags"] = {
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
};

function makeCanonicalMove(
  moveId: (typeof GEN1_MOVE_IDS)[keyof typeof GEN1_MOVE_IDS],
  overrides: Partial<MoveData> = {},
): MoveData {
  const baseMove = gen1DataManager.getMove(moveId);
  return {
    ...baseMove,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
    ...overrides,
  };
}

function makeSyntheticSelfTargetingAccuracyProbe(): MoveData {
  return makeCanonicalMove(MOVES.recover, {
    // Synthetic probe: Gen 1 self-targeting moves normally have null accuracy.
    // This forces the 100%-accuracy 1/256 miss exemption path without rebuilding
    // the rest of the canonical Recover payload from scratch.
    accuracy: 100,
  });
}

function makeSyntheticTrappingMove(): MoveData {
  return makeCanonicalMove(MOVES.wrap, {
    // Synthetic probe: Gen 1 move data does not currently encode the trapping
    // volatile on Wrap directly, but executeMoveEffect coverage here needs the
    // trapping handler path rather than the raw data record.
    effect: { type: "volatile-status" as const, status: VOLATILES.bound, chance: 100 },
  });
}

function getGen1Move(id: (typeof GEN1_MOVE_IDS)[keyof typeof GEN1_MOVE_IDS]): MoveData {
  return gen1DataManager.getMove(id);
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const statStages = {
    hp: 0,
    attack: 0,
    defense: 0,
    spAttack: 0,
    spDefense: 0,
    speed: 0,
  } as ActivePokemon["statStages"];
  statStages.accuracy = 0;
  statStages.evasion = 0;

  return {
    pokemon: {
      uid: "test-uid",
      speciesId: SPECIES.pikachu,
      nickname: null,
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: {
        hp: 100,
        attack: 80,
        defense: 60,
        spAttack: 80,
        spDefense: 60,
        speed: 120,
      },
    } as PokemonInstance,
    teamSlot: 0,
    statStages,
    volatileStatuses: new Map(),
    types: [...DEFAULT_SPECIES.types] as PokemonType[],
    ability: CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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
    ...overrides,
  };
}

function makeBattleState(
  overrides: { side0Active?: ActivePokemon | null; side1Active?: ActivePokemon | null } = {},
): BattleState {
  const rng = new SeededRandom(42);
  return {
    phase: "turn-resolve",
    generation: 1,
    format: "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0 as const,
        trainer: null,
        team: [],
        active: [overrides.side0Active ?? null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
      {
        index: 1 as const,
        trainer: null,
        team: [],
        active: [overrides.side1Active ?? null],
        hazards: [],
        screens: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
      },
    ],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng,
    ended: false,
    winner: null,
  } as BattleState;
}

function makeMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: makeActivePokemon(),
    defender: makeActivePokemon({ types: [TYPES.normal] }),
    move: TACKLE,
    damage: 50,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Counter mechanic tests
// ============================================================================

describe("Gen 1 Counter mechanic", () => {
  it("given Normal-type move hit the Pokemon last turn, when Counter is used, then deals 2x that damage", () => {
    // Arrange
    const attacker = makeActivePokemon({
      lastDamageTaken: 50,
      lastDamageType: CORE_TYPE_IDS.normal as PokemonType,
    });
    const defender = makeActivePokemon();
    const counterMove = getGen1Move(GEN1_MOVE_IDS.counter);
    const context = makeMoveEffectContext({ attacker, defender, move: counterMove });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(100);
  });

  it("given Fighting-type move hit the Pokemon last turn, when Counter is used, then deals 2x that damage", () => {
    // Arrange
    const attacker = makeActivePokemon({
      lastDamageTaken: 30,
      lastDamageType: CORE_TYPE_IDS.fighting as PokemonType,
    });
    const defender = makeActivePokemon();
    const counterMove = getGen1Move(GEN1_MOVE_IDS.counter);
    const context = makeMoveEffectContext({ attacker, defender, move: counterMove });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    const expectedCounterDamage = (attacker.lastDamageTaken ?? 0) * 2;
    expect(result.customDamage?.amount).toBe(expectedCounterDamage);
  });

  it("given Fire-type move hit the Pokemon last turn, when Counter is used, then Counter fails (no damage)", () => {
    // Arrange — Counter in Gen 1 only reflects Normal and Fighting type moves.
    // Fire-type damage should cause Counter to fail even if lastDamageTaken > 0.
    const attacker = makeActivePokemon({
      lastDamageTaken: 50,
      lastDamageType: CORE_TYPE_IDS.fire as PokemonType,
    });
    const defender = makeActivePokemon();
    const counterMove = getGen1Move(GEN1_MOVE_IDS.counter);
    const context = makeMoveEffectContext({ attacker, defender, move: counterMove });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — no customDamage when last damage was not Normal or Fighting type
    expect(result.customDamage).toBeUndefined();
  });

  it("given no prior damage taken, when Counter is used, then Counter fails (no damage)", () => {
    // Arrange
    const attacker = makeActivePokemon({ lastDamageTaken: 0, lastDamageType: null });
    const defender = makeActivePokemon();
    const counterMove = getGen1Move(GEN1_MOVE_IDS.counter);
    const context = makeMoveEffectContext({ attacker, defender, move: counterMove });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeUndefined();
  });
});

// ============================================================================
// Trapping move tests
// ============================================================================

describe("Gen 1 Trapping moves (Wrap, Bind, etc.)", () => {
  it("given a trapping move is used, when it hits, then defender gains bound volatile", () => {
    // Arrange
    const attackerPoke = makeActivePokemon();
    const defenderPoke = makeActivePokemon();
    const wrapMove = makeSyntheticTrappingMove();
    const context = makeMoveEffectContext({
      attacker: attackerPoke,
      defender: defenderPoke,
      move: wrapMove,
    });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — volatile key is "bound" (bug #101 fix: engine checks "bound" for immobilization)
    expect(result.volatileInflicted).toBe(VOLATILES.bound);
  });

  it("given target has 'bound' volatile with turnsLeft=3, when processBoundTurn is called, then returns true (still trapped) and decrements counter", () => {
    // Source: pret/pokered engine/battle/core.asm — Gen 1 trapping moves (Wrap, Bind,
    // Fire Spin, Clamp) hold the target for 2-5 turns. The 'bound' volatile presence
    // is checked by the engine (canExecuteMove) to block the trapped Pokemon's actions.
    // processBoundTurn() decrements the counter each turn.
    // Returns true = still trapped, false = trap expired.

    // Arrange
    const trapped = makeActivePokemon();
    trapped.volatileStatuses.set(VOLATILES.bound, { turnsLeft: 3 });
    const state = makeBattleState();

    // Act — first tick
    const stillTrapped = ruleset.processBoundTurn(trapped, state);

    // Assert — still trapped after first decrement (3 → 2)
    expect(stillTrapped).toBe(true);
    expect(trapped.volatileStatuses.get(VOLATILES.bound)?.turnsLeft).toBe(2);
  });

  it("given target has 'bound' volatile with turnsLeft=1, when processBoundTurn is called, then returns false (trap expires) and counter reaches 0", () => {
    // Source: pret/pokered engine/battle/core.asm — when the trap counter reaches 0
    // the Pokemon is freed and can act normally next turn.
    // processBoundTurn() returns false when turnsLeft drops to 0, signalling expiry.
    //
    // The 'bound' volatile deletion itself is handled by the engine (canExecuteMove)
    // when it detects turnsLeft <= 0. The ruleset just decrements and returns the flag.

    // Arrange — last turn of trapping
    const trapped = makeActivePokemon();
    trapped.volatileStatuses.set(VOLATILES.bound, { turnsLeft: 1 });
    const state = makeBattleState();

    // Act — final tick
    const stillTrapped = ruleset.processBoundTurn(trapped, state);

    // Assert — trap has expired (counter hit 0)
    expect(stillTrapped).toBe(false);
    expect(trapped.volatileStatuses.get(VOLATILES.bound)?.turnsLeft).toBe(0);
  });
});

// ============================================================================
// Reflect and Light Screen tests
// ============================================================================

describe("Gen 1 Reflect and Light Screen", () => {
  it("given Reflect is used, when the effect resolves, then screenSet contains reflect with permanent duration (-1)", () => {
    // Gen 1: Reflect is permanent — lasts until Haze or setter switches out, not 5 turns.
    // turnsLeft: -1 is the permanent sentinel — never expires by countdown. (Showdown gen1 moves.ts: no duration field)
    // Arrange
    const context = makeMoveEffectContext({ move: REFLECT });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.screenSet?.screen).toBe(CORE_SCREEN_IDS.reflect);
    expect(result.screenSet?.turnsLeft).toBe(-1);
  });

  it("given Light Screen is used, when the effect resolves, then screenSet contains light-screen with permanent duration (-1)", () => {
    // Gen 1: Light Screen is permanent — no 5-turn countdown. (Showdown gen1 moves.ts)
    // turnsLeft: -1 is the permanent sentinel — never expires by countdown.
    // Arrange
    const context = makeMoveEffectContext({ move: LIGHT_SCREEN });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.screenSet?.screen).toBe(CORE_SCREEN_IDS.lightScreen);
    expect(result.screenSet?.turnsLeft).toBe(-1);
  });

  it("given Reflect is active on the defender side, when Strength hits, then the doubled defense stat reduces damage from 48 to 25", () => {
    // Source: gen1-ground-truth.md §7 — Reflect doubles the defender's Defense stat in Gen 1.
    // With L50, Power 80, Attack 80, Defense 60, no STAB, neutral typing, and max random roll:
    // No Reflect: floor(floor((22 * 80 * 80) / 60) / 50) + 2 = 48
    // Reflect: defense doubles to 120, so floor(floor((22 * 80 * 80) / 120) / 50) + 2 = 25
    const attacker = makeActivePokemon({
      types: [...DEFAULT_SPECIES.types] as PokemonType[],
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      types: [TYPES.normal],
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const noScreenState = makeBattleState({ side0Active: attacker, side1Active: defender });
    const reflectState = makeBattleState({ side0Active: attacker, side1Active: defender });
    reflectState.sides[1].screens = [{ type: CORE_SCREEN_IDS.reflect, turnsLeft: -1 }];
    const maxRollRng = { int: (_min: number, max: number) => max } as unknown as SeededRandom;

    const noReflect = ruleset.calculateDamage({
      attacker,
      defender,
      move: STRENGTH,
      rng: maxRollRng,
      state: noScreenState,
      isCrit: false,
    });
    const withReflect = ruleset.calculateDamage({
      attacker,
      defender,
      move: STRENGTH,
      rng: maxRollRng,
      state: reflectState,
      isCrit: false,
    });

    expect(noReflect.damage).toBe(48);
    expect(withReflect.damage).toBe(25);
  });

  it("given a screen setter switches out, when onSwitchOut runs, then bound is cleared, sleep persists, and side screens are removed", () => {
    // Source: gen1-ground-truth.md §8 — sleep counter persists through switching, while bound and side screens do not.
    const pokemon = makeActivePokemon();
    pokemon.volatileStatuses.set(VOLATILES.bound, { turnsLeft: 3 });
    pokemon.volatileStatuses.set(VOLATILES.sleepCounter, { turnsLeft: 3 });
    pokemon.pokemon.status = CORE_STATUS_IDS.sleep;
    const state = makeBattleState({ side0Active: pokemon });
    state.sides[0].screens = [
      { type: CORE_SCREEN_IDS.reflect, turnsLeft: -1 },
      { type: CORE_SCREEN_IDS.lightScreen, turnsLeft: -1 },
    ];

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.volatileStatuses.has(VOLATILES.bound)).toBe(false);
    expect(pokemon.volatileStatuses.get(VOLATILES.sleepCounter)?.turnsLeft).toBe(3);
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    expect(state.sides[0].screens).toEqual([]);
  });
});

// ============================================================================
// OHKO moves (Fissure, Guillotine, Horn Drill)
// ============================================================================

describe("OHKO moves (Fissure, Guillotine, Horn Drill)", () => {
  it("given attacker speed >= defender speed, when an OHKO move rolls below the converted threshold, then doesMoveHit returns true", () => {
    // Source: pret/pokered engine/battle/core.asm — OHKO moves first require user Speed >= target Speed.
    // Source: Gen1Ruleset.doesMoveHit — 30% accuracy converts to floor(30 * 255 / 100) = 76, so roll 0 hits.
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        uid: "attacker",
        moves: [createMoveSlot(FISSURE.id, FISSURE.pp)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
      types: [TYPES.ground],
      ability: CORE_ABILITY_IDS.none,
      lastMoveUsed: null,
      lastDamageTaken: 0,
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
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const fissureMove = FISSURE;
    const state = makeBattleState();
    const guaranteedHitRng = { int: () => 0 } as unknown as SeededRandom;

    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: guaranteedHitRng,
    });
    expect(result).toBe(true);
  });

  it("given attacker speed < defender speed, when an OHKO move is checked, then doesMoveHit auto-fails before the accuracy roll", () => {
    // Source: pret/pokered engine/battle/core.asm — OHKO fails automatically if the user is slower.
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const fissureMove = FISSURE;
    const state = makeBattleState();
    const guaranteedHitRng = { int: () => 0 } as unknown as SeededRandom;

    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move: fissureMove,
      state,
      rng: guaranteedHitRng,
    });
    expect(result).toBe(false);
  });

  it("given OHKO effect move, when executeMoveEffect is called, then customDamage equals defender's current HP", () => {
    // Arrange
    const defender = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, currentHp: 150 } as PokemonInstance,
    });
    const fissureMove = FISSURE;
    const context = makeMoveEffectContext({ defender, move: fissureMove });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(defender.pokemon.currentHp);
  });
});

// ============================================================================
// Fixed and level damage moves
// ============================================================================

describe("Fixed and level damage moves", () => {
  it("given Dragon Rage (fixed 40 damage), when executeMoveEffect is called, then customDamage is 40", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: DRAGON_RAGE });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    const dragonRageDamage =
      DRAGON_RAGE.effect?.type === "fixed-damage" ? DRAGON_RAGE.effect.damage : null;
    expect(result.customDamage?.amount).toBe(dragonRageDamage);
  });

  it("given Seismic Toss at level 50, when executeMoveEffect is called, then customDamage is 50", () => {
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, level: 50 } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ attacker, move: SEISMIC_TOSS });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(attacker.pokemon.level);
  });

  it("given Night Shade at level 75, when executeMoveEffect is called, then customDamage is 75", () => {
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, level: 75 } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ attacker, move: NIGHT_SHADE });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(attacker.pokemon.level);
  });
});

// ============================================================================
// Self-targeting accuracy (1/256 miss exemption)
// ============================================================================

describe("Gen 1 self-targeting accuracy exemption", () => {
  it("given a 100% accuracy self-targeting move, when doesMoveHit is rolled with seed that would trigger 1/256 miss, then the move always hits", () => {
    // Gen 1 1/256 miss bug: roll=255 out of 0-255 misses for normal 100% moves.
    // Self-targeting moves get +1 to their threshold (255+1=256), so roll<256 is always true.
    // Use a mock RNG that always returns 255 (the miss-triggering roll for normal moves).
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon();
    const recoverMove = makeSyntheticSelfTargetingAccuracyProbe();
    const state = makeBattleState();
    // Roll 255 of 0-255: would miss a normal 100% move but NOT a self-targeting move
    const rng = { int: (_min: number, _max: number) => 255, chance: () => false } as ReturnType<
      typeof makeBattleState
    >["rng"];
    // Act
    const hit = ruleset.doesMoveHit({ attacker, defender, move: recoverMove, state, rng });
    // Assert — self-targeting moves are exempt from 1/256 miss
    expect(hit).toBe(true);
  });

  it("given a 100% accuracy non-self move, when doesMoveHit roll is 255, then the move misses (1/256 bug)", () => {
    // Normal 100% move: threshold=255, roll 255 is NOT < 255 → miss (1/256 bug)
    const attacker = makeActivePokemon();
    const defender = makeActivePokemon();
    const state = makeBattleState();
    const rng = { int: (_min: number, _max: number) => 255, chance: () => false } as ReturnType<
      typeof makeBattleState
    >["rng"];
    const hit = ruleset.doesMoveHit({ attacker, defender, move: STRENGTH, state, rng });
    // Roll 255 ≥ threshold 255 → miss
    expect(hit).toBe(false);
  });
});

// ============================================================================
// Confusion self-hit formula
// ============================================================================

describe("Gen 1 confusion self-hit formula", () => {
  it("given a level-50 Pokemon with Attack 80 and Defense 60, when calculating confusion damage, then uses proper formula (not maxHP/8)", () => {
    // Gen 1: confusion self-hit = floor(floor((2*level/5+2) * 40 * atk) / def / 50) + 2
    // No random, no STAB, no crit, no type effectiveness.
    // L50, Atk80, Def60: levelFactor = floor(100/5)+2 = 22
    //   floor(floor(22*40*80)/60/50)+2 = floor(floor(70400)/60/50)+2 = floor(1173/50)+2 = 23+2 = 25
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 50,
        calculatedStats: {
          hp: 300,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    const rng = new SeededRandom(42);
    // Act
    const damage = ruleset.calculateConfusionDamage(pokemon, state, rng);
    // Assert: formula-based result, not maxHP/8 (which would be 300/8 = 37)
    expect(damage).toBe(25);
    expect(damage).not.toBe(Math.floor(300 / 8)); // ensure not the old formula
  });

  it("given a burned Pokemon, when calculating confusion self-hit damage, then attack is halved", () => {
    // Burn halves physical attack even on confusion self-hits
    const pokemon = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 50,
        status: CORE_STATUS_IDS.burn,
        calculatedStats: {
          hp: 300,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const pokemonNoBurn = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        level: 50,
        status: null,
        calculatedStats: {
          hp: 300,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    const rng = new SeededRandom(42);
    const burnedDamage = ruleset.calculateConfusionDamage(pokemon, state, rng);
    const normalDamage = ruleset.calculateConfusionDamage(pokemonNoBurn, state, rng);
    // Burned attacker should deal less confusion self-damage
    expect(burnedDamage).toBeLessThan(normalDamage);
  });
});

// ============================================================================
// Self-Destruct move
// ============================================================================

describe("Self-Destruct move", () => {
  it("given Self-Destruct is used, when executeMoveEffect is called with the real move ID, then selfFaint is true", () => {
    // Arrange — load the real move from data so a data regression (wrong handler) would be caught
    const attacker = makeActivePokemon();
    const selfDestructMove = createGen1DataManager().getMove(MOVES.selfDestruct);
    const context = makeMoveEffectContext({ attacker, move: selfDestructMove });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — user should faint
    expect(result.selfFaint).toBe(true);
  });
});

// ============================================================================
// Trapping move duration (weighted distribution)
// ============================================================================

describe("Gen 1 trapping move duration (weighted)", () => {
  it("given a trapping move across many rolls, when duration is sampled, then distribution matches [2,2,2,3,3,3,4,5] weighting", () => {
    // Weighted: 37.5% × 2 turns, 37.5% × 3 turns, 12.5% × 4, 12.5% × 5
    // Run many battles and collect duration counts via SeededRandom
    const wrapMove = makeSyntheticTrappingMove();
    const counts: Record<number, number> = { 2: 0, 3: 0, 4: 0, 5: 0 };
    const iterations = 800;

    for (let i = 0; i < iterations; i++) {
      const attacker = makeActivePokemon();
      const defender = makeActivePokemon();
      const context = makeMoveEffectContext({
        attacker,
        defender,
        move: wrapMove,
        rng: new SeededRandom(i),
      });
      const result = ruleset.executeMoveEffect(context);
      const turns = result.volatileData?.turnsLeft;
      if (turns !== undefined) counts[turns] = (counts[turns] ?? 0) + 1;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    // Allow ±10% tolerance on proportions
    expect((counts[2] ?? 0) / total).toBeGreaterThan(0.27);
    expect((counts[2] ?? 0) / total).toBeLessThan(0.48);
    expect((counts[3] ?? 0) / total).toBeGreaterThan(0.27);
    expect((counts[3] ?? 0) / total).toBeLessThan(0.48);
    expect((counts[4] ?? 0) / total).toBeGreaterThan(0.05);
    expect((counts[4] ?? 0) / total).toBeLessThan(0.2);
    expect((counts[5] ?? 0) / total).toBeGreaterThan(0.05);
    expect((counts[5] ?? 0) / total).toBeLessThan(0.2);
  });
});
