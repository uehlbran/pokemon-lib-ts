import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import {
  createOnFieldPokemon as createBattleOnFieldPokemon,
  createDefaultStatStages,
} from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_EFFECT_TYPES,
  CORE_MOVE_TARGET_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import {
  getSheerForceMultiplier,
  isSheerForceEligibleMove,
  isSheerForceWhitelistedMove,
  sheerForceSuppressesLifeOrb,
} from "../src/Gen5AbilitiesDamage";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (duplicated from damage-calc.test.ts for isolation)
// ---------------------------------------------------------------------------

const dataManager = createGen5DataManager();
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS } as const;
const moveIds = GEN5_MOVE_IDS;
const natureIds = GEN5_NATURE_IDS;
const speciesIds = GEN5_SPECIES_IDS;
const statusIds = CORE_STATUS_IDS;
const typeIds = CORE_TYPE_IDS;
const defaultSpecies = dataManager.getSpecies(speciesIds.mew);
const DEFAULT_LEVEL = 50;
const DEFAULT_DAMAGE_SEED = 42;
const DEFAULT_TEST_STATS = {
  hp: 200,
  attack: 100,
  defense: 100,
  spAttack: 100,
  spDefense: 100,
  speed: 100,
} as const;

function createSyntheticOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  types?: PokemonType[];
  ability?: string;
}): ActivePokemon {
  const hp = overrides.hp ?? DEFAULT_TEST_STATS.hp;
  const species = defaultSpecies;
  const pokemon = createPokemonInstance(
    species,
    overrides.level ?? DEFAULT_LEVEL,
    new SeededRandom(DEFAULT_DAMAGE_SEED),
    {
      nature: natureIds.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      friendship: createFriendship(species.baseFriendship),
      gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
      heldItem: null,
      metLocation: "test",
      originalTrainer: "Test",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
    },
  );

  pokemon.uid = `test-${species.id}-${pokemon.level}`;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.calculatedStats = {
    hp,
    attack: overrides.attack ?? DEFAULT_TEST_STATS.attack,
    defense: overrides.defense ?? DEFAULT_TEST_STATS.defense,
    spAttack: overrides.spAttack ?? DEFAULT_TEST_STATS.spAttack,
    spDefense: overrides.spDefense ?? DEFAULT_TEST_STATS.spDefense,
    speed: overrides.speed ?? DEFAULT_TEST_STATS.speed,
  };

  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...species.types],
  );
  activePokemon.statStages = createDefaultStatStages();
  return activePokemon;
}

function createBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  format?: string;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: overrides?.format ?? "singles",
    generation: 5,
    turnNumber: 1,
    sides: [{}, {}],
  } as unknown as BattleState;
}

function createDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createSyntheticOnFieldPokemon({}),
    defender: overrides.defender ?? createSyntheticOnFieldPokemon({}),
    move: overrides.move ?? dataManager.getMove(moveIds.tackle),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? DEFAULT_DAMAGE_SEED),
    isCrit: overrides.isCrit ?? false,
  };
}

// ---------------------------------------------------------------------------
// Unit tests for isSheerForceWhitelistedMove
// ---------------------------------------------------------------------------

describe("isSheerForceWhitelistedMove", () => {
  it("given Tri Attack move ID, when checking whitelist, then returns true", () => {
    // Source: Showdown data/moves.ts -- triattack has secondary.onHit with chance: 20
    //   which qualifies for Sheer Force, but our importer stores effect=null
    expect(isSheerForceWhitelistedMove(moveIds.triAttack)).toBe(true);
  });

  it("given Earthquake move ID (no secondary), when checking whitelist, then returns false", () => {
    // Source: Showdown data/moves.ts -- earthquake has no secondary field
    expect(isSheerForceWhitelistedMove(moveIds.earthquake)).toBe(false);
  });

  it("given Flamethrower move ID (secondary representable in MoveEffect), when checking whitelist, then returns false", () => {
    // Source: Flamethrower's secondary (10% burn) is representable as status-chance;
    //   it does NOT need to be whitelisted
    expect(isSheerForceWhitelistedMove(moveIds.flamethrower)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit tests for isSheerForceEligibleMove (combined check)
// ---------------------------------------------------------------------------

describe("isSheerForceEligibleMove", () => {
  it("given Tri Attack (effect=null, whitelisted move ID), when checking eligibility, then returns true", () => {
    // Source: Showdown data/moves.ts -- triattack has secondary with chance: 20
    //   Our data stores effect=null because the onHit function is not serializable
    //   The whitelist compensates for this data limitation
    expect(isSheerForceEligibleMove(null, moveIds.triAttack)).toBe(true);
  });

  it("given Flamethrower (status-chance effect, not whitelisted), when checking eligibility, then returns true via effect", () => {
    // Source: Showdown data/moves.ts -- flamethrower secondary: { chance: 10, status: 'brn' }
    const effect = {
      type: CORE_MOVE_EFFECT_TYPES.statusChance,
      status: statusIds.burn,
      chance: 10,
    } as const;
    expect(isSheerForceEligibleMove(effect, moveIds.flamethrower)).toBe(true);
  });

  it("given Earthquake (effect=null, not whitelisted), when checking eligibility, then returns false", () => {
    // Source: Showdown data/moves.ts -- earthquake has no secondary
    expect(isSheerForceEligibleMove(null, moveIds.earthquake)).toBe(false);
  });

  it("given Close Combat (self stat drop, not from secondary), when checking eligibility, then returns false", () => {
    // Source: Showdown data/moves.ts -- closecombat uses self.boosts (primary self-effect)
    //   not secondary.self.boosts, so Sheer Force does NOT suppress it
    const effect = {
      type: "stat-change" as const,
      target: CORE_MOVE_TARGET_IDS.self,
      stats: { defense: -1, spDefense: -1 },
      chance: 100,
    };
    expect(isSheerForceEligibleMove(effect, moveIds.closeCombat)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSheerForceMultiplier with move ID
// ---------------------------------------------------------------------------

describe("getSheerForceMultiplier with move ID whitelist", () => {
  it("given Sheer Force ability and Tri Attack (effect=null), when getting multiplier, then returns 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
    // Tri Attack qualifies via whitelist because its secondary.onHit is not serializable
    const result = getSheerForceMultiplier(abilityIds.sheerForce, null, moveIds.triAttack);
    expect(result).toBeCloseTo(CORE_FIXED_POINT.gemBoost / CORE_FIXED_POINT.identity, 10);
  });

  it("given Sheer Force ability and Earthquake (effect=null, no whitelist), when getting multiplier, then returns 1", () => {
    // Source: Showdown data/abilities.ts -- earthquake has no secondaries, no Sheer Force boost
    const result = getSheerForceMultiplier(abilityIds.sheerForce, null, moveIds.earthquake);
    expect(result).toBe(1);
  });

  it("given non-Sheer-Force ability and Tri Attack, when getting multiplier, then returns 1", () => {
    // Source: Only Sheer Force ability triggers the boost
    const result = getSheerForceMultiplier(abilityIds.blaze, null, moveIds.triAttack);
    expect(result).toBe(1);
  });

  it("given Sheer Force ability and Flamethrower (status-chance effect), when getting multiplier without moveId, then still returns 5325/4096", () => {
    // Backward compatibility: the effect-based check still works without a moveId
    const effect = {
      type: CORE_MOVE_EFFECT_TYPES.statusChance,
      status: statusIds.burn,
      chance: 10,
    } as const;
    const result = getSheerForceMultiplier(abilityIds.sheerForce, effect);
    expect(result).toBeCloseTo(CORE_FIXED_POINT.gemBoost / CORE_FIXED_POINT.identity, 10);
  });
});

// ---------------------------------------------------------------------------
// sheerForceSuppressesLifeOrb with move ID
// ---------------------------------------------------------------------------

describe("sheerForceSuppressesLifeOrb with move ID whitelist", () => {
  it("given Sheer Force ability and Tri Attack (effect=null), when checking Life Orb suppression, then returns true", () => {
    // Source: Showdown scripts.ts -- if move.hasSheerForce, skip Life Orb recoil
    // Tri Attack sets hasSheerForce=true in Showdown because it has secondaries
    expect(sheerForceSuppressesLifeOrb(abilityIds.sheerForce, null, moveIds.triAttack)).toBe(true);
  });

  it("given Sheer Force ability and Earthquake (no secondary), when checking Life Orb suppression, then returns false", () => {
    // Source: Showdown -- Sheer Force only suppresses Life Orb when move has secondaries
    expect(sheerForceSuppressesLifeOrb(abilityIds.sheerForce, null, moveIds.earthquake)).toBe(
      false,
    );
  });

  it("given non-Sheer-Force ability and Tri Attack, when checking Life Orb suppression, then returns false", () => {
    // Source: Only Sheer Force suppresses Life Orb recoil
    expect(sheerForceSuppressesLifeOrb(abilityIds.blaze, null, moveIds.triAttack)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: Tri Attack damage with Sheer Force in full damage calc
// ---------------------------------------------------------------------------

describe("Sheer Force + Tri Attack in damage calc", () => {
  it("given Sheer Force user using Tri Attack (effect=null, whitelisted), when calculating damage, then power is boosted by 5325/4096", () => {
    // Source: Showdown data/abilities.ts -- sheerforce: onBasePower chainModify([5325, 4096])
    // Source: Showdown data/moves.ts -- triattack has secondary with chance: 20
    //   (custom onHit, stored as effect=null in our data)
    //
    // Derivation:
    //   base power 80
    //   Sheer Force: pokeRound(80, 5325) = floor((80*5325 + 2047) / 4096)
    //     = floor((426000 + 2047) / 4096) = floor(428047 / 4096) = floor(104.50...) = 104
    //   L50, spAtk 100 vs spDef 100, normal vs normal (neutral)
    //   levelFactor = floor(2*50/5) + 2 = 22
    //   baseDamage = floor(floor(22 * 104 * 100 / 100) / 50) = floor(2288 / 50) = floor(45.76) = 45
    //   +2 => 47
    //   random(seed=42) = 94 => floor(47 * 94 / 100) = floor(44.18) = 44
    //   STAB? attacker is psychic, move is normal => no STAB
    //   Type effectiveness: normal vs psychic = 1x (neutral)
    //   No burn => final damage = 44
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: DEFAULT_TEST_STATS.spAttack,
      ability: abilityIds.sheerForce,
      types: [typeIds.psychic],
    });
    const defender = createSyntheticOnFieldPokemon({
      spDefense: DEFAULT_TEST_STATS.spDefense,
      types: [typeIds.psychic],
    });
    const move = dataManager.getMove(moveIds.triAttack);
    const ctx = createDamageContext({ attacker, defender, move, seed: DEFAULT_DAMAGE_SEED });
    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);
    expect(result.damage).toBe(44);
  });

  it("given non-Sheer-Force user using Tri Attack (effect=null), when calculating damage, then power is NOT boosted", () => {
    // Source: Showdown -- only sheer-force ability triggers the boost
    //
    // Derivation (no boost):
    //   base power 80, no Sheer Force
    //   L50, spAtk 100 vs spDef 100, normal vs psychic (neutral)
    //   levelFactor = 22
    //   baseDamage = floor(floor(22 * 80 * 100 / 100) / 50) = floor(1760 / 50) = floor(35.2) = 35
    //   +2 => 37
    //   random(seed=42) = 94 => floor(37 * 94 / 100) = floor(34.78) = 34
    //   No STAB, neutral type => final damage = 34
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: DEFAULT_TEST_STATS.spAttack,
      ability: abilityIds.blaze,
      types: [typeIds.psychic],
    });
    const defender = createSyntheticOnFieldPokemon({
      spDefense: DEFAULT_TEST_STATS.spDefense,
      types: [typeIds.psychic],
    });
    const move = dataManager.getMove(moveIds.triAttack);
    const ctx = createDamageContext({ attacker, defender, move, seed: DEFAULT_DAMAGE_SEED });
    const result = calculateGen5Damage(ctx, GEN5_TYPE_CHART);
    expect(result.damage).toBe(34);
  });
});
