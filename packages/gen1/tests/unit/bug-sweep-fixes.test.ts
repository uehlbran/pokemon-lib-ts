/**
 * Regression tests for Gen 1 bug sweep — 10 mechanical correctness fixes.
 * Issues: #54, #55, #90, #91, #93, #94, #101, #102, #103, #105
 *
 * Each test uses Given/When/Then naming and AAA structure.
 * All expected values are sourced from gen1-ground-truth.md.
 */

import type {
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  TypeChart,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createPokemonInstance,
  createStatExp,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN1_MOVE_IDS, GEN1_NATURE_IDS, GEN1_SPECIES_IDS, GEN1_TYPES } from "../../src";
import { createGen1DataManager } from "../../src/data";
import { calculateGen1Damage } from "../../src/Gen1DamageCalc";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

// ============================================================================
// Shared test infrastructure
// ============================================================================

const ruleset = new Gen1Ruleset();
const gen1DataManager = createGen1DataManager();
const HARDY_NATURE = GEN1_NATURE_IDS.hardy;
const PIKACHU_SPECIES = gen1DataManager.getSpecies(GEN1_SPECIES_IDS.pikachu);
const TACKLE_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.tackle);
const AMNESIA_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.amnesia);
const GROWTH_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.growth);
const SWORDS_DANCE_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.swordsDance);
const STRENGTH_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.strength);
const MEGA_DRAIN_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.megaDrain);
const FIRE_BLAST_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.fireBlast);
const PSYCHIC_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.psychic);
const GROWL_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.growl);
const WRAP_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.wrap);
const HYPER_BEAM_MOVE = gen1DataManager.getMove(GEN1_MOVE_IDS.hyperBeam);
const DAMAGE_CALC_SPECIES = PIKACHU_SPECIES;
const NORMAL_MONOTYPE: PokemonType[] = [CORE_TYPE_IDS.normal];
const FIRE_MONOTYPE: PokemonType[] = [CORE_TYPE_IDS.fire];
const WATER_ROCK_DUAL_TYPES: PokemonType[] = [CORE_TYPE_IDS.water, CORE_TYPE_IDS.rock];
const WATER_NORMAL_DUAL_TYPES: PokemonType[] = [CORE_TYPE_IDS.water, CORE_TYPE_IDS.normal];

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData>): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
  };
}

function createCalculatedStats(overrides: Partial<StatBlock> = {}): StatBlock {
  return {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
    ...overrides,
  };
}

function createSyntheticOnFieldPokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const pokemon = createPokemonInstance(PIKACHU_SPECIES, 50, new SeededRandom(1), {
    nature: HARDY_NATURE,
    ivs: createDvs(),
    evs: createStatExp(),
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    moves: [createMoveSlot(TACKLE_MOVE.id, TACKLE_MOVE.pp)],
    isShiny: false,
    metLocation: "pallet-town",
    originalTrainer: "Red",
    originalTrainerId: 12345,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.currentHp = 200;
  pokemon.calculatedStats = createCalculatedStats();

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...PIKACHU_SPECIES.types] as PokemonType[],
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

function createBattleState(side0Pokemon: ActivePokemon, side1Pokemon: ActivePokemon): BattleState {
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
        active: [side0Pokemon],
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
        active: [side1Pokemon],
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

function createMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const attacker = createSyntheticOnFieldPokemon();
  const defender = createSyntheticOnFieldPokemon();
  return {
    attacker,
    defender,
    move: TACKLE_MOVE,
    damage: 50,
    state: createBattleState(attacker, defender),
    rng: new SeededRandom(42),
    ...overrides,
  };
}

/** Create a minimal neutral type chart (all 1x). */
function makeNeutralTypeChart(): TypeChart {
  const types: PokemonType[] = [...GEN1_TYPES];
  const chart = {} as Record<string, Record<string, number>>;
  for (const atk of types) {
    chart[atk] = {};
    for (const def of types) {
      (chart[atk] as Record<string, number>)[def] = 1;
    }
  }
  return chart as TypeChart;
}

/** Mock RNG that always returns a fixed int value. */
function fixedRng(intValue: number): SeededRandom {
  return {
    next: () => 0,
    int: () => intValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

// ============================================================================
// Bug #94 — Special stat not unified (Amnesia / Growth must affect both sides)
// Source: gen1-ground-truth.md §1 — Unified Special Stat
// ============================================================================

describe("Bug #94 — Amnesia/Growth unified special stat", () => {
  it("given Amnesia (+2 spDefense self), when executeMoveEffect is called, then BOTH spAttack and spDefense stat changes are returned", () => {
    // Arrange — Amnesia effect targets self and changes spDefense by +2
    const context = createMoveEffectContext({ move: AMNESIA_MOVE });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — Gen 1 unified Special: changing spDefense must also change spAttack
    // Source: gen1-ground-truth.md §1 — both sides of Special go up together
    const spAttackChange = result.statChanges.find(
      (c) => c.target === "attacker" && c.stat === "spAttack",
    );
    const spDefenseChange = result.statChanges.find(
      (c) => c.target === "attacker" && c.stat === "spDefense",
    );
    expect(spAttackChange).toBeDefined();
    expect(spDefenseChange).toBeDefined();
    expect(spAttackChange?.stages).toBe(2);
    expect(spDefenseChange?.stages).toBe(2);
  });

  it("given Growth (+1 spAttack self), when executeMoveEffect is called, then BOTH spAttack and spDefense increase by 1", () => {
    // Arrange — Growth targets self and changes spAttack by +1
    const context = createMoveEffectContext({ move: GROWTH_MOVE });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — unified Special: both sides increase by 1
    const spAttackChange = result.statChanges.find((c) => c.stat === "spAttack");
    const spDefenseChange = result.statChanges.find((c) => c.stat === "spDefense");
    expect(spAttackChange?.stages).toBe(1);
    expect(spDefenseChange?.stages).toBe(1);
    // No duplicates (each stat appears exactly once)
    const spAttackChanges = result.statChanges.filter((c) => c.stat === "spAttack");
    const spDefenseChanges = result.statChanges.filter((c) => c.stat === "spDefense");
    expect(spAttackChanges).toHaveLength(1);
    expect(spDefenseChanges).toHaveLength(1);
  });

  it("given a non-special stat-change move (Swords Dance +2 attack), when executeMoveEffect is called, then only attack changes (no duplication)", () => {
    // Arrange
    const context = createMoveEffectContext({ move: SWORDS_DANCE_MOVE });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — non-special stats are not duplicated
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]?.stat).toBe("attack");
    expect(result.statChanges[0]?.stages).toBe(2);
  });
});

// ============================================================================
// Bug #55 — Type effectiveness applied sequentially with floor between types
// Source: gen1-ground-truth.md §3 — Damage Formula, step 7
// ============================================================================

describe("Bug #55 — Sequential type effectiveness with per-type floor", () => {
  it("given a dual-typed defender (Water/Rock) hit by a 2x each type move at max roll, when calculating damage, then floors are applied per type sequentially", () => {
    // Arrange — use a chart where normal is 2x vs water AND 2x vs rock
    // Level 50, Strength (Power 80), Attack 100, Defense 100:
    //   levelFactor = floor(100/5)+2 = 22
    //   baseDamage = min(997, floor(floor(22*80*100)/100/50))+2 = min(997, 35)+2 = 37
    // No STAB (attacker is fire type).
    // 2x vs Water: floor(37 * 20/10) = 74
    // 2x vs Rock:  floor(74 * 20/10) = 148
    // Max roll (255): floor(148 * 255/255) = 148
    const chart = makeNeutralTypeChart() as Record<string, Record<string, number>>;
    (chart[CORE_TYPE_IDS.normal] as Record<string, number>)[CORE_TYPE_IDS.water] = 2;
    (chart[CORE_TYPE_IDS.normal] as Record<string, number>)[CORE_TYPE_IDS.rock] = 2;

    const attacker = createSyntheticOnFieldPokemon({ types: FIRE_MONOTYPE });
    const defender = createSyntheticOnFieldPokemon({ types: WATER_ROCK_DUAL_TYPES });
    defender.pokemon.calculatedStats = createCalculatedStats({ defense: 100 });

    const state = createBattleState(attacker, defender);

    const context: DamageContext = {
      attacker,
      defender,
      move: STRENGTH_MOVE,
      state,
      rng: fixedRng(255),
      isCrit: false,
    };

    // Act
    const result = calculateGen1Damage(context, chart as TypeChart, DAMAGE_CALC_SPECIES);

    // Assert — sequential floor: 37 → 74 → 148 → final 148 (at max roll)
    expect(result.effectiveness).toBe(4); // combined effectiveness is 4
    expect(result.damage).toBe(148);
  });

  it("given a dual-typed defender hit by 2x + 1x effectiveness at max roll, when calculating damage, then only one floor is applied", () => {
    // Water/Normal defender hit by Mega Drain (2x vs Water, 1x vs Normal)
    // baseDamage (Power 40, Atk 100, Def 100, Level 50): floor(floor(22*40*100)/100/50)+2 = 17+2 = 19
    // 2x vs Water: floor(19 * 20/10) = 38
    // 1x vs Normal: no change → 38
    // Max roll: floor(38 * 255/255) = 38
    const chart = makeNeutralTypeChart() as Record<string, Record<string, number>>;
    (chart[CORE_TYPE_IDS.grass] as Record<string, number>)[CORE_TYPE_IDS.water] = 2;

    const attacker = createSyntheticOnFieldPokemon({ types: FIRE_MONOTYPE });
    const defender = createSyntheticOnFieldPokemon({ types: WATER_NORMAL_DUAL_TYPES });
    defender.pokemon.calculatedStats = createCalculatedStats({ spDefense: 100 });
    attacker.pokemon.calculatedStats = createCalculatedStats({ spAttack: 100 });
    const state = createBattleState(attacker, defender);

    const context: DamageContext = {
      attacker,
      defender,
      move: MEGA_DRAIN_MOVE,
      state,
      rng: fixedRng(255),
      isCrit: false,
    };

    const result = calculateGen1Damage(context, chart as TypeChart, DAMAGE_CALC_SPECIES);

    expect(result.damage).toBe(38);
    expect(result.effectiveness).toBe(2);
  });
});

// ============================================================================
// Bug #54 — getEndOfTurnOrder() missing CORE_VOLATILE_IDS.leechSeed
// Source: gen1-ground-truth.md §8 — End-of-Turn Order
// ============================================================================

describe(`Bug #54 — ${CORE_VOLATILE_IDS.leechSeed} in end-of-turn order`, () => {
  it(`given Gen1Ruleset, when getEndOfTurnOrder is called, then ${CORE_VOLATILE_IDS.leechSeed} comes after the damage step`, () => {
    // Source: gen1-ground-truth.md §8 — end-of-turn ordering.
    // 1. Damage-over-time step
    // 2. Leech Seed drain
    // 3. Faint check (handled by engine)
    // Arrange / Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert
    expect(order[0]).toBe(CORE_END_OF_TURN_EFFECT_IDS.statusDamage);
    expect(order[1]).toBe(CORE_VOLATILE_IDS.leechSeed);
  });
});

// ============================================================================
// Bug #90 — Toxic counter not reset on switch-out
// Source: gen1-ground-truth.md §8 — What Resets on Switch-Out + §6 Toxic
// ============================================================================

describe("Bug #90 — Toxic counter resets on switch-out", () => {
  it("given a badly-poisoned Pokemon, when it switches out, then status reverts to regular poison", () => {
    // Source: gen1-ground-truth.md §6 — Toxic counter resets on switch (reverts to poison).
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        status: CORE_STATUS_IDS.badlyPoisoned as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.toxicCounter, {
      turnsLeft: -1,
      data: { counter: 5 },
    });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — badly-poisoned reverts to regular poison
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.poison);
    // Toxic counter volatile is cleared
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.toxicCounter)).toBe(false);
  });

  it("given a regular-poisoned Pokemon, when it switches out, then status remains regular poison", () => {
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        status: CORE_STATUS_IDS.poison as const,
      } as PokemonInstance,
    });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — regular poison is unaffected by switch-out
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.poison);
  });

  it("given a badly-poisoned Pokemon with counter at 4, when it switches out, then no toxic-counter volatile remains", () => {
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        status: CORE_STATUS_IDS.badlyPoisoned as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.toxicCounter, {
      turnsLeft: -1,
      data: { counter: 4 },
    });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — no toxic counter volatile remains; status is now regular poison
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.toxicCounter)).toBe(false);
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.poison);
  });
});

// ============================================================================
// Bug #91 — Reflect/Light Screen ignored in damage calc
// Source: gen1-ground-truth.md §7 — Reflect / Light Screen
// ============================================================================

describe("Bug #91 — Reflect/Light Screen doubles defense in damage calc", () => {
  it("given Reflect is active on defender's side, when a physical move hits (non-crit), then damage is reduced compared to no Reflect", () => {
    // Source: gen1-ground-truth.md §7 — Reflect doubles effective defense stat for physical moves.
    // L50, Atk100, Def100, Power80 (normal physical):
    //   levelFactor=22, baseDamage = min(997, floor(floor(22*80*100)/100/50))+2 = 35+2 = 37
    //   Max roll: floor(37 * 255/255) = 37
    // With Reflect (Def 200):
    //   baseDamage = min(997, floor(floor(22*80*100)/200/50))+2 = 17+2 = 19
    //   Max roll: 19
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({ types: FIRE_MONOTYPE });
    attacker.pokemon.calculatedStats = createCalculatedStats({ attack: 100 });
    const defender = createSyntheticOnFieldPokemon({ types: NORMAL_MONOTYPE });
    defender.pokemon.calculatedStats = createCalculatedStats({ defense: 100 });

    const stateNoReflect = createBattleState(attacker, defender);
    const stateWithReflect = createBattleState(attacker, defender);
    stateWithReflect.sides[1].screens.push({ type: CORE_SCREEN_IDS.reflect, turnsLeft: -1 });

    const chart = makeNeutralTypeChart();

    // Act
    const damageNoReflect = calculateGen1Damage(
      {
        attacker,
        defender,
        move: STRENGTH_MOVE,
        state: stateNoReflect,
        rng: fixedRng(255),
        isCrit: false,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;
    const damageWithReflect = calculateGen1Damage(
      {
        attacker,
        defender,
        move: STRENGTH_MOVE,
        state: stateWithReflect,
        rng: fixedRng(255),
        isCrit: false,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;

    // Assert
    expect(damageNoReflect).toBe(37);
    expect(damageWithReflect).toBe(19);
    expect(damageWithReflect).toBeLessThan(damageNoReflect);
  });

  it("given Light Screen is active on defender's side, when a special move hits (non-crit), then damage is reduced compared to no Light Screen", () => {
    // Source: gen1-ground-truth.md §7 — Light Screen doubles SpDefense for special moves.
    // L50, Fire Blast (Power 120), SpA100, SpD100, no STAB:
    //   baseDamage = min(997, floor(floor(22*120*100)/100/50))+2 = 52+2 = 54
    // With Light Screen (SpD 200):
    //   baseDamage = min(997, floor(floor(22*120*100)/200/50))+2 = 26+2 = 28
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({ types: NORMAL_MONOTYPE });
    attacker.pokemon.calculatedStats = createCalculatedStats({ spAttack: 100 });
    const defender = createSyntheticOnFieldPokemon({ types: NORMAL_MONOTYPE });
    defender.pokemon.calculatedStats = createCalculatedStats({ spDefense: 100 });

    const stateNoScreen = createBattleState(attacker, defender);
    const stateWithScreen = createBattleState(attacker, defender);
    stateWithScreen.sides[1].screens.push({ type: CORE_SCREEN_IDS.lightScreen, turnsLeft: -1 });

    const chart = makeNeutralTypeChart();

    // Act
    const damageNoScreen = calculateGen1Damage(
      {
        attacker,
        defender,
        move: FIRE_BLAST_MOVE,
        state: stateNoScreen,
        rng: fixedRng(255),
        isCrit: false,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;
    const damageWithScreen = calculateGen1Damage(
      {
        attacker,
        defender,
        move: FIRE_BLAST_MOVE,
        state: stateWithScreen,
        rng: fixedRng(255),
        isCrit: false,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;

    // Assert — Light Screen reduces special damage
    expect(damageNoScreen).toBe(54);
    expect(damageWithScreen).toBe(28);
  });

  it("given Reflect is active and the move is a critical hit, when calculating damage, then Reflect is ignored (crit bypasses screens)", () => {
    // Source: gen1-ground-truth.md §3 — Crits ignore Reflect and Light Screen.
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({ types: FIRE_MONOTYPE });
    attacker.pokemon.calculatedStats = createCalculatedStats({ attack: 100 });
    const defender = createSyntheticOnFieldPokemon({ types: NORMAL_MONOTYPE });
    defender.pokemon.calculatedStats = createCalculatedStats({ defense: 100 });

    const stateWithReflect = createBattleState(attacker, defender);
    stateWithReflect.sides[1].screens.push({ type: CORE_SCREEN_IDS.reflect, turnsLeft: -1 });

    const stateNoReflect = createBattleState(attacker, defender);

    const chart = makeNeutralTypeChart();

    // Act — critical hits: Reflect should be ignored
    const critWithReflect = calculateGen1Damage(
      {
        attacker,
        defender,
        move: STRENGTH_MOVE,
        state: stateWithReflect,
        rng: fixedRng(255),
        isCrit: true,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;
    const critNoReflect = calculateGen1Damage(
      {
        attacker,
        defender,
        move: STRENGTH_MOVE,
        state: stateNoReflect,
        rng: fixedRng(255),
        isCrit: true,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;

    // Assert — crit damage is the same regardless of Reflect
    expect(critWithReflect).toBe(critNoReflect);

    // And non-crit WITH Reflect should be lower than crit (crit doubles level)
    const nonCritWithReflect = calculateGen1Damage(
      {
        attacker,
        defender,
        move: STRENGTH_MOVE,
        state: stateWithReflect,
        rng: fixedRng(255),
        isCrit: false,
      },
      chart,
      DAMAGE_CALC_SPECIES,
    ).damage;
    expect(critWithReflect).toBeGreaterThan(nonCritWithReflect);
  });
});

// ============================================================================
// Bug #93 — Stat-change effects ignore chance field
// Source: gen1-ground-truth.md §7 — Secondary Effect Chance
// ============================================================================

describe("Bug #93 — Stat-change secondary effects respect chance field", () => {
  it("given Psychic (33% SpDef drop) and RNG rolls above threshold, when executeMoveEffect is called, then the stat drop does NOT occur", () => {
    // Source: gen1-ground-truth.md §7 — Secondary Effect Chance:
    // Roll: random(0..255) < floor(chance * 256 / 100)
    // 33% → threshold = floor(33 * 256 / 100) = 84
    // rng.int(0,255) returns 200 (>= 84) → effect skipped
    // Arrange
    const context: MoveEffectContext = {
      ...createMoveEffectContext({ move: PSYCHIC_MOVE }),
      rng: fixedRng(200), // 200 >= 84 → secondary does NOT apply
    };

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — no stat changes should be applied (the roll failed)
    expect(result.statChanges).toHaveLength(0);
  });

  it("given Psychic (33% SpDef drop) and RNG rolls below threshold, when executeMoveEffect is called, then the stat drop DOES occur", () => {
    // 33% → threshold = 84; rng.int(0,255) returns 10 (< 84) → effect applies
    // Arrange
    const context: MoveEffectContext = {
      ...createMoveEffectContext({ move: PSYCHIC_MOVE }),
      rng: fixedRng(10), // 10 < 84 → secondary applies
    };

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — unified Special: both spAttack and spDefense drop by 1 on defender
    // (Bug #93 fix triggers the secondary; bug #94 fix ensures both special stats are affected)
    expect(result.statChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "defender", stat: "spDefense", stages: -1 }),
        expect.objectContaining({ target: "defender", stat: "spAttack", stages: -1 }),
      ]),
    );
  });

  it("given a 100% chance stat-change (Growl), when executeMoveEffect is called, then the stat change always applies", () => {
    // 100% chance → threshold = floor(100 * 256 / 100) = 256; all rolls 0-255 < 256 → always applied
    // Arrange
    const context: MoveEffectContext = {
      ...createMoveEffectContext({ move: GROWL_MOVE }),
      rng: fixedRng(255), // highest possible roll; still applies at 100%
    };

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — always applied when chance is 100
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]?.stat).toBe("attack");
  });
});

// ============================================================================
// Bug #101 — Trapping moves use correct CORE_VOLATILE_IDS.bound volatile key
// Source: gen1-ground-truth.md §7 — Trapping Moves
// ============================================================================

describe(`Bug #101 — Trapping moves use ${CORE_VOLATILE_IDS.bound} volatile key`, () => {
  it(`given a trapping move (Wrap), when it hits, then volatileInflicted is ${CORE_VOLATILE_IDS.bound} not ${CORE_VOLATILE_IDS.trapped}`, () => {
    // Source: gen1-ground-truth.md §7 — Trapping Moves target is immobilized.
    // The engine checks CORE_VOLATILE_IDS.bound for immobilization; the volatile key must match.
    // Arrange
    // Synthetic branch driver: Gen 1 move data does not encode the bound volatile payload directly,
    // but executeMoveEffect applies it at runtime when a trapping effect is present.
    const context = createMoveEffectContext({
      move: createSyntheticMoveFrom(WRAP_MOVE, {
        effect: { type: "volatile-status", status: CORE_VOLATILE_IDS.bound, chance: 100 },
      }),
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — volatile inflicted must be CORE_VOLATILE_IDS.bound
    expect(result.volatileInflicted).toBe(CORE_VOLATILE_IDS.bound);
    expect(result.volatileInflicted).not.toBe(CORE_VOLATILE_IDS.trapped);
  });

  it(`given a Pokemon with ${CORE_VOLATILE_IDS.bound} volatile set, when canSwitch is called, then returns false`, () => {
    // Source: gen1-ground-truth.md §7 — Target completely immobilized — cannot attack or switch.
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon();
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 3, data: { bindTurns: 3 } });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    const canSwitch = ruleset.canSwitch(pokemon, state);

    // Assert — CORE_VOLATILE_IDS.bound prevents switching
    expect(canSwitch).toBe(false);
  });

  it(`given a Pokemon with ${CORE_VOLATILE_IDS.trapped} volatile (old wrong key), when canSwitch is called, then returns true (wrong key does not block)`, () => {
    // This confirms the fix: old code blocked on CORE_VOLATILE_IDS.trapped; now only CORE_VOLATILE_IDS.bound blocks.
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon();
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.trapped, { turnsLeft: 3 });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    const canSwitch = ruleset.canSwitch(pokemon, state);

    // Assert — CORE_VOLATILE_IDS.trapped is no longer the blocking key (bug was that it was used)
    // With the fix, canSwitch checks CORE_VOLATILE_IDS.bound not CORE_VOLATILE_IDS.trapped
    expect(canSwitch).toBe(true);
  });

  it("given a Pokemon without any trapping volatile, when canSwitch is called, then returns true", () => {
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon();
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    const canSwitch = ruleset.canSwitch(pokemon, state);

    // Assert
    expect(canSwitch).toBe(true);
  });
});

// ============================================================================
// Bug #102 — Hyper Beam recharge not skipped on KO
// Source: gen1-ground-truth.md §7 — Hyper Beam: skips recharge if KOs target
// ============================================================================

describe("Bug #102 — Hyper Beam skips recharge on KO", () => {
  it("given Hyper Beam KOs the defender, when executeMoveEffect is called post-engine, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam skips recharge if it KOs the target.
    // The engine applies damage to currentHp BEFORE calling executeMoveEffect, so a KO is
    // indicated by defender.pokemon.currentHp === 0 at the time executeMoveEffect runs.
    // Arrange — engine has already reduced defender to 0 HP (was 50, took 50)
    const defender = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, currentHp: 0 } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: HYPER_BEAM_MOVE, damage: 50, defender });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — KO occurred, recharge is skipped
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam overkills the defender, when executeMoveEffect is called post-engine, then noRecharge is true", () => {
    // Overkill case: damage > original HP still counts as a KO; engine clamps currentHp to 0.
    // Arrange — engine has already reduced defender to 0 HP (was 30, took 50)
    const defender = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, currentHp: 0 } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: HYPER_BEAM_MOVE, damage: 50, defender });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — overkill also skips recharge
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam does not KO the defender, when executeMoveEffect is called post-engine, then noRecharge is not set", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam only skips recharge on KO.
    // The engine has already applied damage; defender.currentHp > 0 means it survived.
    // Arrange — defender had 200 HP, took 50 damage; engine reduced currentHp to 150
    const defender = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, currentHp: 150 } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: HYPER_BEAM_MOVE, damage: 50, defender });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — target survived, recharge is required
    expect(result.noRecharge).toBeUndefined();
  });
});

// ============================================================================
// Bug #103 — Sleep counter persists through switch-out
// Source: gen1-ground-truth.md §6 Sleep + §8 What Persists on Switch-Out
// ============================================================================

describe("Bug #103 — Sleep counter persists through switch-out", () => {
  it("given a sleeping Pokemon with 3 turns remaining, when it switches out, then sleep-counter volatile is preserved", () => {
    // Source: gen1-ground-truth.md §8 — Sleep counter (does NOT reset) on switch-out.
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        status: CORE_STATUS_IDS.sleep as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 3 });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — sleep counter survives the switch
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(true);
    expect(pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(3);
  });

  it("given a sleeping Pokemon, when it switches out, then primary sleep status is preserved", () => {
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        status: CORE_STATUS_IDS.sleep as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 5 });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — primary status (sleep) is not cleared by onSwitchOut
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
  });

  it("given a non-sleeping Pokemon, when it switches out, then no sleep-counter volatile exists", () => {
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, status: null } as PokemonInstance,
    });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(false);
  });

  it("given a sleeping Pokemon with other volatiles, when it switches out, then other volatiles are cleared but sleep-counter remains", () => {
    // Gen 1: confusion, CORE_VOLATILE_IDS.bound, etc. are cleared on switch-out, but sleep counter persists.
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        status: CORE_STATUS_IDS.sleep as const,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 2 });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.bound, { turnsLeft: 2 });
    const state = createBattleState(pokemon, createSyntheticOnFieldPokemon());

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — sleep-counter persists; confusion and CORE_VOLATILE_IDS.bound are cleared
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(true);
    expect(pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(2);
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.confusion)).toBe(false);
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.bound)).toBe(false);
  });
});

// ============================================================================
// Bug #105 — moves.json missing GEN1_MOVE_IDS.sharpen
// Source: packages/gen1/CLAUDE.md — 165 moves; Gen 1 move ID 159 is Sharpen
// ============================================================================

describe(`Bug #105 — ${GEN1_MOVE_IDS.sharpen} move exists in move data`, () => {
  it(`given the Gen 1 data manager, when getting the ${GEN1_MOVE_IDS.sharpen} move, then it is defined with correct fields`, () => {
    // Source: packages/gen1/CLAUDE.md — 165 moves (the missing move was restored).
    // Arrange
    const dm = createGen1DataManager();

    // Act
    const sharpen = dm.getMove(GEN1_MOVE_IDS.sharpen);

    // Assert
    expect(sharpen).toBeDefined();
    expect(sharpen.id).toBe(GEN1_MOVE_IDS.sharpen);
    expect(sharpen.displayName).toBe("Sharpen");
    expect(sharpen.category).toBe("status");
    expect(sharpen.type).toBe(CORE_TYPE_IDS.normal);
    expect(sharpen.pp).toBe(30);
    expect(sharpen.target).toBe("self");
    expect(sharpen.power).toBeNull();
    expect(sharpen.accuracy).toBeNull();
  });

  it("given Sharpen move data, when executeMoveEffect is called, then Attack increases by 1 stage on the user", () => {
    // Arrange
    const dm = createGen1DataManager();
    const sharpen = dm.getMove(GEN1_MOVE_IDS.sharpen);
    const context = createMoveEffectContext({ move: sharpen });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — Sharpen raises Attack by 1 stage on self (attacker)
    const attackChange = result.statChanges.find(
      (c) => c.stat === "attack" && c.target === "attacker",
    );
    expect(attackChange).toBeDefined();
    expect(attackChange?.stages).toBe(1);
    // Only attack is changed (not a special move)
    expect(result.statChanges).toHaveLength(1);
  });
});
