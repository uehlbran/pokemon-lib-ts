import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, PrimaryStatus, StatBlock } from "@pokemon-lib-ts/core";
import {
  CORE_ABILITY_SLOTS,
  CORE_ABILITY_IDS,
  CORE_GENDERS,
  CORE_ITEM_IDS,
  CORE_STATUS_IDS,
  CORE_TYPE_IDS,
  SeededRandom,
  createEvs,
  createIvs,
} from "@pokemon-lib-ts/core";
import {
  createGen3DataManager,
  GEN3_ABILITY_IDS,
  GEN3_NATURE_IDS,
  GEN3_SPECIES_IDS,
  Gen3Ruleset,
  applyGen3Ability,
} from "@pokemon-lib-ts/gen3";
import { describe, expect, it } from "vitest";

const dataManager = createGen3DataManager();
const ESPEON = dataManager.getSpecies(GEN3_SPECIES_IDS.espeon);
const AZUMARILL = dataManager.getSpecies(GEN3_SPECIES_IDS.azumarill);
const MIGHTYENA = dataManager.getSpecies(GEN3_SPECIES_IDS.mightyena);
const HARDY_NATURE = dataManager.getNature(GEN3_NATURE_IDS.hardy).id;

/**
 * Gen 3 Synchronize ability tests.
 *
 * Synchronize: when the holder receives burn, paralysis, poison, or badly-poisoned,
 * the opponent also receives the same status condition.
 * Synchronize does NOT activate for sleep or freeze.
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
 * Source: Bulbapedia — "Synchronize passes burn, paralysis, and poison to the opponent"
 */

function createRuleset(): Gen3Ruleset {
  return new Gen3Ruleset(dataManager);
}

function createOnFieldPokemon(opts: {
  speciesId?: number;
  types?: PokemonType[];
  ability?: string;
  nickname?: string | null;
  status?: PrimaryStatus | null;
}): ActivePokemon {
  const species = dataManager.getSpecies(opts.speciesId ?? ESPEON.id);
  const stats: StatBlock = {
    hp: 200,
    attack: 100,
    defense: 100,
    spAttack: 100,
    spDefense: 100,
    speed: 100,
  };

  const pokemon = {
    uid: "test",
    speciesId: species.id,
    nickname: opts.nickname === undefined ? species.displayName : opts.nickname,
    level: 50,
    experience: 0,
    nature: HARDY_NATURE,
    ivs: createIvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    evs: createEvs({ hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 }),
    currentHp: 200,
    moves: [],
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    abilitySlot: CORE_ABILITY_SLOTS.normal1,
    heldItem: null,
    status: opts.status ?? null,
    friendship: 0,
    gender: CORE_GENDERS.male,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: CORE_ITEM_IDS.pokeBall,
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
    types: opts.types ?? [...species.types],
    ability: opts.ability ?? CORE_ABILITY_IDS.none,
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
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

function createStatusContext(opts: {
  pokemonStatus: PrimaryStatus | null;
  pokemonNickname?: string;
  opponentStatus?: PrimaryStatus | null;
  opponentNickname?: string;
  hasOpponent?: boolean;
}): AbilityContext {
  const pokemon = createOnFieldPokemon({
    speciesId: ESPEON.id,
    types: [...ESPEON.types],
    ability: GEN3_ABILITY_IDS.synchronize,
    nickname: opts.pokemonNickname ?? ESPEON.displayName,
    status: opts.pokemonStatus,
  });
  const opponent =
    opts.hasOpponent !== false
      ? createOnFieldPokemon({
          speciesId: MIGHTYENA.id,
          types: [...MIGHTYENA.types],
          ability: GEN3_ABILITY_IDS.intimidate,
          nickname: opts.opponentNickname ?? MIGHTYENA.displayName,
          status: opts.opponentStatus ?? null,
        })
      : undefined;

  return {
    pokemon,
    opponent,
    state: { weather: null } as AbilityContext["state"],
    rng: createMockRng(),
    trigger: "on-status-inflicted",
  } as AbilityContext;
}

function createMockRng() {
  return {
    next: () => 0,
    int: (_min: number, _max: number) => 100,
    chance: () => false,
    pick: <T>(arr: readonly T[]) => arr[0] as T,
    shuffle: <T>(arr: readonly T[]) => [...arr],
    getState: () => 0,
    setState: () => {},
  };
}

describe("Gen 3 Synchronize", () => {
  it("given Synchronize Pokemon paralyzed, when on-status-inflicted fires, then opponent also gets paralysis", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.paralysis,
      pokemonNickname: ESPEON.displayName,
      opponentNickname: MIGHTYENA.displayName,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0]!.effectType).toBe("status-inflict");
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe(CORE_STATUS_IDS.paralysis);
      expect(result.effects[0]!.target).toBe("opponent");
    }
    expect(result.messages[0]).toBe(
      `${ESPEON.displayName}'s Synchronize shared its paralysis with ${MIGHTYENA.displayName}!`,
    );
  });

  it("given Synchronize Pokemon burned, when on-status-inflicted fires, then opponent also gets burn", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.burn,
      pokemonNickname: ESPEON.displayName,
      opponentNickname: MIGHTYENA.displayName,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe(CORE_STATUS_IDS.burn);
    }
    expect(result.messages[0]).toBe(
      `${ESPEON.displayName}'s Synchronize shared its burn with ${MIGHTYENA.displayName}!`,
    );
  });

  it("given Synchronize Pokemon poisoned, when on-status-inflicted fires, then opponent also gets poison", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.poison,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe(CORE_STATUS_IDS.poison);
    }
  });

  it("given Synchronize Pokemon badly-poisoned, when on-status-inflicted fires, then opponent gets regular poison (Gen 3 downgrade)", () => {
    // In Gen 3, Synchronize converts badly-poisoned (Toxic) to regular poison before mirroring.
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.badlyPoisoned,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe(CORE_STATUS_IDS.poison);
    }
  });

  it("given Synchronize Pokemon put to sleep, when on-status-inflicted fires, then Synchronize does NOT trigger", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.sleep,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon frozen, when on-status-inflicted fires, then Synchronize does NOT trigger", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.freeze,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon paralyzed but opponent already has status, when on-status-inflicted fires, then no effect", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.paralysis,
      opponentStatus: CORE_STATUS_IDS.burn,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon paralyzed but no opponent present, when on-status-inflicted fires, then no effect", () => {
    const ctx = createStatusContext({
      pokemonStatus: CORE_STATUS_IDS.paralysis,
      hasOpponent: false,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon with no status, when on-status-inflicted fires, then no effect", () => {
    const ctx = createStatusContext({
      pokemonStatus: null,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given non-Synchronize Pokemon, when on-status-inflicted fires, then no effect", () => {
    // Non-Synchronize abilities should not trigger.
    const pokemon = createOnFieldPokemon({
      speciesId: AZUMARILL.id,
      types: [...AZUMARILL.types],
      ability: GEN3_ABILITY_IDS.hugePower,
      nickname: AZUMARILL.displayName,
      status: CORE_STATUS_IDS.paralysis,
    });
    const opponent = createOnFieldPokemon({
      speciesId: MIGHTYENA.id,
      types: [...MIGHTYENA.types],
      ability: GEN3_ABILITY_IDS.intimidate,
      nickname: MIGHTYENA.displayName,
    });
    const ctx = {
      pokemon,
      opponent,
      state: { weather: null } as AbilityContext["state"],
      rng: createMockRng(),
      trigger: "on-status-inflicted",
    } as AbilityContext;

    const result = applyGen3Ability("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });
});
