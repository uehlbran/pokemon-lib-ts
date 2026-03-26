import type { ActivePokemon, DamageContext } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createFriendship,
  createIvs,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen4DataManager,
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_NATURE_IDS,
  GEN4_SPECIES_IDS,
} from "../src";
import { calculateGen4Damage } from "../src/Gen4DamageCalc";
import { GEN4_TYPE_CHART } from "../src/Gen4TypeChart";

/**
 * Gen 4 Simple Abilities Tests
 *
 * Root-fix policy for this file:
 * - Canonical species, moves, abilities, items, and natures come from the owned Gen 4/core surfaces.
 * - Canonical move payloads come from the Gen 4 data manager instead of local fixture objects.
 * - No synthetic move probes are needed here; the canonical records already cover the scenarios.
 */

const DATA_MANAGER = createGen4DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const ITEMS = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const MOVES = { ...GEN4_MOVE_IDS } as const;
const SPECIES = GEN4_SPECIES_IDS;
const DEFAULT_SPECIES = DATA_MANAGER.getSpecies(SPECIES.bulbasaur);
const DEFAULT_NATURE = GEN4_NATURE_IDS.hardy;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const MACH_PUNCH = DATA_MANAGER.getMove(MOVES.machPunch);
const BRAVE_BIRD = DATA_MANAGER.getMove(MOVES.braveBird);
const FLARE_BLITZ = DATA_MANAGER.getMove(MOVES.flareBlitz);
const ZERO_IVS = createIvs({
  hp: 0,
  attack: 0,
  defense: 0,
  spAttack: 0,
  spDefense: 0,
  speed: 0,
});
const ZERO_EVS = createEvs();
type CoreGender = (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];

function createMockRng(intReturnValue: number) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intReturnValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createActivePokemon(opts: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  gender?: CoreGender;
  speciesId?: number;
}): ActivePokemon {
  const level = opts.level ?? 50;
  const maxHp = opts.hp ?? 200;
  const stats = {
    hp: maxHp,
    attack: opts.attack ?? 100,
    defense: opts.defense ?? 100,
    spAttack: opts.spAttack ?? 100,
    spDefense: opts.spDefense ?? 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? DEFAULT_SPECIES.id,
    nickname: null,
    level,
    experience: 0,
    nature: DEFAULT_NATURE,
    ivs: ZERO_IVS,
    evs: ZERO_EVS,
    currentHp: opts.currentHp ?? maxHp,
    moves: [],
    ability: opts.ability ?? ABILITIES.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: createFriendship(0),
    gender: opts.gender ?? CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: ITEMS.pokeBall,
    calculatedStats: stats,
  } as PokemonInstance;

  return {
    pokemon,
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
    types: opts.types ?? [CORE_TYPE_IDS.normal],
    ability: opts.ability ?? ABILITIES.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
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
    stellarBoostedTypes: [],
  } as ActivePokemon;
}

function createMockState(weather?: { type: string; turnsLeft: number; source: string } | null) {
  return {
    weather: weather ?? null,
  } as DamageContext["state"];
}

describe("Gen 4 Iron Fist", () => {
  it("given Iron Fist attacker using Mach Punch, when damage is calculated, then damage is greater than without Iron Fist", () => {
    // Source: Bulbapedia — Iron Fist boosts punching moves by 20%.
    // Source: Showdown Gen 4 mod — Iron Fist applies to punching move damage.
    const attacker = createActivePokemon({ ability: ABILITIES.ironFist, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: ABILITIES.none, attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = MACH_PUNCH;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBeGreaterThan(withoutAbility.damage);
  });

  it("given Iron Fist attacker using Tackle, when damage is calculated, then no power boost is applied", () => {
    // Source: Bulbapedia — Iron Fist only boosts punching moves.
    const attacker = createActivePokemon({ ability: ABILITIES.ironFist, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: ABILITIES.none, attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = TACKLE;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBe(withoutAbility.damage);
  });
});

describe("Gen 4 Reckless", () => {
  it("given Reckless attacker using Brave Bird, when damage is calculated, then damage is greater than without Reckless", () => {
    // Source: Bulbapedia — Reckless boosts recoil moves.
    // Source: Showdown Gen 4 mod — Reckless applies to recoil move damage.
    const attacker = createActivePokemon({ ability: ABILITIES.reckless, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: ABILITIES.none, attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = BRAVE_BIRD;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBeGreaterThan(withoutAbility.damage);
  });

  it("given Reckless attacker using Tackle, when damage is calculated, then no power boost is applied", () => {
    // Source: Bulbapedia — Reckless only boosts recoil moves.
    const attacker = createActivePokemon({ ability: ABILITIES.reckless, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: ABILITIES.none, attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = TACKLE;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBe(withoutAbility.damage);
  });

  it("given Reckless attacker using Flare Blitz, when damage is calculated, then damage is greater than without Reckless", () => {
    // Source: Showdown Gen 4 mod — Reckless should also apply when the canonical move carries recoil in a multi-effect record.
    const attacker = createActivePokemon({ ability: ABILITIES.reckless, attack: 100 });
    const noAbilityAttacker = createActivePokemon({ ability: ABILITIES.none, attack: 100 });
    const defender = createActivePokemon({ defense: 100 });
    const move = FLARE_BLITZ;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBeGreaterThan(withoutAbility.damage);
  });
});

describe("Gen 4 Rivalry", () => {
  it("given same-gender Rivalry attacker and defender, when damage is calculated, then damage is boosted", () => {
    // Source: Bulbapedia — Rivalry boosts power 25% against the same gender.
    const attacker = createActivePokemon({
      ability: ABILITIES.rivalry,
      gender: CORE_GENDERS.male,
      attack: 100,
    });
    const noAbilityAttacker = createActivePokemon({
      ability: ABILITIES.none,
      gender: CORE_GENDERS.male,
      attack: 100,
    });
    const defender = createActivePokemon({ gender: CORE_GENDERS.male, defense: 100 });
    const move = TACKLE;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBeGreaterThan(withoutAbility.damage);
  });

  it("given opposite-gender Rivalry attacker and defender, when damage is calculated, then damage is reduced", () => {
    // Source: Bulbapedia — Rivalry reduces power 25% against the opposite gender.
    const attacker = createActivePokemon({
      ability: ABILITIES.rivalry,
      gender: CORE_GENDERS.male,
      attack: 100,
    });
    const noAbilityAttacker = createActivePokemon({
      ability: ABILITIES.none,
      gender: CORE_GENDERS.male,
      attack: 100,
    });
    const defender = createActivePokemon({ gender: CORE_GENDERS.female, defense: 100 });
    const move = TACKLE;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBeLessThan(withoutAbility.damage);
  });

  it("given genderless defender, when Rivalry attacker uses Tackle, then damage is unchanged", () => {
    // Source: Bulbapedia — Rivalry has no effect if either Pokemon is genderless.
    const attacker = createActivePokemon({
      ability: ABILITIES.rivalry,
      gender: CORE_GENDERS.male,
      attack: 100,
    });
    const noAbilityAttacker = createActivePokemon({
      ability: ABILITIES.none,
      gender: CORE_GENDERS.male,
      attack: 100,
    });
    const defender = createActivePokemon({ gender: CORE_GENDERS.genderless, defense: 100 });
    const move = TACKLE;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBe(withoutAbility.damage);
  });

  it("given genderless Rivalry attacker, when Tackle is used, then damage is unchanged", () => {
    // Source: Bulbapedia — Rivalry has no effect if either Pokemon is genderless.
    const attacker = createActivePokemon({
      ability: ABILITIES.rivalry,
      gender: CORE_GENDERS.genderless,
      attack: 100,
    });
    const noAbilityAttacker = createActivePokemon({
      ability: ABILITIES.none,
      gender: CORE_GENDERS.genderless,
      attack: 100,
    });
    const defender = createActivePokemon({ gender: CORE_GENDERS.male, defense: 100 });
    const move = TACKLE;
    const rng = createMockRng(100);
    const state = createMockState();

    const withAbility = calculateGen4Damage(
      { attacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );
    const withoutAbility = calculateGen4Damage(
      { attacker: noAbilityAttacker, defender, move, isCrit: false, state, rng } as DamageContext,
      GEN4_TYPE_CHART,
    );

    expect(withAbility.damage).toBe(withoutAbility.damage);
  });
});
