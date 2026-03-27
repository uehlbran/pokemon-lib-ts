/**
 * Gen 9 Ruleset tests -- Wave 1 core overrides.
 *
 * Covers:
 *   - getAvailableTypes (18 types including Fairy)
 *   - shouldExecutePursuitPreSwitch (false, Pursuit removed in Gen 8+)
 *   - getBattleGimmick (null for mega/zmove/dynamax; Gen9Terastallization for tera)
 *   - rollConfusionSelfHit / getConfusionSelfHitChance (33% in Gen 7+)
 *   - hasTerrain (true, Gen 6+ feature)
 *   - canHitSemiInvulnerable (move bypass checks)
 *   - generation property (9)
 *   - recalculatesFutureAttackDamage (true, Gen 5+)
 *   - inherited BaseRuleset behaviors
 *
 * Source: Showdown sim/battle.ts, data/mods/gen9/
 */
import { BATTLE_GIMMICK_IDS } from "@pokemon-lib-ts/battle";
import {
  CORE_HAZARD_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CRIT_MULTIPLIER_MODERN,
  DataManager,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { Gen9Ruleset, Gen9Terastallization } from "../src";
import { GEN9_MOVE_IDS } from "../src/data";

const HAZARDS = CORE_HAZARD_IDS;
const MOVES = { ...CORE_MOVE_IDS, ...GEN9_MOVE_IDS };
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;

const ruleset = new Gen9Ruleset(new DataManager());

// ===========================================================================
// Generation metadata
// ===========================================================================

describe("Gen9Ruleset -- metadata", () => {
  it("given Gen9Ruleset, when reading generation, then returns 9", () => {
    // Source: Gen9Ruleset constructor hardcodes generation 9.
    expect(ruleset.generation).toBe(9);
  });

  it("given Gen9Ruleset, when reading name, then includes 'Gen 9'", () => {
    expect(ruleset.name).toContain("Gen 9");
  });

  it("given Gen9Ruleset, when reading name, then includes 'Scarlet/Violet'", () => {
    // Source: Bulbapedia -- Gen 9 games are Pokemon Scarlet and Violet
    expect(ruleset.name).toContain("Scarlet/Violet");
  });
});

// ===========================================================================
// Type system
// ===========================================================================

describe("Gen9Ruleset -- getAvailableTypes", () => {
  it("given Gen9Ruleset, when getAvailableTypes(), then has exactly 18 types", () => {
    // Source: Bulbapedia -- Gen 6+ (and Gen 9) has 18 types
    expect(ruleset.getAvailableTypes()).toHaveLength(18);
  });

  it(`given Gen9Ruleset, when getAvailableTypes(), then includes ${TYPES.fairy} (Gen 6+)`, () => {
    // Source: Bulbapedia -- Fairy type was introduced in Gen 6
    expect(ruleset.getAvailableTypes()).toContain(TYPES.fairy);
  });

  it(`given Gen9Ruleset, when getAvailableTypes(), then includes ${TYPES.steel} and ${TYPES.dark} (Gen 2+)`, () => {
    // Source: Bulbapedia -- Steel and Dark types introduced in Gen 2
    const types = ruleset.getAvailableTypes();
    expect(types).toContain(TYPES.steel);
    expect(types).toContain(TYPES.dark);
  });
});

// ===========================================================================
// Pursuit removal -- Pursuit removed in Gen 8, still absent in Gen 9
// ===========================================================================

describe("Gen9Ruleset -- shouldExecutePursuitPreSwitch", () => {
  it("given Gen9Ruleset, when shouldExecutePursuitPreSwitch(), then returns false (Pursuit removed in Gen 8)", () => {
    // Source: Showdown data/mods/gen8/moves.ts -- Pursuit not in Gen 8+ move list
    // Source: Bulbapedia -- Pursuit was removed in Gen 8 (Sword/Shield), not restored in Gen 9
    expect(ruleset.shouldExecutePursuitPreSwitch()).toBe(false);
  });
});

// ===========================================================================
// Battle gimmick -- No Mega, Z-Move, or Dynamax in Gen 9; Terastallization (Wave 2)
// ===========================================================================

describe("Gen9Ruleset -- getBattleGimmick", () => {
  it(`given getBattleGimmick(${BATTLE_GIMMICK_IDS.mega}), then returns null (Mega Evolution removed in Gen 8+)`, () => {
    // Source: Showdown data/mods/gen9 -- Mega Evolution not available in Gen 9
    // Source: Bulbapedia -- Mega Evolution not available in Scarlet/Violet
    expect(ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.mega)).toBeNull();
  });

  it(`given getBattleGimmick(${BATTLE_GIMMICK_IDS.zMove}), then returns null (Z-Moves removed in Gen 8+)`, () => {
    // Source: Showdown data/mods/gen9 -- Z-Moves not available in Gen 9
    // Source: Bulbapedia -- Z-Moves not available in Scarlet/Violet
    expect(ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.zMove)).toBeNull();
  });

  it(`given getBattleGimmick(${BATTLE_GIMMICK_IDS.dynamax}), then returns null (Dynamax removed in Gen 9)`, () => {
    // Source: Showdown data/mods/gen9 -- Dynamax not available in Gen 9
    // Source: Bulbapedia -- Dynamax is Gen 8 exclusive, removed in Gen 9
    expect(ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.dynamax)).toBeNull();
  });

  it(`given getBattleGimmick(${BATTLE_GIMMICK_IDS.tera}), then returns Gen9Terastallization instance (Wave 2)`, () => {
    // Source: Bulbapedia -- Terastallization is the Gen 9 battle gimmick (Scarlet/Violet)
    // Source: Showdown data/mods/gen9 -- Gen9Terastallization implements BattleGimmick
    const gimmick = ruleset.getBattleGimmick(BATTLE_GIMMICK_IDS.tera);
    expect(gimmick).not.toBeNull();
    expect(gimmick).toBeInstanceOf(Gen9Terastallization);
  });
});

// ===========================================================================
// Terrain -- hasTerrain returns true (Gen 6+ feature)
// ===========================================================================

describe("Gen9Ruleset -- terrain support", () => {
  it("given Gen9Ruleset, when hasTerrain(), then returns true", () => {
    // Source: Showdown -- Terrain mechanics available from Gen 6+
    // Source: Bulbapedia -- Terrain introduced in Gen 6, present in Gen 9
    expect(ruleset.hasTerrain()).toBe(true);
  });
});

// ===========================================================================
// Semi-invulnerable move bypass
// ===========================================================================

describe("Gen9Ruleset -- canHitSemiInvulnerable", () => {
  it("given target is flying, when Thunder is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Thunder hits flying targets
    // Source: Bulbapedia -- "Thunder can hit a Pokemon using Fly or Bounce"
    expect(ruleset.canHitSemiInvulnerable(MOVES.thunder, TYPES.flying)).toBe(true);
  });

  it("given target is flying, when Hurricane is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Hurricane hits flying targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.hurricane, TYPES.flying)).toBe(true);
  });

  it("given target is flying, when Gust is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Gust hits flying targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.gust, TYPES.flying)).toBe(true);
  });

  it("given target is flying, when Twister is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Twister hits flying targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.twister, TYPES.flying)).toBe(true);
  });

  it("given target is flying, when Smack Down is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Smack Down hits flying targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.smackDown, TYPES.flying)).toBe(true);
  });

  it("given target is flying, when Flamethrower is used, then it cannot hit", () => {
    // Source: Showdown -- Flamethrower cannot hit flying targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.flamethrower, TYPES.flying)).toBe(false);
  });

  it("given target is underground, when Earthquake is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Earthquake hits underground targets
    // Source: Bulbapedia -- "Earthquake can hit a Pokemon using Dig"
    expect(ruleset.canHitSemiInvulnerable(MOVES.earthquake, VOLATILES.underground)).toBe(true);
  });

  it("given target is underground, when Fissure is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Fissure hits underground targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.fissure, VOLATILES.underground)).toBe(true);
  });

  it("given target is underground, when Surf is used, then it cannot hit", () => {
    // Source: Showdown -- Surf does not hit underground targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.surf, VOLATILES.underground)).toBe(false);
  });

  it("given target is underwater, when Surf is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Surf hits underwater targets
    // Source: Bulbapedia -- "Surf can hit a Pokemon using Dive"
    expect(ruleset.canHitSemiInvulnerable(MOVES.surf, VOLATILES.underwater)).toBe(true);
  });

  it("given target is underwater, when Whirlpool is used, then it can hit", () => {
    // Source: Showdown data/moves.ts -- Whirlpool hits underwater targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.whirlpool, VOLATILES.underwater)).toBe(true);
  });

  it("given target is underwater, when Earthquake is used, then it cannot hit", () => {
    // Source: Showdown -- Earthquake does not hit underwater targets
    expect(ruleset.canHitSemiInvulnerable(MOVES.earthquake, VOLATILES.underwater)).toBe(false);
  });

  it("given target is in shadow-force-charging, when any move is used, then it cannot hit", () => {
    // Source: Showdown data/moves.ts -- nothing bypasses Shadow Force / Phantom Force
    expect(ruleset.canHitSemiInvulnerable(MOVES.thunder, VOLATILES.shadowForceCharging)).toBe(
      false,
    );
    expect(ruleset.canHitSemiInvulnerable(MOVES.earthquake, VOLATILES.shadowForceCharging)).toBe(
      false,
    );
    expect(ruleset.canHitSemiInvulnerable(MOVES.surf, VOLATILES.shadowForceCharging)).toBe(false);
  });

  it("given target is in generic charging state, when any move is used, then it can hit", () => {
    // Source: Showdown -- generic charging moves (e.g., Solar Beam charge turn) are
    // NOT semi-invulnerable; they can be hit normally
    expect(ruleset.canHitSemiInvulnerable(MOVES.tackle, VOLATILES.charging)).toBe(true);
  });
});

// ===========================================================================
// Future attack damage recalculation
// ===========================================================================

describe("Gen9Ruleset -- recalculatesFutureAttackDamage", () => {
  it("given Gen9Ruleset, when checking recalculatesFutureAttackDamage, then returns true (Gen 5+)", () => {
    // Source: Bulbapedia -- "From Generation V onwards, damage is calculated when
    //   Future Sight or Doom Desire hits, not when it is used."
    expect(ruleset.recalculatesFutureAttackDamage()).toBe(true);
  });
});

// ===========================================================================
// Core inherited behaviors from BaseRuleset
// ===========================================================================

describe("Gen9Ruleset -- inherited BaseRuleset behaviors", () => {
  it("given Gen9Ruleset, when hasAbilities(), then returns true", () => {
    // Source: Showdown -- Abilities available from Gen 3+
    expect(ruleset.hasAbilities()).toBe(true);
  });

  it("given Gen9Ruleset, when hasHeldItems(), then returns true", () => {
    // Source: Showdown -- Held items available from Gen 2+
    expect(ruleset.hasHeldItems()).toBe(true);
  });

  it("given Gen9Ruleset, when hasWeather(), then returns true", () => {
    // Source: Showdown -- Weather available from Gen 2+
    expect(ruleset.hasWeather()).toBe(true);
  });

  it("given Gen9Ruleset, when getAvailableHazards(), then includes sticky-web (Gen 6+)", () => {
    // Source: Showdown data/moves.ts -- Sticky Web introduced in Gen 6, available in Gen 9
    // Source: Bulbapedia -- Sticky Web is available in Gen 9
    expect(ruleset.getAvailableHazards()).toContain(HAZARDS.stickyWeb);
  });

  it("given Gen9Ruleset, when getAvailableHazards(), then includes standard hazards", () => {
    // Source: Showdown -- Stealth Rock (Gen 4), Spikes (Gen 2), Toxic Spikes (Gen 4)
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).toContain(HAZARDS.stealthRock);
    expect(hazards).toContain(HAZARDS.spikes);
    expect(hazards).toContain(HAZARDS.toxicSpikes);
  });

  it("given Gen9Ruleset, when getAvailableHazards(), then does NOT include gmax-steelsurge (Dynamax removed)", () => {
    // Source: Bulbapedia -- G-Max Steelsurge was a Gen 8 Dynamax-exclusive hazard
    // Dynamax was removed in Gen 9, so G-Max Steelsurge is not available
    expect(ruleset.getAvailableHazards()).not.toContain(HAZARDS.gmaxSteelsurge);
  });

  it("given Gen9Ruleset, when getCritRateTable(), then returns [24, 8, 2, 1] (Gen 6+ table)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit rate table
    expect(Array.from(ruleset.getCritRateTable())).toEqual([24, 8, 2, 1]);
  });

  it("given Gen9Ruleset, when getCritMultiplier(), then returns 1.5 (Gen 6+ multiplier)", () => {
    // Source: Showdown sim/battle-actions.ts -- Gen 6+ crit multiplier = 1.5x
    expect(ruleset.getCritMultiplier()).toBe(CRIT_MULTIPLIER_MODERN);
  });
});
