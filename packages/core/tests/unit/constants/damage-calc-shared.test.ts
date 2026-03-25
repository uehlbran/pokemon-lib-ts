import { describe, expect, it } from "vitest";
import { CORE_TYPE_IDS } from "../../../src";
import {
  BASE_PINCH_ABILITY_TYPES,
  BASE_PLATE_ITEMS,
  BASE_TYPE_BOOST_ITEMS,
} from "../../../src/constants/damage-calc-shared";
import { GEN4_ITEM_IDS } from "../../../../gen4/src";
import { GEN8_ITEM_IDS } from "../../../../gen8/src";

describe("shared damage calculation constants", () => {
  it("given the shared offensive item table, when imported, then it matches the Gen 4-9 base set", () => {
    // Source: Bulbapedia "Type-enhancing item" list for the 17 held items shared across gens 4-9.
    expect(Object.keys(BASE_TYPE_BOOST_ITEMS)).toHaveLength(17);
    // Source: Showdown data/items.ts Charcoal entry + Bulbapedia "Charcoal".
    expect(BASE_TYPE_BOOST_ITEMS[GEN4_ITEM_IDS.charcoal]).toBe(CORE_TYPE_IDS.fire);
    // Source: Showdown data/items.ts Silk Scarf entry + Bulbapedia "Silk Scarf".
    expect(BASE_TYPE_BOOST_ITEMS[GEN4_ITEM_IDS.silkScarf]).toBe(CORE_TYPE_IDS.normal);
  });

  it("given the shared plate table, when imported, then it excludes later-generation additions", () => {
    // Source: Bulbapedia "Plate" list for the 16 Arceus plates introduced in Gen 4.
    expect(Object.keys(BASE_PLATE_ITEMS)).toHaveLength(16);
    // Source: Showdown data/items.ts Flame Plate entry + Bulbapedia "Flame Plate".
    expect(BASE_PLATE_ITEMS[GEN4_ITEM_IDS.flamePlate]).toBe(CORE_TYPE_IDS.fire);
    // Source: Showdown data/items.ts Iron Plate entry + Bulbapedia "Iron Plate".
    expect(BASE_PLATE_ITEMS[GEN4_ITEM_IDS.ironPlate]).toBe(CORE_TYPE_IDS.steel);
    // Source: Bulbapedia "Pixie Plate" documents it as Gen 6+, so it is absent from the shared base table.
    expect(BASE_PLATE_ITEMS[GEN8_ITEM_IDS.pixiePlate]).toBeUndefined();
  });

  it("given the shared pinch ability table, when imported, then it contains only the four classic abilities", () => {
    // Source: Bulbapedia ability pages + Showdown pinch-ability handling for Overgrow/Blaze/Torrent/Swarm only.
    expect(Object.keys(BASE_PINCH_ABILITY_TYPES)).toHaveLength(4);
    // Source: Bulbapedia "Overgrow" + Showdown data/abilities.ts.
    expect(BASE_PINCH_ABILITY_TYPES.overgrow).toBe(CORE_TYPE_IDS.grass);
    // Source: Bulbapedia "Swarm" + Showdown data/abilities.ts.
    expect(BASE_PINCH_ABILITY_TYPES.swarm).toBe(CORE_TYPE_IDS.bug);
  });
});
