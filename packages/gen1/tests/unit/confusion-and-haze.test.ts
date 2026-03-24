import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen1Ruleset } from "../../src/Gen1Ruleset";

/**
 * Gen 1 Confusion duration and Haze mechanic tests.
 *
 * Sources:
 *   - pokered effects.asm:1143-1147  — confusion duration rand(0-3)+2 = [2,5]
 *   - pokered move_effects/haze.asm:15-43 — Haze cures defender status only; resets both stat stages
 */

// ---------------------------------------------------------------------------
// Shared helpers (copied from move-handlers-tier1.test.ts pattern)
// ---------------------------------------------------------------------------

const ruleset = new Gen1Ruleset();

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

function makeMove(overrides: Partial<MoveData> = {}): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type: "normal" as PokemonType,
    category: "physical",
    power: 50,
    accuracy: 100,
    pp: 35,
    priority: 0,
    target: "adjacent-foe",
    flags: DEFAULT_MOVE_FLAGS,
    effect: null,
    description: "A test move.",
    generation: 1,
    ...overrides,
  };
}

function makeActivePokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    pokemon: {
      uid: "test-uid",
      speciesId: 25,
      nickname: null,
      level: 50,
      experience: 0,
      nature: "hardy",
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: [{ moveId: "tackle", currentPP: 35, maxPP: 35, ppUps: 0 }],
      currentHp: 100,
      status: null,
      friendship: 70,
      heldItem: null,
      ability: "",
      abilitySlot: "normal1" as const,
      gender: "male" as const,
      isShiny: false,
      metLocation: "pallet-town",
      metLevel: 5,
      originalTrainer: "Red",
      originalTrainerId: 12345,
      pokeball: "poke-ball",
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
    types: ["electric"] as PokemonType[],
    ability: "",
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
    defender: makeActivePokemon({ types: ["normal"] }),
    move: makeMove(),
    damage: 0,
    state: makeBattleState(),
    rng,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Confusion move definition
// ---------------------------------------------------------------------------

const confusionMove = makeMove({
  id: "confuse-ray",
  displayName: "Confuse Ray",
  type: "ghost" as PokemonType,
  category: "status",
  power: null,
  accuracy: 100,
  target: "adjacent-foe",
  effect: { type: "volatile-status" as const, status: "confusion", chance: 100 },
});

// ---------------------------------------------------------------------------
// Haze move definition
// ---------------------------------------------------------------------------

const hazeMove = makeMove({
  id: "haze",
  displayName: "Haze",
  type: "ice" as PokemonType,
  category: "status",
  power: null,
  accuracy: null,
  target: "all",
  effect: { type: "custom" as const, handler: "haze" },
});

// ---------------------------------------------------------------------------
// Confusion duration tests
// ---------------------------------------------------------------------------

describe("confusion duration", () => {
  it("given confusion is inflicted, when sampling 1000 seeds, then turnsLeft is always in [2, 5]", () => {
    // Source: pokered effects.asm:1143-1147 — `and $3; inc a; inc a` = random(0-3)+2 = [2,5]

    // Arrange: use 1000 different seeds to exercise the RNG distribution
    const turnsLeftValues: number[] = [];

    for (let seed = 0; seed < 1000; seed++) {
      // Reset the defender's volatile statuses so confusion is inflicted fresh each time
      const freshDefender = makeActivePokemon({
        types: ["normal"],
        volatileStatuses: new Map(),
      });
      const context = makeMoveEffectContext({
        move: confusionMove,
        defender: freshDefender,
        rng: new SeededRandom(seed),
      });

      // Act
      const result = ruleset.executeMoveEffect(context);

      // Only collect when confusion was actually inflicted (not already confused)
      if (result.volatileInflicted === "confusion" && result.volatileData != null) {
        turnsLeftValues.push(result.volatileData.turnsLeft);
      }
    }

    // Assert: every observed turnsLeft must be within [2, 5]
    expect(turnsLeftValues.length).toBe(1000);
    for (const turns of turnsLeftValues) {
      expect(turns).toBeGreaterThanOrEqual(2);
      expect(turns).toBeLessThanOrEqual(5);
    }
  });

  it("given confusion is inflicted, when sampling sufficient seeds, then both min=2 and max=5 are observed", () => {
    // Source: pokered effects.asm:1143-1147 — [2,5] uniform distribution; both extremes must be reachable

    // Arrange
    const turnsLeftValues: number[] = [];

    for (let seed = 0; seed < 1000; seed++) {
      const freshDefender = makeActivePokemon({
        types: ["normal"],
        volatileStatuses: new Map(),
      });
      const context = makeMoveEffectContext({
        move: confusionMove,
        defender: freshDefender,
        rng: new SeededRandom(seed),
      });

      // Act
      const result = ruleset.executeMoveEffect(context);

      if (result.volatileInflicted === "confusion" && result.volatileData != null) {
        turnsLeftValues.push(result.volatileData.turnsLeft);
      }
    }

    // Assert: both boundary values must appear in the sample
    const minObserved = Math.min(...turnsLeftValues);
    const maxObserved = Math.max(...turnsLeftValues);
    expect(minObserved).toBe(2);
    expect(maxObserved).toBe(5);
  });

  it("given the same seed, when inflicting confusion twice on fresh defenders, then turnsLeft is the same both times", () => {
    // Source: SeededRandom (Mulberry32) — same seed produces identical sequence
    const SEED = 77;

    // Arrange: two identical contexts using the same seed
    const contextA = makeMoveEffectContext({
      move: confusionMove,
      defender: makeActivePokemon({ types: ["normal"], volatileStatuses: new Map() }),
      rng: new SeededRandom(SEED),
    });
    const contextB = makeMoveEffectContext({
      move: confusionMove,
      defender: makeActivePokemon({ types: ["normal"], volatileStatuses: new Map() }),
      rng: new SeededRandom(SEED),
    });

    // Act
    const resultA = ruleset.executeMoveEffect(contextA);
    const resultB = ruleset.executeMoveEffect(contextB);

    // Assert: same seed → same turnsLeft
    expect(resultA.volatileInflicted).toBe("confusion");
    expect(resultB.volatileInflicted).toBe("confusion");
    expect(resultA.volatileData?.turnsLeft).toBe(resultB.volatileData?.turnsLeft);
  });
});

// ---------------------------------------------------------------------------
// Haze handler tests
// ---------------------------------------------------------------------------

describe("Haze handler", () => {
  it("given Haze is used, when executing, then statusCured targets defender only (not both)", () => {
    // Source: pokered move_effects/haze.asm:15-43 — only the opponent's status is cured
    // The user's (attacker's) status is NOT cured by Haze — only stat stages are reset.

    // Arrange
    const context = makeMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.statusCured?.target).toBe("defender");
  });

  it("given Haze is used, when executing, then statStagesReset targets attacker only", () => {
    // Source: pokered move_effects/haze.asm:15-43 — stat stage reset covers the user (attacker);
    // the defender's stages are handled through statusCured (engine resets stages on status cure).

    // Arrange
    const context = makeMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.statStagesReset?.target).toBe("attacker");
  });

  it("given Haze is used, when executing, then screensCleared is both", () => {
    // Source: pokered move_effects/haze.asm — Haze removes all screens from both sides in Gen 1

    // Arrange
    const context = makeMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.screensCleared).toBe("both");
  });

  it('given Haze is used, when executing, then message is "All stat changes were eliminated!"', () => {
    // Source: pokered move_effects/haze.asm — canonical in-game message after Haze

    // Arrange
    const context = makeMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.messages).toContain("All stat changes were eliminated!");
  });

  it("given attacker is burned, when Haze is used, then statusCured targets defender only (not attacker or both)", () => {
    // Source: pokered move_effects/haze.asm:15-43 — user's (attacker's) status is NOT cured by Haze;
    // only the opponent's (defender's) status is cured. Second independent test confirming target="defender".
    const burnedPokemon = {
      ...makeActivePokemon().pokemon,
      status: "burn",
    } as PokemonInstance;
    const burnedAttacker = makeActivePokemon({ pokemon: burnedPokemon });
    const context = makeMoveEffectContext({ move: hazeMove, damage: 0, attacker: burnedAttacker });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert: statusCured must target defender only — never attacker, never both
    expect(result.statusCured?.target).not.toBe("both");
    expect(result.statusCured?.target).not.toBe("attacker");
    expect(result.statusCured?.target).toBe("defender");
  });

  it("given clean-state Pokemon (no volatiles), when Haze is used, then statStagesReset still targets attacker", () => {
    // Source: pokered move_effects/haze.asm:15-43
    // Second independent test case — confirms statStagesReset is unconditional (not contingent on volatile presence)
    const cleanContext = makeMoveEffectContext({ move: hazeMove, damage: 0 });
    const result = ruleset.executeMoveEffect(cleanContext);
    expect(result.statStagesReset?.target).toBe("attacker");
  });

  it("given clean-state Pokemon (no volatiles), when Haze is used, then screensCleared is still both", () => {
    // Source: pokered move_effects/haze.asm:15-43
    // Second independent test case — confirms screensCleared is unconditional
    const cleanContext = makeMoveEffectContext({ move: hazeMove, damage: 0 });
    const result = ruleset.executeMoveEffect(cleanContext);
    expect(result.screensCleared).toBe("both");
  });

  it("given clean-state Pokemon (no volatiles), when Haze is used, then message is still 'All stat changes were eliminated!'", () => {
    // Source: pokered move_effects/haze.asm:15-43
    // Second independent test case — confirms message is unconditional
    const cleanContext = makeMoveEffectContext({ move: hazeMove, damage: 0 });
    const result = ruleset.executeMoveEffect(cleanContext);
    expect(result.messages).toContain("All stat changes were eliminated!");
  });

  it("given both Pokemon have volatile statuses, when Haze is used, then volatilesToClear includes entries for both", () => {
    // Source: pokered move_effects/haze.asm — all volatile statuses on both sides are cleared

    // Arrange: attacker has confusion, defender has confusion
    const attackerWithConfusion = makeActivePokemon({
      volatileStatuses: new Map([["confusion", { turnsLeft: 3 }]]),
    });
    const defenderWithConfusion = makeActivePokemon({
      types: ["normal"],
      volatileStatuses: new Map([["confusion", { turnsLeft: 2 }]]),
    });
    const context = makeMoveEffectContext({
      move: hazeMove,
      damage: 0,
      attacker: attackerWithConfusion,
      defender: defenderWithConfusion,
    });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert: volatilesToClear must have one entry per side
    expect(result.volatilesToClear?.length).toBe(2);
    const clears = result.volatilesToClear ?? [];

    const attackerEntry = clears.find((c) => c.target === "attacker" && c.volatile === "confusion");
    const defenderEntry = clears.find((c) => c.target === "defender" && c.volatile === "confusion");

    expect(attackerEntry?.volatile).toBe("confusion");
    expect(defenderEntry?.volatile).toBe("confusion");
  });
});
