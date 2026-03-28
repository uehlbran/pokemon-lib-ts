/**
 * Targeted branch-coverage tests for Gen 8 Wave 9 — batch 3.
 *
 * Covers previously-uncovered branches in Gen8DamageCalc.ts:
 *   1. isGen8Grounded  — gravity, iron-ball, smackdown, magnet-rise, telekinesis, klutz,
 *                        airborne semi-invulnerable volatiles
 *   2. getAttackStat   — huge-power, pure-power, gorilla-tactics, choice-band/specs (klutz),
 *                        deep-sea-tooth, light-ball, thick-club, hustle, guts, slow-start,
 *                        defeatist (HP > 50%), crit + negative attack stage
 *   3. getDefenseStat  — deep-sea-scale, eviolite+klutz, assault-vest (physical), marvel-scale,
 *                        fur-coat (special), sandstorm+rock, flower-gift
 *
 * Source authority: Showdown data/abilities.ts + data/items.ts (Gen 5–9 primary).
 * Source: Bulbapedia for sandstorm Rock SpDef boost (Gen IV+).
 */

import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_MOVE_IDS,
  CORE_SCREEN_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen8DataManager,
  GEN8_ABILITY_IDS,
  GEN8_ITEM_IDS,
  GEN8_MOVE_IDS,
  GEN8_NATURE_IDS,
  GEN8_SPECIES_IDS,
} from "../src/data";
import { calculateGen8Damage, isGen8Grounded } from "../src/Gen8DamageCalc";
import { GEN8_TYPE_CHART } from "../src/Gen8TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const _A = GEN8_ABILITY_IDS;
const I = GEN8_ITEM_IDS;
const M = GEN8_MOVE_IDS;
const _C = CORE_ABILITY_IDS;
const T = CORE_TYPE_IDS;
const MC = CORE_MOVE_CATEGORIES;
const GENDERS = CORE_GENDERS;
const _S = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;
const _W = CORE_WEATHER_IDS;
const _SC = CORE_SCREEN_IDS;
const DATA_MANAGER = createGen8DataManager();
const SP = GEN8_SPECIES_IDS;
const DEFAULT_SPECIES_ID = SP.bulbasaur;
const SYNTHETIC_SOURCE = "gen8-synthetic-battle-source";
const TELEKINESIS_VOLATILE = V.telekinesis;
const SYNTHETIC_NORMAL_PHYSICAL_50 = () => createSyntheticMove(M.tackle, T.normal, MC.physical, 50);
const SYNTHETIC_NORMAL_PHYSICAL_65 = () =>
  createSyntheticMove(M.bodySlam, T.normal, MC.physical, 65);
const SYNTHETIC_NORMAL_PHYSICAL_70 = () =>
  createSyntheticMove(M.headbutt, T.normal, MC.physical, 70);
const SYNTHETIC_NORMAL_PHYSICAL_80 = () =>
  createSyntheticMove(M.bodySlam, T.normal, MC.physical, 80);
const SYNTHETIC_WATER_SPECIAL_50 = () => createSyntheticMove(M.surf, T.water, MC.special, 50);
const SYNTHETIC_WATER_SPECIAL_60 = () => createSyntheticMove(M.surf, T.water, MC.special, 60);
const SYNTHETIC_WATER_SPECIAL_80 = () => createSyntheticMove(M.surf, T.water, MC.special, 80);
const SYNTHETIC_ELECTRIC_SPECIAL_50 = () =>
  createSyntheticMove(M.triAttack, T.electric, MC.special, 50);
const SYNTHETIC_FIRE_SPECIAL_80 = () => createSyntheticMove(M.flamethrower, T.fire, MC.special, 80);
const SYNTHETIC_PSYCHIC_SPECIAL_80 = () =>
  createSyntheticMove(M.focusBlast, T.psychic, MC.special, 80);

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
  isDynamaxed?: boolean;
  statStages?: {
    attack?: number;
    defense?: number;
    spAttack?: number;
    spDefense?: number;
    accuracy?: number;
    evasion?: number;
  };
}): ActivePokemon {
  const species = DATA_MANAGER.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES_ID);
  const hp = overrides.hp ?? 200;
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(7), {
    nature: DATA_MANAGER.getNature(GEN8_NATURE_IDS.hardy).id,
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    isShiny: false,
    metLocation: "",
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: I.pokeBall,
  });
  pokemon.uid = `gen8-synthetic-${species.id}`;
  pokemon.nickname = null;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.moves = [createMoveSlot(DATA_MANAGER.getMove(M.tackle))];
  pokemon.ability = overrides.ability ?? CORE_ABILITY_IDS.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp,
    attack: overrides.attack ?? 100,
    defense: overrides.defense ?? 100,
    spAttack: overrides.spAttack ?? 100,
    spDefense: overrides.spDefense ?? 100,
    speed: overrides.speed ?? 100,
  };
  return {
    pokemon,
    teamSlot: 0,
    statStages: {
      attack: overrides.statStages?.attack ?? 0,
      defense: overrides.statStages?.defense ?? 0,
      spAttack: overrides.statStages?.spAttack ?? 0,
      spDefense: overrides.statStages?.spDefense ?? 0,
      speed: 0,
      accuracy: overrides.statStages?.accuracy ?? 0,
      evasion: overrides.statStages?.evasion ?? 0,
    },
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? [CORE_TYPE_IDS.normal],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
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
    isDynamaxed: overrides.isDynamaxed ?? false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    suppressedAbility: null,
    forcedMove: null,
  } as ActivePokemon;
}

function createCanonicalMove(
  moveId: (typeof M)[keyof typeof M],
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
 * Branch-driving synthetic move fixture for formula/coverage tests. Start from a real Gen 8 move
 * record and override only the category/type/power values that intentionally differ.
 */
function createSyntheticMove(
  baseMoveId: (typeof M)[keyof typeof M],
  type: PokemonType,
  category: (typeof MC)[keyof typeof MC] | typeof MC.status,
  power: number | null,
): MoveData {
  return createCanonicalMove(baseMoveId, { type, category, power });
}

function createSyntheticBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number; source: string } | null;
  terrain?: { type: string; turnsLeft: number; source: string } | null;
}): BattleState {
  return {
    weather: overrides?.weather ?? null,
    terrain: overrides?.terrain ?? null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    format: "singles",
    generation: 8,
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
    move: overrides.move ?? createCanonicalMove(M.tackle),
    state: overrides.state ?? createSyntheticBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  } as unknown as DamageContext;
}

/** Convenience wrapper: call calculateGen8Damage with the Gen 8 type chart */
function calcDmg(ctx: DamageContext): ReturnType<typeof calculateGen8Damage> {
  return calculateGen8Damage(ctx, GEN8_TYPE_CHART);
}

// ---------------------------------------------------------------------------
// 1. isGen8Grounded
// ---------------------------------------------------------------------------

describe(`isGen8G${CORE_MOVE_IDS.round}ed`, () => {
  it(`given ${CORE_MOVE_IDS.gravity}Active=true, when pokemon is flying type, then returns grounded=true`, () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: gravity always grounds
    const flyingPokemon = createSyntheticOnFieldPokemon({ types: [T.flying] });
    const result = isGen8Grounded(flyingPokemon, true);
    expect(result).toBe(true);
  });

  it(`given gravityActive=true, when pokemon has ${CORE_ABILITY_IDS.levitate}, then returns grounded=true`, () => {
    // Source: Showdown sim/pokemon.ts -- isGrounded: gravity overrides levitate
    const levitate = createSyntheticOnFieldPokemon({ ability: CORE_ABILITY_IDS.levitate });
    const result = isGen8Grounded(levitate, true);
    expect(result).toBe(true);
  });

  it(`given pokemon holds ${CORE_ITEM_IDS.ironBall} and ability is not klutz, when gravityActive=false, then returns grounded=true`, () => {
    // Source: Showdown data/items.ts -- Iron Ball: grounds the holder (isGrounded returns true)
    const pokemon = createSyntheticOnFieldPokemon({
      types: [T.flying],
      heldItem: CORE_ITEM_IDS.ironBall,
      ability: CORE_ABILITY_IDS.none,
    });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(true);
  });

  it(`given pokemon has klutz and holds ${CORE_ITEM_IDS.ironBall}, when gravityActive=false, then returns NOT grounded (false for flying)`, () => {
    // Source: Showdown data/items.ts -- Klutz suppresses item effects including Iron Ball grounding
    const pokemon = createSyntheticOnFieldPokemon({
      types: [T.flying],
      heldItem: CORE_ITEM_IDS.ironBall,
      ability: CORE_ABILITY_IDS.klutz,
    });
    const result = isGen8Grounded(pokemon, false);
    // klutz suppresses iron-ball → flying type applies → NOT grounded
    expect(result).toBe(false);
  });

  it(`given pokemon has ${CORE_VOLATILE_IDS.smackDown} volatile, when flying type, then returns grounded=true`, () => {
    // Source: Showdown data/moves.ts -- Smack Down: volatileStatus CORE_VOLATILE_IDS.smackDown grounds target
    const volatiles = new Map([[CORE_VOLATILE_IDS.smackDown, { turnsLeft: -1 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [T.flying], volatiles });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(true);
  });

  it(`given non-flying non-levitate pokemon has ${CORE_VOLATILE_IDS.magnetRise} volatile, then returns grounded=false`, () => {
    // Source: Showdown data/moves.ts -- Magnet Rise: volatileStatus CORE_VOLATILE_IDS.magnetRise ungrounds pokemon
    const volatiles = new Map([[CORE_VOLATILE_IDS.magnetRise, { turnsLeft: 5 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], volatiles });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(false);
  });

  it(`given non-${CORE_VOLATILE_IDS.flying} pokemon has telekinesis volatile, then returns grounded=false`, () => {
    // Source: Showdown data/moves.ts -- Telekinesis applies the telekinesis volatile and ungrounds the target.
    const volatiles = new Map([[TELEKINESIS_VOLATILE, { turnsLeft: 3 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], volatiles });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(false);
  });

  it(`given pokemon has airborne ${CORE_VOLATILE_IDS.flying} volatile, when checking grounded, then returns false`, () => {
    // Source: BattleEngine.ts -- Fly/Bounce set the shared airborne volatile
    // Source: Showdown sim/pokemon.ts -- airborne semi-invulnerable users are not grounded
    const volatiles = new Map([[CORE_VOLATILE_IDS.flying, { turnsLeft: 1 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], volatiles });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(false);
  });

  it(`given pokemon has airborne ${CORE_VOLATILE_IDS.shadowForceCharging} volatile, when checking grounded, then returns false`, () => {
    // Source: BattleEngine.ts -- Shadow Force / Phantom Force share the disappearing airborne volatile
    // Source: Showdown sim/pokemon.ts -- airborne semi-invulnerable users are not grounded
    const volatiles = new Map([[CORE_VOLATILE_IDS.shadowForceCharging, { turnsLeft: 1 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.ghost], volatiles });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(false);
  });

  it(`given gravityActive=true and pokemon has airborne ${CORE_VOLATILE_IDS.flying} volatile, then returns grounded=true`, () => {
    // Source: Showdown sim/pokemon.ts -- gravity overrides airborne semi-invulnerable states
    const volatiles = new Map([[CORE_VOLATILE_IDS.flying, { turnsLeft: 1 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal], volatiles });
    const result = isGen8Grounded(pokemon, true);
    expect(result).toBe(true);
  });

  it(`given gravityActive=true and pokemon has airborne ${CORE_VOLATILE_IDS.shadowForceCharging} volatile, then returns grounded=true`, () => {
    // Source: Showdown sim/pokemon.ts -- gravity overrides airborne semi-invulnerable states
    const volatiles = new Map([[CORE_VOLATILE_IDS.shadowForceCharging, { turnsLeft: 1 }]]);
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.ghost], volatiles });
    const result = isGen8Grounded(pokemon, true);
    expect(result).toBe(true);
  });

  it(`given normal-type pokemon with no items or volatiles, then returns ${CORE_TYPE_IDS.ground}ed=true`, () => {
    // Source: Showdown sim/pokemon.ts -- default case: non-flying/non-levitate is grounded
    const pokemon = createSyntheticOnFieldPokemon({ types: [CORE_TYPE_IDS.normal] });
    const result = isGen8Grounded(pokemon, false);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. getAttackStat — via calculateGen8Damage
// ---------------------------------------------------------------------------

describe(`getAttackStat — ability and item buffs (via calculateGen${GEN8_SPECIES_IDS.wartortle}Damage)`, () => {
  // --- Huge Power / Pure Power ---

  it(`given attacker has ${GEN8_ABILITY_IDS.hugePower}, when using physical move, then damage is double vs no-ability baseline`, () => {
    // Source: Showdown data/abilities.ts -- Huge Power: onModifyAtk *= 2
    const baseline = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const withHugePower = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.hugePower,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();

    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;
    const dmgHugePower = calcDmg(
      createDamageContext({ attacker: withHugePower, defender, move }),
    ).damage;

    // huge-power doubles attack → significantly more damage
    expect(dmgHugePower).toBeGreaterThan(dmgBaseline);
  });

  it(`given attacker has ${GEN8_ABILITY_IDS.purePower}, when using physical move, then damage is higher than no-ability baseline`, () => {
    // Source: Showdown data/abilities.ts -- Pure Power: onModifyAtk *= 2 (same as Huge Power)
    const baseline = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const withPurePower = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.purePower,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();

    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;
    const dmgPurePower = calcDmg(
      createDamageContext({ attacker: withPurePower, defender, move }),
    ).damage;

    expect(dmgPurePower).toBeGreaterThan(dmgBaseline);
  });

  it(`given attacker has ${GEN8_ABILITY_IDS.hugePower}, when using special move, then no attack doubling (huge-power is physical only)`, () => {
    // Source: Showdown data/abilities.ts -- Huge Power / Pure Power: only onModifyAtk, not SpAtk
    const baseline = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const withHugePower = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: GEN8_ABILITY_IDS.hugePower,
    });
    const defender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const move = SYNTHETIC_WATER_SPECIAL_50();

    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;
    const dmgHugePower = calcDmg(
      createDamageContext({ attacker: withHugePower, defender, move }),
    ).damage;

    // No boost for special moves → damage should be equal
    expect(dmgHugePower).toBe(dmgBaseline);
  });

  // --- Gorilla Tactics ---

  it(`given attacker has ${GEN8_ABILITY_IDS.gorillaTactics}, when using physical move, then damage is higher than no-ability baseline`, () => {
    // Source: Showdown data/abilities.ts -- Gorilla Tactics: onModifyAtk * 1.5 (Gen 8 new ability)
    const baseline = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const withTactics = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.gorillaTactics,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;
    const dmgTactics = calcDmg(
      createDamageContext({ attacker: withTactics, defender, move }),
    ).damage;

    expect(dmgTactics).toBeGreaterThan(dmgBaseline);
  });

  it(`given attacker has ${GEN8_ABILITY_IDS.gorillaTactics}, when using special move, then no boost (gorilla-tactics is physical only)`, () => {
    // Source: Showdown data/abilities.ts -- Gorilla Tactics: only onModifyAtk, not SpAtk
    const baseline = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const withTactics = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: GEN8_ABILITY_IDS.gorillaTactics,
    });
    const defender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const move = SYNTHETIC_WATER_SPECIAL_80();

    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;
    const dmgTactics = calcDmg(
      createDamageContext({ attacker: withTactics, defender, move }),
    ).damage;

    expect(dmgTactics).toBe(dmgBaseline);
  });

  // --- Choice Band + Klutz (klutz suppresses) ---

  it(`given attacker has klutz ability and holds ${CORE_ITEM_IDS.choiceBand}, when using physical move, then no choice-band boost`, () => {
    // Source: Showdown data/items.ts -- Klutz: suppresses held item, Choice Band gives no boost
    const withKlutzBand = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.klutz,
      heldItem: CORE_ITEM_IDS.choiceBand,
    });
    const withBandOnly = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.choiceBand,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgKlutz = calcDmg(
      createDamageContext({ attacker: withKlutzBand, defender, move }),
    ).damage;
    const dmgBand = calcDmg(createDamageContext({ attacker: withBandOnly, defender, move })).damage;

    // klutz suppresses choice-band → klutz damage should be less
    expect(dmgKlutz).toBeLessThan(dmgBand);
  });

  it(`given attacker holds ${CORE_ITEM_IDS.choiceSpecs}, when using physical move, then no choice-specs boost (specs is special only)`, () => {
    // Source: Showdown data/items.ts -- Choice Specs: onModifySpA only, not physical
    const withSpecsPhysical = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.choiceSpecs,
    });
    const noItem = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgWithSpecs = calcDmg(
      createDamageContext({ attacker: withSpecsPhysical, defender, move }),
    ).damage;
    const dmgNoItem = calcDmg(createDamageContext({ attacker: noItem, defender, move })).damage;

    // Choice specs don't boost physical → same damage
    expect(dmgWithSpecs).toBe(dmgNoItem);
  });

  it(`given non-Clamperl pokemon holds ${CORE_ITEM_IDS.deepSeaTooth}, when using special move, then no boost`, () => {
    // Source: Showdown data/items.ts -- Deep Sea Tooth only boosts Clamperl.
    // The shipped Gen 8 species surface in this package does not expose Clamperl, so this suite
    // keeps the generation-valid negative-path assertion only.
    const nonClamperl = createSyntheticOnFieldPokemon({
      speciesId: SP.bulbasaur,
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.deepSeaTooth,
    });
    const nonClamperlNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.bulbasaur,
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const move = SYNTHETIC_WATER_SPECIAL_60();

    const dmgWithTooth = calcDmg(
      createDamageContext({ attacker: nonClamperl, defender, move }),
    ).damage;
    const dmgNoItem = calcDmg(
      createDamageContext({ attacker: nonClamperlNoItem, defender, move }),
    ).damage;

    expect(dmgWithTooth).toBe(dmgNoItem);
  });

  // --- Light Ball (Pikachu speciesId=25) ---

  it(`given Pikachu (speciesId=25) holds ${CORE_ITEM_IDS.lightBall}, when using physical move, then damage is higher than no item`, () => {
    // Source: Showdown data/items.ts -- Light Ball: Pikachu doubles Attack and SpAtk
    const pikachu = createSyntheticOnFieldPokemon({
      speciesId: SP.pikachu,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.lightBall,
    });
    const pikachuNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.pikachu,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_50();

    const dmgLightBall = calcDmg(createDamageContext({ attacker: pikachu, defender, move })).damage;
    const dmgNoItem = calcDmg(
      createDamageContext({ attacker: pikachuNoItem, defender, move }),
    ).damage;

    expect(dmgLightBall).toBeGreaterThan(dmgNoItem);
  });

  it(`given Pikachu (speciesId=25) holds ${CORE_ITEM_IDS.lightBall}, when using special move, then SpAtk also doubled`, () => {
    // Source: Showdown data/items.ts -- Light Ball: Pikachu doubles both Attack and SpAtk
    const pikachu = createSyntheticOnFieldPokemon({
      speciesId: SP.pikachu,
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.lightBall,
    });
    const pikachuNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.pikachu,
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ spDefense: 100 });
    const move = SYNTHETIC_ELECTRIC_SPECIAL_50();

    const dmgLightBall = calcDmg(createDamageContext({ attacker: pikachu, defender, move })).damage;
    const dmgNoItem = calcDmg(
      createDamageContext({ attacker: pikachuNoItem, defender, move }),
    ).damage;

    expect(dmgLightBall).toBeGreaterThan(dmgNoItem);
  });

  // --- Thick Club (Cubone speciesId=104) ---

  it(`given Cubone (speciesId=104) holds ${CORE_ITEM_IDS.thickClub}, when using physical move, then doubled Attack damage`, () => {
    // Source: Showdown data/items.ts -- Thick Club doubles Attack for Cubone/Marowak.
    // Regional-form species ids are tracked separately from the current National Dex model.
    // Base-damage derivation at L50, 65 BP, 100 Atk vs 100 Def:
    // without item: floor(floor(22 * 65 * 100 / 100) / 50) + 2 = 30
    // with Thick Club: floor(floor(22 * 65 * 200 / 100) / 50) + 2 = 59
    const cubone = createSyntheticOnFieldPokemon({
      speciesId: SP.cubone,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.thickClub,
    });
    const cuboneNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.cubone,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_65();

    const thickClubResult = calcDmg(createDamageContext({ attacker: cubone, defender, move }));
    const noItemResult = calcDmg(createDamageContext({ attacker: cuboneNoItem, defender, move }));

    expect(thickClubResult.breakdown?.baseDamage).toBe(59);
    expect(noItemResult.breakdown?.baseDamage).toBe(30);
    expect(thickClubResult.damage).toBeGreaterThan(noItemResult.damage);
  });

  it(`given Marowak (speciesId=105) holds ${CORE_ITEM_IDS.thickClub}, when using physical move, then doubled Attack damage`, () => {
    // Source: Showdown data/items.ts -- Thick Club doubles Attack for Cubone/Marowak.
    // The shipped runtime species model uses National Dex ids, so Marowak remains speciesId 105.
    // Base-damage derivation at L50, 65 BP, 100 Atk vs 100 Def:
    // without item: floor(floor(22 * 65 * 100 / 100) / 50) + 2 = 30
    // with Thick Club: floor(floor(22 * 65 * 200 / 100) / 50) + 2 = 59
    const marowak = createSyntheticOnFieldPokemon({
      speciesId: SP.marowak,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.thickClub,
    });
    const marowakNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.marowak,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_65();

    const thickClubResult = calcDmg(createDamageContext({ attacker: marowak, defender, move }));
    const noItemResult = calcDmg(createDamageContext({ attacker: marowakNoItem, defender, move }));

    expect(thickClubResult.breakdown?.baseDamage).toBe(59);
    expect(noItemResult.breakdown?.baseDamage).toBe(30);
    expect(thickClubResult.damage).toBeGreaterThan(noItemResult.damage);
  });

  it(`given non-Cubone/Marowak pokemon holds ${CORE_ITEM_IDS.thickClub}, when using physical move, then no boost`, () => {
    // Source: Showdown data/items.ts -- Thick Club only boosts Cubone/Marowak in the
    // current shipped species-id model (National Dex ids 104 and 105).
    const nonCubone = createSyntheticOnFieldPokemon({
      speciesId: SP.bulbasaur,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.thickClub,
    });
    const nonCuboneNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.bulbasaur,
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_65();

    const dmgWithClub = calcDmg(
      createDamageContext({ attacker: nonCubone, defender, move }),
    ).damage;
    const dmgNoItem = calcDmg(
      createDamageContext({ attacker: nonCuboneNoItem, defender, move }),
    ).damage;

    expect(dmgWithClub).toBe(dmgNoItem);
  });

  // --- Hustle ---

  it(`given attacker has ${GEN8_ABILITY_IDS.hustle}, when using physical move, then damage is higher than no-ability baseline`, () => {
    // Source: Showdown data/abilities.ts -- Hustle: onModifyAtk *= 1.5 for physical moves
    const baseline = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const withHustle = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.hustle,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_70();

    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;
    const dmgHustle = calcDmg(createDamageContext({ attacker: withHustle, defender, move })).damage;

    expect(dmgHustle).toBeGreaterThan(dmgBaseline);
  });

  // --- Guts ---

  it(`given attacker has guts and is ${CORE_STATUS_IDS.burn}ed, when using physical move, then guts 1.5x boost applies (overcomes burn penalty)`, () => {
    // Source: Showdown data/abilities.ts -- Guts: onModifyAtk *= 1.5 when statused, overrides burn penalty
    const withGutsNoStatus = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.guts,
      status: null,
    });
    const withGutsBurned = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.guts,
      status: CORE_STATUS_IDS.burn,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_70();

    const dmgNoStatus = calcDmg(
      createDamageContext({ attacker: withGutsNoStatus, defender, move }),
    ).damage;
    const dmgBurned = calcDmg(
      createDamageContext({ attacker: withGutsBurned, defender, move }),
    ).damage;

    // Guts + burn: 1.5x attack from guts, burn penalty removed by guts → higher than no status
    expect(dmgBurned).toBeGreaterThan(dmgNoStatus);
  });

  it(`given attacker has guts but no status, when using physical move, then no guts attack boost`, () => {
    // Source: Showdown data/abilities.ts -- Guts: only activates when pokemon has a status condition
    const withGutsNoStatus = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: GEN8_ABILITY_IDS.guts,
      status: null,
    });
    const baseline = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      status: null,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_70();

    const dmgGuts = calcDmg(
      createDamageContext({ attacker: withGutsNoStatus, defender, move }),
    ).damage;
    const dmgBaseline = calcDmg(createDamageContext({ attacker: baseline, defender, move })).damage;

    // No status → guts inactive → same damage as baseline
    expect(dmgGuts).toBe(dmgBaseline);
  });

  // --- Slow Start ---

  it(`given attacker has ${CORE_ABILITY_IDS.slowStart} ability and slow-start volatile, when using physical move, then halved attack damage`, () => {
    // Source: Showdown data/abilities.ts -- Slow Start: halves Attack for first 5 turns
    const volatile = new Map([[CORE_ABILITY_IDS.slowStart, { turnsLeft: 3 }]]);
    const withSlowStart = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.slowStart,
      volatiles: volatile,
    });
    const noSlowStart = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_70();

    const dmgSlowStart = calcDmg(
      createDamageContext({ attacker: withSlowStart, defender, move }),
    ).damage;
    const dmgNormal = calcDmg(
      createDamageContext({ attacker: noSlowStart, defender, move }),
    ).damage;

    expect(dmgSlowStart).toBeLessThan(dmgNormal);
  });

  // --- Defeatist ---

  it(`given attacker has ${CORE_ABILITY_IDS.defeatist} and HP is at exactly 50%, when using physical move, then halved attack damage`, () => {
    // Source: Showdown data/abilities.ts -- Defeatist: halves Atk/SpA when currentHp <= floor(maxHp/2)
    const maxHp = 200;
    const withDefeatistLowHp = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.defeatist,
      hp: maxHp,
      currentHp: 100, // exactly 50% = Math.floor(200/2) = 100
    });
    const noAbility = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      hp: maxHp,
      currentHp: 100,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_70();

    const dmgDefeatist = calcDmg(
      createDamageContext({ attacker: withDefeatistLowHp, defender, move }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker: noAbility, defender, move }),
    ).damage;

    expect(dmgDefeatist).toBeLessThan(dmgNoAbility);
  });

  it(`given attacker has ${CORE_ABILITY_IDS.defeatist} and HP is above 50%, when using physical move, then no damage penalty`, () => {
    // Source: Showdown data/abilities.ts -- Defeatist: only halves when currentHp <= floor(maxHp/2)
    const maxHp = 200;
    const withDefeatistHighHp = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.defeatist,
      hp: maxHp,
      currentHp: 101, // above 50% threshold
    });
    const noAbility = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      hp: maxHp,
      currentHp: 101,
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_70();

    const dmgDefeatist = calcDmg(
      createDamageContext({ attacker: withDefeatistHighHp, defender, move }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker: noAbility, defender, move }),
    ).damage;

    // HP above threshold → no defeatist penalty → same damage
    expect(dmgDefeatist).toBe(dmgNoAbility);
  });

  // --- Crit + Negative Attack Stage ---

  it(`given isCrit=true and attacker has negative attack stage, when using physical move, then damage equals crit with stage=0`, () => {
    // Source: Showdown sim/battle-actions.ts -- on crit, negative attack stages are ignored (use 0)
    const attackerNegStage = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      statStages: { attack: -2 },
    });
    const attackerZeroStage = createSyntheticOnFieldPokemon({
      attack: 100,
      ability: CORE_ABILITY_IDS.none,
      statStages: { attack: 0 },
    });
    const defender = createSyntheticOnFieldPokemon({ defense: 100 });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    // Use same seed so random factor is identical
    const ctxNeg: DamageContext = {
      attacker: attackerNegStage,
      defender,
      move,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(99),
      isCrit: true,
    } as unknown as DamageContext;

    const ctxZero: DamageContext = {
      attacker: attackerZeroStage,
      defender,
      move,
      state: createSyntheticBattleState(),
      rng: new SeededRandom(99),
      isCrit: true,
    } as unknown as DamageContext;

    const dmgNegStage = calcDmg(ctxNeg).damage;
    const dmgZeroStage = calcDmg(ctxZero).damage;

    // Crit ignores negative attack stage → both should produce same damage
    expect(dmgNegStage).toBe(dmgZeroStage);
  });
});

// ---------------------------------------------------------------------------
// 3. getDefenseStat — via calculateGen8Damage
// ---------------------------------------------------------------------------

describe(`getDefenseStat — item and ability buffs (via calculateGen${GEN8_SPECIES_IDS.wartortle}Damage)`, () => {
  it(`given non-Clamperl defender holds ${CORE_ITEM_IDS.deepSeaScale}, when using special move, then no SpDef boost`, () => {
    // Source: Showdown data/items.ts -- Deep Sea Scale only boosts Clamperl.
    // The shipped Gen 8 species surface in this package does not expose Clamperl, so this suite
    // keeps the generation-valid negative-path assertion only.
    const nonClamperl = createSyntheticOnFieldPokemon({
      speciesId: SP.bulbasaur,
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: CORE_ITEM_IDS.deepSeaScale,
    });
    const nonClamperlNoItem = createSyntheticOnFieldPokemon({
      speciesId: SP.bulbasaur,
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const move = SYNTHETIC_WATER_SPECIAL_80();

    const dmgWithScale = calcDmg(
      createDamageContext({ attacker, defender: nonClamperl, move }),
    ).damage;
    const dmgNoItem = calcDmg(
      createDamageContext({ attacker, defender: nonClamperlNoItem, move }),
    ).damage;

    expect(dmgWithScale).toBe(dmgNoItem);
  });

  // --- Eviolite + Klutz ---

  it(`given defender has ${CORE_ABILITY_IDS.klutz} and holds eviolite, when using physical move, then no eviolite Def boost`, () => {
    // Source: Showdown data/items.ts -- Klutz suppresses item effects including Eviolite
    const withKlutzEviolite = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.klutz,
      heldItem: GEN8_ITEM_IDS.eviolite,
    });
    const withEvioliteOnly = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN8_ITEM_IDS.eviolite,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgKlutzEvo = calcDmg(
      createDamageContext({ attacker, defender: withKlutzEviolite, move }),
    ).damage;
    const dmgEvoOnly = calcDmg(
      createDamageContext({ attacker, defender: withEvioliteOnly, move }),
    ).damage;

    // klutz suppresses eviolite → more damage than eviolite without klutz
    expect(dmgKlutzEvo).toBeGreaterThan(dmgEvoOnly);
  });

  it(`given defender holds eviolite without ${CORE_ABILITY_IDS.klutz}, when using physical move, then eviolite Def boost applies`, () => {
    // Source: Showdown data/items.ts -- Eviolite: 1.5x Def and SpDef for non-fully-evolved
    const withEviolite = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN8_ITEM_IDS.eviolite,
    });
    const noItem = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgEviolite = calcDmg(
      createDamageContext({ attacker, defender: withEviolite, move }),
    ).damage;
    const dmgNoItem = calcDmg(createDamageContext({ attacker, defender: noItem, move })).damage;

    expect(dmgEviolite).toBeLessThan(dmgNoItem);
  });

  // --- Assault Vest (special defense only) ---

  it(`given defender holds ${GEN8_ITEM_IDS.assaultVest}, when using physical move, then no SpDef boost (assault vest is special only)`, () => {
    // Source: Showdown data/items.ts -- Assault Vest: onModifySpD only, not Def
    const withAVPhysical = createSyntheticOnFieldPokemon({
      defense: 100,
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN8_ITEM_IDS.assaultVest,
    });
    const noItem = createSyntheticOnFieldPokemon({
      defense: 100,
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgAV = calcDmg(createDamageContext({ attacker, defender: withAVPhysical, move })).damage;
    const dmgNoItem = calcDmg(createDamageContext({ attacker, defender: noItem, move })).damage;

    // Assault vest doesn't boost defense for physical → same damage
    expect(dmgAV).toBe(dmgNoItem);
  });

  it(`given defender holds ${GEN8_ITEM_IDS.assaultVest}, when using special move, then 1.5x SpDef boost applies`, () => {
    // Source: Showdown data/items.ts -- Assault Vest: onModifySpD * 1.5
    const withAV = createSyntheticOnFieldPokemon({
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: GEN8_ITEM_IDS.assaultVest,
    });
    const noItem = createSyntheticOnFieldPokemon({
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
      heldItem: null,
    });
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const move = SYNTHETIC_WATER_SPECIAL_80();

    const dmgAV = calcDmg(createDamageContext({ attacker, defender: withAV, move })).damage;
    const dmgNoItem = calcDmg(createDamageContext({ attacker, defender: noItem, move })).damage;

    expect(dmgAV).toBeLessThan(dmgNoItem);
  });

  // --- Marvel Scale ---

  it(`given defender has ${CORE_ABILITY_IDS.marvelScale} and is burned, when using physical move, then 1.5x Def boost applies`, () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: onModifyDef * 1.5 when pokemon has status
    const withMarvelBurned = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.marvelScale,
      status: CORE_STATUS_IDS.burn,
    });
    const withMarvelNoStatus = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.marvelScale,
      status: null,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgBurned = calcDmg(
      createDamageContext({ attacker, defender: withMarvelBurned, move }),
    ).damage;
    const dmgNoStatus = calcDmg(
      createDamageContext({ attacker, defender: withMarvelNoStatus, move }),
    ).damage;

    expect(dmgBurned).toBeLessThan(dmgNoStatus);
  });

  it(`given defender has ${CORE_ABILITY_IDS.marvelScale} but no status, when using physical move, then no Def boost`, () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: requires status condition to activate
    const withMarvelNoStatus = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.marvelScale,
      status: null,
    });
    const noAbility = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.none,
      status: null,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgMarvel = calcDmg(
      createDamageContext({ attacker, defender: withMarvelNoStatus, move }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker, defender: noAbility, move }),
    ).damage;

    // No status → marvel scale inactive → same as no ability
    expect(dmgMarvel).toBe(dmgNoAbility);
  });

  // --- Fur Coat (physical defense only) ---

  it(`given defender has ${GEN8_ABILITY_IDS.furCoat}, when using special move, then no Def boost (fur-coat is physical only)`, () => {
    // Source: Showdown data/abilities.ts -- Fur Coat: onModifyDef only, not SpDef
    const withFurCoat = createSyntheticOnFieldPokemon({
      spDefense: 100,
      ability: GEN8_ABILITY_IDS.furCoat,
    });
    const noAbility = createSyntheticOnFieldPokemon({
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const move = SYNTHETIC_FIRE_SPECIAL_80();

    const dmgFurCoat = calcDmg(
      createDamageContext({ attacker, defender: withFurCoat, move }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker, defender: noAbility, move }),
    ).damage;

    // Fur coat doesn't boost SpDef → same damage for special moves
    expect(dmgFurCoat).toBe(dmgNoAbility);
  });

  it(`given defender has ${GEN8_ABILITY_IDS.furCoat}, when using physical move, then 2x Def boost applies`, () => {
    // Source: Showdown data/abilities.ts -- Fur Coat: onModifyDef * 2
    const withFurCoat = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: GEN8_ABILITY_IDS.furCoat,
    });
    const noAbility = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();

    const dmgFurCoat = calcDmg(
      createDamageContext({ attacker, defender: withFurCoat, move }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker, defender: noAbility, move }),
    ).damage;

    expect(dmgFurCoat).toBeLessThan(dmgNoAbility);
  });

  // --- Sandstorm + Rock type SpDef boost ---

  it(`given defender is rock-type and ${CORE_WEATHER_IDS.sand} is active, when using special move, then 1.5x SpDef boost applied`, () => {
    // Source: Bulbapedia -- Sandstorm: Rock-types gain 1.5x SpDef during sandstorm (Gen IV+)
    // Compare rock defender with sandstorm vs without sandstorm to isolate the SpDef boost.
    // Use a neutral-type special move (psychic vs rock = 1x effectiveness) to avoid type chart skew.
    const rockDefender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.rock],
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const move = SYNTHETIC_PSYCHIC_SPECIAL_80();
    const stateWithSand = createSyntheticBattleState({
      weather: { type: CORE_WEATHER_IDS.sand, turnsLeft: 5, source: SYNTHETIC_SOURCE },
    });
    const stateNoWeather = createSyntheticBattleState();

    const dmgWithSand = calcDmg(
      createDamageContext({ attacker, defender: rockDefender, move, state: stateWithSand }),
    ).damage;
    const dmgNoSand = calcDmg(
      createDamageContext({ attacker, defender: rockDefender, move, state: stateNoWeather }),
    ).damage;

    // Sandstorm boosts rock SpDef by 1.5x → less damage in sand vs no weather
    expect(dmgWithSand).toBeLessThan(dmgNoSand);
  });

  it(`given defender is rock-type and ${CORE_WEATHER_IDS.sand} is active, when using physical move, then no SpDef boost (sandstorm only boosts SpDef)`, () => {
    // Source: Bulbapedia -- Sandstorm SpDef boost only applies to special attacks, not physical
    // Compare rock defender in sandstorm vs rock defender without sandstorm using a neutral physical move.
    // If sandstorm incorrectly boosted Def, damage would differ. It should not.
    const rockDefender = createSyntheticOnFieldPokemon({
      types: [CORE_TYPE_IDS.rock],
      defense: 100,
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    // Use normal-type physical move: normal vs rock = 1x effectiveness
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();
    const stateWithSand = createSyntheticBattleState({
      weather: { type: CORE_WEATHER_IDS.sand, turnsLeft: 5, source: SYNTHETIC_SOURCE },
    });
    const stateNoWeather = createSyntheticBattleState();

    const dmgWithSand = calcDmg(
      createDamageContext({ attacker, defender: rockDefender, move, state: stateWithSand }),
    ).damage;
    const dmgNoSand = calcDmg(
      createDamageContext({ attacker, defender: rockDefender, move, state: stateNoWeather }),
    ).damage;

    // Physical move: sandstorm doesn't boost Defense → same damage in sand vs no weather
    expect(dmgWithSand).toBe(dmgNoSand);
  });

  // --- Flower Gift (special defense in sun) ---

  it(`given defender has flower-gift and ${CORE_WEATHER_IDS.sun} is active, when using special move, then 1.5x SpDef boost applies`, () => {
    // Source: Showdown data/abilities.ts -- Flower Gift: onAllyModifySpD * 1.5 in harsh sunlight
    const withFlowerGift = createSyntheticOnFieldPokemon({
      spDefense: 100,
      ability: GEN8_ABILITY_IDS.flowerGift,
    });
    const noAbility = createSyntheticOnFieldPokemon({
      spDefense: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const attacker = createSyntheticOnFieldPokemon({
      spAttack: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const move = SYNTHETIC_WATER_SPECIAL_80();
    const state = createSyntheticBattleState({
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: SYNTHETIC_SOURCE },
    });

    const dmgFlowerGift = calcDmg(
      createDamageContext({ attacker, defender: withFlowerGift, move, state }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker, defender: noAbility, move, state }),
    ).damage;

    expect(dmgFlowerGift).toBeLessThan(dmgNoAbility);
  });

  it(`given defender has flower-gift and ${CORE_WEATHER_IDS.sun} is active, when using physical move, then no SpDef boost (flower-gift is special only)`, () => {
    // Source: Showdown data/abilities.ts -- Flower Gift: only onModifySpD, not Def
    const withFlowerGift = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: GEN8_ABILITY_IDS.flowerGift,
    });
    const noAbility = createSyntheticOnFieldPokemon({
      defense: 100,
      ability: CORE_ABILITY_IDS.none,
    });
    const attacker = createSyntheticOnFieldPokemon({ attack: 100, ability: CORE_ABILITY_IDS.none });
    const move = SYNTHETIC_NORMAL_PHYSICAL_80();
    const state = createSyntheticBattleState({
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: SYNTHETIC_SOURCE },
    });

    const dmgFlowerGift = calcDmg(
      createDamageContext({ attacker, defender: withFlowerGift, move, state }),
    ).damage;
    const dmgNoAbility = calcDmg(
      createDamageContext({ attacker, defender: noAbility, move, state }),
    ).damage;

    // Physical move → flower-gift SpDef boost doesn't apply → same damage
    expect(dmgFlowerGift).toBe(dmgNoAbility);
  });
});
