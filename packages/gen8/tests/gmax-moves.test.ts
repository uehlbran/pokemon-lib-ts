import { CORE_MOVE_CATEGORIES, CORE_TYPE_IDS } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";

import {
  GMAX_MOVES,
  getGMaxMove,
  getGMaxMoveEffect,
  isGigantamaxEligible,
} from "../src/Gen8GMaxMoves.js";

const TYPE_IDS = CORE_TYPE_IDS;

describe("Gen8GMaxMoves", () => {
  describe("GMAX_MOVES table", () => {
    it("given the GMAX_MOVES table, when reading keys, then exact canonical ids are present in order", () => {
      // Source: Showdown data/moves.ts lines 6955-7760 -- 32 G-Max moves total
      expect(Object.keys(GMAX_MOVES)).toEqual([
        "gmax-befuddle",
        "gmax-cannonade",
        "gmax-centiferno",
        "gmax-chi-strike",
        "gmax-cuddle",
        "gmax-depletion",
        "gmax-drum-solo",
        "gmax-finale",
        "gmax-fireball",
        "gmax-foam-burst",
        "gmax-gold-rush",
        "gmax-gravitas",
        "gmax-hydrosnipe",
        "gmax-malodor",
        "gmax-meltdown",
        "gmax-one-blow",
        "gmax-rapid-flow",
        "gmax-replenish",
        "gmax-resonance",
        "gmax-sandblast",
        "gmax-smite",
        "gmax-snooze",
        "gmax-steelsurge",
        "gmax-stonesurge",
        "gmax-stun-shock",
        "gmax-sweetness",
        "gmax-tartness",
        "gmax-terror",
        "gmax-vine-lash",
        "gmax-volcalith",
        "gmax-volt-crash",
        "gmax-wildfire",
      ]);
    });

    it("given GMAX_MOVES, when checking representative entries, then exact canonical payloads are present", () => {
      // Source: Showdown data/moves.ts -- G-Max move payloads are canonical and fixed
      expect(GMAX_MOVES["gmax-wildfire"]).toEqual({
        species: "Charizard",
        moveType: "fire",
        effect: { type: "residual", duration: 4, damage: "1/6", immunity: ["fire"] },
      });
      expect(GMAX_MOVES["gmax-steelsurge"]).toEqual({
        species: "Copperajah",
        moveType: "steel",
        effect: { type: "hazard", hazard: "gmax-steelsurge" },
      });
      expect(GMAX_MOVES["gmax-drum-solo"]).toEqual({
        species: "Rillaboom",
        moveType: "grass",
        effect: { type: "ignore-ability" },
        basePower: 160,
      });
      expect(GMAX_MOVES["gmax-volt-crash"]).toEqual({
        species: "Pikachu",
        moveType: "electric",
        effect: { type: "status", status: "par" },
      });
    });
  });

  describe("getGMaxMove", () => {
    it("given Charizard species name, when looking up G-Max move, then returns G-Max Wildfire (Fire type)", () => {
      // Source: Showdown data/moves.ts -- gmaxWildfire for Charizard
      const result = getGMaxMove("Charizard");
      expect(result).toEqual({
        species: "Charizard",
        moveType: TYPE_IDS.fire,
        effect: { type: "residual", duration: 4, damage: "1/6", immunity: [TYPE_IDS.fire] },
      });
    });

    it("given Pikachu species name, when looking up G-Max move, then returns G-Max Volt Crash (Electric)", () => {
      // Source: Showdown data/moves.ts -- gmaxVoltCrash for Pikachu
      const result = getGMaxMove("Pikachu");
      expect(result).toEqual({
        species: "Pikachu",
        moveType: TYPE_IDS.electric,
        effect: { type: CORE_MOVE_CATEGORIES.status, status: "par" },
      });
    });

    it("given species name in lowercase, when looking up G-Max move, then finds it case-insensitively", () => {
      // Source: Implementation -- species lookup is case-insensitive
      expect(getGMaxMove("charizard")).toEqual(getGMaxMove("Charizard"));
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
      expect(result).toEqual({
        species: "Rillaboom",
        moveType: TYPE_IDS.grass,
        effect: { type: "ignore-ability" },
        basePower: 160,
      });
    });
  });

  describe("getGMaxMoveEffect", () => {
    it("given gmax-steelsurge ID, when looking up effect, then returns Steel type with hazard effect", () => {
      // Source: Showdown data/moves.ts -- gmaxSteelsurge sets Steel-type hazard
      const result = getGMaxMoveEffect("gmax-steelsurge");
      expect(result).toEqual({
        species: "Copperajah",
        moveType: TYPE_IDS.steel,
        effect: { type: "hazard", hazard: "gmax-steelsurge" },
      });
    });

    it("given gmax-wildfire ID, when looking up effect, then returns residual damage with fire immunity", () => {
      // Source: Showdown data/moves.ts -- gmaxWildfire: 1/6 residual, 4 turns, fire immune
      const result = getGMaxMoveEffect("gmax-wildfire");
      expect(result).toEqual({
        species: "Charizard",
        moveType: TYPE_IDS.fire,
        effect: {
          type: "residual",
          duration: 4,
          damage: "1/6",
          immunity: [TYPE_IDS.fire],
        },
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
          gMaxMove: {
            type: TYPE_IDS.fire,
            name: "G-Max Wildfire",
            basePower: 160,
            effect: "residual",
          },
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
