import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import { createOnFieldPokemon as createBattleOnFieldPokemon } from "@pokemon-lib-ts/battle/utils";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_NATURE_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
  createEvs,
  createIvs,
  createPokemonInstance,
  type Gender,
  type MoveData,
  type PokemonInstance,
  type PokemonType,
  type PrimaryStatus,
  SeededRandom,
  type WeatherType,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { createGen4DataManager } from "../src/data";
import {
  GEN4_ABILITY_IDS,
  GEN4_ITEM_IDS,
  GEN4_MOVE_IDS,
  GEN4_SPECIES_IDS,
} from "../src/data/reference-ids";
import { applyGen4Ability } from "../src/Gen4Abilities";

/**
 * Gen 4 Ability Tests
 *
 * Tests cover:
 *   on-switch-in: Intimidate, Drizzle, Drought, Sand Stream, Snow Warning,
 *                 Download, Anticipation, Forewarn, Frisk, Slow Start
 *   on-turn-end: Speed Boost, Rain Dish, Ice Body, Dry Skin, Solar Power,
 *                Hydration, Shed Skin, Bad Dreams, Poison Heal
 *
 * Source: Showdown sim/battle.ts Gen 4 mod — ability trigger dispatch
 * Source: Bulbapedia — individual ability mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const dataManager = createGen4DataManager();
const defaultSpecies = dataManager.getSpecies(GEN4_SPECIES_IDS.bulbasaur);
const abilityIds = { ...CORE_ABILITY_IDS, ...GEN4_ABILITY_IDS } as const;
const itemIds = { ...CORE_ITEM_IDS, ...GEN4_ITEM_IDS } as const;
const abilityTriggers = CORE_ABILITY_TRIGGER_IDS;

function createSyntheticPokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createPokemonInstance(species, 50, new SeededRandom(4 + species.id), {
    nature: CORE_NATURE_IDS.hardy,
    ivs: createIvs(),
    evs: createEvs(),
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    gender: overrides.gender ?? CORE_GENDERS.male,
    heldItem: overrides.heldItem ?? null,
    friendship: species.baseFriendship,
    metLocation: "test",
    originalTrainer: "Test",
    originalTrainerId: 0,
    pokeball: itemIds.pokeBall,
  });
  pokemon.nickname = overrides.nickname ?? null;
  pokemon.currentHp = overrides.currentHp ?? maxHp;
  pokemon.ability = overrides.ability ?? abilityIds.none;
  pokemon.heldItem = overrides.heldItem ?? null;
  pokemon.status = overrides.status ?? null;
  pokemon.calculatedStats = {
    hp: maxHp,
    attack: 100,
    defense: overrides.defense ?? 100,
    spAttack: 100,
    spDefense: overrides.spDefense ?? 100,
    speed: 100,
  };
  return pokemon;
}

function createSyntheticOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  defense?: number;
  spDefense?: number;
  gender?: Gender;
  turnsOnField?: number;
}) {
  const species = dataManager.getSpecies(overrides.speciesId ?? defaultSpecies.id);
  const pokemon = createSyntheticPokemonInstance({
    ability: overrides.ability,
    speciesId: overrides.speciesId,
    nickname: overrides.nickname,
    status: overrides.status,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    heldItem: overrides.heldItem,
    defense: overrides.defense,
    spDefense: overrides.spDefense,
    gender: overrides.gender,
  });
  const activePokemon = createBattleOnFieldPokemon(
    pokemon,
    0,
    overrides.types ?? [...(species.types as PokemonType[])],
  );
  activePokemon.ability = overrides.ability ?? abilityIds.none;
  activePokemon.turnsOnField = overrides.turnsOnField ?? 0;
  return {
    ...activePokemon,
    types: overrides.types ?? [...(species.types as PokemonType[])],
  };
}

function createBattleSide(index: 0 | 1): BattleSide {
  return {
    index,
    trainer: null,
    team: [],
    active: [],
    hazards: [],
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
  };
}

function createBattleState(weather?: {
  type: WeatherType;
  turnsLeft: number;
  source: string;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [createBattleSide(0), createBattleSide(1)],
    weather: weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: new SeededRandom(4),
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function createCanonicalMoveForType(type: PokemonType): MoveData {
  switch (type) {
    case CORE_TYPE_IDS.normal:
      return dataManager.getMove(GEN4_MOVE_IDS.tackle);
    case CORE_TYPE_IDS.water:
      return dataManager.getMove(GEN4_MOVE_IDS.surf);
    case CORE_TYPE_IDS.fire:
      return dataManager.getMove(GEN4_MOVE_IDS.flamethrower);
    case CORE_TYPE_IDS.electric:
      return dataManager.getMove(GEN4_MOVE_IDS.thunderbolt);
    case CORE_TYPE_IDS.ground:
      return dataManager.getMove(GEN4_MOVE_IDS.earthquake);
    default:
      throw new Error(`No canonical Gen 4 move fixture configured for type ${type}`);
  }
}

function createAbilityContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof createSyntheticOnFieldPokemon>;
  weather?: { type: WeatherType; turnsLeft: number; source: string };
  status?: PrimaryStatus | null;
  currentHp?: number;
  maxHp?: number;
  defense?: number;
  spDefense?: number;
  rngChance?: boolean;
  rngNextValues?: number[];
  move?: MoveData;
  gender?: Gender;
  turnsOnField?: number;
}): AbilityContext {
  const state = createBattleState(opts.weather);
  const pokemon = createSyntheticOnFieldPokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    defense: opts.defense,
    spDefense: opts.spDefense,
    gender: opts.gender,
    turnsOnField: opts.turnsOnField,
  });

  // If rngNextValues is provided, return them in sequence; otherwise always return 0
  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: abilityTriggers.onSwitchIn,
    move: opts.move,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
      int: () => 1,
      chance: (_p: number) => opts.rngChance ?? false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ---------------------------------------------------------------------------
// on-switch-in: weather setters
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Drizzle", () => {
  it("given Drizzle, when Pokemon switches in, then sets rain weather with -1 turns (permanent)", () => {
    // Source: Showdown Gen 4 mod — Drizzle sets permanent rain on switch-in (Gen 4: no turn limit)
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.drizzle });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: CORE_WEATHER_IDS.rain,
      weatherTurns: -1,
    });
  });

  it("given Drizzle, when Pokemon switches in, then message mentions rain", () => {
    // Source: Showdown Gen 4 mod — Drizzle message text
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.drizzle });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.messages[0]).toContain(CORE_WEATHER_IDS.rain);
  });
});

describe("applyGen4Ability on-switch-in — Drought", () => {
  it("given Drought, when Pokemon switches in, then sets sun weather with -1 turns (permanent)", () => {
    // Source: Showdown Gen 4 mod — Drought sets permanent sun on switch-in
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.drought });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: CORE_WEATHER_IDS.sun,
      weatherTurns: -1,
    });
  });
});

describe("applyGen4Ability on-switch-in — Sand Stream", () => {
  it("given Sand Stream, when Pokemon switches in, then sets sandstorm weather with -1 turns (permanent)", () => {
    // Source: Showdown Gen 4 mod — Sand Stream sets permanent sandstorm on switch-in
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.sandStream });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: CORE_WEATHER_IDS.sand,
      weatherTurns: -1,
    });
  });
});

describe("applyGen4Ability on-switch-in — Snow Warning (NEW in Gen 4)", () => {
  it("given Snow Warning, when Pokemon switches in, then sets hail weather with -1 turns (permanent)", () => {
    // Source: Bulbapedia — Snow Warning introduced in Gen 4 with Abomasnow; sets permanent hail
    // Source: Showdown Gen 4 mod — Snow Warning trigger
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.snowWarning });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "weather-set",
      weather: CORE_WEATHER_IDS.hail,
      weatherTurns: -1,
    });
  });

  it("given Snow Warning, when Pokemon switches in, then message mentions hail", () => {
    // Source: Showdown Gen 4 mod — Snow Warning message text
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.snowWarning });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.messages[0]).toContain(CORE_WEATHER_IDS.hail);
  });
});

// ---------------------------------------------------------------------------
// on-switch-in: Intimidate
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Intimidate", () => {
  it("given Intimidate and an opponent present, when Pokemon switches in, then lowers opponent Attack by 1 stage", () => {
    // Source: Showdown Gen 4 mod — Intimidate lowers opponent's Attack -1 on switch-in
    const opponent = createSyntheticOnFieldPokemon({
      ability: abilityIds.none,
      speciesId: GEN4_SPECIES_IDS.ivysaur,
    });
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.intimidate, opponent });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "opponent",
      stat: "attack",
      stages: -1,
    });
  });

  it("given Intimidate and no opponent present, when Pokemon switches in, then does not activate", () => {
    // Source: Showdown Gen 4 mod — Intimidate requires an opponent to lower
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.intimidate });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-switch-in: Download (NEW in Gen 4)
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Download (NEW in Gen 4)", () => {
  it("given Download and foe's Def < foe's SpDef, when Pokemon switches in, then raises Attack by 1", () => {
    // Source: Bulbapedia — Download: raises Attack if foe Def < SpDef
    // Source: Showdown Gen 4 mod — Download trigger
    // Derivation: foe has Def=80, SpDef=100 → 80 < 100 → +1 Atk
    const opponent = createSyntheticOnFieldPokemon({ defense: 80, spDefense: 100 });
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.download, opponent });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "attack",
      stages: 1,
    });
  });

  it("given Download and foe's Def >= foe's SpDef, when Pokemon switches in, then raises SpAtk by 1", () => {
    // Source: Bulbapedia — Download: raises SpAtk if foe Def >= SpDef
    // Derivation: foe has Def=100, SpDef=80 → 100 >= 80 → +1 SpAtk
    const opponent = createSyntheticOnFieldPokemon({ defense: 100, spDefense: 80 });
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.download, opponent });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "spAttack",
      stages: 1,
    });
  });

  it("given Download and equal Def = SpDef, when Pokemon switches in, then raises SpAtk (not Attack)", () => {
    // Source: Bulbapedia — Download raises SpAtk when Def >= SpDef (equal counts as >=)
    // Derivation: foe has Def=100, SpDef=100 → 100 >= 100 → +1 SpAtk
    const opponent = createSyntheticOnFieldPokemon({ defense: 100, spDefense: 100 });
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.download, opponent });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      stat: "spAttack",
      stages: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// on-switch-in: informational abilities
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-switch-in — Anticipation", () => {
  it("given Anticipation without DataManager, when Pokemon switches in, then does not activate", () => {
    // Anticipation requires DataManager to scan opponent moves; without one it returns false
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.anticipation });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-switch-in — Forewarn", () => {
  it("given Forewarn without DataManager, when Pokemon switches in, then does not activate", () => {
    // Forewarn requires DataManager to scan opponent moves; without one it returns false
    const opponent = createSyntheticOnFieldPokemon({ speciesId: GEN4_SPECIES_IDS.ivysaur });
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.forewarn, opponent });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Forewarn with no opponent, when Pokemon switches in, then does not activate", () => {
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.forewarn });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
  });
});

describe("applyGen4Ability on-switch-in — Frisk", () => {
  it("given Frisk and an opponent holding an item, when Pokemon switches in, then activates and reveals the item", () => {
    // Source: Bulbapedia — Frisk: reveals foe's held item on switch-in (informational)
    const opponent = createSyntheticOnFieldPokemon({
      heldItem: CORE_ITEM_IDS.leftovers,
      speciesId: GEN4_SPECIES_IDS.ivysaur,
    });
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.frisk, opponent });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(CORE_ITEM_IDS.leftovers);
  });
});

describe("applyGen4Ability on-switch-in — Slow Start", () => {
  it("given Slow Start, when Pokemon switches in, then sets slow-start volatile with 5 turns and a message", () => {
    // Source: Bulbapedia — Slow Start: halves Attack and Speed for 5 turns after switch-in
    // Source: Showdown Gen 4 mod — Slow Start counter initialized on switch-in
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.slowStart });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "volatile-inflict",
      target: "self",
      volatile: GEN4_ABILITY_IDS.slowStart,
      data: { turnsLeft: 5 },
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("Slow Start");
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Speed Boost
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Speed Boost", () => {
  it("given Speed Boost on first turn (turnsOnField=0), when turn ends, then does NOT activate (first-turn skip)", () => {
    // Source: pret/pokeplatinum src/battle/battle_lib.c:3555-3558 — Speed Boost:
    //   fakeOutTurnNumber != totalTurns + 1 — does NOT activate on the first turn
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.speedBoost, turnsOnField: 0 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given Speed Boost on second turn (turnsOnField=1), when turn ends, then raises Speed by 1 stage", () => {
    // Source: pret/pokeplatinum src/battle/battle_lib.c:3555-3558 — Speed Boost
    //   activates from turn 2 onward
    // Source: Bulbapedia — Speed Boost: raises Speed by 1 at end of each turn
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.speedBoost, turnsOnField: 1 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Speed Boost on second turn, when turn ends, then message mentions Speed Boost", () => {
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.speedBoost, turnsOnField: 1 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.messages[0]).toContain("Speed Boost");
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Rain Dish
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Rain Dish", () => {
  it("given Rain Dish and active rain, when turn ends, then activates with heal effect type and 1/16 max HP value", () => {
    // Source: Bulbapedia — Rain Dish: restores 1/16 HP in rain each turn
    // Derivation: maxHp=160, floor(160/16) = 10
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.rainDish,
      maxHp: 160,
      currentHp: 100,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN4_MOVE_IDS.rainDance },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(10);
    expect(result.messages[0]).toContain("Rain Dish");
  });

  it("given Rain Dish and no rain, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Rain Dish only activates in rain
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.rainDish, maxHp: 160 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Ice Body
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Ice Body (NEW in Gen 4)", () => {
  it("given Ice Body and active hail, when turn ends, then activates with heal effect type and 1/16 max HP value", () => {
    // Source: Bulbapedia — Ice Body (Gen 4): heals 1/16 HP per turn in hail; also immune to hail chip
    // Derivation: maxHp=160, floor(160/16) = 10
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.iceBody,
      maxHp: 160,
      currentHp: 100,
      weather: { type: CORE_WEATHER_IDS.hail, turnsLeft: 5, source: CORE_WEATHER_IDS.hail },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(10);
    expect(result.messages[0]).toContain("Ice Body");
  });

  it("given Ice Body and no hail, when turn ends, then does not activate", () => {
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.iceBody, maxHp: 160 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Dry Skin
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Dry Skin (NEW in Gen 4)", () => {
  it("given Dry Skin and rain, when turn ends, then heals 1/8 max HP with heal effect type", () => {
    // Source: Bulbapedia — Dry Skin: heals 1/8 HP in rain at end of turn
    // Derivation: maxHp=160, floor(160/8) = 20
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.drySkin,
      maxHp: 160,
      currentHp: 100,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN4_MOVE_IDS.rainDance },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
    expect(result.messages[0]).toContain("Dry Skin");
  });

  it("given Dry Skin and sun, when turn ends, then takes 1/8 max HP chip damage with chip-damage effect type", () => {
    // Source: Bulbapedia — Dry Skin: takes 1/8 HP chip damage in sun at end of turn
    // Derivation: maxHp=160, floor(160/8) = 20 (positive — engine applies as damage)
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.drySkin,
      maxHp: 160,
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: GEN4_MOVE_IDS.sunnyDay },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Dry Skin and no weather, when turn ends, then does not activate", () => {
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.drySkin, maxHp: 160 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Solar Power
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Solar Power (NEW in Gen 4)", () => {
  it("given Solar Power and sun, when turn ends, then takes 1/8 max HP chip damage with chip-damage effect type", () => {
    // Source: Bulbapedia — Solar Power: takes 1/8 HP chip in sun; SpAtk 1.5x (damage calc)
    // Derivation: maxHp=160, floor(160/8) = 20 (positive — engine applies as damage)
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.solarPower,
      maxHp: 160,
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: GEN4_MOVE_IDS.sunnyDay },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Solar Power and no sun, when turn ends, then does not activate", () => {
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.solarPower, maxHp: 160 });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Hydration
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Hydration (NEW in Gen 4)", () => {
  it("given Hydration, rain, and poison status, when turn ends, then cures the status", () => {
    // Source: Bulbapedia — Hydration: cures status at end of turn in rain
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.hydration,
      status: CORE_STATUS_IDS.poison,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN4_MOVE_IDS.rainDance },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-cure");
    expect(result.messages[0]).toContain("Hydration");
  });

  it("given Hydration, rain, but no status, when turn ends, then does not activate", () => {
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.hydration,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN4_MOVE_IDS.rainDance },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Hydration, status, but no rain, when turn ends, then does not activate", () => {
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.hydration,
      status: CORE_STATUS_IDS.burn,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Shed Skin
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Shed Skin", () => {
  it("given Shed Skin with a status and RNG succeeds, when turn ends, then cures the status", () => {
    // Source: Bulbapedia — Shed Skin: 33% chance to cure status each turn
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.shedSkin,
      status: CORE_STATUS_IDS.paralysis,
      rngChance: true,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("status-cure");
    expect(result.messages[0]).toContain("Shed Skin");
  });

  it("given Shed Skin with a status and RNG fails, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Shed Skin: 33% chance (RNG fail = no activation)
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.shedSkin,
      status: CORE_STATUS_IDS.burn,
      rngChance: false,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Shed Skin with no status, when turn ends, then does not activate regardless of RNG", () => {
    // Source: Bulbapedia — Shed Skin only checks if a status is present
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.shedSkin, rngChance: true });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Bad Dreams
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Bad Dreams (NEW in Gen 4)", () => {
  it("given Bad Dreams and a sleeping opponent, when turn ends, then deals 1/8 opponent's max HP with chip-damage effect type", () => {
    // Source: Bulbapedia — Bad Dreams: damages sleeping opponents for 1/8 HP each turn
    // Derivation: opponent maxHp=160, floor(160/8) = 20 (positive — engine applies as damage)
    const opponent = createSyntheticOnFieldPokemon({ status: CORE_STATUS_IDS.sleep, maxHp: 160 });
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.badDreams, opponent });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.target).toBe("opponent");
    expect(result.effects[0]?.value).toBe(20);
    expect(result.messages[0]).toContain("Bad Dreams");
  });

  it("given Bad Dreams and a non-sleeping opponent, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Bad Dreams only affects sleeping opponents
    const opponent = createSyntheticOnFieldPokemon({ status: CORE_STATUS_IDS.burn });
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.badDreams, opponent });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Bad Dreams and no opponent, when turn ends, then does not activate", () => {
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.badDreams });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// on-turn-end: Poison Heal
// ---------------------------------------------------------------------------

describe("applyGen4Ability on-turn-end — Poison Heal (NEW in Gen 4)", () => {
  it("given Poison Heal and poison status below max HP, when turn ends, then heals 1/8 max HP with heal effect type", () => {
    // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn when poisoned (instead of damage)
    // Derivation: maxHp=160, currentHp=100, floor(160/8) = 20
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.poisonHeal,
      status: CORE_STATUS_IDS.poison,
      maxHp: 160,
      currentHp: 100,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
    expect(result.messages[0]).toContain("Poison Heal");
  });

  it("given Poison Heal and badly-poisoned status below max HP, when turn ends, then heals 1/8 max HP with heal effect type", () => {
    // Source: Bulbapedia — Poison Heal works for both regular and bad poison
    // Derivation: maxHp=160, currentHp=80, floor(160/8) = 20
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.poisonHeal,
      status: CORE_STATUS_IDS.badlyPoisoned,
      maxHp: 160,
      currentHp: 80,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Poison Heal and poison at full HP, when turn ends, then activates with no effects (suppresses poison damage tick)", () => {
    // Poison Heal must return activated:true even at full HP so the engine knows
    // the poison-heal EoT slot handled the tick and skips status-damage for this Pokemon.
    // Source: Bulbapedia — Poison Heal: heals instead of taking damage; no damage is ever dealt
    // Source: Showdown Gen 4 mod — Poison Heal activates when poisoned regardless of current HP
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.poisonHeal,
      status: CORE_STATUS_IDS.poison,
      maxHp: 160,
      currentHp: 160,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
  });

  it("given Poison Heal and no status, when turn ends, then does not activate", () => {
    // Source: Bulbapedia — Poison Heal only triggers when holder is poisoned
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.poisonHeal,
      maxHp: 160,
      currentHp: 100,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown ability / unknown trigger
// ---------------------------------------------------------------------------

describe("applyGen4Ability — unknown ability/trigger", () => {
  it("given an unknown ability, when trigger fires, then returns not activated", () => {
    const ctx = createAbilityContext({ ability: "some-unknown-ability" });
    const result = applyGen4Ability(abilityTriggers.onSwitchIn, ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a known ability, when an unknown trigger fires, then returns not activated", () => {
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.drizzle });
    // @ts-expect-error intentional unknown trigger for test
    const result = applyGen4Ability(abilityTriggers.onFaint, ctx);

    expect(result.activated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Triangulation: heal/chip-damage effect types with second input value
// ---------------------------------------------------------------------------

describe("applyGen4Ability — heal/chip-damage effect types (triangulation)", () => {
  it("given Rain Dish with maxHp=320 in rain, when turn ends, then heal value is 20 (floor(320/16))", () => {
    // Source: Bulbapedia — Rain Dish: restores 1/16 HP in rain
    // Triangulation: second test with different maxHp to verify formula, not a constant
    // Derivation: maxHp=320, floor(320/16) = 20
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.rainDish,
      maxHp: 320,
      currentHp: 200,
      weather: { type: CORE_WEATHER_IDS.rain, turnsLeft: 5, source: GEN4_MOVE_IDS.rainDance },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Ice Body with maxHp=320 in hail, when turn ends, then heal value is 20 (floor(320/16))", () => {
    // Source: Bulbapedia — Ice Body: restores 1/16 HP in hail
    // Triangulation: confirms formula scales with maxHp
    // Derivation: maxHp=320, floor(320/16) = 20
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.iceBody,
      maxHp: 320,
      currentHp: 200,
      weather: { type: CORE_WEATHER_IDS.hail, turnsLeft: 5, source: CORE_WEATHER_IDS.hail },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(20);
  });

  it("given Dry Skin with maxHp=320 in sun, when turn ends, then chip-damage value is 40 (floor(320/8))", () => {
    // Source: Bulbapedia — Dry Skin: takes 1/8 HP in sun
    // Triangulation: confirms chip-damage value scales with maxHp
    // Derivation: maxHp=320, floor(320/8) = 40
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.drySkin,
      maxHp: 320,
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: GEN4_MOVE_IDS.sunnyDay },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(40);
  });

  it("given Solar Power with maxHp=320 in sun, when turn ends, then chip-damage value is 40 (floor(320/8))", () => {
    // Source: Bulbapedia — Solar Power: takes 1/8 HP in sun
    // Triangulation: confirms chip-damage formula scales with maxHp
    // Derivation: maxHp=320, floor(320/8) = 40
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.solarPower,
      maxHp: 320,
      weather: { type: CORE_WEATHER_IDS.sun, turnsLeft: 5, source: GEN4_MOVE_IDS.sunnyDay },
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.value).toBe(40);
  });

  it("given Bad Dreams with sleeping opponent maxHp=320, when turn ends, then chip-damage value is 40 targeting opponent", () => {
    // Source: Bulbapedia — Bad Dreams: damages sleeping opponents for 1/8 HP each turn
    // Triangulation: confirms chip-damage targets opponent and scales with opponent maxHp
    // Derivation: oppMaxHp=320, floor(320/8) = 40
    const opponent = createSyntheticOnFieldPokemon({ status: CORE_STATUS_IDS.sleep, maxHp: 320 });
    const ctx = createAbilityContext({ ability: CORE_ABILITY_IDS.badDreams, opponent });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("chip-damage");
    expect(result.effects[0]?.target).toBe("opponent");
    expect(result.effects[0]?.value).toBe(40);
  });

  it("given Poison Heal with maxHp=320 and poison, when turn ends, then heal value is 40 (floor(320/8))", () => {
    // Source: Bulbapedia — Poison Heal: heals 1/8 HP per turn when poisoned
    // Triangulation: confirms heal formula scales with maxHp
    // Derivation: maxHp=320, floor(320/8) = 40
    const ctx = createAbilityContext({
      ability: CORE_ABILITY_IDS.poisonHeal,
      status: CORE_STATUS_IDS.poison,
      maxHp: 320,
      currentHp: 200,
    });
    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]?.effectType).toBe("heal");
    expect(result.effects[0]?.value).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Integration: Rain Dish through applyAbility with proper context
// ---------------------------------------------------------------------------

describe("applyGen4Ability — integration: Rain Dish end-to-end", () => {
  it("given a Pokemon with Rain Dish in rain at 80% HP, when applyAbility is called with on-turn-end trigger, then returns activated:true with heal effect of 1/16 max HP", () => {
    // Source: Bulbapedia — Rain Dish restores 1/16 HP in rain
    // Derivation: maxHp=160, currentHp=128 (80%), floor(160/16) = 10
    const maxHp = 160;
    const pokemon = createSyntheticOnFieldPokemon({
      ability: CORE_ABILITY_IDS.rainDish,
      currentHp: 128,
      maxHp,
    });
    const state = createBattleState({
      type: CORE_WEATHER_IDS.rain,
      turnsLeft: 3,
      source: CORE_ABILITY_IDS.drizzle,
    });
    const ctx: AbilityContext = {
      pokemon,
      state,
      trigger: abilityTriggers.onTurnEnd,
      rng: {
        next: () => 0,
        int: () => 1,
        chance: () => false,
        pick: <T>(arr: readonly T[]) => arr[0] as T,
        shuffle: <T>(arr: T[]) => arr,
        getState: () => 0,
        setState: () => {},
      },
    } as unknown as AbilityContext;

    const result = applyGen4Ability(abilityTriggers.onTurnEnd, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]?.effectType).toBe("heal");
    // Source: 1/16 of 160 = 10
    expect(result.effects[0]?.value).toBe(10);
  });
});

// ===========================================================================
// on-contact: Static
// ===========================================================================

describe("applyGen4Ability on-contact -- Static", () => {
  it("given Static and RNG < 0.3 and attacker has no status, when contact is made, then inflicts paralysis on opponent", () => {
    // Source: Bulbapedia -- Static: 30% chance to paralyze on contact
    // Source: Showdown Gen 4 mod -- Static trigger
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.static,
      opponent: attacker,
      rngNextValues: [0.1], // < 0.3, triggers
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.paralysis,
    });
  });

  it("given Static and RNG >= 0.3, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Static: 30% chance; RNG >= 0.3 means no trigger
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.static,
      opponent: attacker,
      rngNextValues: [0.5], // >= 0.3, no trigger
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Static and attacker already has a status, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Static: cannot paralyze a Pokemon that already has a status
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, status: CORE_STATUS_IDS.burn });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.static,
      opponent: attacker,
      rngNextValues: [0.1], // would trigger, but status blocks
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Flame Body
// ===========================================================================

describe("applyGen4Ability on-contact -- Flame Body", () => {
  it("given Flame Body and RNG < 0.3 and attacker has no status, when contact is made, then inflicts burn on opponent", () => {
    // Source: Bulbapedia -- Flame Body: 30% chance to burn on contact
    // Source: Showdown Gen 4 mod -- Flame Body trigger
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.flameBody,
      opponent: attacker,
      rngNextValues: [0.2], // < 0.3, triggers
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.burn,
    });
  });

  it("given Flame Body and attacker already has a status, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Flame Body: cannot burn if attacker already has a status condition
    const attacker = createSyntheticOnFieldPokemon({
      maxHp: 200,
      status: CORE_STATUS_IDS.paralysis,
    });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.flameBody,
      opponent: attacker,
      rngNextValues: [0.1],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Poison Point
// ===========================================================================

describe("applyGen4Ability on-contact -- Poison Point", () => {
  it("given Poison Point and RNG < 0.3 and attacker has no status, when contact is made, then inflicts poison on opponent", () => {
    // Source: Bulbapedia -- Poison Point: 30% chance to poison on contact
    // Source: Showdown Gen 4 mod -- Poison Point trigger
    const attacker = createSyntheticOnFieldPokemon({
      maxHp: 200,
      speciesId: GEN4_SPECIES_IDS.charmander,
    });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.poisonPoint,
      opponent: attacker,
      rngNextValues: [0.15], // < 0.3, triggers
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.poison,
    });
  });

  it("given Poison Point and attacker already has a status, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Poison Point: cannot poison if attacker already has a status condition
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, status: CORE_STATUS_IDS.sleep });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.poisonPoint,
      opponent: attacker,
      rngNextValues: [0.1],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Rough Skin
// ===========================================================================

describe("applyGen4Ability on-contact -- Rough Skin", () => {
  it("given Rough Skin and attacker with maxHp=200, when contact is made, then always deals 1/8 attacker max HP (25) as chip damage", () => {
    // Source: Bulbapedia -- Rough Skin: deals 1/8 attacker's max HP on contact (always, no RNG)
    // Source: Showdown Gen 4 mod -- Rough Skin trigger (guaranteed chip)
    // Derivation: floor(200/8) = 25
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.roughSkin,
      opponent: attacker,
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 25,
    });
  });

  it("given Rough Skin and attacker with maxHp=320, when contact is made, then deals floor(320/8)=40 chip damage (triangulation)", () => {
    // Source: Bulbapedia -- Rough Skin: 1/8 attacker max HP chip damage
    // Triangulation: confirms formula scales with attacker max HP
    // Derivation: floor(320/8) = 40
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 320 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.roughSkin,
      opponent: attacker,
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 40,
    });
  });

  it("given Rough Skin and attacker with very low maxHp=1, when contact is made, then deals at least 1 chip damage", () => {
    // Source: Bulbapedia -- Rough Skin: minimum 1 HP damage
    // Derivation: floor(1/8) = 0, but Math.max(1, 0) = 1
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 1, currentHp: 1 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.roughSkin,
      opponent: attacker,
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 1,
    });
  });
});

// ===========================================================================
// on-contact: Effect Spore
// ===========================================================================

describe("applyGen4Ability on-contact -- Effect Spore", () => {
  // Gen 4 Effect Spore uses a SINGLE random(100) roll:
  //   0-9 = sleep, 10-19 = paralysis, 20-29 = poison, 30-99 = no effect
  // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
  //   effectspore.onDamagingHit: const r = this.random(100);
  //   if (r < 10) sleep, else if (r < 20) paralysis, else if (r < 30) poison

  it("given Effect Spore and RNG roll in [0, 10), when contact is made, then inflicts sleep", () => {
    // rng.next() = 0.05 => Math.floor(0.05 * 100) = 5, which is < 10 => sleep
    // Source: Showdown Gen 4 mod — Effect Spore single roll pattern
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.effectSpore,
      opponent: attacker,
      rngNextValues: [0.05],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.sleep,
    });
  });

  it("given Effect Spore and RNG roll in [10, 20), when contact is made, then inflicts paralysis", () => {
    // rng.next() = 0.15 => Math.floor(0.15 * 100) = 15, which is >= 10 and < 20 => paralysis
    // Source: Showdown Gen 4 mod — Effect Spore single roll pattern
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.effectSpore,
      opponent: attacker,
      rngNextValues: [0.15],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.paralysis,
    });
  });

  it("given Effect Spore and RNG roll in [20, 30), when contact is made, then inflicts poison", () => {
    // rng.next() = 0.25 => Math.floor(0.25 * 100) = 25, which is >= 20 and < 30 => poison
    // Source: Showdown Gen 4 mod — Effect Spore single roll pattern
    const attacker = createSyntheticOnFieldPokemon({
      maxHp: 200,
      speciesId: GEN4_SPECIES_IDS.charmander,
    });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.effectSpore,
      opponent: attacker,
      rngNextValues: [0.25],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "status-inflict",
      target: "opponent",
      status: CORE_STATUS_IDS.poison,
    });
  });

  it("given Effect Spore and RNG roll >= 30, when contact is made, then does not activate", () => {
    // rng.next() = 0.5 => Math.floor(0.5 * 100) = 50, which is >= 30 => no effect
    // Source: Showdown Gen 4 mod — Effect Spore: 70% no-effect range
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.effectSpore,
      opponent: attacker,
      rngNextValues: [0.5],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Effect Spore and attacker already has status, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Effect Spore: cannot inflict status if attacker already has one
    // Source: Showdown Gen 4 mod — early return if target has status
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, status: CORE_STATUS_IDS.poison });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.effectSpore,
      opponent: attacker,
      rngNextValues: [0.05],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: Cute Charm
// ===========================================================================

describe("applyGen4Ability on-contact -- Cute Charm", () => {
  it("given Cute Charm with opposite genders and RNG < 0.3, when contact is made, then inflicts infatuation volatile on opponent", () => {
    // Source: Bulbapedia -- Cute Charm: 30% chance to infatuate on contact, opposite genders
    // Source: Showdown Gen 4 mod -- Cute Charm trigger
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, gender: CORE_GENDERS.male });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.cuteCharm,
      opponent: attacker,
      gender: CORE_GENDERS.female,
      rngNextValues: [0.1], // < 0.3, triggers
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "volatile-inflict",
      target: "opponent",
      volatile: CORE_VOLATILE_IDS.infatuation,
    });
  });

  it("given Cute Charm with same genders and RNG < 0.3, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Cute Charm: requires opposite genders
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, gender: CORE_GENDERS.female });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.cuteCharm,
      opponent: attacker,
      gender: CORE_GENDERS.female,
      rngNextValues: [0.1], // would trigger RNG, but same gender blocks
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Cute Charm and defender is genderless, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Cute Charm: fails if either Pokemon is genderless
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, gender: CORE_GENDERS.male });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.cuteCharm,
      opponent: attacker,
      gender: CORE_GENDERS.genderless,
      rngNextValues: [0.1],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Cute Charm and attacker is genderless, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Cute Charm: fails if either Pokemon is genderless
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, gender: CORE_GENDERS.genderless });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.cuteCharm,
      opponent: attacker,
      gender: CORE_GENDERS.female,
      rngNextValues: [0.1],
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });

  it("given Cute Charm and RNG >= 0.3, when contact is made, then does not activate", () => {
    // Source: Bulbapedia -- Cute Charm: 30% chance; RNG fail = no activation
    const attacker = createSyntheticOnFieldPokemon({ maxHp: 200, gender: CORE_GENDERS.male });
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.cuteCharm,
      opponent: attacker,
      gender: CORE_GENDERS.female,
      rngNextValues: [0.5], // >= 0.3, no trigger
    });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// on-contact: no opponent
// ===========================================================================

describe("applyGen4Ability on-contact -- no opponent", () => {
  it("given Static but no opponent present, when on-contact triggers, then does not activate", () => {
    const ctx = createAbilityContext({ ability: GEN4_ABILITY_IDS.static });
    const result = applyGen4Ability(abilityTriggers.onContact, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Water Absorb
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Water Absorb", () => {
  it("given Water Absorb and incoming Water move with maxHp=200, when passive-immunity triggers, then activates with heal of 1/4 max HP (50)", () => {
    // Source: Bulbapedia -- Water Absorb: Water moves heal 1/4 max HP
    // Source: Showdown Gen 4 mod -- Water Absorb immunity
    // Derivation: floor(200/4) = 50
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.waterAbsorb,
      maxHp: 200,
      currentHp: 100,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.water),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "heal",
      target: "self",
      value: 50,
    });
  });

  it("given Water Absorb and incoming Water move with maxHp=320, when passive-immunity triggers, then heals floor(320/4)=80 (triangulation)", () => {
    // Source: Bulbapedia -- Water Absorb: heals 1/4 max HP
    // Triangulation: confirms formula scales with max HP
    // Derivation: floor(320/4) = 80
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.waterAbsorb,
      maxHp: 320,
      currentHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.water),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "heal",
      target: "self",
      value: 80,
    });
  });

  it("given Water Absorb and incoming Fire move, when passive-immunity triggers, then does not activate", () => {
    // Source: Bulbapedia -- Water Absorb: only absorbs Water-type moves
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.waterAbsorb,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.fire),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Volt Absorb
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Volt Absorb", () => {
  it("given Volt Absorb and incoming Electric move with maxHp=200, when passive-immunity triggers, then activates with heal of 1/4 max HP (50)", () => {
    // Source: Bulbapedia -- Volt Absorb: Electric moves heal 1/4 max HP
    // Source: Showdown Gen 4 mod -- Volt Absorb immunity
    // Derivation: floor(200/4) = 50
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.voltAbsorb,
      maxHp: 200,
      currentHp: 100,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.electric),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "heal",
      target: "self",
      value: 50,
    });
  });

  it("given Volt Absorb and incoming Normal move, when passive-immunity triggers, then does not activate", () => {
    // Source: Bulbapedia -- Volt Absorb: only absorbs Electric-type moves
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.voltAbsorb,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.normal),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Motor Drive
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Motor Drive", () => {
  it("given Motor Drive and incoming Electric move, when passive-immunity triggers, then activates with Speed +1 stat change", () => {
    // Source: Bulbapedia -- Motor Drive: Electric moves raise Speed by 1 stage
    // Source: Showdown Gen 4 mod -- Motor Drive immunity + Speed boost
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.motorDrive,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.electric),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given Motor Drive and incoming Water move, when passive-immunity triggers, then does not activate", () => {
    // Source: Bulbapedia -- Motor Drive: only absorbs Electric-type moves
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.motorDrive,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.water),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Dry Skin (Water immunity)
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Dry Skin", () => {
  it("given Dry Skin and incoming Water move with maxHp=200, when passive-immunity triggers, then activates with heal of 1/4 max HP (50)", () => {
    // Source: Bulbapedia -- Dry Skin: Water moves heal 1/4 max HP (immunity)
    // Source: Showdown Gen 4 mod -- Dry Skin passive Water immunity
    // Derivation: floor(200/4) = 50
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.drySkin,
      maxHp: 200,
      currentHp: 100,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.water),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "heal",
      target: "self",
      value: 50,
    });
  });

  it("given Dry Skin and incoming Fire move, when passive-immunity triggers, then does not activate (Fire weakness handled in damage calc)", () => {
    // Source: Bulbapedia -- Dry Skin: Fire weakness is a damage multiplier, not immunity
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.drySkin,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.fire),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Flash Fire
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Flash Fire", () => {
  it("given Flash Fire and incoming Fire move without prior boost, when passive-immunity triggers, then activates and sets flash-fire volatile", () => {
    // Source: Bulbapedia -- Flash Fire: Fire moves are absorbed; "raises the power of
    //   Fire-type moves by 50% while it is in effect"
    // Source: Showdown Gen 4 mod -- Flash Fire immunity + volatile boost
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.flashFire,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.fire),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: GEN4_ABILITY_IDS.flashFire,
    });
    expect(result.messages[0]).toContain("Flash Fire was activated");
  });

  it("given Flash Fire already boosted and incoming Fire move, when passive-immunity triggers, then activates with no new volatile", () => {
    // Source: Bulbapedia -- Flash Fire: still absorbs the move if already boosted
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.flashFire,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.fire),
    });
    // Set the volatile to simulate an already-boosted state
    ctx.pokemon.volatileStatuses.set(GEN4_ABILITY_IDS.flashFire, { turnsLeft: -1 });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
    expect(result.messages[0]).toContain("already boosted");
  });

  it("given Flash Fire and incoming Water move, when passive-immunity triggers, then does not activate", () => {
    // Source: Bulbapedia -- Flash Fire: only absorbs Fire-type moves
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.flashFire,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.water),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: Levitate
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Levitate", () => {
  it("given Levitate and incoming Ground move, when passive-immunity triggers, then activates with no effects (pure immunity)", () => {
    // Source: Bulbapedia -- Levitate: Ground moves have no effect
    // Source: Showdown Gen 4 mod -- Levitate ground immunity
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.levitate,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.ground),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
  });

  it("given Levitate and incoming Electric move, when passive-immunity triggers, then does not activate", () => {
    // Source: Bulbapedia -- Levitate: only grants immunity to Ground-type moves
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.levitate,
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.electric),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: no move provided
// ===========================================================================

describe("applyGen4Ability passive-immunity -- no move", () => {
  it("given Water Absorb but no move in context, when passive-immunity triggers, then does not activate", () => {
    const ctx = createAbilityContext({
      ability: GEN4_ABILITY_IDS.waterAbsorb,
      maxHp: 200,
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// passive-immunity: unknown ability
// ===========================================================================

describe("applyGen4Ability passive-immunity -- unknown ability", () => {
  it("given an unknown ability with a Water move, when passive-immunity triggers, then does not activate", () => {
    const ctx = createAbilityContext({
      ability: "some-unknown",
      maxHp: 200,
      move: createCanonicalMoveForType(CORE_TYPE_IDS.water),
    });
    const result = applyGen4Ability(abilityTriggers.passiveImmunity, ctx);

    expect(result.activated).toBe(false);
  });
});
