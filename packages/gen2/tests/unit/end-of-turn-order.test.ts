import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  NEUTRAL_NATURES,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen2DataManager,
  GEN2_ITEM_IDS,
  GEN2_NATURE_IDS,
  GEN2_SPECIES_IDS,
} from "../../src";
import { Gen2Ruleset } from "../../src/Gen2Ruleset";

/**
 * Helper to create a minimal ActivePokemon mock for testing.
 */
const DATA_MANAGER = createGen2DataManager();
const END_OF_TURN = CORE_END_OF_TURN_EFFECT_IDS;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN2_ITEM_IDS } as const;
const MOVES = CORE_MOVE_IDS;
const SPECIES = GEN2_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TYPES = CORE_TYPE_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN2_NATURE_IDS.hardy;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);

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
    moves: Array<{ moveId: string; pp: number; maxPp: number }>;
  }> = {},
): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      nature: DEFAULT_NATURE,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: TACKLE.id, pp: TACKLE.pp, maxPp: TACKLE.pp }],
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
    types: (overrides.types as unknown as PokemonType[]) ?? [TYPES.normal],
    ability: CORE_ABILITY_IDS.none,
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
  } as unknown as ActivePokemon;
}

describe("Gen 2 End-of-Turn Order — Bug 4I", () => {
  // Source: pret/pokecrystal engine/battle/core.asm:250-296 HandleBetweenTurnEffects

  it("given Gen 2 ruleset, when getting end-of-turn order, then includes all HandleBetweenTurnEffects from decomp", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:250-296
    // The decomp calls: HandleFutureSight, HandleWeather, HandleWrap, HandlePerishSong,
    // HandleLeftovers, HandleMysteryberry, HandleDefrost, HandleSafeguard,
    // HandleScreens, HandleStatBoostingHeldItems, HandleHealingItems, HandleEncore
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert — every effect from the decomp is present
    expect(order).toContain(END_OF_TURN.futureAttack); // HandleFutureSight
    expect(order).toContain(END_OF_TURN.weatherDamage); // HandleWeather (damage part)
    expect(order).toContain(END_OF_TURN.weatherCountdown); // HandleWeather (countdown part)
    expect(order).toContain(END_OF_TURN.bind); // HandleWrap
    expect(order).toContain(END_OF_TURN.perishSong); // HandlePerishSong
    expect(order).toContain(END_OF_TURN.leftovers); // HandleLeftovers
    expect(order).toContain(END_OF_TURN.mysteryBerry); // HandleMysteryberry
    expect(order).toContain(END_OF_TURN.defrost); // HandleDefrost
    // Note: safeguard-countdown is intentionally absent — Safeguard is now stored as a
    // ScreenType screen and decremented by screen-countdown to avoid double-decrement.
    expect(order).toContain(END_OF_TURN.screenCountdown); // HandleScreens + Safeguard
    expect(order).toContain(END_OF_TURN.statBoostingItems); // HandleStatBoostingHeldItems
    expect(order).toContain(END_OF_TURN.healingItems); // HandleHealingItems
    expect(order).toContain(END_OF_TURN.encoreCountdown); // HandleEncore
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then weather-countdown fires immediately after weather-damage", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:259 HandleWeather
    // In the decomp, HandleWeather handles both damage AND countdown in a single call.
    // In our engine, these are split into two adjacent entries.
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();
    const dmgIdx = order.indexOf(END_OF_TURN.weatherDamage);
    const cntIdx = order.indexOf(END_OF_TURN.weatherCountdown);

    // Assert — countdown immediately follows damage
    expect(dmgIdx).toBeGreaterThanOrEqual(0);
    expect(cntIdx).toBe(dmgIdx + 1);
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then mystery-berry fires before defrost", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:288-289
    // HandleMysteryberry (line 288) fires before HandleDefrost (line 289)
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();
    const berryIdx = order.indexOf(END_OF_TURN.mysteryBerry);
    const defrostIdx = order.indexOf(END_OF_TURN.defrost);

    // Assert
    expect(berryIdx).toBeLessThan(defrostIdx);
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then screen-countdown handles both screens and Safeguard", () => {
    // Safeguard is stored as a ScreenType screen (added in PR #234 fix) and
    // decremented by screen-countdown. A separate safeguard-countdown would
    // double-decrement turnsLeft and halve the effective 5-turn duration.
    // Source: pret/pokecrystal engine/battle/core.asm:290-291 — single per-turn countdown
    const ruleset = new Gen2Ruleset();

    const order = ruleset.getEndOfTurnOrder();

    expect(order).toContain(END_OF_TURN.screenCountdown);
    expect(order).not.toContain(END_OF_TURN.safeguardCountdown);
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then encore-countdown is the last effect", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:296 — jp HandleEncore is the final call
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert
    expect(order[order.length - 1]).toBe(END_OF_TURN.encoreCountdown);
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then defrost fires after leftovers", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:287-289
    // HandleLeftovers (line 287) → HandleMysteryberry (288) → HandleDefrost (289)
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();
    const leftIdx = order.indexOf(END_OF_TURN.leftovers);
    const defrostIdx = order.indexOf(END_OF_TURN.defrost);

    // Assert
    expect(leftIdx).toBeLessThan(defrostIdx);
  });

  it("given Gen 2 ruleset, when getting post-attack residual order, then does NOT include defrost", () => {
    // Source: pret/pokecrystal — defrost is HandleBetweenTurnEffects (Phase 2), not ResidualDamage (Phase 1)
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getPostAttackResidualOrder();

    // Assert — defrost should NOT be in Phase 1
    expect(order).not.toContain(END_OF_TURN.defrost);
  });
});

describe("Gen 2 Freeze Thaw Timing — Bug 4J", () => {
  // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
  // In Gen 2, frozen Pokemon thaw BETWEEN turns (in HandleBetweenTurnEffects),
  // NOT before they move. This is architecturally different from Gen 3+.

  it("given a frozen Pokemon, when checkFreezeThaw is called (pre-move), then always returns false", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // The engine calls checkFreezeThaw pre-move. In Gen 2, thaw happens between turns,
    // so the pre-move check must always return false.
    // Arrange
    const ruleset = new Gen2Ruleset();
    const frozen = createMockActive({ status: STATUSES.freeze });
    const rng = new SeededRandom(42);

    // Act
    const result = ruleset.checkFreezeThaw(frozen, rng);

    // Assert
    expect(result).toBe(false);
  });

  it("given a frozen Pokemon, when checkFreezeThaw is called with many seeds, then never returns true", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // Triangulation: across 500 different seeds, pre-move thaw must never happen
    // Arrange
    const ruleset = new Gen2Ruleset();
    const frozen = createMockActive({ status: STATUSES.freeze });
    const anyThaw = Array.from({ length: 500 }, (_, seed) =>
      ruleset.checkFreezeThaw(frozen, new SeededRandom(seed)),
    ).some(Boolean);

    // Assert
    expect(anyThaw).toBe(false);
  });

  it("given Gen 2 end-of-turn order, when checking for defrost effect, then defrost is present in end-of-turn", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // The defrost effect must be in the end-of-turn order (Phase 2) since Gen 2
    // thaws between turns, not pre-move.
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert
    expect(order).toContain(END_OF_TURN.defrost);
  });

  it("given checkFreezeThaw returns false, when checking that RNG is not consumed, then RNG state is unchanged", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // Since checkFreezeThaw always returns false in Gen 2, it should NOT consume
    // any RNG values. This ensures battle replay determinism is preserved.
    // Arrange
    const ruleset = new Gen2Ruleset();
    const frozen = createMockActive({ status: STATUSES.freeze });
    const rng = new SeededRandom(42);

    // Capture RNG state by generating a reference value
    const refRng = new SeededRandom(42);
    const expectedNext = refRng.next();

    // Act
    ruleset.checkFreezeThaw(frozen, rng);
    const actualNext = rng.next();

    // Assert — RNG should not have been consumed by checkFreezeThaw
    expect(actualNext).toBe(expectedNext);
  });
});
