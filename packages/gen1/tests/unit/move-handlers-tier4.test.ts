import type {
  ActivePokemon,
  BattleConfig,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import { BattleEngine } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import {
  ALL_NATURES,
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
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen1DataManager,
  GEN1_MOVE_IDS,
  GEN1_NATURE_IDS,
  GEN1_SPECIES_IDS,
  Gen1Ruleset,
} from "../../src";

/**
 * Gen 1 Tier 4 Move Handler Tests
 *
 * Tests for Rage, Mimic, Mirror Move, Metronome, Transform, Bide,
 * Thrash/Petal Dance, and Hyper Beam substitute-break behavior.
 * Source: pret/pokered — cartridge-accurate behavior.
 */

// --- Test Helpers ---

const ruleset = new Gen1Ruleset();
const dataManager = createGen1DataManager();
const DEFAULT_MOVE = dataManager.getMove(GEN1_MOVE_IDS.tackle);
const DEFAULT_THUNDERBOLT = dataManager.getMove(GEN1_MOVE_IDS.thunderbolt);
const DEFAULT_PIKACHU = dataManager.getSpecies(GEN1_SPECIES_IDS.pikachu);
const DEFAULT_HARDY_NATURE = ALL_NATURES[0]!.id ?? GEN1_NATURE_IDS.hardy;
const DEFAULT_TACKLE_SLOT = createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp);
const DEFAULT_THUNDERBOLT_SLOT = createMoveSlot(DEFAULT_THUNDERBOLT.id, DEFAULT_THUNDERBOLT.pp);
const RAGE_MOVE = dataManager.getMove(GEN1_MOVE_IDS.rage);
const MIMIC_MOVE = dataManager.getMove(GEN1_MOVE_IDS.mimic);
const MIRROR_MOVE = dataManager.getMove(GEN1_MOVE_IDS.mirrorMove);
const METRONOME_MOVE = dataManager.getMove(GEN1_MOVE_IDS.metronome);
const TRANSFORM_MOVE = dataManager.getMove(GEN1_MOVE_IDS.transform);
const BIDE_MOVE = dataManager.getMove(GEN1_MOVE_IDS.bide);
const THRASH_MOVE = dataManager.getMove(GEN1_MOVE_IDS.thrash);
const PETAL_DANCE_MOVE = dataManager.getMove(GEN1_MOVE_IDS.petalDance);
const HYPER_BEAM_MOVE = dataManager.getMove(GEN1_MOVE_IDS.hyperBeam);

function getCanonicalMove(moveId: (typeof GEN1_MOVE_IDS)[keyof typeof GEN1_MOVE_IDS]): MoveData {
  return dataManager.getMove(moveId);
}

function createSyntheticOnFieldPokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const pokemon = createPokemonInstance(DEFAULT_PIKACHU, 50, new SeededRandom(1), {
    nature: DEFAULT_HARDY_NATURE,
    ivs: createDvs(),
    evs: createStatExp(),
    moves: [],
    friendship: createFriendship(70),
    heldItem: null,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "pallet-town",
    originalTrainer: "Red",
    originalTrainerId: 12345,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.moves = [DEFAULT_TACKLE_SLOT, DEFAULT_THUNDERBOLT_SLOT];
  pokemon.currentHp = 100;
  pokemon.ability = "";
  pokemon.calculatedStats = {
    hp: 100,
    attack: 80,
    defense: 60,
    spAttack: 80,
    spDefense: 60,
    speed: 120,
  };

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...DEFAULT_PIKACHU.types] as PokemonType[],
    ability: "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    forcedMove: null,
    ...overrides,
  } as ActivePokemon;
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
    defender: createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] }),
    move: getCanonicalMove(GEN1_MOVE_IDS.tackle),
    damage: 0,
    state: createBattleState(),
    rng,
    ...overrides,
  };
}

// ============================================================================
// Rage tests
// ============================================================================

describe("Gen 1 Rage handler", () => {
  const rageMove = RAGE_MOVE;

  it("given the effect is used for the first time, when checking result, then the volatile is applied and forcedMoveSet locks the move", () => {
    // Source: pret/pokered RageEffect — first use sets the rage volatile
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          { moveId: GEN1_MOVE_IDS.rage, currentPP: 20, maxPP: 20, ppUps: 0 },
          {
            moveId: DEFAULT_MOVE.id,
            currentPP: DEFAULT_MOVE.pp,
            maxPP: DEFAULT_MOVE.pp,
            ppUps: 0,
          },
        ],
      } as PokemonInstance,
    });
    const context = createMoveEffectContext({ move: rageMove, attacker, damage: 10 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBe(GEN1_MOVE_IDS.rage);
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN1_MOVE_IDS.rage,
      volatileStatus: GEN1_MOVE_IDS.rage,
    });
  });

  it("given Rage volatile already active, when Rage used again, then forcedMoveSet re-locks but selfVolatileInflicted is null (already set)", () => {
    // Source: pret/pokered RageEffect — subsequent uses re-lock but don't re-set the volatile
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          { moveId: GEN1_MOVE_IDS.rage, currentPP: 20, maxPP: 20, ppUps: 0 },
          {
            moveId: DEFAULT_MOVE.id,
            currentPP: DEFAULT_MOVE.pp,
            maxPP: DEFAULT_MOVE.pp,
            ppUps: 0,
          },
        ],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set(GEN1_MOVE_IDS.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    const context = createMoveEffectContext({ move: rageMove, attacker, damage: 10 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBeUndefined();
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN1_MOVE_IDS.rage,
      volatileStatus: GEN1_MOVE_IDS.rage,
    });
  });

  it("given a Pokemon with rage volatile is hit, when onDamageReceived is called, then Attack stage increases by +1", () => {
    // Source: pret/pokered RageEffect — each hit boosts Attack +1 while Rage is active
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.volatileStatuses.set(GEN1_MOVE_IDS.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    defender.statStages.attack = 0;
    const state = createBattleState();
    const hitMove = getCanonicalMove(GEN1_MOVE_IDS.tackle);

    // Act
    ruleset.onDamageReceived(defender, 30, hitMove, state);

    // Assert
    expect(defender.statStages.attack).toBe(1);
  });

  it("given a raging Pokemon at +5 Attack hit twice, when onDamageReceived is called, then Attack caps at +6", () => {
    // Source: pret/pokered — stat stages cap at +6
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.volatileStatuses.set(GEN1_MOVE_IDS.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    defender.statStages.attack = 5;
    const state = createBattleState();
    const hitMove = getCanonicalMove(GEN1_MOVE_IDS.tackle);

    // Act — first hit: +5 -> +6
    ruleset.onDamageReceived(defender, 30, hitMove, state);
    expect(defender.statStages.attack).toBe(6);

    // Act — second hit: stays at +6
    ruleset.onDamageReceived(defender, 30, hitMove, state);
    expect(defender.statStages.attack).toBe(6);
  });
});

// ============================================================================
// Mimic tests
// ============================================================================

describe("Gen 1 Mimic handler", () => {
  const mimicMove = MIMIC_MOVE;

  it("given defender has used Thunderbolt last, when Mimic is used, then moveSlotChange replaces Mimic's slot with Thunderbolt at PP=5", () => {
    // Source: pret/pokered MimicEffect — copies defender's last used move, PP = 5
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          { moveId: GEN1_MOVE_IDS.mimic, currentPP: 10, maxPP: 10, ppUps: 0 },
          { moveId: GEN1_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: GEN1_MOVE_IDS.thunderbolt });
    const context = createMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.moveSlotChange).toEqual({
      slot: 0,
      newMoveId: GEN1_MOVE_IDS.thunderbolt,
      newPP: 5,
      originalMoveId: GEN1_MOVE_IDS.mimic,
    });
  });

  it("given defender has used Fire Blast last, when Mimic is used from slot 1, then moveSlotChange targets slot 1", () => {
    // Source: pret/pokered MimicEffect — copies into the slot Mimic occupies
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          { moveId: GEN1_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 },
          { moveId: GEN1_MOVE_IDS.mimic, currentPP: 10, maxPP: 10, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: GEN1_MOVE_IDS.fireBlast });
    const context = createMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.moveSlotChange).toEqual({
      slot: 1,
      newMoveId: GEN1_MOVE_IDS.fireBlast,
      newPP: 5,
      originalMoveId: GEN1_MOVE_IDS.mimic,
    });
  });

  it("given defender has not used a move, when Mimic is used, then it fails with 'But it failed!'", () => {
    // Source: pret/pokered MimicEffect — fails if no last move used
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.mimic, currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: null });
    const context = createMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.moveSlotChange).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender last used Mimic itself, when Mimic is used, then it fails", () => {
    // Source: pret/pokered MimicEffect — cannot Mimic Mimic
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.mimic, currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: GEN1_MOVE_IDS.mimic });
    const context = createMoveEffectContext({ move: mimicMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.messages).toContain("But it failed!");
  });

  it("given Mimic replaced a slot, when onSwitchOut is called, then the original move is restored", () => {
    // Source: pret/pokered — Mimic replacement reverts on switch-out
    // This tests the fallback path (no PP fields in volatile data → use base PP)
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          { moveId: GEN1_MOVE_IDS.thunderbolt, currentPP: 5, maxPP: 5, ppUps: 0 },
          { moveId: GEN1_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    pokemon.volatileStatuses.set("mimic-slot", {
      turnsLeft: -1,
      data: { slot: 0, originalMoveId: GEN1_MOVE_IDS.mimic },
    });
    const state = createBattleState();

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — mimic (PP 10) should be restored via base PP fallback
    // Source: pret/pokered — PP restored to max for the original move
    expect(pokemon.pokemon.moves[0]!.moveId).toBe(GEN1_MOVE_IDS.mimic);
    expect(pokemon.pokemon.moves[0]!.maxPP).toBe(10);
  });

  it("given Mimic replaced a slot with partial PP, when onSwitchOut is called, then original PP values are precisely restored", () => {
    // Source: pret/pokered — Mimic replacement reverts on switch-out preserving original PP
    // This tests the primary path where PP fields were stored in the volatile data by the handler.
    // Ensures a player who had spent some PP on Mimic gets the correct PP back, not a full restore.
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          { moveId: GEN1_MOVE_IDS.thunderbolt, currentPP: 5, maxPP: 5, ppUps: 0 }, // currently mimicked move
          { moveId: GEN1_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
      } as PokemonInstance,
    });
    // volatile data includes original PP values (as stored by the Mimic handler)
    pokemon.volatileStatuses.set("mimic-slot", {
      turnsLeft: -1,
      data: {
        slot: 0,
        originalMoveId: GEN1_MOVE_IDS.mimic,
        originalCurrentPP: 6,
        originalMaxPP: 10,
        originalPpUps: 1,
      },
    });
    const state = createBattleState();

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert — original move is restored with exact PP values from before Mimic was used
    expect(pokemon.pokemon.moves[0]!.moveId).toBe(GEN1_MOVE_IDS.mimic);
    expect(pokemon.pokemon.moves[0]!.currentPP).toBe(6);
    expect(pokemon.pokemon.moves[0]!.maxPP).toBe(10);
    expect(pokemon.pokemon.moves[0]!.ppUps).toBe(1);
  });
});

// ============================================================================
// Mirror Move tests
// ============================================================================

describe("Gen 1 Mirror Move handler", () => {
  const mirrorMoveMove = MIRROR_MOVE;

  it("given defender last used a move, when Mirror Move is used, then recursiveMove matches the last move used", () => {
    // Source: pret/pokered MirrorMoveEffect — executes the move the defender used last
    // Arrange
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: GEN1_MOVE_IDS.thunderbolt });
    const context = createMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBe(GEN1_MOVE_IDS.thunderbolt);
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given defender last used a different move, when Mirror Move is used from slot 1, then recursiveMove matches the copied move", () => {
    // Source: pret/pokered MirrorMoveEffect — copies whatever the defender used
    // Arrange
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: GEN1_MOVE_IDS.flamethrower });
    const context = createMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBe(GEN1_MOVE_IDS.flamethrower);
  });

  it("given defender has not used a move, when Mirror Move is used, then it fails", () => {
    // Source: pret/pokered MirrorMoveEffect — fails if no previous move
    // Arrange
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: null });
    const context = createMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender last used Mirror Move, when Mirror Move is used, then it fails (cannot mirror Mirror Move)", () => {
    // Source: pret/pokered MirrorMoveEffect — Mirror Move cannot copy itself
    // Arrange
    const defender = createSyntheticOnFieldPokemon({ lastMoveUsed: GEN1_MOVE_IDS.mirrorMove });
    const context = createMoveEffectContext({
      move: mirrorMoveMove,
      defender,
      damage: 0,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.messages).toContain("But it failed!");
  });
});

// ============================================================================
// Metronome tests
// ============================================================================

describe("Gen 1 Metronome handler", () => {
  const metronomeMove = METRONOME_MOVE;

  it("given Metronome is used with seed 100, when checking result, then recursiveMove matches the seeded selection", () => {
    // Source: pret/pokered MetronomeEffect — picks random move excluding Metronome and Struggle
    // With seed 100, rng.int(0, 162) = 33 which maps to GEN1_MOVE_IDS.bodySlam in the Gen 1 move pool
    // Arrange
    const rng = new SeededRandom(100);
    const context = createMoveEffectContext({ move: metronomeMove, damage: 0, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.recursiveMove).toBe(GEN1_MOVE_IDS.bodySlam);
  });

  it("given Metronome is used with seeds 1 and 999, when checking results, then different moves are selected deterministically", () => {
    // Source: pret/pokered MetronomeEffect — random selection from all Gen 1 moves
    // Seed 1 -> GEN1_MOVE_IDS.screech, Seed 999 -> GEN1_MOVE_IDS.conversion (verified via SeededRandom)
    // Arrange
    const rng1 = new SeededRandom(1);
    const rng2 = new SeededRandom(999);
    const context1 = createMoveEffectContext({ move: metronomeMove, damage: 0, rng: rng1 });
    const context2 = createMoveEffectContext({ move: metronomeMove, damage: 0, rng: rng2 });

    // Act
    const result1 = ruleset.executeMoveEffect(context1);
    const result2 = ruleset.executeMoveEffect(context2);

    // Assert — exact values from deterministic PRNG
    expect(result1.recursiveMove).toBe(GEN1_MOVE_IDS.screech);
    expect(result2.recursiveMove).toBe(GEN1_MOVE_IDS.conversion);
  });
});

// ============================================================================
// Transform tests
// ============================================================================

describe("Gen 1 Transform handler", () => {
  const transformMove = TRANSFORM_MOVE;

  it("given Transform is used, when checking result, then attacker copies defender's types, stats, and moves (PP=5)", () => {
    // Source: pret/pokered TransformEffect — copies types, stat stages, calculated stats (except HP), moves (PP=5)
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.electric],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          createMoveSlot(GEN1_MOVE_IDS.transform, dataManager.getMove(GEN1_MOVE_IDS.transform).pp),
          DEFAULT_TACKLE_SLOT,
        ],
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
    const defender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          createMoveSlot(
            GEN1_MOVE_IDS.flamethrower,
            dataManager.getMove(GEN1_MOVE_IDS.flamethrower).pp,
          ),
          createMoveSlot(GEN1_MOVE_IDS.fly, dataManager.getMove(GEN1_MOVE_IDS.fly).pp),
        ],
        calculatedStats: {
          hp: 150,
          attack: 100,
          defense: 90,
          spAttack: 110,
          spDefense: 90,
          speed: 100,
        },
      } as PokemonInstance,
    });
    defender.statStages.attack = 2;
    defender.statStages.speed = -1;
    const context = createMoveEffectContext({ move: transformMove, attacker, defender, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert — types copied via typeChange result
    expect(result.typeChange).toEqual({
      target: "attacker",
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
    });
    // Assert — stat stages copied directly on attacker
    expect(attacker.statStages.attack).toBe(2);
    expect(attacker.statStages.speed).toBe(-1);
    // Assert — calculated stats (except HP) copied
    expect(attacker.pokemon.calculatedStats!.attack).toBe(100);
    expect(attacker.pokemon.calculatedStats!.defense).toBe(90);
    expect(attacker.pokemon.calculatedStats!.spAttack).toBe(110);
    expect(attacker.pokemon.calculatedStats!.speed).toBe(100);
    // HP should NOT be copied
    expect(attacker.pokemon.calculatedStats!.hp).toBe(100);
    // Assert — moves copied with PP=5
    expect(attacker.pokemon.moves).toHaveLength(2);
    expect(attacker.pokemon.moves[0]!.moveId).toBe(GEN1_MOVE_IDS.flamethrower);
    expect(attacker.pokemon.moves[0]!.currentPP).toBe(5);
    expect(attacker.pokemon.moves[0]!.maxPP).toBe(5);
    expect(attacker.pokemon.moves[1]!.moveId).toBe(GEN1_MOVE_IDS.fly);
    // Assert — transformed flag set
    expect(attacker.transformed).toBe(true);
    // Assert — transform-data volatile stores originals
    expect(attacker.volatileStatuses.has("transform-data")).toBe(true);
    expect(result.messages).toContain("The user transformed!");
  });

  it("given a transformed Pokemon switches out, when onSwitchOut is called, then original moves/types/stats are restored", () => {
    // Source: pret/pokered — Transform reverts on switch-out
    // Arrange
    const pokemon = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [
          createMoveSlot(GEN1_MOVE_IDS.flamethrower, 5),
          createMoveSlot(GEN1_MOVE_IDS.fly, 5),
        ],
        calculatedStats: {
          hp: 100,
          attack: 100,
          defense: 90,
          spAttack: 110,
          spDefense: 90,
          speed: 100,
        },
      } as PokemonInstance,
    });
    pokemon.transformed = true;
    pokemon.volatileStatuses.set("transform-data", {
      turnsLeft: -1,
      data: {
        originalMoves: [
          { moveId: GEN1_MOVE_IDS.transform, currentPP: 10, maxPP: 10, ppUps: 0 },
          { moveId: GEN1_MOVE_IDS.tackle, currentPP: 35, maxPP: 35, ppUps: 0 },
        ],
        originalTypes: [CORE_TYPE_IDS.electric],
        originalStats: {
          hp: 100,
          attack: 80,
          defense: 60,
          spAttack: 80,
          spDefense: 60,
          speed: 120,
        },
      },
    });
    const state = createBattleState();

    // Act
    ruleset.onSwitchOut(pokemon, state);

    // Assert
    expect(pokemon.pokemon.moves[0]!.moveId).toBe(GEN1_MOVE_IDS.transform);
    expect(pokemon.pokemon.moves[0]!.currentPP).toBe(10);
    expect(pokemon.pokemon.moves[1]!.moveId).toBe(GEN1_MOVE_IDS.tackle);
    expect(pokemon.types).toEqual([CORE_TYPE_IDS.electric]);
    expect(pokemon.pokemon.calculatedStats!.attack).toBe(80);
    expect(pokemon.pokemon.calculatedStats!.speed).toBe(120);
    expect(pokemon.transformed).toBe(false);
  });
});

// ============================================================================
// Bide tests
// ============================================================================

describe("Gen 1 Bide handler", () => {
  const bideMove = BIDE_MOVE;

  it("given the charge move is used for the first time, when checking result, then the volatile is applied and forcedMoveSet locks the move", () => {
    // Source: pret/pokered BideEffect — first use starts charging
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.bide, currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: bideMove, attacker, damage: 0, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBe(GEN1_MOVE_IDS.bide);
    expect(result.selfVolatileData?.data?.accumulatedDamage).toBe(0);
    // Source: pret/pokered BideEffect — charges for 2-3 turns
    // With SeededRandom(42), rng.int(2, 3) = 3
    expect(result.selfVolatileData!.turnsLeft).toBe(3);
    expect(result.forcedMoveSet).toEqual({
      moveIndex: 0,
      moveId: GEN1_MOVE_IDS.bide,
      volatileStatus: GEN1_MOVE_IDS.bide,
    });
    expect(result.messages).toContain("The user is storing energy!");
  });

  it("given Bide is charging (turnsLeft > 1), when Bide is used, then turnsLeft decrements and forcedMoveSet re-locks", () => {
    // Source: pret/pokered BideEffect — charging turns continue
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.bide, currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set(GEN1_MOVE_IDS.bide, {
      turnsLeft: 2,
      data: { accumulatedDamage: 50 },
    });
    const context = createMoveEffectContext({ move: bideMove, attacker, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    // turnsLeft should have decremented from 2 to 1
    const bideVol = attacker.volatileStatuses.get(GEN1_MOVE_IDS.bide);
    expect(bideVol!.turnsLeft).toBe(1);
    expect(result.forcedMoveSet).toBeDefined();
    expect(result.messages).toContain("The user is storing energy!");
  });

  it("given Bide releases (turnsLeft = 1) with 50 accumulated damage, when Bide is used, then customDamage deals 100 to defender", () => {
    // Source: pret/pokered BideEffect — releases 2x accumulated damage
    // 50 accumulated * 2 = 100 damage
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.bide, currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set(GEN1_MOVE_IDS.bide, {
      turnsLeft: 1,
      data: { accumulatedDamage: 50 },
    });
    const context = createMoveEffectContext({ move: bideMove, attacker, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 100,
      source: GEN1_MOVE_IDS.bide,
    });
    expect(attacker.volatileStatuses.has(GEN1_MOVE_IDS.bide)).toBe(false);
    expect(result.messages).toContain("The user unleashed energy!");
  });

  it("given Bide releases with 0 accumulated damage, when Bide is used, then it fails", () => {
    // Source: pret/pokered BideEffect — fails if no damage accumulated
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.bide, currentPP: 10, maxPP: 10, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set(GEN1_MOVE_IDS.bide, {
      turnsLeft: 1,
      data: { accumulatedDamage: 0 },
    });
    const context = createMoveEffectContext({ move: bideMove, attacker, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given a Pokemon with bide volatile is hit for 40 damage, when onDamageReceived is called, then accumulatedDamage increases by 40", () => {
    // Source: pret/pokered BideEffect — accumulates damage received
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.volatileStatuses.set(GEN1_MOVE_IDS.bide, {
      turnsLeft: 2,
      data: { accumulatedDamage: 10 },
    });
    const state = createBattleState();
    const hitMove = getCanonicalMove(GEN1_MOVE_IDS.tackle);

    // Act
    ruleset.onDamageReceived(defender, 40, hitMove, state);

    // Assert
    const bideVol = defender.volatileStatuses.get(GEN1_MOVE_IDS.bide);
    expect((bideVol!.data as any).accumulatedDamage).toBe(50);
  });
});

// ============================================================================
// Thrash / Petal Dance tests
// ============================================================================

describe("Gen 1 Thrash handler", () => {
  const thrashMove = THRASH_MOVE;

  it("given Thrash used for the first time, when checking result, then selfVolatileInflicted is 'thrash-lock' and forcedMoveSet locks into Thrash", () => {
    // Source: pret/pokered ThrashEffect — first use locks for 2-3 turns total.
    // The engine deals damage BEFORE calling executeMoveEffect, so the first turn
    // of damage is already done. turnsLeft = (randomTurns - 1) to represent remaining
    // forced turns beyond this one.
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.thrash, currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: thrashMove, attacker, damage: 30, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.selfVolatileInflicted).toBe("thrash-lock");
    // With SeededRandom(42), rng.int(2, 3) = 3, so turnsLeft = 3 - 1 = 2
    expect(result.selfVolatileData!.turnsLeft).toBe(2);
    expect(result.forcedMoveSet!.moveId).toBe(GEN1_MOVE_IDS.thrash);
  });

  it("given Thrash lock active with turnsLeft > 1, when Thrash is used, then turnsLeft decrements and re-locks", () => {
    // Source: pret/pokered ThrashEffect — continues thrashing
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.thrash, currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("thrash-lock", {
      turnsLeft: 2,
      data: { moveId: GEN1_MOVE_IDS.thrash },
    });
    const context = createMoveEffectContext({ move: thrashMove, attacker, damage: 30 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(attacker.volatileStatuses.get("thrash-lock")!.turnsLeft).toBe(1);
    expect(result.forcedMoveSet).toBeDefined();
  });

  it("given Thrash lock is on last turn (turnsLeft = 1), when Thrash is used, then thrash-lock is removed and user is confused", () => {
    // Source: pret/pokered ThrashEffect — confusion after thrashing ends
    // Arrange
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.thrash, currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("thrash-lock", {
      turnsLeft: 1,
      data: { moveId: GEN1_MOVE_IDS.thrash },
    });
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: thrashMove, attacker, damage: 30, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(attacker.volatileStatuses.has("thrash-lock")).toBe(false);
    expect(result.selfVolatileInflicted).toBe(GEN1_MOVE_IDS.confusion);
    // Source: pret/pokered — random(0-3)+2 = [2,5]
    // With SeededRandom(42), rng.int(2, 5) = 4
    expect(result.selfVolatileData!.turnsLeft).toBe(4);
    expect(result.forcedMoveSet).toBeUndefined();
  });

  it("given Petal Dance move with thrash handler on last turn, when used, then confusion is applied (same handler as Thrash)", () => {
    // Source: pret/pokered — Petal Dance uses the same ThrashEffect handler
    // Arrange
    const petalDanceMove = PETAL_DANCE_MOVE;
    const attacker = createSyntheticOnFieldPokemon({
      pokemon: {
        ...createSyntheticOnFieldPokemon().pokemon,
        moves: [{ moveId: GEN1_MOVE_IDS.petalDance, currentPP: 20, maxPP: 20, ppUps: 0 }],
      } as PokemonInstance,
    });
    attacker.volatileStatuses.set("thrash-lock", {
      turnsLeft: 1,
      data: { moveId: GEN1_MOVE_IDS.petalDance },
    });
    const rng = new SeededRandom(42);
    const context = createMoveEffectContext({ move: petalDanceMove, attacker, damage: 25, rng });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(attacker.volatileStatuses.has("thrash-lock")).toBe(false);
    expect(result.selfVolatileInflicted).toBe(GEN1_MOVE_IDS.confusion);
  });
});

// ============================================================================
// Hyper Beam substitute-break test
// ============================================================================

describe("Gen 1 Hyper Beam substitute-break", () => {
  const hyperBeamMove = HYPER_BEAM_MOVE;

  it("given Hyper Beam breaks a substitute (brokeSubstitute=true), when executeMoveEffect is called, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md — Hyper Beam skips recharge if it breaks a Substitute
    // Arrange
    const defender = createSyntheticOnFieldPokemon({ substituteHp: 0 });
    defender.pokemon.currentHp = 100; // Not KO'd, but sub was broken
    const context = createMoveEffectContext({
      move: hyperBeamMove,
      defender,
      damage: 60,
      brokeSubstitute: true,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam KOs the target (currentHp=0), when executeMoveEffect is called, then noRecharge is true", () => {
    // Source: gen1-ground-truth.md — Hyper Beam skips recharge on KO
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.pokemon.currentHp = 0; // KO'd
    const context = createMoveEffectContext({
      move: hyperBeamMove,
      defender,
      damage: 100,
      brokeSubstitute: false,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.noRecharge).toBe(true);
  });

  it("given Hyper Beam hits but does not KO and does not break sub, when executeMoveEffect is called, then noRecharge is false/undefined", () => {
    // Source: gen1-ground-truth.md — Hyper Beam requires recharge normally
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.pokemon.currentHp = 50; // Still alive, no sub
    const context = createMoveEffectContext({
      move: hyperBeamMove,
      defender,
      damage: 50,
      brokeSubstitute: false,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.noRecharge).toBeUndefined();
  });
});

// ============================================================================
// onDamageReceived - Rage + Bide combined test
// ============================================================================

describe("Gen 1 onDamageReceived", () => {
  it("given a Pokemon with both rage and bide volatiles, when hit for 25 damage, then Attack boosts by +1 AND bide accumulates 25", () => {
    // Source: pret/pokered — both Rage and Bide can theoretically be active
    // (edge case from Transform shenanigans or glitches)
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.volatileStatuses.set(GEN1_MOVE_IDS.rage, { turnsLeft: -1, data: { moveIndex: 0 } });
    defender.volatileStatuses.set(GEN1_MOVE_IDS.bide, {
      turnsLeft: 2,
      data: { accumulatedDamage: 10 },
    });
    defender.statStages.attack = 0;
    const state = createBattleState();
    const hitMove = getCanonicalMove(GEN1_MOVE_IDS.tackle);

    // Act
    ruleset.onDamageReceived(defender, 25, hitMove, state);

    // Assert
    expect(defender.statStages.attack).toBe(1);
    const bideVol = defender.volatileStatuses.get(GEN1_MOVE_IDS.bide);
    expect((bideVol!.data as any).accumulatedDamage).toBe(35);
  });

  it("given a Pokemon without rage or bide, when onDamageReceived is called, then no state changes occur", () => {
    // Source: pret/pokered — onDamageReceived is a no-op without relevant volatiles
    // Arrange
    const defender = createSyntheticOnFieldPokemon();
    defender.statStages.attack = 3;
    const state = createBattleState();
    const hitMove = getCanonicalMove(GEN1_MOVE_IDS.tackle);

    // Act
    ruleset.onDamageReceived(defender, 50, hitMove, state);

    // Assert
    expect(defender.statStages.attack).toBe(3); // unchanged
  });
});

// ============================================================================
// Engine integration — multi-turn moves
// ============================================================================

describe("Gen 1 engine integration — multi-turn moves", () => {
  const dataManager = createGen1DataManager();
  const integrationRuleset = new Gen1Ruleset();
  let uidCounter = 0;

  function createPokemon(
    speciesId: number,
    level: number,
    moveIds: string[],
    nickname?: string,
  ): PokemonInstance {
    const species = dataManager.getSpecies(speciesId);
    const pokemon = createPokemonInstance(species, level, new SeededRandom(uidCounter + 1), {
      nature: DEFAULT_HARDY_NATURE,
      ivs: createDvs(),
      evs: createStatExp(),
      moves: [],
      friendship: createFriendship(70),
      heldItem: null,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      gender: CORE_GENDERS.male,
      isShiny: false,
      metLocation: "pallet-town",
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: CORE_ITEM_IDS.pokeBall,
    });
    uidCounter += 1;
    pokemon.uid = `tier4-${speciesId}-${level}-${uidCounter}`;
    pokemon.nickname = nickname ?? null;
    pokemon.currentHp = 999;
    pokemon.ability = "";
    pokemon.moves = moveIds.map((id) => {
      const moveData = dataManager.getMove(id);
      return createMoveSlot(id, moveData.pp);
    });
    return pokemon;
  }

  function createBattle(
    team1: PokemonInstance[],
    team2: PokemonInstance[],
    seed: number,
  ): BattleEngine {
    const config: BattleConfig = {
      generation: 1,
      format: "singles",
      teams: [team1, team2],
      seed,
    };
    return new BattleEngine(config, integrationRuleset, dataManager);
  }

  it("given attacker uses Rage and is hit, when engine processes 2 turns, then attacker is forced to use Rage again and Attack is boosted", () => {
    // Source: pret/pokered RageEffect — Rage locks the user into repeating, and
    // each hit boosts Attack by +1. The forcedMove mechanism forces Rage on turn 2.
    // Arrange
    const rager = createPokemon(
      6,
      50,
      [GEN1_MOVE_IDS.rage, GEN1_MOVE_IDS.scratch, GEN1_MOVE_IDS.ember, GEN1_MOVE_IDS.slash],
      "Rager",
    );
    const hitter = createPokemon(
      9,
      50,
      [GEN1_MOVE_IDS.waterGun, GEN1_MOVE_IDS.tackle, GEN1_MOVE_IDS.bubble, GEN1_MOVE_IDS.withdraw],
      "Hitter",
    );
    const engine = createBattle([rager], [hitter], 42);

    // Act — Turn 1: Rager uses Rage (moveIndex 0), Hitter uses Water Gun (moveIndex 0)
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // After turn 1, Rager should have rage volatile and forcedMove set
    const ragerActive = engine.getActive(0);
    expect(ragerActive).not.toBeNull();
    expect(ragerActive!.volatileStatuses.has(GEN1_MOVE_IDS.rage)).toBe(true);

    // Turn 2: Both submit actions, but Rager's is forced to Rage
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 }); // ignored, forced to rage
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 }); // Hitter uses Water Gun

    // Assert — Rager's attack should have been boosted by hits received
    const ragerAfter = engine.getActive(0);
    expect(ragerAfter).not.toBeNull();
    // Rager was hit at least once while rage volatile was active, so attack should be > 0
    expect(ragerAfter!.statStages.attack).toBeGreaterThanOrEqual(1);
  });

  it("given attacker uses Thrash, when engine processes multiple turns, then thrash-lock volatile is active during forced turns and confusion is applied after", () => {
    // Source: pret/pokered ThrashEffect — locks for 2-3 turns, then confuses
    // Arrange
    const thrasher = createPokemon(
      34,
      50,
      [
        GEN1_MOVE_IDS.thrash,
        GEN1_MOVE_IDS.hornAttack,
        GEN1_MOVE_IDS.poisonSting,
        GEN1_MOVE_IDS.tackle,
      ],
      "Thrasher",
    );
    const defender = createPokemon(
      9,
      50,
      [GEN1_MOVE_IDS.waterGun, GEN1_MOVE_IDS.tackle, GEN1_MOVE_IDS.bubble, GEN1_MOVE_IDS.withdraw],
      "Defender",
    );
    const engine = createBattle([thrasher], [defender], 42);

    // Act — Turn 1: Thrasher uses Thrash
    engine.start();
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 0 });
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // After turn 1, thrash-lock volatile should be active
    const thrasherT1 = engine.getActive(0);
    expect(thrasherT1).not.toBeNull();
    expect(thrasherT1!.volatileStatuses.has("thrash-lock")).toBe(true);

    // Turn 2: Thrasher is forced to use Thrash again
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 }); // ignored
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // Turn 3: Keep going — thrash should still be active or have just ended
    engine.submitAction(0, { type: "move", side: 0, moveIndex: 1 }); // ignored if still locked
    engine.submitAction(1, { type: "move", side: 1, moveIndex: 0 });

    // After enough turns, thrash-lock should be gone and confusion should be applied
    // The lock lasts 2-3 turns with seed 42; the RNG in the engine determines exact duration.
    // Check the event log for confusion application
    const events = engine.getEventLog();
    const confusionEvents = events.filter(
      (e) => e.type === "volatile-start" && (e as any).volatile === GEN1_MOVE_IDS.confusion,
    );
    // Source: pret/pokered ThrashEffect — confusion is applied when thrash ends
    // The confusion volatile-start event should exist somewhere in the log
    expect(confusionEvents.length).toBeGreaterThanOrEqual(1);
  });
});
