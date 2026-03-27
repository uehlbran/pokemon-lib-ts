import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  type EntryHazardType,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { GEN8_ABILITY_IDS, GEN8_ITEM_IDS } from "../src/data";
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

function createSyntheticOnFieldPokemon(overrides: {
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
    ability: overrides.ability ?? CORE_ABILITY_IDS.blaze,
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
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

function createBattleSide(
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

function createSyntheticBattleState(gravityActive = false): BattleState {
  return {
    weather: null,
    sides: [createBattleSide([]), createBattleSide([], 1)],
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
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(25);
    });

    it("given a Fire/Flying with 300 HP (Rock 4x), when applying Stealth Rock, then deals 150 damage (floor(300 * 4 / 8))", () => {
      // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
        maxHp: 300,
      });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(150);
    });

    it("given a Fire-type with 200 HP (Rock 2x), when applying Stealth Rock, then deals 50 damage (floor(200 * 2 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.fire], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given a Fighting-type with 200 HP (Rock 0.5x), when applying Stealth Rock, then deals 12 damage (floor(200 * 0.5 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.fighting], maxHp: 200 });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(12);
    });

    it("given a Ground/Steel with 200 HP (Rock 0.25x), when applying Stealth Rock, then deals 6 damage (floor(200 * 0.25 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.ground, CORE_TYPE_IDS.steel],
        maxHp: 200,
      });
      const result = applyGen8StealthRock(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(6);
    });
  });

  describe("Spikes", () => {
    it("given 1 layer of Spikes and a grounded Pokemon with 200 HP, when applying Spikes, then deals 25 damage (floor(200 * 3 / 24) = 25)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 1, false);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(25);
    });

    it("given 2 layers of Spikes and a grounded Pokemon with 200 HP, when applying Spikes, then deals 33 damage (floor(200 * 4 / 24) = 33)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 2, false);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(33);
    });

    it("given 3 layers of Spikes and a grounded Pokemon with 200 HP, when applying Spikes, then deals 50 damage (floor(200 * 6 / 24) = 50)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 3, false);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given Spikes and a Flying-type Pokemon, when applying Spikes, then returns null (not grounded)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.flying], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 1, false);
      expect(result).toBeNull();
    });

    it("given Spikes and a Flying-type with Gravity active, when applying Spikes, then deals 25 damage (Gravity grounds)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.flying], maxHp: 200 });
      const result = applyGen8SpikesHazard(mon, 1, true);
      expect(result).not.toBeNull();
      // 1 layer: floor(200 * 3 / 24) = floor(25) = 25
      expect(result!.damage).toBe(25);
    });
  });

  describe("Toxic Spikes", () => {
    it("given 1 layer of Toxic Spikes and a grounded Pokemon, when applying, then inflicts poison", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBe(CORE_STATUS_IDS.poison);
      expect(result.absorbed).toBe(false);
    });

    it("given 2 layers of Toxic Spikes and a grounded Pokemon, when applying, then inflicts badly-poisoned (toxic)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 2, false);
      expect(result.status).toBe(CORE_STATUS_IDS.badlyPoisoned);
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes and a grounded Poison-type, when applying, then absorbs hazard", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.poison], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.absorbed).toBe(true);
      expect(result.status).toBeNull();
    });

    it("given Toxic Spikes and a Steel-type, when applying, then no status inflicted", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.steel], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes and a Flying-type, when applying, then no status (not grounded)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.flying], maxHp: 200 });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
      expect(result.absorbed).toBe(false);
    });

    it("given Toxic Spikes and a Pokemon already statused, when applying, then no additional status", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        status: CORE_STATUS_IDS.paralysis,
      });
      const result = applyGen8ToxicSpikes(mon, 1, false);
      expect(result.status).toBeNull();
    });
  });

  describe("Sticky Web", () => {
    it("given Sticky Web and a grounded Pokemon, when applying, then -1 Speed", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(true);
      expect(result.statChanges).toEqual(expect.arrayContaining([{ stat: "speed", stages: -1 }]));
    });

    it("given Sticky Web and a Flying-type Pokemon, when applying, then not applied (not grounded)", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.flying], maxHp: 200 });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(false);
      expect(result.statChanges).toHaveLength(0);
    });

    it("given Sticky Web and a Pokemon with Defiant, when applying, then -1 Speed and +2 Attack", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        ability: GEN8_ABILITY_IDS.defiant,
      });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(true);
      expect(result.statChanges).toEqual(
        expect.arrayContaining([
          { stat: "speed", stages: -1 },
          { stat: "attack", stages: 2 },
        ]),
      );
    });

    it("given Sticky Web and a Pokemon with Competitive, when applying, then -1 Speed and +2 Sp. Atk", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        ability: GEN8_ABILITY_IDS.competitive,
      });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(true);
      expect(result.statChanges).toEqual(
        expect.arrayContaining([
          { stat: "speed", stages: -1 },
          { stat: "spAttack", stages: 2 },
        ]),
      );
    });

    it("given Sticky Web and a Pokemon with Clear Body, when applying, then the speed drop is blocked", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        ability: GEN8_ABILITY_IDS.clearBody,
      });
      const result = applyGen8StickyWeb(mon, false);
      expect(result.applied).toBe(false);
      expect(result.messages).toEqual(
        expect.arrayContaining([expect.stringContaining("Clear Body prevents stat loss")]),
      );
    });
  });

  describe("G-Max Steelsurge", () => {
    it("given a Fire-type with 200 HP (Steel resisted by Fire = 0.5x), when applying G-Max Steelsurge, then deals 12 damage (floor(200 * 0.5 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.fire], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(12);
    });

    it("given an Ice-type with 200 HP (Steel 2x vs Ice), when applying G-Max Steelsurge, then deals 50 damage (floor(200 * 2 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.ice], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given a Fairy-type with 200 HP (Steel 2x vs Fairy), when applying G-Max Steelsurge, then deals 50 damage (floor(200 * 2 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.fairy], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(50);
    });

    it("given an Ice/Rock with 200 HP (Steel 4x), when applying G-Max Steelsurge, then deals 100 damage (floor(200 * 4 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.ice, CORE_TYPE_IDS.rock],
        maxHp: 200,
      });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(100);
    });

    it("given a Normal-type with 200 HP (Steel neutral), when applying G-Max Steelsurge, then deals 25 damage (floor(200 * 1 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(25);
    });

    it("given a Water-type with 200 HP (Steel 0.5x vs Water), when applying G-Max Steelsurge, then deals 12 damage (floor(200 * 0.5 / 8))", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.water], maxHp: 200 });
      const result = applyGen8GMaxSteelsurge(mon, GEN8_TYPE_CHART);
      expect(result).not.toBeNull();
      expect(result!.damage).toBe(12);
    });
  });

  describe("Heavy-Duty Boots", () => {
    it("given Heavy-Duty Boots and Stealth Rock, when switching in, then no damage taken", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
        maxHp: 300,
        heldItem: GEN8_ITEM_IDS.heavyDutyBoots,
      });
      const side = createBattleSide([{ type: CORE_HAZARD_IDS.stealthRock, layers: 1 }]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and Spikes (3 layers), when switching in, then no damage taken", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        heldItem: GEN8_ITEM_IDS.heavyDutyBoots,
      });
      const side = createBattleSide([{ type: CORE_HAZARD_IDS.spikes, layers: 3 }]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and G-Max Steelsurge, when switching in, then no damage taken", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.ice],
        maxHp: 200,
        heldItem: GEN8_ITEM_IDS.heavyDutyBoots,
      });
      const side = createBattleSide([{ type: "gmax-steelsurge", layers: 1 }]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and Toxic Spikes, when switching in, then no status inflicted", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        heldItem: GEN8_ITEM_IDS.heavyDutyBoots,
      });
      const side = createBattleSide([{ type: CORE_HAZARD_IDS.toxicSpikes, layers: 2 }]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.statusInflicted).toBeNull();
      expect(result.messages).toHaveLength(0);
    });

    it("given Heavy-Duty Boots and Sticky Web, when switching in, then no stat changes", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        heldItem: GEN8_ITEM_IDS.heavyDutyBoots,
      });
      const side = createBattleSide([{ type: CORE_HAZARD_IDS.stickyWeb, layers: 1 }]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.statChanges).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
    });
  });

  describe("hasHeavyDutyBoots", () => {
    it("given a Pokemon holding heavy-duty-boots, when checking, then returns true", () => {
      const mon = createSyntheticOnFieldPokemon({ heldItem: GEN8_ITEM_IDS.heavyDutyBoots });
      expect(hasHeavyDutyBoots(mon)).toBe(true);
    });

    it("given a Pokemon holding leftovers, when checking, then returns false", () => {
      const mon = createSyntheticOnFieldPokemon({ heldItem: CORE_ITEM_IDS.leftovers });
      expect(hasHeavyDutyBoots(mon)).toBe(false);
    });

    it("given a Pokemon with no held item, when checking, then returns false", () => {
      const mon = createSyntheticOnFieldPokemon({ heldItem: null });
      expect(hasHeavyDutyBoots(mon)).toBe(false);
    });
  });

  describe("applyGen8EntryHazards (combined)", () => {
    it("given no hazards, when switching in, then no damage and no status", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const side = createBattleSide([]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.statusInflicted).toBeNull();
      expect(result.statChanges).toHaveLength(0);
      expect(result.messages).toHaveLength(0);
    });

    it("given Stealth Rock + Spikes (1 layer), when switching in, then combines damage", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], maxHp: 200 });
      const side = createBattleSide([
        { type: CORE_HAZARD_IDS.stealthRock, layers: 1 },
        { type: CORE_HAZARD_IDS.spikes, layers: 1 },
      ]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      // Stealth Rock: floor(200 * 1 / 8) = 25; Spikes 1 layer: floor(200 * 3 / 24) = 25; total = 50
      expect(result.damage).toBe(50);
    });

    it("given Stealth Rock + G-Max Steelsurge on Ice-type, when switching in, then applies both", () => {
      const mon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.ice], maxHp: 200 });
      const side = createBattleSide([
        { type: CORE_HAZARD_IDS.stealthRock, layers: 1 },
        { type: "gmax-steelsurge", layers: 1 },
      ]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(100);
    });

    it("given Magic Guard and Stealth Rock, when switching in, then no damage (but Sticky Web still applies)", () => {
      const mon = createSyntheticOnFieldPokemon({
        types: [CORE_TYPE_IDS.normal],
        maxHp: 200,
        ability: GEN8_ABILITY_IDS.magicGuard,
      });
      const side = createBattleSide([
        { type: CORE_HAZARD_IDS.stealthRock, layers: 1 },
        { type: CORE_HAZARD_IDS.stickyWeb, layers: 1 },
      ]);
      const state = createSyntheticBattleState();

      const result = applyGen8EntryHazards(mon, side, state, GEN8_TYPE_CHART);
      expect(result.damage).toBe(0);
      expect(result.statChanges).toEqual(expect.arrayContaining([{ stat: "speed", stages: -1 }]));
    });
  });
});
