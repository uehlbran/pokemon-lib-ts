import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { EntryHazardType, VolatileStatus } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen6EntryHazards,
  applyGen6SpikesHazard,
  applyGen6StealthRock,
  applyGen6StickyWeb,
  applyGen6ToxicSpikes,
  isGen6Grounded,
} from "../src/Gen6EntryHazards";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

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

describe("Gen6 isGen6Grounded", () => {
  it("given a Normal-type with no special conditions, when checking grounding, then is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- default isGrounded = true for non-Flying/non-Levitate
    const pokemon = makeActivePokemon({ types: ["normal"] });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Ground-type, when checking grounding, then is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- Ground-type has no special grounding exemption
    const pokemon = makeActivePokemon({ types: ["ground"] });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown sim/pokemon.ts -- Flying-type is not grounded
    const pokemon = makeActivePokemon({ types: ["flying"] });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Levitate, when checking grounding, then is NOT grounded", () => {
    // Source: Bulbapedia -- Levitate: makes the user immune to Ground-type moves
    const pokemon = makeActivePokemon({ ability: "levitate" });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon holding Air Balloon, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown data/items.ts -- Air Balloon: grants Ground immunity
    const pokemon = makeActivePokemon({ heldItem: "air-balloon" });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Magnet Rise, when checking grounding, then is NOT grounded", () => {
    // Source: Bulbapedia -- Magnet Rise: makes the user immune to Ground-type moves
    const volatiles = new Map([["magnet-rise", { turnsLeft: 5 }]]);
    const pokemon = makeActivePokemon({ volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Telekinesis, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: checks telekinesis volatile
    // Source: Bulbapedia -- Telekinesis: target is raised into the air
    // This is the key Gen 6 difference from Gen 5's grounding check
    const volatiles = new Map([["telekinesis", { turnsLeft: 3 }]]);
    const pokemon = makeActivePokemon({ volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    const pokemon = makeActivePokemon({ types: ["flying"] });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });

  it("given a Levitate Pokemon under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity overrides Levitate for grounding purposes
    const pokemon = makeActivePokemon({ ability: "levitate" });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });

  it("given a Telekinesis Pokemon under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity overrides Telekinesis for grounding
    const volatiles = new Map([["telekinesis", { turnsLeft: 3 }]]);
    const pokemon = makeActivePokemon({ volatiles });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });

  it("given a Pokemon holding Iron Ball, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
    // Even if the Pokemon is Flying-type, Iron Ball grounds it
    const pokemon = makeActivePokemon({ types: ["flying"], heldItem: "iron-ball" });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Pokemon hit by Smack Down (smackdown volatile), when checking grounding, then IS grounded", () => {
    // Source: Showdown data/moves.ts -- smackdown volatile grounds the target
    const volatiles = new Map([["smackdown", { turnsLeft: -1 }]]);
    const pokemon = makeActivePokemon({ types: ["flying"], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon with Ingrain, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Ingrain: "The user is affected by hazards on the ground,
    //   even if it is a Flying-type or has the Levitate ability."
    const volatiles = new Map([["ingrain", { turnsLeft: -1 }]]);
    const pokemon = makeActivePokemon({ types: ["flying"], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Levitate Pokemon with Ingrain, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Ingrain: "even if it ... has the Levitate ability"
    const volatiles = new Map([["ingrain", { turnsLeft: -1 }]]);
    const pokemon = makeActivePokemon({ ability: "levitate", volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given an Air Balloon holder with Klutz, when checking grounding, then IS grounded (item suppressed)", () => {
    // Source: Bulbapedia -- Klutz: "The held item has no effect" -- suppresses Air Balloon
    const pokemon = makeActivePokemon({ heldItem: "air-balloon", ability: "klutz" });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given an Air Balloon holder under Embargo, when checking grounding, then IS grounded (item suppressed)", () => {
    // Source: Bulbapedia -- Embargo: "The target cannot use its held item" -- suppresses Air Balloon
    const volatiles = new Map([["embargo", { turnsLeft: 5 }]]);
    const pokemon = makeActivePokemon({ heldItem: "air-balloon", volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Iron Ball holder with Klutz, when checking grounding, then is NOT grounded (item suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: Iron Ball grounding is suppressed by Klutz
    const pokemon = makeActivePokemon({
      types: ["flying"],
      heldItem: "iron-ball",
      ability: "klutz",
    });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type Iron Ball holder under Embargo, when checking grounding, then is NOT grounded (item suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: Iron Ball grounding is suppressed by Embargo
    const volatiles = new Map([["embargo", { turnsLeft: 5 }]]);
    const pokemon = makeActivePokemon({ types: ["flying"], heldItem: "iron-ball", volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen6 Spikes", () => {
  it("given 1 layer of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 3/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 1 layer = damageAmounts[1] = 3/24 of maxHP
    // At 160 max HP: floor(160 * 3 / 24) = floor(480 / 24) = 20 HP
    const pokemon = makeActivePokemon({ maxHp: 160, types: ["normal"] });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(20);
  });

  it("given 2 layers of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 4/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 2 layers = damageAmounts[2] = 4/24 of maxHP
    // At 240 max HP: floor(240 * 4 / 24) = floor(960 / 24) = 40 HP
    const pokemon = makeActivePokemon({ maxHp: 240, types: ["water"] });
    const result = applyGen6SpikesHazard(pokemon, 2, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(40);
  });

  it("given 3 layers of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 6/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 3 layers = damageAmounts[3] = 6/24 = 1/4 of maxHP
    // At 200 max HP: floor(200 * 6 / 24) = floor(1200 / 24) = 50 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const result = applyGen6SpikesHazard(pokemon, 3, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Spikes, when a Flying-type switches in, then takes no damage (returns null)", () => {
    // Source: Showdown data/moves.ts -- spikes: if (!pokemon.isGrounded()) return;
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when a Levitate Pokemon switches in, then takes no damage (returns null)", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate makes the Pokemon not grounded
    const pokemon = makeActivePokemon({ maxHp: 200, ability: "levitate" });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when an Air Balloon holder switches in, then takes no damage (returns null)", () => {
    // Source: Showdown data/items.ts -- Air Balloon: grants Ground immunity (not grounded)
    const pokemon = makeActivePokemon({ maxHp: 200, heldItem: "air-balloon" });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when a Telekinesis Pokemon switches in, then takes no damage (not grounded)", () => {
    // Source: Showdown sim/pokemon.ts -- Telekinesis grants levitation
    const volatiles = new Map([["telekinesis", { turnsLeft: 3 }]]);
    const pokemon = makeActivePokemon({ maxHp: 200, volatiles });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes + Gravity, when a Flying-type switches in, then takes damage (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    // At 200 max HP with 1 layer: floor(200 * 3 / 24) = floor(600 / 24) = 25 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const result = applyGen6SpikesHazard(pokemon, 1, true);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given 1 layer of Spikes on a Pokemon with 1 HP max, then minimum damage is 1", () => {
    // Source: Showdown -- Math.max(1, ...) ensures minimum 1 damage
    // This covers Shedinja or very low HP Pokemon
    const pokemon = makeActivePokemon({ maxHp: 1, types: ["bug"] });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Stealth Rock Tests
// ---------------------------------------------------------------------------

describe("Gen6 Stealth Rock", () => {
  it("given Stealth Rock, when a Normal-type switches in, then takes floor(maxHp / 8) (neutral)", () => {
    // Source: Showdown data/moves.ts -- stealthrock: damage = maxhp * (2^0) / 8 = maxhp/8
    // Rock vs Normal = 1x neutral
    // At 200 max HP: floor(200 * 1 / 8) = 25 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given Stealth Rock, when a Fire/Flying Pokemon switches in, then takes floor(maxHp * 4 / 8) = 50% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire, 2x vs Flying = 4x total
    // damage = floor(maxHp * 4 / 8) = floor(maxHp / 2)
    // At 200 max HP: floor(200 * 4 / 8) = 100 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fire", "flying"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(100);
  });

  it("given Stealth Rock, when a Fire-type switches in, then takes floor(maxHp * 2 / 8) = 25% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire
    // At 200 max HP: floor(200 * 2 / 8) = 50 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fire"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock, when a Fighting-type switches in, then takes floor(maxHp * 0.5 / 8) damage", () => {
    // Source: Showdown -- Rock is 0.5x effective vs Fighting
    // At 200 max HP: floor(200 * 0.5 / 8) = floor(100 / 8) = 12 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fighting"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });

  it("given Stealth Rock, when a Fighting/Ground-type switches in, then takes floor(maxHp * 0.25 / 8)", () => {
    // Source: Showdown -- Rock is 0.5x vs Fighting, 0.5x vs Ground = 0.25x total
    // At 200 max HP: floor(200 * 0.25 / 8) = floor(50 / 8) = 6 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fighting", "ground"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(6);
  });

  it("given Stealth Rock, when a Flying-type switches in, then still takes damage (no grounding check)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has NO isGrounded() check
    // Rock vs Flying = 2x
    // At 200 max HP: floor(200 * 2 / 8) = 50 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock, when a Steel-type switches in, then takes floor(maxHp * 0.5 / 8)", () => {
    // Source: Showdown -- Rock is 0.5x vs Steel (Gen 6 type chart)
    // At 200 max HP: floor(200 * 0.5 / 8) = floor(12.5) = 12 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["steel"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });

  it("given Stealth Rock, when a Fairy-type switches in, then takes neutral damage (Rock vs Fairy = 1x)", () => {
    // Source: Showdown data/typechart.ts -- Rock vs Fairy = 1x (neutral)
    // At 200 max HP: floor(200 * 1 / 8) = 25 HP
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fairy"] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Toxic Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen6 Toxic Spikes", () => {
  it("given 1 layer of Toxic Spikes, when a grounded non-Poison/Steel Pokemon switches in, then becomes poisoned", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 1 layer = regular poison
    const pokemon = makeActivePokemon({ types: ["normal"] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe("poison");
    expect(result.message).toBe("TestMon was poisoned by the toxic spikes!");
  });

  it("given 2 layers of Toxic Spikes, when a grounded non-Poison/Steel Pokemon switches in, then becomes badly poisoned", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 2 layers = badly poisoned (toxic)
    const pokemon = makeActivePokemon({ types: ["water"] });
    const result = applyGen6ToxicSpikes(pokemon, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe("badly-poisoned");
    expect(result.message).toBe("TestMon was badly poisoned by the toxic spikes!");
  });

  it("given Toxic Spikes, when a Poison-type switches in, then absorbs the hazard (removes it)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs = removes from field
    const pokemon = makeActivePokemon({ types: ["poison"] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
    expect(result.message).toBe("TestMon absorbed the poison spikes!");
  });

  it("given Toxic Spikes, when a Poison/Flying-type switches in, then does NOT absorb (not grounded)", () => {
    // Source: Showdown -- toxicspikes: grounded check happens BEFORE Poison-type check
    // Flying-type is not grounded, so the Poison-type absorption never triggers
    const pokemon = makeActivePokemon({ types: ["poison", "flying"] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Steel-type switches in, then is immune (no status, no absorption)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Steel-type immune to poison status
    const pokemon = makeActivePokemon({ types: ["steel"] });
    const result = applyGen6ToxicSpikes(pokemon, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Flying-type switches in, then is immune (not grounded)", () => {
    // Source: Showdown -- Flying-type is not grounded, so Toxic Spikes has no effect
    const pokemon = makeActivePokemon({ types: ["flying"] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Pokemon with an existing status switches in, then no additional status", () => {
    // Source: Showdown -- trySetStatus fails if Pokemon already has a status
    const pokemon = makeActivePokemon({ types: ["normal"], status: "burn" });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes + Gravity, when a Poison/Flying-type switches in, then absorbs (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity grounds everything; then Poison-type absorbs Toxic Spikes
    const pokemon = makeActivePokemon({ types: ["poison", "flying"] });
    const result = applyGen6ToxicSpikes(pokemon, 2, true);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Levitate Pokemon switches in, then is immune (not grounded)", () => {
    // Source: Showdown -- Levitate means not grounded
    const pokemon = makeActivePokemon({ ability: "levitate" });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Fairy-type switches in, then becomes poisoned (Fairy is not immune to Toxic Spikes)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: only Poison/Steel types are immune;
    //   Fairy type has no special interaction with Toxic Spikes
    const pokemon = makeActivePokemon({ types: ["fairy"] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe("poison");
  });
});

// ---------------------------------------------------------------------------
// Sticky Web Tests
// ---------------------------------------------------------------------------

describe("Gen6 Sticky Web", () => {
  it("given Sticky Web set, when a grounded Pokemon switches in, then Speed stage drops by 1", () => {
    // Source: Bulbapedia -- Sticky Web: "lowers the Speed stat of the opposing Pokemon
    //   that switches into it by one stage"
    // Source: Showdown data/moves.ts -- stickyweb: this.boost({spe: -1}, pokemon)
    const pokemon = makeActivePokemon({ types: ["normal"] });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.messages[0]).toContain("sticky web");
  });

  it("given Sticky Web set, when a Water-type Pokemon switches in, then Speed stage drops by 1", () => {
    // Source: Bulbapedia -- Sticky Web affects all grounded Pokemon regardless of type
    // Triangulation case: different type, same behavior
    const pokemon = makeActivePokemon({ types: ["water"], nickname: "Vaporeon" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.messages[0]).toContain("Vaporeon");
  });

  it("given Sticky Web set, when a Flying-type Pokemon switches in, then no effect (not grounded)", () => {
    // Source: Showdown data/moves.ts -- stickyweb: "if (!pokemon.isGrounded()) return;"
    // Source: Bulbapedia -- Sticky Web only affects grounded Pokemon
    const pokemon = makeActivePokemon({ types: ["flying"] });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.messages).toHaveLength(0);
  });

  it("given Sticky Web set, when a Levitate ability Pokemon switches in, then no effect", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate makes Pokemon not grounded
    // Source: Bulbapedia -- Levitate: immunity to Ground moves and ground-based hazards
    const pokemon = makeActivePokemon({ ability: "levitate" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
  });

  it("given Sticky Web set, when a Telekinesis Pokemon switches in, then no effect (not grounded)", () => {
    // Source: Showdown sim/pokemon.ts -- Telekinesis grants levitation
    const volatiles = new Map([["telekinesis", { turnsLeft: 3 }]]);
    const pokemon = makeActivePokemon({ volatiles });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
  });

  it("given Sticky Web set, when a Clear Body Pokemon switches in, then Speed NOT dropped", () => {
    // Source: Showdown data/abilities.ts -- clearbody: "This Pokemon's stat stages cannot
    //   be lowered by other Pokemon"
    // Source: Bulbapedia -- Clear Body prevents stat reductions from opponents
    const pokemon = makeActivePokemon({ ability: "clear-body" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain("Clear Body");
  });

  it("given Sticky Web set, when a White Smoke Pokemon switches in, then Speed NOT dropped", () => {
    // Source: Showdown data/abilities.ts -- whitesmoke: same effect as Clear Body
    // Source: Bulbapedia -- White Smoke prevents stat reductions from opponents
    const pokemon = makeActivePokemon({ ability: "white-smoke" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain("White Smoke");
  });

  it("given Sticky Web set, when a Defiant Pokemon switches in, then -1 Speed AND triggers +2 Attack", () => {
    // Source: Bulbapedia -- Defiant: "raises the Pokemon's Attack stat by two stages for
    //   each of its stats that is lowered by an opposing Pokemon"
    // Source: Showdown data/abilities.ts -- defiant: onAfterEachBoost
    const pokemon = makeActivePokemon({ ability: "defiant" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    // Defiant triggers a message about Attack boost
    expect(result.messages.some((m) => m.includes("Defiant"))).toBe(true);
    expect(result.messages.some((m) => m.includes("Attack"))).toBe(true);
  });

  it("given Sticky Web set, when a Competitive Pokemon switches in, then -1 Speed AND triggers +2 SpAtk", () => {
    // Source: Bulbapedia -- Competitive: "raises the Pokemon's Special Attack stat by two
    //   stages for each of its stats that is lowered by an opposing Pokemon"
    // Source: Showdown data/abilities.ts -- competitive: onAfterEachBoost
    const pokemon = makeActivePokemon({ ability: "competitive" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    // Competitive triggers a message about Sp. Atk boost
    expect(result.messages.some((m) => m.includes("Competitive"))).toBe(true);
    expect(result.messages.some((m) => m.includes("Sp. Atk"))).toBe(true);
  });

  it("given Sticky Web + Gravity, when a Flying-type switches in, then Speed IS dropped (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    const pokemon = makeActivePokemon({ types: ["flying"] });
    const result = applyGen6StickyWeb(pokemon, true);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
  });

  it("given Sticky Web set, when an Air Balloon holder switches in, then no effect (not grounded)", () => {
    // Source: Showdown data/items.ts -- Air Balloon grants Ground immunity
    const pokemon = makeActivePokemon({ heldItem: "air-balloon" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Combined Entry Hazard Tests (applyGen6EntryHazards)
// ---------------------------------------------------------------------------

describe("Gen6 applyGen6EntryHazards (combined)", () => {
  it("given Magic Guard, when switching into damage hazards, then takes no damage and no status", () => {
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
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Magic Guard + Sticky Web, when switching in, then Sticky Web still applies (-1 Speed)", () => {
    // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
    //   Sticky Web is a stat drop, not damage, so Magic Guard does NOT block it
    // Source: Showdown data/moves.ts -- stickyweb handler has no Magic Guard check
    const pokemon = makeActivePokemon({
      maxHp: 200,
      types: ["normal"],
      ability: "magic-guard",
    });
    const side = makeSide([{ type: "sticky-web", layers: 1 }]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statChanges.length).toBe(1);
    expect(result.statChanges[0]).toEqual({ stat: "speed", stages: -1 });
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
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(75);
    expect(result.messages).toHaveLength(2);
  });

  it("given all four hazards, when a grounded Normal-type switches in, then takes SR + Spikes damage, gets poisoned, and loses Speed", () => {
    // Source: Showdown -- all hazards apply independently in order
    // SR: floor(200 * 1 / 8) = 25
    // Spikes 1 layer: floor(200 * 3 / 24) = 25
    // Toxic Spikes 1 layer: poison
    // Sticky Web: -1 Speed
    // Total damage: 50, status: poison, statChanges: [{speed, -1}]
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"] });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "spikes", layers: 1 },
      { type: "toxic-spikes", layers: 1 },
      { type: "sticky-web", layers: 1 },
    ]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.statusInflicted).toBe("poison");
    expect(result.statChanges).toEqual([{ stat: "speed", stages: -1 }]);
    // 4 messages: SR + Spikes + Toxic Spikes + Sticky Web
    expect(result.messages).toHaveLength(4);
  });

  it("given Toxic Spikes, when a Poison-type switches in, then hazardsToRemove includes toxic-spikes", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs = removes hazard
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["poison"] });
    const side = makeSide([{ type: "toxic-spikes", layers: 2 }]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual(["toxic-spikes"]);
  });

  it("given no hazards on the side, when any Pokemon switches in, then no damage and no status", () => {
    // Source: obvious -- no hazards means no effects
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["fire", "flying"] });
    const side = makeSide([]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.statChanges).toEqual([]);
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
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Pointed stones");
  });

  it("given Sticky Web + Spikes, when a Flying-type switches in, then no Spikes damage and no Sticky Web", () => {
    // Source: Showdown -- Flying-type is not grounded: immune to both Spikes and Sticky Web
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["flying"] });
    const side = makeSide([
      { type: "spikes", layers: 3 },
      { type: "sticky-web", layers: 1 },
    ]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statChanges).toEqual([]);
    expect(result.messages).toHaveLength(0);
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
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(133);
  });

  it("given only Sticky Web, when a Clear Body Pokemon switches in, then no stat changes applied", () => {
    // Source: Showdown data/abilities.ts -- clearbody blocks stat drops from opponents
    const pokemon = makeActivePokemon({ ability: "clear-body" });
    const side = makeSide([{ type: "sticky-web", layers: 1 }]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statChanges).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain("Clear Body");
  });

  it("given Sticky Web, when a Defiant Pokemon switches in via combined hazards, then statChanges includes speed -1", () => {
    // Source: Bulbapedia -- Defiant triggers on stat drops from opponents
    // The Defiant +2 Attack counter-boost is noted in messages but the actual stat
    // change handling is done by the engine (not in the EntryHazardResult.statChanges)
    const pokemon = makeActivePokemon({ maxHp: 200, types: ["normal"], ability: "defiant" });
    const side = makeSide([
      { type: "stealth-rock", layers: 1 },
      { type: "sticky-web", layers: 1 },
    ]);
    const state = makeState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    // SR damage: floor(200 / 8) = 25
    expect(result.damage).toBe(25);
    expect(result.statChanges).toEqual([{ stat: "speed", stages: -1 }]);
    // Messages: SR + sticky web + Defiant trigger
    expect(result.messages.some((m) => m.includes("Defiant"))).toBe(true);
  });
});
