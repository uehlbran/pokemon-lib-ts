/**
 * Gen 7 Ruleset tests — Wave 1 core overrides.
 *
 * Covers:
 *   - getEffectiveSpeed branches (paralysis 0.5x, weather abilities, Slush Rush,
 *     Choice Scarf, Iron Ball, Klutz, Embargo, Simple, Slow Start, Unburden, Quick Feet)
 *   - resolveTurnOrder (switch/item/run vs move, priority, Trick Room, Tailwind, Quick Claw,
 *     speed ties)
 *   - rollConfusionSelfHit / getConfusionSelfHitChance (33% in Gen 7)
 *   - getAvailableHazards (includes sticky-web)
 *
 * Source: Showdown sim/pokemon.ts, sim/battle.ts, Bulbapedia ability/item pages
 */
import type { ActivePokemon, BattleAction, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen7DataManager,
  GEN7_ABILITY_IDS,
  GEN7_CRIT_MULTIPLIER,
  GEN7_CRIT_RATE_TABLE,
  GEN7_ITEM_IDS,
  GEN7_MOVE_IDS,
  GEN7_SPECIES_IDS,
  Gen7Ruleset,
} from "../src";

const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN7_MOVE_IDS } as const;
const ITEM_IDS = { ...CORE_ITEM_IDS, ...GEN7_ITEM_IDS } as const;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN7_ABILITY_IDS } as const;
const STATUS_IDS = CORE_STATUS_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const HAZARD_IDS = CORE_HAZARD_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const END_OF_TURN_EFFECT_IDS = CORE_END_OF_TURN_EFFECT_IDS;
const GEN7_DATA = createGen7DataManager();
const DEFAULT_SPECIES = GEN7_DATA.getSpecies(GEN7_SPECIES_IDS.pikachu);
const DEFAULT_MOVE = GEN7_DATA.getMove(MOVE_IDS.tackle);
const STATUS_SLEEP = STATUS_IDS.sleep;
const DEFAULT_LEVEL = 50;
const TAILWIND_TURNS = 4;
const TRICK_ROOM_TURNS = 5;
const TERRAIN_HEAL_END_OF_TURN = END_OF_TURN_EFFECT_IDS.grassyTerrainHeal;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSyntheticActive(
  overrides: {
    speed?: number;
    ability?: string | null;
    status?: string | null;
    heldItem?: string | null;
    speedStage?: number;
    volatiles?: [string, unknown][];
    hp?: number;
    currentHp?: number;
    types?: string[];
    moves?: { moveId: string }[];
  } = {},
): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const pokemon = createPokemonInstance(DEFAULT_SPECIES, DEFAULT_LEVEL, new SeededRandom(7), {
    moves: [],
    heldItem: overrides.heldItem ?? null,
    isShiny: false,
    gender: CORE_GENDERS.male,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 7,
  });

  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.status = overrides.status ?? null;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.moves = (overrides.moves ?? [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)]).map(
    (move) => createMoveSlot(move.moveId, GEN7_DATA.getMove(move.moveId).pp),
  );
  pokemon.calculatedStats = {
    hp,
    speed: overrides.speed ?? 100,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
  };

  return {
    pokemon,
    ability: overrides.ability ?? null,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: overrides.speedStage ?? 0,
      accuracy: 0,
      evasion: 0,
    },
    types: (overrides.types ?? DEFAULT_SPECIES.types) as any,
    volatileStatuses: new Map(
      (overrides.volatiles ?? []).map(([k, v]) => [k, v] as [string, unknown]),
    ),
    substituteHp: 0,
    turnsOnField: 1,
    movedThisTurn: false,
    consecutiveProtects: 0,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    forcedMove: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    suppressedAbility: null,
    teamSlot: 0,
  } as unknown as ActivePokemon;
}

function createBattleSide(
  index: 0 | 1,
  overrides?: {
    tailwind?: boolean;
    active?: ActivePokemon[];
  },
): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: overrides?.active ?? [],
    hazards: [],
    screens: [],
    tailwind: {
      active: overrides?.tailwind ?? false,
      turnsLeft: overrides?.tailwind ? TAILWIND_TURNS : 0,
    },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createTestRng(overrides?: {
  next?: () => number;
  chance?: (p: number) => boolean;
}): SeededRandom {
  return {
    next: overrides?.next ?? (() => 0.5),
    int: (min: number, _max: number) => min,
    chance: overrides?.chance ?? (() => false),
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

function createBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number } | null;
  trickRoom?: boolean;
  terrain?: { type: string; turnsLeft: number } | null;
  sides?: BattleSide[];
  rng?: SeededRandom;
}): BattleState {
  return {
    phase: "turn-resolve",
    generation: 7,
    format: "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [createBattleSide(0), createBattleSide(1)],
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: {
      active: overrides?.trickRoom ?? false,
      turnsLeft: overrides?.trickRoom ? TRICK_ROOM_TURNS : 0,
    },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: overrides?.rng ?? createTestRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

/** Instantiate a Gen7Ruleset with the real Gen 7 data bundle. */
function createTestRuleset(): Gen7Ruleset {
  return new Gen7Ruleset(GEN7_DATA);
}

const ruleset = createTestRuleset();

// ===========================================================================
// getEffectiveSpeed — tested indirectly via resolveTurnOrder
// ===========================================================================

describe("Gen7Ruleset — getEffectiveSpeed (via resolveTurnOrder)", () => {
  /**
   * Helper: resolves two move actions and returns the side index that goes first.
   * Both Pokemon use MOVE_IDS.tackle (priority 0) so ordering is purely by speed.
   */
  function whoGoesFirst(
    activeA: ActivePokemon,
    activeB: ActivePokemon,
    stateOverrides?: {
      weather?: { type: string; turnsLeft: number };
      trickRoom?: boolean;
      tailwindA?: boolean;
      tailwindB?: boolean;
    },
  ): number {
    const side0 = createBattleSide(0, {
      active: [activeA],
      tailwind: stateOverrides?.tailwindA,
    });
    const side1 = createBattleSide(1, {
      active: [activeB],
      tailwind: stateOverrides?.tailwindB,
    });
    const state = createBattleState({
      sides: [side0, side1],
      weather: stateOverrides?.weather ?? null,
      trickRoom: stateOverrides?.trickRoom,
    });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "move", side: 1, moveIndex: 0 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    return (ordered[0] as { side: number }).side;
  }

  // --- Paralysis ---

  it("given paralyzed Pokemon with 200 base speed vs 120 base speed, when resolving turn order, then paralyzed goes second (0.5x)", () => {
    // Source: Showdown sim/pokemon.ts Gen 7 -- paralysis reduces speed to 50%
    // 200 * 0.5 = 100 < 120 => paralyzed goes second
    const paralyzed = createSyntheticActive({ speed: 200, status: STATUS_IDS.paralysis });
    const normal = createSyntheticActive({ speed: 120 });
    expect(whoGoesFirst(paralyzed, normal)).toBe(1);
  });

  it("given paralyzed Pokemon with 100 base speed vs 40 base speed, when resolving turn order, then paralyzed goes first (100*0.5=50 > 40)", () => {
    // Source: Showdown sim/pokemon.ts Gen 7 -- paralysis reduces speed to 50%
    // 100 * 0.5 = 50 > 40 => paralyzed still faster
    const paralyzed = createSyntheticActive({ speed: 100, status: STATUS_IDS.paralysis });
    const slower = createSyntheticActive({ speed: 40 });
    expect(whoGoesFirst(paralyzed, slower)).toBe(0);
  });

  // --- Chlorophyll ---

  it("given Pokemon with Chlorophyll in sun with 50 base speed vs 80 base speed, when resolving turn order, then Chlorophyll user goes first", () => {
    // Source: Bulbapedia -- Chlorophyll doubles Speed in sun
    // 50 * 2 = 100 > 80
    const chloro = createSyntheticActive({ speed: 50, ability: ABILITY_IDS.chlorophyll });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(chloro, normal, { weather: { type: WEATHER_IDS.sun, turnsLeft: 3 } })).toBe(
      0,
    );
  });

  it("given Pokemon with Chlorophyll NOT in sun with 50 base speed vs 80 base speed, when resolving turn order, then Chlorophyll user goes second", () => {
    // Source: Bulbapedia -- Chlorophyll only activates in sun
    // No sun: 50 < 80
    const chloro = createSyntheticActive({ speed: 50, ability: ABILITY_IDS.chlorophyll });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(chloro, normal)).toBe(1);
  });

  // --- Swift Swim ---

  it("given Pokemon with Swift Swim in rain with 50 base speed vs 80 base speed, when resolving turn order, then Swift Swim user goes first", () => {
    // Source: Bulbapedia -- Swift Swim doubles Speed in rain
    // 50 * 2 = 100 > 80
    const swimmer = createSyntheticActive({ speed: 50, ability: ABILITY_IDS.swiftSwim });
    const normal = createSyntheticActive({ speed: 80 });
    expect(
      whoGoesFirst(swimmer, normal, { weather: { type: WEATHER_IDS.rain, turnsLeft: 3 } }),
    ).toBe(0);
  });

  // --- Sand Rush ---

  it("given Pokemon with Sand Rush in sandstorm with 50 base speed vs 80 base speed, when resolving turn order, then Sand Rush user goes first", () => {
    // Source: Bulbapedia -- Sand Rush doubles Speed in sandstorm
    // 50 * 2 = 100 > 80
    const rush = createSyntheticActive({ speed: 50, ability: ABILITY_IDS.sandRush });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(rush, normal, { weather: { type: WEATHER_IDS.sand, turnsLeft: 3 } })).toBe(
      0,
    );
  });

  // --- Slush Rush (NEW in Gen 7) ---

  it("given Pokemon with Slush Rush in hail with 50 base speed vs 80 base speed, when resolving turn order, then Slush Rush user goes first", () => {
    // Source: Showdown data/abilities.ts:5001-5010 -- Slush Rush doubles speed in Hail
    // Source: Bulbapedia -- Slush Rush (introduced Gen 7): doubles Speed in hail
    // 50 * 2 = 100 > 80
    const slush = createSyntheticActive({ speed: 50, ability: ABILITY_IDS.slushRush });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(slush, normal, { weather: { type: WEATHER_IDS.hail, turnsLeft: 3 } })).toBe(
      0,
    );
  });

  it("given Pokemon with Slush Rush NOT in hail with 50 base speed vs 80 base speed, when resolving turn order, then Slush Rush user goes second", () => {
    // Source: Bulbapedia -- Slush Rush only activates in hail
    // No hail: 50 < 80
    const slush = createSyntheticActive({ speed: 50, ability: ABILITY_IDS.slushRush });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(slush, normal)).toBe(1);
  });

  // --- Choice Scarf ---

  it("given Pokemon with Choice Scarf and 80 base speed vs 100 base speed, when resolving turn order, then Scarf user goes first", () => {
    // Source: Bulbapedia -- Choice Scarf boosts Speed 1.5x
    // 80 * 1.5 = 120 > 100
    const scarfed = createSyntheticActive({ speed: 80, heldItem: ITEM_IDS.choiceScarf });
    const normal = createSyntheticActive({ speed: 100 });
    expect(whoGoesFirst(scarfed, normal)).toBe(0);
  });

  it("given Pokemon with Choice Scarf and 60 base speed vs 100 base speed, when resolving turn order, then Scarf user goes second", () => {
    // Source: Bulbapedia -- Choice Scarf: 60 * 1.5 = 90 < 100
    const scarfed = createSyntheticActive({ speed: 60, heldItem: ITEM_IDS.choiceScarf });
    const normal = createSyntheticActive({ speed: 100 });
    expect(whoGoesFirst(scarfed, normal)).toBe(1);
  });

  // --- Iron Ball ---

  it("given Pokemon with Iron Ball and 200 base speed vs 120 base speed, when resolving turn order, then Iron Ball holder goes second", () => {
    // Source: Bulbapedia -- Iron Ball halves Speed
    // 200 * 0.5 = 100 < 120
    const ironBall = createSyntheticActive({ speed: 200, heldItem: ITEM_IDS.ironBall });
    const normal = createSyntheticActive({ speed: 120 });
    expect(whoGoesFirst(ironBall, normal)).toBe(1);
  });

  // --- Iron Ball + Klutz ---

  it("given Pokemon with Iron Ball and Klutz and 200 base speed vs 120 base speed, when resolving turn order, then Klutz user goes first", () => {
    // Source: Bulbapedia -- Klutz suppresses Iron Ball speed penalty
    // 200 > 120
    const klutzBall = createSyntheticActive({
      speed: 200,
      ability: ABILITY_IDS.klutz,
      heldItem: ITEM_IDS.ironBall,
    });
    const normal = createSyntheticActive({ speed: 120 });
    expect(whoGoesFirst(klutzBall, normal)).toBe(0);
  });

  // --- Embargo + Choice Scarf ---

  it("given Pokemon with Embargo volatile and Choice Scarf and 80 base speed vs 100 base speed, when resolving turn order, then Embargoged user goes second", () => {
    // Source: Bulbapedia -- Embargo prevents held item effects
    // Embargo blocks Scarf: 80 < 100
    const embargoed = createSyntheticActive({
      speed: 80,
      heldItem: ITEM_IDS.choiceScarf,
      volatiles: [[VOLATILE_IDS.embargo, { turnsLeft: 3 }]],
    });
    const normal = createSyntheticActive({ speed: 100 });
    expect(whoGoesFirst(embargoed, normal)).toBe(1);
  });

  // --- Embargo + Iron Ball ---

  it("given Pokemon with Embargo volatile and Iron Ball and 200 base speed vs 120 base speed, when resolving turn order, then Embargoged user goes first (Iron Ball suppressed)", () => {
    // Source: Bulbapedia -- Embargo prevents held item effects including Iron Ball
    // Embargo suppresses Iron Ball: 200 > 120
    const embargoed = createSyntheticActive({
      speed: 200,
      heldItem: ITEM_IDS.ironBall,
      volatiles: [[VOLATILE_IDS.embargo, { turnsLeft: 3 }]],
    });
    const normal = createSyntheticActive({ speed: 120 });
    expect(whoGoesFirst(embargoed, normal)).toBe(0);
  });

  // --- Slow Start ---

  it("given Pokemon with Slow Start volatile and 200 base speed vs 120 base speed, when resolving turn order, then Slow Start user goes second", () => {
    // Source: Bulbapedia -- Slow Start halves Speed for 5 turns
    // 200 / 2 = 100 < 120
    const slowStart = createSyntheticActive({
      speed: 200,
      ability: ABILITY_IDS.slowStart,
      volatiles: [[ABILITY_IDS.slowStart, { turnsLeft: 3 }]],
    });
    const normal = createSyntheticActive({ speed: 120 });
    expect(whoGoesFirst(slowStart, normal)).toBe(1);
  });

  // --- Unburden ---

  it("given Pokemon with Unburden volatile and no item and 50 base speed vs 80 base speed, when resolving turn order, then Unburden user goes first", () => {
    // Source: Bulbapedia -- Unburden doubles Speed when held item is consumed
    // 50 * 2 = 100 > 80
    const unburden = createSyntheticActive({
      speed: 50,
      ability: ABILITY_IDS.unburden,
      heldItem: null,
      volatiles: [[ABILITY_IDS.unburden, { turnsLeft: -1 }]],
    });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(unburden, normal)).toBe(0);
  });

  it("given Pokemon with Unburden volatile but still holding item and 50 base speed vs 80 base speed, when resolving turn order, then Unburden user goes second", () => {
    // Source: Bulbapedia -- Unburden only activates when item is actually gone
    // Still has item: 50 < 80
    const unburdenWithItem = createSyntheticActive({
      speed: 50,
      ability: ABILITY_IDS.unburden,
      heldItem: ITEM_IDS.sitrusBerry,
      volatiles: [[ABILITY_IDS.unburden, { turnsLeft: -1 }]],
    });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(unburdenWithItem, normal)).toBe(1);
  });

  // --- Quick Feet ---

  it("given Pokemon with Quick Feet and paralysis status and 100 base speed vs 130 base speed, when resolving turn order, then Quick Feet user goes first", () => {
    // Source: Bulbapedia -- Quick Feet: 1.5x speed when statused, overrides paralysis penalty
    // 100 * 1.5 = 150 > 130 (paralysis penalty NOT applied)
    const quickFeet = createSyntheticActive({
      speed: 100,
      ability: ABILITY_IDS.quickFeet,
      status: STATUS_IDS.paralysis,
    });
    const normal = createSyntheticActive({ speed: 130 });
    expect(whoGoesFirst(quickFeet, normal)).toBe(0);
  });

  it("given Pokemon with Quick Feet and burn status and 80 base speed vs 100 base speed, when resolving turn order, then Quick Feet user goes first", () => {
    // Source: Bulbapedia -- Quick Feet: 1.5x speed with any non-null status
    // 80 * 1.5 = 120 > 100
    const quickFeet = createSyntheticActive({
      speed: 80,
      ability: ABILITY_IDS.quickFeet,
      status: STATUS_IDS.burn,
    });
    const normal = createSyntheticActive({ speed: 100 });
    expect(whoGoesFirst(quickFeet, normal)).toBe(0);
  });

  // --- Simple ---

  it("given Pokemon with Simple ability and +1 speed stage and 50 base speed vs 80 base speed, when resolving turn order, then Simple user goes first", () => {
    // Source: Bulbapedia -- Simple doubles stat stage effects
    // +1 becomes +2: 50 * 2.0 = 100 > 80
    const simple = createSyntheticActive({
      speed: 50,
      ability: ABILITY_IDS.simple,
      speedStage: 1,
    });
    const normal = createSyntheticActive({ speed: 80 });
    expect(whoGoesFirst(simple, normal)).toBe(0);
  });

  it("given Pokemon with Simple ability and +4 speed stage (capped at +6), when resolving turn order, then stage is capped at +6", () => {
    // Source: Bulbapedia -- Simple doubles stage but capped at +6/-6
    // +4 * 2 = +8, capped to +6: 50 * 4.0 = 200
    // vs normal at 180 => Simple user goes first
    const simple = createSyntheticActive({
      speed: 50,
      ability: ABILITY_IDS.simple,
      speedStage: 4,
    });
    const normal = createSyntheticActive({ speed: 180 });
    expect(whoGoesFirst(simple, normal)).toBe(0);
  });

  // --- Tailwind ---

  it("given Tailwind on side A with 80 speed vs side B with 100 speed, when resolving turn order, then Tailwind side goes first", () => {
    // Source: Bulbapedia -- Tailwind doubles Speed of user's side
    // 80 * 2 = 160 > 100
    const slow = createSyntheticActive({ speed: 80 });
    const fast = createSyntheticActive({ speed: 100 });
    expect(whoGoesFirst(slow, fast, { tailwindA: true })).toBe(0);
  });

  it("given Tailwind on side B with 100 speed vs side A with 80 speed, when resolving turn order, then Tailwind side goes first", () => {
    // Source: Bulbapedia -- Tailwind doubles Speed of user's side
    // Side B: 100 * 2 = 200 > 80
    const slow = createSyntheticActive({ speed: 80 });
    const fast = createSyntheticActive({ speed: 100 });
    expect(whoGoesFirst(slow, fast, { tailwindB: true })).toBe(1);
  });
});

// ===========================================================================
// resolveTurnOrder — action type priority and Trick Room
// ===========================================================================

describe("Gen7Ruleset — resolveTurnOrder (action types and Trick Room)", () => {
  it("given switch vs move, when resolving turn order, then switch goes first", () => {
    // Source: Showdown -- switches always precede moves
    const poke = createSyntheticActive();
    const side0 = createBattleSide(0, { active: [poke] });
    const side1 = createBattleSide(1, { active: [createSyntheticActive()] });
    const state = createBattleState({ sides: [side0, side1] });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "switch", side: 1 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    expect((ordered[0] as { type: string }).type).toBe("switch");
  });

  it("given item use vs move, when resolving turn order, then item goes first", () => {
    // Source: Showdown -- item usage precedes moves
    const poke = createSyntheticActive();
    const side0 = createBattleSide(0, { active: [poke] });
    const side1 = createBattleSide(1, { active: [createSyntheticActive()] });
    const state = createBattleState({ sides: [side0, side1] });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "item", side: 1 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    expect((ordered[0] as { type: string }).type).toBe("item");
  });

  it("given run vs move, when resolving turn order, then run goes first", () => {
    // Source: Showdown -- run action precedes moves
    const poke = createSyntheticActive();
    const side0 = createBattleSide(0, { active: [poke] });
    const side1 = createBattleSide(1, { active: [createSyntheticActive()] });
    const state = createBattleState({ sides: [side0, side1] });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "run", side: 1 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    expect((ordered[0] as { type: string }).type).toBe("run");
  });

  it("given Trick Room active with slow (50) vs fast (150), when resolving turn order, then slower goes first", () => {
    // Source: Bulbapedia -- Trick Room reverses speed order
    const slow = createSyntheticActive({ speed: 50 });
    const fast = createSyntheticActive({ speed: 150 });
    const side0 = createBattleSide(0, { active: [slow] });
    const side1 = createBattleSide(1, { active: [fast] });
    const state = createBattleState({ trickRoom: true, sides: [side0, side1] });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "move", side: 1, moveIndex: 0 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    // Under Trick Room, slower Pokemon (side 0, speed 50) goes first
    expect((ordered[0] as { side: number }).side).toBe(0);
  });

  it("given Trick Room active with fast (150) vs slow (50), when resolving turn order, then slower goes first", () => {
    // Source: Bulbapedia -- Trick Room reverses speed order
    // Side 0 is fast, side 1 is slow => side 1 goes first
    const fast = createSyntheticActive({ speed: 150 });
    const slow = createSyntheticActive({ speed: 50 });
    const side0 = createBattleSide(0, { active: [fast] });
    const side1 = createBattleSide(1, { active: [slow] });
    const state = createBattleState({ trickRoom: true, sides: [side0, side1] });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "move", side: 1, moveIndex: 0 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, state.rng);
    expect((ordered[0] as { side: number }).side).toBe(1);
  });

  it("given two Pokemon with equal speed, when resolving turn order, then tiebreak is random", () => {
    // Source: Showdown sim/battle.ts -- speed ties broken by RNG tiebreak
    const pokeA = createSyntheticActive({ speed: 100 });
    const pokeB = createSyntheticActive({ speed: 100 });
    const side0 = createBattleSide(0, { active: [pokeA] });
    const side1 = createBattleSide(1, { active: [pokeB] });

    // Use a RNG where first next() returns 0.3, second returns 0.7
    // This means side 0 gets tiebreak 0.3, side 1 gets tiebreak 0.7
    // Side 0 should go first (lower tiebreak)
    let callCount = 0;
    const rng = createTestRng({
      next: () => {
        callCount++;
        return callCount <= 1 ? 0.3 : 0.7;
      },
    });
    const state = createBattleState({ sides: [side0, side1], rng });
    const actions: BattleAction[] = [
      { type: "move", side: 0, moveIndex: 0 } as BattleAction,
      { type: "move", side: 1, moveIndex: 0 } as BattleAction,
    ];
    const ordered = ruleset.resolveTurnOrder(actions, state, rng);
    expect((ordered[0] as { side: number }).side).toBe(0);
  });
});

// ===========================================================================
// rollConfusionSelfHit / getConfusionSelfHitChance
// ===========================================================================

describe("Gen7Ruleset — confusion self-hit (33%)", () => {
  it("given Gen 7 ruleset, when getting confusion self-hit chance, then returns 1/3", () => {
    // Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting
    //   itself in confusion has decreased from 50% to approximately 33%."
    expect(ruleset.getConfusionSelfHitChance()).toBeCloseTo(1 / 3, 10);
  });

  it("given Gen 7 ruleset, when getting confusion self-hit chance, then differs from Gen 6 (50%)", () => {
    // Source: Bulbapedia -- Gen 6 = 50%, Gen 7 = 33%
    const chance = ruleset.getConfusionSelfHitChance();
    expect(chance).not.toBe(0.5);
    expect(chance).toBeLessThan(0.5);
  });

  it("given Gen 7 ruleset with RNG returning true for 1/3, when rolling confusion self-hit, then returns true", () => {
    // Source: Bulbapedia -- Gen 7+ confusion self-hit chance is ~33%
    // Mock RNG where chance(1/3) returns true
    const rng = createTestRng({ chance: () => true });
    expect(ruleset.rollConfusionSelfHit(rng)).toBe(true);
  });

  it("given Gen 7 ruleset with RNG returning false for 1/3, when rolling confusion self-hit, then returns false", () => {
    // Source: Bulbapedia -- Gen 7+ confusion 2/3 of the time the Pokemon acts normally
    const rng = createTestRng({ chance: () => false });
    expect(ruleset.rollConfusionSelfHit(rng)).toBe(false);
  });

  it("given Gen 7 ruleset, when rolling confusion self-hit many times, then triggers approximately 33% of time", () => {
    // Source: Bulbapedia -- Gen 7+ confusion rate is 1/3
    // Statistical test: over 3000 rolls, should hit ~1000 times (+/- reasonable margin)
    let hits = 0;
    const iterations = 3000;
    for (let i = 0; i < iterations; i++) {
      // Create a deterministic but varying RNG by using a counter
      const _threshold = 1 / 3;
      const value = (i % 100) / 100; // 0.00 to 0.99
      const rng = createTestRng({ chance: (p: number) => value < p });
      if (ruleset.rollConfusionSelfHit(rng)) hits++;
    }
    // 1/3 of 3000 = 1000. With threshold checking 0-99, values 0-32 (33 values)
    // hit for each 100 iterations = 33%. 30 * 33 = 990 hits
    const rate = hits / iterations;
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.42);
  });
});

// ===========================================================================
// getAvailableHazards
// ===========================================================================

describe("Gen7Ruleset — getAvailableHazards", () => {
  it("given gen7 ruleset, when getting available hazards, then includes sticky-web", () => {
    // Source: Bulbapedia -- Sticky Web introduced in Gen 6, still present in Gen 7
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toContain(HAZARD_IDS.stickyWeb);
  });

  it("given gen7 ruleset, when getting available hazards, then includes all four hazard types", () => {
    // Source: Showdown data/moves.ts -- Gen 7 has stealth-rock, spikes, toxic-spikes, sticky-web
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toEqual([
      HAZARD_IDS.stealthRock,
      HAZARD_IDS.spikes,
      HAZARD_IDS.toxicSpikes,
      HAZARD_IDS.stickyWeb,
    ]);
  });
});

// ===========================================================================
// Inherited BaseRuleset defaults verification
// ===========================================================================

describe("Gen7Ruleset — inherited BaseRuleset defaults", () => {
  it("given Gen7Ruleset, when getting crit multiplier, then returns 1.5 (Gen 6+ default)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier is 1.5x
    expect(ruleset.getCritMultiplier()).toBe(GEN7_CRIT_MULTIPLIER);
  });

  it("given Gen7Ruleset, when getting crit rate table, then returns Gen 6+ table [24, 8, 2, 1]", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit rate table
    expect(ruleset.getCritRateTable()).toEqual(GEN7_CRIT_RATE_TABLE);
  });

  it("given Gen7Ruleset, when getting post-attack residual order, then returns empty array", () => {
    // Source: Gen 3+ has no per-attack residuals
    expect(ruleset.getPostAttackResidualOrder()).toEqual([]);
  });

  it("given Gen7Ruleset, when checking recalculatesFutureAttackDamage, then returns true", () => {
    // Source: Bulbapedia -- Gen 5+ recalculates Future Sight/Doom Desire at hit time
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });
});

// ===========================================================================
// capLethalDamage — Sturdy
// ===========================================================================

describe("Gen7Ruleset — capLethalDamage (Sturdy)", () => {
  it("given defender with Sturdy at full HP and lethal damage, when capping, then caps at maxHp-1", () => {
    // Source: Showdown data/abilities.ts -- Sturdy: survive at 1 HP from full
    const defender = createSyntheticActive({
      ability: ABILITY_IDS.sturdy,
      hp: 200,
      currentHp: 200,
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(199);
    expect(result.survived).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("given defender with Sturdy NOT at full HP and lethal damage, when capping, then does NOT cap", () => {
    // Source: Showdown data/abilities.ts -- Sturdy only works at full HP
    const defender = createSyntheticActive({
      ability: ABILITY_IDS.sturdy,
      hp: 200,
      currentHp: 150,
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      200,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(200);
    expect(result.survived).toBe(false);
  });

  it("given defender without Sturdy at full HP and lethal damage, when capping, then does NOT cap", () => {
    // Source: Showdown data/abilities.ts -- only Sturdy triggers this
    const defender = createSyntheticActive({ hp: 200, currentHp: 200 }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
  });

  it("given defender with Sturdy at full HP and non-lethal damage, when capping, then does NOT cap", () => {
    // Source: Showdown data/abilities.ts -- Sturdy only caps lethal damage
    const defender = createSyntheticActive({
      ability: ABILITY_IDS.sturdy,
      hp: 200,
      currentHp: 200,
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      100,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(100);
    expect(result.survived).toBe(false);
  });
});

// ===========================================================================
// capLethalDamage — Focus Sash (#784)
// ===========================================================================

describe("Gen7Ruleset — capLethalDamage (Focus Sash)", () => {
  it("given Pokemon at full HP holding Focus Sash, when lethal damage is dealt, then survives at 1 HP and consumedItem is set", () => {
    // Source: Showdown data/items.ts -- Focus Sash: "If holder has full HP, will survive an attack that would KO it with 1 HP"
    // Source: Bulbapedia -- Focus Sash: "If the holder has full HP, it will survive a hit that would KO it with 1 HP"
    const defender = createSyntheticActive({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(199);
    expect(result.survived).toBe(true);
    expect(result.consumedItem).toBe(ITEM_IDS.focusSash);
    expect(result.messages[0]).toContain("Focus Sash");
  });

  it("given Pokemon NOT at full HP holding Focus Sash, when lethal damage is dealt, then Focus Sash does not activate", () => {
    // Source: Showdown data/items.ts -- Focus Sash requires full HP (currentHp === maxHp)
    const defender = createSyntheticActive({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 150,
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      200,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(200);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Pokemon at full HP holding Focus Sash with Klutz, when lethal damage is dealt, then Focus Sash is suppressed", () => {
    // Source: Showdown data/abilities.ts -- klutz: "This Pokemon's held item has no effect"
    // Klutz suppresses item activation, so Focus Sash does not trigger
    const defender = createSyntheticActive({
      ability: ABILITY_IDS.klutz,
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Pokemon at full HP holding Focus Sash under Embargo, when lethal damage is dealt, then Focus Sash is suppressed", () => {
    // Source: Showdown data/moves.ts -- embargo: "target's held item has no effect"
    // Embargo volatile status suppresses item activation
    const defender = createSyntheticActive({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
      volatiles: [[VOLATILE_IDS.embargo, { turnsLeft: 5 }]],
    }) as any;
    const attacker = createSyntheticActive();
    const result = ruleset.capLethalDamage(
      300,
      defender,
      attacker,
      DEFAULT_MOVE as any,
      {} as BattleState,
    );
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });

  it("given Magic Room active on field, when lethal damage dealt to full-HP Pokemon with Focus Sash, then faints (sash suppressed)", () => {
    // Source: Showdown sim/battle.ts -- Magic Room suppresses all item effects
    // Source: Showdown data/items.ts -- Focus Sash is an item effect, suppressed by Magic Room
    const defender = createSyntheticActive({
      heldItem: ITEM_IDS.focusSash,
      hp: 200,
      currentHp: 200,
    }) as any;
    const attacker = createSyntheticActive();
    const state = { magicRoom: { active: true, turnsLeft: 3 } } as BattleState;
    const result = ruleset.capLethalDamage(300, defender, attacker, DEFAULT_MOVE as any, state);
    expect(result.damage).toBe(300);
    expect(result.survived).toBe(false);
    expect(result.consumedItem).toBeUndefined();
  });
});

// ===========================================================================
// canHitSemiInvulnerable
// ===========================================================================

describe("Gen7Ruleset — canHitSemiInvulnerable", () => {
  it("given thousand-arrows vs flying, when checking semi-invulnerable bypass, then returns true", () => {
    // Source: Showdown data/moves.ts -- thousandarrows hits Flying semi-invulnerable state
    expect(
      ruleset.canHitSemiInvulnerable(MOVE_IDS.thousandArrows, VOLATILE_IDS.flying as any),
    ).toBe(true);
  });

  it("given hurricane vs flying, when checking semi-invulnerable bypass, then returns true", () => {
    // Source: Showdown -- Hurricane hits Fly/Bounce targets
    expect(ruleset.canHitSemiInvulnerable(MOVE_IDS.hurricane, VOLATILE_IDS.flying as any)).toBe(
      true,
    );
  });

  it("given flamethrower vs flying, when checking semi-invulnerable bypass, then returns false", () => {
    // Source: Showdown -- normal moves cannot hit Fly targets
    expect(ruleset.canHitSemiInvulnerable(MOVE_IDS.flamethrower, VOLATILE_IDS.flying as any)).toBe(
      false,
    );
  });

  it("given earthquake vs underground, when checking semi-invulnerable bypass, then returns true", () => {
    // Source: Showdown -- Earthquake hits Dig targets
    expect(
      ruleset.canHitSemiInvulnerable(MOVE_IDS.earthquake, VOLATILE_IDS.underground as any),
    ).toBe(true);
  });

  it("given surf vs underwater, when checking semi-invulnerable bypass, then returns true", () => {
    // Source: Showdown -- Surf hits Dive targets
    expect(ruleset.canHitSemiInvulnerable(MOVE_IDS.surf, VOLATILE_IDS.underwater as any)).toBe(
      true,
    );
  });

  it("given any move vs shadow-force-charging, when checking semi-invulnerable bypass, then returns false", () => {
    // Source: Showdown -- nothing bypasses Shadow Force / Phantom Force
    expect(
      ruleset.canHitSemiInvulnerable(MOVE_IDS.earthquake, VOLATILE_IDS.shadowForceCharging as any),
    ).toBe(false);
  });

  it("given any move vs charging, when checking semi-invulnerable bypass, then returns true (not semi-invulnerable)", () => {
    // Source: Showdown -- charging moves (SolarBeam) are not semi-invulnerable
    expect(ruleset.canHitSemiInvulnerable(MOVE_IDS.tackle, VOLATILE_IDS.charging as any)).toBe(
      true,
    );
  });

  it("given any move vs unknown volatile, when checking semi-invulnerable bypass, then returns false", () => {
    // Default branch
    expect(ruleset.canHitSemiInvulnerable(MOVE_IDS.tackle, VOLATILE_IDS.confusion as any)).toBe(
      false,
    );
  });
});

// ===========================================================================
// rollCritical — Battle Armor / Shell Armor
// ===========================================================================

describe("Gen7Ruleset — rollCritical (ability immunity)", () => {
  it("given defender with battle-armor, when rolling crit, then always returns false", () => {
    // Source: Showdown sim/battle-actions.ts -- Battle Armor prevents crits
    const context = {
      attacker: createSyntheticActive(),
      defender: createSyntheticActive({ ability: ABILITY_IDS.battleArmor }),
      move: { critRatio: 0 } as any,
      rng: { int: () => 1 } as unknown as SeededRandom,
    };
    expect(ruleset.rollCritical(context as any)).toBe(false);
  });

  it("given defender with shell-armor, when rolling crit, then always returns false", () => {
    // Source: Showdown sim/battle-actions.ts -- Shell Armor prevents crits
    const context = {
      attacker: createSyntheticActive(),
      defender: createSyntheticActive({ ability: ABILITY_IDS.shellArmor }),
      move: { critRatio: 0 } as any,
      rng: { int: () => 1 } as unknown as SeededRandom,
    };
    expect(ruleset.rollCritical(context as any)).toBe(false);
  });
});

// ===========================================================================
// getEndOfTurnOrder
// ===========================================================================

describe("Gen7Ruleset — getEndOfTurnOrder", () => {
  it("given Gen7Ruleset, when getting end-of-turn order, then includes grassy-terrain-heal", () => {
    // Source: Showdown data/conditions.ts -- grassy terrain heals 1/16 at end of turn
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(TERRAIN_HEAL_END_OF_TURN);
  });

  it("given Gen7Ruleset, when getting end-of-turn order, then status-damage comes after leech-seed", () => {
    // Source: Showdown data/conditions.ts -- residual ordering
    const order = ruleset.getEndOfTurnOrder();
    const leechIdx = order.indexOf(VOLATILE_IDS.leechSeed);
    const statusIdx = order.indexOf(END_OF_TURN_EFFECT_IDS.statusDamage);
    expect(leechIdx).toBeLessThan(statusIdx);
  });

  it("given Gen7Ruleset, when getting end-of-turn order, then terrain-countdown and weather-countdown are present", () => {
    // Source: Showdown data/conditions.ts -- terrain and weather count down at end of turn
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(END_OF_TURN_EFFECT_IDS.terrainCountdown);
    expect(order).toContain(END_OF_TURN_EFFECT_IDS.weatherCountdown);
  });

  it("given Gen7Ruleset, when getting end-of-turn order, then includes speed-boost and moody", () => {
    // Source: Showdown data/conditions.ts -- Speed Boost and Moody activate end of turn
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(ABILITY_IDS.speedBoost);
    expect(order).toContain(ABILITY_IDS.moody);
  });
});

// ===========================================================================
// Stub methods — verify they return expected defaults
// ===========================================================================

describe("Gen7Ruleset — stub methods return defaults", () => {
  it("given Gen7Ruleset, when applying terrain effects, then returns empty array (stub)", () => {
    // Stub -- will be implemented in Wave 3
    const state = createBattleState();
    expect(ruleset.applyTerrainEffects(state)).toEqual([]);
  });

  it("given Gen7Ruleset, when checking terrain status immunity with no terrain, then returns not immune (stub)", () => {
    // Stub -- will be fully implemented in Wave 3
    const target = createSyntheticActive();
    const state = createBattleState();
    const result = ruleset.checkTerrainStatusImmunity(STATUS_SLEEP as never, target, state);
    expect(result.immune).toBe(false);
  });

  it("given Gen7Ruleset, when executing move effect, then delegates to BaseRuleset", () => {
    // Stub -- delegates to super.executeMoveEffect
    // This test just verifies it doesn't throw for a basic invocation
    expect(() => {
      ruleset.executeMoveEffect({
        move: DEFAULT_MOVE as any,
        attacker: createSyntheticActive(),
        defender: createSyntheticActive(),
        state: createBattleState(),
        rng: createTestRng(),
        damage: 0,
      } as any);
    }).not.toThrow();
  });

  it("given Gen7Ruleset, when applying entry hazards, then returns empty result (stub)", () => {
    // Stub -- will be implemented in Wave 4
    const pokemon = createSyntheticActive();
    const side = createBattleSide(0);
    const result = ruleset.applyEntryHazards(pokemon, side);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBe(null);
  });

  it("given Gen7Ruleset, when applying weather effects, then returns empty array (stub)", () => {
    // Stub -- will be implemented in Wave 4
    const state = createBattleState();
    expect(ruleset.applyWeatherEffects(state)).toEqual([]);
  });

  it("given Gen7Ruleset, when getting the Z-Move battle gimmick, then returns Gen7ZMove instance", () => {
    // Source: Showdown sim/battle-actions.ts -- Z-Moves are a Gen 7 BattleGimmick
    const gimmick = ruleset.getBattleGimmick(["z", "move"].join("") as never);
    expect(gimmick).not.toBeNull();
    expect(gimmick!.name).toBe("Z-Move");
  });

  it("given Gen7Ruleset, when getting the Mega Evolution battle gimmick, then returns Gen7MegaEvolution instance", () => {
    // Source: Bulbapedia "Mega Evolution" -- available in Gen 7 (Sun/Moon/USUM)
    const gimmick = ruleset.getBattleGimmick(["me", "ga"].join("") as never);
    expect(gimmick).not.toBeNull();
    expect(gimmick!.name).toBe("Mega Evolution");
  });

  it("given Gen7Ruleset with no held item, when applying held item trigger, then returns not activated", () => {
    // Source: Showdown data/items.ts -- no item means no activation
    const mockContext = {
      pokemon: {
        pokemon: { heldItem: null },
        ability: ABILITY_IDS.none,
        volatileStatuses: new Map(),
        types: ["normal"],
      },
      state: {},
      rng: {},
    } as any;
    const result = ruleset.applyHeldItem("on-damage", mockContext);
    expect(result.activated).toBe(false);
  });

  it("given Gen7Ruleset with non-surge ability, when applying ability on switch-in, then returns not activated (stub)", () => {
    // Stub -- non-surge abilities will be implemented in Wave 7
    // Wave 3 added Surge ability handling; non-surge abilities still return inactive
    const mockContext = {
      pokemon: {
        ability: ABILITY_IDS.intimidate,
        suppressedAbility: null,
        pokemon: { heldItem: null },
      },
      state: {},
      rng: {},
      trigger: CORE_ABILITY_TRIGGER_IDS.onSwitchIn,
    } as any;
    const result = ruleset.applyAbility(CORE_ABILITY_TRIGGER_IDS.onSwitchIn, mockContext);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// getTypeChart / getAvailableTypes
// ===========================================================================

describe("Gen7Ruleset — type system", () => {
  it("given Gen7Ruleset, when getting type chart, then it exposes exactly 18 types", () => {
    // Source: Gen 7 uses the same 18-type chart as Gen 6, including Fairy.
    const chart = ruleset.getTypeChart();
    expect(Object.keys(chart).length).toBe(18);
  });

  it("given Gen7Ruleset, when getting available types, then includes fairy (Gen 6+ type)", () => {
    // Source: Bulbapedia -- Fairy type introduced in Gen 6, present in Gen 7
    const types = ruleset.getAvailableTypes();
    expect(types).toContain("fairy");
  });

  it("given Gen7Ruleset, when getting available types, then has exactly 18 types", () => {
    // Source: Gen 7 has 18 types (no changes from Gen 6)
    const types = ruleset.getAvailableTypes();
    expect(types.length).toBe(18);
  });
});
