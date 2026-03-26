import {
  CORE_MOVE_CATEGORIES,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  TYPES_BY_GEN,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  GEN8_MAX_MOVE_EFFECT_TYPES,
  getMaxMoveName,
  getMaxMovePower,
  getMaxMoveSecondaryEffect,
  isMaxGuard,
} from "../src/Gen8MaxMoves.js";

describe("Gen8MaxMoves", () => {
  describe("getMaxMoveName", () => {
    it("given fire type damage move, when getting Max Move name, then returns Max Flare", () => {
      // Source: Showdown sim/battle-actions.ts line 12 -- Fire -> Max Flare
      const result = getMaxMoveName(CORE_TYPE_IDS.fire, false);
      expect(result).toBe("Max Flare");
    });

    it("given electric type damage move, when getting Max Move name, then returns Max Lightning", () => {
      // Source: Showdown sim/battle-actions.ts line 14 -- Electric -> Max Lightning
      const result = getMaxMoveName(CORE_TYPE_IDS.electric, false);
      expect(result).toBe("Max Lightning");
    });

    it("given normal type damage move, when getting Max Move name, then returns Max Strike", () => {
      // Source: Showdown sim/battle-actions.ts line 9 -- Normal -> Max Strike
      const result = getMaxMoveName(CORE_TYPE_IDS.normal, false);
      expect(result).toBe("Max Strike");
    });

    it("given flying type damage move, when getting Max Move name, then returns Max Airstream", () => {
      // Source: Showdown sim/battle-actions.ts line 20 -- Flying -> Max Airstream
      const result = getMaxMoveName(CORE_TYPE_IDS.flying, false);
      expect(result).toBe("Max Airstream");
    });

    it("given any type status move, when getting Max Move name, then returns Max Guard", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves always become Max Guard
      expect(getMaxMoveName(CORE_TYPE_IDS.fire, true)).toBe("Max Guard");
      expect(getMaxMoveName(CORE_TYPE_IDS.normal, true)).toBe("Max Guard");
      expect(getMaxMoveName(CORE_TYPE_IDS.psychic, true)).toBe("Max Guard");
    });

    it("given all 18 types, when getting Max Move name for damage moves, then returns unique names", () => {
      // Source: core/entities/types.ts -- Gen 8 uses the full 18-type chart
      const types = TYPES_BY_GEN[8];
      const names = types.map((t) => getMaxMoveName(t, false));
      const uniqueNames = new Set(names);
      expect(types).toHaveLength(18);
      expect(uniqueNames.size).toBe(types.length);
    });
  });

  describe("getMaxMovePower", () => {
    it("given Normal type move with BP 100, when converting to Max Move, then returns 130", () => {
      // Source: Showdown data/moves.ts -- standard table: 95-100 -> 130
      const result = getMaxMovePower(100, CORE_TYPE_IDS.normal);
      expect(result).toBe(130);
    });

    it("given Fire type move with BP 90, when converting to Max Move, then returns 125", () => {
      // Source: Showdown data/moves.ts -- standard table: 85-90 -> 125
      const result = getMaxMovePower(90, CORE_TYPE_IDS.fire);
      expect(result).toBe(125);
    });

    it("given Fighting type move with BP 100, when converting to Max Move, then returns 100", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table: 95-100 -> 100
      const result = getMaxMovePower(100, CORE_TYPE_IDS.fighting);
      expect(result).toBe(100);
    });

    it("given Poison type move with BP 100, when converting to Max Move, then returns 100", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table: 95-100 -> 100
      const result = getMaxMovePower(100, CORE_TYPE_IDS.poison);
      expect(result).toBe(100);
    });

    it("given status move (BP 0), when converting to Max Move, then returns 0", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves become Max Guard with BP 0
      const result = getMaxMovePower(0, CORE_TYPE_IDS.ghost);
      expect(result).toBe(0);
    });

    it("given very low BP (30) Normal type, when converting, then returns 90", () => {
      // Source: Showdown data/moves.ts -- standard table: 0-40 -> 90
      const result = getMaxMovePower(30, CORE_TYPE_IDS.normal);
      expect(result).toBe(90);
    });

    it("given very low BP (30) Fighting type, when converting, then returns 70", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table: 0-40 -> 70
      const result = getMaxMovePower(30, CORE_TYPE_IDS.fighting);
      expect(result).toBe(70);
    });

    it("given very high BP (200) standard type, when converting, then caps at 150", () => {
      // Source: Showdown data/moves.ts -- standard table caps at 150
      const result = getMaxMovePower(200, CORE_TYPE_IDS.dragon);
      expect(result).toBe(150);
    });

    it("given very high BP (200) Fighting type, when converting, then caps at 130", () => {
      // Source: Showdown data/moves.ts -- Poison/Fighting table caps at 130
      const result = getMaxMovePower(200, CORE_TYPE_IDS.fighting);
      expect(result).toBe(130);
    });

    it("given BP 60 Water type, when converting, then returns 110", () => {
      // Source: Showdown data/moves.ts -- standard table: 55-60 -> 110
      const result = getMaxMovePower(60, CORE_TYPE_IDS.water);
      expect(result).toBe(110);
    });

    it("given BP 120 Ice type, when converting, then returns 140", () => {
      // Source: Showdown data/moves.ts -- standard table: 115-120 -> 140
      const result = getMaxMovePower(120, CORE_TYPE_IDS.ice);
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
      const effect = getMaxMoveSecondaryEffect(getMaxMoveName(CORE_TYPE_IDS.fire, false));
      expect(effect).toEqual({ type: "weather", weather: CORE_WEATHER_IDS.sun });
    });

    it("given Max Lightning, when getting secondary effect, then returns terrain electric", () => {
      // Source: Bulbapedia "Max Lightning" -- sets Electric Terrain for 5 turns
      const effect = getMaxMoveSecondaryEffect(getMaxMoveName(CORE_TYPE_IDS.electric, false));
      expect(effect).toEqual({ type: "terrain", terrain: CORE_TERRAIN_IDS.electric });
    });

    it("given Max Guard, when getting secondary effect, then returns protect", () => {
      // Source: Bulbapedia "Max Guard" -- blocks all moves
      const effect = getMaxMoveSecondaryEffect(getMaxMoveName(CORE_TYPE_IDS.normal, true));
      expect(effect).toEqual({ type: GEN8_MAX_MOVE_EFFECT_TYPES.protect });
    });

    it("given Max Darkness, when getting secondary effect, then returns -1 SpDef opponent-side", () => {
      // Source: Bulbapedia "Max Darkness" -- lowers SpDef by 1 for opponent's side
      const effect = getMaxMoveSecondaryEffect(getMaxMoveName(CORE_TYPE_IDS.dark, false));
      expect(effect).toEqual({
        type: "stat-boost",
        stat: "spDefense",
        stages: -1,
        target: "opponent-side",
      });
    });

    it("given Max Phantasm, when getting secondary effect, then returns -1 Def opponent", () => {
      // Source: Bulbapedia "Max Phantasm" -- lowers Def by 1 for opponent
      const effect = getMaxMoveSecondaryEffect(getMaxMoveName(CORE_TYPE_IDS.ghost, false));
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
      const effect = getMaxMoveSecondaryEffect(getMaxMoveName(CORE_TYPE_IDS.fairy, false));
      expect(effect).toEqual({ type: "terrain", terrain: CORE_TERRAIN_IDS.misty });
    });
  });

  describe("isMaxGuard", () => {
    it("given status category move, when checking isMaxGuard, then returns true", () => {
      // Source: Showdown sim/battle-actions.ts -- status moves become Max Guard
      expect(isMaxGuard({ category: CORE_MOVE_CATEGORIES.status })).toBe(true);
    });

    it("given physical category move, when checking isMaxGuard, then returns false", () => {
      expect(isMaxGuard({ category: CORE_MOVE_CATEGORIES.physical })).toBe(false);
    });

    it("given special category move, when checking isMaxGuard, then returns false", () => {
      expect(isMaxGuard({ category: CORE_MOVE_CATEGORIES.special })).toBe(false);
    });
  });
});
