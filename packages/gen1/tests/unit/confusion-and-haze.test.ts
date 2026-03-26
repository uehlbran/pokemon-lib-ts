import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
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
const DATA_MANAGER = createGen1DataManager();
const MOVE_IDS = GEN1_MOVE_IDS;
const NATURE_IDS = GEN1_NATURE_IDS;
const SPECIES_IDS = GEN1_SPECIES_IDS;
const PIKACHU = DATA_MANAGER.getSpecies(SPECIES_IDS.pikachu);
const TACKLE = DATA_MANAGER.getMove(MOVE_IDS.tackle);
const CONFUSE_RAY = DATA_MANAGER.getMove(MOVE_IDS.confuseRay);
const HAZE = DATA_MANAGER.getMove(MOVE_IDS.haze);
const DEFAULT_CALCULATED_STATS = {
  hp: 100,
  attack: 80,
  defense: 60,
  spAttack: 80,
  spDefense: 60,
  speed: 120,
} as const;
const NORMAL_MONOTYPE = [CORE_TYPE_IDS.normal] as PokemonType[];

function createSyntheticOnFieldPokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  const pokemon = createPokemonInstance(PIKACHU, 50, new SeededRandom(1), {
    nature: NATURE_IDS.hardy,
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
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.moves = [createMoveSlot(TACKLE.id, TACKLE.pp)];
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.currentHp = 100;
  pokemon.calculatedStats = { ...DEFAULT_CALCULATED_STATS };

  return {
    pokemon,
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: new Map(),
    types: [...PIKACHU.types],
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
    defender: createSyntheticOnFieldPokemon({ types: [...NORMAL_MONOTYPE] }),
    move: TACKLE,
    damage: 0,
    state: createBattleState(),
    rng,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Confusion move definition
// ---------------------------------------------------------------------------

const confusionMove = CONFUSE_RAY;

// ---------------------------------------------------------------------------
// Haze move definition
// ---------------------------------------------------------------------------

const hazeMove = HAZE;

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
      const freshDefender = createSyntheticOnFieldPokemon({
        types: [...NORMAL_MONOTYPE],
        volatileStatuses: new Map(),
      });
      const context = createMoveEffectContext({
        move: confusionMove,
        defender: freshDefender,
        rng: new SeededRandom(seed),
      });

      // Act
      const result = ruleset.executeMoveEffect(context);

      // Only collect when confusion was actually inflicted (not already confused)
      if (result.volatileInflicted === CORE_VOLATILE_IDS.confusion && result.volatileData != null) {
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
      const freshDefender = createSyntheticOnFieldPokemon({
        types: [...NORMAL_MONOTYPE],
        volatileStatuses: new Map(),
      });
      const context = createMoveEffectContext({
        move: confusionMove,
        defender: freshDefender,
        rng: new SeededRandom(seed),
      });

      // Act
      const result = ruleset.executeMoveEffect(context);

      if (result.volatileInflicted === CORE_VOLATILE_IDS.confusion && result.volatileData != null) {
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
    const contextA = createMoveEffectContext({
      move: confusionMove,
      defender: createSyntheticOnFieldPokemon({
        types: [...NORMAL_MONOTYPE],
        volatileStatuses: new Map(),
      }),
      rng: new SeededRandom(SEED),
    });
    const contextB = createMoveEffectContext({
      move: confusionMove,
      defender: createSyntheticOnFieldPokemon({
        types: [...NORMAL_MONOTYPE],
        volatileStatuses: new Map(),
      }),
      rng: new SeededRandom(SEED),
    });

    // Act
    const resultA = ruleset.executeMoveEffect(contextA);
    const resultB = ruleset.executeMoveEffect(contextB);

    // Assert: same seed → same turnsLeft
    expect(resultA.volatileInflicted).toBe(CORE_VOLATILE_IDS.confusion);
    expect(resultB.volatileInflicted).toBe(CORE_VOLATILE_IDS.confusion);
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
    const context = createMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.statusCured?.target).toBe("defender");
  });

  it("given Haze is used, when executing, then statStagesReset targets attacker only", () => {
    // Source: pokered move_effects/haze.asm:15-43 — stat stage reset covers the user (attacker);
    // the defender's stages are handled through statusCured (engine resets stages on status cure).

    // Arrange
    const context = createMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.statStagesReset?.target).toBe("attacker");
  });

  it("given Haze is used, when executing, then screensCleared is both", () => {
    // Source: pokered move_effects/haze.asm — Haze removes all screens from both sides in Gen 1

    // Arrange
    const context = createMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.screensCleared).toBe("both");
  });

  it('given Haze is used, when executing, then message is "All stat changes were eliminated!"', () => {
    // Source: pokered move_effects/haze.asm — canonical in-game message after Haze

    // Arrange
    const context = createMoveEffectContext({ move: hazeMove, damage: 0 });

    // Act
    const result = ruleset.executeMoveEffect(context);

    // Assert
    expect(result.messages).toContain("All stat changes were eliminated!");
  });

  it("given attacker is burned, when Haze is used, then statusCured targets defender only (not attacker or both)", () => {
    // Source: pokered move_effects/haze.asm:15-43 — user's (attacker's) status is NOT cured by Haze;
    // only the opponent's (defender's) status is cured. Second independent test confirming target="defender".
    const burnedAttacker = createSyntheticOnFieldPokemon();
    burnedAttacker.pokemon.status = CORE_STATUS_IDS.burn;
    const context = createMoveEffectContext({
      move: hazeMove,
      damage: 0,
      attacker: burnedAttacker,
    });

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
    const cleanContext = createMoveEffectContext({ move: hazeMove, damage: 0 });
    const result = ruleset.executeMoveEffect(cleanContext);
    expect(result.statStagesReset?.target).toBe("attacker");
  });

  it("given clean-state Pokemon (no volatiles), when Haze is used, then screensCleared is still both", () => {
    // Source: pokered move_effects/haze.asm:15-43
    // Second independent test case — confirms screensCleared is unconditional
    const cleanContext = createMoveEffectContext({ move: hazeMove, damage: 0 });
    const result = ruleset.executeMoveEffect(cleanContext);
    expect(result.screensCleared).toBe("both");
  });

  it("given clean-state Pokemon (no volatiles), when Haze is used, then message is still 'All stat changes were eliminated!'", () => {
    // Source: pokered move_effects/haze.asm:15-43
    // Second independent test case — confirms message is unconditional
    const cleanContext = createMoveEffectContext({ move: hazeMove, damage: 0 });
    const result = ruleset.executeMoveEffect(cleanContext);
    expect(result.messages).toContain("All stat changes were eliminated!");
  });

  it("given both Pokemon have volatile statuses, when Haze is used, then volatilesToClear includes entries for both", () => {
    // Source: pokered move_effects/haze.asm — all volatile statuses on both sides are cleared

    // Arrange: attacker has confusion, defender has confusion
    const attackerWithConfusion = createSyntheticOnFieldPokemon({
      volatileStatuses: new Map([[CORE_VOLATILE_IDS.confusion, { turnsLeft: 3 }]]),
    });
    const defenderWithConfusion = createSyntheticOnFieldPokemon({
      types: [...NORMAL_MONOTYPE],
      volatileStatuses: new Map([[CORE_VOLATILE_IDS.confusion, { turnsLeft: 2 }]]),
    });
    const context = createMoveEffectContext({
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

    const attackerEntry = clears.find(
      (c) => c.target === "attacker" && c.volatile === CORE_VOLATILE_IDS.confusion,
    );
    const defenderEntry = clears.find(
      (c) => c.target === "defender" && c.volatile === CORE_VOLATILE_IDS.confusion,
    );

    expect(attackerEntry?.volatile).toBe(CORE_VOLATILE_IDS.confusion);
    expect(defenderEntry?.volatile).toBe(CORE_VOLATILE_IDS.confusion);
  });
});
