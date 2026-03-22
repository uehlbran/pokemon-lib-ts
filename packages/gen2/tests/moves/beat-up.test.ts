import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockActive(
  overrides: Partial<{
    level: number;
    currentHp: number;
    maxHp: number;
    status: string | null;
    types: string[];
    nickname: string | null;
    moves: Array<{ moveId: string; pp: number; maxPp: number; currentPP?: number }>;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "beat-up", pp: 10, maxPp: 10, currentPP: 10 }],
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
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
    types: (overrides.types as unknown as PokemonType[]) ?? ["dark"],
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
    lastDamageTaken: 0,
    lastDamageCategory: null,
    lastDamageType: null,
  } as unknown as ActivePokemon;
}

function createMockTeamMember(
  overrides: Partial<{ currentHp: number; status: string | null }> = {},
): PokemonInstance {
  return {
    speciesId: 1,
    level: 50,
    currentHp: overrides.currentHp ?? 200,
    status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
    heldItem: null,
    nickname: null,
    ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    moves: [{ moveId: "tackle", pp: 35, maxPp: 35, currentPP: 35 }],
    calculatedStats: {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as unknown as PokemonInstance;
}

function createMockSide(
  index: 0 | 1,
  active: ActivePokemon,
  team: PokemonInstance[] = [],
): BattleSide {
  return {
    index,
    trainer: null,
    team: team.length > 0 ? team : [active.pokemon as unknown as PokemonInstance],
    active: [active],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
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

describe("Gen 2 Beat Up", () => {
  const ruleset = new Gen2Ruleset();

  const beatUpMove = {
    id: "beat-up",
    name: "Beat Up",
    type: "dark",
    category: "special",
    power: 10,
    accuracy: 100,
    pp: 10,
    priority: 0,
    effect: { type: "custom", handler: "beat-up" },
    flags: {},
  } as unknown as MoveData;

  it("given a team of 3 eligible Pokemon (alive, no status), when Beat Up is used, then multiHitCount is 2 (3 total hits)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Beat Up hits once per eligible (alive, no primary status) party member.
    // With 3 eligible members: multiHitCount = 3 - 1 = 2 additional hits.
    const attacker = createMockActive({ nickname: "Sneasel" });
    const team = [
      createMockTeamMember(), // Active (counts as eligible)
      createMockTeamMember(), // Bench member 1 (eligible)
      createMockTeamMember(), // Bench member 2 (eligible)
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive();
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(2);
  });

  it("given a team of 6 with 2 fainted and 1 statused, when Beat Up is used, then multiHitCount is 2 (3 eligible = 3 total hits)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Beat Up excludes fainted Pokemon and those with primary status conditions.
    // 6 members - 2 fainted - 1 statused = 3 eligible -> multiHitCount = 2
    const attacker = createMockActive({ nickname: "Sneasel" });
    const team = [
      createMockTeamMember(), // Alive, no status (eligible)
      createMockTeamMember({ currentHp: 0 }), // Fainted (ineligible)
      createMockTeamMember({ status: "paralysis" }), // Statused (ineligible)
      createMockTeamMember(), // Alive, no status (eligible)
      createMockTeamMember({ currentHp: 0 }), // Fainted (ineligible)
      createMockTeamMember(), // Alive, no status (eligible)
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive();
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(2);
  });

  it("given only the active Pokemon is eligible (all others fainted or statused), when Beat Up is used, then multiHitCount is 0 (1 total hit)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // With only 1 eligible member: multiHitCount = 1 - 1 = 0 additional hits.
    const attacker = createMockActive({ nickname: "Sneasel" });
    const team = [
      createMockTeamMember(), // Active (eligible)
      createMockTeamMember({ currentHp: 0 }), // Fainted
      createMockTeamMember({ status: "burn" }), // Burned
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive();
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(0);
  });

  it("given all party members are fainted or statused, when Beat Up is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm BeatUpEffect
    // Fails if no party members are eligible.
    const attacker = createMockActive({ nickname: "Sneasel" });
    const team = [
      createMockTeamMember({ currentHp: 0 }), // Fainted
      createMockTeamMember({ status: "sleep" }), // Asleep
      createMockTeamMember({ currentHp: 0 }), // Fainted
    ];
    const side0 = createMockSide(0, attacker, team);
    const defender = createMockActive();
    const side1 = createMockSide(1, defender);
    const state = createMockState(side0, side1);

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: beatUpMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.messages).toContain("But it failed!");
    expect(result.multiHitCount).toBeUndefined();
  });
});
