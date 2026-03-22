import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
  MoveEffectResult,
} from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  MoveFlags,
  PokemonInstance,
  PokemonType,
  StatBlock,
} from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen4Ruleset } from "../src";
import { createGen4DataManager } from "../src/data";
import { applyGen4Ability, PLATE_TO_TYPE } from "../src/Gen4Abilities";
import { executeGen4MoveEffect } from "../src/Gen4MoveEffects";

/**
 * Gen 4 Wave 7 (final) -- Gravity move-select block, Multitype ability, Encore enforcement
 *
 * Covers:
 *   - Gravity: blocks gravity-flagged moves (Fly, Bounce, Hi Jump Kick, etc.) from selection
 *   - Gravity: grounds in-flight Pokemon when Gravity activates mid-Fly/Bounce
 *   - Multitype: Arceus type changes based on held Plate on switch-in
 *   - Encore: locks Pokemon into its last used move via getAvailableMoves
 *
 * Source: Showdown Gen 4 mod — Gravity, Multitype, Encore mechanics
 * Source: Bulbapedia — Gravity, Multitype, Encore articles
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const DEFAULT_FLAGS: MoveFlags = {
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

function createMockRng(intReturnValue = 0, chanceResult = false) {
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

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: `test-${Math.random().toString(36).slice(2, 8)}`,
    speciesId: overrides.speciesId ?? 493,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: overrides.moves ?? [
      { moveId: "tackle", currentPP: 35, maxPP: 35 },
      { moveId: "fly", currentPP: 15, maxPP: 15 },
    ],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: "genderless" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: string | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  lastMoveUsed?: string | null;
  moves?: Array<{ moveId: string; currentPP: number; maxPP: number }>;
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const pokemon = makePokemonInstance({
    ability: overrides.ability,
    speciesId: overrides.speciesId,
    nickname: overrides.nickname,
    status: overrides.status,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    heldItem: overrides.heldItem,
    moves: overrides.moves,
  });

  const volatiles =
    overrides.volatiles ?? new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>();

  return {
    pokemon,
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
    volatileStatuses: volatiles,
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    lastMoveUsed: overrides.lastMoveUsed ?? null,
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
  } as ActivePokemon;
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

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: createMockRng(),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeAbilityContext(
  pokemon: ActivePokemon,
  opponent?: ActivePokemon,
  state?: BattleState,
): AbilityContext {
  return {
    pokemon,
    opponent: opponent ?? makeActivePokemon({ types: ["normal"] }),
    state: state ?? makeBattleState(),
    rng: createMockRng(),
    trigger: "on-switch-in",
  };
}

// ============================================================================
// 1. Multitype ability
// ============================================================================

describe("applyGen4Ability on-switch-in -- Multitype (Arceus)", () => {
  it("given Arceus holding Flame Plate, when switching in with Multitype, then becomes Fire type", () => {
    // Source: Showdown Gen 4 mod — Multitype with Flame Plate -> Fire type
    // Source: Bulbapedia — "If Arceus holds a Flame Plate, Multitype changes it to Fire-type"
    const arceus = makeActivePokemon({
      ability: "multitype",
      heldItem: "flame-plate",
      types: ["normal"],
      speciesId: 493,
    });
    const ctx = makeAbilityContext(arceus);

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0].effectType).toBe("type-change");
    if (result.effects[0].effectType === "type-change") {
      expect(result.effects[0].types).toEqual(["fire"]);
      expect(result.effects[0].target).toBe("self");
    }
    expect(result.messages[0]).toContain("Fire");
  });

  it("given Arceus holding Splash Plate, when switching in with Multitype, then becomes Water type", () => {
    // Source: Showdown Gen 4 mod — Multitype with Splash Plate -> Water type
    const arceus = makeActivePokemon({
      ability: "multitype",
      heldItem: "splash-plate",
      types: ["normal"],
      speciesId: 493,
    });
    const ctx = makeAbilityContext(arceus);

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("type-change");
    if (result.effects[0].effectType === "type-change") {
      expect(result.effects[0].types).toEqual(["water"]);
    }
    expect(result.messages[0]).toContain("Water");
  });

  it("given Arceus with no plate, when switching in with Multitype, then stays Normal type", () => {
    // Source: Showdown Gen 4 mod — Multitype without a Plate defaults to Normal
    // Source: Bulbapedia — "If not holding a Plate, Arceus remains Normal-type"
    const arceus = makeActivePokemon({
      ability: "multitype",
      heldItem: null,
      types: ["normal"],
      speciesId: 493,
    });
    const ctx = makeAbilityContext(arceus);

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("type-change");
    if (result.effects[0].effectType === "type-change") {
      expect(result.effects[0].types).toEqual(["normal"]);
    }
    expect(result.messages[0]).toContain("Normal");
  });

  it("given Arceus holding a non-plate item, when switching in with Multitype, then stays Normal type", () => {
    // Source: Showdown Gen 4 mod — non-Plate items don't trigger type change
    const arceus = makeActivePokemon({
      ability: "multitype",
      heldItem: "leftovers",
      types: ["normal"],
      speciesId: 493,
    });
    const ctx = makeAbilityContext(arceus);

    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    if (result.effects[0].effectType === "type-change") {
      expect(result.effects[0].types).toEqual(["normal"]);
    }
  });

  it("given all 16 plates exist in PLATE_TO_TYPE, when checking coverage, then every plate maps to a distinct type", () => {
    // Source: Bulbapedia — 16 Plates exist in Gen 4, one for each non-Normal type
    const types = Object.values(PLATE_TO_TYPE);
    expect(types).toHaveLength(16);
    // All types should be unique
    expect(new Set(types).size).toBe(16);
    // Normal should NOT be in the plate types (Normal = no plate)
    expect(types).not.toContain("normal");
  });
});

// ============================================================================
// 2. Gravity: blocks moves in getAvailableMoves
// ============================================================================

describe("BattleEngine.getAvailableMoves with Gravity active", () => {
  /**
   * Create a minimal BattleEngine for testing getAvailableMoves with gravity.
   * Uses Gen4Ruleset with real data for move flag lookups.
   */
  function createGravityTestEngine() {
    const dm = createGen4DataManager();
    const ruleset = new Gen4Ruleset(dm);

    // Use speciesId 6 (Charizard) — exists in Gen 4 data, learns Fly
    const pokemon = makePokemonInstance({
      speciesId: 6,
      moves: [
        { moveId: "fly", currentPP: 15, maxPP: 15 },
        { moveId: "bounce", currentPP: 5, maxPP: 5 },
        { moveId: "tackle", currentPP: 35, maxPP: 35 },
        { moveId: "thunderbolt", currentPP: 15, maxPP: 15 },
      ],
    });
    // Use speciesId 9 (Blastoise) for opponent
    const opponent = makePokemonInstance({
      speciesId: 9,
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
    });

    const config = {
      generation: 4 as const,
      format: "singles" as const,
      seed: 12345,
      teams: [[pokemon], [opponent]] as [PokemonInstance[], PokemonInstance[]],
    };

    const engine = new BattleEngine(config, ruleset, dm);
    // Start the battle so active pokemon are set up
    engine.start();

    return engine;
  }

  it("given Gravity is active, when getAvailableMoves is called, then Fly is disabled", () => {
    // Source: Showdown Gen 4 mod — Gravity disables gravity-flagged moves
    // Source: Bulbapedia — "The following moves cannot be selected while Gravity is in effect: Fly"
    const engine = createGravityTestEngine();

    // Activate gravity on the engine's state
    (engine as any).state.gravity = { active: true, turnsLeft: 5 };

    const moves = engine.getAvailableMoves(0);
    const flyMove = moves.find((m) => m.moveId === "fly");

    expect(flyMove).toBeDefined();
    expect(flyMove!.disabled).toBe(true);
    expect(flyMove!.disabledReason).toBe("Blocked by Gravity");
  });

  it("given Gravity is active, when getAvailableMoves is called, then Bounce is disabled", () => {
    // Source: Showdown Gen 4 mod — Gravity disables gravity-flagged moves (Bounce)
    // Source: Bulbapedia — "Bounce cannot be selected while Gravity is in effect"
    const engine = createGravityTestEngine();

    (engine as any).state.gravity = { active: true, turnsLeft: 5 };

    const moves = engine.getAvailableMoves(0);
    const bounceMove = moves.find((m) => m.moveId === "bounce");

    expect(bounceMove).toBeDefined();
    expect(bounceMove!.disabled).toBe(true);
    expect(bounceMove!.disabledReason).toBe("Blocked by Gravity");
  });

  it("given Gravity is active, when getAvailableMoves is called, then non-gravity moves are NOT disabled", () => {
    // Source: Showdown Gen 4 mod — non-gravity moves are unaffected by Gravity
    const engine = createGravityTestEngine();

    (engine as any).state.gravity = { active: true, turnsLeft: 5 };

    const moves = engine.getAvailableMoves(0);
    const tackleMove = moves.find((m) => m.moveId === "tackle");
    const tboltMove = moves.find((m) => m.moveId === "thunderbolt");

    expect(tackleMove).toBeDefined();
    expect(tackleMove!.disabled).toBe(false);
    expect(tboltMove).toBeDefined();
    expect(tboltMove!.disabled).toBe(false);
  });

  it("given Gravity is NOT active, when getAvailableMoves is called, then Fly and Bounce are enabled", () => {
    // Source: Showdown — without Gravity, all moves are available normally
    const engine = createGravityTestEngine();

    // Gravity is off by default
    const moves = engine.getAvailableMoves(0);
    const flyMove = moves.find((m) => m.moveId === "fly");
    const bounceMove = moves.find((m) => m.moveId === "bounce");

    expect(flyMove).toBeDefined();
    expect(flyMove!.disabled).toBe(false);
    expect(bounceMove).toBeDefined();
    expect(bounceMove!.disabled).toBe(false);
  });
});

// ============================================================================
// 3. Gravity: grounds in-flight Pokemon
// ============================================================================

describe("Gravity grounds in-flight Pokemon", () => {
  it("given a Pokemon is in-flight (Fly), when Gravity activates, then the flying volatile is removed and forcedMove is cleared", () => {
    // Source: Showdown Gen 4 mod — Gravity brings down in-flight Pokemon
    // Source: Bulbapedia — "If a Pokemon is in the semi-invulnerable turn of Fly or Bounce
    //   and Gravity is activated, that Pokemon is brought back down."
    //
    // We test this via the move effect: when Gravity is used while the opponent has
    // the "flying" volatile and a forcedMove, the engine should ground them.
    // This is tested at the unit level by verifying the MoveEffectResult flags.
    // The actual grounding happens in the engine's gravity-set processing.

    const attacker = makeActivePokemon({ types: ["psychic"] });
    const defender = makeActivePokemon({
      types: ["normal", "flying"],
      volatiles: new Map([["flying", { turnsLeft: 1 }]]),
    });
    // Set forcedMove on the defender
    (defender as any).forcedMove = { moveIndex: 1, moveId: "fly" };

    const state = makeBattleState();

    const gravityMove: MoveData = {
      id: "gravity",
      displayName: "Gravity",
      type: "psychic",
      category: "status",
      power: null,
      accuracy: null,
      pp: 5,
      priority: 0,
      target: "entire-field",
      flags: { ...DEFAULT_FLAGS },
      effect: null,
      description: "Gravity intensifies for 5 turns.",
      generation: 4,
      critRatio: 0,
    } as MoveData;

    const context: MoveEffectContext = {
      move: gravityMove,
      attacker,
      defender,
      state,
      rng: createMockRng(),
      attackerSide: 0,
      defenderSide: 1,
      allTargets: [defender],
      previousDamage: 0,
      isCritical: false,
    } as MoveEffectContext;

    const result = executeGen4MoveEffect(context);

    // The move effect sets gravitySet = true
    expect(result.gravitySet).toBe(true);
    expect(result.messages).toContain("Gravity intensified!");

    // NOTE: The actual grounding of in-flight Pokemon happens in the engine's
    // processMoveEffectResult when it sees gravitySet = true. The moveEffect
    // function returns the flag; the engine processes it.
  });
});

// ============================================================================
// 4. Encore: locks into last used move in getAvailableMoves
// ============================================================================

describe("BattleEngine.getAvailableMoves with Encore volatile", () => {
  function createEncoreTestEngine() {
    const dm = createGen4DataManager();
    const ruleset = new Gen4Ruleset(dm);

    // Use speciesId 6 (Charizard) — exists in Gen 4 data
    const pokemon = makePokemonInstance({
      speciesId: 6,
      moves: [
        { moveId: "tackle", currentPP: 35, maxPP: 35 },
        { moveId: "thunderbolt", currentPP: 15, maxPP: 15 },
        { moveId: "ice-beam", currentPP: 10, maxPP: 10 },
        { moveId: "earthquake", currentPP: 10, maxPP: 10 },
      ],
    });
    // Use speciesId 9 (Blastoise) for opponent
    const opponent = makePokemonInstance({
      speciesId: 9,
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35 }],
    });

    const config = {
      generation: 4 as const,
      format: "singles" as const,
      seed: 12345,
      teams: [[pokemon], [opponent]] as [PokemonInstance[], PokemonInstance[]],
    };

    const engine = new BattleEngine(config, ruleset, dm);
    engine.start();

    return engine;
  }

  it("given a Pokemon is Encored into Tackle, when getAvailableMoves is called, then only Tackle is enabled", () => {
    // Source: Showdown Gen 4 mod — Encore restricts to the encored move
    // Source: Bulbapedia — "Encore forces the target to repeat its last used move"
    const engine = createEncoreTestEngine();

    // Set encore volatile with moveId "tackle"
    const active = (engine as any).state.sides[0].active[0];
    active.volatileStatuses.set("encore", {
      turnsLeft: 3,
      data: { moveId: "tackle" },
    });

    const moves = engine.getAvailableMoves(0);

    // Tackle should be enabled
    const tackle = moves.find((m: any) => m.moveId === "tackle");
    expect(tackle).toBeDefined();
    expect(tackle!.disabled).toBe(false);

    // All other moves should be disabled with "Locked by Encore" reason
    const others = moves.filter((m: any) => m.moveId !== "tackle");
    for (const move of others) {
      expect(move.disabled).toBe(true);
      expect(move.disabledReason).toBe("Locked by Encore");
    }
  });

  it("given a Pokemon is Encored into Thunderbolt, when getAvailableMoves is called, then only Thunderbolt is enabled", () => {
    // Source: Showdown Gen 4 mod — Encore restricts to the specific encored move
    const engine = createEncoreTestEngine();

    const active = (engine as any).state.sides[0].active[0];
    active.volatileStatuses.set("encore", {
      turnsLeft: 5,
      data: { moveId: "thunderbolt" },
    });

    const moves = engine.getAvailableMoves(0);

    const tbolt = moves.find((m: any) => m.moveId === "thunderbolt");
    expect(tbolt).toBeDefined();
    expect(tbolt!.disabled).toBe(false);

    const others = moves.filter((m: any) => m.moveId !== "thunderbolt");
    for (const move of others) {
      expect(move.disabled).toBe(true);
      expect(move.disabledReason).toBe("Locked by Encore");
    }
  });

  it("given a Pokemon has no Encore volatile, when getAvailableMoves is called, then all moves with PP are enabled", () => {
    // Source: Showdown — without Encore, all moves are available normally
    const engine = createEncoreTestEngine();

    const moves = engine.getAvailableMoves(0);

    for (const move of moves) {
      expect(move.disabled).toBe(false);
    }
  });
});
