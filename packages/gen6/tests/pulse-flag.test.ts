/**
 * Tests that pulse moves have the correct `flags.pulse` value in Gen 6 move data.
 *
 * The pulse flag is used by Mega Launcher to boost pulse move damage by 1.5x.
 * Gen 6 introduced Mega Launcher (Mega Blastoise), making this flag critical.
 *
 * Source: Showdown data/moves.ts -- pulse flag on moves
 * Source: Bulbapedia -- "Mega Launcher boosts the power of aura and pulse moves by 50%"
 */

import { describe, expect, it } from "vitest";
import { createGen6DataManager } from "../src/data";

describe("Gen 6 pulse flag correctness", () => {
  const dm = createGen6DataManager();

  it("given Aura Sphere in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- aurasphere: { flags: { pulse: 1 } }
    const move = dm.getMove("aura-sphere");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Dark Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- darkpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("dark-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Dragon Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- dragonpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("dragon-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Heal Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- healpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("heal-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Origin Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- originpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("origin-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Water Pulse in Gen 6, when checking flags.pulse, then it is true", () => {
    // Source: Showdown data/moves.ts -- waterpulse: { flags: { pulse: 1 } }
    const move = dm.getMove("water-pulse");
    expect(move.flags.pulse).toBe(true);
  });

  it("given Tackle in Gen 6, when checking flags.pulse, then it is false", () => {
    // Source: Showdown data/moves.ts -- tackle does not have pulse flag
    const move = dm.getMove("tackle");
    expect(move.flags.pulse).toBe(false);
  });

  it("given Flamethrower in Gen 6, when checking flags.pulse, then it is false", () => {
    // Source: Showdown data/moves.ts -- flamethrower does not have pulse flag
    const move = dm.getMove("flamethrower");
    expect(move.flags.pulse).toBe(false);
  });
});
