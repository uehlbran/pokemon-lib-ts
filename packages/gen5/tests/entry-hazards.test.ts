import type {
  ActivePokemon,
  BattleSide,
  BattleState,
  MoveEffectContext,
} from "@pokemon-lib-ts/battle";
import type { EntryHazardType, VolatileStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen5EntryHazards,
  applyGen5SpikesHazard,
  applyGen5StealthRock,
  applyGen5ToxicSpikes,
  isGen5Grounded,
} from "../src/Gen5EntryHazards";
import { handleGen5BehaviorMove } from "../src/Gen5MoveEffectsBehavior";
import { Gen5Ruleset } from "../src/Gen5Ruleset";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

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
// Grounding Check Tests
// ---------------------------------------------------------------------------

describe("Gen5 isGen5Grounded", () => {
  it("given a Normal-type with no special conditions, when checking grounding, then is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- default isGrounded = true for non-Flying/non-Levitate
    const pokemon = makeActivePokemon({ types: ["normal"] });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown sim/pokemon.ts -- Flying-type is not grounded
    const pokemon = makeActivePokemon({ types: ["flying"] });
    expect(isGen5Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Levitate, when checking grounding, then is NOT grounded", () => {
    // Source: Bulbapedia -- Levitate: makes the user immune to Ground-type moves
    const pokemon = makeActivePokemon({ ability: "levitate" });
    expect(isGen5Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon holding Air Balloon, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown data/items.ts -- Air Balloon: grants Ground immunity
    const pokemon = makeActivePokemon({ heldItem: "air-balloon" });
    expect(isGen5Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Magnet Rise, when checking grounding, then is NOT grounded", () => {
    // Source: Bulbapedia -- Magnet Rise: makes the user immune to Ground-type moves
    const volatiles = new Map([["magnet-rise", { turnsLeft: 5 }]]);
    const pokemon = makeActivePokemon({ volatiles });
    expect(isGen5Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    const pokemon = makeActivePokemon({ types: ["flying"] });
    expect(isGen5Grounded(pokemon, true)).toBe(true);
  });

  it("given a Levitate Pokemon under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity overrides Levitate for grounding purposes
    const pokemon = makeActivePokemon({ ability: "levitate" });
    expect(isGen5Grounded(pokemon, true)).toBe(true);
  });

  it("given a Pokemon holding Iron Ball, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
    // Even if the Pokemon is Flying-type, Iron Ball grounds it
    const pokemon = makeActivePokemon({ types: ["flying"], heldItem: "iron-ball" });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given a Pokemon hit by Smack Down (smackdown volatile), when checking grounding, then IS grounded", () => {
    // Source: Showdown data/moves.ts -- smackdown volatile grounds the target
    const volatiles = new Map([["smackdown", { turnsLeft: -1 }]]);
    const pokemon = makeActivePokemon({ types: ["flying"], volatiles });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon with Ingrain, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Ingrain: "The user is affected by hazards on the ground,
    //   even if it is a Flying-type or has the Levitate ability."
    // Source: Showdown sim/pokemon.ts -- isGrounded checks 'ingrain' volatile before
    //   Flying/Levitate checks
    const volatiles = new Map([["ingrain", { turnsLeft: -1 }]]);
    const pokemon = makeActivePokemon({ types: ["flying"], volatiles });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given a Levitate Pokemon with Ingrain, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Ingrain: "even if it ... has the Levitate ability"
    const volatiles = new Map([["ingrain", { turnsLeft: -1 }]]);
    const pokemon = makeActivePokemon({ ability: "levitate", volatiles });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given an Air Balloon holder with Klutz, when checking grounding, then IS grounded (item suppressed)", () => {
    // Source: Bulbapedia -- Klutz: "The held item has no effect" — suppresses Air Balloon levitation
    // Source: Showdown sim/pokemon.ts -- isGrounded: suppresses item effect when Klutz active
    const pokemon = makeActivePokemon({ heldItem: "air-balloon", ability: "klutz" });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given an Air Balloon holder under Embargo, when checking grounding, then IS grounded (item suppressed)", () => {
    // Source: Bulbapedia -- Embargo: "The target cannot use its held item" — suppresses Air Balloon
    // Source: Showdown sim/pokemon.ts -- isGrounded: suppresses item effect under Embargo volatile
    const volatiles = new Map([["embargo", { turnsLeft: 5 }]]);
    const pokemon = makeActivePokemon({ heldItem: "air-balloon", volatiles });
    expect(isGen5Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Iron Ball holder with Klutz, when checking grounding, then is NOT grounded (item suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: Iron Ball grounding is suppressed by Klutz
    // Klutz suppresses held-item effects, so Iron Ball cannot force grounding.
    const pokemon = makeActivePokemon({
      types: ["flying"],
      heldItem: "iron-ball",
      ability: "klutz",
    });
    expect(isGen5Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type Iron Ball holder under Embargo, when checking grounding, then is NOT grounded (item suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: Iron Ball grounding is suppressed by Embargo
    // Embargo suppresses held-item effects, so Iron Ball cannot force grounding.
    const volatiles = new Map([["embargo", { turnsLeft: 5 }]]);
    const pokemon = makeActivePokemon({ types: ["flying"], heldItem: "iron-ball", volatiles });
    expect(isGen5Grounded(pokemon, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen5 Spikes", () => {
  it("given 1 layer of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 3/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 1 layer = damageAmounts[1] = 3/24 of maxHP
    // At 160 max HP: floor(160 * 3 / 24) = floor(480 / 24) = 20 HP
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["normal"] });
    const result = applyGen5SpikesHazard(pokemon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(20);
  });

  it("given 2 layers of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 4/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 2 layers = damageAmounts[2] = 4/24 of maxHP
    // At 240 max HP: floor(240 * 4 / 24) = floor(960 / 24) = 40 HP
    const pokemon = makeActivePokemon({ maxHp: 240, types: ["water"] });
    const result = applyGen5SpikesHazard(pokemon, 2, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(40);
  });

  it("given 3 layers of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 6/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 3 layers = damageAmounts[3] = 6/24 = 1/4 of maxHP
    // At 200 max HP: floor(200 * 6 / 24) = floor(1200 / 24) = 50 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const result = applyGen5SpikesHazard(pokemon, 3, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Spikes, when a Flying-type switches in, then takes no damage (returns null)", () => {
    // Source: Showdown data/moves.ts -- spikes: if (!pokemon.isGrounded()) return;
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const result = applyGen5SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when a Levitate Pokemon switches in, then takes no damage (returns null)", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate makes the Pokemon not grounded
    const pokemon = makeActivePokemon({ maxHp: 200, ability: "levitate" });
    const result = applyGen5SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when an Air Balloon holder switches in, then takes no damage (returns null)", () => {
    // Source: Showdown data/items.ts -- Air Balloon: grants Ground immunity (not grounded)
    const pokemon = makeActivePokemon({ maxHp: 200, heldItem: "air-balloon" });
    const result = applyGen5SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes + Gravity, when a Flying-type switches in, then takes damage (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    // At 200 max HP with 1 layer: floor(200 * 3 / 24) = floor(600 / 24) = 25 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const result = applyGen5SpikesHazard(pokemon, 1, true);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given 1 layer of Spikes on a Pokemon with 1 HP max, then minimum damage is 1", () => {
    // Source: Showdown -- Math.max(1, ...) ensures minimum 1 damage
    // This covers Shedinja or very low HP Pokemon
    const pokemon = makeActivePokemon({ maxHp: 1, types: ["bug"] });
    const result = applyGen5SpikesHazard(pokemon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stealth Rock Tests
// ---------------------------------------------------------------------------

describe("Gen5 Stealth Rock", () => {
  it("given Stealth Rock, when a Normal-type switches in, then takes floor(maxHp / 8) (neutral)", () => {
    // Source: Showdown data/moves.ts -- stealthrock: damage = maxhp * (2^0) / 8 = maxhp/8
    // Rock vs Normal = 1x neutral
    // At 200 max HP: floor(200 * 1 / 8) = 25 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given Stealth Rock, when a Fire/Flying Pokemon switches in, then takes floor(maxHp * 4 / 8) = 50% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire, 2x vs Flying = 4x total
    // damage = floor(maxHp * 4 / 8) = floor(maxHp / 2)
    // At 200 max HP: floor(200 * 4 / 8) = 100 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fire", "flying"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(100);
  });

  it("given Stealth Rock, when a Fire-type switches in, then takes floor(maxHp * 2 / 8) = 25% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire
    // At 200 max HP: floor(200 * 2 / 8) = 50 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fire"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock, when a Fighting-type switches in, then takes floor(maxHp * 0.5 / 8) damage", () => {
    // Source: Showdown -- Rock is 0.5x effective vs Fighting
    // At 200 max HP: floor(200 * 0.5 / 8) = floor(100 / 8) = 12 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fighting"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });

  it("given Stealth Rock, when a Fighting/Ground-type switches in, then takes floor(maxHp * 0.25 / 8)", () => {
    // Source: Showdown -- Rock is 0.5x vs Fighting, 0.5x vs Ground = 0.25x total
    // At 200 max HP: floor(200 * 0.25 / 8) = floor(50 / 8) = 6 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fighting", "ground"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(6);
  });

  it("given Stealth Rock, when a Flying-type switches in, then still takes damage (no grounding check)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has NO isGrounded() check
    // Rock vs Flying = 2x
    // At 200 max HP: floor(200 * 2 / 8) = 50 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock, when a Steel-type switches in, then takes floor(maxHp * 0.5 / 8)", () => {
    // Source: Showdown -- Rock is 0.5x vs Steel (Gen 5 type chart)
    // At 200 max HP: floor(200 * 0.5 / 8) = floor(12.5) = 12 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["steel"] });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Toxic Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen5 Toxic Spikes", () => {
  it("given 1 layer of Toxic Spikes, when a grounded non-Poison/Steel Pokemon switches in, then becomes poisoned", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 1 layer = regular poison
    const pokemon = makeActivePokemon({ types: ["normal"] });
    const result = applyGen5ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe("poison");
    expect(result.message).toBe("TestMon was poisoned by the toxic spikes!");
  });

  it("given 2 layers of Toxic Spikes, when a grounded non-Poison/Steel Pokemon switches in, then becomes badly poisoned", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 2 layers = badly poisoned (toxic)
    const pokemon = makeActivePokemon({ types: ["water"] });
    const result = applyGen5ToxicSpikes(pokemon, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe("badly-poisoned");
    expect(result.message).toBe("TestMon was badly poisoned by the toxic spikes!");
  });

  it("given Toxic Spikes, when a Poison-type switches in, then absorbs the hazard (removes it)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs = removes from field
    const pokemon = makeActivePokemon({ types: ["poison"] });
    const result = applyGen5ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
    expect(result.message).toBe("TestMon absorbed the poison spikes!");
  });

  it("given Toxic Spikes, when a Poison/Flying-type switches in, then does NOT absorb (not grounded)", () => {
    // Source: Showdown -- toxicspikes: grounded check happens BEFORE Poison-type check
    // Flying-type is not grounded, so the Poison-type absorption never triggers
    const pokemon = makeActivePokemon({ types: ["poison", "flying"] });
    const result = applyGen5ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Steel-type switches in, then is immune (no status, no absorption)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Steel-type immune to poison status
    const pokemon = makeActivePokemon({ types: ["steel"] });
    const result = applyGen5ToxicSpikes(pokemon, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Flying-type switches in, then is immune (not grounded)", () => {
    // Source: Showdown -- Flying-type is not grounded, so Toxic Spikes has no effect
    const pokemon = makeActivePokemon({ types: ["flying"] });
    const result = applyGen5ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Pokemon with an existing status switches in, then no additional status", () => {
    // Source: Showdown -- trySetStatus fails if Pokemon already has a status
    const pokemon = makeActivePokemon({ types: ["normal"], status: "burn" });
    const result = applyGen5ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes + Gravity, when a Poison/Flying-type switches in, then absorbs (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity grounds everything; then Poison-type absorbs Toxic Spikes
    const pokemon = makeActivePokemon({ types: ["poison", "flying"] });
    const result = applyGen5ToxicSpikes(pokemon, 2, true);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Levitate Pokemon switches in, then is immune (not grounded)", () => {
    // Source: Showdown -- Levitate means not grounded
    const pokemon = makeActivePokemon({ ability: "levitate" });
    const result = applyGen5ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Combined Entry Hazard Tests (applyGen5EntryHazards)
// ---------------------------------------------------------------------------

describe("Gen5 applyGen5EntryHazards (combined)", () => {
  it("given Magic Guard, when switching into any hazards, then takes no damage and no status", () => {
    // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
    // Source: Showdown -- Magic Guard prevents hazard damage and status
    const pokemon = makeActivePokemon({
      maxHp: 200,
      types: ["normal"],
      ability: "magic-guard",
    });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 3 },
      { type: "toxic-spikes", layers: 2 },
    ]);
    const state = makeState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it("given Stealth Rock + 3 layers of Spikes, when a Normal-type switches in, then takes combined damage", () => {
    // Source: Showdown -- each hazard applies independently
    // Stealth Rock: floor(200 * 1 / 8) = 25 HP (Rock vs Normal = 1x)
    // Spikes 3 layers: floor(200 * 6 / 24) = 50 HP
    // Total: 25 + 50 = 75 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 3 },
    ]);
    const state = makeState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);
    expect(result.damage).toBe(75);
    expect(result.messages).toHaveLength(2);
  });

  it("given all hazards, when a grounded Normal-type switches in, then takes SR + Spikes damage AND gets poisoned", () => {
    // Source: Showdown -- Stealth Rock, Spikes, and Toxic Spikes all apply
    // SR: floor(200 * 1 / 8) = 25
    // Spikes 1 layer: floor(200 * 3 / 24) = 25
    // Toxic Spikes 1 layer: poison
    // Total damage: 50, status: poison
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 1 },
      { type: "toxic-spikes", layers: 1 },
    ]);
    const state = makeState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.statusInflicted).toBe("poison");
    expect(result.messages).toHaveLength(3);
  });

  it("given Toxic Spikes, when a Poison-type switches in, then hazardsToRemove includes toxic-spikes", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs = removes hazard
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["poison"] });
    const side = makeSide([{ type: "toxic-spikes", layers: 2 }]);
    const state = makeState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual(["toxic-spikes"]);
  });

  it("given no hazards on the side, when any Pokemon switches in, then no damage and no status", () => {
    // Source: obvious -- no hazards means no effects
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fire", "flying"] });
    const side = makeSide([]);
    const state = makeState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it("given Stealth Rock + Spikes, when a Flying-type switches in, then only takes Stealth Rock damage", () => {
    // Source: Showdown -- Flying-type is immune to Spikes (not grounded) but NOT to Stealth Rock
    // SR: Rock vs Flying = 2x -> floor(200 * 2 / 8) = 50 HP
    // Spikes: immune (not grounded)
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 3 },
    ]);
    const state = makeState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Pointed stones");
  });

  it("given Stealth Rock, when a Charizard (Fire/Flying, 4x weak) switches in with 266 HP, then takes 133 HP", () => {
    // Source: Showdown -- Rock is 2x vs Fire, 2x vs Flying = 4x total
    // damage = floor(266 * 4 / 8) = floor(1064 / 8) = 133 HP
    // This is the classic Charizard-Stealth-Rock interaction
    const pokemon = makeActivePokemon({
      maxHp: 266,
      types: ["fire", "flying"],
      nickname: "Charizard",
    });
    const result = applyGen5StealthRock(pokemon, GEN5_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(133);
  });
});

// ---------------------------------------------------------------------------
// Rapid Spin Tests
// ---------------------------------------------------------------------------

describe("Gen5 Rapid Spin (via handleGen5BehaviorMove)", () => {
  // Rapid Spin is tested via the behavior move handler.
  // The move clears hazards from the USER's side and removes Leech Seed + binding.
  // The hazardSet/clearSideHazards field is what the engine reads to clear hazards.

  function makeRapidSpinContext(overrides: {
    attackerVolatiles?: Map<string, { turnsLeft: number }>;
    damage?: number;
  }) {
    const attacker = makeActivePokemon({
      types: ["normal"],
      volatiles: overrides.attackerVolatiles,
    });
    const defender = makeActivePokemon({ types: ["rock"] });
    return {
      move: { id: "rapid-spin" },
      attacker,
      defender,
      // Default damage > 0 so Rapid Spin's onAfterHit effect fires (as it would on a
      // successful hit). Tests for the immunity path explicitly pass damage: 0.
      damage: overrides.damage ?? 10,
      state: makeState(),
    } as unknown as MoveEffectContext;
  }

  it("given Spikes on user's side, when Rapid Spin is used, then result has clearSideHazards = 'attacker'", () => {
    // Source: Showdown data/moves.ts -- rapidspin: removes spikes/stealth-rock/toxic-spikes from user's side
    const ctx = makeRapidSpinContext({});
    const result = handleGen5BehaviorMove(ctx);
    expect(result).not.toBeNull();
    expect(result!.clearSideHazards).toBe("attacker");
  });

  it("given Leech Seed on user, when Rapid Spin is used, then Leech Seed is cleared", () => {
    // Source: Showdown data/moves.ts -- rapidspin: pokemon.removeVolatile('leechseed')
    const volatiles = new Map([["leech-seed", { turnsLeft: -1 }]]);
    const ctx = makeRapidSpinContext({ attackerVolatiles: volatiles });
    const result = handleGen5BehaviorMove(ctx);
    expect(result).not.toBeNull();
    expect(result!.volatilesToClear).toEqual(
      expect.arrayContaining([{ target: "attacker", volatile: "leech-seed" }]),
    );
  });

  it("given binding (bound volatile) on user, when Rapid Spin is used, then binding is cleared", () => {
    // Source: Showdown data/moves.ts -- rapidspin: pokemon.removeVolatile('partiallytrapped')
    const volatiles = new Map([["bound", { turnsLeft: 3 }]]);
    const ctx = makeRapidSpinContext({ attackerVolatiles: volatiles });
    const result = handleGen5BehaviorMove(ctx);
    expect(result).not.toBeNull();
    expect(result!.volatilesToClear).toEqual(
      expect.arrayContaining([{ target: "attacker", volatile: "bound" }]),
    );
  });

  it("given Leech Seed AND binding on user, when Rapid Spin is used, then both are cleared", () => {
    // Source: Showdown data/moves.ts -- rapidspin clears both leech seed and trapping
    const volatiles = new Map([
      ["leech-seed", { turnsLeft: -1 }],
      ["bound", { turnsLeft: 2 }],
    ]);
    const ctx = makeRapidSpinContext({ attackerVolatiles: volatiles });
    const result = handleGen5BehaviorMove(ctx);
    expect(result).not.toBeNull();
    expect(result!.volatilesToClear).toHaveLength(2);
    expect(result!.clearSideHazards).toBe("attacker");
  });

  it("given no hazards/leech-seed/binding, when Rapid Spin is used, then still clears side hazards (no-op if none exist)", () => {
    // Source: Showdown -- rapidspin always sets clearSideHazards, even if no hazards exist
    const ctx = makeRapidSpinContext({});
    const result = handleGen5BehaviorMove(ctx);
    expect(result).not.toBeNull();
    expect(result!.clearSideHazards).toBe("attacker");
  });

  it("given type immunity (damage = 0), when Rapid Spin is used, then does NOT clear hazards", () => {
    // Source: Showdown data/moves.ts -- rapidspin.onAfterHit fires only when the move
    //   deals damage; type immunity (e.g., Normal vs Ghost) prevents onAfterHit from
    //   running, so hazards must NOT be cleared on a 0-damage hit.
    const ctx = makeRapidSpinContext({ damage: 0 });
    const result = handleGen5BehaviorMove(ctx);
    expect(result).not.toBeNull();
    expect(result!.clearSideHazards).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gen5Ruleset.applyEntryHazards integration
// ---------------------------------------------------------------------------

describe("Gen5Ruleset.applyEntryHazards", () => {
  // This tests that the Gen5Ruleset properly wires the hazard logic
  // by calling the override method directly.

  it("given Stealth Rock on a side, when a Fire-type switches in via ruleset, then takes 25% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire -> floor(300 * 2 / 8) = 75
    const ruleset = new Gen5Ruleset();
    const pokemon = makeActivePokemon({ maxHp: 300, types: ["fire"], nickname: "Arcanine" });
    const side = makeSide([{ type: "stealth-rock", layers: 1 }]);
    const state = makeState();

    const result = ruleset.applyEntryHazards(pokemon, side, state);
    expect(result.damage).toBe(75);
    expect(result.messages).toHaveLength(1);
  });

  it("given no state provided to applyEntryHazards, then returns zero-result", () => {
    // Source: GenerationRuleset interface (packages/battle/src/ruleset/GenerationRuleset.ts)
    //   applyEntryHazards(pokemon, side, state?: BattleState): EntryHazardResult
    //   `state` is optional; callers that do not yet have a BattleState (e.g. preview)
    //   receive a safe zero-result rather than throwing. This mirrors the same guard in
    //   Gen 4 (Gen4Ruleset.applyEntryHazards) and is the contract established by the
    //   interface signature.
    const ruleset = new Gen5Ruleset();
    const pokemon = makeActivePokemon({ maxHp: 200 });
    const side = makeSide([{ type: "stealth-rock", layers: 1 }]);

    const result = ruleset.applyEntryHazards(pokemon, side);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });
});
