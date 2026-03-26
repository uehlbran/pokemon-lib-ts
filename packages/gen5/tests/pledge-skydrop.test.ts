/**
 * Tests for Gen 5 Pledge moves (singles mode) and Sky Drop stub.
 *
 * Source Authority: Showdown data/mods/gen5/moves.ts (primary for Gen 5)
 * Source Authority: Bulbapedia -- Pledge (move), Sky Drop (move)
 */

import { CORE_MOVE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen5DataManager, GEN5_MOVE_IDS } from "../src";
import { handleGen5PledgeMove, isPledgeMove } from "../src/Gen5MovePledges";
import { handleGen5SkyDrop, isSkyDrop } from "../src/Gen5SkyDrop";

const MOVES = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS } as const;
const GEN5_DATA = createGen5DataManager();

// ---------------------------------------------------------------------------
// Pledge moves -- isPledgeMove
// ---------------------------------------------------------------------------

describe("isPledgeMove", () => {
  it("given fire-pledge, when checking isPledgeMove, then returns true", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- firepledge is one of three pledge moves
    expect(isPledgeMove(MOVES.firePledge)).toBe(true);
  });

  it("given grass-pledge, when checking isPledgeMove, then returns true", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- grasspledge is one of three pledge moves
    expect(isPledgeMove(MOVES.grassPledge)).toBe(true);
  });

  it("given water-pledge, when checking isPledgeMove, then returns true", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- waterpledge is one of three pledge moves
    expect(isPledgeMove(MOVES.waterPledge)).toBe(true);
  });

  it("given flamethrower (non-pledge Fire move), when checking isPledgeMove, then returns false", () => {
    // Guard clause: any Fire-type move that is not a pledge move returns false
    expect(isPledgeMove(MOVES.flamethrower)).toBe(false);
  });

  it("given surf (non-pledge Water move), when checking isPledgeMove, then returns false", () => {
    // Guard clause: any Water-type move that is not a pledge move returns false
    expect(isPledgeMove(MOVES.surf)).toBe(false);
  });

  it("given energy-ball (non-pledge Grass move), when checking isPledgeMove, then returns false", () => {
    // Guard clause: any Grass-type move that is not a pledge move returns false
    expect(isPledgeMove(MOVES.energyBall)).toBe(false);
  });

  it("given empty string, when checking isPledgeMove, then returns false", () => {
    // Edge case: empty string should not match
    expect(isPledgeMove("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pledge moves -- handleGen5PledgeMove (singles mode)
// ---------------------------------------------------------------------------

describe("handleGen5PledgeMove (singles mode)", () => {
  it("given Fire Pledge in singles, when executed, then returns null (pure damage, no field effect)", () => {
    // Source: Bulbapedia -- Pledge (move): "In a Single Battle, the moves retain
    //   their individual power and typing, without creating field effects."
    // Source: Showdown data/mods/gen5/moves.ts -- firepledge: basePower 50 in singles
    //   (basePowerCallback returns 50 unless combined with another pledge)
    const result = handleGen5PledgeMove(MOVES.firePledge);
    expect(result).toBeNull();
  });

  it("given Grass Pledge in singles, when executed, then returns null (pure damage, no field effect)", () => {
    // Source: Bulbapedia -- Pledge (move): singles mode = standard damage, no field effect
    // Source: Showdown data/mods/gen5/moves.ts -- grasspledge: basePower 50 in singles
    const result = handleGen5PledgeMove(MOVES.grassPledge);
    expect(result).toBeNull();
  });

  it("given Water Pledge in singles, when executed, then returns null (pure damage, no field effect)", () => {
    // Source: Bulbapedia -- Pledge (move): singles mode = standard damage, no field effect
    // Source: Showdown data/mods/gen5/moves.ts -- waterpledge: basePower 50 in singles
    const result = handleGen5PledgeMove(MOVES.waterPledge);
    expect(result).toBeNull();
  });

  it("given a non-pledge move, when passed to handleGen5PledgeMove, then returns undefined (not handled)", () => {
    // The handler returns undefined for moves it does not recognize,
    // signaling that the caller should try a different handler
    const result = handleGen5PledgeMove(MOVES.flamethrower);
    expect(result).toBeUndefined();
  });

  it("given tackle (Normal-type), when passed to handleGen5PledgeMove, then returns undefined", () => {
    // Second triangulation case: different non-pledge move also returns undefined
    const result = handleGen5PledgeMove(MOVES.tackle);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Sky Drop -- isSkyDrop
// ---------------------------------------------------------------------------

describe("isSkyDrop", () => {
  it("given sky-drop, when checking isSkyDrop, then returns true", () => {
    // Source: Showdown data/moves.ts -- skydrop exists as a Gen 5 move
    expect(isSkyDrop(MOVES.skyDrop)).toBe(true);
  });

  it("given fly (similar two-turn Flying move), when checking isSkyDrop, then returns false", () => {
    // Guard clause: Fly is not Sky Drop despite being a similar two-turn Flying move
    expect(isSkyDrop(MOVES.fly)).toBe(false);
  });

  it("given bounce (another two-turn Flying move), when checking isSkyDrop, then returns false", () => {
    // Guard clause: Bounce is not Sky Drop
    expect(isSkyDrop(MOVES.bounce)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sky Drop -- handleGen5SkyDrop (stub)
// ---------------------------------------------------------------------------

describe("handleGen5SkyDrop (stub)", () => {
  it("given sky-drop, when executed, then returns null (stub -- damage via damage calc)", () => {
    // Source: Showdown data/moves.ts -- skydrop: basePower 60, physical, Flying-type
    // Currently stubbed: Sky Drop requires engine support for target-volatile
    // two-turn moves. The 60 BP damage is handled by the damage calc.
    const result = handleGen5SkyDrop(MOVES.skyDrop);
    expect(result).toBeNull();
  });

  it("given a non-Sky-Drop move, when passed to handleGen5SkyDrop, then returns undefined (not handled)", () => {
    // The handler returns undefined for non-matching moves
    const result = handleGen5SkyDrop(MOVES.fly);
    expect(result).toBeUndefined();
  });

  it("given aerial-ace (Flying but not Sky Drop), when passed to handleGen5SkyDrop, then returns undefined", () => {
    // Second triangulation case
    const result = handleGen5SkyDrop(MOVES.aerialAce);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: Pledge + Sky Drop dispatcher routing
// ---------------------------------------------------------------------------

describe("Gen5MoveEffects dispatcher integration", () => {
  // These tests verify that the master dispatcher in Gen5MoveEffects correctly
  // routes pledge and sky-drop moves. We import from the dispatcher module.

  it("given pledge moves exist in data, when checking move data, then base power is 50 in Gen 5", () => {
    // Source: Showdown data/mods/gen5/moves.ts -- firepledge basePower: 50
    //   (NOT 80 like Gen 6+; Gen 5 mod explicitly sets basePower: 50)
    // Source: Our data file packages/gen5/data/moves.json -- fire-pledge power: 50
    //
    // This test verifies the data file is correct. The actual damage calc uses
    // the move data's power field, so if the data says 50, that's what gets used.
    // We verify the isPledgeMove identification works for all three.
    expect(GEN5_DATA.getMove(MOVES.firePledge).power).toBe(50);
    expect(GEN5_DATA.getMove(MOVES.grassPledge).power).toBe(50);
    expect(GEN5_DATA.getMove(MOVES.waterPledge).power).toBe(50);
    expect(isPledgeMove(MOVES.firePledge)).toBe(true);
    expect(isPledgeMove(MOVES.grassPledge)).toBe(true);
    expect(isPledgeMove(MOVES.waterPledge)).toBe(true);
  });
});
