import type {
  AbilityContext,
  ActivePokemon,
  BattleAction,
  BattleSide,
  BattleState,
  ItemContext,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type {
  DataManager,
  MoveData,
  PokemonInstance,
  PokemonSpeciesData,
  PokemonType,
  PrimaryStatus,
} from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_GIMMICK_IDS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_ITEM_TRIGGER_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_EFFECT_TYPES,
  CORE_MOVE_TARGET_IDS,
  CORE_PROTECT_EFFECT_VARIANTS,
  CORE_SCREEN_IDS,
  CORE_STAT_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "../../src";
import { createGen1DataManager } from "../../src/data";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";
import { applyBadgeBoostGlitch, applyGen1BadgeBoosts } from "../../src/Gen1StatCalc";

/**
 * Gen1Ruleset Branch Coverage Tests
 *
 * Covers uncovered branches in Gen1Ruleset.ts:
 * - canInflictStatus: type immunities
 * - applyStatusDamage: burn, poison, badly-poisoned, freeze/sleep/paralysis
 * - executeMoveEffect / applyMoveEffect: all effect types
 * - resolveTurnOrder: edge cases
 * - validatePokemon: validation errors
 * - Miscellaneous no-op methods
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();
const gen1DataManager = createGen1DataManager();
const HARDY_NATURE = ALL_NATURES.find((nature) => nature.displayName === "Hardy")!.id;
const MODEST_NATURE = ALL_NATURES.find((nature) => nature.displayName === "Modest")!.id;
const PIKACHU_SPECIES = gen1DataManager.getSpecies(GEN1_SPECIES_IDS.pikachu);
const BULBASAUR_SPECIES = gen1DataManager.getSpecies(GEN1_SPECIES_IDS.bulbasaur);
const CHARIZARD_SPECIES = gen1DataManager.getSpecies(GEN1_SPECIES_IDS.charizard);
const TACKLE = gen1DataManager.getMove(GEN1_MOVE_IDS.tackle);
const QUICK_ATTACK = gen1DataManager.getMove(GEN1_MOVE_IDS.quickAttack);
const THUNDER_SHOCK = gen1DataManager.getMove(GEN1_MOVE_IDS.thunderShock);
const THUNDERBOLT = gen1DataManager.getMove(GEN1_MOVE_IDS.thunderbolt);
const THUNDER = gen1DataManager.getMove(GEN1_MOVE_IDS.thunder);
const HYPER_BEAM = gen1DataManager.getMove(GEN1_MOVE_IDS.hyperBeam);
const FISSURE = gen1DataManager.getMove(GEN1_MOVE_IDS.fissure);
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const NORMAL_TYPES: PokemonType[] = [CORE_TYPE_IDS.normal];
const FIRE_TYPES: PokemonType[] = [CORE_TYPE_IDS.fire];
const _WATER_TYPES: PokemonType[] = [CORE_TYPE_IDS.water];
const ICE_TYPES: PokemonType[] = [CORE_TYPE_IDS.ice];
const POISON_TYPES: PokemonType[] = [CORE_TYPE_IDS.poison];
const ELECTRIC_TYPES: PokemonType[] = [CORE_TYPE_IDS.electric];
const _WATER_ROCK_TYPES: PokemonType[] = [CORE_TYPE_IDS.water, CORE_TYPE_IDS.rock];
const _WATER_NORMAL_TYPES: PokemonType[] = [CORE_TYPE_IDS.water, CORE_TYPE_IDS.normal];
const ABILITY_TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const ITEM_TRIGGERS = CORE_ITEM_TRIGGER_IDS;

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

function createScenarioMove(overrides: Partial<MoveData> = {}): MoveData {
  const baseMove = TACKLE;
  return {
    ...baseMove,
    id: baseMove.id,
    displayName: baseMove.displayName,
    type: baseMove.type,
    category: baseMove.category,
    power: baseMove.power,
    accuracy: baseMove.accuracy,
    pp: baseMove.pp,
    priority: baseMove.priority,
    target: baseMove.target,
    flags: { ...DEFAULT_MOVE_FLAGS, ...baseMove.flags },
    effect: baseMove.effect,
    description: baseMove.description,
    generation: baseMove.generation,
    ...overrides,
  };
}

function makeCanonicalMoveSlot(moveId: string) {
  const move = gen1DataManager.getMove(moveId);
  return createMoveSlot(move.id, move.pp);
}

function makeSyntheticMoveSlot(
  reason: string,
  overrides: { moveId: string; currentPP: number; maxPP: number; ppUps?: number },
) {
  void reason;
  return {
    ...createMoveSlot(TACKLE.id, TACKLE.pp),
    ...overrides,
    ppUps: overrides.ppUps ?? 0,
  };
}

function createActivePokemonFixture(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: GEN1_SPECIES_IDS.pikachu,
      nickname: null,
      level: 50,
      experience: 0,
      nature: HARDY_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [makeCanonicalMoveSlot(TACKLE.id)],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    types: ELECTRIC_TYPES,
    ability: CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
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

function makeBattleState(
  overrides: { side0Active?: ActivePokemon | null; side1Active?: ActivePokemon | null } = {},
): BattleState {
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
        active: [overrides.side0Active ?? null],
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
        active: [overrides.side1Active ?? null],
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

function createMoveEffectContextFixture(
  overrides: Partial<MoveEffectContext> = {},
): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: createActivePokemonFixture(),
    defender: createActivePokemonFixture({ types: NORMAL_TYPES }),
    move: createScenarioMove(),
    damage: 50,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Status Immunity Tests (canInflictStatus)
// ============================================================================

describe("Gen1Ruleset canInflictStatus (via executeMoveEffect)", () => {
  it("given a fire-type target, when burn is inflicted, then burn is not applied (fire immunity)", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: FIRE_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.burn },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given an ice-type target, when freeze is inflicted, then freeze is not applied (ice immunity)", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: ICE_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.freeze },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a poison-type target, when poison is inflicted, then poison is not applied (poison immunity)", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: POISON_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.poison },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a poison-type target, when badly-poisoned is inflicted, then badly-poisoned is not applied (poison immunity)", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: POISON_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.badlyPoisoned },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given an electric-type target, when paralysis is inflicted, then paralysis IS applied (Gen 1 quirk)", () => {
    // Arrange: In Gen 1, Electric types CAN be paralyzed (unlike later gens)
    const defender = createActivePokemonFixture({ types: ELECTRIC_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.paralysis },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.paralysis);
  });

  it("given a normal-type target, when sleep is inflicted, then sleep IS applied (no immunity)", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.sleep },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.sleep);
  });

  it("given a non-fire target, when burn is inflicted, then burn IS applied", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.burn },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.burn);
  });

  it("given a non-ice target, when freeze is inflicted, then freeze IS applied", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.freeze },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.freeze);
  });

  it("given an unknown status type, when inflicting via status-guaranteed, then default allows infliction", () => {
    // Arrange: Cast to PrimaryStatus to test the default branch in canInflictStatus
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: "unknown-status" as PrimaryStatus },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert: The default case in canInflictStatus returns true
    expect(result.statusInflicted).toBe("unknown-status");
  });

  it("given a non-poison target, when poison is inflicted, then poison IS applied", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.poison },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.poison);
  });
});

// ============================================================================
// Status Damage Tests (applyStatusDamage)
// ============================================================================

describe("Gen1Ruleset applyStatusDamage", () => {
  it("given a burned Pokemon with 160 max HP, when applying status damage, then deals 1/16 max HP (10)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.burn, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — burn/poison damage = floor(maxHp/16), min 1
    // Assert: floor(160 / 16) = 10
    expect(damage).toBe(10);
  });

  it("given a poisoned Pokemon with 160 max HP, when applying status damage, then deals 1/16 max HP (10)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.poison, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — burn/poison damage = floor(maxHp/16), min 1
    // Assert: floor(160 / 16) = 10
    expect(damage).toBe(10);
  });

  it("given a badly-poisoned Pokemon with toxic counter 1, when applying status damage, then deals 1/16 max HP", () => {
    // Arrange
    const volatiles = new Map();
    volatiles.set(CORE_VOLATILE_IDS.toxicCounter, { turnsLeft: 0, data: { counter: 1 } });
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
      volatileStatuses: volatiles,
    });
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.badlyPoisoned, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — toxic damage = floor(maxHp * counter / 16), min 1; counter increments each turn
    // Assert: floor(160 * 1 / 16) = 10
    expect(damage).toBe(10);
  });

  it("given a badly-poisoned Pokemon with toxic counter 3, when applying status damage, then deals 3/16 max HP (escalating)", () => {
    // Arrange
    const volatiles = new Map();
    volatiles.set(CORE_VOLATILE_IDS.toxicCounter, { turnsLeft: 0, data: { counter: 3 } });
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
      volatileStatuses: volatiles,
    });
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.badlyPoisoned, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — toxic damage = floor(maxHp * counter / 16), min 1
    // Assert: floor(160 * 3 / 16) = floor(30) = 30
    expect(damage).toBe(30);
  });

  it("given a badly-poisoned Pokemon with no toxic counter data, when applying status damage, then defaults counter to 1", () => {
    // Arrange: No volatile status data at all
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 160,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.badlyPoisoned, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — toxic damage = floor(maxHp * counter / 16), min 1
    // Assert: defaults to counter 1 -> floor(160 * 1 / 16) = 10
    expect(damage).toBe(10);
  });

  it("given a frozen Pokemon, when applying status damage, then returns 0 (freeze deals no damage)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture();
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.freeze, state);
    // Assert
    expect(damage).toBe(0);
  });

  it("given a sleeping Pokemon, when applying status damage, then returns 0 (sleep deals no damage)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture();
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.sleep, state);
    // Assert
    expect(damage).toBe(0);
  });

  it("given a paralyzed Pokemon, when applying status damage, then returns 0 (paralysis deals no damage)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture();
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.paralysis, state);
    // Assert
    expect(damage).toBe(0);
  });

  it("given a burned Pokemon with low max HP (15), when applying status damage, then minimum is 1", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 15,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.burn, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — minimum damage is 1; max(1, floor(15/16)) = max(1, 0) = 1
    // Assert: max(1, floor(15 / 16)) = max(1, 0) = 1
    expect(damage).toBe(1);
  });

  it("given an unknown status type, when applying status damage, then returns 0 (default case)", () => {
    // Arrange: Cast to PrimaryStatus to test the default branch
    const pokemon = createActivePokemonFixture();
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, "unknown-status" as PrimaryStatus, state);
    // Assert
    expect(damage).toBe(0);
  });

  it("given a Pokemon with no calculatedStats, when applying burn damage, then throws instead of fabricating max HP", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: undefined,
        currentHp: 160,
      } as PokemonInstance,
    });
    const state = makeBattleState();
    expect(() => ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.burn, state)).toThrow(
      /Gen1 max-HP calculation requires calculatedStats/i,
    );
  });
});

// ============================================================================
// Move Effect Tests (executeMoveEffect / applyMoveEffect)
// ============================================================================

describe("Gen1Ruleset executeMoveEffect", () => {
  it("given a move with no effect, when executing move effect, then returns default (no-op) result", () => {
    // Arrange
    const move = createScenarioMove({ effect: null });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
    expect(result.statChanges).toEqual([]);
    expect(result.recoilDamage).toBe(0);
    expect(result.healAmount).toBe(0);
    expect(result.switchOut).toBe(false);
    expect(result.messages).toEqual([]);
  });

  // --- status-chance effect ---

  it("given a status-chance effect with 100% chance, when roll passes and target has no status, then inflicts status", () => {
    // Arrange: Use a high chance that will pass with the seeded rng
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.statusChance,
        status: CORE_STATUS_IDS.paralysis,
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.paralysis);
  });

  it("given a status-chance effect with 0% chance, when roll fails, then does not inflict status", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.statusChance,
        status: CORE_STATUS_IDS.burn,
        chance: 0,
      },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a status-chance effect, when target already has a status, then does not inflict new status", () => {
    // Arrange
    const defenderPokemon = {
      ...createActivePokemonFixture().pokemon,
      status: CORE_STATUS_IDS.paralysis as PrimaryStatus,
    } as PokemonInstance;
    const defender = createActivePokemonFixture({
      types: NORMAL_TYPES,
      pokemon: defenderPokemon,
    });
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.statusChance,
        status: CORE_STATUS_IDS.burn,
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert: Already has paralysis, can't add burn
    expect(result.statusInflicted).toBe(null);
  });

  it("given a status-chance effect for burn, when target is fire-type, then status immunity prevents infliction", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: FIRE_TYPES });
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.statusChance,
        status: CORE_STATUS_IDS.burn,
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  // --- status-guaranteed effect ---

  it("given a status-guaranteed effect, when target already has a status, then does not overwrite", () => {
    // Arrange
    const defenderPokemon = {
      ...createActivePokemonFixture().pokemon,
      status: CORE_STATUS_IDS.burn as PrimaryStatus,
    } as PokemonInstance;
    const defender = createActivePokemonFixture({
      types: NORMAL_TYPES,
      pokemon: defenderPokemon,
    });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.sleep },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a status-guaranteed effect for freeze on ice-type, when executing, then immunity prevents infliction", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: ICE_TYPES });
    const move = createScenarioMove({
      effect: { type: "status-guaranteed", status: CORE_STATUS_IDS.freeze },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  // --- stat-change effect ---

  it("given a stat-change effect targeting foe, when executing, then records stat changes for defender", () => {
    // Arrange
    const move = createScenarioMove({
      effect: {
        type: "stat-change",
        changes: [{ stat: CORE_STAT_IDS.attack, stages: -1 }],
        target: "foe",
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]).toEqual({
      target: "defender",
      stat: CORE_STAT_IDS.attack,
      stages: -1,
    });
  });

  it("given a stat-change effect targeting self, when executing, then records stat changes for attacker", () => {
    // Arrange
    const move = createScenarioMove({
      effect: {
        type: "stat-change",
        changes: [{ stat: CORE_STAT_IDS.defense, stages: 1 }],
        target: "self",
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]).toEqual({
      target: "attacker",
      stat: CORE_STAT_IDS.defense,
      stages: 1,
    });
  });

  it("given a stat-change effect with multiple changes, when executing, then records all changes", () => {
    // Arrange
    const move = createScenarioMove({
      effect: {
        type: "stat-change",
        changes: [
          { stat: CORE_STAT_IDS.attack, stages: 2 },
          { stat: "speed", stages: 2 },
        ],
        target: "self",
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statChanges).toHaveLength(2);
  });

  // --- recoil effect ---

  it("given a recoil effect of 1/4 damage dealt, when executing, then recoilDamage is 1/4 of damage", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: "recoil", amount: 0.25 },
    });
    const ctx = createMoveEffectContextFixture({ move, damage: 100 });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Source: pokered engine/battle/move_effects/recoil.asm RecoilEffect_ — recoil = floor(damage * fraction), min 1
    // Assert: max(1, floor(100 * 0.25)) = 25
    expect(result.recoilDamage).toBe(25);
  });

  it("given a recoil effect with very low damage, when executing, then recoilDamage is at least 1", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: "recoil", amount: 0.25 },
    });
    const ctx = createMoveEffectContextFixture({ move, damage: 1 });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Source: pokered engine/battle/move_effects/recoil.asm RecoilEffect_ — recoil = floor(damage * fraction), min 1
    // Assert: max(1, floor(1 * 0.25)) = max(1, 0) = 1
    expect(result.recoilDamage).toBe(1);
  });

  // --- drain effect ---

  it("given a drain effect of 1/2 damage dealt, when executing, then healAmount is 1/2 of damage", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: "drain", amount: 0.5 },
    });
    const ctx = createMoveEffectContextFixture({ move, damage: 80 });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Source: pokered engine/battle/move_effects/drain_hp.asm DrainHPEffect_ — heal = floor(damage / 2), min 1
    // Assert: max(1, floor(80 * 0.5)) = 40
    expect(result.healAmount).toBe(40);
  });

  it("given a drain effect with very low damage, when executing, then healAmount is at least 1", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: "drain", amount: 0.5 },
    });
    const ctx = createMoveEffectContextFixture({ move, damage: 1 });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Source: pokered engine/battle/move_effects/drain_hp.asm DrainHPEffect_ — heal = floor(damage / 2), min 1
    // Assert: max(1, floor(1 * 0.5)) = max(1, 0) = 1
    expect(result.healAmount).toBe(1);
  });

  // --- heal effect ---

  it("given a heal effect of 50% max HP, when executing, then healAmount is half of max HP", () => {
    // Arrange
    const attacker = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 200,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const move = createScenarioMove({
      effect: { type: "heal", amount: 0.5 },
    });
    const ctx = createMoveEffectContextFixture({ attacker, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Source: pokered engine/battle/move_effects/heal.asm HealEffect_ — Recover/Softboiled: srl b; rr c (divide maxHp by 2)
    // Assert: max(1, floor(200 * 0.5)) = 100
    expect(result.healAmount).toBe(100);
  });

  it("given a heal effect when attacker has no calculatedStats, when executing, then throws instead of fabricating max HP", () => {
    // Arrange
    const attacker = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: undefined,
        currentHp: 80,
      } as PokemonInstance,
    });
    const move = createScenarioMove({
      effect: { type: "heal", amount: 0.5 },
    });
    const ctx = createMoveEffectContextFixture({ attacker, move });
    expect(() => ruleset.executeMoveEffect(ctx)).toThrow(
      /Gen1 max-HP calculation requires calculatedStats/i,
    );
  });

  // --- multi effect ---

  it("given a multi effect with nested stat-change and status-chance, when executing, then both sub-effects are applied", () => {
    // Arrange
    const defender = createActivePokemonFixture({ types: NORMAL_TYPES });
    const move = createScenarioMove({
      effect: {
        type: "multi",
        effects: [
          {
            type: "stat-change",
            changes: [{ stat: "speed", stages: -1 }],
            target: "foe",
            chance: 100,
          },
          {
            type: CORE_MOVE_EFFECT_TYPES.statusChance,
            status: CORE_STATUS_IDS.paralysis,
            chance: 100,
          },
        ],
      },
    });
    const ctx = createMoveEffectContextFixture({ defender, move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statChanges).toHaveLength(1);
    expect(result.statusInflicted).toBe(CORE_STATUS_IDS.paralysis);
  });

  // --- No-op effect types ---

  it("given a fixed-damage effect, when executing, then no side-effects are recorded (handled by damage calc)", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.fixedDamage, damage: 40 },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert: These are handled by damage calculation, not by move effects
    expect(result.statusInflicted).toBe(null);
    expect(result.recoilDamage).toBe(0);
  });

  it("given a level-damage effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.levelDamage },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given an ohko effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.ohko },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a damage effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.damage },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a volatile-status (confusion) effect, when executing, then no primary status is inflicted", () => {
    // Arrange
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.volatileStatus,
        status: CORE_VOLATILE_IDS.confusion,
        chance: 100,
      },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a weather effect, when executing, then no side-effects are recorded (N/A in Gen 1)", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.weather, weather: CORE_WEATHER_IDS.sun, turns: 5 },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a terrain effect, when executing, then no side-effects are recorded (N/A in Gen 1)", () => {
    // Arrange
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.terrain,
        terrain: CORE_TERRAIN_IDS.electric,
        turns: 5,
      },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given an entry-hazard effect, when executing, then no side-effects are recorded (N/A in Gen 1)", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.entryHazard, hazard: CORE_HAZARD_IDS.stealthRock },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a remove-hazards effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.removeHazards, method: "spin" },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a screen effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.screen, screen: CORE_SCREEN_IDS.reflect, turns: 5 },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a multi-hit effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.multiHit, min: 2, max: 5 },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a two-turn effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.twoTurn, firstTurn: GEN1_MOVE_IDS.fly },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a switch-out effect, when executing, then no side-effects are recorded (engine-handled)", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.switchOut, target: CORE_MOVE_TARGET_IDS.self },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.switchOut).toBe(false);
  });

  it("given a protect effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: {
        type: CORE_MOVE_EFFECT_TYPES.protect,
        variant: CORE_PROTECT_EFFECT_VARIANTS.standard,
      },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });

  it("given a custom effect, when executing, then no side-effects are recorded", () => {
    // Arrange
    const move = createScenarioMove({
      effect: { type: CORE_MOVE_EFFECT_TYPES.custom, handler: GEN1_MOVE_IDS.metronome },
    });
    const ctx = createMoveEffectContextFixture({ move });
    // Act
    const result = ruleset.executeMoveEffect(ctx);
    // Assert
    expect(result.statusInflicted).toBe(null);
  });
});

// ============================================================================
// Turn Order Tests (resolveTurnOrder)
// ============================================================================

describe("Gen1Ruleset resolveTurnOrder", () => {
  it("given a switch action and a move action, when resolving turn order, then switch goes first", () => {
    // Arrange
    const switchAction: BattleAction = { type: "switch", side: 0, switchTo: 1 };
    const moveAction: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const active0 = createActivePokemonFixture();
    const active1 = createActivePokemonFixture();
    const state = makeBattleState({ side0Active: active0, side1Active: active1 });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([moveAction, switchAction], state, rng);
    // Assert
    expect(ordered[0]?.type).toBe("switch");
    expect(ordered[1]?.type).toBe("move");
  });

  it("given a run action and a move action, when resolving turn order, then run goes first", () => {
    // Arrange
    const runAction: BattleAction = { type: "run", side: 0 };
    const moveAction: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const active0 = createActivePokemonFixture();
    const active1 = createActivePokemonFixture();
    const state = makeBattleState({ side0Active: active0, side1Active: active1 });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([moveAction, runAction], state, rng);
    // Assert
    expect(ordered[0]?.type).toBe("run");
    expect(ordered[1]?.type).toBe("move");
  });

  it("given two move actions with same priority and different speed, when resolving, then faster Pokemon goes first", () => {
    // Arrange
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const slowPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 50,
        },
      } as PokemonInstance,
    });
    const fastPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: slowPokemon, side1Active: fastPokemon });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([move0, move1], state, rng);
    // Assert: side 1 (fast) goes first
    expect(ordered[0]?.side).toBe(1);
    expect(ordered[1]?.side).toBe(0);
  });

  it("given two move actions with same priority and same speed, when resolving, then random tiebreak occurs", () => {
    // Arrange
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const sameStat = {
      hp: 100,
      attack: 80,
      defense: 60,
      spAttack: 80,
      spDefense: 60,
      speed: 100,
    };
    const pokemon0 = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: sameStat,
      } as PokemonInstance,
    });
    const pokemon1 = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: sameStat,
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: pokemon0, side1Active: pokemon1 });
    // Act: Run with different seeds to verify both orderings are possible
    const outcomes = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      const ordered = ruleset.resolveTurnOrder([move0, move1], state, rng);
      outcomes.add(ordered[0]?.side);
    }
    // Assert: Both sides should appear as first at some point
    expect(outcomes.has(0)).toBe(true);
    expect(outcomes.has(1)).toBe(true);
  });

  it("given a struggle action and a move action, when resolving, then uses speed ordering", () => {
    // Arrange
    const struggleAction: BattleAction = { type: "struggle", side: 0 };
    const moveAction: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const slowPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 30,
        },
      } as PokemonInstance,
    });
    const fastPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: slowPokemon, side1Active: fastPokemon });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([struggleAction, moveAction], state, rng);
    // Assert: faster (side 1) goes first
    expect(ordered[0]?.side).toBe(1);
  });

  it("given a recharge action and a move action, when resolving, then uses speed ordering", () => {
    // Arrange
    const rechargeAction: BattleAction = { type: "recharge", side: 0 };
    const moveAction: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const slowPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 30,
        },
      } as PokemonInstance,
    });
    const fastPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: slowPokemon, side1Active: fastPokemon });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([rechargeAction, moveAction], state, rng);
    // Assert: faster side goes first
    expect(ordered[0]?.side).toBe(1);
  });

  it("given two struggle actions with same speed, when resolving, then random tiebreak occurs", () => {
    // Arrange
    const struggle0: BattleAction = { type: "struggle", side: 0 };
    const struggle1: BattleAction = { type: "struggle", side: 1 };
    const sameStat = {
      hp: 100,
      attack: 80,
      defense: 60,
      spAttack: 80,
      spDefense: 60,
      speed: 100,
    };
    const pokemon0 = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: sameStat,
      } as PokemonInstance,
    });
    const pokemon1 = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: sameStat,
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: pokemon0, side1Active: pokemon1 });
    // Act
    const outcomes = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      const ordered = ruleset.resolveTurnOrder([struggle0, struggle1], state, rng);
      outcomes.add(ordered[0]?.side);
    }
    // Assert: Both outcomes should occur
    expect(outcomes.has(0)).toBe(true);
    expect(outcomes.has(1)).toBe(true);
  });

  it("given a paralyzed Pokemon, when resolving turn order, then its effective speed is reduced to 25%", () => {
    // Arrange
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    // Side 0: speed 200 but paralyzed -> effective = floor(200 * 0.25) = 50
    const paralyzedPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.paralysis as PrimaryStatus,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    // Side 1: speed 100 (faster than paralyzed 50)
    const normalPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: paralyzedPokemon, side1Active: normalPokemon });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([move0, move1], state, rng);
    // Assert: Side 1 (100 speed) should go before side 0 (200 * 0.25 = 50 effective speed)
    expect(ordered[0]?.side).toBe(1);
  });

  it("given two move actions where active Pokemon is null, when resolving, then returns them in stable order", () => {
    // Arrange
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const state = makeBattleState({ side0Active: null, side1Active: null });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([move0, move1], state, rng);
    // Assert: Should not throw; returns some order
    expect(ordered).toHaveLength(2);
  });

  it("given a move action with invalid moveIndex (no move slot), when resolving, then handles gracefully", () => {
    // Arrange: moveIndex 5 doesn't exist in the Pokemon's moves array
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 5 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const active0 = createActivePokemonFixture();
    const active1 = createActivePokemonFixture();
    const state = makeBattleState({ side0Active: active0, side1Active: active1 });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([move0, move1], state, rng);
    // Assert: Should not throw
    expect(ordered).toHaveLength(2);
  });

  it("given two item actions, when resolving turn order, then returns them in stable order (return 0 comparator)", () => {
    // Arrange: Item actions are not move/switch/run, so the comparator falls through to return 0
    const item0: BattleAction = { type: "item", side: 0, itemId: "potion" };
    const item1: BattleAction = { type: "item", side: 1, itemId: "potion" };
    const state = makeBattleState();
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([item0, item1], state, rng);
    // Assert: Should not throw; both are returned
    expect(ordered).toHaveLength(2);
    expect(ordered[0]?.type).toBe("item");
    expect(ordered[1]?.type).toBe("item");
  });

  it("given an item action and a switch action, when resolving, then switch goes first (switch beats everything)", () => {
    // Arrange
    const item: BattleAction = { type: "item", side: 0, itemId: "potion" };
    const switchAction: BattleAction = { type: "switch", side: 1, switchTo: 1 };
    const state = makeBattleState();
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([item, switchAction], state, rng);
    // Assert
    expect(ordered[0]?.type).toBe("switch");
  });

  it("given two move actions with different priorities (e.g., Quick Attack vs Tackle), when resolving, then higher priority goes first", () => {
    // Arrange: quick-attack has priority +1, tackle has priority 0
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const slowWithQuickAttack = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [makeCanonicalMoveSlot(QUICK_ATTACK.id)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 30,
        },
      } as PokemonInstance,
    });
    const fastWithTackle = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [makeCanonicalMoveSlot(TACKLE.id)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({
      side0Active: slowWithQuickAttack,
      side1Active: fastWithTackle,
    });
    const rng = new SeededRandom(42);
    // Act
    const ordered = ruleset.resolveTurnOrder([move0, move1], state, rng);
    // Assert: Quick Attack (+1) beats Tackle (0) even though side 0 is slower
    expect(ordered[0]?.side).toBe(0);
  });

  it("given a move action with an unrecognized move ID, when resolving turn order, then throws instead of fabricating priority 0", () => {
    // Arrange: Use a move ID that doesn't exist in the data manager
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const pokemonWithFakeMove = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [
          makeSyntheticMoveSlot("Exercise unknown move validation.", {
            moveId: "nonexistent-move-xyz",
            currentPP: 30,
            maxPP: 30,
          }),
        ],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 50,
        },
      } as PokemonInstance,
    });
    const pokemonWithTackle = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [makeCanonicalMoveSlot(TACKLE.id)],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({
      side0Active: pokemonWithFakeMove,
      side1Active: pokemonWithTackle,
    });
    const rng = new SeededRandom(42);
    // Act & Assert
    expect(() => ruleset.resolveTurnOrder([move0, move1], state, rng)).toThrow(
      /move data not found|unknown move/i,
    );
  });

  it("given both Pokemon have unrecognized moves, when resolving turn order, then throws before sorting", () => {
    // Arrange: Both moves are unrecognized
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const pokemonA = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [
          makeSyntheticMoveSlot("Exercise unknown move validation.", {
            moveId: "fake-move-a",
            currentPP: 30,
            maxPP: 30,
          }),
        ],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 50,
        },
      } as PokemonInstance,
    });
    const pokemonB = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [
          makeSyntheticMoveSlot("Exercise unknown move validation.", {
            moveId: "fake-move-b",
            currentPP: 30,
            maxPP: 30,
          }),
        ],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: pokemonA, side1Active: pokemonB });
    const rng = new SeededRandom(42);
    // Act & Assert
    expect(() => ruleset.resolveTurnOrder([move0, move1], state, rng)).toThrow(
      /move data not found|unknown move/i,
    );
  });

  it("given an injected data manager knows the move, when resolving turn order, then Gen1Ruleset uses that shared move source", () => {
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const customMoveId = "custom-priority-move";
    const sharedDataManager = {
      getMove: (moveId: string) => {
        if (moveId === customMoveId) {
          return { priority: 2 };
        }
        if (moveId === GEN1_MOVE_IDS.tackle) {
          return { priority: 0 };
        }
        throw new Error(`Move ${moveId} not found`);
      },
    } as DataManager;
    const rulesetWithSharedData = new Gen1Ruleset({ dataManager: sharedDataManager });
    const customMovePokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [
          makeSyntheticMoveSlot("Exercise shared data-manager custom move priority.", {
            moveId: customMoveId,
            currentPP: 10,
            maxPP: 10,
          }),
        ],
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 80,
        },
      } as PokemonInstance,
    });
    const tacklePokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        moves: [makeCanonicalMoveSlot(TACKLE.id)],
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
    const state = makeBattleState({ side0Active: customMovePokemon, side1Active: tacklePokemon });

    const ordered = rulesetWithSharedData.resolveTurnOrder(
      [move0, move1],
      state,
      new SeededRandom(42),
    );

    expect(ordered[0]).toEqual(move0);
  });

  it("given an injected data manager throws a non-lookup error, when resolving turn order, then the original loader error is preserved", () => {
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const sharedDataManager = {
      getMove: (_moveId: string) => {
        throw new Error("custom loader exploded");
      },
    } as DataManager;
    const rulesetWithSharedData = new Gen1Ruleset({ dataManager: sharedDataManager });
    const state = makeBattleState({
      side0Active: createActivePokemonFixture(),
      side1Active: createActivePokemonFixture(),
    });

    expect(() =>
      rulesetWithSharedData.resolveTurnOrder([move0, move1], state, new SeededRandom(42)),
    ).toThrow(/custom loader exploded/i);
  });

  it("given a Pokemon with no calculatedStats, when resolving turn order, then throws instead of fabricating speed", () => {
    // Arrange
    const move0: BattleAction = { type: "move", side: 0, moveIndex: 0 };
    const move1: BattleAction = { type: "move", side: 1, moveIndex: 0 };
    const noStatsPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: undefined,
      } as PokemonInstance,
    });
    const fastPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 200,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: noStatsPokemon, side1Active: fastPokemon });
    const rng = new SeededRandom(42);
    // Assert: missing calculatedStats is invalid runtime state and must not be masked
    expect(() => ruleset.resolveTurnOrder([move0, move1], state, rng)).toThrow(
      /Gen1 turn-order calculation requires calculatedStats/i,
    );
  });
});

// ============================================================================
// Validation Tests (validatePokemon)
// ============================================================================

describe("Gen1Ruleset validatePokemon", () => {
  function makeSyntheticSpecies(overrides: Partial<PokemonSpeciesData> = {}): PokemonSpeciesData {
    return { ...BULBASAUR_SPECIES, ...overrides } as PokemonSpeciesData;
  }

  function createPokemonInstanceFixture(overrides: Partial<PokemonInstance> = {}): PokemonInstance {
    return {
      uid: "test-uid",
      speciesId: GEN1_SPECIES_IDS.bulbasaur,
      nickname: null,
      level: 50,
      experience: 0,
      nature: HARDY_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [makeCanonicalMoveSlot(TACKLE.id)],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
      ...overrides,
    } as PokemonInstance;
  }

  it("given a Gen 1 Pokemon with an illegal move, when validating, then returns an error for Gen 1 move legality", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({
      moves: [makeCanonicalMoveSlot(HYPER_BEAM.id)],
    });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(GEN1_MOVE_IDS.hyperBeam))).toBe(true);
  });

  it("given a Gen 1 Pokemon with a legal move the species cannot learn, when validating, then returns an error for species move legality", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({
      moves: [makeCanonicalMoveSlot(FISSURE.id)],
    });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes(GEN1_MOVE_IDS.fissure))).toBe(true);
  });

  it("given a Gen 1 Pokemon with an ability, when validating, then returns an error because abilities do not exist in Gen 1", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ ability: CORE_ABILITY_IDS.static });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Abilities"))).toBe(true);
  });

  it("given a Gen 1 Pokemon with a non-normal ability slot, when validating, then returns an error because ability slots do not exist in Gen 1", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ abilitySlot: CORE_ABILITY_SLOTS.hidden });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Ability slot"))).toBe(true);
  });

  it("given a Gen 1 Pokemon with a non-neutral nature, when validating, then returns an error because natures do not exist in Gen 1", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ nature: MODEST_NATURE });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Nature"))).toBe(true);
  });

  it("given a valid Gen 1 Pokemon, when validating, then returns valid with no errors", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture();
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("given a Pokemon with level 0, when validating, then returns error for level out of range", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ level: 0 });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Level"))).toBe(true);
  });

  it("given a Pokemon with level 101, when validating, then returns error for level out of range", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ level: 101 });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Level"))).toBe(true);
  });

  it("given a Pokemon with species ID 152 (Gen 2 Chikorita), when validating, then returns error for species not in Gen 1", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture();
    const species = makeSyntheticSpecies({ id: 152, displayName: "Chikorita" });
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not available in Gen 1"))).toBe(true);
  });

  it("given a Pokemon with species ID 0, when validating, then returns error for species out of range", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture();
    const species = makeSyntheticSpecies({ id: 0, displayName: "Invalid" });
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not available in Gen 1"))).toBe(true);
  });

  it("given a Pokemon with 0 moves, when validating, then returns error for wrong move count", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ moves: [] });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("1-4 moves"))).toBe(true);
  });

  it("given a Pokemon with 5 moves, when validating, then returns error for wrong move count", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({
      moves: [
        makeCanonicalMoveSlot(TACKLE.id),
        makeCanonicalMoveSlot(THUNDER_SHOCK.id),
        makeCanonicalMoveSlot(QUICK_ATTACK.id),
        makeCanonicalMoveSlot(THUNDERBOLT.id),
        makeCanonicalMoveSlot(THUNDER.id),
      ],
    });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("1-4 moves"))).toBe(true);
  });

  it("given a Pokemon with a held item, when validating, then returns error for held items not available", () => {
    // Arrange
    const pokemon = createPokemonInstanceFixture({ heldItem: CORE_ITEM_IDS.leftovers });
    const species = makeSyntheticSpecies();
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Held items"))).toBe(true);
  });

  it("given a Pokemon with multiple validation errors, when validating, then returns all errors", () => {
    // Arrange: level out of range + held item + species out of range
    const pokemon = createPokemonInstanceFixture({ level: 200, heldItem: CORE_ITEM_IDS.leftovers });
    const species = makeSyntheticSpecies({ id: 200, displayName: "Invalid" });
    // Act
    const result = ruleset.validatePokemon(pokemon, species);
    // Assert
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// Freeze Thaw Tests (Gen 1 quirk: always false)
// ============================================================================

describe("Gen1Ruleset checkFreezeThaw (Gen 1 quirk: permanent freeze)", () => {
  it("given any frozen Pokemon, when checking freeze thaw, then always returns false (permanent freeze in Gen 1)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.freeze as PrimaryStatus,
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    // Source: pokered engine/battle/core.asm .FrozenCheck — no natural thaw roll; frozen Pokemon simply cannot move; only opponent Fire-type move thaws
    // Act / Assert: Run 100 checks to confirm it never thaws
    for (let i = 0; i < 100; i++) {
      expect(ruleset.checkFreezeThaw(pokemon, rng)).toBe(false);
    }
  });
});

// ============================================================================
// Sleep Turns Tests
// ============================================================================

describe("Gen1Ruleset rollSleepTurns", () => {
  it("given Gen 1 ruleset, when rolling sleep turns, then returns value between 1 and 7", () => {
    // Arrange
    const rng = new SeededRandom(42);
    // Source: pokered engine/battle/effects.asm SleepEffect .setSleepCounter — BattleRandom() & SLP_MASK (0b111), retry if 0; yields 1-7
    // Act / Assert
    for (let i = 0; i < 100; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(7);
    }
  });

  it("given Gen 1 sleep, when rollSleepTurns is called, then returns a value between 1 and 7 inclusive", () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const turns = ruleset.rollSleepTurns(rng);
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(7);
    }
  });

  it("given sleeping Pokemon waking up (Gen 1 mechanic), when sleep counter reaches 0, then Pokemon cannot act on wake turn (documented expected behavior)", () => {
    // This test documents the Gen 1 behavior: sleeping Pokemon cannot act on the turn they wake up.
    // The actual enforcement is at the BattleEngine level.
    // Gen 1 sleep lasts 1-7 turns; on the turn the counter hits 0, the Pokemon wakes but doesn't move.
    // We verify the rollSleepTurns range is correct (1-7) so the engine can implement the rule.
    const rng = new SeededRandom(99);
    const turns = ruleset.rollSleepTurns(rng);
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(7);
  });
});

// ============================================================================
// Additional Freeze Tests (Gen 1 quirk: no natural thaw)
// ============================================================================

describe("Gen1Ruleset checkFreezeThaw (additional)", () => {
  it("given frozen Pokemon, when checkFreezeThaw is called, then always returns false (no natural thaw)", () => {
    // Arrange
    const rng = new SeededRandom(42);
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.freeze as PrimaryStatus,
      } as PokemonInstance,
    });
    // Act / Assert
    for (let i = 0; i < 100; i++) {
      const result = ruleset.checkFreezeThaw(pokemon, rng);
      expect(result).toBe(false);
    }
  });
});

// ============================================================================
// Badly-Poisoned (Toxic) escalating damage — counter=1 default test
// ============================================================================

describe("Gen1Ruleset applyStatusDamage (toxic escalation)", () => {
  it("given badly-poisoned (Toxic) Pokemon, when calculating escalating damage, then each turn counter increases damage", () => {
    // Arrange: Poison damage escalates N/16 where N starts at 1
    const maxHp = 160;
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.badlyPoisoned as PrimaryStatus,
        calculatedStats: {
          hp: maxHp,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
        currentHp: maxHp,
      } as PokemonInstance,
    });
    // Note: toxic counter stored in volatileStatuses — use default (counter=1)
    const state = makeBattleState();
    // Act
    const damage = ruleset.applyStatusDamage(pokemon, CORE_STATUS_IDS.badlyPoisoned, state);
    // Source: pokered engine/battle/core.asm HandlePoisonBurnLeechSeed_DecreaseOwnHP — toxic damage = floor(maxHp * counter / 16), min 1
    // Assert: with counter=1 (default), damage = floor(160 * 1 / 16) = 10
    expect(damage).toBe(10);
  });
});

describe("Gen1Ruleset bag item support", () => {
  it("given Gen 1 has no implemented bag item data or effects, when querying bag item support, then it reports unsupported", () => {
    expect(ruleset.canUseBagItems()).toBe(false);
  });
});

// ============================================================================
// No-op Method Return Values
// ============================================================================

describe("Gen1Ruleset no-op methods", () => {
  it("given Gen1Ruleset, when calling applyAbility, then returns inactive result", () => {
    // Arrange / Act
    const result = ruleset.applyAbility(
      ABILITY_TRIGGERS.onSwitchIn,
      {} as unknown as AbilityContext,
    );
    // Assert
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given Gen1Ruleset, when calling applyHeldItem, then returns inactive result", () => {
    // Arrange / Act
    const result = ruleset.applyHeldItem(ITEM_TRIGGERS.endOfTurn, {} as unknown as ItemContext);
    // Assert
    expect(result.activated).toBe(false);
    expect(result.effects).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given Gen1Ruleset, when calling applyEntryHazards, then returns empty result", () => {
    // Arrange / Act
    const result = ruleset.applyEntryHazards(
      {} as unknown as ActivePokemon,
      {} as unknown as BattleSide,
    );
    // Assert
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it("given Gen1Ruleset, when calling hasAbilities, then returns false", () => {
    expect(ruleset.hasAbilities()).toBe(false);
  });

  it("given Gen1Ruleset, when calling hasHeldItems, then returns false", () => {
    expect(ruleset.hasHeldItems()).toBe(false);
  });

  it("given Gen1Ruleset, when calling hasWeather, then returns false", () => {
    expect(ruleset.hasWeather()).toBe(false);
  });

  it("given Gen1Ruleset, when calling hasTerrain, then returns false", () => {
    expect(ruleset.hasTerrain()).toBe(false);
  });

  it("given Gen1Ruleset, when calling getBattleGimmick, then returns null", () => {
    expect(ruleset.getBattleGimmick(CORE_GIMMICK_IDS.mega)).toBe(null);
  });

  it("given Gen1Ruleset, when calling getAvailableHazards, then returns empty array", () => {
    expect(ruleset.getAvailableHazards()).toEqual([]);
  });

  it("given Gen1Ruleset, when calling applyWeatherEffects, then returns empty array", () => {
    expect(ruleset.applyWeatherEffects({} as unknown as BattleState)).toEqual([]);
  });

  it("given Gen1Ruleset, when calling applyTerrainEffects, then returns empty array", () => {
    expect(ruleset.applyTerrainEffects({} as unknown as BattleState)).toEqual([]);
  });
});

// ============================================================================
// Gen 1 Quirk Tests
// ============================================================================

describe("Gen 1 Quirks", () => {
  // --- 1/256 Miss Glitch (verified in accuracy.test.ts, but ensure via ruleset) ---

  it("given a 100% accuracy move, when checking doesMoveHit over many trials, then very rarely misses (1/256 miss glitch)", () => {
    // Arrange
    const rng = new SeededRandom(12345);
    let misses = 0;
    const trials = 10000;
    // Act
    for (let i = 0; i < trials; i++) {
      const attacker = createActivePokemonFixture();
      const defender = createActivePokemonFixture();
      const move = createScenarioMove({ accuracy: 100 });
      const state = makeBattleState();
      const result = ruleset.doesMoveHit({ attacker, defender, move, state, rng });
      if (!result) misses++;
    }
    // Assert: Should have some misses (1/256 ~ 0.39%), but very few
    // Roughly expect ~39 misses out of 10000, allow wide tolerance
    expect(misses).toBeLessThan(trials * 0.02); // less than 2%
  });

  // --- Focus Energy Bug (tested in crit-calc.test.ts, verify via rollCritical) ---

  it("given Focus Energy active, when rolling critical via Gen1Ruleset, then crit rate is lower (Focus Energy bug)", () => {
    // Arrange
    const normalVolatiles = new Map();
    const focusEnergyVolatiles = new Map();
    focusEnergyVolatiles.set(GEN1_MOVE_IDS.focusEnergy, { turnsLeft: -1 });

    const normalAttacker = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        speciesId: GEN1_SPECIES_IDS.pikachu, // Pikachu, base speed 90
      } as PokemonInstance,
      volatileStatuses: normalVolatiles,
    });
    const focusAttacker = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        speciesId: GEN1_SPECIES_IDS.pikachu,
      } as PokemonInstance,
      volatileStatuses: focusEnergyVolatiles,
    });
    const move = createScenarioMove({ category: MOVE_CATEGORIES.physical });
    const state = makeBattleState();

    // Act: Roll many times to compare rates
    let normalCrits = 0;
    let focusCrits = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const rng1 = new SeededRandom(i);
      const rng2 = new SeededRandom(i);
      if (ruleset.rollCritical({ attacker: normalAttacker, move, state, rng: rng1 })) normalCrits++;
      if (ruleset.rollCritical({ attacker: focusAttacker, move, state, rng: rng2 })) focusCrits++;
    }
    // Assert: Focus Energy should give FEWER crits (it divides by 4 instead of multiplying)
    expect(focusCrits).toBeLessThan(normalCrits);
  });

  // --- Hyper Beam Recharge Skip on KO ---

  it("given Hyper Beam KOs the target, when executeMoveEffect runs, then the result sets noRecharge", () => {
    // Source: gen1-ground-truth.md §7 — Hyper Beam skips recharge after a KO in Gen 1.
    const defender = createActivePokemonFixture({
      pokemon: { ...createActivePokemonFixture().pokemon, currentHp: 0 } as PokemonInstance,
    });
    const hyperBeam = createScenarioMove({
      id: GEN1_MOVE_IDS.hyperBeam,
      power: 150,
      flags: { ...DEFAULT_MOVE_FLAGS, recharge: true },
    });
    const context = createMoveEffectContextFixture({
      defender,
      move: hyperBeam,
      damage: 120,
    });

    const result = ruleset.executeMoveEffect(context);

    expect(result.noRecharge).toBe(true);
  });

  // --- Permanent Freeze ---

  it("given a frozen Pokemon, when checkFreezeThaw is called any number of times, then always returns false (permanent freeze)", () => {
    // Arrange
    const frozen = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.freeze as PrimaryStatus,
      } as PokemonInstance,
    });
    // Act / Assert
    for (let seed = 0; seed < 50; seed++) {
      const rng = new SeededRandom(seed);
      expect(ruleset.checkFreezeThaw(frozen, rng)).toBe(false);
    }
  });

  // --- Sleep Counter Reset on Switch-In ---

  it("given a sleeping Pokemon switches out, when onSwitchOut runs, then the sleep counter and sleep status persist", () => {
    // Source: gen1-ground-truth.md §8 — sleep duration is stored in party data and does not reset on switch.
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.sleep as PrimaryStatus,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 4 });
    const state = makeBattleState({ side0Active: pokemon });
    state.sides[0].screens = [{ type: CORE_SCREEN_IDS.reflect, turnsLeft: -1 }];

    ruleset.onSwitchOut(pokemon, state);

    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    expect(pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(4);
    expect(state.sides[0].screens).toEqual([]);
  });

  // --- Gen 1 Crit Formula: BaseSpeed/512 (normal), BaseSpeed/64 (high-crit) ---

  it("given Gen1Ruleset rollCritical with a status move, when rolling, then never crits", () => {
    // Arrange
    const attacker = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        speciesId: GEN1_SPECIES_IDS.pikachu,
      } as PokemonInstance,
    });
    const statusMove = createScenarioMove({ category: MOVE_CATEGORIES.status });
    const state = makeBattleState();
    // Act / Assert
    for (let seed = 0; seed < 100; seed++) {
      const rng = new SeededRandom(seed);
      const result = ruleset.rollCritical({ attacker, move: statusMove, state, rng });
      expect(result).toBe(false);
    }
  });

  // --- Ghost→Psychic = 0x ---

  it("given Gen 1 type chart, when checking Ghost vs Psychic effectiveness, then returns 0 (immune - the famous bug)", () => {
    // Arrange
    const chart = ruleset.getTypeChart();
    // Act
    const effectiveness = (chart as Record<string, Record<string, number>>).ghost?.psychic;
    // Assert
    expect(effectiveness).toBe(0);
  });

  // --- No abilities, no held items, no natures, no weather ---

  it("given Gen 1 ruleset, when checking all feature flags, then abilities/items/weather/terrain are all disabled", () => {
    expect(ruleset.hasAbilities()).toBe(false);
    expect(ruleset.hasHeldItems()).toBe(false);
    expect(ruleset.hasWeather()).toBe(false);
    expect(ruleset.hasTerrain()).toBe(false);
    expect(ruleset.getBattleGimmick(CORE_GIMMICK_IDS.mega)).toBeNull();
    expect(ruleset.getAvailableHazards()).toEqual([]);
  });

  // --- Physical/Special by Move Type ---

  it("given Gen 1 ruleset, when getting valid types, then all 15 Gen 1 types are present (no dark/steel/fairy)", () => {
    // Arrange
    const types = ruleset.getAvailableTypes();
    // Assert
    expect(types).toHaveLength(15);
    expect(types).not.toContain(CORE_TYPE_IDS.dark);
    expect(types).not.toContain(CORE_TYPE_IDS.steel);
    expect(types).not.toContain(CORE_TYPE_IDS.fairy);
  });

  // --- Badge Stat Boosts ---
});

// ============================================================================
// Gen 1 Badge Stat Boosts — applyGen1BadgeBoosts
// ============================================================================

describe("Gen1BadgeBoosts — applyGen1BadgeBoosts", () => {
  it("given boulder badge, when applying badge boosts, then attack is multiplied by 9/8 (floor)", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts routine
    // Boulder Badge boosts Attack by × 9/8: floor(100 * 9 / 8) = floor(112.5) = 112
    const stats = { hp: 100, attack: 100, defense: 100, speed: 100, spAttack: 100, spDefense: 100 };
    const result = applyGen1BadgeBoosts(stats, { boulder: true });
    expect(result.attack).toBe(112);
    expect(result.defense).toBe(100); // unchanged
    expect(result.speed).toBe(100); // unchanged
    expect(result.spAttack).toBe(100); // unchanged
    expect(result.spDefense).toBe(100); // unchanged
    expect(result.hp).toBe(100); // HP is never boosted by badges
  });

  it("given thunder badge, when applying badge boosts, then defense is multiplied by 9/8 (floor)", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts routine
    // Thunder Badge boosts Defense by × 9/8: floor(150 * 9 / 8) = floor(168.75) = 168
    const stats = { hp: 200, attack: 100, defense: 150, speed: 100, spAttack: 100, spDefense: 100 };
    const result = applyGen1BadgeBoosts(stats, { thunder: true });
    expect(result.defense).toBe(168);
    expect(result.attack).toBe(100); // unchanged
    expect(result.speed).toBe(100); // unchanged
    expect(result.spAttack).toBe(100); // unchanged
    expect(result.hp).toBe(200); // unchanged
  });

  it("given soul badge, when applying badge boosts, then speed is multiplied by 9/8 (floor)", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts routine
    // Soul Badge boosts Speed by × 9/8: floor(180 * 9 / 8) = floor(202.5) = 202
    const stats = { hp: 100, attack: 100, defense: 100, speed: 180, spAttack: 100, spDefense: 100 };
    const result = applyGen1BadgeBoosts(stats, { soul: true });
    expect(result.speed).toBe(202);
    expect(result.attack).toBe(100); // unchanged
    expect(result.defense).toBe(100); // unchanged
    expect(result.spAttack).toBe(100); // unchanged
  });

  it("given volcano badge, when applying badge boosts, then spAttack and spDefense are both multiplied by 9/8 (floor)", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts routine
    // Volcano Badge boosts Special by × 9/8 (Gen 1 unified Special → both spAttack and spDefense)
    // floor(160 * 9 / 8) = floor(180) = 180
    const stats = { hp: 100, attack: 100, defense: 100, speed: 100, spAttack: 160, spDefense: 160 };
    const result = applyGen1BadgeBoosts(stats, { volcano: true });
    expect(result.spAttack).toBe(180);
    expect(result.spDefense).toBe(180);
    expect(result.attack).toBe(100); // unchanged
    expect(result.defense).toBe(100); // unchanged
    expect(result.speed).toBe(100); // unchanged
  });

  it("given all four badges, when applying badge boosts, then all combat stats are boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — four badge boosts:
    //   Boulder(Atk), Thunder(Def), Soul(Spe), Volcano(SpAtk/SpDef)
    const stats = {
      hp: 100,
      attack: 200,
      defense: 150,
      speed: 180,
      spAttack: 160,
      spDefense: 160,
    };
    const result = applyGen1BadgeBoosts(stats, {
      boulder: true,
      thunder: true,
      soul: true,
      volcano: true,
    });
    // attack: floor(200 * 9 / 8) = floor(225) = 225
    expect(result.attack).toBe(225);
    // defense: floor(150 * 9 / 8) = floor(168.75) = 168
    expect(result.defense).toBe(168);
    // speed: floor(180 * 9 / 8) = floor(202.5) = 202
    expect(result.speed).toBe(202);
    // spAttack: floor(160 * 9 / 8) = floor(180) = 180
    expect(result.spAttack).toBe(180);
    // spDefense: floor(160 * 9 / 8) = floor(180) = 180
    expect(result.spDefense).toBe(180);
    // HP is never boosted by badges
    expect(result.hp).toBe(100);
  });

  it("given no badges, when applying badge boosts, then stats are unchanged", () => {
    // Source: pret/pokered — badges are optional, no boost if not set
    const stats = { hp: 100, attack: 100, defense: 100, speed: 100, spAttack: 100, spDefense: 100 };
    const result = applyGen1BadgeBoosts(stats, {});
    expect(result).toEqual(stats);
  });

  it("given an odd stat value with boulder badge, when applying badge boosts, then result is floored correctly", () => {
    // Source: pret/pokered engine/battle/core.asm — integer floor on badge boost
    // floor(77 * 9 / 8) = floor(86.625) = 86 (verifies floor behavior on non-clean division)
    const stats = { hp: 100, attack: 77, defense: 100, speed: 100, spAttack: 100, spDefense: 100 };
    const result = applyGen1BadgeBoosts(stats, { boulder: true });
    expect(result.attack).toBe(86);
  });

  it("given a large stat value with soul badge, when applying badge boosts, then result is capped at MAX_STAT_VALUE (999)", () => {
    // Source: pret/pokered engine/battle/core.asm — ApplyBadgeStatBoosts caps at MAX_STAT_VALUE (999)
    // floor(999 * 9 / 8) = floor(1123.875) = 1123, but capped at 999
    const stats = { hp: 100, attack: 100, defense: 100, speed: 999, spAttack: 100, spDefense: 100 };
    const result = applyGen1BadgeBoosts(stats, { soul: true });
    expect(result.speed).toBe(999);
  });
});

// ============================================================================
// Gen 1 Badge Boosts via Gen1Ruleset constructor
// ============================================================================

describe("Gen1Ruleset constructor badgeBoosts option", () => {
  it("given badgeBoosts config with boulder badge, when calculateStats is called, then attack is boosted by 9/8", () => {
    // Source: pret/pokered engine/battle/core.asm — badge boosts applied after stat calculation
    // Pikachu (speciesId 25): base Attack = 55
    // With DVs = 15, stat EXP = 0, level 50:
    //   Attack = floor(((55 + 15) * 2 + 0) * 50 / 100) + 5 = floor(7000/100) + 5 = 70 + 5 = 75
    // With Boulder badge: floor(75 * 9 / 8) = floor(84.375) = 84
    const rulesetWithBadge = new Gen1Ruleset({ badgeBoosts: { boulder: true } });
    const rulesetNoBadge = new Gen1Ruleset();

    const pokemon = {
      uid: "test-uid",
      speciesId: GEN1_SPECIES_IDS.pikachu,
      nickname: null,
      level: 50,
      experience: 0,
      nature: HARDY_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    } as PokemonInstance;

    const species = PIKACHU_SPECIES;

    const statsNoBadge = rulesetNoBadge.calculateStats(pokemon, species);
    const statsWithBadge = rulesetWithBadge.calculateStats(pokemon, species);

    // Without badge: Attack = floor(((55+15)*2+0)*50/100) + 5 = 75
    expect(statsNoBadge.attack).toBe(75);
    // With boulder badge: floor(75 * 9/8) = floor(84.375) = 84
    expect(statsWithBadge.attack).toBe(84);
    // Other stats should be unchanged
    expect(statsWithBadge.defense).toBe(statsNoBadge.defense);
    expect(statsWithBadge.speed).toBe(statsNoBadge.speed);
    expect(statsWithBadge.spAttack).toBe(statsNoBadge.spAttack);
    expect(statsWithBadge.hp).toBe(statsNoBadge.hp);
  });

  it("given no badgeBoosts option, when calculateStats is called, then stats match base calculation", () => {
    // Source: pret/pokered — default (no badges) should produce identical stats
    const rulesetDefault = new Gen1Ruleset();
    const rulesetExplicitNone = new Gen1Ruleset({});

    const pokemon = {
      uid: "test-uid",
      speciesId: GEN1_SPECIES_IDS.charizard,
      nickname: null,
      level: 50,
      experience: 0,
      nature: HARDY_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    } as PokemonInstance;

    const species = CHARIZARD_SPECIES;

    const statsDefault = rulesetDefault.calculateStats(pokemon, species);
    const statsExplicitNone = rulesetExplicitNone.calculateStats(pokemon, species);

    expect(statsDefault).toEqual(statsExplicitNone);
  });

  it("given all four badges with Charizard, when calculateStats is called, then all combat stats are boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — full badge boost verification
    // Charizard L50, DVs=15, StatEXP=0, base stats: Atk=84, Def=78, Spe=100, Spc=85
    // (pokered data/pokemon/base_stats/charizard.asm — spc=85, not 109 which is Gen 2+ SpAtk)
    const rulesetAllBadges = new Gen1Ruleset({
      badgeBoosts: { boulder: true, thunder: true, soul: true, volcano: true },
    });

    const pokemon = {
      uid: "test-uid",
      speciesId: GEN1_SPECIES_IDS.charizard,
      nickname: null,
      level: 50,
      experience: 0,
      nature: HARDY_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: CORE_ABILITY_IDS.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
      calculatedStats: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    } as PokemonInstance;

    const species = CHARIZARD_SPECIES;

    const stats = rulesetAllBadges.calculateStats(pokemon, species);

    // Base stats (no badges, DVs=15, StatEXP=0, L50):
    //   HP DV = ((15&1)<<3)|((15&1)<<2)|((15&1)<<1)|(15&1) = 8|4|2|1 = 15
    //   HP = floor(((78+15)*2+0)*50/100) + 50 + 10 = floor(93*100/100) + 60 = 93 + 60 = 153
    //   Attack = floor(((84+15)*2+0)*50/100) + 5 = floor(99*100/100) + 5 = 99 + 5 = 104
    //   Defense = floor(((78+15)*2+0)*50/100) + 5 = floor(93*100/100) + 5 = 93 + 5 = 98
    //   Speed = floor(((100+15)*2+0)*50/100) + 5 = floor(115*100/100) + 5 = 115 + 5 = 120
    //   Special = floor(((85+15)*2+0)*50/100) + 5 = floor(100*100/100) + 5 = 100 + 5 = 105

    // With all badges:
    //   Attack: floor(104 * 9/8) = floor(117) = 117
    expect(stats.attack).toBe(117);
    //   Defense: floor(98 * 9/8) = floor(110.25) = 110
    expect(stats.defense).toBe(110);
    //   Speed: floor(120 * 9/8) = floor(135) = 135
    expect(stats.speed).toBe(135);
    //   SpAttack: floor(105 * 9/8) = floor(118.125) = 118
    expect(stats.spAttack).toBe(118);
    //   SpDefense: floor(105 * 9/8) = floor(118.125) = 118
    expect(stats.spDefense).toBe(118);
    //   HP: unchanged (badges never boost HP)
    expect(stats.hp).toBe(153);
  });
});

// ============================================================================
// Critical Hit via Ruleset (rollCritical)
// ============================================================================

describe("Gen1Ruleset rollCritical", () => {
  it("given a physical move, when rolling crit, then uses speed-based formula", () => {
    // Arrange
    const attacker = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        speciesId: GEN1_SPECIES_IDS.pikachu, // Pikachu
      } as PokemonInstance,
    });
    const move = createScenarioMove({ category: MOVE_CATEGORIES.physical });
    const state = makeBattleState();

    // Source: pokered engine/battle/core.asm CriticalHitTest — threshold = floor(baseSpeed/2) for normal moves; BattleRandom() × 8 mod 256 < threshold → crit
    // Act: Run many trials, crit rate should be roughly baseSpeed/512
    // Pikachu base speed = 90, so crit rate = floor(90/2)/256 = 45/256 ~ 17.6%
    let crits = 0;
    const trials = 10000;
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRandom(i);
      if (ruleset.rollCritical({ attacker, move, state, rng })) crits++;
    }
    // Assert: Should be roughly 17.6% with tolerance
    const critRate = crits / trials;
    expect(critRate).toBeGreaterThan(0.1);
    expect(critRate).toBeLessThan(0.25);
  });
});

// ============================================================================
// EXP Gain
// ============================================================================

describe("Gen1Ruleset calculateExpGain", () => {
  it("given a defeated species with known base EXP, when calculating EXP gain, then returns positive value", () => {
    // Arrange
    const context = {
      defeatedSpecies: {
        baseExp: 64,
      } as PokemonSpeciesData,
      defeatedLevel: 25,
      participantLevel: 50,
      isTrainerBattle: true,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    };
    // Act
    const exp = ruleset.calculateExpGain(context);
    // Assert
    // Source: pret/pokeemerald src/battle_script_commands.c calculateExpGainClassic
    //   exp = floor(floor(floor(64*25/7)/1)*1.5) = floor(floor(228)/1*1.5) = floor(342) = 342
    expect(exp).toBe(342);
    expect(Number.isInteger(exp)).toBe(true);
  });

  it("given a wild battle vs trainer battle, when calculating EXP, then trainer battle gives 1.5x", () => {
    // Arrange
    const baseContext = {
      defeatedSpecies: { baseExp: 64 } as PokemonSpeciesData,
      defeatedLevel: 30,
      participantLevel: 50,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
    };
    // Act
    const wildExp = ruleset.calculateExpGain({ ...baseContext, isTrainerBattle: false });
    const trainerExp = ruleset.calculateExpGain({ ...baseContext, isTrainerBattle: true });
    // Assert
    expect(trainerExp).toBeGreaterThan(wildExp);
  });

  it("given a traded Pokemon (isTradedPokemon=true), when calculateExpGain, then returns 1.5x EXP bonus", () => {
    // Source: pret/pokered — Gen 1 trade mechanic: traded Pokemon receive 1.5x EXP
    // (Language tracking not available in Gen 1 — only 1.5x same-language bonus modeled)
    // Formula: floor((b * L_d / 7) / s * t) → then floor(result * 1.5)
    // b=64, L_d=25, s=1, t=1.0:
    //   step1 = floor(64 * 25 / 7) = floor(1600 / 7) = floor(228.57) = 228
    //   step2 = floor(228 / 1)     = 228
    //   step3 = floor(228 * 1.0)   = 228
    //   traded: floor(228 * 1.5)   = 342
    const context = {
      defeatedSpecies: { baseExp: 64 } as PokemonSpeciesData,
      defeatedLevel: 25,
      participantLevel: 50,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: false,
    };
    // Act
    const tradedExp = ruleset.calculateExpGain(context);
    const notTradedExp = ruleset.calculateExpGain({ ...context, isTradedPokemon: false });
    // Assert
    expect(tradedExp).toBe(342);
    expect(notTradedExp).toBe(228);
    expect(tradedExp).toBeGreaterThan(notTradedExp);
  });

  it("given a traded Pokemon with isInternationalTrade=true in Gen 1, when calculateExpGain, then still returns 1.5x (no international concept in Gen 1)", () => {
    // Source: pret/pokered — Gen 1 cartridges have no language field; international trade
    // is not detectable, so only the standard 1.5x traded bonus applies regardless.
    // b=64, L_d=25, s=1, t=1.0 → base=228; floor(228 * 1.5) = 342
    const context = {
      defeatedSpecies: { baseExp: 64 } as PokemonSpeciesData,
      defeatedLevel: 25,
      participantLevel: 50,
      isTrainerBattle: false,
      participantCount: 1,
      hasLuckyEgg: false,
      hasExpShare: false,
      affectionBonus: false,
      isTradedPokemon: true,
      isInternationalTrade: true, // Gen 1 ignores this flag
    };
    // Act
    const result = ruleset.calculateExpGain(context);
    // Assert — same as same-language: 1.5x only
    expect(result).toBe(342);
  });
});

// ============================================================================
// Gen 1 checkFullParalysis (63/256 rate)
// ============================================================================

describe("Gen1Ruleset checkFullParalysis (63/256 Gen 1 rate)", () => {
  it("given Gen 1 rules and rng producing 62 (< 63), when checkFullParalysis called, then returns true (63/256 rate)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.paralysis as PrimaryStatus,
      } as PokemonInstance,
    });
    // Mock RNG: int(0, 255) returns 62 → 62 < 63 → true
    const rng = {
      next: () => 0,
      int: (_min: number, _max: number) => 62,
      chance: () => true,
    } as unknown as SeededRandom;

    // Act
    const result = ruleset.checkFullParalysis(pokemon, rng);

    // Source: pokered engine/battle/core.asm CheckPlayerStatusConditions .ParalysisCheck — BattleRandom() < 63 (25*$ff/100) → paralyzed
    // Assert
    expect(result).toBe(true);
  });

  it("given Gen 1 rules and rng producing 63 (not < 63), when checkFullParalysis called, then returns false", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.paralysis as PrimaryStatus,
      } as PokemonInstance,
    });
    // Mock RNG: int(0, 255) returns 63 → 63 < 63 → false
    const rng = {
      next: () => 0.9999,
      int: (_min: number, _max: number) => 63,
      chance: () => false,
    } as unknown as SeededRandom;

    // Act
    const result = ruleset.checkFullParalysis(pokemon, rng);

    // Source: pokered engine/battle/core.asm CheckPlayerStatusConditions .ParalysisCheck — BattleRandom() < 63 → paralyzed; 63 is not < 63 → not paralyzed
    // Assert
    expect(result).toBe(false);
  });

  it("given Gen 1 rules, when checkFullParalysis is called many times, then paralysis rate is ~24.6% (63/256)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.paralysis as PrimaryStatus,
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);

    // Act
    let paralyzed = 0;
    for (let i = 0; i < 1000; i++) {
      if (ruleset.checkFullParalysis(pokemon, rng)) paralyzed++;
    }

    // Source: pokered engine/battle/core.asm CheckPlayerStatusConditions .ParalysisCheck — BattleRandom() < 25*$ff/100 = 63 → fully paralyzed (63/256 ≈ 24.6%)
    // Assert — ~63/256 ≈ 24.6%, allow tolerance
    expect(paralyzed).toBeGreaterThan(180);
    expect(paralyzed).toBeLessThan(310);
  });
});

// ============================================================================
// Gen 1 processSleepTurn (cannot act on wake turn)
// ============================================================================

describe("Gen1Ruleset processSleepTurn (Gen 1: cannot act on wake turn)", () => {
  it("given Gen 1 rules and a pokemon with turnsLeft = 1, when processSleepTurn called, then wakes up but returns false (cannot act on wake turn)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.sleep as PrimaryStatus,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 1 });

    // Act
    const canAct = ruleset.processSleepTurn(pokemon, makeBattleState());

    // Source: pokered engine/battle/core.asm CheckPlayerStatusConditions .WakeUp — on wake (counter=0), still jumps to ExecutePlayerMoveDone; cannot act on wake turn
    // Assert — Gen 1: cannot act on the wake turn (returns false even on wake)
    expect(canAct).toBe(false);
    expect(pokemon.pokemon.status).toBeNull();
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(false);
  });

  it("given Gen 1 rules and a pokemon with turnsLeft > 1, when processSleepTurn called, then stays sleeping and returns false", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.sleep as PrimaryStatus,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 3 });

    // Act
    const canAct = ruleset.processSleepTurn(pokemon, makeBattleState());

    // Assert — still sleeping, counter decremented
    expect(canAct).toBe(false);
    expect(pokemon.pokemon.status).toBe(CORE_STATUS_IDS.sleep);
    expect(pokemon.volatileStatuses.get(CORE_VOLATILE_IDS.sleepCounter)?.turnsLeft).toBe(2);
  });

  it("given Gen 1 rules and a pokemon with turnsLeft = 0, when processSleepTurn called, then wakes up but returns false (cannot act)", () => {
    // Arrange
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        status: CORE_STATUS_IDS.sleep as PrimaryStatus,
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set(CORE_VOLATILE_IDS.sleepCounter, { turnsLeft: 0 });

    // Act
    const canAct = ruleset.processSleepTurn(pokemon, makeBattleState());

    // Source: pokered engine/battle/core.asm CheckPlayerStatusConditions .WakeUp — on wake (counter=0), still jumps to ExecutePlayerMoveDone; cannot act on wake turn
    // Assert — Gen 1: wakes up but still cannot act this turn
    expect(canAct).toBe(false);
    expect(pokemon.pokemon.status).toBeNull();
    expect(pokemon.volatileStatuses.has(CORE_VOLATILE_IDS.sleepCounter)).toBe(false);
  });
});

// ============================================================================
// Badge Boost Glitch — applyBadgeBoostGlitch and Gen1Ruleset.onStatStageChange
// ============================================================================

describe("badge boost glitch", () => {
  // ─── applyBadgeBoostGlitch unit tests ────────────────────────────────────

  it("given boulder badge and base attack 100, when applyBadgeBoostGlitch called for attack, then attack becomes 112", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts: floor(100 * 9 / 8) = 112
    // Given: a pokemon whose calculatedStats.attack was already boosted to 100
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // When: badge boost glitch is applied (BadgeStatBoosts iterates all badge/stat pairs)
    applyBadgeBoostGlitch(pokemon, { boulder: true });
    // Then: attack is re-multiplied × 9/8 (floor) => floor(100 * 9 / 8) = 112
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(112);
    expect(pokemon.pokemon.calculatedStats?.defense).toBe(60); // unchanged
  });

  it("given boulder badge already applied once (attack=112), when applyBadgeBoostGlitch called again, then attack becomes 126", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts compounds on re-call
    // Simulates: initial badge boost brought attack to 112, then a stat stage change triggers
    // another BadgeStatBoosts call → floor(112 * 9 / 8) = 126
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 112,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // When: badge boost glitch is applied (simulating a stat stage change)
    applyBadgeBoostGlitch(pokemon, { boulder: true });
    // Then: floor(112 * 9 / 8) = floor(126) = 126
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(126);
  });

  it("given three stat stage changes with boulder badge (attack starts at 100), when glitch applied 3 times, then attack compounds correctly", () => {
    // Source: pret/pokered engine/battle/core.asm — Swords Dance ×3 triggers 3 BadgeStatBoosts calls
    // Round 1: floor(100 * 9/8) = 112
    // Round 2: floor(112 * 9/8) = floor(126) = 126
    // Round 3: floor(126 * 9/8) = floor(141.75) = 141
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    applyBadgeBoostGlitch(pokemon, { boulder: true });
    applyBadgeBoostGlitch(pokemon, { boulder: true });
    applyBadgeBoostGlitch(pokemon, { boulder: true });
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(141);
  });

  it("given a stat near 999 with soul badge, when applyBadgeBoostGlitch called for speed, then speed is capped at 999", () => {
    // Source: pret/pokered engine/battle/core.asm — ApplyBadgeStatBoosts caps at MAX_STAT_VALUE (999)
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 995,
        },
      } as PokemonInstance,
    });
    // When: soul badge glitch is applied (floor(995 * 9/8) = 1119, capped to 999)
    applyBadgeBoostGlitch(pokemon, { soul: true });
    expect(pokemon.pokemon.calculatedStats?.speed).toBe(999);
  });

  it("given volcano badge and spAttack stage change, when applyBadgeBoostGlitch called, then both spAttack and spDefense are boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — Gen 1 unified Special: Volcano Badge boosts
    // both spAttack and spDefense together when Special stat stage changes
    // floor(100 * 9/8) = 112
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      } as PokemonInstance,
    });
    applyBadgeBoostGlitch(pokemon, { volcano: true });
    expect(pokemon.pokemon.calculatedStats?.spAttack).toBe(112);
    expect(pokemon.pokemon.calculatedStats?.spDefense).toBe(112);
  });

  it("given volcano badge, when applyBadgeBoostGlitch called, then both spAttack and spDefense are boosted regardless of which stat changed", () => {
    // Source: pret/pokered engine/battle/core.asm — unified Special covers spDefense key too
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 100,
          spDefense: 100,
          speed: 120,
        },
      } as PokemonInstance,
    });
    applyBadgeBoostGlitch(pokemon, { volcano: true });
    expect(pokemon.pokemon.calculatedStats?.spAttack).toBe(112);
    expect(pokemon.pokemon.calculatedStats?.spDefense).toBe(112);
  });

  it("given only boulder badge, when applyBadgeBoostGlitch called, then defense is unchanged but attack is re-boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts iterates ALL badge/stat pairs.
    // Boulder Badge re-boosts attack regardless of which stat changed.
    // No thunder badge → defense is NOT affected.
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 80,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    applyBadgeBoostGlitch(pokemon, { boulder: true });
    expect(pokemon.pokemon.calculatedStats?.defense).toBe(80); // no thunder badge — unchanged
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(112); // boulder badge re-boosts attack always
  });

  // ─── Gen1Ruleset.onStatStageChange integration tests ─────────────────────

  it("given badgeBoostGlitch enabled with boulder badge, when onStatStageChange called for attack, then calculatedStats.attack is re-boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts hook fires on stat stage change
    // Given: ruleset with glitch enabled, pokemon with attack already at 112 (one prior boost)
    const glitchRuleset = new Gen1Ruleset({
      badgeBoosts: { boulder: true },
      badgeBoostGlitch: true,
    });
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 112,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // Pokemon must be on side 0 — badge boosts are a single-player mechanic
    const state = makeBattleState({ side0Active: pokemon });
    // When: a stat stage change occurs
    glitchRuleset.onStatStageChange(pokemon, CORE_STAT_IDS.attack, 1, state);
    // Then: attack is re-multiplied floor(112 * 9/8) = 126
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(126);
  });

  it("given badgeBoostGlitch enabled with all 4 badges, when onStatStageChange called for any stat, then ALL badge-eligible stats are re-boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts iterates ALL 4 badge/stat pairs,
    // not just the stat that changed. Every call re-boosts every badge-eligible stat.
    const glitchRuleset = new Gen1Ruleset({
      badgeBoosts: { boulder: true, thunder: true, soul: true, volcano: true },
      badgeBoostGlitch: true,
    });
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 100,
          spAttack: 100,
          spDefense: 100,
          speed: 100,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState({ side0Active: pokemon });
    // When: ANY stat stage changes (here: attack), BadgeStatBoosts runs all pairs
    glitchRuleset.onStatStageChange(pokemon, CORE_STAT_IDS.attack, 1, state);
    // Then: all badge-eligible stats are re-boosted — floor(100 * 9/8) = 112 each
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(112); // boulder
    expect(pokemon.pokemon.calculatedStats?.defense).toBe(112); // thunder
    expect(pokemon.pokemon.calculatedStats?.speed).toBe(112); // soul
    expect(pokemon.pokemon.calculatedStats?.spAttack).toBe(112); // volcano
    expect(pokemon.pokemon.calculatedStats?.spDefense).toBe(112); // volcano (unified Special)
  });

  it("given badgeBoostGlitch enabled with boulder badge, when onStatStageChange called for opponent pokemon (side 1), then attack is NOT re-boosted", () => {
    // Source: pret/pokered engine/battle/core.asm — BadgeStatBoosts only runs for the player's pokemon,
    // not the opponent's. Badge boosts are a single-player mechanic.
    const glitchRuleset = new Gen1Ruleset({
      badgeBoosts: { boulder: true },
      badgeBoostGlitch: true,
    });
    const opponentPokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    // Opponent pokemon is on side 1, not side 0
    const state = makeBattleState({ side1Active: opponentPokemon });
    glitchRuleset.onStatStageChange(opponentPokemon, CORE_STAT_IDS.attack, 1, state);
    // Badge glitch does NOT apply to opponent — attack stays at 100
    expect(opponentPokemon.pokemon.calculatedStats?.attack).toBe(100);
  });

  it("given badgeBoosts set but badgeBoostGlitch NOT enabled, when onStatStageChange called, then calculatedStats are NOT modified", () => {
    // Source: pret/pokered — opt-in glitch simulation: without badgeBoostGlitch: true, no compounding
    const rulesetNoGlitch = new Gen1Ruleset({ badgeBoosts: { boulder: true } });
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
        calculatedStats: {
          hp: 100,
          attack: 112,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      } as PokemonInstance,
    });
    const state = makeBattleState();
    rulesetNoGlitch.onStatStageChange(pokemon, CORE_STAT_IDS.attack, 1, state);
    // No compounding without the glitch flag
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(112);
  });

  it("given badgeBoostGlitch enabled but NO badgeBoosts, when onStatStageChange called, then calculatedStats are unchanged", () => {
    // Source: pret/pokered — no badges means BadgeStatBoosts is a no-op
    const rulesetNoBadges = new Gen1Ruleset({ badgeBoostGlitch: true });
    const pokemon = createActivePokemonFixture({
      pokemon: {
        ...createActivePokemonFixture().pokemon,
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
    const state = makeBattleState();
    rulesetNoBadges.onStatStageChange(pokemon, CORE_STAT_IDS.attack, 1, state);
    expect(pokemon.pokemon.calculatedStats?.attack).toBe(80);
  });
});
