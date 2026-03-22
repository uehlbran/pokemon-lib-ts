import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import { SeededRandom } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen2Ruleset } from "../src/Gen2Ruleset";

/**
 * Helper to create a minimal ActivePokemon mock for testing.
 */
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
      speciesId: overrides.speciesId ?? 1,
      level: overrides.level ?? 50,
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status as unknown as PrimaryStatus | null) ?? null,
      heldItem: overrides.heldItem ?? null,
      nickname: overrides.nickname ?? null,
      ivs: { hp: 15, attack: 15, defense: 15, spAttack: 15, spDefense: 15, speed: 15 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      moves: overrides.moves ?? [{ moveId: "tackle", pp: 35, maxPp: 35 }],
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
    expect(order).toContain("future-attack"); // HandleFutureSight
    expect(order).toContain("weather-damage"); // HandleWeather (damage part)
    expect(order).toContain("weather-countdown"); // HandleWeather (countdown part)
    expect(order).toContain("bind"); // HandleWrap
    expect(order).toContain("perish-song"); // HandlePerishSong
    expect(order).toContain("leftovers"); // HandleLeftovers
    expect(order).toContain("mystery-berry"); // HandleMysteryberry
    expect(order).toContain("defrost"); // HandleDefrost
    // Note: safeguard-countdown is intentionally absent — Safeguard is now stored as a
    // ScreenType screen and decremented by screen-countdown to avoid double-decrement.
    expect(order).toContain("screen-countdown"); // HandleScreens + Safeguard
    expect(order).toContain("stat-boosting-items"); // HandleStatBoostingHeldItems
    expect(order).toContain("healing-items"); // HandleHealingItems
    expect(order).toContain("encore-countdown"); // HandleEncore
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then weather-countdown fires immediately after weather-damage", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:259 HandleWeather
    // In the decomp, HandleWeather handles both damage AND countdown in a single call.
    // In our engine, these are split into two adjacent entries.
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();
    const dmgIdx = order.indexOf("weather-damage");
    const cntIdx = order.indexOf("weather-countdown");

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
    const berryIdx = order.indexOf("mystery-berry");
    const defrostIdx = order.indexOf("defrost");

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

    expect(order).toContain("screen-countdown");
    expect(order).not.toContain("safeguard-countdown");
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then encore-countdown is the last effect", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:296 — jp HandleEncore is the final call
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();

    // Assert
    expect(order[order.length - 1]).toBe("encore-countdown");
  });

  it("given Gen 2 ruleset, when checking end-of-turn order, then defrost fires after leftovers", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:287-289
    // HandleLeftovers (line 287) → HandleMysteryberry (288) → HandleDefrost (289)
    // Arrange
    const ruleset = new Gen2Ruleset();

    // Act
    const order = ruleset.getEndOfTurnOrder();
    const leftIdx = order.indexOf("leftovers");
    const defrostIdx = order.indexOf("defrost");

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
    expect(order).not.toContain("defrost");
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
    const frozen = createMockActive({ status: "freeze" });
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
    const frozen = createMockActive({ status: "freeze" });
    let anyThaw = false;

    // Act
    for (let seed = 0; seed < 500; seed++) {
      const rng = new SeededRandom(seed);
      if (ruleset.checkFreezeThaw(frozen, rng)) {
        anyThaw = true;
        break;
      }
    }

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
    expect(order).toContain("defrost");
  });

  it("given checkFreezeThaw returns false, when checking that RNG is not consumed, then RNG state is unchanged", () => {
    // Source: pret/pokecrystal engine/battle/core.asm:289 HandleDefrost
    // Since checkFreezeThaw always returns false in Gen 2, it should NOT consume
    // any RNG values. This ensures battle replay determinism is preserved.
    // Arrange
    const ruleset = new Gen2Ruleset();
    const frozen = createMockActive({ status: "freeze" });
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
