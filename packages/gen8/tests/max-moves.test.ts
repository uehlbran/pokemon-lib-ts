import { describe, expect, it } from "vitest";

import {
  getMaxMoveName,
  getMaxMovePower,
  getMaxMoveSecondaryEffect,
  isMaxGuard,
} from "../src/Gen8MaxMoves.js";

describe("Gen8MaxMoves", () => {
  describe("getMaxMoveName", () => {
    it("given fire type damage move, when getting Max Move name, then returns Max Flare", () => {
      // Source: Showdown sim/battle-actions.ts line 12 -- Fire -> Max Flare
      const result = getMaxMoveName("fire", false);
      expect(result).toBe("Max Flare");
    });

    it("given electric type damage move, when getting Max Move name, then returns Max Lightning", () => {
      // Source: Showdown sim/battle-actions.ts line 14 -- Electric -> Max Lightning
      const result = getMaxMoveName("electric", false);
      expect(result).toBe("Max Lightning");
    });

    it("given normal type damage move, when getting Max Move name, then returns Max Strike", () => {
      // Source: Showdown sim/battle-actions.ts line 9 -- Normal -> Max Strike
      const result = getMaxMoveName("normal", false);
      expect(result).toBe("Max Strike");
    });

    it("given flying type damage move, when getting Max Move name, then returns Max Airstream", () => {
      // Source: Showdown sim/battle-actions.ts line 20 -- Flying -> Max Airstream
      const result = getMaxMoveName("flying", false);
      expect(result).toBe("Max Airstream");
    });

    it("given any type status move, when getting Max Move name, then returns Max Guard", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves always become Max Guard
      expect(getMaxMoveName("fire", true)).toBe("Max Guard");
      expect(getMaxMoveName("normal", true)).toBe("Max Guard");
      expect(getMaxMoveName("psychic", true)).toBe("Max Guard");
    });

    it("given all 18 types, when getting Max Move name for damage moves, then returns unique names", () => {
      // Source: Showdown sim/battle-actions.ts lines 9-29 -- one Max Move per type
      const types = [
        "normal",
        "fire",
        "water",
        "electric",
        "grass",
        "ice",
        "fighting",
        "poison",
        "ground",
        "flying",
        "psychic",
        "bug",
        "rock",
        "ghost",
        "dragon",
        "dark",
        "steel",
        "fairy",
      ] as const;
      const names = types.map((t) => getMaxMoveName(t, false));
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(18);
    });
  });

  describe("getMaxMovePower", () => {
    it("given Normal type move with BP 100, when converting to Max Move, then returns 130", () => {
      // Source: Showdown data/moves.ts -- standard table: 95-100 -> 130
      const result = getMaxMovePower(100, "normal");
      expect(result).toBe(130);
    });

    it("given Fire type move with BP 90, when converting to Max Move, then returns 125", () => {
      // Source: Showdown data/moves.ts -- standard table: 85-90 -> 125
      const result = getMaxMovePower(90, "fire");
      expect(result).toBe(125);
    });

    it("given Fighting type move with BP 100, when converting to Max Move, then returns 100", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table: 95-100 -> 100
      const result = getMaxMovePower(100, "fighting");
      expect(result).toBe(100);
    });

    it("given Poison type move with BP 100, when converting to Max Move, then returns 100", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table: 95-100 -> 100
      const result = getMaxMovePower(100, "poison");
      expect(result).toBe(100);
    });

    it("given status move (BP 0), when converting to Max Move, then returns 0", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves become Max Guard with BP 0
      const result = getMaxMovePower(0, "ghost");
      expect(result).toBe(0);
    });

    it("given very low BP (30) Normal type, when converting, then returns 90", () => {
      // Source: Showdown data/moves.ts -- standard table: 0-40 -> 90
      const result = getMaxMovePower(30, "normal");
      expect(result).toBe(90);
    });

    it("given very low BP (30) Fighting type, when converting, then returns 70", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table: 0-40 -> 70
      const result = getMaxMovePower(30, "fighting");
      expect(result).toBe(70);
    });

    it("given very high BP (200) standard type, when converting, then caps at 150", () => {
      // Source: Showdown data/moves.ts -- standard table caps at 150
      const result = getMaxMovePower(200, "dragon");
      expect(result).toBe(150);
    });

    it("given very high BP (200) Fighting type, when converting, then caps at 130", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table caps at 130
      const result = getMaxMovePower(200, "fighting");
      expect(result).toBe(130);
    });

    it("given BP 60 Water type, when converting, then returns 110", () => {
      // Source: Showdown data/moves.ts -- standard table: 55-60 -> 110
      const result = getMaxMovePower(60, "water");
      expect(result).toBe(110);
    });

    it("given BP 120 Ice type, when converting, then returns 140", () => {
      // Source: Showdown data/moves.ts -- standard table: 115-120 -> 140
      const result = getMaxMovePower(120, "ice");
      expect(result).toBe(140);
    });
  });

  describe("getMaxMoveSecondaryEffect", () => {
    it("given Max Airstream, when getting secondary effect, then returns +1 Speed user-side", () => {
      // Source: Bulbapedia "Max Airstream" -- raises Speed by 1 for user's side
      const effect = getMaxMoveSecondaryEffect("Max Airstream");
      expect(effect).toEqual({
        type: "stat-boost",
        stat: "speed",
        stages: 1,
        target: "user-side",
      });
    });

    it("given Max Flare, when getting secondary effect, then returns weather sun", () => {
      // Source: Bulbapedia "Max Flare" -- sets harsh sun for 5 turns
      const effect = getMaxMoveSecondaryEffect("Max Flare");
      expect(effect).toEqual({ type: "weather", weather: "sun" });
    });

    it("given Max Lightning, when getting secondary effect, then returns terrain electric", () => {
      // Source: Bulbapedia "Max Lightning" -- sets Electric Terrain for 5 turns
      const effect = getMaxMoveSecondaryEffect("Max Lightning");
      expect(effect).toEqual({ type: "terrain", terrain: "electric" });
    });

    it("given Max Guard, when getting secondary effect, then returns protect", () => {
      // Source: Bulbapedia "Max Guard" -- blocks all moves
      const effect = getMaxMoveSecondaryEffect("Max Guard");
      expect(effect).toEqual({ type: "protect" });
    });

    it("given Max Darkness, when getting secondary effect, then returns -1 SpDef opponent-side", () => {
      // Source: Bulbapedia "Max Darkness" -- lowers SpDef by 1 for opponent's side
      const effect = getMaxMoveSecondaryEffect("Max Darkness");
      expect(effect).toEqual({
        type: "stat-boost",
        stat: "spDefense",
        stages: -1,
        target: "opponent-side",
      });
    });

    it("given Max Phantasm, when getting secondary effect, then returns -1 Def opponent", () => {
      // Source: Bulbapedia "Max Phantasm" -- lowers Def by 1 for opponent
      const effect = getMaxMoveSecondaryEffect("Max Phantasm");
      expect(effect).toEqual({
        type: "stat-boost",
        stat: "defense",
        stages: -1,
        target: "opponent",
      });
    });

    it("given unknown move name, when getting secondary effect, then returns null", () => {
      const effect = getMaxMoveSecondaryEffect("Not A Real Move");
      expect(effect).toBeNull();
    });

    it("given Max Starfall, when getting secondary effect, then returns terrain misty", () => {
      // Source: Bulbapedia "Max Starfall" -- sets Misty Terrain
      const effect = getMaxMoveSecondaryEffect("Max Starfall");
      expect(effect).toEqual({ type: "terrain", terrain: "misty" });
    });
  });

  describe("isMaxGuard", () => {
    it("given status category move, when checking isMaxGuard, then returns true", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves become Max Guard
      expect(isMaxGuard({ category: "status" })).toBe(true);
    });

    it("given physical category move, when checking isMaxGuard, then returns false", () => {
      expect(isMaxGuard({ category: "physical" })).toBe(false);
    });

    it("given special category move, when checking isMaxGuard, then returns false", () => {
      expect(isMaxGuard({ category: "special" })).toBe(false);
    });
  });
});
