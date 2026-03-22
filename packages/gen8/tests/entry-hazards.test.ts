import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { EntryHazardType, VolatileStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen8EntryHazards,
  applyGen8GMaxSteelsurge,
  applyGen8SpikesHazard,
  applyGen8StealthRock,
  applyGen8StickyWeb,
  applyGen8ToxicSpikes,
  hasHeavyDutyBoots,
} from "../src/Gen8EntryHazards";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: string[];
  ability?: string;
  nickname?: string;
  heldItem?: string | null;
  status?: string | null;
  volatiles?: Map<string, { turnsLeft: number }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? "TestMon",
      speciesId: 1,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
    },
    ability: overrides.ability ?? "blaze",
    types: overrides.types ?? ["normal"],
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses:
      (overrides.volatiles as Map<VolatileStatus, { turnsLeft: number }>) ?? new Map(),
  } as unknown as ActivePokemon;
}

function makeSide(
  hazards: Array<{ type: EntryHazardType; layers: number }>,
  index: 0 | 1 = 0,
): BattleSide {
  return {
    index,
    active: [],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function makeState(gravityActive = false): BattleState {
  return {
    weather: null,
    sides: [makeSide([]), makeSide([], 1)],
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: { active: gravityActive, turnsLeft: gravityActive ? 5 : 0 },
  } as unknown as BattleState;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 8 Entry Hazards", () => {
  describe("Stealth Rock", () => {
    it("given a Normal-type with 200 HP (Rock neutral), when applying Stealth Rock, then deals 25 damage (floor(200 * 1 / 8))", () => {
      // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
      // Rock vs Normal = 1x; floor(200 * 1 / 8) = 25
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(25);
    });

    it("given a Fire/Flying with 300 HP (Rock 4x), when applying Stealth Rock, then deals 150 damage (floor(300 * 4 / 8))", () => {
      // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
      // Rock vs Fire = 2x, Rock vs Flying = 2x; total = 4x; floor(300 * 4 / 8) = 150
      const mon = makeActivePokemon({ types: ["fire", "flying"], maxHp: 300 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(150);
    });

    it("given a Fire-type with 200 HP (Rock 2x), when applying Stealth Rock, then deals 50 damage (floor(200 * 2 / 8))", () => {
      // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
      // Rock vs Fire = 2x; floor(200 * 2 / 8) = 50
      const mon = makeActivePokemon({ types: ["fire"], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given a Fighting-type with 200 HP (Rock 0.5x), when applying Stealth Rock, then deals 12 damage (floor(200 * 0.5 / 8))", () => {
      // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
      // Rock vs Fighting = 0.5x; floor(200 * 0.5 / 8) = floor(12.5) = 12
      const mon = makeActivePokemon({ types: ["fighting"], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(12);
    });

    it("given a Ground/Steel with 200 HP (Rock 0.25x), when applying Stealth Rock, then deals 6 damage (floor(200 * 0.25 / 8))", () => {
      // Source: Showdown data/moves.ts -- stealthrock: double-type resistance
      // Rock vs Ground = 0.5x, Rock vs Steel = 0.5x; total = 0.25x; floor(200 * 0.25 / 8) = floor(6.25) = 6
      const mon = makeActivePokemon({ types: ["ground", "steel"], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(6);
    });
  });

  describe("Spikes", () => {
    it("given 1 layer of Spikes and a grounded Pokemon with 200 HP, when applying Spikes, then deals 25 damage (floor(200 * 3 / 24) = 25)", () => {
      // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
      // 1 layer: floor(200 * 3 / 24) = floor(25) = 25
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 1, false);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(25);
    });

    it("given 2 layers of Spikes and a grounded Pokemon with 200 HP, when applying Spikes, then deals 33 damage (floor(200 * 4 / 24) = 33)", () => {
      // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
      // 2 layers: floor(200 * 4 / 24) = floor(33.33) = 33
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 2, false);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(33);
    });

    it("given 3 layers of Spikes and a grounded Pokemon with 200 HP, when applying Spikes, then deals 50 damage (floor(200 * 6 / 24) = 50)", () => {
      // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
      // 3 layers: floor(200 * 6 / 24) = floor(50) = 50
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 3, false);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given Spikes and a Flying-type Pokemon, when applying Spikes, then returns null (not grounded)", () => {
      // Source: Showdown data/moves.ts -- spikes: only affects grounded Pokemon
      const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 1, false);
      expect(result).toBeNull();
    });
  });

  describe("Toxic Spikes", () => {
    it("given 1 layer of Toxic Spikes and a grounded Pokemon, when applying, then inflicts poison", () => {
      // Source: Showdown data/moves.ts -- toxicspikes: 1 layer = poison
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBe("poison");
      expect(result.absorbed).toBe(false);
    });

    it("given 2 layers of Toxic Spikes and a grounded Pokemon, when applying, then inflicts badly-poisoned (toxic)", () => {
      // Source: Showdown data/moves.ts -- toxicspikes: 2 layers = toxic
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 2, false);
      expect(result.status).toBe("badly-poisoned");
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes and a grounded Poison-type, when applying, then absorbs hazard", () => {
      // Source: Showdown data/moves.ts -- toxicspikes: grounded Poison-type removes them
      const mon = makeActivePokemon({ types: ["poison"], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.absorbed).toBe(true);
      expect(result.status).toBeNull();
    });

    it("given Toxic Spikes and a Steel-type, when applying, then no status inflicted", () => {
      // Source: Bulbapedia -- Steel types cannot be poisoned
      const mon = makeActivePokemon({ types: ["steel"], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes and a Flying-type, when applying, then no status (not grounded)", () => {
      // Source: Showdown data/moves.ts -- toxicspikes: only affects grounded Pokemon
      const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes and a Pokemon already statused, when applying, then no additional status", () => {
      // Source: Showdown -- cannot gain a primary status if already has one
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, status: "paralysis" });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
    });
  });

  describe("Sticky Web", () => {
    it("given Sticky Web and a grounded Pokemon, when applying, then -1 Speed", () => {
      // Source: Showdown data/moves.ts -- stickyweb: boost({spe: -1})
      // Source: Bulbapedia -- Sticky Web: "lowers the Speed stat by one stage"
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(true);
      expect(result.statChanges).toEqual(expect.arrayContaining([{ stat: "speed", stages: -1 }]));
    });

    it("given Sticky Web and a Flying-type Pokemon, when applying, then not applied (not grounded)", () => {
      // Source: Showdown data/moves.ts -- stickyweb: only affects grounded Pokemon
      const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(false);
      expect(result.statChanges).toHaveLength(0);
    });

    it("given Sticky Web and a Pokemon with Defiant, when applying, then -1 Speed and +2 Attack", () => {
      // Source: Showdown data/abilities.ts -- Defiant: onAfterEachBoost
      // Source: Bulbapedia -- Defiant: "raises Attack by 2 when its stats are lowered by an opponent"
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, ability: "defiant" });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(true);
      expect(result.statChanges).toEqual(
        expect.arrayContaining([
          { stat: "speed", stages: -1 },
          { stat: "attack", stages: 2 },
        ]),
      );
    });

    it("given Sticky Web and a Pokemon with Clear Body, when applying, then blocked", () => {
      // Source: Showdown data/abilities.ts -- clearbody: onBoost blocks stat drops
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, ability: "clear-body" });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(false);
      expect(result.messages).toEqual(
        expect.arrayContaining([expect.stringContaining("Clear Body prevents stat loss")]),
      );
    });
  });

  describe("G-Max Steelsurge", () => {
    it("given a Fire-type with 200 HP (Steel neutral vs Fire = 1x), when applying G-Max Steelsurge, then deals 25 damage (floor(200 * 1 / 8))", () => {
      // Source: Showdown data/moves.ts line 7475 -- gmaxsteelsurge: Steel-type Stealth Rock
      // Steel vs Fire = 1x (Steel is not super effective against Fire, and Fire resists Steel -- 0.5x)
      // Actually: Steel is NOT effective vs Fire. Steel vs Fire = 0.5x
      // floor(200 * 0.5 / 8) = floor(12.5) = 12
      const mon = makeActivePokemon({ types: ["fire"], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      // Steel vs Fire = 0.5x; floor(200 * 0.5 / 8) = 12
      expect(result!.damage).toBe(12);
    });

    it("given an Ice-type with 200 HP (Steel 2x vs Ice), when applying G-Max Steelsurge, then deals 50 damage (floor(200 * 2 / 8))", () => {
      // Source: Showdown data/moves.ts line 7475 -- gmaxsteelsurge: Steel-type effectiveness
      // Steel vs Ice = 2x; floor(200 * 2 / 8) = 50
      const mon = makeActivePokemon({ types: ["ice"], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given a Fairy-type with 200 HP (Steel 2x vs Fairy), when applying G-Max Steelsurge, then deals 50 damage (floor(200 * 2 / 8))", () => {
      // Source: Showdown data/moves.ts -- gmaxsteelsurge: Steel-type effectiveness
      // Steel vs Fairy = 2x; floor(200 * 2 / 8) = 50
      const mon = makeActivePokemon({ types: ["fairy"], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given an Ice/Rock with 200 HP (Steel 4x), when applying G-Max Steelsurge, then deals 100 damage (floor(200 * 4 / 8))", () => {
      // Source: Showdown data/moves.ts -- gmaxsteelsurge: Steel-type double-effective
      // Steel vs Ice = 2x, Steel vs Rock = 2x; total = 4x; floor(200 * 4 / 8) = 100
      const mon = makeActivePokemon({ types: ["ice", "rock"], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(100);
    });

    it("given a Normal-type with 200 HP (Steel neutral), when applying G-Max Steelsurge, then deals 25 damage (floor(200 * 1 / 8))", () => {
      // Source: Showdown data/moves.ts -- gmaxsteelsurge: Steel-type neutral
      // Steel vs Normal = 1x; floor(200 * 1 / 8) = 25
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(25);
    });

    it("given a Water-type with 200 HP (Steel 0.5x vs Water), when applying G-Max Steelsurge, then deals 12 damage (floor(200 * 0.5 / 8))", () => {
      // Source: Showdown data/moves.ts -- gmaxsteelsurge: Steel resisted
      // Steel vs Water = 0.5x; floor(200 * 0.5 / 8) = floor(12.5) = 12
      const mon = makeActivePokemon({ types: ["water"], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(12);
    });
  });

  describe("Heavy-Duty Boots", () => {
    it("given Heavy-Duty Boots and Stealth Rock, when switching in, then no damage taken", () => {
      // Source: Showdown data/items.ts -- heavydutyboots: blocks all hazards
      // Source: Bulbapedia -- Heavy-Duty Boots: "blocks entry hazard damage"
      const mon = makeActivePokemon({
        types: ["fire", "flying"],
        maxHp: 300,
        heldItem: "heavy-duty-boots",
      });
      const side = makeSide([{ type: "stealth-rock", layers: 1 }]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and Spikes (3 layers), when switching in, then no damage taken", () => {
      // Source: Showdown data/items.ts -- heavydutyboots: blocks all hazards including Spikes
      const mon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        heldItem: "heavy-duty-boots",
      });
      const side = makeSide([{ type: "spikes", layers: 3 }]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and G-Max Steelsurge, when switching in, then no damage taken", () => {
      // Source: Showdown data/items.ts -- heavydutyboots: blocks G-Max Steelsurge too
      // Source: specs/battle/09-gen8.md -- Heavy-Duty Boots blocks G-Max Steelsurge
      const mon = makeActivePokemon({
        types: ["ice"],
        maxHp: 200,
        heldItem: "heavy-duty-boots",
      });
      const side = makeSide([{ type: "gmax-steelsurge", layers: 1 }]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and Toxic Spikes, when switching in, then no status inflicted", () => {
      // Source: Showdown data/items.ts -- heavydutyboots: blocks Toxic Spikes
      const mon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        heldItem: "heavy-duty-boots",
      });
      const side = makeSide([{ type: "toxic-spikes", layers: 2 }]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.statusInflicted).toBeNull();
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and Sticky Web, when switching in, then no stat changes", () => {
      // Source: Showdown data/items.ts -- heavydutyboots: blocks Sticky Web stat drop too
      const mon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        heldItem: "heavy-duty-boots",
      });
      const side = makeSide([{ type: "sticky-web", layers: 1 }]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.statChanges).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
    });
  });

  describe("hasHeavyDutyBoots", () => {
    it("given a Pokemon holding heavy-duty-boots, when checking, then returns true", () => {
      const mon = makeActivePokemon({ heldItem: "heavy-duty-boots" });
      expect(hasHeavyDutyBoots(mon)).toBe(true);
    });

    it("given a Pokemon holding leftovers, when checking, then returns false", () => {
      const mon = makeActivePokemon({ heldItem: "leftovers" });
      expect(hasHeavyDutyBoots(mon)).toBe(false);
    });

    it("given a Pokemon with no held item, when checking, then returns false", () => {
      const mon = makeActivePokemon({ heldItem: null });
      expect(hasHeavyDutyBoots(mon)).toBe(false);
    });
  });

  describe("applyGen8EntryHazards (combined)", () => {
    it("given no hazards, when switching in, then no damage and no status", () => {
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side = makeSide([]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.statusInflicted).toBeNull();
      expect(result.statChanges).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Stealth Rock + Spikes (1 layer), when switching in, then combines damage", () => {
      // Source: Showdown sim/battle-actions.ts -- each hazard applies independently
      // Stealth Rock: Rock vs Normal = 1x; floor(200 * 1 / 8) = 25
      // Spikes 1 layer: floor(200 * 3 / 24) = 25
      // Total = 50
      const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
      const side = makeSide([
        { type: "stealth-rock", layers: 1 },
        { type: "spikes", layers: 1 },
      ]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(50);
    });

    it("given Stealth Rock + G-Max Steelsurge on Ice-type, when switching in, then applies both", () => {
      // Source: Showdown -- both hazards apply independently
      // Stealth Rock: Rock vs Ice = 2x; floor(200 * 2 / 8) = 50
      // G-Max Steelsurge: Steel vs Ice = 2x; floor(200 * 2 / 8) = 50
      // Total = 100
      const mon = makeActivePokemon({ types: ["ice"], maxHp: 200 });
      const side = makeSide([
        { type: "stealth-rock", layers: 1 },
        { type: "gmax-steelsurge", layers: 1 },
      ]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(100);
    });

    it("given Magic Guard and Stealth Rock, when switching in, then no damage (but Sticky Web still applies)", () => {
      // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
      // Source: Showdown -- Magic Guard blocks hazard damage but NOT Sticky Web
      const mon = makeActivePokemon({
        types: ["normal"],
        maxHp: 200,
        ability: "magic-guard",
      });
      const side = makeSide([
        { type: "stealth-rock", layers: 1 },
        { type: "sticky-web", layers: 1 },
      ]);
      const state = makeState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0); // Magic Guard blocks Stealth Rock
      expect(result.statChanges).toEqual(expect.arrayContaining([{ stat: "speed", stages: -1 }])); // Sticky Web still applies
    });
  });
});
