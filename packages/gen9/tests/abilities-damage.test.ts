/**
 * Gen 9 (Scarlet/Violet) damage-modifying abilities tests.
 *
 * Covers:
 *   1. Supreme Overlord (new Gen 9): power boost based on fainted allies
 *   2. Orichalcum Pulse (new Gen 9): 5461/FIXED_POINT_IDENTITY Atk in Sun
 *   3. Hadron Engine (new Gen 9): 5461/FIXED_POINT_IDENTITY SpA on Electric Terrain
 *   4. Protean / Libero (Gen 9 nerf): once per switchin
 *   5. Intrepid Sword / Dauntless Shield (Gen 9 nerf): once per battle
 *   6. Fluffy: halves contact, doubles fire
 *   7. Ice Scales: halves special damage
 *   8. Inherited damage abilities: Filter/Solid Rock, Multiscale/Shadow Shield,
 *      Tinted Lens, Sheer Force, -ate abilities, Tough Claws, Strong Jaw,
 *      Mega Launcher, Iron Fist, Reckless, Parental Bond, Fur Coat
 *   9. Integration with calculateGen9Damage for Supreme Overlord,
 *      Orichalcum Pulse, Hadron Engine, Fluffy, Ice Scales
 *
 * Source: Showdown data/abilities.ts -- Gen 9 ability handlers
 * Source: Bulbapedia -- individual ability articles
 */
import type { ActivePokemon, BattleSide, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type {
  AbilitySlot,
  Gender,
  MoveData,
  PokemonInstance,
  PokemonType,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_STATUS_IDS,
  CORE_TERRAIN_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen9DataManager,
  GEN9_ABILITY_IDS,
  GEN9_MOVE_IDS,
  GEN9_NATURE_IDS,
  GEN9_SPECIES_IDS,
} from "../src";
import {
  getAteAbilityOverride,
  getFluffyModifier,
  getFurCoatMultiplier,
  getHadronEngineSpAModifier,
  getIceScalesModifier,
  getMegaLauncherMultiplier,
  getMultiscaleMultiplier,
  getOrichalcumPulseAtkModifier,
  getSheerForceMultiplier,
  getStrongJawMultiplier,
  getSturdyDamageCap,
  getSupremeOverlordModifier,
  getToughClawsMultiplier,
  handleGen9DamageCalcAbility,
  handleGen9DamageImmunityAbility,
  handleGen9DauntlessShield,
  handleGen9IntrepidSword,
  handleGen9ProteanTypeChange,
  hasSheerForceEligibleEffect,
  isParentalBondEligible,
  isSheerForceEligibleMove,
  SUPREME_OVERLORD_TABLE,
  sheerForceSuppressesLifeOrb,
  sturdyBlocksOHKO,
} from "../src/Gen9AbilitiesDamage";
import { calculateGen9Damage, pokeRound } from "../src/Gen9DamageCalc";
import { GEN9_TYPE_CHART } from "../src/Gen9TypeChart";

// Source: Showdown damage engine fixed-point arithmetic uses 2^12 as the identity modifier.
const FIXED_POINT_IDENTITY = CORE_FIXED_POINT.identity;
// Source: Showdown data/abilities.ts -- Gen 7+ -ate abilities use chainModify([4915, 2^12]).
const GEN7_PLUS_ATE_MODIFIER = CORE_FIXED_POINT.typeBoost / FIXED_POINT_IDENTITY;
// Source: the local createOnFieldPokemon helper defaults max HP to 2 * 100 unless overridden.
const DEFAULT_HP_FIXTURE = 2 * 100;
const ABILITY_IDS = { ...CORE_ABILITY_IDS, ...GEN9_ABILITY_IDS } as const;
const ITEM_IDS = CORE_ITEM_IDS;
const MOVE_IDS = GEN9_MOVE_IDS;
const NATURE_IDS = GEN9_NATURE_IDS;
const SPECIES_IDS = GEN9_SPECIES_IDS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const ABILITY_TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const TYPE_IDS = CORE_TYPE_IDS;
const STATUS_IDS = CORE_STATUS_IDS;
const WEATHER_IDS = CORE_WEATHER_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const TERRAIN_IDS = CORE_TERRAIN_IDS;
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const DATA_MANAGER = createGen9DataManager();
const DEFAULT_SPECIES_ID = SPECIES_IDS.bulbasaur;
const DEFAULT_NATURE_ID = NATURE_IDS.hardy;
const PROTEAN_USED_VOLATILE = VOLATILE_IDS.proteanUsed;

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function getDefaultGender(genderRatio: number): Gender {
  if (genderRatio === -1) return GENDERS.genderless;
  if (genderRatio === 0) return GENDERS.female;
  if (genderRatio === 100) return GENDERS.male;
  return GENDERS.male;
}

function createPokemonInstanceFixture(
  overrides: {
    level?: number;
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    speed?: number;
    hp?: number;
    currentHp?: number;
    ivs?: Parameters<typeof createIvs>[0];
    evs?: Parameters<typeof createEvs>[0];
    types?: PokemonType[];
    ability?: string;
    heldItem?: string | null;
    status?: string | null;
    speciesId?: number;
    gender?: Gender;
    friendship?: number;
    abilitySlot?: AbilitySlot;
  } = {},
): PokemonInstance {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const hp = overrides.hp ?? DEFAULT_HP_FIXTURE;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(8), {
    nature: DEFAULT_NATURE_ID,
    ivs: createIvs(overrides.ivs ?? {}),
    evs: createEvs(overrides.evs ?? {}),
    abilitySlot: overrides.abilitySlot ?? ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? getDefaultGender(species.genderRatio),
    isShiny: false,
    heldItem: overrides.heldItem ?? null,
    friendship: createFriendship(overrides.friendship ?? species.baseFriendship),
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: ITEM_IDS.pokeBall,
  });

  pokemon.ability = overrides.ability ?? pokemon.ability;
  pokemon.status = overrides.status ?? null;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };

  return pokemon;
}

function createOnFieldPokemon(
  overrides: {
    level?: number;
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    speed?: number;
    hp?: number;
    currentHp?: number;
    ivs?: Parameters<typeof createIvs>[0];
    evs?: Parameters<typeof createEvs>[0];
    types?: PokemonType[];
    ability?: string;
    heldItem?: string | null;
    status?: string | null;
    speciesId?: number;
    gender?: Gender;
    friendship?: number;
    abilitySlot?: AbilitySlot;
    volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
    isTerastallized?: boolean;
    teraType?: PokemonType | null;
    movedThisTurn?: boolean;
    teamSlot?: number;
  } = {},
): ActivePokemon {
  const pokemon = createPokemonInstanceFixture(overrides);
  if (overrides.isTerastallized !== undefined) {
    pokemon.terastallized = overrides.isTerastallized;
  }
  if (overrides.teraType !== undefined) {
    pokemon.teraType = overrides.teraType;
  }
  const species = DATA_MANAGER.getSpecies(pokemon.speciesId);
  const active = createBattleOnFieldPokemon(
    pokemon,
    overrides.teamSlot ?? 0,
    overrides.types ?? [...species.types],
  );
  active.volatileStatuses = overrides.volatiles ?? new Map();
  active.movedThisTurn = overrides.movedThisTurn ?? false;

  return active;
}

function createMoveFixture(
  moveId: (typeof MOVE_IDS)[keyof typeof MOVE_IDS],
  overrides?: Partial<MoveData>,
): MoveData {
  const baseMove = DATA_MANAGER.getMove(moveId);
  return {
    ...baseMove,
    ...overrides,
    flags: overrides?.flags ? { ...baseMove.flags, ...overrides.flags } : baseMove.flags,
    effect: overrides && "effect" in overrides ? overrides.effect : baseMove.effect,
  } as MoveData;
}

/**
 * Branch-driving synthetic move fixture. Start from a real Gen 9 move record and override only
 * the intentional scenario fields needed by the test.
 */
function createSyntheticMoveFixture(
  baseMoveId: (typeof MOVE_IDS)[keyof typeof MOVE_IDS],
  type: PokemonType,
  category: MoveData["category"],
  power: number | null,
  overrides?: Partial<MoveData>,
): MoveData {
  return createMoveFixture(baseMoveId, { ...overrides, type, category, power });
}

function createAbilityTestMoveFixture(overrides: {
  moveType?: PokemonType;
  moveCategory?: MoveData["category"];
  movePower?: number | null;
  moveFlags?: Partial<MoveData["flags"]>;
  moveEffect?: MoveData["effect"];
  moveId?: (typeof MOVE_IDS)[keyof typeof MOVE_IDS];
}): MoveData {
  const moveId = overrides.moveId ?? MOVE_IDS.tackle;
  const baseMove = DATA_MANAGER.getMove(moveId);
  if (
    overrides.moveType === undefined &&
    overrides.moveCategory === undefined &&
    overrides.movePower === undefined &&
    overrides.moveFlags === undefined &&
    overrides.moveEffect === undefined
  ) {
    return createMoveFixture(moveId);
  }
  return createSyntheticMoveFixture(
    moveId,
    overrides.moveType ?? baseMove.type,
    overrides.moveCategory ?? baseMove.category,
    overrides.movePower ?? baseMove.power,
    {
      flags: overrides.moveFlags,
      effect: overrides.moveEffect,
    },
  );
}

function createBattleSideFixture(
  index: 0 | 1,
  active: (ActivePokemon | null)[] = [],
  overrides?: Partial<BattleSide>,
): BattleSide {
  return {
    index,
    trainer: null,
    team: active.filter((slot): slot is ActivePokemon => slot !== null).map((slot) => slot.pokemon),
    active,
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    ...overrides,
  };
}

function createBattleStateFixture(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
  gravity?: { active: boolean; turnsLeft: number };
  magicRoom?: { active: boolean; turnsLeft: number };
  wonderRoom?: { active: boolean; turnsLeft: number };
  sides?: BattleState["sides"];
}): BattleState {
  return {
    phase: "turn-resolve",
    generation: 9,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: overrides?.sides ?? [createBattleSideFixture(0), createBattleSideFixture(1)],
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: overrides?.magicRoom ?? { active: false, turnsLeft: 0 },
    wonderRoom: overrides?.wonderRoom ?? { active: false, turnsLeft: 0 },
    gravity: overrides?.gravity ?? { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(42),
    isWildBattle: false,
    fleeAttempts: 0,
    ended: false,
    winner: null,
  };
}

function createDamageContextFixture(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move: overrides.move ?? createMoveFixture(MOVE_IDS.tackle),
    state: overrides.state ?? createBattleStateFixture(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN9_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Supreme Overlord
// ===========================================================================

describe("Supreme Overlord", () => {
  describe("getSupremeOverlordModifier", () => {
    it("given 0 fainted allies and Supreme Overlord, when getting modifier, then returns FIXED_POINT_IDENTITY (no boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[0] = FIXED_POINT_IDENTITY
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 0);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given 1 fainted ally and Supreme Overlord, when getting modifier, then returns 4506 (~10% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[1] = 4506
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 1);
      expect(mod).toBe(SUPREME_OVERLORD_TABLE[1]);
    });

    it("given 2 fainted allies and Supreme Overlord, when getting modifier, then returns 4915 (~20% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[2] = 4915
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 2);
      expect(mod).toBe(SUPREME_OVERLORD_TABLE[2]);
    });

    it("given 3 fainted allies and Supreme Overlord, when getting modifier, then returns 5325 (~30% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[3] = 5325
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 3);
      expect(mod).toBe(SUPREME_OVERLORD_TABLE[3]);
    });

    it("given 4 fainted allies and Supreme Overlord, when getting modifier, then returns 5734 (~40% boost)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[4] = 5734
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 4);
      expect(mod).toBe(SUPREME_OVERLORD_TABLE[4]);
    });

    it("given 5 fainted allies and Supreme Overlord, when getting modifier, then returns 6144 (50% cap)", () => {
      // Source: Showdown data/abilities.ts:4649 -- powMod[5] = 6144
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 5);
      expect(mod).toBe(SUPREME_OVERLORD_TABLE[5]);
    });

    it("given 6 fainted allies (over cap), when getting modifier, then returns 6144 (capped at 5)", () => {
      // Source: Showdown data/abilities.ts:4638 -- Math.min(pokemon.side.totalFainted, 5)
      const mod = getSupremeOverlordModifier(ABILITY_IDS.supremeOverlord, 6);
      expect(mod).toBe(6144);
    });

    it("given non-Supreme Overlord ability, when getting modifier, then returns FIXED_POINT_IDENTITY (no effect)", () => {
      const mod = getSupremeOverlordModifier(ABILITY_IDS.blaze, 5);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("SUPREME_OVERLORD_TABLE", () => {
    it("has exactly 6 entries matching Showdown powMod array", () => {
      // Source: Showdown data/abilities.ts:4649 -- const powMod = [FIXED_POINT_IDENTITY, 4506, 4915, 5325, 5734, 6144]
      expect(SUPREME_OVERLORD_TABLE).toEqual([FIXED_POINT_IDENTITY, 4506, 4915, 5325, 5734, 6144]);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given 3 fainted allies, when calculating damage with Supreme Overlord, then power is boosted by ~30%", () => {
      const attacker = createOnFieldPokemon({
        ability: ABILITY_IDS.supremeOverlord,
        types: [TYPE_IDS.dark, TYPE_IDS.steel],
      });
      const defender = createOnFieldPokemon({});
      const move = createSyntheticMoveFixture(
        MOVE_IDS.knockOff,
        TYPE_IDS.dark,
        MOVE_CATEGORIES.physical,
        100,
        {
          flags: { contact: false },
        },
      );

      const sides = [
        { active: [attacker], faintCount: 3, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const state = createBattleStateFixture({ sides });
      const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      // Compare with no ability
      const attackerNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.dark, TYPE_IDS.steel],
      });
      const sidesNoAbility = [
        { active: [attackerNoAbility], faintCount: 3, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const stateNoAbility = createBattleStateFixture({ sides: sidesNoAbility });
      const ctxNoAbility = createDamageContextFixture({
        attacker: attackerNoAbility,
        defender,
        move,
        state: stateNoAbility,
        seed: 100,
      });
      const _resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Supreme Overlord with 3 fainted = 5325/FIXED_POINT_IDENTITY ~= 1.2998x boost on base power
      // The boosted damage should be noticeably higher
      // Source: Showdown data/abilities.ts:4649 -- powMod[3] = 5325
      const boostedPower = pokeRound(100, SUPREME_OVERLORD_TABLE[3]);
      const moveEquivalent = createSyntheticMoveFixture(
        MOVE_IDS.knockOff,
        TYPE_IDS.dark,
        MOVE_CATEGORIES.physical,
        boostedPower,
        {
          flags: { contact: false },
        },
      );
      const ctxEquivalent = createDamageContextFixture({
        attacker: attackerNoAbility,
        defender,
        move: moveEquivalent,
        state: stateNoAbility,
        seed: 100,
      });
      const resultEquivalent = calculateGen9Damage(ctxEquivalent, typeChart);

      expect(resultBoosted.damage).toBe(resultEquivalent.damage);
    });

    it("given 0 fainted allies, when calculating damage with Supreme Overlord, then no boost applied", () => {
      const attacker = createOnFieldPokemon({
        ability: ABILITY_IDS.supremeOverlord,
        types: [TYPE_IDS.dark, TYPE_IDS.steel],
      });
      const defender = createOnFieldPokemon({});
      const move = createSyntheticMoveFixture(
        MOVE_IDS.knockOff,
        TYPE_IDS.dark,
        MOVE_CATEGORIES.physical,
        100,
        {
          flags: { contact: false },
        },
      );

      const sides = [
        { active: [attacker], faintCount: 0, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const state = createBattleStateFixture({ sides });
      const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      const attackerNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.dark, TYPE_IDS.steel],
      });
      const sidesNoAbility = [
        { active: [attackerNoAbility], faintCount: 0, screens: [] },
        { active: [defender], faintCount: 0, screens: [] },
      ];
      const stateNoAbility = createBattleStateFixture({ sides: sidesNoAbility });
      const ctxNoAbility = createDamageContextFixture({
        attacker: attackerNoAbility,
        defender,
        move,
        state: stateNoAbility,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Source: Showdown -- powMod[0] = FIXED_POINT_IDENTITY, so FIXED_POINT_IDENTITY/FIXED_POINT_IDENTITY = no boost
      expect(resultBoosted.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Orichalcum Pulse
// ===========================================================================

describe("Orichalcum Pulse", () => {
  describe("getOrichalcumPulseAtkModifier", () => {
    it("given Sun weather + Orichalcum Pulse, when getting modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:3028 -- chainModify([5461, FIXED_POINT_IDENTITY])
      const mod = getOrichalcumPulseAtkModifier(ABILITY_IDS.orichalcumPulse, WEATHER_IDS.sun);
      expect(mod).toBe(5461);
    });

    it("given harsh-sun (Desolate Land) weather + Orichalcum Pulse, when getting modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:3026 -- ['sunnyday', 'desolateland'].includes(...)
      const mod = getOrichalcumPulseAtkModifier(ABILITY_IDS.orichalcumPulse, WEATHER_IDS.harshSun);
      expect(mod).toBe(5461);
    });

    it("given no weather + Orichalcum Pulse, when getting modifier, then returns FIXED_POINT_IDENTITY (no boost)", () => {
      // FIXED_POINT_IDENTITY = identity modifier in the FIXED_POINT_IDENTITY-based system (no multiplication effect)
      // Source: Showdown data/abilities.ts -- orichalcumpulse: no modification when not in Sun/Harsh Sun
      const mod = getOrichalcumPulseAtkModifier(ABILITY_IDS.orichalcumPulse, null);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given rain weather + Orichalcum Pulse, when getting modifier, then returns FIXED_POINT_IDENTITY (no boost)", () => {
      // FIXED_POINT_IDENTITY = identity modifier in the FIXED_POINT_IDENTITY-based system (no multiplication effect)
      // Source: Showdown data/abilities.ts -- orichalcumpulse: only activates in ['sunnyday', 'desolateland']
      const mod = getOrichalcumPulseAtkModifier(ABILITY_IDS.orichalcumPulse, WEATHER_IDS.rain);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Orichalcum Pulse ability in sun, when getting modifier, then returns FIXED_POINT_IDENTITY (no effect)", () => {
      // FIXED_POINT_IDENTITY = identity modifier in the FIXED_POINT_IDENTITY-based system (no multiplication effect)
      // Source: Showdown data/abilities.ts -- orichalcumpulse: checks ability === 'orichalcumpulse'
      const mod = getOrichalcumPulseAtkModifier(ABILITY_IDS.blaze, WEATHER_IDS.sun);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Orichalcum Pulse in Sun, when calculating physical damage, then Atk is boosted by ~33.3%", () => {
      const attacker = createOnFieldPokemon({
        ability: ABILITY_IDS.orichalcumPulse,
        attack: 150,
        types: [TYPE_IDS.fire, TYPE_IDS.dragon],
      });
      const defender = createOnFieldPokemon({ defense: 100 });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.firePunch,
        TYPE_IDS.fire,
        MOVE_CATEGORIES.physical,
        80,
        {
          flags: { contact: false },
        },
      );
      const state = createBattleStateFixture({
        weather: { type: WEATHER_IDS.sun, turnsLeft: 5, source: ABILITY_IDS.orichalcumPulse },
      });
      const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      // Both get Sun boost on Fire, but Orichalcum Pulse additionally boosts Atk stat.
      // Source: Showdown -- Orichalcum Pulse: chainModify([5461, FIXED_POINT_IDENTITY]) on Atk.
      const boostedAttack = pokeRound(150, 5461);
      const attackerEquivalent = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        attack: boostedAttack,
        types: [TYPE_IDS.fire, TYPE_IDS.dragon],
      });
      const ctxEquivalent = createDamageContextFixture({
        attacker: attackerEquivalent,
        defender,
        move,
        state,
        seed: 100,
      });
      const resultEquivalent = calculateGen9Damage(ctxEquivalent, typeChart);
      expect(resultBoosted.damage).toBe(resultEquivalent.damage);
    });

    it("given Orichalcum Pulse with no Sun, when calculating physical damage, then no Atk boost", () => {
      const attacker = createOnFieldPokemon({
        ability: ABILITY_IDS.orichalcumPulse,
        attack: 150,
        types: [TYPE_IDS.fire, TYPE_IDS.dragon],
      });
      const defender = createOnFieldPokemon({ defense: 100 });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.firePunch,
        TYPE_IDS.fire,
        MOVE_CATEGORIES.physical,
        80,
        {
          flags: { contact: false },
        },
      );
      const state = createBattleStateFixture(); // no weather
      const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 100 });
      const resultOrichalcum = calculateGen9Damage(ctx, typeChart);

      const attackerNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        attack: 150,
        types: [TYPE_IDS.fire, TYPE_IDS.dragon],
      });
      const ctxNoAbility = createDamageContextFixture({
        attacker: attackerNoAbility,
        defender,
        move,
        state,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Same damage -- no weather = no Orichalcum Pulse boost
      expect(resultOrichalcum.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Hadron Engine
// ===========================================================================

describe("Hadron Engine", () => {
  describe("getHadronEngineSpAModifier", () => {
    it("given Electric Terrain + Hadron Engine, when getting modifier, then returns 5461", () => {
      // Source: Showdown data/abilities.ts:1735 -- chainModify([5461, FIXED_POINT_IDENTITY])
      const mod = getHadronEngineSpAModifier(ABILITY_IDS.hadronEngine, TERRAIN_IDS.electric);
      expect(mod).toBe(5461);
    });

    it("given no terrain + Hadron Engine, when getting modifier, then returns FIXED_POINT_IDENTITY (no boost)", () => {
      const mod = getHadronEngineSpAModifier(ABILITY_IDS.hadronEngine, null);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given Grassy Terrain + Hadron Engine, when getting modifier, then returns FIXED_POINT_IDENTITY (wrong terrain)", () => {
      const mod = getHadronEngineSpAModifier(ABILITY_IDS.hadronEngine, TERRAIN_IDS.grassy);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Hadron Engine ability on Electric Terrain, when getting modifier, then returns FIXED_POINT_IDENTITY", () => {
      const mod = getHadronEngineSpAModifier(ABILITY_IDS.blaze, TERRAIN_IDS.electric);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Hadron Engine on Electric Terrain, when calculating special damage, then SpA is boosted by ~33.3%", () => {
      const attacker = createOnFieldPokemon({
        ability: ABILITY_IDS.hadronEngine,
        spAttack: 150,
        types: [TYPE_IDS.electric, TYPE_IDS.dragon],
      });
      const defender = createOnFieldPokemon({ spDefense: 100 });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.thunderbolt,
        TYPE_IDS.electric,
        MOVE_CATEGORIES.special,
        80,
        {
          flags: { contact: false },
        },
      );
      const state = createBattleStateFixture({
        terrain: { type: TERRAIN_IDS.electric, turnsLeft: 5, source: ABILITY_IDS.hadronEngine },
      });
      const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 100 });
      const resultBoosted = calculateGen9Damage(ctx, typeChart);

      const boostedSpAttack = pokeRound(150, 5461);
      const attackerNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        spAttack: boostedSpAttack,
        types: [TYPE_IDS.electric, TYPE_IDS.dragon],
      });
      const ctxNoAbility = createDamageContextFixture({
        attacker: attackerNoAbility,
        defender,
        move,
        state,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNoAbility, typeChart);

      // Both get Electric Terrain boost on Electric move, but Hadron Engine adds SpA boost
      // Source: Showdown -- Hadron Engine: chainModify([5461, FIXED_POINT_IDENTITY]) on SpA
      expect(resultBoosted.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Protean / Libero (Gen 9 nerf: once per switchin)
// ===========================================================================

describe("Protean / Libero (Gen 9 nerf)", () => {
  it("given Protean Pokemon using Fire move for first time this switchin, when handling type change, then type changes to Fire", () => {
    // Source: Showdown data/abilities.ts -- protean: onPrepareHit
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.protean, types: [TYPE_IDS.water] });
    const events = handleGen9ProteanTypeChange(pokemon, TYPE_IDS.fire, 0);

    expect(events.length).toBe(1);
    expect(events[0].types).toEqual([TYPE_IDS.fire]);
    expect(pokemon.types).toEqual([TYPE_IDS.fire]);
    expect(pokemon.volatileStatuses.has(PROTEAN_USED_VOLATILE)).toBe(true);
  });

  it("given Protean Pokemon using second move this switchin, when handling type change, then type does NOT change", () => {
    // Source: Showdown data/abilities.ts -- protean: if (this.effectState.protean) return;
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.protean, types: [TYPE_IDS.fire] });
    // Simulate first use
    pokemon.volatileStatuses.set(PROTEAN_USED_VOLATILE, { turnsLeft: -1 });

    const events = handleGen9ProteanTypeChange(pokemon, TYPE_IDS.water, 0);

    expect(events.length).toBe(0);
    expect(pokemon.types).toEqual([TYPE_IDS.fire]); // unchanged
  });

  it("given Libero Pokemon using Grass move, when handling type change, then type changes to Grass", () => {
    // Source: Showdown data/abilities.ts -- libero: same logic as protean
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.libero, types: [TYPE_IDS.fire] });
    const events = handleGen9ProteanTypeChange(pokemon, TYPE_IDS.grass, 1);

    expect(events.length).toBe(1);
    expect(events[0].types).toEqual([TYPE_IDS.grass]);
    expect(pokemon.types).toEqual([TYPE_IDS.grass]);
  });

  it("given Protean Pokemon already that type, when handling type change, then no event (already correct type)", () => {
    // Source: Showdown data/abilities.ts -- protean: source.getTypes().join() !== type check
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.protean, types: [TYPE_IDS.fire] });
    const events = handleGen9ProteanTypeChange(pokemon, TYPE_IDS.fire, 0);

    expect(events.length).toBe(0);
    // protean-used is NOT set if no change happened
    expect(pokemon.volatileStatuses.has(PROTEAN_USED_VOLATILE)).toBe(false);
  });

  it("given non-Protean/Libero Pokemon, when handling type change, then no effect", () => {
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.blaze, types: [TYPE_IDS.fire] });
    const events = handleGen9ProteanTypeChange(pokemon, TYPE_IDS.water, 0);

    expect(events.length).toBe(0);
    expect(pokemon.types).toEqual([TYPE_IDS.fire]);
  });
});

// ===========================================================================
// Intrepid Sword (Gen 9 nerf: once per battle)
// ===========================================================================

describe("Intrepid Sword (Gen 9 nerf)", () => {
  it("given fresh switch-in with Intrepid Sword, when ability triggers, then returns true (should boost Atk +1)", () => {
    // Source: Showdown data/abilities.ts -- intrepidsword: onStart: if (pokemon.swordBoost) return; pokemon.swordBoost = true;
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.intrepidSword });
    const result = handleGen9IntrepidSword(pokemon);

    expect(result).toBe(true);
    // Flag stored on PokemonInstance (persists through switches), not volatileStatuses
    expect(pokemon.pokemon.swordBoost).toBe(true);
  });

  it("given Intrepid Sword already used this battle, when ability would trigger again, then returns false (blocked)", () => {
    // Source: Showdown data/abilities.ts -- intrepidsword: if (pokemon.swordBoost) return;
    // Persistent flag on PokemonInstance prevents re-activation even after switch-out/in
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.intrepidSword });
    pokemon.pokemon.swordBoost = true;
    const result = handleGen9IntrepidSword(pokemon);

    expect(result).toBe(false);
  });

  it("given non-Intrepid Sword ability, when ability check runs, then returns false", () => {
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.blaze });
    const result = handleGen9IntrepidSword(pokemon);

    expect(result).toBe(false);
  });

  it("given Intrepid Sword activated, when switched out and back in (volatiles cleared), then ability is still blocked (once per battle)", () => {
    // Source: Showdown data/abilities.ts -- swordBoost stored on pokemon (PokemonInstance), not as volatile
    // This verifies the flag persists through switch-out (BaseRuleset.onSwitchOut clears volatileStatuses).
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.intrepidSword });
    handleGen9IntrepidSword(pokemon);
    expect(pokemon.pokemon.swordBoost).toBe(true);

    // Simulate switch-out: clear volatile statuses (as BaseRuleset.onSwitchOut does)
    pokemon.volatileStatuses.clear();

    // swordBoost should still block re-activation — it lives on PokemonInstance
    const result = handleGen9IntrepidSword(pokemon);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Dauntless Shield (Gen 9 nerf: once per battle)
// ===========================================================================

describe("Dauntless Shield (Gen 9 nerf)", () => {
  it("given fresh switch-in with Dauntless Shield, when ability triggers, then returns true (should boost Def +1)", () => {
    // Source: Showdown data/abilities.ts -- dauntlessshield: onStart: if (pokemon.shieldBoost) return; pokemon.shieldBoost = true;
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.dauntlessShield });
    const result = handleGen9DauntlessShield(pokemon);

    expect(result).toBe(true);
    // Flag stored on PokemonInstance (persists through switches), not volatileStatuses
    expect(pokemon.pokemon.shieldBoost).toBe(true);
  });

  it("given Dauntless Shield already used this battle, when ability would trigger again, then returns false (blocked)", () => {
    // Source: Showdown data/abilities.ts -- dauntlessshield: if (pokemon.shieldBoost) return;
    // Persistent flag on PokemonInstance prevents re-activation even after switch-out/in
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.dauntlessShield });
    pokemon.pokemon.shieldBoost = true;
    const result = handleGen9DauntlessShield(pokemon);

    expect(result).toBe(false);
  });

  it("given non-Dauntless Shield ability, when ability check runs, then returns false", () => {
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.blaze });
    const result = handleGen9DauntlessShield(pokemon);

    expect(result).toBe(false);
  });

  it("given Dauntless Shield activated, when switched out and back in (volatiles cleared), then ability is still blocked (once per battle)", () => {
    // Source: Showdown data/abilities.ts -- shieldBoost stored on pokemon (PokemonInstance), not as volatile
    // This verifies the flag persists through switch-out (BaseRuleset.onSwitchOut clears volatileStatuses).
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.dauntlessShield });
    handleGen9DauntlessShield(pokemon);
    expect(pokemon.pokemon.shieldBoost).toBe(true);

    // Simulate switch-out: clear volatile statuses (as BaseRuleset.onSwitchOut does)
    pokemon.volatileStatuses.clear();

    // shieldBoost should still block re-activation — it lives on PokemonInstance
    const result = handleGen9DauntlessShield(pokemon);
    expect(result).toBe(false);
  });
});

// ===========================================================================
// Fluffy
// ===========================================================================

describe("Fluffy", () => {
  describe("getFluffyModifier", () => {
    it("given Fluffy defender hit by contact non-fire move, when getting modifier, then returns 2048 (0.5x)", () => {
      // Source: Showdown data/abilities.ts -- fluffy: if (move.flags['contact']) mod /= 2
      const mod = getFluffyModifier(ABILITY_IDS.fluffy, TYPE_IDS.normal, true);
      expect(mod).toBe(2048);
    });

    it("given Fluffy defender hit by fire non-contact move, when getting modifier, then returns 8192 (2.0x)", () => {
      // Source: Showdown data/abilities.ts -- fluffy: if (move.type === 'Fire') mod *= 2
      const mod = getFluffyModifier(ABILITY_IDS.fluffy, TYPE_IDS.fire, false);
      expect(mod).toBe(8192);
    });

    it("given Fluffy defender hit by fire contact move, when getting modifier, then returns FIXED_POINT_IDENTITY (1.0x, cancel out)", () => {
      // Source: Showdown data/abilities.ts -- fluffy: both mods apply and cancel
      // 1 * 2 (fire) / 2 (contact) = 1.0x
      const mod = getFluffyModifier(ABILITY_IDS.fluffy, TYPE_IDS.fire, true);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given Fluffy defender hit by non-fire non-contact move, when getting modifier, then returns FIXED_POINT_IDENTITY (no effect)", () => {
      const mod = getFluffyModifier(ABILITY_IDS.fluffy, TYPE_IDS.normal, false);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Fluffy defender, when getting modifier, then returns FIXED_POINT_IDENTITY regardless", () => {
      const mod = getFluffyModifier(ABILITY_IDS.blaze, TYPE_IDS.fire, true);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Fluffy defender hit by physical contact move, when calculating damage, then damage is halved", () => {
      const attacker = createOnFieldPokemon({});
      const defender = createOnFieldPokemon({
        ability: ABILITY_IDS.fluffy,
        types: [TYPE_IDS.normal],
      });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.closeCombat,
        TYPE_IDS.fighting,
        MOVE_CATEGORIES.physical,
        100,
        {
          flags: { contact: true },
        },
      );
      const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
      const resultFluffy = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.normal],
      });
      const ctxNormal = createDamageContextFixture({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Fluffy halves contact damage, so result should be ~50% of normal (plus SE on normal)
      // Source: Showdown data/abilities.ts -- fluffy: mod /= 2 for contact
      expect(resultFluffy.damage).toBe(pokeRound(resultNormal.damage, 2048));
    });
  });
});

// ===========================================================================
// Ice Scales
// ===========================================================================

describe("Ice Scales", () => {
  describe("getIceScalesModifier", () => {
    it("given Ice Scales defender hit by special move, when getting modifier, then returns 2048 (0.5x)", () => {
      // Source: Showdown data/abilities.ts -- icescales: if (move.category === 'Special') chainModify(0.5)
      const mod = getIceScalesModifier(ABILITY_IDS.iceScales, MOVE_CATEGORIES.special);
      expect(mod).toBe(2048);
    });

    it("given Ice Scales defender hit by physical move, when getting modifier, then returns FIXED_POINT_IDENTITY (no effect)", () => {
      const mod = getIceScalesModifier(ABILITY_IDS.iceScales, MOVE_CATEGORIES.physical);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });

    it("given non-Ice Scales ability hit by special move, when getting modifier, then returns FIXED_POINT_IDENTITY", () => {
      const mod = getIceScalesModifier(ABILITY_IDS.blaze, MOVE_CATEGORIES.special);
      expect(mod).toBe(FIXED_POINT_IDENTITY);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Ice Scales defender hit by special move, when calculating damage, then damage is halved", () => {
      const attacker = createOnFieldPokemon({});
      const defender = createOnFieldPokemon({
        ability: ABILITY_IDS.iceScales,
        types: [TYPE_IDS.ice],
      });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.flamethrower,
        TYPE_IDS.fire,
        MOVE_CATEGORIES.special,
        100,
        {
          flags: { contact: false },
        },
      );
      const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
      const resultIceScales = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.ice],
      });
      const ctxNormal = createDamageContextFixture({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Ice Scales halves special damage
      // Source: Showdown data/abilities.ts -- icescales onSourceModifyDamage: chainModify(0.5)
      expect(resultIceScales.damage).toBe(pokeRound(resultNormal.damage, 2048));
    });

    it("given Ice Scales defender hit by physical move, when calculating damage, then no reduction", () => {
      const attacker = createOnFieldPokemon({});
      const defender = createOnFieldPokemon({
        ability: ABILITY_IDS.iceScales,
        types: [TYPE_IDS.ice],
      });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.firePunch,
        TYPE_IDS.fire,
        MOVE_CATEGORIES.physical,
        100,
        {
          flags: { contact: false },
        },
      );
      const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
      const resultIceScales = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        types: [TYPE_IDS.ice],
      });
      const ctxNormal = createDamageContextFixture({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Physical: Ice Scales should not reduce damage
      expect(resultIceScales.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Multiscale / Shadow Shield
// ===========================================================================

describe("Multiscale / Shadow Shield", () => {
  describe("getMultiscaleMultiplier", () => {
    it("given Multiscale at full HP, when getting multiplier, then returns 0.5", () => {
      // Source: Showdown data/abilities.ts -- multiscale onSourceModifyDamage
      expect(
        getMultiscaleMultiplier(ABILITY_IDS.multiscale, DEFAULT_HP_FIXTURE, DEFAULT_HP_FIXTURE),
      ).toBe(0.5);
    });

    it("given Multiscale at less than full HP, when getting multiplier, then returns 1", () => {
      expect(getMultiscaleMultiplier(ABILITY_IDS.multiscale, 199, DEFAULT_HP_FIXTURE)).toBe(1);
    });

    it("given Shadow Shield at full HP, when getting multiplier, then returns 0.5", () => {
      // Source: Showdown data/abilities.ts -- shadowshield: same as multiscale
      expect(getMultiscaleMultiplier(ABILITY_IDS.shadowShield, 100, 100)).toBe(0.5);
    });

    it("given non-Multiscale ability at full HP, when getting multiplier, then returns 1", () => {
      expect(
        getMultiscaleMultiplier(ABILITY_IDS.blaze, DEFAULT_HP_FIXTURE, DEFAULT_HP_FIXTURE),
      ).toBe(1);
    });
  });

  describe("integration with calculateGen9Damage", () => {
    it("given Multiscale defender at full HP, when calculating damage, then damage is halved", () => {
      const attacker = createOnFieldPokemon({});
      const defender = createOnFieldPokemon({
        ability: ABILITY_IDS.multiscale,
        hp: DEFAULT_HP_FIXTURE,
        currentHp: DEFAULT_HP_FIXTURE,
      });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.tackle,
        TYPE_IDS.normal,
        MOVE_CATEGORIES.physical,
        100,
        {
          flags: { contact: false },
        },
      );
      const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
      const resultMultiscale = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        hp: DEFAULT_HP_FIXTURE,
        currentHp: DEFAULT_HP_FIXTURE,
      });
      const ctxNormal = createDamageContextFixture({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      // Source: Showdown -- Multiscale: pokeRound(damage, 2048) = 0.5x
      expect(resultMultiscale.damage).toBe(pokeRound(resultNormal.damage, 2048));
    });

    it("given Multiscale defender not at full HP, when calculating damage, then no reduction", () => {
      const attacker = createOnFieldPokemon({});
      const defender = createOnFieldPokemon({
        ability: ABILITY_IDS.multiscale,
        hp: DEFAULT_HP_FIXTURE,
        currentHp: 150,
      });
      const move = createSyntheticMoveFixture(
        MOVE_IDS.tackle,
        TYPE_IDS.normal,
        MOVE_CATEGORIES.physical,
        100,
        {
          flags: { contact: false },
        },
      );
      const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
      const resultMultiscale = calculateGen9Damage(ctx, typeChart);

      const defenderNoAbility = createOnFieldPokemon({
        ability: ABILITY_IDS.none,
        hp: DEFAULT_HP_FIXTURE,
        currentHp: 150,
      });
      const ctxNormal = createDamageContextFixture({
        attacker,
        defender: defenderNoAbility,
        move,
        seed: 100,
      });
      const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

      expect(resultMultiscale.damage).toBe(resultNormal.damage);
    });
  });
});

// ===========================================================================
// Tinted Lens
// ===========================================================================

describe("Tinted Lens", () => {
  it("given Tinted Lens attacker using NVE move, when calculating damage, then damage is doubled", () => {
    const attacker = createOnFieldPokemon({
      ability: ABILITY_IDS.tintedLens,
      types: [TYPE_IDS.fire],
    });
    const defender = createOnFieldPokemon({ types: [TYPE_IDS.water] }); // Fire vs Water = NVE (0.5x)
    const move = createSyntheticMoveFixture(
      MOVE_IDS.flamethrower,
      TYPE_IDS.fire,
      MOVE_CATEGORIES.special,
      100,
      {
        flags: { contact: false },
      },
    );
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
    const resultTinted = calculateGen9Damage(ctx, typeChart);

    const attackerNoAbility = createOnFieldPokemon({
      ability: ABILITY_IDS.none,
      types: [TYPE_IDS.fire],
    });
    const ctxNormal = createDamageContextFixture({
      attacker: attackerNoAbility,
      defender,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Source: Showdown data/abilities.ts -- tintedlens: damage *= 2 for NVE
    // Tinted Lens doubles NVE damage, making it effectively 1x
    expect(resultTinted.damage).toBe(resultNormal.damage * 2);
  });

  it("given Tinted Lens attacker using SE move, when calculating damage, then no boost (only NVE)", () => {
    const attacker = createOnFieldPokemon({
      ability: ABILITY_IDS.tintedLens,
      types: [TYPE_IDS.fire],
    });
    const defender = createOnFieldPokemon({ types: [TYPE_IDS.grass] }); // Fire vs Grass = SE (2x)
    const move = createSyntheticMoveFixture(
      MOVE_IDS.flamethrower,
      TYPE_IDS.fire,
      MOVE_CATEGORIES.special,
      100,
      {
        flags: { contact: false },
      },
    );
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
    const resultTinted = calculateGen9Damage(ctx, typeChart);

    const attackerNoAbility = createOnFieldPokemon({
      ability: ABILITY_IDS.none,
      types: [TYPE_IDS.fire],
    });
    const ctxNormal = createDamageContextFixture({
      attacker: attackerNoAbility,
      defender,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Tinted Lens should not affect SE moves
    expect(resultTinted.damage).toBe(resultNormal.damage);
  });
});

// ===========================================================================
// Filter / Solid Rock
// ===========================================================================

describe("Filter / Solid Rock", () => {
  it("given Filter defender hit by SE move, when calculating damage, then damage is reduced by 25%", () => {
    const attacker = createOnFieldPokemon({ types: [TYPE_IDS.fire] });
    const defender = createOnFieldPokemon({ ability: ABILITY_IDS.filter, types: [TYPE_IDS.grass] });
    const move = createSyntheticMoveFixture(
      MOVE_IDS.flamethrower,
      TYPE_IDS.fire,
      MOVE_CATEGORIES.special,
      100,
      {
        flags: { contact: false },
      },
    );
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
    const resultFilter = calculateGen9Damage(ctx, typeChart);

    const defenderNoAbility = createOnFieldPokemon({
      ability: ABILITY_IDS.none,
      types: [TYPE_IDS.grass],
    });
    const ctxNormal = createDamageContextFixture({
      attacker,
      defender: defenderNoAbility,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Source: Showdown data/abilities.ts -- filter: pokeRound(damage, 3072) = 0.75x
    expect(resultFilter.damage).toBe(pokeRound(resultNormal.damage, 3072));
  });

  it("given Solid Rock defender hit by neutral move, when calculating damage, then no reduction", () => {
    const attacker = createOnFieldPokemon({});
    const defender = createOnFieldPokemon({
      ability: ABILITY_IDS.solidRock,
      types: [TYPE_IDS.rock],
    });
    const move = createSyntheticMoveFixture(
      MOVE_IDS.tackle,
      TYPE_IDS.normal,
      MOVE_CATEGORIES.physical,
      100,
      {
        flags: { contact: false },
      },
    );
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 100 });
    const resultSolidRock = calculateGen9Damage(ctx, typeChart);

    const defenderNoAbility = createOnFieldPokemon({
      ability: ABILITY_IDS.none,
      types: [TYPE_IDS.rock],
    });
    const ctxNormal = createDamageContextFixture({
      attacker,
      defender: defenderNoAbility,
      move,
      seed: 100,
    });
    const resultNormal = calculateGen9Damage(ctxNormal, typeChart);

    // Filter/Solid Rock only reduce SE damage; neutral should be unchanged
    expect(resultSolidRock.damage).toBe(resultNormal.damage);
  });
});

// ===========================================================================
// -ate Abilities
// ===========================================================================

describe("-ate abilities (Gen 9: 1.2x)", () => {
  describe("getAteAbilityOverride", () => {
    it("given Pixilate with Normal-type move, when checking override, then returns fairy + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- pixilate: Normal -> Fairy + 4915/FIXED_POINT_IDENTITY
      const result = getAteAbilityOverride(ABILITY_IDS.pixilate, TYPE_IDS.normal);
      expect(result).toEqual({
        type: TYPE_IDS.fairy,
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Aerilate with Normal-type move, when checking override, then returns flying + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- aerilate: Normal -> Flying + 4915/FIXED_POINT_IDENTITY
      const result = getAteAbilityOverride(ABILITY_IDS.aerilate, TYPE_IDS.normal);
      expect(result).toEqual({
        type: TYPE_IDS.flying,
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Refrigerate with Normal-type move, when checking override, then returns ice + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- refrigerate: Normal -> Ice + 4915/FIXED_POINT_IDENTITY
      const result = getAteAbilityOverride(ABILITY_IDS.refrigerate, TYPE_IDS.normal);
      expect(result).toEqual({
        type: TYPE_IDS.ice,
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Galvanize with Normal-type move, when checking override, then returns electric + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- galvanize: Normal -> Electric + 4915/FIXED_POINT_IDENTITY
      const result = getAteAbilityOverride(ABILITY_IDS.galvanize, TYPE_IDS.normal);
      expect(result).toEqual({
        type: TYPE_IDS.electric,
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Pixilate with non-Normal move, when checking override, then returns null", () => {
      expect(getAteAbilityOverride(ABILITY_IDS.pixilate, TYPE_IDS.fire)).toBeNull();
      expect(getAteAbilityOverride(ABILITY_IDS.pixilate, TYPE_IDS.normal)).toEqual({
        type: TYPE_IDS.fairy,
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Normalize with Fire-type move, when checking override, then returns normal + 1.2x", () => {
      // Source: Showdown data/abilities.ts -- normalize: all moves become Normal + 1.2x (Gen 7+)
      const result = getAteAbilityOverride(ABILITY_IDS.normalize, TYPE_IDS.fire);
      expect(result).toEqual({
        type: TYPE_IDS.normal,
        multiplier: GEN7_PLUS_ATE_MODIFIER,
      });
    });

    it("given Liquid Voice with sound-based move, when checking override, then returns water with 1.0x", () => {
      // Source: Showdown data/abilities.ts -- liquidvoice: sound moves become Water (no power boost)
      const result = getAteAbilityOverride(ABILITY_IDS.liquidVoice, TYPE_IDS.normal, true);
      expect(result).toEqual({
        type: TYPE_IDS.water,
        multiplier: 1,
      });
    });

    it("given Liquid Voice with non-sound move, when checking override, then returns null", () => {
      expect(getAteAbilityOverride(ABILITY_IDS.liquidVoice, TYPE_IDS.normal, false)).toBeNull();
      expect(getAteAbilityOverride(ABILITY_IDS.liquidVoice, TYPE_IDS.normal, true)).toEqual({
        type: TYPE_IDS.water,
        multiplier: 1,
      });
    });
  });
});

// ===========================================================================
// Sheer Force
// ===========================================================================

describe("Sheer Force", () => {
  it("given Sheer Force with move that has status-chance, when getting multiplier, then returns 5325/FIXED_POINT_IDENTITY", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: chainModify([5325, FIXED_POINT_IDENTITY])
    const mult = getSheerForceMultiplier(ABILITY_IDS.sheerForce, {
      type: "status-chance",
      status: STATUS_IDS.burn,
      chance: 10,
    });
    expect(mult).toBe(5325 / FIXED_POINT_IDENTITY);
  });

  it("given Sheer Force with move that has no secondary, when getting multiplier, then returns 1", () => {
    const mult = getSheerForceMultiplier(ABILITY_IDS.sheerForce, null);
    expect(mult).toBe(1);
  });

  it("given non-Sheer Force ability, when getting multiplier, then returns 1", () => {
    const mult = getSheerForceMultiplier(ABILITY_IDS.blaze, {
      type: "status-chance",
      status: STATUS_IDS.burn,
      chance: 10,
    });
    expect(mult).toBe(1);
  });

  it("given Sheer Force with tri-attack (whitelist), when checking eligible, then returns true", () => {
    // Source: Showdown -- tri-attack has custom onHit secondaries
    expect(isSheerForceEligibleMove(null, CORE_MOVE_IDS.triAttack)).toBe(true);
  });

  it("given Sheer Force, when checking if Life Orb recoil suppressed, then returns true for eligible move", () => {
    // Source: Showdown scripts.ts -- sheer force suppresses Life Orb recoil
    expect(
      sheerForceSuppressesLifeOrb(ABILITY_IDS.sheerForce, {
        type: "status-chance",
        status: STATUS_IDS.burn,
        chance: 10,
      }),
    ).toBe(true);
  });
});

// ===========================================================================
// Tough Claws / Strong Jaw / Mega Launcher / Iron Fist
// ===========================================================================

describe("move-type boosting abilities", () => {
  describe("getToughClawsMultiplier", () => {
    it("given Tough Claws with contact move, when getting multiplier, then returns 5325/FIXED_POINT_IDENTITY (~1.3x)", () => {
      // Source: Showdown data/abilities.ts -- toughclaws: chainModify([5325, FIXED_POINT_IDENTITY])
      expect(getToughClawsMultiplier(ABILITY_IDS.toughClaws, true)).toBe(
        5325 / FIXED_POINT_IDENTITY,
      );
    });

    it("given Tough Claws with non-contact move, when getting multiplier, then returns 1", () => {
      expect(getToughClawsMultiplier(ABILITY_IDS.toughClaws, false)).toBe(1);
    });
  });

  describe("getStrongJawMultiplier", () => {
    it("given Strong Jaw with bite move, when getting multiplier, then returns 1.5", () => {
      // Source: Showdown data/abilities.ts -- strongjaw: chainModify(1.5)
      expect(getStrongJawMultiplier(ABILITY_IDS.strongJaw, true)).toBe(1.5);
    });

    it("given Strong Jaw with non-bite move, when getting multiplier, then returns 1", () => {
      expect(getStrongJawMultiplier(ABILITY_IDS.strongJaw, false)).toBe(1);
    });
  });

  describe("getMegaLauncherMultiplier", () => {
    it("given Mega Launcher with pulse move, when getting multiplier, then returns 1.5", () => {
      // Source: Showdown data/abilities.ts -- megalauncher: chainModify(1.5)
      expect(getMegaLauncherMultiplier(ABILITY_IDS.megaLauncher, true)).toBe(1.5);
    });

    it("given Mega Launcher with non-pulse move, when getting multiplier, then returns 1", () => {
      expect(getMegaLauncherMultiplier(ABILITY_IDS.megaLauncher, false)).toBe(1);
    });
  });
});

// ===========================================================================
// Sturdy
// ===========================================================================

describe("Sturdy", () => {
  describe("getSturdyDamageCap", () => {
    it("given Sturdy at full HP with lethal damage, when capping, then returns maxHp - 1", () => {
      // Source: Showdown data/abilities.ts -- sturdy onDamage: maxhp - 1
      expect(
        getSturdyDamageCap(
          ABILITY_IDS.sturdy,
          DEFAULT_HP_FIXTURE,
          DEFAULT_HP_FIXTURE,
          DEFAULT_HP_FIXTURE,
        ),
      ).toBe(DEFAULT_HP_FIXTURE - 1);
    });

    it("given Sturdy at full HP with non-lethal damage, when capping, then returns original damage", () => {
      expect(
        getSturdyDamageCap(ABILITY_IDS.sturdy, 100, DEFAULT_HP_FIXTURE, DEFAULT_HP_FIXTURE),
      ).toBe(100);
    });

    it("given Sturdy NOT at full HP with lethal damage, when capping, then returns original damage (no cap)", () => {
      // Source: Sturdy only caps at full HP; once currentHp differs from maxHp the damage passes through unchanged.
      expect(
        getSturdyDamageCap(ABILITY_IDS.sturdy, DEFAULT_HP_FIXTURE, 150, DEFAULT_HP_FIXTURE),
      ).toBe(DEFAULT_HP_FIXTURE);
    });

    it("given non-Sturdy ability, when capping, then returns original damage", () => {
      expect(
        getSturdyDamageCap(
          ABILITY_IDS.blaze,
          DEFAULT_HP_FIXTURE,
          DEFAULT_HP_FIXTURE,
          DEFAULT_HP_FIXTURE,
        ),
      ).toBe(DEFAULT_HP_FIXTURE);
    });
  });

  describe("sturdyBlocksOHKO", () => {
    it("given Sturdy and OHKO move, when checking, then returns true", () => {
      // Source: Showdown data/abilities.ts -- sturdy onTryHit: OHKO blocked
      expect(sturdyBlocksOHKO(ABILITY_IDS.sturdy, { type: "ohko" })).toBe(true);
    });

    it("given Sturdy and non-OHKO move, when checking, then returns false", () => {
      expect(sturdyBlocksOHKO(ABILITY_IDS.sturdy, { type: "drain", percentage: 50 })).toBe(false);
    });

    it("given non-Sturdy and OHKO move, when checking, then returns false", () => {
      expect(sturdyBlocksOHKO(ABILITY_IDS.blaze, { type: "ohko" })).toBe(false);
    });
  });
});

// ===========================================================================
// Fur Coat
// ===========================================================================

describe("Fur Coat", () => {
  it("given Fur Coat against physical move, when getting multiplier, then returns 2.0", () => {
    // Source: Showdown data/abilities.ts -- furcoat: chainModify(2) on Def for physical
    expect(getFurCoatMultiplier(ABILITY_IDS.furCoat, true)).toBe(2);
  });

  it("given Fur Coat against special move, when getting multiplier, then returns 1", () => {
    expect(getFurCoatMultiplier(ABILITY_IDS.furCoat, false)).toBe(1);
  });

  it("given non-Fur Coat ability, when getting multiplier, then returns 1", () => {
    expect(getFurCoatMultiplier(ABILITY_IDS.blaze, true)).toBe(1);
  });
});

// ===========================================================================
// Parental Bond
// ===========================================================================

describe("Parental Bond", () => {
  it("given Parental Bond with damaging move, when checking eligibility, then returns true", () => {
    // Source: Showdown data/abilities.ts -- parentalbond
    expect(isParentalBondEligible(ABILITY_IDS.parentalBond, 80, null)).toBe(true);
  });

  it("given Parental Bond with multi-hit move, when checking eligibility, then returns false", () => {
    expect(isParentalBondEligible(ABILITY_IDS.parentalBond, 80, "multi-hit")).toBe(false);
  });

  it("given Parental Bond with status move, when checking eligibility, then returns false", () => {
    expect(isParentalBondEligible(ABILITY_IDS.parentalBond, 0, null)).toBe(false);
  });

  it("given non-Parental Bond ability, when checking eligibility, then returns false", () => {
    expect(isParentalBondEligible(ABILITY_IDS.blaze, 80, null)).toBe(false);
  });
});

// ===========================================================================
// handleGen9DamageCalcAbility handler tests
// ===========================================================================

describe("handleGen9DamageCalcAbility handler", () => {
  function createAbilityContextFixture(overrides: {
    abilityId: string;
    moveType?: PokemonType;
    moveCategory?: MoveData["category"];
    movePower?: number | null;
    moveFlags?: Partial<MoveData["flags"]>;
    moveEffect?: MoveData["effect"];
    moveId?: string;
    currentHp?: number;
    hp?: number;
    status?: string | null;
    weather?: string | null;
    terrain?: string | null;
    opponentMovedThisTurn?: boolean;
    types?: PokemonType[];
    attackerFaintCount?: number;
  }): Parameters<typeof handleGen9DamageCalcAbility>[0] {
    const pokemon = createOnFieldPokemon({
      ability: overrides.abilityId,
      currentHp: overrides.currentHp,
      hp: overrides.hp,
      status: overrides.status,
      types: overrides.types,
    });
    const opponent = overrides.opponentMovedThisTurn
      ? createOnFieldPokemon({ movedThisTurn: true })
      : createOnFieldPokemon({});
    const move = createAbilityTestMoveFixture({
      moveId: overrides.moveId as (typeof MOVE_IDS)[keyof typeof MOVE_IDS] | undefined,
      moveType: overrides.moveType,
      moveCategory: overrides.moveCategory,
      movePower: overrides.movePower,
      moveFlags: overrides.moveFlags,
      moveEffect: overrides.moveEffect,
    });
    const faintCount = overrides.attackerFaintCount ?? 0;
    const sides =
      faintCount > 0
        ? [
            createBattleSideFixture(0, [pokemon], { faintCount }),
            createBattleSideFixture(1, [opponent], { faintCount: 0 }),
          ]
        : undefined;
    const state = createBattleStateFixture({
      weather: overrides.weather
        ? { type: overrides.weather, turnsLeft: 5, source: TERRAIN_IDS.testSource }
        : null,
      terrain: overrides.terrain
        ? { type: overrides.terrain, turnsLeft: 5, source: TERRAIN_IDS.testSource }
        : null,
      sides,
    });

    return {
      pokemon,
      opponent,
      state,
      rng: new SeededRandom(42),
      trigger: ABILITY_TRIGGERS.onDamageCalc,
      move,
    };
  }

  it("given Supreme Overlord with 0 fainted allies, when handler called, then does not activate", () => {
    // Source: Showdown data/abilities.ts:4634-4658 -- supremeoverlord onBasePower
    // powMod[0] = FIXED_POINT_IDENTITY (no boost), so handler should return NO_ACTIVATION
    const ctx = createAbilityContextFixture({ abilityId: ABILITY_IDS.supremeOverlord });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Supreme Overlord with 2 fainted allies, when handler called, then activates with message", () => {
    // Source: Showdown data/abilities.ts:4649 -- powMod[2] = 4915 (~20% boost)
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.supremeOverlord,
      attackerFaintCount: 2,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("given Orichalcum Pulse in Sun, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.orichalcumPulse,
      weather: WEATHER_IDS.sun,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Orichalcum Pulse without Sun, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({ abilityId: ABILITY_IDS.orichalcumPulse });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Hadron Engine on Electric Terrain, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.hadronEngine,
      terrain: TERRAIN_IDS.electric,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Hadron Engine without Electric Terrain, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({ abilityId: ABILITY_IDS.hadronEngine });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Fluffy hit by contact non-fire move, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.fluffy,
      moveType: TYPE_IDS.normal,
      moveFlags: { contact: true },
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Fluffy hit by non-contact non-fire move, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.fluffy,
      moveType: TYPE_IDS.normal,
      moveFlags: { contact: false },
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Ice Scales hit by special move, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.iceScales,
      moveCategory: MOVE_CATEGORIES.special,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Ice Scales hit by physical move, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.iceScales,
      moveCategory: MOVE_CATEGORIES.physical,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Technician with 60 power move, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({ abilityId: ABILITY_IDS.technician, movePower: 60 });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Technician with 70 power move, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({ abilityId: ABILITY_IDS.technician, movePower: 70 });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Adaptability with STAB move, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.adaptability,
      moveType: TYPE_IDS.fire,
      types: [TYPE_IDS.fire],
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Adaptability with non-STAB move, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.adaptability,
      moveType: TYPE_IDS.water,
      types: [TYPE_IDS.fire],
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Multiscale at full HP, when handler called, then activates", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.multiscale,
      currentHp: DEFAULT_HP_FIXTURE,
      hp: DEFAULT_HP_FIXTURE,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Multiscale below full HP, when handler called, then does not activate", () => {
    const ctx = createAbilityContextFixture({
      abilityId: ABILITY_IDS.multiscale,
      currentHp: 150,
      hp: DEFAULT_HP_FIXTURE,
    });
    const result = handleGen9DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen9DamageImmunityAbility handler tests
// ===========================================================================

describe("handleGen9DamageImmunityAbility handler", () => {
  it("given Sturdy and OHKO move, when handler called, then move is prevented", () => {
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.sturdy });
    const ctx = {
      pokemon,
      state: createBattleStateFixture(),
      rng: new SeededRandom(42),
      trigger: ABILITY_TRIGGERS.onDamageTaken,
      move: createMoveFixture(MOVE_IDS.sheerCold),
    };
    const result = handleGen9DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Sturdy and non-OHKO move, when handler called, then not activated", () => {
    const pokemon = createOnFieldPokemon({ ability: ABILITY_IDS.sturdy });
    const ctx = {
      pokemon,
      state: createBattleStateFixture(),
      rng: new SeededRandom(42),
      trigger: ABILITY_TRIGGERS.onDamageTaken,
      move: createMoveFixture(MOVE_IDS.tackle),
    };
    const result = handleGen9DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// hasSheerForceEligibleEffect unit tests
// ===========================================================================

describe("hasSheerForceEligibleEffect", () => {
  it("given status-chance effect, then returns true", () => {
    // Source: Showdown -- status-chance is always sheer force eligible
    expect(
      hasSheerForceEligibleEffect({ type: "status-chance", status: STATUS_IDS.burn, chance: 10 }),
    ).toBe(true);
  });

  it("given foe stat-change with chance > 0, then returns true", () => {
    expect(
      hasSheerForceEligibleEffect({
        type: "stat-change",
        target: "foe",
        stat: "attack",
        stages: -1,
        chance: 30,
      } as any),
    ).toBe(true);
  });

  it("given self stat-change with fromSecondary=true, then returns true", () => {
    expect(
      hasSheerForceEligibleEffect({
        type: "stat-change",
        target: "self",
        stat: "attack",
        stages: 1,
        chance: 0,
        fromSecondary: true,
      } as any),
    ).toBe(true);
  });

  it("given volatile-status with chance > 0, then returns true", () => {
    expect(
      hasSheerForceEligibleEffect({
        type: "volatile-status",
        status: VOLATILE_IDS.flinch,
        chance: 30,
      }),
    ).toBe(true);
  });

  it("given null effect, then returns false", () => {
    expect(hasSheerForceEligibleEffect(null)).toBe(false);
  });

  it("given heal effect, then returns false", () => {
    expect(hasSheerForceEligibleEffect({ type: "heal", percentage: 50 })).toBe(false);
  });
});

// ===========================================================================
// pokeRound verification for ability modifiers
// ===========================================================================

describe("pokeRound verification for ability modifiers", () => {
  it("Supreme Overlord 3 fainted: pokeRound(100, 5325) = 130", () => {
    // Source: Showdown -- chainModify([5325, FIXED_POINT_IDENTITY])
    // floor((100 * 5325 + 2047) / FIXED_POINT_IDENTITY) = floor(534547/FIXED_POINT_IDENTITY) = 130
    expect(pokeRound(100, 5325)).toBe(130);
  });

  it("Supreme Overlord 5 fainted: pokeRound(100, 6144) = 150", () => {
    // Source: Showdown -- chainModify([6144, FIXED_POINT_IDENTITY])
    // floor((100 * 6144 + 2047) / FIXED_POINT_IDENTITY) = floor(616447/FIXED_POINT_IDENTITY) = 150
    expect(pokeRound(100, 6144)).toBe(150);
  });

  it("Ice Scales: pokeRound(fullHP, 2048) = half", () => {
    // Source: Showdown -- chainModify(0.5) = 2048/FIXED_POINT_IDENTITY
    // floor((fullHP * 2048 + 2047) / FIXED_POINT_IDENTITY) = half the input
    expect(pokeRound(DEFAULT_HP_FIXTURE, 2048)).toBe(DEFAULT_HP_FIXTURE / 2);
  });

  it("Fluffy fire: pokeRound(100, 8192) = double the input", () => {
    // Source: Showdown -- Fluffy fire: mod *= 2 => 8192/FIXED_POINT_IDENTITY
    // floor((100 * 8192 + 2047) / FIXED_POINT_IDENTITY) = double the input
    expect(pokeRound(100, 8192)).toBe(100 * 2);
  });

  it("Fluffy contact: pokeRound(100, 2048) = 50", () => {
    // Source: Showdown -- Fluffy contact: mod /= 2 => 2048/FIXED_POINT_IDENTITY
    // floor((100 * 2048 + 2047) / FIXED_POINT_IDENTITY) = floor(206847/FIXED_POINT_IDENTITY) = 50
    expect(pokeRound(100, 2048)).toBe(50);
  });

  it("Orichalcum Pulse stat: base 150 becomes +50 under the modifier", () => {
    // Source: Showdown -- chainModify([5461, FIXED_POINT_IDENTITY]) on Atk stat
    // floor((150 * 5461 + 2047) / FIXED_POINT_IDENTITY) = 150 + 50
    expect(pokeRound(150, 5461)).toBe(150 + 50);
  });
});
