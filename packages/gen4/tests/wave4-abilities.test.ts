import type {
  AbilityContext,
  BattleSide,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  DataManager,
  Gender,
  MoveData,
  PokemonInstance,
  PokemonType,
  WeatherType,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { applyGen4Ability } from "../src/Gen4Abilities";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { applyGen4HeldItem } from "../src/Gen4Items";
import { canInflictGen4Status, executeGen4MoveEffect } from "../src/Gen4MoveEffects";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Wave 4 — Status/Utility Ability Tests
 *
 * Tests for: Leaf Guard, Storm Drain, Klutz, Suction Cups, Stench,
 *            Anticipation (fix), Forewarn (fix)
 *
 * Source: Showdown sim/battle.ts Gen 4 mod
 * Source: Bulbapedia — individual ability mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const A = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const I = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const M = { ...CORE_MOVE_IDS, ...GEN4_MOVE_IDS } as const;
const S = CORE_STATUS_IDS;
const T = CORE_TYPE_IDS;
const V = CORE_VOLATILE_IDS;
const W = CORE_WEATHER_IDS;
const P = GEN4_SPECIES_IDS;
const N = GEN4_NATURE_IDS;
const DEFAULT_MOVE = dataManager.getMove(M.tackle);
const DEFAULT_TYPES: PokemonType[] = [T.normal];
const GRASS_TYPES: PokemonType[] = [T.grass];
const WATER_TYPES: PokemonType[] = [T.water];
const GROUND_TYPES: PokemonType[] = [T.ground];
const ROCK_TYPES: PokemonType[] = [T.rock];
const FIRE_TYPES: PokemonType[] = [T.fire];
const TEST_UID = "test";

type TestStatus = (typeof S)[keyof typeof S] | null;
type TestMoveSlot = { moveId: string; currentPP: number; maxPP: number; ppUps: number };

function makeMoveSlot(moveId: string): TestMoveSlot {
  const move = dataManager.getMove(moveId);
  return {
    moveId,
    currentPP: move.pp,
    maxPP: move.pp,
    ppUps: 0,
  };
}

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: TestStatus;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  attack?: number;
  spAttack?: number;
  speed?: number;
  gender?: Gender;
  moves?: TestMoveSlot[];
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: TEST_UID,
    speciesId: overrides.speciesId ?? P.pikachu,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: N.hardy,
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: overrides.moves ?? [],
    ability: overrides.ability ?? A.none,
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: (overrides.gender ?? "male") as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: I.pokeBall,
    calculatedStats: {
      hp: maxHp,
      attack: overrides.attack ?? 100,
      defense: overrides.defense ?? 100,
      spAttack: overrides.spAttack ?? 100,
      spDefense: overrides.spDefense ?? 100,
      speed: overrides.speed ?? 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: TestStatus;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  attack?: number;
  spAttack?: number;
  speed?: number;
  gender?: Gender;
  moves?: TestMoveSlot[];
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      defense: overrides.defense,
      spDefense: overrides.spDefense,
      attack: overrides.attack,
      spAttack: overrides.spAttack,
      speed: overrides.speed,
      gender: overrides.gender,
      moves: overrides.moves,
    }),
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types ?? DEFAULT_TYPES,
    ability: overrides.ability ?? A.none,
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
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
  };
}

function makeSide(index: 0 | 1): BattleSide {
  return {
    index,
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
  };
}

function makeBattleState(weather?: {
  type: WeatherType;
  turnsLeft: number;
  source: string;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeMove(type: PokemonType, overrides?: Partial<MoveData>): MoveData {
  const baseMove = dataManager.getMove(overrides?.id ?? DEFAULT_MOVE.id);
  return {
    ...baseMove,
    id: overrides?.id ?? baseMove.id,
    displayName: overrides?.displayName ?? baseMove.displayName,
    type,
    category: overrides?.category ?? baseMove.category,
    power: overrides?.power ?? baseMove.power,
    accuracy: overrides?.accuracy ?? baseMove.accuracy,
    pp: overrides?.pp ?? baseMove.pp,
    maxPp: overrides?.maxPp ?? baseMove.maxPp,
    priority: overrides?.priority ?? baseMove.priority,
    target: overrides?.target ?? baseMove.target,
    generation: baseMove.generation,
    flags: { ...baseMove.flags, ...overrides?.flags },
    effectChance: overrides?.effectChance ?? baseMove.effectChance,
    secondaryEffects: overrides?.secondaryEffects ?? baseMove.secondaryEffects,
    effect: overrides?.effect ?? baseMove.effect,
    ...overrides,
  } as unknown as MoveData;
}

function makeAbilityContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  weather?: { type: WeatherType; turnsLeft: number; source: string };
  status?: TestStatus;
  currentHp?: number;
  maxHp?: number;
  rngNextValues?: number[];
  rngChance?: boolean;
  move?: MoveData;
}): AbilityContext {
  const state = makeBattleState(opts.weather);
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: "on-switch-in",
    move: opts.move,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ---------------------------------------------------------------------------
// Leaf Guard
// ---------------------------------------------------------------------------

describe("Leaf Guard — prevent all status in sun", () => {
  it("given Leaf Guard in sun, when status infliction attempted, then status blocked", () => {
    // Source: Bulbapedia — Leaf Guard: "Prevents status conditions in sunny weather"
    // Source: Showdown data/abilities.ts — Leaf Guard onSetStatus
    const target = makeActivePokemon({ ability: A.leafGuard, types: GRASS_TYPES });
    const state = makeBattleState({ type: W.sun, turnsLeft: -1, source: A.drought });

    const result = canInflictGen4Status(S.paralysis, target, state);

    expect(result).toBe(false);
  });

  it("given Leaf Guard NOT in sun, when status infliction attempted, then status applied normally", () => {
    // Source: Bulbapedia — Leaf Guard only activates in harsh sunlight
    const target = makeActivePokemon({ ability: A.leafGuard, types: GRASS_TYPES });
    const state = makeBattleState({ type: W.rain, turnsLeft: 5, source: A.drizzle });

    const result = canInflictGen4Status(S.paralysis, target, state);

    expect(result).toBe(true);
  });

  it("given no Leaf Guard in sun, when status infliction attempted, then status applied normally", () => {
    // Triangulation: confirm Leaf Guard is ability-specific, not weather-only
    const target = makeActivePokemon({ ability: A.overgrow, types: GRASS_TYPES });
    const state = makeBattleState({ type: W.sun, turnsLeft: -1, source: A.drought });

    const result = canInflictGen4Status(S.paralysis, target, state);

    expect(result).toBe(true);
  });

  it("given Leaf Guard in sun, when burn attempted, then burn also blocked", () => {
    // Source: Bulbapedia — Leaf Guard blocks ALL primary status conditions in sun
    const target = makeActivePokemon({ ability: A.leafGuard, types: GRASS_TYPES });
    const state = makeBattleState({ type: W.sun, turnsLeft: -1, source: A.drought });

    const result = canInflictGen4Status(S.burn, target, state);

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storm Drain
// ---------------------------------------------------------------------------

describe("Storm Drain — Gen 4: redirect-only in doubles, no singles immunity", () => {
  it("given Storm Drain, when hit by Water move in singles, then damage is NOT blocked (no immunity in Gen 4)", () => {
    // Source: Bulbapedia — Storm Drain (Generation IV): "Draws all single-target Water-type
    //   moves to this Pokemon. Has no effect in single battles."
    // Source: Showdown Gen 4 mod — Storm Drain is doubles-redirect only; no Water immunity
    //
    // Bug #350/#351: Previous behavior granted Water immunity + SpAtk boost (Gen 5+).
    // Gen 4 Storm Drain does nothing in singles — Water moves deal normal damage.
    const attacker = makeActivePokemon({ types: WATER_TYPES, spAttack: 100 });
    const defender = makeActivePokemon({ ability: A.stormDrain, types: GROUND_TYPES });
    const move = makeMove(T.water, { id: M.surf, power: 90, category: "special" });
    const state = makeBattleState();

    const damageResult = calculateGen4Damage(
      {
        attacker,
        defender,
        move,
        state,
        rng: { next: () => 0.5, int: () => 100, chance: () => false } as any,
        isCrit: false,
      } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // In Gen 4 singles, Storm Drain does NOT grant Water immunity — Water deals normal damage.
    // Derivation: level=50, spAtk=100, spDef=100, power=90, Water vs Ground = 2x (super effective)
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDamage = floor(floor((22*90*100)/100)/50) = floor(1980/50) = 39
    //   +2 = 41; random=100 → floor(41*1.0)=41; STAB (water/water) 1.5x → floor(61.5)=61
    //   effectiveness 2.0 → floor(61*2) = 122; no items → 122
    // Source: Bulbapedia — Storm Drain (Gen 4): "Has no effect in single battles."
    // Source: Gen 4 type chart — Water is super effective against Ground (2x)
    expect(damageResult.damage).toBe(122);
    expect(damageResult.effectiveness).toBe(2);
  });

  it("given Storm Drain, when passive-immunity is checked for Water move in singles, then ability does not activate", () => {
    // Source: Bulbapedia — Storm Drain (Gen 4): no effect in singles
    // Triangulation: passive-immunity must return not-activated for Water moves
    const ctx = makeAbilityContext({
      ability: A.stormDrain,
      types: GROUND_TYPES,
      move: makeMove(T.water, { id: M.surf }),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Storm Drain, when hit by non-Water move, then ability does not activate", () => {
    // Triangulation: Storm Drain also does nothing against non-Water moves
    const ctx = makeAbilityContext({
      ability: A.stormDrain,
      types: GROUND_TYPES,
      move: makeMove(T.fire, { id: M.flamethrower }),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Klutz
// ---------------------------------------------------------------------------

describe("Klutz — held item has no effect", () => {
  it("given Klutz holding Choice Scarf, when getEffectiveSpeed called (via damage calc item check), then Choice Band does not boost attack", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    // Source: Showdown data/abilities.ts — Klutz gates item modifiers
    // Test via damage calc: Choice Band should NOT boost attack when holder has Klutz
    const attacker = makeActivePokemon({
      ability: A.klutz,
      types: DEFAULT_TYPES,
      heldItem: I.choiceBand,
      attack: 100,
    });
    const attackerNoKlutz = makeActivePokemon({
      ability: A.intimidate,
      types: DEFAULT_TYPES,
      heldItem: I.choiceBand,
      attack: 100,
    });
    const defender = makeActivePokemon({ types: DEFAULT_TYPES, defense: 100 });
    const move = makeMove(T.normal, { id: M.tackle, power: 80, category: "physical" });
    const state = makeBattleState();
    const rng = {
      next: () => 0.5,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
    } as any;

    const resultKlutz = calculateGen4Damage(
      { attacker, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultNormal = calculateGen4Damage(
      { attacker: attackerNoKlutz, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Klutz holder should deal LESS damage (no Choice Band 1.5x boost)
    expect(resultKlutz.damage).toBeLessThan(resultNormal.damage);
  });

  it("given Klutz holding Sitrus Berry, when item trigger fires, then Sitrus Berry does NOT heal", () => {
    // Source: Bulbapedia — Klutz: "The Pokemon can't use any held items"
    const pokemon = makeActivePokemon({
      ability: A.klutz,
      heldItem: I.sitrusBerry,
      currentHp: 50,
      maxHp: 200,
    });
    const state = makeBattleState();

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng: { next: () => 0, int: () => 0, chance: () => false } as any,
    });

    expect(result.activated).toBe(false);
  });

  it("given no Klutz holding Sitrus Berry, when HP drops to 50% at end of turn, then Sitrus Berry DOES heal", () => {
    // Triangulation: without Klutz, Sitrus Berry activates normally
    const pokemon = makeActivePokemon({
      ability: A.overgrow,
      heldItem: I.sitrusBerry,
      currentHp: 50,
      maxHp: 200,
    });
    const state = makeBattleState();

    const result = applyGen4HeldItem("end-of-turn", {
      pokemon,
      state,
      rng: { next: () => 0, int: () => 0, chance: () => false } as any,
    });

    expect(result.activated).toBe(true);
    expect(result.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "heal", value: 50 })]),
    );
  });

  it("given Klutz holding Life Orb, when damage calc runs, then Life Orb 1.3x boost is NOT applied", () => {
    // Source: Showdown data/abilities.ts — Klutz gates all item damage modifiers
    const attacker = makeActivePokemon({
      ability: A.klutz,
      types: DEFAULT_TYPES,
      heldItem: I.lifeOrb,
      attack: 100,
    });
    const attackerNoKlutz = makeActivePokemon({
      ability: A.intimidate,
      types: DEFAULT_TYPES,
      heldItem: I.lifeOrb,
      attack: 100,
    });
    const defender = makeActivePokemon({ types: DEFAULT_TYPES, defense: 100 });
    const move = makeMove(T.normal, { id: M.tackle, power: 80, category: "physical" });
    const state = makeBattleState();
    const rng = {
      next: () => 0.5,
      int: (_min: number, _max: number) => 100,
      chance: () => false,
    } as any;

    const resultKlutz = calculateGen4Damage(
      { attacker, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const resultNormal = calculateGen4Damage(
      { attacker: attackerNoKlutz, defender, move, state, rng, isCrit: false } as DamageContext,
      GEN4_TYPE_CHART,
    );

    // Klutz holder should deal LESS damage (no Life Orb 1.3x boost)
    expect(resultKlutz.damage).toBeLessThan(resultNormal.damage);
  });
});

// ---------------------------------------------------------------------------
// Suction Cups
// ---------------------------------------------------------------------------

describe("Suction Cups — prevent forced switching", () => {
  it("given Suction Cups defender, when Whirlwind is used, then forced switch is prevented", () => {
    // Source: Bulbapedia — Suction Cups: "Prevents the Pokemon from being forced to switch out"
    // Source: Showdown data/abilities.ts — Suction Cups onDragOut
    const attacker = makeActivePokemon({ types: DEFAULT_TYPES });
    const defender = makeActivePokemon({ ability: A.suctionCups, types: ROCK_TYPES });
    const move = makeMove(T.normal, {
      id: M.whirlwind,
      displayName: "Whirlwind",
      power: null,
      category: "status",
      effect: null,
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    // Switch should NOT happen
    expect(result.switchOut).toBe(false);
    // Message should mention Suction Cups
    expect(result.messages.some((m) => m.includes("Suction Cups"))).toBe(true);
  });

  it("given no Suction Cups, when Whirlwind is used, then forced switch succeeds", () => {
    // Triangulation: without Suction Cups, Whirlwind forces switch
    const attacker = makeActivePokemon({ types: DEFAULT_TYPES });
    const defender = makeActivePokemon({ ability: A.sturdy, types: ROCK_TYPES });
    const move = makeMove(T.normal, {
      id: M.whirlwind,
      displayName: "Whirlwind",
      power: null,
      category: "status",
      effect: null,
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    // Switch should happen
    expect(result.switchOut).toBe(true);
  });

  it("given Suction Cups defender, when Roar is used, then forced switch is also prevented", () => {
    // Source: Showdown — Suction Cups blocks both Whirlwind and Roar
    const attacker = makeActivePokemon({ types: DEFAULT_TYPES });
    const defender = makeActivePokemon({ ability: A.suctionCups, types: ROCK_TYPES });
    const move = makeMove(T.normal, {
      id: M.roar,
      displayName: "Roar",
      power: null,
      category: "status",
      effect: null,
    });
    const state = makeBattleState();
    state.sides[0].active = [attacker as any];
    state.sides[1].active = [defender as any];

    const result = executeGen4MoveEffect({
      attacker,
      defender,
      move,
      damage: 0,
      state,
      rng: { next: () => 0.5, int: () => 50, chance: () => false } as any,
    } as MoveEffectContext);

    expect(result.switchOut).toBe(false);
    expect(result.messages.some((m) => m.includes("Suction Cups"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stench
// ---------------------------------------------------------------------------

describe("Stench — Gen 4: no battle effect (flinch is Gen 5+)", () => {
  it("given Stench and RNG < 0.1 (guaranteed flinch check), when on-after-move-hit triggers, then flinch is NOT applied (Stench has no Gen 4 battle effect)", () => {
    // Source: Bulbapedia — Stench (Generation IV): "Has no effect in battle."
    //   The 10% flinch chance was introduced in Generation V.
    // Source: Showdown — Stench onModifyMove flinch only in Gen 5+ scripts
    //
    // Bug #384: Previous code gave Stench a 10% flinch chance (Gen 5+ behavior).
    // In Gen 4, Stench only reduces wild encounter rate in the overworld.
    const ctx = makeAbilityContext({
      ability: A.stench,
      rngNextValues: [0.05], // < 0.1 threshold (would trigger Gen 5+ flinch if bug present)
    });

    const result = applyGen4Ability("on-after-move-hit", ctx);

    expect(result.activated).toBe(false);
    const flinchEffect = result.effects.find(
      (e) => e.effectType === "volatile-inflict" && "volatile" in e && e.volatile === V.flinch,
    );
    expect(flinchEffect).toBeUndefined();
  });

  it("given Stench with any RNG value, when on-after-move-hit triggers, then no flinch is applied (battle-inert in Gen 4)", () => {
    // Triangulation: Stench is always no-op in Gen 4, regardless of RNG
    const ctx = makeAbilityContext({
      ability: A.stench,
      rngNextValues: [0.5],
    });

    const result = applyGen4Ability("on-after-move-hit", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Anticipation
// ---------------------------------------------------------------------------

describe("Anticipation — scan opponent moveset for SE/OHKO moves", () => {
  it("given foe has a SE move, when Pokemon with Anticipation switches in, then shudder message appears", () => {
    // Source: Bulbapedia — Anticipation: warns if foe has SE or OHKO move
    // Source: Showdown data/abilities.ts — Anticipation onStart
    const opponent = makeActivePokemon({
      types: FIRE_TYPES,
      moves: [makeMoveSlot(M.flamethrower)],
    });

    const ctx = makeAbilityContext({
      ability: A.anticipation,
      types: GRASS_TYPES, // Fire is SE against Grass
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shudder");
  });

  it("given foe has only neutral/resisted moves, when Pokemon with Anticipation switches in, then no activation", () => {
    // Triangulation: Anticipation should NOT trigger for neutral/resisted moves
    const opponent = makeActivePokemon({
      types: DEFAULT_TYPES,
      moves: [makeMoveSlot(M.tackle)],
    });

    const ctx = makeAbilityContext({
      ability: A.anticipation,
      types: DEFAULT_TYPES, // Normal is neutral against Normal
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(false);
  });

  it("given foe has an OHKO move, when Pokemon with Anticipation switches in, then shudder message appears", () => {
    // Source: Bulbapedia — Anticipation triggers for OHKO moves regardless of type
    const opponent = makeActivePokemon({
      types: GROUND_TYPES,
      moves: [makeMoveSlot(M.fissure)],
    });

    const ctx = makeAbilityContext({
      ability: A.anticipation,
      types: [T.steel], // Ground is SE against Steel, but OHKO should trigger regardless
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("shudder");
  });
});

// ---------------------------------------------------------------------------
// Forewarn
// ---------------------------------------------------------------------------

describe("Forewarn — identify strongest move by base power", () => {
  it("given foe has moves of varying power, when Pokemon with Forewarn switches in, then strongest move is revealed", () => {
    // Source: Bulbapedia — Forewarn: reveals opponent's highest base power move
    // Source: Showdown data/abilities.ts — Forewarn onStart
    const opponent = makeActivePokemon({
      types: FIRE_TYPES,
      moves: [makeMoveSlot(M.ember), makeMoveSlot(M.fireBlast)],
    });

    const ctx = makeAbilityContext({
      ability: A.forewarn,
      types: GRASS_TYPES,
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    // Should mention the strongest move (Fire Blast, 110 BP)
    expect(result.messages[0]).toContain("Fire Blast");
  });

  it("given foe has an OHKO move, when Pokemon with Forewarn switches in, then OHKO move treated as 160 BP (revealed as strongest)", () => {
    // Source: Bulbapedia — Forewarn counts OHKO moves as BP 160
    const opponent = makeActivePokemon({
      types: GROUND_TYPES,
      moves: [makeMoveSlot(M.earthquake), makeMoveSlot(M.fissure)],
    });

    const ctx = makeAbilityContext({
      ability: A.forewarn,
      types: [T.steel],
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(true);
    // Should mention Fissure (treated as 160 BP, > Earthquake's 100 BP)
    expect(result.messages[0]).toContain("Fissure");
  });

  it("given foe has no moves with power, when Pokemon with Forewarn switches in, then no activation", () => {
    // Edge case: foe with only status moves (no base power)
    const opponent = makeActivePokemon({
      types: [T.psychic],
      moves: [makeMoveSlot(M.thunderWave)],
    });

    const ctx = makeAbilityContext({
      ability: A.forewarn,
      types: DEFAULT_TYPES,
      opponent,
    });

    const result = applyGen4Ability("on-switch-in", ctx, dataManager);

    expect(result.activated).toBe(false);
  });
});
