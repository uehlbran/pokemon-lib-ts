import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type { MoveData, PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_MOVE_CATEGORIES,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  createPokemonInstance,
  SeededRandom,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";

/**
 * Gen 3 Counter / Mirror Coat / Destiny Bond / Perish Song Tests
 *
 * Tests for issue #223: Counter, Mirror Coat, Destiny Bond, Perish Song.
 *
 * In Gen 3, physical/special is determined by move TYPE, not move category.
 * Physical types: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel
 * Special types: Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TYPE_IDS = CORE_TYPE_IDS;
const VOLATILE_IDS = CORE_VOLATILE_IDS;
const MOVE_IDS = GEN3_MOVE_IDS;
const SPECIES_IDS = GEN3_SPECIES_IDS;
const DATA = createGen3DataManager();
const DEFAULT_NATURE = DATA.getNature(GEN3_NATURE_IDS.hardy).id;
type DamageCategory = (typeof CORE_MOVE_CATEGORIES)[keyof typeof CORE_MOVE_CATEGORIES] | null;
const DEFAULT_SPECIES_BY_PRIMARY_TYPE: Partial<Record<PokemonType, number>> = {
  [TYPE_IDS.normal]: SPECIES_IDS.rattata,
  [TYPE_IDS.fighting]: SPECIES_IDS.machop,
  [TYPE_IDS.psychic]: SPECIES_IDS.abra,
  [TYPE_IDS.ghost]: SPECIES_IDS.gastly,
} as const;

function createMockRng(intValue = 0) {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => intValue,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

function createSyntheticBattlePokemon(opts: {
  types?: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  ability?: string;
  lastDamageTaken?: number;
  lastDamageCategory?: DamageCategory;
  speciesId?: number;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };
  const speciesId =
    opts.speciesId ?? DEFAULT_SPECIES_BY_PRIMARY_TYPE[opts.types?.[0]] ?? SPECIES_IDS.rattata;
  const species = DATA.getSpecies(speciesId);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(3), {
    nature: DEFAULT_NATURE,
    gender: CORE_GENDERS.male,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    moves: [],
    isShiny: false,
    metLocation: "",
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
  });
  pokemon.nickname = opts.nickname ?? null;
  pokemon.currentHp = opts.currentHp ?? 200;
  pokemon.moves = [];
  pokemon.ability = opts.ability ?? CORE_ABILITY_IDS.none;
  pokemon.heldItem = opts.heldItem ?? null;
  pokemon.status = opts.status ?? null;
  pokemon.calculatedStats = stats;

  return {
    pokemon: pokemon as PokemonInstance,
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
    types: opts.types ?? [...species.types],
    ability: opts.ability ?? pokemon.ability,
    lastMoveUsed: null,
    lastDamageTaken: opts.lastDamageTaken ?? 0,
    lastDamageType: null,
    lastDamageCategory: opts.lastDamageCategory ?? null,
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

function createSyntheticBattleState(attacker: ActivePokemon, defender: ActivePokemon): BattleState {
  return {
    sides: [
      {
        active: [attacker],
        team: [attacker.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
      {
        active: [defender],
        team: [defender.pokemon],
        screens: { reflect: null, lightScreen: null, auroraVeil: null },
        hazards: [],
        tailwind: { active: false, turnsLeft: 0 },
        futureAttack: null,
        faintCount: 0,
        gimmickUsed: false,
        trainer: null,
      },
    ],
    weather: { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createSyntheticMoveContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
): MoveEffectContext {
  const state = createSyntheticBattleState(attacker, defender);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

const dataManager = createGen3DataManager();
const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Counter
// ---------------------------------------------------------------------------

describe("Gen 3 Counter", () => {
  it("given attacker took 50 physical damage, when Counter used, then customDamage = 100 (2x)", () => {
    // Source: pret/pokeemerald — Counter returns 2x physical damage
    // Source: Bulbapedia — "Counter deals damage equal to twice the damage dealt by the
    //   last physical move that hit the user"
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.fighting],
      lastDamageTaken: 50,
      lastDamageCategory: CORE_MOVE_CATEGORIES.physical,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.counter);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 100,
      source: MOVE_IDS.counter,
    });
  });

  it("given attacker took 1 physical damage, when Counter used, then customDamage = 2 (minimum 2x1)", () => {
    // Source: pret/pokeemerald — Counter formula: lastDamageTaken * 2
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.fighting],
      lastDamageTaken: 1,
      lastDamageCategory: CORE_MOVE_CATEGORIES.physical,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.counter);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 2,
      source: MOVE_IDS.counter,
    });
  });

  it("given attacker took special damage only, when Counter used, then it fails", () => {
    // Source: pret/pokeemerald — Counter only responds to physical damage
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.fighting],
      lastDamageTaken: 80,
      lastDamageCategory: CORE_MOVE_CATEGORIES.special,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.counter);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker took no damage, when Counter used, then it fails", () => {
    // Source: pret/pokeemerald — Counter fails if no damage taken
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.fighting],
      lastDamageTaken: 0,
      lastDamageCategory: null,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.counter);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Mirror Coat
// ---------------------------------------------------------------------------

describe("Gen 3 Mirror Coat", () => {
  it("given attacker took 60 special damage, when Mirror Coat used, then customDamage = 120 (2x)", () => {
    // Source: pret/pokeemerald — Mirror Coat returns 2x special damage
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.psychic],
      lastDamageTaken: 60,
      lastDamageCategory: CORE_MOVE_CATEGORIES.special,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.mirrorCoat);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 120,
      source: MOVE_IDS.mirrorCoat,
    });
  });

  it("given attacker took 25 special damage, when Mirror Coat used, then customDamage = 50", () => {
    // Source: pret/pokeemerald — Mirror Coat formula: lastDamageTaken * 2
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.psychic],
      lastDamageTaken: 25,
      lastDamageCategory: CORE_MOVE_CATEGORIES.special,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.mirrorCoat);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toEqual({
      target: "defender",
      amount: 50,
      source: MOVE_IDS.mirrorCoat,
    });
  });

  it("given attacker took physical damage only, when Mirror Coat used, then it fails", () => {
    // Source: pret/pokeemerald — Mirror Coat only responds to special damage
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.psychic],
      lastDamageTaken: 80,
      lastDamageCategory: CORE_MOVE_CATEGORIES.physical,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.mirrorCoat);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given attacker took no damage, when Mirror Coat used, then it fails", () => {
    // Source: pret/pokeemerald — Mirror Coat fails if no damage taken
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.psychic],
      lastDamageTaken: 0,
      lastDamageCategory: null,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.mirrorCoat);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.customDamage).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });
});

// ---------------------------------------------------------------------------
// Destiny Bond
// ---------------------------------------------------------------------------

describe("Gen 3 Destiny Bond", () => {
  it("given attacker uses Destiny Bond, when executeMoveEffect called, then selfVolatileInflicted = destiny-bond", () => {
    // Source: pret/pokeemerald — sets destiny-bond volatile on user
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.ghost],
      speciesId: SPECIES_IDS.gengar,
      nickname: "Gengar",
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.destinyBond);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(VOLATILE_IDS.destinyBond);
    expect(result.messages).toContain("Gengar is trying to take its foe down with it!");
  });

  it("given attacker with no nickname uses Destiny Bond, when executeMoveEffect called, then default name in message", () => {
    // Source: pret/pokeemerald — Destiny Bond message
    const attacker = createSyntheticBattlePokemon({
      types: [TYPE_IDS.ghost],
      speciesId: SPECIES_IDS.gengar,
    });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.destinyBond);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.selfVolatileInflicted).toBe(VOLATILE_IDS.destinyBond);
    expect(result.messages).toContain("The Pokemon is trying to take its foe down with it!");
  });
});

// ---------------------------------------------------------------------------
// Perish Song
// ---------------------------------------------------------------------------

describe("Gen 3 Perish Song", () => {
  it("given neither Pokemon has perish-song, when Perish Song used, then both get perish-song volatile with counter=3", () => {
    // Source: pret/pokeemerald — Perish Song sets 3-turn countdown on both
    // Source: Bulbapedia — "All Pokemon that hear the song will faint in 3 turns
    //   unless they switch out"
    const attacker = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.perishSong);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(VOLATILE_IDS.perishSong);
    expect(result.volatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
    expect(result.selfVolatileInflicted).toBe(VOLATILE_IDS.perishSong);
    expect(result.selfVolatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
    expect(result.messages).toContain("All Pokemon that heard the song will faint in 3 turns!");
  });

  it("given defender already has perish-song, when Perish Song used, then only attacker gets volatile", () => {
    // Source: pret/pokeemerald — already-affected Pokemon are skipped
    const attacker = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    defender.volatileStatuses.set(VOLATILE_IDS.perishSong, { turnsLeft: 2 });
    const move = DATA.getMove(MOVE_IDS.perishSong);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    // Defender already has perish-song, so volatileInflicted should NOT be set
    expect(result.volatileInflicted).toBeNull();
    // Attacker should still get it
    expect(result.selfVolatileInflicted).toBe(VOLATILE_IDS.perishSong);
    expect(result.selfVolatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
  });

  it("given attacker already has perish-song, when Perish Song used, then only defender gets volatile", () => {
    // Source: pret/pokeemerald — already-affected Pokemon are skipped
    const attacker = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    attacker.volatileStatuses.set(VOLATILE_IDS.perishSong, { turnsLeft: 1 });
    const defender = createSyntheticBattlePokemon({ types: [TYPE_IDS.normal] });
    const move = DATA.getMove(MOVE_IDS.perishSong);
    const context = createSyntheticMoveContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.volatileInflicted).toBe(VOLATILE_IDS.perishSong);
    expect(result.volatileData).toEqual({ turnsLeft: 3, data: { counter: 3 } });
    // Attacker already has it
    expect(result.selfVolatileInflicted).toBeUndefined();
  });
});
