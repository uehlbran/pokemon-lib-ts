import type { ActivePokemon, BattleSide } from "@pokemon-lib-ts/battle";
import type { EntryHazardType, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen3DataManager } from "../src/data";
import { Gen3Ruleset } from "../src/Gen3Ruleset";

/**
 * Gen 3 Entry Hazards Tests
 *
 * Gen 3 only has Spikes. Stealth Rock and Toxic Spikes were not introduced until Gen 4.
 *
 * Spikes damage table (per pret/pokeemerald):
 *   1 layer = 1/8 max HP  → floor(maxHP / 8)
 *   2 layers = 1/6 max HP → floor(maxHP * 1/6) = floor(maxHP / 6)
 *   3 layers = 1/4 max HP → floor(maxHP / 4)
 *
 * Immunities:
 *   - Flying-type: immune (doesn't touch the ground)
 *   - Levitate ability: immune (doesn't touch the ground)
 *
 * Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage routine
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  maxHp?: number;
  speciesId?: number;
  nickname?: string | null;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: maxHp,
    moves: [],
    ability: "",
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: null,
    friendship: 0,
    gender: "male" as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  types: PokemonType[];
  ability?: string;
  maxHp?: number;
  speciesId?: number;
  nickname?: string | null;
}): ActivePokemon {
  return {
    pokemon: makePokemonInstance({
      maxHp: overrides.maxHp,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
    }),
    teamSlot: 0,
    statStages: {
      attack: 0,
      defense: 0,
      spAttack: 0,
      spDefense: 0,
      speed: 0,
      accuracy: 0,
      evasion: 0,
    },
    volatileStatuses: new Map(),
    types: overrides.types,
    ability: overrides.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
  } as ActivePokemon;
}

function makeSideWithSpikes(index: 0 | 1, layers: number): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [{ type: "spikes", layers }],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function makeEmptySide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function makeRuleset(): Gen3Ruleset {
  return new Gen3Ruleset(createGen3DataManager());
}

// ---------------------------------------------------------------------------
// Spikes damage tests
// ---------------------------------------------------------------------------

describe("Gen3 entry hazards — spikes damage", () => {
  it("given 1 layer of spikes and 160 maxHP, when Pokemon switches in, then takes 20 HP (1/8)", () => {
    // Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage
    // 1 layer = 1/8 max HP. Derivation: floor(160 / 8) = 20
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    const side = makeSideWithSpikes(1, 1);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(20);
  });

  it("given 2 layers of spikes and 160 maxHP, when Pokemon switches in, then takes 26 HP (floor(160/6))", () => {
    // Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage
    // 2 layers = 1/6 max HP. Derivation: floor(160 * (1/6)) = floor(26.67) = 26
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    const side = makeSideWithSpikes(1, 2);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(26);
  });

  it("given 3 layers of spikes and 160 maxHP, when Pokemon switches in, then takes 40 HP (1/4)", () => {
    // Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage
    // 3 layers = 1/4 max HP. Derivation: floor(160 / 4) = 40
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    const side = makeSideWithSpikes(1, 3);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(40);
  });

  it("given 1 layer of spikes and 200 maxHP, when Pokemon switches in, then takes 25 HP (1/8)", () => {
    // Source: pret/pokeemerald src/battle_util.c — SetSpikesDamage
    // 1 layer = 1/8 max HP. Derivation: floor(200 / 8) = 25
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const side = makeSideWithSpikes(1, 1);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Spikes immunity tests
// ---------------------------------------------------------------------------

describe("Gen3 entry hazards — spikes immunities", () => {
  it("given spikes, when a Flying-type switches in, then no damage is taken", () => {
    // Source: pret/pokeemerald — Flying types don't touch the ground, immune to Spikes
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 160 });
    const side = makeSideWithSpikes(1, 3);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(0);
  });

  it("given spikes, when a Normal/Flying dual-type switches in, then no damage is taken", () => {
    // Source: pret/pokeemerald — even dual-types with Flying are immune to Spikes
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal", "flying"], maxHp: 160 });
    const side = makeSideWithSpikes(1, 3);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(0);
  });

  it("given spikes, when a Pokemon with Levitate ability switches in, then no damage is taken", () => {
    // Source: pret/pokeemerald — Levitate ability grants immunity to ground-affecting effects
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["psychic"], ability: "levitate", maxHp: 160 });
    const side = makeSideWithSpikes(1, 3);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// No spikes test
// ---------------------------------------------------------------------------

describe("Gen3 entry hazards — no spikes", () => {
  it("given no spikes, when any Pokemon switches in, then no damage is taken", () => {
    // Source: pret/pokeemerald — hazard check returns immediately if no spikes present
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    const side = makeEmptySide(1);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 0-layer spikes guard
// ---------------------------------------------------------------------------

describe("Gen3 entry hazards — 0-layer spikes guard", () => {
  it("given a spikes hazard entry with 0 layers, when Pokemon switches in, then no damage is dealt", () => {
    // Source: defensive guard — engine should never create 0-layer hazards, but we guard anyway
    // Derivation: fractions[0] === 0, so Math.max(1, 0) would incorrectly return 1 without the guard
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const side: BattleSide = {
      ...makeSideWithSpikes(1, 1),
      hazards: [{ type: "spikes" as EntryHazardType, layers: 0 }],
    };

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Gen 3 only has Spikes (no Stealth Rock, no Toxic Spikes)
// ---------------------------------------------------------------------------

describe("Gen3 entry hazards — available hazard types", () => {
  it("given no Stealth Rock or Toxic Spikes in Gen 3, when checking available hazards, then only spikes is in the list", () => {
    // Source: pret/pokeemerald — MOVE_SPIKES is the only hazard-creating move in Gen 3
    // Stealth Rock (Gen 4), Toxic Spikes (Gen 4), Sticky Web (Gen 6) do not exist in Gen 3.
    const ruleset = makeRuleset();
    const hazards = ruleset.getAvailableHazards();

    expect(hazards).toEqual(["spikes"]);
    expect(hazards).not.toContain("stealth-rock");
    expect(hazards).not.toContain("toxic-spikes");
  });

  it("given Stealth Rock hazard data on a side (hypothetical), when applyEntryHazards is called, then no damage is dealt (only spikes are processed)", () => {
    // Source: pret/pokeemerald — Gen 3 has no Stealth Rock; the hazard should be ignored
    // This test verifies the implementation only processes spikes, not other hazard types.
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 160 });
    const side: BattleSide = {
      index: 1,
      trainer: null,
      team: [],
      active: [],
      // Stealth Rock hazard that shouldn't be processed in Gen 3
      hazards: [{ type: "stealth-rock", layers: 1 }],
      screens: [],
      tailwind: { active: false, turnsLeft: 0 },
      luckyChant: { active: false, turnsLeft: 0 },
      wish: null,
      futureAttack: null,
      faintCount: 0,
      gimmickUsed: false,
    };

    const result = ruleset.applyEntryHazards(mon, side);

    // No damage because Gen 3 applyEntryHazards only looks for 'spikes'
    expect(result.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Result structure tests
// ---------------------------------------------------------------------------

describe("Gen3 entry hazards — result structure", () => {
  it("given 1 layer of spikes and a Normal-type Pokemon, when switching in, then result has correct message", () => {
    // Source: pret/pokeemerald — spikes message text
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 160 });
    const side = makeSideWithSpikes(1, 1);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("spikes");
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
  });

  it("given 1 layer of spikes and a named Pokemon, when switching in, then message contains the nickname", () => {
    // Source: battle message formatting — Pokemon names appear in hazard messages
    const ruleset = makeRuleset();
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 160, nickname: "Fluffy" });
    const side = makeSideWithSpikes(1, 1);

    const result = ruleset.applyEntryHazards(mon, side);

    expect(result.messages[0]).toContain("Fluffy");
  });
});
