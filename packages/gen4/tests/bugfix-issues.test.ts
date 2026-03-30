import type {
  AccuracyContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createEvs,
  createIvs,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  SeededRandom,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
  Gen4Ruleset,
} from "../src";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createRuleset(): Gen4Ruleset {
  return new Gen4Ruleset(createGen4DataManager());
}

function createMockRng(opts?: { intReturn?: number; chanceReturn?: boolean }) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => opts?.intReturn ?? 1,
    chance: (_p: number) => opts?.chanceReturn ?? false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

const DATA_MANAGER = createGen4DataManager();
const BASE_SPECIES = DATA_MANAGER.getSpecies(GEN4_SPECIES_IDS.bulbasaur);
const DEFAULT_NATURE = DATA_MANAGER.getNature(GEN4_NATURE_IDS.hardy).id;

function createScenarioPokemon(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  ability?: string;
  heldItem?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: BASE_SPECIES.id,
    nickname: null,
    level: 50,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    currentHp: maxHp,
    moves: [],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function createScenarioOnFieldPokemon(overrides: {
  maxHp?: number;
  status?: PokemonInstance["status"];
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  statStages?: Partial<Record<string, number>>;
  volatiles?: Map<VolatileStatus, { turnsLeft: number }>;
}): ActivePokemon {
  return {
    pokemon: createScenarioPokemon({
      maxHp: overrides.maxHp,
      status: overrides.status,
      ability: overrides.ability,
      heldItem: overrides.heldItem,
    }),
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: overrides.statStages?.speed ?? 0,
      accuracy: overrides.statStages?.accuracy ?? 0,
      evasion: overrides.statStages?.evasion ?? 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [...BASE_SPECIES.types],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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
  } as ActivePokemon;
}

function createBattleSide(index: 0 | 1, active?: ActivePokemon): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: active ? [active] : [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function createBattleSideWithHazards(
  active: ActivePokemon,
  hazards: Array<{ type: string; layers: number }>,
  luckyChantActive = false,
): BattleSide {
  return {
    index: 0 as const,
    trainer: null,
    team: [],
    active: [active],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: luckyChantActive, turnsLeft: luckyChantActive ? 5 : 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as BattleSide;
}

function createBattleState(overrides?: {
  sides?: [BattleSide, BattleSide];
  gravityActive?: boolean;
}): BattleState {
  return {
    phase: "turn-resolve",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [createBattleSide(0), createBattleSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: overrides?.gravityActive ?? false, turnsLeft: 0 },
    turnHistory: [],
    rng: createMockRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

/**
 * Scenario helper: clone a Gen 4 move record and override only explicitly
 * synthetic combat fields needed for the test.
 */
function createScenarioMove(overrides?: Partial<MoveData>): MoveData {
  const baseMove = DATA_MANAGER.getMove(overrides?.id ?? GEN4_MOVE_IDS.tackle);
  return {
    ...baseMove,
    id: baseMove.id,
    displayName: baseMove.displayName,
    type: overrides?.type ?? baseMove.type,
    category: overrides?.category ?? baseMove.category,
    power: overrides?.power ?? baseMove.power,
    accuracy: overrides?.accuracy ?? baseMove.accuracy,
    pp: baseMove.pp,
    priority: baseMove.priority,
    target: baseMove.target,
    flags: overrides?.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: baseMove.effect,
    description: baseMove.description,
    generation: baseMove.generation,
    critRatio: overrides?.critRatio ?? baseMove.critRatio,
  } as MoveData;
}

const STUB_STATE = {} as BattleState;

// ===========================================================================
// #354 -- processSleepTurn: Pokemon CAN act on wake turn in Gen 4
// ===========================================================================

describe("#354 processSleepTurn allows action on wake turn", () => {
  it("given sleep counter at 1 (last sleep turn), when processSleepTurn called, then returns true (Pokemon acts on wake)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts lines 39-52 --
    //   when time <= 0, cureStatus() and return without "return false",
    //   allowing the Pokemon to act.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({ status: CORE_STATUS_IDS.sleep });
    mon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 1 });

    const canAct = ruleset.processSleepTurn(mon, STUB_STATE);

    expect(canAct).toBe(true);
    expect(mon.pokemon.status).toBeNull();
    expect(mon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(false);
  });

  it("given sleep counter at 2, when processSleepTurn called twice, then first call returns false (still sleeping), second returns true (wakes and acts)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts --
    //   counter decrements each turn; once it hits 0, Pokemon wakes and CAN act.
    // Turn 1: counter 2 -> 1 (still sleeping, returns false)
    // Turn 2: counter 1 -> 0 (wakes up, returns true)
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({ status: CORE_STATUS_IDS.sleep });
    mon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 2 });

    const canActTurn1 = ruleset.processSleepTurn(mon, STUB_STATE);
    expect(canActTurn1).toBe(false);
    expect(mon.pokemon.status).toBe(CORE_STATUS_IDS.sleep);

    const canActTurn2 = ruleset.processSleepTurn(mon, STUB_STATE);
    expect(canActTurn2).toBe(true);
    expect(mon.pokemon.status).toBeNull();
  });
});

// ===========================================================================
// #356 -- rollSleepTurns: 1-4 effective turns (not 1-5)
// ===========================================================================

describe("#356 rollSleepTurns returns 1-4 effective turns", () => {
  it("given rollSleepTurns with seed=7, when called, then returns 1 effective turn", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts line 32 --
    //   this.effectState.time = this.random(2, 6); // counter 2-5
    //   Our processSleepTurn decrements turnsLeft; effective sleep = turnsLeft value.
    const ruleset = createRuleset();
    const rng = new SeededRandom(7);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBe(1);
  });

  it("given rollSleepTurns with seed=4, when called, then returns 4 effective turns", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts --
    //   counter random(2,6) = 2-5; effective turns 1-4.
    const ruleset = createRuleset();
    const rng = new SeededRandom(4);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBe(4);
  });
});

// ===========================================================================
// #359 -- Magic Guard prevents full paralysis (25% move loss)
// ===========================================================================

describe("#359 Magic Guard prevents full paralysis", () => {
  it("given a Pokemon with Magic Guard and paralysis, when checkFullParalysis called with rng returning true, then returns false (not fully paralyzed)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts lines 15-19 --
    //   if (!pokemon.hasAbility('magicguard') && this.randomChance(1, 4))
    //   Magic Guard holders skip the full paralysis check entirely.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({
      ability: GEN4_ABILITY_IDS.magicGuard,
      status: CORE_STATUS_IDS.paralysis,
    });
    const rng = createMockRng({ chanceReturn: true }); // would trigger paralysis normally

    const isFullyParalyzed = ruleset.checkFullParalysis(mon, rng as unknown as SeededRandom);

    expect(isFullyParalyzed).toBe(false);
  });

  it("given a Pokemon WITHOUT Magic Guard and paralysis, when checkFullParalysis called with rng returning true, then returns true (fully paralyzed)", () => {
    // Source: Showdown Gen 4 data/mods/gen4/conditions.ts --
    //   Non-Magic Guard Pokemon have normal 25% full paralysis chance.
    // The rng.chance(0.25) returns true, so the Pokemon is fully paralyzed.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({
      ability: CORE_ABILITY_IDS.blaze,
      status: CORE_STATUS_IDS.paralysis,
    });
    const rng = createMockRng({ chanceReturn: true });

    const isFullyParalyzed = ruleset.checkFullParalysis(mon, rng as unknown as SeededRandom);

    expect(isFullyParalyzed).toBe(true);
  });
});

// ===========================================================================
// #370 -- Entry hazards respect Gravity and Iron Ball grounding
// ===========================================================================

describe("#370 Entry hazards respect Gravity and Iron Ball grounding", () => {
  it("given a Flying-type with Gravity active, when stepping on Spikes, then takes damage (grounded by Gravity)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    // Source: Showdown Gen 4 mod -- Gravity grounds for hazard purposes.
    // Flying-type normally immune to Spikes, but Gravity overrides this.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({ types: [CORE_TYPE_IDS.flying], maxHp: 200 });
    const side = createBattleSideWithHazards(mon, [{ type: CORE_HAZARD_IDS.spikes, layers: 1 }]);
    const state = createBattleState({ gravityActive: true });

    const result = ruleset.applyEntryHazards(mon, side, state);

    // 1 layer Spikes = 1/8 max HP = floor(200/8) = 25
    // Source: Bulbapedia -- Spikes damage: 1 layer = 1/8 max HP
    expect(result.damage).toBe(25);
  });

  it("given a Levitate holder with Gravity active, when stepping on Toxic Spikes, then gets poisoned (grounded by Gravity)", () => {
    // Source: Bulbapedia -- Gravity grounds all Pokemon including Levitate holders.
    // Levitate normally makes a Pokemon immune to Toxic Spikes, but Gravity overrides.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({
      types: [CORE_TYPE_IDS.normal],
      ability: CORE_ABILITY_IDS.levitate,
      maxHp: 200,
    });
    const side = createBattleSideWithHazards(mon, [
      { type: CORE_HAZARD_IDS.toxicSpikes, layers: 1 },
    ]);
    const state = createBattleState({ gravityActive: true });

    const result = ruleset.applyEntryHazards(mon, side, state);

    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.poison);
  });

  it("given a Flying-type holding Iron Ball, when stepping on Spikes, then takes damage (grounded by Iron Ball)", () => {
    // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
    // Source: Showdown data/items.ts -- Iron Ball grounds the holder.
    // Flying-type normally immune to Spikes, but Iron Ball overrides.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({
      types: [CORE_TYPE_IDS.flying],
      maxHp: 200,
      heldItem: CORE_ITEM_IDS.ironBall,
    });
    const side = createBattleSideWithHazards(mon, [{ type: CORE_HAZARD_IDS.spikes, layers: 1 }]);
    const state = createBattleState();

    const result = ruleset.applyEntryHazards(mon, side, state);

    // 1 layer Spikes = 1/8 max HP = floor(200/8) = 25
    expect(result.damage).toBe(25);
  });

  it("given a Flying-type with NO Gravity and NO Iron Ball, when stepping on Spikes, then takes no damage (immune)", () => {
    // Source: Bulbapedia -- Flying-types are immune to Spikes unless grounded.
    // Control test: without grounding effects, Flying-type is immune.
    const ruleset = createRuleset();
    const mon = createScenarioOnFieldPokemon({ types: [CORE_TYPE_IDS.flying], maxHp: 200 });
    const side = createBattleSideWithHazards(mon, [{ type: CORE_HAZARD_IDS.spikes, layers: 1 }]);
    const state = createBattleState();

    const result = ruleset.applyEntryHazards(mon, side, state);

    expect(result.damage).toBe(0);
  });
});

// ===========================================================================
// #376 -- Unaware takes priority over Simple in stat stage calc
// ===========================================================================

describe("#376 Unaware takes priority over Simple in damage calc", () => {
  it("given attacker with Simple (+2 attack stage doubled to +4) vs defender with Unaware, when calculating damage, then Unaware ignores the boosted stages", () => {
    // Source: specs/battle/05-gen4.md -- Unaware ignores the opposing Pokemon's stat stage changes.
    const ruleset = createRuleset();

    const attacker = createScenarioOnFieldPokemon({
      ability: CORE_ABILITY_IDS.simple,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 }, // Simple would double to +4
    });
    const defender = createScenarioOnFieldPokemon({
      ability: GEN4_ABILITY_IDS.unaware,
      types: [CORE_TYPE_IDS.normal],
    });
    const move = createScenarioMove({
      power: 50,
      type: CORE_TYPE_IDS.normal,
      category: "physical",
    });
    const rng = createMockRng({ intReturn: 100 }); // max damage roll

    const resultWithUnaware = ruleset.calculateDamage({
      attacker,
      defender,
      move,
      state: createBattleState(),
      rng: rng as unknown as SeededRandom,
      isCrit: false,
    });

    const defenderNoUnaware = createScenarioOnFieldPokemon({
      ability: CORE_ABILITY_IDS.blaze,
      types: [CORE_TYPE_IDS.normal],
    });
    const rng2 = createMockRng({ intReturn: 100 });
    const resultWithoutUnaware = ruleset.calculateDamage({
      attacker,
      defender: defenderNoUnaware,
      move,
      state: createBattleState(),
      rng: rng2 as unknown as SeededRandom,
      isCrit: false,
    });

    const attackerBaseline = createScenarioOnFieldPokemon({
      ability: CORE_ABILITY_IDS.none,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 0 },
    });
    const rng3 = createMockRng({ intReturn: 100 });
    const resultBaseline = ruleset.calculateDamage({
      attacker: attackerBaseline,
      defender: createScenarioOnFieldPokemon({
        ability: CORE_ABILITY_IDS.blaze,
        types: [CORE_TYPE_IDS.normal],
      }),
      move,
      state: createBattleState(),
      rng: rng3 as unknown as SeededRandom,
      isCrit: false,
    });

    expect(resultWithUnaware.damage).toBe(resultBaseline.damage);
    expect(resultWithoutUnaware.damage).toBeGreaterThan(resultWithUnaware.damage);
  });

  it("given attacker with Simple (+1 attack stage) vs defender without Unaware, when calculating damage, then Simple doubles the stage to +2", () => {
    // Source: Showdown Gen 4 -- Simple doubles stat stages.
    // Control test: Simple works normally when Unaware is not present.
    const ruleset = createRuleset();

    const attackerSimple = createScenarioOnFieldPokemon({
      ability: CORE_ABILITY_IDS.simple,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 1 }, // Simple doubles to +2
    });
    const attackerNormal = createScenarioOnFieldPokemon({
      ability: CORE_ABILITY_IDS.blaze,
      types: [CORE_TYPE_IDS.normal],
      statStages: { attack: 2 }, // Normal +2
    });
    const defender = createScenarioOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = createScenarioMove({
      power: 50,
      type: CORE_TYPE_IDS.normal,
      category: "physical",
    });
    const rng1 = createMockRng({ intReturn: 100 });
    const rng2 = createMockRng({ intReturn: 100 });

    // Simple with +1 = effective +2
    const resultSimple = ruleset.calculateDamage({
      attacker: attackerSimple,
      defender,
      move,
      state: createBattleState(),
      rng: rng1 as unknown as SeededRandom,
      isCrit: false,
    });

    // Normal with +2 = effective +2
    const resultNormal = ruleset.calculateDamage({
      attacker: attackerNormal,
      defender,
      move,
      state: createBattleState(),
      rng: rng2 as unknown as SeededRandom,
      isCrit: false,
    });

    // Both should yield the same damage (both effective +2 attack)
    expect(resultSimple.damage).toBe(resultNormal.damage);
  });
});

// ===========================================================================
// #439 -- Lucky Chant blocks critical hits in rollCritical
// ===========================================================================

describe("#439 Lucky Chant blocks critical hits", () => {
  it("given Lucky Chant active on defender's side and seed 7, when rollCritical is called, then it returns false", () => {
    // Source: pret/pokeplatinum src/battle/battle_lib.c BattleSystem_CalcCriticalMulti
    //   line 7137: (sideConditions & SIDE_CONDITION_LUCKY_CHANT) == FALSE
    // Lucky Chant blocks all crits for the protected side.
    const ruleset = createRuleset();
    const attacker = createScenarioOnFieldPokemon({ ability: CORE_ABILITY_IDS.none });
    const defender = createScenarioOnFieldPokemon({ ability: CORE_ABILITY_IDS.none });
    const move = createScenarioMove({ critRatio: 0 });

    // Defender is on side 1, with Lucky Chant active
    const side0 = createBattleSide(0, attacker);
    const side1Lucky = {
      ...createBattleSide(1, defender),
      luckyChant: { active: true, turnsLeft: 5 },
    } as BattleSide;
    const state = createBattleState({ sides: [side0, side1Lucky] });
    const rng = new SeededRandom(7);
    const result = ruleset.rollCritical({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    expect(result).toBe(false);
  });

  it("given Lucky Chant NOT active on defender's side and seed 7, when rollCritical is called, then crits can land normally", () => {
    // Source: pret/pokeplatinum -- without Lucky Chant, normal crit rules apply.
    // Control test: Lucky Chant inactive, crits should be possible.
    const ruleset = createRuleset();
    const attacker = createScenarioOnFieldPokemon({ ability: CORE_ABILITY_IDS.none });
    const defender = createScenarioOnFieldPokemon({ ability: CORE_ABILITY_IDS.none });
    const move = createScenarioMove({ critRatio: 0 });

    const side0 = createBattleSide(0, attacker);
    const side1 = createBattleSide(1, defender);
    const state = createBattleState({ sides: [side0, side1] });
    const rng = new SeededRandom(7);
    const result = ruleset.rollCritical({
      attacker,
      defender,
      move,
      state,
      rng,
    });
    // Source: SeededRandom seed 7 hits the 1/16 crit roll when Lucky Chant is inactive.
    expect(result).toBe(true);
  });
});

// ===========================================================================
// #453 -- Tangled Feet applies 0.5x accuracy multiplier (not +2 evasion stage)
// ===========================================================================

describe("#453 Tangled Feet applies 0.5x accuracy multiplier", () => {
  it("given confused defender with Tangled Feet and 100-acc move, when checking accuracy, then effective accuracy is 50 (0.5x)", () => {
    // Source: Showdown data/abilities.ts -- Tangled Feet onModifyAccuracy: accuracy * 0.5
    // 100 accuracy move at neutral stages: calc = floor(3*100/3) = 100
    // After Tangled Feet: calc = floor(100 * 0.5) = 50
    // With rng roll = 50, the move should hit (roll <= calc).
    const ruleset = createRuleset();
    const attacker = createScenarioOnFieldPokemon({});
    const defender = createScenarioOnFieldPokemon({
      ability: GEN4_ABILITY_IDS.tangledFeet,
      volatiles: new Map([[CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 }]]),
    });
    const move = createScenarioMove({ accuracy: 100 });
    const rng = createMockRng({ intReturn: 50 });

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: createBattleState(),
      rng: rng as unknown as SeededRandom,
    };
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(true); // roll 50 <= calc 50 = hit
  });

  it("given confused defender with Tangled Feet and 100-acc move, when rng rolls 51, then move misses", () => {
    // Source: Showdown data/abilities.ts -- Tangled Feet onModifyAccuracy: accuracy * 0.5
    // calc = floor(100 * 0.5) = 50. rng = 51 > 50 => miss.
    // If Tangled Feet used +2 evasion (0.6x), calc would be 60 and rng 51 would hit.
    // This proves the 0.5x multiplier is used, not +2 evasion stage.
    const ruleset = createRuleset();
    const attacker = createScenarioOnFieldPokemon({});
    const defender = createScenarioOnFieldPokemon({
      ability: GEN4_ABILITY_IDS.tangledFeet,
      volatiles: new Map([[CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 }]]),
    });
    const move = createScenarioMove({ accuracy: 100 });
    const rng = createMockRng({ intReturn: 51 });

    const context: AccuracyContext = {
      attacker,
      defender,
      move,
      state: createBattleState(),
      rng: rng as unknown as SeededRandom,
    };
    const result = ruleset.doesMoveHit(context);
    expect(result).toBe(false); // roll 51 > calc 50 = miss
  });
});
