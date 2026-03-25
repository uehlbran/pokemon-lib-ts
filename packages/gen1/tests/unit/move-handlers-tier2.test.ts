import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
  CORE_ABILITY_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  SeededRandom,
  createMoveSlot,
  createPokemonInstance,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen1DataManager, GEN1_MOVE_IDS, GEN1_SPECIES_IDS } from "../../src";
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
const DEFAULT_NATURE = ALL_NATURES[0]!.id;

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

function makeSyntheticMove(overrides: Partial<MoveData> = {}): MoveData {
  const baseMove = GEN1_DATA.getMove(MOVE_IDS.tackle);
  return {
    ...baseMove,
    id: overrides.id ?? "test-move",
    displayName: overrides.displayName ?? baseMove.displayName,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    accuracy: overrides.accuracy ?? baseMove.accuracy,
    pp: overrides.pp ?? baseMove.pp,
    priority: overrides.priority ?? baseMove.priority,
    target: overrides.target ?? baseMove.target,
    flags: overrides.flags ?? DEFAULT_MOVE_FLAGS,
    effect: overrides.effect ?? baseMove.effect,
    description: overrides.description ?? baseMove.description,
    generation: overrides.generation ?? baseMove.generation,
    ...overrides,
  };
}

function makeCanonicalMove(moveId: string, overrides: Partial<MoveData> = {}): MoveData {
  const move = GEN1_DATA.getMove(moveId);
  return {
    ...move,
    ...overrides,
    id: moveId,
    displayName: overrides.displayName ?? move.displayName,
    type: overrides.type ?? move.type,
    category: overrides.category ?? move.category,
    power: overrides.power ?? move.power,
    accuracy: overrides.accuracy ?? move.accuracy,
    pp: overrides.pp ?? move.pp,
    priority: overrides.priority ?? move.priority,
    target: overrides.target ?? move.target,
    flags: overrides.flags ?? move.flags,
    effect: overrides.effect ?? move.effect,
    description: overrides.description ?? move.description,
    generation: overrides.generation ?? move.generation,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const species = GEN1_DATA.getSpecies(DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(1), {
    nature: DEFAULT_NATURE,
    gender: "male",
    abilitySlot: "normal1",
    heldItem: null,
    moves: [],
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
    types: DEFAULT_SPECIES.types,
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
    ended: false,
    winner: null,
  } as BattleState;
}

function makeMoveEffectContext(overrides: Partial<MoveEffectContext> = {}): MoveEffectContext {
  const rng = new SeededRandom(42);
  return {
    attacker: makeActivePokemon(),
    defender: makeActivePokemon({ types: [TYPE_IDS.normal] }),
    move: makeSyntheticMove(),
    damage: 0,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Rest tests
// ============================================================================

describe("Gen 1 Rest handler", () => {
  const restMove = makeCanonicalMove(MOVE_IDS.rest);

  it('given attacker is at full HP and has no status, when rest is used, then messages includes "But it failed!"', () => {
    // Arrange — full HP (currentHp === calculatedStats.hp), no status
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
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
    const context = makeMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker is at full HP and has no status, when rest is used, then no status is inflicted on self", () => {
    // Arrange
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
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
    const context = makeMoveEffectContext({ move: restMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.selfStatusInflicted).toBeUndefined();
  });

  it("given attacker is at half HP with no status, when rest is used, then statusCuredOnly=attacker + healAmount=maxHp + selfStatusInflicted=sleep + sleepTurns=2", () => {
    // Arrange — half HP, no status
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
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
    const context = makeMoveEffectContext({ move: restMove, attacker, damage: 0 });
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
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
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
    const context = makeMoveEffectContext({ move: restMove, attacker, damage: 0 });
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
    const attacker = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
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
    const context = makeMoveEffectContext({ move: restMove, attacker, damage: 0 });
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
  const mistMove = makeCanonicalMove(MOVE_IDS.mist);

  it("given attacker has no mist volatile, when mist is used, then selfVolatileInflicted=mist and turnsLeft=-1 (permanent)", () => {
    // Arrange
    // Source: pret/pokered — Mist is SUBSTATUS_MIST, permanent until switch-out or Haze (no turn counter in Gen 1)
    const attacker = makeActivePokemon({
      volatileStatuses: new Map(), // no mist
    });
    const context = makeMoveEffectContext({ move: mistMove, attacker, damage: 0 });
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
    const attacker = makeActivePokemon({
      volatileStatuses: mistStatuses,
    });
    const context = makeMoveEffectContext({ move: mistMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages).toContain("But it failed!");
    expect(result.selfVolatileInflicted).toBeUndefined();
  });

  it("given mist is used successfully, when executeMoveEffect called, then no statusInflicted on defender", () => {
    // Arrange
    const context = makeMoveEffectContext({ move: mistMove, damage: 0 });
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
  const conversionMove = makeCanonicalMove(MOVE_IDS.conversion);

  it("given defender is Water type, when conversion is used, then typeChange target=attacker types=[water]", () => {
    // Arrange
    const defender = makeActivePokemon({
      types: [TYPE_IDS.water],
    });
    const context = makeMoveEffectContext({ move: conversionMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.typeChange).toEqual({ target: "attacker", types: [TYPE_IDS.water] });
  });

  it("given defender is Fire/Flying dual type, when conversion is used, then typeChange types=[fire, flying]", () => {
    // Arrange
    const defender = makeActivePokemon({
      types: [TYPE_IDS.fire, TYPE_IDS.flying],
    });
    const context = makeMoveEffectContext({ move: conversionMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.typeChange).toEqual({ target: "attacker", types: [TYPE_IDS.fire, TYPE_IDS.flying] });
  });

  it("given conversion is used, when executeMoveEffect called, then no status or stat changes", () => {
    // Arrange
    const defender = makeActivePokemon({ types: [TYPE_IDS.grass] });
    const context = makeMoveEffectContext({ move: conversionMove, defender, damage: 0 });
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
  const growlMove = makeCanonicalMove(MOVE_IDS.growl);

  it("given defender has mist, when growl is used (foe attack drop), then stat change is blocked", () => {
    // Arrange — defender protected by Mist
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: 4 });
    const defender = makeActivePokemon({
      types: [TYPE_IDS.normal],
      volatileStatuses: mistStatuses,
    });
    const context = makeMoveEffectContext({ move: growlMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — stat drop should be blocked
    expect(result.statChanges).toHaveLength(0);
  });

  it("given defender has mist, when growl is used, then message includes protection by mist", () => {
    // Arrange
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: 4 });
    const defender = makeActivePokemon({
      pokemon: {
        ...makeActivePokemon().pokemon,
        nickname: "Rattata",
      } as PokemonInstance,
      types: [TYPE_IDS.normal],
      volatileStatuses: mistStatuses,
    });
    const context = makeMoveEffectContext({ move: growlMove, defender, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert
    expect(result.messages.some((m) => m.includes(VOLATILE_IDS.mist))).toBe(true);
  });

  it("given defender has no mist, when growl is used, then stat drop is applied normally", () => {
    // Arrange — no mist
    const context = makeMoveEffectContext({ move: growlMove, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — should have the attack drop
    expect(result.statChanges.length).toBeGreaterThan(0);
    expect(result.statChanges[0]).toMatchObject({ target: "defender", stat: "attack", stages: -1 });
  });

  it("given defender has mist, when a self-stat-drop move is used (target=self), then it is NOT blocked by mist", () => {
    // Arrange — Mist only blocks FOE stat drops, not self-inflicted drops
    const mistStatuses = new Map();
    mistStatuses.set(VOLATILE_IDS.mist, { turnsLeft: 4 });
    const attacker = makeActivePokemon({
      volatileStatuses: mistStatuses,
    });
    // A move that drops attacker's own defense (e.g., Close Combat — but we simulate it)
    const selfDropMove = makeSyntheticMove({
      id: "self-drop-test",
      displayName: "Self Drop",
      type: TYPE_IDS.normal,
      category: "status",
      target: "self",
      effect: {
        type: "stat-change" as const,
        target: "self",
        changes: [{ stat: "defense" as const, stages: -1 }],
      },
    });
    const context = makeMoveEffectContext({ move: selfDropMove, attacker, damage: 0 });
    // Act
    const result = ruleset.executeMoveEffect(context);
    // Assert — self-targeted drops are NOT blocked by Mist
    expect(result.statChanges.some((c) => c.target === "attacker" && c.stages < 0)).toBe(true);
  });
});
