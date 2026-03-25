import type {
  ActivePokemon,
  BattleState,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  type CORE_MOVE_CATEGORIES,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen3HeldItem,
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";

/**
 * Tests for Gen 3 move effect and item bug fixes.
 *
 * Covers:
 *   #338 — Whirlwind/Roar forcedSwitch flag
 *   #343 — Pursuit, Brick Break, Focus Punch, Secret Power, Torment, Ingrain handlers
 *   #348 — BrightPowder, Lax Incense, White Herb, Macho Brace, King's Rock items
 *
 * Sources: pret/pokeemerald src/battle_script_commands.c, src/battle_util.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const A = { ...CORE_ABILITY_IDS, ...GEN3_ABILITY_IDS } as const;
const I = GEN3_ITEM_IDS;
const M = GEN3_MOVE_IDS;
const P = GEN3_SPECIES_IDS;
const SCREENS = CORE_SCREEN_IDS;
const S = CORE_STATUS_IDS;
const T = CORE_TYPE_IDS;
const V = CORE_VOLATILE_IDS;

function createMockRng(intReturnValue: number, chanceResult = false) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => chanceResult,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  level?: number;
  ability?: string;
  statStages?: Partial<Record<string, number>>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  lastMoveUsed?: string | null;
  lastDamageTaken?: number;
  lastDamageCategory?: string | null;
  moves?: Array<{ moveId: string; pp: number; maxPp: number }>;
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

  const pokemon = {
    uid: "test-mon",
    speciesId: P.bulbasaur,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: NEUTRAL_NATURES[0],
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: opts.moves?.map((move) => ({
      moveId: move.moveId,
      currentPP: move.pp,
      maxPP: move.maxPp,
      ppUps: 0,
    })) ?? [{ moveId: M.tackle, currentPP: DEFAULT_MOVE.pp, maxPP: DEFAULT_MOVE.pp, ppUps: 0 }],
    ability: opts.ability ?? A.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: (opts.statStages?.attack as number) ?? 0,
      defense: (opts.statStages?.defense as number) ?? 0,
      spAttack: (opts.statStages?.spAttack as number) ?? 0,
      spDefense: (opts.statStages?.spDefense as number) ?? 0,
      speed: (opts.statStages?.speed as number) ?? 0,
      accuracy: (opts.statStages?.accuracy as number) ?? 0,
      evasion: (opts.statStages?.evasion as number) ?? 0,
    },
    volatileStatuses: opts.volatiles ?? new Map(),
    types: opts.types,
    ability: opts.ability ?? A.none,
    suppressedAbility: null,
    lastMoveUsed: opts.lastMoveUsed ?? null,
    lastDamageTaken: opts.lastDamageTaken ?? 0,
    lastDamageType: null,
    lastDamageCategory:
      (opts.lastDamageCategory as
        | (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES]
        | null) ?? null,
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
  } as ActivePokemon;
}

function createSyntheticMove(id: string, overrides?: Partial<MoveData>): MoveData {
  const baseMove: MoveData = (() => {
    try {
      return dataManager.getMove(id);
    } catch {
      return { ...DEFAULT_MOVE, id, displayName: id };
    }
  })();
  return {
    ...baseMove,
    flags: {
      ...baseMove.flags,
      ...(overrides?.flags ?? {}),
    },
    ...overrides,
  } as MoveData;
}

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  opts?: { defenderScreens?: Array<{ type: string; turnsLeft: number }> },
): BattleState {
  return {
    sides: [
      {
        index: 0,
        active: [attacker],
        team: [attacker.pokemon],
        screens: [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        index: 1,
        active: [defender],
        team: [defender.pokemon],
        screens: opts?.defenderScreens ?? [],
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        luckyChant: { active: false, turnsLeft: 0 },
        wish: null,
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
  opts?: { defenderScreens?: Array<{ type: string; turnsLeft: number }> },
): MoveEffectContext {
  const state = createMinimalBattleState(attacker, defender, opts);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);
const DEFAULT_MOVE = dataManager.getMove(M.tackle);

// ===========================================================================
// #338 — Whirlwind/Roar forcedSwitch flag
// ===========================================================================

describe("#338 — Whirlwind/Roar forcedSwitch flag", () => {
  it("given Whirlwind used, when executeMoveEffect called, then sets both switchOut=true and forcedSwitch=true", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Whirlwind/Roar set FORCED_SWITCH
    // Source: BattleEngine checks result.switchOut && result.forcedSwitch for phazing
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal], nickname: "Defender" });
    const move = dataManager.getMove(M.whirlwind);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
    expect(result.forcedSwitch).toBe(true);
  });

  it("given Roar used, when executeMoveEffect called, then sets both switchOut=true and forcedSwitch=true", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Roar uses same effect as Whirlwind
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.roar);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
    expect(result.forcedSwitch).toBe(true);
  });

  it("given defender has Suction Cups, when Whirlwind used, then phazing fails and message shown", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SUCTION_CUPS blocks phazing
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal], ability: A.suctionCups });
    const move = dataManager.getMove(M.whirlwind);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(false);
    expect(result.forcedSwitch).toBeUndefined();
    expect(result.messages).not.toEqual([]);
  });

  it("given defender has Ingrain, when Roar used, then phazing fails and message shown", () => {
    // Source: pret/pokeemerald src/battle_util.c — STATUS3_ROOTED blocks phazing
    const volatiles = new Map([[V.ingrain, { turnsLeft: -1 }]]);
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({
      types: [T.grass],
      volatiles: volatiles as any,
    });
    const move = dataManager.getMove(M.roar);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(false);
    expect(result.forcedSwitch).toBeUndefined();
    expect(result.messages.some((m) => m.includes("roots"))).toBe(true);
  });
});

// ===========================================================================
// #343 — Missing move handlers
// ===========================================================================

describe("#343 — Pursuit", () => {
  it("given Pursuit used, when executeMoveEffect called, then does not intercept (engine handles switch-doubling)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_PURSUIT handled at action level
    // Pursuit's switch-double is an engine-level mechanic; the move handler just needs to exist
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.pursuit);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    // Pursuit should not be intercepted — falls through to data-driven effects
    // No custom damage or forced switch — engine applies normal damage
    expect(result.switchOut).toBe(false);
  });

  it("given Pursuit used against non-switching target, when executeMoveEffect called, then no special effect triggered", () => {
    // Source: Showdown data/mods/gen3/moves.ts — Pursuit only doubles on switch
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.pursuit);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 40, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.selfFaint).toBeUndefined();
  });
});

describe("#343 — Brick Break", () => {
  it("given Brick Break used against side with Reflect, when executeMoveEffect called, then screensCleared='defender' and message shown", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_BRICK_BREAK
    // Source: Bulbapedia — "Brick Break removes Reflect and Light Screen from the target's side"
    const attacker = createActivePokemon({ types: [T.fighting] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.brickBreak);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 75, rng, {
      defenderScreens: [{ type: SCREENS.reflect, turnsLeft: 3 }],
    });

    const result = ruleset.executeMoveEffect(context);

    expect(result.screensCleared).toBe("defender");
    expect(result.messages.some((m) => m.includes("shattered"))).toBe(true);
  });

  it("given Brick Break used against side with no screens, when executeMoveEffect called, then screensCleared='defender' but no shatter message", () => {
    // Source: pret/pokeemerald — Brick Break always sets the screen-clear flag
    // but the "shattered" message only shows if screens were present
    const attacker = createActivePokemon({ types: [T.fighting] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.brickBreak);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 75, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.screensCleared).toBe("defender");
    // No "shattered" message when no screens present
    expect(result.messages.some((m) => m.includes("shattered"))).toBe(false);
  });
});

describe("#343 — Focus Punch", () => {
  it("given Focus Punch user took no damage this turn, when executeMoveEffect called, then move succeeds (not intercepted)", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — Focus Punch succeeds if not hit
    // Source: Bulbapedia — "Focus Punch fails if the user is hit before it attacks"
    const attacker = createActivePokemon({ types: [T.fighting], lastDamageTaken: 0 });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.focusPunch);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 150, rng);

    const result = ruleset.executeMoveEffect(context);

    // Should not be intercepted — falls through to engine for damage
    expect(result.messages).toEqual([]);
  });

  it("given Focus Punch user took damage this turn, when executeMoveEffect called, then move fails with message", () => {
    // Source: pret/pokeemerald — Focus Punch fails if lastDamageTaken > 0
    const attacker = createActivePokemon({ types: [T.fighting], lastDamageTaken: 50 });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.focusPunch);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.messages.some((m) => m.includes("lost its focus"))).toBe(true);
  });
});

describe("#343 — Secret Power", () => {
  it("given Secret Power used and RNG triggers 30% chance, when executeMoveEffect called, then paralyzes the defender", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_SECRET_POWER
    // Source: Bulbapedia — "30% chance of paralysis (default terrain)"
    // Default terrain = paralysis
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.secretPower);
    // RNG: int returns value that triggers the 30% chance (< 30)
    const rng = createMockRng(10);
    const context = createContext(attacker, defender, move, 70, rng);

    const result = ruleset.executeMoveEffect(context);

    // Secret Power's data-driven effect is status-chance (paralysis, 30%)
    // The interceptor ALSO checks for paralysis, but since data-driven also applies,
    // we just verify paralysis is inflicted
    expect(result.statusInflicted).toBe(S.paralysis);
  });

  it("given Secret Power used and RNG does not trigger, when executeMoveEffect called, then no status inflicted", () => {
    // Source: pret/pokeemerald — 30% chance roll fails
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.secretPower);
    // RNG: int returns 90 which is >= 30, so the 30% chance fails
    const rng = createMockRng(90);
    const context = createContext(attacker, defender, move, 70, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.statusInflicted).toBeNull();
  });
});

describe("#343 — Torment", () => {
  it("given Torment used on target without Torment, when executeMoveEffect called, then torment volatile is inflicted", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_TORMENT
    // Source: Bulbapedia — "Torment prevents the target from selecting the same move twice in a row"
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.torment);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(M.torment);
    expect(result.messages).toContain("The foe was subjected to torment!");
  });

  it("given Torment used on target that already has Torment, when executeMoveEffect called, then move fails", () => {
    // Source: pret/pokeemerald — Torment fails if target already has it
    const volatiles = new Map([[M.torment, { turnsLeft: -1 }]]);
    const attacker = createActivePokemon({ types: [T.dark] });
    const defender = createActivePokemon({
      types: [T.normal],
      volatiles: volatiles as any,
    });
    const move = dataManager.getMove(M.torment);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBeNull();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });
});

describe("#343 — Ingrain", () => {
  it("given Ingrain used, when executeMoveEffect called, then ingrain volatile is set on attacker", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c — EFFECT_INGRAIN
    // Source: Bulbapedia — "Ingrain causes the user to restore 1/16 of its maximum HP
    //   at the end of each turn. The user cannot be switched out."
    const attacker = createActivePokemon({ types: [T.grass] });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.ingrain);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(V.ingrain);
    expect(result.messages.some((m) => m.includes("planted its roots"))).toBe(true);
  });

  it("given Ingrain used when already ingrained, when executeMoveEffect called, then move fails", () => {
    // Source: pret/pokeemerald — Ingrain fails if already active
    const volatiles = new Map([[V.ingrain, { turnsLeft: -1 }]]);
    const attacker = createActivePokemon({
      types: [T.grass],
      volatiles: volatiles as any,
    });
    const defender = createActivePokemon({ types: [T.normal] });
    const move = dataManager.getMove(M.ingrain);
    const rng = createMockRng(0);
    const context = createContext(attacker, defender, move, 0, rng);

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBeUndefined();
    expect(result.messages.some((m) => m.includes("failed"))).toBe(true);
  });

  it("given Ingrain is in Gen3Ruleset end-of-turn order, then the rooted residual step appears in the order list", () => {
    // Source: pret/pokeemerald src/battle_main.c — ingrain is in end-of-turn residual order
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain(V.ingrain);
  });
});

// ===========================================================================
// #348 — Missing item implementations
// ===========================================================================

describe("#348 — BrightPowder accuracy reduction", () => {
  it("given defender holds BrightPowder and a 100 accuracy move is used, when doesMoveHit checks accuracy, then effective accuracy is reduced by 10%", () => {
    // Source: pret/pokeemerald src/battle_script_commands.c:1160-1165
    // BrightPowder reduces accuracy by 10% (calc * 90 / 100)
    // With 100 accuracy: floor(100 * 90 / 100) = 90
    // So the move needs roll <= 90 to hit (instead of <= 100)
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal], heldItem: I.brightPowder });
    const move = dataManager.getMove(M.tackle);
    const state = createMinimalBattleState(attacker, defender);
    // RNG returns 95 which is > 90 (should miss with BrightPowder) but <= 100 (would hit without)
    const rng = createMockRng(95);

    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    // With BrightPowder: calc = floor(100 * 90/100) = 90. Roll 95 > 90 = miss
    expect(result).toBe(false);
  });

  it("given defender holds BrightPowder and a 100 accuracy move is used, when RNG roll is low enough, then move still hits", () => {
    // Source: pret/pokeemerald — BrightPowder reduces but doesn't prevent hits
    // With 100 accuracy + BrightPowder: calc = 90. Roll 50 <= 90 = hit
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal], heldItem: I.brightPowder });
    const move = dataManager.getMove(M.tackle);
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(50);

    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    expect(result).toBe(true);
  });
});

describe("#348 — Lax Incense accuracy reduction", () => {
  it("given defender holds Lax Incense and a 100 accuracy move is used, when RNG roll is 95, then move misses", () => {
    // Source: pret/pokeemerald — Lax Incense has same effect as BrightPowder (10% reduction)
    // Source: Showdown data/mods/gen3/items.ts — Lax Incense: 0.9x accuracy
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal], heldItem: I.laxIncense });
    const move = dataManager.getMove(M.tackle);
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(95);

    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    // calc = floor(100 * 90/100) = 90. Roll 95 > 90 = miss
    expect(result).toBe(false);
  });

  it("given defender holds Lax Incense and a 100 accuracy move is used, when RNG roll is 50, then move hits", () => {
    // Source: pret/pokeemerald — same as BrightPowder
    const attacker = createActivePokemon({ types: [T.normal] });
    const defender = createActivePokemon({ types: [T.normal], heldItem: I.laxIncense });
    const move = dataManager.getMove(M.tackle);
    const state = createMinimalBattleState(attacker, defender);
    const rng = createMockRng(50);

    const result = ruleset.doesMoveHit({
      attacker,
      defender,
      move,
      state,
      rng,
    });

    expect(result).toBe(true);
  });
});

describe("#348 — White Herb", () => {
  it("given Pokemon with lowered Attack holding White Herb, when stat-boost-between-turns triggers, then Attack restored to 0 and item consumed", () => {
    // Source: pret/pokeemerald src/battle_util.c HOLD_EFFECT_RESTORE_STATS
    // Source: Bulbapedia — "White Herb restores any lowered stat stages to 0 when held"
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.whiteHerb,
      statStages: { attack: -2 },
    });
    const context: ItemContext = {
      pokemon,
      state: {} as BattleState,
      rng: createMockRng(0) as ItemContext["rng"],
    };

    const result = applyGen3HeldItem("stat-boost-between-turns", context);

    expect(result.activated).toBe(true);
    expect(pokemon.statStages.attack).toBe(0);
    expect(result.effects.some((e) => e.type === "consume")).toBe(true);
    expect(result.messages.some((m) => m.includes("White Herb"))).toBe(true);
  });

  it("given Pokemon with multiple lowered stats holding White Herb, when stat-boost-between-turns triggers, then all lowered stats restored to 0", () => {
    // Source: pret/pokeemerald — White Herb restores ALL lowered stats, not just one
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.whiteHerb,
      statStages: { attack: -1, defense: -3, speed: -2 },
    });
    const context: ItemContext = {
      pokemon,
      state: {} as BattleState,
      rng: createMockRng(0) as ItemContext["rng"],
    };

    const result = applyGen3HeldItem("stat-boost-between-turns", context);

    expect(result.activated).toBe(true);
    expect(pokemon.statStages.attack).toBe(0);
    expect(pokemon.statStages.defense).toBe(0);
    expect(pokemon.statStages.speed).toBe(0);
  });

  it("given Pokemon with no lowered stats holding White Herb, when stat-boost-between-turns triggers, then no activation", () => {
    // Source: pret/pokeemerald — White Herb only activates when stats are lowered
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.whiteHerb,
      statStages: { attack: 2, defense: 0 },
    });
    const context: ItemContext = {
      pokemon,
      state: {} as BattleState,
      rng: createMockRng(0) as ItemContext["rng"],
    };

    const result = applyGen3HeldItem("stat-boost-between-turns", context);

    expect(result.activated).toBe(false);
  });
});

describe("#348 — Macho Brace speed halving", () => {
  it("given Pokemon holding Macho Brace with 100 base speed, when getEffectiveSpeed calculated in turn order, then speed is halved to 50", () => {
    // Source: pret/pokeemerald src/battle_util.c — HOLD_EFFECT_MACHO_BRACE halves speed
    // Source: Bulbapedia — "Macho Brace halves the holder's Speed stat"
    //
    // A Pokemon with 100 speed holding Macho Brace should have effective speed = 50
    // We test via sortActionsByPriority which calls getEffectiveSpeed internally
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.machoBrace,
    });
    // Access the protected method via the ruleset's public API
    // We test the result indirectly: Macho Brace holder should be slower
    const pokemonNoItem = createActivePokemon({ types: [T.normal] });

    // Create battle state with both as active on opposite sides
    const state = createMinimalBattleState(pokemon, pokemonNoItem);
    const rng = createMockRng(0);
    const actions = [
      { type: "move" as const, side: 0 as const, slot: 0, moveIndex: 0, moveId: M.tackle },
      { type: "move" as const, side: 1 as const, slot: 0, moveIndex: 0, moveId: M.tackle },
    ];

    const sorted = ruleset.resolveTurnOrder(actions, state, rng as any);

    // Side 1 (no item, speed 100) should go before Side 0 (Macho Brace, speed 50)
    expect(sorted[0].side).toBe(1);
    expect(sorted[1].side).toBe(0);
  });

  it("given Pokemon holding Macho Brace with paralysis, when speed calculated, then both halving and paralysis 0.25x apply", () => {
    // Source: pret/pokeemerald — Macho Brace halves speed, then paralysis quarters it
    // Speed = floor(floor(100 / 2) * 0.25) = floor(50 * 0.25) = 12
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.machoBrace,
      status: S.paralysis,
    });
    // Create a much slower opponent (speed 15) to verify exact ordering
    const slowPokemon = createActivePokemon({ types: [T.normal] });
    // Override speed to 15
    slowPokemon.pokemon.calculatedStats = {
      ...slowPokemon.pokemon.calculatedStats!,
      speed: 15,
    };

    const state = createMinimalBattleState(pokemon, slowPokemon);
    const rng = createMockRng(0);
    const actions = [
      { type: "move" as const, side: 0 as const, slot: 0, moveIndex: 0, moveId: M.tackle },
      { type: "move" as const, side: 1 as const, slot: 0, moveIndex: 0, moveId: M.tackle },
    ];

    const sorted = ruleset.resolveTurnOrder(actions, state, rng as any);

    // Side 0: Macho Brace + paralysis = floor(floor(100/2) * 0.25) = floor(12.5) = 12
    // Side 1: no item, no paralysis, speed 15
    // Side 1 (speed 15) should go before Side 0 (speed 12)
    expect(sorted[0].side).toBe(1);
    expect(sorted[1].side).toBe(0);
  });
});

describe("#348 — King's Rock flinch restriction", () => {
  it("given Pokemon holding King's Rock uses a move without inherent flinch and RNG succeeds, when on-hit triggers, then flinch is applied", () => {
    // Source: pret/pokeemerald src/battle_util.c HOLD_EFFECT_FLINCH — 10% chance
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.kingsRock,
      nickname: "Attacker",
    });
    const move = dataManager.getMove(M.tackle);
    const context: ItemContext = {
      pokemon,
      state: {} as BattleState,
      rng: createMockRng(0, true) as ItemContext["rng"],
      move,
      damage: 50,
    };

    const result = applyGen3HeldItem(CORE_ITEM_TRIGGER_IDS.onHit, context);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.messages).toContain("Attacker's King's Rock caused flinching!");
  });

  it("given Pokemon holding King's Rock uses Bite (has 30% flinch), when on-hit triggers, then King's Rock does NOT add extra flinch", () => {
    // Source: pret/pokeemerald — King's Rock only applies to moves without inherent flinch
    // Source: Bulbapedia — "King's Rock will not activate on moves that already have a flinch chance"
    const pokemon = createActivePokemon({
      types: [T.dark],
      heldItem: I.kingsRock,
    });
    // Bite has a volatile-status flinch effect with 30% chance
    const move = dataManager.getMove(M.bite);
    const context: ItemContext = {
      pokemon,
      state: {} as BattleState,
      rng: createMockRng(0, true) as ItemContext["rng"],
      move,
      damage: 50,
    };

    const result = applyGen3HeldItem(CORE_ITEM_TRIGGER_IDS.onHit, context);

    expect(result.activated).toBe(false);
  });

  it("given Pokemon holding King's Rock uses a multi-effect move containing flinch, when on-hit triggers, then King's Rock does NOT activate", () => {
    // Source: pret/pokeemerald — flinch check is recursive through multi effects
    const pokemon = createActivePokemon({
      types: [T.normal],
      heldItem: I.kingsRock,
    });
    // A multi-effect move where one sub-effect is flinch
    const move = createSyntheticMove("headbutt-like", {
      effect: {
        type: "multi",
        effects: [{ type: "damage" }, { type: "volatile-status", status: V.flinch, chance: 30 }],
      } as any,
    });
    const context: ItemContext = {
      pokemon,
      state: {} as BattleState,
      rng: createMockRng(0, true) as ItemContext["rng"],
      move,
      damage: 50,
    };

    const result = applyGen3HeldItem(CORE_ITEM_TRIGGER_IDS.onHit, context);

    expect(result.activated).toBe(false);
  });
});
