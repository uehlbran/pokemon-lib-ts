/**
 * Gen 8 Ruleset tests -- Wave 1 core overrides.
 *
 * Covers:
 *   - getAvailableTypes (18 types including Fairy)
 *   - shouldExecutePursuitPreSwitch (false, Pursuit removed in Gen 8)
 *   - getBattleGimmick (null for mega/zmove; dynamax stub for Wave 8)
 *   - rollConfusionSelfHit / getConfusionSelfHitChance (33% in Gen 7+)
 *   - hasTerrain (true, Gen 6+ feature)
 *   - generation property (8)
 *
 * Source: Showdown sim/battle.ts, data/mods/gen8/moves.ts
 */
import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { SeededRandom } from "@pokemon-lib-ts/core";
import { DataManager } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen8Ruleset } from "../src/Gen8Ruleset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRng(overrides?: {
  next?: () => number;
  chance?: (p: number) => boolean;
}): SeededRandom {
  return {
    next: overrides?.next ?? (() => 0.5),
    int: (min: number, _max: number) => min,
    chance: overrides?.chance ?? (() => false),
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: T[]) => arr,
    getState: () => 0,
    setState: () => {},
  } as unknown as SeededRandom;
}

const ruleset = new Gen8Ruleset(new DataManager());

// ===========================================================================
// Generation metadata
// ===========================================================================

describe("Gen8Ruleset -- metadata", () => {
  it("given Gen8Ruleset, when reading generation, then returns 8", () => {
    expect(ruleset.generation).toBe(8);
  });

  it("given Gen8Ruleset, when reading name, then includes 'Gen 8'", () => {
    expect(ruleset.name).toContain("Gen 8");
  });
});

// ===========================================================================
// Type system
// ===========================================================================

describe("Gen8Ruleset -- getAvailableTypes", () => {
  it("given Gen8Ruleset, when getAvailableTypes(), then has exactly 18 types", () => {
    // Source: Bulbapedia -- Gen 6+ (and Gen 8) has 18 types
    expect(ruleset.getAvailableTypes()).toHaveLength(18);
  });

  it("given Gen8Ruleset, when getAvailableTypes(), then includes 'fairy' (Gen 6+)", () => {
    // Source: Bulbapedia -- Fairy type was introduced in Gen 6
    expect(ruleset.getAvailableTypes()).toContain("fairy");
  });

  it("given Gen8Ruleset, when getAvailableTypes(), then includes 'steel' and 'dark' (Gen 2+)", () => {
    // Source: Bulbapedia -- Steel and Dark types introduced in Gen 2
    const types = ruleset.getAvailableTypes();
    expect(types).toContain("steel");
    expect(types).toContain("dark");
  });
});

// ===========================================================================
// Pursuit removal -- Gen 8 removed Pursuit
// ===========================================================================

describe("Gen8Ruleset -- shouldExecutePursuitPreSwitch", () => {
  it("given Gen8Ruleset, when shouldExecutePursuitPreSwitch(), then returns false (Pursuit removed in Gen 8)", () => {
    // Source: Showdown data/mods/gen8/moves.ts -- Pursuit not in Gen 8 move list
    // Source: Bulbapedia -- Pursuit was removed in Gen 8 (Sword/Shield)
    expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(false);
  });
});

// ===========================================================================
// Battle gimmick -- Mega and Z-Move removed, Dynamax is Wave 8 stub
// ===========================================================================

describe("Gen8Ruleset -- getBattleGimmick", () => {
  it("given getBattleGimmick('mega'), then returns null (Mega Evolution removed in Gen 8)", () => {
    // Source: Showdown data/mods/gen8 -- Mega Evolution not available in Gen 8
    // Source: Bulbapedia -- Mega Evolution not available in Sword/Shield
    expect(ruleset.getBattleGimmick("mega")).toBeNull();
  });

  it("given getBattleGimmick('zmove'), then returns null (Z-Moves removed in Gen 8)", () => {
    // Source: Showdown data/mods/gen8 -- Z-Moves not available in Gen 8
    // Source: Bulbapedia -- Z-Moves not available in Sword/Shield
    expect(ruleset.getBattleGimmick("zmove")).toBeNull();
  });

  it("given getBattleGimmick('dynamax'), then returns Gen8Dynamax gimmick", () => {
    // Source: Bulbapedia -- Dynamax is the Gen 8 battle gimmick
    // Source: Showdown data/conditions.ts -- Dynamax condition
    const gimmick = ruleset.getBattleGimmick("dynamax");
    expect(gimmick).not.toBeNull();
    expect(gimmick!.name).toBe("Dynamax");
    expect(gimmick!.generations).toEqual([8]);
  });

  it("given getBattleGimmick('tera'), then returns null (Tera is Gen 9 only)", () => {
    // Source: Showdown -- Terastallization is Gen 9 exclusive
    expect(ruleset.getBattleGimmick("tera")).toBeNull();
  });
});

// ===========================================================================
// Confusion -- 33% self-hit (Gen 7+ mechanic, unchanged in Gen 8)
// ===========================================================================

describe("Gen8Ruleset -- confusion self-hit", () => {
  it("given getConfusionSelfHitChance(), then returns 1/3 (~33%)", () => {
    // Source: Showdown sim/battle-actions.ts -- confusion self-hit 33% from Gen 7 onwards
    // Source: Bulbapedia -- "From Generation VII onwards, the chance of hitting itself
    //   in confusion has decreased from 50% to approximately 33%."
    expect(ruleset.getConfusionSelfHitChance()).toBeCloseTo(1 / 3);
  });

  it("given SeededRandom that always returns below 1/3, when rollConfusionSelfHit, then returns true", () => {
    // Source: Showdown sim/battle-actions.ts -- confusion 33% from Gen 7 onwards
    // rng.chance(1/3) returns true when rng < 1/3
    const rng = makeRng({ chance: () => true });
    expect(ruleset.rollConfusionSelfHit(rng)).toBe(true);
  });

  it("given SeededRandom that always returns above 1/3, when rollConfusionSelfHit, then returns false", () => {
    // Source: Showdown sim/battle-actions.ts -- confusion 33% from Gen 7 onwards
    const rng = makeRng({ chance: () => false });
    expect(ruleset.rollConfusionSelfHit(rng)).toBe(false);
  });
});

// ===========================================================================
// Terrain -- hasTerrain returns true (Gen 6+ feature)
// ===========================================================================

describe("Gen8Ruleset -- terrain support", () => {
  it("given Gen8Ruleset, when hasTerrain(), then returns true", () => {
    // Source: Showdown -- Terrain mechanics available from Gen 6+
    // Source: Bulbapedia -- Terrain introduced in Gen 6, present in Gen 8
    expect(ruleset.hasTerrain()).toBe(true);
  });
});

// ===========================================================================
// Core inherited behaviors from BaseRuleset
// ===========================================================================

describe("Gen8Ruleset -- inherited BaseRuleset behaviors", () => {
  it("given Gen8Ruleset, when hasAbilities(), then returns true", () => {
    // Source: Showdown -- Abilities available from Gen 3+
    expect(ruleset.hasAbilities()).toBe(true);
  });

  it("given Gen8Ruleset, when hasHeldItems(), then returns true", () => {
    // Source: Showdown -- Held items available from Gen 2+
    expect(ruleset.hasHeldItems()).toBe(true);
  });

  it("given Gen8Ruleset, when hasWeather(), then returns true", () => {
    // Source: Showdown -- Weather available from Gen 2+
    expect(ruleset.hasWeather()).toBe(true);
  });

  it("given Gen8Ruleset, when getAvailableHazards(), then includes sticky-web (Gen 6+)", () => {
    // Source: Showdown data/moves.ts -- Sticky Web introduced in Gen 6, available in Gen 8
    // Source: Bulbapedia -- Sticky Web is available in Gen 8
    expect(ruleset.getAvailableHazards()).toContain("sticky-web");
  });

  it("given Gen8Ruleset, when getAvailableHazards(), then includes standard hazards", () => {
    // Source: Showdown -- Stealth Rock (Gen 4), Spikes (Gen 2), Toxic Spikes (Gen 4)
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toContain("stealth-rock");
    expect(hazards).toContain("spikes");
    expect(hazards).toContain("toxic-spikes");
  });
});
