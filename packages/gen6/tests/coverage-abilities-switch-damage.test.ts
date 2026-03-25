/**
 * Targeted coverage tests for Gen6AbilitiesSwitch.ts and Gen6AbilitiesDamage.ts
 * low-branch-coverage handlers.
 *
 * Covers contact abilities (Aftermath, Pickpocket, Cute Charm, Mummy, Effect Spore,
 * Poison Touch), switch-out (Natural Cure), on-damage-taken (Cursed Body, Rattled,
 * Illusion), on-status-inflicted (Synchronize), passive-immunity (Sweet Veil,
 * Overcoat, Flash Fire, Water Absorb), on-stat-change (Big Pecks, Flower Veil),
 * and damage-calc abilities (Analytic, Sand Force, Adaptability, Marvel Scale,
 * Reckless, Guts, pinch abilities, Multiscale, Solid Rock, Thick Fat, Fur Coat,
 * -ate abilities, Parental Bond).
 *
 * Source: Showdown data/abilities.ts, Bulbapedia ability articles
 */
import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import {
  CORE_ABILITY_IDS,
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_TRIGGER_IDS,
  CORE_GENDERS,
  CORE_MOVE_CATEGORIES,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  CORE_VOLATILE_IDS,
  CORE_WEATHER_IDS,
} from "@pokemon-lib-ts/core";
import type { MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  createGen6DataManager,
  GEN6_ABILITY_IDS,
  GEN6_ITEM_IDS,
  GEN6_MOVE_IDS,
  GEN6_NATURE_IDS,
  GEN6_SPECIES_IDS,
} from "@pokemon-lib-ts/gen6";
import {
  handleGen6DamageCalcAbility,
  handleGen6DamageImmunityAbility,
} from "../src/Gen6AbilitiesDamage";
import { handleGen6SwitchAbility } from "../src/Gen6AbilitiesSwitch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const A = GEN6_ABILITY_IDS;
const I = GEN6_ITEM_IDS;
const M = GEN6_MOVE_IDS;
const T = CORE_TYPE_IDS;
const S = CORE_STATUS_IDS;
const V = CORE_VOLATILE_IDS;
const W = CORE_WEATHER_IDS;
const TRIGGERS = CORE_ABILITY_TRIGGER_IDS;
const GENDERS = CORE_GENDERS;
const ABILITY_SLOTS = CORE_ABILITY_SLOTS;
const MOVE_CATEGORIES = CORE_MOVE_CATEGORIES;
const dataManager = createGen6DataManager();
const DEFAULT_SPECIES_ID = GEN6_SPECIES_IDS.bulbasaur;
const DEFAULT_NATURE_ID = GEN6_NATURE_IDS.hardy;
type PokemonGender = (typeof GENDERS)[keyof typeof GENDERS];
type AbilityTriggerId = (typeof TRIGGERS)[keyof typeof TRIGGERS];
type PokemonStatus = (typeof S)[keyof typeof S] | null;
type Gen6MoveId = (typeof M)[keyof typeof M];

let nextTestUid = 0;
function createTestUid() {
  return `test-${nextTestUid++}`;
}

function createOnFieldPokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  speciesId?: number;
  status?: PokemonStatus;
  heldItem?: string | null;
  gender?: PokemonGender;
  uid?: string;
}) {
  const maxHp = overrides.maxHp ?? 200;
  return {
    pokemon: {
      uid: overrides.uid ?? createTestUid(),
      speciesId: overrides.speciesId ?? DEFAULT_SPECIES_ID,
      nickname: overrides.nickname ?? null,
      level: 50,
      experience: 0,
      nature: DEFAULT_NATURE_ID,
      ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
      evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
      currentHp: overrides.currentHp ?? maxHp,
      status: (overrides.status ?? null) as PokemonStatus,
      heldItem: overrides.heldItem ?? null,
      ability: overrides.ability ?? CORE_ABILITY_IDS.none,
      abilitySlot: ABILITY_SLOTS.normal1,
      calculatedStats: {
        hp: maxHp,
        attack: 100,
        defense: 100,
        spAttack: 100,
        spDefense: 100,
        speed: 100,
      },
      moves: [],
      friendship: 0,
      gender: overrides.gender ?? GENDERS.male,
      isShiny: false,
      metLocation: "",
      metLevel: 1,
      originalTrainer: "",
      originalTrainerId: 0,
      pokeball: I.pokeBall,
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
    volatileStatuses: new Map(),
    types: overrides.types ?? [T.normal],
    ability: overrides.ability ?? CORE_ABILITY_IDS.none,
    suppressedAbility: null,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 1,
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
    forcedMove: null,
  };
}

function createBattleState(overrides?: {
  weather?: { type: string; turnsLeft: number } | null;
  format?: string;
  rngNext?: number;
}): BattleState {
  return {
    phase: "turn-end",
    generation: 6,
    format: overrides?.format ?? "singles",
    turnNumber: 1,
    sides: [
      {
        index: 0,
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
      } as unknown as BattleSide,
      {
        index: 1,
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
      } as unknown as BattleSide,
    ],
    weather: overrides?.weather ?? null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => overrides?.rngNext ?? 0,
      int: () => 0,
      chance: () => true,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function getCanonicalMove(moveId: Gen6MoveId): MoveData {
  return dataManager.getMove(moveId);
}

function createSyntheticMoveFrom(moveId: Gen6MoveId, overrides: Partial<MoveData>): MoveData {
  const canonicalMove = getCanonicalMove(moveId);
  return {
    ...canonicalMove,
    ...overrides,
    flags: overrides.flags ? { ...canonicalMove.flags, ...overrides.flags } : canonicalMove.flags,
  } as MoveData;
}

function createAbilityContext(overrides: {
  ability: string;
  trigger: AbilityTriggerId;
  types?: PokemonType[];
  move?: MoveData;
  opponent?: ReturnType<typeof createOnFieldPokemon>;
  state?: BattleState;
  nickname?: string | null;
  currentHp?: number;
  maxHp?: number;
  status?: PokemonStatus;
  heldItem?: string | null;
  speciesId?: number;
  gender?: PokemonGender;
  statChange?: { stages: number; source: string; stat?: string };
  isCrit?: boolean;
  typeEffectiveness?: number;
}): AbilityContext {
  const state = overrides.state ?? createBattleState();
  const pokemon = createOnFieldPokemon({
    ability: overrides.ability,
    types: overrides.types,
    nickname: overrides.nickname,
    currentHp: overrides.currentHp,
    maxHp: overrides.maxHp,
    status: overrides.status,
    heldItem: overrides.heldItem,
    speciesId: overrides.speciesId,
    gender: overrides.gender,
  });
  return {
    pokemon,
    opponent: overrides.opponent ?? undefined,
    state,
    rng: state.rng,
    trigger: overrides.trigger,
    move: overrides.move,
    statChange: overrides.statChange,
    isCrit: overrides.isCrit,
    typeEffectiveness: overrides.typeEffectiveness,
  } as unknown as AbilityContext;
}

// ===========================================================================
// handleGen6SwitchAbility — on-contact abilities
// ===========================================================================

describe("handleGen6SwitchAbility — on-contact abilities", () => {
  it("given Aftermath + holder fainted (0 HP), when on-contact, then deals 1/4 chip damage", () => {
    // Source: Showdown data/abilities.ts -- Aftermath: 1/4 HP if holder fainted
    const foe = createOnFieldPokemon({ maxHp: 200 });
    const ctx = createAbilityContext({
      ability: A.aftermath,
      trigger: TRIGGERS.onContact,
      currentHp: 0,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    // 1/4 of 200 = 50
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "chip-damage", value: 50 }),
    );
  });

  it("given Aftermath + holder alive, when on-contact, then does not activate", () => {
    // Source: Showdown -- Aftermath only fires when holder has fainted
    const foe = createOnFieldPokemon({});
    const ctx = createAbilityContext({
      ability: A.aftermath,
      trigger: TRIGGERS.onContact,
      currentHp: 100,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mummy + attacker with suppressable ability, when on-contact, then changes to Mummy", () => {
    // Source: Showdown data/abilities.ts -- Mummy overwrites attacker ability
    const foe = createOnFieldPokemon({ ability: A.intimidate });
    const ctx = createAbilityContext({
      ability: A.mummy,
      trigger: TRIGGERS.onContact,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "ability-change", newAbility: A.mummy }),
    );
  });

  it("given Mummy + attacker with Stance Change, when on-contact, then does not overwrite", () => {
    // Source: Showdown -- Stance Change is unsuppressable
    const foe = createOnFieldPokemon({ ability: A.stanceChange });
    const ctx = createAbilityContext({
      ability: A.mummy,
      trigger: TRIGGERS.onContact,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Mummy + attacker already has Mummy, when on-contact, then does not activate", () => {
    // Source: Showdown -- cannot Mummy an already-Mummy Pokemon
    const foe = createOnFieldPokemon({ ability: A.mummy });
    const ctx = createAbilityContext({
      ability: A.mummy,
      trigger: TRIGGERS.onContact,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Poison Touch + opponent has no status + RNG succeeds, when on-contact, then poisons", () => {
    // Source: Showdown data/abilities.ts -- Poison Touch: 30% poison on contact
    const foe = createOnFieldPokemon({});
    const state = createBattleState({ rngNext: 0.1 }); // < 0.3
    const ctx = createAbilityContext({
      ability: A.poisonTouch,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "status-inflict", status: S.poison }),
    );
  });

  it("given Poison Touch + opponent already statused, when on-contact, then does not activate", () => {
    // Source: Showdown -- cannot inflict status if already statused
    const foe = createOnFieldPokemon({ status: S.burn });
    const ctx = createAbilityContext({
      ability: A.poisonTouch,
      trigger: TRIGGERS.onContact,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Pickpocket + defender has no item + attacker has item, when on-contact, then steals", () => {
    // Source: Showdown data/abilities.ts -- Pickpocket steals attacker's item
    const foe = createOnFieldPokemon({ heldItem: I.lifeOrb });
    const ctx = createAbilityContext({
      ability: A.pickpocket,
      trigger: TRIGGERS.onContact,
      heldItem: null,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain(I.lifeOrb);
  });

  it("given Pickpocket + defender already has item, when on-contact, then does not steal", () => {
    // Source: Showdown -- Pickpocket only works if holder has no item
    const foe = createOnFieldPokemon({ heldItem: I.lifeOrb });
    const ctx = createAbilityContext({
      ability: A.pickpocket,
      trigger: TRIGGERS.onContact,
      heldItem: I.leftovers,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Cute Charm + opposite genders + RNG succeeds, when on-contact, then infatuates", () => {
    // Source: Showdown data/abilities.ts -- Cute Charm: 30% infatuation
    const foe = createOnFieldPokemon({ gender: GENDERS.male });
    const state = createBattleState({ rngNext: 0.1 }); // < 0.3
    const ctx = createAbilityContext({
      ability: A.cuteCharm,
      trigger: TRIGGERS.onContact,
      gender: GENDERS.female,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "volatile-inflict", volatile: V.infatuation }),
    );
  });

  it("given Cute Charm + same genders, when on-contact, then does not activate", () => {
    // Source: Showdown -- Cute Charm requires opposite genders
    const foe = createOnFieldPokemon({ gender: GENDERS.female });
    const state = createBattleState({ rngNext: 0.1 });
    const ctx = createAbilityContext({
      ability: A.cuteCharm,
      trigger: TRIGGERS.onContact,
      gender: GENDERS.female,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Cute Charm + genderless attacker, when on-contact, then does not activate", () => {
    // Source: Showdown -- Cute Charm fails vs genderless
    const foe = createOnFieldPokemon({ gender: GENDERS.genderless });
    const state = createBattleState({ rngNext: 0.1 });
    const ctx = createAbilityContext({
      ability: A.cuteCharm,
      trigger: TRIGGERS.onContact,
      gender: GENDERS.female,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Effect Spore + Grass-type attacker, when on-contact, then does not activate", () => {
    // Source: Showdown Gen 5+ -- Grass types immune to Effect Spore
    const foe = createOnFieldPokemon({ types: [T.grass] });
    const state = createBattleState({ rngNext: 0 });
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Effect Spore + Overcoat attacker, when on-contact, then does not activate", () => {
    // Source: Showdown Gen 6 -- Overcoat blocks Effect Spore
    const foe = createOnFieldPokemon({ ability: A.overcoat });
    const state = createBattleState({ rngNext: 0 });
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Effect Spore + roll 0-9, when on-contact, then causes sleep", () => {
    // Source: Showdown -- Effect Spore: 0-9 = sleep
    const foe = createOnFieldPokemon({});
    // roll * 100 = 5 < 10 => sleep
    const state = createBattleState({ rngNext: 0.05 });
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ status: S.sleep }));
  });

  it("given Effect Spore + roll 10-19, when on-contact, then causes paralysis", () => {
    // Source: Showdown -- Effect Spore: 10-19 = paralysis
    const foe = createOnFieldPokemon({});
    const state = createBattleState({ rngNext: 0.15 }); // 15 < 20
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ status: S.paralysis }));
  });

  it("given Effect Spore + roll 20-29, when on-contact, then causes poison", () => {
    // Source: Showdown -- Effect Spore: 20-29 = poison
    const foe = createOnFieldPokemon({});
    const state = createBattleState({ rngNext: 0.25 }); // 25 < 30
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ status: S.poison }));
  });

  it("given Effect Spore + roll 30+, when on-contact, then does not activate", () => {
    // Source: Showdown -- Effect Spore: 30-99 = nothing
    const foe = createOnFieldPokemon({});
    const state = createBattleState({ rngNext: 0.5 }); // 50 >= 30
    const ctx = createAbilityContext({
      ability: A.effectSpore,
      trigger: TRIGGERS.onContact,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onContact, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — switch-out
// ===========================================================================

describe("handleGen6SwitchAbility — on-switch-out", () => {
  it("given Natural Cure + statused Pokemon, when on-switch-out, then cures status", () => {
    // Source: Showdown data/abilities.ts -- Natural Cure: cures status on switch-out
    const ctx = createAbilityContext({
      ability: A.naturalCure,
      trigger: TRIGGERS.onSwitchOut,
      status: S.paralysis,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ effectType: "status-cure" }));
  });

  it("given Natural Cure + no status, when on-switch-out, then does not activate", () => {
    // Source: Showdown -- no status to cure
    const ctx = createAbilityContext({
      ability: A.naturalCure,
      trigger: TRIGGERS.onSwitchOut,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchOut, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — on-damage-taken
// ===========================================================================

describe("handleGen6SwitchAbility — on-damage-taken", () => {
  it("given Cursed Body + opponent + RNG succeeds, when on-damage-taken, then disables move", () => {
    // Source: Showdown data/abilities.ts -- Cursed Body: 30% disable
    const foe = createOnFieldPokemon({});
    const state = createBattleState({ rngNext: 0.1 }); // < 0.3
    const ctx = createAbilityContext({
      ability: A.cursedBody,
      trigger: TRIGGERS.onDamageTaken,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: V.disable }));
  });

  it("given Cursed Body + opponent already disabled, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- cannot double-disable
    const foe = createOnFieldPokemon({});
    foe.volatileStatuses.set(V.disable, { turnsLeft: 4 } as never);
    const state = createBattleState({ rngNext: 0 });
    const ctx = createAbilityContext({
      ability: A.cursedBody,
      trigger: TRIGGERS.onDamageTaken,
      opponent: foe,
      state,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Rattled + bug move, when on-damage-taken, then +1 Speed", () => {
    // Source: Showdown data/abilities.ts -- Rattled: +1 Speed on Bug/Dark/Ghost hit
    const ctx = createAbilityContext({
      ability: A.rattled,
      trigger: TRIGGERS.onDamageTaken,
      move: getCanonicalMove(M.xScissor),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "speed", stages: 1 }));
  });

  it("given Rattled + ghost move, when on-damage-taken, then +1 Speed", () => {
    // Source: Showdown -- Rattled fires for ghost type
    const ctx = createAbilityContext({
      ability: A.rattled,
      trigger: TRIGGERS.onDamageTaken,
      move: getCanonicalMove(M.shadowBall),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Rattled + fire move, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Rattled only for Bug/Dark/Ghost
    const ctx = createAbilityContext({
      ability: A.rattled,
      trigger: TRIGGERS.onDamageTaken,
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Illusion + has illusion volatile, when on-damage-taken, then breaks illusion", () => {
    // Source: Showdown data/abilities.ts -- Illusion breaks on damaging hit
    const pokemon = createOnFieldPokemon({ ability: A.illusion });
    pokemon.volatileStatuses.set(A.illusion, { turnsLeft: -1 } as never);
    const state = createBattleState();
    const ctx = {
      pokemon,
      state,
      rng: state.rng,
      trigger: TRIGGERS.onDamageTaken,
    } as unknown as AbilityContext;
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Illusion was broken");
  });

  it("given Illusion + no illusion volatile, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- no illusion to break
    const ctx = createAbilityContext({
      ability: A.illusion,
      trigger: TRIGGERS.onDamageTaken,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onDamageTaken, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — on-status-inflicted (Synchronize)
// ===========================================================================

describe("handleGen6SwitchAbility — on-status-inflicted", () => {
  it("given Synchronize + burn from opponent, when on-status-inflicted, then passes burn back", () => {
    // Source: Showdown data/abilities.ts -- Synchronize: passes burn/paralysis/poison
    const foe = createOnFieldPokemon({});
    const ctx = createAbilityContext({
      ability: A.synchronize,
      trigger: TRIGGERS.onStatusInflicted,
      status: S.burn,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(
      expect.objectContaining({ effectType: "status-inflict", status: S.burn }),
    );
  });

  it("given Synchronize + sleep, when on-status-inflicted, then does not pass sleep", () => {
    // Source: Showdown -- Synchronize does not spread sleep or freeze
    const foe = createOnFieldPokemon({});
    const ctx = createAbilityContext({
      ability: A.synchronize,
      trigger: TRIGGERS.onStatusInflicted,
      status: S.sleep,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatusInflicted, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — passive-immunity
// ===========================================================================

describe("handleGen6SwitchAbility — passive-immunity", () => {
  it("given Sweet Veil + sleep move, when passive-immunity, then blocks sleep", () => {
    // Source: Showdown data/abilities.ts -- Sweet Veil: blocks sleep
    const ctx = createAbilityContext({
      ability: A.sweetVeil,
      trigger: TRIGGERS.passiveImmunity,
      move: getCanonicalMove(M.spore),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Overcoat + powder move, when passive-immunity, then blocks powder", () => {
    // Source: Showdown data/mods/gen6/abilities.ts -- Overcoat blocks powder in Gen 6
    const ctx = createAbilityContext({
      ability: A.overcoat,
      trigger: TRIGGERS.passiveImmunity,
      move: getCanonicalMove(M.spore),
    });
    const result = handleGen6SwitchAbility(TRIGGERS.passiveImmunity, ctx);
    expect(result.activated).toBe(true);
  });

  it("given on-accuracy-check trigger with Victory Star, when dispatching, then activates", () => {
    // Source: Showdown -- Victory Star: 1.1x accuracy for all allies
    const ctx = createAbilityContext({
      ability: A.victoryStar,
      trigger: TRIGGERS.onAccuracyCheck,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onAccuracyCheck, ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — on-stat-change
// ===========================================================================

describe("handleGen6SwitchAbility — on-stat-change", () => {
  it("given Big Pecks + defense drop from opponent, when on-stat-change, then blocks it", () => {
    // Source: Showdown data/abilities.ts -- Big Pecks: prevents Defense drops
    const ctx = createAbilityContext({
      ability: A.bigPecks,
      trigger: TRIGGERS.onStatChange,
      statChange: { stages: -1, source: "opponent", stat: "defense" },
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onStatChange, ctx);
    expect(result.activated).toBe(true);
  });
});

// ===========================================================================
// handleGen6SwitchAbility — switch-in abilities
// ===========================================================================

describe("handleGen6SwitchAbility — on-switch-in (additional abilities)", () => {
  it("given Imposter + opponent present, when on-switch-in, then transforms", () => {
    // Source: Showdown data/abilities.ts -- Imposter transforms on switch-in
    const foe = createOnFieldPokemon({ nickname: "Pikachu" });
    const ctx = createAbilityContext({
      ability: A.imposter,
      trigger: TRIGGERS.onSwitchIn,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("transformed");
  });

  it("given Illusion, when on-switch-in, then sets illusion volatile", () => {
    // Source: Showdown data/abilities.ts -- Illusion sets volatile on entry
    const ctx = createAbilityContext({
      ability: A.illusion,
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ volatile: A.illusion }));
  });

  it("given Stance Change + speciesId 681 (Aegislash), when on-switch-in, then activates", () => {
    // Source: Showdown data/abilities.ts -- Stance Change: Aegislash switch-in
    const ctx = createAbilityContext({
      ability: A.stanceChange,
      trigger: TRIGGERS.onSwitchIn,
      speciesId: GEN6_SPECIES_IDS.aegislash,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
  });

  it("given Stance Change + non-Aegislash, when on-switch-in, then does not activate", () => {
    // Source: Showdown -- Stance Change only for Aegislash
    const ctx = createAbilityContext({
      ability: A.stanceChange,
      trigger: TRIGGERS.onSwitchIn,
      speciesId: GEN6_SPECIES_IDS.pikachu,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });

  it("given Teravolt, when on-switch-in, then announces blazing aura", () => {
    // Source: Showdown data/abilities.ts -- Teravolt onStart
    const ctx = createAbilityContext({
      ability: A.teravolt,
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("bursting aura");
  });

  it("given Turboblaze, when on-switch-in, then announces blazing aura", () => {
    // Source: Showdown data/abilities.ts -- Turboblaze onStart
    const ctx = createAbilityContext({
      ability: A.turboblaze,
      trigger: TRIGGERS.onSwitchIn,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("blazing aura");
  });

  it("given Download + opponent with lower Def than SpDef, when on-switch-in, then raises Attack", () => {
    // Source: Showdown data/abilities.ts -- Download: raise Atk if foe Def < SpDef
    const foe = createOnFieldPokemon({});
    (foe.pokemon.calculatedStats as { defense: number }).defense = 80;
    (foe.pokemon.calculatedStats as { spDefense: number }).spDefense = 120;
    const ctx = createAbilityContext({
      ability: A.download,
      trigger: TRIGGERS.onSwitchIn,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "attack", stages: 1 }));
  });

  it("given Download + opponent with higher Def, when on-switch-in, then raises SpAtk", () => {
    // Source: Showdown -- Download: raise SpAtk if foe Def >= SpDef
    const foe = createOnFieldPokemon({});
    (foe.pokemon.calculatedStats as { defense: number }).defense = 120;
    (foe.pokemon.calculatedStats as { spDefense: number }).spDefense = 80;
    const ctx = createAbilityContext({
      ability: A.download,
      trigger: TRIGGERS.onSwitchIn,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ stat: "spAttack", stages: 1 }));
  });

  it("given Trace + opponent with copyable ability, when on-switch-in, then copies ability", () => {
    // Source: Showdown data/abilities.ts -- Trace copies opponent's ability
    const foe = createOnFieldPokemon({ ability: A.intimidate });
    const ctx = createAbilityContext({
      ability: A.trace,
      trigger: TRIGGERS.onSwitchIn,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ newAbility: A.intimidate }));
  });

  it("given Trace + opponent with uncopyable ability (Stance Change), when on-switch-in, then fails", () => {
    // Source: Showdown -- Trace cannot copy Stance Change
    const foe = createOnFieldPokemon({ ability: A.stanceChange });
    const ctx = createAbilityContext({
      ability: A.trace,
      trigger: TRIGGERS.onSwitchIn,
      opponent: foe,
    });
    const result = handleGen6SwitchAbility(TRIGGERS.onSwitchIn, ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6DamageCalcAbility — damage-calc abilities (remaining branches)
// ===========================================================================

describe("handleGen6DamageCalcAbility — remaining branches", () => {
  it("given Analytic + opponent already moved, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Analytic: 1.3x if user moves last
    const foe = createOnFieldPokemon({});
    foe.movedThisTurn = true;
    const ctx = createAbilityContext({
      ability: A.analytic,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.tackle),
      opponent: foe,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Analytic + opponent has not moved, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Analytic only fires if foe already moved
    const foe = createOnFieldPokemon({});
    foe.movedThisTurn = false;
    const ctx = createAbilityContext({
      ability: A.analytic,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.tackle),
      opponent: foe,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sand Force + sandstorm + Rock move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sand Force: 1.3x Rock/Ground/Steel in sand
    const state = createBattleState({ weather: { type: "sand", turnsLeft: 3 } });
    const ctx = createAbilityContext({
      ability: A.sandForce,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.rockSlide),
      state,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sand Force + sandstorm + Fire move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Sand Force only for Rock/Ground/Steel
    const state = createBattleState({ weather: { type: "sand", turnsLeft: 3 } });
    const ctx = createAbilityContext({
      ability: A.sandForce,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.flamethrower),
      state,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Adaptability + STAB move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Adaptability: STAB 2x instead of 1.5x
    const ctx = createAbilityContext({
      ability: A.adaptability,
      trigger: TRIGGERS.onDamageCalc,
      types: [T.fire],
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Adaptability + non-STAB move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Adaptability only boosts STAB
    const ctx = createAbilityContext({
      ability: A.adaptability,
      trigger: TRIGGERS.onDamageCalc,
      types: [T.water],
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Reckless + recoil move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Reckless: 1.2x for recoil moves
    const ctx = createAbilityContext({
      ability: A.reckless,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.doubleEdge),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Reckless + crash damage move, when on-damage-calc, then activates", () => {
    // Source: Showdown -- Reckless also boosts crash-damage moves
    const ctx = createAbilityContext({
      ability: A.reckless,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.highJumpKick),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Guts + physical move + status, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Guts: 1.5x Atk when statused
    const ctx = createAbilityContext({
      ability: A.guts,
      trigger: TRIGGERS.onDamageCalc,
      status: S.burn,
      move: getCanonicalMove(M.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Guts + physical move + no status, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Guts requires status condition
    const ctx = createAbilityContext({
      ability: A.guts,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Blaze + fire move + HP below 1/3, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Blaze pinch: 1.5x at <= 1/3 HP
    const ctx = createAbilityContext({
      ability: A.blaze,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.flamethrower),
      currentHp: 50,
      maxHp: 200,
    });
    // HP 50 <= floor(200/3)=66
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Blaze + fire move + HP above 1/3, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- pinch abilities only fire at or below 1/3 HP
    const ctx = createAbilityContext({
      ability: A.blaze,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.flamethrower),
      currentHp: 150,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Blaze + water move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Blaze only boosts Fire moves
    const ctx = createAbilityContext({
      ability: A.blaze,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.surf),
      currentHp: 50,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Multiscale + full HP, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Multiscale: 0.5x at full HP
    const ctx = createAbilityContext({
      ability: A.multiscale,
      trigger: TRIGGERS.onDamageCalc,
      currentHp: 200,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Multiscale + not full HP, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Multiscale only at full HP
    const ctx = createAbilityContext({
      ability: A.multiscale,
      trigger: TRIGGERS.onDamageCalc,
      currentHp: 150,
      maxHp: 200,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Thick Fat + fire move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Thick Fat: 0.5x Fire/Ice damage
    const ctx = createAbilityContext({
      ability: A.thickFat,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Thick Fat + ice move, when on-damage-calc, then activates", () => {
    // Source: Showdown -- Thick Fat covers both Fire and Ice
    const ctx = createAbilityContext({
      ability: A.thickFat,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.iceBeam),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Thick Fat + water move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Thick Fat only for Fire/Ice
    const ctx = createAbilityContext({
      ability: A.thickFat,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.surf),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Marvel Scale + status, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Marvel Scale: 1.5x Def when statused
    const ctx = createAbilityContext({
      ability: A.marvelScale,
      trigger: TRIGGERS.onDamageCalc,
      status: S.paralysis,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Marvel Scale + no status, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Marvel Scale requires status
    const ctx = createAbilityContext({
      ability: A.marvelScale,
      trigger: TRIGGERS.onDamageCalc,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Fur Coat + physical move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Fur Coat: 2x Def vs physical
    const ctx = createAbilityContext({
      ability: A.furCoat,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Fur Coat + special move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Fur Coat only for physical
    const ctx = createAbilityContext({
      ability: A.furCoat,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Aerilate + normal move, when on-damage-calc, then converts to Flying", () => {
    // Source: Showdown data/abilities.ts -- Aerilate: Normal -> Flying
    const ctx = createAbilityContext({
      ability: A.aerilate,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ types: ["flying"] }));
  });

  it("given Refrigerate + normal move, when on-damage-calc, then converts to Ice", () => {
    // Source: Showdown data/abilities.ts -- Refrigerate: Normal -> Ice
    const ctx = createAbilityContext({
      ability: A.refrigerate,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.tackle),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual(expect.objectContaining({ types: [T.ice] }));
  });

  it("given Parental Bond + status move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Parental Bond doesn't apply to status moves
    const ctx = createAbilityContext({
      ability: A.parentalBond,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.growl),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Parental Bond + multi-hit move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Parental Bond skips multi-hit moves
    const ctx = createAbilityContext({
      ability: A.parentalBond,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.doubleSlap),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Sniper on a crit, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Sniper: if crit, chainModify(1.5)
    const ctx = createAbilityContext({
      ability: A.sniper,
      trigger: TRIGGERS.onDamageCalc,
      isCrit: true,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Sniper on a non-crit, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Sniper only fires on crits
    const ctx = createAbilityContext({
      ability: A.sniper,
      trigger: TRIGGERS.onDamageCalc,
      isCrit: false,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Tinted Lens with NVE move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- Tinted Lens: if typeMod < 0, chainModify(2)
    const ctx = createAbilityContext({
      ability: A.tintedLens,
      trigger: TRIGGERS.onDamageCalc,
      typeEffectiveness: 0.5,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
  });

  it("given Tinted Lens with neutral move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Tinted Lens only fires for NVE (typeMod < 0)
    const ctx = createAbilityContext({
      ability: A.tintedLens,
      trigger: TRIGGERS.onDamageCalc,
      typeEffectiveness: 1,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Hustle + special move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Hustle only boosts physical moves
    const ctx = createAbilityContext({
      ability: A.hustle,
      trigger: TRIGGERS.onDamageCalc,
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Solid Rock / Filter gating tests
// ===========================================================================

describe("Solid Rock / Filter gating", () => {
  it("given Solid Rock + SE move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- solidrock: chainModify(0.75) when typeMod > 0
    const ctx = createAbilityContext({
      ability: A.solidRock,
      trigger: TRIGGERS.onDamageCalc,
      typeEffectiveness: 2,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Filter + 4x SE move, when on-damage-calc, then activates", () => {
    // Source: Showdown data/abilities.ts -- filter is identical to solidrock
    const ctx = createAbilityContext({
      ability: A.filter,
      trigger: TRIGGERS.onDamageCalc,
      typeEffectiveness: 4,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0].effectType).toBe("damage-reduction");
  });

  it("given Solid Rock + neutral move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Solid Rock only activates for SE (typeMod > 0)
    const ctx = createAbilityContext({
      ability: A.solidRock,
      trigger: TRIGGERS.onDamageCalc,
      typeEffectiveness: 1,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given Filter + NVE move, when on-damage-calc, then does not activate", () => {
    // Source: Showdown -- Filter only activates for SE
    const ctx = createAbilityContext({
      ability: A.filter,
      trigger: TRIGGERS.onDamageCalc,
      typeEffectiveness: 0.5,
    });
    const result = handleGen6DamageCalcAbility(ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// handleGen6DamageImmunityAbility — Sturdy OHKO block
// ===========================================================================

describe("handleGen6DamageImmunityAbility — Sturdy", () => {
  it("given Sturdy + OHKO move, when on-damage-taken, then blocks the move", () => {
    // Source: Showdown data/abilities.ts -- Sturdy blocks OHKO moves
    const ctx = createAbilityContext({
      ability: A.sturdy,
      trigger: TRIGGERS.onDamageTaken,
      move: getCanonicalMove(M.fissure),
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
  });

  it("given Sturdy + non-OHKO move, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- Sturdy only blocks OHKO
    const ctx = createAbilityContext({
      ability: A.sturdy,
      trigger: TRIGGERS.onDamageTaken,
      move: getCanonicalMove(M.flamethrower),
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });

  it("given non-Sturdy ability, when on-damage-taken, then does not activate", () => {
    // Source: Showdown -- only Sturdy handles damage immunity
    const ctx = createAbilityContext({
      ability: A.intimidate,
      trigger: TRIGGERS.onDamageTaken,
    });
    const result = handleGen6DamageImmunityAbility(ctx);
    expect(result.activated).toBe(false);
  });
});
