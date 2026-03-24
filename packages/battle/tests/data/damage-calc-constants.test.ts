import { describe, expect, it } from "vitest";
import { BASE_PINCH_ABILITY_TYPES, BASE_PLATE_ITEMS, BASE_TYPE_BOOST_ITEMS } from "../../src/data";

describe("battle damage-calc shared constants", () => {
  it("exposes the stable offensive boost tables", () => {
    expect(Object.keys(BASE_TYPE_BOOST_ITEMS)).toHaveLength(17);
    expect(BASE_TYPE_BOOST_ITEMS.charcoal).toBe("fire");
    expect(BASE_TYPE_BOOST_ITEMS["silk-scarf"]).toBe("normal");

    expect(Object.keys(BASE_PLATE_ITEMS)).toHaveLength(16);
    expect(BASE_PLATE_ITEMS["flame-plate"]).toBe("fire");
    expect(BASE_PLATE_ITEMS["iron-plate"]).toBe("steel");
    expect(BASE_PLATE_ITEMS["pixie-plate"]).toBeUndefined();

    expect(Object.keys(BASE_PINCH_ABILITY_TYPES)).toHaveLength(4);
    expect(BASE_PINCH_ABILITY_TYPES.overgrow).toBe("grass");
    expect(BASE_PINCH_ABILITY_TYPES.swarm).toBe("bug");
  });
});
