import type {
  ActivePokemon,
  BattleConfig,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  createDvs,
  createFriendship,
  createMoveSlot,
  createPokemonInstance,
  createStatExp,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "../../src";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

/**
 * Gen 1 Tier 1 Move Handler Tests
 *
 * Tests for splash, super-fang, psywave, and teleport custom move handlers.
 * Source: pret/pokered — cartridge-accurate behavior.
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();
const DATA_MANAGER = createGen1DataManager();
const PIKACHU = DATA_MANAGER.getSpecies(GEN1_SPECIES_IDS.pikachu);
const ABRA = DATA_MANAGER.getSpecies(GEN1_SPECIES_IDS.abra);
const RATTATA = DATA_MANAGER.getSpecies(GEN1_SPECIES_IDS.rattata);
const TACKLE = DATA_MANAGER.getMove(GEN1_MOVE_IDS.tackle);
const SPLASH = DATA_MANAGER.getMove(GEN1_MOVE_IDS.splash);
const SUPER_FANG = DATA_MANAGER.getMove(GEN1_MOVE_IDS.superFang);
const PSYWAVE = DATA_MANAGER.getMove(GEN1_MOVE_IDS.psywave);
const TELEPORT = DATA_MANAGER.getMove(GEN1_MOVE_IDS.teleport);
const DEFAULT_NATURE = NEUTRAL_NATURES[0]!;
const DEFAULT_CALCULATED_STATS = {
  hp: 100,
  attack: 80,
  defense: 60,
  spAttack: 80,
  spDefense: 60,
  speed: 120,
} as const;
const NORMAL_MONOTYPE = [CORE_TYPE_IDS.normal] as PokemonType[];

function createSyntheticOnFieldPokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const pokemon = createPokemonInstance(PIKACHU, 50, new SeededRandom(1), {
    nature: DEFAULT_NATURE,
    ivs: createDvs(),
    evs: createStatExp(),
    friendship: createFriendship(70),
    gender: CORE_GENDERS.male,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    moves: [],
    isShiny: false,
    metLocation: "pallet-town",
    originalTrainer: "Red",
    originalTrainerId: 12345,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.moves = [createMoveSlot(TACKLE.id, TACKLE.pp)];
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.currentHp = 100;
  pokemon.calculatedStats = { ...DEFAULT_CALCULATED_STATS };

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...PIKACHU.types],
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

function createBattleState(): BattleState {
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

function createMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: createSyntheticOnFieldPokemon(),
    defender: createSyntheticOnFieldPokemon({ types: [...NORMAL_MONOTYPE] }),
    move: TACKLE,
    damage: 0,
    state: createBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Splash tests
// ============================================================================

describe("Gen 1 Splash handler", () => {
  const splashMove = SPLASH;

  it('given splash is used, when executeMoveEffect called, then messages includes "But nothing happened!"', () => {
    // Arrange
    const context = createMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But nothing happened!");
  });

  it("given splash is used, when executeMoveEffect called, then no status is inflicted", () => {
    // Arrange
    const context = createMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
  });

  it("given splash is used, when executeMoveEffect called, then no stat changes are applied", () => {
    // Arrange
    const context = createMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statChanges).toHaveLength(0);
  });

  it("given splash is used, when executeMoveEffect called, then no custom damage is set", () => {
    // Arrange
    const context = createMoveEffectContext({ move: splashMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeUndefined();
  });

  it("given splash is used, when executeMoveEffect called, then no heal amount is set", () => {
    // Arrange
    const context = createMoveEffectContext({ move: splashMove, damage: 0 });
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
  const superFangMove = SUPER_FANG;

  it("given defender has 200 HP, when super-fang is used, then customDamage.amount = 100", () => {
    // Arrange
    const defender = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 200,
      } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: superFangMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 100,
      source: SUPER_FANG.id,
    });
  });

  it("given defender has 1 HP, when super-fang is used, then customDamage.amount = 1 (min 1)", () => {
    // Arrange
    const defender = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 1,
      } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: superFangMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(1);
  });

  it("given defender has 201 HP, when super-fang is used, then customDamage.amount = 100 (floors half)", () => {
    // Arrange
    const defender = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 201,
      } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: superFangMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage?.amount).toBe(100);
  });

  it("given defender has 100 HP, when super-fang is used, then no status or stat changes", () => {
    // Arrange
    const context = createMoveEffectContext({ move: superFangMove, damage: 0 });
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
  const psywaveMove = PSYWAVE;

  it("given psywave at level 50, when executeMoveEffect called with a seeded rng, then customDamage.amount matches the deterministic cart-derived roll", () => {
    // Arrange — level 50: max = floor(50 * 1.5) = 75. Seed 42 deterministically produces 45 here.
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, level: 50 } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: psywaveMove, attacker, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 45,
      source: PSYWAVE.id,
    });
  });

  it("given psywave at level 1, when executeMoveEffect called, then customDamage.amount = 1 (min 1)", () => {
    // Arrange — level 1: max = floor(1 * 1.5) = 1, so only result is 1
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, level: 1 } as PokemonInstance,
    });
    // Use a seeded RNG to get a deterministic result
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: psywaveMove, attacker, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert: at level 1, max = floor(1.5) = 1, so the only possible value is 1
    expect(result.customDamage?.amount).toBe(1);
  });

  it("given psywave at level 100, when executeMoveEffect called, then customDamage.amount is in [1, 149]", () => {
    // Arrange — level 100: max = floor(100 * 1.5) = 150, effective range [1, 149] per pret/pokered PsywaveEffect
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: { ...createSyntheticOnFieldPokemon().pokemon, level: 100 } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: psywaveMove, attacker, damage: 0, rng });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 90,
      source: PSYWAVE.id,
    });
  });

  it("given psywave is used, when executeMoveEffect called, then no status or stat changes", () => {
    // Arrange
    const context = createMoveEffectContext({ move: psywaveMove, damage: 0 });
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
  const teleportMove = TELEPORT;

  it('given teleport is used in a trainer battle, when executeMoveEffect called, then messages includes "But it failed!"', () => {
    // Arrange
    const attacker = createSyntheticOnFieldPokemon();
    const state = createBattleState();
    state.sides[0].active[0] = attacker;
    const context = createMoveEffectContext({ move: teleportMove, damage: 0, attacker, state });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But it failed!");
    expect(result.escapeBattle).not.toBe(true);
  });

  it("given teleport is used by the player in a wild battle, when executeMoveEffect called, then it requests a successful escape", () => {
    // Arrange
    const attacker = createSyntheticOnFieldPokemon();
    const state = createBattleState();
    state.isWildBattle = true;
    state.sides[0].active[0] = attacker;
    const context = createMoveEffectContext({ move: teleportMove, damage: 0, attacker, state });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.escapeBattle).toBe(true);
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given teleport is used, when executeMoveEffect called, then no status is inflicted", () => {
    // Arrange
    const context = createMoveEffectContext({ move: teleportMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
  });

  it("given teleport is used, when executeMoveEffect called, then no custom damage is set", () => {
    // Arrange
    const context = createMoveEffectContext({ move: teleportMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.customDamage).toBeUndefined();
  });

  it("given teleport is used, when executeMoveEffect called, then no stat changes are applied", () => {
    // Arrange
    const context = createMoveEffectContext({ move: teleportMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statChanges).toHaveLength(0);
  });

  it("given teleport is used by the player in a wild battle, when BattleEngine resolves the move, then the battle ends as a successful escape", () => {
    // Arrange
    const dataManager = DATA_MANAGER;
    const engineRuleset = new Gen1Ruleset();
    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [
        [
          {
            ...createSyntheticOnFieldPokemon().pokemon,
            speciesId: ABRA.id,
            uid: "abra-player",
            nature: DEFAULT_NATURE,
            ability: "",
            moves: [{ moveId: TELEPORT.id, currentPP: TELEPORT.pp, maxPP: TELEPORT.pp, ppUps: 0 }],
          } as PokemonInstance,
        ],
        [
          {
            ...createSyntheticOnFieldPokemon().pokemon,
            speciesId: RATTATA.id,
            uid: "rattata-wild",
            nature: DEFAULT_NATURE,
            ability: "",
            moves: [{ moveId: TACKLE.id, currentPP: TACKLE.pp, maxPP: TACKLE.pp, ppUps: 0 }],
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
    const fleeAttemptEvents = events.filter(
      (event) => event.type === "flee-attempt" && event.side === 0,
    );
    const safeEscapeMessages = events.filter(
      (event) => event.type === "message" && "text" in event && event.text === "Got away safely!",
    );
    // Source: pret/pokered src/engine/battle/effect_commands.asm — successful wild Teleport
    // uses the standard "Got away safely!" escape text.
    expect(fleeAttemptEvents).toHaveLength(1);
    expect(safeEscapeMessages).toHaveLength(1);
  });
});
