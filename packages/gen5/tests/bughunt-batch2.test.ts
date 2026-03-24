import type {
  AbilityContext,
  ActivePokemon,
  BattleSide,
  BattleState,
} from "@pokemon-lib-ts/battle";
import type {
  EntryHazardType,
  Gender,
  PokemonInstance,
  PokemonType,
  VolatileStatus,
} from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import { handleGen5SwitchAbility } from "../src/Gen5AbilitiesSwitch";
import { applyGen5EntryHazards } from "../src/Gen5EntryHazards";
import { GEN5_TYPE_CHART } from "../src/Gen5TypeChart";

/**
 * Bughunt batch 2 regression tests.
 *
 * Covers:
 *   #650 — Magic Guard Poison-type Toxic Spikes absorption
 *   #649 — UNSUPPRESSABLE_ABILITIES trimmed to Gen 5 set
 *   #657 — Effect Spore sleep threshold (< 11, not < 10)
 *   #661 — Synchronize does NOT trigger from Toxic Spikes
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
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
  substituteHp?: number;
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
    volatileStatuses: overrides.volatiles ?? new Map(),
    types: overrides.types ?? ["normal"],
    ability: overrides.ability ?? "",
    lastMoveUsed: null,
    lastDamageTaken: 0,
    lastDamageType: null,
    lastDamageCategory: null,
    turnsOnField: 0,
    movedThisTurn: false,
    consecutiveProtects: 0,
    substituteHp: overrides.substituteHp ?? 0,
    itemKnockedOff: false,
    transformed: false,
    transformedSpecies: null,
    isMega: false,
    isDynamaxed: false,
    dynamaxTurnsLeft: 0,
    isTerastallized: false,
    teraType: null,
    stellarBoostedTypes: [],
    suppressedAbility: null,
  } as unknown as ActivePokemon;
}

function makeHazardSide(
  hazards: Array<{ type: EntryHazardType; layers: number }>,
  index: 0 | 1 = 0,
): BattleSide {
  return {
    index,
    active: [],
    hazards,
    screens: [],
    tailwind: { active: false, turnsLeft: 0 },
    luckyChant: { active: false, turnsLeft: 0 },
    wish: null,
    futureAttack: null,
    faintCount: 0,
    gimmickUsed: false,
    team: [],
    trainer: null,
  } as unknown as BattleSide;
}

function makeBattleState(gravityActive = false): BattleState {
  return {
    phase: "turn-end",
    generation: 5,
    format: "singles",
    turnNumber: 1,
    weather: null,
    terrain: null,
    sides: [makeHazardSide([]), makeHazardSide([], 1)],
    trickRoom: { active: false, turnsLeft: 0 },
    magicRoom: { active: false, turnsLeft: 0 },
    wonderRoom: { active: false, turnsLeft: 0 },
    gravity: { active: gravityActive, turnsLeft: gravityActive ? 5 : 0 },
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

function makeAbilityContext(opts: {
  ability: string;
  trigger: string;
  types?: PokemonType[];
  opponent?: ReturnType<typeof makeActivePokemon>;
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
  currentHp?: number;
  maxHp?: number;
  rngNextValues?: number[];
  volatiles?: Map<string, { turnsLeft: number; data?: Record<string, unknown> }>;
}): AbilityContext {
  const state = makeBattleState();
  const pokemon = makeActivePokemon({
    ability: opts.ability,
    types: opts.types,
    status: opts.status,
    currentHp: opts.currentHp,
    maxHp: opts.maxHp,
    volatiles: opts.volatiles,
  });

  let nextIndex = 0;
  const rngNextValues = opts.rngNextValues;

  return {
    pokemon,
    opponent: opts.opponent,
    state,
    trigger: opts.trigger,
    rng: {
      next: () => {
        if (rngNextValues && nextIndex < rngNextValues.length) {
          return rngNextValues[nextIndex++];
        }
        return 0;
      },
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
// #650 — Magic Guard Poison-type Toxic Spikes absorption
// ===========================================================================

describe("#650 — Magic Guard + Poison-type Toxic Spikes absorption", () => {
  it("given a Poison-type with Magic Guard, when switching into Toxic Spikes, then absorbs and removes hazard", () => {
    // Source: Showdown data/conditions.ts — Toxic Spikes: grounded Poison-type always
    //   absorbs (removes) the hazard, regardless of abilities like Magic Guard.
    // Source: Bulbapedia — Toxic Spikes: "A grounded Poison-type Pokemon will absorb
    //   Toxic Spikes, removing them from the field."
    const pokemon = makeActivePokemon({
      maxHp: 200,
      types: ["poison"],
      ability: "magic-guard",
    });
    const side = makeHazardSide([{ type: "toxic-spikes", layers: 2 }]);
    const state = makeBattleState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual(["toxic-spikes"]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain("absorbed the poison spikes");
  });

  it("given a Poison/Flying-type with Magic Guard, when switching into Toxic Spikes with Gravity, then absorbs hazard", () => {
    // Source: Showdown — Gravity grounds Flying-types; Poison-type still absorbs even with Magic Guard
    // Gravity makes the Pokemon grounded, so Toxic Spikes can be absorbed.
    const pokemon = makeActivePokemon({
      maxHp: 200,
      types: ["poison", "flying"],
      ability: "magic-guard",
    });
    const side = makeHazardSide([{ type: "toxic-spikes", layers: 1 }]);
    const state = makeBattleState(true); // gravity active
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toEqual(["toxic-spikes"]);
  });

  it("given a Normal-type with Magic Guard, when switching into Toxic Spikes, then does NOT absorb hazard", () => {
    // Source: Showdown — only Poison-types absorb Toxic Spikes; other types just get immunity from Magic Guard
    const pokemon = makeActivePokemon({
      maxHp: 200,
      types: ["normal"],
      ability: "magic-guard",
    });
    const side = makeHazardSide([{ type: "toxic-spikes", layers: 2 }]);
    const state = makeBattleState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.damage).toBe(0);
    expect(result.statusInflicted).toBeNull();
    expect(result.hazardsToRemove).toBeUndefined();
    expect(result.messages).toHaveLength(0);
  });
});

// ===========================================================================
// #649 — UNSUPPRESSABLE_ABILITIES trimmed to Gen 5 set
// ===========================================================================

describe("#649 — UNSUPPRESSABLE_ABILITIES scope in Gen 5", () => {
  it("given a Pokemon with Wonder Guard, when contacted by a Mummy holder, then ability is changed to Mummy", () => {
    // Source: Showdown data/abilities.ts — Gen 5: Wonder Guard CAN be overwritten by Mummy
    //   (only Multitype and Zen Mode are truly unsuppressable in Gen 5)
    // Source: Bulbapedia — Mummy: "Cannot overwrite Multitype" (Gen 5); Wonder Guard not listed
    const defender = makeActivePokemon({
      ability: "mummy",
      types: ["ghost"],
      nickname: "Cofagrigus",
    });
    const attacker = makeActivePokemon({
      ability: "wonder-guard",
      types: ["bug", "ghost"],
      nickname: "Shedinja",
    });
    const ctx = makeAbilityContext({
      ability: "mummy",
      trigger: "on-contact",
      types: ["ghost"],
    });
    // Inject the attacker as the opponent in the context
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: "mummy",
    });
  });

  it("given a Pokemon with Truant, when contacted by a Mummy holder, then ability is changed to Mummy", () => {
    // Source: Showdown data/abilities.ts — Gen 5: Truant CAN be overwritten by Mummy
    //   (Truant was only made unsuppressable in later gens, not Gen 5)
    const defender = makeActivePokemon({
      ability: "mummy",
      types: ["ghost"],
      nickname: "Cofagrigus",
    });
    const attacker = makeActivePokemon({
      ability: "truant",
      types: ["normal"],
      nickname: "Slaking",
    });
    const ctx = makeAbilityContext({
      ability: "mummy",
      trigger: "on-contact",
      types: ["ghost"],
    });
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "ability-change",
      target: "opponent",
      newAbility: "mummy",
    });
  });

  it("given a Pokemon with Multitype, when contacted by a Mummy holder, then ability is NOT changed", () => {
    // Source: Showdown data/abilities.ts — Multitype is unsuppressable in Gen 5
    // Source: Bulbapedia — Multitype: "Cannot be overwritten by other Abilities"
    const defender = makeActivePokemon({
      ability: "mummy",
      types: ["ghost"],
      nickname: "Cofagrigus",
    });
    const attacker = makeActivePokemon({
      ability: "multitype",
      types: ["normal"],
      nickname: "Arceus",
    });
    const ctx = makeAbilityContext({
      ability: "mummy",
      trigger: "on-contact",
      types: ["ghost"],
    });
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });

  it("given a Pokemon with Zen Mode, when contacted by a Mummy holder, then ability is NOT changed", () => {
    // Source: Showdown data/abilities.ts — Zen Mode is unsuppressable in Gen 5
    // Source: Bulbapedia — Zen Mode: "Cannot be suppressed"
    const defender = makeActivePokemon({
      ability: "mummy",
      types: ["ghost"],
      nickname: "Cofagrigus",
    });
    const attacker = makeActivePokemon({
      ability: "zen-mode",
      types: ["fire"],
      nickname: "Darmanitan",
    });
    const ctx = makeAbilityContext({
      ability: "mummy",
      trigger: "on-contact",
      types: ["ghost"],
    });
    (ctx as Record<string, unknown>).pokemon = defender;
    (ctx as Record<string, unknown>).opponent = attacker;

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// #657 — Effect Spore sleep threshold (< 11, not < 10)
// ===========================================================================

describe("#657 — Effect Spore sleep/poison/paralysis thresholds", () => {
  it("given Effect Spore holder, when roll=10 (i.e., 10/100), then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts — effectspore: this.random(100)
    //   < 11 = sleep, < 21 = poison, < 30 = paralysis
    //   roll=10 is < 11, so it should be sleep
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const ctx = makeAbilityContext({
      ability: "effect-spore",
      trigger: "on-contact",
      types: ["grass"],
      opponent,
      // roll = Math.floor(rngNext * 100); for roll=10, rngNext = 10/100 = 0.10
      rngNextValues: [0.1],
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "sleep",
    });
  });

  it("given Effect Spore holder, when roll=9 (i.e., 9/100), then inflicts sleep", () => {
    // Source: Showdown data/abilities.ts — roll=9 < 11, so sleep
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const ctx = makeAbilityContext({
      ability: "effect-spore",
      trigger: "on-contact",
      types: ["grass"],
      opponent,
      rngNextValues: [0.09],
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "sleep",
    });
  });

  it("given Effect Spore holder, when roll=11 (i.e., 11/100), then inflicts poison (not sleep)", () => {
    // Source: Showdown data/abilities.ts — roll=11 >= 11 but < 21, so poison
    //   Before the fix, roll=11 was < 20 = paralysis (wrong order).
    //   After the fix, roll=11 is >= 11 but < 21, so poison.
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const ctx = makeAbilityContext({
      ability: "effect-spore",
      trigger: "on-contact",
      types: ["grass"],
      opponent,
      rngNextValues: [0.11],
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "poison",
    });
  });

  it("given Effect Spore holder, when roll=20 (i.e., 20/100), then inflicts poison (boundary)", () => {
    // Source: Showdown data/abilities.ts — roll=20 < 21, so poison
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const ctx = makeAbilityContext({
      ability: "effect-spore",
      trigger: "on-contact",
      types: ["grass"],
      opponent,
      rngNextValues: [0.2],
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "poison",
    });
  });

  it("given Effect Spore holder, when roll=21 (i.e., 21/100), then inflicts paralysis", () => {
    // Source: Showdown data/abilities.ts — roll=21 >= 21 but < 30, so paralysis
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const ctx = makeAbilityContext({
      ability: "effect-spore",
      trigger: "on-contact",
      types: ["grass"],
      opponent,
      rngNextValues: [0.21],
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "paralysis",
    });
  });

  it("given Effect Spore holder, when roll=30 (i.e., 30/100), then no effect", () => {
    // Source: Showdown data/abilities.ts — roll=30 >= 30, no effect
    const opponent = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    const ctx = makeAbilityContext({
      ability: "effect-spore",
      trigger: "on-contact",
      types: ["grass"],
      opponent,
      rngNextValues: [0.3],
    });

    const result = handleGen5SwitchAbility("on-contact", ctx);
    expect(result.activated).toBe(false);
  });
});

// ===========================================================================
// #661 — Synchronize does NOT trigger from Toxic Spikes
// ===========================================================================

describe("#661 — Synchronize hazard-source exclusion", () => {
  it("given Synchronize holder poisoned by Toxic Spikes (hazard-status-source volatile present), when Synchronize checks, then does NOT trigger", () => {
    // Source: Showdown data/abilities.ts — Synchronize: if (effect.id === 'toxicspikes') return;
    // The entry hazard code sets a "hazard-status-source" volatile when Toxic Spikes inflicts
    // status. Synchronize checks for this volatile and skips activation.
    const opponent = makeActivePokemon({
      ability: "blaze",
      types: ["fire"],
      nickname: "Charizard",
    });
    const hazardVolatile = new Map<string, { turnsLeft: number; data?: Record<string, unknown> }>([
      ["hazard-status-source", { turnsLeft: 1 }],
    ]);
    const ctx = makeAbilityContext({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      types: ["psychic"],
      status: "poison",
      opponent,
      volatiles: hazardVolatile,
    });

    const result = handleGen5SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(false);
    // The volatile should be removed after checking
    expect(ctx.pokemon.volatileStatuses.has("hazard-status-source" as VolatileStatus)).toBe(false);
  });

  it("given Synchronize holder poisoned by opponent's Toxic move, when Synchronize checks, then DOES trigger", () => {
    // Source: Showdown data/abilities.ts — Synchronize: spreads poison/burn/paralysis from opponent's move
    // No hazard-status-source volatile present, so Synchronize fires normally.
    const opponent = makeActivePokemon({
      ability: "blaze",
      types: ["fire"],
      nickname: "Charizard",
    });
    const ctx = makeAbilityContext({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      types: ["psychic"],
      status: "poison",
      opponent,
    });

    const result = handleGen5SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "poison",
    });
  });

  it("given Synchronize holder burned by opponent's Will-O-Wisp, when Synchronize checks, then DOES trigger", () => {
    // Source: Showdown data/abilities.ts — Synchronize: spreads burn from opponent's move
    // Source: Bulbapedia — Synchronize: "Passes burn, paralysis, or poison to the foe."
    const opponent = makeActivePokemon({
      ability: "blaze",
      types: ["fire"],
      nickname: "Charizard",
    });
    const ctx = makeAbilityContext({
      ability: "synchronize",
      trigger: "on-status-inflicted",
      types: ["psychic"],
      status: "burn",
      opponent,
    });

    const result = handleGen5SwitchAbility("on-status-inflicted", ctx);
    expect(result.activated).toBe(true);
    expect(result.effects[0]).toEqual({
      effectType: "status-inflict",
      target: "opponent",
      status: "burn",
    });
  });

  it("given Toxic Spikes inflicting status, when applyGen5EntryHazards returns, then hazard-status-source volatile is set", () => {
    // Source: Showdown data/abilities.ts — Synchronize: if (effect.id === 'toxicspikes') return;
    // Verify that the entry hazard code sets the volatile marker for Synchronize to check.
    const pokemon = makeActivePokemon({
      maxHp: 200,
      types: ["normal"],
      ability: "synchronize",
    });
    const side = makeHazardSide([{ type: "toxic-spikes", layers: 1 }]);
    const state = makeBattleState();
    const result = applyGen5EntryHazards(pokemon, side, state, GEN5_TYPE_CHART);

    expect(result.statusInflicted).toBe("poison");
    expect(pokemon.volatileStatuses.has("hazard-status-source" as VolatileStatus)).toBe(true);
  });
});
