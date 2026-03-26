import type { ActivePokemon, BattleState, MoveEffectContext } from "@pokemon-lib-ts/battle";
import type {
  MoveData,
  PokemonInstance,
  PokemonType,
  StatBlock,
  WeatherType,
} from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_END_OF_TURN_EFFECT_IDS,
  CORE_GENDERS,
  CORE_TYPE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_ITEM_IDS,
  GEN3_MOVE_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
} from "../../src";

/**
 * Gen 3 New Move Handler Tests
 *
 * Tests for issue #225: Whirlwind/Roar, Trick, Morning Sun/Synthesis/Moonlight,
 * and Explosion/Self-Destruct defense halving.
 * Also tests the getEndOfTurnOrder() override.
 *
 * Source: pret/pokeemerald src/battle_script_commands.c
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function createActivePokemon(opts: {
  types: PokemonType[];
  status?: string | null;
  heldItem?: string | null;
  nickname?: string | null;
  currentHp?: number;
  ability?: string;
}): ActivePokemon {
  const stats: StatBlock = {
    hp: 300,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test-mon",
    speciesId: GEN3_SPECIES_IDS.bulbasaur,
    nickname: opts.nickname ?? null,
    level: 50,
    experience: 0,
    nature: GEN3_NATURE_IDS.hardy,
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: opts.currentHp ?? 300,
    moves: [],
    ability: opts.ability ?? "",
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: opts.heldItem ?? null,
    status: opts.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
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
    types: opts.types,
    ability: opts.ability ?? "",
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

const dataManager = createGen3DataManager();

function getGen3Move(moveId: string): MoveData {
  return dataManager.getMove(moveId);
}

const END_OF_TURN = {
  weatherDamage: CORE_END_OF_TURN_EFFECT_IDS.weatherDamage,
  futureAttack: CORE_END_OF_TURN_EFFECT_IDS.futureAttack,
  wish: CORE_END_OF_TURN_EFFECT_IDS.wish,
  weatherHealing: CORE_END_OF_TURN_EFFECT_IDS.weatherHealing,
  statBoostingItems: CORE_END_OF_TURN_EFFECT_IDS.statBoostingItems,
  statusDamage: CORE_END_OF_TURN_EFFECT_IDS.statusDamage,
  encoreCountdown: CORE_END_OF_TURN_EFFECT_IDS.encoreCountdown,
  disableCountdown: CORE_END_OF_TURN_EFFECT_IDS.disableCountdown,
  tauntCountdown: CORE_END_OF_TURN_EFFECT_IDS.tauntCountdown,
  weatherCountdown: CORE_END_OF_TURN_EFFECT_IDS.weatherCountdown,
};

const MOVE_IDS = {
  bind: GEN3_MOVE_IDS.bind,
  curse: GEN3_MOVE_IDS.curse,
  ingrain: GEN3_MOVE_IDS.ingrain,
  leechSeed: GEN3_MOVE_IDS.leechSeed,
  nightmare: GEN3_MOVE_IDS.nightmare,
  perishSong: GEN3_MOVE_IDS.perishSong,
  uproar: GEN3_MOVE_IDS.uproar,
};

const ABILITY_IDS = {
  shedSkin: GEN3_ABILITY_IDS.shedSkin,
  speedBoost: GEN3_ABILITY_IDS.speedBoost,
};

function createBattleState(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  weather: { type: WeatherType | null; turnsLeft: number; source: string | null } | null = null,
): BattleState {
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
    weather: weather ?? { type: null, turnsLeft: 0, source: null },
    terrain: { type: null, turnsLeft: 0, source: null },
    trickRoom: { active: false, turnsLeft: 0 },
    turnNumber: 1,
    phase: "action-select" as const,
    winner: null,
    ended: false,
  } as BattleState;
}

function createContext(
  attacker: ActivePokemon,
  defender: ActivePokemon,
  move: MoveData,
  damage: number,
  rng: ReturnType<typeof createMockRng>,
  weather: { type: WeatherType | null; turnsLeft: number; source: string | null } | null = null,
): MoveEffectContext {
  const state = createBattleState(attacker, defender, weather);
  return { attacker, defender, move, damage, state, rng } as MoveEffectContext;
}

const ruleset = new Gen3Ruleset(dataManager);

// ---------------------------------------------------------------------------
// Whirlwind / Roar
// ---------------------------------------------------------------------------

describe("Gen 3 Whirlwind / Roar", () => {
  it("given defender without Suction Cups, when Whirlwind used, then switchOut = true", () => {
    // Source: pret/pokeemerald — Whirlwind forces switch
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.whirlwind);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });

  it("given defender without Suction Cups, when Roar used, then switchOut = true", () => {
    // Source: pret/pokeemerald — Roar forces switch
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.roar);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(true);
  });

  it("given defender has Suction Cups, when Whirlwind used, then switchOut = false", () => {
    // Source: pret/pokeemerald — ABILITY_SUCTION_CUPS blocks phazing
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.rock],
      ability: GEN3_ABILITY_IDS.suctionCups,
      nickname: "Octillery",
    });
    const move = getGen3Move(GEN3_MOVE_IDS.whirlwind);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(false);
    expect(result.messages).toContain("Octillery anchored itself with Suction Cups!");
  });

  it("given defender has Suction Cups, when Roar used, then switchOut = false", () => {
    // Source: pret/pokeemerald — ABILITY_SUCTION_CUPS blocks phazing
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.water],
      ability: GEN3_ABILITY_IDS.suctionCups,
    });
    const move = getGen3Move(GEN3_MOVE_IDS.roar);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.switchOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Trick
// ---------------------------------------------------------------------------

describe("Gen 3 Trick", () => {
  it("given both have items, when Trick used, then itemTransfer from attacker to defender", () => {
    // Source: pret/pokeemerald — Trick swaps held items
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      heldItem: GEN3_ITEM_IDS.choiceBand,
      nickname: "Alakazam",
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.normal],
      heldItem: GEN3_ITEM_IDS.leftovers,
    });
    const move = getGen3Move(GEN3_MOVE_IDS.trick);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "attacker", to: "defender" });
    expect(result.messages).toContain("Alakazam switched items with its target!");
  });

  it("given attacker has item but defender has none, when Trick used, then itemTransfer succeeds", () => {
    // Source: pret/pokeemerald — Trick works as long as at least one has an item
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      heldItem: GEN3_ITEM_IDS.choiceBand,
    });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.trick);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toEqual({ from: "attacker", to: "defender" });
  });

  it("given neither has items, when Trick used, then it fails", () => {
    // Source: pret/pokeemerald — Trick fails if neither has an item
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.psychic] });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.trick);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
    expect(result.messages).toContain("But it failed!");
  });

  it("given defender has Sticky Hold, when Trick used, then it fails", () => {
    // Source: pret/pokeemerald — Sticky Hold blocks item transfer
    const attacker = createActivePokemon({
      types: [CORE_TYPE_IDS.psychic],
      heldItem: GEN3_ITEM_IDS.choiceBand,
    });
    const defender = createActivePokemon({
      types: [CORE_TYPE_IDS.poison],
      ability: GEN3_ABILITY_IDS.stickyHold,
      heldItem: GEN3_ITEM_IDS.leftovers,
      nickname: "Muk",
    });
    const move = getGen3Move(GEN3_MOVE_IDS.trick);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.itemTransfer).toBeUndefined();
    expect(result.messages).toContain("Muk's Sticky Hold prevents item transfer!");
  });
});

// ---------------------------------------------------------------------------
// Morning Sun / Synthesis / Moonlight
// ---------------------------------------------------------------------------

describe("Gen 3 Morning Sun / Synthesis / Moonlight", () => {
  it("given no weather, when Morning Sun used, then healAmount = floor(maxHp * 1/2) = 150", () => {
    // Source: pret/pokeemerald — No weather: 1/2 maxHP recovery
    // Source: Bulbapedia — "Heals 50% HP normally"
    // floor(300 * 1/2) = 150
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], currentHp: 100 });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.morningSun);
    const context = createContext(attacker, defender, move, 0, createMockRng());

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(150);
  });

  it("given sun weather, when Synthesis used, then healAmount = floor(maxHp * 2/3) = 200", () => {
    // Source: pret/pokeemerald — Sun: 2/3 maxHP recovery
    // Source: Bulbapedia — "Heals 2/3 HP in sun"
    // floor(300 * 2/3) = floor(200) = 200
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.grass], currentHp: 50 });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.synthesis);
    const weather = { type: CORE_WEATHER_IDS.sun, turnsLeft: 3, source: GEN3_MOVE_IDS.sunnyDay };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(200);
  });

  it("given rain weather, when Moonlight used, then healAmount = floor(maxHp * 1/4) = 75", () => {
    // Source: pret/pokeemerald — Rain/Sand/Hail: 1/4 maxHP recovery
    // Source: Bulbapedia — "Heals 25% HP in rain, sand, or hail"
    // floor(300 * 1/4) = 75
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.fairy], currentHp: 50 });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.moonlight);
    const weather = { type: CORE_WEATHER_IDS.rain, turnsLeft: 3, source: GEN3_MOVE_IDS.rainDance };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });

  it("given sand weather, when Morning Sun used, then healAmount = floor(maxHp * 1/4) = 75", () => {
    // Source: pret/pokeemerald — Sand: 1/4 maxHP recovery
    // floor(300 * 1/4) = 75
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.normal], currentHp: 50 });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.morningSun);
    const weather = { type: CORE_WEATHER_IDS.sand, turnsLeft: 3, source: GEN3_MOVE_IDS.sandstorm };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });

  it("given hail weather, when Synthesis used, then healAmount = floor(maxHp * 1/4) = 75", () => {
    // Source: pret/pokeemerald — Hail: 1/4 maxHP recovery
    // floor(300 * 1/4) = 75
    const attacker = createActivePokemon({ types: [CORE_TYPE_IDS.grass], currentHp: 50 });
    const defender = createActivePokemon({ types: [CORE_TYPE_IDS.normal] });
    const move = getGen3Move(GEN3_MOVE_IDS.synthesis);
    const weather = { type: CORE_WEATHER_IDS.hail, turnsLeft: 3, source: GEN3_MOVE_IDS.hail };
    const context = createContext(attacker, defender, move, 0, createMockRng(), weather);

    const result = ruleset.executeMoveEffect(context);

    expect(result.healAmount).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// getEndOfTurnOrder
// ---------------------------------------------------------------------------

describe("Gen 3 getEndOfTurnOrder", () => {
  it("given Gen3Ruleset, when getEndOfTurnOrder called, then returns Gen 3 specific EoT sequence", () => {
    // Source: pret/pokeemerald src/battle_main.c — end-of-turn phase ordering
    const order = ruleset.getEndOfTurnOrder();

    // Verify weather-damage comes first
    expect(order[0]).toBe(END_OF_TURN.weatherDamage);

    // Verify perish-song comes before speed-boost
    const perishIdx = order.indexOf(MOVE_IDS.perishSong);
    const speedBoostIdx = order.indexOf(ABILITY_IDS.speedBoost);
    expect(perishIdx).toBeGreaterThan(-1);
    expect(speedBoostIdx).toBeGreaterThan(-1);
    expect(perishIdx).toBeLessThan(speedBoostIdx);

    // Verify weather-countdown comes last
    expect(order[order.length - 1]).toBe(END_OF_TURN.weatherCountdown);

    // Verify total count matches expected (20 items: original 16 + wish + ingrain + uproar + stat-boosting-items)
    expect(order).toHaveLength(20);

    // Verify key effects are present
    expect(order).toContain(END_OF_TURN.futureAttack);
    expect(order).toContain(END_OF_TURN.wish);
    expect(order).toContain(END_OF_TURN.weatherHealing);
    expect(order).toContain(GEN3_ITEM_IDS.leftovers);
    expect(order).toContain(MOVE_IDS.ingrain);
    expect(order).toContain(END_OF_TURN.statusDamage);
    expect(order).toContain(MOVE_IDS.leechSeed);
    expect(order).toContain(MOVE_IDS.curse);
    expect(order).toContain(MOVE_IDS.bind);
    expect(order).toContain(END_OF_TURN.statBoostingItems);
    expect(order).toContain(END_OF_TURN.encoreCountdown);
    expect(order).toContain(END_OF_TURN.disableCountdown);
    expect(order).toContain(END_OF_TURN.tauntCountdown);
    expect(order).toContain(ABILITY_IDS.shedSkin);

    // Verify uproar is present between perish-song and speed-boost
    // Source: pret/pokeemerald src/battle_main.c — Uproar processing in end-of-turn loop
    // Source: Spec 04-gen3.md line 1038 — "13. Uproar wake-up check"
    const uproarIdx = order.indexOf(MOVE_IDS.uproar);
    expect(uproarIdx).toBeGreaterThan(-1);
    expect(uproarIdx).toBeGreaterThan(perishIdx);
    expect(uproarIdx).toBeLessThan(speedBoostIdx);
  });

  it("given Gen3Ruleset, when getEndOfTurnOrder called, then status-damage comes before leech-seed", () => {
    // Source: pret/pokeemerald — burn/poison damage resolves before leech seed
    const order = ruleset.getEndOfTurnOrder();
    const statusIdx = order.indexOf(END_OF_TURN.statusDamage);
    const leechIdx = order.indexOf(MOVE_IDS.leechSeed);
    expect(statusIdx).toBeLessThan(leechIdx);
  });
});
