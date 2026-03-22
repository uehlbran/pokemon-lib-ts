import type { ActivePokemon } from "@pokemon-lib-ts/battle";
import type { PokemonInstance, PokemonType } from "@pokemon-lib-ts/core";
import { describe, expect, it } from "vitest";
import {
  canInflictGen4Status,
  isStatusBlockedByAbility,
  isVolatileBlockedByAbility,
} from "../src/Gen4MoveEffects";

/**
 * Gen 4 Status Immunity Tests — ability-based status and volatile immunities
 *
 * Covers:
 *   Primary status immunities:
 *     - Immunity: blocks poison, badly-poisoned
 *     - Insomnia: blocks sleep
 *     - Vital Spirit: blocks sleep
 *     - Limber: blocks paralysis
 *     - Water Veil: blocks burn
 *     - Magma Armor: blocks freeze
 *
 *   Volatile status immunities:
 *     - Inner Focus: blocks flinch
 *     - Own Tempo: blocks confusion
 *     - Oblivious: blocks infatuation
 *
 * Source: Showdown sim/abilities.ts Gen 4 mod
 * Source: Bulbapedia — individual ability pages
 */

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeActivePokemon(opts: {
  ability?: string;
  types?: PokemonType[];
  status?: "burn" | "poison" | "badly-poisoned" | "paralysis" | "sleep" | "freeze" | null;
}): ActivePokemon {
  const pokemon = {
    uid: "test",
    speciesId: 1,
    nickname: null,
    level: 50,
    experience: 0,
    nature: "hardy",
    ivs: { hp: 31, attack: 31, defense: 31, spAttack: 31, spDefense: 31, speed: 31 },
    evs: { hp: 0, attack: 0, defense: 0, spAttack: 0, spDefense: 0, speed: 0 },
    currentHp: 200,
    moves: [],
    ability: opts.ability ?? "",
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
    calculatedStats: {
      hp: 200,
      attack: 100,
      defense: 100,
      spAttack: 100,
      spDefense: 100,
      speed: 100,
    },
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
    types: opts.types ?? ["normal"],
    ability: opts.ability ?? "",
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

// ===========================================================================
// isStatusBlockedByAbility — unit tests
// ===========================================================================

describe("isStatusBlockedByAbility", () => {
  it("given Immunity target, when checking poison, then returns true", () => {
    // Source: Bulbapedia — Immunity: prevents the Pokemon from being poisoned
    const target = makeActivePokemon({ ability: "immunity" });
    expect(isStatusBlockedByAbility(target, "poison")).toBe(true);
  });

  it("given Immunity target, when checking badly-poisoned, then returns true", () => {
    // Source: Bulbapedia — Immunity: prevents all forms of poison
    const target = makeActivePokemon({ ability: "immunity" });
    expect(isStatusBlockedByAbility(target, "badly-poisoned")).toBe(true);
  });

  it("given Immunity target, when checking burn, then returns false", () => {
    // Source: Bulbapedia — Immunity: only blocks poison, not other statuses
    const target = makeActivePokemon({ ability: "immunity" });
    expect(isStatusBlockedByAbility(target, "burn")).toBe(false);
  });

  it("given Insomnia target, when checking sleep, then returns true", () => {
    // Source: Bulbapedia — Insomnia: prevents the Pokemon from falling asleep
    const target = makeActivePokemon({ ability: "insomnia" });
    expect(isStatusBlockedByAbility(target, "sleep")).toBe(true);
  });

  it("given Vital Spirit target, when checking sleep, then returns true", () => {
    // Source: Bulbapedia — Vital Spirit: prevents the Pokemon from falling asleep
    const target = makeActivePokemon({ ability: "vital-spirit" });
    expect(isStatusBlockedByAbility(target, "sleep")).toBe(true);
  });

  it("given Limber target, when checking paralysis, then returns true", () => {
    // Source: Bulbapedia — Limber: prevents the Pokemon from being paralyzed
    const target = makeActivePokemon({ ability: "limber" });
    expect(isStatusBlockedByAbility(target, "paralysis")).toBe(true);
  });

  it("given Water Veil target, when checking burn, then returns true", () => {
    // Source: Bulbapedia — Water Veil: prevents the Pokemon from being burned
    const target = makeActivePokemon({ ability: "water-veil" });
    expect(isStatusBlockedByAbility(target, "burn")).toBe(true);
  });

  it("given Magma Armor target, when checking freeze, then returns true", () => {
    // Source: Bulbapedia — Magma Armor: prevents the Pokemon from being frozen
    const target = makeActivePokemon({ ability: "magma-armor" });
    expect(isStatusBlockedByAbility(target, "freeze")).toBe(true);
  });

  it("given a Pokemon with no special ability, when checking any status, then returns false", () => {
    // Verify that non-immunity abilities don't block statuses
    const target = makeActivePokemon({ ability: "blaze" });
    expect(isStatusBlockedByAbility(target, "poison")).toBe(false);
    expect(isStatusBlockedByAbility(target, "sleep")).toBe(false);
    expect(isStatusBlockedByAbility(target, "burn")).toBe(false);
  });
});

// ===========================================================================
// canInflictGen4Status — integration with ability immunities
// ===========================================================================

describe("canInflictGen4Status — ability immunity integration", () => {
  it("given Immunity target with no existing status, when checking poison infliction, then returns false", () => {
    // Source: Bulbapedia — Immunity blocks poison even if the target has no status
    // Source: Showdown Gen 4 mod — ability immunity check in canInflictStatus
    const target = makeActivePokemon({ ability: "immunity" });
    expect(canInflictGen4Status("poison", target)).toBe(false);
  });

  it("given Immunity target with no existing status, when checking badly-poisoned, then returns false", () => {
    // Source: Bulbapedia — Immunity blocks both regular and bad poison
    const target = makeActivePokemon({ ability: "immunity" });
    expect(canInflictGen4Status("badly-poisoned", target)).toBe(false);
  });

  it("given Insomnia target with no existing status, when checking sleep infliction, then returns false", () => {
    // Source: Bulbapedia — Insomnia prevents sleep
    const target = makeActivePokemon({ ability: "insomnia" });
    expect(canInflictGen4Status("sleep", target)).toBe(false);
  });

  it("given Vital Spirit target with no existing status, when checking sleep infliction, then returns false", () => {
    // Source: Bulbapedia — Vital Spirit prevents sleep
    const target = makeActivePokemon({ ability: "vital-spirit" });
    expect(canInflictGen4Status("sleep", target)).toBe(false);
  });

  it("given Limber target with no existing status, when checking paralysis infliction, then returns false", () => {
    // Source: Bulbapedia — Limber prevents paralysis
    const target = makeActivePokemon({ ability: "limber" });
    expect(canInflictGen4Status("paralysis", target)).toBe(false);
  });

  it("given Water Veil target with no existing status, when checking burn infliction, then returns false", () => {
    // Source: Bulbapedia — Water Veil prevents burn
    const target = makeActivePokemon({ ability: "water-veil" });
    expect(canInflictGen4Status("burn", target)).toBe(false);
  });

  it("given Magma Armor target with no existing status, when checking freeze infliction, then returns false", () => {
    // Source: Bulbapedia — Magma Armor prevents freeze
    const target = makeActivePokemon({ ability: "magma-armor" });
    expect(canInflictGen4Status("freeze", target)).toBe(false);
  });

  it("given a target with no immunity ability, when checking poison, then returns true (status can be inflicted)", () => {
    // Verify that the base case still works — non-immune targets are still vulnerable
    const target = makeActivePokemon({ ability: "blaze" });
    expect(canInflictGen4Status("poison", target)).toBe(true);
  });

  it("given Immunity target, when checking burn, then returns true (Immunity only blocks poison)", () => {
    // Source: Bulbapedia — Immunity: only prevents poison, not other statuses
    const target = makeActivePokemon({ ability: "immunity" });
    expect(canInflictGen4Status("burn", target)).toBe(true);
  });

  it("given Limber target, when checking sleep, then returns true (Limber only blocks paralysis)", () => {
    // Source: Bulbapedia — Limber: only prevents paralysis
    const target = makeActivePokemon({ ability: "limber" });
    expect(canInflictGen4Status("sleep", target)).toBe(true);
  });

  // Verify type immunity still takes priority
  it("given Fire-type target with no special ability, when checking burn, then returns false (type immunity)", () => {
    // Source: Bulbapedia — Fire types are immune to burn (type-based)
    const target = makeActivePokemon({ ability: "blaze", types: ["fire"] });
    expect(canInflictGen4Status("burn", target)).toBe(false);
  });

  // Verify existing status still blocks
  it("given already-poisoned target with Limber, when checking paralysis, then returns false (already has status)", () => {
    // canInflictGen4Status checks existing status first, then type, then ability
    const target = makeActivePokemon({ ability: "limber", status: "poison" });
    expect(canInflictGen4Status("paralysis", target)).toBe(false);
  });
});

// ===========================================================================
// isVolatileBlockedByAbility — unit tests
// ===========================================================================

describe("isVolatileBlockedByAbility", () => {
  it("given Inner Focus target, when checking flinch, then returns true", () => {
    // Source: Bulbapedia — Inner Focus: prevents flinching
    const target = makeActivePokemon({ ability: "inner-focus" });
    expect(isVolatileBlockedByAbility(target, "flinch")).toBe(true);
  });

  it("given Inner Focus target, when checking confusion, then returns false", () => {
    // Source: Bulbapedia — Inner Focus: only blocks flinch
    const target = makeActivePokemon({ ability: "inner-focus" });
    expect(isVolatileBlockedByAbility(target, "confusion")).toBe(false);
  });

  it("given Own Tempo target, when checking confusion, then returns true", () => {
    // Source: Bulbapedia — Own Tempo: prevents confusion
    const target = makeActivePokemon({ ability: "own-tempo" });
    expect(isVolatileBlockedByAbility(target, "confusion")).toBe(true);
  });

  it("given Own Tempo target, when checking flinch, then returns false", () => {
    // Source: Bulbapedia — Own Tempo: only blocks confusion
    const target = makeActivePokemon({ ability: "own-tempo" });
    expect(isVolatileBlockedByAbility(target, "flinch")).toBe(false);
  });

  it("given Oblivious target, when checking infatuation, then returns true", () => {
    // Source: Bulbapedia — Oblivious: prevents infatuation
    const target = makeActivePokemon({ ability: "oblivious" });
    expect(isVolatileBlockedByAbility(target, "infatuation")).toBe(true);
  });

  it("given Oblivious target, when checking confusion, then returns false", () => {
    // Source: Bulbapedia — Oblivious: only blocks infatuation
    const target = makeActivePokemon({ ability: "oblivious" });
    expect(isVolatileBlockedByAbility(target, "confusion")).toBe(false);
  });

  it("given a Pokemon with no volatile-immunity ability, when checking any volatile, then returns false", () => {
    // Verify that normal abilities don't block volatiles
    const target = makeActivePokemon({ ability: "static" });
    expect(isVolatileBlockedByAbility(target, "flinch")).toBe(false);
    expect(isVolatileBlockedByAbility(target, "confusion")).toBe(false);
    expect(isVolatileBlockedByAbility(target, "infatuation")).toBe(false);
  });
});
