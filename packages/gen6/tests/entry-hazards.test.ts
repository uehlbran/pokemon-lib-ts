import type { ActivePokemon, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_HAZARD_IDS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  type EntryHazardType,
  type PokemonType,
  type PrimaryStatus,
  type TerrainType,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  applyGen6EntryHazards,
  applyGen6SpikesHazard,
  applyGen6StealthRock,
  applyGen6StickyWeb,
  applyGen6ToxicSpikes,
  GEN6_ABILITY_IDS,
  GEN6_MOVE_IDS,
  GEN6_SPECIES_IDS,
  isGen6Grounded,
} from "../src";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN6_ABILITY_IDS };
const HAZARDS = CORE_HAZARD_IDS;
const ITEMS = CORE_ITEM_IDS;
const MOVES = GEN6_MOVE_IDS;
const SPECIES = GEN6_SPECIES_IDS;
const STATUSES = CORE_STATUS_IDS;
const TERRAINS = CORE_TERRAIN_IDS;
const TYPES = CORE_TYPE_IDS;
const VOLATILES = CORE_VOLATILE_IDS;
const TERRAIN_SOURCES = {
  electricTerrain: MOVES.electricTerrain,
  mistyTerrain: MOVES.mistyTerrain,
} as const;

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createOnFieldPokemon(overrides: {
  maxHp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  speciesId?: number;
  nickname?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  volatiles?: Map<VolatileStatus, { turnsLeft: number }>;
}): ActivePokemon {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      calculatedStats: { hp: maxHp },
      currentHp: overrides.currentHp ?? maxHp,
      nickname: overrides.nickname ?? "TestMon",
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      heldItem: overrides.heldItem ?? null,
      status: overrides.status ?? null,
    },
    ability: overrides.ability ?? ABILITIES.blaze,
    types: overrides.types ?? [TYPES.normal],
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
  } as unknown as ActivePokemon;
}

function makeVolatiles(
  entries: ReadonlyArray<readonly [VolatileStatus, number]>,
): Map<VolatileStatus, { turnsLeft: number }> {
  return new Map(entries.map(([id, turnsLeft]) => [id, { turnsLeft }]));
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

function createBattleState(
  gravityActive = false,
  terrain?: { type: TerrainType; turnsLeft: number; source: string } | null,
): BattleState {
  return {
    weather: null,
    terrain: terrain ?? null,
    sides: [createBattleSide([]), createBattleSide([], 1)],
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
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Ground-type, when checking grounding, then is grounded", () => {
    // Source: Showdown sim/pokemon.ts -- Ground-type has no special grounding exemption
    const pokemon = createOnFieldPokemon({ types: [TYPES.ground] });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown sim/pokemon.ts -- Flying-type is not grounded
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Levitate, when checking grounding, then is NOT grounded", () => {
    // Source: Bulbapedia -- Levitate: makes the user immune to Ground-type moves
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.levitate });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon holding Air Balloon, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown data/items.ts -- Air Balloon: grants Ground immunity
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Magnet Rise, when checking grounding, then is NOT grounded", () => {
    // Source: Bulbapedia -- Magnet Rise: makes the user immune to Ground-type moves
    const volatiles = makeVolatiles([[VOLATILES.magnetRise, 5]]);
    const pokemon = createOnFieldPokemon({ volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with Telekinesis, when checking grounding, then is NOT grounded", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: checks telekinesis volatile
    // Source: Bulbapedia -- Telekinesis: target is raised into the air
    // This is the key Gen 6 difference from Gen 5's grounding check
    const volatiles = makeVolatiles([[VOLATILES.telekinesis, 3]]);
    const pokemon = createOnFieldPokemon({ volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });

  it("given a Levitate Pokemon under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity overrides Levitate for grounding purposes
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.levitate });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });

  it("given a Telekinesis Pokemon under Gravity, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Gravity overrides Telekinesis for grounding
    const volatiles = makeVolatiles([[VOLATILES.telekinesis, 3]]);
    const pokemon = createOnFieldPokemon({ volatiles });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });

  it("given a Pokemon holding Iron Ball, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Iron Ball: "makes the holder grounded"
    // Even if the Pokemon is Flying-type, Iron Ball grounds it
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying], heldItem: ITEMS.ironBall });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Pokemon hit by Smack Down (smackdown volatile), when checking grounding, then IS grounded", () => {
    // Source: Showdown data/moves.ts -- smackdown volatile grounds the target
    const volatiles = makeVolatiles([[VOLATILES.smackDown, -1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Pokemon with Ingrain, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Ingrain: "The user is affected by hazards on the ground,
    //   even if it is a Flying-type or has the Levitate ability."
    const volatiles = makeVolatiles([[VOLATILES.ingrain, -1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Levitate Pokemon with Ingrain, when checking grounding, then IS grounded", () => {
    // Source: Bulbapedia -- Ingrain: "even if it ... has the Levitate ability"
    const volatiles = makeVolatiles([[VOLATILES.ingrain, -1]]);
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.levitate, volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given an Air Balloon holder with Klutz, when checking grounding, then IS grounded (item suppressed)", () => {
    // Source: Bulbapedia -- Klutz: "The held item has no effect" -- suppresses Air Balloon
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon, ability: ABILITIES.klutz });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given an Air Balloon holder under Embargo, when checking grounding, then IS grounded (item suppressed)", () => {
    // Source: Bulbapedia -- Embargo: "The target cannot use its held item" -- suppresses Air Balloon
    const volatiles = makeVolatiles([[VOLATILES.embargo, 5]]);
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon, volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Flying-type Iron Ball holder with Klutz, when checking grounding, then is NOT grounded (item suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: Iron Ball grounding is suppressed by Klutz
    const pokemon = createOnFieldPokemon({
      types: [TYPES.flying],
      heldItem: ITEMS.ironBall,
      ability: ABILITIES.klutz,
    });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Flying-type Iron Ball holder under Embargo, when checking grounding, then is NOT grounded (item suppressed)", () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: Iron Ball grounding is suppressed by Embargo
    const volatiles = makeVolatiles([[VOLATILES.embargo, 5]]);
    const pokemon = createOnFieldPokemon({
      types: [TYPES.flying],
      heldItem: ITEMS.ironBall,
      volatiles,
    });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  // --- Semi-invulnerable grounding (bugs #667, #665, #664) ---

  it("given a Pokemon with the airborne charge-turn volatile from Fly, when checking grounding, then is NOT grounded", () => {
    // Source: BattleEngine.ts:1191 -- Fly sets the shared airborne charge-turn volatile
    // Source: Showdown sim/pokemon.ts -- that volatile makes Pokemon airborne
    // Source: Bulbapedia "Fly" -- "The user flies up high on the first turn"
    // Bug #667: previously used the move id instead of the engine airborne volatile id.
    const volatiles = makeVolatiles([[VOLATILES.flying, 1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with the airborne charge-turn volatile from Bounce, when checking grounding, then is NOT grounded", () => {
    // Source: BattleEngine.ts:1191 -- Bounce also sets the shared airborne charge-turn volatile
    // Source: Gen3MoveEffects.ts TWO_TURN_VOLATILE_MAP -- Bounce maps to that same volatile
    // Source: Bulbapedia "Bounce" -- "The user bounces up high"
    // Bug #665: previously used the move id instead of the engine airborne volatile id.
    // Note: Bounce and Fly share the same airborne volatile, so this test is equivalent
    // to the Fly test above.
    const volatiles = makeVolatiles([[VOLATILES.flying, 1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with the underground charge-turn volatile from Dig, when checking grounding, then IS grounded because it is not airborne", () => {
    // Source: BattleEngine.ts:1192 -- Dig sets the underground charge-turn volatile, not the move id
    // Source: Showdown sim/pokemon.ts -- isGrounded: underground does NOT make the user airborne
    // Source: Bulbapedia "Dig" -- "The user burrows underground" (still on the ground)
    // Bug #664: Only airborne semi-invulnerable states (Fly, Bounce, Shadow Force, Phantom Force)
    // should unground; Dig/Dive stay grounded.
    // Verifies the underground volatile is NOT in AIRBORNE_SEMI_INVULNERABLE.
    const volatiles = makeVolatiles([[VOLATILES.underground, 1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(true);
  });

  it("given a Pokemon with the disappearing charge-turn volatile from Shadow Force, when checking grounding, then is NOT grounded", () => {
    // Source: BattleEngine.ts:1194 -- Shadow Force sets the disappearing charge-turn volatile
    // Source: Gen4MoveEffects.ts TWO_TURN_VOLATILE_MAP -- the move maps to that volatile
    // Source: Bulbapedia "Shadow Force" -- Giratina vanishes and strikes next turn
    // Bug #794: previously used the move id instead of the engine disappearing volatile id.
    const volatiles = makeVolatiles([[VOLATILES.shadowForceCharging, 1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.ghost], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with the disappearing charge-turn volatile from Phantom Force, when checking grounding, then is NOT grounded", () => {
    // Source: BattleEngine.ts:1194 -- Phantom Force also sets the disappearing charge-turn volatile
    // Source: Gen6MoveEffects.ts GEN6_TWO_TURN_VOLATILE_MAP -- the move maps to that same volatile
    // Source: Bulbapedia "Phantom Force" -- user vanishes on first turn
    // Bug #794: previously used the move id instead of the engine disappearing volatile id.
    // Note: Phantom Force and Shadow Force share the same disappearing volatile.
    const volatiles = makeVolatiles([[VOLATILES.shadowForceCharging, 1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.ghost], volatiles });
    expect(isGen6Grounded(pokemon, false)).toBe(false);
  });

  it("given a Pokemon with the airborne charge-turn volatile under Gravity, when checking grounding, then IS grounded (Gravity overrides)", () => {
    // Source: Showdown sim/pokemon.ts -- Gravity overrides all airborne states
    // Source: Bulbapedia "Gravity" -- "All Pokemon are grounded"
    // Source: BattleEngine.ts:1191 -- Fly sets the shared airborne charge-turn volatile
    const volatiles = makeVolatiles([[VOLATILES.flying, 1]]);
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], volatiles });
    expect(isGen6Grounded(pokemon, true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Spikes Tests
// ---------------------------------------------------------------------------

describe("Gen6 Spikes", () => {
  it("given 1 layer of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 3/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 1 layer = damageAmounts[1] = 3/24 of maxHP
    // At 160 max HP: floor(160 * 3 / 24) = floor(480 / 24) = 20 HP
    const pokemon = createOnFieldPokemon({ maxHp: 160, types: [TYPES.normal] });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(20);
  });

  it("given 2 layers of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 4/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 2 layers = damageAmounts[2] = 4/24 of maxHP
    // At 240 max HP: floor(240 * 4 / 24) = floor(960 / 24) = 40 HP
    const pokemon = createOnFieldPokemon({ maxHp: 240, types: [TYPES.water] });
    const result = applyGen6SpikesHazard(pokemon, 2, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(40);
  });

  it("given 3 layers of Spikes, when a grounded Pokemon switches in, then takes floor(maxHp * 6/24) damage", () => {
    // Source: Showdown data/moves.ts -- spikes: 3 layers = damageAmounts[3] = 6/24 = 1/4 of maxHP
    // At 200 max HP: floor(200 * 6 / 24) = floor(1200 / 24) = 50 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const result = applyGen6SpikesHazard(pokemon, 3, false);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Spikes, when a Flying-type switches in, then takes no damage (returns null)", () => {
    // Source: Showdown data/moves.ts -- spikes: if (!pokemon.isGrounded()) return;
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.flying] });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when a Levitate Pokemon switches in, then takes no damage (returns null)", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate makes the Pokemon not grounded
    const pokemon = createOnFieldPokemon({ maxHp: 200, ability: ABILITIES.levitate });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when an Air Balloon holder switches in, then takes no damage (returns null)", () => {
    // Source: Showdown data/items.ts -- Air Balloon: grants Ground immunity (not grounded)
    const pokemon = createOnFieldPokemon({ maxHp: 200, heldItem: ITEMS.airBalloon });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes, when a Telekinesis Pokemon switches in, then takes no damage (not grounded)", () => {
    // Source: Showdown sim/pokemon.ts -- Telekinesis grants levitation
    const volatiles = makeVolatiles([[VOLATILES.telekinesis, 3]]);
    const pokemon = createOnFieldPokemon({ maxHp: 200, volatiles });
    const result = applyGen6SpikesHazard(pokemon, 1, false);
    expect(result).toBeNull();
  });

  it("given Spikes + Gravity, when a Flying-type switches in, then takes damage (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    // At 200 max HP with 1 layer: floor(200 * 3 / 24) = floor(600 / 24) = 25 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.flying] });
    const result = applyGen6SpikesHazard(pokemon, 1, true);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given 1 layer of Spikes on a Pokemon with 1 HP max, then minimum damage is 1", () => {
    // Source: Showdown -- Math.max(1, ...) ensures minimum 1 damage
    // This covers Shedinja or very low HP Pokemon
    const pokemon = createOnFieldPokemon({ maxHp: 1, types: [TYPES.bug] });
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
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(25);
  });

  it("given Stealth Rock, when a Fire/Flying Pokemon switches in, then takes floor(maxHp * 4 / 8) = 50% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire, 2x vs Flying = 4x total
    // damage = floor(maxHp * 4 / 8) = floor(maxHp / 2)
    // At 200 max HP: floor(200 * 4 / 8) = 100 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.fire, TYPES.flying] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(100);
  });

  it("given Stealth Rock, when a Fire-type switches in, then takes floor(maxHp * 2 / 8) = 25% maxHp", () => {
    // Source: Showdown -- Rock is 2x effective vs Fire
    // At 200 max HP: floor(200 * 2 / 8) = 50 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.fire] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock, when a Fighting-type switches in, then takes floor(maxHp * 0.5 / 8) damage", () => {
    // Source: Showdown -- Rock is 0.5x effective vs Fighting
    // At 200 max HP: floor(200 * 0.5 / 8) = floor(100 / 8) = 12 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.fighting] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });

  it("given Stealth Rock, when a Fighting/Ground-type switches in, then takes floor(maxHp * 0.25 / 8)", () => {
    // Source: Showdown -- Rock is 0.5x vs Fighting, 0.5x vs Ground = 0.25x total
    // At 200 max HP: floor(200 * 0.25 / 8) = floor(50 / 8) = 6 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.fighting, TYPES.ground] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(6);
  });

  it("given Stealth Rock, when a Flying-type switches in, then still takes damage (no grounding check)", () => {
    // Source: Showdown data/moves.ts -- stealthrock has NO isGrounded() check
    // Rock vs Flying = 2x
    // At 200 max HP: floor(200 * 2 / 8) = 50 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.flying] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(50);
  });

  it("given Stealth Rock, when a Steel-type switches in, then takes floor(maxHp * 0.5 / 8)", () => {
    // Source: Showdown -- Rock is 0.5x vs Steel (Gen 6 type chart)
    // At 200 max HP: floor(200 * 0.5 / 8) = floor(12.5) = 12 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.steel] });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(12);
  });

  it("given Stealth Rock, when a Fairy-type switches in, then takes neutral damage (Rock vs Fairy = 1x)", () => {
    // Source: Showdown data/typechart.ts -- Rock vs Fairy = 1x (neutral)
    // At 200 max HP: floor(200 * 1 / 8) = 25 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.fairy] });
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
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe(STATUSES.poison);
    expect(result.message).toBe("TestMon was poisoned by the toxic spikes!");
  });

  it("given 2 layers of Toxic Spikes, when a grounded non-Poison/Steel Pokemon switches in, then becomes badly poisoned", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: 2 layers = badly poisoned (toxic)
    const pokemon = createOnFieldPokemon({ types: [TYPES.water] });
    const result = applyGen6ToxicSpikes(pokemon, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe(STATUSES.badlyPoisoned);
    expect(result.message).toBe("TestMon was badly poisoned by the toxic spikes!");
  });

  it("given Toxic Spikes, when a Poison-type switches in, then absorbs the hazard (removes it)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs = removes from field
    const pokemon = createOnFieldPokemon({ types: [TYPES.poison] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
    expect(result.message).toBe("TestMon absorbed the poison spikes!");
  });

  it("given Toxic Spikes, when a Poison/Flying-type switches in, then does NOT absorb (not grounded)", () => {
    // Source: Showdown -- toxicspikes: grounded check happens BEFORE Poison-type check
    // Flying-type is not grounded, so the Poison-type absorption never triggers
    const pokemon = createOnFieldPokemon({ types: [TYPES.poison, TYPES.flying] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Steel-type switches in, then is immune (no status, no absorption)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Steel-type immune to poison status
    const pokemon = createOnFieldPokemon({ types: [TYPES.steel] });
    const result = applyGen6ToxicSpikes(pokemon, 2, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Flying-type switches in, then is immune (not grounded)", () => {
    // Source: Showdown -- Flying-type is not grounded, so Toxic Spikes has no effect
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Pokemon with an existing status switches in, then no additional status", () => {
    // Source: Showdown -- trySetStatus fails if Pokemon already has a status
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal], status: STATUSES.burn });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes + Gravity, when a Poison/Flying-type switches in, then absorbs (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity grounds everything; then Poison-type absorbs Toxic Spikes
    const pokemon = createOnFieldPokemon({ types: [TYPES.poison, TYPES.flying] });
    const result = applyGen6ToxicSpikes(pokemon, 2, true);
    expect(result.absorbed).toBe(true);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Levitate Pokemon switches in, then is immune (not grounded)", () => {
    // Source: Showdown -- Levitate means not grounded
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.levitate });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBeNull();
  });

  it("given Toxic Spikes, when a Fairy-type switches in, then becomes poisoned (Fairy is not immune to Toxic Spikes)", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: only Poison/Steel types are immune;
    //   Fairy type has no special interaction with Toxic Spikes
    const pokemon = createOnFieldPokemon({ types: [TYPES.fairy] });
    const result = applyGen6ToxicSpikes(pokemon, 1, false);
    expect(result.absorbed).toBe(false);
    expect(result.status).toBe(STATUSES.poison);
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
    const pokemon = createOnFieldPokemon({ types: [TYPES.normal] });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toBe("TestMon was caught in a sticky web!");
  });

  it("given Sticky Web set, when a Water-type Pokemon switches in, then Speed stage drops by 1", () => {
    // Source: Bulbapedia -- Sticky Web affects all grounded Pokemon regardless of type
    // Triangulation case: different type, same behavior
    const pokemon = createOnFieldPokemon({ types: [TYPES.water], nickname: "Vaporeon" });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.messages[0]).toContain("Vaporeon");
  });

  it("given Sticky Web set, when a Flying-type Pokemon switches in, then no effect (not grounded)", () => {
    // Source: Showdown data/moves.ts -- stickyweb: "if (!pokemon.isGrounded()) return;"
    // Source: Bulbapedia -- Sticky Web only affects grounded Pokemon
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.followupStatChanges).toEqual([]);
    expect(result.messages).toHaveLength(0);
  });

  it("given Sticky Web set, when a Levitate ability Pokemon switches in, then no effect", () => {
    // Source: Showdown sim/pokemon.ts -- Levitate makes Pokemon not grounded
    // Source: Bulbapedia -- Levitate: immunity to Ground moves and ground-based hazards
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.levitate });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.followupStatChanges).toEqual([]);
  });

  it("given Sticky Web set, when a Telekinesis Pokemon switches in, then no effect (not grounded)", () => {
    // Source: Showdown sim/pokemon.ts -- Telekinesis grants levitation
    const volatiles = makeVolatiles([[VOLATILES.telekinesis, 3]]);
    const pokemon = createOnFieldPokemon({ volatiles });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.followupStatChanges).toEqual([]);
  });

  it("given Sticky Web set, when a Clear Body Pokemon switches in, then Speed NOT dropped", () => {
    // Source: Showdown data/abilities.ts -- Clear Body: "This Pokemon's stat stages cannot
    //   be lowered by other Pokemon"
    // Source: Bulbapedia -- Clear Body prevents stat reductions from opponents
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.clearBody });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.followupStatChanges).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain("Clear Body");
  });

  it("given Sticky Web set, when a White Smoke Pokemon switches in, then Speed NOT dropped", () => {
    // Source: Showdown data/abilities.ts -- whitesmoke: same effect as Clear Body
    // Source: Bulbapedia -- White Smoke prevents stat reductions from opponents
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.whiteSmoke });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.followupStatChanges).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain("White Smoke");
  });

  it("given Sticky Web set, when a Defiant Pokemon switches in, then -1 Speed AND triggers +2 Attack", () => {
    // Source: Bulbapedia -- Defiant: "raises the Pokemon's Attack stat by two stages for
    //   each of its stats that is lowered by an opposing Pokemon"
    // Source: Showdown data/abilities.ts -- Defiant onAfterEachBoost
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.defiant });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.followupStatChanges).toEqual([{ stat: "attack", stages: 2 }]);
    expect(result.messages.some((m) => m.includes("Defiant"))).toBe(true);
    expect(result.messages.some((m) => m.includes("Attack"))).toBe(true);
  });

  it("given Sticky Web set, when a Competitive Pokemon switches in, then -1 Speed AND triggers +2 SpAtk", () => {
    // Source: Bulbapedia -- Competitive: "raises the Pokemon's Special Attack stat by two
    //   stages for each of its stats that is lowered by an opposing Pokemon"
    // Source: Showdown data/abilities.ts -- Competitive onAfterEachBoost
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.competitive });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.followupStatChanges).toEqual([{ stat: "spAttack", stages: 2 }]);
    expect(result.messages.some((m) => m.includes("Competitive"))).toBe(true);
    expect(result.messages.some((m) => m.includes("Sp. Atk"))).toBe(true);
  });

  it("given Sticky Web + Gravity, when a Flying-type switches in, then Speed IS dropped (Gravity grounds)", () => {
    // Source: Bulbapedia -- Gravity: "All Pokemon are grounded."
    const pokemon = createOnFieldPokemon({ types: [TYPES.flying] });
    const result = applyGen6StickyWeb(pokemon, true);
    expect(result.applied).toBe(true);
    expect(result.statChange).toEqual({ stat: "speed", stages: -1 });
    expect(result.followupStatChanges).toEqual([]);
  });

  it("given Sticky Web set, when an Air Balloon holder switches in, then no effect (not grounded)", () => {
    // Source: Showdown data/items.ts -- Air Balloon grants Ground immunity
    const pokemon = createOnFieldPokemon({ heldItem: ITEMS.airBalloon });
    const result = applyGen6StickyWeb(pokemon, false);
    expect(result.applied).toBe(false);
    expect(result.statChange).toBeNull();
    expect(result.followupStatChanges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Combined Entry Hazard Tests (applyGen6EntryHazards)
// ---------------------------------------------------------------------------

describe("Gen6 applyGen6EntryHazards (combined)", () => {
  it("given Magic Guard, when switching into damage hazards, then takes no damage and no status", () => {
    // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
    // Source: Showdown -- Magic Guard prevents hazard damage and status
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.normal],
      ability: ABILITIES.magicGuard,
    });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 3 },
      { type: HAZARDS.toxicSpikes, layers: 2 },
    ]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
  });

  it("given Magic Guard + Sticky Web, when switching in, then Sticky Web still applies (-1 Speed)", () => {
    // Source: Bulbapedia -- Magic Guard: "prevents all indirect damage"
    //   Sticky Web is a stat drop, not damage, so Magic Guard does NOT block it
    // Source: Showdown data/moves.ts -- stickyweb handler has no Magic Guard check
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.normal],
      ability: ABILITIES.magicGuard,
    });
    const side = createBattleSide([{ type: HAZARDS.stickyWeb, layers: 1 }]);
    const state = createBattleState();
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
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 3 },
    ]);
    const state = createBattleState();
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
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 1 },
      { type: HAZARDS.toxicSpikes, layers: 1 },
      { type: HAZARDS.stickyWeb, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.statusInflicted).toBe(STATUSES.poison);
    expect(result.statChanges).toEqual([{ stat: "speed", stages: -1 }]);
    // 4 messages: SR + Spikes + Toxic Spikes + Sticky Web
    expect(result.messages).toHaveLength(4);
  });

  it("given Toxic Spikes, when a Poison-type switches in, then hazardsToRemove includes toxic-spikes", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: Poison-type absorbs = removes hazard
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.poison] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual([HAZARDS.toxicSpikes]);
  });

  it("given no hazards on the side, when any Pokemon switches in, then no damage and no status", () => {
    // Source: Showdown data/moves.ts -- hazard onSwitchIn handlers only fire when side
    //   has the corresponding sideCondition; an empty hazards array means no handlers run
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.fire, TYPES.flying] });
    const side = createBattleSide([]);
    const state = createBattleState();
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
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.flying] });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.spikes, layers: 3 },
    ]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(50);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Pointed stones");
  });

  it("given Sticky Web + Spikes, when a Flying-type switches in, then no Spikes damage and no Sticky Web", () => {
    // Source: Showdown -- Flying-type is not grounded: immune to both Spikes and Sticky Web
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.flying] });
    const side = createBattleSide([
      { type: HAZARDS.spikes, layers: 3 },
      { type: HAZARDS.stickyWeb, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statChanges).toEqual([]);
    expect(result.messages).toHaveLength(0);
  });

  it("given Stealth Rock, when a Charizard (Fire/Flying, 4x weak) switches in with 266 HP, then takes 133 HP", () => {
    // Source: Showdown -- Rock is 2x vs Fire, 2x vs Flying = 4x total
    // damage = floor(266 * 4 / 8) = floor(1064 / 8) = 133 HP
    // This is the classic Charizard-Stealth-Rock interaction
    const pokemon = createOnFieldPokemon({
      maxHp: 266,
      types: [TYPES.fire, TYPES.flying],
      nickname: "Charizard",
    });
    const result = applyGen6StealthRock(pokemon, GEN6_TYPE_CHART);
    expect(result).not.toBeNull();
    expect(result!.damage).toBe(133);
  });

  it("given only Sticky Web, when a Clear Body Pokemon switches in, then no stat changes applied", () => {
    // Source: Showdown data/abilities.ts -- Clear Body blocks stat drops from opponents
    const pokemon = createOnFieldPokemon({ ability: ABILITIES.clearBody });
    const side = createBattleSide([{ type: HAZARDS.stickyWeb, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(0);
    expect(result.statChanges).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0]).toContain("Clear Body");
  });

  it("given Sticky Web, when a Defiant Pokemon switches in via combined hazards, then statChanges includes speed -1", () => {
    // Source: Bulbapedia -- Defiant triggers on stat drops from opponents
    const pokemon = createOnFieldPokemon({
      maxHp: 200,
      types: [TYPES.normal],
      ability: ABILITIES.defiant,
    });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.stickyWeb, layers: 1 },
    ]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    // SR damage: floor(200 / 8) = 25
    expect(result.damage).toBe(25);
    expect(result.statChanges).toEqual([
      { stat: "speed", stages: -1 },
      { stat: "attack", stages: 2 },
    ]);
    // Messages: SR + sticky web + Defiant trigger
    expect(result.messages.some((m) => m.includes("Defiant"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Terrain + Toxic Spikes Interaction Tests (fix for #617)
// ---------------------------------------------------------------------------

describe("Gen6 applyGen6EntryHazards -- terrain blocks Toxic Spikes status", () => {
  it("given Misty Terrain active and Toxic Spikes on the field, when a grounded Normal-type switches in, then no poison status and no poison message", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain.onSetStatus: blocks all status
    //   for grounded Pokemon. Toxic Spikes' trySetStatus would fail under Misty Terrain.
    // Source: Bulbapedia "Misty Terrain" Gen 6 -- "Grounded Pokemon are protected from
    //   status conditions."
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState(false, {
      type: TERRAINS.misty,
      turnsLeft: 5,
      source: TERRAIN_SOURCES.mistyTerrain,
    });
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statusInflicted).toBeNull();
    // No "was poisoned" message should appear
    expect(result.messages.every((m) => !m.includes("poisoned"))).toBe(true);
  });

  it("given Misty Terrain active and 2 layers of Toxic Spikes, when a grounded Normal-type switches in, then no badly-poisoned status and no poison message", () => {
    // Source: Showdown data/conditions.ts -- mistyterrain blocks ALL primary status,
    //   including badly-poisoned from 2-layer Toxic Spikes
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState(false, {
      type: TERRAINS.misty,
      turnsLeft: 3,
      source: TERRAIN_SOURCES.mistyTerrain,
    });
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statusInflicted).toBeNull();
    expect(result.messages.every((m) => !m.includes("poisoned"))).toBe(true);
  });

  it("given no terrain active and Toxic Spikes on the field, when a grounded Normal-type switches in, then poison IS applied normally", () => {
    // Source: Showdown data/moves.ts -- toxicspikes: when no terrain blocks,
    //   grounded non-Poison/non-Steel gets poisoned
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState();
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statusInflicted).toBe(STATUSES.poison);
    expect(result.messages.some((m) => m.includes("poisoned"))).toBe(true);
  });

  it("given Electric Terrain active and Toxic Spikes, when a grounded Normal-type switches in, then poison IS applied (Electric Terrain only blocks sleep)", () => {
    // Source: Showdown data/conditions.ts -- electricterrain.onSetStatus:
    //   only blocks sleep ('slp'), not poison. Toxic Spikes should still apply.
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState(false, {
      type: TERRAINS.electric,
      turnsLeft: 5,
      source: TERRAIN_SOURCES.electricTerrain,
    });
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statusInflicted).toBe(STATUSES.poison);
    expect(result.messages.some((m) => m.includes("poisoned"))).toBe(true);
  });

  it("given Misty Terrain active and Toxic Spikes, when a Flying-type switches in, then no status (not grounded, immune to spikes anyway)", () => {
    // Source: Showdown -- Flying-type is not grounded, so immune to Toxic Spikes
    //   regardless of terrain. Both grounding and terrain check should pass.
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.flying] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 1 }]);
    const state = createBattleState(false, {
      type: TERRAINS.misty,
      turnsLeft: 5,
      source: TERRAIN_SOURCES.mistyTerrain,
    });
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statusInflicted).toBeNull();
    expect(result.messages.every((m) => !m.includes("poisoned"))).toBe(true);
  });

  it("given Misty Terrain + Toxic Spikes + Stealth Rock, when grounded Normal-type switches in, then takes SR damage but no poison", () => {
    // Source: Showdown -- hazards apply independently; terrain only blocks the status
    //   from Toxic Spikes, not damage from Stealth Rock.
    // SR damage: floor(200 * 1 / 8) = 25 HP
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.normal] });
    const side = createBattleSide([
      { type: HAZARDS.stealthRock, layers: 1 },
      { type: HAZARDS.toxicSpikes, layers: 1 },
    ]);
    const state = createBattleState(false, {
      type: TERRAINS.misty,
      turnsLeft: 5,
      source: TERRAIN_SOURCES.mistyTerrain,
    });
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.damage).toBe(25);
    expect(result.statusInflicted).toBeNull();
    // Should have SR message but no poison message
    expect(result.messages.some((m) => m.includes("Pointed stones"))).toBe(true);
    expect(result.messages.every((m) => !m.includes("poisoned"))).toBe(true);
  });

  it("given Misty Terrain + Toxic Spikes, when a Poison-type switches in, then absorbs Toxic Spikes normally", () => {
    // Source: Showdown data/moves.ts -- Poison-type absorbs Toxic Spikes regardless of terrain
    //   (absorption happens before status would be applied)
    const pokemon = createOnFieldPokemon({ maxHp: 200, types: [TYPES.poison] });
    const side = createBattleSide([{ type: HAZARDS.toxicSpikes, layers: 2 }]);
    const state = createBattleState(false, {
      type: TERRAINS.misty,
      turnsLeft: 5,
      source: TERRAIN_SOURCES.mistyTerrain,
    });
    const result = applyGen6EntryHazards(pokemon, side, state, GEN6_TYPE_CHART);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual([HAZARDS.toxicSpikes]);
    expect(result.messages.some((m) => m.includes("absorbed"))).toBe(true);
  });
});
