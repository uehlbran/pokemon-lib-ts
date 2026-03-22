import type { AbilityContext, ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType, StatBlock } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen3Ability } from "../src/Gen3Abilities";

/**
 * Gen 3 Truant ability tests -- end-of-turn toggle.
 *
 * Bug #307 fix: the Truant toggle (loafing <-> acting) must happen at
 * ABILITYEFFECT_ENDTURN, not at move execution. This ensures the counter
 * advances even when the Pokemon is paralyzed/frozen/asleep and doesn't
 * execute a move.
 *
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
  trigger: "on-before-move" | "on-turn-end",
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

describe("Gen 3 Truant -- end-of-turn toggle (#307)", () => {
  it("given Truant Pokemon with no truant-turn volatile, when on-turn-end fires, then truant-turn volatile is set (will loaf next turn)", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    // After acting on turn 1, the end-of-turn toggle sets the truant-turn volatile,
    // so the Pokemon will loaf on turn 2.
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
    });
    const ctx = createAbilityContext(pokemon, "on-turn-end");
    const result = applyGen3Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given Truant Pokemon with truant-turn volatile, when on-turn-end fires, then truant-turn volatile is removed (can act next turn)", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    // After loafing on turn 2, the end-of-turn toggle removes the truant-turn volatile,
    // so the Pokemon can act on turn 3.
    const volatiles = new Map<string, { turnsLeft: number }>([["truant-turn", { turnsLeft: -1 }]]);
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
      volatiles,
    });
    const ctx = createAbilityContext(pokemon, "on-turn-end");
    const result = applyGen3Ability("on-turn-end", ctx);

    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(false);
  });

  it("given Truant Pokemon with truant-turn volatile, when on-before-move fires, then movePrevented=true but volatile is NOT removed (toggle is at end-of-turn)", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN, not at move execution
    // The on-before-move handler ONLY checks and blocks; it does NOT toggle the volatile.
    const volatiles = new Map<string, { turnsLeft: number }>([["truant-turn", { turnsLeft: -1 }]]);
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
      volatiles,
    });
    const ctx = createAbilityContext(pokemon, "on-before-move");
    const result = applyGen3Ability("on-before-move", ctx);

    expect(result.activated).toBe(true);
    expect(result.movePrevented).toBe(true);
    expect(result.messages[0]).toBe("Slaking is loafing around!");
    // The volatile is still present -- toggle happens at end-of-turn, not here
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given paralyzed Truant Pokemon that cannot move on turn 1, when on-turn-end fires, then toggle still advances (counter is turn-based, not move-based)", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    // Key scenario: if the Pokemon is paralyzed and can't move, the Truant counter
    // still advances at end of turn. With the old on-before-move implementation,
    // the toggle wouldn't fire if the Pokemon was fully paralyzed or asleep.
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
    });
    // Simulate: paralysis prevented movement, so on-before-move was never called.
    // But on-turn-end still fires.
    const ctx = createAbilityContext(pokemon, "on-turn-end");
    const result = applyGen3Ability("on-turn-end", ctx);

    // Toggle should set the truant-turn volatile regardless of move execution
    expect(result.activated).toBe(true);
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);
  });

  it("given Truant Pokemon, when full act-loaf-act cycle via end-of-turn toggles, then cycle is correct", () => {
    // Source: pret/pokeemerald src/battle_util.c -- Truant toggle at ABILITYEFFECT_ENDTURN
    // Full cycle test using only the end-of-turn toggle mechanism:
    // Turn 1: No volatile -> acts -> end-of-turn sets volatile
    // Turn 2: Has volatile -> loafs -> end-of-turn removes volatile
    // Turn 3: No volatile -> acts -> end-of-turn sets volatile
    const pokemon = createActivePokemon({
      types: ["normal"],
      ability: "truant",
      nickname: "Slaking",
    });

    // Turn 1 start: no volatile -> can act
    const beforeMove1 = applyGen3Ability(
      "on-before-move",
      createAbilityContext(pokemon, "on-before-move"),
    );
    expect(beforeMove1.movePrevented).toBeUndefined();
    // Turn 1 end: toggle sets volatile
    applyGen3Ability("on-turn-end", createAbilityContext(pokemon, "on-turn-end"));
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(true);

    // Turn 2 start: has volatile -> loafs
    const beforeMove2 = applyGen3Ability(
      "on-before-move",
      createAbilityContext(pokemon, "on-before-move"),
    );
    expect(beforeMove2.movePrevented).toBe(true);
    // Turn 2 end: toggle removes volatile
    applyGen3Ability("on-turn-end", createAbilityContext(pokemon, "on-turn-end"));
    expect(pokemon.volatileStatuses.has("truant-turn")).toBe(false);

    // Turn 3 start: no volatile -> can act again
    const beforeMove3 = applyGen3Ability(
      "on-before-move",
      createAbilityContext(pokemon, "on-before-move"),
    );
    expect(beforeMove3.movePrevented).toBeUndefined();
  });
});
