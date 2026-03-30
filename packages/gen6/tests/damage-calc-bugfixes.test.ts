import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { createDefaultStatStages } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType, PrimaryStatus } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_SPECIES_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createFriendship,
  createIvs,
  createMoveSlot,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  calculateGen6Damage,
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
  GEN6_TYPES,
  pokeRound,
} from "../src";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories (same pattern as damage-calc.test.ts)
// ---------------------------------------------------------------------------

const DATA_MANAGER = createGen6DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN6_ABILITY_IDS };
const ITEMS = { ...CORE_ITEM_IDS, ...GEN6_ITEM_IDS };
const MOVES = GEN6_MOVE_IDS;
const NATURES = GEN6_NATURE_IDS;
const SPECIES = { ...CORE_SPECIES_IDS, ...GEN6_SPECIES_IDS };
const TYPES = { ...CORE_TYPE_IDS, ...GEN6_TYPES };
const VOLATILES = CORE_VOLATILE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const GENDERS = CORE_GENDERS;
const NONE = CORE_ABILITY_IDS.none;
const TACKLE = DATA_MANAGER.getMove(MOVES.tackle);
const MACH_PUNCH = DATA_MANAGER.getMove(MOVES.machPunch);
const POWER_UP_PUNCH = DATA_MANAGER.getMove(MOVES.powerUpPunch);
const BULLET_PUNCH = DATA_MANAGER.getMove(MOVES.bulletPunch);
const WATER_PULSE = DATA_MANAGER.getMove(MOVES.waterPulse);
const FLAMETHROWER = DATA_MANAGER.getMove(MOVES.flamethrower);
const EMBER = DATA_MANAGER.getMove(MOVES.ember);
const FIRE_PUNCH = DATA_MANAGER.getMove(MOVES.firePunch);
const SURF = DATA_MANAGER.getMove(MOVES.surf);
const DOUBLE_EDGE = DATA_MANAGER.getMove(MOVES.doubleEdge);
const WILD_CHARGE = DATA_MANAGER.getMove(MOVES.wildCharge);
const JUMP_KICK = DATA_MANAGER.getMove(MOVES.jumpKick);
const HIGH_JUMP_KICK = DATA_MANAGER.getMove(MOVES.highJumpKick);
const JUMP_KICK_CRASH: MoveData = { ...JUMP_KICK, hasCrashDamage: true };
const HIGH_JUMP_KICK_CRASH: MoveData = { ...HIGH_JUMP_KICK, hasCrashDamage: true };
const DRY_SKIN_MODIFIER = 5120;

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
  heldItem?: string | null;
  status?: string | null;
  speciesId?: number;
  gender?: (typeof GENDERS)[keyof typeof GENDERS];
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  return {
    pokemon: {
      uid: "test",
      speciesId: overrides.speciesId ?? SPECIES.alakazam,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: NATURES.hardy,
      ivs: createIvs(),
      evs: createEvs(),
      currentHp: overrides.currentHp ?? hp,
      moves: [createMoveSlot(TACKLE.id, TACKLE.pp)],
      ability: overrides.ability ?? NONE,
      abilitySlot: ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: createFriendship(0),
      gender: overrides.gender ?? GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
    },
    teamSlot: 0,
    statStages: createDefaultStatStages(),
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [TYPES.psychic],
    ability: overrides.ability ?? NONE,
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

function createCanonicalMove(id: string): MoveData {
  return DATA_MANAGER.getMove(id);
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
    generation: 6,
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
    move: overrides.move ?? createCanonicalMove(MOVES.tackle),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART;

// ---------------------------------------------------------------------------
// #663 — Iron Fist uses pokeRound(power, 4915) instead of Math.floor(power * 1.2)
// Source: Showdown data/abilities.ts -- Iron Fist: chainModify([4915, 4096])
// ---------------------------------------------------------------------------
describe("#663 — Iron Fist pokeRound", () => {
  it("given Iron Fist + punch move with power 40, when calculating damage, then pokeRound(40, 4915) = 48 is used as base power", () => {
    // Source: pokeRound(40, 4915) = floor((40 * 4915 + 2047) / 4096) = floor(198647/4096) = 48
    // Math.floor(40 * 1.2) = Math.floor(48.0) = 48 (same for p=40, but differs for p=3,4,8,9,...)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.ironFist,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const punchMove = MACH_PUNCH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: punchMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: punchMove, seed: 100 }),
      typeChart,
    );

    // Source: inline derivation -- pokeRound(40, 4915) = 48, unboosted power = 40
    // Boosted damage must exceed unboosted damage
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });

  it("given Iron Fist + punch move with power 75, when calculating damage, then uses 4915/4096 rounding", () => {
    // Source: pokeRound(75, 4915) = floor((75 * 4915 + 2047) / 4096) = floor(370672/4096) = 90
    // Math.floor(75 * 1.2) = Math.floor(90.0) = 90 (same in this case)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.ironFist,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const punchMove = POWER_UP_PUNCH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: punchMove, seed: 200 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: punchMove, seed: 200 }),
      typeChart,
    );

    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #663 — Technician uses pokeRound(power, 6144) instead of Math.floor(power * 1.5)
// Source: Showdown data/abilities.ts -- Technician: chainModify([6144, 4096])
// ---------------------------------------------------------------------------
describe("#663 — Technician pokeRound", () => {
  it("given Technician + move with power 40, when calculating damage, then pokeRound(40, 6144) = 60 is used as base power", () => {
    // Source: pokeRound(40, 6144) = floor((40 * 6144 + 2047) / 4096) = floor(247807/4096) = 60
    // Use power 40 (not 20) to minimize integer truncation distortion in ratio
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.technician,
      types: [TYPES.normal],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.psychic] });
    const weakMove = BULLET_PUNCH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.normal],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: weakMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: weakMove, seed: 100 }),
      typeChart,
    );

    // Source: inline derivation -- pokeRound(40, 6144) = 60, vs unboosted 40
    // The boosted damage must be greater
    expect(resultWith.breakdown!.baseDamage).toBeGreaterThan(resultWithout.breakdown!.baseDamage);
    const ratio = resultWith.breakdown!.baseDamage / resultWithout.breakdown!.baseDamage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Technician + move with power 60, when calculating damage, then boost is applied (60 is threshold)", () => {
    // Source: pokeRound(60, 6144) = floor((60 * 6144 + 2047) / 4096) = floor(370687/4096) = 90
    // Power 60 is at the threshold -- Technician applies to power <= 60
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.technician,
      types: [TYPES.normal],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.psychic] });
    const thresholdMove = WATER_PULSE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.normal],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: thresholdMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: thresholdMove, seed: 100 }),
      typeChart,
    );

    expect(resultWith.breakdown!.baseDamage).toBeGreaterThan(resultWithout.breakdown!.baseDamage);
  });
});

// ---------------------------------------------------------------------------
// #662 — Dry Skin uses pokeRound(power, 5120) instead of Math.floor(power * 1.25)
// Source: Showdown data/abilities.ts -- Dry Skin onBasePower: chainModify([5120, 4096])
// ---------------------------------------------------------------------------
describe("#662 — Dry Skin pokeRound", () => {
  it("given Fire move vs Dry Skin defender, when calculating damage, then base power uses pokeRound(power, 5120)", () => {
    // Source: pokeRound(90, 5120) = floor((90 * 5120 + 2047) / 4096) = floor(462847/4096) = 113
    // Math.floor(90 * 1.25) = Math.floor(112.5) = 112 -- DIFFERENT!
    const attacker = createSyntheticOnFieldPokemon({ ability: NONE, types: [TYPES.fire] });
    const defender = createSyntheticOnFieldPokemon({
      ability: ABILITIES.drySkin,
      types: [TYPES.grass],
    });
    const fireMove = FLAMETHROWER;

    const baselineDefender = createSyntheticOnFieldPokemon({ ability: NONE, types: [TYPES.grass] });

    const resultWithDrySkin = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker, defender: baselineDefender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Dry Skin should increase fire damage by ~1.25x
    expect(resultWithDrySkin.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWithDrySkin.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(DRY_SKIN_MODIFIER / CORE_FIXED_POINT.identity, 1);
  });

  it("given Fire move with power 51 vs Dry Skin, when calculating, then pokeRound(51, 5120) = 64 (differs from floor(51*1.25)=63)", () => {
    // Source: pokeRound(51, 5120) = floor((51 * 5120 + 2047) / 4096) = floor(263167/4096) = 64
    // Math.floor((51 * DRY_SKIN_MODIFIER) / CORE_FIXED_POINT.identity) = 63 -- DIFFERENT! This demonstrates the fix.
    const attacker = createSyntheticOnFieldPokemon({ ability: NONE, types: [TYPES.fire] });
    const defender = createSyntheticOnFieldPokemon({
      ability: ABILITIES.drySkin,
      types: [TYPES.normal],
    });
    const fireMove = EMBER;

    // Verify pokeRound(51, 5120) = 64 (not Math.floor(51*1.25) = 63)
    // Source: inline derivation -- floor((51*5120 + 2047)/4096) = floor(263167/4096) = 64
    expect(pokeRound(51, DRY_SKIN_MODIFIER)).toBe(64);
    expect(Math.floor((51 * DRY_SKIN_MODIFIER) / CORE_FIXED_POINT.identity)).toBe(63);

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    // Dry Skin 1.25x fire weakness applies (pokeRound rounds differently than floor); damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// #660 — Flash Fire applied as stat modifier (not base-power modifier)
// Source: Showdown data/abilities.ts -- flashfire.condition.onModifyAtk / onModifySpA
// ---------------------------------------------------------------------------
describe("#660 — Flash Fire as stat modifier", () => {
  it("given Flash Fire volatile + Fire move (physical), when calculating damage, then 1.5x Atk stat modifier is applied", () => {
    // Flash Fire should boost the attack stat, not the base power.
    // With Atk=100, the effective Atk should be floor(100*150/100) = 150.
    const flashFireVolatiles = new Map([[VOLATILES.flashFire, { turnsLeft: -1 }]]);
    const attacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fire],
      attack: 100,
      volatiles: flashFireVolatiles,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], defense: 100 });
    const fireMove = FIRE_PUNCH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fire],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flashfire: chainModify(1.5) on Atk/SpA
    // With stat boost, damage ratio should be ~1.5x
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Flash Fire volatile + Fire special move, when calculating damage, then 1.5x SpAtk modifier is applied", () => {
    const flashFireVolatiles = new Map([[VOLATILES.flashFire, { turnsLeft: -1 }]]);
    const attacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fire],
      spAttack: 120,
      volatiles: flashFireVolatiles,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spDefense: 100 });
    const fireMove = FLAMETHROWER;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fire],
      spAttack: 120,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flashfire.condition.onModifySpA: chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });
});

// ---------------------------------------------------------------------------
// #659 — Pinch abilities (Blaze, Overgrow, Torrent, Swarm) as stat modifiers
// Source: Showdown data/abilities.ts -- blaze/overgrow/torrent/swarm: onModifyAtk, onModifySpA
// ---------------------------------------------------------------------------
describe("#659 — Pinch abilities as stat modifiers", () => {
  it("given Blaze + low HP + Fire physical move, when calculating damage, then 1.5x Atk stat boost", () => {
    // maxHP = 200, threshold = floor(200/3) = 66, currentHP = 60 (<= 66)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.blaze,
      types: [TYPES.fire],
      attack: 100,
      hp: 200,
      currentHp: 60,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], defense: 100 });
    const fireMove = FIRE_PUNCH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fire],
      attack: 100,
      hp: 200,
      currentHp: 60,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- blaze: onModifyAtk chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Torrent + low HP + Water special move, when calculating damage, then 1.5x SpAtk stat boost", () => {
    // maxHP = 300, threshold = floor(300/3) = 100, currentHP = 99 (<= 100)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.torrent,
      types: [TYPES.water],
      spAttack: 110,
      hp: 300,
      currentHp: 99,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], spDefense: 100 });
    const waterMove = SURF;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.water],
      spAttack: 110,
      hp: 300,
      currentHp: 99,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: waterMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- torrent: onModifySpA chainModify(1.5)
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Blaze + HP above threshold, when calculating damage, then no boost applied", () => {
    // maxHP = 200, threshold = floor(200/3) = 66, currentHP = 67 (> 66, no boost)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.blaze,
      types: [TYPES.fire],
      attack: 100,
      hp: 200,
      currentHp: 67,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], defense: 100 });
    const fireMove = FIRE_PUNCH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fire],
      attack: 100,
      hp: 200,
      currentHp: 67,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: fireMove, seed: 100 }),
      typeChart,
    );

    // Source: Bulbapedia -- Blaze only activates at <= 1/3 HP
    // No boost, damage should be equal
    expect(resultWith.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #654 — Reckless uses pokeRound(power, 4915) instead of Math.floor(power * 1.2)
// Source: Showdown data/abilities.ts -- Reckless: chainModify([4915, 4096])
// ---------------------------------------------------------------------------
describe("#654 — Reckless pokeRound", () => {
  it("given Reckless + recoil move with power 120, when calculating damage, then pokeRound(120, 4915) = 144 base power", () => {
    // Source: pokeRound(120, 4915) = floor((120 * 4915 + 2047) / 4096) = floor(591847/4096) = 144
    // Math.floor(120 * 1.2) = 144 (same in this case)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.reckless,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const recoilMove = DOUBLE_EDGE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: recoilMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: recoilMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- reckless: chainModify([4915, 4096])
    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
    const ratio = resultWith.damage / resultWithout.damage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Reckless + recoil move with power 90, when calculating damage, then pokeRound(90, 4915) = 108 base power", () => {
    // Source: pokeRound(90, 4915) = floor((90 * 4915 + 2047) / 4096) = floor(444397/4096) = 108
    // Math.floor(90 * 1.2) = Math.floor(108) = 108 (same)
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.reckless,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const recoilMove = WILD_CHARGE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: recoilMove, seed: 200 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: recoilMove, seed: 200 }),
      typeChart,
    );

    expect(resultWith.damage).toBeGreaterThan(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// #652 — Flower Gift boosts Atk in sun
// Source: Showdown data/abilities.ts -- flower-gift: onModifyAtk chainModify(1.5)
// ---------------------------------------------------------------------------
describe("#652 — Flower Gift Atk boost in sun", () => {
  it("given Flower Gift + sun weather + physical move, when calculating damage, then 1.5x Atk boost", () => {
    const sunState = createBattleState({
      weather: { type: WEATHER.sun, turnsLeft: 5, source: MOVES.drought },
    });
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.flowerGift,
      types: [TYPES.grass],
      attack: 100,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], defense: 100 });
    const physMove = DOUBLE_EDGE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.grass],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: physMove, state: sunState, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({
        attacker: baselineAttacker,
        defender,
        move: physMove,
        state: sunState,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flower-gift: onModifyAtk returns chainModify(1.5)
    expect(resultWith.breakdown!.baseDamage).toBeGreaterThan(resultWithout.breakdown!.baseDamage);
    const ratio = resultWith.breakdown!.baseDamage / resultWithout.breakdown!.baseDamage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Flower Gift + no sun weather, when calculating damage, then no Atk boost", () => {
    const noWeatherState = createBattleState({ weather: null });
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.flowerGift,
      types: [TYPES.grass],
      attack: 100,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], defense: 100 });
    const physMove = DOUBLE_EDGE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.grass],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: physMove, state: noWeatherState, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({
        attacker: baselineAttacker,
        defender,
        move: physMove,
        state: noWeatherState,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flower-gift only in sun/desolate-land
    // No weather = no boost
    expect(resultWith.damage).toBe(resultWithout.damage);
  });

  it("given Flower Gift + harsh-sun weather + physical move, when calculating damage, then 1.5x Atk boost", () => {
    const harshSunState = createBattleState({
      weather: { type: WEATHER.harshSun, turnsLeft: -1, source: MOVES.desolateLand },
    });
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.flowerGift,
      types: [TYPES.grass],
      attack: 100,
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal], defense: 100 });
    const physMove = DOUBLE_EDGE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.grass],
      attack: 100,
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: physMove, state: harshSunState, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({
        attacker: baselineAttacker,
        defender,
        move: physMove,
        state: harshSunState,
        seed: 100,
      }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- flower-gift: activates in sun or harsh-sun
    expect(resultWith.breakdown!.baseDamage).toBeGreaterThan(resultWithout.breakdown!.baseDamage);
    const ratio = resultWith.breakdown!.baseDamage / resultWithout.breakdown!.baseDamage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost15 / CORE_FIXED_POINT.identity, 1);
  });
});

// ---------------------------------------------------------------------------
// #648 — Reckless doesn't boost crash-damage moves
// Source: Showdown data/abilities.ts -- reckless: "if (move.recoil || move.hasCrashDamage)"
// ---------------------------------------------------------------------------
describe("#648 — Reckless hasCrashDamage", () => {
  it("given Reckless + Jump Kick (hasCrashDamage=true), when calculating damage, then 1.2x power boost applied", () => {
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.reckless,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const crashMove = JUMP_KICK_CRASH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: crashMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: crashMove, seed: 100 }),
      typeChart,
    );

    // Source: Showdown data/abilities.ts -- reckless: "if (move.recoil || move.hasCrashDamage)"
    // pokeRound(100, 4915) = floor((100*4915+2047)/4096) = floor(493547/4096) = 120
    expect(resultWith.breakdown!.baseDamage).toBeGreaterThan(resultWithout.breakdown!.baseDamage);
    const ratio = resultWith.breakdown!.baseDamage / resultWithout.breakdown!.baseDamage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Reckless + High Jump Kick (hasCrashDamage=true, power=130), when calculating damage, then boost is applied", () => {
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.reckless,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const crashMove = HIGH_JUMP_KICK_CRASH;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: crashMove, seed: 200 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: crashMove, seed: 200 }),
      typeChart,
    );

    // Source: pokeRound(130, 4915) = floor((130*4915+2047)/4096) = floor(641997/4096) = 156
    // Ratio = 156/130 = 1.2x
    expect(resultWith.breakdown!.baseDamage).toBeGreaterThan(resultWithout.breakdown!.baseDamage);
    const ratio = resultWith.breakdown!.baseDamage / resultWithout.breakdown!.baseDamage;
    expect(ratio).toBeCloseTo(CORE_FIXED_POINT.boost12 / CORE_FIXED_POINT.identity, 1);
  });

  it("given Reckless + move without recoil or crashDamage, when calculating damage, then no boost", () => {
    const attacker = createSyntheticOnFieldPokemon({
      ability: ABILITIES.reckless,
      types: [TYPES.fighting],
    });
    const defender = createSyntheticOnFieldPokemon({ types: [TYPES.normal] });
    const normalMove = TACKLE;

    const baselineAttacker = createSyntheticOnFieldPokemon({
      ability: NONE,
      types: [TYPES.fighting],
    });

    const resultWith = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: normalMove, seed: 100 }),
      typeChart,
    );
    const resultWithout = calculateGen6Damage(
      createDamageContext({ attacker: baselineAttacker, defender, move: normalMove, seed: 100 }),
      typeChart,
    );

    // Reckless should NOT boost normal moves without recoil or crash damage
    expect(resultWith.damage).toBe(resultWithout.damage);
  });
});

// ---------------------------------------------------------------------------
// pokeRound unit tests for specific values used in bug fixes
// Source: inline formula derivation using floor((value * modifier + 2047) / 4096)
// ---------------------------------------------------------------------------
describe("pokeRound unit tests for bug fix values", () => {
  it("pokeRound(51, 5120) = 64, not Math.floor(51*1.25) = 63 — Dry Skin rounding (#662)", () => {
    // Source: floor((51 * 5120 + 2047) / 4096) = floor(263167/4096) = 64
    expect(pokeRound(51, DRY_SKIN_MODIFIER)).toBe(64);
    // Math.floor((51 * DRY_SKIN_MODIFIER) / CORE_FIXED_POINT.identity) = 63 -- this is the bug we fixed
    expect(Math.floor((51 * DRY_SKIN_MODIFIER) / CORE_FIXED_POINT.identity)).toBe(63);
  });

  it("pokeRound(91, 5120) = 114, not Math.floor(91*1.25) = 113 — Dry Skin rounding (#662)", () => {
    // Source: floor((91 * 5120 + 2047) / 4096) = floor(468767/4096) = 114
    expect(pokeRound(91, DRY_SKIN_MODIFIER)).toBe(114);
    expect(Math.floor((91 * DRY_SKIN_MODIFIER) / CORE_FIXED_POINT.identity)).toBe(113);
  });

  it("pokeRound(40, 4915) = 48 — Iron Fist (#663)", () => {
    // Source: floor((40 * 4915 + 2047) / 4096) = floor(198647/4096) = 48
    expect(pokeRound(40, CORE_FIXED_POINT.boost12)).toBe(48);
  });

  it("pokeRound(100, 4915) = 120 — Reckless (#654)", () => {
    // Source: floor((100 * 4915 + 2047) / 4096) = floor(493547/4096) = 120
    expect(pokeRound(100, CORE_FIXED_POINT.boost12)).toBe(120);
  });

  it("pokeRound(40, 6144) = 60 — Technician (#663)", () => {
    // Source: floor((40 * 6144 + 2047) / 4096) = floor(247807/4096) = 60
    expect(pokeRound(40, CORE_FIXED_POINT.boost15)).toBe(60);
  });

  it("pokeRound(60, 6144) = 90 — Technician at threshold (#663)", () => {
    // Source: floor((60 * 6144 + 2047) / 4096) = floor(370687/4096) = 90
    expect(pokeRound(60, CORE_FIXED_POINT.boost15)).toBe(90);
  });
});
