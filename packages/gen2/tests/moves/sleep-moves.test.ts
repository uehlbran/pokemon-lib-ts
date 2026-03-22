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
    moves: Array<{ moveId: string; pp: number; maxPp: number; currentPP: number }>;
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
      moves: overrides.moves ?? [
        { moveId: "sleep-talk", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "thunderbolt", pp: 15, maxPp: 15, currentPP: 15 },
        { moveId: "ice-beam", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "surf", pp: 15, maxPp: 15, currentPP: 15 },
      ],
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
    lastDamageTaken: 0,
    lastDamageCategory: null,
    lastDamageType: null,
  } as unknown as ActivePokemon;
}

function createMockSide(index: 0 | 1, active: ActivePokemon): BattleSide {
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
// Sleep Talk Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Sleep Talk", () => {
  const ruleset = new Gen2Ruleset();

  const sleepTalkMove = {
    id: "sleep-talk",
    name: "Sleep Talk",
    type: "normal",
    category: "status",
    power: null,
    accuracy: null,
    pp: 10,
    priority: 0,
    effect: { type: "custom", handler: "sleep-talk" },
    flags: {},
  } as unknown as MoveData;

  it("given user is asleep with usable moves, when Sleep Talk is used, then selects a random move via recursiveMove", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
    // Sleep Talk selects one of the user's other moves at random.
    const attacker = createMockActive({
      status: "sleep",
      moves: [
        { moveId: "sleep-talk", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "thunderbolt", pp: 15, maxPp: 15, currentPP: 15 },
        { moveId: "ice-beam", pp: 10, maxPp: 10, currentPP: 10 },
      ],
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: sleepTalkMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    // recursiveMove should be one of the usable moves (thunderbolt or ice-beam)
    expect(result.recursiveMove).toBeDefined();
    expect(["thunderbolt", "ice-beam"]).toContain(result.recursiveMove);
    expect(result.messages).toContain("The Pokemon used Sleep Talk!");
  });

  it("given user is asleep with different seed, when Sleep Talk is used, then selects a different move (triangulation)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
    // With a different RNG seed, a different move should be selected.
    const attacker = createMockActive({
      status: "sleep",
      moves: [
        { moveId: "sleep-talk", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "thunderbolt", pp: 15, maxPp: 15, currentPP: 15 },
        { moveId: "ice-beam", pp: 10, maxPp: 10, currentPP: 10 },
      ],
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act — collect multiple results with different seeds to show randomness
    const results = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: sleepTalkMove,
        damage: 0,
        state,
        rng: new SeededRandom(seed),
      });
      if (result.recursiveMove) {
        results.add(result.recursiveMove);
      }
    }

    // Assert — with 50 trials and 2 choices, both should appear
    expect(results.size).toBe(2);
    expect(results.has("thunderbolt")).toBe(true);
    expect(results.has("ice-beam")).toBe(true);
  });

  it("given user is NOT asleep, when Sleep Talk is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
    // Sleep Talk fails if the user is not asleep.
    const attacker = createMockActive({ status: null });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: sleepTalkMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given user is asleep but all other moves are banned, when Sleep Talk is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
    // Sleep Talk cannot call itself, Bide, or two-turn charge moves.
    const attacker = createMockActive({
      status: "sleep",
      moves: [
        { moveId: "sleep-talk", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "bide", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "fly", pp: 15, maxPp: 15, currentPP: 15 },
        { moveId: "dig", pp: 10, maxPp: 10, currentPP: 10 },
      ],
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: sleepTalkMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given user is asleep and all other moves have 0 PP, when Sleep Talk is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SleepTalkEffect
    // Sleep Talk skips moves with 0 PP (even though the recursive move doesn't deduct PP).
    // Note: this is actually how pokecrystal works — moves with 0 PP are excluded.
    const attacker = createMockActive({
      status: "sleep",
      moves: [
        { moveId: "sleep-talk", pp: 10, maxPp: 10, currentPP: 10 },
        { moveId: "thunderbolt", pp: 0, maxPp: 15, currentPP: 0 },
        { moveId: "ice-beam", pp: 0, maxPp: 10, currentPP: 0 },
      ],
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: sleepTalkMove,
      damage: 0,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.recursiveMove).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Snore Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Snore", () => {
  const ruleset = new Gen2Ruleset();

  const snoreMove = {
    id: "snore",
    name: "Snore",
    type: "normal",
    category: "physical",
    power: 40,
    accuracy: 100,
    pp: 15,
    priority: 0,
    effect: null,
    flags: { sound: true },
  } as unknown as MoveData;

  it("given user is asleep, when Snore is used, then move does not fail", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SnoreEffect
    // Snore succeeds when the user is asleep.
    const attacker = createMockActive({ status: "sleep" });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: snoreMove,
      damage: 40,
      state,
      rng: new SeededRandom(42),
    });

    // Assert — should not contain "But it failed!"
    expect(result.messages).not.toContain("But it failed!");
  });

  it("given user is NOT asleep, when Snore is used, then it fails", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SnoreEffect
    // Snore fails if the user is not asleep.
    const attacker = createMockActive({ status: null });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: snoreMove,
      damage: 40,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.messages).toContain("But it failed!");
  });

  it("given user is asleep and RNG triggers flinch, when Snore is used, then flinch volatile is set", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm SnoreEffect
    // Snore has a 30% chance to flinch. We use seeds that produce a flinch outcome.
    const attacker = createMockActive({ status: "sleep" });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act — try many seeds to find one that triggers flinch
    let flinchFound = false;
    let noFlinchFound = false;
    for (let seed = 0; seed < 200; seed++) {
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: snoreMove,
        damage: 40,
        state,
        rng: new SeededRandom(seed),
      });
      if (result.volatileInflicted === "flinch") {
        flinchFound = true;
      } else {
        noFlinchFound = true;
      }
      if (flinchFound && noFlinchFound) break;
    }

    // Assert — both outcomes should occur with enough trials (30% chance)
    // Source: Snore has 30% flinch chance per pret/pokecrystal
    expect(flinchFound).toBe(true);
    expect(noFlinchFound).toBe(true);
  });
});
