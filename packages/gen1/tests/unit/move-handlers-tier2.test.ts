import {
  type ActivePokemon,
  BATTLE_EFFECT_TARGETS,
  type BattleState,
  type MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TYPES,
  CORE_MOVE_IDS,
  CORE_STAT_IDS,
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
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_NATURE_IDS, GEN1_SPECIES_IDS } from "../../src";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

/**
 * Gen 1 Tier 2 Move Handler Tests
 *
 * Tests for rest, mist, conversion custom move handlers,
 * and Mist enforcement blocking foe-targeted stat drops.
 * Source: pret/pokered — cartridge-accurate behavior.
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();
const ITEMS = CORE_ITEM_IDS;
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN1_MOVE_IDS } as const;
const STATUS_IDS = CORE_STATUS_IDS;
const TYPE_IDS = CORE_TYPE_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const GEN1_DATA = createGen1DataManager();
const DEFAULT_SPECIES = GEN1_DATA.getSpecies(GEN1_SPECIES_IDS.pikachu);
const DEFAULT_MOVE = GEN1_DATA.getMove(MOVE_IDS.tackle);
const DEFAULT_NATURE = GEN1_NATURE_IDS.hardy;

function createSyntheticMoveFrom(baseMove: MoveData, overrides: Partial<MoveData> = {}): MoveData {
  return {
    ...baseMove,
    ...overrides,
    flags: overrides.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
  };
}

function getCanonicalMove(moveId: string): MoveData {
  return GEN1_DATA.getMove(moveId);
}

function createSyntheticOnFieldPokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const species = GEN1_DATA.getSpecies(DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(1), {
    nature: DEFAULT_NATURE,
    gender: CORE_GENDERS.male,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    moves: [],
    ivs: createDvs(),
    evs: createStatExp(),
    friendship: createFriendship(70),
    isShiny: false,
    metLocation: "pallet-town",
    originalTrainer: "Red",
    originalTrainerId: 12345,
    pokeball: ITEMS.pokeBall,
  });
  pokemon.moves = [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)];
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.currentHp = 100;
  pokemon.calculatedStats = {
    hp: 100,
    attack: 80,
    defense: 60,
    spAttack: 80,
    spDefense: 60,
    speed: 120,
  };
  return {
    pokemon: pokemon as PokemonInstance,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
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
    ended: false,
    winner: null,
  } as BattleState;
}

function createMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: createSyntheticOnFieldPokemon(),
    defender: createSyntheticOnFieldPokemon({ types: [TYPE_IDS.normal] }),
    move: createSyntheticMoveFrom(DEFAULT_MOVE),
    damage: 0,
    state: createBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Rest tests
// ============================================================================

describe("Gen 1 Rest handler", () => {
  const restMove = getCanonicalMove(MOVE_IDS.rest);

  it('given attacker is at full HP and has no status, when rest is used, then messages includes "But it failed!"', () => {
    // Arrange — full HP (currentHp === calculatedStats.hp), no status
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 100,
        status: null,
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
    const context = createMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker is at full HP and has no status, when rest is used, then no status is inflicted on self", () => {
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 100,
        status: null,
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
    const context = createMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.selfStatusInflicted).toBeUndefined();
  });

  it("given attacker is at half HP with no status, when rest is used, then statusCuredOnly=attacker + healAmount=maxHp + selfStatusInflicted=sleep + sleepTurns=2", () => {
    // Arrange — half HP, no status
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 50,
        status: null,
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
    const context = createMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result.healAmount).toBe(100); // heals to max HP
    expect(result.selfStatusInflicted).toBe(STATUS_IDS.sleep);
    expect(result.selfVolatileData).toEqual({ turnsLeft: 2 });
  });

  it("given attacker is poisoned (any HP), when rest is used, then Rest succeeds and cures poison", () => {
    // Arrange — poisoned attacker at partial HP
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 60,
        status: STATUS_IDS.poison,
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
    const context = createMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — should cure poison and apply sleep
    expect(result.statusCuredOnly).toEqual({ target: "attacker" });
    expect(result.selfStatusInflicted).toBe(STATUS_IDS.sleep);
    expect(result.selfVolatileData).toEqual({ turnsLeft: 2 });
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given attacker is at full HP but is poisoned, when rest is used, then Rest succeeds (status condition triggers success)", () => {
    // Arrange — full HP, but has a status condition
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        currentHp: 100,
        status: STATUS_IDS.poison,
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
    const context = createMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — success because has status (even at full HP)
    expect(result.selfStatusInflicted).toBe(STATUS_IDS.sleep);
    expect(result.messages).not.toContain("But it failed!");
  });
});

// ============================================================================
// Mist tests
// ============================================================================

describe("Gen 1 Mist handler", () => {
  const mistMove = getCanonicalMove(MOVE_IDS.mist);

  it("given attacker has no mist volatile, when mist is used, then selfVolatileInflicted=mist and turnsLeft=-1 (permanent)", () => {
    // Arrange
    // Source: pret/pokered — Mist is SUBSTATUS_MIST, permanent until switch-out or Haze (no turn counter in Gen 1)
    const attacker = createSyntheticOnFieldPokemon({
      volatileStatuses: new Map(), // no mist
    });
    const context = createMoveEffectContext({ move: mistMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.selfVolatileInflicted).toBe(VOLATILE_IDS.mist);
    expect(result.selfVolatileData).toEqual({ turnsLeft: -1 });
    expect(result.messages).not.toContain("But it failed!");
  });

  it('given attacker already has mist volatile, when mist is used, then messages includes "But it failed!"', () => {
    // Arrange — mist already active (permanent in Gen 1, turnsLeft: -1)
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: -1 });
    const attacker = createSyntheticOnFieldPokemon({
      volatileStatuses: mistStatuses,
    });
    const context = createMoveEffectContext({ move: mistMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But it failed!");
    expect(result.selfVolatileInflicted).toBeUndefined();
  });

  it("given mist is used successfully, when executeMoveEffect called, then no statusInflicted on defender", () => {
    // Arrange
    const context = createMoveEffectContext({ move: mistMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
  });
});

// ============================================================================
// Conversion tests
// ============================================================================

describe("Gen 1 Conversion handler", () => {
  const conversionMove = getCanonicalMove(MOVE_IDS.conversion);

  it("given defender is Water type, when conversion is used, then typeChange target=attacker types=[water]", () => {
    // Arrange
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.water],
    });
    const context = createMoveEffectContext({ move: conversionMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.typeChange).toEqual({ target: "attacker", types: [TYPE_IDS.water] });
  });

  it("given defender is Fire/Flying dual type, when conversion is used, then typeChange types=[fire, flying]", () => {
    // Arrange
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.fire, TYPE_IDS.flying],
    });
    const context = createMoveEffectContext({ move: conversionMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: [TYPE_IDS.fire, TYPE_IDS.flying],
    });
  });

  it("given conversion is used, when executeMoveEffect called, then no status or stat changes", () => {
    // Arrange
    const defender = createSyntheticOnFieldPokemon({ types: [TYPE_IDS.grass] });
    const context = createMoveEffectContext({ move: conversionMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
  });
});

// ============================================================================
// Mist enforcement — block foe stat drops
// ============================================================================

describe("Gen 1 Mist enforcement — block foe-targeted stat drops", () => {
  const growlMove = getCanonicalMove(MOVE_IDS.growl);

  it("given defender has mist, when growl is used (foe attack drop), then stat change is blocked", () => {
    // Arrange — defender protected by Mist
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: 4 });
    const defender = createSyntheticOnFieldPokemon({
      types: [TYPE_IDS.normal],
      volatileStatuses: mistStatuses,
    });
    const context = createMoveEffectContext({ move: growlMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — stat drop should be blocked
    expect(result.statChanges).toHaveLength(0);
  });

  it("given defender has mist, when growl is used, then message includes protection by mist", () => {
    // Arrange
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: 4 });
    const defender = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        nickname: "Rattata",
      } as PokemonInstance,
      types: [TYPE_IDS.normal],
      volatileStatuses: mistStatuses,
    });
    const context = createMoveEffectContext({ move: growlMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toEqual(["Rattata is protected by the mist!"]);
  });

  it("given defender has no mist, when growl is used, then stat drop is applied normally", () => {
    // Arrange — no mist
    const context = createMoveEffectContext({ move: growlMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — should have the attack drop
    expect(result.statChanges.length).toBeGreaterThan(0);
    expect(result.statChanges[0]).toMatchObject({
      target: "defender",
      stat: CORE_STAT_IDS.attack,
      stages: -1,
    });
  });

  it("given defender has mist, when a self-stat-drop move is used (target=self), then it is NOT blocked by mist", () => {
    // Arrange — Mist only blocks FOE stat drops, not self-inflicted drops
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: 4 });
    const attacker = createSyntheticOnFieldPokemon({
      volatileStatuses: mistStatuses,
    });
    // A move that drops attacker's own defense (e.g., Close Combat — but we simulate it)
    const selfDropMove = createSyntheticMoveFrom(DEFAULT_MOVE, {
      id: "self-drop-test",
      displayName: "Self Drop",
      type: TYPE_IDS.normal,
      category: CORE_MOVE_CATEGORIES.status,
      target: BATTLE_EFFECT_TARGETS.self,
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.statChange,
        target: BATTLE_EFFECT_TARGETS.self,
        changes: [{ stat: CORE_STAT_IDS.defense, stages: -1 }],
      },
    });
    const context = createMoveEffectContext({ move: selfDropMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — self-targeted drops are NOT blocked by Mist
    expect(result.statChanges.some((c) => c.target === "attacker" && c.stages < 0)).toBe(true);
  });
});
