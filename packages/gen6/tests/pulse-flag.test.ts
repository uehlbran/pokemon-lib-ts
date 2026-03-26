/**
 * Tests that pulse moves have the correct `flags.pulse` value in Gen 6 move data.
 *
 * The pulse flag is used by Mega Launcher to boost pulse move damage by 1.5x.
 * Gen 6 introduced Mega Launcher (Mega Blastoise), making this flag critical.
 *
 * Source: Showdown data/moves.ts -- pulse flag on moves
 * Source: Bulbapedia -- "Mega Launcher boosts the power of aura and pulse moves by 50%"
 */

import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen6DataManager, GEN6_MOVE_IDS } from "../src";

describe("Gen 6 pulse flag correctness", () => {
  const dm = createGen6DataManager();
  const AURA_SPHERE_MOVE = dm.getMove(GEN6_MOVE_IDS.auraSphere);
  const DARK_PULSE_MOVE = dm.getMove(GEN6_MOVE_IDS.darkPulse);
  const DRAGON_PULSE_MOVE = dm.getMove(GEN6_MOVE_IDS.dragonPulse);
  const HEAL_PULSE_MOVE = dm.getMove(GEN6_MOVE_IDS.healPulse);
  const ORIGIN_PULSE_MOVE = dm.getMove(GEN6_MOVE_IDS.originPulse);
  const WATER_PULSE_MOVE = dm.getMove(GEN6_MOVE_IDS.waterPulse);
  const TACKLE_MOVE = dm.getMove(CORE_MOVE_IDS.tackle);
  const FLAMETHROWER_MOVE = dm.getMove(CORE_MOVE_IDS.flamethrower);

  it("given Aura Sphere in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- aurasphere: { flags: { pulse: 1 } }
    expect(AURA_SPHERE_MOVE.flags.pulse).toBe(true);
  });

  it("given Dark Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- darkpulse: { flags: { pulse: 1 } }
    expect(DARK_PULSE_MOVE.flags.pulse).toBe(true);
  });

  it("given Dragon Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- dragonpulse: { flags: { pulse: 1 } }
    expect(DRAGON_PULSE_MOVE.flags.pulse).toBe(true);
  });

  it("given Heal Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- healpulse: { flags: { pulse: 1 } }
    expect(HEAL_PULSE_MOVE.flags.pulse).toBe(true);
  });

  it("given Origin Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- originpulse: { flags: { pulse: 1 } }
    expect(ORIGIN_PULSE_MOVE.flags.pulse).toBe(true);
  });

  it("given Water Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- waterpulse: { flags: { pulse: 1 } }
    expect(WATER_PULSE_MOVE.flags.pulse).toBe(true);
  });

  it("given Tackle in Gen 6, when checking flags.pulse, then it is false", () => {
    // Source: Showdown data/moves.ts -- tackle does not have pulse flag
    expect(TACKLE_MOVE.flags.pulse).toBe(false);
  });

  it("given Flamethrower in Gen 6, when checking flags.pulse, then it is false", () => {
    // Source: Showdown data/moves.ts -- flamethrower does not have pulse flag
    expect(FLAMETHROWER_MOVE.flags.pulse).toBe(false);
  });
});
