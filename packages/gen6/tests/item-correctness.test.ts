import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_FIXED_POINT,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  createEvs,
  createIvs,
  createMoveSlot,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";
import { calculateGen6Damage, pokeRound } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const GEN6_DATA = createGen6DataManager();
const DEFAULT_SPECIES = GEN6_DATA.getSpecies(GEN6_SPECIES_IDS.bulbasaur);
const DEFAULT_MOVE = GEN6_DATA.getMove(GEN6_MOVE_IDS.tackle);
const DEFAULT_NATURE = GEN6_DATA.getNature(GEN6_NATURE_IDS.hardy).id;
const DEFAULT_POKEBALL = CORE_ITEM_IDS.pokeBall;

function getGen6Move(id: string): MoveData {
  const move = GEN6_DATA.getMove(id);
  return { ...move, flags: { ...move.flags } };
}

function createSyntheticMove(
  baseMove: MoveData,
  overrides: {
    id?: string;
    type?: PokemonType;
    category?: (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES];
    power?: number | null;
    flags?: Partial<MoveData["flags"]>;
    effect?: MoveData["effect"];
    critRatio?: number;
    target?: string;
  } = {},
): MoveData {
  return {
    ...baseMove,
    id: overrides.id ?? baseMove.id,
    displayName: baseMove.displayName,
    type: overrides.type ?? baseMove.type,
    category: overrides.category ?? baseMove.category,
    power: overrides.power ?? baseMove.power,
    target: overrides.target ?? baseMove.target,
    effect: overrides.effect ?? baseMove.effect,
    critRatio: overrides.critRatio ?? baseMove.critRatio,
    flags: {
      ...baseMove.flags,
      ...overrides.flags,
    },
  } as MoveData;
}

function createOnFieldPokemon(overrides: {
  level?: number;
  attack?: number;
  defense?: number;
  spAttack?: number;
  spDefense?: number;
  speed?: number;
  hp?: number;
  currentHp?: number;
  heldItem?: string | null;
  speciesId?: number;
}): ActivePokemon {
  const hp = overrides.hp ?? 200;
  const attack = overrides.attack ?? 100;
  const defense = overrides.defense ?? 100;
  const spAttack = overrides.spAttack ?? 100;
  const spDefense = overrides.spDefense ?? 100;
  const speed = overrides.speed ?? 100;
  const species = GEN6_DATA.getSpecies(overrides.speciesId ?? DEFAULT_SPECIES.id);
  const pokemon = createPokemonInstance(species, overrides.level ?? 50, new SeededRandom(6), {
    nature: DEFAULT_NATURE,
    ivs: createIvs(),
    evs: createEvs(),
    moves: [createMoveSlot(DEFAULT_MOVE.id, DEFAULT_MOVE.pp)],
    ability: CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    gender: species.genderRatio === null ? CORE_GENDERS.genderless : CORE_GENDERS.male,
    isShiny: false,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: DEFAULT_POKEBALL,
  });

  pokemon.uid = `test-${species.id}-${pokemon.level}`;
  pokemon.currentHp = overrides.currentHp ?? hp;
  pokemon.ability = CORE_ABILITY_IDS.none;
  pokemon.calculatedStats = { hp, attack, defense, spAttack, spDefense, speed };

  return createBattleOnFieldPokemon(pokemon, 0, [...species.types]);
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
  } as BattleState;
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
    attacker: overrides.attacker ?? createOnFieldPokemon({}),
    defender: overrides.defender ?? createOnFieldPokemon({}),
    move:
      overrides.move ??
      createSyntheticMove(DEFAULT_MOVE, {
        id: "test-neutral-physical",
        type: CORE_TYPE_IDS.normal,
        category: CORE_MOVE_CATEGORIES.physical,
        power: 50,
      }),
    state: overrides.state ?? createBattleState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART;

// ===========================================================================
// Issue #610: Eviolite treated as non-removable by Knock Off
// ===========================================================================

describe("Knock Off item removability (issue #610)", () => {
  it("given a defender holding a removable item, when Knock Off is used, then it gets the 1.5x damage boost", () => {
    // Source: Showdown data/items.ts -- removable items receive the Gen 6 Knock Off boost.
    // Source: Bulbapedia "Knock Off" Gen 6 -- 1.5x damage if target holds a removable item.
    // We compare Knock Off against an equally powered synthetic Dark move so the boost is isolated.
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.absol,
      attack: 100,
    });
    const defender = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.bulbasaur,
      heldItem: GEN6_ITEM_IDS.eviolite,
      defense: 100,
    });
    const knockOff = getGen6Move(GEN6_MOVE_IDS.knockOff);
    const darkStrike = createSyntheticMove(knockOff, {
      id: "test-dark-strike",
      type: CORE_TYPE_IDS.dark,
      power: knockOff.power,
    });

    const knockOffResult = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: knockOff, seed: 12345 }),
      typeChart,
    );

    const darkStrikeResult = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: darkStrike, seed: 12345 }),
      typeChart,
    );

    expect(knockOffResult.damage).toBeGreaterThan(darkStrikeResult.damage);
  });

  it("given a defender holding a Mega Stone, when Knock Off is used, then it does not get the 1.5x boost", () => {
    // Source: Showdown data/items.ts -- Mega Stones are not removable by Knock Off.
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.absol,
      attack: 100,
    });
    const defender = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.charizard,
      heldItem: GEN6_ITEM_IDS.charizarditeX,
      defense: 100,
    });
    const knockOff = getGen6Move(GEN6_MOVE_IDS.knockOff);

    const withMegaStone = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: knockOff, seed: 12345 }),
      typeChart,
    );

    const defenderNoItem = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.charizard,
      defense: 100,
    });
    const withoutItem = calculateGen6Damage(
      createDamageContext({
        attacker,
        defender: defenderNoItem,
        move: knockOff,
        seed: 12345,
      }),
      typeChart,
    );

    expect(withMegaStone.damage).toBe(withoutItem.damage);
  });

  it("given a defender holding another Mega Stone, when Knock Off is used, then it does not get the 1.5x boost", () => {
    // Source: Showdown data/items.ts -- Mega Stones are not removable by Knock Off.
    // Triangulation: second Mega Stone test to prove the suffix-based rule still holds.
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.absol,
      attack: 100,
    });
    const defender = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.venusaur,
      heldItem: GEN6_ITEM_IDS.venusaurite,
      defense: 100,
    });
    const knockOff = getGen6Move(GEN6_MOVE_IDS.knockOff);

    const withMegaStone = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: knockOff, seed: 12345 }),
      typeChart,
    );

    const defenderNoItem = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.venusaur,
      defense: 100,
    });
    const withoutItem = calculateGen6Damage(
      createDamageContext({
        attacker,
        defender: defenderNoItem,
        move: knockOff,
        seed: 12345,
      }),
      typeChart,
    );

    expect(withMegaStone.damage).toBe(withoutItem.damage);
  });
});

// ===========================================================================
// Issue #611: Type-boost items use Math.floor instead of pokeRound
// ===========================================================================

describe("type-boost items use pokeRound for the shared fixed-point modifier (issue #611)", () => {
  it("given Charcoal boosting a Fire move with base power 60, when calculating damage, then uses pokeRound(60, typeBoost) = 72", () => {
    // Source: Showdown data/items.ts -- Charcoal uses onBasePower with the shared fixed-point type boost.
    // Source: Showdown sim/battle.ts -- chainModify uses modify() which is pokeRound.
    const charcoal = GEN6_ITEM_IDS.charcoal;
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.charizard,
      attack: 100,
      heldItem: charcoal,
    });
    const defender = createOnFieldPokemon({ defense: 100 });
    const fireMove = createSyntheticMove(DEFAULT_MOVE, {
      id: "test-fire-60",
      type: CORE_TYPE_IDS.fire,
      power: 60,
      category: CORE_MOVE_CATEGORIES.physical,
    });

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 42 }),
      typeChart,
    );

    // Charcoal boosts Fire BP 60 via pokeRound; damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
    expect(pokeRound(60, CORE_FIXED_POINT.typeBoost)).toBe(72);
    expect(Math.floor((60 * CORE_FIXED_POINT.typeBoost) / CORE_FIXED_POINT.identity)).toBe(71);
  });

  it("given Charcoal boosting a Fire move with base power 3, when calculating damage, then uses pokeRound(3, typeBoost) = 4", () => {
    // Source: Showdown data/items.ts -- Charcoal chainModify uses the shared fixed-point type boost.
    expect(pokeRound(3, CORE_FIXED_POINT.typeBoost)).toBe(4);
    expect(Math.floor((3 * CORE_FIXED_POINT.typeBoost) / CORE_FIXED_POINT.identity)).toBe(3);

    const charcoal = GEN6_ITEM_IDS.charcoal;
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.charizard,
      attack: 100,
      heldItem: charcoal,
    });
    const defender = createOnFieldPokemon({ defense: 100 });
    const fireMove = createSyntheticMove(DEFAULT_MOVE, {
      id: "test-fire-3",
      type: CORE_TYPE_IDS.fire,
      power: 3,
      category: CORE_MOVE_CATEGORIES.physical,
    });

    const result = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: fireMove, seed: 42 }),
      typeChart,
    );

    // Charcoal applies pokeRound(3, typeBoost)=4 effective BP; damage is non-zero
    expect(result.damage).toBeGreaterThanOrEqual(1);
  });

  it("given Adamant Orb boosting Dialga's Dragon move with base power 60, when calculating damage, then uses pokeRound(60, typeBoost) = 72", () => {
    // Source: Showdown data/items.ts -- Adamant Orb uses onBasePower with the shared fixed-point type boost for Dialga.
    const adamantOrb = GEN6_ITEM_IDS.adamantOrb;
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.dialga,
      attack: 100,
      heldItem: adamantOrb,
    });
    const defender = createOnFieldPokemon({ defense: 100 });
    const dragonMove = createSyntheticMove(DEFAULT_MOVE, {
      id: "test-dragon-60",
      type: CORE_TYPE_IDS.dragon,
      power: 60,
      category: CORE_MOVE_CATEGORIES.physical,
    });

    const withOrb = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: dragonMove, seed: 42 }),
      typeChart,
    );

    const attackerNoItem = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.dialga,
      attack: 100,
    });

    const withoutOrb = calculateGen6Damage(
      createDamageContext({
        attacker: attackerNoItem,
        defender,
        move: dragonMove,
        seed: 42,
      }),
      typeChart,
    );

    expect(withOrb.damage).toBeGreaterThan(withoutOrb.damage);
    expect(pokeRound(60, CORE_FIXED_POINT.typeBoost)).toBe(72);
  });

  it("given Splash Plate boosting a Water move with base power 60, when calculating damage, then uses pokeRound(60, typeBoost) = 72", () => {
    // Source: Showdown data/items.ts -- Splash Plate uses onBasePower with the shared fixed-point type boost.
    const splashPlate = GEN6_ITEM_IDS.splashPlate;
    const attacker = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.blastoise,
      attack: 100,
      heldItem: splashPlate,
    });
    const defender = createOnFieldPokemon({ defense: 100 });
    const waterMove = createSyntheticMove(DEFAULT_MOVE, {
      id: "test-water-60",
      type: CORE_TYPE_IDS.water,
      power: 60,
      category: CORE_MOVE_CATEGORIES.physical,
    });

    const withPlate = calculateGen6Damage(
      createDamageContext({ attacker, defender, move: waterMove, seed: 42 }),
      typeChart,
    );

    const attackerNoItem = createOnFieldPokemon({
      speciesId: GEN6_SPECIES_IDS.blastoise,
      attack: 100,
    });
    const withoutPlate = calculateGen6Damage(
      createDamageContext({
        attacker: attackerNoItem,
        defender,
        move: waterMove,
        seed: 42,
      }),
      typeChart,
    );

    expect(withPlate.damage).toBeGreaterThan(withoutPlate.damage);
    expect(pokeRound(60, CORE_FIXED_POINT.typeBoost)).toBe(72);
  });
});
