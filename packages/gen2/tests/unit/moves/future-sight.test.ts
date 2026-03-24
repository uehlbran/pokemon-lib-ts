import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../../../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Helpers (same pattern as combat-moves.test.ts)
// ---------------------------------------------------------------------------

function createMockActive(
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
    types: string[];
    heldItem: string | null;
    speciesId: number;
    nickname: string | null;
    moves: Array<{ moveId: string; pp: number; maxPp: number; currentPP?: number }>;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: overrides.speciesId ?? 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35, currentPP: 35 }],
      calculatedStats: {
        hp: maxHp,
        attack: overrides.attack ?? 100,
        defense: overrides.defense ?? 100,
        spAttack: overrides.spAttack ?? 100,
        spDefense: overrides.spDefense ?? 100,
        speed: overrides.speed ?? 100,
      },
    },
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
    types: (overrides.types as unknown as PokemonType[]) ?? ["normal"],
    ability: "",
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

function createMockSide(
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

function createMockState(side0: BattleSide, side1: BattleSide): BattleState {
  return {
    sides: [side0, side1],
    turn: 1,
    weather: null,
    terrain: null,
    trickRoom: null,
    format: { id: "singles", slots: 1 },
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Future Sight", () => {
  const ruleset = new Gen2Ruleset();

  const futureSightMove = {
    id: "future-sight",
    name: "Future Sight",
    type: "psychic",
    category: "special",
    power: 80,
    accuracy: 90,
    pp: 15,
    priority: 0,
    effect: { type: "custom", handler: "future-sight" },
    flags: {},
  } as unknown as MoveData;

  it("given no future attack is pending, when Future Sight is used, then schedules a future attack in 2 turns", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
    // Future Sight schedules a delayed attack with turnsLeft = 2.
    const attacker = createMockActive({ nickname: "Xatu" });
    const defender = createMockActive();
    const side0 = createMockSide(0, attacker);
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: futureSightMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.futureAttack).toEqual({
      moveId: "future-sight",
      turnsLeft: 2,
      sourceSide: 0,
    });
    expect(result.messages).toContain("Xatu foresaw an attack!");
  });

  it("given attacker is on side 1, when Future Sight is used, then sourceSide is 1", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
    // Triangulation case: the sourceSide should match the attacker's side.
    const attacker = createMockActive({ nickname: "Slowking" });
    const defender = createMockActive();
    const side0 = createMockSide(0, defender);
    const side1 = createMockSide(1, attacker);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: futureSightMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.futureAttack).toEqual({
      moveId: "future-sight",
      turnsLeft: 2,
      sourceSide: 1,
    });
  });

  it("given a future attack is already pending on the defender's side, when Future Sight is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FutureSightEffect
    // Future Sight fails if a future attack is already active on the target side.
    const attacker = createMockActive();
    const defender = createMockActive();
    const side0 = createMockSide(0, attacker);
    const side1 = createMockSide(1, defender, {
      futureAttack: { moveId: "future-sight", turnsLeft: 1, sourceSide: 0 },
    });
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: futureSightMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.futureAttack).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});
