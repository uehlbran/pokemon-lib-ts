import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { getFuryCutterPower, getRolloutPower } from "../../src/Gen2DamageCalc";
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
    volatiles: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
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
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35, currentPP: 35 }],
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
    volatileStatuses: overrides.volatiles ?? new Map(),
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
// Present Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Present", () => {
  const ruleset = new Gen2Ruleset();

  const presentMove = {
    id: "present",
    name: "Present",
    type: "normal",
    category: "physical",
    power: null,
    accuracy: 90,
    pp: 15,
    priority: 0,
    effect: { type: "custom", handler: "present" },
    flags: {},
  } as unknown as MoveData;

  it("given RNG rolls in damage range (roll < 102), when Present is used, then customDamage with power 40 is set", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm PresentEffect
    // Roll 0-101 (102/256 = ~39.8%) -> power 40 damage
    // We need a seed where rng.int(0,255) < 102.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act — find a seed that gives damage-40 outcome
    let found40 = false;
    let found80 = false;
    for (let seed = 0; seed < 300; seed++) {
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: presentMove,
        damage: 0,
        state,
        rng: new SeededRandom(seed),
      });
      if (result.customDamage?.amount === 40) {
        found40 = true;
      }
      if (result.customDamage?.amount === 80) {
        found80 = true;
      }
      if (found40 && found80) break;
    }

    // Assert — both 40 and 80 power outcomes should be reachable
    // Source: pret/pokecrystal — Present has 4 outcomes with different probabilities
    expect(found40).toBe(true);
    expect(found80).toBe(true);
  });

  it("given many RNG seeds, when Present is used, then all four outcomes (40/80/120/heal) are reachable", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm PresentEffect
    // 0-101: 40 power, 102-177: 80 power, 178-203: 120 power, 204-255: heal
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const outcomes = new Set<number>();
    let healFound = false;

    // Act — iterate seeds to cover all outcomes
    for (let seed = 0; seed < 500; seed++) {
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: presentMove,
        damage: 0,
        state,
        rng: new SeededRandom(seed),
      });
      if (result.customDamage?.source === "present-heal") {
        healFound = true;
      } else if (result.customDamage?.amount) {
        outcomes.add(result.customDamage.amount);
      }
    }

    // Assert — all damage powers and heal should appear
    expect(outcomes.has(40)).toBe(true);
    expect(outcomes.has(80)).toBe(true);
    expect(outcomes.has(120)).toBe(true);
    expect(healFound).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Magnitude Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Magnitude", () => {
  const ruleset = new Gen2Ruleset();

  const magnitudeMove = {
    id: "magnitude",
    name: "Magnitude",
    type: "ground",
    category: "physical",
    power: null,
    accuracy: 100,
    pp: 30,
    priority: 0,
    effect: { type: "custom", handler: "magnitude" },
    flags: {},
  } as unknown as MoveData;

  it("given many RNG seeds, when Magnitude is used, then all 7 magnitude levels (4-10) are reachable", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MagnitudeEffect
    // Magnitudes 4-10 with probabilities: 5/10/20/30/20/10/5%
    // Powers: 10/30/50/70/90/110/150
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    const powers = new Set<number>();
    const levels = new Set<number>();

    // Act — iterate enough seeds to hit all outcomes
    for (let seed = 0; seed < 1000; seed++) {
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: magnitudeMove,
        damage: 0,
        state,
        rng: new SeededRandom(seed),
      });
      if (result.customDamage?.amount) {
        powers.add(result.customDamage.amount);
      }
      for (const msg of result.messages) {
        const match = msg.match(/Magnitude (\d+)/);
        if (match) {
          levels.add(Number(match[1]));
        }
      }
    }

    // Assert — all 7 power/level values should appear
    expect(powers).toEqual(new Set([10, 30, 50, 70, 90, 110, 150]));
    expect(levels).toEqual(new Set([4, 5, 6, 7, 8, 9, 10]));
  });

  it("given a specific seed producing magnitude 7, when Magnitude is used, then power is 70", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm MagnitudeEffect
    // Magnitude 7: roll 89-165, power 70 (77/256 = ~30%)
    // Find a seed that yields magnitude 7.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act — find a seed that produces magnitude 7
    let mag7Power: number | undefined;
    for (let seed = 0; seed < 500; seed++) {
      const result = ruleset.executeMoveEffect({
        attacker,
        defender,
        move: magnitudeMove,
        damage: 0,
        state,
        rng: new SeededRandom(seed),
      });
      if (result.messages.some((m) => m.includes("Magnitude 7"))) {
        mag7Power = result.customDamage?.amount;
        break;
      }
    }

    // Assert
    // Source: pret/pokecrystal — Magnitude 7 = power 70
    expect(mag7Power).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Rollout Power Tests (pure function)
// ---------------------------------------------------------------------------

describe("Gen 2 Rollout Power", () => {
  it("given no rollout volatile (turn 1), when getRolloutPower is called, then returns base power 30", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
    // Turn 1: 30 * 2^0 = 30
    const attacker = createMockActive();

    // Act
    const power = getRolloutPower(attacker);

    // Assert
    expect(power).toBe(30);
  });

  it("given rollout volatile with count=1, when getRolloutPower is called, then returns 60", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
    // Turn 2: 30 * 2^1 = 60
    const volatiles = new Map();
    volatiles.set("rollout", { turnsLeft: 1, data: { count: 1 } });
    const attacker = createMockActive({ volatiles });

    // Act
    const power = getRolloutPower(attacker);

    // Assert
    expect(power).toBe(60);
  });

  it("given rollout volatile with count=4 (max turn), when getRolloutPower is called, then returns 480", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
    // Turn 5: 30 * 2^4 = 480
    const volatiles = new Map();
    volatiles.set("rollout", { turnsLeft: 1, data: { count: 4 } });
    const attacker = createMockActive({ volatiles });

    // Act
    const power = getRolloutPower(attacker);

    // Assert
    expect(power).toBe(480);
  });
});

// ---------------------------------------------------------------------------
// Fury Cutter Power Tests (pure function)
// ---------------------------------------------------------------------------

describe("Gen 2 Fury Cutter Power", () => {
  it("given no fury-cutter volatile (first use), when getFuryCutterPower is called, then returns base power 10", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // First use: 10 * 2^0 = 10
    const attacker = createMockActive();

    // Act
    const power = getFuryCutterPower(attacker);

    // Assert
    expect(power).toBe(10);
  });

  it("given fury-cutter volatile with count=2, when getFuryCutterPower is called, then returns 40", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // Third consecutive use: 10 * 2^2 = 40
    const volatiles = new Map();
    volatiles.set("fury-cutter", { turnsLeft: -1, data: { count: 2 } });
    const attacker = createMockActive({ volatiles });

    // Act
    const power = getFuryCutterPower(attacker);

    // Assert
    expect(power).toBe(40);
  });

  it("given fury-cutter volatile with count=4 (max), when getFuryCutterPower is called, then returns 160 (capped)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // Fifth+ consecutive use: 10 * 2^4 = 160 (capped at count=4)
    const volatiles = new Map();
    volatiles.set("fury-cutter", { turnsLeft: -1, data: { count: 4 } });
    const attacker = createMockActive({ volatiles });

    // Act
    const power = getFuryCutterPower(attacker);

    // Assert
    expect(power).toBe(160);
  });

  it("given fury-cutter volatile with count=5 (over max), when getFuryCutterPower is called, then still returns 160 (capped at 4)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // Count is capped at 4 in the power formula: 10 * 2^min(5, 4) = 160
    const volatiles = new Map();
    volatiles.set("fury-cutter", { turnsLeft: -1, data: { count: 5 } });
    const attacker = createMockActive({ volatiles });

    // Act
    const power = getFuryCutterPower(attacker);

    // Assert
    expect(power).toBe(160);
  });
});

// ---------------------------------------------------------------------------
// Triple Kick Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Triple Kick", () => {
  const ruleset = new Gen2Ruleset();

  const tripleKickMove = {
    id: "triple-kick",
    name: "Triple Kick",
    type: "fighting",
    category: "physical",
    power: 10,
    accuracy: 90,
    pp: 10,
    priority: 0,
    effect: null,
    flags: { contact: true },
  } as unknown as MoveData;

  it("given Triple Kick is used, when executeMoveEffect is called, then multiHitCount is 2 (3 total hits)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm TripleKickEffect
    // Triple Kick hits 3 times. multiHitCount=2 means 2 additional hits beyond the first.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.multiHitCount).toBe(2);
  });

  it("given Triple Kick with different seed, when executeMoveEffect is called, then multiHitCount is still 2 (deterministic)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm TripleKickEffect
    // Triangulation: multiHitCount should always be 2 regardless of RNG.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: tripleKickMove,
      damage: 10,
      state,
      rng: new SeededRandom(99),
    });

    // Assert
    expect(result.multiHitCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rollout Effect Handler Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Rollout Effect", () => {
  const ruleset = new Gen2Ruleset();

  const rolloutMove = {
    id: "rollout",
    name: "Rollout",
    type: "rock",
    category: "physical",
    power: 30,
    accuracy: 90,
    pp: 20,
    priority: 0,
    effect: null,
    flags: {},
  } as unknown as MoveData;

  it("given first turn of Rollout (no volatile), when executeMoveEffect is called, then sets forcedMoveSet for next turn", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
    // On the first use, Rollout locks the user into the move for subsequent turns.
    const attacker = createMockActive({
      moves: [{ moveId: "rollout", pp: 20, maxPp: 20, currentPP: 20 }],
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: rolloutMove,
      damage: 30,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.forcedMoveSet).toBeDefined();
    expect(result.forcedMoveSet?.moveId).toBe("rollout");
    expect(result.selfVolatileInflicted).toBe("rollout");
    expect(result.selfVolatileData?.data).toEqual({ count: 0 });
  });

  it("given turn 5 of Rollout (count=4), when executeMoveEffect is called, then does NOT set forcedMoveSet (Rollout ends)", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm RolloutEffect
    // After 5 turns (count reaches 4), Rollout ends and the user is no longer locked.
    const volatiles = new Map();
    volatiles.set("rollout", { turnsLeft: 1, data: { count: 3 } });
    const attacker = createMockActive({
      moves: [{ moveId: "rollout", pp: 20, maxPp: 20, currentPP: 20 }],
      volatiles,
    });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: rolloutMove,
      damage: 120,
      state,
      rng: new SeededRandom(42),
    });

    // Assert — count becomes 4 which is NOT < 4, so no lock
    expect(result.forcedMoveSet).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fury Cutter Effect Handler Tests
// ---------------------------------------------------------------------------

describe("Gen 2 Fury Cutter Effect", () => {
  const ruleset = new Gen2Ruleset();

  const furyCutterMove = {
    id: "fury-cutter",
    name: "Fury Cutter",
    type: "bug",
    category: "physical",
    power: 10,
    accuracy: 95,
    pp: 20,
    priority: 0,
    effect: null,
    flags: {},
  } as unknown as MoveData;

  it("given first use of Fury Cutter (no volatile), when executeMoveEffect is called, then sets volatile with count=0", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // First use: no existing volatile, count starts at 0.
    const attacker = createMockActive();
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: furyCutterMove,
      damage: 10,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.selfVolatileInflicted).toBe("fury-cutter");
    expect(result.selfVolatileData?.data).toEqual({ count: 0 });
  });

  it("given third consecutive use (volatile count=2), when executeMoveEffect is called, then sets volatile with count=3", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // Third use: existing volatile has count=2, new count becomes 3.
    const volatiles = new Map();
    volatiles.set("fury-cutter", { turnsLeft: -1, data: { count: 2 } });
    const attacker = createMockActive({ volatiles });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: furyCutterMove,
      damage: 40,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.selfVolatileInflicted).toBe("fury-cutter");
    expect(result.selfVolatileData?.data).toEqual({ count: 3 });
  });

  it("given fifth+ consecutive use (volatile count=4), when executeMoveEffect is called, then count is capped at 4", () => {
    // Arrange
    // Source: pret/pokecrystal engine/battle/effect_commands.asm FuryCutterEffect
    // Count is capped at 4 for max power 160: min(4+1, 4) = 4
    const volatiles = new Map();
    volatiles.set("fury-cutter", { turnsLeft: -1, data: { count: 4 } });
    const attacker = createMockActive({ volatiles });
    const defender = createMockActive();
    const state = createMockState(createMockSide(0, attacker), createMockSide(1, defender));

    // Act
    const result = ruleset.executeMoveEffect({
      attacker,
      defender,
      move: furyCutterMove,
      damage: 160,
      state,
      rng: new SeededRandom(42),
    });

    // Assert
    expect(result.selfVolatileInflicted).toBe("fury-cutter");
    expect(result.selfVolatileData?.data).toEqual({ count: 4 });
  });
});
