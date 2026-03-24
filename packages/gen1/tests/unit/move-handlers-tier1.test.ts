import type {
  ActivePokemon,
  BattleConfig,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager } from "../../src/data";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

/**
 * Gen 1 Tier 1 Move Handler Tests
 *
 * Tests for splash, super-fang, psywave, and teleport custom move handlers.
 * Source: pret/pokered — cartridge-accurate behavior.
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();

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

function makeMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: "normal" as PokemonType,
    category: "physical",
    power: 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_MOVE_FLAGS,
    effect: null,
    description: "A test move.",
    generation: 1,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: 25,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
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
      pokeball: "poke-ball",
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
    types: ["electric"] as PokemonType[],
    ability: "",
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

function makeBattleState(): BattleState {
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
        active: [null],
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
        active: [null],
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
    isWildBattle: false,
    ended: false,
    winner: null,
  } as BattleState;
}

function makeMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: makeActivePokemon(),
    defender: makeActivePokemon({ types: ["normal"] }),
    move: makeMove(),
    damage: 0,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Splash tests
// ============================================================================

describe("Gen 1 Splash handler", () => {
  const splashMove = makeMove({
    id: "splash",
    displayName: "Splash",
    type: "normal" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "self",
    effect: { type: "custom" as const, handler: "splash" },
  });

  it('given splash is used, when executeMoveEffect called, then messages includes "But nothing happened!"', () => {
    // Arrange
    const context = makeMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But nothing happened!");
  });

  it("given splash is used, when executeMoveEffect called, then no status is inflicted", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
  });

  it("given splash is used, when executeMoveEffect called, then no stat changes are applied", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statChanges).toHaveLength(0);
  });

  it("given splash is used, when executeMoveEffect called, then no custom damage is set", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeFalsy();
  });

  it("given splash is used, when executeMoveEffect called, then no heal amount is set", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.healAmount).toBe(0);
  });
});

// ============================================================================
// Super Fang tests
// ============================================================================

describe("Gen 1 Super Fang handler", () => {
  const superFangMove = makeMove({
    id: "super-fang",
    displayName: "Super Fang",
    type: "normal" as PokemonType,
    category: "physical",
    power: null,
    accuracy: 90,
    effect: { type: "custom" as const, handler: "super-fang" },
  });

  it("given defender has 200 HP, when super-fang is used, then customDamage.amount = 100", () => {
    // Arrange
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 200,
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: superFangMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeDefined();
    expect(result.customDamage?.amount).toBe(100);
    expect(result.customDamage?.target).toBe("defender");
    expect(result.customDamage?.source).toBe("super-fang");
  });

  it("given defender has 1 HP, when super-fang is used, then customDamage.amount = 1 (min 1)", () => {
    // Arrange
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 1,
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: superFangMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(1);
  });

  it("given defender has 201 HP, when super-fang is used, then customDamage.amount = 100 (floors half)", () => {
    // Arrange
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        currentHp: 201,
      } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: superFangMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(100);
  });

  it("given defender has 100 HP, when super-fang is used, then no status or stat changes", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: superFangMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
  });
});

// ============================================================================
// Psywave tests
// ============================================================================

describe("Gen 1 Psywave handler", () => {
  const psywaveMove = makeMove({
    id: "psywave",
    displayName: "Psywave",
    type: "psychic" as PokemonType,
    category: "special",
    power: null,
    accuracy: 80,
    effect: { type: "custom" as const, handler: "psywave" },
  });

  it("given psywave at level 50, when executeMoveEffect called, then customDamage.amount is in [1, 74]", () => {
    // Arrange — level 50: max = floor(50 * 1.5) = 75, effective range [1, 74] per pret/pokered PsywaveEffect
    const attacker = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, level: 50 } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: psywaveMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeDefined();
    expect(result.customDamage?.amount).toBeGreaterThanOrEqual(1);
    expect(result.customDamage?.amount).toBeLessThanOrEqual(74);
    expect(result.customDamage?.target).toBe("defender");
    expect(result.customDamage?.source).toBe("psywave");
  });

  it("given psywave at level 1, when executeMoveEffect called, then customDamage.amount = 1 (min 1)", () => {
    // Arrange — level 1: max = floor(1 * 1.5) = 1, so only result is 1
    const attacker = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, level: 1 } as PokemonInstance,
    });
    // Use a seeded RNG to get a deterministic result
    const rng = new SeededRandom(42);
    const context = makeMoveEffectContext({ move: psywaveMove, attacker, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert: at level 1, max = floor(1.5) = 1, so the only possible value is 1
    expect(result.customDamage?.amount).toBe(1);
  });

  it("given psywave at level 100, when executeMoveEffect called, then customDamage.amount is in [1, 149]", () => {
    // Arrange — level 100: max = floor(100 * 1.5) = 150, effective range [1, 149] per pret/pokered PsywaveEffect
    const attacker = makeActivePokemon({
      pokemon: { ...makeActivePokemon().pokemon, level: 100 } as PokemonInstance,
    });
    const context = makeMoveEffectContext({ move: psywaveMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBeGreaterThanOrEqual(1);
    expect(result.customDamage?.amount).toBeLessThanOrEqual(149);
  });

  it("given psywave is used, when executeMoveEffect called, then no status or stat changes", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: psywaveMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
  });
});

// ============================================================================
// Teleport tests
// ============================================================================

describe("Gen 1 Teleport handler", () => {
  const teleportMove = makeMove({
    id: "teleport",
    displayName: "Teleport",
    type: "psychic" as PokemonType,
    category: "status",
    power: null,
    accuracy: null,
    target: "self",
    effect: { type: "custom" as const, handler: "teleport" },
  });

  it('given teleport is used in a trainer battle, when executeMoveEffect called, then messages includes "But it failed!"', () => {
    // Arrange
    const attacker = makeActivePokemon();
    const state = makeBattleState();
    state.sides[0].active[0] = attacker;
    const context = makeMoveEffectContext({ move: teleportMove, damage: 0, attacker, state });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But it failed!");
    expect(result.escapeBattle).not.toBe(true);
  });

  it("given teleport is used by the player in a wild battle, when executeMoveEffect called, then it requests a successful escape", () => {
    // Arrange
    const attacker = makeActivePokemon();
    const state = makeBattleState();
    state.isWildBattle = true;
    state.sides[0].active[0] = attacker;
    const context = makeMoveEffectContext({ move: teleportMove, damage: 0, attacker, state });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.escapeBattle).toBe(true);
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given teleport is used, when executeMoveEffect called, then no status is inflicted", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: teleportMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
  });

  it("given teleport is used, when executeMoveEffect called, then no custom damage is set", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: teleportMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeFalsy();
  });

  it("given teleport is used, when executeMoveEffect called, then no stat changes are applied", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: teleportMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statChanges).toHaveLength(0);
  });

  it("given teleport is used by the player in a wild battle, when BattleEngine resolves the move, then the battle ends as a successful escape", () => {
    // Arrange
    const dataManager = createGen1DataManager();
    const engineRuleset = new Gen1Ruleset();
    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [
        [
          {
            ...makeActivePokemon().pokemon,
            speciesId: 63,
            uid: "abra-player",
            moves: [{ moveId: "teleport", currentPP: 20, maxPP: 20, ppUps: 0 }],
          } as PokemonInstance,
        ],
        [
          {
            ...makeActivePokemon().pokemon,
            speciesId: 19,
            uid: "rattata-wild",
            moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
          } as PokemonInstance,
        ],
      ],
      seed: 42,
      isWildBattle: true,
    };
    const engine = new BattleEngine(config, engineRuleset, dataManager);
    engine.start();

    // Act
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Assert
    expect(engine.isEnded()).toBe(true);
    expect(engine.getWinner()).toBeNull();
    expect(engine.getPhase()).toBe("battle-end");
    expect(() => engine.serialize()).not.toThrow();
    const events = engine.getEventLog();
    // Source: pret/pokered src/engine/battle/effect_commands.asm — successful wild Teleport
    // uses the standard "Got away safely!" escape text.
    expect(events.some((event) => event.type === "flee-attempt" && event.side === 0)).toBe(true);
    expect(
      events.some(
        (event) => event.type === "message" && "text" in event && event.text === "Got away safely!",
      ),
    ).toBe(true);
  });
});
