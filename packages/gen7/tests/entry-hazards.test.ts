import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { EntryHazardType, VolatileStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen7EntryHazards,
  applyGen7SpikesHazard,
  applyGen7StealthRock,
  applyGen7StickyWeb,
  applyGen7ToxicSpikes,
} from "../src/Gen7EntryHazards";
import { GEN7_TYPE_CHART } from "../src/Gen7TypeChart";

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
// Stealth Rock Tests
// ---------------------------------------------------------------------------

describe("Gen7 Stealth Rock", () => {
  it("given a Normal-type (neutral to Rock), when Stealth Rock applied, then takes 1/8 max HP", () => {
    // Source: Showdown -- stealthrock: damage = floor(maxhp * effectiveness / 8)
    // Rock vs Normal = 1.0x -> floor(200 * 1.0 / 8) = 25
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, nickname: "Snorlax" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given a Fire/Flying type (4x weak to Rock), when Stealth Rock applied, then takes 1/2 max HP", () => {
    // Source: Showdown -- Rock vs Fire = 2.0x, Rock vs Flying = 2.0x -> 4.0x
    // floor(200 * 4.0 / 8) = 100
    const mon = makeActivePokemon({ types: ["fire", "flying"], maxHp: 200, nickname: "Charizard" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(100);
  });

  it("given a Fire-type (2x weak to Rock), when Stealth Rock applied, then takes 1/4 max HP", () => {
    // Source: Showdown -- Rock vs Fire = 2.0x -> floor(200 * 2.0 / 8) = 50
    const mon = makeActivePokemon({ types: ["fire"], maxHp: 200, nickname: "Arcanine" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given a Fighting-type (0.5x resist to Rock), when Stealth Rock applied, then takes 1/16 max HP", () => {
    // Source: Showdown -- Rock vs Fighting = 0.5x -> floor(200 * 0.5 / 8) = 12
    const mon = makeActivePokemon({ types: ["fighting"], maxHp: 200, nickname: "Machamp" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });

  it("given a Steel/Ground type (0.25x resist to Rock), when Stealth Rock applied, then takes 1/32 max HP", () => {
    // Source: Showdown -- Rock vs Steel = 0.5x, Rock vs Ground = 0.5x -> 0.25x
    // floor(200 * 0.25 / 8) = 6
    const mon = makeActivePokemon({ types: ["steel", "ground"], maxHp: 200, nickname: "Steelix" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(6);
  });

  it("given a Flying-type, when Stealth Rock applied, then still takes damage (no grounding check)", () => {
    // Source: Showdown -- Stealth Rock has no grounding check
    // Rock vs Flying = 2.0x -> floor(200 * 2.0 / 8) = 50
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200, nickname: "Pidgeot" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock applied, when result message checked, then says 'Pointed stones dug into'", () => {
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, nickname: "Snorlax" });
    const result = applyGen7StealthRock(mon, GEN7_TYPE_CHART);
    expect(result!.message).toBe("Pointed stones dug into Snorlax!");
  });
});

// ---------------------------------------------------------------------------
// Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen7 Spikes", () => {
  it("given 1 layer of Spikes on a grounded Pokemon, when applied, then deals 1/8 max HP", () => {
    // Source: Showdown -- spikes: damageAmounts = [0, 3, 4, 6], damage = 3 * maxhp / 24
    // floor(200 * 3 / 24) = floor(600/24) = 25
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given 2 layers of Spikes on a grounded Pokemon, when applied, then deals 1/6 max HP", () => {
    // Source: Showdown -- spikes: damage = 4 * maxhp / 24
    // floor(200 * 4 / 24) = floor(800/24) = 33
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 2, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(33);
  });

  it("given 3 layers of Spikes on a grounded Pokemon, when applied, then deals 1/4 max HP", () => {
    // Source: Showdown -- spikes: damage = 6 * maxhp / 24
    // floor(200 * 6 / 24) = floor(1200/24) = 50
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 3, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given a Flying-type, when Spikes applied, then immune (not grounded)", () => {
    // Source: Showdown -- Spikes only affect grounded Pokemon
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 3, false);
    expect(result).toBeNull();
  });

  it("given a Levitate Pokemon, when Spikes applied, then immune (not grounded)", () => {
    // Source: Bulbapedia -- Levitate grants immunity to Ground-type moves and hazards
    const mon = makeActivePokemon({ types: ["normal"], ability: "levitate", maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 3, false);
    expect(result).toBeNull();
  });

  it("given a Flying-type under Gravity, when Spikes applied, then takes damage (grounded)", () => {
    // Source: Bulbapedia -- Gravity grounds all Pokemon
    // 3 layers: floor(200 * 6 / 24) = 50
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 3, true);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given 0 layers of Spikes, when applied, then returns null", () => {
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const result = applyGen7SpikesHazard(mon, 0, false);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Toxic Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen7 Toxic Spikes", () => {
  it("given 1 layer of Toxic Spikes on a grounded non-Poison/Steel, when applied, then inflicts poison", () => {
    // Source: Showdown -- toxicspikes: 1 layer = poison
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, nickname: "Raticate" });
    const result = applyGen7ToxicSpikes(mon, 1, false);
    expect(result.status).toBe("poison");
    expect(result.absorbed).toBe(false);
    expect(result.message).toBe("Raticate was poisoned by the toxic spikes!");
  });

  it("given 2 layers of Toxic Spikes on a grounded non-Poison/Steel, when applied, then inflicts badly-poisoned", () => {
    // Source: Showdown -- toxicspikes: 2 layers = badly-poisoned (toxic)
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, nickname: "Raticate" });
    const result = applyGen7ToxicSpikes(mon, 2, false);
    expect(result.status).toBe("badly-poisoned");
    expect(result.absorbed).toBe(false);
    expect(result.message).toBe("Raticate was badly poisoned by the toxic spikes!");
  });

  it("given a Poison-type switching into Toxic Spikes, when applied, then absorbs them", () => {
    // Source: Showdown -- toxicspikes: grounded Poison-type removes them
    const mon = makeActivePokemon({ types: ["poison"], maxHp: 200, nickname: "Muk" });
    const result = applyGen7ToxicSpikes(mon, 2, false);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
    expect(result.message).toBe("Muk absorbed the poison spikes!");
  });

  it("given a Steel-type switching into Toxic Spikes, when applied, then is immune", () => {
    // Source: Bulbapedia -- Steel types cannot be poisoned
    const mon = makeActivePokemon({ types: ["steel"], maxHp: 200 });
    const result = applyGen7ToxicSpikes(mon, 2, false);
    expect(result.status).toBeNull();
    expect(result.absorbed).toBe(false);
  });

  it("given a Flying-type switching into Toxic Spikes, when applied, then is immune (not grounded)", () => {
    // Source: Showdown -- Toxic Spikes only affect grounded Pokemon
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
    const result = applyGen7ToxicSpikes(mon, 2, false);
    expect(result.status).toBeNull();
    expect(result.absorbed).toBe(false);
  });

  it("given a Pokemon with existing status, when Toxic Spikes applied, then no additional status", () => {
    // Source: Showdown -- trySetStatus fails if already has a primary status
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, status: "burn" });
    const result = applyGen7ToxicSpikes(mon, 2, false);
    expect(result.status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sticky Web Tests
// ---------------------------------------------------------------------------

describe("Gen7 Sticky Web", () => {
  it("given a grounded Pokemon switching into Sticky Web, when applied, then loses 1 Speed stage", () => {
    // Source: Showdown -- stickyweb: this.boost({spe: -1}, pokemon)
    // Source: Bulbapedia -- Sticky Web lowers Speed by 1 stage
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200, nickname: "Snorlax" });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.messages).toContain("Snorlax was caught in a sticky web!");
  });

  it("given a Flying-type switching into Sticky Web, when applied, then immune (not grounded)", () => {
    // Source: Showdown -- Sticky Web only affects grounded Pokemon
    const mon = makeActivePokemon({ types: ["flying"], maxHp: 200 });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
  });

  it("given a Levitate Pokemon switching into Sticky Web, when applied, then immune (not grounded)", () => {
    // Source: Bulbapedia -- Levitate grants immunity to ground-based hazards
    const mon = makeActivePokemon({ types: ["normal"], ability: "levitate", maxHp: 200 });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
  });

  it("given a Clear Body Pokemon switching into Sticky Web, when applied, then blocks stat drop", () => {
    // Source: Bulbapedia -- Clear Body prevents stat reductions from opponents
    const mon = makeActivePokemon({
      types: ["normal"],
      ability: "clear-body",
      nickname: "Metagross",
    });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.messages[0]).toContain("Clear Body");
  });

  it("given a White Smoke Pokemon switching into Sticky Web, when applied, then blocks stat drop", () => {
    // Source: Bulbapedia -- White Smoke: same effect as Clear Body
    const mon = makeActivePokemon({
      types: ["normal"],
      ability: "white-smoke",
      nickname: "Torkoal",
    });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.messages[0]).toContain("White Smoke");
  });

  it("given a Full Metal Body Pokemon switching into Sticky Web, when applied, then blocks stat drop (Gen 7 new)", () => {
    // Source: Bulbapedia -- Full Metal Body prevents stat reductions (Gen 7 ability, Solgaleo)
    const mon = makeActivePokemon({
      types: ["psychic", "steel"],
      ability: "full-metal-body",
      nickname: "Solgaleo",
    });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.messages[0]).toContain("Full Metal Body");
  });

  it("given a Defiant Pokemon switching into Sticky Web, when applied, then triggers Defiant (+2 Atk) and stat stage is actually set", () => {
    // Source: Bulbapedia -- Defiant: raises Attack by 2 stages when a stat is lowered by an opponent
    // Source: Showdown data/abilities.ts -- Defiant: onAfterEachBoost triggers on Speed drop
    const mon = makeActivePokemon({ types: ["normal"], ability: "defiant", nickname: "Braviary" });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    // statChanges must include both the Speed drop and the +2 Attack boost
    expect(result.statChanges).toEqual([
      { stat: "speed", stages: -1 },
      { stat: "attack", stages: 2 },
    ]);
    expect(result.messages).toContain("Braviary's Defiant sharply raised its Attack!");
  });

  it("given a Competitive Pokemon switching into Sticky Web, when applied, then triggers Competitive (+2 SpAtk) and stat stage is actually set", () => {
    // Source: Bulbapedia -- Competitive: raises Sp. Atk by 2 stages when a stat is lowered
    // Source: Showdown data/abilities.ts -- Competitive: onAfterEachBoost triggers on Speed drop
    const mon = makeActivePokemon({
      types: ["normal"],
      ability: "competitive",
      nickname: "Milotic",
    });
    const result = applyGen7StickyWeb(mon, false);
    expect(result.applied).toBe(true);
    // statChanges must include both the Speed drop and the +2 Sp. Atk boost
    expect(result.statChanges).toEqual([
      { stat: "speed", stages: -1 },
      { stat: "spAttack", stages: 2 },
    ]);
    expect(result.messages).toContain("Milotic's Competitive sharply raised its Sp. Atk!");
  });
});

// ---------------------------------------------------------------------------
// Combined Hazard Application Tests
// ---------------------------------------------------------------------------

describe("Gen7 applyGen7EntryHazards", () => {
  it("given Stealth Rock + Spikes, when grounded Normal-type switches in, then takes combined damage", () => {
    // Source: Showdown -- hazards apply in order: Stealth Rock, Spikes, Toxic Spikes, Sticky Web
    // Stealth Rock: Rock vs Normal = 1.0x -> floor(200/8) = 25
    // Spikes (2 layers): floor(200*4/24) = 33
    // Total: 58
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 2 },
    ]);
    const state = makeState();
    const result = applyGen7EntryHazards(mon, side, state, GEN7_TYPE_CHART);
    expect(result.damage).toBe(58);
  });

  it("given Magic Guard Pokemon with all hazards, when switching in, then no damage/status but Sticky Web applies", () => {
    // Source: Bulbapedia -- Magic Guard prevents indirect damage but not stat drops
    // Source: Showdown -- Sticky Web applies even with Magic Guard
    const mon = makeActivePokemon({
      types: ["normal"],
      ability: "magic-guard",
      maxHp: 200,
      nickname: "Clefable",
    });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 3 },
      { type: "toxic-spikes", layers: 2 },
      { type: "sticky-web", layers: 1 },
    ]);
    const state = makeState();
    const result = applyGen7EntryHazards(mon, side, state, GEN7_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    // Sticky Web still applies (not damage)
    expect(result.statChanges).toEqual([{ stat: "speed", stages: -1 }]);
    expect(result.messages).toContain("Clefable was caught in a sticky web!");
  });

  it("given Poison-type with Toxic Spikes, when switching in, then absorbs them", () => {
    // Source: Showdown -- grounded Poison-type absorbs Toxic Spikes
    const mon = makeActivePokemon({ types: ["poison"], maxHp: 200, nickname: "Weezing" });
    const side = makeSide([{ type: "toxic-spikes", layers: 2 }]);
    const state = makeState();
    const result = applyGen7EntryHazards(mon, side, state, GEN7_TYPE_CHART);
    expect(result.hazardsToRemove).toEqual(["toxic-spikes"]);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Toxic Spikes with Misty Terrain active, when grounded Pokemon switches in, then status is blocked", () => {
    // Source: Showdown -- mistyterrain.onSetStatus blocks all status for grounded Pokemon
    const mon = makeActivePokemon({ types: ["normal"], maxHp: 200 });
    const side = makeSide([{ type: "toxic-spikes", layers: 1 }]);
    const state = {
      ...makeState(),
      terrain: { type: "misty", turnsLeft: 5 },
    } as unknown as BattleState;
    const result = applyGen7EntryHazards(mon, side, state, GEN7_TYPE_CHART);
    expect(result.statusInflicted).toBeNull();
  });
});
