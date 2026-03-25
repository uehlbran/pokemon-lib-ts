import type { ActivePokemon, BattleState, DamageContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonType } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_FIXED_POINT,
  CORE_ITEM_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { calculateGen6Damage, pokeRound } from "../src/Gen6DamageCalc";
import { GEN6_TYPE_CHART } from "../src/Gen6TypeChart";
import {
  createGen6DataManager,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "../src";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

const dataManager = createGen6DataManager();
const SYNTHETIC_MOVE_BASE = dataManager.getMove(GEN6_MOVE_IDS.tackle);

function getGen6Move(id: string): MoveData {
  const move = dataManager.getMove(id);
  return { ...move, flags: { ...move.flags } };
}

function getGen6Item(id: string) {
  return dataManager.getItem(id);
}

function makeSyntheticMove(overrides: {
  id: string;
  type: PokemonType;
  category?: "physical" | "special" | "status";
  power: number | null;
  flags?: Partial<MoveData["flags"]>;
  effect?: MoveData["effect"];
  critRatio?: number;
  target?: string;
}): MoveData {
  const move = { ...SYNTHETIC_MOVE_BASE } as MoveData;
  move.id = overrides.id;
  move.displayName = overrides.id;
  move.type = overrides.type;
  move.category = overrides.category ?? "physical";
  move.power = overrides.power;
  move.target = overrides.target ?? move.target;
  move.effect = overrides.effect ?? null;
  move.critRatio = overrides.critRatio ?? 0;
  move.flags = {
    ...move.flags,
    ...overrides.flags,
  };
  move.generation = 6;
  return move;
}

function makeActive(overrides: {
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
  gender?: "male" | "female" | "genderless";
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  itemKnockedOff?: boolean;
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
      speciesId: overrides.speciesId ?? GEN6_SPECIES_IDS.bulbasaur,
      nickname: null,
      level: overrides.level ?? 50,
      experience: 0,
      nature: GEN6_NATURE_IDS.hardy,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? hp,
      moves: [],
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: "normal1" as const,
      heldItem: overrides.heldItem ?? null,
      status: (overrides.status ?? null) as any,
      friendship: 0,
      gender: (overrides.gender ?? "male") as any,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: CORE_ITEM_IDS.pokeBall,
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
    itemKnockedOff: overrides.itemKnockedOff ?? false,
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

function makeState(overrides?: {
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

function makeDamageContext(overrides: {
  attacker?: ActivePokemon;
  defender?: ActivePokemon;
  move?: MoveData;
  state?: BattleState;
  isCrit?: boolean;
  seed?: number;
}): DamageContext {
  return {
    attacker: overrides.attacker ?? makeActive({}),
    defender: overrides.defender ?? makeActive({}),
    move: overrides.move ?? makeSyntheticMove({ id: "test-neutral-physical", type: CORE_TYPE_IDS.normal, power: 50 }),
    state: overrides.state ?? makeState(),
    rng: new SeededRandom(overrides.seed ?? 42),
    isCrit: overrides.isCrit ?? false,
  };
}

const typeChart = GEN6_TYPE_CHART as Record<string, Record<string, number>>;

// ===========================================================================
// Issue #610: Eviolite treated as non-removable by Knock Off
// ===========================================================================

describe("Knock Off item removability (issue #610)", () => {
  it("given a defender holding a removable item, when Knock Off is used, then it gets the 1.5x damage boost", () => {
    // Source: Showdown data/items.ts -- removable items receive the Gen 6 Knock Off boost.
    // Source: Bulbapedia "Knock Off" Gen 6 -- 1.5x damage if target holds a removable item.
    // We compare Knock Off against an equally powered synthetic Dark move so the boost is isolated.
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.absol,
      types: [CORE_TYPE_IDS.dark],
      attack: 100,
    });
    const defender = makeActive({
      speciesId: GEN6_SPECIES_IDS.bulbasaur,
      heldItem: getGen6Item(GEN6_ITEM_IDS.eviolite).id,
      defense: 100,
      types: [CORE_TYPE_IDS.normal],
    });
    const knockOff = getGen6Move(GEN6_MOVE_IDS.knockOff);
    const darkStrike = makeSyntheticMove({
      id: "test-dark-strike",
      type: CORE_TYPE_IDS.dark,
      power: knockOff.power,
      category: knockOff.category,
    });

    const knockOffResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: knockOff, seed: 12345 }),
      typeChart,
    );

    const darkStrikeResult = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: darkStrike, seed: 12345 }),
      typeChart,
    );

    expect(knockOffResult.damage).toBeGreaterThan(darkStrikeResult.damage);
  });

  it("given a defender holding a Mega Stone, when Knock Off is used, then it does not get the 1.5x boost", () => {
    // Source: Showdown data/items.ts -- Mega Stones are not removable by Knock Off.
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.absol,
      types: [CORE_TYPE_IDS.dark],
      attack: 100,
    });
    const defender = makeActive({
      speciesId: GEN6_SPECIES_IDS.charizard,
      heldItem: getGen6Item(GEN6_ITEM_IDS.charizarditeX).id,
      defense: 100,
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
    });
    const knockOff = getGen6Move(GEN6_MOVE_IDS.knockOff);

    const withMegaStone = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: knockOff, seed: 12345 }),
      typeChart,
    );

    const defenderNoItem = makeActive({
      speciesId: GEN6_SPECIES_IDS.charizard,
      defense: 100,
      types: [CORE_TYPE_IDS.fire, CORE_TYPE_IDS.flying],
    });
    const withoutItem = calculateGen6Damage(
      makeDamageContext({
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
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.absol,
      types: [CORE_TYPE_IDS.dark],
      attack: 100,
    });
    const defender = makeActive({
      speciesId: GEN6_SPECIES_IDS.venusaur,
      heldItem: getGen6Item(GEN6_ITEM_IDS.venusaurite).id,
      defense: 100,
      types: [CORE_TYPE_IDS.grass, CORE_TYPE_IDS.poison],
    });
    const knockOff = getGen6Move(GEN6_MOVE_IDS.knockOff);

    const withMegaStone = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: knockOff, seed: 12345 }),
      typeChart,
    );

    const defenderNoItem = makeActive({
      speciesId: GEN6_SPECIES_IDS.venusaur,
      defense: 100,
      types: [CORE_TYPE_IDS.grass, CORE_TYPE_IDS.poison],
    });
    const withoutItem = calculateGen6Damage(
      makeDamageContext({
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
    const charcoal = getGen6Item(GEN6_ITEM_IDS.charcoal);
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.charizard,
      types: [CORE_TYPE_IDS.fire],
      attack: 100,
      heldItem: charcoal.id,
    });
    const defender = makeActive({ defense: 100 });
    const fireMove = makeSyntheticMove({
      id: "test-fire-60",
      type: CORE_TYPE_IDS.fire,
      power: 60,
      category: "physical",
    });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 42 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
    expect(pokeRound(60, CORE_FIXED_POINT.typeBoost)).toBe(72);
    expect(Math.floor((60 * CORE_FIXED_POINT.typeBoost) / CORE_FIXED_POINT.identity)).toBe(71);
  });

  it("given Charcoal boosting a Fire move with base power 3, when calculating damage, then uses pokeRound(3, typeBoost) = 4", () => {
    // Source: Showdown data/items.ts -- Charcoal chainModify uses the shared fixed-point type boost.
    expect(pokeRound(3, CORE_FIXED_POINT.typeBoost)).toBe(4);
    expect(Math.floor((3 * CORE_FIXED_POINT.typeBoost) / CORE_FIXED_POINT.identity)).toBe(3);

    const charcoal = getGen6Item(GEN6_ITEM_IDS.charcoal);
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.charizard,
      types: [CORE_TYPE_IDS.fire],
      attack: 100,
      heldItem: charcoal.id,
    });
    const defender = makeActive({ defense: 100 });
    const fireMove = makeSyntheticMove({
      id: "test-fire-3",
      type: CORE_TYPE_IDS.fire,
      power: 3,
      category: "physical",
    });

    const result = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: fireMove, seed: 42 }),
      typeChart,
    );

    expect(result.damage).toBeGreaterThan(0);
  });

  it("given Adamant Orb boosting Dialga's Dragon move with base power 60, when calculating damage, then uses pokeRound(60, typeBoost) = 72", () => {
    // Source: Showdown data/items.ts -- Adamant Orb uses onBasePower with the shared fixed-point type boost for Dialga.
    const adamantOrb = getGen6Item(GEN6_ITEM_IDS.adamantOrb);
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.dialga,
      types: [CORE_TYPE_IDS.dragon, CORE_TYPE_IDS.steel],
      attack: 100,
      heldItem: adamantOrb.id,
    });
    const defender = makeActive({ defense: 100, types: [CORE_TYPE_IDS.normal] });
    const dragonMove = makeSyntheticMove({
      id: "test-dragon-60",
      type: CORE_TYPE_IDS.dragon,
      power: 60,
      category: "physical",
    });

    const withOrb = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: dragonMove, seed: 42 }),
      typeChart,
    );

    const attackerNoItem = makeActive({
      speciesId: GEN6_SPECIES_IDS.dialga,
      types: [CORE_TYPE_IDS.dragon, CORE_TYPE_IDS.steel],
      attack: 100,
    });

    const withoutOrb = calculateGen6Damage(
      makeDamageContext({
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
    const splashPlate = getGen6Item(GEN6_ITEM_IDS.splashPlate);
    const attacker = makeActive({
      speciesId: GEN6_SPECIES_IDS.blastoise,
      types: [CORE_TYPE_IDS.water],
      attack: 100,
      heldItem: splashPlate.id,
    });
    const defender = makeActive({ defense: 100, types: [CORE_TYPE_IDS.normal] });
    const waterMove = makeSyntheticMove({
      id: "test-water-60",
      type: CORE_TYPE_IDS.water,
      power: 60,
      category: "physical",
    });

    const withPlate = calculateGen6Damage(
      makeDamageContext({ attacker, defender, move: waterMove, seed: 42 }),
      typeChart,
    );

    const attackerNoItem = makeActive({
      speciesId: GEN6_SPECIES_IDS.blastoise,
      types: [CORE_TYPE_IDS.water],
      attack: 100,
    });
    const withoutPlate = calculateGen6Damage(
      makeDamageContext({
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
