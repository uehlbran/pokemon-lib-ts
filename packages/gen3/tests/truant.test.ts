import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../src/Gen3Abilities";

/**
 * Gen 3 Truant ability tests.
 *
 * Truant causes the Pokemon to alternate between acting and loafing each turn.
 * Uses the "truant-turn" volatile status to track state.
 *
 * The toggle happens at end of turn (ABILITYEFFECT_ENDTURN), NOT at move
 * execution. The on-before-move handler only checks the volatile to block moves.
 *
 * Source: pret/pokeemerald src/battle_util.c -- ABILITY_TRUANT
 * Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
 * Source: Bulbapedia -- "Truant causes the Pokemon to use a move only every other turn"
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
  volatiles?: Map<string, { turnsLeft: number }>;
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
    speciesId: 289, // Slaking
    nickname: opts.nickname === undefined ? "Slaking" : opts.nickname,
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
    volatileStatuses: opts.volatiles ?? new Map(),
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

function createAbilityContext(
  pokemon: ActivePokemon,
  trigger: "on-before-move" | "on-turn-end" = "on-before-move",
): AbilityContext {
  return {
    pokemon,
    state: { weather: null } as AbilityContext["state"],
    rng: createMockRng(),
    trigger,
  } as AbilityContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gen 3 Truant", () => {
  it("given Truant Pokemon with no truant-turn volatile, when on-before-move fires, then move proceeds and volatile is NOT set (toggle is at end-of-turn)", () => {
    // Source: pret/pokeemerald -- Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
    // Source: Bulbapedia -- "On the turn after using a move, Truant prevents the Pokemon from acting"
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
    });
    const ctx = createAbilityContext(pokemon);
    const result = applyGen3Ability("on-before-move", ctx);

    // Move proceeds (activated = false means no blocking)
    expect(result.activated).toBe(false);
    expect(result.movePrevented).toBeUndefined();
    // on-before-move does NOT toggle; volatile should NOT be set here
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(false);
  });

  it("given Truant Pokemon with truant-turn volatile, when on-before-move fires, then movePrevented=true and loaf message is emitted but volatile is NOT removed (toggle is at end-of-turn)", () => {
    // Source: pret/pokeemerald -- Truant check at ABILITYEFFECT_MOVES_BLOCK
    // Source: Bulbapedia -- "Truant causes the Pokemon to loaf around every other turn"
    const volatiles = new Map<string, { turnsLeft: number }>([["truant-turn", { turnsLeft: -1 }]]);
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
      volatiles,
    });
    const ctx = createAbilityContext(pokemon);
    const result = applyGen3Ability("on-before-move", ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toBe("Slaking is loafing around!");
    // on-before-move does NOT toggle; volatile should STILL be present
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given Truant Pokemon, when full act-loaf-act cycle via end-of-turn toggles, then alternation is correct", () => {
    // Source: pret/pokeemerald -- ABILITY_TRUANT alternates act/loaf via ABILITYEFFECT_ENDTURN
    // Full cycle: on-before-move (check) -> move executes -> on-turn-end (toggle)
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
    });

    // Turn 1: No volatile -> can act
    const beforeMove1 = applyGen3Ability("on-before-move", createAbilityContext(pokemon));
    expect(beforeMove1.activated).toBe(false);
    expect(beforeMove1.movePrevented).toBeUndefined();
    // End of turn 1: toggle sets volatile
    applyGen3Ability("on-turn-end", createAbilityContext(pokemon, "on-turn-end"));
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);

    // Turn 2: Has volatile -> loafs
    const beforeMove2 = applyGen3Ability("on-before-move", createAbilityContext(pokemon));
    expect(beforeMove2.activated).toBe(true);
    expect(beforeMove2.movePrevented).toBe(true);
    // End of turn 2: toggle removes volatile
    applyGen3Ability("on-turn-end", createAbilityContext(pokemon, "on-turn-end"));
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(false);

    // Turn 3: No volatile -> can act again
    const beforeMove3 = applyGen3Ability("on-before-move", createAbilityContext(pokemon));
    expect(beforeMove3.activated).toBe(false);
    expect(beforeMove3.movePrevented).toBeUndefined();
  });

  it("given non-Truant Pokemon, when on-before-move fires, then no effect", () => {
    // Non-Truant abilities should not trigger on-before-move blocking
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "huge-power",
      nickname: "Azumarill",
    });
    const ctx = createAbilityContext(pokemon);
    const result = applyGen3Ability("on-before-move", ctx);
    expect(result.activated).toBe(false);
    expect(result.movePrevented).toBeUndefined();
  });
});
