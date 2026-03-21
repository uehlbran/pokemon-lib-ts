import type { AbilityContext, BattleSide, BattleState } from "@pokemon-lib-ts/battle";
import type { Gender, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4Ability } from "../src/Gen4Abilities";

/**
 * Gen 4 Contact Abilities Tests — Aftermath
 *
 * Tests the Aftermath ability added in Gen 4:
 *   - Aftermath: when the holder faints from a contact move, the attacker
 *     takes 1/4 of its max HP in damage.
 *
 * Note: Poison Point, Cute Charm, Static, Flame Body, Rough Skin, and Effect Spore
 * are already tested in abilities.test.ts — this file only covers Aftermath.
 *
 * Source: Bulbapedia — Aftermath: "Damages the attacker landing the finishing hit
 *   by 1/4 its max HP."
 * Source: Showdown Gen 4 mod — Aftermath on-contact trigger
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  gender?: Gender;
}): PokemonInstance {
  const maxHp = overrides.maxHp ?? 200;
  return {
    uid: "test",
    speciesId: overrides.speciesId ?? 1,
    nickname: overrides.nickname ?? null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: overrides.currentHp ?? maxHp,
    moves: [],
    ability: overrides.ability ?? "",
    abilitySlot: "normal1" as const,
    heldItem: overrides.heldItem ?? null,
    status: overrides.status ?? null,
    friendship: 0,
    gender: (overrides.gender ?? "male") as const,
    isShiny: false,
    metLocation: "",
    metLevel: 1,
    originalTrainer: "",
    originalTrainerId: 0,
    pokeball: "pokeball",
    calculatedStats: {
      hp: maxHp,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
  } as PokemonInstance;
}

function makeActivePokemon(overrides: {
  ability?: string;
  types?: PokemonType[];
  speciesId?: number;
  nickname?: string | null;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
}) {
  return {
    pokemon: makePokemonInstance({
      ability: overrides.ability,
      speciesId: overrides.speciesId,
      nickname: overrides.nickname,
      status: overrides.status,
      currentHp: overrides.currentHp,
      maxHp: overrides.maxHp,
      heldItem: overrides.heldItem,
      gender: overrides.gender,
    }),
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
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
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
  };
}

function makeSide(index: 0 | 1): BattleSide {
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

function makeBattleState(): BattleState {
  return {
    phase: "turn-end",
    generation: 4,
    format: "singles",
    turnNumber: 1,
    sides: [makeSide(0), makeSide(1)],
    weather: null,
    terrain: null,
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: false, turnsLeft: 0 },
    turnHistory: [],
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
    ended: false,
    winner: null,
  } as unknown as BattleState;
}

function makeContext(opts: {
  ability: string;
  opponent?: ReturnType<typeof makeActivePokemon>;
  currentHp?: number;
  maxHp?: number;
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: "on-contact",
    rng: {
      next: () => 0,
      int: () => 1,
      chance: (_p: number) => false,
      pick: <T>(arr: readonly T[]) => arr[0] as T,
      shuffle: <T>(arr: T[]) => arr,
      getState: () => 0,
      setState: () => {},
    },
  } as unknown as AbilityContext;
}

// ===========================================================================
// Aftermath
// ===========================================================================

describe("applyGen4Ability on-contact -- Aftermath (NEW in Gen 4)", () => {
  it("given Aftermath holder that has fainted (0 HP) and attacker with maxHp=200, when contact triggers, then deals 1/4 attacker max HP (50) as chip damage", () => {
    // Source: Bulbapedia — Aftermath: "Damages the attacker landing the finishing hit
    //   by 1/4 its max HP." Only triggers when the holder faints.
    // Source: Showdown Gen 4 mod — Aftermath trigger
    // Derivation: floor(200/4) = 50
    const attacker = makeActivePokemon({ maxHp: 200, currentHp: 100 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0, // holder fainted
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 50,
    });
  });

  it("given Aftermath holder that has fainted and attacker with maxHp=320, when contact triggers, then deals floor(320/4)=80 chip damage (triangulation)", () => {
    // Source: Bulbapedia — Aftermath: 1/4 attacker max HP
    // Triangulation: second input to confirm formula scales
    // Derivation: floor(320/4) = 80
    const attacker = makeActivePokemon({ maxHp: 320, currentHp: 200 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 80,
    });
  });

  it("given Aftermath holder that has NOT fainted (currentHp > 0), when contact triggers, then does not activate", () => {
    // Source: Bulbapedia — Aftermath: only triggers when the holder faints
    // Source: Showdown Gen 4 mod — Aftermath requires 0 HP
    const attacker = makeActivePokemon({ maxHp: 200 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 50, // NOT fainted
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aftermath holder fainted and attacker with very low maxHp=1, when contact triggers, then deals at least 1 chip damage", () => {
    // Source: Bulbapedia — Aftermath: minimum damage floor
    // Derivation: floor(1/4) = 0, Math.max(1, 0) = 1
    const attacker = makeActivePokemon({ maxHp: 1, currentHp: 1 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0,
      maxHp: 50,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "chip-damage",
      target: "opponent",
      value: 1,
    });
  });

  it("given Aftermath holder fainted but no opponent present, when contact triggers, then does not activate", () => {
    // Edge case: no opponent means on-contact cannot fire
    const ctx = makeContext({
      ability: "aftermath",
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(false);
  });

  it("given Aftermath, when activated, then message mentions Aftermath", () => {
    // Verify message content
    const attacker = makeActivePokemon({ maxHp: 200 });
    const ctx = makeContext({
      ability: "aftermath",
      opponent: attacker,
      currentHp: 0,
      maxHp: 150,
    });
    const result = applyGen4Ability("on-contact", ctx);

    expect(result.activated).toBe(true);
    expect(result.messages[0]).toContain("Aftermath");
  });
});
