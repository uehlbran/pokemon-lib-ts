import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, PrimaryStatus, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../../src/Gen3Abilities";

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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function createActivePokemon(opts: {
  types: PokemonType[];
  ability: string;
  nickname?: string | null;
  status?: PrimaryStatus | null;
}): ActivePokemon {
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
    speciesId: 196, // Espeon
    nickname: opts.nickname === undefined ? "Espeon" : opts.nickname,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability,
    abilitySlot: "normal1" as const,
    heldItem: null,
    status: opts.status ?? null,
    friendship: 0,
    gender: "male" as const,
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
    ability: opts.ability,
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

function createSynchronizeContext(opts: {
  pokemonStatus: PrimaryStatus | null;
  pokemonNickname?: string;
  opponentStatus?: PrimaryStatus | null;
  opponentNickname?: string;
  hasOpponent?: boolean;
}): AbilityContext {
  const pokemon = createActivePokemon({
    types: ["psychic"],
    ability: "synchronize",
    nickname: opts.pokemonNickname ?? "Espeon",
    status: opts.pokemonStatus,
  });
  const opponent =
    opts.hasOpponent !== false
      ? createActivePokemon({
          types: ["normal"],
          ability: "intimidate",
          nickname: opts.opponentNickname ?? "Mightyena",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Synchronize", () => {
  it("given Synchronize Pokemon paralyzed, when on-status-inflicted fires, then opponent also gets paralysis", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    // Source: Bulbapedia — "Synchronize passes paralysis to the opponent"
    const ctx = createSynchronizeContext({
      pokemonStatus: "paralysis",
      pokemonNickname: "Espeon",
      opponentNickname: "Mightyena",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0]!.effectType).toBe("status-inflict");
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe("paralysis");
      expect(result.effects[0]!.target).toBe("opponent");
    }
    expect(result.messages[0]).toBe("Espeon's Synchronize shared its paralysis with Mightyena!");
  });

  it("given Synchronize Pokemon burned, when on-status-inflicted fires, then opponent also gets burn", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    // Triangulation: second independent test with different status
    const ctx = createSynchronizeContext({
      pokemonStatus: "burn",
      pokemonNickname: "Espeon",
      opponentNickname: "Machamp",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe("burn");
    }
    expect(result.messages[0]).toBe("Espeon's Synchronize shared its burn with Machamp!");
  });

  it("given Synchronize Pokemon poisoned, when on-status-inflicted fires, then opponent also gets poison", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    const ctx = createSynchronizeContext({
      pokemonStatus: "poison",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    if (result.effects[0]!.effectType === "status-inflict") {
      expect(result.effects[0]!.status).toBe("poison");
    }
  });

  it("given Synchronize Pokemon badly-poisoned, when on-status-inflicted fires, then opponent gets regular poison (Gen 3 downgrade)", () => {
    // In Gen 3, Synchronize converts badly-poisoned (Toxic) to regular poison before mirroring.
    // Source: pret/pokeemerald src/battle_util.c lines 2976-2977, 2992-2993 —
    //   "if (synchronizeMoveEffect == MOVE_EFFECT_TOXIC) synchronizeMoveEffect = MOVE_EFFECT_POISON"
    const ctx = createSynchronizeContext({
      pokemonStatus: "badly-poisoned",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(true);
    if (result.effects[0]!.effectType === "status-inflict") {
      // Downgraded to regular poison — opponent does NOT get badly-poisoned in Gen 3
      expect(result.effects[0]!.status).toBe("poison");
    }
  });

  it("given Synchronize Pokemon put to sleep, when on-status-inflicted fires, then Synchronize does NOT trigger", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    // Source: Bulbapedia — "Synchronize does not pass on sleep or freeze"
    const ctx = createSynchronizeContext({
      pokemonStatus: "sleep",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon frozen, when on-status-inflicted fires, then Synchronize does NOT trigger", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    // Source: Bulbapedia — "Synchronize does not pass on sleep or freeze"
    const ctx = createSynchronizeContext({
      pokemonStatus: "freeze",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon paralyzed but opponent already has status, when on-status-inflicted fires, then no effect", () => {
    // Source: pret/pokeemerald src/battle_util.c — ABILITY_SYNCHRONIZE
    // Cannot apply status if opponent already has one
    const ctx = createSynchronizeContext({
      pokemonStatus: "paralysis",
      opponentStatus: "burn",
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon paralyzed but no opponent present, when on-status-inflicted fires, then no effect", () => {
    // Edge case: no opponent on field
    const ctx = createSynchronizeContext({
      pokemonStatus: "paralysis",
      hasOpponent: false,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Synchronize Pokemon with no status, when on-status-inflicted fires, then no effect", () => {
    // Edge case: status was cleared between infliction and trigger (shouldn't happen but defensive)
    const ctx = createSynchronizeContext({
      pokemonStatus: null,
    });
    const result = applyGen3Ability("on-status-inflicted", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given non-Synchronize Pokemon, when on-status-inflicted fires, then no effect", () => {
    // Non-Synchronize abilities should not trigger
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "huge-power",
      nickname: "Azumarill",
      status: "paralysis",
    });
    const opponent = createActivePokemon({
      types: ["normal"],
      ability: "intimidate",
      nickname: "Mightyena",
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
