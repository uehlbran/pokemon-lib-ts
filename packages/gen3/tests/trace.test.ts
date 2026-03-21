import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../src/Gen3Abilities";

/**
 * Gen 3 Trace ability tests.
 *
 * Trace copies the opponent's ability on switch-in. In Gen 3, only Trace
 * itself is uncopyable (no Multitype/Forecast — those don't exist in Gen 3).
 *
 * Source: pret/pokeemerald src/battle_util.c — ABILITY_TRACE
 * Source: Bulbapedia — "Trace copies the opponent's Ability when entering battle"
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
  const pokemon = {
    uid: "test",
    speciesId: opts.speciesId ?? 1,
    nickname: opts.nickname === undefined ? "TestMon" : opts.nickname,
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
    status: null,
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
  } as ActivePokemon;
}

function createAbilityContext(opts: {
  pokemonAbility: string;
  pokemonNickname?: string | null;
  opponentAbility?: string;
  opponentNickname?: string | null;
  hasOpponent?: boolean;
}): AbilityContext {
  const pokemon = createActivePokemon({
    types: ["psychic"],
    ability: opts.pokemonAbility,
    nickname: opts.pokemonNickname === undefined ? "Gardevoir" : opts.pokemonNickname,
  });
  const opponent =
    opts.hasOpponent !== false
      ? createActivePokemon({
          types: ["normal"],
          ability: opts.opponentAbility ?? "intimidate",
          nickname: opts.opponentNickname === undefined ? "Mightyena" : opts.opponentNickname,
        })
      : undefined;

  return {
    pokemon,
    opponent,
    state: { weather: null } as AbilityContext["state"],
    rng: createMockRng(),
    trigger: "on-switch-in",
  } as AbilityContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Trace", () => {
  it("given Trace Pokemon switches in against Intimidate opponent, when on-switch-in fires, then ability changes to Intimidate", () => {
    // Source: pret/pokeemerald — ABILITY_TRACE copies foe's ability on entry
    // Source: Bulbapedia — "Trace copies the opponent's Ability when entering battle"
    const ctx = createAbilityContext({
      pokemonAbility: "trace",
      pokemonNickname: "Gardevoir",
      opponentAbility: "intimidate",
      opponentNickname: "Mightyena",
    });
    const result = applyGen3Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    expect(result.effects[0]!.effectType).toBe("ability-change");
    if (result.effects[0]!.effectType === "ability-change") {
      expect(result.effects[0]!.newAbility).toBe("intimidate");
      expect(result.effects[0]!.target).toBe("self");
    }
    expect(result.messages[0]).toBe("Gardevoir traced Mightyena's intimidate!");
  });

  it("given Trace Pokemon switches in against Speed Boost opponent, when on-switch-in fires, then ability changes to Speed Boost", () => {
    // Source: pret/pokeemerald — ABILITY_TRACE copies foe's ability on entry
    // Triangulation: second independent test with different ability
    const ctx = createAbilityContext({
      pokemonAbility: "trace",
      pokemonNickname: "Ralts",
      opponentAbility: "speed-boost",
      opponentNickname: "Ninjask",
    });
    const result = applyGen3Ability("on-switch-in", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects.length).toBe(1);
    if (result.effects[0]!.effectType === "ability-change") {
      expect(result.effects[0]!.newAbility).toBe("speed-boost");
    }
    expect(result.messages[0]).toBe("Ralts traced Ninjask's speed-boost!");
  });

  it("given Trace Pokemon switches in against Trace opponent, when on-switch-in fires, then ability does NOT change", () => {
    // Source: pret/pokeemerald — ABILITY_TRACE cannot copy itself
    // Source: Bulbapedia — "Trace cannot copy Trace"
    const ctx = createAbilityContext({
      pokemonAbility: "trace",
      opponentAbility: "trace",
    });
    const result = applyGen3Ability("on-switch-in", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
    expect(result.messages.length).toBe(0);
  });

  it("given Trace Pokemon switches in against no opponent, when on-switch-in fires, then no effect", () => {
    // Edge case: no opponent on field (all fainted)
    const ctx = createAbilityContext({
      pokemonAbility: "trace",
      hasOpponent: false,
    });
    const result = applyGen3Ability("on-switch-in", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });

  it("given Trace Pokemon switches in against opponent with empty ability string, when on-switch-in fires, then no effect", () => {
    // Edge case: opponent's ability is empty string (shouldn't happen but defensive)
    const ctx = createAbilityContext({
      pokemonAbility: "trace",
      opponentAbility: "",
    });
    const result = applyGen3Ability("on-switch-in", ctx);
    expect(result.activated).toBe(false);
    expect(result.effects.length).toBe(0);
  });
});
