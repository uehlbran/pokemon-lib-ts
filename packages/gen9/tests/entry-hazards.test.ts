/**
 * Gen 9 Entry Hazards Tests
 *
 * Covers:
 *   - Stealth Rock: Rock-type effectiveness damage on switch-in
 *   - Spikes: 1-3 layers with layer-dependent damage (1/8, 1/6, 1/4 max HP)
 *   - Toxic Spikes: 1 layer = poison, 2 layers = badly poisoned; Poison-type absorbs
 *   - Sticky Web: -1 Speed to grounded Pokemon on switch-in
 *   - Heavy-Duty Boots: blocks ALL hazard effects
 *   - Magic Guard: blocks damage hazards but NOT Sticky Web
 *   - Grounding checks for ground-based hazards
 *   - No G-Max Steelsurge in Gen 9 (Dynamax removed)
 *
 * Source: Showdown data/moves.ts -- spikes, stealthrock, toxicspikes, stickyweb
 * Source: Showdown data/items.ts -- heavydutyboots
 * Source: Bulbapedia -- individual hazard pages
 */

import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type {
  EntryHazardType,
  PokemonType,
  TerrainType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  NEUTRAL_NATURES,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen9DataManager,
  GEN9_ABILITY_IDS,
  GEN9_ITEM_IDS,
  GEN9_MOVE_IDS,
  GEN9_NATURE_IDS,
  GEN9_SPECIES_IDS,
  GEN9_TYPE_CHART,
} from "../src";
import {
  applyGen9EntryHazards,
  applyGen9SpikesHazard,
  applyGen9StealthRock,
  applyGen9StickyWeb,
  applyGen9ToxicSpikes,
  hasHeavyDutyBoots,
} from "../src/Gen9EntryHazards";
import { Gen9Ruleset } from "../src/Gen9Ruleset";

const DATA_MANAGER = createGen9DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS } as const;
const HAZARDS = CORE_HAZARD_IDS;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN9_ITEM_IDS } as const;
const MOVES = { ...CORE_MOVE_IDS, ...GEN9_MOVE_IDS } as const;
const SPECIES = GEN9_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TERRAINS = CORE_TERRAIN_IDS;
const TERRAIN_SOURCE = CORE_TERRAIN_IDS.testSource;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN9_NATURE_IDS.hardy;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const DEFAULT_SPECIES_ID = SPECIES.eevee;
const HAZARD_TEST_SPECIES = {
  fire: SPECIES.charmander,
  fourTimesRockWeak: SPECIES.charizard,
  fighting: SPECIES.mankey,
  fightingSteel: SPECIES.lucario,
  flying: SPECIES.gyarados,
  poison: SPECIES.ekans,
  poisonImmuneViaLevitate: SPECIES.gastly,
  steel: SPECIES.magnemite,
} as const;

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createSyntheticOnFieldPokemon(overrides: {
  hp?: number;
  currentHp?: number;
  speciesId?: (typeof SPECIES)[keyof typeof SPECIES];
  ability?: (typeof ABILITIES)[keyof typeof ABILITIES];
  heldItem?: (typeof ITEMS)[keyof typeof ITEMS] | null;
  nickname?: string | null;
  status?: (typeof STATUSES)[keyof typeof STATUSES] | null;
  volatiles?: Map<VolatileStatus, { turnsLeft: number }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 400;
  const speciesId = overrides.speciesId ?? DEFAULT_SPECIES_ID;
  const species = DATA_MANAGER.getSpecies(speciesId);
  return {
    pokemon: {
      uid: "test",
      speciesId,
      nickname: overrides.nickname ?? "TestMon",
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [createMoveSlot(TACKLE.id)],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
      friendship: 0,
      gender: CORE_GENDERS.male as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: { hp, attack: 100, defense: 100, spAttack: 100, spDefense: 100, speed: 100 },
    },
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: species.types as PokemonType[],
    ability: overrides.ability ?? ABILITIES.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createBattleSide(hazards: Array<{ type: EntryHazardType; layers: number }>): BattleSide {
  return {
    index: 0,
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

function createBattleState(overrides?: {
  terrain?: { type: TerrainType; turnsLeft: number; source: string } | null;
  gravity?: { active: boolean; turnsLeft: number };
}): BattleState {
  return {
    weather: null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 9,
    turnNumber: 1,
    sides: [
      { index: 0, active: [] },
      { index: 1, active: [] },
    ],
  } as unknown as BattleState;
}

// ===========================================================================
// Spikes
// ===========================================================================

describe("Gen 9 Spikes", () => {
  it("given 1 layer of Spikes and a grounded Pokemon with 400 HP, when applying, then deals 50 damage (floor(400*3/24))", () => {
    // Source: Showdown data/moves.ts -- spikes: damageAmounts = [0, 3, 4, 6]
    // 1 layer: floor(400 * 3 / 24) = floor(50) = 50
    const mon = createSyntheticOnFieldPokemon({ hp: 400 });
    const result = applyGen9SpikesHazard(mon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given 2 layers of Spikes and a grounded Pokemon with 400 HP, when applying, then deals 66 damage (floor(400*4/24))", () => {
    // Source: Showdown data/moves.ts -- spikes: damageAmounts[2] = 4
    // 2 layers: floor(400 * 4 / 24) = floor(66.67) = 66
    const mon = createSyntheticOnFieldPokemon({ hp: 400 });
    const result = applyGen9SpikesHazard(mon, 2, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(66);
  });

  it("given 3 layers of Spikes and a grounded Pokemon with 400 HP, when applying, then deals 100 damage (floor(400*6/24))", () => {
    // Source: Showdown data/moves.ts -- spikes: damageAmounts[3] = 6
    // 3 layers: floor(400 * 6 / 24) = floor(100) = 100
    const mon = createSyntheticOnFieldPokemon({ hp: 400 });
    const result = applyGen9SpikesHazard(mon, 3, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(100);
  });

  it("given 1 layer of Spikes and a grounded Pokemon with 200 HP, when applying, then deals 25 damage (floor(200*3/24))", () => {
    // Source: Showdown data/moves.ts -- spikes formula
    // floor(200 * 3 / 24) = floor(25) = 25
    const mon = createSyntheticOnFieldPokemon({ hp: 200 });
    const result = applyGen9SpikesHazard(mon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given Spikes and a Flying-type Pokemon, when applying, then returns null (immune)", () => {
    // Source: Showdown data/moves.ts -- spikes: grounded-only
    const mon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.flying });
    const result = applyGen9SpikesHazard(mon, 3, false);
    expect(result).toBeNull();
    expect(applyGen9SpikesHazard(mon, 3, true)).toEqual({
      damage: 100,
      message: "TestMon was hurt by the spikes!",
    });
  });

  it("given Spikes and a Levitate Pokemon, when applying, then returns null (immune)", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate makes not grounded
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.levitate });
    const result = applyGen9SpikesHazard(mon, 3, false);
    expect(result).toBeNull();
    expect(
      applyGen9SpikesHazard(createSyntheticOnFieldPokemon({ ability: ABILITIES.none }), 3, false),
    ).toEqual({
      damage: 100,
      message: "TestMon was hurt by the spikes!",
    });
  });

  it("given Spikes and a Flying-type with Gravity, when applying, then deals damage (Gravity forces grounding)", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity forces grounding
    const mon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.flying, hp: 400 });
    const result = applyGen9SpikesHazard(mon, 1, true);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given 0 layers of Spikes, when applying, then returns null", () => {
    const mon = createSyntheticOnFieldPokemon({});
    const result = applyGen9SpikesHazard(mon, 0, false);
    expect(result).toBeNull();
    expect(applyGen9SpikesHazard(mon, 1, false)).toEqual({
      damage: 50,
      message: "TestMon was hurt by the spikes!",
    });
  });

  it("given Spikes result, when checking message, then says 'hurt by the spikes'", () => {
    const mon = createSyntheticOnFieldPokemon({ hp: 400, nickname: "Pikachu" });
    const result = applyGen9SpikesHazard(mon, 1, false);
    expect(result!.message).toBe("Pikachu was hurt by the spikes!");
  });
});

// ===========================================================================
// Stealth Rock
// ===========================================================================

describe("Gen 9 Stealth Rock", () => {
  it("given Stealth Rock and a neutral-type Pokemon with 400 HP, when applying, then deals 50 damage (floor(400*1/8))", () => {
    // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
    // Normal type: Rock is 1x effective. floor(400 * 1 / 8) = 50
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock and a 2x Rock-weak Pokemon (Fire) with 400 HP, when applying, then deals 100 damage (floor(400*2/8))", () => {
    // Source: Showdown data/moves.ts -- stealthrock: type effectiveness applied
    // Fire type: Rock is 2x effective. floor(400 * 2 / 8) = 100
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: HAZARD_TEST_SPECIES.fire });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result!.damage).toBe(100);
  });

  it("given Stealth Rock and a 4x Rock-weak Pokemon (Fire/Flying) with 400 HP, when applying, then deals 200 damage (floor(400*4/8))", () => {
    // Source: Showdown data/moves.ts -- stealthrock: dual weakness multiplied
    // Fire/Flying: Rock is 2x against Fire * 2x against Flying = 4x. floor(400 * 4 / 8) = 200
    const mon = createSyntheticOnFieldPokemon({
      hp: 400,
      speciesId: HAZARD_TEST_SPECIES.fourTimesRockWeak,
    });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result!.damage).toBe(200);
  });

  it("given Stealth Rock and a 0.5x Rock-resist Pokemon (Fighting) with 400 HP, when applying, then deals 25 damage", () => {
    // Source: Showdown data/moves.ts -- stealthrock: resistance reduces damage
    // Fighting type: Rock is 0.5x effective. floor(400 * 0.5 / 8) = 25
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: HAZARD_TEST_SPECIES.fighting });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result!.damage).toBe(25);
  });

  it("given Stealth Rock and a 0.25x Rock-resist Pokemon (Fighting/Steel) with 400 HP, when applying, then deals 12 damage", () => {
    // Source: Showdown data/moves.ts -- stealthrock: dual resistance
    // Fighting/Steel: 0.5 * 0.5 = 0.25x. floor(400 * 0.25 / 8) = 12
    const mon = createSyntheticOnFieldPokemon({
      hp: 400,
      speciesId: HAZARD_TEST_SPECIES.fightingSteel,
    });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result!.damage).toBe(12);
  });

  it("given Stealth Rock and a Flying-type Pokemon, when applying, then STILL deals damage (no grounding check)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has NO grounding check
    // Flying type: Rock is 2x effective. floor(400 * 2 / 8) = 100
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: HAZARD_TEST_SPECIES.flying });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result!.damage).toBe(100);
  });

  it("given Stealth Rock result, when checking message, then says 'Pointed stones dug into'", () => {
    const mon = createSyntheticOnFieldPokemon({
      hp: 400,
      speciesId: DEFAULT_SPECIES_ID,
      nickname: "Snorlax",
    });
    const result = applyGen9StealthRock(mon, GEN9_TYPE_CHART);
    expect(result!.message).toBe("Pointed stones dug into Snorlax!");
  });
});

// ===========================================================================
// Toxic Spikes
// ===========================================================================

describe("Gen 9 Toxic Spikes", () => {
  it("given 1 layer of Toxic Spikes and a grounded non-Poison/Steel Pokemon, when applying, then inflicts poison", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 1 layer = psn
    const mon = createSyntheticOnFieldPokemon({ speciesId: DEFAULT_SPECIES_ID });
    const result = applyGen9ToxicSpikes(mon, 1, false);
    expect(result.status).toBe(STATUSES.poison);
    expect(result.absorbed).toBe(false);
  });

  it("given 2 layers of Toxic Spikes and a grounded non-Poison/Steel Pokemon, when applying, then inflicts badly-poisoned", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 2 layers = tox
    const mon = createSyntheticOnFieldPokemon({ speciesId: DEFAULT_SPECIES_ID });
    const result = applyGen9ToxicSpikes(mon, 2, false);
    expect(result.status).toBe(STATUSES.badlyPoisoned);
    expect(result.absorbed).toBe(false);
  });

  it("given Toxic Spikes and a grounded Poison-type Pokemon, when applying, then absorbs (removes) the hazard", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs
    const poisonMon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.poison });
    const result = applyGen9ToxicSpikes(poisonMon, 2, false);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
    expect(result.message).toContain("absorbed");
  });

  it("given Toxic Spikes and a Poison-type Pokemon with Levitate, when applying, then no effect (not grounded)", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate prevents grounding
    const poisonLevitate = createSyntheticOnFieldPokemon({
      speciesId: HAZARD_TEST_SPECIES.poisonImmuneViaLevitate,
      ability: ABILITIES.levitate,
    });
    const result = applyGen9ToxicSpikes(poisonLevitate, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes and a grounded Steel-type Pokemon, when applying, then no status (Steel is immune)", () => {
    // Source: Bulbapedia -- Steel types cannot be poisoned
    const steelMon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.steel });
    const result = applyGen9ToxicSpikes(steelMon, 2, false);
    expect(result.status).toBeNull();
    expect(result.absorbed).toBe(false);
  });

  it("given Toxic Spikes and a Pokemon with existing status, when applying, then no new status", () => {
    // Source: Showdown -- trySetStatus returns false if already statused
    const burnedMon = createSyntheticOnFieldPokemon({
      speciesId: DEFAULT_SPECIES_ID,
      status: STATUSES.burn,
    });
    const result = applyGen9ToxicSpikes(burnedMon, 1, false);
    expect(result).toEqual({ absorbed: false, status: null, message: null });
  });

  it("given Toxic Spikes and a Flying-type Pokemon, when applying, then no effect (not grounded)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: grounded-only
    const flyingMon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.flying });
    const result = applyGen9ToxicSpikes(flyingMon, 2, false);
    expect(result).toEqual({ absorbed: false, status: null, message: null });
  });

  it("given 0 layers of Toxic Spikes, when applying, then no effect", () => {
    const mon = createSyntheticOnFieldPokemon({});
    const result = applyGen9ToxicSpikes(mon, 0, false);
    expect(result).toEqual({ absorbed: false, status: null, message: null });
  });
});

// ===========================================================================
// Sticky Web
// ===========================================================================

describe("Gen 9 Sticky Web", () => {
  it("given Sticky Web and a grounded Pokemon, when applying, then lowers Speed by 1 stage", () => {
    // Source: Showdown data/moves.ts -- stickyweb: boost({spe: -1})
    const mon = createSyntheticOnFieldPokemon({});
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(true);
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
  });

  it("given Sticky Web and a grounded Pokemon, when applied, then message says 'caught in a sticky web'", () => {
    const mon = createSyntheticOnFieldPokemon({ nickname: "Pikachu" });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.messages[0]).toBe("Pikachu was caught in a sticky web!");
  });

  it("given Sticky Web and a Flying-type Pokemon, when applying, then not applied (not grounded)", () => {
    // Source: Showdown data/moves.ts -- stickyweb: grounded-only
    const mon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.flying });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.statChanges).toHaveLength(0);
  });

  it("given Sticky Web and a Levitate Pokemon, when applying, then not applied (not grounded)", () => {
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.levitate });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(false);
  });

  it("given Sticky Web and a Clear Body Pokemon, when applying, then blocks stat drop", () => {
    // Source: Showdown data/abilities.ts -- clearbody: prevents stat drops
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.clearBody });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.messages[0]).toContain("Clear Body");
    expect(result.messages[0]).toContain("prevents stat loss");
  });

  it("given Sticky Web and a White Smoke Pokemon, when applying, then blocks stat drop", () => {
    // Source: Showdown data/abilities.ts -- whitesmoke: prevents stat drops
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.whiteSmoke });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.messages[0]).toContain("White Smoke");
  });

  it("given Sticky Web and a Full Metal Body Pokemon, when applying, then blocks stat drop", () => {
    // Source: Showdown data/abilities.ts -- fullmetalbody: prevents stat drops
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.fullMetalBody });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.messages[0]).toContain("Full Metal Body");
  });

  it("given Sticky Web and a Defiant Pokemon, when applying, then applies Speed drop AND +2 Attack", () => {
    // Source: Showdown data/abilities.ts -- defiant: +2 Attack on stat drop
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.defiant });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(true);
    expect(result.statChanges).toHaveLength(2);
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
    expect(result.statChanges[1]).toEqual({ stat: "attack", stages: 2 });
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]).toContain("Defiant");
  });

  it("given Sticky Web and a Competitive Pokemon, when applying, then applies Speed drop AND +2 Sp. Atk", () => {
    // Source: Showdown data/abilities.ts -- competitive: +2 SpA on stat drop
    const mon = createSyntheticOnFieldPokemon({ ability: ABILITIES.competitive });
    const result = applyGen9StickyWeb(mon, false);
    expect(result.applied).toBe(true);
    expect(result.statChanges).toHaveLength(2);
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
    expect(result.statChanges[1]).toEqual({ stat: "spAttack", stages: 2 });
    expect(result.messages[1]).toContain("Competitive");
  });
});

// ===========================================================================
// Heavy-Duty Boots
// ===========================================================================

describe("Heavy-Duty Boots", () => {
  it("given a Pokemon with Heavy-Duty Boots, when checking hasHeavyDutyBoots, then returns true", () => {
    // Source: Showdown data/items.ts -- heavydutyboots
    const mon = createSyntheticOnFieldPokemon({ heldItem: ITEMS.heavyDutyBoots });
    expect(hasHeavyDutyBoots(mon)).toBe(true);
  });

  it("given a Pokemon without Heavy-Duty Boots, when checking hasHeavyDutyBoots, then returns false", () => {
    const mon = createSyntheticOnFieldPokemon({ heldItem: ITEMS.leftovers });
    expect(hasHeavyDutyBoots(mon)).toBe(false);
  });

  it("given a Pokemon with null held item, when checking hasHeavyDutyBoots, then returns false", () => {
    const mon = createSyntheticOnFieldPokemon({ heldItem: null });
    expect(hasHeavyDutyBoots(mon)).toBe(false);
  });
});

// ===========================================================================
// Main Entry Hazard Application (applyGen9EntryHazards)
// ===========================================================================

describe("applyGen9EntryHazards", () => {
  it("given Stealth Rock on the side and neutral-type Pokemon with 400 HP, when applying hazards, then deals 50 damage", () => {
    // Source: Showdown data/moves.ts -- stealthrock: damage = floor(maxhp * effectiveness / 8)
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const side = createBattleSide([{ type: HAZARDS.stealthRock, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Pointed stones");
  });

  it("given 2 layers Spikes on the side and grounded Pokemon with 400 HP, when applying hazards, then deals 66 damage", () => {
    // Source: Showdown data/moves.ts -- spikes: damageAmounts[2] = 4
    // floor(400 * 4 / 24) = 66
    const mon = createSyntheticOnFieldPokemon({ hp: 400 });
    const side = createBattleSide([{ type: HAZARDS.spikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(66);
  });

  it("given Stealth Rock AND 1 layer Spikes, when applying hazards, then combines damage from both", () => {
    // Both hazards should apply: SR (50) + Spikes (50) = 100
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(100); // 50 (SR) + 50 (Spikes)
    expect(result.messages).toHaveLength(2);
  });

  it("given 1 layer Toxic Spikes, when applying hazards, then inflicts poison status", () => {
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.statusInflicted).toBe(STATUSES.poison);
    expect(result.damage).toBe(0);
  });

  it("given 2 layers Toxic Spikes, when applying hazards, then inflicts badly-poisoned status", () => {
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.statusInflicted).toBe(STATUSES.badlyPoisoned);
  });

  it("given Toxic Spikes and a Poison-type Pokemon, when applying hazards, then absorbs (removes) Toxic Spikes", () => {
    const poisonMon = createSyntheticOnFieldPokemon({ speciesId: HAZARD_TEST_SPECIES.poison });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(poisonMon, side, state, GEN9_TYPE_CHART);
    expect(result.hazardsToRemove).toEqual([HAZARDS.toxicSpikes]);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Sticky Web on the side and grounded Pokemon, when applying hazards, then applies -1 Speed", () => {
    const mon = createSyntheticOnFieldPokemon({ hp: 400 });
    const side = createBattleSide([{ type: HAZARDS.stickyWeb, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
  });

  it("given all hazards and a grounded neutral-type Pokemon with 400 HP, when applying, then accumulates all effects", () => {
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 3 },
      { type: HAZARDS.toxicSpikes, layers: 1 },
      { type: HAZARDS.stickyWeb, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    // SR: 50 + Spikes(3 layers): 100 = 150
    // floor(400 * 1 / 8) + floor(400 * 6 / 24) = 50 + 100 = 150
    expect(result.damage).toBe(150);
    expect(result.statusInflicted).toBe(STATUSES.poison);
    expect(result.statChanges).toHaveLength(1); // Sticky Web -1 Speed
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
  });

  // --- Heavy-Duty Boots blocks everything ---

  it("given all hazards and a Pokemon with Heavy-Duty Boots, when applying hazards, then all effects blocked", () => {
    // Source: Showdown data/items.ts -- heavydutyboots blocks all hazards
    const bootsMon = createSyntheticOnFieldPokemon({ hp: 400, heldItem: ITEMS.heavyDutyBoots });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 3 },
      { type: HAZARDS.toxicSpikes, layers: 2 },
      { type: HAZARDS.stickyWeb, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(bootsMon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });

  // --- Magic Guard blocks damage but not Sticky Web ---

  it("given SR + Spikes + Sticky Web and a Magic Guard Pokemon, when applying hazards, then only Sticky Web applies", () => {
    // Source: Bulbapedia -- Magic Guard prevents indirect damage, not stat drops
    const magicGuardMon = createSyntheticOnFieldPokemon({ hp: 400, ability: ABILITIES.magicGuard });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 3 },
      { type: HAZARDS.stickyWeb, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(magicGuardMon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(0); // No damage from SR or Spikes
    expect(result.statChanges).toHaveLength(1); // Sticky Web still applies
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
  });

  it("given Toxic Spikes and a Magic Guard Pokemon, when applying hazards, then no status inflicted", () => {
    // Source: Bulbapedia -- Magic Guard blocks toxic spikes status
    const magicGuardMon = createSyntheticOnFieldPokemon({ hp: 400, ability: ABILITIES.magicGuard });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(magicGuardMon, side, state, GEN9_TYPE_CHART);
    expect(result).toEqual({
      damage: 0,
      statusInflicted: null,
      statChanges: [],
      messages: [],
    });
  });

  // --- Misty Terrain blocks Toxic Spikes status ---

  it("given Toxic Spikes and Misty Terrain active, when applying hazards, then status is blocked by terrain", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus blocks all status
    const mon = createSyntheticOnFieldPokemon({ hp: 400, speciesId: DEFAULT_SPECIES_ID });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState({
      terrain: { type: TERRAINS.misty, turnsLeft: 5, source: TERRAIN_SOURCE },
    });
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result).toEqual({
      damage: 0,
      statusInflicted: null,
      statChanges: [],
      messages: [],
    });
  });

  // --- No hazards on side ---

  it("given no hazards on the side, when applying hazards, then no effects", () => {
    const mon = createSyntheticOnFieldPokemon({});
    const side = createBattleSide([]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(mon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toHaveLength(0);
    expect(result.messages).toHaveLength(0);
  });

  // --- No G-Max Steelsurge in Gen 9 ---

  it("given Heavy-Duty Boots and Klutz ability, when applying Stealth Rock, then hazard damage still applies", () => {
    // Klutz suppresses held item effects, so Heavy-Duty Boots does not block hazards.
    // Source: Showdown data/abilities.ts -- klutz: suppresses held item (ignoreItem = true)
    // Source: Bulbapedia -- Klutz page; Heavy-Duty Boots page
    const klutzyMon = createSyntheticOnFieldPokemon({
      hp: 400,
      heldItem: ITEMS.heavyDutyBoots,
      ability: ABILITIES.klutz,
    });
    const side = createBattleSide([{ type: HAZARDS.stealthRock, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(klutzyMon, side, state, GEN9_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.messages).toEqual(["Pointed stones dug into TestMon!"]);
  });

  it("given Sticky Web and a Contrary Pokemon, when applying hazards, then Speed is raised by 1 instead of lowered", () => {
    // Contrary reverses stat stage changes, so Sticky Web grants +1 Speed instead of -1.
    // Source: Showdown data/abilities.ts -- contrary: onBoost reverses stages
    // Source: Bulbapedia -- Contrary page
    const contraryMon = createSyntheticOnFieldPokemon({ ability: ABILITIES.contrary });
    const side = createBattleSide([{ type: HAZARDS.stickyWeb, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen9EntryHazards(contraryMon, side, state, GEN9_TYPE_CHART);
    expect(result.statChanges).toHaveLength(1);
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: 1 });
  });

  it("given Gen9Ruleset, when getAvailableHazards(), then does not include gmax-steelsurge", () => {
    // Source: Bulbapedia -- Dynamax removed in Gen 9, G-Max Steelsurge no longer available
    // This is tested here indirectly -- the hazard list for Gen 9 excludes it
    const ruleset = new Gen9Ruleset();
    const hazards = ruleset.getAvailableHazards();
    expect(hazards).not.toContain(CORE_HAZARD_IDS.gmaxSteelsurge);
    expect(hazards).toContain(HAZARDS.stealthRock);
    expect(hazards).toContain(HAZARDS.spikes);
    expect(hazards).toContain(HAZARDS.toxicSpikes);
    expect(hazards).toContain(HAZARDS.stickyWeb);
  });
});
