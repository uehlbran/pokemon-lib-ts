/**
 * Tests that pulse moves have the correct `flags.pulse` value in Gen 5 move data.
 *
 * The pulse flag is used by Mega Launcher (Gen 6+) to boost pulse move damage by 1.5x.
 * Even though Mega Launcher doesn't exist in Gen 5, the flag should be correctly set
 * for data consistency and forward compatibility.
 *
 * Source: Showdown data/moves.ts -- pulse flag on moves
 * Source: Bulbapedia -- "Mega Launcher boosts the power of aura and pulse moves by 50%"
 */

import { describe, expect, it } from "vitest";
import { createGen5DataManager } from "../src/data";

describe("Gen 5 pulse flag correctness", () => {
  const dm = createGen5DataManager();

  it("given Aura Sphere in Gen 5, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- aurasphere: { flags: { pulse: 1 } }
    const move = dm.getMove("aura-sphere");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Dark Pulse in Gen 5, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- darkpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("dark-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Dragon Pulse in Gen 5, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- dragonpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("dragon-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Heal Pulse in Gen 5, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- healpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("heal-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Water Pulse in Gen 5, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- waterpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("water-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Tackle in Gen 5, when checking flags.pulse, then it is false", () => {
    // Source: Showdown data/moves.ts -- tackle does not have pulse flag
    const move = dm.getMove("tackle");
    expect(move.flags.pulse).toBe(false);
  });

  it("given Thunderbolt in Gen 5, when checking flags.pulse, then it is false", () => {
    // Source: Showdown data/moves.ts -- thunderbolt does not have pulse flag
    const move = dm.getMove("thunderbolt");
    expect(move.flags.pulse).toBe(false);
  });
});
