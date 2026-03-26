import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_MOVE_IDS,
  createDvs,
  createMoveSlot,
  createPokemonInstance,
  createStatExp,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_MOVE_IDS,
  GEN2_SPECIES_IDS,
} from "../../../src";
import { Gen2Ruleset } from "../../../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Helpers (same pattern as combat-moves.test.ts)
// ---------------------------------------------------------------------------

const dataManager = createGen2DataManager();
const MOVE_IDS = { ...CORE_MOVE_IDS, ...GEN2_MOVE_IDS } as const;
const SPECIES_IDS = GEN2_SPECIES_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0];
const DEFAULT_TACKLE_MOVE = dataManager.getMove(MOVE_IDS.tackle);
const FUTURE_SIGHT_MOVE = dataManager.getMove(MOVE_IDS.futureSight);

function createSyntheticOnFieldPokemon(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
    status: string | null;
    types: readonly PokemonType[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    moveIds: readonly string[];
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? SPECIES_IDS.chikorita);
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(2), {
    nature: DEFAULT_NATURE,
    ivs: createDvs(),
    evs: createStatExp(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    moves: [...(overrides.moveIds ?? [DEFAULT_TACKLE_MOVE.id])],
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: GEN2_ITEM_IDS.pokeBall,
  });
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.status = (overrides.status as PrimaryStatus | null | undefined) ?? null;
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.moves = (overrides.moveIds ?? [DEFAULT_TACKLE_MOVE.id]).map((moveId) => {
    const move = dataManager.getMove(moveId);
    return createMoveSlot(move.id, move.pp);
  });
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };

  return {
    pokemon,
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
    types: [...(overrides.types ?? species.types)],
    ability: pokemon.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
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
    lastDamageTaken: 0,
    lastDamageCategory: null,
    lastDamageType: null,
  } as unknown as ActivePokemon;
}

function createBattleSide(
  index: 0 | 1,
  active: ActivePokemon,
  overrides: Partial<{ futureAttack: unknown }> = {},
): BattleSide {
  return {
    index,
    trainer: null,
    team: [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: overrides.futureAttack ?? null,
    faintCount: 0,
    gimmickUsed: false,
  } as unknown as BattleSide;
}

function createBattleState(side0: BattleSide, side1: BattleSide): BattleState {
  return {
    phase: "turn-end",
    generation: 2,
    format: "singles",
    turnNumber: 1,
    sides: [side0, side1],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(42),
    ended: false,
    winner: null,
    isWildBattle: false,
    fleeAttempts: 0,
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Future Sight", () => {
  const ruleset = new Gen2Ruleset();

  it("given no future attack is pending, when Future Sight is used, then schedules a future attack in 2 turns", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
    // Future Sight schedules a delayed attack with turnsLeft = 2.
    const attacker = createSyntheticOnFieldPokemon({
      speciesId: SPECIES_IDS.xatu,
      nickname: "Xatu",
    });
    const defender = createSyntheticOnFieldPokemon();
    const side0 = createBattleSide(0, attacker);
    const side1 = createBattleSide(1, defender);
    const state = createBattleState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: FUTURE_SIGHT_MOVE,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.futureAttack).toEqual({
      moveId: FUTURE_SIGHT_MOVE.id,
      turnsLeft: 2,
      sourceSide: 0,
    });
    expect(result.messages).toContain("Xatu foresaw an attack!");
  });

  it("given attacker is on side 1, when Future Sight is used, then sourceSide is 1", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
    // Triangulation case: the sourceSide should match the attacker's side.
    const attacker = createSyntheticOnFieldPokemon({
      speciesId: SPECIES_IDS.slowking,
      nickname: "Slowking",
    });
    const defender = createSyntheticOnFieldPokemon();
    const side0 = createBattleSide(0, defender);
    const side1 = createBattleSide(1, attacker);
    const state = createBattleState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: FUTURE_SIGHT_MOVE,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.futureAttack).toEqual({
      moveId: FUTURE_SIGHT_MOVE.id,
      turnsLeft: 2,
      sourceSide: 1,
    });
  });

  it("given a future attack is already pending on the defender's side, when Future Sight is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
    // Future Sight fails if a future attack is already active on the target side.
    const attacker = createSyntheticOnFieldPokemon();
    const defender = createSyntheticOnFieldPokemon();
    const side0 = createBattleSide(0, attacker);
    const side1 = createBattleSide(1, defender, {
      futureAttack: { moveId: FUTURE_SIGHT_MOVE.id, turnsLeft: 1, sourceSide: 0 },
    });
    const state = createBattleState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: FUTURE_SIGHT_MOVE,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.futureAttack).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});
