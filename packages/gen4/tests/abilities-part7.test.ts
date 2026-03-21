import type { AbilityContext } from "@pokemon-lib-ts/battle";
import type { Gender, MoveData, PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { applyGen4Ability } from "../src/Gen4Abilities";

/**
 * Gen 4 Ability Tests — Part 7: Steadfast, Trace, Flash Fire (volatile boost)
 *
 * Sources:
 *   - Showdown Gen 4 mod — ability trigger dispatch
 *   - Bulbapedia — Steadfast, Trace, Flash Fire mechanics
 */

// ---------------------------------------------------------------------------
// Test helpers (consistent with abilities.test.ts)
// ---------------------------------------------------------------------------

function makePokemonInstance(overrides: {
  speciesId?: number;
  nickname?: string | null;
  ability?: string;
  heldItem?: string | null;
  status?: PokemonInstance["status"];
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
  status?: PokemonInstance["status"];
  currentHp?: number;
  maxHp?: number;
  heldItem?: string | null;
  gender?: Gender;
  hasFlashFire?: boolean;
}) {
  const active = {
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
    volatileStatuses: new Map<string, { turnsLeft: number }>(),
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
  if (overrides.hasFlashFire) {
    active.volatileStatuses.set("flash-fire", { turnsLeft: -1 });
  }
  return active;
}

function makeMove(type: PokemonType): MoveData {
  return {
    id: "test-move",
    displayName: "Test Move",
    type,
    category: "physical",
    power: 80,
    accuracy: 100,
    pp: 10,
    maxPp: 10,
    priority: 0,
    target: "single",
    generation: 4,
    flags: { contact: true },
    effectChance: null,
    secondaryEffects: [],
  } as unknown as MoveData;
}

function makeContext(opts: {
  ability: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  move?: MoveData;
  hasFlashFire?: boolean;
}): AbilityContext {
  const state = {
    phase: "turn-end",
    generation: 4,
    format: "singles",
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
      },
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
      },
    ],
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
  };

  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    hasFlashFire: opts.hasFlashFire,
  });

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: "on-switch-in",
    move: opts.move,
    rng: state.rng,
  } as unknown as AbilityContext;
}

// ===========================================================================
// Steadfast (on-flinch)
// ===========================================================================

describe("applyGen4Ability on-flinch -- Steadfast", () => {
  // Source: Bulbapedia — Steadfast: "Raises the Pokemon's Speed by one stage each time it flinches."

  it("given a Pokemon with Steadfast at +0 Speed, when it flinches, then Speed stage effect is +1", () => {
    // Source: Bulbapedia — Steadfast raises Speed by 1 stage when the holder flinches
    // Derivation: at +0 Speed, effect should produce stages: 1 (engine applies clamped to [−6, +6])
    const ctx = makeContext({ ability: "steadfast" });
    const result = applyGen4Ability("on-flinch", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
    expect(result.messages[0]).toContain("Steadfast");
  });

  it("given a Pokemon with Steadfast at +2 Speed, when it flinches, then Speed stage effect is still +1", () => {
    // Source: Bulbapedia — Steadfast always raises Speed by exactly 1 stage per flinch
    // Derivation: the ability always returns stages: 1; clamping is done by the engine
    const ctx = makeContext({ ability: "steadfast" });
    // Simulate a Pokemon already at +2 Speed (ability returns +1 regardless)
    ctx.pokemon.statStages.speed = 2;
    const result = applyGen4Ability("on-flinch", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "stat-change",
      target: "self",
      stat: "speed",
      stages: 1,
    });
  });

  it("given a Pokemon WITHOUT Steadfast, when it flinches, then ability does not activate", () => {
    // Source: Bulbapedia — only Steadfast triggers on flinch
    const ctx = makeContext({ ability: "intimidate" });
    const result = applyGen4Ability("on-flinch", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });
});

// ===========================================================================
// Trace (on-switch-in)
// ===========================================================================

describe("applyGen4Ability on-switch-in -- Trace", () => {
  // Source: Bulbapedia — Trace: "Copies the opponent's Ability when the Pokemon enters battle."
  // Source: Showdown Gen 4 mod — Trace copies foe's ability on switch-in

  it("given a Pokemon with Trace switching in against an opponent with Intimidate, then copies Intimidate", () => {
    // Source: Bulbapedia — Trace can copy any ability not on the uncopyable list
    const opponent = makeActivePokemon({ ability: "intimidate" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: "intimidate",
    });
    expect(result.messages[0]).toContain("traced");
    expect(result.messages[0]).toContain("intimidate");
  });

  it("given a Pokemon with Trace switching in against an opponent with Levitate, then copies Levitate", () => {
    // Source: Bulbapedia — Trace can copy Levitate (it's not uncopyable)
    // Triangulation case: different ability than Intimidate above
    const opponent = makeActivePokemon({ ability: "levitate" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "self",
      newAbility: "levitate",
    });
  });

  it("given a Pokemon with Trace switching in against a Pokemon with Trace, then does NOT copy Trace", () => {
    // Source: Bulbapedia — Trace cannot copy Trace
    // Source: Showdown Gen 4 mod — uncopyable list includes Trace
    const opponent = makeActivePokemon({ ability: "trace" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Trace switching in against Multitype, then does NOT copy Multitype", () => {
    // Source: Bulbapedia — Trace cannot copy Multitype
    // Source: Showdown Gen 4 mod — Multitype is uncopyable
    const opponent = makeActivePokemon({ ability: "multitype" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Trace switching in against Forecast, then does NOT copy Forecast", () => {
    // Source: Bulbapedia — Trace cannot copy Forecast
    const opponent = makeActivePokemon({ ability: "forecast" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Trace switching in against Flower Gift, then DOES copy Flower Gift in Gen 4", () => {
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
    //   Gen 4 Trace banned list is ['forecast', 'multitype', 'trace'] only.
    //   Flower Gift is copyable in Gen 4 (banned only in Gen 5+).
    const opponent = makeActivePokemon({ ability: "flower-gift" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "ability-change",
      newAbility: "flower-gift",
    });
  });

  it("given a Pokemon with Trace switching in against Wonder Guard, then DOES copy Wonder Guard in Gen 4", () => {
    // Source: Showdown Gen 4 mod references/pokemon-showdown/data/mods/gen4/abilities.ts —
    //   Gen 4 Trace banned list is ['forecast', 'multitype', 'trace'] only.
    //   Wonder Guard is copyable in Gen 4; e.g., Gardevoir/Porygon2 Trace vs Shedinja was a known Gen 4 mechanic.
    const opponent = makeActivePokemon({ ability: "wonder-guard" });
    const ctx = makeContext({ ability: "trace", opponent });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects[0]).toMatchObject({
      effectType: "ability-change",
      newAbility: "wonder-guard",
    });
  });

  it("given a Pokemon with Trace switching in with no opponent, then does NOT activate", () => {
    // Edge case: no opponent present
    const ctx = makeContext({ ability: "trace" });
    const result = applyGen4Ability("on-switch-in", ctx);

    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// Flash Fire (passive-immunity with volatile boost)
// ===========================================================================

describe("applyGen4Ability passive-immunity -- Flash Fire volatile boost", () => {
  // Source: Bulbapedia — Flash Fire: "raises the power of Fire-type moves by 50%
  //   while it is in effect"

  it("given a Pokemon with Flash Fire hit by a Fire move for the first time, then sets flash-fire volatile", () => {
    // Source: Bulbapedia — Flash Fire: "The Pokemon's Fire-type moves are powered up
    //   if it's hit by a Fire-type move."
    const ctx = makeContext({
      ability: "flash-fire",
      move: makeMove("fire"),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      effectType: "volatile-inflict",
      target: "self",
      volatile: "flash-fire",
    });
    expect(result.messages[0]).toContain("Flash Fire was activated");
  });

  it("given a Pokemon with Flash Fire hit by a non-Fire move, then does NOT activate", () => {
    // Source: Bulbapedia — Flash Fire only triggers on Fire-type moves
    const ctx = makeContext({
      ability: "flash-fire",
      move: makeMove("water"),
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(false);
    expect(result.effects).toHaveLength(0);
  });

  it("given a Pokemon with Flash Fire already boosted hit by another Fire move, then blocks the move but does not add volatile again", () => {
    // Source: Bulbapedia — Flash Fire still blocks Fire moves even after activation
    const ctx = makeContext({
      ability: "flash-fire",
      move: makeMove("fire"),
      hasFlashFire: true,
    });
    const result = applyGen4Ability("passive-immunity", ctx);

    expect(result.activated).toBe(true);
    expect(result.effects).toHaveLength(0);
    expect(result.messages[0]).toContain("already boosted");
  });
});
