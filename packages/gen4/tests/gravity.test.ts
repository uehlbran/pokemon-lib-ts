import type {
  AccuracyContext,
  ActivePokemon,
  BattleState,
  DamageContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";

/**
 * Gen 4 Gravity Tests
 *
 * Tests for the Gravity field effect: accuracy boost (5/3), type immunity
 * suppression (Levitate, Flying-type ground immunity), end-of-turn countdown,
 * and gravity move handler.
 *
 * Source: Showdown Gen 4 mod — Gravity mechanics
 * Source: Bulbapedia — https://bulbapedia.bulbagarden.net/wiki/Gravity_(move)
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

/**
 * Create a mock RNG that returns the provided value for int() calls,
 * allowing us to control the accuracy roll outcome.
 */
function createAccuracyRng(rollValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => rollValue,
    chance: () => false,
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
  moves?: Array<{ moveId: string; pp: number; maxPp: number }>;
  statStages?: Partial<Record<string, number>>;
  speciesId?: number;
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
    speciesId: opts.speciesId ?? 1,
    nickname: opts.nickname ?? null,
    level: opts.level ?? 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? maxHp,
    moves: opts.moves ?? [],
    ability: opts.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      hp: 0,
      attack: opts.statStages?.attack ?? 0,
      defense: opts.statStages?.defense ?? 0,
      spAttack: opts.statStages?.spAttack ?? 0,
      spDefense: opts.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: opts.statStages?.accuracy ?? 0,
      evasion: opts.statStages?.evasion ?? 0,
    },
    volatileStatuses: new Map(),
    types: opts.types,
    ability: opts.ability ?? "",
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
  } as ActivePokemon;
}

function createMove(id: string, overrides?: Partial<MoveData>): MoveData {
  return {
    id,
    name: id,
    type: "normal",
    category: "physical",
    power: 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "adjacent-foe",
    flags: {
      contact: false,
      protect: false,
      mirror: false,
      snatch: false,
      gravity: false,
      defrost: false,
      recharge: false,
      charge: false,
      sound: false,
      wind: false,
      powder: false,
      bullet: false,
      pulse: false,
      bite: false,
      punch: false,
      slicing: false,
    },
    effect: null,
    critRatio: 0,
    generation: 4,
    isContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
    description: "",
    ...overrides,
  } as MoveData;
}

function createMinimalBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  opts?: {
    weatherType?: string | null;
    gravityActive?: boolean;
  },
): BattleState {
  const gravityActive = opts?.gravityActive ?? false;
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
    ],
    weather: { type: opts?.weatherType ?? null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: gravityActive, turnsLeft: gravityActive ? 5 : 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const ruleset = new Gen4Ruleset(dataManager);

// ─── Gravity Move Effect ──────────────────────────────────────────────────

describe("Gen 4 Gravity Move Effect", () => {
  it("given Gravity used, when executeMoveEffect called, then returns gravitySet=true", () => {
    // Source: Showdown Gen 4 — Gravity sets gravitySet in the move effect result
    // Source: Bulbapedia — Gravity: "Gravity is intensified for five turns."
    const attacker = createActivePokemon({ types: ["psychic"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("gravity", {
      type: "psychic",
      category: "status",
      power: null,
      accuracy: null,
    });
    const rng = createMockRng(0);
    const state = createMinimalBattleState(attacker, defender);
    const context = { attacker, defender, move, damage: 0, state, rng } as MoveEffectContext;

    const result = ruleset.executeMoveEffect(context);

    expect(result.gravitySet).toBe(true);
    expect(result.messages).toContain("Gravity intensified!");
  });
});

// ─── Gravity Accuracy Boost ───────────────────────────────────────────────

describe("Gen 4 Gravity — Accuracy Boost", () => {
  it("given gravity active, when calculating accuracy for move with 80 accuracy, then accuracy is multiplied by 5/3", () => {
    // Source: Showdown Gen 4 mod — Gravity multiplies accuracy by 5/3
    // Source: Bulbapedia — Gravity: "The accuracy of all moves is boosted to 5/3 of their
    //   original accuracy during the effect."
    //
    // With gravity: 80 * 5/3 = floor(400/3) = 133. Roll of 133 should still hit.
    // Without gravity: 80 accuracy, roll of 81 would miss.
    //
    // Derivation: at accuracy stage 0, calc = floor(1 * 80 / 1) = 80.
    // With gravity: calc = floor(80 * 5 / 3) = floor(133.33) = 133.
    // A roll of 133 hits (133 <= 133), but 134 misses.
    const attacker = createActivePokemon({ types: ["normal"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("thunder", {
      type: "electric",
      category: "special",
      power: 120,
      accuracy: 80,
    });

    // Test: with gravity, roll of 133 should hit
    const rngHit = createAccuracyRng(133);
    const stateWithGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: true,
    });
    const contextHit: AccuracyContext = {
      attacker,
      defender,
      move,
      state: stateWithGravity,
      rng: rngHit,
    };
    expect(ruleset.doesMoveHit(contextHit)).toBe(true);

    // Test: without gravity, roll of 81 should miss (80 accuracy, roll > 80)
    const rngMiss = createAccuracyRng(81);
    const stateNoGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: false,
    });
    const contextMiss: AccuracyContext = {
      attacker,
      defender,
      move,
      state: stateNoGravity,
      rng: rngMiss,
    };
    expect(ruleset.doesMoveHit(contextMiss)).toBe(false);
  });

  it("given gravity active, when using Blizzard (70 acc), then accuracy is boosted to floor(70*5/3)=116", () => {
    // Source: Showdown Gen 4 — Gravity accuracy calculation
    // Derivation: base acc = 70, stage 0 calc = 70.
    // With gravity: floor(70 * 5 / 3) = floor(116.67) = 116.
    // Roll of 116 hits, 117 misses.
    const attacker = createActivePokemon({ types: ["ice"] });
    const defender = createActivePokemon({ types: ["normal"] });
    const move = createMove("blizzard", {
      type: "ice",
      category: "special",
      power: 120,
      accuracy: 70,
    });

    const rngHit = createAccuracyRng(116);
    const stateGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: true,
    });
    const contextHit: AccuracyContext = {
      attacker,
      defender,
      move,
      state: stateGravity,
      rng: rngHit,
    };
    expect(ruleset.doesMoveHit(contextHit)).toBe(true);

    const rngMiss = createAccuracyRng(117);
    const contextMiss: AccuracyContext = {
      attacker,
      defender,
      move,
      state: stateGravity,
      rng: rngMiss,
    };
    expect(ruleset.doesMoveHit(contextMiss)).toBe(false);
  });
});

// ─── Gravity Type Immunity Suppression ────────────────────────────────────

describe("Gen 4 Gravity — Type Immunity Suppression", () => {
  it("given gravity active, when Ground move targets Levitate Pokemon, then type immunity not applied", () => {
    // Source: Showdown Gen 4 mod — Gravity suppresses Levitate
    // Source: Bulbapedia — Gravity: "Levitate will not give immunity to Ground-type moves."
    const attacker = createActivePokemon({ types: ["ground"], level: 50 });
    const defender = createActivePokemon({ types: ["psychic"], ability: "levitate" });
    const move = createMove("earthquake", {
      type: "ground",
      power: 100,
    });

    const stateGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: true,
    });
    const rng = createMockRng(100); // max random roll for consistent output
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: stateGravity,
      rng,
      isCrit: false,
    };

    const result = ruleset.calculateDamage(context);

    // With gravity active, Levitate no longer blocks Ground moves — damage > 0
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).not.toBe(0);
  });

  it("given gravity NOT active, when Ground move targets Levitate Pokemon, then type immunity IS applied", () => {
    // Source: Showdown Gen 4 — Levitate grants Ground immunity normally
    const attacker = createActivePokemon({ types: ["ground"], level: 50 });
    const defender = createActivePokemon({ types: ["psychic"], ability: "levitate" });
    const move = createMove("earthquake", {
      type: "ground",
      power: 100,
    });

    const stateNoGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: false,
    });
    const rng = createMockRng(100);
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: stateNoGravity,
      rng,
      isCrit: false,
    };

    const result = ruleset.calculateDamage(context);

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given gravity active, when Ground move targets Flying-type Pokemon, then type immunity not applied", () => {
    // Source: Showdown Gen 4 mod — Gravity grounds Flying-type Pokemon
    // Source: Bulbapedia — Gravity: "All Pokemon are affected by Ground-type moves,
    //   regardless of their Flying-type status."
    const attacker = createActivePokemon({ types: ["ground"], level: 50 });
    const defender = createActivePokemon({ types: ["flying"] });
    const move = createMove("earthquake", {
      type: "ground",
      power: 100,
    });

    const stateGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: true,
    });
    const rng = createMockRng(100);
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: stateGravity,
      rng,
      isCrit: false,
    };

    const result = ruleset.calculateDamage(context);

    // With gravity, pure Flying-type is treated as Normal for Ground effectiveness
    // Ground vs Normal = 1.0x (neutral). Damage should be > 0.
    expect(result.damage).toBeGreaterThan(0);
    expect(result.effectiveness).not.toBe(0);
  });

  it("given gravity NOT active, when Ground move targets Flying-type Pokemon, then type immunity IS applied", () => {
    // Source: Showdown Gen 4 — Ground moves cannot hit Flying-type Pokemon normally
    const attacker = createActivePokemon({ types: ["ground"], level: 50 });
    const defender = createActivePokemon({ types: ["flying"] });
    const move = createMove("earthquake", {
      type: "ground",
      power: 100,
    });

    const stateNoGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: false,
    });
    const rng = createMockRng(100);
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: stateNoGravity,
      rng,
      isCrit: false,
    };

    const result = ruleset.calculateDamage(context);

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it("given gravity active, when non-Ground move targets Flying-type Pokemon, then effectiveness is normal", () => {
    // Source: Showdown Gen 4 — Gravity only affects Ground-type move immunity, not other types
    // A Fire move should still use normal Flying effectiveness (0.5x resist)
    const attacker = createActivePokemon({ types: ["fire"], level: 50 });
    const defender = createActivePokemon({ types: ["flying"] });
    const move = createMove("flamethrower", {
      type: "fire",
      category: "special",
      power: 95,
    });

    const stateGravity = createMinimalBattleState(attacker, defender, {
      gravityActive: true,
    });
    const rng = createMockRng(100);
    const context: DamageContext = {
      attacker,
      defender,
      move,
      state: stateGravity,
      rng,
      isCrit: false,
    };

    const result = ruleset.calculateDamage(context);

    // Fire vs Flying = 1x (neutral, not affected by gravity)
    // Result should be normal damage, not 0
    expect(result.damage).toBeGreaterThan(0);
  });
});

// ─── Gravity End-of-Turn Order ────────────────────────────────────────────

describe("Gen 4 Gravity — End-of-Turn Order", () => {
  it("given Gen4 ruleset, when getEndOfTurnOrder called, then gravity-countdown is present", () => {
    // Source: Showdown Gen 4 mod — gravity countdown is part of end-of-turn processing
    const order = ruleset.getEndOfTurnOrder();
    expect(order).toContain("gravity-countdown");
  });

  it("given Gen4 ruleset, when getEndOfTurnOrder called, then gravity-countdown is after trick-room-countdown", () => {
    // Source: Showdown Gen 4 mod — countdown order: trick room, then gravity, then weather
    const order = ruleset.getEndOfTurnOrder();
    const trickRoomIndex = order.indexOf("trick-room-countdown");
    const gravityIndex = order.indexOf("gravity-countdown");
    expect(gravityIndex).toBeGreaterThan(trickRoomIndex);
  });

  it("given Gen4 ruleset, when getEndOfTurnOrder called, then gravity-countdown is before weather-countdown", () => {
    // Source: Showdown Gen 4 mod — gravity countdown runs before weather countdown
    const order = ruleset.getEndOfTurnOrder();
    const gravityIndex = order.indexOf("gravity-countdown");
    const weatherIndex = order.indexOf("weather-countdown");
    expect(gravityIndex).toBeLessThan(weatherIndex);
  });
});

// ─── Gravity + Arena Trap ─────────────────────────────────────────────────

describe("Gen 4 Gravity — Arena Trap Grounding", () => {
  it("given gravity active and opponent has Arena Trap, when Flying-type tries to switch, then cannot switch", () => {
    // Source: Showdown Gen 4 — Gravity grounds Flying Pokemon, Arena Trap traps them
    // Source: Bulbapedia — "Under Gravity, Arena Trap affects all adjacent Pokemon."
    const pokemon = createActivePokemon({ types: ["normal", "flying"] });
    const opponent = createActivePokemon({ types: ["ground"], ability: "arena-trap" });
    const state = createMinimalBattleState(pokemon, opponent, { gravityActive: true });

    expect(ruleset.canSwitch(pokemon, state)).toBe(false);
  });

  it("given gravity NOT active and opponent has Arena Trap, when Flying-type tries to switch, then CAN switch", () => {
    // Source: Showdown Gen 4 — Flying types are not grounded without gravity
    const pokemon = createActivePokemon({ types: ["normal", "flying"] });
    const opponent = createActivePokemon({ types: ["ground"], ability: "arena-trap" });
    const state = createMinimalBattleState(pokemon, opponent, { gravityActive: false });

    expect(ruleset.canSwitch(pokemon, state)).toBe(true);
  });

  it("given gravity active and opponent has Arena Trap, when Levitate Pokemon tries to switch, then cannot switch", () => {
    // Source: Showdown Gen 4 — Gravity grounds Levitate Pokemon, Arena Trap traps them
    const pokemon = createActivePokemon({ types: ["psychic"], ability: "levitate" });
    const opponent = createActivePokemon({ types: ["ground"], ability: "arena-trap" });
    const state = createMinimalBattleState(pokemon, opponent, { gravityActive: true });

    expect(ruleset.canSwitch(pokemon, state)).toBe(false);
  });
});
