import { describe, expect, it } from "vitest";

import {
  GMAX_MOVES,
  getGMaxMove,
  getGMaxMoveEffect,
  isGigantamaxEligible,
} from "../src/Gen8GMaxMoves.js";

describe("Gen8GMaxMoves", () => {
  describe("GMAX_MOVES table", () => {
    it("given the GMAX_MOVES table, when counting entries, then has exactly 32 entries", () => {
      // Source: Showdown data/moves.ts lines 6955-7760 -- 32 G-Max moves total
      expect(Object.keys(GMAX_MOVES).length).toBe(32);
    });

    it("given GMAX_MOVES, when checking all entries, then each has species, moveType, and effect", () => {
      // Source: Showdown data/moves.ts -- all G-Max entries have these fields
      for (const [id, data] of Object.entries(GMAX_MOVES)) {
        expect(data.species, `${id} missing species`).toBeTruthy();
        expect(data.moveType, `${id} missing moveType`).toBeTruthy();
        expect(data.effect, `${id} missing effect`).toBeTruthy();
      }
    });
  });

  describe("getGMaxMove", () => {
    it("given Charizard species name, when looking up G-Max move, then returns G-Max Wildfire (Fire type)", () => {
      // Source: Showdown data/moves.ts -- gmaxWildfire for Charizard
      const result = getGMaxMove("Charizard");
      expect(result).not.toBeNull();
      expect(result!.species).toBe("Charizard");
      expect(result!.moveType).toBe("fire");
      expect(result!.effect.type).toBe("residual");
    });

    it("given Pikachu species name, when looking up G-Max move, then returns G-Max Volt Crash (Electric)", () => {
      // Source: Showdown data/moves.ts -- gmaxVoltCrash for Pikachu
      const result = getGMaxMove("Pikachu");
      expect(result).not.toBeNull();
      expect(result!.species).toBe("Pikachu");
      expect(result!.moveType).toBe("electric");
      expect(result!.effect.type).toBe("status");
    });

    it("given species name in lowercase, when looking up G-Max move, then finds it case-insensitively", () => {
      // Source: Implementation -- species lookup is case-insensitive
      const result = getGMaxMove("charizard");
      expect(result).not.toBeNull();
      expect(result!.species).toBe("Charizard");
    });

    it("given non-Gigantamax species name, when looking up G-Max move, then returns null", () => {
      const result = getGMaxMove("Magikarp");
      expect(result).toBeNull();
    });

    it("given numeric species ID, when looking up G-Max move, then returns null (requires name resolution)", () => {
      // Numeric IDs require data lookup not available in this module
      const result = getGMaxMove(6); // Charizard's ID
      expect(result).toBeNull();
    });

    it("given Rillaboom species, when looking up G-Max move, then returns 160 base power override", () => {
      // Source: Showdown data/moves.ts -- G-Max Drum Solo has basePower: 160
      const result = getGMaxMove("Rillaboom");
      expect(result).not.toBeNull();
      expect(result!.basePower).toBe(160);
      expect(result!.effect.type).toBe("ignore-ability");
    });
  });

  describe("getGMaxMoveEffect", () => {
    it("given gmax-steelsurge ID, when looking up effect, then returns Steel type with hazard effect", () => {
      // Source: Showdown data/moves.ts -- gmaxSteelsurge sets Steel-type hazard
      const result = getGMaxMoveEffect("gmax-steelsurge");
      expect(result).not.toBeNull();
      expect(result!.moveType).toBe("steel");
      expect(result!.effect).toEqual({ type: "hazard", hazard: "gmax-steelsurge" });
    });

    it("given gmax-wildfire ID, when looking up effect, then returns residual damage with fire immunity", () => {
      // Source: Showdown data/moves.ts -- gmaxWildfire: 1/6 residual, 4 turns, fire immune
      const result = getGMaxMoveEffect("gmax-wildfire");
      expect(result).not.toBeNull();
      expect(result!.effect).toEqual({
        type: "residual",
        duration: 4,
        damage: "1/6",
        immunity: ["fire"],
      });
    });

    it("given nonexistent move ID, when looking up effect, then returns null", () => {
      const result = getGMaxMoveEffect("gmax-nonexistent");
      expect(result).toBeNull();
    });

    it("given gmax-resonance ID, when looking up effect, then returns aurora-veil side condition", () => {
      // Source: Showdown data/moves.ts -- gmaxResonance sets Aurora Veil
      const result = getGMaxMoveEffect("gmax-resonance");
      expect(result).not.toBeNull();
      expect(result!.species).toBe("Lapras");
      expect(result!.effect).toEqual({ type: "side-condition", condition: "aurora-veil" });
    });
  });

  describe("isGigantamaxEligible", () => {
    it("given species with gigantamaxForm data, when checking eligibility, then returns true", () => {
      // Source: Game mechanic -- species with Gigantamax data can G-Max
      const species = {
        gigantamaxForm: {
          gMaxMove: { type: "fire", name: "G-Max Wildfire", basePower: 160, effect: "residual" },
        },
      };
      expect(isGigantamaxEligible(species)).toBe(true);
    });

    it("given species without gigantamaxForm data, when checking eligibility, then returns false", () => {
      // Source: Game mechanic -- species without Gigantamax data cannot G-Max
      const species = {};
      expect(isGigantamaxEligible(species)).toBe(false);
    });

    it("given species with null gigantamaxForm, when checking eligibility, then returns false", () => {
      const species = { gigantamaxForm: null };
      expect(isGigantamaxEligible(species)).toBe(false);
    });

    it("given species with undefined gigantamaxForm, when checking eligibility, then returns false", () => {
      const species = { gigantamaxForm: undefined };
      expect(isGigantamaxEligible(species)).toBe(false);
    });
  });
});
