import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_IDS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
  type MoveData,
  NEUTRAL_NATURES,
  type PokemonType,
  type PrimaryStatus,
  SeededRandom,
  type VolatileStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen5DataManager,
  GEN5_ABILITY_IDS,
  GEN5_ITEM_IDS,
  GEN5_MOVE_IDS,
  GEN5_NATURE_IDS,
  GEN5_SPECIES_IDS,
} from "../src";
import { calculateGen5Damage } from "../src/Gen5DamageCalc";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

const dataManager = createGen5DataManager();
const ABILITIES = { ...CORE_ABILITY_IDS, ...GEN5_ABILITY_IDS };
const ITEMS = { ...CORE_ITEM_IDS, ...GEN5_ITEM_IDS };
const MOVES = { ...CORE_MOVE_IDS, ...GEN5_MOVE_IDS };
const SPECIES = GEN5_SPECIES_IDS;
const TYPES = CORE_TYPE_IDS;
const WEATHER = CORE_WEATHER_IDS;
const DEFAULT_NATURE = NEUTRAL_NATURES[0] ?? GEN5_NATURE_IDS.hardy;

// ---------------------------------------------------------------------------
// Helper factories — same pattern as damage-calc.test.ts
// ---------------------------------------------------------------------------

function createActivePokemonFixture(overrides: {
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
  gender?: (typeof CORE_GENDERS)[keyof typeof CORE_GENDERS];
  volatiles?: Map<VolatileStatus, { turnsLeft: number; data?: Record<string, unknown> }>;
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
      speciesId: overrides.speciesId ?? SPECIES.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: DEFAULT_NATURE,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? ABILITIES.none,
      abilitySlot: CORE_ABILITY_SLOTS.normal1,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as PrimaryStatus | null,
      friendship: 0,
      gender: overrides.gender ?? CORE_GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: ITEMS.pokeBall,
      calculatedStats: { hp, attack, defense, spAttack, spDefense, speed },
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
    volatileStatuses: overrides.volatiles ?? new Map<VolatileStatus, { turnsLeft: number }>(),
    types: overrides.types ?? [TYPES.psychic],
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

function createCanonicalMove(id: string): MoveData {
  return dataManager.getMove(id);
}

function createSyntheticMoveFrom(overrides: {
  baseId: string;
  type: PokemonType;
  category: "physical" | "special" | "status";
  power: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  hasCrashDamage?: boolean;
}): MoveData {
  // Why: These are intentional boundary-only payloads. Gen 5 has canonical
  // source moves for the base ids, but not for every exact power/category
  // combination this regression suite needs to probe.
  return {
    ...dataManager.getMove(overrides.baseId),
    type: overrides.type,
    category: overrides.category,
    power: overrides.power,
    flags: {
      ...dataManager.getMove(overrides.baseId).flags,
      ...overrides.flags,
    },
    effect: overrides.effect ?? dataManager.getMove(overrides.baseId).effect,
    critRatio: overrides.critRatio ?? dataManager.getMove(overrides.baseId).critRatio,
    hasCrashDamage:
      overrides.hasCrashDamage ?? dataManager.getMove(overrides.baseId).hasCrashDamage,
  } as MoveData;
}

function createBattleStateFixture(overrides?: {
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

function createDamageContextFixture(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? createActivePokemonFixture({}),
    defender: overrides.defender ?? createActivePokemonFixture({}),
    move: overrides.move ?? createCanonicalMove(MOVES.tackle),
    state: overrides.state ?? createBattleStateFixture(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN5_TYPE_CHART as Record<string, Record<string, number>>;

// ---------------------------------------------------------------------------
// #643 — Type-boost items and Plates use pokeRound, not floor multiply
// ---------------------------------------------------------------------------

describe("#643 — type-boost items and Plates use pokeRound rounding", () => {
  it("given Charcoal holder using a 60BP Fire move with Atk=200, when calculating damage, then power uses pokeRound(60, 4915)=72 not floor(60*4915/4096)=71", () => {
    // Source: Showdown data/items.ts — Charcoal: chainModify([4915, 4096])
    // pokeRound(60, 4915) = floor((60*4915 + 2047) / 4096) = floor(296947/4096) = 72
    // Math.floor((60*4915) / 4096) = floor(294900/4096) = 71 — DIFFERENT
    //
    // With power=72, Atk=200, Def=100, L50:
    //   levelFactor = floor(2*50/5)+2 = 22
    //   baseDamage = floor(floor(22*72*200/100)/50)+2 = floor(3168/50)+2 = 63+2 = 65
    // With seed 36 (random roll = 100): baseDamage * 100 / 100 = 65
    // Fire vs Psychic = 1x, no STAB: finalDamage = 65
    const attacker = createActivePokemonFixture({ attack: 200, heldItem: ITEMS.charcoal });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 60,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // With pokeRound (correct): power=72 -> damage=65
    // With old floor (wrong): power=71 -> damage=64
    expect(result.damage).toBe(65);
  });

  it("given Flame Plate holder using a 60BP Fire move with Atk=200, when calculating damage, then power uses pokeRound(60, 4915)=72", () => {
    // Source: Showdown data/items.ts — Flame Plate: chainModify([4915, 4096])
    // Same math as Charcoal: pokeRound(60, 4915) = 72 vs floor(60*4915/4096) = 71
    // Damage with power=72: 65; damage with power=71: 64
    const attacker = createActivePokemonFixture({ attack: 200, heldItem: ITEMS.flamePlate });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 60,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    expect(result.damage).toBe(65);
  });

  it("given non-matching type-boost item, when calculating damage, then no power boost applied", () => {
    // Source: Showdown data/items.ts — type-boost items only boost matching type
    // Charcoal boosts Fire, not Water
    const attacker = createActivePokemonFixture({ attack: 200, heldItem: ITEMS.charcoal });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.waterPulse,
      type: TYPES.water,
      category: "special",
      power: 60,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // Power stays 60, SpAtk=100, Def=100
    // baseDamage = floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    expect(result.damage).toBe(28);
  });
});

// ---------------------------------------------------------------------------
// #653 — Iron Fist, Dry Skin, Rivalry, Technician use pokeRound
// ---------------------------------------------------------------------------

describe("#653 — ability modifiers use pokeRound rounding", () => {
  it("given Iron Fist with 75BP punching move, when calculating damage, then power uses pokeRound(75, 4915)=90", () => {
    // Source: Showdown data/abilities.ts — iron-fist: chainModify(1.2) = 4915/4096
    // pokeRound(75, 4915) = floor((75*4915 + 2047) / 4096) = floor(370672/4096) = 90
    // Math.floor(75*1.2) = Math.floor(90) = 90 — same for this input
    // Both produce 90 at power=75; this tests the correct implementation path
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.ironFist });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createCanonicalMove(MOVES.firePunch);
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=90, Atk=100, Def=100, L50:
    //   baseDamage = floor(floor(22*90*100/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    expect(result.damage).toBe(41);
  });

  it("given Iron Fist with 50BP punching move, when calculating damage, then power uses pokeRound(50, 4915)=60", () => {
    // Source: Showdown data/abilities.ts — iron-fist: chainModify(1.2) = 4915/4096
    // pokeRound(50, 4915) = floor((50*4915 + 2047) / 4096) = floor(247797/4096) = 60
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.ironFist });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 50,
      category: "physical",
      flags: { punch: true },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=60: baseDamage = floor(floor(22*60*100/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    expect(result.damage).toBe(28);
  });

  it("given Dry Skin defender and 43BP Fire move with Atk=200, when calculating damage, then power uses pokeRound(43, 5120)=54 not floor(43*1.25)=53", () => {
    // Source: Showdown data/abilities.ts — dry-skin: chainModify(1.25) = 5120/4096
    // pokeRound(43, 5120) = floor((43*5120 + 2047) / 4096) = floor(222207/4096) = 54
    // Math.floor(43*1.25) = Math.floor(53.75) = 53 — DIFFERENT
    const attacker = createActivePokemonFixture({ attack: 200 });
    const defender = createActivePokemonFixture({ defense: 100, ability: ABILITIES.drySkin });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 43,
      category: "physical",
      flags: { punch: false },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=54, Atk=200, Def=100:
    //   baseDamage = floor(floor(22*54*200/100)/50)+2 = floor(2376/50)+2 = 47+2 = 49
    // With old power=53:
    //   baseDamage = floor(floor(22*53*200/100)/50)+2 = floor(2332/50)+2 = 46+2 = 48
    expect(result.damage).toBe(49);
  });

  it("given Dry Skin defender and 60BP Fire move, when calculating damage, then power uses pokeRound(60, 5120)=75", () => {
    // Source: Showdown data/abilities.ts — dry-skin: chainModify(1.25) = 5120/4096
    // pokeRound(60, 5120) = floor((60*5120 + 2047) / 4096) = floor(309247/4096) = 75
    // Math.floor(60*1.25) = Math.floor(75) = 75 — same for this value
    const attacker = createActivePokemonFixture({ attack: 100 });
    const defender = createActivePokemonFixture({ defense: 100, ability: ABILITIES.drySkin });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 60,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=75: baseDamage = floor(floor(22*75*100/100)/50)+2 = floor(1650/50)+2 = 33+2 = 35
    expect(result.damage).toBe(35);
  });

  it("given Rivalry same-gender with 43BP move and Atk=200, when calculating damage, then power uses pokeRound(43, 5120)=54 not floor(43*1.25)=53", () => {
    // Source: Showdown data/abilities.ts — rivalry same gender: chainModify(1.25) = 5120/4096
    // pokeRound(43, 5120) = floor((43*5120 + 2047) / 4096) = floor(222207/4096) = 54
    // Math.floor(43*1.25) = Math.floor(53.75) = 53 — DIFFERENT
    const attacker = createActivePokemonFixture({
      attack: 200,
      ability: ABILITIES.rivalry,
      gender: CORE_GENDERS.male,
    });
    const defender = createActivePokemonFixture({ defense: 100, gender: CORE_GENDERS.male });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 43,
      category: "physical",
      flags: { punch: false },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=54, Atk=200, Def=100:
    //   baseDamage = floor(floor(22*54*200/100)/50)+2 = floor(2376/50)+2 = 47+2 = 49
    expect(result.damage).toBe(49);
  });

  it("given Rivalry opposite-gender with 57BP move and Atk=200, when calculating damage, then power uses pokeRound(57, 3072)=43 not floor(57*0.75)=42", () => {
    // Source: Showdown data/abilities.ts — rivalry opposite gender: chainModify(0.75) = 3072/4096
    // pokeRound(57, 3072) = floor((57*3072 + 2047) / 4096) = floor(177151/4096) = 43
    // Math.floor(57*0.75) = Math.floor(42.75) = 42 — DIFFERENT
    const attacker = createActivePokemonFixture({
      attack: 200,
      ability: ABILITIES.rivalry,
      gender: CORE_GENDERS.male,
    });
    const defender = createActivePokemonFixture({ defense: 100, gender: CORE_GENDERS.female });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 57,
      category: "physical",
      flags: { punch: false },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=43, Atk=200, Def=100:
    //   baseDamage = floor(floor(22*43*200/100)/50)+2 = floor(1892/50)+2 = 37+2 = 39
    // With old power=42:
    //   baseDamage = floor(floor(22*42*200/100)/50)+2 = floor(1848/50)+2 = 36+2 = 38
    expect(result.damage).toBe(39);
  });

  it("given Technician with 50BP move, when calculating damage, then power uses pokeRound(50, 6144)=75", () => {
    // Source: Showdown data/abilities.ts — technician: chainModify(1.5) = 6144/4096
    // pokeRound(50, 6144) = floor((50*6144 + 2047) / 4096) = floor(309247/4096) = 75
    // Math.floor(50*1.5) = 75 — same for this input
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.technician });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 50,
      category: "physical",
      flags: { punch: true },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=75: baseDamage = floor(floor(22*75*100/100)/50)+2 = floor(1650/50)+2 = 33+2 = 35
    expect(result.damage).toBe(35);
  });

  it("given Technician with 60BP move, when calculating damage, then Technician applies (60 <= 60)", () => {
    // Source: Showdown data/abilities.ts — technician applies to moves with base power <= 60
    // pokeRound(60, 6144) = floor((60*6144 + 2047) / 4096) = floor(370687/4096) = 90
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.technician });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 60,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=90: baseDamage = floor(floor(22*90*100/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    expect(result.damage).toBe(41);
  });
});

// ---------------------------------------------------------------------------
// #653 continued — Flash Fire and Pinch abilities moved to stat modifiers
// ---------------------------------------------------------------------------

describe("#653 — Flash Fire and Pinch abilities are stat modifiers (not base-power)", () => {
  it("given Flash Fire active with 50BP Fire move at Atk=100, when calculating damage, then attack stat is 1.5x (stat modifier)", () => {
    // Source: Showdown data/abilities.ts — flash-fire uses onModifyAtk/onModifySpA, not onBasePower
    // Atk = floor(100 * 150 / 100) = 150
    // power stays 50
    // baseDamage = floor(floor(22*50*150/100)/50)+2 = floor(1650/50)+2 = 33+2 = 35
    const attacker = createActivePokemonFixture({
      attack: 100,
      volatiles: new Map([[ABILITIES.flashFire, { turnsLeft: -1 }]]),
    });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 50,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    expect(result.damage).toBe(35);
  });

  it("given Flash Fire active with non-Fire move, when calculating damage, then no boost applied", () => {
    // Source: Showdown data/abilities.ts — flash-fire only boosts Fire-type moves
    const attacker = createActivePokemonFixture({
      attack: 100,
      volatiles: new Map([[ABILITIES.flashFire, { turnsLeft: -1 }]]),
    });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.waterPulse,
      type: TYPES.water,
      category: "special",
      power: 50,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // No boost: SpAtk=100, power=50
    // baseDamage = floor(floor(22*50*100/100)/50)+2 = floor(1100/50)+2 = 22+2 = 24
    expect(result.damage).toBe(24);
  });

  it("given Blaze at low HP with 50BP Fire move, when calculating damage, then attack stat is 1.5x (stat modifier)", () => {
    // Source: Showdown data/abilities.ts — blaze uses onModifyAtk/onModifySpA, not onBasePower
    // HP=300, currentHp=99 -> threshold = floor(300/3) = 100 -> 99 <= 100 -> active
    // Atk = floor(100 * 150 / 100) = 150
    // power stays 50
    // baseDamage = floor(floor(22*50*150/100)/50)+2 = floor(1650/50)+2 = 33+2 = 35
    const attacker = createActivePokemonFixture({
      attack: 100,
      ability: ABILITIES.blaze,
      hp: 300,
      currentHp: 99,
    });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 50,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    expect(result.damage).toBe(35);
  });

  it("given Overgrow at low HP with 50BP Grass special move, when calculating damage, then spAttack stat is 1.5x", () => {
    // Source: Showdown data/abilities.ts — overgrow uses onModifySpA for special moves
    // HP=300, currentHp=100 -> threshold = floor(300/3) = 100 -> 100 <= 100 -> active
    // SpAtk = floor(100 * 150 / 100) = 150
    // baseDamage = floor(floor(22*50*150/100)/50)+2 = floor(1650/50)+2 = 33+2 = 35
    // random=100: 35
    // STAB (Grass-type using Grass move): pokeRound(35, 6144) = floor((35*6144+2047)/4096) = 52
    // Grass vs Psychic = 1x: 52
    const attacker = createActivePokemonFixture({
      spAttack: 100,
      ability: ABILITIES.overgrow,
      hp: 300,
      currentHp: 100,
      types: [TYPES.grass],
    });
    const defender = createActivePokemonFixture({ spDefense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.grassKnot,
      type: TYPES.grass,
      power: 50,
      category: "special",
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    expect(result.damage).toBe(52);
  });

  it("given Blaze above HP threshold with Fire move, when calculating damage, then no boost applied", () => {
    // Source: Showdown data/abilities.ts — blaze activates only at HP <= floor(maxHP/3)
    // HP=300, currentHp=101 -> threshold = floor(300/3) = 100 -> 101 > 100 -> NOT active
    const attacker = createActivePokemonFixture({
      attack: 100,
      ability: ABILITIES.blaze,
      hp: 300,
      currentHp: 101,
    });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 50,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // No boost: Atk=100, power=50
    // baseDamage = floor(floor(22*50*100/100)/50)+2 = floor(1100/50)+2 = 22+2 = 24
    expect(result.damage).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// #641 — Reckless boosts crash-damage moves (not just recoil)
// ---------------------------------------------------------------------------

describe("#641 — Reckless hasCrashDamage", () => {
  it("given Reckless with hasCrashDamage=true (Jump Kick 100BP), when calculating damage, then 1.2x boost applies via pokeRound(100, 4915)=120", () => {
    // Source: Showdown data/abilities.ts — reckless: if (move.recoil || move.hasCrashDamage)
    // pokeRound(100, 4915) = floor((100*4915 + 2047) / 4096) = floor(493547/4096) = 120
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.reckless });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createCanonicalMove(MOVES.jumpKick);
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=120, Atk=100, Def=100, L50
    // baseDamage = floor(floor(22*120*100/100)/50)+2 = floor(2640/50)+2 = 52+2 = 54
    // Fighting vs Psychic = 0.5x: baseDamage = floor(54/2) = 27
    // Source: Gen 5 type chart — Fighting vs Psychic = 0.5x
    expect(result.damage).toBe(27);
  });

  it("given Reckless with hasCrashDamage=true (High Jump Kick 130BP), when calculating damage, then 1.2x boost applies", () => {
    // Source: Showdown data/abilities.ts — reckless: if (move.recoil || move.hasCrashDamage)
    // pokeRound(130, 4915) = floor((130*4915 + 2047) / 4096) = floor(640997/4096) = 156
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.reckless });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createCanonicalMove(MOVES.highJumpKick);
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=156, Atk=100, Def=100
    // baseDamage = floor(floor(22*156*100/100)/50)+2 = floor(3432/50)+2 = 68+2 = 70
    // Fighting vs Psychic = 0.5x: baseDamage = floor(70/2) = 35
    expect(result.damage).toBe(35);
  });

  it("given Reckless with hasCrashDamage=false and no recoil, when calculating damage, then no boost applied", () => {
    // Source: Showdown data/abilities.ts — reckless requires recoil OR hasCrashDamage
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.reckless });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 100,
      category: "physical",
      hasCrashDamage: false,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // No boost: power stays 100
    // baseDamage = floor(floor(22*100*100/100)/50)+2 = floor(2200/50)+2 = 44+2 = 46
    expect(result.damage).toBe(46);
  });

  it("given Reckless with recoil move (not crash), when calculating damage, then 1.2x boost still applies", () => {
    // Source: Showdown data/abilities.ts — reckless: move.recoil counts
    // pokeRound(80, 4915) = floor((80*4915 + 2047) / 4096) = floor(395247/4096) = 96
    const attacker = createActivePokemonFixture({ attack: 100, ability: ABILITIES.reckless });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.firePunch,
      type: TYPES.fire,
      power: 80,
      category: "physical",
      effect: { type: "recoil", percent: 33 },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // power=96: baseDamage = floor(floor(22*96*100/100)/50)+2 = floor(2112/50)+2 = 42+2 = 44
    expect(result.damage).toBe(44);
  });
});

// ---------------------------------------------------------------------------
// #640 — Solar Power and Flower Gift in sun
// ---------------------------------------------------------------------------

describe("#640 — Solar Power and Flower Gift stat modifiers in sun", () => {
  it("given Solar Power user with 50BP special Fire move in sun, when calculating damage, then SpAtk is 1.5x", () => {
    // Source: Showdown data/abilities.ts — solar-power: onModifySpA chainModify(1.5)
    // SpAtk = floor(120 * 150 / 100) = 180
    // power=50
    // baseDamage = floor(floor(22*50*180/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    const attacker = createActivePokemonFixture({
      spAttack: 120,
      ability: ABILITIES.solarPower,
      types: [TYPES.fire],
    });
    const defender = createActivePokemonFixture({ spDefense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "special",
      power: 50,
    });
    const state = createBattleStateFixture({
      weather: { type: WEATHER.sun, turnsLeft: 5, source: ABILITIES.drought },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // Fire vs Psychic = 1x; STAB 1.5x for Fire-type attacker
    // baseDamage=41, then STAB: pokeRound(41, 6144) = floor((41*6144+2047)/4096) = floor(253951/4096) = 61
    // Also sun boosts Fire: pokeRound(41, 6144) applied for weather before STAB...
    // Let me recalculate step by step:
    //   baseDamage = 41
    //   +2 already included
    //   weather (sun + fire): pokeRound(41, 6144) = floor((41*6144+2047)/4096) = floor(253951/4096) = 61
    //   no crit
    //   random roll=100: floor(61*100/100) = 61
    //   STAB: pokeRound(61, 6144) = floor((61*6144+2047)/4096) = floor(376831/4096) = 91
    //   type effectiveness = 1x: 91
    //   no burn
    //   final = 91
    expect(result.damage).toBe(91);
  });

  it("given Solar Power user with special move NOT in sun, when calculating damage, then SpAtk is NOT boosted", () => {
    // Source: Showdown data/abilities.ts — solar-power only activates in sun/harsh-sun
    const attacker = createActivePokemonFixture({
      spAttack: 120,
      ability: ABILITIES.solarPower,
      types: [TYPES.fire],
    });
    const defender = createActivePokemonFixture({ spDefense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "special",
      power: 50,
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // SpAtk stays 120 (no sun)
    // baseDamage = floor(floor(22*50*120/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    // No weather mod, random=100, STAB: pokeRound(28, 6144) = floor((28*6144+2047)/4096) = floor(174079/4096) = 42
    expect(result.damage).toBe(42);
  });

  it("given Solar Power user with physical move in sun, when calculating damage, then Atk is NOT boosted (SpAtk only)", () => {
    // Source: Showdown data/abilities.ts — solar-power only boosts SpAtk, not Atk
    const attacker = createActivePokemonFixture({ attack: 120, ability: ABILITIES.solarPower });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 50,
    });
    const state = createBattleStateFixture({
      weather: { type: WEATHER.sun, turnsLeft: 5, source: ABILITIES.drought },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // Atk stays 120 (Solar Power doesn't boost physical)
    // baseDamage = floor(floor(22*50*120/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    // weather (sun+fire): pokeRound(28, 6144) = floor((28*6144+2047)/4096) = floor(174079/4096) = 42
    // random=100, no STAB (attacker types=psychic default), eff=1x: 42
    expect(result.damage).toBe(42);
  });

  it("given Flower Gift user with 50BP physical Fire move in sun, when calculating damage, then Atk is 1.5x", () => {
    // Source: Showdown data/abilities.ts — flower-gift: onModifyAtk chainModify(1.5)
    // Atk = floor(120 * 150 / 100) = 180
    // power=50
    // baseDamage = floor(floor(22*50*180/100)/50)+2 = floor(1980/50)+2 = 39+2 = 41
    const attacker = createActivePokemonFixture({ attack: 120, ability: ABILITIES.flowerGift });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 50,
    });
    const state = createBattleStateFixture({
      weather: { type: WEATHER.sun, turnsLeft: 5, source: ABILITIES.drought },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // baseDamage = 41
    // weather (sun+fire): pokeRound(41, 6144) = floor((41*6144+2047)/4096) = floor(253951/4096) = 61
    // random=100: 61
    // no STAB (attacker types=psychic), eff=1x: 61
    expect(result.damage).toBe(61);
  });

  it("given Flower Gift user with special move in sun, when calculating damage, then SpAtk is NOT boosted (Atk only)", () => {
    // Source: Showdown data/abilities.ts — flower-gift only boosts Atk, not SpAtk
    const attacker = createActivePokemonFixture({ spAttack: 120, ability: ABILITIES.flowerGift });
    const defender = createActivePokemonFixture({ spDefense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "special",
      power: 50,
    });
    const state = createBattleStateFixture({
      weather: { type: WEATHER.sun, turnsLeft: 5, source: ABILITIES.drought },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // SpAtk stays 120 (Flower Gift doesn't boost special)
    // baseDamage = floor(floor(22*50*120/100)/50)+2 = floor(1320/50)+2 = 26+2 = 28
    // weather (sun+fire): pokeRound(28, 6144) = floor((28*6144+2047)/4096) = floor(174079/4096) = 42
    // random=100, no STAB, eff=1x: 42
    expect(result.damage).toBe(42);
  });

  it("given Flower Gift in harsh-sun, when calculating damage, then Atk is 1.5x", () => {
    // Source: Showdown data/abilities.ts — flower-gift activates in sun AND harsh-sun
    const attacker = createActivePokemonFixture({ attack: 120, ability: ABILITIES.flowerGift });
    const defender = createActivePokemonFixture({ defense: 100 });
    const move = createSyntheticMoveFrom({
      baseId: MOVES.flameWheel,
      type: TYPES.fire,
      category: "physical",
      power: 50,
    });
    const state = createBattleStateFixture({
      weather: { type: WEATHER.harshSun, turnsLeft: 5, source: ABILITIES.drought },
    });
    const ctx = createDamageContextFixture({ attacker, defender, move, state, seed: 36 });
    const result = calculateGen5Damage(ctx, typeChart);
    // Same as sun test: Atk=180, baseDamage=41, weather 1.5x=61
    expect(result.damage).toBe(61);
  });
});
